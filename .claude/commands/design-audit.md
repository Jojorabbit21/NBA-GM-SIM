# Design System Audit

전체 코드베이스의 디자인 시스템 준수 현황을 감사합니다.

## 지시사항

1. `docs/design-system.md`를 읽어 디자인 규칙을 확인합니다
2. `components/` 및 `views/` 내 모든 `.tsx` 파일을 스캔합니다 (`components/common/`은 제외)
3. 아래 검사 항목별로 위반사항을 집계합니다
4. 결과를 요약 테이블 + 상세 분석으로 리포트합니다

## 검사 항목

### 1. Raw `<button>` 사용
- `<button` 요소에 `px-N py-N` 패딩이 있는 패턴 검색
- `components/common/Button.tsx` 자체는 제외
- 파일별 개수 집계

### 2. 비표준 색상 (Off-Palette)
- `(bg|text|border)-(purple|violet|pink|lime|sky)-[0-9]` 패턴
- `(bg|text|border)-green-[0-9]` (emerald로 교체 필요)
- `(bg|text|border)-yellow-[0-9]` 그라데이션 외 단독 사용 (amber로 교체 필요)
- `bg-(white|gray-)` (bg-white/N 오파시티 제외)

### 3. 공용 컴포넌트 미활용
- `<button`을 사용하면서 Button을 import하지 않는 파일
- `bg-slate-900 border border-slate-800 rounded-3xl` 패턴이 있으면서 Card를 import하지 않는 파일

### 4. 비표준 Border Radius
- `rounded-sm`, `rounded-md`, `rounded-none` 사용 (디자인 시스템: xl/2xl/3xl/full)

## 출력 형식

### 요약 테이블

| 파일 | Raw Buttons | Off-Colors | Missing Imports | Radius | 우선순위 |
|------|-------------|------------|-----------------|--------|---------|

### 상위 10개 파일 상세 분석
각 파일별로:
- 구체적 라인번호와 위반 내용
- 권장 수정 방향

### 종합 통계
- 카테고리별 총 위반 건수
- 마이그레이션 우선순위 순서 (영향도 높은 파일 우선)
- 파일별 예상 작업량 (간단 / 보통 / 대규모 리팩토링)
