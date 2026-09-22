
import { Game, Player, Team } from '../types';
import type { CareerSeasonStat } from '../types/player';
import { calculateOvr, getOVRThreshold } from './ovrUtils';
export { getOVRThreshold } from './ovrUtils';
export type { OvrTier } from './ovrUtils';
import { TEAM_DATA, TeamStaticData } from '../data/teamData';
import { TEAM_ID_MAP } from '../data/mappings';
import { VIRTUAL_TEAMS } from '../data/virtualTeams';
import { editorLogoUrls } from './editorState';

import { DEFAULT_SEASON_CONFIG } from './seasonConfig';

// YOS(서비스타임)별 미니멈 샐러리 테이블 — [2026-09-22] 정의를 utils/minSalaryTable.ts로 이동
// (서버가 constants.ts를 import하면 supabaseClient 초기화 부작용이 따라와서 순수 데이터만 분리).
// 기존 import 경로(LeagueSettingsView.tsx / MultiNegotiationView.tsx) 호환을 위해 재export.
export { MIN_SALARY_YOS_TABLE, minSalaryForYos } from './minSalaryTable';

// YOS(서비스타임)를 "실제 커리어 기록(career_history)에 몇 시즌이 있는지 세는" 방식으로
// 계산 — 드래프트 연도만으로 역산(currentSeasonYear - draftYear)하면 해외리그 체류/부상
// 시즌 등으로 실제 뛴 시즌 수와 어긋날 수 있다는 지적으로 이 방식으로 교체됨. 플레이오프
// 기록은 별도 행(playoff:true)으로 들어와 있어 정규시즌만 거르고, 시즌 중 트레이드로 같은
// 시즌에 여러 팀 행이 생기는 경우를 대비해 season 문자열 기준으로 중복 제거 후 개수를 센다.
// 원래 views/multi/season/MultiNegotiationView.tsx 로컬 함수였다가, 재정 탭(RFA/UFA 칩
// 미리보기)도 동일 계산이 필요해져 공용 함수로 승격.
export function countYosFromCareerHistory(history: CareerSeasonStat[] | undefined): number {
    if (!history || history.length === 0) return 0;
    const seasons = new Set(history.filter(e => !e.playoff).map(e => e.season));
    return seasons.size;
}

// [2026-09-17] 재정 탭 UFA/RFA 미리보기 칩에서 countYosFromCareerHistory()만 쓰면, 실제
// NBA 커리어 기록이 아예 안 채워진 선수(올타임 레전드 풀 등 — 특정 피크 시즌 기준 age/
// draft_year만 세팅하고 career_history JSONB는 비워둔 경우)의 YOS가 전부 0으로 나와,
// 계약 잔여연차가 3년 이하이기만 하면 나이/경력과 무관하게 전부 RFA로 표시되는 문제가
// 있었다(제임스 하든/카멜로 앤서니처럼 명백한 베테랑도 RFA로 표시됨). career_history가
// 있으면 그걸 우선 신뢰하고(정확도 이유로 이미 MultiNegotiationView.tsx가 이 방식을
// 채택했음), 비어있을 때만 draftYear 역산으로 폴백한다 — 둘 다 없으면 0.
export function estimatePlayerYOS(
    player: Pick<Player, 'career_history' | 'draftYear'>,
    currentSeasonYear: number,
): number {
    const fromHistory = countYosFromCareerHistory(player.career_history);
    if (fromHistory > 0) return fromHistory;
    if (player.draftYear != null) return Math.max(0, currentSeasonYear - player.draftYear);
    return 0;
}

// 투웨이 계약 자격 기준 — YOS(서비스타임) 4년 미만 & OVR이 이 값 미만이어야 함(NBA 실제
// 투웨이 룰: YOS<4). OVR 상한은 marketValueScore만으로는 저연차 특급 유망주가 투웨이로
// 잘못 분류되는 걸 막기 위한 보조 기준(원래 views/multi/season/MultiNegotiationView.tsx
// 로컬 상수였다가, MultiFreeAgentView.tsx의 "계약" 버튼 활성화 조건에도 동일 기준이
// 필요해져 공용 상수로 승격 — 두 화면이 서로 다른 기준으로 어긋나면 "협상 화면 진입은
// 되는데 목록에서는 막힘" 같은 불일치가 생기므로 반드시 이 상수 하나만 참조할 것).
export const TWO_WAY_YOS_MAX = 4;
export const TWO_WAY_MAX_OVR = 75;

