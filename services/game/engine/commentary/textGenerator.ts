
import { LivePlayer } from '../pbp/pbpTypes';
import { PlayType } from '../../../../types';

/**
 * Helper to pick a random string from an array
 */
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Generates dynamic commentary for rebounds
 */
export function getReboundCommentary(rebounder: LivePlayer, type: 'off' | 'def'): string {
    if (type === 'off') {
        return pick([
            `${rebounder.playerName}, 천금같은 공격 리바운드를 잡아냅니다!`,
            `${rebounder.playerName}, 공격 리바운드! 다시 공격 기회를 가져옵니다.`,
            `${rebounder.playerName}, 골밑에서 집중력을 발휘해 공격권을 유지합니다.`,
            `${rebounder.playerName}, 풋백 찬스를 노리며 리바운드를 따냅니다!`,
            `${rebounder.playerName}의 허슬! 공격은 계속됩니다.`
        ]);
    } else {
        return pick([
            `${rebounder.playerName}, 안정적으로 수비 리바운드 확보.`,
            `${rebounder.playerName}, 리바운드로 상대 공격을 끊어냅니다.`,
            `${rebounder.playerName}, 높이를 지배하며 수비 리바운드 성공.`,
            `${rebounder.playerName}, 박스아웃 후 깔끔한 리바운드.`
        ]);
    }
}

/**
 * Generates dynamic commentary based on the play result context.
 */
