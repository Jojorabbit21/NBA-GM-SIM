
import React, { useMemo } from 'react';
import { TacticalSliders } from '../../../../types';
import { PLAY_TYPES, getPlayTypeDistribution } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
}

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders }) => {
    const data = useMemo(() => {
        const distribution = getPlayTypeDistribution(sliders);
        return PLAY_TYPES.map((pt, i) => ({
            ...pt,
            distribution: distribution[i],
        }));
    }, [sliders]);

    // 최댓값 기준 정규화 — 가장 큰 막대가 차트 높이를 꽉 채우도록
    const maxDistribution = useMemo(() => Math.max(1, ...data.map(d => d.distribution)), [data]);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 분석</h5>

            {/* 수치(%) 행 — 별도 행이라 라벨 줄바꿈 수와 무관하게 항상 한 줄로 정렬 */}
            <div className="flex gap-1.5">
                {data.map(item => (
                    <div key={item.key} className="flex-1 min-w-0 text-center text-[13px] font-black text-white tabular-nums">
                        {item.distribution.toFixed(0)}%
                    </div>
                ))}
            </div>

            {/* 막대 행 — 심플 그리드라인 + 고정 높이 */}
            <div className="relative flex items-end gap-1.5 h-[150px]">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className="w-full h-px bg-slate-800" />
                    ))}
                </div>
                {data.map(item => (
                    <div key={item.key} className="relative z-10 flex-1 min-w-0 h-full flex items-end">
                        <div
                            className="w-full rounded-t-sm transition-all duration-300"
                            style={{
                                height: `${Math.max((item.distribution / maxDistribution) * 100, 2)}%`,
                                backgroundColor: item.color,
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* 라벨 행 — 줄바꿈 수가 컬럼마다 달라도 위 두 행 정렬에 영향 없음 */}
            <div className="flex gap-1.5">
                {data.map(item => (
                    <div key={item.key} className="flex-1 min-w-0 text-center text-[12px] font-bold text-slate-400 leading-tight break-words">
                        {item.label}
                    </div>
                ))}
            </div>
        </div>
    );
};
