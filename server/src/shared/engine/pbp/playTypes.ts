
import { PlayType, TacticalSliders } from '../../types.ts';
import { LivePlayer, TeamState } from './pbpTypes.ts';
import { getContextualMultiplier, getTeamOptionRanks, getTopOptionGap } from './usageSystem.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { calculateScreenerPhysique } from './archetypeSystem.ts';

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
    // [2026-10-28] 속공 마무리 역할 (어시스트·실책 판정·앨리웁용)
    transitionRole?: 'grabGo' | 'handler' | 'runner' | 'trailer';
    // [2026-10-24] 블리츠 패스아웃 수신자 구분 (resolveBlitzPassOut)
    blitzTarget?: 'screener' | 'weakside';
}

// ==========================================================================================
//  Zone Selection Helpers
// ==========================================================================================

/** [2026-10-28] 킥아웃 마인드 배율 — playStyle(−1 패스 ~ +1 슛)이 킥아웃 확률에 곱해진다. */
export function kickoutMindset(playStyle: number): number {
    const c = SIM_CONFIG.HELP_KICKOUT;
    return Math.max(c.MINDSET_MIN, Math.min(c.MINDSET_MAX, 1 - playStyle * c.MINDSET_K));
}

/** [2026-10-28] 속공 볼 운반 능력 */
export function transitionCarry(p: LivePlayer): number {
    return (p.attr.handling + p.attr.spdBall) / 2;
}

/** [2026-10-28] 진입 선수(리바운더·스틸러)가 직접 공을 몰고 가는지(그랩 앤 고) */
export function isGrabAndGo(players: LivePlayer[], p: LivePlayer): boolean {
    const c = SIM_CONFIG.TRANSITION_FLOW;
    const carry = transitionCarry(p);
    const best = Math.max(...players.map(transitionCarry));
    return carry >= c.GRAB_GO_CARRY_MIN || best - carry <= c.GRAB_GO_GAP;
}

/** [2026-10-28] 진입 선수에 따른 속공 전환 확률 배율 — 그랩 앤 고 고정 배율, 아웃렛은 진입 선수 패스 능력 */
export function transitionEntryFreqMult(players: LivePlayer[], entryPlayer: LivePlayer): number {
    const c = SIM_CONFIG.TRANSITION_FLOW;
    if (isGrabAndGo(players, entryPlayer)) return c.GRAB_GO_FREQ_MULT;
    const passNorm = Math.max(0, Math.min(1, ((entryPlayer.attr.passVision + entryPlayer.attr.passAcc) / 2 - 40) / 59));
    return c.OUTLET_FREQ_MIN + (c.OUTLET_FREQ_MAX - c.OUTLET_FREQ_MIN) * passNorm;
}

/** [2026-10-28] 속공 마무리 점수 — 림 마무리·점프·스피드 */
function transitionFinishScore(p: LivePlayer): number {
    return Math.max(p.attr.layup, p.attr.dunk) * 0.5 + p.attr.vertical * 0.2 + p.attr.speed * 0.3;
}

/** [2026-10-28] 운반자가 앞서 뛴 러너에게 패스할 확률 — 운반자 패스 능력·playStyle 마인드·러너 대비 본인 마무리 능력 */
function transitionRunnerPassChance(handler: LivePlayer, runner: LivePlayer): number {
    const c = SIM_CONFIG.TRANSITION_FLOW;
    const passNorm = Math.max(0, Math.min(1, ((handler.attr.passVision + handler.attr.passAcc) / 2 - 40) / 59));
    const passFactor = c.PASS_FACTOR_MIN + (c.PASS_FACTOR_MAX - c.PASS_FACTOR_MIN) * passNorm;
    const ratio = transitionFinishScore(runner) / Math.max(1, transitionFinishScore(handler));
    const finishFactor = Math.max(c.FINISH_FACTOR_MIN, Math.min(c.FINISH_FACTOR_MAX, Math.pow(ratio, c.FINISH_RATIO_EXP)));
    const chance = c.RUNNER_PASS_BASE * passFactor * kickoutMindset(handler.tendencies?.playStyle ?? 0) * finishFactor;
    return Math.max(c.RUNNER_PASS_MIN, Math.min(c.RUNNER_PASS_MAX, chance));
}


