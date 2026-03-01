
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { GameTactics, TacticalSliders, ShotEvent, PlayerBoxScore } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { COURT_WIDTH } from '../../../utils/courtCoordinates';
import { SliderControl } from '../../common/SliderControl';
import { Check } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────

interface LiveTacticsTabProps {
    userTactics: GameTactics;
    userTeamId: string;
    opponentTeamId: string;
    shotEvents: ShotEvent[];
    onApplyTactics: (sliders: GameTactics['sliders']) => void;
    /** 선수 이름 조회용: playerId → playerName */
    playerNames: Record<string, string>;
    /** 팀별 평균 포세션 소모 시간 (초) — home/away 기준 */
    avgPossessionTime: { home: number; away: number };
    /** 박스스코어 데이터 (팀 스탯 비교용) */
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    isUserHome: boolean;
}

/** 엔진 PlayType → 표시 그룹 매핑 */
const PLAY_TYPE_GROUPS = [
    { key: 'pnr',        label: '픽앤롤',        engineTypes: ['PnR_Handler', 'PnR_Roll', 'PnR_Pop'], color: '#3b82f6' },
    { key: 'iso',        label: '아이솔레이션',  engineTypes: ['Iso'],                                 color: '#f97316' },
    { key: 'post',       label: '포스트업',      engineTypes: ['PostUp'],                              color: '#ef4444' },
    { key: 'cns',        label: '캐치 앤 슛',    engineTypes: ['CatchShoot'],                          color: '#10b981' },
    { key: 'drive',      label: '컷인 & 돌파',   engineTypes: ['Cut'],                                 color: '#d946ef' },
    { key: 'handoff',    label: '핸드오프',      engineTypes: ['Handoff'],                             color: '#06b6d4' },
    { key: 'transition', label: '속공',          engineTypes: ['Transition'],                          color: '#fbbf24' },
    { key: 'putback',    label: '세컨드찬스',    engineTypes: ['Putback'],                             color: '#8b5cf6' },
] as const;

