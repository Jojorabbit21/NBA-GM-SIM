# 버튼 인벤토리 (기계 추출)

- 파일 135개, `<button>` 268개

## 역할별 건수

| 역할 | 건수 | 파일 수 | 텍스트 크기 | 패딩(px/py) | 라운드 | 굵기 |
|---|---|---|---|---|---|---|
| other | 68 | 32 | `-`×30, `sm`×26, `xs`×12 | `-/-`×33, `3/1.5`×7, `3/-`×7, `3/1`×4 | `-`×34, `rounded-lg`×15, `rounded`×12, `rounded-md`×7 | `bold`×34, `-`×26, `black`×5, `semibold`×3 |
| icon-only | 62 | 28 | `-`×48, `sm`×10, `xs`×2, `lg`×2 | `-/-`×41, `3/-`×9, `2.5/1.5`×3, `2/2`×1 | `-`×20, `rounded-lg`×18, `rounded`×14, `rounded-md`×8 | `-`×50, `bold`×7, `black`×4, `semibold`×1 |
| secondary | 35 | 22 | `sm`×19, `xs`×9, `-`×7 | `-/-`×17, `3/1.5`×6, `4/2`×3, `2.5/1`×2 | `rounded-lg`×24, `rounded-xl`×4, `rounded-full`×3, `-`×3 | `bold`×24, `-`×8, `semibold`×2, `black`×1 |
| primary | 35 | 19 | `sm`×16, `-`×11, `xs`×7, `lg`×1 | `3/1.5`×5, `-/-`×5, `2/1.5`×4, `2/0.5`×4 | `rounded`×10, `rounded-md`×10, `rounded-lg`×8, `rounded-xl`×5 | `bold`×21, `-`×9, `black`×5 |
| link | 23 | 11 | `sm`×19, `-`×3, `xs`×1 | `-/-`×23 | `-`×23 | `bold`×14, `-`×8, `medium`×1 |
| menu-item/row | 18 | 9 | `-`×6, `xs`×6, `sm`×6 | `3/2.5`×13, `3/1`×2, `2.5/1.5`×1, `3/1.5`×1 | `rounded-lg`×14, `-`×3, `rounded`×1 | `bold`×11, `-`×6, `semibold`×1 |
| danger | 7 | 6 | `sm`×5, `-`×2 | `-/-`×2, `-/3`×2, `2/0.5`×1, `2.5/1`×1 | `rounded-md`×2, `rounded-xl`×2, `rounded`×1, `rounded-lg`×1 | `bold`×3, `-`×2, `black`×2 |
| cta-gradient | 6 | 3 | `sm`×3, `base`×2, `xs`×1 | `4/1.5`×2, `5/2.5`×2, `3/1`×1, `4/2.5`×1 | `rounded-lg`×6 | `black`×5, `medium`×1 |
| ghost | 6 | 4 | `sm`×3, `-`×2, `xs`×1 | `-/-`×2, `4/4`×2, `4/2`×1, `3/2`×1 | `rounded-lg`×2, `-`×2, `rounded-md`×1, `rounded`×1 | `-`×2, `bold`×2, `black`×2 |
| warning | 3 | 3 | `-`×1, `lg`×1, `sm`×1 | `-/-`×1, `8/4`×1, `6/2`×1 | `rounded-md`×1, `rounded-2xl`×1, `rounded-xl`×1 | `-`×1, `black`×1, `bold`×1 |
| unstyled | 2 | 2 | `-`×2 | `-/-`×2 | `-`×2 | `-`×2 |
| success | 2 | 2 | `-`×1, `sm`×1 | `-/-`×1, `4/2`×1 | `-`×1, `rounded-lg`×1 | `-`×1, `bold`×1 |
| tab | 1 | 1 | `sm`×1 | `-/-`×1 | `-`×1 | `black`×1 |

## 전체 분포

