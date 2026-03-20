# Design Sync — Figma → Code 토큰 동기화

피그마 Variables를 읽어 프로젝트 디자인 토큰에 반영합니다.

## 실행 순서

### Step 1: 피그마 Variable 읽기
`mcp__figma-desktop__get_variable_defs` 도구를 사용해 현재 선택된 노드의 Variables를 읽는다.
읽은 결과를 그룹별로 분류한다:
- `colors/primary/*`, `colors/secondary/*` 등 색상 스케일
- `spacing/*` 간격 토큰
- `radius/*` 반경 토큰
- `_shadow-colors/*` 그림자 토큰
- Team Colors 컬렉션 (팀별 primary/secondary/tertiary/text)

### Step 2: 현재 코드 상태 확인
`tailwind.config.ts`를 읽어 현재 정의된 토큰과 비교한다.
변경이 필요한 항목만 식별한다.

### Step 3: 팀 컬러 토큰 규칙 확인
각 팀의 사이드바 배경 토큰 규칙을 확인한다:
- `tertiary` 있는 팀 (DAL, DEN, MIA, MIN): 배경 = tertiary
- `text(#ffffff)` 있는 팀 (BOS, CHA): 배경 = secondary
- 나머지: 배경 = primary

### Step 4: tailwind.config.ts 업데이트
읽어온 토큰을 `theme.extend.colors`에 반영한다.

```ts
// 색상 스케일 예시
colors: {
  primary: {
    100: 'var(--colors-primary-100)',
    500: 'var(--colors-primary-500)',
    // ...
  }
}
```

### Step 5: CSS 변수 파일 업데이트
`src/styles/tokens.css` (없으면 생성)에 `:root { }` 블록으로 변수 선언.
팀 컬러는 `data-team` attribute 기반으로 선언:

```css
[data-team="DAL"] {
  --team-sidebar-bg: var(--dal-tertiary);
  --team-sidebar-icon: var(--dal-primary);
}
```

### Step 6: 변경 요약 보고
- 추가된 토큰 목록
- 변경된 토큰 목록
- 삭제된 토큰 목록 (코드에만 있고 피그마에는 없는 것)
- 확인이 필요한 예외 항목

## 주의사항
- 피그마가 열려있지 않거나 노드가 선택되지 않으면 실행 불가 → 안내 메시지 출력
- 기존 커스텀 토큰(피그마와 무관하게 코드에서 직접 정의한 것)은 건드리지 않음
- `meta_players` 불변 원칙처럼, 디자인 토큰도 피그마가 Single Source of Truth