export function selectZone(
    zones: ('3PT' | 'Mid' | 'Paint' | 'Rim')[],
    actor: LivePlayer,
    sliders: TacticalSliders,
    // [2026-10-28] 플레이 타입별 존 가중치 배율(예: 속공의 3점 억제). 없으면 1.0
    zoneMult?: Partial<Record<'3PT' | 'Mid' | 'Paint' | 'Rim', number>>
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
        return { zone: z, score: pref * modifier * (zoneMult?.[z] ?? 1) };
    });

    const total = scored.reduce((s, c) => s + c.score, 0);

    // [Safety] 후보 존의 텐던시가 전부 0인 예외적 케이스 (곱셈 구조라 total<=0 가능)
    // [2026-10-24] 균등 무작위 → 선수 능력치가 가장 높은 존. 무작위였을 땐 3점·미드 텐던시가 둘 다 0인 빅맨이
    // PnR_Pop(후보 3PT/Mid)을 받으면 절반을 3점으로 던졌음(샤킬 오닐 49%, 하네스 실측). 플레이·액터는 이미
    // 결정된 뒤라 여기서 "쏘지 않음"은 불가 — 배제는 액터 선정 단계(PnR_Pop 팝퍼 필터)에서 한다.
    if (total <= 0) {
        const a = actor.attr;
        const zoneRating: Record<string, number> = {
            '3PT':   (a.threeCorner + a.three45 + a.threeTop) / 3,
            'Mid':   a.mid,
            'Paint': a.closeShot,
            'Rim':   Math.max(a.layup, a.dunk),
        };
        return zones.reduce((best, z) => zoneRating[z] > zoneRating[best] ? z : best, zones[0]);
    }

    let r = Math.random() * total;
    for (const { zone, score } of scored) {
        r -= score;
        if (r <= 0) return zone;
    }
    return scored[scored.length - 1].zone;
}

type FinishContext = 'drive' | 'post' | 'roll' | 'putback';

