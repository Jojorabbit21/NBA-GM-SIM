import type { Player } from '../../types';
import { isFinal } from '../../views/multi/season/multiGameReveal';

/** room_player_state 한 행 — hooks/useLeagueRawStats.ts의 playerInjuryRows와 동일 shape. */
export interface PlayerInjuryStateRow {
    player_id: string;
    injury_history: Record<string, any>[];
    health: string | null;
    return_date: string | null;
    season_number: number | null;
    /** room_player_state.contract — 리그별 계약 오버라이드(일부 조회에선 select 안 함). */
    contract?: Record<string, any> | null;
}

/** 배지/호버카드가 필요로 하는 "지금 활성 부상/출장정지" 요약 — Player.activeInjurySeverity/
 *  injuryType/activeInjuryDuration에 그대로 얹는다. */
export interface ActiveInjuryStatus {
    severity: NonNullable<Player['activeInjurySeverity']>;
    injuryType: string;
    /** injury_history의 duration 원본 문자열 — 부상은 '3일'/'2주'/'시즌아웃', 출장정지는 'N경기'. */
    duration: string;
    /** injury_history의 returnDate(YYYY-MM-DD) — 시즌아웃은 null. formatReturnDateSuffix로 표시. 진단 전엔 null(기간 비공개). */
    returnDate: string | null;
    /** [2026-11-05] 진단 전 부상 — severity 'Pending', injuryType "무릎 부상", duration "보류 중"으로 가려짐. */
    pending?: boolean;
}

/** [2026-11-05] 진단 전 부상 판정 — simRunner가 injury_history entry에 diagnosisDate·bodyPart를 붙인다(타임라인 있는 방만).
 *  진단일 당일부터 공개. 옛 entry(diagnosisDate 없음)는 항상 공개. */
export function isInjuryDiagnosisPending(entry: Record<string, any> | null | undefined, currentSimDate: string): boolean {
    return !!entry?.diagnosisDate && !!entry.bodyPart && currentSimDate < entry.diagnosisDate;
}

/** 진단 전 표시용 부상명/기간 — 프로필 부상 이력 등 이력 entry를 직접 그리는 곳도 같은 문구를 쓰도록. */
export const PENDING_INJURY_DURATION = '보류 중';
export function pendingInjuryLabel(bodyPart: string): string {
    return `${bodyPart} 부상`;
}

type InjuryScheduleGame = { homeTeamId: string; awayTeamId: string; date: string; played: boolean; scheduledAt?: string; otPeriods?: number | null };

/** "N경기" 재계산에 필요한 팀별 스케줄 조회 — 스케줄 원본을 매번 넘기지 않도록 얇게 추상화. */
export interface SuspensionScheduleContext {
    /** roomId 전체 스케줄(모든 팀) — home/away/date/played(+공개 판정용 scheduledAt/otPeriods). */
    schedule: InjuryScheduleGame[];
    /** playerId → 소속 team_slug. 못 찾으면(방출 등) 재계산을 건너뛰고 원본 duration 유지. */
    getTeamId: (playerId: string) => string | undefined;
    /** [2026-11-07] 서버 보정 현재 시각 — 주어지면 시뮬됐지만 공개 전(played && !isFinal)인 경기를 "아직 안 치른 경기"로 본다:
     *  그 경기에서 생긴 부상·출장정지는 숨기고(스포일러 방지 — 서버는 시뮬 즉시 room_player_state를 쓰고 이 테이블엔 공개 지연
     *  RLS가 없다), 출장정지 남은 경기 수에도 포함한다. 생략하면 예전처럼 played 기준. */
    nowMs?: number;
}

/** [2026-11-07] 시뮬됐지만 아직 공개 전인 경기의 `팀|가상날짜` 키 — injury_history entry(date=game_date)와 맞춰 본다.
 *  scheduledAt이 없는 구 리그 경기는 isFinal이 played로 폴백하므로 숨김 대상이 아니다. */
