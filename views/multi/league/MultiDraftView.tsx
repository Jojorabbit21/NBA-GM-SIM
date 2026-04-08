
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Clock, ChevronUp, Search, User } from 'lucide-react';
import { useGame } from '../../../hooks/useGameContext';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';
import type { DraftPoolPlayer } from '../../../types/multiDraft';

const POSITION_COLORS: Record<string, string> = {
    PG: '#22d3ee', SG: '#34d399', SF: '#fbbf24', PF: '#fb7185', C: '#a78bfa',
};

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function TimerBar({ remaining, total }: { remaining: number; total: number }) {
    const pct     = total > 0 ? (remaining / total) * 100 : 0;
    const urgent  = remaining <= 10;
    return (
        <div className="flex items-center gap-3">
            <Clock size={14} className={urgent ? 'text-red-400 animate-pulse' : 'text-slate-400'} />
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${urgent ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`text-xs tabular-nums font-bold w-8 text-right ${urgent ? 'text-red-400' : 'text-slate-300'}`}>
                {remaining}s
            </span>
        </div>
    );
}

function PositionBadge({ pos }: { pos: string }) {
    const color = POSITION_COLORS[pos] ?? '#94a3b8';
    return (
        <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ color, backgroundColor: color + '22' }}
        >
            {pos}
        </span>
    );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

