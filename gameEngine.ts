
import { Team, Player, PlayerBoxScore, OffenseTactic, DefenseTactic, TradeOffer } from './types';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE CONFIGURATION (튜닝 패널)
// ==========================================================================================
//  이 섹션의 변수들을 수정하여 경기 시뮬레이션 및 트레이드 AI의 밸런스를 조정할 수 있습니다.
//  모든 확률 및 가중치는 이 설정 객체를 참조하여 계산됩니다.
// ==========================================================================================

// ------------------------------------------------------------------------------------------
//  [SECTION 1] TRADE ENGINE CONFIG (트레이드 로직 설정)
// ------------------------------------------------------------------------------------------
export const TRADE_CONFIG = {
    // [기초 가치 산정 로직]
    // 선수의 절대적인 가치를 계산하기 위한 상수입니다.
    BASE: {
        REPLACEMENT_LEVEL_OVR: 38, // 대체 선수 대비 가치(WAR) 개념 도입. 이 OVR 이하는 트레이드 가치가 거의 0에 수렴합니다.
        VALUE_EXPONENT: 2.7,       // OVR 증가에 따른 가치 상승 곡선의 기울기 (지수 함수). 
                                   // 선형적(Linear)이지 않고 기하급수적으로 설정하여, 슈퍼스타의 가치를 롤플레이어 다수보다 높게 평가합니다.
    },
    // [나이 및 잠재력 보정]
    // 미래 가치(Future Value)를 반영하기 위한 계수들입니다.
    AGE: {
        YOUNG_LIMIT: 23,           // 유망주(Young Core)로 분류되는 나이 상한선
        HIGH_POT_THRESHOLD: 80,    // '높은 잠재력'으로 인정받는 최소 POT 수치
        YOUNG_POT_BONUS: 0.015,    // 유망주가 잠재력 1당 받는 가치 보너스 (예: 0.015 = 1.5% 가산)
        PRIME_START: 24,           // 전성기(Prime) 시작 나이
        PRIME_END: 29,             // 전성기 종료 나이
        PRIME_BONUS: 1.05,         // 전성기 선수에게 부여되는 즉시 전력감 프리미엄 (1.05 = 5% 추가)
        OLD_START: 33,             // 에이징 커브가 꺾이는 노장 나이
        OLD_PENALTY_PER_YEAR: 0.07,// 33세 이후 1살마다 깎이는 가치 비율 (에이징 커브 반영)
        MIN_OLD_VALUE: 0.2,        // 노장 선수가 가질 수 있는 최소 가치 비율 (은퇴 직전이라도 최소한의 멘토링/경험 가치 보장)
    },
    // [팀 니즈 분석 임계값]
    // AI가 팀의 강약점을 판단하여 '필요한 선수'를 식별하는 기준입니다.
    NEEDS: {
        WEAKNESS_THRESHOLD: 70,    // 해당 스탯 평균이 이 점수 미만이면 '약점(Need)'으로 판단하여 보강을 시도합니다.
        STRENGTH_THRESHOLD: 80,    // 해당 스탯 평균이 이 점수 초과면 '강점(Strength)'으로 판단합니다.
        OUTSIDE_OFFSET: 2,         // 현대 농구에서 외곽슛(Spacing)은 중요도가 높으므로 기준점을 더 높게(+2) 잡습니다.
        REBOUND_OFFSET: -5,        // 리바운드 수치는 다소 낮게 형성되는 경향을 보정합니다.
    },
    // [맥락적 가치 평가 (Contextual Valuation)]
    // AI 구단의 상황(Buying/Selling, Win-Now/Rebuild)에 따라 가치를 왜곡(Bias)시키는 계수입니다.
    CONTEXT: {
        FIT_BONUS: 0.15,           // 팀 니즈(약점)를 충족시키는 선수일 때 부여하는 가치 가산점 (15%)
        REDUNDANCY_PENALTY: 0.10,  // 이미 포지션이 겹치는 선수가 많을 때 부여하는 가치 감산점 (10%)
        
        // 스타 영입 프리미엄 (Star Acquisition Premium):
        // AI가 1옵션급 에이스를 얻을 수 있다면, 단순 계산 가치보다 훨씬 큰 대가를 지불할 용의를 가집니다.
        NEW_ALPHA_BONUS: 0.8,      // 영입 선수가 팀 내 1옵션이 될 경우 (가치 1.8배 인정 -> 공격적 영입 시도)
        NEW_SECOND_BONUS: 0.5,     // 영입 선수가 팀 내 2옵션이 될 경우 (가치 1.5배 인정)
        NEW_CORE_BONUS: 0.3,       // 영입 선수가 팀 내 3옵션이 될 경우 (가치 1.3배 인정)

        // 코어 선수 보호 (Endowment Effect):
        // AI는 자신이 보유한 핵심 선수를 내줄 때, 시장 가치보다 높은 대가를 요구합니다.
        PROTECT_ALPHA_MULT: 2.0,   // 1옵션 방출 시 요구 프리미엄 (2.0배 - 사실상 NFS, Not For Sale)
        PROTECT_SECOND_MULT: 1.7,  // 2옵션 방출 시 요구 프리미엄
        PROTECT_STARTER_MULT: 1.4, // 주전급 방출 시 요구 프리미엄
    },
    // [트레이드 성사 조건 (Thresholds)]
    ACCEPTANCE: {
        DEFAULT_RATIO: 0.95,       // 기본 교환 비율. (받는 가치) >= (주는 가치 * 0.95) 여야 수락합니다. (약간의 손해 감수)
        STAR_SWAP_RATIO: 0.90,     // 1:1 스타 스왑 시에는 거래 활성화를 위해 기준을 90%로 완화합니다.
        STAR_SWAP_STEAL_RATIO: 0.85,// 상대 스타가 내 스타보다 월등히 좋다면(OVR +3 이상), 85%만 맞춰도 즉시 수락합니다 (Steal Deal).
        CONSOLIDATION_TAX: 0.05,   // AI가 1명을 내주고 2명 이상을 받을 때(로스터 슬롯 낭비), 1명 추가당 요구하는 프리미엄 (5%)
        STAR_OVR_THRESHOLD: 85,    // '스타'로 간주하는 최소 OVR 기준
        HIGH_VALUE_THRESHOLD: 5000,// '블록버스터 트레이드'로 분류하는 가치 총량 기준
    }
};

