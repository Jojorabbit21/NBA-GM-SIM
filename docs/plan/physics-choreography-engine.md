# 물리 기반 안무(Choreography) 엔진 — 설계 논의 문서

> 작성 기준: 2026-07-20 물리 랩(Physics Lab) 개발 세션. 진행 중인 설계 논의를 계속 다듬어 나가는 living document.

---

## 0. 왜 이 작업을 하는가

PBP 경기 모드(`components/physics-lab/PbpGameModePanel.tsx`)에서 공이 "선수에게 붙어있다가 → 베이스라인으로 이동 → 다시 선수에게 순간이동"을 반복하는 증상이 관찰됨. 원인 추적 결과:

- 포제션 전환 시 공이 이전 위치(림/베이스라인)에 남아있다가, 새 포제션의 `hold` 단계에서 `attachToCarrier()`가 새 액터 위치로 **즉시 스냅**시킴 (`PbpGameModePanel.tsx` `updateBallTick()`).
- 애초에 이걸 막기 위해 설계된 `TRANSITION_FRAC`/`'transition'` phase가 타입/상수만 선언되고 실제 로직에 연결되지 않은 **죽은 코드**였음.

이 버그를 땜빵 수정하는 대신, 사용자가 "물리엔진을 단계별로 쌓아올리자"는 방향을 제시 → 결과-확정(PBP) 구조는 그대로 두되, 그 결과에 도달하는 **움직임(안무)을 물리적으로 풍부하게** 만들어서 텔레포트 증상 자체가 구조적으로 발생할 수 없게 만드는 것이 최종 목표.

---

## 1. 핵심 설계 결정 (확정됨)

### 1-1. 결과-확정 구조는 유지한다 (방향 B)
PBP 엔진(`stepPossession`)이 모든 결과(성공/실패/리바운더 등)를 확률적으로 먼저 계산하는 현재 구조는 그대로 둔다. 물리/안무 레이어는 그 결과를 **부정하지 않고, 그 결과에 도달하는 과정을 그럴듯하게 연출**하는 역할만 담당한다.

> 사용자 코멘트: "모든 결과는 확률적으로 이미 계산되고, 계산된 결과에 맞춰서 안무를 짜는 것과 똑같을거야. 다만 그 안무를 풍부하게 짜서, 사용자의 입장에서는 실시간으로 선수들의 움직임에 따라 결과가 바뀌는것처럼 보이면 좋겠어."

### 1-2. Anchor / Free 프레임워크
포제션 안의 모든 움직임을 두 종류로 나눈다:

| 구분 | 의미 | 예시 |
|------|------|------|
| **Anchor (고정)** | PBP 엔진이 실제로 계산한, 절대 어겨선 안 되는 값 | 최종 액터(슈터), 슛 성공/실패, zone, 리바운더, 어시스터, (통합 후) 실제 슛 좌표 |
| **Free (자유)** | PBP 엔진에 기록되지 않아 안무 레이어가 스스로 채워야 하는 값 | 오프볼 스페이싱 경로/타이밍, 중간 터치 횟수/패스 경로, 컷의 곡률 |

Free 영역이 풍부할수록 "선수 개개인이 실시간으로 판단해서 움직인다"는 인상이 강해진다. Anchor는 절대 깨지면 안 된다 — 안무가 실제 기록(샷차트 등)과 어긋나면 안 되기 때문.

### 1-3. 안무는 possession 결과가 나오는 시점에 "한 번에" 전부 생성한다 (Reel 방식, 확정)

> 사용자 코멘트 (§4-3 논의에서 확정): "유틸리티AI를 호출해도 결국에는 정해진 결과를 향해 이동해야 하기 때문에, 그 과정에서 선수들이 알아서 판단하는 것은 불필요하다고 생각해. 차라리 포제션의 결과를 만들 때, 비트별로 모든 선수들의 좌표와 행동을 스냅샷으로 찍어서 내보내고, 그것을 화면에 인터폴레이트하게 그려내는 방식이 더 자연스럽지 않을까?"

Anchor를 "선택한 것처럼" 보이게 만드는 메커니즘은 매 틱/매 비트마다 재평가하는 실시간 에이전트 루프가 **아니라**, PBP가 possession 결과를 확정하는 바로 그 순간 스켈레톤 선택(§4-1)·터치 주체(§4-2)·비트별 좌표(§4-3)를 전부 한 번에 계산해서 하나의 완결된 시퀀스("Reel")로 만들어 내보내는 것이다.

- **"판단"은 생성 시점에 1회만 일어난다** — §4-1의 가중치 함수(pace/ballMovement/playStyle 등 기반 확률적 패턴 선택)가 사실상 유틸리티 스코어링의 전부이고, possession당 딱 한 번 평가된다. §4-2(lookup)·§4-3(템플릿)는 둘 다 결정론적이라 애초에 "실시간 판단"이 낄 자리가 없다 — 이미 정해진 스켈레톤을 좌표로 풀어내는 것뿐이기 때문.
- **렌더링 레이어는 순수 재생기(player)가 된다** — Reel(비트별 스냅샷 + duration + 볼 이벤트의 배열)을 받아서, Phase 1에서 이미 검증한 `arrive()`/`separation()`/`containment()` 조향으로 스냅샷 사이를 부드럽게 보간만 한다. Phase 1의 `STARTS→ENDS` 2스냅샷 보간을 N스냅샷으로 일반화한 것과 동일 — 새로운 물리 코드가 필요 없다.
- **아키텍처 경계**: Reel 생성(§4-1~4-4, PBP 타입을 아는 로직)과 Reel 재생(물리 코어, PBP 타입을 모르는 로직)이 완전히 분리된다 — §4-5에서 구체화.

---

## 2. 코드 조사로 확인된 사실 (2026-07-20)

### 2-1. 샷 좌표가 이미 두 번, 서로 다른 좌표계로 굴려지고 있음 — 반드시 통합 필요

| | 위치 | 좌표계 |
|---|------|--------|
| 샷차트용 (`ShotEvent.x/y`) | `recordShotEvent()` (`services/game/engine/pbp/handlers/visUtils.ts:8-40`) | **캔버스(고정) 좌표계** — `side = offTeam.id === home.id ? 'Right' : 'Left'`. 항상 한쪽 바스켓 기준으로 그리기 위한 미러링 (샷차트 UI 관례) |
| 코트 대형용 (`CourtSnapshot.positions`) | `computeCourtPositions()` (`services/game/engine/pbp/handlers/courtPositions.ts:261-`, `basketX` at L330) | **라이브 공격방향 좌표계** — `isHomePossession = offTeam.id === homeTeamId`, 홈팀은 항상 왼쪽 바스켓(x=5.25) 공격. `services/game/engine/physics/ballistics.ts`의 `rimPosition()`도 동일 컨벤션(주석에 "deliberately mirrors" 명시) |

두 좌표계가 홈팀 기준으로 **반대 방향**을 가리킴. 게다가 둘 다 `generateShotCoordinate(zone, side)`(`utils/courtCoordinates.ts:49`)를 **각자 독립적으로** `Math.random()` 호출해서 굴리기 때문에, 같은 zone이라도 실제 x/y 값 자체가 서로 다를 수 있음.

**결론**: `ShotEvent.x/y`를 안무의 anchor로 쓰려면 (a) 좌표 생성을 possession당 한 번만 호출하고 (b) 물리 좌표계(라이브 공격방향) 기준으로 생성한 뒤 (c) 샷차트에 저장할 때만 `mirrorX()`류 변환을 적용해 캔버스 좌표로 변환해서 별도 저장해야 함.

### 2-2. 포제션 소요시간(`timeTaken`)은 계산되지만 밖으로 노출되지 않음

`stepPossession()` 내부(`services/game/engine/pbp/liveEngine.ts:390`):
```ts
const timeTaken = calculatePossessionTime(state, offTeam.tactics.sliders, result.playType);
```
이 값으로 `state.gameClock`을 깎지만(L398), `StepResult` 반환 객체(`{ result, isQuarterEnd, isGameEnd, isTimeout, newLogs }` — L473/481/492/495/539/553/630)에는 포함되지 않아 호출부(`PbpGameModePanel` 등)에서 접근 불가. 지금 `PbpGameModePanel`은 이 대신 UI 슬라이더로 정한 고정 `possessionTicks`를 씀.

**필요 조치**: `StepResult`에 `timeTaken`(또는 `possessionDurationSec`) 필드 추가, 모든 반환 지점에 값 채우기. 작은 수정.

### 2-3. 멀티터치 패스 체인 데이터 없음

`PossessionResult`(`pbpTypes.ts:275-325`)에는 `actor`(최종 행위자) + `assister?`(스코어 시 단 1명)만 있음. A→B→C 같은 패스 체인 기록 구조 자체가 존재하지 않음. `assister`가 있으면 "마지막 한 다리(패서→슈터)"는 실제 데이터로 anchor 가능하지만, 그 이전의 볼 흐름은 전부 안무 레이어가 합성해야 함.

### 2-4. possession 과정 전체를 스냅샷 시퀀스로 내보내는 코드는 존재하지 않음 (확인 완료, 2026-07-20)

`ChoreographyReel`(§1-3/§4-5)에 해당하는 기존 구현체가 있는지 전체 검색으로 확인함 — **없음**.

- `CourtSnapshot` 대입 지점은 코드 전체에서 `liveEngine.ts:389` 단 한 곳: `state.courtSnapshot = computeCourtPositions(result, state.home.id);`. 매 `stepPossession()` 호출마다 이전 값을 덮어쓰는 단일 값이지, 배열/누적 구조가 아님.
- `CourtSnapshot` 타입(`pbpTypes.ts:268`) 자체도 `positions: PlayerCourtPosition[]` 하나짜리 단일 스냅샷 — 시퀀스 타입이 아님.
- 유일한 시간축 배열인 `boxTimeline: BoxTick[]`(`types/engine.ts:120-126`)는 용도가 다름 — "포세션 1회 종료 시점의 박스스코어 변화분(멀티플레이어 중계 점진 공개용)"이며 필드가 `t`(시각)/`on`(코트 위 10명)/`mp`(소비 분)/`d`(스탯 변화분)/`shot`(성공여부)뿐. 좌표·움직임 데이터 없음, 박스스코어 점진 공개용으로 완전히 별개.

**결론**: `ChoreographyReel` 생성 로직(§4-5의 `generateChoreography()`)은 재활용할 기존 구현체 없이 **완전히 새로 작성**해야 함. `GameState.courtSnapshot: CourtSnapshot | null` 필드도 Reel을 담을 수 있게 타입 변경(또는 별도 필드 `choreographyReel` 신설)이 필요 — Phase 4 구현 착수 시 첫 스텝.

---

## 3. 로드맵

- [x] **Phase 1 — 스크립트 플레이 스켈레톤** (완료, 2026-07-20)
  물리 코어와 무관한 순수 4비트 시나리오(하프코트 드리블→오프볼 스페이싱→45도 패스→캐치앤슛)로 공 물리 기초를 다짐.
  - `services/game/engine/physics/ballistics.ts`: `dribbleHeightAt()`/`attachToCarrierDribbling()`(드리블 바운스), `CHEST_HEIGHT_FT`(패스 아치)
  - `components/physics-lab/ScriptedPlayPanel.tsx` (신규): `PlayPhase` 상태머신(dribble/pass/catch/shoot/reset), 4.2초 루프
  - `pages/PhysicsLabPage.tsx`: 3번째 탭 연결

- [ ] **Phase 2 — 샷 좌표 통합 + 좌표계 정합** (§2-1 해결)
  `generateShotCoordinate()` 호출을 possession당 1회로 통합, 물리 좌표계 기준으로 생성 후 샷차트 저장 시에만 변환.

- [ ] **Phase 3 — 포제션 소요시간 노출** (§2-2 해결)
  `StepResult.timeTaken` 추가.

- [x] **Phase 4a-1 — 엔트리 시퀀스(인바운드+리바운드) 패턴 정의** (완료, 2026-07-20 — §6)
  playType 패턴(§4-1)에 앞서, possession이 "정상적으로 볼을 소유한 상태"가 아니라 **인바운드/리바운드로 시작하는 경우**의 골격을 먼저 정의(사용자 제안 — 안무 순서상 엔트리가 먼저 정해져야 playType 패턴과 자연스럽게 이어짐). 베이스라인/사이드라인 3분류(§6-1~6-2) + 트리거별 PBP 커버리지 확인(§6-3) + 케이스 1/2/3 각각의 세부 골격(§6-5, 6-7, 6-8) + 리바운드(수비≈케이스1, 공격≈케이스2 — §6-9) 전부 확정. 남은 PBP 엔진 갭(케이스 2 트리거 감지, `fullCourtPress` 연결 — §6-6)은 설계만 완료, 구현은 보류. 리바운드 쪽은 새 엔진 갭 없음(PBP 데이터로 충분).

- [x] **Phase 4a-2 — playType 액션(BeatType) 어휘 + 패턴 콘텐츠 정의** (완료, 2026-07-21 — §8, 12/12)
  물리엔진(재생 레이어)은 Phase 1에서 사실상 완성됨 — N스냅샷 보간은 2스냅샷 보간의 단순 확장이라 추가 엔진 작업이 필요 없음. 반대로 "어떤 상황에 어떤 액션이 나오는가"라는 콘텐츠는 전무. 그래서 엔진을 더 다듬기 전에 **playType(12종) × 전술 슬라이더 조합별로 실제 액션 시퀀스를 먼저 정의**하는 게 우선순위 — 이 과정에서 기존 물리 primitive(드리블/패스/캐치/슛)로 충분한 액션과 새 primitive가 필요한 액션(스크린/컷/핸드오프 등)이 자연스럽게 드러남. 결과물: BeatType 전체 목록 + 어떤 게 기존 구현으로 커버되고 어떤 게 신규 필요한지 매핑 + playType별 §4-1 `PATTERNS` 실제 데이터. 진행 중 새 엔진 갭 발견 — §8-0(`isAssisted` 필드 노출, 구현 보류).
  - [x] 8-1. Iso — 새 BeatType 불필요(기존 dribble/pass/catch/shoot로 3변주 전부 커버)
  - [x] 8-2. PnR_Handler — 새 BeatType 불필요(`screen`은 기존 arrive()로 커버, 레이블만 추가). subZone 기반 탑/좌45/우45 + pnrCoverage 시각 변주 + isAssisted 분기, 스크리너 롤/팝은 개별 선수 shot_3pt 속성 기반 확률 장식
  - [x] 8-3. PnR_Roll — 새 BeatType 불필요, isAssisted 분기 불필요(패스가 정의상 필수), 스크린 위치는 항상 탑으로 통일
  - [x] 8-4. PnR_Pop — 새 BeatType 불필요, 스크린은 탑 고정+팝 목적지만 subZone 3버킷, 핸들러 돌파→킥아웃 구조 추가
  - [x] 8-5. PostUp — 새 BeatType 불필요, Iso와 동일한 진입패스 구조(킥아웃 없음), shotType별(Dunk/Layup/Floater/Hook/Jumper) 동작 구분, 페이더웨이는 알려진 한계로 향후 고도화 항목
  - [x] 8-6. CatchShoot — 새 BeatType 불필요, isAssisted 분기 불필요(패스 정의상 필수), 3PT/Mid는 스탠딩 즉시슛 vs Rim/Paint는 캐치 후 펌프페이크→드라이브 전환
  - [x] 8-7. Cut — 새 BeatType 불필요, 킥아웃 경로 없음 확인, PnR_Roll의 리드패스 메커니즘 재사용(스크린만 없는 축소판)
  - [x] 8-8. Handoff — 새 BeatType 1개(`handoff`, 레이블만 신규·구현은 기존 attachToCarrier 재사용), CatchShoot과 동일 4존 구조(Hook만 제외), 핸드오프+직후 액션이 PBP상 한 세트로 이미 결정됨
  - [x] 8-9. Transition — 새 BeatType 불필요, isAssisted 분기 필요(Iso/PostUp 그룹), Mid 존 배제는 새 엔진 갭(한 단어 수정으로 해결 가능, 구현 보류), §6-9와 연결
  - [x] 8-10. Putback — 새 BeatType 불필요, secondaryActor 없는 유일한 솔로 액션, §6-9 골격 그대로 재사용(공격 리바운드 직후로만 발생 확정)
  - [x] 8-11. OffBallScreen — 새 BeatType 불필요, 새 엔진 갭 발견(`screener` 필드가 PossessionResult까지 도달 못함, 구현 보류), Handoff와 동일한 결과 카탈로그
  - [x] 8-12. DriveKick — 새 BeatType 불필요, 유일하게 zone에 따라 actor 자체가 교체되는 구조(Rim/Paint=드라이버 직접 마무리, 3PT/Mid=진짜 킥아웃), FORMATIONS zoneOverrides 추가 필요(우리 작업 범위)

- [ ] **Phase 4b — `generateChoreography()` 구현**
  Phase 4a 콘텐츠를 소비해서 `stepPossession()` 결과 확정 시점에 `ChoreographyReel`을 생성하는 실제 함수 작성. 설계는 §4-1~4-5에서 이미 확정: playType별 확률적 패턴 선택(§4-1) → 역할 토큰 lookup(§4-2) → FORMATIONS 확장 스냅샷(§4-3) → 마지막 스냅샷 anchor 덮어쓰기(§4-4) → PBP 레이어에 위치, L5 경계 유지(§4-5). **착수 전 준비물**: §4-6(엔진 갭 체크리스트, 우선순위 포함) 처리 여부 결정 + §4-7(FORMATIONS 좌표 확장 목록) 작업 + §4-1의 `PATTERNS` 인터페이스 재설계(zone/`isAssisted`/`subZone` 분기를 담을 수 있게).

- [ ] **Phase 5 (미정) — PbpGameModePanel 역이식**
  Phase 1-4에서 검증된 패턴을 실제 PBP 경기 모드에 적용해 텔레포트 버그를 구조적으로 해결.

- [x] **Phase 6a — 수비 AI 설계** (완료, 2026-07-21 — §10)
  모션 샌드박스(Phase 6b)의 "수비 토글" 요구사항에서 파생. 공격(Reel, 사전 계산된 패턴 라이브러리)과 근본적으로 다른 접근 — 수비는 PBP가 궤적을 anchor하지 않으므로 규칙 기반 알고리즘("AI")으로 매 비트 생성. 대전제 규칙 6개(§10-3), 스위치 조건(§10-4), 위협맵+경매 기반 헬프 로테이션 알고리즘(§10-5), 스틸/블록 anchor와의 정합성(§10-6) 전부 확정. X-아웃/중력중심 앵커는 2차 고도화로 명시적 보류.

