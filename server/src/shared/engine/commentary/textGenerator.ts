
import type { LivePlayer } from '../pbp/pbpTypes.ts';
import type { PlayType } from '../../types.ts';
import type { PlayContext } from '../pbp/playTypes.ts';
import { iGa, eulReul, gwaWa } from './josa.ts';
import { getInjuryBodyPart, LOWER_BODY_PARTS } from '../injuryGrades.ts';

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/**
 * 킥아웃 커멘터리 풀 구조 — zone(3PT/Rim/Paint/Mid)에 더해 Rim은 레이업/덩크, Paint는
 * 플로터/훅슛/점퍼로 슛타입까지 세분화한다. (client 미러 참고)
 */
type KickoutTextSet = {
    threept: string[];
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; hook: string[]; jumper: string[] };
    mid: string[];
};

function pickKickoutText(
    set: KickoutTextSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined,
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
 * PnR 커버리지(Drop/Hedge/Blitz) 커멘터리 풀 구조. (client 미러 참고)
 */
type CoverageRimPaintSet = {
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; hook: string[]; jumper: string[] };
};
type CoverageRollSet = CoverageRimPaintSet & { mid: string[]; threept?: string[] };   // [2026-11-05] threept = 롤맨 팝아웃 3점 (client 미러 참조)
type CoverageHandlerSet = CoverageRollSet & { threept: string[] };

function pickRimPaintByShotType(
    set: CoverageRimPaintSet,
    zone: 'Rim' | 'Paint',
    shotType: PlayContext['shotType'] | undefined,
): string {
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    if (shotType === 'Hook') return pick(set.paint.hook);
    if (shotType === 'Jumper') return pick(set.paint.jumper);
    return pick(set.paint.floater);
}

function pickCoverageRollText(
    set: CoverageRollSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined,
): string {
    if (zone === '3PT' && set.threept) return pick(set.threept);   // [2026-11-05] 이전엔 3점도 미드레인지 문구
    if (zone === 'Rim' || zone === 'Paint') return pickRimPaintByShotType(set, zone, shotType);
    return pick(set.mid);
}

function pickCoverageHandlerText(
    set: CoverageHandlerSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined,
): string {
    if (zone === '3PT') return pick(set.threept);
    if (zone === 'Rim' || zone === 'Paint') return pickRimPaintByShotType(set, zone, shotType);
    return pick(set.mid);
}

/**
 * Transition(속공) 커멘터리 풀 구조. (client 미러 참고 — Mid 옵션 없음, 훅슛 없음, MISS엔
 * assister 데이터 자체가 없음)
 */
type TransitionTextSet = {
    threept: string[];
    rim: { layup: string[]; dunk: string[] };
    paint: { floater: string[]; hook: string[]; jumper: string[] };
    mid?: string[];   // [2026-11-05] 속공 미드레인지 풀업 — 이전엔 없어서 3점 문구로 떨어짐
};

function pickTransitionText(
    set: TransitionTextSet,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    shotType: PlayContext['shotType'] | undefined,
): string {
    if (zone === 'Mid' && set.mid) return pick(set.mid);
    if (zone === 'Rim') return pick(shotType === 'Dunk' ? set.rim.dunk : set.rim.layup);
    // [2026-10-18] 훅 허용 상황이 속공까지 넓어져 속공 훅 문구 추가(없으면 플로터 문구로 잘못 중계됨)
    if (zone === 'Paint') return pick(shotType === 'Hook' ? set.paint.hook : shotType === 'Jumper' ? set.paint.jumper : set.paint.floater);
    return pick(set.threept);
}

// [2026-08-03] client 미러 참고 — shooter/zone은 옵션(둘 다 호출부에 이미 있던 값이라 비용
// 없이 세분화): 공격 리바운드는 슈터 본인 캐치 vs 동료 캐치, 수비 리바운드는 3점 미스(롱리바운드)
// vs 인사이드 미스로 나눔.
export function getReboundCommentary(
    rebounder: LivePlayer,
    type: 'off' | 'def',
    shooter?: LivePlayer,
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT',
    close?: boolean,
): string {
    if (type === 'off') {
        // [2026-11-04] close(근거리/장거리) 분기 (client 미러 참조) — 장거리 공격 리바운드 뒤엔 공격을 다시 세팅하므로 "풋백 찬스" 류 문구 제외.
        // close 미지정이면 기존 문구 전체.
        const n = rebounder.playerName;
        if (shooter && rebounder.playerId === shooter.playerId) {
            const closeSelf = [
                `${n}, 자기 슛을 직접 쫓아가 리바운드로 따냅니다!`,
                `${n}, 골밑에서 자신의 미스를 리바운드로 되찾습니다.`,
            ];
            const longSelf = [
                `${n}, 길게 튄 자신의 미스를 직접 쫓아가 잡아냅니다!`,
                `${n}, 미스를 놓치지 않고 스스로 잡아내 공격을 다시 정비합니다.`,
            ];
            if (close === true) return pick(closeSelf);
            if (close === false) return pick(longSelf);
            return pick([closeSelf[0], `${n}, 미스를 놓치지 않고 스스로 잡아냅니다!`, closeSelf[1]]);
        }
        const closeOther = [
            `${n}, 천금같은 공격 리바운드를 잡아냅니다!`,
            `${n}, 골밑에서 집중력을 발휘해 공격권을 유지합니다.`,
            `${n}, 풋백 찬스를 노리며 리바운드를 따냅니다!`,
            `${n}, 림 바로 밑에서 공격 리바운드를 걷어냅니다!`,
        ];
        const longOther = [
            `${n}, 길게 튄 공격 리바운드를 잡아 공격을 다시 정비합니다.`,
            `${n}, 멀리 튄 공을 따내며 공격권을 이어갑니다.`,
            `${n}의 허슬! 롱리바운드를 살려 공격은 계속됩니다.`,
            `${n}, 공격 리바운드! 밖으로 빼서 다시 공격을 시작합니다.`,
        ];
        if (close === true) return pick(closeOther);
        if (close === false) return pick(longOther);
        return pick([
            `${n}, 천금같은 공격 리바운드를 잡아냅니다!`,
            `${n}, 공격 리바운드! 다시 공격 기회를 가져옵니다.`,
            `${n}, 골밑에서 집중력을 발휘해 공격권을 유지합니다.`,
            `${n}, 풋백 찬스를 노리며 리바운드를 따냅니다!`,
            `${n}의 허슬! 공격은 계속됩니다.`,
        ]);
    } else {
        if (zone === '3PT') {
            return pick([
                `${rebounder.playerName}, 멀리 튕겨 나온 공을 재빠르게 낚아챕니다!`,
                `${rebounder.playerName}, 롱리바운드를 놓치지 않고 잡아냅니다!`,
                `${rebounder.playerName}, 3점 미스가 길게 튀자 반응해 리바운드 확보!`,
            ]);
        }
        return pick([
            `${rebounder.playerName}, 안정적으로 수비 리바운드 확보.`,
            `${rebounder.playerName}, 리바운드로 상대 공격을 끊어냅니다.`,
            `${rebounder.playerName}, 높이를 지배하며 수비 리바운드 성공.`,
            `${rebounder.playerName}, 박스아웃 후 깔끔한 리바운드.`,
        ]);
    }
}

// [Fix 2026-08-05] 자유투 실패 후 리바운드 전용 커멘터리(client 미러 참조) — getReboundCommentary()는
// 필드골 zone 기준(골밑/3점 롱리바운드) 문구라 자유투 맥락과 안 맞았음. 오펜시브(동료)/오펜시브(슈터
// 본인)/디펜시브 3갈래로 분리.
export function getFreeThrowReboundCommentary(
    rebounder: LivePlayer,
    type: 'off' | 'def',
    shooter: LivePlayer,
    close?: boolean,
): string {
    if (type === 'off') {
        // [2026-11-04] close(근거리/장거리) 분기 (client 미러 참조). 슈터 본인 리바운드는 자유투 라인에서 잡는 장거리.
        const n = rebounder.playerName;
        if (rebounder.playerId === shooter.playerId) {
            return pick([
                `${n}, 자기 자유투 미스를 직접 쫓아가 잡아냅니다!`,
                `${n}, 놓친 자유투를 스스로 리바운드로 되찾습니다.`,
                `${n}, 아쉬운 자유투를 만회하듯 직접 공격 리바운드를 챙깁니다.`,
            ]);
        }
        const closeOther = [
            `${n}, 놓친 자유투를 그대로 공격 리바운드로 연결합니다.`,
            `${n}, 몸싸움 끝에 자유투 리바운드를 걷어냅니다.`,
            `${n}, 레인 안쪽 몸싸움을 이겨내고 자유투 리바운드를 따냅니다!`,
        ];
        const longOther = [
            `${n}, 자유투 라인 근처에서 공격 리바운드를 낚아챕니다!`,
            `${n}, 자유투 미스를 틈타 공격권을 지켜냅니다!`,
            `${n}, 길게 튄 자유투 리바운드를 잡아 공격을 다시 정비합니다.`,
        ];
        if (close === true) return pick(closeOther);
        if (close === false) return pick(longOther);
        return pick([longOther[0], closeOther[0], longOther[1], closeOther[1]]);
    }
    return pick([
        `${rebounder.playerName}, 자유투 리바운드를 안정적으로 걷어냅니다.`,
        `${rebounder.playerName}, 놓친 자유투를 깔끔하게 수비 리바운드로 마무리합니다.`,
        `${rebounder.playerName}, 자유투 미스 리바운드를 잡아내며 공수 전환을 준비합니다.`,
        `${rebounder.playerName}, 박스아웃 후 자유투 리바운드 확보.`,
    ]);
}

