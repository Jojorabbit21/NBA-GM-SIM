
import { Player } from '../types';
import { generateHiddenTendencies, generateSaveTendencies, stringToHash } from './hiddenTendencies';

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

    // ── 습관 (lateralBias + zone pref) — 시드 없이도 가능, 순수 스타일 묘사 → 중립 ──
    const habitParts: string[] = [];

    const hidden = generateHiddenTendencies(player);
    if (hidden.lateralBias >= 0.3) habitParts.push('오른쪽으로의 드라이브를 선호함');
    else if (hidden.lateralBias <= -0.3) habitParts.push('왼쪽으로의 드라이브를 선호함');

    if (player.tendencies?.zones) {
        const z = player.tendencies.zones;
        const paint = z.ra + z.itp;
        const mid = z.mid;
        const three = z.cnr + z.p45 + z.atb;
        const max = Math.max(paint, mid, three);
        if (max === three) habitParts.push('3점 라인 바깥에서 주로 활동함');
        else if (max === mid) habitParts.push('미드레인지 공간을 최대한 활용함');
        else habitParts.push('주로 페인트존 안에서 공격하는것을 선호함');
    }

    // 문구를 하나로 이어붙이려 하지 않고(접미사 활용형 불일치로 문법이 깨짐), 각각 별도
    // 항목으로 나열 — 문구 자체가 이미 "함"체로 끝나는 완결된 서술이라 접미사가 필요 없음.
    habitParts.forEach(part => push(part, 'neutral'));

    return sentences;
}