- **텍스트 크기**: `-`×113, `sm`×110, `xs`×39, `lg`×4, `base`×2
- **라운드**: `-`×91, `rounded-lg`×89, `rounded`×40, `rounded-md`×29, `rounded-xl`×12, `rounded-full`×4, `rounded-2xl`×3
- **굵기**: `bold`×118, `-`×115, `black`×26, `semibold`×7, `medium`×2
- **패딩 px/py**: `-/-`×128, `3/1.5`×20, `3/-`×17, `3/2.5`×13, `4/2`×11, `2.5/1`×10, `2/0.5`×8, `3/1`×7, `4/1.5`×7, `2/1.5`×7
- **아이콘 포함**: 118 · **텍스트 없음(아이콘 전용 후보)**: 75 · **aria-label/title 없는 아이콘 전용**: 58
- **동적 className(삼항/템플릿)**: 60

## 파일별 건수 (상위 25)

| 파일 | 건수 | 역할 분포 |
|---|---|---|
| views/multi/season/MultiNegotiationView.tsx | 16 | `secondary`×10, `other`×2, `icon-only`×2, `link`×1, `primary`×1 |
| components/draft/DraftAdminPanel.tsx | 12 | `other`×7, `icon-only`×3, `secondary`×1, `success`×1 |
| views/multi/season/newsFeedCards.tsx | 12 | `link`×10, `other`×1, `menu-item/row`×1 |
| components/dashboard/DepthRotationBoard.tsx | 11 | `menu-item/row`×4, `primary`×4, `icon-only`×2, `secondary`×1 |
| components/leaderboard/LeaderboardToolbar.tsx | 11 | `icon-only`×5, `other`×5, `link`×1 |
| views/multi/season/MultiFreeAgentView.tsx | 11 | `icon-only`×5, `other`×4, `link`×1, `primary`×1 |
| views/multi/season/MultiFrontOfficeView.tsx | 11 | `other`×4, `ghost`×2, `icon-only`×1, `success`×1, `danger`×1, `secondary`×1 |
| views/PlayerDetailView.tsx | 10 | `icon-only`×4, `other`×3, `link`×2, `secondary`×1 |
| views/multi/season/LeagueLobbyPanel.tsx | 10 | `cta-gradient`×3, `link`×2, `primary`×2, `other`×2, `secondary`×1 |
| views/multi/season/MultiDraftPoolView.tsx | 10 | `icon-only`×5, `other`×4, `link`×1 |
| views/multi/season/MultiScheduleView.tsx | 10 | `primary`×5, `secondary`×2, `icon-only`×1, `danger`×1, `other`×1 |
| views/multi/season/MyTradeBlockModal.tsx | 10 | `primary`×5, `other`×3, `secondary`×1, `menu-item/row`×1 |
| components/dashboard/TacticsBoard.tsx | 9 | `primary`×3, `icon-only`×2, `secondary`×2, `warning`×1, `danger`×1 |
| views/multi/season/GameDateStrip.tsx | 8 | `icon-only`×6, `other`×2 |
| views/multi/season/MultiNewsFeedView.tsx | 8 | `other`×5, `icon-only`×2, `secondary`×1 |
| components/draft/DraftHeader.tsx | 7 | `icon-only`×2, `ghost`×2, `menu-item/row`×2, `primary`×1 |
| components/dashboard/RotationGanttChart.tsx | 6 | `primary`×2, `secondary`×2, `menu-item/row`×1, `icon-only`×1 |
| components/MultiSidebar.tsx | 5 | `menu-item/row`×4, `other`×1 |
| components/dashboard/DepthChartEditor.tsx | 5 | `primary`×2, `menu-item/row`×2, `secondary`×1 |
| views/multi/league/PersonalDraftView.tsx | 5 | `link`×2, `icon-only`×1, `cta-gradient`×1, `unstyled`×1 |
| views/multi/season/MultiReleaseView.tsx | 5 | `danger`×2, `other`×1, `link`×1, `secondary`×1 |
| components/multi/TeamSelectModal.tsx | 4 | `other`×1, `icon-only`×1, `secondary`×1, `primary`×1 |
| views/RosterView.tsx | 4 | `icon-only`×4 |
| views/multi/season/MultiAllStarView.tsx | 4 | `other`×3, `icon-only`×1 |
| components/MultiHeader.tsx | 3 | `cta-gradient`×2, `danger`×1 |