export function generateCommentary(
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow',
    actor: LivePlayer,
    defender: LivePlayer | undefined,
    assister: LivePlayer | undefined,
    playType: PlayType | undefined,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    flags: { isSwitch?: boolean; isMismatch?: boolean; isBotchedSwitch?: boolean; isBlock?: boolean; isSteal?: boolean; points?: number; pnrCoverage?: 'drop' | 'hedge' | 'blitz'; isHelpPlay?: boolean; isKickout?: boolean; isEndRush?: boolean },
    // [2026-08-03] client 미러(services/game/engine/commentary/textGenerator.ts)와 동일 — 슛타입별
    // 세분화 코멘터리 콘텐츠 작업을 위한 배선만 먼저 반영, 콘텐츠는 다음 작업에서 채움.
    shotType?: PlayContext['shotType'],
): string {
    const { isMismatch, isBotchedSwitch, isBlock, isSteal, points = 0, pnrCoverage, isHelpPlay, isKickout, isEndRush } = flags;

    if (type === 'score') {
        const scoreTag = ` (+${points})`;

        // --- PostUp/PnR_Roll/Iso/PnR_Handler Kickout Commentary (client 미러 참고) ---
        // [2026-08-03] zone + shotType(레이업/덩크/플로터/훅슛/점퍼)까지 세분화. 킥아웃 마무리
        // context를 'post'로 고쳐(playTypes.ts) 훅슛도 나올 수 있게 만든 뒤 반영.
        if (isKickout && assister && (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'Iso' || playType === 'PnR_Handler')) {
            const kickoutScoreText: Record<string, KickoutTextSet> = {
                PostUp: {
                    threept: [
                        `${assister.playerName}, 더블팀을 유인한 뒤 침착한 킥아웃! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${assister.playerName}, 포스트에서 수비를 끌어들이고 코너로 킥아웃 — ${actor.playerName}의 3점 시도... 성공!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 포스트에서 만들어준 오픈 찬스! 3점 꽂힙니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${iGa(actor.playerName)} ${assister.playerName}의 바운드 패스를 받아 레이업을 올려놓습니다.${scoreTag}`,
                            `${assister.playerName}, 더블팀을 피해 쇄도하는 ${actor.playerName}에게 패스를 넣어줍니다! ${actor.playerName}의 멋진 리버스 레이업!${scoreTag}`,
                            `${assister.playerName}, 수비 사이로 패스를 주었고···, 엄청난 행타임을 보여주는 ${actor.playerName}의 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}의 컷인 덩크! 좋은 공간 지각 능력을 보여줍니다! (${assister.playerName} 어시스트)${scoreTag}`,
                            `${assister.playerName}, 쇄도하는 ${actor.playerName}에게 랍 패스···. ${iGa(actor.playerName)} 시원한 덩크를 꽂았습니다!${scoreTag}`,
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
                            `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 침착하게 페인트 점퍼 적중!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 포스트업 중 더블팀을 유도한 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 포스트에서 만들어준 공간에서 미드레인지 점퍼 시도···. 성공합니다!${scoreTag}`,
                    ],
                },
                PnR_Roll: {
                    threept: [
                        `${assister.playerName}, 림으로 다이브하다가 수비가 몰리자 그대로 킥아웃! ${actor.playerName}의 3점 적중!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 골밑에서 만들어준 오픈 찬스 — 3점 꽂힙니다!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, ${iGa(assister.playerName)} 다이브하다 빼준 패스를 받아 레이업으로 마무리!${scoreTag}`,
                            `${assister.playerName}, 림으로 다이브하다 수비가 몰리자 컷인하는 ${actor.playerName}에게 패스 — 깔끔한 레이업!${scoreTag}`,
                        ],
                        dunk: [
                            `${assister.playerName}, 림으로 다이브하다 반대편으로 패스 — ${iGa(actor.playerName)} 그대로 꽂아 넣는 덩크!${scoreTag}`,
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
                            `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 다이브하며 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
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
                            `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 1대1 승부 중 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
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
                            `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 페인트 점퍼를 꽂습니다!${scoreTag}`,
                        ],
                    },
                    mid: [
                        `${assister.playerName}, 픽앤롤에서 수비를 끌어들인 뒤 킥아웃 — ${actor.playerName}의 미드레인지 적중!${scoreTag}`,
                        `${actor.playerName}, ${iGa(assister.playerName)} 만들어준 공간에서 미드레인지 점퍼 시도··· 성공합니다!${scoreTag}`,
                    ],
                },
            };
            return pickKickoutText(kickoutScoreText[playType], zone, shotType);
        }

        // [2026-08-03] client 미러 참고 — Drop/Hedge/Blitz × (Handler 4존 + Roll 3존 + Pop 3점고정) 전체.
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 3점을 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 3점 적중!${scoreTag}`,
                    ],
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 3점을 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 3점 적중!${scoreTag}`,
                    ],
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 3점을 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 3점 적중!${scoreTag}`,
                    ],
                    mid: [
                        `${actor.playerName}, 더블팀이 걸린 사이 미드레인지 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 수비가 완전히 몰린 틈에 미드레인지 적중!${scoreTag}`,
                    ],
                    rim: {
                        layup: [
                            `${actor.playerName}, 더블팀 틈을 타 골밑 프리! 이지 레이업!${scoreTag}`,
                            `${assister?.playerName || '핸들러'}의 패스, 블리츠 빈 공간으로 ${iGa(actor.playerName)} 다이브해 레이업 성공!${scoreTag}`,
                        ],
                        dunk: [
                            `${actor.playerName}, 더블팀이 완전히 몰린 사이 강력한 덩크!${scoreTag}`,
                            `${assister?.playerName || '핸들러'}의 패스, 블리츠 빈 공간으로 ${iGa(actor.playerName)} 덩크로 마무리!${scoreTag}`,
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
                return pick([
                    `${actor.playerName}, 블리츠 수비 사이로 와이드 오픈 3점! 적중!${scoreTag}`,
                    `${actor.playerName}, 더블팀이 풀리며 열린 3점 라인에서 슛! 꽂힙니다!${scoreTag}`,
                ]);
            }
        }

        // --- Transition (속공) --- [2026-08-03] client 미러 참고 — zone+슛타입 세분화.
        // [2026-11-05] 피리어드 막판 밀고 올라가기(데드볼 인바운드 시작) — 수비가 서 있어 속공이 아님, 시간에 쫓긴 공격으로 묘사 (client 미러 참조)
        if (playType === 'Transition' && isEndRush) {
            const a = actor.playerName;
            const endRushScore: TransitionTextSet = {
                mid: [`${a}, 시간에 쫓겨 몰고 올라가 던진 풀업 점퍼가 들어갑니다!${scoreTag}`, `${a}, 남은 몇 초를 놓치지 않고 미드레인지 점퍼 성공!${scoreTag}`],
                threept: [`${a}, 남은 시간이 없어 몰고 올라가 던진 3점! 들어갑니다!${scoreTag}`, `${a}, 시간에 쫓기며 던진 3점이 그물을 가릅니다!${scoreTag}`],
                rim: {
                    layup: [`${a}, 남은 시간 동안 단숨에 코트를 가로질러 레이업 성공!${scoreTag}`, `${a}, 서둘러 골밑까지 파고들어 레이업을 올려놓습니다!${scoreTag}`],
                    dunk: [`${a}, 시간에 쫓기는 가운데 그대로 밀고 들어가 덩크!${scoreTag}`, `${a}, 남은 몇 초에 골밑까지 질주해 덩크를 꽂습니다!${scoreTag}`],
                },
                paint: {
                    floater: [`${a}, 서둘러 밀고 들어가 플로터 성공!${scoreTag}`],
                    hook: [`${a}, 시간에 쫓겨 페인트까지 밀고 들어가 훅슛 성공!${scoreTag}`],
                    jumper: [`${a}, 서둘러 밀고 들어가 짧은 점퍼를 꽂습니다!${scoreTag}`],
                },
            };
            return pickTransitionText(endRushScore, zone, shotType);
        }
        if (playType === 'Transition' && assister) {
            const transitionScore: TransitionTextSet = {
                mid: [
                    `${assister.playerName}의 아웃렛을 받은 ${actor.playerName}, 속공 중 풀업 점퍼를 꽂습니다!${scoreTag}`,
                    `${actor.playerName}, 빠른 전개 끝에 미드레인지 점퍼 성공.${scoreTag}`,
                ],
                threept: [
                    `${assister.playerName}, 속공 상황에서 길게 뿌린 패스 — ${actor.playerName}의 트레일링 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 속공 중 트레일러로 따라붙어 3점 적중!${scoreTag}`,
                    `빠른 전개 끝에 ${actor.playerName}, 여유 있게 3점을 꽂습니다!${scoreTag}`,
                ],
                rim: {
                    layup: [
                        `${assister.playerName}, 속공 상황에서 정확한 패스 — ${actor.playerName}의 레이업 성공!${scoreTag}`,
                        `${actor.playerName}, 홀로 코트를 가로질러 레이업으로 마무리!${scoreTag}`,
                        `${assister.playerName}의 아웃렛 패스, ${iGa(actor.playerName)} 그대로 레이업으로 연결합니다!${scoreTag}`,
                    ],
                    dunk: [
                        `${assister.playerName}, 속공 상황에서 띄워주는 패스 — ${actor.playerName}의 시원한 덩크!${scoreTag}`,
                        `${actor.playerName}, 혼자 질주해 강력한 덩크로 마무리!${scoreTag}`,
                        `${assister.playerName}, 길게 뿌린 패스를 받은 ${iGa(actor.playerName)} 그대로 덩크를 꽂습니다!${scoreTag}`,
                    ],
                },
                paint: {
                    floater: [
                        `${assister.playerName}, 속공 상황에서 패스 — ${actor.playerName}의 부드러운 플로터!${scoreTag}`,
                        `${actor.playerName}, 혼자 질주하다 수비를 피해 플로터로 마무리!${scoreTag}`,
                    ],
                    hook: [
                        `${assister.playerName}, 속공 상황에서 패스 — ${actor.playerName}의 훅슛이 그물을 가릅니다!${scoreTag}`,
                        `${actor.playerName}, 속공으로 페인트까지 밀고 들어가 훅슛으로 마무리!${scoreTag}`,
                    ],
                    jumper: [
                        `${assister.playerName}, 속공 상황에서 패스 — ${actor.playerName}의 짧은 페인트 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 속공 중 페인트에서 점퍼를 꽂습니다!${scoreTag}`,
                    ],
                },
            };
            return pickTransitionText(transitionScore, zone, shotType);
        }

        // [2026-08-03] client 미러 참고 — shotType(CatchShoot/Pullup) 기준 재구성.
        if (zone === '3PT') {
            if (isBotchedSwitch) {
                return pick([
                    `${actor.playerName}, 완벽한 오픈 찬스입니다! 3점 적중!${scoreTag}`,
                    `${actor.playerName}, 수비가 없는 틈을 타 3점슛을 꽂아 넣습니다!${scoreTag}`,
                    `${actor.playerName}, 와이드 오픈 3점! 그물을 가릅니다.${scoreTag}`,
                ]);
            }
            if (isMismatch) {
                return pick([
                    `${actor.playerName}, 미스매치를 활용해 3점슛을 성공시킵니다!${scoreTag}`,
                    `${actor.playerName}, 수비를 앞에 두고 과감한 3점! 들어갑니다!${scoreTag}`,
                ]);
            }
            if (shotType === 'CatchShoot' && assister) {
                return pick([
                    `${assister.playerName}의 패스를 받아, ${actor.playerName}의 3점슛!${scoreTag}`,
                    `${assister.playerName}의 킥아웃, ${iGa(actor.playerName)} 3점으로 마무리합니다!${scoreTag}`,
                    `${actor.playerName}, ${assister.playerName}의 도움을 받아 외곽포 가동!${scoreTag}`,
                ]);
            }
            return pick([
                `${actor.playerName}, 아크 정면에서 3점슛... 꽂힙니다!${scoreTag}`,
                `${actor.playerName}, 장거리 3점포를 터뜨립니다!${scoreTag}`,
                `${actor.playerName}의 3점슛이 림을 통과합니다.${scoreTag}`,
                `${actor.playerName}, 드리블 후 스텝백 3점! 들어갑니다!${scoreTag}`,
            ]);
        }

        if (zone === 'Rim' || zone === 'Paint') {
            // [2026-08-03] client 미러 참고 — 풋백은 zone이 항상 Rim, shotType도 Dunk/Layup만
            // 나옴(context='putback'이 나머지 걸러냄) — 덩크/레이업(팁인)만 분리.
            if (playType === 'Putback' && (zone === 'Rim' || zone === 'Paint')) {   // [2026-11-05] 풋백 뒤 킥아웃 점퍼엔 일반 문구
                if (shotType === 'Dunk') {
                    return pick([
                        `${actor.playerName}, 리바운드를 잡자마자 그대로 꽂아 넣습니다!${scoreTag}`,
                        `${actor.playerName}, 풋백 덩크! 세컨드 찬스를 화끈하게 살립니다!${scoreTag}`,
                        `${actor.playerName}, 공중에서 잡아 바로 덩크로 연결합니다!${scoreTag}`,
                    ]);
                }
                return pick([
                    `${actor.playerName}, 공격 리바운드 후 바로 올려놓습니다!${scoreTag}`,
                    `${actor.playerName}, 팁인 성공! 세컨드 찬스를 살립니다.${scoreTag}`,
                    `${actor.playerName}, 골밑 집중력! 리바운드에 이은 골밑슛 성공.${scoreTag}`,
                ]);
            }
            // [2026-08-03] client 미러 참고 — canDunk(속성 기반 추정치) 대신 실제 shotType 기준.
            if ((playType === 'PnR_Roll' || playType === 'Cut') && shotType === 'Dunk' && assister) {
                return pick([
                    `${iGa(assister.playerName)} 띄워주고, ${iGa(actor.playerName)} 앨리웁으로 찍어 누릅니다!${scoreTag}`,
                    `${assister.playerName}의 환상적인 패스, ${actor.playerName}의 덩크 마무리!${scoreTag}`,
                    `${assister.playerName}, 하이라이트 필름 감이네요 — ${actor.playerName}의 앨리웁 덩크!${scoreTag}`,
                ]);
            }
            if (isMismatch) {
                // [2026-11-05] 슛 종류별 미스매치 문구 (client 미러 참조) — 이전엔 플로터·훅·점퍼·덩크에도 "레이업"·"골밑" 문구
                const mmName = actor.playerName;
                if (zone === 'Rim' && shotType === 'Dunk') return pick([
                    `${mmName}, 미스매치를 공략해 그대로 덩크를 꽂습니다!${scoreTag}`,
                    `${mmName}, 작은 수비수를 앞에 두고 강하게 찍어 누릅니다!${scoreTag}`,
                ]);
                if (zone === 'Rim') return pick([
                    `${mmName}, 느린 수비를 제치고 골밑 득점 성공.${scoreTag}`,
                    `${mmName}, 미스매치를 공략하여 레이업을 올려놓습니다.${scoreTag}`,
                    `${mmName}, 미스매치 상대를 가볍게 제치고 골밑 마무리.${scoreTag}`,
                ]);
                if (shotType === 'Hook') return pick([
                    `${mmName}, 작은 수비수 위로 훅슛을 올려 성공시킵니다.${scoreTag}`,
                    `${mmName}, 미스매치를 살려 페인트에서 훅슛 적중.${scoreTag}`,
                ]);
                if (shotType === 'Jumper') return pick([
                    `${mmName}, 미스매치를 살려 페인트에서 점퍼를 꽂습니다.${scoreTag}`,
                    `${mmName}, 작은 수비수를 앞에 두고 짧은 점퍼 성공.${scoreTag}`,
                ]);
                return pick([
                    `${mmName}, 미스매치를 공략해 플로터를 띄웁니다. 성공!${scoreTag}`,
                    `${mmName}, 느린 수비를 앞에 두고 부드러운 플로터 성공.${scoreTag}`,
                ]);
            }
            const rimPaintScore: CoverageRimPaintSet = {
                rim: {
                    layup: [
                        `${actor.playerName}, 골밑 혼전 상황에서 집중력을 발휘해 득점.${scoreTag}`,
                        `${actor.playerName}, 유려한 스텝으로 레이업 성공!${scoreTag}`,
                        `${actor.playerName}, 컨택을 이겨내고 골밑슛을 성공시킵니다.${scoreTag}`,
                    ],
                    dunk: [
                        `${actor.playerName}, 호쾌한 슬램덩크! 수비가 반응하지 못합니다!${scoreTag}`,
                        `${actor.playerName}, 림을 부술 듯한 강력한 원핸드 덩크!${scoreTag}`,
                        `${actor.playerName}, 베이스라인 돌파 후 투핸드 슬램!${scoreTag}`,
                    ],
                },
                paint: {
                    floater: [
                        `${actor.playerName}의 플로터... 부드럽게 림을 통과합니다.${scoreTag}`,
                        `${actor.playerName}, 수비 사이로 플로터를 띄웁니다. 성공!${scoreTag}`,
                        `${actor.playerName}, 타이밍 좋은 플로터로 페인트를 공략합니다!${scoreTag}`,
                    ],
                    hook: [
                        `${actor.playerName}, 페인트에서 훅슛으로 마무리!${scoreTag}`,
                        `${actor.playerName}, 수비를 등지고 훅슛을 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 부드러운 터치의 훅슛이 그물을 가릅니다!${scoreTag}`,
                    ],
                    jumper: [
                        `${actor.playerName}, 짧은 페인트 점퍼 성공!${scoreTag}`,
                        `${actor.playerName}, 페인트에서 정확한 점퍼를 꽂습니다!${scoreTag}`,
                        `${actor.playerName}, 페인트에서 침착하게 점퍼를 올려놓습니다!${scoreTag}`,
                    ],
                },
            };
            return pickRimPaintByShotType(rimPaintScore, zone, shotType);
        }

        // [2026-08-03] client 미러 참고 — shotType(Jumper/Pullup) 기준 세분화.
        // [2026-08-03] isMismatch가 SCORE에만 있고 미드는 안 봐서 신규 추가.
        if (isMismatch) {
            return pick([
                `${actor.playerName}, 미스매치를 활용해 미드레인지 점퍼를 성공시킵니다!${scoreTag}`,
                `${actor.playerName}, 느린 수비를 앞에 두고 여유 있게 미드레인지 적중!${scoreTag}`,
                `${actor.playerName}, 미스매치 상대를 상대로 침착하게 점퍼 성공.${scoreTag}`,
            ]);
        }
        if (shotType === 'Pullup') {
            return pick([
                `${actor.playerName}, 드리블 후 풀업 점퍼! 적중합니다.${scoreTag}`,
                `${actor.playerName}, 수비를 제치고 던진 슛이 들어갑니다.${scoreTag}`,
                `${actor.playerName}, 스텝백 점퍼로 수비를 따돌리고 득점!${scoreTag}`,
            ]);
        }
        if (assister) {
            return pick([
                `${actor.playerName}, 깔끔한 미드레인지 점퍼 성공.${scoreTag}`,
                `${actor.playerName}, 자유투 라인 부근에서 점퍼를 꽂습니다.${scoreTag}`,
                `${assister.playerName}의 패스를 받아, ${iGa(actor.playerName)} 미드레인지에서 침착하게 마무리!${scoreTag}`,
            ]);
        }
        return pick([
            `${actor.playerName}, 깔끔한 미드레인지 점퍼 성공.${scoreTag}`,
            `${actor.playerName}, 자유투 라인 부근에서 점퍼를 꽂습니다.${scoreTag}`,
        ]);
    }

    if (type === 'miss') {
        // --- PostUp/PnR_Roll/Iso/PnR_Handler Kickout Commentary (client 미러 참고) ---
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
                            `${assister.playerName}, 더블팀을 뚫고 ${actor.playerName}에게 완벽한 기회를 만들어주었지만 ${iGa(actor.playerName)} 레이업에 실패합니다!`,
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
                        `${iGa(assister.playerName)} 포스트에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
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
                            `${assister.playerName}의 킥아웃, ${iGa(actor.playerName)} 레이업을 시도했지만 림을 맞고 나옵니다.`,
                            `${actor.playerName}, ${assister.playerName}의 패스를 받아 쇄도했지만 레이업이 짧습니다.`,
                        ],
                        dunk: [
                            `${assister.playerName}의 패스는 좋았지만, ${iGa(actor.playerName)} 덩크를 놓칩니다.`,
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
                        `${iGa(assister.playerName)} 골밑에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
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
                            `${assister.playerName}의 패스는 좋았지만, ${iGa(actor.playerName)} 덩크를 놓칩니다.`,
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
                        `${iGa(assister.playerName)} 아이솔레이션에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
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
                            `${assister.playerName}의 패스는 좋았지만, ${iGa(actor.playerName)} 덩크를 놓칩니다.`,
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
                        `${iGa(assister.playerName)} 픽앤롤에서 만들어준 공간, ${actor.playerName}의 점퍼가 빗나갑니다.`,
                        `${actor.playerName}, 좋은 패스를 받았지만 미드레인지 시도는 빗나갑니다.`,
                    ],
                },
            };
            return pickKickoutText(kickoutMissText[playType], zone, shotType);
        }

        // [2026-08-03] client 미러 참고 — Drop/Hedge/Blitz × (Handler 4존 + Roll 3존 + Pop 3점고정) 전체.
        if (pnrCoverage === 'drop' && !isBlock) {   // [2026-11-05] 블록이면 블록 문구로(이전엔 커버리지 실패 문구가 먼저 → 블록 언급 없음, client 미러 참조)
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 던진 3점이 빗나갑니다.`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 던진 3점이 림을 외면합니다.`,
                    ],
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
                return pick([
                    `${actor.playerName}, 드랍 수비가 열어준 공간에서 쐈지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 완전히 열린 팝아웃 찬스였지만 3점이 아쉽게 벗어납니다.`,
                ]);
            }
        }
        if (pnrCoverage === 'hedge' && !isBlock) {   // [2026-11-05] 블록이면 블록 문구로(이전엔 커버리지 실패 문구가 먼저 → 블록 언급 없음, client 미러 참조)
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 던진 3점이 빗나갑니다.`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 던진 3점이 림을 외면합니다.`,
                    ],
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
                return pick([
                    `${actor.playerName}, 헷지로 생긴 틈에서 쐈지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 팝아웃 3점 찬스였지만 아쉽게 벗어납니다.`,
                ]);
            }
        }
        if (pnrCoverage === 'blitz' && !isBlock) {   // [2026-11-05] 블록이면 블록 문구로(이전엔 커버리지 실패 문구가 먼저 → 블록 언급 없음, client 미러 참조)
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
                    threept: [
                        `${actor.playerName}, 롤 대신 팝아웃해 던진 3점이 빗나갑니다.`,
                        `${actor.playerName}, 스크린 후 외곽으로 빠져 던진 3점이 림을 외면합니다.`,
                    ],
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
            if (playType === 'PnR_Pop' && zone === '3PT') { // [2026-10-18] pop can be Mid now — 3PT-only text
                return pick([
                    `${actor.playerName}, 블리츠 수비가 만들어준 오픈 찬스였지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 더블팀이 풀리며 열렸지만 3점이 아쉽게 벗어납니다.`,
                ]);
            }
        }
        // [2026-08-03] client 미러 참고 — 블록은 4존 전부에서 발생 가능하므로 Rim/Paint(돌파
        // 계열) vs Mid/3PT(점퍼 계열)로 분리.
        if (isBlock && defender) {
            const isInterior = zone === 'Rim' || zone === 'Paint';
            if (isHelpPlay) {
                if (isInterior) {
                    return pick([
                        `위크사이드에서 넘어온 ${defender.playerName}, 완벽한 타이밍의 헬프 블락!`,
                        `${actor.playerName}의 골밑 시도, 헬프로 나온 ${defender.playerName}에게 걸립니다!`,
                        `${defender.playerName}, 자기 매치업을 버리고 넘어와 블락을 만들어냅니다!`,
                    ]);
                }
                return pick([
                    `${defender.playerName}, 위크사이드에서 반응해 ${actor.playerName}의 점퍼를 그대로 쳐냅니다!`,
                    `${actor.playerName}의 미드레인지 슛, 헬프로 나온 ${defender.playerName}에게 걸립니다!`,
                    `${defender.playerName}, 자기 매치업을 버리고 넘어와 점퍼를 블락해냅니다!`,
                ]);
            }
            if (isInterior) {
                return pick([
                    `${actor.playerName}의 슛, ${defender.playerName}에게 가로막힙니다! (블록)`,
                    `${defender.playerName}, ${actor.playerName}의 시도를 완벽하게 블록해냅니다!`,
                    `${actor.playerName} 골밑 돌파... ${defender.playerName}의 높이를 넘지 못합니다!`,
                ]);
            }
            return pick([
                `${actor.playerName}의 점퍼, ${iGa(defender.playerName)} 그대로 걷어냅니다! (블록)`,
                `${defender.playerName}, ${actor.playerName}의 슛 타이밍을 완벽하게 읽고 블록!`,
                `${actor.playerName}, 컨테스트당한 슛이 ${defender.playerName}에게 걸립니다!`,
            ]);
        }
        // [2026-08-03] client 미러 참고 — assister 데이터가 없어 슈터 단독 묘사만.
        if (playType === 'Transition' && isEndRush) {   // [2026-11-05] 피리어드 막판 밀고 올라가기(위 SCORE 참조) (client 미러 참조)
            const a = actor.playerName;
            const endRushMiss: TransitionTextSet = {
                mid: [`${a}, 시간에 쫓겨 던진 풀업 점퍼가 빗나갑니다.`],
                threept: [`${a}, 남은 시간이 없어 몰고 올라가 던진 3점이 빗나갑니다.`, `${a}, 시간에 쫓기며 던진 3점이 림을 외면합니다.`],
                rim: {
                    layup: [`${a}, 서둘러 골밑까지 파고들었지만 레이업이 빗나갑니다.`],
                    dunk: [`${a}, 시간에 쫓겨 밀고 들어갔지만 덩크가 무산됩니다.`],
                },
                paint: {
                    floater: [`${a}, 서둘러 던진 플로터가 짧습니다.`],
                    hook: [`${a}, 시간에 쫓겨 올린 훅슛이 림을 돌아 나옵니다.`],
                    jumper: [`${a}, 서둘러 던진 점퍼가 빗나갑니다.`],
                },
            };
            return pickTransitionText(endRushMiss, zone, shotType);
        }
        if (playType === 'Transition') {
            const transitionMiss: TransitionTextSet = {
                mid: [
                    `${actor.playerName}, 속공 중 던진 풀업 점퍼가 빗나갑니다.`,
                    `${actor.playerName}, 빠른 전개 끝에 던진 미드레인지가 짧습니다.`,
                ],
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
                    hook: [
                        `${actor.playerName}, 속공 중 훅슛을 올렸지만 림을 돌아 나옵니다.`,
                        `${actor.playerName}, 빠른 전개 끝에 던진 훅슛이 빗나갑니다.`,
                    ],
                    jumper: [
                        `${actor.playerName}, 속공 중 페인트 점퍼가 짧습니다.`,
                        `${actor.playerName}, 빠른 전개 끝에 점퍼 타이밍이 어긋납니다.`,
                    ],
                },
            };
            return pickTransitionText(transitionMiss, zone, shotType);
        }
        // [2026-08-03] client 미러 참고 — shotType(CatchShoot/Pullup) 기준 세분화.
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS엔 없어서 신규 추가.
        if (zone === '3PT') {
            if (isMismatch) {
                return pick([
                    `${actor.playerName}, 미스매치를 노렸지만 3점이 빗나갑니다.`,
                    `${actor.playerName}, 느린 수비를 앞에 두고 쐈지만 3점이 아쉽게 벗어납니다.`,
                ]);
            }
            if (shotType === 'CatchShoot') {
                return pick([
                    `${actor.playerName}, 오픈 3점 찬스를 잡았지만 빗나갑니다.`,
                    `${actor.playerName}, 캐치 후 곧바로 던진 3점이 아쉽게 벗어납니다.`,
                ]);
            }
            return pick([
                `${actor.playerName}, 회심의 3점슛... 림을 외면합니다.`,
                `${actor.playerName}, 3점 라인 밖에서 던져보지만 빗나갑니다.`,
                `${actor.playerName}의 3점 시도, 들어가지 않습니다.`,
            ]);
        }
        // [2026-08-03] client 미러 참고 — 덩크/레이업(팁인) 분리.
        if (playType === 'Putback' && (zone === 'Rim' || zone === 'Paint')) {   // [2026-11-05] 풋백 뒤 킥아웃 점퍼엔 일반 문구
            if (shotType === 'Dunk') {
                return pick([
                    `${actor.playerName}, 풋백 덩크를 노렸지만 놓칩니다.`,
                    `${actor.playerName}, 리바운드 잡고 바로 덩크 시도... 무산됩니다.`,
                    `${actor.playerName}, 풋백 덩크 타이밍이 어긋납니다.`,
                ]);
            }
            return pick([
                `${actor.playerName}, 풋백 시도... 림을 돕니다.`,
                `${actor.playerName}, 리바운드는 잡았으나 마무리가 아쉽습니다.`,
                `${actor.playerName}, 골밑 혼전 중 슛 실패.`,
            ]);
        }
        // [2026-08-03] client 미러 참고 — canDunk 대신 실제 shotType 기준 Rim/Paint 세분화(남은
        // 폴백은 Mid 전용).
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS엔 없어서 신규 추가.
        if ((zone === 'Rim' || zone === 'Paint') && isMismatch) {
            // [2026-11-05] 슛 종류별 미스매치 문구 (client 미러 참조)
            const mmName = actor.playerName;
            if (zone === 'Rim' && shotType === 'Dunk') return pick([
                `${mmName}, 미스매치를 노린 덩크가 림을 맞고 튕겨 나옵니다.`,
                `${mmName}, 작은 수비수를 앞에 두고 찍었지만 덩크가 무산됩니다.`,
            ]);
            if (zone === 'Rim') return pick([
                `${mmName}, 미스매치를 공략했지만 마무리가 빗나갑니다.`,
                `${mmName}, 느린 수비를 앞에 두고도 레이업을 놓칩니다.`,
                `${mmName}, 미스매치 상대와의 승부에서 마무리를 놓칩니다.`,
            ]);
            if (shotType === 'Hook') return pick([
                `${mmName}, 미스매치를 노린 훅슛이 림을 벗어납니다.`,
                `${mmName}, 작은 수비수 위로 올린 훅슛이 짧습니다.`,
            ]);
            if (shotType === 'Jumper') return pick([
                `${mmName}, 미스매치를 노렸지만 페인트 점퍼가 빗나갑니다.`,
                `${mmName}, 작은 수비수 앞에서 던진 짧은 점퍼가 림을 돕니다.`,
            ]);
            return pick([
                `${mmName}, 미스매치를 노린 플로터가 짧습니다.`,
                `${mmName}, 미스매치를 공략했지만 플로터가 림을 벗어납니다.`,
            ]);
        }
        if (zone === 'Rim' || zone === 'Paint') {
            const rimPaintMiss: CoverageRimPaintSet = {
                rim: {
                    layup: [
                        `${actor.playerName}의 슛이 림을 돌아 나옵니다.`,
                        `${actor.playerName}, 득점에 실패합니다.`,
                        `${actor.playerName}, 레이업을 놓치고 맙니다.`,
                    ],
                    dunk: [
                        `${actor.playerName}, 덩크를 시도했지만 놓칩니다.`,
                        `${actor.playerName}, 강력한 덩크를 노렸지만 무산됩니다.`,
                        `${actor.playerName}, 덩크 타이밍이 어긋나며 무산됩니다.`,
                    ],
                },
                paint: {
                    floater: [
                        `${actor.playerName}, 플로터를 띄웠지만 짧습니다.`,
                        `${actor.playerName}, 플로터가 림을 넘지 못합니다.`,
                        `${actor.playerName}, 플로터 타이밍이 어긋납니다.`,
                    ],
                    hook: [
                        `${actor.playerName}, 훅슛을 시도했지만 빗나갑니다.`,
                        `${actor.playerName}, 훅슛이 림을 맞고 튕겨 나옵니다.`,
                        `${actor.playerName}, 훅슛 타이밍이 아쉽게 빗나갑니다.`,
                    ],
                    jumper: [
                        `${actor.playerName}, 페인트 점퍼가 짧습니다.`,
                        `${actor.playerName}, 페인트 점퍼 타이밍이 어긋납니다.`,
                        `${actor.playerName}, 페인트 점퍼가 짧게 떨어집니다.`,
                    ],
                },
            };
            return pickRimPaintByShotType(rimPaintMiss, zone, shotType);
        }
        // [2026-08-03] client 미러 참고 — shotType(Jumper/Pullup) 기준 세분화.
        // [2026-08-03] isMismatch가 SCORE에만 있고 MISS엔 없어서 신규 추가.
        if (isMismatch) {
            return pick([
                `${actor.playerName}, 미스매치를 살리지 못하고 미드레인지 슛이 빗나갑니다.`,
                `${actor.playerName}, 느린 수비 앞에서도 점퍼가 짧습니다.`,
            ]);
        }
        if (shotType === 'Pullup') {
            return pick([
                `${actor.playerName}, 쉬운 찬스를 놓치고 맙니다.`,
                `${actor.playerName}, 풀업 점퍼가 짧게 떨어집니다.`,
                `${actor.playerName}, 드리블 후 던진 슛이 아쉽게 벗어납니다.`,
            ]);
        }
        return pick([
            `${actor.playerName}, 미드레인지에서 던진 슛이 빗나갑니다.`,
            `${actor.playerName}, 점퍼 타이밍이 아쉽게 어긋납니다.`,
            `${actor.playerName}, 패스를 받아 쐈지만 미드레인지 슛이 빗나갑니다.`,
        ]);
    }

    if (type === 'turnover') {
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
                    `자기 매치업이 아닌데도, ${defender.playerName}의 손이 먼저 나갔습니다! 스틸!`,
                ]);
            }
            return pick([
                `${defender.playerName}, ${actor.playerName}의 공을 가로챕니다!`,
                `${defender.playerName}의 손질, 스틸에 성공합니다!`,
                `${actor.playerName}, 패스 길을 읽혔습니다. ${defender.playerName}의 스틸.`,
            ]);
        }
        // [2026-08-03] client 미러 참고 — "24초 바이얼레이션"/"오펜스 파울" 문구는 실제로
        // 도달 불가능(shotClockViolation/offensiveFoul은 완전 별도 type이라 여길 안 거침).
        return pick([
            `${actor.playerName}, 치명적인 패스 미스로 턴오버를 범합니다.`,
            `${actor.playerName}, 공을 놓치며 공격권을 넘겨줍니다.`,
            `${actor.playerName}, 무리한 패스가 그대로 빗나가며 턴오버를 범합니다.`,
            `${actor.playerName}, 드리블 도중 공을 놓치고 맙니다.`,
        ]);
    }

    // [2026-08-03] client 미러 참고 — playType별 파울 확률 가중(nonShootingFoulRate)에 맞춰
    // 돌파/포스트/클로즈아웃 계열 추가.
    if (type === 'foul') {
        if (isHelpPlay && defender) {
            return pick([
                `${defender.playerName}, 헬프하러 나왔다가 ${actor.playerName}에게 파울을 범합니다.`,
                `위크사이드에서 도와준 ${defender.playerName}, 몸이 먼저 부딪히며 파울!`,
                `${defender.playerName}, 로테이션 수비 중 ${gwaWa(actor.playerName)} 접촉 — 파울이 선언됩니다.`,
            ]);
        }
        if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
            return pick([
                `${defender?.playerName}, 돌파하는 ${eulReul(actor.playerName)} 막다가 리치인 파울을 범합니다.`,
                `${actor.playerName}의 돌파를 막아서던 ${defender?.playerName}, 손이 먼저 나가며 파울!`,
                `${defender?.playerName}, 드라이브 저지 과정에서 몸이 부딪히며 파울이 선언됩니다.`,
            ]);
        }
        if (playType === 'PostUp' || playType === 'PnR_Roll') {
            return pick([
                `${defender?.playerName}, 포스트에서 몸싸움하다 파울을 범합니다.`,
                `${eulReul(actor.playerName)} 막던 ${defender?.playerName}, 골밑에서 미는 파울로 걸립니다.`,
                `${defender?.playerName}, 골밑 경합 중 무리한 접촉으로 파울이 선언됩니다.`,
            ]);
        }
        if (playType === 'CatchShoot') {
            return pick([
                `${defender?.playerName}, 클로즈아웃하다 ${actor.playerName}에게 파울을 범합니다.`,
                `${actor.playerName}에게 급하게 다가선 ${defender?.playerName}, 파울성 접촉!`,
                `${defender?.playerName}, 슛 컨테스트 과정에서 몸이 부딪히며 파울이 선언됩니다.`,
            ]);
        }
        return pick([
            `${defender?.playerName}, ${actor.playerName}에게 수비 반칙을 범합니다.`,
            `${defender?.playerName}, 돌파하는 ${eulReul(actor.playerName)} 막다가 파울.`,
            `${defender?.playerName}의 푸싱 파울이 선언됩니다.`,
        ]);
    }

    return `${actor.playerName}, 플레이를 펼칩니다.`;
}

