
import { LivePlayer } from '../pbp/pbpTypes';
import { PlayType } from '../../../../types';
import type { PlayContext } from '../pbp/playTypes';

/**
 * Helper to pick a random string from an array
 */
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * 킥아웃 커멘터리 풀 구조 — zone(3PT/Rim/Paint/Mid)에 더해 Rim은 레이업/덩크, Paint는
 * 플로터/훅슛/점퍼로 슛타입까지 세분화한다.
 */
type KickoutTextSet = {
    threept: string[];
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; hook: string[]; jumper: string[] };
    mid: string[];
};

/**
 * [2026-08-03] zone+shotType 기준으로 킥아웃 풀에서 텍스트를 고른다. SCORE/MISS 양쪽이
 * 동일한 선택 로직을 쓰므로 공용화. shotType이 없거나 매칭 안 되면 zone의 기본 풀로 폴백.
 */
function pickKickoutText(
    set: KickoutTextSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === '3PT') return pick(set.threept);
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    if (zone === 'Paint') {
        if (shotType === 'Hook') return pick(set.paint.hook);
        if (shotType === 'Jumper') return pick(set.paint.jumper);
        return pick(set.paint.floater);
    }
    return pick(set.mid);
}

/**
 * PnR 커버리지(Drop/Hedge/Blitz) 커멘터리 풀 구조.
 * 롤맨은 항상 림 근처에서 마무리하므로 Rim/Paint/Mid 3존(3점 옵션 자체가 없음 — playTypes.ts
 * selectZone(['Rim','Paint','Mid'], ...)), 핸들러는 탈출 후 어디서든 쏠 수 있어 4존 전부 필요.
 */
type CoverageRimPaintSet = {
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; hook: string[]; jumper: string[] };
};
type CoverageRollSet = CoverageRimPaintSet & { mid: string[] };
type CoverageHandlerSet = CoverageRollSet & { threept: string[] };

function pickRimPaintByShotType(
    set: CoverageRimPaintSet,
    zone: 'Rim' | 'Paint',
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    if (shotType === 'Hook') return pick(set.paint.hook);
    if (shotType === 'Jumper') return pick(set.paint.jumper);
    return pick(set.paint.floater);
}

function pickCoverageRollText(
    set: CoverageRollSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === 'Rim' || zone === 'Paint') return pickRimPaintByShotType(set, zone, shotType);
    return pick(set.mid);
}

function pickCoverageHandlerText(
    set: CoverageHandlerSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === '3PT') return pick(set.threept);
    if (zone === 'Rim' || zone === 'Paint') return pickRimPaintByShotType(set, zone, shotType);
    return pick(set.mid);
}

/**
 * Transition(속공) 커멘터리 풀 구조 — playTypes.ts의 selectZone(['3PT','Paint','Rim'], ...)
 * 대로 Mid 옵션 자체가 없고, resolveFinish(actor, 'drive', ...)라 훅슛도 안 나옴(post/roll 전용).
 * assister는 SCORE엔 항상 있고 MISS엔 아예 없음(possessionHandler.ts가 miss 결과에 assister를
 * 안 담음 — 실제 농구 규칙상 미스에는 어시스트가 성립하지 않기 때문) — MISS 풀은 슈터 단독 묘사만.
 */
type TransitionTextSet = {
    threept: string[];
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; jumper: string[] };
};

function pickTransitionText(
    set: TransitionTextSet,
    zone: 'Rim' | 'Paint' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined
): string {
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    if (zone === 'Paint') return pick(shotType === 'Jumper' ? set.paint.jumper : set.paint.floater);
    return pick(set.threept);
}

/**
 * Generates dynamic commentary for rebounds.
 * [2026-08-03] shooter/zone은 옵션 — 둘 다 호출부에 이미 있던 값이라 비용 없이 세분화:
 * 공격 리바운드는 슈터 본인이 직접 잡았는지(자기 미스 캐치) vs 동료가 잡았는지로 나누고,
 * 수비 리바운드는 3점 미스(롱리바운드)인지 인사이드 미스인지로 나눔.
 */
export function getReboundCommentary(
    rebounder: LivePlayer,
    type: 'off' | 'def',
    shooter?: LivePlayer,
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT'
): string {
    if (type === 'off') {
        if (shooter && rebounder.playerId === shooter.playerId) {
            return pick([
                `${rebounder.playerName}, 자기 슛을 직접 쫓아가 리바운드로 따냅니다!`,
                `${rebounder.playerName}, 미스를 놓치지 않고 스스로 잡아냅니다!`,
                `${rebounder.playerName}, 골밑에서 자신의 미스를 리바운드로 되찾습니다.`
            ]);
        }
        return pick([
            `${rebounder.playerName}, 천금같은 공격 리바운드를 잡아냅니다!`,
            `${rebounder.playerName}, 공격 리바운드! 다시 공격 기회를 가져옵니다.`,
            `${rebounder.playerName}, 골밑에서 집중력을 발휘해 공격권을 유지합니다.`,
            `${rebounder.playerName}, 풋백 찬스를 노리며 리바운드를 따냅니다!`,
            `${rebounder.playerName}의 허슬! 공격은 계속됩니다.`
        ]);
    } else {
        if (zone === '3PT') {
            return pick([
                `${rebounder.playerName}, 멀리 튕겨 나온 공을 재빠르게 낚아챕니다!`,
                `${rebounder.playerName}, 롱리바운드를 놓치지 않고 잡아냅니다!`,
                `${rebounder.playerName}, 3점 미스가 길게 튀자 반응해 리바운드 확보!`
            ]);
        }
        return pick([
            `${rebounder.playerName}, 안정적으로 수비 리바운드 확보.`,
            `${rebounder.playerName}, 리바운드로 상대 공격을 끊어냅니다.`,
            `${rebounder.playerName}, 높이를 지배하며 수비 리바운드 성공.`,
            `${rebounder.playerName}, 박스아웃 후 깔끔한 리바운드.`
        ]);
    }
}

/**
 * [Fix 2026-08-05] 자유투 실패 후 리바운드 전용 커멘터리 — getReboundCommentary()는 필드골
 * 기준(골밑/3점 롱리바운드 등 zone 기반) 문구라 "자유투 라인에서 항상 같은 지점에 놓친다"는
 * 자유투 맥락과 안 맞았음(예: "3점 미스가 길게 튀자"는 자유투엔 있을 수 없는 상황).
 * 오펜시브(동료가 잡음) / 오펜시브(슈터 본인이 직접 잡음) / 디펜시브 3갈래로 분리.
 */
