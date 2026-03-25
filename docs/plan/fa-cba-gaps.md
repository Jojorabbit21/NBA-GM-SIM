# FA / 계약 협상 시스템 — CBA 갭 분석 및 개선 과제

> 작성일: 2026-03-25
> 현재 구현과 실제 NBA CBA 비교 분석 결과

---

## 즉시 수정 가능한 버그

### [BUG-1] CPU Bird Rights 미사용
- **현재 구현**: `simulateCPUSigning`에서 `getAvailableSigningSlots` 호출 시 `playerPrevTeamId = undefined`로 넘겨서, CPU 팀이 자팀 FA에 대한 Bird Rights를 전혀 사용하지 못함
- **실제 NBA**: 자팀 FA를 Bird Rights로 재계약하는 것이 가장 흔한 오프시즌 시나리오
- **문제점**: 강팀 CPU의 핵심 선수가 이유 없이 FA로 이탈. 리그 밸런스 붕괴
- 난이도: 쉬움 | 중요도: **높음**
- **수정**: `simulateCPUSigning`에서 각 FA 선수의 이전 팀 ID(`entry.prevTeamId`)를 `getAvailableSigningSlots` 4번째 인자로 전달

---

### [BUG-2] 계약 연수 검증 불일치 (UI ↔ 서버)
- **현재 구현**: `SLOT_MAX_YEARS`(UI)와 `processUserOffer`(서버 검증)의 최대 연수가 다름
  - `non_tax_mle`: UI = 4년, 서버 = 5년 (서버가 잘못됨)
  - `tax_mle`: UI = 3년, 서버 = 2년 (UI가 잘못됨)
  - `bird_early`: UI = 5년, 서버 = 5년 (둘 다 잘못됨 — CBA 기준 4년)
- **실제 NBA (2023 CBA)**: Non-Tax MLE 4년, Tax MLE 2년, Early Bird 4년
- 난이도: 쉬움 | 중요도: 보통
- **수정**:
  - `SLOT_MAX_YEARS.tax_mle = 2`, `SLOT_MAX_YEARS.bird_early = 4`
  - `processUserOffer`의 `maxYears` 로직에서 `non_tax_mle → 4`, `bird_early → 4` 분기 추가

---

## 중기 과제

### [MED-1] FA 협상에서 연수(Years)가 수락 평가에 미반영
- **현재 구현**: `evaluateFAOffer`가 연봉 금액만 평가. 선수가 단기/장기 선호를 갖고 카운터하지 않음
- **실제 NBA**: 선수는 연수에 대한 선호(단기: 재도전 의도 / 장기: 보장 선호)를 갖고 협상
- **문제점**: FA 협상이 금액 단일 변수로 단순화되어 전략 깊이 부족
- 난이도: 보통 | 중요도: **높음**
- **구현 방향**:
  - `evaluateFAOffer`에 `yearsScore` 가중치 추가 (익스텐션 엔진 참고)
  - 선수 성향(`financialAmbition`, `loyalty`)에 따라 선호 연수 범위 결정
  - 연수 불일치 시 카운터 오퍼에 연수 조정 포함

---

### [MED-2] 플레이어/팀 옵션 행사 이벤트 없음
- **현재 구현**: 옵션 계약 체결 가능하나, 오프시즌에 행사/포기를 결정하는 이벤트 없음. 옵션이 있는 선수가 무조건 계약 만료로 처리됨
- **실제 NBA**: 팀/선수 옵션 행사(exercise) 또는 포기(decline) → 포기 시 해당 선수 FA 진입
- **문제점**: 옵션 계약의 전략적 가치가 없음. 팀 옵션을 포기해서 캡 공간을 확보하는 전략 불가
- 난이도: 보통 | 중요도: **높음**
- **구현 방향**:
  - `offseasonEventHandler.ts`의 `processOffseason`에 옵션 처리 단계 추가
  - CPU 팀: OVR/나이/급여 기반으로 옵션 행사 여부 자동 결정
  - 유저 팀: 오프시즌 UI에서 옵션 행사/포기 결정 화면 제공
  - 포기된 옵션 선수 → FA 시장 진입

---

