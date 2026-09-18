// personalDraftFormat.ts — 토너먼트 전용 "개인 팩 드래프트" 포맷 빌드/검증.
// docs/plan/tournament-personal-pack-draft-plan.md 참고 — leagues.personal_draft_format에
// 저장되는 JSON을 만든다. 글로벌 범위(연도/오버롤)는 기존 draft_year_min/max, draft_ovr_min/max를
// 그대로 재사용하고, 이 함수는 그 글로벌 풀 안에서 라운드별 하위범위로 eligiblePlayerIds를
// 확정 저장한다 — 이후 드래프트 진행 중엔(RPC들) meta_players를 재쿼리하지 않고 이 배열을
// 그대로 읽기만 하므로 "라운드 풀 고갈"이 런타임에 발생할 수 없다(저장 시점에 부족하면
// 저장 자체를 거부한다).
//
// server/src/ 미러 없음 — eligiblePlayerIds는 이 함수가 저장 시점에 한 번 확정해두는 값이고
// 이후 서버는 그 배열을 읽기만 하면 되므로, draftPoolQuery.ts/draftPoolCapacity.ts와 달리
// 서버가 독립적으로 재계산할 이유가 없다.
import { fetchDraftPoolPlayers } from './draftPoolCapacity';

export interface PersonalDraftRoundInput {
    round: number;
    poolSize: number;
    picks: number;
    ovrMin: number;
    ovrMax: number;
    /** null이면 글로벌 draftYearMin/Max를 그대로 상속(이 라운드에선 연도로 추가로 좁히지 않음). */
    draftYearMin: number | null;
    draftYearMax: number | null;
}

export interface PersonalDraftRound extends PersonalDraftRoundInput {
    /** 저장 시점에 확정된 후보 meta_players.id 목록 — 픽 시점엔 재쿼리하지 않고 이 배열에서만 뽑는다. */
    eligiblePlayerIds: string[];
}

export interface PersonalDraftFormat {
    totalRounds: number;
    /** 라운드당 픽 제한시간(초). null이면 타이머 없음. 만료 시 서버가 팩 내 최고 OVR 카드를 자동 지명. */
    pickTimerSec: number | null;
    rounds: PersonalDraftRound[];
}

export interface BuildPersonalDraftFormatParams {
    /** 라운드당 픽 제한시간(초, 정수 1 이상). null/undefined면 타이머 없음. */
    pickTimerSec?: number | null;
    /** leagues.draft_year_min/max — 글로벌 범위. 라운드별 하위범위는 이 범위를 벗어날 수 없다. */
    globalDraftYearMin: number;
    globalDraftYearMax: number;
    /** leagues.draft_ovr_min/max — 글로벌 범위. */
    globalOvrMin: number;
    globalOvrMax: number;
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

/**
 * 라운드별 설정을 검증하고, 글로벌 풀을 한 번만 조회해 각 라운드의 eligiblePlayerIds를
 * 메모리에서 필터링으로 확정한다. 어느 라운드든 poolSize보다 후보가 적으면 저장 전체를
 * 거부한다(부분 성공 없음 — 나중에 특정 라운드만 못 뽑는 상태가 남는 걸 막기 위함).
 */
export async function buildPersonalDraftFormat(
    params: BuildPersonalDraftFormatParams,
): Promise<BuildPersonalDraftFormatResult> {
    const {
        globalDraftYearMin, globalDraftYearMax,
        globalOvrMin, globalOvrMax,
        useCustomOverrides, rounds,
    } = params;
    const pickTimerSec = params.pickTimerSec ?? null;

    const syncError = validatePersonalDraftInput({
        pickTimerSec, globalDraftYearMin, globalDraftYearMax, globalOvrMin, globalOvrMax, rounds,
    });
    if (syncError) return { ok: false, error: syncError };

    // 글로벌 풀은 한 번만 조회 — 라운드별 하위범위는 이 결과를 메모리에서 다시 거르기만 한다.
    // fetchDraftPoolPlayers는 기존 공유풀 드래프트 용량 검증(draftPoolCapacity.ts)과 동일한
    // 필터·매핑 순서(연도 → 매핑 → OVR)를 쓴다.
    let globalPool;
    try {
        globalPool = await fetchDraftPoolPlayers({
            draftYearMin: globalDraftYearMin,
            draftYearMax: globalDraftYearMax,
            ovrMin: globalOvrMin,
            ovrMax: globalOvrMax,
            useCustomOverrides,
        });
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : '선수 풀 조회에 실패했습니다.' };
    }

    const resolvedRounds: PersonalDraftRound[] = [];
    for (const r of rounds) {
        const yearMin = r.draftYearMin ?? globalDraftYearMin;
        const yearMax = r.draftYearMax ?? globalDraftYearMax;
        // 라운드가 연도로 추가로 좁히지 않으면(둘 다 null) draftYear 필드 결측 여부와 무관하게
        // 글로벌 풀을 그대로 신뢰한다 — draftYear는 일부 선수에서 base_attributes 결측으로
        // undefined일 수 있는데(draftPoolQuery.ts 상단 주석 참고), 이미 글로벌 SQL 필터를
        // 통과한 선수를 라운드 단계에서 다시 떨어뜨리지 않기 위함.
        const narrowsByYear = r.draftYearMin != null || r.draftYearMax != null;
        const eligible = globalPool.filter(p => {
            if (p.ovr < r.ovrMin || p.ovr > r.ovrMax) return false;
            if (narrowsByYear) {
                if (p.draftYear == null || p.draftYear < yearMin || p.draftYear > yearMax) return false;
            }
            return true;
        });
        if (eligible.length < r.poolSize) {
            return {
                ok: false,
                error: `라운드 ${r.round}: 조건을 만족하는 선수가 ${eligible.length}명뿐입니다 `
                     + `(노출 카드 수 ${r.poolSize}명 필요). 오버롤/연도 범위를 넓혀주세요.`,
            };
        }
        resolvedRounds.push({ ...r, eligiblePlayerIds: eligible.map(p => String(p.id)) });
    }

    return {
        ok: true,
        format: { totalRounds: rounds.length, pickTimerSec, rounds: resolvedRounds },
    };
}
