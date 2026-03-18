# NBA 샐러리캡 시스템 — 시뮬레이션 적용 계획

> 리서치 원문: `docs/domain/nba-salary-cap-2025-26.md`
> **선결 과제**: 구단 재정 시스템 (별도 구현 후 연동)
> **상태**: 계획 완료, 구현 대기 (재정 시스템 완성 후)

---

## 전제 조건

- **멀티시즌 고도화 예정** → 다시즌 의존 기능도 적용 대상
- **서비스타임 추적 가능** → meta_players에 `draft_year` 존재 (코드 매핑 필요)
  - 서비스타임 = `현재시즌연도 - draft_year`
- **수상 이력 추적 가능** → `Player.awards[]`에 MVP, DPOY, All-NBA 등 season 태깅
  - 제한: 2025-26 시즌부터만 추적
- **드래프트 픽 구현 예정**
- Room Exception / Bi-Annual은 복잡성 대비 가치 낮아 제외

---

## 적용 가능성 매트릭스

| # | 규정 | 판정 | 구현 시점 | 필요 인프라 |
|---|------|------|----------|-----------|
| 1 | 캡 5구간 임계값 | ✅ | 즉시 | 상수 업데이트 |
| 2 | 경력별 맥스 (25/30/35%) | ✅ | 즉시 | draft_year 매핑 |
| 2 | 슈퍼맥스 | ⚠️ | 2시즌차~ | prior_accolades 또는 수상 누적 |
| 2 | 데릭 로즈 룰 | ⚠️ | 2시즌차~ | 루키 스케일 + 수상 |
| 3 | 버드 라이츠 (3단계) | ⚠️ | 점진적 | teamTenure 추적 |
| 4 | MLE (Non-Tax + Tax) | ✅ | 즉시 | 시즌당 사용 여부 boolean |
| 4 | Vet Minimum | ✅ | 즉시 | 서비스타임 |
| 4 | Room/Bi-Annual | ❌ | 제외 | 복잡성 대비 가치 낮음 |
| 5 | 럭셔리 택스 (일반) | ✅ | 즉시 | 수학 공식 |
| 5 | 럭셔리 택스 (리피터) | ⚠️ | 멀티시즌 | 시즌별 택스 이력 |
| 6 | 트레이드 매칭 4단계 | ✅ | 즉시 | salaryRules.ts 확장 |
| 6 | FA 영입 제한 (MLE 연동) | ✅ | 즉시 | 에이프런 tier 판정 |
| 6 | 2차 에이프런 합산 불가 | ✅ | 즉시 | 트레이드 조건 |
| 6 | 하드캡 트리거 | ✅ | 즉시 | MLE 사용 시 1차 에이프런 하드캡 |
| 7 | 루키 스케일 | ⚠️ | 드래프트 후 | 드래프트 엔진 |
| 8 | 데드 머니 | ✅ **구현 완료** | — | `DeadMoneyEntry`, `Team.deadMoney[]`, `calcTeamPayroll` 합산, `team_finances` 저장 |
| 8 | 바이아웃 | ✅ **구현 완료** | — | OVR 기반 최소 수락액, 슬라이더 협상 UI, FA_RELEASE 메시지 |
| 8 | 스트레치 프로비전 | ✅ **구현 완료** | — | `2n-1`년 분산, 단시즌 캡 부담 감소, 다시즌 추적은 멀티시즌 때 |
| 9 | NTC | ✅ | 즉시 | 서비스타임 + teamTenure |
| 9 | 플로어 | ✅ | 즉시 | 단순 계산 |
| 9 | 트레이드 제한 기간 | ✅ | 즉시 | signDate 저장 |
| 9 | 캡 홀드 | ⚠️ | 멀티시즌 FA | FA 시장 시스템 |

---

## 파일 구조