export function generateCommentary(
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow',
    actor: LivePlayer,
    defender: LivePlayer | undefined,
    assister: LivePlayer | undefined,
    playType: PlayType | undefined,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    flags: { isSwitch: boolean; isMismatch: boolean; isBotchedSwitch: boolean; isBlock: boolean; isSteal: boolean; points: number }
): string {
    const { isSwitch, isMismatch, isBotchedSwitch, isBlock, isSteal, points } = flags;
    const canDunk = actor.attr.vertical > 70 && actor.attr.ins > 60;

    // --- 1. SCORING ---
    if (type === 'score') {
        const scoreTag = ` (+${points})`;

        // 3-Point
        if (zone === '3PT') {
            if (isBotchedSwitch) {
                return pick([
                    `${actor.playerName}, 완벽한 오픈 찬스입니다! 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 수비가 없는 틈을 타 3점슛을 꽂아 넣습니다!${scoreTag}`,
                    `${actor.playerName}, 와이드 오픈 3점! 그물을 가릅니다.${scoreTag}`
                ]);
            }
            if (assister) {
                return pick([
                    `${assister.playerName}의 패스를 받아, ${actor.playerName}의 3점슛!${scoreTag}`,
                    `${assister.playerName}의 킥아웃, ${actor.playerName}가 3점으로 마무리합니다!${scoreTag}`,
                    `${actor.playerName}, ${assister.playerName}의 도움을 받아 외곽포 가동!${scoreTag}`
                ]);
            }
            if (isMismatch) {
                return pick([
                    `${actor.playerName}, 미스매치를 활용해 3점슛을 성공시킵니다!${scoreTag}`,
                    `${actor.playerName}, 수비를 앞에 두고 과감한 3점! 들어갑니다!${scoreTag}`
                ]);
            }
            return pick([
                `${actor.playerName}, 아크 정면에서 3점슛... 꽂힙니다!${scoreTag}`,
                `${actor.playerName}, 장거리 3점포를 터뜨립니다!${scoreTag}`,
                `${actor.playerName}의 3점슛이 림을 통과합니다.${scoreTag}`
            ]);
        }

        // Rim / Paint (Dunks & Layups)
        if (zone === 'Rim' || zone === 'Paint') {
            if (playType === 'PnR_Roll' || playType === 'Cut') {
                 if (canDunk && assister) {
                    return pick([
                        `${assister.playerName}가 띄워주고, ${actor.playerName}가 앨리웁으로 찍어 누릅니다!${scoreTag}`,
                        `${assister.playerName}의 환상적인 패스, ${actor.playerName}의 덩크 마무리!${scoreTag}`
                    ]);
                 }
            }
            if (canDunk) {
                return pick([
                    `${actor.playerName}, 호쾌한 슬램덩크! 수비가 반응하지 못합니다!${scoreTag}`,
                    `${actor.playerName}, 림을 부술 듯한 강력한 원핸드 덩크!${scoreTag}`,
                    `${actor.playerName}, 베이스라인 돌파 후 투핸드 슬램!${scoreTag}`
                ]);
            }
            if (isMismatch) {
                 return pick([
                    `${actor.playerName}, 느린 수비를 제치고 골밑 득점 성공.${scoreTag}`,
                    `${actor.playerName}, 미스매치를 공략하여 레이업을 올려놓습니다.${scoreTag}`
                ]);
            }
            return pick([
                `${actor.playerName}, 골밑 혼전 상황에서 집중력을 발휘해 득점.${scoreTag}`,
                `${actor.playerName}, 유려한 스텝으로 레이업 성공!${scoreTag}`,
                `${actor.playerName}, 컨택을 이겨내고 골밑슛을 성공시킵니다.${scoreTag}`,
                `${actor.playerName}의 플로터... 부드럽게 림을 통과합니다.${scoreTag}`
            ]);
        }

        // Mid-Range
        return pick([
            `${actor.playerName}, 깔끔한 미드레인지 점퍼 성공.${scoreTag}`,
            `${actor.playerName}, 드리블 후 풀업 점퍼! 적중합니다.${scoreTag}`,
            `${actor.playerName}, 자유투 라인 부근에서 점퍼를 꽂습니다.${scoreTag}`,
            `${actor.playerName}, 수비를 제치고 던진 슛이 들어갑니다.${scoreTag}`
        ]);
    }

    // --- 2. MISS ---
    if (type === 'miss') {
        if (isBlock && defender) {
            return pick([
                `${actor.playerName}의 슛, ${defender.playerName}에게 가로막힙니다! (블록)`,
                `${defender.playerName}, ${actor.playerName}의 시도를 완벽하게 블록해냅니다!`,
                `${actor.playerName} 골밑 돌파... ${defender.playerName}의 높이를 넘지 못합니다!`
            ]);
        }
        if (zone === '3PT') {
            return pick([
                `${actor.playerName}, 회심의 3점슛... 림을 외면합니다.`,
                `${actor.playerName}, 3점 라인 밖에서 던져보지만 빗나갑니다.`,
                `${actor.playerName}의 3점 시도, 들어가지 않습니다.`
            ]);
        }
        return pick([
            `${actor.playerName}의 슛이 림을 돌아 나옵니다.`,
            `${actor.playerName}, 득점에 실패합니다.`,
            `${actor.playerName}, 쉬운 찬스를 놓치고 맙니다.`
        ]);
    }

    // --- 3. TURNOVER ---
    if (type === 'turnover') {
        if (isSteal && defender) {
            return pick([
                `${defender.playerName}, ${actor.playerName}의 공을 가로챕니다! (스틸)`,
                `${defender.playerName}의 손질, 스틸에 성공합니다!`,
                `${actor.playerName}, 패스 길을 읽혔습니다. ${defender.playerName}의 스틸.`
            ]);
        }
        return pick([
            `${actor.playerName}, 치명적인 패스 미스로 턴오버를 범합니다.`,
            `${actor.playerName}, 공을 놓치며 공격권을 넘겨줍니다.`,
            `${actor.playerName}, 24초 바이얼레이션에 걸립니다.`,
            `${actor.playerName}, 무리한 돌파로 오펜스 파울을 범합니다.`
        ]);
    }

    // --- 4. FOUL ---
    if (type === 'foul') {
        return pick([
            `${defender?.playerName}, ${actor.playerName}에게 수비 반칙을 범합니다.`,
            `${defender?.playerName}, 돌파하는 ${actor.playerName}를 막다가 파울.`,
            `${defender?.playerName}의 푸싱 파울이 선언됩니다.`
        ]);
    }

    // Default Fallback
    return `${actor.playerName}, 플레이를 펼칩니다.`;
}
