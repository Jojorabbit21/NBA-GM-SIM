
import type { PlayType } from '../../../../types';
import type { CourtSnapshot } from './pbpTypes';

// ─────────────────────────────────────────────────────────────
// Choreography Reel — docs/plan/physics-choreography-engine.md §4-5/§12-2.
// A Reel is generated once, in full, at the moment a possession's result is known
// (real PBP or synthetic sandbox input) — never recomputed live. The physics/rendering
// layer only ever plays it back via interpolation between consecutive beats.
// ─────────────────────────────────────────────────────────────

export interface ChoreographyBeat {
    snapshot: CourtSnapshot;   // all 10 players' target positions at the start of this beat
    durationSec: number;       // minimum hold time; see holdUntilSettled for an additional gate
    ballEvent: 'dribble' | 'pass' | 'catch' | 'shoot' | 'screen' | 'handoff' | 'bounce';
    // If set, durationSec becomes a floor, not a fixed length — playback keeps holding this beat
    // past durationSec until every listed playerId has actually arrived & stopped (velocity near
    // zero), up to a hard safety cap, so movement-dependent beats (e.g. "get set" before a catch)
    // can't fire early just because the clock ran out.
    holdUntilSettled?: string[];
    // 'bounce' 전용 — 미스 슛이 림에 맞고 튕겨나가는 목적지. 리바운더 위치는 스냅샷의 player
    // position으로 이미 알 수 있지만, 낙구지점은 거기서 랜덤 오프셋을 더한 별도 좌표라 플레이어
    // position에서 역산할 수 없음 — 릴 생성 시점에 한 번 계산해서 여기 담아두고, 재생 쪽은
    // 그대로 읽기만 한다(릴은 사전 계산, 재생은 순수 보간이라는 기존 원칙과 동일).
    ballLandingPos?: { x: number; y: number };
}

export type ChoreographyReel = ChoreographyBeat[];

// ─────────────────────────────────────────────────────────────
// SandboxStep — §12-2. Admin-authored "director's cut" possession spec. Bypasses real
// PBP RNG entirely; buildSyntheticPossessionResult() turns this into a PossessionResult
// shape that generateChoreography() consumes exactly as if it came from simulatePossession().
// ─────────────────────────────────────────────────────────────

export type SubZoneKey =
    | 'zone_rim' | 'zone_paint'
    | 'zone_mid_l' | 'zone_mid_c' | 'zone_mid_r'
    | 'zone_c3_l' | 'zone_c3_r'
    | 'zone_atb3_l' | 'zone_atb3_c' | 'zone_atb3_r';

export interface SandboxStep {
    id: string;
    entry?: 'case1' | 'case2' | 'case3a' | 'case3b' | 'defReb' | 'offReb'; // §6 — case1만 구현(Milestone 2), 나머지는 타입만 존재
    inbounderId?: string; // §6-5 인바운더 수동 지정(admin override). 비어있으면 spacer 풀에서 자동 배정.
    playType: PlayType;
    subZone: SubZoneKey;
    outcome: 'score' | 'miss' | 'turnover' | 'foul';
    isAssisted?: boolean;
    actorId: string;
    assisterId?: string;
    screenerId?: string;
    rebounderId?: string;
    durationSec?: number; // undefined = derive from calculatePossessionTime()

    // Defense toggle ON only (§10) — not yet consumed by generator (Milestone 2+)
    isZone?: boolean;
    pnrCoverage?: 'drop' | 'hedge' | 'blitz';
    isSwitch?: boolean;
    isBotchedSwitch?: boolean;
}

/** subZone → broad zone, per §12-2. */
export function subZoneToZone(subZone: SubZoneKey): 'Rim' | 'Paint' | 'Mid' | '3PT' {
    switch (subZone) {
        case 'zone_rim': return 'Rim';
        case 'zone_paint': return 'Paint';
        case 'zone_mid_l': case 'zone_mid_c': case 'zone_mid_r': return 'Mid';
        default: return '3PT'; // zone_c3_l/_r, zone_atb3_l/_c/_r
    }
}