// [2026-08-03] client 미러 참고 — 이모지 프리픽스 제거(커멘터리 전체 정책).
export function getTechnicalFoulCommentary(defender: LivePlayer, foulerTeamHasBall?: boolean): string {
    // [2026-11-04] 공을 다루는 문구(내리치다·걷어차·내던지며)는 공을 가진 팀 선수에게만 (client 미러 참조) —
    // 스틸당한 직후 상대 팀 선수가 "골대를 향해 공을 내던지며" 같은 줄이 찍혔다(현 엔진 테크니컬의 ~12%).
    // foulerTeamHasBall 미지정이면 기존처럼 15문장 전체.
    const general = [
        `${defender.playerName}, 판정에 거세게 항의하다 테크니컬 파울!`,
        `${defender.playerName}, 심판에게 과격한 제스처... 테크니컬 파울이 선언됩니다.`,
        `${defender.playerName}, 노콜 판정에 불만을 표출하다 테크니컬!`,
        `${defender.playerName}, 지속적인 어필 끝에 결국 테크니컬 파울을 받습니다.`,
        `${defender.playerName}, 심판과 언쟁 끝에 테크니컬 파울. 감정 조절이 필요합니다.`,
        `${defender.playerName}, 상대 선수를 향한 도발 행위로 테크니컬!`,
        `${defender.playerName}, 몸싸움 중 상대를 향해 거친 말을 내뱉다 테크니컬!`,
        `${defender.playerName}, 상대 벤치를 향해 어그로를 끌다 테크니컬!`,
        `${defender.playerName}, 판정에 불만을 참지 못하고 코트에 침을 뱉다 테크니컬 파울.`,
        `${defender.playerName}, 벤치를 향해 손짓하며 항의하다 테크니컬!`,
        `${defender.playerName}, 심판과의 과도한 접근으로 테크니컬 파울!`,
        `${defender.playerName}, 상대 선수를 밀치며 말다툼 끝에 테크니컬 파울.`,
    ];
    const ballHandling = [
        `${defender.playerName}, 공을 바닥에 내리치다 테크니컬 파울!`,
        `${defender.playerName}, 좌절감을 이기지 못하고 공을 걷어차 테크니컬!`,
        `${defender.playerName}, 골대를 향해 공을 내던지며 테크니컬 파울.`,
    ];
    return pick(foulerTeamHasBall === false ? general : [...general, ...ballHandling]);
}

