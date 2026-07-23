
import type { SubZoneKey } from '../choreographyTypes';

// ─────────────────────────────────────────────────────────────
// Virtual shooting points for CatchShoot's spacer pool (§14 후속: 스페이서 슬롯 고정 3좌표 문제).
// 73개 좌표는 사용자가 물리 랩의 좌표 피커(CourtPointPicker.tsx)로 코트를 직접 클릭해서 확정한
// 값 — utils/courtZones.ts의 실제 10존 경계 안에서 골랐음. 왼쪽 골대 기준(attacking-left
// convention, choreographyGenerator.ts와 동일) — 오른쪽은 buildSnapshot()의 기존 mirrorX가
// 알아서 처리하므로 여기 별도 저장 불필요.
//
// SubZoneKey의 L/R 네이밍은 SUBZONE_COORDS와 동일한 컨벤션을 따름: y가 작을수록 `_l`, 클수록
// `_r` (예: zone_mid_l y≈12 < zone_mid_r y≈38). 사용자가 붙인 라벨(cor_top/cor_bot,
// mid_top/mid_bot/mid_cen, 45_top/45_bot, ra, paint, top)도 이 규칙과 일치하게 클릭됨 —
// cor_top(y=1.2, 작음)→zone_c3_l, cor_bot(y=48.2, 큼)→zone_c3_r 등.
//
// 존/포인트 선택 알고리즘(chooseSpacerTargets)은 의도적으로 Math.random()을 쓴다 — 다른 안무
// 함수(generateCatchShoot 본체, generateCase1Entry 등)는 전부 결정론적인데 이 함수만 예외.
// 이유: 사용자가 "슬롯이 고정이면 패턴에 금방 익숙해진다"고 명시적으로 문제 삼았던 부분이라,
// 매번 다른 배치가 나오는 게 버그가 아니라 목표.
// ─────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

export const VIRTUAL_SHOT_POINTS: Record<SubZoneKey, Pos[]> = {
    zone_c3_l: [
        { x: 3.5, y: 1.2 }, { x: 8, y: 1.2 }, { x: 12.5, y: 1.2 },
    ],
    zone_c3_r: [
        { x: 3.5, y: 48.2 }, { x: 8, y: 48.2 }, { x: 12.5, y: 48.2 },
    ],
    zone_mid_r: [
        { x: 18.6, y: 40.2 }, { x: 14.6, y: 42.8 }, { x: 10.2, y: 42.8 }, { x: 4.9, y: 42.8 },
        { x: 4.9, y: 36.7 }, { x: 10.2, y: 36.7 }, { x: 15.1, y: 37.5 },
    ],
    zone_mid_l: [
        { x: 15.1, y: 13.2 }, { x: 15.1, y: 6.6 }, { x: 18.1, y: 9.6 }, { x: 9.8, y: 6.1 },
        { x: 4.4, y: 6.1 }, { x: 4.9, y: 12.3 }, { x: 10.2, y: 11.8 },
    ],
    zone_mid_c: [
        { x: 21.7, y: 14 }, { x: 23.5, y: 18.1 }, { x: 25.7, y: 24.7 }, { x: 23.5, y: 30.9 },
        { x: 21.7, y: 34.5 }, { x: 21.3, y: 21.1 }, { x: 21.3, y: 27.4 },
    ],
    zone_paint: [
        { x: 12, y: 19.4 }, { x: 16.9, y: 19.4 }, { x: 12, y: 24.7 },
        { x: 16.9, y: 24.7 }, { x: 12, y: 30 }, { x: 16.9, y: 30 },
    ],
    zone_rim: [
        { x: 8, y: 30.9 }, { x: 8, y: 27.8 }, { x: 8, y: 24.7 }, { x: 8, y: 22 }, { x: 8, y: 18.9 },
        { x: 4.9, y: 24.7 }, { x: 4.9, y: 27.8 }, { x: 4.9, y: 30.9 }, { x: 4.9, y: 21.6 }, { x: 4.9, y: 18.9 },
    ],
    zone_atb3_r: [
        { x: 16.4, y: 47.7 }, { x: 19.5, y: 46 }, { x: 22.2, y: 43.8 }, { x: 24.8, y: 41.1 },
        { x: 27, y: 38.9 }, { x: 19.1, y: 48.2 }, { x: 22.2, y: 46 }, { x: 24.8, y: 43.8 }, { x: 27.5, y: 41.6 },
    ],
    zone_atb3_l: [
        { x: 16.4, y: 2.3 }, { x: 19.5, y: 4 }, { x: 22.2, y: 6.2 }, { x: 24.8, y: 8.9 },
        { x: 27, y: 11.1 }, { x: 19.1, y: 1.8 }, { x: 22.2, y: 4 }, { x: 24.8, y: 6.2 }, { x: 27.5, y: 8.4 },
    ],
    zone_atb3_c: [
        { x: 28.4, y: 36.7 }, { x: 30.1, y: 32.3 }, { x: 31.1, y: 27.8 }, { x: 31.1, y: 23 },
        { x: 30.1, y: 18.5 }, { x: 28.4, y: 14 }, { x: 31.1, y: 14.9 }, { x: 33.3, y: 19.8 },
        { x: 31.1, y: 25.2 }, { x: 34.1, y: 25.2 }, { x: 33.3, y: 30 }, { x: 31.5, y: 34.9 },
    ],
};

