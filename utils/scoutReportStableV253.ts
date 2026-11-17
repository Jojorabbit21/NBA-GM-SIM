// [2026-11-17] 엔진 프로필 'stable'(배포 엔진 보관본 v253, 커밋 fd3e3952) 방의 스카우팅 리포트 성향 문장.
// 그 엔진에서는 파울 성향·샷 디서플린 등이 아직 경기에 작용하므로, 그 방 유저에게는 배포 당시 문장을 그대로 보여 준다.
// 아래 본문은 fd3e3952 의 utils/scoutReport.ts 성향 블록 그대로다 — 다른 점은 클러치 기준 하나뿐(0.4 → 0.12):
// 성향 생성기(utils/hiddenTendencies.ts)의 클러치 폭이 0.3배가 됐고 같은 시드의 값도 정확히 0.3배라, 같은 선수에게 같은 문장이 나온다.
// 보관본을 쓰는 방이 없어지면 이 파일과 scoutReport.ts 의 분기를 지운다. 문장을 고치지 말 것.
import type { SaveTendencies } from '../types';

type Sentiment = 'positive' | 'negative' | 'neutral';

export function pushStableV253TendencySentences(st: SaveTendencies, push: (text: string, sentiment: Sentiment) => void): void {
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
    const clutchHigh = st.clutchGene >= 0.12;
    const clutchLow = st.clutchGene <= -0.12;
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
