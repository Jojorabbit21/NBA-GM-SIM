/**
 * TeamTacticsTab — 세션 설정 "팀 전술" 탭 (어드민 전용).
 *
 * [2026-10-05] 참가자 전원의 뎁스차트/전술 슬라이더/로테이션/선수별 전술을 값 그대로 표로 보여준다(보기 모드).
 * [2026-10-06] 편집 모드 추가 — 유저 전술 화면과 같은 편집 패널(DepthChartEditor/RotationGanttChart/
 *   TacticsSlidersPanel/PlayerTacticsPanel)로 어드민이 참가자의 값을 직접 수정하고 저장한다.
 *   저장은 adminSaveMemberTactics(RPC admin_save_member_tactics) — room_members 갱신 + league_action_logs에
 *   'admin_tactics_update'(변경 diff) 기록. 동시 편집 충돌은 허용(마지막 저장이 이김, 사용자 결정).
 *
 * 데이터 원천은 room_members.tactics(GameTactics) + room_members.depth_chart(DepthChart). room_members.team_id는
 * league_teams.team_slug(옛 데이터는 id일 수 있어 둘 다 매칭). 리그 어드민은 RLS로 모든 멤버 행을 읽을 수 있다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ClipboardList, Pencil, Save, Check, X } from 'lucide-react';
import type { LeagueTeamRow, RoomRow, RoomMemberRow } from '../../../../services/multi/roomQueries';
import { listRoomMembers } from '../../../../services/multi/roomQueries';
import { adminSaveMemberTactics } from '../../../../services/multi/roomPersistence';
import { fetchMetaPlayersByRosterIds } from '../../../../services/multi/instancePlayers';
import { mapRawPlayerToRuntimePlayer } from '../../../../services/dataMapper';
import { generateAutoTactics } from '../../../../services/gameEngine';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { shouldUseCustomOverrides } from '../../../../utils/leagueOverrides';
import { SLIDER_STEPS } from '../../../../services/game/config/sliderSteps';
import { DEFAULT_SLIDERS } from '../../../../services/game/config/tacticPresets';
import { TabBar } from '../../../../components/common/TabBar';
import { DepthChartEditor } from '../../../../components/dashboard/DepthChartEditor';
import { RotationGanttChart } from '../../../../components/dashboard/RotationGanttChart';
import { TacticsSlidersPanel } from '../../../../components/dashboard/tactics/TacticsSlidersPanel';
import { PlayerTacticsPanel } from '../../../../components/dashboard/tactics/PlayerTacticsPanel';
import type { Team, Player } from '../../../../types';
import type { GameTactics, DepthChart, TacticalSliders, PlayerTacticConfig } from '../../../../types/tactics';
import { notify } from '../../../../services/notifications/notify';
import { useLeagueContext } from '../LeagueLayout';

interface Props {
    room: RoomRow | null;
    leagueTeams: LeagueTeamRow[];
}

type PlayerLite = { id: string; name: string; position: string | null };
type EditTab = 'depth' | 'rotation' | 'team' | 'player';

const POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const EDIT_TABS: { id: EditTab; label: string }[] = [
    { id: 'depth', label: '뎁스 차트' }, { id: 'rotation', label: '로테이션' }, { id: 'team', label: '팀 전술' }, { id: 'player', label: '개인 전술' },
];
/** mapRawPlayerToRuntimePlayer가 읽는 컬럼(useLeagueRawStats.RAW_PLAYER_COLS + tendencies). */
const ROSTER_COLS = 'id, name, position, draft_year, base_attributes, tendencies';

