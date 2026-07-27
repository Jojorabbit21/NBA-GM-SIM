/**
 * DraftRoom — 드래프트 방 1개의 메모리 상태 + 타이머 + AI 체인 + 델타 브로드캐스트.
 *
 * - 방 상태(config/cursor/picks)를 메모리에 보유 → Realtime 불필요
 * - AI 픽: setTimeout 체인(2.5~3.5초 랜덤) → backdating 트릭 제거
 * - 픽 영속화: submit_draft_pick_v2 RPC (원자적 트랜잭션)
 * - 클라이언트엔 delta(cursor + 새 픽 1개)만 전송
 */
import type { ServerWebSocket } from 'bun';
import { supabase } from './supabaseAdmin';
import { getBestAvailableId } from './shared/multiDraftEngine';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper';
import {
    encode,
    type DraftConfig,
    type DraftCursor,
    type DraftPickEntry,
    type DraftPoolPlayer,
    type PickMsg,
    type CursorMsg,
    type SnapshotMsg,
} from './protocol';

const AI_MIN_DELAY_MS = 2500;
const AI_MAX_DELAY_MS = 3500;
const CHUNK_SIZE = 100;

// WS 소켓에 붙이는 메타데이터
export interface WsData {
    userId: string;
    roomId: string;
}

export class DraftRoom {
    readonly roomId: string;

    // ── 정적 설정 (draft_config) ──────────────────────────────────────────────
    private config!: DraftConfig;

    // ── 진행 상태 (draft_cursor) ──────────────────────────────────────────────
    private status: DraftCursor['status'] = 'active';
    private currentPickIndex = 0;
    private currentPickStartedAt = new Date().toISOString();
    private pausedAt: string | undefined;

    // 오토픽 모드인 userId 집합 — 메모리 전용(서버 재시작 시 리셋). load()에서 DB 값을
    // 일부러 복원하지 않는다 — RPC(submit_draft_pick_v2)가 매 픽마다 draft_cursor를
    // 통째로 덮어써서 이 필드가 DB에 안정적으로 남아있지 않으므로, "항상 깨끗하게 리셋"
    // 쪽으로 동작을 통일해 예측 가능하게 만든다(자리 비운 유저는 다음 타임아웃에서 다시 감지됨).
    private autoPickUserIds = new Set<string>();

    // autoPickUserIds 중 "본인 셀프토글 또는 어드민이 명시적으로 켠" 유저만 표시.
    // 타임아웃 연속 미스/드래프트 시작 시 미입장처럼 시스템이 자동으로 감지해 넣은 경우는
    // 여기 포함되지 않는다 — 재접속 시 자동 해제 대상(revertAutoPickOnReconnect)을 가르는 기준.
    private autoPickManualUserIds = new Set<string>();

    // 유저별 연속 픽 타임아웃 횟수 — autoPickUserIds와 마찬가지로 메모리 전용.
    // config.autoPickAfterMisses(어드민 세션 설정)에 도달하면 오토픽 모드로 전환하고,
    // 유저가 직접 픽을 제출하면(=돌아왔다는 증거) 0으로 리셋한다.
    private pickMissCounts = new Map<string, number>();

    // ── 픽 결과 ───────────────────────────────────────────────────────────────
    private picks: DraftPickEntry[] = [];
    private draftedIds = new Set<string>();

    // ── 풀 캐시 (방 생성 시 1회 로드) ────────────────────────────────────────
    private pool: { id: string; ovr: number; position: string }[] = [];     // AI 픽용 정렬본
    private poolPlayers: DraftPoolPlayer[] = [];           // 스냅샷용

    // ── 인프라 ────────────────────────────────────────────────────────────────
    readonly sockets = new Set<ServerWebSocket<WsData>>();
    private pickTimer: ReturnType<typeof setTimeout> | null = null;
    private aiTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor(roomId: string) {
        this.roomId = roomId;
    }

    // ── 팩토리: DB에서 방 상태 + 풀 로드 ────────────────────────────────────