// ------------------------------------------------------------------------------------------
//  [SECTION 2] MATCH ENGINE CONFIG (경기 시뮬레이션 설정)
// ------------------------------------------------------------------------------------------
export const SIM_CONFIG = {
    // [경기 환경 및 페이스]
    GAME_ENV: {
        BASE_POSSESSIONS: 84,      // 경기당 기본 공격 횟수 (Pace). NBA 현대 농구 평균을 반영.
        HOME_ADVANTAGE: 0.02,      // 홈팀이 갖는 승률/성공률 보정값 (2% 가산).
        PACE_SLIDER_IMPACT: 0.035, // 사용자의 페이스 슬라이더(1~10)가 실제 공격 횟수에 미치는 영향력 (1당 3.5%)
        SCORING_MODIFIER: 0.95,    // 전체 득점 볼륨 조절 계수. 시뮬레이션 결과가 너무 높은 점수대가 나오지 않도록 조정.
    },

    // [체력 및 부상 알고리즘 (Physiology Model)]
    FATIGUE: {
        DRAIN_BASE: 1.8,           // 분당 기본 체력 소모량.
        STAMINA_SAVE_FACTOR: 0.015,// 선수 스태미너 스탯 1당 체력 소모 감소량.
        DURABILITY_FACTOR: 0.005,  // 내구도(Durability) 스탯에 따른 소모량 보정.
        FATIGUE_PENALTY_LOW: 0.02, // 체력 80 미만 시 능력치 저하율 (2%)
        FATIGUE_PENALTY_MED: 0.10, // 체력 60 미만 시 능력치 저하율 (10%)
        FATIGUE_PENALTY_HIGH: 0.25,// 체력 40 미만 시 능력치 저하율 (25% - 급격한 성능 저하)
        REST_RECOVERY_OFF: 65,     // 휴식일(Off-day) 체력 회복량 기본값
        REST_RECOVERY_B2B: 35,     // 백투백(Back-to-back) 경기 시 체력 회복량 기본값 (회복 불완전)
    },
    INJURY: {
        BASE_RISK: 0.0005,         // 1분(포제션) 당 기본 부상 발생 확률 (0.05%)
        RISK_LOW_COND: 0.005,      // 체력 60 미만 시 추가되는 부상 위험도 (0.5%)
        RISK_CRITICAL_COND: 0.08,  // 체력 20 미만(혹사) 시 추가되는 부상 위험도 (8% - 매우 위험)
        SEVERE_INJURY_CHANCE: 0.65,// 부상 발생 시 '결장(Injured)'으로 이어질 확률 (나머지는 DTD)
    },

    // [슈팅 성공률 공식 (Shooting Mechanics)]
    // 기본 공식: Base% + (공격력 - 수비력) * Impact - Penalty
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,     // 골밑슛(Layup/Dunk) 기본 성공률 (58%)
        INSIDE_DEF_IMPACT: 0.004,  // 인사이드 수비 능력치 1 차이당 성공률 변동폭 (0.4%)
        OUTSIDE_BASE_PCT: 0.38,    // 외곽슛(Mid-range) 기본 성공률 (38%)
        OUTSIDE_DEF_IMPACT: 0.003, // 외곽 수비 능력치 1 차이당 성공률 변동폭 (0.3%)
        THREE_BASE_PCT: 0.35,      // 3점슛 기본 성공률 (35%)
        THREE_DEF_IMPACT: 0.003,   // 외곽 수비 1 차이당 3점 성공률 변동폭
        
        OPEN_SHOT_BONUS: 0.05,     // (로직 내 구현) 전술적 오픈 찬스 시 성공률 보너스 (+5%)
        CONTESTED_PENALTY: 0.15,   // (로직 내 구현) '에이스 스토퍼' 등 집중 견제 시 페널티 (-15%)
    },

    // [스탯 생성 가중치 (Stats Generation)]
    // 시뮬레이션된 플레이 흐름을 실제 박스스코어(Box Score) 스탯으로 변환할 때 사용하는 계수입니다.
    STATS: {
        REB_BASE_FACTOR: 0.21,     // 분당 리바운드 생성 계수 (팀 전체 리바운드 볼륨 조절)
        AST_BASE_FACTOR: 0.14,     // 분당 어시스트 생성 계수 (어시스트 볼륨 조절)
        STL_BASE_FACTOR: 0.036,    // 분당 스틸 생성 계수
        BLK_GUARD_FACTOR: 0.035,   // 가드 포지션의 블록 생성 계수 (낮음)
        BLK_BIG_FACTOR: 0.055,     // 빅맨 포지션의 블록 생성 계수 (높음)
        TOV_USAGE_FACTOR: 0.08,    // 볼 소유(Usage)가 높을수록 턴오버가 발생할 확률 계수
    }
};

export interface TacticalSliders {
  pace: number;
  offReb: number;
  defIntensity: number;
  defReb: number;
  fullCourtPress: number;
  zoneUsage: number;
  rotationFlexibility: number;
}

export interface GameTactics {
  offenseTactics: OffenseTactic[];
  defenseTactics: DefenseTactic[];
  sliders: TacticalSliders;
  starters: { PG: string; SG: string; SF: string; PF: string; C: string };
  minutesLimits: Record<string, number>;
  stopperId?: string;
}

export interface RosterUpdate {
    [playerId: string]: {
        condition: number;
        health: 'Healthy' | 'Injured' | 'Day-to-Day';
        injuryType?: string;
        returnDate?: string;
    };
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    rosterUpdates: RosterUpdate;
}

/**
 * [AI 전술 생성기]
 * AI 팀의 현재 로스터 상태(부상자 제외)를 분석하여 최적의 공격/수비 전술과 라인업을 자동으로 생성합니다.
 * 
 * 알고리즘 개요:
 * 1. 가용 선수(Healthy)를 OVR 순으로 정렬합니다.
 * 2. 포지션별 최적의 선발 라인업을 구성합니다.
 * 3. 선발 라인업의 능력치 분포(슈팅, 패스, 인사이드 등)를 분석하여 '전술 적합도 점수'를 계산합니다.
 * 4. 가장 높은 점수를 받은 전술(Best Tactic)을 채택하고, 그에 맞춰 슬라이더를 조정합니다.
 */
