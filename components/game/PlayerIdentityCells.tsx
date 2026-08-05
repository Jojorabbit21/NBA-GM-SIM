
import React from 'react';
import { Crown, Shield, Lock, Unlock } from 'lucide-react';
import { Player, PlayerBoxScore } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { TableCell, TableHeaderCell } from '../common/Table';
import { Skeleton } from '../common/Skeleton';
import { calculatePlayerOvr } from '../../utils/constants';

// PLAYER/POS/OVR 3열 — Traditional/Advanced/Defense 셀렉터를 바꿔도 절대 바뀌면 안 되는 공통 열.
// BoxScoreTable/AdvancedBoxScoreTable/DefenseBoxScoreTable 세 테이블이 전부 이 컴포넌트를
// 공유해서 디자인/행 높이가 100% 동일하게 유지되도록 한다(OVR 배지 높이가 행 높이를 결정하는
// 실질적 기준이라, 세 테이블 모두 이 컴포넌트를 쓰면 자동으로 행 높이가 맞춰진다).

export const PlayerIdentityHeaderCells: React.FC = () => (
    <>
        <TableHeaderCell align="left" className="px-4 w-40">PLAYER</TableHeaderCell>
        <TableHeaderCell align="center" className="w-12">POS</TableHeaderCell>
        <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
    </>
);

interface PlayerIdentityCellsProps {
    player: PlayerBoxScore;
    /** team.roster에서 이 선수를 찾은 결과 — 호출부가 팀당 1회만 Map으로 미리 계산해서 넘긴다
     *  (행마다 team.roster.find()를 반복하면 선수 수×팀 수만큼 매 렌더 O(n·m) 선형 탐색이 된다) */
    playerInfo: Player | undefined;
    mvpId?: string;
    /** standalone(좌우 분할)일 땐 MVP 크라운 아이콘을 숨긴다(BoxScoreTable의 기존 동작과 동일) */
    standalone?: boolean;
}

export const PlayerIdentityCells: React.FC<PlayerIdentityCellsProps> = ({ player: p, playerInfo, mvpId, standalone }) => {
    // [Fix 2026-08-05] "경기 전환 시 OVR이 70으로 잠깐 보였다가 정정된다" 버그 — 멀티플레이어는
    // 실제 능력치(rosterCache) 로딩 전에 {id,name,position}만 있는 스텁을 team.roster에 채워
    // 넣는데, 이 스텁도 playerInfo 존재 자체는 truthy라 위 삼항연산자로는 못 걸러진다. 스텁엔
    // Player의 필수 필드인 age가 없으므로 그걸로 "진짜 로딩된 데이터인지"를 판별한다.
    const isStub = playerInfo != null && (playerInfo as { age?: number }).age === undefined;
    const ovr = !playerInfo ? 70 : isStub ? null : calculatePlayerOvr(playerInfo);
    const isMvp = p.playerId === mvpId;
    const effect = p.matchupEffect || 0;
    const isBuff = effect > 0;
    const isDebuff = effect < 0;

    return (
        <>
            <TableCell className="px-4">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-white'}`}>{p.playerName}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {isMvp && !standalone && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                        {p.isStopper && (
                            <div className="flex items-center justify-center" title="Ace Stopper">
                                <Shield size={12} className="text-cyan-400 fill-cyan-900" />
                            </div>
                        )}
                        {p.isAceTarget && (
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDebuff ? 'bg-red-950/50 border-red-500/30' : isBuff ? 'bg-emerald-950/50 border-emerald-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                                {isDebuff ? (
                                    <Lock size={10} className="text-red-400" />
                                ) : (
                                    <Unlock size={10} className={isBuff ? "text-emerald-400" : "text-slate-400"} />
                                )}
                                <span className={`text-[9px] font-black leading-none ${isDebuff ? 'text-red-400' : isBuff ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {effect > 0 ? '+' : ''}{effect}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </TableCell>
            <TableCell align="center" className="text-xs font-semibold text-white">{playerInfo?.position || '-'}</TableCell>
            <TableCell align="center">
                <div className="flex justify-center">
                    {ovr === null
                        ? <Skeleton className="!w-7 !h-7 rounded-full" />
                        : <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />}
                </div>
            </TableCell>
        </>
    );
};
