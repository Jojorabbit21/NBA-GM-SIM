
import { Team, GameTactics, DepthChart, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';
import { DEFAULT_SLIDERS } from '../config/tacticPresets';

// --- Helpers ---
const clamp = (v: number, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(v)));
const avgVals = (...vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;

/**
 * 아키타입 점수(0~100 범위 기대) → 슬라이더 1~10 으로 정규화
 * low: 해당 스코어의 기대 최솟값, high: 기대 최댓값
 */
const ato = (score: number, low: number, high: number): number =>
    clamp(((score - low) / (high - low)) * 9 + 1);

// --- Archetype Score Functions (nba-strategy.md 기반) ---
const get3pt        = (p: Player) => (p.threeCorner + p.three45 + p.threeTop) / 3;
const handlerScore  = (p: Player) => p.handling * 0.35 + p.plm * 0.25 + p.passVision * 0.20 + p.passAcc * 0.20;
const spacerScore   = (p: Player) => get3pt(p) * 0.60 + p.shotIq * 0.25 + p.offConsist * 0.15;
const driverScore   = (p: Player) => p.speed * 0.20 + p.agility * 0.15 + p.vertical * 0.10 + p.ins * 0.35 + p.midRange * 0.20;
const screenerScore = (p: Player) => p.strength * 0.40 + Math.max(0, p.height - 185) * 3 * 0.30 + Math.max(0, p.weight - 80) * 1.6 * 0.30;
const rollerScore   = (p: Player) => p.ins * 0.40 + p.vertical * 0.30 + p.speed * 0.30;
const postScore     = (p: Player) => p.ins * 0.50 + p.strength * 0.30 + p.hands * 0.20;
const isoScore      = (p: Player) => p.handling * 0.25 + p.midRange * 0.25 + p.speed * 0.25 + p.agility * 0.25;
const rimProtScore  = (p: Player) => p.blk * 0.35 + p.intDef * 0.35 + p.vertical * 0.15 + Math.max(0, p.height - 185) * 3 * 0.15;
const perimLockScore = (p: Player) => p.perDef * 0.50 + p.agility * 0.25 + p.steal * 0.25;

/**
 * AI 팀 및 사용자 자동 설정을 위한 전술 생성기 v4.0
 * 아키타입 기반 순수 슬라이더 계산 (NBA 전술 철학 반영)
 *
 * NBA 전략 원칙:
 * - 림 > 3점 > 중거리 효율 순서 (중거리 = "죽은 구역")
 * - PnR = 현대 NBA 핵심 → baseline 높게
 * - ISO/포스트업 = 비효율 기본, 엘리트만 높게
 * - 풀코트 프레스 = 극도 체력 소모 → 보수적
 */
export const generateAutoTactics = (team: Team): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // ─────────────────────────────────────────────
    // 1. 뎁스차트 자동 구성
    // ─────────────────────────────────────────────
    const depthChart: DepthChart = {
        PG: [null, null, null],
        SG: [null, null, null],
        SF: [null, null, null],
        PF: [null, null, null],
        C:  [null, null, null]
    };
    const usedIds = new Set<string>();
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (let depth = 0; depth <= 1; depth++) {
        for (const pos of positions) {
            const candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
            if (candidate) {
                depthChart[pos][depth] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                const fallback = sortedRoster.find(p => !usedIds.has(p.id));
                if (fallback) { depthChart[pos][depth] = fallback.id; usedIds.add(fallback.id); }
            }
        }
    }
    for (const pos of positions) {
        const c = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id))
               ?? sortedRoster.find(p => !usedIds.has(p.id));
        if (c) { depthChart[pos][2] = c.id; usedIds.add(c.id); }
    }

    // ─────────────────────────────────────────────
    // 2. 로테이션 맵 초기화
    // ─────────────────────────────────────────────
    const rotationMap: Record<string, boolean[]> = {};
    sortedRoster.forEach(p => { rotationMap[p.id] = Array(48).fill(false); });

    for (const pos of positions) {
        const starterId = depthChart[pos][0];
        const benchId = depthChart[pos][1];
        if (starterId && rotationMap[starterId]) {
            const s = rotationMap[starterId];
            for (let i = 0; i < 12; i++) s[i] = true;
            for (let i = 18; i < 36; i++) s[i] = true;
            for (let i = 42; i < 48; i++) s[i] = true;
        }
        if (benchId && rotationMap[benchId]) {
            const b = rotationMap[benchId];
            for (let i = 12; i < 18; i++) b[i] = true;
            for (let i = 36; i < 42; i++) b[i] = true;
        }
    }

    const startersMap = {
        PG: depthChart.PG[0] || '',
        SG: depthChart.SG[0] || '',
        SF: depthChart.SF[0] || '',
        PF: depthChart.PF[0] || '',
        C:  depthChart.C[0]  || ''
    };

    // ─────────────────────────────────────────────
    // 3. 주전 5명 수집
    // ─────────────────────────────────────────────
    const starters = positions.map(pos => {
        const pid = depthChart[pos][0];
        return team.roster.find(p => p.id === pid);
    }).filter((p): p is Player => p !== undefined);

    // 주전 5명 미만이면 디폴트 슬라이더 반환
    if (starters.length < 5) {
        return {
            sliders: { ...DEFAULT_SLIDERS, shot_mid: 3, play_pnr: 6, fullCourtPress: 1 },
            starters: startersMap,
            minutesLimits: {},
            rotationMap,
            depthChart
        };
    }

    // ─────────────────────────────────────────────
    // 4. 아키타입 집계 헬퍼
    // ─────────────────────────────────────────────
    const maxOf = (fn: (p: Player) => number) => Math.max(...starters.map(fn));
    const avgOf = (fn: (p: Player) => number) => avgVals(...starters.map(fn));

    // 포지션별 주전 (가드/빅맨)
    const PG = starters.find(p => p.position.includes('PG')) ?? starters[0];
    const SG = starters.find(p => p.position.includes('SG')) ?? starters[1];
    const bigPlayers = starters.filter(p => p.position.includes('PF') || p.position === 'C');

    const avgStamina = avgOf(p => p.stamina);

    // ─────────────────────────────────────────────
    // 5. 슬라이더 계산 (NBA 전술 철학 기반)
    // ─────────────────────────────────────────────

    // ── Offense: 게임 운영 ──
    let pace = ato(avgVals(PG.speed, SG.speed), 60, 90);
    if (avgStamina < 72) pace = clamp(pace - 2);

    let ballMovement = ato(avgOf(p => avgVals(p.plm, p.passVision)), 62, 88);
    if (avgOf(p => p.handling) < 65) ballMovement = clamp(ballMovement - 2);

    const bigRebAvg = bigPlayers.length > 0 ? avgVals(...bigPlayers.map(p => p.reb)) : 65;
    let offReb = ato(bigRebAvg, 65, 90);
    if (pace >= 8) offReb = clamp(offReb - 2);

    // ── Offense: 공격 루트 비중 ──
    // PnR = 현대 NBA 핵심 → baseline 6 유지
    const pnrRaw = maxOf(handlerScore) * 0.5 + maxOf(screenerScore) * 0.3 + maxOf(rollerScore) * 0.2;
    const play_pnr = clamp(Math.max(6, ato(pnrRaw, 62, 88)));

    // ISO = 엘리트 스코어러에게만 효율적 (고임계값)
    const play_iso = ato(maxOf(isoScore), 72, 92);

    // 포스트업 = 비효율 기본 (매우 고임계값)
    const play_post = ato(maxOf(postScore), 78, 95);

    // C&S = 팀 스패이싱 능력
    const play_cns = ato(avgOf(spacerScore), 55, 82);

    // 드라이브/컷
    const play_drive = ato(maxOf(driverScore), 62, 88);

    // ── Offense: 슈팅 전략 ──
    const shot_3pt = ato(avgOf(get3pt), 62, 85);
    const shot_rim = ato(avgOf(p => p.ins) * 0.6 + maxOf(driverScore) * 0.4, 62, 88);

    // 중거리 = "죽은 구역" → 기본값 낮게, 엘리트 팀만 높게
    const avgMidRange = avgOf(p => p.midRange);
    const shot_mid = avgMidRange >= 88 ? 7 : avgMidRange >= 82 ? 5 : 3;

    // ── Defense: 수비 스타일 ──
    const defIntensity = ato(avgOf(p => p.perDef), 60, 88);

    const helpDef = ato(maxOf(rimProtScore) * 0.6 + avgOf(p => p.helpDefIq) * 0.4, 60, 90);

    let switchFreq = ato(avgOf(perimLockScore) * 0.6 + avgOf(p => p.agility) * 0.4, 62, 88);
    // 림 앵커가 있으면 스위치 제한 (미스매치 노출 위험)
    if (maxOf(rimProtScore) >= 88) switchFreq = clamp(Math.min(switchFreq, 5));

    // ── Defense: 수비 시스템 ──
    // 풀코트 프레스 = 극도 체력 소모 → 보수적 (1~3)
    const guardStaminaSpeed = avgVals(PG.stamina, PG.speed, SG.stamina, SG.speed);
    const fullCourtPress = guardStaminaSpeed >= 88 ? 3 : guardStaminaSpeed >= 82 ? 2 : 1;

    // 존 vs 대인: 내선 vs 외곽 수비력 비교
    const intDefPower = avgOf(p => (p.intDef + p.blk) / 2);
    const perimPower  = avgOf(p => (p.perDef + p.steal) / 2);
    const powerDiff = intDefPower - perimPower;
    const zoneFreq = powerDiff >= 15 ? 9 : powerDiff <= -10 ? 3 : 5;

    return {
        sliders: {
            pace,
            ballMovement,
            offReb,
            play_pnr,
            play_iso,
            play_post,
            play_cns,
            play_drive,
            shot_3pt,
            shot_mid,
            shot_rim,
            defIntensity,
            helpDef,
            switchFreq,
            defReb: DEFAULT_SLIDERS.defReb,           // dead code — default
            zoneFreq,
            fullCourtPress,
            zoneUsage: zoneFreq,                       // zoneFreq와 동기화
        },
        starters: startersMap,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
