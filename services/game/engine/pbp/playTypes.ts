
import { PlayType, TacticalSliders } from '../../../../types';
import { LivePlayer, TeamState } from './pbpTypes';
import { getContextualMultiplier, getTeamOptionRanks } from './usageSystem';
import { SIM_CONFIG } from '../../config/constants';
import { calculateScreenerPhysique } from './archetypeSystem';

// [2026-09-10] 팀 전체 1~5옵션(gravity 기반, getTeamOptionRanks) 배율 — 가드 1옵션 실제 기능 문제
// 대응. 로컬 플레이타입 criteria(usageMultiplier, 최대 7.3배 스프레드)를 압도하지 않도록 완만하게
// (1.56배 스프레드) 설정 — "국소 스킬 경쟁"은 그대로 두고 "그래도 우리 팀 진짜 에이스인가"를 근소한
// 차이의 타이브레이커로만 반영. PBL 1230경기 검증: 1옵션 FGA 역전율 46.4%→35.5%(-10.9%p), 역할선수
// (팀랭크 3~5) 억제 부작용은 -2.4%p로 작음(docs/history/dev-log.md 참고).
const STAR_USAGE_WEIGHTS = [1.25, 1.10, 1.00, 0.90, 0.80];

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
    // [2026-07-31] PostUp/PnR_Roll 더블팀 유도 후 킥아웃으로 actor가 교체됐는지
    isKickout?: boolean;
    // [2026-10-24] 블리츠 패스아웃 수신자 구분 (resolveBlitzPassOut)
    blitzTarget?: 'screener' | 'weakside';
}

// ==========================================================================================
//  Zone Selection Helpers
// ==========================================================================================

/**
 * 선수의 존 텐던시(zonePref)를 기준으로 야투구역을 확률적으로 선택한다.
 * 전술 슬라이더는 텐던시가 0인 존을 새로 만들어내지 않고, 텐던시가 이미 있는 존들
 * 사이의 비중만 증폭/감쇄한다 (곱셈 구조).
 *
 * score(zone) = pref(zone) × modifier(zone)
 * modifier(zone) = 1 + (slider(zone) - 5) / 5 × SLIDER_SENSITIVITY
 *   → 슬라이더 5(중립) = 1.0배, 10(최대) = 1+SENS배, 0(최소) = 1-SENS배
 *
 * pref(zone)=0이면 슬라이더가 무엇이든 score=0 그대로 유지된다 — 텐던시 없는 존은
 * 절대 선택되지 않는다. (구 버전은 pref*0.7 + slider*0.3 덧셈 구조라 슬라이더 항이
 * 텐던시 0인 존에도 항상 남아있었음 — 이 문제를 해결하기 위한 변경)
 *
 * @param zones  해당 플레이 타입에서 가능한 구역 후보 (플레이 전술 원리에 따라 제한)
 * @param actor  공격 주체 선수
 * @param sliders 공격팀 전술 슬라이더
 */
