// AI 프런트 호버 카드의 문구·배지 색 (화면 전용 — 서버 미러 없음).
// 문장은 게임 속 AI가 어떻게 판단하는지를 설명할 뿐, 실존 인물에 대한 서술이 아니다.
// 설계: docs/plan/multi-ai-gm-profile-plan.md 4장, 목업 https://claude.ai/artifact/YTKRLcHcBNcXmw7u5zYgdA
import type { AiGmTraits, RosterStyleLabel } from '../../../services/multi/aiGmProfile';
import { HIGH_COMPETITIVENESS, LOW_COMPETITIVENESS, type GmStance } from '../../../services/multi/aiTeamSituation';

/** 깐깐함이 이 이상이면 "손해 보는 거래에는 깐깐하며", 이 이하면 "좋은 매물에는 값을 더 쳐주며"를 붙인다 */
const STRICT_CLAUSE_MIN = 0.015;
const GENEROUS_CLAUSE_MAX = -0.02;

const ROSTER_CLAUSE: Record<RosterStyleLabel, string> = {
    star: '스타급 선수를 선호하는 프런트입니다.',
    depth: '몸값 대비 쏠쏠한 선수를 선호하는 프런트입니다.',
    balanced: '스타와 뎁스를 고르게 보는 프런트입니다.',
};

export function describeFrontOffice(traits: AiGmTraits, rosterStyleLabel: RosterStyleLabel): string {
    const clauses: string[] = [];
    if (traits.competitiveness >= HIGH_COMPETITIVENESS) clauses.push('성적과 상관없이 전력 보강에 적극적이고');
    else if (traits.competitiveness < LOW_COMPETITIVENESS) clauses.push('가망이 없다고 보면 일찍 정리하고');
    else clauses.push('팀 상황에 맞춰 움직이고');

    if (traits.strictness >= STRICT_CLAUSE_MIN) clauses.push('손해 보는 거래에는 깐깐하며');
    else if (traits.strictness <= GENEROUS_CLAUSE_MAX) clauses.push('좋은 매물에는 값을 더 쳐주며');

    clauses.push(ROSTER_CLAUSE[rosterStyleLabel]);
    return clauses.join(', ');
}

// 칩(배경 + 글자색) — 로스터 성향·현재 기조 값에 쓴다. 사용자 요청(2026-10-20)으로 글자색만 쓰던 안을 되돌림.
const NEUTRAL_TONE = 'bg-slate-800 text-slate-300';

export const ROSTER_STYLE_TONE: Record<RosterStyleLabel, string> = {
    star: 'bg-amber-500/15 text-amber-400',
    depth: 'bg-sky-400/15 text-sky-300',
    balanced: NEUTRAL_TONE,
};

export const STANCE_TONE: Record<GmStance, string> = {
    allIn: 'bg-yellow-500/15 text-yellow-300',
    contending: 'bg-yellow-500/15 text-yellow-300',
    pushing: 'bg-emerald-500/15 text-emerald-300',
    racing: 'bg-emerald-500/15 text-emerald-300',
    buying: 'bg-sky-400/15 text-sky-300',
    holding: NEUTRAL_TONE,
    rebounding: 'bg-orange-500/15 text-orange-300',
    selling: 'bg-rose-500/15 text-rose-300',
};
