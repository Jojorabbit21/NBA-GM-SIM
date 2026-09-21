
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Loader2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useGame } from '../../../hooks/useGameContext';
import { Modal } from '../../../components/common/Modal';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerCareerHistory } from '../../../hooks/usePlayerCareerHistory';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { getTeamDeadMoney } from '../../../services/multi/teamFinances';
import { calcTeamPayroll } from '../../../services/fa/faMarketBuilder';
import { releasePlayer } from '../../../services/multi/faService';
import { generateSaveTendencies } from '../../../utils/hiddenTendencies';
import { calculatePlayerOvr, countYosFromCareerHistory } from '../../../utils/constants';
import { formatMoney as formatMoneyAbbrev, formatMoneyFull } from '../../../utils/formatMoney';
import { generateScoutReport } from '../../../utils/scoutReport';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../../services/playerDevelopment/archetypeEvaluator';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../../../services/playerPopularity';
import { getMoraleLabel } from '../../../services/moraleService';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
import type { Team } from '../../../types/team';

// 멀티플레이어 방출 확인 화면 — MultiRosterView.tsx의 "방출" 버튼이 즉시 RPC를 호출하는 대신
// 이 화면(/multi/leagues/:leagueId/season/release/:playerId)으로 이동한다.
//
// MultiNegotiationView.tsx(FA 협상 화면)와 같은 3단 레이아웃 언어(좌: 선수 정보 | 중: 대화
// | 우: 폼)를 그대로 복제해 시각적으로 동일하게 구성했지만, 별도 파일로 분리했다 — FA 협상
// 화면은 대사 엔진/인내심/쿨다운/오퍼 협상 상태머신이 깊게 얽혀 있어(1500줄+) 같은 컴포넌트에
// "방출 모드"를 끼워 넣으면 기존 FA 흐름을 깨뜨릴 위험이 컸다. 방출은 "선수와의 대화"가
// 없는 팀의 일방적 결정(waive는 원래 CBA상 협상이 아님)이라 로직 자체도 훨씬 단순함 — 선수가
// 응답하는 대사는 없고(협상이 아니므로), 확정 전까지 대화창은 비어 있다가 "확인" 시점에
// GM 통보 버블만 뜬다(챗 버블 디자인은 MultiNegotiationView.tsx와 동일하게 재사용, 2026-09-21
// 추가). 우측 폼은 "방출 방식 선택 + 캡 현황"이며, 방출 완료 후에는 잠기고 중앙 채팅 하단의
// "나가기"를 눌러야만 화면을 떠난다(체결 후에도 자동으로 안 나가는 MultiNegotiationView.tsx의
// 결정과 동일 원칙).
//
// 방출 방식: waive는 항상 가능하고, [2026-09-21 정정] 잔여 전액을 이번 시즌에 몰아
// 잡지 않는다 — 원래 계약 스케줄 그대로(연도별 실제 금액이 각자의 원래 시즌에) 데드캡을
// 남긴다(docs/domain/nba-salary-cap-2025-26.md §8-2). stretch(2×잔여연수+1년 분산, 총액
// 동일·기간만 늘림)는 체크박스로 얹는 방식이며 자격 조건(투웨이 아님, 잔여 보장액 $25만
// 이상, 팀의 그 시즌 스트레치 총액이 캡의 15% 이내, 마지막 계약연도면 8월 31일 이전)을
// 만족할 때만 체크 가능하다 — migrations/fix_release_player_waive_original_schedule.sql까지
// 포함한 서버 측 검증과 동일한 기준(클라이언트에서 먼저 걸러 불필요한 RPC 왕복/에러를
// 줄임, 서버가 최종 검증).

function formatMoney(dollars: number): string {
    return Math.abs(dollars) < 1_000_000 ? formatMoneyFull(dollars) : formatMoneyAbbrev(dollars);
}

// 'YYYY-YY' 시즌 라벨에서 N시즌 뒤 라벨 계산 — migrations/add_release_player_stretch.sql의
// 서버 측 시즌 라벨 생성과 동일한 산식(연도만 더하고 두 자리로 포맷). 테이블 미리보기가
// 서버가 실제로 만들 라벨과 정확히 같아야 하므로 같은 공식을 그대로 재사용.
function seasonLabelAt(base: string, offset: number): string {
    const y = parseInt(base.split('-')[0], 10) + offset;
    return `${y}-${String(y + 1).slice(-2)}`;
}

type ReleaseMode = 'waive' | 'stretch';

const RELEASE_MODE_LABEL: Record<ReleaseMode, string> = { waive: '웨이브', stretch: '스트레치 프로비전' };

interface ChatMsg {
    id: number;
    role: 'gm' | 'status';
    text: string;
    isSuccess?: boolean;
}

