/**
 * rosterEvaluator.ts — AI 감독 로스터 평가 엔진 (C1, 성향 없는 balanced 기준, 서버 전용)
 *
 * 경기 직전 한 팀의 로스터(부상/컨디션 반영된 런타임 Player[])와 상대 팀 로스터만 받아 "오늘 이 팀은
 * 어떤 무기를 가졌나"를 숫자로 요약한다. 평가만 한다 — 뎁스차트/로테이션/슬라이더는 다음 단계
 * (계획: docs/plan/ai-coach-plan.md).
 *
 * 설계 원칙 (사용자 결정 2026-10-21)
 *  - **외부 데이터를 쓰지 않는다.** 리그 다른 팀, DB, 보정표, 고정 능력치 기준(루브릭) 모두 없음.
 *    입력은 이 경기의 두 팀 선수(약 30명)뿐 — simRunner가 경기 직전에 이미 들고 있는 데이터.
 *  - 스킬마다 원값 척도가 달라(아키타입 합성값 vs 능력치) 직접 비교할 수 없으므로, **이 경기 30명 안의
 *    백분위**로 바꿔 비교한다. "좋은 슈터" = 오늘 코트에 설 선수들 중 상위권 슈터.
 *  - 선수 능력은 엔진 공식으로 잰다: 아키타입은 calculatePlayerArchetypes(), 1옵션은
 *    usageSystem.calculateScoringGravity() — 평가와 엔진 보상이 어긋나지 않게.
 *  - 가볍게: 30명 × 스킬 19종 계산·정렬이 전부(경기당 1ms 미만), 상태·캐시 없음, 순수 함수.
 *  - 단장 성격은 반영하지 않는다(balanced). 성격 보정은 이 결과 위에 얹는다.
 */
import type { Player } from '../../../types.ts';
import { calculatePlayerOvr } from '../../../utils/ovrUtils.ts';
import { calculatePlayerArchetypes, type ArchetypeRatings } from '../../../engine/pbp/archetypeSystem.ts';
import { calculateScoringGravity } from '../../../engine/pbp/usageSystem.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 선수 단위 스킬
// ─────────────────────────────────────────────────────────────────────────────

/** 백분위로 비교하는 선수 스킬 키. 값이 클수록 좋다. */
export const SKILL_KEYS = [
    'value',        // OVR
    'gravity',      // 득점 위협(엔진 옵션 순위 공식, insideOut=5 중립)
    'finishing',    // 림 마무리 (closeShot/layup/dunk)
    'post',         // 포스트 공격 (archetype postScorer)
    'roll',         // 롤 위협 (archetype roller)
    'screen',       // 스크린 (archetype screener)
    'three',        // 3점 (3개 서브존 평균)
    'spacing',      // 스페이싱 (archetype spacer)
    'mid',          // 미드레인지
    'creation',     // 자기 슛 창출 (archetype isoScorer)
    'handling',     // 볼 핸들링/운반 (archetype handler)
    'passing',      // 패스 (passVision/passAcc/passIq 평균)
    'drive',        // 돌파 (archetype driver)
    'athleticism',  // 스피드·민첩
    'perimD',       // 외곽 수비 (archetype perimLock)
    'rimProt',      // 림 보호 (archetype rimProtector)
    'helpD',        // 헬프 수비 IQ
    'rebound',      // 리바운드
    'stamina',      // 체력 총량
] as const;
export type SkillKey = typeof SKILL_KEYS[number];
export type SkillMap = Record<SkillKey, number>;

/** initializer.ts의 LivePlayer.attr 매핑 중 평가에 필요한 부분(정규화 전 원값). */
function toEvalAttr(p: Player): any {
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
    return {
        ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
        threeCorner: p.threeCorner, three45: p.three45, threeTop: p.threeTop,
        layup: p.layup ?? p.ins, dunk: p.dunk ?? p.ins, closeShot: p.closeShot ?? p.ins,
        speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
        stamina: p.stamina, hustle: p.hustle, height: p.height, weight: p.weight,
        handling: p.handling, hands: p.hands, passAcc: p.passAcc, passVision: p.passVision, passIq: p.passIq,
        shotIq: p.shotIq, offConsist: p.offConsist, postPlay: p.postPlay,
        intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal, helpDefIq: p.helpDefIq, reb: p.reb,
    };
}

