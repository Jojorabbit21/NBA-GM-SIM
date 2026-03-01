
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
    flags: { isSwitch: boolean; isMismatch: boolean; isBotchedSwitch: boolean; isBlock: boolean; isSteal: boolean; points: number; pnrCoverage?: 'drop' | 'hedge' | 'blitz' }
): string {
    const { isSwitch, isMismatch, isBotchedSwitch, isBlock, isSteal, points, pnrCoverage } = flags;
    const canDunk = actor.attr.vertical > 70 && actor.attr.ins > 60;

    // --- 1. SCORING ---
    if (type === 'score') {
        const scoreTag = ` (+${points})`;

        // --- PnR Coverage Context Commentary ---
        if (pnrCoverage === 'drop') {
            if (zone === 'Mid' && playType === 'PnR_Handler') {
                return pick([
                    `${actor.playerName}, 드랍 수비 사이로 풀업 점퍼! 성공!${scoreTag}`,
                    `${actor.playerName}, 빅맨이 빠진 공간에서 미드레인지 적중!${scoreTag}`,
                    `${actor.playerName}, 스크린 이후 열린 공간에서 정확한 점퍼!${scoreTag}`,
                ]);
            }
            if ((zone === 'Rim' || zone === 'Paint') && playType === 'PnR_Roll') {
                return pick([
                    `${actor.playerName}, 드랍 수비를 뚫고 림에서 마무리!${scoreTag}`,
                    `${actor.playerName}, 빅맨의 견제를 이겨내고 골밑 득점!${scoreTag}`,
                ]);
            }
        }
        if (pnrCoverage === 'hedge') {
            if (playType === 'PnR_Roll' && (zone === 'Rim' || zone === 'Paint')) {
                return pick([
                    `${actor.playerName}, 헷지 수비 사이를 파고들어 림 피니시!${scoreTag}`,
                    `${actor.playerName}, 빅맨이 리커버리하기 전에 골밑으로 다이브! 성공!${scoreTag}`,
                ]);
            }
        }
        if (pnrCoverage === 'blitz') {
            if (playType === 'PnR_Handler') {
                return pick([
                    `${actor.playerName}, 더블팀을 빠져나와 슛! 들어갑니다!${scoreTag}`,
                    `${actor.playerName}, 블리츠를 분할하며 득점에 성공합니다!${scoreTag}`,
                ]);
            }
            if (playType === 'PnR_Roll') {
                return pick([
                    `${actor.playerName}, 더블팀 틈을 타 골밑 프리! 이지 레이업!${scoreTag}`,
                    `${assister?.playerName || '핸들러'}의 패스, 블리츠 빈 공간으로 ${actor.playerName} 다이브!${scoreTag}`,
                ]);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 블리츠 수비 사이로 와이드 오픈 3점! 적중!${scoreTag}`,
                    `${actor.playerName}, 더블팀이 풀리며 열린 3점 라인에서 슛! 꽂힙니다!${scoreTag}`,
                ]);
            }
        }

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
            // [New] Putback Commentary
            if (playType === 'Putback') {
                return pick([
                    `${actor.playerName}, 공격 리바운드 후 바로 올려놓습니다!${scoreTag}`,
                    `${actor.playerName}, 잡자마자 풋백 득점!${scoreTag}`,
                    `${actor.playerName}, 팁인 성공! 세컨드 찬스를 살립니다.${scoreTag}`,
                    `${actor.playerName}, 골밑 집중력! 리바운드에 이은 골밑슛 성공.${scoreTag}`
                ]);
            }

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
        // PnR Coverage Defense Success
        if (pnrCoverage === 'drop' && playType === 'PnR_Roll') {
            return pick([
                `${actor.playerName}의 골밑 시도, 드랍 수비에 가로막힙니다.`,
                `${actor.playerName}, 림 어택을 시도하지만 빅맨의 드랍 커버리지에 막힙니다.`,
            ]);
        }
        if (pnrCoverage === 'blitz' && playType === 'PnR_Handler') {
            return pick([
                `${actor.playerName}, 블리츠 더블팀에 막혀 억지 슛... 빗나갑니다.`,
                `${actor.playerName}, 트랩 속에서 어려운 슛을 시도하지만 실패.`,
            ]);
        }
        if (pnrCoverage === 'hedge' && playType === 'PnR_Handler') {
            return pick([
                `${actor.playerName}, 헷지 수비에 걸려 리듬이 깨진 슛... 빗나갑니다.`,
                `${actor.playerName}, 빅맨의 쇼 수비에 막혀 무리한 점퍼를 시도합니다.`,
            ]);
        }

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
        if (playType === 'Putback') {
             return pick([
                `${actor.playerName}, 풋백 시도... 림을 돕니다.`,
                `${actor.playerName}, 리바운드는 잡았으나 마무리가 아쉽습니다.`,
                `${actor.playerName}, 골밑 혼전 중 슛 실패.`
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
        // Blitz 턴오버 전용 코멘터리
        if (pnrCoverage === 'blitz' && playType === 'PnR_Handler') {
            if (isSteal && defender) {
                return pick([
                    `${defender.playerName}, 블리츠 더블팀에서 ${actor.playerName}의 공을 빼앗습니다!`,
                    `${actor.playerName}, 트랩에 걸려 패스 미스! ${defender.playerName}의 스틸!`,
                ]);
            }
            return pick([
                `${actor.playerName}, 블리츠 수비에 갇혀 턴오버를 범합니다.`,
                `${actor.playerName}, 더블팀 압박에 공을 넘겨주고 맙니다.`,
            ]);
        }

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

/**
 * Technical Foul Commentary (15 variations)
 */
export function getTechnicalFoulCommentary(defender: LivePlayer): string {
    return pick([
        `🟨 ${defender.playerName}, 판정에 거세게 항의하다 테크니컬 파울!`,
        `🟨 ${defender.playerName}, 심판에게 과격한 제스처... 테크니컬 파울이 선언됩니다.`,
        `🟨 ${defender.playerName}, 노콜 판정에 불만을 표출하다 테크니컬!`,
        `🟨 ${defender.playerName}, 지속적인 어필 끝에 결국 테크니컬 파울을 받습니다.`,
        `🟨 ${defender.playerName}, 심판과 언쟁 끝에 테크니컬 파울. 감정 조절이 필요합니다.`,
        `🟨 ${defender.playerName}, 공을 바닥에 내리치다 테크니컬 파울!`,
        `🟨 ${defender.playerName}, 좌절감을 이기지 못하고 공을 걷어차 테크니컬!`,
        `🟨 ${defender.playerName}, 골대를 향해 공을 내던지며 테크니컬 파울.`,
        `🟨 ${defender.playerName}, 상대 선수를 향한 도발 행위로 테크니컬!`,
        `🟨 ${defender.playerName}, 득점 후 과도한 세레모니... 테크니컬 파울이 부과됩니다.`,
        `🟨 ${defender.playerName}, 상대 벤치를 향해 어그로를 끌다 테크니컬!`,
        `🟨 ${defender.playerName}, 고의적인 경기 지연으로 테크니컬 파울.`,
        `🟨 ${defender.playerName}, 상대 자유투 시 방해 행위로 테크니컬!`,
        `🟨 ${defender.playerName}, 심판과의 과도한 접근으로 테크니컬 파울!`,
        `🟨 ${defender.playerName}, 데드볼 상황에서 상대와 몸싸움... 테크니컬!`,
    ]);
}

/**
 * Flagrant 1 Commentary (12 variations)
 */
export function getFlagrant1Commentary(defender: LivePlayer, actor: LivePlayer): string {
    return pick([
        `🟥 ${defender.playerName}, 돌파하는 ${actor.playerName}에게 과도한 신체 접촉! Flagrant 1.`,
        `🟥 ${defender.playerName}, 레이업을 막으려다 ${actor.playerName}의 상체를 거칠게 밀칩니다. Flagrant 1.`,
        `🟥 ${defender.playerName}, ${actor.playerName}의 슛 시도를 필요 이상으로 강하게 막아섭니다. Flagrant 1 선언.`,
        `🟥 ${defender.playerName}, 속공 중인 ${actor.playerName}의 유니폼을 잡아끕니다! Flagrant 1.`,
        `🟥 ${defender.playerName}, 패스트브레이크를 끊으려 ${actor.playerName}을 감싸 안습니다. Flagrant 1.`,
        `🟥 ${defender.playerName}, 블록을 시도하다 ${actor.playerName}의 얼굴을 가격합니다! Flagrant 1.`,
        `🟥 ${defender.playerName}, 샷 블록 과정에서 ${actor.playerName}에게 과도한 팔로스루. Flagrant 1.`,
        `🟥 ${defender.playerName}, 포스트 수비 중 ${actor.playerName}에게 불필요한 푸싱. Flagrant 1.`,
        `🟥 ${defender.playerName}, 리바운드 경합에서 ${actor.playerName}을 팔꿈치로 밀어냅니다. Flagrant 1.`,
        `🟥 ${defender.playerName}, 스크린 상황에서 ${actor.playerName}을 과격하게 밀칩니다. Flagrant 1 선언.`,
        `🟥 ${defender.playerName}, 과도한 신체 접촉! 심판진 리뷰 결과 Flagrant 1.`,
        `🟥 ${defender.playerName}, ${actor.playerName}에 대한 불필요한 접촉으로 Flagrant 1이 선언됩니다.`,
    ]);
}

/**
 * Flagrant 2 Commentary (10 variations)
 */
export function getFlagrant2Commentary(defender: LivePlayer, actor: LivePlayer): string {
    return pick([
        `🟥 ${defender.playerName}, 공중에서 ${actor.playerName}을 밀칩니다! Flagrant 2, 즉시 퇴장!`,
        `🟥 ${defender.playerName}, 레이업 중인 ${actor.playerName}을 위험하게 밀어냅니다! Flagrant 2 퇴장!`,
        `🟥 ${defender.playerName}, ${actor.playerName}에게 의도적인 엘보! Flagrant 2, 퇴장 처분!`,
        `🟥 ${defender.playerName}, 스윙한 팔꿈치가 ${actor.playerName}의 얼굴을 강타! Flagrant 2!`,
        `🟥 ${defender.playerName}, ${actor.playerName}을 거칠게 바닥에 끌어내립니다! Flagrant 2 퇴장!`,
        `🟥 ${defender.playerName}, 말릴 수 없는 거친 파울! 심판진 리뷰 후 Flagrant 2 선언. 퇴장!`,
        `🟥 ${defender.playerName}, 보복성 파울! ${actor.playerName}에게 과격한 접촉. Flagrant 2 퇴장!`,
        `🟥 ${defender.playerName}, 데드볼 상황에서 ${actor.playerName}에게 과격한 행동! Flagrant 2!`,
        `🟥 ${defender.playerName}, 경기 흐름과 무관한 위험한 접촉! Flagrant 2, 즉각 퇴장 조치됩니다.`,
        `🟥 ${defender.playerName}, 도저히 용납할 수 없는 플레이! 심판진 만장일치 Flagrant 2 퇴장!`,
    ]);
}
