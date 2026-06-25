
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
            // 현재 leagueId 데이터가 없을 때만 블로킹 스피너 표시.
            // reload() 호출(tick 변경) 시에는 isLoading을 건드리지 않고 백그라운드 갱신.
            const needsBlockingLoad = league?.id !== leagueId;
            if (needsBlockingLoad) setIsLoading(true);
            setError(null);

            const [leagueData, roomData] = await Promise.all([
                loadLeague(leagueId),
                loadRoomByLeague(leagueId),
            ]);

            if (cancelled) return;

            if (!leagueData) {
                setError('리그를 찾을 수 없습니다.');
                setIsLoading(false);
                return;
            }

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
    useEffect(() => {
        if (!leagueId) return;

        const channel = supabase
            .channel(`league-row-${leagueId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
                async () => {
                    const updated = await loadLeague(leagueId);
                    if (updated) setLeague(updated);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [leagueId]);

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
