/**
 * aiCoachPlan.ts — AI 감독 C7: 경기 직전 AI 팀의 뎁스차트·로테이션을 정하는 진입점 (서버 전용, 계획: docs/plan/ai-coach-plan.md)
 *
 * simRunner가 경기 직전에 AI 팀마다 한 번 부른다. 결과는 **그 경기에서만** 쓰고 저장하지 않는다(사용자 확정 2026-10-22: AI 전술은
 * 저장·표시하지 않음 → room_members 쓰기·실시간 전송 0). 입력은 우리 팀 로스터뿐(상대 미반영).
 *
 * 단계적 폴백 (사용자 확정 2026-10-22 — "생성기를 기본으로, 주전 혹사 틀 + 엔진 대체 레이어를 안전망으로"):
 *   1) builder   : buildLineup + buildRotation (A/B 시뮬 +0.94점/경기)
 *   2) overwork  : 새 라인업 + 주전 36분 / 벤치 12분 틀 (사용자 자동 설정 "주전 혹사"와 같은 규칙, utils/rotationAllocation.ts 미러)
 *                  — 부상·탈진 대체는 엔진이 이미 담당(rotationSuccession / 탈진 기준 동적화)
 *   3) auto      : 기존 generateAutoTactics (OVR 순 뎁스 + 고정 틀)
 *   null         : 호출자가 기존 repairAiTactics 경로로 처리
 * 각 단계 결과는 validatePlan으로 검사한다(예외·분당 5명 미달·선발 비어 있음·부상자 출전 등) — 통과하지 못하면 다음 단계로.
 *
 * 슬라이더는 저장된 값(현재 AI 팀은 중간값 고정)을 그대로 쓴다 — 전술 슬라이더 생성(공격 전술, C4)은 아직 없음.
 */
import type { Team, Player } from '../../../types.ts';
import type { DepthChart, GameTactics } from '../../../types/tactics.ts';
import { DEFAULT_SLIDERS } from '../../config/tacticPresets.ts';
import { generateAutoTactics } from '../tacticGenerator.ts';
import { buildLineup, type LineupResult } from './lineupBuilder.ts';
import { buildRotation } from './rotationBuilder.ts';

export type AiCoachSource = 'builder' | 'overwork' | 'auto';

export interface AiCoachPlan {
    /** 그 경기에 쓸 전술(슬라이더는 저장된 값 유지, starters·depthChart·rotationMap은 새로 정함) */
    tactics: GameTactics;
    depthChart: DepthChart;
    source: AiCoachSource;
}

export interface AiCoachResult {
    /** 모든 단계가 실패하면 null — 호출자는 기존 repairAiTactics 경로를 쓴다 */
    plan: AiCoachPlan | null;
    /** 앞 단계가 실패한 이유(폴백이 일어났을 때만 채워짐) — 로그용 */
    notes: string[];
}

const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/**
 * 주전 36분 / 벤치 12분 틀 — utils/rotationAllocation.ts computeRotationMap(chart, 'Overwork', roster)의 서버 미러.
 * (서버 Docker는 server/src만 복사하므로 클라이언트 utils를 import할 수 없다.) 규칙을 바꾸면 양쪽을 같이 고칠 것.
 * 벤치가 비어 있으면 그 구간은 주전이 이어서 뛴다. 분 번호는 1-based 구간(1~12분 = 0~11 인덱스).
 */
export function overworkRotation(chart: DepthChart, rosterIds: string[]): Record<string, boolean[]> {
    const map: Record<string, boolean[]> = Object.fromEntries(rosterIds.map(id => [id, Array(48).fill(false)]));
    const fill = (id: string, s: number, e: number) => {
        if (!map[id]) map[id] = Array(48).fill(false);
        for (let i = s - 1; i < e; i++) map[id][i] = true;
    };
    for (const pos of SLOTS) {
        const [sid, bid] = chart[pos];
        if (sid) { fill(sid, 1, 12); fill(sid, 19, 24); fill(sid, 25, 36); fill(sid, 43, 48); }
        if (bid) { fill(bid, 13, 18); fill(bid, 37, 42); }
        else if (sid) { fill(sid, 13, 18); fill(sid, 37, 42); }
    }
    return map;
}

