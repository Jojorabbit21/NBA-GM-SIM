# ZenGM vs NBA-GM-SIM 비교 분석

> 작성일: 2026-08-27
> 대상: `zengm-master/`(ZenGM/BBGM 오픈소스, basketball-gm.com 소스코드)와 NBA-GM-SIM 자체 코드베이스를 9개 영역으로 나눠 병렬 조사 후 종합.
> 목적: ZenGM의 검증된(10년+ 운영) 설계를 참고해 우리 서비스의 장단점을 짚고 벤치마킹 우선순위를 정리.

---

## 0. 두 프로젝트의 근본적 차이 (비교 전 전제)

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 배포 형태 | 완전 정적 사이트, 서버 없음 | React 클라이언트 + Supabase + Bun 서버(멀티용) |
| 저장소 | 브라우저 IndexedDB (로컬) | Supabase Postgres (클라우드) |
| 목표 | 싱글플레이 전용 (서버 자체가 없음) | 싱글 → **30인 동시접속 멀티플레이어**가 최종 목표 |
| 스포츠 | 농구/미식축구/야구/하키 4종 멀티스포츠 | 농구 전용 |
| 연혁 | 10년+ 운영, 수백만 유저 | 개발 중 |

이 차이 때문에 "ZenGM처럼 하면 무조건 좋다"고 볼 수 없는 영역이 있음(특히 저장 방식 — IndexedDB는 멀티플레이 동시성 문제를 해결 못 함). 아래에서는 영역별로 **구조적으로 이식 가능한 것**과 **목표가 달라 이식 불가능한 것**을 구분해서 짚는다.

---

## 1. 아키텍처 (UI/로직 분리, 반응성)

### ZenGM
- `src/worker`(게임 로직 전체)와 `src/ui`(React 렌더링)가 별도 **Web Worker**로 완전 분리. `promise-worker-bi`로 `[category, functionName, param]` 3-튜플 RPC 통신.
- `src/worker/api/index.ts`(5,400줄)가 모든 액션과 뷰 데이터 로딩의 단일 진입점. `runBefore({viewId, updateEvents, prevData})`가 `src/worker/views/*.ts`를 호출.
- **`updateEvents` 기반 선택적 재계산**: 각 뷰가 "이 이벤트가 아니면 재계산 안 함"을 스스로 판단(`if (updateEvents.includes("gameSim")) {...} else return undefined`). 시즌을 며칠씩 시뮬레이션해도 무관한 화면 데이터는 워커에서 계산조차 안 함.
- 자체 경량 라우터(react-router 미사용, 정규식 pushState 라우터 ~400줄).

### NBA-GM-SIM
- 싱글플레이: 순수 클라이언트 상태(React+Vite), 워커 스레드 분리 없음.
- 멀티플레이: `server/src/`(Bun 서버)가 로직을 담당하지만 `server/src/shared/engine/`에 클라이언트 엔진 코드를 **수동으로 미러링**(예: `services/game/engine/pbp/` ↔ `server/src/shared/engine/pbp/`) — CLAUDE.md에 "client/server 미러 쌍 변경은 반드시 둘 다 기록"이라는 별도 운영 규칙이 있을 정도로 동기화 부담이 존재.
- `hooks/useGameData.ts` 등 UI 훅이 직접 서비스 함수를 호출하는 구조로, 무거운 연산(시뮬레이션)이 메인 스레드를 막을 가능성이 있음(단, 클라이언트 경량 연산이라 체감은 아직 크지 않을 수 있음).

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 메인 스레드 절대 안 막힘, 로직/UI 계약이 RPC로 명확히 강제됨, `updateEvents`로 불필요한 재계산 원천 차단 | 서버 사이드 계산이 가능해 멀티플레이 신뢰성(치팅 방지, 동시성)에서 근본적으로 유리 |
| 단점 | 서버가 없어 멀티플레이 동시성/신뢰 불가(설계상 애초에 배제) | client/server 로직 미러링으로 인한 이중 유지보수 부담, 워커 분리가 없어 무거운 클라이언트 연산 시 UI 블로킹 리스크 |

### 벤치마킹 포인트
1. **`updateEvents` 패턴 이식**: 우리도 화면별로 "이 이벤트로 인해 재계산 필요한가"를 명시적으로 판단하는 계약을 만들면, 특히 멀티플레이 실시간 갱신(스케줄/스탠딩/로스터 화면 동시 열람) 시 불필요한 재조회를 줄일 수 있음.
2. **클라이언트 무거운 연산(예: 시즌 통째 시뮬레이션, 대량 선수 성장 계산)은 Web Worker로 분리**해 메인 스레드 블로킹 방지 — 현재 싱글플레이 경로에 특히 적용 가치가 큼.
3. client/server 미러 코드 이중화 문제는 장기적으로 "공통 로직을 한 곳에 두고 서버/클라이언트가 같은 모듈을 import"하는 구조(예: 순수 TS 패키지 분리, isomorphic 모듈)로 개선 여지 — 지금은 CLAUDE.md 규칙으로 수동 관리 중.

---

## 2. 영구 저장(persistence)

### ZenGM
- **`@dumbmatter/idb`**(Promise 기반 IndexedDB 래퍼) 사용. **meta DB**(리그 목록, 앱 전체 1개)와 **league DB**(`league{lid}`, 리그마다 완전히 독립된 DB)로 이원화.
- **인메모리 캐시 레이어(`Cache.ts`)가 핵심**: 리그를 열 때 players/teams/games 등을 메모리에 통째로 로드, 읽기/쓰기는 전부 메모리에서 처리하고 `_dirty` 플래그만 세움.
- **flush 시점**: 4초 자동 주기 + 명시적 시점(배치 시뮬 종료, 시즌 페이즈 전환, 리그 닫기). "매 경기마다" 디스크 쓰기 안 함 — 배치로 묶음.
- 마이그레이션: `openDB(name, version, {upgrade(db, oldVersion){...}})` 패턴으로 버전별 순차 마이그레이션 코드 누적.

### NBA-GM-SIM
- `services/persistence.ts`의 `saveCheckpoint()`가 Supabase `saves` 테이블에 `upsert(onConflict:'user_id')`로 통짜 상태(전술/로스터/트레이드블록/GM프로필/시즌번호 등) 저장. 컬럼 미존재 시 옵셔널 컬럼 제거 후 재시도하는 폴백 로직 존재.
- 저장 트리거는 `hooks/useGameData.ts` 등에서 산발적으로(~10곳) `saveCheckpoint()` 호출.
- `services/snapshotBuilder.ts`/`stateReplayer.ts`로 박스스코어 전체를 재생해 상태를 재구성(CLAUDE.md 설계: 사용자별 선수 스탯 테이블을 안 만들어 DB 부담 최소화).
- `services/multi/gameLeadersCache.ts`처럼 부분적 `localStorage` 캐싱은 있으나, ZenGM 수준의 "전체 리그 상태 인메모리 캐시 + 배치 flush" 계층은 없음.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 인메모리 캐시로 즉각적 읽기/쓰기, 배치 flush로 I/O 최소화, 리그별 DB 완전 격리 | 클라우드 저장이라 기기 이전/멀티 디바이스/멀티플레이어 공유 상태에 근본적으로 적합, `saves`+`user_game_results` 재구성 방식은 유저당 저장용량을 크게 절약 |
| 단점 | 로컬 저장이라 기기 종속(백업/이전 어려움), 멀티플레이 동시 편집 자체가 불가능한 구조 | 매 저장이 네트워크 왕복(Supabase upsert)이라 ZenGM 대비 지연 발생 가능, 저장 호출이 산발적이라 트리거 시점이 코드 전반에 분산(일관된 배치 전략 부재), 컬럼 폴백 재시도 로직이 스키마 드리프트를 임시방편으로 흡수하는 형태 |

