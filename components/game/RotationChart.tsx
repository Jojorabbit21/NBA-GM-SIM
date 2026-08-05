
import React, { useMemo, useState } from 'react';
import { Team, PlayerBoxScore, RotationData, PbpLog, RotationOutReason, ShotEvent } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';
import { toGameSeconds } from '../../utils/gameClock';

interface RotationChartProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    rotationData?: RotationData;
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) — [2026-08-02]
     *  컨테이너 해체 리디자인에서 로고 자체를 뺐지만 시그니처는 호환을 위해 유지 */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
    /** 제공되면 스틴트(교체 구간)별 +/-를 계산해 막대 색상을 Positive/Even/Negative로
     *  표시하고 호버 툴팁(시간/+/-)을 보여준다. 없으면 팀 컬러로만 표시(하위호환). */
    pbpLogs?: PbpLog[];
    /** true면 두 팀 카드를 상하 대신 좌우 1:1로 분할 배치(멀티플레이어 전용, BoxScoreTable의
     *  splitLayout/standalone과 동일한 패턴). 기본값 false=기존 상하 배치 유지. */
    splitLayout?: boolean;
    /** 제공되면 선수별 슛 시퀀스를 재구성해 핫/콜드 스트릭 발생 시점에 막대 위 🔥/❄️ 마커를 표시.
     *  없으면 마커 없이 기존과 동일하게 표시(하위호환). */
    shotEvents?: ShotEvent[];
}

const GAME_DURATION_SECONDS = 48 * 60; // 2880

function shotElapsedSeconds(s: ShotEvent): number {
    return (s.quarter - 1) * 720 + (720 - s.gameClock);
}

type StreakMarker = { t: number; type: 'hot' | 'cold' };

// services/game/engine/pbp/statsMappers.ts의 updateHotCold()와 동일한 판정 기준을 그대로 재구현
// (최근 5개 슛 버퍼 중 "마지막 3개가 전부 성공/실패"일 때 핫/콜드) — 저장된 shot_events만으로
// 클라이언트에서 재계산. 스트릭이 유지되는 동안 매 슛마다 재발화하지 않도록, 새로 진입하는
// 순간에만 마커 1개를 남긴다(라이브 엔진의 hotColdRating 수치 자체는 재현하지 않음, 연속 3개 판정만 재현).
function computeStreakMarkers(shots: ShotEvent[]): StreakMarker[] {
    const sorted = [...shots].sort((a, b) => shotElapsedSeconds(a) - shotElapsedSeconds(b));
    const recent: boolean[] = [];
    let current: 'hot' | 'cold' | null = null;
    const markers: StreakMarker[] = [];

    for (const shot of sorted) {
        recent.push(shot.isMake);
        if (recent.length > 5) recent.shift();

        if (recent.length >= 3) {
            const last3 = recent.slice(-3);
            if (last3.every(Boolean)) {
                if (current !== 'hot') markers.push({ t: shotElapsedSeconds(shot), type: 'hot' });
                current = 'hot';
            } else if (last3.every(s => !s)) {
                if (current !== 'cold') markers.push({ t: shotElapsedSeconds(shot), type: 'cold' });
                current = 'cold';
            } else {
                current = null;
            }
        }
    }
    return markers;
}

type StintOutcome = 'positive' | 'even' | 'negative';

const OUTCOME_COLOR: Record<StintOutcome, string> = {
    positive: '#22c55e',
    even: '#64748b',
    negative: '#ef4444',
};

function fmtDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// 교체 사유 라벨 — 호버 툴팁에 "시간 / +/- · 사유" 형태로 덧붙인다.
const OUT_REASON_LABEL: Record<RotationOutReason, string> = {
    normal: '정상교체',
    foul_trouble: '파울 트러블',
    shutdown: '탈진(휴식)',
    injury: '부상',
    foul_out: '파울아웃',
    garbage: '가비지타임',
    manual: '직접교체',
};

// 선수 이름이 잘리지 않을 정도로만 잡은 최소 폭 — 나머지는 타임라인 컬럼에 양보.
const NAME_COL = '120px';

