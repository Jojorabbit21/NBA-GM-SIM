import React, { useMemo } from 'react';
import { InlineNotice } from '../common/InlineNotice';
import { Table, TableBody, TableRow, TableCell, TableGroupHeaderCell } from '../common/Table';
import type { PercentileCardData, PercentileEntry, PercentileSection } from '../../utils/percentileCard';

// 선수 퍼센타일 랭킹 카드 — 공용 Table(flush)에 섹션별 그룹 헤더 + "지표 · 슬라이더 · 값" 행(열 제목 행 없음). lg 이상은 섹션을 두 표로 나눠 좌우 2단,
// 그보다 좁으면(폰·태블릿) 한 표. 슬라이더는 막대 끝 핸들(원) 안에 백분위 숫자를 넣는다.
// 낮을수록 좋은 지표(TOV%, DFG%)는 계산 단계에서 이미 뒤집혀 있어 "막대가 길수록 리그 상위"가 모든 행에서 성립한다.
// 색은 하위(파랑) → 평균(회청) → 상위(빨강) 발산 스케일 — 핸들 안 흰 글자가 읽히도록 중간색도 어두운 톤(slate-500).

type Rgb = [number, number, number];
const BAR_STOPS: { at: number; rgb: Rgb }[] = [
    { at: 0, rgb: [37, 99, 235] },     // blue-600
    { at: 50, rgb: [100, 116, 139] },  // slate-500
    { at: 100, rgb: [220, 38, 38] },   // red-600
];

