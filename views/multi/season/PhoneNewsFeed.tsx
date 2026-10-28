// PhoneNewsFeed.tsx — 폰(<768) 뉴스피드 렌더러. [2026-10-27 모바일 뉴스피드]
// docs/ui/mobile-design-system.md §9-1-10, 캔버스 11행 N1~N4(2판 = 데스크톱 디자인 그대로). 데이터·필터 상태·레터(StoryCard)는 MultiNewsFeedView가
// 그대로 들고 있고, 이 파일은 폰 화면 둘(목록 / 레터 상세 push)과 필터 시트·검색 헤더만 그린다.
//   목록: MobilePushHeader(‹ · BrandMark h-5 · 검색 · 필터) → 필터 바(데스크톱 날짜 스텝퍼 pill 그대로) → 데스크톱 목록 항목 그대로(1줄 truncate · 날짜, 세로만 44) → 더 보기
//   상세: MobilePushHeader(‹ · "리그 소식") → bg-slate-900 p-4 안에 StoryCard(LetterShell 그대로; 박스스코어 표만 newsFeedCards에서 sticky 선수 열)
//   필터 시트: 정렬·빅 뉴스만 토글 pill, 팀 드롭다운 트리거 → 팀 체크 시트, 소식 종류 체크박스 2열, 알림 범위 SegmentedControl — 전부 데스크톱 컨트롤 모양
//   검색(H6): 헤더가 데스크톱 검색 pill + 취소로 교체. 날짜 범위(from~to)는 시트에 없고 스텝퍼로만.
import React, { useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { BrandMark } from './newsFeedLetter';
import { MobilePushHeader, MobilePushHeaderButton } from '../../../components/mobile/MobilePushHeader';
import { BottomSheet, SheetGroupTitle, SheetOptionRow } from '../../../components/mobile/BottomSheet';
import { IconButton } from '../../../components/common/IconButton';
import { TogglePill } from '../../../components/mobile/TogglePill';
import { Button } from '../../../components/common/Button';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { TeamMark } from '../../../components/common/TeamMark';
import type { LeagueEvent, LeagueEventType, NewsSortOrder } from '../../../hooks/useLeagueHeadlines';
import type { LeagueNotificationScope } from '../../../hooks/useLeagueNotifications';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { formatRelativeTime } from '../../../utils/formatRelativeTime';

export interface PhoneNewsTypeOption { label: string; types: LeagueEventType[] }

export interface PhoneNewsFeedProps {
    /** 레터 상세가 열려 있으면 그 노드(StoryCard), 아니면 null → 목록 */
    detail: React.ReactNode | null;
    /** 상세가 열렸는데 아직 못 찾은 상태(뒷페이지 조회 중) */
    detailLoading: boolean;
    onBack: () => void;
    onOpenStory: (id: string) => void;
    // 목록·필터
    isLoading: boolean;
    stories: LeagueEvent[];
    hasMore: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
    hasActiveFilter: boolean;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    dateLabel: string;
    isDefaultToday: boolean;
    shiftDateRange: (delta: number) => void;
    resetToToday: () => void;
    simDateFrom: string;
    simDateTo: string;
    setSimDateRange: (from: string, to: string) => void;
    sortOrder: NewsSortOrder;
    setSortOrder: (o: NewsSortOrder) => void;
    bigNewsOnly: boolean;
    setBigNewsOnly: (v: boolean) => void;
    teams: LeagueTeamRow[];
    selectedTeams: string[];
    setSelectedTeams: (slugs: string[]) => void;
    typeOptions: PhoneNewsTypeOption[];
    selectedTypes: LeagueEventType[];
    toggleTypeGroup: (types: LeagueEventType[]) => void;
    resetFilters: () => void;
    /** 시트 점·초기화 대상 — 검색어·날짜 제외(헤더/날짜 줄에서 따로 보이므로) */
    sheetFilterActive: boolean;
    notifScope: LeagueNotificationScope;
    setNotifScope: (v: LeagueNotificationScope) => void;
    formatSimDateShort: (d: string) => string;
}

export const PhoneNewsFeed: React.FC<PhoneNewsFeedProps> = (p) => {
    const [searchOpen, setSearchOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [teamSheetOpen, setTeamSheetOpen] = useState(false);
    const [dateSheetOpen, setDateSheetOpen] = useState(false);
    const dateRangeActive = !!(p.simDateFrom || p.simDateTo);

    // ── 레터 상세(push 2단계)
    if (p.detail !== null || p.detailLoading) {
        return (
            <div className="h-full flex flex-col overflow-hidden text-slate-200 pretendard">
                <MobilePushHeader title="리그 소식" onBack={p.onBack} />
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                    <div className="p-4">
                        {p.detail ?? <Spinner variant="section" />}
                    </div>
                    <div aria-hidden="true" className="h-14 pb-safe" />
                </div>
            </div>
        );
    }

    const closeSearch = () => { setSearchOpen(false); p.setSearchQuery(''); };
    const teamLabel = p.selectedTeams.length === 0 ? '전체' : p.selectedTeams.length === 1
        ? (p.teams.find(t => t.team_slug === p.selectedTeams[0])?.team_abbr ?? '1팀')
        : `${p.selectedTeams.length}팀`;

    // ── 검색 활성 헤더(H6): 데스크톱 검색 pill(h-36 · Search 14 · text-sm bold · X) + 취소
    const searchHeader = (
        <div className="flex-1 flex items-center gap-2 pl-3">
            <div className="relative flex-1 h-9 bg-slate-950 rounded-lg border border-indigo-500 shadow-sm">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Search size={14} /></div>
                <input
                    autoFocus
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    placeholder="제목/내용으로 검색"
                    className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600 ko-normal"
                    value={p.searchQuery}
                    onChange={e => p.setSearchQuery(e.target.value)}
                />
                {p.searchQuery && (
                    <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => p.setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X size={12} />
                    </IconButton>
                )}
            </div>
            <button type="button" onClick={closeSearch} className="h-10 px-2 text-base font-semibold text-indigo-400 shrink-0">취소</button>
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden text-slate-200 pretendard">
            <MobilePushHeader
                title={<BrandMark className="h-5 w-auto" />}
                onBack={p.onBack}
                replace={searchOpen ? searchHeader : undefined}
                actions={(
                    <>
                        <MobilePushHeaderButton label="검색" onClick={() => setSearchOpen(true)}><Search size={22} strokeWidth={1.8} /></MobilePushHeaderButton>
                        <MobilePushHeaderButton label="필터" dot={p.sheetFilterActive} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={22} strokeWidth={1.8} /></MobilePushHeaderButton>
                    </>
                )}
            />

            {/* 필터 바 — 데스크톱 상단 바(px-4 py-3 bg-slate-900 border-b)의 날짜 스텝퍼 pill 그대로. 나머지 pill은 필터 시트로. */}
            <div className="shrink-0 px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                <div className="flex items-center gap-0.5 h-[30px] bg-slate-950 rounded-lg border border-slate-800 pl-1 pr-1">
                    <IconButton label="하루 전" size="sm" tone="subtle" shape="md" onClick={() => p.shiftDateRange(-1)}><ChevronLeft size={14} /></IconButton>
                    <span className="text-sm text-slate-400 px-1 whitespace-nowrap">{p.dateLabel}</span>
                    <IconButton label="하루 후" size="sm" tone="subtle" shape="md" onClick={() => p.shiftDateRange(1)}><ChevronRight size={14} /></IconButton>
                    {!p.isDefaultToday && (
                        <Button variant="link" onClick={p.resetToToday} className="pl-1.5 pr-2 ml-0.5 border-l border-slate-800">오늘</Button>
                    )}
                </div>
                {/* 날짜 범위(from~to) — 데스크톱의 날짜 범위 pill을 폰에선 달력 버튼 → 바텀 시트로(2026-10-28, 장식 아이콘이던 것을 기능화) */}
                <button
                    type="button"
                    onClick={() => setDateSheetOpen(true)}
                    aria-label="날짜 범위"
                    className={`ml-auto w-11 h-11 -my-2 -mr-2 flex items-center justify-center rounded-lg active:bg-white/10 ${dateRangeActive ? 'text-indigo-400' : 'text-slate-400'}`}
                >
                    <Calendar size={20} strokeWidth={1.8} />
                </button>
            </div>

            {/* 목록 — 데스크톱 좌측 목록 항목 클래스 그대로(bg-slate-900 · px-3 · border-b slate-800/50 · 제목 truncate slate-300 · 날짜 text-sm), 세로 패딩만 py-3(44) */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                {searchOpen && p.searchQuery.trim() && (
                    <div className="px-3 pt-2 pb-1 text-xs text-slate-500 ko-normal">검색 결과 {p.stories.length}건 · 불러온 소식 안에서만 찾습니다</div>
                )}
                {p.isLoading ? (
                    <Spinner variant="section" />
                ) : p.stories.length === 0 ? (
                    <EmptyState title={p.hasActiveFilter ? '조건에 맞는 소식이 없습니다.' : '아직 소식이 없습니다.'} />
                ) : (
                    <>
                        {p.stories.map(e => (
                            <div
                                key={e.id}
                                id={`news-story-${e.id}`}
                                onClick={() => p.onOpenStory(e.id)}
                                className="flex items-start gap-2 px-3 py-3 cursor-pointer border-b border-slate-800/50 text-sm ko-normal bg-slate-900 active:bg-white/5"
                            >
                                <span className="flex-1 min-w-0 truncate leading-snug text-slate-300">{e.headline}</span>
                                <span className="shrink-0 text-sm tabular-nums text-slate-300">{e.simDate ? p.formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}</span>
                            </div>
                        ))}
                        {p.hasMore && (
                            <div className="p-3">
                                <Button variant="secondary" size="lg" fullWidth className="ko-normal" onClick={p.fetchNextPage} disabled={p.isFetchingNextPage}>
                                    {p.isFetchingNextPage ? '불러오는 중...' : '더 보기'}
                                </Button>
                            </div>
                        )}
                    </>
                )}
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>

            {/* 필터 시트 — 행 48, 각 행 우측에 데스크톱 컨트롤 pill 그대로 */}
            <BottomSheet
                open={filterOpen}
                title="필터"
                onClose={() => setFilterOpen(false)}
                headerRight={<button type="button" onClick={p.resetFilters} disabled={!p.sheetFilterActive} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">초기화</button>}
            >
                <div className="h-12 flex items-center justify-between border-b border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">정렬</span>
                    <TogglePill left="최신순" right="오래된순" on={p.sortOrder === 'oldest'} onClick={() => p.setSortOrder(p.sortOrder === 'latest' ? 'oldest' : 'latest')} title="정렬 순서 전환" />
                </div>
                <div className="h-12 flex items-center justify-between border-b border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">빅 뉴스만</span>
                    <TogglePill left="빅 뉴스만" on={p.bigNewsOnly} onClick={() => p.setBigNewsOnly(!p.bigNewsOnly)} title="중요도 높은 소식만 보기" />
                </div>
                <div className="h-12 flex items-center justify-between border-b border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">팀</span>
                    {/* CheckboxFilterDropdown 트리거 pill 모양 — 탭하면 팝오버 대신 팀 체크 시트 */}
                    <button type="button" onClick={() => setTeamSheetOpen(true)} className="flex items-center gap-1.5 h-9 bg-slate-950 rounded-lg border border-slate-800 shadow-sm pl-3 pr-2.5 text-sm font-bold text-slate-400 whitespace-nowrap">
                        {teamLabel}
                        <ChevronDown size={14} className="text-slate-500" />
                    </button>
                </div>
                <SheetGroupTitle>소식 종류</SheetGroupTitle>
                {/* 데스크톱 타입 체크박스(w-4 h-4 rounded border slate-600 bg slate-950 / 체크 indigo-600 + Check 10, 라벨 text-sm bold) 2열 */}
                <div className="grid grid-cols-2 pb-1">
                    {p.typeOptions.map(opt => {
                        const checked = opt.types.every(t => p.selectedTypes.includes(t));
                        return (
                            <button key={opt.label} type="button" role="checkbox" aria-checked={checked} onClick={() => p.toggleTypeGroup(opt.types)} className="h-10 flex items-center gap-1.5 text-left">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                    {checked && <Check size={10} className="text-white" />}
                                </span>
                                <span className={`text-sm font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="h-12 flex items-center justify-between border-t border-slate-800">
                    <span className="text-xs font-bold text-slate-500 ko-normal shrink-0">알림 범위</span>
                    <SegmentedControl
                        size="sm"
                        value={p.notifScope}
                        onChange={p.setNotifScope}
                        options={[
                            { value: 'my_team', label: '내 팀 관련' },
                            { value: 'all', label: '리그 전체' },
                            { value: 'off', label: '끔' },
                        ]}
                    />
                </div>
            </BottomSheet>

            {/* 날짜 범위 시트 — 데스크톱 날짜 범위 pill(인게임 날짜 from~to, type=date [color-scheme:dark])을 두 줄로 */}
            <BottomSheet
                open={dateSheetOpen}
                title="날짜 범위"
                onClose={() => setDateSheetOpen(false)}
                headerRight={<button type="button" onClick={() => p.setSimDateRange('', '')} disabled={!dateRangeActive} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">전체 기간</button>}
            >
                {([['시작', p.simDateFrom, (v: string) => p.setSimDateRange(v, p.simDateTo), { max: p.simDateTo || undefined }],
                   ['종료', p.simDateTo, (v: string) => p.setSimDateRange(p.simDateFrom, v), { min: p.simDateFrom || undefined }]] as const).map(([label, value, onChange, limits]) => (
                    <div key={label} className="h-12 flex items-center justify-between gap-3 border-b border-slate-800 last:border-b-0">
                        <span className="text-sm font-semibold text-slate-200">{label} 날짜</span>
                        <div className="flex items-center h-9 bg-slate-950 rounded-lg border border-slate-800 shadow-sm">
                            <div className="pl-3 pr-2 flex items-center justify-center text-slate-500 shrink-0"><Calendar size={14} /></div>
                            <input
                                type="date"
                                value={value}
                                onChange={e => onChange(e.target.value)}
                                {...limits}
                                className="h-full bg-transparent pr-2 text-sm text-slate-300 outline-none [color-scheme:dark] w-[140px]"
                                aria-label={`${label} 인게임 날짜`}
                            />
                        </div>
                    </div>
                ))}
                <p className="pt-2 text-xs text-slate-500 ko-normal">인게임(시뮬레이션) 날짜 기준입니다. 비워 두면 전체 기간.</p>
            </BottomSheet>

            {/* 팀 체크 시트 — CheckboxFilterDropdown의 행(로고 + 팀명 + 체크)을 시트로 */}
            <BottomSheet
                open={teamSheetOpen}
                title="팀"
                onClose={() => setTeamSheetOpen(false)}
                headerRight={<button type="button" onClick={() => p.setSelectedTeams([])} disabled={p.selectedTeams.length === 0} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">전체</button>}
            >
                {p.teams.map(team => {
                    const checked = p.selectedTeams.includes(team.team_slug);
                    return (
                        <div key={team.team_slug} className="flex items-center gap-2">
                            <TeamMark variant="logo" teamId={team.team_slug} size="sm" />
                            <div className="flex-1 min-w-0">
                                <SheetOptionRow
                                    type="checkbox"
                                    label={team.team_name}
                                    checked={checked}
                                    onChange={() => p.setSelectedTeams(checked ? p.selectedTeams.filter(s => s !== team.team_slug) : [...p.selectedTeams, team.team_slug])}
                                />
                            </div>
                        </div>
                    );
                })}
            </BottomSheet>
        </div>
    );
};