// [2026-08-03] client 미러 참고 — playType(드라이브/포스트·스크린/속공) 게이팅 + 이모지 제거.
export function getFlagrant1Commentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType, zone?: 'Rim' | 'Paint' | 'Mid' | '3PT', shotType?: PlayContext['shotType']): string {
    // [2026-11-04] zone/shotType 추가 (client 미러 참조) — playType만 보면 아이솔 3점 시도에 "레이업을 막으려다"처럼
    // 실제 슛과 다른 문구가 나왔다(킥아웃·풀업이 많아 플레이 이름과 슛 위치가 자주 다름). 속공 저지는 슛 위치와 무관한
    // 문구라 먼저 처리하고, 그 외엔 슛 위치·종류로 풀을 고른다. zone이 없으면 기존 playType 분기.
    const d = defender.playerName;
    const a = actor.playerName;
    if (playType === 'Transition') {
        return pick([
            `${d}, 속공 중인 ${a}의 유니폼을 잡아끕니다! 플래그런트 1.`,
            `${d}, 패스트브레이크를 끊으려 ${eulReul(a)} 감싸 안습니다. 플래그런트 1.`,
        ]);
    }
    if (zone) {
        const shotNeutral = [
            `${d}, ${a}의 슛 시도를 필요 이상으로 강하게 막아섭니다. 플래그런트 1 선언.`,
            `${d}, 과도한 신체 접촉! 심판진 리뷰 결과 플래그런트 1.`,
            `${d}, ${a}에 대한 불필요한 접촉으로 플래그런트 1이 선언됩니다.`,
        ];
        if (zone === '3PT') {
            return pick([
                `${d}, 3점을 던진 ${a}의 착지 공간으로 뛰어듭니다! 플래그런트 1.`,
                `${d}, ${a}의 3점 슛 동작에 무리하게 몸을 던져 충돌합니다. 플래그런트 1 선언.`,
                ...shotNeutral,
            ]);
        }
        if (zone === 'Mid') {
            return pick([
                `${d}, 점퍼를 올라가는 ${a}의 착지 공간을 침범합니다! 플래그런트 1.`,
                `${d}, ${a}의 점퍼를 막으려다 팔로 얼굴을 가격합니다. 플래그런트 1.`,
                ...shotNeutral,
            ]);
        }
        if (playType === 'PostUp' || playType === 'PnR_Roll') {
            return pick([
                `${d}, 포스트 수비 중 ${a}에게 불필요한 푸싱. 플래그런트 1.`,
                `${d}, 골밑에서 ${a}의 슛 동작을 거칠게 끌어내립니다. 플래그런트 1 선언.`,
                ...shotNeutral,
            ]);
        }
        if (shotType === 'Dunk') {
            return pick([
                `${d}, 덩크를 시도하는 ${a}의 몸을 공중에서 밀칩니다! 플래그런트 1.`,
                `${d}, ${a}의 덩크를 막으려다 팔을 휘둘러 얼굴을 가격합니다. 플래그런트 1.`,
                ...shotNeutral,
            ]);
        }
        if (zone === 'Paint') {
            return pick([
                `${d}, 페인트로 파고든 ${a}에게 과도한 신체 접촉! 플래그런트 1.`,
                `${d}, ${a}의 페인트 슛을 막으려다 팔로 얼굴을 가격합니다. 플래그런트 1.`,
                ...shotNeutral,
            ]);
        }
        const isDrive = playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick';
        return pick([
            isDrive ? `${d}, 돌파하는 ${a}에게 과도한 신체 접촉! 플래그런트 1.` : `${d}, 골밑으로 들어오는 ${a}에게 과도한 신체 접촉! 플래그런트 1.`,
            `${d}, 레이업을 막으려다 ${a}의 상체를 거칠게 밀칩니다. 플래그런트 1.`,
            ...shotNeutral,
        ]);
    }
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${d}, 돌파하는 ${a}에게 과도한 신체 접촉! 플래그런트 1.`,
            `${d}, 레이업을 막으려다 ${a}의 상체를 거칠게 밀칩니다. 플래그런트 1.`,
        ]);
    }
    if (playType === 'PostUp' || playType === 'PnR_Roll' || playType === 'PnR_Pop' || playType === 'OffBallScreen') {
        return pick([
            `${d}, 포스트 수비 중 ${a}에게 불필요한 푸싱. 플래그런트 1.`,
            `${d}, 스크린 상황에서 ${eulReul(a)} 과격하게 밀칩니다. 플래그런트 1 선언.`,
        ]);
    }
    return pick([
        `${d}, ${a}의 슛 시도를 필요 이상으로 강하게 막아섭니다. 플래그런트 1 선언.`,
        `${d}, 블록을 시도하다 ${a}의 얼굴을 가격합니다! 플래그런트 1.`,
        `${d}, 샷 블록 과정에서 ${a}에게 과도한 팔로스루. 플래그런트 1.`,
        `${d}, 리바운드 경합에서 ${eulReul(a)} 팔꿈치로 밀어냅니다. 플래그런트 1.`,
        `${d}, 과도한 신체 접촉! 심판진 리뷰 결과 플래그런트 1.`,
        `${d}, ${a}에 대한 불필요한 접촉으로 플래그런트 1이 선언됩니다.`,
    ]);
}

// [2026-08-03] client 미러 참고 — playType 게이팅 + "데드볼 상황" 문구(테크니컬과 동일 문제) 교체
// + 이모지 제거.
export function getFlagrant2Commentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType, zone?: 'Rim' | 'Paint' | 'Mid' | '3PT', shotType?: PlayContext['shotType']): string {
    // [2026-11-04] zone/shotType 추가 (client 미러 참조) — 플래그런트 1과 같은 문제(아이솔 3점 시도에 "레이업 중인").
    // 플래그런트는 공격 시작 시점의 독립 판정이라 "리바운드 경합 중" 문구는 zone 경로에서 제외. zone이 없으면 기존 분기.
    const d = defender.playerName;
    const a = actor.playerName;
    if (zone) {
        const neutral = [
            `${d}, ${a}에게 의도적인 엘보! 플래그런트 2, 퇴장 처분!`,
            `${d}, 스윙한 팔꿈치가 ${a}의 얼굴을 강타! 플래그런트 2, 퇴장!`,
            `${d}, 말릴 수 없는 거친 파울! 심판진 리뷰 후 플래그런트 2 선언. 퇴장!`,
            `${d}, 보복성 파울! ${a}에게 과격한 접촉. 플래그런트 2 퇴장!`,
            `${d}, 경기 흐름과 무관한 위험한 접촉! 플래그런트 2, 즉각 퇴장 조치됩니다.`,
            `${d}, 도저히 용납할 수 없는 플레이! 심판진 만장일치 플래그런트 2 퇴장!`,
        ];
        if (playType === 'Transition') {
            return pick([
                `${d}, 속공으로 달려가는 ${a}의 뒤에서 위험하게 몸을 던집니다! 플래그런트 2, 즉시 퇴장!`,
                ...neutral,
            ]);
        }
        if (zone === '3PT') {
            return pick([
                `${d}, 3점을 던진 ${a}의 착지 공간으로 위험하게 파고듭니다! 플래그런트 2, 즉시 퇴장!`,
                `${d}, 공중에 뜬 3점 슈터의 발밑으로 들어갑니다! ${a}, 그대로 착지에 실패합니다. 플래그런트 2 퇴장!`,
                ...neutral,
            ]);
        }
        if (zone === 'Mid') {
            return pick([
                `${d}, 점퍼를 던진 ${a}의 착지 공간을 위험하게 침범합니다! 플래그런트 2, 즉시 퇴장!`,
                ...neutral,
            ]);
        }
        if (playType === 'PostUp' || playType === 'PnR_Roll') {
            return pick([
                `${d}, 골밑에서 ${a}의 상체를 감아 바닥으로 끌어내립니다! 플래그런트 2 퇴장!`,
                ...neutral,
            ]);
        }
        if (shotType === 'Dunk') {
            return pick([
                `${d}, 덩크를 시도하는 ${a}의 다리를 공중에서 걷어냅니다! 플래그런트 2 퇴장!`,
                `${d}, 공중에서 ${a}의 몸을 밀칩니다! 플래그런트 2, 즉시 퇴장!`,
                ...neutral,
            ]);
        }
        if (zone === 'Paint') {
            return pick([
                `${d}, 페인트에서 슛을 올라가는 ${a}의 몸을 공중에서 밀칩니다! 플래그런트 2, 즉시 퇴장!`,
                ...neutral,
            ]);
        }
        return pick([
            `${d}, 공중에서 ${a}의 몸을 밀칩니다! 플래그런트 2, 즉시 퇴장!`,
            `${d}, 레이업을 올라가는 ${a}의 몸을 위험하게 밀어냅니다! 플래그런트 2 퇴장!`,
            ...neutral,
        ]);
    }
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${d}, 공중에서 ${eulReul(a)} 밀칩니다! 플래그런트 2, 즉시 퇴장!`,
            `${d}, 레이업 중인 ${eulReul(a)} 위험하게 밀어냅니다! 플래그런트 2 퇴장!`,
        ]);
    }
    return pick([
        `${d}, ${a}에게 의도적인 엘보! 플래그런트 2, 퇴장 처분!`,
        `${d}, 스윙한 팔꿈치가 ${a}의 얼굴을 강타! 플래그런트 2, 퇴장!`,
        `${d}, ${eulReul(a)} 거칠게 바닥에 끌어내립니다! 플래그런트 2 퇴장!`,
        `${d}, 말릴 수 없는 거친 파울! 심판진 리뷰 후 플래그런트 2 선언. 퇴장!`,
        `${d}, 보복성 파울! ${a}에게 과격한 접촉. 플래그런트 2 퇴장!`,
        `${d}, 리바운드 경합 중 ${eulReul(a)} 위험하게 밀쳐냅니다! 플래그런트 2, 즉시 퇴장!`,
        `${d}, 경기 흐름과 무관한 위험한 접촉! 플래그런트 2, 즉각 퇴장 조치됩니다.`,
        `${d}, 도저히 용납할 수 없는 플레이! 심판진 만장일치 플래그런트 2 퇴장!`,
    ]);
}


