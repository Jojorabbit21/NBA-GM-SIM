# 오프시즌 콘텐츠 플랜

## Context

현재 파이널 종료 시 `EndSeasonModal`이 전체 데이터를 삭제하는 것이 유일한 "시즌 종료" 로직이다. 오프시즌 콘텐츠를 설계하여 시즌 간 연결고리를 만들고, GM 시뮬레이션의 핵심 재미인 팀 빌딩 의사결정을 오프시즌에서 제공한다.

---

## 전체 오프시즌 플로우

```
Finals 종료
  ↓
Step 1: 시즌 결산 & 어워드 세레모니
  ↓
Step 2: 드래프트 로터리
  ↓
Step 3: 에이징 & 은퇴 공개
  ↓
Step 4: 계약 만료 & 익스텐션
  ↓
Step 5: 루키 드래프트 (2라운드 60픽)
  ↓
Step 6: FA 시장
  ↓
Step 7: 오프시즌 트레이드 (v1.5)
  ↓
Step 8: 트레이닝 캠프 / 로스터 확정 (v1.5)
  ↓
"새 시즌 시작" → Dashboard
```

`OffseasonView.tsx`에서 `step` 상태로 관리, 각 스텝은 독립 컴포넌트 렌더링.

---

## Step 1: 시즌 결산 & 어워드 세레모니 [MUST-HAVE]

### 콘텐츠
- 챔피언 + Finals MVP 공개
- 시즌 어워드 순차 공개: ROY → MIP → DPOY → All-NBA → MVP (드라마틱 애니메이션)
- 유저 팀 성적 요약 (W-L, 플레이오프 결과, 베스트 선수)
- HOF 제출 버튼

### 어워드 결정
- **MVP, DPOY, All-NBA, All-Defensive**: 기존 `runAwardVoting()` 직접 재사용 (100인 투표 시스템 구현 완료)
- **Finals MVP**: 챔피언 팀 플레이오프 통산 최고 스탯 선수
- **ROY**: 루키 계약 선수 중 41경기+ 출전, `ppg×0.4 + rpg×0.15 + apg×0.2 + 팀승률×0.25`
- **MIP**: `seasonStartAttributes` 대비 현재 OVR 증가량 기준

### 재사용 코드
- `utils/awardVoting.ts` — `runAwardVoting()`, `SeasonAwardsContent`
- `services/awardStamper.ts` — `player.awards[]` 기록
- `services/hallOfFameService.ts` — HOF 제출

### CPU 동작
없음 (순수 계산)

---

## Step 2: 드래프트 로터리 [MUST-HAVE]

### 콘텐츠
- 플레이오프 미진출 14팀 대상 가중 로터리
- 1~4위 픽만 로터리로 결정 (NBA 실제), 5~14위 역순 자동, 15~30위 플레이오프팀 역순
- 기존 `DraftLotteryView.tsx` 래핑 (30위→1위 역순 공개 애니메이션)

### 로터리 가중치
```
1위팀(최저승률): 14.0%  ...  14위팀(최고승률): 0.5%
```

### 구현
- 새 파일: `utils/draftLottery.ts` — `runDraftLottery(standings, seed)`
- 시드: `seasonNumber × 10000 + tendencySeed` → 결정론적 재현

### 재사용 코드
- `views/DraftLotteryView.tsx` — 애니메이션 UI 그대로

---

## Step 3: 에이징 & 은퇴 공개 [MUST-HAVE]

### 콘텐츠
- 유저 팀 선수 OVR 변화 표시 (▲ green / ▼ red)
- 은퇴 선수 목록 (리그 전체)
- "Breakout!" 태그 (22세 이하 OVR +3 이상)

### 처리
- `processOffseason()` 호출 (playerAging.ts:654, 이미 구현, 호출자만 없음)
  - `age += 1`, `contractYears -= 1`, 성장 필드 리셋

### 은퇴 판정 (multi-season-plan.md 설계)
```
age < 36:              없음
age 36-37 & OVR < 65:  40%
age 36-37 & OVR ≥ 65:  10%
age 38-39:             70%
age 40+:               100%
```
seededRandom 기반 결정론적 처리.

### 재사용 코드
- `services/playerDevelopment/playerAging.ts` — `processOffseason()`

---

## Step 4: 계약 만료 & 익스텐션 [MUST-HAVE]

