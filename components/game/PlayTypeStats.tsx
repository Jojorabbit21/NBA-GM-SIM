import React, { useMemo } from 'react';
import { ShotEvent } from '../../types';

// ShotEvent.playType 값(types/engine.ts의 PlayType 유니언) → 표시 라벨
const PLAY_TYPE_LABEL: Record<string, string> = {
    Iso: 'Isolation',
    PnR_Handler: 'Pick&Roll - Handler',
    PnR_Roll: 'Pick&Roll - Screener',
    PnR_Pop: 'Pick&Pop',
    PostUp: 'Post Up',
    CatchShoot: 'Catch&Shoot',
    Cut: 'Cut',
    Handoff: 'Handoffs',
    Transition: 'Transition',
    Putback: 'Putback',
    OffBallScreen: 'Offball Screen',
    DriveKick: 'Drive&Kick',
};

interface TeamAgg {
    attempts: number;
    makes: number;
    points: number;
    share: number; // 그 팀의 전체 슛 시도 중 이 플레이타입 비중(%)
}

interface PlayTypeGroup {
    playType: string;
    away: TeamAgg | null;
    home: TeamAgg | null;
    combinedShare: number; // 정렬 기준(두 팀 비율(share%) 합산)
}

interface PlayTypeStatsProps {
    shotEvents?: ShotEvent[];
    homeTeamId: string;
    awayTeamId: string;
    homeBadge: { color: string; abbr: string };
    awayBadge: { color: string; abbr: string };
}

const EMPTY_AGG: TeamAgg = { attempts: 0, makes: 0, points: 0, share: 0 };

// 좌(바깥→안쪽): [비율][성공률][득점][막대(헤더=원정약어)] — 중앙: [플레이타입명] — 우(안쪽→바깥): [막대(헤더=홈약어)][득점][성공률][비율]
// 막대그래프가 플레이타입명 바로 옆(가장 안쪽)에 오도록 배치.
// 비율/성공률/득점/막대 4개는 전부 동일한 폭(minmax(64px,0.3fr))을 공유하고, 플레이타입명은
// 훨씬 넓게(1.4fr) — 긴 이름("Pick&Roll - Handler" 등)이 안 잘리도록 폭을 확보.
// [주의] Tailwind JIT는 소스에 온전한 문자열로 적힌 grid-cols-[...] 토큰만 정적 스캔하므로
// 템플릿 리터럴로 조각을 이어붙이면 클래스가 생성되지 않는다 — 반드시 하나의 완성된 리터럴로 작성.
const GRID_COLS = 'grid-cols-[minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_1.4fr_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)_minmax(64px,0.3fr)]';

