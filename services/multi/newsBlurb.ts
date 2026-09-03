
// newsBlurb.ts — 뉴스피드 카드용 기사체 문단 생성기.
//
// [2026-09-01] "스코어/박스스코어 버튼만 뜨는 게 아니라 실제 뉴스처럼 짤막한 글이 있었으면
// 좋겠다"는 요청 — league_events.payload의 구조화 필드(이미 서버가 만들어 둔 사실들)를
// 조합해 기사체 텍스트를 만든다. LLM 없이(Gemini 비활성 상태, CLAUDE.md 참고) 순수 템플릿
// 조합이라 결정론적 — 서버가 아니라 클라이언트에서 렌더 시점에 만드는 이유는 (1) headline처럼
// DB에 미리 못박아두지 않아 문구를 조정할 때마다 재배포/백필이 필요 없고, (2) 이미 파싱된
// 구조화 payload(detail)만으로 충분해서다. LEGACY 이벤트는 blurb 없음(구조화 필드 자체가
// 없어 문장을 조합할 재료가 없음) — 카드가 기존 헤드라인만 보여주면 됨.
//
// [2026-09-01 후속] "한 줄로 끝나지 말고 실제 뉴스기사처럼 4~5줄로 다양하게 조합돼 나왔으면
// 좋겠다"는 요청 — 문장 하나를 문단 여러 개(각각 별도 <p>로 렌더)로 확장하고, 각 문단 슬롯마다
// 여러 문구 후보(pool)를 만들어 event.id 기반 결정론적 해시로 하나씩 고른다(같은 이벤트는
// 항상 같은 문구 조합 — 재렌더/캐시 재조회 때 문구가 바뀌어 보이지 않도록). 실제 데이터
// (payload)에 없는 사실(가상의 시즌 통산 스탯, 순위 등)은 절대 지어내지 않고, 오직 이번
// 이벤트가 가진 필드(스탯라인/스코어/상대팀/연속기록 수 등)만 문장으로 재구성하거나, 데이터에
// 의존하지 않는 순수 분위기 문구(플레이버)만 pool에 둔다.

import type { LeagueEvent } from '../../hooks/useLeagueHeadlines';
import type { LeagueTeamRow } from './roomQueries';
import type { GameRef } from './leagueEventPayload';

