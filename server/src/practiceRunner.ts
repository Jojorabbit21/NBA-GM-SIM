/**
 * practiceRunner.ts — 트레이닝 세션(휴식일 연습 경기) 1회 실행 [2026-10-29]
 *
 * 설계: docs/plan/practice-scrimmage-plan.md
 *   - 우리 팀: 저장된 전술(room_members) 위에 고른 뎁스/팀 전술 프리셋을 적용. 현재 체력(따라잡기 회복 반영)으로 시작.
 *   - 상대: league_teams 로스터만 복사(부상 제외, 체력 100). 슬라이더 = 공격/수비 프리셋, 뎁스·로테이션 = AI 감독(planAiTeam).
 *     상대 유저의 저장 전술·뎁스는 쓰지 않는다.
 *   - 48분, 연장·부상·출장정지 없음. 결과는 games/game_pbp/통계에 쓰지 않고 practice_games에만 저장(apply_practice_result).
 *   - 체력: 엔진이 계산한 경기 후 체력은 버리고 PRACTICE_FATIGUE_K × 출전 분 / 48 을 감소량으로 반영 — 엔진은 경기 중 회복 때문에
 *     지친 팀이 오히려 회복되는 결과를 낸다(2026-10-29 하네스 확인).
 *
 * simRunner.runSimulation의 입력 준비(로더·따라잡기·상태 오버레이·정규화·체력 설정)와 같은 모듈을 쓴다 — 실경기 쪽을 바꾸면 여기도 같이 볼 것.
 * 워커 스레드에서 실행된다(simWorker 'practice' 메시지 ← simWorkerPool.runPracticeInWorker). 풀은 실경기 큐가 비었을 때만 트레이닝을 꺼낸다.
 */
