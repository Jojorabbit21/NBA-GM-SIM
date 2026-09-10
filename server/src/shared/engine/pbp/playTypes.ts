
import { PlayType, TacticalSliders } from '../../types.ts';
import { LivePlayer, TeamState } from './pbpTypes.ts';
import { getContextualMultiplier, getTeamOptionRanks } from './usageSystem.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';

// ==========================================================================================
//  PLAY TYPE SYSTEM
// ==========================================================================================

// [2026-09-10] 팀 전체 1~5옵션(gravity 기반, getTeamOptionRanks) 배율 — 가드 1옵션 실제 기능 문제
// 대응. 로컬 플레이타입 criteria(usageMultiplier, 최대 7.3배 스프레드)를 압도하지 않도록 완만하게
// (1.56배 스프레드) 설정 — "국소 스킬 경쟁"은 그대로 두고 "그래도 우리 팀 진짜 에이스인가"를 근소한
// 차이의 타이브레이커로만 반영. PBL 1230경기 검증: 1옵션 FGA 역전율 46.4%→35.5%(-10.9%p), 역할선수
// (팀랭크 3~5) 억제 부작용은 -2.4%p로 작음(docs/history/dev-log.md 참고).
const STAR_USAGE_WEIGHTS = [1.25, 1.10, 1.00, 0.90, 0.80];

export interface PlayContext {
    playType: PlayType;
    actor: LivePlayer;
    secondaryActor?: LivePlayer;
    screener?: LivePlayer;
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT';
    shotType: 'Dunk' | 'Layup' | 'Floater' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot' | 'Fadeaway';
    bonusHitRate: number;
    isKickout?: boolean;
}

// ==========================================================================================
//  Zone Selection Helpers
// ==========================================================================================

function selectZone(
    zones: ('3PT' | 'Mid' | 'Paint' | 'Rim')[],
    actor: LivePlayer,
    sliders: TacticalSliders
): 'Rim' | 'Paint' | 'Mid' | '3PT' {
    const prefMap: Record<string, number> = {
        '3PT':   actor.zonePref.three,
        'Mid':   actor.zonePref.mid,
        'Paint': actor.zonePref.itp,
        'Rim':   actor.zonePref.ra,
    };
    const sliderMap: Record<string, number> = {
        '3PT':   sliders.shot_3pt,
        'Mid':   sliders.shot_mid,
        'Paint': sliders.shot_rim,
        'Rim':   sliders.shot_rim,
    };

    const threshold = SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD;
    const sensitivity = SIM_CONFIG.ZONE_SELECTION.SLIDER_SENSITIVITY;
    const scored = zones.map(z => {
        const pref = prefMap[z] < threshold ? prefMap[z] * 0.2 : prefMap[z];
        const modifier = 1 + (sliderMap[z] - 5) / 5 * sensitivity;
        return { zone: z, score: pref * modifier };
    });

    const total = scored.reduce((s, c) => s + c.score, 0);

    // [Safety] 텐던시 데이터가 전부 0인 예외적 케이스 (곱셈 구조라 total<=0 가능) → 균등 폴백
    if (total <= 0) {
        return zones[Math.floor(Math.random() * zones.length)];
    }

    let r = Math.random() * total;
    for (const { zone, score } of scored) {
        r -= score;
        if (r <= 0) return zone;
    }
    return scored[scored.length - 1].zone;
}

type FinishContext = 'drive' | 'post' | 'roll' | 'putback';

