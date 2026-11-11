
/**
 * multiDraftEngine.ts — 드래프트 순수 로직
 * Deno Edge Function과 클라이언트가 공용으로 사용하는 순수 함수들.
 * DB/React 의존 없음.
 */

export interface PickOrderEntry {
    userId: string;
    teamId: string;
    isAi?: boolean;   // AI 팀 여부 — draft-cron이 즉시 자동픽에 사용
}

/** Snake 드래프트 순서 생성 */
export function generateSnakePickOrder(
    members: PickOrderEntry[],
    totalRounds: number
): PickOrderEntry[] {
    const order: PickOrderEntry[] = [];
    for (let r = 0; r < totalRounds; r++) {
        const round = r % 2 === 0 ? [...members] : [...members].reverse();
        order.push(...round);
    }
    return order;
}

/** 선형 드래프트 순서 생성 — 매 라운드 동일한 순서 */
export function generateLinearPickOrder(
    members: PickOrderEntry[],
    totalRounds: number
): PickOrderEntry[] {
    const order: PickOrderEntry[] = [];
    for (let r = 0; r < totalRounds; r++) {
        order.push(...members);
    }
    return order;
}

/** Mulberry32 시드 기반 셔플 — start-draft에서 팀/멤버 순서를 결정론적으로 섞는다 */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
    const result = [...arr];
    let s = hashString(seed);
    for (let i = result.length - 1; i > 0; i--) {
        s = mulberry32(s);
        const j = Math.floor((s / 0xFFFFFFFF) * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function hashString(str: string): number {
    let h = 0;
    for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return h >>> 0;
}

function mulberry32(a: number): number {
    let t = a + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
}

/**
 * [2026-10-23] 유저 큐 기반 자동 픽 — 큐 순서대로 훑어 아직 지명되지 않은 첫 선수.
 * 큐가 비었거나 전원 지명됐으면 null → 호출부가 getBestAvailableId()로 폴백한다.
 * (docs/plan/draft-queue-plan.md D3/D4)
 */
export function getQueuedAvailableId(
    queue: readonly string[],
    draftedIds: ReadonlySet<string>
): string | null {
    for (const id of queue) {
        if (!draftedIds.has(id)) return id;
    }
    return null;
}

/** 자동 지명 후보 — id·OVR·포지션 + (선택) 팀 구성 가점용 능력치 묶음 */
export interface AutoPickPlayer {
    id: string;
    ovr: number;
    position: string;
    /** 3점 평균(코너·45도·탑, 반올림) */
    t3?: number;
    /** 수비 묶음 평균(반올림) */
    def?: number;
    /** 패스·플레이메이킹 묶음 평균(반올림) */
    plm?: number;
    /** 주·부 아키타입 이름을 이어 붙인 문자열 (예: "Rim Protecting BigRebounding Big") */
    archetypes?: string;
}

/**
 * [2026-11-11] 자동 지명 규칙 — 포지션 필요 우선 + 기다리면 손해 + 팀 구성 가점.
 * 이전 규칙("OVR 최고, 같은 포지션 2명까지")은 1·2라운드에 같은 포지션을 연달아 뽑아 팀 간 주전 격차가 컸다
 * (레전드 풀 30팀 목드래프트: 1·2R 같은 포지션 11팀, 주전 평균 OVR 86.8~90.8 → 이 규칙 0팀, 90.0~91.4).
 * 팀의 몇 번째 픽인지(로스터 인원 + 1)로 단계를 나눈다:
 *   1~STARTER_PICKS번째: 아직 없는 포지션만 → 포지션별 주전 1명씩
 *   ~ROTATION_PICKS번째: 포지션당 ROTATION_CAP명까지 (로테이션 백업)
 *   그 이후: ROTATION_CAP명 미만 포지션 먼저, 그다음 DEPTH_CAP명까지
 * 허용 포지션 안에서 값 = OVR + DROP_WEIGHT × 하락폭 + 가점이 가장 큰 선수를 뽑는다.
 *   하락폭: 다음 내 차례까지 남은 픽을 다른 팀이 OVR 순으로 가져간다고 보고, 그 포지션 최고 OVR이 얼마나 떨어지는지.
 *   가점(FIT_UNTIL_PICK번째 픽까지): 3점 슈터 부족·림 프로텍터 없음·플레이메이커 없음일 때 해당 선수에게 소폭.
 * 동점은 OVR, 그다음 id(문자열 큰 쪽)로 결정론적으로 정한다. 허용 포지션에서 못 찾으면 DEPTH_CAP 미만 포지션 → 최고 OVR 순으로 폴백.
 */
export const AUTO_PICK_RULE = {
    POSITIONS: ['PG', 'SG', 'SF', 'PF', 'C'] as readonly string[],
    STARTER_PICKS: 5,
    ROTATION_PICKS: 9,
    ROTATION_CAP: 2,
    DEPTH_CAP: 3,
    DROP_WEIGHT: 0.5,
    DROP_FALLBACK: 5,          // 다음 차례 전에 그 포지션 선수가 바닥나면 마지막 선수 OVR에서 이만큼 더 떨어진다고 본다
    CANDIDATES_PER_POS: 4,     // 포지션마다 OVR 상위 몇 명까지 가점 비교 후보로 볼지
    FIT_UNTIL_PICK: 9,
    SHOOTER_T3: 82,
    SHOOTER_BONUS: 1.5,
    SHOOTERS_WANTED_STARTERS: 2,   // 주전 단계(1~5번째 픽)에서 원하는 슈터 수
    SHOOTERS_WANTED_ROTATION: 3,   // 로테이션 단계(6~9번째 픽)에서 원하는 슈터 수
    RIM_DEF: 84,
    RIM_BONUS: 1.5,
    PLAYMAKER_PLM: 86,
    PLAYMAKER_BONUS: 1.0,
};

const isShooter = (p: AutoPickPlayer) => (p.t3 ?? 0) >= AUTO_PICK_RULE.SHOOTER_T3;
const isRimProtector = (p: AutoPickPlayer) =>
    (p.position === 'PF' || p.position === 'C') &&
    ((p.archetypes ?? '').includes('Rim Protecting') || (p.def ?? 0) >= AUTO_PICK_RULE.RIM_DEF);
const isPlaymaker = (p: AutoPickPlayer) => (p.plm ?? 0) >= AUTO_PICK_RULE.PLAYMAKER_PLM;

function autoPickFitBonus(c: AutoPickPlayer, roster: AutoPickPlayer[], pickNo: number): number {
    const R = AUTO_PICK_RULE;
    if (pickNo > R.FIT_UNTIL_PICK) return 0;
    let b = 0;
    const shootersWanted = pickNo <= R.STARTER_PICKS ? R.SHOOTERS_WANTED_STARTERS : R.SHOOTERS_WANTED_ROTATION;
    if (isShooter(c) && roster.filter(isShooter).length < shootersWanted) b += R.SHOOTER_BONUS;
    if (isRimProtector(c) && !roster.some(isRimProtector)) b += R.RIM_BONUS;
    if (isPlaymaker(c) && !roster.some(isPlaymaker)) b += R.PLAYMAKER_BONUS;
    return b;
}

function pickByNeed(
    available: AutoPickPlayer[], allowed: readonly string[], roster: AutoPickPlayer[], pickNo: number, picksUntilNext: number,
): AutoPickPlayer | null {
    const R = AUTO_PICK_RULE;
    let best: { v: number; p: AutoPickPlayer } | null = null;
    for (const pos of allowed) {
        const atPos = available.filter(p => p.position === pos);
        if (atPos.length === 0) continue;
        let drop = 0;
        if (picksUntilNext > 0) {
            let m = 0;
            for (const p of available.slice(0, picksUntilNext)) if (p.position === pos) m++;
            drop = atPos[0].ovr - (m < atPos.length ? atPos[m].ovr : atPos[atPos.length - 1].ovr - R.DROP_FALLBACK);
        }
        for (const c of atPos.slice(0, R.CANDIDATES_PER_POS)) {
            const v = c.ovr + R.DROP_WEIGHT * drop + autoPickFitBonus(c, roster, pickNo);
            if (!best || v > best.v || (v === best.v && (c.ovr > best.p.ovr || (c.ovr === best.p.ovr && c.id > best.p.id)))) {
                best = { v, p: c };
            }
        }
    }
    return best?.p ?? null;
}

/**
 * 현재 차례 팀의 자동 픽 (규칙은 위 AUTO_PICK_RULE 주석).
 * teamRoster: 그 팀이 이미 지명한 선수들, picksUntilNext: 이 픽 다음부터 그 팀의 다음 차례 전까지 다른 팀 픽 수(없으면 0).
 */
export function getBestAvailableId(
    poolPlayers: AutoPickPlayer[],
    draftedIds: Iterable<string>,
    teamRoster: AutoPickPlayer[] = [],
    picksUntilNext = 0,
): string | null {
    const R = AUTO_PICK_RULE;
    const drafted = new Set(draftedIds);
    const available = poolPlayers
        .filter(p => !drafted.has(p.id))
        .sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (available.length === 0) return null;

    const counts: Record<string, number> = {};
    for (const p of teamRoster) counts[p.position] = (counts[p.position] ?? 0) + 1;
    const cnt = (pos: string) => counts[pos] ?? 0;
    const pickNo = teamRoster.length + 1;

    let allowed: readonly string[];
    if (pickNo <= R.STARTER_PICKS) allowed = R.POSITIONS.filter(pos => cnt(pos) === 0);
    else if (pickNo <= R.ROTATION_PICKS) allowed = R.POSITIONS.filter(pos => cnt(pos) < R.ROTATION_CAP);
    else {
        const short = R.POSITIONS.filter(pos => cnt(pos) < R.ROTATION_CAP);
        allowed = short.length ? short : R.POSITIONS.filter(pos => cnt(pos) < R.DEPTH_CAP);
    }

    const pick = pickByNeed(available, allowed, teamRoster, pickNo, picksUntilNext)
        ?? pickByNeed(available, R.POSITIONS.filter(pos => cnt(pos) < R.DEPTH_CAP), teamRoster, pickNo, picksUntilNext)
        ?? available[0];
    return pick.id;
}
