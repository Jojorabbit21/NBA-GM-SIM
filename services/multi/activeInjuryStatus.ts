import type { Player } from '../../types';

/** room_player_state 한 행 — hooks/useLeagueRawStats.ts의 playerInjuryRows와 동일 shape. */
export interface PlayerInjuryStateRow {
    player_id: string;
    injury_history: Record<string, any>[];
    health: string | null;
    return_date: string | null;
    season_number: number | null;
}

/** 배지/호버카드가 필요로 하는 "지금 활성 부상/출장정지" 요약 — Player.activeInjurySeverity/
 *  injuryType/activeInjuryDuration에 그대로 얹는다. */
export interface ActiveInjuryStatus {
    severity: NonNullable<Player['activeInjurySeverity']>;
    injuryType: string;
    /** injury_history의 duration 원본 문자열 — 부상은 '3일'/'2주'/'시즌아웃', 출장정지는 'N경기'. */
    duration: string;
    /** injury_history의 returnDate(YYYY-MM-DD) — 시즌아웃은 null. formatReturnDateSuffix로 표시. */
    returnDate: string | null;
}

/** "N경기" 재계산에 필요한 팀별 스케줄 조회 — 스케줄 원본을 매번 넘기지 않도록 얇게 추상화. */
export interface SuspensionScheduleContext {
    /** roomId 전체 스케줄(모든 팀) — home/away/date/played만 있으면 됨. */
    schedule: { homeTeamId: string; awayTeamId: string; date: string; played: boolean }[];
    /** playerId → 소속 team_slug. 못 찾으면(방출 등) 재계산을 건너뛰고 원본 duration 유지. */
    getTeamId: (playerId: string) => string | undefined;
}

/** 출장정지 발부 시점에 고정된 duration("7경기") 대신, 그 팀이 return_date까지(포함) 아직
 *  치르지 않은 경기 수를 세어 "지금 기준 남은 경기 수"를 돌려준다. 부상(일수 기반)은 이미
 *  returnDate 자체가 "언제까지"를 정확히 말해주므로 재계산 대상이 아니다 — 출장정지만
 *  적용한다. */
function computeSuspensionGamesRemaining(
    teamId: string,
    returnDate: string,
    schedule: SuspensionScheduleContext['schedule'],
): number {
    return schedule.filter(g =>
        (g.homeTeamId === teamId || g.awayTeamId === teamId) &&
        !g.played &&
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
    for (const row of rows ?? []) {
        const isActive = row.health === 'Injured' && (
            (row.return_date != null && row.return_date > currentSimDate) ||
            (row.return_date == null && row.season_number === currentSeasonNumber)
        );
        if (!isActive) continue;
        const history = row.injury_history ?? [];
        const last = history[history.length - 1];
        if (!last?.severity) continue;

        let duration: string = last.duration ?? '';
        if (last.severity === 'Suspension' && last.returnDate && suspensionContext) {
            const teamId = suspensionContext.getTeamId(row.player_id);
            if (teamId) {
                const remaining = computeSuspensionGamesRemaining(teamId, last.returnDate, suspensionContext.schedule);
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
