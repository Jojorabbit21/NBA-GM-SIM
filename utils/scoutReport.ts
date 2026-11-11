
import { Player } from '../types';
import { generateHiddenTendencies, generateSaveTendencies, stringToHash } from './hiddenTendencies';
import { calculateScreenerPhysique } from '../services/game/engine/pbp/archetypeSystem';

/**
 * [2026-11-10] PF/C 스크린 문구 — 엔진 resolveScreen의 두 입력을 따로 본다:
 * 체격 = calculateScreenerPhysique(근력·키·몸무게, 엔진 가중 0.7) / 위치선정 = offBallMovement(엔진 "타이밍", 가중 0.3).
 * 기준 ≈ 멀티 풀 PF/C 305명 사분위(체격 p25 57.7·p75 70.8 / offBallMovement p25 62·p75 78).
 */
const SCREEN_PHYS_HIGH_MIN = 70;
const SCREEN_PHYS_LOW_BELOW = 58;
const SCREEN_POS_GOOD_MIN = 78;
const SCREEN_POS_POOR_BELOW = 62;

type Tier = 0 | 1 | 2; // 0 = 상/좋음, 1 = 보통, 2 = 하/나쁨
const SCREEN_LINES = {
    elite:      { text: '스크린 능력이 탁월함', sentiment: 'positive' },
    posOnly:    { text: '체격은 평범하나 스크린 위치선정 능력이 좋음', sentiment: 'positive' },
    average:    { text: '평범한 스크린 능력을 보유함', sentiment: 'neutral' },
    physOnly:   { text: '체격은 좋으나 스크린 위치선정이 좋지 않음', sentiment: 'neutral' },
    weakBody:   { text: '스크린 능력은 좋으나 힘이 약해 스크린이 단단하지 않음', sentiment: 'neutral' },
    poor:       { text: '스크린 능력이 좋지 않음', sentiment: 'negative' },
} as const satisfies Record<string, { text: string; sentiment: ScoutReportSentiment }>;
// [체격][위치선정] — 정의된 6칸 외 3칸: 상·보통 → physOnly, 중·나쁨 → average, 하·보통 → poor
const SCREEN_GRID: (keyof typeof SCREEN_LINES)[][] = [
    ['elite',   'physOnly', 'physOnly'],
    ['posOnly', 'average',  'average'],
    ['weakBody', 'poor',    'poor'],
];

// ─────────────────────────────────────────────────────────────
// [2026-11-10] 존 성향 문장 — meta_players.tendencies.zones(ra/itp/mid/cnr/p45/atb).
// 엔진(buildZonePref/buildThreeSubPref)은 여섯 값을 합으로 나눈 "비율"만 쓰므로 원값의 스케일은
// 선수마다 달라도 된다(실제로 855명은 최다 존 = 100이지만 87명은 최다 존이 40~99). 따라서 원값에
// 바로 구간을 그으면 스케일이 다른 선수를 잘못 읽는다(사용자 지적 11-10) → 먼저 선수의 최다 존을
// 100으로 정규화한 뒤 "최다 존 대비 비율"에 구간을 긋는다. 모든 값에 같은 상수를 곱해도 결과 불변.
//   76~100 주 공격 구역 / 51~75 꾸준히 시도 / 26~50 가끔(문장 생략) / 0~25 거의 시도하지 않음
// (최다 존 대비이므로 리그 비교도, 전체 슛 중 비중(%)도 아니다 — 문장에 수치를 넣지 않는 이유)
// 이전 구현은 페인트(2존 합)·미드(1존)·3점(3존 합)의 합을 비교해 한 줄만 냈는데, 존 수가 달라 합
// 비교가 기울었고 정보도 한 줄뿐이었다. 지금은 최대 3줄(주 무대 / 보조 구역 / 기피 구역).
// 수치는 공개하지 않고, 조사 문제를 피하려 구역 이름 뒤엔 항상 '에서(도/는)'만 붙인다.
// ─────────────────────────────────────────────────────────────
const ZONE_HIGH_MIN = 76;   // 주 공격 구역
const ZONE_MID_MIN = 51;    // 보조 구역
const ZONE_RARE_MAX = 25;   // 거의 시도하지 않는 구역
type ZoneKey = 'ra' | 'itp' | 'mid' | 'cnr' | 'p45' | 'atb';
const ZONE_ORDER: ZoneKey[] = ['ra', 'itp', 'mid', 'cnr', 'p45', 'atb'];
const ZONE_LABEL: Record<ZoneKey, string> = {
    ra: '골밑', itp: '페인트존 중거리', mid: '미드레인지', cnr: '코너 3점', p45: '윙 3점', atb: '탑 3점',
};
const THREE_KEYS: ZoneKey[] = ['cnr', 'p45', 'atb'];
const INSIDE_KEYS: ZoneKey[] = ['ra', 'itp'];