### 벤치마킹 포인트
1. **화면단 인메모리 캐시 레이어 도입 고려**: 특히 멀티플레이 세션 진행 중(경기 시뮬레이션 배치) 매 액션마다 Supabase 왕복하지 않고, 클라이언트/서버 메모리에 세션 상태를 유지하다가 주기적/이벤트 기반으로 배치 upsert하는 패턴은 참고 가치가 큼. `server/src/scheduler.ts`가 이미 30초 폴링 구조를 갖고 있어, 이 주기에 맞춰 "dirty 상태만 flush"하는 패턴을 붙이면 자연스러운 확장이 가능.
2. **저장 트리거를 한 곳(central save orchestrator)으로 모으는 리팩터링**: 현재 `useGameData.ts` 등 ~10곳에 흩어진 `saveCheckpoint` 호출을 이벤트 기반 dirty-tracking으로 통합하면 저장 누락/중복 저장 리스크를 줄일 수 있음.
3. 컬럼 폴백 재시도(옵셔널 컬럼 제거 후 재시도)는 마이그레이션 관리를 스키마 버전 문서화(ZenGM처럼 `if (oldVersion < N)` 순차 마이그레이션 로그)로 대체하는 게 장기적으로 더 안전.

---

## 3. 매치(경기 시뮬레이션) 엔진

### ZenGM (`GameSim.basketball/index.ts`, ~2,900줄 단일 클래스)
- 루프: `run()` → 쿼터(`simRegulation`) → 포제션(`simPossession`, 게임시계 0까지 반복) → `getPossessionOutcome()`(턴오버/파울/슛 분기) → `doShot()` 체인(`doFg`/`doFt`/`doBlk`/`doReb`).
- 확률식은 전부 `boundProb()`(0.001~0.999 클램프) 후 `Math.random()` 비교하는 **단순 선형/제곱 공식**:
  - 턴오버: `0.14 * 수비.defense / (0.5*(공격.dribbling+공격.passing))`
  - 블록: `0.2 * 수비.blocking²`
  - 3점 성공: `shootingThreePointerScaled*0.3 + 0.36`, 블록 미당첨 시 `-0.25*수비.defense`
- 선수 선택은 룰렛휠 방식 가중 랜덤(`pickPlayer`)으로 코트 위 5인 중 하나를 뽑음.
- 로테이션: 데드볼마다 `ovr × fatigue × ptModifier` 계산, 벤치가 코트보다 우수하고 최소 출전시간(2분) 넘으면 교체 — **감독 성향 파라미터가 따로 없고 이 규칙 자체가 감독 역할**.
- **엔진/텍스트 완전 분리**: 워커는 구조화된 이벤트 객체(`{type:"tp",...}`)만 생성, 실제 커멘터리 문장은 UI 레이어(`processLiveGameEvents.basketball.tsx`)에서 이벤트 타입별 후보 문구 랜덤 선택으로 생성.
- `team.pace`는 계산되지만 실제로는 미사용(버려짐) — 팀 전술 차이는 리그 전역 슬라이더 + 선수 개별 능력치 조합에서만 발생, 팀별 전술 파라미터는 없음.

### NBA-GM-SIM
- `services/game/engine/pbp/`(클라이언트) / `server/src/shared/engine/pbp/`(서버 미러) 구조. `flowEngine.ts`(존별 기본 확률+능력치 매핑+피로도+매치업 갭 등 **다요소 가산 모델**), `possessionHandler.ts`, `rotationLogic.ts`, `substitutionSystem.ts`, `timeEngine.ts`, `usageSystem.ts`, `reboundLogic.ts`.
- 슛 확률은 존별 기본 FG%(`SIM_CONFIG.SHOOTING`)에 슛타입별(dunk/layup/mid/threeCorner 등) 세분화 보정치를 가산하는 방식 — ZenGM보다 세밀한 존/슛타입 분리.
- 로테이션: `components/dashboard/RotationMatrix.tsx`(선수당 48분 컬럼 Boolean 배열, 유저가 직접 편집) + `rotationLogic.ts`의 `checkAndApplyRotation()`(현재 분 기준 in/out).
- 전술 슬라이더 시스템(`TacticsSlidersPanel.tsx`, `TacticsDataPanel.tsx`)이 별도로 존재 — **ZenGM에 없는 팀별 전술 커스터마이징**이 우리 쪽 강점.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 공식이 극도로 단순해 튜닝/디버깅이 쉬움, 10년간 검증된 밸런스, 엔진/텍스트 완전 분리로 커멘터리 다양성 확보가 쉬움 | 존/슛타입별 세분화된 확률 모델로 표현력이 더 풍부, 유저가 48분 로테이션을 직접 설계 가능(ZenGM은 자동 규칙만), 팀별 전술 슬라이더로 전략 다양성 확보 |
| 단점 | 로테이션이 완전 자동(유저 개입 불가), 팀 전술 커스터마이징 자체가 없음(리그 전역 슬라이더만) | 엔진이 상대적으로 복잡해 튜닝 난이도가 높음(다요소 가산 모델), client/server 미러 유지보수 부담 |

### 벤치마킹 포인트
1. **엔진-텍스트(PBP 커멘터리) 분리 구조**는 확실히 참고할 가치가 있음. 워커/엔진이 구조화된 이벤트만 뱉고, 문장 생성을 별도 레이어(후보 문구 풀 + 랜덤 선택)로 분리하면 커멘터리 다양화·현지화(한국어 문구 다양성 확보)가 훨씬 쉬워짐. `MultiGamePbpView.tsx` 쪽 텍스트 생성 로직이 엔진과 얼마나 결합되어 있는지 점검해볼 만함.
2. ZenGM의 "선수 선택 = 룰렛휠 가중 랜덤" 패턴은 단순하지만 결정론적 편향(항상 최고 능력치 선수만 선택)을 피하면서도 능력치를 반영하는 좋은 절충안 — 현재 `usageSystem.ts`의 방식과 비교해볼 가치.
3. 확률 공식을 ZenGM처럼 "한 화면에 다 보이는 단순 선형식" 스타일로 문서화해두면(현재도 `SIM_CONFIG.SHOOTING` 등으로 상수화되어 있지만) 밸런스 조정 시 회귀 검증이 쉬워짐.

---

## 4. 계약협상 / 연봉요구 / 은퇴 (선수 "자아")