export function getFreeThrowReboundCommentary(
    rebounder: LivePlayer,
    type: 'off' | 'def',
    shooter: LivePlayer
): string {
    if (type === 'off') {
        if (rebounder.playerId === shooter.playerId) {
            return pick([
                `${rebounder.playerName}, 자기 자유투 미스를 직접 쫓아가 잡아냅니다!`,
                `${rebounder.playerName}, 놓친 자유투를 스스로 리바운드로 되찾습니다.`,
                `${rebounder.playerName}, 아쉬운 자유투를 만회하듯 직접 공격 리바운드를 챙깁니다.`
            ]);
        }
        return pick([
            `${rebounder.playerName}, 자유투 라인 근처에서 공격 리바운드를 낚아챕니다!`,
            `${rebounder.playerName}, 놓친 자유투를 그대로 공격 리바운드로 연결합니다.`,
            `${rebounder.playerName}, 자유투 미스를 틈타 공격권을 지켜냅니다!`,
            `${rebounder.playerName}, 몸싸움 끝에 자유투 리바운드를 걷어냅니다.`
        ]);
    }
    return pick([
        `${rebounder.playerName}, 자유투 리바운드를 안정적으로 걷어냅니다.`,
        `${rebounder.playerName}, 놓친 자유투를 깔끔하게 수비 리바운드로 마무리합니다.`,
        `${rebounder.playerName}, 자유투 미스 리바운드를 잡아내며 공수 전환을 준비합니다.`,
        `${rebounder.playerName}, 박스아웃 후 자유투 리바운드 확보.`
    ]);
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
    flags: { isSwitch: boolean; isMismatch: boolean; isBotchedSwitch: boolean; isBlock: boolean; isSteal: boolean; points: number; pnrCoverage?: 'drop' | 'hedge' | 'blitz'; isHelpPlay?: boolean; isKickout?: boolean },
    // [2026-08-03] 킥아웃 등 슛타입별(레이업/덩크/플로터/훅슛 등) 세분화 코멘터리 콘텐츠 작업을 위한
    // 배선 — 엔진은 이미 resolveFinish()에서 shotType을 결정하지만 지금까지 커멘터리에 전달되지
    // 않았음. 콘텐츠는 아직 미반영(다음 작업), 여기선 파라미터만 열어둠.
    shotType?: PlayContext['shotType']
): string {
    const { isSwitch, isMismatch, isBotchedSwitch, isBlock, isSteal, points, pnrCoverage, isHelpPlay, isKickout } = flags;

    // --- 1. SCORING ---
    if (type === 'score') {
        const scoreTag = ` (+${points})`;

        // --- PostUp/PnR_Roll/Iso/PnR_Handler Kickout Commentary (더블팀 유도 후 킥아웃) ---
        // [2026-08-03] zone(3PT/Rim/Paint/Mid) + shotType(레이업/덩크/플로터/훅슛/점퍼)까지
        // 세분화. Rim/Paint 킥아웃 마무리 context가 'drive'로 고정돼 있어 훅슛이 아예 안 나오던
        // 엔진 버그를 먼저 수정(playTypes.ts 4개 킥아웃 진입점 context: 'post')한 뒤 반영.
        if (isKickout && assister && (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'Iso' || playType === 'PnR_Handler')) {
            const kickoutScoreText: Record<string, KickoutTextSet> = {
                PostUp: {
                    threept: [
                        `${assister.playerName}, 더블팀을 유인한 뒤 침착한 킥아웃! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${assister.playerName}, 포스트에서 수비를 끌어들이고 코너로 킥아웃 — ${actor.playerName}의 3점 시도... 성공!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 포스트에서 만들어준 오픈 찬스! 3점 꽂힙니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}가 ${assister.playerName}의 바운드 패스를 받아 레이업을 올려놓습니다.${scoreTag}`,
                            `${assister.playerName}, 더블팀을 피해 쇄도하는 ${actor.playerName}에게 패스를 넣어줍니다! ${actor.playerName}의 멋진 리버스 레이업!${scoreTag}`,
                            `${assister.playerName}, 수비 사이로 패스를 주었고···, 엄청난 행타임을 보여주는 ${actor.playerName}의 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}의 컷인 덩크! 좋은 공간 지각 능력을 보여줍니다! (${assister.playerName} 어시스트)${scoreTag}`,
                            `${assister.playerName}, 쇄도하는 ${actor.playerName}에게 랍 패스···. ${actor.playerName}가 시원한 덩크를 꽂았습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, ${assister.playerName}의 패스를 받은 이후 고각 플로터를 올려놓습니다.${scoreTag}`,
                            `${assister.playerName}, 좋은 패스였습니다. ${actor.playerName}의 수비수 손끝을 살짝 넘기는 플로터로 마무리!${scoreTag}`,
                        ],
                        hook: [
                            `${assister.playerName}, 더블팀을 피해 빠진 ${actor.playerName}에게 패스 — 부드러운 훅슛이 그대로 꽂힙니다!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받자마자 훅슛으로 마무리!${scoreTag}`,
                        ],
                        jumper: [
                            `${assister.playerName}, 더블팀 사이로 패스를 찔러 넣었고 ${actor.playerName}의 짧은 페인트 점퍼가 들어갑니다!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 침착하게 페인트 점퍼 적중!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 포스트업 중 더블팀을 유도한 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 포스트에서 만들어준 공간에서 미드레인지 점퍼 시도···. 성공합니다!${scoreTag}`,
                    ],
                },
                PnR_Roll: {
                    threept: [
                        `${assister.playerName}, 림으로 다이브하다가 수비가 몰리자 그대로 킥아웃! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 골밑에서 만들어준 오픈 찬스 — 3점 꽂힙니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, ${assister.playerName}가 다이브하다 빼준 패스를 받아 레이업으로 마무리!${scoreTag}`,
                            `${assister.playerName}, 림으로 다이브하다 수비가 몰리자 컷인하는 ${actor.playerName}에게 패스 — 깔끔한 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${assister.playerName}, 림으로 다이브하다 반대편으로 패스 — ${actor.playerName}가 그대로 꽂아 넣는 덩크!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 킥아웃을 받자마자 강력한 덩크로 마무리!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}, 다이브하다 더블팀을 만나자 킥아웃 — ${actor.playerName}의 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받아 수비 사이로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${assister.playerName}, 림으로 다이브하며 만든 공간에서 ${actor.playerName}에게 패스 — 훅슛으로 깔끔하게 마무리!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 킥아웃을 받아 그대로 훅슛! 들어갑니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${assister.playerName}, 다이브하다 수비가 몰리자 킥아웃 — ${actor.playerName}의 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 다이브하며 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
                    ],
                },
                Iso: {
                    threept: [
                        `${assister.playerName}, 1대1 승부하다 더블팀이 오자 침착하게 빼줍니다! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${assister.playerName}, 아이솔레이션 중 수비가 몰리자 킥아웃 — ${actor.playerName} 3점포!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, ${assister.playerName}의 아이소 킥아웃을 받아 그대로 돌파 레이업!${scoreTag}`,
                            `${assister.playerName}, 1대1 승부 중 더블팀을 읽고 컷인하는 ${actor.playerName}에게 패스 — 깔끔한 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${assister.playerName}, 1대1 승부하다 더블팀이 오자 반대편으로 패스 — ${actor.playerName}의 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 아이소 킥아웃을 받자마자 덩크로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}, 아이솔레이션 중 더블팀을 읽고 킥아웃 — ${actor.playerName}의 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받아 수비 사이로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${assister.playerName}, 1대1 승부 중 만든 공간에서 ${actor.playerName}에게 패스 — 훅슛으로 깔끔하게 마무리!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 아이소 킥아웃을 받아 그대로 훅슛! 들어갑니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${assister.playerName}, 아이솔레이션 중 수비가 몰리자 킥아웃 — ${actor.playerName}의 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 1대1 승부 중 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
                    ],
                },
                PnR_Handler: {
                    threept: [
                        `${assister.playerName}, 픽앤롤에서 더블팀을 유도한 뒤 위크사이드로 정확히 빼줍니다! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${assister.playerName}, 스크린 활용 후 수비가 몰리자 킥아웃 — ${actor.playerName} 3점포!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, ${assister.playerName}의 픽앤롤 킥아웃을 받아 곧바로 돌파 레이업!${scoreTag}`,
                            `${assister.playerName}, 스크린을 활용하다 더블팀을 읽고 컷인하는 ${actor.playerName}에게 패스 — 깔끔한 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${assister.playerName}, 픽앤롤에서 더블팀을 유도한 뒤 반대편으로 패스 — ${actor.playerName}의 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 픽앤롤 킥아웃을 받자마자 덩크로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}, 픽앤롤 중 더블팀을 읽고 킥아웃 — ${actor.playerName}의 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받아 수비 사이로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${assister.playerName}, 스크린 활용 후 만든 공간에서 ${actor.playerName}에게 패스 — 훅슛으로 깔끔하게 마무리!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}의 픽앤롤 킥아웃을 받아 그대로 훅슛! 들어갑니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${assister.playerName}, 픽앤롤에서 수비가 몰리자 킥아웃 — ${actor.playerName}의 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 픽앤롤에서 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${assister.playerName}가 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
                    ],
                },
            };
            return pickKickoutText(kickoutScoreText[playType], zone, shotType);
        }

        // --- PnR Coverage Context Commentary ---
        // [2026-08-03] Drop/Hedge/Blitz 전수조사 결과 롤맨 Mid 케이스, 핸들러 3점/림/페인트,
        // Pop 전체(Drop/Hedge)가 빠져있던 걸 확인 — 3개 커버리지 × (Handler 4존 + Roll 3존 +
        // Pop 3점고정) 전체를 채워 반영.
        if (pnrCoverage === 'drop') {
            if (playType === 'PnR_Handler') {
                const dropHandlerScore: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 드랍 수비 사이 넉넉한 공간에서 3점 적중!${scoreTag}`,
                        `${actor.playerName}, 처진 빅맨을 이용해 스크린 뒤에서 3점을 꽂습니다!${scoreTag}`,
                    ],
                    mid: [
                        `${actor.playerName}, 드랍 수비 사이로 풀업 점퍼! 성공!${scoreTag}`,
                        `${actor.playerName}, 빅맨이 빠진 공간에서 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, 스크린 이후 열린 공간에서 정확한 점퍼!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 드랍 수비를 완전히 뚫고 레이업으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 그대로 지나쳐 골밑까지 파고듭니다!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 드랍 수비를 완전히 따돌리고 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 지나쳐 그대로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 드랍 수비를 완전히 넘어서는 플로터!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨까지 뚫고 들어가 플로터로 마무리!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 드랍 수비 안쪽까지 파고들어 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 완전히 지나쳐 훅슛을 꽂습니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 드랍 수비 안으로 파고들어 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 지나쳐 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageHandlerText(dropHandlerScore, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const dropRollScore: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 드랍 수비를 피해 미드레인지에서 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 처진 빅맨 앞에서 미드레인지 점퍼를 꽂습니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 드랍 수비를 뚫고 레이업으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨 사이를 파고들어 깔끔한 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 드랍 수비 위로 그대로 꽂아 넣는 덩크!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 무시하고 강력한 덩크로 마무리!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 드랍 수비 위로 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨 너머로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 드랍 수비 사이에서 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨을 등지고 훅슛 성공!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 드랍 수비 앞에서 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 처진 빅맨 앞에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageRollText(dropRollScore, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 드랍 수비가 완전히 처지며 활짝 열린 3점! 적중!${scoreTag}`,
                    `${actor.playerName}, 빅맨이 골밑을 지키느라 비워둔 공간에서 팝아웃 3점 성공!${scoreTag}`,
                ]);
            }
        }
        if (pnrCoverage === 'hedge') {
            if (playType === 'PnR_Handler') {
                const hedgeHandlerScore: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 헷지 수비를 피해 뒤로 물러나 3점 적중!${scoreTag}`,
                        `${actor.playerName}, 빅맨의 강한 압박을 피해 리셋 후 3점을 꽂습니다!${scoreTag}`,
                    ],
                    mid: [
                        `${actor.playerName}, 헷지 수비 사이로 빠르게 풀업 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 빅맨이 회수하기 전에 미드레인지 적중!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 헷지 수비를 그대로 쪼개고 골밑까지 파고들어 레이업!${scoreTag}`,
                            `${actor.playerName}, 강한 압박을 뚫고 코너를 돌아 레이업으로 마무리!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 헷지 수비를 완전히 쪼개고 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, 압박을 뚫어내고 그대로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 헷지 수비를 넘어서는 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, 압박을 뚫고 들어가 플로터로 마무리!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 헷지 수비 안쪽까지 파고들어 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 압박을 뚫고 훅슛을 꽂습니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 헷지 수비 안으로 파고들어 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 압박을 뚫고 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageHandlerText(hedgeHandlerScore, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const hedgeRollScore: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 헷지 수비가 빠진 사이 미드레인지 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 빅맨이 핸들러를 막느라 비운 공간에서 점퍼 적중!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 헷지 수비 사이를 파고들어 레이업으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 빅맨이 리커버리하기 전에 골밑까지 다이브해 레이업 성공!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 헷지 수비가 늦게 회수하는 사이 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, 빅맨이 놓친 틈을 타 그대로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 헷지 수비 위로 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, 빅맨이 회수하는 틈에 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 헷지 수비 사이에서 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 빅맨이 늦게 붙는 틈에 훅슛 성공!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 헷지 수비 앞에서 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 빅맨이 회수하기 전에 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageRollText(hedgeRollScore, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 헷지 수비 사이 빅맨이 완전히 빠진 틈에 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 빅맨이 회수하기 전에 팝아웃 3점을 꽂습니다!${scoreTag}`,
                ]);
            }
        }
        if (pnrCoverage === 'blitz') {
            if (playType === 'PnR_Handler') {
                const blitzHandlerScore: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 더블팀을 완전히 빠져나와 3점 적중!${scoreTag}`,
                        `${actor.playerName}, 블리츠를 피해 물러난 자리에서 3점을 꽂습니다!${scoreTag}`,
                    ],
                    mid: [
                        `${actor.playerName}, 더블팀을 빠져나와 슛! 들어갑니다!${scoreTag}`,
                        `${actor.playerName}, 블리츠를 분할하며 득점에 성공합니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 더블팀을 완전히 쪼개고 골밑까지 파고들어 레이업!${scoreTag}`,
                            `${actor.playerName}, 트랩을 뚫고 그대로 레이업으로 마무리!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 더블팀을 완전히 쪼개고 강력한 덩크!${scoreTag}`,
                            `${actor.playerName}, 트랩을 뚫어내고 그대로 꽂아 넣습니다!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 더블팀을 넘어서는 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, 트랩을 뚫고 들어가 플로터로 마무리!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 더블팀 안쪽까지 파고들어 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 트랩을 뚫고 훅슛을 꽂습니다!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 더블팀 안으로 파고들어 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 트랩을 뚫고 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageHandlerText(blitzHandlerScore, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const blitzRollScore: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 더블팀이 걸린 사이 미드레인지 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 수비가 완전히 몰린 틈에 미드레인지 적중!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 더블팀 틈을 타 골밑 프리! 이지 레이업!${scoreTag}`,
                            `${assister?.playerName || '핸들러'}의 패스, 블리츠 빈 공간으로 ${actor.playerName}가 다이브해 레이업 성공!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 더블팀이 완전히 몰린 사이 강력한 덩크!${scoreTag}`,
                            `${assister?.playerName || '핸들러'}의 패스, 블리츠 빈 공간으로 ${actor.playerName}가 덩크로 마무리!${scoreTag}`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 더블팀 빈 공간에서 부드러운 플로터!${scoreTag}`,
                            `${actor.playerName}, 수비가 몰린 틈에 플로터를 띄웁니다. 성공!${scoreTag}`,
                        ],
                        hook: [
                            `${actor.playerName}, 더블팀 빈 공간에서 훅슛으로 마무리!${scoreTag}`,
                            `${actor.playerName}, 수비가 몰린 틈에 훅슛 성공!${scoreTag}`,
                        ],
                        jumper: [
                            `${actor.playerName}, 더블팀 빈 공간에서 짧은 페인트 점퍼 성공!${scoreTag}`,
                            `${actor.playerName}, 수비가 몰린 틈에 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                };
                return pickCoverageRollText(blitzRollScore, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 블리츠 수비 사이로 와이드 오픈 3점! 적중!${scoreTag}`,
                    `${actor.playerName}, 더블팀이 풀리며 열린 3점 라인에서 슛! 꽂힙니다!${scoreTag}`,
                ]);
            }
        }

        // --- Transition (속공) ---
        // [2026-08-03] zone(3점/림/페인트)+슛타입 기준으로 세분화. assister는 항상 실존하므로
        // 문구별로 언급 유무를 섞음(전부 언급해야 할 데이터적 근거는 없고, 다양성을 위한 선택).
        if (playType === 'Transition' && assister) {
            const transitionScore: TransitionTextSet = {
                threept: [
                    `${assister.playerName}, 속공 상황에서 길게 뿌린 패스 — ${actor.playerName}의 트레일링 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 속공 중 트레일러로 따라붙어 3점 적중!${scoreTag}`,
                    `빠른 전개 끝에 ${actor.playerName}, 여유 있게 3점을 꽂습니다!${scoreTag}`,
                ],
                rim: {
                    layup: [
                        `${assister.playerName}, 속공 상황에서 정확한 패스 — ${actor.playerName}의 레이업 성공!${scoreTag}`,
                        `${actor.playerName}, 홀로 코트를 가로질러 레이업으로 마무리!${scoreTag}`,
                        `${assister.playerName}의 아웃렛 패스, ${actor.playerName}가 그대로 레이업으로 연결합니다!${scoreTag}`,
                    ],
                    dunk: [
                        `${assister.playerName}, 속공 상황에서 띄워주는 패스 — ${actor.playerName}의 시원한 덩크!${scoreTag}`,
                        `${actor.playerName}, 혼자 질주해 강력한 덩크로 마무리!${scoreTag}`,
                        `${assister.playerName}, 길게 뿌린 패스를 받은 ${actor.playerName}가 그대로 덩크를 꽂습니다!${scoreTag}`,
                    ],
                },
                paint: {
                    floater: [
                        `${assister.playerName}, 속공 상황에서 패스 — ${actor.playerName}의 부드러운 플로터!${scoreTag}`,
                        `${actor.playerName}, 혼자 질주하다 수비를 피해 플로터로 마무리!${scoreTag}`,
                    ],
                    jumper: [
                        `${assister.playerName}, 속공 상황에서 패스 — ${actor.playerName}의 짧은 페인트 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 속공 중 페인트에서 점퍼를 꽂습니다!${scoreTag}`,
                    ],
                },
            };
            return pickTransitionText(transitionScore, zone === 'Mid' ? undefined : zone, shotType);
        }

        // 3-Point
        // [2026-08-03] 기존 "assister 있으면 캐치앤슛 문구" 분기가 SCORE에서 assister가 거의 항상
        // 존재하는 탓에 Pullup(자체 생산) 슛까지 "패스 받아 3점"으로 잘못 묘사하던 문제를 바로잡음
        // — shotType(CatchShoot/Pullup) 기준으로 재구성. isBotchedSwitch/isMismatch는 shotType과
        // 무관한 우선 상황이라 그대로 유지.
        if (zone === '3PT') {
            if (isBotchedSwitch) {
                return pick([
                    `${actor.playerName}, 완벽한 오픈 찬스입니다! 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 수비가 없는 틈을 타 3점슛을 꽂아 넣습니다!${scoreTag}`,
                    `${actor.playerName}, 와이드 오픈 3점! 그물을 가릅니다.${scoreTag}`
                ]);
            }
            if (isMismatch) {
                return pick([
                    `${actor.playerName}, 미스매치를 활용해 3점슛을 성공시킵니다!${scoreTag}`,
                    `${actor.playerName}, 수비를 앞에 두고 과감한 3점! 들어갑니다!${scoreTag}`
                ]);
            }
            if (shotType === 'CatchShoot' && assister) {
                return pick([
                    `${assister.playerName}의 패스를 받아, ${actor.playerName}의 3점슛!${scoreTag}`,
                    `${assister.playerName}의 킥아웃, ${actor.playerName}가 3점으로 마무리합니다!${scoreTag}`,
                    `${actor.playerName}, ${assister.playerName}의 도움을 받아 외곽포 가동!${scoreTag}`
                ]);
            }
            return pick([
                `${actor.playerName}, 아크 정면에서 3점슛... 꽂힙니다!${scoreTag}`,
                `${actor.playerName}, 장거리 3점포를 터뜨립니다!${scoreTag}`,
                `${actor.playerName}의 3점슛이 림을 통과합니다.${scoreTag}`,
                `${actor.playerName}, 드리블 후 스텝백 3점! 들어갑니다!${scoreTag}`
            ]);
        }

        // Rim / Paint (Dunks & Layups)
        if (zone === 'Rim' || zone === 'Paint') {
            // [New] Putback Commentary
            // [2026-08-03] 풋백은 context='putback'이 Paint/Mid 옵션을 전부 걸러내 zone이 항상
            // Rim으로 고정되고 shotType도 Dunk/Layup만 나옴(훅슛/플로터/점퍼 불가) — 존 전체
            // 세분화 대신 덩크/레이업(팁인)만 분리.
            if (playType === 'Putback') {
                if (shotType === 'Dunk') {
                    return pick([
                        `${actor.playerName}, 리바운드를 잡자마자 그대로 꽂아 넣습니다!${scoreTag}`,
                        `${actor.playerName}, 풋백 덩크! 세컨드 찬스를 화끈하게 살립니다!${scoreTag}`,
                        `${actor.playerName}, 공중에서 잡아 바로 덩크로 연결합니다!${scoreTag}`
                    ]);
                }
                return pick([
                    `${actor.playerName}, 공격 리바운드 후 바로 올려놓습니다!${scoreTag}`,
                    `${actor.playerName}, 팁인 성공! 세컨드 찬스를 살립니다.${scoreTag}`,
                    `${actor.playerName}, 골밑 집중력! 리바운드에 이은 골밑슛 성공.${scoreTag}`
                ]);
            }

            // [2026-08-03] canDunk(속성 기반 추정치: vertical>70 && ins>60)가 실제 resolveFinish()의
            // 덩크 판정(vertical>=70 && strength>=65 + 가중치 랜덤)과 기준 자체가 달라서 레이업을
            // 덩크로, 혹은 그 반대로 잘못 묘사하던 문제를 바로잡음 — 실제 shotType 기준으로 재구성.
            // Paint 존은 킥아웃/커버리지와 동일하게 플로터/훅슛/점퍼로 세분화(CoverageRimPaintSet 재사용).
            if ((playType === 'PnR_Roll' || playType === 'Cut') && shotType === 'Dunk' && assister) {
                return pick([
                    `${assister.playerName}가 띄워주고, ${actor.playerName}가 앨리웁으로 찍어 누릅니다!${scoreTag}`,
                    `${assister.playerName}의 환상적인 패스, ${actor.playerName}의 덩크 마무리!${scoreTag}`,
                    `${assister.playerName}, 하이라이트 필름 감이네요 — ${actor.playerName}의 앨리웁 덩크!${scoreTag}`
                ]);
            }
            if (isMismatch) {
                 return pick([
                    `${actor.playerName}, 느린 수비를 제치고 골밑 득점 성공.${scoreTag}`,
                    `${actor.playerName}, 미스매치를 공략하여 레이업을 올려놓습니다.${scoreTag}`,
                    `${actor.playerName}, 미스매치 상대를 가볍게 제치고 골밑 마무리.${scoreTag}`
                ]);
            }
            const rimPaintScore: CoverageRimPaintSet = {
                rim: {
                    layup: [
                        `${actor.playerName}, 골밑 혼전 상황에서 집중력을 발휘해 득점.${scoreTag}`,
                        `${actor.playerName}, 유려한 스텝으로 레이업 성공!${scoreTag}`,
                        `${actor.playerName}, 컨택을 이겨내고 골밑슛을 성공시킵니다.${scoreTag}`
                    ],
                    dunk: [
                        `${actor.playerName}, 호쾌한 슬램덩크! 수비가 반응하지 못합니다!${scoreTag}`,
                        `${actor.playerName}, 림을 부술 듯한 강력한 원핸드 덩크!${scoreTag}`,
                        `${actor.playerName}, 베이스라인 돌파 후 투핸드 슬램!${scoreTag}`
                    ]
                },
                paint: {
                    floater: [
                        `${actor.playerName}의 플로터... 부드럽게 림을 통과합니다.${scoreTag}`,
                        `${actor.playerName}, 수비 사이로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        `${actor.playerName}, 타이밍 좋은 플로터로 페인트를 공략합니다!${scoreTag}`
                    ],
                    hook: [
                        `${actor.playerName}, 페인트에서 훅슛으로 마무리!${scoreTag}`,
                        `${actor.playerName}, 수비를 등지고 훅슛을 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 부드러운 터치의 훅슛이 그물을 가릅니다!${scoreTag}`
                    ],
                    jumper: [
                        `${actor.playerName}, 짧은 페인트 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 페인트에서 정확한 점퍼를 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 페인트에서 침착하게 점퍼를 올려놓습니다!${scoreTag}`
                    ]
                }
            };
            return pickRimPaintByShotType(rimPaintScore, zone, shotType);
        }

        // Mid-Range
        // [2026-08-03] shotType(Jumper/Pullup) 기준 세분화 — 3점 때와 동일 패턴. Fadeaway는
        // resolveFinish() 호출 그래프상 Mid 존에서 실제로 도달 불가능한 값이라 제외.
        // [2026-08-03] isMismatch(flowEngine.ts calculateHitRate, 매치업 갭 체크)가 3점/Rim·Paint
        // SCORE에만 있고 미드는 안 봐서 신규 추가.
        if (isMismatch) {
            return pick([
                `${actor.playerName}, 미스매치를 활용해 미드레인지 점퍼를 성공시킵니다!${scoreTag}`,
                `${actor.playerName}, 느린 수비를 앞에 두고 여유 있게 미드레인지 적중!${scoreTag}`,
                `${actor.playerName}, 미스매치 상대를 상대로 침착하게 점퍼 성공.${scoreTag}`
            ]);
        }
        if (shotType === 'Pullup') {
            return pick([
                `${actor.playerName}, 드리블 후 풀업 점퍼! 적중합니다.${scoreTag}`,
                `${actor.playerName}, 수비를 제치고 던진 슛이 들어갑니다.${scoreTag}`,
                `${actor.playerName}, 스텝백 점퍼로 수비를 따돌리고 득점!${scoreTag}`
            ]);
        }
        if (assister) {
            return pick([
                `${actor.playerName}, 깔끔한 미드레인지 점퍼 성공.${scoreTag}`,
                `${actor.playerName}, 자유투 라인 부근에서 점퍼를 꽂습니다.${scoreTag}`,
                `${assister.playerName}의 패스를 받아, ${actor.playerName}가 미드레인지에서 침착하게 마무리!${scoreTag}`
            ]);
        }
        return pick([
            `${actor.playerName}, 깔끔한 미드레인지 점퍼 성공.${scoreTag}`,
            `${actor.playerName}, 자유투 라인 부근에서 점퍼를 꽂습니다.${scoreTag}`
        ]);
    }

    // --- 2. MISS ---
    if (type === 'miss') {
        // --- PostUp/PnR_Roll/Iso/PnR_Handler Kickout Commentary (더블팀 유도 후 킥아웃, 실패) ---
        if (isKickout && assister && (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'Iso' || playType === 'PnR_Handler') && !isBlock) {
            const kickoutMissText: Record<string, KickoutTextSet> = {
                PostUp: {
                    threept: [
                        `${assister.playerName}, 포스트에서 침착하게 빼줬지만 ${actor.playerName}의 3점이 빗나갑니다.`,
                        `${actor.playerName}, ${assister.playerName}의 킥아웃을 받았지만 3점 시도가 림을 외면합니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, ${assister.playerName}의 좋은 패스를 받아 레이업을 올려놓았지만 림을 돌아 나옵니다.`,
                            `${assister.playerName}, 더블팀을 뚫고 ${actor.playerName}에게 완벽한 기회를 만들어주었지만 ${actor.playerName}가 레이업에 실패합니다!`,
                        ],
                        dunk: [
                            `${assister.playerName}, 좋은 패스였지만 ${actor.playerName} 덩크를 득점으로 연결시키지 못했습니다.`,
                            `${actor.playerName}, 덩크에 실패하며 ${assister.playerName}의 패스를 무위로 돌려놓습니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 좋은 킥아웃 패스를 받았지만 러닝 플로터가 들어가지 않았습니다.`,
                            `${assister.playerName}, 쇄도하는 ${actor.playerName}에게 패스를 빼줬지만 플로터로 마무리하는데 실패합니다.`,
                        ],
                        hook: [
                            `${assister.playerName}의 정확한 패스였지만, ${actor.playerName}의 훅슛이 림을 맞고 튕겨 나옵니다.`,
                            `${actor.playerName}, 훅슛 타이밍이 살짝 빨랐는지 손끝에서 빗나갑니다.`,
                        ],
                        jumper: [
                            `${assister.playerName}의 패스는 완벽했지만 ${actor.playerName}의 페인트 점퍼가 림을 빗겨갑니다.`,
                            `${actor.playerName}, 급하게 올린 페인트 점퍼가 짧게 떨어집니다.`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}가 포스트에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 좋은 패스를 받았지만 미드레인지 시도는 빗나갑니다.`,
                    ],
                },
                PnR_Roll: {
                    threept: [
                        `${assister.playerName}, 다이브하다 킥아웃했지만 ${actor.playerName}의 3점이 빗나갑니다.`,
                        `${actor.playerName}, ${assister.playerName}의 킥아웃을 받았지만 3점 시도가 아쉽게 빗나갑니다.`,
                    ],
                    rim: {
                        layup: [
                            `${assister.playerName}의 킥아웃, ${actor.playerName}가 레이업을 시도했지만 림을 맞고 나옵니다.`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받아 쇄도했지만 레이업이 짧습니다.`,
                        ],
                        dunk: [
                            `${assister.playerName}의 패스는 좋았지만, ${actor.playerName}가 덩크를 놓칩니다.`,
                            `${actor.playerName}, 덩크 타이밍이 어긋나며 ${assister.playerName}의 킥아웃을 무위로 돌립니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}의 킥아웃, ${actor.playerName}의 플로터가 림을 넘지 못합니다.`,
                            `${actor.playerName}, 좋은 패스를 받았지만 플로터 타이밍이 아쉽습니다.`,
                        ],
                        hook: [
                            `${assister.playerName}의 패스는 정확했지만, ${actor.playerName}의 훅슛이 빗나갑니다.`,
                            `${actor.playerName}, 훅슛을 시도했지만 림을 외면합니다.`,
                        ],
                        jumper: [
                            `${assister.playerName}의 킥아웃, ${actor.playerName}의 페인트 점퍼가 빗나갑니다.`,
                            `${actor.playerName}, 페인트 점퍼를 시도했지만 짧게 떨어집니다.`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}가 골밑에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 좋은 패스를 받았지만 미드레인지 시도는 빗나갑니다.`,
                    ],
                },
                Iso: {
                    threept: [
                        `${assister.playerName}, 아이솔레이션 중 침착하게 빼줬지만 ${actor.playerName}의 3점이 빗나갑니다.`,
                        `${actor.playerName}, ${assister.playerName}의 아이소 킥아웃을 받았지만 3점 시도가 아쉽게 빗나갑니다.`,
                    ],
                    rim: {
                        layup: [
                            `${assister.playerName}의 아이소 킥아웃, ${actor.playerName}의 레이업이 림을 돌아 나옵니다.`,
                            `${actor.playerName}, 패스를 받아 돌파했지만 레이업을 놓칩니다.`,
                        ],
                        dunk: [
                            `${assister.playerName}의 패스는 좋았지만, ${actor.playerName}가 덩크를 놓칩니다.`,
                            `${actor.playerName}, 덩크 타이밍이 어긋나며 기회를 무위로 돌립니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}의 아이소 킥아웃, ${actor.playerName}의 플로터가 림을 넘지 못합니다.`,
                            `${actor.playerName}, 좋은 패스를 받았지만 플로터 타이밍이 아쉽습니다.`,
                        ],
                        hook: [
                            `${assister.playerName}의 패스는 정확했지만, ${actor.playerName}의 훅슛이 빗나갑니다.`,
                            `${actor.playerName}, 훅슛을 시도했지만 림을 외면합니다.`,
                        ],
                        jumper: [
                            `${assister.playerName}의 아이소 킥아웃, ${actor.playerName}의 페인트 점퍼가 빗나갑니다.`,
                            `${actor.playerName}, 페인트 점퍼를 시도했지만 짧게 떨어집니다.`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}가 아이솔레이션에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 좋은 패스를 받았지만 미드레인지 시도는 빗나갑니다.`,
                    ],
                },
                PnR_Handler: {
                    threept: [
                        `${assister.playerName}, 픽앤롤에서 킥아웃했지만 ${actor.playerName}의 3점이 빗나갑니다.`,
                        `${actor.playerName}, ${assister.playerName}의 픽앤롤 킥아웃을 받았지만 3점 시도가 림을 외면합니다.`,
                    ],
                    rim: {
                        layup: [
                            `${assister.playerName}의 픽앤롤 킥아웃, ${actor.playerName}의 레이업이 림을 돌아 나옵니다.`,
                            `${actor.playerName}, 패스를 받아 돌파했지만 레이업을 놓칩니다.`,
                        ],
                        dunk: [
                            `${assister.playerName}의 패스는 좋았지만, ${actor.playerName}가 덩크를 놓칩니다.`,
                            `${actor.playerName}, 덩크 타이밍이 어긋나며 기회를 무위로 돌립니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${assister.playerName}의 픽앤롤 킥아웃, ${actor.playerName}의 플로터가 림을 넘지 못합니다.`,
                            `${actor.playerName}, 좋은 패스를 받았지만 플로터 타이밍이 아쉽습니다.`,
                        ],
                        hook: [
                            `${assister.playerName}의 패스는 정확했지만, ${actor.playerName}의 훅슛이 빗나갑니다.`,
                            `${actor.playerName}, 훅슛을 시도했지만 림을 외면합니다.`,
                        ],
                        jumper: [
                            `${assister.playerName}의 픽앤롤 킥아웃, ${actor.playerName}의 페인트 점퍼가 빗나갑니다.`,
                            `${actor.playerName}, 페인트 점퍼를 시도했지만 짧게 떨어집니다.`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}가 픽앤롤에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 좋은 패스를 받았지만 미드레인지 시도는 빗나갑니다.`,
                    ],
                },
            };
            return pickKickoutText(kickoutMissText[playType], zone, shotType);
        }

        // --- PnR Coverage Context Commentary (실패) ---
        // [2026-08-03] SCORE와 동일 — Drop/Hedge/Blitz × (Handler 4존 + Roll 3존 + Pop 3점고정) 전체.
        if (pnrCoverage === 'drop') {
            if (playType === 'PnR_Handler') {
                const dropHandlerMiss: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 드랍 수비가 내준 공간에서 쐈지만 3점이 빗나갑니다.`,
                        `${actor.playerName}, 여유 있게 던진 3점이 아쉽게 벗어납니다.`,
                    ],
                    mid: [
                        `${actor.playerName}, 드랍 수비 사이로 풀업 점퍼를 시도했지만 빗나갑니다.`,
                        `${actor.playerName}, 빅맨이 빠진 공간에서 쐈지만 미드레인지 슛이 아쉽게 벗어납니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 드랍 수비를 뚫었지만 레이업이 빗나갑니다.`,
                            `${actor.playerName}, 골밑까지 파고들었지만 마무리가 아쉽습니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 드랍 수비를 뚫었지만 덩크를 놓칩니다.`,
                            `${actor.playerName}, 골밑까지 왔지만 덩크가 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 드랍 수비까지 넘었지만 플로터가 짧습니다.`,
                            `${actor.playerName}, 페인트까지 파고들었지만 플로터가 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 페인트까지 왔지만 훅슛이 림을 벗어납니다.`,
                            `${actor.playerName}, 훅슛 타이밍이 아쉽게 어긋납니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트까지 왔지만 점퍼가 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageHandlerText(dropHandlerMiss, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const dropRollMiss: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 드랍 수비를 피해 쐈지만 미드레인지 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 미드레인지에서 던진 슛이 아쉽게 벗어납니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 드랍 수비를 넘어서려 했지만 레이업이 빗나갑니다.`,
                            `${actor.playerName}, 빅맨의 견제 속에 레이업을 놓칩니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 드랍 수비 앞에서 덩크를 놓칩니다.`,
                            `${actor.playerName}, 덩크를 시도했지만 빅맨의 견제에 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 드랍 수비를 넘기려던 플로터가 짧습니다.`,
                            `${actor.playerName}, 플로터 타이밍이 아쉽게 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 훅슛을 시도했지만 드랍 수비에 걸립니다.`,
                            `${actor.playerName}, 훅슛이 림을 맞고 튕겨 나옵니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트 점퍼가 드랍 수비에 살짝 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageRollText(dropRollMiss, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 드랍 수비가 열어준 공간에서 쐈지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 완전히 열린 팝아웃 찬스였지만 3점이 아쉽게 벗어납니다.`,
                ]);
            }
        }
        if (pnrCoverage === 'hedge') {
            if (playType === 'PnR_Handler') {
                const hedgeHandlerMiss: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 헷지를 피해 던진 3점이 빗나갑니다.`,
                        `${actor.playerName}, 뒤로 물러나 쐈지만 3점이 아쉽게 벗어납니다.`,
                    ],
                    mid: [
                        `${actor.playerName}, 헷지에 걸려 리듬이 깨진 슛... 빗나갑니다.`,
                        `${actor.playerName}, 빅맨의 쇼 수비에 막혀 무리한 점퍼를 시도합니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 헷지를 뚫었지만 레이업이 빗나갑니다.`,
                            `${actor.playerName}, 압박을 뚫고 들어갔지만 마무리가 아쉽습니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 헷지를 뚫었지만 덩크를 놓칩니다.`,
                            `${actor.playerName}, 골밑까지 왔지만 덩크가 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 헷지를 넘겼지만 플로터가 짧습니다.`,
                            `${actor.playerName}, 페인트까지 파고들었지만 플로터가 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 페인트까지 왔지만 훅슛이 림을 벗어납니다.`,
                            `${actor.playerName}, 훅슛 타이밍이 아쉽게 어긋납니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트까지 왔지만 점퍼가 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageHandlerText(hedgeHandlerMiss, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const hedgeRollMiss: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 헷지로 생긴 공간에서 쐈지만 미드레인지가 빗나갑니다.`,
                        `${actor.playerName}, 미드레인지 점퍼가 아쉽게 벗어납니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 헷지 수비가 회수하기 전에 다이브했지만 레이업이 빗나갑니다.`,
                            `${actor.playerName}, 골밑까지 다이브했지만 레이업 마무리가 아쉽습니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 다이브했지만 덩크를 놓칩니다.`,
                            `${actor.playerName}, 헷지 수비가 회수했지만 덩크가 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 플로터로 헷지 수비를 넘기려 했지만 짧습니다.`,
                            `${actor.playerName}, 플로터 타이밍이 아쉽게 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 훅슛을 시도했지만 헷지 수비에 걸립니다.`,
                            `${actor.playerName}, 훅슛이 림을 맞고 튕겨 나옵니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트 점퍼가 헷지 수비에 살짝 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageRollText(hedgeRollMiss, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 헷지로 생긴 틈에서 쐈지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 팝아웃 3점 찬스였지만 아쉽게 벗어납니다.`,
                ]);
            }
        }
        if (pnrCoverage === 'blitz') {
            if (playType === 'PnR_Handler') {
                const blitzHandlerMiss: CoverageHandlerSet = {
                    threept: [
                        `${actor.playerName}, 더블팀을 빠져나와 쐈지만 3점이 빗나갑니다.`,
                        `${actor.playerName}, 블리츠를 피해 던진 3점이 아쉽게 벗어납니다.`,
                    ],
                    mid: [
                        `${actor.playerName}, 블리츠 더블팀에 막혀 억지 슛... 빗나갑니다.`,
                        `${actor.playerName}, 트랩 속에서 어려운 슛을 시도하지만 실패.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 더블팀을 뚫었지만 레이업이 빗나갑니다.`,
                            `${actor.playerName}, 트랩을 뚫고 들어갔지만 마무리가 아쉽습니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 더블팀을 뚫었지만 덩크를 놓칩니다.`,
                            `${actor.playerName}, 골밑까지 왔지만 덩크가 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 더블팀을 넘겼지만 플로터가 짧습니다.`,
                            `${actor.playerName}, 페인트까지 파고들었지만 플로터가 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 페인트까지 왔지만 훅슛이 림을 벗어납니다.`,
                            `${actor.playerName}, 훅슛 타이밍이 아쉽게 어긋납니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트까지 왔지만 점퍼가 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageHandlerText(blitzHandlerMiss, zone, shotType);
            }
            if (playType === 'PnR_Roll') {
                const blitzRollMiss: CoverageRollSet = {
                    mid: [
                        `${actor.playerName}, 더블팀 틈에서 쐈지만 미드레인지가 빗나갑니다.`,
                        `${actor.playerName}, 미드레인지 점퍼가 아쉽게 벗어납니다.`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 완전히 열린 틈이었지만 레이업을 놓칩니다.`,
                            `${actor.playerName}, 다이브했지만 레이업 마무리가 아쉽습니다.`,
                        ],
                        dunk: [
                            `${actor.playerName}, 완전히 열렸지만 덩크를 놓칩니다.`,
                            `${actor.playerName}, 다이브했지만 덩크가 무산됩니다.`,
                        ],
                    },
                    paint: {
                        floater: [
                            `${actor.playerName}, 플로터로 마무리하려 했지만 짧습니다.`,
                            `${actor.playerName}, 플로터 타이밍이 아쉽게 빗나갑니다.`,
                        ],
                        hook: [
                            `${actor.playerName}, 훅슛을 시도했지만 빗나갑니다.`,
                            `${actor.playerName}, 훅슛이 림을 맞고 튕겨 나옵니다.`,
                        ],
                        jumper: [
                            `${actor.playerName}, 페인트 점퍼가 살짝 짧습니다.`,
                            `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        ],
                    },
                };
                return pickCoverageRollText(blitzRollMiss, zone, shotType);
            }
            if (playType === 'PnR_Pop') {
                return pick([
                    `${actor.playerName}, 블리츠 수비가 만들어준 오픈 찬스였지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 더블팀이 풀리며 열렸지만 3점이 아쉽게 벗어납니다.`,
                ]);
            }
        }

        // [2026-08-03] SIM_CONFIG.BLOCK 확인 결과 블록은 4존(Rim/Paint/Mid/3PT) 전부에서 발생
        // 가능한데(3점은 확률 낮지만 nonzero) 기존엔 zone 구분 없이 "골밑 돌파" 류 문구가 미드/3점
        // 블록에도 그대로 나갔음 — Rim/Paint(돌파 계열) vs Mid/3PT(점퍼 계열)로 분리.
        if (isBlock && defender) {
            const isInterior = zone === 'Rim' || zone === 'Paint';
            if (isHelpPlay) {
                if (isInterior) {
                    return pick([
                        `위크사이드에서 넘어온 ${defender.playerName}, 완벽한 타이밍의 헬프 블락!`,
                        `${actor.playerName}의 골밑 시도, 헬프로 나온 ${defender.playerName}에게 걸립니다!`,
                        `${defender.playerName}, 자기 매치업을 버리고 넘어와 블락을 만들어냅니다!`
                    ]);
                }
                return pick([
                    `${defender.playerName}, 위크사이드에서 반응해 ${actor.playerName}의 점퍼를 그대로 쳐냅니다!`,
                    `${actor.playerName}의 미드레인지 슛, 헬프로 나온 ${defender.playerName}에게 걸립니다!`,
                    `${defender.playerName}, 자기 매치업을 버리고 넘어와 점퍼를 블락해냅니다!`
                ]);
            }
            if (isInterior) {
                return pick([
                    `${actor.playerName}의 슛, ${defender.playerName}에게 가로막힙니다! (블록)`,
                    `${defender.playerName}, ${actor.playerName}의 시도를 완벽하게 블록해냅니다!`,
                    `${actor.playerName} 골밑 돌파... ${defender.playerName}의 높이를 넘지 못합니다!`
                ]);
            }
            return pick([
                `${actor.playerName}의 점퍼, ${defender.playerName}가 그대로 걷어냅니다! (블록)`,
                `${defender.playerName}, ${actor.playerName}의 슛 타이밍을 완벽하게 읽고 블록!`,
                `${actor.playerName}, 컨테스트당한 슛이 ${defender.playerName}에게 걸립니다!`
            ]);
        }
        // [2026-08-03] SCORE와 동일 zone/슛타입 세분화. MISS 결과엔 assister 데이터 자체가 없어서
        // (possessionHandler.ts가 미스에 assister를 안 담음) 패서 언급 없이 슈터 단독 묘사만.
        if (playType === 'Transition') {
            const transitionMiss: TransitionTextSet = {
                threept: [
                    `${actor.playerName}, 속공 트레일링 3점을 시도했지만 빗나갑니다.`,
                    `${actor.playerName}, 빠른 전개 끝에 던진 3점이 아쉽게 벗어납니다.`,
                ],
                rim: {
                    layup: [
                        `${actor.playerName}, 속공 중 레이업을 서두르다 놓칩니다.`,
                        `${actor.playerName}, 빠른 속공이었지만 레이업이 빗나갑니다.`,
                    ],
                    dunk: [
                        `${actor.playerName}, 속공 중 덩크를 시도했지만 놓칩니다.`,
                        `${actor.playerName}, 빠른 전개 끝에 덩크가 무산됩니다.`,
                    ],
                },
                paint: {
                    floater: [
                        `${actor.playerName}, 속공 중 플로터를 시도했지만 짧습니다.`,
                        `${actor.playerName}, 빠른 전개 끝에 플로터가 빗나갑니다.`,
                    ],
                    jumper: [
                        `${actor.playerName}, 속공 중 페인트 점퍼가 짧습니다.`,
                        `${actor.playerName}, 빠른 전개 끝에 점퍼 타이밍이 어긋납니다.`,
                    ],
                },
            };
            return pickTransitionText(transitionMiss, zone === 'Mid' ? undefined : zone, shotType);
        }
        // [2026-08-03] SCORE와 동일하게 shotType(CatchShoot/Pullup) 기준 세분화.
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS 전체에 없어서 신규 추가(우선순위 체크).
        if (zone === '3PT') {
            if (isMismatch) {
                return pick([
                    `${actor.playerName}, 미스매치를 노렸지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 느린 수비를 앞에 두고 쐈지만 3점이 아쉽게 벗어납니다.`
                ]);
            }
            if (shotType === 'CatchShoot') {
                return pick([
                    `${actor.playerName}, 오픈 3점 찬스를 잡았지만 빗나갑니다.`,
                    `${actor.playerName}, 캐치 후 곧바로 던진 3점이 아쉽게 벗어납니다.`
                ]);
            }
            return pick([
                `${actor.playerName}, 회심의 3점슛... 림을 외면합니다.`,
                `${actor.playerName}, 3점 라인 밖에서 던져보지만 빗나갑니다.`,
                `${actor.playerName}의 3점 시도, 들어가지 않습니다.`
            ]);
        }
        // [2026-08-03] SCORE와 동일하게 덩크/레이업(팁인) 분리.
        if (playType === 'Putback') {
            if (shotType === 'Dunk') {
                return pick([
                    `${actor.playerName}, 풋백 덩크를 노렸지만 놓칩니다.`,
                    `${actor.playerName}, 리바운드 잡고 바로 덩크 시도... 무산됩니다.`,
                    `${actor.playerName}, 풋백 덩크 타이밍이 어긋납니다.`
                ]);
            }
            return pick([
                `${actor.playerName}, 풋백 시도... 림을 돕니다.`,
                `${actor.playerName}, 리바운드는 잡았으나 마무리가 아쉽습니다.`,
                `${actor.playerName}, 골밑 혼전 중 슛 실패.`
            ]);
        }
        // [2026-08-03] SCORE와 동일하게 canDunk 대신 실제 shotType 기준 Rim/Paint 세분화 — MISS는
        // 기존에 zone 구분 자체가 없어 Mid까지 한 풀에 섞여 있었음(이제 남은 폴백은 Mid 전용).
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS에 없어서 신규 추가(우선순위 체크).
        if ((zone === 'Rim' || zone === 'Paint') && isMismatch) {
            return pick([
                `${actor.playerName}, 미스매치를 공략했지만 마무리가 빗나갑니다.`,
                `${actor.playerName}, 느린 수비를 앞에 두고도 레이업을 놓칩니다.`,
                `${actor.playerName}, 미스매치 상대와의 승부에서 마무리를 놓칩니다.`
            ]);
        }
        if (zone === 'Rim' || zone === 'Paint') {
            const rimPaintMiss: CoverageRimPaintSet = {
                rim: {
                    layup: [
                        `${actor.playerName}의 슛이 림을 돌아 나옵니다.`,
                        `${actor.playerName}, 득점에 실패합니다.`,
                        `${actor.playerName}, 레이업을 놓치고 맙니다.`
                    ],
                    dunk: [
                        `${actor.playerName}, 덩크를 시도했지만 놓칩니다.`,
                        `${actor.playerName}, 강력한 덩크를 노렸지만 무산됩니다.`,
                        `${actor.playerName}, 덩크 타이밍이 어긋나며 무산됩니다.`
                    ]
                },
                paint: {
                    floater: [
                        `${actor.playerName}, 플로터를 띄웠지만 짧습니다.`,
                        `${actor.playerName}, 플로터가 림을 넘지 못합니다.`,
                        `${actor.playerName}, 플로터 타이밍이 어긋납니다.`
                    ],
                    hook: [
                        `${actor.playerName}, 훅슛을 시도했지만 빗나갑니다.`,
                        `${actor.playerName}, 훅슛이 림을 맞고 튕겨 나옵니다.`,
                        `${actor.playerName}, 훅슛 타이밍이 아쉽게 빗나갑니다.`
                    ],
                    jumper: [
                        `${actor.playerName}, 페인트 점퍼가 짧습니다.`,
                        `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        `${actor.playerName}, 페인트 점퍼가 짧게 떨어집니다.`
                    ]
                }
            };
            return pickRimPaintByShotType(rimPaintMiss, zone, shotType);
        }
        // [2026-08-03] SCORE와 동일하게 shotType(Jumper/Pullup) 기준 세분화 (여기 도달하는 건
        // 사실상 Mid 존뿐).
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS에 없어서 신규 추가(우선순위 체크).
        if (isMismatch) {
            return pick([
                `${actor.playerName}, 미스매치를 살리지 못하고 미드레인지 슛이 빗나갑니다.`,
                `${actor.playerName}, 느린 수비 앞에서도 점퍼가 짧습니다.`
            ]);
        }
        if (shotType === 'Pullup') {
            return pick([
                `${actor.playerName}, 쉬운 찬스를 놓치고 맙니다.`,
                `${actor.playerName}, 풀업 점퍼가 짧게 떨어집니다.`,
                `${actor.playerName}, 드리블 후 던진 슛이 아쉽게 벗어납니다.`
            ]);
        }
        return pick([
            `${actor.playerName}, 미드레인지에서 던진 슛이 빗나갑니다.`,
            `${actor.playerName}, 점퍼 타이밍이 아쉽게 어긋납니다.`,
            `${actor.playerName}, 패스를 받아 쐈지만 미드레인지 슛이 빗나갑니다.`
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
            if (isHelpPlay) {
                return pick([
                    `헬프로 나온 ${defender.playerName}, 드리블하는 ${actor.playerName}의 공을 그대로 걷어냅니다!`,
                    `${defender.playerName}, 도와주러 왔다가 아예 공을 뺏어버립니다!`,
                    `자기 매치업이 아닌데도, ${defender.playerName}의 손이 먼저 나갔습니다! 스틸!`
                ]);
            }
            return pick([
                `${defender.playerName}, ${actor.playerName}의 공을 가로챕니다! (스틸)`,
                `${defender.playerName}의 손질, 스틸에 성공합니다!`,
                `${actor.playerName}, 패스 길을 읽혔습니다. ${defender.playerName}의 스틸.`
            ]);
        }
        // [2026-08-03] "24초 바이얼레이션"/"오펜스 파울" 문구는 실제로 이 분기에 도달할 수 없는
        // 죽은 텍스트였음 — shotClockViolation/offensiveFoul은 applyPossessionResult에서 완전히
        // 별도 type으로 처리되고 각자 자기 커멘터리를 인라인으로 만들어서 generateCommentary('turnover',
        // ...)를 아예 안 거침. 이 폴백에 실제 도달하는 건 비강제 패스미스/볼핸들링 에러뿐이라 그
        // 계열로만 채움.
        return pick([
            `${actor.playerName}, 치명적인 패스 미스로 턴오버를 범합니다.`,
            `${actor.playerName}, 공을 놓치며 공격권을 넘겨줍니다.`,
            `${actor.playerName}, 무리한 패스가 그대로 빗나가며 턴오버를 범합니다.`,
            `${actor.playerName}, 드리블 도중 공을 놓치고 맙니다.`
        ]);
    }

    // --- 4. FOUL ---
    // [2026-08-03] nonShootingFoulRate(possessionHandler.ts)가 playType별로 다르게 가중되는데
    // (Iso/PnR_Handler/DriveKick↑, CatchShoot↓ — 돌파/포스트 몸싸움 vs 클로즈아웃 차이 반영)
    // 커멘터리는 그 playType을 안 쓰고 헬프/일반 2갈래뿐이었음 — 돌파/포스트/클로즈아웃 계열 추가.
    if (type === 'foul') {
        if (isHelpPlay && defender) {
            return pick([
                `${defender.playerName}, 헬프하러 나왔다가 ${actor.playerName}에게 파울을 범합니다.`,
                `위크사이드에서 도와준 ${defender.playerName}, 몸이 먼저 부딪히며 파울!`,
                `${defender.playerName}, 로테이션 수비 중 ${actor.playerName}과 접촉 — 파울이 선언됩니다.`
            ]);
        }
        if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
            return pick([
                `${defender?.playerName}, 돌파하는 ${actor.playerName}를 막다가 리치인 파울을 범합니다.`,
                `${actor.playerName}의 돌파를 막아서던 ${defender?.playerName}, 손이 먼저 나가며 파울!`,
                `${defender?.playerName}, 드라이브 저지 과정에서 몸이 부딪히며 파울이 선언됩니다.`
            ]);
        }
        if (playType === 'PostUp' || playType === 'PnR_Roll') {
            return pick([
                `${defender?.playerName}, 포스트에서 몸싸움하다 파울을 범합니다.`,
                `${actor.playerName}를 막던 ${defender?.playerName}, 골밑에서 미는 파울로 걸립니다.`,
                `${defender?.playerName}, 골밑 경합 중 무리한 접촉으로 파울이 선언됩니다.`
            ]);
        }
        if (playType === 'CatchShoot') {
            return pick([
                `${defender?.playerName}, 클로즈아웃하다 ${actor.playerName}에게 파울을 범합니다.`,
                `${actor.playerName}에게 급하게 다가선 ${defender?.playerName}, 파울성 접촉!`,
                `${defender?.playerName}, 슛 컨테스트 과정에서 몸이 부딪히며 파울이 선언됩니다.`
            ]);
        }
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
 * [2026-08-03] 테크니컬 파울 체크는 possessionHandler.ts에서 슛 계산(5단계)보다 훨씬 전,
 * 라이브볼 상황 중에 단순 확률 롤로 결정됨 — "왜" 받았는지 구분하는 필드 자체가 엔진에 없음.
 * 그런데 "득점 후 세레모니"/"경기 지연"/"자유투 방해"/"데드볼 몸싸움"처럼 이 트리거 상황과
 * 구조적으로 안 맞는(득점 후/데드볼/FT 컨텍스트를 전제하는) 4줄이 섞여 있어서 라이브볼
 * 상황에 맞는 문구로 교체. 이모지 프리픽스는 커멘터리에서 전부 제거.
 */
export function getTechnicalFoulCommentary(defender: LivePlayer): string {
    return pick([
        `${defender.playerName}, 판정에 거세게 항의하다 테크니컬 파울!`,
        `${defender.playerName}, 심판에게 과격한 제스처... 테크니컬 파울이 선언됩니다.`,
        `${defender.playerName}, 노콜 판정에 불만을 표출하다 테크니컬!`,
        `${defender.playerName}, 지속적인 어필 끝에 결국 테크니컬 파울을 받습니다.`,
        `${defender.playerName}, 심판과 언쟁 끝에 테크니컬 파울. 감정 조절이 필요합니다.`,
        `${defender.playerName}, 공을 바닥에 내리치다 테크니컬 파울!`,
        `${defender.playerName}, 좌절감을 이기지 못하고 공을 걷어차 테크니컬!`,
        `${defender.playerName}, 골대를 향해 공을 내던지며 테크니컬 파울.`,
        `${defender.playerName}, 상대 선수를 향한 도발 행위로 테크니컬!`,
        `${defender.playerName}, 몸싸움 중 상대를 향해 거친 말을 내뱉다 테크니컬!`,
        `${defender.playerName}, 상대 벤치를 향해 어그로를 끌다 테크니컬!`,
        `${defender.playerName}, 판정에 불만을 참지 못하고 코트에 침을 뱉다 테크니컬 파울.`,
        `${defender.playerName}, 벤치를 향해 손짓하며 항의하다 테크니컬!`,
        `${defender.playerName}, 심판과의 과도한 접근으로 테크니컬 파울!`,
        `${defender.playerName}, 상대 선수를 밀치며 말다툼 끝에 테크니컬 파울.`,
    ]);
}

/**
 * Flagrant 1 Commentary (12 variations)
 * [2026-08-03] 플래그런트도 테크니컬과 동일하게 possessionHandler.ts에서 슛/리바운드/플레이
 * 해석보다 먼저 독립 롤로 결정되지만, 이 시점에 selectedPlayType은 이미 정해져 있어서(로깅용으로만
 * 쓰이고 커멘터리엔 안 넘어가고 있었음) playType 기준으로 드라이브/포스트·스크린/속공 계열을
 * 실제 상황에 맞게 게이팅. 리바운드/블록 시도처럼 playType으로 못 거르는 항목은 기본 풀에 유지.
 * 이모지 프리픽스 제거.
 */
export function getFlagrant1Commentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType): string {
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${defender.playerName}, 돌파하는 ${actor.playerName}에게 과도한 신체 접촉! Flagrant 1.`,
            `${defender.playerName}, 레이업을 막으려다 ${actor.playerName}의 상체를 거칠게 밀칩니다. Flagrant 1.`,
        ]);
    }
    if (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'PnR_Pop' || playType === 'OffBallScreen') {
        return pick([
            `${defender.playerName}, 포스트 수비 중 ${actor.playerName}에게 불필요한 푸싱. Flagrant 1.`,
            `${defender.playerName}, 스크린 상황에서 ${actor.playerName}을 과격하게 밀칩니다. Flagrant 1 선언.`,
        ]);
    }
    if (playType === 'Transition') {
        return pick([
            `${defender.playerName}, 속공 중인 ${actor.playerName}의 유니폼을 잡아끕니다! Flagrant 1.`,
            `${defender.playerName}, 패스트브레이크를 끊으려 ${actor.playerName}을 감싸 안습니다. Flagrant 1.`,
        ]);
    }
    return pick([
        `${defender.playerName}, ${actor.playerName}의 슛 시도를 필요 이상으로 강하게 막아섭니다. Flagrant 1 선언.`,
        `${defender.playerName}, 블록을 시도하다 ${actor.playerName}의 얼굴을 가격합니다! Flagrant 1.`,
        `${defender.playerName}, 샷 블록 과정에서 ${actor.playerName}에게 과도한 팔로스루. Flagrant 1.`,
        `${defender.playerName}, 리바운드 경합에서 ${actor.playerName}을 팔꿈치로 밀어냅니다. Flagrant 1.`,
        `${defender.playerName}, 과도한 신체 접촉! 심판진 리뷰 결과 Flagrant 1.`,
        `${defender.playerName}, ${actor.playerName}에 대한 불필요한 접촉으로 Flagrant 1이 선언됩니다.`,
    ]);
}

/**
 * Flagrant 2 Commentary (10 variations)
 * [2026-08-03] Flagrant 1과 동일한 playType 게이팅. 기존 "데드볼 상황에서" 문구는 테크니컬 때와
 * 동일한 문제(라이브볼 트리거인데 데드볼을 전제)라 교체. 이모지 프리픽스 제거.
 */
export function getFlagrant2Commentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType): string {
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${defender.playerName}, 공중에서 ${actor.playerName}을 밀칩니다! Flagrant 2, 즉시 퇴장!`,
            `${defender.playerName}, 레이업 중인 ${actor.playerName}을 위험하게 밀어냅니다! Flagrant 2 퇴장!`,
        ]);
    }
    return pick([
        `${defender.playerName}, ${actor.playerName}에게 의도적인 엘보! Flagrant 2, 퇴장 처분!`,
        `${defender.playerName}, 스윙한 팔꿈치가 ${actor.playerName}의 얼굴을 강타! Flagrant 2!`,
        `${defender.playerName}, ${actor.playerName}을 거칠게 바닥에 끌어내립니다! Flagrant 2 퇴장!`,
        `${defender.playerName}, 말릴 수 없는 거친 파울! 심판진 리뷰 후 Flagrant 2 선언. 퇴장!`,
        `${defender.playerName}, 보복성 파울! ${actor.playerName}에게 과격한 접촉. Flagrant 2 퇴장!`,
        `${defender.playerName}, 리바운드 경합 중 ${actor.playerName}을 위험하게 밀쳐냅니다! Flagrant 2, 즉시 퇴장!`,
        `${defender.playerName}, 경기 흐름과 무관한 위험한 접촉! Flagrant 2, 즉각 퇴장 조치됩니다.`,
        `${defender.playerName}, 도저히 용납할 수 없는 플레이! 심판진 만장일치 Flagrant 2 퇴장!`,
    ]);
}