/** 같은 묶음(3점 셋 / 페인트 둘)이 전부 포함되면 묶음 이름으로 접어 나열 */
function joinZoneLabels(keys: ZoneKey[]): string {
    const set = new Set(keys);
    const parts: string[] = [];
    const allThree = THREE_KEYS.every(k => set.has(k));
    const allInside = INSIDE_KEYS.every(k => set.has(k));
    for (const k of ZONE_ORDER) {
        if (!set.has(k)) continue;
        if (allInside && INSIDE_KEYS.includes(k)) { if (k === 'ra') parts.push('페인트존 안'); continue; }
        if (allThree && THREE_KEYS.includes(k)) { if (k === 'cnr') parts.push('3점 라인 바깥'); continue; }
        parts.push(ZONE_LABEL[k]);
    }
    return parts.join('·');
}

export function describeZoneTendencies(z: Record<ZoneKey, number>): string[] {
    const rawMax = Math.max(0, ...ZONE_ORDER.map(k => z[k] ?? 0));
    if (rawMax <= 0) return [];
    // 최다 존 = 100으로 정규화 (스케일 불변)
    const v = (k: ZoneKey) => ((z[k] ?? 0) / rawMax) * 100;
    const high = ZONE_ORDER.filter(k => v(k) >= ZONE_HIGH_MIN);
    const mid = ZONE_ORDER.filter(k => v(k) >= ZONE_MID_MIN && v(k) < ZONE_HIGH_MIN);
    const rare = ZONE_ORDER.filter(k => v(k) <= ZONE_RARE_MAX);
    const threeHigh = THREE_KEYS.filter(k => v(k) >= ZONE_HIGH_MIN);
    const othersAtMost = (keys: ZoneKey[], max: number) => ZONE_ORDER.filter(k => !keys.includes(k)).every(k => v(k) <= max);

    const lines: string[] = [];
    let rareCovered = false; // 주 무대 문장이 이미 "그 외 거의 안 던짐"을 함의하면 기피 문장 생략

    // ── 1. 주 공격 구역 (정규화로 최다 존이 항상 100이라 high는 비지 않음) ──
    if (high.length >= 4) {
        lines.push('코트 전역에서 고르게 공격 기회를 가져감');
    } else if (high.length === 1 && high[0] === 'ra' && othersAtMost(['ra'], 50)) {
        lines.push('거의 모든 공격을 골밑 마무리로 해결함');
        rareCovered = true;
    } else if (threeHigh.length === 3 && othersAtMost(THREE_KEYS, 50)) {
        lines.push('3점 라인 바깥에서 대부분의 슛을 던지는 전문 슈터 성향');
        rareCovered = true;
    } else if (high.includes('cnr') && v('p45') <= 50 && v('atb') <= 50) {
        const inside = high.filter(k => k !== 'cnr');
        lines.push(inside.length > 0
            ? `${joinZoneLabels(inside)}에서 공격하고, 바깥에서는 코너에 자리 잡고 캐치앤슛 3점을 노림`
            : '코너에 자리 잡고 캐치앤슛 3점을 노리는 성향');
    } else if (high.includes('mid') && THREE_KEYS.every(k => v(k) <= 50)) {
        const rest = high.filter(k => k !== 'mid');
        lines.push(rest.length > 0
            ? `주로 ${joinZoneLabels(rest)}·미드레인지에서 공격하며 3점보다 미드레인지 점퍼를 선호함`
            : '3점보다 미드레인지 점퍼를 선호함');
    } else {
        lines.push(`주로 ${joinZoneLabels(high)}에서 공격을 전개함`);
    }

    // ── 2. 보조 구역 (주 무대로 이미 말한 존은 제외) ──
    const secondary = mid.filter(k => !high.includes(k));
    if (secondary.length > 0 && high.length < 4) lines.push(`${joinZoneLabels(secondary)}에서도 꾸준히 슛을 시도함`);

    // ── 3. 기피 구역 — 4곳 이상이면 나열 대신 한 줄로(26~50 구역이 섞여 있을 수 있어 "드묾"으로 완곡하게) ──
    if (!rareCovered && rare.length > 0) {
        if (rare.length >= 4) {
            // 기피 존이 전부 10 이하(예: 올타임 빅맨 0/0/0/0)면 단정적으로, 아니면 완곡하게
            lines.push(rare.every(k => v(k) <= 10) ? '주 공격 구역 외에는 거의 슛을 던지지 않음' : '주 공격 구역 외에는 슛 시도가 드묾');
        }
        else lines.push(`${joinZoneLabels(rare)}에서는 거의 슛을 던지지 않음`);
    }

    return lines;
}