- [x] **Phase 6b — 모션 샌드박스 UI/인프라 설계** (완료, 2026-07-21 — §12)
  어드민 물리 랩(`PhysicsLabPage`) 확장 설계 — `SandboxStep` 데이터 모델(§12-2), 합성 `PossessionResult` 빌더(§12-1), 컴포넌트 구조(§12-3), 데이터 흐름(§12-4) 전부 확정. 핵심 결정: 디렉터 컷(실제 PBP RNG 미사용, admin 전부 수동 지정) · 수비 토글 시퀀스 전체 단위 · miss→리바운드 엔트리 강제 · 시퀀스 편집기는 단순 리스트.

- [x] **Phase 7 — 모션 샌드박스 Milestone 1 구현 (CatchShoot 엔드투엔드)** (완료, 2026-07-21)
  코드 구현 모드 전환 후 첫 슬라이스 — 로스터 선택 → CatchShoot 1스텝 지정 → `generateChoreography()` → 물리 재생까지 실제로 동작. 신규 파일: `services/game/engine/pbp/choreographyTypes.ts`(`ChoreographyBeat`/`Reel`/`SandboxStep`), `services/game/engine/pbp/handlers/sandboxBuilder.ts`(합성 `PossessionResult` 빌더, `initTeamState`/`buildVirtualTeam` 재사용), `services/game/engine/pbp/handlers/choreographyGenerator.ts`(`generateChoreography()`, CatchShoot만 구현·나머지 11개는 단일 정적 비트 폴백), `components/physics-lab/useReelPlayback.ts`(`ScriptedPlayPanel`의 rAF 루프를 Reel 배열 재생용으로 일반화한 훅), `components/physics-lab/MotionSandboxPanel.tsx`(신규 4번째 탭). `npx vite build` 통과(2184 모듈, 순환임포트 없음) — 브라우저 실동작은 미검증(사용자 확인 필요). 나머지 11개 playType·엔트리 시퀀스(§6)·수비 AI(§10)·시퀀스 다중 스텝 UI는 다음 마일스톤.

- [x] **Phase 8 — 모션 샌드박스 Milestone 2 (케이스 1 인바운드 → 풀코트 전진 → CatchShoot)** (완료, 2026-07-21)
  §6-5 케이스 1을 CatchShoot 앞에 체이닝. 세부 결정은 §14 참조(인바운더 자동+admin override, 압박강도 축 보류, 릴레이 분기 생략). 변경 파일: `pbpTypes.ts`(role 유니온에 `'inbounder'`, `PossessionResult`에 `entry`/`inbounderId` 옵셔널 필드) · `choreographyTypes.ts`(`SandboxStep.inbounderId`) · `choreographyGenerator.ts`(`CASE1_ENTRY` 좌표, `resolveCase1Roles()`, `generateCase1Entry()` 4비트: setup→pass→catch→advance, `generateChoreography()`에서 `entry==='case1'`일 때 entry비트+CatchShoot비트 체이닝) · `sandboxBuilder.ts`(`entry`/`inbounderId` 전달) · `MotionSandboxPanel.tsx`(케이스 1 토글 + 인바운더 수동 지정 select). `npx vite build` 통과(2183 모듈) — 브라우저 실동작(풀코트 전진 애니메이션 자연스러움)은 미검증.

---

## 4. Phase 4 설계 (핵심 결정 확정, 구현 대기)

"playType + duration + anchor들을 받아서 possession 결과 확정 시점에 Reel(비트별 스냅샷 시퀀스)을 한 번에 만들어내는" `generateChoreography()` 함수 설계. §4-1~4-5 모두 결론이 났고, 남은 건 실제 구현.

### 4-0. 우선순위: 엔진보다 액션 콘텐츠가 먼저 (확정)

> 사용자 코멘트: "물리엔진을 먼저 만들기 전에, 플레이타입과 전술 슬라이더별로 어떤 액션들을 수행할지를 정하고, 그 액션들을 먼저 구현을 해두는게 맞을 것 같아."

물리 재생 레이어는 Phase 1에서 사실상 완성됐다 — §1-3/§4-3에서 확정한 대로 N스냅샷 보간은 Phase 1의 2스냅샷(`STARTS→ENDS`) 보간을 그대로 늘린 것뿐이라 추가 엔진 작업이 필요 없다. 반면 "어떤 상황에 어떤 액션이 나오는가"라는 콘텐츠(§4-1의 `PATTERNS` 실제 데이터)는 전혀 없다. 콘텐츠 없이 엔진만 더 다듬으면 Phase 1의 가짜 4비트 시나리오 하나로만 검증하는 셈이라, 진짜로 뭐가 필요한지 모른 채 엔진을 짜게 된다.

**액션(BeatType) 정의를 먼저 하면 부가 효과로 물리 primitive의 커버리지 공백이 드러난다**:

| 액션 | 물리 primitive 상태 (§8, 12개 playType 검증 완료 기준 갱신) |
|---|---|
| 드리블 | 완료 — `attachToCarrierDribbling()` (Phase 1) |
| 패스 | 완료 — `launchBall()` + `CHEST_HEIGHT_FT` (Phase 1) |
| 캐치 | 완료 — `attachToCarrier()` (Phase 1). 이동 중인 캐리어 추적(롤/컷/속공 등)도 매 틱 재호출로 자동 갱신되어 별도 로직 불필요함을 §8-3에서 확인 |
| 슛 | 완료 — `launchBall()` + `rimPosition()` (Phase 1) |
| 드라이브 / 킥아웃 | **검증 완료** — 기존 `arrive()` + `launchBall()` 조합으로 충분함을 Iso/PnR_Pop/CatchShoot/DriveKick 등 다수 playType에서 확인 (§8-1, 8-4, 8-6, 8-12) |
| 스크린 | **검증 완료** — 새 primitive 불필요. 기존 `arrive()`(정지 위치 이동 + hold)로 충분, "스크린으로 인정되는 조건"은 결과에 영향 없는 순수 시각이라 검증 불필요 결론. `screen`은 레이블만 신규 (§8-2) |
| 컷 | **검증 완료** — 새 primitive 불필요. 우려했던 "곡선 경로" primitive는 불필요했음 — PnR_Roll의 리드패스(이동 중인 목표를 향해 `arrive()` + 캐치 시점 미래위치로 패스 타겟 조준) 메커니즘 재사용으로 충분 (§8-7) |
| 핸드오프 | **검증 완료** — 새 primitive 불필요. 두 선수 접점에서의 전이는 `attachToCarrier(ball, 새 캐리어)`로 캐리어만 바꿔치면 되고 탄도 비행 자체가 필요 없음 — 오히려 `pass`보다 단순. `handoff`는 레이블만 신규 (§8-8) |

**결론 (12개 playType 설계 완료 시점 기준)**: 새로 만든 물리 primitive는 **0개**. 새로 만든 건 BeatType **레이블** 2개(`screen`, `handoff`)뿐이고, 둘 다 구현은 기존 `arrive()`/`attachToCarrier()`를 그대로 재사용한다 — Phase 1에서 만든 4개 primitive(드리블/패스/캐치/슛)만으로 12개 playType + 엔트리 시퀀스(§6) 전부가 커버된다.

### 4-1. 비트 분할 방식

**비트(beat)란**: 포제션 하나를 "볼/선수 상태가 유지되는 시간 구간" 단위로 잘게 쪼갠 것 — 안무 용어 차용. 각 비트는 (1) 길이(duration), (2) 볼 상태(드리블 중 / 패스 중-in flight / 캐치 후 정지 / 슛 중-in flight), (3) 이 구간 동안 온볼·오프볼 선수들의 목표(target)를 갖는다.

Phase 1(`ScriptedPlayPanel.tsx`)은 이미 "고정 4비트"였다: `dribble(2.0s) → pass(0.6s) → catch(0.4s) → shoot(0.8s) → reset(0.4s)`. 다만 포제션·순서·길이를 전부 하드코딩했다. 실제 포제션은 4초(인바운드 직후 캐치앤슛)~22초(풀 샷클락)까지 다양하므로, "비트 분할"은 **주어진 duration을 몇 개의 비트로, 각각 몇 초씩, 어떤 종류(드리블/패스/캐치/스크린/컷/슛)로 구성할지 정하는 로직**을 말한다. 예:

| 포제션 길이 | 비트 구성 예시 |
|---|---|
| 5초 | 드리블(1.5s) → 슛(3.5s, 캐치 없는 풀업) |
| 12초 | 드리블(2s) → 패스(0.6s) → 캐치(0.5s) → 재배치 드리블(3s) → 패스(0.6s) → 캐치+슛(0.8s) |
| 22초 | 드리블(2s) → 스윙패스(0.6s) → 캐치(0.4s) → 홀드/리셋(3s) → 스윙패스2(0.6s) → 캐치(0.4s) → 드라이브(2.5s) → 킥아웃패스(0.7s) → 캐치+슛(0.8s) |

비트 분할은 §4-2(누가 몇 번 터치하는지)·§4-4(마지막 비트가 실제 슛 좌표로 수렴)의 전제 조건이다 — 비트 개수/종류가 먼저 정해져야 각 비트에 "누가 터치하는지"와 "어디서 어디로 이동하는지"를 채울 수 있다.

**분할 방식: 옵션 A 채택 (확정)** — playType별 후보 비트-패턴(스켈레톤) 라이브러리를 두고, 그중 하나를 확률적으로 선택해 실행한 뒤 마지막 비트를 anchor-snap(§4-4)으로 강제 수렴시킨다.
```ts
PATTERNS: Record<PlayType, { skeleton: BeatType[]; weight: (sliders: TacticalSliders, ctx: { isMiss: boolean }) => number }[]>
```
완전 파라메트릭 생성(옵션 B)은 기각 — playType마다 실제로 있음직한 골격이 명확히 다르므로(PnR과 PostUp이 같은 규칙으로 N등분되면 부자연스러움) 패턴 라이브러리 쪽이 더 다루기 쉽고 결과 품질도 예측 가능.

**패턴 가중치 함수의 입력 — 전술 슬라이더 확인 결과 (`types/tactics.ts`)**

패턴 선택 가중치는 단일 슬라이더가 아니라 여러 슬라이더의 조합으로 결정한다. 확인 결과:

| 슬라이더 | 의미 | 안무 패턴 선택에 미치는 영향 |
|---|---|---|
| `pace` (1-10) | 게임 속도 | **이미 `timeTaken`에 직접 반영됨** (`timeEngine.ts:29-30`: pace 1→20초, pace 10→11초 베이스) — 총 길이는 자동으로 압축/이완됨. **추가로** 패턴 선택 자체에도 영향: 高페이스는 "핸들러가 스스로 빨리 결정"(적은 터치, 다운힐) 쪽 패턴에, 低페이스는 "여유있게 진행"(홀드/재정비 비트 포함) 쪽 패턴에 가중치 |
| `ballMovement` (1-10) | 패스 vs 아이솔 성향 | 高면 다중 패스/스윙 비트가 많은 패턴에, 低면 핸들러 단독 해결(드라이브·풀업·킥아웃) 패턴에 가중치 |
| `playStyle` (2=히어로볼~9=시스템농구) | 터치 집중도 | 히어로볼 쪽이면 볼이 소수(주로 액터)에게 집중되는 패턴, 시스템농구 쪽이면 여러 명을 거치는(스크린/컷/핸드오프) 패턴에 가중치. `ballMovement`(빈도)와 다른 축(집중도) — 함께 사용 |
| `insideOut` (2=인사이드~9=아웃사이드) | 공간 활용 성향 | 인사이드 쪽이면 포스트 터치 경유 패턴, 아웃사이드 쪽이면 퍼리미터 스윙 위주 패턴에 가중치 |
| `offReb` (1-10) | 크래시 vs 게러백 | 미스 possession의 마지막 비트(리바운드 직전) 오프볼 크래시/게러백 안무에 영향 — §4-3에서 사용 |
| ~~`pnrFreq`~~ | P&R 빈도 | 기각 — playType이 이미 `PnR_*`로 확정된 시점에 이 레이어가 개입하므로, 상위(playType 선택) 단계에서 이미 반영됐을 가능성이 높음. 여기서 또 쓰면 이중 반영 |
| ~~`shot_3pt`/`shot_mid`/`shot_rim`~~ | 슛 위치 성향 | 기각 — 슛 zone/좌표는 이미 PBP가 정한 anchor(고정값)라 이 레이어에서 "선택"할 대상이 아님 |

**pace × ballMovement 예시 매트릭스** (사용자 제시, 스코어링 함수 설계의 기준 사례로 채택):

| | ballMovement 高 | ballMovement 低 |
|---|---|---|
| **pace 高** | 빠른 다중 패스 스윙 (터치 최대화) | 핸들러 돌파 → 풀업/킥아웃 (다운힐, 소수 터치) |
| **pace 低** | 대형 정돈을 기다렸다가 여유있는 패스 | 핸들러 롱 드리블 홀드 후 결정 (아이솔 성향) |

이 표는 4개 고정 아키타입이 아니라 **연속적인 스코어링 함수가 만족해야 할 경계 사례(boundary case)** 로 취급 — §1-3의 유틸리티 스코어링 원칙과 동일하게, `weight(sliders, ctx)` 함수가 이 4개 극단에서 표에 맞는 패턴이 최고점을 받도록 설계.

### 4-2. 중간 터치 횟수/터치 주체 결정 (확정)

**결론: 미리 정의된 역할 토큰 패턴 + 실행 시 lookup으로 적용.** 새 어휘를 만들지 않고 `courtPositions.ts`의 기존 `FormationTemplate` 역할 슬롯을 그대로 재사용:

```ts
interface FormationTemplate {
    ballHandler: Pos;
    screenPartner: Pos;
    spacers: [Pos, Pos, Pos];  // 서로 구분 없음, POS_ORDER(PG→C)로 채움
}
```

이 슬롯들은 이미 실제 `playerId`에 묶여 있다 — `ballHandler` = `result.actor.playerId`(최종 슈터, anchor), `screenPartner` = `result.assister?.playerId`(어시스터, anchor). 즉 **가장 중요한 두 터치 주체(최종 슈터·어시스터)는 이미 실제 데이터로 확정되어 있고**, 결정이 필요한 건 서로 구분 없는 `spacers` 3자리뿐.

**§4-1의 스켈레톤은 역할 토큰 시퀀스로 표현**:
```ts
skeleton: ['ballHandler', 'spacer', 'assister', 'ballHandler']
// 예: 핸들러 드리블 → 스페이서에게 스윙 → 어시스터에게 패스 → 어시스터가 다시 핸들러(슈터)에게 패스, 캐치+슛
```

**실행 시 lookup 규칙**:
- `ballHandler` → 항상 `result.actor.playerId` (확정)
- `assister` → `result.assister?.playerId`. **제약**: 이 토큰을 쓰는 스켈레톤은 `result.assister`가 존재하는 possession(어시스트 스코어)에서만 §4-1 패턴 후보에 포함 — 비어시스트 스코어/미스/턴오버 possession에선 애초에 후보에서 제외
- `spacer` → 온코트 나머지 3명을 `POS_ORDER`(PG→C, 기존 코드와 동일 컨벤션)로 배정, 스켈레톤에 여러 번 등장하면 순서대로 순환

이 방식은 새 RNG 없이 순수 테이블 lookup만으로 터치 주체를 결정하며, anchor(actor/assister)는 100% 보장된다. 무작위 요소는 §4-1(어떤 스켈레톤을 고를지)에만 남고, §4-2는 결정론적 매핑이므로 재현성 문제(같은 포제션 재생 시 같은 안무)가 자동으로 해결됨 — 스켈레톤 선택에 물리 코어의 기존 `world.rng`(시드 기반, `createWorld(seed, ...)`)를 그대로 사용하면 possession 시드만 같으면 항상 같은 안무가 재현됨.

### 4-3. 비트별 목적지 산출 (확정)

**결론: 실시간 유틸리티 AI 불필요 — §1-3에서 확정된 대로, possession 결과가 나오는 시점에 §4-1(스켈레톤)·§4-2(터치 주체)와 함께 한 번에 계산해서 Reel에 굽는다.** 매 비트 전환마다 라이브로 재계산하지 않는다 — 어차피 도착해야 할 곳(anchor)과 거치는 역할(role 토큰)이 이미 정해져 있어 "그 순간의 판단"이 결과에 영향을 줄 수 없기 때문.

**콘텐츠 소스는 `FORMATIONS` 확장.** `courtPositions.ts`의 기존 `FORMATIONS[playType]`은 지금 possession 하나당 최종 스냅샷 1개(`{ballHandler, screenPartner, spacers}`)만 갖고 있다. 이걸 **스켈레톤의 비트 개수만큼의 스냅샷 배열**로 확장 — 검증된 playType별·zone별 좌표 감각(예: PnR이면 스크리너가 22,25 근처)을 그대로 물려받으면서, 비트마다 5명 전원의 목표 좌표를 갖게 된다.

**예시** — §4-1의 12초 스켈레톤(`ballHandler → spacer → assister → ballHandler`, PnR_Handler)이라면, Reel 생성 시점에 아래 4개 스냅샷이 한 번에 계산되어 나온다:

| 비트 | ballHandler(실제 슈터) | assister | spacer A | spacer B | spacer C |
|---|---|---|---|---|---|
| ① 드리블 진입 | (50,25)→(28,25) | (46,20) 유지 | 코너로 이동 시작 | 코너로 이동 시작 | 엘보우 근처 유지 |
| ② 패스(spacer로) | (28,25) 정지 | (22,25) 스크린 위치 | **패스 받음** | 스페이싱 유지 | 스페이싱 유지 |
| ③ 어시스터에게 패스 | 리로케이트 | **패스 받음, (22,25)** | 패스 아웃, 정지 | 스페이싱 유지 | 스페이싱 유지 |
| ④ 캐치+슛 | **§4-4가 실제 슛 좌표로 덮어씀** | 정지 유지 | 정지 유지 | 정지 유지 | 정지 유지 |

**렌더링(물리 코어) 쪽 역할**: 이 4개 스냅샷을 순서대로 받아서, Phase 1과 동일하게 `arrive()`+`separation()`+`containment()`로 스냅샷 사이를 보간 — Phase 1의 "2스냅샷(STARTS→ENDS)"이 "N스냅샷"으로 늘어난 것뿐, 물리 코어 자체는 변경 불필요.

### 4-4. 마지막 비트의 강제 수렴 (anchor snap, 확정)
Reel을 생성하는 바로 그 함수 안에서, 마지막 스냅샷의 `ballHandler` 좌표를 템플릿 값 대신 §2-1에서 통합한 실제 슛 좌표로 덮어쓴다 — 런타임 특별 분기 없이, 생성 시점에 마지막 원소만 다르게 채우면 끝. 마지막 비트(캐치+슛)의 duration은 고정 폭(표준 길이)으로 떼어두고, 나머지 시간을 앞의 비트들에 분배.

### 4-5. PBP 엔진과의 결합도 (확정)