export const APP_NAME = 'Basketball GM Simulator';
export const APP_YEAR = String(DEFAULT_SEASON_CONFIG.endYear);
export const APP_FULL_NAME = `${APP_NAME} ${APP_YEAR}`;

/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const SEASON_START_DATE = DEFAULT_SEASON_CONFIG.startDate;
/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const TRADE_DEADLINE = DEFAULT_SEASON_CONFIG.tradeDeadline;

// League Financial Constants (달러) — 시즌 1(2025-26) 기준값
// updateLeagueFinancials() 호출로 시즌별 캡에 맞게 갱신됨
//
// ⚠️ 싱글플레이어 전용 전역 싱글턴. 멀티플레이어는 리그마다 salary_cap_amount 등이
// 달라서(leagues 테이블 컬럼, LeagueSettingsView.tsx에서 설정) 이 상수를 참조하지 않는다.
// [2026-09-22] calcFADemand()/calcYOSBounds()(services/fa/faValuation.ts)는 이제 캡을 필수 인자
// (salaryCap)로 받고 이 상수를 import하지 않는다 — 멀티는 리그 캡을, 싱글 호출부(faMarketBuilder/
// extensionEngine)는 LEAGUE_FINANCIALS.SALARY_CAP을 명시적으로 넘긴다. 폴백이 없으므로 캡을
// 빠뜨리면 컴파일 에러. 서버(server/src)가 faValuation을 import해도 이 파일(→ ovrUtils →
// gameConfigService → supabaseClient)이 따라오지 않는다.
// 새 멀티 코드에서 이 상수를 직접 import하면 안 됨 — 리그별 캡이 서로 덮어써지는 버그가 남.
export const LEAGUE_FINANCIALS = {
    SALARY_FLOOR:   139_182_000,
    SALARY_CAP:     154_647_000,
    TAX_LEVEL:      187_895_000,
    FIRST_APRON:    195_945_000,
    SECOND_APRON:   207_824_000,
};

// Signing Exception Amounts (달러) — 2025-26
// ⚠️ 이것도 싱글플레이어 전용 (위 LEAGUE_FINANCIALS와 동일한 이유)
export const SIGNING_EXCEPTIONS = {
    NON_TAX_MLE:  14_104_000,  // Non-Taxpayer MLE (1차 에이프런 미만 팀, 최대 4년)
    TAXPAYER_MLE:  5_685_000,  // Taxpayer MLE (1~2차 에이프런 사이 팀, 최대 2년)
    BAE:           4_516_000,  // Bi-Annual Exception (비납세자, 최대 2년, 2시즌에 1번)
};

// ── 캡 히스토리 / 동적 갱신 ────────────────────────────────────────────────
// 이 섹션(updateLeagueFinancials/generateCapHistory/getSeasonCap) 전부 싱글플레이어
// 전용. 멀티플레이어 캡 성장률은 leagues.cap_growth_rate(리그별 설정값)를 그대로
// 복리 계산에 쓴다 — 예: views/multi/season/MultiNegotiationView.tsx의 minSalarySeasons.

/** 시즌 1(2025-26) 기준 캡 대비 각 임계값 비율 (고정) */
const _BASE_CAP = 154_647_000;
const _CAP_RATIOS = {
    SALARY_FLOOR:   139_182_000 / _BASE_CAP,   // ~0.9002
    TAX_LEVEL:      187_895_000 / _BASE_CAP,   // ~1.2151
    FIRST_APRON:    195_945_000 / _BASE_CAP,   // ~1.2672
    SECOND_APRON:   207_824_000 / _BASE_CAP,   // ~1.3440
};
const _MLE_RATIOS = {
    NON_TAX_MLE:  14_104_000 / _BASE_CAP,      // ~0.09121
    TAXPAYER_MLE:  5_685_000 / _BASE_CAP,      // ~0.03677
    BAE:           4_516_000 / _BASE_CAP,      // ~0.02920
};

/**
 * 새 시즌 캡 금액으로 LEAGUE_FINANCIALS·SIGNING_EXCEPTIONS 전체를 비율 기반 재계산.
 * 게임 로드 시 및 시즌 전환(openingNight) 시 호출.
 */