export function generateAutoTactics(team: Team): GameTactics {
  const healthy = team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
  
  // Track selected players to prevent duplicates in starting lineup
  const pickedIds = new Set<string>();

  const pickStarter = (positions: string[]) => {
      let candidate = healthy.find(p => !pickedIds.has(p.id) && positions.includes(p.position));
      
      if (!candidate) {
          const broadPositions = positions.flatMap(pos => {
              if (pos === 'PG' || pos === 'SG') return ['G', 'PG', 'SG'];
              if (pos === 'SF' || pos === 'PF') return ['F', 'SF', 'PF'];
              if (pos === 'C') return ['C', 'F', 'PF'];
              return [pos];
          });
          candidate = healthy.find(p => !pickedIds.has(p.id) && broadPositions.includes(p.position));
      }

      if (!candidate) {
          candidate = healthy.find(p => !pickedIds.has(p.id));
      }

      if (candidate) pickedIds.add(candidate.id);
      return candidate?.id || '';
  };

  const starters = {
    PG: pickStarter(['PG']),
    SG: pickStarter(['SG']),
    SF: pickStarter(['SF']),
    PF: pickStarter(['PF']),
    C: pickStarter(['C'])
  };

  // Analyze Team Composition for Tactics
  // Calculate efficiency score for ALL tactics and pick the best one
  const starterPlayers = Object.values(starters).map(id => team.roster.find(p => p.id === id)).filter(Boolean) as Player[];
  const rotation = starterPlayers.length === 5 ? starterPlayers : healthy.slice(0, 5);
  
  const getAvg = (players: Player[], attr: keyof Player) => {
      if (players.length === 0) return 50;
      return players.reduce((sum, p) => sum + (p[attr] as number), 0) / players.length;
  };
  const sAvg = (attr: keyof Player) => getAvg(rotation, attr);

  // [전술 적합도 계산 함수]
  // 각 전술이 요구하는 핵심 능력치(슈팅, 스피드, 인사이드 등)를 가중 평균하여 점수를 산출합니다.
  const calculateScore = (tactic: OffenseTactic): number => {
      let score = 0;
      switch(tactic) {
        case 'Balance': // 밸런스: 전체적인 OVR과 모든 능력치의 조화
            score = (sAvg('ovr') * 0.4 + sAvg('plm') * 0.2 + sAvg('def') * 0.2 + sAvg('out') * 0.2);
            break;
        case 'PaceAndSpace': // 페이스&스페이스: 가드의 패싱(PLM)과 전체적인 외곽슛(OUT), 스피드 중요
            const handlers = rotation.filter(p => p.position.includes('G'));
            const handlerPLM = handlers.length > 0 ? getAvg(handlers, 'plm') : 60;
            score = (handlerPLM * 0.45) + (sAvg('out') * 0.45) + (sAvg('speed') * 0.1);
            break;
        case 'PerimeterFocus': // 퍼리미터: 슈터들의 외곽슛 능력 극대화
            const shooters = [...rotation].sort((a,b) => b.out - a.out);
            score = ((shooters[0]?.out || 70) * 0.35) + ((shooters[1]?.out || 65) * 0.25) + (sAvg('plm') * 0.4);
            break;
        case 'PostFocus': // 포스트: 빅맨의 힘(STR)과 포스트 플레이, 인사이드 장악력
            const bigs = rotation.filter(p => p.position === 'C' || p.position === 'PF');
            const bigPower = bigs.length > 0 ? (getAvg(bigs, 'postPlay') * 0.5 + getAvg(bigs, 'strength') * 0.3 + (getAvg(bigs, 'height') - 190)) : 50;
            score = (bigPower * 0.7) + (sAvg('ins') * 0.3);
            break;
        case 'Grind': // 그라인드: 수비력(DEF) 위주의 진흙탕 싸움
            score = (sAvg('def') * 0.8) + (sAvg('plm') * 0.2);
            break;
        case 'SevenSeconds': // 7초 공격: 포인트가드의 패싱/스피드와 팀 전체의 기동력/3점
            const pg = rotation.find(p => p.position === 'PG');
            const pgFactor = pg ? (pg.plm * 0.6 + pg.speed * 0.4) : 60;
            score = (pgFactor * 0.4) + (sAvg('speed') * 0.3) + (sAvg('out') * 0.3);
            break;
      }
      return score;
  };

  const tacticsList: OffenseTactic[] = ['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'];
  let bestTactic: OffenseTactic = 'Balance';
  let maxScore = -1;

  for (const t of tacticsList) {
      const s = calculateScore(t);
      if (s > maxScore) {
          maxScore = s;
          bestTactic = t;
      }
  }

  // Optimize Sliders based on selected tactic
  let sliders: TacticalSliders = { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 3, zoneUsage: 3, rotationFlexibility: 5 };
  
  switch(bestTactic) {
      case 'SevenSeconds': sliders.pace = 9; sliders.offReb = 4; sliders.fullCourtPress = 6; break;
      case 'PaceAndSpace': sliders.pace = 7; sliders.offReb = 3; break;
      case 'PostFocus': sliders.pace = 3; sliders.offReb = 8; sliders.defReb = 8; break;
      case 'Grind': sliders.pace = 2; sliders.defIntensity = 9; sliders.defReb = 7; break;
      case 'PerimeterFocus': sliders.pace = 6; sliders.offReb = 4; break;
      default: sliders.pace = 5; break;
  }

  // Determine Defense
  const defTactics: DefenseTactic[] = ['ManToManPerimeter'];
  if (sAvg('intDef') > sAvg('perDef') + 5 || (sAvg('reb') > 80)) {
      defTactics.push('ZoneDefense');
      sliders.zoneUsage = 8;
  } else {
      sliders.zoneUsage = 2;
  }

  // Ace Stopper Assignment
  const bestDefender = healthy.find(p => p.def > 85 && p.lockdown > 85);
  let stopperId: string | undefined = undefined;
  if (bestDefender) {
      defTactics.push('AceStopper');
      stopperId = bestDefender.id;
      sliders.defIntensity = Math.min(10, sliders.defIntensity + 2);
  }

  // Minutes Distribution
  const minutesLimits: Record<string, number> = {};
  const starterIds = Object.values(starters);
  
  healthy.forEach((p, idx) => {
      let mins = 0;
      if (starterIds.includes(p.id)) {
          // Starters: 30-38 mins based on stamina and ovr
          mins = 30 + (p.stamina - 70) * 0.2 + (p.ovr - 80) * 0.2;
          mins = Math.max(28, Math.min(40, mins));
      } else if (idx < 10) {
          // Key Bench: 15-25 mins
          mins = 15 + (p.ovr - 70) * 0.5;
          mins = Math.max(10, Math.min(26, mins));
      } else {
          // Deep Bench
          mins = 0;
      }
      minutesLimits[p.id] = Math.round(mins);
  });

  return {
    offenseTactics: [bestTactic],
    defenseTactics: defTactics,
    sliders,
    starters,
    minutesLimits,
    stopperId
  };
}

/**
 * [출전 시간 분배 로직]
 * 총 240분(48분 * 5명)의 출전 시간을 로스터에 분배합니다.
 * 사용자 설정(limits)을 우선시하며, 남은 시간은 선수 위계(Starter > Bench)에 따라 자동 할당 후 정규화합니다.
 */
function distributeMinutes(roster: Player[], isStarter: boolean[], limits: Record<string, number>, sliders: TacticalSliders): number[] {
    const totalMinutes = 240;
    const minutes = roster.map(() => 0);
    let used = 0;
    
    // 1. Apply Limits & Defaults
    roster.forEach((p, i) => {
        if (limits[p.id] !== undefined && limits[p.id] > 0) {
            minutes[i] = limits[p.id];
        } else if (isStarter[i]) {
            minutes[i] = 32; // Default starter minutes
        } else if (i < 10) {
            minutes[i] = 16; // Default bench minutes
        } else {
            minutes[i] = 0;
        }
        used += minutes[i];
    });
    
    // 2. Normalize to 240
    // 할당된 시간의 총합이 240분이 되도록 비율 조정 (Scaling)
    if (used > 0) {
        const factor = 240 / used;
        for (let i = 0; i < minutes.length; i++) {
            minutes[i] = Math.round(minutes[i] * factor);
        }
    }
    
    // 3. Ensure exactly 240 (Force Correction)
    // 반올림 오차로 인해 240분이 맞지 않을 경우, 가장 많이 뛰는 선수들의 시간을 가감하여 보정
    let currentSum = minutes.reduce((a, b) => a + b, 0);
    let diff = 240 - currentSum;

    if (diff !== 0) {
       const sortedIndices = minutes.map((m, i) => ({m, i})).sort((a, b) => b.m - a.m).map(x => x.i);
       
       if (diff > 0) {
          let i = 0;
          while (diff > 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] < 48) { minutes[idx]++; diff--; }
             i++; if (i > 200) break; 
          }
       } else {
          let i = 0;
          while (diff < 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] > 0) { minutes[idx]--; diff++; }
             i++; if (i > 200) break;
          }
       }
    }
    
    return minutes;
}

function getOpponentDefensiveMetrics(roster: Player[], minutes: number[]) {
    let totalMin = 0;
    const metrics = { intDef: 0, perDef: 0, block: 0, pressure: 0, helpDef: 0 };
    roster.forEach((p, i) => {
        const min = minutes[i];
        if (min > 0) {
            metrics.intDef += p.intDef * min;
            metrics.perDef += p.perDef * min;
            metrics.block += p.blk * min;
            metrics.pressure += p.def * min;
            metrics.helpDef += p.helpDefIq * min;
            totalMin += min;
        }
    });
    if (totalMin > 0) {
        metrics.intDef /= totalMin;
        metrics.perDef /= totalMin;
        metrics.block /= totalMin;
        metrics.pressure /= totalMin;
        metrics.helpDef /= totalMin;
    }
    return metrics;
}