const MultiReleaseView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading, reload, timeline } = useLeagueContext();
    const { tendencySeed, currentSeason, schedule, currentSimDate: roomSimDate } = useSeasonContext();
    const { session } = useGame();
    const navigate = useNavigate();
    const { leagueId, playerId: playerUrlId } = useParams<{ leagueId: string; playerId: string }>();
    const { resolvePlayerId, getPlayerUrlId } = usePlayerShortCodes();
    const playerId = playerUrlId ? resolvePlayerId(playerUrlId) : undefined;

    // 가상 NBA 캘린더 날짜 — MultiRosterView.tsx와 동일한 preferVirtual 패턴. room.sim_date
    // (roomSimDate)는 실제 KST 날짜(서버가 다음 경기 실행 타이밍을 잡는 값)라 스트레치의
    // "8월 31일" 같은 NBA 캘린더 규정과 직접 비교하면 안 됨 — 반드시 findCurrentVirtualDate로
    // 계산한 가상 날짜를 써야 한다(project_sim_date_vs_virtual_date.md에서 실제로 헷갈려
    // 리그레션이 났던 지점).
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;
    const preferVirtual = league?.type === 'main_league';
    const currentVirtualDate = useMemo(() => {
        if (!preferVirtual) return roomSimDate;
        return findCurrentVirtualDate(schedule, simStart, gprd, getServerNow(), timeline) ?? roomSimDate;
    }, [preferVirtual, roomSimDate, schedule, simStart, gprd, timeline]);

    const myTeamRow = useMemo(
        () => leagueTeams.find(t => t.user_id === session?.user?.id) ?? null,
        [leagueTeams, session],
    );

    // 리소스 최소화 — 내 팀 로스터만 조회 대상으로 넘긴다(buildLeagueTeams는 leagueTeams
    // 전체를 구조적으로 필요로 하지만, raw.playersRaw에 없는 다른 팀 선수는 조용히 null로
    // 채워져 필터링되므로 다른 30개 팀 로스터를 통째로 긁어올 필요가 없다).
    const allRosterIds = useMemo(() => myTeamRow?.roster ?? [], [myTeamRow]);
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides).map(t => ({
            ...t,
            deadMoney: getTeamDeadMoney(room?.team_finances, t.id, currentSeason),
        })),
        [leagueTeams, useCustomOverrides, room?.team_finances, currentSeason],
    );
    const { data: teams = [], isPending: teamsLoading } = useLeagueRawStats(room?.id, allRosterIds, selectLeagueTeams, { includePbp: false });

    const myTeam = useMemo(
        () => (myTeamRow ? teams.find(t => t.id === myTeamRow.team_slug) ?? null : null),
        [teams, myTeamRow],
    );
    const livePlayer = useMemo(
        () => (playerId && myTeam ? myTeam.roster.find(p => p.id === playerId) ?? null : null),
        [myTeam, playerId],
    );
    // [2026-09-21] hooks/useCurrentLeague.ts의 league_teams 실시간 구독(300ms 디바운스)이
    // release_player RPC의 roster 변경을 자동으로 반영한다 — 방출 확정 직후(reload()를
    // 부르지 않아도!) leagueTeams.roster에서 이 선수가 사라지고, 그러면 allRosterIds가
    // 줄어 livePlayer가 null이 돼 아래 "!player" 가드가 화면 전체를 "선수를 찾을 수
    // 없습니다"로 덮어써버린다(완료 버블/나가기 버튼째로 사라짐 — 실사용 리포트로 확인).
    // 한 번 찾은 선수는 ref에 고정해두고 그 뒤로 null이 와도 계속 이전 값을 쓴다.
    const frozenPlayerRef = useRef<typeof livePlayer>(null);
    if (livePlayer) frozenPlayerRef.current = livePlayer;
    const player = livePlayer ?? frozenPlayerRef.current;

    const { data: playerCareerHistory } = usePlayerCareerHistory(player?.id, !!player);
    const playerYos = countYosFromCareerHistory(playerCareerHistory);
    const tendencies = useMemo(
        () => (player ? generateSaveTendencies(tendencySeed ?? '', player.id) : null),
        [tendencySeed, player],
    );
    const moraleScore = player?.morale?.score ?? 50;
    const playerArchetypeState = useMemo(
        () => (player ? (player.archetypeState ?? assignArchetypes(player, currentSeason || '2025-26')) : null),
        [player, currentSeason],
    );
    const scoutReport = useMemo(
        () => (player ? generateScoutReport(player, tendencySeed) : []),
        [player, tendencySeed],
    );

    // ── 계약/데드캡 계산 ─────────────────────────────────────────
    const contract = player?.contract;
    const isTwoWay = contract?.type === 'two_way';
    const remainingYears = contract ? contract.years.length - contract.currentYear : 0;
    const totalRemaining = contract ? contract.years.slice(contract.currentYear).reduce((s, v) => s + v, 0) : 0;
    // CBA 공식: (잔여 연수 × 2) + 1년 — docs/domain/nba-salary-cap-2025-26.md §8-4,
    // migrations/add_release_player_stretch.sql과 동일.
    const stretchYearsTotal = Math.max(1, 2 * remainingYears + 1);
    const stretchAnnual = totalRemaining / stretchYearsTotal;

    // 이 팀의 데드캡 전체 목록(시즌 필터 없음) — 아래 15% 체크와 데드캡 테이블의 "기존" 열이
    // 둘 다 여기서 파생된다(중복 조회 방지, services/multi/teamFinances.ts가 유일한 소스).
    const teamDeadMoneyAll = useMemo(
        () => getTeamDeadMoney(room?.team_finances, myTeamRow?.team_slug),
        [room?.team_finances, myTeamRow],
    );
    // 팀이 이번 시즌 이미 스트레치로 잡아둔 금액(15% 상한 체크용) — 서버(RPC)와 동일 기준.
    const existingStretchThisSeason = useMemo(
        () => teamDeadMoneyAll
            .filter(d => d.releaseType === 'stretch' && d.season === currentSeason)
            .reduce((s, d) => s + d.amount, 0),
        [teamDeadMoneyAll, currentSeason],
    );
    const capAmount = league?.salary_cap_amount ?? 0;
    // [2026-09-21] "마지막 계약연도(잔여 1시즌)는 8월 31일까지만 스트레치 가능" — 실제 CBA
    // 규정(docs/domain/nba-salary-cap-2025-26.md §8-4의 타이밍 규정). 그 이후(9월 1일~)
    // 방출하면 완전 바이아웃/웨이브만 가능하고 스트레치는 못 쓴다. 마감일은 현재 시즌
    // (currentSeason='YYYY-YY')의 시작 연도 8월 31일 — 가상 NBA 캘린더 날짜(currentVirtualDate,
    // rooms.sim_date 아님)와 비교한다.
    const seasonStartYear = parseInt((currentSeason || '').split('-')[0], 10) || 0;
    const stretchDeadline = `${seasonStartYear}-08-31`;
    const isFinalContractYear = remainingYears === 1;
    const isPastStretchDeadline = isFinalContractYear && !!currentVirtualDate && currentVirtualDate > stretchDeadline;

    const isStretchEligible =
        !isPastStretchDeadline &&
        !isTwoWay &&
        remainingYears >= 1 &&
        totalRemaining >= 250_000 &&
        (capAmount <= 0 || existingStretchThisSeason + Math.round(stretchAnnual) <= capAmount * 0.15);

    // 스트레치가 불가능한 이유 — isStretchEligible의 조건과 1:1 대응, 우선순위 순서도 동일.
    const stretchReason = isPastStretchDeadline ? '마지막 계약연도(잔여 1시즌)는 8월 31일까지만 스트레치 프로비전을 적용할 수 있습니다'
        : isTwoWay ? '투웨이 계약은 캡에 잡히지 않아 대상이 아닙니다'
        : remainingYears < 1 ? '잔여 계약 시즌이 없습니다'
        : totalRemaining < 250_000 ? '잔여 보장액이 $25만 미만입니다'
        : (capAmount > 0 && existingStretchThisSeason + Math.round(stretchAnnual) > capAmount * 0.15) ? '팀 스트레치 캡 상한(캡의 15%)을 초과합니다'
        : '';

    // 스트레치는 웨이브의 한 방법(체크박스)이지 별도 방출 방식이 아니다 — 드롭다운은 항상
    // "웨이브" 하나뿐이고, 체크박스로 "분산 처리 여부"만 고른다.
    const [stretchChecked, setStretchChecked] = useState(false);
    // 스트레치가 불가능해지면(선수가 바뀌는 등) 체크를 풀어준다.
    useEffect(() => {
        if (stretchChecked && !isStretchEligible) setStretchChecked(false);
    }, [stretchChecked, isStretchEligible]);
    const effectiveMode: ReleaseMode = stretchChecked && isStretchEligible ? 'stretch' : 'waive';

    // 선수의 현재 계약 구조(잔여분만, currentYear부터) — 드롭다운 아래 "현재 계약" 테이블용.
    // yearSeasons가 있으면 그 시즌 라벨을 그대로 쓰고(실제 계약서 상 시즌 연도, 과거 시즌이
    // years 배열 앞쪽에 포함돼 있어도 정확함), 없는 구버전 데이터는 currentSeason부터 순서대로
    // 채워 넣는다(seasonLabelAt 폴백).
    const contractRows = useMemo(() => {
        if (!contract || !currentSeason) return [];
        return contract.years.slice(contract.currentYear).map((amount, i) => {
            const idx = contract.currentYear + i;
            const season = contract.yearSeasons?.[idx] != null
                ? `${contract.yearSeasons[idx]}-${String(contract.yearSeasons[idx] + 1).slice(-2)}`
                : seasonLabelAt(currentSeason, i);
            const opt = contract.options?.find(o => o.year === idx);
            return { season, amount, opt };
        });
    }, [contract, currentSeason]);

    // 연도별 데드캡 테이블 — 이 방출이 실제로 만들 DeadMoneyEntry들을 미리 그대로 계산(서버
    // RPC의 계산과 동일한 산식, migrations/fix_release_player_waive_original_schedule.sql).
    // [2026-09-21 정정] waive는 잔여 전액을 이번 시즌에 몰아 잡는 게 아니다 — 스트레치를
    // 안 쓰면 팀은 원래 계약 스케줄 그대로(연도별 실제 금액이 각자의 원래 시즌에) 데드캡을
    // 남긴다("A team can stick to the original schedule for cap hit purposes" — Hoops
    // Rumors, docs/domain/nba-salary-cap-2025-26.md §8-2). 그래서 waive 모드는
    // contractRows(선수의 잔여 계약 스케줄)를 그대로 재사용하고, stretch만 총액을
    // (잔여연수×2)+1년에 균등 분할한 별도 스케줄로 대체한다. "기존"은 다른 방출로 이미
    // 잡혀있던 그 시즌 데드캡, "추가분"은 이번 방출로 새로 생기는 금액, "합계"는 둘의 합.
    const deadCapRows = useMemo(() => {
        if (!contract || !currentSeason) return [];
        const additions: { season: string; addition: number }[] = effectiveMode === 'stretch'
            ? Array.from({ length: stretchYearsTotal }, (_, i) => ({
                season: seasonLabelAt(currentSeason, i),
                addition: Math.round(stretchAnnual),
            }))
            : contractRows.map(r => ({ season: r.season, addition: r.amount }));
        return additions.map(({ season, addition }) => {
            const existing = teamDeadMoneyAll.filter(d => d.season === season).reduce((s, d) => s + d.amount, 0);
            return { season, existing, addition, total: existing + addition };
        });
    }, [effectiveMode, contract, currentSeason, teamDeadMoneyAll, contractRows, stretchYearsTotal, stretchAnnual]);

    // "팀 샐러리캡 현황" — MultiNegotiationView.tsx의 capInfo와 동일한 소스(calcTeamPayroll)를
    // 쓰되, 방향이 반대다(서명 시 늘어나는 쪽 → 방출 시 줄어드는/데드캡만큼 조정되는 쪽).
    // [2026-09-21 Fix] "방출 후 예상 페이롤"이 위 데드캡 테이블과 다른 값을 낼 수 있던 원인
    // 두 가지를 없앴다: (1) 이번 시즌에 얹히는 금액을 따로 다시 계산하지 않고 deadCapRows[0]
    // (테이블 첫 행 = 항상 이번 시즌)을 그대로 재사용해 두 표시가 절대 어긋나지 않게 함,
    // (2) 빼는 값도 contract에서 다시 계산하지 않고 calcTeamPayroll이 실제로 합산에 쓰는
    // 필드(player.salary)를 그대로 써서 beforePayroll과 정확히 대응되게 함(투웨이는 애초에
    // calcTeamPayroll 합산에서 빠지므로 자동으로 0 처리됨 — 별도 분기 불필요).
    const capInfo = useMemo(() => {
        if (!myTeam || !league || !player || !league.cap_enabled) return null;
        const beforePayroll = calcTeamPayroll({ roster: myTeam.roster, deadMoney: myTeam.deadMoney });
        const outgoingSalary = isTwoWay ? 0 : player.salary;
        const addition = deadCapRows[0]?.addition ?? 0;
        const afterPayroll = beforePayroll - outgoingSalary + addition;
        return {
            capAmount: league.salary_cap_amount,
            luxuryTaxAmount: league.luxury_tax_enabled ? league.luxury_tax_amount : null,
            apron1Amount: league.apron1_enabled ? league.apron1_amount : null,
            apron2Amount: league.apron2_enabled ? league.apron2_amount : null,
            beforePayroll, afterPayroll,
        };
    }, [myTeam, league, player, isTwoWay, deadCapRows]);

    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    // 되돌릴 수 없는 작업이라 "확인" 버튼 클릭만으로 바로 실행하지 않고, 최종 확인 팝업을
    // 한 번 더 거친다(ResetDataModal.tsx와 동일한 취소/확정 2버튼 구성).
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // ── 채팅 상태 ── MultiNegotiationView.tsx와 동일한 패턴(role/text/isSuccess, id 카운터,
    // 자동 스크롤) — 여기선 GM 쪽 메시지만 쓴다(선수와의 협상이 아니라 팀의 일방적 통보라
    // 'player' 롤 버블은 쓰지 않음).
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const idCounter = useRef(0);
    const nextId = () => { idCounter.current += 1; return idCounter.current; };
    const addMsg = (role: ChatMsg['role'], text: string, isSuccess?: boolean) => {
        setChatMessages(prev => [...prev, { id: nextId(), role, text, isSuccess }]);
    };
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

    // 방출 완료 여부 — true가 되면 우측 폼은 잠그고(MultiNegotiationView.tsx의
    // isOfferPanelDisabled와 동일 패턴) 채팅 하단에 "나가기"만 보여준다.
    const [released, setReleased] = useState(false);
    // [2026-09-21] 확정 순간의 계약/데드캡/캡 현황 스냅샷 — released가 true인 동안은 이걸
    // 우선 표시한다(아래 handleConfirm 주석 참고, hooks/useCurrentLeague.ts의 실시간
    // 구독이 myTeam을 곧바로 바꿔버려 live 값을 그대로 쓰면 "방출 전/후"가 뒤섞인다).
    const [releaseSnapshot, setReleaseSnapshot] = useState<{
        contractRows: typeof contractRows;
        deadCapRows: typeof deadCapRows;
        capInfo: typeof capInfo;
    } | null>(null);

    const handleConfirm = async () => {
        if (!myTeamRow || !player || submitting) return;
        setSubmitting(true);
        setActionError(null);
        const { error } = await releasePlayer(myTeamRow.id, player.id, effectiveMode);
        setSubmitting(false);
        if (error) { setActionError(error); return; }
        // [2026-09-21] hooks/useCurrentLeague.ts의 league_teams 실시간 구독이 이 RPC가 커밋한
        // roster 변경을 ~300ms 안에 자동으로 반영한다(reload()를 우리가 부르든 안 부르든
        // 무관 — 드래프트/트레이드/FA서명/방출 전부 같은 채널이 감시). 그 순간 myTeam.roster에서
        // 이 선수가 빠지고 캡 계산(beforePayroll 등)의 기준이 "방출 후" 상태로 조용히
        // 바뀌어버리므로, 확정 시점의 계약/데드캡/캡 현황을 스냅샷으로 고정해 이후 실시간
        // 갱신과 무관하게 "방출 전 → 후" 비교가 항상 이 순간 기준으로 고정 표시되게 한다
        // (player 자체도 위 frozenPlayerRef로 별도 고정 — 안 그러면 !player 가드가 화면
        // 전체를 "선수를 찾을 수 없습니다"로 덮어써버림, 실사용 리포트로 확인된 버그).
        setReleaseSnapshot({ contractRows, deadCapRows, capInfo });
        addMsg('gm', `${player.name} 선수를 ${RELEASE_MODE_LABEL[effectiveMode]} 처리합니다. 그동안 함께해 주셔서 감사합니다.`);
        addMsg('status', '방출 완료', true);
        setReleased(true);
        // [2026-09-21] reload()는 확정 즉시 호출한다(MultiNegotiationView.tsx의 FA 서명 성공
        // 처리와 동일 패턴) — 화면 자체는 위 스냅샷으로 고정 표시되므로 reload가 room.roster를
        // 바꿔도 이 화면엔 영향이 없고, 대신 room.team_finances(데드캡)가 즉시 최신화돼 나중에
        // "뒤로"/"나가기" 등 나가는 경로 중 하나가 reload를 빼먹어 재정 탭이 새로고침 전까지
        // 안 보이던 버그(바로 위 dev-log 항목)가 구조적으로 재발할 여지를 없앤다.
        reload();
    };

    const handleExit = () => {
        navigate(`/multi/leagues/${leagueId}/season/roster`);
    };

    const handleViewProfile = () => {
        if (!leagueId || !player) return;
        navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(player.id)}`);
    };

    if (leagueLoading || teamsLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (!myTeamRow) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-200">
                <ShieldAlert size={28} className="text-slate-600" />
                <p className="text-sm text-slate-500">소속 팀이 있어야 선수를 방출할 수 있습니다.</p>
            </div>
        );
    }

    if (!player) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-200">
                <ShieldAlert size={28} className="text-slate-600" />
                <p className="text-sm text-slate-500">로스터에서 선수를 찾을 수 없습니다.</p>
            </div>
        );
    }

    // 방출 완료 후에는 스냅샷을(있다면) 우선 사용 — live 값은 실시간 구독 때문에 이미
    // "방출 후" 상태로 바뀌어 있을 수 있다(handleConfirm 주석 참고).
    const displayContractRows = releaseSnapshot?.contractRows ?? contractRows;
    const displayDeadCapRows = releaseSnapshot?.deadCapRows ?? deadCapRows;
    const displayCapInfo = releaseSnapshot?.capInfo ?? capInfo;

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200">
            {/* ── Header ── */}
            <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                <button
                    onClick={handleExit}
                    className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                    <span>←</span><span>뒤로</span>
                </button>
                <span className="text-sm font-bold text-white ko-tight">{player.name} 방출</span>
            </div>

            <div className="flex-1 flex divide-x divide-slate-800 bg-slate-950 overflow-hidden min-h-0">

                {/* ── 좌측: 선수 정보 ── (MultiNegotiationView.tsx와 동일 섹션, "요구 조건"만 제외 — 협상이 없으므로 의미 없음) */}
                <div className="flex-[2] min-w-0 bg-slate-900 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                            <OvrBadge value={calculatePlayerOvr(player)} size="md" />
                            <PlayerHoverCard player={player}>
                                <div
                                    onClick={handleViewProfile}
                                    className="text-base font-black text-white ko-tight leading-tight cursor-pointer hover:underline hover:text-indigo-400"
                                >
                                    {player.name}
                                </div>
                            </PlayerHoverCard>
                        </div>
                        <div className="px-4 pb-3 space-y-1">
                            {[
                                { label: '포지션', value: player.position },
                                { label: '나이', value: `${player.age}세` },
                                { label: '키', value: `${player.height}cm` },
                                { label: '몸무게', value: `${player.weight}kg` },
                                { label: '연차', value: `${playerYos}년` },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400">{label}</span>
                                    <span className="text-slate-200">{value}</span>
                                </div>
                            ))}
                        </div>

                        {playerArchetypeState && (
                            <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                <div className="text-sm font-bold uppercase text-white mb-1.5">선수 유형</div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400">아키타입</span>
                                    <span className="font-semibold text-slate-200">{getArchetypeDisplayInfo(playerArchetypeState.primary).label}</span>
                                </div>
                                {playerArchetypeState.secondary && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">보조 유형</span>
                                        <span className="text-slate-300">{getArchetypeDisplayInfo(playerArchetypeState.secondary).label}</span>
                                    </div>
                                )}
                                {playerArchetypeState.tags.slice(0, 4).map((tag, i) => (
                                    <div key={tag} className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">{i === 0 ? '특성' : ''}</span>
                                        <span className="text-slate-300">{getTraitTagDisplayInfo(tag).label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-sm font-bold uppercase text-white mb-1.5">인기도</div>
                            {[
                                { label: '지역적인 인기', value: getLocalPopularityLabel(player.popularity?.local ?? 0) },
                                { label: '전국적인 인기', value: getNationalPopularityLabel(player.popularity?.national ?? 0) },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400">{label}</span>
                                    <span className="text-slate-200">{value}</span>
                                </div>
                            ))}
                        </div>

                        {tendencies && (
                            <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                <div className="text-sm font-bold uppercase text-white mb-1.5">성격 &amp; 기분</div>
                                {(() => {
                                    const t = tendencies;
                                    const moraleColor = moraleScore >= 70 ? 'text-emerald-400' : moraleScore >= 40 ? 'text-amber-400' : 'text-red-400';
                                    const egoLbl = t.ego > 0.35 ? { text: '오만', color: 'text-amber-400' } : t.ego < -0.35 ? { text: '겸손', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                    const finLbl = t.financialAmbition > 0.68 ? { text: '탐욕적', color: 'text-amber-400' } : t.financialAmbition < 0.32 ? { text: '검소', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                    const loyLbl = t.loyalty > 0.65 ? { text: '충성', color: 'text-emerald-400' } : t.loyalty < 0.35 ? { text: '이적욕 강함', color: 'text-red-400' } : { text: '보통', color: 'text-slate-400' };
                                    const winLbl = t.winDesire > 0.65 ? { text: '우승 집착', color: 'text-emerald-400' } : t.winDesire < 0.35 ? { text: '역할 우선', color: 'text-slate-400' } : { text: '보통', color: 'text-slate-400' };
                                    const tmpLbl = t.temperament > 0.45 ? { text: '다혈질', color: 'text-red-400' } : t.temperament < -0.40 ? { text: '냉정', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                    return [
                                        { label: '현재 기분', text: getMoraleLabel(moraleScore), color: moraleColor },
                                        { label: '자존심', ...egoLbl },
                                        { label: '금전욕', ...finLbl },
                                        { label: '팀 충성도', ...loyLbl },
                                        { label: '우승욕', ...winLbl },
                                        { label: '기질', ...tmpLbl },
                                    ].map(({ label, text, color }) => (
                                        <div key={label} className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">{label}</span>
                                            <span className={`font-semibold ${color}`}>{text}</span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}

                        {scoutReport.length > 0 && (
                            <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                <div className="text-sm font-bold uppercase text-white mb-1.5">스카우팅 리포트</div>
                                {[...scoutReport].sort((a, b) => {
                                    const order = { positive: 0, negative: 1, neutral: 2 } as const;
                                    return order[a.sentiment] - order[b.sentiment];
                                }).map((s, i) => (
                                    <div
                                        key={i}
                                        className={`text-sm ${
                                            s.sentiment === 'positive' ? 'text-emerald-400'
                                                : s.sentiment === 'negative' ? 'text-rose-400'
                                                : 'text-slate-200'
                                        }`}
                                    >
                                        {s.sentiment === 'positive' ? '+ ' : s.sentiment === 'negative' ? '- ' : ''}{s.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── 중앙: 대화 — MultiNegotiationView.tsx와 동일한 버블 디자인. 협상이 아니라
                    팀의 일방적 통보라 확정 전까지는 비어 있다가, "확인"을 누르면 GM 통보
                    버블 + 완료 상태 버블이 뜬다. */}
                <div className="flex-[3] min-w-0 bg-slate-900 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        {chatMessages.map(msg => {
                            if (msg.role === 'status') {
                                return (
                                    <div key={msg.id} className="flex justify-center py-1">
                                        <span className={`text-xs italic ${msg.isSuccess ? 'text-emerald-400' : 'text-slate-500'}`}>{msg.text}</span>
                                    </div>
                                );
                            }
                            return (
                                <div key={msg.id} className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    <span className="text-xs font-bold text-indigo-400 px-1">GM</span>
                                    <div className="max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                                        <p className="text-sm text-white leading-relaxed whitespace-pre-line">{msg.text}</p>
                                    </div>
                                </div>
                            );
                        })}
                        {released && (
                            <div className="flex justify-center">
                                <button
                                    onClick={handleExit}
                                    className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
                                >
                                    나가기
                                </button>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* ── 우측: 방출 방식 선택 + 캡 현황 ── 방출 완료 후에는 잠금(MultiNegotiationView.tsx의
                    isOfferPanelDisabled와 동일 패턴) — "나가기"는 중앙 채팅 하단에서만 누를 수 있다. */}
                <div className={`flex-[5] min-w-0 flex flex-col overflow-hidden bg-slate-900 transition-opacity duration-300 ${released ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                    <div className="flex-1 flex divide-x divide-slate-800 overflow-hidden min-h-0">

                        {/* 좌측 단: 방출 방식 — 웨이브가 유일한 방식이고(드롭다운은 항상 "웨이브" 하나뿐,
                            MultiNegotiationView.tsx 루키 스케일 자동 지정 박스와 동일한 스타일),
                            스트레치 프로비전은 그 웨이브를 어떻게 처리할지 고르는 체크박스다(실제
                            CBA상으로도 stretch는 waive의 한 방식이지 독립된 방출 유형이 아님). */}
                        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-sm font-bold uppercase tracking-wider text-slate-400">방출 방식</div>
                                <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-400">
                                    웨이브
                                </div>
                            </div>

                            {/* 스트레치 프로비전 체크박스 — MultiNegotiationView.tsx의 "팀 옵션/플레이어 옵션"
                                체크박스와 동일한 스타일(accent-indigo-500 네이티브 체크박스, 라벨에
                                opacity로 비활성 표시). */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <label className={`flex items-center gap-2 text-sm text-slate-300 ${isStretchEligible ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                                    <input
                                        type="checkbox"
                                        checked={stretchChecked && isStretchEligible}
                                        disabled={!isStretchEligible}
                                        onChange={e => setStretchChecked(e.target.checked)}
                                        className="w-4 h-4 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    스트레치 프로비전
                                </label>
                                {!isStretchEligible && stretchReason && (
                                    <div className="text-sm text-red-400">{stretchReason}</div>
                                )}
                            </div>

                            {/* 현재 계약 구조(잔여분) — 옵션은 색상뿐 아니라 금액 좌측에 텍스트로도 표기 */}
                            {displayContractRows.length > 0 && (
                                <div className="flex-shrink-0 space-y-1">
                                    <div className="text-sm font-bold text-slate-400 mb-1">현재 계약</div>
                                    {displayContractRows.map(({ season, amount, opt }, i) => (
                                        <div key={season} className="flex justify-between items-center text-sm py-0.5">
                                            <span className={i === 0 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>{season}</span>
                                            <span className="flex items-center gap-1.5">
                                                {opt?.type === 'team' && <span className="text-sky-400">팀 옵션</span>}
                                                {opt?.type === 'player' && <span className="text-emerald-400">플레이어 옵션</span>}
                                                <span className={`font-medium ${
                                                    opt?.type === 'team' ? 'italic text-sky-400'
                                                        : opt?.type === 'player' ? 'italic text-emerald-400'
                                                        : i === 0 ? 'text-white font-bold' : 'text-slate-300'
                                                }`}>{formatMoney(amount)}</span>
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center text-sm pt-1.5 mt-1 border-t border-slate-800">
                                        <span className="text-slate-400 font-semibold">총 잔여 계약액</span>
                                        <span className="font-bold text-white">{formatMoney(totalRemaining)}</span>
                                    </div>
                                </div>
                            )}

                            {/* 이 선수의 연도별 데드캡 — 우측의 "연도별 데드캡"(팀 기존 데드캡과 합산된 값)과
                                달리, 이 방출 하나가 만드는 금액만 보여준다(deadCapRows의 addition 열 그대로). */}
                            {displayDeadCapRows.length > 0 && (
                                <div className="flex-shrink-0 space-y-1">
                                    <div className="text-sm font-bold text-slate-400 mb-1">미래 데드캡</div>
                                    {displayDeadCapRows.map(({ season, addition }, i) => (
                                        <div key={season} className="flex justify-between items-center text-sm py-0.5">
                                            <span className={i === 0 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>{season}</span>
                                            <span className={`font-medium ${i === 0 ? 'text-white font-bold' : 'text-slate-300'}`}>{formatMoney(addition)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 우측 단: 팀 샐러리캡 현황 + 확인 버튼 — MultiNegotiationView.tsx의 capInfo 블록과 동일한 구성 */}
                        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
                            {displayCapInfo && (() => {
                                const capInfo = displayCapInfo;
                                const beforeOver = capInfo.beforePayroll > capInfo.capAmount;
                                const afterOver = capInfo.afterPayroll > capInfo.capAmount;
                                return (
                                    <div className="flex-shrink-0 space-y-1">
                                        <div className="text-sm font-bold text-slate-400 mb-1">팀 샐러리캡 현황</div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">캡 스페이스 여유</span>
                                            <span className={`font-bold ${beforeOver ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {beforeOver ? '-' : '+'}{formatMoney(Math.abs(capInfo.capAmount - capInfo.beforePayroll))}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">현재 페이롤</span>
                                            <span className="text-white">{formatMoney(capInfo.beforePayroll)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-400">샐러리캡</span>
                                            <span className="text-white">{formatMoney(capInfo.capAmount)}</span>
                                        </div>
                                        {capInfo.luxuryTaxAmount !== null && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400">럭셔리 택스 라인</span>
                                                <span className="text-white">{formatMoney(capInfo.luxuryTaxAmount)}</span>
                                            </div>
                                        )}
                                        {capInfo.apron1Amount !== null && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400">1차 에이프런</span>
                                                <span className="text-white">{formatMoney(capInfo.apron1Amount)}</span>
                                            </div>
                                        )}
                                        {capInfo.apron2Amount !== null && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400">2차 에이프런</span>
                                                <span className="text-white">{formatMoney(capInfo.apron2Amount)}</span>
                                            </div>
                                        )}

                                        <div className="pt-2 mt-1 border-t border-slate-800 space-y-1">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400 font-semibold">방출 후 예상 페이롤</span>
                                                <span className="font-bold text-white">{formatMoney(capInfo.afterPayroll)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-400">캡 대비</span>
                                                <span className={`font-bold ${afterOver ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {afterOver ? '-' : '+'}{formatMoney(Math.abs(capInfo.capAmount - capInfo.afterPayroll))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* 연도별 데드캡 테이블 — waive/stretch 둘 다 표시(웨이브는 1행, 스트레치는
                                분산 연수만큼). "방출 후 예상 페이롤" 바로 아래에 배치. */}
                            {displayDeadCapRows.length > 0 && (
                                <div className="flex-shrink-0 space-y-1">
                                    <div className="text-sm font-bold text-slate-400 mb-1">연도별 데드캡</div>
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-sm text-slate-500 pb-1.5 border-b border-slate-800">
                                        <span>시즌</span>
                                        <span className="text-right w-16">기존</span>
                                        <span className="text-right w-16">추가분</span>
                                        <span className="text-right w-16">합계</span>
                                    </div>
                                    {displayDeadCapRows.map(({ season, existing, addition, total }, i) => (
                                        <div key={season} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-sm items-center py-0.5 ${i < displayDeadCapRows.length - 1 ? 'border-b border-slate-800/50' : ''}`}>
                                            <span className={i === 0 ? 'text-slate-200' : 'text-slate-500'}>{season}</span>
                                            <span className="text-right w-16 text-slate-500">{existing > 0 ? formatMoney(existing) : '—'}</span>
                                            <span className="font-bold text-right w-16 text-red-400">+{formatMoney(addition)}</span>
                                            <span className={`font-bold text-right w-16 ${i === 0 ? 'text-white' : 'text-slate-300'}`}>{formatMoney(total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {actionError && (
                                <div className="flex-shrink-0 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                                    <ShieldAlert size={14} className="shrink-0" /> {actionError}
                                </div>
                            )}

                            <div className="flex-shrink-0 mt-auto pt-2">
                                <button
                                    onClick={() => setShowConfirmModal(true)}
                                    disabled={submitting}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {submitting ? '처리 중...' : '확인'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 최종 확인 팝업 — 되돌릴 수 없는 작업이므로 한 번 더 확인. 버튼 레이블은 실제
                실행될 방식(웨이브/스트레치)을 그대로 반영. */}
            <Modal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                size="sm"
                hideCloseButton
                blurBackdrop={false}
                rounded="rounded-md"
                backdropClass="bg-slate-950/60"
            >
                <div className="p-5 text-center flex flex-col items-center">
                    <AlertTriangle className="text-red-500 mb-3" size={28} />
                    <p className="text-slate-300 font-bold text-sm leading-relaxed mb-5">
                        이 작업은 되돌릴 수 없습니다. 진행할까요?
                    </p>
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={() => setShowConfirmModal(false)}
                            disabled={submitting}
                            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-sm transition-all disabled:opacity-50"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => { setShowConfirmModal(false); handleConfirm(); }}
                            disabled={submitting}
                            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm transition-all shadow-lg shadow-red-900/30 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {RELEASE_MODE_LABEL[effectiveMode]}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MultiReleaseView;