/** 슬라이더 표시 순서/라벨 — TacticsSlidersPanel의 라벨과 동일하게 맞춘다. */
const SLIDER_ROWS: { key: keyof TacticalSliders; label: string; group: string }[] = [
    { key: 'pace',           label: '페이스',        group: '공격' },
    { key: 'ballMovement',   label: '볼 회전',       group: '공격' },
    { key: 'offReb',         label: '공격 리바운드',  group: '공격' },
    { key: 'insideOut',      label: '공격 포인트',    group: '공격' },
    { key: 'pnrFreq',        label: '픽앤롤 빈도',    group: '공격' },
    { key: 'shot_3pt',       label: '3점 슛 빈도',    group: '슈팅' },
    { key: 'shot_rim',       label: '골밑 공격 빈도', group: '슈팅' },
    { key: 'shot_mid',       label: '미드레인지 빈도', group: '슈팅' },
    { key: 'defIntensity',   label: '수비 압박 강도', group: '수비' },
    { key: 'switchFreq',     label: '스위치 수비',    group: '수비' },
    { key: 'pnrDefense',     label: '픽앤롤 수비',    group: '수비' },
    { key: 'fullCourtPress', label: '풀코트 프레스',  group: '수비' },
    { key: 'helpDef',        label: '헬프 수비',      group: '수비' },
    { key: 'zoneFreq',       label: '지역 방어',      group: '수비' },
    { key: 'defReb',         label: '수비 리바운드',  group: '수비' },
];

const PNR_DEF_LABEL: Record<number, string> = { 0: '드랍', 1: '헷지', 2: '블리츠' };
const FOUL_LABEL: Record<string, string>    = { auto: '자동', ignore: '무시' };
const GARBAGE_LABEL: Record<string, string> = { auto: '자동', play: '출전', bench: '미출전' };
const CLUTCH_LABEL: Record<string, string>  = { auto: '자동', 'must-play': '강제 투입', 'must-bench': '필수 벤치' };

const sliderText = (key: keyof TacticalSliders, v: number): string => {
    if (key === 'pnrDefense') return `${v} · ${PNR_DEF_LABEL[v] ?? '?'}`;
    const step = SLIDER_STEPS[key]?.find(s => s.value === v);
    return step ? `${v} · ${step.label}` : String(v);
};

/** rotationMap(48칸 boolean)을 "출전 분 / 구간 문자열"로. 예: 24분 · 1~12, 19~36, 43~48 */
const rotationSummary = (arr: boolean[] | undefined): { minutes: number; ranges: string } => {
    if (!Array.isArray(arr)) return { minutes: 0, ranges: '' };
    const ranges: string[] = [];
    let start = -1, minutes = 0;
    for (let i = 0; i <= arr.length; i++) {
        const on = i < arr.length && !!arr[i];
        if (on) minutes++;
        if (on && start < 0) start = i;
        if (!on && start >= 0) { ranges.push(`${start + 1}~${i}`); start = -1; }
    }
    return { minutes, ranges: ranges.join(', ') };
};

