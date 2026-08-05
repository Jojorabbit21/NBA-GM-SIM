
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Team, ShotEvent, PlayerBoxScore } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { Check } from 'lucide-react';
import { useShotChartTooltip } from '../../../hooks/useShotChartTooltip';
import { ShotTooltip } from '../ShotTooltip';
import { TeamMark } from '../../common/TeamMark';

// 선수 필터 리스트 정렬 기준: 포지션(PG→SG→SF→PF→C) 우선순위
const POSITION_SORT_ORDER: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

interface GameShotChartTabProps {
    homeTeam: Team;
    awayTeam: Team;
    shotEvents?: ShotEvent[];
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
    /** 제공되면 선수 필터 테이블에 POS/MP 컬럼을 채운다 — 없으면 두 컬럼 다 빈 값(하위호환) */
    homeBox?: PlayerBoxScore[];
    awayBox?: PlayerBoxScore[];
}

// [2026-08-02] 풀코트 라인(양쪽 바스켓) — MultiFullCourtChart.tsx와 동일한 좌표계(940x500,
// 원본 x/y*10, 정규화 없음)를 이 탭에도 그대로 적용. 두 팀 슛을 동시에 표시하므로 팀별
// 하프코트 토글 없이 실제 기록된 위치 그대로 그린다.
const BasketLines = () => (
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
        <line x1="85"  y1="310" x2="85"  y2="318" />
        <line x1="70"  y1="310" x2="70"  y2="318" />
        <line x1="145" y1="182" x2="145" y2="190" />
        <line x1="115" y1="182" x2="115" y2="190" />
        <line x1="85"  y1="182" x2="85"  y2="190" />
        <line x1="70"  y1="182" x2="70"  y2="190" />
        <line x1="40"  y1="222" x2="40"  y2="278" stroke="white" />
        <circle cx="48" cy="250" r="7.5" stroke="white" />
    </g>
);

function calcZoneStats(shots: ShotEvent[]) {
    const calc = (filterFn: (s: ShotEvent) => boolean) => {
        const subset = shots.filter(filterFn);
        const total = subset.length;
        const made = subset.filter(s => s.isMake).length;
        return { m: made, a: total, pct: total > 0 ? Math.round((made / total) * 100) : 0 };
    };
    return {
        fg: calc(() => true),
        ra: calc(s => s.zone === 'Rim'),
        itp: calc(s => s.zone === 'Paint'),
        mid: calc(s => s.zone === 'Mid'),
        p3: calc(s => s.zone === '3PT'),
    };
}

// 존 성공률(0~100%) → 빨강~짙은 틸그린(teal-green) 그라데이션. 참고 이미지(진한 초록 area
// 채우기)에 맞춰 hue를 초록(140)보다 틸 쪽(160)으로, 채도/밝기를 낮춰 더 짙고 차분한 톤으로.
// 시도가 0개면 칠하지 않는다(0%로 취급해 빨갛게 칠하면 "시도했는데 다 놓침"과 "아예 안 던짐"이
// 구분이 안 됨).
function zoneHeatColor(pct: number): string {
    const hue = Math.max(0, Math.min(160, (pct / 100) * 160)); // 0=red, 160=deep teal-green
    return `hsl(${hue}, 55%, 35%)`;
}

// 존별 색상 오버레이(한쪽 바스켓 기준) — 넓은 도형부터 겹쳐 칠해서 스탯별 영역을 만든다:
// 3PT(하프코트 전체) → MID(3점 라인 안쪽, BasketLines의 3점 라인 경로를 그대로 닫아 재사용) →
// PAINT(페인트 존) → RA(골밑, 페인트 존을 절반으로 잘라 baseline 쪽 절반) 순으로, 위에 칠한
// 도형이 아래 도형을 덮으면서 자연스럽게 4개 존이 구분된다(경로 빼기 연산 불필요). 각 존의
// 색은 오직 그 존 자체의 성공률만 반영 — zone 분류(Rim/Paint/Mid/3PT)가 이미 서로 배타적이라
// 도형이 겹쳐도 통계가 겹치지 않는다.
const ZoneHeatOverlay: React.FC<{ stats: ReturnType<typeof calcZoneStats> }> = ({ stats }) => (
    <g opacity="0.55" pointerEvents="none">
        {stats.p3.a > 0 && <rect x="0" y="0" width="470" height="500" fill={zoneHeatColor(stats.p3.pct)} />}
        {stats.mid.a > 0 && <path d="M0,30h140s150,55,150,220-150,220,-150,220H0Z" fill={zoneHeatColor(stats.mid.pct)} />}
        {stats.itp.a > 0 && <rect y="170" width="190" height="160" fill={zoneHeatColor(stats.itp.pct)} />}
        {stats.ra.a > 0 && <rect y="170" width="95" height="160" fill={zoneHeatColor(stats.ra.pct)} />}
    </g>
);

