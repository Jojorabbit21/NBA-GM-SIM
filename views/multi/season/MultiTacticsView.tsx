
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, Save, Check } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useSeasonContext } from './seasonContext';
import { TabBar } from '../../../components/common/TabBar';
import { DepthRotationBoard } from '../../../components/dashboard/DepthRotationBoard';
import { TacticsSlidersPanel } from '../../../components/dashboard/tactics/TacticsSlidersPanel';
import { PlayerTacticsPanel } from '../../../components/dashboard/tactics/PlayerTacticsPanel';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { generateAutoTactics } from '../../../services/gameEngine';
import { getServerNow } from '../../../utils/serverClock';
import { isFinal } from './multiGameReveal';
import type { Team } from '../../../types';

type MultiTacticsTab = 'depth' | 'team' | 'player';

// 팀 전술 탭의 슈팅 존 히트맵(TeamZoneChart)은 roster[].stats.zone_rim_m 등을 합산해서
// 그리는데, 드래프트 직후 새로 매핑한 Player는 stats가 전부 0(defaultStats)이라 항상
// 0%로만 보인다. game_pbp.home_box/away_box의 zoneData(경기별 선수 슛존 집계)를
// 선수별로 누적해서 병합해줘야 실제 토너먼트 기록이 반영된다.
const ZONE_KEYS = [
    'zone_rim_m', 'zone_rim_a', 'zone_paint_m', 'zone_paint_a',
    'zone_mid_l_m', 'zone_mid_l_a', 'zone_mid_c_m', 'zone_mid_c_a', 'zone_mid_r_m', 'zone_mid_r_a',
    'zone_c3_l_m', 'zone_c3_l_a', 'zone_c3_r_m', 'zone_c3_r_a',
    'zone_atb3_l_m', 'zone_atb3_l_a', 'zone_atb3_c_m', 'zone_atb3_c_a', 'zone_atb3_r_m', 'zone_atb3_r_a',
] as const;

