
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Shuffle } from 'lucide-react';
import {
    createLeagueGroup,
    createLeague,
    createRoom,
    initializeLeagueTeams,
} from '../../services/multi/leagueService';
import { DraftPoolSettings, type PoolType, type DraftFormat } from './DraftPoolSettings';
import { NORMALIZATION_LEVELS, DEFAULT_NORMALIZATION_LEVEL } from '../../types/simSettings';
import { TEAM_DATA } from '../../data/teamData';

const ALL_REAL_TEAMS = Object.values(TEAM_DATA);
const EAST_TEAMS = ALL_REAL_TEAMS.filter(t => t.conference === 'East');
const WEST_TEAMS = ALL_REAL_TEAMS.filter(t => t.conference === 'West');

function pickRandomTeamSlugs(count: number): string[] {
    const shuffled = [...ALL_REAL_TEAMS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length)).map(t => t.id);
}

interface CreateLeagueModalProps {
    userId: string;
    onClose:  () => void;
    onCreated: (leagueId: string) => void;
}

type LeagueType       = 'tournament' | 'main_league';
type TournamentFormat = 'single_elim' | 'round_robin';
type MatchFormat      = 'best_of_1' | 'best_of_3' | 'best_of_5' | 'best_of_7';
type Tier             = 'd1' | 'd2' | 'd3';

// 이 앱은 KST(UTC+9)를 기본 시간대로 고정한다 — 브라우저의 실제 로컬 타임존과 무관하게
// 항상 KST 벽시계 시각을 기준으로 기본값/저장을 처리해야 한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "내일 10:00 KST"를 datetime-local 입력값("YYYY-MM-DDTHH:mm")으로 반환
function tomorrow10amKst(): string {
    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    const d = new Date(Date.UTC(
        kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1, 10, 0, 0,
    ));
    return d.toISOString().slice(0, 16);
}

// datetime-local(KST 벽시계 시각으로 해석) → ISO(UTC)
function kstLocalToIso(local: string): string {
    return new Date(new Date(`${local}:00Z`).getTime() - KST_OFFSET_MS).toISOString();
}

// datetime-local 문자열끼리 상대 오프셋 계산 — 실제 타임존 변환 없이 벽시계 값에 분 단위로
// 더하고 뺀다(어차피 동일한 KST 벽시계 표기끼리의 기본값 계산용이고, 실제 저장 시엔 항상
// kstLocalToIso()를 한 번 더 거친다).
function shiftLocal(local: string, minutesDelta: number): string {
    const ms = new Date(`${local}:00Z`).getTime() + minutesDelta * 60_000;
    return new Date(ms).toISOString().slice(0, 16);
}

// "HH:MM" → 자정 기준 분. server/src/shared/leagueScheduleCompressor.ts가 그대로 받는 형식.
function hhmmToMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// 메인리그 총 경기 수(30팀×82경기÷2) — 미리보기용. 실제 값은 서버의 generateSeasonSchedule()이
// 결정하지만(디비전 구성에 따라 미세하게 달라질 수 있음), 30팀 고정 표준 포맷에서는 항상 1,230.
const MAIN_LEAGUE_TOTAL_GAMES = 1230;

// [2026-09-11] "토너먼트 시작/드래프트/로터리 일시를 전부 어드민이 직접 설정하게" 요청 —
// 예전엔 로터리/드래프트가 토너먼트 시작 시각 기준 오프셋(-40분/-30분)으로만 자동 계산됐고
// 어드민이 손댈 수 없었다. 이제 세 시각 모두 독립 입력 필드이고, 제출 시
// "로터리 < 드래프트 < 토너먼트 시작" 순서 + 로터리의 최소 리드타임만 검증한다(가장 이른
// 이벤트인 로터리가 생성 즉시 과거가 되면 스케줄러가 준비 안 된 방에 즉시 추첨을 실행해버리는
// 버그로 이어지므로 그 지점만 방어).
const MIN_LOTTERY_LEAD_MS = 15 * 60_000;

function minLotteryKst(): string {
    return new Date(Date.now() + MIN_LOTTERY_LEAD_MS + KST_OFFSET_MS).toISOString().slice(0, 16);
}