§1-3/§4-3에서 자연스럽게 해결됨: Reel 생성 함수는 **PBP 레이어**(`services/game/engine/pbp/handlers/`, `computeCourtPositions()`와 나란히)에 둔다 — `PossessionResult`/`PlayType`/`TacticalSliders`를 직접 다루므로 PBP 타입을 아는 계층에 속해야 함. `liveEngine.ts`의 `stepPossession()` 안, 기존 `computeCourtPositions()` 호출(L389) 자리에 추가/대체.

물리 코어(`services/game/engine/physics/`)는 Reel의 **결과물만** 받아서 재생 — PBP 타입을 여전히 몰라도 됨. 기존 L5 adapter 경계(`adapter.ts`가 "PBP 타입을 아는 유일한 계층") 원칙이 그대로 유지된다.

```ts
interface ChoreographyBeat {
    snapshot: CourtSnapshot;   // 기존 타입 재사용 — 이 비트 시작 시점의 전원 목표 위치
    durationSec: number;
    ballEvent: 'dribble' | 'pass' | 'catch' | 'shoot' | 'screen' | 'handoff';  // §8-2/8-8에서 확정된 2개 레이블 추가 반영
}
type ChoreographyReel = ChoreographyBeat[];

// PBP 레이어, courtPositions.ts와 나란히
function generateChoreography(
    result: PossessionResult,
    timeTaken: number,
    homeTeamId: string,
): ChoreographyReel
```

**§4-1의 `PATTERNS` 인터페이스는 Phase 4b 착수 시 재설계 필요**: §4-1에서 처음 정의한 `PATTERNS: Record<PlayType, { skeleton: BeatType[]; weight: (...) => number }[]>`는 12개 playType 설계(§8) 전에 만든 단순한 초안이다. 실제로는 zone 분기(§8-3 등 다수)·`isAssisted` 분기(§8-0)·`subZone` 기반 좌/우 결정(§8-2)·`shotType` 기반 동작 구분(§8-3 등)·액터 자체가 바뀌는 경우(§8-12)까지 담아야 해서, 단순 `skeleton: BeatType[]` 하나로는 부족하다 — 이 축들을 조건부 분기로 표현할 수 있는 더 정교한 타입 설계가 Phase 4b의 첫 작업이 되어야 한다(설계 내용 자체는 §8-1~8-12에 전부 있음, 타입 스키마만 재정리하면 됨).

### 4-6. PBP 엔진 갭 통합 체크리스트 (Phase 4b 착수 전 정리)

지금까지 설계 과정에서 발견한 PBP 엔진 갭 전부(전부 "설계 완료, 구현 보류" 상태). Phase 4b(`generateChoreography()` 구현) 착수 전 우선순위를 정하기 위해 한곳에 모음.

| # | 갭 | 위치 | 필요한 변경 | 난이도 | 비고 |
|---|---|---|---|---|---|
| 1 | 샷 좌표 이원화 + 좌표계 불일치 | §2-1 | `generateShotCoordinate()` possession당 1회 호출로 통합, 물리 좌표계 기준 생성 후 샷차트 저장 시에만 `mirrorX()` 변환 | 중 | **이미 로드맵 Phase 2** |
| 2 | `timeTaken` 미노출 | §2-2 | `StepResult`에 필드 추가, 모든 반환 지점에 값 채우기 | 하 | **이미 로드맵 Phase 3** |
| 3 | 케이스 2(블록 디플렉션 OOB) 트리거 감지 불가 | §6-3 | `possessionHandler.ts:856` 블록 처리에 "OOB 공격권 유지" 분기 신설 | 중 | 안 고치면 인바운드 케이스 2가 영원히 발생 안 함 |
| 4 | `fullCourtPress` 죽은 슬라이더 | §6-6 | `GameState.pendingBlobEntry` 필드 신설 + `calculateTurnoverChance()`에 파라미터·가산항 추가 | 중 | §6-5의 "하이프레셔" 시각 분기가 이게 없으면 근거 없음 |
| 5 | `isAssisted` 필드 없음 | §8-0 | `PossessionResult`에 필드 추가, 기존 `assistOdds` 확률 굴림 결과 노출 | 하 | **영향 범위 최대** — Iso/PnR_Handler/PostUp/Transition 4개 playType이 이 필드로 분기 |
| 6 | Transition Mid 존 배제 | §8-9 | `selectZone(['3PT','Paint','Rim'],...)`에 `'Mid'` 한 단어 추가 | **최하** | 나머지 코드 변경 없이 자동 커버, 가장 쉬운 갭 |
| 7 | `screener` 필드가 `PossessionResult`까지 미도달 | §8-11 | 타입에 `screener?: LivePlayer` 추가, score/miss 등 반환 지점에 포함 | 하 | OffBallScreen 전용, 없어도 spacer 풀 자유배정으로 대체 가능(차선책 있음) |
| — | PostUp 페이더웨이 죽은 코드 | §8-5 | `resolveFinish(actor,'post',sliders,'Mid')` 호출로 교체 | 하 | **사용자가 명시적으로 향후 고도화 항목으로 보류 확정** — 지금 단계에서 손대지 않음 |

**우선순위 제안**: 6번(Mid 배열 추가)이 압도적으로 쉬우니 먼저, 5번(`isAssisted`)이 영향 범위가 가장 넓으니 그다음. 1·2번은 이미 별도 Phase(2, 3)로 로드맵에 있어 순서상 자연히 먼저 온다. 3·4번(케이스 2/하이프레셔)은 인바운드 엔트리 쪽이라 Phase 4b 범위 밖(엔트리 시퀀스 자체 구현 시점)에 처리해도 무방. 7번은 없어도 차선책이 있어 가장 낮은 우선순위.

### 4-7. FORMATIONS 좌표 확장 목록 (Phase 4b 착수 전 정리)

§4-3 방식(FORMATIONS를 비트/케이스별로 확장)으로 새로 추가해야 할 좌표 세트 전부. PBP 엔진 수정이 아니라 **우리 자신의 Reel 콘텐츠 작업 범위**.

| # | 대상 | 필요한 좌표 | 근거 위치 |
|---|---|---|---|
| 1 | 인바운드 케이스 1 (우리 진영 베이스라인) | 완전히 새로운 백코트 좌표 세트(x≈55~94) — 인바운더/골밑/코너2/윙 4슬롯 | §6-5 |
| 2 | 인바운드 케이스 3b (미드코트 사이드라인) | 케이스 1과 같은 골밑/코너2/윙 배치이나 미드코트(x≈47) 출발 — 케이스 1보다 짧은 버전 좌표 | §6-8 |
| 3 | PnR_Handler 좌45/우45 | 현재 탑 하나(28,25)뿐 — `subZone` 기반 좌/우 2벌 추가(스페이서 3명도 미러링) | §8-2 |
| 4 | DriveKick Rim/Paint | `zoneOverrides` 자체가 없음 — 다른 드라이브 마무리 playType처럼 골밑 근처(대략 7-12, 28-30) 좌표 추가 | §8-12 |

인바운드 케이스 2/3a(§6-7/§6-8-3a)는 이미 있는 골밑 근처 좌표를 그대로 재사용하므로 별도 확장 불필요.

---

## 6. 엔트리 시퀀스 (인바운드 패스) 설계

Reel(§4)이 다루는 건 "정상적으로 볼을 소유한 상태에서 시작하는 포제션"이다. 그런데 실제로는 포제션이 항상 그렇게 시작하지 않는다 — 득점 직후, 파울 직후, 바이올레이션 직후처럼 **인바운드 패스로 시작하는 포제션**이 매우 흔하다. 이 절은 그 "엔트리(진입) 상황"을 정의한다.

**스코프**: 오늘은 **베이스라인/사이드라인 인바운드**만 다룬다. 리바운드(공격/수비) 직후 상황은 인바운드 자체가 없는 별개 카테고리라 추후 별도로 다룬다 — 아래 §6-4 참조.

**Reel과의 관계**: 인바운드 엔트리도 §1-3/§4-3과 동일한 원칙을 따른다 — possession 결과가 확정되는 시점에 **엔트리 프리픽스 비트 + 일반 playType 패턴 비트**를 한 번에 계산해서 하나의 Reel로 내보낸다. 실시간 판단 없음, 새 물리 코드 없음(§1-3 참조).

### 6-1. 인바운드 3분류 (확정)

1. **우리 진영 베이스라인 인바운드** — 우리 팀이 수비하는 골대 쪽에서 시작. 풀코트를 가로질러야 하는 "정석" 케이스.
2. **상대 진영 베이스라인 인바운드** — 우리 팀이 공격하는 골대 쪽에서 짧게 재시작하는 케이스.
3. **사이드라인 인바운드** — 그 외 전부(기본값/폴백).

**"진영"의 정의 (여러 차례 검증 후 확정)**: "진영" = 그 팀이 **수비하는** 골대가 있는 코트 절반. 아래 구체적 예시로 확정함:

> 홈팀이 왼쪽 골대를 공격 중, 원정팀은 오른쪽 골대를 공격 중이라고 하자. 홈팀 공격수가 왼쪽 골대 근처에서 돌파하다 차징(공격자 파울)을 범해 원정팀에게 공이 넘어갔다면, 원정팀은 **왼쪽 골대**(=원정팀이 수비하는 골대, 파울이 실제로 일어난 자리)에서 인바운드한다 — 이게 원정팀의 "진영"이다. 오른쪽 골대(원정팀이 공격하는 쪽)가 아니다.

이 정의로 "실점"과 "공격자 파울(우리가 당함)"이 **왜 같은 위치**(우리 진영, 풀코트 전진 필요)인지가 설명된다 — 둘 다 "우리가 수비하던 그 자리"에서 발생한 사건이기 때문.

### 6-2. 트리거 → 케이스 매핑 (확정)

| 트리거 | 발생 위치 | 케이스 |
|---|---|---|
| 실점 (상대 득점) | 우리 진영(수비 골대 쪽) | 1. 우리 진영 베이스라인 |
| 공격자 아웃오브바운즈 (상대가 범함, 비강제 턴오버) | 우리 진영 | 1. 우리 진영 베이스라인 |
| 공격자 파울 (우리가 당함) | 우리 진영 | 1. 우리 진영 베이스라인 |
| 공이 수비수에 맞고 아웃오브바운즈, 공격권 유지 (블록 디플렉션 등) | 상대 진영(공격 골대 쪽) | 2. 상대 진영 베이스라인 |
| 수비자 반칙, 보너스 아님 | — | 3. 사이드라인 |
| 테크니컬/플래그런트 파울 | — (공격권 유지, 자유투 후) | 3. 사이드라인 |
| 그 외 파울/바이올레이션 전부 | — (기본값) | 3. 사이드라인 |

### 6-3. PBP 엔진 커버리지 확인 결과 (코드 조사 완료, 2026-07-20)

| 항목 | 상태 | 근거 |
|---|---|---|
| 케이스 1 트리거 판별 (실점/공격자 OOB/공격자 파울) | ✅ 가능 | `PossessionResult.type`(`score`/`turnover` with `isSteal:false`/`offensiveFoul`)로 직접 판별. 새 데이터 불필요 |
| 케이스 3 트리거 판별 (수비자 반칙·테크니컬·플래그런트·기타) | ✅ 가능 | 폴백/기본값이라 별도 위치 데이터 불필요 — "1도 2도 아니면 3"으로 충분 |
| **케이스 2 트리거 판별 (블록 디플렉션 OOB, 공격권 유지)** | ❌ **불가 — PBP 엔진 갭** | `possessionHandler.ts:856`(`isScore = isBlock ? false : ...`)를 보면 블록은 그냥 일반 미스로 흡수되어 정상 리바운드 롤을 탐 — "OOB로 나가서 공격권 유지"라는 별도 분기가 없음. 케이스 2를 실제로 트리거하려면 이 분기를 PBP 엔진에 새로 추가해야 함 (지금은 설계만, 구현은 보류) |
| 클러치 상황 판별 (1-1) | ✅ 가능 | `ClutchContext`가 이미 계산되어 시뮬레이션에 전달됨(`liveEngine.ts:369-388`) |
| 상대 풀코트 프레스 강도 (1-1) | ❌ **불가 — 죽은 데이터** | `TacticalSliders.fullCourtPress`(`types/tactics.ts:39`)가 선언만 되고 PBP 엔진 어디에서도 읽히지 않음(전체 검색 0건) |
| 2-for-1 가능 시간대 (2-1) | ✅ 가능 | `timeEngine.ts:41-44`, gameClock 30~45초 구간에서 이미 possession time을 6초로 캡 |
| 쿼터 막판 버저비터 강제 (2-2) | ⚠️ 부분적 | `_handleGameEnd()`(`liveEngine.ts:502-539`)는 **게임 전체 종료 시점(4쿼터/OT, 동점)**에만 적용. 1~3쿼터 막판 버저비터 상황에 대한 일반 로직은 없음 |
| 인바운드 스틸 발생 가능 여부 | ✅ 가능 (단, 위치 미특정) | `calculateTurnoverChance()`(`possessionHandler.ts:122-247`)의 스틸 roll은 possession 전체에 대해 1회 — "인바운드 시점"이라는 특정 순간에 묶여있지 않음. 안무 레이어가 결과가 `turnover+isSteal:true`인 BLOB/SLOB possession에 대해 "이 스틸은 인바운드에서 났다"고 자유롭게 서사를 붙이는 건 가능(패싱레인 스틸 로직이 이미 있어 "인바운드 패스를 수비가 읽어 가로챔" 그림과 실제로 잘 맞음) |

### 6-4. 스코프 밖 (별도 처리)

- **라이브볼 턴오버(스틸)**: `isSteal:true`인 턴오버는 공이 죽지 않고 바로 속공으로 이어짐 — 인바운드 자체가 불필요, `Transition` playType으로 직행.
- **리바운드(공격/수비)**: 인바운드 없이 볼이 라이브 상태로 이어짐(아웃렛 패스 등) — §6-9에서 설계 완료.

### 6-5. 액션 패턴 — 케이스 1(우리 진영 베이스라인) 세부 시나리오

`inbounder` 역할 토큰(§4-2 방식 재사용, `spacer` 풀에서 배정) 하나만 추가하고, 좌표는 케이스 1의 경우 새 백코트 좌표 세트가 필요(§4-3의 FORMATIONS 확장과 동일한 방식, 별도 관리) — 리바운드 상황(§6-4, 추후 주제)도 결국 백코트 좌표가 필요하므로 이 확장은 지금 해두는 게 맞음. 인바운더 좌표는 물리 코어(`containment()`) 수정 없이 **경계선 바로 안쪽으로 근사**(예: x=0.5/93.5)해서 처리.

**골격**: `setup`(인바운드 대형) → `pass`(인바운더→리시버) → (분기) → 일반 playType 패턴.

**분기 구조 — 두 축의 조합**:

1. **누가 볼을 전개하는가** (리시버의 역할)
   - 리시버가 빅맨/핸들링 낮은 선수 → 캐치 후 즉시 실제 핸들러에게 릴레이 패스. 만약 인바운더 본인이 핸들러라면, 리시버는 그 선수가 올라와 오픈될 때까지 기다렸다가 패스
   - 리시버가 팀 내 최고 핸들러 → 릴레이 없이 즉시 본인이 전개
2. **어떻게 전진하는가** (압박 강도 — 1번 축과 무관하게, 최종적으로 볼을 전개하는 사람이라면 누구든 적용)
   - 상대가 하이프레셔(풀코트) → 선수 능력치에 따라 하프코트 아래에서도 드리블 돌파 또는 패스 시도
   - 상대가 프레스 없음(존/맨투맨 하프코트 대기) → 평상시처럼 무난하게 전진

이 두 축은 서로 독립이라 조합해서 쓴다 — 예: "리시버=핸들러 아님 → 릴레이 → 릴레이 받은 핸들러가 하이프레셔 속에 전진".

**결과에 영향 없음**: PBP가 이미 possession 결과(성공/실패/턴오버/스틸)를 확정했으므로, 이 분기들은 전부 §1-3의 원칙대로 **결과를 바꾸지 않는 서사적 장식**이다 — 어떤 분기를 타든 최종 anchor(actor/결과)는 동일.

**오프볼 4명(볼을 전개하는 ballHandler를 제외한 전원)의 동시 배치 (확정)**

인바운더·센터·코너 2명, 총 4개 슬롯으로 포지션 기반 고정 배치:

| 슬롯 | 배정 규칙 | 비고 |
|---|---|---|
| **골밑(paint)** | `position === 'C'`인 선수 | 전통적인 센터의 림 커팅. C가 리시버라서 릴레이 중이었다면, 릴레이 직후 이 슬롯으로 |
| **코너 (좌)** | C·인바운더·ballHandler를 제외한 나머지 중 1명 | |
| **코너 (우)** | 같은 나머지 중 다른 1명 | |
| **윙 릴리즈(wingRelease)** | `inbounder` | 패스를 놓은 직후 핸들러와 나란히 상대 진영으로 전진 — 골밑·코너 2자리가 이미 찼으니 자연히 남는 자리(윙)로 귀결 |

**타이밍**: `setup`/`pass` 비트 동안 골밑·코너 2명은 볼과 무관하게 바로 목표 스팟으로 이동 시작. 인바운더는 패스를 놓는 순간부터 이동 시작해 `dribble`(전진) 비트 동안 핸들러와 나란히 전진, 윙 슬롯에 도착.

**이후 연결**: 일반 playType 패턴(§4-1)이 시작되면 이 4명의 역할은 §4-2의 lookup(`ballHandler`/`assister`/`spacer`)으로 재배정된다 — 지금 정한 골밑/코너/윙 배치는 어디까지나 "진입 시점의 시작 대형"이고, 그다음부터는 기존 Reel 메커니즘이 그대로 이어받는다.

**미해결로 남겨둔 축**: "시간 압박"(2-for-1 가능/버저비터만 가능, §6-3에서 확인한 `timeEngine.ts`의 기존 로직)은 오늘 다룬 "누가 전개/압박 강도" 축과는 **별개의 축**이며, 나중에 조합해야 함(예: 2-for-1 시간대+하이프레셔면 더 급박하게). 지금은 설계만 남기고 미해결.

### 6-6. PBP 엔진 보강 — 인바운드 프레스를 실제 확률에 반영 (설계, 구현 보류)

§6-5의 "하이프레셔 → 위험한 전진" 분기를 서사적 장식이 아니라 **실제로 근거 있는 결과**로 만들려면, `fullCourtPress` 슬라이더가 실제 턴오버/스틸 확률에 반영되어야 한다. 지금은(§6-3) 완전히 죽은 슬라이더라 "하이프레셔인데도 안 걸리는" 안무가 나올 수 있다 — 이걸 막기 위한 엔진 보강 설계.

