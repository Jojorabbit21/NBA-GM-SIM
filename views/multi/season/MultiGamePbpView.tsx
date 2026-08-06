
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { computeWL } from './multiSeasonUtils';
import { fmtDayLabel, kstDateKey, groupByDay } from './multiScheduleUtils';
import { useGame } from '../../../hooks/useGameContext';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { supabase } from '../../../services/supabaseClient';
import { calculateWinProbability } from '../../../utils/simulationMath';
import type { PbpLog, PlayerBoxScore, BoxTick, BoxDelta, RotationData } from '../../../types/engine';
import type { Game, ShotEvent, Team, Player } from '../../../types';
import { useServerClock } from '../../../utils/serverClock';
import { REPLAY_DURATION_MS, getGameDisplayState, resolveRealAt, computeRevealedSeries } from './multiGameReveal';
import { fetchLiveGameView, fetchLiveGamesSummary, type LiveGameSummary } from '../../../services/multi/liveGameService';
import { loadGame } from '../../../services/multi/gameQueries';
import { MultiFullCourtChart } from './MultiFullCourtChart';
import { GameBoxScoreTab } from '../../../components/game/tabs/GameBoxScoreTab';
import { GameShotChartTab } from '../../../components/game/tabs/GameShotChartTab';
import { GamePbpTab } from '../../../components/game/tabs/GamePbpTab';
import { GameRotationTab } from '../../../components/game/tabs/GameRotationTab';
import { GameOnOffTab } from '../../../components/game/tabs/GameOnOffTab';
import type { GameStatLeaders } from '../../../components/game/BoxScoreTable';
import { getTeamLogoUrl } from '../../../utils/constants';
import { Skeleton } from '../../../components/common/Skeleton';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { formatTime } from '../../../services/game/engine/pbp/timeEngine';
import { toGameSeconds } from '../../../utils/gameClock';

const TOTAL_GAME_SECONDS  = 2880;
const LIVE_POLL_MS        = 5000;
const TEAM_TIMEOUTS_TOTAL = 4;

// [Simplify 2026-08-05] 점보트론 원정/홈 슬롯에서 각각 그대로 복붙돼 있던 타임아웃 도트 렌더링을
// 공용 컴포넌트로 추출 (좌우 차이는 몇 개가 켜져 있는지뿐).
function TimeoutDots({ left }: { left: number }) {
    return (
        <span className="w-16 shrink-0 flex gap-0.5 text-xl">
            {Array.from({ length: TEAM_TIMEOUTS_TOTAL }).map((_, i) => (
                <span key={i} className={i < left ? 'text-amber-400' : 'text-slate-700'}>●</span>
            ))}
        </span>
    );
}

// [Simplify 2026-08-05] 파울/보너스 뱃지도 원정/홈 슬롯에서 정렬(text-right)만 다르고 나머지는
// 동일하게 복붙돼 있던 걸 공용 컴포넌트로 추출.
function FoulBonusBadge({ fouls, align }: { fouls: number; align: 'left' | 'right' }) {
    return (
        <span className={`w-24 shrink-0 ${align === 'right' ? 'text-right' : ''}`}>
            {fouls >= 5 ? (
                <span className="px-1 py-0 rounded text-base font-black bg-amber-500 text-slate-900 leading-relaxed">BONUS</span>
            ) : (
                <span className="text-xl">파울 <span className="text-white font-bold tabular-nums">{fouls}</span></span>
            )}
        </span>
    );
}

// [Simplify 2026-08-05] 헤더 원정/홈 팀 컬럼(약어/이름·성적/점수)도 DOM 순서만 반대(원정: 약어→
// 이름→점수, 홈: 점수→이름→약어)일 뿐 구조가 완전히 같아서 공용 컴포넌트로 추출. side가 어느
// 쪽이 바깥(고정 폭)/안쪽(중앙 쪽 고정)인지를 결정 — 3구획 grid 자체는 동일.
function TeamHeaderColumn({
    side, abbr, name, wl, score, textColor, infoLoading,
}: {
    side: 'away' | 'home';
    abbr: string;
    name: string;
    wl: { wins: number; losses: number } | undefined;
    score: number;
    textColor: string;
    infoLoading: boolean;
}) {
    const abbrEl = infoLoading
        ? <Skeleton className="h-11 w-16" />
        : <span className="text-5xl font-black uppercase tracking-tight shrink-0">{abbr.slice(0, 3)}</span>;
    const scoreEl = (
        <span
            className={`text-6xl font-black tabular-nums leading-none tracking-tighter shrink-0 ${side === 'away' ? 'justify-self-end' : 'justify-self-start'}`}
            style={{ color: textColor }}
        >
            {score}
        </span>
    );
    const nameEl = (
        <div className={`flex flex-col gap-1 min-w-0 ${side === 'away' ? 'items-start' : 'items-end'}`}>
            {infoLoading
                ? <Skeleton className="h-6 w-32" />
                : <span className="text-2xl font-black uppercase tracking-wide whitespace-nowrap truncate">{name}</span>}
            {wl && (
                <span className="text-base font-bold tabular-nums" style={{ color: textColor }}>{wl.wins}W {wl.losses}L</span>
            )}
        </div>
    );

    return (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 py-6 px-8 shrink-0" style={{ color: textColor, width: '30%' }}>
            {side === 'away' ? abbrEl : scoreEl}
            {nameEl}
            {side === 'away' ? scoreEl : abbrEl}
        </div>
    );
}

