// ============================================================
// 드래프트 라운드 기반 계약 생성 규칙 — 클라이언트(리그 생성/설정 UI, 드래프트 보드)와
// 서버(server/src/finalize.ts)가 공유하는 순수 모듈. 외부 의존 없음(서버에서 import해도
// supabaseClient 등 부작용 체인이 따라오지 않아야 하므로 utils/constants.ts를 import하지 말 것).
//
// [2026-09-22 합의 규칙]
//  - contract_mode 'alternative': 드래프트된 선수 전원에게 라운드 스케일로 1년 계약을 새로 만든다
//    (실제 계약 무시). 레전드 포함 판타지 리그용.
//  - contract_mode 'standard'  : 실제 계약을 그대로 쓴다. 풀은 "룸 시즌을 포함하는 유효 계약이 있는
//    선수 + 당해 드래프트 클래스 신인"으로 제한되고, 신인만 실제 NBA 픽 순번의 루키 스케일로 생성.
//  - 연봉 = 리그 캡 × cap%. R1은 슬롯(팀의 고정 드래프트 순번) 기준 첫 픽 % → 마지막 픽 %로 선형
//    감소(팀 수 상대 — 30팀이 아니어도 동작), R2~R10은 라운드 균일, R11~ 는 고정 미니멈 비율.
//  - 계약은 전부 1년(yearSeasons=[룸 시즌 시작연도], currentYear 0), 상승률/옵션 없음.
//  - 미드래프트 선수는 계약을 만들지 않는다(FA 협상 엔진 담당).
//  - 표는 리그 생성 시 어드민이 조정 가능. 스네이크 드래프트라 팀 초기 페이롤 ≈ 표의 합계 —
//    UI는 summarizeTeamPayrollPct()로 합계를 보여주고 택스/에이프런 초과를 경고할 것.
// ============================================================

export type ContractMode = 'standard' | 'alternative';

export interface DraftSalaryScale {
    /** R1 첫 픽(슬롯 1)의 cap%. */
    r1FirstPct: number;
    /** R1 마지막 픽(슬롯 = 팀 수)의 cap%. r1FirstPct와 같으면 R1 균일. */
    r1LastPct: number;
    /** R2 이후 라운드별 cap% (index 0 = R2). 라운드가 이 배열 길이를 넘으면 마지막 값을 쓴다. */
    roundsPct: number[];
}

/** 기본 프리셋 — R1 30→25%(평균 27.5), R2~R10 볼록 감소, R11~R15 고정 미니멈 1.0%.
 *  15라운드 합계 ≈ 107.2% (Weakly League 드라이런 2026-09-22 기준 30팀 전부 ±1% 이내로 수렴). */
export const DEFAULT_DRAFT_SALARY_SCALE: DraftSalaryScale = {
    r1FirstPct: 30,
    r1LastPct: 25,
    roundsPct: [18, 12, 9, 7.5, 6.5, 6, 5.5, 5.2, 5, 1, 1, 1, 1, 1],   // R2 … R15
};

export const DRAFT_SALARY_PCT_MAX = 35;   // CBA 개인 맥스(35%)를 넘는 값은 허용하지 않음

/** 슬롯(1~teamCount)과 라운드로 cap%를 구한다. 슬롯은 draft_picks.slot = 팀의 고정 드래프트 순번. */
export function resolveDraftSalaryPct(scale: DraftSalaryScale, round: number, slot: number, teamCount: number): number {
    if (round <= 1) {
        if (teamCount <= 1) return scale.r1FirstPct;
        const t = Math.min(Math.max(slot - 1, 0), teamCount - 1) / (teamCount - 1);   // 0(첫 픽) ~ 1(마지막 픽)
        return scale.r1FirstPct + (scale.r1LastPct - scale.r1FirstPct) * t;
    }
    const arr = scale.roundsPct;
    if (arr.length === 0) return 0;
    return arr[Math.min(round - 2, arr.length - 1)];
}

export function draftSalaryAmount(salaryCap: number, pct: number): number {
    return Math.round(salaryCap * pct / 100);
}

/** 스네이크 드래프트에서 한 팀의 초기 페이롤(cap%). 슬롯을 주면 R1 선형 구간의 정확한 값, 없으면 R1 평균. */
export function summarizeTeamPayrollPct(scale: DraftSalaryScale, totalRounds: number, teamCount: number, slot?: number): number {
    const r1 = slot != null ? resolveDraftSalaryPct(scale, 1, slot, teamCount) : (scale.r1FirstPct + scale.r1LastPct) / 2;
    let sum = r1;
    for (let r = 2; r <= totalRounds; r++) sum += resolveDraftSalaryPct(scale, r, 1, teamCount);
    return sum;
}

export interface ScaleValidation { ok: boolean; errors: string[]; warnings: string[]; }