function scaleColor(p: number): string {
    const v = Math.min(100, Math.max(0, p));
    const upper = BAR_STOPS.findIndex(s => s.at >= v);
    const hi = upper === -1 ? BAR_STOPS.length - 1 : upper;
    const a = BAR_STOPS[Math.max(0, hi - 1)];
    const b = BAR_STOPS[hi];
    const t = b.at === a.at ? 0 : (v - a.at) / (b.at - a.at);
    const c = a.rgb.map((x, i) => Math.round(x + (b.rgb[i] - x) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const HANDLE = 26;
const NQ_COLOR = 'rgb(71, 85, 105)'; // slate-600

const MetricRow: React.FC<{ entry: PercentileEntry }> = ({ entry }) => {
    const { metric, value, percentile } = entry;
    // 자격 미달(NQ)은 백분위 위치는 그대로 두고 막대·핸들만 slate 로, 핸들 글자는 NQ
    const color = percentile !== null ? (entry.qualified ? scaleColor(percentile) : NQ_COLOR) : undefined;
    return (
        <TableRow>
            <TableCell align="left" title={metric.inverse ? `${metric.label}은(는) 낮을수록 좋은 지표입니다` : undefined}>
                <span className="text-sm font-medium text-slate-400">{metric.label}</span>
            </TableCell>
            <TableCell align="left" className="w-full min-w-[128px]">
                <div style={{ paddingLeft: HANDLE / 2, paddingRight: HANDLE / 2 }}>
                    <div className="relative h-4 rounded-full bg-slate-800">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600/60" />
                        {percentile !== null && (
                            <>
                                <div
                                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                                    style={{ width: `${percentile}%`, backgroundColor: color }}
                                />
                                <div
                                    className="absolute top-1/2 flex items-center justify-center rounded-full text-xs font-bold tabular-nums text-white ring-2 ring-slate-950 transition-[left] duration-300 ease-out motion-reduce:transition-none"
                                    style={{ width: HANDLE, height: HANDLE, left: `${percentile}%`, transform: 'translate(-50%, -50%)', backgroundColor: color }}
                                >
                                    {entry.qualified ? percentile : 'NQ'}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </TableCell>
            <TableCell align="right">
                {value !== null && Number.isFinite(value)
                    ? <span className="text-sm font-semibold tabular-nums text-slate-200">{metric.format(value)}</span>
                    : <span className="text-sm font-medium text-slate-600">-</span>}
            </TableCell>
        </TableRow>
    );
};

const SectionsTable: React.FC<{ sections: PercentileSection[] }> = ({ sections }) => (
    <Table variant="flush" dividers={false} fullHeight={false}>
        <TableBody>
            {sections.map(section => (
                <React.Fragment key={section.id}>
                    <tr className="h-10">
                        <TableGroupHeaderCell colSpan={3}>{section.label}</TableGroupHeaderCell>
                    </tr>
                    {section.entries.map(entry => <MetricRow key={entry.metric.key} entry={entry} />)}
                </React.Fragment>
            ))}
        </TableBody>
    </Table>
);

/** 섹션 순서를 유지한 채 두 표의 높이(행 수 + 그룹 헤더 1행)가 가장 비슷해지는 지점에서 나눈다. */
function splitSections(sections: PercentileSection[]): [PercentileSection[], PercentileSection[]] {
    if (sections.length < 2) return [sections, []];
    const weights = sections.map(s => s.entries.length + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let best = 1;
    let bestDiff = Infinity;
    let acc = 0;
    for (let i = 0; i < sections.length - 1; i++) {
        acc += weights[i];
        const diff = Math.abs(total - 2 * acc);
        if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
    }
    return [sections.slice(0, best), sections.slice(best)];
}

interface PercentileCardProps {
    data: PercentileCardData;
    title: string;
    /** 제목 오른쪽에 붙는 컨트롤(시즌·시즌 구분 드롭다운 등). */
    controls?: React.ReactNode;
    /** 있으면 표 대신 이 안내만 보여준다(지난 시즌처럼 데이터를 못 불러오는 경우). */
    notice?: string;
}

export const PercentileCard: React.FC<PercentileCardProps> = ({ data, title, controls, notice }) => {
    const [left, right] = useMemo(() => splitSections(data.sections), [data.sections]);
    const allEntries = data.sections.flatMap(s => s.entries);
    const hasInverse = allEntries.some(e => e.metric.inverse);
    const hasNq = allEntries.some(e => e.percentile !== null && !e.qualified);

    return (
        <div className="min-h-full w-full bg-slate-950">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-white">{title}</span>
                    {controls}
                </div>
                <span className="text-xs text-slate-500">
                    리그 {data.qualifiedCount}명 기준 · 총 출전 {Math.round(data.minMinutes)}분 이상 · 숫자는 리그 백분위(높을수록 상위)
                </span>
            </div>

            {notice && <InlineNotice tone="info">{notice}</InlineNotice>}
            {!notice && !data.hasSubject && (
                <InlineNotice tone="info">출전 기록이 없어 퍼센타일을 계산할 수 없습니다.</InlineNotice>
            )}
            {!notice && data.hasSubject && !data.subjectQualified && (
                <InlineNotice tone="info">출전 시간이 기준에 못 미쳐 참고용입니다. 순위는 기준을 충족한 선수들과 비교한 값입니다.</InlineNotice>
            )}

            {!notice && data.hasSubject && (
                <>
                    {/* lg(1024px) 이상은 섹션을 두 표로 나눠 좌우 2단, 그보다 좁으면 한 표 — CSS 분기라 화면 폭 훅이 필요 없다 */}
                    <div className="hidden grid-cols-2 lg:grid">
                        <div className="border-r border-slate-800"><SectionsTable sections={left} /></div>
                        <div><SectionsTable sections={right} /></div>
                    </div>
                    <div className="lg:hidden">
                        <SectionsTable sections={data.sections} />
                    </div>
                    {(hasInverse || hasNq) && (
                        <div className="space-y-1 px-4 py-3 text-xs text-slate-500">
                            {hasInverse && <div>TOV%, DFG%는 낮을수록 좋은 지표라 막대를 뒤집어 표시합니다.</div>}
                            {hasNq && <div>NQ는 출전 시간이나 시도 수가 기준에 못 미치는 지표입니다. 위치는 기준을 충족한 선수들과 비교한 값이라 참고용입니다.</div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
