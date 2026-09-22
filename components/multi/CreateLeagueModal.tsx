
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Shuffle } from 'lucide-react';
import {
    createLeagueGroup,
    createLeague,
    createRoom,
    initializeLeagueTeams,
} from '../../services/multi/leagueService';
import { DraftPoolSettings, type DraftFormat } from './DraftPoolSettings';
import { checkDraftPoolCapacity } from '../../services/multi/draftPoolCapacity';
import { DraftSalaryScaleSettings } from './DraftSalaryScaleSettings';
import {
    type ContractMode, type DraftSalaryScale, DEFAULT_DRAFT_SALARY_SCALE, validateDraftSalaryScale,
} from '../../services/contracts/draftSalaryScale';

// 리그 생성 시점엔 캡 금액 입력이 없어(설정 화면에서 나중에 조정) 표시용으로만 쓰는 기본값 —
// views/multi/league/LeagueSettingsView.tsx CAP_DEFAULTS(2026-27 공식 수치)와 같은 값.
const CREATE_CAP_DEFAULTS = { salaryCap: 164_961_000, tax: 200_428_000, apron1: 209_015_000, apron2: 221_686_000 };
import { PersonalDraftFormatEditor } from './PersonalDraftFormatEditor';
import {
    buildFixedDeclineCurve, buildPersonalDraftFormat, computeRosterSize,
    PICK_TIMER_SEC_DEFAULT, PERSONAL_DRAFT_OVR_MAX, type PersonalDraftRoundInput, type PersonalDraftFormat, type PositionTargets,
} from '../../services/multi/personalDraftFormat';
import { NORMALIZATION_LEVELS, DEFAULT_NORMALIZATION_LEVEL } from '../../types/simSettings';
import { TEAM_DATA } from '../../data/teamData';
import { getDefaultTradeDeadline, getTradeDeadlineBounds, clampTradeDeadline } from '../../utils/tradeDeadline';
import {
    buildVirtualCalendar, computeTimelineFeasibility, playoffMaxDays, addDaysToDateStr, minToHHMM,
    MIN_DAY_LENGTH_MIN, MAX_DAY_LENGTH_MIN, DEFAULT_DAY_LENGTH_MIN, DEFAULT_WINDOW_START_MIN, DEFAULT_REPLAY_MIN,
    REPLAY_MINUTE_OPTIONS, lateGameClampsAt,
} from '../../utils/leagueTimeline';
import { getAllStarKeyDates } from '../../utils/allStarSelection';

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