/**
 * [체력 회복 알고리즘]
 * 경기 시작 전, 지난 경기와의 휴식일(daysRest)에 따라 선수단의 체력을 회복시킵니다.
 * 백투백(0일 휴식)일 경우 회복량이 적어 피로가 누적됩니다.
 * 
 * @param roster 선수 명단
 * @param daysRest 휴식일 수 (0: 백투백, 1: 하루 휴식, 2+: 충분한 휴식)
 */
function applyRestToRoster(roster: Player[], daysRest: number): Player[] {
    const C = SIM_CONFIG.FATIGUE;
    return roster.map(p => {
        const currentCond = p.condition !== undefined ? p.condition : 100;
        let recoveryAmount = 0;

        if (daysRest <= 0) {
            // [백투백 경기] - 0일 휴식
            // 기본 회복량(35) + 스태미너 보정
            recoveryAmount = C.REST_RECOVERY_B2B + (p.stamina * 0.4); 
        } else {
            // [1일 이상 휴식]
            // 기본 회복량(65) + 스태미너 보정 (대부분 완전 회복)
            recoveryAmount = C.REST_RECOVERY_OFF + (p.stamina * 0.5);
        }

        const newCond = Math.min(100, Math.floor(currentCond + recoveryAmount));
        return { ...p, condition: newCond };
    });
}

/**
 * [메인 시뮬레이션 진입점]
 * 두 팀의 경기를 시뮬레이션하고 결과를 반환합니다.
 * 
 * Flow:
 * 1. 휴식일 계산 및 체력 회복 적용 (applyRestToRoster)
 * 2. 전술 설정 (사용자 전술 또는 AI 자동 전술)
 * 3. 각 팀의 퍼포먼스 시뮬레이션 (simulateTeamPerformance)
 * 4. 점수 합산 및 승패 결정 (동점 시 연장/결승골 로직)
 */
export function simulateGame(
    homeTeam: Team, 
    awayTeam: Team, 
    userTeamId: string | null, 
    userTactics?: GameTactics,
    homeRestDays: number = 3, // Default to fully rested if not specified
    awayRestDays: number = 3
): SimulationResult {
    const isUserHome = userTeamId === homeTeam.id;
    const isUserAway = userTeamId === awayTeam.id;
    
    // Apply Rest Recovery BEFORE Game
    const homeRosterRecovered = applyRestToRoster(homeTeam.roster, homeRestDays);
    const awayRosterRecovered = applyRestToRoster(awayTeam.roster, awayRestDays);

    const homeTeamReady = { ...homeTeam, roster: homeRosterRecovered };
    const awayTeamReady = { ...awayTeam, roster: awayRosterRecovered };
    
    // Determine tactics
    const homeTactics = isUserHome && userTactics ? userTactics : generateAutoTactics(homeTeamReady);
    const awayTactics = isUserAway && userTactics ? userTactics : generateAutoTactics(awayTeamReady);
    
    // Process Home Team (using recovered roster)
    const homeBox = simulateTeamPerformance(homeTeamReady, homeTactics, awayTeamReady, awayTactics, true);
    // Process Away Team (using recovered roster)
    const awayBox = simulateTeamPerformance(awayTeamReady, awayTactics, homeTeamReady, homeTactics, false);
    
    let homeScore = homeBox.stats.reduce((sum, p) => sum + p.pts, 0);
    let awayScore = awayBox.stats.reduce((sum, p) => sum + p.pts, 0);
    
    // Tie-Breaker Logic (간단한 연장전/결승골 처리)
    if (homeScore === awayScore) {
        if (Math.random() > 0.5) {
            homeScore += 1;
            const hero = homeBox.stats.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        } else {
            awayScore += 1;
            const hero = awayBox.stats.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        }
    }

    return {
        homeScore,
        awayScore,
        homeBox: homeBox.stats,
        awayBox: awayBox.stats,
        rosterUpdates: { ...homeBox.updates, ...awayBox.updates }
    };
}

/**
 * [Function] simulateTeamPerformance
 * 한 팀의 경기 내용을 시뮬레이션하고, 선수별 스탯(박스스코어)을 생성하는 핵심 엔진입니다.
 * 
 * Logic Flow:
 * 1. 출전 시간 분배 (Distribute Minutes)
 * 2. 페이스 계산 (Pace Calculation): 전술 및 슬라이더에 따른 팀 공격 횟수 산출
 * 3. Usage 할당: OVR^3 가중치를 사용하여 스타 플레이어의 볼 점유율 계산
 * 4. 체력 및 부상: 플레이 타임에 따른 체력 소모(Drain) 및 부상 확률(Injury Risk) 계산
 * 5. 슈팅 성공률: 능력치, 수비 압박, 체력, 홈 어드밴티지 등을 종합하여 FG%, 3P% 산출
 * 6. 스탯 생성: 리바운드, 어시스트, 스틸, 블록 등의 2차 스탯 생성
 */
