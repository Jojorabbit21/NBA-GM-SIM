
// ─────────────────────────────────────────────────────────────
// Vec2 — pure 2D vector math for the physics core (services/game/engine/physics/).
// Plain object {x, y} — structurally identical to the existing `Point`/`PlayerCourtPosition`
// coordinate shape (utils/courtCoordinates.ts, pbpTypes.ts), so no conversion layer is needed
// when adapting to/from CourtSnapshot.
//
// All functions are pure (return new objects) — no DOM/Node/Deno API, no Math.random, no Date.
// Safe to run in the browser, Deno Edge Functions, and the Bun server unmodified.
// ─────────────────────────────────────────────────────────────

export interface Vec2 {
    x: number;
    y: number;
}

export const ZERO: Vec2 = { x: 0, y: 0 };

export function v(x: number, y: number): Vec2 {
    return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
    return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
}

export function lenSq(a: Vec2): number {
    return a.x * a.x + a.y * a.y;
}

export function len(a: Vec2): number {
    return Math.sqrt(lenSq(a));
}

export function distSq(a: Vec2, b: Vec2): number {
    return lenSq(sub(a, b));
}

export function dist(a: Vec2, b: Vec2): number {
    return Math.sqrt(distSq(a, b));
}

/** 0벡터는 0벡터로 반환 (NaN 방지) */
export function normalize(a: Vec2): Vec2 {
    const l = len(a);
    if (l < 1e-9) return ZERO;
    return { x: a.x / l, y: a.y / l };
}

/** 벡터 길이를 max로 제한 (그 이하면 그대로 반환) */
export function truncate(a: Vec2, max: number): Vec2 {
    const l = len(a);
    if (l <= max || l < 1e-9) return a;
    return scale(a, max / l);
}

/** t=0 → a, t=1 → b. 렌더 보간(고정-dt 시뮬 ↔ 가변 프레임)에 사용 */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export interface Rect {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export function clampToBounds(p: Vec2, b: Rect): Vec2 {
    return {
        x: Math.min(b.maxX, Math.max(b.minX, p.x)),
        y: Math.min(b.maxY, Math.max(b.minY, p.y)),
    };
}
