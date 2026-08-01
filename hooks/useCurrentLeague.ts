
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { loadLeague, loadRoomByLeague, listRoomMembers, listLeagueTeams } from '../services/multi/roomQueries';
import type { LeagueRow, RoomRow, RoomMemberRow, LeagueTeamRow } from '../services/multi/roomQueries';

export interface CurrentLeagueState {
    league:      LeagueRow      | null;
    room:        RoomRow        | null;
    members:     RoomMemberRow[];
    leagueTeams: LeagueTeamRow[];
    isLoading:   boolean;
    error:       string | null;
    reload:      () => void;
}

/**
 * URL 파라미터 :leagueId 기반으로 현재 활성 리그 + 방 + 멤버 + 팀을 로드한다.
 * /multi/leagues/:leagueId/* 라우트 내부 컴포넌트에서 사용.
 */
export function useCurrentLeague(): CurrentLeagueState {
    const { leagueId } = useParams<{ leagueId: string }>();
    const [league,      setLeague]      = useState<LeagueRow      | null>(null);
    const [room,        setRoom]        = useState<RoomRow        | null>(null);
    const [members,     setMembers]     = useState<RoomMemberRow[]>([]);
    const [leagueTeams, setLeagueTeams] = useState<LeagueTeamRow[]>([]);
    const [isLoading,   setIsLoading]   = useState(true);
    const [error,       setError]       = useState<string | null>(null);
    const [tick,        setTick]        = useState(0);

    const reload = () => setTick(t => t + 1);

    useEffect(() => {
        if (!leagueId) return;
        let cancelled = false;

        const fetch = async () => {
            // 현재 leagueId(URL — short_code 또는 구 리그의 UUID) 데이터가 없을 때만 블로킹
            // 스피너 표시. reload() 호출(tick 변경) 시에는 isLoading을 건드리지 않고 백그라운드 갱신.
            const needsBlockingLoad = league?.short_code !== leagueId && league?.id !== leagueId;
            if (needsBlockingLoad) setIsLoading(true);
            setError(null);

            // [2026-08-01] loadRoomByLeague는 rooms.league_id(UUID)로 조회하므로, short_code일 수
            // 있는 leagueId를 먼저 loadLeague로 실제 UUID(leagueData.id)로 변환한 뒤에 조회해야 함
            // — 병렬 실행 불가, 순차 실행으로 변경.
            const leagueData = await loadLeague(leagueId);
            if (cancelled) return;

            if (!leagueData) {
                setError('리그를 찾을 수 없습니다.');
                setIsLoading(false);
                return;
            }

            const roomData = await loadRoomByLeague(leagueData.id);
            if (cancelled) return;

            setLeague(leagueData);
            setRoom(roomData);

            if (roomData) {
                const [membersData, teamsData] = await Promise.all([
                    listRoomMembers(roomData.id),
                    listLeagueTeams(roomData.id),
                ]);
                if (!cancelled) {
                    setMembers(membersData);
                    setLeagueTeams(teamsData);
                }
            }

            setIsLoading(false);
        };

        fetch();
        return () => { cancelled = true; };
    }, [leagueId, tick]);

    // ── leagues Realtime 구독 ────────────────────────────────────────────────────
    // 서버가 bracket_data / status 등을 업데이트할 때 league 상태를 자동 재로드.
    // [2026-08-01 Fix] filter는 실제 DB 컬럼(id, UUID) 기준이라 URL의 leagueId(short_code일 수
    // 있음)가 아니라 이미 조회된 league.id로 걸어야 함 — league 로드 완료 후에만 구독.
    const resolvedLeagueId = league?.id;
    useEffect(() => {
        if (!resolvedLeagueId) return;

        const channel = supabase
            .channel(`league-row-${resolvedLeagueId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${resolvedLeagueId}` },
                async () => {
                    const updated = await loadLeague(resolvedLeagueId);
                    if (updated) setLeague(updated);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [resolvedLeagueId]);

    // ── room_members Realtime 구독 ─────────────────────────────────────────────
    // start-draft EF가 AI 멤버를 삽입할 때, 또는 유저가 팀 설정을 변경할 때
    // members를 자동으로 다시 불러온다.
    useEffect(() => {
        if (!room?.id) return;
        const roomId = room.id;

        const channel = supabase
            .channel(`room-members-${roomId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
                async () => {
                    const updated = await listRoomMembers(roomId);
                    setMembers(updated);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [room?.id]);

    return { league, room, members, leagueTeams, isLoading, error, reload };
}