    static async load(roomId: string): Promise<DraftRoom> {
        const room = new DraftRoom(roomId);

        // rooms: config + cursor
        const { data: roomRow, error: roomErr } = await supabase
            .from('rooms')
            .select('draft_config, draft_cursor')
            .eq('id', roomId)
            .single();

        if (roomErr || !roomRow?.draft_config) {
            throw new Error(`[DraftRoom] room load failed: ${roomErr?.message}`);
        }

        room.config = roomRow.draft_config as DraftConfig;
        const cursor = (roomRow.draft_cursor ?? {}) as Partial<DraftCursor>;
        room.status               = cursor.status ?? 'active';
        room.currentPickIndex     = cursor.currentPickIndex ?? 0;
        room.currentPickStartedAt = cursor.currentPickStartedAt ?? new Date().toISOString();
        room.pausedAt             = cursor.pausedAt;

        // draft_picks: 기존 픽 복원
        const { data: pickRows } = await supabase
            .from('draft_picks')
            .select('*')
            .eq('room_id', roomId)
            .order('pick_index');

        for (const row of pickRows ?? []) {
            const entry: DraftPickEntry = {
                pickIndex:   row.pick_index,
                round:       row.round,
                slot:        row.slot,
                userId:      row.user_id,
                teamId:      row.team_id,
                playerId:    String(row.player_id),
                playerName:  row.player_name,
                position:    row.position,
                ovr:         row.ovr,
                pickedAt:    row.picked_at,
            };
            room.picks.push(entry);
            room.draftedIds.add(entry.playerId);
        }

        // 풀 로드 (1회, 청크 병렬 조회)
        const poolIds: string[] = (room.config.poolIds ?? []).map(String);
        const chunks: string[][] = [];
        for (let i = 0; i < poolIds.length; i += CHUNK_SIZE) {
            chunks.push(poolIds.slice(i, i + CHUNK_SIZE));
        }
        const chunkResults = await Promise.all(
            chunks.map(ids =>
                supabase
                    .from('meta_players')
                    .select('id, name, position, salary, base_attributes')
                    .in('id', ids)
            )
        );
        room.poolPlayers = chunkResults.flatMap(r => r.data ?? []) as DraftPoolPlayer[];

        // custom_overrides 반영한 실제 OVR을 방 로드 시점에 딱 한 번만 계산해 base_attributes.ovr에
        // 덮어쓴다. 원래 base_attributes.ovr은 오버라이드 미반영 원본값이라, 올타임 풀에서 이 값을
        // 그대로 스냅샷/CPU 랭킹에 쓰면 부정확했다(버그) — 클라이언트가 렌더링마다 재계산하던 것도
        // 이 시점 1회 계산으로 옮겨서 클라이언트 쪽 계산 자체를 없앤다(성능 개선 겸).
        const applyCustomOverrides = room.config.applyCustomOverrides ?? false;
        for (const p of room.poolPlayers) {
            const mapped = mapRawPlayerToRuntimePlayer(p, applyCustomOverrides);
            (p.base_attributes as any).ovr = mapped.ovr;
            // 같은 OVR 엔진 호출에서 같이 나오는 주/부 아키타입도 붙여 보낸다(드래프트 풀 화면 표시용) —
            // 별도 계산 없이 이미 계산된 결과에서 필드 하나 더 꺼내는 것뿐이라 추가 비용 없음.
            (p.base_attributes as any).archetype = mapped.archetype;
            (p.base_attributes as any).secondaryArchetype = mapped.secondaryArchetype;
        }

        room.pool = room.poolPlayers
            .map(p => ({ id: p.id, ovr: (p.base_attributes as any)?.ovr ?? 0, position: p.position }))
            .sort((a, b) => b.ovr - a.ovr);

        return room;
    }

    // ── 스냅샷 (연결 시 1회) ─────────────────────────────────────────────────

    buildSnapshot(): SnapshotMsg {
        return {
            type:   'snapshot',
            config: this.config,
            cursor: this.getCursor(),
            picks:  [...this.picks],
            pool:   this.poolPlayers,
        };
    }

