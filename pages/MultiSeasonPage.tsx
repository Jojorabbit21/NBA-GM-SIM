
import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronRight, ChevronLeft, Flame, TrendingUp, Star, ArrowLeftRight, Tv, BarChart3, Trophy, Shield, HeartPulse, Swords, type LucideIcon } from 'lucide-react';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../hooks/useLeagueRawStats';
import { useLeagueHeadlines, type LeagueEvent, type LeagueEventType } from '../hooks/useLeagueHeadlines';
import { useGameShortCodes } from '../hooks/useGameShortCodes';
import { useGame } from '../hooks/useGameContext';
import { supabase } from '../services/supabaseClient';
import { fetchLiveGamesSummary, fetchLiveGameView, type LiveGameSummary } from '../services/multi/liveGameService';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { OvrBadge } from '../components/common/OvrBadge';
import { useServerClock, getServerNow } from '../utils/serverClock';
import { computeWL, computeMultiStandingsStats, computePlayoffOddsMap, type MultiTeamMeta } from '../views/multi/season/multiSeasonUtils';
import { isFinal, resolveRealAt, getGameDisplayState, REPLAY_DURATION_MS } from '../views/multi/season/multiGameReveal';
import { loadGameLeadersCache, mergeGameLeadersCache, computeGameLeaders, type QuarterScores } from '../services/multi/gameLeadersCache';
import type { LeagueTeamRow } from '../services/multi/roomQueries';
import type { PlayerBoxScore, BoxTick, BoxDelta } from '../types/engine';
import { getReadableTextColor } from '../utils/colorContrast';
import { TEAM_DATA } from '../data/teamData';
import type { Game } from '../types';

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
    const dt = new Date(d.slice(0, 10) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// 점보트론 날짜 표기 — yyyy-mm-dd 그대로(스케줄 date 필드가 이미 이 형식이지만 ISO 타임스탬프가
// 섞여 들어올 수 있어 앞 10자만 방어적으로 자른다).
function fmtDateISO(d: string) {
    return d.slice(0, 10);
}

// 승률 표기 — 농구 통계 관례대로 선행 0 없이 ".650"/"1.000" 형태.
function fmtPct(pct: number): string {
    if (pct >= 1) return '1.000';
    return pct.toFixed(3).replace(/^0/, '');
}

// 진행 중인 경기 카드의 라이브 스코어 폴링 주기 — MultiScheduleView.tsx와 동일한 값.
const LIVE_POLL_MS = 5000;

// ─── 라이브 박스스코어 점진 재구성 ──────────────────────────────────────────────
// fetchLiveGameView()가 live 구간에 돌려주는 homeBox/awayBox는 스포일러 방지를 위해
// 서버(liveGameView.ts identityOnly())가 playerId/playerName/position만 남기고 스탯을
// 전부 지운 상태다(실제 DB의 home_box/away_box는 시뮬레이션이 미리 끝난 "최종" 값이라
// 그대로 노출하면 라이브 중계 도중 결과가 새 버린다). 진행 중 스코어와 동일하게, 진짜
// "지금까지의" 박스스코어는 boxTimeline(포제션별 델타)을 elapsed까지 누적해 직접
// 재구성해야 한다 — MultiGamePbpView.tsx의 buildLiveBox()를 그대로 이식.
const TOTAL_GAME_SECONDS = 2880; // 48분 경기

function emptyBoxRow(playerId: string, playerName: string, position?: string): PlayerBoxScore {
    return {
        playerId, playerName, position,
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, tovForced: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        rimM: 0, rimA: 0, midM: 0, midA: 0,
        mp: 0, g: 0, gs: 0, pf: 0,
        techFouls: 0, flagrantFouls: 0, plusMinus: 0,
        contestedAttempted: 0, contestedMade: 0,
        defRimAttempted: 0, defRimMade: 0, defMidAttempted: 0, defMidMade: 0,
        defThreeAttempted: 0, defThreeMade: 0, defRAAttempted: 0, defRAMade: 0,
        defITPAttempted: 0, defITPMade: 0, defMIDAttempted: 0, defMIDMade: 0,
        defCNRAttempted: 0, defCNRMade: 0, defWINGAttempted: 0, defWINGMade: 0,
        defATBAttempted: 0, defATBMade: 0,
        condition: 100,
    };
}

function buildLiveBox(timeline: BoxTick[], elapsedMs: number, referenceBox: PlayerBoxScore[]): PlayerBoxScore[] {
    const rows = new Map<string, PlayerBoxScore>();
    for (const ref of referenceBox) {
        rows.set(ref.playerId, emptyBoxRow(ref.playerId, ref.playerName, ref.position));
    }
    for (const tick of timeline) {
        const replayMs = (tick.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        if (replayMs > elapsedMs) break;
        for (const pid of tick.on) {
            const row = rows.get(pid);
            if (row) row.mp += tick.mp;
        }
        for (const [pid, delta] of Object.entries(tick.d)) {
            const row = rows.get(pid);
            if (!row) continue;
            for (const [key, v] of Object.entries(delta) as [keyof BoxDelta, number][]) {
                row[key] = (row[key] ?? 0) + (v ?? 0);
            }
        }
    }
    return Array.from(rows.values());
}

// elapsed 시점 이하 마지막 tick의 tick.on(양 팀 합산 코트 위 playerId)을 반환 —
// MultiGamePbpView.tsx의 getOnCourtIds()와 동일 로직.
function getOnCourtIds(timeline: BoxTick[], elapsedMs: number): Set<string> {
    let ids: string[] = [];
    for (const tick of timeline) {
        const replayMs = (tick.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        if (replayMs > elapsedMs) break;
        ids = tick.on;
    }
    return new Set(ids);
}

// 점보트론 타이머 — 밀리초 차이를 HH:MM:SS로. 음수(이미 지난 시각)는 00:00:00으로 클램프.
function formatHHMMSS(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
    title: string;
    color: string;
    action?: { label: string; onClick: () => void };
}> = ({ title, color, action }) => (
    <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ backgroundColor: color }}>
        <span className="text-sm font-bold text-white ko-tight">{title}</span>
        {action && (
            <button
                onClick={action.onClick}
                className="flex items-center gap-0.5 text-xs text-white/70 hover:text-white transition-colors ko-normal"
            >
                {action.label} <ChevronRight size={12} />
            </button>
        )}
    </div>
);

// 쿼터별 점수 테이블 — MultiScheduleView.tsx의 동명 컴포넌트와 동일한 디자인(원정팀 행 →
// 홈팀 행 순서, OT는 4쿼터 이후 자동 추가). 로직(computeGameLeaders)은 gameLeadersCache.ts로
// 공유하지만 이 프레젠테이셔널 마크업은 화면마다 각자 두는 이 프로젝트 관례를 따라 로컬에 둔다.
// 연장(OT) 컬럼은 표시하지 않음 — 정규 4쿼터만 노출(홈 화면 "최근 경기 결과" 카드 전용 요구사항).
const QuarterScoreTable: React.FC<{ quarterScores: QuarterScores; awayAbbr: string; homeAbbr: string }> = ({ quarterScores, awayAbbr, homeAbbr }) => {
    const cols = 4;
    const labels = Array.from({ length: cols }, (_, i) => `${i + 1}Q`);
    return (
        <div className="border-t border-slate-800">
            <table className="w-full text-sm ko-normal border border-slate-800 rounded overflow-hidden">
                <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/40">
                        <th className="text-left font-medium text-slate-500 px-2 py-1.5 w-10" />
                        {labels.map(label => (
                            <th key={label} className="text-center font-medium text-slate-500 px-2 py-1.5 border-l border-slate-800">{label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-b border-slate-800">
                        <td className="text-left font-bold text-slate-300 px-2 py-1.5">{awayAbbr}</td>
                        {labels.map((_, i) => (
                            <td key={i} className="text-center tabular-nums text-slate-300 px-2 py-1.5 border-l border-slate-800">{quarterScores.away[i] ?? ''}</td>
                        ))}
                    </tr>
                    <tr>
                        <td className="text-left font-bold text-slate-300 px-2 py-1.5">{homeAbbr}</td>
                        {labels.map((_, i) => (
                            <td key={i} className="text-center tabular-nums text-slate-300 px-2 py-1.5 border-l border-slate-800">{quarterScores.home[i] ?? ''}</td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

// 미니 스코어보드 헤더 — MultiGamePbpView.tsx(라이브뷰)의 "스코어버그 헤더" 디자인을 홈 화면
// 카드 크기에 맞게 축소 이식: 원정/홈 팀 메인컬러 단색 밴드(좌우 30%) + 중앙 slate-950(40%) +
// 전체에 LED 도트 매트릭스 텍스처. 약어 옆 보조 정보(전적/스코어)는 상태(예정/라이브)에 따라
// 내용·크기가 달라서 awaySide/homeSide ReactNode 슬롯 + abbrClassName으로 호출부에서 갈아 끼운다.
const MiniScoreboardHeader: React.FC<{
    awayAbbr: string; awaySide: React.ReactNode; awayColor: string; awayText: string;
    homeAbbr: string; homeSide: React.ReactNode; homeColor: string; homeText: string;
    abbrClassName?: string;
    bandOpacity?: number;
    /** 'center'(기본) = 약어+보조정보를 한 덩어리로 가운데 정렬. 'between' = 약어는 바깥쪽
     *  가장자리로, 보조정보는 중앙 점보트론에 가까운 안쪽으로 서로 밀어 배치. */
    sideAlign?: 'center' | 'between';
    center: React.ReactNode;
    onClick?: () => void;
}> = ({ awayAbbr, awaySide, awayColor, awayText, homeAbbr, homeSide, homeColor, homeText, abbrClassName = 'text-3xl', bandOpacity = 1, sideAlign = 'center', center, onClick }) => {
    const Wrapper = onClick ? 'button' : 'div';
    return (
        <Wrapper
            onClick={onClick}
            className={`relative w-full overflow-hidden block ${onClick ? 'cursor-pointer hover:brightness-110 transition-[filter] text-left' : ''}`}
        >
            {/* 좌우 30% 팀컬러 밴드 + 중앙 40% 점보트론(예전 38/24/38에서 중앙을 더 키움) */}
            <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: '30%', backgroundColor: awayColor, opacity: bandOpacity }} />
            <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: '30%', backgroundColor: homeColor, opacity: bandOpacity }} />
            <div className="absolute inset-y-0 bg-slate-950 pointer-events-none" style={{ left: '30%', width: '40%' }} />
            <div
                className="absolute inset-0 pointer-events-none opacity-70"
                style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
            />
            {/* 좌: 약어 → 보조정보("AWAY 0-0") / 우: 보조정보 → 약어("0-0 HOME") — 항상 중앙에
                가까운 쪽에 보조정보가 오도록 미러링. 각 팀 영역(좌우 30%)은 밴드 폭과 동일한
                w-[30%]로 잡고 justify-center로 그 영역 안에서 가운데 정렬. */}
            <div className="relative z-10 flex items-center py-4">
                <div className={`w-[30%] flex items-center ${sideAlign === 'between' ? 'justify-between' : 'justify-center gap-2'} min-w-0 whitespace-nowrap px-4`} style={{ color: awayText }}>
                    <span className={`${abbrClassName} font-black uppercase tracking-tight leading-none shrink-0`}>{awayAbbr}</span>
                    {awaySide}
                </div>
                <div className="w-[40%] flex flex-col items-center justify-center px-2">
                    {center}
                </div>
                <div className={`w-[30%] flex items-center ${sideAlign === 'between' ? 'justify-between' : 'justify-center gap-2'} min-w-0 whitespace-nowrap px-4`} style={{ color: homeText }}>
                    {homeSide}
                    <span className={`${abbrClassName} font-black uppercase tracking-tight leading-none shrink-0`}>{homeAbbr}</span>
                </div>
            </div>
        </Wrapper>
    );
};

// 리그 순위 카드 — 동부/서부 풀 스탠딩 테이블 + PO%(플레이오프 진출 확률).
// 별도 컴포넌트로 분리한 이유: PO%는 1000회 몬테카를로 시뮬레이션이라 마운트 시점에 한 번만
// 계산해야 하는데(MultiStandingsView.tsx와 동일 패턴), 이 로직이 부모 컴포넌트 안에 있으면
// 부모의 최상단 훅은 항상 매 렌더 실행되므로 데이터 로딩 전(첫 렌더, leagueTeams/schedule가
// 아직 빈 배열)에 `useState(() => ...)` 지연 초기화가 그 빈 데이터로 한 번 실행되고 이후
// 다시는 재계산되지 않는 버그가 생긴다. 이 카드를 별도 컴포넌트로 빼서 부모가 로딩 완료 후에만
// 마운트하면(= MultiStandingsView.tsx의 LeagueStandingsTable과 동일 구조) 첫 마운트 시점에
// 이미 실제 데이터가 준비되어 있어 안전하다.
const LeagueStandingsCard: React.FC<{
    leagueTeams: LeagueTeamRow[];
    schedule: Game[];
    serverNow: number;
    wlMap: Record<string, { wins: number; losses: number }>;
    myTeamId: string | null;
    primaryColor: string;
    playoffTeamsPerConf: number;
    playInEnabled: boolean;
    isTournament: boolean;
    onViewAll: () => void;
}> = ({ leagueTeams, schedule, serverNow, wlMap, myTeamId, primaryColor, playoffTeamsPerConf, playInEnabled, isTournament, onViewAll }) => {
    const teamSlugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const teamMeta = useMemo(() => {
        const map: Record<string, MultiTeamMeta> = {};
        for (const t of leagueTeams) {
            map[t.team_slug] = { conference: t.conference, division: TEAM_DATA[t.team_slug]?.division ?? null };
        }
        return map;
    }, [leagueTeams]);
    const statsMap = useMemo(
        () => computeMultiStandingsStats(teamSlugs, schedule, serverNow, teamMeta, isTournament),
        [teamSlugs, schedule, serverNow, teamMeta, isTournament],
    );
    // 몬테카를로 1000회 시뮬레이션 — 마운트 시점에 한 번만 계산(매초 흔들리지 않도록).
    const [playoffOddsMap] = useState(() =>
        computePlayoffOddsMap(leagueTeams, statsMap, schedule, serverNow, playoffTeamsPerConf, playInEnabled),
    );

    const standings = useMemo(() =>
        [...leagueTeams].sort((a, b) => {
            const aw = wlMap[a.team_slug]?.wins ?? 0, bw = wlMap[b.team_slug]?.wins ?? 0;
            const al = wlMap[a.team_slug]?.losses ?? 0, bl = wlMap[b.team_slug]?.losses ?? 0;
            const aTotal = aw + al, bTotal = bw + bl;
            const aPct = aTotal > 0 ? aw / aTotal : 0, bPct = bTotal > 0 ? bw / bTotal : 0;
            return bPct - aPct || bw - aw;
        }),
    [leagueTeams, wlMap]);

    // 사용자 소속 컨퍼런스만 표시 — 정보 없는 가상 팀은 동부로 폴백.
    const myConference = leagueTeams.find(t => t.team_slug === myTeamId)?.conference ?? 'East';
    const myConfLabel  = myConference === 'West' ? '서부' : '동부';
    const myConfTeams  = useMemo(() => standings.filter(t => t.conference === myConference), [standings, myConference]);

    // 플레이오프 컷라인 — MultiStandingsView.tsx의 cutoffLines와 동일 규칙(플레이인 활성화 시
    // 상위 (N-2)팀 자동진출, (N-2+1)~(N+2)위가 플레이인 대상 → N+2위가 마지막 진출권 컷).
    const autoClinchCount   = playInEnabled ? Math.max(0, playoffTeamsPerConf - 2) : playoffTeamsPerConf;
    const lastQualifyingRank = playInEnabled ? playoffTeamsPerConf + 2 : playoffTeamsPerConf;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <SectionHeader title="리그 순위" color={primaryColor} action={{ label: "전체 보기", onClick: onViewAll }} />
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-800">
                        <th className="text-left px-3 py-2 text-slate-500 font-semibold w-6">#</th>
                        <th className="text-left px-2 py-2 text-slate-500 font-semibold">{myConfLabel}</th>
                        <th className="text-left px-2 py-2 text-slate-500 font-semibold">W</th>
                        <th className="text-left px-2 py-2 text-slate-500 font-semibold">L</th>
                        <th className="text-left px-2 py-2 text-slate-500 font-semibold">PCT</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-semibold">PO%</th>
                    </tr>
                </thead>
                <tbody>
                    {myConfTeams.map((t, i) => {
                        const rank = i + 1;
                        const wl = wlMap[t.team_slug] ?? { wins: 0, losses: 0 };
                        const isMe = t.team_slug === myTeamId;
                        const gamesPlayed = wl.wins + wl.losses;
                        const winPct = gamesPlayed > 0 ? wl.wins / gamesPlayed : 0;
                        const pct = Math.round((playoffOddsMap[t.team_slug] ?? 0) * 100);
                        const poColor = pct >= 75 ? 'text-emerald-400' : pct >= 25 ? 'text-amber-400' : 'text-red-400';
                        return (
                            <React.Fragment key={t.id}>
                                <tr className={`border-b border-slate-800 last:border-0 ${isMe ? 'bg-slate-800' : 'hover:bg-slate-800/40'}`}>
                                    <td className={`px-3 py-1.5 font-bold ${isMe ? 'text-white' : 'text-slate-500'}`}>{rank}</td>
                                    <td className="px-2 py-1.5">
                                        <span className={`font-bold truncate ko-tight ${isMe ? 'text-white' : 'text-slate-300'}`}>{t.team_abbr}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-left text-slate-300">{wl.wins}</td>
                                    <td className="px-2 py-1.5 text-left text-slate-300">{wl.losses}</td>
                                    <td className="px-2 py-1.5 text-left text-slate-300">{fmtPct(winPct)}</td>
                                    <td className={`px-3 py-1.5 text-left ${poColor}`}>{pct}%</td>
                                </tr>
                                {/* 자동진출 컷라인(플레이인 비활성화면 이 라인이 곧 진출/탈락 경계) */}
                                {autoClinchCount > 0 && rank === autoClinchCount && (
                                    <tr><td colSpan={6} className="p-0"><div className="h-[2px] bg-emerald-500/50" /></td></tr>
                                )}
                                {/* 마지막 진출권(플레이인 포함) 컷라인 */}
                                {playInEnabled && rank === lastQualifyingRank && (
                                    <tr><td colSpan={6} className="p-0"><div className="h-[2px] bg-amber-500/50" /></td></tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// 리그 소식(League Headlines) — 경기 결과/연승/개인 활약/선수 연속 기록/유저간
// 트레이드처럼 서버가 이미 "주목할 만한" 사건만 league_events에 걸러 담아 두므로
// (server/src/simRunner.ts, respond_trade_offer RPC), 여기서는 최근 것들을 그대로
// 나열만 한다. 내 팀이 걸린 소식은 배경만 살짝 강조(순위표의 emerald 강조와 동일 톤).
const HEADLINE_ICON: Record<LeagueEventType, LucideIcon> = {
    game_result: Tv,
    player_feat: Star,
    player_streak: Flame,
    win_streak: TrendingUp,
    trade: ArrowLeftRight,
    power_ranking: BarChart3,
    mvp_award: Trophy,
    dpoy_award: Shield,
    all_nba_team: Star,
    all_def_team: Shield,
    injury: HeartPulse,
    suspension: Swords,
};

const LeagueHeadlinesCard: React.FC<{
    roomId: string | undefined;
    myTeamSlug: string | null;
    primaryColor: string;
}> = ({ roomId, myTeamSlug, primaryColor }) => {
    const { data: events, isLoading } = useLeagueHeadlines(roomId, myTeamSlug);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <SectionHeader title="리그 소식" color={primaryColor} />
            {isLoading ? (
                <p className="text-slate-500 text-xs text-center py-6 ko-normal">불러오는 중...</p>
            ) : !events || events.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-6 ko-normal">아직 소식이 없습니다.</p>
            ) : (
                <ul className="divide-y divide-slate-800">
                    {events.map((e: LeagueEvent) => {
                        const Icon = HEADLINE_ICON[e.type];
                        return (
                            <li
                                key={e.id}
                                className="flex items-start gap-2 px-3 py-2"
                            >
                                <Icon size={14} className="text-slate-500 mt-0.5 shrink-0" />
                                <span className="text-xs text-slate-300 ko-normal leading-snug">{e.headline}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

const MultiSeasonPage: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const navigate     = useNavigate();
    const { league, room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { session } = useGame();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');

    const { isLoading: gameLoading, schedule, myTeamId } = useSeasonContext();
    const serverNow = useServerClock();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    const handleViewGame = useCallback((gameId: string) => {
        navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    }, [navigate, leagueId, getGameUrlId]);

    const isLoading = leagueLoading || gameLoading;

    const myTeam = leagueTeams.find(t => t.team_slug === myTeamId) ?? null;
    const primaryColor = myTeam?.color_primary ?? '#4f46e5';

    // 로스터 화면/리더보드 화면과 원본 fetch(meta_players+game_pbp)를 공유 — queryKey가 같으면
    // 어느 화면이 먼저 로드하든 나머지는 캐시를 그대로 재사용해 로더 없이 즉시 뜬다. 이 위젯은
    // 내 팀 선수만 필요하므로 select에서 myTeam.roster/myTeamId 기준으로 걸러낸다.
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // schedule은 서버가 game_seq(압축 인덱스)로만 채워 저장 — scheduledAt이 없으면 multiGameReveal의
    // isFinal이 played 값에만 의존해 방금 시뮬된 경기의 결과가 정시+10분 전에도 그대로 노출된다
    // (리그 순위/최근 전적 스포일러 버그). MultiScheduleView/MultiStandingsView와 동일하게 정규화한다.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => schedule.map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    const teamSlugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const isTournamentLeague = league?.type === 'tournament';
    const wlMap     = useMemo(() => computeWL(normalizedSchedule, teamSlugs, serverNow, isTournamentLeague), [normalizedSchedule, teamSlugs, serverNow, isTournamentLeague]);

    // 내 팀 다음 경기 — scheduledAt 카운트다운 타이머를 쓰려면 normalizedSchedule(game_seq
    // 역산 포함)에서 걸러야 한다. schedule 원본만 쓰면 game_seq 방식 경기는 scheduledAt이
    // 없어 타이머 계산이 안 됨.
    const nextGame = useMemo(() =>
        normalizedSchedule
            .filter(g => !g.played && myTeamId && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [normalizedSchedule, myTeamId]);

    const nextOpp = useMemo(() => {
        if (!nextGame || !myTeamId) return null;
        const oppSlug = nextGame.homeTeamId === myTeamId ? nextGame.awayTeamId : nextGame.homeTeamId;
        return leagueTeams.find(t => t.team_slug === oppSlug) ?? null;
    }, [nextGame, myTeamId, leagueTeams]);
    const nextHomeTeam = nextGame ? leagueTeams.find(t => t.team_slug === nextGame.homeTeamId) : undefined;
    const nextAwayTeam = nextGame ? leagueTeams.find(t => t.team_slug === nextGame.awayTeamId) : undefined;

    // 다음 경기 카드 하단 — 양 팀 선수 명단(OVR 상위 10명) + 시즌 평균 PTS/REB/AST.
    // allRosterIds 원본 fetch를 selectMyTeamStats와 캐시 공유(같은 queryKey), select만
    // 다르게 둬서 네트워크 재요청 없음.
    const nextGameRosterIds = useMemo(
        () => [...(nextAwayTeam?.roster ?? []), ...(nextHomeTeam?.roster ?? [])],
        [nextAwayTeam, nextHomeTeam],
    );
    const selectNextGameRosters = useCallback((raw: LeagueRawStatsData) => {
        const nameMap = new Map<string, { name: string; position: string; ovr: number }>();
        for (const r of raw.playersRaw) {
            if (!nextGameRosterIds.includes(String(r.id))) continue;
            const p = mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true);
            nameMap.set(String(r.id), { name: p.name, position: p.position, ovr: p.ovr });
        }

        // 시즌 평균(PTS/REB/AST/STL/BLK) — 두 팀(원정/홈)이 치른 모든 final 경기의 박스스코어를
        // 합산. selectMyTeamStats와 동일하게 isFinal(정시+10분 경과)만 집계 — 라이브 구간 박스는
        // 비공개.
        const teamSlugs = new Set([nextAwayTeam?.team_slug, nextHomeTeam?.team_slug].filter(Boolean));
        const statsMap = new Map<string, { pts: number; reb: number; ast: number; stl: number; blk: number; gp: number }>();
        const now = getServerNow();
        for (const game of raw.pbpRows) {
            if (!teamSlugs.has(game.home_team_id) && !teamSlugs.has(game.away_team_id)) continue;
            if (!isFinal({ scheduledAt: game.game_start_time }, now)) continue;
            for (const box of [game.home_box, game.away_box]) {
                for (const entry of (box as PlayerBoxScore[] | null) ?? []) {
                    if (!nextGameRosterIds.includes(entry.playerId) || entry.mp <= 0) continue;
                    const prev = statsMap.get(entry.playerId) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, gp: 0 };
                    statsMap.set(entry.playerId, {
                        pts: prev.pts + entry.pts, reb: prev.reb + entry.reb, ast: prev.ast + entry.ast,
                        stl: prev.stl + entry.stl, blk: prev.blk + entry.blk, gp: prev.gp + 1,
                    });
                }
            }
        }
        return { nameMap, statsMap };
    }, [nextGameRosterIds, nextAwayTeam?.team_slug, nextHomeTeam?.team_slug, useCustomOverrides]);
    const { data: nextGameData } = useLeagueRawStats(room?.id, allRosterIds, selectNextGameRosters);

    const buildTop10 = (team: LeagueTeamRow | undefined) => {
        if (!team || !nextGameData) return [];
        return team.roster
            .map(id => {
                const p = nextGameData.nameMap.get(id);
                if (!p) return null;
                const s = nextGameData.statsMap.get(id);
                const gp = s?.gp ?? 0;
                return {
                    id, ...p, gp,
                    avgPts: gp > 0 ? s!.pts / gp : 0, avgReb: gp > 0 ? s!.reb / gp : 0, avgAst: gp > 0 ? s!.ast / gp : 0,
                    avgStl: gp > 0 ? s!.stl / gp : 0, avgBlk: gp > 0 ? s!.blk / gp : 0,
                };
            })
            .filter((p): p is { id: string; name: string; position: string; ovr: number; avgPts: number; avgReb: number; avgAst: number; avgStl: number; avgBlk: number; gp: number } => !!p)
            .sort((a, b) => b.ovr - a.ovr)
            .slice(0, 10);
    };
    const nextAwayRoster = useMemo(() => buildTop10(nextAwayTeam), [nextAwayTeam, nextGameData]);
    const nextHomeRoster = useMemo(() => buildTop10(nextHomeTeam), [nextHomeTeam, nextGameData]);

    // 지금 이 순간 진행중(live)인 내 팀 경기 — "현재 진행 중인 경기/진행 예정 경기" 카드용.
    // scheduledAt <= now < +10분(리플레이 구간)인 경기가 있으면 그걸 우선 보여주고,
    // 없으면 nextGame(예정)으로 폴백한다.
    const liveGame = useMemo(() =>
        normalizedSchedule.find(g =>
            myTeamId && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId) &&
            getGameDisplayState(g, serverNow) === 'live',
        ) ?? null,
    [normalizedSchedule, myTeamId, serverNow]);
    const liveOpp = useMemo(() => {
        if (!liveGame || !myTeamId) return null;
        const oppSlug = liveGame.homeTeamId === myTeamId ? liveGame.awayTeamId : liveGame.homeTeamId;
        return leagueTeams.find(t => t.team_slug === oppSlug) ?? null;
    }, [liveGame, myTeamId, leagueTeams]);
    const liveHomeTeam = liveGame ? leagueTeams.find(t => t.team_slug === liveGame.homeTeamId) : undefined;
    const liveAwayTeam = liveGame ? leagueTeams.find(t => t.team_slug === liveGame.awayTeamId) : undefined;

    // 진행 중인 내 팀 경기의 실시간 스코어/쿼터/게임클락(가벼운 요약 엔드포인트) + 박스스코어
    // (elapsed까지만 잘라 내려주는 상세 엔드포인트) — 둘 다 서버(Bun)가 스포일러 방지로 잘라
    // 계산한 값. MultiScheduleView.tsx와 동일한 폴링 패턴이며, liveGame이 있을 때만(내 팀이
    // 지금 라이브 상태일 때만) 폴링한다. 박스스코어 쪽은 since 커서 없이 매번 전체를 받는다 —
    // 이 위젯은 최신 스냅샷만 필요하고(누적 이벤트 로그 자체는 쓰지 않음) 한 경기 박스스코어는
    // 15명 안팎이라 델타 최적화가 필요할 만큼 크지 않다.
    const [liveSummary, setLiveSummary] = useState<LiveGameSummary | null>(null);
    // live 구간엔 homeBox/awayBox가 identity(playerId/name/position)만 남고 스탯은 서버가
    // 지워서 내려오므로(스포일러 방지), 진짜 진행 중 스탯은 boxTimeline을 같이 저장해뒀다가
    // buildLiveBox()로 elapsed까지 직접 누적 재구성한다.
    const [liveBoxData, setLiveBoxData] = useState<{ home: PlayerBoxScore[]; away: PlayerBoxScore[]; boxTimeline: BoxTick[] } | null>(null);
    useEffect(() => {
        if (!room?.id || !liveGame) { setLiveSummary(null); setLiveBoxData(null); return; }
        let cancelled = false;
        const poll = async () => {
            const [summaries, view] = await Promise.all([
                fetchLiveGamesSummary(room.id, session?.access_token),
                fetchLiveGameView(room.id, liveGame.id, session?.access_token),
            ]);
            if (cancelled) return;
            setLiveSummary(summaries.find(s => s.gameId === liveGame.id) ?? null);
            if ('state' in view) setLiveBoxData({ home: view.homeBox ?? [], away: view.awayBox ?? [], boxTimeline: view.boxTimeline ?? [] });
        };
        poll();
        const timer = setInterval(poll, LIVE_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [room?.id, liveGame?.id, session?.access_token]);

    // 우리 팀 + 상대팀 박스스코어 둘 다 — boxTimeline을 elapsed까지 누적해 진짜 진행 중
    // 스탯으로 재구성. 로스터 전원(아직 출전 안 한 선수 포함)을 코트 위(onCourt)/벤치(bench)
    // 두 그룹으로 나눠 라이브 카드 하단에 노출.
    const { myLiveBox, oppLiveBox } = useMemo(() => {
        const empty = { onCourt: [] as PlayerBoxScore[], bench: [] as PlayerBoxScore[] };
        if (!liveGame || !liveBoxData || !myTeamId || !liveGame.scheduledAt) return { myLiveBox: empty, oppLiveBox: empty };
        const isHome = liveGame.homeTeamId === myTeamId;
        const myRef  = isHome ? liveBoxData.home : liveBoxData.away;
        const oppRef = isHome ? liveBoxData.away : liveBoxData.home;
        const elapsedMs = serverNow - new Date(liveGame.scheduledAt).getTime();
        const onCourtIds = getOnCourtIds(liveBoxData.boxTimeline, elapsedMs);
        const split = (referenceBox: PlayerBoxScore[]) => {
            const all = buildLiveBox(liveBoxData!.boxTimeline, elapsedMs, referenceBox);
            return {
                onCourt: all.filter(b => onCourtIds.has(b.playerId)).sort((a, b) => b.pts - a.pts),
                bench: all.filter(b => !onCourtIds.has(b.playerId)).sort((a, b) => b.pts - a.pts),
            };
        };
        return { myLiveBox: split(myRef), oppLiveBox: split(oppRef) };
    }, [liveGame, liveBoxData, myTeamId, serverNow]);

    // 점보트론 타이머 — serverNow(useServerClock, 1초마다 갱신)와 scheduledAt의 차이를
    // HH:MM:SS로 표시. 예정 경기는 남은 시간(카운트다운), 라이브 경기는 시작 후 경과 시간
    // (0~10분 리플레이 구간을 그대로 보여줌 — 실제 쿼터/게임클락 폴링 없이도 "지금 어디쯤
    // 리플레이 중인지" 감을 준다).
    const nextCountdownMs = nextGame?.scheduledAt ? new Date(nextGame.scheduledAt).getTime() - serverNow : null;

    // 최근 10경기 (정시+10분 경과 — final 상태인 경기만)
    const recent10 = useMemo(() =>
        normalizedSchedule
            .filter(g => g.played && isFinal(g, serverNow) && myTeamId && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10),
    [normalizedSchedule, myTeamId, serverNow]);

    // 예정 경기 카드의 "동부 5위" 표기용 — 컨퍼런스별 순위(전체 standings와 동일한
    // 승률 내림차순 + 승수 동률 tiebreak, MultiStandingsView.tsx와 동일한 정렬 규칙).
    const CONFERENCE_LABEL_KO: Record<string, string> = { East: '동부', West: '서부' };
    const conferenceRankMap = useMemo(() => {
        const map: Record<string, number> = {};
        for (const conf of ['East', 'West'] as const) {
            const confTeams = leagueTeams.filter(t => t.conference === conf);
            const sorted = [...confTeams].sort((a, b) => {
                const aw = wlMap[a.team_slug]?.wins ?? 0, bw = wlMap[b.team_slug]?.wins ?? 0;
                const al = wlMap[a.team_slug]?.losses ?? 0, bl = wlMap[b.team_slug]?.losses ?? 0;
                const aTotal = aw + al, bTotal = bw + bl;
                const aPct = aTotal > 0 ? aw / aTotal : 0, bPct = bTotal > 0 ? bw / bTotal : 0;
                return bPct - aPct || bw - aw;
            });
            sorted.forEach((t, i) => { map[t.team_slug] = i + 1; });
        }
        return map;
    }, [leagueTeams, wlMap]);

    // "최근 경기 결과" 카드 — recent10(최신순, index 0=최신) 안에서 </>로 이전/다음 경기 탐색.
    // index가 커질수록 더 과거 경기 — recent10 길이가 줄어드는 경우(새로고침 등)를 대비해
    // 매 렌더 범위를 벗어나지 않도록 clamp.
    const [lastGameIdx, setLastGameIdx] = useState(0);
    const lastGameSafeIdx = Math.min(lastGameIdx, Math.max(0, recent10.length - 1));
    const lastGame = recent10[lastGameSafeIdx] ?? null;
    const lastHomeTeam = lastGame ? leagueTeams.find(t => t.team_slug === lastGame.homeTeamId) : undefined;
    const lastAwayTeam = lastGame ? leagueTeams.find(t => t.team_slug === lastGame.awayTeamId) : undefined;

    // 최근 경기 결과 카드의 쿼터별 점수 + PTS/REB/AST 리더 — MultiScheduleView.tsx와 동일하게
    // localStorage 캐시 우선(game_pbp row는 시뮬 완료 후 안 바뀌므로 한 번 조회하면 끝),
    // 캐시에 없을 때만 이 경기 하나만 targeted로 조회(스케줄 화면의 대량 조회와 달리 필요한
    // 한 건만 가져오면 되므로 훨씬 가볍다).
    const { data: lastGameLeaders } = useQuery({
        queryKey: ['gameLeaders', room?.id, lastGame?.id],
        enabled: !!room?.id && !!lastGame?.id,
        queryFn: async () => {
            const cached = loadGameLeadersCache(room!.id)[lastGame!.id];
            if (cached) return cached;
            const { data } = await supabase
                .from('game_pbp')
                .select('home_box, away_box, quarter_scores')
                .eq('room_id', room!.id)
                .eq('game_id', lastGame!.id)
                .maybeSingle();
            if (!data) return null;
            const leaders = { ...computeGameLeaders(data.home_box, data.away_box), quarterScores: (data.quarter_scores as QuarterScores | null) ?? undefined };
            mergeGameLeadersCache(room!.id, { [lastGame!.id]: leaders });
            return leaders;
        },
    });

    const goTo = (sub: string) => navigate(`/multi/leagues/${leagueId}/season/${sub}`);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!league || !myTeam) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <p className="text-slate-400 text-sm ko-normal">리그 정보를 불러올 수 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-950 text-slate-200 pretendard">

            {/* ── 최상단 3카드(30:40:30) — 최근 경기 결과 / 진행중·예정 경기 / 최근 성적 ── */}
            <div className="px-4 pt-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,6fr)_minmax(0,2fr)] gap-4 items-start">

                    {/* 최근 경기 결과 + 최근 성적 — 한 카드로 통합 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <SectionHeader title="최근 경기 결과" color={primaryColor} />
                        {lastGame && lastAwayTeam && lastHomeTeam ? (
                            <>
                                {/* yyyy-mm-dd */}
                                <p className="pt-3 text-center text-slate-500 text-xs font-bold tabular-nums ko-normal">{fmtDateISO(lastGame.date)}</p>
                                {/* <(이전 경기) AWAY 000 - 000 HOME >(다음 경기) — recent10(최신순) 안에서 탐색 */}
                                <div className="flex items-center justify-between px-2 py-3">
                                    <button
                                        onClick={() => setLastGameIdx(i => i + 1)}
                                        disabled={lastGameSafeIdx >= recent10.length - 1}
                                        className="p-1 text-slate-500 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors shrink-0"
                                        aria-label="이전 경기"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleViewGame(lastGame.id)}
                                        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                                    >
                                        <span className="text-2xl font-black text-white ko-tight">{lastAwayTeam.team_abbr}</span>
                                        <span className={`text-2xl font-black ${(lastGame.awayScore ?? 0) > (lastGame.homeScore ?? 0) ? 'text-white' : 'text-slate-500'}`}>{lastGame.awayScore ?? 0}</span>
                                        <span className="text-slate-600 text-lg font-bold">-</span>
                                        <span className={`text-2xl font-black ${(lastGame.homeScore ?? 0) > (lastGame.awayScore ?? 0) ? 'text-white' : 'text-slate-500'}`}>{lastGame.homeScore ?? 0}</span>
                                        <span className="text-2xl font-black text-white ko-tight">{lastHomeTeam.team_abbr}</span>
                                    </button>
                                    <button
                                        onClick={() => setLastGameIdx(i => i - 1)}
                                        disabled={lastGameSafeIdx <= 0}
                                        className="p-1 text-slate-500 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors shrink-0"
                                        aria-label="다음 경기"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                                {lastGameLeaders?.quarterScores && (
                                    <QuarterScoreTable
                                        quarterScores={lastGameLeaders.quarterScores}
                                        awayAbbr={lastAwayTeam.team_abbr}
                                        homeAbbr={lastHomeTeam.team_abbr}
                                    />
                                )}
                                {lastGameLeaders && (
                                    <div className="border-t border-slate-800">
                                        <table className="w-full text-sm ko-normal border border-slate-800 rounded overflow-hidden">
                                            <thead>
                                                <tr className="border-b border-slate-800 bg-slate-800/40">
                                                    <th className="text-left font-medium text-slate-500 px-2 py-1.5 w-12">구분</th>
                                                    <th className="text-left font-medium text-slate-500 px-2 py-1.5 border-l border-slate-800">선수</th>
                                                    <th className="text-right font-medium text-slate-500 px-2 py-1.5 border-l border-slate-800 w-12">기록</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(['pts', 'reb', 'ast'] as const).map(stat => {
                                                    const l = lastGameLeaders[stat];
                                                    if (!l) return null;
                                                    return (
                                                        <tr key={stat} className="border-b border-slate-800 last:border-0">
                                                            <td className="text-left font-bold text-slate-500 px-2 py-1.5">{stat.toUpperCase()}</td>
                                                            <td className="text-left px-2 py-1.5 border-l border-slate-800">
                                                                <span className="truncate text-slate-300">{l.name}</span>
                                                                {l.position && <span className="ml-1 text-slate-500">{l.position}</span>}
                                                            </td>
                                                            <td className="text-right font-semibold text-slate-200 px-2 py-1.5 border-l border-slate-800 tabular-nums">{l.value}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <div className="border-t border-slate-800">
                                    <button
                                        onClick={() => handleViewGame(lastGame.id)}
                                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-slate-800/60 hover:bg-slate-800 transition-colors ko-tight"
                                    >
                                        박스스코어 보기
                                        <ChevronRight size={14} className="text-slate-500" />
                                    </button>
                                </div>
                                {/* 최근 성적 — W/L 스트립 + 최근 10경기 리스트. 위쪽(최근 경기 결과)과는
                                    다른 영역임을 두꺼운 구분선 + 옅은 배경 + 캡션 라벨로 표시. */}
                                <div className="border-t-4 border-slate-950 bg-black/20 p-4">
                                    <p className="text-xs font-bold text-slate-500 mb-2 ko-tight">최근 10경기</p>
                                    <div className="flex gap-1 mb-2">
                                        {[...recent10].reverse().map((g, i) => {
                                            const isHome = g.homeTeamId === myTeamId;
                                            const my  = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                            const opp = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                            return (
                                                <div
                                                    key={i}
                                                    className={`flex-1 h-2 rounded-full ${my > opp ? 'bg-green-500' : 'bg-red-500/70'}`}
                                                />
                                            );
                                        })}
                                        {Array.from({ length: Math.max(0, 10 - recent10.length) }).map((_, i) => (
                                            <div key={`e-${i}`} className="flex-1 h-2 rounded-full bg-slate-700/50" />
                                        ))}
                                    </div>
                                    {recent10.length === 0 ? (
                                        <p className="text-slate-500 text-xs text-center py-1 ko-normal">아직 경기 결과 없음</p>
                                    ) : (
                                        <div className="flex flex-col mt-2">
                                            {recent10.map(g => {
                                                const isHome = g.homeTeamId === myTeamId;
                                                const myScore  = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                                                const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                                                const won = myScore > oppScore;
                                                const oppSlug = isHome ? g.awayTeamId : g.homeTeamId;
                                                const oppTeam = leagueTeams.find(t => t.team_slug === oppSlug);
                                                return (
                                                    <div key={g.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0 text-sm">
                                                        <span className="text-slate-500 w-8 shrink-0">{fmtDate(g.date)}</span>
                                                        <span className="flex-1 text-slate-300 truncate ko-normal">
                                                            {isHome ? 'vs' : '@'} {oppTeam?.team_abbr ?? oppSlug}
                                                        </span>
                                                        <button
                                                            onClick={() => handleViewGame(g.id)}
                                                            className="text-slate-400 hover:text-white hover:underline transition-colors"
                                                        >
                                                            {myScore}-{oppScore}
                                                        </button>
                                                        <span className={`font-black w-4 text-center ${won ? 'text-green-400' : 'text-red-400'}`}>{won ? 'W' : 'L'}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-slate-500 text-xs text-center py-6 ko-normal">아직 완료된 경기 없음</p>
                        )}
                    </div>

                    {/* 진행 중인 경기 / 다음 경기 (40%) — 라이브뷰 스코어보드 헤더 디자인 이식 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        {liveGame && liveOpp && liveHomeTeam && liveAwayTeam ? (
                            <>
                                <MiniScoreboardHeader
                                    awayAbbr={liveAwayTeam.team_abbr}
                                    awaySide={<span className="text-4xl font-black tabular-nums">{liveSummary?.awayScore ?? 0}</span>}
                                    awayColor={liveAwayTeam.color_primary ?? '#0f172a'}
                                    awayText={liveAwayTeam.color_text ?? getReadableTextColor(liveAwayTeam.color_primary ?? '#0f172a')}
                                    homeAbbr={liveHomeTeam.team_abbr}
                                    homeSide={<span className="text-4xl font-black tabular-nums">{liveSummary?.homeScore ?? 0}</span>}
                                    homeColor={liveHomeTeam.color_primary ?? '#4f46e5'}
                                    homeText={liveHomeTeam.color_text ?? getReadableTextColor(liveHomeTeam.color_primary ?? '#4f46e5')}
                                    abbrClassName="text-4xl"
                                    sideAlign="between"
                                    onClick={() => handleViewGame(liveGame.id)}
                                    center={
                                        <span className="text-2xl font-bold text-red-400 tabular-nums leading-none animate-pulse">
                                            {liveSummary ? `Q${liveSummary.quarter ?? 1} ${liveSummary.clock ?? ''}` : 'LIVE'}
                                        </span>
                                    }
                                />
                                {(myLiveBox.onCourt.length > 0 || myLiveBox.bench.length > 0 || oppLiveBox.onCourt.length > 0 || oppLiveBox.bench.length > 0) && (
                                    <div className="grid grid-cols-2 divide-x divide-slate-800 border-t border-slate-800">
                                        {[
                                            { teamAbbr: (liveGame.homeTeamId === myTeamId ? liveHomeTeam : liveAwayTeam).team_abbr, box: myLiveBox },
                                            { teamAbbr: (liveGame.homeTeamId === myTeamId ? liveAwayTeam : liveHomeTeam).team_abbr, box: oppLiveBox },
                                        ].map(({ teamAbbr, box }) => (
                                            <div key={teamAbbr} className="px-3 py-2 overflow-x-auto">
                                                <table className="w-full text-sm ko-normal table-fixed">
                                                    <thead>
                                                        <tr>
                                                            <th className="w-[30%] text-left font-medium text-slate-500">{teamAbbr}</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">MIN</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">PTS</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">REB</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">AST</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">STL</th>
                                                            <th className="w-[14%] text-right font-medium text-slate-500">BLK</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {box.onCourt.length > 0 && (
                                                            <tr>
                                                                <td colSpan={7} className="pt-1.5 pb-0.5 text-xs font-bold text-emerald-400 ko-tight">코트 위</td>
                                                            </tr>
                                                        )}
                                                        {box.onCourt.map(b => (
                                                            <tr key={b.playerId} className="border-t border-slate-800/60">
                                                                <td className="text-left text-slate-300 truncate ko-tight">{b.playerName}</td>
                                                                <td className="text-right tabular-nums text-slate-400">{Math.round(b.mp)}</td>
                                                                <td className="text-right tabular-nums text-slate-200 font-semibold">{b.pts}</td>
                                                                <td className="text-right tabular-nums text-slate-400">{b.reb}</td>
                                                                <td className="text-right tabular-nums text-slate-400">{b.ast}</td>
                                                                <td className="text-right tabular-nums text-slate-400">{b.stl}</td>
                                                                <td className="text-right tabular-nums text-slate-400">{b.blk}</td>
                                                            </tr>
                                                        ))}
                                                        {box.bench.length > 0 && (
                                                            <tr>
                                                                <td colSpan={7} className="pt-2.5 pb-0.5 text-xs font-bold text-slate-500 ko-tight">벤치</td>
                                                            </tr>
                                                        )}
                                                        {box.bench.map(b => (
                                                            <tr key={b.playerId} className="border-t border-slate-800/60">
                                                                <td className="text-left text-slate-400 truncate ko-tight">{b.playerName}</td>
                                                                <td className="text-right tabular-nums text-slate-500">{Math.round(b.mp)}</td>
                                                                <td className="text-right tabular-nums text-slate-400 font-semibold">{b.pts}</td>
                                                                <td className="text-right tabular-nums text-slate-500">{b.reb}</td>
                                                                <td className="text-right tabular-nums text-slate-500">{b.ast}</td>
                                                                <td className="text-right tabular-nums text-slate-500">{b.stl}</td>
                                                                <td className="text-right tabular-nums text-slate-500">{b.blk}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : nextGame && nextOpp && nextHomeTeam && nextAwayTeam ? (
                            <>
                                <MiniScoreboardHeader
                                    awayAbbr={nextAwayTeam.team_abbr}
                                    awaySide={
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl font-bold tabular-nums opacity-90">{`${wlMap[nextAwayTeam.team_slug]?.wins ?? 0}-${wlMap[nextAwayTeam.team_slug]?.losses ?? 0}`}</span>
                                            {nextAwayTeam.conference && (
                                                <span className="text-xl font-bold opacity-90">{`${CONFERENCE_LABEL_KO[nextAwayTeam.conference] ?? nextAwayTeam.conference} ${conferenceRankMap[nextAwayTeam.team_slug] ?? '-'}위`}</span>
                                            )}
                                        </div>
                                    }
                                    awayColor={nextAwayTeam.color_primary ?? '#0f172a'}
                                    awayText={nextAwayTeam.color_text ?? getReadableTextColor(nextAwayTeam.color_primary ?? '#0f172a')}
                                    homeAbbr={nextHomeTeam.team_abbr}
                                    homeSide={
                                        <div className="flex items-center gap-2">
                                            {nextHomeTeam.conference && (
                                                <span className="text-xl font-bold opacity-90">{`${CONFERENCE_LABEL_KO[nextHomeTeam.conference] ?? nextHomeTeam.conference} ${conferenceRankMap[nextHomeTeam.team_slug] ?? '-'}위`}</span>
                                            )}
                                            <span className="text-xl font-bold tabular-nums opacity-90">{`${wlMap[nextHomeTeam.team_slug]?.wins ?? 0}-${wlMap[nextHomeTeam.team_slug]?.losses ?? 0}`}</span>
                                        </div>
                                    }
                                    homeColor={nextHomeTeam.color_primary ?? '#4f46e5'}
                                    homeText={nextHomeTeam.color_text ?? getReadableTextColor(nextHomeTeam.color_primary ?? '#4f46e5')}
                                    abbrClassName="text-2xl"
                                    center={
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="text-sm font-bold text-slate-400 tabular-nums">{fmtDateISO(nextGame.date)}</span>
                                            <span className="text-2xl font-black text-white tabular-nums leading-none">
                                                {nextCountdownMs != null ? formatHHMMSS(nextCountdownMs) : '00:00:00'}
                                            </span>
                                        </div>
                                    }
                                />
                                {(nextAwayRoster.length > 0 || nextHomeRoster.length > 0) && (
                                    <div className="grid grid-cols-2 divide-x divide-slate-800 border-t border-slate-800">
                                        {[
                                            { team: nextAwayTeam, roster: nextAwayRoster },
                                            { team: nextHomeTeam, roster: nextHomeRoster },
                                        ].map(({ team, roster }) => (
                                            <table key={team.id} className="w-full text-sm table-fixed">
                                                <thead>
                                                    <tr style={{ backgroundColor: team.color_primary ?? '#334155', color: team.color_text ?? getReadableTextColor(team.color_primary ?? '#334155') }}>
                                                        <th className="w-[30%] text-left px-2 py-1 font-semibold">이름</th>
                                                        <th className="w-[9%] text-center px-1 py-1 font-semibold">POS</th>
                                                        <th className="w-[11%] text-center px-1 py-1 font-semibold">OVR</th>
                                                        <th className="w-[10%] text-right px-1 py-1 font-semibold">PTS</th>
                                                        <th className="w-[10%] text-right px-1 py-1 font-semibold">REB</th>
                                                        <th className="w-[10%] text-right px-1 py-1 font-semibold">AST</th>
                                                        <th className="w-[10%] text-right px-1 py-1 font-semibold">STL</th>
                                                        <th className="w-[10%] text-right px-2 py-1 font-semibold">BLK</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {roster.map(p => (
                                                        <tr key={p.id} className="border-t border-slate-800/60">
                                                            <td className="px-2 py-1 text-left text-slate-300 truncate ko-tight">{p.name}</td>
                                                            <td className="px-1 py-1 text-center text-slate-500 font-mono">{p.position}</td>
                                                            <td className="px-1 py-1 text-center"><OvrBadge value={p.ovr} size="sm" className="mx-auto" /></td>
                                                            <td className="px-1 py-1 text-right tabular-nums text-slate-300">{p.gp > 0 ? p.avgPts.toFixed(1) : <span className="text-slate-700">—</span>}</td>
                                                            <td className="px-1 py-1 text-right tabular-nums text-slate-300">{p.gp > 0 ? p.avgReb.toFixed(1) : <span className="text-slate-700">—</span>}</td>
                                                            <td className="px-1 py-1 text-right tabular-nums text-slate-300">{p.gp > 0 ? p.avgAst.toFixed(1) : <span className="text-slate-700">—</span>}</td>
                                                            <td className="px-1 py-1 text-right tabular-nums text-slate-300">{p.gp > 0 ? p.avgStl.toFixed(1) : <span className="text-slate-700">—</span>}</td>
                                                            <td className="px-2 py-1 text-right tabular-nums text-slate-300">{p.gp > 0 ? p.avgBlk.toFixed(1) : <span className="text-slate-700">—</span>}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <SectionHeader title="다음 경기" color={primaryColor} />
                                <p className="text-slate-500 text-xs text-center py-6 ko-normal">남은 경기 없음</p>
                            </>
                        )}
                    </div>

                    {/* 리그 순위 — 리그/컨퍼런스/디비전 전환 가능, 내 팀 기준 위/아래 2팀 + PO% */}
                    <LeagueStandingsCard
                        leagueTeams={leagueTeams}
                        schedule={normalizedSchedule}
                        serverNow={serverNow}
                        wlMap={wlMap}
                        myTeamId={myTeamId}
                        primaryColor={primaryColor}
                        playoffTeamsPerConf={league?.playoff_team_count ?? 8}
                        playInEnabled={league?.play_in_enabled ?? true}
                        isTournament={isTournamentLeague}
                        onViewAll={() => goTo('standings')}
                    />

                    {/* 리그 소식 — 대량득점차/연승/개인 활약/유저간 트레이드 헤드라인 */}
                    <LeagueHeadlinesCard
                        roomId={room?.id}
                        myTeamSlug={myTeamId}
                        primaryColor={primaryColor}
                    />

                </div>
            </div>
        </div>
    );
};

export default MultiSeasonPage;