### [MED-3] BAE(Bi-Annual Exception) 미구현
- **현재 구현**: `SigningType`에 BAE 없음
- **실제 NBA**: 비납세자 팀이 2년에 한 번 사용 가능한 ~$4.5M(2025-26) 예외 조항. Non-Tax MLE와 동시 사용 가능. 최대 2년 계약
- **문제점**: 중위권 팀의 로스터 구성 다양성 축소
- 난이도: 쉬움 | 중요도: 보통
- **구현 방향**:
  - `SigningType`에 `'bae'` 추가
  - `LEAGUE_FINANCIALS`에 `BAE_VALUE` 상수 추가
  - `getAvailableSigningSlots`에 BAE 조건 분기 (비납세자 팀 + 2년 주기)
  - `saves`에 `usedBAE: Record<string, number>` (팀별 마지막 사용 시즌) 저장

---

### [MED-4] Trade Kicker 트레이드 매칭 미반영
- **현재 구현**: `contract.tradeKicker`가 저장되나, 트레이드 실행 시 샐러리 매칭 계산에 반영되지 않음
- **실제 NBA**: Trade Kicker는 트레이드 성사 시 선수 급여에 가산 → 수신 팀 샐러리 계산에 영향
- **문제점**: 키커가 있는 선수 트레이드 시 캡 계산 오류 가능
- 난이도: 보통 | 중요도: 보통
- **구현 방향**: `tradeExecutor.ts`의 샐러리 매칭 계산 시 `tradeKicker` 비율 가산

---

## 장기 과제 (멀티플레이어/로드맵 수준)

### [LONG-1] RFA (Restricted Free Agency) + Qualifying Offer
- **현재 구현**: FA 등록 시 UFA/RFA 구분 없이 일괄 처리
- **실제 NBA**: 루키 계약 4년차 만료 → QO 텐더 시 원소속팀이 3일 내 오퍼시트 매칭 권한 보유
- **문제점**: 루키 계약 만료 스타를 원소속팀이 지켜낼 수 없음. 팀 빌딩 핵심 메커니즘 누락
- 난이도: 어려움 | 중요도: **높음**
- **구현 방향**:
  - `FAMarketEntry`에 `isRestricted`, `qualifyingOffer` 필드 추가
  - FA 시장에 오퍼시트 제출/매칭 플로우 추가
  - QO 금액 자동 계산 공식 구현

---

### [LONG-2] Sign-and-Trade (S&T)
- **현재 구현**: FA 시스템과 트레이드 시스템이 분리. S&T 개념 없음
- **실제 NBA**: FA가 새 팀과 장기/맥스 계약 후 원소속팀이 트레이드 형태로 전달. 원소속팀은 트레이드 리소스 수령
- **문제점**: 스타급 FA가 새 팀에서 맥스를 받으며 이적하는 핵심 메커니즘 없음
- 난이도: 어려움 | 중요도: **높음**
- **구현 방향**: FA 파이프라인과 트레이드 엔진 연동. `negotiationType: 'sign_and_trade'` 추가

---

### [LONG-3] 캡 홀드 (Cap Hold)
- **현재 구현**: `calcTeamPayroll`에 캡 홀드 미포함
- **실제 NBA**: 자팀 FA 협상권 유지 시 해당 선수의 예상 금액이 캡에 잡힘. Renounce로 해제 가능
- **문제점**: 자팀 FA 확보 + 타FA 영입의 이중 이득 가능. 캡 전략 핵심 트레이드오프 없음
- 난이도: 어려움 | 중요도: 보통

---

### [LONG-4] Two-Way Contract
- **현재 구현**: `ContractType`에 Two-Way 없음
- **실제 NBA**: ~$580K, 최대 50경기 출전, G리그-NBA 이동
- **문제점**: 젊은 선수 육성 + 저비용 백업 확보 수단 부재
- 난이도: 보통 | 중요도: 낮음

---

## 우선순위 요약

| 우선순위 | 항목 | 난이도 | 중요도 |
|----------|------|--------|--------|
| 1 | BUG-1: CPU Bird Rights 미사용 | 쉬움 | 높음 |
| 2 | BUG-2: 계약 연수 검증 불일치 | 쉬움 | 보통 |
| 3 | MED-1: FA 협상 연수 평가 미반영 | 보통 | 높음 |
| 4 | MED-2: 옵션 행사/포기 이벤트 | 보통 | 높음 |
| 5 | MED-3: BAE 추가 | 쉬움 | 보통 |
| 6 | MED-4: Trade Kicker 매칭 반영 | 보통 | 보통 |
| 7 | LONG-1: RFA / QO | 어려움 | 높음 |
| 8 | LONG-2: Sign-and-Trade | 어려움 | 높음 |
| 9 | LONG-3: 캡 홀드 | 어려움 | 보통 |
| 10 | LONG-4: Two-Way Contract | 보통 | 낮음 |
