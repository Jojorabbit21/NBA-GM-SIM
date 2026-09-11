
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Loader2, AlertCircle,
} from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { joinLeague, leaveLeague, claimTeam, updateTeamProfile } from '../../../services/multi/leagueService';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { TeamSetupModal } from '../../../components/multi/TeamSetupModal';
import { useLeagueDraft } from '../../../hooks/useLeagueDraft';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../../utils/constants';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';

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

// public/logos/real/ 로고 세트 — 다른 세션 내 화면들(MultiStandingsView/MultiScheduleView/
// TeamSelectModal 등)과 동일한 폴백 체인(신규 로고 세트 실패 시 구버전 → 플레이스홀더).
const TeamLogoImg: React.FC<{ teamSlug: string; abbr: string; className?: string }> = ({ teamSlug, abbr, className = 'w-7 h-7' }) => (
    <img
        src={getRealTeamLogoUrl(teamSlug)}
        alt={abbr}
        className={`${className} object-contain shrink-0`}
        onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback !== 'old') {
                img.dataset.fallback = 'old';
                img.src = getTeamLogoUrl(teamSlug);
            } else {
                img.src = 'https://placehold.co/100x100?text=BPL';
            }
        }}
    />
);

// "토너먼트 정보" 수직 리스트 한 줄(라벨 좌측, 값 우측) — 세션 내 다른 홈 위젯들과 동일한
// flat 리스트 톤(구분선은 부모 컨테이너의 divide-y가 그려줌).
const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex items-center justify-between py-2 text-sm">
        <span className="text-slate-500 ko-normal">{label}</span>
        <span className="text-white font-bold">{value}</span>
    </div>
);

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
//   리그 이름으로 교체)
// - 이후 섹션들은 세션 내 다른 홈 위젯(HomeStandingsSection 등)과 동일하게
//   `<h3 className="text-lg font-black text-white">섹션명</h3>` + flat `bg-slate-900`
//   패널 스타일로 통일(예전의 bg-slate-800/60 border rounded-2xl 카드 룩 폐기)
// - 팀 목록도 다른 세션 화면들과 동일하게 컬러 배지 대신 실제 로고(getRealTeamLogoUrl) 사용

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
    const canClaim      = isRecruiting;              // 모집 중이면 언제든 빈 팀 선점 가능
    const canChangePre  = isRecruiting && !lotteryDone; // 팀 변경은 로터리 전까지만

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

    // 드래프트 풀 선수 수 — DraftPoolSettings.tsx의 fetchStats()와 동일한 조회 규칙(풀
    // 타입별 조건 + OVR 범위 필터)을 총원 카운트만 필요하므로 축약해서 재사용.
    useEffect(() => {
        if (!league) return;
        let cancelled = false;
        const poolTypes = (league.draft_pool ?? 'standard').split(',').map(s => s.trim()).filter(Boolean);
        const ovrMin = league.draft_ovr_min ?? 0;
        const ovrMax = league.draft_ovr_max ?? 99;

        (async () => {
            const seenIds = new Set<string>();
            let count = 0;
            for (const pt of poolTypes) {
                let query = supabase.from('meta_players').select('id, base_attributes');
                if (pt === 'standard') {
                    query = (query as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
                } else if (pt === 'alltime') {
                    query = (query as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
                } else {
                    query = (query as any).eq('draft_year', 2026);
                }
                const { data } = await query;
                if (!data) continue;
                for (const raw of data as any[]) {
                    if (seenIds.has(raw.id)) continue;
                    seenIds.add(raw.id);
                    if (pt === 'rookies') { count++; continue; }
                    const p = mapRawPlayerToRuntimePlayer(raw, false, true);
                    if (p.ovr >= ovrMin && p.ovr <= ovrMax) count++;
                }
            }
            if (!cancelled) setPoolCount(count);
        })();

        return () => { cancelled = true; };
    }, [league?.draft_pool, league?.draft_ovr_min, league?.draft_ovr_max]);

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
            const m  = Math.floor((diff % 3_600_000)  /    60_000);
            const s  = Math.floor((diff % 60_000)     /     1_000);
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            setLotteryCountdown(d > 0 ? `${d}일 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [league?.lottery_scheduled_at, lotteryDone]);

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
    }, [league, room, userId, reload]);

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
        if (err) { setActionErr(err); }
        reload();
    };

    const handleClaim = useCallback(async (team: LeagueTeamRow) => {
        if (!room || !userId || !isMember) return;
        setClaiming(team.id); setActionErr(null);
        const { error: err } = await claimTeam(room.id, team.id, userId);
        setClaiming(null);
        if (err) { setActionErr(err); return; }
        reload();
    }, [room, userId, isMember, reload]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }
    if (error || !league) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <AlertCircle size={24} className="text-red-400" />
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 불러올 수 없습니다.'}</p>
                <button onClick={() => navigate('/')} className="text-indigo-400 text-sm hover:underline">
                    홈으로 돌아가기
                </button>
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
                            src="/logos/real/PBL.svg"
                            alt="PRO BASKETBALL LEAGUE"
                            className="w-16 h-16 object-contain drop-shadow-md shrink-0"
                        />
                        <span className="text-2xl font-black text-white ko-tight">{league.name}</span>
                    </div>
                    {lotteryDone && (
                        <button
                            onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}
                            className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-base font-black text-white transition-all active:scale-[0.98] shrink-0"
                        >
                            드래프트 룸 입장
                        </button>
                    )}
                </div>

                {/* 에러 */}
                {actionErr && (
                    <p className="text-xs text-red-400 ko-normal bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-2">
                        {actionErr}
                    </p>
                )}

                {/* 2단 — 토너먼트 정보/참가 팀은 좌측, 우측은 추후 확장용 */}
                <div className="grid grid-cols-2 gap-6">
                <div className="space-y-6">

                {/* ── 토너먼트 정보 ─────────────────────────────────────────── */}
                <section className="space-y-3">
                    <h3 className="text-lg font-black text-white">토너먼트 정보</h3>

                    <div className="bg-slate-900 px-4 divide-y divide-slate-800/60">
                        <InfoRow label="참가팀 수" value={`${humanCount} / ${totalSlots}팀`} />
                        {league.type === 'tournament' && league.tournament_format && (
                            <InfoRow
                                label="대진 방식"
                                value={league.tournament_format === 'single_elim' ? 'Single Elimination' : 'Round-Robin'}
                            />
                        )}
                        {league.type === 'tournament' && league.match_format && (
                            <InfoRow
                                label="경기 방식"
                                value={
                                    fmtMatchFormat(league.match_format) +
                                    (league.finals_match_format && league.finals_match_format !== league.match_format
                                        ? ` / Final ${fmtMatchFormat(league.finals_match_format)}`
                                        : '')
                                }
                            />
                        )}
                        <InfoRow label="토너먼트 시작 일시" value={fmtDate(league.tournament_start_at)} />
                        <InfoRow label="드래프트 순서 추첨 일시" value={fmtDate(league.lottery_scheduled_at)} />
                        <InfoRow label="드래프트 일시" value={fmtDate(league.draft_scheduled_at)} />
                        <InfoRow label="드래프트 형식" value={fmtDraftStrategy(league.draft_pool_strategy)} />
                        <InfoRow label="드래프트 라운드 수" value={`${league.draft_total_rounds}라운드`} />
                        <InfoRow label="드래프트 라운드 당 시간" value={`${league.draft_pick_duration_sec}초`} />
                        <InfoRow
                            label="드래프트 대상"
                            value={poolCount === null
                                ? '불러오는 중…'
                                : (
                                    <button
                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/pool`)}
                                        className="hover:text-indigo-400 hover:underline transition-colors"
                                    >
                                        {poolCount}명
                                    </button>
                                )}
                        />
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
                                                <TeamLogoImg teamSlug={team.team_slug} abbr={team.team_abbr} />
                                                {isClaiming && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded">
                                                        <Loader2 size={12} className="animate-spin text-white" />
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
                                            {isEmpty && isRecruiting && !isMember && (
                                                <button
                                                    onClick={() => handleJoinAndClaim(team)}
                                                    disabled={!!claiming}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {claiming === team.id
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : '참가'
                                                    }
                                                </button>
                                            )}
                                            {/* 편집 + 탈퇴 (내 팀, 추첨 전) */}
                                            {canChange && (
                                                <>
                                                    <button
                                                        onClick={() => setEditTarget(team)}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                                    >
                                                        편집
                                                    </button>
                                                    <button
                                                        onClick={handleLeave}
                                                        disabled={leaving}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        탈퇴
                                                    </button>
                                                </>
                                            )}
                                            {/* 선택 (회원 + 빈 팀 + 추첨 전) */}
                                            {canSelect && (
                                                <button
                                                    onClick={() => handleClaim(team)}
                                                    disabled={!!claiming}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white"
                                                >
                                                    {myTeam ? '변경' : '선택'}
                                                </button>
                                            )}
                                            {/* 강퇴 (어드민 + 다른 인간 멤버) */}
                                            {isAdmin && !isMyTeam && isHuman && (
                                                <button
                                                    onClick={() => handleKick(team.user_id!)}
                                                    disabled={kickingId === team.user_id}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/25 text-red-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {kickingId === team.user_id
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : null
                                                    }
                                                    강퇴
                                                </button>
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
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 size={16} className="animate-spin text-slate-500" />
                                    </div>
                                )}

                                <button
                                    onClick={() => navigate(`/multi/leagues/${leagueId}/draft`)}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 px-4 py-2.5 rounded-lg text-sm font-black text-white transition-all active:scale-[0.98]"
                                >
                                    드래프트 룸 입장
                                </button>
                            </div>
                        </section>
                    )}

                    <section className="space-y-3">
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
                                                        <TeamLogoImg teamSlug={team.team_slug} abbr={team.team_abbr} className="w-6 h-6" />
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
                    </section>
                </div>
                </div>
            </div>

            {/* 팀 프로필 편집 모달 */}
            {room && userId && editTarget && (
                <TeamSetupModal
                    open={!!editTarget}
                    roomId={room.id}
                    userId={userId}
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
