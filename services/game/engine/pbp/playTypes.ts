
import { PlayType, TacticalSliders } from '../../../../types';
import { LivePlayer, TeamState } from './pbpTypes';
import { getTeamOptionRanks, getContextualMultiplier } from './usageSystem';

// ==========================================================================================
//  🏀 PLAY TYPE SYSTEM
//  Specific tactical actions and their execution logic.
//  Updated with Usage Priority System (Option Ranks) & Balanced Hit Rates
// ==========================================================================================

export interface PlayContext {
    playType: PlayType;
    actor: LivePlayer;
    secondaryActor?: LivePlayer; // Screener, Passer, etc.
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT';
    shotType: 'Dunk' | 'Layup' | 'Jumper' | 'Pullup' | 'Hook' | 'CatchShoot';
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
 * @param zones  해당 플레이 타입에서 가능한 구역 후보 (플레이 전술 원리에 따라 제한)
 * @param actor  공격 주체 선수
 * @param sliders 공격팀 전술 슬라이더
 */
function selectZone(
    zones: ('3PT' | 'Mid' | 'Rim')[],
    actor: LivePlayer,
    sliders: TacticalSliders
): 'Rim' | 'Mid' | '3PT' {
    const attrMap: Record<string, number> = {
        '3PT': actor.attr.out,   // out = 외곽 슈팅 종합 (flowEngine 기준 동일)
        'Mid': actor.attr.mid,   // mid = 중거리 슈팅 (attr.midRange 아님 — LivePlayer.attr 기준)
        'Rim': actor.attr.ins,   // ins = 골밑/드라이브 마무리
    };
    const sliderMap: Record<string, number> = {
        '3PT': sliders.shot_3pt,
        'Mid': sliders.shot_mid,
        'Rim': sliders.shot_rim,
    };

    const scored = zones.map(z => ({
        zone: z,
        score: (attrMap[z] / 100) * 0.60 + (sliderMap[z] / 10) * 0.40,
    }));

    const total = scored.reduce((s, c) => s + c.score, 0);
    let r = Math.random() * total;
    for (const { zone, score } of scored) {
        r -= score;
        if (r <= 0) return zone;
    }
    return scored[scored.length - 1].zone;
}

/**
 * 동적으로 결정된 구역에 맞는 shotType을 반환한다.
 *
 * Rim: 수직점프(vertical) + 골밑 능력(ins)이 모두 엘리트급이면 Dunk, 아니면 Layup
 * Mid: Handoff처럼 캐치 후 바로 릴리스하면 Jumper, 드리블 뒤 풀업이면 Pullup
 * 3PT: Handoff/CatchShoot 계열이면 CatchShoot, 나머지는 Pullup
 */
function shotTypeForZone(
    zone: 'Rim' | 'Mid' | '3PT',
    actor: LivePlayer,
    playType: PlayType
): PlayContext['shotType'] {
    if (zone === 'Rim') {
        return (actor.attr.vertical >= 90 && actor.attr.ins >= 88) ? 'Dunk' : 'Layup';
    }
    if (zone === '3PT') {
        return playType === 'Handoff' ? 'CatchShoot' : 'Pullup';
    }
    // Mid
    return playType === 'Handoff' ? 'Jumper' : 'Pullup';
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

            // C. Final Weight = Skill^2.5 * OptionMultiplier
            // Power of 2.5 emphasizes skill gap, OptionMultiplier enforces hierarchy
            const weight = Math.pow(Math.max(1, rawScore), 2.5) * usageMultiplier;

            return { p, weight };
        });

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

    switch (playType) {
        case 'Iso': {
            // Best Iso Scorer (Handling + Agility + Shot Creation)
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [Updated] 3PT · Mid · Rim 모두 후보. 선수 능력치 + 팀 슬라이더로 확률 결정.
            const zone = selectZone(['3PT', 'Mid', 'Rim'], actor, sliders);
            return {
                playType,
                actor,
                preferredZone: zone,
                shotType: shotTypeForZone(zone, actor, playType),
                bonusHitRate: 0.00 // Iso: 순수 스킬 기반
            };
        }
        case 'PnR_Handler': {
            // Best Handler
            const actor = pickWeightedActor(p => p.archetypes.handler);
            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);

            // [Updated] 핸들러 풀업 = 3PT or Mid만 가능. Rim 드라이브는 PnR_Roll의 역할.
            const zone = selectZone(['3PT', 'Mid'], actor, sliders);
            return {
                playType,
                actor,
                secondaryActor: screener,
                preferredZone: zone,
                shotType: 'Pullup',
                bonusHitRate: 0.01 // PnR_Handler: 스크린 풀업 소폭
            };
        }
        case 'PnR_Roll': {
            // Handler passes to Roller (Finisher)
            const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
            const handler = pickWeightedActor(p => p.archetypes.handler, screener.playerId);
            return {
                playType,
                actor: screener, // Finisher
                secondaryActor: handler, // Assister
                preferredZone: 'Rim', // 고정: 롤맨은 항상 림으로
                shotType: 'Dunk',
                bonusHitRate: 0.03 // PnR_Roll: 롤맨 림 어택 이점
            };
        }
        case 'PnR_Pop': {
            // Handler passes to Popper
            const popper = pickWeightedActor(p => p.archetypes.popper);
            const handler = pickWeightedActor(p => p.archetypes.handler, popper.playerId);
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
            return {
                playType,
                actor,
                preferredZone: 'Paint', // 고정: 포스트업은 항상 인사이드
                shotType: 'Hook',
                bonusHitRate: 0.01 // PostUp: Paint 인사이드 소폭
            };
        }
        case 'CatchShoot': {
            // Best Spacer
            const actor = pickWeightedActor(p => p.archetypes.spacer);
            const passer = pickWeightedActor(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: '3PT', // 고정: 스팟업 캐치샷은 항상 3점
                shotType: 'CatchShoot',
                bonusHitRate: 0.02 // CatchShoot: 오픈 3점 이점 (34+2=36% = NBA 평균 3P%)
            };
        }
        case 'Cut': {
            // Best Driver/Cutter
            const actor = pickWeightedActor(p => p.archetypes.driver + p.attr.shotIq * 0.5);
            const passer = pickWeightedActor(p => p.archetypes.connector, actor.playerId);
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: 'Rim', // 고정: 커팅은 항상 림
                shotType: 'Layup',
                bonusHitRate: 0.03 // Cut: 커팅 타이밍 이점 (57+3=60%)
            };
        }
        case 'Handoff': {
            // Shooter getting ball from Big
            const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
            const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);

            // [Updated] 핸드오프 후 캐치 → 3PT or Mid 선택. Rim 드라이브는 없음.
            const zone = selectZone(['3PT', 'Mid'], actor, sliders);
            return {
                playType,
                actor,
                secondaryActor: big,
                preferredZone: zone,
                shotType: shotTypeForZone(zone, actor, playType),
                bonusHitRate: 0.02 // Handoff: 캐치 후 즉시 릴리스 이점
            };
        }
        case 'Transition': {
            // Fast break
            const actor = pickWeightedActor(p => p.attr.speed + p.archetypes.driver);

            // [Updated] 속공 = 레이업(Rim) or 트랜지션 3점. 중거리는 없음.
            const zone = selectZone(['3PT', 'Rim'], actor, sliders);
            return {
                playType,
                actor,
                preferredZone: zone,
                shotType: shotTypeForZone(zone, actor, playType),
                bonusHitRate: 0.04 // Transition: 속공 오픈 이점 (Rim: 57+4=61%)
            };
        }
        case 'Putback': {
            // Second Chance
            const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);
            return {
                playType,
                actor,
                preferredZone: 'Rim', // 고정: 세컨드찬스는 항상 림
                shotType: 'Layup',
                bonusHitRate: 0.05 // Putback: 세컨드찬스 이점 (57+5=62%)
            };
        }
        default: {
            const actor = players[Math.floor(Math.random() * players.length)];
            return { playType: 'Iso', actor, preferredZone: 'Mid', shotType: 'Jumper', bonusHitRate: 0 };
        }
    }
}