/** 값 범위·단조성 검증 + 페이롤 경고. 임계값은 캡 대비 비율(예: 택스 121.5%)로 넘긴다. */
export function validateDraftSalaryScale(
    scale: DraftSalaryScale,
    totalRounds: number,
    teamCount: number,
    thresholds?: { taxPct?: number; apron1Pct?: number; apron2Pct?: number },
): ScaleValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const all = [scale.r1FirstPct, scale.r1LastPct, ...scale.roundsPct];
    if (all.some(v => !Number.isFinite(v) || v < 0)) errors.push('cap%는 0 이상의 숫자여야 합니다');
    if (all.some(v => v > DRAFT_SALARY_PCT_MAX)) errors.push(`cap%는 개인 맥스(${DRAFT_SALARY_PCT_MAX}%)를 넘을 수 없습니다`);
    if (scale.r1LastPct > scale.r1FirstPct) errors.push('R1 마지막 픽 %가 첫 픽 %보다 클 수 없습니다');
    if (scale.roundsPct.length < Math.max(0, totalRounds - 1)) errors.push(`R2~R${totalRounds} 값이 모두 있어야 합니다(현재 ${scale.roundsPct.length + 1}라운드분)`);
    for (let i = 1; i < scale.roundsPct.length; i++) {
        if (scale.roundsPct[i] > scale.roundsPct[i - 1] + 1e-9) { warnings.push(`R${i + 2} %가 R${i + 1}보다 큽니다(뒷 라운드가 더 비쌈)`); break; }
    }
    if (scale.roundsPct[0] != null && scale.roundsPct[0] > scale.r1LastPct + 1e-9) warnings.push('R2 %가 R1 마지막 픽 %보다 큽니다');

    const first = summarizeTeamPayrollPct(scale, totalRounds, teamCount, 1);
    const last  = summarizeTeamPayrollPct(scale, totalRounds, teamCount, teamCount);
    const hi = Math.max(first, last);
    if (thresholds?.apron2Pct != null && hi > thresholds.apron2Pct) warnings.push(`초기 페이롤 ${hi.toFixed(1)}%가 2차 에이프런(${thresholds.apron2Pct.toFixed(1)}%)을 넘습니다`);
    else if (thresholds?.apron1Pct != null && hi > thresholds.apron1Pct) warnings.push(`초기 페이롤 ${hi.toFixed(1)}%가 1차 에이프런(${thresholds.apron1Pct.toFixed(1)}%)을 넘습니다`);
    else if (thresholds?.taxPct != null && hi > thresholds.taxPct) warnings.push(`초기 페이롤 ${hi.toFixed(1)}%가 사치세선(${thresholds.taxPct.toFixed(1)}%)을 넘습니다`);
    return { ok: errors.length === 0, errors, warnings };
}

/** DB(jsonb)에서 읽은 값을 안전하게 정규화 — 없거나 형식이 깨졌으면 기본 프리셋. */
export function normalizeDraftSalaryScale(raw: unknown): DraftSalaryScale {
    const d = DEFAULT_DRAFT_SALARY_SCALE;
    if (!raw || typeof raw !== 'object') return d;
    const o = raw as Partial<DraftSalaryScale>;
    const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
    const rounds = Array.isArray(o.roundsPct) && o.roundsPct.length > 0
        ? o.roundsPct.map((v, i) => num(v, d.roundsPct[Math.min(i, d.roundsPct.length - 1)]))
        : d.roundsPct;
    return { r1FirstPct: num(o.r1FirstPct, d.r1FirstPct), r1LastPct: num(o.r1LastPct, d.r1LastPct), roundsPct: rounds };
}

/** 라운드 스케일 1년 계약 객체(PlayerContract 모양) — 서버/클라이언트 공통.
 *  signingType은 비운다 — 어휘상 undefined가 "예외 조항 없이(캡스페이스로) 체결"이고, SigningType은
 *  10종 고정 union + 라벨 맵이라 새 값을 넣으면 types/fa.ts·utils/contractLabels.ts 전파가 필요하다.
 *  라운드 스케일 계약은 room_player_state에만 존재하고 1년·yearSeasons=[룸 시즌]이라 그 자체로 식별된다. */
export function buildDraftScaleContract(salaryCap: number, pct: number, seasonStartYear: number) {
    return {
        type: 'free_agent' as const,
        years: [draftSalaryAmount(salaryCap, pct)],
        yearSeasons: [seasonStartYear],
        currentYear: 0,
        contractDetail: 'general' as const,
    };
}

/** 'standard' 모드 풀 필터 — 룸 시즌을 포함하는 유효 계약이 있거나 당해 드래프트 클래스 신인. */
export function isEligibleForStandardPool(
    contract: any,
    draftYear: number | null | undefined,
    seasonStartYear: number,
    rookieClassYear: number,
): boolean {
    if (draftYear != null && Number(draftYear) >= rookieClassYear) return true;
    const ys = contract?.yearSeasons;
    return Array.isArray(ys) && ys.length > 0 && Number(ys[0]) <= seasonStartYear && Number(ys[ys.length - 1]) >= seasonStartYear;
}