### ZenGM
- **성격 모델**: 연속형 loyalty/greed 스칼라가 아니라, 선수마다 `moodTraits`(명성F/의리L/돈$/승리W 중 1~2개, **이산적 태그**)를 무작위 배정. 10개 무드 컴포넌트(시장크기/시설/팀성적/화제성/트레이드이력/출전시간/루키계약/가족/커스텀)에 트레잇별 배율 적용.
  - `F`(명성): marketSize×2.5, hype×2.5, playingTime×2.5
  - `L`(의리): loyalty×2.5, trades×2.5, marketSize×0.5
  - `$`(돈): facilities×1.5, teamPerformance×0.5
  - `W`(승리): teamPerformance×2.5
- **연봉 요구**: 60라운드짜리 **다라운드 경매 시뮬레이션**(`normalizeContractDemands.ts`) — 30팀이 소프트맥스 확률로 FA에 "입찰", 경쟁 있으면 요구액 상승(`SCALE_UP`)/없으면 하락(`SCALE_DOWN`), 학습률을 라운드 진행에 따라 감쇠시켜 시장가에 수렴.
- **오퍼 수락/거절**: 무드 컴포넌트 합을 **시그모이드**(`1/(1+exp(-0.7x))`)에 통과시켜 확률적 수락. 고정 퍼센트 임계값이 아니라 확률 모델. 재계약 시 `valueDiff`를 캡(`MAX_RESIGNING_VALUE_DIFF=4`)해 과도한 고평가 방지.
- **은퇴**: 로지스틱 회귀식 `logit = -1.4134 + (age-18)²/175.19 - 0.971*max(ws,estWS)` → `prob = exp(logit)/(1+exp(logit))`. 33세 초과 + 전성기 대비 능력치 하락(`ovrFraction<0.7`) 시 추가 은퇴 확률.
- **CPU FA 영입**: `autoSign.ts` — 리빌딩 팀은 90% 확률로 이번 턴 스킵(소극적), 컨텐딩 팀은 75%. `getBest.ts`가 캡체크→일반영입→최저연봉(로스터 여유 있을 때만)→포지션필수(풋볼/하키) 순으로 조건 검사.

### NBA-GM-SIM
- `services/fa/faMarketBuilder.ts`(마켓 오픈/CPU사이닝/유저오퍼/오퍼시트), `faValuation.ts`, `contractEligibility.ts`, `negotiationDialogue.ts`, `cpuWaiverEngine.ts`(GM 슬라이더 5종 + WaiverPersonalityParams 7종 기반).
- 익스텐션: `services/fa/extensionEngine.ts` — `calcExtensionBATNA()`(협상 결렬 시 대안가치), `evaluateExtensionOffer()`.
- 은퇴: `services/playerDevelopment/playerAging.ts`의 `retirementProbability()` — 35세 미만 0, 42세 이상 1, 그 사이는 나이/OVR/신체능력(speed·agility·strength·vertical·stamina 평균) 가산식. **명시적 시그모이드/로지스틱 없이 구간별 선형 가산**으로 추정됨(ZenGM보다 단순).
- 옵션 행사: `decideOption()` — 플레이어옵션은 시장가 > 옵션연봉×1.1이면 거부, 팀옵션은 옵션연봉 ≤ 시장가×1.05면 행사(**퍼센트 임계값 방식**, ZenGM의 확률 모델과 대조적).
- GM 프로필(`types/gm.ts`)이 7종 성격×5종 TeamDirection×GMSliders5종으로 ZenGM의 `moodTraits`(4종 이산 태그)보다 **차원이 훨씬 높고 세밀함**.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 다라운드 경매로 시장가가 "자연 수렴"하는 방식이라 밸런스 붕괴가 적음, 확률적(시그모이드) 수락이라 예측 가능성과 랜덤성의 균형이 좋음, 코드가 단순해 유지보수 쉬움 | GM 프로필/무드 시스템이 훨씬 다차원적이라 선수·팀별 개성 표현력이 큼, 옵션 행사 로직이 명확한 %임계값이라 유저가 예측/역이용 가능 |
| 단점 | 무드 트레잇이 딱 4종 이산값이라 개성 표현력이 제한적, 자체 시장가 경매 시뮬레이션 없이 코드가 복잡해질수록 튜닝 난이도 상승 | 계약 수락/거절이 명시적 임계값 위주라 예측 가능성이 너무 높아지면 "협상의 재미"가 떨어질 수 있음, 연봉 요구 로직이 시장 전체 경쟁(경매)을 반영하는 구조인지 재확인 필요 |

### 벤치마킹 포인트
1. **다라운드 경매 시뮬레이션(연봉 시장가 수렴 알고리즘)** 도입 검토 — 현재 FA 연봉 요구가 개별 선수 단위 공식이라면, ZenGM처럼 "30개 팀이 동시에 입찰 경쟁"하는 시뮬레이션을 오프시즌 페이즈에 붙이면 스타 선수 쏠림/시장 과열 같은 자연스러운 현상이 생겨 몰입감이 올라감.
2. **계약 수락을 시그모이드 확률로 전환**하는 것은 CLAUDE.md의 익스텐션 협상 엔진과 잘 맞을 수 있음 — 고정 %임계값보다 "무드 점수 → 확률" 변환이 유저에게 예측 불가능성(진짜 협상하는 느낌)을 준다는 점에서 참고 가치.
3. ZenGM의 `moodTraits`(이산 4종)는 우리 GM 프로필(7종×5종×5슬라이더) 대비 단순하지만, **오히려 선수 쪽에도 이런 단순 이산 태그를 얹어 유저에게 "이 선수는 승리 지향형"처럼 직관적으로 노출**하는 UX는 참고할 만함(우리는 세부 수치 기반이라 유저에게 설명하기 어려울 수 있음).

---

## 5. AI 트레이드 로직

### ZenGM (`src/worker/core/trade/`, 핵심은 `team/ValueChangeCalculator.ts`)
- **가치평가**: 선수 `value`를 z-score 정규화 후 `value>1`이면 **지수(EXPONENT=7) 누승** — 스타 한 명이 저가치 자산 여럿보다 기하급수적으로 크게 평가됨. 계약가치는 "기대연봉(정규화 가치→연봉 선형매핑) 대비 실제연봉" 차이로 산출.
- **rebuilding vs contending**: 팀 전략에 따라 유망주/미래픽 배율이 반대로 적용(리빌딩: 19세 이하 ×1.075, 미래픽 ×1.1 / 컨텐딩: 픽 ×0.825, 19세 이하 ×0.8).
- **AI 자기 팀 과대평가(`fudgeFactor`)**: 유저 상대 거래가 아니면 자기 자산에 1.05배 가치 부여(손해 안 보려는 성향), 난이도별 배율도 곱함.
- **수락/거절**(`propose.ts`): `dv>0`이면 수락, 거절 메시지도 `dv` 구간별로 다르게(`-2`, `-5` 기준). 캡 위반(`summary.ts`의 `warning`)이면 무조건 거절.
- **CPU끼리 능동적 트레이드**(`betweenAiTeams.ts`): 가치 가중 랜덤으로 자산 선택(70% 선수1명/15% 픽1개/15% 조합) → forward-selection(`makeItWork.ts`)으로 상대 관점 dv가 0에 가까워질 때까지 자산 추가. **무작위 조합 탐색보다 계산량이 훨씬 적은 탐색 알고리즘**.
- 안전장치: CPU-CPU 간 `|dv|>15`면 거래 취소, 1라운드 픽 2개 초과 몰아주기엔 프리미엄 부여(과도한 픽 스태킹 방지).
- **명시적 로스터 정원 검증은 trade 모듈에 없음**(성사 후 로스터 화면에서 별도 처리).