/** 선수 1명의 원값 스킬(백분위 변환 전). 컨디션은 반영하지 않은 "본래 실력". */
export function computeRawSkills(p: Player): { skills: SkillMap; archetypes: ArchetypeRatings; ovr: number } {
    const attr = toEvalAttr(p);
    const ovr = calculatePlayerOvr(p);
    // archetypesEnabled=true, condition=100 — 피로와 무관한 본래 역할 적합도
    const ar = calculatePlayerArchetypes(attr, 100, true);
    const skills: SkillMap = {
        value: ovr,
        gravity: calculateScoringGravity({ attr, ovr } as any, 5),
        finishing: (attr.closeShot + attr.layup + attr.dunk) / 3,
        post: ar.postScorer,
        roll: ar.roller,
        screen: ar.screener,
        three: attr.threeVal,
        spacing: ar.spacer,
        mid: attr.mid,
        creation: ar.isoScorer,
        handling: ar.handler,
        passing: (attr.passVision + attr.passAcc + attr.passIq) / 3,
        drive: ar.driver,
        athleticism: (attr.speed + attr.agility) / 2,
        perimD: ar.perimLock,
        rimProt: ar.rimProtector,
        helpD: attr.helpDefIq,
        rebound: attr.reb,
        stamina: attr.stamina,
    };
    return { skills, archetypes: ar, ovr };
}

// ─────────────────────────────────────────────────────────────────────────────
// 비교 집단(이 경기 30명) 백분위
// ─────────────────────────────────────────────────────────────────────────────

/** 인사이드 종합 득점력(스킬 백분위 기준): 포스트 / 돌파 마무리 / (빅) 롤 마무리 중 최선 */
function insideComposite(pos: string, pct: SkillMap): number {
    return Math.max(
        pct.post,
        (pct.finishing + pct.drive) / 2,
        isBigPos(pos) ? (pct.roll + pct.finishing) / 2 : 0,
    );
}
/** 외곽 종합 득점력(스킬 백분위 기준): 3점 + 스페이싱 */
function outsideComposite(pct: SkillMap): number {
    return (pct.three + pct.spacing) / 2;
}

/** 값 → 0~100 백분위(동점은 중간 순위). 집단이 비어 있으면 50. */
function percentile(sortedVals: number[], v: number): number {
    const n = sortedVals.length;
    if (n === 0) return 50;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedVals[m] < v) lo = m + 1; else hi = m; }
    let eq = lo;
    while (eq < n && sortedVals[eq] === v) eq++;
    return ((lo + (eq - lo) / 2) / n) * 100;
}

interface PoolEntry { p: Player; skills: SkillMap; ovr: number; pct: SkillMap; insidePct: number; outsidePct: number }

/**
 * 비교 집단 전원의 스킬 원값 → 집단 내 백분위. 인사이드는 "세 가지 중 최댓값"이라 외곽(평균)보다
 * 체계적으로 높게 나오므로, 두 종합값도 집단 안에서 다시 백분위로 맞춘다(둘 다 집단 중간 선수 = 50).
 */