**현황**: `calculateTurnoverChance(offTeam, defTeam, actor, defender, playType, pnrCoverage)`(`possessionHandler.ts:122-247`)는 `defIntensity`만 읽고(`intensityBonus`/`pressureRisk`), `defTeam.tactics.sliders.fullCourtPress`는 이미 인자로 들어오는 `defTeam`을 통해 접근 가능함에도 전혀 사용하지 않음.

**필요한 변경 (설계만, 미구현)**:

1. **`GameState`에 새 필드 추가**: `pendingBlobEntry: boolean` — "다음 포제션이 케이스 1(우리 진영 베이스라인)로 시작하는가"를 나타냄. `stepPossession()`(`liveEngine.ts`)이 `applyPossessionResult()` 직후, §6-2의 케이스 1 트리거 조건(`type==='score'`, 마지막 자유투 성공, `type==='turnover' && !isSteal`, `type==='offensiveFoul'`)으로 매 포제션 끝에 계산/갱신. 케이스 2/3에는 적용하지 않음 — 풀코트 프레스는 실제로 풀코트를 가로지르는 케이스 1에만 의미가 있음.

2. **`calculateTurnoverChance()`에 파라미터 추가**: `isBlobEntry: boolean`. 함수 내부에서:
   ```ts
   const pressBonus = isBlobEntry
       ? Math.max(0, (defTeam.tactics.sliders.fullCourtPress - 5) * PRESS_STEAL_COEFF)
       : 0;
   ```
   기존 `intensityBonus`(온볼 스틸, L147)·`laneProb`(패싱레인 스틸, L170-171)·`pressureRisk`(비강제 턴오버, L191)와 같은 패턴으로 가산.

3. **호출부 수정**: `simulatePossession()`의 `calculateTurnoverChance()` 호출(`possessionHandler.ts:603`)에 `state.pendingBlobEntry` 전달.

**효과**: 이 보강이 들어가면 §6-5의 "하이프레셔" 분기가 실제 확률과 일치하게 되고, §6-3에서 미해결로 남았던 "1-1. 클러치+하이프레셔" 시나리오도 근거를 갖추게 됨.

### 6-7. 액션 패턴 — 케이스 2(상대 진영 베이스라인) (확정)

케이스 1과 달리 **이미 프론트코트에서 공격하던 도중** 벌어지는 상황(블록 디플렉션 등으로 OOB, 공격권 유지 — §6-2)이라, 케이스 1의 많은 요소가 불필요해진다.

**케이스 1과 다른 점**:
- **전진(`dribble`) 비트 불필요** — 이미 프론트코트라 풀코트를 가로지를 필요가 없음
- **압박 강도 축·§6-6 엔진 보강 해당 없음** — 풀코트 프레스는 백코트→프론트코트 전진 상황에만 의미 있음, 케이스 2는 애초에 그 상황이 아님
- **오프볼 4명의 "골밑/코너/윙" 재배치 로직 불필요** — 방금까지 정상적으로 공격 중이었으므로, 오프볼 선수들은 곧바로 §4-3의 일반 playType 패턴이 원하는 시작 대형으로 이동(별도 엔트리 포메이션 없음)

**케이스 1과 동일하게 재사용**:
- `inbounder` 역할 토큰(§6-5), 다만 훨씬 짧고 즉각적인 `setup`
- "누가 전개하는가"(§6-5의 1번 축 — 리시버가 핸들러 아니면 실제 핸들러에게 릴레이) — 블록당한 공 근처에 있던 선수가 핸들러라는 보장이 없으므로 그대로 적용

**새로 추가 — 조건부 재배치(relocate) 비트**: 인바운드 지점(골밑 근처, 거의 고정)과 실제 슛 anchor 좌표(§2-1 통합 이후 알 수 있음) 사이의 거리에 따라 분기한다 — playType이 이미 확정돼 있는데 인바운드가 골밑 근처에서 시작하다 보니, anchor가 골밑에서 먼 zone(반대편 코너/윙 3점 등)이면 핸들러가 슛도 안 하고 바로 3점 라인 밖으로 돌아나가는 부자연스러운 그림이 나올 수 있기 때문:

- **거리가 짧으면**(슛도 골밑/페인트 근처) → 재배치 비트 생략, `pass` 받자마자 거의 곧바로 슛 비트로 연결
- **거리가 길면**(슛이 반대편 코너/윙 3점 등) → `pass`와 일반 playType 패턴 사이에 relocate 비트 삽입. 목표는 중립 지점이 아니라 **곧바로 이어질 일반 playType 패턴의 첫 비트가 원하는 ballHandler 위치**(§4-3의 FORMATIONS 확장 스냅샷)로 직행 — 중간 정거장 없이 최종 목적지로 바로. duration은 §4-1과 동일하게 거리에 비례해 배정.

**골격 (최종)**:
```
setup(짧게) → pass(인바운더→리시버, 골밑 근처) → (분기: 릴레이 여부)
  → [조건부: 거리가 멀면] relocate 비트 (다음 playType 패턴 첫 스냅샷으로 직행)
  → 일반 playType 패턴
```

### 6-8. 액션 패턴 — 케이스 3(사이드라인) (확정)

케이스 3의 트리거(§6-2)는 성격이 다른 두 그룹으로 나뉘고, 각각 이미 만든 케이스 1/2 메커니즘을 재사용한다 — 새 메커니즘은 필요 없음.

**3a. 수비자 반칙(보너스 아님)** — 우리가 공격하던 프론트코트에서 벌어지는 일이라 **케이스 2(§6-7)와 완전히 동일한 메커니즘**을 그대로 재사용한다. 유일한 차이는 인바운더 위치 — 베이스라인이 아니라 **사이드라인**(프론트코트 근처)에 선다는 것뿐. 전진 비트 없음·압박 축 없음·오프볼 4명 재배치 없음·거리 기반 relocate 조건부 비트, 전부 §6-7 그대로.

**3b. 테크니컬/플래그런트/그 외 파울·바이올레이션 (미드코트 사이드라인)** — 실제 NBA 규칙상 테크니컬 파울 이후 하프코트 사이드라인에서 인바운드하는 게 표준. 케이스 1의 골격을 재사용하되 시작점이 백코트(x≈50~94)가 아니라 **미드코트(x≈47)**라 자연히 짧아진다:

- **오프볼 4명**: 케이스 1(§6-5)과 동일하게 **골밑(센터)/코너 2/윙(인바운더)** 진입 대형으로 시작 — 미드코트는 백코트만큼 스크램블 상태는 아니지만 프론트코트만큼 정돈된 상태도 아니므로, 케이스 2식 "곧바로 playType 위치로"보다 케이스 1식 엔트리 포메이션이 더 자연스럽다(확정)
- **전진**: 케이스 1의 `dribble`(전진) 비트 재사용, 미드코트 출발이라 케이스 1보다 짧은 duration
- **도착 후**: §6-5의 "이후 연결"과 동일하게, 골밑/코너/윙 대형이 §4-2의 lookup(`ballHandler`/`assister`/`spacer`)으로 일반 playType 패턴 위치에 재배정
- **필요시**: §6-7의 거리 기반 relocate 조건부 비트도 동일하게 적용 가능(미드코트에서 전진해도 anchor가 멀면 추가 재배치 필요할 수 있음)

**골격 (3b)**:
```
setup(골밑/코너2/윙 진입 대형) → pass(인바운더→리시버, 미드코트 근처) → (분기: 릴레이 여부)
  → dribble(전진, 미드코트 출발이라 단축) → [조건부: 거리가 멀면] relocate 비트
  → 일반 playType 패턴 (§4-2 lookup으로 재배정)
```

### 6-9. 액션 패턴 — 리바운드 (확정)

리바운드는 볼이 죽지 않고 계속 살아있는 상태라 경계선 밖에서 던지는 인바운드 패스 같은 격식이 없다 — **케이스 1/2의 "라이브볼 버전"**에 가깝다. `PossessionResult.rebounder`가 이미 실제 anchor로 주어지므로(`inbounder`처럼 자유 배정할 필요 없음), 인바운드보다 오히려 더 근거가 탄탄하다. PBP 데이터도 이미 충분(리바운더 anchor·공수 리바운드 구분·풋백 여부까지 `playType`으로 판별 가능) — 인바운드 때와 달리 새로 발견된 엔진 갭 없음.

**수비 리바운드 ≈ 케이스 1 (전진 필요)**

리바운드 확보 지점 = 우리 팀이 방금 수비하던 골대 근처 = 케이스 1의 "우리 진영"과 동일 위치.

- `inbounder` 자리에 `rebounder`(실제 anchor)를 대입, 경계선 근사 좌표 처리 불필요(라이브볼이라 그 제약 자체가 없음)
- 리바운더→아웃렛 패스 → §6-5의 "누가 전개하는가" 축 재사용(리바운더=핸들러면 즉시 전개, 아니면 릴레이) → `dribble`(전진, 케이스 1 재사용) → 일반 playType 패턴
- 오프볼 4명: 케이스 1의 골밑/코너2/윙 진입 대형 재사용(리바운드 스크럼→트랜지션 오펜스 전환이 결이 비슷)

**골격 (수비 리바운드)**:
```
setup(리바운드 확보, rebounder=anchor) → pass(아웃렛, rebounder→리시버) → (분기: 릴레이 여부)
  → dribble(전진, 케이스 1 재사용) → 일반 playType 패턴
```

**공격 리바운드 ≈ 케이스 2 (relocate 조건부)**

리바운드 지점 = 골밑 근처(우리가 방금 공격하던 곳) = 케이스 2의 시작 위치와 동일.

- **`playType === 'Putback'`** → 이미 있는 playType이 정확히 이 상황(즉시 풋백)을 가리킴 → `setup`→`shoot` 직행, 최소 비트
- **그 외 playType**(리바운드 후 리셋) → §6-7의 거리 기반 relocate 조건부 비트 재사용 — 골밑에서 잡았는데 anchor가 멀면 재배치, 가까우면 생략

**골격 (공격 리바운드)**:
```
setup(리바운드 확보, rebounder=anchor)
  → [playType==='Putback'] shoot 직행
  → [그 외] pass(→리시버, 분기: 릴레이 여부) → [조건부: 거리가 멀면] relocate 비트 → 일반 playType 패턴
```

---

## 8. Phase 4a-2 — playType별 액션 패턴

§4-1의 `PATTERNS` 라이브러리에 들어갈 실제 콘텐츠. `types/engine.ts:144`의 12종 `PlayType` 순서대로 하나씩 정의한다. 각 playType마다: (1) 기존 `FORMATIONS`(courtPositions.ts) 재사용 여부, (2) 스켈레톤(비트 시퀀스), (3) 새 BeatType 필요 여부(§4-0 커버리지 표 갱신용), (4) 오프볼 처리를 정리한다.

### 8-0. PBP 엔진 보강 — `isAssisted` 필드 노출 (설계, 구현 보류)

Iso/PnR_Handler 설계 도중 발견한 새 엔진 갭. **`PossessionResult.assister`의 존재 여부는 "의미 있는 어시스트 패스가 실제로 있었는지"를 신뢰성 있게 알려주지 않는다** — `assister`는 playType별로 정해지는 `secondaryActor`(PnR 계열은 스크리너, Iso/PostUp은 패서 등)가 스코어 시 사실상 항상 채워지기 때문.

**근거**: `statsMappers.ts:166-184`에 `assistOdds` 테이블이 있음:
```ts
const assistOdds = {
    CatchShoot: 0.97, DriveKick: 0.97, Cut: 0.95, OffBallScreen: 0.95, PnR_Pop: 0.95,
    PnR_Roll: 0.90, Handoff: 0.78, Transition: 0.78,
    PostUp: 0.55, PnR_Handler: 0.50, Iso: 0.38, Putback: 0.10,
};
if (Math.random() < prob) assister.ast += 1;  // 스탯(.ast)만 증가 — PossessionResult엔 결과가 안 남음
```
이 확률 굴림 결과(진짜 어시스트로 인정됐는지)는 `.ast` 스탯 카운터에만 반영되고 **`PossessionResult` 어디에도 노출되지 않는다.** 즉 `PnR_Handler`처럼 `assistOdds`가 낮은(50%) playType은 `assister` 필드만 보고는 "이번엔 진짜 패스가 있었는지" 절반은 틀리게 판단하게 됨.

**필요한 변경 (설계만, 미구현)**: `PossessionResult`에 `isAssisted: boolean` 필드 추가, `statsMappers.ts:181`의 기존 확률 굴림(`Math.random() < prob + assistMod`) 결과를 그대로 이 필드에 노출. 안무 레이어는 `result.assister`(누가 등장인물인지)가 아니라 **`result.isAssisted`(진짜 패스가 있었는지)로 분기해야 함.**

**영향받는 playType**: `assistOdds`가 100% 미만인 전부 — 특히 `PnR_Handler`(50%)·`Iso`(38%)·`PostUp`(55%)·`Putback`(10%)처럼 낮은 것들이 영향이 큼. `CatchShoot`/`DriveKick`(97%)처럼 거의 항상 참인 경우는 지금처럼 `assister` 존재만 봐도 근사치로는 괜찮음.

**§8-1(Iso) 수정 필요**: 아래 8-1은 "`assister` 존재 여부"로 분기하도록 작성됐으나, 이 발견에 따라 **`isAssisted` 필드 기준**으로 정정해야 함(구현 시점에 반영).

### 8-1. Iso (아이솔레이션) — 확정

기존 `FORMATIONS['Iso']`(`courtPositions.ts:28-40`) 재사용 — clear-out 대형(스크린파트너 32,42 + 스페이서 3명)이 이미 정의됨.

**PBP 확인 사항**: `playType==='Iso'`가 반드시 슛으로 끝나도록 설계되어 있지 않음(`possessionHandler.ts`에서 `selectedPlayType`가 턴오버·공격자파울·샷클락바이올레이션 등 모든 결과 분기에 실려 나감 — L436/450/598/611/906 등). Iso 전용 턴오버 리스크(`contextRisk = 0.01`, L205)도 존재 — 엔진이 "Iso인데 턴오버로 끝나는 경우"를 정상 결과로 취급함을 뒷받침.

**패턴 선택은 확률적 가중치가 아니라 `result.isAssisted`(§8-0, 향후 추가될 필드) 여부로 결정** — 결정론적, 새로 확률을 굴릴 필요 없음. (기존에는 `result.assister` 존재 여부로 잘못 판단했으나 §8-0에서 정정됨 — `assister`는 Iso에서도 거의 항상 채워지므로 신뢰 불가.)

**역할 방향 정정 (2026-07-20)**: `playTypes.ts:260`을 다시 확인한 결과, `secondaryActor`(=`isAssisted` 시의 패서)는 변수명이 `passer`이고 주석이 "**아이소 진입 패스**를 제공한 선수"임을 확인 — 즉 **패서→액터로 들어가는 진입 패스**이지, 액터가 더블팀당해 킥아웃하는 게 아니다. 이전 버전은 이 방향을 잘못 뒤집어서(킥아웃) 기록했었음 — 아래로 정정.

1. **`isAssisted === false` (1on1 아이솔레이션)**: `dribble`(액터 본인이 원온원, duration 대부분 차지) → `shoot`(zone별 anchor). 압박 강도(`defIntensity` 등)에 따라 `dribble` 비트 중 헬프 수비수가 시각적으로 붙는 정도만 달라짐(결과는 항상 액터가 직접 슛) — 순수 서사적 장식.
2. **`isAssisted === true`**: `pass`(패서→액터, 아이솔 진입 패스) → `catch` → `dribble`(원온원) → `shoot`(액터). 액터는 어느 분기에서든 항상 본인이 마무리 — PBP상 킥아웃 경로 자체가 없음(§8-2와 동일 원리).

이 골격 위에 두 단계 시각 변주(둘 다 결과에 영향 없는 순수 서사적 장식):
- **더블팀**: 액터가 킥아웃하지 않고 계속 스스로 마무리하므로, "더블팀당하면서도 액터가 밀어붙이는" 그림으로 배치 — `dribble`(원온원) 구간에 수비 강도 슬라이더가 높을수록 헬프 수비수가 눈에 띄게 붙는 시각. 두 분기(1/2) 모두에 적용 가능.
- **오프스크린**: `isAssisted === true` 분기 전용 — 액터가 진입 패스를 스탠딩으로 받는 대신, 스크린을 타고 나오면서 받는 변형(`pass`/`catch` 비트에 적용).

**새 BeatType 필요 여부**: 없음 — `dribble`/`pass`/`catch`/`shoot`(Phase 1 기존 primitive)만으로 3가지 변주 전부 커버됨. §4-0 커버리지 표에서 Iso는 "완료" 그룹에 추가.

**오프볼 4명**: `FORMATIONS['Iso'].base`의 clear-out 위치(스크린파트너 + 스페이서 3명) 그대로, possession 내내 정적 유지 — 별도 재배치 없음.

### 8-2. PnR_Handler (픽앤롤 — 핸들러 마무리) — 확정

**PnR 개념 정리**: 볼 핸들러 + 스크리너 2인 액션. 스크리너가 핸들러 수비수 앞을 막아서면(스크린) 핸들러가 유리한 상황을 만듦. 이후 스크리너가 뭘 하든(롤/팝) 상관없이 **핸들러 본인이 직접 마무리**하는 경우가 `PnR_Handler`(PnR_Roll/PnR_Pop은 스크리너가 마무리하는 별도 playType).

**PBP 확인 사항 (핸들러가 패스하는 선택지 없음)**: `playTypes.ts:277-296`(`resolvePlayAction`의 PnR_Handler 케이스)에서 `actor = pickWeightedActor(핸들러 아키타입)`으로 처음에 고정되고, 이후 모든 결과 분기(슛파울/논슈팅파울/공격자파울/턴오버/득점)에서 이 `actor`가 절대 바뀌지 않음. **`playType==='PnR_Handler'`인 한 액터는 항상 핸들러 본인** — 핸들러가 다른 선수에게 패스해서 그 선수가 득점하는 경로는 존재하지 않음.

**패턴 선택 — 세 개의 독립 축**:

**축 1) 스크린 위치 (탑/좌45/우45) — `result.subZone` 기반, 결정론적**

`statsMappers.ts:18-23`에서 `subZone` 값 확인: `zone_mid_l`/`_c`/`_r`, `zone_atb3_l`/`_c`/`_r`, `zone_c3_l`/`_r` 등 좌/중/우 구분이 이미 실제 데이터로 존재. 별도 확률 없이:
- `subZone`이 `_l`로 끝남 → 좌45도 스크린
- `_r`로 끝남 → 우45도 스크린
- `_c` 또는 림/페인트(좌우 구분 없음) → 탑 스크린

`FORMATIONS['PnR_Handler']`(현재 탑 하나, ballHandler 28/25, screenPartner 22/25)를 §4-3 방식으로 좌45/우45 2벌 추가 확장 필요(스페이서 3명 좌표도 미러링).

**축 2) 수비 커버리지(drop/hedge/blitz) — `pnrCoverage` 기반, 순수 시각 장식**

