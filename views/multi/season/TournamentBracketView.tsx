
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PlayoffSeries, Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { useServerClock } from '../../../utils/serverClock';
import { isFinal, isStarted, computeRevealedSeries } from './multiGameReveal';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    series: PlayoffSeries[];
    schedule: Game[];
    leagueTeams: LeagueTeamRow[];
    myTeamId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoundLabel(round: number, totalRounds: number): string {
    if (round === totalRounds) return '결승';
    if (round === totalRounds - 1 && totalRounds > 2) return '준결승';
    return `${round}라운드`;
}

// 컨퍼런스 분리(좌/우 대칭) 모드에서 한쪽 진영 내부 라운드 라벨 — 마지막 라운드(그 진영의
// 우승팀을 가리는 라운드)만 "컨퍼런스 파이널"로 부르고, 나머지는 N라운드 그대로 표기한다.
function getSideRoundLabel(round: number, confRounds: number): string {
    if (round === confRounds) return '컨퍼런스 파이널';
    return `${round}라운드`;
}

function matchIndex(seriesId: string): number {
    const m = seriesId.split('_M')[1];
    return m !== undefined ? parseInt(m, 10) : 0;
}

function isTeamInSeries(s: PlayoffSeries, teamId: string): boolean {
    return s.higherSeedId === teamId || s.lowerSeedId === teamId;
}

// 표준 브라켓 시드 순서(1-indexed, size는 2의 거듭제곱) — server/src/shared/playoffSeeder.ts의
// bracketSeedOrder()와 동일 로직을 클라이언트에도 복제. 1라운드 매치의 로컬 인덱스 m에서
// (higherSeed, lowerSeed) = (order[2m], order[2m+1])로 역산할 수 있어, 사이드 패널에 팀별
// 원 시드 번호를 표시하는 데 쓴다.
function bracketSeedOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const total = order.length * 2 + 1;
        const next: number[] = [];
        for (const s of order) next.push(s, total - s);
        order = next;
    }
    return order;
}

// 좌/우 대칭 모드에서 한쪽 진영의 라운드 헤더 표시 순서 — 동부(mirrored)는 컨퍼런스 파이널이
// 중앙에 붙도록 내림차순(rounds..1)으로, 서부는 오름차순(1..rounds)으로 나열한다.
function sideHeaderOrder(rounds: number, mirrored: boolean): number[] {
    return mirrored
        ? Array.from({ length: rounds }, (_, i) => rounds - i)
        : Array.from({ length: rounds }, (_, i) => i + 1);
}

// 헤더 2단(라운드 이름)과 바디 카드 그리드가 동일한 컬럼 트랙 구성을 쓰도록 공유하는 템플릿.
// 카드 컬럼은 minmax(MATCH_W, 1fr), 커넥터 컬럼은 고정 CONN_W — 이 함수 하나로 헤더/바디를
// 동시에 만들면 두 영역의 열 경계가 항상 정확히 일치한다(플렉스로 각자 흉내내면 계산이
// 미묘하게 어긋나거나 여분의 채움 요소가 필요해져 시각적으로 지저분해짐).
function buildColTemplate(rounds: number): string {
    return Array.from({ length: 2 * rounds - 1 }, (_, i) =>
        i % 2 === 0 ? `minmax(${MATCH_W}px, 1fr)` : `${CONN_W}px`,
    ).join(' ');
}

// ── Team Slot ─────────────────────────────────────────────────────────────────

const TeamSlot: React.FC<{
    teamId: string;
    wins: number;
    showWins: boolean;
    isWinner: boolean;
    finished: boolean;
    isMe: boolean;
    isChampion: boolean;
    leagueTeams: LeagueTeamRow[];
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
}> = ({ teamId, wins, showWins, isWinner, finished, isMe, isChampion, leagueTeams, hoveredTeamId, onHoverTeam }) => {
    if (teamId === 'BYE') return null;

    if (teamId === 'TBD') {
        return (
            <div className="flex items-center px-4 py-4">
                <span className="text-xl font-bold text-slate-600 flex-1">TBD</span>
            </div>
        );
    }

    const team = leagueTeams.find(t => t.team_slug === teamId);
    const label = team?.team_abbr ?? teamId.toUpperCase();
    const isEliminated = finished && !isWinner;
    // 탈락 팀은 팀 컬러 대신 통일된 slate 톤으로 — 취소선 없이 배경/텍스트 색만으로 구분한다.
    const bgColor = isEliminated ? '#1e293b' /* slate-800 */ : (team?.color_primary ?? '#1e293b');
    const textColor = isEliminated ? '#64748b' /* slate-500 */ : (team?.color_text ?? '#e2e8f0');
    const isHighlighted = hoveredTeamId === teamId;
    const isDimmed = hoveredTeamId !== null && !isHighlighted;

    return (
        <div
            className={`flex items-center justify-between gap-2 px-4 py-4 transition-all ${
                isChampion ? 'ring-2 ring-inset ring-amber-400' : isMe ? 'ring-2 ring-inset ring-white/70' : ''
            } ${isHighlighted ? 'ring-2 ring-inset ring-sky-400 brightness-110' : ''} ${isDimmed ? 'opacity-30' : ''}`}
            style={{ backgroundColor: bgColor, color: textColor }}
            onMouseEnter={() => onHoverTeam(teamId)}
            onMouseLeave={() => onHoverTeam(null)}
        >
            <span className="text-xl font-bold truncate">
                {label}
            </span>
            {showWins && (
                <span className="text-xl font-black tabular-nums shrink-0">
                    {wins}
                </span>
            )}
        </div>
    );
};

// ── Match Card ────────────────────────────────────────────────────────────────

