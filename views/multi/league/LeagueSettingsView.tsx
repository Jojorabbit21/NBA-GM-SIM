
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Save, Loader2, AlertCircle, CalendarDays,
    Clock, Users, Shield, Trash2, RotateCcw, Trophy, Activity, DollarSign,
    ArrowLeftRight, Wallet, Info, Crown, ClipboardList,
} from 'lucide-react';
import { TabBar } from '../../../components/common/TabBar';
import { useLeagueContext } from './LeagueLayout';
import { updateLeagueSettings, leaveLeague, runDraftLottery, startDraft, resetTournament, updateTeamName, getRoomMemberEmails } from '../../../services/multi/leagueService';
import { supabase } from '../../../services/supabaseClient';
import { useGame } from '../../../hooks/useGameContext';
import { listDraftPicks, type LeagueTeamRow, type DraftPickRow } from '../../../services/multi/roomQueries';
import { DraftPoolSettings, type PoolType, type DraftFormat } from '../../../components/multi/DraftPoolSettings';
import { DEFAULT_SIM_SETTINGS, NORMALIZATION_LEVELS, DEFAULT_NORMALIZATION_LEVEL } from '../../../types/simSettings';
import { clearGameLeadersCache } from '../../../services/multi/gameLeadersCache';
import { getReadableTextColor } from '../../../utils/colorContrast';

function normalizationOverrideToLevel(normOverride: { enabled?: boolean; k?: number } | undefined): number {
    if (normOverride?.enabled === false) return 0;
    const k = normOverride?.k;
    if (k === undefined) return DEFAULT_NORMALIZATION_LEVEL;
    let closest = DEFAULT_NORMALIZATION_LEVEL, minDiff = Infinity;
    for (let i = 1; i < NORMALIZATION_LEVELS.length; i++) {
        const diff = Math.abs(NORMALIZATION_LEVELS[i].k - k);
        if (diff < minDiff) { minDiff = diff; closest = i; }
    }
    return closest;
}

// 2026-27 시즌 NBA 공식 발표 수치(2026-06 기준) — 신규 리그 DB 기본값과 동일하게 맞춤.
const CAP_DEFAULTS = {
    salaryCapAmount:   164_961_000,
    luxuryTaxAmount:   200_428_000,
    apron1Amount:      209_015_000,
    apron2Amount:      221_686_000,
    salaryFloorAmount: 148_465_000,
};

