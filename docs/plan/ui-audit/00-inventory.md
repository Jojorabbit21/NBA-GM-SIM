# UI 인벤토리 요약 (기계 추출)

- 대상 파일 106개, 총 40,530줄, 매치 2,995건

## 역할별 건수

| role | count | 파일 수 |
|---|---|---|
| td_raw | 357 | 21 |
| th_raw | 299 | 19 |
| button_raw | 261 | 60 |
| divider_v | 241 | 29 |
| divider_b | 228 | 52 |
| empty_state | 218 | 57 |
| row_hover | 175 | 50 |
| tabular | 171 | 32 |
| zindex | 164 | 54 |
| divider_t | 123 | 33 |
| sticky | 106 | 28 |
| input_raw | 78 | 22 |
| card_box | 72 | 40 |
| badge_inline | 62 | 32 |
| money_short | 54 | 10 |
| header_text | 53 | 28 |
| spinner | 52 | 34 |
| ovr_calc | 52 | 20 |
| table_raw | 49 | 16 |
| logo_fallback | 48 | 16 |
| money_full | 26 | 5 |
| placehold | 25 | 17 |
| important_ovr | 22 | 16 |
| pill_rounded | 16 | 10 |
| select_raw | 15 | 10 |
| overlay_fixed | 10 | 9 |
| segment_ctrl | 5 | 4 |
| tab_underline | 4 | 3 |
| money_locale | 4 | 3 |
| live_dot | 3 | 3 |
| range_input | 2 | 2 |

## 세로 구분선(divider_v) 토큰 변형

| token | count |
|---|---|
| `border-r border-slate-800` | 125 |
| `border-r border-slate-800/30` | 72 |
| `border-r border-slate-800/50` | 18 |
| `border-r-slate-800/30` | 11 |
| `border-r border-slate-700` | 9 |
| `border-r border-slate-800/40` | 3 |
| `border-r-slate-700` | 2 |
| `border-r-slate-800/50` | 1 |

## 가로 구분선(divider_b) 토큰 변형 (상위 15)

| token | count |
|---|---|
| `border-b border-slate-800` | 110 |
| `border-b border-slate-800/60` | 43 |
| `border-b border-slate-700` | 37 |
| `border-b border-slate-800/50` | 29 |
| `border-b-slate-700` | 2 |
| `border-b-slate-800/50` | 1 |
| `border-b border-white/5` | 1 |
| `border-b border-slate-800/30` | 1 |
| `border-b-2 border-slate-700` | 1 |
| `border-b border-white/10` | 1 |
| `border-b border-slate-600` | 1 |
| `border-b-slate-600/700/800이` | 1 |

## 행 hover 토큰 변형

| token | count |
|---|---|
| `hover:bg-slate` | 132 |
| `hover:bg-white/5` | 29 |
| `hover:bg-white/10` | 7 |
| `hover:bg-white/[0.03]` | 6 |
| `hover:bg-white/[0.02]` | 1 |

## 헤더 글자 스타일 변형

| token | count |
|---|---|
| `font-black uppercase tracking-widest` | 7 |
| `text-xs font-bold uppercase tracking-wider` | 7 |
| `text-xs font-black uppercase tracking-widest` | 6 |
| `text-sm font-black uppercase tracking-widest` | 6 |
| `text-sm font-bold uppercase tracking-wider` | 6 |
| `text-[10px] font-black uppercase tracking-widest` | 4 |
| `text-[10px] font-bold uppercase tracking-wider` | 4 |
| `font-black uppercase tracking-wide` | 4 |
| `font-black uppercase tracking-wider` | 2 |
| `text-sm font-bold uppercase tracking-wide` | 2 |
| `text-[9px] font-black uppercase tracking-wider` | 1 |
| `text-xs font-black uppercase tracking-wider` | 1 |
| `font-black uppercase tracking-tight` | 1 |
| `font-bold uppercase tracking-widest` | 1 |
| `text-[9px] font-black uppercase tracking-widest` | 1 |

## 파일별 공용 import 매트릭스