export function updateLeagueFinancials(newCap: number): void {
    LEAGUE_FINANCIALS.SALARY_CAP    = newCap;
    LEAGUE_FINANCIALS.SALARY_FLOOR  = Math.round(newCap * _CAP_RATIOS.SALARY_FLOOR);
    LEAGUE_FINANCIALS.TAX_LEVEL     = Math.round(newCap * _CAP_RATIOS.TAX_LEVEL);
    LEAGUE_FINANCIALS.FIRST_APRON   = Math.round(newCap * _CAP_RATIOS.FIRST_APRON);
    LEAGUE_FINANCIALS.SECOND_APRON  = Math.round(newCap * _CAP_RATIOS.SECOND_APRON);
    SIGNING_EXCEPTIONS.NON_TAX_MLE  = Math.round(newCap * _MLE_RATIOS.NON_TAX_MLE);
    SIGNING_EXCEPTIONS.TAXPAYER_MLE = Math.round(newCap * _MLE_RATIOS.TAXPAYER_MLE);
    SIGNING_EXCEPTIONS.BAE          = Math.round(newCap * _MLE_RATIOS.BAE);
}

/**
 * 시즌 1부터 N시즌까지 캡 히스토리 생성.
 * 매년 5~10% 사이 랜덤 성장 (CBA 10% 상한 내).
 */
export function generateCapHistory(seasonCount: number = 10): Record<number, number> {
    const history: Record<number, number> = {};
    history[1] = _BASE_CAP;
    for (let s = 2; s <= seasonCount; s++) {
        const growthRate = 0.05 + Math.random() * 0.05;
        history[s] = Math.round(history[s - 1] * (1 + growthRate));
    }
    return history;
}

/** 캡 히스토리에서 특정 시즌 캡 조회 (없으면 현재 SALARY_CAP 반환) */
export function getSeasonCap(capHistory: Record<number, number>, seasonNumber: number): number {
    return capHistory[seasonNumber] ?? LEAGUE_FINANCIALS.SALARY_CAP;
}

/** @deprecated buildSeasonConfig(n) 사용 권장 */
export const CALENDAR_EVENTS = {
    ALL_STAR_START: DEFAULT_SEASON_CONFIG.allStarStart,
    ALL_STAR_END: DEFAULT_SEASON_CONFIG.allStarEnd
};

// Adapter for existing code using TEAM_OWNERS
export let TEAM_OWNERS: Record<string, string> = Object.values(TEAM_DATA).reduce((acc, team) => {
    acc[team.id] = team.owner;
    return acc;
}, {} as Record<string, string>);

// Adapter for existing code using FALLBACK_TEAMS
export let FALLBACK_TEAMS = Object.values(TEAM_DATA).map((t: TeamStaticData) => ({
    id: t.id,
    city: t.city,
    name: t.name,
    conference: t.conference,
    division: t.division
}));

/** TEAM_DATA 뮤테이션 후 파생 상수를 재계산 */
export function rebuildDerivedConstants(): void {
    TEAM_OWNERS = Object.values(TEAM_DATA).reduce((acc, team) => {
        acc[team.id] = team.owner;
        return acc;
    }, {} as Record<string, string>);

    FALLBACK_TEAMS = Object.values(TEAM_DATA).map((t: TeamStaticData) => ({
        id: t.id,
        city: t.city,
        name: t.name,
        conference: t.conference,
        division: t.division,
    }));
}

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, tovForced: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    pf: 0,
    techFouls: 0,
    flagrantFouls: 0,
    plusMinus: 0,
    contestedAttempted: 0, contestedMade: 0,
    defRimAttempted: 0, defRimMade: 0,
    defMidAttempted: 0, defMidMade: 0,
    defThreeAttempted: 0, defThreeMade: 0,
    defRAAttempted: 0, defRAMade: 0,
    defITPAttempted: 0, defITPMade: 0,
    defMIDAttempted: 0, defMIDMade: 0,
    defCNRAttempted: 0, defCNRMade: 0,
    defWINGAttempted: 0, defWINGMade: 0,
    defATBAttempted: 0, defATBMade: 0,

    // --- New 10-Zone Shooting Data ---
    zone_rim_m: 0, zone_rim_a: 0,
    zone_paint_m: 0, zone_paint_a: 0, // Merged Paint
    zone_mid_l_m: 0, zone_mid_l_a: 0,
    zone_mid_c_m: 0, zone_mid_c_a: 0,
    zone_mid_r_m: 0, zone_mid_r_a: 0,
    zone_c3_l_m: 0, zone_c3_l_a: 0,
    zone_c3_r_m: 0, zone_c3_r_a: 0,
    zone_atb3_l_m: 0, zone_atb3_l_a: 0,
    zone_atb3_c_m: 0, zone_atb3_c_a: 0,
    zone_atb3_r_m: 0, zone_atb3_r_a: 0
});