Iso의 압박 강도 축과 동일한 원리, 결과에 영향 없음:
- **Drop**: `dribble` 비트가 무난한 돌파/풀업 경로
- **Hedge**: `dribble` 비트 중 스크리너 수비수가 잠깐 튀어나와 저지하는 그림
- **Blitz**: `dribble` 비트 중 더블팀 압박 그림(Iso의 더블팀 시각 장식과 동일 기법)

**축 3) 어시스트 여부 — `result.isAssisted`(§8-0) 기반, 역할 방향은 Iso와 반대**

`playType==='PnR_Handler'`는 액터가 항상 핸들러로 고정되므로, Iso와 달리 **어시스트가 있으면 "누군가 스크린 타이밍에 맞춰 핸들러에게 패스해준" 경우** — 어시스터가 액터에게 패스(Iso처럼 액터가 어시스터에게 패스가 아님):
- `isAssisted === false`: 핸들러가 이미 볼 소유 → `setup`(스크린 위치) → `screen`(스크리너 arrive+hold) → `dribble`(스크린 활용, 커버리지별 시각 변주) → `shoot`
- `isAssisted === true`: `pass`(어시스터→핸들러) → `catch` → `setup`(스크린 형성) → `screen` → `dribble` → `shoot`

**스크리너의 롤/팝 시각 처리 (신규 확정)**: `playTypeProfiles.ts:34-45` 확인 결과, 실제 PnR_Roll/PnR_Pop 선택은 **팀 레벨 `insideOut` 슬라이더**로 이미 possession 시작 전에 결정됨(개별 스크리너의 3점 성향과 무관) — 균형 상태 기준 Roll:Pop ≈ 60:40, 인사이드 성향이면 최대 83:17, 아웃사이드 성향이면 19:81까지 기움(계산 근거는 §8-2-부록 참조). **하지만 이건 `PnR_Handler`가 아니라 `PnR_Roll`/`PnR_Pop`이라는 별도 playType 선택 얘기다.** `PnR_Handler` 내부에서 스크리너는 볼을 안 받으므로 롤/팝이 결과에 영향 없는 **순수 시각 장식** — 여기서는 사용자 제안대로 기본값 롤, 이번 possession에 배정된 **개별 스크리너 선수의 `shot_3pt` 속성이 높으면 확률적으로 팝**하는 것으로 정함(팀 슬라이더와는 별개 레이어, 안무 전용 자유 결정이라 충돌 없음).

**골격 (최종)**:
```
setup(스크린 위치 — subZone 기반 탑/좌45/우45) → [isAssisted] pass(어시스터→핸들러)→catch
  → screen(스크리너 arrive+hold, drop/hedge/blitz 시각 변주)
  → dribble(스크린 활용) → shoot(anchor)
  → [배경] 스크리너는 스크린 후 롤(기본) 또는 3점 속성 기반 확률적 팝 — 시각 장식, 볼 안 옴
```

**새 BeatType 필요 여부**: `screen`(정지 위치 arrive+hold) — §4-0에서 "미정"이었으나, 물리적으로는 기존 `arrive()`로 충분(§steering.ts 수정 불필요), "스크린으로 인정되는 조건"(수비 경로 차단 등)은 안무 목적상 검증 불필요(결과에 영향 없는 순수 시각). **결론: 새 물리 primitive 불필요, BeatType 레이블만 추가.**

**오프볼 3명**(핸들러·스크리너 제외): `FORMATIONS['PnR_Handler']`의 스페이서 3명 위치(탑/좌45/우45 버전별로) 그대로 정적 유지.

**부록 — Roll:Pop 비율 계산 근거**: `weight(pt) = max(0.5, base + inside×insideFactor + pnr×pnrFactor)`, `insideFactor=(5-insideOut)/5`. `PnR_Roll{base:1.5,inside:+1.5}`, `PnR_Pop{base:1.0,inside:-1.5}`. insideOut=5(균형) → Roll 1.5 : Pop 1.0. insideOut=2(인사이드) → Roll 2.4 : Pop 0.5(플로어). insideOut=9(아웃사이드) → Roll 0.5(플로어) : Pop 2.2.

### 8-3. PnR_Roll (픽앤롤 — 롤러 마무리) — 확정

기존 `FORMATIONS['PnR_Roll']`(`courtPositions.ts:54-65`) 재사용. **슬롯 이름 주의**: `ballHandler` 슬롯(x=10,y=28, 골밑 근처) = 실제로는 롤러(액터) 위치, `screenPartner` 슬롯(28,25) = 실제로는 핸들러(보조액터) 위치 — `computeCourtPositions()`가 슬롯 이름과 무관하게 "ballHandler=actor 자리, screenPartner=secondaryActor 자리"로 매핑하기 때문(§8-2와 같은 패턴).

**PBP 확인 사항**: `playTypes.ts:297-314`에서 `actor = screener`(롤러가 마무리), `secondaryActor = handler`(패서). 존 선택도 `selectZone(['Rim','Paint','Mid'], ...)`으로 3점 배제 — 롤러는 항상 골밑/미드 마무리.

**핵심 — `isAssisted` 분기 불필요**: `assistOdds['PnR_Roll'] = 0.90`(§8-0)인 이유가 명확함 — 롤 마무리는 **정의상 패스가 필수**(핸들러가 롤러에게 던지지 않으면 애초에 이 playType이 될 수 없음). Iso/PnR_Handler와 달리 액터가 스스로 만드는 게 아니므로, 항상 패스 비트를 포함하면 됨. (CatchShoot/DriveKick/Cut/OffBallScreen/Handoff처럼 `assistOdds`가 높은 나머지 playType들도 같은 원리일 가능성 높음 — 각 항목에서 확인 예정.)

**스크린 위치 — 항상 탑으로 통일 (사용자 확정)**: PnR_Handler(§8-2)와 달리 subZone 기반 좌/우 구분을 두지 않고 **항상 탑 스크린**. 롤 액션은 골밑을 향한 다운힐 움직임이라 스크린 사이드가 최종 좌우 위치에 크게 영향을 주지 않으므로 단순화.

**리드패스**: Reel이 possession 결과 확정 시점에 전부 사전 계산되므로(§1-3), 스크리너의 롤 궤적을 이미 알고 있음 — 패스 타겟을 "캐치 시점의 롤러 위치"로 정확히 잡으면 되고 실시간 예측 로직 불필요.

**커버리지(drop/hedge/blitz) — 순수 시각 장식**: 골밑 마무리가 컨테스트당하는 정도만 다름 — Blitz(핸들러 더블팀이라 롤러는 사실상 오픈, `bonusHitRate:0.03`과도 결이 맞음) > Hedge(중간 컨테스트) > Drop(스크리너 수비수가 골밑에 남아있어 가장 컨테스트됨).

**존별(Rim/Paint/Mid) 표현 — 전부 커버 가능 (확정)**: `zoneOverrides`(Rim 7,26 / Paint 13,28 / Mid 18,25)가 이미 3개 다 있어서, 롤 경로(`pass`→`catch`→`shoot`)의 목적지를 anchor zone에 맞는 좌표로 잡으면 골밑 바로 앞부터 살짝 떨어진 미드까지 자연스럽게 다른 길이의 롤 경로가 나온다 — 별도 분기 없이 `arrive()`가 알아서 처리.

추가로 `playTypes.ts:306-313`의 **`shotType` 필드로 마무리 동작 스타일까지 구분**(이미 있는 PBP 데이터, 새로 만들 필요 없음):
- **Rim/Paint** (`resolveFinish()`가 리턴하는 레이업/덩크/플로터 등 finish류 `shotType`): 이동 중 캐치 → 멈추지 않고 곧바로 골밑으로 파고들어 마무리(연속 동작)
- **Mid** (`shotType === 'Jumper'`, 고정값): 캐치 → 짧게 개더(정지) → 풀업 점퍼(캐치앤슛과 비슷한 결)

**골격 (최종)**:
```
setup(탑 스크린 위치) → screen(스크리너 arrive+hold) → dribble(핸들러, 패스각도 확보)
  → pass(핸들러→스크리너, 롤 중 캐치 시점 미래위치 조준 — 목적지는 anchor zone별 좌표)
  → catch(이동 중 attachToCarrier, 매 틱 자동 갱신)
    → [shotType==='Jumper'] 개더(짧은 정지) → shoot
    → [그 외 finish류] 연속 동작으로 곧장 shoot
  (커버리지별 컨테스트 시각 변주는 shoot 비트에 적용)
```

**새 BeatType 필요 여부**: 없음 — `screen`(§8-2에서 이미 확정)·`pass`·`catch`(이동 중 캐리어 추적, 기존 `attachToCarrier` 매 틱 갱신으로 자동 처리)·`shoot` 전부 기존 primitive. 개더(짧은 정지)도 `arrive()`의 감속 특성으로 자연히 표현됨 — 새 primitive 불필요.

**추가 발견 — 랍패스 메카닉 (Handoff 설계 중 발견, 반영 필요)**: `possessionHandler.ts:647-680`에 `PnR_Roll + Rim + (Dunk/Layup)` 조합 전용 랍패스(lob) 판정이 있음 — 롤러의 vertical·핸들러의 passVision·`pnrCoverage`(blitz면 랍 시도↑, drop이면↓)로 랍 시도 확률을 굴리고, 시도했다면 handler의 passAcc·roller의 hands/vertical로 성공 여부를 다시 굴림. **랍 실패 시 악송구 턴오버로 직결**(L674-680). 즉 PnR_Roll의 Rim+Dunk/Layup 마무리는 일반 지상 패스가 아니라 **랍(공중 패스)으로 표현하는 게 더 정확** — `pass` 비트의 궤적(높이)만 랍패스답게 좀 더 높게 잡으면 되고 새 BeatType은 불필요. 랍 실패 턴오버 케이스는 §1-3 원칙대로 이미 정해진 결과에 맞춰 안무만 "랍이 빗나가는" 그림으로 연출.

**오프볼 3명**: `FORMATIONS['PnR_Roll'].base`의 스페이서 3명 위치 그대로 정적 유지.

### 8-4. PnR_Pop (픽앤팝 — 팝한 스크리너 마무리) — 확정

기존 `FORMATIONS['PnR_Pop']`(`courtPositions.ts:66-72`) 재사용 — 단일 좌표(30,15)만 있고 `zoneOverrides` 없음. **PBP 확인 사항**(`playTypes.ts:315-327`): `actor=popper`, `secondaryActor=handler`, `preferredZone: '3PT'`·`shotType: 'CatchShoot'` **고정** — zone 분기 자체가 없음(PnR_Roll과 대조적). `assistOdds['PnR_Pop']=0.95`(§8-0)라 PnR_Roll과 같은 이유로 **`isAssisted` 분기 불필요**(패스가 정의상 필수).

**스크린 위치 — 항상 탑으로 단순화 (사용자 확정)**: PnR_Roll(§8-3)과 동일 원칙.

**팝 목적지(탑/좌45/우45) — `subZone` 3버킷 매핑 (확정)**: 스크린은 항상 탑이지만, **팝하는 선수가 실제로 빠져나가는 목적지**는 anchor의 `subZone`(`zone_atb3_l/_c/_r`, `zone_c3_l/_r`)을 좌/중/우 3버킷으로 단순화(코너도 좌/우 버킷에 포함)해서 결정 — PnR_Handler(§8-2)에서 쓴 subZone 매핑 방식 재사용.

**핸들러의 돌파→킥아웃 (신규 확정)**: 픽앤팝은 스크린 직후 바로 패스가 아니라, **핸들러가 어느 정도 돌파한 뒤 바깥으로 빼주는 패스**라는 사용자 지적 반영 — Iso의 더블팀→킥아웃(§8-1), 추후 다룰 DriveKick과 같은 결의 패턴. `dribble`(핸들러 돌파) 비트를 추가하고, **그 비트가 진행되는 동안 스크리너는 동시에 팝아웃 목적지로 이동**(Phase 1부터 써온 "온볼 이동 중 오프볼도 동시에 목표 스팟으로" 패턴 그대로 재사용, 새 병행 처리 로직 불필요).

**커버리지(drop/hedge/blitz) — 순수 시각 장식**: PnR_Handler/Roll과 동일 원리 — catch 시점에 얼마나 오픈으로 보이는지만 다름.

**골격 (최종)**:
```
setup(탑 스크린 위치) → screen(스크리너 arrive+hold, 짧게)
  → dribble(핸들러 돌파 — 이 비트 동안 스크리너는 동시에 subZone 기반 탑/좌45/우45로 팝아웃 이동)
  → pass(핸들러→팝한 스크리너, 킥아웃)
  → catch → shoot(캐치앤슛 리듬 — shotType='CatchShoot' 고정과 일치, 커버리지별 컨테스트 시각 변주)
```

**새 BeatType 필요 여부**: 없음 — `screen`/`dribble`/`pass`/`catch`/`shoot` 전부 기존 primitive, "돌파 중 오프볼 동시 이동"도 이미 여러 번 쓴 패턴.

**오프볼 3명**: `FORMATIONS['PnR_Pop'].base`의 스페이서 3명 위치 그대로 정적 유지.

### 8-5. PostUp (포스트업) — 확정

기존 `FORMATIONS['PostUp']`(`courtPositions.ts:73-84`) 재사용 — Rim/Paint/Mid `zoneOverrides` 이미 존재.

**PBP 확인 사항**: `playTypes.ts:328-346`에서 `actor=postScorer`, `secondaryActor=entryPasser`(주석 "엔트리 패스를 제공한 선수") — Iso(§8-1)와 완전히 같은 **진입 패스 구조**(패서→액터, 액터가 직접 마무리). `possessionHandler.ts` 전체 확인 결과 **킥아웃/패스 분기 없음**(더블팀에 막혀 다른 선수가 대신 득점하는 경로 존재 안 함) — actor는 항상 포스트업 선수 본인으로 고정.

`assistOdds['PostUp']=0.55`(§8-0) → `isAssisted` 분기 필요(Iso와 같은 "자력 생성 가능" 그룹):
1. **`isAssisted === false`**: `dribble`(포스트업 무브 — 백다운/드롭스텝 등) → `shoot`(anchor)
2. **`isAssisted === true`**: `pass`(엔트리패서→액터, 엔트리 패스) → `catch` → `dribble`(포스트업 무브) → `shoot`(anchor)

**shotType별 동작 구분 (`resolveFinish()` 확인 결과, `playTypes.ts:95-169`)**:

| Zone | 가능한 shotType | 동작 |
|---|---|---|
| Rim | `Dunk`(vertical/strength 임계치), `Layup`(항상 가능) | 돌파 — 골밑으로 파고드는 연속 움직임 |
| Paint | `Floater`(closeShot≥80), `Hook`(post/roll 전용, height≥208), `Jumper`(짧은 페인트 점퍼) | 컨테인드 포스트 무브 — 백다운/드롭스텝/업앤언더, 큰 이동 없음 |
| Mid | `Jumper` (고정) | 페이스업 후 점퍼 |

**알려진 한계 — 페이더웨이 미드레인지 (향후 고도화 항목, 사용자 확정)**: `resolveFinish()`에 `Fadeaway`(post 전용, 엘리트 포스트 기술 요구, L145-152) 로직이 이미 있으나, `PostUp`의 실제 호출부(`playTypes.ts:338-345`)가 Mid일 때 `resolveFinish()`를 안 부르고 `shotType:'Jumper'`로 하드코딩 — 사실상 도달 불가능한 죽은 코드. **지금 단계(기본 틀)에서는 Mid를 전부 `Jumper`로 통일**, 페이더웨이 구분은 추후 고도화 시 `resolveFinish(actor, 'post', sliders, 'Mid')` 호출로 교체(엔진 한 줄 수정)해서 해결.

**더블팀 시각 변주**: Iso와 동일 원리 — `dribble`(포스트업 무브) 구간에 수비 강도 슬라이더 기반으로 헬프 수비수가 몰리는 시각, 결과에 영향 없음(액터는 어느 분기든 항상 본인이 마무리).

**골격 (최종)**:
```
[isAssisted] pass(엔트리패서→액터) → catch
  → dribble(포스트업 무브 — 백다운/드롭스텝, 더블팀 시각 변주)
  → shoot(anchor — Rim/Paint는 zone별 연속 동작, Mid는 페이스업+Jumper 고정)
```

**새 BeatType 필요 여부**: 없음 — 전부 기존 primitive.

**오프볼 3명**: `FORMATIONS['PostUp'].base`의 스페이서 3명 위치 그대로 정적 유지.

### 8-6. CatchShoot (캐치앤슛) — 확정 (2026-07 갱신: 3점 전용 고정)

기존 `FORMATIONS['CatchShoot']`(`courtPositions.ts:85-91`, 단일 좌표 28,8) 재사용.

**[2026-07] PBP 확인 사항 — 3점 전용으로 고정됨**: `playTypes.ts`의 `case 'CatchShoot':`에서 이제 `preferredZone: '3PT'`를 항상 고정 반환한다(`PnR_Pop`과 동일 패턴). 실제 현대 농구의 "catch-and-shoot"(캐치 후 즉시 점퍼) 개념과 맞추고, 드라이브&풀업 계열 플레이타입(Cut/DriveKick/PnR_Roll 등)과 판정 로직이 겹치는 걸 줄이기 위한 결정. 원래의 4존 분기(아래 "이전 설계" 참고)는 `selectZone`/`resolveFinish` 호출째로 주석 처리만 해서 남겨뒀다 — 삭제 아님.

`assistOdds['CatchShoot']=0.97`(§8-0) — PnR_Roll/Pop과 같은 이유(정의상 패스 필수)로 **`isAssisted` 분기 불필요, 항상 패스 포함.** (이 부분은 3점 고정과 무관하게 그대로 유효.)

**설계(현재)**:
- 슈터는 anchor 좌표(실제 슛 지점)에 바로 서 있음 — 스탠딩 스팟업이라 서 있는 곳이 곧 슛 지점, PnR_Handler식 "스크린 위치→재배치" 개념 불필요.

**골격 (현재)**:
```
setup(슈터 위치 — anchor 좌표 그대로) → pass(패서→슈터) → catch → shoot(그 자리에서 즉시)
```

**새 BeatType 필요 여부**: 없음 — 전부 기존 primitive.

**오프볼 3명**: `FORMATIONS['CatchShoot'].base`의 스페이서 3명 위치 그대로 정적 유지.