| file | 줄 | Table | TabBar | Button | Badge | Card | Modal | Dropdown | PageHeader | Skeleton | OvrBadge | StarRating | TeamLogo | TeamBadge | TeamMark | InjuryStatusBadge | PlayerHoverCard | PlayerAwardBadges | SliderControl | SliderGroupNotes | NotificationCenter | DirectionBadge |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| components/MultiHeader.tsx | 579 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/MultiSidebar.tsx | 333 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/ActionButton.tsx | 189 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/AdminTradePanel.tsx | 307 |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/CoachProfileCard.tsx | 112 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/CoachStaffTable.tsx | 161 | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/DashboardHeader.tsx | 221 |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| components/dashboard/DateSkipDropdown.tsx | 231 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/DepthChartEditor.tsx | 322 | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/DepthRotationBoard.tsx | 721 |  |  |  |  |  |  | ● |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |
| components/dashboard/GMProfileCard.tsx | 108 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/GlobalSearch.tsx | 263 |  |  |  |  |  |  |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |
| components/dashboard/HeaderNavMenu.tsx | 263 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/MultiGlobalSearch.tsx | 248 |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/MultiHeaderNavMenu.tsx | 277 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/OpponentScoutPanel.tsx | 266 | ● |  |  |  |  |  |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |
| components/dashboard/RotationGanttChart.tsx | 693 |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/RotationManager.tsx | 60 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/RotationMatrix.tsx | 398 | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/TacticsBoard.tsx | 287 |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/PlayerTacticsPanel.tsx | 258 | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/PresetRenameModal.tsx | 46 |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/TacticalHalfCourt.tsx | 114 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/TacticsDataPanel.tsx | 77 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/TacticsSlidersPanel.tsx | 210 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● | ● |  |  |
| components/dashboard/tactics/insights/PlayerStatsTable.tsx | 103 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| components/dashboard/tactics/insights/TeamGameLogChart.tsx | 461 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/insights/TeamLeadersCards.tsx | 134 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| components/dashboard/tactics/insights/TeamStatRankList.tsx | 103 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/insights/TeamZoneChartInsight.tsx | 267 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/dashboard/tactics/insights/TeamZoneStatsTable.tsx | 156 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| components/multi/AllStarHalfCourt.tsx | 63 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/ColorField.tsx | 42 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/CourtPreview.tsx | 97 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/CreateLeagueModal.tsx | 1207 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/DraftPoolModal.tsx | 217 |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/DraftPoolSettings.tsx | 315 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/DraftSalaryScaleSettings.tsx | 140 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/LeagueBootstrapErrorScreen.tsx | 53 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/LeagueLoadingScreen.tsx | 28 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/PersonalDraftFormatEditor.tsx | 436 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/TeamSelectModal.tsx | 178 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/TeamSettingsPanel.tsx | 279 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/TeamSetupModal.tsx | 188 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/multi/TournamentChampionModal.tsx | 365 |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| components/roster/RosterGrid.tsx | 416 | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  | ● | ● |  |  |  |  |  |
| components/roster/RosterOverviewGrid.tsx | 260 | ● |  |  |  |  |  |  |  |  | ● | ● |  |  |  | ● | ● |  |  |  |  |  |
| components/roster/RosterStatsStack.tsx | 325 | ● |  |  |  |  |  | ● |  |  | ● |  |  |  |  | ● | ● |  |  |  |  |  |
| components/roster/RosterTabs.tsx | 33 |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/roster/SalaryCapDashboard.tsx | 143 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/roster/StartingLineup.tsx | 72 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/roster/TacticsHistory.tsx | 180 | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/roster/TeamGameLog.tsx | 397 | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| components/roster/TeamPayrollTable.tsx | 457 | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| components/roster/TeamScheduleCalendar.tsx | 332 | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| pages/MultiSeasonPage.tsx | 1216 |  |  |  |  |  |  |  |  |  | ● |  |  | ● |  | ● | ● |  |  |  |  |  |
| views/PlayerDetailView.tsx | 2611 | ● | ● |  |  |  |  |  |  |  | ● | ● |  | ● |  | ● |  |  |  |  |  |  |
| views/RosterView.tsx | 541 |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |
| views/multi/season/GameDateStrip.tsx | 425 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/LeagueLobbyPanel.tsx | 678 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MonthCalendarPopover.tsx | 87 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiAllStarView.tsx | 568 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiComingSoonView.tsx | 20 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiDraftPoolView.tsx | 464 | ● |  |  |  |  |  | ● |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiFreeAgentView.tsx | 684 | ● |  |  |  |  |  | ● |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiFrontOfficeView.tsx | 2137 | ● | ● |  |  |  |  |  |  |  | ● |  |  |  |  | ● | ● |  |  |  |  |  |
| views/multi/season/MultiFullCourtChart.tsx | 273 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiGamePbpView.tsx | 2762 |  | ● |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiLeaderboardView.tsx | 155 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiNegotiationView.tsx | 1567 |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiNewsFeedView.tsx | 616 |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiPlayerDetailView.tsx | 335 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiPlayoffsView.tsx | 46 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiReleaseView.tsx | 750 |  |  |  |  |  | ● |  |  |  | ● |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiRosterView.tsx | 316 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiScheduleView.tsx | 845 | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/MultiSeasonLayout.tsx | 104 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiShotChartTab.tsx | 285 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiStandingsView.tsx | 869 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MultiTacticsView.tsx | 653 |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/MyTradeBlockModal.tsx | 454 |  |  |  |  |  | ● |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/PlayerNewsTab.tsx | 121 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| views/multi/season/PostseasonBracket.tsx | 45 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/TournamentBracketView.tsx | 1078 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| views/multi/season/newsFeedCards.tsx | 3482 |  |  |  |  |  |  |  |  |  | ● |  | ● | ● |  |  | ● |  |  |  |  |  |