    // ── 픽 처리 ──────────────────────────────────────────────────────────────

    async handleSubmitPick(
        userId: string,
        playerId: string,
        ws: ServerWebSocket<WsData>
    ): Promise<void> {
        if (this.status !== 'active') {
            ws.send(encode({ type: 'error', code: 'draft_not_active' }));
            return;
        }
        const entry = this.config.pickOrder[this.currentPickIndex];
        if (!entry || entry.userId !== userId) {
            ws.send(encode({ type: 'error', code: 'not_your_turn' }));
            return;
        }
        if (this.draftedIds.has(playerId)) {
            ws.send(encode({ type: 'error', code: 'already_drafted' }));
            return;
        }

        // 본인이 직접 픽을 제출했다는 건 "돌아왔다"는 확실한 증거 — 연속 미스 카운트 리셋
        // + 오토픽 모드였다면 해제(그대로 두면 다음 차례부터 본인 의사와 무관하게 자동픽됨).
        // 이건 "명시적으로 켠" 오토픽까지 포함해 전부 해제한다 — 방금 수동으로 픽을 낸
        // 이상 어떤 이유로 오토픽에 있었든 더 이상 유효하지 않은 상태이기 때문.
        this.pickMissCounts.delete(userId);
        this.autoPickUserIds.delete(userId);
        this.autoPickManualUserIds.delete(userId);

        const result = await this.persistPick(userId, playerId);
        if (!result) {
            ws.send(encode({ type: 'error', code: 'internal' }));
            return;
        }

        ws.send(encode({ type: 'ack', playerId }));
        this.applyPickToMemory(result);
        this.broadcastDelta(result);
        this.scheduleNext();
    }

    // ── RPC 호출 (영속화) ─────────────────────────────────────────────────────

    private async persistPick(
        userId: string,
        playerId: string,
        isAi: boolean = false
    ): Promise<DraftPickEntry | null> {
        const { data: newCursor, error } = await supabase.rpc('submit_draft_pick_v2', {
            p_room_id:   this.roomId,
            p_player_id: playerId,
            p_user_id:   userId,
            p_is_ai:     isAi,
        });

        if (error) {
            console.error(`[DraftRoom:${this.roomId}] RPC error:`, error.message);
            return null;
        }

        // 방금 insert된 픽 행 조회
        const idx = this.currentPickIndex;
        const { data: row } = await supabase
            .from('draft_picks')
            .select('*')
            .eq('room_id', this.roomId)
            .eq('pick_index', idx)
            .single();

        if (!row) return null;

        // DB cursor와 메모리 동기화 검증
        const dbCursor = newCursor as Partial<DraftCursor> | null;
        if (dbCursor && dbCursor.currentPickIndex !== undefined &&
            dbCursor.currentPickIndex !== idx + 1) {
            console.warn(`[DraftRoom:${this.roomId}] cursor mismatch: mem=${idx + 1} db=${dbCursor.currentPickIndex}`);
        }

        return {
            pickIndex:   row.pick_index,
            round:       row.round,
            slot:        row.slot,
            userId:      row.user_id,
            teamId:      row.team_id,
            playerId:    String(row.player_id),
            playerName:  row.player_name,
            position:    row.position,
            ovr:         row.ovr,
            pickedAt:    row.picked_at,
        };
    }

    // ── 메모리 상태 갱신 ──────────────────────────────────────────────────────

    private applyPickToMemory(pick: DraftPickEntry): void {
        this.picks.push(pick);
        this.draftedIds.add(pick.playerId);
        this.currentPickIndex++;
        this.currentPickStartedAt = new Date().toISOString();

        const total = this.config.pickOrder.length;
        if (this.currentPickIndex >= total) {
            this.status = 'completed';
        }
    }

    // ── 타이머 스케줄 ─────────────────────────────────────────────────────────

