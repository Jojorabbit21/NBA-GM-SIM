
import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
    createLeagueGroup,
    createLeague,
    createRoom,
    initializeLeagueTeams,
} from '../../services/multi/leagueService';
import { DraftPoolSettings, type PoolType, type DraftFormat } from './DraftPoolSettings';

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

// 리그 시작 시각의 최소 허용값(현재로부터 1시간 뒤) — 로터리 추첨이 리그 시작 40분 전에
// 잡히는데, 시작 시간이 지금으로부터 35분 이내면 세션 생성 즉시 로터리 예정 시각이 과거가
// 되어 스케줄러가 곧바로(그리고 방/멤버 준비도 안 된 채로) 추첨을 실행해버리는 버그가 생긴다.
const MIN_START_LEAD_MS = 60 * 60_000;

function minStartKst(): string {
    return new Date(Date.now() + MIN_START_LEAD_MS + KST_OFFSET_MS).toISOString().slice(0, 16);
}

// 리그 시작 시각 기준 드래프트/로터리 기본 오프셋
const DRAFT_BEFORE_START_MS   = 30 * 60_000; // 드래프트: 시작 30분 전
const LOTTERY_BEFORE_DRAFT_MS = 10 * 60_000; // 로터리 추첨: 드래프트 10분 전

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

    // ── 메인리그 전용 ──────────────────────────────────────────────────────────
    const [tier,          setTier]          = useState<Tier>('d1');
    const [durationWeeks, setDurationWeeks] = useState(2);

    // ── 드래프트 (공통) ────────────────────────────────────────────────────────
    const [totalRounds,    setTotalRounds]    = useState(10);
    const [pickDurationSec, setPickDurationSec] = useState(30);
    const [draftPools,     setDraftPools]     = useState<PoolType[]>(['standard']);
    const [draftOvrMin,    setDraftOvrMin]    = useState(0);
    const [draftOvrMax,    setDraftOvrMax]    = useState(99);
    const [draftFormat,    setDraftFormat]    = useState<DraftFormat>('snake');

    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState<string | null>(null);

    const handleTypeChange = (t: LeagueType) => {
        setType(t);
        setMaxTeams(t === 'tournament' ? 8 : 30);
    };

    const handleSubmit = async () => {
        const trimName = name.trim();
        if (trimName.length < 1 || trimName.length > 30) {
            setErr('리그 이름은 1~30자여야 합니다'); return;
        }

        // 토너먼트: 시작 시각이 최소 리드타임(1시간)보다 가까우면 로터리 예정 시각이
        // 생성 즉시 과거가 되어버려 스케줄러가 준비 안 된 방에 즉시 추첨을 실행하는
        // 버그로 이어진다 — 여기서 미리 막는다.
        let startIso: string | null = null;
        if (type === 'tournament') {
            startIso = tournamentStartAt ? kstLocalToIso(tournamentStartAt) : null;
            if (!startIso || new Date(startIso).getTime() < Date.now() + MIN_START_LEAD_MS) {
                setErr('토너먼트 시작 일시는 현재로부터 최소 1시간 이후여야 합니다'); return;
            }
        }

        setSaving(true);
        setErr(null);

        try {
            let leagueId: string;

            if (type === 'tournament') {
                const draftScheduledAtIso   = startIso
                    ? new Date(new Date(startIso).getTime() - DRAFT_BEFORE_START_MS).toISOString()
                    : null;
                const lotteryScheduledAtIso = draftScheduledAtIso
                    ? new Date(new Date(draftScheduledAtIso).getTime() - LOTTERY_BEFORE_DRAFT_MS).toISOString()
                    : null;

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
                        draftPool:            draftPools.join(','),
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        tournamentStartAt:  startIso,
                        draftScheduledAt:   draftScheduledAtIso,
                        lotteryScheduledAt: lotteryScheduledAtIso,
                    },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;

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
                        draftPool:            draftPools.join(','),
                        draftPoolStrategy:    draftFormat,
                        draftOvrMin,
                        draftOvrMax,
                        seasonStartDate:      refToday,
                        seasonEndDate:        endDate,
                    },
                });
                if (le || !league) throw new Error(le ?? '리그 생성 실패');
                leagueId = league.id;
            }

            const { data: room, error: re } = await createRoom({ leagueId, maxPlayers: maxTeams });
            if (re || !room) throw new Error(re ?? '방 생성 실패');

            const { error: te } = await initializeLeagueTeams(room.id, maxTeams);
            if (te) throw new Error(te);

            onCreated(leagueId);

        } catch (e: any) {
            setErr(e.message ?? '알 수 없는 오류');
        } finally {
            setSaving(false);
        }
    };

    // ── 시즌 기간 미리보기 ─────────────────────────────────────────────────────
    const REGULAR_DAYS       = [5, 10, 16, 20];
    const GAME_DAYS_PER_DAY  = [17, 9, 6, 5];
    const regularDays        = REGULAR_DAYS[durationWeeks - 1];
    const gameDaysPerDay     = GAME_DAYS_PER_DAY[durationWeeks - 1];
    const lastSlotKst        = `${10 + Math.floor((gameDaysPerDay - 1) * 30 / 60)}:${String(((gameDaysPerDay - 1) * 30) % 60).padStart(2, '0')}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
                    <h2 className="text-base font-black text-white ko-tight">새 리그 만들기</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* 바디 — 2단 */}
                <div className="grid grid-cols-2 divide-x divide-slate-800 overflow-y-auto flex-1 min-h-0">

                    {/* ── 왼쪽: 공통 기본 설정 ─────────────────────────────────── */}
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
                    </div>

                    {/* ── 오른쪽: 유형별 설정 + 드래프트 ─────────────────────────── */}
                    <div className="px-6 py-5 space-y-5 overflow-y-auto">

                        {/* 토너먼트 설정 */}
                        {type === 'tournament' && (
                            <>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">경기 설정</p>

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

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">토너먼트 시작 일시</label>
                                    <input
                                        type="datetime-local"
                                        value={tournamentStartAt}
                                        min={minStartKst()}
                                        onChange={e => setTournamentStartAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-600 ko-normal mt-1">
                                        첫 경기 시작 시각 기준. 이후 경기는 2시간 간격으로 자동 배정됩니다.<br />
                                        드래프트는 시작 30분 전, 로터리 추첨은 드래프트 10분 전(시작 40분 전)에 자동 진행됩니다. 최소 1시간 이후로만 설정할 수 있습니다.
                                    </p>
                                </div>

                                <div className="border-t border-slate-800 pt-5" />
                            </>
                        )}

                        {/* 메인리그 설정 */}
                        {type === 'main_league' && (
                            <>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">리그 설정</p>

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

                                <div>
                                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">시즌 기간</label>
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
                                    <div className="bg-slate-800/60 rounded-lg px-3 py-2.5 mt-2 space-y-1">
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500 ko-normal">정규시즌</span>
                                            <span className="text-slate-300 font-mono">{regularDays}일 · {gameDaysPerDay}경기/일</span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500 ko-normal">플레이오프</span>
                                            <span className="text-slate-300 font-mono">{durationWeeks * 7 - regularDays}일</span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-slate-500 ko-normal">일일 시뮬 시간대</span>
                                            <span className="text-slate-300 font-mono">10:00 ~ {lastSlotKst} KST</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-800 pt-5" />
                            </>
                        )}

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
        </div>
    );
};

export default CreateLeagueModal;
