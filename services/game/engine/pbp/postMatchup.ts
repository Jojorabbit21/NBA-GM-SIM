import type { LivePlayer } from './pbpTypes';
import type { PlayTypeEra } from '../../../../types/simSettings';
import { resolvePlayTypeEra } from '../../config/playTypeProfiles';

/**
 * [2026-11-11] 포스트업 매치업 (POST_MATCHUP) — server 미러: server/src/shared/engine/pbp/postMatchup.ts
 *
 * 맨투맨 포스트업은 수비수를 먼저 정하고(possessionHandler), 공격 포스트 힘과 수비 포스트 저항을 비교한
 * 포스트 대결로 슛 위치를 확정한다. 지역방어 포스트업은 위치가 수비수(앵커)를 정하므로 지금처럼 위치 먼저.
 *
 *   power  P = postPlay × w + strength × (1 − w)      (w = POST_WEIGHT)
 *   resist R = intDef   × w + strength × (1 − w)
 *   depth(x) = tanh(x / DEPTH_SCALE)                  — 이길수록 깊이 들어가되 포화
 *   threat   = depth(P − R)                           — 이 수비수 상대 절대 우위
 *   delta    = threat − mean_k depth(P − REF[pos][k]) — "이 수비수 상대" − "그 포지션의 평소 수비수들 상대"
 *
 * ① 슛 위치: 림 × e^{ZONE_K·delta}, 미드 × e^{−ZONE_K·delta}, 페인트 1 (selectZone의 zoneMult로 전달)
 * ② 헬프 시도(더블팀): × e^{HELP_K·(threat − HELP_CENTER)} — 포스트업 헬프 총량은 그대로 두고 압도하는 매치업에 몰아준다
 * ③ 몰린 페이더웨이(맨투맨): 위치가 미드로 정해진 포스트업은 min(CAP, K × max(0, −threat)) 확률로 '몰린 페이더웨이' —
 *    활로가 막혀 누구나 최후의 보루로 던지는 슛(자격 없음). 슛 종류는 Fadeaway 그대로, 수비 방해 계수만 FORCED_FADE_CONTEST.
 *    기술 페이더웨이(resolveFinish의 엘리트 자격·방해 0.4)는 그대로 — 골라서 던지는 좋은 슛과 몰려서 던지는 나쁜 슛을 구분.
 * ④ 힘만 센 포스트의 공격자 파울(지역방어 포함 본인 포스트업): 파울 확률 × e^{FOUL_K·(x − FOUL_CENTER)},
 *    x = max(0, 근력 − 70)/20 × (1 + max(0, 75 − postPlay)/20) — 힘이 셀수록 늘고 기술이 낮으면 더(힘 약하면 기술 무관 기본).
 *    중심값으로 포스트업 공격자 파울 총량은 그대로. 킥아웃으로 받은 선수는 포스트업 고율이 아니라 기본 차징율.
 *
 * delta의 기준을 "평소 수비수들"로 두는 이유: 선수 존 성향은 실제 데이터이고 거기엔 본인 근력·포스트 기술의 평균
 * 효과가 이미 들어 있다. 공격자 힘을 기준 없이 더하면 강한 선수가 성향보다 림을 더 쏜다(이중 반영). 포지션별 수비수
 * 분포로 빼면 선수별 평균 delta = 0(성향 보존)이고, 공격자 능력은 포화 곡선을 통해 상호작용으로만 들어간다.
 * 더블팀 빈도는 성향 데이터에 없으므로 헬프는 절대 우위(threat)를 쓴다.
 *
 * 근거·측정(하네스, NBA Active 4시즌·PBL 2시즌×2): 리그 득점·TS·포스트업 림 비중·헬프 총량 불변, R이 리그 평균보다 15+ 낮은
 * 수비수 상대 림 비중 22 → 28%·강한 수비수 35 → 29%, 압도 매치업 헬프 52 → 83%·밀리는 매치업 55 → 22%.
 * 상세 docs/plan/post-matchup-plan.md, dev-log 2026-11-11.
 */