function buildPool(players: Player[]): Map<string, PoolEntry> {
    const raws = players.map(p => { const { skills, ovr } = computeRawSkills(p); return { p, skills, ovr }; });
    const sorted = Object.fromEntries(SKILL_KEYS.map(k => [k, raws.map(r => r.skills[k]).sort((a, b) => a - b)])) as Record<SkillKey, number[]>;
    const withPct = raws.map(r => {
        const pct = Object.fromEntries(SKILL_KEYS.map(k => [k, percentile(sorted[k], r.skills[k])])) as SkillMap;
        return { ...r, pct, inside: insideComposite(r.p.position, pct), outside: outsideComposite(pct) };
    });
    const insideSorted = withPct.map(r => r.inside).sort((a, b) => a - b);
    const outsideSorted = withPct.map(r => r.outside).sort((a, b) => a - b);
    const out = new Map<string, PoolEntry>();
    for (const r of withPct) {
        out.set(String(r.p.id), {
            p: r.p, skills: r.skills, ovr: r.ovr, pct: r.pct,
            insidePct: percentile(insideSorted, r.inside),
            outsidePct: percentile(outsideSorted, r.outside),
        });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 결과 타입
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerRole =
    | 'InsideAnchor'   // 포스트/림 마무리 1옵션급 빅
    | 'RimRunner'      // 롤·마무리 위주 빅
    | 'StretchBig'     // 3점 되는 빅
    | 'Shooter'        // 3점 스페이서
    | 'Creator'        // 자기 슛 창출 + 볼 핸들링
    | 'Playmaker'      // 패스 우선 핸들러
    | 'Slasher'        // 돌파형
    | 'RimProtector'
    | 'PerimeterStopper'
    | 'Rebounder';

export type AnchorType = 'InsideBig' | 'HubBig' | 'Shooter' | 'Creator' | 'InsideWing' | 'Slasher' | 'Balanced';

export interface PlayerEval {
    id: string;
    name: string;
    position: string;
    ovr: number;
    condition: number;       // 0~100, 경기 시작 컨디션
    available: boolean;      // 부상(Injured) 아니면 true
    /** 스킬별 이 경기 30명 중 백분위 0~100 */
    pct: SkillMap;
    roles: PlayerRole[];
    /** 팀 내 득점 옵션 순위(가용 선수 기준, 1=에이스). 불가용이면 null */
    optionRank: number | null;
    /** 득점 위협 원값(엔진 gravity, insideOut=5) — 백분위는 상위권이 압축되므로 1·2옵션 격차는 원값 비율로 잰다 */
    gravityRaw: number;
    /** 인사이드/외곽 종합 득점력 이 경기 30명 중 백분위 0~100 */
    insidePct: number;
    outsidePct: number;
}

/**
 * 팀 단위 지표(offense/defense)는 선수 백분위(이 경기 30명 기준)의 가중 평균·최댓값(0~100).
 * 같은 팀이라도 상대가 바뀌면 값이 달라진다 — "오늘 상대 대비 우리 무기"를 뜻하기 때문.
 */
export interface TeamProfile {
    teamId: string;
    players: PlayerEval[];             // OVR 내림차순(가용 우선)
    availableCount: number;
    injuredIds: string[];
    /** 출전 시간 비중 가정용 핵심 로테이션(가용 OVR 상위 최대 9명) */
    coreIds: string[];
    positionCounts: Record<'PG' | 'SG' | 'SF' | 'PF' | 'C', number>;  // 가용 선수 고유 포지션 수

    anchor: {
        id: string; name: string; type: AnchorType;
        /** 이 경기 30명 중 득점 위협 백분위 */
        gravityPct: number;
        /** (1옵션 − 2옵션) / 1옵션, gravity 원값 기준 — 클수록 1인 의존 */
        gapToSecond: number;
    } | null;
    /** 'heliocentric'(1인 에이스) / 'duo'(원투펀치) / 'committee'(분산) */
    usageShape: 'heliocentric' | 'duo' | 'committee';

    offense: {
        /** -1(완전 외곽) ~ +1(완전 인사이드) */
        insideLean: number;
        insideThreat: number;
        outsideThreat: number;
        postThreat: number;
        rimPressure: number;
        spacing: number;
        three: number;
        mid: number;
        creation: number;
        playmaking: number;
        /** 핸들러×롤/스크린 조합 적합도 */
        pnrFit: number;
        transition: number;
        offRebound: number;
    };
    defense: {
        perimeter: number;
        rimProtection: number;
        help: number;
        rebounding: number;
        /** 외곽 수비 균일도 — 스위치 수비 가능성 */
        switchability: number;
    };
    /** 뎁스 = 내 주전과 내 벤치의 OVR 차이(팀 내부 비교). 로테이션 단계의 "주전을 얼마나 오래 쓸지" 입력 */
    depth: {
        starterOvr: number;     // 가용 OVR 상위 5명 평균
        benchOvr: number;       // 6~8번째 평균
        gap: number;            // starterOvr − benchOvr (TOP_HEAVY 판정용)
    };
    /**
     * 팀 무기 목록 — 핵심 로테이션(가용 OVR 상위 9명) 중 카테고리별 최고 선수와, 이 경기 30명 중
     * 백분위 WEAPON_PCT 이상인 선수 수. 전술 단계는 "어떤 무기가 있고 그중 무엇이 가장 강한가"로 판단한다.
     */
    weapons: Record<WeaponKey, { best: { id: string; name: string; pct: number } | null; count: number }>;
    conditioning: {
        stamina: number;        // 핵심 로테이션 체력 백분위 가중 평균
        avgCondition: number;   // 핵심 로테이션 평균 컨디션(0~100 원값)
    };
    /** 구성상 약점/위험 코드 */
    flags: RosterFlag[];
    /** 사람이 읽는 요약(디버그/향후 단장 코멘트용) */
    notes: string[];
}

export type WeaponKey =
    | 'post'              // 포스트 스코어러
    | 'roller'            // 롤·림 마무리 빅
    | 'shooter'           // 외곽 슈터(3점+스페이싱)
    | 'creator'           // 자기 슛 창출 + 핸들링
    | 'playmaker'         // 패스 + 핸들링
    | 'slasher'           // 돌파 + 마무리
    | 'rimProtector'
    | 'perimeterStopper'
    | 'rebounder';

export type RosterFlag =
    | 'NO_PG'               // 가용 PG 0명
    | 'NO_C'                // 가용 C 0명
    | 'NO_HANDLER'          // 핵심 로테이션에 핸들링 60백분위 이상 없음
    | 'POOR_SPACING'        // 주전 3점 백분위 평균 35 미만
    | 'NO_RIM_PROTECTOR'    // 핵심 로테이션에 림 보호 65백분위 이상 없음
    | 'TOP_HEAVY'           // 주전 평균 OVR − 벤치 평균 OVR ≥ 8: 전력이 주전에 몰림(벤치 인원/수준과 별개)
    | 'SHORT_ROSTER'        // 가용 8명 미만
    | 'INJURY_HIT'          // 핵심(상위 5) 중 부상자
    | 'LOW_CONDITION';      // 핵심 로테이션 평균 컨디션 85 미만

// ─────────────────────────────────────────────────────────────────────────────
// 상수 (근거: 주석)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 팀 지표 가중 평균용 로테이션 순번 가중치(가용 OVR 순 1~9번째). 주전 5명이 실제 출전시간의
 * 대부분을 차지하고 6~8번째가 벤치 핵심, 9번째는 가비지/부상 대체 수준이라는 일반적 분배를 반영.
 */
const ROTATION_WEIGHTS = [1, 1, 1, 1, 1, 0.6, 0.5, 0.4, 0.2];

/** 역할 태그 임계값(이 경기 30명 중 백분위) */
const ROLE_PCT = 75;

/** 에이스 유형: 1·2위 공격 축 점수 차이가 이 미만이면 다재다능형 */
const ANCHOR_BALANCED_MARGIN = 4;

/** 1·2옵션(또는 2·3옵션) gravity 원값 격차가 이 비율 이상이면 그 지점에서 "끊긴" 것으로 본다 */
const USAGE_GAP_HELIO = 0.20;   // 1옵션이 2옵션보다 20%+ 높으면 1인 에이스
const USAGE_GAP_DUO = 0.12;     // 2옵션이 3옵션보다 12%+ 높으면 원투펀치

/** 공격 성향 계산 시 득점 위협 가중 지수 — 2면 gravity 1.2배 선수가 슛 비중 약 1.44배 */
const USAGE_EXP = 2;

/**
 * 주전(1~5) − 벤치(6~8) 평균 OVR 격차가 이 이상이면 TOP_HEAVY. 레전드 리그 60팀에서 격차 중앙값 6.6,
 * 최대 8.2(피닉스) — 현역 리그에서 재확인 필요.
 */
const TOP_HEAVY_OVR_GAP = 8;

/** 무기로 셀 기준 — 이 경기 30명 중 상위 20%(약 6위 이내) */
const WEAPON_PCT = 80;

/** 카테고리별 무기 점수(이 경기 30명 중 백분위). roller는 빅만 */
const WEAPON_SCORE: Record<WeaponKey, (e: PlayerEval) => number> = {
    post: e => e.pct.post,
    roller: e => isBigPos(e.position) ? (e.pct.roll + e.pct.finishing) / 2 : 0,
    shooter: e => e.outsidePct,
    creator: e => (e.pct.creation + e.pct.handling) / 2,
    playmaker: e => (e.pct.passing + e.pct.handling) / 2,
    slasher: e => (e.pct.drive + e.pct.finishing) / 2,
    rimProtector: e => e.pct.rimProt,
    perimeterStopper: e => e.pct.perimD,
    rebounder: e => e.pct.rebound,
};

/** insideLean = (인사이드 위협 − 외곽 위협) / LEAN_SCALE — 백분위 35점 차이면 ±1 포화 */
const LEAN_SCALE = 35;

// ─────────────────────────────────────────────────────────────────────────────
// 평가
// ─────────────────────────────────────────────────────────────────────────────

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isBigPos = (pos: string) => pos === 'C' || pos === 'PF';

function assignRoles(pos: string, pct: SkillMap): PlayerRole[] {
    const roles: PlayerRole[] = [];
    const big = isBigPos(pos);
    if (big && pct.post >= 80 && pct.finishing >= 75) roles.push('InsideAnchor');
    if (big && pct.roll >= ROLE_PCT && pct.three < 50) roles.push('RimRunner');
    if (big && pct.three >= 60) roles.push('StretchBig');
    if (pct.spacing >= ROLE_PCT && pct.three >= ROLE_PCT) roles.push('Shooter');
    if (pct.creation >= ROLE_PCT && pct.handling >= 60) roles.push('Creator');
    if (pct.passing >= ROLE_PCT && pct.handling >= ROLE_PCT) roles.push('Playmaker');
    if (pct.drive >= ROLE_PCT && pct.athleticism >= 60) roles.push('Slasher');
    if (pct.rimProt >= ROLE_PCT) roles.push('RimProtector');
    if (pct.perimD >= ROLE_PCT) roles.push('PerimeterStopper');
    if (pct.rebound >= 80) roles.push('Rebounder');
    return roles;
}

/**
 * 에이스 유형 = 그 선수의 "가장 강한 공격 축". 임계값을 순서대로 검사하는 방식은 보정표 백분위에서
 * 레전드가 여러 기준을 동시에 넘어 앞쪽 규칙(슈터/창출)에 몰리므로(2026-10-21 시험), 축별 점수 중
 * 최댓값으로 고른다. 1·2위 축 차이가 ANCHOR_BALANCED_MARGIN 미만이면 다재다능형.
 */
function classifyAnchor(e: PlayerEval): AnchorType {
    const big = isBigPos(e.position);
    const pct = e.pct;
    const axes: [AnchorType, number][] = big
        ? [
            ['InsideBig', e.insidePct],
            ['Shooter', e.outsidePct],
            ['HubBig', pct.passing],
        ]
        : [
            [pct.post >= pct.drive ? 'InsideWing' : 'Slasher', e.insidePct],
            ['Shooter', e.outsidePct],
            ['Creator', (pct.creation + pct.handling) / 2],
        ];
    axes.sort((a, b) => b[1] - a[1]);
    if (axes[0][1] - axes[1][1] < ANCHOR_BALANCED_MARGIN) {
        // 빅이 인사이드와 패스가 비슷하게 최상위면 허브형으로(요키치) — 그 외 근소한 차이는 다재다능형
        const hub = axes.find(a => a[0] === 'HubBig');
        if (big && hub && axes[0][1] - hub[1] < ANCHOR_BALANCED_MARGIN && hub[1] >= 85) return 'HubBig';
        return 'Balanced';
    }
    return axes[0][0];
}

/** 가중 평균: 핵심 로테이션 순서대로 ROTATION_WEIGHTS 적용 */
function weighted(core: PlayerEval[], f: (p: PlayerEval) => number): number {
    let s = 0, w = 0;
    core.forEach((p, i) => { const wi = ROTATION_WEIGHTS[i] ?? 0; s += f(p) * wi; w += wi; });
    return w > 0 ? s / w : 0;
}

/** 상위 n명 중 최댓값(핵심 로테이션 앞쪽 n명) */
const topOf = (core: PlayerEval[], n: number, f: (p: PlayerEval) => number) =>
    core.slice(0, n).reduce((m, p) => Math.max(m, f(p)), 0);

/** 상위 n명 중 f 기준 상위 k개의 평균 */
function bestK(core: PlayerEval[], n: number, k: number, f: (p: PlayerEval) => number): number {
    const vals = core.slice(0, n).map(f).sort((a, b) => b - a).slice(0, k);
    return avg(vals);
}

/**
 * 한 팀 평가. 입력은 이 팀 로스터와 상대 팀 로스터(이 경기 출전 후보 약 30명)뿐이다.
 * opponentRoster를 생략하면 자기 팀 15명만으로 비교 집단을 만든다(팀 내부 상대 비교).
 */
export function evaluateTeam(teamId: string, roster: Player[], opponentRoster: Player[] = []): TeamProfile {
    const pool = buildPool([...roster, ...opponentRoster]);
    const evals: PlayerEval[] = roster.map(p => {
        const { skills, ovr, pct, insidePct, outsidePct } = pool.get(String(p.id))!;
        return {
            gravityRaw: skills.gravity,
            insidePct,
            outsidePct,
            id: String(p.id),
            name: p.name,
            position: p.position,
            ovr,
            condition: p.condition ?? 100,
            available: p.health !== 'Injured',
            pct,
            roles: assignRoles(p.position, pct),
            optionRank: null,
        };
    });
    // 가용 우선, OVR 내림차순, 동점은 id 오름차순(결정론적)
    evals.sort((a, b) => (Number(b.available) - Number(a.available)) || (b.ovr - a.ovr) || a.id.localeCompare(b.id));

    const available = evals.filter(p => p.available);
    const core = available.slice(0, ROTATION_WEIGHTS.length);
    [...available]
        .sort((a, b) => (b.pct.gravity - a.pct.gravity) || a.id.localeCompare(b.id))
        .forEach((p, i) => { p.optionRank = i + 1; });

    const positionCounts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const p of available) if (p.position in positionCounts) positionCounts[p.position as keyof typeof positionCounts]++;

    // ── 에이스 ──
    // 에이스는 핵심 로테이션(주전권) 안의 최고 gravity — 벤치 끝 선수가 특이 스탯으로 뽑히지 않게
    const byGravity = [...core.slice(0, 7)].sort((a, b) => (b.gravityRaw - a.gravityRaw) || a.id.localeCompare(b.id));
    const ace = byGravity[0];
    const second = byGravity[1];
    const third = byGravity[2];
    // 원값 비율 격차: (1옵션 − 2옵션) / 1옵션
    const gap12 = ace && second && ace.gravityRaw > 0 ? (ace.gravityRaw - second.gravityRaw) / ace.gravityRaw : 0;
    const gap23 = second && third && second.gravityRaw > 0 ? (second.gravityRaw - third.gravityRaw) / second.gravityRaw : 0;
    const anchor = ace ? {
        id: ace.id, name: ace.name, type: classifyAnchor(ace),
        gravityPct: ace.pct.gravity, gapToSecond: gap12,
    } : null;
    const usageShape: TeamProfile['usageShape'] =
        gap12 >= USAGE_GAP_HELIO ? 'heliocentric' : (gap23 >= USAGE_GAP_DUO ? 'duo' : 'committee');

    // ── 공격 ──
    const postThreat = topOf(core, 7, p => p.pct.post);
    const rimPressure = weighted(core, p => (p.pct.finishing + p.pct.drive) / 2);
    const spacing = weighted(core, p => p.pct.spacing);
    const three = weighted(core, p => p.pct.three);
    const mid = weighted(core, p => p.pct.mid);
    const creation = bestK(core, 7, 2, p => p.pct.creation);
    const playmaking = bestK(core, 7, 2, p => (p.pct.passing + p.pct.handling) / 2);
    const bestHandler = topOf(core, 7, p => p.pct.handling);
    const bestScreen = topOf(core, 7, p => isBigPos(p.position) ? Math.max(p.pct.roll, p.pct.screen) : 0);
    const pnrFit = Math.sqrt(bestHandler * bestScreen);   // 둘 다 있어야 높음(기하평균)
    const transition = weighted(core, p => (p.pct.athleticism * 0.6 + p.pct.stamina * 0.4));
    const offRebound = bestK(core, 7, 2, p => p.pct.rebound);

    // 인사이드/외곽 위협 = "실제로 슛을 쏠 선수들"의 구역별 실력. 각 선수 기여를 출전 비중(ROTATION_WEIGHTS)
    // × 득점 위협(gravity 원값)^USAGE_EXP로 가중 — 슈터가 여럿이어도 1옵션 빅이 슛을 가장 많이 쏘면 인사이드로.
    const usageW = core.map((p, i) => (ROTATION_WEIGHTS[i] ?? 0) * Math.pow(Math.max(1, p.gravityRaw), USAGE_EXP));
    const usageSum = usageW.reduce((a, b) => a + b, 0) || 1;
    const byUsage = (f: (p: PlayerEval) => number) => core.reduce((s, p, i) => s + f(p) * usageW[i], 0) / usageSum;
    const insideSkill = (p: PlayerEval) => p.insidePct;
    const outsideSkill = (p: PlayerEval) => p.outsidePct;
    // 주무기(상위 2명, 에이스 대비 gravity 비율로 할인) 60% + 사용률 가중 평균 40% — 평균만 쓰면
    // 리그 최고 포스트 1명이 슈터 4명 평균에 희석된다(DEN 샤크 사례).
    const aceGravity = Math.max(1, ...core.slice(0, 7).map(p => p.gravityRaw));
    const weapon = (f: (p: PlayerEval) => number) => bestK(core, 7, 2, p => f(p) * Math.min(1, p.gravityRaw / aceGravity));
    const insideThreat = weapon(insideSkill) * 0.6 + byUsage(insideSkill) * 0.4;
    const outsideThreat = weapon(outsideSkill) * 0.6 + byUsage(outsideSkill) * 0.4;
    // 두 위협 모두 같은 분포(보정표 종합 백분위) 위의 값이라 직접 뺄 수 있다
    const insideLean = clamp((insideThreat - outsideThreat) / LEAN_SCALE, -1, 1);

    // ── 수비 ──
    const perimeter = weighted(core, p => p.pct.perimD);
    const rimProtection = topOf(core, 7, p => p.pct.rimProt) * 0.7 + weighted(core, p => p.pct.rimProt) * 0.3;
    const help = weighted(core, p => p.pct.helpD);
    const rebounding = weighted(core, p => p.pct.rebound);
    const starterPerim = core.slice(0, 5).map(p => p.pct.perimD);
    const switchability = starterPerim.length ? clamp(Math.min(...starterPerim) * 0.6 + avg(starterPerim) * 0.4, 0, 100) : 0;

    // ── 뎁스/체력 ──
    const starterOvr = avg(core.slice(0, 5).map(p => p.ovr));
    const benchSlice = core.slice(5, 8);
    // 벤치가 비어 있으면(가용 5명 이하) 0으로 — SHORT_ROSTER가 따로 잡는다
    const benchOvr = benchSlice.length ? avg(benchSlice.map(p => p.ovr)) : 0;
    const depthGap = benchSlice.length ? starterOvr - benchOvr : 0;

    // ── 무기 목록 ──
    const weapons = Object.fromEntries((Object.keys(WEAPON_SCORE) as WeaponKey[]).map(k => {
        const scored = core.map(e => ({ e, v: WEAPON_SCORE[k](e) })).sort((a, b) => (b.v - a.v) || a.e.id.localeCompare(b.e.id));
        const top = scored[0];
        return [k, {
            best: top && top.v > 0 ? { id: top.e.id, name: top.e.name, pct: top.v } : null,
            count: scored.filter(x => x.v >= WEAPON_PCT).length,
        }];
    })) as TeamProfile['weapons'];

    const stamina = weighted(core, p => p.pct.stamina);
    const avgCondition = avg(core.slice(0, 8).map(p => p.condition));

    // ── 플래그 ──
    const flags: RosterFlag[] = [];
    if (positionCounts.PG === 0) flags.push('NO_PG');
    if (positionCounts.C === 0) flags.push('NO_C');
    if (bestHandler < 60) flags.push('NO_HANDLER');
    if (avg(core.slice(0, 5).map(p => p.pct.three)) < 35) flags.push('POOR_SPACING');
    if (topOf(core, 7, p => p.pct.rimProt) < 65) flags.push('NO_RIM_PROTECTOR');
    if (depthGap >= TOP_HEAVY_OVR_GAP) flags.push('TOP_HEAVY');
    if (available.length < 8) flags.push('SHORT_ROSTER');
    const top5ByOvr = [...evals].sort((a, b) => (b.ovr - a.ovr) || a.id.localeCompare(b.id)).slice(0, 5);
    if (top5ByOvr.some(p => !p.available)) flags.push('INJURY_HIT');
    if (avgCondition < 85) flags.push('LOW_CONDITION');

    const r = (x: number) => Math.round(x);
    const notes: string[] = [];
    if (anchor) {
        const typeKo: Record<AnchorType, string> = { InsideBig: '인사이드 빅', HubBig: '플레이메이킹 빅', Shooter: '슈터', Creator: '볼 핸들러 스코어러', InsideWing: '인사이드 윙', Slasher: '돌파형', Balanced: '다재다능형' };
        const shapeKo = { heliocentric: '1인 에이스 체제', duo: '원투펀치 체제', committee: '분산 공격 체제' }[usageShape];
        notes.push(`1옵션 ${anchor.name}(${typeKo[anchor.type]}, 이 경기 득점 위협 ${r(anchor.gravityPct)}백분위) — ${shapeKo}`);
    }
    notes.push(`공격 성향 ${insideLean >= 0.2 ? '인사이드' : insideLean <= -0.2 ? '외곽' : '균형'} (${insideLean.toFixed(2)}; 인사이드 ${r(insideThreat)} / 외곽 ${r(outsideThreat)})`);
    notes.push(`PnR ${r(pnrFit)} · 트랜지션 ${r(transition)} · 외곽 수비 ${r(perimeter)} · 림 보호 ${r(rimProtection)} · 주전/벤치 OVR ${starterOvr.toFixed(1)}/${benchOvr.toFixed(1)}`);
    const weaponKo: Record<WeaponKey, string> = { post: '포스트', roller: '롤맨', shooter: '슈터', creator: '창출', playmaker: '플레이메이커', slasher: '돌파', rimProtector: '림보호', perimeterStopper: '외곽수비', rebounder: '리바운드' };
    notes.push('무기: ' + (Object.keys(weapons) as WeaponKey[])
        .filter(k => weapons[k].count > 0)
        .map(k => `${weaponKo[k]} ${weapons[k].count}명(최고 ${weapons[k].best!.name} ${r(weapons[k].best!.pct)})`).join(', '));

    return {
        teamId,
        players: evals,
        availableCount: available.length,
        injuredIds: evals.filter(p => !p.available).map(p => p.id),
        coreIds: core.map(p => p.id),
        positionCounts,
        anchor,
        usageShape,
        offense: { insideLean, insideThreat, outsideThreat, postThreat, rimPressure, spacing, three, mid, creation, playmaking, pnrFit, transition, offRebound },
        defense: { perimeter, rimProtection, help, rebounding, switchability },
        depth: { starterOvr, benchOvr, gap: depthGap },
        weapons,
        conditioning: { stamina, avgCondition },
        flags,
        notes,
    };
}
