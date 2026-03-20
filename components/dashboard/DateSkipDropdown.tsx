import React, { useRef, useEffect, useMemo } from 'react';
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
    prospectReveal: '프로스펙트 공개',
};

/** ISO 날짜 → 한글 포맷 */
export function formatDateKorean(isoDate: string): string {
    const d = new Date(isoDate + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** ISO 날짜 → 짧은 한글 포맷 (YYYY년 M월 D일) */
function formatDateSimple(isoDate: string): string {
    const d = new Date(isoDate + 'T00:00:00');
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export interface UpcomingGame {
    date: string;
    opponentName: string;
    isToday: boolean;
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
    upcomingGames?: UpcomingGame[];
}

/** 공통 아이템 행 배경 */
const ITEM_BG = { background: '#0f172a' } as React.CSSProperties;

/** 오늘 경기 강조 배경 */
const ITEM_BG_TODAY = { background: 'rgba(52,211,153,0.08)' } as React.CSSProperties;

/** 구분선 */
const Separator = () => (
    <div style={{ height: '1px', background: '#334155', flexShrink: 0 }} />
);

/** 아이템 행 (날짜 좌 / 텍스트 우) */
const EventRow: React.FC<{
    date: string;
    label: string;
    isToday?: boolean;
    onClick?: () => void;
    disabled?: boolean;
}> = ({ date, label, isToday, onClick, disabled }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            onClick={onClick}
            disabled={onClick ? disabled : undefined}
            className={`w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                onClick ? 'hover:brightness-125 transition-all' : ''
            }`}
            style={{
                ...(isToday ? ITEM_BG_TODAY : ITEM_BG),
                borderBottom: '1px solid #334155',
            }}
        >
            <span className="text-slate-400 whitespace-nowrap">{date}</span>
            <span className="text-slate-100 whitespace-nowrap ml-4">{label}</span>
        </Tag>
    );
};

export const DateSkipDropdown: React.FC<DateSkipDropdownProps> = ({
    isOpen,
    onClose,
    currentSimDate,
    keyDates,
    onSkipToDate,
    onSimulateFullSeason,
    isSimulating,
    isOffseason,
    upcomingGames = [],
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

    // 미래 Key Dates 날짜순 정렬
    const futureDates = useMemo(() => {
        const items: { key: keyof SeasonKeyDates; date: string; name: string }[] = [];
        for (const key of Object.keys(KEY_DATE_LABELS) as (keyof SeasonKeyDates)[]) {
            const date = (keyDates as any)[key];
            if (date && date > currentSimDate) {
                items.push({ key, date, name: KEY_DATE_LABELS[key] });
            }
        }
        items.sort((a, b) => a.date.localeCompare(b.date));
        return items;
    }, [keyDates, currentSimDate]);

    // 오프시즌 하단 텍스트 결정
    const bottomLabel = useMemo(() => {
        if (isOffseason) return null;
        const finals = (keyDates as any).finalsStart;
        if (finals && currentSimDate >= finals) return '플레이오프 종료까지';
        return '정규시즌 종료까지';
    }, [isOffseason, keyDates, currentSimDate]);

    if (!isOpen) return null;

    const handleSkip = (date: string, label: string) => {
        onClose();
        onSkipToDate(date, label);
    };

    const handleFullSeason = () => {
        onClose();
        onSimulateFullSeason();
    };

    return (
        <div
            ref={dropdownRef}
            className="absolute top-full right-0 mt-1 z-[200] flex flex-col overflow-hidden"
            style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '10px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                minWidth: '270px',
                maxHeight: 'calc(100vh - 140px)',
                overflowY: 'auto',
            }}
        >
            {/* 헤더 */}
            <div className="px-4 py-2 shrink-0 sticky top-0 z-10" style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    날짜 이동
                </span>
            </div>

            {/* 섹션 1: 미래 5경기 */}
            {upcomingGames.length > 0 && upcomingGames.map((game, i) => (
                <EventRow
                    key={`game-${i}`}
                    date={formatDateSimple(game.date)}
                    label={`vs ${game.opponentName}`}
                    isToday={game.isToday}
                    onClick={() => handleSkip(game.date, `vs ${game.opponentName}`)}
                    disabled={isSimulating}
                />
            ))}

            {/* 구분선 */}
            {upcomingGames.length > 0 && futureDates.length > 0 && <Separator />}

            {/* 섹션 2: 키 데이트 */}
            {futureDates.map(item => (
                <EventRow
                    key={item.key}
                    date={formatDateSimple(item.date)}
                    label={item.name}
                    onClick={() => handleSkip(item.date, item.name)}
                    disabled={isSimulating}
                />
            ))}

            {futureDates.length === 0 && upcomingGames.length === 0 && (
                <div className="px-4 py-4 text-center text-xs text-slate-500" style={ITEM_BG}>
                    남은 일정이 없습니다
                </div>
            )}

            {/* 구분선 + 시즌 종료까지 (오프시즌 제외) */}
            {bottomLabel && (
                <>
                    <Separator />
                    <button
                        onClick={handleFullSeason}
                        disabled={isSimulating}
                        className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold shrink-0 hover:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={ITEM_BG}
                    >
                        <span className="text-slate-400">&nbsp;</span>
                        <span className="text-slate-100">{bottomLabel}</span>
                    </button>
                </>
            )}
        </div>
    );
};