import { supabase } from './supabaseAdmin.ts';
import { isGlobalAdmin } from './auth.ts';
import { loadRoomPlayers } from './playerLoader.ts';
import { recoverPlayersThrough } from './fatigueRecovery.ts';
import { addDays } from './shared/multi/fatigueRecovery.ts';
import { runFullGameSimulation } from './shared/engine/pbp/main.ts';
import { buildTeamForSim } from './shared/dataMapper.ts';
import { planAiTeam } from './shared/game/tactics/aiCoach/aiCoachPlan.ts';
import { generateAutoTactics } from './shared/game/tactics/tacticGenerator.ts';
import { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';
import { calculatePlayerOvr } from './shared/utils/ovrUtils.ts';
import { DEFAULT_SLIDERS } from './shared/game/config/tacticPresets.ts';
import { DEFAULT_SIM_SETTINGS, resolveMultiFatigueSettings } from './shared/types/simSettings.ts';
import { stampBoxOvr } from './boxOvr.ts';
import { computeQuarterScoresFromEvents } from './liveGameView.ts';

/** 출전 48분당 체력 감소량(2026-10-29 사용자 확정) */
export const PRACTICE_FATIGUE_K = 20;

// 상대 전술 프리셋 — 클라 services/multi/trainingPresets.ts와 같은 값(공격 = AI 감독 C4 BASE/SPECIAL_PRESETS). 바꿀 땐 같이.
const OFFENSE_PRESETS: Record<string, Record<string, number> | null> = {
    AUTO: null,
    POST:        { pace: 4, ballMovement: 4, offReb: 9, insideOut: 2, pnrFreq: 4, shot_3pt: 5, shot_mid: 5, shot_rim: 8 },
    ROLL:        { pace: 5, ballMovement: 5, offReb: 6, insideOut: 4, pnrFreq: 8, shot_3pt: 5, shot_mid: 4, shot_rim: 7 },
    HANDLER:     { pace: 5, ballMovement: 4, offReb: 6, insideOut: 5, pnrFreq: 7, shot_3pt: 6, shot_mid: 5, shot_rim: 7 },
    SHOOTER:     { pace: 5, ballMovement: 5, offReb: 5, insideOut: 6, pnrFreq: 5, shot_3pt: 6, shot_mid: 5, shot_rim: 5 },
    SLASHER:     { pace: 7, ballMovement: 5, offReb: 6, insideOut: 3, pnrFreq: 5, shot_3pt: 4, shot_mid: 5, shot_rim: 8 },
    HUB:         { pace: 4, ballMovement: 8, offReb: 6, insideOut: 4, pnrFreq: 4, shot_3pt: 6, shot_mid: 5, shot_rim: 6 },
    PNR_DUO:     { pace: 5, ballMovement: 4, offReb: 5, insideOut: 4, pnrFreq: 9, shot_3pt: 6, shot_mid: 4, shot_rim: 7 },
    TWIN_TOWERS: { pace: 3, ballMovement: 5, offReb: 8, insideOut: 2, pnrFreq: 3, shot_3pt: 3, shot_mid: 5, shot_rim: 8 },
};
const DEFENSE_PRESETS: Record<string, Record<string, number>> = {
    MAN_BASE:     { defIntensity: 5, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 1, zoneUsage: 5, pnrDefense: 1, fullCourtPress: 1 },
    MAN_PRESSURE: { defIntensity: 8, helpDef: 5, switchFreq: 4, defReb: 5, zoneFreq: 1, zoneUsage: 5, pnrDefense: 2, fullCourtPress: 3 },
    SWITCH:       { defIntensity: 6, helpDef: 4, switchFreq: 9, defReb: 6, zoneFreq: 1, zoneUsage: 5, pnrDefense: 1, fullCourtPress: 1 },
    DROP:         { defIntensity: 4, helpDef: 8, switchFreq: 2, defReb: 7, zoneFreq: 1, zoneUsage: 5, pnrDefense: 0, fullCourtPress: 1 },
    ZONE:         { defIntensity: 5, helpDef: 6, switchFreq: 3, defReb: 6, zoneFreq: 9, zoneUsage: 8, pnrDefense: 1, fullCourtPress: 1 },
    FULL_PRESS:   { defIntensity: 7, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 1, zoneUsage: 5, pnrDefense: 2, fullCourtPress: 9 },
};

export interface PracticeRequest {
    roomId: string;
    opponentTeamId: string;
    offensePreset: string;
    defensePreset: string;
    depthPresetSlot: number | null;
    teamPresetSlot: number | null;
}

export type PracticeResult =
    | { ok: true; practiceGameId: string; slot: number }
    | { ok: false; status: number; error: string };

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/** 프리셋/저장 전술에서 현재 로스터에 없는 선수 id 제거(클라 utils/tacticsPrune.pruneTacticsToRoster와 같은 목적) */
function pruneToRoster(tactics: any, depthChart: any, rosterIds: Set<string>) {
    const keep = (id: any) => !!id && rosterIds.has(String(id));
    const starters: Record<string, string> = {};
    for (const pos of POSITIONS) starters[pos] = keep(tactics?.starters?.[pos]) ? tactics.starters[pos] : '';
    const rotationMap = Object.fromEntries(Object.entries(tactics?.rotationMap ?? {}).filter(([id]) => keep(id)));
    const minutesLimits = Object.fromEntries(Object.entries(tactics?.minutesLimits ?? {}).filter(([id]) => keep(id)));
    const dc = depthChart
        ? Object.fromEntries(POSITIONS.map(pos => [pos, (depthChart[pos] ?? []).map((id: any) => (keep(id) ? id : null))]))
        : null;
    return { tactics: { ...tactics, starters, rotationMap, minutesLimits }, depthChart: dc };
}

function teamTotals(box: any[]): Record<string, number> {
    const keys = ['fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta', 'offReb', 'defReb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'techFouls', 'flagrantFouls'];
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = (box ?? []).reduce((s, b) => s + (Number(b?.[k]) || 0), 0);
    return out;
}

export async function runPractice(userId: string, req: PracticeRequest): Promise<PracticeResult> {
    const t0 = Date.now();
    const { roomId, opponentTeamId } = req;
    if (!(req.offensePreset in OFFENSE_PRESETS) || !(req.defensePreset in DEFENSE_PRESETS)) {
        return { ok: false, status: 400, error: 'invalid preset' };
    }

    // ── 1. 호출자 팀 · 가능 여부 ─────────────────────────────────────
    const { data: member } = await supabase
        .from('room_members').select('team_id, tactics, depth_chart')
        .eq('room_id', roomId).eq('user_id', userId).maybeSingle();
    const teamId = member?.team_id as string | undefined;
    if (!teamId) return { ok: false, status: 403, error: 'Forbidden' };
    if (opponentTeamId === teamId) return { ok: false, status: 400, error: 'invalid opponent' };

    // ⚠️ 테스트용: 전역 어드민은 가상 자정 시간대 제한만 건너뛴다(경기일·하루 3회는 그대로) — migrations/add_practice_admin_window_bypass.sql, 정식 오픈 전 제거
    const ignoreWindow = await isGlobalAdmin(userId);
    const { data: status, error: statusErr } = await supabase.rpc('practice_status', { p_room_id: roomId, p_team_id: teamId, p_ignore_window: ignoreWindow });
    if (statusErr) return { ok: false, status: 500, error: statusErr.message };
    if (!status?.available) return { ok: false, status: 409, error: `practice unavailable: ${status?.reason ?? 'unknown'}` };
    const virtualDate: string = status.virtual_date;

    // ── 2. 방·리그·두 팀 로스터 ───────────────────────────────────────
    const { data: room } = await supabase
        .from('rooms').select('tendency_seed, sim_settings, coaching_staff, league_id, season_number')
        .eq('id', roomId).single();
    if (!room) return { ok: false, status: 404, error: 'Room not found' };
    const { data: leagueData } = await supabase
        .from('leagues').select('use_custom_overrides, personal_draft_format')
        .eq('id', room.league_id).maybeSingle();
    const { data: leagueTeams } = await supabase
        .from('league_teams').select('team_slug, team_name, roster')
        .eq('room_id', roomId).in('team_slug', [teamId, opponentTeamId]);
    const myRow = leagueTeams?.find((t: any) => t.team_slug === teamId);
    const oppRow = leagueTeams?.find((t: any) => t.team_slug === opponentTeamId);
    if (!myRow || !oppRow) return { ok: false, status: 404, error: 'Team not found' };

    const myIds: string[] = (myRow.roster ?? []).map(String);
    const oppIds: string[] = (oppRow.roster ?? []).map(String);
    const playerMap = await loadRoomPlayers(roomId, [...myIds, ...oppIds], leagueData as any);

    // ── 3. 우리 팀 체력 따라잡기 + 상태 오버레이 ─────────────────────────
    try {
        await recoverPlayersThrough(roomId, addDays(virtualDate, -1), {
            playerIds: myIds,
            context: { leagueId: room.league_id ?? null, simSettings: room.sim_settings ?? null, league: leagueData as any },
        });
    } catch (e) {
        console.error(`[practice] fatigue catch-up 실패 room=${roomId} team=${teamId}:`, e);
    }
    const { data: stateRows } = await supabase
        .from('room_player_state').select('player_id, condition, health, return_date, season_number')
        .eq('room_id', roomId).in('player_id', [...myIds, ...oppIds]);
    const mySet = new Set(myIds);
    const myState: Record<string, any> = {};
    const oppState: Record<string, any> = {};
    for (const row of (stateRows ?? []) as any[]) {
        const injured = row.health === 'Injured' && (
            (row.return_date != null && row.return_date > virtualDate) ||
            (row.return_date == null && row.season_number === (room as any).season_number));
        if (mySet.has(row.player_id)) {
            myState[row.player_id] = { ...(row.condition != null ? { condition: Number(row.condition) } : {}), ...(injured ? { health: 'Injured' } : {}) };
        } else if (injured) {
            oppState[row.player_id] = { health: 'Injured' };
        }
    }
    const homeTeam = buildTeamForSim(myRow, playerMap, myState);
    const awayTeam = buildTeamForSim(oppRow, playerMap, oppState);
    // 상대: 부상 선수는 로스터에서 빼고, 체력은 100(oppState에 condition을 넣지 않음)
    awayTeam.roster = awayTeam.roster.filter((p: any) => p.health !== 'Injured');

    // ── 4. 우리 팀 전술 = 저장 전술 + 고른 프리셋 ─────────────────────────
    let myTactics: any = member?.tactics ?? null;
    let myDepth: any = member?.depth_chart ?? null;
    const slots = [req.depthPresetSlot, req.teamPresetSlot].filter((s): s is number => s != null);
    if (slots.length > 0) {
        const { data: presets } = await supabase
            .from('room_member_tactic_presets').select('kind, slot, data')
            .eq('room_id', roomId).eq('user_id', userId);
        const find = (kind: string, slot: number | null) => (slot == null ? null : (presets ?? []).find((p: any) => p.kind === kind && p.slot === slot)?.data ?? null);
        const depth = find('depth', req.depthPresetSlot);
        const teamP = find('team', req.teamPresetSlot);
        if ((req.depthPresetSlot != null && !depth) || (req.teamPresetSlot != null && !teamP)) {
            return { ok: false, status: 400, error: 'preset not found' };
        }
        if (depth) {
            myTactics = { ...(myTactics ?? {}), starters: { ...depth.starters }, rotationMap: depth.rotationMap ?? {}, minutesLimits: depth.minutesLimits ?? {} };
            myDepth = depth.depthChart ?? null;
        }
        if (teamP) {
            const { altSliders: _a, clutchSliders: _c, clutchEnabled: _ce, sliderSchedule: _s, tacticSetNames: _n, ...rest } = myTactics ?? {};
            const sliders = { ...DEFAULT_SLIDERS, ...teamP.sliders };
            myTactics = { ...rest, sliders, altSliders: { ...sliders, ...teamP.altSliders } };
            if (teamP.clutchSliders) myTactics.clutchSliders = { ...DEFAULT_SLIDERS, ...teamP.clutchSliders };
            if (teamP.clutchSliders && teamP.clutchEnabled === false) myTactics.clutchEnabled = false;
            if (teamP.sliderSchedule) myTactics.sliderSchedule = teamP.sliderSchedule;
        }
    }
    if (myTactics) {
        const pruned = pruneToRoster(myTactics, myDepth, mySet);
        myTactics = pruned.tactics;
        myDepth = pruned.depthChart;
    } else {
        // 저장 전술이 없는 팀(드물게 신규) — 엔진 자동 전술
        myTactics = generateAutoTactics(homeTeam, undefined, true);
        myDepth = myTactics.depthChart ?? null;
    }

    // ── 5. 상대 전술 = 프리셋 슬라이더 + AI 감독 뎁스·로테이션 ─────────────────
    // 공격 '자동'은 AI 감독 공격 프리셋(C4)이 배포되면 그쪽으로 — 그 전까지는 중립(DEFAULT_SLIDERS) 공격.
    const oppSliders = { ...DEFAULT_SLIDERS, ...(OFFENSE_PRESETS[req.offensePreset] ?? {}), ...DEFENSE_PRESETS[req.defensePreset] };
    const oppBase: any = { sliders: oppSliders, starters: { PG: '', SG: '', SF: '', PF: '', C: '' }, rotationMap: {}, minutesLimits: {} };
    let oppTactics: any;
    let oppDepth: any;
    const { plan } = planAiTeam(awayTeam, oppBase);
    if (plan) {
        oppTactics = { ...plan.tactics, sliders: oppSliders };
        oppDepth = plan.depthChart;
    } else {
        const g = generateAutoTactics(awayTeam, undefined, false);
        oppTactics = { ...g, sliders: oppSliders };
        oppDepth = g.depthChart ?? null;
    }

    // ── 6. 시뮬 ────────────────────────────────────────────────────────
    const simSettings = (room.sim_settings ?? null) as any;
    resolveNormalizationContext(simSettings, [homeTeam, awayTeam], calculatePlayerOvr);
    const fatigue = resolveMultiFatigueSettings(simSettings);
    const engineSimSettings = {
        ...(simSettings ?? DEFAULT_SIM_SETTINGS),
        fatigueB2BMultiplier: fatigue.fatigueB2BMultiplier,
        fatigueDrainMultiplier: fatigue.fatigueDrainMultiplier,
        autoTimeoutAllTeams: true,
        overtimeEnabled: false,
        injuriesEnabled: false,
        suspensionsEnabled: false,
    };
    const result: any = runFullGameSimulation(
        homeTeam, awayTeam, teamId, myTactics, false, false, myDepth, oppDepth,
        room.tendency_seed ?? '', engineSimSettings, (room.coaching_staff ?? null) as any, oppTactics, false,
    );
    const myScore = result.homeScore ?? 0;
    const oppScore = result.awayScore ?? 0;

    // ── 7. 저장 + 체력 반영(한 트랜잭션) ─────────────────────────────────────
    const homeBox = stampBoxOvr(result.homeBox, homeTeam.roster, awayTeam.roster);
    const awayBox = stampBoxOvr(result.awayBox, homeTeam.roster, awayTeam.roster);
    const drains = (result.homeBox ?? [])
        .filter((b: any) => (Number(b?.mp) || 0) > 0)
        .map((b: any) => ({ player_id: String(b.playerId), drain: Math.round(PRACTICE_FATIGUE_K * Number(b.mp) / 48 * 10) / 10 }));
    const row = {
        season_number: (room as any).season_number ?? null,
        opponent_team_id: opponentTeamId,
        offense_preset: req.offensePreset,
        defense_preset: req.defensePreset,
        my_score: myScore,
        opp_score: oppScore,
        my_stats: teamTotals(result.homeBox),
        result: {
            homeTeamId: teamId,
            awayTeamId: opponentTeamId,
            homeScore: myScore,
            awayScore: oppScore,
            homeBox,
            awayBox,
            events: result.pbpLogs ?? [],
            shotEvents: result.pbpShotEvents ?? [],
            rotationData: result.rotationData ?? {},
            boxTimeline: result.boxTimeline ?? [],
            quarterScores: computeQuarterScoresFromEvents(result.pbpLogs ?? []),
            drains,
        },
    };
    const { data: applied, error: applyErr } = await supabase.rpc('apply_practice_result', {
        p_room_id: roomId, p_team_id: teamId, p_row: row, p_drains: drains, p_ignore_window: ignoreWindow,
    });
    if (applyErr) {
        const conflict = /practice unavailable|duplicate key/i.test(applyErr.message);
        return { ok: false, status: conflict ? 409 : 500, error: applyErr.message };
    }
    console.log(`[practice] room=${roomId} ${teamId} ${myScore}-${oppScore} ${opponentTeamId} slot=${applied?.slot} (${Date.now() - t0}ms)`);
    return { ok: true, practiceGameId: String(applied?.id ?? ''), slot: Number(applied?.slot ?? 0) };
}