// [주의] ShotEvent는 "슛 시도"만 기록 — 턴오버로 끝난 포제션은 집계에서 빠지므로,
// 여기서 "비율"은 "전체 포제션 중 이 플레이타입 사용 비율"이 아니라
// "슛까지 이어진 시도 중 이 플레이타입 비율"이다.
export const PlayTypeStats: React.FC<PlayTypeStatsProps> = ({ shotEvents, homeTeamId, awayTeamId, homeBadge, awayBadge }) => {
    const groups = useMemo(() => {
        const perTeam = new Map<string, Map<string, { attempts: number; makes: number; points: number }>>();
        perTeam.set(homeTeamId, new Map());
        perTeam.set(awayTeamId, new Map());
        const teamTotal: Record<string, number> = { [homeTeamId]: 0, [awayTeamId]: 0 };

        for (const ev of shotEvents ?? []) {
            if (!ev.playType) continue;
            const teamMap = perTeam.get(ev.teamId);
            if (!teamMap) continue; // 이 게임의 두 팀이 아니면 스킵
            let g = teamMap.get(ev.playType);
            if (!g) { g = { attempts: 0, makes: 0, points: 0 }; teamMap.set(ev.playType, g); }
            g.attempts++;
            if (ev.isMake) { g.makes++; g.points += ev.points ?? 0; }
            teamTotal[ev.teamId] = (teamTotal[ev.teamId] ?? 0) + 1;
        }

        const toAgg = (teamId: string, playType: string): TeamAgg | null => {
            const raw = perTeam.get(teamId)?.get(playType);
            if (!raw) return null;
            const total = teamTotal[teamId] ?? 0;
            return { ...raw, share: total > 0 ? (raw.attempts / total) * 100 : 0 };
        };

        const playTypes = new Set<string>();
        perTeam.forEach(m => m.forEach((_, pt) => playTypes.add(pt)));

        const list: PlayTypeGroup[] = [...playTypes].map(playType => {
            const away = toAgg(awayTeamId, playType);
            const home = toAgg(homeTeamId, playType);
            return { playType, away, home, combinedShare: (away?.share ?? 0) + (home?.share ?? 0) };
        });

        return list.sort((a, b) => b.combinedShare - a.combinedShare);
    }, [shotEvents, homeTeamId, awayTeamId]);

    const successOf = (agg: TeamAgg) => agg.attempts > 0 ? (agg.makes / agg.attempts) * 100 : 0;

    // 막대 길이를 절대 비율(0~100%)이 아니라 "가장 많이 쓰인 플레이타입" 대비 상대 비율로 스케일링 —
    // 개별 플레이타입 비율이 보통 2~17% 선이라 절대 스케일로 그리면 막대가 항상 짧아 보임.
    // 원정/홈 공통 기준(둘 중 최댓값)으로 정규화해야 두 팀 막대 길이가 서로 비교 가능하게 유지됨.
    const maxShare = useMemo(() => {
        let max = 0;
        for (const g of groups) {
            if (g.away && g.away.share > max) max = g.away.share;
            if (g.home && g.home.share > max) max = g.home.share;
        }
        return max > 0 ? max : 100;
    }, [groups]);
    const barWidthOf = (share: number) => (share / maxShare) * 100;

    return (
        // [Fix 2026-08-03] 이전 주석은 "align-items:stretch가 이 div까지 늘려준다"고 잘못 가정했음 —
        // stretch는 GamePbpTab.tsx의 우측 flex 자식(바깥 wrapper)만 520px로 늘릴 뿐, 그 안의 일반
        // block 자식인 이 div는 자동으로 늘어나지 않고 자기 콘텐츠 높이(플레이타입 12행)만큼만 차지함.
        // 그래서 로그가 많아 꽉 차는 좌측 PBP보다 짧게 끝나 보였던 것 — h-full로 부모가 준 높이를
        // 명시적으로 채우고, 헤더는 고정(shrink-0)/바디는 flex-1로 나머지 공간을 전부 차지하게 함.
        <div className="h-full flex flex-col bg-slate-900">
            {groups.length === 0 ? (
                <>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-2 pt-2 pb-1">플레이타입</p>
                    <p className="text-xs text-slate-600 py-4 text-center">데이터 없음</p>
                </>
            ) : (
                <>
                    {/* 헤더 — Table.tsx의 TableHead(bg-slate-950 sticky, text-slate-500 font-black, h-10)와 동일 톤.
                        막대 컬럼엔 팀 약어를 라벨로 달아 원정/홈 구분, 중앙엔 "플레이타입" 라벨 통합. */}
                    <div className={`shrink-0 grid ${GRID_COLS} items-center gap-1 px-2 h-10 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm`}>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">비율</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">성공률</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">득점</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center truncate">{awayBadge.abbr.slice(0, 3)}</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">플레이타입</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center truncate">{homeBadge.abbr.slice(0, 3)}</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">득점</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">성공률</span>
                        <span className="text-xs font-black uppercase text-slate-500 text-center">비율</span>
                    </div>

                    {/* 바디 — Table.tsx의 TableBody(bg-slate-900) + TableRow(hover:bg-white/5) + TableCell(border-b) 동일 톤.
                        flex-1 min-h-0 overflow-y-auto — 남는 세로 공간을 전부 차지(짧으면 여백, 길면 자체 스크롤). */}
                    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-900">
                        {groups.map(g => {
                            const away = g.away ?? EMPTY_AGG;
                            const home = g.home ?? EMPTY_AGG;
                            // 박스스코어 탭(BoxScoreTable.tsx)의 stat 셀 톤과 동일 — 흰색/모노스페이스/세미볼드/tabular-nums
                            const sc = 'text-xs font-mono font-semibold text-white text-center tabular-nums';
                            return (
                                <div
                                    key={g.playType}
                                    className={`grid ${GRID_COLS} items-center gap-1 px-2 py-2 border-b border-slate-800/50 transition-colors hover:bg-white/5`}
                                >
                                    {/* 원정(바깥→안쪽): 비율 → 성공률 → 득점 → 막대(중앙 방향으로 자람, 플레이타입명 바로 옆) */}
                                    <span className={sc}>{away.share.toFixed(1)}%</span>
                                    <span className={sc}>{successOf(away).toFixed(1)}%</span>
                                    <span className={sc}>{away.points}</span>
                                    <div className="h-2.5 mx-1 flex justify-end rounded-sm overflow-hidden bg-slate-950">
                                        {away.share > 0 && (
                                            <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${barWidthOf(away.share)}%`, backgroundColor: awayBadge.color }} />
                                        )}
                                    </div>

                                    {/* 중앙: 플레이타입명 */}
                                    <span className="text-xs font-semibold text-white text-center truncate px-0.5">
                                        {PLAY_TYPE_LABEL[g.playType] ?? g.playType}
                                    </span>

                                    {/* 홈(안쪽→바깥): 막대(중앙 반대 방향으로 자람, 플레이타입명 바로 옆) → 득점 → 성공률 → 비율 */}
                                    <div className="h-2.5 mx-1 flex justify-start rounded-sm overflow-hidden bg-slate-950">
                                        {home.share > 0 && (
                                            <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${barWidthOf(home.share)}%`, backgroundColor: homeBadge.color }} />
                                        )}
                                    </div>
                                    <span className={sc}>{home.points}</span>
                                    <span className={sc}>{successOf(home).toFixed(1)}%</span>
                                    <span className={sc}>{home.share.toFixed(1)}%</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};
