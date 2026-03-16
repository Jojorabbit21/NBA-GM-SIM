import React, { useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Calendar, FastForward, MapPin } from 'lucide-react';
import { SeasonKeyDates } from '../../utils/seasonConfig';

/** Key Date 한글 라벨 매핑 */
const KEY_DATE_LABELS: Record<keyof SeasonKeyDates, string> = {
    draftLottery: '드래프트 로터리',
    rookieDraft: '신인 드래프트',
    moratoriumStart: 'FA 모라토리엄',
    freeAgencyOpen: 'FA 시장 개방',
    freeAgencyClose: 'FA 시장 마감',
    trainingCamp: '트레이닝 캠프',
    rosterDeadline: '로스터 확정',
    openingNight: '개막일',
    christmasDay: '크리스마스 데이',
    tradeDeadline: '트레이드 데드라인',
    allStarStart: '올스타 브레이크',
    allStarEnd: '올스타 종료',
    regularSeasonEnd: '정규시즌 종료',
    awardsAnnouncement: '시즌 어워드',
    playInStart: '플레이인 시작',
    playInEnd: '플레이인 종료',
    playoffsR1Start: '플레이오프 1라운드',
    playoffsR2Start: '플레이오프 2라운드',
    conferenceFinals: '컨퍼런스 파이널',
    finalsStart: 'NBA 파이널',
    finalsEndTarget: '시즌 종료',
};

/** 카테고리별 그룹핑 */
const CATEGORY_ORDER: { label: string; keys: (keyof SeasonKeyDates)[] }[] = [
    {
        label: '정규시즌',
        keys: ['openingNight', 'christmasDay', 'tradeDeadline', 'allStarStart', 'allStarEnd', 'regularSeasonEnd', 'awardsAnnouncement'],
    },
    {
        label: '포스트시즌',
        keys: ['playInStart', 'playInEnd', 'playoffsR1Start', 'playoffsR2Start', 'conferenceFinals', 'finalsStart', 'finalsEndTarget'],
    },
    {
        label: '오프시즌',
        keys: ['draftLottery', 'rookieDraft', 'moratoriumStart', 'freeAgencyOpen', 'freeAgencyClose', 'trainingCamp', 'rosterDeadline'],
    },
];

/** ISO 날짜 → 한글 포맷 */
export function formatDateKorean(isoDate: string): string {
    const d = new Date(isoDate + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** 두 ISO 날짜 사이 일수 */
function daysBetween(from: string, to: string): number {
    const a = new Date(from + 'T00:00:00');
    const b = new Date(to + 'T00:00:00');
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

interface DateSkipDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    currentSimDate: string;
    keyDates: SeasonKeyDates;
    onSkipToDate: (targetDate: string, label: string) => void;
    onSimulateFullSeason: () => void;
    isSimulating: boolean;
    themeText: string;
}

export const DateSkipDropdown: React.FC<DateSkipDropdownProps> = ({
    isOpen,
    onClose,
    currentSimDate,
    keyDates,
    onSkipToDate,
    onSimulateFullSeason,
    isSimulating,
    themeText,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 외부 클릭으로 닫기
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, onClose]);

    // 미래 Key Dates만 카테고리별로 그룹핑
    const groupedFutureDates = useMemo(() => {
        const result: { label: string; items: { key: keyof SeasonKeyDates; date: string; name: string; daysAway: number }[] }[] = [];

        for (const cat of CATEGORY_ORDER) {
            const items: { key: keyof SeasonKeyDates; date: string; name: string; daysAway: number }[] = [];
            for (const key of cat.keys) {
                const date = keyDates[key];
                if (date > currentSimDate) {
                    items.push({
                        key,
                        date,
                        name: KEY_DATE_LABELS[key],
                        daysAway: daysBetween(currentSimDate, date),
                    });
                }
            }
            if (items.length > 0) {
                items.sort((a, b) => a.date.localeCompare(b.date));
                result.push({ label: cat.label, items });
            }
        }
        return result;
    }, [keyDates, currentSimDate]);

    // 가장 가까운 미래 Key Date
    const nextKeyDate = useMemo(() => {
        let closest: { key: keyof SeasonKeyDates; date: string; name: string; daysAway: number } | null = null;
        for (const group of groupedFutureDates) {
            for (const item of group.items) {
                if (!closest || item.date < closest.date) {
                    closest = item;
                }
            }
        }
        return closest;
    }, [groupedFutureDates]);

    if (!isOpen) return null;

    const handleSkip = (date: string, label: string) => {
        onClose();
        onSkipToDate(date, label);
    };

    return (
        <div ref={dropdownRef} className="absolute top-full left-0 mt-1 z-[200] w-[320px] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                    <FastForward size={14} />
                    스킵 옵션
                </div>
            </div>

            {/* 다음 Key Date 하이라이트 */}
            {nextKeyDate && (
                <button
                    onClick={() => handleSkip(nextKeyDate.date, nextKeyDate.name)}
                    disabled={isSimulating}
                    className="w-full px-4 py-3 border-b border-white/5 hover:bg-indigo-500/15 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-indigo-400 shrink-0" />
                        <span className="text-sm font-bold text-indigo-400">다음 Key Date</span>
                    </div>
                    <div className="ml-6 mt-1">
                        <span className="text-sm font-semibold text-white">{nextKeyDate.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">{nextKeyDate.date}</span>
                            <span className="text-xs font-semibold text-indigo-400">{nextKeyDate.daysAway}일 후</span>
                        </div>
                    </div>
                </button>
            )}

            {/* 카테고리별 Key Dates 리스트 */}
            <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                {groupedFutureDates.map((group) => (
                    <div key={group.label}>
                        <div className="px-4 py-2 bg-slate-950/50">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{group.label}</span>
                        </div>
                        {group.items.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => handleSkip(item.date, item.name)}
                                disabled={isSimulating}
                                className="w-full px-4 py-2.5 hover:bg-white/5 transition-colors text-left flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Calendar size={13} className="text-slate-500 shrink-0" />
                                    <div>
                                        <span className="text-sm font-medium text-slate-200">{item.name}</span>
                                        <span className="text-xs text-slate-500 ml-2">{item.date}</span>
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-slate-500 shrink-0">{item.daysAway}일</span>
                            </button>
                        ))}
                    </div>
                ))}

                {groupedFutureDates.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                        남은 Key Date가 없습니다
                    </div>
                )}
            </div>

            {/* 시즌 끝까지 시뮬 */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => { onClose(); onSimulateFullSeason(); }}
                    disabled={isSimulating}
                    className="w-full px-4 py-3 hover:bg-white/5 transition-colors text-left flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <FastForward size={14} className="text-amber-400 shrink-0" />
                    <span className="text-sm font-semibold text-amber-400">시즌 끝까지 시뮬레이션</span>
                </button>
            </div>
        </div>
    );
};