    scheduleNext(): void {
        this.clearTimers();

        if (this.status === 'completed') {
            console.log(`[DraftRoom:${this.roomId}] draft completed → finalizing`);
            this.onCompleted();
            return;
        }
        if (this.status !== 'active') return;

        const entry = this.config.pickOrder[this.currentPickIndex];
        if (!entry) {
            console.warn(`[DraftRoom:${this.roomId}] scheduleNext: no entry at index=${this.currentPickIndex} (total=${this.config.pickOrder.length})`);
            return;
        }

        if (entry.isAi || this.autoPickUserIds.has(entry.userId)) {
            // AI 슬롯과 오토픽 모드 유저 모두 동일한 짧은 지연 후 BPA 자동 진행 경로를 탄다.
            const delay = AI_MIN_DELAY_MS + Math.random() * (AI_MAX_DELAY_MS - AI_MIN_DELAY_MS);
            console.log(`[DraftRoom:${this.roomId}] auto pick #${this.currentPickIndex} scheduled in ${Math.round(delay)}ms`);
            this.aiTimer = setTimeout(() => this.onAiPick(), delay);
        } else {
            console.log(`[DraftRoom:${this.roomId}] human pick #${this.currentPickIndex} userId=${entry.userId} timeout=${this.config.pickDurationSec}s`);
            this.pickTimer = setTimeout(
                () => this.onPickTimeout(),
                this.config.pickDurationSec * 1000
            );
        }
    }

    /** 해당 팀이 이미 드래프트한 선수들의 포지션 목록 (오토픽 포지션 정합성 판단용) */
    private teamPositions(teamId: string): string[] {
        return this.picks.filter(p => p.teamId === teamId).map(p => p.position);
    }

