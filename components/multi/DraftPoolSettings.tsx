
import React, { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { DraftPoolModal } from './DraftPoolModal';

export type PoolType    = 'standard' | 'alltime' | 'rookies';
export type DraftFormat = 'snake' | 'linear';

interface PoolStats {
    total: number;
    byPos: Record<string, number>;
}

interface Props {
    poolTypes:            PoolType[];
    onPoolTypesChange:    (v: PoolType[]) => void;
    ovrMin:               number;
    onOvrMinChange:       (v: number) => void;
    ovrMax:               number;
    onOvrMaxChange:       (v: number) => void;
    draftFormat:          DraftFormat;
    onDraftFormatChange:  (v: DraftFormat) => void;
}

const POOL_TYPES: { value: PoolType; label: string; desc: string }[] = [
    { value: 'standard', label: '현역',      desc: '현재 활동 중인 선수' },
    { value: 'alltime',  label: '올타임',    desc: '역대 레전드 선수' },
    { value: 'rookies',  label: '2026 신인', desc: '2026 드래프트 프로스펙트' },
];

const FORMATS: { value: DraftFormat; label: string; desc: string }[] = [
    { value: 'snake',  label: '스네이크', desc: '홀수 라운드↑ 짝수 라운드↓' },
    { value: 'linear', label: '선형',     desc: '매 라운드 동일한 순서' },
];

const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

export const DraftPoolSettings: React.FC<Props> = ({
    poolTypes, onPoolTypesChange,
    ovrMin, onOvrMinChange,
    ovrMax, onOvrMaxChange,
    draftFormat, onDraftFormatChange,
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

    const showOvr = poolTypes.some(p => p !== 'rookies');

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (poolTypes.length === 0) { setStats(null); return; }
        timerRef.current = setTimeout(fetchStats, 400);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poolTypes.join(','), ovrMin, ovrMax]);

    const fetchStats = async () => {
        setStatsLoading(true);

        const seenIds      = new Set<string>();
        const nonRookiePlayers: ReturnType<typeof mapRawPlayerToRuntimePlayer>[] = [];
        const rookiePlayers:    ReturnType<typeof mapRawPlayerToRuntimePlayer>[] = [];

        for (const pt of poolTypes) {
            let query = supabase
                .from('meta_players')
                .select('id, position, base_attributes, tendencies');

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
                const p = mapRawPlayerToRuntimePlayer(raw);
                if (pt === 'rookies') rookiePlayers.push(p);
                else                  nonRookiePlayers.push(p);
            }
        }

        const filteredNonRookies = nonRookiePlayers.filter(p => p.ovr >= ovrMin && p.ovr <= ovrMax);
        const all = [...filteredNonRookies, ...rookiePlayers];

        const byPos: Record<string, number> = {};
        for (const p of all) {
            const pos = (p.position ?? '기타').split('/')[0];
            byPos[pos] = (byPos[pos] ?? 0) + 1;
        }
        setStats({ total: all.length, byPos });
        setStatsLoading(false);
    };

    const toggle = (v: PoolType) => {
        if (poolTypes.includes(v)) {
            const next = poolTypes.filter(p => p !== v);
            if (next.length > 0) onPoolTypesChange(next);
        } else {
            onPoolTypesChange([...poolTypes, v]);
        }
    };

    return (
        <div className="space-y-4">
            {/* 풀 유형 */}
            <div>
                <label className="text-xs text-slate-400 ko-normal block mb-2">드래프트 풀</label>
                <div className="space-y-2">
                    {POOL_TYPES.map(o => {
                        const checked = poolTypes.includes(o.value);
                        return (
                            <label
                                key={o.value}
                                className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                                    checked ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-800 border border-transparent hover:border-slate-600'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggle(o.value)}
                                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>
                                        {o.label}
                                    </span>
                                    <span className="ml-2 text-xs text-slate-500 ko-normal">{o.desc}</span>
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* OVR 범위 — 신인 풀만 선택 시 숨김 */}
            {showOvr && (
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
            )}

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
                    <p className="text-xs text-slate-500 ko-normal text-center">풀 유형을 선택하세요</p>
                )}
            </div>

            {showModal && (
                <DraftPoolModal
                    poolTypes={poolTypes}
                    ovrMin={ovrMin}
                    ovrMax={ovrMax}
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