/**
 * 계획 검사 — 문제가 있으면 사유 문자열, 없으면 null.
 *  - 가용(부상 아님) 선수가 5명 이상이면: 선발 5명이 채워지고 서로 다르며 모두 가용, 매 분 예정 인원이 5명 이상
 *  - 가용이 5명 미만이면: 매 분 예정 인원이 가용 인원 이상(있는 사람은 모두 뜀)
 *  - 부상 선수는 어느 분에도 출전 예정이 아님
 *  - 뎁스차트·선발에 로스터에 없는 id가 없음
 */
export function validatePlan(roster: Player[], tactics: GameTactics): string | null {
    const ids = new Set(roster.map(p => String(p.id)));
    const healthy = new Set(roster.filter(p => p.health !== 'Injured').map(p => String(p.id)));
    const need = Math.min(5, healthy.size);

    const starters = SLOTS.map(s => tactics.starters?.[s]).filter(Boolean) as string[];
    if (healthy.size >= 5) {
        if (starters.length !== 5 || new Set(starters).size !== 5) return `선발 ${starters.length}명(중복 포함)`;
        if (starters.some(id => !healthy.has(id))) return '선발에 부상/미등록 선수';
    }
    for (const s of SLOTS) for (const id of tactics.depthChart?.[s] ?? []) if (id && !ids.has(id)) return `뎁스차트에 로스터 밖 선수 ${id}`;

    const map = tactics.rotationMap ?? {};
    for (let m = 0; m < 48; m++) {
        let n = 0;
        for (const [id, v] of Object.entries(map)) {
            if (!v?.[m]) continue;
            if (!ids.has(id)) continue;
            if (!healthy.has(id)) return `${m}분에 부상 선수 출전 예정`;
            n++;
        }
        if (n < need) return `${m}분 예정 ${n}명 (필요 ${need}명)`;
    }
    return null;
}

function compose(saved: GameTactics | null | undefined, lineup: { starters: Record<string, string>; depthChart: DepthChart }, rotationMap: Record<string, boolean[]>): GameTactics {
    return {
        ...(saved ?? {}),
        sliders: { ...DEFAULT_SLIDERS, ...(saved?.sliders ?? {}) },
        starters: lineup.starters as GameTactics['starters'],
        minutesLimits: saved?.minutesLimits ?? {},
        rotationMap,
        depthChart: lineup.depthChart,
    } as GameTactics;
}

/**
 * 경기 직전 AI 팀 계획. team.roster는 부상·컨디션이 반영된 런타임 선수(simRunner가 buildTeamForSim으로 만든 것).
 * saved는 room_members.tactics(없으면 null). 모든 단계가 실패하면 plan이 null — 호출자는 기존 경로를 쓴다.
 */
export function planAiTeam(team: Team, saved: GameTactics | null | undefined): AiCoachResult {
    const roster = team.roster as Player[];
    const rosterIds = roster.map(p => String(p.id));
    const notes: string[] = [];

    let lineup: LineupResult | null = null;
    try {
        lineup = buildLineup(roster);
        const rot = buildRotation(roster, lineup);
        const tactics = compose(saved, lineup, rot.rotationMap);
        const problem = validatePlan(roster, tactics);
        if (!problem) return { plan: { tactics, depthChart: lineup.depthChart, source: 'builder' }, notes };
        notes.push(`생성기 결과 이상: ${problem}`);
    } catch (e) {
        notes.push(`생성기 예외: ${(e as Error)?.message ?? e}`);
    }

    if (lineup) {
        try {
            const tactics = compose(saved, lineup, overworkRotation(lineup.depthChart, rosterIds));
            const problem = validatePlan(roster, tactics);
            if (!problem) return { plan: { tactics, depthChart: lineup.depthChart, source: 'overwork' }, notes };
            notes.push(`주전 혹사 틀 이상: ${problem}`);
        } catch (e) {
            notes.push(`주전 혹사 틀 예외: ${(e as Error)?.message ?? e}`);
        }
    }

    try {
        const g = generateAutoTactics(team, undefined, false);
        const tactics = compose(saved, { starters: g.starters as Record<string, string>, depthChart: g.depthChart as DepthChart }, g.rotationMap);
        const problem = validatePlan(roster, tactics);
        if (!problem) return { plan: { tactics, depthChart: g.depthChart as DepthChart, source: 'auto' }, notes };
        notes.push(`기존 자동 전술 이상: ${problem}`);
    } catch (e) {
        notes.push(`기존 자동 전술 예외: ${(e as Error)?.message ?? e}`);
    }
    return { plan: null, notes };
}
