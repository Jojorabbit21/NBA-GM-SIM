
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Save, Check } from 'lucide-react';
import { useLeagueContext } from './LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { TabBar } from '../../../components/common/TabBar';
import { DepthChartEditor } from '../../../components/dashboard/DepthChartEditor';
import { RotationGanttChart } from '../../../components/dashboard/RotationGanttChart';
import { TacticsSlidersPanel } from '../../../components/dashboard/tactics/TacticsSlidersPanel';
import { PlayerTacticsPanel } from '../../../components/dashboard/tactics/PlayerTacticsPanel';
import { AdminTradePanel } from '../../../components/dashboard/AdminTradePanel';
import { supabase } from '../../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { generateAutoTactics } from '../../../services/gameEngine';
import { calculatePlayerOvr } from '../../../utils/constants';
import { saveMemberTactics } from '../../../services/multi/roomPersistence';
import type { Team, Player, GameTactics, DepthChart } from '../../../types';

type AdminTab = 'depth' | 'rotation' | 'team' | 'player' | 'trade';

const AdminTeamEditorView: React.FC = () => {
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, members, leagueTeams, isLoading: leagueLoading, reload } = useLeagueContext();
    const { session } = useGame();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');

    const isAdmin = !!(league && session?.user?.id && league.admin_user_id === session.user.id);

    // 비어드민 접근 차단
    useEffect(() => {
        if (!leagueLoading && league && !isAdmin) {
            navigate(`/multi/leagues/${leagueId}/lobby`, { replace: true });
        }
    }, [leagueLoading, league, isAdmin, leagueId, navigate]);

    const [activeTab, setActiveTab] = useState<AdminTab>('team');
    const [selectedSlug, setSelectedSlug] = useState<string>('');

    const sortedTeams = useMemo(
        () => [...leagueTeams].sort((a, b) => a.team_name.localeCompare(b.team_name)),
        [leagueTeams],
    );

    useEffect(() => {
        if (!selectedSlug && sortedTeams.length > 0) setSelectedSlug(sortedTeams[0].team_slug);
    }, [selectedSlug, sortedTeams]);

    const selectedTeamRow = leagueTeams.find(t => t.team_slug === selectedSlug) ?? null;
    const selectedMember = members.find(m => m.team_id === selectedSlug) ?? null;

    // ── 로스터 하이드레이션 (선택된 팀이 바뀔 때마다) ──────────────────────────
    const [rosterPlayers, setRosterPlayers] = useState<Player[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const rosterKey = selectedTeamRow?.roster?.join(',') ?? '';

    useEffect(() => {
        if (!selectedTeamRow?.roster?.length) { setRosterPlayers([]); return; }
        setRosterLoading(true);
        const draftOrder = selectedTeamRow.roster;
        supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', draftOrder)
            .then(({ data }) => {
                if (!data) { setRosterLoading(false); return; }
                const byId = new Map(data.map((raw: any) => [String(raw.id), raw]));
                const ordered = draftOrder.map(id => byId.get(String(id))).filter(Boolean);
                setRosterPlayers(ordered.map((raw: any) => mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true)));
                setRosterLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rosterKey]);

    const team = useMemo((): Team => ({
        id:            selectedSlug,
        name:          selectedTeamRow?.team_name ?? '',
        city:          '',
        logo:          '',
        conference:    'East',
        division:      '',
        wins:          0,
        losses:        0,
        budget:        0,
        salaryCap:     0,
        luxuryTaxLine: 0,
        roster:        rosterPlayers,
    }), [selectedSlug, selectedTeamRow?.team_name, rosterPlayers]);

    // ── draft 편집 상태 (저장 버튼을 눌러야만 실제로 반영됨) ────────────────────
    const [draftTactics, setDraftTactics] = useState<GameTactics | null>(null);
    const [draftDepthChart, setDraftDepthChart] = useState<DepthChart | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // 팀 전환/로스터 로드 완료 시 draft를 해당 팀의 저장된 값으로 리셋 (없으면 자동 생성)
    useEffect(() => {
        if (rosterLoading || rosterPlayers.length === 0) return;
        const existing = (selectedMember?.tactics as GameTactics | null) ?? null;
        setDraftTactics(existing ?? generateAutoTactics(team, undefined, true));
        setDraftDepthChart((selectedMember?.depth_chart as DepthChart | null) ?? null);
        setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSlug, rosterLoading, rosterPlayers.length]);

    const handleUpdateTactics = useCallback((t: GameTactics) => {
        setDraftTactics(t);
        setIsDirty(true);
    }, []);
    const handleUpdateDepthChart = useCallback((dc: DepthChart) => {
        setDraftDepthChart(dc);
        setIsDirty(true);
    }, []);

    // 팀 전환 — 저장 안 한 변경사항이 있으면 확인
    const handleSelectTeam = useCallback((slug: string) => {
        if (slug === selectedSlug) return;
        if (isDirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 팀을 전환하면 사라집니다. 계속할까요?')) {
            return;
        }
        setSelectedSlug(slug);
    }, [selectedSlug, isDirty]);

    // 브라우저 이탈 시에도 동일하게 경고
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // ── 저장 ──────────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    const handleSave = useCallback(async () => {
        if (!room?.id || !selectedMember?.user_id) return;
        setSaving(true);
        const { error } = await saveMemberTactics(room.id, selectedMember.user_id, draftTactics, draftDepthChart);
        setSaving(false);
        if (!error) {
            setIsDirty(false);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
        }
    }, [room?.id, selectedMember?.user_id, draftTactics, draftDepthChart]);

    // 트레이드 실행 직후 팀A(현재 보고 있는 팀)의 draft 상태를 새 자동전술로 즉시 반영 —
    // reload()만 믿으면 rosterPlayers.length가 안 바뀌는 트레이드(예: 1:1)에서 리셋 useEffect가
    // 안 돌아 화면이 트레이드 이전 뎁스차트를 계속 보여주는 문제가 생긴다.
    const handleTradeComplete = useCallback((newTacticsA: GameTactics) => {
        setDraftTactics(newTacticsA);
        setDraftDepthChart(newTacticsA.depthChart ?? null);
        setIsDirty(false);
        reload();
    }, [reload]);

    const healthySorted = useMemo(
        () => rosterPlayers.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [rosterPlayers],
    );

    // 어드민 화면에서는 선수 상세로 이동할 "내 팀" 컨텍스트가 없으므로 no-op
    const handleViewPlayer = useCallback(() => {}, []);

    const isReady = !leagueLoading && !rosterLoading && !!draftTactics;

    if (!isAdmin) return null; // 리다이렉트 대기 중

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            {/* 팀 선택 헤더 */}
            <div className="px-8 py-4 border-b border-slate-800 bg-slate-950 flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-500 ko-normal shrink-0">팀 선택</span>
                <select
                    value={selectedSlug}
                    onChange={e => handleSelectTeam(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                    {sortedTeams.map(t => (
                        <option key={t.team_slug} value={t.team_slug}>
                            {t.team_name}{t.is_ai ? ' (AI)' : ''}
                        </option>
                    ))}
                </select>
                {isDirty && (
                    <span className="text-xs text-amber-400 ko-normal">저장되지 않은 변경사항이 있습니다</span>
                )}
            </div>

            {!selectedMember && !rosterLoading && selectedSlug && (
                <div className="px-8 py-2 bg-red-950/40 border-b border-red-900/40 text-xs text-red-400 ko-normal shrink-0">
                    이 팀에 연결된 담당 계정(room_members) 정보가 없어 저장이 불가능합니다.
                </div>
            )}

            {!isReady ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={28} className="animate-spin text-indigo-400" />
                </div>
            ) : (
                <>
                    <TabBar
                        tabs={[
                            { id: 'depth' as AdminTab,    label: '뎁스 차트' },
                            { id: 'rotation' as AdminTab, label: '로테이션' },
                            { id: 'team' as AdminTab,     label: '팀 전술' },
                            { id: 'player' as AdminTab,   label: '개인 전술' },
                            { id: 'trade' as AdminTab,    label: '트레이드' },
                        ]}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        rightSlot={
                            <button
                                onClick={handleSave}
                                disabled={saving || !isDirty || !selectedMember}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                                    saving || !isDirty || !selectedMember
                                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                        : 'hover:brightness-110 active:scale-95'
                                }`}
                                style={!saving && isDirty && selectedMember ? {
                                    backgroundColor: '#10b981',
                                    color: '#fff',
                                    boxShadow: '0 0 12px rgba(16,185,129,0.5)',
                                } : {}}
                            >
                                {saving
                                    ? <><Loader2 size={13} className="animate-spin" />저장 중…</>
                                    : savedFlash
                                    ? <><Check size={13} />저장됨</>
                                    : <><Save size={13} />저장</>
                                }
                            </button>
                        }
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {activeTab === 'depth' && (
                            <DepthChartEditor
                                team={team}
                                tactics={draftTactics!}
                                depthChart={draftDepthChart}
                                onUpdateDepthChart={handleUpdateDepthChart}
                                onUpdateTactics={handleUpdateTactics}
                            />
                        )}
                        {activeTab === 'rotation' && (
                            <RotationGanttChart
                                team={team}
                                tactics={draftTactics!}
                                depthChart={draftDepthChart}
                                healthySorted={healthySorted}
                                onUpdateTactics={handleUpdateTactics}
                                onViewPlayer={handleViewPlayer}
                            />
                        )}
                        {activeTab === 'team' && (
                            <div className="p-8 pb-20">
                                <TacticsSlidersPanel
                                    tactics={draftTactics!}
                                    onUpdateTactics={handleUpdateTactics}
                                    roster={rosterPlayers}
                                />
                            </div>
                        )}
                        {activeTab === 'player' && (
                            <div className="pb-20">
                                <PlayerTacticsPanel
                                    tactics={draftTactics!}
                                    roster={rosterPlayers}
                                    onUpdateTactics={handleUpdateTactics}
                                />
                            </div>
                        )}
                        {activeTab === 'trade' && room?.id && session?.user?.id && (
                            <AdminTradePanel
                                roomId={room.id}
                                adminUserId={session.user.id}
                                leagueTeams={leagueTeams}
                                members={members}
                                teamASlug={selectedSlug}
                                teamARoster={rosterPlayers}
                                useCustomOverrides={useCustomOverrides}
                                onTradeComplete={handleTradeComplete}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminTeamEditorView;
