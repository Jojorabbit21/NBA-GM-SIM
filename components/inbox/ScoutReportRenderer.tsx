import React from 'react';
import { ScoutReportContent, Team } from '../../types';
import { TEAM_DATA } from '../../data/teamData';

interface ScoutReportRendererProps {
    content: ScoutReportContent;
    teams: Team[];
    onPlayerClick: (id: string) => void;
}

export const ScoutReportRenderer: React.FC<ScoutReportRendererProps> = ({ content, teams, onPlayerClick }) => {
    const teamFullName = (() => {
        const td = TEAM_DATA[content.teamId];
        return td ? `${td.city} ${td.name}` : content.teamName;
    })();

    const growCount = content.players.filter(p => p.netDelta > 0).length;
    const declineCount = content.players.filter(p => p.netDelta < 0).length;

    return (
        <div className="space-y-8 text-slate-300 leading-relaxed">
            {/* 서신 본문 */}
            <p>
                단장님, {content.monthLabel} 선수단 현황을 정리하여 보고드립니다.
                {content.players.length > 0 ? (
                    <> 이번 달 <span className="text-white font-bold">{content.players.length}명</span>의 선수에게서 눈에 띄는 부분이 있었습니다
                    {growCount > 0 && <> (<span className="text-emerald-400 font-bold">성장세 {growCount}명</span>{declineCount > 0 && <>, <span className="text-rose-400 font-bold">하락세 {declineCount}명</span></>})</>}
                    .</>
                ) : (
                    <> 이번 달에는 눈에 띄는 능력치 변화가 관찰되지 않았습니다. 선수들이 안정적으로 경기를 소화하고 있으며, 다음 달 보고서에서 의미 있는 변화를 확인할 수 있을 것으로 보입니다.</>
                )}
            </p>

            {/* 선수별 변화 목록 */}
            {content.players.length > 0 && (
                <div className="space-y-4">
                    {content.players.map(player => (
                        <div key={player.playerId}>
                            <button
                                className="text-white hover:text-indigo-400 transition-colors font-medium"
                                onClick={() => onPlayerClick(player.playerId)}
                            >
                                {player.playerName}
                            </button>
                            <span className="text-slate-500 text-sm ml-1.5">({player.age}세, {player.position})</span>
                            <div className="mt-1 pl-3 space-y-0.5">
                                {player.changes.map(c => (
                                    <div key={c.attribute} className="text-sm">
                                        <span className="text-slate-500 mr-1">-</span>
                                        <span className="text-slate-400">{c.attributeKr}</span>
                                        {' '}
                                        <span className={c.totalDelta > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                            {c.totalDelta > 0 ? '+' : ''}{c.totalDelta}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 서명 */}
            <div className="pt-4">
                <p className="text-white font-bold">{teamFullName} 스카우팅 담당자</p>
                <p className="text-slate-500 text-xs mt-0.5">Head of Scouting</p>
            </div>
        </div>
    );
};
