
import { PlayType, TacticalSliders } from '../../../../types';
import { LivePlayer, TeamState } from './pbpTypes';
import { getTeamOptionRanks, getContextualMultiplier } from './usageSystem';
import { SIM_CONFIG } from '../../config/constants';

// ==========================================================================================
//  🏀 PLAY TYPE SYSTEM
//  Specific tactical actions and their execution logic.
//  Updated with Usage Priority System (Option Ranks) & Balanced Hit Rates
// ==========================================================================================

export interface PlayContext {
    playType: PlayType;
    actor: LivePlayer;
    secondaryActor?: LivePlayer; // Screener, Passer, etc.
    screener?: LivePlayer;       // OffBallScreen: 스크리너 (수비 스위치 + bonusHitRate)
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT';
    shotType: 'Dunk' | 'Layup' | 'Floater' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot' | 'Fadeaway';
    bonusHitRate: number; // Tactic success bonus
}

// ==========================================================================================
//  Zone Selection Helpers
// ==========================================================================================

/**
 * 선수 능력치(60%)와 팀 슬라이더(40%)를 결합해 야투구역을 확률적으로 선택한다.
 *
 * score(zone) = (attr(zone) / 100) × 0.60 + (slider(zone) / 10) × 0.40
 *
 * 속성 매핑:
 *   3PT → attr.out      (외곽 슈팅 종합)
 *   Mid → attr.mid      (중거리)
 *   Rim → attr.ins      (골밑/드라이브 마무리)
 *
 * 가중치 구조 (v2 — 선수 DNA 우선):
 *   텐던시(존 선호도) 70% + 전술 슬라이더 30%
 *   능력치(out/mid/ins)는 hitRate에서 반영되므로 존 선택에서는 제외.
 *
 * @param zones  해당 플레이 타입에서 가능한 구역 후보 (플레이 전술 원리에 따라 제한)
 * @param actor  공격 주체 선수
 * @param sliders 공격팀 전술 슬라이더
 */
function selectZone(
    zones: ('3PT' | 'Mid' | 'Paint' | 'Rim')[],
    actor: LivePlayer,
    sliders: TacticalSliders
): 'Rim' | 'Paint' | 'Mid' | '3PT' {
    // 선수 DNA: tendencies.zones → 4존 선호도 (RA/ITP/Mid/3PT, 초기화 시 정규화 완료)
    const prefMap: Record<string, number> = {
        '3PT':   actor.zonePref.three,
        'Mid':   actor.zonePref.mid,
        'Paint': actor.zonePref.itp,
        'Rim':   actor.zonePref.ra,
    };
    const sliderMap: Record<string, number> = {
        '3PT':   sliders.shot_3pt,
        'Mid':   sliders.shot_mid,
        'Paint': sliders.shot_rim,   // 인테리어 공유
        'Rim':   sliders.shot_rim,
    };

    // [Soft Threshold] 임계값 미만 존은 가중치 대폭 감소 (완전 제거 X)
    // 임계값 이상: 정상 가중치 / 미만: ×0.2 페널티 (극소량 시도는 허용)
    const threshold = SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD;
    const scored = zones.map(z => {
        const pref = prefMap[z] < threshold ? prefMap[z] * 0.2 : prefMap[z];
        return { zone: z, score: pref * 0.70 + (sliderMap[z] / 10) * 0.30 };
    });

    const total = scored.reduce((s, c) => s + c.score, 0);
    let r = Math.random() * total;
    for (const { zone, score } of scored) {
        r -= score;
        if (r <= 0) return zone;
    }
    return scored[scored.length - 1].zone;
}

