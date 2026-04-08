
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Loader2, AlertCircle, Play, Crown, Settings2 } from 'lucide-react';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import { joinLeague } from '../../../services/multi/leagueService';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { TeamSetupModal } from '../../../components/multi/TeamSetupModal';

import { TIER_LABEL } from './leagueConstants';

const LeagueLobbyView: React.FC = () => {
    const navigate          = useNavigate();
    const { leagueId }      = useParams<{ leagueId: string }>();
    const { session }       = useGame();
    const { league, room, members, isLoading, error, reload } = useCurrentLeague();

    const [joining,      setJoining]      = React.useState(false);
    const [joinError,    setJoinError]    = React.useState<string | null>(null);
    const [starting,     setStarting]     = React.useState(false);
    const [startError,   setStartError]   = React.useState<string | null>(null);
    const [modalOpen,    setModalOpen]    = React.useState(false);

    const userId    = session?.user?.id ?? null;
    const isMember  = members.some(m => m.user_id === userId);
    const isAdmin   = !!(league && userId && league.admin_user_id === userId);
    const myMember  = members.find(m => m.user_id === userId) ?? null;

    // 팀 미설정 멤버 수 (AI 제외)
    const unsetCount = members.filter(m => !m.is_ai && !m.team_id).length;
    const canStart   = isAdmin && league?.status === 'recruiting' && members.length >= 1 && unsetCount === 0;

    // room_members 변경 시 Realtime 재로드
    useEffect(() => {
        if (!room?.id) return;
        const channel = supabase
            .channel(`lobby-members-${room.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },
                () => reload()
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleStartDraft = async () => {
        if (!leagueId) return;
        setStarting(true);
        setStartError(null);
        const { error: err } = await supabase.functions.invoke('start-draft', {
            body: { leagueId },
        });
        setStarting(false);
        if (err) { setStartError(err.message); return; }
        navigate(`/multi/leagues/${leagueId}/draft`);
    };

    const handleJoin = async () => {
        if (!league || !userId) return;
        setJoining(true);
        setJoinError(null);
        const { error: err } = await joinLeague(league.id, userId);
        setJoining(false);
        if (err) { setJoinError(err); return; }
        reload();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (error || !league) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <AlertCircle size={24} className="text-red-400" />
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 불러올 수 없습니다.'}</p>
                <button onClick={() => navigate('/multi')} className="text-indigo-400 text-sm hover:underline">
                    리그 목록으로 돌아가기
                </button>
            </div>
        );
    }

    const memberCount = room?.max_players ?? league.max_teams;
    const joinedCount = members.length;

    // 현재 유저를 제외한 다른 멤버의 team_id slug 목록
    const otherTeamIds = members
        .filter(m => m.user_id !== userId && m.team_id)
        .map(m => m.team_id as string);

    return (
        <>
            <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

                {/* 뒤로가기 */}
                <button
                    onClick={() => navigate('/multi')}
                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} />
                    <span className="ko-normal">리그 목록</span>
                </button>

                {/* 리그 헤더 */}
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-6 py-5 space-y-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black text-white ko-tight">{league.name}</h1>
                        {league.tier && (
                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                                {TIER_LABEL[league.tier] ?? league.tier}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-400 ko-normal">
                        시즌 {league.season_number} · 최대 {league.max_teams}팀
                    </p>

                    {/* 참가 현황 바 */}
                    <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1 ko-normal">
                            <span>참가 현황</span>
                            <span>{joinedCount} / {memberCount}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${(joinedCount / memberCount) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* 참가 버튼 */}
                {!isMember && (
                    <div className="space-y-2">
                        {joinError && (
                            <p className="text-red-400 text-xs ko-normal">{joinError}</p>
                        )}
                        <button
                            onClick={handleJoin}
                            disabled={joining || league.status !== 'recruiting'}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-bold text-white transition-colors"
                        >
                            {joining
                                ? <><Loader2 size={14} className="animate-spin" /> 참가 중…</>
                                : <><Users size={14} /> 리그 참가하기</>
                            }
                        </button>
                    </div>
                )}

                {/* 팀 설정 카드 (참가한 유저) */}
                {isMember && league.status === 'recruiting' && room && (
                    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
                        myMember?.team_id
                            ? 'bg-slate-800/40 border-slate-700/40'
                            : 'bg-amber-500/10 border-amber-500/30'
                    }`}>
                        <div className="flex items-center gap-3 min-w-0">
                            {myMember?.team_id ? (
                                <>
                                    {/* 팀 설정 완료: 색상 dot + 팀명 */}
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0"
                                        style={{
                                            backgroundColor: myMember.team_color_primary  ?? '#6366f1',
                                            border: `2px solid ${myMember.team_color_secondary ?? '#6366f1'}`,
                                            color: '#fff',
                                        }}
                                    >
                                        {myMember.team_abbr ?? myMember.team_id.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{myMember.team_name}</p>
                                        <p className="text-xs text-slate-400">드래프트 시작 대기 중</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                                        <Settings2 size={14} className="text-amber-400" />
                                    </div>
                                    <p className="text-sm text-amber-300 ko-normal font-bold">팀 설정이 필요합니다</p>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => setModalOpen(true)}
                            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                                myMember?.team_id
                                    ? 'text-slate-400 bg-slate-700 hover:bg-slate-600'
                                    : 'text-white bg-amber-500 hover:bg-amber-400'
                            }`}
                        >
                            {myMember?.team_id ? '팀 수정' : '팀 설정'}
                        </button>
                    </div>
                )}

                {/* 어드민 드래프트 시작 버튼 */}
                {isAdmin && league.status === 'recruiting' && (
                    <div className="space-y-2">
                        {startError && (
                            <p className="text-red-400 text-xs ko-normal">{startError}</p>
                        )}
                        <button
                            onClick={handleStartDraft}
                            disabled={starting || !canStart}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-bold text-white transition-colors"
                        >
                            {starting
                                ? <><Loader2 size={14} className="animate-spin" /> 드래프트 시작 중…</>
                                : <><Crown size={14} /> 드래프트 시작 (어드민)</>
                            }
                        </button>
                        {unsetCount > 0 && (
                            <p className="text-xs text-amber-400 text-center ko-normal">
                                팀 미설정 {unsetCount}명 — 모두 팀을 설정해야 시작할 수 있습니다.
                            </p>
                        )}
                        {members.length < 1 && (
                            <p className="text-xs text-slate-500 text-center ko-normal">참가자가 1명 이상이어야 시작 가능합니다.</p>
                        )}
                    </div>
                )}

                {/* 참가자 목록 */}
                <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">참가자</p>
                    {members.length === 0 ? (
                        <p className="text-sm text-slate-500 ko-normal">아직 참가자가 없습니다.</p>
                    ) : (
                        <div className="space-y-2">
                            {members.map(m => (
                                <div
                                    key={m.user_id}
                                    className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-2.5"
                                >
                                    {/* 팀 로고 or 기본 아바타 */}
                                    {m.team_id ? (
                                        <div
                                            className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                                            style={{
                                                backgroundColor: m.team_color_primary  ?? '#6366f1',
                                                border: `1.5px solid ${m.team_color_secondary ?? '#6366f1'}`,
                                                color: '#fff',
                                            }}
                                        >
                                            {(m.team_abbr ?? m.team_id).slice(0, 3)}
                                        </div>
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                                            {m.is_ai ? 'AI' : m.user_id.slice(0, 2).toUpperCase()}
                                        </div>
                                    )}

                                    {/* 팀명 or 상태 */}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm text-slate-300 ko-normal block truncate">
                                            {m.is_ai
                                                ? 'AI GM'
                                                : m.team_name ?? '팀 미설정'
                                            }
                                        </span>
                                        {m.team_abbr && (
                                            <span className="text-[10px] text-slate-500 font-mono">{m.team_abbr}</span>
                                        )}
                                    </div>

                                    {/* 내 행 표시 */}
                                    {m.user_id === userId && (
                                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">나</span>
                                    )}

                                    {/* 팀 미설정 뱃지 */}
                                    {!m.is_ai && !m.team_id && (
                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded ko-normal">미설정</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 팀 설정 모달 */}
            {room && userId && (
                <TeamSetupModal
                    open={modalOpen}
                    roomId={room.id}
                    userId={userId}
                    existingTeamIds={otherTeamIds}
                    initial={myMember?.team_id ? {
                        name:           myMember.team_name           ?? '',
                        abbr:           myMember.team_abbr           ?? '',
                        colorPrimary:   myMember.team_color_primary  ?? '#e11d48',
                        colorSecondary: myMember.team_color_secondary ?? '#fbbf24',
                    } : null}
                    onClose={() => setModalOpen(false)}
                    onSaved={reload}
                />
            )}
        </>
    );
};

export default LeagueLobbyView;
