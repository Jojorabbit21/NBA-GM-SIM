
import React, { useMemo } from 'react';
import { TacticalSliders } from '../../../../types';
import { PLAY_TYPES_WITH_TRANSITION, getFullPlayTypeDistribution } from './playTypeConstants';
import type { TeamPlayTypeTotals } from '../../../../hooks/useTeamPlayTypeStats';
import { Spinner } from '../../../common/Spinner';
import { InlineNotice } from '../../../common/InlineNotice';

/** [2026-10-18] 실제 경기 기반 PPP(멀티 전술 화면 전용) — 지정되면 예상 비중 차트 아래 "PPP" 섹션을 그린다 */
export interface PlayTypeActual {
    totals: TeamPlayTypeTotals | undefined;
    /** 우리 팀 시즌 경기 중 추정치(백필)가 섞인 경기 수 — 0보다 크면 안내 문구 */
    estimatedGames?: number;
    myTeamId: string | null;
    isLoading: boolean;
    isError: boolean;
}

interface PlayTypePPPProps {
    sliders: TacticalSliders;
    actual?: PlayTypeActual;
}

// PPP 표시 기준 — 리그 평균 대비 ±0.03 이상이면 초록/빨강, 포제션 20회 미만은 흐리게 + "표본 적음",
// 막대 스케일은 PPP 0.6~1.4(대부분의 플레이타입이 들어오는 구간, 바깥은 끝에 붙음)
const PPP_COLOR_THRESHOLD = 0.03;
const PPP_MIN_POSS = 20;
const PPP_SCALE_MIN = 0.6;
const PPP_SCALE_MAX = 1.4;
const pppToPct = (v: number) => Math.max(0, Math.min(100, ((v - PPP_SCALE_MIN) / (PPP_SCALE_MAX - PPP_SCALE_MIN)) * 100));

// 값(그 차트 안에서의 상대적 비중) → 빨강(최저)~노랑(중간)~초록(최고) 3단 스펙트럼.
// 빨강↔초록 2색만 RGB에서 직선 보간하면 중간 지점(R·G 채널이 서로 교차하는 구간)이 채도 낮은
// 갈색/올리브색으로 탁하게 보인다(둘 다 50%씩 섞이면 회색에 가까워지는 RGB 보간의 특성) —
// TeamZoneChartInsight.tsx(인사이트 탭 샷차트)와 동일하게 노랑을 중간 정착점으로 둬서 항상
// 채도 높은 색만 지나가도록 함. 노랑은 앱 warning 토큰(tailwind.config.js status.warning)과
// 동일한 amber-500.
const MIN_COLOR = '#ef4444'; // red-500 (최저 비중)
const MID_COLOR = '#f59e0b'; // amber-500 (중간)
const MAX_COLOR = '#10b981'; // emerald-500 (최고 비중)

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpChannel(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * t);
}