const MultiDraftView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { session }  = useGame();
    const { room }     = useCurrentLeague();

    const {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting,
    } = useLeagueDraft(room?.id ?? null, session);

    const [posFilter,    setPosFilter]    = useState<string>('All');
    const [searchQuery,  setSearchQuery]  = useState('');
    const [pickError,    setPickError]    = useState<string | null>(null);

    // ── 드래프트된 ID 집합 ─────────────────────────────────────────────────
    const draftedSet = useMemo(
        () => new Set(draftState?.draftedIds ?? []),
        [draftState?.draftedIds]
    );

    // ── 사용 가능한 선수 필터링 ────────────────────────────────────────────
    const availablePlayers = useMemo((): DraftPoolPlayer[] => {
        return poolPlayers
            .filter(p => !draftedSet.has(p.id))
            .filter(p => posFilter === 'All' || p.position === posFilter)
            .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 100); // 성능상 최대 100명 표시
    }, [poolPlayers, draftedSet, posFilter, searchQuery]);

    // ── 내 현재 로스터 ─────────────────────────────────────────────────────
    const myRoster = useMemo((): DraftPoolPlayer[] => {
        const myPickSet = new Set(myPicks);
        return poolPlayers.filter(p => myPickSet.has(p.id));
    }, [poolPlayers, myPicks]);

    // ── 픽 처리 ──────────────────────────────────────────────────────────
    const handleDraft = async (player: DraftPoolPlayer) => {
        if (!isMyTurn || isSubmitting) return;
        setPickError(null);
        const { error } = await submitPick(player.id);
        if (error) setPickError(error);
    };

    // ── 로딩 / 에러 가드 ──────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!draftState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <p className="text-slate-400 text-sm ko-normal">드래프트가 아직 시작되지 않았습니다.</p>
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/lobby`)}
                    className="text-indigo-400 text-sm hover:underline ko-normal"
                >
                    로비로 돌아가기
                </button>
            </div>
        );
    }

    // ── 드래프트 완료 화면 ─────────────────────────────────────────────────
    if (draftState.status === 'completed') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-4xl">🏀</div>
                <h2 className="text-xl font-black text-white ko-tight">드래프트 완료!</h2>
                <p className="text-slate-400 text-sm ko-normal">시즌이 곧 시작됩니다.</p>
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/season`)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
                >
                    시즌 대시보드로
                </button>
            </div>
        );
    }

    const totalPicks  = draftState.teamCount * draftState.totalRounds;
    const currentRound= Math.floor(draftState.currentPickIndex / draftState.teamCount) + 1;
    const pickInRound = (draftState.currentPickIndex % draftState.teamCount) + 1;

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col">

            {/* ── 헤더 ── */}
            <div className="border-b border-slate-800 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 ko-normal">
                            라운드 {currentRound} / {draftState.totalRounds}
                            &nbsp;·&nbsp;픽 {draftState.currentPickIndex + 1} / {totalPicks}
                        </p>
                        {isMyTurn ? (
                            <p className="text-sm font-bold text-indigo-300 ko-tight">내 차례입니다!</p>
                        ) : (
                            <p className="text-sm text-slate-300 ko-normal">
                                <span className="font-bold text-white">
                                    {currentPickEntry?.teamId ?? '—'}
                                </span>
                                &nbsp;선택 중…
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-500 ko-normal">내 팀</p>
                        <p className="text-sm font-bold text-white">{myTeamId ?? '—'}</p>
                    </div>
                </div>
                <TimerBar remaining={timeRemaining} total={draftState.pickDurationSec} />
                {pickError && (
                    <p className="text-xs text-red-400 ko-normal">{pickError}</p>
                )}
            </div>

            {/* ── 본문 (2열) ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* 선수 풀 */}
                <div className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">

                    {/* 필터 */}
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[120px]">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="선수 검색…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-800 text-xs text-white pl-7 pr-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 ko-normal"
                            />
                        </div>
                        <div className="flex gap-1">
                            {POSITIONS.map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setPosFilter(pos)}
                                    className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                                        posFilter === pos
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 선수 목록 */}
                    <div className="flex-1 overflow-y-auto">
                        {availablePlayers.length === 0 ? (
                            <p className="text-center text-slate-500 text-sm py-8 ko-normal">
                                {searchQuery || posFilter !== 'All' ? '조건에 맞는 선수가 없습니다.' : '선수 데이터 로딩 중…'}
                            </p>
                        ) : (
                            <div className="divide-y divide-slate-800/60">
                                {availablePlayers.map(player => (
                                    <button
                                        key={player.id}
                                        onClick={() => handleDraft(player)}
                                        disabled={!isMyTurn || isSubmitting}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                            ${isMyTurn && !isSubmitting
                                                ? 'hover:bg-indigo-600/10 hover:border-l-2 hover:border-indigo-500 cursor-pointer'
                                                : 'cursor-default opacity-70'
                                            }`}
                                    >
                                        <span className="text-sm font-bold text-indigo-300 w-8 text-right tabular-nums shrink-0">
                                            {player.ovr}
                                        </span>
                                        <PositionBadge pos={player.position} />
                                        <span className="flex-1 text-sm text-white truncate ko-normal">
                                            {player.name}
                                        </span>
                                        {isMyTurn && !isSubmitting && (
                                            <span className="text-[10px] text-indigo-400 font-bold shrink-0 ko-normal">
                                                선택
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 내 로스터 + 최근 픽 */}
                <div className="w-64 flex flex-col overflow-hidden shrink-0">

                    {/* 내 로스터 */}
                    <div className="flex-1 overflow-y-auto border-b border-slate-800">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1">
                            내 로스터 ({myRoster.length}/{draftState.totalRounds})
                        </p>
                        {myRoster.length === 0 ? (
                            <p className="text-xs text-slate-600 px-4 py-2 ko-normal">아직 없음</p>
                        ) : (
                            <div className="divide-y divide-slate-800/40">
                                {myRoster.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 px-4 py-1.5">
                                        <span className="text-xs font-bold text-slate-400 w-6 text-right tabular-nums">
                                            {p.ovr}
                                        </span>
                                        <PositionBadge pos={p.position} />
                                        <span className="text-xs text-white truncate ko-normal">{p.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 최근 픽 */}
                    <div className="overflow-y-auto max-h-48">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 pt-3 pb-1">
                            최근 픽
                        </p>
                        {draftState.picks.length === 0 ? (
                            <p className="text-xs text-slate-600 px-4 py-2 ko-normal">-</p>
                        ) : (
                            <div className="divide-y divide-slate-800/40">
                                {[...draftState.picks].reverse().slice(0, 20).map(pick => (
                                    <div key={pick.pickIndex} className="flex items-center gap-2 px-4 py-1.5">
                                        <span className="text-[10px] text-slate-500 w-4 tabular-nums shrink-0">
                                            {pick.pickIndex + 1}
                                        </span>
                                        <PositionBadge pos={pick.position} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white truncate ko-normal">{pick.playerName}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{pick.teamId}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MultiDraftView;
