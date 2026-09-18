
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { loadLeague, loadRoomByLeague, listRoomMembers, listLeagueTeams } from '../services/multi/roomQueries';
import type { LeagueRow, RoomRow, RoomMemberRow, LeagueTeamRow } from '../services/multi/roomQueries';
import { loadLeagueTimeline } from '../services/multi/timelineQueries';
import type { VirtualDayRow } from '../utils/leagueTimeline';
import { setActiveReplayMinutes } from '../views/multi/season/multiGameReveal';

export interface CurrentLeagueState {
    league:      LeagueRow      | null;
    room:        RoomRow        | null;
    members:     RoomMemberRow[];
    leagueTeams: LeagueTeamRow[];
    /** [2026-09-18] 고정 길이 가상 하루 타임라인(league_virtual_days, realStartAt 오름차순). 이 구조
     *  이전 리그·토너먼트는 빈 배열 — 그때 findCurrentVirtualDate()는 예전 "가장 가까운 경기" 폴백. */
    timeline:    VirtualDayRow[];
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
    const [timeline,    setTimeline]    = useState<VirtualDayRow[]>([]);
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

            // [2026-09-18 2단계] 리플레이 길이(결과 공개 지연)를 판정 모듈에 주입 — 하위 화면이 렌더되기 전
            // (isLoading=false 이전)에 세팅돼야 첫 렌더부터 리그 값으로 판정된다.
            setActiveReplayMinutes(leagueData.replay_minutes);
            setLeague(leagueData);
            setRoom(roomData);

            if (roomData) {
                const [membersData, teamsData, timelineData] = await Promise.all([
                    listRoomMembers(roomData.id),
                    listLeagueTeams(roomData.id),
                    loadLeagueTimeline(leagueData.id),
                ]);
                if (!cancelled) {
                    setMembers(membersData);
                    setLeagueTeams(teamsData);
                    setTimeline(timelineData);
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
                    // 타임라인은 리그 생성 후 불변이지만, "일정" 탭 재배치가 leagues 행(day_length_min 등)과
                    // league_virtual_days를 함께 바꾸므로 leagues UPDATE를 신호로 같이 다시 읽는다(~230행).
                    // [2026-09-18 Fix] league_teams도 함께 다시 읽는다 — 드래프트 완료 처리(finalize)가 leagues.status를
                    // in_progress로 바꾸는 순간이 로스터가 확정되는 시점이라, 아래 league_teams 구독이 잠깐 끊겼더라도
                    // 여기서 한 번 더 흡수된다.
                    const [updated, timelineData, teamsData] = await Promise.all([
                        loadLeague(resolvedLeagueId), loadLeagueTimeline(resolvedLeagueId),
                        room?.id ? listLeagueTeams(room.id) : Promise.resolve(null),
                    ]);
                    if (updated) { setActiveReplayMinutes(updated.replay_minutes); setLeague(updated); }
                    setTimeline(timelineData);
                    if (teamsData) setLeagueTeams(teamsData);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedLeagueId, room?.id]);

    // ── league_teams Realtime 구독 ─────────────────────────────────────────────
    // [2026-09-18 Fix] "드래프트 완료 후 세션 홈에 들어가면 FA 화면에 드래프트된 선수까지 전부 보이고,
    // 새로고침하면 사라진다" 리포트. leagueTeams는 진입 시 1회만 읽고 그 뒤로는 갱신 경로가 없었는데,
    // 드래프트 화면과 시즌 화면이 같은 LeagueLayout 아래라(App.tsx) 드래프트가 끝나도 레이아웃이 유지되며
    // 드래프트 전 스냅샷(빈 로스터)이 그대로 남았다 → useMultiSearchData의 rosterMap이 비어 FA 필터가
    // 아무도 제외하지 못했다. 서버(DraftRoom/finalize)가 league_teams.roster를 쓸 때마다 다시 읽는다 —
    // 드래프트 중엔 픽마다 UPDATE가 오므로 300ms 디바운스로 묶는다(30팀 × 15라운드 = 450회 → 실제 조회는
    // 픽 간격마다 1회). 트레이드/FA 서명/방출도 같은 컬럼을 바꾸므로 그 화면들의 로스터 반영 지연도 함께 사라진다.
    useEffect(() => {
        if (!room?.id) return;
        const roomId = room.id;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        const refetchTeams = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                const updated = await listLeagueTeams(roomId);
                if (!cancelled) setLeagueTeams(updated);
            }, 300);
        };

        const channel = supabase
            .channel(`league-teams-${roomId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'league_teams', filter: `room_id=eq.${roomId}` },
                refetchTeams,
            )
            .subscribe((status) => {
                // 재연결 시 끊긴 동안의 변경(드래프트 픽 등) 흡수 — useMultiGameData의 games 구독과 동일 패턴.
                if (status === 'SUBSCRIBED') refetchTeams();
            });

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [room?.id]);

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

    return { league, room, members, leagueTeams, timeline, isLoading, error, reload };
}