export function buildUnrevealedGameKeys(schedule: InjuryScheduleGame[] | undefined, nowMs: number | undefined): Set<string> {
    const keys = new Set<string>();
    if (nowMs == null) return keys;
    for (const g of schedule ?? []) {
        if (!g.played || isFinal(g, nowMs)) continue;
        const d = g.date.slice(0, 10);
        keys.add(`${g.homeTeamId}|${d}`);
        keys.add(`${g.awayTeamId}|${d}`);
    }
    return keys;
}

/** 이 이력 entry가 공개 전 경기에서 생긴 것인가 — 경기 밖 부상(offCourt)·연습경기(isTraining)는 경기와 무관해 제외.
 *  teamIds = 선수의 현 소속 + entry.teamId(공개 창 사이 이적 대비). */
export function isInjuryEntryFromUnrevealedGame(
    entry: Record<string, any> | null | undefined,
    teamIds: (string | undefined)[],
    unrevealedKeys: Set<string>,
): boolean {
    if (!entry?.date || entry.offCourt || entry.isTraining || unrevealedKeys.size === 0) return false;
    const d = String(entry.date).slice(0, 10);
    return [...teamIds, entry.teamId].some(t => !!t && unrevealedKeys.has(`${t}|${d}`));
}

/** 출장정지 발부 시점에 고정된 duration("7경기") 대신, 그 팀이 return_date까지(포함) 아직
 *  치르지 않은 경기 수를 세어 "지금 기준 남은 경기 수"를 돌려준다. 부상(일수 기반)은 이미
 *  returnDate 자체가 "언제까지"를 정확히 말해주므로 재계산 대상이 아니다 — 출장정지만
 *  적용한다. [2026-11-07] nowMs가 있으면 공개 전 경기도 "아직 안 치른 경기"로 센다. */
function computeSuspensionGamesRemaining(
    teamId: string,
    returnDate: string,
    schedule: SuspensionScheduleContext['schedule'],
    nowMs: number | undefined,
): number {
    return schedule.filter(g =>
        (g.homeTeamId === teamId || g.awayTeamId === teamId) &&
        !(g.played && (nowMs == null || isFinal(g, nowMs))) &&
        g.date <= returnDate,
    ).length;
}

/**
 * room_player_state 조회 결과 → playerId별 "지금 활성 부상/출장정지인지" 요약 맵.
 * server/src/simRunner.ts §2.5 오버레이(다음 경기 시뮬레이션 시 부상 상태를 얹는 로직)와
 * 동일한 기준으로 판정한다 — 클라이언트 여러 화면(로스터/전술/트레이드)이 각자 이 판정을
 * 다시 구현하면 기준이 어긋날 수 있어 한 곳으로 모았다.
 *
 * severity/injuryType/duration은 room_player_state에 별도 컬럼이 없어 injury_history 마지막
 * 엔트리에서 가져온다 — 같은 upsert(simRunner.ts)에서 이력과 현재상태(health/injury_type/
 * return_date)가 항상 함께 기록되므로 마지막 엔트리가 곧 현재 상태와 일치한다는 불변식에 기댄다.
 *
 * @param suspensionContext 주어지면 출장정지의 duration을 "지금 기준 남은 경기 수"로 다시
 *   계산한다(생략 시 발부 당시 고정 문자열 그대로) — computeSuspensionGamesRemaining 참고.
 */
