// PhoneLeaderboard.tsx — 폰(<768) 리더보드 셸. [2026-10-28 모바일 리더보드]
// docs/ui/mobile-design-system.md §9-1-12, 캔버스 13행 L1~L4(2판 = 데스크톱 디자인 언어 그대로). 상태·데이터 훅·정렬·페이지는 LeaderboardView가
// 그대로 들고 있고, 이 파일은 폰 화면만 그린다:
//   화면 헤더 44(순위표와 같은 slate-900 줄: "리더보드" 18/700 · 검색 44 · 필터 44 — 공용 상단 바는 레이아웃이 유지, 2026-10-28 순위표와 동위라는 사용자 결정) → 선택 줄 52(데스크톱 브레드크럼: 선수/팀 ▾ "/" 카테고리 ▾ → ActionSheet + 새로고침 pill 36)
//   → 조건 칩 줄(슬레이트 PhoneChips — 데스크톱 indigo FilterChips 아님, 팀/포지션 선택도 칩; 시트 안 스탯 조건 아래에도 같은 칩) → 표(LeaderboardTable 폰 가상 고정 열) → Pagination compact
//   필터 시트: 시즌·색상 스케일 TogglePill, 팀/포지션 FilterTrigger → 체크 시트, StatFilterBar 그대로, 페이지 당 select. 검색은 H6(데스크톱 검색 pill + 취소).
import React, { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Team } from '../../types';
import type { SeasonType } from '../../hooks/useLeaderboardData';
import {
    TRADITIONAL_STAT_OPTIONS, SHOOTING_STAT_OPTIONS, ADVANCED_STAT_OPTIONS, DEFENSE_STAT_OPTIONS, OPPONENT_STAT_OPTIONS,
    ATTRIBUTES_STAT_OPTIONS, TEAM_DEFENSE_STAT_OPTIONS, TEAM_ATTRIBUTES_STAT_OPTIONS, type FilterItem, type ViewMode, type StatCategory,
} from '../../data/leaderboardConfig';
import { MobilePushHeaderButton } from '../mobile/MobilePushHeader';
import { SectionTabs } from '../mobile/SectionTabs';
import { ActionSheet } from '../mobile/ActionSheet';
import { BottomSheet, SheetGroupTitle, SheetOptionRow } from '../mobile/BottomSheet';
import { TogglePill } from '../mobile/TogglePill';
import { FilterTrigger } from '../common/filters/FilterTrigger';
import { StatFilterBar, type StatFilterDraft } from '../common/filters/StatFilterBar';
import { IconButton } from '../common/IconButton';
import { TeamMark } from '../common/TeamMark';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../common/Pagination';

export interface PhoneLeaderboardProps {
    mode: ViewMode;
    setMode: (m: ViewMode) => void;
    statCategory: StatCategory;
    setStatCategory: (c: StatCategory) => void;
    teams: Team[];
    selectedTeams: string[];
    setSelectedTeams: (ids: string[]) => void;
    selectedPositions: string[];
    setSelectedPositions: (pos: string[]) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    seasonType: SeasonType;
    setSeasonType: (t: SeasonType) => void;
    hideSeasonType?: boolean;
    showHeatmap: boolean;
    setShowHeatmap: (v: boolean) => void;
    activeFilters: FilterItem[];
    addFilter: (item: FilterItem) => void;
    removeFilter: (id: string) => void;
    clearFilters: () => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    itemsPerPage: number;
    onItemsPerPageChange: (n: number) => void;
    onBack?: () => void;
    /** LeaderboardTable(폰 가상 고정 열) */
    table: React.ReactNode;
    /** Pagination compact */
    pagination: React.ReactNode;
}

const MODE_LABELS: Record<ViewMode, string> = { Players: '선수', Teams: '팀' };
const CATEGORY_LABELS: Record<StatCategory, string> = { Traditional: '기본', Shooting: '슈팅', Advanced: '어드밴스드', Defense: '수비', Attributes: '능력치', Opponent: '상대팀' };
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