const MatchCard: React.FC<{
    series: PlayoffSeries;
    leagueTeams: LeagueTeamRow[];
    myTeamId: string | null;
    selected: boolean;
    isFinalRound: boolean;
    onClick: () => void;
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
}> = ({ series, leagueTeams, myTeamId, selected, isFinalRound, onClick, hoveredTeamId, onHoverTeam }) => {
    const isBye = series.lowerSeedId === 'BYE';
    const showWins = series.targetWins > 1;

    if (isBye) {
        const team = leagueTeams.find(t => t.team_slug === series.higherSeedId);
        const bgColor = team?.color_primary ?? '#0f172a';
        const textColor = team?.color_text ?? '#e2e8f0';
        const isHighlighted = hoveredTeamId === series.higherSeedId;
        const isDimmed = hoveredTeamId !== null && !isHighlighted;
        return (
            <div
                className={`w-full border border-slate-700/40 flex items-center justify-between px-4 py-4 transition-all ${
                    isHighlighted ? 'ring-2 ring-inset ring-sky-400 brightness-110' : ''
                } ${isDimmed ? 'opacity-30' : ''}`}
                style={{ backgroundColor: bgColor, color: textColor }}
                onMouseEnter={() => onHoverTeam(series.higherSeedId)}
                onMouseLeave={() => onHoverTeam(null)}
            >
                <span className="text-xl font-bold truncate min-w-0">
                    {team?.team_abbr ?? series.higherSeedId.toUpperCase()}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-black/25 ml-2 shrink-0">부전승</span>
            </div>
        );
    }

    return (
        <div
            className={`w-full overflow-hidden border cursor-pointer transition-all select-none ${
                selected
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30 bg-slate-800'
                    : isFinalRound && series.finished
                    ? 'border-amber-500/60 bg-slate-900 hover:border-amber-400'
                    : 'border-slate-700/50 bg-slate-900 hover:border-slate-600'
            }`}
            onClick={onClick}
        >
            <TeamSlot
                teamId={series.higherSeedId}
                wins={series.higherSeedWins}
                showWins={showWins}
                isWinner={series.winnerId === series.higherSeedId}
                finished={series.finished}
                isMe={series.higherSeedId === myTeamId}
                isChampion={isFinalRound && series.finished && series.winnerId === series.higherSeedId}
                leagueTeams={leagueTeams}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={onHoverTeam}
            />
            <div className="border-t border-slate-700/40" />
            <TeamSlot
                teamId={series.lowerSeedId}
                wins={series.lowerSeedWins}
                showWins={showWins}
                isWinner={series.winnerId === series.lowerSeedId}
                finished={series.finished}
                isMe={series.lowerSeedId === myTeamId}
                isChampion={isFinalRound && series.finished && series.winnerId === series.lowerSeedId}
                leagueTeams={leagueTeams}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={onHoverTeam}
            />
        </div>
    );
};

// ── Bracket Connector SVG ────────────────────────────────────────────────────
//
//  ─────┐
//       ├──
//  ─────┘
//
// 컨퍼런스 분리(좌/우 대칭) 모드의 동부 쪽 절반은 이 커넥터를 개별로 다시 그리지 않고,
// BracketHalf가 그리드 전체를 `transform: scaleX(-1)`로 뒤집어서 자동으로 좌우 반전된
// 형태("┐"↔"┌")를 얻는다 — MatchCard 등 글자가 있는 요소만 안쪽에서 한 번 더 반전해
// 원래대로 되돌린다.