const MultiTacticsView: React.FC = () => {
    const { league, leagueTeams, members, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();

    const [activeTab, setActiveTab] = useState<MultiTacticsTab>('depth');

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeamRow = leagueTeams.find(t => t.team_slug === myTeamId) ?? null;

    const {
        userTactics, setUserTactics,
        depthChart, setDepthChart,
        coachingData,
        isLoading: gameLoading,
        isTacticsDirty, saveTactics,
    } = useSeasonContext();

    // ── 전술 저장 ──────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    const handleSaveTactics = useCallback(async () => {
        setSaving(true);
        const { error } = await saveTactics();
        setSaving(false);
        if (!error) {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
        }
    }, [saveTactics]);

    // 저장 안 된 변경사항이 있는 채로 브라우저를 나가려 하면(새로고침/탭 닫기/URL 이동)
    // 확인 프롬프트를 띄운다. 앱 내부 라우트 전환(사이드바 클릭 등)은 이 프로젝트가
    // BrowserRouter(선언형)를 써서 useBlocker를 못 쓰는 관계로 범위 밖.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isTacticsDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isTacticsDirty]);

    // 홈 위젯/로스터/리더보드 화면과 원본 fetch(meta_players+game_pbp)를 공유 — queryKey가
    // 같으면(room.id + 리그 전체 로스터 id 목록) 다른 화면을 먼저 방문했을 때 이미 캐시가
    // 워밍돼 있어 로더 없이 즉시 뜬다. [Fix 2026-08-13] 예전엔 이 화면만 별도 useEffect 2개로
    // meta_players/game_pbp를 각자 fetch해서, 화면(탭바+패널 껍데기)은 isReady(userTactics만
    // 확인)로 먼저 뜨고 레이더차트/슈팅맵은 두 fetch가 각자 끝나는 시점에 뒤늦게 채워지는
    // "워터폴" 현상이 있었다 — 이제 isReady에 이 fetch의 로딩 상태도 포함시켜 함께 기다린다.
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    const selectTacticsData = useCallback((raw: LeagueRawStatsData) => {
        // .in() 조회는 입력 배열 순서를 보장하지 않으므로, 드래프트 픽 순서(roster 배열 순서)대로 재정렬
        const draftOrder = myTeamRow?.roster ?? [];
        const byId = new Map(raw.playersRaw.map((r: any) => [String(r.id), r]));
        const orderedRaw = draftOrder.map(id => byId.get(String(id))).filter(Boolean);
        const rosterPlayers = orderedRaw.map((r: any) => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true));

        // 슈팅 존 히트맵용 — 우리 팀이 치른 경기들의 박스스코어에서 선수별 존 슛 집계를 누적
        const now = getServerNow();
        const zoneMap = new Map<string, Record<string, number>>();
        for (const row of raw.pbpRows as any[]) {
            if (row.home_team_id !== myTeamId && row.away_team_id !== myTeamId) continue;
            if (!isFinal({ scheduledAt: row.game_start_time, played: true }, now)) continue;
            const box = row.home_team_id === myTeamId ? (row.home_box ?? []) : (row.away_box ?? []);
            for (const bs of box as any[]) {
                if (!bs.playerId) continue;
                const zd = bs.zoneData ?? {};
                const prev = zoneMap.get(bs.playerId) ?? {};
                const next = { ...prev };
                for (const k of ZONE_KEYS) next[k] = (prev[k] ?? 0) + (zd[k] ?? 0);
                zoneMap.set(bs.playerId, next);
            }
        }

        return { rosterPlayers, zoneMap };
    }, [myTeamRow?.roster, myTeamId, useCustomOverrides]);

    const {
        data: tacticsRawData,
        isPending: rosterFetchLoading,
    } = useLeagueRawStats(room?.id, allRosterIds, selectTacticsData);

    const rosterPlayers = tacticsRawData?.rosterPlayers ?? [];
    const zoneStatsMap  = tacticsRawData?.zoneMap ?? new Map<string, Record<string, number>>();

    const rosterWithZoneStats = useMemo(() => {
        if (zoneStatsMap.size === 0) return rosterPlayers;
        return rosterPlayers.map(p => {
            const z = zoneStatsMap.get(p.id);
            if (!z) return p;
            return { ...p, stats: { ...p.stats, ...z } };
        });
    }, [rosterPlayers, zoneStatsMap]);

    const team = useMemo((): Team => ({
        id:            myTeamId ?? '',
        name:          myTeamRow?.team_name ?? '',
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
    }), [myTeamId, myTeamRow?.team_name, rosterPlayers]);

    const coachName = coachingData?.[myTeamId ?? '']?.headCoach?.name;

    // tactics가 없는 신규 유저: 로스터 로드 완료 후 자동 생성
    // preserveDraftOrder=true — 드래프트에서 먼저 뽑은 선수가 선발을 유지하고,
    // 같은 포지션을 나중에 뽑은 선수(OVR이 더 높아도)는 벤치로 배정되도록 한다.
    useEffect(() => {
        if (gameLoading || userTactics || rosterPlayers.length === 0) return;
        setUserTactics(generateAutoTactics(team, undefined, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameLoading, userTactics, rosterPlayers.length, team, setUserTactics]);

    const isReady = !leagueLoading && !gameLoading && !!userTactics && !rosterFetchLoading;

    if (!isReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            <TabBar
                tabs={[
                    { id: 'depth' as MultiTacticsTab,  label: '뎁스 차트 · 로테이션' },
                    { id: 'team' as MultiTacticsTab,   label: '팀 전술' },
                    { id: 'player' as MultiTacticsTab, label: '개인 전술' },
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                rightSlot={
                    <>
                        {isTacticsDirty && (
                            <span className="text-xs text-amber-400 ko-normal">저장되지 않은 변경사항이 있습니다</span>
                        )}
                        <button
                            onClick={handleSaveTactics}
                            disabled={saving || !isTacticsDirty}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                                saving || !isTacticsDirty
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                    : 'hover:brightness-110 active:scale-95'
                            }`}
                            style={!saving && isTacticsDirty ? {
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
                    </>
                }
            />
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {activeTab === 'depth' && (
                    <DepthRotationBoard
                        team={team}
                        tactics={userTactics!}
                        depthChart={depthChart}
                        onUpdateDepthChart={setDepthChart}
                        onUpdateTactics={setUserTactics}
                        coachName={coachName}
                    />
                )}
                {activeTab === 'team' && (
                    <div className="p-8 pb-20">
                        <TacticsSlidersPanel
                            tactics={userTactics!}
                            onUpdateTactics={setUserTactics}
                            roster={rosterWithZoneStats}
                        />
                    </div>
                )}
                {activeTab === 'player' && (
                    <div className="pb-20">
                        <PlayerTacticsPanel
                            tactics={userTactics!}
                            roster={rosterPlayers}
                            onUpdateTactics={setUserTactics}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiTacticsView;
