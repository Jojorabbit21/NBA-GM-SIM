/**
 * postDunkContest.ts — 덩크 컨테스트 실제 시뮬레이션.
 *
 * 배경: postAllStarVoteNews.ts의 computeAndPostDunkContestNews()는 참가자 4명을 "발표"만
 * 했지, 실제로 몇 점을 받았는지는 시뮬레이션한 적이 없었다. 이 파일은 그 마지막 단계 —
 * 실제 대회 실행일(getAllStarKeyDates().allStarDunkContestDate)에 도달하면 참가자 전원의
 * 덩크를 실제로 채점해 결과를 기록한다.
 *
 * 포맷(사용자 확정 — "실제 NBA 포맷과 동일하면 좋겠어", docs/simulation/allstar-game-plan.md
 * §6 계획 그대로): 4명이 예선에서 각 2회 시도 → 두 시도 점수를 합산(최대 100점) → 상위 2명이
 * 결승에서 다시 2회 새로 시도(예선 점수는 이월되지 않음, 결승 점수만으로 우승자 결정) —
 * 실제 NBA 현행 덩크 컨테스트(State Farm All-Star Saturday Night) 방식.
 *
 * ⚠️ 참가자 명단은 재계산하지 않는다 — 3점 챌린지(postThreePointContest.ts)와 동일한 원칙으로
 * league_events의 allstar_dunk_contest(참가자 발표 서신, 이 시즌에서 유일한 행)에 이미 저장된
 * 4명을 그대로 읽어쓴다.
 *
 * 채점 모델(신규 — 3점 챌린지처럼 재사용할 기존 엔진이 없음, docs/simulation/allstar-game-plan.md
 * §6이 명시한 대로 새로 설계): 실제 NBA 저지 5명이 각 6~10점을 매겨 한 덩크당 최대 50점을
 * 준다는 규칙을 그대로 모사 — 선수의 dunkRating((dunk+vertical)/2, types/player.ts:239,262)을
 * [40,99] 구간에서 저지 1명당 기준점 [6,10]으로 선형 매핑한 뒤, 저지별로 독립적인 노이즈를
 * 더해 6~10 사이로 클램프. 5명 합산 점수를 그 덩크의 최종 점수로 쓴다.
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+시뮬 오케스트레이션이라 클라 대응물이 없음).
 * 호출부: scheduler.ts의 runDunkContestResult() — allStarDunkContestDate에만 호출.
 */
import { supabase } from './supabaseAdmin';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';

const DUNKS_PER_ROUND = 2;
const FINALIST_COUNT = 2;
const JUDGE_COUNT = 5;

// dunkRating(40~99 구간, 그 아래는 40으로 클램프 — 컨테스트 참가자 풀 자체가 이미 상위권
// 가중 추첨이라 40 미만은 사실상 안 나오지만 방어적으로 클램프)을 저지 1명당 기준점(6~10)으로
// 선형 매핑.
function judgeBaseline(dunkRating: number): number {
    const clamped = Math.max(40, Math.min(99, dunkRating));
    return 6 + ((clamped - 40) / 59) * 4;
}

interface DunkAttempt { judgeScores: number[]; total: number }

function simulateDunkAttempt(dunkRating: number): DunkAttempt {
    const baseline = judgeBaseline(dunkRating);
    const judgeScores: number[] = [];
    for (let j = 0; j < JUDGE_COUNT; j++) {
        const noise = (Math.random() * 2 - 1) * 1.3;
        judgeScores.push(Math.max(6, Math.min(10, Math.round(baseline + noise))));
    }
    return { judgeScores, total: judgeScores.reduce((a, b) => a + b, 0) };
}

interface RoundEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    dunks: DunkAttempt[]; total: number;
}

function simulateDunkRound(
    dunkRating: number, meta: { playerId: string; playerName: string; teamSlug: string; position: string },
): RoundEntry {
    const dunks = Array.from({ length: DUNKS_PER_ROUND }, () => simulateDunkAttempt(dunkRating));
    return { ...meta, dunks, total: dunks.reduce((a, d) => a + d.total, 0) };
}