## 파일별 세로 구분선 토큰 (어떤 파일이 어떤 색을 쓰는지)

| file | tokens |
|---|---|
| components/MultiSidebar.tsx | `border-r border-slate-700`×1 |
| components/common/SliderGroupNotes.tsx | `border-r border-slate-700`×1 |
| components/dashboard/CoachProfileCard.tsx | `border-r border-slate-800`×12 |
| components/dashboard/CoachStaffTable.tsx | `border-r border-slate-800`×8, `border-r border-slate-800/30`×3 |
| components/dashboard/DepthChartEditor.tsx | `border-r border-slate-800/50`×6 |
| components/dashboard/DepthRotationBoard.tsx | `border-r border-slate-800`×2 |
| components/dashboard/GMProfileCard.tsx | `border-r border-slate-800`×7 |
| components/dashboard/OpponentScoutPanel.tsx | `border-r border-slate-800/50`×7, `border-r border-slate-800/30`×6, `border-r-slate-800/30`×4, `border-r border-slate-700`×2, `border-r-slate-700`×2, `border-r-slate-800/50`×1 |
| components/dashboard/RotationGanttChart.tsx | `border-r border-slate-800`×1 |
| components/dashboard/RotationMatrix.tsx | `border-r border-slate-800/30`×2, `border-r border-slate-800`×1, `border-r border-slate-800/50`×1 |
| components/roster/RosterGrid.tsx | `border-r border-slate-800`×6, `border-r border-slate-800/30`×6 |
| components/roster/RosterOverviewGrid.tsx | `border-r border-slate-800`×9, `border-r border-slate-800/30`×7 |
| components/roster/RosterStatsStack.tsx | `border-r border-slate-800`×6, `border-r border-slate-800/30`×2 |
| components/roster/SalaryCapDashboard.tsx | `border-r border-slate-800/50`×4 |
| components/roster/TeamGameLog.tsx | `border-r border-slate-800/30`×8, `border-r border-slate-800`×8 |
| components/roster/TeamPayrollTable.tsx | `border-r border-slate-800`×6, `border-r-slate-800/30`×5 |
| components/roster/TeamScheduleCalendar.tsx | `border-r border-slate-800`×5, `border-r border-slate-800/30`×4 |
| views/PlayerDetailView.tsx | `border-r border-slate-800/40`×3, `border-r-slate-800/30`×2, `border-r border-slate-700`×2, `border-r border-slate-800`×2 |
| views/multi/season/GameDateStrip.tsx | `border-r border-slate-700`×3 |
| views/multi/season/MultiDraftPoolView.tsx | `border-r border-slate-800`×10, `border-r border-slate-800/30`×7 |
| views/multi/season/MultiFreeAgentView.tsx | `border-r border-slate-800`×12, `border-r border-slate-800/30`×9 |
| views/multi/season/MultiFrontOfficeView.tsx | `border-r border-slate-800`×14, `border-r border-slate-800/30`×13 |
| views/multi/season/MultiGamePbpView.tsx | `border-r border-slate-800`×1 |
| views/multi/season/MultiNewsFeedView.tsx | `border-r border-slate-800`×1 |
| views/multi/season/MultiScheduleView.tsx | `border-r border-slate-800`×8, `border-r border-slate-800/30`×1 |
| views/multi/season/MultiShotChartTab.tsx | `border-r border-slate-800`×1 |
| views/multi/season/MultiStandingsView.tsx | `border-r border-slate-800/30`×4, `border-r border-slate-800`×3 |
| views/multi/season/MyTradeBlockModal.tsx | `border-r border-slate-800`×1 |
| views/multi/season/PlayerNewsTab.tsx | `border-r border-slate-800`×1 |

