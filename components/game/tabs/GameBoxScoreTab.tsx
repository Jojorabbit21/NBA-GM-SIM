
import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Team, PlayerBoxScore, Game } from '../../../types';
import { BoxScoreTable, GameStatLeaders } from '../BoxScoreTable';
import { AdvancedBoxScoreTable } from '../AdvancedBoxScoreTable';
import { DefenseBoxScoreTable } from '../DefenseBoxScoreTable';
import { Dropdown, DropdownButton } from '../../common/Dropdown';

type StatMode = 'traditional' | 'advanced' | 'defense';
const STAT_MODES: { id: StatMode; label: string }[] = [
    { id: 'traditional', label: 'Traditional' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'defense', label: 'Defense' },
];

interface GameBoxScoreTabProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    mvpId: string;
    leaders: GameStatLeaders;
    otherGames?: Game[];
    teams: Team[]; // For looking up other games' team logos
    onSelectGame?: (gameId: string) => void; // [New]
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
    /** true면 두 팀 테이블을 상하 대신 좌우로 분할 배치(멀티플레이어 전용, 기본값 false=기존 상하 배치 유지) */
    splitLayout?: boolean;
    /** 선수 id → 프로필 경로(멀티플레이어 전용). 주어지면 박스스코어 선수 이름이 링크가 된다 */
    getPlayerHref?: (playerId: string) => string | undefined;
}

// 팀별 헤더 우측에 들어가는 Traditional/Advanced/Defense 드롭다운 — 팀마다 독립적으로 전환 가능.
// 공용 Dropdown/DropdownButton 컴포넌트 재사용(다른 화면들과 동일한 드롭다운 룩앤필 유지).
const StatModeSelector: React.FC<{ value: StatMode; onChange: (m: StatMode) => void }> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const current = STAT_MODES.find(m => m.id === value) ?? STAT_MODES[0];

    return (
        <Dropdown
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            align="right"
            width="w-36"
            className="shrink-0"
            trigger={
                <DropdownButton
                    label={current.label}
                    isOpen={isOpen}
                    className="!px-3 !py-1.5 !bg-transparent !border-transparent hover:!border-transparent !shadow-none !gap-2"
                />
            }
            items={STAT_MODES.map(m => ({
                id: m.id,
                label: m.label,
                active: m.id === value,
                onClick: () => onChange(m.id),
            }))}
        />
    );
};

export const GameBoxScoreTab: React.FC<GameBoxScoreTabProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, mvpId, leaders, otherGames, teams, onSelectGame, homeBadge, awayBadge, splitLayout, getPlayerHref
}) => {

    const getTeamInfo = (id: string) => teams.find(t => t.id === id);

    // 싱글: 출전하지 않은 선수(DNP)는 제외. 멀티(splitLayout): 로스터 전원을 보여주고 DNP는 표에서 "Did Not Play"로 표기한다.
    const activeHomeBox = useMemo(() => splitLayout ? homeBox : homeBox.filter(p => p.mp > 0), [homeBox, splitLayout]);
    const activeAwayBox = useMemo(() => splitLayout ? awayBox : awayBox.filter(p => p.mp > 0), [awayBox, splitLayout]);
    // 좌우 표 높이를 맞추려고 인원이 적은 팀에 덧붙일 빈 행 수(멀티 전용)
    const maxRows = Math.max(activeHomeBox.length, activeAwayBox.length);

    // 팀별로 독립적으로 전환 — 원정/홈 각자 다른 스탯 모드를 볼 수 있음
    const [awayStatMode, setAwayStatMode] = useState<StatMode>('traditional');
    const [homeStatMode, setHomeStatMode] = useState<StatMode>('traditional');

    const renderTeamTable = (side: 'away' | 'home') => {
        const mode = side === 'away' ? awayStatMode : homeStatMode;
        const setMode = side === 'away' ? setAwayStatMode : setHomeStatMode;
        const team = side === 'away' ? awayTeam : homeTeam;
        const box = side === 'away' ? activeAwayBox : activeHomeBox;
        const oppBox = side === 'away' ? activeHomeBox : activeAwayBox;
        const badge = side === 'away' ? awayBadge : homeBadge;
        const headerRight = <StatModeSelector value={mode} onChange={setMode} />;
        const padRows = splitLayout ? maxRows - box.length : 0;

        if (mode === 'advanced') {
            return <AdvancedBoxScoreTable team={team} box={box} oppBox={oppBox} mvpId={mvpId} badge={badge} standalone={splitLayout} headerRight={headerRight} getProfileHref={getPlayerHref} padRows={padRows} />;
        }
        if (mode === 'defense') {
            return <DefenseBoxScoreTable team={team} box={box} mvpId={mvpId} badge={badge} standalone={splitLayout} headerRight={headerRight} getProfileHref={getPlayerHref} padRows={padRows} />;
        }
        return (
            <BoxScoreTable
                team={team}
                box={box}
                isFirst={side === 'away'}
                mvpId={mvpId}
                leaders={leaders}
                badge={badge}
                standalone={splitLayout}
                headerRight={headerRight}
                getProfileHref={getPlayerHref}
                padRows={padRows}
            />
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Box Scores Container - 기본은 상하 배치, splitLayout이면 좌우 분할(각자 독립 가로 스크롤,
                컨테이너 해체 — 갭 없이 바디를 꽉 채움). 각 팀 헤더 우측에 Traditional/Advanced/Defense
                셀렉터가 독립적으로 들어가 팀별로 다른 스탯 모드를 볼 수 있다. */}
            <div className={splitLayout
                ? "grid grid-cols-1 lg:grid-cols-2 gap-0"
                : "flex flex-col gap-0"
            }>
                <div className={splitLayout ? "overflow-x-auto" : undefined}>
                    {renderTeamTable('away')}
                </div>
                <div className={splitLayout ? "overflow-x-auto" : undefined}>
                    {renderTeamTable('home')}
                </div>
            </div>

            {/* Around the League */}
            {otherGames && otherGames.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-800/50">
                    <h3 className="text-sm font-black text-slate-500 mb-4 flex items-center gap-2">
                        <Activity size={16} /> 타구장 경기 결과
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {otherGames.map(g => {
                            const h = getTeamInfo(g.homeTeamId);
                            const a = getTeamInfo(g.awayTeamId);
                            if (!h || !a) return null;
                            
                            const hScore = g.homeScore || 0;
                            const aScore = g.awayScore || 0;
                            const hWin = hScore > aScore;
                            
                            return (
                                <button 
                                    key={g.id} 
                                    onClick={() => onSelectGame && onSelectGame(g.id)}
                                    className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 hover:bg-slate-800 transition-all hover:border-slate-600 cursor-pointer active:scale-95 group"
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={a.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold group-hover:text-white transition-colors ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                        </div>
                                        <span className={`text-sm font-black ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{aScore}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={h.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold group-hover:text-white transition-colors ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                        </div>
                                        <span className={`text-sm font-black ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{hScore}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