interface PlayTypeStats {
    key: string;
    label: string;
    color: string;
    attempts: number;
    points: number;
    ppp: number;
    pct: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function calculatePlayTypePPP(shots: ShotEvent[]): PlayTypeStats[] {
    const totalShots = shots.length;
    if (totalShots === 0) return [];

    const result: PlayTypeStats[] = [];
    for (const group of PLAY_TYPE_GROUPS) {
        const groupShots = shots.filter(s => group.engineTypes.includes(s.playType || ''));
        if (groupShots.length === 0) continue;
        const points = groupShots.reduce((sum, s) => {
            if (!s.isMake) return sum;
            return sum + (s.zone === '3PT' ? 3 : 2);
        }, 0);
        result.push({
            key: group.key,
            label: group.label,
            color: group.color,
            attempts: groupShots.length,
            points,
            ppp: points / groupShots.length,
            pct: (groupShots.length / totalShots) * 100,
        });
    }
    return result.sort((a, b) => b.attempts - a.attempts);
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** 팀 스탯 비교 (TeamStatsCompare와 동일 디자인) */
const COMPARE_STATS: { key: string; label: string; fmt: (v: number) => string }[] = [
    { key: 'pts',   label: 'PTS',  fmt: v => String(v) },
    { key: 'fgm',   label: 'FGM',  fmt: v => String(v) },
    { key: 'fga',   label: 'FGA',  fmt: v => String(v) },
    { key: 'fgPct', label: 'FG%',  fmt: v => v.toFixed(1) },
    { key: 'p3m',   label: '3PM',  fmt: v => String(v) },
    { key: 'p3a',   label: '3PA',  fmt: v => String(v) },
    { key: 'p3Pct', label: '3P%',  fmt: v => v.toFixed(1) },
    { key: 'ftm',   label: 'FTM',  fmt: v => String(v) },
    { key: 'fta',   label: 'FTA',  fmt: v => String(v) },
    { key: 'ftPct', label: 'FT%',  fmt: v => v.toFixed(1) },
    { key: 'tsPct', label: 'TS%',  fmt: v => v.toFixed(1) },
    { key: 'oreb',  label: 'OREB', fmt: v => String(v) },
    { key: 'dreb',  label: 'DREB', fmt: v => String(v) },
    { key: 'reb',   label: 'REB',  fmt: v => String(v) },
    { key: 'ast',   label: 'AST',  fmt: v => String(v) },
    { key: 'stl',   label: 'STL',  fmt: v => String(v) },
    { key: 'blk',   label: 'BLK',  fmt: v => String(v) },
    { key: 'tov',   label: 'TOV',  fmt: v => String(v) },
    { key: 'pf',    label: 'PF',   fmt: v => String(v) },
    { key: 'pace',  label: 'PACE', fmt: v => v > 0 ? v.toFixed(1) + 's' : '-' },
];

function computeTeamStats(box: PlayerBoxScore[]) {
    const sum = (key: keyof PlayerBoxScore) => box.reduce((s, p) => s + ((p[key] as number) ?? 0), 0);
    const fgm = sum('fgm'), fga = sum('fga');
    const p3m = sum('p3m'), p3a = sum('p3a');
    const ftm = sum('ftm'), fta = sum('fta');
    const pts = sum('pts');
    const tsa = fga + 0.44 * fta;
    return {
        pts, fgm, fga, fgPct: fga > 0 ? (fgm / fga) * 100 : 0,
        p3m, p3a, p3Pct: p3a > 0 ? (p3m / p3a) * 100 : 0,
        ftm, fta, ftPct: fta > 0 ? (ftm / fta) * 100 : 0,
        tsPct: tsa > 0 ? (pts / (2 * tsa)) * 100 : 0,
        oreb: sum('offReb'), dreb: sum('defReb'), reb: sum('reb'),
        ast: sum('ast'), stl: sum('stl'), blk: sum('blk'), tov: sum('tov'), pf: sum('pf'),
        pace: 0, // 외부에서 주입
    };
}

/** 플레이타입 PPP 테이블 */
const PlayTypePPPTable: React.FC<{ title: string; data: PlayTypeStats[] }> = ({ title, data }) => (
    <div className="flex flex-col gap-1.5">
        <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{title}</h5>
        {data.length === 0 ? (
            <span className="text-[11px] text-slate-600">-</span>
        ) : (
            <div className="flex flex-col gap-0.5">
                {/* 컬럼 헤더 */}
                <div className="flex items-center gap-2 pb-0.5">
                    <div className="w-1.5 shrink-0" />
                    <span className="text-[9px] font-bold text-slate-600 w-20 truncate uppercase">플레이타입</span>
                    <div className="flex-1" />
                    <span className="text-[9px] font-bold text-slate-600 tabular-nums w-8 text-right uppercase">비율</span>
                    <span className="text-[9px] font-bold text-slate-600 tabular-nums w-8 text-right uppercase">PPP</span>
                </div>
                {data.map(item => (
                    <div key={item.key} className="flex items-center gap-2 py-0.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-bold text-slate-300 w-20 truncate">{item.label}</span>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(item.pct, 100)}%`, backgroundColor: item.color }}
                            />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 tabular-nums w-8 text-right">{item.pct.toFixed(0)}%</span>
                        <span className="text-[10px] font-black text-white tabular-nums w-8 text-right">{item.ppp.toFixed(2)}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

/** XIcon for missed shots */
const XIcon: React.FC<{ size?: number; className?: string; strokeWidth?: number }> = ({ size = 12, className = '', strokeWidth = 2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
);

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export const LiveTacticsTab: React.FC<LiveTacticsTabProps> = ({
    userTactics, userTeamId, opponentTeamId, shotEvents, onApplyTactics, playerNames,
    avgPossessionTime, homeBox, awayBox, isUserHome
}) => {
    const { sliders } = userTactics;
    const teamColor = TEAM_DATA[userTeamId]?.colors.primary || '#6366f1';
    const homeColor = TEAM_DATA[isUserHome ? userTeamId : opponentTeamId]?.colors.primary || '#6366f1';
    const awayColor = TEAM_DATA[isUserHome ? opponentTeamId : userTeamId]?.colors.primary || '#6366f1';

    // ── 팀 스탯 비교 데이터 ──
    const compareStats = useMemo(() => {
        const h = computeTeamStats(homeBox);
        const a = computeTeamStats(awayBox);
        h.pace = avgPossessionTime.home;
        a.pace = avgPossessionTime.away;
        return { h, a };
    }, [homeBox, awayBox, avgPossessionTime]);

    // ── 선수 필터 상태 ──
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
    // 유저가 명시적으로 해제한 선수 (자동 추가 방지)
    const [excludedPlayerIds, setExcludedPlayerIds] = useState<Set<string>>(new Set());

    // 슈팅 기록이 있는 유저 팀 선수 목록
    const shootingPlayers = useMemo(() => {
        const playerMap = new Map<string, { made: number; total: number }>();
        shotEvents.forEach(s => {
            if (s.teamId !== userTeamId) return;
            if (!playerMap.has(s.playerId)) playerMap.set(s.playerId, { made: 0, total: 0 });
            const p = playerMap.get(s.playerId)!;
            p.total++;
            if (s.isMake) p.made++;
        });
        return Array.from(playerMap.entries())
            .map(([id, stats]) => ({ id, name: playerNames[id] || id, ...stats }))
            .sort((a, b) => b.total - a.total);
    }, [shotEvents, userTeamId, playerNames]);

    // 새 선수가 슈팅하면 자동으로 필터에 추가 (유저가 해제한 선수는 제외)
    useEffect(() => {
        setSelectedPlayerIds(prev => {
            const next = new Set(prev);
            let changed = false;
            shootingPlayers.forEach(p => {
                if (!next.has(p.id) && !excludedPlayerIds.has(p.id)) {
                    next.add(p.id); changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [shootingPlayers, excludedPlayerIds]);

    const togglePlayer = (id: string) => {
        setSelectedPlayerIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                // 유저가 명시적으로 해제 → 자동 추가 방지
                setExcludedPlayerIds(ex => new Set(ex).add(id));
            } else {
                next.add(id);
                // 다시 선택 → 자동 추가 방지 해제
                setExcludedPlayerIds(ex => { const n = new Set(ex); n.delete(id); return n; });
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedPlayerIds.size === shootingPlayers.length) {
            setSelectedPlayerIds(new Set());
            setExcludedPlayerIds(new Set(shootingPlayers.map(p => p.id)));
        } else {
            setSelectedPlayerIds(new Set(shootingPlayers.map(p => p.id)));
            setExcludedPlayerIds(new Set());
        }
    };

    // ── 유저 팀 샷 (필터 적용) ──
    const userShots = useMemo(() =>
        shotEvents.filter(s => s.teamId === userTeamId && selectedPlayerIds.has(s.playerId)),
    [shotEvents, userTeamId, selectedPlayerIds]);

    // ── 하프코트 좌표 변환 ──
    const displayShots = useMemo(() =>
        userShots.map(shot => {
            let x = shot.x;
            let y = shot.y;
            if (x > COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = 50 - y; }
            return { ...shot, x, y };
        }),
    [userShots]);

    // ── 플레이타입 PPP ──
    const allUserShots = useMemo(() =>
        shotEvents.filter(s => s.teamId === userTeamId),
    [shotEvents, userTeamId]);
    const userPPP = useMemo(() => calculatePlayTypePPP(allUserShots), [allUserShots]);

    const oppShots = useMemo(() =>
        shotEvents.filter(s => s.teamId === opponentTeamId),
    [shotEvents, opponentTeamId]);
    const oppPPP = useMemo(() => calculatePlayTypePPP(oppShots), [oppShots]);

    // ── 슬라이더 업데이트 ──
    const updateSlider = useCallback((key: keyof TacticalSliders, val: number) => {
        const newSliders = { ...sliders, [key]: val };
        // zoneFreq ↔ zoneUsage 동기화
        if (key === 'zoneFreq') newSliders.zoneUsage = val;
        onApplyTactics(newSliders);
    }, [sliders, onApplyTactics]);

    // ─────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────

    return (
        <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">

            {/* ══════════════════════════════════════════════════════ */}
            {/* TOP: 슬라이더 5그룹 수평 배치                          */}
            {/* ══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-5 gap-4">

                {/* 1. 게임 운영 */}
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">게임 운영</h4>
                    <SliderControl label="게임 템포" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                        tooltip="높을수록 빠른 공수전환과 얼리 오펜스를 시도합니다." fillColor="#f97316" />
                    <SliderControl label="볼 회전" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                        tooltip="높을수록 더 많은 패스를 돌려 오픈 찬스를 찾지만, 턴오버 위험도 증가합니다." fillColor="#f97316" />
                    <SliderControl label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                        tooltip="높을수록 슛 이후 공격 리바운드에 가담하지만, 상대 속공에 취약해집니다." fillColor="#f97316" />
                </div>

                {/* 2. 슈팅 전략 */}
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">슈팅 전략</h4>
                    <SliderControl label="3점 슛 빈도" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                        tooltip="팀의 3점 시도 빈도를 결정합니다." fillColor="#10b981" />
                    <SliderControl label="골밑 공격" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                        tooltip="림 어택 빈도입니다. 가장 효율적인 슛 구역." fillColor="#10b981" />
                    <SliderControl label="중거리 슛" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                        tooltip="중거리 슛은 효율이 낮습니다. 엘리트 슈터가 없다면 낮게 유지하세요." fillColor="#10b981" />
                </div>

                {/* 3. 공격 루트 */}
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">공격 루트</h4>
                    <SliderControl label="픽앤롤" value={sliders.play_pnr} onChange={v => updateSlider('play_pnr', v)}
                        tooltip="핸들러+스크리너 콤보가 좋을수록 효과적. 현대 농구의 핵심 공격 패턴." fillColor="#3b82f6" />
                    <SliderControl label="아이솔레이션" value={sliders.play_iso} onChange={v => updateSlider('play_iso', v)}
                        tooltip="엘리트 ISO 스코어러가 없다면 낮게 유지하세요." fillColor="#3b82f6" />
                    <SliderControl label="포스트업" value={sliders.play_post} onChange={v => updateSlider('play_post', v)}
                        tooltip="도미넌트 포스트맨이 있을 때만 높게 설정하세요." fillColor="#3b82f6" />
                    <SliderControl label="캐치 앤 슛" value={sliders.play_cns} onChange={v => updateSlider('play_cns', v)}
                        tooltip="팀 전체의 스패이싱 능력에 따라 설정하세요." fillColor="#3b82f6" />
                    <SliderControl label="컷인 & 돌파" value={sliders.play_drive} onChange={v => updateSlider('play_drive', v)}
                        tooltip="드라이브/컷 능력이 좋은 선수가 있을수록 효과적." fillColor="#3b82f6" />
                </div>

                {/* 4. 수비 스타일 */}
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">수비 스타일</h4>
                    <SliderControl label="수비 압박" value={sliders.defIntensity} onChange={v => updateSlider('defIntensity', v)}
                        tooltip="높을수록 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." fillColor="#6366f1" />
                    <SliderControl label="헬프 수비" value={sliders.helpDef} onChange={v => updateSlider('helpDef', v)}
                        tooltip="높을수록 페인트존 보호가 강해지지만, 외곽 3점슛을 허용할 위험이 커집니다." fillColor="#6366f1" />
                    <SliderControl label="스위치 수비" value={sliders.switchFreq} onChange={v => updateSlider('switchFreq', v)}
                        tooltip="높을수록 미스매치가 발생할 확률이 높지만 오픈 찬스는 줄어듭니다." fillColor="#6366f1" />
                </div>

                {/* 5. 수비 시스템 */}
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">수비 시스템</h4>
                    <SliderControl label="풀코트 프레스" value={sliders.fullCourtPress} onChange={v => updateSlider('fullCourtPress', v)}
                        tooltip="체력을 급격히 소모하며 턴오버를 유발합니다. 가드 스태미나/스피드가 높을 때만 효과적." fillColor="#d946ef" />
                    <SliderControl label="지역 방어" value={sliders.zoneFreq}
                        onChange={v => { updateSlider('zoneFreq', v); }}
                        tooltip="내선 수비력(블락+인사이드수비)이 강한 팀에게 유리합니다." fillColor="#d946ef" />
                    <SliderControl label="수비 리바운드" value={sliders.defReb} onChange={v => updateSlider('defReb', v)}
                        tooltip="높을수록 수비 리바운드에 적극 가담하여 세컨드찬스를 줄이지만, 속공 전환이 느려집니다." fillColor="#d946ef" />
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════ */}
            {/* BOTTOM: 팀 스탯 비교 | 샷차트 | PPP 비교               */}
            {/* ══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">

                {/* ── 1. 팀 스탯 비교 (3/12) ── */}
                <div className="col-span-3 bg-slate-900/40 border border-slate-800 rounded-2xl px-2 py-2 flex flex-col overflow-y-auto">
                    <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 px-1">팀 스탯</p>
                    <div className="flex flex-col gap-1">
                        {COMPARE_STATS.map(({ key, label, fmt }) => {
                            const h = compareStats.h[key as keyof typeof compareStats.h] as number;
                            const a = compareStats.a[key as keyof typeof compareStats.a] as number;
                            const total = h + a;
                            const hPct = total > 0 ? (h / total) * 100 : 50;
                            const aPct = total > 0 ? (a / total) * 100 : 50;
                            const hWins = h > a;
                            const aWins = a > h;
                            const bothZero = h === 0 && a === 0;

                            return (
                                <div key={key} className="grid grid-cols-[1fr_32px_36px_32px_1fr] items-center gap-1">
                                    <div className="h-3 flex justify-end rounded-sm overflow-hidden bg-slate-800/50">
                                        {!bothZero && (
                                            <div className="h-full rounded-sm transition-all duration-300"
                                                style={{ width: `${aPct}%`, backgroundColor: awayColor }} />
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-mono text-right text-white ${aWins ? 'font-bold' : ''}`}>
                                        {fmt(a)}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 text-center uppercase">{label}</span>
                                    <span className={`text-[10px] font-mono text-left text-white ${hWins ? 'font-bold' : ''}`}>
                                        {fmt(h)}
                                    </span>
                                    <div className="h-3 flex justify-start rounded-sm overflow-hidden bg-slate-800/50">
                                        {!bothZero && (
                                            <div className="h-full rounded-sm transition-all duration-300"
                                                style={{ width: `${hPct}%`, backgroundColor: homeColor }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── 2. 샷차트 (6/12) ── */}
                <div className="col-span-6 bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                    <div className="grid grid-cols-12 gap-0 flex-1 min-h-0">
                        {/* Shot Chart */}
                        <div className="col-span-9 flex items-center justify-center p-2 overflow-hidden">
                            <div className="relative h-full" style={{ aspectRatio: '470/500' }}>
                                <svg viewBox="0 0 470 500" className="w-full h-full">
                                    <rect width="470" height="500" fill="#020617" />
                                    <rect y="170" width="190" height="160" fill="#0f172a" />
                                    <g fill="none" stroke="#334155" strokeWidth="2" strokeMiterlimit="10">
                                        <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
                                        <polyline points="0,170 190,170 190,330 0,330" />
                                        <line x1="190" y1="310" y2="310" />
                                        <line y1="190" x2="190" y2="190" />
                                        <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
                                        <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
                                        <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
                                        <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
                                        <line x1="280" y1="480" x2="280" y2="500" />
                                        <line x1="280" x2="280" y2="20" />
                                        <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
                                        <line x1="145" y1="310" x2="145" y2="318" />
                                        <line x1="115" y1="310" x2="115" y2="318" />
                                        <line x1="85" y1="310" x2="85" y2="318" />
                                        <line x1="70" y1="310" x2="70" y2="318" />
                                        <line x1="145" y1="182" x2="145" y2="190" />
                                        <line x1="115" y1="182" x2="115" y2="190" />
                                        <line x1="85" y1="182" x2="85" y2="190" />
                                        <line x1="70" y1="182" x2="70" y2="190" />
                                        <line x1="40" y1="222" x2="40" y2="278" stroke="white" />
                                        <circle cx="48" cy="250" r="7.5" stroke="white" />
                                        <line x1="470" y1="0" x2="470" y2="500" />
                                        <circle cx="470" cy="250" r="60" />
                                        <circle cx="470" cy="250" r="20" />
                                    </g>
                                    {displayShots.map(shot => (
                                        <g key={shot.id}>
                                            {shot.isMake ? (
                                                <circle cx={shot.x * 10} cy={shot.y * 10}
                                                    r={6} fill={teamColor} stroke="white" strokeWidth="1" opacity="1" />
                                            ) : (
                                                <g transform={`translate(${shot.x * 10}, ${shot.y * 10})`} opacity="0.7">
                                                    <line x1="-4.5" y1="-4.5" x2="4.5" y2="4.5" stroke="#cbd5e1" strokeWidth="2" />
                                                    <line x1="-4.5" y1="4.5" x2="4.5" y2="-4.5" stroke="#cbd5e1" strokeWidth="2" />
                                                </g>
                                            )}
                                        </g>
                                    ))}
                                </svg>
                                {/* Legend */}
                                <div className="absolute bottom-2 right-2 flex gap-3 text-[9px] font-bold bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800 backdrop-blur-sm">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: teamColor }} />
                                        <span className="text-white">MADE</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <XIcon size={8} className="text-slate-300" strokeWidth={3} />
                                        <span className="text-slate-400">MISS</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Player Filter */}
                        <div className="col-span-3 flex flex-col border-l border-slate-800 bg-slate-900/20" style={{ minHeight: 0 }}>
                            <div className="px-2 py-1.5 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center shrink-0">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">필터</span>
                                <button onClick={toggleAll}
                                    className="text-[8px] font-bold text-indigo-400 hover:text-white uppercase tracking-wider transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-1 py-0.5 rounded">
                                    {selectedPlayerIds.size === shootingPlayers.length ? '해제' : '전체'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-0.5 space-y-0">
                                {shootingPlayers.map(player => {
                                    const isSelected = selectedPlayerIds.has(player.id);
                                    return (
                                        <button key={player.id} onClick={() => togglePlayer(player.id)}
                                            className="w-full flex items-center justify-between px-1.5 py-1 text-left">
                                            <div className="flex items-center gap-1">
                                                <div className={`w-2.5 h-2.5 rounded-sm flex items-center justify-center border transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-500' : 'bg-transparent border-slate-600'}`}>
                                                    {isSelected && <Check size={7} className="text-white" />}
                                                </div>
                                                <span className={`text-[10px] font-bold truncate max-w-[60px] ${isSelected ? 'text-white' : 'text-slate-500'}`}>{player.name}</span>
                                            </div>
                                            <span className="text-[9px] font-mono text-slate-400">{player.made}/{player.total}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── 3. PPP 비교 (3/12) ── */}
                <div className="col-span-3 flex flex-col gap-3 overflow-y-auto">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3">
                        <PlayTypePPPTable title="우리 팀 PPP" data={userPPP} />
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3">
                        <PlayTypePPPTable title="상대 팀 PPP" data={oppPPP} />
                    </div>
                </div>
            </div>
        </div>
    );
};
