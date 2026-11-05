/**
 * offCourtInjuries.ts — 멀티 경기 사이 부상·결장: 방 단위 DB 처리 (2026-11-05)
 *
 * 규칙(종류·빈도·기간)은 shared/multi/offCourtInjuries.ts. 가상 자정이 지나 방 날짜가 전진할 때
 * scheduler.runFatigueMidnights가 newDay(= 지난 날짜 + 1)로 호출한다. 그날부터 결장(return_date = newDay + 기간)
 * — 같은 날 경기 시뮬(simRunner §2.5)이 room_player_state를 읽어 출전에서 뺀다.
 * 진단 지연 없이 즉시 공개, 리그 뉴스는 내지 않고 소속 팀 알림용 injury_notice 이벤트만 남긴다.
 */
import { supabase } from './supabaseAdmin.ts';
import { loadRoomPlayers, type PlayerLoaderLeague } from './playerLoader.ts';
import { resolveReturnDate } from './shared/injuryDuration.ts';
import { offCourtChance, pickOffCourtEvent } from './shared/multi/offCourtInjuries.ts';
import { detectInjuryNoticeEvent } from './shared/leagueEvents.ts';

export async function rollOffCourtInjuries(roomId: string, newDay: string, days: number): Promise<number> {
    const { data: room, error: roomErr } = await supabase
        .from('rooms').select('league_id, season_number, sim_settings').eq('id', roomId).single();
    if (roomErr || !room) throw new Error(`[offCourtInjuries] room ${roomId}: ${roomErr?.message ?? 'not found'}`);
    const sim = (room as any).sim_settings ?? {};
    if (!sim.injuriesEnabled) return 0;
    const chance = offCourtChance(days, Number(sim.injuryFrequency ?? 1));

    const { data: teams, error: teamErr } = await supabase
        .from('league_teams').select('team_slug, roster').eq('room_id', roomId);
    if (teamErr) throw new Error(`[offCourtInjuries] league_teams: ${teamErr.message}`);
    const teamByPlayer = new Map<string, string>();
    for (const t of (teams ?? []) as any[]) for (const id of (t.roster ?? [])) teamByPlayer.set(String(id), t.team_slug);

    // 판정 먼저(대부분 0명) — 걸린 선수만 상태·능력치를 읽는다.
    const hits = [...teamByPlayer.keys()].filter(() => Math.random() < chance);
    if (hits.length === 0) return 0;

    const seasonNumber = (room as any).season_number ?? null;
    const { data: stateRows, error: stErr } = await supabase
        .from('room_player_state')
        .select('player_id, health, return_date, season_number, injury_history')
        .eq('room_id', roomId)
        .in('player_id', hits);
    if (stErr) throw new Error(`[offCourtInjuries] room_player_state: ${stErr.message}`);
    const stateById = new Map<string, any>(((stateRows ?? []) as any[]).map(r => [r.player_id, r]));

    let league: PlayerLoaderLeague | null = null;
    if ((room as any).league_id) {
        const { data } = await supabase
            .from('leagues').select('use_custom_overrides, personal_draft_format').eq('id', (room as any).league_id).maybeSingle();
        league = (data as PlayerLoaderLeague | null) ?? null;
    }
    const players = await loadRoomPlayers(roomId, hits, league);

    const upserts: any[] = [];
    const events: any[] = [];
    for (const pid of hits) {
        const st = stateById.get(pid);
        // 이미 결장 중(부상·출장정지·개인 사유)이면 건너뜀 — simRunner §2.5와 같은 활성 판정
        const active = st?.health === 'Injured' && (
            (st.return_date != null && st.return_date > newDay) ||
            (st.return_date == null && st.season_number === seasonNumber)
        );
        if (active) continue;
        const p = players.get(pid);
        if (!p) continue;
        const teamSlug = teamByPlayer.get(pid)!;
        const pick = pickOffCourtEvent(Number(p.durability ?? 70));
        const returnDate = await resolveReturnDate(supabase as any, roomId, teamSlug, newDay, pick.duration);
        const entry = {
            injuryType: pick.type, severity: pick.severity, duration: pick.duration,
            date: newDay, returnDate, isTraining: false, offCourt: true, teamId: teamSlug, playerName: p.name,
        };
        upserts.push({
            room_id: roomId, player_id: pid,
            injury_history: [...(st?.injury_history ?? []), entry],
            health: 'Injured', injury_type: pick.type, return_date: returnDate,
            season_number: seasonNumber,
        });
        const e = detectInjuryNoticeEvent(pid, p.name, teamSlug, pick.type, pick.duration, returnDate, pick.category === 'personal' ? 'personal' : 'off_court');
        events.push({
            room_id: roomId, league_id: (room as any).league_id ?? '', season_number: seasonNumber,
            game_id: null, sim_date: newDay, type: e.type, team_ids: e.teamIds, player_ids: e.playerIds, score: e.score,
            payload: { v: 1, headline: e.headline, ...e.payload },
        });
    }
    if (upserts.length === 0) return 0;

    const { error: upErr } = await supabase.from('room_player_state').upsert(upserts, { onConflict: 'room_id,player_id' });
    if (upErr) throw new Error(`[offCourtInjuries] upsert: ${upErr.message}`);
    const { error: evErr } = await supabase.from('league_events').insert(events);
    if (evErr) console.error(`[offCourtInjuries] injury_notice insert 실패 room=${roomId}: ${evErr.message}`);
    return upserts.length;
}
