# 멀티플레이어 선수 아키타입(Primary/Secondary) + 특성 태그 적용 — 계획

**상태**: **폐기 (2026-07-28)** — PBP 엔진 결과에 영향이 없는 순수 표시/FA 연봉용 시스템으로 확인됨
(§2 "엔진 시뮬레이션과 무관함을 확인" 참조). 게임플레이에 실질적 영향이 없어 굳이 지금 멀티에 이식할
우선순위가 낮다고 판단, 사용자가 명시적으로 폐기 지시.
**작성일**: 2026-07-28
**대상 시스템**: `services/playerDevelopment/archetypeEvaluator.ts` — DB `archetypes` 테이블에 저장된
커스텀 라벨(예: "Passing Guard", "Combo Guard")로 표시되는 **선수 정체성 아키타입(Primary/Secondary)**과
**14개 특성 태그**(Elite Finisher, Floor Spacer 등). 상세: [player-archetypes.md](../engine/player-archetypes.md)
**관련(다른 시스템) 문서**: [multi-role-fit-score-toggle-plan.md](multi-role-fit-score-toggle-plan.md) — 이름이
비슷하지만 완전히 다른 시스템(playType 액터 선정용 역할 적합도 점수)이니 혼동 주의.

---

## 0. 결론 요약

이 시스템은 **서버 쪽에 아예 존재하지 않는다.** `assignArchetypes()`(선수 능력치로 Primary/Secondary
아키타입 + 14개 특성 태그를 산정하는 함수)는 client 전용 파일(`services/playerDevelopment/
archetypeEvaluator.ts`)이고, `server/src/shared/`에 미러가 없으며, `server/src/` 어디서도 호출되지
않는다(grep으로 확인). 결과적으로 멀티플레이어에는 이 아키타입/태그 데이터 자체가 만들어지지 않는다.

다만 좋은 소식은, **이 함수가 의존하는 DB 연동 인프라는 이미 서버에 완전히 구축되어 있다.** 관리자가
`archetypes` 테이블에 저장한 가중치/포지션/라벨/태그 설정(`getWeightConfigSync`/`getPositionConfigSync`/
`getLabelConfigSync`/`getTagConfigSync`)은 `server/src/shared/services/admin/gameConfigService.ts`에
이미 미러되어 있고, 서버 부팅 시 `preloadGameConfig()`로 로드, 리그 드래프트 완료(`finalize.ts`) 시
`refetchGameConfig()`로 최신화까지 이미 구현돼 있다(다른 목적 — `ovrEngine.ts`의 OVR 계산용 — 으로 이미
쓰이고 있음). 즉 **인프라는 재사용 가능하고, 순수하게 `archetypeEvaluator.ts` 함수 자체를 서버에 미러하고
호출 지점 하나를 추가하는 작업**이다.

---

## 1. 헷갈리지 않도록 — 이 코드베이스의 "아키타입" 3종 정리

이번에도 혼동하지 않기 위해 명확히 구분한다:

| 시스템 | 파일 | 저장 위치 | 무엇을 하는가 | 멀티플레이어 상태 |
|--------|------|-----------|--------------|-------------------|
| **A. 역할 적합도 점수** | `archetypeSystem.ts` | `player.archetypes` (경기 중 in-memory) | playType 액터/패서 선정 가중치. 분류 아님 | 이미 완전히 연결됨(별도 문서 [multi-role-fit-score-toggle-plan.md](multi-role-fit-score-toggle-plan.md), UI 노출만 부족) |
| **B. OVR 엔진 아키타입** | `utils/ovrEngine.ts`의 `OvrArchetype` | `player.archetype` / `player.secondaryArchetype` (string, OVR 계산 시 1회성 산출) | OVR 계산용 보정 + 드래프트 풀 등에 표시되는 라벨 | **이미 멀티에 존재** — `server/src/shared/dataMapper.ts`가 동일하게 계산해서 세팅, `server/src/DraftRoom.ts`도 사용, `components/multi/DraftPoolModal.tsx`가 이미 표시 중 |
| **C. 선수 정체성 아키타입 + 태그** (이번 문서 대상) | `services/playerDevelopment/archetypeEvaluator.ts` | `player.archetypeState` (`{primary, secondary, tags, moduleScores, lastUpdated}`, 오프시즌 갱신) | Primary/Secondary 배지 + 14개 특성 태그, FA 연봉 산정용 `FARole` 매핑 | **서버에 전혀 없음** — 이 문서의 대상 |

