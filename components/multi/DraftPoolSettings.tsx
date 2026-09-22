
import React, { useEffect, useRef, useState } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { fetchDraftPoolPlayers, buildCapacityError } from '../../services/multi/draftPoolCapacity';
import { DraftPoolModal } from './DraftPoolModal';

export type DraftFormat = 'snake' | 'linear';

// [2026-09-16] 'standard'/'alltime' 풀 타입 체크박스를 완전히 폐지했다. include_alltime/
// base_team_id 둘 다 신뢰할 수 없는 필드로 확인됨(Ed Macauley/Mitch Richmond 등 명백한
// 은퇴 레전드가 include_alltime=false로 표시돼 있는 등) — 상대적으로 깨끗한 draft_year
// 범위(draftYearMin~draftYearMax) 하나로 통일. 낮추면 레전드 포함, 좁히면 최근 선수만.
const OLDEST_DRAFT_YEAR  = 1946;
const CURRENT_DRAFT_YEAR = 2026;

interface PoolStats {
    total: number;
    byPos: Record<string, number>;
}

interface Props {
    ovrMin:               number;
    onOvrMinChange:       (v: number) => void;
    ovrMax:               number;
    onOvrMaxChange:       (v: number) => void;
    draftYearMin:         number;
    onDraftYearMinChange: (v: number) => void;
    draftYearMax:         number;
    onDraftYearMaxChange: (v: number) => void;
    draftFormat:          DraftFormat;
    onDraftFormatChange:  (v: DraftFormat) => void;
    useCustomOverrides:      boolean;
    onUseCustomOverridesChange: (v: boolean) => void;
    /**
     * 드래프트에 필요한 총 픽 수(참가팀 × 라운드)를 계산할 재료. 넘기면 풀 통계 옆에 "필요 N명"과
     * 부족 시 경고를 함께 표시한다 — 저장 시점의 checkDraftPoolCapacity()와 같은 공식이라 여기서
     * 경고가 뜨면 저장도 반드시 막힌다(사용자가 저장 버튼을 누르기 전에 미리 알 수 있게).
     */
    teamCount?:   number;
    totalRounds?: number;
    /** [2026-09-18] 개인 팩 드래프트(토너먼트)에선 픽 순서(스네이크/선형) 개념이 없어 이 블록을 숨긴다. */
    hideDraftOrder?: boolean;
    /** OVR 상한(기본 99). 개인 팩 드래프트는 카드 전용 세 자리 OVR(manual_ovr ≤ 999)을 허용하므로 999를 넘긴다. */
    ovrCap?: number;
    /** [2026-09-22] 계약 모드 — 'standard'면 풀 통계/용량이 "룸 시즌 유효 계약 보유자 + 당해 클래스 신인"으로
     *  제한된다(fetchDraftPoolPlayers와 동일 필터). 미전달/'alternative'면 필터 없음. */
    contractMode?:    'standard' | 'alternative';
    seasonStartYear?: number;
    rookieClassYear?: number;
}

const FORMATS: { value: DraftFormat; label: string; desc: string }[] = [
    { value: 'snake',  label: '스네이크', desc: '홀수 라운드↑ 짝수 라운드↓' },
    { value: 'linear', label: '선형',     desc: '매 라운드 동일한 순서' },
];

const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