    private async onAiPick(): Promise<void> {
        if (this.status !== 'active') return;
        const entry = this.config.pickOrder[this.currentPickIndex];
        if (!entry || (!entry.isAi && !this.autoPickUserIds.has(entry.userId))) return;

        const bestId = getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId));
        if (!bestId) {
            console.warn(`[DraftRoom:${this.roomId}] no available players for auto pick`);
            return;
        }

        console.log(`[DraftRoom:${this.roomId}] auto pick #${this.currentPickIndex} → player=${bestId}`);
        // entry.isAi 그대로 전달 — 오토픽 모드로 대납되는 실제 사람 유저는 is_ai=false로
        // 정확히 기록되어야 draft_picks 감사 기록/향후 기능에서 AI 슬롯과 혼동되지 않는다.
        const result = await this.persistPick(entry.userId, bestId, entry.isAi ?? false);
        if (!result) return;

        this.applyPickToMemory(result);
        this.broadcastDelta(result);
        this.scheduleNext();
    }

    private async onPickTimeout(): Promise<void> {
        if (this.status !== 'active') return;
        const entry = this.config.pickOrder[this.currentPickIndex];
        if (!entry || entry.isAi) return;

        console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);

        // 연속 타임아웃 횟수 추적 — 세션 설정(autoPickAfterMisses)에 도달하면 오토픽 모드로 전환
        const misses = (this.pickMissCounts.get(entry.userId) ?? 0) + 1;
        this.pickMissCounts.set(entry.userId, misses);
        if (misses >= this.config.autoPickAfterMisses) {
            this.autoPickUserIds.add(entry.userId);
            console.log(`[DraftRoom:${this.roomId}] user ${entry.userId} hit ${misses} consecutive timeout(s) → auto-pick mode`);
        }

        const bestId = getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId));
        if (!bestId) return;

        const result = await this.persistPick(entry.userId, bestId);
        if (!result) return;

        this.applyPickToMemory(result);
        this.broadcastDelta(result);
        this.scheduleNext();
    }

    // ── 완료 처리 ─────────────────────────────────────────────────────────────

    private onCompleted(): void {
        // cursor 브로드캐스트
        this.broadcastCursor();
        // finalize는 finalize.ts에서 RoomManager를 통해 호출됨
        import('./finalize').then(({ finalizeDraft }) => {
            finalizeDraft(this.roomId).catch(e =>
                console.error(`[DraftRoom:${this.roomId}] finalize error:`, e)
            );
        });
    }

    // ── pause / resume ────────────────────────────────────────────────────────

    async pause(adminUserId: string): Promise<boolean> {
        if (this.status !== 'active') return false;
        this.clearTimers();
        this.status   = 'paused';
        this.pausedAt = new Date().toISOString();

        await supabase.from('rooms').update({
            draft_cursor: this.getCursor(),
        }).eq('id', this.roomId);

        this.broadcastCursor();
        console.log(`[DraftRoom:${this.roomId}] paused by ${adminUserId}`);
        return true;
    }

    async resume(adminUserId: string): Promise<boolean> {
        if (this.status !== 'paused' || !this.pausedAt) return false;

        // 남은 시간 보존: startedAt을 (일시정지 경과분만큼 미룸)
        const pausedMs = Date.now() - new Date(this.pausedAt).getTime();
        const newStartedAt = new Date(new Date(this.currentPickStartedAt).getTime() + pausedMs);
        this.currentPickStartedAt = newStartedAt.toISOString();
        this.status   = 'active';
        this.pausedAt = undefined;

        await supabase.from('rooms').update({
            draft_cursor: this.getCursor(),
        }).eq('id', this.roomId);

        this.broadcastCursor();
        this.scheduleNext();
        console.log(`[DraftRoom:${this.roomId}] resumed by ${adminUserId}`);
        return true;
    }

    // ── 사전입장 활성화 (waiting → active) ─────────────────────────────────────
    // 로터리 완료 직후 draft_config가 미리 만들어져(waiting) 접속해 있던 클라이언트가
    // 있을 때, 예정 시각에 스케줄러가 이 메서드를 호출해 픽을 실제로 시작시킨다.
    // pause/resume과 동일한 패턴: 상태 전환 → DB 반영 → broadcastCursor()로 접속자
    // 전원에게 실시간 통지(재접속 없이 화면 전환) → scheduleNext()로 첫 픽 타이머 시작.

    async activate(): Promise<boolean> {
        if (this.status !== 'waiting') return false;

        // 드래프트 시작 순간 룸에 연결돼 있지 않은(=WS 소켓 없는) 유저는 즉시 오토픽 모드로 전환.
        // pickOrder는 라운드마다 유저가 반복되므로 유저당 한 번만 판정한다.
        const connected = this.getConnectedUserIds();
        const seen = new Set<string>();
        for (const entry of this.config.pickOrder) {
            if (entry.isAi || seen.has(entry.userId)) continue;
            seen.add(entry.userId);
            if (!connected.has(entry.userId)) {
                this.autoPickUserIds.add(entry.userId);
                console.log(`[DraftRoom:${this.roomId}] user ${entry.userId} not connected at draft start → auto-pick mode`);
            }
        }

        this.status               = 'active';
        this.currentPickIndex     = 0;
        this.currentPickStartedAt = new Date().toISOString();

        await supabase.from('rooms').update({
            draft_cursor: this.getCursor(),
        }).eq('id', this.roomId);

        this.broadcastCursor();
        this.scheduleNext();
        console.log(`[DraftRoom:${this.roomId}] activated (waiting → active)`);
        return true;
    }

    // ── 어드민 액션 ──────────────────────────────────────────────────────────

    async handleAdmin(
        action: string,
        params: { targetPickIndex?: number; targetUserId?: string; enabled?: boolean } | undefined,
        ws: ServerWebSocket<WsData>
    ): Promise<void> {
        switch (action) {
            case 'pause':
                await this.pause(ws.data.userId);
                break;

            case 'resume':
                await this.resume(ws.data.userId);
                break;

            case 'reset-timer':
                this.clearTimers();
                this.currentPickStartedAt = new Date().toISOString();
                await supabase.from('rooms').update({ draft_cursor: this.getCursor() }).eq('id', this.roomId);
                this.broadcastCursor();
                this.scheduleNext();
                break;

            case 'skip-turn': {
                // 현재 차례 건너뛰기 — 베스트 선수 자동픽
                if (this.status !== 'active') break;
                const entry = this.config.pickOrder[this.currentPickIndex];
                if (!entry) break;
                const bestId = getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId));
                if (!bestId) break;
                this.clearTimers();
                const result = await this.persistPick(entry.userId, bestId);
                if (!result) break;
                this.applyPickToMemory(result);
                this.broadcastDelta(result);
                this.scheduleNext();
                break;
            }

            case 'autocomplete': {
                // 남은 모든 픽을 자동으로 완료 (테스트/어드민용)
                this.clearTimers();
                while (this.status === 'active' && this.currentPickIndex < this.config.pickOrder.length) {
                    const entry = this.config.pickOrder[this.currentPickIndex];
                    if (!entry) break;
                    const bestId = getBestAvailableId(this.pool, [...this.draftedIds], this.teamPositions(entry.teamId));
                    if (!bestId) break;
                    const result = await this.persistPick(entry.userId, bestId);
                    if (!result) break;
                    this.applyPickToMemory(result);
                    this.broadcastDelta(result);
                    await new Promise(r => setTimeout(r, 50)); // 너무 빠르게 쏘지 않도록
                }
                this.scheduleNext();
                break;
            }

            case 'toggle-autopick': {
                const targetUserId = params?.targetUserId;
                const enabled = params?.enabled;
                if (!targetUserId || typeof enabled !== 'boolean') {
                    ws.send(encode({ type: 'error', code: 'internal', message: 'targetUserId, enabled required' }));
                    break;
                }
                const ok = await this.setAutoPick(targetUserId, enabled);
                if (!ok) {
                    ws.send(encode({ type: 'error', code: 'internal', message: 'user not in pickOrder' }));
                }
                break;
            }

            case 'rollback': {
                // 지정 픽 인덱스까지 롤백 (picks 삭제 + cursor 복원)
                const target = params?.targetPickIndex ?? this.currentPickIndex - 1;
                if (target < 0 || target >= this.currentPickIndex) break;
                this.clearTimers();

                // DB에서 해당 픽 이후 삭제
                await supabase.from('draft_picks')
                    .delete()
                    .eq('room_id', this.roomId)
                    .gte('pick_index', target);

                // 메모리 롤백
                this.picks = this.picks.filter(p => p.pickIndex < target);
                this.draftedIds = new Set(this.picks.map(p => p.playerId));
                this.currentPickIndex = target;
                this.currentPickStartedAt = new Date().toISOString();
                this.status = 'active';
                this.pausedAt = undefined;

                await supabase.from('rooms').update({ draft_cursor: this.getCursor() }).eq('id', this.roomId);

                // 상태가 많이 바뀌었으므로 snapshot 재전송
                const snap = this.buildSnapshot();
                this.broadcast(encode(snap));
                this.scheduleNext();
                break;
            }

            default:
                ws.send(encode({ type: 'error', code: 'internal', message: `unknown action: ${action}` }));
        }
    }

    // ── 소켓 관리 ────────────────────────────────────────────────────────────

    addSocket(ws: ServerWebSocket<WsData>): void {
        this.sockets.add(ws);
    }

    removeSocket(ws: ServerWebSocket<WsData>): void {
        this.sockets.delete(ws);
        // 방은 소켓이 없어도 유지 (타이머/AI 체인 계속 동작)
    }

    /** 현재 이 방에 WS로 연결돼 있는 userId 집합 (activate()의 미입장 판정용) */
    private getConnectedUserIds(): Set<string> {
        return new Set([...this.sockets].map(ws => ws.data.userId));
    }

    // ── 브로드캐스트 헬퍼 ────────────────────────────────────────────────────

    private broadcastDelta(pick: DraftPickEntry): void {
        const msg: PickMsg = { type: 'pick', pick, cursor: this.getCursor() };
        this.broadcast(encode(msg));
    }

    private broadcastCursor(): void {
        const msg: CursorMsg = { type: 'cursor', cursor: this.getCursor() };
        this.broadcast(encode(msg));
    }

    private broadcast(payload: string): void {
        for (const ws of this.sockets) {
            try {
                ws.send(payload);
            } catch {
                // send 실패 = 이미 죽은 소켓. close 이벤트가 안 왔을 수도 있으므로 여기서도
                // 정리해줘야 getConnectedUserIds()가 죽은 연결을 "접속 중"으로 오판하지 않는다.
                this.sockets.delete(ws);
            }
        }
    }

    // ── 유틸 ──────────────────────────────────────────────────────────────────

    getCursor(): DraftCursor {
        return {
            status:               this.status,
            currentPickIndex:     this.currentPickIndex,
            currentPickStartedAt: this.currentPickStartedAt,
            ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
            autoPickUserIds:      [...this.autoPickUserIds],
        };
    }

    // ── 오토픽 모드 on/off (본인 셀프토글 또는 어드민 강제토글 공용) ────────────
    // targetUserId가 pickOrder에 없거나 AI 슬롯이면 false 반환(대상 아님).
    async setAutoPick(targetUserId: string, enabled: boolean): Promise<boolean> {
        const inOrder = this.config.pickOrder.some(e => e.userId === targetUserId && !e.isAi);
        if (!inOrder) return false;

        if (enabled) {
            this.autoPickUserIds.add(targetUserId);
            this.autoPickManualUserIds.add(targetUserId);
        } else {
            this.autoPickUserIds.delete(targetUserId);
            this.autoPickManualUserIds.delete(targetUserId);
        }

        const entry = this.config.pickOrder[this.currentPickIndex];
        if (this.status === 'active' && entry?.userId === targetUserId) {
            // 바로 지금 이 유저 차례라면 새 모드에 맞는 타이머로 즉시 전환
            this.clearTimers();
            this.currentPickStartedAt = new Date().toISOString();
        }

        await supabase.from('rooms').update({ draft_cursor: this.getCursor() }).eq('id', this.roomId);
        this.broadcastCursor();

        if (this.status === 'active' && entry?.userId === targetUserId) {
            this.scheduleNext();
        }
        return true;
    }

    // ── 재접속 시 자동 해제 (WS auth 성공 직후 호출) ────────────────────────────
    // 타임아웃 연속 미스/드래프트 시작 시 미입장처럼 "시스템이 자동으로" 오토픽 전환한
    // 경우만 해제한다. 본인 또는 어드민이 명시적으로 켠 경우(autoPickManualUserIds)는
    // 재접속과 무관하게 유지 — 그렇지 않으면 "이번 드래프트는 자리 비울 거라 계속 오토픽
    // 해줘"라고 직접 설정해둔 것이 잠깐 다른 탭에서 재접속하는 순간 의도치 않게 풀려버린다.
    async revertAutoPickOnReconnect(userId: string): Promise<void> {
        if (this.autoPickUserIds.has(userId) && !this.autoPickManualUserIds.has(userId)) {
            console.log(`[DraftRoom:${this.roomId}] user ${userId} reconnected → auto-pick mode (system-triggered) reverted`);
            await this.setAutoPick(userId, false);
        }
    }

    isCompleted(): boolean {
        return this.status === 'completed';
    }

    clearTimers(): void {
        if (this.pickTimer) { clearTimeout(this.pickTimer); this.pickTimer = null; }
        if (this.aiTimer)   { clearTimeout(this.aiTimer);   this.aiTimer   = null; }
    }

    /** 풀 크기 (로깅용) */
    get poolSize(): number { return this.pool.length; }

    /** 타이머 동작 여부 (WS auth에서 복구 판단용) */
    get hasTimer(): boolean { return this.pickTimer !== null || this.aiTimer !== null; }

    /** 어드민 여부 확인 (leagues.admin_user_id) */
    async isAdmin(userId: string): Promise<boolean> {
        const { data } = await supabase
            .from('rooms')
            .select('league_id')
            .eq('id', this.roomId)
            .single();
        if (!data?.league_id) return false;

        const { data: league } = await supabase
            .from('leagues')
            .select('admin_user_id')
            .eq('id', data.league_id)
            .single();
        return league?.admin_user_id === userId;
    }
}