export function selectZone(
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
    const sensitivity = SIM_CONFIG.ZONE_SELECTION.SLIDER_SENSITIVITY;
    const scored = zones.map(z => {
        const pref = prefMap[z] < threshold ? prefMap[z] * 0.2 : prefMap[z];
        const modifier = 1 + (sliderMap[z] - 5) / 5 * sensitivity;
        return { zone: z, score: pref * modifier };
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

export function resolveFinish(
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
        // Dunk (Rim) — reach(vertical + height bonus) 충족 시
        // [2026-10-18] 키 보정 추가 + strength 하드컷 제거 — 키 큰 센터(엠비드/고베어)와 근력 낮은
        // 엘리트 덩커(에드워즈/라빈/웸반야마)가 덩크 자체를 못 하던 문제. strength는 이미 결과
        // 단계(DUNK_STR_RESIST 블락 저항, calculateMatchupGap 몸싸움)에서 반영됨(docs/history/dev-log.md).
        const dunkReach = actor.attr.vertical + Math.max(0, actor.attr.height - F.DUNK_HEIGHT_BASE) * F.DUNK_HEIGHT_VERT_BONUS;
        if (dunkReach >= F.DUNK_VERT_MIN) {
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
        // Hook (Paint) — closeShot ≥ 80, putback 제외, 키 연속 배율
        // [2026-10-18] 키 커트라인(208cm)·포스트/롤 한정 제거 → 풋백 제외 전 상황 + 연속 키 배율(제곱형).
        // 키 = 훅 선호도(배율), 클로즈샷 = 근거리 기본기 자격, 포스트업 = 가중치. 클로즈샷 80 미만은 기존 대체(플로터) 유지 —
        // 이 조건이 없으면 플로터/점퍼 자격 없는 선수가 작은 훅 가중치로 페인트 슛을 독점함(docs/history/dev-log.md).
        const hookHeightMult = Math.pow(Math.max(0, Math.min(F.HOOK_HEIGHT_CAP,
            (actor.attr.height - F.HOOK_HEIGHT_BASE) / F.HOOK_HEIGHT_SPAN)), F.HOOK_HEIGHT_POW);
        if (context !== 'putback' && hookHeightMult > 0 && actor.attr.closeShot >= F.HOOK_CLOSESHOT_MIN) {
            options.push({ zone: 'Paint', shotType: 'Hook', weight: Math.max(0, actor.attr.postPlay - B) * F.HOOK_WEIGHT * hookHeightMult });
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
export function resolvePlayAction(
    team: TeamState, playType: PlayType, sliders: TacticalSliders,
    // [2026-10-24] 블리츠 트랩 탈출 성공 시 possessionHandler가 넘김 → PnR_Handler 패스아웃 컨텍스트 반환
    blitz?: { handler: LivePlayer; screener: LivePlayer },
): PlayContext {
    const players = team.onCourt;
    // [2026-09-10] 팀 전체 1~5옵션 랭킹(gravity 기반) — resolvePlayAction 호출당 1회만 계산해
    // 클로저로 재사용. STAR_USAGE_WEIGHTS와 함께 사용(아래 pickWeightedActor 참고).
    const teamRankMap = getTeamOptionRanks(team);

    // [Fix] Weighted Random Selection with Option System Integration
    const pickWeightedActor = (
        criteria: (p: LivePlayer) => number,
        excludeId?: string,
        role: 'shooter' | 'passer' = 'shooter',
        eligibleFilter?: (p: LivePlayer) => boolean
    ) => {
        let pool = players;
        if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
        // [2026-07-29] 아래 weight 계산은 Math.max(1, rawScore)로 하한선이 있어 criteria가 0을
        // 반환해도(예: 포지션 가중치 0) 완전히 배제되지 않는다 — 진짜 배제가 필요하면(PnR_Roll의
        // SF/SG/PG 등) eligibleFilter로 후보군 자체에서 제거해야 함.
        if (eligibleFilter) pool = pool.filter(eligibleFilter);

        // [2026-09-10] usage multiplier 랭킹을 팀 전체 gravity(getTeamOptionRanks)가 아니라
        // 이 호출에 실제로 쓰인 criteria 기준 로컬 랭킹으로 교체 — 예: Iso/PnR_Handler에서
        // "팀 최고 볼핸들러"가 팀에 postScorer 게비티 높은 빅맨이 있다는 이유만으로 2~3옵션
        // 배율로 밀리는 문제를 막는다. passer role은 원래도 usageMultiplier가 무조건 1.0이라
        // 랭킹 자체가 영향이 없었으므로(아래 B) 그대로 둠.
        const localRank: Map<string, number> | null = role === 'shooter'
            ? new Map([...pool].sort((a, b) => criteria(b) - criteria(a)).map((p, i) => [p.playerId, i + 1]))
            : null;

        const candidates = pool.map(p => {
            // A. Base Skill Score (Existing Logic)
            const rawScore = criteria(p);

            // B. Option Multiplier (New Logic)
            // [2026-07-29] usageMultiplier는 "옵션 순위가 높을수록 슛을 더 쏜다"는 의도로 만든
            // 배율인데, role 구분 없이 passer 선정에도 적용되고 있었음 — 득점 옵션 순위와 무관하게
            // 진짜 패스 능력으로 어시스트맨을 정하도록 passer일 땐 적용하지 않는다.
            const rank = localRank?.get(p.playerId) ?? 3;
            const usageMultiplier = role === 'shooter' ? getContextualMultiplier(rank, playType) : 1.0;

            // C. Final Weight = Skill * OptionMultiplier * Tendencies
            // Linear (pow=1.0): USAGE_WEIGHTS가 계층 구조를 담당, 능력치는 선형 반영
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

            // [SaveTendency] ballDominance: scales actor selection weight (0.5x~1.5x)
            // [2026-07-29] ballDominance(볼을 잡고 싶어하는 성향)를 passer 선정에도 그대로 곱하면
            // "볼을 안 놓으려는 성향"이 오히려 "패스를 잘 준 사람"으로 뽑히는 모순이 생김 — passer일
            // 땐 0.5~1.5 범위를 1.0 기준으로 대칭 반전(2.0-x)해서, ballDominance가 낮을수록(볼에
            // 덜 집착할수록) 패서 가중치가 올라가도록 함.
            const ballDom = p.tendencies?.ballDominance ?? 1.0;
            weight *= role === 'shooter' ? ballDom : (2.0 - ballDom);

            // [SaveTendency] playStyle: role 기반 통합 배율 (슈터 vs 패서)
            // pass-first(-1)면 패서 픽 가중치↑·슈터 픽 가중치↓, shoot-first(+1)는 반대
            const ps = p.tendencies?.playStyle ?? 0;
            const psCfg = SIM_CONFIG.PLAY_SELECTION;
            weight *= role === 'shooter' ? (1 + ps * psCfg.PLAYSTYLE_SHOOTER_K) : (1 - ps * psCfg.PLAYSTYLE_PASSER_K);

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
            // Best Iso Scorer (Handling + Agility + Shot Creation)
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-07-31] 더블팀 유도 후 킥아웃 — PostUp/PnR_Roll과 동일 구조에 더해 [SaveTendency]
            // playStyle(-1 패스~+1 슛)을 최초로 반영. pickWeightedActor의 슈터/패서 픽 가중치에
            // 이미 쓰던 PLAY_SELECTION.PLAYSTYLE_PASSER_K를 재사용해 새 상수 없이 일관성 유지.
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
                    // [2026-08-03] 킥아웃 마무리 context를 'drive'로 고정하면 훅슛(Hook)이 gating 조건
                // (context === 'post' || 'roll')을 절대 못 넘어 킥아웃에서만 훅슛이 원천 봉쇄되는
                // 문제가 있었음 — 킥아웃을 받은 선수가 페인트에서 훅슛으로 마무리하는 건 playType과
                // 무관하게 자연스러운 장면이라 4개 playType 전부 'post'로 통일(Rim은 원래 context
                // 무관이라 영향 없음, Paint는 Floater/Hook/Jumper 전부 열림).
                const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.00 + passIqBonus, isKickout: true };
                }
                return {
                    playType, actor: kickTarget, secondaryActor: actor,
                    preferredZone: koZone,
                    shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper',
                    bonusHitRate: 0.00 + passIqBonus,
                    isKickout: true
                };
            }

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
            // [2026-07-29] 기존 handler(핸들링+패싱만, 득점 요소 0)는 픽앤롤에서 직접 득점까지
            // 책임지는 액터 선정 기준으로는 부적합 — 패스는 평범해도 득점력이 뛰어난 스코어러(예:
            // 앤서니 에드워즈)가 순수 패서형에게 밀리는 문제가 있었음(실측: handler_old 71.6로 동급
            // 스코어러 중 최하위). Iso 액터 선정과 동일하게 isoScorer(드리블+종합 스코어링)를 주축으로
            // 하고 handler를 보조 가중치로 섞음 — handler 아키타입 자체는 다른 곳(패서 역할)에서 계속
            // 그대로 쓰이므로 여기서만 조합을 바꿈.
            if (blitz) return resolveBlitzPassOut(blitz.handler, blitz.screener);
            const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);

            // [2026-10-24] 커버리지 무관 "더블팀 유도 후 킥아웃" 폐지 — 더블팀은 블리츠 커버리지에서만 일어난다(사용자 결정).
            // 블리츠 트랩 판정·패스아웃은 possessionHandler(resolveBlitzTrap) → resolveBlitzPassOut.

            const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer', screenEligible(actor.playerId));

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
            // [2026-07-29] roller 아키타입(speed 30% 반영)만으로는 C가 PF/SF보다 낮게 나와(32 TEST
            // 실측: roller 평균 C 67.7 < PF 73.9 < SF 74.9) 롤맨 역할이 빅맨에게 편중되지 않는 문제가
            // 있었음 — 포지션 가중치를 곱해 롤맨을 프론트코트로 제한.
            // [2026-09-10] C 0.7/PF 0.3/그 외 0 → C 0.5/PF 0.3/SF 0.15/그 외 0 — 빅윙 SF 참여 허용
            const rollWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;
            const screener = pickWeightedActor(
                p => (p.archetypes.roller + p.archetypes.screener * 0.5) * (rollWeights[p.position] ?? 0),
                undefined, 'shooter',
                p => (rollWeights[p.position] ?? 0) > 0
            );

            // [2026-07-31] 더블팀 유도 후 킥아웃 — POST_KICKOUT과 동일 구조, PROB_MAX만 절반(0.20).
            // 롤맨은 캐치 즉시 결정해야 해서 포스트업보다 킥아웃 판단 여유가 적음.
            const prkCfg = SIM_CONFIG.PNR_ROLL_KICKOUT;
            const rollPassing = (screener.attr.passVision + screener.attr.passAcc) / 2;
            const rollPassingNorm = Math.max(0, Math.min(1,
                (rollPassing - prkCfg.PASSING_MIN) / (prkCfg.PASSING_MAX - prkCfg.PASSING_MIN)));
            let rollKickChance = prkCfg.PROB_MIN + (prkCfg.PROB_MAX - prkCfg.PROB_MIN) * Math.pow(rollPassingNorm, prkCfg.CURVE_EXPONENT);
            // [2026-07-31] playStyle 보정 소급 적용 (Iso/PnR_Handler와 동일 패턴)
            const rollPs = screener.tendencies?.playStyle ?? 0;
            rollKickChance *= (1 - rollPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < rollKickChance) {
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, screener.playerId);
                const passIqBonus = Math.max(0,
                    (screener.attr.passIq - prkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * prkCfg.PASSIQ_BONUS_SCALE);

                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] 킥아웃 마무리 context를 'drive'로 고정하면 훅슛(Hook)이 gating 조건
                // (context === 'post' || 'roll')을 절대 못 넘어 킥아웃에서만 훅슛이 원천 봉쇄되는
                // 문제가 있었음 — 킥아웃을 받은 선수가 페인트에서 훅슛으로 마무리하는 건 playType과
                // 무관하게 자연스러운 장면이라 4개 playType 전부 'post'로 통일(Rim은 원래 context
                // 무관이라 영향 없음, Paint는 Floater/Hook/Jumper 전부 열림).
                const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: screener, preferredZone: zone, shotType, bonusHitRate: 0.01 + passIqBonus, isKickout: true };
                }
                return {
                    playType,
                    actor: kickTarget,
                    secondaryActor: screener,
                    preferredZone: koZone,
                    shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper',
                    bonusHitRate: 0.01 + passIqBonus,
                    isKickout: true
                };
            }

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
            // [2026-07-29] popper 아키타입 자체가 이제 screener 성분을 포함하도록 개편됐지만(popper
            // 공식 참고), 스크린을 설 수 있는 사람은 결국 PnR_Roll과 동일한 풀(C/PF)이어야 하므로 같은
            // 자격 기준(SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL)을 재사용해 SF 이하는 완전히 배제한다.
            // popper 공식 자체가 이미 C/PF를 거의 동률로 갈라주므로(32 TEST 실측 확인) 여기선 추가
            // 배율 없이 자격 필터만 적용.
            // [2026-07-31] popper는 순수 능력치(strength/height/weight/3점 스킬) 기반이라 zonePref.three
            // (3점을 쏠 "의향")를 전혀 안 보는 문제가 있었음 — 3점 텐던시가 0인 선수도 스크리닝/피지컬
            // 점수만 높으면 뽑혀서 무조건 3점을 쏘게 됨(찰스 바클리 실측 사례). selectZone()과 동일한
            // 소프트 임계값(ZONE_PREF_THRESHOLD)을 재사용해 페널티 적용.
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
            // [2026-10-18] 팝아웃 구역을 3점 고정 → 팝퍼 본인 구역 성향(3PT vs Mid) + 팀 shot_3pt/shot_mid
            // 슬라이더로 결정. 3점 텐던시가 낮은 빅맨이 팝을 받으면 무조건 3점을 쏘던 문제 — 실제로는
            // 엘보(미드레인지)로 팝. 플레이 빈도(전술)는 그대로, 마무리 슛만 선수 성향을 따름(docs/history/dev-log.md).
            const popZone = selectZone(['3PT', 'Mid'], popper, sliders) as '3PT' | 'Mid';
            return {
                playType,
                actor: popper,
                secondaryActor: handler,
                preferredZone: popZone,
                shotType: popZone === '3PT' ? 'CatchShoot' : 'Jumper',
                bonusHitRate: 0.01 // PnR_Pop: 팝아웃 오픈 슛 소폭
            };
        }
        case 'PostUp': {
            // Best Post Scorer
            // [2026-09-15] 포지션 가중치(SIM_CONFIG.POSITION_WEIGHT.POST_UP) 제거 — 실제 NBA에서도
            // SGA/하든/듀란트처럼 빅맨이 아닌 스코어러가 포스트업을 자주 쓰므로, "누가 이 플레이를
            // 할 자격이 있는가"를 포지션이 아니라 postScorer 순수 실력으로만 경쟁시킨다(Iso/
            // PnR_Handler와 동일 패턴). 10시즌 리그 시뮬레이션 검증: 포지션별 터치 비중이 실력
            // 기준으로 합리적으로 재분배(C 46.5%→31.4%, PG 4.0%→12.3%)되고, 엘리트 빅(요키치/
            // 엠비드)은 -5~7%만 손해보며 최상위권을 유지, 공격력이 약한 전통 빅맨(고베어 등)만
            // 크게 손해(-30~45%, PostUp 극대화 전술 기준) — docs/history/dev-log.md 참고.
            // [2026-10-24] 체격 혼합(SIM_CONFIG.POST_SELECTION.PHYSIQUE_WEIGHT) — postScorer엔 체격이 없어 엘리트 윙·가드가 빅맨과
            // 같은 점수(드렉슬러 89·조던 95 vs 올라주원 93)를 받아 PostUp의 절반을 외곽 선수가 가져갔음. 포지션 제한이 아니라 체격 비중.
            const postPhysW = SIM_CONFIG.POST_SELECTION.PHYSIQUE_WEIGHT;
            const actor = pickWeightedActor(p => p.archetypes.postScorer * (1 - postPhysW) + calculateScreenerPhysique(p.attr) * postPhysW);

            // [2026-07-31] 더블팀 유도 후 킥아웃 — postScorer vs postPassing 비율 방식은 같은
            // 0~99 스케일이라 순수 스코어러(샤킬 등)도 킥아웃률이 40%에 육박하는 문제가 있었음
            // (32 TEST 6 설계 논의). postPassing(시야+정확도) 단독 기준 지수 커브로 교체 —
            // 저~중위권은 거의 0에 눌려있다가 최상위권(요키치급)만 급격히 오르는 형태.
            const pkCfg = SIM_CONFIG.POST_KICKOUT;
            const postPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
            const passingNorm = Math.max(0, Math.min(1,
                (postPassing - pkCfg.PASSING_MIN) / (pkCfg.PASSING_MAX - pkCfg.PASSING_MIN)));
            let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);
            // [2026-07-31] playStyle 보정 소급 적용 (Iso/PnR_Handler와 동일 패턴)
            const postPs = actor.tendencies?.playStyle ?? 0;
            kickChance *= (1 - postPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);

            if (Math.random() < kickChance) {
                // 킥아웃 확정 — 오픈 슈터에게 패스, actor를 교체하고 포스트 선수는 어시스트 후보로
                const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
                // passIq 기반 성공률 보너스 (DriveKick의 driveBonus와 동일 패턴)
                const passIqBonus = Math.max(0,
                    (actor.attr.passIq - pkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * pkCfg.PASSIQ_BONUS_SCALE);

                const koZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], kickTarget, sliders);
                if (koZone === 'Rim' || koZone === 'Paint') {
                    // [2026-08-03] 킥아웃 마무리 context를 'drive'로 고정하면 훅슛(Hook)이 gating 조건
                // (context === 'post' || 'roll')을 절대 못 넘어 킥아웃에서만 훅슛이 원천 봉쇄되는
                // 문제가 있었음 — 킥아웃을 받은 선수가 페인트에서 훅슛으로 마무리하는 건 playType과
                // 무관하게 자연스러운 장면이라 4개 playType 전부 'post'로 통일(Rim은 원래 context
                // 무관이라 영향 없음, Paint는 Floater/Hook/Jumper 전부 열림).
                const { zone, shotType } = resolveFinish(kickTarget, 'post', sliders, koZone);
                    return { playType, actor: kickTarget, secondaryActor: actor, preferredZone: zone, shotType, bonusHitRate: 0.01 + passIqBonus, isKickout: true };
                }
                return {
                    playType,
                    actor: kickTarget,
                    secondaryActor: actor,
                    preferredZone: koZone,
                    shotType: koZone === '3PT' ? 'CatchShoot' : 'Jumper',
                    bonusHitRate: 0.01 + passIqBonus,
                    isKickout: true
                };
            }

            // 기존 로직: 포스트 선수 본인이 마무리 (엔트리 패서는 이 경로에서만 어시스트 후보)
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
            // [2026-07-31] spacer도 PnR_Pop의 popper와 동일한 문제 — zonePref.three 페널티 적용
            // [2026-10-18] 이진(임계값 미만 ×0.2) → PnR_Pop과 같은 비례식(최저 ×0.05) — 0.15에서 5배 뛰던 계단 제거,
            // 3점 텐던시 0인 선수의 캐치앤슛 3점 정리.
            const actor = pickWeightedActor(p => p.archetypes.spacer * Math.max(0.05, Math.min(1.0,
                p.zonePref.three / SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD)));
            const passer = pickPasser(p => p.archetypes.handler + p.archetypes.connector, actor.playerId);

            // [2026-07] 캐치앤슛은 3점 전용으로 고정 — 미드/페인트/림까지 포함하면 실제 현대
            // 농구의 "catch-and-shoot"(캐치 후 즉시 점퍼) 개념과 어긋나고, 드라이브&풀업 계열
            // 플레이타입(Cut/DriveKick/PnR_Roll 등)과 판정 로직이 겹쳐서 3점으로 좁혔다.
            // 아래 원래 로직(존 선호도에 따라 캐치 후 펌프페이크 → 드라이브 전환)은 삭제하지
            // 않고 주석 처리만 해서 남겨둔다.
            //
            // const catchZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
            // if (catchZone === 'Rim' || catchZone === 'Paint') {
            //     const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, catchZone);
            //     return { playType, actor, secondaryActor: passer, preferredZone: finishZone, shotType, bonusHitRate: 0.02 };
            // }
            return {
                playType,
                actor,
                secondaryActor: passer,
                preferredZone: '3PT', // 고정: 캐치앤슛은 항상 3점
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
            // [2026-07-29] 기존 screener(체격만)는 무톰보/드러먼드/고베어 같은 손기술 최악의 림프로텍터가
            // 요키치/사보니스 같은 진짜 플레이메이킹 허브 빅보다 위로 뽑히는 왜곡이 있었다(실측: 요키치
            // hands98/passIq98인데 12위, 고베어 hands48/passIq52인데 11위). Handoff는 순수 스크린이
            // 아니라 빅맨이 직접 볼을 다루다 넘겨주는 역할이라 손기술+패스IQ가 핵심 — screener 대신
            // passIq/hands 기반 허브 스코어로 교체하고, PnR_Roll과 동일한 자격 제한(C/PF만)을 재사용.
            // [2026-10-24] 자격: 슬롯 포지션(POSITION_WEIGHT.PNR_ROLL) → 체격 자격(screenEligible)으로 교체
            const big = pickWeightedActor(
                // [2026-10-24] 패서 집중 증폭(pickPasser와 동일: (passVision×passIq/2500)^1.5) — 기존 선형 가중은 점수 폭(70~95)이
                // 좁아 패스 능력이 사실상 무시됐음(패스 45/38/32 벤 월리스가 허브 상위 10위). 핸드오프는 스크린 파생 액션만이
                // 아니라 패서 주도 액션이기도 해서 큰 볼핸들러(시몬스·매직) 허브 증가를 수용(사용자 결정).
                p => (p.attr.passIq * 0.5 + p.attr.hands * 0.5) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
                actor.playerId, 'passer',
                screenEligible(actor.playerId)
            );

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
            // [2026-07-30] 정확도(passAcc) 없이 시야(passVision)만 반영돼 있어서, 요키치/르브론처럼
            // 발은 느려도 정확도+시야로 풀코트 "터치다운 패스"를 꽂는 유형이 저평가됐음 — 둘을 평균낸
            // touchdownQuality로 교체하고 비중도 0.3→0.5로 상향.
            const outletPasser = pickPasser(p => {
                const touchdownQuality = (p.attr.passVision + p.attr.passAcc) / 2;
                return p.archetypes.connector + touchdownQuality * 0.5;
            }, actor.playerId);

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
            // [2026-07-29] 기존 reb(공격+수비+박스아웃 평균)는 Putback(공격리바운드 직후 세컨드찬스)
            // 상황에 수비리바운드 능력까지 섞여서 부정확했다(실측: 알 호포드 offReb 35인데 reb종합
            // 61.3으로 과대평가). 공격 리바운드(offReb)만 쓰고, 점프력(vertical)·허슬을 반영해서
            // 로드먼/벤 월리스/조쉬 하트 같은 허슬형도 정당하게 평가되도록 재정의.
            const actor = pickWeightedActor(p =>
                p.attr.offReb * 0.40 +
                p.attr.vertical * 0.30 +
                p.attr.hustle * 0.20 +
                (((p.attr.closeShot + p.attr.layup + p.attr.dunk) / 3) * 0.10)
            );
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
            // [2026-07-29] role 파라미터 누락 버그 수정 — 기본값('shooter')이 적용돼서 옵션랭크
            // 배율/볼도미넌스(반전 없음)/playStyle(슛선호 유리)가 전부 스크리너 역할에 안 맞게
            // 적용되고 있었음. Handoff의 big, PnR_Handler의 screener와 동일하게 'passer'로 통일.
            const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
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

            // [Fix][2026-07-29] 기존엔 "킵 vs 킥아웃"을 스팟업 슈터(actor)의 존 선호도로 결정했는데,
            // 이건 드라이버 본인의 침투/패스 성향과 무관한 엉뚱한 기준이었다. 드라이버의 침투력
            // 대 킥아웃 패스력 비율로 직접 결정하도록 분리.
            const keepChance = penetration / (penetration + kickPass);
            if (Math.random() < keepChance) {
                // 드라이버가 직접 마무리 → actor를 driver로 교체, 어시스트 없음 (드라이버 본인 존 선호도 사용)
                const driveZone = selectZone(['Rim', 'Paint'], driver, sliders) as 'Rim' | 'Paint';
                const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, driveZone);
                return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
            }

            // 킥아웃 확정 → 스팟업 슈터(actor)의 존 선호도로 어디서 쏠지 결정
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
