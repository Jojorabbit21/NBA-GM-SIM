
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Ban, Calendar, Check, GripVertical, Loader2, Minus, Plus, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { useLeagueRawStats } from '../../../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsBatch } from '../../../hooks/usePlayerSeasonStatsBatch';
import { usePlayerInjuryStatus } from '../../../hooks/usePlayerInjuryStatus';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { buildActiveInjurySeverityMap, formatPlayerActiveInjuryLabel } from '../../../services/multi/activeInjuryStatus';
import { useSeasonContext } from './seasonContext';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
import { TabBar } from '../../../components/common/TabBar';
import { Modal } from '../../../components/common/Modal';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { InjuryStatusBadge } from '../../../components/common/InjuryStatusBadge';
import { calculatePlayerOvr } from '../../../utils/constants';
import { getReadableTextColor } from '../../../utils/colorContrast';
import { formatMoney, formatMoneyFull } from '../../../utils/formatMoney';
import { ARCHETYPE_LABEL, type OvrArchetype } from '../../../utils/ovrEngine';
import {
    createTradeOffer, respondTradeOffer, markTradeOfferRead, listPendingTradeOffers, listAllPendingTradeOffers,
    listTradeHistory, listTradeBlocks, setTradeBlock, updateTeamTradeRequest,
    listMyResolvedTradeOffers, listAllResolvedTradeOffers,
    type TradeOfferRow, type TradeOfferAction,
} from '../../../services/multi/tradeService';
import type { Player } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

const DESIRED_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// React Query 데이터가 아직 없을 때(최초 로드 전) 쓰는 폴백 — 매 렌더마다 새 배열/Map을
// 만들면 참조가 계속 바뀌어 불필요한 재계산을 유발하므로 모듈 레벨 상수로 고정.
const EMPTY_TRADEABLE_MAP: Map<string, Set<string>> = new Map();
const EMPTY_OFFERS: TradeOfferRow[] = [];

// [2026-08-26] 아키타입 27종을 가드/윙/빅 3그룹으로 분류(UI 편의용 — utils/ovrEngine.ts의
// ARCHETYPE_CANDIDATES 위치별 후보 목록 기준, 여러 포지션에 걸치는 항목은 types/archetype.ts의
// 원 그룹 주석을 참고해 배정). 정밀한 엔진 분류가 아니라 사용자가 훑어보기 쉽게 나눈 것.
const ARCHETYPE_GROUPS: { label: string; keys: OvrArchetype[] }[] = [
    {
        label: '가드',
        keys: [
            'PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D',
            'FLOOR_GENERAL_GUARD', 'SCORING_POINT_GUARD', 'DEFENSIVE_GUARD', 'ISOLATION_SCORER',
            'ELITE_GUARD', 'LOCKDOWN_SHOOTER',
        ],
    },
    {
        label: '윙',
        keys: [
            'TWO_WAY_WING', 'SLASHING_WING', 'SHOT_CREATOR_WING', 'CONNECTOR_FORWARD',
            'AERIAL_WING', 'POST_SCORING_WING', 'WING_PROTECTOR', 'LOCKDOWN_WING',
            'THREE_LEVEL_SCORER',
        ],
    },
    {
        label: '빅',
        keys: [
            'POST_SCORING_BIG', 'RIM_RUNNER_BIG', 'STRETCH_BIG', 'RIM_PROTECTOR_ANCHOR',
            'PLAYMAKING_BIG', 'SWITCHABLE_ANCHOR', 'TWO_WAY_BIG', 'REBOUNDING_BIG',
            'ELBOW_OPERATOR',
        ],
    },
];

// [2026-08-31] 원래 '받은 제안'/'보낸 제안' 두 탭으로 나뉘어 있던 걸 'inbox' 하나로 통합
// (받은/보낸 대기 중 제안을 시간순으로 한 리스트에서 관리 — 싱글플레이 인박스처럼 굳이
// 탭을 나눌 필요 없는 성격이라 판단). 성사된 트레이드(history)는 완료된 기록 아카이브라
// 성격이 달라 별도 탭 유지.
type Tab = 'leagueBlocks' | 'inbox' | 'new' | 'history';

const TABS: { id: Tab; label: string }[] = [
    { id: 'new',          label: '새 제안' },
    { id: 'inbox',        label: '메세지함' },
    { id: 'leagueBlocks', label: '트레이드 블록' },
    { id: 'history',      label: '히스토리' },
];

const TAB_IDS: Tab[] = TABS.map(t => t.id);

// 인게임 날짜(YYYY-MM-DD)를 히스토리 테이블용 "yy/mm/dd" 형태로 축약 표시.
function formatSimDateShort(isoDate: string | null): string {
    if (!isoDate) return '-';
    const [y, m, d] = isoDate.split('-');
    return `${y.slice(2)}/${m}/${d}`;
}

