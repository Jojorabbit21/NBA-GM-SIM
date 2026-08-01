
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { LivePlayer, TeamState, ClutchContext } from './pbpTypes.ts';
import { PlayContext } from './playTypes.ts';
import { calculateAceStopperImpact } from '../aceStopperSystem.ts';
import { Player, PlayType, TacticalSliders } from '../../types.ts';

export function flattenPlayer(lp: LivePlayer): Player {
    return { ...lp.attr, ...lp, stats: {} as any } as unknown as Player;
}

function calculateTeamDefensiveRating(team: TeamState) {
    let intDef = 0, perDef = 0, pressure = 0, help = 0;
    team.onCourt.forEach(p => {
        intDef += p.attr.intDef;
        perDef += p.attr.perDef;
        pressure += p.attr.def;
        help += p.attr.helpDefIq;
    });
    return { intDef: intDef/5, perDef: perDef/5, pressure: pressure/5, help: help/5 };
}

export interface HitRateResult {
    rate: number;
    matchupEffect: number;
    isAceTarget: boolean;
    isMismatch: boolean;
}

type PnrCoverage = 'drop' | 'hedge' | 'blitz' | 'none';

/** Piecewise linear interpolation: curve = [[x0,y0], [x1,y1], ...] (sorted by x) */
export function interpolateCurve(x: number, curve: readonly (readonly [number, number])[]): number {
    if (x <= curve[0][0]) return curve[0][1];
    if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
    for (let i = 1; i < curve.length; i++) {
        if (x <= curve[i][0]) {
            const [x0, y0] = curve[i - 1];
            const [x1, y1] = curve[i];
            return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return curve[curve.length - 1][1];
}

/**
 * 매치업 격차 — 공격자가 이 zone에서 수비자를 신체/기술로 압도하는 정도(+) or 압도당하는 정도(-).
 * [2026-07-29] 슈팅파울 배수(possessionHandler.ts)와 적중률 미스매치 보정이 공유하는 단일
 * 소스(client 미러 상세 참조). 스위치 여부와 무관하게 항상 계산.
 * [2026-08-01 Fix] 골밑 defSkill: intDef/blk는 defRating·블락 확률 시스템에서 이미 반영되는
 * 이중 계산이었고, 4스탯 블렌드 평균이 strength 단독 평균보다 구조적으로 낮아 "평균 매치업"도
 * 공격 쪽으로 +3.6 치우쳐 있었음 — strength 단일 비교로 교체(동일 스탯 비교라 평균 갭이 항상
 * 0에 수렴, client 미러 상세 참조).
 * [2026-08-01 Fix] 퍼리미터 defSkill도 동일 논리(perDef가 defRating과 중복)로 offPower와
 * 동일한 스탯 구성(speed+agility 평균)으로 교체.
 */
export function calculateMatchupGap(
    actor: LivePlayer,
    defender: LivePlayer,
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT'
): number {
    if (zone === 'Rim' || zone === 'Paint') {
        const offPower = actor.attr.strength;
        const defSkill = defender.attr.strength;
        return offPower - defSkill;
    }
    const offPower = (actor.attr.speed + actor.attr.agility) / 2;
    const defSkill = (defender.attr.speed + defender.attr.agility) / 2;
    return offPower - defSkill;
}

export const MATCHUP_GAP_SCALE = 60;

export function calculateHitRate(
    actor: LivePlayer,
    defender: LivePlayer,
    defTeam: TeamState,
    playType: PlayType,
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    offSliders: TacticalSliders,
    bonusHitRate: number,
    acePlayerId?: string,
    isBotchedSwitch: boolean = false,
    isSwitch: boolean = false,
    minHitRate?: number,
    isHome: boolean = false,
    homeAdvantage: number = 0.02,
    clutchContext?: ClutchContext,
    pnrCoverage: PnrCoverage = 'none',
    screenerDefender?: LivePlayer,
    shotType?: PlayContext['shotType'],
    threeSubZone?: string
): HitRateResult {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    if (preferredZone === 'Rim' || preferredZone === 'Paint') hitRate = S.INSIDE_BASE_PCT;
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT;
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT;

    hitRate += bonusHitRate;

    let zoneOffRating: number;
    if (preferredZone === '3PT') {
        if (threeSubZone?.startsWith('zone_c3'))
            zoneOffRating = actor.attr.threeCorner;
        else if (threeSubZone === 'zone_atb3_c')
            zoneOffRating = actor.attr.threeTop;
        else if (threeSubZone?.startsWith('zone_atb3'))
            zoneOffRating = actor.attr.three45;
        else
            zoneOffRating = actor.attr.threeVal;
    } else if (preferredZone === 'Mid') {
        if (shotType === 'Fadeaway')
            zoneOffRating = actor.attr.postPlay * 0.3 + actor.attr.mid * 0.5 + actor.attr.closeShot * 0.2;
        else
            zoneOffRating = actor.attr.mid;
    } else if (preferredZone === 'Rim') {
        if (shotType === 'Dunk') zoneOffRating = actor.attr.dunk;
        else                     zoneOffRating = actor.attr.layup;
    } else {
        if (shotType === 'Floater') zoneOffRating = actor.attr.closeShot;
        else if (shotType === 'Jumper') zoneOffRating = actor.attr.closeShot * 0.6 + actor.attr.mid * 0.4;
        else zoneOffRating = actor.attr.postPlay * 0.45 + actor.attr.closeShot * 0.30 + actor.attr.hands * 0.25;
    }

    if (isBotchedSwitch) {
        const attackerShooting = zoneOffRating;
        const openShotBonus    = 0.20;
        const attackerMod      = (attackerShooting - 70) * 0.001;
        return {
            rate: Math.min(0.82, hitRate + openShotBonus + attackerMod),
            matchupEffect: 0, isAceTarget: false, isMismatch: false
        };
    }

    const fatigueOff = actor.currentCondition / 100;
    const fatigueDef = defender.currentCondition / 100;

    hitRate += (fatigueOff - 0.30) * 0.10;
    if (fatigueOff < 0.30) {
        hitRate -= (actor.tendencies?.focusDrift ?? 0) * (0.30 - fatigueOff) * 0.05;
    }
    hitRate -= (fatigueDef - 0.30) * 0.05;

    const offRating = zoneOffRating;
    const baseDefRating = preferredZone === '3PT' ? defender.attr.perDef : defender.attr.intDef;
    let defRating = baseDefRating + (defender.tendencies?.defensiveMotor ?? 0) * 3;

    const defConsist = (defender.attr?.defConsist ?? 50);
    defRating += (defConsist - 70) * 0.3;
    const lapseChance = Math.max(0, (70 - defConsist) * 0.003);
    if (lapseChance > 0 && Math.random() < lapseChance) {
        defRating *= 0.7;
    }

    // [Fix 2026-07-26] Def Intensity: 매치업(수비자 능력 vs 공격자 능력) 게이팅 — 매치업이 나쁘면
    // 슬라이더 설정과 무관하게 억제 효과가 거의 사라진다. 3PT/Mid는 perDef, Rim/Paint는 intDef 기준.
    const isPerimeterZone = preferredZone === '3PT' || preferredZone === 'Mid';
    const matchupDefRating = isPerimeterZone ? defender.attr.perDef : defender.attr.intDef;
    const matchupDiff = matchupDefRating - offRating;
    const matchupCurve = isPerimeterZone ? S.DEF_INTENSITY_MATCHUP_CURVE_PERIMETER : S.DEF_INTENSITY_MATCHUP_CURVE_INTERIOR;
    const intensityMatchup = interpolateCurve(matchupDiff, matchupCurve);
    const intensityMod = (defTeam.tactics.sliders.defIntensity - 5.5) * 0.006 * intensityMatchup;

    let contestFactor = SIM_CONFIG.SHOT_DEFENSE.CONTEST[shotType ?? 'Layup'] ?? 1.0;

    if (SIM_CONFIG.ZONE_SHOOTING.ENABLED && preferredZone === '3PT' &&
        actor.attr.shotIq >= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_SHOTIQ_THRESHOLD &&
        actor.attr.offConsist >= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_OFFCONSIST_THRESHOLD) {
        contestFactor *= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_CONTEST_MULTIPLIER;
    }

    if (preferredZone === '3PT') {
        const offMod = interpolateCurve(offRating, S.THREE_OFF_CURVE);
        const defMod = defRating * contestFactor * S.THREE_DEF_COEFF;
        hitRate += offMod - defMod;
        if (threeSubZone?.startsWith('zone_c3')) hitRate += S.THREE_CORNER_BONUS;
    } else {
        const st = shotType ?? 'Layup';
        const shotCurve = st === 'Dunk' ? S.DUNK_OFF_CURVE
            : st === 'Layup' ? S.LAYUP_OFF_CURVE
            : st === 'Floater' ? S.FLOATER_OFF_CURVE
            : st === 'Hook' ? S.HOOK_OFF_CURVE
            : S.MID_OFF_CURVE;
        const defCoeff = st === 'Dunk' ? S.DUNK_DEF_COEFF
            : preferredZone === 'Mid' ? S.MID_DEF_COEFF
            : S.INSIDE_DEF_COEFF;
        const offMod = interpolateCurve(offRating, shotCurve);
        const defMod = defRating * contestFactor * defCoeff;
        hitRate += offMod - defMod;
    }

    // [2026-07-31 Fix] shotIq: 대칭 노이즈 (평균 0, 진폭만 |shotIq-70|에 비례)
    // 기존엔 shotIq>70일 때 0~+range로만, <70일 때 -range~0으로만 뽑혀서
    // "노이즈"가 아니라 매 슛 확정 편향 보너스/페널티로 작동 → 상위권 TS% 과대 인플레 원인.
    const shotIqRange = Math.abs(actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
    const shotIqNoise = shotIqRange !== 0 ? (Math.random() * 2 - 1) * shotIqRange : 0;
    const consistRange = Math.max(0, (S.CONSIST_BASELINE - actor.attr.offConsist)) * S.CONSIST_NOISE_COEFF;
    const consistNoise = consistRange > 0 ? (Math.random() * 2 - 1) * consistRange : 0;
    hitRate += shotIqNoise + consistNoise;

    hitRate -= intensityMod;

    const zCfg = SIM_CONFIG.ZONE_SHOOTING;
    if (zCfg.ENABLED) {
        if (preferredZone === 'Mid' && actor.attr.mid >= zCfg.FUNDAMENTAL_MID_THRESHOLD) {
            if (clutchContext?.isClutch) hitRate += zCfg.FUNDAMENTAL_CLUTCH_BONUS;
            if (playType === 'Iso') hitRate += zCfg.FUNDAMENTAL_ISO_BONUS;
        }

        if (preferredZone === '3PT' && clutchContext?.isClutch &&
            actor.attr.threeVal >= zCfg.RANGEMASTER_THREEVAL_THRESHOLD &&
            actor.attr.shotIq >= zCfg.RANGEMASTER_SHOTIQ_THRESHOLD) {
            hitRate += zCfg.RANGEMASTER_CLUTCH_BONUS;
        }

        if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
            actor.attr.ins >= zCfg.TYRANT_INS_THRESHOLD &&
            (actor.attr.strength >= zCfg.TYRANT_STRENGTH_THRESHOLD ||
             actor.attr.vertical >= zCfg.TYRANT_VERTICAL_THRESHOLD)) {
            hitRate += zCfg.TYRANT_HITRATE_BONUS;
        }

        if (playType === 'Transition' &&
            actor.attr.speed >= zCfg.AFTERBURNER_SPEED_THRESHOLD &&
            actor.attr.spdBall >= zCfg.AFTERBURNER_SPDBALL_THRESHOLD &&
            actor.attr.agility >= zCfg.AFTERBURNER_AGILITY_THRESHOLD) {
            hitRate += zCfg.AFTERBURNER_TRANSITION_BONUS;
        }
    }

    if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
        (playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler')) {
        hitRate += (actor.attr.spdBall - 70) * 0.001;
    }

    if (pnrCoverage !== 'none') {
        const pCfg = SIM_CONFIG.PNR_COVERAGE;
        const isPnrHandler = playType === 'PnR_Handler';
        const isPnrRoll = playType === 'PnR_Roll';
        const isPnrPop = playType === 'PnR_Pop';

        if (pnrCoverage === 'drop') {
            const scale = screenerDefender
                ? 0.7 + (screenerDefender.attr.intDef - 70) * 0.01
                : 1.0;
            if (isPnrHandler && preferredZone === 'Mid') hitRate += pCfg.DROP_HANDLER_MID_BONUS * scale;
            if (isPnrHandler && preferredZone === '3PT') hitRate += pCfg.DROP_HANDLER_3PT_BONUS * scale;
            if (isPnrRoll) hitRate -= pCfg.DROP_ROLL_PENALTY * scale;
            if (isPnrPop) hitRate += pCfg.DROP_POP_BONUS * scale;
        }

        if (pnrCoverage === 'hedge') {
            const bigSpeed = screenerDefender?.attr.speed ?? 70;
            if (isPnrHandler) hitRate -= pCfg.HEDGE_HANDLER_PENALTY;
            if (isPnrRoll) {
                hitRate += pCfg.HEDGE_ROLL_BONUS;
                if (bigSpeed < pCfg.HEDGE_SLOW_BIG_THRESHOLD) hitRate += pCfg.HEDGE_SLOW_BIG_EXTRA;
            }
        }

        if (pnrCoverage === 'blitz') {
            const scale = screenerDefender
                ? 0.7 + ((screenerDefender.attr.perDef + screenerDefender.attr.speed) / 2 - 70) * 0.01
                : 1.0;
            if (isPnrHandler) hitRate -= pCfg.BLITZ_HANDLER_PENALTY * scale;
            if (isPnrRoll) hitRate += pCfg.BLITZ_ROLL_BONUS;
            if (isPnrPop) hitRate += pCfg.BLITZ_POP_BONUS;
        }
    }

    // [2026-07-29] calculateMatchupGap() 기반으로 전면 교체(client 미러 상세 참조) — 스위치 여부와
    // 무관하게 항상 계산, 대칭 적용(수비자 유리 시 적중률 하락도 반영).
    const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
    const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
    const MISMATCH_THRESHOLD_NORM = 0.3;
    const isMismatch = Math.abs(gapNormalized) >= MISMATCH_THRESHOLD_NORM;

    hitRate += gapNormalized * 0.12;

    if (!isMismatch && isSwitch) {
        hitRate -= 0.03;
    }

    const isStopperActive = defTeam.tactics.stopperId === defender.playerId &&
                            actor.playerId === acePlayerId;

    let matchupEffect = 0;
    if (isStopperActive) {
        const impact = calculateAceStopperImpact(flattenPlayer(actor), flattenPlayer(defender), defender.mp);
        hitRate *= (1 + (impact / 100));
        matchupEffect = impact;
    }

    if (offSliders.pace > 5) {
        hitRate -= (offSliders.pace - 5) * 0.01;
    }

    if (isHome) {
        hitRate += homeAdvantage;
    }

    if (clutchContext?.isClutch) {
        const cCfg = SIM_CONFIG.CLUTCH_ARCHETYPE;
        const a = actor.attr;

        const clutchRating = (a.intangibles * 0.50 + a.offConsist * 0.30 + a.shotIq * 0.20) / 100;
        let clutchModifier = (clutchRating - 0.70) * 0.10;
        clutchModifier += (actor.tendencies?.clutchGene ?? 0) * 0.03;

        if (cCfg.ENABLED) {
            if (a.intangibles >= cCfg.CLOSER_INTANGIBLES_THRESHOLD &&
                a.shotIq >= cCfg.CLOSER_SHOTIQ_THRESHOLD) {
                clutchModifier *= cCfg.CLOSER_MODIFIER_MULTIPLIER;
            }
        }

        hitRate += clutchContext.isSuperClutch ? clutchModifier * 1.5 : clutchModifier;

        const isIce = cCfg.ENABLED &&
                      a.intangibles >= cCfg.ICE_INTANGIBLES_THRESHOLD &&
                      a.offConsist >= cCfg.ICE_OFFCONSIST_THRESHOLD;
        if (!isIce) {
            hitRate -= 0.015;
        }

        if (cCfg.ENABLED &&
            (preferredZone === 'Rim' || preferredZone === 'Paint') &&
            a.intangibles >= cCfg.BIGSTAGE_INTANGIBLES_THRESHOLD &&
            a.strength >= cCfg.BIGSTAGE_STRENGTH_THRESHOLD &&
            a.ins >= cCfg.BIGSTAGE_INS_THRESHOLD) {
            hitRate += cCfg.BIGSTAGE_INSIDE_BONUS;
        }
    }

    // [2026-08-01 Fix] Hot/Cold Streak hitRate 반영 제거, 연출 전용으로 전환 (client 미러 상세 참조).
    // hotColdRating/recentShots 계산은 statsMappers.ts에 그대로 유지.

    let finalRate = Math.max(0.05, Math.min(0.95, hitRate));
    if (minHitRate !== undefined) finalRate = Math.max(finalRate, minHitRate);

    return {
        rate: finalRate,
        matchupEffect,
        isAceTarget: isStopperActive,
        isMismatch
    };
}
