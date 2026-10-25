
import React, { useEffect, useState, useCallback } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { InlineNotice } from '../../../components/common/InlineNotice';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { joinLeague, leaveLeague, claimTeam, updateTeamProfile } from '../../../services/multi/leagueService';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { applyMetaPlayerPoolFilter } from '../../../services/multi/draftPoolQuery';
import { TEAM_DATA } from '../../../data/teamData';
import { VIRTUAL_TEAMS } from '../../../data/virtualTeams';
import { TeamSetupModal } from '../../../components/multi/TeamSetupModal';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';
import { usePersonalDraftStatus } from '../../../hooks/usePersonalDraftStatus';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { Button } from '../../../components/common/Button';
import { KeyValueRow } from '../../../components/common/KeyValueRow';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { getLeagueLogoUrl } from '../../../utils/constants';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';

function fmtDate(iso: string | null): string {
    if (!iso) return '미정';
    return new Date(iso).toLocaleString('ko-KR', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fmtSeconds(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMatchFormat(f: string | null): string {
    switch (f) {
        case 'best_of_3': return 'Bo3';
        case 'best_of_5': return 'Bo5';
        case 'best_of_7': return 'Bo7';
        default:          return 'Bo1';
    }
}

function fmtDraftStrategy(strategy: string | null): string {
    return strategy === 'linear' ? '선형' : '스네이크';
}

// ── LeagueLobbyPanel ─────────────────────────────────────────────────────────
// 리그 홈(/multi/leagues/:leagueId/season) 인덱스 라우트에서, 로터리/드래프트가 아직
// 끝나지 않은 리그일 때 MultiSeasonLayout이 사이드바/헤더 없이 이 패널만 렌더링한다
// (원래 별도 라우트였던 /lobby, LeagueLobbyView.tsx를 대체 — 사용자 요청으로 별도
// 화면을 없애고 리그 홈으로 통합함). isInProgress/isFinished가 되면 MultiSeasonLayout이
// 자동으로 이 패널 대신 정규 시즌 대시보드(MultiSeasonPage)를 렌더링하므로, 이 컴포넌트는
// "아직 진행 전" 상태만 다루면 된다.
// [2026-09-11] 초기 이식 당시 예전 로비 화면(bordered rounded-2xl 카드, 상단 "< 홈으로"
// 버튼) 룩을 그대로 가져왔었는데, 사용자 요청으로 세션 내 디자인 언어로 재작성:
// - 상단 "< 홈으로" 버튼 제거
// - MultiSeasonPage.tsx 홈 탭 최상단과 동일한 마스트헤드(PBL 로고 + 타이틀, 타이틀만
// 리그 이름으로 교체)
// - 이후 섹션들은 세션 내 다른 홈 위젯(HomeStandingsSection 등)과 동일하게
// `<h3 className="text-lg font-black text-white">섹션명</h3>` + flat `bg-slate-900`
// 패널 스타일로 통일(예전의 bg-slate-800/60 border rounded-2xl 카드 룩 폐기)
// - 팀 목록도 다른 세션 화면들과 동일하게 컬러 배지 대신 실제 로고(TeamLogo) 사용

const LeagueLobbyPanel: React.FC = () => {
    const navigate             = useNavigate();
    const { leagueId }         = useParams<{ leagueId: string }>();
    const { session }          = useGame();
    const { league, room, members, leagueTeams, isLoading, error, reload } = useLeagueContext();

    const userId      = session?.user?.id ?? null;
    const isMember    = members.some(m => m.user_id === userId);
    const isAdmin     = !!(league && userId && league.admin_user_id === userId);
    const myTeam      = leagueTeams.find(t => t.user_id === userId) ?? null;
    const isDrafting   = league?.status === 'drafting';
    const isRecruiting = league?.status === 'recruiting';
    const lotteryDone   = leagueTeams.length > 0 && leagueTeams.some(t => t.draft_order !== null);
    // [2026-09-18] 토너먼트 개인 팩 드래프트(leagues.personal_draft_format 존재) — 로터리/공유풀
    // 드래프트 룸 대신 팀 확정 직후 바로 개인 드래프트 화면으로 보낸다.
    const isPersonalDraft = !!league?.personal_draft_format;
    const personalDraftPath = `/multi/leagues/${leagueId}/personal-draft`;
    const personalDraftStatus = usePersonalDraftStatus(room?.id ?? null, myTeam?.id ?? null, isPersonalDraft);
    const myPersonalDraftDone = personalDraftStatus === 'completed';
    // [2026-09-18] 개인 드래프트 참가/드래프트 마감(leagues.draft_deadline_at) — 지나면 신규 참가
    // 차단 + 팀 변경 금지(값 갱신은 아래 useEffect, claim_team RPC도 서버에서 동일하게 거부).
    const [draftDeadlineCountdown, setDraftDeadlineCountdown] = useState<string | null>(null);
    const [draftDeadlinePassed,    setDraftDeadlinePassed]    = useState(false);
    // [2026-10-16] 로터리(순서 추첨) 이후에는 신규 참가·팀 선점 모두 불가 — DB도 같은 규칙을 강제한다(claim_team,
    // room_members 트리거 block_join_after_lottery). 이전엔 모집 중(recruiting)이면 로터리 후에도 버튼이 보였다.
    const canClaim      = isRecruiting && !lotteryDone && !(isPersonalDraft && draftDeadlinePassed);
    const canChangePre  = isRecruiting && !lotteryDone && !(isPersonalDraft && draftDeadlinePassed); // 팀 변경은 로터리 전까지만

    const { draftState, timeRemaining, currentPickEntry, isMyTurn } = useLeagueDraft(
        isDrafting ? (room?.id ?? null) : null,
        session,
    );

    const [leaving,        setLeaving]        = useState(false);
    const [claiming,       setClaiming]       = useState<string | null>(null);
    const [editTarget,     setEditTarget]     = useState<LeagueTeamRow | null>(null);
    const [kickingId,      setKickingId]      = useState<string | null>(null);
    const [actionErr,      setActionErr]      = useState<string | null>(null);
    const [poolCount,      setPoolCount]      = useState<number | null>(null);
    const [lotteryCountdown, setLotteryCountdown] = useState<string | null>(null);

    // 드래프트 풀 선수 수 — DraftPoolSettings.tsx의 fetchStats()와 동일한 조회 규칙(draft_year
    // 범위 + OVR 범위 필터)을 총원 카운트만 필요하므로 축약해서 재사용.
    useEffect(() => {
        if (!league) return;
        let cancelled = false;
        const ovrMin = league.draft_ovr_min ?? 0;
        const ovrMax = league.draft_ovr_max ?? 99;
        const draftYearMin = league.draft_year_min ?? 2001;
        const draftYearMax = league.draft_year_max ?? 2025;
        const retiredFilter = league.draft_retired_filter ?? 'all';
        const useCustomOverrides = shouldUseCustomOverrides(league);

        (async () => {
            let query = supabase.from('meta_players').select('id, base_attributes, ovr_base, ovr_custom');
            query = applyMetaPlayerPoolFilter(query as any, draftYearMin, draftYearMax, retiredFilter);
            const { data } = await query;
            let count = 0;
            for (const raw of (data as any[]) ?? []) {
                const p = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true);
                if (p.ovr >= ovrMin && p.ovr <= ovrMax) count++;
            }
            if (!cancelled) setPoolCount(count);
        })();

        return () => { cancelled = true; };
    }, [league?.draft_ovr_min, league?.draft_ovr_max, league?.draft_year_min, league?.draft_year_max, league?.draft_retired_filter, league?.use_custom_overrides]);

    // 로터리 추첨까지 남은 시간(큰 글씨 카운트다운) — 추첨이 끝나면(lotteryDone) 더 이상
    // 표시할 필요가 없어 정지.
    useEffect(() => {
        const target = league?.lottery_scheduled_at;
        if (!target || lotteryDone) { setLotteryCountdown(null); return; }

        const tick = () => {
            const diff = new Date(target).getTime() - Date.now();
            if (diff <= 0) { setLotteryCountdown('곧 시작'); return; }
            const d  = Math.floor(diff / 86_400_000);
            const h  = Math.floor((diff % 86_400_000) / 3_600_000);
            const m  = Math.floor((diff % 3_600_000)  / 60_000);
            const s  = Math.floor((diff % 60_000)     / 1_000);
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            setLotteryCountdown(d > 0 ? `${d}일 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [league?.lottery_scheduled_at, lotteryDone]);

    // 개인 드래프트 참가/드래프트 마감까지 남은 시간 — 지나면 즉시 canClaim/canChangePre가
    // false로 바뀌어 참가·팀변경 버튼이 사라진다(서버는 claim_team RPC에서 동일하게 거부).
    useEffect(() => {
        const target = isPersonalDraft ? league?.draft_deadline_at : null;
        if (!target) { setDraftDeadlineCountdown(null); setDraftDeadlinePassed(false); return; }

        const tick = () => {
            const diff = new Date(target).getTime() - Date.now();
            if (diff <= 0) { setDraftDeadlineCountdown(null); setDraftDeadlinePassed(true); return; }
            setDraftDeadlinePassed(false);
            const d  = Math.floor(diff / 86_400_000);
            const h  = Math.floor((diff % 86_400_000) / 3_600_000);
            const m  = Math.floor((diff % 3_600_000)  / 60_000);
            const s  = Math.floor((diff % 60_000)     / 1_000);
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            setDraftDeadlineCountdown(d > 0 ? `${d}일 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [isPersonalDraft, league?.draft_deadline_at]);

    // Realtime 구독
    // [2026-08-01 Fix] leagues 테이블 filter는 실제 id(UUID) 컬럼 기준 — URL의 leagueId는
    // short_code일 수 있어 league.id(조회로 이미 확정된 실제 UUID)를 사용해야 함.
    useEffect(() => {
        if (!room?.id || !league?.id) return;
        const ch = supabase
            .channel(`lobby-${room.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },  () => reload())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'league_teams', filter: `room_id=eq.${room.id}` },  () => reload())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues',  filter: `id=eq.${league.id}` },    () => reload())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [room?.id, league?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // 참가 + 팀 선점을 한 번에 처리
    const handleJoinAndClaim = useCallback(async (team: LeagueTeamRow) => {
        if (!league || !room || !userId) return;
        setClaiming(team.id); setActionErr(null);
        const { error: joinErr } = await joinLeague(league.id, userId);
        if (joinErr) { setActionErr(joinErr); setClaiming(null); return; }
        const { error: claimErr } = await claimTeam(room.id, team.id, userId);
        setClaiming(null);
        if (claimErr) { setActionErr(claimErr); return; }
        reload();
        if (isPersonalDraft) navigate(personalDraftPath);
    }, [league, room, userId, reload, isPersonalDraft, personalDraftPath, navigate]);

    const handleLeave = async () => {
        if (!room || !userId) return;
        setLeaving(true); setActionErr(null);
        const { error: err } = await leaveLeague(room.id, userId, league.status);
        setLeaving(false);
        if (err) { setActionErr(err); return; }
        reload();
    };

    const handleKick = async (kickUserId: string) => {
        if (!room) return;
        setKickingId(kickUserId);
        setActionErr(null);
        const { error: err } = await leaveLeague(room.id, kickUserId);
        setKickingId(null);
        // [2026-10-13] 실패 시 reload 생략 — 다른 핸들러(참가/탈퇴/선점)와 동일. 상대가 이미 나간 경우는 Realtime 구독이 목록을 갱신한다.
        if (err) { setActionErr(err); return; }
        reload();
    };

    const handleClaim = useCallback(async (team: LeagueTeamRow) => {
        if (!room || !userId || !isMember) return;
        setClaiming(team.id); setActionErr(null);
        const { error: err } = await claimTeam(room.id, team.id, userId);
        setClaiming(null);
        if (err) { setActionErr(err); return; }
        reload();
        if (isPersonalDraft) navigate(personalDraftPath);
    }, [room, userId, isMember, reload, isPersonalDraft, personalDraftPath, navigate]);

    if (isLoading) {
        return (
            <Spinner variant="page" />
        );
    }
    if (error || !league) {
        return (
            <div className="h-full flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6">
                {/* 로드 실패는 빈 상태가 아니라 실패 — InlineNotice danger(에러 표시 정책 0-7) */}
                <InlineNotice tone="danger" className="max-w-md">{error ?? '리그를 불러올 수 없습니다.'}</InlineNotice>
                <Button variant="link" underline onClick={() => navigate('/')}>홈으로 돌아가기</Button>
            </div>
        );
    }

    const humanCount = members.filter(m => !m.is_ai).length;
    const totalSlots = leagueTeams.length || league.max_teams;
    const sortedTeams = [...leagueTeams].sort((a, b) => {
        if (a.draft_order === null && b.draft_order === null) return 0;
        if (a.draft_order === null) return 1;
        if (b.draft_order === null) return -1;
        return a.draft_order - b.draft_order;
    });

    return (
        <>
            <div className="p-4 space-y-6">

                {/* 마스트헤드 — 세션 홈 탭(MultiSeasonPage.tsx) 최상단과 동일한 PBL 로고 +
                    타이틀 배치, 타이틀만 리그 이름으로 교체. 로터리 완료 후엔 우측에도
                    드래프트 룸 입장 버튼(헤더 우측과 동일 위치·스타일 요청)을 함께 노출. */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <img
                            src={getLeagueLogoUrl('League')}
                            alt="PRO BASKETBALL LEAGUE"
                            className="w-16 h-16 object-contain drop-shadow-md shrink-0"
                        />
                        <span className="text-2xl font-black text-white ko-tight">{league.name}</span>
                    </div>
                    {isPersonalDraft ? (
                        myTeam && league.status === 'recruiting' && (
                            myPersonalDraftDone ? (
                                <span className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm font-bold text-emerald-300 shrink-0">
                                    드래프트 완료 · 토너먼트 시작 대기
                                </span>
                            ) : (
                                <Button variant="cta" size="xl" className="shrink-0" onClick={() => navigate(personalDraftPath)}>
                                    팩 드래프트 입장
                                </Button>
                            )
                        )
                    ) : lotteryDone && (
                        <Button variant="cta" size="xl" className="shrink-0" onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}>
                            드래프트 룸 입장
                        </Button>
                    )}
                </div>

                {/* [2026-10-13] 참가/선점/탈퇴/강퇴 실패 — InlineNotice(에러 표시 정책 0-7). 마감·추첨 뒤 같은 타이밍 안내는 warning */}
                {isRecruiting && lotteryDone && !isMember && !isPersonalDraft && (
                    <InlineNotice tone="warning">드래프트 순서 추첨이 완료되어 더 이상 새로 참가할 수 없습니다.</InlineNotice>
                )}
                {actionErr && (
                    <InlineNotice tone={/마감|추첨 후/.test(actionErr) ? 'warning' : 'danger'}>{actionErr}</InlineNotice>
                )}

                {/* 2단 — 토너먼트 정보/참가 팀은 좌측, 우측은 추후 확장용 */}
                <div className="grid grid-cols-2 gap-6">
                <div className="space-y-6">

                {/* ── 토너먼트 정보 ─────────────────────────────────────────── */}
                <section className="space-y-3">
                    <h3 className="text-lg font-black text-white">토너먼트 정보</h3>

                    <div className="bg-slate-900 px-4 divide-y divide-slate-800/60">
                        <KeyValueRow padding="sm" label="참가팀 수">{`${humanCount} / ${totalSlots}팀`}</KeyValueRow>
                        {league.type === 'tournament' && league.tournament_format && (
                            <KeyValueRow padding="sm" label="대진 방식">
                                {league.tournament_format === 'single_elim' ? 'Single Elimination' : 'Round-Robin'}
                            </KeyValueRow>
                        )}
                        {league.type === 'tournament' && league.match_format && (
                            <KeyValueRow padding="sm" label="경기 방식">
                                {fmtMatchFormat(league.match_format) +
                                    (league.finals_match_format && league.finals_match_format !== league.match_format
                                        ? ` / Final ${fmtMatchFormat(league.finals_match_format)}`
                                        : '')}
                            </KeyValueRow>
                        )}
                        <KeyValueRow padding="sm" label="토너먼트 시작 일시">{fmtDate(league.tournament_start_at)}</KeyValueRow>
                        {isPersonalDraft && (
                            <KeyValueRow padding="sm" label="참가/드래프트 마감 일시">{league.draft_deadline_at ? fmtDate(league.draft_deadline_at) : '마감 없음'}</KeyValueRow>
                        )}
                        <KeyValueRow padding="sm" label="드래프트 순서 추첨 일시">{fmtDate(league.lottery_scheduled_at)}</KeyValueRow>
                        <KeyValueRow padding="sm" label="드래프트 일시">{fmtDate(league.draft_scheduled_at)}</KeyValueRow>
                        <KeyValueRow padding="sm" label="드래프트 형식">{fmtDraftStrategy(league.draft_pool_strategy)}</KeyValueRow>
                        <KeyValueRow padding="sm" label="드래프트 라운드 수">{`${league.draft_total_rounds}라운드`}</KeyValueRow>
                        <KeyValueRow padding="sm" label="드래프트 라운드 당 시간">{`${league.draft_pick_duration_sec}초`}</KeyValueRow>
                        <KeyValueRow padding="sm" label="드래프트 대상">
                            {poolCount === null
                                ? '불러오는 중…'
                                : (
                                    <Button
                                        variant="link"
                                        underline
                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/pool`)}
                                    >
                                        {poolCount}명
                                    </Button>
                                )}
                        </KeyValueRow>
                    </div>

                </section>

                {/* ── 참가 팀 ───────────────────────────────────────────────── */}
                {sortedTeams.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-lg font-black text-white">참가 팀</h3>
                        <div className="bg-slate-900">
                            <div className="flex items-center gap-2 py-1.5 px-3 border-b border-slate-800">
                                <span className="text-sm font-bold text-slate-600 flex-1 min-w-0">팀</span>
                                <span className="text-sm font-bold text-slate-600 w-28 shrink-0">GM</span>
                                <span className="w-44 shrink-0" />
                            </div>
                            {sortedTeams.map(team => {
                                const isMyTeam   = team.user_id === userId;
                                const isHuman    = !team.is_ai && team.user_id !== null;
                                const isEmpty    = team.user_id === null;
                                const isClaiming = claiming === team.id;
                                // 선택 가능: 빈 팀 + 추첨 전 + 참가 중
                                const canSelect  = isEmpty && canClaim && isMember;
                                // 변경 가능: 내 팀이 있고 다른 빈 팀 선택 시
                                const canChange  = isMyTeam && canChangePre;

                                return (
                                    <div
                                        key={team.id}
                                        className={`flex items-center gap-2 py-2 px-3 border-b border-slate-800/60 transition-colors ${
                                            isMyTeam ? 'bg-indigo-500/5' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                            <div className="relative w-7 h-7 shrink-0">
                                                <TeamLogo teamId={team.team_slug} teamName={team.team_abbr} size="custom" className="w-7 h-7 shrink-0" shadow={false} />
                                                {isClaiming && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded">
                                                        <Spinner variant="inline" />
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-sm font-bold text-white truncate">{team.team_name}</span>
                                        </div>

                                        <span className="text-sm font-bold w-28 shrink-0 truncate">
                                            {isMyTeam
                                                ? <span className="text-indigo-400">{team.nickname ?? '—'}</span>
                                                : isHuman
                                                ? <span className="text-white">{team.nickname ?? '—'}</span>
                                                : <span className="text-slate-500">없음</span>
                                            }
                                        </span>

                                        <div className="w-44 shrink-0 flex items-center justify-end gap-1.5">
                                            {/* 참가 (비회원 + 빈 팀) */}
                                            {isEmpty && canClaim && !isMember && (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleJoinAndClaim(team)}
                                                    disabled={!!claiming}
                                                    isLoading={claiming === team.id}
                                                >
                                                    참가
                                                </Button>
                                            )}
                                            {/* 편집 + 탈퇴 (내 팀, 추첨 전) */}
                                            {canChange && (
                                                <>
                                                    <Button variant="secondary" size="sm" onClick={() => setEditTarget(team)}>
                                                        편집
                                                    </Button>
                                                    <Button variant="dangerSoft" size="sm" onClick={handleLeave} disabled={leaving}>
                                                        탈퇴
                                                    </Button>
                                                </>
                                            )}
                                            {/* 선택 (회원 + 빈 팀 + 추첨 전) */}
                                            {canSelect && (
                                                <Button variant="secondary" size="sm" onClick={() => handleClaim(team)} disabled={!!claiming}>
                                                    {myTeam ? '변경' : '선택'}
                                                </Button>
                                            )}
                                            {/* 강퇴 (어드민 + 다른 인간 멤버) */}
                                            {isAdmin && !isMyTeam && isHuman && (
                                                <Button
                                                    variant="dangerSoft"
                                                    size="sm"
                                                    onClick={() => handleKick(team.user_id!)}
                                                    isLoading={kickingId === team.user_id}
                                                >
                                                    강퇴
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                </div>

                {/* ── 로터리 추첨 (우측) ───────────────────────────────────────── */}
                <div className="space-y-6">
                    {/* [2026-09-11] "드래프트 진행 중일 때, 드래프트 현재 정보 섹션을 우측
                        영역 상단으로" 요청 — 예전엔 좌측 "토너먼트 정보" 섹션 안에 끼워
                        넣었는데, 우측 컬럼 최상단(드래프트 순서 추첨 위)으로 이동. */}
                    {isDrafting && (
                        <section className="space-y-3">
                            <h3 className="text-lg font-black text-emerald-400 animate-pulse">현재 드래프트가 진행중입니다.</h3>
                            <div className="bg-slate-900 px-4 py-4 space-y-3">
                                {draftState && currentPickEntry ? (() => {
                                    const teamCount    = Math.max(draftState.teamCount, 1);
                                    const round        = Math.floor(draftState.currentPickIndex / teamCount) + 1;
                                    const pickInRound   = (draftState.currentPickIndex % teamCount) + 1;
                                    const overallPick  = draftState.currentPickIndex + 1;
                                    const currentTeam  = leagueTeams.find(t => t.team_slug === currentPickEntry.teamId);
                                    const next         = draftState.pickOrder[draftState.currentPickIndex + 1];
                                    const nextTeam      = next ? leagueTeams.find(t => t.team_slug === next.teamId) : null;
                                    const timerPct = draftState.pickDurationSec > 0
                                        ? Math.min(100, Math.round((timeRemaining / draftState.pickDurationSec) * 100))
                                        : 100;
                                    return (
                                        <>
                                            <div className="flex items-center gap-6">
                                                <span className="text-sm font-bold text-white ko-normal">
                                                    {round}라운드 {pickInRound}픽 (오버롤 {overallPick}픽)
                                                </span>
                                                <span className="text-sm font-bold text-white ko-normal">
                                                    남은 시간{' '}
                                                    <span className={`tabular-nums ${
                                                        timerPct <= 15 ? 'text-red-400' : timerPct <= 40 ? 'text-amber-400' : 'text-white'
                                                    }`}>
                                                        {fmtSeconds(timeRemaining)}
                                                    </span>
                                                </span>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="text-sm ko-normal">
                                                    <span className="text-slate-400">현재 차례</span>{' '}
                                                    <span className="font-bold text-white">
                                                        {currentTeam?.team_name ?? currentPickEntry.teamId.toUpperCase()}
                                                    </span>
                                                    {isMyTurn && (
                                                        <span className="ml-1 text-indigo-400 font-bold ko-normal">(내 차례)</span>
                                                    )}
                                                </p>
                                                <p className="text-sm ko-normal">
                                                    <span className="text-slate-400">다음 차례</span>{' '}
                                                    <span className="font-bold text-white">
                                                        {nextTeam?.team_name ?? next?.teamId.toUpperCase() ?? '—'}
                                                    </span>
                                                </p>
                                            </div>
                                        </>
                                    );
                                })() : (
                                    <Spinner variant="section" />
                                )}

                                <Button variant="cta" size="lg" fullWidth onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}>
                                    드래프트 룸 입장
                                </Button>
                            </div>
                        </section>
                    )}

                    {/* [2026-09-18] 개인 팩 드래프트는 로터리 자체가 없어(draft_order 미사용) 이
                        섹션은 공유풀 드래프트 리그에서만 의미가 있다 — 대신 참가/드래프트 마감
                        카운트다운 섹션을 아래에 별도로 보여준다. */}
                    {!isPersonalDraft && <section className="space-y-3">
                        <h3 className="text-lg font-black text-white">드래프트 순서 추첨</h3>
                        <div className="bg-slate-900 overflow-hidden">
                            {!lotteryDone ? (
                                <div className="px-4 py-6 text-center border-b border-slate-800">
                                    <p className="text-xs text-slate-500 ko-normal mb-2">드래프트 순서 추첨까지 남은 시간</p>
                                    <p className="text-5xl font-black text-white tabular-nums">{lotteryCountdown ?? '--:--:--'}</p>
                                </div>
                            ) : (
                                <div>
                                    {Array.from({ length: totalSlots }, (_, i) => i + 1).map(rank => {
                                        const team = sortedTeams.find(t => t.draft_order === rank);
                                        return (
                                            <div
                                                key={rank}
                                                className="flex items-center gap-2 h-11 px-3 border-b border-slate-800/60 last:border-b-0"
                                            >
                                                <span className="text-sm font-bold text-slate-500 w-8 shrink-0">{rank}</span>
                                                {team ? (
                                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                        <TeamLogo teamId={team.team_slug} teamName={team.team_abbr} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                                                        <span className="text-sm font-bold text-white truncate">{team.team_name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 h-5 bg-slate-800/40 rounded" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>}

                    {isPersonalDraft && (
                        <section className="space-y-3">
                            <h3 className="text-lg font-black text-white">참가/드래프트 마감</h3>
                            <div className="bg-slate-900 px-4 py-6 text-center">
                                {!league.draft_deadline_at ? (
                                    <p className="text-sm text-slate-500 ko-normal">마감 없음 — 토너먼트 시작 전까지 언제든 참가할 수 있습니다.</p>
                                ) : draftDeadlinePassed ? (
                                    <>
                                        <p className="text-sm font-bold text-red-400 ko-normal mb-1">참가/팀 변경 마감</p>
                                        <p className="text-xs text-slate-500 ko-normal">아직 드래프트를 끝내지 못한 참가자는 자동으로 강퇴되며, 빈 팀은 토너먼트 시작 시 AI가 대신 채웁니다.</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs text-slate-500 ko-normal mb-2">참가/팀 변경 마감까지 남은 시간</p>
                                        <p className="text-5xl font-black text-white tabular-nums">{draftDeadlineCountdown ?? '--:--:--'}</p>
                                        {myTeam && !myPersonalDraftDone && (
                                            <InlineNotice tone="warning" size="sm" className="mt-2">이 시각까지 드래프트를 끝내지 못하면 자동으로 강퇴됩니다.</InlineNotice>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    )}
                </div>
                </div>
            </div>

            {/* 팀 프로필 편집 모달 */}
            {room && userId && editTarget && (
                <TeamSetupModal
                    open={!!editTarget}
                    roomId={room.id}
                    userId={userId}
                    fixedCity={TEAM_DATA[editTarget.team_slug]?.city ?? VIRTUAL_TEAMS.find(t => t.team_slug === editTarget.team_slug)?.city}
                    existingTeamIds={leagueTeams
                        .filter(t => t.id !== editTarget.id)
                        .map(t => t.team_slug)}
                    initial={{
                        name:           editTarget.team_name,
                        abbr:           editTarget.team_abbr,
                        colorPrimary:   editTarget.color_primary,
                        colorSecondary: editTarget.color_secondary,
                        colorText:      editTarget.color_text ?? getReadableTextColor(editTarget.color_primary),
                    }}
                    onClose={() => setEditTarget(null)}
                    onSaved={reload}
                    saveOverride={async (values) => {
                        // [2026-08-05] "팀 설정"(TeamSettingsModal)에서 신설된 써드 컬러/코트 색상
                        // 3종은 이 로비 모달(TeamSetupModal)엔 입력 필드가 없으므로 기존 저장값을
                        // 그대로 유지 전송(RPC 시그니처가 11-arg로 늘어나 전부 채워야 함).
                        const { error } = await updateTeamProfile(
                            editTarget.id, userId,
                            values.name, values.abbr, values.colorPrimary, values.colorSecondary,
                            editTarget.color_tertiary, values.colorText,
                            editTarget.court_background, editTarget.court_paint, editTarget.court_line,
                        );
                        return { error };
                    }}
                />
            )}
        </>
    );
};

export default LeagueLobbyPanel;
