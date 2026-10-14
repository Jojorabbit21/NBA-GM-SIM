
import React, { useEffect, useState } from 'react';
import { actionFailure } from '../../services/notifications/actionErrorCatalog';
import { InlineNotice } from '../../components/common/InlineNotice';
import { Check, LogIn } from 'lucide-react';
import { joinLeague, claimTeam } from '../../services/multi/leagueService';
import { listLeagueTeams } from '../../services/multi/roomQueries';
import type { LeagueRow, LeagueTeamRow } from '../../services/multi/roomQueries';
import { TeamLogo } from '../common/TeamLogo';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';

interface TeamSelectModalProps {
    league:  LeagueRow;
    roomId:  string;
    userId:  string;
    onClose: () => void;
    /** "입장하기" 클릭 시 호출 — 팀 선점이 끝난 뒤 시즌 화면으로 이동시키는 건 호출부 책임. */
    onEntered: () => void;
}

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
    // [2026-10-13] 목록 로딩 실패 — 예전엔 .then만 있어 스피너가 영구히 돌았음. 다시 불러오기(loadTick)로 재시도.
    const [loadErr,       setLoadErr]       = useState<string | null>(null);
    const [loadTick,      setLoadTick]      = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoadingTeams(true);
        setLoadErr(null);
        listLeagueTeams(roomId).then(rows => {
            if (cancelled) return;
            setTeams(rows);
            setSelectedId(rows.find(t => t.user_id === userId)?.id ?? null);
            setLoadingTeams(false);
        }).catch(e => {
            if (cancelled) return;
            setLoadErr(actionFailure(e, '팀 목록 불러오기'));
            setLoadingTeams(false);
        });
        return () => { cancelled = true; };
    }, [roomId, userId, loadTick]);

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

    // [2026-10-13] 직접 구현하던 오버레이/패널/헤더/푸터 → 공용 Modal(body 포탈·z-modal·배경 클릭 닫기 포함).
    // 홈 화면(InlineLeagueList)의 "relative z-10" 래퍼 안에서 열려도 포탈 덕에 하단 footer에 가려지지 않는다.
    // 패널 폭은 공용 size 단계(md 2xl / lg 4xl / xl 6xl)에 없는 5xl이라 className으로 덮어씀.
    return (
        <Modal
            isOpen
            onClose={onClose}
            size="xl"
            rounded="rounded-2xl"
            backdropClass="bg-black/60"
            className="!max-w-5xl"
            title={(
                <div>
                    <div className="text-xl font-black text-white ko-tight">{league.name}</div>
                    <p className="text-sm font-normal text-slate-500 ko-normal mt-1">참가할 팀을 선택하세요</p>
                </div>
            )}
            footer={(
                <div className="space-y-3">
                    {err && <InlineNotice tone="danger">{err}</InlineNotice>}
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="xl" shape="xl" onClick={onClose}>
                            취소
                        </Button>
                        <Button
                            variant="primary"
                            size="xl"
                            shape="xl"
                            onClick={handleEnter}
                            disabled={!selectedTeam || entering}
                            isLoading={entering}
                            loadingText="입장 중…"
                            icon={<LogIn size={14} />}
                        >
                            입장하기
                        </Button>
                    </div>
                </div>
            )}
        >
            <div className="px-8 py-6">
                {loadingTeams ? (
                    <Spinner variant="section" />
                ) : loadErr ? (
                    <div className="flex flex-col items-center gap-3 py-10">
                        <InlineNotice tone="danger" className="max-w-md">{loadErr}</InlineNotice>
                        <Button variant="secondary" onClick={() => setLoadTick(t => t + 1)}>다시 불러오기</Button>
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
                                        <TeamLogo teamId={team.team_slug} teamName={team.team_abbr} size="custom" className="w-14 h-14 shrink-0" shadow={false} />
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
        </Modal>
    );
};

export default TeamSelectModal;