const OUTSIDE_ZONES: SubZoneKey[] = ['zone_c3_l', 'zone_c3_r', 'zone_atb3_l', 'zone_atb3_c', 'zone_atb3_r'];
const INSIDE_ZONES: SubZoneKey[] = ['zone_rim', 'zone_paint', 'zone_mid_l', 'zone_mid_c', 'zone_mid_r'];

function dist(a: Pos, b: Pos): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** occupied까지의 최소거리가 가장 큰 후보를 고른다(그리디 최원점 샘플링) — occupied가 비어있으면
 *  무작위. 매 호출마다 같은 candidates/occupied라도 동점 후보들 사이에서는 결과가 갈릴 수 있음
 *  (의도된 비결정성, 파일 상단 설명 참고). */
export function pickFarthestPoint(candidates: Pos[], occupied: Pos[]): Pos {
    if (candidates.length === 0) throw new Error('[virtualShotPoints] pickFarthestPoint: empty candidates');
    if (occupied.length === 0) return candidates[Math.floor(Math.random() * candidates.length)];

    let best: Pos[] = [];
    let bestMinDist = -Infinity;
    for (const c of candidates) {
        const minDist = Math.min(...occupied.map(o => dist(c, o)));
        if (minDist > bestMinDist) {
            bestMinDist = minDist;
            best = [c];
        } else if (minDist === bestMinDist) {
            best.push(c);
        }
    }
    return best[Math.floor(Math.random() * best.length)];
}

/** insideOut(2~9) → 아웃사이드 존을 고를 확률. playTypeProfiles.ts의 기존 컨벤션
 *  `(slider - 5) / 5`(중앙=5 기준 정규화)를 그대로 재사용 — 5일 때 0(밸런스), 9일 때 +0.8,
 *  2일 때 -0.6. 0.5 기준으로 절반씩 흔들어서 0.1~0.9 사이로 클램프(항상 100%/0%가 되지 않게). */
function outsideProbability(insideOut: number): number {
    const factor = (insideOut - 5) / 5;
    return Math.min(0.9, Math.max(0.1, 0.5 + factor * 0.5));
}

/**
 * 스페이서 count명(기본 3)이 향할 목표 좌표를 정한다 — "누가" 갈지는 모른 채 "어디"인지만 결정.
 * 1) 매 슬롯마다 insideOut 기반 확률로 인사이드/아웃사이드 존 풀에서 하나씩 고르되, 슈터의
 *    subZone과 이미 고른 존은 제외(풀이 소진되면 예외 없이 전체 풀로 폴백).
 * 2) 그 존의 후보 좌표들 중 이미 배치된 지점(occupiedSeed + 앞서 고른 스페이서 좌표)까지의
 *    최소거리가 최대인 곳을 선택.
 */
export function chooseSpacerTargets(insideOut: number, excludeZone: SubZoneKey | undefined, occupiedSeed: Pos[], count: number = 3): Pos[] {
    const outsideProb = outsideProbability(insideOut);
    const usedZones = new Set<SubZoneKey>(excludeZone ? [excludeZone] : []);
    const occupied = [...occupiedSeed];
    const targets: Pos[] = [];

    for (let i = 0; i < count; i++) {
        const pool = Math.random() < outsideProb ? OUTSIDE_ZONES : INSIDE_ZONES;
        const available = pool.filter(z => !usedZones.has(z));
        // Pool exhausted (all its zones already used this call) — fall back to reusing the pool
        // rather than throwing, since a repeated zone still beats an empty target.
        const candidates = available.length > 0 ? available : pool;
        const zone = candidates[Math.floor(Math.random() * candidates.length)];
        usedZones.add(zone);

        const point = pickFarthestPoint(VIRTUAL_SHOT_POINTS[zone], occupied);
        occupied.push(point);
        targets.push(point);
    }

    return targets;
}

// 2026-07 — 공격 리바운드 크래시(choreographyGenerator.ts)와 아래 "리바운더 고정 배치" 둘 다
// 골밑/페인트 지점 풀이 필요해서 여기서 한 번만 정의하고 공유한다 — 각자 따로 만들면 서로 다른
// 풀에서 뽑아 두 값이 우연히도 서로 멀어질 수 있다.
export const REBOUND_CRASH_POINTS: Pos[] = [...VIRTUAL_SHOT_POINTS.zone_rim, ...VIRTUAL_SHOT_POINTS.zone_paint];

/**
 * chooseSpacerTargets와 같지만, 3개 중 1개(배열의 0번 인덱스)는 insideOut 확률 롤을 건너뛰고
 * 무조건 골밑/페인트 근처(REBOUND_CRASH_POINTS)로 고정한다 — 이 포제션이 이미 "공격 리바운드
 * 성공"으로 끝난다는 걸 알고 있을 때(합성/실제 PossessionResult에 rebounder가 미리 채워져
 * 있음), 그 선수의 엔트리/스팟업 위치 자체를 골밑 근처로 미리 잡아두기 위함 — 안 그러면 코너
 * 같은 먼 자리에 서 있다가, 미스 이후 크래시 beat에서 비현실적으로 긴 거리를 뛰어야 한다.
 * 나머지 2개는 기존과 동일하게 insideOut 기반으로 고른다. 반환값 [0]=고정 포인트, [1..]=나머지.
 */
export function chooseSpacerTargetsWithPinnedRebounder(insideOut: number, excludeZone: SubZoneKey | undefined, occupiedSeed: Pos[]): Pos[] {
    const pinned = pickFarthestPoint(REBOUND_CRASH_POINTS, occupiedSeed);
    const rest = chooseSpacerTargets(insideOut, excludeZone, [...occupiedSeed, pinned], 2);
    return [pinned, ...rest];
}
