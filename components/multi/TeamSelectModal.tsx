
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, LogIn, X } from 'lucide-react';
import { joinLeague, claimTeam } from '../../services/multi/leagueService';
import { listLeagueTeams } from '../../services/multi/roomQueries';
import type { LeagueRow, LeagueTeamRow } from '../../services/multi/roomQueries';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../utils/constants';

interface TeamSelectModalProps {
    league:  LeagueRow;
    roomId:  string;
    userId:  string;
    onClose: () => void;
    /** "입장하기" 클릭 시 호출 — 팀 선점이 끝난 뒤 시즌 화면으로 이동시키는 건 호출부 책임. */
    onEntered: () => void;
}

// public/logos/real/ 로고 세트 — 다른 멀티 화면들(MultiStandingsView/MultiScheduleView 등)과
// 동일한 폴백 체인(신규 로고 세트 실패 시 구버전 → 플레이스홀더).
const TeamLogoImg: React.FC<{ teamSlug: string; abbr: string }> = ({ teamSlug, abbr }) => (
    <img
        src={getRealTeamLogoUrl(teamSlug)}
        alt={abbr}
        className="w-14 h-14 object-contain shrink-0"
        onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback !== 'old') {
                img.dataset.fallback = 'old';
                img.src = getTeamLogoUrl(teamSlug);
            } else {
                img.src = 'https://placehold.co/100x100?text=BPL';
            }
        }}
    />
);

// 홈 화면 "참가" 버튼 → 이 팝업에서 바로 팀을 고르고 "입장하기"까지 한 번에 처리한다
// (기존엔 참가 즉시 로비로 이동해서 팀 목록 테이블에서 다시 골라야 했음). 카드 클릭은
// 로컬 선택 상태만 바꾸는 순수 UI 동작이고, 실제 참가(joinLeague)+팀 선점(claimTeam)
// 서버 요청은 "입장하기"를 눌렀을 때 한 번만 보낸다 — 카드를 여러 번 눌러보며 고민해도
// 매번 네트워크 왕복이 생기지 않는다. 입장 시점에 이미 다른 유저가 먼저 선점했을 수도
// 있으므로(동시 클릭 경합) claimTeam 실패 시 에러를 보여주고 팀 목록을 다시 불러온다.
export const TeamSelectModal: React.FC<TeamSelectModalProps> = ({ league, roomId, userId, onClose, onEntered }) => {
    const [teams,         setTeams]         = useState<LeagueTeamRow[]>([]);
    const [loadingTeams,  setLoadingTeams]  = useState(true);
    const [selectedId,    setSelectedId]    = useState<string | null>(null);
    const [entering,      setEntering]      = useState(false);
    const [err,           setErr]           = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listLeagueTeams(roomId).then(rows => {
            if (cancelled) return;
            setTeams(rows);
            setSelectedId(rows.find(t => t.user_id === userId)?.id ?? null);
            setLoadingTeams(false);
        });
        return () => { cancelled = true; };
    }, [roomId, userId]);

    // 클릭 즉시 서버로 보내지 않고 로컬 선택만 갱신 — 이미 다른 유저가 선점한 팀만 막는다.
    const handleSelect = (team: LeagueTeamRow) => {
        if (team.user_id !== null && team.user_id !== userId) return;
        setSelectedId(team.id);
        setErr(null);
    };

    const selectedTeam = teams.find(t => t.id === selectedId) ?? null;

    const handleEnter = async () => {
        if (!selectedTeam || entering) return;
        setEntering(true);
        setErr(null);
        const { error: joinErr } = await joinLeague(league.id, userId);
        if (joinErr) { setErr(joinErr); setEntering(false); return; }
        const { error: claimErr } = await claimTeam(roomId, selectedTeam.id, userId);
        if (claimErr) {
            setErr(claimErr);
            setEntering(false);
            listLeagueTeams(roomId).then(setTeams); // 경합으로 이미 선점됐을 수 있음 — 최신 상태 반영
            return;
        }
        setEntering(false);
        onEntered();
    };

    // 홈 화면(InlineLeagueList)의 "relative z-10" 콘텐츠 래퍼 안에서 열리면 그 z-10이 새
    // 스태킹 컨텍스트를 만들어 내부 z-index가 하단 footer(동일 z-10, DOM상 뒤)에 가려지는
    // 문제가 있어 document.body로 포탈 — CreateLeagueModal.tsx와 동일 패턴.
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-white ko-tight">{league.name}</h2>
                        <p className="text-sm text-slate-500 ko-normal mt-1">참가할 팀을 선택하세요</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* 팀 그리드 */}
                <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
                    {loadingTeams ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={20} className="animate-spin text-indigo-400" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-4">
                            {teams.map(team => {
                                const isEmpty     = team.user_id === null;
                                const isMine      = team.id === selectedId;
                                const isDisabled  = !isEmpty && !isMine;

                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => handleSelect(team)}
                                        disabled={isDisabled || entering}
                                        className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl border text-left transition-colors ${
                                            isMine
                                                ? 'border-indigo-500 bg-indigo-500/10'
                                                : isDisabled
                                                ? 'border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed'
                                                : 'border-slate-800 bg-slate-900/60 hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer'
                                        }`}
                                    >
                                        <div className="w-14 h-14 shrink-0">
                                            <TeamLogoImg teamSlug={team.team_slug} abbr={team.team_abbr} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-base font-bold text-white truncate">{team.team_name}</p>
                                            <p className="text-sm text-slate-500 truncate ko-normal mt-0.5">
                                                {isMine ? '선택됨' : isEmpty ? '선택 가능' : (team.nickname ?? '참가 중')}
                                            </p>
                                        </div>
                                        {isMine && <Check size={20} className="text-indigo-400 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 푸터 — 버튼 자체는 팝업 확대와 무관하게 예전 사이즈 유지 */}
                <div className="px-8 py-5 border-t border-slate-800 space-y-3 shrink-0">
                    {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleEnter}
                            disabled={!selectedTeam || entering}
                            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {entering
                                ? <><Loader2 size={14} className="animate-spin" />입장 중…</>
                                : <><LogIn size={14} />입장하기</>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TeamSelectModal;