export const resolveTeamId = (nameOrId: string | null | undefined): string => {
    if (!nameOrId) return 'unknown';
    const input = String(nameOrId).toLowerCase().trim();
    
    // Check main data first
    if (TEAM_DATA[input]) return input;

    // Check mappings
    if (TEAM_ID_MAP[input]) return TEAM_ID_MAP[input];

    // 가상 확장팀(토너먼트 32/64팀) — team_slug 또는 team_abbr로 조회
    const virtualTeam = VIRTUAL_TEAMS.find(t => t.team_slug === input || t.team_abbr.toLowerCase() === input);
    if (virtualTeam) return virtualTeam.team_slug;

    // Partial match fallback (Slower but robust)
    for (const key in TEAM_ID_MAP) {
        if (input.includes(key)) return TEAM_ID_MAP[key];
    }
    // Also check against city/names in TEAM_DATA
    for (const team of Object.values(TEAM_DATA)) {
        if (input.includes(team.city.toLowerCase()) || input.includes(team.name.toLowerCase())) {
            return team.id;
        }
    }

    return 'unknown';
};

export const getTeamLogoUrl = (teamId: string): string => {
    const id = resolveTeamId(teamId);
    const editorUrl = editorLogoUrls.get(id);
    if (editorUrl) return editorUrl;
    return `/logos/${id}.svg`;
};

// [2026-09-09] 올스타 본경기/라이징스타 챌린지 가상 팀 ID → public/logos/real/AS/ 전용 로고.
// resolveTeamId()의 일반 패턴(실제 30팀 약어 매핑)을 안 타게 getRealTeamLogoUrl()에서 먼저
// 걸러낸다 — 가상 ID를 그대로 resolveTeamId에 넘기면 TEAM_ID_MAP 부분일치 폴백에 걸려 엉뚱한
// 실제 팀 로고로 잘못 매칭될 위험이 있다(예: 짧은 팀 코드가 "EAST-ALLSTAR" 문자열 안에
// 우연히 포함되는 경우).
const ALLSTAR_LOGO_FILE: Record<string, string> = {
    'EAST-ALLSTAR': 'AS/East', 'WEST-ALLSTAR': 'AS/West',
    'RISINGSTARS-A': 'AS/RisingA', 'RISINGSTARS-B': 'AS/RisingB',
};

// [2026-09-06] 멀티플레이어용 신규 로고 세트(public/logos/real/, 대문자 파일명) — 테스트 목적으로
// 선수 상세페이지 헤더 큰 로고 한 곳에만 우선 적용. 기존 /logos/{id}.svg(소문자, 싱글전용)와는
// 별개 세트라 milwaukee('mil')처럼 real/에 파일이 없는 팀은 <img onError>에서 구버전으로 폴백.
// 가상 확장팀(토너먼트) 로고 파일명이 team_slug/team_abbr와 다른 경우 오버라이드.
// 예: 라스베이거스 팬텀스(team_slug='lvp', team_abbr='LVP')지만 실제 로고 파일은 LV.svg.
const VIRTUAL_LOGO_FILE_OVERRIDE: Record<string, string> = {
    'lvp': 'LV',
};

export const getRealTeamLogoUrl = (teamId: string): string => {
    const allstarFile = ALLSTAR_LOGO_FILE[teamId];
    if (allstarFile) return `/logos/real/${allstarFile}.svg`;
    const id = resolveTeamId(teamId);
    const override = VIRTUAL_LOGO_FILE_OVERRIDE[id];
    return `/logos/real/${override ?? id.toUpperCase()}.svg`;
};

// [2026-09-09] MultiStandingsView.tsx의 컨퍼런스 그룹 헤더 색상으로 도입됐던 값 — 올스타 본경기
// 헤더 테마색(동부/서부 대표색)에도 재사용하기 위해 공용 상수로 승격.
export const CONFERENCE_COLORS: Record<'East' | 'West', string> = {
    East: '#1D4289',
    West: '#C8102E',
};

// [2026-09-09] 라이징스타 챌린지 팀 테마색(사용자 지정값) — hooks/useAllStarTeamDisplay.ts
// (스케줄/라이브뷰)와 views/multi/season/newsFeedCards.tsx(결과 서신 박스스코어) 둘 다
// 같은 값을 써야 해서 공용 상수로 승격.
export const RISING_STARS_COLORS = { A: '#0080FF', B: '#FF00A6' };

// [Critical] 항상 능력치 기반으로 OVR 동적 계산 (성장/퇴화 반영)
export const calculatePlayerOvr = (p: Player, position?: string): number => {
    return calculateOvr(p, position || p.position);
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
    return [];
};