const PlayerRow: React.FC<{
    player: PlayerBoxScore,
    segments: { in: number, out: number, outReason?: RotationOutReason }[],
    teamColor: string,
    scoreAt?: (t: number) => { home: number; away: number },
    isHome: boolean,
    streaks?: StreakMarker[],
}> = ({ player, segments, teamColor, scoreAt, isHome, streaks }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    // Only render if player played at least 1 second
    if (!segments || segments.length === 0) return null;

    return (
        <div className="grid h-8 border-b border-slate-800/50 transition-colors hover:bg-white/5" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
            {/* Name Column */}
            <div className="flex items-center px-4 text-xs font-semibold text-white truncate border-r border-slate-800">
                {player.playerName}
            </div>

            {/* Timeline Column */}
            <div className="relative h-full w-full">
                {/* Quarter dividers */}
                <div className="absolute inset-y-0 left-1/4 w-px bg-slate-800/70 pointer-events-none" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800/70 pointer-events-none" />
                <div className="absolute inset-y-0 left-3/4 w-px bg-slate-800/70 pointer-events-none" />

                {segments.map((seg, i) => {
                    const startPct = (seg.in / GAME_DURATION_SECONDS) * 100;
                    const durationPct = ((seg.out - seg.in) / GAME_DURATION_SECONDS) * 100;

                    // Cap at 100% (in case of OT)
                    const cappedWidth = Math.min(durationPct, 100 - startPct);

                    // Prevent tiny invisible bars
                    if (cappedWidth < 0.1) return null;

                    let plusMinus: number | null = null;
                    if (scoreAt) {
                        const before = scoreAt(seg.in);
                        const after = scoreAt(seg.out);
                        const teamDelta = isHome ? after.home - before.home : after.away - before.away;
                        const oppDelta  = isHome ? after.away - before.away : after.home - before.home;
                        plusMinus = teamDelta - oppDelta;
                    }
                    const outcome: StintOutcome | null = plusMinus == null ? null
                        : plusMinus > 0 ? 'positive' : plusMinus < 0 ? 'negative' : 'even';
                    const barColor = outcome ? OUTCOME_COLOR[outcome] : teamColor;
                    const reasonLabel = seg.outReason ? OUT_REASON_LABEL[seg.outReason] : null;

                    // [Fix 2026-08-04] 호버 툴팁이 항상 막대 중앙 기준으로 뜨다 보니, 막대가 타임라인
                    // 오른쪽(또는 왼쪽) 끝 근처에 있으면 툴팁(whitespace-nowrap)이 카드/뷰포트 밖으로
                    // 삐져나가서 스크롤 가능한 조상의 scrollWidth를 늘려 불필요한 가로 스크롤바가 생겼음
                    // — 막대 중심이 타임라인 양끝 15% 안쪽이면 중앙정렬 대신 안쪽 가장자리에 붙임.
                    const segCenterPct = startPct + cappedWidth / 2;
                    const tooltipAnchorClass = segCenterPct > 85
                        ? 'right-0'
                        : segCenterPct < 15
                            ? 'left-0'
                            : 'left-1/2 -translate-x-1/2';

                    return (
                        <div key={i} className="absolute top-1/2 -translate-y-1/2 h-4" style={{ left: `${startPct}%`, width: `${cappedWidth}%`, minWidth: '2px' }}>
                            <div
                                className="absolute inset-y-0 inset-x-0 my-auto h-1.5 transition-all hover:h-2 cursor-default"
                                style={{ backgroundColor: barColor }}
                                onMouseEnter={() => setHoverIdx(i)}
                                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                            />
                            {hoverIdx === i && (plusMinus != null || reasonLabel) && (
                                <div className={`absolute bottom-full ${tooltipAnchorClass} mb-1.5 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-bold text-white whitespace-nowrap shadow-lg pointer-events-none z-20`}>
                                    {fmtDuration(seg.out - seg.in)}
                                    {plusMinus != null && ` / ${plusMinus > 0 ? '+' : ''}${plusMinus}`}
                                    {reasonLabel && <span className="text-slate-400 font-semibold"> · {reasonLabel}</span>}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Hot/Cold 스트릭 마커 — 막대와 겹치도록 세로 중앙(막대와 동일 위치)에 이모지로 표시 */}
                {streaks?.map((s, i) => (
                    <span
                        key={i}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none select-none cursor-default z-10"
                        style={{ left: `${(s.t / GAME_DURATION_SECONDS) * 100}%` }}
                        title={s.type === 'hot' ? '핫 스트릭 (3연속 성공)' : '콜드 스트릭 (3연속 실패)'}
                    >
                        {s.type === 'hot' ? '🔥' : '❄️'}
                    </span>
                ))}
            </div>
        </div>
    );
};

// 박스스코어 테이블(BoxScoreTable.tsx)과 동일한 카드 테마 — 헤더 바(로고/배지+팀명)는 border-l/r만 걸고,
// 사방 border는 컬럼헤드(Q1~Q4)+로우를 감싸는 안쪽 wrapper가 전담한다(BoxScoreTable의 헤더바/Table 분리 구조와 동일).
// [Fix 2026-08-03] 이전엔 바깥 div 전체(헤더 바 포함)에 사방 border를 걸어서 다른 탭(박스스코어/온오프)과
// 달리 헤더 바 윗줄까지 박스처럼 통째로 둘러싸여 보였음 — border를 안쪽 wrapper로 옮겨 다른 탭과 동일하게 맞춤.
const TeamRotationCard: React.FC<{
    team: Team,
    badge?: { color: string; abbr: string },
    standalone?: boolean,
    children: React.ReactNode,
}> = ({ team, badge, standalone, children }) => (
    <div className={standalone
        ? "w-full relative"
        : "w-full bg-slate-900 border-y border-slate-800 relative"
    }>
        <div className={`px-6 py-4 bg-slate-950/80 flex items-center justify-between ${standalone ? 'border-l border-r border-slate-800' : 'border-b border-slate-800'}`}>
            <div className="flex items-center gap-3">
                {badge ? (
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                        style={{ backgroundColor: badge.color, color: '#fff' }}
                    >
                        {badge.abbr.slice(0, 3)}
                    </div>
                ) : (
                    <TeamLogo teamId={team.id} size="md" />
                )}
                <span className="text-sm font-black text-white uppercase tracking-wider">{team.name}</span>
            </div>
        </div>

        <div className={standalone ? "bg-slate-900 border border-slate-800 shadow-lg" : "bg-slate-900"}>
            <div className="grid h-10 bg-slate-950 border-b border-slate-800" style={{ gridTemplateColumns: `${NAME_COL} 1fr` }}>
                <div className="flex items-center px-4 text-xs font-black uppercase tracking-widest text-slate-500 border-r border-slate-800">선수</div>
                <div className="grid grid-cols-4 divide-x divide-slate-800 text-xs font-black uppercase tracking-widest text-slate-500 text-center items-center">
                    <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
                </div>
            </div>

            {children}
        </div>
    </div>
);

export const RotationChart: React.FC<RotationChartProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, rotationData, homeBadge, awayBadge, pbpLogs, splitLayout, shotEvents
}) => {
    if (!rotationData) return null;

    // Sorting Helper: Starters (GS=1) first, then by Minutes Played
    const sortPlayers = (a: PlayerBoxScore, b: PlayerBoxScore) => {
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    };

    const sortedHome = [...homeBox].sort(sortPlayers);
    const sortedAway = [...awayBox].sort(sortPlayers);

    const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#6366f1';
    const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#94a3b8';

    // 경과초 → 그 시점까지의 누적 스코어. PBP 로그에 이미 찍혀 있는 homeScore/awayScore 스냅샷을
    // 순서대로 훑어 마지막 값을 찾는다(이벤트가 시뮬레이션 순서 그대로 저장되어 있어 정렬 불필요).
    const scoreAt = useMemo(() => {
        if (!pbpLogs || pbpLogs.length === 0) return undefined;
        const timeline = pbpLogs
            .filter(l => l.homeScore != null && l.awayScore != null)
            .map(l => ({ t: toGameSeconds(l), home: l.homeScore!, away: l.awayScore! }));
        if (timeline.length === 0) return undefined;
        return (target: number) => {
            let result = { home: 0, away: 0 };
            for (const snap of timeline) {
                if (snap.t > target) break;
                result = { home: snap.home, away: snap.away };
            }
            return result;
        };
    }, [pbpLogs]);

    // 선수ID별 슛 이벤트를 그룹핑해 핫/콜드 스트릭 마커를 미리 계산
    const streaksByPlayer = useMemo(() => {
        if (!shotEvents || shotEvents.length === 0) return {} as Record<string, StreakMarker[]>;
        const byPlayer: Record<string, ShotEvent[]> = {};
        for (const s of shotEvents) {
            (byPlayer[s.playerId] ??= []).push(s);
        }
        const result: Record<string, StreakMarker[]> = {};
        for (const [playerId, shots] of Object.entries(byPlayer)) {
            result[playerId] = computeStreakMarkers(shots);
        }
        return result;
    }, [shotEvents]);

    const awayCard = (
        <TeamRotationCard team={awayTeam} badge={awayBadge} standalone={splitLayout}>
            {sortedAway.map(p => (
                <PlayerRow
                    key={p.playerId}
                    player={p}
                    segments={rotationData[p.playerId]}
                    teamColor={awayColor}
                    scoreAt={scoreAt}
                    isHome={false}
                    streaks={streaksByPlayer[p.playerId]}
                />
            ))}
        </TeamRotationCard>
    );

    const homeCard = (
        <TeamRotationCard team={homeTeam} badge={homeBadge} standalone={splitLayout}>
            {sortedHome.map(p => (
                <PlayerRow
                    key={p.playerId}
                    player={p}
                    segments={rotationData[p.playerId]}
                    teamColor={homeColor}
                    scoreAt={scoreAt}
                    isHome={true}
                    streaks={streaksByPlayer[p.playerId]}
                />
            ))}
        </TeamRotationCard>
    );

    return (
        <div className="w-full flex flex-col gap-6">
            {splitLayout ? (
                // [Fix 2026-08-04] min-w-0 없이는 그리드 자식(각 카드)의 자동 최소 폭이 콘텐츠 크기를
                // 따라가서(그리드 트랙 1fr을 무시하고) 원정/홈 카드가 서로의 영역을 침범 + 페이지 전체에
                // 불필요한 가로 스크롤바가 생겼음 — 각 컬럼에 min-w-0을 줘서 50% 트랙 폭을 강제로 지키게 함.
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                    <div className="min-w-0 overflow-x-auto">{awayCard}</div>
                    <div className="min-w-0 overflow-x-auto">{homeCard}</div>
                </div>
            ) : (
                <>
                    {awayCard}
                    {homeCard}
                </>
            )}
        </div>
    );
};