**B와 C의 관계 (중요, 헷갈리기 쉬운 부분)**: 두 시스템은 22종 아키타입 이름과 가중치 공식이 사실상
동일하다 — 직접 대조한 결과(`PRIMARY_CREATOR_GUARD`/`primary_creator_guard` 기준) `mod.playmaking×0.38 +
mod.shotCreation×0.22 + mod.rimFinishing×0.12 + mod.spotUpShooting×0.08 + mod.poaDefense×0.08 +
mod.motorAvailability×0.12`로 완전히 동일한 가중치. 라벨도 같은 DB 테이블(`archetypes.labels`)을
공유한다(`getLabelConfigSync()`, `type.toUpperCase()`로 같은 키 스페이스 매칭) — 그래서 관리자가 저장한
"Passing Guard" 같은 커스텀 라벨은 B/C 어느 쪽에서 조회하든 동일하게 나온다.

**차이는 세 가지**:
1. **태그** — B(ovrEngine)는 특성 태그 개념 자체가 없다(내부적으로 `calcTagBonus`라는 OVR 보정용 숫자
   보너스만 있고, 사용자에게 보여지는 태그 배지가 아님). 태그 배지는 C(archetypeEvaluator)에만 있다.
2. **시즌 성적 기반 재평가** — B는 능력치만으로 1회성 계산(OVR 계산 파이프라인의 일부). C는
   `assignArchetypes(player, season, prevState, seasonStats)`로 시즌 스탯 기반 StyleFit 보정(±5)과
   기존 아키타입 관성 보너스(+5)까지 반영해 매 오프시즌 갱신된다.
3. **저장 위치** — B는 `player.archetype`(단순 문자열, 매번 재계산되는 파생값). C는
   `player.archetypeState`(객체, `SavedPlayerState`에 영속화되어 오프시즌 사이에 유지됨).

즉 지금 멀티플레이어 드래프트 풀에 뜨는 "Passing Guard" 같은 라벨은 **B(ovrEngine) 쪽 결과물**이고,
로스터에 들어온 뒤에도 유지되며 태그가 붙는 **C(진짜 선수 정체성 시스템)는 멀티에 전혀 없다** — 이게
정확한 현재 상태다.

---

## 2. 조사 결과 — C 시스템의 현재 코드 구조

```
services/playerDevelopment/archetypeEvaluator.ts   ← 계산 로직 (client 전용, 서버 미러 없음)
    calcModuleScores(player)         11개 역할 모듈 점수
    getEligibleArchetypes(position)  포지션 게이트
    calcArchetypeScore(modules, type) 22개 아키타입 가중 합산
    calcStatStyleFit(seasonStats)    시즌 성적 기반 보정
    calcTraitTags(modules, player)   14개 특성 태그 (DB dbTags 우선, 없으면 하드코딩 폴백)
    assignArchetypes(player, season, prevState?, seasonStats?)  ← 메인 함수
    getArchetypeDisplayInfo(type)    라벨 조회 (DB 커스텀 라벨 우선)
    getTraitTagDisplayInfo(tag)      태그 라벨/색상 조회

의존성 (이미 서버에 존재):
    getWeightConfigSync/getPositionConfigSync/getTagConfigSync/getLabelConfigSync
        ← services/admin/gameConfigService.ts
        ← 서버 미러: server/src/shared/services/admin/gameConfigService.ts (이미 있음, ovrEngine.ts가 사용 중)

호출처 (전부 client):
    hooks/useGameData.ts    — 세이브 로드 시 player.archetypeState 없으면 즉시 계산 (지연 계산 패턴)
    views/PlayerDetailView.tsx — 표시 시점에 없으면 useMemo로 즉시 계산 (폴백)
    services/playerDevelopment/playerAging.ts — 오프시즌에 prevState+seasonStats로 갱신 호출

server/src 전체 grep 결과: assignArchetypes 호출 0건, archetypeState 참조 0건
    → 멀티플레이어 선수는 이 필드 자체가 생성되지 않음
```

**표시 화면도 없다.** `views/multi/`, `components/multi/`를 전수 검색한 결과 archetype/태그를 보여주는
화면은 `DraftPoolModal.tsx`(위 표의 B 시스템, `.archetype`/`.secondaryArchetype`만 표시, 태그 없음)
하나뿐이고, 로스터 화면(`MultiRosterView.tsx`)에는 archetype 관련 코드가 전혀 없다. 즉 C 시스템을
서버에 연결하더라도 지금 당장 보여줄 화면이 없다 — UI 작업이 반드시 같이 필요하다.

