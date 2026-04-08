
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { loadLeague, loadRoomByLeague, listRoomMembers } from '../services/multi/roomQueries';
import type { LeagueRow, RoomRow, RoomMemberRow } from '../services/multi/roomQueries';

export interface CurrentLeagueState {
    league:  LeagueRow | null;
    room:    RoomRow   | null;
    members: RoomMemberRow[];
    isLoading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * URL 파라미터 :leagueId 기반으로 현재 활성 리그 + 방 + 멤버를 로드한다.
 * /multi/leagues/:leagueId/* 라우트 내부 컴포넌트에서 사용.
 */
export function useCurrentLeague(): CurrentLeagueState {
    const { leagueId } = useParams<{ leagueId: string }>();
    const [league,    setLeague]    = useState<LeagueRow   | null>(null);
    const [room,      setRoom]      = useState<RoomRow     | null>(null);
    const [members,   setMembers]   = useState<RoomMemberRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [tick,      setTick]      = useState(0);

    const reload = () => setTick(t => t + 1);

    useEffect(() => {
        if (!leagueId) return;
        let cancelled = false;

        const fetch = async () => {
            setIsLoading(true);
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
                const membersData = await listRoomMembers(roomData.id);
                if (!cancelled) setMembers(membersData);
            }

            setIsLoading(false);
        };

        fetch();
        return () => { cancelled = true; };
    }, [leagueId, tick]);

    return { league, room, members, isLoading, error, reload };
}
