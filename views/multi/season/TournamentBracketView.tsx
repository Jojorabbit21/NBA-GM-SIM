
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PlayoffSeries, Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { useServerClock } from '../../../utils/serverClock';
import { isFinal, isStarted, getGameDisplayState, computeRevealedSeries } from './multiGameReveal';
import { kstDateKey, fmtTime } from './multiScheduleUtils';
import { Table, TableBody, TableRow, TableCell } from '../../../components/common/Table';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { IconButton } from '../../../components/common/IconButton';
import { TEAM_DATA } from '../../../data/teamData';
import { VIRTUAL_TEAMS } from '../../../data/virtualTeams';

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

// 사이드패널 경기 카드용 연고지명. team_slug는 실제 팀(TEAM_DATA) 또는 가상 확장팀(VIRTUAL_TEAMS)
// 둘 중 하나라 연고지는 고정값(TeamSettingsPanel.resolveCity와 동일 원칙). 둘 다 없으면 리그 팀명의
// 첫 어절(leagueService가 `${city} ${name}`으로 생성 — statsMappers.regionOf와 같은 가정) → 약어 폴백.
function cityOfTeam(slug: string, team: LeagueTeamRow | undefined): string {
    const fixed = TEAM_DATA[slug]?.city ?? VIRTUAL_TEAMS.find(t => t.team_slug === slug)?.city;
    if (fixed) return fixed;
    const first = team?.team_name?.trim().split(/\s+/)[0];
    return first || team?.team_abbr || slug.toUpperCase();
}

// [2026-10-13] 팀 호버 시 그 팀의 진출 경로 전체(슬롯 링·brightness, 비호버 팀 opacity-30, 커넥터·파이널
// 연결선 하이라이트)를 켜는 기능. 사용자 요청으로 비활성화 — 코드는 유지하고 이 플래그만 false.
// true로 되돌리면 메인 컴포넌트의 onHoverTeam이 다시 setHoveredTeamId로 연결된다.
const TEAM_HOVER_HIGHLIGHT_ENABLED = false;
const noopHover = (_teamId: string | null) => {};

