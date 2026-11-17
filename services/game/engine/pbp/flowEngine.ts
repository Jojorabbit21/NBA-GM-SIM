
import { SIM_CONFIG } from '../../config/constants';
import { LivePlayer, TeamState, ClutchContext } from './pbpTypes';
import { PlayContext } from './playTypes';
import { calculateAceStopperImpact } from '../aceStopperSystem';
import { Player, PlayType, TacticalSliders } from '../../../../types';

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
 * [2026-07-29] 슈팅파울 배수(possessionHandler.ts)와 적중률 미스매치 보정(아래 calculateHitRate)이
 * 공유하는 단일 소스 — 스위치 여부와 무관하게 항상 계산한다(로스터 자체의 사이즈 미스매치, 존
 * funnel로 어쩔 수 없이 불리한 매치업이 걸린 경우 등도 포함하기 위함).
 *
 * 골밑(Rim/Paint): 공격자의 순수 힘(strength, 몸싸움) vs 수비자의 순수 힘(strength) — 동일
 *   스탯 대 동일 스탯 비교이므로 리그 평균 매치업 갭이 항상 정확히 0에 수렴한다(로스터 구성이
 *   바뀌어도 재보정 불필요).
 *   [2026-08-01 Fix] 기존엔 defSkill을 intDef·blk(기술 65%)+strength·vertical(신체 35%)
 *   블렌드로 계산했는데, intDef는 이미 defRating/defMod에서, blk는 이미 possessionHandler의
 *   블락 확률 시스템에서 각각 별도로 반영되고 있어 여기서 또 넣으면 이중 반영이었음. 게다가
 *   4스탯 블렌드는 평균이 강자쪽(strength 71.9)보다 구조적으로 낮게 나와(68.3) "평균적인
 *   매치업"조차 공격 쪽으로 +3.6 치우쳐 있었음 — strength 단일 비교로 바꿔 이중반영과 오프셋
 *   문제를 동시에 제거. (개별 매치업의 스킬 격차 자체는 의도대로 유지 — 상대 로스터에 바클리급
 *   피지컬 선수가 있으면 그만큼 강한 수비수로 대응해야 하는 것은 정상적인 게임플레이.)
 * 퍼리미터(Mid/3PT): 공격자의 순발력(speed+agility 평균) vs 수비자의 순발력(speed+agility 평균)
 *   — 골밑과 동일한 이유로 동일 스탯 대 동일 스탯 비교로 통일.
 *   [2026-08-01 Fix] perDef는 이미 defRating/defMod에서 별도로 반영되고 있어 골밑의 intDef와
 *   같은 이중 반영 문제였고, 4스탯 블렌드 평균도 offPower보다 구조적으로 낮아 오프셋이 있었음
 *   — 골밑과 동일하게 offPower와 동일한 스탯 구성(speed+agility 평균)으로 교체.
 *
 * drawFoul(파울 유도 "기술")과 postScorer/driver 같은 득점 아키타입은 각각 별도 항목이 이미
 * 처리하고 있어 여기서는 중복 반영하지 않는다 — 순수 신체/포지션 우열만 본다.
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

// 매치업 격차를 -1~+1로 정규화하는 스케일 — 실측(실제 선수 매치업 시뮬레이션)으로 확정한 값.
export const MATCHUP_GAP_SCALE = 60;
/** [2026-11-11] 매치업 격차(gap / MATCHUP_GAP_SCALE, ±1로 자름)의 성공률 가중치(±12%p) — 매치업 배정 적합도와 공유 (server 미러 동일) */
export const MATCHUP_GAP_HIT_WEIGHT = 0.12;

/**
 * [2026-11-11] 슛 수비 등급(무작위 수비 이완 제외) — calculateHitRate와 매치업 배정(matchupAssign.ts) 적합도가
 * 같은 규칙을 읽도록 분리. 3점 = perDef, 그 외 = intDef, + defensiveMotor×10 + (defConsist−70)×0.3.
 * 계산 순서는 이전 calculateHitRate 안의 식과 같아 값이 동일하다 (server 미러 동일).
 */
