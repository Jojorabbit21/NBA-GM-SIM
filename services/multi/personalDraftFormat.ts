// personalDraftFormat.ts — 토너먼트 전용 "개인 팩 드래프트" 포맷 빌드/검증.
// docs/plan/tournament-personal-pack-draft-plan.md 참고 — leagues.personal_draft_format에
// 저장되는 JSON을 만든다.
//
// [2026-09-20 안 A 배선] 후보는 meta_players가 아니라 시즌 카드(meta_player_cards)다.
// 라운드마다 컬렉션(collectionIds, 비면 전체 카드)과 OVR 범위로 카드를 걸러 eligiblePlayerIds에
// meta_player_cards.id 를 확정 저장한다 — 이후 드래프트 진행 중엔(RPC들) 카드 테이블을 재쿼리하지
// 않고 이 배열을 그대로 읽기만 하므로 "라운드 풀 고갈"이 런타임에 발생할 수 없다(저장 시점에
// 부족하면 저장 자체를 거부한다). 카드 OVR(manual_ovr 반영)은 포맷 최상위 cardOvrById에 함께
// 저장해 서버 자동 지명(만료/강제 완료)이 같은 값으로 정렬하게 한다.
// 글로벌 OVR 범위(leagues.draft_ovr_min/max)는 라운드 하위범위의 상한선으로만 쓴다. 연도 범위
// (draftYearMin/Max)는 카드에 지명 연도 개념이 없어 무시된다(필드는 하위호환으로 남김).
//
// server/src/ 미러 없음 — eligiblePlayerIds/cardOvrById는 저장 시점에 한 번 확정해두는 값이고
// 이후 서버는 그 값을 읽기만 한다.
import { fetchCardPool, type CardPoolEntry } from './cardPool';

export interface PersonalDraftRoundInput {
    round: number;
    poolSize: number;
    picks: number;
    ovrMin: number;
    ovrMax: number;
    /** 카드 배선 이후 미사용(하위호환) — 항상 null 권장. */
    draftYearMin: number | null;
    draftYearMax: number | null;
    /** 이 라운드 후보를 뽑을 카드 컬렉션(meta_player_card_collections.id). 비거나 없으면 전체 카드. */
    collectionIds?: string[];
}

export interface PersonalDraftRound extends PersonalDraftRoundInput {
    /** 저장 시점에 확정된 후보 meta_player_cards.id 목록 — 픽 시점엔 재쿼리하지 않고 이 배열에서만 뽑는다. */
    eligiblePlayerIds: string[];
}

export interface PersonalDraftFormat {
    totalRounds: number;
    /** 라운드당 픽 제한시간(초). null이면 타이머 없음. 만료 시 서버가 팩 내 최고 OVR 카드를 자동 지명. */
    pickTimerSec: number | null;
    rounds: PersonalDraftRound[];
    /** 'cards'면 eligiblePlayerIds가 meta_player_cards.id(2026-09-20 이후). 없으면 옛 meta_players 포맷. */
    source?: 'cards';
    /** 카드별 유효 OVR(manual_ovr 반영) — 서버 자동 지명 정렬용. */
    cardOvrById?: Record<string, number>;
}

export interface BuildPersonalDraftFormatParams {
    /** 라운드당 픽 제한시간(초, 정수 1 이상). null/undefined면 타이머 없음. */
    pickTimerSec?: number | null;
    /** leagues.draft_year_min/max — 카드 배선 이후엔 검증에만 쓰이고 필터엔 영향 없음. */
    globalDraftYearMin: number;
    globalDraftYearMax: number;
    /** leagues.draft_ovr_min/max — 글로벌 범위. */
    globalOvrMin: number;
    globalOvrMax: number;
    /** 카드는 자체 능력치를 갖는 독립 row라 피크 오버라이드가 적용되지 않는다(시그니처 호환용). */
    useCustomOverrides: boolean;
    rounds: PersonalDraftRoundInput[];
}

export type BuildPersonalDraftFormatResult =
    | { ok: true; format: PersonalDraftFormat }
    | { ok: false; error: string };

/** 총 로스터 사이즈 = 라운드별 picks의 합. 별도 입력값이 아니라 항상 이 함수로 계산해서 표시한다. */
export function computeRosterSize(rounds: { picks: number }[]): number {
    return rounds.reduce((sum, r) => sum + Math.max(0, Math.trunc(r.picks)), 0);
}