// 2점/3점/전체 야투 성공-시도 — 선수별·팀 합계 공용
function calcShotBreakdown(shots: ShotEvent[]) {
    const threes = shots.filter(s => s.zone === '3PT');
    const twos = shots.filter(s => s.zone !== '3PT');
    return {
        p2m: twos.filter(s => s.isMake).length, p2a: twos.length,
        p3m: threes.filter(s => s.isMake).length, p3a: threes.length,
        fgm: shots.filter(s => s.isMake).length, fga: shots.length,
    };
}

// 팀별 사이드 패널 — 팀 헤더(배지+이름, 항상 좌측 정렬) + 존 스탯 테이블 + 선수 필터 테이블
// (체크박스 | 선수 | POS | MP | 2FG | 3FG | FG, 홈/원정 동일한 컬럼 순서 — 미러링 없음).
const TeamSidePanel: React.FC<{
    team: Team;
    badge?: { color: string; abbr: string };
    teamShots: ShotEvent[];
    teamBox?: PlayerBoxScore[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
}> = ({ team, badge, teamShots, teamBox, selectedIds, onToggle, onToggleAll }) => {
    const zoneStats = useMemo(
        () => calcZoneStats(teamShots.filter(s => selectedIds.has(s.playerId))),
        [teamShots, selectedIds],
    );
    const teamTotal = useMemo(() => calcShotBreakdown(teamShots), [teamShots]);
    const allSelected = selectedIds.size === team.roster.length;

    // 선수별 POS/MP 조회용 — 박스스코어가 없으면(하위호환) 빈 맵, 두 컬럼 다 빈 값 표시
    const boxMap = useMemo(() => {
        const map = new Map<string, PlayerBoxScore>();
        for (const b of teamBox ?? []) map.set(b.playerId, b);
        return map;
    }, [teamBox]);
    const teamTotalMp = useMemo(() => (teamBox ?? []).reduce((s, b) => s + (b.mp || 0), 0), [teamBox]);

    // 포지션(PG→SG→SF→PF→C) 우선, 동일 포지션 내에서는 출전시간(MP) 내림차순 — 박스스코어의
    // 포지션(그 경기 슬롯)을 우선 쓰고, 없으면 로스터의 기본 포지션으로 폴백
    const playersWithShots = useMemo(() => {
        return team.roster
            .filter(p => teamShots.some(s => s.playerId === p.id))
            .sort((a, b) => {
                const posA = boxMap.get(a.id)?.position ?? a.position;
                const posB = boxMap.get(b.id)?.position ?? b.position;
                const orderA = POSITION_SORT_ORDER[posA ?? ''] ?? 99;
                const orderB = POSITION_SORT_ORDER[posB ?? ''] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return (boxMap.get(b.id)?.mp ?? 0) - (boxMap.get(a.id)?.mp ?? 0);
            });
    }, [team.roster, teamShots, boxMap]);

    const zoneCols = [
        { label: 'FG%', stat: zoneStats.fg },
        { label: 'RA%', stat: zoneStats.ra },
        { label: 'ITP%', stat: zoneStats.itp },
        { label: 'MID%', stat: zoneStats.mid },
        { label: '3P%', stat: zoneStats.p3 },
    ];

    const checkboxCell = (checked: boolean) => (
        <td className="pl-3 pr-1.5 py-1.5 w-7">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${checked ? 'bg-indigo-600 border-indigo-500' : 'bg-transparent border-slate-600'}`}>
                {checked && <Check size={10} className="text-white" />}
            </div>
        </td>
    );

    const nameCell = (checked: boolean, label: string, bold: boolean) => (
        <td className="py-1.5 pr-2 min-w-0">
            <span className={`text-xs truncate block transition-colors ${bold ? 'font-black uppercase tracking-wide' : 'font-bold'} ${checked ? 'text-white' : 'text-slate-600'}`}>{label}</span>
        </td>
    );

    const posCell = (pos: string | undefined, isSelected: boolean) => (
        <td className={`text-center text-xs font-bold py-1.5 border-l border-slate-800/60 transition-colors ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>{pos || '-'}</td>
    );

    const mpCell = (mp: number | undefined, isSelected: boolean) => (
        <td className={`text-center text-xs font-mono py-1.5 border-l border-slate-800/60 transition-colors ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{mp != null ? Math.round(mp) : '-'}</td>
    );

    const statCell = (m: number, a: number, isSelected: boolean) => (
        <td className={`text-center text-xs font-mono py-1.5 border-l border-slate-800/60 transition-colors ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{m}/{a}</td>
    );

    return (
        <div className="flex flex-col h-full bg-slate-900/20 min-h-0">
            {/* 헤더: 배지+팀명(패딩 유지, 항상 좌측 정렬) + 존 스탯 테이블(선수 테이블과 동일한
                디자인 — 카드/보더/라운딩 없이 좌우 꽉 채움) */}
            <div className="border-b border-slate-800 bg-slate-900/40 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3">
                    <TeamMark teamId={team.id} teamName={team.name} className="w-6 h-6 object-contain" badge={badge} />
                    <span className="text-xs font-black text-slate-300 uppercase tracking-wider truncate">{team.name}</span>
                </div>
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                    <thead>
                        <tr className="bg-slate-900/60">
                            {zoneCols.map((c, i) => (
                                <th key={c.label} className={`text-xs font-bold text-slate-500 uppercase tracking-widest py-1 border-t border-b border-slate-800 ${i > 0 ? 'border-l border-slate-800/60' : ''}`}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            {zoneCols.map((c, i) => (
                                <td key={c.label} className={`text-center py-1.5 ${i > 0 ? 'border-l border-slate-800/60' : ''}`}>
                                    <div className="text-xs font-semibold text-white font-mono leading-none">{c.stat.pct}%</div>
                                    <div className="text-xs text-slate-400 font-medium mt-0.5">{c.stat.m}/{c.stat.a}</div>
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* 선수 필터 테이블 — 체크박스 | 선수 | POS | MP | 2FG | 3FG | FG (홈/원정 동일한 컬럼 순서).
                table-layout: fixed로 5개 데이터 열의 폭을 헤더 셀 폭에 고정 — 선택된 선수에 따라
                셀 안 숫자 길이가 달라져도(예: "0/0" ↔ "38/62") 열 너비가 흔들리지 않도록 함 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                        <tr>
                            <th className="w-7" />
                            <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider py-1">선수</th>
                            <th className="w-9 text-xs font-bold text-slate-500 uppercase tracking-wider py-1 border-l border-slate-800/60">POS</th>
                            <th className="w-9 text-xs font-bold text-slate-500 uppercase tracking-wider py-1 border-l border-slate-800/60">MP</th>
                            <th className="w-12 text-xs font-bold text-slate-500 uppercase tracking-wider py-1 border-l border-slate-800/60">2FG</th>
                            <th className="w-12 text-xs font-bold text-slate-500 uppercase tracking-wider py-1 border-l border-slate-800/60">3FG</th>
                            <th className="w-12 text-xs font-bold text-slate-500 uppercase tracking-wider py-1 border-l border-slate-800/60">FG</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* 전체 선택/해제 마스터 행 — 팀 이름을 누르면 전체 토글, POS는 비우고 MP엔 팀 합계 */}
                        <tr
                            onClick={onToggleAll}
                            className="cursor-pointer hover:bg-slate-800/40 transition-colors border-b border-slate-800"
                        >
                            {checkboxCell(allSelected)}
                            {nameCell(allSelected, team.name, true)}
                            {posCell(undefined, true)}
                            {mpCell(teamTotalMp, true)}
                            {statCell(teamTotal.p2m, teamTotal.p2a, true)}
                            {statCell(teamTotal.p3m, teamTotal.p3a, true)}
                            {statCell(teamTotal.fgm, teamTotal.fga, true)}
                        </tr>

                        {playersWithShots.map(player => {
                            const isSelected = selectedIds.has(player.id);
                            const playerShots = teamShots.filter(s => s.playerId === player.id);
                            const breakdown = calcShotBreakdown(playerShots);
                            const box = boxMap.get(player.id);

                            return (
                                <tr
                                    key={player.id}
                                    onClick={() => onToggle(player.id)}
                                    className="cursor-pointer hover:bg-slate-800/40 transition-colors border-b border-slate-800/60"
                                >
                                    {checkboxCell(isSelected)}
                                    {nameCell(isSelected, player.name, false)}
                                    {posCell(box?.position, isSelected)}
                                    {mpCell(box?.mp, isSelected)}
                                    {statCell(breakdown.p2m, breakdown.p2a, isSelected)}
                                    {statCell(breakdown.p3m, breakdown.p3a, isSelected)}
                                    {statCell(breakdown.fgm, breakdown.fga, isSelected)}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const GameShotChartTab: React.FC<GameShotChartTabProps> = ({
    homeTeam,
    awayTeam,
    shotEvents = [],
    homeBadge,
    awayBadge,
    homeBox,
    awayBox,
}) => {
    const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#6366f1';
    const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#94a3b8';

    const safeEvents = shotEvents || [];
    const homeShots = useMemo(() => safeEvents.filter(s => s.teamId === homeTeam.id), [safeEvents, homeTeam.id]);
    const awayShots = useMemo(() => safeEvents.filter(s => s.teamId === awayTeam.id), [safeEvents, awayTeam.id]);

    const [selectedHomeIds, setSelectedHomeIds] = useState<Set<string>>(new Set());
    const [selectedAwayIds, setSelectedAwayIds] = useState<Set<string>>(new Set());

    // 로스터가 바뀌면(경기 전환 등) 전체 선택 상태로 초기화
    useEffect(() => setSelectedHomeIds(new Set(homeTeam.roster.map(p => p.id))), [homeTeam]);
    useEffect(() => setSelectedAwayIds(new Set(awayTeam.roster.map(p => p.id))), [awayTeam]);

    const toggleHome = (id: string) => setSelectedHomeIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleAway = (id: string) => setSelectedAwayIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleAllHome = () => setSelectedHomeIds(prev =>
        prev.size === homeTeam.roster.length ? new Set() : new Set(homeTeam.roster.map(p => p.id)));
    const toggleAllAway = () => setSelectedAwayIds(prev =>
        prev.size === awayTeam.roster.length ? new Set() : new Set(awayTeam.roster.map(p => p.id)));

    // ── 존별 색상 오버레이 (켜고 끄는 토글) ──────────────────────────────────
    const [showHeatmap, setShowHeatmap] = useState(false);

    // 어느 팀이 어느 바스켓(좌/우)을 쓰는지 — 팀 전체 슛(필터 무관)의 평균 x로 판정.
    // 슛 기록이 아예 없으면 원정=좌/홈=우를 기본값으로 둔다.
    const awayOnLeft = useMemo(() => {
        if (awayShots.length === 0) return true;
        const avgX = awayShots.reduce((s, sh) => s + sh.x, 0) / awayShots.length;
        return avgX < 47;
    }, [awayShots]);

    // 팀 전체 존 성공률 — 선수 필터(체크박스)와 무관하게 항상 팀 전체 기준으로 고정한다.
    // 필터는 코트 위 "점" 표시에만 영향을 주고, 존 효율 오버레이는 별도로 동작해야 하므로
    // (필터를 전부 꺼도 오버레이는 그대로 유지) 선택 상태를 참조하지 않는다.
    const awayZoneStats = useMemo(() => calcZoneStats(awayShots), [awayShots]);
    const homeZoneStats = useMemo(() => calcZoneStats(homeShots), [homeShots]);

    // [Fix 2026-08-04] 컨테이너 크기를 별도 ResizeObserver state로 추적하던 방식 제거 — 그 state가
    // 최신 렌더 크기를 못 따라잡은 순간(마운트 직후 등)엔 툴팁 위치 계산이 크게 어긋났다. 이제
    // useShotChartTooltip이 호버 시점의 getBoundingClientRect()에서 컨테이너 크기도 함께 캡처해
    // tooltip state에 담아주므로 여기서 별도로 추적할 필요가 없다.
    const containerRef = useRef<HTMLDivElement>(null);

    // Build player name lookup from both rosters (for legacy data without playerName)
    const playerNameMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of [...homeTeam.roster, ...awayTeam.roster]) {
            map.set(p.id, p.name);
        }
        return map;
    }, [homeTeam, awayTeam]);

    // 양 팀 슛을 동시에 표시 — 원본 좌표(정규화 없음) 그대로, 팀별 선택된 선수만 필터링
    const displayShots = useMemo(() => {
        return safeEvents
            .filter(shot =>
                (shot.teamId === homeTeam.id && selectedHomeIds.has(shot.playerId)) ||
                (shot.teamId === awayTeam.id && selectedAwayIds.has(shot.playerId))
            )
            .map(shot => {
                const playerName = shot.playerName || playerNameMap.get(shot.playerId) || 'Unknown';
                const assistPlayerName = shot.assistPlayerName || (shot.assistPlayerId ? playerNameMap.get(shot.assistPlayerId) : undefined);
                const points = shot.points ?? (shot.isMake ? (shot.zone === '3PT' ? 3 : 2) : 0);
                return { ...shot, playerName, assistPlayerName, points: points as 0 | 2 | 3 };
            });
    }, [safeEvents, homeTeam.id, awayTeam.id, selectedHomeIds, selectedAwayIds, playerNameMap]);

    const { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave, handleClick, isPinned, closePinned } = useShotChartTooltip(displayShots, 10);

    return (
        <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
            {/* [2026-08-02] 외곽 카드 컨테이너 해체 — 바디 폭을 그대로 사용 */}
            {/* 3분할: 원정 필터(좌) / 풀코트(중앙) / 홈 필터(우) */}
            {/* [2026-08-02] 하단 범례 삭제로 남는 빈 공간만큼 최소높이 축소(600px → 440px, 실제
                풀코트 종횡비 기준 높이에 더 가깝게) */}
            {/* [2026-08-02] 코트 좌우/상단 여백 최소화를 위해 강제 최소높이 제거 — 컨텐츠(코트 종횡비
                기준 렌더링 높이)가 그대로 행 높이를 결정하도록 함(위아래로 남던 센터링 여백 제거) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-slate-950 border-y border-slate-800">

                {/* Left: Away Player Filter (3 Cols) */}
                <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800">
                        <TeamSidePanel
                            team={awayTeam}
                            badge={awayBadge}
                            teamShots={awayShots}
                            teamBox={awayBox}
                            selectedIds={selectedAwayIds}
                            onToggle={toggleAway}
                            onToggleAll={toggleAllAway}
                        />
                    </div>

                    {/* Center: Full Court (6 Cols) — 좌우/상단 여백을 줄이기 위해 패딩을 크게 낮춤 */}
                    <div className="lg:col-span-6 flex flex-col items-center justify-center relative p-2 gap-2">
                        <div
                            ref={containerRef}
                            className="relative w-full"
                            style={{ aspectRatio: '940/500' }}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                            onClick={handleClick}
                        >
                            <svg ref={svgRef} viewBox="0 0 940 500" className="w-full h-full drop-shadow-xl">
                                {/* Court Background */}
                                <rect width="940" height="500" fill="#020617" stroke="#334155" strokeWidth="2" />
                                {/* Paint Fills */}
                                <rect y="170" width="190" height="160" fill="#0f172a" />
                                <rect x="750" y="170" width="190" height="160" fill="#0f172a" />

                                {/* 존별 성공률 색상 오버레이 — 토글 켰을 때만, 코트 라인 아래(라인은 항상 위에 선명하게) */}
                                {showHeatmap && (
                                    <>
                                        <ZoneHeatOverlay stats={awayOnLeft ? awayZoneStats : homeZoneStats} />
                                        <g transform="translate(940,0) scale(-1,1)">
                                            <ZoneHeatOverlay stats={awayOnLeft ? homeZoneStats : awayZoneStats} />
                                        </g>
                                    </>
                                )}

                                {/* Left basket */}
                                <BasketLines />
                                {/* Right basket (mirrored) */}
                                <g transform="translate(940,0) scale(-1,1)">
                                    <BasketLines />
                                </g>

                                {/* Center court */}
                                <g fill="none" stroke="#334155" strokeWidth="2">
                                    <line x1="470" y1="0" x2="470" y2="500" />
                                    <circle cx="470" cy="250" r="60" />
                                    <circle cx="470" cy="250" r="20" />
                                </g>

                                {/* Shots — raw coords (no half-court normalization), ×10 to SVG units */}
                                {displayShots.map((shot) => {
                                    const missColor = "#cbd5e1";
                                    const isHl = highlightShotIds.has(shot.id);
                                    const color = shot.teamId === homeTeam.id ? homeColor : awayColor;
                                    const cx = shot.x * 10;
                                    const cy = shot.y * 10;
                                    return (
                                        <g key={shot.id} className="animate-in fade-in zoom-in duration-300">
                                            {shot.isMake ? (
                                                <rect
                                                    x={cx - (isHl ? 7 : 5)} y={cy - (isHl ? 7 : 5)}
                                                    width={(isHl ? 7 : 5) * 2} height={(isHl ? 7 : 5) * 2}
                                                    fill={color}
                                                    stroke={isHl ? '#fff' : 'white'}
                                                    strokeWidth={isHl ? 2.5 : 1}
                                                    opacity="1"
                                                    style={{ transition: 'all 0.15s' }}
                                                />
                                            ) : (
                                                <g transform={`translate(${cx}, ${cy})`} opacity={isHl ? 1 : 0.8}>
                                                    <line x1={isHl ? -7 : -5} y1={isHl ? -7 : -5} x2={isHl ? 7 : 5} y2={isHl ? 7 : 5} stroke={isHl ? '#fff' : missColor} strokeWidth={isHl ? 3 : 2.5} style={{ transition: 'all 0.15s' }} />
                                                    <line x1={isHl ? -7 : -5} y1={isHl ? 7 : 5} x2={isHl ? 7 : 5} y2={isHl ? -7 : -5} stroke={isHl ? '#fff' : missColor} strokeWidth={isHl ? 3 : 2.5} style={{ transition: 'all 0.15s' }} />
                                                </g>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>

                            {tooltip && (
                                <ShotTooltip
                                    tooltip={tooltip}
                                    isPinned={isPinned}
                                    onClose={closePinned}
                                />
                            )}
                        </div>

                        {/* 존별 색상 오버레이 토글 + 색상 스케일 범례 — 하나의 컨테이너(공유
                            테두리/배경/라운딩)로 묶어 일체형 바처럼 보이게 하고, 내부는 구분선으로만
                            나눈다. 범례는 토글 on/off와 무관하게 항상 표시(꺼져 있어도 색 기준을
                            미리 볼 수 있도록). 코트 아래쪽에 일반 흐름으로 배치. */}
                        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/80 backdrop-blur-sm overflow-hidden shrink-0">
                            <button
                                onClick={() => setShowHeatmap(v => !v)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors shrink-0"
                            >
                                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                                    showHeatmap ? 'bg-indigo-600 border-indigo-500' : 'bg-transparent border-slate-500'
                                }`}>
                                    {showHeatmap && <Check size={10} className="text-white" />}
                                </div>
                                존 효율 보기
                            </button>

                            <div className="w-px self-stretch bg-slate-800" />
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold">
                                <span className="text-slate-400">0%</span>
                                <div className="w-14 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0,55%,35%), hsl(80,55%,35%), hsl(160,55%,35%))' }} />
                                <span className="text-slate-400">100%</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Home Player Filter (3 Cols) */}
                    <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-slate-800">
                        <TeamSidePanel
                            team={homeTeam}
                            badge={homeBadge}
                            teamShots={homeShots}
                            teamBox={homeBox}
                            selectedIds={selectedHomeIds}
                            onToggle={toggleHome}
                            onToggleAll={toggleAllHome}
                        />
                </div>
            </div>
        </div>
    );
};