function resolveFinish(
    actor: LivePlayer,
    context: FinishContext,
    sliders: TacticalSliders,
    zone?: 'Rim' | 'Paint'
): { zone: PlayContext['preferredZone'], shotType: PlayContext['shotType'] } {
    const F = SIM_CONFIG.FINISH;
    const B = F.BASELINE;
    const options: { zone: PlayContext['preferredZone'], shotType: PlayContext['shotType'], weight: number }[] = [];

    // Rim 옵션
    if (!zone || zone === 'Rim') {
        if (actor.attr.vertical >= F.DUNK_VERT_MIN && actor.attr.strength >= F.DUNK_STR_MIN) {
            options.push({ zone: 'Rim', shotType: 'Dunk', weight: Math.max(0, actor.attr.dunk - B) * F.DUNK_WEIGHT });
        }
        options.push({ zone: 'Rim', shotType: 'Layup', weight: Math.max(0, actor.attr.layup - B) * F.LAYUP_WEIGHT });
    }

    // Paint 옵션
    if (!zone || zone === 'Paint') {
        if (context !== 'putback' && actor.attr.closeShot >= F.FLOATER_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Floater', weight: Math.max(0, actor.attr.closeShot - B) * F.FLOATER_WEIGHT });
        }
        if ((context === 'post' || context === 'roll') &&
            actor.attr.height >= F.HOOK_HEIGHT_MIN && actor.attr.closeShot >= F.HOOK_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Hook', weight: Math.max(0, actor.attr.postPlay - B) * F.HOOK_WEIGHT });
        }
        if (context !== 'putback' && actor.attr.closeShot >= F.PAINT_JUMPER_CLOSESHOT_MIN) {
            const w = Math.max(0, actor.attr.closeShot - B) * F.PAINT_JUMPER_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Paint', shotType: 'Jumper', weight: w });
        }
    }

    // Mid 옵션
    if (!zone) {
        if (context === 'drive' && actor.attr.mid >= F.MID_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.MID_DRIVE_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Pullup', weight: w });
        }
        if ((context === 'post' || context === 'roll') && actor.attr.mid >= F.MID_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.MID_POST_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Jumper', weight: w });
        }
        if (context === 'post' &&
            actor.attr.postPlay >= F.FADEAWAY_POSTPLAY_MIN &&
            actor.attr.mid >= F.FADEAWAY_MID_MIN &&
            actor.attr.closeShot >= F.FADEAWAY_CLOSESHOT_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.FADEAWAY_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Fadeaway', weight: w });
        }
    }

    const total = options.reduce((s, o) => s + o.weight, 0);
    if (total <= 0) {
        return zone === 'Paint'
            ? { zone: 'Paint', shotType: 'Floater' }
            : { zone: 'Rim', shotType: 'Layup' };
    }
    let r = Math.random() * total;
    for (const opt of options) {
        r -= opt.weight;
        if (r <= 0) return { zone: opt.zone, shotType: opt.shotType };
    }
    return options[options.length - 1];
}

// ==========================================================================================
//  Core
// ==========================================================================================