export const TeamTacticsTab: React.FC<Props> = ({ room, leagueTeams }) => {
    const { league } = useLeagueContext();
    const useCustomOverrides = shouldUseCustomOverrides(league);

    const [members, setMembers]   = useState<RoomMemberRow[]>([]);
    const [players, setPlayers]   = useState<Map<string, PlayerLite>>(new Map());
    const [loading, setLoading]   = useState(false);
    const [selected, setSelected] = useState<string>('');  // room_members.user_id
    const [tick, setTick]         = useState(0);

    // ── 편집 모드 상태 ──
    const [editing, setEditing]           = useState(false);
    const [editTab, setEditTab]           = useState<EditTab>('depth');
    const [rosterPlayers, setRosterPlayers] = useState<Player[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [draftTactics, setDraftTactics] = useState<GameTactics | null>(null);
    const [draftDepth, setDraftDepth]     = useState<DepthChart | null>(null);
    const [isDirty, setIsDirty]           = useState(false);
    const [saving, setSaving]             = useState(false);
    const [savedFlash, setSavedFlash]     = useState(false);

    // room_members.team_id(슬러그 또는 옛 id) → league_teams 행
    const teamByKey = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        leagueTeams.forEach(t => { m.set(t.team_slug, t); m.set(t.id, t); });
        return m;
    }, [leagueTeams]);
    const memberTeam = useCallback((m: RoomMemberRow | null): LeagueTeamRow | null => (m?.team_id ? teamByKey.get(m.team_id) ?? null : null), [teamByKey]);

    useEffect(() => {
        if (!room?.id) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const rows = await listRoomMembers(room.id);
                // 뎁스차트·전술에 등장하는 모든 선수 id → 이름/포지션 (인스턴스 룸도 해석됨)
                const ids = new Set<string>();
                rows.forEach(m => {
                    const t = m.tactics as GameTactics | null;
                    const d = m.depth_chart as DepthChart | null;
                    POSITIONS.forEach(p => { d?.[p]?.forEach(id => id && ids.add(id)); t?.depthChart?.[p]?.forEach(id => id && ids.add(id)); });
                    if (t) {
                        Object.values(t.starters ?? {}).forEach(id => id && ids.add(id));
                        Object.keys(t.rotationMap ?? {}).forEach(id => ids.add(id));
                        Object.keys(t.minutesLimits ?? {}).forEach(id => ids.add(id));
                        Object.keys(t.playerTactics ?? {}).forEach(id => ids.add(id));
                        if (t.stopperId) ids.add(t.stopperId);
                    }
                    memberTeam(m)?.roster?.forEach(id => ids.add(id));
                });
                const raw = await fetchMetaPlayersByRosterIds(room.id, [...ids], 'id, name, position');
                if (cancelled) return;
                const map = new Map<string, PlayerLite>();
                raw.forEach(r => map.set(String(r.id), { id: String(r.id), name: String(r.name ?? ''), position: (r.position as string) ?? null }));
                setPlayers(map);
                const sorted = [...rows].sort((a, b) => (a.team_abbr ?? '').localeCompare(b.team_abbr ?? ''));
                setMembers(sorted);
                setSelected(prev => (prev && sorted.some(m => m.user_id === prev) ? prev : (sorted[0]?.user_id ?? '')));
            } catch (e) {
                if (cancelled) return;
                notify.error('팀 전술 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.', { source: 'teamTactics.load' });
                console.error('[teamTactics.load]', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [room?.id, memberTeam, tick]);

    const current = members.find(m => m.user_id === selected) ?? null;
    const tactics = (current?.tactics as GameTactics | null) ?? null;
    const depth   = ((current?.depth_chart as DepthChart | null) ?? tactics?.depthChart) ?? null;
    const team    = memberTeam(current);

    const pName = (id: string | null | undefined): string => {
        if (!id) return '—';
        const p = players.get(id);
        return p ? p.name : id.slice(0, 8);
    };
    const pPos = (id: string | null | undefined): string => (id && players.get(id)?.position) || '';

    // 로테이션/선수별 전술 표의 행 순서: 선발 5 → 뎁스차트 순 → 나머지
    const rotationRows = useMemo(() => {
        if (!tactics) return [] as string[];
        const order: string[] = [];
        const push = (id: string | null | undefined) => { if (id && !order.includes(id)) order.push(id); };
        POSITIONS.forEach(p => push(tactics.starters?.[p]));
        POSITIONS.forEach(p => depth?.[p]?.forEach(push));
        Object.keys(tactics.rotationMap ?? {}).forEach(push);
        Object.keys(tactics.playerTactics ?? {}).forEach(push);
        team?.roster?.forEach(push);
        return order;
    }, [tactics, depth, team]);

    const depthRows = depth ? Math.max(...POSITIONS.map(p => depth[p]?.length ?? 0), 0) : 0;
    const sliders = { ...DEFAULT_SLIDERS, ...(tactics?.sliders ?? {}) };

    // ── 편집 모드: 로스터 하이드레이션(런타임 Player) + 초안 리셋 ──
    const rosterKey = team?.roster?.join(',') ?? '';
    useEffect(() => {
        if (!editing || !room?.id) return;
        let cancelled = false;
        if (!team?.roster?.length) { setRosterPlayers([]); return; }
        setRosterLoading(true);
        (async () => {
            try {
                const raw = await fetchMetaPlayersByRosterIds(room.id, team.roster, ROSTER_COLS);
                if (cancelled) return;
                const byId = new Map(raw.map(r => [String(r.id), r]));
                const ordered = team.roster.map(id => byId.get(String(id))).filter(Boolean) as Record<string, unknown>[];
                setRosterPlayers(ordered.map(r => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true)));
            } catch (e) {
                if (cancelled) return;
                notify.error('로스터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.', { source: 'teamTactics.roster' });
                console.error('[teamTactics.roster]', e);
            } finally {
                if (!cancelled) setRosterLoading(false);
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing, room?.id, rosterKey, useCustomOverrides]);

    const editTeam = useMemo((): Team => ({
        id: team?.team_slug ?? '', name: team?.team_name ?? '', city: '', logo: '', conference: 'East', division: '',
        wins: 0, losses: 0, budget: 0, salaryCap: 0, luxuryTaxLine: 0, roster: rosterPlayers,
    }), [team?.team_slug, team?.team_name, rosterPlayers]);

    // 멤버 전환/로스터 로드 완료 시 초안을 저장된 값으로 리셋(없으면 자동 생성)
    useEffect(() => {
        if (!editing || rosterLoading || rosterPlayers.length === 0) return;
        setDraftTactics(tactics ?? generateAutoTactics(editTeam, undefined, true));
        setDraftDepth(depth);
        setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing, selected, rosterLoading, rosterPlayers.length]);

    const handleUpdateTactics = useCallback((t: GameTactics) => { setDraftTactics(t); setIsDirty(true); }, []);
    const handleUpdateDepth   = useCallback((dc: DepthChart) => { setDraftDepth(dc); setIsDirty(true); }, []);
    const healthySorted = useMemo(
        () => rosterPlayers.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [rosterPlayers],
    );
    const noopViewPlayer = useCallback(() => {}, []);

    const confirmDiscard = (): boolean => !isDirty || window.confirm('저장하지 않은 변경사항이 있습니다. 계속하면 사라집니다.');
    const handleSelect = (userId: string) => {
        if (userId === selected) return;
        if (!confirmDiscard()) return;
        setSelected(userId);
    };
    const handleExitEdit = () => { if (!confirmDiscard()) return; setEditing(false); setIsDirty(false); };

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => { if (!isDirty) return; e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleSave = useCallback(async () => {
        if (!room?.id || !current?.user_id || !draftTactics) return;
        setSaving(true);
        const { error, changed } = await adminSaveMemberTactics(room.id, current.user_id, draftTactics, draftDepth);
        setSaving(false);
        if (error) {
            notify.error('전술 저장에 실패했습니다. 잠시 후 다시 시도하세요.', { source: 'teamTactics.save' });
            console.error('[teamTactics.save]', error);
            return;
        }
        // 로컬 멤버 목록에도 반영 → 보기 모드로 돌아가도 방금 저장한 값이 보임
        setMembers(prev => prev.map(m => (m.user_id === current.user_id ? { ...m, tactics: draftTactics, depth_chart: draftDepth } : m)));
        setIsDirty(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
        if (changed) notify.success(`${team?.team_abbr ?? ''} 전술을 저장했습니다. (로그 기록됨)`);
    }, [room?.id, current?.user_id, draftTactics, draftDepth, team?.team_abbr]);

    const editReady = editing && !rosterLoading && !!draftTactics;
    const th = 'text-left py-1.5 px-2 text-slate-400 font-bold whitespace-nowrap border-b border-slate-700/60';
    const td = 'py-1.5 px-2 whitespace-nowrap border-b border-slate-800';

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-indigo-300" />
                <h3 className="text-sm font-bold text-white ko-tight">팀 전술</h3>
                <span className="text-xs text-slate-500 ko-normal">
                    {editing ? '편집 모드 — 저장하면 참가자의 전술이 즉시 바뀌고 세션 로그에 기록됩니다' : '참가자가 저장한 뎁스차트·전술 슬라이더·로테이션·선수별 설정'}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    {!editing && (
                        <button
                            onClick={() => setTick(t => t + 1)}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-xs font-bold text-white transition-colors"
                        >
                            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}새로고침
                        </button>
                    )}
                    {!editing && current && (
                        <button
                            onClick={() => { setEditing(true); setEditTab('depth'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition-colors"
                        >
                            <Pencil size={12} />편집
                        </button>
                    )}
                    {editing && (
                        <>
                            {isDirty && <span className="text-xs text-amber-400 ko-normal">저장되지 않은 변경사항</span>}
                            <button
                                onClick={handleSave}
                                disabled={saving || !isDirty || !editReady}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors"
                            >
                                {saving ? <><Loader2 size={12} className="animate-spin" />저장 중…</> : savedFlash ? <><Check size={12} />저장됨</> : <><Save size={12} />저장</>}
                            </button>
                            <button
                                onClick={handleExitEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-colors"
                            >
                                <X size={12} />보기로
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 팀 선택 */}
            <div className="flex flex-wrap gap-1.5">
                {members.map(m => {
                    const t = memberTeam(m);
                    const label = t?.team_abbr ?? m.team_abbr ?? '팀 없음';
                    const has = !!m.tactics;
                    const active = m.user_id === selected;
                    return (
                        <button
                            key={m.user_id}
                            onClick={() => handleSelect(m.user_id)}
                            title={`${t?.team_name ?? m.team_name ?? ''} · ${t?.nickname ?? ''}${m.is_ai ? ' (AI)' : ''}${has ? '' : ' · 전술 미저장'}`}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${active ? 'bg-indigo-600 text-white' : has ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                        >
                            {label}
                        </button>
                    );
                })}
                {members.length === 0 && !loading && <span className="text-xs text-slate-500 ko-normal">참가자가 없습니다.</span>}
            </div>

            {current && (
                <div className="text-xs text-slate-300 ko-normal flex flex-wrap gap-x-4 gap-y-1">
                    <span><span className="text-slate-500">팀</span> <span className="text-white font-bold">{team?.team_name ?? current.team_name ?? '—'}</span></span>
                    <span><span className="text-slate-500">담당</span> {team?.nickname ?? '—'}{current.is_ai ? ' (AI)' : ''}</span>
                    <span><span className="text-slate-500">스토퍼</span> {pName(tactics?.stopperId)}</span>
                    <span><span className="text-slate-500">로스터</span> {team?.roster?.length ?? 0}명</span>
                </div>
            )}

            {/* ── 편집 모드 ── */}
            {editing && (
                !editReady ? (
                    <div className="py-12 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
                ) : (
                    <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl overflow-hidden">
                        <TabBar<EditTab> tabs={EDIT_TABS} activeTab={editTab} onTabChange={setEditTab} />
                        {!tactics && <p className="px-6 pt-3 text-xs text-amber-300 ko-normal">저장된 전술이 없어 자동 생성 전술을 초안으로 깔았습니다. 저장하면 이 참가자의 전술로 등록됩니다.</p>}
                        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {editTab === 'depth' && (
                                <DepthChartEditor team={editTeam} tactics={draftTactics!} depthChart={draftDepth} onUpdateDepthChart={handleUpdateDepth} onUpdateTactics={handleUpdateTactics} />
                            )}
                            {editTab === 'rotation' && (
                                <RotationGanttChart team={editTeam} tactics={draftTactics!} depthChart={draftDepth} healthySorted={healthySorted} onUpdateTactics={handleUpdateTactics} onViewPlayer={noopViewPlayer} />
                            )}
                            {editTab === 'team' && (
                                <div className="p-8 pb-16"><TacticsSlidersPanel tactics={draftTactics!} onUpdateTactics={handleUpdateTactics} roster={rosterPlayers} /></div>
                            )}
                            {editTab === 'player' && (
                                <div className="pb-16"><PlayerTacticsPanel tactics={draftTactics!} roster={rosterPlayers} onUpdateTactics={handleUpdateTactics} /></div>
                            )}
                        </div>
                    </div>
                )
            )}

            {/* ── 보기 모드 ── */}
            {!editing && current && !tactics && !depth && (
                <p className="text-xs text-amber-300 ko-normal">이 참가자는 아직 전술을 저장하지 않았습니다 (경기 시 자동 생성 전술 사용). "편집"으로 직접 만들어 줄 수 있습니다.</p>
            )}

            {!editing && (tactics || depth) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {/* 뎁스차트 */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-white ko-tight">뎁스차트</h4>
                        <table className="w-full text-xs">
                            <thead><tr><th className={th}>#</th>{POSITIONS.map(p => <th key={p} className={th}>{p}</th>)}</tr></thead>
                            <tbody>
                                {depthRows === 0 && <tr><td colSpan={6} className={`${td} text-slate-500`}>뎁스차트 없음</td></tr>}
                                {Array.from({ length: depthRows }).map((_, i) => (
                                    <tr key={i}>
                                        <td className={`${td} text-slate-500`}>{i + 1}</td>
                                        {POSITIONS.map(p => {
                                            const id = depth?.[p]?.[i] ?? null;
                                            return (
                                                <td key={p} className={`${td} ${i === 0 ? 'text-white font-bold' : 'text-slate-200'}`}>
                                                    {pName(id)}{id && pPos(id) ? <span className="text-slate-500 ml-1">{pPos(id)}</span> : null}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {tactics?.starters && (
                            <p className="text-[11px] text-slate-500 ko-normal">저장된 선발: {POSITIONS.map(p => `${p} ${pName(tactics.starters[p])}`).join(' · ')}</p>
                        )}
                    </div>

                    {/* 슬라이더 */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-white ko-tight">전술 슬라이더</h4>
                        <table className="w-full text-xs">
                            <thead><tr><th className={th}>구분</th><th className={th}>항목</th><th className={th}>값</th></tr></thead>
                            <tbody>
                                {SLIDER_ROWS.map(r => (
                                    <tr key={r.key}>
                                        <td className={`${td} text-slate-500`}>{r.group}</td>
                                        <td className={`${td} text-slate-200`}>{r.label}</td>
                                        <td className={`${td} text-white tabular-nums`}>{sliderText(r.key, sliders[r.key])}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td className={`${td} text-slate-500`}>수비</td>
                                    <td className={`${td} text-slate-200`}>존 실행 품질 (zoneUsage)</td>
                                    <td className={`${td} text-white tabular-nums`}>{sliders.zoneUsage}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* 로테이션 + 선수별 전술 */}
                    <div className="space-y-2 xl:col-span-2">
                        <h4 className="text-xs font-bold text-white ko-tight">로테이션 · 선수별 전술</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr>
                                        <th className={th}>선수</th><th className={th}>포지션</th><th className={th}>선발</th>
                                        <th className={th}>출전 분</th><th className={th}>출전 구간(분)</th><th className={th}>분 제한</th>
                                        <th className={th}>휴식 체력</th><th className={th}>복귀 체력</th><th className={th}>파울 트러블</th><th className={th}>가비지</th><th className={th}>클러치</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rotationRows.length === 0 && <tr><td colSpan={11} className={`${td} text-slate-500`}>로테이션 없음</td></tr>}
                                    {rotationRows.map(id => {
                                        const rot = rotationSummary(tactics?.rotationMap?.[id]);
                                        const pt: PlayerTacticConfig = tactics?.playerTactics?.[id] ?? {};
                                        const starterPos = POSITIONS.find(p => tactics?.starters?.[p] === id);
                                        const limit = tactics?.minutesLimits?.[id];
                                        return (
                                            <tr key={id}>
                                                <td className={`${td} ${starterPos ? 'text-white font-bold' : 'text-slate-200'}`}>{pName(id)}</td>
                                                <td className={`${td} text-slate-400`}>{pPos(id)}</td>
                                                <td className={`${td} text-slate-200`}>{starterPos ?? ''}</td>
                                                <td className={`${td} text-white tabular-nums`}>{rot.minutes}</td>
                                                <td className={`${td} text-slate-300 tabular-nums`}>{rot.ranges || '—'}</td>
                                                <td className={`${td} text-slate-300 tabular-nums`}>{limit ?? '—'}</td>
                                                <td className={`${td} text-slate-300 tabular-nums`}>{pt.restThreshold ?? '—'}</td>
                                                <td className={`${td} text-slate-300 tabular-nums`}>{pt.returnThreshold ?? '—'}</td>
                                                <td className={`${td} text-slate-300`}>{pt.foulPolicy ? FOUL_LABEL[pt.foulPolicy] ?? pt.foulPolicy : '—'}</td>
                                                <td className={`${td} text-slate-300`}>{pt.garbagePolicy ? GARBAGE_LABEL[pt.garbagePolicy] ?? pt.garbagePolicy : '—'}</td>
                                                <td className={`${td} text-slate-300`}>{pt.clutchPolicy ? CLUTCH_LABEL[pt.clutchPolicy] ?? pt.clutchPolicy : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-slate-500 ko-normal">출전 구간은 경기 1~48분 기준, "—"는 미설정(엔진 기본값 사용).</p>
                    </div>
                </div>
            )}
        </section>
    );
};
