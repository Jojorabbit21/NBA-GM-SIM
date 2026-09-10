/**
 * postAllStarGame.ts — 올스타 본경기/라이징스타 챌린지 실제 시뮬레이션.
 *
 * 배경: postAllStarVoteNews.ts는 참가 명단을 "발표"만 했지, 실제로 경기가 열리지는
 * 않았다(docs/simulation/allstar-game-plan.md). 이 파일은 그 마지막 단계 — 키데이트
 * (allStarMainGameDate/allStarRisingStarsDate)에 도달하면 PBP 엔진을 한 번 돌려
 * games/game_pbp에 결과를 기록한다.
 *
 * ⚠️ 로스터는 재계산하지 않는다 — league_allstar_votes.roster(투표 마감일에 이미 저장된
 * 최종 스냅샷, 이 시즌에서 roster IS NOT NULL인 유일한 행)를 그대로 읽어쓴다. 로스터
 * 확정일과 게임 당일 사이(본경기 +7일/라이징스타 +8일)에 트레이드·부상으로 실제
 * league_teams 로스터가 바뀔 수 있는데, 그 시점에 runAllStarSelection()/
 * runRisingStarsSelection()을 다시 돌리면 "발표된 명단과 실제 뛰는 명단이 다른" 혼란스러운
 * 결과가 나온다.
 *
 * 팀 구성은 가상 팀 ID로 구분한다(별도 event_kind 컬럼 없음) — 본경기는
 * EAST-ALLSTAR/WEST-ALLSTAR, 라이징스타전은 RISINGSTARS-A/RISINGSTARS-B. 실제
 * league_teams.team_slug와 절대 겹치지 않아 스탠딩 집계(computeMultiStandingsStats)에서
 * 자동 배제된다. games.is_allstar=true로 표시해 시즌 통산 스탯 RPC 3종
 * (add_is_allstar_to_games.sql)에서도 자동 제외된다.
 *
 * 부상/출장정지는 이 경기에 한해 비활성화한다(전시성 경기, 사용자 확인) — room.sim_settings를
 * 얕은 복사해 injuriesEnabled/suspensionsEnabled만 덮어써 runFullGameSimulation()에 넘긴다.
 * 이미 부상 중인 선수(room_player_state)는 simRunner.ts와 동일하게 그대로 반영한다(이
 * 경기가 새 부상을 만들지 않을 뿐, 기존 부상은 존중).
 *
 * 멱등성: game_id를 `${kind}-${roomId}-${seasonNumber}`로 결정론적으로 만들고, games
 * 테이블 PK(room_id, game_id) 유니크 제약을 락으로 이용한다 — 먼저 INSERT에 성공한
 * 프로세스만 시뮬레이션을 진행하고, 실패(이미 존재)하면 조용히 스킵한다(simRunner.ts의
 * game_sim_claims insert-as-lock과 동일한 원리, 별도 클레임 테이블 없이 games PK로 대체).
 *
 * 호출부: scheduler.ts의 runAllStarGames() — current_virtual_date(room_id)가
 * allStarMainGameDate/allStarRisingStarsDate와 정확히 일치하는 날에만 호출한다.
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+시뮬 오케스트레이션이라 클라 대응물이 없음).
 */