export const POST_MATCHUP = {
    ENABLED: true,                 // false면 포스트업 위치를 수비수보다 먼저 뽑는 이전 순서와 동일
    POST_WEIGHT: 0.5,              // P·R에서 postPlay·intDef 몫 (나머지 strength)
    DEPTH_SCALE: 20,
    ZONE_K: 0.8,                   // 위치 이동 폭 — 실제 데이터 기준 없는 설계값(사용자 결정 11-11)
    HELP_K: 1.0,                   // 더블팀 쏠림 — 설계값(사용자 결정 11-11)
    /** 맨투맨 포스트업 헬프 시도 총량을 현행과 같게 맞추는 중심값 — 스페이싱 배율과 곱한 뒤 상한 0.95까지 반영해
     *  2020s(NBA Active)·1990s(PBL) 측정, 2010s·2000s 보간. 스페이싱 반응·헬프 상수를 바꾸면 다시 맞출 것 */
    HELP_CENTER_BY_ERA: { '2020s': 0.094, '2010s': 0.100, '2000s': 0.105, '1990s': 0.111 } as Record<PlayTypeEra, number>,
    // ③ 몰린 페이더웨이 — 설계값(사용자 결정 11-11, 측정 G1): 크게 밀리면 포스트업의 약 20%, 성공률 약 36%
    FORCED_FADE_K: 0.6,
    FORCED_FADE_CAP: 0.6,
    FORCED_FADE_CONTEST: 1.0,      // 점퍼 0.85·기술 페이더웨이 0.4보다 어렵게 — 자리를 잡은 수비수 정면
    // ④ 힘만 센 포스트의 공격자 파울 — 강도 설계값(사용자 결정 11-11)
    FOUL_K: 0.5,
    FOUL_STR_BASE: 70,
    FOUL_STR_SCALE: 20,
    FOUL_SKILL_BASE: 75,
    FOUL_SKILL_SCALE: 20,
    /** 본인 포스트업 공격자 파울 총량을 현행과 같게 맞추는 중심값 — 2020s(NBA Active)·1990s(PBL) 포스트업 공격자 분포 측정, 2010s·2000s 보간 */
    FOUL_CENTER_BY_ERA: { '2020s': 0.521, '2010s': 0.614, '2000s': 0.707, '1990s': 0.801 } as Record<PlayTypeEra, number>,
    FOUL_RATE_CAP: 0.08,
    /** 공격자 포지션별 맨투맨 포스트업 수비수 R 10분위 — 2020s(NBA Active)·1990s(PBL) 하네스 실측, 2010s·2000s 보간 */
    REF_BY_ERA: {
        '2020s': {
            PG: [35.5, 41, 44.5, 48.5, 50.5, 51, 54.5, 59, 69, 81],
            SG: [43, 47, 49.5, 50.5, 53, 54, 55.5, 58.5, 66, 73.5],
            SF: [46.5, 49.5, 57, 59.5, 63.5, 66, 68, 72, 76.5, 80],
            PF: [60.5, 65.5, 68, 70.5, 73.5, 75.5, 78.5, 82, 83.5, 87.5],
            C: [64.5, 69.5, 72.5, 74.5, 77.5, 79.5, 82, 83.5, 86.5, 89],
        },
        '2010s': {
            PG: [37.3, 41.8, 46.0, 50.3, 52.7, 54.3, 58.3, 62.3, 69.8, 79.5],
            SG: [44.0, 48.2, 50.7, 52.2, 55.7, 57.5, 59.5, 62.7, 68.7, 75.7],
            SF: [50.0, 54.3, 60.8, 63.0, 66.5, 68.7, 71.5, 75.0, 78.7, 83.0],
            PF: [62.7, 68.3, 71.0, 73.3, 76.2, 77.7, 81.0, 83.7, 85.7, 89.2],
            C: [67.2, 72.2, 75.2, 77.3, 79.7, 82.0, 84.3, 86.0, 88.7, 91.5],
        },
        '2000s': {
            PG: [39.2, 42.7, 47.5, 52.2, 54.8, 57.7, 62.2, 65.7, 70.7, 78.0],
            SG: [45.0, 49.3, 51.8, 53.8, 58.3, 61.0, 63.5, 66.8, 71.3, 77.8],
            SF: [53.5, 59.2, 64.7, 66.5, 69.5, 71.3, 75.0, 78.0, 80.8, 86.0],
            PF: [64.8, 71.2, 74.0, 76.2, 78.8, 79.8, 83.5, 85.3, 87.8, 90.8],
            C: [69.8, 74.8, 77.8, 80.2, 81.8, 84.5, 86.7, 88.5, 90.8, 94.0],
        },
        '1990s': {
            PG: [41, 43.5, 49, 54, 57, 61, 66, 69, 71.5, 76.5],
            SG: [46, 50.5, 53, 55.5, 61, 64.5, 67.5, 71, 74, 80],
            SF: [57, 64, 68.5, 70, 72.5, 74, 78.5, 81, 83, 89],
            PF: [67, 74, 77, 79, 81.5, 82, 86, 87, 90, 92.5],
            C: [72.5, 77.5, 80.5, 83, 84, 87, 89, 91, 93, 96.5],
        },
    } as Record<PlayTypeEra, Record<string, number[]>>,
};