```
types/
  player.ts              ← Player에 draftYear, teamTenure, contractType 추가
  team.ts                ← Team에 deadMoney[], mleUsed, hardCapped 추가
  trade.ts               ← Transaction details 타입 구체화 (SignDetails, ReleaseDetails)
  salary.ts              ← [NEW] ContractType, ApronTier, DeadMoney, BirdRightsLevel 등

services/
  salaryCapEngine/       ← [NEW]
    capCalculator.ts     ← 총급여, 캡 스페이스, 에이프런 tier 판정
    contractRules.ts     ← 맥스 계약, Vet Min, 서비스타임, NTC
    signingRules.ts      ← FA 영입 가능 여부 (MLE/Vet Min/캡 스페이스)
    releaseRules.ts      ← 방출/바이아웃 데드 머니 계산
    luxuryTax.ts         ← 6구간 누진 세율 계산
    index.ts

  tradeEngine/
    salaryRules.ts       ← 4단계 매칭 룰로 확장
    tradeConfig.ts       ← SALARY 상수 제거 → LEAGUE_FINANCIALS 통합

  stateReplayer.ts       ← applySign(), applyRelease() 추가
  snapshotBuilder.ts     ← Sign/Release 리플레이 추가
  dataMapper.ts          ← draftYear 매핑

utils/
  constants.ts           ← LEAGUE_FINANCIALS 2025-26 업데이트 + MLE/VET_MIN 상수
  hiddenTendencies.ts    ← financialAmbition 텐던시

hooks/
  useSalaryCap.ts        ← [NEW] 캡 상태 훅

components/
  roster/SalaryCapDashboard.tsx  ← 확장 (택스, MLE, 데드 머니)
  transactions/FASigningPanel.tsx     ← [NEW]
  transactions/PlayerReleasePanel.tsx ← [NEW]
```

---

## DB 스키마 변경

### saves 테이블 — salary_cap_state 컬럼 추가

```typescript
interface SalaryCapState {
  teamCapStates: Record<string, {
    mleUsed: boolean;
    hardCapped: boolean;
    deadMoney: { playerId: string; playerName: string; amount: number; season: string }[];
  }>;
}
```

### user_transactions — details 타입 구체화

```typescript
// Sign
interface SignDetails {
  playerId: string; playerName: string;
  salary: number; contractYears: number;
  signingType: 'cap_space' | 'non_tax_mle' | 'tax_mle' | 'vet_min';
}

// Release
interface ReleaseDetails {
  playerId: string; playerName: string;
  salary: number; contractYears: number;
  releaseType: 'waive' | 'buyout';
  deadMoneyAmount: number; buyoutDiscount?: number;
}
```

---

## 상수 (2025-26 실제 금액)

```typescript
LEAGUE_FINANCIALS = {
  SALARY_FLOOR: 139.182,
  SALARY_CAP: 154.647,
  TAX_LEVEL: 187.895,
  FIRST_APRON: 195.945,
  SECOND_APRON: 207.824,
};

MLE_VALUES = { NON_TAXPAYER: 14.104, TAXPAYER: 5.685 };

VET_MINIMUMS = [1.273, 2.048, 2.296, 2.379, 2.461, 2.668, 2.874, 3.081, 3.287, 3.304, 3.634];
VET_MIN_CAP_HIT = 2.296;
```

---

## 구현 순서

### Phase 1 — 즉시 구현 (재정 시스템 완성 후)
1. ✅ 캡 상수 업데이트 + 통합
2. draftYear 매핑 + 서비스타임 유틸
3. types/salary.ts + services/salaryCapEngine/
4. 맥스 계약 + Vet Min + MLE
5. 트레이드 매칭 4단계
6. ✅ FA 영입/방출 트랜잭션 (메시지 + Transactions 기록)
7. ✅ 데드 머니 + 바이아웃 + 스트레치 웨이브 (3종 방출 방식, OVR 기반 최소 수락액, `2n-1`년 분산, CapStatus UI)
8. 럭셔리 택스 UI
9. NTC / 트레이드 제한 / 플로어
10. ✅ financialAmbition 텐던시
11. 스냅샷 v5

### Phase 2 — 멀티시즌
12. 버드 라이츠, 슈퍼맥스, 로즈룰, 리피터, 스트레치, 캡 홀드

### Phase 3 — 드래프트 후
13. 루키 스케일, 드래프트 픽 제한
