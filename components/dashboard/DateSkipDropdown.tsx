import React, { useRef, useEffect, useMemo } from 'react';
import { FastForward } from 'lucide-react';
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
    isOffseason?: boolean;
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
    isOffseason,
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

    // 미래 Key Dates 전체를 날짜순 정렬
    const futureDates = useMemo(() => {
        const items: { key: keyof SeasonKeyDates; date: string; name: string; daysAway: number }[] = [];
        for (const key of Object.keys(KEY_DATE_LABELS) as (keyof SeasonKeyDates)[]) {
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
        items.sort((a, b) => a.date.localeCompare(b.date));
        return items;
    }, [keyDates, currentSimDate]);

    if (!isOpen) return null;

    const handleSkip = (date: string, label: string) => {
        onClose();
        onSkipToDate(date, label);
    };

    return (
        <div ref={dropdownRef} className="absolute top-full left-0 mt-1 z-[200] w-[320px] bg-slate-700 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-slate-600">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-400">
                    스킵 옵션
                </div>
            </div>

            {/* Key Dates 리스트 (날짜순) */}
            <div className="max-h-[60vh] overflow-y-auto">
                {futureDates.map((item, idx) => (
                    <React.Fragment key={item.key}>
                        {idx > 0 && <div className="border-t border-slate-600" />}
                        <button
                            onClick={() => handleSkip(item.date, item.name)}
                            disabled={isSimulating}
                            className="w-full px-4 py-2.5 hover:bg-slate-600 transition-colors text-left flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <span className="text-sm font-medium text-slate-300">{item.name}</span>
                            <span className="text-sm font-medium text-slate-400 shrink-0">{item.date}</span>
                        </button>
                    </React.Fragment>
                ))}

                {futureDates.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">
                        남은 Key Date가 없습니다
                    </div>
                )}
            </div>

            {/* 시즌 끝까지 시뮬 — 오프시즌에서는 숨김 (개막일 스킵으로 대체) */}
            {!isOffseason && (
                <div className="border-t border-slate-600">
                    <button
                        onClick={() => { onClose(); onSimulateFullSeason(); }}
                        disabled={isSimulating}
                        className="w-full px-4 py-3 hover:bg-slate-600 transition-colors text-left flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <FastForward size={14} className="text-amber-400 shrink-0" />
                        <span className="text-sm font-semibold text-amber-400">시즌 끝까지 시뮬레이션</span>
                    </button>
                </div>
            )}
        </div>
    );
};