**이전 설계 (Rim/Paint 펌프페이크→드라이브 분기, 참고용)**: 실제 엔진에서는 더 이상 나오지 않지만, `choreographyGenerator.ts`의 `generateCatchShoot()`에는 `isDrive` 분기가 코드 그대로 남아있다 — 삭제하지 않은 이유는 이 함수가 실시간 게임 루프(`possessionHandler.ts`)에 아직 연결돼 있지 않고, 오직 물리 샌드박스(`MotionSandboxPanel.tsx`)의 수동 `PossessionResult` 합성(`sandboxBuilder.ts`)만 소비하기 때문 — 샌드박스는 `playTypes.ts`를 거치지 않고 subZone을 직접 골라 zone을 정하므로, 관리자가 샌드박스에서 CatchShoot + `zone_rim`/`zone_paint`를 수동으로 골라 이 분기를 여전히 테스트해볼 수 있다. 당시 설계:
- 슈터는 퍼리미터(3점 라인 부근, `FORMATIONS['CatchShoot'].base` 28,8 재사용)에서 캐치 → 펌프페이크 후 골밑으로 드라이브(`dribble`) → `resolveFinish` 기반 마무리(PnR_Roll·PostUp과 같은 shotType별 동작 구분 재사용: Dunk/Layup=연속 동작, Floater/Hook 등은 컨테인드 무브)
```
setup(퍼리미터 스팟업) → pass → catch → dribble(펌프페이크 후 드라이브) → shoot(drive-finish 동작, shotType별)
```

### 8-7. Cut (컷) — 확정

기존 `FORMATIONS['Cut']`(`courtPositions.ts:92-102`) 재사용 — 패서(screenPartner 슬롯, 30,20)는 거의 고정, 컷터(ballHandler 슬롯)만 Rim(7,28)/Paint(12,30)로 이동. Mid는 별도 좌표 없어 `base`(8,30) 그대로 사용.

**PBP 확인 사항**: `playTypes.ts:367-384`에서 `actor=컷터`(`driver+offBallMovement` 아키타입), `secondaryActor=패서`(connector). Zone은 Rim/Paint/Mid만(3점 배제 — 컷은 골밑을 향한 움직임이므로 당연). Mid는 `shotType:'Pullup'`(고정) — 컷하다가 완전히 뚫지 못하고 짧은 풀업으로 전환하는 그림.

**킥아웃 경로 없음 확인**: `possessionHandler.ts` 전체 검색 결과 Cut 관련 코드는 전부 확률 보정용(패싱레인 스틸 대상 L137·드리블플레이 턴오버 리스크 L221·playType 선택 가중치 L339·Skywalker 아키타입 체이스다운 블록 보너스 L764) — `actor`를 바꾸는 코드 없음. PnR_Handler(§8-2)·PostUp(§8-5)와 동일하게 **컷터가 항상 직접 마무리**하거나 다른 결과(턴오버 등)로 끝남.

`assistOdds['Cut']=0.95`(§8-0) — PnR_Roll/Pop/CatchShoot와 같은 이유(백도어 컷 자체가 정의상 타이밍 맞춘 패스 필요)로 **`isAssisted` 분기 불필요, 항상 패스 포함.**

**구조 — PnR_Roll과 거의 동일(스크린만 없음)**: 컷터가 이동 중(골밑으로 컷인)에 패스를 받는다는 점에서 PnR_Roll의 리드패스 메커니즘을 그대로 재사용. 컷터의 시작 위치는 `FORMATIONS['Cut'].base.spacers` 3자리 중 하나(오프볼 스페이싱 대형에서 한 명이 컷을 위해 이탈하는 그림) — 새 좌표 불필요.

**골격 (최종)**:
```
setup(컷터는 스페이서 슬롯 중 하나에서 시작, 패서는 볼 소유 대기)
  → hold(패서 타이밍 보기) + 동시에 컷터가 골밑 방향으로 컷 이동
  → pass(패서→컷터, 컷 중 캐치 시점 미래위치 조준 — PnR_Roll의 리드패스와 동일 원리)
  → catch(이동 중 attachToCarrier, 매 틱 자동 갱신)
  → shoot(Rim/Paint는 연속 피니시 동작, Mid는 Pullup)
```

**새 BeatType 필요 여부**: 없음 — 전부 기존 primitive.

**오프볼 3명**: `FORMATIONS['Cut'].base`의 스페이서 중 컷터 출발점을 제외한 나머지 위치 그대로 정적 유지.

### 8-8. Handoff (핸드오프) — 확정

기존 `FORMATIONS['Handoff']`(`courtPositions.ts:104-113`) 재사용 — 빅맨(screenPartner, 20-22 근처)과 슈터(ballHandler)가 가까이 배치, 슈터 위치만 Rim(8,22)/Mid(20,18)/3PT(28,15)로 zone별 이동.

**PBP 확인 사항**(`playTypes.ts:385-404`): `actor=슈터`(spacer+driver*0.5), `secondaryActor=big`(screener 아키타입) — 주석 "Shooter getting ball from Big"으로 방향 확정: **빅맨이 볼을 갖고 있다가 슈터가 다가가서 건네받음.** `hoZone = selectZone(['3PT','Mid','Paint','Rim'], ...)`으로 CatchShoot(§8-6)과 동일한 4존 구조. `possessionHandler.ts` 확인 결과 액터가 바뀌는 분기 없음(`openDetectionMod`, L636-640은 히트레이트 보정일 뿐) — Iso/PnR_Handler/PostUp/Cut과 같은 한계, **진짜 킥아웃 경로는 없음.**

**핵심 — 핸드오프 직후 액션까지 이미 한 세트로 결정됨**: `resolvePlayAction()`이 핸드오프 시점에 zone·`shotType`까지 한 번에 결정(`playTypes.ts:390-403`) — "받은 다음 뭘 할지"가 별도 판단 없이 애초에 하나의 묶음으로 나옴. 안무는 이 결과를 자연스러운 동작으로 풀어내기만 하면 됨:

| Zone | shotType | 동작 |
|---|---|---|
| Rim | `Dunk`(조건부)/`Layup` | 핸드오프 직후 드라이브 → 연속 피니시 |
| Paint | `Floater`/`Jumper`(짧은 페인트 점퍼) | 핸드오프 직후 드라이브 → 컨테인드 마무리 |
| Mid | `Jumper`(고정) | 핸드오프 모멘텀으로 이어지는 풀업 점퍼 |
| 3PT | `CatchShoot`(고정) | 즉시 캐치앤슛 |

CatchShoot(§8-6)과 거의 동일한 카탈로그, **Hook만 빠짐**(`resolveFinish()`가 `context:'drive'`를 쓰는데 Hook은 `'post'`/`'roll'` 전용이라 — Handoff·CatchShoot·Cut 공통).

**핵심 — 핸드오프는 `pass`가 아니라 근접 전이(carrier 전환)**: 두 선수가 붙어 있는 순간 공이 손에서 손으로 넘어가는 것이라 탄도 비행 불필요. `attachToCarrier(ball, 빅맨)` → 접점에서 `attachToCarrier(ball, 액터)`로 **캐리어만 바꿔치기** — 새 물리 함수 불필요, 기존 `attachToCarrier()` 재사용 + `handoff`라는 BeatType 레이블만 신규(§4-0에서 "공백"으로 표시했던 게 실제로는 새 primitive가 아니라 레이블만 필요했던 것으로 확인됨).

**"패스"는 순수 시각 장식으로만 가능**: 진짜 킥아웃은 PBP 데이터에 없으므로, 페이크 패스 동작이나 오프볼 팀메이트가 같이 컷하는(볼은 안 감) 정도의 서사적 장식만 추가 — 결과에 영향 없음.

**골격 (최종)**:
```
setup(빅맨은 엘보우/윙에서 볼 소유 대기, 액터는 스페이서 슬롯에서 시작)
  → dribble(액터가 빅맨 쪽으로 접근 — 빅맨은 attachToCarrier로 볼 유지)
  → handoff(접점에서 캐리어 전환: 빅맨→액터, 탄도 없이 즉시 이전)
  → [3PT] shoot(즉시 캐치앤슛 리듬)
  → [Mid] shoot(풀업 점퍼)
  → [Rim/Paint] dribble(핸드오프 직후 드라이브) → shoot(drive-finish, Hook 제외)
```

**새 BeatType 필요 여부**: `handoff`(레이블만 신규, 구현은 기존 `attachToCarrier()` 재사용) — 나머지 전부 기존 primitive.

**오프볼 3명**: `FORMATIONS['Handoff'].base`의 스페이서 위치 그대로 정적 유지.

### 8-9. Transition (속공) — 확정

기존 `FORMATIONS['Transition']`(`courtPositions.ts:115-124`) 재사용 — ballHandler 기본 위치가 이미 골밑 근처(12,25)로 깊고, Rim(7,25)/3PT(28,10) 오버라이드 존재.

**PBP 확인 사항**(`playTypes.ts:405-425`): `actor`=`spdBall+driver` 가중(가장 빠른 선수), `secondaryActor=outletPasser`(connector+passVision, 주석 "속공 패스를 제공한 선수"). `assistOdds['Transition']=0.78`(§8-0).

**새 엔진 갭 발견 — Mid 존 배제 (설계 반영, 구현 보류)**: `trZone = selectZone(['3PT','Paint','Rim'], ...)`에 **Mid가 빠져있음** — 실제 NBA에서도 흔한 "속공 중 수비가 따라붙어 미드레인지 풀업으로 마무리"가 현재 엔진에선 아예 불가능. 다행히 고치기 아주 간단함 — Rim/Paint가 아닌 모든 경우가 이미 `shotType:'Pullup'`으로 공통 처리되므로, 배열에 `'Mid'` 한 단어만 추가(`['3PT','Mid','Paint','Rim']`)하면 나머지 코드 변경 없이 자동으로 커버됨(§8-0/PostUp 페이더웨이 갭보다 훨씬 간단). 안무 설계에는 영향 없음 — Mid는 3PT와 완전히 같은 분기(`dribble` 추가 → `shoot` Pullup)를 타고 좌표만 다름.

**역할 방향 재검토 — `isAssisted` 분기 필요 (Iso/PostUp 그룹, "항상 패스" 그룹 아님)**: 처음엔 Roll/Pop/CatchShoot/Cut/Handoff처럼 "아웃렛 패스가 정의상 필수"라고 판단했으나 정정됨 — 실제 속공은 두 갈래: (1) 스틸/리바운드를 잡은 선수 본인이 발이 빠르면 그대로 직접 몰고 올라감(패스 없음), (2) 다른 선수가 잡고 아웃렛을 던짐. `secondaryActor`가 항상 배정되는 것과 무관하게 Iso/PostUp과 같은 이유로 액터가 자력으로(패스 없이) 볼을 가질 수 있음 — `isAssisted`(§8-0)로 분기.

**§6-9(수비 리바운드)와의 연결**: 이 분기는 이미 §6-9에서 다룬 "누가 전개하는가"(리바운더=핸들러면 즉시, 아니면 릴레이)와 같은 원리 — 수비 리바운드 직후 possession이 `playType==='Transition'`으로 이어지는 경우, 이 골격이 §6-9의 "일반 playType 패턴" 자리에 정확히 들어감.

**골격 (최종)**:
```
[isAssisted === false] dribble(액터 본인이 스틸/리바운드 직후 바로 질주)
  → [Rim/Paint] shoot(drive-finish) / [3PT/Mid] dribble(몇 걸음 추가) → shoot(Pullup)

[isAssisted === true] pass(아웃렛패서→액터, 질주 중 미래위치 조준 — Cut/PnR_Roll의 리드패스 재사용)
  → catch(이동 중 attachToCarrier 자동 갱신) → dribble(질주 이어짐)
  → [Rim/Paint] shoot(drive-finish) / [3PT/Mid] dribble(추가) → shoot(Pullup)
```

**새 BeatType 필요 여부**: 없음 — 전부 기존 primitive, 리드패스 메커니즘도 §8-3/8-7에서 이미 확정된 것 재사용.

**오프볼 3명**: `FORMATIONS['Transition'].base`의 스페이서 3명 — 정적 클리어아웃이 아니라 **같이 질주하는 팀메이트(러닝 레인)**로 해석, target snapshot으로 이동시키는 기존 메커니즘 그대로 적용(새 로직 불필요).

### 8-10. Putback (풋백) — 확정, §6-9 참조

기존 `FORMATIONS['Putback']`(`courtPositions.ts:127-132`) 재사용 — ballHandler(=actor)가 골밑(7,26)에 고정, `zoneOverrides` 없음(항상 Rim).

**PBP 확인 사항**(`playTypes.ts:426-437`): `actor`=`reb*0.6+ins*0.4` 가중(리바운드+인사이드 능력). **`secondaryActor` 자체가 없음** — 12개 playType 중 유일하게 패서/스크리너 역할이 아예 없는 완전 솔로 액션(`assistOdds['Putback']=0.10`, §8-0 중 최저치와 일치). `resolveFinish(actor,'putback',sliders)`도 Floater/Hook/Jumper/Pullup/Fadeaway 전부 `context!=='putback'`·`'post'`/`'roll'`/`'drive'` 전용 조건에 걸려 제외됨 — **`Dunk`(조건부) 또는 `Layup`만 가능.**

**결정적 확인 — 풋백은 오직 공격 리바운드 직후로만 발생**: `possessionHandler.ts:302-309`에서 `Putback`은 `state.shotClock===14`(NBA 룰상 공격 리바운드 직후에만 세팅되는 값)일 때만 후보에 오름 — 일반 playType 가중치 풀에서 독립적으로 선택되는 경로 없음. 즉 **§6-9(공격 리바운드)에서 이미 설계한 "`playType==='Putback'`이면 `setup`→`shoot` 직행" 골격이 정확히 맞았음이 확정됨.**

**골격**: §6-9 그대로 — `setup`(리바운드 확보, rebounder=anchor) → `shoot`(Dunk 또는 Layup, 골밑에서 즉시).

**새 BeatType 필요 여부**: 없음.

**오프볼 4명**: 특별한 역할 없음 — 리바운드 컨테스트 대형에서 골밑 주변에 머무는 정도(정적).

### 8-11. OffBallScreen (오프볼 스크린) — 확정

기존 `FORMATIONS['OffBallScreen']`(`courtPositions.ts:134-144`) 재사용 — 슈터(ballHandler, 28,12) + Mid(22,15)/3PT(30,10) 오버라이드.

**PBP 확인 사항**(`playTypes.ts:438-468`): 처음으로 **역할이 3명(액터/패서/스크리너)으로 분리**되는 playType — `actor=슈터`(spacer+offBallMovement+speed), `secondaryActor=passer`(handler+connector, 어시스트 담당), **`screener`가 별도 필드**(screener 아키타입 가중, `actor.playerId` 제외).

**새 엔진 갭 발견 — `screener` 필드가 `PossessionResult`까지 도달 못 함 (설계 반영, 구현 보류)**: `resolvePlayAction()`이 만드는 `PlayContext.screener`가 `possessionHandler.ts:368`에서 로컬로만 쓰이고(`identifyDefender()`에 전달돼 `screenerDefender`—스크리너의 수비수—계산에만 사용, L374-375) 최종 반환 객체엔 실리지 않음. `PossessionResult` 타입(`pbpTypes.ts`) 전체 검색 결과 `screener` 필드 없음 — `computeCourtPositions()`(`courtPositions.ts:265`)도 destructure 안 함. FORMATIONS 주석엔 "screenPartner=스크리너"라 적혀 있지만 실제 코드는 그 슬롯에 `assister`(=패서)를 넣음 — **진짜 스크리너 신원은 현재 어디에도 안 남음.**

**필요한 변경**: `PossessionResult`에 `screener?: LivePlayer`(또는 `screenerId?: string`) 필드 추가, score/miss 등 관련 반환 지점에 포함. 이 필드가 생기면 안무 레이어는 자유 배정 없이 `result.screener`를 스크린 역할의 실제 anchor로 사용 가능.

**4/5번이 자연히 보장되는 이유**: `screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId)` — 스크린 세우는 능력(screener 아키타입)은 설계상 빅맨(PF/C)이 높게 나오는 능력치라, PBP가 실제로 고른 스크리너는 이미 대체로 4/5번일 가능성이 높음. 즉 엔진 갭만 메우면 별도의 "포지션 기반 필터" 없이 `result.screener`를 그대로 쓰면 자연스러운 그림이 나옴.

**결과 카탈로그 — Handoff(§8-8)와 완전히 동일** (둘 다 `resolveFinish(actor,'drive',...)` 사용):

| Zone | shotType | 동작 |
|---|---|---|
| Rim | `Dunk`(조건부)/`Layup` | 스크린 컬 후 드라이브 → 연속 피니시 |
| Paint | `Floater`/`Jumper`(짧은 페인트 점퍼) | 드라이브 후 컨테인드 마무리 |
| Mid | `Jumper`(고정) | 페이스업 점퍼 |
| 3PT | `CatchShoot`(고정) | 즉시 캐치앤슛 |

Handoff와 마찬가지로 `context:'drive'`라 Hook 제외. `assistOdds['OffBallScreen']=0.95`(§8-0) — Cut/Handoff와 같은 "항상 패스" 그룹, `isAssisted` 분기 불필요(슈터가 자력으로 볼을 가질 수 없는 구조).

**골격 (최종, Cut + 스크린 경유)**:
```
setup(슈터는 스페이서 슬롯, 스크리너는 result.screener 기반 실제 배치, 패서는 볼 소유)
  → screen(스크리너 arrive+hold, §8-2 재사용)
  → dribble/cut(슈터가 스크린을 타고 도는 움직임)
  → pass(패서→슈터, 컬 중 캐치 시점 미래위치 조준 — PnR_Roll/Cut 리드패스 재사용)
  → catch(이동 중 attachToCarrier 자동 갱신)
  → [3PT] shoot(즉시) / [Mid] shoot(Jumper) / [Rim/Paint] dribble(드라이브) → shoot(drive-finish, Hook 제외)
```

**새 BeatType 필요 여부**: 없음 — `screen`(§8-2)·리드패스(§8-3/8-7)·zone별 shotType 분기(§8-6/8-8) 전부 기존 것 재사용.

**오프볼 나머지**: `FORMATIONS['OffBallScreen'].base`의 스페이서 위치 그대로 정적 유지(스크리너·패서 제외 나머지 2명).

### 8-12. DriveKick (드라이브 킥아웃) — 확정 — 12개 playType 전부 완료

기존 `FORMATIONS['DriveKick']`(`courtPositions.ts:145-152`) 재사용 — 슈터(ballHandler, 28,8 윙 3점) + 드라이버(screenPartner, 14,25 페인트 근처).

