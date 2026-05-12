
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CalendarDays,
    Clock, Users, Shield, Trash2,
} from 'lucide-react';
import { useLeagueContext } from './LeagueLayout';
import { updateLeagueSettings, leaveLeague, runDraftLottery } from '../../../services/multi/leagueService';
import { useGame } from '../../../hooks/useGameContext';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

function fmtConference(conf: string | null): string {
    if (!conf) return '—';
    if (conf === 'East') return '동부';
    if (conf === 'West') return '서부';
    return conf;
}

// ISO datetime → datetime-local input 값
function toInputValue(iso: string | null): string {
    if (!iso) return '';
    // "2025-04-25T20:00:00+09:00" → "2025-04-25T20:00"
    return iso.slice(0, 16);
}
// datetime-local → ISO (UTC)
function toIso(local: string): string | null {
    if (!local) return null;
    return new Date(local).toISOString();
}


const POOL_OPTIONS = [
    { label: '현역 선수', value: 'standard' },
    { label: '올타임',    value: 'alltime' },
];

// ── LeagueSettingsView ────────────────────────────────────────────────────────

const LeagueSettingsView: React.FC = () => {
    const navigate              = useNavigate();
    const { leagueId }          = useParams<{ leagueId: string }>();
    const { session }           = useGame();
    const { league, room, members, leagueTeams, isLoading, error, reload } = useLeagueContext();

    const userId  = session?.user?.id ?? null;
    const isAdmin = !!(league && userId && league.admin_user_id === userId);

    // ── form state ────────────────────────────────────────────────────────────
    const [lotteryAt,    setLotteryAt]    = useState('');
    const [draftAt,      setDraftAt]      = useState('');
    const [pickSec,      setPickSec]      = useState(30);
    const [totalRounds,  setTotalRounds]  = useState(10);
    const [draftPool,    setDraftPool]    = useState('standard');
    const [saving,      setSaving]      = useState(false);
    const [saveOk,      setSaveOk]      = useState(false);
    const [saveErr,     setSaveErr]     = useState<string | null>(null);

    // ── lottery state ─────────────────────────────────────────────────────────
    const [lotteryRunning, setLotteryRunning] = useState(false);
    const [lotteryErr,     setLotteryErr]     = useState<string | null>(null);
    const lotteryDone = leagueTeams.some(t => t.draft_order !== null);

    // ── kick state ────────────────────────────────────────────────────────────
    const [kickingId, setKickingId] = useState<string | null>(null);

    // league 로드 후 form 초기화
    useEffect(() => {
        if (!league) return;
        setLotteryAt(toInputValue(league.lottery_scheduled_at));
        setDraftAt(toInputValue(league.draft_scheduled_at));
        setPickSec(league.draft_pick_duration_sec ?? 30);
        setTotalRounds(league.draft_total_rounds ?? 10);
        setDraftPool(league.draft_pool ?? 'standard');
    }, [league]);

    // 비어드민 접근 차단
    useEffect(() => {
        if (!isLoading && league && !isAdmin) {
            navigate(`/multi/leagues/${leagueId}/lobby`, { replace: true });
        }
    }, [isLoading, league, isAdmin, leagueId, navigate]);

    const handleSave = async () => {
        if (!leagueId) return;
        setSaving(true);
        setSaveOk(false);
        setSaveErr(null);
        const { error: err } = await updateLeagueSettings({
            leagueId,
            lotteryScheduledAt:  toIso(lotteryAt),
            draftScheduledAt:    toIso(draftAt),
            draftPickDurationSec: pickSec,
            draftTotalRounds:    totalRounds,
            draftPool,
        });
        setSaving(false);
        if (err) { setSaveErr(err); return; }
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
        reload();
    };

    const handleRunLottery = async () => {
        if (!room || !userId) return;
        setLotteryRunning(true);
        setLotteryErr(null);
        const { error: err } = await runDraftLottery(room.id, userId);
        setLotteryRunning(false);
        if (err) { setLotteryErr(err); return; }
        reload();
    };

    const handleKick = async (kickUserId: string) => {
        if (!room) return;
        setKickingId(kickUserId);
        await leaveLeague(room.id, kickUserId);
        setKickingId(null);
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

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

            {/* 뒤로가기 */}
            <button
                onClick={() => navigate(`/multi/leagues/${leagueId}/lobby`)}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                <span className="ko-normal">로비로 돌아가기</span>
            </button>

            <div>
                <h1 className="text-xl font-black text-white ko-tight">{league.name}</h1>
                <p className="text-xs text-slate-500 ko-normal mt-0.5">세션 설정 — 어드민 전용</p>
            </div>

            {/* ── 스케줄 설정 ─────────────────────────────────────────────────── */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <CalendarDays size={14} className="text-indigo-400" />
                    스케줄
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 추첨 일시</label>
                        <input
                            type="datetime-local"
                            value={lotteryAt}
                            onChange={e => setLotteryAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">드래프트 시작 일시</label>
                        <input
                            type="datetime-local"
                            value={draftAt}
                            onChange={e => setDraftAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

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
                </div>

                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-2">드래프트 선수 풀</label>
                    <select
                        value={draftPool}
                        onChange={e => setDraftPool(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                        {POOL_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                {saveErr && <p className="text-xs text-red-400 ko-normal">{saveErr}</p>}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                >
                    {saving
                        ? <><Loader2 size={13} className="animate-spin" />저장 중…</>
                        : saveOk
                        ? '저장됨 ✓'
                        : <><Save size={13} />저장</>
                    }
                </button>
            </section>

            {/* ── 드래프트 추첨 (수동) ─────────────────────────────────────────── */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield size={14} className="text-amber-400" />
                    드래프트 오더 추첨
                </h2>

                {lotteryDone ? (
                    <div className="space-y-2">
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
                                            style={{ backgroundColor: t.color_primary, color: '#fff' }}
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
                                : '드래프트 오더 추첨 실행'
                            }
                        </button>
                        {league.status !== 'recruiting' && (
                            <p className="text-xs text-slate-500 ko-normal">recruiting 상태에서만 추첨 가능합니다.</p>
                        )}
                    </div>
                )}
            </section>

            {/* ── 팀 & 참가자 ─────────────────────────────────────────────────── */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    팀 목록
                    <span className="text-xs font-normal text-slate-500 ml-1">
                        {leagueTeams.length}팀 · 인간 GM {humanMembers.length}명
                    </span>
                </h2>

                <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/80">
                            <tr>
                                <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">팀</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">컨퍼런스</th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">GM</th>
                                <th className="px-3 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">드래프트 오더</th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {leagueTeams.map(t => {
                                const isHuman = !t.is_ai && t.user_id !== null;
                                const isMe    = t.user_id === userId;
                                return (
                                    <tr key={t.id} className="bg-slate-900/40">
                                        {/* 팀 */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                                                    style={{ backgroundColor: t.color_primary, color: '#fff' }}
                                                >
                                                    {t.team_abbr}
                                                </div>
                                                <span className="font-bold text-white whitespace-nowrap">{t.team_name}</span>
                                            </div>
                                        </td>

                                        {/* 컨퍼런스 */}
                                        <td className="px-3 py-3 text-xs text-slate-400">
                                            {fmtConference(t.conference)}
                                        </td>

                                        {/* GM */}
                                        <td className="px-3 py-3">
                                            {isMe
                                                ? <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">나</span>
                                                : isHuman
                                                ? <span className="text-xs text-slate-300 ko-normal">선점됨</span>
                                                : <span className="text-xs text-slate-600">AI</span>
                                            }
                                        </td>

                                        {/* 드래프트 오더 */}
                                        <td className="px-3 py-3 text-center">
                                            {t.draft_order !== null
                                                ? <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">#{t.draft_order}</span>
                                                : <span className="text-xs text-slate-700">—</span>
                                            }
                                        </td>

                                        {/* 강퇴 */}
                                        <td className="px-4 py-3 text-right">
                                            {isHuman && !isMe && room && (
                                                <button
                                                    onClick={() => handleKick(t.user_id!)}
                                                    disabled={kickingId === t.user_id}
                                                    className="flex items-center gap-1 px-2 py-1 bg-red-600/10 hover:bg-red-600/30 text-red-500 hover:text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50 ml-auto"
                                                >
                                                    {kickingId === t.user_id
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : <Trash2 size={11} />
                                                    }
                                                    강퇴
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LeagueSettingsView;
