/**
 * ContractManagementTab — FrontOfficeView의 "계약 관리" 탭
 * FAView.tsx의 roster 탭(팀 옵션 결정 + 로스터 테이블 + NegotiationScreen 오버레이)을 이전
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { Team, Player, ReleaseType } from '../../types';
import type { PlayerContract } from '../../types/player';
import type { NegotiationState } from '../../services/fa/extensionEngine';
import type { OffseasonPhase } from '../../types/app';
import { getExtensionCandidates } from '../../services/fa/extensionEngine';
import { NegotiationScreen } from '../../views/NegotiationScreen';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ContractManagementTabProps {
    myTeam: Team;
    teams: Team[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    offseasonPhase?: OffseasonPhase;
    onReleasePlayer: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onTeamOptionDecide: (playerId: string, exercised: boolean) => void;
    onExtensionOffer: (playerId: string, contract: PlayerContract) => void;
    onViewPlayer?: (player: Player) => void;
    currentDate?: string;
    initialNegotiateId?: string;                             // 자동 오픈 선수 ID
    initialNegotiateType?: 'extension' | 'release';          // 자동 오픈 협상 타입
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtM(val: number): string {
    return `$${(val / 1_000_000).toFixed(1)}M`;
}

function getAttrColor(v: number): string {
    if (v >= 90) return 'text-fuchsia-400';
    if (v >= 80) return 'text-emerald-400';
    if (v >= 70) return 'text-amber-400';
    return 'text-slate-500';
}

// ─────────────────────────────────────────────────────────────
// ContractManagementTab
// ─────────────────────────────────────────────────────────────

export const ContractManagementTab: React.FC<ContractManagementTabProps> = ({
    myTeam,
    teams,
    tendencySeed,
    currentSeasonYear,
    currentSeason,
    offseasonPhase,
    onReleasePlayer,
    onTeamOptionDecide,
    onExtensionOffer,
    onViewPlayer,
    currentDate = '',
    initialNegotiateId,
    initialNegotiateType,
}) => {
    // extension / release 타입만 (fa 타입 없음)
    const [negotiationTarget, setNegotiationTarget] = useState<{
        type: 'extension' | 'release';
        playerId: string;
    } | null>(null);

    // PlayerDetailView에서 직접 진입 시 자동 오픈
    useEffect(() => {
        if (initialNegotiateId && initialNegotiateType) {
            setNegotiationTarget({ type: initialNegotiateType, playerId: initialNegotiateId });
        }
    }, [initialNegotiateId, initialNegotiateType]);

    // 결렬된 협상 선수 ID (Extension 결렬 — 재협상 불가)
    const [blockedNegotiationIds, setBlockedNegotiationIds] = useState<Set<string>>(new Set());

    // Extension 협상 라운드 간 쿨다운: playerId → 다음 오퍼 가능 날짜
    const [cooldownMap, setCooldownMap] = useState<Record<string, string>>({});

    // Extension 감정 상태 영속화: playerId → NegotiationState
    const [extNegStates, setExtNegStates] = useState<Record<string, NegotiationState>>({});

    const isOffseasonPhase = offseasonPhase === 'FA_OPEN' || offseasonPhase === 'PRE_SEASON';

    const sortedRoster = useMemo(
        () => [...myTeam.roster].sort((a, b) => b.ovr - a.ovr),
        [myTeam.roster],
    );

    // 팀 옵션 대기 선수
    const pendingTeamOptions = useMemo(
        () => isOffseasonPhase ? myTeam.roster.filter(p =>
            p.contract?.option?.type === 'team' &&
            p.contract.option.year === p.contract.currentYear
        ) : [],
        [myTeam.roster, isOffseasonPhase],
    );

    // 일반 로스터 (현재 결정해야 할 팀옵션 선수 제외, 오프시즌 중에만)
    const regularRoster = useMemo(
        () => sortedRoster.filter(p =>
            !isOffseasonPhase ||
            p.contract?.option?.type !== 'team' ||
            p.contract.option.year !== p.contract.currentYear
        ),
        [sortedRoster, isOffseasonPhase],
    );

    const extensionCandidates = useMemo(() => getExtensionCandidates(myTeam), [myTeam.roster]);

    // NegotiationScreen용 선수 데이터
    const ntPlayer: Player | null = negotiationTarget
        ? (myTeam.roster.find(p => p.id === negotiationTarget.playerId)
            ?? (negotiationTarget.type === 'extension'
                ? extensionCandidates.find(p => p.id === negotiationTarget.playerId) ?? null
                : null))
        : null;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

            {/* ── 팀 옵션 결정 섹션 ── */}
            {pendingTeamOptions.length > 0 && (
                <div className="border-b-2 border-cyan-500/30 bg-cyan-500/5">
                    <div className="px-4 py-2.5 flex items-center gap-2 border-b border-cyan-500/20">
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">팀 옵션 결정 대기</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{pendingTeamOptions.length}</span>
                        <span className="text-[10px] text-slate-500 ml-1">— 행사하지 않으면 선수가 FA로 이동합니다</span>
                    </div>
                    {pendingTeamOptions.map(player => {
                        const optionSalary = player.contract!.years[player.contract!.option!.year] ?? 0;
                        return (
                            <div
                                key={player.id}
                                className="px-4 py-3 flex items-center gap-3 border-b border-cyan-500/10"
                            >
                                {/* 선수 정보 */}
                                <div className="flex-1 min-w-0">
                                    <button
                                        onClick={() => onViewPlayer?.(player)}
                                        className="font-bold text-sm text-white hover:text-cyan-400 transition-colors truncate ko-tight block"
                                    >
                                        {player.name}
                                    </button>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                        {player.position} · OVR {player.ovr} · Age {player.age}
                                    </div>
                                </div>
                                {/* 옵션 연봉 */}
                                <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-cyan-300">{fmtM(optionSalary)}</div>
                                    <div className="text-[9px] text-slate-500">옵션 연봉</div>
                                </div>
                                {/* 행사 / 거부 버튼 */}
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => onTeamOptionDecide(player.id, true)}
                                        className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600/40 transition-colors"
                                    >행사</button>
                                    <button
                                        onClick={() => onTeamOptionDecide(player.id, false)}
                                        className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                                    >거부</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── 일반 로스터 테이블 ── */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: 900 }}>
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800 border-b border-slate-700">
                            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 160 }}>선수</th>
                            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 60 }}>포지션</th>
                            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 48 }}>나이</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-l border-slate-700" style={{ width: 52 }}>INS</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>OUT</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>PLM</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>DEF</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>REB</th>
                            <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-r border-slate-700" style={{ width: 52 }}>ATH</th>
                            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 80 }}>연봉</th>
                            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 56 }}>잔여</th>
                            <th className="px-4 py-2" style={{ width: 120 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {myTeam.roster.length === 0 ? (
                            <tr><td colSpan={12} className="py-16 text-center text-slate-500 text-sm">로스터에 선수가 없습니다.</td></tr>
                        ) : regularRoster.length === 0 ? (
                            <tr><td colSpan={12} className="py-8 text-center text-slate-500 text-sm">모든 선수가 팀 옵션 대기 중입니다.</td></tr>
                        ) : (
                            regularRoster.map(player => {
                                const salary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                                const yearsLeft = player.contract ? player.contract.years.length - (player.contract.currentYear ?? 0) : 0;
                                return (
                                    <tr key={player.id} className="group border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-2">
                                            <button
                                                onClick={() => onViewPlayer?.(player)}
                                                className="font-bold text-white hover:text-indigo-400 transition-colors ko-tight block truncate max-w-[140px]"
                                            >
                                                {player.name}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 font-mono text-slate-400">{player.position}</td>
                                        <td className="px-4 py-2 font-mono text-slate-400">{player.age}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center border-l border-slate-800/60 ${getAttrColor(player.ins ?? 50)}`}>{player.ins ?? '-'}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.out ?? 50)}`}>{player.out ?? '-'}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.plm ?? 50)}`}>{player.plm ?? '-'}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.def ?? 50)}`}>{player.def ?? '-'}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.reb ?? 50)}`}>{player.reb ?? '-'}</td>
                                        <td className={`px-3 py-2 font-mono font-black text-center border-r border-slate-800/60 ${getAttrColor(player.ath ?? 50)}`}>{player.ath ?? '-'}</td>
                                        <td className="px-4 py-2 font-mono text-slate-400 whitespace-nowrap">{fmtM(salary)}</td>
                                        <td className="px-4 py-2 font-mono text-slate-400">{yearsLeft}년</td>
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => !blockedNegotiationIds.has(player.id) && setNegotiationTarget({ type: 'extension', playerId: player.id })}
                                                    disabled={blockedNegotiationIds.has(player.id)}
                                                    className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-violet-600/30 bg-violet-600/15 text-violet-400 hover:bg-violet-600/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                >연장</button>
                                                <button
                                                    onClick={() => setNegotiationTarget({ type: 'release', playerId: player.id })}
                                                    className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-600/30 bg-red-600/15 text-red-400 hover:bg-red-600/25 active:scale-95 transition-all"
                                                >방출</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── NegotiationScreen 오버레이 (extension / release 타입만) ── */}
            {negotiationTarget && ntPlayer && (
                <NegotiationScreen
                    negotiationType={negotiationTarget.type}
                    player={ntPlayer}
                    myTeam={myTeam}
                    teams={teams}
                    tendencySeed={tendencySeed}
                    currentSeasonYear={currentSeasonYear}
                    currentSeason={currentSeason}
                    usedMLE={{}}
                    extensionNotYet={
                        negotiationTarget.type === 'extension' &&
                        (ntPlayer.contract
                            ? ntPlayer.contract.years.length - (ntPlayer.contract.currentYear ?? 0)
                            : 0) > 1
                    }
                    onClose={() => setNegotiationTarget(null)}
                    onExtensionSigned={(playerId, contract) => {
                        onExtensionOffer(playerId, contract);
                    }}
                    onNegotiationBlocked={(playerId) => {
                        setBlockedNegotiationIds(prev => new Set([...prev, playerId]));
                    }}
                    onCooldownStarted={(playerId, nextOfferDate) => {
                        setCooldownMap(prev => ({ ...prev, [playerId]: nextOfferDate }));
                    }}
                    onNegStateChange={(playerId, state) => {
                        setExtNegStates(prev => ({ ...prev, [playerId]: state }));
                    }}
                    persistedNegState={negotiationTarget ? extNegStates[negotiationTarget.playerId] : undefined}
                    currentDate={currentDate}
                    cooldownNextDate={negotiationTarget ? cooldownMap[negotiationTarget.playerId] : undefined}
                    onReleasePlayer={onReleasePlayer}
                    onViewPlayer={onViewPlayer}
                />
            )}
        </div>
    );
};