**PBP 확인 사항 — 12개 중 가장 독특한 구조**(`playTypes.ts:469-496`): `zone` 결과에 따라 **액터 자체가 바뀜**:
```ts
const actor = pickWeightedActor(p => p.archetypes.spacer + p.attr.out * 0.3);      // 후보 슈터
const driver = pickPasser(p => p.archetypes.driver + p.archetypes.handler * 0.3, actor.playerId);
const dkZone = selectZone(['3PT','Mid','Paint','Rim'], actor, sliders);
if (dkZone === 'Rim' || dkZone === 'Paint') {
    // 드라이버가 직접 마무리 → actor를 driver로 교체, secondaryActor 없음(어시스트 없음)
    return { playType, actor: driver, preferredZone: finishZone, shotType, ... };
}
// 3PT/Mid: 원래 슈터가 킥아웃 받아 마무리
return { playType, actor, secondaryActor: driver, preferredZone: dkZone, shotType: dkZone==='3PT'?'CatchShoot':'Jumper', ... };
```
- **Rim/Paint**: 드라이버가 킥아웃 없이 직접 마무리 → `actor`가 드라이버로 교체, `secondaryActor` 자체가 없음(Putback처럼 완전 솔로)
- **3PT/Mid**: 원래 슈터가 `actor` 유지, `secondaryActor: driver`(킥아웃 어시스트) — 진짜 드라이브앤킥

**`zone` 필드 하나로 서사 분기가 결정론적으로 확정됨** — 새 데이터 불필요, 이미 있는 `PossessionResult.zone`만으로 두 갈래 구분 가능.

**FORMATIONS 좌표 갭 (엔진 갭 아님, §4-3 확장 작업 범위)**: `zoneOverrides` 없음 — Rim/Paint 갈래에서 액터(드라이버로 교체됨)가 실제로는 골밑 근처에 있어야 하는데 고정 좌표(28,8, 윙 3점)를 쓰면 위치가 틀어짐. PBP 엔진 수정이 아니라 **우리가 §4-3 확장으로 Rim/Paint용 좌표(다른 드라이브 마무리 playType처럼 골밑 근처, 대략 7-12,28-30 범위) 직접 추가** 필요.

**골격 — 두 갈래**:

**Rim/Paint (드라이버 직접 마무리)**: Cut/Iso식 솔로 드라이브.
```
dribble(드라이버 돌파) → shoot(drive-finish, Hook 제외)
```
원래 슈터 후보는 그냥 일반 스페이서로 처리.

**3PT/Mid (진짜 드라이브앤킥, PnR_Pop§8-4의 "돌파→킥아웃" 패턴 재사용)**: 슈터가 이미 스팟업 고정이라 PnR_Pop의 팝처럼 이동할 필요 없어 더 단순.
```
setup(슈터는 윙/코너 스팟업 고정, 드라이버는 페인트 근처 시작)
  → dribble(드라이버 돌파 — 슈터는 계속 스팟업 유지)
  → pass(드라이버→슈터, 킥아웃) → catch
  → shoot([3PT] 즉시 캐치앤슛 / [Mid] Jumper)
```

**새 BeatType 필요 여부**: 없음 — 전부 기존 primitive 재사용.

**오프볼 나머지**: `FORMATIONS['DriveKick'].base`의 스페이서 위치 그대로 정적 유지.

---

## 10. 수비 AI 설계

모션 샌드박스(어드민 물리 랩 확장 — 전술/로스터 지정, playType 시퀀스 편집, 수비 토글, 디렉터 컷 방식으로 결과 수동 지정. 설계 착수 전 단계, 별도 섹션 예정) 요구사항 중 "수비 토글" 논의 과정에서 파생된 새 축. 지금까지(§6/§8) 만든 건 전부 **공격 5명 전용 안무(Reel)**였고 수비는 손대지 않았다. 수비는 공격과 근본적으로 다른 접근이 필요하다는 게 이번 논의의 결론이다.

### 10-1. 수비는 "안무"가 아니라 "AI" — 그런데도 §1-3 Reel 원칙과 충돌하지 않는 이유

> 사용자 코멘트: "수비는 매 플레이타입별로 안무를 설정하지 않고, 미리 설정된 수비 대전제에 따라서 인공지능대로 움직여야 할 것 같아. ... 수비는 안무를 제작하기보다, 인공지능을 만드는 것이 더 맞다고 생각해."

**공격과 수비의 근본적 차이**: 공격은 PBP가 이미 결과(누가 슛하는지, 성공/실패)를 확정해놨기 때문에, 실시간으로 "판단"하는 척을 해도 실제로는 아무것도 못 바꾸는 연극이라 §1-3에서 라이브 판단 루프를 기각하고 사전 계산(Reel)으로 확정했다. 반면 **수비는 PBP가 궤적을 정해준 게 없다** — `defender`/`isSwitch`/`pnrCoverage`/`isZone`처럼 몇 개의 "최종 사실"만 anchor이고, 매 순간 어디 서 있는지는 처음부터 전부 free 영역이다. 그래서 수비는 진짜로 "판단"하는 알고리즘이 필요하다.

**그럼에도 §1-3과 충돌하지 않는 이유**: "AI"는 매 물리 틱(1/60s)마다 다시 계산하는 진짜 실시간 런타임 루프가 아니라, **공격 Reel의 각 비트마다(이미 다 알고 있는 미래 스냅샷들에 대해) Reel 생성 시점에 한 번에 계산해서 수비 Reel도 같이 굽는 것**이다. 알고리즘 자체는 "위협 인지 → 판단 → 재배정"이라는 지능적 절차를 거치지만, 계산 시점은 공격과 동일하게 possession 결과 확정 시점 1회뿐이다 — L5 경계(§4-5)·재현성(§4-2의 시드 기반)·"매 틱마다 재계산하는 라이브 루프 아님"이라는 §1-3의 핵심 제약을 그대로 유지한다.

### 10-2. 재사용 가능한 기존 수비 위치 계산 시스템

`identifyDefender()`(`possessionHandler.ts:17-110`)와 `computeCourtPositions()`의 수비 섹션(`courtPositions.ts:329-465`)에 이미 상당히 정교한 시스템이 있다 — 지금은 **포제션당 1회(최종 스냅샷)만** 호출되는데, 이걸 매 비트 재호출하는 방향으로 확장한다.

| 기능 | 함수 | 슬라이더 입력 |
|---|---|---|
| 존 디펜스 배치 | `ZONE_23` 5슬롯(가드2/포워드2/센터1), 볼사이드/약사이드 시프트 | `helpDef`(시프트 폭), `defIntensity`(전진 정도) |
| 온볼 수비 거리 | `computeDefPos(공격수위치, basketX, onBallOffset)` | `defIntensity` (4.5ft 널널~1.5ft 타이트) |
| PnR 스크리너 수비 | `computePnrDefPos(스크리너위치, 핸들러위치, basketX, pnrCoverage, defIntensity)` | `pnrDefense`(drop/hedge/blitz) |
| 헬프 새그 | `computeDefPos()` + `applyHelpSag(defPos, 볼Y좌표, basketX, helpSagFactor)` | `helpDef` |
| 스위치 확률 | `switchFreq × 0.05`, 실패 시 봇치드 스위치(`(10-helpDef)×0.02`) | `switchFreq`, `helpDef` |

### 10-3. 수비 대전제 규칙 (확정)

컨테스트/클로즈아웃은 별도 비트가 아니라 규칙 1의 자연스러운 결과다(볼이 패스로 넘어가는 순간 온볼 수비수 타겟이 즉시 새 슈터로 바뀌고, `arrive()`가 거기까지 달려가는 움직임 자체가 클로즈아웃, `shoot` 비트에 이미 도착해 있는 게 컨테스트) — 사용자 확정.

| 규칙 | 내용 | 근거 |
|---|---|---|
| 1. 온볼 추적 | 매 비트, 현재 볼 핸들러 위치로 `computeDefPos()` 재계산 | 기존 함수 |
| 2. 헬프 새그 | 매 비트, 볼의 현재 Y좌표로 `applyHelpSag()` 재계산 | 기존 함수 |
| 3. 존/맨투맨 분기 | `result.isZone`으로 전체 알고리즘이 갈림(ZONE_23 vs computeDefPos) | 기존 함수 |
| 4. PnR 커버리지 | PnR류 playType의 스크린 인접 비트에서 스크리너 수비수만 `computePnrDefPos()` | 기존 함수 |
| 5. 스위치 | `result.isSwitch`가 true면 스크린/핸드오프 접점 비트부터 담당 수비수 교체 | §10-4 |
| 6. 로테이션(헬프 디펜스) | 위협 인지 + 재배정 알고리즘 — 규칙 2(단순 새그)로 부족한 부분 | §10-5 |

### 10-4. 스위치 발생 조건 (명확화)

`identifyDefender()`(`possessionHandler.ts:64,69`) 확인 결과, 스위치는 **`PnR_Handler`/`PnR_Roll`/`PnR_Pop`/`Handoff`/`OffBallScreen` 5개 playType에서만** 발생 가능(`switchFreq` 슬라이더 확률) — Cut처럼 스크린이 없는 playType은 애초에 스위치 대상이 아니다(실제 농구에서도 컷은 스위치 없이 쫓아가는 것과 일치).

**비트 타이밍 매핑**: PnR류·OffBallScreen은 `screen` 비트, Handoff는 `handoff` 비트가 접점이므로 그 비트부터 담당 수비수가 바뀐다. `result.isSwitch`/`isBotchedSwitch`는 이미 PBP가 확정한 anchor이므로 새 확률을 굴릴 필요 없이 그대로 적용.

### 10-5. 공간 인지 + 로테이션 알고리즘 (헬프 디펜스 심화)

> 사용자 코멘트: "수비수가 공간을 인지하고, 미시적인 의사결정을 할 수 있게 만들어야해. ... 수비수들이 어느 공간이 비었는지를 인지해야 하며, 누가 그 공간으로 움직여야하는지도 결정할 수 있어야 해."

기존 `applyHelpSag()`는 볼 Y좌표 쪽으로 전원이 균일하게 쏠리는 정도라, "어느 공간이 비었는지 인지 + 누가 메울지 결정"엔 부족하다 — 규칙 6은 새로 설계가 필요하다.

**알고리즘 구조 — 위협 스코어링 + 공간 인지 + 그리디 재배정** (타AI 제안 검토·정정 후 확정):

1. **위협도**(매 비트, 공격수 5명): `threat(공격수) = 골대와의거리 가중 × (1/거리) + 볼소유여부 가중 + 슛존 가치`
2. **오픈 정도**: `openness(공격수) = 현재 담당 수비수와의 거리 − 정상 커버리지 거리(onBallOffset/helpBaseOffset 기준)`
3. **위험도** = `threat × max(0, openness)` — 가장 높은 공격수가 "가장 위험하게 비어있는 공간"
4. **재배정(그리디)**: 나머지 수비수 중 "자기 담당의 위협도가 낮은"(빼도 안전한) 사람을 우선순위로, 위험 공간까지 거리가 가까운 사람을 선택해 재배정. 재배정된 수비수의 원래 담당은 새로운 "빈 공간" 후보가 되어 다음 비트에서 자연히 재평가됨(매 비트 새로 계산하므로 무한 연쇄 걱정 없이 자연 수렴).

**Bid(입찰) 공식** (경매 메타포는 이름만 차용, 실제로는 가중치 매칭):
```
Bid(수비수) = (helpDefIq 기반 가중치) / 목표지점까지_거리 − Penalty_leave
Penalty_leave = threat(이 수비수가 현재 담당하는 공격수)   // 1단계 함수 재사용, 별도 정의 불필요
```
`helpDefIq`는 실제 존재하는 능력치 — `possessionHandler.ts:839`의 헬프 블록 판정("D-4. Defensive Anchor: 스마트 로테이션 → 헬프 블락 확률 2배", `helper.attr.helpDefIq >= 92`)에 이미 쓰이고 있어 근거가 확실하다.

**임계값 = 기존 슬라이더 재사용**: `helpDef`(1-10, "Rotation speed & Paint packing")를 재배정 발동 위험도 임계값으로 사용 — 높으면 낮은 위험도에도 적극 로테이션, 낮으면 웬만큼 위험해야 담당을 벗어남. 새 슬라이더 불필요.

**타이밍 정정 (필수)**: 원안은 "매 틱(Tick)마다" 계산하는 라이브 루프였으나, 이는 §1-3(Reel은 possession 결과 확정 시점에 한 번에 생성) 원칙과 정면 충돌 — L5 경계·재현성·불필요한 연산 문제 발생. **알고리즘은 동일하게 유지하되, 계산 시점만 "매 비트, Reel 생성 시점에 1회"로 수정.** 이미 공격 Reel 전체(미래 궤적)를 알고 있으므로 "그 순간까지 기다렸다가" 계산할 이유가 없다.

**2차로 미룸 (사용자 확정)**: 타AI가 제안한 "X-아웃/중력중심 앵커"(한 수비수가 두 공격 위협의 중간 지점에 서서 양쪽을 동시에 견제 — "스플릿 더 픽") — 좋은 아이디어지만 지금은 "가장 위험한 빈 공간 하나에 가장 적합한 수비수 하나 재배정"까지만 하는 기본 로테이션을 먼저 검증하고, 기본이 안정된 뒤 얹는다(PostUp 페이더웨이 §8-5와 같은 "기본 틀 먼저" 원칙).

### 10-6. Anchor 정합성 — 스틸/블록 결과와 AI 판단의 충돌 여부 (해소됨)

**질문**: 스틸/블록은 PBP가 이미 결과를 확정하는데, 수비 AI가 "알아서 판단"한 결과가 그 anchor와 어긋나지 않는가?

**답: 충돌하지 않는다 — §1-2 Anchor/Free 프레임워크가 그대로 적용된다.** 스틸/블록은 실제로 두 갈래로 나뉜다:

- **온볼 결과** (`defender`가 그대로 크레딧 — 온볼 스틸, 온볼 블록): 규칙 1(온볼 수비수가 매 비트 볼 핸들러를 그대로 추적)이 이미 그 사람을 볼 앞에 세워두므로 **자동으로 충족, 편향 불필요.**
- **헬프 결과** (다른 수비수가 크레딧 — 패싱레인 스틸, 헬프/체이스다운 블록): §1-3의 "director bias"(특정 후보 점수를 인위적으로 밀어올려 항상 최고점이 나오게)를 §10-5의 Bid 공식에 적용 — possession 결과가 헬프 스틸/블록이면 크레딧된 그 수비수의 Bid를 관련 비트에서 인위적으로 높여서 경매가 "자연스럽게" 그 사람을 그 공간으로 보내도록 만든다.

**헬프 블록 실재 확인**: `possessionHandler.ts:827-851`("F. Help Defense Block")에 `finalDefender = helper`로 온볼 수비수가 아닌 다른 선수에게 블록이 크레딧되는 경로가 실제로 존재함을 확인 — `helper.attr.helpDefIq`를 이미 쓰고 있어 §10-5의 Bid 공식과 근거가 일치.

**판별 방법**: `result.defender`(또는 블록 크레딧 대상)가 규칙 1이 원래 배정했을 온볼 담당자와 같으면 편향 불필요, 다르면 헬프 플레이라 편향 필요 — 이것도 이미 있는 데이터만으로 판별 가능(새 필드 불필요).

---

## 12. 모션 샌드박스 UI/인프라 설계 (Phase 6b)

어드민 물리 랩(`PhysicsLabPage`)을 확장해서, 지금까지 설계한 모든 것(§4-5 `generateChoreography()`, §6 엔트리 시퀀스, §8 12개 playType, §10 수비 AI)을 admin이 직접 조립·재생하며 물리엔진을 세부 조정하는 도구.

### 12-1. 핵심 아이디어 — 합성 `PossessionResult` 빌더

실제 PBP RNG를 거치지 않는 **디렉터 컷 방식**(사용자 확정, §6b 논의) — admin이 playType/zone/성공여부/선수 배정까지 전부 직접 지정한 데이터로 `generateChoreography()`를 그대로 호출한다:

```ts
function buildSyntheticPossessionResult(step: SandboxStep, roster: { off: Player[], def: Player[] }): PossessionResult
```

기존 `simulatePossession()`의 확률 롤(`Math.random()`)들을 전부 건너뛰고, `PossessionResult` 모양의 객체를 직접 조립해서 `generateChoreography()`(§4-5)에 그대로 흘려보낸다 — Reel 생성 함수 자체는 실제 PBP 결과인지 합성 결과인지 구분할 필요가 없다(입력 타입만 맞으면 됨).

### 12-2. `SandboxStep` 데이터 모델 (확정)

```ts
interface SandboxStep {
    id: string;
    entry?: 'case1' | 'case2' | 'case3a' | 'case3b' | 'defReb' | 'offReb';  // §6, 선택(없으면 "정상 포제션"부터 시작)
    playType: PlayType;                     // §8의 12종 중 하나 (필수)
    subZone: 'zone_rim' | 'zone_paint' | 'zone_mid_l' | 'zone_mid_c' | 'zone_mid_r'
           | 'zone_c3_l' | 'zone_c3_r' | 'zone_atb3_l' | 'zone_atb3_c' | 'zone_atb3_r';
           // §8-2/8-4의 좌/우45·팝 목적지 결정에 필요 — zone(Rim/Paint/Mid/3PT)은 이 값에서 자동 유도, 해당 playType이 지원하는 subZone만 UI 필터링
    outcome: 'score' | 'miss' | 'turnover' | 'foul';
    isAssisted?: boolean;    // §8-0 영향받는 playType(Iso/PnR_Handler/PostUp/Transition)만 UI에 노출
    actorId: string;
    assisterId?: string;
    screenerId?: string;     // OffBallScreen 전용(§8-11)
    rebounderId?: string;    // outcome==='miss'일 때만
    durationSec?: number;    // 비워두면 실제 calculatePossessionTime() 재사용(전술 슬라이더 기반), 지정 시 override

    // 수비 토글 ON일 때만 카드에 노출 (§10)
    isZone?: boolean;              // §10-3 규칙3, 존/맨투맨 분기
    pnrCoverage?: 'drop' | 'hedge' | 'blitz';  // PnR류 playType일 때만 노출 — §8-2/3/4 시각 변주 + §10-2/3 수비 포지셔닝
    isSwitch?: boolean;            // 스크린 관여 playType(PnR류/Handoff/OffBallScreen)일 때만 노출 — §10-4
    isBotchedSwitch?: boolean;     // isSwitch===true일 때만 노출 — §10-4
}
```

**miss → 다음 스텝 리바운드 엔트리 강제 (확정)**: `outcome==='miss'`를 고르면 바로 다음 스텝의 `entry` 드롭다운이 `defReb`/`offReb` 2개로만 제한됨 — 농구 맥락상 자연스러운 순서만 허용, UI 드롭다운 필터링으로 처리(데이터 레벨 유효성 검증 불필요, 구현 단순화). 턴오버/파울도 유사한 제약을 걸 수 있으나 지금은 범위 밖 — 필요시 추후 추가.

### 12-3. 컴포넌트 구조