/**
 * 선수 능력치 기반으로 마무리 타입을 확률적으로 선택한다.
 *
 * selectZone()이 존을 결정한 뒤, 해당 존 내에서 shotType을 선택.
 * zone 파라미터가 지정되면 해당 존의 옵션만 생성 (RA↔ITP 분리).
 * zone 미지정(Putback 등)이면 Rim+Paint 모두 후보.
 *
 * 존별 shotType:
 *   Rim   → Dunk, Layup (피지컬 피니시)
 *   Paint → Floater, Hook, Jumper (closeShot 기반 스킬 피니시)
 *   Mid   → Pullup, Jumper, Fadeaway (zone 미지정 시에만)
 */
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

    // ── Rim 옵션 (zone 미지정 또는 'Rim') ──
    if (!zone || zone === 'Rim') {
        // Dunk (Rim) — vertical + strength 충족 시
        if (actor.attr.vertical >= F.DUNK_VERT_MIN && actor.attr.strength >= F.DUNK_STR_MIN) {
            options.push({ zone: 'Rim', shotType: 'Dunk', weight: Math.max(0, actor.attr.dunk - B) * F.DUNK_WEIGHT });
        }
        // Layup (Rim) — 항상 가능
        options.push({ zone: 'Rim', shotType: 'Layup', weight: Math.max(0, actor.attr.layup - B) * F.LAYUP_WEIGHT });
    }

    // ── Paint 옵션 (zone 미지정 또는 'Paint') ──
    if (!zone || zone === 'Paint') {
        // Floater (Paint) — closeShot ≥ 80, putback 제외
        if (context !== 'putback' && actor.attr.closeShot >= F.FLOATER_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Floater', weight: Math.max(0, actor.attr.closeShot - B) * F.FLOATER_WEIGHT });
        }
        // Hook (Paint) — height ≥ 208, closeShot ≥ 80, post/roll만
        if ((context === 'post' || context === 'roll') &&
            actor.attr.height >= F.HOOK_HEIGHT_MIN && actor.attr.closeShot >= F.HOOK_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Hook', weight: Math.max(0, actor.attr.postPlay - B) * F.HOOK_WEIGHT });
        }
        // Short Jumper (Paint) — closeShot 기반 페인트존 점퍼
        if (context !== 'putback' && actor.attr.closeShot >= F.PAINT_JUMPER_CLOSESHOT_MIN) {
            const w = Math.max(0, actor.attr.closeShot - B) * F.PAINT_JUMPER_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Paint', shotType: 'Jumper', weight: w });
        }
    }

    // ── Mid 옵션 (zone 미지정일 때만 — selectZone에서 이미 존 확정 시 제외) ──
    if (!zone) {
        // Pullup (Mid) — drive 컨텍스트만
        if (context === 'drive' && actor.attr.mid >= F.MID_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.MID_DRIVE_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Pullup', weight: w });
        }
        // Jumper (Mid) — post/roll 컨텍스트
        if ((context === 'post' || context === 'roll') && actor.attr.mid >= F.MID_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.MID_POST_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Jumper', weight: w });
        }
        // Fadeaway (Mid) — post 컨텍스트만, 엘리트 포스트 기술
        if (context === 'post' &&
            actor.attr.postPlay >= F.FADEAWAY_POSTPLAY_MIN &&
            actor.attr.mid >= F.FADEAWAY_MID_MIN &&
            actor.attr.closeShot >= F.FADEAWAY_CLOSESHOT_MIN) {
            const w = Math.max(0, actor.attr.mid - B) * F.FADEAWAY_WEIGHT * (sliders.shot_mid / 5);
            options.push({ zone: 'Mid', shotType: 'Fadeaway', weight: w });
        }
    }

    // 가중 랜덤 선택
    const total = options.reduce((s, o) => s + o.weight, 0);
    if (total <= 0) {
        // fallback: 존 제한에 따라 적절한 기본값
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

/**
 * Executes the logic to select the best actor and setup the play context.
 *
 * [Updated] resolvePlayAction now accepts `sliders` to integrate shot_3pt / shot_mid / shot_rim
 * into zone selection for flexible play types (Iso, PnR_Handler, Handoff, Transition).
 * Fixed-zone plays (PnR_Roll, PostUp, CatchShoot, Cut, Putback) are unaffected.
 */
export function resolvePlayAction(team: TeamState, playType: PlayType, sliders: TacticalSliders): PlayContext {
    const players = team.onCourt;

    // [New] 1. Calculate Option Ranks for current lineup (1~5)
    const optionRanks = getTeamOptionRanks(team);

    // [Fix] Weighted Random Selection with Option System Integration
    const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);

        const candidates = pool.map(p => {
            // A. Base Skill Score (Existing Logic)
            const rawScore = criteria(p);

            // B. Option Multiplier (New Logic)
            const rank = optionRanks.get(p.playerId) || 3;
            const usageMultiplier = getContextualMultiplier(rank, playType);

            // C. Final Weight = Skill * OptionMultiplier * Tendencies
            // Linear (pow=1.0): USAGE_WEIGHTS가 계층 구조를 담당, 능력치는 선형 반영
            let weight = Math.max(1, rawScore) * usageMultiplier;

            // [SaveTendency] ballDominance: scales actor selection weight (0.5x~1.5x)
            weight *= (p.tendencies?.ballDominance ?? 1.0);

            // [SaveTendency] playStyle: pass-first(-1) vs shoot-first(+1)
            // Iso, PostUp → shoot-first boost: +30% at playStyle=+1.0
            // PnR_Handler, Handoff → pass-first boost: +20% at playStyle=-1.0
            // CatchShoot, Cut → neutral (receiver role)
            const ps = p.tendencies?.playStyle ?? 0;
            if (playType === 'Iso' || playType === 'PostUp') {
                weight *= (1 + ps * 0.3);
            } else if (playType === 'PnR_Handler' || playType === 'Handoff') {
                weight *= (1 - ps * 0.2);
            }

            return { p, weight: Math.max(0.01, weight) };
        });

        // [Safety] 빈 후보군 방어 (onCourt < 2명 + excludeId 조합 시 가능)
        if (candidates.length === 0) {
            console.error('[PBP DEBUG] pickWeightedActor: empty candidates!', {
                poolSize: players.length, excludeId, playType,
            });
            return players[0]; // onCourt 첫 번째 선수라도 반환
        }

        // 2. Total Weight
        const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

        // 3. Random Pick (Roulette Wheel)
        let random = Math.random() * totalWeight;

        for (const c of candidates) {
            random -= c.weight;
            if (random <= 0) return c.p;
        }

        // Fallback
        return candidates[0].p;
    };

    // Passer Concentration: 어시스터(패서) 선택 시 패싱 능력치를 곱셈으로 적용
    // passVision × passIq → 2500(50×50) 기준 정규화 후 ^1.5 지수로 격차 증폭
    // 엘리트 5.35x, 평균 1.0x, 약체 0.22x → 최고 플레이메이커에게 어시스트 집중
    const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
        return pickWeightedActor(
            p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
            excludeId
        );
    };

    switch (playType) {
        case 'Iso': {
            // Best Iso Scorer (Handling + Agility + Shot Creation)
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);
            // 아이소 진입 패스를 제공한 선수 (어시스트 후보)
            const passer = pickPasser(p => p.archetypes.connector + p.archetypes.handler * 0.3, actor.playerId);

            // 4존 선택: 3PT · Mid · Paint · Rim. Rim/Paint이면 resolveFinish로 마무리 결정.
            const isoZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (isoZone === 'Rim' || isoZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, isoZone);
                return { playType, actor, secondaryActor: passer, preferredZone: zone, shotType, bonusHitRate: 0.00 };
            }
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: isoZone,
                shotType: 'Pullup',
                bonusHitRate: 0.00 // Iso: 순수 스킬 기반
            };
        }
        case 'PnR_Handler': {
            // Best Handler
            const actor = pickWeightedActor(p => p.archetypes.handler);
            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);

            // 4존 선택: 핸들러 풀업 or 스크린 후 드라이브.
            const zone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (zone === 'Rim' || zone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, zone);
                return { playType, actor, secondaryActor: screener, preferredZone: finishZone, shotType, bonusHitRate: 0.01 };
            }
            return {
                playType,
                actor,
                secondaryActor: screener,
                preferredZone: zone,
                shotType: 'Pullup',
                bonusHitRate: 0.01
            };
        }
        case 'PnR_Roll': {
            // Handler passes to Roller (Finisher)
            const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
            const handler = pickPasser(p => p.archetypes.handler, screener.playerId);
            const rollZone = selectZone(['Rim', 'Paint', 'Mid'], screener, sliders);
            if (rollZone === 'Rim' || rollZone === 'Paint') {
                const { zone, shotType } = resolveFinish(screener, 'roll', sliders, rollZone);
                return { playType, actor: screener, secondaryActor: handler, preferredZone: zone, shotType, bonusHitRate: 0.03 };
            }
            return {
                playType,
                actor: screener,
                secondaryActor: handler,
                preferredZone: 'Mid',
                shotType: 'Jumper',
                bonusHitRate: 0.03
            };
        }
        case 'PnR_Pop': {
            // Handler passes to Popper
            const popper = pickWeightedActor(p => p.archetypes.popper);
            const handler = pickPasser(p => p.archetypes.handler, popper.playerId);
            return {
                playType,
                actor: popper,
                secondaryActor: handler,
                preferredZone: '3PT', // 고정: 팝아웃은 항상 3점
                shotType: 'CatchShoot',
                bonusHitRate: 0.01 // PnR_Pop: 팝아웃 오픈 3점 소폭
            };
        }
        case 'PostUp': {
            // Best Post Scorer (Usually Rank 1-2 Bigs)
            const actor = pickWeightedActor(p => p.archetypes.postScorer);
            // 엔트리 패스를 제공한 선수 (어시스트 후보)
            const entryPasser = pickPasser(p => p.archetypes.handler + p.archetypes.connector * 0.5, actor.playerId);
            const postZone = selectZone(['Rim', 'Paint', 'Mid'], actor, sliders);
            if (postZone === 'Rim' || postZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'post', sliders, postZone);
                return { playType, actor, secondaryActor: entryPasser, preferredZone: zone, shotType, bonusHitRate: 0.01 };
            }
            return {
                playType,
                actor,
                secondaryActor: entryPasser,
                preferredZone: 'Mid',
                shotType: 'Jumper',
                bonusHitRate: 0.01
            };
        }
        case 'CatchShoot': {
            // Best Spacer
            const actor = pickWeightedActor(p => p.archetypes.spacer);
            const passer = pickPasser(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);

            // [Play Redirect] 존 선호도에 따라 캐치 후 펌프페이크 → 드라이브 전환 가능
            const catchZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (catchZone === 'Rim' || catchZone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, catchZone);
                return { playType, actor, secondaryActor: passer, preferredZone: finishZone, shotType, bonusHitRate: 0.02 };
            }
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: catchZone,
                shotType: 'CatchShoot',
                bonusHitRate: 0.02
            };
        }
        case 'Cut': {
            // Best Driver/Cutter
            const actor = pickWeightedActor(p => p.archetypes.driver + p.attr.offBallMovement * 0.5);
            const passer = pickPasser(p => p.archetypes.connector, actor.playerId);
            const cutZone = selectZone(['Rim', 'Paint', 'Mid'], actor, sliders);
            if (cutZone === 'Rim' || cutZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, cutZone);
                return { playType, actor, secondaryActor: passer, preferredZone: zone, shotType, bonusHitRate: 0.03 };
            }
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: 'Mid',
                shotType: 'Pullup',
                bonusHitRate: 0.03
            };
        }
        case 'Handoff': {
            // Shooter getting ball from Big
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);

            // 핸드오프 후 캐치 → 4존 선택. 존 선호도에 따라 드라이브 가능.
            const hoZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (hoZone === 'Rim' || hoZone === 'Paint') {
                const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, hoZone);
                return { playType, actor, secondaryActor: big, preferredZone: finishZone, shotType, bonusHitRate: 0.02 };
            }
            return {
                playType,
                actor,
                secondaryActor: big,
                preferredZone: hoZone,
                shotType: hoZone === '3PT' ? 'CatchShoot' : 'Jumper',
                bonusHitRate: 0.02
            };
        }
        case 'Transition': {
            // Fast break
            const actor = pickWeightedActor(p => p.attr.spdBall + p.archetypes.driver);
            // 속공 패스를 제공한 선수 (아웃렛/푸시어헤드 패스)
            const outletPasser = pickPasser(p => p.archetypes.connector + p.attr.passVision * 0.3, actor.playerId);

            // 속공 = Rim/Paint(resolveFinish) or 트랜지션 3점.
            const trZone = selectZone(['3PT', 'Paint', 'Rim'], actor, sliders);
            if (trZone === 'Rim' || trZone === 'Paint') {
                const { zone, shotType } = resolveFinish(actor, 'drive', sliders, trZone);
                return { playType, actor, secondaryActor: outletPasser, preferredZone: zone, shotType, bonusHitRate: 0.04 };
            }
            return {
                playType,
                actor,
                secondaryActor: outletPasser,
                preferredZone: trZone,
                shotType: 'Pullup',
                bonusHitRate: 0.04 // Transition: 속공 오픈 이점
            };
        }
        case 'Putback': {
            // Second Chance
            const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);
            const { zone: pbZone, shotType: pbShotType } = resolveFinish(actor, 'putback', sliders);
            return {
                playType,
                actor,
                preferredZone: pbZone,
                shotType: pbShotType,
                bonusHitRate: 0.05 // Putback: 세컨드찬스 이점 (57+5=62%)
            };
        }
        case 'OffBallScreen': {
            // 오프볼 스크린 후 슈터 캐치앤슛
            // 1. 슈터: 스크린을 활용하는 캐치앤슛 전문가
            const actor = pickWeightedActor(
                p => p.archetypes.spacer + p.attr.offBallMovement * 0.3 + p.attr.speed * 0.1
            );
            // 2. 스크리너: 오프볼 스크린 퀄리티 (피지컬 기반)
            const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
            // 3. 패서: 스크린 후 오픈된 슈터를 찾아 패스 (어시스트 담당)
            const passer = pickPasser(
                p => p.archetypes.handler + p.archetypes.connector * 0.5, actor.playerId
            );

            // 스크린 퀄리티 → bonusHitRate 보정
            // screener 아키타입 50 기준, 0~100 범위 → 0.00~0.02 보너스
            const screenBonus = Math.max(0, (screener.archetypes.screener - 50) / 50 * 0.02);

            // [Play Redirect] 존 선호도에 따라 스크린 후 컬 드라이브 가능
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
            // 드라이브 킥아웃: 드라이버가 침투 후 외곽 슈터에게 패스
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.attr.out * 0.3);
            const driver = pickPasser(
                p => p.archetypes.driver + p.archetypes.handler * 0.3, actor.playerId
            );

            // 드라이버 퀄리티 → bonusHitRate 보정
            // 침투력 (speed, agility, handling) + 킥아웃 패스 (passVision, passAcc)
            const penetration = (driver.attr.speed + driver.attr.agility + driver.attr.handling) / 3;
            const kickPass = (driver.attr.passVision + driver.attr.passAcc) / 2;
            const driveQuality = penetration * 0.6 + kickPass * 0.4;
            const driveBonus = Math.max(0, (driveQuality - 70) / 30 * 0.02);

            // [Play Redirect] 존 선호도에 따라 드라이버가 킥아웃 안 하고 직접 마무리 가능
            const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            if (dkZone === 'Rim' || dkZone === 'Paint') {
                // 드라이버가 직접 마무리 → actor를 driver로 교체, 어시스트 없음
                const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, dkZone);
                return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
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
