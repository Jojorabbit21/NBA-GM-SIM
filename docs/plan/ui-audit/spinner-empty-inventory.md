# Spinner / EmptyState 치환 인벤토리 (2026-10-13 기계 추출)

## A. Loader2 사용처 (직전 2줄 포함)
```
views/multi/league/PersonalDraftView.tsx-115-        return (
views/multi/league/PersonalDraftView.tsx-116-            <div className="flex items-center justify-center h-screen bg-slate-950">
views/multi/league/PersonalDraftView.tsx:117:                <Loader2 size={24} className="animate-spin text-indigo-400" />
--
views/multi/league/PersonalDraftView.tsx-251-                        {isLoading ? (
views/multi/league/PersonalDraftView.tsx-252-                            <div className="h-full flex items-center justify-center">
views/multi/league/PersonalDraftView.tsx:253:                                <Loader2 size={24} className="animate-spin text-indigo-400" />
views/multi/league/AdminSimView.tsx-220-        return (
views/multi/league/AdminSimView.tsx-221-            <div className="flex items-center justify-center min-h-screen">
views/multi/league/AdminSimView.tsx:222:                <Loader2 size={24} className="animate-spin text-indigo-400" />
--
views/multi/league/AdminSimView.tsx-273-                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-x
views/multi/league/AdminSimView.tsx-274-                    >
views/multi/league/AdminSimView.tsx:275:                        {running ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
--
views/multi/league/AdminSimView.tsx-281-                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl 
views/multi/league/AdminSimView.tsx-282-                    >
views/multi/league/AdminSimView.tsx:283:                        {running ? <Loader2 size={13} className="animate-spin" /> : <FastForward size={13} />}
--
views/multi/league/AdminSimView.tsx-336-                {schedLoading ? (
views/multi/league/AdminSimView.tsx-337-                    <div className="flex items-center justify-center py-16">
views/multi/league/AdminSimView.tsx:338:                        <Loader2 size={20} className="animate-spin text-indigo-400" />
--
views/multi/league/AdminSimView.tsx-441-                            className="flex items-center justify-center w-6 h-6 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/40 disabled:
views/multi/league/AdminSimView.tsx-442-                        >
views/multi/league/AdminSimView.tsx:443:                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
views/multi/league/settings/AdminTradeBlock.tsx-75-                    ))}
views/multi/league/settings/AdminTradeBlock.tsx-76-                </select>
views/multi/league/settings/AdminTradeBlock.tsx:77:                {loading && <Loader2 size={14} className="animate-spin text-slate-500" />}
views/multi/league/MultiDraftView.tsx-310-        return (
views/multi/league/MultiDraftView.tsx-311-            <div className="flex items-center justify-center min-h-screen">
views/multi/league/MultiDraftView.tsx:312:                <Loader2 size={24} className="animate-spin text-indigo-400" />
views/multi/league/settings/ActionLogTab.tsx-186-                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-xs fon
views/multi/league/settings/ActionLogTab.tsx-187-                >
views/multi/league/settings/ActionLogTab.tsx:188:                    {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}새로고침
views/multi/league/settings/TeamTacticsTab.tsx-301-                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-xs f
views/multi/league/settings/TeamTacticsTab.tsx-302-                        >
views/multi/league/settings/TeamTacticsTab.tsx:303:                            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}새로고침
--
views/multi/league/settings/TeamTacticsTab.tsx-322-                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cur
views/multi/league/settings/TeamTacticsTab.tsx-323-                            >
views/multi/league/settings/TeamTacticsTab.tsx:324:                                {saving ? <><Loader2 size={12} className="animate-spin" />저장 중…</> : savedFlash ? <><Check size={12} />저장
--
views/multi/league/settings/TeamTacticsTab.tsx-381-                        </div>
views/multi/league/settings/TeamTacticsTab.tsx-382-                    ) : (
views/multi/league/settings/TeamTacticsTab.tsx:383:                        <div className="py-12 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
views/multi/league/settings/PersonalDraftSettingsTab.tsx-178-                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cur
views/multi/league/settings/PersonalDraftSettingsTab.tsx-179-                    >
views/multi/league/settings/PersonalDraftSettingsTab.tsx:180:                        {saving ? <><Loader2 size={12} className="animate-spin" />저장 중…</> : saveOk ? '저장됨 ✓' : <><Save siz
views/multi/league/settings/ScheduleSettingsTab.tsx-601-                            <button onClick={handleSaveSettingsOnly} disabled={!hasTimeline || !settingsDirty || savingSettings}
views/multi/league/settings/ScheduleSettingsTab.tsx-602-                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cu
views/multi/league/settings/ScheduleSettingsTab.tsx:603:                                {savingSettings ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}설정만 저장
--
views/multi/league/settings/ScheduleSettingsTab.tsx-609-                            <button onClick={handleApply} disabled={!hasTimeline || applying || loading}
views/multi/league/settings/ScheduleSettingsTab.tsx-610-                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:
views/multi/league/settings/ScheduleSettingsTab.tsx:611:                                {applying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}설정 저장 + 남은 날�
--
views/multi/league/settings/ScheduleSettingsTab.tsx-696-                                <button onClick={handleJump} disabled={!jumpPlanOk || jumping || processingSince != null}
views/multi/league/settings/ScheduleSettingsTab.tsx-697-                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disable
views/multi/league/settings/ScheduleSettingsTab.tsx:698:                                    {jumping ? <Loader2 size={12} className="animate-spin" /> : <FastForward size={12} />}강제 진행 실행
views/multi/league/settings/ScheduleSettingsTab.tsx-699-                                </button>
views/multi/league/settings/ScheduleSettingsTab.tsx-700-                                {processingSince != null && (
views/multi/league/settings/ScheduleSettingsTab.tsx:701:                                    <span className="flex items-center gap-1.5 text-xs text-amber-300 ko-normal"><Loader2 size={12} className="a
--
views/multi/league/settings/ScheduleSettingsTab.tsx-764-
views/multi/league/settings/ScheduleSettingsTab.tsx-765-                {loading && !schedule.length ? (
views/multi/league/settings/ScheduleSettingsTab.tsx:766:                    <div className="flex items-center justify-center py-16 text-slate-500 text-sm"><Loader2 size={16} className="animate-spin mr
--
views/multi/league/settings/ScheduleSettingsTab.tsx-877-                            className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none focu
views/multi/league/settings/ScheduleSettingsTab.tsx-878-                        <button onClick={save} disabled={saving || !draft} className="w-5 h-5 flex items-center justify-center rounded bg-emeral
views/multi/league/settings/ScheduleSettingsTab.tsx:879:                            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
views/multi/league/LeagueSettingsView.tsx-679-        return (
views/multi/league/LeagueSettingsView.tsx-680-            <div className="flex items-center justify-center min-h-screen">
views/multi/league/LeagueSettingsView.tsx:681:                <Loader2 size={24} className="animate-spin text-indigo-400" />
--
views/multi/league/LeagueSettingsView.tsx-926-                                                >
views/multi/league/LeagueSettingsView.tsx-927-                                                    {savingTeamNameId === t.id
views/multi/league/LeagueSettingsView.tsx:928:                                                        ? <Loader2 size={10} className="animate-spin" />
--
views/multi/league/LeagueSettingsView.tsx-983-                                                >
views/multi/league/LeagueSettingsView.tsx-984-                                                    {isKickingThis
views/multi/league/LeagueSettingsView.tsx:985:                                                        ? <Loader2 size={11} className="animate-spin" />
--
views/multi/league/LeagueSettingsView.tsx-1018-                        >
views/multi/league/LeagueSettingsView.tsx-1019-                            {activeSaveInfo.saving
views/multi/league/LeagueSettingsView.tsx:1020:                                ? <><Loader2 size={12} className="animate-spin" />저장 중…</>
--
views/multi/league/LeagueSettingsView.tsx-1173-                                            >
views/multi/league/LeagueSettingsView.tsx-1174-                                                {resetting
views/multi/league/LeagueSettingsView.tsx:1175:                                                    ? <><Loader2 size={13} className="animate-spin" />초기화 중…</>
--
views/multi/league/LeagueSettingsView.tsx-1276-                                        >
views/multi/league/LeagueSettingsView.tsx-1277-                                            {deleting
views/multi/league/LeagueSettingsView.tsx:1278:                                                ? <><Loader2 size={13} className="animate-spin" />삭제 중…</>
--
views/multi/league/LeagueSettingsView.tsx-2209-                                >
views/multi/league/LeagueSettingsView.tsx-2210-                                    {draftStarting
views/multi/league/LeagueSettingsView.tsx:2211:                                        ? <><Loader2 size={13} className="animate-spin" />시작 중…</>
--
views/multi/league/LeagueSettingsView.tsx-2229-                        >
views/multi/league/LeagueSettingsView.tsx-2230-                            {lotteryRunning
views/multi/league/LeagueSettingsView.tsx:2231:                                ? <><Loader2 size={13} className="animate-spin" />추첨 중…</>
views/multi/season/MultiScheduleView.tsx-713-        return (
views/multi/season/MultiScheduleView.tsx-714-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiScheduleView.tsx:715:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiNewsFeedView.tsx-498-                    {isLoading ? (
views/multi/season/MultiNewsFeedView.tsx-499-                        <div className="flex items-center justify-center py-16">
views/multi/season/MultiNewsFeedView.tsx:500:                            <Loader2 size={22} className="animate-spin text-indigo-400" />
views/multi/season/MultiDraftPoolView.tsx-98-        return (
views/multi/season/MultiDraftPoolView.tsx-99-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiDraftPoolView.tsx:100:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiFrontOfficeView.tsx-1038-        return (
views/multi/season/MultiFrontOfficeView.tsx-1039-            <div className="flex items-center justify-center min-h-[50vh]">
views/multi/season/MultiFrontOfficeView.tsx:1040:                <Loader2 className="animate-spin text-slate-500" size={24} />
--
views/multi/season/MultiFrontOfficeView.tsx-1531-                {initialLoading ? (
views/multi/season/MultiFrontOfficeView.tsx-1532-                    <div className="flex items-center justify-center py-16">
views/multi/season/MultiFrontOfficeView.tsx:1533:                        <Loader2 className="animate-spin text-slate-500" size={22} />
views/multi/season/MultiFreeAgentView.tsx-272-        return (
views/multi/season/MultiFreeAgentView.tsx-273-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiFreeAgentView.tsx:274:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiLeaderboardView.tsx-128-        return (
views/multi/season/MultiLeaderboardView.tsx-129-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiLeaderboardView.tsx:130:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiSeasonLayout.tsx-64-        return (
views/multi/season/MultiSeasonLayout.tsx-65-            <div className="flex items-center justify-center h-full min-h-screen bg-gray-950">
views/multi/season/MultiSeasonLayout.tsx:66:                <Loader2 size={32} className="animate-spin text-indigo-400" />
views/multi/season/newsFeedCards.tsx-488-            {isBoxLoading ? (
views/multi/season/newsFeedCards.tsx-489-                <div className="flex items-center justify-center py-8">
views/multi/season/newsFeedCards.tsx:490:                    <Loader2 size={20} className="animate-spin text-indigo-400" />
--
views/multi/season/newsFeedCards.tsx-570-            {isBoxLoading ? (
views/multi/season/newsFeedCards.tsx-571-                <div className="flex items-center justify-center py-8">
views/multi/season/newsFeedCards.tsx:572:                    <Loader2 size={20} className="animate-spin text-indigo-400" />
--
views/multi/season/newsFeedCards.tsx-2920-            {isBoxLoading ? (
views/multi/season/newsFeedCards.tsx-2921-                <div className="flex items-center justify-center py-8">
views/multi/season/newsFeedCards.tsx:2922:                    <Loader2 size={20} className="animate-spin text-indigo-400" />
views/multi/season/MultiNegotiationView.tsx-924-        return (
views/multi/season/MultiNegotiationView.tsx-925-            <div className="flex items-center justify-center h-full min-h-screen">
views/multi/season/MultiNegotiationView.tsx:926:                <Loader2 size={28} className="animate-spin text-indigo-400" />
--
views/multi/season/MultiNegotiationView.tsx-960-            ) : !demand ? (
views/multi/season/MultiNegotiationView.tsx-961-                <div className="flex-1 flex items-center justify-center">
views/multi/season/MultiNegotiationView.tsx:962:                    <Loader2 size={24} className="animate-spin text-indigo-400" />
views/multi/season/MultiStandingsView.tsx-812-        return (
views/multi/season/MultiStandingsView.tsx-813-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiStandingsView.tsx:814:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiReleaseView.tsx-337-        return (
views/multi/season/MultiReleaseView.tsx-338-            <div className="flex items-center justify-center h-full min-h-screen">
views/multi/season/MultiReleaseView.tsx:339:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiPlayoffsView.tsx-19-        return (
views/multi/season/MultiPlayoffsView.tsx-20-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiPlayoffsView.tsx:21:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/LeagueLobbyPanel.tsx-249-        return (
views/multi/season/LeagueLobbyPanel.tsx-250-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/LeagueLobbyPanel.tsx:251:                <Loader2 size={24} className="animate-spin text-indigo-400" />
--
views/multi/season/LeagueLobbyPanel.tsx-400-                                                {isClaiming && (
views/multi/season/LeagueLobbyPanel.tsx-401-                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded">
views/multi/season/LeagueLobbyPanel.tsx:402:                                                        <Loader2 size={12} className="animate-spin text-white" />
--
views/multi/season/LeagueLobbyPanel.tsx-426-                                                >
views/multi/season/LeagueLobbyPanel.tsx-427-                                                    {claiming === team.id
views/multi/season/LeagueLobbyPanel.tsx:428:                                                        ? <Loader2 size={11} className="animate-spin" />
--
views/multi/season/LeagueLobbyPanel.tsx-457-                                                >
views/multi/season/LeagueLobbyPanel.tsx-458-                                                    {kickingId === team.user_id
views/multi/season/LeagueLobbyPanel.tsx:459:                                                        ? <Loader2 size={11} className="animate-spin" />
--
views/multi/season/LeagueLobbyPanel.tsx-530-                                })() : (
views/multi/season/LeagueLobbyPanel.tsx-531-                                    <div className="flex items-center justify-center py-4">
views/multi/season/LeagueLobbyPanel.tsx:532:                                        <Loader2 size={16} className="animate-spin text-slate-500" />
views/multi/season/MultiRosterView.tsx-277-        return (
views/multi/season/MultiRosterView.tsx-278-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiRosterView.tsx:279:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiPlayerDetailView.tsx-292-        return (
views/multi/season/MultiPlayerDetailView.tsx-293-            <div className="flex items-center justify-center min-h-screen">
views/multi/season/MultiPlayerDetailView.tsx:294:                <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiGamePbpView.tsx-2026-            <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
views/multi/season/MultiGamePbpView.tsx-2027-                <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950">
views/multi/season/MultiGamePbpView.tsx:2028:                    <Loader2 size={28} className="animate-spin text-indigo-400" />
views/multi/season/MultiGamePbpView.legacy.tsx-783-        return (
views/multi/season/MultiGamePbpView.legacy.tsx-784-            <div className="flex items-center justify-center h-full bg-slate-950">
views/multi/season/MultiGamePbpView.legacy.tsx:785:                <Loader2 size={28} className="animate-spin text-indigo-400" />
components/multi/DraftPoolModal.tsx-176-                    {loading ? (
components/multi/DraftPoolModal.tsx-177-                        <div className="flex items-center justify-center py-16">
components/multi/DraftPoolModal.tsx:178:                            <Loader2 size={20} className="animate-spin text-indigo-400" />
components/multi/LeagueLoadingScreen.tsx-21-        <div className="flex flex-col items-center justify-center gap-3 h-full min-h-screen bg-gray-950">
components/multi/LeagueLoadingScreen.tsx-22-            <img src="/logos/main.svg" alt={APP_NAME} className="h-9 w-auto mb-3 select-none" draggable={false} />
components/multi/LeagueLoadingScreen.tsx:23:            <Loader2 size={32} className="animate-spin text-indigo-400" />
views/multi/season/MultiTacticsView.tsx-505-        return (
views/multi/season/MultiTacticsView.tsx-506-            <div className="flex items-center justify-center min-h-screen bg-slate-950">
views/multi/season/MultiTacticsView.tsx:507:                <Loader2 size={28} className="animate-spin text-indigo-400" />
--
views/multi/season/MultiTacticsView.tsx-535-                        >
views/multi/season/MultiTacticsView.tsx-536-                            {saving
views/multi/season/MultiTacticsView.tsx:537:                                ? <><Loader2 size={13} className="animate-spin" />저장 중…</>
--
views/multi/season/MultiTacticsView.tsx-576-                        {offenseRows.length === 0 ? (
views/multi/season/MultiTacticsView.tsx-577-                            <div className="flex items-center justify-center py-10">
views/multi/season/MultiTacticsView.tsx:578:                                <Loader2 size={20} className="animate-spin text-indigo-400" />
--
views/multi/season/MultiTacticsView.tsx-583-                                    {leagueTeamsLoading || !myTeamWithFullStats ? (
views/multi/season/MultiTacticsView.tsx-584-                                        <div className="flex items-center justify-center py-20">
views/multi/season/MultiTacticsView.tsx:585:                                            <Loader2 size={24} className="animate-spin text-indigo-400" />
views/multi/season/MultiAllStarView.tsx-406-                    sideEventsLoading ? (
views/multi/season/MultiAllStarView.tsx-407-                        <div className="flex-1 flex items-center justify-center">
views/multi/season/MultiAllStarView.tsx:408:                            <Loader2 size={28} className="animate-spin text-indigo-400" />
--
views/multi/season/MultiAllStarView.tsx-449-                    sideEventsLoading ? (
views/multi/season/MultiAllStarView.tsx-450-                        <div className="flex-1 flex items-center justify-center">
views/multi/season/MultiAllStarView.tsx:451:                            <Loader2 size={28} className="animate-spin text-indigo-400" />
--
views/multi/season/MultiAllStarView.tsx-483-                ) : isLoading ? (
views/multi/season/MultiAllStarView.tsx-484-                    <div className="flex-1 flex items-center justify-center">
views/multi/season/MultiAllStarView.tsx:485:                        <Loader2 size={28} className="animate-spin text-indigo-400" />
components/multi/PersonalDraftFormatEditor.tsx-317-                    </button>
components/multi/PersonalDraftFormatEditor.tsx-318-                    <button type="button" onClick={runCheck} disabled={disabled || checking || !!syncError} className={`${SMALL_BTN} bg-slate-800 tex
components/multi/PersonalDraftFormatEditor.tsx:319:                        {checking ? <Loader2 size={11} className="animate-spin" /> : null}
views/multi/season/PlayerNewsTab.tsx-67-        return (
views/multi/season/PlayerNewsTab.tsx-68-            <div className="flex items-center justify-center py-16">
views/multi/season/PlayerNewsTab.tsx:69:                <Loader2 size={22} className="animate-spin text-indigo-400" />
components/multi/CreateLeagueModal.tsx-1193-                            {saving
components/multi/CreateLeagueModal.tsx-1194-                                ? <span className="flex items-center justify-center gap-1.5">
components/multi/CreateLeagueModal.tsx:1195:                                    <Loader2 size={13} className="animate-spin" />생성 중…
components/multi/TournamentChampionModal.tsx-305-                        {statsLoading ? (
components/multi/TournamentChampionModal.tsx-306-                            <div className="flex items-center justify-center py-10">
components/multi/TournamentChampionModal.tsx:307:                                <Loader2 size={20} className="animate-spin text-indigo-400" />
components/multi/TeamSelectModal.tsx-102-                    {loadingTeams ? (
components/multi/TeamSelectModal.tsx-103-                        <div className="flex items-center justify-center py-10">
components/multi/TeamSelectModal.tsx:104:                            <Loader2 size={20} className="animate-spin text-indigo-400" />
components/roster/TeamGameLog.tsx-254-                <TableCell className="text-center align-middle text-sm">
components/roster/TeamGameLog.tsx-255-                    {isFetching ? (
components/roster/TeamGameLog.tsx:256:                        <Loader2 size={14} className="animate-spin text-indigo-400 mx-auto" />
components/roster/TeamScheduleCalendar.tsx-196-                                        <TableCell className="text-center align-middle text-sm">
components/roster/TeamScheduleCalendar.tsx-197-                                            {isFetching ? (
components/roster/TeamScheduleCalendar.tsx:198:                                                <Loader2 size={14} className="animate-spin text-indigo-400 mx-auto" />
pages/MultiSeasonPage.tsx-370-            {isLoading ? (
pages/MultiSeasonPage.tsx-371-                <div className="flex items-center justify-center py-8">
pages/MultiSeasonPage.tsx:372:                    <Loader2 size={20} className="animate-spin text-indigo-400" />
--
pages/MultiSeasonPage.tsx-676-            {isLoading ? (
pages/MultiSeasonPage.tsx-677-                <div className="flex items-center justify-center py-8">
pages/MultiSeasonPage.tsx:678:                    <Loader2 size={20} className="animate-spin text-indigo-400" />
```

## B. 빈 상태 문구 (직전 2줄 포함)
```
views/multi/league/settings/ActionLogTab.tsx-229-                    <tbody>
views/multi/league/settings/ActionLogTab.tsx-230-                        {rows.length === 0 && !loading && (
views/multi/league/settings/ActionLogTab.tsx:231:                            <tr><td colSpan={7} className="py-8 text-center text-slate-500 ko-normal">기록이 없습니다.</td></tr>
views/multi/season/PostseasonBracket.tsx-28-                <div className="text-center">
views/multi/season/PostseasonBracket.tsx-29-                    <h2 className="text-lg font-black text-slate-300 ko-tight">플레이오프 브라켓</h2>
views/multi/season/PostseasonBracket.tsx:30:                    <p className="text-sm text-slate-500 ko-normal mt-1">브라켓 데이터가 아직 없습니다.</p>
views/multi/league/settings/TeamTacticsTab.tsx-360-                        <Button variant="secondary" size="sm" onClick={() => setTick(t => t + 1)}>다시 불러오기</Button>
views/multi/league/settings/TeamTacticsTab.tsx-361-                    </div>
views/multi/league/settings/TeamTacticsTab.tsx:362:                ) : members.length === 0 && !loading && <span className="text-xs text-slate-500 ko-normal">참가자가 없습니다.</span>}
views/multi/season/MultiScheduleView.tsx-796-                        </div>
views/multi/season/MultiScheduleView.tsx-797-                    ) : (
views/multi/season/MultiScheduleView.tsx:798:                        <p className="text-sm text-slate-500 ko-normal py-12 text-center">이 날짜엔 예정된 경기가 없습니다.</p>
views/multi/league/settings/ScheduleSettingsTab.tsx-628-                            </p>
views/multi/league/settings/ScheduleSettingsTab.tsx-629-                        )}
views/multi/league/settings/ScheduleSettingsTab.tsx:630:                        {previewOn && !plan && <p className="text-xs text-slate-500 ko-normal">재배치할 남은 가상 날짜가 없습니다
--
views/multi/league/settings/ScheduleSettingsTab.tsx-766-                    <div className="flex items-center justify-center py-16 text-slate-500 text-sm"><Loader2 size={16} className="animate-spin mr
views/multi/league/settings/ScheduleSettingsTab.tsx-767-                ) : realDays.length === 0 ? (
views/multi/league/settings/ScheduleSettingsTab.tsx:768:                    <div className="py-16 text-center text-slate-500 text-sm ko-normal">표시할 일정이 없습니다.</div>
views/multi/season/MultiNewsFeedView.tsx-551-                        />
views/multi/season/MultiNewsFeedView.tsx-552-                    ) : (
views/multi/season/MultiNewsFeedView.tsx:553:                        <div className="h-full flex items-center justify-center text-slate-600 text-sm ko-normal">선택된 소식이 없습니다.</div>
components/multi/TeamSettingsPanel.tsx-86-
components/multi/TeamSettingsPanel.tsx-87-    if (!myTeam) {
components/multi/TeamSettingsPanel.tsx:88:        return <p className="text-sm text-slate-400 ko-normal px-6 py-6">아직 선점한 팀이 없습니다. 로비에서 먼저 팀을 선택해주세요.<
--
components/multi/TeamSettingsPanel.tsx-148-        <div className="max-w-4xl mx-auto px-6 py-6">
components/multi/TeamSettingsPanel.tsx-149-            {!canEditIdentity && (
components/multi/TeamSettingsPanel.tsx:150:                <InlineNotice tone="info" className="mb-4">드래프트가 진행되는 동안에는 팀 설정을 변경할 수 없습니다.</InlineNotice>
components/roster/TacticsHistory.tsx-105-        <ClipboardList size={48} className="mb-4 opacity-20" />
components/roster/TacticsHistory.tsx-106-        <p className="text-lg font-black">No Tactical Data</p>
components/roster/TacticsHistory.tsx:107:        <p className="text-xs font-bold mt-2">아직 기록된 전술 데이터가 없습니다.</p>
views/multi/season/MultiReleaseView.tsx-355-            <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-200">
views/multi/season/MultiReleaseView.tsx-356-                <ShieldAlert size={28} className="text-slate-600" />
views/multi/season/MultiReleaseView.tsx:357:                <p className="text-sm text-slate-500">로스터에서 선수를 찾을 수 없습니다.</p>
views/multi/season/PlayerNewsTab.tsx-73-
views/multi/season/PlayerNewsTab.tsx-74-    if (stories.length === 0) {
views/multi/season/PlayerNewsTab.tsx:75:        return <div className="flex items-center justify-center h-40 text-slate-500 text-sm ko-normal">이 선수와 관련된 뉴스가 없습니다</div>;
views/multi/league/LeagueSettingsView.tsx-686-        return (
views/multi/league/LeagueSettingsView.tsx-687-            <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-6">
views/multi/league/LeagueSettingsView.tsx:688:                <InlineNotice tone="danger" className="max-w-md">{error ?? '리그를 찾을 수 없습니다.'}</InlineNotice>
--
views/multi/league/LeagueSettingsView.tsx-1035-            {/* ── 세션 진행 중 안내 — 실제로 잠기는 리그/드래프트 탭에서만(trade·cap·roster·engine·schedule은 진행 �
views/multi/league/LeagueSettingsView.tsx-1036-            {isInProgress && (activeTab === 'league' || activeTab === 'draft') && (
views/multi/league/LeagueSettingsView.tsx:1037:                <InlineNotice tone="info">세션이 진행 중입니다. 리그 기본 설정과 드래프트 설정은 변경할 수 없습니다.</Inli
--
views/multi/league/LeagueSettingsView.tsx-1601-                <div className="rounded-xl bg-slate-900/40 border border-slate-700/40 p-3">
views/multi/league/LeagueSettingsView.tsx-1602-                    {!contractSettingsEditable && (
views/multi/league/LeagueSettingsView.tsx:1603:                        <InlineNotice tone="info" className="mb-2">드래프트가 시작된 뒤에는 계약 생성 규칙을 바꿀 수 없습니다(�
--
views/multi/league/LeagueSettingsView.tsx-2252-
views/multi/league/LeagueSettingsView.tsx-2253-                    {draftPicks.length === 0 ? (
views/multi/league/LeagueSettingsView.tsx:2254:                        <p className="text-xs text-slate-500 ko-normal">아직 드래프트 결과가 없습니다.</p>
components/roster/TeamGameLog.tsx-287-        return (
components/roster/TeamGameLog.tsx-288-            <div className="h-full flex items-center justify-center">
components/roster/TeamGameLog.tsx:289:                <span className="text-slate-500 font-bold text-sm">경기 기록이 없습니다.</span>
views/multi/season/MultiFrontOfficeView.tsx-1650-                            <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 제안을 보낼 수 있습니다.
views/multi/season/MultiFrontOfficeView.tsx-1651-                        ) : humanTargetTeams.length === 0 ? (
views/multi/season/MultiFrontOfficeView.tsx:1652:                            <p className="text-sm text-slate-500 ko-normal py-8 text-center">제안을 보낼 수 있는 상대(사람이 운영하는 
--
views/multi/season/MultiFrontOfficeView.tsx-1983-                                </div>
views/multi/season/MultiFrontOfficeView.tsx-1984-                                {!isAdmin && !myTeamRow ? (
views/multi/season/MultiFrontOfficeView.tsx:1985:                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center px-4">소속 팀이 없습니다.</p>
--
views/multi/season/MultiFrontOfficeView.tsx-1994-                            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10">
views/multi/season/MultiFrontOfficeView.tsx-1995-                                {selectedOffer ? renderOfferLetter(selectedOffer, getOfferOpts(selectedOffer)) : (
views/multi/season/MultiFrontOfficeView.tsx:1996:                                    <div className="h-full flex items-center justify-center text-slate-600 text-sm ko-normal">선택된 제안이 없�
components/multi/TournamentChampionModal.tsx-308-                            </div>
components/multi/TournamentChampionModal.tsx-309-                        ) : roster.length === 0 ? (
components/multi/TournamentChampionModal.tsx:310:                            <p className="text-center text-sm text-slate-500 ko-normal py-10">스탯 데이터가 없습니다.</p>
components/draft/MyRoster.tsx-120-                                </>
components/draft/MyRoster.tsx-121-                            ) : (
components/draft/MyRoster.tsx:122:                                <span className="text-sm text-slate-700 italic">비어있음</span>
--
components/draft/MyRoster.tsx-149-                                <>
components/draft/MyRoster.tsx-150-                                    <span className="text-sm font-bold w-8 shrink-0 text-slate-700">—</span>
components/draft/MyRoster.tsx:151:                                    <span className="text-sm text-slate-700 italic">비어있음</span>
views/multi/season/LeagueLobbyPanel.tsx-257-            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
views/multi/season/LeagueLobbyPanel.tsx-258-                <AlertCircle size={24} className="text-red-400" />
views/multi/season/LeagueLobbyPanel.tsx:259:                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 불러올 수 없습니다.'}</p>
components/multi/DraftPoolModal.tsx-180-                    ) : sorted.length === 0 ? (
components/multi/DraftPoolModal.tsx-181-                        <div className="flex items-center justify-center py-16">
components/multi/DraftPoolModal.tsx:182:                            <p className="text-sm text-slate-500 ko-normal">조건에 맞는 선수가 없습니다</p>
components/leaderboard/LeaderboardTable.tsx-177-                </Table>
components/leaderboard/LeaderboardTable.tsx-178-                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
components/leaderboard/LeaderboardTable.tsx:179:                    <span className="text-slate-500 font-bold text-sm">데이터가 없습니다.</span>
components/multi/PersonalDraftFormatEditor.tsx-218-                </div>
components/multi/PersonalDraftFormatEditor.tsx-219-                {collections.length === 0 ? (
components/multi/PersonalDraftFormatEditor.tsx:220:                    <p className="text-[11px] text-slate-600 ko-normal px-3 py-2">컬렉션이 없습니다 — 어드민 "카드 컬렉션" 탭에�
--
components/multi/PersonalDraftFormatEditor.tsx-424-                {!syncError && checkErr && <InlineNotice tone="danger" size="sm">{checkErr}</InlineNotice>}
components/multi/PersonalDraftFormatEditor.tsx-425-                {!syncError && !checkErr && rosterWarn && (
components/multi/PersonalDraftFormatEditor.tsx:426:                    <InlineNotice tone="warning" size="sm">로스터가 {PERSONAL_DRAFT_ROSTER_WARN_BELOW}명 미만이면 로테이션 여유가 거
components/roster/TeamScheduleCalendar.tsx-134-              <div className="w-1/2 min-w-0 overflow-y-auto custom-scrollbar border-r border-slate-800">
components/roster/TeamScheduleCalendar.tsx-135-                {monthGames.length === 0 ? (
components/roster/TeamScheduleCalendar.tsx:136:                    <p className="text-sm text-slate-500 text-center py-12">이 달엔 예정된 경기가 없습니다.</p>
components/multi/CreateLeagueModal.tsx-1021-                                    {!timelineFeasibility.feasible && (
components/multi/CreateLeagueModal.tsx-1022-                                        <InlineNotice tone="danger" className="mt-1">
components/multi/CreateLeagueModal.tsx:1023:                                            <p>이 설정으로는 세션을 구성할 수 없습니다. 아래 중 하나를 적용하세요.</p>
```
