/**
 * simWorkerPool.ts — 경기 시뮬레이션 워커 스레드 풀 매니저 (메인 스레드에서 실행).
 *
 * runSimulation()을 직접 호출하는 대신 이 풀을 거치면, 무거운 시뮬레이션 계산이 메인 스레드
 * 이벤트 루프를 막지 않는다. 설계 배경/안전장치 근거는 docs/plan/worker-thread-sim-plan.md 참조.
 */
import { supabase } from '../supabaseAdmin';
import type { SimResult } from '../simRunner';
import type { WorkerRequest, WorkerResponse } from './protocol';

const WORKER_URL = new URL('./simWorker.ts', import.meta.url);
const TASK_TIMEOUT_MS = 60_000;
const PING_TIMEOUT_MS = 5_000;
const RESPAWN_RETRY_DELAY_MS = 2_000;
const STALE_CLAIM_MS = 10 * 60 * 1000; // 10분

interface Slot {
    worker: Worker;
    ready: boolean;
    busy: boolean;
}

interface QueuedTask {
    id: string;
    roomId: string;
    gameId: string;
    forceStartNow?: boolean;
    resolve: (r: SimResult) => void;
    reject: (e: Error) => void;
}

interface InFlightTask extends QueuedTask {
    slotIndex: number;
    timeoutHandle: ReturnType<typeof setTimeout>;
}

class SimWorkerPool {
    private slots: Slot[] = [];
    private queue: QueuedTask[] = [];
    private inFlight = new Map<string, InFlightTask>();
    private readonly poolSize: number;
    private initialized = false;

    constructor() {
        const envCount = parseInt(Bun.env.SIM_WORKER_COUNT ?? '', 10);
        const cpuCount = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1;
        this.poolSize = Number.isFinite(envCount) && envCount > 0
            ? envCount
            : Math.max(1, (cpuCount || 1) - 1);
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        console.log(`[simPool] spawning ${this.poolSize} worker(s)`);
        await Promise.all(
            Array.from({ length: this.poolSize }, (_, i) => this.spawnSlot(i)),
        );
    }

    shutdown(): void {
        for (const slot of this.slots) {
            try { slot?.worker.terminate(); } catch { /* 이미 죽었으면 무시 */ }
        }
    }

    /** 기존 runSimulation(roomId, gameId, forceStartNow)과 동일한 시그니처 — 호출부 diff 최소화. */
    runSimulationInWorker(roomId: string, gameId: string, forceStartNow = false): Promise<SimResult> {
        return new Promise((resolve, reject) => {
            this.queue.push({ id: crypto.randomUUID(), roomId, gameId, forceStartNow, resolve, reject });
            this.dispatch();
        });
    }

    /** game_sim_claims 중 STALE_CLAIM_MS 이상 지난 것을 전부 삭제.
     *  워커 크래시 시 안전망(handleCrash)이 못 잡는 극단적 상황(컨테이너 자체 종료 등) 대비 이중 안전망.
     *  [2026-08-06] 예전엔 claim마다 game_pbp 존재 여부를 개별 조회해 "성공했는데 못 지워진 것"만
     *  골라 지웠는데, 이제 runSimulation() 성공 경로에서도 자기 클레임을 직접 지우므로(아래 참고),
     *  10분 넘게 남은 클레임은 성공/실패 여부와 무관하게 이미 자기 역할(동시 처리 방지)을
     *  다한 것 — 그냥 나이만 보고 통째로 지운다. 클레임당 왕복 쿼리도 없앴고,
     *  DELETE ... WHERE는 클라이언트 select 기본 행 제한과 무관하게 매칭되는 행 전체에 적용된다. */
    async sweepStaleClaims(): Promise<void> {
        const cutoffIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        const { count, error } = await supabase
            .from('game_sim_claims')
            .delete({ count: 'exact' })
            .lt('claimed_at', cutoffIso);
        if (error) {
            console.error('[simPool] stale claim sweep failed:', error.message);
            return;
        }
        if (count) {
            console.log(`[simPool] stale claim sweep: removed ${count} claim(s) older than ${STALE_CLAIM_MS / 60_000}min`);
        }
    }

    // ── 내부 ──────────────────────────────────────────────────────────────────

