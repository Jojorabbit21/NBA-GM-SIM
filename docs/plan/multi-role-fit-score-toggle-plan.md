# 멀티플레이어 역할 적합도 점수(ArchetypeRatings) 토글 노출 — 계획

> **주의 — 이름이 비슷한 다른 문서와 혼동 금지**: 이 문서는 `archetypeSystem.ts`의 `ArchetypeRatings`
> (playType 액터/패서 선정 가중치, 필드명만 "아키타입"이지 분류 시스템 아님)를 다룬다. 사용자가 실제로
> DB에 저장된 "Passing Guard"/"Combo Guard" 같은 **선수 정체성 아키타입 + 태그**를 멀티에 적용하는 걸
> 원해서 작성한 문서는 별도로 [multi-player-archetype-tags-plan.md](multi-player-archetype-tags-plan.md)에
> 있다 — 그게 진짜 요청이었고, 이 문서는 참고용으로만 남겨둔다.

**상태**: **폐기 (2026-07-28)** — 애초에 사용자의 실제 요청 대상이 아니었던 문서(위 안내 참조). 사용자가
명시적으로 폐기 지시.
**작성일**: 2026-07-28
**관련 문서**: [player-usage.md](../engine/player-usage.md#역할-적합도-점수-role-fit-score--pickweightedactor의-rawscore-입력), [player-archetypes.md](../engine/player-archetypes.md), [dev-log.md](../history/dev-log.md)("spacer 아키타입…", "역할 적합도 점수 11종…", "archetypes.rebounder dead code 삭제" 항목)

---

## 0. 결론 요약

**엔진 쪽은 이미 100% 멀티플레이어 대응이 끝나 있다.** `archetypesEnabled`는 `SimSettings`의 필드이고,
`SimSettings`는 멀티플레이어 `rooms.sim_settings` JSONB 컬럼 → 서버 `simRunner.ts` → `runFullGameSimulation`
경로를 통해 싱글플레이어와 **완전히 동일한 엔진 함수**(`createGameState` → `initTeamState` →
`calculatePlayerArchetypes`)로 흘러간다. 별도의 멀티 전용 시뮬레이션 코드 경로는 없다.

**실제로 빠진 건 UI 한 곳뿐이다.** 멀티플레이어 세션 설정 화면(`LeagueSettingsView.tsx`)의 "엔진 설정"
섹션이 `injuriesEnabled`/`garbageTimeEnabled`/정규화 강도 3개만 하드코딩해서 노출하고 있고,
`archetypesEnabled`용 체크박스가 없다. 이것 때문에 멀티플레이어에서는 `room.sim_settings.archetypesEnabled`를
쓸 방법이 없어서 항상 `undefined` → 엔진의 기본 disabled 상태로 굳어 있다.

즉 이번 작업은 **엔진 로직 변경이 전혀 필요 없는, 순수 UI 노출 작업**이다. 다만 "노출한다"는 것 자체가
멀티플레이어 시뮬레이션 결과(어시스트 분배, 슛 시도 분포, 미스매치 판정, 헬프 디펜스 블락)를 바꾸는
**진짜 밸런스 변경**이므로, 아래 3장(영향 분석)을 반드시 검토하고 진행 여부를 결정해야 한다.

---

## 1. 현재 데이터 흐름 (조사 결과, 코드 기준)

```
[싱글플레이어]
SimSettingsModal.tsx (SIM_SETTINGS_META 전체 렌더링, archetypesEnabled 포함)
  → saves.sim_settings? (또는 앱 상태) → simulateGame() → runFullGameSimulation()
  → createGameState(..., simSettings) → initTeamState(..., simSettings?.archetypesEnabled)
  → calculatePlayerArchetypes(attr, condition, archetypesEnabled)

[멀티플레이어 — 이미 존재하는 경로]
LeagueSettingsView.tsx "엔진 설정" 섹션 (injuriesEnabled/garbageTimeEnabled/정규화만 노출)
  → handleSaveSimSettings() → updateLeagueSettings({ simSettings }) → rooms.sim_settings (DB)
  → [경기 시뮬레이션 시점] server/src/simRunner.ts:121 `room.sim_settings` 재조회
  → runFullGameSimulation() → createGameState() → initTeamState() → calculatePlayerArchetypes()
  (↑ 싱글과 완전히 동일한 함수 — server/src/shared/engine/pbp/* 미러)
```

핵심 확인 사항:
- `server/src/simRunner.ts:121`에서 **경기를 실제로 시뮬레이션하는 매 호출마다** DB에서 `room.sim_settings`를
  새로 읽는다(캐싱 없음). 즉 관리자가 설정을 저장하면 **그 다음 시뮬레이션부터 즉시 반영** — 스케줄러/워커풀
  쪽을 별도로 손댈 필요가 없다. (`scheduler.ts` → `simWorkerPool.runSimulationInWorker()` → 워커 스레드 내부에서
  `simRunner.ts`의 `runSimulation()`을 그대로 호출하는 구조라 워커 풀 자체는 `sim_settings`를 모른 채 그냥
  paramater로 `roomId`/`gameId`만 넘긴다.)
- `updateLeagueSettings()`(`services/multi/leagueService.ts:340`)는 `p.simSettings` 객체를 필드 검증 없이
  통째로 `rooms.sim_settings`에 저장한다 — 타입은 `SimSettings`(부분 아님, 전체) 이므로 `handleSaveSimSettings`가
  `{...DEFAULT_SIM_SETTINGS, ...(room?.sim_settings ?? {}), ...}`로 항상 완전한 객체를 만들어 보내는 패턴을
  그대로 따르면 된다.
- 멀티플레이어 선수 데이터는 `server/src/shared/dataMapper.ts`의 `mapRawPlayerToRuntimePlayer`/`buildTeamForSim`을
  쓰는데, 이는 클라이언트 `services/dataMapper.ts`와 미러 쌍이라 `attr` 셰이프(threeVal/shotIq/handling/passIq/
  strength/height/weight/hustle 등)가 싱글플레이어와 100% 동일함을 확인함 — 11개 역할 점수 공식이 참조하는
  능력치 중 멀티에서만 없는 필드는 없다.
- `services/multi/engineStateAdapter.ts`의 `loadEngineState()`는 `room.sim_settings`를 `EngineGameState`로
  변환하는 어댑터가 있지만, **현재 이 함수를 호출하는 곳이 코드베이스에 없음**(향후 M2용으로 미리 만들어둔
  인프라로 보임) — 이번 작업과 무관, 건드릴 필요 없음.

---

## 2. 필요한 변경 (전부 UI, 엔진/DB 스키마 변경 없음)

### 2-1. `views/multi/league/LeagueSettingsView.tsx`

1. **state 추가** (L88-90 부근, 기존 `injuriesEnabled`/`garbageTimeEnabled` 패턴과 동일):
   ```ts
   const [archetypesEnabled, setArchetypesEnabled] = useState(DEFAULT_SIM_SETTINGS.archetypesEnabled);
   ```
2. **로드 동기화** (L145-147 부근, `room?.sim_settings`에서 복원하는 useEffect):
   ```ts
   setArchetypesEnabled(room?.sim_settings?.archetypesEnabled ?? DEFAULT_SIM_SETTINGS.archetypesEnabled);
   ```
3. **저장 payload에 추가** (L228 `handleSaveSimSettings`의 `simSettings: {...}` 객체 안):
   ```ts
   archetypesEnabled,
   ```
4. **체크박스 UI 추가** (L384-417 부근, `injuriesEnabled`/`garbageTimeEnabled` 체크박스와 동일한 마크업 패턴).
   싱글플레이어 설정 UI가 "아키타입 시스템 (실험적)"이라는 라벨을 쓰는 것과 통일하고, 이 토글이 멀티에서는
   "관리자가 켜면 세션 전체(모든 유저)에 적용된다"는 걸 명시하는 문구를 추가로 넣는 걸 권장:
   > "역할 적합도 점수(아키타입) 시스템 — 켜면 선수의 볼핸들링/슈팅/수비 능력치 조합에 따라 액터 선택,
   > 미스매치 판정, 헬프 디펜스가 더 정교해집니다. 세션 전체에 적용되며 저장 후 다음 경기부터 반영됩니다."

### 2-2. (선택) `components/multi/CreateLeagueModal.tsx`

리그 생성 시점에는 현재 `normalization`만 초기값으로 넣고 있고 `archetypesEnabled`는 안 넣는다(→ 엔진이
`undefined` 취급 → 기본 disabled, 안전한 기본값). **생성 시점에 토글을 노출할지는 선택 사항** — 굳이 필요
없다면 "리그 생성 후 세션 설정에서 켠다"로 충분하다. UX상 필요하다고 판단되면 여기에도 같은 체크박스를
추가하고 `simSettings: { normalization: {...}, archetypesEnabled } as any`로 확장.

### 2-3. 타입/스키마

- `SimSettings` 타입(`types/simSettings.ts`)에 이미 `archetypesEnabled: boolean` 필드가 있고, 서버 미러
  (`server/src/shared/types/simSettings.ts`)도 동일 — **변경 불필요**.
- `rooms.sim_settings`는 이미 JSONB 자유 형식 컬럼 — **마이그레이션 불필요**.
- `UpdateLeagueSettingsParams.simSettings?: SimSettings` — **타입 변경 불필요** (이미 전체 타입 받음).

### 2-4. 문구 정정 (부수 작업)

`types/simSettings.ts:151`의 `SIM_SETTINGS_META` 중 `archetypesEnabled` 항목 설명이 아직 예전 문구
`"12종 선수 아키타입 활성화 (실험적)"`로 남아있음 — 이번 세션에서 `rebounder`를 삭제해 11종이 됐으므로
`"11종 역할 적합도 점수 활성화 (실험적)"`로 함께 정정 권장(싱글플레이어 `SimSettingsModal.tsx`가 이 문구를
그대로 렌더링하므로 사용자에게 노출되는 실제 오탈자).

---

## 3. 영향 분석 (진짜 밸런스 변경 — 반드시 검토)

토글을 켜는 순간부터 아래 3개 시스템이 "50 고정값"에서 "실제 능력치 기반 연속값"으로 바뀐다
(이미 지난 세션에서 11개 공식 자체는 실계산으로 살려뒀고, 토글은 그 스위치 역할만 함):

| 시스템 | 위치 | disabled(현재) | enabled(변경 후) |
|--------|------|----------------|-------------------|
| 액터/패서 선택 가중치 | `playTypes.ts` (Iso/PnR_Handler/PnR_Roll/PnR_Pop/PostUp/CatchShoot/Cut/Handoff/Transition/OffBallScreen/DriveKick, 11개 플레이타입) | 모든 선수가 동일 50점 → 사실상 다른 가중치(`attr.*` 보정항)에만 의존 | 핸들링/슈팅/스크린/포스트 등 실제 능력치 차이가 액터 선택 확률에 직접 반영 — 스팟업 슈터는 CatchShoot에서, 볼핸들러는 Iso/PnR에서 더 자주 선택됨 |
| 미스매치 판정 | `flowEngine.ts:258-262`(서버 기준) | `skillGap`이 거의 항상 0 근처 → `hitRate -= 0.03` 페널티가 사실상 상시 적용 | 공격수 spacer/driver/postScorer vs 수비수 perimLock/rimProtector 실제 격차가 15+ 나면 유리한 쪽에 히트레이트 보너스/페널티 발생 — 미스매치 활용이 실제로 득점에 영향 |
| 헬프 디펜스 블락 보너스 | `possessionHandler.ts:977` | `rimProtector` 고정 50 < `HELP_RIM_THRESHOLD(75)` → 조건 항상 거짓, 완전히 죽어있음 | 림 프로텍터형 선수(블락/인테리어 수비/버티컬 우수)가 코트에 있으면 헬프 디펜스 블락 확률 상승 — 엘리트 빅맨의 수비 가치가 처음으로 반영됨 |

### 3-1. 게임플레이 영향

- **박스스코어 분포 변화**: 어시스트/슛 시도가 "선수 유형에 안 맞는 포지션에 강제로 캐스팅"되던 것에서
  실제 스킬셋에 맞게 재분배됨 (예: 3점 능력치 0인 선수가 CatchShoot 액터로 뽑히는 빈도 감소 — 이번 세션에서
  고친 주바치 코너3 버그와 별개로, `spacer` 점수 자체가 살아있어야 CatchShoot 선택 단계에서부터 걸러짐).
- **엘리트 수비수 가치 상승**: 헬프 디펜스 블락이 처음으로 실제 작동하므로, 림 프로텍터형 빅맨을 보유한
  팀의 실제 수비 지표(블락, 상대 FG% 억제)가 개선될 가능성이 높음 — CPU 트레이드 엔진/GM 프로필이 이런
  변화를 트레이드 가치 평가에 반영하지는 않으므로(트레이드 가치 공식은 `archetypes.*`를 참조하지 않음,
  OVR/샐러리 기반) **당장 트레이드 시장에 직접적 영향은 없음**.
- **미스매치 전술 활용 가능**: 사용자가 슬라이더/전술로 특정 미스매치를 유도하는 플레이(예: 스몰볼로
  느린 빅맨을 스위치시켜 스팟업 슈터와 매치업)가 처음으로 통계적으로 의미 있어짐 — 전술 슬라이더의
  체감 효과가 커질 수 있음.

### 3-2. 멀티플레이어 특유의 리스크

- **공정성**: 토글은 세션(룸) 전체에 적용되는 전역 설정이라 특정 유저에게 유리하게 작동하지 않음
  (이미 `injuriesEnabled`/`garbageTimeEnabled`와 동일한 패턴) — 다만 **로스터 구성에 따라 팀별 수혜
  정도가 다를 수 있음**. 예: 이미 스킬셋이 뚜렷한 스페셜리스트(엘리트 스팟업 슈터, 엘리트 림 프로텍터)로
  로스터를 짠 팀은 이 변경으로 실제 이득을 보고, 능력치가 밋밋하게 고른 팀은 변화가 적음. 드래프트가 이미
  끝난 세션에서 시즌 중간에 켜면 "이제 와서 로스터 구성 유불리가 갈린다"는 불만이 나올 수 있음 →
  **드래프트 시작 전(리그 생성 직후)에 결정하고 고정하는 걸 권장**, 시즌 진행 중 토글은 지양.
- **캐시된 통계와의 정합성**: `services/multi/gameLeadersCache.ts`(PTS/REB/AST 리더보드 localStorage 캐시)는
  게임별 델타 fetch 방식이라 이미 시뮬레이션된 과거 경기 결과에는 영향 없음 — 토글 전후 경기가 섞여도
  캐시 정합성 문제는 없음(과거 경기는 과거 결과 그대로, 이후 경기부터 새 로직 적용).
- **재현성/디버깅**: 관리자가 시즌 중간에 토글을 켰다 껐다 반복하면 "왜 이 경기만 다르게 나왔지"를
  추적하기 어려워짐 — `rooms.sim_settings` 변경 이력을 별도로 기록하지 않으므로(현재 최신 상태만 저장),
  필요하면 `LeagueSettingsView.tsx`의 저장 버튼 클릭 시 간단한 감사로그(누가/언제 무엇을 바꿨는지)를
  덧붙이는 것도 고려할 수 있음 — 이번 최소 구현 범위에는 포함하지 않음, 별도 논의 필요.

### 3-3. 성능 영향

- **없음.** 11개 공식은 이미 매 `initTeamState()` 호출마다(경기당 1회, 팀당) 계산되고 있음(disabled여도
  11개는 실계산 후 버려지는 게 아니라애초에 항상 계산됨 — 지난 세션에서 `disabled ? 50 : getVal(...)`
  구조를 없앴기 때문). 토글은 단지 "50으로 override할지 말지"만 분기하던 것도 이제는 없다(11개는 이미
  무조건 실계산). 따라서 토글 on/off가 연산량에 주는 차이는 사실상 0.

---

## 4. 검증 계획 (구현 시)

1. `LeagueSettingsView.tsx` 수정 후 `npm run build` — 클라이언트 전용 변경이라 서버 재배포 불필요.
2. 테스트 룸에서 토글 ON → 저장 → 관리자 수동 시뮬레이션(`/multi/leagues/:id/admin/sim`)으로 경기 1개 실행 →
   `game_pbp`에서 해당 경기의 `archetypes` 반영 여부는 직접 관측 어려우므로, 박스스코어 상 특정 스페셜리스트
   선수(예: 3점 능력치 극단적으로 높은/낮은 선수)의 슛존 분포가 싱글플레이어에서 검증했던 패턴과 일치하는지
   확인.
3. 토글 OFF로 되돌렸을 때 기존 동작(현재 상태)과 동일한지 회귀 확인 — `archetypesEnabled: false`가
   `room.sim_settings`에 명시적으로 저장되는 것과, 필드 자체가 없어서 `undefined`인 것이 결과적으로
   동일하게 동작하는지(둘 다 disabled) 확인.
4. `docs/history/dev-log.md`에 UI 변경 기록 (CLAUDE.md 규칙상 UI 변경도 예외 없이 기록).

---

## 5. 결정이 필요한 사항 (구현 착수 전 확인)

1. 리그 생성 모달(`CreateLeagueModal.tsx`)에도 토글을 노출할지, 세션 설정 화면에만 둘지.
2. 문구를 싱글플레이어와 동일하게 "실험적"으로 유지할지, 아니면 이미 이번 세션에서 11개 공식을 실계산으로
   되살렸으니 "실험적" 라벨을 뗄지 (개인적으로는 아직 멀티플레이어 실전 검증 전이므로 "실험적" 유지를 권장).
   싱글플레이어 쪽 SIM_SETTINGS_META의 "12종" 오탈자를 이번에 "11종"으로 같이 고칠지(§2-4).
3. 시즌 진행 중 토글 변경을 막을지(§3-2 공정성 이슈) — 막는다면 `isInProgress` 조건으로 이 체크박스만
   비활성화하는 추가 분기가 필요함(현재 "엔진 설정" 섹션 자체는 `isInProgress`와 무관하게 항상 노출됨,
   L374 주석 "관리자 전용, 진행 중 세션에서도 변경 가능").