function simulateTeamPerformance(
    team: Team, 
    teamTactics: GameTactics, 
    oppTeam: Team, 
    oppTactics: GameTactics, 
    isHome: boolean
): { stats: PlayerBoxScore[], updates: RosterUpdate } {
    const C = SIM_CONFIG;
    const rosterUpdates: RosterUpdate = {};
    const sliders = teamTactics.sliders;
    
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
    
    const starterIds = Object.values(teamTactics.starters);
    const isStarter = healthyPlayers.map(p => starterIds.includes(p.id));

    // Calculate minutes only for healthy players
    const finalMinutesList = distributeMinutes(healthyPlayers, isStarter, teamTactics.minutesLimits, sliders);
    
    const minutesMap: Record<string, number> = {};
    healthyPlayers.forEach((p, i) => {
        minutesMap[p.id] = finalMinutesList[i];
    });

    const oppSliders = oppTactics.sliders;
    const oppSorted = oppTeam.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
    const oppMinsEst = distributeMinutes(oppSorted, oppSorted.map((_, i) => i < 5), {}, oppSliders);
    const oppDefMetrics = getOpponentDefensiveMetrics(oppSorted, oppMinsEst);

    const hcaBase = (Math.random() * 0.02) + 0.01; 
    const homeAdvantageModifier = isHome ? C.GAME_ENV.HOME_ADVANTAGE : -(C.GAME_ENV.HOME_ADVANTAGE * 0.8);

    // 1. Pace Calculation (공격 횟수 계산)
    // 슬라이더(1~10)와 전술(PaceAndSpace 등)에 따라 기본 공격 횟수(84회)를 증감시킵니다.
    let paceMultiplier = 1.0 + (sliders.pace - 5) * C.GAME_ENV.PACE_SLIDER_IMPACT; 
    paceMultiplier += (sliders.fullCourtPress - 5) * 0.015; // 풀코트 프레스는 페이스를 올림
    
    let tacticPerimeterBonus = 1.0; 
    let tacticInteriorBonus = 1.0; 
    let tacticPaceBonus = 0.0;      
    let tacticDrainMult = 1.0;      

    if (teamTactics) {
      teamTactics.offenseTactics.forEach(tactic => {
        if (tactic === 'PaceAndSpace') { tacticPerimeterBonus += 0.08; tacticPaceBonus += 0.05; tacticDrainMult += 0.1; } 
        else if (tactic === 'PerimeterFocus') { tacticPerimeterBonus += 0.06; }
        else if (tactic === 'PostFocus') { tacticInteriorBonus += 0.08; tacticPaceBonus -= 0.05; }
        else if (tactic === 'SevenSeconds') { tacticPerimeterBonus += 0.10; tacticPaceBonus += 0.14; tacticDrainMult += 0.15; } 
        else if (tactic === 'Grind') { tacticPaceBonus -= 0.20; }
      });
      
      teamTactics.defenseTactics.forEach(tactic => {
          if (tactic === 'ManToManPerimeter') { tacticDrainMult += 0.05; }
          else if (tactic === 'AceStopper') { tacticDrainMult += 0.05; } 
      });
    }
    paceMultiplier += tacticPaceBonus;

    // 최종 팀 야투 시도 횟수 (FGA Target)
    const teamFgaTarget = (C.GAME_ENV.BASE_POSSESSIONS + (Math.random() * 8) + (isHome ? 2 : 0)) * C.GAME_ENV.SCORING_MODIFIER * paceMultiplier;
    const hastePenalty = paceMultiplier > 1.15 ? (paceMultiplier - 1.15) * 0.6 : 0; // 너무 빠르면 정확도 하락 (Haste Penalty)

    const oppZoneEffect = (oppSliders.zoneUsage - 5) * 2.0; 
    oppDefMetrics.intDef += oppZoneEffect; 
    oppDefMetrics.perDef -= oppZoneEffect; 

    const acePlayer = healthyPlayers.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current, healthyPlayers[0] || { ovr: 0, id: 'dummy' });

    // 2. Usage Allocation (공격 점유율 할당)
    // OVR의 3승(cubic)을 사용하여 스타 플레이어에게 공격권이 집중되도록 설계 (슈퍼스타 효과)
    // 예: OVR 90(729,000) vs OVR 70(343,000) -> 2배 이상의 공격 점유율 차이 발생
    const totalUsageWeight = healthyPlayers.reduce((sum, p) => {
        const mp = minutesMap[p.id] || 0;
        let w = Math.pow(p.ovr, 3) * (p.offConsist / 50) * mp; 
        if (teamTactics?.offenseTactics.includes('PostFocus')) {
             if (p.position === 'C' || p.position === 'PF') w *= 1.4;
             if (p.closeShot > 80) w *= 1.1; 
        }
        if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) w *= 1.4;
        w *= (p.shotIq / 75); 
        return sum + w;
    }, 0) || 1; 

    const boxScores: PlayerBoxScore[] = [];

    team.roster.forEach(p => {
      const mp = minutesMap[p.id] || 0;
      
      const preGameCondition = p.condition !== undefined ? p.condition : 100;
      let newCondition = preGameCondition;
      let newHealth = p.health;
      let injuryType = p.injuryType;
      let returnDate = p.returnDate;

      let isStopper = false;
      let isAceTarget = false;
      let matchupEffect = 0;

      if (mp > 0) {
          /**
           * [체력 소모 알고리즘] (Fatigue Drain)
           * 기본 소모량에 스태미너, 내구도, 전술 강도(Slider)를 반영하여 차감합니다.
           */
          const staminaFactor = Math.max(0.25, C.FATIGUE.DRAIN_BASE - (p.stamina * C.FATIGUE.STAMINA_SAVE_FACTOR)); 
          const durabilityFactor = 1 + (80 - p.durability) * C.FATIGUE.DURABILITY_FACTOR;
          const baseDrain = mp * staminaFactor * durabilityFactor;
          
          const sliderIntensity = (sliders.pace + sliders.defIntensity + sliders.fullCourtPress) / 15; 
          let drain = baseDrain * sliderIntensity * tacticDrainMult;
          
          const threshold = p.stamina * 0.4; // 적정 출전 시간 (ex: STA 80 -> 32분)
          if (mp > threshold) {
              const overMinutes = mp - threshold;
              drain += overMinutes * 0.5; // 혹사 페널티 (Overwork Penalty)
          }

          isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
          if (isStopper) drain *= 1.25; // 수비 에이스는 체력 더 소모

          newCondition = Math.max(0, Math.floor(preGameCondition - drain));
          
          // [부상 알고리즘] (Injury Logic)
          // 체력이 낮을수록 부상 확률이 기하급수적으로 증가합니다.
          let injuryRisk = C.INJURY.BASE_RISK;
          if (newCondition < 20) injuryRisk += C.INJURY.RISK_CRITICAL_COND;
          else if (newCondition < 40) injuryRisk += 0.03;
          else if (newCondition < 60) injuryRisk += C.INJURY.RISK_LOW_COND;
          
          injuryRisk *= (1 + (100 - p.durability) / 50); 

          if (Math.random() < injuryRisk) {
              const isSevere = Math.random() > C.INJURY.SEVERE_INJURY_CHANCE;
              const minorInjuries = ['Ankle Sprain', 'Knee Soreness', 'Back Spasms', 'Calf Strain', 'Groin Tightness', 'Hamstring Tightness'];
              const severeInjuries = ['Hamstring Strain', 'MCL Sprain', 'High Ankle Sprain', 'Calf Strain', 'Bone Bruise', 'Achilles Soreness'];
              
              newHealth = isSevere ? 'Injured' : 'Day-to-Day';
              
              if (isSevere) {
                  injuryType = severeInjuries[Math.floor(Math.random() * severeInjuries.length)];
                  const days = Math.floor(Math.random() * 21) + 7;
                  const rDate = new Date();
                  rDate.setDate(rDate.getDate() + days);
                  returnDate = rDate.toISOString().split('T')[0];
              } else {
                  injuryType = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
                  const days = Math.floor(Math.random() * 4) + 1;
                  const rDate = new Date();
                  rDate.setDate(rDate.getDate() + days);
                  returnDate = rDate.toISOString().split('T')[0];
              }
          }
      } 

      rosterUpdates[p.id] = {
          condition: newCondition,
          health: newHealth,
          injuryType,
          returnDate
      };

      if (mp <= 0) {
          return; 
      }

      // --- GAME STATS CALCULATION (Only for mp > 0) ---
      
      const intensityFactor = 1 + (sliders.defIntensity - 5) * 0.05 + (sliders.fullCourtPress - 5) * 0.05;
      const inGameFatiguePenalty = Math.max(0, (mp - (p.stamina * 0.4))) * 0.01 * intensityFactor; 
      
      // 체력 저하에 따른 퍼포먼스 페널티
      let fatiguePerfPenalty = 0;
      if (preGameCondition < 40) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_HIGH; 
      else if (preGameCondition < 60) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_MED;
      else if (preGameCondition < 80) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_LOW;

      const mentalFortitude = (p.intangibles || 50) / 100; 
      const effectivePerfDrop = (fatiguePerfPenalty + inGameFatiguePenalty) * (1 - (mentalFortitude * 0.5));

      // [3. 개인별 공격 시도(FGA) 계산]
      let pUsage = (Math.pow(p.ovr, 3) * (p.offConsist / 50) * mp * (p.shotIq / 75));
      if (teamTactics?.offenseTactics.includes('PostFocus')) {
          if (p.position === 'C' || p.position === 'PF') pUsage *= 1.4;
          if (p.closeShot > 80) pUsage *= 1.1;
      } 
      if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) pUsage *= 1.4;
      
      let fga = Math.round(teamFgaTarget * (pUsage / totalUsageWeight));

      // 능력치 종합 (Composite Abilities)
      const insideAbility = (p.layup * 0.25 + p.dunk * 0.15 + p.postPlay * 0.15 + p.closeShot * 0.25 + p.strength * 0.10 + p.vertical * 0.10) * tacticInteriorBonus * (1 - effectivePerfDrop);
      const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
      const outsideAbility = (p.midRange * 0.3 + threeAvg * 0.5 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);

      let insideBias = 0.5;
      if (['C', 'PF'].includes(p.position)) insideBias = 0.75;
      if (threeAvg > 85) insideBias -= 0.25; 
      if (p.dunk > 90) insideBias += 0.1;    

      const mentalClutchBonus = Math.max(0, (p.intangibles - 75) * 0.001); 

      // [4. 슛 성공률 공식] (Shooting % Formulas)
      // Base% + (Offense - Defense Diff) * Impact + Bonus
      const insideSuccessRate = Math.min(0.85, Math.max(0.35, 
        C.SHOOTING.INSIDE_BASE_PCT 
        + (insideAbility - oppDefMetrics.intDef) * C.SHOOTING.INSIDE_DEF_IMPACT 
        - (oppDefMetrics.block * 0.001) 
        - (hastePenalty * 0.5) 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));

      const outsideSuccessRate = Math.min(0.60, Math.max(0.25, 
        C.SHOOTING.OUTSIDE_BASE_PCT 
        + (outsideAbility - oppDefMetrics.perDef) * C.SHOOTING.OUTSIDE_DEF_IMPACT 
        - (oppDefMetrics.pressure * 0.001) 
        - (oppDefMetrics.helpDef * 0.001) 
        - hastePenalty 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));

      let fgp = (insideSuccessRate * insideBias) + (outsideSuccessRate * (1 - insideBias));
      fgp *= (1.0 - effectivePerfDrop); 
      
      // 에이스 스토퍼 효과 적용 (Ace Stopper Effect)
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      isAceTarget = !!(oppHasStopper && p.id === acePlayer.id);

      if (isAceTarget) {
          const effect = -15; // 성공률 15% 감소 (Lockdown)
          fgp *= (1.0 + (effect / 100));
          matchupEffect = effect;
      }

      const fgm = Math.round(fga * fgp);

      // 3점슛 계산
      const p3Tendency = (threeAvg / 100) * (teamTactics?.offenseTactics.includes('PaceAndSpace') || teamTactics?.offenseTactics.includes('SevenSeconds') ? 1.4 : 1.0);
      let p3a = Math.round(fga * p3Tendency * 0.55); 
      const p3p = Math.min(0.50, Math.max(0.20, 
         C.SHOOTING.THREE_BASE_PCT 
         + ((threeAvg - oppDefMetrics.perDef) * C.SHOOTING.THREE_DEF_IMPACT) 
         - effectivePerfDrop 
         - (hastePenalty * 0.8) 
         + (mentalClutchBonus * 0.5) 
         + (homeAdvantageModifier * 0.8)
      )); 
      
      let p3m = Math.round(p3a * p3p);
      if (p3a > fga) p3a = fga; 
      if (p3m > p3a) p3m = p3a;
      if (p3m > fgm) p3m = fgm; 

      // 자유투 계산
      const drawFoulRate = (p.drawFoul * 0.6 + p.agility * 0.2 + insideBias * 20) / 400;
      const fta = Math.round(fga * drawFoulRate * (1 + (sliders.defIntensity - 5) * 0.05));
      
      const ftHca = isHome ? 0.02 : -0.01; 
      const ftm = Math.round(fta * ((p.ft / 100) + mentalClutchBonus + ftHca));

      // [5. 기타 스탯 생성] (Stats Generation)
      
      // Rebounds (Rating + Physicals) * Min * Factor
      const offRebSlider = 1.0 + (sliders.offReb - 5) * 0.05;
      const defRebSlider = 1.0 + (sliders.defReb - 5) * 0.03;
      
      const rebAttr = (p.reb * 0.6 + p.vertical * 0.1 + p.hustle * 0.1 + p.strength * 0.2);
      let rebBase = rebAttr * (mp / 48) * C.STATS.REB_BASE_FACTOR; 
      
      if (p.position === 'C') rebBase *= 1.15;
      if (p.position === 'PF') rebBase *= 1.08;

      const totalReb = Math.round(rebBase * (Math.random() * 0.4 + 0.8) * defRebSlider);
      const offRebRatio = (p.offReb / (p.offReb + p.defReb * 1.5)); 
      const offReb = Math.round(totalReb * offRebRatio * offRebSlider);
      const defReb = Math.max(0, totalReb - offReb);

      // Assists (Pass/Vision/IQ/Handle) * Min * Factor
      const astAttr = (p.passAcc * 0.3 + p.passVision * 0.4 + p.passIq * 0.2 + p.handling * 0.1);
      let astBase = astAttr * (mp / 48) * C.STATS.AST_BASE_FACTOR;
      
      if (p.position === 'PG') astBase *= 1.4;
      if (p.position === 'SG') astBase *= 1.1;
      
      if (teamTactics?.offenseTactics.includes('SevenSeconds') || teamTactics?.offenseTactics.includes('PaceAndSpace')) {
          astBase *= 1.1;
      }
      const ast = Math.round(astBase * (Math.random() * 0.5 + 0.75));

      // Steals
      const stlAttr = (p.steal * 0.5 + p.perDef * 0.3 + p.hustle * 0.2);
      const stlIntensity = 1 + (sliders.defIntensity - 5) * 0.06;
      let stlBase = stlAttr * (mp / 48) * C.STATS.STL_BASE_FACTOR * stlIntensity;
      if (p.position === 'PG' || p.position === 'SG') stlBase *= 1.1; 
      const stl = Math.round(stlBase * (Math.random() * 0.5 + 0.75));

      // Blocks
      const blkAttr = (p.blk * 0.6 + p.vertical * 0.2 + p.height * 0.2);
      let blkFactor = 0.035; 
      if (p.position === 'C') blkFactor = C.STATS.BLK_BIG_FACTOR;
      else if (p.position === 'PF') blkFactor = 0.045;
      const blk = Math.round(blkAttr * (mp / 48) * blkFactor * (Math.random() * 0.6 + 0.7));

      // Turnovers (Usage correlated)
      const usageProxy = (fga + ast * 2 + 5);
      const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
      const tovBase = (usageProxy * C.STATS.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 
      const tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

      const pts = (fgm - p3m) * 2 + p3m * 3 + ftm;

      boxScores.push({
          playerId: p.id,
          playerName: p.name,
          pts, reb: totalReb, offReb, defReb, ast, stl, blk, tov,
          fgm, fga, p3m, p3a, ftm, fta,
          mp, g: 1, gs: starterIds.includes(p.id) ? 1 : 0,
          isStopper,
          isAceTarget,
          matchupEffect
      });
    });

    return { stats: boxScores, updates: rosterUpdates };
}