### NBA-GM-SIM (`services/tradeEngine/`)
- `tradeExecutor.ts`(`MAX_ROSTER_SIZE=15` 명시적 검증 — ZenGM보다 엄격), `pickValueEngine.ts`(슬롯커브×연도할인0.88^y×보호할인×스왑보너스), `stepienRule.ts`, `salaryRules.ts`.
- **CPU 트레이드 5단계 파이프라인**: `tradeParticipation.ts`(참가점수, 임계값 0.35) → `tradeGoalEngine.ts`(재정압박>즉시전력강화>롤보강>자산정리 순 목표 결정) → `assetAvailability.ts` → `tradeTargetFinder.ts` → `tradeUtilityEngine.ts`(효용/수락점수/후회비용).
- ZenGM의 단일 `ValueChangeCalculator`(dv 하나로 판단) 대비, **목표(TradeGoal) 자체를 먼저 결정한 후 그에 맞는 자산을 탐색**하는 구조가 더 명시적/서사적(SALARY_RELIEF, STAR_UPGRADE, ROLE_ADD 단계 구분).

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 단일 dv 스칼라로 판단이 단순명료, forward-selection 탐색 알고리즘이 계산 효율적, z-score+지수 누승이라는 검증된 스타선수 가중 공식 | 트레이드 "목표"를 명시적으로 분리(재정압박/스타업그레이드/롤보강)해 AI 행동에 서사적 일관성이 있음(같은 상황에서 왜 이 트레이드를 제안했는지 설명 가능), 로스터 정원 검증이 트레이드 모듈 내부에 이미 존재 |
| 단점 | 팀의 트레이드 "의도"가 dv 계산에 암묵적으로만 녹아있어 설명 가능성이 낮음, 로스터 정원 검증 부재 | 5단계 파이프라인이라 ZenGM 대비 구조가 복잡해 튜닝/디버깅 난이도가 높을 수 있음 |

### 벤치마킹 포인트
1. **forward-selection 방식의 "거래 성사시키기" 탐색 알고리즘**(`makeItWork.ts`)은 우리 `tradeTargetFinder.ts`/`offerGenerator.ts`와 비교해볼 가치가 큼 — "상대가 원하는 dv=0에 가까워질 때까지 자산을 하나씩 추가"하는 방식은 무작위 조합보다 계산량이 적으면서 결과가 합리적.
2. **AI 자기 팀 과대평가(fudgeFactor, 1.05배)** 같은 "손해 안 보려는 성향" 보정은 우리 `gmProfiler.ts`의 GM 슬라이더에 이미 유사 개념이 있을 수 있으나, ZenGM처럼 "유저 상대 거래에서만 적용"하는 비대칭 설계는 확인해볼 만함(유저가 항상 불리한 딜을 제안받는다는 체감 방지).
3. **1라운드 픽 몰아주기 방지 프리미엄**처럼 특정 자산 유형의 과다 집중을 억제하는 소소한 규칙들은 `pickValueEngine.ts`에 없다면 추가할 가치가 있음.

---

## 6. 드래프트 시스템

### ZenGM (`src/worker/core/draft/`)
- **로터리**: `lotterySort()`가 팀을 승률 역순 정렬, `getLotteryInfo()`에 draftType별(nba1994/nba2019/coinFlip/nhl2017/mlb2022/custom/cola/nba2027 등) 확률표가 하드코딩. `simLottery()`가 가중 추첨. 동적계획법/초기하분포로 정밀 확률 계산(느리면 몬테카를로 10만회 대체).
- **탱킹 방지**: 확률표 자체가 비선형 확률 배분(완전 역순위 아님)이라 고의 패배의 기대이익이 낮음. `nba2027` 모드는 하위 3팀 top12 보장하되 과도한 집중 제한.
- **신인 생성**(`genRatings.basketball.ts`): 신장 커스텀 분포 → 포지션 유형(point/wing/big) 확률 배정 → 낮은 기본 능력치(체력/IQ/슈팅 낮게 시작, 성장 여지 남김) → 4개 상관 팩터(운동능력/슈팅/스킬/인사이드)로 현실적인 능력치 상관관계 구현.
- **AI 드래프트 픽**: `score = (teamOvrDiffs+0.05*value)**40` 또는 `value**69`(지수가 매우 커서 최고가치 편향이지만 `choice()` 가중랜덤이라 100% 결정론은 아님) — 포지션 니즈는 `team.ovr(wholeRoster:true)` 계산 안에 내재적으로 반영.
- **오프시즌 상태머신**: `PHASE` enum(EXPANSION_DRAFT/FANTASY_DRAFT/PRESEASON/REGULAR_SEASON/AFTER_TRADE_DEADLINE/PLAYOFFS/DRAFT_LOTTERY/DRAFT/AFTER_DRAFT/RESIGN_PLAYERS/FREE_AGENCY)로 순차 전환, 각 단계 진입 함수가 자동으로 다음 단계 준비 작업 수행.

### NBA-GM-SIM (`services/draft/`)
- `lotteryEngine.ts`의 `runLotteryEngine()` — **NBA 2019+ 방식 확률표를 그대로 채택**(`[140,140,140,125,105,90,75,60,45,30,20,15,10,5]`), 1000풀 상위4픽 추첨 — ZenGM의 여러 방식(nba1994/2019/coinFlip 등) 중 하나만 구현.
- `rookieGenerator.ts`(`generateDraftClass()`, `calcRookieContract()`, `ROOKIE_SALARIES`), `draftOrderResolver.ts`, `cpuDraftEngine.ts`, `draftSimulator.ts`.
- 오프시즌 상태머신은 `OffseasonPhase`(POST_FINALS→...→PRE_SEASON)로 ZenGM과 유사한 순차 전환 구조를 이미 갖춤(CLAUDE.md/메모리 기재).

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 로터리 방식이 다양(역사적/실험적 모드까지)해 유저 커스터마이징 폭이 큼, 신인 생성 시 4개 상관 팩터로 "타입별 신인"(운동능력형/슈팅형 등)이 자연스럽게 나옴 | NBA 실제 규정(2019+)을 정확히 구현해 현실감이 높음(단일시즌 목표에 부합), 이미 오프시즌 상태머신 구조를 갖춰 확장 여지 있음 |
| 단점 | 확률표가 하드코딩이라 모드 전환 시 코드 수정 필요 | 로터리 방식이 단일 모드뿐이라 유저 커스터마이징 여지가 적음, 신인 생성 시 능력치 간 상관관계(운동능력형 vs 슈팅형 신인) 구현 여부 재확인 필요 |

