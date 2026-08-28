
import React, { useMemo } from 'react';
import { TacticalSliders } from '../../../../types';
import { PLAY_TYPES, getPlayTypeDistribution } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
}

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

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders }) => {
    const data = useMemo(() => {
        const distribution = getPlayTypeDistribution(sliders);
        return PLAY_TYPES.map((pt, i) => ({
            ...pt,
            distribution: distribution[i],
        }));
    }, [sliders]);

    // 최댓값 기준 정규화 — 가장 긴 막대가 가로폭을 꽉 채우도록
    const maxDistribution = useMemo(() => Math.max(1, ...data.map(d => d.distribution)), [data]);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-base font-black text-white uppercase tracking-widest">플레이타입 분석</h5>

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
        </div>
    );
};