export const DraftPoolSettings: React.FC<Props> = ({
    ovrMin, onOvrMinChange,
    ovrMax, onOvrMaxChange,
    draftYearMin, onDraftYearMinChange,
    draftYearMax, onDraftYearMaxChange,
    draftFormat, onDraftFormatChange,
    useCustomOverrides, onUseCustomOverridesChange,
    teamCount, totalRounds,
    hideDraftOrder = false,
    ovrCap = 99,
    contractMode, seasonStartYear, rookieClassYear,
}) => {
    const [stats, setStats]               = useState<PoolStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsFailed,  setStatsFailed]  = useState(false);
    const [showModal,    setShowModal]    = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 타이핑 중 클램핑 방지 — blur 시에만 부모로 확정값 전달
    const [localMin, setLocalMin] = useState(String(ovrMin));
    const [localMax, setLocalMax] = useState(String(ovrMax));
    useEffect(() => { setLocalMin(String(ovrMin)); }, [ovrMin]);
    useEffect(() => { setLocalMax(String(ovrMax)); }, [ovrMax]);

    const [localYearMin, setLocalYearMin] = useState(String(draftYearMin));
    const [localYearMax, setLocalYearMax] = useState(String(draftYearMax));
    useEffect(() => { setLocalYearMin(String(draftYearMin)); }, [draftYearMin]);
    useEffect(() => { setLocalYearMax(String(draftYearMax)); }, [draftYearMax]);

    const commitMin = () => {
        const v = Math.min(ovrMax, Math.max(0, Number(localMin) || 0));
        setLocalMin(String(v));
        onOvrMinChange(v);
    };
    const commitMax = () => {
        const v = Math.min(ovrCap, Math.max(ovrMin, Number(localMax) || ovrCap));
        setLocalMax(String(v));
        onOvrMaxChange(v);
    };
    const commitYearMin = () => {
        const v = Math.min(draftYearMax, Math.max(OLDEST_DRAFT_YEAR, Number(localYearMin) || OLDEST_DRAFT_YEAR));
        setLocalYearMin(String(v));
        onDraftYearMinChange(v);
    };
    const commitYearMax = () => {
        const v = Math.min(CURRENT_DRAFT_YEAR, Math.max(draftYearMin, Number(localYearMax) || CURRENT_DRAFT_YEAR - 1));
        setLocalYearMax(String(v));
        onDraftYearMaxChange(v);
    };

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(fetchStats, 400);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ovrMin, ovrMax, draftYearMin, draftYearMax, useCustomOverrides, contractMode, seasonStartYear, rookieClassYear]);

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            // 저장 시 용량 검증(checkDraftPoolCapacity)과 정확히 같은 조회 경로 — 여기 표시되는
            // "총 선수"가 곧 검증에 쓰이는 풀 크기다.
            const all = await fetchDraftPoolPlayers({ draftYearMin, draftYearMax, ovrMin, ovrMax, useCustomOverrides, contractMode, seasonStartYear, rookieClassYear });

            const byPos: Record<string, number> = {};
            for (const p of all) {
                const pos = (p.position ?? '기타').split('/')[0];
                byPos[pos] = (byPos[pos] ?? 0) + 1;
            }
            setStats({ total: all.length, byPos });
            setStatsFailed(false);
        } catch {
            setStats(null);
            setStatsFailed(true);
        } finally {
            setStatsLoading(false);
        }
    };

    // 필요 픽 수 대비 부족 경고 — teamCount/totalRounds를 넘긴 호출부에서만 표시.
    const hasCapacityInputs = teamCount != null && totalRounds != null;
    const requiredPicks = hasCapacityInputs ? teamCount * totalRounds : null;
    const capacityError = (stats && requiredPicks != null)
        ? buildCapacityError(stats.total, teamCount!, totalRounds!)
        : null;

    return (
        <div className="space-y-4">
            {/* OVR 범위 */}
            <div>
                <label className="text-xs text-slate-400 ko-normal block mb-2">OVR 범위</label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={ovrCap}
                        value={localMin}
                        onChange={e => setLocalMin(e.target.value)}
                        onBlur={commitMin}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-500 shrink-0">~</span>
                    <input
                        type="number"
                        min={0}
                        max={ovrCap}
                        value={localMax}
                        onChange={e => setLocalMax(e.target.value)}
                        onBlur={commitMax}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                    />
                </div>
            </div>

            {/* 드래프트 연도 범위 — 낮추면 레전드 포함, 2026까지 올리면 신인 포함 */}
            <div>
                <label className="text-xs text-slate-400 ko-normal block mb-2">
                    드래프트 연도 범위 ({OLDEST_DRAFT_YEAR}~{CURRENT_DRAFT_YEAR})
                </label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={OLDEST_DRAFT_YEAR}
                        max={CURRENT_DRAFT_YEAR}
                        value={localYearMin}
                        onChange={e => setLocalYearMin(e.target.value)}
                        onBlur={commitYearMin}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-500 shrink-0">~</span>
                    <input
                        type="number"
                        min={OLDEST_DRAFT_YEAR}
                        max={CURRENT_DRAFT_YEAR}
                        value={localYearMax}
                        onChange={e => setLocalYearMax(e.target.value)}
                        onBlur={commitYearMax}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                    />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 ko-normal">
                    {draftYearMin <= 1990
                        ? '역대 레전드 포함'
                        : '최근 선수 위주'}
                    {draftYearMax >= CURRENT_DRAFT_YEAR ? ` · ${CURRENT_DRAFT_YEAR} 신인 클래스 포함` : ''}
                </p>
            </div>

            {/* custom_overrides(피크시즌 스탯) 적용 여부 */}
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                useCustomOverrides ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent'
            }`}>
                <input
                    type="checkbox"
                    checked={useCustomOverrides}
                    onChange={e => onUseCustomOverridesChange(e.target.checked)}
                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                />
                <div className="flex-1">
                    <span className={`text-xs font-bold ${useCustomOverrides ? 'text-white' : 'text-slate-400'}`}>피크시즌 능력치 적용</span>
                    <p className="text-[11px] text-slate-600 ko-normal mt-0.5">
                        켜면 일부 선수는 전성기 시즌 스탯(피크 능력치)으로 계산됩니다. 끄면 항상 기본(현재) 능력치를 씁니다.
                    </p>
                </div>
            </div>

            {/* 풀 통계 */}
            <div className={`rounded-xl px-3 py-2.5 min-h-[52px] flex flex-col justify-center ${
                capacityError ? 'bg-red-950/40 border border-red-700/50' : 'bg-slate-800/60'
            }`}>
                {statsLoading ? (
                    <p className="text-xs text-slate-500 ko-normal text-center">불러오는 중…</p>
                ) : stats ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 ko-normal">
                                총 선수
                                {requiredPicks != null && (
                                    <span className="text-slate-500"> · 필요 {requiredPicks}명</span>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-black ${capacityError ? 'text-red-400' : 'text-white'}`}>{stats.total}명</span>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(true)}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600/20 border border-indigo-600/40 text-indigo-400 hover:bg-indigo-600/30 transition-colors text-[10px] font-bold"
                                >
                                    <Users size={10} />
                                    풀 보기
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                            {POS_ORDER.filter(pos => stats.byPos[pos]).map(pos => (
                                <span key={pos} className="text-xs text-slate-400 ko-normal">
                                    <span className="text-slate-200 font-bold">{pos}</span> {stats.byPos[pos]}
                                </span>
                            ))}
                            {stats.byPos['기타'] ? (
                                <span className="text-xs text-slate-400 ko-normal">
                                    <span className="text-slate-200 font-bold">기타</span> {stats.byPos['기타']}
                                </span>
                            ) : null}
                        </div>
                        {capacityError && (
                            <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal pt-1">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>{capacityError}</span>
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-slate-500 ko-normal text-center">
                        {statsFailed ? '풀 정보를 불러오지 못했습니다' : '불러오는 중…'}
                    </p>
                )}
            </div>

            {showModal && (
                <DraftPoolModal
                    ovrMin={ovrMin}
                    ovrMax={ovrMax}
                    draftYearMin={draftYearMin}
                    draftYearMax={draftYearMax}
                    useCustomOverrides={useCustomOverrides}
                    onClose={() => setShowModal(false)}
                />
            )}

            {/* 드래프트 순서 */}
            {!hideDraftOrder && <div>
                <label className="text-xs text-slate-400 ko-normal block mb-2">드래프트 순서</label>
                <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map(o => (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => onDraftFormatChange(o.value)}
                            className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                                draftFormat === o.value
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500 ko-normal">
                    {FORMATS.find(o => o.value === draftFormat)?.desc}
                </p>
            </div>}
        </div>
    );
};