### 벤치마킹 포인트
1. **신인 생성 시 "4개 상관 팩터"(운동능력/슈팅/스킬/인사이드) 방식**은 현재 `generateDraftClass()`가 순수 랜덤 분포라면, 이 방식을 도입해 "이 신인은 운동능력형" 같은 아키타입이 자연스럽게 나오도록 개선할 여지가 큼(우리 프로젝트엔 이미 12종 아키타입 개념이 있으므로 신인 생성 시에도 아키타입 편향 팩터를 적용하면 일관성 있음).
2. **드래프트 픽 로직에 "가중 랜덤"(`choice()` softmax형)을 도입**해 CPU가 100% 최고가치 선수만 뽑지 않고 약간의 변동성을 갖게 하면(현재 `cpuDraftEngine.ts` 방식 확인 필요) 매 시즌 드래프트 결과가 덜 예측 가능해져 흥미 요소가 늘어남.
3. 로터리 방식을 설정으로 여러 개 지원(현재/과거 NBA 방식 등)하는 건 우선순위가 낮지만, 단일시즌 목표상 지금의 2019+ 고정 구현은 적절함 — 오히려 벤치마킹보다는 "현행 유지가 맞다"는 판단.

---

## 7. 시즌 진행 / 스케줄 / 플레이오프

### ZenGM
- **스케줄 생성**(`newScheduleGood.ts`): 디비전/컨퍼런스별 그룹핑 → 목표 경기수를 팀당 몫+나머지로 분해 → 반복 알고리즘(최대 2000회)이 나머지 경기를 랜덤 매칭하며 홈/원정 균형(±1) 맞춤, 실패 시 과거 매치업 스왑 재시도.
- **플레이오프 대진**(`genPlayoffSeeds.ts`): 결승부터 역으로 재귀 생성(1번 시드 vs 최하위 시드 원칙), 컨퍼런스별 분리/플레이인 토너먼트 지원.

### NBA-GM-SIM
- CLAUDE.md 기재: "트레이드 데드라인: 실제 NBA 날짜 하드코딩(단일시즌이므로)" — 스케줄 자체는 `meta_schedule`(공유 읽기전용) 테이블 기반으로 이미 확정된 실제 일정을 사용하는 것으로 보임(ZenGM처럼 매 리그마다 알고리즘으로 생성하지 않음).
- `TournamentBracketView.tsx`, `PostseasonBracket.tsx`(멀티) — 플레이오프 대진 UI가 별도로 존재.

### 장단점 비교
같은 목표(현실적 NBA 시즌 재현)를 다른 방법(고정 실데이터 vs 매번 알고리즘 생성)으로 달성 중. 단일시즌 모드에는 고정 스케줄이 더 적합하지만, **멀티플레이어에서 매 시즌 신규 리그가 생성될 경우** ZenGM식 알고리즘 스케줄 생성이 필요해질 수 있음(30개 팀이 매번 다른 조합일 수 있으므로).

### 벤치마킹 포인트
1. 멀티플레이어 모드에서 유저 30명이 매번 다른 팀 조합/디비전 구성으로 리그를 만든다면, **ZenGM의 `newScheduleGood.ts` 알고리즘(디비전/컨퍼런스 밸런스 스케줄 자동 생성)을 이식**해야 할 가능성이 높음 — 현재 고정 스케줄 방식은 싱글플레이 한정으로는 적절하나 멀티 로드맵과 충돌 소지가 있어 확인 필요.
2. `genPlayoffSeeds.ts`의 재귀적 시드 생성(1번 vs 최하위 원칙을 라운드마다 유지)은 플레이인 토너먼트까지 확장 가능한 깔끔한 패턴이라 참고할 만함.

---

## 8. 선수 성장/노화

### ZenGM
- `calcBaseChange(age, coachingLevel)`: 나이 구간별 기본 성장치(21세 이하 +2 ~ 44세 이상 -6) + 정규분포 노이즈(`realGauss`) + 코칭레벨 보정.
- **능력치별 개별 성장 공식**(`RatingFormula`): 신체능력(spd/jmp)은 26~27세부터 급격히 하락(41세+ 최대 -10), 슈팅/IQ는 27세까지 노화 보정 없고 오히려 이후 소폭 상승 — "노장도 슈팅/IQ는 유지"라는 현실적 반영.
- **OVR 공식**(`ovr.basketball.ts`): 15개 능력치 가중 선형합(회귀분석 도출, `hgt`·`diq` 가중치 0.159로 최대) + 구간별 fudge factor 보정.
- **잠재력(pot)**: 29세 미만은 **몬테카를로 시뮬레이션**(20회 반복, 30세까지 최대OVR의 75th percentile) 또는 회귀 근사식(`72.31 - 2.33*age + 0.833*ovr`)으로 산출, 29세 이상은 pot=현재OVR.

### NBA-GM-SIM
- `services/playerDevelopment/playerAging.ts`: `generateGrowthProfile()`(attrAffinity+athleticResilience 시드 프로필), `calculatePerGameDevelopment()`(경기당 미세 성장), 천장은 `potential+3` 소프트캡.
- CLAUDE.md 요약상 4개 에이징그룹, TCR(0.5~2.0) 개념 존재 — ZenGM의 "능력치별 개별 노화 곡선"과 유사한 세분화가 이미 있는 것으로 보이나 이번 조사에서 정확한 명칭(TCR)이 코드에서 확인되지 않아 재검증 필요.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 능력치별(신체/슈팅/IQ) 노화곡선이 명확히 분리되어 현실감 있음, 몬테카를로 잠재력 산출이 통계적으로 견고 | per-game 미세 누적 방식이라 ZenGM의 "시즌 단위 점프" 대비 성장이 매끄럽게 체감됨(CLAUDE.md 기재) |
| 단점 | 시즌 단위로 능력치가 한번에 점프해 변화가 급격하게 느껴질 수 있음 | 몬테카를로 대신 시드 기반 프로필 방식이라면 "미래 잠재력을 여러 시나리오로 시뮬레이션해서 추정"하는 ZenGM 방식의 통계적 견고함은 부족할 수 있음 |

### 벤치마킹 포인트
1. **능력치별 개별 노화 곡선**(신체능력은 일찍/빠르게 하락, 슈팅/IQ는 늦게까지 유지)이 현재 4개 에이징그룹으로 이미 커버되는지 확인 — 안 되어 있다면 이 세분화는 선수 개성(노장 슈터 vs 은퇴 임박 운동능력형)을 살리는 데 효과적.
2. **잠재력(pot) 산출을 몬테카를로/회귀 방식으로 전환**하는 것은 현재 방식이 이미 시드 기반이라 유사한 목적을 달성 중일 가능성 높음 — 우선순위 낮음, 확인만 권장.

---

## 9. 재정/샐러리캡

### ZenGM
- `getPayroll.ts`: 로스터 선수 + **웨이브(방출)된 선수**를 항상 합산. **데드캡 완화(스트레치/조기상환 할인) 로직 자체가 없음** — 방출 계약은 만료 시즌까지 전액 그대로 카운트(단, 드래프트 직후 즉시 방출은 예외적으로 페널티 없음).
- **사치세**: `luxuryTax(1.5) × (payroll - luxuryPayroll)`, 하드캡 리그는 사치세 면제. 걷힌 세금의 50%는 캡 이하 팀들에 균등 분배.
- **캡 인플레이션**: 매 시즌 드래프트 직전 `truncGauss` 샘플링으로 캡/최소계약/최대계약/최소페이롤/사치세선 전체를 동시 조정(기본값은 인플레이션 0 — 유저가 설정해야 캡이 성장).
- **재정→운영 실제 영향**: `scouting`(드래프트 유망주 평가 정확도), `facilities`(관중수+FA 협상 시 무드 ±2), `coaching`/`health`(성장/부상)로 예산 배정이 실제 게임플레이에 직결.