export function resolveFinish(
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
        // [2026-10-18] reach(vertical + height bonus) gate, strength hard cut removed (client mirror)
        const dunkReach = actor.attr.vertical + Math.max(0, actor.attr.height - F.DUNK_HEIGHT_BASE) * F.DUNK_HEIGHT_VERT_BONUS;
        if (dunkReach >= F.DUNK_VERT_MIN) {
            options.push({ zone: 'Rim', shotType: 'Dunk', weight: Math.max(0, actor.attr.dunk - B) * F.DUNK_WEIGHT });
        }
        options.push({ zone: 'Rim', shotType: 'Layup', weight: Math.max(0, actor.attr.layup - B) * F.LAYUP_WEIGHT });
    }

    // Paint 옵션
    if (!zone || zone === 'Paint') {
        if (context !== 'putback' && actor.attr.closeShot >= F.FLOATER_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Floater', weight: Math.max(0, actor.attr.closeShot - B) * F.FLOATER_WEIGHT });
        }
        // [2026-10-18] 키 커트라인(208cm)·포스트/롤 한정 제거 → 풋백 제외 전 상황 + 연속 키 배율(제곱형).
        // 키 = 훅 선호도(배율), 클로즈샷 = 근거리 기본기 자격, 포스트업 = 가중치. 클로즈샷 80 미만은 기존 대체(플로터) 유지 —
        // 이 조건이 없으면 플로터/점퍼 자격 없는 선수가 작은 훅 가중치로 페인트 슛을 독점함(docs/history/dev-log.md).
        const hookHeightMult = Math.pow(Math.max(0, Math.min(F.HOOK_HEIGHT_CAP,
            (actor.attr.height - F.HOOK_HEIGHT_BASE) / F.HOOK_HEIGHT_SPAN)), F.HOOK_HEIGHT_POW);
        if (context !== 'putback' && hookHeightMult > 0 && actor.attr.closeShot >= F.HOOK_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Hook', weight: Math.max(0, actor.attr.postPlay - B) * F.HOOK_WEIGHT * hookHeightMult });
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

export function resolvePlayAction(
    team: TeamState, playType: PlayType, sliders: TacticalSliders,
    // [2026-10-24] 블리츠 트랩 탈출 성공 시 possessionHandler가 넘김 → PnR_Handler 패스아웃 컨텍스트 반환
    blitz?: { handler: LivePlayer; screener: LivePlayer },
    // [2026-10-28] 속공 진입 정보 — 진입 선수(수비 리바운더·스틸러)와 진입 방식
    transition?: { entryPlayer?: LivePlayer; entry: 'defReb' | 'steal' | 'other' },
): PlayContext {
    const players = team.onCourt;
    // [2026-09-10] 팀 전체 1~5옵션 랭킹(gravity 기반) — resolvePlayAction 호출당 1회만 계산해
    // 클로저로 재사용. STAR_USAGE_WEIGHTS와 함께 사용(아래 pickWeightedActor 참고).
    const teamRankMap = getTeamOptionRanks(team);
    const topOption = getTopOptionGap(team); // [2026-10-28] 에이스 ballDominance 하한 판정

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

            let ballDom = p.tendencies?.ballDominance ?? 1.0;
            // [2026-10-28] 에이스(코트 위 1옵션, 2옵션과 그래비티 격차 MIN_GAP 이상)는 ballDominance 하한 적용 — shooter 선정에만
            const aceCfg = SIM_CONFIG.ACE_BALL_DOMINANCE;
            if (aceCfg.ENABLED && role === 'shooter' && topOption && topOption.playerId === p.playerId && topOption.gap >= aceCfg.MIN_GAP) {
                ballDom = Math.max(ballDom, aceCfg.FLOOR);
            }
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

    // [2026-10-24] 스크린 자격 — 슬롯 포지션이 아니라 체격 점수(calculateScreenerPhysique, 피로 미반영)가
    // SIM_CONFIG.SCREEN.ELIGIBLE_PHYSIQUE_MIN 이상인 선수. PnR_Handler 스크리너 / Handoff 빅 공용
    // (PnR_Roll/Pop은 POSITION_WEIGHT.PNR_ROLL 슬롯 가중치 유지 — 2026-10-24 재검토 대기).
    // 코트에 자격자가 없으면(스몰 라인업) undefined → 전원 후보 — 체격이 작으니 스크린 판정
    // (possessionHandler.ts resolveScreen)에서 자연히 불리하다.
    const screenEligible = (excludeId?: string): ((p: LivePlayer) => boolean) | undefined => {
        const ok = (p: LivePlayer) => calculateScreenerPhysique(p.attr) >= SIM_CONFIG.SCREEN.ELIGIBLE_PHYSIQUE_MIN;
        return players.some(p => p.playerId !== excludeId && ok(p)) ? ok : undefined;
    };

    // [2026-10-24] 블리츠 패스아웃 — possessionHandler가 블리츠 트랩 탈출 성공 시 resolvePlayAction(..., 'PnR_Handler', ..., { handler, screener })로
    // 다시 호출해 받는 컨텍스트. 스크리너(SIM_CONFIG.BLITZ.SCREENER_SHARE) = 4대3 롤/팝(스크리너 존 성향), 나머지 = 핸들러·스크리너를 뺀
    // 팀원 중 spacer 가중 선정(노마크). 통계는 PnR_Handler + isKickout(핸들러 어시스트 0.9).
    const resolveBlitzPassOut = (handler: LivePlayer, screenerP: LivePlayer): PlayContext => {
        const bCfg = SIM_CONFIG.BLITZ;
        const pkCfg = SIM_CONFIG.PNR_HANDLER_KICKOUT;
        const passIqBonus = Math.max(0, (handler.attr.passIq - pkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * pkCfg.PASSIQ_BONUS_SCALE);
        const others = players.filter(p => p.playerId !== handler.playerId && p.playerId !== screenerP.playerId);
        if (others.length === 0 || Math.random() < bCfg.SCREENER_SHARE) {
            const sZone = selectZone(['Rim', 'Paint', 'Mid', '3PT'], screenerP, sliders);
            if (sZone === 'Rim' || sZone === 'Paint') {
                const { zone, shotType } = resolveFinish(screenerP, 'roll', sliders, sZone);
                return { playType, actor: screenerP, secondaryActor: handler, preferredZone: zone, shotType,
                    bonusHitRate: SIM_CONFIG.PNR_COVERAGE.BLITZ_ROLL_BONUS + passIqBonus, isKickout: true, blitzTarget: 'screener' };
            }
            return { playType, actor: screenerP, secondaryActor: handler, preferredZone: sZone,
                shotType: sZone === '3PT' ? 'CatchShoot' : 'Jumper',
                bonusHitRate: SIM_CONFIG.PNR_COVERAGE.BLITZ_POP_BONUS + passIqBonus, isKickout: true, blitzTarget: 'screener' };
        }
        const target = pickWeightedActor(p => p.archetypes.spacer, handler.playerId, 'shooter', p => p.playerId !== screenerP.playerId);
        const tZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], target, sliders);
        if (tZone === 'Rim' || tZone === 'Paint') {
            const { zone, shotType } = resolveFinish(target, 'post', sliders, tZone);
            return { playType, actor: target, secondaryActor: handler, preferredZone: zone, shotType,
                bonusHitRate: bCfg.OPEN_BONUS + passIqBonus, isKickout: true, blitzTarget: 'weakside' };
        }
        return { playType, actor: target, secondaryActor: handler, preferredZone: tZone,
            shotType: tZone === '3PT' ? 'CatchShoot' : 'Jumper',
            bonusHitRate: bCfg.OPEN_BONUS + passIqBonus, isKickout: true, blitzTarget: 'weakside' };
    };

    switch (playType) {
        case 'Iso': {
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-10-28] Iso 선택 시점 킥아웃 폐지(사용자 결정) — 더블팀(헬프 성공)일 때만 possessionHandler 2.55 헬프 킥아웃이 판정 (client 미러 참고)

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
            if (blitz) return resolveBlitzPassOut(blitz.handler, blitz.screener);
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-10-24] 커버리지 무관 "더블팀 유도 후 킥아웃" 폐지 — 더블팀은 블리츠 커버리지에서만 일어난다(사용자 결정).
            // 블리츠 트랩 판정·패스아웃은 possessionHandler(resolveBlitzTrap) → resolveBlitzPassOut.

            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer', screenEligible(actor.playerId));

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
            rollKickChance *= kickoutMindset(rollPs) * SIM_CONFIG.HELP_KICKOUT.PRE_ROLL_SCALE;

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
            // [2026-10-24] 3점·미드 텐던시가 둘 다 0인 선수(팝아웃 후 쏠 존이 없음)는 팝퍼 후보에서 배제.
            // 코트에 남는 후보가 없으면 배제 없이 슬롯 자격만으로 선정 — 팝을 부른 전술·로스터 구성의 결과는
            // 유저 책임(빈도 보정·플레이 전환 없음, 사용자 결정), 슛 존은 selectZone 폴백(능력치 최고 존)이 정한다.
            const canPop = (p: LivePlayer) => (popEligible[p.position] ?? 0) > 0 && (p.zonePref.three > 0 || p.zonePref.mid > 0);
            const popFilter = players.some(canPop) ? canPop : (p: LivePlayer) => (popEligible[p.position] ?? 0) > 0;
            const popper = pickWeightedActor(
                p => {
                    const threePenalty = Math.max(0.05, Math.min(1.0,
                        p.zonePref.three / SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD));
                    return p.archetypes.popper * (popEligible[p.position] ?? 0) * threePenalty;
                },
                undefined, 'shooter',
                popFilter
            );
            const handler = pickPasser(p => p.archetypes.handler, popper.playerId);
            // [2026-10-18] pop zone by popper's own tendency (3PT vs Mid) + team sliders (client mirror)
            const popZone = selectZone(['3PT', 'Mid'], popper, sliders) as '3PT' | 'Mid';
            return { playType, actor: popper, secondaryActor: handler, preferredZone: popZone, shotType: popZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.01 };
        }
        case 'PostUp': {
            // [2026-09-15] 포지션 가중치 제거 — postScorer 순수 실력 경쟁 (client 미러 참고)
            // [2026-10-24] 체격 혼합(SIM_CONFIG.POST_SELECTION.PHYSIQUE_WEIGHT) — postScorer엔 체격이 없어 엘리트 윙·가드가 빅맨과
            // 같은 점수(드렉슬러 89·조던 95 vs 올라주원 93)를 받아 PostUp의 절반을 외곽 선수가 가져갔음. 포지션 제한이 아니라 체격 비중.
            const postPhysW = SIM_CONFIG.POST_SELECTION.PHYSIQUE_WEIGHT;
            const actor = pickWeightedActor(p => p.archetypes.postScorer * (1 - postPhysW) + calculateScreenerPhysique(p.attr) * postPhysW);

            // [2026-07-31] 더블팀 유도 후 킥아웃 (client 미러 참고)
            const pkCfg = SIM_CONFIG.POST_KICKOUT;
            const postPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
            const passingNorm = Math.max(0, Math.min(1,
                (postPassing - pkCfg.PASSING_MIN) / (pkCfg.PASSING_MAX - pkCfg.PASSING_MIN)));
            let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);
            const postPs = actor.tendencies?.playStyle ?? 0;
            kickChance *= kickoutMindset(postPs) * SIM_CONFIG.HELP_KICKOUT.PRE_ROLL_SCALE;

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
            // [2026-10-18] binary x0.2 -> proportional (min x0.05), same as PnR_Pop (client mirror)
            const actor = pickWeightedActor(p => p.archetypes.spacer * Math.max(0.05, Math.min(1.0,
                p.zonePref.three / SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD)));
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
            // [2026-10-24] 자격: 슬롯 포지션(POSITION_WEIGHT.PNR_ROLL) → 체격 자격(screenEligible)으로 교체
            const big = pickWeightedActor(
                // [2026-10-24] 패서 집중 증폭(pickPasser와 동일: (passVision×passIq/2500)^1.5) — 기존 선형 가중은 점수 폭(70~95)이
                // 좁아 패스 능력이 사실상 무시됐음(패스 45/38/32 벤 월리스가 허브 상위 10위). 핸드오프는 스크린 파생 액션만이
                // 아니라 패서 주도 액션이기도 해서 큰 볼핸들러(시몬스·매직) 허브 증가를 수용(사용자 결정).
                p => (p.attr.passIq * 0.5 + p.attr.hands * 0.5) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
                actor.playerId, 'passer',
                screenEligible(actor.playerId)
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
            // [2026-10-28] 속공 재설계 — 볼 운반자 / 러너 / 트레일러 분리 + 진입 선수(수비 리바운더·스틸러) 분기.
            // 진입 선수가 운반 능력이 있으면 그랩 앤 고(본인이 운반), 아니면 아웃렛(진입 선수 → 볼핸들러). 진입 선수 불명(데드볼 등)이면 볼핸들러.
            const touchdown = (p: LivePlayer) => p.archetypes.connector + ((p.attr.passVision + p.attr.passAcc) / 2) * 0.5;
            const tsCfg = SIM_CONFIG.TRANSITION_SHOT;
            const entryPlayer = transition?.entryPlayer && players.some(p => p.playerId === transition.entryPlayer!.playerId)
                ? transition.entryPlayer : undefined;
            const grabAndGo = !!entryPlayer && SIM_CONFIG.TRANSITION_FLOW.ENABLED && isGrabAndGo(players, entryPlayer);
            let actor: LivePlayer;
            let outletPasser: LivePlayer | undefined;
            if (entryPlayer && grabAndGo) {
                actor = entryPlayer;
                // 그랩 앤 고(수비 리바운드·스틸) = 패스 없음 → 본인 마무리 시 어시스트 없음(사용자 결정)
                outletPasser = undefined;
            } else if (entryPlayer && SIM_CONFIG.TRANSITION_FLOW.ENABLED) {
                actor = pickWeightedActor(p => p.attr.spdBall + p.archetypes.handler, entryPlayer.playerId);
                outletPasser = entryPlayer;
            } else {
                actor = pickWeightedActor(p => p.attr.spdBall + p.archetypes.handler);
                outletPasser = pickPasser(touchdown, actor.playerId);
            }
            const selfRole: 'grabGo' | 'handler' = grabAndGo ? 'grabGo' : 'handler';

            // 속공은 림·페인트가 대부분 — 3점 가중치 TRANSITION_SHOT.THREE_MULT
            const trZone = selectZone(['3PT', 'Paint', 'Rim'], actor, sliders, { '3PT': tsCfg.THREE_MULT });
            if (trZone === '3PT') {
                // 속공 3점: 운반자 풀업 또는 먼저 뛴 동료(spacer, 리바운더 트레일 빅 포함)의 캐치앤슛
                const trPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
                const trPassNorm = Math.max(0, Math.min(1, (trPassing - 40) / 59));
                const trailerChance = Math.min(tsCfg.TRAILER_MAX,
                    (tsCfg.TRAILER_BASE + tsCfg.TRAILER_PASS_SCALE * trPassNorm) * kickoutMindset(actor.tendencies?.playStyle ?? 0));
                if (Math.random() < trailerChance) {
                    const trailer = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
                    if (trailer.playerId !== actor.playerId) {
                        return { playType, actor: trailer, secondaryActor: actor, preferredZone: '3PT', shotType: 'CatchShoot', bonusHitRate: 0.04, transitionRole: 'trailer' };
                    }
                }
                return { playType, actor, secondaryActor: outletPasser, preferredZone: '3PT', shotType: 'Pullup', bonusHitRate: 0.04, transitionRole: selfRole };
            }

            // 림·페인트: 앞서 뛴 러너(스피드·점프·드라이버, 아웃렛 리바운더는 마지막 출발이라 제외)에게 패스할지 판정
            // [2026-10-28] 러너 = 스피드·점프·드라이버 + 체격(림 런), 수비 리바운드 진입이면 리바운드 경합 정도(리바운드 점수/팀 최고)만큼 감점
            const tfCfg = SIM_CONFIG.TRANSITION_FLOW;
            const rbCfg = SIM_CONFIG.REBOUND;
            const rebScore = (p: LivePlayer) => Math.pow(Math.max(1, p.attr.defReb * rbCfg.DRB_REB_WEIGHT + p.attr.boxOut * rbCfg.DRB_BOXOUT_WEIGHT
                + p.attr.vertical * rbCfg.DRB_VERTICAL_WEIGHT + p.attr.strength * rbCfg.DRB_STRENGTH_WEIGHT), rbCfg.SKILL_EXPONENT);
            const rebMax = Math.max(1, ...players.map(rebScore));
            const rebPenalty = transition?.entry === 'defReb' ? tfCfg.RUNNER_REB_PENALTY * (team.tactics.sliders.defReb / 5) : 0;
            const physW = tfCfg.RUNNER_PHYSIQUE_WEIGHT;
            const runner = pickWeightedActor(
                p => ((p.attr.speed * 0.4 + p.attr.vertical * 0.3 + p.archetypes.driver * 0.3) * (1 - physW) + calculateScreenerPhysique(p.attr) * physW)
                    * Math.max(0.1, 1 - rebPenalty * rebScore(p) / rebMax),
                actor.playerId, 'shooter',
                (entryPlayer && !grabAndGo) ? (p => p.playerId !== entryPlayer.playerId) : undefined,
            );
            if (SIM_CONFIG.TRANSITION_FLOW.ENABLED && runner.playerId !== actor.playerId
                && Math.random() < transitionRunnerPassChance(actor, runner)) {
                const rz = selectZone(['Paint', 'Rim'], runner, sliders);
                const { zone, shotType } = resolveFinish(runner, 'drive', sliders, rz);
                return { playType, actor: runner, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.04, transitionRole: 'runner' };
            }
            const { zone, shotType } = resolveFinish(actor, 'drive', sliders, trZone);
            return { playType, actor, secondaryActor: outletPasser, preferredZone: zone, shotType, bonusHitRate: 0.04, transitionRole: selfRole };
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
