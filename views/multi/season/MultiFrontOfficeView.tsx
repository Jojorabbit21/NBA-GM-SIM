
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Check, Clock, GripVertical, Loader2, RotateCcw, Send, ShieldAlert, X } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { TabBar } from '../../../components/common/TabBar';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { calculatePlayerOvr } from '../../../utils/constants';
import { ARCHETYPE_LABEL, type OvrArchetype } from '../../../utils/ovrEngine';
import {
    createTradeOffer, respondTradeOffer, listPendingTradeOffers, listAllPendingTradeOffers,
    listTradeHistory, listTradeBlocks, setTradeBlock, updateTeamTradeRequest,
    type TradeOfferRow, type TradeOfferAction,
} from '../../../services/multi/tradeService';
import type { Player } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

const DESIRED_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

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

type Tab = 'block' | 'leagueBlocks' | 'inbox' | 'outbox' | 'new' | 'history';

const TABS: { id: Tab; label: string }[] = [
    { id: 'block',        label: '내 트레이드 블록' },
    { id: 'leagueBlocks', label: '트레이드 블록' },
    { id: 'inbox',        label: '받은 제안' },
    { id: 'outbox',       label: '보낸 제안' },
    { id: 'new',          label: '새 제안' },
    { id: 'history',      label: '히스토리' },
];

const TAB_IDS: Tab[] = TABS.map(t => t.id);

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