// 동점 처리 — total 내림차순, 그래도 같으면 마지막 시도 점수, 그래도 같으면 playerId
// 오름차순으로 완전히 결정론적으로 정렬(실전 덩크오프 서브시스템은 이번 범위 밖 — 3점
// 챌린지의 rankEntries()와 동일 원칙).
function rankEntries(entries: RoundEntry[]): RoundEntry[] {
    return [...entries].sort((a, b) =>
        b.total - a.total ||
        b.dunks[b.dunks.length - 1].total - a.dunks[a.dunks.length - 1].total ||
        a.playerId.localeCompare(b.playerId),
    );
}

export async function computeAndRunDunkContest(
    roomId: string, leagueId: string, virtualDate: string,
): Promise<void> {
    const { data: room } = await supabase
        .from('rooms').select('season, season_number').eq('id', roomId).maybeSingle();
    if (!room) {
        console.error(`[dunkContest] room=${roomId} 조회 실패`);
        return;
    }
    const seasonNumber = (room as any).season_number ?? 1;
    const seasonLabel = (room as any).season ?? '';

    // ── 멱등성 — 이 시즌에 이미 결과가 있으면 스킵 ──────────────────────────────────────
    const { count: alreadyDone } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_dunk_contest_result').eq('season_number', seasonNumber);
    if ((alreadyDone ?? 0) > 0) {
        console.log(`[dunkContest] room=${roomId} 이미 결과 있음 — 스킵`);
        return;
    }

    // ── 저장된 참가자 명단 조회 (재계산 금지) ────────────────────────────────────────────
    const { data: announceRow, error: announceErr } = await supabase
        .from('league_events')
        .select('payload')
        .eq('room_id', roomId).eq('type', 'allstar_dunk_contest')
        .order('sim_date', { ascending: false })
        .limit(1)
        .maybeSingle();
    const participants = (announceRow?.payload as any)?.participants as
        { playerId: string; playerName: string; teamSlug: string; position: string }[] | undefined;
    if (announceErr || !participants?.length) {
        console.error(`[dunkContest] room=${roomId} 참가자 명단 없음 — 스킵:`, announceErr?.message);
        return;
    }

    const { data: rawPlayers } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, tendencies')
        .in('id', participants.map(p => p.playerId));
    const playerMap = new Map<string, any>();
    for (const raw of rawPlayers ?? []) {
        playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, false));
    }

    const dunkers = participants
        .map(p => {
            const raw = playerMap.get(p.playerId);
            if (!raw) return null;
            const dunkRating = (raw.dunk + raw.vertical) / 2;
            return { meta: p, dunkRating };
        })
        .filter((x): x is { meta: typeof participants[number]; dunkRating: number } => !!x);
    if (dunkers.length === 0) {
        console.error(`[dunkContest] room=${roomId} 참가자 능력치 조회 실패 — 스킵`);
        return;
    }

    const round1 = rankEntries(dunkers.map(({ meta, dunkRating }) => simulateDunkRound(dunkRating, meta)));
    const finalists = dunkers.filter(s => round1.slice(0, FINALIST_COUNT).some(e => e.playerId === s.meta.playerId));
    const round2 = rankEntries(finalists.map(({ meta, dunkRating }) => simulateDunkRound(dunkRating, meta)));
    const winnerId = round2[0]?.playerId;

    console.log(`[dunkContest] room=${roomId} 우승: ${round2[0]?.playerName} (${round2[0]?.total}점)`);

    const { error: insertErr } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, season_number: seasonNumber,
        sim_date: virtualDate, type: 'allstar_dunk_contest_result',
        player_ids: round1.map(e => e.playerId),
        payload: {
            v: 1,
            headline: `${seasonLabel}시즌 덩크 컨테스트 결과가 발표됐습니다`,
            seasonLabel, round1,
            finalistIds: round1.slice(0, FINALIST_COUNT).map(e => e.playerId),
            round2, winnerId,
        },
    });
    if (insertErr) console.error(`[dunkContest] room=${roomId} 결과 insert 실패:`, insertErr.message);
}