### NBA-GM-SIM
- `services/financeEngine/`: `budgetManager.ts`(`BudgetManager` 싱글턴, `calculateLuxuryTax()`), `attendanceModel.ts`, `revenueCalculator.ts`, `investmentEngine.ts`(`autoAllocateCPUBudget()`).
- CBA 규칙 구현(125%/110%/100% 매칭, 스테피언 룰, NTC)이 ZenGM보다 **훨씬 정교함**(ZenGM은 소프트캡 매칭이 단일 %치 하나뿐, 스테피언 룰 자체가 없음).
- 데드캡: CLAUDE.md 기재상 "waive 1회성/stretch 매시즌-1"로 **ZenGM에 없는 stretch provision을 이미 구현**해둠 — 이 부분은 NBA-GM-SIM이 ZenGM보다 앞서 있음.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 예산 레벨(scouting/facilities/coaching/health)이 실제 게임플레이 전반에 넓게 영향을 미쳐 "재정 관리"가 체감되는 시스템, 사치세 분배(50% 균등 재분배)로 스몰마켓 팀 지원 로직 존재 | CBA 규칙(125% 매칭, 스테피언 룰, stretch 데드캡)이 훨씬 현실적이고 정교함 — 이 영역은 이미 ZenGM을 능가 |
| 단점 | CBA 세부 규칙(스테피언 룰 등) 부재, stretch 데드캡 없음 | 예산(scouting/facilities/coaching/health)이 게임플레이 전반에 미치는 영향 체계가 ZenGM만큼 넓게 연결되어 있는지 확인 필요 — `investmentEngine.ts`의 `autoAllocateCPUBudget()` 외 유저 체감 포인트가 제한적일 수 있음 |

### 벤치마킹 포인트
1. **예산 레벨(시설/스카우팅/코칭/건강)이 게임플레이 전반에 미치는 영향망을 ZenGM 수준으로 확장**할 가치가 있음 — 특히 "시설 투자 → FA 협상 시 무드 보너스", "스카우팅 투자 → 드래프트 유망주 평가 정확도(안개 걷기)"는 우리 트레이드/FA/드래프트 시스템과 자연스럽게 연결 가능하고 유저에게 "재정이 실제로 의미 있다"는 체감을 준다.
2. **사치세 징수분의 재분배(50% 균등 분배)** 메커니즘은 스몰마켓 팀 시뮬레이션 밸런스에 유용 — CBA 룰 구현 수준이 이미 높으니 이 정도 디테일 추가는 어렵지 않을 것.
3. 반대로 스테피언 룰/stretch 데드캡은 이미 우리가 더 앞서 있으므로 **역으로 이 부분은 향후 오픈소스 기여나 벤치마킹 레퍼런스 자료로 소개할 만한 우리 강점**.

---

## 10. 시상식(Awards) / 올스타

### ZenGM
- 각 상마다 실제 NBA 데이터 회귀분석 기반 스코어 공식(`@nicidob` 크레딧): MVP `winpScale*teamWinp + ewa/22 + vorp/32 + fracWS/10`, DPOY/SMOY/ROY/MIP 각각 유사한 가중합 + 자격 필터(ROY는 데뷔시즌만, SMOY는 `gp/gs>2`).
- 올-NBA/올-디펜스는 **별도 투표 없이** mvpScore/dpoyScore 순위 그대로 상위 15명을 3팀으로 분할.
- 올스타: `score = 2.5*ewa + ws` 기준 정렬, `allStarType`(top/byConf/draft) 설정으로 선발 방식 분기, 덩크/3점 콘테스트도 능력치 기반 자동 선발.

### NBA-GM-SIM
- `utils/awardVoting.ts`의 `runAwardVoting()` — **"100명 미디어 투표인단" 시뮬레이션**, 시드 기반 노이즈로 개인차 부여해 자연스러운 득표 분포 생성. `AwardCandidate`에 세부 수비지표(intDef/perDef/steal/blk/helpDefIq/defConsist)까지 반영.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 실데이터 회귀분석 기반이라 상 스코어 공식 자체의 현실 정합성이 검증됨, 계산이 단순해 즉시 결정론적 | **100인 투표 시뮬레이션 + 개인별 노이즈**는 ZenGM의 단일 공식보다 "득표율 분포/이변" 같은 서사적 재미가 크고 이미 더 진보된 설계 |
| 단점 | 투표가 아니라 순수 공식 정렬이라 "이변"이 없음(항상 같은 기준 1등이 수상) | 100인 투표 시뮬레이션은 계산 비용이 더 크고, 개별 투표인 편향 파라미터 튜닝이 더 어려움 |

### 벤치마킹 포인트
1. 이 영역은 **NBA-GM-SIM이 이미 ZenGM보다 진보된 설계**(투표 시뮬레이션)를 갖추고 있음 — 벤치마킹 필요성 낮음. 다만 ZenGM의 회귀 기반 스코어 공식(`winpScale*teamWinp + ewa/22 + ...`)은 우리 `AwardCandidate` 스코어링 필드의 가중치를 검증/보정하는 참고 자료로는 유용.
2. 올스타 선발 방식(`allStarType`: top/byConf/draft 3종 지원)은 우리 쪽에 아직 없다면, 유저가 올스타 선발 방식을 선택할 수 있게 하는 건 낮은 비용으로 추가 가능한 재미 요소.

---

## 11. 부상 시스템

### ZenGM
- **발생확률**: `injuryRate = baseRate * 1.03^(age-26)`(나이 1살당 3% 복리 증가) + 이미 부상 중 상태로 뛰면 ×1.5.
- **부상 종류/기간**: 리그 설정의 실제 NBA 통계 기반 부상 목록(`defaultInjuries.ts`, `data/injuries.csv`)에서 가중 랜덤 추첨, 결장 기간은 `healthLevel`(팀 예산)에 따라 최대 완화(`healthEffect = -0.12*level`) + 균등분포 편차.
- **부상 이력이 미래 부상 확률에 영향 X** — "현재 진행 중인 부상 상태로 뛰는지"만 반영, `durability`/`injuryProne` 필드 자체가 없음.

