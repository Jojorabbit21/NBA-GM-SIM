// josa.ts — 이름 뒤 조사 자동 선택(받침 판정) (2026-11-05, PBP 감사 A-9-5)
//
// 마지막 글자 하나의 문자 코드로만 판정(O(1), 할당 없음). 한글은 (코드 − 0xAC00) % 28로 받침 유무,
// 숫자는 읽는 소리 기준(0·1·3·6·7·8 받침), 그 외(영문 등)는 받침 없는 쪽으로.
// 미러 쌍: services/game/engine/commentary/josa.ts ↔ server/src/shared/engine/commentary/josa.ts

/** 받침 코드(0 = 없음, 8 = ㄹ) — 한글이 아니면 숫자 소리로 근사, 그 외 0 */
function finalConsonant(word: string): number {
    const c = word.charCodeAt(word.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28;
    if (c >= 48 && c <= 57) return [1, 8, 0, 1, 0, 0, 1, 8, 1, 0][c - 48];   // 영·일·이·삼·사·오·육·칠·팔·구 (ㄹ=8, 그 외 받침=1)
    return 0;
}

export const iGa = (w: string) => w + (finalConsonant(w) ? '이' : '가');
export const eulReul = (w: string) => w + (finalConsonant(w) ? '을' : '를');
export const eunNeun = (w: string) => w + (finalConsonant(w) ? '은' : '는');
export const gwaWa = (w: string) => w + (finalConsonant(w) ? '과' : '와');
/** ㄹ 받침은 '로'(서울로), 그 외 받침은 '으로' */
export const euroRo = (w: string) => { const f = finalConsonant(w); return w + (f && f !== 8 ? '으로' : '로'); };
