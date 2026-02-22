
import React from 'react';
import { Target, Sliders, Clock, Activity, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { Team, TacticalSnapshot, PlayerBoxScore, TacticalSliders } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';

const OFFENSE_LABELS: Record<string, string> = {
    'Balance': '밸런스',
    'PaceAndSpace': '페이스&스페이스',
    'PerimeterFocus': '퍼리미터 포커스',
    'PostFocus': '포스트 포커스',
    'Grind': '그라인드',
    'SevenSeconds': '세븐 세컨즈'
};

const DEFENSE_LABELS: Record<string, string> = {
    'ManToManPerimeter': '대인방어',
    'ZoneDefense': '지역방어',
    'AceStopper': '에이스 봉쇄'
};

interface TacticsAnalysisProps {
    homeTeam: Team;
    awayTeam: Team;
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
}

export const TacticsAnalysis: React.FC<TacticsAnalysisProps> = ({ 
    homeTeam, awayTeam, homeTactics, awayTactics, homeBox, awayBox 
}) => {
    
    // Helper to calculate tactic grade based on logic
    const getTacticGrade = (tactic: string, box: PlayerBoxScore[], opponentBox: PlayerBoxScore[], pace: number) => {
        const teamTotals = box.reduce((acc, p) => ({
            pts: acc.pts + p.pts,
            p3a: acc.p3a + p.p3a,
            p3m: acc.p3m + p.p3m,
            ast: acc.ast + p.ast,
            fta: acc.fta + p.fta,
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga
        }), { pts: 0, p3a: 0, p3m: 0, ast: 0, fta: 0, fgm: 0, fga: 0 });

        const oppTotals = opponentBox.reduce((acc, p) => ({
            pts: acc.pts + p.pts,
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga
        }), { pts: 0, fgm: 0, fga: 0 });

        const p3Pct = teamTotals.p3a > 0 ? (teamTotals.p3m / teamTotals.p3a) : 0;

        let score = 70; // Base C
        let feedback = "무난한 전술 수행력을 보였습니다.";

        switch(tactic) {
            case 'PaceAndSpace':
            case 'SevenSeconds':
                if (teamTotals.p3a > 35) score += 10;
                if (p3Pct > 0.38) score += 15; else if (p3Pct < 0.33) score -= 10;
                if (teamTotals.ast > 25) score += 5;
                if (score >= 90) feedback = "완벽한 공간 창출! 외곽 슛이 불을 뿜었습니다.";
                else if (score >= 80) feedback = "빠른 템포와 3점 슛으로 상대를 공략했습니다.";
                else feedback = "슛 감각 난조로 스페이싱 효과를 보지 못했습니다.";
                break;
            case 'PostFocus':
                if (teamTotals.fta > 25) score += 10;
                if ((teamTotals.fgm / teamTotals.fga) > 0.5) score += 10;
                if (score >= 90) feedback = "골밑을 완전히 장악하며 파울을 이끌어냈습니다.";
                else if (score >= 80) feedback = "인사이드 공격이 효과적으로 통했습니다.";
                else feedback = "상대 골밑 수비에 고전하며 효율이 떨어졌습니다.";
                break;
            case 'Grind':
                if (oppTotals.pts < 100) score += 15;
                else if (oppTotals.pts > 115) score -= 15;
                if (pace < 4) score += 5;
                if (score >= 85) feedback = "진흙탕 수비로 상대 득점을 억제했습니다.";
                else feedback = "수비가 무너지며 의도한 경기 흐름을 놓쳤습니다.";
                break;
            case 'PerimeterFocus':
                if (teamTotals.p3a > 30 && p3Pct > 0.36) score += 15;
                feedback = score > 80 ? "외곽 자원들의 활약이 돋보였습니다." : "외곽 슛 침묵으로 경기가 풀리지 않았습니다.";
                break;
            case 'Balance':
                if (teamTotals.ast > 25 && teamTotals.pts > 110) score += 10;
                feedback = score > 80 ? "고른 득점 분포로 안정적인 경기를 펼쳤습니다." : "특색 없는 공격으로 흐름을 내줬습니다.";
                break;
        }
        
        if (score >= 95) return { grade: 'S', score, feedback };
        if (score >= 90) return { grade: 'A+', score, feedback };
        if (score >= 85) return { grade: 'A', score, feedback };
        if (score >= 80) return { grade: 'B+', score, feedback };
        if (score >= 75) return { grade: 'B', score, feedback };
        if (score >= 70) return { grade: 'C+', score, feedback };
        if (score >= 60) return { grade: 'C', score, feedback };
        return { grade: 'F', score, feedback };
    };

    const homeGrade = getTacticGrade(homeTactics?.offense || 'Balance', homeBox, awayBox, homeTactics?.pace || 5);
    const awayGrade = getTacticGrade(awayTactics?.offense || 'Balance', awayBox, homeBox, awayTactics?.pace || 5);

    // Calculate Average Possession Time
    const calculateAvgPossTime = (box: PlayerBoxScore[]) => {
        // Possessions = FGA + 0.44*FTA + TOV - OREB
        const stats = box.reduce((acc, p) => ({
            fga: acc.fga + p.fga,
            fta: acc.fta + p.fta,
            tov: acc.tov + p.tov,
            offReb: acc.offReb + (p.offReb || 0)
        }), { fga: 0, fta: 0, tov: 0, offReb: 0 });

        const possessions = stats.fga + (0.44 * stats.fta) + stats.tov - stats.offReb;
        
        // Game is 48 mins = 2880 seconds. Each team has ball roughly 50% of time (24 mins = 1440s)
        if (possessions <= 0) return 0;
        return (1440 / possessions).toFixed(1);
    };

    const SliderBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
        <div className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-500 font-bold w-24 truncate">{label}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className="h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${(value / 10) * 100}%`, backgroundColor: color }}
                ></div>
            </div>
            <span className="text-white font-mono font-bold w-4 text-right">{value}</span>
        </div>
    );

    // [New] Stopper Impact Table Component
    const StopperImpactTable: React.FC<{ 
        tactics: TacticalSnapshot, 
        myBox: PlayerBoxScore[], 
        oppBox: PlayerBoxScore[],
        myTeam: Team,
        oppTeam: Team
    }> = ({ tactics, myBox, oppBox, myTeam, oppTeam }) => {
        if (tactics.stopperId) {
            const stopperStats = myBox.find(p => p.playerId === tactics.stopperId);
            
            // [Bug Fix] Fallback logic if no interaction occurred (isAceTarget is false)
            // 1. Try to find the target marked by engine
            let targetStats = oppBox.find(p => p.isAceTarget);

            // 2. Fallback: Identify Ace by OVR among starters if no event triggered
            if (!targetStats && oppTeam) {
                const candidates = oppBox.filter(p => p.gs > 0);
                // If no starters in box (rare), check all
                const pool = candidates.length > 0 ? candidates : oppBox;

                let maxOvr = -1;
                let aceId = '';

                pool.forEach(stat => {
                    const rosterPlayer = oppTeam.roster.find(r => r.id === stat.playerId);
                    if (rosterPlayer) {
                        const ovr = calculatePlayerOvr(rosterPlayer);
                        if (ovr > maxOvr) {
                            maxOvr = ovr;
                            aceId = stat.playerId;
                        }
                    }
                });

                if (aceId) {
                    targetStats = oppBox.find(p => p.playerId === aceId);
                }
            }

            if (stopperStats && targetStats) {
                const effect = targetStats.matchupEffect || 0;
                const isDebuff = effect < 0;
                
                const stopperPlayer = myTeam.roster.find(p => p.id === stopperStats.playerId);
                const targetPlayer = oppTeam.roster.find(p => p.id === targetStats.playerId);

                const stopperOvr = stopperPlayer ? calculatePlayerOvr(stopperPlayer) : 70;
                const targetOvr = targetPlayer ? calculatePlayerOvr(targetPlayer) : 70;

                // Proxy for "Contest Success Rate" using DEF rating since raw contest % isn't stored
                const contestRating = stopperPlayer ? stopperPlayer.def : 0;

                return (
                    <div className="mt-4 bg-slate-950/60 rounded-xl border border-white/5 p-4 relative overflow-hidden">
                        <div className="flex items-center gap-2 text-indigo-300 font-black text-[10px] uppercase tracking-widest mb-3 border-b border-white/5 pb-2">
                            <ShieldAlert size={12} />
                            <span>에이스 스토퍼 수비 결과</span>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            {/* Row 1: Stopper */}
                            <div className="grid grid-cols-[1fr_40px_40px_80px] gap-2 items-center text-xs">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-[9px] font-black text-slate-500 uppercase bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">ME</span>
                                    <span className="font-bold text-white truncate">{stopperStats.playerName}</span>
                                </div>
                                <div className="text-center font-bold text-slate-400">{stopperPlayer?.position}</div>
                                <div className="flex justify-center"><OvrBadge value={stopperOvr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-0" /></div>
                                <div className="text-right flex items-center justify-end gap-1">
                                    <span className="text-[9px] text-slate-500">DEF</span>
                                    <span className="font-mono font-black text-emerald-400">{contestRating}</span>
                                </div>
                            </div>

                            <div className="h-px bg-white/5 w-full"></div>

                            {/* Row 2: Ace */}
                            <div className="grid grid-cols-[1fr_40px_40px_80px] gap-2 items-center text-xs">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-[9px] font-black text-slate-500 uppercase bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">VS</span>
                                    <span className="font-bold text-slate-300 truncate">{targetStats.playerName}</span>
                                </div>
                                <div className="text-center font-bold text-slate-500">{targetPlayer?.position}</div>
                                <div className="flex justify-center"><OvrBadge value={targetOvr} size="sm" className="!w-6 !h-6 !text-[10px] !mx-0 grayscale opacity-70" /></div>
                                <div className="flex justify-end">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${isDebuff ? 'bg-red-900/30 border-red-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                                        {isDebuff ? <Lock size={10} className="text-red-400" /> : <Unlock size={10} className="text-slate-400" />}
                                        <span className={`text-[10px] font-black ${isDebuff ? 'text-red-400' : 'text-slate-400'}`}>
                                            {effect > 0 ? '+' : ''}{effect}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
        }
        return null;
    };

    const TacticalCard: React.FC<{ 
        team: Team, 
        oppTeam: Team, 
        tactics?: TacticalSnapshot, 
        grade: any, 
        isHome: boolean, 
        box: PlayerBoxScore[], 
        oppBox: PlayerBoxScore[] 
    }> = ({ team, oppTeam, tactics, grade, isHome, box, oppBox }) => {
        const avgTime = calculateAvgPossTime(box);
        const teamColor = TEAM_DATA[team.id]?.colors.primary || '#6366f1';
        
        return (
            <div 
                className="flex flex-col gap-4 p-5 rounded-2xl border bg-slate-900/40 relative overflow-hidden transition-all duration-300 group"
                style={{ borderColor: `${teamColor}40` }}
            >
                {/* Subtle Glow Effect */}
                <div className="absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full opacity-10 pointer-events-none" style={{ backgroundColor: teamColor }}></div>

                <div className="flex items-center gap-3 border-b border-white/5 pb-3 relative z-10">
                    <TeamLogo teamId={team.id} size="md" />
                    <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isHome ? 'HOME' : 'AWAY'} STRATEGY</div>
                        <div className="font-black text-white uppercase">{OFFENSE_LABELS[tactics?.offense || 'Balance']}</div>
                    </div>
                    <div className={`text-2xl font-black oswald ${grade.score >= 80 ? 'text-emerald-400' : grade.score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {grade.grade}
                    </div>
                </div>
                
                {/* Secondary Info Row: Defense & Avg Time */}
                <div className="flex justify-between items-center bg-slate-950/30 p-2.5 rounded-xl border border-white/5 relative z-10">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Defensive Scheme</span>
                        <span className="text-xs font-bold text-slate-300">{DEFENSE_LABELS[tactics?.defense || 'ManToManPerimeter']}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                            <Clock size={10} /> Avg. Time
                        </span>
                        <span className="text-xs font-black text-white font-mono">{avgTime}s <span className="text-[9px] text-slate-500 font-bold">/ Poss</span></span>
                    </div>
                </div>

                {/* Slider Section */}
                {tactics?.sliders && (
                    <div className="pt-2 space-y-2 relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <Sliders size={12} className="text-slate-600" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Tactical Sliders</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <SliderBar label="공격 페이스" value={tactics.sliders.pace || 5} color={teamColor} />
                            <SliderBar label="공격 리바운드" value={tactics.sliders.offReb || 5} color={teamColor} />
                            <SliderBar label="수비 리바운드" value={tactics.sliders.defReb || 5} color={teamColor} />
                            <SliderBar label="수비 강도" value={tactics.sliders.defIntensity || 5} color={teamColor} />
                            <SliderBar label="풀 코트 프레스" value={tactics.sliders.fullCourtPress || 5} color={teamColor} />
                            <SliderBar label="존 디펜스 빈도" value={tactics.sliders.zoneUsage || 5} color={teamColor} />
                            <SliderBar label="볼 무브먼트" value={tactics.sliders.ballMovement || 5} color={teamColor} />
                            <SliderBar label="도움 수비" value={tactics.sliders.helpDef || 5} color={teamColor} />
                            <SliderBar label="스위치 빈도" value={tactics.sliders.switchFreq || 5} color={teamColor} />
                            <SliderBar label="아이솔레이션" value={tactics.sliders.play_iso || 5} color={teamColor} />
                            <SliderBar label="픽앤롤" value={tactics.sliders.play_pnr || 5} color={teamColor} />
                            <SliderBar label="포스트업" value={tactics.sliders.play_post || 5} color={teamColor} />
                            <SliderBar label="캐치앤슛" value={tactics.sliders.play_cns || 5} color={teamColor} />
                            <SliderBar label="돌파" value={tactics.sliders.play_drive || 5} color={teamColor} />
                            <SliderBar label="3점슛 비중" value={tactics.sliders.shot_3pt || 5} color={teamColor} />
                            <SliderBar label="중거리슛 비중" value={tactics.sliders.shot_mid || 5} color={teamColor} />
                            <SliderBar label="골밑슛 비중" value={tactics.sliders.shot_rim || 5} color={teamColor} />
                        </div>
                    </div>
                )}

                {/* Ace Stopper Section */}
                {tactics && tactics.stopperId && (
                     <StopperImpactTable tactics={tactics} myBox={box} oppBox={oppBox} myTeam={team} oppTeam={oppTeam} />
                )}

                <div className="pt-2 border-t border-white/5 relative z-10">
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed flex gap-2">
                        <Activity size={14} style={{ color: teamColor }} className="flex-shrink-0 mt-0.5" />
                        <span>"<span className="text-white font-bold">{grade.feedback}</span>"</span>
                    </p>
                </div>
            </div>
        );
    };

    if (!homeTactics || !awayTactics) return null;

    return (
        <div className="w-full bg-slate-950/30 border border-slate-800 rounded-3xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-6">
                <Target className="text-indigo-400" size={20} />
                <h3 className="text-lg font-black uppercase text-white tracking-widest ko-tight">Tactical Matchup Report</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Away (Left) vs Home (Right) Layout Order */}
                <TacticalCard team={awayTeam} oppTeam={homeTeam} tactics={awayTactics} grade={awayGrade} isHome={false} box={awayBox} oppBox={homeBox} />
                <TacticalCard team={homeTeam} oppTeam={awayTeam} tactics={homeTactics} grade={homeGrade} isHome={true} box={homeBox} oppBox={awayBox} />
            </div>
        </div>
    );
};
