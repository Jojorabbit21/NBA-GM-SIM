
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Loader2, ShieldAlert, Minus, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { gwa } from '../../../services/multi/newsBlurb';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerCareerHistory } from '../../../hooks/usePlayerCareerHistory';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../../../hooks/usePlayerSeasonStatsLeague';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { computeMultiStandingsStats, computePlayoffOddsMap } from './multiSeasonUtils';
import { findCurrentVirtualDate, addDaysToKey, daysBetweenKeys } from './multiScheduleUtils';
import { getServerNow } from '../../../utils/serverClock';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { buildMultiFADemand } from '../../../services/multi/negotiation/multiFaDemand';
import { evaluateFAOffer, estimateAcceptProbability, evaluateTwoWayOffer, estimateTwoWayAcceptProbability, calcTeamFitPenalty, calcDeclineAversionPenalty } from '../../../services/fa/faValuation';
import { calcTeamPayroll } from '../../../services/fa/faMarketBuilder';
import { getMaxCapPct } from '../../../services/fa/contractEligibility';
import { calcRookieScaleYears, ROOKIE_SCALE_PICK_PCT, estimateFourthYearRaisePct } from '../../../services/draft/rookieGenerator';
import {
    generateDialogue,
    generateDemandSubText,
    type DialogueContext,
    type DialogueTrigger,
} from '../../../services/fa/negotiationDialogue';
import { generateSaveTendencies } from '../../../utils/hiddenTendencies';
import { signFreeAgentNegotiated } from '../../../services/multi/faService';
import { SIGNING_TYPE_LABEL, CONTRACT_TYPE_LABEL, getAcceptLikelihoodLabel, getAllowedSigningTypes } from '../../../utils/contractLabels';
import { calculatePlayerOvr, countYosFromCareerHistory, INITIAL_STATS, MIN_SALARY_YOS_TABLE, TWO_WAY_MAX_OVR, TWO_WAY_YOS_MAX } from '../../../utils/constants';
import { formatMoney as formatMoneyAbbrev, formatMoneyFull } from '../../../utils/formatMoney';
import { generateScoutReport } from '../../../utils/scoutReport';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../../services/playerDevelopment/archetypeEvaluator';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../../../services/playerPopularity';
import { getMoraleLabel } from '../../../services/moraleService';
import type { Team } from '../../../types/team';
import type { PlayerContract, PlayerStats, SaveTendencies } from '../../../types/player';
import type { SigningType } from '../../../types/fa';

// 멀티플레이어 FA 협상 화면 — cba_rules_enabled 리그에서 MultiFreeAgentView.tsx "계약" 버튼을
// 누르면 즉시계약(handleSign) 대신 이 진짜 라우트(/multi/leagues/:leagueId/season/negotiate/:playerId)
// 로 이동한다. 레이아웃/대사 시스템은 싱글플레이어 views/NegotiationScreen.tsx(3패널: 좌 선수정보
// | 중 GM채팅 | 우 오퍼폼)를 그대로 참고해 시각적으로 동일하게 구성 — 오버레이가 아니라 독립
// 라우트라는 점만 다르다(뒤로가기/새로고침/링크공유 모두 자연스럽게 동작).
//
// v1 스코프(의도된 축소, contract-specialist 설계): 전체 슬롯/에이프런/MLE/버드권한 자격판정
// (getAvailableSigningSlots/processUserOffer/calcTeamPayroll)은 이번 범위 밖 — "얼마를
// 요구하는가"(calcFADemand → buildMultiFADemand)와 "이 오퍼를 받아들이는가"(evaluateFAOffer)만
// 재사용하고, signingType은 드롭다운으로 사용자가 직접 고르는 정보성 필드일 뿐 자격 검증은 하지
// 않는다. 싱글의 maxFARounds(성격 기반 2~7)와 동일한 공식으로 "인내심"을 세션 로컬
// state로 추적, 모욕적인 오퍼가 누적되면 그 자리에서 협상이 완전히 결렬된다. 결렬되면
// (나갔다 들어와서 인내심을 리셋해 무한 재시도하는 걸 막기 위해) 이 브라우저의
// localStorage에 "리그+팀+선수" 조합으로 쿨다운 만료 "인게임 가상 날짜"(1~3일, 성격 기반)를
// 남긴다 — 실제 시계 시간이 아니라 시뮬레이션이 그만큼 더 진행돼야 풀린다. DB 영구 기록은
// 원치 않으셔서(다른 팀의 협상에 영향 주면 안 됨) 브라우저 로컬로만 국한했다. 정식 서버
// 기록이 아니라 브라우저를 바꾸거나 localStorage를 지우면 우회 가능한 가벼운 락이라는
// 한계가 있음.

interface ChatMsg {
    id: number;
    role: 'player' | 'gm' | 'status';
    text: string;
    subText?: string;
    isSuccess?: boolean;
}

const MIN_CONTRACT_YEARS = 1;
const MAX_CONTRACT_YEARS = 5;

// [2026-09-16 Fix] 투웨이 계약 자격의 OVR 상한 — YOS(서비스타임)만으로 자격을 걸었더니
// 사용자가 "OVR 90짜리 선수와 투웨이 계약을 맺었다"고 리포트. 원인: 투웨이 수락 확률
// (twoWayAcceptProbability)은 실제 스탯 percentile 기반 marketValueScore를 보는데, 아직
// 출전 샘플이 적은 저연차 특급 유망주는 진짜 OVR이 높아도 누적 스탯이 적어
// marketValueScore가 낮게 나올 수 있다 — 그러면 "실력은 뛰어난데 아직 증명을 못 한"
// 선수가 확률상 투웨이를 잘 받아들이는 것처럼 계산돼버린다. YOS와 무관하게 OVR
// 자체가 명백히 로테이션급 이상이면 애초에 드롭다운에서 투웨이를 선택조차 못 하도록
// 하드 상한을 둔다(실제 NBA에서 이 정도 기량의 선수가 투웨이 계약을 받는 일은 없음).
// [2026-09-17] utils/constants.ts로 승격 — MultiFreeAgentView.tsx의 "계약" 버튼 활성화
// 조건도 동일 기준이 필요해져 로컬 상수로 두면 두 화면이 어긋날 위험이 있었음.

// 이 화면 전용 — 100만 달러 미만이면 K 축약 없이 전체 자릿수를 그대로 보여준다(예:
// $234,097). 투웨이 계약처럼 일할계산된 금액은 "$234K"보다 정확한 숫자가 더 유용하기
// 때문 — 100만 달러 이상이면 기존 formatMoney와 동일하게 M 단위로 축약한다. 이 파일
// 안에서는 기존 formatMoney(...) 호출부를 그대로 두고 이 지역 함수가 덮어쓴다.
function formatMoney(dollars: number): string {
    return Math.abs(dollars) < 1_000_000 ? formatMoneyFull(dollars) : formatMoneyAbbrev(dollars);
}

interface MoodTier { emoji: string; label: string }
const MOOD_ANGRY: MoodTier = { emoji: '😡', label: '분노' };

// 체결 가능성(0.5 기준)이 나쁜 쪽(0.5 미만)으로 벌어진 만큼을 성격별로 증폭/완화한다 —
// "얼마나 안 좋은 제안이었나"는 같아도 다혈질/자존심 강한 선수는 기분이 더 크게 떨어지고,
// 침착하거나 충성심 높은 선수는 덜 떨어진다. 반대로 좋은 오퍼(0.5 이상)에 대한 기쁨은
// 성격과 무관하게 그대로 둔다(사용자가 "기분이 떨어지는 정도"만 요청).
function applyMoodSensitivity(probability: number, tendencies: SaveTendencies | null): number {
    if (!tendencies) return probability;
    const deviation = probability - 0.5;
    if (deviation >= 0) return probability;

    let sensitivity = 1;
    if (tendencies.temperament > 0)    sensitivity += tendencies.temperament * 0.7;       // 다혈질 → 최대 +0.7
    if (tendencies.temperament < -0.4) sensitivity -= Math.abs(tendencies.temperament) * 0.4; // 침착 → 최대 -0.4
    if (tendencies.ego > 0.35)         sensitivity += (tendencies.ego - 0.35) * 0.6;        // 자존심 강함 → 가중
    sensitivity -= ((tendencies.loyalty ?? 0.5) - 0.5) * 0.6;                                // 충성심 높으면 완화, 낮으면 가중
    sensitivity = Math.max(0.3, Math.min(2.2, sensitivity));

    return Math.max(0, Math.min(1, 0.5 + deviation * sensitivity));
}

// 체결 가능성(0~1) → 기분 5단계. getAcceptLikelihoodLabel과 동일한 임계값을 쓰되
// 이모지+한글 라벨 조합이 필요해 별도로 둔다(채팅 헤더 전용, 오퍼 제출 시에만 갱신됨).
function moodFromProbability(probability: number): MoodTier {
    if (probability >= 0.8) return { emoji: '😄', label: '활짝 웃는 미소' };
    if (probability >= 0.6) return { emoji: '🙂', label: '그냥 미소' };
    if (probability >= 0.4) return { emoji: '😐', label: '중립' };
    if (probability >= 0.2) return { emoji: '😕', label: '약간 안좋음' };
    return MOOD_ANGRY;
}