## 역할별 대표 클래스 (각 역할 상위 5 조합)

### other (68)

- ×5 `absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white`
- ×3 `flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold transition-colors > 0 ? : }`
- ×3 `h-[36px] px-3 flex items-center text-sm font-bold text-indigo-400 transition-colors whitespace-nowrap`
- ×3 `hover:text-white transition-colors`
- ×3 `text-slate-500 hover:text-white transition-colors`

### icon-only (62)

- ×6 `p-1.5 text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed`
- ×4 `p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors`
- ×3 `w-full justify-center`
- ×3 `h-[36px] px-3 flex items-center gap-1.5 text-sm font-bold text-white transition-colors whitespace-nowrap`
- ×3 `h-full px-3 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-lg`

### secondary (35)

- ×10 `flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white`
- ×3 `flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold shadow-sm active`
- ×2 `w-full px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 k`
- ×1 `p-2 ml-4 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors`
- ×1 `absolute top-6 right-6 p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors z-50`

### primary (35)

- ×4 `flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors`
- ×3 `px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all ? : }`
- ×2 `flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold active:scale-95 border-r border-i`
- ×2 `flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-sm font-bold active:scale-95 border-r border-i`
- ×2 `p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0`

### link (23)

- ×10 `flex items-center gap-1 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer`
- ×3 `text-sm font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2`
- ×3 `text-indigo-400 text-sm hover:underline`
- ×2 `text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors`
- ×1 `mt-2 text-xs font-bold text-indigo-300 hover:text-indigo-200 hover:underline`

### menu-item/row (18)

- ×4 `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 transition-all text-left`
- ×3 `w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5`
- ×2 `w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all`
- ×2 `w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all flex items-center gap-2`
- ×1 `w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between group item.active ? : }`

### danger (7)

- ×1 `flex items-center gap-1 px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold transition-all active:scale-95 shrink-0`
- ×1 `p-1.5 hover:bg-red-600 hover:text-white text-slate-400 rounded-md transition-colors`
- ×1 `px-2.5 py-1 rounded-md text-sm font-bold bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not`
- ×1 `flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30 disabled:opac`
- ×1 `w-full py-3 rounded-xl font-black tracking-wide text-sm transition-all bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed`

### cta-gradient (6)

- ×2 `flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-base font-black t`
- ×1 `flex items-center gap-1 px-3 py-1 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-xs font-black text-wh`
- ×1 `flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-sm font-black tex`
- ×1 `px-4 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-sm font-medium text-white transition-all ac`
- ×1 `w-full flex items-center justify-center gap-2 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 px-4 py-2.5 rounded-lg te`

### ghost (6)

- ×2 `w-full flex items-center justify-between px-4 py-4 text-sm font-black text-white ko-normal hover:bg-white/[0.03] transition-colors`
- ×1 `p-1 -mr-1 -mt-1 rounded-md text-current/60 hover:text-current hover:bg-white/10 transition-colors shrink-0`
- ×1 `px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white font-bold transition-colors border border-white/10`
- ×1 `px-3 py-2 rounded-l-lg bg-white/10 hover:bg-white/20 text-xs text-white font-bold flex items-center gap-1.5 transition-colors border border-white/10 border-r-0`
- ×1 `p-1.5 hover:bg-white/10 rounded-lg transition-colors`

### warning (3)

- ×1 `p-1.5 hover:bg-amber-600 hover:text-white text-slate-400 rounded-md transition-colors`
- ×1 `px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 flex items-center gap-3`
- ×1 `px-6 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-bold text-white transition-colors`

### unstyled (2)

- ×2 ``

### success (2)

- ×1 `bg-emerald-700/60 hover:bg-emerald-600/60 text-emerald-200 w-full justify-center`
- ×1 `flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 d`

### tab (1)

- ×1 `flex items-center transition-all h-full border-b-2 font-black tracking-tight text-sm ko-normal theme ? isActive : }`