// ── 어드민 UI(Phase 6)용 한계값 ────────────────────────────────────────────────
// 총 로스터: PBP 엔진이 최소 5명 + 교체 여유가 필요하고, leagues.max_roster_size 상한이 20이라 그 안에서만.
export const PERSONAL_DRAFT_ROSTER_MIN = 8;
export const PERSONAL_DRAFT_ROSTER_MAX = 20;
/** 로스터가 이보다 작으면 저장은 되지만 UI에서 경고(부상 없음 전제라도 로테이션이 빡빡해짐). */
export const PERSONAL_DRAFT_ROSTER_WARN_BELOW = 13;
export const PERSONAL_DRAFT_ROUNDS_MAX = 20;
export const PERSONAL_DRAFT_POOL_SIZE_MAX = 30;
export const PICK_TIMER_SEC_MIN = 10;
export const PICK_TIMER_SEC_MAX = 600;
export const PICK_TIMER_SEC_DEFAULT = 90;
/** 카드 전용 OVR 상한(meta_player_cards.manual_ovr CHECK 0~999) — 글로벌 OVR 범위 입력 상한. */
export const PERSONAL_DRAFT_OVR_MAX = 999;

export interface FixedDeclineCurveOptions {
    totalRounds: number;
    /** 각 라운드 OVR 창 폭(예: 10이면 89~99, 87~97, …). */
    windowSize: number;
    poolSize: number;
    picks: number;
}

/**
 * "고정 하락 커브" 프리셋 — 글로벌 OVR 범위 안에서 1라운드가 최상단 창, 마지막 라운드가 최하단
 * 창이 되도록 창을 등간격으로 내려 깐다. 창 폭이 글로벌 범위보다 크면 범위 전체를 매 라운드
 * 그대로 쓴다(내릴 공간이 없음). 순수 함수 — 어드민 UI의 프리셋 버튼에서만 호출.
 */
export function buildFixedDeclineCurve(
    globalOvrMin: number,
    globalOvrMax: number,
    opts: FixedDeclineCurveOptions,
): PersonalDraftRoundInput[] {
    const n = Math.max(1, Math.trunc(opts.totalRounds));
    const width = Math.max(0, Math.trunc(opts.windowSize));
    const span = globalOvrMax - globalOvrMin;
    const rounds: PersonalDraftRoundInput[] = [];
    for (let i = 0; i < n; i++) {
        let ovrMax: number;
        let ovrMin: number;
        if (width >= span || n === 1) {
            ovrMax = globalOvrMax;
            ovrMin = globalOvrMin;
        } else {
            const travel = span - width;               // 창 상단이 내려갈 수 있는 총 거리
            ovrMax = Math.round(globalOvrMax - (travel * i) / (n - 1));
            ovrMin = ovrMax - width;
        }
        rounds.push({
            round: i + 1,
            poolSize: opts.poolSize,
            picks: opts.picks,
            ovrMin: Math.max(globalOvrMin, ovrMin),
            ovrMax: Math.min(globalOvrMax, ovrMax),
            draftYearMin: null,
            draftYearMax: null,
            collectionIds: [],
        });
    }
    return rounds;
}

export interface ValidatePersonalDraftInputParams {
    pickTimerSec: number | null;
    globalDraftYearMin: number;
    globalDraftYearMax: number;
    globalOvrMin: number;
    globalOvrMax: number;
    rounds: PersonalDraftRoundInput[];
}

/**
 * DB 조회 없이 끝나는 동기 검증(라운드 순서/범위/픽 수/타이머/총 로스터). buildPersonalDraftFormat()이
 * 풀을 조회하기 전에 먼저 호출하고, 어드민 편집기도 같은 함수로 입력 즉시 에러를 보여준다 —
 * 두 곳의 규칙이 어긋나지 않도록 한 곳에만 둔다. 문제 없으면 null.
 */