// ==========================================================================================
//  💰 TRADE LOGIC CORE (트레이드 엔진 핵심)
// ==========================================================================================

/**
 * [Function] getPlayerTradeValue
 * 선수의 객관적인 시장 가치를 산출합니다.
 * OVR을 기반으로 지수 함수를 적용하고, 나이 및 잠재력을 반영하여 보정합니다.
 * 
 * @param p 평가 대상 선수
 * @returns {number} 기초 트레이드 가치 (Raw Value)
 */
export function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;

    // 1. 지수 기반 가치 산정 (Exponential Base)
    // OVR이 특정 임계값(REPLACEMENT_LEVEL_OVR)을 넘을 때마다 가치가 기하급수적으로 상승합니다.
    // 이는 '대체 불가능한 선수'의 가치를 일반 선수와 차별화하기 위함입니다.
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. 나이 및 잠재력 보정 (Future Value Modifier)
    // - 어린 유망주(23세 이하, 높은 잠재력)는 미래 가치를 반영해 프리미엄을 받습니다.
    if (p.age <= C.AGE.YOUNG_LIMIT && p.potential >= C.AGE.HIGH_POT_THRESHOLD) {
        const potBonus = 1.0 + ((p.potential - C.AGE.HIGH_POT_THRESHOLD) * C.AGE.YOUNG_POT_BONUS); 
        baseValue *= potBonus;
    }
    // - 전성기 구간(24~29세)은 현재 기량을 100% 이상 발휘하므로 가치 보존율이 높습니다.
    else if (p.age >= C.AGE.PRIME_START && p.age <= C.AGE.PRIME_END) {
        baseValue *= C.AGE.PRIME_BONUS;
    }
    // - 노장 구간(33세 이상)은 에이징 커브를 반영하여 매년 가치가 하락합니다.
    else if (p.age >= C.AGE.OLD_START) {
        const agePenalty = 1.0 - ((p.age - (C.AGE.OLD_START - 1)) * C.AGE.OLD_PENALTY_PER_YEAR); 
        baseValue *= Math.max(C.AGE.MIN_OLD_VALUE, agePenalty);
    }
    
    return Math.floor(baseValue);
}