### 4-A: 계약 만료 처리
- `contractYears == 0` 선수 → FA 풀 이동
- 유저 팀: 만료 선수 목록 표시 + 현재 페이롤/캡스페이스 표시
- CPU 팀: OVR 80+ 자동 재계약, 70-79 50% 재계약, <70 방출

### 4-B: 익스텐션
- FA 개막 전 자기 선수에게 연장 계약 제시
- 기간(1~4년) + 연봉 슬라이더
- 선수 수락 조건: `제시연봉 ≥ marketValue × (1 - loyaltyFactor)`
  - loyaltyFactor: 0.0~0.15 (tendencySeed 기반)
- 거절 시 → FA 시장으로 이동 (GM 딜레마)

### CPU 익스텐션
- OVR 85+ 선수에게 최대 익스텐션, 수락률 90%

### 재사용 코드
- `types/player.ts` — `PlayerContract`
- `services/tradeEngine/tradeValue.ts` — marketValue 계산 참조

---

## Step 5: 루키 드래프트 [MUST-HAVE]

### 5-A: 루키 생성
- **시즌 2 (2026-27)**: DB의 `meta_rookies_2026` 테이블에서 미리 정의된 루키 풀 로드
- **시즌 3+**: 매 시즌 60명 신인 자동 생성 (procedural generation)
- 새 파일: `services/offseason/rookieGenerator.ts`

```
[시즌 3+ 자동 생성 스펙]
OVR 분포: 1번픽 평균 78, 30번픽 평균 68, 2라운드 평균 62 (±4)
Potential: 1번픽 평균 90, 30번픽 평균 82, 2라운드 78
나이: 19~22세
계약: 루키 스케일 4년 (픽 순번 기반 고정 연봉)
ID: rookie_{seasonNumber}_{pickNumber}
```

- 시즌 2는 DB 로드, 시즌 3+는 시드 기반 자동 생성 (`seasonNumber × 1000 + pickNumber`)
- 37개 속성은 position + archetype 기반 가중 생성
- 잠재력은 숨김 → "유망" 아이콘만 표시 (스카우팅 재미)

### 5-B: 드래프트 UI
- `FantasyDraftView.tsx` 구조 재사용, 2라운드 × 30팀으로 축소
- CPU AI: 기존 `cpuDraftAI.ts` 재사용 (GM 성향 스코어링)
- 미지명 루키 → FA 풀 이동

### 재사용 코드
- `views/FantasyDraftView.tsx` — 드래프트 UI 골격
- `components/draft/*` — DraftBoard, PickHistory, PlayerPool, MyRoster
- `services/draft/cpuDraftAI.ts` (구현 필요하지만 fantasy-draft-plan.md에 설계 완료)

---

## Step 6: FA 시장 [MUST-HAVE]

### FA 풀 구성
```
= 유저팀 만료 선수 (미연장)
+ CPU팀 만료 선수 (자동 재계약 안 된 선수)
+ 루키 드래프트 미지명 선수
+ 은퇴하지 않은 방출 선수
```

### UI 핵심
- FA 선수 리스트 (포지션 필터, OVR/Interest 정렬)
- 선수별: Asking Price, 선호 기간, 경쟁 CPU팀 수 표시
- 오퍼 입력: 연봉 × 기간, 실시간 캡 체크
- 사용 가능 예외조항 자동 감지 표시

### 샐러리 캡 예외 (v1 구현 범위)
| 예외 | 금액 | 조건 |
|------|------|------|
| Cap Space | 잔여 캡 | 캡 하단 팀 |
| Full MLE | $12.8M | 비세금납부 팀, 시즌 1회 |
| Taxpayer MLE | $5M | 세금납부 팀 |
| Vet Min | $1.1~3.2M | 항상 가능 |
| Bird Rights (간소화) | 이전 연봉 ×3까지 | 자기 팀 만료 선수 |

### CPU FA 행동
- 각 CPU팀 `TeamNeeds` 분석 (teamAnalysis.ts 재사용)
- 니즈 기반 FA 순위 생성 → 캡 내에서 최우선 선수에 오퍼
- 유저가 "FA 완료" 클릭 시 CPU 일괄 처리

### Asking Price 생성
```
baseAsk = marketValue(ovr, age)
askingPrice = baseAsk × demandMultiplier (0.95~1.15, seeded)
```

### 재사용 코드
- `services/tradeEngine/tradeValue.ts` — 선수 시장 가치
- `services/tradeEngine/salaryRules.ts` — 캡 매칭 로직 패턴
- `services/tradeEngine/teamAnalysis.ts` — CPU 팀 니즈 분석