// "HH:MM" → 자정 기준 분(leagues.daily_window_start_min 형식).
function hhmmToMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// "오늘(KST) + n일" → 'YYYY-MM-DD'. 메인리그 실제 시작/종료일 기본값용.
function kstTodayPlusDays(n: number): string {
    const k = new Date(Date.now() + KST_OFFSET_MS);
    const base = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
    return addDaysToDateStr(base, n);
}
// 메인리그 실제 기간 기본값 — 시작 내일, 종료 14일째(하루 30분·10:00 시작이면 약 7시간 30분 창).
const DEFAULT_MAIN_LEAGUE_REAL_DAYS = 14;
// 플레이오프 가상 캘린더 최대 일수 계산에 쓰는 기본 포맷(생성 모달은 플레이오프 팀 수/포맷을 따로
// 받지 않으므로 DB 기본값과 동일: 컨퍼런스 8팀·플레이인·7전 4선승).
const DEFAULT_PLAYOFF_TEAMS_PER_CONF = 8;
const DEFAULT_PLAYOFF_TARGET_WINS = 4;

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
    // [2026-09-18] 고정 길이 가상 하루 타임라인 설정 — 실제 시작/종료일 + 가상 하루 길이 + 창 시작 시각 +
    // 플레이오프 경기 간격. 일일 시뮬 시간대 "길이"는 입력하지 않고 계산한다(docs/plan/fixed-day-schedule-plan.md).
    const [realStartDate, setRealStartDate] = useState(() => kstTodayPlusDays(1));
    const [realEndDate,   setRealEndDate]   = useState(() => kstTodayPlusDays(DEFAULT_MAIN_LEAGUE_REAL_DAYS));
    const [dayLengthMin,  setDayLengthMin]  = useState(DEFAULT_DAY_LENGTH_MIN);
    const [windowStart,   setWindowStart]   = useState(minToHHMM(DEFAULT_WINDOW_START_MIN));
    const [playoffIntervalDays, setPlayoffIntervalDays] = useState<1 | 2>(1);
    // [2026-09-18 2단계] 리플레이(결과 공개 지연) 길이 — 경기 하나가 실제로 재생되는 시간이자 결과가 숨겨지는 시간.
    const [replayMinutes, setReplayMinutes] = useState<number>(DEFAULT_REPLAY_MIN);
    // 트레이드 데드라인(가상 시즌 캘린더 날짜) — 기본값(2월 둘째 주 목요일)에서 최대 한 달
    // 전까지만 앞당길 수 있고 뒤로는 늘릴 수 없다(utils/tradeDeadline.ts). virtualSeasonYear가
    // 바뀌면 사용자가 직접 건드리기 전까지는 기본값에 계속 동기화된다.
    const [tradeDeadlineDate, setTradeDeadlineDate] = useState(() => getDefaultTradeDeadline(2026));
    const tradeDeadlineTouchedRef = useRef(false);
    // 데드라인 강제 여부 마스터 스위치 — 꺼도 날짜 값 자체는 유지(다시 켜면 그대로 복원).
    const [tradeDeadlineEnabled, setTradeDeadlineEnabled] = useState(true);

    // ── 드래프트 (공통) ────────────────────────────────────────────────────────
    const [totalRounds,    setTotalRounds]    = useState(10);
    const [pickDurationSec, setPickDurationSec] = useState(30);
    const [autoPickAfterMisses, setAutoPickAfterMisses] = useState(1);
    const [draftOvrMin,    setDraftOvrMin]    = useState(0);
    const [draftOvrMax,    setDraftOvrMax]    = useState(99);
    const [draftYearMin,   setDraftYearMin]   = useState(2001);
    const [draftYearMax,   setDraftYearMax]   = useState(2025);
    const [useCustomOverrides, setUseCustomOverrides] = useState(false);
    // [2026-09-22] 드래프트 계약 생성 — 'standard'(실제 계약 유지, 풀은 유효 계약자+당해 신인) /
    // 'alternative'(드래프트 전원 라운드 스케일 1년 계약). 표는 services/contracts/draftSalaryScale.ts 기본값.
    const [contractMode,     setContractMode]     = useState<ContractMode>('standard');
    const [draftSalaryScale, setDraftSalaryScale] = useState<DraftSalaryScale>(() => ({ ...DEFAULT_DRAFT_SALARY_SCALE, roundsPct: [...DEFAULT_DRAFT_SALARY_SCALE.roundsPct] }));
    const [draftFormat,    setDraftFormat]    = useState<DraftFormat>('snake');
    // [2026-09-18] 토너먼트 드래프트 방식 — 'shared'(기존 공유풀 턴제) / 'personal'(개인 팩 드래프트,
    // docs/plan/tournament-personal-pack-draft-plan.md). personal이면 로터리/드래프트 룸 일정이 없고
    // 팀 확정 즉시 각자 라운드제 팩 드래프트를 진행한다.
    const [draftMode,       setDraftMode]       = useState<'shared' | 'personal'>('shared');
    const [personalRounds,  setPersonalRounds]  = useState<PersonalDraftRoundInput[]>(() =>
        buildFixedDeclineCurve(0, 99, { totalRounds: 15, windowSize: 10, poolSize: 8, picks: 1 }));
    const [personalTimer,   setPersonalTimer]   = useState<number | null>(PICK_TIMER_SEC_DEFAULT);
    // [2026-09-20] 등장 카드 컬렉션과 비율(가중치). 비어 있으면 전체 카드 균등.
    const [personalCollectionWeights, setPersonalCollectionWeights] = useState<Record<string, number>>({});
    // [2026-09-20] 포지션 분배 목표(G/F/C 장수). null이면 기본 비율(40/40/20, C≥2)로 자동.
    const [personalPositionTargets, setPersonalPositionTargets] = useState<PositionTargets | null>(null);
    const isPersonalDraft = type === 'tournament' && draftMode === 'personal';
    // [2026-09-18] 개인 팩 드래프트 참가/드래프트 마감 — 지나면 신규 참가 차단 + 미완료 참가자 자동 강퇴
    // (server/src/personalDraftDeadline.ts). 선택 사항(꺼두면 마감 없이 기존처럼 동작).
    const [draftDeadlineEnabled, setDraftDeadlineEnabled] = useState(false);
    const [draftDeadlineAt,      setDraftDeadlineAt]      = useState('');

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

    // 트레이드 데드라인 기본값 동기화 — 사용자가 직접 손댄 적 없으면 가상 시즌 연도가
    // 바뀔 때마다 새 기본값(2월 둘째 주 목요일)으로 계속 따라간다.
    const tradeDeadlineBounds = getTradeDeadlineBounds(virtualSeasonYear);
    useEffect(() => {
        if (tradeDeadlineTouchedRef.current) return;
        setTradeDeadlineDate(tradeDeadlineBounds.default);
    }, [tradeDeadlineBounds.default]);

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

            if (isPersonalDraft) {
                // 개인 팩 드래프트: 로터리/드래프트 룸 일정이 없다 — 스케줄러(runLotteries/
                // runScheduledDraftStarts)가 null 일정을 건너뛰도록 둘 다 null로 저장한다.
                lotteryIso = null;
                draftIso   = null;
                if (!startIso || new Date(startIso).getTime() < Date.now() + MIN_LOTTERY_LEAD_MS) {
                    setErr(`토너먼트 시작 일시는 현재로부터 최소 ${MIN_LOTTERY_LEAD_MS / 60_000}분 이후여야 합니다`); return;
                }
                if (draftDeadlineEnabled) {
                    if (!draftDeadlineAt) { setErr('드래프트 마감 일시를 입력해주세요'); return; }
                    const deadlineIso = kstLocalToIso(draftDeadlineAt);
                    if (new Date(deadlineIso).getTime() < Date.now() + MIN_LOTTERY_LEAD_MS) {
                        setErr(`드래프트 마감 일시는 현재로부터 최소 ${MIN_LOTTERY_LEAD_MS / 60_000}분 이후여야 합니다`); return;
                    }
                    if (new Date(deadlineIso).getTime() > new Date(startIso).getTime()) {
                        setErr('드래프트 마감 일시는 토너먼트 시작 일시보다 늦을 수 없습니다'); return;
                    }
                }
            } else {
                if (!lotteryIso || new Date(lotteryIso).getTime() < Date.now() + MIN_LOTTERY_LEAD_MS) {
                    setErr(`로터리 추첨 일시는 현재로부터 최소 ${MIN_LOTTERY_LEAD_MS / 60_000}분 이후여야 합니다`); return;
                }
                if (!draftIso || new Date(draftIso).getTime() <= new Date(lotteryIso).getTime()) {
                    setErr('드래프트 시작 일시는 로터리 추첨 일시보다 늦어야 합니다'); return;
                }
                if (!startIso || new Date(startIso).getTime() <= new Date(draftIso).getTime()) {
                    setErr('토너먼트 시작 일시는 드래프트 시작 일시보다 늦어야 합니다'); return;
                }
            }
            if (!Number.isFinite(gameIntervalMinutes) || gameIntervalMinutes < 10 || gameIntervalMinutes > 360) {
                setErr('경기 사이 인터벌은 10~360분 사이여야 합니다'); return;
            }
            if (!teamPickLocked && selectedTeamSlugs.length !== teamPickCount) {
                setErr(`참가 팀을 정확히 ${teamPickCount}팀 선택해주세요 (현재 ${selectedTeamSlugs.length}팀)`); return;
            }
        }
        if (type === 'main_league') {
            if (realStartDate < kstTodayPlusDays(0)) { setErr('실제 시작일은 오늘 이후여야 합니다'); return; }
            if (!timelineFeasibility.feasible) {
                setErr(`이 설정으로는 세션을 구성할 수 없습니다 — ${timelineFeasibility.reasons.join(' ')}`); return;
            }
        }

        setSaving(true);
        setErr(null);

        try {
            // [2026-09-17] 드래프트 풀 용량 가드 — 참가팀 × 라운드만큼 선수가 없으면 서버 DraftRoom이
            // 마지막 픽에서 "no available players"로 멈춘 채 영영 완료되지 않는다("New League" 세션:
            // 풀 431명 < 30팀×15라운드=450픽). 세션 자체를 만들 수 없게 여기서 차단한다.
            // 개인 팩 드래프트는 공유풀이 아니라 라운드별 후보 목록을 저장 시점에 확정한다 —
            // buildPersonalDraftFormat()이 라운드마다 노출 카드 수 이상의 후보가 있는지 검사하고,
            // 부족하면 에러를 돌려주므로 위 공유풀 용량 가드 대신 이걸로 막는다.
            let personalFormat: PersonalDraftFormat | null = null;
            if (isPersonalDraft) {
                const built = await buildPersonalDraftFormat({
                    pickTimerSec: personalTimer,
                    globalDraftYearMin: draftYearMin, globalDraftYearMax: draftYearMax,
                    globalOvrMin: draftOvrMin, globalOvrMax: draftOvrMax,
                    useCustomOverrides, rounds: personalRounds,
                    collectionWeights: personalCollectionWeights,
                    positionTargets: personalPositionTargets,
                });
                if (built.ok === false) throw new Error(built.error);
                personalFormat = built.format;
            } else {
                if (contractMode === 'alternative') {
                    const v = validateDraftSalaryScale(draftSalaryScale, totalRounds, maxTeams, {});
                    if (!v.ok) throw new Error(`드래프트 계약 표 오류: ${v.errors[0]}`);
                }
                const capacityErr = await checkDraftPoolCapacity({
                    teamCount: maxTeams, totalRounds,
                    draftYearMin, draftYearMax, ovrMin: draftOvrMin, ovrMax: draftOvrMax, useCustomOverrides,
                    contractMode, seasonStartYear: virtualSeasonYear, rookieClassYear: draftYearMax,
                });
                if (capacityErr) throw new Error(capacityErr);
            }
            const personalRosterSize = personalFormat ? computeRosterSize(personalFormat.rounds) : null;

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
                        // 개인 팩 드래프트: 포맷 저장 + 트레이드 강제 off + 로스터 상한을 픽 합계에 맞춤.
                        // draft_total_rounds는 공유풀 드래프트에서만 쓰이지만 표시 일관성을 위해 로스터 크기로 둔다.
                        ...(personalFormat ? {
                            personalDraftFormat: personalFormat,
                            tradeEnabled: false,
                            maxRosterSize: Math.min(20, Math.max(15, personalRosterSize ?? 15)),
                            draftDeadlineAt: draftDeadlineEnabled && draftDeadlineAt ? kstLocalToIso(draftDeadlineAt) : null,
                        } : {}),
                        draftTotalRounds:     personalRosterSize ?? totalRounds,
                        draftPickDurationSec: pickDurationSec,
                        draftAutoPickAfterMisses: autoPickAfterMisses,
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        draftYearMin,
                        draftYearMax,
                        useCustomOverrides,
                        contractMode,
                        draftSalaryScale,
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

                const windowStartMin = hhmmToMin(windowStart);
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
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        draftYearMin,
                        draftYearMax,
                        useCustomOverrides,
                        contractMode,
                        draftSalaryScale,
                        seasonStartDate:      realStartDate,
                        seasonEndDate:        realEndDate,
                        // duration_weeks / daily_window_end_min은 이제 파생값(호환용) — 실제 배치는 아래
                        // dayLengthMin/realStartDate/realEndDate/dailyWindowStartMin으로 서버(finalize.ts)가 계산.
                        durationWeeks:        Math.max(1, Math.ceil(timelineFeasibility.realDays / 7)),
                        dailyWindowStartMin:  windowStartMin,
                        dailyWindowEndMin:    Math.min(1440, timelineFeasibility.windowEndMin),
                        dayLengthMin,
                        realStartDate,
                        realEndDate,
                        playoffGameIntervalDays: playoffIntervalDays,
                        replayMinutes,
                        virtualSeasonYear,
                        tradeDeadlineDate,
                        tradeDeadlineEnabled,
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
                    // 개인 팩 드래프트 토너먼트는 부상 비활성(설계 결정) — 세션 설정 엔진 탭에서도 잠긴다.
                    ...(isPersonalDraft ? { injuriesEnabled: false } : {}),
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

    // ── 타임라인 실현 가능성(메인리그) ─────────────────────────────────────────
    // utils/leagueTimeline.ts(서버 finalize.ts와 미러)와 동일한 계산 — 가상 캘린더 일수(정규시즌 약 175일 +
    // 플레이오프 최대 일수)를 실제 기간에 담을 때 필요한 일일 시뮬 시간대 길이를 구하고, 자정을 넘기면
    // 생성을 막고 대안(종료일/하루 길이/시작 시각)을 제시한다.
    const virtualCalendarDays = React.useMemo(() => buildVirtualCalendar({
        virtualSeasonYear,
        keyDates: getAllStarKeyDates(virtualSeasonYear),
        playoff: {
            intervalDays: playoffIntervalDays, playInEnabled: true,
            teamsPerConference: DEFAULT_PLAYOFF_TEAMS_PER_CONF,
            targetWins: DEFAULT_PLAYOFF_TARGET_WINS, finalsTargetWins: DEFAULT_PLAYOFF_TARGET_WINS,
        },
    }).length, [virtualSeasonYear, playoffIntervalDays]);
    const playoffDays = playoffMaxDays({
        intervalDays: playoffIntervalDays, playInEnabled: true,
        teamsPerConference: DEFAULT_PLAYOFF_TEAMS_PER_CONF, targetWins: DEFAULT_PLAYOFF_TARGET_WINS, finalsTargetWins: DEFAULT_PLAYOFF_TARGET_WINS,
    });
    const timelineFeasibility = React.useMemo(() => computeTimelineFeasibility({
        realStartDate, realEndDate, dayLengthMin, windowStartMin: hhmmToMin(windowStart), virtualDayCount: virtualCalendarDays, replayMin: replayMinutes,
    }), [realStartDate, realEndDate, dayLengthMin, windowStart, virtualCalendarDays, replayMinutes]);
    // 가상 하루 안 슬롯 간격(30가상분)과 22:30 경기 종료 여유 — 안내용.
    const slotIntervalSec = Math.round(dayLengthMin * 30 / 480 * 60);
    const lastGameEndMin  = dayLengthMin * (3.5 * 60) / 480 + replayMinutes;
    const lateGameClamped = lateGameClampsAt(dayLengthMin, replayMinutes);

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
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">드래프트 방식</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { value: 'shared',   label: '공유 풀 (턴제)' },
                                            { value: 'personal', label: '개인 팩 드래프트' },
                                        ] as { value: 'shared' | 'personal'; label: string }[]).map(o => (
                                            <ToggleBtn
                                                key={o.value}
                                                active={draftMode === o.value}
                                                onClick={() => setDraftMode(o.value)}
                                            >
                                                {o.label}
                                            </ToggleBtn>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        {draftMode === 'personal'
                                            ? '참가자가 팀을 고르면 바로 각자 라운드별 카드 팩에서 선수를 뽑습니다. 로터리·드래프트 룸이 없고, 같은 선수가 여러 팀에 있을 수 있으며 트레이드·부상은 꺼집니다.'
                                            : '추첨된 순서대로 정해진 시각에 모두 함께 공유 풀에서 한 명씩 지명합니다.'}
                                    </p>
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

                                {!isPersonalDraft && (
                                    <>
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
                                    </>
                                )}

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">토너먼트 시작 일시</label>
                                    <input
                                        type="datetime-local"
                                        value={tournamentStartAt}
                                        onChange={e => setTournamentStartAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        {isPersonalDraft
                                            ? `첫 경기 시작 시각. 현재로부터 최소 ${MIN_LOTTERY_LEAD_MS / 60_000}분 이후여야 하며, 참가자들은 그 전까지 각자 팩 드래프트를 마쳐야 합니다.`
                                            : '드래프트 시작 일시보다 늦어야 합니다(첫 경기 시작 시각).'}
                                    </p>
                                </div>

                                {isPersonalDraft && (
                                    <div>
                                        <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={draftDeadlineEnabled}
                                                onChange={e => {
                                                    const on = e.target.checked;
                                                    setDraftDeadlineEnabled(on);
                                                    if (on && !draftDeadlineAt) setDraftDeadlineAt(tournamentStartAt);
                                                }}
                                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                                            />
                                            <span className="text-xs text-slate-400 ko-normal">드래프트 마감 일시 설정</span>
                                        </label>
                                        {draftDeadlineEnabled && (
                                            <input
                                                type="datetime-local"
                                                value={draftDeadlineAt}
                                                min={minLotteryKst()}
                                                max={tournamentStartAt}
                                                onChange={e => setDraftDeadlineAt(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                            />
                                        )}
                                        <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                            이 시각이 지나면 새 참가자는 더 이상 팀을 선택할 수 없고, 그때까지 드래프트를 끝내지 못한 참가자는 자동으로 강퇴됩니다. 이어서 빈 팀에 AI가 들어가 드래프트와 대진표까지 미리 준비되고, 첫 경기는 정확히 시작 시각에 열립니다. 끄면 시작 5분 전에 같은 준비가 자동으로 진행됩니다(그때부터 참가 마감).
                                        </p>
                                    </div>
                                )}

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
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">실제 진행 기간 (KST)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={realStartDate}
                                            min={kstTodayPlusDays(0)}
                                            onChange={e => { const v = e.target.value; if (!v) return; setRealStartDate(v); if (realEndDate < v) setRealEndDate(v); }}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                        <span className="text-slate-500 text-xs">~</span>
                                        <input
                                            type="date"
                                            value={realEndDate}
                                            min={realStartDate}
                                            onChange={e => { const v = e.target.value; if (v) setRealEndDate(v < realStartDate ? realStartDate : v); }}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        시작일의 시뮬 시간대부터 정규시즌이 시작되고, 종료일 안에 플레이오프(최대 {playoffDays}일)까지 끝나도록 배치합니다. 드래프트는 시작일 시뮬 시간대 전에 끝나야 합니다.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-400 ko-normal block mb-1.5">가상 하루 길이 (분) <span className="text-slate-600">{MIN_DAY_LENGTH_MIN}–{MAX_DAY_LENGTH_MIN}</span></label>
                                        <input
                                            type="number"
                                            min={MIN_DAY_LENGTH_MIN}
                                            max={MAX_DAY_LENGTH_MIN}
                                            step={1}
                                            value={dayLengthMin}
                                            onChange={e => setDayLengthMin(Math.min(MAX_DAY_LENGTH_MIN, Math.max(MIN_DAY_LENGTH_MIN, Number(e.target.value) || MIN_DAY_LENGTH_MIN)))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400 ko-normal block mb-1.5">시뮬 시간대 시작 (KST)</label>
                                        <input
                                            type="time"
                                            value={windowStart}
                                            onChange={e => e.target.value && setWindowStart(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-600 ko-normal -mt-2">
                                    가상 하루(19:00~다음 날 03:00)가 실제 {dayLengthMin}분 동안 흐릅니다. 경기 시작 슬롯 간격은 {slotIntervalSec}초, 가장 늦은 22:30 경기는 하루 시작 {Math.round(lastGameEndMin * 10) / 10}분 뒤에 끝납니다. 경기 없는 날도 같은 길이로 지나갑니다.
                                </p>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">플레이오프 경기 간격</label>
                                    <div className="flex gap-2">
                                        <ToggleBtn active={playoffIntervalDays === 1} onClick={() => setPlayoffIntervalDays(1)} className="px-3">매일 (최대 30일)</ToggleBtn>
                                        <ToggleBtn active={playoffIntervalDays === 2} onClick={() => setPlayoffIntervalDays(2)} className="px-3">격일 (최대 59일)</ToggleBtn>
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">시리즈 안 경기와 라운드 사이 간격(가상 일). 짧은 리그는 매일, 3~4주 리그는 격일이 자연스럽습니다. 생성 후 변경 불가.</p>
                                </div>

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 리플레이 길이 (결과 공개 지연)</label>
                                    <div className="flex gap-2">
                                        {REPLAY_MINUTE_OPTIONS.map(m => (
                                            <ToggleBtn key={m} active={replayMinutes === m} onClick={() => setReplayMinutes(m)} className="px-3">{m}분</ToggleBtn>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        한 경기(48분)를 이 시간 동안 실시간처럼 재생하고, 끝나는 순간 결과가 공개됩니다. 짧을수록 관전 밀도가 높고, 하루 길이는 리플레이보다 최소 2분 길어야 합니다.
                                        {lateGameClamped && <span className="text-amber-400"> 이 조합에서는 22:00·22:30 경기 시작이 하루 안에 끝나도록 앞당겨집니다(하루 길이를 늘리거나 리플레이를 줄이면 해소).</span>}
                                    </p>
                                </div>

                                <div>
                                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                                        tradeDeadlineEnabled ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={tradeDeadlineEnabled}
                                            onChange={e => setTradeDeadlineEnabled(e.target.checked)}
                                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                                        />
                                        <span className={`text-xs font-bold flex-1 ${tradeDeadlineEnabled ? 'text-white' : 'text-slate-400'}`}>트레이드 데드라인</span>
                                        <input
                                            type="date"
                                            value={tradeDeadlineDate}
                                            min={tradeDeadlineBounds.min}
                                            max={tradeDeadlineBounds.max}
                                            disabled={!tradeDeadlineEnabled}
                                            onChange={e => {
                                                tradeDeadlineTouchedRef.current = true;
                                                setTradeDeadlineDate(clampTradeDeadline(e.target.value, tradeDeadlineBounds));
                                            }}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        끄면 시즌 내내 트레이드가 무제한입니다. 기본값은 {tradeDeadlineBounds.default}(2월 둘째 주 목요일)이며, 이 날짜보다 늦출 수는 없고 최대 한 달 전({tradeDeadlineBounds.min})까지만 앞당길 수 있습니다.
                                    </p>
                                </div>

                                <div className={`rounded-xl px-3 py-2.5 space-y-1 border ${timelineFeasibility.feasible ? 'bg-slate-800/60 border-transparent' : 'bg-red-500/10 border-red-500/30'}`}>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500 ko-normal">가상 일수</span>
                                        <span className="text-slate-300 font-mono">{virtualCalendarDays}일 (정규 {virtualCalendarDays - playoffDays} + 플레이오프 최대 {playoffDays})</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500 ko-normal">실제 기간 / 하루당 가상 일수</span>
                                        <span className="text-slate-300 font-mono">{timelineFeasibility.realDays}일 / {timelineFeasibility.perDay}일</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-slate-500 ko-normal">일일 시뮬 시간대(계산)</span>
                                        <span className={`font-mono ${timelineFeasibility.feasible ? 'text-slate-300' : 'text-red-300'}`}>
                                            {windowStart} ~ {minToHHMM(Math.min(1440, timelineFeasibility.windowEndMin))}{timelineFeasibility.windowEndMin > 1440 ? ' (자정 초과)' : ''} · {Math.floor(timelineFeasibility.windowMin / 60)}시간 {timelineFeasibility.windowMin % 60}분
                                        </span>
                                    </div>
                                    {!timelineFeasibility.feasible && (
                                        <div className="text-[11px] text-red-300 ko-normal leading-relaxed pt-1">
                                            <p>이 설정으로는 세션을 구성할 수 없습니다. 아래 중 하나를 적용하세요.</p>
                                            <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                                {timelineFeasibility.suggestions.minEndDate && <li>종료일을 {timelineFeasibility.suggestions.minEndDate} 이후로</li>}
                                                {timelineFeasibility.suggestions.maxDayLengthMin && <li>가상 하루 길이를 {timelineFeasibility.suggestions.maxDayLengthMin}분 이하로</li>}
                                                {timelineFeasibility.suggestions.latestWindowStartMin != null && <li>시뮬 시간대 시작을 {minToHHMM(timelineFeasibility.suggestions.latestWindowStartMin)} 이전으로</li>}
                                            </ul>
                                        </div>
                                    )}
                                    <p className="text-[11px] text-slate-600 ko-normal pt-1">
                                        정규시즌이 끝나면 상위 8팀이 자동으로 플레이오프에 진출합니다.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── 3단: 드래프트 + 엔진 설정 ───────────────────────────────── */}
                    <div className="px-6 py-5 space-y-5 overflow-y-auto">

                        {/* 드래프트 설정 (공통) */}
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {isPersonalDraft ? '개인 팩 드래프트 설정' : '드래프트 설정'}
                        </p>

                        {!isPersonalDraft && <div className="grid grid-cols-2 gap-3">
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
                        </div>}

                        {/* 글로벌 풀 범위 — 개인 팩 드래프트에선 라운드별 하위범위의 상한선 역할(픽 순서·용량 표시는 숨김) */}
                        <DraftPoolSettings
                            ovrMin={draftOvrMin}
                            onOvrMinChange={setDraftOvrMin}
                            ovrMax={draftOvrMax}
                            onOvrMaxChange={setDraftOvrMax}
                            draftYearMin={draftYearMin}
                            onDraftYearMinChange={setDraftYearMin}
                            draftYearMax={draftYearMax}
                            onDraftYearMaxChange={setDraftYearMax}
                            draftFormat={draftFormat}
                            onDraftFormatChange={setDraftFormat}
                            useCustomOverrides={useCustomOverrides}
                            onUseCustomOverridesChange={setUseCustomOverrides}
                            teamCount={isPersonalDraft ? undefined : maxTeams}
                            totalRounds={isPersonalDraft ? undefined : totalRounds}
                            hideDraftOrder={isPersonalDraft}
                            ovrCap={isPersonalDraft ? PERSONAL_DRAFT_OVR_MAX : undefined}
                            contractMode={isPersonalDraft ? undefined : contractMode}
                            seasonStartYear={virtualSeasonYear}
                            rookieClassYear={draftYearMax}
                        />

                        {/* [2026-09-22] 드래프트 계약 생성 규칙 — 공유풀 드래프트 전용(개인 팩 드래프트는 카드 리그라 무관).
                            캡 금액은 생성 시점에 리그 설정 기본값(2026-27 공식 수치)으로 표시하고, 실제 생성은 finalize가
                            리그의 salary_cap_amount로 계산한다. */}
                        {!isPersonalDraft && (
                            <DraftSalaryScaleSettings
                                contractMode={contractMode}
                                onContractModeChange={setContractMode}
                                scale={draftSalaryScale}
                                onScaleChange={setDraftSalaryScale}
                                totalRounds={totalRounds}
                                teamCount={maxTeams}
                                salaryCap={CREATE_CAP_DEFAULTS.salaryCap}
                                taxPct={CREATE_CAP_DEFAULTS.tax / CREATE_CAP_DEFAULTS.salaryCap * 100}
                                apron1Pct={CREATE_CAP_DEFAULTS.apron1 / CREATE_CAP_DEFAULTS.salaryCap * 100}
                                apron2Pct={CREATE_CAP_DEFAULTS.apron2 / CREATE_CAP_DEFAULTS.salaryCap * 100}
                                draftYearMin={draftYearMin}
                            />
                        )}

                        {isPersonalDraft && (
                            <PersonalDraftFormatEditor
                                rounds={personalRounds}
                                onRoundsChange={setPersonalRounds}
                                pickTimerSec={personalTimer}
                                onPickTimerSecChange={setPersonalTimer}
                                collectionWeights={personalCollectionWeights}
                                onCollectionWeightsChange={setPersonalCollectionWeights}
                                positionTargets={personalPositionTargets}
                                onPositionTargetsChange={setPersonalPositionTargets}
                                globalOvrMin={draftOvrMin}
                                globalOvrMax={draftOvrMax}
                                globalDraftYearMin={draftYearMin}
                                globalDraftYearMax={draftYearMax}
                                useCustomOverrides={useCustomOverrides}
                            />
                        )}

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