const MultiNegotiationView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading, reload } = useLeagueContext();
    const { tendencySeed, currentSeason, schedule, currentSimDate } = useSeasonContext();
    const { session } = useGame();
    const navigate = useNavigate();
    const { leagueId, playerId: playerUrlId } = useParams<{ leagueId: string; playerId: string }>();
    const { resolvePlayerId, getPlayerUrlId } = usePlayerShortCodes();
    const playerId = playerUrlId ? resolvePlayerId(playerUrlId) : undefined;

    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);

    // [버그 수정] useMultiSearchData()는 검색/필터용으로 meta_players에서 id/name/position/
    // base_attributes만 가져오고 이번 시즌 실제 박스스코어(player.stats)는 채우지 않는다 —
    // 그 결과 calcFADemand()가 항상 player.stats===undefined로 보고 조악한 OVR→점수 폴백
    // (ovrToRoleScore, 최대 96점, 신뢰도 0.65 고정)만 타서, 시즌 내내 주전으로 뛴 선수도
    // 실제 활약과 무관하게 낮은 몸값이 나왔다(예: 73경기 18.2득점 하든이 OVR버킷만으로
    // 평가돼 최저연봉 근처로 책정). buildLeagueTeams.ts와 동일한 패턴(INITIAL_STATS 기본값
    // + usePlayerSeasonStatsLeague 병합)으로 실제 시즌 스탯을 붙여서 calcFADemand의 정확한
    // 백분위 기반 롤 점수 경로(calcRoleScore)를 타게 한다.
    const poolPlayerIds = useMemo(() => poolPlayers.map(p => p.id), [poolPlayers]);
    const { data: statsByPlayer = {} } = usePlayerSeasonStatsLeague(room?.id, poolPlayerIds);
    const poolPlayersWithStats = useMemo(
        () => poolPlayers.map(p => statsByPlayer[p.id]
            ? { ...p, stats: { ...INITIAL_STATS(), ...statsByPlayer[p.id] } as PlayerStats }
            : p),
        [poolPlayers, statsByPlayer],
    );

    const myTeamRow = useMemo(
        () => leagueTeams.find(t => t.user_id === session?.user?.id) ?? null,
        [leagueTeams, session],
    );

    // FA 협상 대상은 항상 어느 팀 로스터에도 없는 드래프트풀 선수 — MultiFreeAgentView.tsx의
    // undraftedPlayers와 동일한 조건.
    const player = useMemo(
        () => (playerId ? poolPlayersWithStats.find(p => p.id === playerId && !rosterMap.has(p.id)) ?? null : null),
        [poolPlayersWithStats, playerId, rosterMap],
    );

    // 시장 조건(buildMarketConditions) 계산용 Team[] — MultiPlayerDetailView.tsx와 동일한
    // useLeagueRawStats+buildLeagueTeams 패턴. 이 화면은 팀별 시즌 스탯 레이어가 필요 없어
    // (선수 OVR은 base_attributes 기반이라 statsByPlayer 없이도 정확) includePbp:false +
    // statsByPlayer 기본값({})으로 가볍게 호출한다.
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );
    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides),
        [leagueTeams, useCustomOverrides],
    );
    const { data: teams = [], isPending: teamsLoading } = useLeagueRawStats(room?.id, allRosterIds, selectLeagueTeams, { includePbp: false });

    // useSeasonContext().currentSeason은 "2025-26" 형태로 이미 리그의 현재 시즌을 나타낸다 —
    // rooms.sim_date를 직접 읽거나 findCurrentVirtualDate로 재유도할 필요 없이 시작 연도만 파싱.
    const currentSeasonYear = useMemo(() => parseInt((currentSeason || '').split('-')[0], 10) || new Date().getFullYear(), [currentSeason]);

    const demand = useMemo(() => {
        if (!player || !league || teams.length === 0) return null;
        return buildMultiFADemand(
            player, poolPlayersWithStats, teams, league.salary_cap_amount,
            currentSeasonYear, currentSeason, tendencySeed ?? '',
        );
    }, [player, league, teams, poolPlayersWithStats, currentSeasonYear, currentSeason, tendencySeed]);

    // 우리 팀의 "우승 경쟁력" — 승률 대신 플레이오프 진출 확률(PO%)을 그대로 재사용한다.
    // PO%는 이미 승률 + 남은 일정 난이도(log5 몬테카를로, MultiStandingsView.tsx와 동일
    // 유틸)를 반영하고 있어 단순 승률보다 팀 전력을 더 정확히 나타낸다. 시즌 초반이라
    // 데이터가 아직 없으면(일정/로스터 미로드) 중립값 0.5로 폴백 — 싱글플레이어
    // NegotiationScreen.tsx의 contenderScore 폴백과 동일한 관례.
    const contenderScore = useMemo(() => {
        if (!myTeamRow || leagueTeams.length === 0 || schedule.length === 0) return 0.5;
        const slugs = leagueTeams.map(t => t.team_slug);
        const nowMs = getServerNow();
        const statsMap = computeMultiStandingsStats(slugs, schedule, nowMs);
        const oddsMap = computePlayoffOddsMap(
            leagueTeams, statsMap, schedule, nowMs,
            league?.playoff_team_count ?? 8, league?.play_in_enabled ?? true,
        );
        return oddsMap[myTeamRow.team_slug] ?? 0.5;
    }, [myTeamRow, leagueTeams, schedule, league]);

    // 우측 폼 하단 "샐러리캡 현황"에 쓸 우리 팀 Team 객체 — Team.id는 buildLeagueTeams.ts가
    // team_slug로 채우므로(league_teams.id인 myTeamRow.id와는 다름) team_slug로 찾는다.
    const myTeam = useMemo(
        () => (myTeamRow ? teams.find(t => t.id === myTeamRow.team_slug) ?? null : null),
        [teams, myTeamRow],
    );

    // 로스터 정원(leagues.max_roster_size, 기본 15) 초과 여부 계산용 — 정규 계약만 카운트.
    // [2026-09-16 Fix] myTeamRow.roster.length(투웨이 포함 전체 인원)를 그대로 쓰면 투웨이
    // 계약이 정규 계약 슬롯을 깎아먹는 버그가 있었다(정규 13명+투웨이 2명=15명으로 보여
    // max_roster_size=15에서 곧바로 꽉 참) — RosterOverviewGrid.tsx의 "정규 계약 슬롯"
    // 집계와 동일하게 투웨이 계약(p.contract?.type === 'two_way')은 이 카운트에서 제외한다.
    // isRosterFull 자체의 계산은 isTwoWay가 필요해 더 아래(signingType 선언 이후)에 있다.
    const myRegularContractCount = myTeam
        ? myTeam.roster.filter(p => p.contract?.type !== 'two_way').length
        : (myTeamRow?.roster?.length ?? 0); // teams 로딩 전 과도기 폴백
    // 투웨이 슬롯(leagues.two_way_slots, 기본 3) 소진 여부 — 정규 슬롯과 별개로 관리된다.
    const myTwoWayContractCount = myTeam
        ? myTeam.roster.filter(p => p.contract?.type === 'two_way').length
        : 0;

    // ─── 오퍼 폼 상태 ──────────────────────────────────────────
    // [2026-09-16] 연차별 연봉을 직접 입력하는 대신, 실제 NBA CBA 계약 구조(1년차 캡%
    // + 연간 인상률로 이후 연차가 자동 계산됨)를 그대로 따른다 — 사용자가 전문가 자문
    // 형태로 전달한 스펙: salary_year_n = first_year_salary × (1 + raise% × (n-1))
    // (복리 아님, 매년 1년차 금액의 raise%만큼 균등하게 더해짐). capPercent/raisePercent는
    // 화면 입력 편의용이고, 실제 저장(PlayerContract.years)은 계산된 달러 배열 그대로 —
    // 사용자 스펙의 "내부적으로는 달러 금액으로 확정 저장" 방침과 일치.
    // [버그 수정] capPercent/raisePercent를 number state로 바로 들고 있으면, 입력칸을
    // 전부 지우거나 "-"만 입력한 중간 상태에서 parseFloat가 NaN→0으로 떨어져 controlled
    // input의 value가 즉시 "0"으로 되돌아가 버린다("지우면 0이 남고, 09처럼 붙어버림").
    // 원본 입력 텍스트를 그대로 문자열 state로 들고, 계산에 쓸 숫자는 그때그때 파싱한
    // 파생값으로 분리해서 타이핑 중간 상태("", "-", "5.")를 그대로 유지할 수 있게 한다.
    const [capPercentInput, setCapPercentInput] = useState('20');
    const [raisePercentInput, setRaisePercentInput] = useState('5');
    const [years, setYears] = useState(1);
    // [2026-09-17] 계약 연수 가운데도 캡%/변동률처럼 직접 타이핑 가능한 인풋으로 노출.
    // years 자체(다른 모든 계산 — minSalarySeasons/salaries 배열 length 등 — 에 그대로
    // 쓰이는 정수 state)는 건드리지 않고, 표시/편집용 문자열 버퍼만 따로 둬서 타이핑
    // 중간 상태("", 빈 문자열 등)를 깨뜨리지 않는다. 포커스를 벗어나면(blur) years에
    // 커밋(rookieMultiplierInput과 동일한 "입력 중 자유, blur 시 검증" 패턴) — 아래
    // useEffect가 버튼 클릭 등 외부에서 years가 바뀔 때도 버퍼를 최신값으로 재동기화.
    const [yearsInputText, setYearsInputText] = useState('1');
    // [2026-09-17] "계약 유형"(ContractType: free_agent/rookie_scale/two_way — extension은
    // 이 화면에 안 나옴, FA 신규 서명 전용)과 "예외 조항"(SigningType)을 서로 다른 state로
    // 완전히 분리했다 — 예전엔 signingType 하나가 두 개념(계약 유형 대용 센티넬 + 진짜 예외
    // 조항)을 겸했는데('cap_space'가 "정규 계약" 기본값, 'rookie_scale'/'two_way'가 각각
    // "이건 루키스케일/투웨이 계약이다"라는 신호), SigningType 유니온에서 cap_space/
    // rookie_scale/two_way가 빠지면서(어드민 계약 유형 재설계, utils/contractLabels.ts
    // 참고) 더 이상 성립하지 않는다. signingType은 이제 순수 예외 조항 값만 담고, 빈 값
    // (undefined)이 "캡 스페이스로 체결"을 뜻한다(어드민 폼과 동일 관례).
    const [contractType, setContractType] = useState<'free_agent' | 'rookie_scale' | 'two_way'>('free_agent');
    const [signingType, setSigningType] = useState<SigningType | undefined>(undefined);
    // 팀 옵션/플레이어 옵션 — 계약 마지막 해에만, 2년 이상 계약부터 설정 가능. 체크박스
    // 2개지만 배타적(라디오처럼 동작)이라 하나의 state로 관리.
    const [optionType, setOptionType] = useState<'team' | 'player' | null>(null);
    useEffect(() => {
        if (years < 2) setOptionType(null);
    }, [years]);
    const initializedRef = useRef(false);
    useEffect(() => {
        if (demand && league && !initializedRef.current) {
            initializedRef.current = true;
            const pct = league.salary_cap_amount > 0 ? (demand.askingSalary / league.salary_cap_amount) * 100 : 20;
            setCapPercentInput(String(Math.round(pct * 10) / 10));
            setYears(demand.askingYears);
        }
    }, [demand, league]);

    // [2026-09-17] "루키 스케일"(1라운드 픽 전용 4년 계약, 캡 대비 픽별 고정 비율의
    // 80~120% 사이에서 체결)인지는 이제 contractType으로 판별 — rookiePick(이번 시즌
    // 드래프트된 1라운드 픽인지)이 있으면 선택 불가로 자동 고정된다(아래 useEffect).
    const rookiePick = player && player.draftRound === 1 && player.draftYear === currentSeasonYear
        && player.draftPick && player.draftPick >= 1 && player.draftPick <= 30
        ? player.draftPick
        : null;
    useEffect(() => {
        if (rookiePick !== null) setContractType('rookie_scale');
    }, [rookiePick]);

    // [2026-09-16] 계약 유형 "투웨이 계약"(two_way) 자격 등 여러 곳에서 쓰는 선수의
    // YOS(서비스타임) — 실제 계약 성립 여부와 무관하게 항상 미리 구해둔다.
    // [2026-09-17 Fix] "currentSeasonYear - draftYear" 역산 대신 실제 career_history에
    // 기록된 정규시즌 개수를 센다(countYosFromCareerHistory, 위 주석 참고) — 이 화면은
    // 선수 한 명만 보는 프로필형 화면이라 PlayerDetailView.tsx/usePlayerCareerHistory와
    // 동일한 targeted 조회 패턴을 그대로 쓸 수 있다(대량 조회 화면과 달리 페이로드 부담 없음).
    const { data: playerCareerHistory } = usePlayerCareerHistory(player?.id, !!player);
    const playerYos = countYosFromCareerHistory(playerCareerHistory);
    const playerOvrForTwoWay = player ? calculatePlayerOvr(player) : 0;
    // 실제 NBA 규정대로 YOS 4년 이상인 선수에게는 투웨이 계약을 제시할 수 없다. 여기에
    // 더해 OVR이 명백히 로테이션급 이상(TWO_WAY_MAX_OVR 이상)이면 YOS와 무관하게 자격을
    // 주지 않는다(위 TWO_WAY_MAX_OVR 주석 참고 — marketValueScore만으로는 저연차 특급
    // 유망주를 걸러내지 못했던 버그의 하드 가드).
    const isTwoWayEligible = playerYos < TWO_WAY_YOS_MAX && playerOvrForTwoWay < TWO_WAY_MAX_OVR;
    const isRookieScale = contractType === 'rookie_scale';
    const isTwoWay = contractType === 'two_way';
    // [2026-09-16] 서명 유형(예외 조항) "Minimum Salary Exception" — 실제 CBA대로 YOS(서비스
    // 타임) 기준으로 시즌별 미니멈 샐러리가 정해지고, 계약 연수는 최대 2년까지만 허용된다.
    // 캡%/변동률 입력은 이 경우 의미가 없어지므로 비활성화하고, salaries 계산 자체를
    // YOS 테이블 기준으로 갈아치운다(아래 salaries useMemo).
    const isMinSalary = signingType === 'minimum_exception';
    // 협상 도중 선수가 바뀌거나(YOS 4년 이상으로 재계산) 자격을 잃으면, 드롭다운에서 이미
    // 사라진 옵션이 contractType에 그대로 남아있지 않도록 즉시 정규 계약으로 되돌린다.
    useEffect(() => {
        if (isTwoWay && !isTwoWayEligible) setContractType('free_agent');
    }, [isTwoWay, isTwoWayEligible]);
    // 계약 유형이 바뀌면 이전 유형 하위였던 예외 조항이 더 이상 유효하지 않을 수 있으니
    // 초기화(admin 에디터의 동일 정리 로직과 같은 원칙 — utils/contractLabels.ts의
    // getAllowedSigningTypes 참고).
    useEffect(() => {
        setSigningType(undefined);
    }, [contractType]);

    // 로스터 정원(leagues.max_roster_size) 초과 여부 — sign_free_agent_negotiated() RPC가
    // 서버에서도 동일하게 검증(권위 있는 체크)하지만, 오퍼를 다 채워놓고 제출 시점에야
    // 막히는 걸 피하기 위해 화면 진입 시점부터 미리 확인해 제출 버튼을 막는다. 투웨이
    // 계약은 애초에 정규 계약 슬롯을 쓰지 않으므로(위 myRegularContractCount에서 이미
    // 제외) 이 정원 체크 자체를 적용하지 않는다 — RPC도 계약 유형이 투웨이면 이 체크를
    // 건너뛰도록 동일하게 맞춰뒀다(migrations/fix_roster_full_check_exclude_two_way.sql).
    const isRosterFull = !isTwoWay && !!myTeamRow && myRegularContractCount >= ((league as any)?.max_roster_size ?? 15);
    // 투웨이 슬롯(leagues.two_way_slots, 기본 3) 소진 여부 — 정규 슬롯과 별개로 검증한다.
    // isTwoWay일 때만 의미 있는 체크라 isRosterFull과는 분리된 변수로 둔다.
    const isTwoWaySlotsFull = isTwoWay && !!myTeamRow && myTwoWayContractCount >= ((league as any)?.two_way_slots ?? 3);
    const [rookieMultiplierInput, setRookieMultiplierInput] = useState('120');
    const rookieMultiplier = Math.max(80, Math.min(120, parseFloat(rookieMultiplierInput) || 0)) / 100;
    // 타이핑 중엔 자유롭게 입력하다가, 포커스를 벗어나는 순간(onBlur) 80~120 범위 밖이면
    // 가까운 경계값으로 스냅 — "입력 중엔 안 건드리고, 다 쓰고 나면 검증" 패턴.
    const handleRookieMultiplierBlur = () => {
        const n = parseFloat(rookieMultiplierInput);
        if (isNaN(n)) { setRookieMultiplierInput('120'); return; }
        setRookieMultiplierInput(String(Math.max(80, Math.min(120, n))));
    };

    // 투웨이 계약은 단년 계약만 가능(연수 조정 UI 자체를 숨김 — 아래 JSX 참고).
    const effectiveMaxYears = isMinSalary ? 2 : isRookieScale ? 4 : isTwoWay ? 1 : MAX_CONTRACT_YEARS;
    useEffect(() => {
        if (isMinSalary) setYears(y => Math.min(y, 2));
        if (isRookieScale) setYears(4);
        if (isTwoWay) setYears(1);
    }, [isMinSalary, isRookieScale, isTwoWay]);
    // years가 바뀌면(버튼 클릭이든 위 useEffect든) 입력 버퍼도 같이 최신화.
    useEffect(() => {
        setYearsInputText(String(years));
    }, [years]);
    const handleYearsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (v === '' || /^\d*$/.test(v)) setYearsInputText(v);
    };
    const handleYearsBlur = () => {
        const n = parseInt(yearsInputText, 10);
        if (isNaN(n)) { setYearsInputText(String(years)); return; }
        setYears(Math.max(MIN_CONTRACT_YEARS, Math.min(effectiveMaxYears, n)));
    };
    // 루키 스케일 3·4년차는 실제로 둘 다 팀옵션이지만, 지금 "추가 사항" UI는 마지막 해
    // 1개만 표현할 수 있어 4년차(마지막 해)만 팀옵션으로 자동 체크해둔다(부분 근사 —
    // 3년차 팀옵션은 이 UI로 표현 못 함, 알려진 한계).
    useEffect(() => {
        if (isRookieScale) setOptionType('team');
    }, [isRookieScale]);
    // 루키 스케일 선택 시 "1년차 연봉(캡%)"/"변동률" 입력은 비활성화돼 실제 계산엔 안
    // 쓰이지만(rookieScaleSeasons가 전담), 화면에 픽 순서에 맞는 참고값을 보여주기 위해
    // 캡%엔 "배율 반영한 1년차 캡 비율", 변동률엔 "픽별로 가장 크게 요동치는 3→4년차
    // 인상률"(estimateFourthYearRaisePct)을 자동으로 채워둔다.
    useEffect(() => {
        if (isRookieScale && rookiePick !== null) {
            const y1CapPct = ROOKIE_SCALE_PICK_PCT[rookiePick - 1] * rookieMultiplier;
            setCapPercentInput(String(Math.round(y1CapPct * 100) / 100));
            setRaisePercentInput(String(Math.round(estimateFourthYearRaisePct(rookiePick) * 10) / 10));
        }
    }, [isRookieScale, rookiePick, rookieMultiplier]);

    // 숫자/부호/소수점 중간 상태("", "-", "5.", "-5.5" 등)만 허용 — 그 외 문자는 아예
    // state에 반영하지 않아 이상한 값이 끼어들지 않는다.
    const PERCENT_INPUT_PATTERN = /^-?\d*\.?\d*$/;
    const handlePercentInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if (v === '' || PERCENT_INPUT_PATTERN.test(v)) setter(v);
    };

    // [2026-09-17] YOS별 CBA Maximum Salary Cap% 상한 — 0~6 YOS 25%, 7~9 YOS 30%, 10+ YOS
    // 35%(데릭 로즈 룰 자격이면 YOS<7이어도 30%까지). 새로 만들지 않고 싱글플레이어
    // NegotiationScreen.tsx가 이미 쓰는 services/fa/contractEligibility.ts의
    // getMaxCapPct()를 그대로 재사용(공식 드리프트 방지). isExtension=false 고정 — 이
    // 화면은 FA 신규 계약 전용이라 슈퍼맥스(Extension 전용)는 해당 없음. 예외 조항(MLE
    // 금액 상한 등) 자체의 검증은 아직 없음 — 이번 단계는 "선수 개인 맥스" 상한만.
    const maxCapResult = player ? getMaxCapPct(player, playerYos, currentSeasonYear, false) : { pct: 0.25, reason: 'standard' as const };
    const maxCapPct = maxCapResult.pct * 100;

    const capPercent = Math.min(maxCapPct, Math.max(0, parseFloat(capPercentInput) || 0));

    // 캡% 인풋 좌우의 [최소][-1%][-0.5%] / [+0.5%][+1%][최대] 스텝퍼 버튼 — 현재 입력값에서
    // delta만큼 가감(0~maxCapPct 클램프), max는 maxCapPct%로 즉시 설정. [2026-09-17]
    // "최소"는 원래 0%였는데, 실제로 아무 팀도 선수 개인 최저치인 미니멈 샐러리(YOS별
    // MIN_SALARY_YOS_TABLE 비율) 밑으로는 제시하지 않으므로 0% 대신 이 선수 YOS의
    // 미니멈 샐러리 상당 캡%로 채워지도록 변경(minSalarySeasons가 쓰는 것과 동일한 표).
    const adjustCapPercent = (delta: number | 'min' | 'max') => {
        if (delta === 'min') {
            const seasonYos = Math.min(Math.max(playerYos, 0), MIN_SALARY_YOS_TABLE.length - 1);
            setCapPercentInput(String(MIN_SALARY_YOS_TABLE[seasonYos].capPct));
            return;
        }
        if (delta === 'max') { setCapPercentInput(String(maxCapPct)); return; }
        const current = parseFloat(capPercentInput) || 0;
        const next = Math.max(0, Math.min(maxCapPct, current + delta));
        setCapPercentInput(String(Math.round(next * 100) / 100));
    };

    // 서명 유형별 CBA 변동률 상한(±) — Full/Early Bird는 8%, 그 외(캡스페이스/MLE/
    // 미니멈/BAE/논버드/2라운드 예외)는 5%. 파싱만 하고 클램프는 마지막에 한 번만
    // (입력 중간엔 값을 강제로 바꾸지 않아야 타이핑이 끊기지 않는다).
    const maxRaisePercent = (signingType === 'full_bird' || signingType === 'early_bird') ? 8 : 5;
    const raisePercent = Math.max(-maxRaisePercent, Math.min(maxRaisePercent, parseFloat(raisePercentInput) || 0));

    // 변동률 인풋 좌우의 [최소][-1%][-0.5%] / [+0.5%][+1%][최대] 스텝퍼 버튼 — 캡%와 동일한
    // 패턴이나 범위가 [-maxRaisePercent, +maxRaisePercent]로 음수까지 허용.
    const adjustRaisePercent = (delta: number | 'min' | 'max') => {
        if (delta === 'min') { setRaisePercentInput(String(-maxRaisePercent)); return; }
        if (delta === 'max') { setRaisePercentInput(String(maxRaisePercent)); return; }
        const current = parseFloat(raisePercentInput) || 0;
        const next = Math.max(-maxRaisePercent, Math.min(maxRaisePercent, current + delta));
        setRaisePercentInput(String(Math.round(next * 100) / 100));
    };

    const firstYearSalary = league ? Math.round(league.salary_cap_amount * (capPercent / 100)) : 0;

    // rooms.sim_date는 "실제 KST 날짜"라 인게임 캘린더 판정에 직접 쓰면 어긋난다
    // (memory: project_sim_date_vs_virtual_date) — MultiPlayerDetailView.tsx와 동일하게
    // findCurrentVirtualDate()로 스케줄 기반 가상 날짜를 구하고, 계산 불가하면 currentSimDate로
    // 폴백한다. (쿨다운 계산과 미니멈 계약 일할계산 둘 다 이 값을 쓴다.)
    const currentVirtualDate = useMemo(
        () => findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, getServerNow()) ?? currentSimDate,
        [schedule, league, currentSimDate],
    );

    // [2026-09-16] 시즌 도중 미니멈 계약 체결 시 실제 CBA대로 일할계산(proration) — 정규시즌
    // 총 일수 대비 남은 일수 비율만큼만 지급된다(예: 2026-27 실측 174일 기준 일일 감액률
    // 100/174 ≈ 0.575%). 174는 시즌마다 실제 일정 길이가 달라지므로 하드코딩하지 않고,
    // 이 리그의 실제 스케줄(정규시즌 첫 경기~마지막 경기)에서 매번 다시 구한다 — 이러면
    // 시즌이 몇 년이 지나도 항상 정확한 "그 시즌의 일수"를 쓴다. 플레이오프/올스타 경기는
    // 정규시즌 진행 일수 계산에서 제외.
    const seasonProration = useMemo(() => {
        const regularSeasonDates = schedule.filter(g => !g.isPlayoff && !g.isAllstar).map(g => g.date).sort();
        if (regularSeasonDates.length === 0) return 1;
        const firstDate = regularSeasonDates[0];
        const lastDate = regularSeasonDates[regularSeasonDates.length - 1];
        const daysInSeason = daysBetweenKeys(firstDate, lastDate) + 1;
        if (daysInSeason <= 0) return 1;
        const daysElapsed = Math.max(0, Math.min(daysInSeason, daysBetweenKeys(firstDate, currentVirtualDate)));
        return Math.max(0, (daysInSeason - daysElapsed) / daysInSeason);
    }, [schedule, currentVirtualDate]);

    // Minimum Salary Exception 선택 시 각 계약연차의 YOS(서비스타임)와 그 시즌의(전망)
    // 샐러리캡으로 시즌별 미니멈 샐러리를 계산한다 — LeagueSettingsView.tsx의 "YOS별
    // 미니멈 샐러리" 전망 테이블과 완전히 동일한 공식(캡 성장률 복리 전망 × YOS 비율)을
    // 재사용해 두 화면의 수치가 어긋나지 않게 한다. cap_growth_rate는 LeagueRow 타입에
    // 아직 정식으로 선언 안 돼 있어 LeagueSettingsView.tsx와 동일하게 (league as any)로 접근.
    // 1년차(n=0, 지금 체결하는 이번 시즌)만 seasonProration을 곱해 일할계산하고, 2년차부터는
    // 앞으로 시작하는 새 시즌 풀타임 계약이라 그대로 둔다(실제 CBA와 동일).
    const minSalarySeasons = useMemo(() => {
        if (!isMinSalary || !league || !player) return [];
        const capGrowthRate = (league as any)?.cap_growth_rate ?? 2.5;
        const growth = 1 + capGrowthRate / 100;
        // playerYos는 위에서 이미 career_history 기반으로 구해둔 값을 그대로 재사용(중복 계산 없음).
        return Array.from({ length: years }, (_, n) => {
            const seasonCap = league.salary_cap_amount * Math.pow(growth, n);
            const seasonYos = Math.min(Math.max(playerYos + n, 0), MIN_SALARY_YOS_TABLE.length - 1);
            const capPct = MIN_SALARY_YOS_TABLE[seasonYos].capPct;
            const fullSeasonSalary = seasonCap * (capPct / 100);
            return Math.round(n === 0 ? fullSeasonSalary * seasonProration : fullSeasonSalary);
        });
    }, [isMinSalary, league, player, playerYos, years, seasonProration]);

    // 루키 스케일 선택 시 픽별 고정 비율 공식으로 4년 계약을 자동 계산(0.80~1.20 배율).
    // 1라운드 픽이 아니면(rookiePick===null) 계산 불가 — 빈 배열 반환, 폼 우측에 경고 표시.
    const rookieScaleSeasons = useMemo(() => {
        if (!isRookieScale || !league || rookiePick === null) return [];
        return calcRookieScaleYears(rookiePick, league.salary_cap_amount, rookieMultiplier);
    }, [isRookieScale, league, rookiePick, rookieMultiplier]);

    // [2026-09-16] 투웨이 계약(two_way) 급여 — 실제 G리그 공식 규정대로 "0 YOS 선수의
    // 미니멈 샐러리의 50%"가 풀시즌 기준액이다(선수 본인의 실제 YOS와는 무관 — 애초에
    // YOS 4년 미만만 투웨이 자격이 있으므로 굳이 YOS별로 나눌 이유가 없다). 시즌 도중
    // 체결하면 Minimum Salary Exception과 완전히 동일한 원칙(seasonProration)으로
    // 잔여 정규시즌 일수만큼만 1년차 금액을 일할계산하고, 2년차부터는(있다면) 다음 시즌
    // 풀타임 계약이라 그대로 둔다.
    const twoWaySeasons = useMemo(() => {
        if (!isTwoWay || !league) return [];
        const capGrowthRate = (league as any)?.cap_growth_rate ?? 2.5;
        const growth = 1 + capGrowthRate / 100;
        const zeroYosCapPct = MIN_SALARY_YOS_TABLE[0].capPct;
        return Array.from({ length: years }, (_, n) => {
            const seasonCap = league.salary_cap_amount * Math.pow(growth, n);
            const fullSeasonMinimum = seasonCap * (zeroYosCapPct / 100);
            const fullSeasonTwoWay = fullSeasonMinimum * 0.5;
            return Math.round(n === 0 ? fullSeasonTwoWay * seasonProration : fullSeasonTwoWay);
        });
    }, [isTwoWay, league, years, seasonProration]);

    // salary_year_n = 1년차 연봉 × (1 + 변동률 × (n-1)) — 복리 아니고 매년 1년차 기준
    // 균등 가산(사용자 스펙 그대로). 음수(연봉 하락) 변동률도 그대로 반영됨. Minimum Salary
    // Exception/루키 스케일/투웨이면 각각 전용 공식으로 계산한 시즌별 금액을 그대로 쓴다.
    const salaries = useMemo(
        () => isMinSalary
            ? minSalarySeasons
            : isRookieScale
            ? rookieScaleSeasons
            : isTwoWay
            ? twoWaySeasons
            : Array.from({ length: years }, (_, n) => Math.round(firstYearSalary * (1 + (raisePercent / 100) * n))),
        [isMinSalary, minSalarySeasons, isRookieScale, rookieScaleSeasons, isTwoWay, twoWaySeasons, firstYearSalary, raisePercent, years],
    );

    // 협상 판정(evaluateFAOffer 등)은 단일 연봉(AAV) 기준이라, 연차별 금액의 평균을 쓴다.
    const avgSalary = salaries.length > 0 ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : 0;
    const totalSalary = salaries.reduce((a, b) => a + b, 0);

    // 우리 팀 샐러리캡 현황 — 이번 계약이 붙기 "전" 페이롤과, 1년차 연봉이 이번 시즌
    // 캡에 그대로 더해진다고 가정한 "후" 페이롤을 함께 계산한다. calcTeamPayroll은
    // 싱글플레이어 FA 엔진(faMarketBuilder.ts)이 이미 쓰는 함수를 그대로 재사용
    // (로스터 연봉 합 + 데드머니).
    const capInfo = useMemo(() => {
        if (!myTeam || !league) return null;
        const beforePayroll = calcTeamPayroll(myTeam);
        const afterPayroll = beforePayroll + (salaries[0] ?? 0);
        return {
            capAmount: league.salary_cap_amount,
            luxuryTaxAmount: league.luxury_tax_enabled ? league.luxury_tax_amount : null,
            apron1Amount: league.apron1_enabled ? league.apron1_amount : null,
            apron2Amount: league.apron2_enabled ? league.apron2_amount : null,
            beforePayroll,
            afterPayroll,
        };
    }, [myTeam, league, salaries]);

    // ─── 채팅 상태 ─────────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const idCounter = useRef(0);
    const nextId = () => { idCounter.current += 1; return idCounter.current; };
    const addMsg = (role: ChatMsg['role'], text: string, subText?: string, isSuccess?: boolean) => {
        setChatMessages(prev => [...prev, { id: nextId(), role, text, subText, isSuccess }]);
    };
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

    const [round, setRound] = useState(0);
    const [result, setResult] = useState<{ accepted: boolean } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    // 협상 세션(이 화면을 띄우고 있는 동안) 동안만 유지되는 "인내심 소진" 상태 — 말도 안 되는
    // 오퍼를 계속 넣으면 결국 선수가 그 자리에서 협상을 접는다.
    const [walkedAway, setWalkedAway] = useState(false);
    const [frustration, setFrustration] = useState(0);
    // [2026-09-16] "결렬 후 나갔다 들어오면 인내심이 리셋돼 무한 재시도 가능한 것 아니냐"는
    // 지적 — walkedAway 자체는 여전히 화면 로컬(세션 중 인내심)이지만, 실제로 결렬이
    // 나면 브라우저 localStorage에 쿨다운 만료 "인게임 가상 날짜"를 남겨서 화면을 나갔다
    // 다시 들어와도 그 날짜가 지나기 전까진 재협상할 수 없게 막는다. 실제 시계 시간이
    // 아니라 시뮬레이션(가상 캘린더) 날짜 기준 — DB 저장(영구 기록)은 원치 않으셔서
    // (그러면 다른 팀도 이 선수와 협상할 때 영향받을 여지가 생김) 이 브라우저의
    // 이 팀↔이 선수 조합에만 국한된 가벼운 락으로 구현.
    const [cooldownUntilDate, setCooldownUntilDate] = useState<string | null>(null);
    // [버그 수정] cooldownUntilDate의 기본값 null은 "쿨다운 없음"과 "아직 localStorage를
    // 확인 안 함"을 구분 못 한다 — 그 결과 인사말 useEffect가 쿨다운 로드 effect보다
    // 먼저(같은 커밋 내에서) isOnCooldown=false로 읽고 인사말을 띄워버린 뒤에야 쿨다운이
    // 확정되는 레이스가 있었다(그러면 greetedRef.current가 이미 true라 쿨다운 전용
    // 메시지가 영원히 못 뜸). "확인 완료" 여부를 별도 플래그로 분리해 인사말이 이 확인이
    // 끝날 때까지 기다리게 한다.
    const [cooldownChecked, setCooldownChecked] = useState(false);

    const tendencies = useMemo(
        () => (player ? generateSaveTendencies(tendencySeed ?? '', player.id) : null),
        [tendencySeed, player],
    );
    const moraleScore = player?.morale?.score ?? 50;

    // 선수 성격 기반 "몇 번 거절하면 협상을 접는지" — 싱글플레이어 NegotiationScreen.tsx의
    // maxFARounds 공식을 그대로 재사용(충성도 높을수록 오래 참음, 다혈질일수록 빨리 접음).
    const maxRounds = useMemo(() => {
        if (!tendencies) return 4;
        const base = 4;
        const loyaltyBonus     = Math.round((tendencies.loyalty ?? 0.5) * 3);
        const temperamentMalus = tendencies.temperament > 0 ? Math.round(tendencies.temperament * 2) : 0;
        return Math.max(2, Math.min(7, base + loyaltyBonus - temperamentMalus));
    }, [tendencies]);

    // 결렬 후 재협상까지 인게임 가상 날짜 기준 대기 일수(1~3일) — 싱글플레이어
    // faCooldownDays 공식을 그대로 재사용(다혈질일수록 +길게, 충성도 낮을수록 +길게).
    const cooldownDays = useMemo(() => {
        if (!tendencies) return 1;
        const temperamentExtra = tendencies.temperament > 0 ? Math.round(tendencies.temperament) : 0;
        const loyaltyExtra = Math.round(1 - (tendencies.loyalty ?? 0.5));
        return Math.max(1, Math.min(3, 1 + temperamentExtra + loyaltyExtra));
    }, [tendencies]);

    const cooldownStorageKey = useMemo(
        () => (leagueId && myTeamRow && player) ? `faNegotiationCooldown:${leagueId}:${myTeamRow.id}:${player.id}` : null,
        [leagueId, myTeamRow, player],
    );

    // 이 팀↔이 선수 조합의 기존 쿨다운을 로드 — 화면 재진입 시 무한 재시도를 막는 핵심.
    // 저장 형태는 "YYYY-MM-DD" 가상 날짜 키라 문자열 비교(<)로 그대로 대소 판정 가능.
    useEffect(() => {
        if (!cooldownStorageKey) return;
        try {
            const stored = localStorage.getItem(cooldownStorageKey);
            setCooldownUntilDate(stored && stored > currentVirtualDate ? stored : null);
        } catch {
            // 프라이빗 브라우징 등으로 접근 불가하면 조용히 무시(쿨다운 없이 동작).
        } finally {
            setCooldownChecked(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cooldownStorageKey]);

    const isOnCooldown = cooldownUntilDate !== null && currentVirtualDate < cooldownUntilDate;

    // 오퍼 제출 "전에" 미리 보여주는 체결 가능성 — evaluateFAOffer()가 실제로 참고하는
    // 것과 완전히 동일한 입력(demand/winDesire/contenderScore)으로 확률만 미리 계산한다
    // (estimateAcceptProbability, services/fa/faValuation.ts). 폼의 연봉/연수를 바꿀 때마다
    // 실시간으로 갱신된다. 투웨이 계약은 금액 기준 판정 자체가 성립하지 않아(급여가 항상
    // 정상 FA 수요보다 훨씬 낮음) YOS/시장가치(marketValueScore)만으로 보는 별도 함수
    // (estimateTwoWayAcceptProbability)를 쓴다 — 같은 marketValueScore를 미니멈 계약
    // 판정에도 쓰므로, "미니멈은 어려운데 투웨이는 쉽다" 같은 모순이 생기지 않는다.
    const acceptProbability = useMemo(() => {
        if (!demand || !player) return null;
        if (isTwoWay) return estimateTwoWayAcceptProbability(playerYos, demand.marketValueScore);
        return estimateAcceptProbability(
            { salary: avgSalary, years, raisePercent },
            demand, tendencies?.winDesire, contenderScore, tendencies?.financialAmbition,
        );
    }, [demand, player, isTwoWay, playerYos, avgSalary, years, raisePercent, tendencies, contenderScore]);

    // [2026-09-17] "조건을 다 맞춰줘도 우승 가능성이 낮다는 이유로 계속 거절당한다" 신고 —
    // evaluateFAOffer의 팀 전력(contenderScore) 페널티는 offer.salary가 demand.askingSalary를
    // 넘어도 적용되고(TEAM_TOO_WEAK 분기, faValuation.ts calcTeamFitPenalty), 이 거절은
    // frustration을 0만큼만 쌓아(선수 잘못이 아니므로) walkedAway/쿨다운으로도 절대 이어지지
    // 않는다 — 즉 유저가 최고 오퍼를 계속 넣어도 영원히 거절만 반복되는, 출구 없는 루프가
    // 가능했다. 최고 오퍼(salary=askingSalary, years=askingYears — years 불일치로 인한
    // 별도 감점 0)를 넣었을 때의 수락 확률을 미리 계산해, "매우 어려움"(getAcceptLikelihoodLabel
    // 기준 <0.2) 수준이면 애초에 협상 자체를 열지 않고 화면 진입 시점에 바로 거절 처리한다.
    // 투웨이 계약이 가능한 선수(isTwoWayEligible)는 제외 — 투웨이는 contenderScore를 아예
    // 안 보는 별도 함수(estimateTwoWayAcceptProbability)로 판정돼 이 문제 자체가 없다.
    const isRefusingNegotiation = useMemo(() => {
        if (!demand || !player || isTwoWayEligible) return false;
        const bestCase = estimateAcceptProbability(
            // raisePercent 미지정(=0/정액 취급) — "애초에 협상 가능성이 있는지" 판단은
            // 가장 무난한 구조를 가정해야지, 하향식처럼 유저가 고르지도 않은 특정 구조를
            // 미리 가정해 더 비관적으로 판단하면 안 된다.
            { salary: demand.askingSalary, years: demand.askingYears },
            demand, tendencies?.winDesire, contenderScore, tendencies?.financialAmbition,
        );
        return bestCase < 0.2;
    }, [demand, player, isTwoWayEligible, tendencies, contenderScore]);

    // 채팅 헤더에 표시할 선수의 "현재 기분" 이모지 — 지금 폼에 입력된 오퍼의 체결
    // 가능성(getAcceptLikelihoodLabel과 동일한 5단계 임계값)에 실시간으로 연동된다.
    // 협상이 완전히 결렬됐으면(walkedAway) 오퍼 값과 무관하게 항상 분노로 고정.
    // 채팅 헤더의 "현재 기분" — 오퍼 폼(연봉/연수)을 만지작거릴 때는 안 바뀌고, 실제로
    // 오퍼를 "제출"했을 때만 그 오퍼의 체결 가능성 기준으로 갱신된다(handleSubmit 참고).
    const [mood, setMood] = useState<MoodTier>({ emoji: '😐', label: '중립' });
    // 이전 세션에서 이미 결렬돼 쿨다운 중이거나, 이번 세션에서 결렬됐거나, 애초에 협상할
    // 생각이 없는 선수(isRefusingNegotiation)면 오퍼 값과 무관하게 항상 분노로 고정.
    useEffect(() => {
        if (walkedAway || isOnCooldown || isRefusingNegotiation) setMood(MOOD_ANGRY);
    }, [walkedAway, isOnCooldown, isRefusingNegotiation]);

    // 팀 내 희망 위상(핵심 선수/선발/로테이션/벤치) — 싱글플레이어 NegotiationScreen.tsx의
    // "기대 역할"(selfAssessmentItems, roleScore = ovrNorm + ego*0.10) 자기평가 공식을 그대로
    // 가져오되, 그쪽의 6단계(1옵션~로테이션) 대신 사용자가 요청한 4단계로 재구간화했다.
    // 특정 팀 로스터와 비교하는 게 아니라(선수는 아직 무소속) OVR+자존심(ego) 기반의
    // 선수 본인 자기평가라 팀에 무관하게 결정된다.
    const expectedTeamRole = useMemo(() => {
        if (!player || !tendencies) return null;
        const ovrNorm = Math.max(0, Math.min(1, (calculatePlayerOvr(player) - 70) / 25));
        const roleScore = Math.max(0, Math.min(1, ovrNorm + (tendencies.ego ?? 0) * 0.10));
        if (roleScore > 0.62) return { text: '핵심 선수' };
        if (roleScore > 0.42) return { text: '선발' };
        if (roleScore > 0.22) return { text: '로테이션' };
        return { text: '벤치' };
    }, [player, tendencies]);

    // 선수 프로필(PlayerDetailView.tsx) 좌열과 동일한 계산 — "선수 유형"/"스카우팅 리포트".
    // player.archetypeState가 이미 있으면 그대로 쓰고, 없으면(FA 풀 생성 선수 등) 그 자리에서
    // 즉석 계산(PlayerDetailView.tsx의 playerArchetypeState useMemo와 동일한 fallback 패턴).
    const playerArchetypeState = useMemo(
        () => (player ? (player.archetypeState ?? assignArchetypes(player, currentSeason || '2025-26')) : null),
        [player, currentSeason],
    );
    const scoutReport = useMemo(
        () => (player ? generateScoutReport(player, tendencySeed) : []),
        [player, tendencySeed],
    );
    const seed = `${tendencySeed ?? ''}:${player?.id ?? ''}`;

    const addPlayerMsg = (trigger: DialogueTrigger, r: number, sub?: string) => {
        if (!player || !tendencies) return;
        const ctx: DialogueContext = {
            tendencies,
            morale: moraleScore,
            respect: 0.70,
            trust: 0.70,
            frustration: Math.min(0.6, Math.max(0, r - 1) * 0.15),
            round: r,
            negotiationType: 'fa',
        };
        addMsg('player', generateDialogue(trigger, ctx, seed), sub);
    };

    // 인사 대사(마운트 시 1회) — demand가 준비되면 실행. 이전 세션에서 결렬해 아직 쿨다운
    // 중이면 이번엔 인사조차 하지 않는다(선수가 아예 대화를 원치 않는 상태). cooldownChecked가
    // true가 될 때까지(localStorage 확인이 끝날 때까지) 기다린다 — 안 그러면 쿨다운 여부가
    // 확정되기 전에 인사말이 먼저 나가버리는 레이스가 있었다.
    const greetedRef = useRef(false);
    useEffect(() => {
        if (!player || !demand || !tendencies || greetedRef.current || !cooldownChecked || isOnCooldown || isRefusingNegotiation) return;
        greetedRef.current = true;
        addMsg('gm', `반갑습니다, ${player.name}. 당신같이 좋은 선수와 이야기 할 수 있어 기쁩니다.\n서로 만족할만한 결과를 이끌어낼 수 있으면 좋겠군요.`);
        const ctx: DialogueContext = {
            tendencies, morale: moraleScore, respect: 0.70, trust: 0.70, frustration: 0, round: 0,
            negotiationType: 'fa',
        };
        const greeting = generateDialogue('GREETING', ctx, seed);
        const sub = generateDemandSubText('fa', demand.askingSalary, demand.askingYears, seed);
        addMsg('player', greeting, sub);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player, demand, tendencies, cooldownChecked, isOnCooldown, isRefusingNegotiation]);

    // 쿨다운 중 재진입 — 인사말/다른 대화 전부 생략하고 이 한 마디만 보낸다. 이번 세션에서
    // 방금 결렬돼 isOnCooldown이 된 경우(이미 인사말/대화가 진행된 상태, greetedRef.current
    // 참)는 대상이 아니다 — "화면에 다시 들어왔을 때" 케이스에만 한정.
    const cooldownMsgShownRef = useRef(false);
    useEffect(() => {
        if (!player || !isOnCooldown || greetedRef.current || cooldownMsgShownRef.current) return;
        cooldownMsgShownRef.current = true;
        greetedRef.current = true; // 이후 쿨다운이 풀리는 순간 인사말이 뒤늦게 뜨는 것도 방지.
        addMsg('player', '현재로써는 협상에 임할 마음이 없습니다. 나중에 다시 얘기하는게 좋겠습니다.');
    }, [player, isOnCooldown]);

    // [2026-09-17] 위 isRefusingNegotiation 참고 — 최고 오퍼로도 수락 가능성이 "매우
    // 어려움" 수준이면 인사말 없이 이 한 마디만 보내고 협상 자체를 막는다. isOnCooldown
    // 재진입 메시지와 동일한 패턴(greetedRef 공유로 둘 다 뜨는 걸 방지, 쿨다운 쪽이 먼저
    // 선언돼 있어 둘 다 해당되면 쿨다운 메시지가 우선).
    const refusalMsgShownRef = useRef(false);
    useEffect(() => {
        if (!player || !isRefusingNegotiation || greetedRef.current || refusalMsgShownRef.current) return;
        refusalMsgShownRef.current = true;
        greetedRef.current = true;
        addMsg('player', '죄송하지만 당신의 팀과는 협상할 생각이 없습니다.');
    }, [player, isRefusingNegotiation]);

    const handleSubmit = async () => {
        if (!player || !demand || !myTeamRow || submitting || result?.accepted || walkedAway || isOnCooldown || isRefusingNegotiation || isRosterFull || isTwoWaySlotsFull) return;
        const newRound = round + 1;
        setRound(newRound);
        setActionError(null);

        addMsg('gm', `우리의 제안은 다음과 같습니다. 연평균 ${formatMoney(avgSalary)}, ${years}년 계약을 제안합니다.`, undefined);

        const accepted = isTwoWay
            ? evaluateTwoWayOffer(playerYos, demand.marketValueScore, seed)
            : evaluateFAOffer(
                { salary: avgSalary, years, raisePercent },
                demand, seed, tendencies?.winDesire, contenderScore, tendencies?.financialAmbition,
            );

        // 기분은 오퍼를 "제출"한 이 시점에만 갱신 — 폼을 만지작거리는 동안엔 안 바뀐다.
        // acceptProbability는 지금 제출하는 salary/years 기준으로 이미 계산돼 있는 값.
        // applyMoodSensitivity로 성격(다혈질/자존심/충성심)에 따라 나쁜 오퍼일 때 기분이
        // 떨어지는 정도를 다르게 만든다(좋은 오퍼에 대한 반응은 성격과 무관하게 동일).
        const moodProbability = applyMoodSensitivity(acceptProbability ?? (accepted ? 1 : 0), tendencies);
        setMood(moodFromProbability(moodProbability));

        if (accepted) {
            addPlayerMsg('ACCEPT', newRound);
            setSubmitting(true);
            const contract: PlayerContract = {
                years: salaries,
                yearSeasons: Array.from({ length: years }, (_, i) => currentSeasonYear + i),
                currentYear: 0,
                type: contractType,
                // 루키 스케일은 실제로 3·4년차(0-based 2·3) 둘 다 팀옵션이 붙는다 — "추가 사항"
                // 체크박스 UI는 마지막 해 1개만 표현하지만, 제출되는 계약 데이터 자체는
                // calcRookieContract()(싱글플레이어 드래프트 엔진)와 동일하게 정확히 채운다.
                options: isRookieScale
                    ? [{ type: 'team', year: 2 }, { type: 'team', year: 3 }]
                    : optionType ? [{ type: optionType, year: years - 1 }] : [],
                signingType,
            };
            const { error } = await signFreeAgentNegotiated(myTeamRow.id, player.id, contract, signingType);
            setSubmitting(false);
            if (error) {
                setActionError(error);
                return;
            }
            setResult({ accepted: true });
            addMsg('gm', `${player.name}, 당신이 팀에 합류하게 되어 매우 기쁩니다. 환영합니다.`);
            addMsg('status', '계약 체결 완료', undefined, true);
            // [2026-09-16 Fix] 여기서 reload()를 호출하지 않으면 useLeagueContext()의
            // leagueTeams(→league_teams.roster)가 갱신되지 않는다 — LeagueLayout이 라우트를
            // 넘나들어도 계속 마운트돼 있어(persistent layout) 이 화면을 나가 로스터 탭으로
            // 이동해도 RPC가 이미 DB에 반영한 새 로스터가 화면엔 그대로 반영 안 되는
            // 버그였다(MultiFreeAgentView.tsx의 즉시계약 handleSign, MultiRosterView.tsx의
            // handleReleasePlayer는 이미 reload()를 호출하고 있었음 — 이 화면만 빠져 있었다).
            reload();
            setTimeout(() => navigate(`/multi/leagues/${leagueId}/season/free-agent`), 1500);
        } else {
            // 투웨이는 금액 비교 자체가 성립하지 않는다(항상 정상 FA 수요보다 훨씬 낮음) —
            // 거절 사유는 "연차/실력상 정규 계약을 노려볼 만하다"는 전용 대사로 고정.
            // 그 외에는 기존대로: 연봉은 요구가 이상인데도 거절됐다면 금액 문제가 아니라
            // 팀 전력(우승 가능성) 또는 변동률 구조(하향식) 때문 — evaluateFAOffer의
            // teamFitPenalty/declinePenalty 분기와 짝을 맞춘 판정. [2026-09-17] 두 페널티가
            // 동시에 걸릴 수 있어(예: 우승욕 강한데 약팀+동시에 재정적 야망 높은데 하향식
            // 제시) 실제로 어느 쪽 확률 롤이 거절을 유발했는지는 evaluateFAOffer 내부라
            // 알 수 없다 — 대신 둘 중 계산된 패널티가 더 큰 쪽을 "더 설득력 있는 사유"로
            // 보고 대사를 고른다(공식은 faValuation.ts의 calcTeamFitPenalty/
            // calcDeclineAversionPenalty를 그대로 재사용, 뷰에서 재계산 안 함).
            const teamFitPenaltyForDialogue = (tendencies?.winDesire !== undefined)
                ? calcTeamFitPenalty(tendencies.winDesire, contenderScore) : 0;
            const declinePenaltyForDialogue = (tendencies?.financialAmbition !== undefined && tendencies?.winDesire !== undefined)
                ? calcDeclineAversionPenalty(
                    tendencies.financialAmbition, tendencies.winDesire, contenderScore, raisePercent, demand.walkAwayRaisePercent ?? -5,
                    demand.declineAgeTolerance ?? 0, demand.declinePerfTolerance ?? 0,
                ) : 0;
            const trigger: DialogueTrigger = isTwoWay
                ? 'TWO_WAY_DECLINE'
                : avgSalary >= demand.askingSalary
                ? (declinePenaltyForDialogue > teamFitPenaltyForDialogue ? 'DECLINING_CONTRACT' : 'TEAM_TOO_WEAK')
                : avgSalary < demand.walkAwaySalary * 0.85 ? 'OFFER_INSULT' : 'OFFER_LOW';
            addPlayerMsg(trigger, newRound);
            setResult({ accepted: false });

            // 협상 세션 내 "인내심" 소진 — 모욕적인 오퍼(OFFER_INSULT)는 +2, 그냥 낮은
            // 오퍼(OFFER_LOW)는 +1. [2026-09-17 Fix] TEAM_TOO_WEAK(팀 전력 때문에 거절)는
            // 원래 "선수 잘못이 아니라 화가 날 이유가 없다"는 이유로 +0이었는데, 이러면
            // isRefusingNegotiation(최고 오퍼 기준 수락확률 <20%, 화면 진입 시 즉시 차단)에
            // 안 걸리는 애매한 구간(20~85% 사이 — teamFitRejectProb가 최대 0.85라 아무리
            // 좋은 오퍼를 넣어도 확률적으로는 계속 거절될 수 있음)에서, 유저가 최고 오퍼를
            // 계속 넣어도 frustration이 전혀 안 쌓여 walkedAway/쿨다운으로 절대 안 이어지는
            // "출구 없는 무한 거절" 루프가 실사용에서 보고됨(이 파일 dev-log 2026-09-17
            // "애초에 협상할 생각 없는 선수" 항목의 남은 절반 — 그 항목은 <20% 극단값만
            // 막았고, 그 이상 확률대는 이 프러스트레이션 부재 때문에 여전히 무한 루프였음).
            // OFFER_LOW와 동일하게 +1로 바꿔 maxRounds에 도달하면 결국 walkedAway로
            // 수렴하게 한다(선수가 "화나서"가 아니라 "더 얘기해봐야 답이 없다고 판단해서"
            // 그만두는 것으로 봐도 결과 UI/메시지는 동일해 문제 없음).
            // DECLINING_CONTRACT도 TEAM_TOO_WEAK와 동일 이유(선수 잘못은 아니지만 무한
            // 재시도 방지 위해 +1 필요)로 같은 취급.
            const frustrationDelta = trigger === 'OFFER_INSULT' ? 2
                : trigger === 'OFFER_LOW' || trigger === 'TEAM_TOO_WEAK' || trigger === 'DECLINING_CONTRACT' ? 1 : 0;
            if (frustrationDelta > 0) {
                const newFrustration = frustration + frustrationDelta;
                setFrustration(newFrustration);
                if (newFrustration >= maxRounds) {
                    addPlayerMsg('WALKED_AWAY', newRound);
                    addMsg('status', '협상 결렬 — 선수가 더 이상 대화를 원하지 않습니다', undefined, false);
                    setWalkedAway(true);
                    setMood(MOOD_ANGRY);
                    // 나갔다 들어와도 무한 재시도가 안 되도록 이 브라우저에 쿨다운 만료
                    // "가상 날짜"를 남긴다(이 리그/이 팀/이 선수 조합에만 적용, 다른 팀엔
                    // 영향 없음) — 실제 시계 시간이 아니라 시뮬레이션이 그만큼 진행돼야 함.
                    const until = addDaysToKey(currentVirtualDate, cooldownDays);
                    setCooldownUntilDate(until);
                    if (cooldownStorageKey) {
                        try { localStorage.setItem(cooldownStorageKey, until); } catch { /* 무시 */ }
                    }
                }
            }
        }
    };

    // 오퍼 제출 버튼 비활성화 조건 — 계약 체결됨/협상 결렬/쿨다운 중/로스터·투웨이 정원
    // 초과/애초에 협상 거부(isRefusingNegotiation) 전부 포함.
    const isLocked = !!result?.accepted || walkedAway || isOnCooldown || isRefusingNegotiation || isRosterFull || isTwoWaySlotsFull;
    const isSigned = !!result?.accepted;
    // 우측 패널 전체를 흐리게+조작불가로 만드는 건 원래 "계약이 실제로 체결돼 곧 화면을
    // 이동하는"(isSigned) 경우로만 좁혀뒀다 — 결렬/쿨다운 상태는 버튼만 막고 나머지(연봉/
    // 연수 조정, 서명 유형 등)는 계속 만져볼 수 있게 둔다(사용자 요청). [2026-09-17]
    // isRefusingNegotiation(애초에 협상할 생각이 없는 선수)도 여기 포함 — "우측 오퍼폼은
    // 비활성화"라는 새 요청에 따라 이 경우엔 필드 단위가 아니라 패널 전체를 잠근다(오퍼를
    // 만지작거려볼 여지 자체가 없다는 걸 명확히 보여주기 위함, isOnCooldown/walkedAway와는
    // 다른 취급).
    const isOfferPanelDisabled = isSigned || isRefusingNegotiation;

    // 선수 이름 클릭 시 프로필 화면으로 이동 — MultiFreeAgentView.tsx의 이름 클릭과 동일한
    // 라우트(짧은 코드로 인코딩)를 그대로 사용.
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

    if (!player) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/free-agent`)}
                        className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        <span>←</span><span>뒤로</span>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                    선수를 찾을 수 없습니다. 이미 계약됐거나 존재하지 않는 선수입니다.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-200">
            {/* ── Header ── */}
            <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                <button
                    onClick={() => navigate(`/multi/leagues/${leagueId}/season/free-agent`)}
                    className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                    <span>←</span><span>뒤로</span>
                </button>
                <span className="text-sm font-bold text-white ko-tight">{gwa(player.name)} 협상</span>
            </div>

            {!myTeamRow ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                    소속 팀이 있어야 협상할 수 있습니다.
                </div>
            ) : !demand ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
            ) : (
                <div className="flex-1 flex divide-x divide-slate-800 bg-slate-950 overflow-hidden min-h-0">

                    {/* ── 좌측: 선수 정보 ── */}
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
                            <div className="px-4 py-3 space-y-1">
                                <div className="text-sm font-bold uppercase text-white mb-1.5">요구 조건</div>
                                {expectedTeamRole && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">희망 역할</span>
                                        <span className="text-slate-200">{expectedTeamRole.text}</span>
                                    </div>
                                )}
                                {/* [2026-09-17] "최저 수락선"(walkAwaySalary)은 삭제 — 실제 GM은
                                    선수의 진짜 마지노선을 알 수 없어야 한다는 사용자 지적. 화면에
                                    안 보여줄 뿐 evaluateFAOffer/estimateAcceptProbability 등
                                    협상 판정 로직 내부에서는 계속 히든 트레잇으로 그대로 쓰인다
                                    (demand.walkAwaySalary 자체는 삭제 안 함 — 표시만 제거). */}
                                {[
                                    { label: '시작 요구가', value: formatMoney(demand.askingSalary) },
                                    { label: '희망 연수', value: `${demand.askingYears}년` },
                                    { label: '희망 변동률', value: `${(demand.askingRaisePercent ?? 0) >= 0 ? '+' : ''}${demand.askingRaisePercent ?? 0}%` },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="text-slate-200">{value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* 선수 유형 — PlayerDetailView.tsx 좌열과 동일 섹션 */}
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

                            {/* 인기도 — PlayerDetailView.tsx 좌열과 동일 섹션 */}
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

                            {/* 성격 & 기분 — PlayerDetailView.tsx와 동일한 라벨 기준(임계값/색상) */}
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

                            {/* 스카우팅 리포트 — PlayerDetailView.tsx와 동일하게 긍정→부정→중립 순 정렬(stable) */}
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

                    {/* ── 중앙: 채팅 ── */}
                    <div className="flex-[3] min-w-0 bg-slate-900 flex flex-col overflow-hidden">
                        <div className="flex-shrink-0 p-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-4">
                            {acceptProbability !== null && (() => {
                                const { text, color } = getAcceptLikelihoodLabel(acceptProbability);
                                return (
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <span className="text-slate-400">계약 가능성</span>
                                        <span className={`font-bold ${color}`}>{text}</span>
                                    </div>
                                );
                            })()}
                            <div className="flex items-center gap-1.5 text-sm">
                                <span className="text-slate-400">현재 기분</span>
                                <span className="text-lg leading-none">{mood.emoji}</span>
                                <span className="font-bold text-slate-300">{mood.label}</span>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                            {chatMessages.map(msg => {
                                if (msg.role === 'status') {
                                    return (
                                        <div key={msg.id} className="flex justify-center py-1">
                                            <span className={`text-xs italic ${msg.isSuccess ? 'text-emerald-400' : 'text-slate-500'}`}>{msg.text}</span>
                                        </div>
                                    );
                                }
                                if (msg.role === 'gm') {
                                    return (
                                        <div key={msg.id} className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                            <span className="text-xs font-bold text-indigo-400 px-1">GM</span>
                                            <div className="max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                                                <p className="text-sm text-white leading-relaxed whitespace-pre-line">{msg.text}</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={msg.id} className="flex flex-col items-start gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <span className="text-xs font-bold text-slate-400 px-1">{player.name}</span>
                                        <div className="max-w-[85%] bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                                            <p className="text-sm text-slate-100 leading-relaxed">&ldquo;{msg.text}&rdquo;</p>
                                            {msg.subText && (
                                                <p className="text-sm text-slate-100 leading-relaxed mt-1">&ldquo;{msg.subText}&rdquo;</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {(isOnCooldown || isRefusingNegotiation) && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/free-agent`)}
                                        className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
                                    >
                                        나가기
                                    </button>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    </div>

                    {/* ── 우측: 오퍼 폼 ── [2026-09-17] 기존엔 이 영역 전체가 오퍼 폼 단일 컬럼
                        이었는데, 영역 폭을 flex-[3]→flex-[5]로 키우면서 좌측 단(오퍼 폼)/
                        우측 단(팀 샐러리 현황·도움말 — 추후 채울 예정, 지금은 자리만 마련)의
                        두 단 구조로 분리. 두 단은 동일 비율(flex-1)로 나눔. */}
                    <div className={`flex-[5] min-w-0 flex flex-col overflow-hidden bg-slate-900 relative transition-opacity duration-300 ${isOfferPanelDisabled ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                        <div className="flex-1 flex divide-x divide-slate-800 overflow-hidden min-h-0">
                            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">

                            {/* 계약 유형 — [2026-09-17] ContractType(free_agent/rookie_scale/two_way,
                                extension은 이 화면에 안 나옴 — FA 신규 서명 전용)을 직접 고른다.
                                이번 시즌 드래프트된 1라운드 픽(rookiePick)이면 루키 스케일로 자동
                                고정되고 선택 자체가 막힌다(위 useEffect). "예외 조항"은 완전히
                                별개 드롭다운(signingType)으로 분리 — 캡 스페이스는 그 드롭다운의
                                "없음"(signingType=undefined)으로 표현한다. */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-sm font-bold uppercase tracking-wider text-slate-400">계약 유형</div>
                                {rookiePick !== null ? (
                                    <div className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-400">
                                        {CONTRACT_TYPE_LABEL.rookie_scale} (이번 시즌 1라운드 픽 — 자동 지정)
                                    </div>
                                ) : (
                                    <select
                                        value={contractType}
                                        onChange={e => setContractType(e.target.value as 'free_agent' | 'two_way')}
                                        disabled={isOnCooldown}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <option value="free_agent">{CONTRACT_TYPE_LABEL.free_agent}</option>
                                        {isTwoWayEligible && <option value="two_way">{CONTRACT_TYPE_LABEL.two_way}</option>}
                                    </select>
                                )}
                            </div>

                            {/* 예외 조항 — 계약 유형에 따라 허용되는 값이 다르다(admin 에디터와 동일한
                                getAllowedSigningTypes 필터 재사용). two_way는 예외 조항이 없어 목록이
                                비고, 그러면 드롭다운 자체를 숨긴다. */}
                            {getAllowedSigningTypes(contractType).length > 0 && (
                                <div className="flex-shrink-0 space-y-1.5">
                                    <div className="text-sm font-bold uppercase tracking-wider text-slate-400">예외 조항</div>
                                    <select
                                        value={signingType ?? ''}
                                        onChange={e => setSigningType((e.target.value || undefined) as SigningType | undefined)}
                                        disabled={isOnCooldown}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <option value="">없음 (캡 스페이스)</option>
                                        {getAllowedSigningTypes(contractType).map(t => (
                                            <option key={t} value={t}>{SIGNING_TYPE_LABEL[t]}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* 계약 연수 — 투웨이 계약은 단년 계약만 가능해 이 섹션(연수 스테퍼 +
                                캡%/변동률 입력) 자체를 숨긴다(연수는 위 useEffect가 항상 1로 고정). */}
                            <div className="flex-shrink-0 space-y-1.5">
                                {!isTwoWay && (
                                    <>
                                        <div className="text-sm font-bold uppercase tracking-wider text-slate-400">계약 연수</div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setYears(MIN_CONTRACT_YEARS)}
                                                disabled={isOnCooldown || isRookieScale}
                                                className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                            >최소</button>
                                            <button
                                                onClick={() => setYears(y => Math.max(MIN_CONTRACT_YEARS, y - 1))}
                                                disabled={isOnCooldown || isRookieScale}
                                                className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                            ><Minus size={14} /></button>
                                            <div className="relative flex-[2]">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={yearsInputText}
                                                    onChange={handleYearsInputChange}
                                                    onBlur={handleYearsBlur}
                                                    disabled={isOnCooldown || isRookieScale}
                                                    className="w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 py-2 text-center text-sm font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300 pointer-events-none">년</span>
                                            </div>
                                            <button
                                                onClick={() => setYears(y => Math.min(effectiveMaxYears, y + 1))}
                                                disabled={isOnCooldown || isRookieScale}
                                                className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                            ><Plus size={14} /></button>
                                            <button
                                                onClick={() => setYears(effectiveMaxYears)}
                                                disabled={isOnCooldown || isRookieScale}
                                                className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                            >최대</button>
                                        </div>
                                        {isMinSalary && (
                                            <div className="text-sm text-slate-600">Minimum Salary Exception은 최대 2년까지만 계약할 수 있습니다.</div>
                                        )}

                                        {/* 1년차 연봉(캡%) + 변동률 — 실제 CBA 계약 구조: 이후 연차는
                                            1년차 연봉 × (1 + 변동률 × n)으로 자동 계산(복리 아님).
                                            Minimum Salary Exception/루키 스케일이면 이 두 입력은
                                            의미가 없어져 비활성화하고, 대신 각각의 자동 계산 안내를
                                            보여준다. */}
                                        <div className="pt-1.5 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold uppercase tracking-wider text-slate-400">캡%</span>
                                                {!isMinSalary && !isRookieScale && (
                                                    <span className="text-sm text-green-500">최대 가능 캡% : {maxCapPct}%</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => adjustCapPercent('min')}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >최소</button>
                                                <button
                                                    onClick={() => adjustCapPercent(-1)}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >-1%</button>
                                                <div className="relative flex-[2]">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={capPercentInput}
                                                        onChange={handlePercentInput(setCapPercentInput)}
                                                        disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                        className="w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 py-2 text-center text-sm font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300 pointer-events-none">%</span>
                                                </div>
                                                <button
                                                    onClick={() => adjustCapPercent(1)}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >+1%</button>
                                                <button
                                                    onClick={() => adjustCapPercent('max')}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >최대</button>
                                            </div>
                                            {maxCapResult.reason === 'rose_rule' && !isMinSalary && !isRookieScale && (
                                                <div className="text-sm text-slate-600">데릭 로즈 룰 자격(YOS {playerYos}년, 루키 3시즌 내 수상)으로 최대 30%까지 가능합니다.</div>
                                            )}
                                        </div>

                                        <div className="pt-1.5 space-y-1">
                                            <span className="text-sm font-bold uppercase tracking-wider text-slate-400">변동률 (최대 ±{maxRaisePercent}%)</span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => adjustRaisePercent('min')}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >최소</button>
                                                <button
                                                    onClick={() => adjustRaisePercent(-1)}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >-1%</button>
                                                <div className="relative flex-[2]">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={raisePercentInput}
                                                        onChange={handlePercentInput(setRaisePercentInput)}
                                                        disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                        className="w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 py-2 text-center text-sm font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300 pointer-events-none">%</span>
                                                </div>
                                                <button
                                                    onClick={() => adjustRaisePercent(1)}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >+1%</button>
                                                <button
                                                    onClick={() => adjustRaisePercent('max')}
                                                    disabled={isOnCooldown || isMinSalary || isRookieScale}
                                                    className="flex-1 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
                                                >최대</button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* 루키 스케일 배율(80~120%) — Minimum Salary Exception일 때는
                                    안 뜨고, 루키 스케일일 때만 노출. */}
                                {isRookieScale && (
                                    <div className="pt-1.5 space-y-1">
                                        <span className="text-sm text-slate-500">루키 스케일 배율 (80~120%)</span>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={rookieMultiplierInput}
                                                onChange={handlePercentInput(setRookieMultiplierInput)}
                                                onBlur={handleRookieMultiplierBlur}
                                                disabled={isOnCooldown}
                                                className="w-full bg-slate-950 border border-slate-600 rounded-lg pl-3 pr-7 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-300 pointer-events-none">%</span>
                                        </div>
                                    </div>
                                )}

                                {isMinSalary ? (
                                    <div className="text-sm text-slate-500">선수의 YOS(서비스타임) 기준으로 시즌별 미니멈 샐러리가 자동 계산됩니다.</div>
                                ) : isRookieScale ? (
                                    rookiePick !== null && (
                                        <div className="text-sm text-slate-500">{rookiePick}픽 기준 스케일의 {rookieMultiplierInput || 0}%로 자동 계산됩니다.</div>
                                    )
                                ) : null}
                            </div>

                            {/* 계약 예상액 — 위 캡%/인상률로 자동 계산된 연차별 금액(읽기 전용) */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-sm font-bold text-slate-400">계약 예상액</div>
                                <div className="space-y-1">
                                    {salaries.map((sal, i) => {
                                        const seasonStartYear = currentSeasonYear + i;
                                        const seasonLabel = `${seasonStartYear}-${String((seasonStartYear + 1) % 100).padStart(2, '0')}`;
                                        const isLastYear = i === salaries.length - 1;
                                        return (
                                            <div key={i} className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">{seasonLabel}</span>
                                                <span className="flex items-center gap-1.5">
                                                    {isLastYear && optionType && (
                                                        <span className="italic font-bold text-yellow-400">
                                                            {optionType === 'team' ? '(TO)' : '(PO)'}
                                                        </span>
                                                    )}
                                                    <span className="font-bold text-white">{formatMoney(sal)}</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 추가 사항 — 팀 옵션/플레이어 옵션(계약 마지막 해에만, 2년 이상 계약부터
                                설정 가능). 체크박스 2개지만 배타적으로 동작(하나 켜면 다른 하나는 꺼짐).
                                투웨이 계약은 옵션을 쓸 수 없어(단년 계약뿐) 섹션 자체를 숨긴다. */}
                            {!isTwoWay && (
                                <div className="flex-shrink-0 space-y-1.5">
                                    <div className="text-sm font-bold text-slate-400">추가 사항</div>
                                    <div className="flex items-center gap-4">
                                        <label className={`flex items-center gap-2 text-sm text-slate-300 ${years < 2 || isRookieScale ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                checked={optionType === 'team'}
                                                disabled={years < 2 || isOnCooldown || isRookieScale}
                                                onChange={() => setOptionType(prev => prev === 'team' ? null : 'team')}
                                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                            />
                                            팀 옵션
                                        </label>
                                        <label className={`flex items-center gap-2 text-sm text-slate-300 ${years < 2 || isRookieScale ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                checked={optionType === 'player'}
                                                disabled={years < 2 || isOnCooldown || isRookieScale}
                                                onChange={() => setOptionType(prev => prev === 'player' ? null : 'player')}
                                                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                            />
                                            플레이어 옵션
                                        </label>
                                    </div>
                                    {years < 2 && !isRookieScale && (
                                        <div className="text-sm text-slate-600">2년 이상 계약부터 마지막 해에 옵션을 설정할 수 있습니다.</div>
                                    )}
                                </div>
                            )}

                            {/* 총액 요약 — "체결 가능성"은 중앙 채팅 헤더와 중복이라 여기서는 뺌 */}
                            <div className="flex-shrink-0 space-y-1 pt-2 border-t border-slate-700/50">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-semibold">총 계약액</span>
                                    <span className="font-bold text-white">{formatMoney(totalSalary)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-semibold">AAV</span>
                                    <span className="font-bold text-white">{formatMoney(avgSalary)}</span>
                                </div>
                            </div>

                        </div>

                        {/* 우측 단: 팀 샐러리캡 현황 + 로스터/액션 경고 + 오퍼 제출 버튼.
                            [2026-09-17] 원래 좌측 단(오퍼 폼) 맨 아래에 있던 이 4개 블록을
                            그대로 이 단으로 옮김(로직/조건 변경 없이 위치만 이동) — 좌측 단은
                            순수 계약 조건 입력(유형/예외/연수/캡%/변동률/예상액)만 남기고,
                            결과 확인·제출은 우측 단에서 하도록 역할 분리. */}
                        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
                            {/* 팀 샐러리캡 현황 — 계약 전/후 페이롤을 모두 보여준다.
                                calcTeamPayroll()은 singleplayer FA 엔진(faMarketBuilder.ts)이
                                이미 쓰는 함수 재사용(로스터 연봉 합 + 데드머니). "계약 후"는
                                1년차 연봉만 이번 시즌 캡에 더해진다고 가정. */}
                            {capInfo && (() => {
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
                                                <span className="text-slate-400 font-semibold">계약 후 예상 페이롤</span>
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

                            {isRosterFull && !result?.accepted && !walkedAway && (
                                <div className="flex-shrink-0 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
                                    <ShieldAlert size={14} className="shrink-0" />
                                    로스터 정원({(league as any)?.max_roster_size ?? 15}명)이 가득 찼습니다. 선수를 방출한 뒤 다시 시도하세요.
                                </div>
                            )}

                            {actionError && (
                                <div className="flex-shrink-0 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                                    <ShieldAlert size={14} className="shrink-0" /> {actionError}
                                </div>
                            )}

                            <div className="flex-shrink-0 mt-auto pt-2">
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting || salaries.length === 0 || salaries.some(s => s <= 0) || isLocked}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {submitting ? '처리 중...' : isRosterFull ? '로스터 정원 초과' : isTwoWaySlotsFull ? '투웨이 정원 초과' : '오퍼 제출'}
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiNegotiationView;
