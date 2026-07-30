
import { GameState, PossessionResult, LivePlayer, TeamState, ClutchContext } from './pbpTypes.ts';
import { resolvePlayAction } from './playTypes.ts';
import { calculateHitRate, interpolateCurve, calculateMatchupGap, MATCHUP_GAP_SCALE } from './flowEngine.ts';
import { resolveRebound } from './reboundLogic.ts';
import { getTopPlayerGravity, getTeamOptionRanks } from './usageSystem.ts';
import { PlayType } from '../../types.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { computePlayTypeWeights } from '../../game/config/playTypeProfiles.ts';
import { resolveDynamicZone } from '../shotDistribution.ts';

type PnrCoverage = 'drop' | 'hedge' | 'blitz' | 'none';

/**
 * Identify Defender using Sliders
 */
function identifyDefender(
    defTeam: TeamState,
    actor: LivePlayer,
    secondaryActor: LivePlayer | undefined,
    playType: PlayType,
    isActorAce: boolean,
    targetZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    isZone: boolean,  // Pre-calculated in simulatePossession (probabilistic: zoneFreq*0.08)
    screener?: LivePlayer  // OffBallScreen: 스크리너 (수비 스위치 기준)
): { defender: LivePlayer | undefined, isSwitch: boolean, isBotchedSwitch: boolean, pnrCoverage: PnrCoverage, screenerDefender?: LivePlayer } {

    const sliders = defTeam.tactics.sliders;

    if (isZone) {
        // [New] 존 디펜스에서 PnR은 항상 Drop 커버리지 — 센터/PF 앵커가 골밑에 고정되어 있어
        // 스크린을 따라 나올 수 없음 (hedge/blitz는 맨투맨 전용 개념)
        const isPnrPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop'].includes(playType);
        const screenPlayer = screener || secondaryActor;

        // Funnel inside shots to Bigs
        if (targetZone === 'Rim' || targetZone === 'Paint') {
            const anchor = defTeam.onCourt.find(p => p.position === 'C') ||
                           defTeam.onCourt.find(p => p.position === 'PF');
            if (anchor) {
                if (isPnrPlay) {
                    // 앵커 자신이 곧 스크리너 수비수(드롭 상태) — 롤맨도 이 앵커가 커버
                    return { defender: anchor, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'drop', screenerDefender: anchor };
                }
                return { defender: anchor, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
            }
        }

        if (isPnrPlay) {
            // Mid/3PT PnR 슛: 핸들러/팝퍼는 정상 포지션 매칭, 커버리지만 Drop 고정
            let zoneDefender = defTeam.onCourt.find(p => p.position === actor.position);
            if (!zoneDefender && defTeam.onCourt.length > 0) {
                zoneDefender = defTeam.onCourt[Math.floor(Math.random() * defTeam.onCourt.length)];
            }
            const screenerDef = (screenPlayer && defTeam.onCourt.find(p => p.position === screenPlayer.position))
                || defTeam.onCourt.find(p => p.position === 'C')
                || defTeam.onCourt.find(p => p.position === 'PF');
            return { defender: zoneDefender, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'drop', screenerDefender: screenerDef || undefined };
        }
    }

    // 1. Ace Stopper Logic (If explicitly set in Tactics, still respected)
    if (isActorAce && defTeam.tactics.stopperId && !isZone) {
        const stopper = defTeam.onCourt.find(p => p.playerId === defTeam.tactics.stopperId);
        if (stopper) return { defender: stopper, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
    }

    // 2. Default Defender
    let defender = defTeam.onCourt.find(p => p.position === actor.position);
    if (!defender && defTeam.onCourt.length > 0) {
        defender = defTeam.onCourt[Math.floor(Math.random() * defTeam.onCourt.length)];
    }
    // [Debug] 수비수를 찾지 못한 경우 진단 로그
    if (!defender) {
        console.error('[PBP DEBUG] identifyDefender: defender undefined!', {
            onCourtLength: defTeam.onCourt.length,
            actorPosition: actor.position,
            teamId: defTeam.id,
        });
        // 최후의 fallback: 코트에 아무나 (비어있으면 undefined 반환)
        defender = defTeam.onCourt.length > 0 ? defTeam.onCourt[0] : undefined;
    }

    // 3. Switch Logic
    // Driven by 'switchFreq' slider (1-10)
    // 1 = 5%, 5 = 25%, 10 = 50% base switch chance on screens
    const isScreenPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'Handoff', 'OffBallScreen'].includes(playType);

    // OffBallScreen: screener의 포지션으로 수비수 탐색, 나머지: secondaryActor 사용
    const screenPlayer = screener || secondaryActor;

    if (isScreenPlay && !isZone && screenPlayer) {
        const switchChance = sliders.switchFreq * 0.05;

        if (Math.random() < switchChance) {
            // Find screener's defender
            let switchDef = defTeam.onCourt.find(p => p.position === screenPlayer.position);
            if (!switchDef) switchDef = defTeam.onCourt.find(p => p.playerId !== defender!.playerId);

            if (switchDef) {
                // Botched Switch Check based on HelpDef slider
                // Lower HelpDef = Higher confusion risk
                const confusionChance = Math.max(0, (10 - sliders.helpDef) * 0.02);
                const isBotched = Math.random() < confusionChance;

                return { defender: switchDef, isSwitch: true, isBotchedSwitch: isBotched, pnrCoverage: 'none' };
            }
        }

        // 4. PnR Coverage (스위치 실패 시, PnR 플레이에서만)
        const isPnrPlay = ['PnR_Handler', 'PnR_Roll', 'PnR_Pop'].includes(playType);
        if (isPnrPlay) {
            const pnrDef = Math.max(0, Math.min(2, Math.round(sliders.pnrDefense)));
            const dist = SIM_CONFIG.PNR_COVERAGE.DIST[pnrDef] || SIM_CONFIG.PNR_COVERAGE.DIST[1];
            const [dropPct, hedgePct] = dist;

            const roll = Math.random();
            let coverage: PnrCoverage;
            if (roll < dropPct) coverage = 'drop';
            else if (roll < dropPct + hedgePct) coverage = 'hedge';
            else coverage = 'blitz';

            // 빅맨(스크리너 수비수) 식별
            const screenerDef = defTeam.onCourt.find(p => p.position === screenPlayer.position)
                             || defTeam.onCourt.find(p => p.position === 'C')
                             || defTeam.onCourt.find(p => p.position === 'PF');

            return { defender, isSwitch: false, isBotchedSwitch: false, pnrCoverage: coverage, screenerDefender: screenerDef || undefined };
        }
    }

    return { defender, isSwitch: false, isBotchedSwitch: false, pnrCoverage: 'none' };
}

/**
 * 턴오버/스틸 판정 (인과관계 정상화 재설계)
 *
 * A. 스틸 판정 (수비가 원인 → 턴오버가 결과)
 *    A-1. 온볼 스틸: 주 수비자가 볼 핸들러에게서 직접 탈취
 *    A-2. 패싱레인 스틸: 오프볼 수비자가 패스를 가로챔 (패스 플레이 전용)
 *
 * B. 비강제 턴오버 (공격자 자체 실수, 스틸 아님)
 *    핸들링 실수, 악송구, 밟힘 등
 */
function calculateTurnoverChance(
    offTeam: TeamState,
    defTeam: TeamState,
    actor: LivePlayer,
    defender: LivePlayer,
    playType: PlayType,
    pnrCoverage: PnrCoverage = 'none',
    helpDefender?: LivePlayer,
    helpSuccess: boolean = false
): { isTurnover: boolean, isSteal: boolean, stealer?: LivePlayer, isHelpPlay?: boolean } {

    const stlCfg = SIM_CONFIG.STEAL;
    const sliders = offTeam.tactics.sliders;
    // [Fix 2026-07-26] defIntensity에서 제거했던 스틸/턴오버유발 보정을 fullCourtPress로 이전.
    // 체력 소모(fatigueSystem.ts, 1단계 0% ~ 10단계 15%)와 짝을 이루는 하이리스크 하이리턴 트레이드오프.
    // 1단계=0(효과 없음) ~ 10단계=예전 defIntensity 최대치와 동일한 크기.
    // [2026-07-26] 존 디펜스와 풀코트 프레스는 상충 — zoneFreq 높을수록 press 효과 감쇠(최대 50%)
    const pressEffectiveness = 1 - (defTeam.tactics.sliders.zoneFreq - 1) * SIM_CONFIG.ZONE_DEFENSE.PRESS_ZONE_DAMPEN_PER_LEVEL;
    const pressLevel = Math.max(0, defTeam.tactics.sliders.fullCourtPress - 1) * pressEffectiveness;

    const isPassPlay = playType === 'CatchShoot' || playType === 'Handoff'
        || playType === 'PnR_Handler' || playType === 'PnR_Roll'
        || playType === 'PnR_Pop' || playType === 'Cut'
        || playType === 'OffBallScreen' || playType === 'DriveKick';

    // ================================================================
    // A-1. 온볼 스틸 (주 수비자 → 볼 핸들러 직접 탈취)
    // ================================================================
    const onballBase = interpolateCurve(defender.attr.stl, stlCfg.ONBALL_STEAL_CURVE);
    // 공격자 핸들링 저항: handling 높을수록 스틸당할 확률 감소
    const handlingResist = (actor.attr.handling - 70) * stlCfg.HANDLING_RESIST_COEFF;
    // PnR 블리츠: 더블팀 압박으로 온볼 스틸 확률 증가
    const pnrCfg = SIM_CONFIG.PNR_COVERAGE;
    const blitzBonus = (pnrCoverage === 'blitz' && playType === 'PnR_Handler') ? 0.02 : 0;
    // [Fix 2026-07-26] fullCourtPress: 1단계 0%p ~ 10단계 +1.5%p (예전 defIntensity 최대치 이전)
    const pressStealBonus = pressLevel * stlCfg.PRESS_STEAL_COEFF;

    const onballProb = Math.max(0.005, onballBase - handlingResist + blitzBonus + pressStealBonus);

    if (Math.random() < onballProb) {
        return { isTurnover: true, isSteal: true, stealer: defender };
    }

    // ================================================================
    // A-2. 패싱레인 스틸 (오프볼 수비자 → 패스 가로채기, 패스 플레이 전용)
    // ================================================================
    if (isPassPlay) {
        // 공격자 패스 정확도 저항
        const passResist = (actor.attr.passAcc - 70) * stlCfg.PASSACC_RESIST_COEFF;
        // [Fix 2026-07-26] fullCourtPress: 1단계 0%p ~ 10단계 +0.75%p (헬퍼별 개별 적용)
        const pressLaneStealBonus = pressLevel * stlCfg.PRESS_LANE_STEAL_COEFF;

        for (const helper of defTeam.onCourt) {
            if (helper.playerId === defender.playerId) continue;

            // passPerc 가중 stl: 패싱레인 읽기 능력 반영
            const effectiveStl = helper.attr.stl * 0.7 + helper.attr.passPerc * 0.3;
            const laneBase = interpolateCurve(effectiveStl, stlCfg.LANE_STEAL_CURVE);
            const laneProb = Math.max(0.001, laneBase - passResist + pressLaneStealBonus);

            if (Math.random() < laneProb) {
                return { isTurnover: true, isSteal: true, stealer: helper };
            }
        }
    }

    // ================================================================
    // A-3. 헬프 디펜스 스틸 (헬프 성공 시, 전 존/전 플레이타입 공통, 헬퍼 크레딧)
    // ================================================================
    // [2026-07-30] 헬퍼 개인 스탯(stl/passPerc) 기반 커브로 교체 (client 미러 참고, A-2와 동일 커브 재사용)
    if (helpDefender && helpSuccess) {
        const effectiveStl = helpDefender.attr.stl * 0.7 + helpDefender.attr.passPerc * 0.3;
        const helpStealBonus = interpolateCurve(effectiveStl, SIM_CONFIG.STEAL.LANE_STEAL_CURVE);
        if (Math.random() < helpStealBonus) {
            return { isTurnover: true, isSteal: true, stealer: helpDefender, isHelpPlay: true };
        }
    }

    // ================================================================
    // B. 비강제 턴오버 (공격자 자체 실수, 스틸 기록 없음)
    // ================================================================
    let baseProb = 0.06;

    // 볼무브 리스크: 패스 많이 돌릴수록 실수 확률 증가
    const rawPassRisk = Math.max(0, (sliders.ballMovement - 5) * 0.004);
    const teamAvgVision = offTeam.onCourt.reduce((s, p) => s + p.attr.passVision, 0) / 5;
    const visionDampen = Math.max(0.85, Math.min(1.15, 1 - (teamAvgVision - 70) * 0.005));
    const passRisk = rawPassRisk * visionDampen;

    // 공격자 능력치: 핸들링/IQ/손 부족 → 실수
    const handlingFactor = (70 - actor.attr.handling) * 0.001;
    const iqFactor = (70 - actor.attr.passIq) * 0.001;
    const isContactPlay = playType === 'PostUp' || playType === 'PnR_Handler' || playType === 'PnR_Roll' || playType === 'PnR_Pop';
    const handsFactor = (70 - actor.attr.hands) * (isContactPlay ? 0.0015 : 0.0005);
    const passAccFactor = (70 - actor.attr.passAcc) * (isPassPlay ? 0.0012 : 0.0005);

    // 플레이타입 컨텍스트
    let contextRisk = 0;
    if (playType === 'Transition') {
        contextRisk = 0.03;
        contextRisk += Math.max(0, (70 - actor.attr.passAcc)) * 0.001;
    } else if (playType === 'Iso') contextRisk = 0.01;
    else if (playType === 'PostUp') contextRisk = 0.02;

    // PnR 커버리지 압박
    if (pnrCoverage === 'blitz' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.BLITZ_TOV_BONUS;
    }
    if (pnrCoverage === 'hedge' && playType === 'PnR_Handler') {
        contextRisk += pnrCfg.HEDGE_TOV_BONUS;
    }

    // 침착성 (SaveTendency)
    const composureFactor = -(actor.tendencies?.composure ?? 0) * 0.01;

    // 드리블 갭 리스크: speed↑ spdBall↓ 차이
    let dribbleGapRisk = 0;
    const isDribblePlay = playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler';
    if (isDribblePlay) {
        dribbleGapRisk = Math.max(0, actor.attr.speed - actor.attr.spdBall) * 0.001;
    }

    // Needle 아키타입: 패스 플레이 턴오버 감소
    let needleReduction = 0;
    const pmCfg = SIM_CONFIG.PLAYMAKING;
    if (pmCfg.ENABLED && isPassPlay &&
        actor.attr.passAcc >= pmCfg.NEEDLE_PASSACC_THRESHOLD &&
        actor.attr.passIq >= pmCfg.NEEDLE_PASSIQ_THRESHOLD) {
        needleReduction = pmCfg.NEEDLE_TOV_REDUCTION;
    }

    // [Fix 2026-07-26] fullCourtPress: 1단계 0%p ~ 10단계 +2.5%p (예전 defIntensity 최대치 이전)
    const pressTovBonus = pressLevel * stlCfg.PRESS_TOV_COEFF;

    let unforcedProb = baseProb + passRisk + handlingFactor + iqFactor
        + handsFactor + passAccFactor + contextRisk + composureFactor
        + dribbleGapRisk - needleReduction + pressTovBonus;

    unforcedProb = Math.max(0.015, Math.min(0.18, unforcedProb));

    if (Math.random() < unforcedProb) {
        return { isTurnover: true, isSteal: false };
    }

    // C. 턴오버 없음
    return { isTurnover: false, isSteal: false };
}

/**
 * 모멘텀 런 보너스 계산 (에포크 diff 기반)
 * 런 팀의 hitRate에 소폭 보너스 적용. 타임아웃이 유일한 차단 수단.
 */
function getMomentumBonus(state: GameState, offTeamId: string): number {
    const m = state.momentum;
    if (!m.activeRun || m.activeRun.teamId !== offTeamId) return 0;

    const diff = offTeamId === state.home.id
        ? m.homeEpochPts - m.awayEpochPts
        : m.awayEpochPts - m.homeEpochPts;

    if (diff < 8)  return 0;
    if (diff < 12) return 0.015; //  8-11pt 런: +1.5%
    if (diff < 16) return 0.025; // 12-15pt 런: +2.5%
    return 0.035;                 // 16pt+  런: +3.5% (상한)
}

export function simulatePossession(state: GameState, options?: { minHitRate?: number; clutchContext?: ClutchContext }): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;

    // [Debug] onCourt 상태 진단
    if (offTeam.onCourt.length !== 5 || defTeam.onCourt.length !== 5) {
        console.error('[PBP DEBUG] onCourt size mismatch!', {
            offTeamId: offTeam.id, offCount: offTeam.onCourt.length,
            defTeamId: defTeam.id, defCount: defTeam.onCourt.length,
            quarter: state.quarter, gameClock: state.gameClock,
        });
    }
    if (offTeam.onCourt.some(p => !p) || defTeam.onCourt.some(p => !p)) {
        console.error('[PBP DEBUG] onCourt has undefined entry — skipping possession as turnover', {
            offUndefined: offTeam.onCourt.map((p, i) => !p ? i : null).filter(i => i !== null),
            defUndefined: defTeam.onCourt.map((p, i) => !p ? i : null).filter(i => i !== null),
        });
        const safeBallHandler = offTeam.onCourt.find(p => !!p);
        if (!safeBallHandler) return null as any;
        return {
            type: 'turnover' as const,
            offTeam, defTeam,
            actor: safeBallHandler,
            defender: defTeam.onCourt.find(p => !!p) ?? safeBallHandler,
            points: 0, isAndOne: false,
            playType: 'Iso' as const, isSwitch: false, isZone: false,
        };
    }

    const sliders = offTeam.tactics.sliders;

    // 1. Play Selection based on Sliders
    let selectedPlayType: PlayType = 'Iso';
    let isSecondChance = false;

    if (state.shotClock === 14 && state.gameClock < 720) {
        // High OffReb slider increases immediate putback chance
        // [Fix] Reduced: was 0.5+(offReb*0.03) → max 80%. Now realistic 25-35%.
        const putbackChance = 0.15 + (sliders.offReb * 0.02);
        if (Math.random() < putbackChance) {
            selectedPlayType = 'Putback';
            isSecondChance = true;
        }
    }

    if (!isSecondChance) {
        // 3개 추상 슬라이더(insideOut/pnrFreq/ballMovement) → 10개 하프코트 플레이타입 가중치 산출
        const weights = computePlayTypeWeights(sliders);

        // Star Gravity: 1옵션의 공격력이 높을수록 Hero 플레이 비중 증가
        // 현실 NBA에서 에이스가 코트에 있으면 팀 전술 자체가 스타 중심으로 변하는 것을 반영
        // [2026-07-28] usageSystem.ts의 calculateScoringGravity()에서 mentality/fatigueFactor를
        // 제거하면서 gravity 스케일이 소폭 변경됨(condition=100 기준 실측 비율 평균 0.965) → 임계값도
        // 65에서 63으로 재조정. 참고: gravity가 더 이상 체력에 따라 하락하지 않으므로, 지친 에이스도
        // 경기 후반까지 Star Gravity 보정이 유지됨(의도된 동작 — 볼 소유는 유지, 적중률만 하락).
        const topGravity = getTopPlayerGravity(offTeam);
        const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 63) * 0.015));
        // gravity 90 → min(0.30, 0.405) = 0.30 → Hero 30% 증가
        // gravity 78 → 0.225 → Hero 22.5% 증가
        // gravity 63 이하 → 0 (벤치 유닛은 시스템 플레이 유지)
        weights['Iso'] *= (1 + gravityBoost);
        weights['PnR_Handler'] *= (1 + gravityBoost);
        weights['PostUp'] *= (1 + gravityBoost * 0.5);

        // [2026-07-30] Playmaking Gravity — 포지션 무관 팀 최고 플레이메이커 기준 어시스트형
        // 플레이 비중 증가 (client 미러 참고). PnR_Pop은 popper 자격과 무관한 부스트라 제외.
        const topPlaymakingGravity = Math.max(...offTeam.onCourt.map(p => p.archetypes.handler));
        const playmakingBoost = Math.min(0.30, Math.max(0, (topPlaymakingGravity - 70) * 0.02));
        weights['PnR_Roll'] *= (1 + playmakingBoost);
        weights['CatchShoot'] *= (1 + playmakingBoost);
        weights['Handoff'] *= (1 + playmakingBoost);
        weights['Cut'] *= (1 + playmakingBoost * 0.7);
        weights['OffBallScreen'] *= (1 + playmakingBoost * 0.7);

        // Clutch Play Selection: 경기 상황에 따른 전술 보정
        const cc = options?.clutchContext;
        if (cc?.isClutch) {
            const isOffTrailing = (state.possession === 'home' && cc.trailingTeamSide === 'home') ||
                                  (state.possession === 'away' && cc.trailingTeamSide === 'away');
            const isOffLeading = cc.trailingTeamSide !== null && !isOffTrailing;

            if (isOffTrailing && cc.scoreDiff >= 3) {
                // 뒤지는 팀: 3점 비중 대폭 증가, 포스트업 감소
                weights['CatchShoot'] *= (1 + cc.desperation * 0.8);
                weights['PnR_Pop'] *= (1 + cc.desperation * 0.5);
                weights['PostUp'] *= (1 - cc.desperation * 0.4);
                weights['Cut'] *= (1 - cc.desperation * 0.3);
            } else if (isOffLeading) {
                // 이기는 팀: Iso/PostUp 비중 증가 (시간 소비 목적)
                weights['Iso'] *= (1 + cc.desperation * 0.5);
                weights['PostUp'] *= (1 + cc.desperation * 0.4);
                weights['CatchShoot'] *= (1 - cc.desperation * 0.3);
                weights['Transition'] = 0; // 속공 자제
            }
        }

        // Add Transition chance based on Pace
        // Pace 10 -> High transition
        // [New 2026-07] defReb 속공 트레이드오프 A — 방금 우리 팀 수비 리바운드로 얻은 공격권일 때만,
        // 우리 defReb가 5 미만이면 그만큼 리바운드에 인원을 덜 투입하고 먼저 뛰쳐나간 것으로 간주
        const drtCfg = SIM_CONFIG.DEF_REB_TRANSITION;
        const defRebFreqBonus = (state.lastEntryWasDefReb && sliders.defReb < drtCfg.FREQ_THRESHOLD)
            ? (drtCfg.FREQ_THRESHOLD - sliders.defReb) * drtCfg.FREQ_BONUS_PER_LEVEL
            : 0;
        if (Math.random() < (sliders.pace * 0.03 + defRebFreqBonus)) {
             selectedPlayType = 'Transition';
        } else {
            // Weighted Random Choice
            const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
            let r = Math.random() * totalW;
            for (const [pt, w] of Object.entries(weights)) {
                r -= w;
                if (r <= 0) {
                    selectedPlayType = pt as PlayType;
                    break;
                }
            }
        }
    }

    const playCtx = resolvePlayAction(offTeam, selectedPlayType, sliders);
    const { actor, secondaryActor, screener, preferredZone, bonusHitRate, shotType } = playCtx;
    const isActorAce = actor.playerId === offTeam.acePlayerId;

    // 2. Identify Defender
    // zoneFreq=1: 8% 발동, zoneFreq=5: 40%, zoneFreq=10: 80%
    const isZone = Math.random() < defTeam.tactics.sliders.zoneFreq * 0.08;
    const { defender, isSwitch, isBotchedSwitch, pnrCoverage, screenerDefender } = identifyDefender(
        defTeam, actor, secondaryActor, selectedPlayType, isActorAce, preferredZone, isZone, screener
    );

    // [Safety] defender가 undefined면 턴오버로 처리 (크래시 방지)
    if (!defender) {
        console.error('[PBP CRITICAL] defender is undefined after identifyDefender!', {
            defTeamId: defTeam.id, defOnCourt: defTeam.onCourt.length,
            actorId: actor.playerId, playType: selectedPlayType,
        });
        return {
            type: 'turnover', offTeam, defTeam, actor, defender: actor,
            points: 0, isAndOne: false, playType: selectedPlayType,
            isSwitch: false, isZone: false,
        };
    }

    // 2.5 Help Defense Resolution (통합 판정 — 파울/턴오버/hitRate/블락 공통 사용)
    // [New 2026-07] 코트 전 구역 적용, 헬퍼 명시적 지정(존별 포지션 풀 + 랜덤), IQ×신체 이중 게이트
    const helpCfg = SIM_CONFIG.HELP_DEFENSE;
    const helpDefLevel = defTeam.tactics.sliders.helpDef;
    const helpAttemptChance = helpCfg.ATTEMPT_BASE + (helpDefLevel - 1) * helpCfg.ATTEMPT_PER_LEVEL;
    const helpAttempted = Math.random() < helpAttemptChance;

    let helpDefender: LivePlayer | undefined;
    let helpSuccess = false;

    if (helpAttempted) {
        // [2026-07-29] switchFreq 기반 헬프 풀 전체 확장(client 미러 상세 참조) — 기존
        // switchChance(switchFreq*0.05)와 동일 스케일.
        const universalHelpChance = defTeam.tactics.sliders.switchFreq * 0.05;
        const useFullPool = Math.random() < universalHelpChance;

        const zonePositions = helpCfg.ZONE_POSITIONS[preferredZone] ?? [];
        let helperPool = useFullPool
            ? defTeam.onCourt.filter(p => p.playerId !== defender.playerId)
            : defTeam.onCourt.filter(p => p.playerId !== defender.playerId && zonePositions.includes(p.position));
        if (helperPool.length === 0) {
            helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
        }
        if (helperPool.length > 0) {
            // [2026-07-30] 헬퍼 선정을 helpDefIq 가중 룰렛으로 변경 (client 미러 참고)
            const totalHelpIq = helperPool.reduce((sum, p) => sum + Math.max(1, p.attr.helpDefIq), 0);
            let iqRoll = Math.random() * totalHelpIq;
            helpDefender = helperPool[helperPool.length - 1];
            for (const p of helperPool) {
                iqRoll -= Math.max(1, p.attr.helpDefIq);
                if (iqRoll <= 0) { helpDefender = p; break; }
            }

            const iqFactor = Math.max(0, Math.min(1,
                (helpDefender.attr.helpDefIq - helpCfg.IQ_GATE_MIN) / (helpCfg.IQ_GATE_MAX - helpCfg.IQ_GATE_MIN)));
            const avgPhys = (helpDefender.attr.agility + helpDefender.attr.speed) / 2;
            const physFactor = Math.max(0, Math.min(1,
                (avgPhys - helpCfg.PHYS_GATE_MIN) / (helpCfg.PHYS_GATE_MAX - helpCfg.PHYS_GATE_MIN)));
            helpSuccess = Math.random() < (iqFactor * physFactor);
        }
    }
    // 체력 소모(fatigueSystem.ts로 전달)용 ID — 시도만 해도 적용, 성공 여부 무관
    const helpDefenderId = (helpAttempted && helpDefender) ? helpDefender.playerId : undefined;
    // [2026-07-30] 슬라이더 무관 고정값 (client 미러 참고)
    const helpHitRatePenalty = (helpAttempted && helpSuccess) ? -helpCfg.HITRATE_PENALTY : 0;

    // 3. Shooting Foul Check (존별 단일 확률 + drawFoul 커브)
    // 이중 게이트(baseFoul × shootingRatio) 제거 → 존별 직접 슈팅파울 확률
    const defIntensity = defTeam.tactics.sliders.defIntensity;
    const offFoulConfig = SIM_CONFIG.FOUL_EVENTS;
    const sFoulCfg = SIM_CONFIG.SHOOTING_FOUL;

    // 존별 기본 슈팅파울 확률
    let shootingFoulRate = preferredZone === 'Rim' ? sFoulCfg.BASE_RATE_RIM
        : preferredZone === 'Paint' ? sFoulCfg.BASE_RATE_PAINT
        : preferredZone === 'Mid' ? sFoulCfg.BASE_RATE_MID
        : sFoulCfg.BASE_RATE_3PT;

    // drawFoul 커브 보정 (존별 스케일링)
    const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
    const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
    shootingFoulRate += drawFoulBonus * zoneScale;

    // defIntensity 보정: 5.5 기준 대칭(1단계 -3.0%p ~ 10단계 +3.0%p)
    shootingFoulRate += (defIntensity - 5.5) * sFoulCfg.DEF_INTENSITY_FACTOR;

    // [2026-07-30] 트리거를 helpSuccess→helpAttempted로, 강도는 슬라이더 무관 고정값으로 (client 미러 참고)
    let helpBonusRate = 0;
    if (helpAttempted && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
        helpBonusRate = helpCfg.FOUL_BONUS;
        shootingFoulRate += helpBonusRate;
    }

    // Manipulator 아키타입: 엘리트 파울 드로어 보너스
    // ★ TEMPORARY: ZONE_SHOOTING.ENABLED 연동 (아키타입 비활성화 시 스킵)
    if (SIM_CONFIG.ZONE_SHOOTING.ENABLED &&
        actor.attr.drFoul >= sFoulCfg.MANIPULATOR_DRFOUL_THRESHOLD &&
        actor.attr.shotIq >= sFoulCfg.MANIPULATOR_SHOTIQ_THRESHOLD) {
        shootingFoulRate += sFoulCfg.MANIPULATOR_BONUS;
    }

    // [SaveTendency] foulProneness: 수비자 파울 성향
    shootingFoulRate += (defender.tendencies?.foulProneness ?? 0) * 0.02;

    // Foul Trouble: 파울 트러블 수비자는 조심스럽게 수비 → 파울 확률 감소 + 수비력 약화
    const ft = SIM_CONFIG.FOUL_TROUBLE;
    const defFouls = defender.pf;
    const foulProbMod = defFouls >= 5 ? ft.PROB_MOD[5] : defFouls >= 4 ? ft.PROB_MOD[4] : defFouls >= 3 ? ft.PROB_MOD[3] : 1.0;

    // [2026-07-29] 매치업 격차 → 파울 배수(0.5~1.5x, client 미러 상세 참조)
    const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
    const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
    const matchupFoulMult = 1 + gapNormalized * 0.5;

    shootingFoulRate *= foulProbMod * matchupFoulMult;
    // DEF_PENALTY → hitRate 보너스 (×0.10 스케일링: 4파울 +1.5%, 5파울 +4%)
    const foulDefPenalty = defFouls >= 5 ? ft.DEF_PENALTY[5] * 0.10 : defFouls >= 4 ? ft.DEF_PENALTY[4] * 0.10 : 0;

    // 클램프
    shootingFoulRate = Math.max(sFoulCfg.MIN_RATE, Math.min(sFoulCfg.MAX_RATE, shootingFoulRate));

    if (Math.random() < shootingFoulRate) {
        // 헬프 보너스가 기여한 비율만큼 확률적으로 실제 헬퍼에게 파울 귀속(전체 파울 확률 자체는 불변)
        const helpFoulShare = helpBonusRate > 0
            ? Math.min(1, (helpBonusRate * foulProbMod) / shootingFoulRate)
            : 0;
        const fouler = (helpDefender && Math.random() < helpFoulShare) ? helpDefender : defender;
        const isHelpFoul = !!helpDefender && fouler === helpDefender;
        return {
            type: 'freethrow',
            offTeam, defTeam, actor, defender: fouler, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            zone: preferredZone,
            helpDefenderId,
            isHelpPlay: isHelpFoul,
        };
    }

    // 3.2 Non-Shooting Foul (팀 파울 / 루스볼 — 보너스 상황에서만 FT)
    // [2026-07-29] 플레이타입별 차등 + 매치업 배수 재사용(client 미러 상세 참조)
    const nsFoulCfg = SIM_CONFIG.NON_SHOOTING_FOUL;
    let nonShootingFoulRate = nsFoulCfg.BASE_RATE + (defIntensity - 5.5) * nsFoulCfg.DEF_INTENSITY_FACTOR;
    nonShootingFoulRate += nsFoulCfg.PLAYTYPE_MOD[selectedPlayType] ?? 0;
    nonShootingFoulRate *= foulProbMod * matchupFoulMult;
    nonShootingFoulRate = Math.min(nsFoulCfg.MAX_RATE, nonShootingFoulRate);

    if (Math.random() < nonShootingFoulRate) {
        return {
            type: 'foul',
            offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            helpDefenderId,
        };
    }

    // 3.5 Offensive Foul Check — 차징/일리걸 스크린 분리(client 미러 상세 참조)
    let chargeChance = selectedPlayType === 'PostUp'
        ? offFoulConfig.POST_OFFENSIVE_FOUL_RATE
        : offFoulConfig.OFFENSIVE_FOUL_BASE;
    if (defender) {
        chargeChance += (defender.attr.defConsist - 70) * offFoulConfig.CHARGE_BONUS_PER_DEF_CONSIST;
    }
    chargeChance = Math.max(0.005, Math.min(0.04, chargeChance));

    if (Math.random() < chargeChance) {
        return {
            type: 'offensiveFoul' as const,
            offTeam, defTeam, actor, defender,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            helpDefenderId,
        };
    }

    // 일리걸 스크린 — 실제 스크리너에게 귀속
    let actualScreener: LivePlayer | undefined;
    let screenChance = 0;
    if (selectedPlayType === 'PnR_Handler') {
        actualScreener = secondaryActor;
        screenChance = offFoulConfig.SCREEN_FOUL_RATE;
    } else if (selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') {
        actualScreener = actor;
        screenChance = offFoulConfig.SCREEN_FOUL_RATE;
    } else if (selectedPlayType === 'OffBallScreen') {
        actualScreener = screener;
        screenChance = offFoulConfig.OFFBALL_SCREEN_FOUL_RATE;
    }
    if (actualScreener && Math.random() < screenChance) {
        return {
            type: 'offensiveFoul' as const,
            offTeam, defTeam, actor: actualScreener, defender,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            helpDefenderId,
        };
    }

    // 3.6 Technical Foul Check (독립 이벤트) — 공수 양팀 후보 + 점수차 가중(client 미러 상세 참조)
    if (Math.random() < offFoulConfig.TECHNICAL_FOUL_BASE) {
        const techPower = offFoulConfig.TECH_TEMPERAMENT_POWER;
        const allOnCourt = [...offTeam.onCourt, ...defTeam.onCourt];

        const offDeficit = Math.max(0, defTeam.score - offTeam.score);
        const defDeficit = Math.max(0, offTeam.score - defTeam.score);
        const offMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, offDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);
        const defMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, defDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);

        const techWeights = allOnCourt.map(p => {
            const t = p.tendencies?.temperament ?? 0;
            const normalized = Math.max(0.05, (t + 1) / 2);
            const base = Math.pow(normalized, techPower);
            const isOffPlayer = offTeam.onCourt.some(op => op.playerId === p.playerId);
            return base * (isOffPlayer ? offMult : defMult);
        });
        const techTotalW = techWeights.reduce((a, b) => a + b, 0);
        let techRoll = Math.random() * techTotalW;
        let techFouler = allOnCourt[0];
        for (let i = 0; i < allOnCourt.length; i++) {
            techRoll -= techWeights[i];
            if (techRoll <= 0) { techFouler = allOnCourt[i]; break; }
        }
        return {
            type: 'technicalFoul' as const,
            offTeam, defTeam, actor, defender: techFouler,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            helpDefenderId,
        };
    }

    // 3.6.1 Flagrant Foul Check (독립 이벤트)
    // foulProneness(70%) + temperament(30%) 복합 가중, 커브 적용
    // 수비팀 전원 중 가중 랜덤 선택 → 선택된 선수의 합산값으로 최종 확률 결정
    {
        const ffCfg = offFoulConfig;
        const ffPower = ffCfg.FLAGRANT_CURVE_POWER;
        const ffWeights = defTeam.onCourt.map(p => {
            const fp = p.tendencies?.foulProneness ?? 0;
            const tp = p.tendencies?.temperament ?? 0;
            // 가중 합산 (-1~+1) → 0~1 정규화 → 커브
            const combined = fp * ffCfg.FLAGRANT_FOULPRONE_WEIGHT + tp * ffCfg.FLAGRANT_TEMPER_WEIGHT;
            const normalized = Math.max(0.02, (combined + 1) / 2);
            return Math.pow(normalized, ffPower);
        });
        const ffTotalW = ffWeights.reduce((a, b) => a + b, 0);
        let ffRoll = Math.random() * ffTotalW;
        let ffFoulerIdx = 0;
        for (let i = 0; i < defTeam.onCourt.length; i++) {
            ffRoll -= ffWeights[i];
            if (ffRoll <= 0) { ffFoulerIdx = i; break; }
        }

        // 선택된 선수의 합산값으로 최종 발동 확률 결정
        const ffFouler = defTeam.onCourt[ffFoulerIdx];
        const fp = ffFouler.tendencies?.foulProneness ?? 0;
        const tp = ffFouler.tendencies?.temperament ?? 0;
        const combined = fp * ffCfg.FLAGRANT_FOULPRONE_WEIGHT + tp * ffCfg.FLAGRANT_TEMPER_WEIGHT;
        const normalized = Math.max(0.02, (combined + 1) / 2);
        // base × 커브 배율 (normalized^power로 0.003~ceiling 범위)
        const ffChance = Math.min(ffCfg.FLAGRANT_MAX_RATE,
            ffCfg.FLAGRANT_BASE * (1 + Math.pow(normalized, ffPower) * 3));

        if (Math.random() < ffChance) {
            const isFlagrant2 = Math.random() < ffCfg.FLAGRANT_2_CHANCE;
            return {
                type: 'flagrantFoul' as const,
                offTeam, defTeam, actor, defender: ffFouler, points: 0 as const,
                isAndOne: false, playType: selectedPlayType, isSwitch,
                isFlagrant2, isZone,
                helpDefenderId,
            };
        }
    }

    // 3.6.2 Fight Check (싸움 → 양측 퇴장 + 출장정지, 극히 희귀)
    // temperament >= THRESHOLD인 수비 선수만 대상, 리그 전체 시즌 ~5-10건
    {
        const fightCfg = offFoulConfig;
        const hotDefenders = defTeam.onCourt.filter(
            p => (p.tendencies?.temperament ?? 0) >= fightCfg.FIGHT_TEMPERAMENT_THRESHOLD
        );
        if (hotDefenders.length > 0) {
            // 가장 다혈질인 선수의 temperament로 확률 결정
            const hottest = hotDefenders.reduce((a, b) =>
                (b.tendencies?.temperament ?? 0) > (a.tendencies?.temperament ?? 0) ? b : a
            );
            const t = hottest.tendencies?.temperament ?? 0.5;
            // 확률: base × (1 + (t - threshold) × scale)
            const fightChance = fightCfg.FIGHT_BASE_CHANCE
                * (1 + (t - fightCfg.FIGHT_TEMPERAMENT_THRESHOLD) * fightCfg.FIGHT_TEMPERAMENT_SCALE);

            if (Math.random() < fightChance) {
                // 상대: 공격팀 코트 랜덤
                const fightOpponent = offTeam.onCourt[Math.floor(Math.random() * offTeam.onCourt.length)];
                // 출장정지: temperament에 비례 (1~5경기)
                const suspBase = fightCfg.FIGHT_SUSPENSION_MIN;
                const suspRange = fightCfg.FIGHT_SUSPENSION_MAX - suspBase;
                const fighterSusp = suspBase + Math.floor((t - 0.5) * 2 * suspRange * Math.random() + suspRange * 0.5 * Math.random());
                const clampedFighterSusp = Math.min(fightCfg.FIGHT_SUSPENSION_MAX, Math.max(suspBase, fighterSusp));
                // 상대는 보복 정도에 따라 1~2경기 (기본 1, temperament 높으면 2)
                const oppTemp = fightOpponent.tendencies?.temperament ?? 0;
                const oppSusp = oppTemp >= 0.3 ? 2 : 1;

                return {
                    type: 'fight' as const,
                    offTeam, defTeam, actor, defender: hottest,
                    points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
                    fighter: hottest,
                    fightOpponent,
                    fighterSuspension: clampedFighterSusp,
                    opponentSuspension: oppSusp,
                    helpDefenderId,
                };
            }
        }
    }

    // 3.7 Shot Clock Violation Check (수비 전술 + 공격 볼무브 트레이드-오프)
    const offSliders = offTeam.tactics.sliders;
    const defSliders = defTeam.tactics.sliders;
    // [Fix 2026-07-26] defIntensity 연동 제거 — defIntensity는 FG%/파울/체력에만 관여.
    // fullCourtPress로 이전: 1단계 0%p ~ 10단계 +1.0%p (예전 defIntensity 최대치 이전)
    // [2026-07-26] 존 디펜스와 풀코트 프레스 상충 — zoneFreq 높을수록 press 효과 감쇠(최대 50%)
    const pressEffectivenessSC = 1 - (defSliders.zoneFreq - 1) * SIM_CONFIG.ZONE_DEFENSE.PRESS_ZONE_DAMPEN_PER_LEVEL;
    const pressShotClockBonus = Math.max(0, defSliders.fullCourtPress - 1) * offFoulConfig.PRESS_SHOT_CLOCK_FACTOR * pressEffectivenessSC;
    // [2026-07-26] zoneUsage 항목 제거 — 인과관계 없음(존은 개인압박 약함 → 오히려 셋업시간 늘려주는 쪽)
    const shotClockChance = offFoulConfig.SHOT_CLOCK_BASE
        + defSliders.helpDef * offFoulConfig.SHOT_CLOCK_HELP_DEF_FACTOR
        + Math.max(0, 5 - offSliders.pace) * offFoulConfig.SHOT_CLOCK_LOW_PACE_FACTOR
        + offSliders.ballMovement * offFoulConfig.SHOT_CLOCK_HIGH_BM_FACTOR
        + pressShotClockBonus;

    if (Math.random() < shotClockChance) {
        return {
            type: 'shotClockViolation' as const,
            offTeam, defTeam, actor,
            points: 0 as const, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            helpDefenderId,
        };
    }

    // 4. Turnover / Steal Check (Enhanced Logic with Baseline + Context)
    const tovResult = calculateTurnoverChance(offTeam, defTeam, actor, defender, selectedPlayType, pnrCoverage, helpDefender, helpSuccess);

    if (tovResult.isTurnover) {
        return {
            type: 'turnover',
            offTeam, defTeam, actor,
            defender: tovResult.stealer || defender, // Assign credit to helper if Shadow trait triggered
            isSteal: tovResult.isSteal,
            isHelpPlay: tovResult.isHelpPlay,
            points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
            pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
            helpDefenderId,
        };
    }

    // 5. Shot Calculation
    // [2026-07-26 전면 재설계] Zone Defense Modifiers — 존/맨투맨 진짜 트레이드오프 + 플레이타입별 카운터
    // Transition은 하프코트 셋업 전이라 존 개념 자체가 성립 안 함 → 전부 미적용
    const zdCfg = SIM_CONFIG.ZONE_DEFENSE;
    const zoneUsage = defTeam.tactics.sliders.zoneUsage;
    const isZoneEligible = selectedPlayType !== 'Transition';

    // 인테리어 억제 (Rim/Paint/Mid 한정, zoneUsage=10 숙련 -1.5%p ~ zoneUsage=1 미숙 +1.2%p)
    const interiorZoneMod = (isZone && isZoneEligible && (preferredZone === 'Rim' || preferredZone === 'Paint' || preferredZone === 'Mid'))
        ? (5 - zoneUsage) * zdCfg.INTERIOR_COEFF
        : 0;

    // 3점 오픈 보너스 (zoneUsage와 같은 방향 — 골밑 몰빵할수록 외곽이 더 열림)
    const threeOpenZoneMod = (isZone && isZoneEligible && preferredZone === '3PT')
        ? (zoneUsage - 1) * zdCfg.THREE_OPEN_PER_LEVEL
        : 0;

    // 플레이타입별 존/맨투맨 카운터 (zoneUsage 또는 switchFreq 스케일)
    let playTypeZoneMod = 0;
    if (isZone && isZoneEligible) {
        if (selectedPlayType === 'Iso') playTypeZoneMod = -(zoneUsage - 1) * zdCfg.ISO_ZONE_PENALTY_PER_LEVEL;
        else if (selectedPlayType === 'PostUp') playTypeZoneMod = -(zoneUsage - 1) * zdCfg.POSTUP_ZONE_PENALTY_PER_LEVEL;
        else if (selectedPlayType === 'Cut') playTypeZoneMod = (zoneUsage - 1) * zdCfg.CUT_ZONE_BONUS_PER_LEVEL;
        else if (selectedPlayType === 'CatchShoot') playTypeZoneMod = (zoneUsage - 1) * zdCfg.CATCHSHOOT_ZONE_BONUS_PER_LEVEL;
        else if (selectedPlayType === 'DriveKick') playTypeZoneMod = (zoneUsage - 1) * zdCfg.DRIVEKICK_ZONE_BONUS_PER_LEVEL;
        else if (selectedPlayType === 'OffBallScreen') playTypeZoneMod = -(zoneUsage - 1) * zdCfg.OFFBALLSCREEN_ZONE_PENALTY_PER_LEVEL;
    } else if (!isZone && isZoneEligible && selectedPlayType === 'OffBallScreen') {
        // 맨투맨 전용: 스크린이 개인 수비수를 떼어내는 효과 — switchFreq 낮을수록 큼
        playTypeZoneMod = (10 - defTeam.tactics.sliders.switchFreq) * zdCfg.OFFBALLSCREEN_MAN_BONUS_PER_LEVEL;
    }

    const zoneQualityMod = interiorZoneMod + threeOpenZoneMod + playTypeZoneMod;

    // [SaveTendency] shotDiscipline: ±1.5% hit rate (good shot selection)
    const shotDiscMod = (actor.tendencies?.shotDiscipline ?? 0) * 0.015;

    // [SaveTendency] ego: option rank performance differential
    // 1옵션(에이스) + ego=+1.0 → +1.5%, 5옵션 + ego=+1.0 → -1.5%
    const actorOptionRank = getTeamOptionRanks(offTeam).get(actor.playerId) || 3;
    const egoMod = (actor.tendencies?.ego ?? 0) * ((3 - actorOptionRank) / 2) * 0.015;

    // [A-1] 어시스트 퀄리티: 패서의 passVision이 높으면 슈터가 더 좋은 위치에서 캐치
    const assistQualityMod = secondaryActor
        ? (secondaryActor.attr.passVision - 70) * 0.001
        : 0;

    // [A-3] CatchShoot/Handoff 오픈 탐지: 패서 시야가 넓으면 더 좋은 오픈 찬스
    let openDetectionMod = 0;
    if (secondaryActor && (selectedPlayType === 'CatchShoot' || selectedPlayType === 'Handoff'
        || selectedPlayType === 'OffBallScreen' || selectedPlayType === 'DriveKick')) {
        openDetectionMod = (secondaryActor.attr.passVision - 70) * 0.0015;
    }

    // [B-2] 어시스트 전달 퀄리티: 패서의 passAcc가 높으면 슈터가 리듬 유지
    const deliveryQualityMod = secondaryActor
        ? (secondaryActor.attr.passAcc - 70) * 0.0008
        : 0;

    // [B-4] PnR 랍패스 메카닉: PnR_Roll + Rim + Dunk/Layup → 랍 시도/성공 판정
    let lobBonus = 0;
    if (selectedPlayType === 'PnR_Roll' && preferredZone === 'Rim'
        && (shotType === 'Dunk' || shotType === 'Layup') && secondaryActor) {
        const handler = secondaryActor;
        const roller = actor;

        // 랍 시도 확률: 롤러 수직, 핸들러 시야, 수비 커버리지
        let lobChance = 0.15;
        lobChance += (roller.attr.vertical - 70) * 0.003;
        lobChance += (handler.attr.passVision - 70) * 0.002;
        if (pnrCoverage === 'blitz') lobChance += 0.10;
        if (pnrCoverage === 'drop') lobChance -= 0.08;
        lobChance = Math.max(0.05, Math.min(0.45, lobChance));

        if (Math.random() < lobChance) {
            // 랍 성공 판정: passAcc가 핵심
            const lobSuccessRate = Math.max(0.15, Math.min(0.90,
                0.50
                + (handler.attr.passAcc - 70) * 0.008
                + (roller.attr.hands - 70) * 0.004
                + (roller.attr.vertical - 70) * 0.003
            ));

            if (Math.random() < lobSuccessRate) {
                lobBonus = 0.08; // 성공: 이지 피니시 보너스
            } else {
                // 실패: 악송구 턴오버
                return {
                    type: 'turnover',
                    offTeam, defTeam, actor, defender,
                    isSteal: false,
                    points: 0, isAndOne: false,
                    playType: selectedPlayType, isSwitch, isZone,
                    pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
                    helpDefenderId,
                };
            }
        }
    }

    // --- PLAYMAKING ARCHETYPE BONUSES (패서 히든 아키타입) ---
    let playmakingBonus = 0;
    const pmCfg = SIM_CONFIG.PLAYMAKING;
    if (pmCfg.ENABLED && secondaryActor) {
        const pa = secondaryActor.attr;

        // G-1. Clairvoyant: 어시스트 시 슈터 hitRate +2%
        if (pa.passIq >= pmCfg.CLAIRVOYANT_PASSIQ_THRESHOLD &&
            pa.passVision >= pmCfg.CLAIRVOYANT_PASSVISION_THRESHOLD &&
            pa.passAcc >= pmCfg.CLAIRVOYANT_PASSACC_THRESHOLD) {
            playmakingBonus += pmCfg.CLAIRVOYANT_HITRATE_BONUS;
        }

        // G-2. Overseer: PnR_Roll/PnR_Pop 시 롤러 hitRate +3%
        if ((selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') &&
            pa.passIq >= pmCfg.OVERSEER_PASSIQ_THRESHOLD &&
            pa.passAcc >= pmCfg.OVERSEER_PASSACC_THRESHOLD) {
            playmakingBonus += pmCfg.OVERSEER_PNR_ROLLER_BONUS;
        }
    }

    // 3PT 서브존 결정 (hitRate에 개별 능력치 적용 + 스탯 기록 일관성)
    const subZone = resolveDynamicZone(actor, preferredZone as 'Rim' | 'Paint' | 'Mid' | '3PT');

    // [New 2026-07] defReb/offReb 속공 트레이드오프 B — 방금 우리 수비 리바운드로 시작된 Transition에서,
    // 상대(방금 슛 쏜 팀)의 offReb에 따라 대칭적 보너스/페널티 부여.
    // 상대offReb≥7(크래시 하드) → 수비 전환이 늦어 우리 속공에 보너스
    // 상대offReb<5(백코트 전념) → 이미 수비가 준비돼 있어 우리 속공에 페널티
    const drtCfg2 = SIM_CONFIG.DEF_REB_TRANSITION;
    let defRebSuccessBonus = 0;
    if (state.lastEntryWasDefReb && selectedPlayType === 'Transition') {
        const oppOffReb = defTeam.tactics.sliders.offReb;
        if (oppOffReb >= drtCfg2.SUCCESS_THRESHOLD) {
            defRebSuccessBonus = (oppOffReb - drtCfg2.SUCCESS_THRESHOLD) * drtCfg2.SUCCESS_BONUS_PER_LEVEL;
        } else if (oppOffReb < drtCfg2.RETREAT_THRESHOLD) {
            defRebSuccessBonus = -(drtCfg2.RETREAT_THRESHOLD - oppOffReb) * drtCfg2.RETREAT_PENALTY_PER_LEVEL;
        }
    }

    const shotContext = calculateHitRate(
        actor, defender, defTeam,
        selectedPlayType, preferredZone,
        sliders, // Pass full sliders
        bonusHitRate + zoneQualityMod + getMomentumBonus(state, offTeam.id) + foulDefPenalty + shotDiscMod + egoMod + assistQualityMod + openDetectionMod + deliveryQualityMod + lobBonus + playmakingBonus + ((actor.morale - 50) / 50) * 0.018 + helpHitRatePenalty + defRebSuccessBonus,
        offTeam.acePlayerId,
        isBotchedSwitch, isSwitch,
        options?.minHitRate,
        state.possession === 'home',
        state.simSettings.homeAdvantage,
        options?.clutchContext,
        pnrCoverage,
        screenerDefender,
        shotType,
        subZone
    );

    // --- BLOCK CALCULATION (모든 슛 대상, hitRate 판정 전) ---
    let isBlock = false;
    let finalDefender = defender;
    let isHelpBlock = false;

    if (defender && preferredZone) {
        const blkCfg = SIM_CONFIG.BLOCK;

        // A. Determine Base Probability by Zone
        let blockProb = 0;
        if (preferredZone === 'Rim') blockProb = blkCfg.BASE_RIM;
        else if (preferredZone === 'Paint') blockProb = blkCfg.BASE_PAINT;
        else if (preferredZone === 'Mid') blockProb = blkCfg.BASE_MID;
        else if (preferredZone === '3PT') blockProb = blkCfg.BASE_3PT;

        // B. Defender Attribute Modifiers (커브 기반)
        const defBlk = defender.attr.blk;
        const defVert = defender.attr.vertical;
        const defHeight = defender.attr.height;

        const blkBonus = interpolateCurve(defBlk, blkCfg.BLK_CURVE);
        const heightBonus = Math.max(0, (defHeight - 200) * blkCfg.HEIGHT_FACTOR);
        const vertBonus = Math.max(0, (defVert - 70) * blkCfg.VERT_FACTOR);

        blockProb += blkBonus + heightBonus + vertBonus;

        // C. ELITE THRESHOLD BONUSES (Blocker Archetypes — 조건부 발동)
        let archetypeBonus = 0;

        if (blkCfg.ENABLED) {
            // D-2. The Alien: Rim + Paint 존에서만 발동 (긴 팔로 영역 커버)
            if (defHeight >= 216 && defBlk >= 80 &&
                (preferredZone === 'Rim' || preferredZone === 'Paint')) {
                archetypeBonus = blkCfg.ARCHETYPE_ALIEN;
            }
            // D-3. Skywalker: Transition + Cut에서만 발동 (체이스다운/헬프사이드)
            else if (defVert >= 95 && defBlk >= 75 &&
                (selectedPlayType === 'Transition' || selectedPlayType === 'Cut')) {
                archetypeBonus = blkCfg.ARCHETYPE_SKYWALKER;
            }
            // D-4. Defensive Anchor: 1차 블락 아닌 헬프 블락에서 발동 (아래 F 섹션)
        }

        blockProb += archetypeBonus;

        // D. Offense Resistance (Avoidance)
        // High ShotIQ and High Release point (Height) reduces block chance
        const offResist = ((actor.attr.shotIq - 70) * 0.001) + ((actor.attr.height - 190) * 0.0005);
        blockProb -= Math.max(0, offResist);

        // D-2. PnR Coverage Block Modifiers
        const pnrBlkCfg = SIM_CONFIG.PNR_COVERAGE;
        if (pnrCoverage === 'drop' && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
            blockProb += pnrBlkCfg.DROP_BLOCK_BONUS;
        }
        if (pnrCoverage === 'blitz' && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
            blockProb -= pnrBlkCfg.BLITZ_BLOCK_PENALTY;
        }

        // --- ZONE SHOOTING ARCHETYPES: Block Reduction ---
        const zCfg = SIM_CONFIG.ZONE_SHOOTING;
        if (zCfg.ENABLED) {
            // B-3. Tyrant: Rim/Paint에서 블락 확률 감소
            if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
                actor.attr.ins >= zCfg.TYRANT_INS_THRESHOLD &&
                (actor.attr.strength >= zCfg.TYRANT_STRENGTH_THRESHOLD ||
                 actor.attr.vertical >= zCfg.TYRANT_VERTICAL_THRESHOLD)) {
                blockProb -= zCfg.TYRANT_BLOCK_REDUCTION;
            }

            // B-4. Levitator: Paint에서 블락 확률 50% 감소
            if (preferredZone === 'Paint' &&
                actor.attr.closeShot >= zCfg.FLOATER_CLOSESHOT_THRESHOLD &&
                actor.attr.agility >= zCfg.FLOATER_AGILITY_THRESHOLD &&
                actor.attr.height <= zCfg.FLOATER_MAX_HEIGHT) {
                blockProb *= zCfg.FLOATER_BLOCK_MULTIPLIER;
            }

            // B-6. Ascendant: 가드의 수직 도약으로 Rim 블락 회피
            if (preferredZone === 'Rim' &&
                (actor.position === 'PG' || actor.position === 'SG') &&
                actor.attr.vertical >= zCfg.ASCENDANT_VERTICAL_THRESHOLD &&
                actor.attr.closeShot >= zCfg.ASCENDANT_CLOSESHOT_THRESHOLD) {
                blockProb *= zCfg.ASCENDANT_BLOCK_MULTIPLIER;
            }
        }

        // E-0. shotType별 블록 배율
        const blockMult = SIM_CONFIG.SHOT_DEFENSE.BLOCK_MULT[shotType ?? 'Layup'] ?? 1.0;
        blockProb *= blockMult;
        // Dunk 전용: 공격자 strength/vertical 블록 저항
        if (shotType === 'Dunk') {
            blockProb -= Math.max(0, (actor.attr.strength - 70)) * SIM_CONFIG.SHOT_DEFENSE.DUNK_STR_RESIST;
            blockProb -= Math.max(0, (actor.attr.vertical - 70)) * SIM_CONFIG.SHOT_DEFENSE.DUNK_VERT_RESIST;
        }

        // E. Roll Primary Block
        if (Math.random() < Math.max(0, blockProb)) {
            isBlock = true;
        }
        // F. Help Defense Block (통합 헬프 결과 재사용 — Rim/Paint/Mid만, 3PT 제외)
        // [New 2026-07] 더 이상 blk순 독자 선정 안 함 — 위에서 확정된 helpDefender/helpSuccess 재사용
        else if (helpAttempted && helpSuccess && helpDefender &&
                 (preferredZone === 'Rim' || preferredZone === 'Paint' || preferredZone === 'Mid')) {
             const helper = helpDefender;
             let helpChance = blkCfg.HELP_BASE;
             if (helper.attr.blk >= blkCfg.HELP_BLK_THRESHOLD) helpChance += blkCfg.HELP_BLK_BONUS;
             if (helper.archetypes.rimProtector > blkCfg.HELP_RIM_THRESHOLD) helpChance += blkCfg.HELP_RIM_BONUS;

             // D-4. Defensive Anchor: 스마트 로테이션 → 헬프 블락 확률 2배
             if (blkCfg.ENABLED && helper.attr.helpDefIq >= 92 && helper.attr.blk >= 80) {
                 helpChance *= blkCfg.ARCHETYPE_ANCHOR_HELP_MULT;
             }

             // Mid-range: 체이스다운 블락은 림보다 희귀
             if (preferredZone === 'Mid') helpChance *= blkCfg.HELP_MID_FACTOR;

             if (Math.random() < helpChance) {
                 isBlock = true;
                 finalDefender = helper;
                 isHelpBlock = true;
             }
        }
    }
    // --- BLOCK CALCULATION END ---

    // Hit/Miss 판정 (블락 성공 시 강제 미스)
    const isScore = isBlock ? false : Math.random() < shotContext.rate;

    // And-1: 득점 성공 + 슈팅 파울 동시 발생 (전 존, shotType별 배율)
    let isAndOne = false;
    if (isScore) {
        // [Fix 2026-07-26] defIntensity 연동 제거 — defIntensity는 FG%/파울/체력에만 관여
        const andOneBase = (preferredZone === 'Rim' || preferredZone === 'Paint') ? 0.03 : 0.012;
        const drawFoulAndOneMod = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE) * sFoulCfg.AND1_CURVE_SCALE;
        const and1Mult = SIM_CONFIG.SHOT_DEFENSE.AND1_MULT[shotType ?? 'Layup'] ?? 1.0;
        if (Math.random() < Math.max(0, (andOneBase + drawFoulAndOneMod) * and1Mult)) {
            isAndOne = true;
        }
    }

    // Miss path (블락 or 일반 미스)
    if (!isScore) {
        // Team Rebound Check (dead ball, out-of-bounds → 개인 리바운드 미기록)
        let rebounder: LivePlayer | undefined;
        let reboundType: 'off' | 'def' | undefined;

        if (Math.random() >= SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG) {
            const reb = resolveRebound(state.home, state.away, actor.playerId);
            rebounder = reb.player;
            reboundType = reb.type;
        }

        return {
            type: 'miss',
            offTeam, defTeam,
            actor,
            defender: finalDefender,
            rebounder,
            reboundType,
            points: 0,
            zone: preferredZone,
            playType: selectedPlayType,
            shotType,
            isBlock,
            isAndOne: false,
            matchupEffect: shotContext.matchupEffect,
            isAceTarget: shotContext.isAceTarget,
            isSwitch,
            isMismatch: shotContext.isMismatch,
            pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
            subZone, isZone,
            helpDefenderId,
            isHelpPlay: isHelpBlock,
        };
    }

    const points = preferredZone === '3PT' ? 3 : 2;
    return {
        type: 'score', offTeam, defTeam, actor, assister: secondaryActor, defender: finalDefender, points, zone: preferredZone, playType: selectedPlayType, shotType, isAndOne, matchupEffect: shotContext.matchupEffect, isAceTarget: shotContext.isAceTarget, isSwitch, isMismatch: shotContext.isMismatch, isBotchedSwitch,
        pnrCoverage: pnrCoverage !== 'none' ? pnrCoverage : undefined,
        subZone, isZone,
        helpDefenderId,
    };
}
