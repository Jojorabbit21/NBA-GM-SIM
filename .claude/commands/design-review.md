# Design System Review

$ARGUMENTS 파일의 디자인 시스템 준수 여부를 검토합니다.

## 지시사항

1. 먼저 `docs/design-system.md`를 읽어 디자인 규칙을 확인합니다
2. 대상 파일을 읽고 아래 체크리스트에 따라 검토합니다
3. 자동 수정하지 않고 리포트만 제공합니다

## Critical (반드시 수정)

- **Raw `<button>`**: `<button>`에 `px-N py-N` 패딩이 있으면 `<Button>` 공용 컴포넌트 사용 권장
  - 예외: icon-only 버튼 (p-N + rounded-full만 있는 경우)
  - 예외: tab 네비게이션 버튼 (border-b-2 패턴)
  - Button variants: primary | secondary | danger | ghost | outline | brand
  - Button sizes: xs | sm | md | lg | xl
- **밝은 배경**: `bg-white`, `bg-gray-*` → `bg-surface` (slate-950) 또는 `bg-surface-card` (slate-900)
  - 예외: `bg-white/N` 오파시티 오버레이는 허용
- **공용 컴포넌트 미사용**: 수동으로 카드를 만들었으면 `<Card>`, 뱃지를 만들었으면 `<Badge>` 사용 권장

## Warning (수정 권장)

- **비표준 색상**: `purple`, `violet`, `pink`, `lime`, `sky` → 허용 팔레트: indigo/emerald/red/amber/blue
- **색상 별칭 오류**: `green-*` → `emerald-*`, `yellow-*` → `amber-*`
- **비표준 border-radius**: 카드에 `rounded-lg`/`rounded-xl` → `rounded-card` (rounded-3xl)
- **인터랙티브 요소 호버 누락**: 버튼/링크에 `hover:` 또는 `transition` 없음
- **className에 하드코딩 hex**: `#XXXXXX` → Tailwind 클래스 또는 시맨틱 토큰

## Suggestion (개선 제안)

- **시맨틱 토큰 활용**: `bg-slate-950` → `bg-surface`, `text-indigo-500` → `text-accent` 등
- **간격 일관성**: 같은 맥락에서 다른 padding/gap 값 사용
- **헤더 타이포**: 섹션 헤더에 `font-sport` (oswald) + `font-black uppercase tracking-widest` 누락

## 출력 형식

```
## Design Review: [파일명]

### Critical (N건)
1. [라인번호] 설명 + 수정 전/후 코드

### Warning (N건)
1. [라인번호] 설명 + 권장 대안

### Suggestion (N건)
1. [라인번호] 설명

### 요약
- Critical: N건 / Warning: N건 / Suggestion: N건
```