export type ScoutReportSentiment = 'positive' | 'negative' | 'neutral';

export interface ScoutReportSentence {
    text: string;
    sentiment: ScoutReportSentiment;
}

/**
 * 히든 텐던시를 서술형 스카우트 리포트 문장들로 변환.
 * 수치를 공개하지 않고, 실제 스카우터가 쓴 메모 느낌의 한국어 서술문을 생성.
 * 각 문장에 긍정/부정/중립 태그를 붙여 UI에서 장점(초록)/단점(빨강)/특징(기본색)으로
 * 나눠 보여줄 수 있게 한다.
 * 결정론적: 같은 선수 + 같은 시드 → 항상 동일한 리포트.
 */
export function generateScoutReport(player: Player, tendencySeed?: string): ScoutReportSentence[] {
    const sentences: ScoutReportSentence[] = [];
    const push = (text: string, sentiment: ScoutReportSentiment) => sentences.push({ text, sentiment });

    // ── Save Tendencies (시드 필요) ──
    if (tendencySeed) {
        const st = generateSaveTendencies(tendencySeed, player.id);

        // 1. 성격 (temperament + ego) — 캐릭터 묘사, 우열 판단 불가 → 중립
        const hot = st.temperament >= 0.4;
        const cold = st.temperament <= -0.4;
        const proud = st.ego >= 0.4;
        const humble = st.ego <= -0.4;

        if (hot && proud) push('다혈질이고 공 소유욕이 강함', 'neutral');
        else if (hot && humble) push('다혈질이나 팀을 우선으로 생각함', 'neutral');
        else if (cold && proud) push('침착하지만 공에 대한 소유욕이 강함', 'neutral');
        else if (cold && humble) push('쉽게 시비가 붙지 않으며 팀을 먼저 생각함', 'neutral');
        else if (cold) push('침착한 플레이로 파울을 하지 않으려 노력함', 'neutral');
        else if (hot) push('다혈질 기질이 있어 감정적일 때가 있으며 시비에 쉽게 휘말림', 'neutral');
        else if (proud) push('경기 내에서 자신이 최대한 해결하려고 노력함', 'neutral');
        else if (humble) push('경기 내에서 최대한 팀원들의 기회를 살려주려고 노력함', 'neutral');

        // 2. 멘탈 (clutchGene + composure + confidenceSensitivity) — 경기력 직결 → 장/단점
        const clutchHigh = st.clutchGene >= 0.4;
        const clutchLow = st.clutchGene <= -0.4;
        const compHigh = st.composure >= 0.4;
        const compLow = st.composure <= -0.4;

        if (clutchHigh && compHigh) push('클러치 상황에서 뛰어난 모습을 보이며 잘 실수하지 않음', 'positive');
        else if (clutchHigh) push('클러치 상황에서 평소보다 더 좋은 퍼포먼스를 보임', 'positive');
        else if (clutchLow && compLow) push('승부처에서 위축되는 경향이 있으며 실수가 잦음', 'negative');
        else if (clutchLow) push('경기 막판 압박 속에서 평소 실력을 발휘하지 못함', 'negative');
        else if (compLow) push('압박감을 느끼면 실수가 잦아지는 경향이 있음', 'negative');
        else if (compHigh) push('압박 속에서도 침착하게 플레이하는 경향이 있음', 'positive');

        if (st.confidenceSensitivity >= 1.4) push('컨디션에 따라 경기력 변동 폭이 큰 편', 'negative');
        else if (st.confidenceSensitivity <= 0.6) push('컨디션이나 자신감에 크게 흔들리지 않음', 'positive');

        // 3. 경기력 (consistency + focusDrift + motorIntensity)
        const consHigh = st.consistency >= 0.8;
        const consLow = st.consistency <= 0.3;
        const focusLow = st.focusDrift <= 0.3;
        const focusHigh = st.focusDrift >= 0.7;

        if (consHigh && focusLow) push('피로한 상황에서도 집중력을 유지함', 'positive');
        else if (consHigh) push('경기력의 기복이 적고 꾸준한 퍼포먼스를 보임', 'positive');
        else if (consLow) push('경기력 편차가 심한 경향이 있음', 'negative');

        if (!consHigh && !consLow && focusHigh) push('경기 후반 피로가 쌓이면 집중력이 흐려짐', 'negative');

        if (st.motorIntensity >= 1.3) push('리바운드에 적극적임', 'positive');
        else if (st.motorIntensity <= 0.7) push('리바운드 상황에서 소극적인 모습을 보임', 'negative');

        // 4. 플레이스타일 (playStyle + shotDiscipline + ballDominance + defensiveMotor + foulProneness)
        // playStyle/ballDominance는 취향 문제라 중립, 나머지는 장/단점으로 분류.
        if (st.playStyle >= 0.5) push('패스보다는 직접 슛하는 것을 선호함', 'neutral');
        else if (st.playStyle <= -0.5) push('슛보다는 동료에게 패스하는 것을 선호함', 'neutral');

        if (st.shotDiscipline >= 0.5) push('무리한 슛을 잘 던지지 않으려 노력함', 'positive');
        else if (st.shotDiscipline <= -0.5) push('다소 무리하더라도 많은 슛을 던지는 경향이 있음', 'negative');

        if (st.ballDominance >= 1.3) push('볼을 자주 잡으려는 성향이 강함', 'neutral');
        else if (st.ballDominance <= 0.7) push('볼 터치를 적극적으로 요구하지 않음', 'neutral');

        if (st.defensiveMotor >= 0.5) push('적극적으로 수비에 가담함', 'positive');
        else if (st.defensiveMotor <= -0.5) push('수비에 많은 에너지를 쏟아붓지 않음', 'negative');

        if (st.foulProneness >= 0.5) push('파울하는 것에 대해 개의치 않는 경향이 있음', 'negative');
        else if (st.foulProneness <= -0.5) push('최대한 파울을 적게 하려고 노력함', 'positive');
    }

    // ── 스크린 (PF/C만) — 능력치 기반이라 시드 없이도 가능 ──
    const isBig = (player.position ?? '').split(/[\/-]/).some(pos => pos.trim() === 'PF' || pos.trim() === 'C');
    if (isBig) {
        const phys = calculateScreenerPhysique({ strength: player.strength, height: player.height, weight: player.weight });
        const pos = player.offBallMovement ?? 70;
        if (Number.isFinite(phys) && Number.isFinite(pos)) {
            const physTier: Tier = phys >= SCREEN_PHYS_HIGH_MIN ? 0 : phys < SCREEN_PHYS_LOW_BELOW ? 2 : 1;
            const posTier: Tier = pos >= SCREEN_POS_GOOD_MIN ? 0 : pos < SCREEN_POS_POOR_BELOW ? 2 : 1;
            const line = SCREEN_LINES[SCREEN_GRID[physTier][posTier]];
            push(line.text, line.sentiment);
        }
    }

    // ── 습관 (lateralBias + zone pref) — 시드 없이도 가능, 순수 스타일 묘사 → 중립 ──
    const habitParts: string[] = [];

    const hidden = generateHiddenTendencies(player);
    if (hidden.lateralBias >= 0.3) habitParts.push('오른쪽으로의 드라이브를 선호함');
    else if (hidden.lateralBias <= -0.3) habitParts.push('왼쪽으로의 드라이브를 선호함');

    if (player.tendencies?.zones) habitParts.push(...describeZoneTendencies(player.tendencies.zones));

    // 문구를 하나로 이어붙이려 하지 않고(접미사 활용형 불일치로 문법이 깨짐), 각각 별도
    // 항목으로 나열 — 문구 자체가 이미 "함"체로 끝나는 완결된 서술이라 접미사가 필요 없음.
    habitParts.forEach(part => push(part, 'neutral'));

    return sentences;
}