    private async spawnSlot(index: number): Promise<void> {
        const worker = new Worker(WORKER_URL, { type: 'module' });
        const slot: Slot = { worker, ready: false, busy: false };
        this.slots[index] = slot;

        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
            this.handleMessage(index, event.data);
        });
        worker.addEventListener('error', (event: ErrorEvent) => {
            console.error(`[simPool] worker#${index} crashed:`, event?.message ?? event);
            this.handleCrash(index);
        });

        // 스폰 직후 ping/pong 헬스체크 통과해야 가용 목록에 편입 — Bun이 워커 안에서 .ts
        // 엔트리를 제대로 로드하는지를 배포 시 1회가 아니라 매 스폰(부팅+재스폰)마다 자동 검증한다.
        const healthy = await this.pingSlot(index);
        if (healthy) {
            slot.ready = true;
            console.log(`[simPool] worker#${index} ready`);
            this.dispatch();
        } else {
            console.error(`[simPool] worker#${index} failed health check — retrying`);
            try { worker.terminate(); } catch { /* ignore */ }
            setTimeout(() => this.spawnSlot(index), RESPAWN_RETRY_DELAY_MS);
        }
    }

    private pingSlot(index: number): Promise<boolean> {
        return new Promise(resolve => {
            const slot = this.slots[index];
            const timer = setTimeout(() => { cleanup(); resolve(false); }, PING_TIMEOUT_MS);
            const onMessage = (event: MessageEvent<WorkerResponse>) => {
                if (event.data?.type === 'pong') { cleanup(); resolve(true); }
            };
            const cleanup = () => {
                clearTimeout(timer);
                slot.worker.removeEventListener('message', onMessage as EventListener);
            };
            slot.worker.addEventListener('message', onMessage as EventListener);
            slot.worker.postMessage({ type: 'ping' } satisfies WorkerRequest);
        });
    }

    private handleMessage(slotIndex: number, msg: WorkerResponse): void {
        if (!msg || msg.type === 'pong') return; // pong은 pingSlot 쪽 1회성 리스너가 별도 처리
        const task = this.inFlight.get(msg.id);
        if (!task) return; // 이미 타임아웃 처리됐거나 알 수 없는 응답 — 무시

        clearTimeout(task.timeoutHandle);
        this.inFlight.delete(msg.id);
        const slot = this.slots[slotIndex];
        if (slot) slot.busy = false;

        if ('error' in msg) task.reject(new Error(msg.error));
        else task.resolve(msg.result);

        this.dispatch();
    }

    private async handleCrash(slotIndex: number): Promise<void> {
        const slot = this.slots[slotIndex];
        if (!slot) return;
        slot.ready = false;
        slot.busy = false;

        // 이 슬롯이 처리 중이던 태스크 — game_sim_claims 안전망 정리 후 reject.
        // (워커가 죽으면 simRunner.ts 자신의 catch 블록이 실행되지 못해 클레임이 영구히
        // "처리 중"으로 남는다 — 이걸 못 잡으면 그 경기는 조용히 영원히 재시도되지 않는다.)
        for (const [id, task] of this.inFlight) {
            if (task.slotIndex !== slotIndex) continue;
            clearTimeout(task.timeoutHandle);
            this.inFlight.delete(id);
            await this.deleteClaim(task.roomId, task.gameId);
            task.reject(new Error('worker crashed'));
        }

        try { slot.worker.terminate(); } catch { /* 이미 죽었으면 무시 */ }
        this.spawnSlot(slotIndex);
    }

    private async deleteClaim(roomId: string, gameId: string): Promise<void> {
        const { error } = await supabase
            .from('game_sim_claims')
            .delete()
            .eq('room_id', roomId)
            .eq('game_id', gameId);
        if (error) console.error('[simPool] claim cleanup failed:', error.message);
    }

    private dispatch(): void {
        while (this.queue.length > 0) {
            const idleIndex = this.slots.findIndex(s => s?.ready && !s.busy);
            if (idleIndex === -1) return;

            const task = this.queue.shift()!;
            const slot = this.slots[idleIndex];
            slot.busy = true;

            const timeoutHandle = setTimeout(() => {
                console.error(
                    `[simPool] task ${task.id} (room=${task.roomId} game=${task.gameId}) timed out — restarting worker#${idleIndex}`,
                );
                this.handleCrash(idleIndex);
            }, TASK_TIMEOUT_MS);

            this.inFlight.set(task.id, { ...task, slotIndex: idleIndex, timeoutHandle });
            slot.worker.postMessage({
                type: 'run',
                id: task.id,
                roomId: task.roomId,
                gameId: task.gameId,
                forceStartNow: task.forceStartNow,
            } satisfies WorkerRequest);
        }
    }
}

export const simWorkerPool = new SimWorkerPool();
