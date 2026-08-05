import React, { useMemo } from 'react';

// ─────────────────────────────────────────────────────────────
// Team Stats Compare (NBA app TEAM STATS style dual-bar chart)
// LiveGameView.tsx에서 추출 — 라이브 화면(우측 하단 패널)과 GamePbpTab(경기기록 탭 우측)에서 공용.
// ─────────────────────────────────────────────────────────────

const COMPARE_STATS = [
    { key: 'pts', label: 'PTS', fmt: (v: number) => String(v) },
    { key: 'fgPct', label: 'FG%', fmt: (v: number) => v.toFixed(1) },
    { key: 'p3Pct', label: '3P%', fmt: (v: number) => v.toFixed(1) },
    { key: 'ftPct', label: 'FT%', fmt: (v: number) => v.toFixed(1) },
    { key: 'oreb', label: 'OREB', fmt: (v: number) => String(v) },
    { key: 'reb', label: 'REB', fmt: (v: number) => String(v) },
    { key: 'ast', label: 'AST', fmt: (v: number) => String(v) },
    { key: 'stl', label: 'STL', fmt: (v: number) => String(v) },
    { key: 'blk', label: 'BLK', fmt: (v: number) => String(v) },
    { key: 'tov', label: 'TOV', fmt: (v: number) => String(v) },
    { key: 'pf', label: 'PF', fmt: (v: number) => String(v) },
] as const;

export const TeamStatsCompare: React.FC<{
    homeBox: { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number }[];
    awayBox: { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number }[];
    homeColor: string;
    awayColor: string;
}> = ({ homeBox, awayBox, homeColor, awayColor }) => {
    type BoxRow = { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number };
    const stats = useMemo(() => {
        const sum = (arr: BoxRow[], key: keyof BoxRow) =>
            arr.reduce((s, p) => s + (p[key] ?? 0), 0);

        const hFgm = sum(homeBox, 'fgm'), hFga = sum(homeBox, 'fga');
        const aFgm = sum(awayBox, 'fgm'), aFga = sum(awayBox, 'fga');
        const hP3m = sum(homeBox, 'p3m'), hP3a = sum(homeBox, 'p3a');
        const aP3m = sum(awayBox, 'p3m'), aP3a = sum(awayBox, 'p3a');
        const hFtm = sum(homeBox, 'ftm'), hFta = sum(homeBox, 'fta');
        const aFtm = sum(awayBox, 'ftm'), aFta = sum(awayBox, 'fta');

        return {
            pts:   { h: sum(homeBox, 'pts'), a: sum(awayBox, 'pts') },
            fgPct: { h: hFga > 0 ? (hFgm / hFga) * 100 : 0, a: aFga > 0 ? (aFgm / aFga) * 100 : 0 },
            p3Pct: { h: hP3a > 0 ? (hP3m / hP3a) * 100 : 0, a: aP3a > 0 ? (aP3m / aP3a) * 100 : 0 },
            ftPct: { h: hFta > 0 ? (hFtm / hFta) * 100 : 0, a: aFta > 0 ? (aFtm / aFta) * 100 : 0 },
            oreb:  { h: sum(homeBox, 'offReb'), a: sum(awayBox, 'offReb') },
            reb:   { h: sum(homeBox, 'reb'), a: sum(awayBox, 'reb') },
            ast:   { h: sum(homeBox, 'ast'), a: sum(awayBox, 'ast') },
            stl:   { h: sum(homeBox, 'stl'), a: sum(awayBox, 'stl') },
            blk:   { h: sum(homeBox, 'blk'), a: sum(awayBox, 'blk') },
            tov:   { h: sum(homeBox, 'tov'), a: sum(awayBox, 'tov') },
            pf:    { h: sum(homeBox, 'pf'), a: sum(awayBox, 'pf') },
        };
    }, [homeBox, awayBox]);

    return (
        <div className="shrink-0 px-3 py-2">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">팀 스탯</p>
            <div className="flex flex-col gap-1">
                {COMPARE_STATS.map(({ key, label, fmt }) => {
                    const { h, a } = stats[key as keyof typeof stats];
                    const total = h + a;
                    const hPct = total > 0 ? (h / total) * 100 : 50;
                    const aPct = total > 0 ? (a / total) * 100 : 50;
                    const hWins = h > a;
                    const aWins = a > h;
                    const bothZero = h === 0 && a === 0;

                    return (
                        <div key={key} className="grid grid-cols-[1fr_40px_44px_40px_1fr] items-center gap-2">
                            {/* Away bar (grows right-to-left) */}
                            <div className="h-3 flex justify-end rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && (
                                    <div
                                        className="h-full rounded-sm transition-all duration-300"
                                        style={{ width: `${aPct}%`, backgroundColor: awayColor }}
                                    />
                                )}
                            </div>
                            {/* Away value */}
                            <span className={`text-xs font-mono text-right text-white ${aWins ? 'font-bold' : ''}`}>
                                {fmt(a)}
                            </span>
                            {/* Label */}
                            <span className="text-xs font-bold text-slate-400 text-center uppercase">{label}</span>
                            {/* Home value */}
                            <span className={`text-xs font-mono text-left text-white ${hWins ? 'font-bold' : ''}`}>
                                {fmt(h)}
                            </span>
                            {/* Home bar (grows left-to-right) */}
                            <div className="h-3 flex justify-start rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && (
                                    <div
                                        className="h-full rounded-sm transition-all duration-300"
                                        style={{ width: `${hPct}%`, backgroundColor: homeColor }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