export function buildActiveInjurySeverityMap(
    rows: PlayerInjuryStateRow[] | undefined,
    currentSimDate: string,
    currentSeasonNumber: number | null | undefined,
    suspensionContext?: SuspensionScheduleContext,
): Map<string, ActiveInjuryStatus> {
    const map = new Map<string, ActiveInjuryStatus>();
    const unrevealedKeys = buildUnrevealedGameKeys(suspensionContext?.schedule, suspensionContext?.nowMs);
    for (const row of rows ?? []) {
        const isActive = row.health === 'Injured' && (
            (row.return_date != null && row.return_date > currentSimDate) ||
            (row.return_date == null && row.season_number === currentSeasonNumber)
        );
        if (!isActive) continue;
        const history = row.injury_history ?? [];
        const last = history[history.length - 1];
        if (!last?.severity) continue;
        // [2026-11-07] 공개 전 경기에서 생긴 부상·출장정지는 그 경기 공개 전까지 숨김. 경기에 뛴 선수는 직전까지 건강했으므로
        // (부상 중이면 출전하지 않음) 이 entry를 숨기면 곧 "활성 부상 없음"이다.
        if (isInjuryEntryFromUnrevealedGame(last, [suspensionContext?.getTeamId(row.player_id)], unrevealedKeys)) continue;

        if (last.severity !== 'Suspension' && isInjuryDiagnosisPending(last, currentSimDate)) {
            map.set(row.player_id, {
                severity: 'Pending',
                injuryType: pendingInjuryLabel(last.bodyPart),
                duration: PENDING_INJURY_DURATION,
                returnDate: null,
                pending: true,
            });
            continue;
        }

        let duration: string = last.duration ?? '';
        if (last.severity === 'Suspension' && last.returnDate && suspensionContext) {
            const teamId = suspensionContext.getTeamId(row.player_id);
            if (teamId) {
                const remaining = computeSuspensionGamesRemaining(teamId, last.returnDate, suspensionContext.schedule, suspensionContext.nowMs);
                duration = `${remaining}경기`;
            }
        }

        map.set(row.player_id, {
            severity: last.severity,
            injuryType: last.injuryType ?? '',
            duration,
            returnDate: last.returnDate ?? null,
        });
    }
    return map;
}

/** 배지 hover 툴팁 / 프로필 카드용 한 줄 요약 — "부상 · 발목 염좌 · 3일" 또는 "출장정지 · 7경기".
 *  출장정지는 injuryType("출장정지 (싸움)")이 앞의 라벨과 겹치므로 생략한다. */
export function formatActiveInjuryLabel(injuryStatus: ActiveInjuryStatus): string {
    if (injuryStatus.severity === 'Suspension') {
        return `출장정지 · ${injuryStatus.duration || '기간 미정'}`;
    }
    if (injuryStatus.severity === 'Personal') {
        return `개인 사유 · ${injuryStatus.injuryType || '개인 사유'} · ${injuryStatus.duration || '기간 미정'}`;
    }
    if (injuryStatus.severity === 'Pending') {
        return `부상 · ${injuryStatus.injuryType || '부상'} · 부상 기간 ${PENDING_INJURY_DURATION}`;
    }
    return `부상 · ${injuryStatus.injuryType || '부상'} · ${injuryStatus.duration || '기간 미정'}`;
}

/** formatActiveInjuryLabel의 Player 필드(activeInjurySeverity/injuryType/activeInjuryDuration)
 *  버전 — 배지 title 툴팁 호출부에서 매번 객체를 조립하지 않도록. 활성 부상이 없으면 null. */
export function formatPlayerActiveInjuryLabel(player: Player): string | null {
    if (!player.activeInjurySeverity) return null;
    return formatActiveInjuryLabel({
        severity: player.activeInjurySeverity,
        injuryType: player.injuryType ?? '',
        duration: player.activeInjuryDuration ?? '',
        returnDate: null,
    });
}

/** returnDate(YYYY-MM-DD) → " (~ YY/MM/DD)" 접미사. null(시즌아웃 등)이면 빈 문자열 —
 *  프로필 부상 이력/호버카드가 동일 포맷을 쓰도록 한 곳에 모음. */
export function formatReturnDateSuffix(returnDate: string | null | undefined): string {
    if (!returnDate) return '';
    const [y, m, d] = returnDate.split('-');
    return ` (~ ${y.slice(2)}/${m}/${d})`;
}