export function resolvePlayAction(team: TeamState, playType: PlayType, sliders: TacticalSliders): PlayContext {
    const players = team.onCourt;
    // [2026-09-10] 팀 전체 1~5옵션 랭킹(gravity 기반) — resolvePlayAction 호출당 1회만 계산해
    // 클로저로 재사용. STAR_USAGE_WEIGHTS와 함께 사용(아래 pickWeightedActor 참고).
    const teamRankMap = getTeamOptionRanks(team);

    const pickWeightedActor = (
        criteria: (p: LivePlayer) => number,
        excludeId?: string,
        role: 'shooter' | 'passer' = 'shooter',
        eligibleFilter?: (p: LivePlayer) => boolean
    ) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
        if (eligibleFilter) pool = pool.filter(eligibleFilter);

        // [2026-09-10] usage multiplier 랭킹을 팀 전체 gravity(getTeamOptionRanks)가 아니라
        // 이 호출에 실제로 쓰인 criteria 기준 로컬 랭킹으로 교체 — 예: Iso/PnR_Handler에서
        // "팀 최고 볼핸들러"가 팀에 postScorer 게비티 높은 빅맨이 있다는 이유만으로 2~3옵션
        // 배율로 밀리는 문제를 막는다(client 미러 상세 참조). passer role은 원래도
        // usageMultiplier가 무조건 1.0이라 랭킹 자체가 영향이 없었으므로 그대로 둠.
        const localRank: Map<string, number> | null = role === 'shooter'
            ? new Map([...pool].sort((a, b) => criteria(b) - criteria(a)).map((p, i) => [p.playerId, i + 1]))
            : null;

        const candidates = pool.map(p => {
            const rawScore = criteria(p);

            const rank = localRank?.get(p.playerId) ?? 3;
            const usageMultiplier = role === 'shooter' ? getContextualMultiplier(rank, playType) : 1.0;

            let weight = Math.max(1, rawScore) * usageMultiplier;

            // [2026-09-10] 팀 전체 1옵션 배율 — 로컬 스킬 순위와 별개 신호. 자격이 되는 플레이타입
            // 전반에서 "진짜 에이스"가 근소한 차이를 뒤집을 수 있게 함(PnR_Roll/Pop처럼 애초에
            // 후보 풀에 없는 플레이타입엔 자연히 영향 없음). passer role은 usageMultiplier와 같은
            // 이유로 제외(순수 스킬로만 패서 선정).
            const teamRank = teamRankMap.get(p.playerId) ?? 3;
            const starMultiplier = role === 'shooter'
                ? STAR_USAGE_WEIGHTS[Math.min(5, Math.max(1, teamRank)) - 1]
                : 1.0;
            weight *= starMultiplier;

            const ballDom = p.tendencies?.ballDominance ?? 1.0;
            weight *= role === 'shooter' ? ballDom : (2.0 - ballDom);

            // [SaveTendency] playStyle: role 기반 통합 배율 (슈터 vs 패서)
            const ps = p.tendencies?.playStyle ?? 0;
            const psCfg = SIM_CONFIG.PLAY_SELECTION;
            weight *= role === 'shooter' ? (1 + ps * psCfg.PLAYSTYLE_SHOOTER_K) : (1 - ps * psCfg.PLAYSTYLE_PASSER_K);

            return { p, weight: Math.max(0.01, weight) };
        });

        if (candidates.length === 0) {
            console.error('[PBP DEBUG] pickWeightedActor: empty candidates!', {
                poolSize: players.length, excludeId, playType,
            });
            return players[0];
        }

        const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

        let random = Math.random() * totalWeight;

        for (const c of candidates) {
            random -= c.weight;
            if (random <= 0) return c.p;
        }

        return candidates[0].p;
    };

    const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        return pickWeightedActor(
            p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
            excludeId,
            'passer'
        );
    };

    switch (playType) {
        case 'Iso': {
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-07-31] 더블팀 유도 후 킥아웃 + playStyle 보정 (client 미러 참고)
            const ikCfg = SIM_CONFIG.ISO_KICKOUT;
            const isoPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
            const isoPassingNorm = Math.max(0, Math.min(1,
                (isoPassing - ikCfg.PASSING_MIN) / (ikCfg.PASSING_MAX - ikCfg.PASSING_MIN)));
            let isoKickChance = ikCfg.PROB_MIN + (ikCfg.PROB_MAX - ikCfg.PROB_MIN) * Math.pow(isoPassingNorm, ikCfg.CURVE_EXPONENT);
            const isoPs = actor.tendencies?.playStyle ?? 0;
            isoKickChance *= (1 - isoPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < isoKickChance) {
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
                const passIqBonus = Math.max(0,
                    (actor.attr.passIq - ikCfg.PASSIQ_BONUS_NEUTRAL) / 30 * ikCfg.PASSIQ_BONUS_SCALE);
                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] client 미러(playTypes.ts) 참고 — 킥아웃 마무리 context를 'drive'로
                    // 고정하면 훅슛이 gating 조건(post/roll)을 못 넘어 킥아웃에서만 훅슛이 원천
                    // 봉쇄되는 문제가 있었음. 4개 playType 전부 'post'로 통일.
                    const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.00 + passIqBonus, isKickout: true };
                }
                return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: koZone, shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.00 + passIqBonus, isKickout: true };
            }

            const passer = pickPasser(p => p.archetypes.connector + p.archetypes.handler * 0.3, actor.playerId);

            const isoZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (isoZone === 'Rim' || isoZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, isoZone);
                return { playType, actor, secondaryActor: passer, preferredZone: zone, shotType, bonusHitRate: 0.00 };
            }
            return {
                playType, actor, secondaryActor: passer, preferredZone: isoZone, shotType: 'Pullup', bonusHitRate: 0.00
            };
        }
        case 'PnR_Handler': {
            // [2026-07-29] isoScorer+handler*0.5로 교체 — 순수 패서형 편중 방지 (client 미러 참고)
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-07-31] 더블팀 유도 후 킥아웃 + playStyle 보정 (client 미러 참고)
            const phkCfg = SIM_CONFIG.PNR_HANDLER_KICKOUT;
            const phPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
            const phPassingNorm = Math.max(0, Math.min(1,
                (phPassing - phkCfg.PASSING_MIN) / (phkCfg.PASSING_MAX - phkCfg.PASSING_MIN)));
            let phKickChance = phkCfg.PROB_MIN + (phkCfg.PROB_MAX - phkCfg.PROB_MIN) * Math.pow(phPassingNorm, phkCfg.CURVE_EXPONENT);
            const phPs = actor.tendencies?.playStyle ?? 0;
            phKickChance *= (1 - phPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < phKickChance) {
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
                const passIqBonus = Math.max(0,
                    (actor.attr.passIq - phkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * phkCfg.PASSIQ_BONUS_SCALE);
                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] client 미러(playTypes.ts) 참고 — 킥아웃 마무리 context를 'drive'로
                    // 고정하면 훅슛이 gating 조건(post/roll)을 못 넘어 킥아웃에서만 훅슛이 원천
                    // 봉쇄되는 문제가 있었음. 4개 playType 전부 'post'로 통일.
                    const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.01 + passIqBonus, isKickout: true };
                }
                return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: koZone, shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.01 + passIqBonus, isKickout: true };
            }

            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer');

            const zone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (zone === 'Rim' || zone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, zone);
                return { playType, actor, secondaryActor: screener, preferredZone: finishZone, shotType, bonusHitRate: 0.01 };
            }
            return { playType, actor, secondaryActor: screener, preferredZone: zone, shotType: 'Pullup', bonusHitRate: 0.01 };
        }
        case 'PnR_Roll': {
            // [2026-07-29] 포지션 가중치로 롤맨을 프론트코트로 제한 (client 미러 참고)
            // [2026-09-10] C 0.7/PF 0.3/그 외 0 → C 0.5/PF 0.3/SF 0.15/그 외 0 — 빅윙 SF 참여 허용
            const rollWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;
            const screener = pickWeightedActor(
                p => (p.archetypes.roller + p.archetypes.screener * 0.5) * (rollWeights[p.position] ?? 0),
                undefined, 'shooter',
                p => (rollWeights[p.position] ?? 0) > 0
            );

            // [2026-07-31] 더블팀 유도 후 킥아웃 (client 미러 참고) — PROB_MAX 절반(0.20)
            const prkCfg = SIM_CONFIG.PNR_ROLL_KICKOUT;
            const rollPassing = (screener.attr.passVision + screener.attr.passAcc) / 2;
            const rollPassingNorm = Math.max(0, Math.min(1,
                (rollPassing - prkCfg.PASSING_MIN) / (prkCfg.PASSING_MAX - prkCfg.PASSING_MIN)));
            let rollKickChance = prkCfg.PROB_MIN + (prkCfg.PROB_MAX - prkCfg.PROB_MIN) * Math.pow(rollPassingNorm, prkCfg.CURVE_EXPONENT);
            const rollPs = screener.tendencies?.playStyle ?? 0;
            rollKickChance *= (1 - rollPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < rollKickChance) {
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, screener.playerId);
                const passIqBonus = Math.max(0,
                    (screener.attr.passIq - prkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * prkCfg.PASSIQ_BONUS_SCALE);

                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] client 미러(playTypes.ts) 참고 — 킥아웃 마무리 context를 'drive'로
                    // 고정하면 훅슛이 gating 조건(post/roll)을 못 넘어 킥아웃에서만 훅슛이 원천
                    // 봉쇄되는 문제가 있었음. 4개 playType 전부 'post'로 통일.
                    const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: screener, preferredZone: zone, shotType, bonusHitRate: 0.01 + passIqBonus, isKickout: true };
                }
                return { playType, actor: kickTarget, secondaryActor: screener, preferredZone: koZone, shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.01 + passIqBonus, isKickout: true };
            }

            const handler = pickPasser(p => p.archetypes.handler, screener.playerId);
            const rollZone = selectZone(['Rim', 'Paint', 'Mid'], screener, sliders);
            if (rollZone === 'Rim' || rollZone === 'Paint') {
                const { zone, shotType } = resolveFinish(screener, 'roll', sliders, rollZone);
                return { playType, actor: screener, secondaryActor: handler, preferredZone: zone, shotType, bonusHitRate: 0.03 };
            }
            return { playType, actor: screener, secondaryActor: handler, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0.03 };
        }
        case 'PnR_Pop': {
            // [2026-07-29] PnR_Roll과 동일한 스크리너 풀(C/PF)만 허용 (client 미러 참고)
            // [2026-07-31] zonePref.three 페널티 적용 (client 미러 참고)
            // [2026-09-10] 기존엔 popEligible을 후보 자격(eligibleFilter)에만 쓰고 실제 가중치
            // 계산엔 안 곱해서, PnR_Roll과 달리 SF가 C/PF와 동등하게(다운웨이트 없이) 경쟁하는
            // 불일치가 있었음 — PNR_ROLL에 SF 0.15를 추가하면서 Roll과 동일하게 가중치도 곱하도록 수정.
            const popEligible = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;
            // [2026-09-10] zonePref.three 페널티를 이진(임계값 미만 무조건 ×0.2)에서 비례식으로 교체 —
            // 임계값(0.15) 바로 아래인 선수와 진짜 3점 텐던시가 0인 선수(고베어급)가 똑같이 0.2배만
            // 페널티를 받던 문제. 0에 가까울수록 더 강하게 깎임(최저 ×0.05) — 순수 림러너는 거의
            // 배제되고, 진짜 스트레치 빅(텐던시·스킬 둘 다 있음)은 그대로 기능 유지(docs/history/
            // dev-log.md 실측 확인: 전통 빅맨 3PA -78~-92%, 스트레치 빅 3PA -0.6~-14%).
            const popper = pickWeightedActor(
                p => {
                    const threePenalty = Math.max(0.05, Math.min(1.0,
                        p.zonePref.three / SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD));
                    return p.archetypes.popper * (popEligible[p.position] ?? 0) * threePenalty;
                },
                undefined, 'shooter',
                p => (popEligible[p.position] ?? 0) > 0
            );
            const handler = pickPasser(p => p.archetypes.handler, popper.playerId);
            return { playType, actor: popper, secondaryActor: handler, preferredZone: '3PT', shotType: 'CatchShoot', bonusHitRate: 0.01 };
        }
        case 'PostUp': {
            // [2026-07-29] 포지션 가중치(C 0.6/PF 0.2/SF 0.1/SG,PG 0.05)로 보정 (client 미러 참고)
            const postUpWeights = SIM_CONFIG.POSITION_WEIGHT.POST_UP;
            const actor = pickWeightedActor(p => p.archetypes.postScorer * (postUpWeights[p.position] ?? 0.05));

            // [2026-07-31] 더블팀 유도 후 킥아웃 (client 미러 참고)
            const pkCfg = SIM_CONFIG.POST_KICKOUT;
            const postPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
            const passingNorm = Math.max(0, Math.min(1,
                (postPassing - pkCfg.PASSING_MIN) / (pkCfg.PASSING_MAX - pkCfg.PASSING_MIN)));
            let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);
            const postPs = actor.tendencies?.playStyle ?? 0;
            kickChance *= (1 - postPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < kickChance) {
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
                const passIqBonus = Math.max(0,
                    (actor.attr.passIq - pkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * pkCfg.PASSIQ_BONUS_SCALE);

                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] client 미러(playTypes.ts) 참고 — 킥아웃 마무리 context를 'drive'로
                    // 고정하면 훅슛이 gating 조건(post/roll)을 못 넘어 킥아웃에서만 훅슛이 원천
                    // 봉쇄되는 문제가 있었음. 4개 playType 전부 'post'로 통일.
                    const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.01 + passIqBonus, isKickout: true };
                }
                return {
                    playType, actor: kickTarget, secondaryActor: actor,
                    preferredZone: koZone,
                    shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper',
                    bonusHitRate: 0.01 + passIqBonus,
                    isKickout: true
                };
            }

            const entryPasser = pickPasser(p => p.archetypes.handler + p.archetypes.connector * 0.5, actor.playerId);
            const postZone = selectZone(['Rim', 'Paint', 'Mid'], actor, sliders);
            if (postZone === 'Rim' || postZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'post', sliders, postZone);
                return { playType, actor, secondaryActor: entryPasser, preferredZone: zone, shotType, bonusHitRate: 0.01 };
            }
            return { playType, actor, secondaryActor: entryPasser, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0.01 };
        }
        case 'CatchShoot': {
            // [2026-07-31] zonePref.three 페널티 적용 (client 미러 참고)
            const actor = pickWeightedActor(p => p.archetypes.spacer * (p.zonePref.three < SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD ? 0.2 : 1.0));
            const passer = pickPasser(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);

            // [2026-07] 캐치앤슛 3점 전용 고정 — 원래 로직(펌프페이크→드라이브 전환)은 주석 처리로 보존
            // const catchZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            // if (catchZone === 'Rim' || catchZone === 'Paint') {
            //     const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, catchZone);
            //     return { playType, actor, secondaryActor: passer, preferredZone: finishZone, shotType, bonusHitRate: 0.02 };
            // }
            return { playType, actor, secondaryActor: passer, preferredZone: '3PT', shotType: 'CatchShoot', bonusHitRate: 0.02 };
        }
        case 'Cut': {
            const actor = pickWeightedActor(p => p.archetypes.driver + p.attr.offBallMovement * 0.5);
            const passer = pickPasser(p => p.archetypes.connector, actor.playerId);
            const cutZone = selectZone(['Rim', 'Paint', 'Mid'], actor, sliders);
            if (cutZone === 'Rim' || cutZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, cutZone);
                return { playType, actor, secondaryActor: passer, preferredZone: zone, shotType, bonusHitRate: 0.03 };
            }
            return { playType, actor, secondaryActor: passer, preferredZone: 'Mid', shotType: 'Pullup', bonusHitRate: 0.03 };
        }
        case 'Handoff': {
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            // [2026-07-29] screener(체격) → passIq/hands 기반 허브 스코어 + C/PF 자격 제한 (client 미러 참고)
            const handoffHubWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;
            const big = pickWeightedActor(
                p => p.attr.passIq * 0.5 + p.attr.hands * 0.5,
                actor.playerId, 'passer',
                p => (handoffHubWeights[p.position] ?? 0) > 0
            );

            const hoZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (hoZone === 'Rim' || hoZone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, hoZone);
                return { playType, actor, secondaryActor: big, preferredZone: finishZone, shotType, bonusHitRate: 0.02 };
            }
            return {
                playType, actor, secondaryActor: big,
                preferredZone: hoZone, shotType: hoZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.02
            };
        }
        case 'Transition': {
            const actor = pickWeightedActor(p => p.attr.spdBall + p.archetypes.driver);
            // [2026-07-30] touchdownQuality(passVision+passAcc 평균) 반영, 비중 0.3→0.5 (client 미러 참고)
            const outletPasser = pickPasser(p => {
                const touchdownQuality = (p.attr.passVision + p.attr.passAcc) / 2;
                return p.archetypes.connector + touchdownQuality * 0.5;
            }, actor.playerId);

            const trZone = selectZone(['3PT', 'Paint', 'Rim'], actor, sliders);
            if (trZone === 'Rim' || trZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, trZone);
                return { playType, actor, secondaryActor: outletPasser, preferredZone: zone, shotType, bonusHitRate: 0.04 };
            }
            return { playType, actor, secondaryActor: outletPasser, preferredZone: trZone, shotType: 'Pullup', bonusHitRate: 0.04 };
        }
        case 'Putback': {
            // [2026-07-29] reb(공수 종합) → offReb+vertical+hustle+CLD로 교체 (client 미러 참고)
            const actor = pickWeightedActor(p =>
                p.attr.offReb * 0.40 +
                p.attr.vertical * 0.30 +
                p.attr.hustle * 0.20 +
                (((p.attr.closeShot + p.attr.layup + p.attr.dunk) / 3) * 0.10)
            );
            const { zone: pbZone, shotType: pbShotType } = resolveFinish(actor, 'putback', sliders);
            return { playType, actor, preferredZone: pbZone, shotType: pbShotType, bonusHitRate: 0.05 };
        }
        case 'OffBallScreen': {
            const actor = pickWeightedActor(
                p => p.archetypes.spacer + p.attr.offBallMovement * 0.3 + p.attr.speed * 0.1
            );
            // [2026-07-29] role 파라미터 누락 버그 수정 — 'passer'로 통일 (client 미러 참고)
            const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
            const passer = pickPasser(
                p => p.archetypes.handler + p.archetypes.connector * 0.5, actor.playerId
            );

            const screenBonus = Math.max(0, (screener.archetypes.screener - 50) / 50 * 0.02);

            const obsZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (obsZone === 'Rim' || obsZone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, obsZone);
                return { playType, actor, secondaryActor: passer, screener, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + screenBonus };
            }
            return {
                playType, actor, secondaryActor: passer,
                screener,
                preferredZone: obsZone,
                shotType: obsZone === '3PT' ? 'CatchShoot' : 'Jumper',
                bonusHitRate: 0.02 + screenBonus
            };
        }
        case 'DriveKick': {
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.attr.out * 0.3);
            const driver = pickPasser(
                p => p.archetypes.driver + p.archetypes.handler * 0.3, actor.playerId
            );

            const penetration = (driver.attr.speed + driver.attr.agility + driver.attr.handling) / 3;
            const kickPass = (driver.attr.passVision + driver.attr.passAcc) / 2;
            const driveQuality = penetration * 0.6 + kickPass * 0.4;
            const driveBonus = Math.max(0, (driveQuality - 70) / 30 * 0.02);

            // [Fix][2026-07-29] 킵/킥아웃 분기를 드라이버 본인의 침투력 대 패스성향 비율로 결정 (client 미러 참고)
            const keepChance = penetration / (penetration + kickPass);
            if (Math.random() < keepChance) {
                const driveZone = selectZone(['Rim', 'Paint'], driver, sliders) as 'Rim' | 'Paint';
                const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, driveZone);
                return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
            }

            const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (dkZone === 'Rim' || dkZone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, dkZone);
                return { playType, actor, secondaryActor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
            }
            return {
                playType, actor, secondaryActor: driver,
                preferredZone: dkZone,
                shotType: dkZone === '3PT' ? 'CatchShoot' : 'Jumper',
                bonusHitRate: 0.02 + driveBonus
            };
        }
        default: {
            const actor = players[Math.floor(Math.random() * players.length)];
            return { playType: 'Iso', actor, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0 };
        }
    }
}