const PlayerChip: React.FC<{ player?: Player; playerId: string; selected?: boolean; blocked?: boolean; onToggle?: () => void }> = ({
    player, playerId, selected, blocked, onToggle,
}) => (
    <button
        onClick={onToggle}
        disabled={!onToggle || blocked}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
            blocked ? 'opacity-40 cursor-not-allowed' :
            selected ? 'bg-indigo-600/30 ring-1 ring-indigo-500' :
            onToggle ? 'hover:bg-white/5' : ''
        }`}
    >
        <OvrBadge value={player ? calculatePlayerOvr(player) : 0} size="sm" className="shrink-0" />
        <span className="text-sm font-semibold text-white truncate">{player?.name ?? playerId}</span>
        <span className="text-sm text-slate-500 shrink-0">{player?.position ?? ''}</span>
        {blocked && <Ban size={13} className="text-red-400 shrink-0 ml-auto" />}
    </button>
);

const MultiFrontOfficeView: React.FC = () => {
    const { league, room, members, leagueTeams, reload } = useLeagueContext();
    const { session } = useGame();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);

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

    const humanTargetTeams = useMemo(
        () => leagueTeams.filter(t => t.user_id && !t.is_ai && t.id !== myTeamRow?.id)
            .sort((a, b) => a.team_name.localeCompare(b.team_name)),
        [leagueTeams, myTeamRow],
    );

    // 탭 상태를 URL 쿼리스트링(?tab=)에 저장 — 새로고침/뒤로가기 후에도 탭이 유지되고,
    // 딥링크로 특정 탭에 바로 진입할 수 있음(싱글플레이어 FrontOfficeView와 동일한 패턴).
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab');
    const activeTab: Tab = (rawTab && TAB_IDS.includes(rawTab as Tab)) ? (rawTab as Tab) : 'block';
    const setActiveTab = useCallback((tab: Tab) => {
        setSearchParams({ tab }, { replace: true });
    }, [setSearchParams]);
    const [incoming, setIncoming] = useState<TradeOfferRow[]>([]);
    const [outgoing, setOutgoing] = useState<TradeOfferRow[]>([]);
    const [adminAll, setAdminAll] = useState<TradeOfferRow[]>([]);
    const [history, setHistory] = useState<TradeOfferRow[]>([]);
    // [2026-08-24] opt-in 방식으로 반전 — league_trade_blocks에 행이 있으면 "트레이드 가능"
    // (기본값은 전원 불가). 변수명도 그 의미를 따라 tradeable로 통일.
    const [tradeableByTeam, setTradeableByTeam] = useState<Map<string, Set<string>>>(new Map());
    const [loading, setLoading] = useState(true);
    // 최초 1회만 전체 화면 로더를 보여주고, 이후(저장/응답 등으로 인한) 재조회는 이미 그려진
    // 화면을 그대로 유지한 채 조용히 갱신 — "업데이트" 클릭할 때마다 화면이 로더로 통째로
    // 바뀌었다 돌아오는 깜빡임을 없애기 위함.
    const [initialLoading, setInitialLoading] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);
    const [respondingId, setRespondingId] = useState<string | null>(null);

    const refreshTradeData = useCallback(async () => {
        if (!roomId) return;
        setLoading(true);
        const [blocks, historyRows] = await Promise.all([
            listTradeBlocks(roomId),
            listTradeHistory(roomId),
        ]);
        const map = new Map<string, Set<string>>();
        for (const b of blocks) {
            if (!map.has(b.team_id)) map.set(b.team_id, new Set());
            map.get(b.team_id)!.add(b.player_id);
        }
        setTradeableByTeam(map);
        setHistory(historyRows);

        if (myTeamRow) {
            const { incoming: inc, outgoing: out } = await listPendingTradeOffers(roomId, myTeamRow.id);
            setIncoming(inc);
            setOutgoing(out);
        } else {
            setIncoming([]);
            setOutgoing([]);
        }
        if (isAdmin) {
            setAdminAll(await listAllPendingTradeOffers(roomId));
        }
        setLoading(false);
        setInitialLoading(false);
    }, [roomId, myTeamRow, isAdmin]);

    useEffect(() => { refreshTradeData(); }, [refreshTradeData]);

    // "트레이드 블록"(리그 전체 열람) 탭용 — 블록 내용(매물 선수 또는 원하는 대가 위시리스트
    // 중 하나라도)이 있는 팀을 먼저, 그다음 없는 팀 순으로 정렬. 각 그룹 내에서는 팀명
    // 알파벳(A-Z) 순.
    const teamHasBlockContent = useCallback((t: LeagueTeamRow): boolean => {
        const tradeableCount = tradeableByTeam.get(t.id)?.size ?? 0;
        return tradeableCount > 0
            || !!t.trade_request_note
            || t.trade_request_positions.length > 0
            || t.trade_request_archetypes.length > 0
            || t.trade_request_player_ids.length > 0;
    }, [tradeableByTeam]);
    // 내용 있는 팀 → 없는 팀 순서, 각 그룹 내부는 팀명 알파벳(A-Z) 순.
    const teamsWithContent = useMemo(
        () => leagueTeams.filter(teamHasBlockContent).sort((a, b) => a.team_name.localeCompare(b.team_name)),
        [leagueTeams, teamHasBlockContent],
    );
    const teamsWithoutContent = useMemo(
        () => leagueTeams.filter(t => !teamHasBlockContent(t)).sort((a, b) => a.team_name.localeCompare(b.team_name)),
        [leagueTeams, teamHasBlockContent],
    );

    const myTradeableIds = tradeableByTeam.get(myTeamRow?.id ?? '') ?? new Set<string>();
    const myRoster = useMemo(
        () => (myTeamRow?.roster ?? []).map(id => poolById.get(id)).filter((p): p is Player => !!p),
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
        () => (targetTeamRow?.roster ?? []).map(id => poolById.get(id)).filter((p): p is Player => !!p),
        [targetTeamRow, poolById],
    );
    const targetTradeableIds = tradeableByTeam.get(targetTeamId) ?? new Set<string>();

    const [cartMine, setCartMine] = useState<Set<string>>(new Set());
    const [cartTheirs, setCartTheirs] = useState<Set<string>>(new Set());
    useEffect(() => { setCartMine(new Set()); setCartTheirs(new Set()); }, [targetTeamId]);
    const toggleMine = useCallback((id: string) => setCartMine(prev => {
        const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    }), []);
    const toggleTheirs = useCallback((id: string) => setCartTheirs(prev => {
        const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    }), []);
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

    const renderOfferCard = (offer: TradeOfferRow, opts: { showAccept?: boolean; showReject?: boolean; showCancel?: boolean }) => {
        const fromTeam = teamById.get(offer.from_team_id);
        const toTeam = teamById.get(offer.to_team_id);
        const mine = offer.league_trade_offer_players.filter(p => p.from_team_id === offer.from_team_id).map(p => p.player_id);
        const theirs = offer.league_trade_offer_players.filter(p => p.from_team_id === offer.to_team_id).map(p => p.player_id);
        const busy = respondingId === offer.id;
        return (
            <div key={offer.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm ko-normal">
                    <span className="font-bold text-white">{fromTeam?.team_name ?? '?'} → {toTeam?.team_name ?? '?'}</span>
                    <span className="text-slate-500 flex items-center gap-1">
                        <Clock size={13} />
                        {offer.status === 'pending' ? formatRemaining(offer.expires_at) : STATUS_LABEL[offer.status]}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm ko-normal">
                    <div>
                        <div className="text-slate-500 mb-1">{fromTeam?.team_name} 제공</div>
                        <div className="space-y-0.5">
                            {mine.length === 0 && <span className="text-slate-600">없음</span>}
                            {mine.map(id => <div key={id} className="text-white">{poolById.get(id)?.name ?? id}</div>)}
                        </div>
                    </div>
                    <div>
                        <div className="text-slate-500 mb-1">{toTeam?.team_name} 제공</div>
                        <div className="space-y-0.5">
                            {theirs.length === 0 && <span className="text-slate-600">없음</span>}
                            {theirs.map(id => <div key={id} className="text-white">{poolById.get(id)?.name ?? id}</div>)}
                        </div>
                    </div>
                </div>
                {offer.message && (
                    <p className="text-sm text-slate-400 ko-normal bg-slate-800/60 rounded-lg px-3 py-2">"{offer.message}"</p>
                )}
                <div className="flex items-center gap-2">
                    {opts.showAccept && (
                        <button onClick={() => handleRespond(offer.id, 'accept')} disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-700/60 hover:bg-emerald-600/60 text-emerald-200 disabled:opacity-40">
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 수락
                        </button>
                    )}
                    {opts.showReject && (
                        <button onClick={() => handleRespond(offer.id, 'reject')} disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-red-950/60 hover:bg-red-900/60 text-red-300 disabled:opacity-40">
                            <X size={14} /> 거절
                        </button>
                    )}
                    {opts.showCancel && (
                        <button onClick={() => handleRespond(offer.id, 'cancel')} disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40">
                            <X size={14} /> 취소
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                {initialLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="animate-spin text-slate-500" size={22} />
                    </div>
                ) : activeTab === 'block' ? (
                    // 뎁스차트(DepthRotationBoard) 스타일 참고 — 바디 외곽 패딩 없이 화면을
                    // 꽉 채우고, 섹션마다 자체 툴바(px-6 py-3)로 여백을 표현.
                    // h-full 제거 — 컨텐츠가 짧아도 화면 높이를 억지로 채우지 않고 내용물
                    // 높이만큼만 차지하게(컴팩트하게) 한다. 남는 공간은 상위 스크롤 컨테이너의
                    // bg-slate-900 배경이 그대로 채워준다.
                    <div className="flex flex-col">
                        {actionError && (
                            <div className="flex items-center gap-2 mx-6 mt-4 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                                <ShieldAlert size={15} className="shrink-0" /> {actionError}
                            </div>
                        )}

                        {!myTeamRow ? (
                            <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 트레이드 블록을 설정할 수 있습니다.</p>
                        ) : (
                            <>
                                <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between gap-4 shrink-0">
                                    <div>
                                        <h5 className="text-base font-black text-slate-300 uppercase ko-normal">내 트레이드 블록 설정</h5>
                                    </div>
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
                                </div>

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
                                        {myRosterAvailable.map(p => (
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
                                        ))}
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
                                        {myRosterTradeable.map(p => (
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
                                        ))}
                                    </div>
                                </div>

                                {/* 트레이드 블록(선수 목록)과는 별개 — 팀 단위로 "원하는 대가"를 공개하는 위시리스트. */}
                                <div className="py-4 border-t border-slate-800 space-y-6 divide-y divide-slate-800 shrink-0 pb-[500px]">
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
                ) : activeTab === 'leagueBlocks' ? (
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            {teamsWithContent.map(t => {
                                const tradeableIds = [...(tradeableByTeam.get(t.id) ?? new Set<string>())];
                                const note              = t.trade_request_note;
                                const desiredPositions   = t.trade_request_positions;
                                const desiredArchetypes  = t.trade_request_archetypes as OvrArchetype[];
                                const desiredPlayerIds   = t.trade_request_player_ids;
                                return (
                                    <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-base font-bold text-white ko-normal truncate">{t.team_name}</span>
                                            <span className="text-sm text-slate-500 shrink-0">{tradeableIds.length}명</span>
                                        </div>

                                        <div>
                                            <span className="text-sm font-bold text-slate-400 ko-normal block mb-1">트레이드 블록 목록</span>
                                            {tradeableIds.length === 0 ? (
                                                <span className="text-sm text-slate-600 ko-normal">없음</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tradeableIds.map(id => {
                                                        const p = poolById.get(id);
                                                        return (
                                                            <span key={id} className="text-sm px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 ko-normal">
                                                                {p?.name ?? id}{p ? ` · ${p.position}` : ''}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <span className="text-sm font-bold text-slate-400 ko-normal block mb-1">요구사항 문구</span>
                                            {note ? (
                                                <p className="text-sm text-slate-300 ko-normal whitespace-pre-wrap">{note}</p>
                                            ) : (
                                                <span className="text-sm text-slate-600 ko-normal">없음</span>
                                            )}
                                        </div>

                                        <div>
                                            <span className="text-sm font-bold text-slate-400 ko-normal block mb-1">요구 포지션</span>
                                            {desiredPositions.length === 0 ? (
                                                <span className="text-sm text-slate-600 ko-normal">없음</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {desiredPositions.map(pos => (
                                                        <span key={pos} className="px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold text-white">
                                                            {pos}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <span className="text-sm font-bold text-slate-400 ko-normal block mb-1">아키타입</span>
                                            {desiredArchetypes.length === 0 ? (
                                                <span className="text-sm text-slate-600 ko-normal">없음</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {desiredArchetypes.map(key => (
                                                        <span key={key} className="px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold text-white">
                                                            {ARCHETYPE_LABEL[key] ?? key}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <span className="text-sm font-bold text-slate-400 ko-normal block mb-1">요구 선수</span>
                                            {desiredPlayerIds.length === 0 ? (
                                                <span className="text-sm text-slate-600 ko-normal">없음</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {desiredPlayerIds.map(id => (
                                                        <span key={id} className="px-2.5 py-1 rounded-lg border border-indigo-500 bg-indigo-600/30 text-sm font-bold text-white">
                                                            {poolById.get(id)?.name ?? id}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {teamsWithoutContent.length > 0 && (
                            <div>
                                <span className="text-sm font-bold text-slate-500 ko-normal block mb-2">블록 내용 없음 ({teamsWithoutContent.length}팀)</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {teamsWithoutContent.map(t => (
                                        <div key={t.id} className="flex items-center px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
                                            <span className="text-sm font-semibold text-slate-500 ko-normal truncate">{t.team_name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-8 pb-20 space-y-6">
                        {actionError && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                                <ShieldAlert size={15} className="shrink-0" /> {actionError}
                            </div>
                        )}

                        {activeTab === 'inbox' && (
                            <div className="space-y-3">
                                {isAdmin && (
                                    <p className="text-sm text-amber-400 ko-normal flex items-center gap-1.5">
                                        <ShieldAlert size={14} /> 어드민 — 리그 내 모든 대기 중 제안을 강제로 승인/거절/취소할 수 있습니다.
                                    </p>
                                )}
                                {(isAdmin ? adminAll : incoming).length === 0 && (
                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center">대기 중인 제안이 없습니다.</p>
                                )}
                                {(isAdmin ? adminAll : incoming).map(o => renderOfferCard(o, isAdmin
                                    ? { showAccept: true, showReject: true, showCancel: true }
                                    : { showAccept: true, showReject: true }))}
                            </div>
                        )}

                        {activeTab === 'outbox' && (
                            <div className="space-y-3">
                                {!myTeamRow && <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 없습니다.</p>}
                                {myTeamRow && outgoing.length === 0 && (
                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center">보낸 제안이 없습니다.</p>
                                )}
                                {outgoing.map(o => renderOfferCard(o, { showCancel: true }))}
                            </div>
                        )}

                        {activeTab === 'new' && (
                            !myTeamRow ? (
                                <p className="text-sm text-slate-500 ko-normal py-8 text-center">소속 팀이 있어야 제안을 보낼 수 있습니다.</p>
                            ) : humanTargetTeams.length === 0 ? (
                                <p className="text-sm text-slate-500 ko-normal py-8 text-center">제안을 보낼 수 있는 상대(사람이 운영하는 다른 팀)가 없습니다.</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-slate-500 ko-normal shrink-0">상대 팀</span>
                                        <select value={targetTeamId} onChange={e => setTargetTeamId(e.target.value)}
                                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                                            {humanTargetTeams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                                        </select>
                                    </div>

                                    {sendSuccess && (
                                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/40 text-sm text-emerald-400 ko-normal">
                                            <Check size={15} /> 트레이드 제안을 보냈습니다.
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                            <div className="px-3 py-2.5 border-b border-slate-800 text-sm font-bold text-indigo-400 ko-normal">
                                                {myTeamRow.team_name} · {cartMine.size}명 제공
                                            </div>
                                            <div className="p-1.5 space-y-0.5 max-h-96 overflow-y-auto custom-scrollbar">
                                                {myRoster.map(p => (
                                                    <PlayerChip key={p.id} player={p} playerId={p.id}
                                                        selected={cartMine.has(p.id)} onToggle={() => toggleMine(p.id)} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                            <div className="px-3 py-2.5 border-b border-slate-800 text-sm font-bold text-slate-300 ko-normal">
                                                {targetTeamRow?.team_name} · {cartTheirs.size}명 요청
                                            </div>
                                            <div className="p-1.5 space-y-0.5 max-h-96 overflow-y-auto custom-scrollbar">
                                                {targetRoster.map(p => (
                                                    <PlayerChip key={p.id} player={p} playerId={p.id}
                                                        selected={cartTheirs.has(p.id)} blocked={!targetTradeableIds.has(p.id)}
                                                        onToggle={() => toggleTheirs(p.id)} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <textarea
                                        value={message} onChange={e => setMessage(e.target.value.slice(0, 300))}
                                        placeholder="제안 메시지 (선택, 300자 이내)"
                                        rows={2}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none ko-normal"
                                    />

                                    <button
                                        onClick={handleSend}
                                        disabled={sending || (cartMine.size === 0 && cartTheirs.size === 0)}
                                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-black uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                                        제안 보내기 (7일간 유효)
                                    </button>
                                </div>
                            )
                        )}

                        {activeTab === 'history' && (
                            <div className="space-y-3">
                                {history.length === 0 && (
                                    <p className="text-sm text-slate-500 ko-normal py-8 text-center">성사된 트레이드가 없습니다.</p>
                                )}
                                {history.map(o => renderOfferCard(o, {}))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiFrontOfficeView;