// 168시간(7일) 만료까지 남은 시간을 "3일 4시간" 형태로 표시
function formatRemaining(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return '만료됨';
    const totalMinutes = Math.floor(ms / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    if (days > 0) return `${days}일 ${hours}시간 남음`;
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
    return `${minutes}분 남음`;
}

const STATUS_LABEL: Record<string, string> = {
    pending: '대기중', accepted: '수락됨', rejected: '거절됨',
    cancelled: '취소됨', expired: '만료됨', invalidated: '무효화됨',
};

// [2026-09-02] "메세지함" 좌측 리스트 상단 필터 — 뉴스피드(MultiNewsFeedView.tsx)의 필터
// 조합 방식과 동일하게 맞춤: 뉴스피드는 팀/타입/빅뉴스/날짜처럼 서로 다른 필터 "그룹"끼리는
// AND로 결합하고, 같은 그룹 안에서 여러 개 고르면 OR로 묶인다(예: 타입 여러 개 선택 시
// 그 타입들 중 하나라도 맞으면 통과, 팀 필터도 동시에 걸려 있으면 그 팀들 중 하나이면서
// 동시에 선택한 타입 중 하나여야 함 — hooks/useLeagueHeadlines.ts의 .in()/.eq() 체이닝
// 참고). 여기서도 방향(받은/보낸)과 처리상태(수락/거절/취소)를 별개 그룹으로 취급 —
// 한 화면에 5개를 평평하게 나열하지만 실제로는 그룹별로 걸러진다.
type InboxFilterKey = 'incoming' | 'outgoing' | 'accepted' | 'rejected' | 'cancelled';
const INBOX_DIRECTION_FILTERS: InboxFilterKey[] = ['incoming', 'outgoing'];
const INBOX_STATUS_FILTERS: InboxFilterKey[] = ['accepted', 'rejected', 'cancelled'];
const INBOX_FILTERS: { key: InboxFilterKey; label: string }[] = [
    { key: 'incoming',  label: '받은 제안' },
    { key: 'outgoing',  label: '보낸 제안' },
    { key: 'accepted',  label: '수락' },
    { key: 'rejected',  label: '거절' },
    { key: 'cancelled', label: '취소' },
];
// [2026-09-02] "취소" 필터는 만료(expired)도 함께 묶어서 매칭 — 사용자 요청. 편지
// 하단 메시지는 여전히 취소/만료를 구분해서 보여주므로(renderOfferLetter), 필터 버킷만
// 합치고 실제 표시 문구는 그대로 다름.
const INBOX_STATUS_MATCH: Record<string, string[]> = {
    accepted: ['accepted'],
    rejected: ['rejected'],
    cancelled: ['cancelled', 'expired'],
};

// [2026-08-31] "새 제안" 화면 로스터/제공 리스트 전용 정보 구조 — [+/-버튼] | 오버롤배지 |
// 이름 | 포지션(POS) | PTS | REB | AST | 연봉 | 잔여계약 순.
//
// [2026-08-31] flex/grid + 자식별 width 유틸리티 조합을 완전히 버리고 진짜 <table>로 전환.
// grid-template-columns로도 헤더/행 정렬 문제가 재발했던 이유는 결국 "폭을 여러 군데(그리드
// 정의 + 자식 클래스)에서 따로 관리"하는 구조 자체의 한계 — <table>+<colgroup>은 폭을
// "컬럼" 하나의 개념으로 한 번만 정의하면 브라우저 테이블 레이아웃 알고리즘이 헤더/모든 행에
// 항상 동일하게 적용해주므로 이런 종류의 어긋남이 구조적으로 발생할 수 없다.
// PlayerTableCols(<colgroup>)를 헤더(PlayerListHeader)/행(PlayerChip) 양쪽에서 공유.
// [2026-08-31] 픽셀 고정폭 → %(비율) 폭으로 전환 — 컬럼이 좁은 화면에서 눌리거나 넓은
// 화면에서 계속 그 픽셀값에 머물지 않고, 컨테이너(이 리스트가 속한 컬럼) 폭에 비례해서
// 늘어나고 줄어듦. table-layout:fixed에서는 %도 px과 동일하게 <colgroup> 값이 그대로
// 강제 적용되므로 정렬 안정성은 그대로 유지. 두 변수(연봉/잔여계약 유무)별로 비율을
// 각각 100%에 맞춰 재분배 — 하나만 있는 값을 다른 쪽에서 억지로 재사용하지 않음.
const PLAYER_TABLE_WIDTHS_PCT = {
    withContract:    { toggle: 6, ovr: 6, pos: 9, stat: 9, salary: 11, years: 7, blocked: 2 },
    withoutContract: { toggle: 7, ovr: 7, pos: 11, stat: 10, blocked: 3 },
};

const PlayerTableCols: React.FC<{ showContract?: boolean }> = ({ showContract }) => {
    const w = showContract ? PLAYER_TABLE_WIDTHS_PCT.withContract : PLAYER_TABLE_WIDTHS_PCT.withoutContract;
    return (
        <colgroup>
            <col style={{ width: `${w.toggle}%` }} />
            <col style={{ width: `${w.ovr}%` }} />
            <col />{/* 이름 — 유일하게 폭 미지정, table-fixed 레이아웃에서 남는 비율을 전부 흡수 */}
            <col style={{ width: `${w.pos}%` }} />
            <col style={{ width: `${w.stat}%` }} />
            <col style={{ width: `${w.stat}%` }} />
            <col style={{ width: `${w.stat}%` }} />
            {showContract && <col style={{ width: `${PLAYER_TABLE_WIDTHS_PCT.withContract.salary}%` }} />}
            {showContract && <col style={{ width: `${PLAYER_TABLE_WIDTHS_PCT.withContract.years}%` }} />}
            <col style={{ width: `${w.blocked}%` }} />
        </colgroup>
    );
};

// PlayerChip(각 행)과 반드시 <table><tbody> 안에서만 써야 함 — 호출부에서
// <table className="w-full table-fixed border-collapse"><PlayerTableCols .../>(옵션)<PlayerListHeader .../><tbody>{...}</tbody></table>
// 형태로 감싼다.
const PlayerChip: React.FC<{
    player?: Player; playerId: string; blocked?: boolean; onToggle?: () => void; showContract?: boolean;
    stats?: { ppg: number; rpg: number; apg: number };
    /** 'add'(로스터 리스트, 기본값) 아니면 'remove'(제공/카트 리스트) — 첫 컬럼 버튼 아이콘만 다름 */
    actionIcon?: 'add' | 'remove';
    /** 이름 hover 시 능력치+스탯 팝업의 헤더에 표시할 소속팀 약어 — 이 행이 속한 팀(내 팀/상대 팀) 고정값. */
    teamAbbr?: string;
}> = ({
    player, playerId, blocked, onToggle, showContract, stats, actionIcon = 'add', teamAbbr,
}) => {
    const Icon = actionIcon === 'remove' ? Minus : Plus;
    return (
        <tr
            onClick={blocked ? undefined : onToggle}
            className={`h-9 bg-slate-900 border-b border-slate-800/50 transition-colors ${
                blocked ? 'opacity-40 cursor-not-allowed' : onToggle ? 'hover:bg-white/[0.03] cursor-pointer' : ''
            }`}
        >
            <td className="pl-2 pr-1 text-center">
                {onToggle && !blocked && (
                    <button
                        onClick={e => { e.stopPropagation(); onToggle(); }}
                        className={`w-5 h-5 rounded-full text-white inline-flex items-center justify-center transition-colors ${
                            actionIcon === 'remove' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                    >
                        <Icon size={12} />
                    </button>
                )}
            </td>
            <td>
                <div className="flex justify-center">
                    <OvrBadge value={player ? calculatePlayerOvr(player) : 0} size="sm" className="!w-6 !h-6 !text-sm !shadow-none" />
                </div>
            </td>
            <PlayerHoverCard player={player} teamAbbr={teamAbbr}>
                <td className="pl-2 pr-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="min-w-0 text-sm font-semibold text-white truncate">{player?.name ?? playerId}</span>
                        {player?.activeInjurySeverity && (
                            <InjuryStatusBadge
                                severity={player.activeInjurySeverity}
                                title={formatPlayerActiveInjuryLabel(player) ?? undefined}
                                size={16}
                                iconSize={12}
                                strokeWidth={4}
                            />
                        )}
                    </span>
                </td>
            </PlayerHoverCard>
            <td className="pr-4 text-center text-sm text-white">{player?.position ?? ''}</td>
            <td className="pr-4 text-right text-sm text-white">{(stats?.ppg ?? 0).toFixed(1)}</td>
            <td className="pr-4 text-right text-sm text-white">{(stats?.rpg ?? 0).toFixed(1)}</td>
            <td className="pr-4 text-right text-sm text-white">{(stats?.apg ?? 0).toFixed(1)}</td>
            {showContract && (
                <>
                    <td className="pr-4 text-right text-sm text-white">{player?.contract ? formatMoney(player.salary) : ''}</td>
                    <td className="pr-1 text-right text-sm text-white">{player?.contract ? player.contractYears : ''}</td>
                </>
            )}
            <td className="text-center">{blocked && <Ban size={13} className="text-red-400 inline" />}</td>
        </tr>
    );
};

// "새 제안" 화면 로스터 리스트 정렬 키 — PlayerListHeader의 클릭 정렬과 sortPlayerList가 공유.
type PlayerSortKey = 'ovr' | 'name' | 'position' | 'pts' | 'reb' | 'ast' | 'salary' | 'contractYears';
type PlayerSortConfig = { key: PlayerSortKey; direction: 'asc' | 'desc' };

function getPlayerSortValue(
    p: Player,
    key: PlayerSortKey,
    stats?: { ppg: number; rpg: number; apg: number },
): number | string {
    switch (key) {
        case 'name': return p.name;
        case 'position': return p.position;
        case 'ovr': return calculatePlayerOvr(p);
        case 'pts': return stats?.ppg ?? 0;
        case 'reb': return stats?.rpg ?? 0;
        case 'ast': return stats?.apg ?? 0;
        case 'salary': return p.salary ?? 0;
        case 'contractYears': return p.contractYears ?? 0;
        default: return 0;
    }
}

function sortPlayerList(
    players: Player[],
    config: PlayerSortConfig,
    statsByPlayerId: Map<string, { ppg: number; rpg: number; apg: number }>,
): Player[] {
    return [...players].sort((a, b) => {
        const aVal = getPlayerSortValue(a, config.key, statsByPlayerId.get(a.id));
        const bVal = getPlayerSortValue(b, config.key, statsByPlayerId.get(b.id));
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return config.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return config.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
}

// PlayerChip 위에 얹는 진짜 <thead> — sticky로 스크롤 중에도 고정. showContract가 false면
// (리그 샐러리캡 비활성) PlayerChip과 동일하게 연봉/잔여계약 칸 자체를 생략.
// OVR/이름/POS/PTS/REB/AST/연봉/잔여 전부 클릭 정렬 가능 — sortConfig/onSort는 호출부(내 팀/상대 팀
// 패널)마다 독립된 상태를 주입해 두 로스터가 서로 다른 기준으로 정렬돼도 상관없게 함.
const PlayerListHeader: React.FC<{
    showContract?: boolean;
    sortConfig: PlayerSortConfig;
    onSort: (key: PlayerSortKey) => void;
}> = ({ showContract, sortConfig, onSort }) => {
    const arrow = (key: PlayerSortKey) => sortConfig.key === key && (
        sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="inline text-indigo-400 ml-0.5 mb-0.5" strokeWidth={3} />
            : <ArrowDown size={10} className="inline text-indigo-400 ml-0.5 mb-0.5" strokeWidth={3} />
    );
    const sortableCls = 'cursor-pointer hover:text-white select-none';
    return (
        <thead className="sticky top-0 z-10 bg-slate-950">
            <tr className="h-7 border-b border-slate-800 text-sm font-black uppercase text-slate-500 ko-normal">
                <th />
                <th className={`text-center ${sortableCls}`} onClick={() => onSort('ovr')}>OVR{arrow('ovr')}</th>
                <th className={`pl-2 pr-1 text-left ${sortableCls}`} onClick={() => onSort('name')}>이름{arrow('name')}</th>
                <th className={`pr-4 text-center ${sortableCls}`} onClick={() => onSort('position')}>POS{arrow('position')}</th>
                <th className={`pr-4 text-right ${sortableCls}`} onClick={() => onSort('pts')}>PTS{arrow('pts')}</th>
                <th className={`pr-4 text-right ${sortableCls}`} onClick={() => onSort('reb')}>REB{arrow('reb')}</th>
                <th className={`pr-4 text-right ${sortableCls}`} onClick={() => onSort('ast')}>AST{arrow('ast')}</th>
                {showContract && (
                    <>
                        <th className={`pr-4 text-right ${sortableCls}`} onClick={() => onSort('salary')}>연봉{arrow('salary')}</th>
                        <th className={`pr-1 text-right ${sortableCls}`} onClick={() => onSort('contractYears')}>잔여{arrow('contractYears')}</th>
                    </>
                )}
                <th />
            </tr>
        </thead>
    );
};

const MultiFrontOfficeView: React.FC = () => {
    const { league, room, members, leagueTeams, reload } = useLeagueContext();
    const { session } = useGame();
    const { schedule } = useSeasonContext();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { getPlayerUrlId } = usePlayerShortCodes();

    // "지금 활성 부상/출장정지인지" 판정용 인게임 "오늘" — MultiRosterView.tsx/MultiTacticsView.tsx와
    // 동일한 findCurrentVirtualDate 패턴.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;
    const preferVirtual = league?.type === 'main_league';
    const currentSimDate = useMemo(() => {
        if (!preferVirtual) return room?.sim_date ?? '';
        return findCurrentVirtualDate(schedule, simStart, gprd, getServerNow()) ?? room?.sim_date ?? '';
    }, [preferVirtual, room?.sim_date, schedule, simStart, gprd]);
    // 세션(리그) 설정에서 샐러리캡이 켜져 있을 때만 트레이드 제안 화면의 선수 리스트에
    // 연봉/잔여계약 연수를 노출.
    const capEnabled = !!league?.cap_enabled;

    const roomId = room?.id ?? null;
    const isAdmin = !!session?.user?.id && league?.admin_user_id === session.user.id;

    const myTeamSlug = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeamRow = useMemo(
        () => leagueTeams.find(t => t.team_slug === myTeamSlug) ?? null,
        [leagueTeams, myTeamSlug],
    );

    const teamById = useMemo(() => new Map(leagueTeams.map(t => [t.id, t])), [leagueTeams]);
    const poolById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);

    // 호버 카드용 — rosterMap(playerId → team_slug)을 team_abbr로 한 단계 더 매핑.
    // "요구 선수"처럼 한 목록 안에 여러 팀 선수가 섞여 있는 경우에 필요.
    const teamAbbrBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])), [leagueTeams]);
    const playerTeamAbbrById = useMemo(() => {
        const m = new Map<string, string>();
        for (const [pid, slug] of rosterMap) {
            const abbr = teamAbbrBySlug.get(slug);
            if (abbr) m.set(pid, abbr);
        }
        return m;
    }, [rosterMap, teamAbbrBySlug]);

    // [TEMP 테스트 기간 한정 2026-08-30] 지금은 리그에 인간 GM이 관리자 본인뿐이라 정상
    // 조건(인간 팀만)으로는 "제안하기"가 항상 비활성화됨 — 관리자 계정에 한해 AI 팀도 대상에
    // 포함시켜 트레이드 제안 플로우를 테스트할 수 있게 함. `create_trade_offer` RPC도 관리자
    // 발신 건에 한해 AI 팀 수신을 허용하도록 같이 완화했고(마이그레이션 참고), 응답은 기존
    // admin bypass(`respond_trade_offer`)로 이미 가능. 되돌릴 땐 `isAdmin ||` 조건과 아래
    // deps의 `isAdmin`만 제거하면 원래 "인간 팀만" 동작으로 복원됨.
    const humanTargetTeams = useMemo(
        () => leagueTeams.filter(t => t.id !== myTeamRow?.id && (isAdmin || (t.user_id && !t.is_ai)))
            .sort((a, b) => a.team_name.localeCompare(b.team_name, 'en')),
        [leagueTeams, myTeamRow, isAdmin],
    );

    // 탭 상태를 URL 쿼리스트링(?tab=)에 저장 — 새로고침/뒤로가기 후에도 탭이 유지되고,
    // 딥링크로 특정 탭에 바로 진입할 수 있음(싱글플레이어 FrontOfficeView와 동일한 패턴).
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab');
    const activeTab: Tab = (rawTab && TAB_IDS.includes(rawTab as Tab)) ? (rawTab as Tab) : 'new';
    const setActiveTab = useCallback((tab: Tab) => {
        setSearchParams({ tab }, { replace: true });
    }, [setSearchParams]);
    // [2026-08-30] "내 트레이드 블록"은 더 이상 탭이 아니라 탭 그룹 우측 버튼으로 여는 모달 —
    // activeTab과 무관한 별도 boolean으로 관리.
    const [showMyBlockModal, setShowMyBlockModal] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [respondingId, setRespondingId] = useState<string | null>(null);
    // "인박스" 탭 좌측 리스트에서 선택된 오퍼 — 싱글플레이 인박스(좌:리스트/우:디테일)와
    // 동일한 패턴. 선택된 오퍼가 목록에서 사라지면(수락/거절/취소 후 refetch) 다음 렌더에서
    // 자동으로 목록 첫 번째로 대체됨(아래 selectedOffer 계산 참고) — 별도 리셋 이펙트 불필요.
    const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
    // "메세지함" 좌측 리스트 상단 필터 체크박스 상태 — 빈 배열은 "전체 표시"(뉴스피드
    // selectedTypes와 동일한 관례).
    const [selectedInboxFilters, setSelectedInboxFilters] = useState<InboxFilterKey[]>([]);
    const toggleInboxFilter = (key: InboxFilterKey) => {
        setSelectedInboxFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    // "히스토리" 탭 필터 — 팀(참여 팀 중 하나라도 일치)/날짜(인게임 날짜 범위)/검색(팀명·
    // 선수명). 날짜는 수락일(sim_date_at_resolution) 기준, 없으면(마이그레이션 이전 데이터)
    // 제안일(sim_date_at_creation)로 대체 — 뉴스피드(MultiNewsFeedView.tsx)의 인게임 날짜
    // 범위 필터와 동일한 패턴.
    const [historyTeamFilter, setHistoryTeamFilter] = useState<string>('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const hasHistoryFilter = !!(historyTeamFilter || historyDateFrom || historyDateTo || historySearch.trim());
    const resetHistoryFilters = () => {
        setHistoryTeamFilter('');
        setHistoryDateFrom('');
        setHistoryDateTo('');
        setHistorySearch('');
    };

    // [2026-08-30] 예전엔 useState+useEffect로 직접 fetch해서, 이 화면(컴포넌트)이 마운트될
    // 때마다(탭을 나갔다가 다시 들어올 때마다) initialLoading이 매번 true로 리셋되어 전체 화면
    // 로더가 매번 반복해서 떴음 — 다른 멀티 화면들(useLeagueRawStats 등)처럼 React Query로
    // 옮겨서, 같은 queryKey(roomId+내 팀+어드민 여부)로 재방문하면 캐시를 그대로 재사용해
    // 로더 없이 즉시 뜨게 함. isLoading은 v5에서 "데이터가 아직 없고 fetch 중"(최초 로드)만
    // true라 initialLoading 대체로 정확히 맞고, isFetching은 백그라운드 재조회 포함 전체 fetch
    // 중 true라 기존 loading(체크박스 로컬상태 동기화 가드용, 아래 pendingTradeableIds
    // useEffect 참고)과 동일하게 씀.
    const {
        data: tradeData,
        isLoading: initialLoading,
        isFetching: loading,
        refetch: refreshTradeData,
    } = useQuery({
        queryKey: ['multiTradeData', roomId, myTeamRow?.id ?? null, isAdmin],
        enabled: !!roomId,
        queryFn: async () => {
            const [blocks, historyRows] = await Promise.all([
                listTradeBlocks(roomId!),
                listTradeHistory(roomId!),
            ]);
            // [2026-08-24] opt-in 방식으로 반전 — league_trade_blocks에 행이 있으면
            // "트레이드 가능"(기본값은 전원 불가).
            const tradeableByTeam = new Map<string, Set<string>>();
            for (const b of blocks) {
                if (!tradeableByTeam.has(b.team_id)) tradeableByTeam.set(b.team_id, new Set());
                tradeableByTeam.get(b.team_id)!.add(b.player_id);
            }

            let incoming: TradeOfferRow[] = [];
            let outgoing: TradeOfferRow[] = [];
            let resolved: TradeOfferRow[] = [];
            if (myTeamRow) {
                const [res, resolvedRows] = await Promise.all([
                    listPendingTradeOffers(roomId!, myTeamRow.id),
                    listMyResolvedTradeOffers(roomId!, myTeamRow.id),
                ]);
                incoming = res.incoming;
                outgoing = res.outgoing;
                resolved = resolvedRows;
            }
            const adminAll = isAdmin ? await listAllPendingTradeOffers(roomId!) : [];
            const adminResolved = isAdmin ? await listAllResolvedTradeOffers(roomId!) : [];

            return { tradeableByTeam, history: historyRows, incoming, outgoing, resolved, adminAll, adminResolved };
        },
    });
    const tradeableByTeam = tradeData?.tradeableByTeam ?? EMPTY_TRADEABLE_MAP;
    const history         = tradeData?.history ?? EMPTY_OFFERS;
    const incoming        = tradeData?.incoming ?? EMPTY_OFFERS;
    const outgoing        = tradeData?.outgoing ?? EMPTY_OFFERS;
    const resolved        = tradeData?.resolved ?? EMPTY_OFFERS;
    const adminAll        = tradeData?.adminAll ?? EMPTY_OFFERS;
    const adminResolved   = tradeData?.adminResolved ?? EMPTY_OFFERS;

    // "히스토리" 탭 필터 적용 — 팀(제안/수락 어느 쪽이든 일치)·날짜(수락일, 없으면 제안일로
    // 대체)·검색어(팀명 또는 참여 선수명 부분 일치) 전부 AND로 결합.
    const filteredHistory = useMemo(() => {
        const query = historySearch.trim().toLowerCase();
        return history.filter(o => {
            if (historyTeamFilter && o.from_team_id !== historyTeamFilter && o.to_team_id !== historyTeamFilter) {
                return false;
            }
            const tradeDate = o.sim_date_at_resolution ?? o.sim_date_at_creation;
            if (historyDateFrom && (!tradeDate || tradeDate < historyDateFrom)) return false;
            if (historyDateTo && (!tradeDate || tradeDate > historyDateTo)) return false;
            if (query) {
                const fromTeam = teamById.get(o.from_team_id);
                const toTeam = teamById.get(o.to_team_id);
                const teamNames = `${fromTeam?.team_name ?? ''} ${toTeam?.team_name ?? ''}`.toLowerCase();
                const playerNames = o.league_trade_offer_players
                    .map(p => poolById.get(p.player_id)?.name ?? '')
                    .join(' ')
                    .toLowerCase();
                if (!teamNames.includes(query) && !playerNames.includes(query)) return false;
            }
            return true;
        });
    }, [history, historyTeamFilter, historyDateFrom, historyDateTo, historySearch, teamById, poolById]);

    // [2026-08-31] staleTime: Infinity + 영속 캐시(index.tsx)라 다른 유저/AI가 새로 보낸
    // 오퍼처럼 이 화면 밖에서 생긴 변경은 로컬 뮤테이션(수락/거절/취소/전송) 없이는 절대
    // 저절로 반영되지 않는다 — "메세지함" 탭에 들어올 때마다 한 번 재조회해서, 최소한
    // 탭에 진입하는 순간엔 최신 상태를 보게 한다(사이드바 배지는 별도 realtime 구독으로
    // 항상 최신이라 이 화면과 잠깐 어긋나 보일 수 있음 — 탭 클릭하면 바로 맞춰짐).
    useEffect(() => {
        if (activeTab === 'inbox') refreshTradeData();
    }, [activeTab, refreshTradeData]);

    // "인박스" 탭 — 받은/보낸 대기 중 제안 + 최근 처리된(수락/거절/취소) 오퍼를 하나의 리스트로
    // 병합. [2026-09-02] 처리된 오퍼도 히스토리로 남겨달라는 요청 반영 — 정렬 기준은 "가장 최근
    // 활동 시각"(처리된 건 resolved_at, 대기 중인 건 created_at)이라야 방금 수락/거절/취소한
    // 오퍼가 목록 맨 위로 자연스럽게 올라온다.
    const activityTime = (o: TradeOfferRow) => new Date(o.resolved_at ?? o.created_at).getTime();
    const pendingInbox = useMemo(
        () => [...incoming, ...outgoing, ...resolved].sort((a, b) => activityTime(b) - activityTime(a)),
        [incoming, outgoing, resolved],
    );
    // 어드민은 리그 전체 제안(대기+처리됨), 일반 유저는 자기 팀 기준 병합 리스트(pendingInbox).
    const inboxList = isAdmin
        ? [...adminAll, ...adminResolved].sort((a, b) => activityTime(b) - activityTime(a))
        : pendingInbox;
    // "메세지함" 탭/사이드바 배지용 — 내가 "받은" 오퍼 중 안읽은 것만 카운트. incoming은
    // myTeamRow가 있을 때만 채워지므로(어드민 여부와 무관) isAdmin으로 따로 가드할 필요 없음
    // — 어드민 계정이 동시에 팀 오너인 경우(이 프로젝트의 현재 유일한 테스트 계정 구조,
    // project_admin_account.md 참고)에도 자기 팀이 받은 오퍼는 정상적으로 카운트돼야 함.
    const unreadInboxCount = incoming.filter(o => !o.to_team_read_at).length;
    // 방향(받음/보냄)에 따라 renderOfferCard에 어떤 액션 버튼을 보여줄지 결정 — 리스트 행의
    // 뱃지와 디테일 패널의 버튼 양쪽에서 공유. isAdmin을 먼저 체크하면 "어드민이면서 동시에
    // 팀 오너"인 계정(현재 유일한 테스트 계정 구조)의 자기 팀 오퍼가 방향 없이 처리돼
    // 읽음 처리 로직(handleSelectOffer)이 아예 발동하지 않는 버그가 있었음 — 내 팀이
    // 관련된 오퍼인지부터 먼저 판단하고, 내 팀과 무관한(리그 전체 열람용) 오퍼에 한해서만
    // 어드민의 전권 처리를 적용하도록 순서를 바꿈.
    const getOfferOpts = (offer: TradeOfferRow): { showAccept?: boolean; showReject?: boolean; showCancel?: boolean; direction?: 'incoming' | 'outgoing' } => {
        if (myTeamRow && offer.to_team_id === myTeamRow.id) {
            return { showAccept: true, showReject: true, direction: 'incoming' };
        }
        if (myTeamRow && offer.from_team_id === myTeamRow.id) {
            return { showCancel: true, direction: 'outgoing' };
        }
        // 내 팀과 무관한 리그 전체 오퍼 — 어드민만 볼 수 있음(adminAll에만 존재).
        return { showAccept: true, showReject: true, showCancel: true };
    };
    // 상단 필터 체크박스 적용 — 방향(받은/보낸) 그룹과 처리상태(수락/거절/취소) 그룹은
    // 서로 AND로 결합(둘 다 선택돼 있으면 둘 다 만족해야 함), 같은 그룹 안에서 여러 개
    // 선택하면 OR(그 중 하나만 맞으면 통과) — 뉴스피드 필터 조합 방식과 동일.
    const filteredInboxList = useMemo(() => {
        const directionSel = selectedInboxFilters.filter(f => INBOX_DIRECTION_FILTERS.includes(f));
        const statusSel = selectedInboxFilters.filter(f => INBOX_STATUS_FILTERS.includes(f));
        if (directionSel.length === 0 && statusSel.length === 0) return inboxList;
        return inboxList.filter(o => {
            const direction = getOfferOpts(o).direction;
            const directionOk = directionSel.length === 0 || (!!direction && directionSel.includes(direction));
            const statusOk = statusSel.length === 0 || statusSel.some(f => INBOX_STATUS_MATCH[f].includes(o.status));
            return directionOk && statusOk;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboxList, selectedInboxFilters, myTeamRow]);
    // 선택된 오퍼가 목록에서 사라지면(수락/거절/취소 후 refetch, 또는 필터로 걸러짐) 자동으로
    // (필터링된) 목록 첫 번째로 대체.
    const selectedOffer = filteredInboxList.find(o => o.id === selectedOfferId) ?? filteredInboxList[0] ?? null;

    // 리스트에서 오퍼를 선택 — 내가 "받은" 안읽은 오퍼면 읽음 처리(RPC)까지 함께 수행.
    // isAdmin 여부와 무관하게 "내 팀이 받은 오퍼인지"만 기준으로 판단(getOfferOpts와 동일한
    // 수정 이유 — 어드민이면서 동시에 팀 오너인 계정도 자기 팀 오퍼는 정상적으로 읽음 처리돼야 함).
    const handleSelectOffer = (offer: TradeOfferRow) => {
        setSelectedOfferId(offer.id);
        if (offer.to_team_id === myTeamRow?.id && !offer.to_team_read_at) {
            markTradeOfferRead(offer.id).then(() => refreshTradeData());
        }
    };

    // "트레이드 블록"(리그 전체 열람) 탭용 — 30팀 전부 표시(블록 내용이 없어도 행 자체는
    // 항상 보여주고, 빈 컬럼엔 "없음" 텍스트를 렌더). [2026-08-30 정정] team_name(팀 전체
    // 이름)이 아니라 실제로 화면에 표시되는 team_abbr(약어) 기준으로 정렬해야 함 — 이 리그처럼
    // 커스텀 팀명/약어를 쓰는 경우 전체 이름 알파벳 순서와 약어 알파벳 순서가 서로 안 맞아서
    // (예: "LAM"이 team_name 기준으로는 다른 위치에 있음) 화면에 보이는 약어 컬럼이 A-Z로
    // 안 읽히는 버그가 있었음. localeCompare에 로케일을 명시하지 않으면 브라우저/OS 기본
    // 로케일(이 앱은 한국어 환경)을 따라가 정렬 결과가 달라질 수 있어 'en'을 명시적으로 고정.
    const sortedTeams = useMemo(
        () => [...leagueTeams].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr, 'en')),
        [leagueTeams],
    );
    const myTradeableIds = tradeableByTeam.get(myTeamRow?.id ?? '') ?? new Set<string>();
    const myRoster = useMemo(
        () => (myTeamRow?.roster ?? [])
            .map(id => poolById.get(id))
            .filter((p): p is Player => !!p)
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [myTeamRow, poolById],
    );

    const handleRespond = useCallback(async (offerId: string, action: TradeOfferAction) => {
        setRespondingId(offerId);
        setActionError(null);
        const { error } = await respondTradeOffer(offerId, action);
        setRespondingId(null);
        if (error) { setActionError(error); return; }
        reload();
        refreshTradeData();
    }, [reload, refreshTradeData]);

    // ── 새 제안 탭 상태 ──────────────────────────────────────────────────
    const [targetTeamId, setTargetTeamId] = useState<string>('');
    useEffect(() => {
        if (!targetTeamId || !humanTargetTeams.some(t => t.id === targetTeamId)) {
            setTargetTeamId(humanTargetTeams[0]?.id ?? '');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [humanTargetTeams]);
    const targetTeamRow = teamById.get(targetTeamId) ?? null;
    const targetRoster = useMemo(
        () => (targetTeamRow?.roster ?? [])
            .map(id => poolById.get(id))
            .filter((p): p is Player => !!p)
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [targetTeamRow, poolById],
    );
    const targetTradeableIds = tradeableByTeam.get(targetTeamId) ?? new Set<string>();

    // [2026-08-31] PlayerChip의 PTS/REB/AST 표시용 — 이 리그(room) 안에서 실제로 뛴 경기
    // 박스스코어를 집계. 범위는 지금 화면에 보이는 두 로스터(내 팀/상대 팀)로 한정 —
    // 검색/드래프트 풀 전체를 집계하면 비용이 커서(선수 수백 명) 로스터에 없는 선수는
    // 스탯을 안 보여줘도 되는 이 화면 성격상 불필요. buildLeagueTeams()는 리더보드/인사이트
    // 탭이 이미 쓰는 room 전체 박스스코어 집계 함수를 그대로 재사용(중복 구현 없음).
    const statsRosterIds = useMemo(
        () => [...(myTeamRow?.roster ?? []), ...(targetTeamRow?.roster ?? [])],
        [myTeamRow, targetTeamRow],
    );
    const useCustomOverridesForStats = (league?.draft_pool ?? 'standard').split(',').includes('alltime');
    const { data: statsRawData } = useLeagueRawStats(roomId ?? undefined, statsRosterIds);
    const statsByPlayerId = useMemo(() => {
        const map = new Map<string, { ppg: number; rpg: number; apg: number }>();
        if (!statsRawData) return map;
        const teamsWithStats = buildLeagueTeams(
            statsRawData,
            [myTeamRow, targetTeamRow].filter((t): t is LeagueTeamRow => !!t),
            useCustomOverridesForStats,
        );
        for (const t of teamsWithStats) {
            for (const p of t.roster) {
                const g = Math.max(1, p.stats?.g ?? 0);
                map.set(p.id, {
                    ppg: (p.stats?.pts ?? 0) / g,
                    rpg: (p.stats?.reb ?? 0) / g,
                    apg: (p.stats?.ast ?? 0) / g,
                });
            }
        }
        return map;
    }, [statsRawData, myTeamRow, targetTeamRow, useCustomOverridesForStats]);
    // [TEMP 테스트 기간 한정 2026-08-30] 관리자가 AI 팀을 상대로 테스트할 땐 트레이드 블록
    // 등록 여부와 무관하게 로스터 전원을 선택 가능하게 함 — AI 팀은 보통 블록에 아무 선수도
    // 안 올라가 있어 정상 조건으론 선택 자체가 불가능함. `create_trade_offer` RPC도 같은
    // 조건(관리자+AI 팀 대상)으로 player_not_tradeable 체크를 완화해뒀음(마이그레이션 참고).
    const isTestUnblockedTarget = isAdmin && !!targetTeamRow?.is_ai;

    // [2026-09-02] 이름 hover 카드(PlayerHoverCard)의 시즌 스탯용 — poolPlayers(meta_players만
    // 조회)는 stats가 항상 0이라 이 화면의 호버 카드는 전부 "시즌 기록 없음"만 떴다. 활성 탭에
    // 실제로 화면에 보이는 선수 id만(리그 전체 풀을 매번 긁지 않도록) usePlayerSeasonStatsBatch로
    // 가볍게 조회해 poolById를 덮어쓴 버전을 만든다 — 뉴스피드(newsFeedCards.tsx)가 이미 쓰는
    // 것과 동일한 패턴. "새 제안" 탭은 이미 위에서 계산해둔 statsRosterIds를 그대로 재사용.
    const statsRequestIds = useMemo(() => {
        if (activeTab === 'new') return statsRosterIds;
        if (activeTab === 'leagueBlocks') {
            const ids = new Set<string>();
            for (const s of tradeableByTeam.values()) for (const id of s) ids.add(id);
            for (const t of leagueTeams) for (const id of (t.trade_request_player_ids ?? [])) ids.add(id);
            return [...ids];
        }
        if (activeTab === 'history') {
            const ids = new Set<string>();
            for (const o of history) for (const p of o.league_trade_offer_players) ids.add(p.player_id);
            return [...ids];
        }
        if (activeTab === 'inbox' && selectedOffer) {
            return selectedOffer.league_trade_offer_players.map(p => p.player_id);
        }
        return [];
    }, [activeTab, statsRosterIds, tradeableByTeam, leagueTeams, history, selectedOffer]);
    const { data: seasonStatsBatch } = usePlayerSeasonStatsBatch(roomId ?? undefined, statsRequestIds);
    // 부상/출장정지 배지용 — statsRequestIds가 탭마다 이미 적절한 범위(새 제안=양 팀 로스터,
    // 히스토리=과거 트레이드에 등장한 선수 전체 등)로 분기돼 있어 그대로 재사용.
    const { data: injuryRows } = usePlayerInjuryStatus(roomId ?? undefined, statsRequestIds);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, currentSimDate, room?.season_number, {
            schedule: schedule as { homeTeamId: string; awayTeamId: string; date: string; played: boolean }[],
            getTeamId: id => rosterMap.get(id),
        }),
        [injuryRows, currentSimDate, room?.season_number, schedule, rosterMap],
    );
    const poolByIdWithStats = useMemo(() => {
        if ((!seasonStatsBatch || Object.keys(seasonStatsBatch).length === 0) && activeInjuryByPlayer.size === 0) {
            return poolById;
        }
        const merged = new Map(poolById);
        for (const [id, stats] of Object.entries(seasonStatsBatch ?? {})) {
            const p = merged.get(id);
            if (p) merged.set(id, { ...p, stats: { ...p.stats, ...stats } });
        }
        for (const [id, injuryStatus] of activeInjuryByPlayer) {
            const p = merged.get(id);
            if (p) merged.set(id, {
                ...p,
                activeInjurySeverity: injuryStatus.severity,
                injuryType: injuryStatus.injuryType,
                activeInjuryDuration: injuryStatus.duration,
                returnDate: injuryStatus.returnDate ?? undefined,
            });
        }
        return merged;
    }, [poolById, seasonStatsBatch, activeInjuryByPlayer]);

    // "트레이드 블록" 테이블의 매물 선수/요구 선수 컬럼 — 선수 이름 하나하나를 클릭해서
    // 선수 상세 화면으로 이동할 수 있도록 쉼표 구분 텍스트 대신 개별 <span>으로 렌더.
    const renderPlayerList = useCallback((ids: string[]) => (
        <>
            {ids.map((id, idx) => {
                const p = poolByIdWithStats.get(id);
                return (
                    <React.Fragment key={id}>
                        {idx > 0 && <span className="text-slate-600 text-sm">, </span>}
                        <PlayerHoverCard player={p} teamAbbr={playerTeamAbbrById.get(id)}>
                            <span
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(id)}`)}
                                className="text-slate-300 ko-normal text-sm cursor-pointer hover:underline hover:text-indigo-400"
                            >
                                {p?.name ?? id}
                            </span>
                        </PlayerHoverCard>
                    </React.Fragment>
                );
            })}
        </>
    ), [poolByIdWithStats, playerTeamAbbrById, navigate, leagueId, getPlayerUrlId]);

    // "히스토리" 탭 테이블용 — 트레이드 한 건이 선수 N명을 포함하면 <tr>도 N개(+합계 1행)로
    // 나눈다(요청: 한 트레이드=한 행이 아니라 선수 수만큼 행 분리, 날짜/팀명은 rowSpan으로
    // 병합, 맨 아래에 합계 행 별도). 이 헬퍼는 그 중 "선수 이름" 셀 하나만 렌더.
    const renderHistoryPlayerCell = useCallback((id: string | null) => {
        if (!id) return null;
        const p = poolByIdWithStats.get(id);
        return (
            <PlayerHoverCard player={p} teamAbbr={playerTeamAbbrById.get(id)}>
                <span
                    onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(id)}`)}
                    className="inline-flex items-center gap-1.5 text-slate-300 ko-normal text-sm cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                >
                    {p?.name ?? id}
                    {p?.activeInjurySeverity && (
                        <InjuryStatusBadge
                            severity={p.activeInjurySeverity}
                            title={formatPlayerActiveInjuryLabel(p) ?? undefined}
                            size={16}
                            iconSize={12}
                            strokeWidth={4}
                        />
                    )}
                </span>
            </PlayerHoverCard>
        );
    }, [poolByIdWithStats, playerTeamAbbrById, navigate, leagueId, getPlayerUrlId]);

    const [cartMine, setCartMine] = useState<Set<string>>(new Set());
    const [cartTheirs, setCartTheirs] = useState<Set<string>>(new Set());
    useEffect(() => { setCartMine(new Set()); setCartTheirs(new Set()); }, [targetTeamId]);
    const toggleMine = useCallback((id: string) => setCartMine(prev => {
        const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    }), []);
    const toggleTheirs = useCallback((id: string) => setCartTheirs(prev => {
        const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    }), []);

    // "새 제안" 화면 내 팀/상대 팀 로스터 리스트 헤더 클릭 정렬 — 두 패널이 서로 다른 기준으로
    // 정렬될 수 있어 독립된 상태로 관리. 기본값은 myRoster/targetRoster의 기본 정렬(OVR 내림차순)과
    // 동일해 처음 진입 시 화면이 그대로 유지된다.
    const [mySortConfig, setMySortConfig] = useState<PlayerSortConfig>({ key: 'ovr', direction: 'desc' });
    const [targetSortConfig, setTargetSortConfig] = useState<PlayerSortConfig>({ key: 'ovr', direction: 'desc' });
    const handleMySort = useCallback((key: PlayerSortKey) => {
        setMySortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    }, []);
    const handleTargetSort = useCallback((key: PlayerSortKey) => {
        setTargetSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    }, []);
    const myRosterListed = useMemo(
        () => sortPlayerList(myRoster.filter(p => !cartMine.has(p.id)), mySortConfig, statsByPlayerId),
        [myRoster, cartMine, mySortConfig, statsByPlayerId],
    );
    const targetRosterListed = useMemo(
        () => sortPlayerList(targetRoster.filter(p => !cartTheirs.has(p.id)), targetSortConfig, statsByPlayerId),
        [targetRoster, cartTheirs, targetSortConfig, statsByPlayerId],
    );

    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    const handleSend = useCallback(async () => {
        if (!roomId || !myTeamRow || !targetTeamRow) return;
        setSending(true);
        setActionError(null);
        const { error } = await createTradeOffer({
            roomId, fromTeamId: myTeamRow.id, toTeamId: targetTeamRow.id,
            playersFrom: [...cartMine], playersTo: [...cartTheirs], message,
        });
        setSending(false);
        if (error) { setActionError(error); return; }
        setCartMine(new Set());
        setCartTheirs(new Set());
        setMessage('');
        setSendSuccess(true);
        setTimeout(() => setSendSuccess(false), 2500);
        refreshTradeData();
    }, [roomId, myTeamRow, targetTeamRow, cartMine, cartTheirs, message, refreshTradeData]);

    // ── 트레이드 블록 탭 ─────────────────────────────────────────────────
    // 체크박스는 로컬 선택 상태만 바꾸고, "업데이트" 버튼을 눌러야 서버에 일괄 반영된다
    // (선수 한 명 클릭할 때마다 refreshTradeData()가 통째로 다시 돌아 화면이 리로드되는
    // 문제가 있었음). [2026-08-24] 체크 = "트레이드 가능"(opt-in), 기본값(미체크)은 불가.
    const [pendingTradeableIds, setPendingTradeableIds] = useState<Set<string>>(new Set());
    const [savingBlocks, setSavingBlocks] = useState(false);
    const [blockSaveSuccess, setBlockSaveSuccess] = useState(false);

    // 서버 데이터가 (재)로드될 때만 로컬 선택 상태를 서버 값으로 동기화 — 체크박스를
    // 토글하는 동안에는 이 effect가 재실행되지 않아 편집 중인 선택이 지워지지 않는다.
    useEffect(() => {
        if (!loading) setPendingTradeableIds(new Set(myTradeableIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, myTeamRow?.id]);

    const togglePendingTradeable = useCallback((playerId: string) => {
        setPendingTradeableIds(prev => {
            const next = new Set(prev);
            next.has(playerId) ? next.delete(playerId) : next.add(playerId);
            return next;
        });
    }, []);

    // 드래그&드롭 이동 — 드롭 대상 컬럼이 이미 그 선수를 갖고 있어도 안전하게 멱등 처리
    // (toggle과 달리 "이 컬럼에 있어야 한다"는 목표 상태를 직접 지정).
    const setPendingTradeableMembership = useCallback((playerId: string, tradeable: boolean) => {
        setPendingTradeableIds(prev => {
            if (prev.has(playerId) === tradeable) return prev;
            const next = new Set(prev);
            tradeable ? next.add(playerId) : next.delete(playerId);
            return next;
        });
    }, []);
    const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);

    const tradeableDirty = useMemo(() => {
        if (pendingTradeableIds.size !== myTradeableIds.size) return true;
        for (const id of pendingTradeableIds) if (!myTradeableIds.has(id)) return true;
        return false;
    }, [pendingTradeableIds, myTradeableIds]);

    // ── 팀 단위 "원하는 대가" 위시리스트 — 트레이드 블록(선수 목록)과 별개 기능 ─────────
    // 선수 리스트 하단에 별도 섹션으로 표시. league_teams에 팀당 1행 저장.
    const [teamRequestNote, setTeamRequestNote] = useState('');
    const [teamRequestPositions, setTeamRequestPositions] = useState<Set<string>>(new Set());
    const [teamRequestPlayerIds, setTeamRequestPlayerIds] = useState<Set<string>>(new Set());
    const [teamRequestArchetypes, setTeamRequestArchetypes] = useState<Set<string>>(new Set());
    const [teamRequestPlayerQuery, setTeamRequestPlayerQuery] = useState('');

    // 같은 팀이면 재초기화하지 않음 — 저장 후 reload()로 leagueTeams가 갱신돼도 편집 중인
    // 폼(아직 저장 안 한 값 포함)을 덮어쓰지 않기 위함.
    const initializedTeamRequestRef = useRef<string | null>(null);
    useEffect(() => {
        if (!myTeamRow) return;
        if (initializedTeamRequestRef.current === myTeamRow.id) return;
        initializedTeamRequestRef.current = myTeamRow.id;
        setTeamRequestNote(myTeamRow.trade_request_note ?? '');
        setTeamRequestPositions(new Set(myTeamRow.trade_request_positions ?? []));
        setTeamRequestPlayerIds(new Set(myTeamRow.trade_request_player_ids ?? []));
        setTeamRequestArchetypes(new Set(myTeamRow.trade_request_archetypes ?? []));
    }, [myTeamRow]);

    const toggleTeamRequestPosition = useCallback((pos: string) => {
        setTeamRequestPositions(prev => {
            const next = new Set(prev);
            next.has(pos) ? next.delete(pos) : next.add(pos);
            return next;
        });
    }, []);
    const toggleTeamRequestArchetype = useCallback((arch: string) => {
        setTeamRequestArchetypes(prev => {
            const next = new Set(prev);
            next.has(arch) ? next.delete(arch) : next.add(arch);
            return next;
        });
    }, []);
    const addTeamRequestPlayer = useCallback((id: string) => {
        setTeamRequestPlayerIds(prev => new Set(prev).add(id));
        setTeamRequestPlayerQuery('');
    }, []);
    const removeTeamRequestPlayer = useCallback((id: string) => {
        setTeamRequestPlayerIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, []);

    const teamRequestPlayerMatches = useMemo(() => {
        const q = teamRequestPlayerQuery.trim();
        if (q.length < 1) return [];
        return poolPlayers
            .filter(p => p.name.includes(q) && !teamRequestPlayerIds.has(p.id))
            .slice(0, 8);
    }, [teamRequestPlayerQuery, poolPlayers, teamRequestPlayerIds]);

    // 서버에 저장된 값과 로컬 편집 상태를 비교 — 요구사항 메모/포지션/선수/아키타입 중 하나라도
    // 바뀌었으면 "업데이트" 버튼 활성화(선수 목록 변경 여부와 무관하게 독립적으로 판단).
    const teamRequestDirty = useMemo(() => {
        if (!myTeamRow) return false;
        if ((myTeamRow.trade_request_note ?? '') !== teamRequestNote) return true;
        const savedPositions  = new Set(myTeamRow.trade_request_positions  ?? []);
        const savedPlayerIds  = new Set(myTeamRow.trade_request_player_ids ?? []);
        const savedArchetypes = new Set(myTeamRow.trade_request_archetypes ?? []);
        const setsDiffer = (a: Set<string>, b: Set<string>) => a.size !== b.size || [...a].some(v => !b.has(v));
        return setsDiffer(teamRequestPositions, savedPositions)
            || setsDiffer(teamRequestPlayerIds, savedPlayerIds)
            || setsDiffer(teamRequestArchetypes, savedArchetypes);
    }, [myTeamRow, teamRequestNote, teamRequestPositions, teamRequestPlayerIds, teamRequestArchetypes]);

    // "업데이트" 버튼 하나로 트레이드 가능 여부(on/off)와 "원하는 대가" 위시리스트를 함께 저장.
    const handleSaveTradeable = useCallback(async () => {
        if (!roomId || !myTeamRow) return;
        setSavingBlocks(true);
        setActionError(null);
        const toMarkTradeable    = [...pendingTradeableIds].filter(id => !myTradeableIds.has(id));
        const toMarkNotTradeable = [...myTradeableIds].filter(id => !pendingTradeableIds.has(id));
        const results = await Promise.all([
            ...toMarkTradeable.map(id => setTradeBlock(roomId, myTeamRow.id, id, true)),
            ...toMarkNotTradeable.map(id => setTradeBlock(roomId, myTeamRow.id, id, false)),
            updateTeamTradeRequest(myTeamRow.id, {
                note:              teamRequestNote,
                desiredPositions:  [...teamRequestPositions],
                desiredPlayerIds:  [...teamRequestPlayerIds],
                desiredArchetypes: [...teamRequestArchetypes],
            }),
        ]);
        setSavingBlocks(false);
        const firstError = results.find(r => r.error)?.error;
        if (firstError) { setActionError(firstError); return; }
        setBlockSaveSuccess(true);
        setTimeout(() => setBlockSaveSuccess(false), 2000);
        reload();
        refreshTradeData();
    }, [
        roomId, myTeamRow, pendingTradeableIds, myTradeableIds,
        teamRequestNote, teamRequestPositions, teamRequestPlayerIds, teamRequestArchetypes,
        reload, refreshTradeData,
    ]);

    // 드래그&드롭 2컬럼 구성 — "내 선수 목록"(트레이드 블록에 없는 선수) / "트레이드 블록"
    // (있는 선수)으로 로컬 선택 상태(pendingTradeableIds) 기준으로 분리.
    const myRosterAvailable = useMemo(
        () => myRoster.filter(p => !pendingTradeableIds.has(p.id)),
        [myRoster, pendingTradeableIds],
    );
    const myRosterTradeable = useMemo(
        () => myRoster.filter(p => pendingTradeableIds.has(p.id)),
        [myRoster, pendingTradeableIds],
    );

    if (!league || !room) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="animate-spin text-slate-500" size={24} />
            </div>
        );
    }

    if (!league.trade_enabled) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-200 gap-3">
                <ShieldAlert size={36} className="text-slate-600" />
                <p className="text-sm text-slate-500 ko-normal">이 리그는 트레이드가 비활성화되어 있습니다.</p>
            </div>
        );
    }

    // "메세지함" 탭 우측 디테일 패널 — 싱글플레이 인박스(ScoutReportRenderer 등)의 "서신"
    // 디자인 언어(space-y-8 text-slate-300 leading-relaxed, prose 느낌)를 가져오되, 이건
    // 대화체 편지가 아니라 실제 문서 형식(제목/날짜/발신/수신/본문/자산 표/서명 없는 액션
    // 버튼)이라 구조는 사용자가 지정한 "트레이드 제안서" 양식을 그대로 따름. max-w로 폭을
    // 제한하고 mx-auto를 안 줘서 좌측에 붙게 해 실제 종이 문서를 왼쪽에 올려둔 느낌을 냄
    // (카드/배경 박스 없이 순수 텍스트 레이아웃).
    const renderOfferLetter = (offer: TradeOfferRow, opts: { showAccept?: boolean; showReject?: boolean; showCancel?: boolean; direction?: 'incoming' | 'outgoing' }) => {
        const fromTeam = teamById.get(offer.from_team_id);
        const toTeam = teamById.get(offer.to_team_id);
        const mine = offer.league_trade_offer_players.filter(p => p.from_team_id === offer.from_team_id).map(p => p.player_id);
        const theirs = offer.league_trade_offer_players.filter(p => p.from_team_id === offer.to_team_id).map(p => p.player_id);
        const mineTotal = mine.reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0);
        const theirsTotal = theirs.reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0);
        const busy = respondingId === offer.id;
        // 실제(wall-clock) 날짜 대신 인게임 날짜 — 리스트 행과 동일한 근거(sim_date_at_creation).
        const dateLabel = offer.sim_date_at_creation ? offer.sim_date_at_creation.slice(5).replace('-', '/') : '-';
        // 섹션 헤더 공통 스타일 — 발신/수신/팀명(메시지 발신자·자산 컬럼) 전부 동일하게
        // text-sm + 볼드 해제.
        const sectionLabelClass = 'text-sm uppercase text-slate-500 mb-1';

        // 이 오퍼가 내 팀과 관련 있을 때만("발신" 또는 "수신") 수락 시 내 팀 캡 영향을 계산.
        // 내 팀과 무관한 리그 전체 오퍼(어드민이 제3자 오퍼를 열람하는 경우)는 대상 없음.
        const myRole: 'incoming' | 'outgoing' | null =
            myTeamRow && offer.to_team_id === myTeamRow.id ? 'incoming' :
            myTeamRow && offer.from_team_id === myTeamRow.id ? 'outgoing' : null;
        const myOutIds = myRole === 'incoming' ? theirs : mine;
        const myInIds  = myRole === 'incoming' ? mine : theirs;
        const myOutTotal = myOutIds.reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0);
        const myInTotal  = myInIds.reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0);
        const myCurrentTotal = myRoster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
        const myPostTotal = myCurrentTotal - myOutTotal + myInTotal;
        const capRoomRows = myRole ? buildCapRoomRows(myPostTotal) : [];

        // 팀 이름을 로스터 화면 링크로 — 이 파일의 "트레이드 블록" 탭(1134번째 줄 부근)에서
        // 쓰는 team_slug 기반 네비게이션과 동일한 패턴 재사용.
        const renderTeamLink = (team: LeagueTeamRow | null | undefined, extraClassName = '') => (
            <span
                onClick={() => team && navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${team.team_slug}`)}
                className={`${extraClassName} ${team ? 'cursor-pointer hover:underline hover:text-indigo-400' : ''}`}
            >
                {team?.team_name ?? '?'}
            </span>
        );

        const renderAssetColumn = (team: LeagueTeamRow | undefined, playerIds: string[], total: number) => (
            <div>
                <div className={sectionLabelClass}>{renderTeamLink(team)}</div>
                <div className="space-y-1">
                    {playerIds.length === 0 && <p className="text-sm text-slate-600">없음</p>}
                    {playerIds.map(id => {
                        const p = poolByIdWithStats.get(id);
                        const s = statsByPlayerId.get(id);
                        return (
                            <div key={id} className="flex items-center gap-3 text-sm">
                                <PlayerHoverCard player={p} teamAbbr={team?.team_abbr}>
                                    <span
                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(id)}`)}
                                        className="text-slate-200 truncate cursor-pointer hover:underline hover:text-indigo-400 flex-1 min-w-0"
                                    >
                                        {p?.name ?? id}
                                    </span>
                                </PlayerHoverCard>
                                <span className="text-slate-500 shrink-0 w-8 text-center">{p?.position ?? ''}</span>
                                <span className="text-slate-400 shrink-0 w-14 text-right">{(s?.ppg ?? 0).toFixed(1)}Pts</span>
                                <span className="text-slate-400 shrink-0 w-14 text-right">{(s?.rpg ?? 0).toFixed(1)}Reb</span>
                                <span className="text-slate-400 shrink-0 w-14 text-right">{(s?.apg ?? 0).toFixed(1)}Ast</span>
                                <span className="text-slate-500 shrink-0 w-16 text-right">{formatMoney(p?.salary ?? 0)}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-sm font-bold">
                    <span className="text-slate-400">총합</span>
                    <span className="text-white">{formatMoney(total)}</span>
                </div>
            </div>
        );

        return (
            <div className="max-w-5xl space-y-8 text-slate-300 leading-relaxed ko-normal">
                <div>
                    <h1 className="text-xl font-black text-white">트레이드 제안서</h1>
                    <p className="text-sm text-slate-500 mt-1">{dateLabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className={sectionLabelClass}>발신</div>
                        <div className="text-white font-bold">{renderTeamLink(fromTeam)}</div>
                    </div>
                    <div>
                        <div className={sectionLabelClass}>수신</div>
                        <div className="text-white font-bold">{renderTeamLink(toTeam)}</div>
                    </div>
                </div>

                <div>
                    <div className={sectionLabelClass}>{renderTeamLink(fromTeam)}:</div>
                    <p className={offer.message ? 'text-slate-300 italic' : 'text-slate-600'}>
                        {offer.message ? `"${offer.message}"` : '작성된 메시지가 없습니다.'}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-2">
                    {renderAssetColumn(fromTeam, mine, mineTotal)}
                    {renderAssetColumn(toTeam, theirs, theirsTotal)}
                </div>

                {/* 이 트레이드가 수락되면 내 팀의 샐러리캡/사치세/1·2차 에이프런 여유분이 어떻게
                    바뀌는지 — buildCapRoomRows는 "새 제안" 탭의 캡 요약과 동일한 계산/서식을
                    공유(중복 구현 없음). */}
                {myRole && capEnabled && league && (
                    <div className="pt-2 space-y-1 border-t border-slate-700">
                        <div className={sectionLabelClass}>수락 시 {renderTeamLink(myTeamRow)} 캡 여유분 변화</div>
                        {capRoomRows.map(row => (
                            <div key={row.label} className="flex items-center justify-between text-sm">
                                <span className="text-white">{row.label}</span>
                                <span className={`font-semibold ${row.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {row.value >= 0 ? '+' : ''}{formatMoney(row.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* [2026-09-02] 처리된 오퍼는 버튼 대신 결과 메시지를 남겨 "메세지함"에서
                    히스토리로 확인할 수 있게 함 — 색상/문구는 사용자 지정. */}
                {offer.status === 'pending' ? (
                    <div className="flex items-center gap-2">
                        {opts.showAccept && (
                            <button onClick={() => handleRespond(offer.id, 'accept')} disabled={busy}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-40">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 수락하기
                            </button>
                        )}
                        {opts.showReject && (
                            <button onClick={() => handleRespond(offer.id, 'reject')} disabled={busy}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30 disabled:opacity-40">
                                <X size={14} /> 거절하기
                            </button>
                        )}
                        {opts.showCancel && (
                            <button onClick={() => handleRespond(offer.id, 'cancel')} disabled={busy}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40">
                                <X size={14} /> 취소하기
                            </button>
                        )}
                    </div>
                ) : offer.status === 'accepted' ? (
                    <p className="text-sm font-bold text-emerald-400">트레이드가 수락되었습니다!</p>
                ) : offer.status === 'rejected' ? (
                    <p className="text-sm font-bold text-red-400">트레이드가 거절되었습니다.</p>
                ) : offer.status === 'cancelled' ? (
                    <p className="text-sm font-bold text-slate-300">트레이드 제안을 취소하였습니다.</p>
                ) : offer.status === 'expired' ? (
                    <p className="text-sm font-bold text-slate-300">제안이 만료되었습니다.</p>
                ) : null}
            </div>
        );
    };

    // "인박스" 탭 좌측 리스트 — [안읽음점]/발신/수신/날짜/남은시간 5열 표. 헤더와 행이 같은
    // grid-cols를 써야 칸이 어긋나지 않으므로 클래스를 상수로 공유.
    // [2026-09-02] 발신/수신/날짜/남은시간 4개 컬럼 너비를 균일하게(1fr씩) — 이전엔
    // 마지막 "남은시간" 컬럼만 1fr라 상태 라벨(짧은 텍스트)이 좌측 리스트 우측에 큰
    // 여백을 남겼음. 안읽음 점 컬럼(14px)만 고정폭 유지.
    const INBOX_ROW_GRID = 'grid grid-cols-[14px_1fr_1fr_1fr_1fr] gap-1.5';

    const renderOfferListRow = (offer: TradeOfferRow) => {
        const opts = getOfferOpts(offer);
        const fromAbbr = teamById.get(offer.from_team_id)?.team_abbr ?? '?';
        const toAbbr = teamById.get(offer.to_team_id)?.team_abbr ?? '?';
        const selected = selectedOffer?.id === offer.id;
        // "받은" 오퍼에만 읽음 개념 적용 — 내가 보낸 건 이미 아는 내용이라 안읽음 점 없음.
        const unread = opts.direction === 'incoming' && !offer.to_team_read_at;
        // 실제(wall-clock) 날짜가 아니라 오퍼 생성 시점의 인게임 날짜(sim_date_at_creation,
        // "YYYY-MM-DD") 표시 — Date() 변환 없이 문자열만 잘라써서 타임존 이슈 자체를 차단.
        // 2026-08-31 이전 생성된 오퍼는 컬럼이 없어 null → "-".
        const dateLabel = offer.sim_date_at_creation ? offer.sim_date_at_creation.slice(5).replace('-', '/') : '-';
        // 표 칸이 좁아 "N일 N시간 남음"의 "남음" 접미사는 생략.
        const remainingLabel = offer.status === 'pending'
            ? formatRemaining(offer.expires_at).replace(' 남음', '')
            : STATUS_LABEL[offer.status];
        return (
            <div
                key={offer.id}
                onClick={() => handleSelectOffer(offer)}
                className={`${INBOX_ROW_GRID} px-3 py-2.5 cursor-pointer border-b border-slate-800/50 items-center text-sm ko-normal transition-colors ${
                    // [2026-09-01] 기본/호버 배경은 순위표·리더보드·트레이드 블록이 전부 쓰는
                    // components/common/Table.tsx 관례(컨테이너/행 bg-slate-900, hover:bg-white/5)로
                    // 통일. 선택 상태만 MultiHeaderNavMenu.tsx의 tabOpen과 동일한 "각진 슬레이트
                    // 계열 플랫 하이라이트"를 그대로 유지(Table.tsx엔 선택 상태 자체가 없음).
                    selected ? 'bg-slate-700 text-white' : 'bg-slate-900 hover:bg-white/5'
                }`}
            >
                {unread ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" /> : <span />}
                {/* 방향(받음/보냄)에 따라 "내 팀"에 해당하는 칸만 밝게 강조 — 어드민 뷰는
                    내 팀 기준 방향이 없는 리그 전체 오퍼라 둘 다 동일하게 표시. */}
                <span className={`truncate font-bold ${opts.direction === 'outgoing' ? 'text-white' : 'text-slate-400'}`}>{fromAbbr}</span>
                <span className={`truncate font-bold ${opts.direction === 'incoming' ? 'text-white' : 'text-slate-400'}`}>{toAbbr}</span>
                <span className="text-slate-400">{dateLabel}</span>
                <span className="text-slate-400 truncate">{remainingLabel}</span>
            </div>
        );
    };

    // "제안 영역"(우측 컬럼) 캡 요약용 — 내 팀 기준 Outgoing/Ingoing/Difference, 그리고
    // 트레이드 성사 후 실제 남는 사치세/1차/2차 에이프런 여유분(절대값 — 각 임계값이
    // 서로 다른 금액이라 여유분도 서로 다르게 나옴. "변동분"이 아니라 "여유분" 자체를
    // 원한다는 피드백 반영: 2026-08-31).
    const outgoingCapTotal = useMemo(
        () => [...cartMine].reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0),
        [cartMine, poolById],
    );
    const ingoingCapTotal = useMemo(
        () => [...cartTheirs].reduce((sum, id) => sum + (poolById.get(id)?.salary ?? 0), 0),
        [cartTheirs, poolById],
    );
    const capDifference = ingoingCapTotal - outgoingCapTotal;
    const myTeamTotalSalaryAfterTrade = useMemo(
        () => myRoster.reduce((sum, p) => sum + (p.salary ?? 0), 0) + capDifference,
        [myRoster, capDifference],
    );

    // 샐러리캡/사치세/1차/2차 에이프런 "여유분" 행 배열 — postTotal(트레이드 반영 후 실제
    // 총 샐러리) 기준으로 각 임계값과의 차이를 계산. league가 없으면(또는 각 항목이 리그
    // 설정에서 꺼져있으면) 그 행 자체를 생략. renderCapSummaryFooter(각 팀 "제공" 패널
    // 하단)와 "캡 변동" 섹션(제안 컬럼) 양쪽에서 공유 — 이전엔 같은 4개 임계값 계산을
    // 두 곳에서 따로 손으로 작성해 하나만 고치면 다른 쪽이 어긋날 위험이 있었음.
    const buildCapRoomRows = (postTotal: number) => {
        if (!league) return [];
        return [
            { label: '샐러리 캡 여유분', value: league.salary_cap_amount - postTotal },
            league.luxury_tax_enabled && { label: '사치세 캡 여유분', value: league.luxury_tax_amount - postTotal },
            league.apron1_enabled && { label: '1차 에이프런 여유분', value: league.apron1_amount - postTotal },
            league.apron2_enabled && { label: '2차 에이프런 여유분', value: league.apron2_amount - postTotal },
        ].filter((r): r is { label: string; value: number } => !!r);
    };

    // "새 제안" 탭의 각 "제공" 패널 하단 — 이 오퍼로 나가는 선수들의 연봉 합(샐러리 총합)과
    // 트레이드가 그대로 체결됐을 때 이 팀의 실제 샐러리(실행 시 총 샐러리) 기준
    // 샐러리캡/사치세/에이프런 여유분. 샐러리캡이 꺼진 리그에서는 표시 자체가 의미 없어
    // capEnabled일 때만 렌더. 여유분은 "임계값 - 실행 시 총 샐러리"라 양수면 그만큼 여유,
    // 음수면 이미 그 선을 넘었다는 뜻(TeamPayrollTable.tsx의 diffRows와 동일한 부호 규칙 —
    // 초과 시 빨간색). outTotal=이 팀이 내주는 선수 연봉 합, inTotal=이 팀이 받는 선수 연봉 합
    // (호출부에서 이미 메모이즈된 outgoingCapTotal/ingoingCapTotal을 그대로 넘겨 중복 계산 방지).
    const renderCapSummaryFooter = (roster: Player[], outTotal: number, inTotal: number) => {
        if (!capEnabled || !league) return null;
        const currentTotal = roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
        const postTotal = currentTotal - outTotal + inTotal;
        const roomRows = buildCapRoomRows(postTotal);

        return (
            <div className="shrink-0 px-4 py-2 space-y-1 border-y border-slate-800">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 ko-normal">샐러리 총합</span>
                    <span className="text-white font-semibold tabular-nums">{formatMoney(outTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 ko-normal">실행 시 총 샐러리</span>
                    <span className="text-slate-300 font-semibold tabular-nums">{formatMoney(postTotal)}</span>
                </div>
                {roomRows.map(row => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 ko-normal">{row.label}</span>
                        <span className={`font-semibold tabular-nums ${row.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {row.value >= 0 ? '+' : ''}{formatMoney(row.value)}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    // "내 선수 목록"/"트레이드 블록" 두 컬럼이 완전히 동일한 드래그 가능 행을 렌더 —
    // 소스 배열과 드롭 콜백만 다르므로 행 자체는 한 번만 정의해 공유.
    const renderDraggableRow = (p: Player) => (
        <div
            key={p.id}
            draggable
            onDragStart={e => { setDraggedPlayerId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDraggedPlayerId(null)}
            onClick={() => togglePendingTradeable(p.id)}
            className={`flex items-center gap-2.5 px-4 h-9 bg-slate-900 border-b border-slate-800/50 hover:bg-white/[0.03] cursor-grab active:cursor-grabbing transition-opacity ${draggedPlayerId === p.id ? 'opacity-30' : ''}`}
        >
            <GripVertical size={14} className="text-slate-600 shrink-0" />
            <OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-6 !h-6 !text-sm !shadow-none shrink-0" />
            <span className="text-sm font-semibold text-white flex-1 truncate">{p.name}</span>
            <span className="text-sm text-slate-500 shrink-0">{p.position}</span>
        </div>
    );

    // [2026-08-30] 원래 "내 트레이드 블록" 탭이었던 콘텐츠 — 이제 탭 그룹에서 빠지고
    // 우측 "트레이드 블록 수정" 버튼을 눌렀을 때 뜨는 모달 안에서만 렌더된다(renderOfferCard와
    // 동일하게 return 앞에 정의해두는 로컬 렌더 함수 패턴).
    const renderMyBlockPanel = () => (
        // 뎁스차트(DepthRotationBoard) 스타일 참고 — 바디 외곽 패딩 없이 화면을
        // 꽉 채우고, 섹션마다 자체 툴바(px-6 py-3)로 여백을 표현.
        <div className="flex flex-col">
            {/* Modal 자체의 우상단 X는 hideCloseButton으로 꺼두고, 이 툴바 안에 제목 왼쪽
                X 버튼을 직접 둔다 — sticky top-0으로 모달 바디를 스크롤해도 항상 보임. */}
            <div className="sticky top-0 z-20 px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center gap-4 shrink-0">
                <button
                    onClick={() => setShowMyBlockModal(false)}
                    className="p-1 -ml-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
                >
                    <X size={18} />
                </button>
                <h5 className="text-base font-black text-slate-300 uppercase ko-normal flex-1">내 트레이드 블록 설정</h5>
                {myTeamRow && (
                    <div className="flex items-center gap-3 shrink-0">
                        {blockSaveSuccess && (
                            <span className="flex items-center gap-1.5 text-sm text-emerald-400 ko-normal">
                                <Check size={15} /> 저장 완료
                            </span>
                        )}
                        <button
                            onClick={handleSaveTradeable}
                            disabled={(!tradeableDirty && !teamRequestDirty) || savingBlocks}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-black uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {savingBlocks ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            업데이트
                        </button>
                    </div>
                )}
            </div>

            {actionError && (
                <div className="flex items-center gap-2 mx-6 mt-4 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                    <ShieldAlert size={15} className="shrink-0" /> {actionError}
                </div>
            )}

            {!myTeamRow ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 트레이드 블록을 설정할 수 있습니다.</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 h-[320px]">
                        <div
                            className="border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-950"
                            onDragOver={e => e.preventDefault()}
                            onDrop={() => { if (draggedPlayerId) setPendingTradeableMembership(draggedPlayerId, false); setDraggedPlayerId(null); }}
                        >
                            <div className="px-4 py-2 bg-slate-950 sticky top-0 text-sm font-black text-slate-500 uppercase border-b border-slate-800 z-10">
                                내 선수 목록 ({myRosterAvailable.length})
                            </div>
                            {myRosterAvailable.length === 0 && (
                                <p className="text-sm text-slate-600 ko-normal text-center py-6">전원 트레이드 블록에 있습니다.</p>
                            )}
                            {myRosterAvailable.map(renderDraggableRow)}
                        </div>

                        <div
                            className="overflow-y-auto custom-scrollbar bg-slate-950"
                            onDragOver={e => e.preventDefault()}
                            onDrop={() => { if (draggedPlayerId) setPendingTradeableMembership(draggedPlayerId, true); setDraggedPlayerId(null); }}
                        >
                            <div className="px-4 py-2 bg-slate-950 sticky top-0 text-sm font-black text-emerald-500 uppercase border-b border-slate-800 z-10">
                                트레이드 블록 ({myRosterTradeable.length})
                            </div>
                            {myRosterTradeable.length === 0 && (
                                <p className="text-sm text-slate-600 ko-normal text-center py-6">선수 카드를 이쪽으로 드래그하세요.</p>
                            )}
                            {myRosterTradeable.map(renderDraggableRow)}
                        </div>
                    </div>

                    {/* 트레이드 블록(선수 목록)과는 별개 — 팀 단위로 "원하는 대가"를 공개하는 위시리스트. */}
                    <div className="py-4 border-t border-slate-800 space-y-6 divide-y divide-slate-800 shrink-0 pb-6">
                        <div className="w-1/2 px-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-white ko-normal">요구사항 메모</span>
                                    <button
                                        onClick={() => setTeamRequestNote('')}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                    >
                                        <RotateCcw size={12} /> 초기화
                                    </button>
                                </div>
                                <span className="text-sm text-slate-600">{teamRequestNote.length}/200</span>
                            </div>
                            <textarea
                                value={teamRequestNote}
                                onChange={e => setTeamRequestNote(e.target.value.slice(0, 200))}
                                placeholder="트레이드 시장에서 원하는 요구사항을 입력하세요."
                                rows={3}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none ko-normal"
                            />
                        </div>

                        <div className="px-6 pt-4">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-base font-bold text-white ko-normal">원하는 포지션</span>
                                <button
                                    onClick={() => setTeamRequestPositions(new Set())}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                >
                                    <RotateCcw size={12} /> 초기화
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {DESIRED_POSITIONS.map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => toggleTeamRequestPosition(pos)}
                                        className={`px-2.5 py-1 rounded-lg border text-sm font-bold transition-colors ${
                                            teamRequestPositions.has(pos) ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-white/5'
                                        }`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 pt-4">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-base font-bold text-white ko-normal">원하는 아키타입</span>
                                <button
                                    onClick={() => setTeamRequestArchetypes(new Set())}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                >
                                    <RotateCcw size={12} /> 초기화
                                </button>
                            </div>
                            <div className="space-y-2.5">
                                {ARCHETYPE_GROUPS.map(group => (
                                    <div key={group.label} className="flex items-start gap-3">
                                        <span className="text-sm font-bold text-slate-300 ko-normal w-8 pt-1 shrink-0">{group.label}</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.keys.map(key => (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleTeamRequestArchetype(key)}
                                                    className={`px-2.5 py-1 rounded-lg border text-sm font-bold transition-colors ${
                                                        teamRequestArchetypes.has(key) ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    {ARCHETYPE_LABEL[key]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 pt-4">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-base font-bold text-white ko-normal">원하는 특정 선수</span>
                                <button
                                    onClick={() => { setTeamRequestPlayerIds(new Set()); setTeamRequestPlayerQuery(''); }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                >
                                    <RotateCcw size={12} /> 초기화
                                </button>
                            </div>
                            <div className="max-w-md relative">
                                <input
                                    value={teamRequestPlayerQuery}
                                    onChange={e => setTeamRequestPlayerQuery(e.target.value)}
                                    placeholder="선수 이름 검색"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 ko-normal"
                                />
                                {teamRequestPlayerMatches.length > 0 && (
                                    // 오버레이로 띄워서 아래 콘텐츠(저장 버튼 등)를 밀어내지 않게 함 — absolute + z-index.
                                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                        {teamRequestPlayerMatches.map(mp => (
                                            <button
                                                key={mp.id}
                                                onClick={() => addTeamRequestPlayer(mp.id)}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
                                            >
                                                <span className="text-sm text-white truncate flex-1">{mp.name}</span>
                                                <span className="text-sm text-slate-500 shrink-0">{mp.position}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {teamRequestPlayerIds.size > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-4">
                                    {[...teamRequestPlayerIds].map(id => (
                                        <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold text-white ko-normal">
                                            {poolById.get(id)?.name ?? id}
                                            <button onClick={() => removeTeamRequestPlayer(id)} className="text-white/70 hover:text-white">
                                                <X size={11} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            <TabBar
                tabs={TABS.map(t => t.id === 'inbox' ? { ...t, badge: unreadInboxCount } : t)}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                rightSlot={
                    <button
                        onClick={() => setShowMyBlockModal(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-black uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                        트레이드 블록 수정
                    </button>
                }
            />

            {/* "히스토리" 탭 전용 필터 — 뉴스피드(MultiNewsFeedView.tsx) 필터 바와 동일한
                h-[36px] pill 톤(검색 인풋은 리더보드 LeaderboardToolbar.tsx 패턴 재사용). */}
            {activeTab === 'history' && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
                    <div className="relative h-[36px] bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0 w-56">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <Search size={14} />
                        </div>
                        <input
                            type="text"
                            placeholder="팀, 선수 이름 검색"
                            value={historySearch}
                            onChange={e => setHistorySearch(e.target.value)}
                            className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600 ko-normal"
                        />
                        {historySearch && (
                            <button
                                onClick={() => setHistorySearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <select
                        value={historyTeamFilter}
                        onChange={e => setHistoryTeamFilter(e.target.value)}
                        className={`h-[36px] px-3 bg-slate-900 rounded-lg border shadow-sm text-sm font-bold outline-none cursor-pointer transition-colors ${historyTeamFilter ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-800 hover:border-slate-700 text-slate-400'}`}
                    >
                        <option value="">전체 팀</option>
                        {sortedTeams.map(t => (
                            <option key={t.id} value={t.id}>{t.team_name}</option>
                        ))}
                    </select>

                    <div className="flex items-center h-[36px] bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0">
                        <div className="pl-3 pr-2 flex items-center justify-center text-slate-500 shrink-0">
                            <Calendar size={14} />
                        </div>
                        <input
                            type="date"
                            value={historyDateFrom}
                            onChange={e => setHistoryDateFrom(e.target.value)}
                            max={historyDateTo || undefined}
                            className="h-full bg-transparent px-1 text-sm text-slate-400 outline-none [color-scheme:dark] w-[124px]"
                            title="시작 날짜"
                        />
                        <span className="text-slate-600 text-xs">~</span>
                        <input
                            type="date"
                            value={historyDateTo}
                            onChange={e => setHistoryDateTo(e.target.value)}
                            min={historyDateFrom || undefined}
                            className="h-full bg-transparent px-1 text-sm text-slate-400 outline-none [color-scheme:dark] w-[124px]"
                            title="종료 날짜"
                        />
                    </div>

                    {hasHistoryFilter && (
                        <button
                            onClick={resetHistoryFilters}
                            className="flex items-center gap-1 h-[36px] px-3 rounded-lg text-sm font-bold text-slate-500 hover:text-white transition-colors"
                        >
                            <X size={12} /> 필터 초기화
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                {initialLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="animate-spin text-slate-500" size={22} />
                    </div>
                ) : activeTab === 'leagueBlocks' ? (
                    <Table className="!rounded-none !shadow-none !border-t-0" fullHeight={false} tableStyle={{ tableLayout: 'auto', width: '100%' }}>
                        {/* [2026-08-30] table-layout:fixed + colgroup 퍼센트 방식 폐기 — 제안하기
                            컬럼 하나를 버튼 크기(1%)로 줄이려고 나머지 6개를 억지로 퍼센트 배분했더니
                            총합이 화면 폭을 넘어서 가로 스크롤이 생김. table-layout:auto + width:100%로
                            바꾸면 각 컬럼이 자기 내용(텍스트 길이)에 맞는 만큼만 공간을 요구하고, 브라우저가
                            그 요구를 테이블 전체 폭(100%) 안에서 비율대로 눌러 담아준다 — 텍스트가 많은
                            컬럼(요구사항/매물 선수 등)은 넓게, 팀 약어·제안하기 버튼처럼 내용이 짧은
                            컬럼은 좁게 자동으로 정해지고, 테이블이 화면 폭을 넘지 않는다(각 열이
                            !whitespace-normal break-words로 줄바꿈 가능해야 이 방식이 성립). */}
                        <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                            <tr className="h-10 text-slate-500 text-sm font-black uppercase">
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">팀</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">요구사항</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">매물 선수</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">요구 포지션</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">아키타입</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">요구 선수</TableHeaderCell>
                                <TableHeaderCell className="bg-slate-950" width="1%" />
                            </tr>
                        </TableHead>
                        <TableBody>
                            {sortedTeams.map(t => {
                                const tradeableIds = [...(tradeableByTeam.get(t.id) ?? new Set<string>())];
                                const note              = t.trade_request_note;
                                const desiredPositions   = t.trade_request_positions;
                                const desiredArchetypes  = t.trade_request_archetypes as OvrArchetype[];
                                const desiredPlayerIds   = t.trade_request_player_ids;
                                // 매물 선수/요구 포지션/아키타입/요구 선수 전부 행을 늘리지 않고 팀당 한 줄로
                                // 이어붙인다 — 팀 하나당 <tr> 하나. 선수 이름은 각각 클릭 가능해야 해서(선수
                                // 상세 화면 이동) 요구 포지션/아키타입과 달리 단순 join 문자열이 아니라
                                // renderPlayerList()로 개별 <span>을 렌더.
                                const posText  = desiredPositions.length > 0 ? desiredPositions.join(', ') : null;
                                const archText = desiredArchetypes.length > 0 ? desiredArchetypes.map(k => ARCHETYPE_LABEL[k] ?? k).join(', ') : null;
                                // create_trade_offer RPC 자체가 DB 레벨에서 인간 GM이 있는 팀(humanTargetTeams)만
                                // 대상으로 허용 — AI 팀 행은 버튼을 계속 보여주되 비활성화(disabled)만 시키고,
                                // 내 팀 행은 자기 자신에게 제안할 수 없으므로 버튼 자체를 렌더하지 않는다.
                                const isOwnTeam = t.id === myTeamRow?.id;
                                const isTargetable = humanTargetTeams.some(ht => ht.id === t.id);

                                return (
                                    // 셀 호버 효과(TableRow 기본값)를 원하지 않아 이 테이블만 순수 <tr>을 사용.
                                    <tr key={t.id}>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5">
                                            <span
                                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${t.team_slug}`)}
                                                className="font-bold text-white ko-normal text-sm cursor-pointer hover:underline hover:text-indigo-400"
                                            >
                                                {t.team_abbr}
                                            </span>
                                        </TableCell>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5">
                                            {note ? (
                                                <span className="italic text-slate-300 ko-normal text-sm whitespace-pre-wrap">“{note}”</span>
                                            ) : (
                                                <span className="text-slate-600 text-sm">없음</span>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 !whitespace-normal break-words">
                                            {tradeableIds.length > 0 ? renderPlayerList(tradeableIds) : (
                                                <span className="text-slate-600 text-sm">없음</span>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 !whitespace-normal break-words">
                                            {posText ? (
                                                <span className="text-slate-300 ko-normal text-sm">{posText}</span>
                                            ) : (
                                                <span className="text-slate-600 text-sm">없음</span>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 !whitespace-normal break-words">
                                            {archText ? (
                                                <span className="text-slate-300 ko-normal text-sm">{archText}</span>
                                            ) : (
                                                <span className="text-slate-600 text-sm">없음</span>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 !whitespace-normal break-words">
                                            {desiredPlayerIds.length > 0 ? renderPlayerList(desiredPlayerIds) : (
                                                <span className="text-slate-600 text-sm">없음</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center align-top py-2.5" style={{ width: '1%' }}>
                                            {!isOwnTeam && (
                                                <button
                                                    disabled={!isTargetable}
                                                    onClick={() => { setTargetTeamId(t.id); setActiveTab('new'); }}
                                                    className={`px-3 py-1 rounded-md text-sm font-black ko-normal transition-colors ${
                                                        isTargetable
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                                                            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                                    }`}
                                                >
                                                    제안하기
                                                </button>
                                            )}
                                        </TableCell>
                                    </tr>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : activeTab === 'new' ? (
                    // [2026-08-30] 다른 탭들과 달리 이 탭엔 바깥 여백(p-8)을 안 준다 — 3열 레이아웃이
                    // 화면 가장자리까지 꽉 차야 한다는 요청 반영. actionError/sendSuccess는 이 탭
                    // 전용으로 여기서만 표시(공용 wrapper 밖으로 뺐으므로 중복 없음).
                    <div className="space-y-4">
                        {actionError && (
                            <div className="flex items-center gap-2 mx-4 mt-4 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                                <ShieldAlert size={15} className="shrink-0" /> {actionError}
                            </div>
                        )}
                        {!myTeamRow ? (
                            <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 제안을 보낼 수 있습니다.</p>
                        ) : humanTargetTeams.length === 0 ? (
                            <p className="text-sm text-slate-500 ko-normal py-8 text-center">제안을 보낼 수 있는 상대(사람이 운영하는 다른 팀)가 없습니다.</p>
                        ) : (
                            <div className="space-y-4">
                                {/* 3열 레이아웃 — 좌:내 팀(로스터+제공 요약) / 중앙:상대 팀(로스터+제공 요약) /
                                    우:제안 메시지+전송 버튼. [2026-08-31] 원래 중앙에 있던 두 "제공" 패널을
                                    각자 해당 팀의 로스터 리스트 바로 아래로 옮기고, 원래 우측이던 상대 팀
                                    로스터를 중앙으로, 원래 중앙이던 메시지/버튼을 우측으로 이동. 선수를
                                    리스트에서 클릭하면 그 팀의 제공 패널로 "이동"(리스트에서 사라지고
                                    제공 패널에 나타남), 제공 패널에서 다시 클릭하면 원래 리스트로 돌아간다 —
                                    toggleMine/toggleTheirs가 이미 add/remove를 함께 처리하므로 두 위치에서
                                    같은 핸들러를 재사용. 3개 영역 전부 배경/테두리/라운드 컨테이너를 없애
                                    플랫하게 만들고, 컬럼 사이엔 divide-x로 구분선. 로스터 리스트 + 제공
                                    패널 리스트 전부 "내 트레이드 블록 수정" 모달의 리스트 행 디자인
                                    (PlayerChip — OvrBadge+이름+포지션, h-9, border-b 구분선)을 재사용. */}
                                {/* [2026-08-31] grid grid-cols-3 → flex 전환. CSS Grid의 grid item은
                                    기본 min-width:auto라 내용(연봉/연차 텍스트가 붙은 PlayerChip 행)이
                                    1fr 몫보다 넓으면 트랙 자체가 그 내용에 맞춰 넓어지고, 다른 컬럼도
                                    같이 밀려서 "선수 추가하면 폭이 늘어나고 높이가 줄어드는" 현상이
                                    있었음(grid-auto-rows가 늘어난 콘텐츠에 맞춰 재계산되면서 h-[700px]
                                    고정도 흔들림). flex + 각 컬럼 min-w-0으로 바꾸면 flex-basis(1/3)를
                                    절대 넘지 않고 넘치는 내용은 그 안에서 truncate/스크롤 처리되며,
                                    높이는 flex 기본 align-items:stretch가 h-[700px] 부모 높이를 그대로
                                    보장(grid의 align-content/auto-rows 얽힌 계산에 안 기댐). */}
                                <div className="flex divide-x divide-slate-800 bg-slate-950 h-[700px]">
                                    <div className="flex-[5] min-w-0 h-[700px] overflow-hidden flex flex-col bg-slate-900">
                                        <div
                                            className="h-10 flex items-center pl-4 text-sm font-normal uppercase ko-normal shrink-0"
                                            style={{
                                                backgroundColor: myTeamRow.color_primary,
                                                color: myTeamRow.color_text ?? getReadableTextColor(myTeamRow.color_primary),
                                            }}
                                        >
                                            <span className="truncate min-w-0">{myTeamRow.team_name}</span>
                                        </div>
                                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                            <table className="w-full table-fixed border-collapse">
                                                <PlayerTableCols showContract={capEnabled} />
                                                <PlayerListHeader showContract={capEnabled} sortConfig={mySortConfig} onSort={handleMySort} />
                                                <tbody>
                                                    {myRosterListed.map(p => (
                                                        <PlayerChip key={p.id} player={poolByIdWithStats.get(p.id) ?? p} playerId={p.id} showContract={capEnabled} stats={statsByPlayerId.get(p.id)} onToggle={() => toggleMine(p.id)} teamAbbr={myTeamRow.team_abbr} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 내 팀 제공 요약 — 원래 중앙 컬럼 상단에 있던 패널을 내 팀 로스터 바로 아래로.
                                            [2026-08-31] 빨강 틴트 제거하고 다른 헤더들과 동일한 slate 계열로 복귀,
                                            리스트 영역은 max-h(콘텐츠에 따라 줄어듦) 대신 고정 h로 바꿔 0명일 때와
                                            1명일 때 패널 높이가 달라지던 문제 해결. */}
                                        <div className="shrink-0 flex flex-col border-t border-slate-800">
                                            <div className="h-10 flex items-center bg-slate-900 pl-4 text-sm font-normal text-white uppercase ko-normal shrink-0">
                                                {myTeamRow.team_name} 제공 ({cartMine.size})
                                            </div>
                                            <div className="h-[220px] overflow-y-auto custom-scrollbar bg-slate-900/50">
                                                {cartMine.size === 0 ? (
                                                    <p className="text-sm text-slate-600 ko-normal text-center py-6">왼쪽에서 선수를 선택하세요.</p>
                                                ) : (
                                                    <table className="w-full table-fixed border-collapse">
                                                        <PlayerTableCols showContract={capEnabled} />
                                                        <tbody>
                                                            {[...cartMine].map(id => (
                                                                <PlayerChip key={id} player={poolByIdWithStats.get(id)} playerId={id} showContract={capEnabled} stats={statsByPlayerId.get(id)} actionIcon="remove" onToggle={() => toggleMine(id)} teamAbbr={myTeamRow.team_abbr} />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                            {renderCapSummaryFooter(myRoster, outgoingCapTotal, ingoingCapTotal)}
                                        </div>
                                    </div>

                                    <div className="flex-[5] min-w-0 h-[700px] overflow-hidden flex flex-col bg-slate-900">
                                        <div
                                            className="h-10 flex items-center pl-4 shrink-0"
                                            style={{
                                                backgroundColor: targetTeamRow?.color_primary ?? '#0f172a',
                                                color: targetTeamRow?.color_text ?? getReadableTextColor(targetTeamRow?.color_primary ?? '#0f172a'),
                                            }}
                                        >
                                            <select
                                                value={targetTeamId}
                                                onChange={e => {
                                                    // 이미 담긴 선수가 있는데 상대 팀을 바꾸면 targetTeamId 변경 시
                                                    // 실행되는 useEffect가 cartMine/cartTheirs를 초기화하므로,
                                                    // 사용자에게 먼저 확인받는다(취소 시 select는 controlled value로
                                                    // 그대로 원복됨 — setTargetTeamId를 안 부르면 targetTeamId가
                                                    // 안 바뀌어 React가 DOM 선택값을 원래대로 되돌려줌).
                                                    if ((cartMine.size > 0 || cartTheirs.size > 0)
                                                        && !window.confirm('팀을 변경하면 현재 작성 중인 제안 내용이 초기화됩니다. 계속하시겠습니까?')) {
                                                        return;
                                                    }
                                                    setTargetTeamId(e.target.value);
                                                }}
                                                className="w-auto bg-transparent text-sm font-normal uppercase ko-normal focus:outline-none cursor-pointer"
                                                style={{ color: 'inherit' }}
                                            >
                                                {humanTargetTeams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                            <table className="w-full table-fixed border-collapse">
                                                <PlayerTableCols showContract={capEnabled} />
                                                <PlayerListHeader showContract={capEnabled} sortConfig={targetSortConfig} onSort={handleTargetSort} />
                                                <tbody>
                                                    {targetRosterListed.map(p => (
                                                        <PlayerChip key={p.id} player={poolByIdWithStats.get(p.id) ?? p} playerId={p.id}
                                                            blocked={!targetTradeableIds.has(p.id) && !isTestUnblockedTarget}
                                                            showContract={capEnabled}
                                                            stats={statsByPlayerId.get(p.id)}
                                                            onToggle={() => toggleTheirs(p.id)}
                                                            teamAbbr={targetTeamRow?.team_abbr} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* 상대 팀 제공 요약 — 원래 중앙 컬럼 하단에 있던 패널을 상대 팀 로스터 바로 아래로. */}
                                        <div className="shrink-0 flex flex-col border-t border-slate-800">
                                            <div className="h-10 flex items-center bg-slate-900 pl-4 text-sm font-normal text-white uppercase ko-normal shrink-0">
                                                {targetTeamRow?.team_name} 제공 ({cartTheirs.size})
                                            </div>
                                            <div className="h-[220px] overflow-y-auto custom-scrollbar bg-slate-900/50">
                                                {cartTheirs.size === 0 ? (
                                                    <p className="text-sm text-slate-600 ko-normal text-center py-6">오른쪽에서 선수를 선택하세요.</p>
                                                ) : (
                                                    <table className="w-full table-fixed border-collapse">
                                                        <PlayerTableCols showContract={capEnabled} />
                                                        <tbody>
                                                            {[...cartTheirs].map(id => (
                                                                <PlayerChip key={id} player={poolByIdWithStats.get(id)} playerId={id} showContract={capEnabled} stats={statsByPlayerId.get(id)} actionIcon="remove" onToggle={() => toggleTheirs(id)} teamAbbr={targetTeamRow?.team_abbr} />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                            {renderCapSummaryFooter(targetRoster, ingoingCapTotal, outgoingCapTotal)}
                                        </div>
                                    </div>

                                    <div className="flex-[2] min-w-0 h-[700px] overflow-hidden flex flex-col bg-slate-900">
                                        {/* [2026-08-31] 제안 내역만 이 스크롤 영역 안에 가두고, 캡 변동/메시지/
                                            전송 버튼은 그 아래 shrink-0으로 항상 고정 노출 — 담긴 선수가
                                            많아져서 제안 내역이 길어져도 전송 버튼이 화면 밖으로 밀려나거나
                                            스크롤해야 보이는 일이 없게 함(이전엔 컬럼 전체가 하나의 스크롤
                                            영역이라 내역이 길면 버튼까지 잘려 보였음). 빈 공간은 이 영역
                                            자체가 slate-950이라 항상 자연스럽게 채워짐. */}
                                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                                            {/* 제안 내역 — 양쪽 팀이 제공하는 선수를 이름+연봉으로 재확인.
                                                선수가 0명이어도 섹션/팀 라벨 자체는 항상 보이게(각 팀 footer의
                                                "제공 (0)" 헤더와 동일한 관례 — 선수 목록만 없을 때 자연히
                                                빈 채로 둠). */}
                                            <div className="pt-4 px-4 space-y-3">
                                                <span className="text-base font-black text-white uppercase ko-normal">제안 내역</span>
                                                <div className="space-y-1">
                                                    <span className="text-sm text-slate-400 ko-normal">{myTeamRow.team_name} 제공 ({cartMine.size})</span>
                                                    {[...cartMine].map(id => {
                                                        const p = poolById.get(id);
                                                        return (
                                                            <div key={id} className="flex items-center justify-between text-sm">
                                                                <span className="text-slate-200 ko-normal truncate">{p?.name ?? id}</span>
                                                                {capEnabled && <span className="text-slate-500 tabular-nums shrink-0">{formatMoney(p?.salary ?? 0)}</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-sm text-slate-400 ko-normal">{targetTeamRow?.team_name} 제공 ({cartTheirs.size})</span>
                                                    {[...cartTheirs].map(id => {
                                                        const p = poolById.get(id);
                                                        return (
                                                            <div key={id} className="flex items-center justify-between text-sm">
                                                                <span className="text-slate-200 ko-normal truncate">{p?.name ?? id}</span>
                                                                {capEnabled && <span className="text-slate-500 tabular-nums shrink-0">{formatMoney(p?.salary ?? 0)}</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 캡 요약 — 내 팀(제안 발신 팀) 기준 Outgoing/Ingoing/Difference와,
                                            이 트레이드가 성사되면 내 팀의 사치세/1차/2차 에이프런 여유분이
                                            얼마나 바뀌는지(모두 -capDifference로 동일하게 변함 — 임계값
                                            자체는 고정이고 내 팀 토탈 샐러리만 그만큼 바뀌므로).
                                            스크롤 영역 밖(shrink-0)이라 제안 내역이 길어져도 항상 보임. */}
                                        {capEnabled && (
                                            <div className="shrink-0 px-4 py-4 space-y-1 border-y border-slate-800">
                                                <span className="text-sm font-black text-slate-500 uppercase ko-normal">캡 변동 ({myTeamRow.team_name})</span>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-500 ko-normal">샐러리 감소</span>
                                                    <span className="text-white font-semibold tabular-nums">{formatMoney(outgoingCapTotal)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-500 ko-normal">샐러리 증가</span>
                                                    <span className="text-white font-semibold tabular-nums">{formatMoney(ingoingCapTotal)}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-500 ko-normal">차이</span>
                                                    <span className={`font-semibold tabular-nums ${capDifference <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {capDifference > 0 ? '+' : ''}{formatMoney(capDifference)}
                                                    </span>
                                                </div>
                                                {buildCapRoomRows(myTeamTotalSalaryAfterTrade).map(row => (
                                                    <div key={row.label} className="flex items-center justify-between text-sm">
                                                        <span className="text-slate-500 ko-normal">{row.label}</span>
                                                        <span className={`font-semibold tabular-nums ${row.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {row.value >= 0 ? '+' : ''}{formatMoney(row.value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 제안 메시지/전송 버튼 — 스크롤 영역 밖(shrink-0)이라 제안 내역이
                                            길어져도 항상 화면에 보임. */}
                                        <div className="shrink-0 pt-4 px-4 pb-4 space-y-3 border-b border-slate-800">
                                            <textarea
                                                value={message} onChange={e => setMessage(e.target.value.slice(0, 300))}
                                                placeholder="제안 메시지 (선택, 300자 이내)"
                                                rows={2}
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none ko-normal"
                                            />

                                            <button
                                                onClick={handleSend}
                                                disabled={sending || (cartMine.size === 0 && cartTheirs.size === 0)}
                                                className={`w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-black uppercase transition-all text-white disabled:cursor-not-allowed ${
                                                    sendSuccess ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40'
                                                }`}
                                            >
                                                {sendSuccess ? '트레이드 제안을 보냈습니다' : '제안 보내기'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'inbox' ? (
                    // [2026-08-31] 싱글플레이 인박스(좌:리스트 30%/우:디테일 70%, 클릭 시 전환)와
                    // 동일한 패턴 적용. 리스트 행은 renderOfferListRow(압축), 디테일 패널은
                    // 기존 renderOfferCard를 그대로 재사용(내용/버튼 로직 중복 없음).
                    <div className="flex flex-col h-full">
                        {actionError && (
                            <div className="flex items-center gap-2 mx-4 mt-4 mb-2 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal shrink-0">
                                <ShieldAlert size={15} className="shrink-0" /> {actionError}
                            </div>
                        )}
                        <div className="flex-1 min-h-0 flex">
                            <div className="w-[30%] shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900">
                                <div className="sticky top-0 z-10 bg-slate-950">
                                    {/* [2026-09-02] 방향/처리상태 필터 — 뉴스피드(MultiNewsFeedView.tsx)
                                        메시지 타입 체크박스와 동일한 마크업(w-4 h-4 체크박스 + text-sm
                                        굵은 라벨), 다중 선택 시 OR, 빈 선택 = 전체 표시. 헤더 행과 함께
                                        하나의 sticky 컨테이너로 묶어 스크롤 시 같이 고정되게 함. */}
                                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-3 pt-2 pb-2 border-b border-slate-800">
                                        {INBOX_FILTERS.map(f => {
                                            const checked = selectedInboxFilters.includes(f.key);
                                            return (
                                                <div
                                                    key={f.key}
                                                    className="flex items-center gap-1.5 cursor-pointer"
                                                    onClick={() => toggleInboxFilter(f.key)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'}`}>
                                                        {checked && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <span className={`text-sm font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>{f.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className={`${INBOX_ROW_GRID} px-3 py-2 border-b border-slate-800 text-sm font-black uppercase text-slate-500 ko-normal`}>
                                        <span />
                                        <span>발신</span>
                                        <span>수신</span>
                                        <span>날짜</span>
                                        <span>남은시간</span>
                                    </div>
                                </div>
                                {!isAdmin && !myTeamRow ? (
                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center px-4">소속 팀이 없습니다.</p>
                                ) : filteredInboxList.length === 0 ? (
                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center px-4">
                                        {inboxList.length === 0 ? '대기 중인 제안이 없습니다.' : '조건에 맞는 제안이 없습니다.'}
                                    </p>
                                ) : (
                                    filteredInboxList.map(renderOfferListRow)
                                )}
                            </div>
                            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-slate-900 p-10">
                                {selectedOffer ? renderOfferLetter(selectedOffer, getOfferOpts(selectedOffer)) : (
                                    <div className="h-full flex items-center justify-center text-slate-600 text-sm ko-normal">선택된 제안이 없습니다.</div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    // "히스토리" 탭 — [2026-09-02] 카드 목록 → 테이블로 개편. leagueBlocks 탭과
                    // 동일한 Table 컴포넌트/열 구분선(border-r) 패턴 재사용.
                    // [2026-09-02 v2] 사용자 요청 — 트레이드 한 건을 <tr> 한 행이 아니라 "포함된
                    // 선수 수만큼" 행으로 분리(2대2면 선수 행 2개 + 합계 행 1개 = 3행). 날짜/
                    // 제안팀/수락팀/수락일처럼 트레이드 단위로 한 번만 정해지는 값은 rowSpan으로
                    // 그 트레이드의 전체 행에 걸쳐 병합. 양측 선수 수가 다르면(2대3 등) 적은 쪽은
                    // 자기 행 이후 빈 칸으로 두고, 맨 마지막 행에서 양쪽 각각의 연봉 합계만 표시.
                    <Table className="!rounded-none !shadow-none !border-t-0" fullHeight={false} tableStyle={{ tableLayout: 'auto', width: '100%' }}>
                        <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                            <tr className="h-10 text-slate-500 text-sm font-black uppercase">
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">날짜</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">수락일</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">제안 팀</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">선수</TableHeaderCell>
                                <TableHeaderCell align="right" className="pr-4 border-r border-slate-800 bg-slate-950">연봉</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">수락 팀</TableHeaderCell>
                                <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">선수</TableHeaderCell>
                                <TableHeaderCell align="right" className="pr-4 bg-slate-950">연봉</TableHeaderCell>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {filteredHistory.length === 0 ? (
                                <tr>
                                    <TableCell colSpan={8} className="text-center text-slate-500 text-sm py-10">
                                        {history.length === 0 ? '성사된 트레이드가 없습니다.' : '조건에 맞는 트레이드가 없습니다.'}
                                    </TableCell>
                                </tr>
                            ) : filteredHistory.flatMap((o, tradeIdx) => {
                                const fromTeam = teamById.get(o.from_team_id);
                                const toTeam = teamById.get(o.to_team_id);
                                const mine = o.league_trade_offer_players.filter(p => p.from_team_id === o.from_team_id).map(p => p.player_id);
                                const theirs = o.league_trade_offer_players.filter(p => p.from_team_id === o.to_team_id).map(p => p.player_id);
                                const proposedDate = formatSimDateShort(o.sim_date_at_creation);
                                const acceptedDate = formatSimDateShort(o.sim_date_at_resolution);
                                // 선수 행 개수 — 양측 중 더 많은 쪽 기준, 최소 1(둘 다 0명인 경우는
                                // 실질적으로 없지만 방어적으로 유지).
                                const rowCount = Math.max(mine.length, theirs.length, 1);
                                // 트레이드 건끼리 교차 색상(zebra) — 같은 트레이드에 속한 행 전부 동일 배경.
                                const zebraClass = tradeIdx % 2 === 1 ? 'bg-slate-950/40' : undefined;

                                return Array.from({ length: rowCount }, (_, i) => {
                                    const mineId = i < mine.length ? mine[i] : null;
                                    const theirsId = i < theirs.length ? theirs[i] : null;
                                    const mineP = mineId ? poolById.get(mineId) : undefined;
                                    const theirsP = theirsId ? poolById.get(theirsId) : undefined;

                                    return (
                                        <tr key={`${o.id}-${i}`} className={zebraClass}>
                                            {i === 0 && (
                                                <TableCell rowSpan={rowCount} align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 text-sm text-slate-400 whitespace-nowrap">
                                                    {proposedDate}
                                                </TableCell>
                                            )}
                                            {i === 0 && (
                                                <TableCell rowSpan={rowCount} align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5 text-sm text-slate-400 whitespace-nowrap">
                                                    {acceptedDate}
                                                </TableCell>
                                            )}
                                            {i === 0 && (
                                                <TableCell rowSpan={rowCount} align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5">
                                                    <span
                                                        onClick={() => fromTeam && navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${fromTeam.team_slug}`)}
                                                        className="font-bold text-white ko-normal text-sm cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                                                    >
                                                        {fromTeam?.team_name ?? '?'}
                                                    </span>
                                                </TableCell>
                                            )}
                                            <TableCell align="left" className="border-r border-slate-800/30 pl-4 py-2">
                                                {mineId ? renderHistoryPlayerCell(mineId) : (i === 0 && mine.length === 0 ? <span className="text-slate-600 text-sm">없음</span> : null)}
                                            </TableCell>
                                            <TableCell align="right" className="border-r border-slate-800/30 pr-4 py-2 text-sm text-slate-300 whitespace-nowrap">
                                                {mineId ? (mineP?.contract ? formatMoneyFull(mineP.salary) : '-') : ''}
                                            </TableCell>
                                            {i === 0 && (
                                                <TableCell rowSpan={rowCount} align="left" className="border-r border-slate-800/30 pl-4 align-top py-2.5">
                                                    <span
                                                        onClick={() => toTeam && navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${toTeam.team_slug}`)}
                                                        className="font-bold text-white ko-normal text-sm cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                                                    >
                                                        {toTeam?.team_name ?? '?'}
                                                    </span>
                                                </TableCell>
                                            )}
                                            <TableCell align="left" className="border-r border-slate-800/30 pl-4 py-2">
                                                {theirsId ? renderHistoryPlayerCell(theirsId) : (i === 0 && theirs.length === 0 ? <span className="text-slate-600 text-sm">없음</span> : null)}
                                            </TableCell>
                                            <TableCell align="right" className="pr-4 py-2 text-sm text-slate-300 whitespace-nowrap">
                                                {theirsId ? (theirsP?.contract ? formatMoneyFull(theirsP.salary) : '-') : ''}
                                            </TableCell>
                                        </tr>
                                    );
                                });
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            <Modal
                isOpen={showMyBlockModal}
                onClose={() => setShowMyBlockModal(false)}
                size="lg"
                hideCloseButton
                className="!rounded-3xl"
            >
                {renderMyBlockPanel()}
            </Modal>
        </div>
    );
};

export default MultiFrontOfficeView;
