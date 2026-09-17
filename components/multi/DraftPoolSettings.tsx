
import React, { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { applyMetaPlayerPoolFilter } from '../../services/multi/draftPoolQuery';
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
}) => {
    const [stats, setStats]               = useState<PoolStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
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
        const v = Math.min(99, Math.max(ovrMin, Number(localMax) || 99));
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
    }, [ovrMin, ovrMax, draftYearMin, draftYearMax, useCustomOverrides]);

    const fetchStats = async () => {
        setStatsLoading(true);

        let query = supabase
            .from('meta_players')
            .select('id, position, base_attributes, tendencies');
        query = applyMetaPlayerPoolFilter(query as any, draftYearMin, draftYearMax);

        const { data } = await query;
        const raw = (data as any[] ?? []).map(r => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true));
        const all = raw.filter(p => p.ovr >= ovrMin && p.ovr <= ovrMax);

        const byPos: Record<string, number> = {};
        for (const p of all) {
            const pos = (p.position ?? '기타').split('/')[0];
            byPos[pos] = (byPos[pos] ?? 0) + 1;
        }
        setStats({ total: all.length, byPos });
        setStatsLoading(false);
    };

    return (
        <div className="space-y-4">
            {/* OVR 범위 */}
            <div>
                <label className="text-xs text-slate-400 ko-normal block mb-2">OVR 범위</label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={99}
                        value={localMin}
                        onChange={e => setLocalMin(e.target.value)}
                        onBlur={commitMin}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-500 shrink-0">~</span>
                    <input
                        type="number"
                        min={0}
                        max={99}
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
            <div className="rounded-xl bg-slate-800/60 px-3 py-2.5 min-h-[52px] flex flex-col justify-center">
                {statsLoading ? (
                    <p className="text-xs text-slate-500 ko-normal text-center">불러오는 중…</p>
                ) : stats ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 ko-normal">총 선수</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-white">{stats.total}명</span>
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
                    </div>
                ) : (
                    <p className="text-xs text-slate-500 ko-normal text-center">불러오는 중…</p>
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
            <div>
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
            </div>
        </div>
    );
};