// [Simplify 2026-08-05] 점보트론 마일스톤 카드의 combo/stat 분기가 접근색·라벨 텍스트만 다르고
// 나머지(팀약어+선수명 줄, 라벨 줄) 구조는 완전히 동일해서 공용 컴포넌트로 추출.
function MilestoneJumbotronBody({ teamAbbr, playerName, accentClass, label }: {
    teamAbbr: string;
    playerName: string;
    accentClass: string;
    label: string;
}) {
    return (
        <div className="flex flex-col items-center gap-0.5 animate-in fade-in duration-300">
            <div className="flex items-center gap-1.5 text-3xl">
                <span className="font-mono font-black text-white">{teamAbbr}</span>
                <span className="font-bold text-white whitespace-nowrap">{playerName}</span>
            </div>
            <span className={`text-3xl font-black uppercase tracking-widest ${accentClass}`} style={{ textShadow: '0 0 8px currentColor' }}>
                {label}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 전광판(Jumbotron) — 모든 스탯 변화가 아니라 "의미있는 마일스톤"만 표시.
// [Fix 2026-08-03] "전광판에 모든 PBP를 표시할 필요 없다, 중요한 이벤트만" 요청에 따라
// 매 스탯 증가마다 띄우던 방식 → 임계치 기반으로 전면 재설계.
//   - 득점/리바운드/어시스트/스틸/블록: 시작 임계치 이후 5단위로 계속 발화(예: 득점 20,25,30...).
//   - 턴오버/파울: 값이 낮고 "많을수록 나쁜" 이벤트라 동일한 반복 패턴이 안 맞음 → 고정 임계치만
//     (턴오버 5개, 파울 3개/5개)에서 딱 한 번씩만 발화.
// liveHomeBox/liveAwayBox 스냅샷을 이전 렌더와 비교해 "임계치를 새로 넘었는지"를 감지 — 라이브 PBP
// 로그엔 선수 식별 필드가 없어서(teamId만 있음) 텍스트 파싱 대신 이미 실시간으로 갱신되는 박스스코어를
// diff한다(싱글플레이어 LiveGameView.tsx의 OnCourtPanel 셀 하이라이트와 동일한 방식).
// ─────────────────────────────────────────────────────────────
type JumbotronStat = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf';
const JUMBOTRON_STATS: JumbotronStat[] = ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf'];
const JUMBOTRON_LABEL: Record<JumbotronStat, string> = {
    pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블록', tov: '턴오버', pf: '파울',
};
const JUMBOTRON_ACCENT: Record<JumbotronStat, string> = {
    pts: 'text-emerald-400', reb: 'text-sky-400', ast: 'text-fuchsia-400', stl: 'text-amber-400',
    blk: 'text-indigo-400', tov: 'text-red-400', pf: 'text-orange-400',
};

// 득점/리바운드/어시스트/스틸/블록: 시작 임계치 도달 후 step 단위로 계속 마일스톤 발화.
const STEP_MILESTONE: Partial<Record<JumbotronStat, { threshold: number; step: number }>> = {
    pts: { threshold: 20, step: 5 },
    reb: { threshold: 10, step: 5 },
    ast: { threshold: 10, step: 5 },
    stl: { threshold: 5, step: 5 },
    blk: { threshold: 5, step: 5 },
};
// 턴오버/파울: "많을수록 나쁜" 이벤트라 반복 발화 대신 정해진 임계치에서 딱 한 번만.
const FIXED_MILESTONES: Partial<Record<JumbotronStat, number[]>> = {
    tov: [5],
    pf: [3, 5],
};

// old→cur 사이에 새로 넘은 마일스톤 값을 반환(없으면 null). step형은 threshold부터 step 간격으로
// "몇 번째 구간인지"를 비교해 구간이 올라갔을 때만 발화, 고정형은 목록에 새로 도달한 값을 반환.
function crossedMilestone(stat: JumbotronStat, old: number, cur: number): number | null {
    const stepRule = STEP_MILESTONE[stat];
    if (stepRule) {
        if (cur < stepRule.threshold) return null;
        const oldTier = old < stepRule.threshold ? -1 : Math.floor((old - stepRule.threshold) / stepRule.step);
        const curTier = Math.floor((cur - stepRule.threshold) / stepRule.step);
        return curTier > oldTier ? stepRule.threshold + curTier * stepRule.step : null;
    }
    const fixed = FIXED_MILESTONES[stat];
    if (fixed) {
        let hit: number | null = null;
        for (const m of fixed) { if (cur >= m && old < m) hit = m; }
        return hit;
    }
    return null;
}

// [Fix 2026-08-04] 더블더블/트리플더블/쿼드러플더블/5x5 같은 "복합" 마일스톤 추가.
// dd/td/qd는 PTS/REB/AST/STL/BLK 중 두자릿수(10+) 도달 카테고리 수의 사다리(2→3→4개)로,
// 한 단계씩만 올라가도 최고 단계만 발화(기존 crossedMilestone과 동일한 "새로 넘은 구간만" 원칙).
// 5x5는 별도 트랙 — 다섯 카테고리 전부 5 이상(쿼드러플더블처럼 10+ 넷이 아니라 5+ 다섯 개).
type ComboMilestone = 'dd' | 'td' | 'qd' | '5x5';
const COMBO_LABEL: Record<ComboMilestone, string> = {
    dd: '더블더블', td: '트리플더블', qd: '쿼드러플더블', '5x5': '5X5',
};
const COMBO_ACCENT: Record<ComboMilestone, string> = {
    dd: 'text-sky-400', td: 'text-fuchsia-400', qd: 'text-amber-400', '5x5': 'text-emerald-400',
};
const COMBO_STATS: JumbotronStat[] = ['pts', 'reb', 'ast', 'stl', 'blk'];

function crossedCombo(old: Record<JumbotronStat, number>, cur: Record<JumbotronStat, number>): ComboMilestone | null {
    const countAtLeast = (snap: Record<JumbotronStat, number>, threshold: number) =>
        COMBO_STATS.filter(s => snap[s] >= threshold).length;
    const oldTenCount = countAtLeast(old, 10);
    const curTenCount = countAtLeast(cur, 10);
    if (curTenCount >= 4 && oldTenCount < 4) return 'qd';
    if (curTenCount >= 3 && oldTenCount < 3) return 'td';
    if (curTenCount >= 2 && oldTenCount < 2) return 'dd';
    const cur5x5 = COMBO_STATS.every(s => cur[s] >= 5);
    const old5x5 = COMBO_STATS.every(s => old[s] >= 5);
    if (cur5x5 && !old5x5) return '5x5';
    return null;
}

// [Fix 2026-08-03] 선수 스탯 이벤트(stat) 외에 경기 시작/쿼터 종료/하프타임/경기 종료 같은
// 흐름 이벤트(flow, teamId === 'SYSTEM'인 PbpLog)도 큰 텍스트로 전광판에 띄우기 위해 유니온으로 확장.
// stat 이벤트엔 어떤 마일스톤 값에 도달했는지(value)도 함께 저장해 라벨에 "20득점"처럼 표시.
// [Fix 2026-08-04] combo 이벤트(더블더블 등) kind 추가.
type JumbotronEvent =
    | { kind: 'stat'; key: string; player: PlayerBoxScore; stat: JumbotronStat; value: number; isHome: boolean }
    | { kind: 'combo'; key: string; player: PlayerBoxScore; combo: ComboMilestone; isHome: boolean }
    | { kind: 'flow'; key: string; text: string };

// ─── Types ────────────────────────────────────────────────────────────────────

interface GamePbpRow {
    game_id:         string;
    home_team_id:    string;
    away_team_id:    string;
    home_score:      number;
    away_score:      number;
    game_start_time: string;
    events:          PbpLog[];
    shot_events:     ShotEvent[];
    home_box:        PlayerBoxScore[];
    away_box:        PlayerBoxScore[];
    box_timeline?:   BoxTick[];
    rotation_data?:  RotationData;
}

interface TeamStats {
    pts: number; fgm: number; fga: number; p3m: number; p3a: number;
    ftm: number; fta: number; tov: number; blk: number; pf: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCountdown(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 싱글플레이어 GameResultView의 탭 컴포넌트(GameBoxScoreTab/GameShotChartTab/GamePbpTab/
// GameRotationTab)를 재사용하기 위한 Team 어댑터.
// - logo: getTeamLogoUrl()로 실제 로고 SVG 조회 (TeamLogo 컴포넌트와 동일한 경로 — 멀티 team_slug가
//   실제 TEAM_DATA id와 같아서 그대로 resolve됨). 빈 문자열로 두면 <img src={team.logo}>를 직접
//   쓰는 탭(샷차트/PBP)에서 깨진 이미지로 보임.
// - roster: rosterCache(meta_players에서 조회해 mapRawPlayerToRuntimePlayer로 매핑한 실제 Player)가
//   있으면 그걸 쓰고, 아직 로딩 전이면 box에서 파생한 최소 스텁으로 폴백한다. BoxScoreTable이
//   team.roster.find(id)로 능력치를 찾아 OVR을 계산하므로(calculatePlayerOvr), 스텁({id,name}만)만
//   있으면 능력치가 없어 70으로 깨진다 — 실제 Player가 채워져야 정확한 OVR/포지션이 나온다.
function buildTeamAdapter(
    teamId: string,
    teamName: string,
    box: PlayerBoxScore[],
    rosterCache: Record<string, Player>,
): Team {
    return {
        id: teamId,
        name: teamName,
        logo: getTeamLogoUrl(teamId),
        roster: box.map(b => rosterCache[b.playerId] ?? ({ id: b.playerId, name: b.playerName, position: b.position } as unknown as Player)),
    } as unknown as Team;
}

function computeTeamStats(logs: PbpLog[], shotEvents: ShotEvent[], teamId: string): TeamStats {
    const pts = logs
        .filter(l => (l.type === 'score' || l.type === 'freethrow') && l.teamId === teamId)
        .reduce((s, l) => s + (l.points ?? 0), 0);

    const teamShots = shotEvents.filter(s => s.teamId === teamId);
    const fgm  = teamShots.filter(s => s.isMake).length;
    const fga  = teamShots.length;
    const p3m  = teamShots.filter(s => s.zone === '3PT' && s.isMake).length;
    const p3a  = teamShots.filter(s => s.zone === '3PT').length;

    let ftm = 0, fta = 0;
    for (const l of logs) {
        if (l.type === 'freethrow' && l.teamId === teamId) {
            const m = l.text.match(/(\d+)\/(\d+)/);
            if (m) { ftm += parseInt(m[1]); fta += parseInt(m[2]); }
        }
    }

    const tov = logs.filter(l => l.type === 'turnover' && l.teamId === teamId).length;
    const blk = logs.filter(l => l.type === 'block'    && l.teamId === teamId).length;
    const pf  = logs.filter(l => l.type === 'foul'     && l.teamId === teamId).length;

    return { pts, fgm, fga, p3m, p3a, ftm, fta, tov, blk, pf };
}

// ─── Live Box Reconstruction (박스스코어 점진 공개) ────────────────────────────

function emptyBoxRow(playerId: string, playerName: string, position?: string): PlayerBoxScore {
    return {
        playerId, playerName, position,
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
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
        recentShots: [],
    };
}

// box_timeline의 포세션별 델타를 elapsed 시점까지 누적해 PlayerBoxScore[]로 재구성.
// 식별자(playerName/position)는 referenceBox(home_box/away_box)에서 가져오되 스탯 필드는 사용하지 않음(스포일러 아님).
function buildLiveBox(timeline: BoxTick[], elapsed: number, referenceBox: PlayerBoxScore[]): PlayerBoxScore[] {
    const rows = new Map<string, PlayerBoxScore>();
    const recentShots = new Map<string, boolean[]>();
    for (const ref of referenceBox) {
        rows.set(ref.playerId, emptyBoxRow(ref.playerId, ref.playerName, ref.position));
        recentShots.set(ref.playerId, []);
    }

    // 핫/콜드 스트릭(recentShots) 쿼터 전환 보정 — 엔진의 dampenHotCold(Q2/Q4 진입)·resetHotCold(Q3=하프타임) 경계 재현
    let dampenedQ2 = false, resetQ3 = false, dampenedQ4 = false;

    for (const tick of timeline) {
        const replayMs = (tick.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        if (replayMs > elapsed) break;

        if (!dampenedQ2 && tick.t >= 720) {
            for (const [pid, arr] of recentShots) recentShots.set(pid, arr.slice(-3));
            dampenedQ2 = true;
        }
        if (!resetQ3 && tick.t >= 1440) {
            for (const pid of recentShots.keys()) recentShots.set(pid, []);
            resetQ3 = true;
        }
        if (!dampenedQ4 && tick.t >= 2160) {
            for (const [pid, arr] of recentShots) recentShots.set(pid, arr.slice(-3));
            dampenedQ4 = true;
        }

        for (const pid of tick.on) {
            const row = rows.get(pid);
            if (row) row.mp += tick.mp;
        }
        for (const [pid, delta] of Object.entries(tick.d)) {
            const row = rows.get(pid);
            if (!row) continue;
            for (const [key, v] of Object.entries(delta) as [keyof BoxDelta, number][]) {
                row[key] = (row[key] ?? 0) + v;
            }
        }
        if (tick.shot && recentShots.has(tick.shot.p)) {
            const arr = recentShots.get(tick.shot.p)!;
            arr.push(tick.shot.m);
            if (arr.length > 5) arr.shift();
        }
    }

    for (const [pid, row] of rows) {
        row.recentShots = recentShots.get(pid);
    }

    return Array.from(rows.values());
}

// elapsed 시점 이하 마지막 tick의 tick.on(양 팀 합산 코트 위 playerId)을 반환한다.
// "지금 코트에 누가 있는지"는 이미 공개된 시점까지의 정보라 스포일러가 아니다.
function getOnCourtIds(timeline: BoxTick[], elapsed: number): Set<string> {
    let ids: string[] = [];
    for (const tick of timeline) {
        const replayMs = (tick.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        if (replayMs > elapsed) break;
        ids = tick.on;
    }
    return new Set(ids);
}

// ─── QuarterScores ────────────────────────────────────────────────────────────

const QuarterScores: React.FC<{
    allLogs:        PbpLog[];
    homeTeamId:     string;
    currentQuarter: number;
    homeAbbr:       string;
    awayAbbr:       string;
    /** true면 컨테이너 폭에 꽉 채워 늘림(라이브 사이드바용). 기본(false)은 <table>의 기본
     *  shrink-to-fit 성질 그대로 내용 크기만큼만 차지(헤더에서 쓰는 방식 — 부모가 이미
     *  가운데 정렬해주므로 폭을 강제로 늘릴 필요가 없음). */
    fullWidth?:     boolean;
}> = ({ allLogs, homeTeamId, currentQuarter, homeAbbr, awayAbbr, fullWidth }) => {
    // [Fix 2026-08-03] type==='score'|'freethrow' + teamId 매칭으로 직접 합산하던 방식은
    // 테크니컬 파울 자유투에서 깨짐 — 그 이벤트는 type:'foul'이라 필터에서 완전히 빠지고
    // (득점 자체가 누락), teamId도 파울한 팀(=득점 팀과 다름)이라 필터를 없애도 오귀속됨
    // (GamePbpTab.tsx와 동일 원인). 각 이벤트에 이미 저장된 정확한 누적 스코어 스냅샷에서
    // 쿼터 종료 시점 값의 차분(delta)을 구하는 방식으로 교체 — type/teamId에 의존하지 않음.
    const scores = useMemo(() => {
        const qEndHome: (number | null)[] = [null, null, null, null];
        const qEndAway: (number | null)[] = [null, null, null, null];
        let lastHome = 0, lastAway = 0;
        for (const log of allLogs) {
            if (log.homeScore != null && log.awayScore != null) {
                lastHome = log.homeScore;
                lastAway = log.awayScore;
            }
            const qi = Math.min(3, log.quarter - 1);
            qEndHome[qi] = lastHome;
            qEndAway[qi] = lastAway;
        }

        const home = [0, 0, 0, 0];
        const away = [0, 0, 0, 0];
        let prevHome = 0, prevAway = 0;
        for (let i = 0; i < 4; i++) {
            if (qEndHome[i] == null) break; // 아직 도달하지 않은 쿼터부터는 중단 (0 유지, isPlayed가 '—'로 표시)
            home[i] = qEndHome[i]! - prevHome;
            away[i] = qEndAway[i]! - prevAway;
            prevHome = qEndHome[i]!;
            prevAway = qEndAway[i]!;
        }
        return { home, away };
    }, [allLogs]);

    const hTotal = scores.home.reduce((a, b) => a + b, 0);
    const aTotal = scores.away.reduce((a, b) => a + b, 0);

    // [2026-08-02] 참고 예시(리그 공식 스코어보드) 구조 적용 — 카드형 외곽 테두리 없이,
    // 헤더 밑줄 + 원정행 밑줄만 있는 미니멀한 표. 좌상단 코너 칸은 빈 칸(라벨 텍스트 없음).
    // [2026-08-02] 구분이 잘 안 된다는 피드백으로 헤더행/이름열에 배경 음영 추가,
    // 쿼터 사이 전부(Q1|Q2|Q3|Q4|T) 구분선 추가, 이름열 우측 구분선 색상을 헤더/바디 전부
    // slate-700으로 통일, 헤더 텍스트 수직 중앙 정렬(align-middle + py-1.5 대칭 패딩),
    // 이름열(팀 약어) 텍스트 중앙 정렬.
    // [Fix 2026-08-04] 쿼터별 승/패 초록/빨강 셀 배경(quarterBg) 삭제.
    // [Fix 2026-08-04] 카드형 wrapper(bg-slate-800 rounded-md) 제거 — 헤더에서 탭 버튼처럼 꽉 차게
    // 개편하면서 별도 박스색 대신 슬레이트-950(가운데 섹션 배경과 동일)을 테이블 자체에 직접 적용.
    // [Fix 2026-08-04] 박스스코어 테이블(components/common/Table.tsx) 디자인 이식 — 헤더 행
    // uppercase/tracking-widest/text-slate-500, thead bg-slate-950 + border-b, tbody bg-slate-900,
    // 셀 구분선 border-slate-800/50로 통일(기존엔 행마다 border-b-slate-600/700/800이 제각각이었음).
    return (
        <table className={`text-sm font-mono border-collapse ${fullWidth ? 'w-full' : 'mx-auto'}`}>
            <thead className="bg-slate-950 border-b border-slate-800">
                <tr className="text-slate-500 font-black uppercase tracking-widest">
                    <th className="w-12 py-1.5 px-3"></th>
                    {[1, 2, 3, 4].map(q => (
                        <th key={q} className="text-center py-1.5 px-3 w-9">{q}쿼터</th>
                    ))}
                    <th className="text-center py-1.5 px-3 w-9">총합</th>
                </tr>
            </thead>
            <tbody className="bg-slate-900">
                <tr>
                    <td className="text-center py-1.5 px-3 font-bold text-slate-200 border-b border-slate-800/50">{awayAbbr}</td>
                    {scores.away.map((v, i) => {
                        const isPlayed = i + 1 <= currentQuarter;
                        return (
                            <td key={i} className="text-center py-1.5 px-3 tabular-nums text-slate-300 border-b border-slate-800/50">
                                {isPlayed ? v : '—'}
                            </td>
                        );
                    })}
                    <td className="text-center py-1.5 px-3 tabular-nums font-bold text-white border-b border-slate-800/50">{aTotal}</td>
                </tr>
                <tr>
                    <td className="text-center py-1.5 px-3 font-bold text-slate-200 border-b border-slate-800/50">{homeAbbr}</td>
                    {scores.home.map((v, i) => {
                        const isPlayed = i + 1 <= currentQuarter;
                        return (
                            <td key={i} className="text-center py-1.5 px-3 tabular-nums text-slate-300 border-b border-slate-800/50">
                                {isPlayed ? v : '—'}
                            </td>
                        );
                    })}
                    <td className="text-center py-1.5 px-3 tabular-nums font-bold text-white border-b border-slate-800/50">{hTotal}</td>
                </tr>
            </tbody>
        </table>
    );
};

// ─── PlayerBoxPanel ───────────────────────────────────────────────────────────
// [Fix 2026-08-05] 박스스코어 테이블(components/common/Table.tsx / BoxScoreTable.tsx) 디자인
// 이식 — div 기반 그리드를 실제 <table>로 교체, thead bg-slate-950 + uppercase/tracking-widest/
// text-slate-500, tbody bg-slate-900, 셀 구분선 border-slate-800/50, 스탯 숫자 text-white
// font-semibold tabular-nums, 팀합계 행 bg-slate-800/50 + border-t border-slate-700로 통일
// (바로 위 QuarterScores와 동일 패턴). 라이브 전용 기능(온코트 강조/핫콜드 스트릭)은 유지.

const PlayerBoxPanel: React.FC<{
    players: PlayerBoxScore[];
    label:   string;
    onCourtIds?: Set<string>;
}> = ({ players, label, onCourtIds }) => {
    const sorted = useMemo(
        () => [...players].sort((a, b) => (b.mp ?? 0) - (a.mp ?? 0)),
        [players],
    );

    const total = useMemo(() => {
        const s = (fn: (p: PlayerBoxScore) => number) => sorted.reduce((acc, p) => acc + fn(p), 0);
        return {
            pts: s(p => p.pts), reb: s(p => p.reb), ast: s(p => p.ast),
            stl: s(p => p.stl), blk: s(p => p.blk), tov: s(p => p.tov),
            pf:  s(p => p.pf),  fgm: s(p => p.fgm), fga: s(p => p.fga),
            p3m: s(p => p.p3m), p3a: s(p => p.p3a),
            ftm: s(p => p.ftm), fta: s(p => p.fta),
        };
    }, [sorted]);

    const statCell = 'text-right py-1.5 px-1.5 border-b border-slate-800/50 text-white font-semibold tabular-nums';
    // [Fix 2026-08-05] "TEAM 행의 FG%/3P%/FT% 표기를 00.0%에서 .000으로" 요청 — 야구 타율식
    // 표기(선행 0 생략 + 소수 3자리). 100%(=1.000)는 애초에 "0"으로 시작 안 해서 그대로 안 잘림.
    const fmtPct3 = (made: number, att: number) => att > 0 ? (made / att).toFixed(3).replace(/^0/, '') : '-';

    return (
        <div className="flex flex-col min-h-0 shrink-0 overflow-x-auto">
            {/* [Fix 2026-08-05] "박스스코어 총 너비에 따라 스탯 컬럼 너비를 균일하게" 요청 —
                기존엔 각 <th>에 고정 px 너비(w-6/w-7/w-8/w-14/w-12)를 줬는데, table-collapse는
                콘텐츠 기준 auto 레이아웃이라 패널 폭이 바뀌어도 스탯 컬럼은 그대로고 남는/모자란
                폭이 전부 PLAYER 열로만 쏠렸다. table-fixed + colgroup 퍼센트 지정으로 바꿔서
                패널 폭이 얼마든 각 컬럼이 항상 같은 비율을 유지하게 함. FG/3P/FT는 "12-34"처럼
                두 자리-두 자리 조합이 들어가 다른 단일 숫자 컬럼보다 넓게(8%), 나머지 단일 숫자
                컬럼(P/MP/PTS/REB/AST/STL/BLK/TOV/PF)은 좁게 잡았다(P/MP 5%, 나머지 6%).
                [Fix 2026-08-05] "야투/3점이 두 자리씩(예: 10-18)이면 좁은 화면에서 줄바꿈된다" —
                화면 크기에 무관한 해결책 3종 세트: ① whitespace-nowrap(테이블 전체에 상속시켜
                모든 셀 텍스트가 줄바꿈 대신 한 줄 유지) ② min-w-[600px](table-fixed 퍼센트가
                과도하게 좁아지는 것 자체를 방지하는 바닥값) ③ 부모 div에 overflow-x-auto(그래도
                컨테이너가 600px보다 좁으면 컬럼을 찌그러뜨리는 대신 테이블 전체를 가로 스크롤). */}
            <table className="w-full min-w-[600px] text-xs font-mono border-collapse table-fixed whitespace-nowrap">
                <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[5%]" />
                    <col className="w-[5%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                </colgroup>
                <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm">
                    <tr className="text-slate-500 font-black uppercase tracking-widest">
                        <th className="text-left py-2 px-2 font-sans">{label}</th>
                        <th className="text-center py-2 px-1">P</th>
                        <th className="text-right py-2 px-1">MP</th>
                        <th className="text-right py-2 px-1.5">PTS</th>
                        <th className="text-right py-2 px-1.5">REB</th>
                        <th className="text-right py-2 px-1.5">AST</th>
                        <th className="text-right py-2 px-1.5">STL</th>
                        <th className="text-right py-2 px-1.5">BLK</th>
                        <th className="text-right py-2 px-1.5">TOV</th>
                        <th className="text-right py-2 px-1.5">PF</th>
                        <th className="text-right py-2 px-1.5">FG</th>
                        <th className="text-right py-2 px-1.5">3P</th>
                        <th className="text-right py-2 px-1.5">FT</th>
                    </tr>
                </thead>
                <tbody className="bg-slate-900">
                    {sorted.map(p => (
                        <tr
                            key={p.playerId}
                            className={`transition-colors hover:bg-white/5 ${onCourtIds?.has(p.playerId) ? 'bg-emerald-400/15' : ''}`}
                        >
                            <td className="py-1.5 px-2 border-b border-slate-800/50 font-sans text-slate-300">
                                <span className="flex items-center gap-1 min-w-0">
                                    {p.playerName
                                        ? <span className="truncate">{p.playerName}</span>
                                        : <Skeleton className="h-3 w-20" />}
                                    {(() => {
                                        const s = p.recentShots;
                                        if (s && s.length >= 3 && s.slice(-3).every(Boolean)) return <span className="shrink-0">🔥</span>;
                                        if (s && s.length >= 4 && s.slice(-4).every(v => !v)) return <span className="shrink-0">❄️</span>;
                                        return null;
                                    })()}
                                </span>
                            </td>
                            <td className="text-center py-1.5 px-1 border-b border-slate-800/50 text-slate-300">{p.position ?? '-'}</td>
                            <td className="text-right py-1.5 px-1 border-b border-slate-800/50 text-slate-300 tabular-nums">{Math.round(p.mp ?? 0)}</td>
                            <td className={statCell}>{p.pts}</td>
                            <td className={statCell}>{p.reb}</td>
                            <td className={statCell}>{p.ast}</td>
                            <td className={statCell}>{p.stl}</td>
                            <td className={statCell}>{p.blk}</td>
                            <td className={statCell}>{p.tov}</td>
                            <td className={statCell}>{p.pf}</td>
                            <td className={statCell}>{p.fgm}-{p.fga}</td>
                            <td className={statCell}>{p.p3m}-{p.p3a}</td>
                            <td className={statCell}>{p.ftm}-{p.fta}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-slate-800/50 border-t border-slate-700 text-white font-semibold">
                        <td className="py-1.5 px-2 font-sans uppercase text-xs">TEAM</td>
                        <td />
                        <td />
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.pts}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.reb}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.ast}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.stl}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.blk}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.tov}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{total.pf}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{fmtPct3(total.fgm, total.fga)}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{fmtPct3(total.p3m, total.p3a)}</td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums">{fmtPct3(total.ftm, total.fta)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// ─── BoxScorePlaceholder (live 구간 — 박스스코어 비공개) ────────────────────────

const BoxScorePlaceholder: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex flex-col shrink-0">
        <div className="flex items-center px-2 h-9 text-xs font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950 text-slate-500 shadow-sm">
            {label}
        </div>
        <div className="py-10 text-center text-slate-600 text-xs ko-normal">
            박스스코어는 중계 종료 후 공개됩니다
        </div>
    </div>
);

// ─── TeamStatsCompare ─────────────────────────────────────────────────────────

const TEAM_STAT_ROWS = [
    { key: 'pts',   label: 'PTS', fmt: (v: number) => String(v)      },
    { key: 'fgm',   label: 'FGM', fmt: (v: number) => String(v)      },
    { key: 'fga',   label: 'FGA', fmt: (v: number) => String(v)      },
    { key: 'fgPct', label: 'FG%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'p3m',   label: '3PM', fmt: (v: number) => String(v)      },
    { key: 'p3a',   label: '3PA', fmt: (v: number) => String(v)      },
    { key: 'p3Pct', label: '3P%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'ftm',   label: 'FTM', fmt: (v: number) => String(v)      },
    { key: 'fta',   label: 'FTA', fmt: (v: number) => String(v)      },
    { key: 'ftPct', label: 'FT%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'oreb',  label: 'OREB', fmt: (v: number) => String(v)     },
    { key: 'reb',   label: 'REB', fmt: (v: number) => String(v)      },
    { key: 'ast',   label: 'AST', fmt: (v: number) => String(v)      },
    { key: 'stl',   label: 'STL', fmt: (v: number) => String(v)      },
    { key: 'tov',   label: 'TOV', fmt: (v: number) => String(v)      },
    { key: 'blk',   label: 'BLK', fmt: (v: number) => String(v)      },
    { key: 'pf',    label: 'PF',  fmt: (v: number) => String(v)      },
] as const;

const TeamStatsCompare: React.FC<{
    home:      TeamStats;
    away:      TeamStats;
    homeBox:   PlayerBoxScore[];
    awayBox:   PlayerBoxScore[];
    homeColor: string;
    awayColor: string;
}> = ({ home, away, homeBox, awayBox, homeColor, awayColor }) => {
    const derived = useMemo(() => {
        const sum = (box: PlayerBoxScore[], fn: (p: PlayerBoxScore) => number) => box.reduce((s, p) => s + fn(p), 0);
        const mk = (s: TeamStats, box: PlayerBoxScore[]) => ({
            pts:   s.pts,
            fgm:   s.fgm,
            fga:   s.fga,
            fgPct: s.fga > 0 ? (s.fgm / s.fga) * 100 : 0,
            p3m:   s.p3m,
            p3a:   s.p3a,
            p3Pct: s.p3a > 0 ? (s.p3m / s.p3a) * 100 : 0,
            ftm:   s.ftm,
            fta:   s.fta,
            ftPct: s.fta > 0 ? (s.ftm / s.fta) * 100 : 0,
            oreb:  sum(box, p => p.offReb),
            reb:   sum(box, p => p.reb),
            ast:   sum(box, p => p.ast),
            stl:   sum(box, p => p.stl),
            tov:   s.tov,
            blk:   s.blk,
            pf:    s.pf,
        });
        return { home: mk(home, homeBox), away: mk(away, awayBox) };
    }, [home, away, homeBox, awayBox]);

    return (
        <div className="shrink-0 px-3 py-2 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">팀 스탯</p>
            <div className="flex flex-col gap-1">
                {TEAM_STAT_ROWS.map(({ key, label, fmt }) => {
                    const h = derived.home[key];
                    const a = derived.away[key];
                    const total = h + a;
                    const hPct  = total > 0 ? (h / total) * 100 : 50;
                    const aPct  = total > 0 ? (a / total) * 100 : 50;
                    const bothZero = h === 0 && a === 0;
                    return (
                        <div key={key} className="grid grid-cols-[1fr_30px_36px_30px_1fr] items-center gap-1">
                            <div className="h-2.5 flex justify-end rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${aPct}%`, backgroundColor: awayColor }} />}
                            </div>
                            <span className={`text-[10px] font-mono text-right text-white ${a > h ? 'font-bold' : ''}`}>{fmt(a)}</span>
                            <span className="text-xs font-bold text-slate-500 text-center uppercase">{label}</span>
                            <span className={`text-[10px] font-mono text-left text-white ${h > a ? 'font-bold' : ''}`}>{fmt(h)}</span>
                            <div className="h-2.5 flex justify-start rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${hPct}%`, backgroundColor: homeColor }} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── GameInsightsPanel ────────────────────────────────────────────────────────
// ORTG/DRTG/NRTG/Pace/AVG POSS. + 마진·승률 통합 차트("인사이트" 탭, 종료된 경기 전용).
// 포제션 추정은 표준 근사식(POSS ≈ FGA − OREB + TOV + 0.4×FTA)을 그대로 쓰고, 시간 계산은
// 이 파일 전역에서 이미 쓰는 toGameSeconds()와 동일하게 "쿼터(연장 포함) = 12분"으로 단순화한다
// (연장을 5분으로 정확히 계산하면 toGameSeconds 기반 이벤트 타임스탬프와 스케일이 어긋남).

interface InsightsStat {
    ortg: number;
    drtg: number;
    nrtg: number;
    avgPossSec: number;
}

// 포제션 툴팁에 쓰는 구조화된 플레이 상세 한 건 — PBP 문장이 아니라 boxTimeline(BoxTick.d)의
// 실제 카운팅 스탯 변화분에서 뽑아낸 값(득점/자유투/어시스트/리바운드/스틸/블락/턴오버).
// teamAbbr은 어느 팀 선수의 플레이인지 구분하기 위한 팀 약어(선수명 옆 괄호 표시용).
// attempts는 'ft'(자유투) 전용 — value=성공 수, attempts=시도 수로 "M/A" 형태로 보여준다.
type PlayDetail = { kind: 'pts' | 'ast' | 'reb' | 'stl' | 'blk' | 'tov' | 'ft'; playerName: string; teamAbbr: string; value?: number; attempts?: number };

// 팀별 포제션 연속 막대의 세그먼트 한 조각. filler=상대팀 차례(투명), 그 외는 이 팀 자신의
// 포제션/타임아웃 결과. durationSec/endSec은 호버 툴팁에서 "몇 초짜리 포제션이 몇 쿼터
// 몇 분에 끝났는지" 보여주기 위한 값. plays는 그 포제션 동안 있었던 구조화된 플레이 상세
// (미스→오펜스 리바운드→풋백 성공처럼 한 포제션에 여러 플레이가 있을 수 있어 배열).
type SegmentPiece = {
    widthPct: number;
    kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' | 'filler';
    durationSec: number;
    endSec: number;
    plays: PlayDetail[];
};

function estimatePossessions(s: TeamStats, oreb: number): number {
    return Math.max(1, s.fga - oreb + s.tov + 0.4 * s.fta);
}

// toGameSeconds()의 역변환 — 마우스 x 위치(경과초)를 "Q{n} {mm:ss}" 형태로 되돌린다.
// toGameSeconds와 동일하게 쿼터(연장 포함) = 12분으로 가정해 스케일을 맞춘다.
function secondsToClock(elapsedSec: number, maxQuarter: number): { quarter: number; clock: string } {
    const q = Math.min(maxQuarter, Math.max(1, Math.floor(elapsedSec / 720) + 1));
    const remaining = Math.max(0, Math.min(720, 720 - (elapsedSec - (q - 1) * 720)));
    return { quarter: q, clock: formatTime(remaining) };
}

// 포제션 막대의 팀명 라벨 칸 폭 — 마진/승률 차트, 쿼터 라벨 행에도 동일하게 적용해
// 세 요소의 시간축(0~100%) 시작점을 픽셀 단위로 맞춘다(TeamPossessionRow 주석 참조).
const GUTTER_W = 'w-9';

// 무득점 포제션이 전체 포제션의 대다수를 차지해 폭 비례 막대에서 회색이 사실상 배경처럼
// 깔려 보이는 문제가 있어, 무득점 포제션/상대팀 차례(filler)는 색을 채우지 않고(투명)
// 득점/턴오버/타임아웃만 도드라지게 한다.
const SEGMENT_COLOR: Record<SegmentPiece['kind'], string> = {
    scoring: 'bg-emerald-400',
    nonScoring: '',
    turnover: 'bg-red-400',
    timeout: 'bg-white',
    filler: '',
};
const OUTCOME_LABEL: Record<'scoring' | 'nonScoring' | 'turnover' | 'timeout', string> = {
    scoring: '득점 포제션',
    nonScoring: '무득점 포제션',
    turnover: '턴오버',
    timeout: '타임아웃',
};
// 툴팁의 플레이 상세 뱃지(득점/자유투/어시스트/리바운드/스틸/블락/턴오버) 아이콘·라벨·색상.
const PLAY_DETAIL_META: Record<PlayDetail['kind'], { icon: string; label: string; color: string }> = {
    pts: { icon: '🏀', label: '득점', color: 'text-emerald-400' },
    ft: { icon: '🎯', label: '자유투', color: 'text-teal-400' },
    ast: { icon: '🤝', label: '어시스트', color: 'text-sky-400' },
    reb: { icon: '⬆️', label: '리바운드', color: 'text-slate-300' },
    stl: { icon: '🖐️', label: '스틸', color: 'text-amber-400' },
    blk: { icon: '🚫', label: '블락', color: 'text-purple-400' },
    tov: { icon: '❌', label: '턴오버', color: 'text-red-400' },
};
// 한 포제션 안의 여러 플레이가 boxTimeline의 Object 키 순서(실제 사건 순서와 무관)로 뒤섞여
// "블락/리바운드/어시스트/득점"이 의미 없이 나열되는 문제 — "수비(블락/스틸) → 리바운드 →
// 어시스트 → 자유투 → 결과(득점/턴오버)" 순서로 항상 재정렬해 그 포제션의 서사를 읽을 수 있게 한다.
const PLAY_KIND_ORDER: Record<PlayDetail['kind'], number> = { blk: 0, stl: 1, reb: 2, ast: 3, ft: 4, tov: 5, pts: 6 };

// 팀별 연속 막대 — 팀명을 막대 위에 겹쳐 표시했더니 게임 초반 세그먼트(0% 지점 근처)와 색이
// 겹쳐 지저분해 보였다. 팀명을 막대 바깥 고정폭 칸으로 분리해 절대 겹치지 않게 한다(막대
// 자체의 시간축은 이 칸만큼 살짝 안쪽에서 시작 — 위 차트와의 완전한 픽셀 정렬보다 가독성을
// 우선). 각 틱(상대팀 차례/무득점 포제션 제외)에 호버하면 쿼터/시계 + 결과 + 길이 + 플레이
// 상세를 보여주는 툴팁을 띄운다.
// [2026-08-03] 이 컴포넌트를 GameInsightsPanel 렌더 함수 "안"에 정의했더니, 부모가 재렌더될
// 때마다 매번 새 컴포넌트 타입이 되어 React가 이전 인스턴스를 unmount→새로 mount — 호버
// 중이던 useState(hoverIdx)가 초기화되며 "마우스가 안 나갔는데 툴팁이 사라지는" 버그의
// 원인이었다. 모듈 최상위로 끌어올려 컴포넌트 아이덴티티를 고정해서 해결.
const TeamPossessionRow: React.FC<{
    label: string;
    segments: SegmentPiece[];
    maxQuarter: number;
    /** 툴팁을 막대 위/아래 중 어디에 띄울지 — 원정 행(헤더 바로 아래)은 아래쪽으로 띄워야
     *  상단 고정 헤더에 잘리지 않고, 홈 행(패널 하단 근처)은 위쪽으로 띄운다. */
    tooltipDirection: 'up' | 'down';
}> = ({ label, segments, maxQuarter, tooltipDirection }) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    let cum = 0;
    const positioned = segments.map(s => {
        const startPct = cum;
        cum += s.widthPct;
        return { ...s, startPct };
    });
    const hovered = hoverIdx != null ? positioned[hoverIdx] : null;

    return (
        // [2026-08-03] 팀명 라벨을 막대 위 오버레이로 얹었더니, 막대는 컨테이너 전체 폭(0~100%)을
        // 쓰는데 위/아래의 마진·승률 차트와 쿼터 라벨 행은 그 라벨 폭만큼의 여백이 없어 시간축
        // 시작점이 서로 어긋나 보였다("차트에는 변동이 있는데 막대엔 안 보인다"는 지적의 원인) —
        // 라벨을 다시 막대 바깥 고정폭 칸(GUTTER_W)으로 분리하고, 차트/쿼터 라벨 행에도 동일한
        // 폭의 여백을 줘서 세 요소의 시간축 시작점을 픽셀 단위로 맞춘다.
        <div className="flex items-center gap-2 w-full">
            <span className={`${GUTTER_W} shrink-0 text-[13px] font-black text-slate-300 uppercase tracking-wider truncate`}>{label}</span>
            <div className="relative flex-1 h-3 flex">
                {positioned.map((s, i) => (s.kind === 'filler' || s.kind === 'nonScoring') ? (
                    <div key={i} className="h-full" style={{ width: `${s.widthPct}%` }} />
                ) : (
                    <div
                        key={i}
                        className={`h-full cursor-default ${SEGMENT_COLOR[s.kind]}`}
                        style={{ width: `${s.widthPct}%` }}
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                    />
                ))}
                {hovered && (() => {
                    const { quarter, clock } = secondsToClock(hovered.endSec, maxQuarter);
                    return (
                        <div
                            className={`absolute -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg z-20 max-w-[240px] ${
                                tooltipDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                            }`}
                            style={{ left: `${Math.min(96, Math.max(4, hovered.startPct + hovered.widthPct / 2))}%` }}
                        >
                            <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">Q{quarter} {clock}</p>
                            <p className="text-[11px] font-black text-white whitespace-nowrap">
                                {OUTCOME_LABEL[hovered.kind as 'scoring' | 'nonScoring' | 'turnover' | 'timeout']} · {hovered.durationSec.toFixed(0)}초
                            </p>
                            {hovered.plays.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-slate-700 flex flex-col gap-1">
                                    {hovered.plays.map((p, i) => {
                                        const meta = PLAY_DETAIL_META[p.kind];
                                        return (
                                            <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap">
                                                <span>{meta.icon}</span>
                                                <span className={meta.color}>{meta.label}</span>
                                                <span className="text-white">{p.playerName}</span>
                                                <span className="text-slate-500">({p.teamAbbr})</span>
                                                {p.kind === 'ft'
                                                    ? <span className="text-slate-400">{p.value ?? 0}/{p.attempts ?? 0}</span>
                                                    : (p.value != null && <span className="text-slate-400">+{p.value}</span>)}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

const GameInsightsPanel: React.FC<{
    allLogs:     PbpLog[];
    homeTeamId:  string;
    homeStats:   TeamStats;
    awayStats:   TeamStats;
    homeOreb:    number;
    awayOreb:    number;
    maxQuarter:  number;
    homeColor:   string;
    awayColor:   string;
    homeAbbr:    string;
    awayAbbr:    string;
    /** 포제션 툴팁의 득점/어시스트/리바운드/스틸/블락/턴오버 상세용 — 없으면(구버전 저장 데이터) 상세 없이 표시 */
    boxTimeline?: BoxTick[];
    homeBox:     PlayerBoxScore[];
    awayBox:     PlayerBoxScore[];
}> = ({ allLogs, homeTeamId, homeStats, awayStats, homeOreb, awayOreb, maxQuarter, homeColor, awayColor, homeAbbr, awayAbbr, boxTimeline, homeBox, awayBox }) => {
    const totalMinutes = maxQuarter * 12;

    // playerId → 이름+소속 팀 약어 (플레이 상세에서 "선수명 (팀약어)"로 표시해 어느 팀 플레이인지 구분)
    const playerInfoMap = useMemo(() => {
        const map = new Map<string, { name: string; teamAbbr: string }>();
        for (const p of homeBox) map.set(p.playerId, { name: p.playerName, teamAbbr: homeAbbr });
        for (const p of awayBox) map.set(p.playerId, { name: p.playerName, teamAbbr: awayAbbr });
        return map;
    }, [homeBox, awayBox, homeAbbr, awayAbbr]);

    const { home, away }: { home: InsightsStat; away: InsightsStat } = useMemo(() => {
        const homePoss = estimatePossessions(homeStats, homeOreb);
        const awayPoss = estimatePossessions(awayStats, awayOreb);
        const avgPoss  = (homePoss + awayPoss) / 2;
        const homeORTG = avgPoss > 0 ? (homeStats.pts / avgPoss) * 100 : 0;
        const awayORTG = avgPoss > 0 ? (awayStats.pts / avgPoss) * 100 : 0;

        // 포제션 평균 길이(초) — isPossessionEnd 이벤트 타임스탬프 간격을 실측해 팀별로
        // 정확히 구한다. 턴오버가 잦은 팀은 짧아지고 오펜스 리바운드로 길게 끄는 팀은 길어지는
        // 실제 차이가 그대로 반영되므로 홈/원정 값이 서로 달라야 정상이다(똑같이 나오면 그건
        // 근사식 폴백 중이라는 뜻). isPossessionEnd가 없는 구버전 저장 데이터만 팀별 구분 없이
        // 양팀 합산 포제션 수 기준 근사식(24초 샷클락을 넘지 않는 합리적 단일값)으로 폴백한다.
        let lastEnd = 0;
        const homeDurations: number[] = [];
        const awayDurations: number[] = [];
        for (const log of allLogs) {
            if (!log.isPossessionEnd || !log.possessionOutcome) continue;
            const t = toGameSeconds(log);
            const duration = t - lastEnd;
            if (duration > 0) {
                const possTeamId = log.possessionTeamId ?? log.teamId;
                (possTeamId === homeTeamId ? homeDurations : awayDurations).push(duration);
            }
            lastEnd = t;
        }
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const hasRealDurations = homeDurations.length > 0 && awayDurations.length > 0;
        const fallbackAvgPossSec = (homePoss + awayPoss) > 0 ? (totalMinutes * 60) / (homePoss + awayPoss) : 0;
        const homeAvgPossSec = hasRealDurations ? avg(homeDurations) : fallbackAvgPossSec;
        const awayAvgPossSec = hasRealDurations ? avg(awayDurations) : fallbackAvgPossSec;

        return {
            home: { ortg: homeORTG, drtg: awayORTG, nrtg: homeORTG - awayORTG, avgPossSec: homeAvgPossSec },
            away: { ortg: awayORTG, drtg: homeORTG, nrtg: awayORTG - homeORTG, avgPossSec: awayAvgPossSec },
        };
    }, [homeStats, awayStats, homeOreb, awayOreb, totalMinutes, allLogs, homeTeamId]);

    // 득점/자유투가 실제로 발생한 시점(경과초)마다의 누적 스코어 — 분 단위로 스냅샷을 뜨면
    // 한 분 안에서 일어나는 여러 득점이 한 점으로 뭉개져 참고 예시보다 변동이 훨씬 완만해 보이는
    // 문제가 있었다. 실제 득점 이벤트 하나하나를 데이터 포인트로 써서 그래프 해상도를 실제
    // 포제션 단위까지 끌어올린다(호버 툴팁도 동일 배열을 조회용으로 재사용).
    const scoreEvents = useMemo(() => {
        const evs: { elapsedSec: number; hScore: number; aScore: number }[] = [{ elapsedSec: 0, hScore: 0, aScore: 0 }];
        let hScore = 0, aScore = 0;
        for (const log of allLogs) {
            if (log.type === 'score' || log.type === 'freethrow') {
                const p = log.points ?? 0;
                if (log.teamId === homeTeamId) hScore += p; else aScore += p;
                const elapsedSec = toGameSeconds(log);
                const lastEv = evs[evs.length - 1];
                // 자유투 연속 시도처럼 같은 순간(게임 시계가 안 흐르는 구간)에 점수가 여러 번
                // 바뀌는 경우, 각각을 별도 스텝으로 찍으면 실제로는 한 포제션의 결과인데
                // 계단이 여러 번 겹쳐 필요 이상으로 뾰족해 보인다 — 같은 경과초는 한 포인트로 합친다.
                if (lastEv.elapsedSec === elapsedSec) {
                    lastEv.hScore = hScore;
                    lastEv.aScore = aScore;
                } else {
                    evs.push({ elapsedSec, hScore, aScore });
                }
            }
        }
        return evs;
    }, [allLogs, homeTeamId]);

    // scoreEvents를 그대로 차트 포인트로 사용 — 마지막 득점 이후 경기 종료 시점까지는
    // 라인을 오른쪽 끝(totalMinutes)까지 그대로 이어주는 마무리 포인트를 하나 추가한다.
    const chartPoints = useMemo(() => {
        const pts = scoreEvents.map(ev => {
            const elapsedMin = ev.elapsedSec / 60;
            return { elapsedMin, margin: ev.hScore - ev.aScore, wp: calculateWinProbability(ev.hScore, ev.aScore, elapsedMin) };
        });
        const last = scoreEvents[scoreEvents.length - 1];
        if (last && last.elapsedSec / 60 < totalMinutes) {
            pts.push({ elapsedMin: totalMinutes, margin: last.hScore - last.aScore, wp: calculateWinProbability(last.hScore, last.aScore, totalMinutes) });
        }
        return pts;
    }, [scoreEvents, totalMinutes]);

    // 포제션 단위 연속 막대(득점/무득점/턴오버/타임아웃) — isPossessionEnd/possessionOutcome이
    // 있는 구간(2026-08-02 이후 시뮬레이션된 경기)에서만 채워진다. 구버전 저장 데이터는 이
    // 필드가 아예 없어서 자연스럽게 빈 배열이 되고, 아래 렌더링에서 행 자체를 안 그린다
    // (소급 적용 없음). 각 세그먼트 폭은 실제 포제션 길이(초) 비율 — 이전엔 각 이벤트를 한
    // 시점(frac)의 점으로만 찍어서 포제션 사이 여백이 그대로 드러나 듬성듬성해 보였다.
    // 팀별로 독립된 막대를 만들되(원정/홈 구분), 시간축은 위 차트와 계속 일치해야 하므로
    // "상대팀 차례"인 구간도 필러(투명) 세그먼트로 채워 넣어 막대 전체 폭 = 전체 게임 시간이
    // 되도록 한다. 타임아웃은 실제 지속시간이 거의 0이라 최소 폭을 강제로 부여해 막대 흐름
    // 안의 일부 구간처럼(슬라이더 핸들처럼 튀어나오지 않게) 자연스럽게 끼워 넣는다.
    // homeTeamId만 prop으로 있고 awayTeamId는 없어서, "이 로그가 isHome 행 소유인가"는
    // teamId === homeTeamId 여부의 참/역으로 판단한다(경기엔 두 팀뿐이므로 충분).
    // [Simplify 2026-08-05] 기존엔 buildTeamSegments(true)/buildTeamSegments(false)를 각각
    // useMemo로 따로 호출해서 allLogs·boxTimeline을 통째로 두 번 순회했음(팀별 ownTeam 여부만
    // 다를 뿐, boxTimeline tick에서 뽑는 details는 팀 필터링이 없어 두 번 다 동일한 값을
    // 계산해서 버림). 한 번의 순회에서 home/away 세그먼트를 동시에 쌓도록 병합.
    const teamSegments = useMemo(() => {
        const totalSec = totalMinutes * 60;
        if (totalSec <= 0) return { home: [] as SegmentPiece[], away: [] as SegmentPiece[] };
        const home: SegmentPiece[] = [];
        const away: SegmentPiece[] = [];
        const ticks = boxTimeline ?? [];
        let lastEnd = 0;
        let tickCursor = 0; // boxTimeline은 시간순으로 쌓이므로 포인터로 같이 순회

        for (const log of allLogs) {
            let kind: 'scoring' | 'nonScoring' | 'turnover' | 'timeout' | null = null;
            let homeOwnTeam = false;
            if (log.type === 'timeout') {
                kind = 'timeout';
                homeOwnTeam = log.teamId === homeTeamId;
            } else if (log.isPossessionEnd && log.possessionOutcome) {
                kind = log.possessionOutcome;
                homeOwnTeam = (log.possessionTeamId ?? log.teamId) === homeTeamId;
            }
            if (!kind) continue;
            const awayOwnTeam = !homeOwnTeam;

            const t = toGameSeconds(log);
            const duration = t - lastEnd;

            // boxTimeline(BoxTick.d)에서 이 구간(lastEnd, t] 안에 든 포제션들의 실제 카운팅
            // 스탯 변화분을 구조화된 플레이 상세로 뽑는다 — PBP 문장 대신 득점/자유투/어시스트/
            // 리바운드/스틸/블락/턴오버만. boxTimeline이 없는(구버전 저장 데이터) 경기는
            // ticks가 빈 배열이라 details도 자연스럽게 비게 된다. 팀 구분 없이 한 번만 계산해서
            // home/away 양쪽에서 재사용(어차피 소유팀 쪽에만 저장되므로 계산 자체는 공용).
            const details: PlayDetail[] = [];
            while (tickCursor < ticks.length && ticks[tickCursor].t <= t) {
                const tick = ticks[tickCursor];
                if (tick.t > lastEnd) {
                    for (const [playerId, delta] of Object.entries(tick.d)) {
                        const info = playerInfoMap.get(playerId) ?? { name: '?', teamAbbr: '' };
                        const { name, teamAbbr } = info;
                        if (delta.pts) details.push({ kind: 'pts', playerName: name, teamAbbr, value: delta.pts });
                        // 자유투는 성공(pts)/실패 여부와 무관하게 시도(fta)가 있으면 별도로 표시 —
                        // 필드골 득점과 구분해서 "자유투를 몇 개 중 몇 개 넣었는지" 볼 수 있게 한다.
                        if (delta.fta) details.push({ kind: 'ft', playerName: name, teamAbbr, value: delta.ftm ?? 0, attempts: delta.fta });
                        if (delta.ast) details.push({ kind: 'ast', playerName: name, teamAbbr });
                        if ((delta.reb ?? 0) + (delta.offReb ?? 0) > 0) details.push({ kind: 'reb', playerName: name, teamAbbr });
                        if (delta.stl) details.push({ kind: 'stl', playerName: name, teamAbbr });
                        if (delta.blk) details.push({ kind: 'blk', playerName: name, teamAbbr });
                        if (delta.tov) details.push({ kind: 'tov', playerName: name, teamAbbr });
                    }
                }
                tickCursor++;
            }
            // boxTimeline의 원본 순서는 Object 키 순서일 뿐 실제 사건 순서가 아니라, 항상
            // "수비(블락/스틸) → 리바운드 → 어시스트 → 결과(득점/턴오버)" 순으로 재정렬한다.
            details.sort((a, b) => PLAY_KIND_ORDER[a.kind] - PLAY_KIND_ORDER[b.kind]);

            if (duration > 0) {
                // 짧은 득점/턴오버/타임아웃 포제션은 실제 길이 그대로 폭을 주면 몇 픽셀짜리
                // 슬리버가 돼서 호버 히트박스가 거의 안 잡힌다(툴팁 띄우기 힘들다는 피드백).
                // 시각적 폭(hover 대상)에만 최소값을 보장하고, 실제 길이(durationSec)는 안 건드림.
                let homeVisualDuration = duration;
                if (homeOwnTeam && (kind === 'timeout' || kind === 'scoring' || kind === 'turnover')) {
                    homeVisualDuration = Math.max(duration, totalSec * 0.006);
                }
                home.push({
                    widthPct: (homeVisualDuration / totalSec) * 100,
                    kind: homeOwnTeam ? kind : 'filler',
                    durationSec: duration,
                    endSec: t,
                    plays: homeOwnTeam ? details : [],
                });

                let awayVisualDuration = duration;
                if (awayOwnTeam && (kind === 'timeout' || kind === 'scoring' || kind === 'turnover')) {
                    awayVisualDuration = Math.max(duration, totalSec * 0.006);
                }
                away.push({
                    widthPct: (awayVisualDuration / totalSec) * 100,
                    kind: awayOwnTeam ? kind : 'filler',
                    durationSec: duration,
                    endSec: t,
                    plays: awayOwnTeam ? details : [],
                });
            }
            lastEnd = t;
        }
        return { home, away };
    }, [allLogs, homeTeamId, totalMinutes, boxTimeline, playerInfoMap]);

    const homeSegments = teamSegments.home;
    const awaySegments = teamSegments.away;

    const [hoverFrac, setHoverFrac] = useState<number | null>(null);
    const chartRef = useRef<HTMLDivElement>(null);
    const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = chartRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        setHoverFrac(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    };
    const handleChartMouseLeave = () => setHoverFrac(null);

    const W = 800, H = 220, PAD = 16, MID = H / 2;
    const marginScale = Math.max(10, Math.ceil(Math.max(...chartPoints.map(p => Math.abs(p.margin)), 10) / 5) * 5);
    // [Fix 2026-08-05] "그래프가 반대로 움직인다" — 패널 배치는 위=원정/아래=홈인데, margin/wp는
    // 둘 다 홈 기준값(양수=홈이 앞섬)이라 MID - v 그대로 쓰면 홈이 앞설 때 선이 위(원정 쪽)로
    // 올라가는 게 거꾸로였다. 홈이 앞서면 아래(홈 라벨 쪽)로, 원정이 앞서면 위(원정 라벨 쪽)로
    // 움직이도록 부호를 뒤집는다(MID - v → MID + v).
    const yMargin = (v: number) => MID + (v / marginScale) * (MID - PAD);
    const yWp     = (v: number) => MID + ((v - 50) / 50) * (MID - PAD);

    const marginPts = chartPoints.map(p => ({ x: (p.elapsedMin / totalMinutes) * W, y: yMargin(p.margin) }));
    const wpPts     = chartPoints.map(p => ({ x: (p.elapsedMin / totalMinutes) * W, y: yWp(p.wp) }));

    // 데이터 포인트가 "득점이 바뀐 순간"에만 찍히므로, 점끼리 바로 대각선으로 이으면 사실 플랫해야
    // 할 무득점 구간까지 서서히 기울어지는 것처럼 보인다. 각 포인트 직전에 "이전 값 유지 → 지금
    // x에서 수직으로 점프" 지점을 하나씩 끼워 넣어 진짜 계단형(step-before)으로 만든다.
    const toStepPts = (pts: { x: number; y: number }[]) => {
        const out: { x: number; y: number }[] = [];
        pts.forEach((p, i) => {
            if (i > 0) out.push({ x: p.x, y: pts[i - 1].y });
            out.push(p);
        });
        return out;
    };
    const steppedMarginPts = toStepPts(marginPts);
    const steppedWpPts     = toStepPts(wpPts);

    const toLinearPath = (pts: { x: number; y: number }[]) =>
        pts.length === 0 ? '' : `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
    // 라인 아래(기준선까지)를 채운 area — margin/win probability 둘 다 같은 방식으로 만든다.
    const toAreaPath = (pts: { x: number; y: number }[], baseY: number) =>
        pts.length === 0 ? '' : `M ${pts[0].x},${baseY} L ${pts[0].x},${pts[0].y} ${pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ')} L ${pts[pts.length - 1].x},${baseY} Z`;
    const marginPath = toLinearPath(steppedMarginPts);
    const wpPath     = toLinearPath(steppedWpPts);
    const marginArea = toAreaPath(steppedMarginPts, MID);
    const wpArea     = toAreaPath(steppedWpPts, MID);

    // 마우스 x 위치(경과분) → 그 시점까지의 누적 스코어/마진/승률. scoreEvents(득점 순간마다의
    // 스코어)에서 hover 시점 이전 마지막 값을 찾고, 쿼터/시계 표시는 hover 위치 자체로 계산한다
    // (득점 이벤트 타임스탬프가 아니라 마우스가 가리키는 정확한 지점의 시계를 보여줘야 함).
    const hoverInfo = useMemo(() => {
        if (hoverFrac == null) return null;
        const elapsedMin = hoverFrac * totalMinutes;
        const elapsedSec = elapsedMin * 60;
        let cum = scoreEvents[0];
        for (const ev of scoreEvents) {
            if (ev.elapsedSec > elapsedSec) break;
            cum = ev;
        }
        const { quarter, clock } = secondsToClock(elapsedSec, maxQuarter);
        const wp = calculateWinProbability(cum.hScore, cum.aScore, elapsedMin);
        return { quarter, clock, hScore: cum.hScore, aScore: cum.aScore, margin: cum.hScore - cum.aScore, wp, x: hoverFrac * W };
    }, [hoverFrac, scoreEvents, totalMinutes, maxQuarter]);

    const hasPossessionMarkers = homeSegments.length > 0 || awaySegments.length > 0;

    return (
        // [Fix 2026-08-03] ORTG/DRTG 등 팀 통계 헤더 삭제 — 마진/승률 차트(바디)만 남김.
        // 헤더가 없어져 생긴 하단 여백을 없애기 위해 h-full로 부모(라이브 화면의 flex-1 컬럼)가
        // 준 높이를 꽉 채우고, 차트 영역은 고정 aspect-ratio 대신 flex-1로 남는 세로 공간을 전부 차지.
        <div className="w-full h-full flex flex-col">
            {/* 바디 — 범례 + 마진/승률 통합 차트 */}
            <div className="flex-1 min-h-0 flex flex-col gap-2 px-6 py-6 bg-slate-900">
                <div className="flex items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full bg-emerald-400" />마진</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full bg-sky-400" />승리확률</span>
                    {hasPossessionMarkers && (
                        <>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />득점 포제션</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-red-400" />턴오버</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-white" />타임아웃</span>
                        </>
                    )}
                </div>
                {/* 포제션 연속 막대(원정) — isPossessionEnd/possessionOutcome이 없는 구버전 저장
                    데이터는 세그먼트가 빈 배열이라 이 행이 자연스럽게 안 보인다(소급 적용 없음). */}
                {hasPossessionMarkers && <TeamPossessionRow label={awayAbbr} segments={awaySegments} maxQuarter={maxQuarter} tooltipDirection="down" />}
                {/* 포제션 막대의 팀명 칸(GUTTER_W)과 동일한 폭을 여기도 비워둬서, 차트의 시간축
                    시작점이 막대의 시간축 시작점과 픽셀 단위로 맞도록 한다. */}
                <div className="flex-1 min-h-0 flex items-stretch gap-2 w-full">
                    <div className={`${GUTTER_W} shrink-0`} />
                    <div
                        ref={chartRef}
                        className="relative flex-1 h-full cursor-crosshair"
                        onMouseMove={handleChartMouseMove}
                        onMouseLeave={handleChartMouseLeave}
                    >
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
                        {/* 좌/우측 끝 실선 — 경기 시작(0분)/종료 지점을 명확히 표시 */}
                        <line x1="0" y1="0" x2="0" y2={H} stroke="#475569" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                        <line x1={W} y1="0" x2={W} y2={H} stroke="#475569" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                        <line x1="0" y1={MID} x2={W} y2={MID} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                        {Array.from({ length: maxQuarter - 1 }).map((_, i) => (
                            <line key={i} x1={((i + 1) * 12 / totalMinutes) * W} y1="0" x2={((i + 1) * 12 / totalMinutes) * W} y2={H}
                                stroke="#1e293b" strokeWidth="1" strokeDasharray="2 4" />
                        ))}
                        <path d={wpArea} fill="#38bdf8" fillOpacity="0.12" stroke="none" />
                        <path d={marginArea} fill="#34d399" fillOpacity="0.15" stroke="none" />
                        <path d={marginPath} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
                        <path d={wpPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
                        {hoverInfo && (
                            <line x1={hoverInfo.x} y1="0" x2={hoverInfo.x} y2={H} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        )}
                    </svg>
                    <div className="absolute left-1 top-1 text-[10px] font-mono text-slate-600">-{marginScale}</div>
                    <div className="absolute left-1 text-[10px] font-mono text-slate-600" style={{ top: '50%', transform: 'translateY(-50%)' }}>0</div>
                    <div className="absolute left-1 bottom-1 text-[10px] font-mono text-slate-600">+{marginScale}</div>

                    {/* 호버 툴팁 — 마우스 위치까지의 쿼터/시계 + 누적 스코어/마진/승률 */}
                    {hoverInfo && (
                        <div
                            className="absolute top-2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 pointer-events-none shadow-lg whitespace-nowrap z-10"
                            style={{ left: `${Math.min(85, Math.max(15, (hoverInfo.x / W) * 100))}%` }}
                        >
                            <p className="text-[10px] font-bold text-slate-400 mb-1">Q{hoverInfo.quarter} {hoverInfo.clock}</p>
                            <p className="text-xs font-black text-white tabular-nums">
                                {awayAbbr} {hoverInfo.aScore} <span className="text-slate-500">–</span> {homeAbbr} {hoverInfo.hScore}
                            </p>
                            <p className="text-[11px] font-bold text-emerald-400 tabular-nums">
                                {hoverInfo.margin === 0 ? '동점' : `${hoverInfo.margin > 0 ? homeAbbr : awayAbbr} ${hoverInfo.margin > 0 ? '+' : ''}${hoverInfo.margin}`}
                            </p>
                            <p className="text-[11px] font-bold text-sky-400 tabular-nums">
                                승리확률 {awayAbbr} {(100 - hoverInfo.wp).toFixed(1)}%
                            </p>
                        </div>
                    )}
                    </div>
                </div>
                {/* 포제션 연속 막대(홈) */}
                {hasPossessionMarkers && <TeamPossessionRow label={homeAbbr} segments={homeSegments} maxQuarter={maxQuarter} tooltipDirection="up" />}
                <div className="flex items-center gap-2 w-full">
                    <div className={`${GUTTER_W} shrink-0`} />
                    <div className="flex-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider relative h-4">
                        {Array.from({ length: maxQuarter }).map((_, i) => (
                            <span key={i} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) * 12 / totalMinutes) * 100}%` }}>
                                {i < 4 ? `${i + 1}Q` : `OT${i - 3}`}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── GameDateStrip ────────────────────────────────────────────────────────────
// [2026-08-04] 경기 결과 화면 최상단에 ESPN 스코어보드 스트립 스타일로 날짜 셀렉터 +
// 그 날짜의 리그 전체 경기를 가로 스크롤 카드로 보여주고 클릭 시 바로 이동하는 섹션.
// 무거운 game_pbp/PBP 로그를 조회하지 않고 이미 메모리에 있는 schedule(최종 스코어 포함) +
// fetchLiveGamesSummary(라이브 스코어만 가벼운 서버 엔드포인트)만으로 구성.

interface TeamStripInfo { team_name: string; team_abbr: string; color_primary?: string | null; color_text?: string | null }

// [Fix 2026-08-04] 로고/컬러 배지 대신 팀 컬러로 물들인 약어 텍스트만 표시 — 폰트 크기는
// 스코어와 동일한 text-sm으로 맞춤(둘 다 한 줄 안에서 나란히 읽히도록).
const StripTeamRow: React.FC<{ team: TeamStripInfo | undefined; teamId: string; score?: number; won?: boolean }> = ({ team, teamId, score, won }) => (
    <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-black tabular-nums truncate ${won ? 'text-white' : 'text-slate-500'}`}>
            {(team?.team_abbr ?? teamId).slice(0, 3).toUpperCase()}
        </span>
        {score != null && (
            <span className={`text-sm font-mono tabular-nums ${won ? 'text-white font-black' : 'text-slate-500 font-bold'}`}>{score}</span>
        )}
    </div>
);

interface GameDateStripProps {
    leagueId: string | undefined;
    currentGameId: string | undefined;
    schedule: Game[];
    teamMap: Record<string, TeamStripInfo>;
    simStart: string | null;
    gprd: number;
    bracketData: unknown;
    serverNow: number;
    roomId: string | undefined;
    accessToken: string | undefined;
    getGameUrlId: (gameId: string) => string;
}

const GameDateStrip: React.FC<GameDateStripProps> = ({
    leagueId, currentGameId, schedule, teamMap, simStart, gprd, bracketData, serverNow, roomId, accessToken, getGameUrlId,
}) => {
    const navigate = useNavigate();

    // MultiScheduleView.tsx와 동일한 계산(플레이오프 시리즈 미공개 매치업 스포일러 차단 포함) —
    // scheduledAt 보정 + 시간순 정렬.
    // [Fix 2026-08-05] serverNow(1초 틱)를 그대로 deps에 넣으면 매초 스케줄 전체를 재스캔한다 —
    // "리플레이 공개 여부"는 분 단위로만 바뀌므로 15초 버킷으로 낮춰 재계산 빈도를 줄인다.
    const revealBucket = Math.floor(serverNow / 15000);
    const revealedSeriesById = useMemo(() => {
        const series: any[] = (bracketData as any)?.series ?? [];
        if (!series.length) return null;
        return computeRevealedSeries(series, schedule as any, serverNow);
    }, [bracketData, schedule, revealBucket]); // eslint-disable-line react-hooks/exhaustive-deps

    const allGames = useMemo(() =>
        [...schedule]
            .filter(g => {
                if (!g.isPlayoff || !g.seriesId || !revealedSeriesById) return true;
                const gated = revealedSeriesById.get(g.seriesId);
                return !!gated && gated.higherSeedId !== 'TBD' && gated.lowerSeedId !== 'TBD';
            })
            .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
    [schedule, simStart, gprd, revealedSeriesById]);

    const groupedByDay = useMemo(() => groupByDay(allGames), [allGames]);

    const currentGame = useMemo(() => allGames.find(g => g.id === currentGameId), [allGames, currentGameId]);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

    // 처음 진입 시 현재 보고 있는 경기의 날짜로 자동 선택. 초기값이 아직 없을 때만 반영해서
    // 사용자가 화살표로 다른 날짜를 골라놓은 뒤 currentGame이 바뀌어도 선택이 안 튀게 한다.
    useEffect(() => {
        if (selectedDateKey === null && currentGame) {
            setSelectedDateKey(kstDateKey(currentGame));
        }
    }, [selectedDateKey, currentGame]);

    const dateKeys = useMemo(() => groupedByDay.map(g => g.dateKey), [groupedByDay]);
    const activeDateKey = selectedDateKey ?? dateKeys[dateKeys.length - 1] ?? null;
    const activeIdx = activeDateKey ? dateKeys.indexOf(activeDateKey) : -1;
    const activeGroup = activeIdx >= 0 ? groupedByDay[activeIdx] : null;

    // "2026" / "8.3" 2줄 표기용 — activeDateKey(YYYY-MM-DD)에서 직접 뽑음(라벨 문자열 파싱 대신).
    const [activeYear, activeMonth, activeDay] = activeDateKey
        ? activeDateKey.split('-').map(Number)
        : [0, 0, 0];

    // 날짜 드롭다운 — 클릭하면 월간 달력이 펼쳐지고, 경기가 있는 날짜만 선택 가능.
    // [Fix 2026-08-04] 부모 컨테이너 기준 absolute 대신, 클릭한 지점(clientX/clientY)에 고정
    // 위치(position: fixed)로 띄운다 — 어디를 눌러도 그 자리 근처에서 펼쳐진다.
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
    const dateMenuRef = useRef<HTMLDivElement>(null);
    // [Fix 2026-08-04] 경기 카드 리스트가 화면 우측 끝을 넘어가도 스크롤할 방법이 없다는 피드백 —
    // 가로 스크롤 컨테이너에 ref를 달고, 맨 우측에 ">" 버튼으로 scrollBy 이동.
    const gameStripRef = useRef<HTMLDivElement>(null);
    // [Fix 2026-08-05] "라이브/기록 화면 진입 시 상단 경기 리스트가 현재 선택한 경기로 포커스되게"
    // 요청 — 날짜는 이미 자동 선택되지만(위 useEffect), 그 날짜의 경기가 많으면 현재 보고 있는
    // 카드가 가로 스크롤 밖에 있을 수 있어 수동으로 찾아 스크롤해야 했다. 현재 카드에 ref를 달아
    // 자동으로 보이는 위치로 스크롤.
    // [Fix 2026-08-05] "스크롤해도 다시 원래 위치로 돌아간다" 버그 — activeGroup을 의존성으로 쓰면
    // revealedSeriesById(플레이오프 시리즈 미공개 판정)가 serverNow(1초 틱)에 의존해 매초 새
    // 객체로 재계산되고, 그게 allGames→groupedByDay→activeGroup까지 매초 새 참조로 전파되어
    // 이 effect가 1초마다 재실행되며 스크롤을 계속 원위치로 되돌리고 있었다. 실제로 다시 스크롤할
    // 필요가 있는 시점(날짜 전환/경기 전환)만 잡도록 원시값(activeDateKey, currentGameId)만 의존.
    const currentCardRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        currentCardRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [activeDateKey, currentGameId]);
    // [Fix 2026-08-04] "무한스크롤처럼 느껴진다"는 피드백 — 스크롤바를 숨겨놔서 끝에 도달했는지
    // 알 방법이 없었음. 스크롤 위치를 추적해 끝에 도달하면 우측 버튼을 비활성화(회색 처리)해서
    // "여기가 끝"임을 명확히 보여준다. [Fix 2026-08-04] 좌측 이동 버튼 추가 요청으로 canScrollLeft도 함께 추적.
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const updateScrollState = () => {
        const el = gameStripRef.current;
        if (!el) return;
        setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
        setCanScrollLeft(el.scrollLeft > 4);
    };
    useEffect(() => {
        updateScrollState();
        const el = gameStripRef.current;
        if (!el) return;
        const ro = new ResizeObserver(updateScrollState);
        ro.observe(el);
        return () => ro.disconnect();
    }, [activeGroup]);
    // [Fix 2026-08-04] "경기 리스트를 마우스 드래그로 스크롤" 요청 — 트랙패드/스크롤바 없이도
    // 마우스로 클릭+드래그하면 좌우로 스크롤되도록 처리. 드래그가 실제로 발생했을 때만(임계값
    // 3px 초과) 다음 클릭을 캡처 단계에서 막아, 드래그 끝에 카드 위에서 손을 떼도 경기 상세로
    // 잘못 이동하지 않게 한다.
    const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
    const wasDraggedRef = useRef(false);
    const handleStripMouseDown = (e: React.MouseEvent) => {
        const el = gameStripRef.current;
        if (!el) return;
        dragRef.current = { startX: e.pageX, startScrollLeft: el.scrollLeft };
    };
    const handleStripMouseMove = (e: React.MouseEvent) => {
        const drag = dragRef.current;
        const el = gameStripRef.current;
        if (!drag || !el) return;
        const dx = e.pageX - drag.startX;
        if (Math.abs(dx) > 3) {
            wasDraggedRef.current = true;
            el.scrollLeft = drag.startScrollLeft - dx;
        }
    };
    const endStripDrag = () => { dragRef.current = null; };
    const handleStripClickCapture = (e: React.MouseEvent) => {
        if (wasDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            wasDraggedRef.current = false;
        }
    };
    useEffect(() => {
        if (!isDateMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!dateMenuRef.current?.contains(e.target as Node)) setIsDateMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isDateMenuOpen]);

    const gameDateSet = useMemo(() => new Set(dateKeys), [dateKeys]);

    // 달력이 보여주는 연/월(선택된 날짜와 별개 — 화살표로 다른 달을 미리보기만 할 수 있음).
    // 드롭다운을 열 때마다 현재 선택된 날짜의 달로 초기화.
    const [viewYM, setViewYM] = useState<[number, number] | null>(null);
    useEffect(() => {
        if (isDateMenuOpen && activeDateKey) {
            const [y, m] = activeDateKey.split('-').map(Number);
            setViewYM([y, m - 1]);
        }
    }, [isDateMenuOpen, activeDateKey]);

    // 진행 중(LIVE)인 경기의 실시간 스코어 — MultiScheduleView.tsx와 동일한 5초 폴링.
    const [liveSummaries, setLiveSummaries] = useState<Record<string, LiveGameSummary>>({});
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;
        const poll = async () => {
            const summaries = await fetchLiveGamesSummary(roomId, accessToken);
            if (cancelled) return;
            setLiveSummaries(Object.fromEntries(summaries.map(s => [s.gameId, s])));
        };
        poll();
        const timer = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [roomId, accessToken]);

    if (!activeGroup) return null;

    return (
        <div className="shrink-0 flex items-stretch bg-slate-950 border-b border-slate-800 h-[76px]">
            {/* 날짜 셀렉터 — 화살표 이동 + 클릭 시 전체 날짜 드롭다운.
                [Fix 2026-08-04] "> 버튼과 날짜 영역은 인디고 색을 적용해봐" 요청으로 배경을
                indigo-600으로 채운 하나의 칩(chip)처럼 표현. */}
            <div ref={dateMenuRef} className="relative shrink-0 flex items-center gap-0.5 px-1.5 bg-indigo-600 border-r border-indigo-700">
                <button
                    onClick={() => activeIdx > 0 && setSelectedDateKey(dateKeys[activeIdx - 1])}
                    disabled={activeIdx <= 0}
                    className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={(e) => {
                        // [Fix 2026-08-04] 클릭 좌표(clientX/Y) 대신 날짜 버튼 자신의 위치를 써서
                        // "어딜 눌러도 날짜선택영역 바로 좌측 하단"에 여백 없이 붙도록 고정.
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({ x: rect.left, y: rect.bottom });
                        setIsDateMenuOpen(o => !o);
                    }}
                    className={`flex flex-col items-center justify-center px-3 py-2 rounded transition-colors ${isDateMenuOpen ? 'bg-indigo-500' : 'hover:bg-indigo-500'}`}
                >
                    <span className="text-sm font-black text-white leading-tight tabular-nums whitespace-nowrap">{activeYear}</span>
                    <span className="text-sm font-black text-white leading-tight tabular-nums whitespace-nowrap">
                        {activeMonth}.{activeDay}
                    </span>
                </button>
                <button
                    onClick={() => activeIdx >= 0 && activeIdx < dateKeys.length - 1 && setSelectedDateKey(dateKeys[activeIdx + 1])}
                    disabled={activeIdx < 0 || activeIdx >= dateKeys.length - 1}
                    className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronRight size={16} />
                </button>

                {/* 월간 달력 — 경기가 있는 날짜만 선택 가능(없는 날짜는 비활성) */}
                {isDateMenuOpen && viewYM && menuPos && (() => {
                    const [vy, vm] = viewYM; // vm: 0-indexed
                    const firstWeekday = new Date(vy, vm, 1).getDay();
                    const daysInMonth = new Date(vy, vm + 1, 0).getDate();
                    const cells: (number | null)[] = [
                        ...Array.from({ length: firstWeekday }, () => null),
                        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                    ];
                    while (cells.length % 7 !== 0) cells.push(null);

                    return (
                        <div
                            className="fixed z-30 w-72 bg-slate-900 border border-slate-700 shadow-2xl p-3"
                            style={{ left: menuPos.x, top: menuPos.y }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <button
                                    onClick={() => setViewYM(vm === 0 ? [vy - 1, 11] : [vy, vm - 1])}
                                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-sm font-bold text-white tabular-nums">{vy}년 {vm + 1}월</span>
                                <button
                                    onClick={() => setViewYM(vm === 11 ? [vy + 1, 0] : [vy, vm + 1])}
                                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                                    <div key={d} className="text-xs font-bold text-slate-500 text-center">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((day, i) => {
                                    if (day === null) return <div key={i} />;
                                    const dk = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const hasGame = gameDateSet.has(dk);
                                    const isActive = dk === activeDateKey;
                                    return (
                                        <button
                                            key={i}
                                            disabled={!hasGame}
                                            onClick={() => { setSelectedDateKey(dk); setIsDateMenuOpen(false); }}
                                            className={`h-8 rounded text-xs font-bold tabular-nums transition-colors ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white ring-1 ring-inset ring-indigo-400'
                                                    : hasGame
                                                        ? 'text-white hover:bg-slate-800 cursor-pointer'
                                                        : 'text-slate-700 cursor-not-allowed'
                                            }`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* 좌측 이동 버튼 — 우측 버튼과 동일한 패턴(끝 도달 시 비활성화, 인디고 색상) */}
            <button
                onClick={() => gameStripRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                disabled={!canScrollLeft}
                className="shrink-0 w-8 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:cursor-default transition-colors"
            >
                <ChevronLeft size={18} />
            </button>

            {/* 그 날짜의 경기 카드 — 가로 스크롤 */}
            <div
                ref={gameStripRef}
                onScroll={updateScrollState}
                onMouseDown={handleStripMouseDown}
                onMouseMove={handleStripMouseMove}
                onMouseUp={endStripDrag}
                onMouseLeave={endStripDrag}
                onClickCapture={handleStripClickCapture}
                className="flex-1 min-w-0 overflow-x-auto flex select-none cursor-grab active:cursor-grabbing"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
                {activeGroup.games.map(g => {
                    const state = getGameDisplayState(g, serverNow);
                    const live = liveSummaries[g.id];
                    const isCurrent = g.id === currentGameId;
                    const homeWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                    const awayWon = state === 'final' && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
                    const statusLabel = state === 'final' ? '종료'
                        : state === 'live' ? (live ? `${live.quarter ?? 1}Q ${live.clock ?? ''}` : 'LIVE')
                        : '예정';

                    return (
                        <button
                            key={g.id}
                            ref={isCurrent ? currentCardRef : undefined}
                            onClick={() => !isCurrent && navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(g.id)}`)}
                            className={`shrink-0 w-36 px-3 py-2 flex flex-col justify-center gap-1 border-r border-slate-800 transition-colors text-left cursor-pointer ${
                                isCurrent ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/50' : 'hover:bg-slate-900'
                            }`}
                        >
                            <span className={`text-xs font-bold uppercase tracking-wider ${state === 'live' ? 'text-red-400' : 'text-slate-500'}`}>
                                {statusLabel}
                            </span>
                            <StripTeamRow
                                team={teamMap[g.awayTeamId]}
                                teamId={g.awayTeamId}
                                score={state === 'final' ? g.awayScore : state === 'live' ? live?.awayScore : undefined}
                                won={awayWon}
                            />
                            <StripTeamRow
                                team={teamMap[g.homeTeamId]}
                                teamId={g.homeTeamId}
                                score={state === 'final' ? g.homeScore : state === 'live' ? live?.homeScore : undefined}
                                won={homeWon}
                            />
                        </button>
                    );
                })}
            </div>

            {/* 리스트가 화면 우측 끝을 넘어가도 스크롤할 방법이 없다는 피드백 — 맨 우측에
                고정 화살표 버튼 추가, 클릭 시 스트립을 오른쪽으로 스크롤. */}
            <button
                onClick={() => gameStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                disabled={!canScrollRight}
                className="shrink-0 w-8 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:cursor-default transition-colors"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const MultiGamePbpView: React.FC = () => {
    const { leagueId, gameId } = useParams<{ leagueId: string; gameId: string }>();
    const { room, leagueTeams, league } = useLeagueContext();
    const { schedule }         = useSeasonContext();
    const { session }           = useGame();
    const { getGameUrlId }      = useGameShortCodes(room?.id);
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');

    // 날짜 셀렉터 스트립(GameDateStrip)용 — team_slug → 팀 표시정보 맵
    const stripTeamMap = useMemo(() => {
        const m: Record<string, { team_name: string; team_abbr: string; color_primary?: string | null; color_text?: string | null }> = {};
        for (const t of leagueTeams) m[t.team_slug] = t;
        return m;
    }, [leagueTeams]);

    // [2026-08-01] URL의 gameId는 짧은 코드(신규 리그) 또는 원래 game_id(T_R1_M0_G1 등, 구
    // 리그/매핑 없음)일 수 있음 — game_short_codes에서 역조회, 매핑이 없으면 그대로 폴백.
    // 저장 키(game_pbp.game_id 등)는 항상 이 resolvedGameId(=진짜 game_id)로만 사용한다.
    const [resolvedGameId, setResolvedGameId] = useState<string | undefined>(gameId);
    useEffect(() => {
        setResolvedGameId(gameId);
        if (!room?.id || !gameId) return;
        let cancelled = false;
        supabase
            .from('game_short_codes')
            .select('game_id')
            .eq('room_id', room.id)
            .eq('short_code', gameId)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled && data?.game_id) setResolvedGameId(data.game_id);
            });
        return () => { cancelled = true; };
    }, [room?.id, gameId]);

    const [gameData,      setGameData]      = useState<GamePbpRow | null>(null);
    const [isLoading,     setIsLoading]     = useState(true);
    const [error,         setError]         = useState<string | null>(null);
    // undefined: 미조회, null: 레거시(scheduledAt 없음), string: 정시
    const [scheduledAt,   setScheduledAt]   = useState<string | null | undefined>(undefined);
    const [gamePlayed,    setGamePlayed]    = useState(false);
    const [quarterFilter, setQuarterFilter] = useState<0|1|2|3|4|5>(0);
    // [2026-08-03] 6개 탭(박스스코어/샷차트/경기기록/로테이션/인사이트/온오프)을 스위칭하는 대신
    // 한 페이지에 세로로 이어붙임 — finalTab 전환 상태 대신 "현재 스크롤 위치가 어느 섹션인지"만
    // 추적(스크롤스파이)해서 상단 네비게이션 바의 활성 라벨 하이라이트에 쓴다.
    const [activeSection, setActiveSection] = useState<string>('insights');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const resultScrollRef = useRef<HTMLDivElement>(null);
    // live 폴링 델타 커서 — 서버가 이미 보낸 만큼(count)을 기억해뒀다가 다음 폴링에 같이 보내면
    // 그 이후 새로 공개된 이벤트만 받아 gameData에 append한다(매번 전체 재전송 방지).
    const eventCountRef = useRef(0);
    const shotCountRef  = useRef(0);
    const boxCountRef   = useRef(0);

    // [Fix 2026-08-05] "진행중인 경기를 보다가 시작 전 경기로 넘어가면 이전 경기 데이터가 그대로
    // 남아있다" 버그 — 이 뷰는 라우트가 바뀌어도(:gameId만 바뀜) 컴포넌트가 리마운트되지 않으므로
    // gameData state가 그대로 유지된다. scheduled로 넘어가면 경기 상세 조회 effect가 fetch 없이
    // 그냥 return해서(scheduled는 game_pbp를 조회하지 않음) gameData를 비울 기회가 아예 없었다 —
    // 그 결과 샷차트/PBP/인사이트그래프 등 gameData 파생 값이 전부 직전 경기 데이터를 계속 참조.
    // resolvedGameId가 바뀌는 즉시(=다른 경기로 이동) gameData/error를 명시적으로 비운다.
    // [Fix 2026-08-05] "예정 경기 → 종료 경기 이동 시 라이브 화면이 잠깐 스쳐간다" 버그 —
    // scheduledAt/gamePlayed를 여기서 같이 리셋하지 않아서, 이전(예정) 경기의 미래 scheduledAt이
    // 그대로 남아있었다. 그 값이 우연히 "지금 막 지났거나 곧 지날 시점"이면 getGameDisplayState가
    // 이를 live 구간(start~start+REPLAY_DURATION_MS)으로 오판해 라이브 화면이 잠깐 렌더되고,
    // 뒤이어 새 경기의 진짜 scheduledAt/gamePlayed가 비동기로 갱신되며 화면이 다시 바뀌었다.
    // undefined로 되돌리면 getGameDisplayState가 "미확정"으로 처리해 fetch effect도 스킵되므로
    // (scheduledAt===undefined 가드) 새 값이 확정되기 전까지 헛다리 짚는 fetch 자체가 안 일어난다.
    // [Fix 2026-08-05] "그래도 '경기 데이터를 준비하는 중입니다' 문구가 잠깐 스쳐간다" 버그 —
    // isLoading이 리셋 안 돼 있으면(직전 화면이 scheduled라 이미 false로 내려가 있었음), 새
    // scheduledAt/gamePlayed가 확정되는 순간 로딩 게이트(`isLoading || scheduledAt===undefined`)가
    // gameData fetch가 시작되기도 전에 먼저 풀려버려서, 그 사이 한 렌더 동안 "gameData 없음" 상태가
    // 에러 폴백 문구로 노출됐다. isLoading을 같이 true로 리셋해 fetch effect가 다시 false로
    // 내릴 때까지 로딩 게이트가 계속 닫혀있게 한다.
    useEffect(() => {
        setGameData(null);
        setError(null);
        setScheduledAt(undefined);
        setGamePlayed(false);
        setIsLoading(true);
        eventCountRef.current = 0;
        shotCountRef.current  = 0;
        boxCountRef.current   = 0;
    }, [resolvedGameId]);
    const [rosterCache, setRosterCache] = useState<Record<string, Player>>({});
    // [Fix 2026-08-05] "경기 전환 시 OVR이 70으로 잠깐 보였다가 정정된다" 버그 — rosterCache는
    // 위 gameData와 달리 리셋되지 않아서, 새 경기의 선수 ID를 아직 못 채운 이전 경기의 캐시가
    // 그대로 남아있었다. resolvedGameId가 바뀌면 즉시 비워서 "구버전 데이터"가 아니라
    // "로딩 중"으로 정확히 인식되게 한다(PlayerIdentityCells가 스텁 감지 시 스켈레톤 렌더).
    useEffect(() => {
        setRosterCache({});
    }, [resolvedGameId]);
    const serverNow = useServerClock();
    // "리플레이 공개 완료 여부"(전적 집계 등)는 초 단위 정확도가 필요 없어 15초 버킷으로 낮춰
    // 관련 useMemo들의 매초 재계산을 방지 — GameDateStrip 내부에도 동일 목적의 버킷이 별도로 있음.
    const revealBucket = Math.floor(serverNow / 15000);

    // scheduled/live/final 표시 상태. scheduledAt + serverNow만으로 결정되므로
    // 누가 언제 접속해도 동일한 시점에 동일한 상태가 나온다.
    const displayState = getGameDisplayState({ scheduledAt: scheduledAt ?? undefined, played: gamePlayed }, serverNow);

    // [migration 2026-08-06] rooms.schedule 배열 fetch 대신 games 테이블 단일 row 조회.
    // game_pbp는 RLS로 정시 전 row가 숨겨지므로 scheduled 상태 판정에는 이 정보가 필요하다.
    // 토너먼트 경기는 scheduledAt이 저장되지 않고 game_seq만 있으므로 resolveRealAt으로
    // 반드시 역산해야 한다 — 그냥 game.scheduledAt만 읽으면 항상 undefined가 되어
    // displayState가 영원히 'scheduled'로 고정되고, 이어지는 PBP 조회 effect가
    // 매번 스킵되어 isLoading이 false로 내려가지 않는(무한 로딩) 버그가 생긴다.
    useEffect(() => {
        if (!room?.id || !resolvedGameId) return;
        let cancelled = false;
        (async () => {
            const game = await loadGame(room.id, resolvedGameId);
            if (cancelled) return;
            // [Fix 2026-08-04] "종료된 경기인데도 시작 전 화면이 스쳐간다" 버그의 진짜 원인 —
            // resolvedGameId는 마운트 시 일단 URL의 gameId(짧은 코드일 수 있음)로 먼저 세팅되고,
            // 실제 game_id로의 변환은 별도 effect가 비동기로 처리한다(game_short_codes 조회).
            // 그 변환이 끝나기 전 이 effect가 먼저 돌면 resolvedGameId가 아직 짧은 코드라
            // games에서 못 찾는 게 정상인데, 예전엔 이걸 "찾아봤는데 없다"로 확정 처리해
            // scheduledAt=null/gamePlayed=false를 세팅했음 — 그 결과 displayState가 일시적으로
            // 'scheduled'로 오판되어 화면이 스쳐갔다. 못 찾으면 아무 것도 확정하지 않고
            // resolvedGameId가 실제 game_id로 갱신되면서 이 effect가 재실행되길 기다린다.
            if (!game) return;
            setGamePlayed(!!game.played);
            setScheduledAt(resolveRealAt(game, simStart, gprd) ?? game.scheduledAt ?? null);
        })();
        return () => { cancelled = true; };
    }, [room?.id, resolvedGameId, simStart, gprd]);

    // 경기 상세 조회 — Bun 서버 /live-game 경유. displayState==='scheduled'이면 서버도
    // '시작 전'으로 응답하므로 시도하지 않는다. game_pbp 테이블은 이제 RLS가 종료(+10분) 후에만
    // 직접 조회를 허용하므로, live 구간에는 반드시 이 엔드포인트가 elapsed까지 잘라 내려주는
    // 값을 써야 한다 — 그래서 final로 넘어가기 전까지는 주기적으로 재조회해 새로 공개된
    // 이벤트를 받아온다(예전처럼 최초 1회만 받아 클라이언트가 갖고 있던 미래 이벤트를
    // 스스로 감추는 방식은 더 이상 불가능/불필요).
    useEffect(() => {
        if (!room?.id || !resolvedGameId) return;
        // [Fix 2026-08-04] "종료된 경기에 들어가면 시작 전 화면이 한번 나타났다가 결과 화면으로
        // 이동" 버그 — scheduledAt이 아직 undefined(별도 effect에서 rooms.schedule을 비동기로
        // 조회 중)인 첫 렌더에서는 displayState가 "실제로 시작 전"이라서가 아니라 getGameDisplayState의
        // 폴백(scheduledAt 없음 → played 기준)으로 임시로 'scheduled'가 찍힌다. 이때 아래 분기가
        // 이걸 "진짜 scheduled"로 오인해 isLoading을 성급하게 false로 내리면, 직후 scheduledAt이
        // 실제 값으로 확정돼 displayState가 'final'/'live'로 바뀌기 전까지 한 렌더 동안 잘못된
        // 화면(카운트다운 또는 "데이터 준비 중" 메시지)이 노출된다. scheduledAt이 아직 확정되지
        // 않았으면(=신뢰 불가) 이 effect 자체를 완전히 건너뛰어 isLoading을 true로 유지시킨다.
        if (scheduledAt === undefined) return;
        // [Fix 2026-08-04] "시작 전 경기 보기 버튼을 누르면 무한 로딩" 버그 — scheduled일 때 이
        // effect가 아무것도 안 하고 return해서 isLoading(초기값 true)이 영원히 false로 안 내려갔음.
        // scheduled 화면(카운트다운)은 gameData가 필요 없으므로 여기서 명시적으로 로딩을 끝낸다.
        if (displayState === 'scheduled') { setIsLoading(false); return; }
        let cancelled = false;

        // isFirst=false(interval 폴링)면 지금까지 받은 개수(커서)를 같이 보내 그 이후 새로
        // 공개된 구간만 받는다 — 매번 지금까지 전체를 재전송하던 것을 delta로 줄인 것.
        // 언더라잉 데이터(row.events 등)는 시뮬레이션이 이미 끝난 뒤 한 번에 저장된 고정
        // 배열이고 elapsed 임계값만 시간이 갈수록 커지므로, 이전 poll 결과는 항상 다음 poll
        // 결과의 접두사(prefix)다 — append만으로 안전하게 재구성 가능.
        const load = async (isFirst: boolean) => {
            const result = await fetchLiveGameView(
                room.id, resolvedGameId, session?.access_token,
                isFirst ? undefined : { events: eventCountRef.current, shots: shotCountRef.current, box: boxCountRef.current },
            );
            if (cancelled) return;
            if (!('state' in result)) {
                setError('경기 데이터를 준비하는 중입니다. 잠시 후 다시 시도해주세요.');
                setIsLoading(false);
                return;
            }
            eventCountRef.current = result.eventCount;
            shotCountRef.current  = result.shotCount;
            boxCountRef.current   = result.boxCount;

            setGameData(prev => {
                if (isFirst || !prev) {
                    return {
                        game_id:         result.gameId,
                        home_team_id:    result.homeTeamId,
                        away_team_id:    result.awayTeamId,
                        home_score:      result.homeScore ?? 0,
                        away_score:      result.awayScore ?? 0,
                        game_start_time: result.gameStartTime,
                        events:          result.events,
                        shot_events:     result.shotEvents,
                        home_box:        result.homeBox as PlayerBoxScore[],
                        away_box:        result.awayBox as PlayerBoxScore[],
                        box_timeline:    result.boxTimeline,
                        rotation_data:   result.rotationData,
                    };
                }
                return {
                    ...prev,
                    home_score:    result.homeScore ?? prev.home_score,
                    away_score:    result.awayScore ?? prev.away_score,
                    events:        [...prev.events, ...result.events],
                    shot_events:   [...prev.shot_events, ...result.shotEvents],
                    box_timeline:  [...(prev.box_timeline ?? []), ...result.boxTimeline],
                    home_box:      result.homeBox as PlayerBoxScore[],
                    away_box:      result.awayBox as PlayerBoxScore[],
                    rotation_data: result.rotationData ?? prev.rotation_data,
                };
            });
            setError(null);
            setIsLoading(false);
        };

        setIsLoading(true);
        load(true);
        const timer = displayState === 'live' ? setInterval(() => load(false), LIVE_POLL_MS) : null;
        return () => { cancelled = true; if (timer) clearInterval(timer); };
    }, [room?.id, resolvedGameId, displayState, session?.access_token, scheduledAt]);

    // ── final 전용: 박스스코어 탭(OVR/포지션 표시)에 쓸 실제 선수 능력치 조회 ──────
    // PlayerBoxScore엔 이름/포지션/스탯만 있고 OVR이 없어서, BoxScoreTable이 team.roster에서
    // 능력치를 찾아 OVR을 계산한다(calculatePlayerOvr) — 그래서 실제 Player를 채워야 한다.
    useEffect(() => {
        if (displayState !== 'final' || !gameData) return;
        const ids = [...(gameData?.home_box ?? []), ...(gameData?.away_box ?? [])].map(b => b.playerId);
        if (ids.length === 0) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase.from('meta_players').select('id, name, position, base_attributes, tendencies').in('id', ids);
            if (cancelled || !data) return;
            const map: Record<string, Player> = {};
            for (const raw of data) {
                map[String(raw.id)] = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides);
            }
            setRosterCache(map);
        })();
        return () => { cancelled = true; };
    }, [displayState, gameData?.home_box, gameData?.away_box, useCustomOverrides]);

    // ── 시간 기반 필터 ──────────────────────────────────────────────────────────

    // live가 아니면(final/레거시) 항상 전체를 표시 — reveal 상태가 단일 진실 소스이므로
    // game_start_time 기반 elapsed와 displayState 간 엣지케이스 불일치를 방지한다.
    const visibleEvents = useMemo<PbpLog[]>(() => {
        if (!gameData) return [];
        const all = gameData?.events as PbpLog[];
        if (displayState !== 'live') return all;
        const startMs = new Date(gameData.game_start_time).getTime();
        const elapsed = serverNow - startMs;
        return all.filter(e => {
            const replayMs = (toGameSeconds(e) / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
            return replayMs <= elapsed;
        });
    }, [gameData, serverNow, displayState]);

    const visibleShotEvents = useMemo<ShotEvent[]>(() => {
        if (!gameData) return [];
        const all = (gameData?.shot_events ?? []) as ShotEvent[];
        if (displayState !== 'live') return all;
        const startMs = new Date(gameData.game_start_time).getTime();
        const elapsed = serverNow - startMs;
        return all.filter(s => {
            const secs    = (s.quarter - 1) * 720 + (720 - ((s as any).gameClock ?? 0));
            const replayMs = (secs / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
            return replayMs <= elapsed;
        });
    }, [gameData, serverNow, displayState]);

    // [Fix 2026-08-05] "최신 로그 행 배경 페이드" 인터랙션을 위해 각 로그에 visibleEvents 기준
    // 안정적인 원래 인덱스(idx)를 같이 들고 다닌다 — 새 로그가 계속 앞쪽(reverse 후 index 0)에
    // 추가되므로 배열 포지션(map의 i)만으로 key를 주면 매번 다른 로그가 같은 DOM 노드를 재사용해
    // key가 바뀌지 않고, 그러면 새로 추가된 애니메이션 클래스도 재마운트가 안 돼서 CSS 애니메이션이
    // 다시 재생되지 않는다. idx는 visibleEvents에 계속 append만 되므로 로그 하나당 항상 고유하고
    // 불변이라 안정적인 key로 쓸 수 있다.
    const filteredLogs = useMemo<{ log: PbpLog; idx: number }[]>(() => {
        const indexed = visibleEvents.map((log, idx) => ({ log, idx }));
        const base = quarterFilter === 0
            ? indexed
            : indexed.filter(e => e.log.quarter === quarterFilter);
        return base.filter(e => e.log.text.trim() !== '').slice().reverse();
    }, [visibleEvents, quarterFilter]);

    // ── 팀 정보 ────────────────────────────────────────────────────────────────
    // [Fix 2026-08-04] "시작 전 경기도 실제 시뮬레이션 뷰(헤더 포함)로 들어가서 점보트론에
    // 카운트다운을 보고 싶다" 요청 — 이전엔 gameData가 있어야만(=live/final) 팀 정보가 채워졌는데,
    // scheduled 상태는 game_pbp를 아예 조회하지 않아 gameData가 계속 null. schedule(이미 로드된
    // 시즌 일정)에서 homeTeamId/awayTeamId를 폴백으로 가져와 gameData 없이도 헤더가 정상 표시되게 함.

    const scheduleGame = useMemo(() => schedule.find(g => g.id === resolvedGameId), [schedule, resolvedGameId]);
    const homeTeamId = gameData?.home_team_id ?? scheduleGame?.homeTeamId;
    const awayTeamId = gameData?.away_team_id ?? scheduleGame?.awayTeamId;

    const homeTeam = useMemo(() => leagueTeams.find(t => t.team_slug === homeTeamId), [leagueTeams, homeTeamId]);
    const awayTeam = useMemo(() => leagueTeams.find(t => t.team_slug === awayTeamId), [leagueTeams, awayTeamId]);

    const homeColor = homeTeam?.color_primary ?? '#4f46e5';
    const homeText  = homeTeam?.color_text    ?? getReadableTextColor(homeColor);
    const awayColor = awayTeam?.color_primary ?? '#0f172a';
    const awayText  = awayTeam?.color_text    ?? getReadableTextColor(awayColor);
    const homeAbbr  = homeTeam?.team_abbr ?? (homeTeamId?.toUpperCase().slice(0, 3) ?? 'HOM');
    const awayAbbr  = awayTeam?.team_abbr ?? (awayTeamId?.toUpperCase().slice(0, 3) ?? 'AWY');
    const homeName  = homeTeam?.team_name ?? homeTeamId ?? '';
    const awayName  = awayTeam?.team_name ?? awayTeamId ?? '';
    // [Fix 2026-08-05] "경기 전환 시 헤더에 HOM/AWY 같은 하드코딩 폴백이 잠깐 보인다" 버그 —
    // homeTeamId/awayTeamId가 아직 없으면(짧은 코드→실제 game_id 변환 중, 또는 schedule에서
    // 아직 못 찾음) homeAbbr/awayAbbr가 마지막 방어선인 'HOM'/'AWY' 리터럴로 떨어진다.
    // 헤더 렌더 지점에서 이 값 대신 스켈레톤을 보여줄지 판단하는 플래그.
    const homeInfoLoading = !homeTeamId;
    const awayInfoLoading = !awayTeamId;

    // 헤더 팀명 아래 표시할 시즌 전적(W-L) — schedule 기반, final 처리된(리플레이 공개 완료) 경기만 집계.
    // [Fix 2026-08-05] revealedSeriesById와 동일한 이유로 serverNow 대신 15초 버킷 사용 —
    // 전적은 경기 하나가 리플레이 종료될 때만 바뀌므로 초 단위 정확도가 필요 없다.
    const wl = useMemo(() => {
        const slugs = [homeTeamId, awayTeamId].filter((s): s is string => !!s);
        return computeWL(schedule, slugs, serverNow);
    }, [schedule, homeTeamId, awayTeamId, revealBucket]); // eslint-disable-line react-hooks/exhaustive-deps
    const homeWL = homeTeamId ? wl[homeTeamId] : undefined;
    const awayWL = awayTeamId ? wl[awayTeamId] : undefined;

    // [Fix 2026-08-05] "박스스코어도 중계 종료 후 공개된다는 안내 대신 원래 박스스코어 그대로
    // (스탯 0)" 요청 — scheduled 상태엔 game_pbp가 없어 실제 스탯이 없지만, 팀 로스터
    // (league_teams.roster, 이미 확정된 선수 ID 배열)는 항상 있으므로 그 선수 명단으로 스탯
    // 전부 0인 PlayerBoxScore를 만들어 BoxScorePlaceholder 대신 실제 박스스코어 표처럼 보여준다.
    const [scheduledRosterCache, setScheduledRosterCache] = useState<Record<string, { name: string; position: string }>>({});
    // [Fix 2026-08-05] "경기 전환 시 선수 이름이 UUID로 잠깐 보인다" 버그 — 아래 buildZeroStatBox가
    // 이름을 못 구하면 UUID를 그대로 쓰던 게 원인. 캐시 자체도 리셋되지 않아 이전 경기의(다른 선수
    // ID 기준) 캐시가 새 경기에서도 안 맞게 남아있었다. resolvedGameId가 바뀌면 즉시 비운다.
    useEffect(() => {
        setScheduledRosterCache({});
    }, [resolvedGameId]);
    useEffect(() => {
        if (displayState !== 'scheduled') return;
        const ids = [...(homeTeam?.roster ?? []), ...(awayTeam?.roster ?? [])];
        if (ids.length === 0) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase.from('meta_players').select('id, name, position').in('id', ids);
            if (cancelled || !data) return;
            const map: Record<string, { name: string; position: string }> = {};
            for (const raw of data) map[String(raw.id)] = { name: raw.name as string, position: raw.position as string };
            setScheduledRosterCache(map);
        })();
        return () => { cancelled = true; };
    }, [displayState, homeTeam?.roster, awayTeam?.roster]);

    const buildZeroStatBox = (roster: string[] | undefined): PlayerBoxScore[] =>
        (roster ?? []).map(id => ({
            playerId: id,
            // [Fix 2026-08-05] 캐시 미도착 시 UUID를 그대로 이름으로 쓰지 않음 — 빈 문자열을
            // 반환해 PlayerBoxPanel이 스켈레톤 바를 렌더링하도록 신호를 준다.
            playerName: scheduledRosterCache[id]?.name ?? '',
            position: scheduledRosterCache[id]?.position ?? '',
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            mp: 0, g: 0, gs: 0, pf: 0, techFouls: 0, flagrantFouls: 0, plusMinus: 0,
            contestedAttempted: 0, contestedMade: 0,
            defRimAttempted: 0, defRimMade: 0, defMidAttempted: 0, defMidMade: 0,
            defThreeAttempted: 0, defThreeMade: 0,
            defRAAttempted: 0, defRAMade: 0, defITPAttempted: 0, defITPMade: 0,
            defMIDAttempted: 0, defMIDMade: 0, defCNRAttempted: 0, defCNRMade: 0,
            defWINGAttempted: 0, defWINGMade: 0, defATBAttempted: 0, defATBMade: 0,
            condition: 100,
        }));
    const scheduledHomeBox = useMemo(() => buildZeroStatBox(homeTeam?.roster), [homeTeam?.roster, scheduledRosterCache]);
    const scheduledAwayBox = useMemo(() => buildZeroStatBox(awayTeam?.roster), [awayTeam?.roster, scheduledRosterCache]);

    // ── 파생 상태 ──────────────────────────────────────────────────────────────

    const homeStats = useMemo(
        () => computeTeamStats(visibleEvents, visibleShotEvents, gameData?.home_team_id ?? ''),
        [visibleEvents, visibleShotEvents, gameData?.home_team_id],
    );
    const awayStats = useMemo(
        () => computeTeamStats(visibleEvents, visibleShotEvents, gameData?.away_team_id ?? ''),
        [visibleEvents, visibleShotEvents, gameData?.away_team_id],
    );
    // 인사이트 탭(ORTG/DRTG 포제션 추정)용 — 박스스코어 집계에서 팀 합산 공격 리바운드만 필요
    const homeOreb = useMemo(() => (gameData?.home_box ?? []).reduce((s, p) => s + (p.offReb || 0), 0), [gameData?.home_box]);
    const awayOreb = useMemo(() => (gameData?.away_box ?? []).reduce((s, p) => s + (p.offReb || 0), 0), [gameData?.away_box]);

    // ── 박스스코어 점진 공개 (live 구간) ────────────────────────────────────────
    const hasBoxTimeline = (gameData?.box_timeline?.length ?? 0) > 0;

    const liveHomeBox = useMemo<PlayerBoxScore[]>(() => {
        if (!gameData || displayState !== 'live' || !hasBoxTimeline) return [];
        const startMs = new Date(gameData.game_start_time).getTime();
        return buildLiveBox(gameData?.box_timeline ?? [], serverNow - startMs, gameData?.home_box ?? []);
    }, [gameData, serverNow, displayState, hasBoxTimeline]);

    const liveAwayBox = useMemo<PlayerBoxScore[]>(() => {
        if (!gameData || displayState !== 'live' || !hasBoxTimeline) return [];
        const startMs = new Date(gameData.game_start_time).getTime();
        return buildLiveBox(gameData?.box_timeline ?? [], serverNow - startMs, gameData?.away_box ?? []);
    }, [gameData, serverNow, displayState, hasBoxTimeline]);

    // [2026-08-03] 라이브 화면에서도 인사이트 패널(GameInsightsPanel)을 실시간으로 보여주기 위한
    // 스포일러 세이프 값들 — homeOreb/awayOreb/maxQuarter는 항상 gameData 전체(최종 데이터)
    // 기준이라 그대로 넘기면 스포일러가 됨. liveHomeBox/liveAwayBox(box_timeline을 elapsed까지만
    // 누적)와 maxSelectableQ(지금까지 공개된 로그 기준 최대 쿼터) 기반으로 새로 계산.
    const liveHomeOreb = useMemo(() => liveHomeBox.reduce((s, p) => s + (p.offReb || 0), 0), [liveHomeBox]);
    const liveAwayOreb = useMemo(() => liveAwayBox.reduce((s, p) => s + (p.offReb || 0), 0), [liveAwayBox]);

    // ── 전광판(Jumbotron) 이벤트 감지 ───────────────────────────────────────
    // liveHomeBox/liveAwayBox는 serverNow가 틱할 때마다 재계산되므로, 직전 스냅샷과 비교해
    // "마일스톤을 새로 넘은" 선수만 찾아 큐에 쌓는다(모든 스탯 증가가 아니라 crossedMilestone 통과분만).
    const [jumbotronQueue, setJumbotronQueue] = useState<JumbotronEvent[]>([]);
    const [activeJumbotron, setActiveJumbotron] = useState<JumbotronEvent | null>(null);
    const jumbotronPrevRef = useRef<Record<string, Record<JumbotronStat, number>>>({});

    useEffect(() => {
        if (liveHomeBox.length === 0 && liveAwayBox.length === 0) return;
        const homeIds = new Set(liveHomeBox.map(p => p.playerId));
        const all = [...liveHomeBox, ...liveAwayBox];
        const prev = jumbotronPrevRef.current;
        const newEvents: JumbotronEvent[] = [];

        for (const p of all) {
            const snap: Record<JumbotronStat, number> = { pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf ?? 0 };
            const old = prev[p.playerId];
            if (old) {
                for (const stat of JUMBOTRON_STATS) {
                    const milestone = crossedMilestone(stat, old[stat], snap[stat]);
                    if (milestone != null) {
                        newEvents.push({ kind: 'stat', key: `${p.playerId}-${stat}-${milestone}`, player: p, stat, value: milestone, isHome: homeIds.has(p.playerId) });
                    }
                }
                const combo = crossedCombo(old, snap);
                if (combo != null) {
                    newEvents.push({ kind: 'combo', key: `${p.playerId}-combo-${combo}`, player: p, combo, isHome: homeIds.has(p.playerId) });
                }
            }
            prev[p.playerId] = snap;
        }

        // [Fix 2026-08-03] 큐를 무제한으로 쌓지 않고 최근 N개만 유지 — 이벤트가 표시시간(2.2초)보다
        // 자주 발생하면(득점만 해도 평균 ~3초 간격) 큐가 계속 밀려 PBP 로그보다 점점 뒤처져 보이는
        // 문제가 있었음. 아래 "큐 전진" 이펙트가 항상 큐의 마지막(최신) 항목만 꺼내 쓰므로, 여기서는
        // 한 렌더 틱에 몰릴 수 있는 이벤트에 대한 안전장치로만 살짝 캡을 둔다.
        if (newEvents.length > 0) setJumbotronQueue(q => [...q, ...newEvents].slice(-5));
    }, [liveHomeBox, liveAwayBox]);

    // 경기 시작/쿼터 종료/하프타임/경기 종료 등 흐름 이벤트(teamId === 'SYSTEM')도 전광판에 노출.
    // visibleEvents는 라이브 리플레이 중 시간이 지날수록 뒤에서부터 새 로그가 드러나는 배열이라,
    // 직전 렌더의 길이를 기준으로 "새로 드러난 구간"만 훑어 SYSTEM 로그를 큐에 추가한다.
    // 마운트 시점에 이미 드러나 있던(중간 참여) 로그는 첫 실행에서 기준선만 잡고 큐에 안 넣는다.
    const flowSeenCountRef = useRef<number | null>(null);

    useEffect(() => {
        // [Fix 2026-08-04] "진행 중인 경기에 입장하면 클락과 무관하게 항상 팁오프 메세지가 뜬다"
        // 버그 — gameData 로드 전엔 visibleEvents가 항상 빈 배열([])이라, 로드 전 렌더에서 먼저
        // 기준선을 0으로 잡아버리고, 직후 gameData가 로드되며 그동안 쌓인 전체 백로그(경기 시작
        // 포함)가 한꺼번에 "새로 드러난 구간"으로 오인되고 있었다. gameData가 실제로 준비되기
        // 전에는 기준선을 잡지 않도록 가드해서, 중간 참여 시 이미 지나간 로그(팁오프 등)는
        // 정상적으로 기준선에 포함되고 그 이후 로그만 큐에 쌓이게 한다.
        if (!gameData) return;
        if (flowSeenCountRef.current === null) {
            flowSeenCountRef.current = visibleEvents.length;
            return;
        }
        if (visibleEvents.length > flowSeenCountRef.current) {
            const newLogs = visibleEvents.slice(flowSeenCountRef.current);
            const flowEvents: JumbotronEvent[] = newLogs
                .filter(l => l.teamId === 'SYSTEM')
                .map((l, i) => ({ kind: 'flow', key: `flow-${flowSeenCountRef.current}-${i}-${l.text}`, text: l.text }));
            if (flowEvents.length > 0) setJumbotronQueue(q => [...q, ...flowEvents].slice(-5));
        }
        flowSeenCountRef.current = visibleEvents.length;
    }, [visibleEvents, gameData]);

    // [Fix 2026-08-03] 큐의 "가장 오래된" 항목이 아니라 "가장 최신" 항목을 꺼내 쓰고, 나머지(더 오래된
    // 대기열)는 전부 버린다 — PBP 로그가 이미 지나간 옛날 이벤트를 뒤늦게 보여주는 대신, 항상 "지금
    // 막 일어난 일"에 가까운 걸 보여주는 실제 전광판/방송 그래픽에 가까운 동작. 표시시간도 4초 →
    // 2.2초로 줄여 큐가 애초에 잘 쌓이지 않도록 함.
    useEffect(() => {
        if (activeJumbotron || jumbotronQueue.length === 0) return;
        setActiveJumbotron(jumbotronQueue[jumbotronQueue.length - 1]);
        setJumbotronQueue([]);
    }, [jumbotronQueue, activeJumbotron]);

    useEffect(() => {
        if (!activeJumbotron) return;
        const t = setTimeout(() => setActiveJumbotron(null), 2200);
        return () => clearTimeout(t);
    }, [activeJumbotron]);

    // 현재 코트 위 선수(양 팀 합산) — 박스스코어 행 하이라이트용
    const onCourtIds = useMemo<Set<string>>(() => {
        if (!gameData || displayState !== 'live' || !hasBoxTimeline) return new Set();
        const startMs = new Date(gameData.game_start_time).getTime();
        return getOnCourtIds(gameData?.box_timeline ?? [], serverNow - startMs);
    }, [gameData, serverNow, displayState, hasBoxTimeline]);

    const currentScore = useMemo(() => {
        const last = [...visibleEvents].reverse().find(e => e.homeScore != null);
        return last ? { home: last.homeScore ?? 0, away: last.awayScore ?? 0 } : { home: 0, away: 0 };
    }, [visibleEvents]);

    // 스코어링 런 — 마지막으로 공개된 득점 이벤트에 찍힌 런 상태를 그대로 표시.
    // 저장 당시 시뮬레이션이 실시간으로 판정한 값이라 싱글플레이어 라이브 화면과 동일한 정의를 따른다.
    const activeRun = useMemo(() => {
        const lastScore = [...visibleEvents].reverse().find(e => e.type === 'score' || e.type === 'freethrow');
        if (!lastScore?.runTeamId) return null;
        const isHomeRunning = lastScore.runTeamId === gameData?.home_team_id;
        const teamPts = (isHomeRunning ? lastScore.runHomePts : lastScore.runAwayPts) ?? 0;
        const oppPts  = (isHomeRunning ? lastScore.runAwayPts : lastScore.runHomePts) ?? 0;
        return { teamId: lastScore.runTeamId, teamPts, oppPts };
    }, [visibleEvents, gameData?.home_team_id]);

    const currentQuarter = visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1].quarter : 1;

    // 파울(현재 쿼터) / 타임아웃 잔여 — 싱글플레이어와 동일하게 표시.
    // 파울은 지금까지 공개된 이벤트 중 '이번 쿼터'의 foul 타입 개수를 세어 파생하고,
    // 타임아웃은 마지막으로 공개된 타임아웃 로그의 잔여치를 그대로 읽는다(엔진이 저장해둔 값).
    // foulTeamId 기반으로 집계 — 'foul' 타입뿐 아니라 슈팅파울('freethrow' 타입, teamId는 공격팀으로
    // 찍혀 있어 이걸로는 못 셈)까지 정확히 잡는다. 오펜시브/테크니컬 파울은 팀파울(보너스)에 안 들어가므로 제외.
    const homeFouls = useMemo(
        () => visibleEvents.filter(e => e.foulTeamId === gameData?.home_team_id && e.quarter === currentQuarter).length,
        [visibleEvents, currentQuarter, gameData?.home_team_id],
    );
    const awayFouls = useMemo(
        () => visibleEvents.filter(e => e.foulTeamId === gameData?.away_team_id && e.quarter === currentQuarter).length,
        [visibleEvents, currentQuarter, gameData?.away_team_id],
    );
    const timeoutsLeft = useMemo(() => {
        const reversed = [...visibleEvents].reverse();
        const lastHome = reversed.find(e => e.timeoutsLeft != null && e.teamId === gameData?.home_team_id);
        const lastAway = reversed.find(e => e.timeoutsLeft != null && e.teamId === gameData?.away_team_id);
        return {
            home: lastHome?.timeoutsLeft ?? TEAM_TIMEOUTS_TOTAL,
            away: lastAway?.timeoutsLeft ?? TEAM_TIMEOUTS_TOTAL,
        };
    }, [visibleEvents, gameData?.home_team_id, gameData?.away_team_id]);

    const currentMinute  = useMemo(() => {
        if (visibleEvents.length === 0) return 0;
        const last = visibleEvents[visibleEvents.length - 1];
        return Math.floor(toGameSeconds(last) / 60);
    }, [visibleEvents]);

    // isLive/showBox: reveal 상태 자체가 단일 진실 소스 — scheduledAt+10분 전이면 live, 이후 final.
    const isLive         = displayState === 'live';
    const showBox        = displayState === 'final';
    const isScheduled    = displayState === 'scheduled';
    // [Fix 2026-08-04] "카운트다운을 별도 전체화면이 아니라 점보트론(헤더 가운데) 영역에" 요청 —
    // 예전엔 이 계산이 스케줄 전용 early-return 블록 안에만 있었음. 헤더에서도 써야 해서 위로 끌어올림.
    const scheduledStartMs      = scheduledAt ? new Date(scheduledAt).getTime() : null;
    const scheduledRemainingMs  = scheduledStartMs != null ? Math.max(0, scheduledStartMs - serverNow) : null;
    const scheduledStartLabel   = scheduledStartMs != null
        ? new Date(scheduledStartMs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '';
    const maxSelectableQ = visibleEvents.length > 0 ? Math.max(...visibleEvents.map(e => e.quarter)) : 0;
    const maxQuarter     = Math.max(...((gameData?.events ?? []) as PbpLog[]).map(e => e.quarter), 4);
    // 라이브 인사이트 패널용 — maxQuarter는 항상 최종 경기 기준이라 연장전 여부가 스포일러가 됨.
    // 지금까지 공개된 로그 기준(maxSelectableQ)으로 대체(최소 4쿼터는 보장).
    const liveMaxQuarter       = Math.max(maxSelectableQ, 4);
    const quarterLabel         = isLive ? `Q${currentQuarter}` : 'Final';
    const currentTimeRemaining = visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1].timeRemaining : '';

    // 결과 화면(6섹션 통합 페이지) 스크롤스파이 — 뷰포트 상단 30% 안에 처음 걸리는 섹션을 active로 표시.
    // showBox(경기 종료) 상태에서만 의미가 있지만, 훅은 早리턴 이전에서 무조건 호출해야 하므로 여기 둠.
    useEffect(() => {
        if (!showBox) return;
        const container = resultScrollRef.current;
        if (!container) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(e => e.isIntersecting);
                if (visible.length === 0) return;
                const topmost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
                const id = topmost.target.getAttribute('data-section');
                if (id) setActiveSection(id);
            },
            { root: container, rootMargin: '0px 0px -70% 0px', threshold: 0 }
        );
        Object.values(sectionRefs.current).forEach(el => el && observer.observe(el));
        return () => observer.disconnect();
    }, [showBox, gameData]);

    // ── final 전용: 싱글플레이어 탭 재사용을 위한 어댑터 + 집계 ─────────────────
    const homeTeamAdapter = useMemo(
        () => buildTeamAdapter(gameData?.home_team_id ?? '', homeName, gameData?.home_box ?? [], rosterCache),
        [gameData?.home_team_id, homeName, gameData?.home_box, rosterCache],
    );
    const awayTeamAdapter = useMemo(
        () => buildTeamAdapter(gameData?.away_team_id ?? '', awayName, gameData?.away_box ?? [], rosterCache),
        [gameData?.away_team_id, awayName, gameData?.away_box, rosterCache],
    );
    const allBoxPlayers = useMemo(
        () => [...(gameData?.home_box ?? []), ...(gameData?.away_box ?? [])],
        [gameData?.home_box, gameData?.away_box],
    );
    const finalMvpId = useMemo(
        () => allBoxPlayers.length > 0
            ? allBoxPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allBoxPlayers[0]).playerId
            : '',
        [allBoxPlayers],
    );
    const finalLeaders = useMemo<GameStatLeaders>(() => ({
        pts: Math.max(0, ...allBoxPlayers.map(p => p.pts)),
        reb: Math.max(0, ...allBoxPlayers.map(p => p.reb)),
        ast: Math.max(0, ...allBoxPlayers.map(p => p.ast)),
        stl: Math.max(0, ...allBoxPlayers.map(p => p.stl)),
        blk: Math.max(0, ...allBoxPlayers.map(p => p.blk)),
        tov: Math.max(0, ...allBoxPlayers.map(p => p.tov)),
    }), [allBoxPlayers]);

    // ── Loading / Scheduled / Error ───────────────────────────────────────────

    // [Fix 2026-08-04] "다른 경기로 전환하면 화면 전체가 로더로 바뀐다" 피드백 — 이전엔 이
    // 컴포넌트가 로딩/스케줄/에러 상태일 때 전부 조기 return으로 GameDateStrip을 포함한 화면
    // 전체를 스피너 하나로 덮어버렸다(GameDateStrip은 gameData/isLoading과 무관하게 항상 그릴
    // 수 있는 데이터만 쓰므로 이 게이트보다 먼저 렌더될 이유가 없었음). 날짜 스트립을 변수로
    // 뽑아 모든 분기에서 상단에 고정 배치하고, 로더/카운트다운/에러는 그 아래 body 영역에만
    // 표시되게 해서 게임 전환 중에도 상단 스트립(날짜/경기 목록)은 계속 보이고 클릭 가능하다.
    const dateStrip = (
        <GameDateStrip
            leagueId={leagueId}
            currentGameId={resolvedGameId}
            schedule={schedule}
            teamMap={stripTeamMap}
            simStart={simStart}
            gprd={gprd}
            bracketData={league?.bracket_data}
            serverNow={serverNow}
            roomId={room?.id}
            accessToken={session?.access_token}
            getGameUrlId={getGameUrlId}
        />
    );

    // [Fix 2026-08-05] "예정 경기가 라이브로 전환되는 순간 박스스코어가 사라지고 안내 문구로
    // 바뀌었다가 다시 리셋된 것처럼 보인다" 버그 — scheduled→live는 resolvedGameId가 안 바뀌는
    // 자연스러운 시간 경과 전환인데, 이 두 게이트가 (a) isLoading이 방금 fetch를 시작하며 true로
    // 튀는 순간, (b) 그 fetch가 아직 안 끝나 gameData가 null인 순간을 매번 "화면 전체 교체"로
    // 처리해왔다. 실제로는 아래 useMemo들이 전부 `if (!gameData) return ...` 가드를 갖고 있어
    // gameData가 null이어도 본문이 크래시 없이 렌더되므로(스코어 0, 박스스코어는 팀 로스터 기반
    // 폴백 등), 굳이 전체 화면을 지울 필요가 없다. isLoading은 fetch 진행 여부를 나타낼 뿐 렌더를
    // 막을 필요는 없어 게이트에서 제거 — scheduledAt이 아직 미확정(최초 마운트/게임 전환 직후)일
    // 때만 스피너를 보여준다.
    if (scheduledAt === undefined) {
        return (
            <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
                {dateStrip}
                <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-950">
                    <Loader2 size={28} className="animate-spin text-indigo-400" />
                </div>
            </div>
        );
    }

    // [Fix 2026-08-04] "시작 전 경기도 실제 시뮬레이션 뷰로 들어가서 점보트론에 카운트다운을
    // 보고 싶다" 요청으로, scheduled 전용 전체화면 분기를 제거 — 이제 헤더(팀 정보는 schedule
    // 폴백으로 채움, 가운데 컬럼엔 카운트다운)까지는 아래 메인 return을 그대로 타고, 본문만
    // "박스스코어/PBP 없음" 상태를 안내하는 자리표시자로 대체한다.
    // [Fix 2026-08-05] gameData가 null이라는 이유만으로 화면 전체를 안내 문구로 덮던 조건 제거 —
    // 위 주석과 동일한 이유로 본문이 null-safe하므로, 진짜 에러(error)일 때만 전체 화면을 대체한다.
    if (error) {
        return (
            <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
                {dateStrip}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 bg-slate-950">
                    <p className="text-slate-400 text-sm ko-normal">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">

            {/* ── 날짜 셀렉터 + 리그 전체 경기 스트립 ── */}
            {dateStrip}

            {/* ── 스코어버그 헤더 ──
                좌:중:우 = 4:3:4 고정 비율. 좌/우 컬럼은 팀 메인컬러 단색 배경(absolute 레이어로
                헤더 높이 전체를 채움 — 그라데이션 대신 각 팀 컬러가 정확히 4/11 폭만큼 하드엣지로 채워짐),
                중앙 3fr은 배경 없이 slate-900 그대로 노출. 단색 배경 위 텍스트는 배지와 동일한
                대비색(awayText/homeText)을 써야 흰/밝은 팀 배경에서도 글자가 묻히지 않는다. */}
            <div className="relative bg-slate-900 border-b border-slate-800 shrink-0 overflow-hidden">
                {/* [Fix 2026-08-04] "헤더 좌우 섹션 너비를 바디 좌우 섹션(w-[30%])과 동일하게" 요청 —
                    바디는 좌/중/우 = 30%/40%/30%(w-[30%] + flex-1)라서 헤더도 동일 비율로 맞춤
                    (4fr/3fr/4fr → 3fr/4fr/3fr, 10등분이라 정확히 30/40/30%로 딱 떨어짐). */}
                <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: '30%', backgroundColor: awayColor }} />
                <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: '30%', backgroundColor: homeColor }} />
                {/* [2026-08-04] 중앙 섹션 — 기존엔 배경 없이 부모 bg-slate-900이 그대로 보였음, slate-950으로 분리 */}
                <div className="absolute inset-y-0 bg-slate-950 pointer-events-none" style={{ left: '30%', width: '40%' }} />
                {/* [Fix 2026-08-04] "헤더 전체를 점보트론 영역으로" 요청 — 예전에 바디 상단 검은 바에만
                    있던 LED 도트 매트릭스 텍스처를 헤더 전체(좌/중/우 컬러 밴드 포함)로 확장. */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-70"
                    style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)', backgroundSize: '4px 4px' }}
                />

                {/* [Fix 2026-08-04] "중앙과 우측 사이에 틈이 보인다" 리포트 — 원인은 CSS Grid의 fr 트랙
                    폭 계산과, 위 배경 오버레이 3개(left/right/left+width 조합의 순수 %)의 폭 계산이
                    서로 다른 알고리즘이라 브라우저 반올림이 어긋날 수 있다는 것. 특히 away(left:0)/
                    center(left:30%)는 같은 "left 기준" 계산이라 우연히 잘 맞았지만, home은 anchor가
                    반대(right:0)라 유독 그 경계에서만 1px대 오차가 보였던 것으로 추정. grid+fr 대신
                    flex + 오버레이와 완전히 동일한 인라인 style={{width:'30%'/'40%'/'30%'}}를 각 컬럼에
                    직접 줘서, 오버레이와 콘텐츠 컬럼이 정확히 같은 계산식(%)을 공유하도록 통일. */}
                <div className="relative z-10 flex items-center">
                    {/* [Fix 2026-08-05] "팀이름/성적 길이에 따라 점수 위치가 밀리는 대신, 점수는 항상
                        안쪽(원정=우측)에 밀착되도록" 요청 — 중앙 점보트론처럼 이 컬럼도 3구획(약어=바깥쪽
                        고정 / 이름·성적=가변(1fr, 넘치면 truncate) / 점수=안쪽 고정) grid로 재구성.
                        flex+justify-start였을 때는 세 요소가 한 덩어리로 붙어 있어서 이름이 짧으면 점수가
                        같이 왼쪽(바깥쪽)으로 딸려왔었음 — 이제 이름 칸이 남는 공간을 전부 흡수하므로
                        점수는 이름 길이와 무관하게 항상 컬럼 안쪽 경계에 붙는다. */}
                    <TeamHeaderColumn side="away" abbr={awayAbbr} name={awayName} wl={awayWL} score={currentScore.away} textColor={awayText} infoLoading={awayInfoLoading} />

                    {/* Center: Final(또는 쿼터/시계)과 쿼터별 득점 테이블을 한 블록으로 묶어 고정 3fr
                        컬럼 안에서 항상 정중앙에 위치한다. */}
                    <div className="flex flex-col items-center justify-center shrink-0" style={{ width: '40%' }}>
                        {/* [Fix 2026-08-04] "경기중 화면 헤더를 전부 점보트론 영역으로" 요청 — 좌/우 팀
                            컬럼에 있던 파울/보너스/타임아웃을 가운데로 통합하고, activeJumbotron(마일스톤/
                            쿼터·경기 시작·종료)이 있으면 이 섹션 전체를 이벤트 문구로 교체(별도 검은 바
                            대신 헤더 가운데 자체가 점보트론 역할). 3fr 컬럼 폭에 맞춰 기존 점보트론의
                            상세 6스탯 줄은 생략하고 팀/선수명+마일스톤 값만 남긴 압축 버전. */}
                        {isScheduled ? (
                            // [Fix 2026-08-04] "카운트다운을 별도 전체화면 대신 점보트론(헤더 가운데)에" 요청.
                            // [Fix 2026-08-05] 시계 아이콘 삭제, "시작까지 00:00" → "00:00"만, 2xl로 확대.
                            <div className="flex flex-col items-center gap-1 animate-in fade-in duration-300">
                                <span className="text-sm font-black text-white ko-tight">
                                    {scheduledStartLabel ? `${scheduledStartLabel} 시작 예정` : '경기 시작 전'}
                                </span>
                                {scheduledRemainingMs != null && (
                                    // [Fix 2026-08-05] 라이브 게임클락과 동일한 폰트 스타일 적용
                                    <span className="text-3xl font-black tabular-nums text-slate-300 leading-none">
                                        {fmtCountdown(scheduledRemainingMs)}
                                    </span>
                                )}
                            </div>
                        ) : isLive && activeJumbotron ? (
                            activeJumbotron.kind === 'flow' ? (
                                <div key={activeJumbotron.key} className="flex items-center justify-center animate-in fade-in duration-300">
                                    <span
                                        className="text-lg font-black uppercase tracking-widest text-white text-center"
                                        style={{ textShadow: '0 0 10px rgba(255,255,255,0.45)' }}
                                    >
                                        {activeJumbotron.text}
                                    </span>
                                </div>
                            ) : activeJumbotron.kind === 'combo' ? (
                                <MilestoneJumbotronBody
                                    key={activeJumbotron.key}
                                    teamAbbr={activeJumbotron.isHome ? homeAbbr : awayAbbr}
                                    playerName={activeJumbotron.player.playerName}
                                    accentClass={COMBO_ACCENT[activeJumbotron.combo]}
                                    label={COMBO_LABEL[activeJumbotron.combo]}
                                />
                            ) : (
                                <MilestoneJumbotronBody
                                    key={activeJumbotron.key}
                                    teamAbbr={activeJumbotron.isHome ? homeAbbr : awayAbbr}
                                    playerName={activeJumbotron.player.playerName}
                                    accentClass={JUMBOTRON_ACCENT[activeJumbotron.stat]}
                                    label={`${activeJumbotron.value}${JUMBOTRON_LABEL[activeJumbotron.stat]}`}
                                />
                            )
                        ) : isLive ? (
                        // [Fix 2026-08-05] "경기 중 화면 헤더 수정이 경기 종료 화면 헤더에도 영향을 미친다,
                        // 둘을 분리해달라" 요청 — 이 grid(점보트론 idle 3단 레이아웃)는 이제 isLive일
                        // 때만 렌더되고, showBox(종료 화면)일 땐 null로 완전히 분리된다. 이전엔 else(항상
                        // 렌더)라 종료 화면에서도 이 grid의 min-h-20 등이 그대로 적용돼 헤더 높이/여백에
                        // 영향을 주고 있었음.
                        // [Fix 2026-08-05] "평시 디자인을 3단으로" 요청 — 1행: 원정 파울/보너스+타임아웃 |
                        // 쿼터+게임클락 | 홈 타임아웃+파울/보너스(좌우 대칭, grid-cols-[1fr_auto_1fr]로
                        // 중앙 열은 콘텐츠만큼만, 양옆 열은 남는 공간을 1:1로 나눠 가짐). 2행: 스코어링
                        // 런이 있을 때만 중앙 열 아래에 추가(좌우 열은 빈 칸 — grid auto-flow가 3칸씩 채운
                        // 뒤 자동으로 다음 행으로 넘어가는 걸 이용). self-stretch — 이 wrapper 자체가
                        // 가운데 컬럼 전체 폭(40%)까지 늘어나야 내부 grid가 진짜 40% 폭 기준으로 계산됨.
                        <div className="relative self-stretch w-full grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-4 min-h-20">
                            {/* [Fix 2026-08-05] "스코어링 런 발생 시 점보트론 중앙 하단에 불타는 것처럼 보이는
                                붉은 타원형 그라디언트" 요청 — 런 정보 텍스트 바로 아래에 은은하게 이글거리는
                                불빛처럼 보이도록 radial-gradient 타원 + blur + animate-pulse. -z-10이라
                                부모(relative)의 static 자식들(파울/타임아웃/쿼터·클락 텍스트)보다 항상 뒤에
                                그려짐 — absolute라 grid 셀을 차지하지 않아 DOM 위치는 레이아웃에 영향 없음. */}
                            {!showBox && isLive && activeRun && (
                                <div
                                    className="absolute left-1/2 -translate-x-1/2 -z-10 pointer-events-none animate-pulse"
                                    style={{
                                        bottom: '-40px',
                                        width: '900px',
                                        height: '200px',
                                        background: 'radial-gradient(ellipse 50% 50% at 50% 100%, rgba(255,120,0,0.6) 0%, rgba(239,68,68,0.4) 45%, rgba(239,68,68,0) 75%)',
                                        filter: 'blur(10px)',
                                    }}
                                />
                            )}
                            {/* [Fix 2026-08-05] "스코어링 런 카운트가 떠도 좌우 팀정보가 위로 밀리지 않게" —
                                3개 컨테이너(원정/쿼터·클락/홈)에 h-full을 줘서 자기 행의 높이를 그대로
                                채우게 함. grid 자체에 min-h-20(런 정보까지 2줄 들어갈 여유)을 줘서, 런이
                                뜨든 안 뜨든 행 높이가 항상 동일 — 결과적으로 팀정보가 절대 안 밀림. */}
                            {/* 1행 1열: 원정 파울/보너스 + 타임아웃 */}
                            <div className="h-full flex items-center gap-1.5 justify-self-start text-xl text-slate-400">
                                {/* [Fix 2026-08-05] "BONUS 칩 표시 시 타임아웃 칸과 겹침" — BONUS 뱃지
                                    (px-1 패딩 포함) 실제 렌더링 폭이 기존 w-16(64px)보다 넓어서 박스를
                                    벗어나 옆 타임아웃 칸 쪽으로 overflow가 흘러넘쳤음. w-24(96px)로 확장해
                                    여유를 둠. isLive 체크는 생략 — 이 grid 자체가 isLive 분기 안에서만
                                    렌더되므로 항상 true. */}
                                <FoulBonusBadge fouls={awayFouls} align="left" />
                                <TimeoutDots left={timeoutsLeft.away} />
                            </div>

                            {/* [Fix 2026-08-05] "런 발생 시 가운데 영역 텍스트는 두 줄 처리되고 수직/수평
                                중앙정렬" 요청 — 쿼터+클락 줄과 런 정보 줄을 같은 flex-col 안에 넣어 하나의
                                응집된 2줄 블록으로 만들고, justify-center로 그 블록 자체를(1줄이든 2줄이든)
                                이 컬럼의 세로 중앙에 정렬. 가로는 items-center로 두 줄 모두 중앙 정렬. */}
                            <div className="h-full flex flex-col items-center justify-center gap-0.5 justify-self-center">
                                <div className="flex items-center gap-2">
                                    {/* [Fix 2026-08-04] "Final" 텍스트 삭제 요청 — quarterLabel은 라이브가 아닐 때
                                        'Final'이 되므로, 라이브일 때(Q{n} 표시)만 렌더링. */}
                                    {isLive && (
                                        <span className="text-3xl font-black tabular-nums text-white leading-none">{quarterLabel}</span>
                                    )}
                                    {isLive && currentTimeRemaining && (
                                        <>
                                            <span className="text-slate-600 text-3xl leading-none font-light">|</span>
                                            <span className="text-3xl font-black tabular-nums text-slate-300 leading-none">{currentTimeRemaining}</span>
                                        </>
                                    )}
                                </div>
                                {/* 스코어링 런 정보 — 런이 실제로 발생 중일 때만 2번째 줄로 추가(자리 예약
                                    없이 grid 전체 min-h-20으로 이미 공간을 확보해뒀으므로 팀정보는 안 밀림). */}
                                {!showBox && isLive && activeRun && (
                                    <span className="text-2xl font-bold text-white whitespace-nowrap">
                                        🔥 {(activeRun.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
                                        {activeRun.teamPts}-{activeRun.oppPts}
                                    </span>
                                )}
                            </div>

                            {/* 1행 3열: 홈 타임아웃 + 파울/보너스 */}
                            <div className="h-full flex items-center gap-1.5 justify-self-end text-xl text-slate-400">
                                <TimeoutDots left={timeoutsLeft.home} />
                                {/* [Fix 2026-08-05] 원정쪽과 동일한 이유 — w-16 → w-24 확장. */}
                                <FoulBonusBadge fouls={homeFouls} align="right" />
                            </div>

                        </div>
                        ) : null}
                        {showBox && (
                            <div className="self-stretch w-full">
                                <QuarterScores
                                    allLogs={visibleEvents}
                                    homeTeamId={(homeTeamId ?? '')}
                                    currentQuarter={currentQuarter}
                                    homeAbbr={homeAbbr}
                                    awayAbbr={awayAbbr}
                                    fullWidth
                                />
                            </div>
                        )}
                        {/* [2026-08-04] 탭 그룹을 헤더 아래 별도 줄이 아니라 중앙 섹션 하단으로 이동
                            — 별도 h-11 바를 없애서 헤더+탭을 한 블록으로 합치고 세로 공간을 절약. */}
                        {showBox && (
                            <div className="self-stretch w-full grid grid-cols-6 divide-x divide-slate-800 border-t border-slate-800">
                                {([
                                    { id: 'insights' as const,  label: '인사이트' },
                                    { id: 'box' as const,       label: '박스스코어' },
                                    { id: 'pbp' as const,       label: '경기 기록' },
                                    { id: 'shotchart' as const, label: '샷차트' },
                                    { id: 'rotation' as const,  label: '로테이션' },
                                    { id: 'onoff' as const,     label: '온오프' },
                                ]).map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => sectionRefs.current[t.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className={`text-xs font-black uppercase tracking-wider text-center py-3 border-b-2 transition-colors ${
                                            activeSection === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* [Fix 2026-08-05] 원정 컬럼과 동일한 이유로 3구획 grid로 재구성. DOM 순서(점수→이름→약어)는
                        그대로 유지 — grid는 순서대로 좌→우 배치되므로 점수(1열)가 컬럼 안쪽(좌측=중앙 쪽),
                        약어(3열)가 바깥쪽(우측)에 자동으로 고정된다. 이름/성적(2열)만 남는 공간을 흡수. */}
                    <TeamHeaderColumn side="home" abbr={homeAbbr} name={homeName} wl={homeWL} score={currentScore.home} textColor={homeText} infoLoading={homeInfoLoading} />
                </div>
            </div>

            {/* [Fix 2026-08-05] "경기 시작 전 화면에서도 바디의 모든 섹션이 다 보이도록" 요청 —
                기존엔 scheduled 상태를 안내 문구 하나로 때웠지만(gameData.xxx 직접 참조라 null이면
                크래시하는 게 이유였음), 이제 이 블록 내부의 gameData 참조를 전부 옵셔널 체이닝/
                homeTeamId·awayTeamId(schedule 폴백 포함) 변수로 바꿔서 gameData가 null이어도 안전하게
                렌더된다 — scheduled에서도 라이브와 동일한 3열 레이아웃이 뜨고, 각 패널은 데이터가
                없으므로 자연스럽게 빈 상태(BoxScorePlaceholder, "경기 시작 대기 중…" 등)로 표시된다. */}
            {(isLive || isScheduled) && (
            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: 원정팀 박스스코어 + 하단 인사이트 그래프.
                    [Fix 2026-08-04] "인사이트 그래프 영역을 좌측 하단으로" 요청 — CENTER 하단에 있던
                    GameInsightsPanel을 이쪽으로 이동(PBP 피드와 자리를 맞바꿈). */}
                <div className="w-[30%] border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                    {showBox ? (
                        <PlayerBoxPanel
                            players={gameData?.away_box ?? []}
                            label={awayAbbr}
                        />
                    ) : hasBoxTimeline ? (
                        <PlayerBoxPanel
                            players={liveAwayBox}
                            label={awayAbbr}
                            onCourtIds={onCourtIds}
                        />
                    ) : scheduledAwayBox.length > 0 ? (
                        // [Fix 2026-08-05] "예정→라이브 전환 시 박스스코어가 사라졌다 안내 문구로
                        // 바뀐다" 버그 — isScheduled(displayState==='scheduled') 대신 "0스탯
                        // 로스터를 실제로 만들었는가"로 판단. displayState가 live로 넘어간 직후
                        // hasBoxTimeline이 아직 false인 짧은 구간에도 이 0스탯 로스터를 계속 보여줘
                        // BoxScorePlaceholder로 튀지 않고 그대로 이어지다가 실제 라이브 데이터가
                        // 오면 자연스럽게 교체된다.
                        <PlayerBoxPanel players={scheduledAwayBox} label={awayAbbr} />
                    ) : (
                        <BoxScorePlaceholder label={awayAbbr} />
                    )}
                    {/* 경기 그래프(인사이트) — allLogs/homeOreb/awayOreb/maxQuarter는 라이브 세이프 값
                        (visibleEvents, liveHomeOreb/liveAwayOreb, liveMaxQuarter)으로 교체 — 컴포넌트
                        자체는 무수정.
                        [Fix 2026-08-05] "하단을 꽉 채우지 말고 낮은 고정 높이로" 요청 — flex-1(남는
                        세로 공간 전부 차지) 대신 h-[300px] 고정(처음 200px로 적용 후 300px로 조정).
                        shrink-0으로 위 박스스코어 패널이 길어져도 이 영역이 눌려서 찌그러지지 않게 함. */}
                    <div className="h-[300px] shrink-0 overflow-y-auto border-t border-slate-800" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
                        <GameInsightsPanel
                            allLogs={visibleEvents}
                            homeTeamId={(homeTeamId ?? '')}
                            homeStats={homeStats}
                            awayStats={awayStats}
                            homeOreb={liveHomeOreb}
                            awayOreb={liveAwayOreb}
                            maxQuarter={liveMaxQuarter}
                            homeColor={homeColor}
                            awayColor={awayColor}
                            homeAbbr={homeAbbr}
                            awayAbbr={awayAbbr}
                            boxTimeline={gameData?.box_timeline}
                            homeBox={gameData?.home_box ?? []}
                            awayBox={gameData?.away_box ?? []}
                        />
                    </div>
                </div>

                {/* CENTER: 풀코트 샷차트(상단, aspect-ratio) + PBP 피드(하단).
                    [Fix 2026-08-04] "PBP 코멘터리 영역을 가운데로" 요청 — LEFT 컬럼에 있던 PBP 피드를
                    이쪽으로 이동(인사이트 그래프와 자리를 맞바꿈). 전광판은 헤더 가운데 컬럼으로 통합돼
                    여기 있던 검은 LED 바는 삭제됨. */}
                <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">

                    {/* 샷차트 */}
                    <div className="shrink-0 border-b border-slate-700">
                        <MultiFullCourtChart
                            homeTeamId={(homeTeamId ?? '')}
                            homeColor={homeColor}
                            homeAbbr={homeAbbr}
                            awayTeamId={(awayTeamId ?? '')}
                            awayColor={awayColor}
                            awayAbbr={awayAbbr}
                            shotEvents={visibleShotEvents}
                            courtBackground={homeTeam?.court_background}
                            courtPaint={homeTeam?.court_paint}
                            courtLine={homeTeam?.court_line}
                        />
                    </div>

                    {/* PBP 피드 */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-t border-slate-800">
                        {/* 헤더 + 쿼터 필터 */}
                        <div className="shrink-0 px-3 h-9 flex items-center bg-slate-800 border-b border-slate-700">
                            <div className="flex items-center gap-3">
                                <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                                    플레이-바이-플레이
                                </p>
                                <div className="flex gap-1">
                                    {([0, 1, 2, 3, 4, ...(maxQuarter > 4 ? Array.from({ length: maxQuarter - 4 }, (_, i) => i + 5) : [])] as number[]).map(q => (
                                        <button
                                            key={q}
                                            onClick={() => setQuarterFilter(q as 0|1|2|3|4|5)}
                                            disabled={q > maxSelectableQ && q !== 0}
                                            className={`px-2 py-0.5 rounded text-xs font-bold transition-colors
                                                disabled:opacity-30 disabled:cursor-not-allowed
                                                ${quarterFilter === q
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            {q === 0 ? '전체' : q <= 4 ? `${q}Q` : `OT${q - 4}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* PBP 스크롤 */}
                        <div
                            className="flex-1 min-h-0 overflow-y-auto font-mono text-xs bg-slate-900"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                        >
                            {/* [Fix 2026-08-05] "원정 코멘터리 | 원정 점수 | 쿼터 | 시간 | 홈 점수 | 홈 코멘터리"
                                구조로 재편 — 이벤트가 어느 팀 소속인지에 따라 코멘터리가 좌(원정)/우(홈) 중
                                한쪽에만 채워지고 반대쪽은 비워둔다(중앙 쿼터/시계/점수 기준 좌우 대칭 레이아웃). */}
                            <div className="flex items-center gap-2 px-3 h-8 bg-slate-950 sticky top-0 z-10 border-b border-slate-800 shadow-sm">
                                <div className="flex-1 text-right text-xs font-black uppercase text-slate-500 truncate">{awayName}</div>
                                {/* [Fix 2026-08-05] "양 팀 스코어와 시간 컬럼 간격이 너무 넓다" 요청 — 이 3칸만
                                    별도 gap-1로 묶어서 본문 행의 centerCols와 동일하게 좁힘(바깥 코멘터리 칸
                                    사이 gap-2는 그대로 유지). */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="w-8 text-center text-xs font-black uppercase text-slate-500"></div>
                                    <div className="w-16 text-center text-xs font-black uppercase text-slate-500">시간</div>
                                    <div className="w-8 text-center text-xs font-black uppercase text-slate-500"></div>
                                </div>
                                <div className="flex-1 text-xs font-black uppercase text-slate-500 truncate">{homeName}</div>
                            </div>
                            <div className="divide-y divide-slate-800/50">
                                {filteredLogs.map(({ log, idx }, i) => {
                                    const isHome      = log.teamId === (homeTeamId ?? '');
                                    const isScore     = log.type === 'score';
                                    const isFT        = log.type === 'freethrow';
                                    const isFoul      = log.type === 'foul';
                                    const isTurnover  = log.type === 'turnover';
                                    const isBlock     = log.type === 'block';
                                    const isInfo      = log.type === 'info' || log.type === 'timeout';
                                    const isInjury    = log.type === 'injury';
                                    // [Fix] teamId === 'SYSTEM'이 실제 엔진 마커 — 텍스트 매칭은 "2쿼터 시작"처럼
                                    // '경기 시작'/'종료'/'하프 타임'을 포함하지 않는 로그를 놓쳤음 (GamePbpTab.tsx 동일 수정 참고)
                                    const isFlowEvent = log.teamId === 'SYSTEM';

                                    // [Fix 2026-08-05] "가장 최신 로그 행은 배경을 살짝 밝게 켰다가 시간에 따라
                                    // 페이드"— 지금 필터/정렬 결과에서 맨 위(i===0)가 항상 가장 최근 로그.
                                    // key를 idx(visibleEvents 기준 불변 인덱스)로 줘서, 새 로그가 들어와 이
                                    // 자리를 넘겨받을 때마다 실제로 새 DOM 노드가 마운트되어 CSS 애니메이션이
                                    // 매번 처음부터 재생된다(포지션 기반 key였다면 노드가 재사용돼 재생 안 됨).
                                    const flashClass = i === 0 ? ' animate-pbp-row-flash' : '';

                                    if (isFlowEvent) {
                                        return (
                                            <div key={idx} className={`flex items-center justify-center py-2.5 bg-indigo-500/10 border-y border-indigo-500/20${flashClass}`}>
                                                <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs uppercase tracking-widest">
                                                    <Clock size={12} />
                                                    <span>{log.text}</span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    const centerCols = (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <div className="w-8 text-center pt-0.5 overflow-hidden">
                                                {log.awayScore !== undefined && (
                                                    <span className={`text-xs font-black tracking-tight tabular-nums ${!isHome && (isScore || isFT) ? 'text-white' : 'text-slate-500'}`}>
                                                        {log.awayScore}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-16 text-slate-500 font-bold text-xs text-center tabular-nums pt-0.5 overflow-hidden">
                                                {log.quarter}Q {log.timeRemaining || '-'}
                                            </div>
                                            <div className="w-8 text-center pt-0.5 overflow-hidden">
                                                {log.homeScore !== undefined && (
                                                    <span className={`text-xs font-black tracking-tight tabular-nums ${isHome && (isScore || isFT) ? 'text-white' : 'text-slate-500'}`}>
                                                        {log.homeScore}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );

                                    if (log.text.startsWith('교체:')) {
                                        const inMatch  = log.text.match(/IN \[(.*?)\]/);
                                        const outMatch = log.text.match(/OUT \[(.*?)\]/);
                                        if (inMatch && outMatch) {
                                            const inPlayers  = inMatch[1].split(',').map(s => s.trim());
                                            const outPlayers = outMatch[1].split(',').map(s => s.trim());
                                            const isSubHome  = log.teamId === (homeTeamId ?? '');
                                            return (
                                                <div key={idx} className={`flex items-start py-2 px-3 gap-2 hover:bg-white/5 transition-colors${flashClass}`}>
                                                    <div className="flex-1 min-w-0">
                                                        {!isSubHome && (
                                                            <div className="flex flex-col gap-0.5 items-end">
                                                                <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-300">
                                                                    <span>{inPlayers.join(', ')}</span>
                                                                    <span className="shrink-0 text-xs font-bold text-slate-500">IN</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-500">
                                                                    <span>{outPlayers.join(', ')}</span>
                                                                    <span className="shrink-0 text-xs font-bold">OUT</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {centerCols}
                                                    <div className="flex-1 min-w-0">
                                                        {isSubHome && (
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-300">
                                                                    <span className="shrink-0 text-xs font-bold text-slate-500">IN</span>
                                                                    <span>{inPlayers.join(', ')}</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-500">
                                                                    <span className="shrink-0 text-xs font-bold">OUT</span>
                                                                    <span>{outPlayers.join(', ')}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    }

                                    let textColor = 'text-slate-400';
                                    if (isInjury)        textColor = 'text-red-400 font-bold';
                                    else if (isInfo)     textColor = 'text-slate-300';
                                    else if (isScore)    textColor = 'text-slate-200';
                                    else if (isFT)       textColor = 'text-cyan-400';
                                    else if (isFoul)     textColor = 'text-orange-400';
                                    else if (isTurnover) textColor = 'text-red-400';
                                    else if (isBlock)    textColor = 'text-blue-400';

                                    const bgClass = isInjury
                                        ? 'bg-red-900/20 border-y border-red-900/30'
                                        : 'hover:bg-white/5 transition-colors';

                                    return (
                                        <div key={idx} className={`flex items-center py-2 px-3 gap-2 ${bgClass}${flashClass}`}>
                                            <div className={`flex-1 min-w-0 text-right break-words leading-relaxed text-xs ${textColor}`}>
                                                {!isHome ? log.text : ''}
                                            </div>
                                            {centerCols}
                                            <div className={`flex-1 min-w-0 break-words leading-relaxed text-xs ${textColor}`}>
                                                {isHome ? log.text : ''}
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredLogs.length === 0 && (
                                    <div className="py-10 text-center text-slate-600 text-xs ko-normal">
                                        {isLive || isScheduled ? '경기 시작 대기 중…' : '해당 쿼터의 기록이 없습니다.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: 홈팀 박스스코어 + 팀스탯 */}
                <div className="w-[30%] border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                    {showBox ? (
                        <PlayerBoxPanel
                            players={gameData?.home_box ?? []}
                            label={homeAbbr}
                        />
                    ) : hasBoxTimeline ? (
                        <PlayerBoxPanel
                            players={liveHomeBox}
                            label={homeAbbr}
                            onCourtIds={onCourtIds}
                        />
                    ) : scheduledHomeBox.length > 0 ? (
                        <PlayerBoxPanel players={scheduledHomeBox} label={homeAbbr} />
                    ) : (
                        <BoxScorePlaceholder label={homeAbbr} />
                    )}
                    <div className="flex-1 min-h-0 border-t border-slate-800 flex flex-col overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                        <div className="p-2">
                            <QuarterScores
                                allLogs={visibleEvents}
                                homeTeamId={(homeTeamId ?? '')}
                                currentQuarter={currentQuarter}
                                homeAbbr={homeAbbr}
                                awayAbbr={awayAbbr}
                                fullWidth
                            />
                        </div>
                        <TeamStatsCompare
                            home={homeStats}
                            away={awayStats}
                            homeBox={showBox ? (gameData?.home_box ?? []) : liveHomeBox}
                            awayBox={showBox ? (gameData?.away_box ?? []) : liveAwayBox}
                            homeColor={homeColor}
                            awayColor={awayColor}
                        />
                    </div>
                </div>
            </div>
            )}

            {/* ── Body: 종료된 경기 — 6개 섹션(인사이트/박스스코어/경기기록/샷차트/로테이션/온오프)을
                세로로 이어붙인 통합 결과 페이지. [2026-08-03] 기존 탭 전환(finalTab) 방식을 걷어내고
                한 페이지로 통합 — 상단 바는 각 섹션으로 스크롤 이동하는 네비게이션 역할만 하고,
                활성 라벨은 스크롤스파이(위 IntersectionObserver, activeSection)로 갱신된다. ── */}
            {showBox && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-950">
                <div ref={resultScrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide">
                    <section ref={el => { sectionRefs.current.insights = el; }} data-section="insights" className="border-t border-slate-800">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">인사이트</h3>
                        </div>
                        {/* [Fix 2026-08-04] 이 결과 페이지 컨텍스트에선 <section>이 일반 문서 흐름(높이 auto)이라
                            GameInsightsPanel 내부의 h-full/flex-1 체인이 참조할 확정 높이가 없음 — 이 경우
                            브라우저는 SVG의 viewBox 종횡비(800:220)로 높이를 역산해 렌더링해서 실제로는 "그래프
                            영역 높이를 줄인다"는 게 h-full/flex-1 값이 아니라 이 wrapper의 명시적 height로만
                            제어됨. 라이브뷰(2234번째 줄) 쪽은 이미 확정 높이를 가진 flex 컬럼 안에 있어 별도
                            영향 없음. */}
                        <div className="h-[300px]">
                            <GameInsightsPanel
                                allLogs={gameData?.events ?? []}
                                homeTeamId={(homeTeamId ?? '')}
                                homeStats={homeStats}
                                awayStats={awayStats}
                                homeOreb={homeOreb}
                                awayOreb={awayOreb}
                                maxQuarter={maxQuarter}
                                homeColor={homeColor}
                                awayColor={awayColor}
                                homeAbbr={homeAbbr}
                                awayAbbr={awayAbbr}
                                boxTimeline={gameData?.box_timeline}
                                homeBox={gameData?.home_box ?? []}
                                awayBox={gameData?.away_box ?? []}
                            />
                        </div>
                    </section>

                    <section ref={el => { sectionRefs.current.box = el; }} data-section="box" className="border-t border-slate-800">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">박스스코어</h3>
                        </div>
                        <GameBoxScoreTab
                            homeTeam={homeTeamAdapter}
                            awayTeam={awayTeamAdapter}
                            homeBox={gameData?.home_box ?? []}
                            awayBox={gameData?.away_box ?? []}
                            mvpId={finalMvpId}
                            leaders={finalLeaders}
                            teams={[]}
                            homeBadge={{ color: homeColor, abbr: homeAbbr }}
                            awayBadge={{ color: awayColor, abbr: awayAbbr }}
                            splitLayout
                        />
                    </section>

                    <section ref={el => { sectionRefs.current.pbp = el; }} data-section="pbp" className="border-t border-slate-800">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">경기 기록</h3>
                        </div>
                        <GamePbpTab
                            logs={gameData?.events ?? []}
                            homeTeam={homeTeamAdapter}
                            awayTeam={awayTeamAdapter}
                            shotEvents={gameData?.shot_events ?? []}
                            homeBadge={{ color: homeColor, abbr: homeAbbr }}
                            awayBadge={{ color: awayColor, abbr: awayAbbr }}
                        />
                    </section>

                    <section ref={el => { sectionRefs.current.shotchart = el; }} data-section="shotchart" className="border-t border-slate-800">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">샷차트</h3>
                        </div>
                        <GameShotChartTab
                            homeTeam={homeTeamAdapter}
                            awayTeam={awayTeamAdapter}
                            shotEvents={gameData?.shot_events ?? []}
                            homeBadge={{ color: homeColor, abbr: homeAbbr }}
                            awayBadge={{ color: awayColor, abbr: awayAbbr }}
                            homeBox={gameData?.home_box ?? []}
                            awayBox={gameData?.away_box ?? []}
                        />
                    </section>

                    <section ref={el => { sectionRefs.current.rotation = el; }} data-section="rotation" className="border-t border-slate-800">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">로테이션</h3>
                        </div>
                        <GameRotationTab
                            homeTeam={homeTeamAdapter}
                            awayTeam={awayTeamAdapter}
                            homeBox={gameData?.home_box ?? []}
                            awayBox={gameData?.away_box ?? []}
                            rotationData={gameData?.rotation_data}
                            homeBadge={{ color: homeColor, abbr: homeAbbr }}
                            awayBadge={{ color: awayColor, abbr: awayAbbr }}
                            pbpLogs={gameData?.events ?? []}
                            splitLayout
                            shotEvents={gameData?.shot_events ?? []}
                        />
                    </section>

                    <section ref={el => { sectionRefs.current.onoff = el; }} data-section="onoff" className="border-t border-slate-800 pb-10">
                        <div className="bg-slate-700 px-6 py-3">
                            <h3 className="text-sm font-black uppercase text-white tracking-widest">온오프</h3>
                        </div>
                        <GameOnOffTab
                            boxTimeline={gameData?.box_timeline}
                            homeBox={gameData?.home_box ?? []}
                            awayBox={gameData?.away_box ?? []}
                            homeTeamId={(homeTeamId ?? '')}
                            awayTeamId={(awayTeamId ?? '')}
                            homeTeamName={homeName}
                            awayTeamName={awayName}
                            homeBadge={{ color: homeColor, abbr: homeAbbr }}
                            awayBadge={{ color: awayColor, abbr: awayAbbr }}
                        />
                    </section>
                </div>
            </div>
            )}
        </div>
    );
};

export default MultiGamePbpView;