/**
 * [Function] getTeamNeeds
 * 팀의 현재 로스터(상위 8인)를 분석하여 부족한 부분(Weakness)과 강점(Strength)을 도출합니다.
 * 이는 AI가 무지성으로 선수를 수집하지 않고, 팀 구성에 맞는 트레이드를 하도록 유도합니다.
 *
 * @param team 분석 대상 AI 팀
 * @returns { needs: string[], strengths: string[] } 부족한 스탯 키워드와 강력한 스탯 키워드 목록
 */
function getTeamNeeds(team: Team): { needs: string[], strengths: string[] } {
    const C = TRADE_CONFIG.NEEDS;
    const top8 = [...team.roster].sort((a,b) => b.ovr - a.ovr).slice(0, 8);
    
    if (top8.length === 0) return { needs: [], strengths: [] };

    const avg = (attr: keyof Player) => top8.reduce((sum, p) => sum + (p[attr] as number), 0) / top8.length;

    const stats = {
        ins: avg('ins'),
        out: avg('out'),
        plm: avg('plm'),
        def: avg('def'),
        reb: avg('reb')
    };

    const needs: string[] = [];
    const strengths: string[] = [];

    if (stats.ins < C.WEAKNESS_THRESHOLD) needs.push('ins');
    if (stats.out < C.WEAKNESS_THRESHOLD + C.OUTSIDE_OFFSET) needs.push('out');
    if (stats.plm < C.WEAKNESS_THRESHOLD) needs.push('plm');
    if (stats.def < C.WEAKNESS_THRESHOLD) needs.push('def');
    if (stats.reb < C.WEAKNESS_THRESHOLD + C.REBOUND_OFFSET) needs.push('reb');

    if (stats.ins > C.STRENGTH_THRESHOLD) strengths.push('ins');
    if (stats.out > C.STRENGTH_THRESHOLD + C.OUTSIDE_OFFSET) strengths.push('out');
    if (stats.plm > C.STRENGTH_THRESHOLD) strengths.push('plm');
    if (stats.def > C.STRENGTH_THRESHOLD) strengths.push('def');
    if (stats.reb > C.STRENGTH_THRESHOLD + C.REBOUND_OFFSET) strengths.push('reb');

    return { needs, strengths };
}

/**
 * [Function] getContextualTradeValue
 * 특정 팀 입장에서 선수의 가치를 재평가하는 핵심 함수입니다.
 * 선수의 '절대적 가치'에 '팀 상황(Needs, Rank)'을 반영하여 '상대적 가치'를 계산합니다.
 *
 * @param player 대상 선수
 * @param teamContext 평가 주체인 AI 팀
 * @param isAcquiring true면 영입 시도(Buying), false면 방출 시도(Selling)
 * @returns {number} 상황에 따라 보정된 최종 가치
 */
function getContextualTradeValue(player: Player, teamContext: Team, isAcquiring: boolean): number {
    const C = TRADE_CONFIG.CONTEXT;
    let value = getPlayerTradeValue(player);
    const { needs } = getTeamNeeds(teamContext);
    
    const sortedRoster = [...teamContext.roster].sort((a,b) => b.ovr - a.ovr);
    const rank = sortedRoster.findIndex(p => p.id === player.id);

    if (isAcquiring) {
        // [CASE A: AI가 이 선수를 영입하려는 경우 (Buying Mode)]
        // "이 선수가 우리 팀에 얼마나 필요한가?"

        // 1. 니즈 충족 보너스 (Fit Bonus)
        let fitBonus = 1.0;
        if (needs.includes('ins') && player.ins > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('out') && player.out > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('plm') && player.plm > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('def') && player.def > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('reb') && player.reb > 75) fitBonus += C.FIT_BONUS;
        
        // 2. 포지션 중복 페널티 (Redundancy Penalty)
        const playersAtPos = sortedRoster.filter(p => p.position === player.position).length;
        if (playersAtPos >= 3) fitBonus -= C.REDUNDANCY_PENALTY;

        // 3. ★ 스타 영입 프리미엄 (Star Acquisition Premium) ★
        // AI가 에이스급 선수를 얻을 수 있다면, 더 큰 대가를 지불할 용의가 있습니다.
        const wouldBeRank = sortedRoster.filter(p => p.ovr > player.ovr).length;
        
        if (wouldBeRank === 0) fitBonus += C.NEW_ALPHA_BONUS;      // 새로운 1옵션
        else if (wouldBeRank === 1) fitBonus += C.NEW_SECOND_BONUS;// 새로운 2옵션
        else if (wouldBeRank === 2) fitBonus += C.NEW_CORE_BONUS;  // 새로운 3옵션

        value *= fitBonus;
    } else {
        // [CASE B: AI가 이 선수를 내줘야 하는 경우 (Selling Mode)]
        // "이 선수를 잃으면 우리 팀에 얼마나 타격인가?" (보유 효과)

        // 1. ★ 코어 보호 로직 (Core Protection) ★
        // 팀의 핵심 선수를 뺏기지 않으려는 방어 기제입니다.
        let retentionPremium = 1.0;
        if (rank === 0) retentionPremium = C.PROTECT_ALPHA_MULT;      // 1옵션
        else if (rank === 1) retentionPremium = C.PROTECT_SECOND_MULT;// 2옵션
        else if (rank >= 2 && rank <= 4) retentionPremium = C.PROTECT_STARTER_MULT; // 주전
        
        value *= retentionPremium;
    }

    return value;
}