/** 폰 조건 칩 — 데스크톱 FilterChips(indigo 틴트) 대신 슬레이트 pill(2026-10-28 사용자 지시). 표 위 줄(가로 스크롤)과 필터 시트 안(줄바꿈) 공용. */
const PhoneChips: React.FC<{ chips: { id: string; label: string }[]; onRemove: (id: string) => void; onClear?: () => void; wrap?: boolean }> = ({ chips, onRemove, onClear, wrap = false }) => (
    <div className={`flex items-center gap-2 ${wrap ? 'flex-wrap' : 'min-w-max'}`}>
        {chips.map(chip => (
            <span key={chip.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap">
                {chip.label}
                <button type="button" onClick={() => onRemove(chip.id)} aria-label={`${chip.label} 제거`} className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 active:bg-white/10"><X size={12} /></button>
            </span>
        ))}
        {onClear && chips.length > 1 && (
            <button type="button" onClick={onClear} className="h-7 px-2 text-xs font-semibold text-slate-400 whitespace-nowrap">모두 제거</button>
        )}
    </div>
);

export const PhoneLeaderboard: React.FC<PhoneLeaderboardProps> = (p) => {
    const [searchOpen, setSearchOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [teamSheetOpen, setTeamSheetOpen] = useState(false);
    const [posSheetOpen, setPosSheetOpen] = useState(false);
    const [modeSheetOpen, setModeSheetOpen] = useState(false);
    const [catSheetOpen, setCatSheetOpen] = useState(false);

    // 데스크톱 LeaderboardToolbar와 같은 규칙 — 카테고리 목록(팀 모드만 상대팀), 스탯 조건 옵션
    const categoryIds: StatCategory[] = p.mode === 'Teams'
        ? ['Traditional', 'Shooting', 'Advanced', 'Defense', 'Attributes', 'Opponent']
        : ['Traditional', 'Shooting', 'Advanced', 'Defense', 'Attributes'];
    let options = TRADITIONAL_STAT_OPTIONS;
    if (p.statCategory === 'Shooting') options = SHOOTING_STAT_OPTIONS;
    else if (p.statCategory === 'Advanced') options = ADVANCED_STAT_OPTIONS;
    else if (p.statCategory === 'Defense') options = p.mode === 'Teams' ? TEAM_DEFENSE_STAT_OPTIONS : DEFENSE_STAT_OPTIONS;
    else if (p.statCategory === 'Opponent') options = OPPONENT_STAT_OPTIONS;
    else if (p.statCategory === 'Attributes') options = p.mode === 'Teams' ? TEAM_ATTRIBUTES_STAT_OPTIONS : ATTRIBUTES_STAT_OPTIONS;
    const handleAddStatFilter = (draft: StatFilterDraft) => p.addFilter({ id: Date.now().toString(), type: 'stat', ...draft });

    const sortedTeams = useMemo(() => [...p.teams].sort((a, b) => a.id.localeCompare(b.id)), [p.teams]);
    const abbrOf = (id: string) => p.teams.find(t => t.id === id)?.abbr ?? id.toUpperCase();

    // 칩 = 스탯 조건(데스크톱과 동일) + 팀/포지션 선택(폰은 필터가 시트 안에 있어 현재 상태를 표 위에 노출)
    const chips = [
        ...(p.selectedTeams.length > 0 ? [{ id: '__teams', label: `팀: ${p.selectedTeams.map(abbrOf).join(', ')}` }] : []),
        ...(p.mode === 'Players' && p.selectedPositions.length > 0 ? [{ id: '__pos', label: `포지션: ${p.selectedPositions.join(', ')}` }] : []),
        ...p.activeFilters.map(f => ({ id: f.id, label: f.label })),
    ];
    const removeChip = (id: string) => {
        if (id === '__teams') p.setSelectedTeams([]);
        else if (id === '__pos') p.setSelectedPositions([]);
        else p.removeFilter(id);
    };
    const filterActive = p.selectedTeams.length > 0 || p.selectedPositions.length > 0 || p.activeFilters.length > 0 || p.seasonType !== 'regular' || p.itemsPerPage !== 50;

    const closeSearch = () => { setSearchOpen(false); p.setSearchQuery(''); };
    const searchHeader = (
        <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 h-9 bg-slate-950 rounded-lg border border-indigo-500 shadow-sm">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Search size={14} /></div>
                <input autoFocus type="text" inputMode="search" enterKeyHint="search" placeholder="이름으로 검색"
                    className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600"
                    value={p.searchQuery} onChange={e => p.setSearchQuery(e.target.value)} />
                {p.searchQuery && (
                    <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => p.setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={12} /></IconButton>
                )}
            </div>
            <button type="button" onClick={closeSearch} className="h-10 px-2 text-base font-semibold text-indigo-400 shrink-0">취소</button>
        </div>
    );

    const crumb = (label: string, cls: string, onClick: () => void, ariaLabel: string) => (
        <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={ariaLabel} className={`flex items-center gap-1 text-base font-black tracking-tight ${cls}`}>
            <span>{label}</span>
            <ChevronDown size={14} className="text-slate-600 mt-0.5" />
        </button>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden ko-normal">
            {/* 순위 섹션 탭 바(리그 순위 ↔ 리더보드) 44 — 공용 상단 바는 레이아웃이 위에 그린다. 우측 검색·필터, 검색 활성 시 줄 전체가 검색 pill + 취소. */}
            <SectionTabs
                active="leaderboard"
                replace={searchOpen ? searchHeader : undefined}
                right={(
                    <>
                        <MobilePushHeaderButton label="검색" onClick={() => setSearchOpen(true)}><Search size={22} strokeWidth={1.8} /></MobilePushHeaderButton>
                        <MobilePushHeaderButton label="필터" dot={filterActive} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={22} strokeWidth={1.8} /></MobilePushHeaderButton>
                    </>
                )}
            />

            {/* 선택 줄 — 데스크톱 브레드크럼 그대로(선수/팀 white · "/" · 카테고리 slate-400) + 새로고침 pill */}
            {/* 브레드크럼 글자는 데스크톱 text-lg → 폰 text-base(2026-10-28 사용자 지시), 줄 높이 52 → 44 */}
            <div className="shrink-0 h-11 px-4 flex items-center gap-3 bg-slate-900 border-b border-slate-800">
                {crumb(MODE_LABELS[p.mode], 'text-white', () => setModeSheetOpen(true), '선수 / 팀 전환')}
                <span className="text-slate-700 text-base font-light">/</span>
                {crumb(CATEGORY_LABELS[p.statCategory], 'text-slate-400', () => setCatSheetOpen(true), '스탯 카테고리')}
                <span className="flex-1" />
                {p.onRefresh && (
                    <button type="button" onClick={p.onRefresh} disabled={p.refreshing} aria-label="최신 데이터로 새로고침"
                        className="flex items-center justify-center h-9 w-9 bg-slate-950 rounded-lg border border-slate-800 shadow-sm text-slate-400 active:text-white disabled:opacity-50">
                        <RefreshCw size={14} className={p.refreshing ? 'animate-spin' : ''} />
                    </button>
                )}
            </div>

            {chips.length > 0 && (
                <div className="shrink-0 px-4 py-2 bg-slate-900 border-b border-slate-800 overflow-x-auto [scrollbar-width:none]">
                    <PhoneChips chips={chips} onRemove={removeChip} onClear={p.clearFilters} />
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">{p.table}</div>
            {p.pagination}
            <div aria-hidden="true" className="h-14 pb-safe shrink-0 bg-slate-950" />

            <ActionSheet<ViewMode> open={modeSheetOpen} title="선수 / 팀" items={[{ value: 'Players', label: '선수' }, { value: 'Teams', label: '팀' }]} value={p.mode} onSelect={v => p.setMode(v)} onClose={() => setModeSheetOpen(false)} />
            <ActionSheet<StatCategory> open={catSheetOpen} title="스탯 카테고리" items={categoryIds.map(id => ({ value: id, label: CATEGORY_LABELS[id] }))} value={p.statCategory} onSelect={v => p.setStatCategory(v)} onClose={() => setCatSheetOpen(false)} />

            {/* 필터 시트 — 행마다 "라벨 | 데스크톱 컨트롤 그대로" */}
            <BottomSheet
                open={filterOpen}
                title="필터"
                onClose={() => setFilterOpen(false)}
                headerRight={<button type="button" onClick={() => { p.clearFilters(); p.setSeasonType('regular'); p.onItemsPerPageChange(50); }} disabled={!filterActive} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">초기화</button>}
            >
                {!p.hideSeasonType && (
                    <div className="min-h-[48px] py-1.5 flex items-center justify-between gap-3 border-b border-slate-800">
                        <span className="text-sm font-semibold text-slate-200">시즌</span>
                        <TogglePill left="정규시즌" right="플레이오프" on={p.seasonType === 'playoff'} onClick={() => p.setSeasonType(p.seasonType === 'regular' ? 'playoff' : 'regular')} title="정규시즌 / 플레이오프 전환" />
                    </div>
                )}
                <div className="min-h-[48px] py-1.5 flex items-center justify-between gap-3 border-b border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">색상 스케일</span>
                    <TogglePill left="색상 스케일" on={p.showHeatmap} onClick={() => p.setShowHeatmap(!p.showHeatmap)} title="스탯 분포 색상 표시" />
                </div>
                <div className="min-h-[48px] py-1.5 flex items-center justify-between gap-3 border-b border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">팀</span>
                    <FilterTrigger label="팀" count={p.selectedTeams.length} onClick={() => setTeamSheetOpen(true)} />
                </div>
                {p.mode === 'Players' && (
                    <div className="min-h-[48px] py-1.5 flex items-center justify-between gap-3 border-b border-slate-800">
                        <span className="text-sm font-semibold text-slate-200">포지션</span>
                        <FilterTrigger label="포지션" count={p.selectedPositions.length} onClick={() => setPosSheetOpen(true)} />
                    </div>
                )}
                {/* 위 행의 border-b가 이미 구분선이라 그룹 제목은 border-t 없이(first) — 두 줄 겹침 방지(2026-10-28) */}
                <SheetGroupTitle first>스탯 조건 추가</SheetGroupTitle>
                <div className="pb-2 [&>div]:w-full [&_input]:flex-1 [&_input]:min-w-0">
                    <StatFilterBar options={options} onAdd={handleAddStatFilter} />
                </div>
                {p.activeFilters.length > 0 && (
                    <div className="pb-3">
                        <PhoneChips wrap chips={p.activeFilters.map(f => ({ id: f.id, label: f.label }))} onRemove={p.removeFilter} />
                    </div>
                )}
                <div className="min-h-[48px] py-1.5 flex items-center justify-between gap-3 border-t border-slate-800">
                    <span className="text-sm font-semibold text-slate-200">페이지 당</span>
                    <select value={p.itemsPerPage} onChange={e => p.onItemsPerPageChange(Number(e.target.value))}
                        className="bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
                        {DEFAULT_PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
            </BottomSheet>

            {/* 팀 체크 시트 — CheckboxFilterDropdown의 행(로고 + 팀명 + 체크) */}
            <BottomSheet open={teamSheetOpen} title="팀" onClose={() => setTeamSheetOpen(false)}
                headerRight={<button type="button" onClick={() => p.setSelectedTeams([])} disabled={p.selectedTeams.length === 0} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">전체</button>}>
                {sortedTeams.map(team => {
                    const checked = p.selectedTeams.includes(team.id);
                    return (
                        <div key={team.id} className="flex items-center gap-2">
                            <TeamMark variant="logo" teamId={team.id} teamName={team.abbr ?? team.name} size="sm" />
                            <div className="flex-1 min-w-0">
                                <SheetOptionRow type="checkbox" label={team.name} checked={checked}
                                    onChange={() => p.setSelectedTeams(checked ? p.selectedTeams.filter(s => s !== team.id) : [...p.selectedTeams, team.id])} />
                            </div>
                        </div>
                    );
                })}
            </BottomSheet>
            <BottomSheet open={posSheetOpen} title="포지션" onClose={() => setPosSheetOpen(false)}
                headerRight={<button type="button" onClick={() => p.setSelectedPositions([])} disabled={p.selectedPositions.length === 0} className="h-8 px-2 text-sm font-semibold text-indigo-400 disabled:text-slate-600">전체</button>}>
                {POSITIONS.map(pos => {
                    const checked = p.selectedPositions.includes(pos);
                    return <SheetOptionRow key={pos} type="checkbox" label={pos} checked={checked} onChange={() => p.setSelectedPositions(checked ? p.selectedPositions.filter(s => s !== pos) : [...p.selectedPositions, pos])} />;
                })}
            </BottomSheet>
        </div>
    );
};