// upper/lower를 별도 path로 분리 — 위 자식(child0, 항상 그리드상 위쪽)과 아래 자식(child1)
// 중 호버된 팀이 지나온 쪽만 독립적으로 하이라이트하기 위함(하나의 path였을 때는 stroke를
// 하나만 줄 수 있어 위/아래가 항상 같이 켜졌었다). 다음 라운드로 나가는 출력선은 둘 중
// 하나라도 하이라이트면 같이 켜진다(그 지점부터는 이미 승자가 정해져 한 줄로 합쳐지므로).
const BracketConnector: React.FC<{ highlightedSide?: 'upper' | 'lower' | null }> = ({ highlightedSide }) => {
    const upperOn = highlightedSide === 'upper';
    const lowerOn = highlightedSide === 'lower';
    const outOn = upperOn || lowerOn;
    const colorOf = (on: boolean) => (on ? 'rgb(56,189,248)' : 'rgb(51,65,85)');
    const widthOf = (on: boolean) => (on ? 2.5 : 1.5);
    return (
        <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full block"
        >
            <path
                d="M 0,25 H 50 V 50"
                fill="none"
                stroke={colorOf(upperOn)}
                strokeWidth={widthOf(upperOn)}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
            />
            <path
                d="M 0,75 H 50 V 50"
                fill="none"
                stroke={colorOf(lowerOn)}
                strokeWidth={widthOf(lowerOn)}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
            />
            <path
                d="M 50,50 H 100"
                fill="none"
                stroke={colorOf(outOn)}
                strokeWidth={widthOf(outOn)}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

// 컨퍼런스 파이널(서부/동부 각 진영의 마지막 라운드) → 파이널을 잇는 단순 1:1 연결선.
// BracketConnector는 "두 매치가 하나로 합쳐지는" 형태라 여기엔 안 맞는다 — 파이널 한쪽에는
// 항상 진영당 매치가 하나뿐이라 그냥 직선 하나면 충분하다.
const StraightConnector: React.FC<{ highlighted?: boolean }> = ({ highlighted }) => (
    <div className="self-stretch flex items-center" style={{ width: CONN_W, flexShrink: 0 }}>
        <div className={`w-full border-t transition-colors ${highlighted ? 'border-sky-400 border-t-2' : 'border-slate-700'}`} />
    </div>
);

const MATCH_W = 150; // px — match card column minimum width (minmax(MATCH_W, 1fr)의 하한)
const CONN_W  = 48;  // px — connector column width
const ROW_H   = 140; // px — one R1 match row height

// ── Bracket Half (좌/우 대칭 모드에서 서부·동부 한쪽 진영) ────────────────────────
//
// byRound: 이 진영에 속한 시리즈만, 라운드별로 "진영 내부 로컬" matchIndex 순서(배열 위치)로
// 정렬돼 있어야 한다. 전체 브라켓(East N + West N)은 하나의 2N팀 단일 엔진으로 생성되어 전역
// matchIndex를 쓰므로, 호출부(TournamentBracketView)가 실제 참가팀 컨퍼런스로 진영을 역산한
// 뒤 라운드별 오름차순 정렬 → 배열 위치를 로컬 인덱스로 재부여해서 넘긴다.
//
// mirrored=true(동부)면 그리드 전체를 scaleX(-1)로 뒤집어 열 순서를 반전시키고, 텍스트가 있는
// MatchCard만 한 번 더 뒤집어(이중 반전=원상복구) 정상적으로 읽히게 한다 — 커넥터는 반전된
// 채로 둬서 "마지막 라운드가 중앙에 붙는" 좌우 대칭 브라켓 모양을 별도 좌표 계산 없이 얻는다.
const BracketHalf: React.FC<{
    byRound: Map<number, PlayoffSeries[]>;
    rounds: number;
    mirrored: boolean;
    selectedId: string | null;
    myTeamId: string | null;
    leagueTeams: LeagueTeamRow[];
    onToggle: (id: string) => void;
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
}> = ({ byRound, rounds, mirrored, selectedId, myTeamId, leagueTeams, onToggle, hoveredTeamId, onHoverTeam }) => {
    const r1Count = (byRound.get(1) ?? []).length;

    const gridSeries = useMemo(() => {
        const items: { key: string; series: PlayoffSeries; col: number; rowStart: number; rowSpan: number }[] = [];
        for (const [round, arr] of byRound) {
            const rowStep = Math.pow(2, round - 1);
            arr.forEach((s, m) => {
                items.push({ key: s.id, series: s, col: 2 * round - 1, rowStart: m * rowStep + 1, rowSpan: rowStep });
            });
        }
        return items;
    }, [byRound]);

    const gridConns = useMemo(() => {
        const items: { key: string; col: number; rowStart: number; rowSpan: number }[] = [];
        for (let r = 1; r < rounds; r++) {
            const rowStep = Math.pow(2, r - 1);
            const connCount = Math.pow(2, rounds - r - 1);
            for (let m = 0; m < connCount; m++) {
                items.push({ key: `conn-${r}-${m}`, col: 2 * r, rowStart: m * 2 * rowStep + 1, rowSpan: 2 * rowStep });
            }
        }
        return items;
    }, [rounds]);

    // 호버 중인 팀이 실제로 지나간 커넥터만 하이라이트 — 라운드 r+1의 로컬 매치 m에 그 팀이
    // 있으면(=그 매치까지 진출), r 라운드의 자식 매치(2m 또는 2m+1) 중 그 팀이 있던 쪽에서
    // 이어지는 커넥터가 실제 진출 경로다.
    const highlightedConnKeys = useMemo(() => {
        const map = new Map<string, 'upper' | 'lower'>();
        if (!hoveredTeamId) return map;
        for (let r = 1; r < rounds; r++) {
            const parentArr = byRound.get(r + 1) ?? [];
            const childArr = byRound.get(r) ?? [];
            parentArr.forEach((parentSeries, m) => {
                if (!isTeamInSeries(parentSeries, hoveredTeamId)) return;
                const child0 = childArr[2 * m];
                const child1 = childArr[2 * m + 1];
                if (child0 && isTeamInSeries(child0, hoveredTeamId)) map.set(`conn-${r}-${m}`, 'upper');
                else if (child1 && isTeamInSeries(child1, hoveredTeamId)) map.set(`conn-${r}-${m}`, 'lower');
            });
        }
        return map;
    }, [hoveredTeamId, byRound, rounds]);

    // 카드 컬럼은 minmax(MATCH_W, 1fr) — 화면이 넓으면 1fr이 남는 공간을 채우며 늘어나고,
    // 좁으면 MATCH_W 밑으로는 줄지 않고 그리드 자체가 넘쳐 가로 스크롤로 처리된다.
    // 커넥터 컬럼(CONN_W)은 얇은 연결선일 뿐이라 고정폭 그대로 유지. 헤더 2단 라운드
    // 행도 이 함수로 같은 트랙 구성을 그려서 열 경계가 항상 일치한다.
    const colTemplate = buildColTemplate(rounds);

    // 라운드 헤더는 이제 부모(TournamentBracketView)가 [서부]/[파이널]/[동부] 구조화 헤더
    // 테이블 안에서 한 번에 그린다(BracketHalf는 카드 그리드 본문만 담당).
    // flex: rounds 1 0% — 서부/동부(BracketHalf)가 파이널 컬럼(flex: 1 1 0%)과 "카드 1개당
    // 성장량"이 똑같아지도록 라운드 개수만큼 가중치를 준다. 이러면 화면이 넓어질 때 파이널
    // 카드도 서부/동부의 각 라운드 카드와 정확히 같은 비율로 늘어난다(예전엔 파이널만 고정폭
    // 이라 서부/동부 카드가 화면 폭에 맞춰 늘어나도 파이널만 그대로였음).
    // min-w-0 없으면 flex 기본 min-width:auto가 내용 최소폭을 자기주장해서 grid의 minmax
    // 오버플로 판단과 이중으로 충돌한다.
    return (
        <div className="min-w-0" style={{ flex: `${rounds} 1 0%` }}>
            <div className="w-full" style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
                <div
                    className="w-full"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: colTemplate,
                        gridTemplateRows: `repeat(${Math.max(r1Count, 1)}, ${ROW_H}px)`,
                    }}
                >
                    {gridSeries.map(({ key, series: s, col, rowStart, rowSpan }) => (
                        <div
                            key={key}
                            className="flex items-center"
                            style={{ gridColumn: col, gridRow: `${rowStart} / ${rowStart + rowSpan}` }}
                        >
                            <div style={mirrored ? { transform: 'scaleX(-1)', width: '100%' } : { width: '100%' }}>
                                <MatchCard
                                    series={s}
                                    leagueTeams={leagueTeams}
                                    myTeamId={myTeamId}
                                    selected={selectedId === s.id}
                                    isFinalRound={false}
                                    onClick={() => s.lowerSeedId !== 'BYE' && onToggle(s.id)}
                                    hoveredTeamId={hoveredTeamId}
                                    onHoverTeam={onHoverTeam}
                                />
                            </div>
                        </div>
                    ))}

                    {gridConns.map(({ key, col, rowStart, rowSpan }) => (
                        <div key={key} style={{ gridColumn: col, gridRow: `${rowStart} / ${rowStart + rowSpan}` }}>
                            <BracketConnector highlightedSide={highlightedConnKeys.get(key) ?? null} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

const TournamentBracketView: React.FC<Props> = ({ series, schedule, leagueTeams, myTeamId }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
    const serverNow = useServerClock();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { room } = useLeagueContext();
    const { getGameUrlId } = useGameShortCodes(room?.id);

    // schedule(Realtime 실시간) 기반으로 시리즈 승수를 재계산.
    // league.bracket_data 구독 지연이 있어도 schedule 완료 경기에서 즉시 반영됨.
    //
    // 라운드를 1부터 순서대로(하위 라운드 먼저) 처리해 "게이팅된" 상태를 다음 라운드가
    // 그대로 이어받도록 한다 — 그렇지 않으면 서버가 시뮬레이션 직후(리플레이 10분 대기 전) 곧바로
    // 다음 라운드 시리즈의 higherSeedId/lowerSeedId를 실제 진출팀으로 채워버리는 원본
    // bracket_data.series가 그대로 새어나가, "1라운드 스코어는 숨겨졌지만 2라운드 대진에 이미
    // 진출팀 이름이 떠 있는" 스포일러가 발생한다. 피더 시리즈가 아직 공개(gated finished)되지
    // 않았다면 그 슬롯은 'TBD'로 되돌려 놓는다.
    const liveSeries = useMemo(() => {
        const gatedById = computeRevealedSeries(series, schedule, serverNow);
        return series.map(s => gatedById.get(s.id) ?? s);
    }, [series, schedule, serverNow]);

    const totalRounds = useMemo(
        () => liveSeries.reduce((max, s) => Math.max(max, s.round), 1),
        [liveSeries],
    );

    const byRound = useMemo(() => {
        const map = new Map<number, PlayoffSeries[]>();
        for (const s of liveSeries) {
            const arr = map.get(s.round) ?? [];
            arr.push(s);
            map.set(s.round, arr);
        }
        for (const [round, arr] of map) {
            map.set(round, [...arr].sort((a, b) => matchIndex(a.id) - matchIndex(b.id)));
        }
        return map;
    }, [liveSeries]);

    // ── 좌/우 대칭(컨퍼런스 분리) 판별 ────────────────────────────────────────
    // main_league 플레이오프는 East N팀 + West N팀을 하나의 2N팀 단일 브라켓 엔진에 넣어
    // 생성한다(playoffSeeder.ts) — 엔진 자체는 컨퍼런스 개념이 없어 series.conference가
    // 항상 'BPL'로 고정 저장되므로 신뢰할 수 없다. 대신 1라운드 시리즈의 실제 참가팀
    // conference(leagueTeams)로 진영을 역산하고, 상위 라운드는 하위 라운드 피더의 진영을
    // 그대로 물려받는다(결승 라운드는 양 진영이 만나므로 진영 없음=대칭 모드의 중앙 매치).
    const confBySlug = useMemo(() => {
        const map = new Map<string, 'East' | 'West'>();
        for (const t of leagueTeams) {
            if (t.conference === 'East' || t.conference === 'West') map.set(t.team_slug, t.conference);
        }
        return map;
    }, [leagueTeams]);

    const sideByKey = useMemo(() => {
        const map = new Map<string, 'East' | 'West'>();
        const r1 = byRound.get(1) ?? [];
        for (const s of r1) {
            const side = confBySlug.get(s.higherSeedId) ?? confBySlug.get(s.lowerSeedId);
            if (side) map.set(`1_${matchIndex(s.id)}`, side);
        }
        for (let r = 2; r <= totalRounds - 1; r++) {
            for (const s of byRound.get(r) ?? []) {
                const m = matchIndex(s.id);
                const side = map.get(`${r - 1}_${2 * m}`) ?? map.get(`${r - 1}_${2 * m + 1}`);
                if (side) map.set(`${r}_${m}`, side);
            }
        }
        return map;
    }, [byRound, confBySlug, totalRounds]);

    const isSplit = useMemo(() => {
        if (totalRounds < 2) return false;
        const values = new Set(sideByKey.values());
        return values.has('East') && values.has('West');
    }, [sideByKey, totalRounds]);

    const confRounds = totalRounds - 1;

    // 진영별 byRound — 해당 라운드에서 그 진영 시리즈만 골라 global matchIndex 오름차순으로
    // 정렬한 뒤 배열 위치를 그대로 "로컬 matchIndex"로 쓴다(BracketHalf가 이 순서로 그리드를
    // 그림). 한 라운드 안에서 한 진영의 global matchIndex는 항상 연속 구간이므로(엔진이
    // East N팀을 앞쪽, West N팀을 뒤쪽 슬롯에 배치) 이 재배치는 형제 매치 페어링을 그대로
    // 보존한다.
    const buildSideByRound = (side: 'East' | 'West'): Map<number, PlayoffSeries[]> => {
        const map = new Map<number, PlayoffSeries[]>();
        for (let r = 1; r <= confRounds; r++) {
            const arr = (byRound.get(r) ?? [])
                .filter(s => sideByKey.get(`${r}_${matchIndex(s.id)}`) === side)
                .sort((a, b) => matchIndex(a.id) - matchIndex(b.id));
            map.set(r, arr);
        }
        return map;
    };

    const westByRound = useMemo(
        () => (isSplit ? buildSideByRound('West') : new Map<number, PlayoffSeries[]>()),
        [isSplit, byRound, sideByKey, confRounds],
    );
    const eastByRound = useMemo(
        () => (isSplit ? buildSideByRound('East') : new Map<number, PlayoffSeries[]>()),
        [isSplit, byRound, sideByKey, confRounds],
    );
    const finalSeries = useMemo(() => liveSeries.find(s => s.round === totalRounds) ?? null, [liveSeries, totalRounds]);

    // 팀 슬러그 → 원 시드 번호(1위, 2위 …). 1라운드 매치의 로컬 인덱스와 표준
    // bracketSeedOrder로 역산 — 시드는 진출과 무관하게 팀 고유값이라 모든 라운드에서
    // 재사용 가능. 컨퍼런스별로 독립 계산(서부 1~N위, 동부 1~N위가 각각 따로 존재).
    const seedBySlug = useMemo(() => {
        const map = new Map<string, number>();
        if (!isSplit) return map;
        for (const half of [westByRound, eastByRound]) {
            const r1 = half.get(1) ?? [];
            const order = bracketSeedOrder(r1.length * 2);
            r1.forEach((s, m) => {
                map.set(s.higherSeedId, order[2 * m]);
                if (s.lowerSeedId !== 'BYE') map.set(s.lowerSeedId, order[2 * m + 1]);
            });
        }
        return map;
    }, [isSplit, westByRound, eastByRound]);

    const selectedSeries = useMemo(
        () => liveSeries.find(s => s.id === selectedId),
        [liveSeries, selectedId],
    );

    // 선택된 시리즈가 속한 진영(서부/동부) — 결승은 양 진영이 만나는 라운드라 진영이 없음.
    const selectedSide = selectedSeries
        ? sideByKey.get(`${selectedSeries.round}_${matchIndex(selectedSeries.id)}`)
        : undefined;

    // 정시 전 / live 구간 경기는 목록에서 제외 — 시리즈 진행도(시드/카운트)는 서버 권위로
    // 그대로 노출하되, 개별 경기 결과는 isStarted(보기 가능)인 경기만 표시한다.
    const selectedGames = useMemo(() => {
        if (!selectedId) return [];
        return schedule
            .filter(g => g.seriesId === selectedId && isStarted(g, serverNow))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [schedule, selectedId, serverNow]);

    // 경기별 카드에 표시할 "그 경기까지의" 누적 시리즈 스코어(상위시드:하위시드).
    const seriesTallies = useMemo(() => {
        let hi = 0, lo = 0;
        return selectedGames.map(g => {
            const final = isFinal(g, serverNow);
            if (final && g.homeScore != null && g.awayScore != null && selectedSeries) {
                const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
                if (winnerId === selectedSeries.higherSeedId) hi++;
                else if (winnerId === selectedSeries.lowerSeedId) lo++;
            }
            return { higher: hi, lower: lo };
        });
    }, [selectedGames, serverNow, selectedSeries]);

    const higherTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.higherSeedId)
        : null;
    const lowerTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.lowerSeedId)
        : null;

    const toggle = (id: string) =>
        setSelectedId(prev => prev === id ? null : id);

    // ── Grid layout computation (좌/우 대칭이 아닌 기존 단일 브라켓 모드) ────────
    // Each round r occupies column 2r-1 (1-indexed, odd columns).
    // Connector between round r and r+1 occupies column 2r (even columns).

    type GridSeries  = { key: string; series: PlayoffSeries; col: number; rowStart: number; rowSpan: number };
    type GridConn    = { key: string; col: number; rowStart: number; rowSpan: number };

    const r1Count = useMemo(
        () => liveSeries.filter(s => s.round === 1).length,
        [liveSeries],
    );

    const gridSeries: GridSeries[] = useMemo(() => {
        if (isSplit) return [];
        const items: GridSeries[] = [];
        for (const [round, arr] of byRound) {
            const rowStep = Math.pow(2, round - 1);
            arr.forEach((s, m) => {
                items.push({
                    key: s.id,
                    series: s,
                    col: 2 * round - 1,
                    rowStart: m * rowStep + 1,
                    rowSpan: rowStep,
                });
            });
        }
        return items;
    }, [byRound, isSplit]);

    const gridConns: GridConn[] = useMemo(() => {
        if (isSplit) return [];
        const items: GridConn[] = [];
        for (let r = 1; r < totalRounds; r++) {
            const rowStep = Math.pow(2, r - 1);
            const connCount = Math.pow(2, totalRounds - r - 1);
            for (let m = 0; m < connCount; m++) {
                items.push({
                    key: `conn-${r}-${m}`,
                    col: 2 * r,
                    rowStart: m * 2 * rowStep + 1,
                    rowSpan: 2 * rowStep,
                });
            }
        }
        return items;
    }, [totalRounds, isSplit]);

    // classic(단일 브라켓) 모드의 호버 연결선 하이라이트 — BracketHalf 내부의 동일 로직을
    // 전역 byRound/totalRounds 기준으로 재사용.
    const highlightedConnKeysClassic = useMemo(() => {
        const map = new Map<string, 'upper' | 'lower'>();
        if (!hoveredTeamId || isSplit) return map;
        for (let r = 1; r < totalRounds; r++) {
            const parentArr = byRound.get(r + 1) ?? [];
            const childArr = byRound.get(r) ?? [];
            parentArr.forEach((parentSeries, m) => {
                if (!isTeamInSeries(parentSeries, hoveredTeamId)) return;
                const child0 = childArr[2 * m];
                const child1 = childArr[2 * m + 1];
                if (child0 && isTeamInSeries(child0, hoveredTeamId)) map.set(`conn-${r}-${m}`, 'upper');
                else if (child1 && isTeamInSeries(child1, hoveredTeamId)) map.set(`conn-${r}-${m}`, 'lower');
            });
        }
        return map;
    }, [hoveredTeamId, isSplit, byRound, totalRounds]);

    const gridCols = 2 * totalRounds - 1;
    const colTemplate = Array.from({ length: gridCols }, (_, i) =>
        i % 2 === 0 ? `${MATCH_W}px` : `${CONN_W}px`,
    ).join(' ');

    const championTeam = finalSeries?.finished && finalSeries.winnerId
        ? leagueTeams.find(t => t.team_slug === finalSeries.winnerId)
        : null;

    // 우승 배너가 겹쳐 뜰 최소 공간 계산 — 브라켓 자체 높이(1라운드 매치 수 기준, ROW_H는
    // 화면 폭과 무관한 고정값이라 이 값 자체는 정확히 계산 가능)에 배너의 "실측" 높이를
    // 더한다. 배너 높이는 팀명 줄바꿈 등으로 가변적이라 고정값 추정(예전엔 380px로 어림)
    // 대신 ResizeObserver로 실제 렌더링 크기를 재서 쓴다 — 라운드 수·배너 내용과 무관하게
    // 항상 정확히 들어맞고, 가로 폭 반응형(minmax(MATCH_W,1fr))과는 별개 축이라 서로 영향
    // 없음.
    const bracketR1Count = westByRound.get(1)?.length ?? eastByRound.get(1)?.length ?? 1;
    const bannerRef = useRef<HTMLDivElement>(null);
    const [bannerHeight, setBannerHeight] = useState(0);
    useEffect(() => {
        const el = bannerRef.current;
        if (!el) { setBannerHeight(0); return; }
        const ro = new ResizeObserver(([entry]) => setBannerHeight(entry.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, [championTeam]);
    const BANNER_MARGIN = 32; // px — 배너와 브라켓 마지막 행 사이 여백
    const bodyMinHeight = championTeam ? ROW_H * bracketR1Count + bannerHeight + BANNER_MARGIN : undefined;

    // 서부/동부 컨퍼런스 파이널 → 파이널 연결선 하이라이트 — 호버 팀이 파이널에도, 그
    // 진영의 마지막 라운드에도 있으면 그 진영 쪽 연결선이 실제 진출 경로다.
    const finalHasHovered = !!hoveredTeamId && !!finalSeries && isTeamInSeries(finalSeries, hoveredTeamId);
    const westFinalConnHighlighted = finalHasHovered
        && (westByRound.get(confRounds) ?? []).some(s => isTeamInSeries(s, hoveredTeamId!));
    const eastFinalConnHighlighted = finalHasHovered
        && (eastByRound.get(confRounds) ?? []).some(s => isTeamInSeries(s, hoveredTeamId!));

    return (
        <div className="relative flex h-full animate-in fade-in duration-500">
            {/* ── Bracket ──────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto min-h-0 bg-slate-900">
                <div className="min-h-full">

                    {isSplit ? (
                        <>
                            {/* ── 헤더: [서부] [파이널] [동부] 3열, 서부·동부는 다시
                                1라운드/2라운드/컨퍼런스 파이널 3열로 세분화된 2단 테이블.
                                바디와 분리된 영역이라 패딩 없이 상단/좌우에 그대로 붙는다.
                                서부/동부/파이널 모두 유동폭 — 서부·동부는 라운드 개수(confRounds)
                                만큼, 파이널은 카드 1개분(1)만큼의 flex-grow 가중치를 줘서 화면이
                                넓어질 때 모든 카드(서부/동부의 각 라운드 카드 + 파이널 카드)가
                                정확히 같은 비율로 늘어나며, 우측에 빈 공간도 남지 않는다. ── */}
                            <div className="flex items-start justify-start gap-0 w-full">
                                <div className="min-w-0" style={{ flex: `${confRounds} 1 0%` }}>
                                    <div className="h-10 flex items-center justify-center text-sm font-black uppercase text-blue-300 bg-blue-500/10 border border-blue-500/30">
                                        서부
                                    </div>
                                    {/* buildColTemplate(confRounds)로 바디(BracketHalf)와 동일한 트랙
                                        구성을 쓰는 진짜 grid — 커넥터 칸은 별도 채움 요소 없이 그냥
                                        비워두고 행 자체의 bg-slate-800이 그 사이로 이어져 보이게 한다.
                                        (예전엔 flex-1 + 별도 채움 div로 흉내냈는데, 폭 계산이 미묘하게
                                        어긋나고 채움 요소가 눈에 띄는 상자로 보이는 문제가 있었다.) */}
                                    <div
                                        className="grid w-full bg-slate-800"
                                        style={{ gridTemplateColumns: buildColTemplate(confRounds) }}
                                    >
                                        {sideHeaderOrder(confRounds, false).map((r, i) => (
                                            <div
                                                key={r}
                                                className={`h-10 flex items-center justify-center text-sm font-bold uppercase tracking-wide text-slate-400 ${
                                                    i > 0 ? 'border-l border-slate-700/40' : ''
                                                }`}
                                                style={{ gridColumn: 2 * i + 1 }}
                                            >
                                                {getSideRoundLabel(r, confRounds)}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 바디의 StraightConnector(파이널 연결선)와 폭을 맞추기 위한 자리 —
                                    안 넣으면 바디 쪽 서부/파이널/동부가 이 폭만큼 덜 자라서 헤더와
                                    카드 열 경계가 다시 어긋난다. */}
                                <div style={{ width: CONN_W, flexShrink: 0 }} />

                                <div style={{ flex: '1 1 0%', minWidth: MATCH_W }}>
                                    <div className="h-20 flex items-center justify-center text-sm font-black uppercase text-purple-300 bg-purple-500/10 border border-purple-500/30">
                                        파이널
                                    </div>
                                </div>

                                <div style={{ width: CONN_W, flexShrink: 0 }} />

                                <div className="min-w-0" style={{ flex: `${confRounds} 1 0%` }}>
                                    <div className="h-10 flex items-center justify-center text-sm font-black uppercase text-red-300 bg-red-500/10 border border-red-500/30">
                                        동부
                                    </div>
                                    <div
                                        className="grid w-full bg-slate-800"
                                        style={{ gridTemplateColumns: buildColTemplate(confRounds) }}
                                    >
                                        {sideHeaderOrder(confRounds, true).map((r, i) => (
                                            <div
                                                key={r}
                                                className={`h-10 flex items-center justify-center text-sm font-bold uppercase tracking-wide text-slate-400 ${
                                                    i > 0 ? 'border-l border-slate-700/40' : ''
                                                }`}
                                                style={{ gridColumn: 2 * i + 1 }}
                                            >
                                                {getSideRoundLabel(r, confRounds)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ── 바디: 서부 브라켓 / 결승 카드 / 동부 브라켓. 헤더와 별도 영역이라
                                패딩(px-6 pt-5 pb-12)은 여기에만 적용된다. ── */}
                            <div className="relative px-6 pt-5 pb-12" style={{ minHeight: bodyMinHeight }}>
                                <div className="flex items-center justify-start gap-0 w-full">
                                    <BracketHalf
                                        byRound={westByRound}
                                        rounds={confRounds}
                                        mirrored={false}
                                        selectedId={selectedId}
                                        myTeamId={myTeamId}
                                        leagueTeams={leagueTeams}
                                        onToggle={toggle}
                                        hoveredTeamId={hoveredTeamId}
                                        onHoverTeam={setHoveredTeamId}
                                    />

                                    <StraightConnector highlighted={westFinalConnHighlighted} />

                                    <div className="flex flex-col items-center gap-4" style={{ flex: '1 1 0%', minWidth: MATCH_W }}>
                                        {finalSeries && (
                                            <MatchCard
                                                series={finalSeries}
                                                leagueTeams={leagueTeams}
                                                myTeamId={myTeamId}
                                                selected={selectedId === finalSeries.id}
                                                isFinalRound
                                                onClick={() => finalSeries.lowerSeedId !== 'BYE' && toggle(finalSeries.id)}
                                                hoveredTeamId={hoveredTeamId}
                                                onHoverTeam={setHoveredTeamId}
                                            />
                                        )}
                                    </div>

                                    <StraightConnector highlighted={eastFinalConnHighlighted} />

                                    <BracketHalf
                                        byRound={eastByRound}
                                        rounds={confRounds}
                                        mirrored
                                        selectedId={selectedId}
                                        myTeamId={myTeamId}
                                        leagueTeams={leagueTeams}
                                        onToggle={toggle}
                                        hoveredTeamId={hoveredTeamId}
                                        onHoverTeam={setHoveredTeamId}
                                    />
                                </div>

                                {/* 우승 배너 — 브라켓 행(West/Final/East)의 flex 자식이 아니라
                                    absolute로 그 위에 겹쳐서 띄운다. 일반 흐름(mt-16)으로 두면
                                    브라켓 아래에 배너 높이만큼 페이지가 더 길어지는데, 브라켓 자체
                                    높이(1라운드 매치 수 기준) 안에도 빈 배경 공간이 있어서 그 위에
                                    겹쳐 보이게 하면 페이지가 그만큼 늘어나지 않는다. */}
                                {championTeam && (
                                    <div ref={bannerRef} className="absolute left-1/2 bottom-8 -translate-x-1/2 flex flex-col items-center gap-3">
                                        <img src="/images/final.webp" alt="트로피" className="w-48 h-48 object-contain" />
                                        <div className="text-lg font-bold text-amber-400 uppercase">
                                            {room?.season ?? ''} 챔피언
                                        </div>
                                        <div className="text-5xl font-black text-white">
                                            {championTeam.team_name}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Round headers — 바디와 분리된 영역, 패딩 없음 */}
                            <div
                                className="flex gap-0"
                                style={{ width: gridCols % 2 === 1
                                    ? `${Math.ceil(gridCols / 2) * MATCH_W + Math.floor(gridCols / 2) * CONN_W}px`
                                    : undefined
                                }}
                            >
                                {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                                    <React.Fragment key={r}>
                                        <div
                                            className="text-center text-sm font-black text-slate-500 uppercase"
                                            style={{ width: MATCH_W, flexShrink: 0 }}
                                        >
                                            {getRoundLabel(r, totalRounds)}
                                        </div>
                                        {r < totalRounds && <div style={{ width: CONN_W, flexShrink: 0 }} />}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Bracket grid — 패딩은 이 영역에만 적용 */}
                            <div
                                className="px-6 pt-5 pb-12"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: colTemplate,
                                    gridTemplateRows: `repeat(${r1Count}, ${ROW_H}px)`,
                                }}
                            >
                                {gridSeries.map(({ key, series: s, col, rowStart, rowSpan }) => (
                                    <div
                                        key={key}
                                        className="flex items-center"
                                        style={{
                                            gridColumn: col,
                                            gridRow: `${rowStart} / ${rowStart + rowSpan}`,
                                        }}
                                    >
                                        <MatchCard
                                            series={s}
                                            leagueTeams={leagueTeams}
                                            myTeamId={myTeamId}
                                            selected={selectedId === s.id}
                                            isFinalRound={s.round === totalRounds}
                                            onClick={() => s.lowerSeedId !== 'BYE' && toggle(s.id)}
                                            hoveredTeamId={hoveredTeamId}
                                            onHoverTeam={setHoveredTeamId}
                                        />
                                    </div>
                                ))}

                                {gridConns.map(({ key, col, rowStart, rowSpan }) => (
                                    <div
                                        key={key}
                                        style={{
                                            gridColumn: col,
                                            gridRow: `${rowStart} / ${rowStart + rowSpan}`,
                                        }}
                                    >
                                        <BracketConnector highlightedSide={highlightedConnKeysClassic.get(key) ?? null} />
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Backdrop ─────────────────────────────────────────────────── */}
            {/* 패널이 떠 있는 동안 뒤쪽 브라켓을 살짝 어둡게 해서 오버레이 시인성을 높인다.
                클릭하면 패널을 닫는 것도 오버레이 UX 관례상 자연스러워 같이 넣었다. */}
            {selectedSeries && (
                <div
                    className="absolute inset-0 bg-black/40 z-10 animate-in fade-in duration-200"
                    onClick={() => setSelectedId(null)}
                />
            )}

            {/* ── Side Panel ───────────────────────────────────────────────── */}
            {/* absolute 오버레이 — 예전엔 flex 형제라서 패널이 뜨면 브라켓 영역(flex-1)이
                그만큼 좁아져 유동폭 그리드가 다시 계산되며 레이아웃이 흔들렸다. 문서 흐름에서
                빼서 브라켓 위에 떠 있게 하면 브라켓 폭은 패널 표시 여부와 무관하게 그대로다. */}
            {selectedSeries && (
                <div className="absolute right-0 top-0 h-full w-72 border-l border-slate-800 bg-slate-800 flex flex-col overflow-hidden shadow-2xl z-20 animate-in slide-in-from-right duration-200">
                    {/* Header */}
                    <div className="px-4 py-4 border-b border-slate-700 flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-black text-white uppercase">
                                {selectedSeries.round === totalRounds
                                    ? '결승'
                                    : `${selectedSide === 'West' ? '서부 ' : selectedSide === 'East' ? '동부 ' : ''}${getSideRoundLabel(selectedSeries.round, confRounds)}`}
                            </span>
                            <button
                                onClick={() => setSelectedId(null)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={18} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="flex-1 text-2xl font-bold text-white text-center truncate">
                                {higherTeam?.team_abbr ?? 'TBD'}
                                {higherTeam && seedBySlug.has(higherTeam.team_slug) && (
                                    <span> ({seedBySlug.get(higherTeam.team_slug)})</span>
                                )}
                            </span>

                            <div className="text-2xl font-black text-white shrink-0">
                                {selectedSeries.higherSeedWins}-{selectedSeries.lowerSeedWins}
                            </div>

                            <span className="flex-1 text-2xl font-bold text-white text-center truncate">
                                {lowerTeam?.team_abbr ?? 'TBD'}
                                {lowerTeam && seedBySlug.has(lowerTeam.team_slug) && (
                                    <span> ({seedBySlug.get(lowerTeam.team_slug)})</span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* Games */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {selectedGames.length === 0 ? (
                            <div className="flex items-center justify-center h-24">
                                <span className="text-sm font-bold text-slate-600">경기 결과 없음</span>
                            </div>
                        ) : (
                            <div className="p-4 space-y-3">
                                {selectedGames.map((g, i) => {
                                    const final = isFinal(g, serverNow);
                                    const homeWon = final && g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                                    const awayWon = final && g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
                                    const tally = seriesTallies[i];
                                    return (
                                        <div
                                            key={g.id}
                                            onClick={() => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(g.id)}`)}
                                            className="rounded-lg bg-slate-700 border border-slate-600 px-3 py-2.5 cursor-pointer hover:border-slate-500 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-400 mb-2">
                                                <span className="shrink-0">{i + 1}차전</span>
                                                <div className="flex-1 border-t border-dashed border-slate-600" />
                                                {final ? (
                                                    <span className="shrink-0">시리즈 {tally.higher}:{tally.lower}</span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 shrink-0 text-red-400">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                        LIVE
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`text-lg font-bold uppercase ${awayWon ? 'text-emerald-400' : 'text-white'}`}>
                                                    {g.awayTeamId}
                                                </span>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {final ? (
                                                        <>
                                                            <span className={`text-lg font-bold ${awayWon ? 'text-emerald-400' : 'text-slate-400'}`}>{g.awayScore}</span>
                                                            <span className="text-slate-500">-</span>
                                                            <span className={`text-lg font-bold ${homeWon ? 'text-emerald-400' : 'text-slate-400'}`}>{g.homeScore}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-lg font-black text-red-400">LIVE</span>
                                                    )}
                                                </div>

                                                <span className={`text-lg font-bold uppercase ${homeWon ? 'text-emerald-400' : 'text-white'}`}>
                                                    {g.homeTeamId}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TournamentBracketView;