**엔진 시뮬레이션과 무관함을 확인 (C 시스템)**: `services/game/engine`, `server/src/shared/engine`을
grep한 결과 `archetypeState`를 참조하는 코드가 0건 — 저장/복원(`useGameData.ts`/`snapshotBuilder.ts`),
오프시즌 갱신(`playerAging.ts`), FA 연봉 산정(`faValuation.ts`), 표시(`PlayerDetailView.tsx`) 5곳이
전부다. **이 시스템은 순수 표시/FA 연봉 산정용이며, 경기 시뮬레이션 결과(승패, 박스스코어)에는 어떤
영향도 주지 않는다.**

**B 시스템(`player.archetype`)은 간접 영향이 있음 — 명확히 구분**: `.archetype` 문자열 자체는 엔진 코드
어디서도 직접 읽지 않지만(grep 확인), 그 분류 결과가 OVR 계산식(`ovrEngine.ts:evaluatePlayerRawOVR`)에
실제로 들어간다:
```ts
const primaryAdj   = (primary.score - posBase) * 0.18   // 1순위 아키타입 적합도 → OVR 가산
const secondaryAdj = (secondary.score - posBase) * 0.08 // 2순위 아키타입 적합도 → OVR 가산
const weakPenalty  = calcFatalWeaknessPenalty(primary.archetype, ...) // 1순위 아키타입별 페널티
rawCurrentOVR = clamp(posBase + primaryAdj + secondaryAdj + ... - weakPenalty - ..., 40, 99)
```
그리고 이 `player.ovr`은 PBP 엔진에서 라이브로 소비된다 — `rotationLogic.ts`(로테이션 순서 정렬),
`substitutionSystem.ts`(스타 선수 판정, 가비지타임 벤치 우선순위), `initializer.ts`(코트 위 최고 OVR
선수 식별). 즉 **"아키타입 분류 → OVR 숫자 변화 → 로테이션/교체/스타 판정 변화 → 시뮬레이션 결과 변화"**라는
한 단계 건너뛴 경로로 실제 영향이 있다. 다만 이건 이미 싱글/멀티 양쪽에서 동일하게 작동 중인 **기존
동작**이고, 이번 문서(C 시스템 멀티 적용)는 이 경로에 전혀 손대지 않으므로 Phase 1 구현으로 인한 신규
밸런스 변화는 없다.

**오프시즌 갱신은 현재 멀티에 붙일 데가 없다.** `services/playerDevelopment/playerAging.ts`(싱글 오프시즌
선수 성장/노화 파이프라인)도 서버 미러가 전혀 없고, `server/src`에 성장/노화/오프시즌 선수 재평가 관련
파일 자체가 없음을 확인(grep 결과 0건). 즉 멀티플레이어에는 "시즌 스탯을 반영해 아키타입을 재평가"할
파이프라인이 아직 없다 — 이건 이번 작업 범위 밖의 훨씬 큰 선행 작업(멀티 선수 성장 시스템 자체 구축)이
필요하다.

---

## 3. 구현 범위 제안 — 2단계로 분리

### Phase 1 (이번에 할 수 있는 범위): 최초 배정만

시즌 스탯 기반 재평가(`prevState`/`seasonStats`)가 없으므로, `assignArchetypes(player, season)`을
`prevState` 없이 호출하면 결과는 **선수의 현재 능력치만으로 결정되는 순수 함수**가 된다 — 즉 능력치가
바뀌지 않는 한 몇 번을 다시 계산해도 항상 같은 결과가 나온다. 이 성질 덕분에 Phase 1은 놀랍도록
단순해진다: **영속화(저장)가 필수가 아니다.** 매번 필요한 시점에 즉시 계산해도 무방하다(연산 자체도
가벼움 — 11개 모듈 점수 + 22개 후보 스코어링, 선수 1명당 밀리초 이하).

1. **서버 미러 생성**: `server/src/shared/services/playerDevelopment/archetypeEvaluator.ts`
   (client 파일을 그대로 복사, import 경로만 `.ts` 확장자 + 상대경로 조정 — 이번 세션에서 다른 엔진
   파일들에 적용한 것과 동일한 미러 패턴, 로직 변경 없음)
2. **호출 지점**: 선수 데이터가 필요한 지점(`server/src/shared/dataMapper.ts`의 `mapRawPlayerToRuntimePlayer`
   /`buildTeamForSim`, 또는 API 응답 직전)에서 `assignArchetypes(player, currentSeason)` 호출해
   `player.archetypeState` 채우기. B 시스템(`player.archetype` 세팅)이 이미 같은 파일의 같은 함수
   안에서 이뤄지고 있으므로 바로 옆에 추가하면 됨.
