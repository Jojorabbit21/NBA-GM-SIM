/**
 * injuryDiagnosis.ts — 멀티 부상 진단 발표 (2026-11-05)
 *
 * 경기 중 부상은 simRunner가 injury_history에 diagnosisDate(경기일 +1~2일)를 붙여 저장하고, 그날 전까지 클라는
 * "부위 부상 · 부상 기간 보류 중"으로 가린다(services/multi/activeInjuryStatus.ts). 진단일이 되면 이 모듈이
 * 진단 발표 뉴스(detectInjuryEvent, GRADE3+)를 sim_date = diagnosisDate로 내고 entry.diagnosisAnnounced를 표시한다.
 *
 * 호출: scheduler.runFatigueMidnights — 가상 자정이 지나 방 날짜가 전진했을 때 newDay(= 지난 날짜 + 1)로.
 * 실패해도 다음 자정에 diagnosisDate <= newDay 조건으로 다시 잡힌다.
 */
import { supabase } from './supabaseAdmin.ts';
import { detectInjuryEvent } from './shared/leagueEvents.ts';

export async function announceInjuryDiagnoses(roomId: string, newDay: string): Promise<number> {
    const { data: rows, error } = await supabase
        .from('room_player_state')
        .select('player_id, injury_history')
        .eq('room_id', roomId)
        .eq('health', 'Injured');
    if (error) throw new Error(`[injuryDiagnosis] room_player_state: ${error.message}`);

    const due: { playerId: string; history: any[]; entry: any }[] = [];
    for (const r of (rows ?? []) as any[]) {
        const history: any[] = r.injury_history ?? [];
        const entry = history[history.length - 1];
        if (!entry?.diagnosisDate || entry.diagnosisAnnounced || entry.diagnosisDate > newDay) continue;
        due.push({ playerId: r.player_id, history, entry });
    }
    if (due.length === 0) return 0;

    const { data: room, error: roomErr } = await supabase
        .from('rooms').select('league_id, season_number').eq('id', roomId).single();
    if (roomErr || !room) throw new Error(`[injuryDiagnosis] room ${roomId}: ${roomErr?.message ?? 'not found'}`);

    // [2026-11-07] 스포일러 게이트 — 진단 뉴스에 부상이 난 경기의 game_id를 붙여 RLS가 그 경기 공개 전까지 숨기게 한다.
    // 가상 하루(예: 20분)보다 리플레이(10분)가 길게 걸치는 늦은 경기는 자정 발표가 공개보다 먼저 나갔다(11-06·07 실측 68~274초).
    // diagnosisDate는 경기 중 부상(simRunner)에만 붙으므로 부상 날짜(entry.date) + 소속 팀으로 그 경기를 찾는다.
    const injuryDates = [...new Set(due.map(d => d.entry.date as string | undefined).filter((d): d is string => !!d))];
    const { data: injuryGames } = injuryDates.length > 0
        ? await supabase.from('games').select('game_id, game_date, home_team_id, away_team_id')
            .eq('room_id', roomId).eq('played', true).in('game_date', injuryDates)
        : { data: [] as any[] };
    const injuryGameId = (entry: any): string | null => {
        if (entry.isTraining || entry.offCourt || !entry.date || !entry.teamId) return null;
        return (injuryGames ?? []).find((g: any) => g.game_date === entry.date
            && (g.home_team_id === entry.teamId || g.away_team_id === entry.teamId))?.game_id ?? null;
    };

    const events = due.flatMap(({ playerId, entry }) => {
        if (!entry.teamId || !entry.playerName) return [];
        const e = detectInjuryEvent(playerId, entry.playerName, entry.teamId, entry.severity, entry.injuryType, entry.duration, entry.returnDate ?? null);
        if (!e) return [];
        return [{
            room_id: roomId,
            league_id: (room as any).league_id ?? '',
            season_number: (room as any).season_number ?? null,
            game_id: injuryGameId(entry),
            sim_date: entry.diagnosisDate,
            type: e.type,
            team_ids: e.teamIds,
            player_ids: e.playerIds,
            score: e.score,
            payload: { v: 1, headline: e.headline, ...e.payload },
        }];
    });
    if (events.length > 0) {
        const { error: insErr } = await supabase.from('league_events').insert(events);
        if (insErr) throw new Error(`[injuryDiagnosis] league_events: ${insErr.message}`);
    }

    // 뉴스를 낸 뒤 표시 — 표시 실패 시 다음 자정에 중복 발표될 수 있지만, 반대 순서는 발표 자체가 사라진다.
    for (const { playerId, history } of due) {
        const next = history.map((h, i) => (i === history.length - 1 ? { ...h, diagnosisAnnounced: true } : h));
        const { error: upErr } = await supabase
            .from('room_player_state')
            .update({ injury_history: next })
            .eq('room_id', roomId)
            .eq('player_id', playerId);
        if (upErr) console.error(`[injuryDiagnosis] mark announced 실패 room=${roomId} player=${playerId}: ${upErr.message}`);
    }
    return events.length;
}