### NBA-GM-SIM
- `utils/injuries.ts`는 13줄 레거시 유틸(빈 객체)이고, **실질 로직은 `services/game/engine/fatigueSystem.ts`**에 위치 — 경기 중 마이크로롤 부상 체크(듀레이션 기반 공식), 훈련일 부상은 `applyRestDayRecovery()`.
- 메모리 기록상 "내구성(durability) 스케일" 개념이 이미 존재(유리몸 30~50대, 엠비드/AD급 20~30대) — **ZenGM에 없는 개별 선수 부상 성향(durability) 필드를 이미 구현**해둔 것으로 보임. 이는 명확한 우리 쪽 강점.

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 실제 NBA 부상 통계 데이터를 그대로 사용해 부상 종류/기간의 현실성이 높음, 팀 건강 예산이 결장기간에 실제 영향 | **선수별 durability(내구성) 필드**가 있어 "유리몸 vs 강골" 개성이 표현됨 — ZenGM보다 진보된 설계 |
| 단점 | 선수 개인차(내구성) 없이 전원 동일 확률 곡선 적용 | 실제 NBA 부상 종류/빈도 통계 데이터(ZenGM의 `data/injuries.csv` 같은)를 활용하는지 불확실 — 순수 공식 기반이라면 특정 부상 유형(ACL, 발목 등)의 현실적 빈도/기간 반영이 약할 수 있음 |

### 벤치마킹 포인트
1. **`utils/injuries.ts`가 13줄 레거시 상태로 방치**되어 있고 실제 로직이 `fatigueSystem.ts`에 흩어져 있는 점은 코드 정리 대상 — 부상 관련 로직을 명시적으로 한 모듈로 모으는 리팩터링이 유지보수 관점에서 유리(ZenGM처럼 `injury.ts` 단일 진입점 패턴 참고).
2. ZenGM의 "실제 부상 통계 기반 종류/기간 테이블"(`defaultInjuries.ts`)은, 우리도 부상 종류(발목 염좌/ACL 파열 등)별로 평균 결장 기간을 실제 NBA 통계로 세분화해두면 현실감을 더 높일 수 있음 — durability는 이미 우리가 앞서 있으니 "종류별 현실적 기간 테이블"을 얹으면 두 장점을 합칠 수 있음.
3. 팀 "건강 예산"이 결장 기간에 영향을 주는 메커니즘은 재정 시스템(9번 항목)과 연결해 도입할 가치가 있음.

---

## 12. UI / 빌드 아키텍처

### ZenGM
- Bootstrap 5.3 + react-bootstrap, Tailwind 미사용. 다크모드는 **완전히 별도의 SCSS 빌드 산출물**(light.scss/dark.scss)을 초기 로드 시 `<link>` 교체로 적용(FOUC 방지).
- 빌드: **Rolldown**(Rust 기반) 사용. **스포츠별로 빌드 자체를 4번 완전히 별도 실행**(`process.env.SPORT` 컴파일타임 상수) + 커스텀 babel 플러그인(`bySport`/`isSport`를 빌드타임에 리터럴로 치환 후 트리셰이킹)으로 미사용 스포츠 코드 완전 제거.
- 테스트: Vitest + `@vitest/browser-playwright`, 스포츠별 프로젝트 분리, `src/worker/**/*.test.ts`로 소스 옆에 유닛 테스트 배치.
- 타입: `src/common/types.ts` 2,018줄 중앙 타입 파일 + Zod 병행, `View<Name>` 유틸리티 타입으로 워커 뷰 반환 타입을 UI가 자동 추론.
- PWA: `workbox-build`로 서비스워커 생성, 오프라인 플레이 가능. 완전 정적 배포(rsync + Cloudflare 캐시 퍼지).

### NBA-GM-SIM
- Tailwind CSS 기반. Vite 빌드. 멀티스포츠 아님(농구 전용)이라 스포츠별 빌드 분리 이슈 자체가 없음.
- 테스트 전략은 이번 조사 범위 밖(별도 확인 필요).

### 장단점 비교

| | ZenGM | NBA-GM-SIM |
|---|---|---|
| 장점 | 빌드타임 트리셰이킹으로 4개 스포츠를 하나의 코드베이스로 관리하면서도 번들 크기 최적화, 소스 옆 유닛 테스트 배치로 회귀 방지 문화 정착, PWA로 오프라인 플레이 가능 | Tailwind가 Bootstrap보다 커스터마이징 자유도가 높아 우리 자체 디자인 시스템 구축에 유리, 단일 스포츠라 빌드 복잡도 자체가 낮음 |
| 단점 | Bootstrap 기반이라 커스텀 디자인 시스템 구축이 상대적으로 제약적 | (이번 조사 범위에서) 소스 옆 유닛 테스트 문화나 PWA/오프라인 지원 여부가 불확실 |

### 벤치마킹 포인트
1. **PWA(서비스워커 기반 오프라인 지원)**는 멀티스포츠 이슈와 무관하게 바로 참고 가능 — 특히 싱글플레이 모드는 네트워크 없이도 동작 가능한 구조로 만들 수 있다면(Supabase 의존도가 있어 완전 오프라인은 어렵겠지만, 정적 자산 캐싱만으로도 로딩 속도 개선 가능) PWA manifest + 워크박스 프리캐싱 도입을 검토할 가치가 있음.
2. **소스 파일 옆에 `.test.ts` 배치 + 스포츠(우리는 도메인)별 테스트 프로젝트 분리** 관행은 회귀 검증 문화로 참고할 만함 — 엔진 로직처럼 "되돌리기 까다로운 변경"(CLAUDE.md에서 이미 강조)일수록 유닛 테스트로 고정해두는 게 dev-log 수기 기록의 보완책이 될 수 있음.
3. `View<Name>` 같은 "워커/서버 뷰 반환 타입을 UI가 자동 추론"하는 타입 유틸리티 패턴은, 우리 `server/src` ↔ 클라이언트 간 API 계약을 타입으로 강제하는 데 유용 — 현재 client/server 미러링 부담(1번 항목에서 지적)을 줄이는 데도 기여 가능.

---

## 13. 멀티플레이어 인프라 (구조적 비교 한계)

ZenGM은 **애초에 멀티플레이어를 지원하지 않는 아키텍처**(서버 없음, IndexedDB는 단일 브라우저 전용)이므로 이 영역은 직접 비교가 성립하지 않는다. 다만 참고할 수 있는 것은:

- ZenGM의 **오프시즌 phase 상태머신**(PHASE enum + `doPhaseChange` 매핑 테이블로 각 단계 진입 시 자동 실행 함수 지정)은, 우리 `server/src/scheduler.ts`(30초 폴링 기반 로터리/드래프트 자동 진행)가 이미 유사한 패턴을 구현 중 — ZenGM 쪽 상태 전환 함수 명명 규칙(`newPhaseX.ts`)과 우리 `OffseasonPhase` 상태머신을 나란히 두고 누락된 자동화 단계가 없는지 점검하는 정도로만 참고 가치가 있음.
- 새 리그 생성 흐름(`createStream.ts`: 설정확정→팀/시즌레코드생성→선수배치→유망주생성→로스터정렬→드래프트픽큐생성)의 **순차 초기화 체크리스트**는 우리 `services/multi/leagueService.ts`의 `createLeague()` 초기화 순서를 검증하는 참고 목록으로 쓸 수 있음.

### 벤치마킹 포인트
1. 30인 동시접속이라는 우리 고유 목표는 ZenGM 사례에서 직접적인 해법을 얻을 수 없음 — 이 영역은 자체 설계를 계속 발전시키는 게 맞고, ZenGM은 "레퍼런스 없음"으로 결론.
2. 다만 새 리그 생성 시 초기화 순서(설정→팀→선수→유망주→정렬→픽큐)는 우리 `createLeague()`가 빠뜨린 단계가 없는지 체크리스트로 대조해볼 가치는 있음.