// 한글 완성형(가~힣) 마지막 글자의 받침 유무로 조사를 고른다. 한글이 아닌 문자로 끝나면
// (팀/선수명은 전부 한국어 — feedback_db_player_names_korean 메모 참고) 받침 없는 쪽으로 폴백.
function hasBatchim(word: string): boolean {
    if (!word) return false;
    const code = word.charCodeAt(word.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return false;
    return (code - 0xAC00) % 28 !== 0;
}
function josa(word: string, withBatchim: string, withoutBatchim: string): string {
    return `${word}${hasBatchim(word) ? withBatchim : withoutBatchim}`;
}
// 자주 쓰는 조사 4종 — 문구 pool을 짧고 읽기 쉽게 유지하기 위한 단축 래퍼.
const i = (w: string) => josa(w, '이', '가');   // 주격
const eun = (w: string) => josa(w, '은', '는'); // 주제격
const eul = (w: string) => josa(w, '을', '를'); // 목적격
const gwa = (w: string) => josa(w, '과', '와'); // 접속(~와)
const euro = (w: string) => josa(w, '으로', '로'); // 도구/방향격(~으로)

function teamName(slug: string, teamBySlug: Map<string, LeagueTeamRow>): string {
    return teamBySlug.get(slug)?.team_name ?? slug;
}

const FEAT_LABEL: Record<string, string> = {
    triple_double: '트리플더블',
    double_double: '더블더블',
    stat_explosion: '스탯 폭발',
};

// event.id(문자열) 기반 결정론적 해시 — 같은 이벤트는 항상 같은 인덱스를 뽑는다. slot을
// 함께 섞어서 같은 이벤트라도 문단 슬롯(오프닝/디테일/플레이버/...)마다 다른 후보가
// 걸리도록 한다(안 그러면 해시가 같아 pool마다 항상 같은 상대 위치만 고르는 경향이 생김).
function pick<T>(seed: string, slot: string, pool: readonly T[]): T {
    const full = `${seed}:${slot}`;
    let hash = 0;
    for (let idx = 0; idx < full.length; idx++) {
        hash = (hash * 31 + full.charCodeAt(idx)) | 0;
    }
    return pool[Math.abs(hash) % pool.length];
}

// player_feat/player_streak 마지막 문단 — 그 경기의 승패(+마진 뉘앙스)를 붙인다. game이
// 없으면(옛 이벤트, GameRef 파싱 실패) 빈 문자열 → 호출부가 그 줄 자체를 생략.
function gameOutcomeParagraph(teamSlug: string, game: GameRef | undefined): string {
    if (!game) return '';
    const isHome = teamSlug === game.homeSlug;
    const myScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    const margin = Math.abs(myScore - oppScore);
    if (myScore > oppScore) {
        const flavor = margin >= 20 ? ' 시종일관 앞선 흐름 속 여유 있는 승리였다.'
            : margin <= 3 ? ' 마지막까지 손에 땀을 쥐게 한 접전 끝의 승리였다.'
                : '';
        return `팀은 이 경기를 ${myScore}-${oppScore}로 승리했다.${flavor}`;
    }
    return `다만 팀은 ${myScore}-${oppScore}로 이 경기를 내주고 말았다.`;
}

// ── player_feat ──────────────────────────────────────────────────────────
// [2026-09-01 후속] "바리에이션을 좀 더 다양하게" — 사용자가 고른 3가지 방향으로 확장:
// (1) 슬롯별 후보 개수를 늘리고, (2) featKind(트리플더블/더블더블/스탯폭발)별로 어투가
// 다른 전용 오프닝 문구를 쓰며, (3) 매번 "오프닝→디테일→플레이버" 3문단으로 고정되던
// 구조 자체를 흔든다 — FEAT_PLANS 중 하나를 이벤트별로 결정론적으로 골라 문단 개수/순서를
// 바꾼다(짧으면 오프닝+1문단, 길면 오프닝+3문단+경기결과까지 최대 5줄).

interface FeatVars { player: string; opp: string; statLine: string; featLabel: string }

// featKind별 전용 오프닝 — 트리플더블은 희소성/화려함, 더블더블은 안정감/꾸준함, 스탯폭발은
// 파괴적인 어투로 톤을 차별화했다.
const TRIPLE_DOUBLE_OPENERS: ((v: FeatVars) => string)[] = [
    v => `좀처럼 보기 힘든 장면이 나왔다. ${i(v.player)} ${eul(v.opp)} 상대로 ${v.statLine}의 트리플더블을 작성했다.`,
    v => `${v.opp}전에서 ${i(v.player)} ${v.statLine}을 고르게 채우며 값진 트리플더블을 완성했다.`,
    v => `공수 전 영역에서 존재감을 과시한 ${v.player}가 ${v.statLine}으로 트리플더블 도장을 찍었다.`,
    v => `${eun(v.opp)} ${v.player} 한 명을 막지 못해 무너졌다. ${v.statLine}의 트리플더블이었다.`,
    v => `이날 스탯시트는 온통 ${v.player}의 이름으로 채워졌다. ${v.statLine}의 트리플더블.`,
];

const DOUBLE_DOUBLE_OPENERS: ((v: FeatVars) => string)[] = [
    v => `${i(v.player)} ${eul(v.opp)} 상대로 ${v.statLine}의 더블더블을 안정적으로 채워 넣었다.`,
    v => `${v.opp}전에서도 어김없었다. ${i(v.player)} ${v.statLine}으로 더블더블을 신고했다.`,
    v => `꾸준함이 무기다. ${i(v.player)} 이날도 ${v.statLine}의 더블더블로 제 몫을 다했다.`,
    v => `${i(v.player)} ${v.statLine}을 앞세워 ${eul(v.opp)} 조용히 무너뜨렸다.`,
    v => `화려하진 않아도 확실했다. ${v.opp}전 ${v.player}의 스탯 라인은 ${v.statLine}이었다.`,
];

const STAT_EXPLOSION_OPENERS: ((v: FeatVars) => string)[] = [
    v => `폭발이라는 말이 아깝지 않았다. ${i(v.player)} ${eul(v.opp)} 상대로 ${v.statLine}을 몰아쳤다.`,
    v => `${v.opp}의 수비는 속수무책이었다. ${i(v.player)} ${v.statLine}으로 코트를 초토화시켰다.`,
    v => `${i(v.player)} 이날만큼은 누구도 막을 수 없었다. ${v.statLine}의 대폭발이었다.`,
    v => `${v.opp}전 ${v.statLine} — ${i(v.player)} 커리어에 남을 한 판을 만들어냈다.`,
    v => `숫자로 설명이 끝나지 않는 하루였다. ${i(v.player)} ${v.statLine}을 퍼부으며 ${eul(v.opp)} 압도했다.`,
];

const FEAT_OPENERS_BY_KIND: Record<'triple_double' | 'double_double' | 'stat_explosion', ((v: FeatVars) => string)[]> = {
    triple_double: TRIPLE_DOUBLE_OPENERS,
    double_double: DOUBLE_DOUBLE_OPENERS,
    stat_explosion: STAT_EXPLOSION_OPENERS,
};

const FEAT_DETAILS: ((v: { topLabel: string; topValue: number; player: string }) => string)[] = [
    v => `특히 ${v.topValue} ${v.topLabel}은 이날 경기에서 가장 돋보인 수치였다.`,
    v => `${v.topValue} ${v.topLabel}을 앞세운 이번 활약은 팀 승리의 결정적 발판이 됐다.`,
    v => `${v.topValue}에 달하는 ${v.topLabel} 수치는 상대 벤치를 술렁이게 하기 충분했다.`,
    v => `${v.topLabel} ${v.topValue}개는 이날 스탯시트에서 유독 눈에 띄는 줄이었다.`,
    v => `${v.topValue} ${v.topLabel}이라는 숫자 하나로 이날의 활약을 설명하기에 충분했다.`,
    v => `벤치의 코칭스태프도 ${v.topValue} ${v.topLabel} 앞에서는 고개를 끄덕일 수밖에 없었다.`,
];

const FEAT_FLAVOR: ((v: { player: string }) => string)[] = [
    () => `팀 내 공격 옵션으로서 존재감을 다시 한번 입증한 순간이다.`,
    v => `상대 수비진은 끝내 ${v.player}의 리듬을 무너뜨리지 못했다.`,
    () => `이런 활약이 이어진다면 시즌 내내 화제의 중심에 설 전망이다.`,
    v => `동료들의 신뢰도 자연스레 ${v.player}에게 쏠리는 모습이다.`,
    () => `관중석에서도 몇 번이나 탄성이 터져 나왔다.`,
    v => `${v.player}는 경기 후에도 담담한 표정으로 코트를 떠났다.`,
    () => `상대팀 코칭스태프는 작전타임 내내 대응책 마련에 분주했다.`,
];

// 같은 이벤트라도 오프닝 뒤에 이어지는 문단 구성이 매번 [디테일→플레이버] 두 개로 고정되지
// 않도록, "본문 플랜" 자체를 여러 개 준비해 이벤트별로 하나씩 고른다. 짧으면 1문단만
// 이어지고, 길면 서로 다른 플레이버 두 개(flavor/flavor2)까지 붙어 오프닝+3문단이 된다.
type FeatSlot = 'detail' | 'flavor' | 'flavor2';
const FEAT_PLANS: readonly FeatSlot[][] = [
    ['detail', 'flavor'],
    ['flavor'],
    ['detail'],
    ['detail', 'flavor', 'flavor2'],
    ['flavor', 'detail'],
    ['flavor', 'flavor2'],
];

// 같은 슬롯 풀에서 두 개를 뽑되(flavor/flavor2), 우연히 같은 문구가 겹치면 다음 후보로
// 한 칸 밀어 중복을 피한다.
function pickTwoDistinct<T>(seed: string, slotA: string, slotB: string, pool: readonly T[]): [T, T] {
    const a = pick(seed, slotA, pool);
    let b = pick(seed, slotB, pool);
    if (b === a && pool.length > 1) {
        b = pool[(pool.indexOf(a) + 1) % pool.length];
    }
    return [a, b];
}

function buildPlayerFeatBlurb(d: Extract<LeagueEvent['detail'], { kind: 'player_feat' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const opp = teamName(d.opponentSlug, teamBySlug);
    const statLine = d.stats.map(s => `${s.value} ${s.label}`).join(', ');
    const featLabel = FEAT_LABEL[d.featKind] ?? '맹활약';
    const topStat = d.stats[0];
    const openerPool = FEAT_OPENERS_BY_KIND[d.featKind] ?? DOUBLE_DOUBLE_OPENERS;

    const lines: string[] = [
        pick(seed, 'opener', openerPool)({ player: d.player.name, opp, statLine, featLabel }),
    ];

    const plan = pick(seed, 'plan', FEAT_PLANS);
    const [flavorA, flavorB] = pickTwoDistinct(seed, 'flavor', 'flavor2', FEAT_FLAVOR);
    for (const slot of plan) {
        if (slot === 'detail' && topStat) {
            lines.push(pick(seed, 'detail', FEAT_DETAILS)({ topLabel: topStat.label, topValue: topStat.value, player: d.player.name }));
        } else if (slot === 'flavor') {
            lines.push(flavorA({ player: d.player.name }));
        } else if (slot === 'flavor2') {
            lines.push(flavorB({ player: d.player.name }));
        }
    }

    const outcome = gameOutcomeParagraph(d.teamSlug, d.game);
    if (outcome) lines.push(outcome);
    return lines;
}

// ── player_streak ────────────────────────────────────────────────────────

interface StreakVars { player: string; opp: string; count: number; label: string }

const STREAK_OPENERS: ((v: StreakVars) => string)[] = [
    v => `${i(v.player)} ${v.opp}전에서도 ${v.count}경기 연속 ${v.label} 행진을 이어갔다.`,
    v => `${eul(v.opp)} 상대로도 어김없었다. ${i(v.player)} ${v.count}경기 연속 ${v.label} 기록을 써냈다.`,
    v => `${v.count}경기 연속 ${v.label} — ${i(v.player)} 쓰고 있는 이야기다.`,
    v => `${i(v.player)} ${v.opp}전에서도 리듬이 흔들리지 않았다. ${eul(v.label)} 벌써 ${v.count}경기째 이어가고 있다.`,
];

const STREAK_FLAVOR_LONG: ((v: { player: string }) => string)[] = [
    v => `${v.player}의 이런 꾸준함은 리그에서도 손꼽힐 정도다.`,
    () => `상대 팀 입장에선 벌써부터 대비책을 고민해야 할 흐름이다.`,
    v => `${v.player}를 막을 뾰족한 해법은 아직 나오지 않고 있다.`,
];
const STREAK_FLAVOR_SHORT: ((v: { player: string }) => string)[] = [
    v => `${v.player}가 물오른 감각을 이어가고 있다.`,
    () => `이 흐름이 얼마나 더 이어질지 지켜볼 대목이다.`,
    v => `${v.player}의 상승세가 심상치 않다.`,
];

// [2026-09-01] "같은 경기에서 한 선수의 스트릭이 여러 번 중첩되면 뉴스가 여러 개 생성되는"
// 문제 — server/src/shared/leagueEvents.ts가 이제 그 경기에서 자격을 얻은 모든 규칙을
// 이벤트 하나(payload.streaks 배열)로 합쳐 보낸다(가장 인상적인 순, count 내림차순 정렬).
// 여기서는 그 배열의 첫 항목(가장 긴 연속 기록)으로 오프닝 문장을 쓰고, 두 번째 이후
// 항목이 있으면("20+득점 연속"과 "10+리바운드 연속"이 같은 날 함께 갱신되는 경우 등)
// 별도 문단으로 나머지를 나열해 하나의 기사 안에 전부 담는다.
function buildPlayerStreakBlurb(d: Extract<LeagueEvent['detail'], { kind: 'player_streak' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const opp = teamName(d.opponentSlug, teamBySlug);
    const [primary, ...rest] = d.streaks;
    const lines: string[] = [
        pick(seed, 'opener', STREAK_OPENERS)({ player: d.player.name, opp, count: primary.count, label: primary.label }),
    ];
    if (rest.length > 0) {
        const restLine = rest.map(s => `${s.count}경기 연속 ${s.label}`).join(', ');
        lines.push(`동시에 ${restLine}까지 함께 이어가고 있어 더욱 눈길을 끈다.`);
    }
    const flavorPool = primary.count >= 10 ? STREAK_FLAVOR_LONG : STREAK_FLAVOR_SHORT;
    lines.push(pick(seed, 'flavor', flavorPool)({ player: d.player.name }));
    const outcome = gameOutcomeParagraph(d.teamSlug, d.game);
    if (outcome) lines.push(outcome);
    return lines;
}

// ── game_result ──────────────────────────────────────────────────────────

const RESULT_CLOSERS: ((v: { winner: string }) => string)[] = [
    () => `이번 승리로 팀 분위기가 한층 고조된 모습이다.`,
    v => `${v.winner}의 벤치는 경기 종료와 함께 모처럼 활짝 웃었다.`,
    () => `다음 경기에 대한 기대감도 자연스레 커지고 있다.`,
];

function buildGameResultBlurb(d: Extract<LeagueEvent['detail'], { kind: 'game_result' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const homeWon = d.homeScore > d.awayScore;
    const winnerName = teamName(homeWon ? d.homeSlug : d.awaySlug, teamBySlug);
    const loserName = teamName(homeWon ? d.awaySlug : d.homeSlug, teamBySlug);
    const winnerScore = Math.max(d.homeScore, d.awayScore);
    const loserScore = Math.min(d.homeScore, d.awayScore);
    const winnerMvp = homeWon ? d.mvpHome : d.mvpAway;

    const lines: string[] = [
        `${i(winnerName)} ${eul(loserName)} ${winnerScore}-${loserScore}로 꺾었다.`,
    ];

    if (d.buzzerBeater) {
        const shooter = d.buzzerBeater.name || '무명의 선수';
        lines.push(`종료 ${d.buzzerBeater.secondsLeft}초를 남기고 터진 ${shooter}의 버저비터가 승부를 갈랐다.`);
    } else if (d.closeGame) {
        lines.push('마지막까지 손에 땀을 쥐게 하는 접전이었다.');
    }

    // [2026-09-01] "기사 본문에 최우수선수 언급이 필요하다"는 요청 — 기존엔 대표 스탯이
    // 있을 때만(threshold 이상) 조용히 붙였는데, winnerMvp가 있으면 스탯 유무와 무관하게
    // 항상 "최우수선수"라는 표현으로 명시한다.
    if (winnerMvp) {
        const statLine = winnerMvp.stats.map(s => `${s.value} ${s.label}`).join(', ');
        lines.push(
            statLine
                ? `이날의 최우수선수는 ${winnerMvp.name}, ${statLine}로 팀의 승리를 이끌었다.`
                : `이날의 최우수선수는 ${winnerMvp.name}였다.`,
        );
    }

    lines.push(pick(seed, 'closer', RESULT_CLOSERS)({ winner: winnerName }));
    return lines;
}

// ── win_streak / trade (컴팩트 카드용 — 짧게 유지) ───────────────────────────

const WIN_STREAK_OPENERS_LONG: ((v: { team: string; streak: number }) => string)[] = [
    v => `${i(v.team)} ${v.streak}연승 행진으로 리그를 대표하는 상승세를 그리고 있다.`,
    v => `거칠 것이 없다. ${i(v.team)} 어느덧 ${v.streak}연승째다.`,
];
const WIN_STREAK_OPENERS_SHORT: ((v: { team: string; streak: number }) => string)[] = [
    v => `${i(v.team)} ${v.streak}연승을 질주하고 있다.`,
    v => `${eun(v.team)} 최근 ${v.streak}연승으로 상승세를 타는 중이다.`,
];

const WIN_STREAK_FLAVOR: ((v: { team: string }) => string)[] = [
    () => `이 흐름이 계속된다면 리그 판도에도 적지 않은 영향을 줄 전망이다.`,
    v => `상대 팀들은 벌써부터 ${v.team}과의 맞대결을 부담스러워하는 분위기다.`,
    () => `벤치 분위기도 한껏 달아올랐다.`,
];

// [2026-09-01] "팀 연승" 레터 디자인 요청 — 본문을 개인 활약처럼 여러 문단으로 확장.
// 오프닝(기존) → 플레이버 → (있으면) 가장 최근 경기 MVP 언급, 최대 3문단. 상세 경기
// 목록 자체는 newsFeedCards.tsx의 WinStreakCard가 d.games를 직접 순회해 리스트로
// 렌더링하므로, 여기 본문에서는 과하게 나열하지 않고 가장 최근 1건만 짧게 짚는다.
function buildWinStreakBlurb(d: Extract<LeagueEvent['detail'], { kind: 'win_streak' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const team = teamName(d.teamSlug, teamBySlug);
    const pool = d.streak >= 8 ? WIN_STREAK_OPENERS_LONG : WIN_STREAK_OPENERS_SHORT;
    const lines: string[] = [pick(seed, 'opener', pool)({ team, streak: d.streak })];
    lines.push(pick(seed, 'flavor', WIN_STREAK_FLAVOR)({ team }));
    const latestMvp = d.games[0]?.mvp;
    if (latestMvp && latestMvp.stats.length > 0) {
        const statLine = latestMvp.stats.map(s => `${s.value} ${s.label}`).join(', ');
        lines.push(`가장 최근 경기에서는 ${i(latestMvp.name)} ${statLine}로 힘을 보탰다.`);
    }
    return lines;
}

const TRADE_OPENERS: ((v: { a: string; b: string }) => string)[] = [
    v => `${gwa(v.a)} ${i(v.b)} 트레이드를 단행했다.`,
    v => `${eun(v.a)} ${eul(v.b)} 상대로 전격 트레이드에 합의했다.`,
];
const TRADE_FLAVOR: (() => string)[] = [
    () => `양 팀 모두 로스터 밸런스를 다시 짜게 됐다.`,
    () => `이번 딜이 시즌 후반 판도에 어떤 영향을 미칠지 주목된다.`,
];

function buildTradeBlurb(d: Extract<LeagueEvent['detail'], { kind: 'trade' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const a = teamName(d.teamA.slug, teamBySlug);
    const b = teamName(d.teamB.slug, teamBySlug);
    // aOut: A가 내준(=B가 받는) 선수, bOut: B가 내준(=A가 받는) 선수.
    const aGets = d.bOut.map(p => p.name).join(', ') || '선수';
    const bGets = d.aOut.map(p => p.name).join(', ') || '선수';
    return [
        pick(seed, 'opener', TRADE_OPENERS)({ a, b }),
        `${eun(a)} ${eul(aGets)}, ${eun(b)} ${eul(bGets)} 새로 유니폼을 입힌다.`,
        pick(seed, 'flavor', TRADE_FLAVOR)(),
    ];
}

// ── power_ranking ────────────────────────────────────────────────────────
// [2026-09-02] "본문이 한 줄뿐이라 너무 짧다, 실제 뉴스기사처럼 3~4줄로" 요청 — 오프닝(1위
// 팀+점수) → 1위 팀의 공수 성향(offenseScore/defenseScore 격차로 판정) → 전월 대비
// 상승/하락 팀(없으면 "첫 발표" 플레이버로 대체), 총 3문단 고정 구조.
// [후속] 클로저 문단("실제 성적이 쌓이기 시작하면...")은 불필요하다는 요청으로 삭제.

const POWER_RANKING_OPENERS: ((v: { topTeam: string; teamCount: number; topPower: number }) => string)[] = [
    v => `로스터 능력치와 조합을 기준으로 집계한 이번 달 파워랭킹에서 ${i(v.topTeam)} ${v.teamCount}개 팀 중 1위(${v.topPower}점)에 올랐다.`,
    v => `이번 달 파워랭킹 1위는 ${v.topTeam}이 차지했다. ${v.topPower}점으로 리그 전체 ${v.teamCount}개 팀 중 가장 높은 평가를 받았다.`,
    v => `${eun(v.topTeam)} ${v.topPower}점을 기록하며 이번 달 리그 파워랭킹 정상에 섰다.`,
];

const OFFENSE_LED_LINES: ((v: { team: string }) => string)[] = [
    v => `공격 조합의 완성도가 특히 높게 평가되며 수비보다 득점 쪽에서 강점을 지닌 팀으로 분석됐다.`,
    v => `${i(v.team)} 다양한 공격 옵션을 앞세워 수비보다 득점 조합에서 더 높은 점수를 받았다.`,
];
const DEFENSE_LED_LINES: ((v: { team: string }) => string)[] = [
    v => `탄탄한 수비 조합이 강점으로 꼽히며 공격보다 수비 쪽 평가가 두드러졌다.`,
    v => `${i(v.team)} 수비 조합에서 리그 최상위권 평가를 받아 이번 순위의 발판을 마련했다.`,
];
const BALANCED_LINES: ((v: { team: string }) => string)[] = [
    v => `공격과 수비 양쪽 모두 고르게 높은 점수를 받으며 뚜렷한 약점이 없는 팀으로 평가됐다.`,
    v => `${i(v.team)} 공수 밸런스가 고르게 잡힌 로스터라는 점이 순위에 크게 반영됐다.`,
];

const POWER_RANKING_NO_HISTORY_FLAVOR: (() => string)[] = [
    () => `이번이 이 리그의 첫 파워랭킹 발표라 아직 전월 대비 순위 변동은 집계되지 않았다.`,
    () => `첫 순위표인 만큼 다음 달 발표에서 어느 팀이 순위를 끌어올릴지에 관심이 쏠린다.`,
];

function buildPowerRankingBlurb(d: Extract<LeagueEvent['detail'], { kind: 'power_ranking' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const top = d.full[0];
    if (!top) return [];
    const topTeam = teamName(top.teamSlug, teamBySlug);
    const lines: string[] = [
        pick(seed, 'opener', POWER_RANKING_OPENERS)({ topTeam, teamCount: d.full.length, topPower: top.powerScore }),
    ];

    if (top.offenseScore != null && top.defenseScore != null) {
        const diff = top.offenseScore - top.defenseScore;
        const pool = diff >= 15 ? OFFENSE_LED_LINES : diff <= -15 ? DEFENSE_LED_LINES : BALANCED_LINES;
        lines.push(pick(seed, 'character', pool)({ team: topTeam }));
    }

    if (d.riser && d.faller) {
        const riserTeam = teamName(d.riser.teamSlug, teamBySlug);
        const fallerTeam = teamName(d.faller.teamSlug, teamBySlug);
        lines.push(`${riserTeam}은(는) 지난달 ${d.riser.fromRank}위에서 이번 달 ${d.riser.rank}위로 가장 크게 순위가 뛰어올랐고, ${fallerTeam}은(는) 반대로 ${d.faller.fromRank}위에서 ${d.faller.rank}위로 가장 크게 순위가 내려앉았다.`);
    } else if (d.riser) {
        const riserTeam = teamName(d.riser.teamSlug, teamBySlug);
        lines.push(`${riserTeam}은(는) 지난달 ${d.riser.fromRank}위에서 이번 달 ${d.riser.rank}위로, 이번 달 가장 큰 상승세를 보인 팀으로 이름을 올렸다.`);
    } else if (d.faller) {
        const fallerTeam = teamName(d.faller.teamSlug, teamBySlug);
        lines.push(`${fallerTeam}은(는) 지난달 ${d.faller.fromRank}위에서 이번 달 ${d.faller.rank}위로, 이번 달 가장 크게 순위가 내려앉은 팀이 됐다.`);
    } else {
        lines.push(pick(seed, 'no-history', POWER_RANKING_NO_HISTORY_FLAVOR)());
    }

    return lines;
}

// ── injury(부상 뉴스, GRADE3+) ───────────────────────────────────────────────
// [2026-09-03] "부상 발생 시 뉴스, 본문 2~3줄" 요청 — 등급 수치("Grade3" 등)는 본문에서
// 직접 언급하지 않는다(부상 등급 표는 InjuryCard 하단 테이블이 별도로 보여줌). 대신
// Grade5(전방십자인대 파열 등 장기 이탈)만 더 무거운 톤의 플레이버로 갈라 톤을 살짝
// 차별화했다.

interface InjuryVars { player: string; team: string; injuryType: string }

const INJURY_OPENERS: ((v: InjuryVars) => string)[] = [
    v => `${eun(v.team)} ${i(v.player)} ${v.injuryType}(으)로 이탈했다고 공식 발표했다.`,
    v => `${i(v.player)} ${v.injuryType} 진단을 받고 코트를 떠나게 됐다.`,
    v => `${v.team}에 뼈아픈 소식이 전해졌다. ${i(v.player)} ${v.injuryType}(으)로 결장이 불가피해졌다.`,
    v => `${i(v.player)} ${v.injuryType} 판정을 받아 당분간 팀을 떠나 재활에 전념하게 됐다.`,
];

const INJURY_SEVERE_FLAVOR: (() => string)[] = [
    () => `장기 결장이 예상되는 만큼 팀 전력 구상에도 적지 않은 차질이 불가피할 전망이다.`,
    () => `구단 의료진은 서두르지 않고 신중하게 재활 일정을 잡겠다는 입장이다.`,
    () => `공백을 메울 로테이션 재편이 당장의 과제로 떠올랐다.`,
];
const INJURY_MODERATE_FLAVOR: (() => string)[] = [
    () => `다행히 시즌 전체를 흔들 정도는 아니라는 평가다.`,
    () => `팀은 우선 로테이션을 조정하며 공백을 메울 방침이다.`,
    () => `회복 경과가 좋으면 복귀 시점이 앞당겨질 수도 있다.`,
];

// [2026-09-03] "제목도 바리에이션" 요청 — 다른 타입들의 제목 풀은 전부 `player.name + 접미사`
// 형태로 이어붙이는 구조지만(HeadlineTitle이 headline.startsWith(playerName)으로 이름
// 부분만 잘라 클릭 가능하게 만드는 방식과 맞물림), 부상 뉴스는 사용자가 준 예시("햄스트링
// 염좌으로 신음하는 이정후"처럼 부상명이 앞에 오는 문구)를 살리기 위해 완성된 문자열
// 전체를 반환하는 방식으로 둔다 — 이름으로 시작하지 않는 변형은 HeadlineTitle의 폴백
// 분기(전체 문자열을 이름처럼 스타일링)로 자연스럽게 처리된다. 기간("2개월 결장 예상")은
// 제목에서 제외 — 그 정보는 본문 2번째 줄(buildInjuryBlurb)과 카드 하단 테이블에 이미
// 있어 제목에서까지 반복할 필요가 없다는 사용자 지적.
const INJURY_TITLES: ((v: { player: string; injuryType: string }) => string)[] = [
    v => `${v.player}, ${v.injuryType} 진단`,
    v => `${euro(v.injuryType)} 신음하는 ${v.player}`,
    v => `${v.player}, ${euro(v.injuryType)} 전열 이탈`,
    v => `${v.injuryType} 판정 받은 ${v.player}`,
    v => `${v.player}에게 찾아온 ${v.injuryType}`,
    v => `${v.player}, 끝내 ${euro(v.injuryType)} 코트를 떠나다`,
];

function formatShortDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${y.slice(2)}/${m}/${d}`;
}

function buildInjuryBlurb(d: Extract<LeagueEvent['detail'], { kind: 'injury' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const team = teamName(d.teamSlug, teamBySlug);
    const returnLine = d.returnDate
        ? `예상 결장 기간은 ${d.duration}, 복귀 목표는 ${formatShortDate(d.returnDate)} 전후로 알려졌다.`
        : `예상 결장 기간은 ${d.duration}으로 알려졌다.`;
    const lines: string[] = [
        pick(seed, 'opener', INJURY_OPENERS)({ player: d.player.name, team, injuryType: d.injuryType }),
        returnLine,
    ];
    const flavorPool = d.severity === 'Grade5' ? INJURY_SEVERE_FLAVOR : INJURY_MODERATE_FLAVOR;
    lines.push(pick(seed, 'flavor', flavorPool)());
    return lines;
}

// ── suspension(출장정지 뉴스, 싸움 — 항상 양쪽 모두) ─────────────────────────
// [2026-09-03] "본문을 좀 풍부하게" 요청 — injury(3줄)보다 한 줄 더 많은 4줄 고정 구조:
// 오프닝(배리에이션) → 양측 징계 사실(고정) → 양 팀 로테이션 영향(고정) → 플레이버
// (배리에이션). 사건 자체가 리그에 몇 안 되는 진귀한 뉴스라 사실관계(누가 몇 경기)를
// 흐리지 않도록 2·3번째 줄은 배리에이션 없이 고정 문장으로 둔다.

interface SuspensionVars {
    fighter: string; fighterTeam: string; opponent: string; opponentTeam: string;
    quarterLabel: string; timeRemaining: string;
}

function periodLabel(quarter: number): string {
    return quarter <= 4 ? `${quarter}쿼터` : `연장 ${quarter - 4}차`;
}

const SUSPENSION_OPENERS: ((v: SuspensionVars) => string)[] = [
    v => `${v.quarterLabel} ${v.timeRemaining}을 남기고 코트 위에서 험악한 장면이 나왔다. ${v.fighterTeam}의 ${v.fighter}와(과) ${v.opponentTeam}의 ${v.opponent}가 몸싸움을 벌이며 두 선수 모두 퇴장당했다.`,
    v => `${v.fighterTeam}과(와) ${v.opponentTeam}의 경기, ${v.quarterLabel} ${v.timeRemaining}에 순식간에 몸싸움이 벌어졌다. ${v.fighter}와(과) ${v.opponent}가 뒤엉키며 벤치와 심판진이 곧바로 뛰어나왔다.`,
    v => `평온하던 코트가 한순간에 아수라장이 됐다. ${v.quarterLabel} ${v.timeRemaining}, ${v.fighter}와(과) ${v.opponent} 사이에서 시작된 몸싸움이 양 팀 벤치까지 번질 뻔했다.`,
    v => `${v.fighter}(${v.fighterTeam})와(과) ${v.opponent}(${v.opponentTeam})가 ${v.quarterLabel} ${v.timeRemaining}을 남기고 정면으로 충돌했다. 심판진은 곧바로 양 선수 모두에게 퇴장을 선언했다.`,
];

const SUSPENSION_FLAVOR: (() => string)[] = [
    () => `양 팀 코칭스태프는 재발 방지를 약속하며 사태 수습에 나섰다.`,
    () => `리그 안팎에서는 이례적인 몸싸움 장면에 놀라움을 감추지 못하는 분위기다.`,
    () => `두 선수 모두 냉각기를 거친 뒤 코트로 복귀할 전망이다.`,
    () => `이번 사건은 한동안 두고두고 회자될 것으로 보인다.`,
];

function buildSuspensionBlurb(d: Extract<LeagueEvent['detail'], { kind: 'suspension' }>, seed: string, teamBySlug: Map<string, LeagueTeamRow>): string[] {
    const fighterTeam = teamName(d.fighterTeamSlug, teamBySlug);
    const opponentTeam = teamName(d.opponentTeamSlug, teamBySlug);
    const vars: SuspensionVars = {
        fighter: d.fighter.name, fighterTeam, opponent: d.opponent.name, opponentTeam,
        quarterLabel: periodLabel(d.quarter), timeRemaining: d.timeRemaining,
    };
    return [
        pick(seed, 'opener', SUSPENSION_OPENERS)(vars),
        `리그 사무국은 ${d.fighter.name}에게 ${d.fighterSuspensionGames}경기, ${d.opponent.name}에게 ${d.opponentSuspensionGames}경기의 출장정지 징계를 내렸다.`,
        `이번 징계로 ${fighterTeam}과(와) ${opponentTeam} 모두 당장 로테이션에 공백이 생기게 됐다.`,
        pick(seed, 'flavor', SUSPENSION_FLAVOR)(),
    ];
}

// [2026-09-03] injury와 동일한 이유로(HeadlineTitle이 클릭 대상으로 삼을 "이름" 단수가
// 없고 — 이번엔 이름이 둘이라 더더욱 — player.name + 접미사 방식이 안 맞음) 완성된
// 문자열 전체를 반환. HeadlineTitle은 headline이 어느 쪽 이름으로도 시작하지 않으면
// 전체를 이름처럼 스타일링하는 폴백 분기를 타는데, InjuryCard와 달리 SuspensionCard는
// 애초에 HeadlineTitle을 쓰지 않고 평문 h1을 쓴다(선수가 둘이라 "이름 하나만 클릭
// 가능"한 컴포넌트를 억지로 맞추는 것보다 표 안의 PlayerHoverCard로 각자 클릭하게 하는
// 편이 자연스럽다는 판단).
const SUSPENSION_TITLES: ((v: { fighter: string; opponent: string }) => string)[] = [
    v => `${v.fighter}-${v.opponent}, 코트 위 충돌 끝에 나란히 퇴장`,
    v => `${v.fighter}와(과) ${v.opponent}, 몸싸움 끝에 동반 출장정지`,
    v => `충돌로 얼어붙은 코트, ${v.fighter}-${v.opponent} 퇴장`,
    v => `${v.fighter}, ${v.opponent}와(과)의 몸싸움으로 강제 퇴장`,
    v => `심판진 격노케 한 ${v.fighter}-${v.opponent}의 몸싸움`,
    v => `${v.fighter}-${v.opponent}, 순간의 분노가 부른 동반 징계`,
];

// LeagueEventDetail의 kind별로 문단 배열을 조합. legacy/파싱 실패 시 null(카드가 기존
// 헤드라인만 표시). 반환값은 문단(문장 그룹) 배열 — 호출부가 각각 별도 줄로 렌더링해
// "한 줄"이 아니라 여러 줄짜리 기사처럼 보이게 한다.
export function buildNewsBlurb(event: LeagueEvent, teamBySlug: Map<string, LeagueTeamRow>): string[] | null {
    const d = event.detail;
    const seed = event.id;

    switch (d.kind) {
        case 'game_result': return buildGameResultBlurb(d, seed, teamBySlug);
        case 'player_feat': return buildPlayerFeatBlurb(d, seed, teamBySlug);
        case 'player_streak': return buildPlayerStreakBlurb(d, seed, teamBySlug);
        case 'win_streak': return buildWinStreakBlurb(d, seed, teamBySlug);
        case 'trade': return buildTradeBlurb(d, seed, teamBySlug);
        case 'power_ranking': return buildPowerRankingBlurb(d, seed, teamBySlug);
        case 'injury': return buildInjuryBlurb(d, seed, teamBySlug);
        case 'suspension': return buildSuspensionBlurb(d, seed, teamBySlug);
        default: return null;
    }
}

// ── 기사 제목(H1) 바리에이션 ─────────────────────────────────────────────────
// [2026-09-01] "기사 제목도 바리에이션을 만들고 싶다, 항목당 10~15개" 요청 — DB에 저장된
// league_events.payload.headline(서버가 이벤트 생성 시점에 딱 1번만 만들어 영구 저장하는
// 문자열, 좌측 리스트 행 등에 계속 쓰임)은 그대로 두고, 상세뷰 카드의 큰 제목(H1)에만
// 쓰이는 별도 varied 제목을 클라이언트에서 만든다. 본문(buildNewsBlurb)과 동일한 원리로
// event.id 기반 결정론적 pick(slot: 'title')이라 같은 이벤트는 항상 같은 제목(새로고침해도
// 안 바뀜). 모든 풀이 "이름"(선수명/팀명)으로 시작하도록 직접 이어붙이는 방식이라(문자열
// 앞부분을 추측해서 자르는 게 아니라 애초에 `이름 + rest`로 조립) 카드가 이름 부분만 골라
// 클릭 가능하게 만드는 기존 로직(HeadlineTitle 등)과 그대로 맞물린다. 카드형 UI를 유지 중인
// trade(TradeCard)는 아직 이 "레터 H1" 자체가 없어 이번 범위에서 제외 — 필요해지면 TradeCard도
// 레터로 재설계한 뒤에 추가.

const TRIPLE_DOUBLE_TITLES: ((v: { opp: string; statLine: string }) => string)[] = [
    v => `, ${v.statLine}으로 완벽한 트리플더블`,
    v => `, ${v.opp}전 트리플더블 작성`,
    () => `, 스탯시트를 지배한 트리플더블`,
    v => `, ${v.statLine} 트리플더블로 승리 견인`,
    () => `, 커리어에 남을 트리플더블 추가`,
    v => `, ${eul(v.opp)} 무너뜨린 만능 활약`,
    () => `, 코트 전역을 지배하다`,
    () => `, 화려한 트리플더블 쇼 연출`,
    () => `, 완성형 스탯라인 완성`,
    v => `, ${v.opp}전 값진 트리플더블`,
    () => `, 트리플더블로 존재감 과시`,
    v => `, ${v.statLine}의 만능 활약`,
];

const DOUBLE_DOUBLE_TITLES: ((v: { opp: string; statLine: string }) => string)[] = [
    v => `, ${v.statLine}의 안정적인 더블더블`,
    v => `, ${v.opp}전 더블더블 신고`,
    () => `, 꾸준함이 만든 더블더블`,
    v => `, ${v.statLine}으로 제 몫 완수`,
    () => `, 묵묵히 채운 더블더블`,
    v => `, ${eul(v.opp)} 상대로 알찬 활약`,
    () => `, 더블더블로 팀 승리 뒷받침`,
    () => `, 흔들림 없는 더블더블 행진`,
    v => `, ${v.opp}전에도 어김없는 활약`,
    () => `, 확실한 두 자릿수 활약`,
    () => `, 안정감 돋보인 더블더블`,
    v => `, ${v.statLine}의 알찬 하루`,
];

const STAT_EXPLOSION_TITLES: ((v: { opp: string; statLine: string }) => string)[] = [
    v => `, ${v.statLine}의 대폭발`,
    v => `, ${v.opp}전 스탯 폭발`,
    () => `, 누구도 못 막은 하루`,
    v => `, ${v.statLine}으로 코트 지배`,
    () => `, 커리어 최고의 한 판`,
    v => `, ${eul(v.opp)} 압도한 맹활약`,
    () => `, 폭발적인 활약으로 팀 승리 견인`,
    v => `, ${v.opp}의 수비를 무너뜨린 밤`,
    () => `, 역대급 스탯라인 작성`,
    v => `, ${v.statLine}의 화려한 밤`,
    () => `, 이날만큼은 무적`,
    () => `, 압도적인 원맨쇼`,
];

const FEAT_TITLE_BY_KIND: Record<'triple_double' | 'double_double' | 'stat_explosion', ((v: { opp: string; statLine: string }) => string)[]> = {
    triple_double: TRIPLE_DOUBLE_TITLES,
    double_double: DOUBLE_DOUBLE_TITLES,
    stat_explosion: STAT_EXPLOSION_TITLES,
};

const STREAK_TITLES: ((v: { opp: string; count: number; label: string }) => string)[] = [
    v => `, ${v.count}경기 연속 ${v.label} 행진`,
    () => `, 흔들림 없는 연속 기록`,
    v => `, ${v.opp}전에도 이어진 꾸준함`,
    v => `, ${v.count}경기째 이어지는 상승세`,
    () => `, 리듬을 잃지 않는 활약`,
    () => `, 연속 기록 경신 중`,
    v => `, ${v.label} 행진 계속`,
    () => `, 꺾이지 않는 페이스`,
    v => `, ${v.count}경기 연속의 위엄`,
    () => `, 물오른 감각 지속`,
    () => `, 멈추지 않는 활약`,
    v => `, ${v.opp}전에도 여전한 존재감`,
];

const GAME_RESULT_TITLES: ((v: { loser: string; winnerScore: number; loserScore: number }) => string)[] = [
    v => `, ${v.loser}에게 ${v.winnerScore}-${v.loserScore} 승리`,
    v => `, ${eul(v.loser)} 꺾고 승리 질주`,
    v => `, ${v.winnerScore}-${v.loserScore}로 완승`,
    v => `, ${eul(v.loser)} 제압`,
    () => `, 값진 승리 추가`,
    v => `, ${v.loser}전 승리로 상승세`,
    () => `, 접전 끝에 승리`,
    v => `, ${v.winnerScore}-${v.loserScore} 스코어로 승기 잡아`,
    v => `, ${v.loser} 상대로 완벽한 승리`,
    () => `, 승리로 분위기 반전`,
    v => `, ${v.loser}와의 대결 승리로 마무리`,
    () => `, 승리의 주인공`,
];

const WIN_STREAK_TITLES: ((v: { streak: number }) => string)[] = [
    v => `, ${v.streak}연승 행진`,
    () => `, 거침없는 상승세`,
    v => `, ${v.streak}연승으로 리그 강타`,
    () => `, 멈추지 않는 연승 가도`,
    () => `, 연승 행진 지속`,
    v => `, ${v.streak}연승째 순항`,
    () => `, 리그를 흔드는 상승세`,
    () => `, 연승의 주인공`,
    v => `, ${v.streak}연승 달성`,
    () => `, 파죽지세`,
    () => `, 상승세 이어가`,
    v => `, ${v.streak}연승으로 존재감 과시`,
];

// player_feat/player_streak/game_result/win_streak/injury/suspension만 지원(트레이드는 위
// 주석 참고, 레터 H1 자체가 아직 없어 제외). 그 외 kind(legacy 포함)는 null → 호출부가
// event.headline(DB 저장값)으로 폴백.
export function buildNewsTitle(event: LeagueEvent, teamBySlug: Map<string, LeagueTeamRow>): string | null {
    const d = event.detail;
    const seed = event.id;

    switch (d.kind) {
        case 'player_feat': {
            const opp = teamName(d.opponentSlug, teamBySlug);
            const statLine = d.stats.map(s => `${s.value} ${s.label}`).join(', ');
            const pool = FEAT_TITLE_BY_KIND[d.featKind] ?? DOUBLE_DOUBLE_TITLES;
            return d.player.name + pick(seed, 'title', pool)({ opp, statLine });
        }
        case 'player_streak': {
            const opp = teamName(d.opponentSlug, teamBySlug);
            const primary = d.streaks[0];
            return d.player.name + pick(seed, 'title', STREAK_TITLES)({ opp, count: primary.count, label: primary.label });
        }
        case 'game_result': {
            const homeWon = d.homeScore > d.awayScore;
            const winnerName = teamName(homeWon ? d.homeSlug : d.awaySlug, teamBySlug);
            const loser = teamName(homeWon ? d.awaySlug : d.homeSlug, teamBySlug);
            const winnerScore = Math.max(d.homeScore, d.awayScore);
            const loserScore = Math.min(d.homeScore, d.awayScore);
            return winnerName + pick(seed, 'title', GAME_RESULT_TITLES)({ loser, winnerScore, loserScore });
        }
        case 'win_streak': {
            const team = teamName(d.teamSlug, teamBySlug);
            return team + pick(seed, 'title', WIN_STREAK_TITLES)({ streak: d.streak });
        }
        case 'injury': {
            return pick(seed, 'title', INJURY_TITLES)({ player: d.player.name, injuryType: d.injuryType });
        }
        case 'suspension': {
            return pick(seed, 'title', SUSPENSION_TITLES)({ fighter: d.fighter.name, opponent: d.opponent.name });
        }
        default:
            return null;
    }
}