// 위 세 시각의 기본값 간격(어드민이 아무것도 안 건드려도 바로 생성 가능한 기본 체인) — 실제
// 제출 시엔 이 오프셋과 무관하게 각 필드의 현재 값만 검증한다.
const DEFAULT_DRAFT_OFFSET_MIN   = 30; // 드래프트: 토너먼트 시작 30분 전
const DEFAULT_LOTTERY_OFFSET_MIN = 40; // 로터리 추첨: 토너먼트 시작 40분 전(드래프트 10분 전)

const TOURNAMENT_TEAM_OPTIONS  = [4, 8, 16, 32];
const MAIN_LEAGUE_TEAM_OPTIONS = [10, 20, 30];

const MATCH_FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
    { value: 'best_of_1', label: '단판' },
    { value: 'best_of_3', label: 'Bo3' },
    { value: 'best_of_5', label: 'Bo5' },
    { value: 'best_of_7', label: 'Bo7' },
];

function ToggleBtn({
    active, onClick, children, className = '',
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
            } ${className}`}
        >
            {children}
        </button>
    );
}

const CreateLeagueModal: React.FC<CreateLeagueModalProps> = ({ userId, onClose, onCreated }) => {
    // ── 공통 ──────────────────────────────────────────────────────────────────
    const [name,    setName]    = useState('');
    const [type,    setType]    = useState<LeagueType>('tournament');
    const [maxTeams, setMaxTeams] = useState(8);

    // ── 토너먼트 전용 ──────────────────────────────────────────────────────────
    const [tournamentFormat,  setTournamentFormat]  = useState<TournamentFormat>('single_elim');
    const [matchFormat,       setMatchFormat]       = useState<MatchFormat>('best_of_1');
    const [finalsMatchFormat, setFinalsMatchFormat] = useState<MatchFormat>('best_of_1');
    const [tournamentStartAt, setTournamentStartAt] = useState(tomorrow10amKst);
    // 드래프트/로터리 시각 — 초기값만 토너먼트 시작 기준 기본 오프셋으로 채우고, 이후로는
    // 완전히 독립된 입력 필드(더 이상 시작 시각 변경에 자동으로 딸려가지 않음).
    const [draftStartAt,   setDraftStartAt]   = useState(() => shiftLocal(tomorrow10amKst(), -DEFAULT_DRAFT_OFFSET_MIN));
    const [lotteryStartAt, setLotteryStartAt] = useState(() => shiftLocal(tomorrow10amKst(), -DEFAULT_LOTTERY_OFFSET_MIN));
    // 경기 사이 인터벌(분) — games_per_real_day = 1440/interval로 환산해 서버에 전달.
    // 기존엔 UI 안내 문구가 "2시간 간격"이라고 잘못 표시하고 있었지만 실제 서버 기본값은
    // games_per_real_day=48(=30분 간격)이었음 — 이번에 실제 필드로 노출하며 기본값도
    // 실제 동작과 맞춰 30으로 바로잡음.
    const [gameIntervalMinutes, setGameIntervalMinutes] = useState(30);
    // [2026-09-11] "어드민이 생성 시 참가 팀을 직접 고르게" 요청 — 정원(maxTeams)이 30을
    // 넘으면(32팀 옵션) 실제 30팀 전원 + 가상 확장팀 2팀으로 자동 구성되므로 고를 필요가
    // 없다(initializeLeagueTeams의 기존 규칙 그대로). 그 외에는 정확히 maxTeams명을 골라야 함.
    const [selectedTeamSlugs, setSelectedTeamSlugs] = useState<string[]>(() => pickRandomTeamSlugs(8));

    // 가상 시즌 연도 (공통) — 메인리그는 사용자에게 보여지는 정규시즌 캘린더 연도(예: 2026년
    // 10월 개막), 토너먼트는 room.season 표기(예: 2026-27)에만 쓰인다. 실제 리그/대회가
    // 시뮬레이션되는 시각(압축된 실제 시간)과는 무관한 표시 전용 값이다.
    // new Date().getFullYear() + 1로 계산하면 방문 시점마다 값이 달라져(내년엔 2028로
    // 자동 이동) 매년 갱신이 필요한 숨은 하드코딩이 되므로, 고정값 2026으로 관리한다.
    // 생성 후에는 이 값이 leagues.virtual_season_year와 rooms.season에 영속되어 이후
    // 스케줄 생성/헤더 표시가 전부 그 DB값만 참조 — 클라이언트가 재계산하는 곳은 없다.
    const [virtualSeasonYear, setVirtualSeasonYear] = useState(2026);

    // ── 메인리그 전용 ──────────────────────────────────────────────────────────
    const [tier,          setTier]          = useState<Tier>('d1');
    const [durationWeeks, setDurationWeeks] = useState(2);
    // 일일 시뮬 시간대(KST) — 이 시간대 안에서만 경기가 진행된다. 기본 저녁 19:00~23:00.
    const [dailyWindowStart, setDailyWindowStart] = useState('19:00');
    const [dailyWindowEnd,   setDailyWindowEnd]   = useState('23:00');

    // ── 드래프트 (공통) ────────────────────────────────────────────────────────
    const [totalRounds,    setTotalRounds]    = useState(10);
    const [pickDurationSec, setPickDurationSec] = useState(30);
    const [autoPickAfterMisses, setAutoPickAfterMisses] = useState(1);
    const [draftPools,     setDraftPools]     = useState<PoolType[]>(['standard']);
    const [draftOvrMin,    setDraftOvrMin]    = useState(0);
    const [draftOvrMax,    setDraftOvrMax]    = useState(99);
    const [draftFormat,    setDraftFormat]    = useState<DraftFormat>('snake');

    // ── 엔진 설정 ──────────────────────────────────────────────────────────────
    const [normalizationLevel, setNormalizationLevel] = useState(DEFAULT_NORMALIZATION_LEVEL);

    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState<string | null>(null);

    // 32팀처럼 실제 30팀을 초과하는 정원은 선택 UI 없이 30팀 전원이 강제 포함된다.
    const teamPickLocked = maxTeams > ALL_REAL_TEAMS.length;
    const teamPickCount  = Math.min(maxTeams, ALL_REAL_TEAMS.length);

    // 정원이 바뀌면 그 수에 맞춰 무작위로 다시 뽑아준다 — 어드민이 아무것도 안 건드려도
    // 바로 생성 가능한 기본값을 유지하면서, 그 아래에서 개별 토글/재추첨으로 덮어쓸 수 있다.
    useEffect(() => {
        if (type !== 'tournament') return;
        setSelectedTeamSlugs(teamPickLocked ? ALL_REAL_TEAMS.map(t => t.id) : pickRandomTeamSlugs(teamPickCount));
    }, [type, teamPickCount, teamPickLocked]);

    const toggleTeam = (slug: string) => {
        if (teamPickLocked) return;
        setSelectedTeamSlugs(prev => {
            if (prev.includes(slug)) return prev.filter(s => s !== slug);
            if (prev.length >= teamPickCount) return prev;
            return [...prev, slug];
        });
    };

    const handleRandomizeTeams = () => setSelectedTeamSlugs(pickRandomTeamSlugs(teamPickCount));

    const handleTypeChange = (t: LeagueType) => {
        setType(t);
        setMaxTeams(t === 'tournament' ? 8 : 30);
    };

    const handleSubmit = async () => {
        const trimName = name.trim();
        if (trimName.length < 1 || trimName.length > 30) {
            setErr('리그 이름은 1~30자여야 합니다'); return;
        }

        // 토너먼트: 로터리 → 드래프트 → 시작 순서로 시각이 늦어져야 하고, 가장 이른 이벤트인
        // 로터리가 최소 리드타임보다 가까우면(=생성 즉시 과거) 스케줄러가 준비 안 된 방에
        // 즉시 추첨을 실행해버리는 버그로 이어진다 — 여기서 미리 막는다.
        let startIso: string | null = null;
        let draftIso: string | null = null;
        let lotteryIso: string | null = null;
        if (type === 'tournament') {
            startIso   = tournamentStartAt ? kstLocalToIso(tournamentStartAt) : null;
            draftIso   = draftStartAt      ? kstLocalToIso(draftStartAt)      : null;
            lotteryIso = lotteryStartAt    ? kstLocalToIso(lotteryStartAt)    : null;

            if (!lotteryIso || new Date(lotteryIso).getTime() < Date.now() + MIN_LOTTERY_LEAD_MS) {
                setErr(`로터리 추첨 일시는 현재로부터 최소 ${MIN_LOTTERY_LEAD_MS / 60_000}분 이후여야 합니다`); return;
            }
            if (!draftIso || new Date(draftIso).getTime() <= new Date(lotteryIso).getTime()) {
                setErr('드래프트 시작 일시는 로터리 추첨 일시보다 늦어야 합니다'); return;
            }
            if (!startIso || new Date(startIso).getTime() <= new Date(draftIso).getTime()) {
                setErr('토너먼트 시작 일시는 드래프트 시작 일시보다 늦어야 합니다'); return;
            }
            if (!Number.isFinite(gameIntervalMinutes) || gameIntervalMinutes < 10 || gameIntervalMinutes > 360) {
                setErr('경기 사이 인터벌은 10~360분 사이여야 합니다'); return;
            }
            if (!teamPickLocked && selectedTeamSlugs.length !== teamPickCount) {
                setErr(`참가 팀을 정확히 ${teamPickCount}팀 선택해주세요 (현재 ${selectedTeamSlugs.length}팀)`); return;
            }
        }

        setSaving(true);
        setErr(null);

        try {
            let leagueId: string;
            let shortCode: string | null = null;

            if (type === 'tournament') {
                const { data: league, error: le } = await createLeague({
                    type: 'tournament',
                    name: trimName,
                    adminUserId: userId,
                    maxTeams,
                    tournamentFormat,
                    matchFormat,
                    finalsMatchFormat: finalsMatchFormat !== matchFormat ? finalsMatchFormat : undefined,
                    options: {
                        draftTotalRounds:     totalRounds,
                        draftPickDurationSec: pickDurationSec,
                        draftAutoPickAfterMisses: autoPickAfterMisses,
                        draftPool:            draftPools.join(','),
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        tournamentStartAt:  startIso,
                        draftScheduledAt:   draftIso,
                        lotteryScheduledAt: lotteryIso,
                        gamesPerRealDay:    Math.max(1, Math.round(1440 / gameIntervalMinutes)),
                        virtualSeasonYear,
                    },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;
                shortCode = league.short_code;

            } else {
                const { data: group, error: ge } = await createLeagueGroup({
                    name:        trimName,
                    adminUserId: userId,
                });
                if (ge || !group) throw new Error(ge ?? '리그 그룹 생성 실패');

                const refToday = new Date().toISOString().slice(0, 10);
                const endDate  = (() => {
                    const d = new Date(refToday);
                    d.setDate(d.getDate() + durationWeeks * 7);
                    return d.toISOString().slice(0, 10);
                })();

                const { data: league, error: le } = await createLeague({
                    type:         'main_league',
                    name:         trimName,
                    adminUserId:  userId,
                    groupId:      group.id,
                    tier,
                    maxTeams,
                    seasonNumber: 1,
                    options: {
                        draftTotalRounds:     totalRounds,
                        draftPickDurationSec: pickDurationSec,
                        draftAutoPickAfterMisses: autoPickAfterMisses,
                        draftPool:            draftPools.join(','),
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        seasonStartDate:      refToday,
                        seasonEndDate:        endDate,
                        durationWeeks,
                        dailyWindowStartMin: hhmmToMin(dailyWindowStart),
                        dailyWindowEndMin:   hhmmToMin(dailyWindowEnd),
                        virtualSeasonYear,
                    },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;
                shortCode = league.short_code;
            }

            const { data: room, error: re } = await createRoom({
                leagueId,
                maxPlayers: maxTeams,
                season: `${virtualSeasonYear}-${String(virtualSeasonYear + 1).slice(-2)}`,
                simSettings: {
                    normalization: {
                        enabled: NORMALIZATION_LEVELS[normalizationLevel].enabled,
                        k:       NORMALIZATION_LEVELS[normalizationLevel].k,
                    },
                } as any,
            });
            if (re || !room) throw new Error(re ?? '방 생성 실패');

            const { error: te } = await initializeLeagueTeams(
                room.id, maxTeams,
                type === 'tournament' ? selectedTeamSlugs : undefined,
            );
            if (te) throw new Error(te);

            onCreated(shortCode ?? leagueId);

        } catch (e: any) {
            setErr(e.message ?? '알 수 없는 오류');
        } finally {
            setSaving(false);
        }
    };

    // ── 시즌 기간 미리보기 ─────────────────────────────────────────────────────
    // server/src/shared/leagueScheduleCompressor.ts와 동일한 공식 — 실제 압축 결과와
    // 일치하는 값을 미리 보여준다.
    const totalRegularDays = durationWeeks * 7;
    const gamesPerDay      = Math.ceil(MAIN_LEAGUE_TOTAL_GAMES / totalRegularDays);

    // [2026-09-10] 홈 화면(StartScreen)에서 열면 이 모달이 InlineLeagueList → "relative z-10"
    // 콘텐츠 래퍼 안에 중첩돼, 그 z-10이 새 스태킹 컨텍스트를 만들어버려 내부의 z-50이
    // 아무리 높아도 형제 요소인 하단 footer(동일 z-10, DOM상 뒤에 위치)에 가려지는 문제가
    // 있었다. 단순히 z-index 숫자를 올리는 걸로는 스태킹 컨텍스트를 못 벗어나므로
    // document.body로 포탈해서 렌더 — MultiSidebar.tsx의 프로필 드롭다운과 동일 패턴.
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[85vh] flex flex-col">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                    <h2 className="text-base font-black text-white ko-tight">새 리그 만들기</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* 바디 — 3단(기본 설정 / 일시 설정 / 드래프트·엔진 설정) */}
                <div className="grid grid-cols-3 divide-x divide-slate-800 overflow-y-auto flex-1 min-h-0">

                    {/* ── 1단: 공통 기본 설정 ─────────────────────────────────── */}
                    <div className="px-6 py-5 space-y-5 overflow-y-auto">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">기본 설정</p>

                        {/* 리그 이름 */}
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">리그 이름</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                maxLength={30}
                                placeholder="예: 스프링 인비테이셔널"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                                autoFocus
                            />
                        </div>

                        {/* 리그 유형 */}
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">리그 유형</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['tournament', 'main_league'] as LeagueType[]).map(t => (
                                    <ToggleBtn
                                        key={t}
                                        active={type === t}
                                        onClick={() => handleTypeChange(t)}
                                        className="py-2 text-sm"
                                    >
                                        {t === 'tournament' ? '토너먼트' : '메인리그'}
                                    </ToggleBtn>
                                ))}
                            </div>
                        </div>

                        {/* 정원 */}
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">정원</label>
                            <div className="flex gap-2 flex-wrap">
                                {(type === 'tournament' ? TOURNAMENT_TEAM_OPTIONS : MAIN_LEAGUE_TEAM_OPTIONS).map(n => (
                                    <ToggleBtn
                                        key={n}
                                        active={maxTeams === n}
                                        onClick={() => setMaxTeams(n)}
                                        className="px-3 py-1.5"
                                    >
                                        {n}팀
                                    </ToggleBtn>
                                ))}
                            </div>
                        </div>

                        {/* 경기 설정 (토너먼트 전용) */}
                        {type === 'tournament' && (
                            <>
                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">대진 방식</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { value: 'single_elim', label: '싱글 엘리미네이션' },
                                            { value: 'round_robin', label: '라운드 로빈' },
                                        ] as { value: TournamentFormat; label: string }[]).map(o => (
                                            <ToggleBtn
                                                key={o.value}
                                                active={tournamentFormat === o.value}
                                                onClick={() => setTournamentFormat(o.value)}
                                            >
                                                {o.label}
                                            </ToggleBtn>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">
                                        {tournamentFormat === 'single_elim' ? '경기 포맷 (일반전)' : '경기 포맷'}
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {MATCH_FORMAT_OPTIONS.map(o => (
                                            <ToggleBtn
                                                key={o.value}
                                                active={matchFormat === o.value}
                                                onClick={() => setMatchFormat(o.value)}
                                            >
                                                {o.label}
                                            </ToggleBtn>
                                        ))}
                                    </div>
                                </div>

                                {tournamentFormat === 'single_elim' && (
                                    <div>
                                        <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (결승)</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {MATCH_FORMAT_OPTIONS.map(o => (
                                                <ToggleBtn
                                                    key={o.value}
                                                    active={finalsMatchFormat === o.value}
                                                    onClick={() => setFinalsMatchFormat(o.value)}
                                                >
                                                    {o.label}
                                                </ToggleBtn>
                                            ))}
                                        </div>
                                        {finalsMatchFormat === matchFormat && (
                                            <p className="text-[11px] text-slate-600 ko-normal mt-1">일반전과 동일 포맷</p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* 티어 (메인리그 전용) */}
                        {type === 'main_league' && (
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">티어</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['d1', 'd2', 'd3'] as Tier[]).map(t => (
                                        <ToggleBtn
                                            key={t}
                                            active={tier === t}
                                            onClick={() => setTier(t)}
                                            className="py-2 text-sm"
                                        >
                                            {t.toUpperCase()}
                                        </ToggleBtn>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 참가 팀 선택 (토너먼트 전용) */}
                        {type === 'tournament' && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs text-slate-400 ko-normal">
                                        참가 팀 선택
                                        {!teamPickLocked && (
                                            <span className={`ml-1.5 ${selectedTeamSlugs.length === teamPickCount ? 'text-slate-600' : 'text-amber-400'}`}>
                                                {selectedTeamSlugs.length}/{teamPickCount}
                                            </span>
                                        )}
                                    </label>
                                    {!teamPickLocked && (
                                        <button
                                            type="button"
                                            onClick={handleRandomizeTeams}
                                            className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                        >
                                            <Shuffle size={11} />
                                            무작위 선택
                                        </button>
                                    )}
                                </div>
                                {teamPickLocked ? (
                                    <p className="text-[11px] text-slate-600 ko-normal">
                                        32팀은 실제 30팀 전원 + 가상 확장팀 2팀으로 자동 구성됩니다.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {([['동부', EAST_TEAMS], ['서부', WEST_TEAMS]] as const).map(([label, confTeams]) => (
                                            <div key={label}>
                                                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">{label}</p>
                                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                                    {confTeams.map(t => {
                                                        const selected = selectedTeamSlugs.includes(t.id);
                                                        const disabled = !selected && selectedTeamSlugs.length >= teamPickCount;
                                                        return (
                                                            <button
                                                                key={t.id}
                                                                type="button"
                                                                onClick={() => toggleTeam(t.id)}
                                                                disabled={disabled}
                                                                className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-bold text-left truncate transition-colors ${
                                                                    selected
                                                                        ? 'bg-indigo-600 text-white'
                                                                        : disabled
                                                                        ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                                                }`}
                                                            >
                                                                {t.city} {t.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── 2단: 일시 설정 ─────────────────────────────────────────── */}
                    <div className="px-6 py-5 space-y-5 overflow-y-auto">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">일시 설정</p>

                        {/* 토너먼트: 로터리 → 드래프트 → 토너먼트 시작 순서로 전부 독립 입력 */}
                        {type === 'tournament' && (
                            <>
                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">가상 시즌 연도</label>
                                    <input
                                        type="number"
                                        value={virtualSeasonYear}
                                        onChange={e => setVirtualSeasonYear(Number(e.target.value) || virtualSeasonYear)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        시즌 표기(예: {virtualSeasonYear}-{String(virtualSeasonYear + 1).slice(-2)})에 사용되는 값입니다. 실제 대회 진행 속도와는 무관합니다.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">로터리 추첨 일시</label>
                                    <input
                                        type="datetime-local"
                                        value={lotteryStartAt}
                                        min={minLotteryKst()}
                                        onChange={e => setLotteryStartAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        현재로부터 최소 {MIN_LOTTERY_LEAD_MS / 60_000}분 이후로 설정할 수 있습니다.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">드래프트 시작 일시</label>
                                    <input
                                        type="datetime-local"
                                        value={draftStartAt}
                                        onChange={e => setDraftStartAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">로터리 추첨 일시보다 늦어야 합니다.</p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">토너먼트 시작 일시</label>
                                    <input
                                        type="datetime-local"
                                        value={tournamentStartAt}
                                        onChange={e => setTournamentStartAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">드래프트 시작 일시보다 늦어야 합니다(첫 경기 시작 시각).</p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">
                                        경기 사이 인터벌(분)
                                        <span className="text-slate-600 ml-1">10–360</span>
                                    </label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={360}
                                        step={5}
                                        value={gameIntervalMinutes}
                                        onChange={e => setGameIntervalMinutes(Math.min(360, Math.max(10, Number(e.target.value) || 10)))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        첫 경기(토너먼트 시작 일시) 이후 경기들이 이 간격으로 자동 배정됩니다.
                                    </p>
                                </div>
                            </>
                        )}

                        {/* 메인리그: 시즌 캘린더 관련 시각/기간 */}
                        {type === 'main_league' && (
                            <>
                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">가상 시즌 연도</label>
                                    <input
                                        type="number"
                                        value={virtualSeasonYear}
                                        onChange={e => setVirtualSeasonYear(Number(e.target.value) || virtualSeasonYear)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        사용자에게 표시되는 정규시즌 개막 연도입니다(예: {virtualSeasonYear}년 10월 개막). 실제 시뮬레이션 진행 속도와는 무관합니다.
                                    </p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">정규시즌 기간</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {[1, 2, 3, 4].map(w => (
                                            <ToggleBtn
                                                key={w}
                                                active={durationWeeks === w}
                                                onClick={() => setDurationWeeks(w)}
                                                className="px-3"
                                            >
                                                {w}주
                                            </ToggleBtn>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">일일 시뮬 시간대 (KST)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="time"
                                            value={dailyWindowStart}
                                            onChange={e => setDailyWindowStart(e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                        <span className="text-slate-500 text-xs">~</span>
                                        <input
                                            type="time"
                                            value={dailyWindowEnd}
                                            onChange={e => setDailyWindowEnd(e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">이 시간대 안에서만 경기가 진행됩니다.</p>

                                    <div className="bg-slate-800/60 rounded-lg px-3 py-2.5 mt-2 space-y-1">
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500 ko-normal">정규시즌</span>
                                            <span className="text-slate-300 font-mono">{totalRegularDays}일 · 하루 약 {gamesPerDay}경기</span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500 ko-normal">일일 시뮬 시간대</span>
                                            <span className="text-slate-300 font-mono">{dailyWindowStart} ~ {dailyWindowEnd} KST</span>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        정규시즌이 끝나면 상위 8팀이 자동으로 플레이오프에 진출합니다.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── 3단: 드래프트 + 엔진 설정 ───────────────────────────────── */}
                    <div className="px-6 py-5 space-y-5 overflow-y-auto">

                        {/* 드래프트 설정 (공통) */}
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">드래프트 설정</p>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">
                                    드래프트 라운드
                                    <span className="text-slate-600 ml-1">10–15</span>
                                </label>
                                <input
                                    type="number"
                                    min={10}
                                    max={15}
                                    value={totalRounds}
                                    onChange={e => setTotalRounds(Math.min(15, Math.max(10, Number(e.target.value))))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">
                                    픽 제한(초)
                                    <span className="text-slate-600 ml-1">15–60</span>
                                </label>
                                <input
                                    type="number"
                                    min={15}
                                    max={60}
                                    value={pickDurationSec}
                                    onChange={e => setPickDurationSec(Math.min(60, Math.max(15, Number(e.target.value))))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">
                                    오토픽 전환 기준(연속 미스)
                                    <span className="text-slate-600 ml-1">1–5</span>
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={autoPickAfterMisses}
                                    onChange={e => setAutoPickAfterMisses(Math.min(5, Math.max(1, Number(e.target.value))))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <DraftPoolSettings
                            poolTypes={draftPools}
                            onPoolTypesChange={setDraftPools}
                            ovrMin={draftOvrMin}
                            onOvrMinChange={setDraftOvrMin}
                            ovrMax={draftOvrMax}
                            onOvrMaxChange={setDraftOvrMax}
                            draftFormat={draftFormat}
                            onDraftFormatChange={setDraftFormat}
                        />

                        <div className="border-t border-slate-800 pt-5" />

                        {/* 엔진 설정 */}
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">엔진 설정</p>
                        <div>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold text-slate-300">리그 상대 정규화 강도</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={5}
                                    step={1}
                                    value={normalizationLevel}
                                    onChange={e => setNormalizationLevel(Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0))))}
                                    className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <p className="text-[11px] text-slate-600 ko-normal mt-1 px-1">
                                0이면 정규화가 완전히 꺼집니다. 올타임 등 고OVR 드래프트 풀에서 득점이 비현실적으로 치솟는 걸 억제하는 기능이며, 1~5로 갈수록 표준 수준으로 강하게 압축됩니다. 생성 후에도 세션 설정에서 변경할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="px-6 py-4 border-t border-slate-800 shrink-0 space-y-3">
                    {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving
                                ? <span className="flex items-center justify-center gap-1.5">
                                    <Loader2 size={13} className="animate-spin" />생성 중…
                                  </span>
                                : '만들기'
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CreateLeagueModal;