## 파일별 매치 수 (정독 체크리스트 크기)

| file | 줄 | 매치 | button_raw | table_raw | spinner | logo_fallback | overlay_fixed |
|---|---|---|---|---|---|---|---|
| components/MultiHeader.tsx | 579 | 14 | 3 | 0 | 0 | 2 | 0 |
| components/MultiSidebar.tsx | 333 | 20 | 5 | 0 | 0 | 0 | 0 |
| components/common/Badge.tsx | 42 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/common/Button.tsx | 70 | 5 | 1 | 0 | 1 | 0 | 0 |
| components/common/Card.tsx | 46 | 3 | 0 | 0 | 0 | 0 | 0 |
| components/common/DirectionBadge.tsx | 27 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/common/Dropdown.tsx | 148 | 5 | 1 | 0 | 0 | 0 | 0 |
| components/common/InjuryStatusBadge.tsx | 95 | 7 | 0 | 0 | 0 | 0 | 0 |
| components/common/Modal.tsx | 137 | 14 | 2 | 0 | 0 | 0 | 1 |
| components/common/NotificationCenter.tsx | 113 | 8 | 3 | 0 | 0 | 0 | 0 |
| components/common/OvrBadge.tsx | 147 | 2 | 0 | 0 | 0 | 0 | 0 |
| components/common/PageHeader.tsx | 43 | 3 | 0 | 0 | 0 | 0 | 0 |
| components/common/PlayerAwardBadges.tsx | 180 | 16 | 0 | 1 | 0 | 0 | 0 |
| components/common/PlayerHoverCard.tsx | 345 | 8 | 0 | 0 | 0 | 0 | 0 |
| components/common/Skeleton.tsx | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| components/common/SliderControl.tsx | 165 | 3 | 0 | 0 | 0 | 0 | 0 |
| components/common/SliderGroupNotes.tsx | 68 | 9 | 0 | 1 | 0 | 0 | 0 |
| components/common/StarRating.tsx | 89 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/common/TabBar.tsx | 56 | 4 | 1 | 0 | 0 | 0 | 0 |
| components/common/Table.tsx | 229 | 21 | 0 | 1 | 0 | 0 | 0 |
| components/common/TeamBadge.tsx | 51 | 0 | 0 | 0 | 0 | 0 | 0 |
| components/common/TeamLogo.tsx | 47 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/common/TeamMark.tsx | 44 | 3 | 0 | 0 | 0 | 2 | 0 |
| components/dashboard/ActionButton.tsx | 189 | 4 | 2 | 0 | 2 | 0 | 0 |
| components/dashboard/AdminTradePanel.tsx | 307 | 18 | 4 | 0 | 2 | 0 | 0 |
| components/dashboard/CoachProfileCard.tsx | 112 | 48 | 0 | 1 | 0 | 0 | 0 |
| components/dashboard/CoachStaffTable.tsx | 161 | 35 | 1 | 1 | 0 | 0 | 0 |
| components/dashboard/DashboardHeader.tsx | 221 | 7 | 1 | 0 | 0 | 0 | 0 |
| components/dashboard/DateSkipDropdown.tsx | 231 | 5 | 1 | 0 | 0 | 0 | 0 |
| components/dashboard/DepthChartEditor.tsx | 322 | 29 | 5 | 0 | 0 | 0 | 0 |
| components/dashboard/DepthRotationBoard.tsx | 721 | 81 | 11 | 1 | 0 | 0 | 0 |
| components/dashboard/GMProfileCard.tsx | 108 | 33 | 0 | 1 | 0 | 0 | 0 |
| components/dashboard/GlobalSearch.tsx | 263 | 15 | 2 | 0 | 0 | 0 | 0 |
| components/dashboard/HeaderNavMenu.tsx | 263 | 11 | 6 | 0 | 0 | 0 | 0 |
| components/dashboard/MultiGlobalSearch.tsx | 248 | 12 | 2 | 0 | 0 | 2 | 0 |
| components/dashboard/MultiHeaderNavMenu.tsx | 277 | 15 | 5 | 0 | 0 | 0 | 0 |
| components/dashboard/OpponentScoutPanel.tsx | 266 | 58 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/RotationGanttChart.tsx | 693 | 81 | 6 | 1 | 0 | 0 | 0 |
| components/dashboard/RotationManager.tsx | 60 | 2 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/RotationMatrix.tsx | 398 | 74 | 7 | 0 | 0 | 0 | 0 |
| components/dashboard/TacticsBoard.tsx | 287 | 18 | 9 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/PlayerTacticsPanel.tsx | 258 | 12 | 1 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/PresetRenameModal.tsx | 46 | 5 | 2 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/TacticalHalfCourt.tsx | 114 | 4 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/TacticsDataPanel.tsx | 77 | 6 | 1 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/TacticsSlidersPanel.tsx | 210 | 0 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/PlayerStatsTable.tsx | 103 | 5 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/TeamGameLogChart.tsx | 461 | 19 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/TeamLeadersCards.tsx | 134 | 6 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/TeamStatRankList.tsx | 103 | 10 | 2 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/TeamZoneChartInsight.tsx | 267 | 2 | 0 | 0 | 0 | 0 | 0 |
| components/dashboard/tactics/insights/TeamZoneStatsTable.tsx | 156 | 8 | 0 | 0 | 0 | 0 | 0 |
| components/multi/AllStarHalfCourt.tsx | 63 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/multi/ColorField.tsx | 42 | 2 | 0 | 0 | 0 | 0 | 0 |
| components/multi/CourtPreview.tsx | 97 | 2 | 0 | 0 | 0 | 0 | 0 |
| components/multi/CreateLeagueModal.tsx | 1207 | 42 | 6 | 0 | 1 | 0 | 1 |
| components/multi/DraftPoolModal.tsx | 217 | 15 | 3 | 0 | 1 | 0 | 1 |
| components/multi/DraftPoolSettings.tsx | 315 | 9 | 2 | 0 | 0 | 0 | 0 |
| components/multi/DraftSalaryScaleSettings.tsx | 140 | 13 | 2 | 0 | 0 | 0 | 0 |
| components/multi/LeagueBootstrapErrorScreen.tsx | 53 | 3 | 2 | 0 | 0 | 0 | 0 |
| components/multi/LeagueLoadingScreen.tsx | 28 | 2 | 0 | 0 | 1 | 0 | 0 |
| components/multi/PersonalDraftFormatEditor.tsx | 436 | 51 | 6 | 1 | 1 | 0 | 0 |
| components/multi/TeamSelectModal.tsx | 178 | 19 | 4 | 0 | 2 | 2 | 1 |
| components/multi/TeamSettingsPanel.tsx | 279 | 8 | 1 | 0 | 1 | 0 | 0 |
| components/multi/TeamSetupModal.tsx | 188 | 9 | 3 | 0 | 0 | 0 | 1 |
| components/multi/TournamentChampionModal.tsx | 365 | 48 | 2 | 1 | 1 | 0 | 2 |
| components/roster/RosterGrid.tsx | 416 | 46 | 0 | 1 | 0 | 0 | 0 |
| components/roster/RosterOverviewGrid.tsx | 260 | 36 | 1 | 0 | 0 | 0 | 0 |
| components/roster/RosterStatsStack.tsx | 325 | 30 | 1 | 0 | 0 | 0 | 0 |
| components/roster/RosterTabs.tsx | 33 | 0 | 0 | 0 | 0 | 0 | 0 |
| components/roster/SalaryCapDashboard.tsx | 143 | 22 | 0 | 0 | 0 | 0 | 0 |
| components/roster/StartingLineup.tsx | 72 | 1 | 0 | 0 | 0 | 0 | 0 |
| components/roster/TacticsHistory.tsx | 180 | 17 | 0 | 0 | 0 | 0 | 0 |
| components/roster/TeamGameLog.tsx | 397 | 35 | 0 | 0 | 1 | 0 | 0 |
| components/roster/TeamPayrollTable.tsx | 457 | 52 | 0 | 0 | 0 | 0 | 0 |
| components/roster/TeamScheduleCalendar.tsx | 332 | 29 | 3 | 0 | 1 | 0 | 0 |
| pages/MultiSeasonPage.tsx | 1216 | 97 | 0 | 3 | 2 | 2 | 0 |
| views/PlayerDetailView.tsx | 2611 | 181 | 10 | 6 | 1 | 2 | 0 |
| views/RosterView.tsx | 541 | 20 | 4 | 0 | 0 | 4 | 0 |
| views/multi/season/GameDateStrip.tsx | 425 | 30 | 8 | 0 | 0 | 2 | 0 |
| views/multi/season/LeagueLobbyPanel.tsx | 678 | 32 | 10 | 0 | 5 | 2 | 0 |
| views/multi/season/MonthCalendarPopover.tsx | 87 | 10 | 3 | 0 | 0 | 0 | 0 |
| views/multi/season/MultiAllStarView.tsx | 568 | 23 | 4 | 0 | 3 | 2 | 0 |
| views/multi/season/MultiComingSoonView.tsx | 20 | 0 | 0 | 0 | 0 | 0 | 0 |
| views/multi/season/MultiDraftPoolView.tsx | 464 | 53 | 10 | 0 | 1 | 0 | 1 |
| views/multi/season/MultiFreeAgentView.tsx | 684 | 64 | 11 | 0 | 1 | 0 | 1 |
| views/multi/season/MultiFrontOfficeView.tsx | 2137 | 171 | 11 | 6 | 3 | 2 | 0 |
| views/multi/season/MultiFullCourtChart.tsx | 273 | 11 | 1 | 0 | 0 | 0 | 0 |
| views/multi/season/MultiGamePbpView.tsx | 2762 | 184 | 1 | 5 | 1 | 4 | 0 |
| views/multi/season/MultiLeaderboardView.tsx | 155 | 1 | 0 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiNegotiationView.tsx | 1567 | 99 | 16 | 0 | 2 | 0 | 0 |
| views/multi/season/MultiNewsFeedView.tsx | 616 | 46 | 8 | 0 | 1 | 0 | 1 |
| views/multi/season/MultiPlayerDetailView.tsx | 335 | 5 | 0 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiPlayoffsView.tsx | 46 | 1 | 0 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiReleaseView.tsx | 750 | 45 | 5 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiRosterView.tsx | 316 | 1 | 0 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiScheduleView.tsx | 845 | 40 | 10 | 0 | 1 | 2 | 0 |
| views/multi/season/MultiSeasonLayout.tsx | 104 | 1 | 0 | 0 | 1 | 0 | 0 |
| views/multi/season/MultiShotChartTab.tsx | 285 | 13 | 3 | 0 | 0 | 0 | 0 |
| views/multi/season/MultiStandingsView.tsx | 869 | 33 | 1 | 0 | 1 | 2 | 0 |
| views/multi/season/MultiTacticsView.tsx | 653 | 6 | 1 | 0 | 4 | 0 | 0 |
| views/multi/season/MyTradeBlockModal.tsx | 454 | 36 | 10 | 0 | 1 | 0 | 0 |
| views/multi/season/PlayerNewsTab.tsx | 121 | 9 | 1 | 0 | 1 | 0 | 0 |
| views/multi/season/PostseasonBracket.tsx | 45 | 1 | 0 | 0 | 0 | 0 | 0 |
| views/multi/season/TournamentBracketView.tsx | 1078 | 18 | 1 | 0 | 0 | 2 | 0 |
| views/multi/season/newsFeedCards.tsx | 3482 | 500 | 12 | 18 | 3 | 14 | 0 |