// 참가일시 표시(항상 KST 벽시계 시각 기준 — 이 파일의 다른 날짜 표시와 동일 규칙).
function fmtJoinedAt(iso: string | null | undefined): string {
    if (!iso) return '—';
    const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
    const y  = kst.getUTCFullYear();
    const m  = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(kst.getUTCDate()).padStart(2, '0');
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mm = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${y}.${m}.${d} ${hh}:${mm}`;
}

// 이 앱은 KST(UTC+9)를 기본 시간대로 고정한다 — 브라우저의 실제 로컬 타임존(해외 접속,
// 서버 환경 등)과 무관하게 항상 KST 벽시계 시각을 기준으로 표시/저장해야 하므로
// Date.getTimezoneOffset()(런타임의 로컬 타임존)에 의존하지 않고 오프셋을 직접 고정한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ISO datetime(UTC) → datetime-local input 값(항상 KST 벽시계 시각 기준)
function toInputValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}
// datetime-local(KST 벽시계 시각으로 해석) → ISO (UTC), rounded up to nearest 5-minute boundary
function toIso(local: string): string | null {
    if (!local) return null;
    const ms = new Date(`${local}:00Z`).getTime() - KST_OFFSET_MS;
    const fiveMin = 5 * 60 * 1000;
    return new Date(Math.ceil(ms / fiveMin) * fiveMin).toISOString();
}


// ── 설정 탭 카테고리 ──────────────────────────────────────────────────────────

type SettingsTabId = 'league' | 'draft' | 'trade' | 'cap' | 'finance' | 'engine';

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
    { id: 'league',  label: '리그' },
    { id: 'draft',   label: '드래프트' },
    { id: 'trade',   label: '트레이드' },
    { id: 'cap',     label: '샐러리캡' },
    { id: 'finance', label: '재정' },
    { id: 'engine',  label: '엔진' },
];

// 리그 탭 좌측 "리그 정보" 요약 카드의 라벨-값 한 줄.
const InfoRow: React.FC<{ label: string; value: string; muted?: boolean }> = ({ label, value, muted }) => (
    <div className="flex justify-between text-xs py-1">
        <span className="text-slate-500 ko-normal">{label}</span>
        <span className={`font-mono ${muted ? 'text-slate-600' : 'text-slate-300'}`}>{value}</span>
    </div>
);

// ── LeagueSettingsView ────────────────────────────────────────────────────────

const LeagueSettingsView: React.FC = () => {
    const navigate              = useNavigate();
    const { leagueId }          = useParams<{ leagueId: string }>();
    const { session }           = useGame();
    const { league, room, members, leagueTeams, isLoading, error, reload } = useLeagueContext();

    const userId      = session?.user?.id ?? null;
    const isAdmin     = !!(league && userId && league.admin_user_id === userId);
    const isInProgress = league?.status === 'in_progress';

    // ── form state ────────────────────────────────────────────────────────────
    const [nameInput,    setNameInput]    = useState('');
    const [lotteryAt,         setLotteryAt]         = useState('');
    const [draftAt,           setDraftAt]           = useState('');
    const [tournamentStartAt, setTournamentStartAt] = useState('');
    const [pickSec,      setPickSec]      = useState(30);
    const [totalRounds,  setTotalRounds]  = useState(10);
    const [autoPickAfterMisses, setAutoPickAfterMisses] = useState(1);
    const [maxTeams,     setMaxTeams]     = useState(8);
    const [draftPools,        setDraftPools]        = useState<PoolType[]>(['standard']);
    const [draftOvrMin,       setDraftOvrMin]       = useState(0);
    const [draftOvrMax,       setDraftOvrMax]       = useState(99);
    const [draftFormat,       setDraftFormat]       = useState<DraftFormat>('snake');
    const [matchFormat,      setMatchFormat]      = useState('best_of_1');
    const [finalsMatchFormat, setFinalsMatchFormat] = useState('best_of_1');
    const [tournamentIntervalMin, setTournamentIntervalMin] = useState(30);
    const [playoffTeamsPerConf, setPlayoffTeamsPerConf] = useState(8);
    const [playInEnabled,        setPlayInEnabled]       = useState(true);
    const [injuriesEnabled,    setInjuriesEnabled]    = useState(DEFAULT_SIM_SETTINGS.injuriesEnabled);
    const [injuryFrequency,      setInjuryFrequency]      = useState(DEFAULT_SIM_SETTINGS.injuryFrequency);
    const [majorInjuryFrequency, setMajorInjuryFrequency] = useState(DEFAULT_SIM_SETTINGS.majorInjuryFrequency);
    const [suspensionsEnabled,  setSuspensionsEnabled]  = useState(DEFAULT_SIM_SETTINGS.suspensionsEnabled);
    const [suspensionFrequency, setSuspensionFrequency] = useState(DEFAULT_SIM_SETTINGS.suspensionFrequency);
    const [garbageTimeEnabled, setGarbageTimeEnabled] = useState(DEFAULT_SIM_SETTINGS.garbageTimeEnabled);
    const [normalizationLevel, setNormalizationLevel] = useState(DEFAULT_NORMALIZATION_LEVEL);
    const [saving,      setSaving]      = useState(false);
    const [saveOk,      setSaveOk]      = useState(false);
    const [saveErr,     setSaveErr]     = useState<string | null>(null);
    const [activeTab,   setActiveTab]   = useState<SettingsTabId>('league');

    // ── 리그 탭 통합 저장(이름 + 참가팀 수 + 플레이오프 형식) 상태 ──────────────
    const [savingLeague,  setSavingLeague]  = useState(false);
    const [saveLeagueOk,  setSaveLeagueOk]  = useState(false);
    const [saveLeagueErr, setSaveLeagueErr] = useState<string | null>(null);

    // ── 샐러리캡 설정(관리자 전용) — 마스터 스위치(capEnabled) + 세부 항목 5개(각각 개별 on/off + 금액) ──
    const [capEnabled,         setCapEnabled]         = useState(true);
    const [salaryCapAmount,    setSalaryCapAmount]    = useState(CAP_DEFAULTS.salaryCapAmount);
    const [luxuryTaxEnabled,   setLuxuryTaxEnabled]   = useState(true);
    const [luxuryTaxAmount,    setLuxuryTaxAmount]    = useState(CAP_DEFAULTS.luxuryTaxAmount);
    const [apron1Enabled,      setApron1Enabled]      = useState(true);
    const [apron1Amount,       setApron1Amount]       = useState(CAP_DEFAULTS.apron1Amount);
    const [apron2Enabled,      setApron2Enabled]      = useState(true);
    const [apron2Amount,       setApron2Amount]       = useState(CAP_DEFAULTS.apron2Amount);
    const [salaryFloorEnabled, setSalaryFloorEnabled] = useState(true);
    const [salaryFloorAmount, setSalaryFloorAmount]   = useState(CAP_DEFAULTS.salaryFloorAmount);
    const [savingCap,  setSavingCap]  = useState(false);
    const [saveCapOk,  setSaveCapOk]  = useState(false);
    const [saveCapErr, setSaveCapErr] = useState<string | null>(null);

    // ── 엔진 설정(관리자 전용) 저장 상태 — 스케줄 저장과 독립적으로 진행 중 세션에서도 변경 가능 ──
    const [savingSim,  setSavingSim]  = useState(false);
    const [saveSimOk,  setSaveSimOk]  = useState(false);
    const [saveSimErr, setSaveSimErr] = useState<string | null>(null);

    // ── 트레이드 설정(관리자 전용) — sim_settings에 함께 저장, 엔진 설정과 독립 저장 ──
    const [tradeMinValueRatio,      setTradeMinValueRatio]      = useState(DEFAULT_SIM_SETTINGS.tradeMinValueRatio);
    const [cpuTradeBaseProbability, setCpuTradeBaseProbability] = useState(DEFAULT_SIM_SETTINGS.cpuTradeBaseProbability);
    const [savingTrade,  setSavingTrade]  = useState(false);
    const [saveTradeOk,  setSaveTradeOk]  = useState(false);
    const [saveTradeErr, setSaveTradeErr] = useState<string | null>(null);


    // ── lottery state ─────────────────────────────────────────────────────────
    const [lotteryRunning, setLotteryRunning] = useState(false);
    const [lotteryErr,     setLotteryErr]     = useState<string | null>(null);
    const lotteryDone = leagueTeams.some(t => t.draft_order !== null);

    // ── 드래프트 즉시 시작 상태 — 추첨 완료 후 예정 시각 전에 어드민이 수동으로 시작 ──────
    const [draftStarting, setDraftStarting] = useState(false);
    const [draftStartErr, setDraftStartErr] = useState<string | null>(null);

    // ── kick state ────────────────────────────────────────────────────────────
    const [kickingId, setKickingId] = useState<string | null>(null);

    // ── 팀 이름 편집 상태(어드민 전용, 팀 목록 인라인) ──────────────────────────
    const [teamNameDrafts,   setTeamNameDrafts]   = useState<Record<string, string>>({});
    const [savingTeamNameId, setSavingTeamNameId] = useState<string | null>(null);
    const [teamNameErrs,     setTeamNameErrs]     = useState<Record<string, string>>({});

    // ── 멤버 이메일(어드민 전용 RPC로 조회, user_id → email) ────────────────────
    const [memberEmails, setMemberEmails] = useState<Record<string, string>>({});

    // ── 드래프트 결과(draft_picks 테이블, "드래프트" 탭 결과 조회용) ────────────
    const [draftPicks, setDraftPicks] = useState<DraftPickRow[]>([]);

    // ── reset state ───────────────────────────────────────────────────────────
    const [resetConfirm,  setResetConfirm]  = useState(false);
    const [resetting,     setResetting]     = useState(false);
    const [resetErr,      setResetErr]      = useState<string | null>(null);

    // 같은 league.id면 재초기화 하지 않음 — Realtime reload() 시 폼 덮어쓰기 방지
    const initializedLeagueIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!league) return;
        if (initializedLeagueIdRef.current === league.id) return;
        initializedLeagueIdRef.current = league.id;
        setNameInput(league.name);
        setLotteryAt(toInputValue(league.lottery_scheduled_at));
        setDraftAt(toInputValue(league.draft_scheduled_at));
        setTournamentStartAt(toInputValue((league as any).tournament_start_at));
        setPickSec(league.draft_pick_duration_sec ?? 30);
        setTotalRounds(league.draft_total_rounds ?? 10);
        setAutoPickAfterMisses(league.draft_auto_pick_after_misses ?? 1);
        setMaxTeams(league.max_teams ?? 8);
        const rawPool = league.draft_pool ?? 'standard';
        const validTypes: PoolType[] = ['standard', 'alltime', 'rookies'];
        const parsed = rawPool.split(',').map((s: string) => s.trim()).filter((s: string) => validTypes.includes(s as PoolType)) as PoolType[];
        setDraftPools(parsed.length > 0 ? parsed : ['standard']);
        setDraftOvrMin(league.draft_ovr_min ?? 0);
        setDraftOvrMax(league.draft_ovr_max ?? 99);
        setDraftFormat((league.draft_pool_strategy ?? 'snake') as DraftFormat);
        setMatchFormat(league.match_format ?? 'best_of_1');
        setFinalsMatchFormat(league.finals_match_format ?? league.match_format ?? 'best_of_1');
        const gprd = (league as any).games_per_real_day ?? 48;
        setTournamentIntervalMin(Math.round(1440 / gprd));
        setPlayoffTeamsPerConf(league.playoff_team_count ?? 8);
        setPlayInEnabled(league.play_in_enabled ?? true);
        setInjuriesEnabled(room?.sim_settings?.injuriesEnabled ?? DEFAULT_SIM_SETTINGS.injuriesEnabled);
        setInjuryFrequency(room?.sim_settings?.injuryFrequency ?? DEFAULT_SIM_SETTINGS.injuryFrequency);
        setMajorInjuryFrequency(room?.sim_settings?.majorInjuryFrequency ?? DEFAULT_SIM_SETTINGS.majorInjuryFrequency);
        setSuspensionsEnabled(room?.sim_settings?.suspensionsEnabled ?? DEFAULT_SIM_SETTINGS.suspensionsEnabled);
        setSuspensionFrequency(room?.sim_settings?.suspensionFrequency ?? DEFAULT_SIM_SETTINGS.suspensionFrequency);
        setGarbageTimeEnabled(room?.sim_settings?.garbageTimeEnabled ?? DEFAULT_SIM_SETTINGS.garbageTimeEnabled);
        setNormalizationLevel(normalizationOverrideToLevel(room?.sim_settings?.normalization));
        setTradeMinValueRatio(room?.sim_settings?.tradeMinValueRatio ?? DEFAULT_SIM_SETTINGS.tradeMinValueRatio);
        setCpuTradeBaseProbability(room?.sim_settings?.cpuTradeBaseProbability ?? DEFAULT_SIM_SETTINGS.cpuTradeBaseProbability);
        setCapEnabled((league as any).cap_enabled ?? true);
        setSalaryCapAmount((league as any).salary_cap_amount ?? CAP_DEFAULTS.salaryCapAmount);
        setLuxuryTaxEnabled((league as any).luxury_tax_enabled ?? true);
        setLuxuryTaxAmount((league as any).luxury_tax_amount ?? CAP_DEFAULTS.luxuryTaxAmount);
        setApron1Enabled((league as any).apron1_enabled ?? true);
        setApron1Amount((league as any).apron1_amount ?? CAP_DEFAULTS.apron1Amount);
        setApron2Enabled((league as any).apron2_enabled ?? true);
        setApron2Amount((league as any).apron2_amount ?? CAP_DEFAULTS.apron2Amount);
        setSalaryFloorEnabled((league as any).salary_floor_enabled ?? true);
        setSalaryFloorAmount((league as any).salary_floor_amount ?? CAP_DEFAULTS.salaryFloorAmount);
    }, [league]);

    // 비어드민 접근 차단
    useEffect(() => {
        if (!isLoading && league && !isAdmin) {
            navigate(`/multi/leagues/${leagueId}/season`, { replace: true });
        }
    }, [isLoading, league, isAdmin, leagueId, navigate]);

    // 팀 목록의 이메일 컬럼용 — 어드민 확정 후 room.id 기준으로 한 번 조회.
    useEffect(() => {
        if (!isAdmin || !room?.id) return;
        let cancelled = false;
        getRoomMemberEmails(room.id).then(({ data, error }) => {
            if (!cancelled && !error) setMemberEmails(data);
        });
        return () => { cancelled = true; };
    }, [isAdmin, room?.id]);

    // "드래프트" 탭 결과 테이블용 — room.id 기준으로 한 번 조회(드래프트 진행 중엔
    // 실시간 반영 없음, 완료된 픽 결과 조회 용도라 폴링/구독 없이 마운트 시 1회로 충분).
    useEffect(() => {
        if (!isAdmin || !room?.id) return;
        let cancelled = false;
        listDraftPicks(room.id).then(picks => {
            if (!cancelled) setDraftPicks(picks);
        });
        return () => { cancelled = true; };
    }, [isAdmin, room?.id]);

    // 리그 탭 통합 저장 — 이름 + 참가팀 수 + (메인리그·플레이오프 시작 전이면) 플레이오프 형식.
    // 예전엔 이름/플레이오프/참가팀수가 각자 다른 버튼(헤더 인라인/플레이오프 섹션/드래프트
    // 탭의 스케줄 저장)을 눌러야 반영됐는데, 탭 헤더 우측 저장 버튼 하나로 일원화하면서
    // "리그" 탭에 보이는 필드는 전부 이 함수 하나로 묶었다.
    const handleSaveLeagueTab = async () => {
        if (!league?.id) return;
        setSavingLeague(true);
        setSaveLeagueOk(false);
        setSaveLeagueErr(null);
        const trimmedName = nameInput.trim();
        const playoffEditable = league.type === 'main_league' && !league.bracket_data;
        const { error: err } = await updateLeagueSettings({
            leagueId: league.id,
            roomId: room?.id,
            ...(trimmedName && trimmedName !== league.name ? { name: trimmedName } : {}),
            maxTeams,
            ...(playoffEditable ? { playoffTeamCount: playoffTeamsPerConf, playInEnabled } : {}),
        });
        setSavingLeague(false);
        if (err) { setSaveLeagueErr(err); return; }
        setSaveLeagueOk(true);
        setTimeout(() => setSaveLeagueOk(false), 2000);
        reload();
    };


    const handleSave = async () => {
        if (!league?.id) return;
        setSaving(true);
        setSaveOk(false);
        setSaveErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId: league.id,
            lotteryScheduledAt:  toIso(lotteryAt),
            draftScheduledAt:    toIso(draftAt),
            tournamentStartAt:   toIso(tournamentStartAt),
            draftPickDurationSec: pickSec,
            draftTotalRounds:    totalRounds,
            draftAutoPickAfterMisses: autoPickAfterMisses,
            draftPool:         draftPools.join(','),
            draftPoolStrategy:    draftFormat,
            draftOvrMin,
            draftOvrMax,
            matchFormat,
            finalsMatchFormat:   finalsMatchFormat !== matchFormat ? finalsMatchFormat : null,
            ...(league?.type === 'tournament'
                ? { gamesPerRealDay: Math.round(1440 / Math.max(1, tournamentIntervalMin)) }
                : {}),
        });
        setSaving(false);
        if (err) { setSaveErr(err); return; }
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
        reload();
    };

    const handleSaveSimSettings = async () => {
        if (!league?.id) return;
        setSavingSim(true);
        setSaveSimOk(false);
        setSaveSimErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId: league.id,
            roomId: room?.id,
            simSettings: {
                ...DEFAULT_SIM_SETTINGS,
                ...(room?.sim_settings ?? {}),
                injuriesEnabled,
                injuryFrequency,
                majorInjuryFrequency,
                suspensionsEnabled,
                suspensionFrequency,
                garbageTimeEnabled,
                normalization: {
                    ...(room?.sim_settings?.normalization ?? {}),
                    enabled: NORMALIZATION_LEVELS[normalizationLevel].enabled,
                    k: NORMALIZATION_LEVELS[normalizationLevel].k,
                },
            },
        });
        setSavingSim(false);
        if (err) { setSaveSimErr(err); return; }
        setSaveSimOk(true);
        setTimeout(() => setSaveSimOk(false), 2000);
        reload();
    };

    const handleSaveTradeSettings = async () => {
        if (!league?.id) return;
        setSavingTrade(true);
        setSaveTradeOk(false);
        setSaveTradeErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId: league.id,
            roomId: room?.id,
            simSettings: {
                ...DEFAULT_SIM_SETTINGS,
                ...(room?.sim_settings ?? {}),
                tradeMinValueRatio,
                cpuTradeBaseProbability,
            },
        });
        setSavingTrade(false);
        if (err) { setSaveTradeErr(err); return; }
        setSaveTradeOk(true);
        setTimeout(() => setSaveTradeOk(false), 2000);
        reload();
    };

    const handleSaveCapSettings = async () => {
        if (!league?.id) return;
        setSavingCap(true);
        setSaveCapOk(false);
        setSaveCapErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId: league.id,
            capEnabled,
            salaryCapAmount,
            luxuryTaxEnabled,
            luxuryTaxAmount,
            apron1Enabled,
            apron1Amount,
            apron2Enabled,
            apron2Amount,
            salaryFloorEnabled,
            salaryFloorAmount,
        });
        setSavingCap(false);
        if (err) { setSaveCapErr(err); return; }
        setSaveCapOk(true);
        setTimeout(() => setSaveCapOk(false), 2000);
        reload();
    };

    // 폼 값만 기본값(2026-27 시즌 NBA 공식 수치)으로 되돌림 — on/off 여부는 건드리지 않고
    // 금액만 초기화, 실제 저장은 "저장" 버튼을 눌러야 반영됨.
    const handleResetCapDefaults = () => {
        setSalaryCapAmount(CAP_DEFAULTS.salaryCapAmount);
        setLuxuryTaxAmount(CAP_DEFAULTS.luxuryTaxAmount);
        setApron1Amount(CAP_DEFAULTS.apron1Amount);
        setApron2Amount(CAP_DEFAULTS.apron2Amount);
        setSalaryFloorAmount(CAP_DEFAULTS.salaryFloorAmount);
        setSaveCapOk(false);
        setSaveCapErr(null);
    };

    const handleRunLottery = async () => {
        if (!room || !userId || !league?.id) return;
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) { setLotteryErr('인증 정보를 가져올 수 없습니다.'); return; }
        setLotteryRunning(true);
        setLotteryErr(null);
        const { error: err } = await runDraftLottery(room.id, league.id, token);
        setLotteryRunning(false);
        if (err) { setLotteryErr(err); return; }
        reload();
    };

    // 예정 시각(draft_scheduled_at) 전이라도 어드민이 수동으로 드래프트를 즉시 시작 —
    // 서버(handleStartDraft)가 league.status==='recruiting'인지, 방이 이미 활성화됐는지
    // 재검증하므로 여기서는 lotteryDone 여부만 미리 걸러 불필요한 요청을 막는다.
    const handleStartDraft = async () => {
        if (!league?.id) return;
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) { setDraftStartErr('인증 정보를 가져올 수 없습니다.'); return; }
        setDraftStarting(true);
        setDraftStartErr(null);
        const { error: err } = await startDraft(league.id, token);
        setDraftStarting(false);
        if (err) { setDraftStartErr(err); return; }
        reload();
    };

    const handleReset = async () => {
        if (!league?.id || !room) return;
        setResetting(true);
        setResetErr(null);
        const { error: err, archiveEdition } = await resetTournament(league.id, room.id);
        setResetting(false);
        if (err) { setResetErr(err); return; }
        // 토너먼트 게임 ID(T_R{round}_M{matchIndex})는 위치 기반이라 리셋 후 같은 room.id로
        // 새 토너먼트를 시작하면 예전과 동일한 game_id가 재사용된다 — PTS/REB/AST 캐시가
        // 옛 경기 결과를 새 경기에 잘못 붙이지 않도록 리셋 시 반드시 같이 비운다.
        clearGameLeadersCache(room.id);
        setResetConfirm(false);
        // 아카이브 edition 정보 로그 (디버깅)
        console.log('[resetTournament] archive edition:', archiveEdition);
        reload();
        navigate(`/multi/leagues/${leagueId}/season`);
    };

    const handleKick = async (kickUserId: string) => {
        if (!room) return;
        setKickingId(kickUserId);
        await leaveLeague(room.id, kickUserId);
        setKickingId(null);
        reload();
    };

    const handleSaveTeamName = async (teamId: string) => {
        const draft = teamNameDrafts[teamId];
        const trimmed = draft?.trim();
        if (!trimmed) return;
        setSavingTeamNameId(teamId);
        setTeamNameErrs(prev => { const next = { ...prev }; delete next[teamId]; return next; });
        const { error: err } = await updateTeamName(teamId, trimmed);
        setSavingTeamNameId(null);
        if (err) {
            setTeamNameErrs(prev => ({ ...prev, [teamId]: err }));
            return;
        }
        setTeamNameDrafts(prev => { const next = { ...prev }; delete next[teamId]; return next; });
        reload();
    };

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
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 찾을 수 없습니다.'}</p>
            </div>
        );
    }

    const humanMembers = members.filter(m => !m.is_ai);

    // ── 리그 정보 요약(좌측 상단 카드)용 계산값 ──
    const seasonStartLabel = league.season_start_date
        ? new Date(`${league.season_start_date}T00:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
        : '—';
    const currentSeasonLabel = (() => {
        if (league.status === 'recruiting' || league.status === 'drafting') return '시작 전';
        if (!league.season_start_date) return '—';
        const days = Math.floor((Date.now() - new Date(`${league.season_start_date}T00:00:00`).getTime()) / 86_400_000) + 1;
        return `${Math.max(1, days)}일째 진행중`;
    })();
    const leagueTypeLabel = league.type === 'main_league'
        ? `메인리그${league.tier ? ` · ${league.tier.toUpperCase()}` : ''}`
        : '토너먼트';
    // single_elim 토너먼트는 결승까지 브라켓 방식이라 "플레이오프 있음"으로 취급, round_robin은 없음.
    const hasPlayoff = league.type === 'main_league' || league.tournament_format === 'single_elim';

    // ── 탭별 dirty 여부 — 헤더 통합 저장 버튼의 활성화 조건 + 탭 전환 시 "저장 안 됨" 확인용.
    // 각 비교식은 위 초기화 useEffect가 state를 채울 때 쓴 소스 표현식과 반드시 동일해야
    // "저장 직후 dirty가 false로 떨어짐"이 보장된다(둘이 어긋나면 저장해도 계속 dirty로 보임).
    const isNameDirty = nameInput.trim() !== '' && nameInput.trim() !== league.name;
    const isMaxTeamsDirty = maxTeams !== (league.max_teams ?? 8);
    const playoffEditable = league.type === 'main_league' && !league.bracket_data;
    const isPlayoffDirty = playoffEditable && (
        playoffTeamsPerConf !== (league.playoff_team_count ?? 8) ||
        playInEnabled !== (league.play_in_enabled ?? true)
    );
    const isLeagueTabDirty = isNameDirty || isMaxTeamsDirty || isPlayoffDirty;

    const sourceDraftPools = (() => {
        const rawPool = league.draft_pool ?? 'standard';
        const validTypes: PoolType[] = ['standard', 'alltime', 'rookies'];
        const parsed = rawPool.split(',').map((s: string) => s.trim()).filter((s: string) => validTypes.includes(s as PoolType)) as PoolType[];
        return parsed.length > 0 ? parsed : ['standard'];
    })();
    const isDraftTabDirty = !isInProgress && (
        lotteryAt !== toInputValue(league.lottery_scheduled_at) ||
        draftAt !== toInputValue(league.draft_scheduled_at) ||
        totalRounds !== (league.draft_total_rounds ?? 10) ||
        pickSec !== (league.draft_pick_duration_sec ?? 30) ||
        autoPickAfterMisses !== (league.draft_auto_pick_after_misses ?? 1) ||
        draftPools.join(',') !== sourceDraftPools.join(',') ||
        draftOvrMin !== (league.draft_ovr_min ?? 0) ||
        draftOvrMax !== (league.draft_ovr_max ?? 99) ||
        draftFormat !== (league.draft_pool_strategy ?? 'snake') ||
        (league.type === 'tournament' && (
            tournamentStartAt !== toInputValue((league as any).tournament_start_at) ||
            tournamentIntervalMin !== Math.round(1440 / Math.max(1, (league as any).games_per_real_day ?? 48)) ||
            matchFormat !== (league.match_format ?? 'best_of_1') ||
            finalsMatchFormat !== (league.finals_match_format ?? league.match_format ?? 'best_of_1')
        ))
    );

    const isTradeTabDirty =
        tradeMinValueRatio !== (room?.sim_settings?.tradeMinValueRatio ?? DEFAULT_SIM_SETTINGS.tradeMinValueRatio) ||
        cpuTradeBaseProbability !== (room?.sim_settings?.cpuTradeBaseProbability ?? DEFAULT_SIM_SETTINGS.cpuTradeBaseProbability);

    const isCapTabDirty =
        capEnabled !== ((league as any).cap_enabled ?? true) ||
        salaryCapAmount !== ((league as any).salary_cap_amount ?? CAP_DEFAULTS.salaryCapAmount) ||
        luxuryTaxEnabled !== ((league as any).luxury_tax_enabled ?? true) ||
        luxuryTaxAmount !== ((league as any).luxury_tax_amount ?? CAP_DEFAULTS.luxuryTaxAmount) ||
        apron1Enabled !== ((league as any).apron1_enabled ?? true) ||
        apron1Amount !== ((league as any).apron1_amount ?? CAP_DEFAULTS.apron1Amount) ||
        apron2Enabled !== ((league as any).apron2_enabled ?? true) ||
        apron2Amount !== ((league as any).apron2_amount ?? CAP_DEFAULTS.apron2Amount) ||
        salaryFloorEnabled !== ((league as any).salary_floor_enabled ?? true) ||
        salaryFloorAmount !== ((league as any).salary_floor_amount ?? CAP_DEFAULTS.salaryFloorAmount);

    const isEngineTabDirty =
        injuriesEnabled !== (room?.sim_settings?.injuriesEnabled ?? DEFAULT_SIM_SETTINGS.injuriesEnabled) ||
        injuryFrequency !== (room?.sim_settings?.injuryFrequency ?? DEFAULT_SIM_SETTINGS.injuryFrequency) ||
        majorInjuryFrequency !== (room?.sim_settings?.majorInjuryFrequency ?? DEFAULT_SIM_SETTINGS.majorInjuryFrequency) ||
        suspensionsEnabled !== (room?.sim_settings?.suspensionsEnabled ?? DEFAULT_SIM_SETTINGS.suspensionsEnabled) ||
        suspensionFrequency !== (room?.sim_settings?.suspensionFrequency ?? DEFAULT_SIM_SETTINGS.suspensionFrequency) ||
        garbageTimeEnabled !== (room?.sim_settings?.garbageTimeEnabled ?? DEFAULT_SIM_SETTINGS.garbageTimeEnabled) ||
        normalizationLevel !== normalizationOverrideToLevel(room?.sim_settings?.normalization);

    type TabSaveInfo = { dirty: boolean; saving: boolean; ok: boolean; err: string | null; onSave: () => void };
    const TAB_SAVE_MAP: Partial<Record<SettingsTabId, TabSaveInfo>> = {
        league: { dirty: isLeagueTabDirty, saving: savingLeague, ok: saveLeagueOk, err: saveLeagueErr, onSave: handleSaveLeagueTab },
        draft:  { dirty: isDraftTabDirty,  saving: saving,       ok: saveOk,       err: saveErr,       onSave: handleSave },
        trade:  { dirty: isTradeTabDirty,  saving: savingTrade,  ok: saveTradeOk,  err: saveTradeErr,  onSave: handleSaveTradeSettings },
        cap:    { dirty: isCapTabDirty,    saving: savingCap,    ok: saveCapOk,    err: saveCapErr,    onSave: handleSaveCapSettings },
        engine: { dirty: isEngineTabDirty, saving: savingSim,    ok: saveSimOk,    err: saveSimErr,    onSave: handleSaveSimSettings },
    };
    const activeSaveInfo = TAB_SAVE_MAP[activeTab] ?? null;

    // 탭을 옮기기 전에 현재 탭에 저장 안 된 변경사항이 있으면 한 번 더 확인.
    const handleTabChange = (tab: SettingsTabId) => {
        if (activeSaveInfo?.dirty) {
            const proceed = window.confirm('저장하지 않은 변경사항이 있습니다. 다른 탭으로 이동하시겠습니까?');
            if (!proceed) return;
        }
        setActiveTab(tab);
    };

    const memberListPanel = (
        <section className="space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={14} className="text-slate-400" />
                팀 목록
                <span className="text-xs font-normal text-slate-500 ml-1">
                    {leagueTeams.length}팀 · 인간 GM {humanMembers.length}명
                </span>
            </h2>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="px-2 py-2 text-left text-xs font-bold text-slate-500">팀</th>
                            <th className="px-2 py-2 text-left text-xs font-bold text-slate-500">GM</th>
                            <th className="px-2 py-2 text-left text-xs font-bold text-slate-500">이메일</th>
                            <th className="px-2 py-2 text-left text-xs font-bold text-slate-500">참가일시</th>
                            <th className="px-2 py-2 text-center text-xs font-bold text-slate-500">드래프트 오더</th>
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {leagueTeams.map(t => {
                            const isHuman = !t.is_ai && t.user_id !== null;
                            const isMe    = t.user_id === userId;
                            const joinedAt = isHuman ? members.find(m => m.user_id === t.user_id)?.joined_at ?? null : null;
                            const nameDraft = teamNameDrafts[t.id];
                            const nameDirty = nameDraft !== undefined && nameDraft.trim() !== '' && nameDraft.trim() !== t.team_name;
                            return (
                                <tr key={t.id}>
                                    {/* 팀 (편집 가능) */}
                                    <td className="px-2 py-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={nameDraft ?? t.team_name}
                                                onChange={e => setTeamNameDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                                                maxLength={40}
                                                disabled={league.status === 'drafting'}
                                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500 text-sm font-bold text-white transition-colors min-w-0 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                            {nameDirty && (
                                                <button
                                                    onClick={() => handleSaveTeamName(t.id)}
                                                    disabled={savingTeamNameId === t.id}
                                                    className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-[10px] font-bold text-white transition-colors shrink-0"
                                                >
                                                    {savingTeamNameId === t.id
                                                        ? <Loader2 size={10} className="animate-spin" />
                                                        : <Save size={10} />
                                                    }
                                                </button>
                                            )}
                                        </div>
                                        {teamNameErrs[t.id] && (
                                            <p className="text-[10px] text-red-400 ko-normal mt-0.5">{teamNameErrs[t.id]}</p>
                                        )}
                                    </td>

                                    {/* GM (어드민이면 닉네임 우측에 왕관 아이콘) */}
                                    <td className="px-2 py-2">
                                        <div className="flex items-center gap-1.5">
                                            {isHuman
                                                ? <span className="text-xs text-slate-300 ko-normal">{t.nickname ?? '선점됨'}</span>
                                                : <span className="text-xs text-slate-600">AI</span>
                                            }
                                            {t.user_id === league.admin_user_id && (
                                                <Crown size={11} className="text-amber-400 shrink-0" />
                                            )}
                                        </div>
                                    </td>

                                    {/* 이메일 */}
                                    <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap">
                                        {isHuman ? (memberEmails[t.user_id!] ?? '—') : '—'}
                                    </td>

                                    {/* 참가일시 */}
                                    <td className="px-2 py-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                                        {fmtJoinedAt(joinedAt)}
                                    </td>

                                    {/* 드래프트 오더 (단순 텍스트) */}
                                    <td className="px-2 py-2 text-center text-xs font-bold">
                                        {t.draft_order !== null
                                            ? <span className="text-amber-400">#{t.draft_order}</span>
                                            : <span className="text-slate-700">—</span>
                                        }
                                    </td>

                                    {/* 추방 — AI 팀/본인도 버튼은 항상 노출, 클릭만 불가 */}
                                    <td className="px-2 py-2 text-right">
                                        {(() => {
                                            const canKick = isHuman && !isMe && !!room;
                                            // kickingId 기본값(null)과 AI 팀의 t.user_id(역시 null)가
                                            // 우연히 같아서 `kickingId === t.user_id`만 쓰면 AI 팀 행에서
                                            // 로더가 항상 켜진 것처럼 보인다 — null 여부를 먼저 걸러야 함.
                                            const isKickingThis = kickingId !== null && kickingId === t.user_id;
                                            return (
                                                <button
                                                    onClick={() => canKick && handleKick(t.user_id!)}
                                                    disabled={!canKick || isKickingThis}
                                                    className="flex items-center gap-1 px-2 py-1 bg-red-600/10 hover:bg-red-600/30 text-red-500 hover:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-30 disabled:hover:bg-red-600/10 disabled:cursor-not-allowed ml-auto"
                                                >
                                                    {isKickingThis
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : <Trash2 size={11} />
                                                    }
                                                    추방
                                                </button>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">

            <TabBar
                tabs={SETTINGS_TABS}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                rightSlot={activeSaveInfo && (
                    <>
                        {activeSaveInfo.err && <span className="text-xs text-red-400 ko-normal">{activeSaveInfo.err}</span>}
                        <button
                            onClick={activeSaveInfo.onSave}
                            disabled={!activeSaveInfo.dirty || activeSaveInfo.saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors"
                        >
                            {activeSaveInfo.saving
                                ? <><Loader2 size={12} className="animate-spin" />저장 중…</>
                                : activeSaveInfo.ok
                                ? '저장됨 ✓'
                                : <><Save size={12} />저장</>
                            }
                        </button>
                    </>
                )}
            />

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 space-y-6">

            {/* ── 세션 진행 중 안내 ────────────────────────────────────────────── */}
            {isInProgress && (
                <section className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-5 py-4">
                    <p className="text-xs text-indigo-300 ko-normal leading-relaxed">
                        세션이 진행 중입니다. 팀 강퇴만 가능하며, 드래프트 및 일정 설정은 변경할 수 없습니다.
                    </p>
                </section>
            )}

            {/* ── 리그 (좌: 제너럴 설정 / 우: 멤버) ────────────────────────────── */}
            {activeTab === 'league' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* 좌측: 리그 제너럴 설정 */}
                    <div className="space-y-6">
                        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
                            <div>
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    maxLength={40}
                                    className="text-xl font-black text-white ko-tight bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 transition-colors w-full"
                                />
                                <p className="text-xs text-slate-500 ko-normal mt-0.5">세션 설정 — 어드민 전용</p>
                            </div>

                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Info size={14} className="text-indigo-400" />
                                리그 정보
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 bg-slate-900/60 rounded-xl p-4">
                                <InfoRow label="시작 시즌" value={seasonStartLabel} />
                                <InfoRow label="현재 시즌" value={currentSeasonLabel} />
                                <InfoRow label="리그 유형" value={leagueTypeLabel} />
                                <InfoRow label="플레이오프 여부" value={hasPlayoff ? '있음' : '없음'} />
                                <InfoRow
                                    label="플레이인 토너먼트 여부"
                                    value={league.type === 'main_league' ? (playInEnabled ? '켜짐' : '꺼짐') : '해당없음'}
                                />
                                <InfoRow
                                    label="플레이오프 진출팀 수"
                                    value={league.type === 'main_league' ? `컨퍼런스당 ${playoffTeamsPerConf}팀` : '해당없음'}
                                />
                                <InfoRow
                                    label="플레이인 진출팀 수"
                                    value={league.type === 'main_league' && playInEnabled ? '4팀 (7~10위)' : '해당없음'}
                                />
                                <InfoRow label="올스타 경기" value="미구현" muted />
                                <InfoRow label="정규시즌 수상" value="상시 활성 (토글 미지원)" muted />
                                <InfoRow label="부상" value={injuriesEnabled ? '켜짐' : '꺼짐'} />
                                <InfoRow label="출전정지" value={suspensionsEnabled ? '켜짐' : '꺼짐'} />
                                <InfoRow label="샐러리캡" value={capEnabled ? '켜짐' : '꺼짐'} />
                            </div>
                        </section>

                        {!isInProgress && (
                            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Users size={14} className="text-indigo-400" />
                                    참가팀 수
                                </h2>
                                <div className="flex gap-2 flex-wrap">
                                    {(league.type === 'tournament' ? [4, 8, 16, 32, 64] : [10, 20, 30]).map(n => {
                                        const tooSmall = n < humanMembers.length;
                                        return (
                                            <button
                                                key={n}
                                                onClick={() => !tooSmall && setMaxTeams(n)}
                                                disabled={tooSmall}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                    maxTeams === n
                                                        ? 'bg-indigo-600 text-white'
                                                        : tooSmall
                                                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                {n}팀
                                            </button>
                                        );
                                    })}
                                </div>
                                {humanMembers.length > 0 && (
                                    <p className="text-xs text-slate-500 ko-normal">
                                        현재 참가 인원 {humanMembers.length}명 이상으로만 설정 가능
                                    </p>
                                )}
                            </section>
                        )}

                        {league.status === 'finished' && (
                            <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Trophy size={14} className="text-emerald-400" />
                                    <h2 className="text-sm font-bold text-emerald-300 ko-tight">토너먼트 종료</h2>
                                    <span className="text-xs text-emerald-500/70 ko-normal ml-auto">기록 자동 저장 완료</span>
                                </div>

                                <p className="text-xs text-slate-400 ko-normal leading-relaxed">
                                    토너먼트가 종료되었습니다. 모든 경기 기록과 선수 박스스코어가 히스토리에 저장되었습니다.
                                    세션을 초기화하면 드래프트부터 다시 시작할 수 있습니다.
                                </p>

                                {!resetConfirm ? (
                                    <button
                                        onClick={() => setResetConfirm(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white transition-colors"
                                    >
                                        <RotateCcw size={13} />
                                        기록 저장 &amp; 초기화
                                    </button>
                                ) : (
                                    <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
                                        <p className="text-sm font-bold text-white ko-tight">정말 초기화하시겠습니까?</p>
                                        <p className="text-xs text-slate-400 ko-normal">
                                            모든 로스터, 드래프트 오더, 경기 일정이 초기화됩니다.
                                            히스토리 기록은 유지됩니다.
                                        </p>
                                        {resetErr && (
                                            <p className="text-xs text-red-400 ko-normal">{resetErr}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleReset}
                                                disabled={resetting}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                                            >
                                                {resetting
                                                    ? <><Loader2 size={13} className="animate-spin" />초기화 중…</>
                                                    : <><RotateCcw size={13} />초기화 실행</>
                                                }
                                            </button>
                                            <button
                                                onClick={() => { setResetConfirm(false); setResetErr(null); }}
                                                disabled={resetting}
                                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-sm text-slate-300 transition-colors"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ── 플레이오프 형식 (관리자 전용, 플레이오프 시작 전까지 진행 중 세션에서도 변경 가능) ── */}
                        {league.type === 'main_league' && !league.bracket_data && (
                            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Trophy size={14} className="text-indigo-400" />
                                    플레이오프 형식
                                </h2>
                                <p className="text-xs text-slate-500 ko-normal">
                                    정규시즌이 끝나고 플레이오프 대진표가 만들어지기 전까지만 변경할 수 있습니다.
                                </p>

                                <div>
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-xs font-bold text-slate-300">컨퍼런스별 진출 팀 수</span>
                                        <input
                                            type="number"
                                            min={2}
                                            max={16}
                                            step={1}
                                            value={playoffTeamsPerConf}
                                            onChange={e => setPlayoffTeamsPerConf(Math.min(16, Math.max(2, Math.round(Number(e.target.value) || 0))))}
                                            className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1 px-1">
                                        동부/서부 각 컨퍼런스에서 몇 팀이 플레이오프에 진출할지 정합니다(리그 전체가 아닌 컨퍼런스당 인원).
                                    </p>
                                </div>

                                <label
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                                        playInEnabled ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={playInEnabled}
                                        onChange={e => setPlayInEnabled(e.target.checked)}
                                        className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <span className={`text-xs font-bold ${playInEnabled ? 'text-white' : 'text-slate-400'}`}>플레이인 토너먼트</span>
                                        <span className="ml-2 text-xs text-slate-500 ko-normal">
                                            켜면 상위 {Math.max(0, playoffTeamsPerConf - 2)}팀은 자동 진출, 나머지 4팀(7~10위)이 미니 토너먼트로 마지막 2자리를 다툽니다.
                                            끄면 컨퍼런스별 상위 {playoffTeamsPerConf}팀이 곧바로 진출합니다.
                                        </span>
                                    </div>
                                </label>
                            </section>
                        )}
                    </div>

                    {/* 우측: 멤버 설정 */}
                    <div>
                        {memberListPanel}
                    </div>
                </div>
            )}

            {/* ── 엔진 설정 (관리자 전용, 진행 중 세션에서도 변경 가능) ─────────── */}
            {activeTab === 'engine' && (
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" />
                    엔진 설정
                </h2>
                <p className="text-xs text-slate-500 ko-normal">
                    관리자만 변경할 수 있으며, 저장 즉시 이후 경기부터 적용됩니다.
                </p>

                <div className="space-y-2">
                    <label
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                            injuriesEnabled ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={injuriesEnabled}
                            onChange={e => setInjuriesEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                            <span className={`text-xs font-bold ${injuriesEnabled ? 'text-white' : 'text-slate-400'}`}>부상 시스템</span>
                            <span className="ml-2 text-xs text-slate-500 ko-normal">경기 중 부상 발생 활성화</span>
                        </div>
                    </label>

                    <div className="pl-1 space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-300">부상 빈도 배율</span>
                            <input
                                type="number"
                                min={0}
                                max={2}
                                step={0.1}
                                value={injuryFrequency}
                                onChange={e => setInjuryFrequency(Math.min(2, Math.max(0, Number(e.target.value) || 0)))}
                                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-300">중대 부상 비율</span>
                            <input
                                type="number"
                                min={0}
                                max={2}
                                step={0.1}
                                value={majorInjuryFrequency}
                                onChange={e => setMajorInjuryFrequency(Math.min(2, Math.max(0, Number(e.target.value) || 0)))}
                                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <p className="text-[11px] text-slate-600 ko-normal px-1">
                            부상 빈도는 전체 부상 발생 확률(1.0=기본), 중대 부상 비율은 그중 Major/Season-Ending
                            비중(1.0=기본, 0=전부 경미한 부상)을 조절합니다.
                        </p>
                    </div>

                    <label
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                            suspensionsEnabled ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={suspensionsEnabled}
                            onChange={e => setSuspensionsEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                            <span className={`text-xs font-bold ${suspensionsEnabled ? 'text-white' : 'text-slate-400'}`}>출장정지 시스템</span>
                            <span className="ml-2 text-xs text-slate-500 ko-normal">경기 중 다혈질 선수의 싸움/출장정지 이벤트 활성화</span>
                        </div>
                    </label>

                    <div className="pl-1">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-300">출장정지 빈도 배율</span>
                            <input
                                type="number"
                                min={0}
                                max={3}
                                step={0.1}
                                value={suspensionFrequency}
                                onChange={e => setSuspensionFrequency(Math.min(3, Math.max(0, Number(e.target.value) || 0)))}
                                className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <label
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                            garbageTimeEnabled ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={garbageTimeEnabled}
                            onChange={e => setGarbageTimeEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                            <span className={`text-xs font-bold ${garbageTimeEnabled ? 'text-white' : 'text-slate-400'}`}>가비지타임 자동 벤치</span>
                            <span className="ml-2 text-xs text-slate-500 ko-normal">Q4 대량 점수차 시 주전 자동 벤치 및 후보 투입</span>
                        </div>
                    </label>

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
                            0이면 정규화가 완전히 꺼집니다. 올타임 등 고OVR 드래프트 풀에서 득점이 비현실적으로 치솟는 걸 억제하는 기능이며, 1~5로 갈수록 표준 NBA 수준으로 강하게 압축됩니다.
                        </p>
                    </div>
                </div>
            </section>
            )}

            {/* ── 트레이드 설정 (관리자 전용, 진행 중 세션에서도 변경 가능) ─────── */}
            {activeTab === 'trade' && (
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <ArrowLeftRight size={14} className="text-amber-400" />
                    트레이드 설정
                </h2>
                <p className="text-xs text-slate-500 ko-normal">
                    CPU 트레이드 엔진의 판단 기준을 조절합니다. 저장 즉시 이후 트레이드 평가부터 적용됩니다.
                </p>

                <div>
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-300">트레이드 수락 기준</span>
                        <input
                            type="number"
                            min={0.70}
                            max={1.20}
                            step={0.05}
                            value={tradeMinValueRatio}
                            onChange={e => setTradeMinValueRatio(Math.min(1.20, Math.max(0.70, Number(e.target.value) || 0)))}
                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-amber-500"
                        />
                    </div>
                    <p className="text-[11px] text-slate-600 ko-normal mt-1 px-1">
                        상대 팀 자산 대비 최소 가치 비율(0.70~1.20, 기본 0.95). 낮을수록 CPU가 트레이드를 쉽게 수락합니다.
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-300">CPU 트레이드 확률</span>
                        <input
                            type="number"
                            min={0}
                            max={0.5}
                            step={0.05}
                            value={cpuTradeBaseProbability}
                            onChange={e => setCpuTradeBaseProbability(Math.min(0.5, Math.max(0, Number(e.target.value) || 0)))}
                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-amber-500"
                        />
                    </div>
                    <p className="text-[11px] text-slate-600 ko-normal mt-1 px-1">
                        CPU 팀 간 일일 트레이드 발생 기본 확률(0~0.5, 기본 0.15).
                    </p>
                </div>
            </section>
            )}

            {/* ── 재정 설정 (준비 중) ──────────────────────────────────────────── */}
            {activeTab === 'finance' && (
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Wallet size={14} className="text-emerald-400" />
                    재정 설정
                </h2>
                <p className="text-xs text-slate-500 ko-normal leading-relaxed">
                    리그 단위 재정 파라미터(예산 난이도, 출석·머천다이즈 수익 배율 등)는 아직 설정 화면에 노출되지 않았습니다.
                    현재 재정 엔진은 팀별로 자동 계산되며, 세션 단위 커스터마이징은 준비 중입니다.
                </p>
            </section>
            )}

            {/* ── 샐러리캡 설정 (관리자 전용, 진행 중 세션에서도 변경 가능) ─────────── */}
            {activeTab === 'cap' && (
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <DollarSign size={14} className="text-emerald-400" />
                    샐러리캡 설정
                </h2>
                <p className="text-xs text-slate-500 ko-normal">
                    마스터 스위치를 끄면 세부 항목과 무관하게 캡 전체가 비활성화됩니다. 현재는 값 저장만 하며, 트레이드 로직에는 아직 강제 적용되지 않습니다.
                </p>

                <label
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        capEnabled ? 'bg-emerald-600/20 border border-emerald-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
                    }`}
                >
                    <input
                        type="checkbox"
                        checked={capEnabled}
                        onChange={e => setCapEnabled(e.target.checked)}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                        <span className={`text-xs font-bold ${capEnabled ? 'text-white' : 'text-slate-400'}`}>샐러리캡 활성화</span>
                        <span className="ml-2 text-xs text-slate-500 ko-normal">전체 마스터 스위치</span>
                    </div>
                </label>

                <div className={`space-y-2 ${capEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-transparent">
                        <span className="text-xs font-bold text-slate-300">캡 금액</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={salaryCapAmount}
                                onChange={e => setSalaryCapAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                        luxuryTaxEnabled ? 'bg-emerald-600/20 border border-emerald-600/50' : 'bg-slate-900/60 border border-transparent'
                    }`}>
                        <input
                            type="checkbox"
                            checked={luxuryTaxEnabled}
                            onChange={e => setLuxuryTaxEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                        <span className={`text-xs font-bold flex-1 ${luxuryTaxEnabled ? 'text-white' : 'text-slate-400'}`}>사치세</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={luxuryTaxAmount}
                                onChange={e => setLuxuryTaxAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                        apron1Enabled ? 'bg-emerald-600/20 border border-emerald-600/50' : 'bg-slate-900/60 border border-transparent'
                    }`}>
                        <input
                            type="checkbox"
                            checked={apron1Enabled}
                            onChange={e => setApron1Enabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                        <span className={`text-xs font-bold flex-1 ${apron1Enabled ? 'text-white' : 'text-slate-400'}`}>1차 에이프런</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={apron1Amount}
                                onChange={e => setApron1Amount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                        apron2Enabled ? 'bg-emerald-600/20 border border-emerald-600/50' : 'bg-slate-900/60 border border-transparent'
                    }`}>
                        <input
                            type="checkbox"
                            checked={apron2Enabled}
                            onChange={e => setApron2Enabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                        <span className={`text-xs font-bold flex-1 ${apron2Enabled ? 'text-white' : 'text-slate-400'}`}>2차 에이프런</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={apron2Amount}
                                onChange={e => setApron2Amount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                        salaryFloorEnabled ? 'bg-emerald-600/20 border border-emerald-600/50' : 'bg-slate-900/60 border border-transparent'
                    }`}>
                        <input
                            type="checkbox"
                            checked={salaryFloorEnabled}
                            onChange={e => setSalaryFloorEnabled(e.target.checked)}
                            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                        />
                        <span className={`text-xs font-bold flex-1 ${salaryFloorEnabled ? 'text-white' : 'text-slate-400'}`}>샐러리 플로어</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={salaryFloorAmount}
                                onChange={e => setSalaryFloorAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <button
                        onClick={handleResetCapDefaults}
                        disabled={savingCap}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-sm font-bold text-slate-300 transition-colors"
                    >
                        <RotateCcw size={13} />
                        기본값으로 복원
                    </button>
                </div>
            </section>
            )}

            {/* ── 스케줄 설정 ─────────────────────────────────────────────────── */}
            {activeTab === 'draft' && !isInProgress && <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <CalendarDays size={14} className="text-indigo-400" />
                    스케줄
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 추첨 일시 (5분 단위)</label>
                        <input
                            type="datetime-local"
                            step="300"
                            value={lotteryAt}
                            onChange={e => setLotteryAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 시작 일시 (5분 단위)</label>
                        <input
                            type="datetime-local"
                            step="300"
                            value={draftAt}
                            onChange={e => setDraftAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* 토너먼트 시작 일시 + 경기 간격 */}
                {league.type === 'tournament' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1">토너먼트 시작 일시</label>
                            <input
                                type="datetime-local"
                                value={tournamentStartAt}
                                onChange={e => setTournamentStartAt(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-slate-600 ko-normal mt-1">
                                첫 경기 시작 시각. 이후 경기는 아래 간격만큼씩 한 경기씩 순서대로 배정됩니다.
                            </p>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1">경기 간격 (분) <span className="text-slate-600">15–180</span></label>
                            <input
                                type="number"
                                min={15}
                                max={180}
                                step={5}
                                value={tournamentIntervalMin}
                                onChange={e => setTournamentIntervalMin(Math.min(180, Math.max(15, Number(e.target.value))))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-slate-600 ko-normal mt-1">
                                기본 30분. 경기 리플레이 공개 시간(10분)보다 짧으면 앞 경기 결과가 끝나기 전에 다음 경기가 시작될 수 있어 최소 15분으로 제한합니다.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 라운드 <span className="text-slate-600">10–15</span></label>
                        <input
                            type="number"
                            min={10}
                            max={15}
                            value={totalRounds}
                            onChange={e => setTotalRounds(Math.min(15, Math.max(10, Number(e.target.value))))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1 flex items-center gap-1">
                            <Clock size={11} />픽 제한 시간(초) <span className="text-slate-600">15–60</span>
                        </label>
                        <input
                            type="number"
                            min={15}
                            max={60}
                            value={pickSec}
                            onChange={e => setPickSec(Math.min(60, Math.max(15, Number(e.target.value))))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">
                            오토픽 전환 기준(연속 미스) <span className="text-slate-600">1–5</span>
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={5}
                            value={autoPickAfterMisses}
                            onChange={e => setAutoPickAfterMisses(Math.min(5, Math.max(1, Number(e.target.value))))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-xs text-slate-600 ko-normal mt-1">
                            픽 제한 시간을 이 횟수만큼 연속으로 넘기면 자동으로 오토픽 모드로 전환됩니다.
                        </p>
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

                {/* 경기 포맷 — 토너먼트만 */}
                {league.type === 'tournament' && (
                    <div className="space-y-3 pt-3 border-t border-slate-700/40">
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (일반전)</label>
                            <div className="flex gap-2 flex-wrap">
                                {(['best_of_1', 'best_of_3', 'best_of_5', 'best_of_7'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setMatchFormat(f)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            matchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {f === 'best_of_1' ? '단판' : f === 'best_of_3' ? 'Bo3' : f === 'best_of_5' ? 'Bo5' : 'Bo7'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {league.tournament_format === 'single_elim' && (
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (결승)</label>
                                <div className="flex gap-2 flex-wrap">
                                    {(['best_of_1', 'best_of_3', 'best_of_5', 'best_of_7'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setFinalsMatchFormat(f)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                finalsMatchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {f === 'best_of_1' ? '단판' : f === 'best_of_3' ? 'Bo3' : f === 'best_of_5' ? 'Bo5' : 'Bo7'}
                                        </button>
                                    ))}
                                </div>
                                {finalsMatchFormat === matchFormat && (
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">일반전과 동일 포맷</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </section>}

            {/* ── 드래프트 추첨 (수동) ─────────────────────────────────────────── */}
            {activeTab === 'draft' && !isInProgress && <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield size={14} className="text-amber-400" />
                    드래프트 순서 추첨
                </h2>

                {lotteryDone ? (
                    <div className="space-y-3">
                        <p className="text-xs text-emerald-400 ko-normal">추첨 완료. 드래프트 오더가 확정되었습니다.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[...leagueTeams]
                                .filter(t => t.draft_order !== null)
                                .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0))
                                .map(t => (
                                    <div key={t.id} className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-3 py-2">
                                        <span className="text-xs font-bold text-amber-400 w-5 shrink-0">#{t.draft_order}</span>
                                        <div
                                            className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0"
                                            style={{ backgroundColor: t.color_primary, color: t.color_text ?? getReadableTextColor(t.color_primary) }}
                                        >
                                            {t.team_abbr.slice(0, 2)}
                                        </div>
                                        <span className="text-xs text-slate-300 truncate">{t.team_name}</span>
                                        {!t.is_ai && t.user_id && (
                                            <span className="text-[9px] font-bold text-indigo-400 shrink-0">GM</span>
                                        )}
                                    </div>
                                ))
                            }
                        </div>

                        {/* [2026-09-11] 예정 시각(draft_scheduled_at) 전이라도 어드민이 바로
                            드래프트를 시작할 수 있게 — league.status가 여전히 'drafting'으로
                            바뀌기 전(즉 아직 'recruiting')에만 노출. */}
                        {league.status === 'recruiting' && (
                            <div className="space-y-2 pt-1">
                                {draftStartErr && <p className="text-xs text-red-400 ko-normal">{draftStartErr}</p>}
                                <button
                                    onClick={handleStartDraft}
                                    disabled={draftStarting}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    {draftStarting
                                        ? <><Loader2 size={13} className="animate-spin" />시작 중…</>
                                        : '드래프트 시작'
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400 ko-normal">
                            추첨을 실행하면 드래프트 오더가 무작위로 확정됩니다.
                            이후 팀 선점 변경이 불가능합니다.
                        </p>
                        {lotteryErr && <p className="text-xs text-red-400 ko-normal">{lotteryErr}</p>}
                        <button
                            onClick={handleRunLottery}
                            disabled={lotteryRunning || league.status !== 'recruiting'}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            {lotteryRunning
                                ? <><Loader2 size={13} className="animate-spin" />추첨 중…</>
                                : '드래프트 순서 추첨 시작'
                            }
                        </button>
                        {league.status !== 'recruiting' && (
                            <p className="text-xs text-slate-500 ko-normal">recruiting 상태에서만 추첨 가능합니다.</p>
                        )}
                    </div>
                )}
            </section>}

            {/* ── 드래프트 결과 (진행 중/완료 여부와 무관하게 항상 조회 가능) ─────── */}
            {activeTab === 'draft' && (
                <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <ClipboardList size={14} className="text-emerald-400" />
                        드래프트 결과
                        {draftPicks.length > 0 && (
                            <span className="text-xs font-normal text-slate-500 ml-1">{draftPicks.length}픽</span>
                        )}
                    </h2>

                    {draftPicks.length === 0 ? (
                        <p className="text-xs text-slate-500 ko-normal">아직 드래프트 결과가 없습니다.</p>
                    ) : (() => {
                        // 팀 × 라운드 매트릭스로 재구성 — 팀은 1라운드 픽 순서(pick_index) 기준 정렬.
                        const rounds = Array.from(new Set(draftPicks.map(p => p.round))).sort((a, b) => a - b);
                        const pickByTeamRound = new Map<string, Map<number, DraftPickRow>>();
                        const firstPickIndexByTeam = new Map<string, number>();
                        const teamNameById = new Map<string, string>();
                        for (const p of draftPicks) {
                            if (!pickByTeamRound.has(p.team_id)) pickByTeamRound.set(p.team_id, new Map());
                            pickByTeamRound.get(p.team_id)!.set(p.round, p);
                            teamNameById.set(p.team_id, p.team_name ?? p.team_id);
                            const cur = firstPickIndexByTeam.get(p.team_id);
                            if (cur === undefined || p.pick_index < cur) firstPickIndexByTeam.set(p.team_id, p.pick_index);
                        }
                        const teamIds = Array.from(teamNameById.keys())
                            .sort((a, b) => (firstPickIndexByTeam.get(a)! - firstPickIndexByTeam.get(b)!));

                        return (
                            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            <th className="px-2 py-2 text-left text-xs font-bold text-slate-500">팀</th>
                                            {rounds.map(r => (
                                                <th key={r} className="px-2 py-2 text-left text-xs font-bold text-slate-500 whitespace-nowrap">{r}R</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {teamIds.map(teamId => (
                                            <tr key={teamId}>
                                                <td className="px-2 py-2 text-xs font-bold text-white whitespace-nowrap">{teamNameById.get(teamId)}</td>
                                                {rounds.map(r => {
                                                    const pick = pickByTeamRound.get(teamId)?.get(r);
                                                    return (
                                                        <td key={r} className="px-2 py-2 text-xs text-slate-300 whitespace-nowrap">
                                                            {pick ? `${pick.player_name}(${pick.position},${pick.ovr})` : '—'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </section>
            )}

            </div>
        </div>
    );
};

export default LeagueSettingsView;