export function validatePersonalDraftInput(params: ValidatePersonalDraftInputParams): string | null {
    const { pickTimerSec, globalDraftYearMin, globalDraftYearMax, globalOvrMin, globalOvrMax, rounds } = params;

    if (rounds.length === 0) return '라운드가 하나도 없습니다.';
    if (rounds.length > PERSONAL_DRAFT_ROUNDS_MAX) return `라운드는 최대 ${PERSONAL_DRAFT_ROUNDS_MAX}개까지입니다.`;
    if (pickTimerSec != null && (!Number.isInteger(pickTimerSec) || pickTimerSec < 1)) {
        return '픽 제한시간은 1초 이상의 정수여야 합니다.';
    }

    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        if (r.round !== i + 1) {
            return `라운드 번호가 순서대로가 아닙니다 (index ${i}: round=${r.round}).`;
        }
        if (!Number.isInteger(r.poolSize) || r.poolSize < 1) {
            return `라운드 ${r.round}: 노출 카드 수(poolSize)는 1 이상의 정수여야 합니다.`;
        }
        if (r.poolSize > PERSONAL_DRAFT_POOL_SIZE_MAX) {
            return `라운드 ${r.round}: 노출 카드 수는 최대 ${PERSONAL_DRAFT_POOL_SIZE_MAX}장입니다.`;
        }
        if (!Number.isInteger(r.picks) || r.picks < 1) {
            return `라운드 ${r.round}: 픽 수(picks)는 1 이상의 정수여야 합니다.`;
        }
        if (r.picks > r.poolSize) {
            return `라운드 ${r.round}: 픽 수(${r.picks})가 노출 카드 수(${r.poolSize})보다 많을 수 없습니다.`;
        }
        if (r.ovrMin > r.ovrMax) {
            return `라운드 ${r.round}: 오버롤 범위가 잘못됐습니다(${r.ovrMin} > ${r.ovrMax}).`;
        }
        if (r.ovrMin < globalOvrMin || r.ovrMax > globalOvrMax) {
            return `라운드 ${r.round}: 오버롤 범위(${r.ovrMin}~${r.ovrMax})가 글로벌 범위`
                 + `(${globalOvrMin}~${globalOvrMax})를 벗어납니다.`;
        }
        if (r.draftYearMin != null && r.draftYearMax != null && r.draftYearMin > r.draftYearMax) {
            return `라운드 ${r.round}: 드래프트 연도 범위가 잘못됐습니다(${r.draftYearMin} > ${r.draftYearMax}).`;
        }
        const yearMin = r.draftYearMin ?? globalDraftYearMin;
        const yearMax = r.draftYearMax ?? globalDraftYearMax;
        if (yearMin < globalDraftYearMin || yearMax > globalDraftYearMax) {
            return `라운드 ${r.round}: 드래프트 연도 범위(${yearMin}~${yearMax})가 글로벌 범위`
                 + `(${globalDraftYearMin}~${globalDraftYearMax})를 벗어납니다.`;
        }
    }

    const rosterSize = computeRosterSize(rounds);
    if (rosterSize < PERSONAL_DRAFT_ROSTER_MIN || rosterSize > PERSONAL_DRAFT_ROSTER_MAX) {
        return `총 로스터(라운드별 픽 수 합계)는 ${PERSONAL_DRAFT_ROSTER_MIN}~${PERSONAL_DRAFT_ROSTER_MAX}명이어야 합니다 (현재 ${rosterSize}명).`;
    }
    return null;
}

/** 라운드 조건(컬렉션 + OVR 범위)에 맞는 카드만 — 빌더와 편집기의 "후보 인원 확인"이 같은 함수를 쓴다. */
export function filterCardsForRound(pool: CardPoolEntry[], r: PersonalDraftRoundInput): CardPoolEntry[] {
    const cols = r.collectionIds ?? [];
    return pool.filter(c => {
        if (c.ovr < r.ovrMin || c.ovr > r.ovrMax) return false;
        if (cols.length > 0 && !c.collectionIds.some(id => cols.includes(id))) return false;
        return true;
    });
}

/**
 * 라운드별 설정을 검증하고, 카드 풀을 한 번만 조회해 각 라운드의 eligiblePlayerIds(카드 id)를
 * 메모리에서 필터링으로 확정한다. 어느 라운드든 poolSize보다 후보가 적으면 저장 전체를
 * 거부한다(부분 성공 없음 — 나중에 특정 라운드만 못 뽑는 상태가 남는 걸 막기 위함).
 */
export async function buildPersonalDraftFormat(
    params: BuildPersonalDraftFormatParams,
): Promise<BuildPersonalDraftFormatResult> {
    const { globalDraftYearMin, globalDraftYearMax, globalOvrMin, globalOvrMax, rounds } = params;
    const pickTimerSec = params.pickTimerSec ?? null;

    const syncError = validatePersonalDraftInput({
        pickTimerSec, globalDraftYearMin, globalDraftYearMax, globalOvrMin, globalOvrMax, rounds,
    });
    if (syncError) return { ok: false, error: syncError };

    let pool: CardPoolEntry[];
    try {
        pool = await fetchCardPool();
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : '카드 풀 조회에 실패했습니다.' };
    }
    if (pool.length === 0) {
        return { ok: false, error: '시즌 카드가 한 장도 없습니다. 어드민 "카드 관리" 탭에서 카드를 먼저 만들어주세요.' };
    }

    const resolvedRounds: PersonalDraftRound[] = [];
    const cardOvrById: Record<string, number> = {};
    for (const r of rounds) {
        const eligible = filterCardsForRound(pool, r);
        if (eligible.length < r.poolSize) {
            return {
                ok: false,
                error: `라운드 ${r.round}: 조건을 만족하는 카드가 ${eligible.length}장뿐입니다 `
                     + `(노출 카드 수 ${r.poolSize}장 필요). 오버롤 범위를 넓히거나 컬렉션을 더 고르세요.`,
            };
        }
        for (const c of eligible) cardOvrById[c.id] = c.ovr;
        resolvedRounds.push({
            ...r,
            draftYearMin: null,
            draftYearMax: null,
            collectionIds: r.collectionIds ?? [],
            eligiblePlayerIds: eligible.map(c => c.id),
        });
    }

    return {
        ok: true,
        format: { totalRounds: rounds.length, pickTimerSec, rounds: resolvedRounds, source: 'cards', cardOvrById },
    };
}