3. **UI**: 최소 범위로 `MultiRosterView.tsx`(또는 새 선수 카드/모달)에 Primary/Secondary 배지 + 태그
   렌더링 추가 — 싱글 `PlayerDetailView.tsx`의 렌더링 패턴(`getArchetypeDisplayInfo`,
   `getTraitTagDisplayInfo`) 그대로 재사용 가능.
4. **영속화는 선택 사항**: Phase 1 범위에서는 `SavedPlayerState.archetypeState`에 저장하지 않고 매
   요청마다 재계산해도 결과가 항상 동일하므로 문제 없음. 다만 여러 화면에서 반복 계산하는 게 낭비라고
   판단되면, `finalize.ts`의 로스터 초기화 지점(`rosterState[playerId] = { condition: 100 }` 자리)에서
   1회 계산해 같이 저장하는 것도 간단히 가능 — `SavedPlayerState.archetypeState` 필드가 타입에 이미
   있으므로 스키마 변경 불필요.

### Phase 2 (선행 작업 필요, 이번 범위 밖): 시즌 성적 기반 재평가

`calcStatStyleFit()`(시즌 스탯 → 아키타입 보너스)과 관성 보너스(+5)를 살리려면 오프시즌마다
`assignArchetypes(player, season, prevState, seasonStats)`를 호출해야 하는데, 이건 멀티플레이어에
**선수 성장/노화(에이징) 파이프라인 자체가 없어서** 지금은 걸 데가 없다. 멀티 오프시즌 선수 재평가
시스템을 먼저 만들어야 붙일 수 있음 — 별도 계획 문서로 다뤄야 할 규모.

---

## 4. 영향 분석

- **밸런스/시뮬레이션**: 영향 없음 (§2에서 확인 — 엔진 어디서도 `archetypeState`를 참조하지 않음).
- **성능**: 선수 1명당 밀리초 이하 연산. Phase 1처럼 영속화 없이 매번 재계산해도 API 응답 지연에 유의미한
  영향 없음(이미 `buildTeamForSim`이 매 시뮬레이션마다 선수 전원의 OVR/역할점수를 재계산하고 있는 것과
  같은 규모).
- **B 시스템과의 표시 불일치 가능성**: B(드래프트 풀에 뜨는 `.archetype`)와 C(로스터에서 보일
  `.archetypeState.primary`)가 **같은 선수인데 다른 값으로 보일 수 있다** — 가중치 공식은 동일하지만
  모듈 점수 계산에 쓰는 원본 능력치 소스(`Player.ratings` vs `LivePlayer['attr']`)가 완전히 동일한
  스케일/필드인지 별도 검증이 필요함(§1에서 확인한 PRIMARY_CREATOR_GUARD 가중치는 동일하지만, 두 함수의
  `calculateModules`/`calcModuleScores` 입력 정규화 방식까지 100% 동일한지는 이번 조사에서 코드 대조까지는
  하지 않음 — 구현 착수 시 반드시 나란히 놓고 대조 필요). 다르면 "드래프트 풀에서는 Primary Creator라고
  봤는데 로스터에서는 Dual Guard로 나온다" 같은 혼란이 생길 수 있음.
- **FA 시스템 연동**: `ARCHETYPE_TO_FA_ROLE` 매핑은 멀티에 계약/샐러리 시스템 자체가 아직 없어(트레이드
  계획서에서도 확인된 사실) 현재는 아무 효과가 없음 — 향후 멀티 FA 시스템이 생기면 자동으로 연결될
  잠재 가치만 있는 상태.

---

## 5. 결정이 필요한 사항

1. **B/C 불일치 문제를 어떻게 할지** — ①그냥 두 시스템이 별개로 존재하는 걸 허용(현재 싱글플레이어도
   이 상태 그대로임 — 드래프트 화면 따로, PlayerDetailView 따로), ②아예 C의 계산 결과를 B 대신
   `player.archetype`에도 쓰도록 통합(더 큰 리팩터, 이번 문서 범위 밖).
2. **UI를 어디에 먼저 넣을지** — `MultiRosterView.tsx`(로스터 목록에 배지만 간단히) vs 별도 선수 상세
   모달/화면 신규 제작(싱글의 `PlayerDetailView.tsx`에 준하는 컴포넌트, 공수 더 큼).
3. **Phase 1 영속화 여부** — §3-Phase1-4 참고, 저장 없이 매번 재계산(단순)으로 갈지 `finalize.ts`에서
   1회 계산 후 저장(약간의 추가 작업, 화면 간 재계산 낭비 방지)으로 갈지.