export interface PostBattle {
    power: number;   // P
    resist: number;  // R
    threat: number;  // depth(P − R)
    delta: number;   // threat − 평소 수비수 상대 기대값
}

const depth = (x: number) => Math.tanh(x / POST_MATCHUP.DEPTH_SCALE);

/** 포스트 대결 — 공격자 포지션의 평소 수비수 분포(시대별)와 비교한 delta와 절대 우위 threat */
export function computePostBattle(actor: LivePlayer, defender: LivePlayer, era: PlayTypeEra | undefined | null): PostBattle {
    const cfg = POST_MATCHUP;
    const w = cfg.POST_WEIGHT;
    const power = actor.attr.postPlay * w + actor.attr.strength * (1 - w);
    const resist = defender.attr.intDef * w + defender.attr.strength * (1 - w);
    const table = cfg.REF_BY_ERA[resolvePlayTypeEra(era)];
    const ref = table[actor.position] ?? table.C;
    let typical = 0;
    for (const q of ref) typical += depth(power - q);
    typical /= ref.length;
    const threat = depth(power - resist);
    return { power, resist, threat, delta: threat - typical };
}

/** ① 슛 위치 배율 — selectZone(['Rim','Paint','Mid'], …, zoneMult)에 전달 */
export function postZoneMult(battle: PostBattle): Partial<Record<'Rim' | 'Paint' | 'Mid', number>> {
    const k = POST_MATCHUP.ZONE_K;
    return { Rim: Math.exp(k * battle.delta), Mid: Math.exp(-k * battle.delta) };
}

/** ② 더블팀 — 헬프 시도 확률에 곱하는 배율 (상한은 호출부의 헬프 시도 상한을 한 번만 적용) */
export function postHelpMult(battle: PostBattle, era: PlayTypeEra | undefined | null): number {
    const cfg = POST_MATCHUP;
    return Math.exp(cfg.HELP_K * (battle.threat - cfg.HELP_CENTER_BY_ERA[resolvePlayTypeEra(era)]));
}

/** ③ 몰린 페이더웨이 확률 — 위치가 미드로 정해진 맨투맨 포스트업에서 (finishPostUp의 forcedProb) */
export function forcedFadeawayProb(battle: PostBattle): number {
    const cfg = POST_MATCHUP;
    return Math.min(cfg.FORCED_FADE_CAP, cfg.FORCED_FADE_K * Math.max(0, -battle.threat));
}

/** ④ 힘만 센 포스트 지표 — 힘이 셀수록 늘고 포스트 기술이 낮으면 더 (힘이 기준 이하면 0) */
export function postFoulIndex(actor: LivePlayer): number {
    const cfg = POST_MATCHUP;
    return Math.max(0, actor.attr.strength - cfg.FOUL_STR_BASE) / cfg.FOUL_STR_SCALE
        * (1 + Math.max(0, cfg.FOUL_SKILL_BASE - actor.attr.postPlay) / cfg.FOUL_SKILL_SCALE);
}

/** ④ 본인 포스트업 공격자 파울 확률에 곱하는 배율 (상한 FOUL_RATE_CAP은 호출부에서) */
export function postOffensiveFoulMult(actor: LivePlayer, era: PlayTypeEra | undefined | null): number {
    const cfg = POST_MATCHUP;
    return Math.exp(cfg.FOUL_K * (postFoulIndex(actor) - cfg.FOUL_CENTER_BY_ERA[resolvePlayTypeEra(era)]));
}