function distributionColor(ratio: number): string {
    const t = Math.max(0, Math.min(1, ratio));
    const [fromHex, toHex, segT] = t < 0.5
        ? [MIN_COLOR, MID_COLOR, t / 0.5]
        : [MID_COLOR, MAX_COLOR, (t - 0.5) / 0.5];
    const [r1, g1, b1] = hexToRgb(fromHex);
    const [r2, g2, b2] = hexToRgb(toHex);
    return `rgb(${lerpChannel(r1, r2, segT)}, ${lerpChannel(g1, g2, segT)}, ${lerpChannel(b1, b2, segT)})`;
}

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders, actual }) => {
    // [2026-10-18] 속공 포함 11종 — 속공은 pace로 정해지는 것일 뿐 다른 플레이타입과 같은 목록(구분선 없음)
    const data = useMemo(() => {
        const distribution = getFullPlayTypeDistribution(sliders);
        return PLAY_TYPES_WITH_TRANSITION.map((pt, i) => ({
            ...pt,
            distribution: distribution[i],
        }));
    }, [sliders]);

    // 최댓값 기준 정규화 — 가장 긴 막대가 가로폭을 꽉 채우도록
    const maxDistribution = useMemo(() => Math.max(1, ...data.map(d => d.distribution)), [data]);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-base font-black text-white">플레이타입 분석</h5>
            <div className="-mt-1.5 text-xs text-slate-500">슬라이더 기준 예상 비중</div>

            {/* 라벨(텍스트 길이만큼 auto 트랙) → 막대(minmax(0,1fr) — 남은 폭을 그대로 채움) →
                퍼센트 순. w-full 블록 그리드라 배정된 컬럼 폭을 그대로 채운다. 예전엔 막대를
                고정 280px로 둬서 컨테이너가 넓을 때 빈 공간이 안 생기게 했었는데, 지금은
                PlayTypePPP를 담는 부모 자체가 TacticsSlidersPanel의 4:4:2 레이아웃으로
                항상 폭이 제한돼 있어(20% 트랙) 무한정 넓어질 걱정이 없다 — 대신 컨테이너가
                좁을 때(그 4:4:2의 2fr 트랙) 막대가 라벨/퍼센트 폭을 침범하지 않고 정확히
                남는 공간만 채워야 해서 1fr로 변경. (참고: min(1fr, 280px)처럼 grid track
                sizing 함수 안에 fr 단위를 못 쓴다 — 유효하지 않은 값이라 전체
                grid-template-columns가 무시되면서 3열이 세로로 쌓이는 버그가 있었음.) */}
            <div className="grid w-full gap-x-3 gap-y-3 items-center" style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
                {data.map(item => {
                    const ratio = item.distribution / maxDistribution;
                    return (
                        <React.Fragment key={item.key}>
                            <div className="text-left text-base font-normal text-slate-400 whitespace-nowrap">
                                {item.label}
                            </div>
                            <div className="relative h-7 bg-slate-800 rounded-sm overflow-hidden">
                                <div
                                    className="h-full rounded-sm transition-all duration-300"
                                    style={{
                                        width: `${Math.max(ratio * 100, 2)}%`,
                                        backgroundColor: distributionColor(ratio),
                                    }}
                                />
                            </div>
                            <div className="text-right text-base font-normal text-white tabular-nums">
                                {item.distribution.toFixed(0)}%
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {actual && <PlayTypeActualSection actual={actual} />}
        </div>
    );
};

/** 실제 경기 기반 PPP — 우리 팀 시즌 합계 vs 리그 평균(같은 플레이타입 전체 팀 합 pts/poss). 풋백은 표시 제외. */
const PlayTypeActualSection: React.FC<{ actual: PlayTypeActual }> = ({ actual }) => {
    const view = useMemo(() => {
        const totals = actual.totals;
        if (!totals || !actual.myTeamId) return null;
        const mine = totals[actual.myTeamId] ?? {};
        const keys = PLAY_TYPES_WITH_TRANSITION.map(p => p.key);
        const myTotal = keys.reduce((s, k) => s + (mine[k]?.poss ?? 0), 0);
        if (myTotal === 0) return { empty: true as const, rows: [] };
        const rows = PLAY_TYPES_WITH_TRANSITION.map(pt => {
            const m = mine[pt.key];
            let lgPts = 0, lgPoss = 0;
            for (const byPt of Object.values(totals)) {
                const l = byPt[pt.key];
                if (l) { lgPts += l.pts; lgPoss += l.poss; }
            }
            const poss = m?.poss ?? 0;
            const ppp = poss > 0 ? (m!.pts / poss) : null;
            const avg = lgPoss > 0 ? lgPts / lgPoss : null;
            const small = poss < PPP_MIN_POSS;
            const diff = ppp !== null && avg !== null ? ppp - avg : 0;
            const tone = ppp === null || small ? 'muted' : diff >= PPP_COLOR_THRESHOLD ? 'good' : diff <= -PPP_COLOR_THRESHOLD ? 'bad' : 'even';
            return { key: pt.key, label: pt.label, poss, ppp, avg, small, tone, share: (poss / myTotal) * 100 };
        });
        return { empty: false as const, rows };
    }, [actual.totals, actual.myTeamId]);

    const TONE_TEXT = { good: 'text-emerald-400', bad: 'text-red-400', even: 'text-slate-300', muted: 'text-slate-400' } as const;
    const TONE_BAR  = { good: 'bg-emerald-400', bad: 'bg-red-400', even: 'bg-slate-300', muted: 'bg-slate-500' } as const;

    return (
        <>
            {/* 슬라이더 그룹 사이 구분선과 같은 규격 */}
            <div className="h-px bg-slate-700 my-4" />
            <h5 className="text-base font-black text-white">PPP</h5>
            <div className="-mt-1.5 text-xs text-slate-500 leading-relaxed">이번 시즌 · 포제션당 득점(자유투·턴오버 포함)</div>
            {!!actual.estimatedGames && (
                <div className="text-xs text-amber-400/90 leading-relaxed break-keep">
                    {actual.estimatedGames}경기는 기능 도입 전 기록이라 턴오버·자유투 배분이 추정치입니다
                </div>
            )}

            {actual.isError ? (
                <InlineNotice tone="danger" size="sm">PPP를 불러오지 못했습니다</InlineNotice>
            ) : actual.isLoading || !view ? (
                <Spinner variant="section" />
            ) : view.empty ? (
                <div className="mt-1 px-4 py-5 border border-dashed border-slate-700 rounded-lg flex flex-col items-center gap-2 text-center">
                    <div className="text-sm font-semibold text-slate-300">아직 집계된 경기가 없습니다</div>
                    <div className="text-xs text-slate-500 leading-relaxed">PPP는 이 기능 도입 이후 치른 경기부터 집계됩니다.</div>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span aria-hidden="true" className="inline-block w-0.5 h-3 bg-slate-200 rounded-sm" />리그 평균
                        <span className="ml-2 text-emerald-400">높음</span>
                        <span className="text-red-400">낮음</span>
                    </div>
                    <div className="mt-1 flex flex-col gap-3.5">
                        {view.rows.map(r => (
                            <div key={r.key} className={`flex flex-col gap-1.5 ${r.small ? 'opacity-50' : ''}`}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-sm text-slate-300 whitespace-nowrap">{r.label}</span>
                                    <span className={`text-base font-bold tabular-nums ${TONE_TEXT[r.tone as keyof typeof TONE_TEXT]}`}>
                                        {r.ppp === null ? '—' : r.ppp.toFixed(2)}
                                    </span>
                                </div>
                                <div className="relative h-1.5 bg-slate-800 rounded-full">
                                    {r.ppp !== null && (
                                        <div className={`h-full rounded-full opacity-75 ${TONE_BAR[r.tone as keyof typeof TONE_BAR]}`} style={{ width: `${pppToPct(r.ppp)}%` }} />
                                    )}
                                    {r.avg !== null && (
                                        <div aria-hidden="true" className="absolute -top-[3px] w-0.5 h-3 bg-slate-200 rounded-sm" style={{ left: `${pppToPct(r.avg)}%` }} />
                                    )}
                                </div>
                                <div className="flex justify-between text-xs text-slate-500 tabular-nums">
                                    <span>실제 {r.share.toFixed(0)}% · {r.poss}회{r.small ? ' · 표본 적음' : ''}</span>
                                    <span>리그 {r.avg === null ? '—' : r.avg.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">풋백(공격 리바운드 후 즉시 마무리)은 제외</div>
                </>
            )}
        </>
    );
};