export function shotDefenseRating(defender: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT'): number {
    const base = zone === '3PT' ? defender.attr.perDef : defender.attr.intDef;
    // [2026-11-16] 수비 의지 재설계 — 켜져 있으면 의지 가산(× 10) 없음: 의지는 '붙는 빈도'로 옮겨 갔다(SIM_CONFIG.DEFENSIVE_MOTOR)
    const motorAdd = SIM_CONFIG.DEFENSIVE_MOTOR.ENABLED ? 0 : (defender.tendencies?.defensiveMotor ?? 0) * 10;
    return base + motorAdd + ((defender.attr?.defConsist ?? 50) - 70) * 0.3;
}

export function calculateHitRate(
    actor: LivePlayer,
    defender: LivePlayer,
    defTeam: TeamState,
    playType: PlayType,
    preferredZone: 'Rim' | 'Paint' | 'Mid' | '3PT',
    offSliders: TacticalSliders, // [New] Offense Sliders
    bonusHitRate: number,
    acePlayerId?: string,
    isBotchedSwitch: boolean = false,
    isSwitch: boolean = false,
    minHitRate?: number, // [New] Buzzer beater: enforce hit rate lower bound
    isHome: boolean = false,
    homeAdvantage: number = 0.005,
    clutchContext?: ClutchContext,
    pnrCoverage: PnrCoverage = 'none',
    screenerDefender?: LivePlayer,
    shotType?: PlayContext['shotType'],
    threeSubZone?: string,
    // [2026-10-30] 슛 타입 기본 견제 계수(SHOT_DEFENSE.CONTEST) 대신 쓸 값 — 속공 트레일러 3점(TRANSITION_SHOT.TRAILER_CONTEST)
    contestOverride?: number,
    // [2026-11-06] PnR 핸들러 본인 슛의 스크린 판정 결과 — 드롭 풀업 보너스는 클린·부분만, 헤지 감점은 부분만
    // (클린 = 헤지 무력화, 실패 = 트랩으로 넘어가 핸들러 슛 없음). undefined = 이전 동작 (server 미러)
    handlerScreen?: 'clean' | 'partial' | 'fail',
    // [2026-11-16] 예상 성공률 모드 — 선수가 슛 직전에 읽는 값(슛 판단용). 숨은 주사위(수비 집중력 저하·슛 IQ/공격 일관성 기복)를 굴리지 않는다 (server 미러 동일)
    estimate: boolean = false,
    // [2026-11-16] 수비 의지 재설계 — 이번 공격에서 맡은 수비수가 놓아줬는지(possessionHandler가 판정해 넘긴다).
    //   true = 놓아줌(수비 등급 × LAPSE_CONTEST_MULT), false = 제대로 붙음(평균 견제 유지용 보정 배율), 미지정 = 평균(배율 1 — 엔진 밖 추정용)
    defenderLapse?: boolean
): HitRateResult {
    const S = SIM_CONFIG.SHOOTING;
    let hitRate = 0.45;

    // 1. Base Hit Rate [EDITED BY USER! DO NOT CHANGE!]
    if (preferredZone === 'Rim' || preferredZone === 'Paint') hitRate = S.INSIDE_BASE_PCT;
    else if (preferredZone === 'Mid') hitRate = S.MID_BASE_PCT;
    else if (preferredZone === '3PT') hitRate = S.THREE_BASE_PCT;

    hitRate += bonusHitRate; // playTypes/zoneQualityMod 보정치 적용

    // [Fix] 존별 정확한 공격 능력치 매핑 (Rim: shotType별 단독 능력치)
    let zoneOffRating: number;
    if (preferredZone === '3PT') {
        // 서브존별 개별 3PT 능력치 적용 (corner/wing/top)
        if (threeSubZone?.startsWith('zone_c3'))
            zoneOffRating = actor.attr.threeCorner;
        else if (threeSubZone === 'zone_atb3_c')
            zoneOffRating = actor.attr.threeTop;
        else if (threeSubZone?.startsWith('zone_atb3'))
            zoneOffRating = actor.attr.three45;
        else
            zoneOffRating = actor.attr.threeVal; // fallback
    } else if (preferredZone === 'Mid') {
        if (shotType === 'Fadeaway')
            zoneOffRating = actor.attr.postPlay * 0.3 + actor.attr.mid * 0.5 + actor.attr.closeShot * 0.2;
        else
            zoneOffRating = actor.attr.mid; // Pullup, Jumper
    } else if (preferredZone === 'Rim') {
        if (shotType === 'Dunk') zoneOffRating = actor.attr.dunk;
        else                     zoneOffRating = actor.attr.layup; // Layup (default)
    } else {
        // Paint: Floater는 closeShot 단독, Jumper는 closeShot+mid 블렌드, Hook은 포스트 복합
        if (shotType === 'Floater') zoneOffRating = actor.attr.closeShot;
        else if (shotType === 'Jumper') zoneOffRating = actor.attr.closeShot * 0.6 + actor.attr.mid * 0.4;
        else zoneOffRating = actor.attr.postPlay * 0.45 + actor.attr.closeShot * 0.30 + actor.attr.hands * 0.25;
    }

    // 0. Botched Switch = Wide Open Shot (선수 능력치 반영, 고정값 제거)
    if (isBotchedSwitch) {
        const attackerShooting = zoneOffRating;
        const openShotBonus    = 0.20;
        const attackerMod      = (attackerShooting - 70) * 0.001;
        return {
            rate: Math.min(0.82, hitRate + openShotBonus + attackerMod),
            matchupEffect: 0, isAceTarget: false, isMismatch: false
        };
    }

    // 2. Offense vs Defense Attributes + Fatigue
    const fatigueOff = actor.currentCondition / 100;    // 0~1 (condition 70 = 0.7 기준 중립)
    const fatigueDef = defender.currentCondition / 100;

    // 피로도 → FG% 보정
    // 공격자: condition 0 → -7%, condition 30 → 0, condition 100 → +7%
    hitRate += (fatigueOff - 0.30) * 0.10;
    // [SaveTendency] focusDrift(집중력): 지칠수록 슛이 추가로 흔들린다 — 컨디션 75% 미만부터, 값 × (0.75 − 컨디션) × 10%p
    // [2026-11-16] 조건 30% → 75% 미만, 세기 0.05 → 0.10(사용자 결정). 이전 조건(30% 미만)에 걸리는 슛은 전체의 0.3~0.6%뿐이라 효과가 사실상 0이었다.
    //   지금: 걸리는 슛 15%(주전은 슛의 22~28%), 집중력 나쁜(≥0.7) 주전의 시즌 성공률 −0.25~0.33%p·혹사당하는 선수는 −1%p 이상, 리그 성공률 −0.10%p.
    //   값 1.0 기준 감점: 컨디션 70% −0.5%p / 60% −1.5%p / 50% −2.5%p / 30% −4.5%p (server 미러 동일)
    if (fatigueOff < 0.75) {
        hitRate -= (actor.tendencies?.focusDrift ?? 0) * (0.75 - fatigueOff) * 0.10;
    }
    // 수비자: condition 0 → +1.5%, condition 30 → 0, condition 100 → -3.5%
    hitRate -= (fatigueDef - 0.30) * 0.05;

    const offRating = zoneOffRating;
    // [2026-11-11] 등급 계산은 shotDefenseRating()으로 분리(매치업 배정 적합도와 공유) — 이전: base(3PT perDef / 그 외 intDef)
    //   + defensiveMotor×10, 이어서 += (defConsist−70)×0.3. 같은 순서라 값 동일 (server 미러 동일).
    // [2026-09-10] defensiveMotor(히든 트레잇 "수비 의지") 계수 3 → 10. 기존 계수(3)는 이론상
    // 최대 효과가 ±0.45%p 수준이라 체감 불가한 장식용 수치였음(intDef의 ±8.85%p와 20배 격차).
    // 400경기 실측(tendencySeed 정상 전달 확인 후) 기준 전체 인구 구간 스프레드 ~2.9%p,
    // 극단 선수(motor≤-0.8 vs ≥0.8) 간 6.4%p로 확인 — intDef보다는 작지만 체감 가능한 수준으로
    // 사용자 확정(docs/history/dev-log.md 참고). 파울 계산과는 무관(defensiveMotor는 이 hitRate
    // 계산에만 쓰임 — grep 검증 완료).
    // [defConsist] 수비 일관성 반영
    // 1. Flat modifier: defConsist 70 기준 ±0.3/pt — shotDefenseRating() 안에 포함
    let defRating = shotDefenseRating(defender, preferredZone);
    const motorCfg = SIM_CONFIG.DEFENSIVE_MOTOR;
    if (motorCfg.ENABLED) {
        // [2026-11-16] 놓아주기는 수비 의지가 정한다(주사위는 possessionHandler에서 공격당 한 번). 제대로 붙은 장면은
        //   (1 − BASE × MULT) ÷ (1 − BASE)배 → 평균 수비수의 평균 견제가 재설계 전과 같다. 수비 일관성의 무작위 집중력 저하는 없앰
        if (defenderLapse === true) defRating *= motorCfg.LAPSE_CONTEST_MULT;
        else if (defenderLapse === false) defRating *= (1 - motorCfg.LAPSE_BASE * motorCfg.LAPSE_CONTEST_MULT) / (1 - motorCfg.LAPSE_BASE);
    } else {
        const defConsist = (defender.attr?.defConsist ?? 50);
        // 2. Defensive lapse: defConsist 낮을수록 간헐적 집중력 저하
        const lapseChance = Math.max(0, (70 - defConsist) * 0.003);
        if (!estimate && lapseChance > 0 && Math.random() < lapseChance) {
            defRating *= 0.7;
        }
    }
    
    // Apply Sliders
    // Def Intensity: 매치업(수비자 능력 vs 공격자 능력) 게이팅 적용 — 매치업이 나쁘면 슬라이더
    // 설정과 무관하게 억제 효과가 거의 사라진다. 3PT/Mid는 perDef, Rim/Paint는 intDef 기준
    // (두 능력치의 리그 분포가 서로 달라 매치업 커브도 구간을 분리했다).
    const isPerimeterZone = preferredZone === '3PT' || preferredZone === 'Mid';
    const matchupDefRating = isPerimeterZone ? defender.attr.perDef : defender.attr.intDef;
    const matchupDiff = matchupDefRating - offRating;
    const matchupCurve = isPerimeterZone ? S.DEF_INTENSITY_MATCHUP_CURVE_PERIMETER : S.DEF_INTENSITY_MATCHUP_CURVE_INTERIOR;
    const intensityMatchup = interpolateCurve(matchupDiff, matchupCurve);
    const intensityMod = (defTeam.tactics.sliders.defIntensity - 5.5) * 0.006 * intensityMatchup;

    // shotType별 컨테스트 효과: 수비자의 defRating 영향력 스케일링
    let contestFactor = contestOverride ?? SIM_CONFIG.SHOT_DEFENSE.CONTEST[shotType ?? 'Layup'] ?? 1.0;

    // B-7. Deadeye: 3PT 존 엘리트 슈터의 컨테스트 저항
    if (SIM_CONFIG.ZONE_SHOOTING.ENABLED && preferredZone === '3PT' &&
        actor.attr.shotIq >= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_SHOTIQ_THRESHOLD &&
        actor.attr.offConsist >= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_OFFCONSIST_THRESHOLD) {
        contestFactor *= SIM_CONFIG.ZONE_SHOOTING.DEADEYE_CONTEST_MULTIPLIER;
    }

    // 3PT: 비선형 커브 (공격/수비 분리), 나머지: 기존 선형
    if (preferredZone === '3PT') {
        const offMod = interpolateCurve(offRating, S.THREE_OFF_CURVE);
        const defMod = defRating * contestFactor * S.THREE_DEF_COEFF;
        hitRate += offMod - defMod;
        // 코너 3PT 보너스 (NBA 통계: 코너 3 > 다른 구역 ~1.5%p)
        if (threeSubZone?.startsWith('zone_c3')) hitRate += S.THREE_CORNER_BONUS;
    } else {
        // Non-3PT: per-shotType 비선형 커브
        const st = shotType ?? 'Layup';
        const shotCurve = st === 'Dunk' ? S.DUNK_OFF_CURVE
            : st === 'Layup' ? S.LAYUP_OFF_CURVE
            : st === 'Floater' ? S.FLOATER_OFF_CURVE
            : st === 'Hook' ? S.HOOK_OFF_CURVE
            // [2026-10-25] 페인트 점퍼는 전용 커브(이전엔 미드 커브 공유)
            : (preferredZone === 'Paint' && st === 'Jumper') ? S.PAINT_JUMPER_OFF_CURVE
            : S.MID_OFF_CURVE;  // Pullup, Jumper(Mid), Fadeaway
        const defCoeff = st === 'Dunk' ? S.DUNK_DEF_COEFF
            : preferredZone === 'Mid' ? S.MID_DEF_COEFF
            : S.INSIDE_DEF_COEFF;
        const offMod = interpolateCurve(offRating, shotCurve);
        const defMod = defRating * contestFactor * defCoeff;
        hitRate += offMod - defMod;

        // [2026-10-18] Rim/Paint 슈터 체격 보너스 (SIM_CONFIG.SHOOTING.FINISHER_SIZE) — 덩크는 근력+키, 그 외는 키.
        if (preferredZone === 'Rim' || preferredZone === 'Paint') {
            const fs = S.FINISHER_SIZE;
            const overHeight = Math.max(0, actor.attr.height - fs.HEIGHT_BASE);
            if (st === 'Dunk') {
                hitRate += Math.min(fs.DUNK_STR_CAP, Math.max(0, actor.attr.strength - fs.DUNK_STR_BASE) * fs.DUNK_STR_COEFF)
                         + Math.min(fs.DUNK_HEIGHT_CAP, overHeight * fs.DUNK_HEIGHT_COEFF);
            } else {
                hitRate += Math.min(fs.NON_DUNK_CAP, overHeight * fs.NON_DUNK_HEIGHT_COEFF);
            }
        }
    }

    // shotIq + offConsist 일관성 시스템 (모든 존)
    // [2026-07-31 Fix] shotIq: 대칭 노이즈 (평균 0, 진폭만 |shotIq-70|에 비례)
    // 기존엔 shotIq>70일 때 0~+range로만, <70일 때 -range~0으로만 뽑혀서
    // "노이즈"가 아니라 매 슛 확정 편향 보너스/페널티로 작동 → 상위권 TS% 과대 인플레 원인.
    // [2026-11-17] 경기 단위 슛 감각(SIM_CONFIG.SHOT_FORM, 공격 일관성의 역할) — 경기 시작 때 뽑아 둔 값을 림 슛을 뺀 모든 슛에 더한다.
    //   예상 성공률(estimate) 계산에도 같은 값이 들어간다(선수는 그날 자기 감을 안다). 꺼져 있으면 이전의 슛별 대칭 노이즈.
    if (SIM_CONFIG.SHOT_FORM.ENABLED) {
        if (preferredZone !== 'Rim') hitRate += actor.shotForm ?? 0;
    } else {
        const shotIqRange = Math.abs(actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
        const shotIqNoise = (!estimate && shotIqRange !== 0) ? (Math.random() * 2 - 1) * shotIqRange : 0;
        const consistRange = Math.max(0, (S.CONSIST_BASELINE - actor.attr.offConsist)) * S.CONSIST_NOISE_COEFF;
        const consistNoise = (!estimate && consistRange > 0) ? (Math.random() * 2 - 1) * consistRange : 0;
        hitRate += shotIqNoise + consistNoise;
    }

    hitRate -= intensityMod;

    // --- ZONE SHOOTING ARCHETYPES ---
    const zCfg = SIM_CONFIG.ZONE_SHOOTING;
    if (zCfg.ENABLED) {
        // B-1. Mr. Fundamental: 엘리트 미드레인지 슈터
        if (preferredZone === 'Mid' && actor.attr.mid >= zCfg.FUNDAMENTAL_MID_THRESHOLD) {
            // 클러치(Q4 ≤5분, 접전) + Mid → +3%
            if (clutchContext?.isClutch) hitRate += zCfg.FUNDAMENTAL_CLUTCH_BONUS;
            // ISO + Mid → +3% (중첩 가능)
            if (playType === 'Iso') hitRate += zCfg.FUNDAMENTAL_ISO_BONUS;
        }

        // B-2. Rangemaster: 엘리트 3PT 슈터, 클러치에서 추가 보너스
        if (preferredZone === '3PT' && clutchContext?.isClutch &&
            actor.attr.threeVal >= zCfg.RANGEMASTER_THREEVAL_THRESHOLD &&
            actor.attr.shotIq >= zCfg.RANGEMASTER_SHOTIQ_THRESHOLD) {
            hitRate += zCfg.RANGEMASTER_CLUTCH_BONUS;
        }

        // B-3. Tyrant: 피지컬 피니셔, Rim/Paint hitRate 보너스
        if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
            actor.attr.ins >= zCfg.TYRANT_INS_THRESHOLD &&
            (actor.attr.strength >= zCfg.TYRANT_STRENGTH_THRESHOLD ||
             actor.attr.vertical >= zCfg.TYRANT_VERTICAL_THRESHOLD)) {
            hitRate += zCfg.TYRANT_HITRATE_BONUS;
        }

        // B-5. Afterburner: 폭발적 스피드로 트랜지션 마무리력 상승
        if (playType === 'Transition' &&
            actor.attr.speed >= zCfg.AFTERBURNER_SPEED_THRESHOLD &&
            actor.attr.spdBall >= zCfg.AFTERBURNER_SPDBALL_THRESHOLD &&
            actor.attr.agility >= zCfg.AFTERBURNER_AGILITY_THRESHOLD) {
            hitRate += zCfg.AFTERBURNER_TRANSITION_BONUS;
        }
    }

    // --- DRIVE SPDBALL BONUS ---
    // 드라이브 spdBall 보너스: Rim/Paint 드리블 공격 시 (70 기준 ±0.1%/pt)
    if ((preferredZone === 'Rim' || preferredZone === 'Paint') &&
        (playType === 'Iso' || playType === 'Cut' || playType === 'Transition' || playType === 'PnR_Handler')) {
        hitRate += (actor.attr.spdBall - 70) * 0.001;
    }

    // --- PnR COVERAGE MODIFIERS ---
    if (pnrCoverage !== 'none') {
        const pCfg = SIM_CONFIG.PNR_COVERAGE;
        const isPnrHandler = playType === 'PnR_Handler';
        const isPnrRoll = playType === 'PnR_Roll';
        const isPnrPop = playType === 'PnR_Pop';

        if (pnrCoverage === 'drop') {
            // Drop: 빅맨이 림 보호 → 핸들러 미드레인지 오픈, 롤맨 림 차단
            const scale = screenerDefender
                ? 0.7 + (screenerDefender.attr.intDef - 70) * 0.01
                : 1.0;
            if (isPnrHandler && preferredZone === 'Mid' && handlerScreen !== 'fail') hitRate += pCfg.DROP_HANDLER_MID_BONUS * scale;
            if (isPnrHandler && preferredZone === '3PT' && handlerScreen !== 'fail') hitRate += pCfg.DROP_HANDLER_3PT_BONUS * scale;
            if (isPnrRoll) hitRate -= pCfg.DROP_ROLL_PENALTY * scale;
            if (isPnrPop) hitRate += pCfg.DROP_POP_BONUS * scale;
        }

        if (pnrCoverage === 'hedge') {
            // Hedge: 빅맨 순간 쇼 → 핸들러 리듬 방해, 리커버리 실패 시 롤맨 오픈
            const bigSpeed = screenerDefender?.attr.speed ?? 70;
            if (isPnrHandler && (handlerScreen === undefined || handlerScreen === 'partial')) hitRate -= pCfg.HEDGE_HANDLER_PENALTY;
            if (isPnrRoll) {
                hitRate += pCfg.HEDGE_ROLL_BONUS;
                if (bigSpeed < pCfg.HEDGE_SLOW_BIG_THRESHOLD) hitRate += pCfg.HEDGE_SLOW_BIG_EXTRA;
            }
        }

        if (pnrCoverage === 'blitz') {
            // Blitz: 더블팀 → 핸들러 대폭 억제, 롤맨/팝퍼 와이드 오픈
            const scale = screenerDefender
                ? 0.7 + ((screenerDefender.attr.perDef + screenerDefender.attr.speed) / 2 - 70) * 0.01
                : 1.0;
            if (isPnrHandler) hitRate -= pCfg.BLITZ_HANDLER_PENALTY * scale;
            if (isPnrRoll) hitRate += pCfg.BLITZ_ROLL_BONUS;
            if (isPnrPop) hitRate += pCfg.BLITZ_POP_BONUS;
        }
    }

    // 3. Mismatch Logic
    // [2026-07-29] 스위치 발생 시에만 계산하던 것을 calculateMatchupGap() 기반으로 전면 교체 —
    // 스위치 여부와 무관하게 항상 계산(로스터 자체의 사이즈 미스매치, 존 funnel로 어쩔 수 없이
    // 불리한 매치업이 걸린 경우도 포함). 기존엔 skillGap이 음수면 보너스 0으로 바닥 처리했는데,
    // 이번엔 대칭 적용 — 수비자가 확실히 유리하면 적중률이 baseline보다 실제로 낮아진다
    // (파울 배수 쪽과 동일한 gapNormalized를 공유, possessionHandler.ts 참고).
    const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
    const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
    const MISMATCH_THRESHOLD_NORM = 0.3; // |정규화 격차|가 이 이상이면 "유의미한 미스매치"로 표시
    const isMismatch = Math.abs(gapNormalized) >= MISMATCH_THRESHOLD_NORM;

    hitRate += gapNormalized * MATCHUP_GAP_HIT_WEIGHT; // -12% ~ +12%, 기존 상한 유지 + 양방향 + 스위치 무관

    if (!isMismatch && isSwitch) {
        // 스위치는 났지만 미스매치가 안 날 만큼 수비자가 포지션을 잘 잡은 경우만
        // 기존 "성공적 스위치" 페널티 유지 — 공격자 공간 축소
        hitRate -= 0.03;
    }

    // 4. Ace Stopper Impact
    const isStopperActive = defTeam.tactics.stopperId === defender.playerId &&
                            actor.playerId === acePlayerId;
    
    let matchupEffect = 0;
    if (isStopperActive) {
        const impact = calculateAceStopperImpact(flattenPlayer(actor), flattenPlayer(defender), defender.mp);
        hitRate *= (1 + (impact / 100));
        matchupEffect = impact;
    }

    // 5. Pace Penalty (Haste) — [2026-10-25] 삭제(사용자 결정). pace 5 초과 1단계당 모든 슛 −1%는 체력→성공률 경로와
    //    이중 과세였고, pace 10 팀 TS .580→.531·득실 −10점으로 빠른 페이스를 항상 손해로 만들었음. 대가는 체력(FATIGUE.PACE_FATIGUE_CURVE)으로 일원화.
    //    이전: if (offSliders.pace > 5) { hitRate -= (offSliders.pace - 5) * 0.01; }

    // 6. Home Court Advantage — homeAdvantage는 호출부에서 state.simSettings로 주입
    if (isHome) {
        hitRate += homeAdvantage;
    }

    // 7. Clutch Modifier (Q4 접전 상황)
    // 클러치 능력(인탱저블) → 70 기준 ±보정
    if (clutchContext?.isClutch) {
        const cCfg = SIM_CONFIG.CLUTCH_ARCHETYPE;
        const a = actor.attr;

        // [2026-11-16] 클러치 능력 = 인탱저블만(사용자 결정). 이전: (intangibles×0.50 + offConsist×0.30 + shotIq×0.20) / 100 —
        //   공격 일관성·슛 IQ는 서로 상관 0.75 이상인 같은 종류의 값이고 각자 다른 역할을 맡길 능력치라 뺐다(슛 IQ는 성공률에 직접 영향 금지 원칙).
        //   possessionHandler.getLateShotClockPenalty의 클러치 능력도 같은 정의 (server 미러 동일)
        const clutchRating = a.intangibles / 100;
        let clutchModifier = (clutchRating - 0.70) * 0.10;
        // [SaveTendency] clutchGene(−0.3~+0.3, [2026-11-16] 폭 0.3배): 클러치 성공률 최대 ±0.9%p
        clutchModifier += (actor.tendencies?.clutchGene ?? 0) * 0.03;

        if (cCfg.ENABLED) {
            // A-1. Curtain Call: 클러치 보정치 ×1.6
            if (a.intangibles >= cCfg.CLOSER_INTANGIBLES_THRESHOLD &&
                a.shotIq >= cCfg.CLOSER_SHOTIQ_THRESHOLD) {
                clutchModifier *= cCfg.CLOSER_MODIFIER_MULTIPLIER;
            }
        }

        hitRate += clutchContext.isSuperClutch ? clutchModifier * 1.5 : clutchModifier;

        // [2026-11-16] 일괄 프레셔 페널티(−1.5%p) 제거(사용자 결정) — 클러치 시간에는 주전 수비·플레이 선택 변화·막판 급한 슛만으로 이미
        //   성공률이 0.8~1.8%p 떨어져 이중 부과였다. 이전: 전원 hitRate −= 0.015('Ice in Veins' 아키타입만 면제 — 아키타입은 꺼져 있어 사실상 전원).
        //   면제 대상이 없어졌으므로 Ice in Veins 판정도 같이 삭제(CLUTCH_ARCHETYPE.ICE_* 상수는 미사용) (server 미러 동일)

        // A-3. High Roller: 클러치 + 인사이드 = 추가 보너스
        if (cCfg.ENABLED &&
            (preferredZone === 'Rim' || preferredZone === 'Paint') &&
            a.intangibles >= cCfg.BIGSTAGE_INTANGIBLES_THRESHOLD &&
            a.strength >= cCfg.BIGSTAGE_STRENGTH_THRESHOLD &&
            a.ins >= cCfg.BIGSTAGE_INS_THRESHOLD) {
            hitRate += cCfg.BIGSTAGE_INSIDE_BONUS;
        }
    }

    // 8. Hot/Cold Streak — [2026-08-01 Fix] hitRate 반영 제거, 연출 전용으로 전환.
    // recentShots 기준 make%가 항상 50%를 기준선으로 비교되다 보니(선수 본인의 실제 기대 성공률과
    // 무관), 시즌 FG%와 hotColdRating의 상관계수가 0.704로 측정됨 — "무작위 스트릭"이 아니라
    // "잘하는 선수는 상시 핫 보정, 못하는 선수는 상시 콜드 보정"으로 작동하며 실력 격차를 자기강화
    // 루프로 증폭시키고 있었음. hotColdRating/recentShots 계산 자체는 statsMappers.ts에 그대로
    // 유지(추후 커멘터리/UI 연출용으로 재사용 가능) — 여기 hitRate 가산만 제거.

    let finalRate = Math.max(0.05, Math.min(0.95, hitRate));
    // Buzzer beater: enforce lower bound (minHitRate) if provided
    if (minHitRate !== undefined) finalRate = Math.max(finalRate, minHitRate);

    return {
        rate: finalRate,
        matchupEffect,
        isAceTarget: isStopperActive,
        isMismatch
    };
}