/**
 * [Function] generateTradeOffers
 * 사용자가 트레이드 블록(Block)에 올린 선수들을 대상으로, AI 구단들이 제안(Offer)을 생성합니다.
 * AI는 자신의 잉여 자원을 내어주고 사용자의 선수를 영입하려 시도합니다.
 */
export function generateTradeOffers(players: Player[], myTeam: Team, allTeams: Team[]): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const offers: TradeOffer[] = [];
    if (players.length === 0) return offers;

    const mySalary = players.reduce((sum, p) => sum + p.salary, 0);

    allTeams.forEach(targetTeam => {
        if (targetTeam.id === myTeam.id) return;

        // 1. 사용자의 매물 가치 평가 (Buying Mode)
        let userPackageValueToAI = 0;
        players.forEach(p => {
            userPackageValueToAI += getContextualTradeValue(p, targetTeam, true);
        });

        // 상대 팀 로스터를 가치 역순(낮은 순)으로 정렬하여 벤치 멤버부터 내보내려 시도합니다.
        const candidates = [...targetTeam.roster].sort((a,b) => a.ovr - b.ovr);
        
        // 무작위 패키지 조합 시도 (Monte Carlo Simulation)
        for (let i = 0; i < 25; i++) {
            const count = Math.floor(Math.random() * 3) + 1;
            const tradePack: Player[] = [];
            const visited = new Set<number>();
            
            for (let k = 0; k < count; k++) {
                const idx = Math.floor(Math.random() * candidates.length);
                if (!visited.has(idx)) {
                    visited.add(idx);
                    tradePack.push(candidates[idx]);
                }
            }
            
            // 2. AI의 제시 매물 비용 계산 (Selling Mode)
            let aiPackageCost = 0;
            let targetSalary = 0;
            tradePack.forEach(p => {
                aiPackageCost += getContextualTradeValue(p, targetTeam, false);
                targetSalary += p.salary;
            });

            // A. 샐러리 매칭 (Salary Match)
            const isSalaryMatch = Math.abs(mySalary - targetSalary) < 5 || (targetSalary >= mySalary * 0.8 && targetSalary <= mySalary * 1.25);
            if (!isSalaryMatch) continue;

            // B. 가치 교환 비율 검증
            let requiredRatio = C.DEFAULT_RATIO;

            // [Fair Star Swap Exception]
            // 만약 1:1 교환이고 양쪽 가치가 높다면(스타급 딜), 기준을 완화하여 거래를 활성화합니다.
            if (tradePack.length === players.length && userPackageValueToAI > C.HIGH_VALUE_THRESHOLD) { 
                 requiredRatio = C.STAR_SWAP_RATIO;
            }

            // C. 최종 수락 여부 판단
            if (userPackageValueToAI >= aiPackageCost * requiredRatio) {
                const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
                if (!isDup) {
                    const rawUserVal = players.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    const rawTargetVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    
                    offers.push({
                        teamId: targetTeam.id,
                        teamName: targetTeam.name,
                        players: tradePack,
                        diffValue: rawTargetVal - rawUserVal 
                    });
                }
            }
        }
    });

    return offers.sort((a,b) => b.diffValue - a.diffValue).slice(0, 5);
}

/**
 * [Function] generateCounterOffers
 * 사용자가 특정 팀의 선수를 원할 때(Proposal), AI가 그에 상응하는 대가(사용자 팀 선수)를 역제안합니다.
 * AI는 잃게 될 선수의 가치를 계산하고, 그 이상의 가치를 가진 사용자 선수를 요구합니다.
 */
export function generateCounterOffers(wantedPlayers: Player[], targetTeam: Team, myTeam: Team): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const requirements: TradeOffer[] = [];
    
    // 1. AI가 잃게 될 가치 계산 (Cost to AI / Selling Mode)
    let wantedValueToAI = 0;
    let wantedSalary = 0;
    wantedPlayers.forEach(p => {
        wantedValueToAI += getContextualTradeValue(p, targetTeam, false);
        wantedSalary += p.salary;
    });

    const myCandidates = [...myTeam.roster].sort((a,b) => b.ovr - a.ovr);

    for (let i = 0; i < 35; i++) { 
        let count = Math.floor(Math.random() * 3) + 1;
        
        // [Heuristic] 1:1 딜 선호 경향
        if (wantedPlayers.length === 1 && Math.random() < 0.6) {
            count = 1; 
        }

        const tradePack: Player[] = [];
        const visited = new Set<number>();
        
        // [Optimization] 고가치 트레이드일 경우 상위 선수 위주 탐색
        const isHighValueTrade = wantedValueToAI > C.HIGH_VALUE_THRESHOLD; 
        
        for (let k = 0; k < count; k++) {
             let idx;
             if (isHighValueTrade && k === 0 && Math.random() < 0.7) {
                 idx = Math.floor(Math.random() * 5); 
             } else {
                 idx = Math.floor(Math.random() * myCandidates.length);
             }
             
             if (!visited.has(idx) && myCandidates[idx]) {
                 visited.add(idx);
                 tradePack.push(myCandidates[idx]);
             }
        }
        
        if (tradePack.length === 0) continue;

        // 2. AI가 얻게 될 가치 계산 (Value to AI / Buying Mode)
        let myPackValueToAI = 0;
        let myPackSalary = 0;
        tradePack.forEach(p => {
            myPackValueToAI += getContextualTradeValue(p, targetTeam, true);
            myPackSalary += p.salary;
        });

        const isSalaryMatch = Math.abs(wantedSalary - myPackSalary) < 5 || (myPackSalary >= wantedSalary * 0.8 && myPackSalary <= wantedSalary * 1.25);
        if (!isSalaryMatch) continue;

        let requiredRatio = 1.0;
        
        // [Fair Star Swap Logic]
        if (tradePack.length === 1 && wantedPlayers.length === 1) {
            const myP = tradePack[0];
            const targetP = wantedPlayers[0];
            if (myP.ovr >= C.STAR_OVR_THRESHOLD && targetP.ovr >= C.STAR_OVR_THRESHOLD) {
                requiredRatio = C.STAR_SWAP_RATIO; 
                
                // 사용자가 더 좋은 선수를 제시하면 즉시 수락 (Steal Deal)
                if (myP.ovr >= targetP.ovr + 3) {
                    requiredRatio = C.STAR_SWAP_STEAL_RATIO; 
                }
            }
        }

        // [Consolidation Tax] 로스터 정리 비용
        if (tradePack.length > wantedPlayers.length) {
            requiredRatio += (tradePack.length - wantedPlayers.length) * C.CONSOLIDATION_TAX; 
        }

        // 최종 제안 생성 여부 판단
        if (myPackValueToAI >= wantedValueToAI * requiredRatio) {
             const isDup = requirements.some(r => r.players.length === tradePack.length && r.players.every(p => tradePack.some(tp => tp.id === p.id)));
             if (!isDup) {
                 const rawUserVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                 const rawTargetVal = wantedPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);

                 // 사용자가 과도하게 손해보는 제안은 필터링
                 if (rawUserVal > rawTargetVal * 1.5) continue; 

                 requirements.push({
                     teamId: myTeam.id,
                     teamName: myTeam.name,
                     players: tradePack,
                     diffValue: rawUserVal - rawTargetVal 
                 });
             }
        }
    }

    return requirements.sort((a,b) => a.diffValue - b.diffValue).slice(0, 5); 
}
