
import { Player } from '../types';
import { generateHiddenTendencies, generateSaveTendencies, stringToHash } from './hiddenTendencies';

/**
 * 히든 텐던시를 서술형 스카우트 리포트 문단으로 변환.
 * 수치를 공개하지 않고, 실제 스카우터가 쓴 메모 느낌의 한국어 서술문을 생성.
 * 결정론적: 같은 선수 + 같은 시드 → 항상 동일한 리포트.
 */
export function generateScoutReport(player: Player, tendencySeed?: string): string {
    const sentences: string[] = [];

    // ── Save Tendencies (시드 필요) ──
    if (tendencySeed) {
        const st = generateSaveTendencies(tendencySeed, player.id);

        // 1. 성격 (temperament + ego)
        const hot = st.temperament >= 0.4;
        const cold = st.temperament <= -0.4;
        const proud = st.ego >= 0.4;
        const humble = st.ego <= -0.4;

        if (hot && proud) sentences.push('자존심이 강하고 감정 기복이 있는 타입. 좋을 때와 나쁠 때의 차이가 크다.');
        else if (hot && humble) sentences.push('열정적이지만 팀플레이에 충실하다.');
        else if (cold && proud) sentences.push('냉정하고 자기 확신이 강한 스타일.');
        else if (cold && humble) sentences.push('냉정하면서도 겸손한 성격의 소유자.');
        else if (cold) sentences.push('냉정하고 침착한 성격의 소유자.');
        else if (hot) sentences.push('다혈질 기질이 있어 감정적인 플레이를 할 때가 있다.');
        else if (proud) sentences.push('자존심이 강한 편으로, 팀 내 서열을 의식하는 타입.');
        else if (humble) sentences.push('겸손한 성격으로 팀에 잘 녹아드는 선수.');

        // 2. 멘탈 (clutchGene + composure + confidenceSensitivity)
        const clutchHigh = st.clutchGene >= 0.4;
        const clutchLow = st.clutchGene <= -0.4;
        const compHigh = st.composure >= 0.4;
        const compLow = st.composure <= -0.4;

        if (clutchHigh && compHigh) sentences.push('승부처에서 빛을 발하며, 부담이 큰 상황에서도 흔들리지 않는다.');
        else if (clutchHigh) sentences.push('클러치 상황에서 평소보다 더 좋은 퍼포먼스를 보인다.');
        else if (clutchLow && compLow) sentences.push('승부처에서 위축되는 경향이 있으며, 부담감에 약하다.');
        else if (clutchLow) sentences.push('경기 막판 압박 속에서 평소 실력을 발휘하지 못하는 편.');
        else if (compLow) sentences.push('부담이 큰 상황에서 실수가 잦아지는 경향이 있다.');
        else if (compHigh) sentences.push('압박 속에서도 침착하게 플레이하는 편.');

        if (st.confidenceSensitivity >= 1.4) sentences.push('자신감에 따라 경기력 변동 폭이 큰 편.');
        else if (st.confidenceSensitivity <= 0.6) sentences.push('컨디션이나 자신감에 크게 흔들리지 않는 타입.');

        // 3. 경기력 (consistency + focusDrift + motorIntensity)
        const consHigh = st.consistency >= 0.8;
        const consLow = st.consistency <= 0.3;
        const focusLow = st.focusDrift <= 0.3;
        const focusHigh = st.focusDrift >= 0.7;

        if (consHigh && focusLow) sentences.push('경기력 기복이 거의 없고, 피로한 상황에서도 집중력을 유지한다.');
        else if (consHigh) sentences.push('경기력 기복이 적고, 꾸준한 퍼포먼스를 보인다.');
        else if (consLow) sentences.push('경기력 기복이 심해, 어느 날은 폭발하고 어느 날은 존재감이 없다.');

        if (!consHigh && !consLow && focusHigh) sentences.push('경기 후반 피로가 쌓이면 집중력이 흐려지는 경향이 있다.');

        if (st.motorIntensity >= 1.3) sentences.push('리바운드 경쟁에서 적극적으로 뛰어드는 에너지를 보인다.');
        else if (st.motorIntensity <= 0.7) sentences.push('리바운드 상황에서 소극적인 모습을 보일 때가 있다.');

        // 4. 플레이스타일 (playStyle + shotDiscipline + ballDominance + defensiveMotor + foulProneness)
        const playSentences: string[] = [];

        if (st.playStyle >= 0.5) playSentences.push('슈팅 위주의 적극적인 공격 성향을 가지고 있다.');
        else if (st.playStyle <= -0.5) playSentences.push('패싱을 우선하는 플레이 성향을 가지고 있다.');

        if (st.shotDiscipline >= 0.5) playSentences.push('슛 셀렉션이 좋고, 무리한 슛을 잘 던지지 않는다.');
        else if (st.shotDiscipline <= -0.5) playSentences.push('무리한 슛을 던지는 경향이 있어 효율에 영향을 줄 수 있다.');

        if (st.ballDominance >= 1.3) playSentences.push('볼을 자주 잡으려는 성향이 강하다.');
        else if (st.ballDominance <= 0.7) playSentences.push('볼 터치를 적극적으로 요구하지 않는 편.');

        if (st.defensiveMotor >= 0.5) playSentences.push('수비에서도 적극적으로 뛰는 편.');
        else if (st.defensiveMotor <= -0.5) playSentences.push('수비 노력이 들쭉날쭉한 편.');

        if (st.foulProneness >= 0.5) playSentences.push('파울이 잦아 파울 트러블에 빠지기 쉽다.');
        else if (st.foulProneness <= -0.5) playSentences.push('파울을 잘 하지 않아 오랜 시간 코트에 머물 수 있다.');

        // 플레이스타일 문장이 많으면 자연스럽게 결합
        if (playSentences.length >= 2) {
            // 첫 2개를 "~며, " 로 결합
            const combined = playSentences[0].replace(/\.$/, '') + ', ' + playSentences[1].replace(/^./, c => c.toLowerCase());
            sentences.push(combined);
            for (let i = 2; i < playSentences.length; i++) sentences.push(playSentences[i]);
        } else {
            sentences.push(...playSentences);
        }
    }

    // ── 습관 (lateralBias + zone pref) — 시드 없이도 가능 ──
    const habitParts: string[] = [];

    const hidden = generateHiddenTendencies(player);
    if (hidden.lateralBias >= 0.3) habitParts.push('오른쪽으로의 드라이브를 선호');
    else if (hidden.lateralBias <= -0.3) habitParts.push('왼쪽으로의 드라이브를 선호');

    if (player.tendencies?.zones) {
        const z = player.tendencies.zones;
        const paint = z.ra + z.itp;
        const mid = z.mid;
        const three = z.cnr + z.p45 + z.atb;
        const max = Math.max(paint, mid, three);
        if (max === three) habitParts.push('3점 라인 바깥에서의 플레이를 즐긴다');
        else if (max === mid) habitParts.push('미드레인지 영역을 활동 무대로 삼는다');
        else habitParts.push('주로 페인트존 안에서 활동한다');
    }

    if (habitParts.length === 2) {
        sentences.push(habitParts[0] + '하며, ' + habitParts[1] + '.');
    } else if (habitParts.length === 1) {
        sentences.push(habitParts[0] + (habitParts[0].endsWith('다') ? '' : '한다.'));
    }

    return sentences.join(' ');
}