---

## 14. 종합 SWOT

### NBA-GM-SIM의 강점 (ZenGM 대비 이미 앞선 부분)
- CBA 규정 정교함(125%/110%/100% 매칭, 스테피언 룰, stretch 데드캡) — ZenGM은 이 정도 세밀함이 없음.
- 시상식 100인 투표 시뮬레이션 — ZenGM의 단순 공식 정렬보다 서사적으로 풍부.
- 선수별 durability(내구성) 개인차 — ZenGM은 전원 동일 부상 확률 곡선.
- GM 프로필(7종×5종×5슬라이더) — ZenGM의 이산 4종 moodTraits보다 다차원적.
- 존/슛타입별 세분화된 슈팅 확률 모델, 유저 편집형 로테이션(48분 매트릭스), 팀별 전술 슬라이더 — ZenGM은 로테이션이 완전 자동, 팀 전술 커스터마이징 자체가 없음.

### NBA-GM-SIM의 약점 (ZenGM이 검증한 것 대비 부족/불확실한 부분)
- 인메모리 캐시+배치 flush 계층 부재 → 저장이 산발적 네트워크 왕복에 의존.
- client/server 엔진 코드 수동 미러링 → 이중 유지보수 부담.
- 워커 스레드 분리 부재 → 무거운 클라이언트 연산 시 UI 블로킹 리스크.
- 재정(예산 레벨)이 게임플레이 전반에 미치는 영향망이 ZenGM만큼 넓게 연결되어 있는지 불확실.
- 부상 로직이 레거시 파일(`injuries.ts`)과 실질 로직(`fatigueSystem.ts`)으로 분산되어 있어 코드 응집도가 낮음.
- 연봉 시장가가 "경매 시뮬레이션"처럼 팀 간 경쟁을 모델링하는지 불확실(개별 공식 위주일 가능성).
- 소스 옆 유닛테스트/PWA 오프라인 지원 여부 불확실.

### 기회 (Opportunities)
- 저장 계층에 캐시+배치 flush를 도입하면 특히 멀티플레이어 세션 진행 시 Supabase 부하와 지연을 동시에 줄일 수 있음.
- 엔진-텍스트 분리 패턴을 도입하면 한국어 커멘터리 다양화 작업이 훨씬 쉬워짐(현재 CLAUDE.md의 "PBP 커멘터리 개선 예고"와 직결).
- 재정 시스템의 영향망을 확장하면 기존에 이미 정교한 CBA 규칙과 시너지가 커짐.

### 위협/리스크 (Threats)
- 멀티플레이어 확장 시 client/server 미러링 부담이 계속 커지면 버그(둘 중 하나만 수정)의 리스크가 누적됨 — 공통 모듈화가 늦어질수록 비용 증가.
- 워커 분리 없이 클라이언트 연산이 계속 무거워지면(특히 멀티 시즌·다수 선수 성장 계산) UI 반응성이 눈에 띄게 나빠질 시점이 올 수 있음.

---

## 15. 벤치마킹 우선순위 (Top 8)

임팩트(유저 체감/안정성)와 구현 난이도를 함께 고려한 권장 순서:

| 순위 | 항목 | 임팩트 | 난이도 | 비고 |
|---|---|---|---|---|
| 1 | 엔진-텍스트(PBP 커멘터리) 완전 분리 | 높음 | 낮음 | 이미 예정된 "PBP 커멘터리 개선"과 직결, 구조화 이벤트만 뱉고 문구는 별도 레이어에서 랜덤 선택 |
| 2 | 저장 계층에 dirty-tracking + 배치 flush 도입 | 높음 | 중간 | 멀티플레이 세션 진행 시 Supabase 부하/지연 감소, `server/src/scheduler.ts`의 30초 주기와 자연 결합 가능 |
| 3 | 무거운 클라이언트 연산 Web Worker 분리 | 중간 | 중간 | 시즌 시뮬레이션/대량 성장 계산부터 우선 적용 |
| 4 | 재정(예산 레벨)의 게임플레이 영향망 확장 | 중간 | 낮음 | 시설→FA무드, 스카우팅→드래프트 안개걷기 등 이미 있는 시스템과 연결만 하면 됨 |
| 5 | 부상 로직 모듈 정리(`injuries.ts` 단일화) + 부상종류별 현실 기간 테이블 | 중간 | 낮음 | durability는 이미 앞서 있으니 종류별 기간 테이블만 추가 |
| 6 | 연봉 시장가 경매 시뮬레이션(다라운드 수렴) 검토 | 중간 | 높음 | 몰입감 크지만 구현 복잡도 높음, FA 시스템이 안정화된 이후 시도 |
| 7 | 신인 생성 시 상관 팩터(아키타입 편향) 적용 | 낮음 | 낮음 | 기존 12종 아키타입과 연계해 신인도 아키타입 성향 반영 |
| 8 | 소스 옆 유닛테스트 관행 도입(엔진/공식 로직부터) | 중간(장기) | 중간 | dev-log 수기 기록의 보완책, 회귀 방지 |

---

## 부록: 조사에 사용된 파일 경로 색인 (ZenGM)

- 아키텍처: `src/worker/index.ts`, `src/worker/api/index.ts`, `src/ui/util/toWorker.ts`, `src/ui/util/viewManager.tsx`
- 영속성: `src/worker/db/Cache.ts`, `src/worker/db/connectLeague.ts`, `src/worker/db/connectMeta.ts`
- 매치엔진: `src/worker/core/GameSim.basketball/index.ts`, `PlayByPlayLogger.ts`
- 계약/은퇴: `src/worker/core/player/genMoodTraits.ts`, `moodComponents.ts`, `moodInfo.ts`, `shouldRetire.ts`, `src/worker/core/freeAgents/normalizeContractDemands.ts`, `autoSign.ts`
- 트레이드: `src/worker/core/team/ValueChangeCalculator.ts`, `src/worker/core/trade/propose.ts`, `makeItWork.ts`, `betweenAiTeams.ts`
- 드래프트: `src/worker/core/draft/genOrder.ts`, `draftLottery.ts`, `runPicks.ts`, `src/worker/core/player/genRatings.basketball.ts`
- 시즌/오프시즌: `src/worker/core/season/newScheduleGood.ts`, `genPlayoffSeeds.ts`, `src/worker/core/phase/newPhase.ts`
- 성장/노화: `src/worker/core/player/developSeason.basketball.ts`, `develop.ts`, `ovr.basketball.ts`, `potEstimator.ts`
- 재정: `src/worker/core/team/getPayroll.ts`, `src/worker/core/finances/getLuxuryTaxAmount.ts`, `assessPayrollMinLuxury.ts`
- 시상식/올스타: `src/worker/core/season/doAwards.basketball.ts`, `src/worker/core/allStar/create.ts`
- 부상: `src/worker/core/GameSim.basketball/getInjuryRate.ts`, `src/worker/core/player/injury.ts`
- UI/빌드: `src/ui/components/DataTable/index.tsx`, `tools/build/`, `tools/babel-plugin-sport-functions/`