import { supabase } from './supabaseAdmin';
import { runFullGameSimulation } from './shared/engine/pbp/main.ts';
import { buildTeamForSim, mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';
import { calculateOvr } from './shared/utils/ovrUtils.ts';
import { computeQuarterScoresFromEvents } from './liveGameView.ts';
import { generateAutoTactics } from './shared/game/tactics/tacticGenerator.ts';
import { pickTeamMvp } from './shared/leagueEvents.ts';
import type { DepthChart } from './shared/types.ts';

export type AllStarGameKind = 'main' | 'rising_stars';

type RosterPlayerRef = { playerId: string };
type StoredRosterPayload = {
    east?: { starters: RosterPlayerRef[]; reserves: RosterPlayerRef[] };
    west?: { starters: RosterPlayerRef[]; reserves: RosterPlayerRef[] };
    risingStars?: {
        teamA: RosterPlayerRef[]; teamB: RosterPlayerRef[];
        teamAName: string; teamBName: string;
    };
};

// 가상 팀 ID — 실제 league_teams.team_slug와 절대 겹치지 않는 접두어.
const EAST_ALLSTAR_ID = 'EAST-ALLSTAR';
const WEST_ALLSTAR_ID = 'WEST-ALLSTAR';
const RISING_STARS_A_ID = 'RISINGSTARS-A';
const RISING_STARS_B_ID = 'RISINGSTARS-B';

// 방송 시간대 — 정규시즌 게임처럼 팀 연고지 시간대에서 유도할 방법이 없는(가상 팀) 이벤트라
// 고정 프라임타임 슬롯을 쓴다. 라이징스타가 본경기보다 먼저 열리는 실제 올스타 위켄드 순서를
// 반영해 앞선 시간대를 준다.
const GAME_TIME: Record<AllStarGameKind, string> = { rising_stars: '19:00', main: '20:30' };

// [2026-09-09] 올스타/라이징스타 전용 로테이션 — "주전 38분/벤치 10분" 하드코딩(정규시즌 AI팀
// generateAutoTactics()의 기본값, tacticGenerator.ts:172-189)이 아니라 포지션별 배정된 선수
// 전원(보통 2명, 12인 로스터는 일부 포지션 3명까지)이 균등하게(2명이면 24분씩, 3명이면
// 16분씩) 뛰도록 재배정한다. 포지션마다 시작 시점을 서로 다르게 어긋나게(phase offset) 둬서,
// 실제 교체가 5개 포지션이 동시에 통짜로(한 번에 5명) 바뀌는 대신 한 번에 1개 포지션(1~2명)씩만
// 바뀌게 만든다 — 사용자 요청("최대한 많이 교체" + "몇 명씩만 교체") 반영. 정규시즌 AI팀
// 로테이션(tacticGenerator.ts)은 전혀 건드리지 않고, generateAutoTactics()가 계산해준
// depthChart만 재사용해 rotationMap만 이 함수로 교체한다 — 다른 로직(슬라이더 등)에 영향 없음.
const DEPTH_POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const ROTATION_SHIFT_MIN = 8; // 분 단위 교체 주기 — 기존(경기당 2번 통짜 교체)보다 훨씬 잦다.

function buildAllStarRotationMap(depthChart: DepthChart, allRosterIds: string[]): Record<string, boolean[]> {
    const rotationMap: Record<string, boolean[]> = {};
    for (const id of allRosterIds) rotationMap[id] = Array(48).fill(false);

    DEPTH_POSITIONS.forEach((pos, posIdx) => {
        const ids = (depthChart[pos] ?? []).filter((id): id is string => !!id);
        if (ids.length === 0) return;
        if (ids.length === 1) {
            const arr = rotationMap[ids[0]];
            if (arr) arr.fill(true);
            return;
        }

        const phase = posIdx % ROTATION_SHIFT_MIN;
        let cursor = 0;
        let playerIdx = 0;
        if (phase > 0) {
            const arr = rotationMap[ids[0]];
            if (arr) for (let m = 0; m < phase; m++) arr[m] = true;
            cursor = phase;
            playerIdx = 1;
        }
        while (cursor < 48) {
            const segEnd = Math.min(cursor + ROTATION_SHIFT_MIN, 48);
            const arr = rotationMap[ids[playerIdx % ids.length]];
            if (arr) for (let m = cursor; m < segEnd; m++) arr[m] = true;
            cursor = segEnd;
            playerIdx++;
        }
    });

    return rotationMap;
}

// [2026-09-09 버그 수정] scheduled_at을 new Date()(실제 삽입 시각)로 넣었더니, 정규시즌
// 경기들의 scheduled_at(방송 압축 스케줄, leagueScheduleCompressor.ts가 시즌 생성 시점에
// 한 번만 계산해 저장한 값)과 전혀 다른 기준(진짜 "지금")이 섞여 들어갔다. 여러 화면
// (GameDateStrip.tsx의 dateKeys 등)이 날짜 정렬 키로 scheduled_at을 쓰는데, 올스타 경기의
// scheduled_at이 실제로는 몇 주 전/후의 값(정규시즌 압축 스케줄상 그 시점의 "지금")이어야
// 할 걸 말 그대로 "이 함수를 호출한 순간"으로 채워서 정렬 순서가 완전히 뒤틀렸다(예:
// 2/16 경기인데 scheduled_at은 3/8 경기 근처로 찍혀서, 실제로는 몇 주 뒤인 3/8 바로 앞에
// 끼어들어가 버림 — 결과적으로 날짜 스트립에서 2/19~3/7이 통째로 순서 밖으로 밀려나 "생략된
// 것처럼" 보임).
//
// 올스타 브레이크 기간엔 정규시즌 경기가 원래 없어서(generateSeasonSchedule()이 실제 NBA
// 캘린더처럼 이 구간을 비워둠) compressLeagueSchedule()이 이 날짜들에 애초에 실제 시각을
// 배정한 적이 없다 — 그 계산을 다시 돌릴 수 없으므로, 대신 이 날짜 바로 앞/뒤의 정규시즌
// 경기가 이미 가진 scheduled_at 사이를 게임 날짜 비율로 선형 보간한다. 앞/뒤 경기를 못 찾는
// 극단적 예외(시즌 맨 처음/끝에 브레이크가 걸린 경우 등)에만 new Date() 폴백 — 이 경우
// 순서가 다시 틀어질 수 있지만 발생 가능성이 거의 없다.
async function resolveAllStarScheduledAt(roomId: string, virtualDate: string): Promise<string> {
    const [{ data: before }, { data: after }] = await Promise.all([
        supabase.from('games').select('scheduled_at, game_date')
            .eq('room_id', roomId).eq('is_allstar', false).not('scheduled_at', 'is', null)
            .lt('game_date', virtualDate).order('game_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('games').select('scheduled_at, game_date')
            .eq('room_id', roomId).eq('is_allstar', false).not('scheduled_at', 'is', null)
            .gt('game_date', virtualDate).order('game_date', { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (!before?.scheduled_at || !after?.scheduled_at) return new Date().toISOString();

    const beforeMs = new Date(before.scheduled_at).getTime();
    const afterMs = new Date(after.scheduled_at).getTime();
    const beforeDateMs = new Date(before.game_date).getTime();
    const afterDateMs = new Date(after.game_date).getTime();
    const targetDateMs = new Date(virtualDate).getTime();
    if (afterDateMs <= beforeDateMs || afterMs <= beforeMs) return new Date().toISOString();

    const frac = (targetDateMs - beforeDateMs) / (afterDateMs - beforeDateMs);
    return new Date(beforeMs + frac * (afterMs - beforeMs)).toISOString();
}

export async function computeAndRunAllStarGame(
    roomId: string, leagueId: string, virtualDate: string, kind: AllStarGameKind,
): Promise<void> {
    const { data: room } = await supabase
        .from('rooms')
        .select('roster_state, tendency_seed, sim_settings, coaching_staff, season_number, season')
        .eq('id', roomId).maybeSingle();
    if (!room) {
        console.error(`[allstarGame] room=${roomId} 조회 실패`);
        return;
    }
    const seasonNumber = (room as any).season_number ?? 1;
    const gameId = `${kind}-${roomId}-${seasonNumber}`;

    // ── 멱등성 락 — games PK(room_id, game_id) 유니크 제약을 그대로 락으로 사용 ──────────
    const homeTeamId = kind === 'main' ? EAST_ALLSTAR_ID : RISING_STARS_A_ID;
    const awayTeamId = kind === 'main' ? WEST_ALLSTAR_ID : RISING_STARS_B_ID;
    const scheduledAt = await resolveAllStarScheduledAt(roomId, virtualDate);
    const { error: claimErr } = await supabase.from('games').insert({
        room_id: roomId, game_id: gameId, league_id: leagueId,
        home_team_id: homeTeamId, away_team_id: awayTeamId,
        game_date: virtualDate, game_time: GAME_TIME[kind],
        played: false, is_allstar: true, scheduled_at: scheduledAt,
    });
    if (claimErr) {
        console.log(`[allstarGame] ${gameId} already claimed/exists — skip`);
        return;
    }

    // ── 저장된 최종 로스터 조회 (재계산 금지) ────────────────────────────────────────────
    const { data: voteRow, error: voteErr } = await supabase
        .from('league_allstar_votes')
        .select('roster')
        .eq('room_id', roomId).eq('season_number', seasonNumber)
        .not('roster', 'is', null)
        .order('sim_date', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (voteErr || !voteRow?.roster) {
        console.error(`[allstarGame] room=${roomId} 확정 로스터 없음 — 스킵:`, voteErr?.message);
        return;
    }
    const roster = voteRow.roster as StoredRosterPayload;

    let homePlayerIds: string[];
    let awayPlayerIds: string[];
    let homeTeamName: string;
    let awayTeamName: string;
    let preserveDraftOrder: boolean;

    if (kind === 'main') {
        if (!roster.east || !roster.west) {
            console.error(`[allstarGame] room=${roomId} 본경기 로스터 누락 — 스킵`);
            return;
        }
        // 스타터를 배열 앞쪽에 둬야 preserveDraftOrder=true일 때 뎁스차트 우선순위가
        // 스타터 → 리저브 순으로 배정된다(simRunner.ts의 "OVR 내림차순 폴백"과 반대로,
        // 여기선 발표된 실제 선발/벤치 구성을 그대로 존중해야 하므로 순서를 직접 만든다).
        homePlayerIds = [...roster.east.starters, ...roster.east.reserves].map(p => p.playerId);
        awayPlayerIds = [...roster.west.starters, ...roster.west.reserves].map(p => p.playerId);
        homeTeamName = '동부 올스타';
        awayTeamName = '서부 올스타';
        preserveDraftOrder = true;
    } else {
        if (!roster.risingStars) {
            console.error(`[allstarGame] room=${roomId} 라이징스타 로스터 누락 — 스킵`);
            return;
        }
        homePlayerIds = roster.risingStars.teamA.map(p => p.playerId);
        awayPlayerIds = roster.risingStars.teamB.map(p => p.playerId);
        homeTeamName = roster.risingStars.teamAName;
        awayTeamName = roster.risingStars.teamBName;
        // 라이징스타는 스타터/벤치 구분이 없다(핵심 5인/나머지 명단 표시는 화면 전용 연출) —
        // OVR 내림차순 자동 배정으로 충분하다.
        preserveDraftOrder = false;
    }

    const allPlayerIds = [...homePlayerIds, ...awayPlayerIds];
    if (allPlayerIds.length === 0) {
        console.error(`[allstarGame] room=${roomId} 참가자 0명 — 스킵`);
        return;
    }

    // custom_overrides(올타임 풀) 적용 여부 — simRunner.ts와 동일 판정.
    const { data: leagueData } = await supabase
        .from('leagues').select('draft_pool').eq('id', leagueId).maybeSingle();
    const draftPools = (leagueData?.draft_pool ?? 'standard').split(',').map((s: string) => s.trim());
    const useCustomOverrides = draftPools.includes('alltime');

    const { data: rawPlayers } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, tendencies')
        .in('id', allPlayerIds);

    const playerMap = new Map<string, any>();
    for (const raw of rawPlayers ?? []) {
        playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides));
    }

    // 기존 부상/체력 오버레이 — simRunner.ts §2.5와 동일 패턴(이 경기가 새 부상을 만들진
    // 않지만, 이미 부상 중인 선수는 그대로 결장 처리해야 함).
    const rosterState: Record<string, any> = (room as any).roster_state ?? {};
    const { data: playerStateRows } = await supabase
        .from('room_player_state')
        .select('player_id, condition, health, injury_type, return_date, season_number')
        .eq('room_id', roomId)
        .in('player_id', allPlayerIds);
    for (const row of (playerStateRows ?? []) as any[]) {
        const isActiveInjury = row.health === 'Injured' && (
            (row.return_date != null && row.return_date > virtualDate) ||
            (row.return_date == null && row.season_number === seasonNumber)
        );
        rosterState[row.player_id] = {
            ...rosterState[row.player_id],
            ...(row.condition != null ? { condition: row.condition } : {}),
            ...(isActiveInjury ? { health: 'Injured', injuryType: row.injury_type, returnDate: row.return_date } : {}),
        };
    }

    const homeTeam = buildTeamForSim({ team_slug: homeTeamId, team_name: homeTeamName, roster: homePlayerIds }, playerMap, rosterState);
    const awayTeam = buildTeamForSim({ team_slug: awayTeamId, team_name: awayTeamName, roster: awayPlayerIds }, playerMap, rosterState);

    const coachingData = (room as any).coaching_staff ?? null;
    // 전시성 경기 — 부상/출장정지 비활성화(사용자 확인). 다른 슬라이더(득점/파울 등)는
    // 방의 기존 설정을 그대로 물려받는다.
    const baseSimSettings = (room as any).sim_settings ?? {};
    const allStarSimSettings = { ...baseSimSettings, injuriesEnabled: false, suspensionsEnabled: false };
    const tendencySeed = ((room as any).tendency_seed ?? '') + ':' + gameId;

    resolveNormalizationContext(allStarSimSettings, [homeTeam, awayTeam], calculateOvr);

    // 뎁스차트(포지션 배정)는 generateAutoTactics()의 기존 알고리즘을 그대로 재사용하되,
    // rotationMap(분당 출전 여부)만 buildAllStarRotationMap()으로 교체한다 — 정규시즌 AI팀이
    // 쓰는 "주전 38분/벤치 10분" 하드코딩 대신 균등 분배 + 잦은 부분 교체를 적용하기 위함.
    const homeTactics = generateAutoTactics(homeTeam, undefined, preserveDraftOrder);
    homeTactics.rotationMap = buildAllStarRotationMap(homeTactics.depthChart!, homePlayerIds);
    const awayTactics = generateAutoTactics(awayTeam, undefined, preserveDraftOrder);
    awayTactics.rotationMap = buildAllStarRotationMap(awayTactics.depthChart!, awayPlayerIds);

    // [2026-09-09] 올스타/라이징스타는 실전과 달리 수비를 거의 안 한다(사용자 요청) — 로스터
    // 기반 자동 계산 슬라이더 대부분은 그대로 두고, 수비 관련 슬라이더만 "느슨한 지역방어"
    // 색으로 덮어쓴다. zoneFreq(지역방어 발동 빈도, possessionHandler.ts:465 —
    // zoneFreq*0.08 확률)만 올리고 zoneUsage(지역방어를 "얼마나 잘" 운용하는지의 스타일
    // 파라미터, 빈도가 아님)는 로스터 기반 값 그대로 둔다 — 사용자가 요청한 건 "지역방어를
    // 자주 쓰게" 이지 "지역방어를 잘 쓰게"가 아니라서.
    for (const tactics of [homeTactics, awayTactics]) {
        tactics.sliders.defIntensity = 2;
        tactics.sliders.fullCourtPress = 2;
        tactics.sliders.switchFreq = 2;
        tactics.sliders.helpDef = 2;
        tactics.sliders.zoneFreq = 8;
    }

    const result = runFullGameSimulation(
        homeTeam, awayTeam, homeTeamId,
        homeTactics, false, false, undefined, undefined,
        tendencySeed, allStarSimSettings, coachingData, awayTactics,
        preserveDraftOrder,
    );

    const homeScore = result.homeScore ?? 0;
    const awayScore = result.awayScore ?? 0;
    console.log(`[allstarGame] ${gameId}: ${homeTeamName} ${homeScore} - ${awayScore} ${awayTeamName}`);

    await supabase.from('game_pbp').upsert({
        room_id: roomId, game_id: gameId,
        events: result.pbpLogs ?? [], shot_events: result.pbpShotEvents ?? [],
        home_box: result.homeBox ?? [], away_box: result.awayBox ?? [],
        home_score: homeScore, away_score: awayScore,
        home_team_id: homeTeamId, away_team_id: awayTeamId,
        game_start_time: scheduledAt,
        sim_duration_ms: 0,
        box_timeline: result.boxTimeline ?? [], rotation_data: result.rotationData ?? {},
        quarter_scores: computeQuarterScoresFromEvents(result.pbpLogs ?? []),
    }, { onConflict: 'room_id,game_id' });

    await supabase.from('games')
        .update({ played: true, home_score: homeScore, away_score: awayScore })
        .eq('room_id', roomId).eq('game_id', gameId);

    // ── MVP 선정 + 결과 서신 발송 ────────────────────────────────────────────────────────
    // 양팀 박스스코어를 하나로 합쳐 pickTeamMvp()에 넘기면 "팀 구분 없는 경기 전체 MVP 1명"이
    // 선정된다(원래 팀별 1명씩 뽑는 용도의 함수지만, 입력 자체를 합치면 자연스럽게 통합 선정이
    // 됨 — server/src/shared/leagueEvents.ts 참고). 실제 NBA 올스타전처럼 "이긴 팀에서만"
    // 같은 별도 제약은 요청에 없어 두지 않았다.
    const mvp = pickTeamMvp([...(result.homeBox ?? []), ...(result.awayBox ?? [])]);
    const seasonLabel = (room as any).season ?? '';
    const resultType = kind === 'main' ? 'allstar_game_result' : 'allstar_rising_stars_result';
    const headline = kind === 'main'
        ? `${seasonLabel}시즌 올스타전이 종료됐습니다`
        : `${seasonLabel}시즌 라이징스타 챌린지가 종료됐습니다`;
    // 라이징스타는 homeTeamName/awayTeamName이 팀 조립(buildTeamForSim)용으로 주장 성만
    // 담고 있다("엣지컴") — 다른 화면/서신들이 전부 "팀 ○○○"로 표시하는 것과 맞추기 위해
    // 여기서만 접두어를 붙인다(본경기는 이미 "동부 올스타"처럼 완전한 이름이라 그대로).
    const displayHomeTeamName = kind === 'main' ? homeTeamName : `팀 ${homeTeamName}`;
    const displayAwayTeamName = kind === 'main' ? awayTeamName : `팀 ${awayTeamName}`;
    const { error: resultErr } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, season_number: seasonNumber,
        game_id: gameId, sim_date: virtualDate, type: resultType,
        team_ids: [homeTeamId, awayTeamId],
        player_ids: mvp ? [mvp.playerId] : [],
        payload: {
            v: 1, headline, seasonLabel,
            homeTeamId, awayTeamId, homeTeamName: displayHomeTeamName, awayTeamName: displayAwayTeamName,
            homeScore, awayScore,
            mvp: mvp ? { playerId: mvp.playerId, name: mvp.name, position: mvp.position, stats: mvp.stats } : undefined,
        },
    });
    if (resultErr) console.error(`[allstarGame] ${gameId} 결과 서신 insert 실패:`, resultErr.message);
}
