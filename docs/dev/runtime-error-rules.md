# 런타임 에러 방지 규칙

> CLAUDE.md에서 원문 그대로 옮긴 내용(2026-11-23). 상세 설명·예시.

## 🚨 런타임 에러 방지 규칙 (2026-03 경험 기반)

### 규칙 1: 순환 임포트(Circular Import) 금지
새 파일을 만들거나 `import`를 추가할 때, **A→B→A 순환이 생기는지 반드시 확인**할 것.
순환 임포트는 당장 동작하더라도 번들러(Rollup)의 모듈 초기화 순서가 바뀌는 순간 TDZ 에러로 터진다.

**해결 패턴:**
- 두 모듈이 서로 참조할 경우 → 공통 의존성을 **별도 파일**로 분리 (예: `editorState.ts`)
- 타입만 참조할 경우 → `import type { Foo }` 사용 (런타임 바인딩 제거)

**현재 적용된 구조:**
```
editorState.ts  ← constants.ts      (editorLogoUrls 분리)
editorState.ts  ← editorManager.ts  (순환 제거)
pbpTypes.ts: import type { ArchetypeRatings }  (타입 전용)
awardVoting.ts: import type { Team, Player }   (타입 전용)
```

**감지 방법:** `vite.config.ts`의 `rollupOptions.onwarn`에 `CIRCULAR_DEPENDENCY` 에러 처리 추가됨 → 빌드 실패로 즉시 감지 가능.

---

### 규칙 2: 함수 내 `const`/`let` 선언 순서 검증
함수 내부에서 `const X = fn(Y)` 형태로 변수를 사용할 때, **Y가 X보다 먼저 선언**되어 있는지 확인.
`const`/`let`은 호이스팅되지 않으므로 선언 이전에 참조하면 `ReferenceError: Cannot access '_' before initialization` 발생.

```ts
// ❌ 잘못된 예 (seasonConfig.ts에서 발생했던 버그)
const draftLottery = addDays(finalsEndTarget, 3);  // finalsEndTarget 미선언
...
const finalsEndTarget = addDays(finalsStart, 18);  // 너무 늦게 선언

// ✅ 올바른 예
const finalsEndTarget = addDays(finalsStart, 18);  // 먼저 선언
const draftLottery = addDays(finalsEndTarget, 3);  // 이후 사용
```

**특히 주의할 상황:** 날짜/수치 체인 계산처럼 변수 간 의존 관계가 긴 코드를 작성할 때, 논리적 순서와 선언 순서가 일치하는지 확인.

---

### 규칙 3: 모듈 레벨 즉시 실행 코드 주의
파일 최상위(함수 밖)에서 즉시 실행되는 코드는 임포트한 값이 완전히 초기화된 후에만 사용 가능.
```ts
// 위험: 임포트 순서에 따라 SOME_IMPORT가 TDZ일 수 있음
export const X = computeFrom(SOME_IMPORT);

// 안전: 함수로 감싸서 호출 시점을 지연
export function getX() { return computeFrom(SOME_IMPORT); }
```