/**
 * Shooting Foul Commentary — 비슈팅 파울(generateCommentary 'foul')과 동일한 톤/playType 게이팅.
 * [2026-10-07] 슈팅 파울·앤드원이 자유투/득점 로그에 접혀 파울자 이름이 안 나오던 문제 —
 * statsMappers가 독립 foul 로그("이름, 파울 내용. (선수 N반칙, 팀 N반칙)")를 찍을 때 사용.
 * isAndOne이면 "득점 인정 + 추가 자유투" 문맥의 문장 풀을 쓴다.
 */
export function getShootingFoulCommentary(defender: LivePlayer, actor: LivePlayer, playType?: PlayType, isHelpPlay?: boolean, isAndOne?: boolean, zone?: 'Rim' | 'Paint' | 'Mid' | '3PT', shotType?: PlayContext['shotType']): string {
    const d = defender.playerName;
    const a = actor.playerName;
    if (isAndOne) {
        return pick([
            `${d}, 득점을 막지 못한 채 ${a}에게 파울까지 범합니다. 바스켓 카운트!`,
            `${a}의 슛이 들어가는 순간 ${d}의 접촉 — 앤드원이 선언됩니다.`,
            `${d}, 뒤늦은 컨테스트로 ${a}에게 파울. 득점 인정에 추가 자유투까지 내줍니다.`,
        ]);
    }
    if (isHelpPlay) {
        return pick([
            `${d}, 헬프하러 나왔다가 슛 동작 중인 ${a}에게 파울을 범합니다.`,
            `위크사이드에서 도와준 ${d}, 슈터와 부딪히며 슈팅 파울!`,
            `${d}, 로테이션 수비 중 ${a}의 슛 동작에 접촉 — 슈팅 파울이 선언됩니다.`,
        ]);
    }
    // [2026-11-04] 자유투 개수는 zone(3PT면 3개)으로 정해지는데 문구는 playType만 봐서, 포스트업 킥아웃 3점·아이솔 풀업 3점
    // 파울에 "골밑 슛 컨테스트"·"레이업을 막아서던"이 붙었다(NBA Active 3구 자유투의 29%) (client 미러 참조).
    // 슛 위치·종류로 풀을 고르고 playType은 같은 위치 안에서 표현만 가른다. 3점 문구엔 전부 "3점"을 넣어 자유투 3개와 맞춘다.
    // zone이 없으면 기존 playType 분기.
    if (zone === '3PT') {
        if (shotType === 'Pullup') {
            return pick([
                `${d}, 풀업 3점을 올라가는 ${a}의 팔을 치며 슈팅 파울!`,
                `${a}의 스텝백 3점에 손을 뻗은 ${d}, 슈팅 파울이 선언됩니다.`,
                `${d}, 드리블 후 던지는 ${a}의 3점 슛 동작에 접촉 — 슈팅 파울!`,
            ]);
        }
        return pick([
            `${d}, 클로즈아웃하다 3점 슛 동작 중인 ${a}에게 파울을 범합니다.`,
            `${a}의 3점슛에 급하게 달려든 ${d}, 착지 공간을 침범하며 슈팅 파울!`,
            `${d}, 3점 슛 컨테스트 과정에서 슈터의 팔을 건드리며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (zone === 'Mid') {
        if (playType === 'PostUp') {
            return pick([
                `${d}, 포스트에서 돌아서며 점퍼를 던지는 ${a}의 팔을 치며 슈팅 파울!`,
                `${a}의 페이드어웨이를 막던 ${d}, 손이 먼저 나가며 슈팅 파울.`,
            ]);
        }
        if (shotType === 'Pullup') {
            return pick([
                `${d}, 풀업 점퍼를 올라가는 ${a}의 팔을 치며 슈팅 파울!`,
                `${a}의 미드레인지 풀업을 막던 ${d}, 손이 먼저 나가며 슈팅 파울.`,
            ]);
        }
        return pick([
            `${a}의 미드레인지 점퍼에 급하게 달려든 ${d}, 착지 공간을 침범하며 슈팅 파울!`,
            `${d}, 점퍼 컨테스트 과정에서 슈터의 팔을 건드리며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (zone === 'Paint') {
        if (shotType === 'Hook') {
            return pick([
                `${d}, 훅슛을 올리는 ${a}의 팔을 내리치며 슈팅 파울!`,
                `${a}의 훅슛을 막던 ${d}, 무리한 접촉으로 슈팅 파울이 선언됩니다.`,
            ]);
        }
        if (shotType === 'Jumper') {
            return pick([
                `${d}, 페인트 점퍼를 올라가는 ${a}의 팔에 걸리며 슈팅 파울.`,
                `${a}의 페인트 점퍼를 막던 ${d}, 몸이 부딪히며 슈팅 파울!`,
            ]);
        }
        return pick([
            `${d}, 플로터를 띄우는 ${a}의 팔을 치며 슈팅 파울!`,
            `${a}의 플로터를 막아서던 ${d}, 몸이 부딪히며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (zone === 'Rim') {
        if (playType === 'PostUp' || playType === 'PnR_Roll') {
            return pick([
                `${d}, 포스트에서 올라가는 ${eulReul(a)} 잡아채며 슈팅 파울을 범합니다.`,
                `${a}의 골밑 슛을 막던 ${d}, 팔을 내리치며 파울로 걸립니다.`,
                `${d}, 골밑 슛 컨테스트 중 무리한 접촉으로 슈팅 파울이 선언됩니다.`,
            ]);
        }
        if (shotType === 'Dunk') {
            return pick([
                `${d}, 덩크를 시도하는 ${a}의 팔을 내리치며 슈팅 파울!`,
                `${a}의 덩크를 막으려던 ${d}, 몸이 부딪히며 슈팅 파울이 선언됩니다.`,
            ]);
        }
        if (playType === 'Transition') {
            return pick([
                `${a}의 속공 레이업을 뒤쫓아 막던 ${d}, 슈팅 파울!`,
                `${d}, 속공 마무리를 올라가는 ${gwaWa(a)} 충돌하며 슈팅 파울이 선언됩니다.`,
            ]);
        }
        if (playType === 'Putback') {
            return pick([
                `${d}, 풋백을 올리는 ${gwaWa(a)} 엉키며 슈팅 파울!`,
                `${a}의 세컨드 찬스 마무리를 막던 ${d}, 팔에 걸리며 슈팅 파울.`,
            ]);
        }
        if (playType === 'Cut') {
            return pick([
                `${d}, 컷인해 레이업을 올리는 ${gwaWa(a)} 부딪히며 슈팅 파울!`,
                `${a}의 레이업을 막아서던 ${d}, 팔에 걸리며 슈팅 파울!`,
            ]);
        }
        return pick([
            `${d}, 돌파 후 올라가는 ${eulReul(a)} 막다가 슈팅 파울을 범합니다.`,
            `${a}의 레이업을 막아서던 ${d}, 팔에 걸리며 슈팅 파울!`,
            `${d}, 드라이브 피니시 과정에서 몸이 부딪히며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (playType === 'Iso' || playType === 'PnR_Handler' || playType === 'DriveKick') {
        return pick([
            `${d}, 돌파 후 올라가는 ${eulReul(a)} 막다가 슈팅 파울을 범합니다.`,
            `${a}의 레이업을 막아서던 ${d}, 팔에 걸리며 슈팅 파울!`,
            `${d}, 드라이브 피니시 과정에서 몸이 부딪히며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (playType === 'PostUp' || playType === 'PnR_Roll') {
        return pick([
            `${d}, 포스트에서 올라가는 ${eulReul(a)} 잡아채며 슈팅 파울을 범합니다.`,
            `${a}의 골밑 슛을 막던 ${d}, 팔을 내리치며 파울로 걸립니다.`,
            `${d}, 골밑 슛 컨테스트 중 무리한 접촉으로 슈팅 파울이 선언됩니다.`,
        ]);
    }
    if (playType === 'CatchShoot' || playType === 'PnR_Pop' || playType === 'OffBallScreen') {
        return pick([
            `${d}, 클로즈아웃하다 슛 동작 중인 ${a}에게 파울을 범합니다.`,
            `${a}의 점퍼에 급하게 달려든 ${d}, 착지 공간을 침범하며 슈팅 파울!`,
            `${d}, 슛 컨테스트 과정에서 슈터의 팔을 건드리며 슈팅 파울이 선언됩니다.`,
        ]);
    }
    return pick([
        `${d}, 슛 동작 중인 ${a}에게 슈팅 파울을 범합니다.`,
        `${a}의 슛을 막아서던 ${d}, 파울.`,
        `${d}의 슈팅 파울이 선언됩니다.`,
    ]);
}

/**
 * [2026-10-23] 풀코트 프레스 단계에서 끝난 포세션 커멘터리 (client/server 미러).
 * trapSteal: 트랩 스틸 / trapFoul: 트랩 중 파울 / pressTurnover: 1대1 압박 턴오버 / pressFoul: 1대1 리치인.
 */
export function getPressCommentary(event: 'trapSteal' | 'trapFoul' | 'pressTurnover' | 'pressFoul', actor: LivePlayer, defender: LivePlayer | undefined, isSteal: boolean): string {
    const d = defender?.playerName ?? '수비';
    switch (event) {
        case 'trapSteal':
            return pick([
                `풀코트 트랩에 갇힌 ${actor.playerName}, ${d}에게 공을 빼앗깁니다!`,
                `사이드라인 트랩! ${d}, ${actor.playerName}의 공을 낚아챕니다.`,
                `${actor.playerName}, 하프라인을 넘기 전에 더블팀에 걸려 ${d}에게 스틸을 허용합니다.`,
            ]);
        case 'trapFoul':
            return pick([
                `트랩을 걸던 ${d}, ${gwaWa(actor.playerName)} 접촉하며 파울이 선언됩니다.`,
                `${d}, 백코트 트랩 과정에서 손이 먼저 나가 파울을 범합니다.`,
            ]);
        case 'pressTurnover':
            return isSteal
                ? pick([
                    `${d}의 끈질긴 전방 압박! ${actor.playerName}의 드리블을 털어냅니다.`,
                    `${actor.playerName}, 백코트에서 ${d}에게 공을 빼앗깁니다.`,
                ])
                : pick([
                    `${d}의 전방 압박에 쫓긴 ${actor.playerName}, 공을 흘리며 턴오버.`,
                    `${actor.playerName}, 프레스를 피하려다 패스가 라인 밖으로 나갑니다.`,
                ]);
        case 'pressFoul':
            return pick([
                `${d}, 백코트에서 ${eulReul(actor.playerName)} 압박하다 리치인 파울을 범합니다.`,
                `전방 압박을 하던 ${d}, ${actor.playerName}에게 손을 뻗다 파울.`,
            ]);
    }
}

/**
 * [2026-11-05] 상황별 클락 운영 안내 줄 (client 미러 참조) — timeEngine이 정한 clockMode를 liveEngine이 포세션 시작 시각으로 기록.
 * region = 팀 연고지(statsMappers.regionOf).
 */
export function getClockManagementCommentary(
    mode: 'lastShot' | 'fullClock' | 'twoForOne' | 'hurry' | 'milk' | 'milkMax',
    region: string,
): string {
    switch (mode) {
        case 'lastShot':
            return pick([
                `${region}, 마지막 슛을 노리며 시간을 흘려보냅니다.`,
                `${region}, 공을 돌리며 마지막 공격을 준비합니다.`,
            ]);
        case 'fullClock':
            return pick([
                `${region}, 샷클락을 끝까지 쓰며 공격을 전개합니다.`,
                `${region}, 서두르지 않고 샷클락을 모두 사용합니다.`,
            ]);
        case 'twoForOne':
            return pick([
                `${region}, 2-for-1을 노리고 빠르게 공격합니다.`,
                `${region}, 한 번 더 공격하기 위해 서둘러 슛 기회를 찾습니다.`,
            ]);
        case 'hurry':
            return pick([
                `${region}, 시간이 없습니다 — 빠르게 공격을 전개합니다.`,
                `${region}, 쫓기는 입장에서 서둘러 공격합니다.`,
            ]);
        case 'milk':
            return pick([
                `${region}, 리드를 지키며 샷클락을 길게 씁니다.`,
                `${region}, 서두르지 않고 시간을 소모하며 공격합니다.`,
            ]);
        case 'milkMax':
            return pick([
                `${region}, 샷클락을 끝까지 소모하며 시간을 지웁니다.`,
                `${region}, 공을 돌리며 샷클락을 마지막까지 씁니다.`,
            ]);
    }
}

/** [2026-11-05] 드리블 아웃 — 4Q·연장 샷클락 꺼진 구간, 앞선 팀이 슛 없이 남은 시간을 흘려보냄 (client 미러 참조) */
export function getDribbleOutCommentary(region: string, handlerName: string, seconds: number): string {
    return pick([
        `${region}, 공을 돌리며 남은 ${seconds}초를 그대로 흘려보냅니다.`,
        `${handlerName}, 하프라인 부근에서 공을 지키며 남은 ${seconds}초를 흘려보냅니다.`,
        `${region}, 슛을 던지지 않고 남은 ${seconds}초를 지워 승리를 굳힙니다.`,
    ]);
}

/** [2026-11-05] 파울 작전 시작 안내 줄 (client 미러 참조) — trailing = 지는 팀 파울 작전, upThree = 3점 앞선 팀 역파울 작전 */
export function getFoulStrategyCommentary(kind: 'trailing' | 'upThree', region: string): string {
    return kind === 'upThree'
        ? pick([
            `${region}, 동점 3점을 막기 위해 파울로 끊습니다.`,
            `${region}, 3점 리드를 지키려 슛 전에 파울을 선택합니다.`,
        ])
        : pick([
            `${region}, 시간을 멈추기 위해 파울 작전에 들어갑니다.`,
            `${region}, 시계를 세우려 고의 파울 작전을 시작합니다.`,
        ]);
}

/** [2026-11-05] 고의 파울 문구 (client 미러 참조) — 공을 잡은 선수에게 바로 파울 */
export function getIntentionalFoulCommentary(defender: LivePlayer, actor: LivePlayer, kind: 'trailing' | 'upThree'): string {
    const d = defender.playerName, a = actor.playerName;
    return kind === 'upThree'
        ? pick([
            `${d}, 슛을 올라가기 전의 ${a}에게 일부러 파울합니다.`,
            `${d}, 공을 잡은 ${a}에게 곧바로 파울 — 3점 시도를 막습니다.`,
        ])
        : pick([
            `${d}, 시간을 멈추려 ${a}에게 고의로 파울합니다.`,
            `${d}, 공을 받은 ${a}에게 바로 파울 — 시계를 세웁니다.`,
            `${d}, 인바운드 패스를 받은 ${a}에게 곧장 파울합니다.`,
        ]);
}

/** [2026-11-05] 피리어드 막판 장거리 슛(히브) 문구 (client 미러 참조) — band: far = 하프라인 뒤, half = 하프라인을 막 넘긴 지점 */
export function getHeaveCommentary(actor: LivePlayer, band: 'far' | 'half', made: boolean, distanceFt: number): string {
    const a = actor.playerName;
    if (made) {
        return band === 'far'
            ? pick([
                `믿을 수 없습니다! ${a}, ${distanceFt}피트 밖에서 던진 하프코트 버저비터가 꽂힙니다! (+3)`,
                `${a}, 하프라인 뒤에서 던진 공이 그대로 림을 가릅니다! 초장거리 버저비터! (+3)`,
            ])
            : pick([
                `${a}, 하프라인을 넘자마자 던진 ${distanceFt}피트 슛이 들어갑니다! (+3)`,
                `${a}, 버저와 함께 던진 초장거리 3점이 꽂힙니다! (+3)`,
            ]);
    }
    return band === 'far'
        ? pick([
            `${a}, 하프라인 뒤에서 버저와 함께 던진 슛이 빗나갑니다.`,
            `${a}, 공을 잡자마자 코트 반대편으로 던져보지만 림을 외면합니다.`,
        ])
        : pick([
            `${a}, 하프라인을 넘어 던진 ${distanceFt}피트 슛이 빗나갑니다.`,
            `${a}, 버저와 함께 던진 초장거리 슛이 짧습니다.`,
        ]);
}

/** [2026-11-05] 백코트 1초 — 인바운드 받는 사이 시간 만료 (client 미러 참조) */
export function getInboundExpireCommentary(region: string): string {
    return pick([
        `${region}, 인바운드 패스를 받는 사이 시간이 모두 흘러갑니다.`,
        `${region}, 공을 잡았지만 슛을 던지기 전에 버저가 울립니다.`,
    ]);
}

/**
 * [2026-11-05] 경기 중 부상 문구 — 진단명은 숨기고 부위 + 등급별 중증도 암시만(진단은 경기 후 발표).
 * G1 스스로 걸어 나감 / G2 통증 호소하며 벤치 / G3 라커룸(하체 절뚝임, 상체 감싼 채) / G4 부축 / G5 부축 + 장내 숙연.
 */
export function getInjuryCommentary(playerName: string, injuryType: string, severity: string): string {
    const part = getInjuryBodyPart(injuryType);
    const at = part ? `${part} 부위` : '다친 부위';
    const lower = !!part && LOWER_BODY_PARTS.has(part);
    switch (severity) {
        case 'Grade1':
            return `🚨 ${playerName} 선수가 ${eulReul(at)} 붙잡고 잠시 쓰러졌다가, 스스로 걸어서 벤치로 향합니다.`;
        case 'Grade2':
            return `🚨 ${playerName} 선수가 ${part ? `${at} 통증` : '통증'}을 호소하며 벤치로 물러납니다. 트레이너가 상태를 살핍니다.`;
        case 'Grade3':
            return lower
                ? `🚨 ${playerName} 선수가 ${eulReul(at)} 붙잡고 절뚝이며 라커룸으로 향합니다.`
                : `🚨 ${playerName} 선수가 ${eulReul(at)} 감싼 채 라커룸으로 향합니다.`;
        case 'Grade4':
            return `🚨 ${playerName} 선수가 ${eulReul(at)} 부여잡고 일어나지 못합니다. 트레이너의 부축을 받아 코트를 떠납니다.`;
        default:
            return `🚨 ${playerName} 선수가 ${eulReul(at)} 움켜쥔 채 쓰러져 일어나지 못합니다. 장내가 숙연해진 가운데 부축을 받아 코트를 빠져나갑니다.`;
    }
}