```
MotionSandboxPanel.tsx (PhysicsLabPage 4번째 탭)
├── 좌측: 설정 패널
│   ├── 팀 전술 슬라이더 (공격팀/수비팀 각각 — TacticalSliders 서브셋: 공격=pace/ballMovement/playStyle/insideOut/offReb/fullCourtPress, 수비=defIntensity/helpDef/switchFreq/zoneFreq/pnrDefense)
│   ├── 수비 토글 (시퀀스 전체 ON/OFF — 확정, 스텝별 아님)
│   ├── 로스터 선택 (공격 5명 + 수비 5명, `meta_players` 조회 — `PbpGameModePanel`/`QuickPlayPage`의 기존 fetch 패턴 재사용)
│   └── 시퀀스 편집기 — 단순 리스트 + 추가/삭제/순서변경 (확정)
│       └── 스텝 카드: entry/playType/zone/outcome/isAssisted(해당 시)/actor·assister·screener·rebounder 선수 선택/duration
└── 우측: 재생 패널
    ├── `PhysicsCourtView` 재사용 (기존 컴포넌트, 수정 불필요)
    └── 재생/일시정지/속도 컨트롤 — `PbpGameModePanel`/`ScriptedPlayPanel`과 동일 패턴, 현재 스텝/비트 인디케이터 추가
```

### 12-4. 데이터 흐름

```
SandboxStep[] (admin 편집)
  → 스텝마다 buildSyntheticPossessionResult(step, roster) → PossessionResult 모양 객체
  → generateChoreography(synthResult, duration, homeTeamId) → 공격 Reel (§4-5)
  → [수비 토글 ON] §10 수비 AI 생성 함수 → 수비 Reel 동시 생성
  → 스텝별 Reel들을 순서대로 이어붙여 하나의 재생 시퀀스로 concat
  → 기존 물리 코어(arrive/separation/containment)로 재생 — Phase 1부터 쓴 것 그대로, 수정 불필요
```

**스텝 간 전환**: 엔트리가 있는 스텝(§6)은 그 자체로 "새 시작"이라 전환에 문제없음. 엔트리 없이 바로 playType으로 이어지는 스텝은 이전 위치에서 자연스럽게 이어지는지 여부를 admin이 스스로 판단해서 엔트리 포함 여부를 고르게 함 — 자동 보정 로직은 만들지 않음(디렉터 컷 철학 유지, 불필요한 복잡도 회피).

---

## 13. 참고 파일 (핵심 경로)

- `services/game/engine/physics/` — 물리 코어 (L0 vec2 → L1 world → L2 entity → L3 integration → L4 steering → L5 adapter), `ballistics.ts`(공 모션)
- `components/physics-lab/` — `PbpGameModePanel`(실제 PBP 결과 재생, 텔레포트 버그 있음 — 탭 숨김, 코드는 보존) / `MotionSandboxPanel`(디렉터 컷 샌드박스, Phase 7~) / `useReelPlayback`(Reel 재생 훅) / `PlayerSearchSelect`(검색 가능한 선수 선택 콤보박스). `ManualModePanel`/`ScriptedPlayPanel`은 삭제됨(모션 샌드박스로 대체, 2026-07-21)
- `services/game/engine/pbp/liveEngine.ts` — `stepPossession()`, `StepResult`, `timeTaken` 계산 위치(L390), `_handleGameEnd()`(버저비터, L502)
- `services/game/engine/pbp/handlers/courtPositions.ts` — `computeCourtPositions()`, `FORMATIONS` 템플릿, `mirrorX()`, 수비 배치(존 `ZONE_23`/맨투맨 `computeDefPos`·`computePnrDefPos`·`applyHelpSag`, L329-465)
- `services/game/engine/pbp/handlers/visUtils.ts` — `recordShotEvent()`, 샷차트 좌표 생성
- `services/game/engine/pbp/possessionHandler.ts` — `identifyDefender()`(수비수/스위치/PnR커버리지 판정, L17-110), `calculateTurnoverChance()`(스틸/턴오버 판정, L122), 블록 처리(L730-853, 헬프 블록 L827-851)
- `services/game/engine/pbp/timeEngine.ts` — `calculatePossessionTime()`, 2-for-1 로직(L41-44)
- `services/game/engine/pbp/pbpTypes.ts` — `PossessionResult`, `ShotEvent`, `CourtSnapshot`, `GameState` 타입 정의
- `types/tactics.ts` — `TacticalSliders`(pace/ballMovement/playStyle/insideOut/offReb/fullCourtPress 등)
- `types/engine.ts` — `PlayType`(12종), `BoxTick`
- `utils/courtCoordinates.ts` — `generateShotCoordinate()`, zone별 좌표 생성 로직

---

## 14. 개발 진행 상황 (결정 로그)

이 섹션은 실제 코드 구현 단계에서 내려진 세부 결정을 시간순으로 기록한다 — 문서의 나머지 섹션이 "무엇을 만들 것인가"의 청사진이라면, 여기는 "만들면서 실제로 어떻게 정했는가"의 로그.

### 2026-07-21 — Milestone 2 착수: 케이스 1(우리 진영 베이스라인 인바운드 → 풀코트 전진 → CatchShoot)

Milestone 1(CatchShoot, Phase 7)은 하프코트 정적 배치에서 시작해 이동 거리·동시 이동 개체 수가 적어 물리 튜닝 표본으로는 부족하다는 판단 하에, §6-5 케이스 1을 CatchShoot 앞에 체이닝하는 것을 다음 슬라이스로 결정.

**결정 1 — 인바운더 배정**: 기본값은 spacer 풀에서 자동 배정(§6-5 원안), 단 샌드박스 UI에서 admin이 수동으로 override 가능. `SandboxStep.inbounderId`(optional) 신규 필드 — 비어있으면 자동, 채워지면 그 선수로 고정.

**결정 2 — 압박 강도 축(§6-5의 2번째 분기) 보류**: 이번 마일스톤은 "평상시 전진"만 구현. 하이프레셔 분기와 §6-6(`fullCourtPress` 실확률 반영)은 수비 AI(§10) 구현 시점으로 미룸 — 화면에 수비수가 없는 상태에서 "압박받는 연기"만 하는 건 근거가 약하고, 수비 AI가 붙으면 실제 수비 밀집도 기반으로 훨씬 자연스럽게 표현 가능해짐.

**결정 3 — "누가 전개하는가" 축(§6-5의 1번째 분기) 단순화**: 릴레이(빅맨이 받았다가 실제 핸들러에게 다시 패스) 분기는 이번 범위에서 생략. 인바운드 리시버를 항상 CatchShoot의 `assister`(어차피 프론트코트에서 슈터에게 패스하는 역할)로 고정해서, 엔트리 종료 시점에 CatchShoot의 시작 상태(어시스터가 볼을 들고 `passer` 위치)로 자연스럽게 이어지게 함. 릴레이 분기는 "누가 최고 핸들러인가"를 능력치로 판별하는 별도 로직이 필요해 향후 마일스톤으로 이연.

**구현 범위**: `pbpTypes.ts`(role 유니온에 `'inbounder'` 추가, `PossessionResult`에 `entry`/`inbounderId` 옵셔널 필드 추가) · `choreographyTypes.ts`(`SandboxStep.inbounderId` 추가) · `choreographyGenerator.ts`(`generateCase1Entry()` 신규, `generateChoreography()`에서 체이닝) · `sandboxBuilder.ts`(`entry`/`inbounderId` 전달) · `MotionSandboxPanel.tsx`(케이스 1 토글 + 인바운더 수동 지정 UI). PBP 엔진(`possessionHandler.ts` 등 확률 로직)은 변경 없음.

### 2026-07-21 — 안무 연속성 계층(Choreography Continuity Layer) 추가

케이스 1 실사용 테스트 중 발견: 엔트리(`resolveCase1Roles`)와 CatchShoot(`generateCatchShoot`)가 각자 독립적으로 "누가 어느 스페이서 슬롯을 맡을지"를 `onCourt` 배열 순서로 계산하다 보니, 두 릴이 이어지는 순간 선수들이 순간이동하듯 자리를 맞바꾸는 문제가 발생. 이건 case1↔CatchShoot 조합만의 문제가 아니라 앞으로 엔트리 케이스 2/3·리바운드·나머지 11개 playType이 서로 체이닝될 때마다 반복될 구조적 문제라, 범용 해법으로 해결.

**핵심 설계**: `actor`/`assister` 같은 "앵커" 역할은 정체성이 항상 고정돼 있어 원래 문제가 없음. 문제는 "스페이서 풀"처럼 누가 어느 슬롯을 맡아도 결과에 영향 없는 **자유 역할** 그룹뿐 — 여기에 한해 "직전 릴 종료 위치 ↔ 다음 릴이 요구하는 슬롯" 간 총 이동거리를 최소화하는 매칭을 적용.

**신규 파일**: `services/game/engine/pbp/handlers/choreographyContinuity.ts` — `assignNearestSlots(players, slots)`. 인원 6명 이하는 순열 전수조사로 최적해, 초과 시 그리디 폴백. 범용 유틸이라 케이스1→CatchShoot뿐 아니라 앞으로의 모든 체이닝 조합에 재사용 가능하도록 설계.

**연동**: `generateCatchShoot()`에 옵셔널 `predecessorPositions` 인자 추가(주어지면 `assignNearestSlots()`로 스페이서 슬롯 재배정, 없으면 기존 배열-순서 동작 그대로 — 하위호환). `generateChoreography()`의 케이스1 체이닝 분기에서 엔트리의 마지막 비트 위치를 `predecessorPositions`로 만들어 전달.

### 2026-07-21 — 가상 슈팅 포인트 기반 스페이서 배치

연속성 계층 적용 후에도 스페이서가 한쪽에 몰리는 문제가 남아있었음 — 원인은 "누가 어느 슬롯을 맡을지"가 아니라 슬롯 좌표 자체(`CATCH_SHOOT.spacers` 고정 3개)가 편중돼 있었기 때문. 사용자가 물리 랩에 새로 만든 좌표 피커(`CourtPointPicker.tsx`)로 10존×여러 후보 = 73개 "가상 슈팅 포인트"를 직접 코트에 클릭해서 확정, 다음 알고리즘으로 대체.

**신규 파일**: `services/game/engine/pbp/handlers/virtualShotPoints.ts` — `VIRTUAL_SHOT_POINTS`(10 subZone별 좌표 풀, 사용자 확정 73개), `pickFarthestPoint()`(최원점 그리디), `chooseSpacerTargets(insideOut, excludeZone, occupiedSeed)`(존 선택→포인트 선택 2단계). `insideOut` 슬라이더 → 아웃사이드 확률 변환은 `playTypeProfiles.ts`의 기존 `(slider-5)/5` 중앙 정규화 컨벤션 재사용. **의도적으로 비결정적**(Math.random() 사용) — 슬롯이 고정이면 패턴에 금방 익숙해진다는 문제 제기가 출발점이라, 매번 다른 배치가 목표.

**연동**: `generateCatchShoot()`에서 `CATCH_SHOOT.spacers`(고정 3좌표) 대신 `chooseSpacerTargets()`가 매 호출마다 새로 계산한 3좌표를 사용. 지난번 연속성 계층(`assignNearestSlots`)은 그대로 재사용 — "어디"(새 알고리즘)와 "누가"(기존 알고리즘)가 깔끔히 분리됨.

### 2026-07-21 — 케이스1↔CatchShoot 직행 경로 + 곡선 보정

사용자 피드백: 케이스1의 스페이서가 고정 중간 지점까지 뛰어간 뒤, CatchShoot 릴로 전환되면서 새로 계산된(랜덤) 목적지로 다시 방향을 트는 게 부자연스러움. 원인은 엔트리(`CASE1_ENTRY.paintAdvance` 등 고정 상수)와 CatchShoot(그때그때 새로 `chooseSpacerTargets()` 호출)가 서로 다른 목적지를 따로 계산했기 때문.

**해결**: `resolveCase1FinalDestinations(result)` 신규 — 엔트리 역할 배정(`resolveCase1Roles`) → 슈터 자리(`resolveShooterCatchPos`) → 스페이서 타겟(`chooseSpacerTargets`, 딱 한 번만 호출) → 각 오프볼 역할의 시작 위치 기준 최근접 매칭(`assignNearestSlots`)까지 한 번에 계산해서 4개 역할(inbounder/paint/cornerL/cornerR) 각각의 **최종 목적지**를 반환. `generateCase1Entry()`는 이제 이 목적지로 처음부터 직행하고, `generateCatchShoot()`는 같은 스페이서 타겟을 `spacerTargetsOverride`로 받아 재추첨하지 않음 — 릴이 바뀌어도 목적지가 안 바뀌니 재조정 구간 자체가 사라짐. `CASE1_ENTRY`의 `paintAdvance`/`cornerLAdvance`/`cornerRAdvance`/`wingAdvance` 고정 상수는 제거.

**곡선**: `curvedWaypoint(start, end)` — 직선 중점을 진행방향 수직으로 살짝(경로 길이의 12%, 최대 4ft) 오프셋. 엔트리의 마지막 긴 구간(옛 "advance" 비트, 2.2s)을 curve(1.3s, 경유점 목표) + final(0.9s, 진짜 목적지) 2비트로 분할해서 살짝 휘어지는 경로로 만듦.

### 2026-07-21 — 곡선 재설계: "이미 직행하다가 경유점으로 복귀" 버그 수정

위 곡선 구현을 실제로 재생해보니 선수들이 목적지 근처까지 갔다가 큰 원을 그리며 되돌아오는 증상이 발생. 원인: `setup`/`pass`/`catch` 비트(1.2초)가 이미 `finalDest`로 직행시키고 있었는데, 그 뒤 `curve` 비트가 **엔트리 시작 지점 기준으로 계산된 정적 경유점**으로 목표를 다시 바꿔버려서 — 이미 목적지를 향해 상당히 진행한 선수를 "아직 안 지나간 것처럼" 경유점으로 되돌려보내는 꼴이 됨. Reel은 사전 계산 방식이라 "재생 시점에 실제로 어디 있을지"를 알 수 없으므로, 경유점을 실시간 위치 기준으로 다시 계산하는 건 불가능.

**해결**: 목표 전환을 정확히 **한 번만**, 그것도 아직 속도가 안 붙은 아주 초반(0.45초 nudge 비트)에만 발생하도록 재구성. `nudge`(경유점, 0.45s) → `pass`/`catch`/`inbounderNudge`/`final`(전부 `finalDest`, 나머지 3초 가량 논스톱) — 되돌아가는 구간 자체를 제거. 인바운더도 같은 패턴(패스를 놓은 직후부터 시작되는 자신만의 짧은 nudge → final)으로 맞춤.

### 2026-07-21 — 케이스1 스페이서 스폰 위치를 베이스라인 쪽으로 이동 + 감속 방식 재작업

사용자 피드백 두 건을 함께 반영:

1. **감속(관성 루프) 문제 최종 해결**: `steering.ts`의 `arrive()`(힘 기반 감속)는 `combine()`의 force-dilution 문제로 세 번의 재시도(선형 ramp→댐핑 스프링→물리적 제동거리+efficiency derate) 끝에도 관성 루프를 완전히 못 없앰 → 코드는 삭제하지 않고 주석 처리로 비활성화, 호출부는 `seek()`(등속 추격)로 교체. 처음엔 도착 시 완전 정지(hard snap)로 바꿨는데 "뚝 끊기는" 느낌이 있다는 피드백 → `useReelPlayback.ts`/`PbpGameModePanel.tsx`에 `brakedVelocity()` 헬퍼 추가: 엔티티 자신의 실제 정지거리(`maxSpeed²/(2·decel)`) 안에서 `v=√(2·decel·거리)`(등가속도 곡선)로 매 틱 속도를 **직접 대입**(combine()의 force 예산을 안 타므로 dilution 문제 자체가 없음). 마지막 0.3ft만 정확한 좌표 착지용 하드 스냅.
2. **케이스1 스페이서 스폰 위치**: `CASE1_ENTRY.paintStart/cornerLStart/cornerRStart`가 하프코트 근처(x=55~58)라 인바운더(x=93.5)/리시버(x=82)보다 너무 앞서 보인다는 피드백 → 베이스라인 근처(x=85~88)로 이동. 이동 거리가 늘어난 만큼 `finalSnap` 비트 지속시간을 1.8s→3.2s로 연장.

모션 샌드박스 UI에 우측 "전술 설정" 탭 신규 추가(`TacticsSlidersPanel.tsx`의 공격 슬라이더 3그룹 재사용) — `buildSandboxTeamState()`의 기존 `sliderOverrides` 파라미터에 연결. 다만 현재 `chooseSpacerTargets()`가 실제로 참조하는 건 `insideOut` 슬라이더뿐이라 나머지 8개는 아직 시각적 조작만 가능.

### 2026-07-21 — 실제 엔진: 캐치앤슛 3점 전용 고정

사용자 판단: 캐치앤슛이 미드/페인트/림까지 가는 건 실제 현대 농구의 "catch-and-shoot" 개념과 안 맞고, 드라이브&풀업 계열 플레이타입(Cut/DriveKick/PnR_Roll 등)과도 판정 로직이 겹침 → `playTypes.ts`의 `case 'CatchShoot':`에서 `preferredZone: '3PT'`로 고정(`PnR_Pop`과 동일 패턴). 원래 4존 분기(`selectZone`+Rim/Paint 시 `resolveFinish(actor,'drive',...)`)는 삭제 없이 주석 처리로 보존.

**3중 미러 반영**: `services/game`/`server/src/shared`/`supabase/functions/_shared` 세 곳의 `playTypes.ts` 전부 동일하게 수정. 작업 중 별개의 기존 드리프트도 하나 발견·수정: `possessionHandler.ts:709`에서 `services/game`은 모든 zone에 대해 항상 `resolveDynamicZone()`을 호출하는데 `server`/`supabase`는 `preferredZone==='3PT'`일 때만 호출하고 나머지는 `undefined`(→ 박스스코어 기록 시점에 `resolveDynamicZone`을 한 번 더 별도 난수로 호출하는 중복 경로) — `services/game` 기준으로 통일. hitRate 계산에는 영향 없었음(해당 파라미터는 3PT일 때만 실제로 쓰임), 통계 분포도 무해했지만(같은 확률분포 재추첨이라 왜곡 없음) 3곳 로직 불일치 자체를 정리.

**후속 정리**: `choreographyGenerator.ts`의 `generateCatchShoot()` `isDrive`(Rim/Paint 펌프페이크→드라이브) 분기는 실제 엔진에서는 더 이상 안 나오지만, 이 함수가 라이브 게임 루프에 아직 연결 안 돼 있고 물리 샌드박스의 수동 `PossessionResult` 합성만 소비하므로(§8-6 참고) **삭제하지 않고 그대로 유지** — 샌드박스에서 CatchShoot+`zone_rim`/`zone_paint`를 수동 지정하면 여전히 테스트 가능. `components/dashboard/tactics/charts/ShotDistribution.tsx`의 `PLAY_ZONE_MAP['CatchShoot']` UI 근사치를 `{3pt:0.85, mid:0.15}` → `{3pt:1.0}`으로 갱신(§8-6도 동일하게 갱신).