---

## Step 7: 오프시즌 트레이드 [NICE-TO-HAVE v1.5]

- 기존 트레이드 엔진 그대로 사용
- 차이점: 데드라인 없음, CPU 활동 2배 (`BASE_PROBABILITY` 증가)
- FA 완료 후 새 로스터 기준 트레이드 가치 재계산
- 기존 FrontOfficeView 트레이드 탭 + "오프시즌" 배너

---

## Step 8: 트레이닝 캠프 [NICE-TO-HAVE v1.5]

- 로스터 규모 체크 (13~15명)
- 포지션 균형 경고
- 전술 재설정 제안 (로스터 변동 큰 경우)
- 간단한 체크리스트 화면

---

## 파일 구조

### 새로 생성
```
views/OffseasonView.tsx              # 스텝 기반 메인 뷰
components/offseason/
├── SeasonSummaryStep.tsx            # Step 1
├── DraftLotteryStep.tsx             # Step 2
├── AgingRevealStep.tsx              # Step 3
├── ContractStep.tsx                 # Step 4
├── RookieDraftStep.tsx              # Step 5
├── FreeAgencyStep.tsx               # Step 6
├── OffseasonTradeStep.tsx           # Step 7 (v1.5)
└── TrainingCampStep.tsx             # Step 8 (v1.5)
services/offseason/
├── offseasonService.ts              # 오프시즌 전체 조율
├── rookieGenerator.ts               # 루키 클래스 생성
└── faMarket.ts                      # FA 시장 로직
utils/draftLottery.ts                # 로터리 가중치 로직
```

### 주요 수정 대상
- `types/app.ts` — AppView에 `'Offseason'` 추가
- `App.tsx` — 오프시즌 뷰 라우팅
- `hooks/useSimulation.ts` — 파이널 종료 → 오프시즌 전환
- `components/EndSeasonModal.tsx` — 오프시즌 진입으로 교체
- `components/Sidebar.tsx` — 오프시즌 버튼 변경

---

## 오프시즌 상태 저장

`saves.offseason_state` JSONB:
```typescript
interface OffseasonState {
  currentStep: number;
  awardsResult?: SeasonAwardsContent;
  lotteryOrder?: string[];
  agingResults?: OffseasonResult;
  retiredPlayers?: string[];
  extensions?: { playerId: string; newContract: PlayerContract }[];
  rookieClass?: Player[];
  rookieDraftPicks?: { pick: number; teamId: string; playerId: string }[];
  freeAgentPool?: string[];
  faSignings?: { playerId: string; teamId: string; contract: PlayerContract }[];
  mleUsed?: boolean;
}
```

---

## 재미 설계 핵심

1. **드라마틱 어워드 공개** — 항목별 순차 공개 애니메이션
2. **로터리 긴장감** — 30→1 역순 공개, "YOUR TEAM" 강조
3. **루키 스카우팅** — 잠재력 숨김 → "숨겨진 보석" 발견 재미
4. **FA 경쟁** — CPU 팀과 실제 비딩 경쟁
5. **에이징 충격** — 핵심 선수 퇴화 시 새 전략 수립 필요
6. **예산 퍼즐** — 캡 스페이스 최적 활용

---

## 구현 우선순위

### v1 (MVP): Step 1~6
| Step | 기존 코드 재사용 | 신규 구현 |
|------|----------------|----------|
| 1. Awards | runAwardVoting(), awardStamper | UI + ROY/MIP 추가 |
| 2. Lottery | DraftLotteryView.tsx | draftLottery.ts |
| 3. Aging | processOffseason() | UI |
| 4. Contracts | PlayerContract 타입 | 익스텐션 로직 + UI |
| 5. Draft | FantasyDraftView.tsx | rookieGenerator.ts |
| 6. FA | tradeValue, salaryRules, teamAnalysis | faMarket.ts + UI |

### v1.5: Step 7~8 + 폴리시
### v2: 멀티플레이어 확장 (Bird Rights 정확 추적, 실시간 FA 비딩 등)

---

## 검증 방법

1. 파이널 종료 → OffseasonView 진입 확인
2. 각 스텝 순차 진행 → 데이터 정합성 확인
3. "새 시즌 시작" → sim_date 다음 시즌, W/L 리셋, 스케줄 생성 확인
4. 저장 → 리로드 → offseason_state 복원 → 중단점 이어하기 확인
5. 시즌 2 몇 경기 시뮬 → 루키/FA 서명 선수 로스터 반영 확인