// 시리즈 창을 열 수 있는 카드인가 — 양쪽 팀이 모두 확정된 매치만. 빈 카드(TBD/TBD), 한쪽만 찬 카드
// (팀/TBD), 부전승(BYE)은 경기 목록이 없거나 의미가 없으므로 클릭해도 열지 않는다.
function isSeriesOpenable(s: PlayoffSeries): boolean {
    return s.higherSeedId !== 'TBD' && s.lowerSeedId !== 'TBD' && s.lowerSeedId !== 'BYE';
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

// 카드 그리드의 컬럼 트랙 템플릿. 카드 컬럼은 minmax(MATCH_W, 1fr), 커넥터 컬럼은 고정 CONN_W.
function buildColTemplate(rounds: number): string {
    return Array.from({ length: 2 * rounds - 1 }, (_, i) =>
        i % 2 === 0 ? `minmax(${MATCH_W}px, 1fr)` : `${CONN_W}px`,
    ).join(' ');
}

// ── Team Logo Img ─────────────────────────────────────────────────────────────
// ── Team Slot ─────────────────────────────────────────────────────────────────

const TeamSlot: React.FC<{
    teamId: string;
    wins: number;
    showWins: boolean;
    isWinner: boolean;
    finished: boolean;
    isMe: boolean;
    isChampion: boolean;
    /** 파이널 카드의 TBD 슬롯은 slate 대신 메탈 골드 바탕 */
    goldTbd?: boolean;
    /** 팀 슬러그 → 컨퍼런스 내 원 시드(1위…). 없거나 매핑이 없으면 시드 미표시 */
    seedBySlug?: Map<string, number>;
    leagueTeams: LeagueTeamRow[];
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
}> = ({ teamId, wins, showWins, isWinner, finished, isMe, isChampion, goldTbd, seedBySlug, leagueTeams, hoveredTeamId, onHoverTeam }) => {
    if (teamId === 'BYE') return null;

    if (teamId === 'TBD') {
        return (
            <div
                className={`relative overflow-hidden flex items-center px-4 py-4 ${goldTbd ? '' : 'bg-slate-800'}`}
                style={goldTbd ? { background: FINAL_TBD_GOLD_BG, color: 'rgba(45, 30, 4, .78)' } : undefined}
            >
                <span className={`text-xl font-bold flex-1 ${goldTbd ? '' : 'text-slate-600'}`}>TBD</span>
                <SlotVolumeOverlay />
            </div>
        );
    }

    const team = leagueTeams.find(t => t.team_slug === teamId);
    const label = team?.team_abbr ?? teamId.toUpperCase();
    const seed = seedBySlug?.get(teamId);
    const isEliminated = finished && !isWinner;
    // 탈락 팀은 팀 컬러 대신 통일된 slate 톤으로 — 취소선 없이 배경/텍스트 색만으로 구분한다.
    const bgColor = isEliminated ? '#1e293b' /* slate-800 */ : (team?.color_primary ?? '#1e293b');
    const textColor = isEliminated ? '#64748b' /* slate-500 */ : (team?.color_text ?? '#e2e8f0');
    const isHighlighted = hoveredTeamId === teamId;
    const isDimmed = hoveredTeamId !== null && !isHighlighted;

    // 로고는 슬롯 높이(≈60px)보다 크게(64px) 키워 왼쪽 가장자리에 걸치게 두고 overflow-hidden으로
    // 잘라낸다 — absolute로 띄워 텍스트 흐름에서 빼고, 팀명은 로고 폭만큼 왼쪽 여백(pl)을 둔다.
    // 링(챔피언/내 팀/호버)은 슬롯 자체가 아니라 맨 위 오버레이에 그린다 — inset box-shadow는 자식보다
    // 아래에 칠해지므로 슬롯에 두면 확대된 로고가 링을 덮어 가린다.
    const ringClass = isHighlighted
        ? 'ring-2 ring-inset ring-sky-400'
        : isChampion ? 'ring-2 ring-inset ring-amber-400'
        : isMe ? 'ring-2 ring-inset ring-white/70'
        : '';
    return (
        <div
            className={`relative overflow-hidden flex items-center justify-between gap-2 px-4 py-4 transition-all ${
                isHighlighted ? 'brightness-110' : ''
            } ${isDimmed ? 'opacity-30' : ''}`}
            style={{ backgroundColor: bgColor, color: textColor }}
            onMouseEnter={() => onHoverTeam(teamId)}
            onMouseLeave={() => onHoverTeam(null)}
        >
            <TeamLogo
                teamId={teamId}
                teamName={label}
                size="custom"
                className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-16 h-16 ${isEliminated ? 'opacity-40 grayscale' : ''}`}
                shadow={false}
            />
            <span className="flex items-start gap-1 min-w-0 pl-[52px]">
                <span className="text-xl font-bold truncate">
                    {label}
                </span>
                {seed !== undefined && (
                    <span className="text-xs font-semibold tabular-nums leading-none mt-0.5 opacity-70 shrink-0">{seed}</span>
                )}
            </span>
            {showWins && (
                <span className="text-xl font-black tabular-nums shrink-0">
                    {wins}
                </span>
            )}
            <SlotVolumeOverlay className={ringClass} />
        </div>
    );
};

// 슬롯 볼륨감: 상단 흰빛(14%) → 중간 투명 → 하단 검정(12%) 반투명 세로 그라데이션을 한 겹 덮는다.
// 팀 컬러/골드/slate 어떤 배경에도 같은 비율로 얹혀 톤이 일관되고, pointer-events: none이라 호버/클릭 무관.
// 슬롯의 최상위 레이어이므로 링(ring-inset) 클래스도 여기에 얹어야 확대 로고 위에 보인다.
const SlotVolumeOverlay: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div
        className={`absolute inset-0 pointer-events-none transition-shadow ${className}`}
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,.12) 100%)' }}
    />
);

// 브라켓(좌/우 대칭 모드) 배경 — 왼쪽 끝 blue-500 20% → 중앙 투명 → 오른쪽 끝 red-500 20%.
// 서부/동부 제목색(blue-300/red-300)과 같은 계열이라 "진영 테마"로 읽히되, 카드/텍스트 대비를 해치지 않는 수준.
const CONFERENCE_THEME_BG = 'linear-gradient(90deg, rgba(59,130,246,.20) 0%, rgba(59,130,246,.07) 22%, rgba(15,23,42,0) 35%, rgba(15,23,42,0) 65%, rgba(239,68,68,.07) 78%, rgba(239,68,68,.20) 100%)';

// 파이널 카드 TBD 슬롯 바탕 — 짙은 금 두 톤을 완만한 대각선으로 섞은 "두께 없는 금속판"(입체 레이어 없음).
const FINAL_TBD_GOLD_BG = 'linear-gradient(100deg, #7d5f12 0%, #9a7414 50%, #7d5f12 100%)';

// 파이널 라벨 텍스트용 메탈릭 골드 — 밝은 하이라이트 → 골드 → 짙은 금 → 골드 → 하이라이트 세로(0deg) 그라데이션을 글자에 클리핑.
const FINAL_LABEL_GOLD_STYLE: React.CSSProperties = {
    background: 'linear-gradient(0deg, #fff3b0 0%, #f5c542 28%, #b8860b 52%, #f5c542 72%, #fff3b0 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#fbbf24',
    filter: 'drop-shadow(0 1px 0 rgba(120, 80, 0, .55))',
};

// ── Match Card ────────────────────────────────────────────────────────────────

const MatchCard: React.FC<{
    series: PlayoffSeries;
    leagueTeams: LeagueTeamRow[];
    myTeamId: string | null;
    selected: boolean;
    isFinalRound: boolean;
    onClick: (e: React.MouseEvent<HTMLElement>) => void;
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
    seedBySlug?: Map<string, number>;
}> = ({ series, leagueTeams, myTeamId, selected, isFinalRound, onClick, hoveredTeamId, onHoverTeam, seedBySlug }) => {
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
                <span className="flex items-center gap-2 min-w-0">
                    <TeamLogo teamId={series.higherSeedId} teamName={team?.team_abbr ?? series.higherSeedId.toUpperCase()} size="custom" className="w-6 h-6 shrink-0" shadow={false} />
                    <span className="text-xl font-bold truncate">
                        {team?.team_abbr ?? series.higherSeedId.toUpperCase()}
                    </span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-black/25 ml-2 shrink-0">부전승</span>
            </div>
        );
    }

    return (
        <div
            data-series-card=""
            className={`w-full overflow-hidden border transition-all select-none ${
                // 호버 효과는 슬롯이 아니라 카드 전체에 — 열 수 있는(양 팀 확정) 카드만 밝아지고 테두리가 연결선 색으로.
                // 호버/선택 시 2px 두께는 border를 2px로 바꾸지 않고(레이아웃 1px씩 밀림) 1px border + 1px ring-inset
                // 같은 색으로 합쳐서 낸다 — 카드 크기가 변하지 않는다.
                isSeriesOpenable(series) ? 'cursor-pointer hover:brightness-110' : 'cursor-default'
            } ${
                selected
                    ? 'border-indigo-500 ring-1 ring-inset ring-indigo-500 bg-slate-800'
                    : isFinalRound
                    ? `border-amber-600/60 bg-slate-900 ${isSeriesOpenable(series) ? 'hover:border-amber-400 hover:ring-1 hover:ring-inset hover:ring-amber-400' : ''}`
                    : `border-slate-700/50 bg-slate-900 ${isSeriesOpenable(series) ? 'hover:border-slate-300 hover:ring-1 hover:ring-inset hover:ring-slate-300' : ''}`
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
                goldTbd={isFinalRound}
                seedBySlug={seedBySlug}
                leagueTeams={leagueTeams}
                hoveredTeamId={hoveredTeamId}
                onHoverTeam={onHoverTeam}
            />
            <TeamSlot
                teamId={series.lowerSeedId}
                wins={series.lowerSeedWins}
                showWins={showWins}
                isWinner={series.winnerId === series.lowerSeedId}
                finished={series.finished}
                isMe={series.lowerSeedId === myTeamId}
                isChampion={isFinalRound && series.finished && series.winnerId === series.lowerSeedId}
                goldTbd={isFinalRound}
                seedBySlug={seedBySlug}
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
    // 기본 slate-300, 호버(진출 경로) white — StraightConnector(border-slate-300 / border-white)와 같은 쌍으로 유지할 것
    const colorOf = (on: boolean) => (on ? 'rgb(255,255,255)' : 'rgb(203,213,225)');
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
// 양옆 BracketHalf/파이널 열의 상단에는 제목 행(TITLE_H)+라운드 라벨 여유 행(LABEL_H)이 있으므로,
// 그만큼 paddingTop을 줘야 선이 카드 행 영역의 정중앙(=컨퍼런스 파이널 카드·파이널 카드 중심)에 온다.
const StraightConnector: React.FC<{ highlighted?: boolean }> = ({ highlighted }) => (
    <div className="self-stretch flex items-center" style={{ width: CONN_W, flexShrink: 0, paddingTop: TITLE_H + LABEL_H }}>
        <div className={`w-full border-t transition-colors ${highlighted ? 'border-white border-t-2' : 'border-slate-300'}`} />
    </div>
);

const MATCH_W = 150; // px — match card column minimum width (minmax(MATCH_W, 1fr)의 하한)
const CONN_W  = 48;  // px — connector column width
const ROW_H   = 140; // px — one R1 match row height
const TITLE_H = 56;  // px — 그리드 1행: 서부/동부 컨퍼런스 · {시즌} PLAYOFFS 제목 행(text-5xl=48px이 들어가도록 56)
const LABEL_H = 40;  // px — 그리드 2행: 1라운드 라벨이 카드 위에 떠 있을 여유 행(제목과 한 줄 띄움)
// 양 진영/파이널 열이 공유하는 행 템플릿 — 제목 행 + 라벨 여유 행 + 1라운드 매치 수만큼의 카드 행
const buildRowTemplate = (r1Count: number) => `${TITLE_H}px ${LABEL_H}px repeat(${Math.max(r1Count, 1)}, ${ROW_H}px)`;
const CARD_ROW_START = 3; // 카드 행이 시작하는 grid-row 라인(1행 제목, 2행 라벨 여유 다음)

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
    /** 그리드 1행에 그릴 진영 제목(예: "서부 컨퍼런스")과 글자색 클래스 */
    title: string;
    titleClassName: string;
    selectedId: string | null;
    myTeamId: string | null;
    leagueTeams: LeagueTeamRow[];
    onToggle: (id: string, e: React.MouseEvent<HTMLElement>) => void;
    hoveredTeamId: string | null;
    onHoverTeam: (teamId: string | null) => void;
    seedBySlug?: Map<string, number>;
}> = ({ byRound, rounds, mirrored, title, titleClassName, selectedId, myTeamId, leagueTeams, onToggle, hoveredTeamId, onHoverTeam, seedBySlug }) => {
    const r1Count = (byRound.get(1) ?? []).length;

    // rowStart는 카드 행 영역 기준(1부터)이고, 실제 grid-row는 CARD_ROW_START만큼 밀린다(위에 제목/라벨 행).
    // isFirst(=그 라운드의 첫 매치)에만 라운드 라벨을 카드 바로 위에 띄운다.
    const gridSeries = useMemo(() => {
        const items: { key: string; series: PlayoffSeries; col: number; rowStart: number; rowSpan: number; isFirst: boolean; round: number }[] = [];
        for (const [round, arr] of byRound) {
            const rowStep = Math.pow(2, round - 1);
            arr.forEach((s, m) => {
                items.push({ key: s.id, series: s, col: 2 * round - 1, rowStart: m * rowStep + 1, rowSpan: rowStep, isFirst: m === 0, round });
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

    // 제목/라운드 라벨은 별도 헤더 테이블이 아니라 이 카드 그리드 안에서 함께 그린다 —
    // 1행 진영 제목(전체 열 span), 2행은 1라운드 라벨이 떠 있을 여유 행, 3행부터 카드.
    // 라운드 라벨은 각 라운드의 첫 카드 바로 위에 absolute로 붙어, 2라운드/컨퍼런스 파이널
    // 라벨이 해당 카드와 함께 세로 중앙으로 내려온다(어느 카드가 몇 라운드인지 바로 읽힘).
    // flex: rounds 1 0% — 서부/동부(BracketHalf)가 파이널 컬럼(flex: 1 1 0%)과 "카드 1개당
    // 성장량"이 똑같아지도록 라운드 개수만큼 가중치를 준다.
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
                        gridTemplateRows: buildRowTemplate(r1Count),
                    }}
                >
                    <div
                        className={`flex items-center justify-center text-3xl font-semibold ${titleClassName}`}
                        style={{ gridColumn: '1 / -1', gridRow: 1, ...(mirrored ? { transform: 'scaleX(-1)' } : {}) }}
                    >
                        {title}
                    </div>

                    {gridSeries.map(({ key, series: s, col, rowStart, rowSpan, isFirst, round }) => (
                        <div
                            key={key}
                            className="flex items-center"
                            style={{ gridColumn: col, gridRow: `${rowStart + CARD_ROW_START - 1} / ${rowStart + rowSpan + CARD_ROW_START - 1}` }}
                        >
                            {/* mirrored면 글자가 있는 이 래퍼만 한 번 더 뒤집어 원상복구. relative는 라운드 라벨의 기준점. */}
                            <div className="relative" style={mirrored ? { transform: 'scaleX(-1)', width: '100%' } : { width: '100%' }}>
                                {isFirst && (
                                    <div className="absolute inset-x-0 bottom-full mb-2.5 text-center text-lg font-bold tracking-wide text-slate-400 whitespace-nowrap">
                                        {getSideRoundLabel(round, rounds)}
                                    </div>
                                )}
                                <MatchCard
                                    series={s}
                                    leagueTeams={leagueTeams}
                                    myTeamId={myTeamId}
                                    selected={selectedId === s.id}
                                    isFinalRound={false}
                                    onClick={e => isSeriesOpenable(s) && onToggle(s.id, e)}
                                    hoveredTeamId={hoveredTeamId}
                                    onHoverTeam={onHoverTeam}
                                    seedBySlug={seedBySlug}
                                />
                            </div>
                        </div>
                    ))}

                    {gridConns.map(({ key, col, rowStart, rowSpan }) => (
                        <div key={key} style={{ gridColumn: col, gridRow: `${rowStart + CARD_ROW_START - 1} / ${rowStart + rowSpan + CARD_ROW_START - 1}` }}>
                            <BracketConnector highlightedSide={highlightedConnKeys.get(key) ?? null} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Series Window ─────────────────────────────────────────────────────────────
//
// 브라켓 카드를 클릭하면 그 자리에 뜨는 작은 플로팅 창(시리즈 경기 목록). 예전 우측 사이드패널
// (w-96 + bg-black/40 백드롭)을 대체 — 백드롭이 없으므로 창이 떠 있어도 브라켓 호버/클릭이 그대로 된다.
// PlayerHoverCard와 같은 createPortal + position:fixed + 뷰포트 클램핑 방식에 헤더 드래그 이동을 더했다.
// 폭은 내용에 맞춰 가변(w-max) — 헤더 제목과 표 중 더 넓은 쪽이 폭을 결정하고, 상한은 뷰포트.
// 표는 공용 Table(card 변형, density=compact) 그대로라 테이블 컨벤션 변경을 자동으로 따라간다.

type SeriesWindowRow = {
    key: string;
    gameNo: number;
    /** yy.mm.dd — 미정 경기는 '미정' */
    dateLabel: string;
    awayName: string;
    homeName: string;
    awayWon: boolean;
    homeWon: boolean;
    state: 'final' | 'live' | 'scheduled';
    awayScore?: number;
    homeScore?: number;
    /** scheduled 전용 — 경기 시각(HH:mm) */
    timeLabel?: string;
    /** 현재 승수로는 열릴지 확정되지 않은 경기(시리즈 조기 종료 가능) */
    undecided: boolean;
    onOpen: () => void;
};

const WINDOW_MARGIN = 12; // px — 뷰포트 가장자리 여백
const WINDOW_GAP = 8;     // px — 카드와 창 사이 간격

/** 창이 처음 열릴 기준 — 클릭한 카드의 뷰포트 사각형과 펼칠 방향.
 *  카드가 화면 왼쪽 절반이면 카드 오른쪽으로(right), 오른쪽 절반이면 카드 왼쪽으로(left) 펼쳐
 *  서부/동부 어느 쪽을 눌러도 창이 카드를 가리지 않고 중앙 쪽으로 열린다. */
type WindowAnchor = { left: number; right: number; top: number; placement: 'right' | 'left' };

function clampToViewport(x: number, y: number, w: number, h: number): { x: number; y: number } {
    return {
        x: Math.max(WINDOW_MARGIN, Math.min(x, window.innerWidth - w - WINDOW_MARGIN)),
        y: Math.max(WINDOW_MARGIN, Math.min(y, window.innerHeight - h - WINDOW_MARGIN)),
    };
}

const SeriesWindow: React.FC<{
    roundLabel: string;
    lowerName: string;
    higherName: string;
    lowerWins: number;
    higherWins: number;
    rows: SeriesWindowRow[];
    /** 처음 열릴 기준(클릭한 카드 사각형 + 방향) — 바뀌면 그 위치로 다시 이동 */
    anchor: WindowAnchor;
    onClose: () => void;
}> = ({ roundLabel, lowerName, higherName, lowerWins, higherWins, rows, anchor, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    // 위치는 React 상태가 아니라 ref + DOM transform으로만 관리한다 — 예전엔 pointermove마다 상태 갱신으로
    // 재렌더(표 행 + TableCell 컨텍스트 조회 전부)하고 left/top을 바꿔 레이아웃+큰 그림자 페인트가
    // 프레임마다 돌아 드래그가 심하게 끊겼다. transform은 합성(compositor)만 타서 그림자도 재페인트하지 않는다.
    const posRef = useRef({ x: anchor.right + WINDOW_GAP, y: anchor.top });
    const dragRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null);
    const applyPos = (x: number, y: number) => {
        posRef.current = { x, y };
        if (ref.current) ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    // 앵커가 바뀌면(다른 카드 클릭) 그 위치로 옮기고, 실측 크기로 뷰포트 안에 넣는다.
    // 내용(rows)이 바뀌어 폭이 달라져도 다시 클램프.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        const x = anchor.placement === 'right' ? anchor.right + WINDOW_GAP : anchor.left - WINDOW_GAP - w;
        const p = clampToViewport(x, anchor.top, w, h);
        applyPos(p.x, p.y);
    }, [anchor, rows.length]);

    // 창 바깥을 누르면 닫는다. 브라켓 카드(data-series-card) 위 클릭은 제외 — 카드 클릭은 toggle이
    // "같은 카드면 닫기 / 다른 카드면 이동"을 처리하므로 여기서 먼저 닫아 버리면 같은 카드 재클릭이
    // 닫힘→다시 열림으로 꼬인다. pointerdown 캡처 단계라 포털 밖 어디를 눌러도 잡힌다.
    useEffect(() => {
        const onDocPointerDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t || ref.current?.contains(t) || t.closest('[data-series-card]')) return;
            onClose();
        };
        document.addEventListener('pointerdown', onDocPointerDown, true);
        return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
    }, [onClose]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return; // 닫기 버튼은 드래그 시작 안 함
        const el = ref.current;
        if (!el) return;
        // 크기는 드래그 시작 때 한 번만 재서 이동 중 offsetWidth/Height(강제 레이아웃) 조회를 피한다
        dragRef.current = { dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y, w: el.offsetWidth, h: el.offsetHeight };
        el.style.willChange = 'transform';
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        if (!d) return;
        const p = clampToViewport(e.clientX - d.dx, e.clientY - d.dy, d.w, d.h);
        applyPos(p.x, p.y);
    };
    const endDrag = () => {
        dragRef.current = null;
        if (ref.current) ref.current.style.willChange = '';
    };

    return createPortal(
        <div
            ref={ref}
            role="dialog"
            aria-label="시리즈 경기 목록"
            className="fixed left-0 top-0 z-50 w-max min-w-[280px] max-w-[calc(100vw-32px)] bg-slate-900 border border-slate-800 shadow-[0_18px_40px_rgba(0,0,0,.55),0_0_0_1px_rgba(0,0,0,.4)]"
            style={{ transform: `translate3d(${anchor.right + WINDOW_GAP}px, ${anchor.top}px, 0)` }}
        >
            {/* 헤더: 라운드 · 하위시드 n - m 상위시드 · 닫기. 드래그 핸들 */}
            <div
                className="flex items-center gap-3 pl-3 pr-1.5 py-1.5 bg-slate-950 border-b border-slate-800 cursor-grab active:cursor-grabbing select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <span className="text-sm font-bold text-slate-400 whitespace-nowrap">{roundLabel}</span>
                <span className="flex-1 text-sm font-semibold text-slate-200 whitespace-nowrap">
                    {lowerName} <b className="font-bold text-white tabular-nums">{lowerWins} - {higherWins}</b> {higherName}
                </span>
                <IconButton label="닫기" size="md" tone="subtle" onClick={onClose}>
                    <X size={16} />
                </IconButton>
            </div>

            {rows.length === 0 ? (
                <div className="px-4 py-3 text-xs font-semibold text-slate-500">경기 일정 없음</div>
            ) : (
                <Table density="compact" fullHeight={false} className="!rounded-none !shadow-none !border-0">
                    <TableBody>
                        {rows.map(r => {
                            const dim = r.state === 'scheduled';
                            const base = `text-xs ${dim ? 'text-slate-500' : 'text-slate-200'}`;
                            return (
                                <TableRow key={r.key}>
                                    <TableCell align="left" className={`${base} font-semibold`}>Game {r.gameNo}</TableCell>
                                    <TableCell align="left" className={`${base} font-semibold tabular-nums`}>{r.dateLabel}</TableCell>
                                    <TableCell align="left" className={`${base} font-semibold`}>
                                        <span className={r.awayWon ? 'text-emerald-400' : ''}>{r.awayName}</span>
                                        <span className="text-slate-500 mx-1">@</span>
                                        <span className={r.homeWon ? 'text-emerald-400' : ''}>{r.homeName}</span>
                                    </TableCell>
                                    <TableCell align="left" className={`${base} font-semibold tabular-nums`}>
                                        {r.state === 'final' ? (
                                            <button
                                                type="button"
                                                onClick={r.onOpen}
                                                className="group/score cursor-pointer text-slate-400 hover:text-indigo-400 hover:underline tabular-nums"
                                                title="박스스코어 보기"
                                            >
                                                <span className={r.awayWon ? 'text-emerald-400 group-hover/score:text-indigo-400' : ''}>{r.awayScore}</span>
                                                -
                                                <span className={r.homeWon ? 'text-emerald-400 group-hover/score:text-indigo-400' : ''}>{r.homeScore}</span>
                                            </button>
                                        ) : r.state === 'live' ? (
                                            <button
                                                type="button"
                                                onClick={r.onOpen}
                                                className="inline-flex items-center gap-1.5 font-bold text-red-400 cursor-pointer hover:underline"
                                                title="실시간 중계 보기"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                LIVE
                                            </button>
                                        ) : (
                                            <span className="font-medium">{r.timeLabel ?? '—'}</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>,
        document.body,
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

const TournamentBracketView: React.FC<Props> = ({ series, schedule, leagueTeams, myTeamId }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
    // 플래그 off면 호버가 상태를 건드리지 않아 hoveredTeamId가 항상 null → 하이라이트 로직 전부 휴면
    const onHoverTeam = TEAM_HOVER_HIGHLIGHT_ENABLED ? setHoveredTeamId : noopHover;
    const serverNow = useServerClock();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { room, league } = useLeagueContext();
    // 메인리그 정규시즌/플레이오프는 가상 캘린더 날짜·시각을 보여준다(실행 시각 scheduledAt 노출 금지 — multiScheduleUtils 규칙과 동일)
    const preferVirtual = league?.type === 'main_league';
    // 시리즈 창이 처음 열릴 뷰포트 좌표(클릭한 카드의 오른쪽 위)
    const [windowAnchor, setWindowAnchor] = useState<WindowAnchor>({ left: WINDOW_MARGIN, right: WINDOW_MARGIN, top: WINDOW_MARGIN, placement: 'right' });
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

    // 좌/우 대칭 렌더링은 1라운드가 "동부 매치들이 앞쪽 연속 구간, 서부 매치들이 뒤쪽 연속
    // 구간"(또는 그 반대)으로 완전히 분리돼 있을 때만 안전하다 — main_league 플레이오프
    // (playoffSeeder.ts)는 East N팀/West N팀을 미리 앞/뒤로 나눠 배치해서 이 구조를 보장하지만,
    // tournament 타입 리그(tournamentInitializer.ts)는 참가팀 전체를 컨퍼런스 구분 없이 랜덤
    // 셔플하므로(seedMode 기본값 'random') 이 구조가 보장되지 않는다 — 1라운드부터 동/서부
    // 팀이 섞여 붙을 수 있다. 예전엔 "1라운드에 East/West가 하나라도 섞여 있으면 split"으로만
    // 판별했는데, 그러면 위 tournament 케이스에서 sideByKey 전파(다음 라운드 부모의 두 자식
    // 매치 진영이 다를 때 하나를 임의로 버림)가 깨져서 라운드가 진행될수록 매치가 뒤섞이거나
    // 격자 밖(그리드 template 행 수를 넘어서는 자리)으로 밀려나 사라지는 버그가 있었다
    // (2026-09-10 발견). 그래서 여기서는 1라운드 매치들을 matchIndex 오름차순으로 봤을 때
    // 정확히 "East 블록 하나 + West 블록 하나"(전환점 1번)로만 이루어지는지 구조적으로 검증하고,
    // 아니면 조건 없이 일반 단일 브라켓(컨퍼런스 무관, 항상 정확)으로 폴백한다.
    const isSplit = useMemo(() => {
        if (totalRounds < 2) return false;
        const r1 = byRound.get(1) ?? [];
        if (r1.length === 0) return false;
        const sides = r1.map(s => {
            const hi = s.higherSeedId === 'TBD' ? null : confBySlug.get(s.higherSeedId);
            const lo = s.lowerSeedId === 'BYE' ? hi : (s.lowerSeedId === 'TBD' ? null : confBySlug.get(s.lowerSeedId));
            if (hi && lo) return hi === lo ? hi : null; // 두 팀 다 알려졌는데 컨퍼런스가 다르면(크로스 컨퍼런스 매치) 무효
            return hi ?? lo ?? null; // 한쪽만 알려졌으면(플레이인 대기 등) 알려진 쪽의 컨퍼런스를 신뢰
        });
        if (sides.some(s => s === null)) return false;
        if (new Set(sides).size !== 2) return false;
        let transitions = 0;
        for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i - 1]) transitions++;
        return transitions === 1;
    }, [byRound, confBySlug, totalRounds]);

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

    // 선택 시리즈의 전체 경기(예정 포함) — 서버가 최대 경기 수만큼 미리 만들어 두므로 미진행 경기도
    // 날짜/시각을 갖는다. 시리즈가 끝났으면 남은 경기는 시뮬되지 않으니 시작된 경기만 남긴다.
    const selectedGames = useMemo(() => {
        if (!selectedId || !selectedSeries) return [];
        const all = schedule
            .filter(g => g.seriesId === selectedId)
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date));
        return selectedSeries.finished ? all.filter(g => isStarted(g, serverNow)) : all;
    }, [schedule, selectedId, selectedSeries, serverNow]);

    // 시리즈 창 행 데이터. 종료 경기 → 스코어 링크, 진행 중 → LIVE 링크, 예정 → 시각.
    // '미정': 현재 승수로 시리즈가 끝날 수 있는 가장 이른 경기(종료 경기 수 + 선두가 더 필요한 승수)
    // 보다 뒤의 경기 — 날짜 대신 '미정'으로 표기한다(예: 7전제 3-2면 Game 6 확정, Game 7 미정).
    const seriesRows = useMemo<SeriesWindowRow[]>(() => {
        if (!selectedSeries) return [];
        const finals = selectedGames.filter(g => isFinal(g, serverNow)).length;
        const lead = Math.max(selectedSeries.higherSeedWins, selectedSeries.lowerSeedWins);
        const earliestEnd = finals + Math.max(selectedSeries.targetWins - lead, 0);
        return selectedGames.map((g, i) => {
            const state = getGameDisplayState(g, serverNow);
            const final = state === 'final' && g.homeScore != null && g.awayScore != null;
            const awayWon = final && g.awayScore! > g.homeScore!;
            const homeWon = final && g.homeScore! > g.awayScore!;
            const undecided = state === 'scheduled' && i + 1 > earliestEnd;
            const key = kstDateKey(g, preferVirtual); // YYYY-MM-DD
            return {
                key: g.id,
                gameNo: i + 1,
                dateLabel: undecided ? '미정' : `${key.slice(2, 4)}.${key.slice(5, 7)}.${key.slice(8, 10)}`,
                awayName: cityOfTeam(g.awayTeamId, leagueTeams.find(t => t.team_slug === g.awayTeamId)),
                homeName: cityOfTeam(g.homeTeamId, leagueTeams.find(t => t.team_slug === g.homeTeamId)),
                awayWon, homeWon, state,
                awayScore: g.awayScore, homeScore: g.homeScore,
                timeLabel: state === 'scheduled' ? fmtTime(g, preferVirtual) : undefined,
                undecided,
                onOpen: () => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(g.id)}`),
            };
        });
    }, [selectedSeries, selectedGames, serverNow, preferVirtual, leagueTeams, navigate, leagueId, getGameUrlId]);

    const higherTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.higherSeedId)
        : null;
    const lowerTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.lowerSeedId)
        : null;

    // 같은 카드를 다시 누르면 닫고, 다른 카드를 누르면 그 카드 옆으로 창을 옮기며 내용만 교체한다.
    // 카드 중심이 화면 왼쪽 절반이면 오른쪽으로, 오른쪽 절반이면 왼쪽으로 펼친다.
    const toggle = (id: string, e: React.MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const placement = (r.left + r.right) / 2 <= window.innerWidth / 2 ? 'right' : 'left';
        setWindowAnchor({ left: r.left, right: r.right, top: r.top, placement });
        setSelectedId(prev => prev === id ? null : id);
    };

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

    // 1라운드 매치 수 — 양 진영/파이널 열의 행 템플릿(buildRowTemplate) 공유 기준.
    const bracketR1Count = westByRound.get(1)?.length ?? eastByRound.get(1)?.length ?? 1;
    // 1라운드 매치가 적은 소규모 브라켓(총 4팀 등)은 파이널 카드 위 여유가 부족해 트로피를 축소한다.
    const compactTrophy = bracketR1Count < 4;

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
            {/* 좌/우 대칭 모드 배경: 서부(파랑)·동부(빨강) 테마를 양 끝에 은은하게 깐 가로 그라데이션.
                스크롤 컨테이너 자체의 배경이라 가로 스크롤 시에도 뷰포트에 고정돼 항상 좌=파랑/우=빨강으로 보인다.
                중앙 30%는 완전 투명(bg-slate-900 그대로)이라 파이널 열은 중립 톤을 유지. */}
            <div
                className="flex-1 overflow-auto min-h-0 bg-slate-900"
                style={isSplit ? { backgroundImage: CONFERENCE_THEME_BG } : undefined}
            >
                <div className="min-h-full">

                    {isSplit ? (
                        <>
                            {/* ── 서부 브라켓 / 파이널 열 / 동부 브라켓.
                                제목(서부 컨퍼런스 · {시즌} 플레이오프 · 동부 컨퍼런스)과 라운드 라벨은
                                별도 헤더 테이블 없이 각 열의 그리드(buildRowTemplate: 제목 행 + 라벨 여유 행
                                + 카드 행) 안에서 함께 그린다. 세 열이 같은 행 템플릿을 쓰므로 카드 중심선과
                                파이널 연결선(StraightConnector, paddingTop으로 보정)이 항상 일치한다. ── */}
                            <div className="relative px-6 pt-10 pb-12">
                                <div className="flex items-start justify-start gap-0 w-full">
                                    <BracketHalf
                                        byRound={westByRound}
                                        rounds={confRounds}
                                        mirrored={false}
                                        title="서부 컨퍼런스"
                                        titleClassName="text-blue-300"
                                        selectedId={selectedId}
                                        myTeamId={myTeamId}
                                        leagueTeams={leagueTeams}
                                        onToggle={toggle}
                                        hoveredTeamId={hoveredTeamId}
                                        onHoverTeam={onHoverTeam}
                                        seedBySlug={seedBySlug}
                                    />

                                    <StraightConnector highlighted={westFinalConnHighlighted} />

                                    {/* 파이널 열: 1열 그리드. 제목(1행) / 트로피(2행~, 상단 정렬) / 카드(3행~끝, 중앙)가
                                        행을 공유하며 겹치므로 전부 gridColumn: 1을 명시한다 — 안 주면 자동 배치가
                                        겹침을 피하려고 암묵적 2열을 만들어 카드가 반 폭이 된다. */}
                                    <div
                                        style={{
                                            flex: '1 1 0%',
                                            minWidth: MATCH_W,
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(0, 1fr)',
                                            gridTemplateRows: buildRowTemplate(bracketR1Count),
                                        }}
                                    >
                                        {/* Bebas Neue(font-display, tailwind.config)는 400 단일 굵기·대문자 전용 서체라 font-normal + 영문 PLAYOFFS */}
                                        <div
                                            className="flex items-center justify-center font-display text-5xl font-normal text-slate-200 whitespace-nowrap"
                                            style={{ gridColumn: 1, gridRow: 1 }}
                                        >
                                            {room?.season ?? ''} PLAYOFFS
                                        </div>

                                        {/* 우승 트로피 — 파이널 카드 "위" 빈 영역(라벨 여유 행 + 카드 행 상반부)에 둔다.
                                            예전 바디 bottom-8 absolute 배치는 브라켓 최하단에 붙어 보이는 증상이 있었음.
                                            세로 순서: 트로피 → 시즌 챔피언 → 팀명 → (파이널 라벨) → 파이널 카드. */}
                                        {championTeam && (
                                            <div
                                                className="flex flex-col items-center justify-start gap-1.5 pointer-events-none"
                                                style={{ gridColumn: 1, gridRow: `2 / ${Math.min(5, bracketR1Count + 3)}`, paddingTop: 6 }}
                                            >
                                                <img
                                                    src="/images/final.webp"
                                                    alt="트로피"
                                                    className={`object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,.45)] ${compactTrophy ? 'w-14 h-14' : 'w-[120px] h-[120px]'}`}
                                                />
                                                <div className={`font-bold text-amber-400 mt-1 ${compactTrophy ? 'text-xs' : 'text-sm'}`}>
                                                    {room?.season ?? ''} 챔피언
                                                </div>
                                                <div className={`font-black text-white text-center leading-tight ${compactTrophy ? 'text-lg' : 'text-[28px]'}`}>
                                                    {championTeam.team_name}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center" style={{ gridColumn: 1, gridRow: `${CARD_ROW_START} / -1` }}>
                                            <div className="relative w-full">
                                                {/* 파이널 라벨 — 다른 라운드와 같이 카드 위 부착, 메탈릭 골드 텍스트.
                                                    w-max + mx-auto: 그라데이션이 글자 폭에 정확히 걸치도록(폭이 넓으면 색 구간이 글자 밖으로 빠짐) */}
                                                <div
                                                    className="absolute inset-x-0 bottom-full mb-2.5 w-max mx-auto text-xl font-extrabold tracking-wide whitespace-nowrap"
                                                    style={FINAL_LABEL_GOLD_STYLE}
                                                >
                                                    파이널
                                                </div>
                                                {finalSeries && (
                                                    <MatchCard
                                                        series={finalSeries}
                                                        leagueTeams={leagueTeams}
                                                        myTeamId={myTeamId}
                                                        selected={selectedId === finalSeries.id}
                                                        isFinalRound
                                                        onClick={e => isSeriesOpenable(finalSeries) && toggle(finalSeries.id, e)}
                                                        hoveredTeamId={hoveredTeamId}
                                                        onHoverTeam={onHoverTeam}
                                                        seedBySlug={seedBySlug}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <StraightConnector highlighted={eastFinalConnHighlighted} />

                                    <BracketHalf
                                        byRound={eastByRound}
                                        rounds={confRounds}
                                        mirrored
                                        title="동부 컨퍼런스"
                                        titleClassName="text-red-300"
                                        selectedId={selectedId}
                                        myTeamId={myTeamId}
                                        leagueTeams={leagueTeams}
                                        onToggle={toggle}
                                        hoveredTeamId={hoveredTeamId}
                                        onHoverTeam={onHoverTeam}
                                        seedBySlug={seedBySlug}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Round headers — 바디와 분리된 영역, 좌우/하단 패딩은 없고 상단만 여백 */}
                            <div
                                className="flex gap-0 pt-4"
                                style={{ width: gridCols % 2 === 1
                                    ? `${Math.ceil(gridCols / 2) * MATCH_W + Math.floor(gridCols / 2) * CONN_W}px`
                                    : undefined
                                }}
                            >
                                {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                                    <React.Fragment key={r}>
                                        <div
                                            className="text-center text-2xl font-black text-white"
                                            style={{ width: MATCH_W, flexShrink: 0 }}
                                        >
                                            {getRoundLabel(r, totalRounds)}
                                        </div>
                                        {r < totalRounds && <div style={{ width: CONN_W, flexShrink: 0 }} />}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Bracket grid + 우승 표시 — 결승 라운드 카드는 고정폭(MATCH_W)이라
                                화면이 넓으면 그 오른쪽에 항상 빈 공간이 남는다. split 모드처럼
                                바닥에 겹쳐 띄우는 대신, 그 남는 공간에 결승 카드와 나란히
                                배치한다(사용자 요청). 패딩은 이 행 전체에만 적용. */}
                            <div className="flex items-center gap-10 px-6 pt-5 pb-12">
                                <div
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
                                                onClick={e => isSeriesOpenable(s) && toggle(s.id, e)}
                                                hoveredTeamId={hoveredTeamId}
                                                onHoverTeam={onHoverTeam}
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

                                {championTeam && (
                                    <div className="flex flex-col items-center gap-3 shrink-0">
                                        <img src="/images/final.webp" alt="트로피" className="w-40 h-40 object-contain" />
                                        <div className="text-base font-bold text-amber-400">
                                            {room?.season ?? ''} 챔피언
                                        </div>
                                        <div className="text-4xl font-black text-white text-center">
                                            {championTeam.team_name}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Series Window(플로팅) — 사이드패널/백드롭 대체. 라운드 라벨은 좌/우 대칭 모드면
                "서부 1라운드"식, 클래식 모드면 getRoundLabel, 결승은 '파이널'. ── */}
            {selectedSeries && (
                <SeriesWindow
                    roundLabel={selectedSeries.round === totalRounds
                        ? '파이널'
                        : isSplit
                            ? `${selectedSide === 'West' ? '서부 ' : selectedSide === 'East' ? '동부 ' : ''}${getSideRoundLabel(selectedSeries.round, confRounds)}`
                            : getRoundLabel(selectedSeries.round, totalRounds)}
                    lowerName={lowerTeam ? cityOfTeam(lowerTeam.team_slug, lowerTeam) : 'TBD'}
                    higherName={higherTeam ? cityOfTeam(higherTeam.team_slug, higherTeam) : 'TBD'}
                    lowerWins={selectedSeries.lowerSeedWins}
                    higherWins={selectedSeries.higherSeedWins}
                    rows={seriesRows}
                    anchor={windowAnchor}
                    onClose={() => setSelectedId(null)}
                />
            )}
        </div>
    );
};

export default TournamentBracketView;
