// jsonEqual.ts — JSON 의미 기준 동등 비교(객체 키 순서 무시, undefined 속성 = 없는 속성). [2026-10-18]
// Postgres jsonb는 저장 시 키를 재정렬하므로, DB에서 읽은 값과 편집기 값을 JSON.stringify로 비교하면
// 내용이 같아도 다르다고 나온다(멀티 전술 "미저장 변경" 오탐 원인). 배열 순서는 의미가 있으므로 그대로 비교.

function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(x => (x === undefined ? null : canonical(x)));
    if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            const x = (v as Record<string, unknown>)[k];
            if (x !== undefined) out[k] = canonical(x);
        }
        return out;
    }
    return v;
}

export function jsonEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
}
