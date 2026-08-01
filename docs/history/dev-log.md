# 개발 히스토리 노트

코드 수정 시(특히 엔진/로직 변경) 전후를 세세히 기록하는 문서. 문제가 생겼을 때 이 문서만 보고
수동 복구(역순 적용)할 수 있는 걸 목표로 한다. **최신 항목이 위로 오도록 역순 추가.**

## 기록 형식

```
## YYYY-MM-DD — 제목

**배경**: 왜 이 변경을 하는지 (어떤 문제/요청에서 시작됐는지)

**변경 파일**:
- `path/to/file.ts` (client)
- `path/to/file.ts` (server 미러)

**Before**:
​```ts
...
​```

**After**:
​```ts
...
​```

**검증**: tsc/build/deploy 결과 요약

**롤백 방법**: Before 블록 내용으로 그대로 되돌리면 됨 (또는 git 커밋 해시)
```

- 미러 쌍(client/server) 변경은 항상 둘 다 기록 — 하나만 롤백하면 미러가 깨지므로 반드시 같이 되돌릴 것.
- 상수/설정값 변경은 값 자체(이전 값 → 이후 값)를 명시.
- 이 문서는 git으로 버전 관리되므로 최악의 경우 `git log -- docs/history/dev-log.md`로도 시점별 상태 추적 가능.

---

## 2026-08-01 — calculateMatchupGap 골밑 defSkill을 strength 단일 비교로 교체

**배경**: 덩크 커브 수정 배포 후 재검증(TEST 10, 128경기)에서 TS% 평균/중앙값은 -2.7%p 내려갔지만
여전히 p90=69.7%/p95=72.1%로 상위권이 과도하게 높음. 사용자가 하위~중위권(p25=50.5%, 최저 27%)은
정상 범위인데 상위권만 튀는 걸 지적 → 매치업 갭 정밀 조사 진행.

`calculateMatchupGap`의 골밑 defSkill(`intDef*0.35+blk*0.30+strength*0.20+vertical*0.15`)을
실측(TEST 10 로스터 320명)으로 검증한 결과:
1. **평균 오프셋 문제**: offPower(strength 평균 71.9) vs defSkill(블렌드 평균 68.3) — "평균적인"
   매치업조차 +3.6 만큼 공격 쪽으로 쏠려 있음(리그 상위 10%끼리 비교해도 +5.3~4.3로 동일 패턴,
   극단치만의 문제가 아니라 스케일 전체의 문제).
2. **이중 반영 문제**: intDef는 이미 `defRating`/`defMod`(flowEngine.ts)에서, blk는 이미
   possessionHandler.ts의 블락 확률 시스템(`blkCfg.BASE_RIM`+`blkBonus` 등, `blkCfg.ENABLED`와
   무관하게 항상 작동)에서 각각 별도로 반영되고 있어 defSkill 블렌드에 또 넣으면 방어력이
   중복 계산됨 (intDef 10pt 상승 시 defMod 경로 -1.5%p + 매치업갭 경로 -0.7%p, 총 -2.2%p로
   의도(-1.5%p)보다 과대).
3. offPower에 vertical/hands 등을 추가로 섞어 평균을 맞추는 방안도 검토했으나, 두 스탯 모두
   리그 평균이 strength(71.9)보다 높아(vertical 78.1, hands 82.4) 오히려 격차가 악화됨을 실측으로
   확인, 폐기.
4. defSkill 가중치만 재조정(blk↓, strength/vertical↑)하는 방안도 검토했으나, blk 비중을 깎으면
   "블락 잘하는 빅맨"이 매치업 갭에서 얻는 정당한 이득이 줄어드는 부작용이 있어 보류.

최종적으로 intDef/blk를 defSkill에서 완전히 제거하고 **strength 단일 비교**로 교체 —
offPower/defSkill이 동일 스탯·동일 모집단이라 리그 평균 갭이 로스터 구성과 무관하게 항상
정확히 0에 수렴함(실측 mp가중평균 73.38 vs 73.38, 오프셋 상수/재보정 불필요). 개별 매치업의
스킬 격차(예: 바클리 strength 97 vs 평범한 수비수)는 의도대로 유지 — "상대 팀에 피지컬 몬스터가
있으면 그만큼 강한 수비수로 대응해야 한다"는 정상 게임플레이로 남겨둠.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateMatchupGap` Rim/Paint 분기)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
if (zone === 'Rim' || zone === 'Paint') {
    const offPower = actor.attr.strength;
    const defSkill = defender.attr.intDef * 0.35 + defender.attr.blk * 0.30
                   + defender.attr.strength * 0.20 + defender.attr.vertical * 0.15;
    return offPower - defSkill;
}
```

**After**:
```ts
if (zone === 'Rim' || zone === 'Paint') {
    const offPower = actor.attr.strength;
    const defSkill = defender.attr.strength;
    return offPower - defSkill;
}
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**추가 수정(같은 날)**: 사용자가 곧바로 퍼리미터(Mid/3PT)도 동일하게 수정 요청 — perDef 역시
`defRating`/`defMod`에서 이미 반영되는 중복이었음을 확인, 골밑과 같은 논리로 퍼리미터 defSkill도
`(defender.attr.speed + defender.attr.agility) / 2`로 교체(offPower와 완전 동일 스탯 구성).

**Before (퍼리미터)**:
```ts
const offPower = (actor.attr.speed + actor.attr.agility) / 2;
const defSkill = defender.attr.perDef * 0.35 + defender.attr.agility * 0.25
                + defender.attr.speed * 0.20 + defender.attr.stl * 0.20;
return offPower - defSkill;
```

**After (퍼리미터)**:
```ts
const offPower = (actor.attr.speed + actor.attr.agility) / 2;
const defSkill = (defender.attr.speed + defender.attr.agility) / 2;
return offPower - defSkill;
```

**검증(추가 수정 포함)**: `tsc` 30개 베이스라인 유지, `vite build` 클린 빌드 성공. 아직 배포 전.

---

## 2026-08-01 — DUNK_OFF_CURVE 압축 (덩크 능력치 80+ 캡 포화 수정)

**배경**: "TEST 9 - ADJUST TS" 방(v98 배포 후 170경기, shotIq/offConsist 수정 반영된 데이터)에서
바클리(dunk 99) FG% 72.9%/TS% 75.5%로 여전히 극단적으로 높아 재조사. shot_events 슛타입별
breakdown 결과 덩크가 97시도 90.7%로 압도적 원인이었음. 계산해보니 `DUNK_OFF_CURVE`가 dunk=90
에서 이미 +42.9%p를 줘서 `INSIDE_BASE_PCT`(57%)와 합치면 99.9%(수비 반영 전)로 95% 하드캡에
근접/초과 — 즉 dunk 80+인 선수는 상대 수비자가 누구든 성공률이 사실상 고정값이 되는 구조적
결함. 다른 4개 골밑 슛타입(레이업+13.5%p, 미드페인트점퍼+18.7%p, 훅+3.3%p, 플로터+1.3%p, 전부
99점 기준)은 캡까지 여유가 충분해 문제없음을 확인 — `INSIDE_BASE_PCT`를 낮추면 이미 정상인
레이업/플로터/훅까지 부작용(특히 평범한 선수의 골밑 득점력 과도하게 하락)이 생기므로 배제하고,
유독 폭이 큰 `DUNK_OFF_CURVE`만 약 60% 스케일로 압축하기로 사용자와 합의.

**변경 파일**:
- `services/game/config/constants.ts` (client, `SIM_CONFIG.SHOOTING.DUNK_OFF_CURVE`)
- `server/src/shared/game/config/constants.ts` (server 미러)

**Before**:
```ts
// [Dunk] 65%→92% (균일 상승, 수비 영향 최대)
// x=0 기준점 추가: dunk 능력이 낮은 선수는 페널티 적용
DUNK_OFF_CURVE: [
    [0, +0.059], [40, +0.199], [55, +0.269], [70, +0.339], [80, +0.389],
    [90, +0.429], [99, +0.469],
] as [number, number][],
```

**After**:
```ts
// [Dunk] 60.5%→85% (균일 상승, 수비 영향 최대)
DUNK_OFF_CURVE: [
    [0, +0.035], [40, +0.119], [55, +0.161], [70, +0.202], [80, +0.232],
    [90, +0.256], [99, +0.280],
] as [number, number][],
```

INSIDE_BASE_PCT(57%)는 변경 없음. dunk=99 기준 (베이스+커브) 수비 반영 전 합계가
103.9%(캡 초과) → 85.0%(캡 여유)로 하향. 바클리(dunk 99) 시뮬레이션: 평균 수비 상대
~92%(실측 90.7%) → ~73% 예상.

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**참고**: 매치업 갭 보너스(`hitRate += gapNormalized * 0.12` → 0.08 제안, flowEngine.ts)는
논의만 하고 아직 미착수 — 바클리 Floater(71.4%)/Jumper-Paint(73.2%)가 순수 커브 예측보다도
15~20pt 높게 나온 부분과 관련.

---

## 2026-07-31 — offConsist 핫/콜드 비대칭 수정 (TS% 상위권 인플레 부가 원인)

**배경**: 바로 아래 shotIq 노이즈 편향 수정에 이어서, TS% 인플레의 또 다른 원인으로 지목했던
hot/cold 스트릭의 offConsist 처리를 논의. 기존 코드는 콜드 스트릭(temperatureBonus<0)일 때만
offConsist 기반 `consistencyRecover`로 페널티를 완화하고, 핫 스트릭(양수)일 땐 전혀 건드리지
않았음 — shotIq처럼 "의도와 코드가 어긋난 버그"는 아니고 주석("콜드 스트릭 완화")과 코드가
일치하는 의도된 설계였지만, 결과적으로 offConsist가 높은 선수(대체로 엘리트)일수록 핫/콜드
기댓값이 플러스로 치우치는 동일 계열의 문제였음. 사용자에게 (1)양방향 대칭 전환 (2)비대칭
유지하되 계수 축소 (3)그대로 보류 중 택1로 질문 → "양방향 대칭으로 전환"(꾸준함=기복 자체가
작다는 의미로 재정의) 선택.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateHitRate` 내 8번 Hot/Cold Streak 블록)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
// 콜드 스트릭 완화: offConsist가 높으면 멘탈 회복
if (temperatureBonus < 0) {
    const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
    temperatureBonus *= (1 - consistencyRecover);
}
hitRate += temperatureBonus;
```

**After**:
```ts
let temperatureBonus = actor.hotColdRating * 0.04 * (actor.tendencies?.confidenceSensitivity ?? 1.0);
// offConsist: 핫/콜드 진폭을 양방향 대칭으로 축소 (꾸준함 = 기복이 작음)
const consistencyRecover = (actor.attr.offConsist / 100) * 0.5;
temperatureBonus *= (1 - consistencyRecover);
hitRate += temperatureBonus;
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨 (`if (temperatureBonus < 0) { ... }` 가드 복원).

---

## 2026-07-31 — shotIq 노이즈 편향 수정 (TS% 상위권 과대 인플레 원인)

**배경**: "32 TEST 6" 실측 데이터에서 리그 TS% 중앙값(60.1%)은 실제 NBA 대비 소폭만 높은데,
상위권(p90=70.7%, 조던 75.3%, 하든 72.3% 등)은 역대 최고 시즌 기록급으로 과대 인플레된 현상을
조사. `calculateHitRate`의 shotIq 노이즈 로직이 원인 — 주석상 의도는 "대칭 노이즈(shotIq 높으면
상방/낮으면 하방 위주로 흔들림)"였지만 실제 코드는 shotIq>70이면 `Math.random()*range`(항상 0
이상)만, <70이면 `-Math.random()*-range`(항상 0 이하)만 뽑혀 **매 슛 확정 편향 보너스/페널티**로
작동하고 있었음. shotIq=99 선수는 매 슛 평균 +1.16%p가 공짜로 붙는 구조. DB 조회 결과 TS% 상위권
선수들의 shotIq 평균(≈85)이 리그 중앙값(75)을 크게 상회 — 상위권 인플레와 정확히 일치하는 것으로
확인. 사용자에게 대칭 노이즈 원복/계수 축소/결정론적 보너스 전환 중 택1로 질문 → "대칭 노이즈로
원복"(원래 의도대로) 선택.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client, `calculateHitRate` 내부)
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러)

**Before**:
```ts
const shotIqRange = (actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
const shotIqNoise = shotIqRange !== 0
    ? (shotIqRange > 0 ? Math.random() * shotIqRange : -Math.random() * -shotIqRange)
    : 0;
```

**After**:
```ts
// shotIq: 대칭 노이즈 (평균 0, 진폭만 |shotIq-70|에 비례)
const shotIqRange = Math.abs(actor.attr.shotIq - S.CONSIST_BASELINE) * S.SHOTIQ_NOISE_COEFF;
const shotIqNoise = shotIqRange !== 0 ? (Math.random() * 2 - 1) * shotIqRange : 0;
```

**검증**: `cd server && npx tsc -p tsconfig.json` 30개 베이스라인 에러 그대로(신규 없음),
`npx vite build` 클린 빌드 성공. 아직 fly.io 배포 및 실측 재검증 전.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

**참고**: `offConsist`의 hot/cold 스트릭 비대칭(콜드 페널티만 완화, 핫 보너스는 그대로)도 동일 계열
문제로 지목했으나 이번엔 shotIq만 수정 — offConsist 쪽은 아직 미착수.

---

## 2026-07-31 — PostUp/PnR_Roll에 playStyle 보정 소급 적용

**배경**: 바로 아래 항목(Iso/PnR_Handler)에서 다듬은 `playStyle`(-1 패스~+1 슛) 보정을 예고했던
대로 PostUp/PnR_Roll에도 소급 적용 — 4개 킥아웃 플레이타입 전부 동일한 패턴(postPassing 지수
커브 × playStyle 보정)으로 통일.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PostUp`/`PnR_Roll` 케이스의 `kickChance`/`rollKickChance`를 `const`→`let`로 변경하고
  `playStyle` 보정 곱연산 추가 (Iso/PnR_Handler와 동일하게 `PLAY_SELECTION.PLAYSTYLE_PASSER_K` 재사용,
  PnR_Roll은 `screener.tendencies.playStyle` 기준 — actor 변수명이 이 케이스에선 `screener`)

**Before/After**:
```ts
// Before
const kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

// After
let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);
const postPs = actor.tendencies?.playStyle ?? 0;
kickChance *= (1 - postPs * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);
```
(PnR_Roll도 동일 패턴, 변수명만 `rollKickChance`/`rollPs`/`screener` 기준)

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이제 PostUp/PnR_Roll/Iso/
PnR_Handler 4개 플레이타입 전부 동일한 킥아웃 설계(지수 커브 + playStyle 보정)로 통일됨.

**롤백 방법**: `kickChance`/`rollKickChance`를 `let`→`const`로 되돌리고 playStyle 보정 두 줄 제거.

---

## 2026-07-31 — Iso/PnR_Handler 킥아웃 도입 (playStyle 텐던시 최초 반영)

**배경**: PostUp/PnR_Roll에 이어 나머지 두 후보(Iso/PnR_Handler)에도 동일한 킥아웃 메커니즘 적용.
두 플레이타입 다 액터 선정 기준이 `isoScorer + handler*0.5`로 동일해 하든/루카/르브론식 "1대1·
픽앤롤에서 더블팀 유도 후 킥아웃"을 표현하기에 적합. 여기서 처음으로 `[SaveTendency] playStyle`
(-1 패스~+1 슛)을 킥아웃 확률에 반영 — 새 상수를 만들지 않고 `pickWeightedActor`가 이미 슈터/
패서 픽 가중치에 쓰던 `SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K`(0.25)를 재사용. 설계
검증을 위해 DB에서 Iso/PnR_Handler 액터 점유율 상위 10명(`isoScorer+handler*0.5` 직접 계산)을
뽑아 실제 성향에 맞춰 임의 배정한 playStyle로 시뮬레이션 — 매직 존슨(playStyle -0.8) 48.0% vs
카이리 어빙(+0.4) 23.9%처럼, 순수 스킬만으론 크지 않았을 격차가 성격 차이로 벌어지는 걸 확인
후 확정. PostUp/PnR_Roll에는 아직 `playStyle` 미적용 — 이번에 다듬은 뒤 소급 적용 예정(사용자
확정, 아직 미착수).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.ISO_KICKOUT`, `PNR_HANDLER_KICKOUT` 신규 추가 (둘 다 `PROB_MAX=0.40`,
  나머지는 `POST_KICKOUT`과 동일 구조)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `Iso`/`PnR_Handler` 케이스에 킥아웃 분기 추가 (PostUp/PnR_Roll과 동일 구조 +
  `playStyle` 보정 곱연산 추가)
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — 킥아웃 커멘터리 블록을 `isPostUp` 불리언 분기에서 `playType` 키 기반 룩업 테이블
  (`Record<string, {threept,rimPaint,mid}>`)로 리팩터링, Iso/PnR_Handler 12블록(득점6+미스6) 추가

**Before/After (킥아웃 확률 계산)**:
```ts
// Before (PostUp/PnR_Roll 패턴 그대로)
let kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

// After (Iso/PnR_Handler — playStyle 보정 추가)
let kickChance = ikCfg.PROB_MIN + (ikCfg.PROB_MAX - ikCfg.PROB_MIN) * Math.pow(passingNorm, ikCfg.CURVE_EXPONENT);
const ps = actor.tendencies?.playStyle ?? 0;
kickChance *= (1 - ps * SIM_CONFIG.PLAY_SELECTION.PLAYSTYLE_PASSER_K);
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 시뮬레이션
(액터 점유율 상위 10명 + 임의 배정 playStyle) 완료 — 실제 재시뮬레이션 결과는 다음 세션 신규
데이터로 확인 필요.

**주의사항**: PostUp/PnR_Roll에는 아직 `playStyle` 보정이 없음 — 사용자가 "Iso/Handler로 다듬은
뒤 소급 적용" 하기로 확정했으나 아직 미착수. 4개 플레이타입 전부 일관되게 만들려면 추후 작업 필요.

**롤백 방법**: `playTypes.ts`의 `Iso`/`PnR_Handler` 케이스에서 킥아웃 분기 제거, `textGenerator.ts`의
킥아웃 룩업 테이블에서 `Iso`/`PnR_Handler` 항목 제거(또는 리팩터링 전 `isPostUp` 불리언 분기로
되돌림), `constants.ts`의 `ISO_KICKOUT`/`PNR_HANDLER_KICKOUT` 제거.

---

## 2026-07-31 — PnR_Roll 킥아웃 + isKickout 플래그(어시스트 확률·전용 커멘터리) 추가

**배경**: 바로 아래 항목(PostUp 킥아웃)에 이어 PnR_Roll에도 동일 메커니즘 적용 — 롤맨은 캐치 즉시
결정해야 해서 포스트업보다 판단 여유가 적다는 이유로 `PROB_MAX`만 절반(0.20)으로 설정. 추가로
두 가지 부수 문제를 발견해 함께 해결: ①`playType`을 그대로 유지하다 보니 킥아웃 슛도 원래
용도(PostUp의 엔트리패스 0.55, PnR_Roll의 앨리웁 0.90)로 캘리브레이션된 `assistOdds`를 그대로
적용받는 문제 — 더블팀을 뚫는 명백한 의도적 패스인데 부적절한 확률이 적용됨. ②PnR_Roll의 기존
Rim/Paint+덩크+어시스트 커멘터리("~가 띄워주고 ~가 앨리웁으로!")가 원래 "핸들러→롤러 앨리웁"
전용으로 만들어진 문구인데, 킥아웃(롤러가 반대로 킥아웃해서 받은 선수가 돌파 마무리)에도 잘못
적용될 수 있는 문제. `PossessionResult`/`PlayContext`에 `isKickout` 플래그를 신설해 두 문제를
한 번에 해결 — 사용자와 사전에 득점 6세트+미스 6세트(PostUp/PnR_Roll × 3PT/Rim·Paint/Mid) 총
12개 커멘터리 블록을 확정한 뒤 구현.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.PNR_ROLL_KICKOUT` 신규 추가 (`POST_KICKOUT`과 동일 구조, `PROB_MAX`만 0.20)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PlayContext`에 `isKickout?: boolean` 추가, `PnR_Roll` 케이스에 킥아웃 분기 추가
  (구조는 PostUp과 동일: 롤러의 `passVision+passAcc` 기반 킥아웃 확률 → 발동 시 `spacer` 기준
  킥아웃 타깃으로 `actor` 교체, 롤러는 `secondaryActor`), PostUp 킥아웃 분기 반환값에도 `isKickout: true` 추가
- `services/game/engine/pbp/pbpTypes.ts` (client) / `server/src/shared/engine/pbp/pbpTypes.ts`
  (server) — `PossessionResult`에 `isKickout?: boolean` 추가
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `playCtx`에서 `isKickout` 추가 destructure, `miss`/`score` `PossessionResult` 생성 시 전달
- `services/game/engine/pbp/statsMappers.ts` (client) / `server/src/shared/engine/pbp/statsMappers.ts`
  (server) — 어시스트 확률 계산에 `isKickout` 우선 분기(고정 0.9) 추가, `generateCommentary()` 호출
  (score/miss) `flags`에 `isKickout` 전달
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — `generateCommentary()` 시그니처에 `isKickout` 추가, score/miss 섹션 최상단에 PostUp/PnR_Roll
  킥아웃 전용 커멘터리 12블록 삽입(존별 3PT/Rim·Paint/Mid × PostUp/PnR_Roll × 득점/미스). 이 블록이
  최상단에서 먼저 `return`하므로 기존 PnR_Roll 앨리웁 문구(Rim/Paint+덩크+어시스트)는 킥아웃 케이스에
  자연히 도달하지 않게 됨(별도 가드 불필요)

**Before/After (assistOdds)**:
```ts
// Before
const prob = playType ? (assistOdds[playType] ?? 0.60) : 0.60;
// After
const prob = result.isKickout ? 0.9 : (playType ? (assistOdds[playType] ?? 0.60) : 0.60);
```

**PNR_ROLL_KICKOUT 값**: `PASSING_MIN=40, PASSING_MAX=99, PROB_MIN=0, PROB_MAX=0.20, CURVE_EXPONENT=1.3`
(POST_KICKOUT과 동일 곡선, 확률만 정확히 절반).

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `playTypes.ts`의 `PnR_Roll` 케이스에서 킥아웃 분기 제거, `isKickout` 관련 변경을
전 파일에서 되돌리고, `constants.ts`의 `PNR_ROLL_KICKOUT` 제거.

---

## 2026-07-31 — PostUp 킥아웃 메커니즘 신규 도입 (플레이메이킹 빅 어시스트 부족 해결)

**배경**: "32 TEST 6" 실측에서 요키치/사보니스 어시스트가 각각 4.17/4.15개(AST/36 5.08/5.13)로
포지션 평균(C 2.68) 대비 1.9배에 그쳐, 실제 NBA 격차(5~6배)에 크게 못 미침을 확인. 코드 추적 결과
`PostUp`(C 포지션 가중치 60%)과 `PnR_Roll`(C 70%) — 센터 점유율 대부분을 차지하는 두 플레이타입
모두 "빅맨은 항상 슈터, 절대 패서가 될 수 없다"는 구조였음(더블팀 유도 후 킥아웃하는 분기 자체가
없음). `DriveKick`이 이미 "드라이버가 킵할지 킥아웃할지" 확률적으로 결정하고 액터를 교체하는
동일한 패턴을 갖고 있어 이를 참고해 PostUp에 먼저 적용하기로 함(PnR_Roll은 추후 논의).

설계 과정에서 시행착오: 처음엔 DriveKick과 동일하게 `postScorer/(postScorer+postPassing)` 비율로
설계했으나, 실측 결과(샤킬 오닐도 킥아웃 38%) 두 값이 같은 0~99 스케일이라 격차가 안 벌어지는
문제 확인 — DB 조회로 하워드(48/45)·말론(54/56)의 passVision/passAcc이 실제로 포지션 중앙값과
거의 일치함을 확인해 "데이터가 이상한 게 아니라 공식 구조가 문제"임을 검증. 이후 `postPassing`
단독 기준의 정규화+지수 커브 방식으로 전환, 목표 지점(요키치 39.6%/사보니스 24.1%/센군 23.4%/
샤킬 9.8%/말론 6.7%/하워드 2.3%)에 맞춰 `PASSING_MIN=40/MAX=99, PROB_MIN=0/MAX=0.40,
CURVE_EXPONENT=1.3`으로 확정(사용자가 지수 2.0→1.5→1.3 순으로 직접 비교 후 결정).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.POST_KICKOUT` 신규 추가 (`PASSING_MIN/MAX`, `PROB_MIN/MAX`,
  `CURVE_EXPONENT`, `PASSIQ_BONUS_NEUTRAL/SCALE`)
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `PostUp` 케이스에 킥아웃 분기 추가 (DriveKick 패턴 참고: 확률 발동 시 `actor`를
  킥아웃 타깃으로 교체, 원래 포스트 선수는 `secondaryActor`로 어시스트 후보가 됨)

**Before**: PostUp은 항상 포스트 선수 본인이 슛(Rim/Paint는 `resolveFinish`, 아니면 Mid 점퍼),
엔트리 패서(포스트에 넣어준 선수)만 어시스트 후보.

**After**:
```ts
const pkCfg = SIM_CONFIG.POST_KICKOUT;
const postPassing = (actor.attr.passVision + actor.attr.passAcc) / 2;
const passingNorm = Math.max(0, Math.min(1, (postPassing - pkCfg.PASSING_MIN) / (pkCfg.PASSING_MAX - pkCfg.PASSING_MIN)));
const kickChance = pkCfg.PROB_MIN + (pkCfg.PROB_MAX - pkCfg.PROB_MIN) * Math.pow(passingNorm, pkCfg.CURVE_EXPONENT);

if (Math.random() < kickChance) {
    const kickTarget = pickWeightedActor(p => p.archetypes.spacer, actor.playerId);
    const passIqBonus = Math.max(0, (actor.attr.passIq - pkCfg.PASSIQ_BONUS_NEUTRAL) / 30 * pkCfg.PASSIQ_BONUS_SCALE);
    // kickTarget이 새 actor, 원래 포스트 선수(actor)는 secondaryActor(어시스트 후보)
    // koZone은 selectZone()으로 kickTarget 본인의 zonePref를 그대로 반영 (3점 고정 아님)
    ...
}
// 기존 로직: 킥아웃 미발동 시 포스트 선수 본인이 마무리 (entryPasser만 이 경로에서 계산)
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 계산으로
목표 확률 확정 완료 — 실제 재시뮬레이션 결과(요키치/사보니스 어시스트 상승 여부)는 다음 세션
신규 경기 데이터로 필요.

**주의사항**: PnR_Roll에는 아직 동일 메커니즘이 없음 — C 포지션 점유율의 70%를 차지하는 또 다른
축이라 다음에 논의 후 적용 필요.

**롤백 방법**: `playTypes.ts`의 `PostUp` 케이스를 Before 로직으로 되돌리고, `constants.ts`의
`POST_KICKOUT` 제거.

---

## 2026-07-31 — CatchShoot/PnR_Pop 액터 선정에 zonePref.three 페널티 적용

**배경**: "32 TEST 6" 실측에서 찰스 바클리(존 선호도 탭 cnr/p45/atb 전부 0, 즉 3점을 전혀 안 쏘려는
텐던시)가 경기당 3점을 3.08개나 시도하는 걸 확인. 조사 결과 `CatchShoot`(`preferredZone:'3PT'`
고정, 2026-07 설계 변경)과 `PnR_Pop`(동일하게 3점 고정)이 액터를 각각 `archetypes.spacer`/`popper`
(순수 능력치 기반 — spacer는 3점스킬 60%+shotIq 25%+offConsist 15%, popper는 스크리닝 능력
60%+3점스킬 40%)로만 뽑고, `zonePref`/`selectZone()` 시스템을 완전히 우회한다는 걸 확인 — 바클리는
shotIq88/offConsist98이 높아 spacer=75.7, popper=66.09로 경쟁력 있는 점수가 나와 종종 액터로
뽑히고, 뽑히면 텐던시 무시하고 무조건 3점을 쏨. 실측(`shot_events.playType`)으로 그의 3PA 40개
전부(PnR_Pop 27 + CatchShoot 13)가 이 두 플레이타입에서만 나옴을 확인 — 다른 3점 가능 플레이타입
(Iso/PnR_Handler/Handoff/Transition/OffBallScreen/DriveKick, 전부 `selectZone()` 정상 경로)에서는
0개, 즉 `selectZone()`의 기존 소프트 임계값(`ZONE_PREF_THRESHOLD=0.15`, 미만이면 ×0.2 페널티)은
이미 잘 작동 중이었고 CatchShoot/PnR_Pop만 이 페널티를 우회하고 있었음이 확정됨.

수정: 새 임계값을 만들지 않고 `selectZone()`이 이미 쓰는 `SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD`
를 그대로 재사용해, CatchShoot/PnR_Pop의 액터 선정 가중치에도 동일한 ×0.2 페널티를 적용. 올타임
레전드 풀 실측(케빈 러브 zonePref.three=0.799, 마일스 터너=0.521, 라우리 마카넨=0.552)으로 3팀
시뮬레이션해 검증 — 텐던시 진짜 있는 빅맨(러브/마카넨)은 텐던시 0인 팀원(너키치/유잉) 대비 확실히
유리해지고(PnR_Pop 선정확률 예: 러브 45.9%→81.0%, 마카넨 57.7%→87.2%), 로스터 전원이 정상
텐던시를 가진 팀(cha, 마일스 터너/밥 페팃 둘 다 임계값 이상)은 **변화 없음**을 확인 — 부작용 없음.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts`
  (server) — `CatchShoot`/`PnR_Pop` 케이스의 `pickWeightedActor` 기준식에 `zonePref.three` 페널티
  추가 (새 상수 없이 기존 `ZONE_SELECTION.ZONE_PREF_THRESHOLD` 재사용)

**Before**:
```ts
// PnR_Pop
const popper = pickWeightedActor(
    p => p.archetypes.popper,
    undefined, 'shooter',
    p => (popEligible[p.position] ?? 0) > 0
);
// CatchShoot
const actor = pickWeightedActor(p => p.archetypes.spacer);
```

**After**:
```ts
// PnR_Pop
const popper = pickWeightedActor(
    p => p.archetypes.popper * (p.zonePref.three < SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD ? 0.2 : 1.0),
    undefined, 'shooter',
    p => (popEligible[p.position] ?? 0) > 0
);
// CatchShoot
const actor = pickWeightedActor(p => p.archetypes.spacer * (p.zonePref.three < SIM_CONFIG.ZONE_SELECTION.ZONE_PREF_THRESHOLD ? 0.2 : 1.0));
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 실측 기반 사전 시뮬레이션(det팀
찰스 바클리 3.08→약1.4 3PA/game 추정, mem/cha/law 3팀 선정확률 변화 검증) 완료 — 실제 재시뮬레이션
결과는 다음 세션 신규 경기 데이터로 확인 필요.

**롤백 방법**: 두 `pickWeightedActor` 호출의 criteria 함수를 Before 블록으로 되돌리면 됨(상수 추가
없었으므로 constants.ts 변경 없음).

---

## 2026-07-31 — 리바운드 룰렛 재설계: 지수 증폭 + motor/신장/포지션 3분할 보정

**배경**: "지금 리바운드 룰렛이 너무 평평하다"는 사용자 피드백 — 압도적 능력치(웸반야마 defReb98)를
가진 선수도 팀원 대비 확률 우위가 크지 않다는 게 이전 세션들에서 실측으로 확인된 상태였음(선형
가중합 방식의 한계). 두 가지를 도입하기로 확정:
1. **능력치 기반 점수를 지수(SKILL_EXPONENT=2.0)로 증폭** — 팀 내 개인 배정(`selectRebounder`)
   단계에만 적용, 팀 단위 ORB% 판정(`calculateOrbChance`)은 미적용.
2. **motorIntensity 단독 ±15% 곱셈 보정 → motor/신장/포지션 3분할 보정으로 재설계**
   `score *= (0.7 + motor*0.1 + height*0.1 + pos*0.1)` — 신장은 실제 height(cm) 분포(중앙값
   198cm=중립점) 기준 커브로, 포지션은 C(1.5)>PF(1.2)>SF=SG=PG(1.0, 페널티 없음)로 설정. 셋 다
   극단으로 몰리면 기존과 동일하게 최대 ±15%지만 보통은 서로 상쇄되어 순수 모터 하나가 좌우하던
   것보다 완만해짐 — 이렇게 하면 "실력"(지수 증폭된 능력치)이 배분을 주도하고, 신장/포지션은
   구조적 이점을, motor는 경기별 컨디션 변동을 보조적으로 반영하는 역할 분담이 됨.

실측 예시(웸반야마 C / 로드먼 PF / 웨스트브룩 PG + 평균 SF·SG 라인업, motor=1.0 중립)로 검증 —
지수만 적용 시 로드먼(능력치가 웸반야마보다 근소 우위)이 32.7% vs 웸반야마 27.8%로 앞섰는데,
신장/포지션 보정을 추가하니 32.6% vs 29.5%로 격차가 좁혀짐 — 능력치 격차를 뒤집진 않지만 체격/
위치의 구조적 이점을 완화 요인으로 반영한다는 설계 의도대로 작동.

**⚠ 알려진 이슈**: `types/player.ts`의 텐던시 문서 스펙("0.5~1.5, 리바운드 확률 ±15%")은 motor
단독 기준으로 작성돼 있어 이제 실제 구현(motor 단독으로는 최대 ±5%)과 불일치. 문서 갱신 여부는
사용자에게 질문했으나 명시적 답변 없이 구현 진행 확정 — 추후 확인 필요.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.REBOUND`에 `SKILL_EXPONENT`(2.0), `MOTOR_COEFF`/`HEIGHT_COEFF`/`POSITION_COEFF`
  (각 0.1), `HEIGHT_CURVE`, `POSITION_FACTOR` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — `selectRebounder()`의 점수 계산에 지수 증폭 + 3분할 보정 적용, `flowEngine.ts`에서
  `interpolateCurve` 임포트 추가

**Before**:
```ts
let score = (baseFormula) * shooterPenalty;
// Harvester/Raider (disabled)...
score *= (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.3);
```

**After**:
```ts
const baseScore = (baseFormula);
let score = Math.pow(baseScore, cfg.SKILL_EXPONENT) * shooterPenalty;
// Harvester/Raider (disabled)...
const motorFactor = p.tendencies?.motorIntensity ?? 1.0;
const heightFactor = interpolateCurve(p.attr.height, cfg.HEIGHT_CURVE);
const posFactor = cfg.POSITION_FACTOR[p.position] ?? 1.0;
score *= (0.7 + motorFactor * cfg.MOTOR_COEFF + heightFactor * cfg.HEIGHT_COEFF + posFactor * cfg.POSITION_COEFF);
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 순환 임포트 확인(`flowEngine.ts`는
`reboundLogic.ts`를 임포트하지 않음, 위험 없음). 실측 재검증(리바운드 상위권 쏠림이 체감되는지)은
다음 세션 신규 경기 데이터로 필요.

**롤백 방법**: `reboundLogic.ts`의 점수 계산을 Before 블록으로 되돌리고, `constants.ts`의
`SKILL_EXPONENT`/`MOTOR_COEFF`/`HEIGHT_COEFF`/`POSITION_COEFF`/`HEIGHT_CURVE`/`POSITION_FACTOR` 제거.

---

## 2026-07-31 — 팀 리바운드 증발 버그 수정 (TEAM_REB_RATE_FG/FT 제거)

**배경**: "32 TEST 4"/"32 TEST - ACTIVE" 실측에서 pace=5(중립) 기준 팀 평균 REB가 38.8개로 실제
NBA(~43.5개, 약 11% 부족)보다 낮음을 확인. 원인 추적 결과 `SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG`
(10%, FG 미스)와 `TEAM_REB_RATE_FT`(15%, FT 마지막 시도 미스) — 미스가 나면 이 확률로 개인
리바운드 배정을 스킵하는 로직이 있었는데, 이게 개인은 물론 **팀 합계에도 전혀 반영이 안 되고
그냥 증발**하는 버그였음. 실제 NBA의 "팀 리바운드"는 아웃오브바운즈/루스볼파울/쿼터종료/FT
바이올레이션 등 구체적 상황에 결부되고 팀 합계엔 포함되는데(웹 검색으로 확인), 이 엔진엔 그
4가지 상황이 하나도 시뮬레이션 안 돼 있어 이 카테고리를 유지할 인과적 근거가 없다고 판단 —
"팀 리바운드" 개념 자체를 제거하고 미스 시 항상 개인에게 배정하도록 단순화(옵션 A, 사용자 확정).
수치 검증: pace=5 기준 자책 미스 40.8개×10%≈4.08개가 매 경기 증발 — 실측 부족분(4.7개)의 87%를
이 메커니즘 하나로 설명.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — Miss path에서 `TEAM_REB_RATE_FG` 확률 체크 제거, 항상 `resolveRebound()` 호출
- `services/game/engine/pbp/statsMappers.ts` (client) / `server/src/shared/engine/pbp/statsMappers.ts`
  (server) — `handleFreeThrowRebound()`에서 `TEAM_REB_RATE_FT` 확률 체크 제거
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SIM_CONFIG.REBOUND`에서 `TEAM_REB_RATE_FG`/`TEAM_REB_RATE_FT` 상수 제거(더 이상
  참조되지 않는 dead code)

**Before**:
```ts
// possessionHandler.ts (Miss path)
let rebounder: LivePlayer | undefined;
let reboundType: 'off' | 'def' | undefined;
if (Math.random() >= SIM_CONFIG.REBOUND.TEAM_REB_RATE_FG) {
    const reb = resolveRebound(state.home, state.away, actor.playerId);
    rebounder = reb.player;
    reboundType = reb.type;
}
return { type: 'miss', ..., rebounder, reboundType, ... };

// statsMappers.ts (handleFreeThrowRebound)
const handleFreeThrowRebound = (shooter: LivePlayer) => {
    if (Math.random() < SIM_CONFIG.REBOUND.TEAM_REB_RATE_FT) return;
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    ...
};
```

**After**:
```ts
// possessionHandler.ts (Miss path)
const reb = resolveRebound(state.home, state.away, actor.playerId);
return { type: 'miss', ..., rebounder: reb.player, reboundType: reb.type, ... };

// statsMappers.ts (handleFreeThrowRebound)
const handleFreeThrowRebound = (shooter: LivePlayer) => {
    const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);
    ...
};
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. `grep`으로 `TEAM_REB_RATE`
잔여 참조가 주석 외엔 없음을 확인. 실측 재검증(팀 REB가 43~44 근처로 회복되는지)은 다음 세션
신규 경기 데이터로 필요.

**롤백 방법**: 세 파일의 변경을 Before 블록으로 되돌리고, `constants.ts`에 두 상수(`TEAM_REB_RATE_FG: 0.10`,
`TEAM_REB_RATE_FT: 0.15`) 재추가.

---

## 2026-07-31 — 포제션 시간: pace 압축 도입 (고페이스 팀 득점 폭주 수정) + 상수화

**배경**: 바로 아래 항목(21→19 재조정)을 배포해 "32 TEST 4"/"32 TEST - ACTIVE" 룸에서 실측한 결과,
pace=5(중립, 대부분 팀) 기준으로는 평균 110.1점으로 목표대로 잘 맞았으나 **pace=8~10을 쓰는 팀만
심각하게 폭주**함을 확인 — pace=8 팀 평균 131.8점, pace=9 팀 평균 146.5점, den(pace8)×por(pace9)
매치업은 4연속 144~187점. 원인은 `19 - pace`가 pace=8/9/10에서 각각 11/10/9초라는, 실제 NBA
역대 최고속 팀(포제션 ~13.7초)보다도 훨씬 빠른 값을 만들어냈기 때문 — 게다가 이 엔진은 공격팀
자신의 pace가 그 포제션 길이를 결정하는 구조라 양쪽 다 고페이스인 매치업에서 효과가 배가됨.
`19 - pace`(pace=5 기준 14초, 실제 NBA 평균과 일치)의 중심값 자체는 정확했으므로, 기준점은
유지하고 **pace 1~10이 이 기준값에서 얼마나 벗어날 수 있는지(기울기)만 압축**하기로 함 — 사용자가
0.1/0.2/0.3~0.4 옵션을 비교 검토 후 0.2(pace=1→14.8초, pace=10→13.0초, 전체 스윙 1.8초)로 확정.
동시에 하드코딩돼 있던 `19`를 포함한 관련 상수를 `SIM_CONFIG.POSSESSION_TIME`으로 이동해 관리.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `POSSESSION_TIME: { BASE: 19, PACE_NEUTRAL: 5, PACE_COMPRESSION: 0.2 }` 신규 추가
- `services/game/engine/pbp/timeEngine.ts` (client) / `server/src/shared/engine/pbp/timeEngine.ts`
  (server) — `calculatePossessionTime()`의 기준값 계산을 압축 공식으로 변경, `SIM_CONFIG` 임포트 추가

**Before**:
```ts
const pace = sliders.pace;
let timeTaken = 19 - pace;
```

**After**:
```ts
const ptCfg = SIM_CONFIG.POSSESSION_TIME;
const pace = sliders.pace;
const compressedPace = ptCfg.PACE_NEUTRAL + (pace - ptCfg.PACE_NEUTRAL) * ptCfg.PACE_COMPRESSION;
let timeTaken = ptCfg.BASE - compressedPace;
```

**결과 비교**:
| pace | 기존(19-pace) | 신규(압축 0.2) |
|---|---|---|
| 1 | 18.0초 | 14.8초 |
| 5 (중립) | 14.0초 | 14.0초 (불변) |
| 8 | 11.0초 | 13.4초 |
| 9 | 10.0초 | 13.2초 |
| 10 | 9.0초 | 13.0초 |

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 순환 임포트 확인(`constants.ts`는
자체 import 없음, 위험 없음). 실측 재검증(고페이스 팀 득점이 정상 범위로 돌아오는지)은 다음 세션
신규 경기 데이터로 필요.

**롤백 방법**: `timeEngine.ts`의 계산식을 Before로 되돌리고, `constants.ts`의 `POSSESSION_TIME`
제거.

---

## 2026-07-30 — 포제션 시간 공식 재조정 (21-pace → 19-pace)

**배경**: "32 TEST 3" 실측에서 팀당 평균 FGA가 70.1개로 실제 NBA(~88.5개)보다 크게 낮은 문제를
조사. 정규화(normalization)는 A/B 비교로 주범이 아님을 확인(정규화 OFF 룸도 FGA 72.4로 거의
동일), pace 슬라이더와 FGA 상관관계(r=0.55)는 확인됐으나 pace를 최댓값(10)까지 올려도 예측 FGA가
78.1로 여전히 NBA 대비 부족 — 슬라이더 튜닝이 아니라 포제션 시간 계산 공식 자체의 캘리브레이션
문제로 결론. `timeEngine.ts`의 `calculatePossessionTime()` 기본값 공식(`21 - pace`)을 실측과
대조한 결과: pace=5(중립, 룸 평균 5.31에 근접) 기준 공식 예측값 16초가 실측 포제션 길이(게임
클락 2880초 / (86.1 포제션×2팀) ≈ 16.72초)와 거의 정확히 일치 — 이 공식이 포제션 부족의 직접
원인임을 확인. 실제 NBA 평균 포제션 길이(2880초/(99.3페이스×2)≈14.5초)보다 약 1.5초(10~15%)
길게 잡혀있었음. 부작용 검토(득점 오버슈트 여부, 파울 재발 위험, 체력/로테이션 영향)를 사전에
논의 — 득점은 현재 95.3점/팀으로 NBA(114.2점) 대비 여유가 있어 오버슈트 위험 낮음, 체력/로테이션은
`timeTaken`(경과 초) 기반이라 총량 불변으로 영향 없음 확인. 다만 포제션 증가로 파울 발생 "기회"도
늘어나 평범한 빅맨(스킬 커브 혜택 적은 KAT/부셰비치 등)의 파울 수가 재상승할 가능성은 사용자도
인지한 상태로 진행 확정.

**변경 파일**:
- `services/game/engine/pbp/timeEngine.ts` (client) / `server/src/shared/engine/pbp/timeEngine.ts`
  (server) — `calculatePossessionTime()`의 기본 공식 `21 - pace` → `19 - pace`

**Before**: `let timeTaken = 21 - pace;` (pace=1→20초, pace=5→16초, pace=10→11초)

**After**: `let timeTaken = 19 - pace;` (pace=1→18초, pace=5→14초, pace=10→9초)

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론상 pace=5 기준 포제션
길이 16.72초→14초대로 하락 예상, 포제션 개수 약 12~13% 증가(FGA/PTS/REB/AST/TOV/FTA 등 전체
카운팅 스탯 비례 증가 전망). 실측 재검증은 다음 세션의 신규 경기 데이터로 필요.

**주의사항**: 이 변경으로 파울 발생 기회 자체가 늘어나므로, 이번 세션에서 도입한 파울트러블
완화책들(수비자 스킬 커브/PostUp 크로스매치/PnR_Roll 스위치 하한)의 순효과가 부분적으로 상쇄될
수 있음 — 특히 스킬 커브 혜택이 적은 평범한 빅맨(KAT, 부셰비치 등)은 파울 수가 다시 늘어날 가능성.
다음 세션에서 반드시 재실측 필요.

**롤백 방법**: `19 - pace`를 `21 - pace`로 되돌리면 됨.

---

## 2026-07-30 — PnR_Roll 전용 스위치 하한 도입

**배경**: PostUp 크로스매치(바로 아래 항목) 이후 PnR_Roll도 논의. PnR_Roll은 PostUp과 달리
`isScreenPlay` 목록에 포함돼 스위치 메커니즘 자체는 이미 존재(스위치 발동 시 핸들러를 막던 가드가
롤러를 대신 막음 — foul 노출이 C에서 가드로 자연스럽게 이동). 문제는 `tacticGenerator.ts:320`의
`if (maxOf(rimProtScore) >= 88) switchFreq = clamp(Math.min(switchFreq, 5))` — 엘리트 림프로텍터
보유팀은 switchFreq가 5로 캡핑돼 스위치 확률이 최대 25%(`5×0.05`)로 묶임. 이 캡 자체는 "엘리트
수비수를 함부로 스위치 안 시킨다"는 합리적 전략이라 유지하기로 하고, 대신 **PnR_Roll에 한해서만**
스위치 확률에 별도 하한을 둬서 캡보다 더 낮게 잡힌 보수적 전술에서도 최소 전가를 보장하기로 함.
POST_CROSS_MATCH와 동일한 설계 철학(슬라이더 종속으로 완전히 0에 수렴하지 않도록 하한 확보).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `PNR_ROLL_SWITCH_MIN: 0.15` 신규 추가 (POST_CROSS_MATCH 블록 바로 아래)
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `identifyDefender()`의 "3. Switch Logic" 섹션, `switchChance` 계산식을 PnR_Roll
  전용 분기로 변경 (다른 스크린 플레이는 기존 `switchFreq*0.05` 그대로 유지)

**Before**:
```ts
if (isScreenPlay && !isZone && screenPlayer) {
    const switchChance = sliders.switchFreq * 0.05;
    ...
```

**After**:
```ts
if (isScreenPlay && !isZone && screenPlayer) {
    const switchChance = playType === 'PnR_Roll'
        ? Math.max(sliders.switchFreq * 0.05, SIM_CONFIG.PNR_ROLL_SWITCH_MIN)
        : sliders.switchFreq * 0.05;
    ...
```

**동작**: `switchFreq=5`(캡 걸린 상태, 25%)에선 하한(15%) 미만이 아니므로 발동 안 함 — 이 하한은
switchFreq를 5보다도 낮게 잡은 팀에서만 실제로 작동. Handoff/OffBallScreen/PnR_Handler/PnR_Pop 등
다른 스크린 플레이는 영향 없음.

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `switchChance` 계산식을 Before로 되돌리고, `constants.ts`의 `PNR_ROLL_SWITCH_MIN` 제거.

---

## 2026-07-30 — PostUp 크로스매치 도입 (C→PF 수비 배정 일부 전가)

**배경**: 슈팅파울 확률 커브(수비자 스킬)를 도입했음에도, "32 TEST 3" 실측에서 확인된 C의 림/페인트
수비 노출량 자체(PF 대비 4배 이상, 림 컨테스트 8.37 vs 1.99)는 그대로 남아있음을 사용자가 재확인.
원인은 `identifyDefender()`에서 PostUp이 `isScreenPlay` 목록(스위치 로직 대상)에서 빠져있어 —
actor가 C면 상대 C가 스위치/전가 없이 100% 고정으로 막음. 처음엔 "PF에게 전가하는 비율을 helpDef
슬라이더로만 결정"하는 안을 검토했으나, 슬라이더를 낮게 잡은 팀은 전가가 0에 수렴해 "헬프디펜스 안
쓰는 팀 빅맨은 파울트러블에서 전혀 못 벗어난다"는 근본 문제가 재발함을 사용자가 지적 — `HELP_DEFENSE`
(ATTEMPT_BASE+PER_LEVEL)와 동일하게 **BASE 하한 + helpDef 슬라이더 가산** 구조로 설계, 사용자가
BASE=15%/최대=35%로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `POST_CROSS_MATCH: { BASE: 0.15, PER_LEVEL: 0.20/9 }` 신규 추가 (HELP_DEFENSE 블록 바로 아래)
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — `identifyDefender()`에 "2.5 PostUp Cross-Match" 단계 신규 추가 (2. 기본 매칭 이후,
  3. 스위치 로직 이전 — Ace Stopper가 명시 지정된 경우는 1번에서 이미 반환되어 크로스매치 대상 제외)

**Before**: (해당 로직 없음 — PostUp은 2번 기본 포지션 매칭 결과를 그대로 반환)

**After**:
```ts
// 2.5 PostUp Cross-Match
if (playType === 'PostUp' && !isZone && defender && defender.position === 'C') {
    const crossCfg = SIM_CONFIG.POST_CROSS_MATCH;
    const crossMatchChance = crossCfg.BASE + (sliders.helpDef - 1) * crossCfg.PER_LEVEL;
    if (Math.random() < crossMatchChance) {
        const crossDef = defTeam.onCourt.find(p => p.position === 'PF' && p.playerId !== defender!.playerId);
        if (crossDef) {
            return { defender: crossDef, isSwitch: true, isBotchedSwitch: false, pnrCoverage: 'none' };
        }
    }
}
```

**동작**: `helpDef=1`(최소)일 때도 15%는 PF 전가, `helpDef=5.5`(중립) ~24.4%, `helpDef=10`(최대) 35%.
PostUp에서 actor가 C이고 상대 팀 매칭 수비수도 C일 때만 발동 — PF가 온코트에 없으면(예: 빅맨 2명이
C+C인 라인업) 발동 안 하고 원래 매칭 유지.

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드.

**롤백 방법**: `possessionHandler.ts`의 "2.5 PostUp Cross-Match" 블록 삭제, `constants.ts`의
`POST_CROSS_MATCH` 제거.

---

## 2026-07-30 — INTERIOR_SKILL_CURVE 상위권 강화 (바로 아래 항목 후속 조정)

**배경**: 바로 아래 항목에서 도입한 수비자 파울회피 스킬 커브의 88/93/97 구간을 사용자가 직접
더 강하게 조정 — 최상위 림프로텍터(올라주원/고베어/카림)에게 더 뚜렷한 파울 감소 혜택을 주기 위함.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server)
  — `SHOOTING_FOUL.INTERIOR_SKILL_CURVE`의 88/93/97 지점 값만 변경 (45/60/72/82는 그대로)

**Before**: `[88, -0.035], [93, -0.050], [97, -0.065]`
**After**: `[88, -0.05], [93, -0.065], [97, -0.09]`

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론값 — 올라주원(블렌드96.3)
Rim 파울확률 16%→10.86%(기존 12.26%에서 추가 하락), 고베어(95.0) 16%→11.35%, 카림(95.7) 16%→11.09%.
KAT/부셰비치(중립점 이하)는 무변화 유지.

**롤백 방법**: `INTERIOR_SKILL_CURVE`의 88/93/97 값을 Before로 되돌리면 됨.

---

## 2026-07-30 — 슈팅파울: 수비자 파울회피 스킬 커브 신규 도입 (엘리트 빅맨 파울트러블 개선)

**배경**: "32 TEST 3" 실측 데이터에서 C 포지션 PF/36이 4.56으로 PF(2.23)의 2배, 스몰포지션(1.15~1.63)의
3~4배에 달함을 확인. 특히 올라주원/고베어/카림 압둘자바/유잉이 나란히 경기당 평균 5.33파울(사실상
매 경기 파울아웃 직전). 코드 추적 결과 `identifyDefender()`의 포지션 1:1 매칭 + `POSITION_WEIGHT`
(PostUp C60%, PnR_Roll C70%)가 겹쳐 C의 림/페인트 수비 노출량이 PF의 4배 이상(실측: 림 컨테스트
8.37 vs 1.99)임을 확인 — 노출량(볼륨) 차이만으로 관측된 PF/36 격차 대부분이 설명됨. 사용자가
"슛 개수(공격 배분)는 건드리지 않는다"는 전제를 명확히 함에 따라, 노출량 재분배 대신 슈팅파울
확률식 자체의 비대칭을 조사 — 슈터의 파울유도 스킬(`drFoul`)은 `DRAW_FOUL_CURVE`로 반영되는데
**수비자의 컨테스트 기술은 어디에도 반영되지 않고 있었음**(랜덤 성향 `foulProneness` 제외). DB
확인 결과 올라주원(intDef97/defConsist95)과 KAT(intDef72/defConsist68)처럼 수비 기술 격차가 큰
선수들이 동일한 파울 확률을 적용받고 있었음 — 실제 NBA에서 고베어류 엘리트 림프로텍터가 "컨테스트
볼륨 대비 파울은 적게 범한다"(버티컬리티 기술)는 특성이 전혀 모델링되지 않은 것.

포지션이 아니라 **수비 존(Rim/Paint vs Mid/3PT) 기준**으로 공식을 분리하기로 결정 — 이미 코드에
`DEF_INTENSITY_MATCHUP_CURVE_INTERIOR`(intDef)/`_PERIMETER`(perDef) 패턴이 있어 일관성 유지,
스위치/미스매치(가드가 림에서 빅 대신 막는 경우 등)도 별도 분기 없이 자연스럽게 처리됨. DB 실측
결과 `defConsist`(정지 자세 유지력)는 포지션 무관 69~72로 균일(순수 기술/절제력 특성)한 반면
`intDef`/`perDef`는 포지션별로 크게 갈림(intDef: C 76.5 → PG 46.0) → 존별 주력 스탯 + 공용
`defConsist` 블렌드로 설계. 이 기능은 팀 전술 슬라이더(helpDef 등)와 무관하게 항상 적용되어,
이전에 검토했던 "슬라이더 종속적 완화책"이나 예전에 기각된 "High Tower 태그" 방식과 달리 연속
능력치 기반으로 항상 작동함.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `SHOOTING_FOUL`에 `INTERIOR_SKILL_CURVE`/`PERIMETER_SKILL_CURVE` 신규 추가
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — 3. Shooting Foul Check 섹션에 수비자 스킬 블렌드(`intDef*0.65+defConsist*0.35` 인테리어 /
  `perDef*0.65+defConsist*0.35` 퍼리미터) → 커브 보정 → `zoneScale` 곱 → `shootingFoulRate`에 가산

**Before**:
```ts
const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
shootingFoulRate += drawFoulBonus * zoneScale;

// defIntensity 보정...
```

**After**:
```ts
const drawFoulBonus = interpolateCurve(actor.attr.drFoul, sFoulCfg.DRAW_FOUL_CURVE);
const zoneScale = sFoulCfg.ZONE_CURVE_SCALE[preferredZone] ?? 1.0;
shootingFoulRate += drawFoulBonus * zoneScale;

// 수비자 파울회피 스킬 커브 — 존 기준(포지션 무관) 분리
const isInteriorZone = preferredZone === 'Rim' || preferredZone === 'Paint';
const defenderSkill = isInteriorZone
    ? defender.attr.intDef * 0.65 + defender.attr.defConsist * 0.35
    : defender.attr.perDef * 0.65 + defender.attr.defConsist * 0.35;
const defenderSkillCurve = isInteriorZone ? sFoulCfg.INTERIOR_SKILL_CURVE : sFoulCfg.PERIMETER_SKILL_CURVE;
shootingFoulRate += interpolateCurve(defenderSkill, defenderSkillCurve) * zoneScale;

// defIntensity 보정...
```

**커브 값 (신규)**:
```ts
INTERIOR_SKILL_CURVE: [   // Rim/Paint — 중립점 72 (C/PF 인테리어 블렌드 평균)
    [45, 0.025], [60, 0.010], [72, 0.000],
    [82, -0.020], [88, -0.035], [93, -0.050], [97, -0.065],
],
PERIMETER_SKILL_CURVE: [  // Mid/3PT — 중립점 71 (PG/SG/SF 퍼리미터 블렌드 평균)
    [45, 0.025], [55, 0.012], [71, 0.000],
    [80, -0.012], [86, -0.022], [92, -0.035], [97, -0.045],
],
```

**검증**: `server tsc` 30개 베이스라인 유지, `vite build` 클린 빌드. 이론값 계산 — 올라주원(블렌드96.3)
Rim 파울확률 16%→12.26%(-23% 상대), Paint 10%→6.88%(-31% 상대). KAT(블렌드70.6)는 16.07%/10.06%로
사실상 무변화(중립점 근처). 의도한 대로 "진짜 수비 기술이 뛰어난 선수만 혜택, 덩치만 큰 빅맨은
그대로"라는 목표와 일치.

**롤백 방법**: Before 블록으로 되돌리고, constants.ts의 `INTERIOR_SKILL_CURVE`/`PERIMETER_SKILL_CURVE`
2개 제거.

---

## 2026-07-30 — 전술 슬라이더 우측 상단 라벨 텍스트화 + 슬라이더 2종 이름 변경

**배경**: 전술 슬라이더(페이스/볼회전/공격리바운드/공격포인트/픽앤롤빈도/3점·골밑·미드레인지 빈도/
수비압박/스위치수비/풀코트프레스/헬프수비/지역방어/수비리바운드) 우측 상단에 값(1~10) 숫자만
표시되던 것을, 사용자가 지정한 구간별(1 / 2~4 / 5~6 / 7~9 / 10) 한국어 라벨로 교체해달라는 요청.
동시에 "P&R 의존도" → "픽앤롤 빈도", "중거리 슛 빈도" → "미드레인지 빈도"로 슬라이더 이름 자체도
변경. 엔진 계산에 쓰이는 `value`(1~10)는 그대로 두고 `label`(표시 텍스트)만 교체 — 엔진 로직/공식에는
영향 없음.

**변경 파일**:
- `services/game/config/sliderSteps.ts` (client) / `server/src/shared/game/config/sliderSteps.ts`
  (server 미러) — 기존 `TEN_STEPS`(모든 슬라이더가 `label: String(i+1)` 공유)를 슬라이더별
  `buildTieredSteps(v1, v2to4, v5to6, v7to9, v10)` 호출로 교체. `shot_3pt`/`shot_rim`/`shot_mid`는
  동일 5단계(매우 낮음/낮음/보통/높음/매우 높음) 공유하는 `FREQUENCY_STEPS`로 통합.
- `components/dashboard/tactics/TacticsSlidersPanel.tsx` — `pnrFreq` 슬라이더 라벨
  "P&R 의존도"→"픽앤롤 빈도", `shot_mid` 라벨 "중거리 슛 빈도"→"미드레인지 빈도"
  (SliderControl label prop + SliderGroupNotes label 둘 다)
- `components/game/tabs/LiveTacticsTab.tsx` — 동일 리네임 (`shot_mid`는 기존 "중거리 슛"→"미드레인지 빈도")
- `components/physics-lab/MotionSandboxPanel.tsx` — 동일 리네임 (물리 실험용 슬라이더 패널)
- `components/game/TacticsAnalysis.tsx` — `SLIDER_LABELS.pnrFreq` "P&R 의존도"→"픽앤롤 빈도"
  (경기 후 전술 비교 분석 화면, 동일 키 표시용 텍스트라 함께 통일)

**Before** (`sliderSteps.ts`):
```ts
const TEN_STEPS: SliderStep[] = Array.from({ length: 10 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
}));

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    pace: TEN_STEPS,
    ballMovement: TEN_STEPS,
    // ... 전체 14개 키 모두 TEN_STEPS 공유
};
```

**After** (`sliderSteps.ts`):
```ts
function buildTieredSteps(v1: string, v2to4: string, v5to6: string, v7to9: string, v10: string): SliderStep[] {
    const labels = [v1, v2to4, v2to4, v2to4, v5to6, v5to6, v7to9, v7to9, v7to9, v10];
    return labels.map((label, i) => ({ value: i + 1, label }));
}

export const SLIDER_STEPS: Record<string, SliderStep[]> = {
    pace: buildTieredSteps('정돈된 공격', '지공 위주', '보통', '속공 위주', '런앤건'),
    ballMovement: buildTieredSteps('히어로볼', '아이솔레이션', '보통', '패스 위주', '시스템 농구'),
    offReb: buildTieredSteps('전원 크래시', '적극 가담', '보통', '빠른 백코트', '시도하지 않음'),
    insideOut: buildTieredSteps('페인트존 공략', '인사이드', '균형', '아웃사이드', '3점 선호'),
    pnrFreq: buildTieredSteps('픽앤롤 사용하지 않음', '보다 적은 픽앤롤', '보통', '보다 많은 픽앤롤', '적극적 픽앤롤 사용'),
    shot_3pt: FREQUENCY_STEPS, shot_rim: FREQUENCY_STEPS, shot_mid: FREQUENCY_STEPS, // 매우 낮음~매우 높음
    defIntensity: buildTieredSteps('거의 압박하지 않음', '적은 압박', '적당히 압박', '다소 강한 압박', '매우 강한 압박'),
    switchFreq: buildTieredSteps('스위치 하지 않음', '보다 적은 스위치', '적당한 스위치', '잦은 스위치', '무한 스위치'),
    fullCourtPress: buildTieredSteps('매우 낮은 압박', '낮은 압박 강도', '적당한 압박 강도', '강한 전방 압박', '하프코트 더블팀'),
    helpDef: buildTieredSteps('도움 수비 없음', '자기 위치 고수', '균형', '적극적 도움 수비', '강한 도움 수비'),
    zoneFreq: buildTieredSteps('강한 맨투맨 커버리지', '적당한 맨투맨 커버리지', '상황에 따름', '존 디펜스 고수', '강한 존 디펜스'),
    defReb: buildTieredSteps('전원 트랜지션 전환', '보다 적은 리바운더', '보통', '더 많은 리바운더', '적극적 박스아웃'),
};
```

**검증**: 로컬 tsconfig 미존재(프로젝트가 vite/esbuild만 사용) — `tsc --noEmit` 대신 `git diff --stat`으로
변경 범위(6개 파일, client/server 미러 동일 diff) 확인. `valueToStep`/`stepToValue`는 `.value` 필드만
참조하므로 라벨 텍스트 변경이 엔진 계산(회전율/확률 등)에 영향 없음.

**롤백 방법**: Before 블록 내용으로 `sliderSteps.ts`(client+server 둘 다) 되돌리고, 4개 컴포넌트 파일에서
"픽앤롤 빈도"→"P&R 의존도", "미드레인지 빈도"→"중거리 슛 빈도"(LiveTacticsTab은 "중거리 슛")로 되돌리면 됨.

---

## 2026-07-30 — 전술 슬라이더 하단 설명 문구(SliderGroupNotes) 전면 교체

**배경**: 위 항목(라벨 텍스트화)에 이어, 슬라이더 하단 설명 문구도 한 줄짜리 축약 설명에서
사용자가 직접 작성한 상세 설명(낮을 때/높을 때 각각의 효과, 어떤 선수 유형에게 유리한지 등)으로
교체해달라는 요청. 사용자가 명시한 12개 슬라이더(페이스/볼회전/공격리바운드/공격포인트/
픽앤롤빈도/수비압박강도/스위치수비/픽앤롤수비/풀코트프레스/헬프수비/지역방어/수비리바운드)만
교체하고, 언급되지 않은 3점·골밑·미드레인지 슛 빈도 설명은 기존 문구 유지.

**변경 파일**:
- `components/dashboard/tactics/TacticsSlidersPanel.tsx` — `SliderGroupNotes notes` 15개 항목 중
  12개 text 교체 (label 문자열은 변경 없음)
- `components/game/tabs/LiveTacticsTab.tsx` — 동일 12개 text 교체 (이 파일은 label이
  "골밑 공격"/"수비 압박"으로 축약되어 있어 label 자체는 그대로 두고 text만 교체)
- `components/physics-lab/MotionSandboxPanel.tsx` — 공격 슬라이더 5개(페이스/볼회전/
  공격리바운드/공격포인트/픽앤롤빈도)만 text 교체 (이 패널은 수비 슬라이더 미포함)

**Before/After**: 라인 수가 많아 git diff로 확인 권장 (`git show <commit> -- components/dashboard/tactics/TacticsSlidersPanel.tsx`).
텍스트만 교체, `label` 키/구조는 변경 없음 — 엔진 로직/공식과 무관한 순수 설명 문구.

**검증**: 순수 문자열 리터럴 교체(구조 변경 없음)이므로 `git diff --stat`으로 변경 파일 범위만 확인.

**롤백 방법**: 해당 커밋을 `git revert`하거나, 각 파일의 `SliderGroupNotes notes` 배열을 이전 커밋
버전으로 되돌리면 됨.

---

## 2026-07-30 — 플레이타입 분석 차트: 정렬 버그 수정 + 슈팅 존 선호도 섹션 삭제 + 그리드라인 추가

**배경**: 직전 항목(막대 하단 라벨 표시)에서 실제 화면을 보니, 라벨이 1줄/2줄로 컬럼마다 줄바꿈
개수가 달라 `%` 수치 행이 지그재그로 어긋나 보이는 버그 발견("들쑥날쑥 못생겼다" 피드백). 원인은
`% 수치 → 막대 → 라벨`을 하나의 `flex flex-col` 컬럼 안에 넣고, 부모 행을 `items-end`로 정렬한 것
— 라벨 줄바꿈 수가 다르면 컬럼 전체 높이가 달라지고, `items-end`가 그 차이를 컬럼 "위쪽"에
여백으로 흡수하면서 `%` 수치가 컬럼마다 다른 높이에 위치하게 됨. 동시에 사용자가 우측 "슈팅 존
선호도"(슬라이더 vs 로스터 성향 비교) 섹션은 의미 없는 데이터라 삭제 요청, 플레이타입 분석 영역을
그만큼 확장, 심플한 그리드라인 추가도 함께 요청.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — 전면 재작성.
  - `ZONES`/`zoneComparison`/`calculatePlayerOvr` import 및 우측 "슈팅 존 선호도" JSX 전부 삭제,
    `roster` prop도 더 이상 쓰이지 않아 인터페이스에서 제거
  - 정렬 버그 수정: 컬럼 단위 `flex-col`(%+막대+라벨을 한 덩어리로 묶음) 구조를 버리고,
    `% 수치 행` / `막대 행` / `라벨 행` 3개의 독립된 `flex` 행으로 분리. 각 행은 자기 자신의 flex
    아이템들 사이에서만 정렬되므로, 라벨 행의 줄바꿈 수가 달라져도 위의 수치 행·막대 행 정렬에
    전혀 영향을 주지 않음
  - 막대 행(`h-[150px]`)에 `absolute inset-0 flex flex-col justify-between` 컨테이너로 5개의
    수평 그리드라인(`bg-slate-800` 1px, 0/25/50/75/100% 등간격) 추가, 막대는 `z-10`으로 그 위에 렌더
  - 좌우 분할이 없어져 컴포넌트 전체가 부모 너비를 그대로 사용 (기존 `flex-1` 50/50 분배 → 단일
    `flex flex-col` 풀와이드)
- `components/dashboard/tactics/TacticsDataPanel.tsx` — `<PlayTypePPP sliders={sliders} roster={roster} />`
  → `<PlayTypePPP sliders={sliders} />` (roster prop 제거), 섹션 주석 "Play Type Analysis + Shot Zone
  Comparison" → "Play Type Analysis"

**Before** (정렬 버그 유발 구조):
```tsx
<div className="flex items-end gap-1.5 w-full">
  {data.map(item => (
    <div className="flex-1 min-w-0 flex flex-col items-center">
      <span>{item.distribution}%</span>
      <div className="w-full h-[150px] flex items-end"><div style={{height:pct%}} /></div>
      <span>{item.label}</span>  {/* 줄바꿈 수 컬럼마다 다름 → items-end가 위쪽 여백으로 흡수 */}
    </div>
  ))}
</div>
```

**After** (3행 분리 구조):
```tsx
<div className="flex gap-1.5">{/* 수치 행 */}</div>
<div className="relative flex items-end gap-1.5 h-[150px]">{/* 그리드라인 + 막대 행 */}</div>
<div className="flex gap-1.5">{/* 라벨 행 — 줄바꿈 무관하게 독립적 */}</div>
```

**검증**: dev 서버 curl 200 확인. 브라우저 시각 확인은 도구 제약으로 미수행 — 정렬이 실제로
고쳐졌는지 사용자 확인 필요.

**롤백 방법**: Before 블록 구조로 복원하고, `TacticsDataPanel.tsx`의 `PlayTypePPP` 호출에
`roster={roster}` 다시 추가 + 삭제된 `ZONES`/`zoneComparison`/우측 패널 JSX 복원(바로 위 항목의
Before/After 참고).

---

## 2026-07-30 — 플레이타입 분석 차트: 우측 범례 제거, 막대 하단에 라벨/수치 표시

**배경**: 바로 아래 항목(도넛→수직 바 교체) 직후, 바 그래프 옆에 남아있던 "PlayType + Share" 2열
범례 리스트가 중복 정보라 제거하고 대신 각 막대 하단에 라벨(플레이타입 이름)을 직접 표시해달라는
요청. 막대 위 % 수치 표시는 유지.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — 우측 `grid grid-cols-2` 범례 블록(색상
  점+라벨+% 10개 항목) 삭제. 좌측 "플레이타입 분석" 컬럼을 `flex-1`로 변경해 우측 "슈팅 존 선호도"
  컬럼과 50/50 폭 분배(기존엔 범례가 붙어 있어 좌측 폭이 고정 `w-[200px]`+legend였음). 막대 컬럼
  구조를 `% 수치(위) → 고정높이 h-[150px] 바 래퍼(중간) → 라벨 텍스트(아래)` 3단으로 재구성,
  각 컬럼에 `min-w-0` 추가(10개 flex-1 항목이 좁은 폭에서도 정상적으로 줄어들도록 — 없으면 긴
  라벨 때문에 flex blowout 발생 가능).

**Before**: 막대 옆에 "색상점 + 라벨 + %" 2열 grid 범례가 별도로 존재, 막대 자체엔 % 수치만 표시.

**After**: 범례 제거, 막대마다 위에는 %, 아래에는 라벨을 직접 표시하는 자기완결형 바 차트.

**검증**: dev 서버 curl 200 확인. 브라우저 시각 확인은 도구 제약으로 미수행 — 사용자 직접 확인 요망.

**롤백 방법**: 우측 grid 범례 블록을 되살리고 좌측 컬럼을 `flex-1` → 원래 클래스(`flex flex-col
gap-3`, 폭 고정 없음)로, 막대 컨테이너를 `w-[200px] h-[200px]`+`shrink-0`로 되돌리면 됨.

---

## 2026-07-30 — 플레이타입 분석 차트: 도넛 → 수직 바 그래프 교체

**배경**: 전술화면(TacticsDataPanel) "플레이타입 분석" 섹션이 SVG 도넛 차트로 10개 플레이타입
분포를 보여주고 있었는데, 사용자가 도넛 대신 수직 바 그래프로 바꿔달라고 요청. 엔진 로직/데이터
소스(`getPlayTypeDistribution`)는 변경 없이 시각화 형태만 교체.

**변경 파일**:
- `components/dashboard/tactics/charts/PlayTypePPP.tsx` — SVG `<circle>` 기반 도넛(stroke-dasharray
  세그먼트)을 제거하고, `data.map`으로 10개 막대를 `flex items-end` 컨테이너에 렌더링하는 수직 바
  차트로 교체. `DONUT_CX/CY/R/STROKE`, `CIRCUMFERENCE` 상수와 `donutSegments` useMemo 삭제,
  대신 최댓값 정규화용 `maxDistribution` useMemo 추가(가장 높은 막대가 컨테이너를 꽉 채우도록
  `height: (distribution/maxDistribution)*100%`로 스케일링). 막대 위에 `%` 수치 라벨 표시, 우측의
  2열 색상+라벨+% 리스트(범례)는 그대로 유지.

**Before** (도넛):
```tsx
const DONUT_CX = 80; const DONUT_CY = 80; const DONUT_R = 55; const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R;
// ...
const donutSegments = useMemo(() => { /* stroke-dasharray 누적 오프셋 계산 */ }, [data]);
// <svg><circle .../> {donutSegments.map(seg => <circle strokeDasharray=... />)}</svg>
```

**After** (수직 바):
```tsx
const maxDistribution = useMemo(() => Math.max(1, ...data.map(d => d.distribution)), [data]);
// <div className="flex items-end gap-1.5 w-[200px] h-[200px]">
//   {data.map(item => <div style={{ height: `${(item.distribution/maxDistribution)*100}%` }} />)}
// </div>
```

**검증**: dev 서버(포트 5173, 기존 실행 중) `curl` 200 응답 확인. 브라우저 시각 확인은 도구 제약으로
수행하지 못함 — 필요 시 사용자가 전술화면에서 직접 확인 요망.

**롤백 방법**: Before 블록의 도넛 SVG 코드로 되돌리면 됨 (`donutSegments`/`DONUT_*`/`CIRCUMFERENCE`
상수 복원 필요).

---

## 2026-07-30 — 리바운드 로직: 공격/수비 리바운드 공식 분리 (DRB/ORB 전용 가중치)

**배경**: 리바운드 아키타입/모터인텐시티 점검(바로 아래 항목) 과정에서, 압도적 `defReb`를 가진
빅맨(웸반야마 98)도 실제 룰렛 선택 확률은 팀원 대비 크게 우위를 갖지 못한다는 걸 실측(500k
몬테카를로)으로 확인 — 기존 공식이 `rebAttr(offReb/defReb)*0.45 + vertical*0.2 + strength*0.10 +
boxOut*0.15 + hustle*0.10`으로 공격/수비 공용이었는데, 부차적 능력치(vertical/strength) 비중이
높아 defReb 우위가 희석됐기 때문. 이에 대해 사용자가 "수비 리바운드는 이미 자리를 잡은 상태라
defReb+boxOut이 핵심이고, 공격 리바운드는 밖에서 뛰어들어와 경합하는 것이라 offReb+허슬이 핵심"이라는
농구 논리를 제시, 상황별(공격/수비) 전용 공식으로 분리하기로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts`
  (server) — `REBOUND`에 `DRB_REB_WEIGHT`/`DRB_BOXOUT_WEIGHT`/`DRB_VERTICAL_WEIGHT`/
  `DRB_STRENGTH_WEIGHT`/`ORB_REB_WEIGHT`/`ORB_HUSTLE_WEIGHT`/`ORB_VERTICAL_WEIGHT` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — `calculateOrbChance`의 `calcPower`(공수 공용 1개)를 `calcOffPower`/`calcDefPower`
  2개로 분리, `selectRebounder`의 점수 계산도 `isOffensive` 분기로 공식 자체를 분리

**Before**:
```ts
// calculateOrbChance
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 + p.attr.boxOut * 0.15 + p.attr.hustle * 0.10);
    }, 0);
const offPower = calcPower(offTeam, 'offReb');
const defPower = calcPower(defTeam, 'defReb');

// selectRebounder
const rebAttr: 'offReb' | 'defReb' = isOffensive ? 'offReb' : 'defReb';
let score = (
    p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 +
    p.attr.boxOut * 0.15 + p.attr.hustle * 0.10
) * shooterPenalty;
```

**After**:
```ts
// calculateOrbChance
const calcOffPower = (team: TeamState) =>
    team.onCourt.reduce((sum, p) =>
        sum + (p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT), 0);
const calcDefPower = (team: TeamState) =>
    team.onCourt.reduce((sum, p) =>
        sum + (p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT), 0);
const offPower = calcOffPower(offTeam);
const defPower = calcDefPower(defTeam);

// selectRebounder
let score = (
    isOffensive
        ? p.attr.offReb * cfg.ORB_REB_WEIGHT + p.attr.hustle * cfg.ORB_HUSTLE_WEIGHT + p.attr.vertical * cfg.ORB_VERTICAL_WEIGHT
        : p.attr.defReb * cfg.DRB_REB_WEIGHT + p.attr.boxOut * cfg.DRB_BOXOUT_WEIGHT + p.attr.vertical * cfg.DRB_VERTICAL_WEIGHT + p.attr.strength * cfg.DRB_STRENGTH_WEIGHT
) * shooterPenalty;
```

**가중치 값**: DRB = defReb 0.65 + boxOut 0.20 + vertical 0.05 + strength 0.10 (hustle 제외, 합 1.00) /
ORB = offReb 0.80 + hustle 0.10 + vertical 0.10 (strength/boxOut 제외, 합 1.00)

**검증**: `server tsc` 30개 베이스라인 유지(신규 에러 없음), `vite build` 클린 빌드. 실측 검증(hou팀,
웸반야마 defReb 98 vs 팀원 60~75) — DRB 선택 확률이 기존 공용공식 22.49% → 신규 분리공식 24.82%로
상승(몬테카를로 아님, 이론 확률 계산). ORB도 offReb 88 기준 25.06%로 팀 내 최고.

**롤백 방법**: Before 블록 내용으로 되돌리고, constants.ts의 `DRB_*`/`ORB_*` 7개 상수 제거.

---

## 2026-07-30 — 리바운드 로직 점검: Harvester/Raider 비활성화, motorIntensity 결정론적 전환

**배경**: "32 TEST 2" 탑 리바운더(제일런 듀렌 8.3개)가 실제 NBA 엘리트 리바운더 대비 너무 낮다는
제보로 `reboundLogic.ts` 재점검. (1) `SIM_CONFIG.BLOCK`/`ZONE_SHOOTING`/`PLAYMAKING`/
`CLUTCH_ARCHETYPE`는 전부 `ENABLED: false`(히든 아키타입 임시 비활성화)인데, `REBOUND`의
Harvester(offReb/defReb≥95 → ×1.3)/Raider(키≤200&offReb≥90&vertical≥90 → ×1.4)만 게이트 없이
항상 활성화돼 있었던 걸 확인 — 다른 계열과 통일하기 위해 비활성화. (2) 리바운더 선정 시
`Math.random() * (0.7+motorIntensity*0.6)`로 개별 랜덤을 곱한 뒤 다시 룰렛 추첨을 하는 "이중
랜덤" 구조를 몬테카를로로 검증 — 실력/모터 차이와 무관하게 결과가 이론값보다 항상 살짝 낮게(4~6%)
나오는 걸 확인, 결정론적 배율로 전환. 계수도 0.6→0.3으로 조정 — 기존 계수는 motor=1.0(평균)에서도
이미 1.3배 고정 보너스가 붙어 `types/player.ts`의 텐던시 스펙("0.5~1.5, 리바운드 확률 ±15%")과
안 맞았음.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `REBOUND.ARCHETYPES_ENABLED: false` 신규 추가
- `services/game/engine/pbp/reboundLogic.ts` (client) / `server/src/shared/engine/pbp/reboundLogic.ts`
  (server) — Harvester/Raider 블록에 `cfg.ARCHETYPES_ENABLED` 게이트 추가, motorIntensity 랜덤
  곱셈 제거 + 계수 조정

**Before**:
```ts
if (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || p.attr.defReb >= cfg.HARVESTER_REB_THRESHOLD) {
    score *= cfg.HARVESTER_SCORE_MULTIPLIER;
}
if (isOffensive && p.attr.height <= cfg.RAIDER_MAX_HEIGHT && ...) {
    score *= cfg.RAIDER_SCORE_MULTIPLIER;
}
...
score *= Math.random() * (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.6);
```

**After**:
```ts
if (cfg.ARCHETYPES_ENABLED && (p.attr.offReb >= cfg.HARVESTER_REB_THRESHOLD || ...)) {
    score *= cfg.HARVESTER_SCORE_MULTIPLIER;
}
if (cfg.ARCHETYPES_ENABLED && isOffensive && ...) {
    score *= cfg.RAIDER_SCORE_MULTIPLIER;
}
...
score *= (0.7 + (p.tendencies?.motorIntensity ?? 1.0) * 0.3);  // Math.random() 제거, 계수 0.3
```

**검증**: 몬테카를로 시뮬레이션(1000000회) 3케이스 — (a) 모터 동일/순수 실력차: 결정론적 방식이
이론값(33.3%)과 정확히 일치, 기존 랜덤 방식은 31.8%로 희석 (b) 실력+모터 모두 최상: 결정론적
38.1%=이론값, 기존 방식 36.0%로 모터 보너스가 온전히 반영 안 됨 (c) 실력 좋으나 모터 낮음 vs
실력 평범하나 모터 최상: 결정론적 26.6%≈이론값 26.7%, 기존 26.0%. `cd server && npx tsc -p
tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**참고**: `resolveRebound()`의 Step1(공격/수비 리바운드 판정)→Step2(팀 내 리바운더 선정, offReb/
defReb 상황별 정확히 분기됨) 흐름 자체는 이미 올바르게 구현돼 있음을 확인(추가 수정 없음). 리바운드
총량이 낮은 근본 원인(팀당 FGA 69.5개, 실제 NBA 88~90개)은 페이스/슛 볼륨 이슈로 판단, 이번 범위에서
제외.

**롤백 방법**: 위 Before 블록으로 4개 파일(constants.ts/reboundLogic.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — Transition 전용 PBP 커멘터리 추가 (속공/터치다운 패스)

**배경**: `Transition` 플레이타입이 지금까지 전용 커멘터리 분기가 하나도 없어서, 실제로는 존(zone)
기반 일반 문구(하프코트 슛과 동일한 "아크 정면에서 3점슛..." 등)로 처리되고 있었음을 확인. 앞서
Transition 아웃렛 패서에 `passAcc`(터치다운 패스) 반영까지 마친 김에, 속공 득점/실패와 아웃렛
패스 유무에 따른 전용 문구를 추가.

**변경 파일**:
- `services/game/engine/commentary/textGenerator.ts` (client) / `server/src/shared/engine/commentary/textGenerator.ts`
  (server) — `generateCommentary()`의 'score'/'miss' 섹션에 `playType === 'Transition'` 분기 추가

**After** (신규 추가, 'score' 섹션 — pnrCoverage 체크 이후, 3PT 체크 이전에 배치):
```ts
if (playType === 'Transition') {
    if (assister) {
        return pick([
            `${assister.playerName}, 코트를 가로지르는 터치다운 패스! ${actor.playerName}가 그대로 마무리합니다!${scoreTag}`,
            `${assister.playerName}의 정확한 아웃렛 패스, ${actor.playerName}가 속공으로 연결합니다!${scoreTag}`,
            ...
        ]);
    }
    return pick([
        `${actor.playerName}, 폭발적인 속도로 코트를 가로질러 마무리!${scoreTag}`,
        ...
    ]);
}
```
'miss' 섹션에도 동일 패턴(아웃렛 패스는 좋았으나 마무리 실패 / 단독 속공 실패)으로 추가. 'miss'
섹션에서는 기존 `isBlock` 체크 이후, 3PT 체크 이전에 배치해 블록된 속공은 기존 블록 문구가
우선되도록 함.

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**롤백 방법**: 위 추가된 `if (playType === 'Transition') { ... }` 블록 2곳(score/miss)을 4개 파일
(textGenerator.ts × client/server)에서 삭제.

---

## 2026-07-30 — Playmaking Gravity 신설 (Star Gravity의 어시스트 잠식 역설 해결)

**배경**: Transition 아웃렛 패서 수정에 이어, 어시스트 부족의 두 번째 원인(Star Gravity 부스트가
Iso/PnR_Handler만 늘려 팀 최고 스코어러 겸 패서인 선수 본인의 어시스트 기회를 스스로 깎아먹는 역설)
해결. 팀의 최고 그래비티(스코어링) 선수만 보던 기존 로직과 별개로, 팀의 최고 플레이메이커(포지션
무관, `handler` 아키타입 기준)를 찾아 어시스트형 플레이(PnR_Roll/CatchShoot/Handoff/Cut/
OffBallScreen) 비중을 독립적으로 늘리는 "Playmaking Gravity"를 신설. 요키치처럼 스코어러+패서를
겸비한 선수는 두 부스트를 동시에 받아 "본인 득점"과 "동료를 살리는 플레이" 둘 다 늘어남. 논의 중
PnR_Pop은 제외하기로 확정 — popper 액터 자격(screener+3점, C/PF 한정)과 무관한 부스트라, 팀에
스트레치 빅이 없어도 억지로 낮은 확률 3점을 늘리는 부작용이 있었음.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / `server/src/shared/engine/pbp/possessionHandler.ts`
  (server) — 기존 Star Gravity 블록 바로 뒤에 Playmaking Gravity 블록 추가

**After** (신규 추가분):
```ts
// 기존 Star Gravity(Iso/PnR_Handler/PostUp)는 그대로 유지
const topPlaymakingGravity = Math.max(...offTeam.onCourt.map(p => p.archetypes.handler));
const playmakingBoost = Math.min(0.30, Math.max(0, (topPlaymakingGravity - 70) * 0.02));
weights['PnR_Roll'] *= (1 + playmakingBoost);
weights['CatchShoot'] *= (1 + playmakingBoost);
weights['Handoff'] *= (1 + playmakingBoost);
weights['Cut'] *= (1 + playmakingBoost * 0.7);
weights['OffBallScreen'] *= (1 + playmakingBoost * 0.7);
```

**검증**: 리그 전체 `handler` 아키타입 분포(평균 67.7/중앙값 68.8/p75 77.2/p90 84.8) 확인 후
threshold=70/계수=0.02로 캘리브레이션 — p90대(84.8)에서 상한(30%) 근접. 요키치(handler 94.1) 기준
playmakingBoost 상한 도달 확인. `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과
동일. `npx vite build` → 클라이언트 정상 빌드.

**주의사항**: `topPlaymakingGravity`는 포지션 무관(코트 위 5명 전원 중 최댓값) — 팀의 최고
플레이메이커가 가드여도 동일하게 작동하며, 이 경우도 볼 무브먼트 중심 팀이 되는 게 자연스러운
결과라 의도된 동작. 실제 32 TEST 2류 시뮬레이션에서 요키치/사보니스 등의 어시스트가 목표 범위로
개선됐는지는 다음 실측으로 재확인 필요.

**롤백 방법**: 위 After 블록 추가분을 삭제하면 이전 상태(Star Gravity만 존재)로 복귀.

---

## 2026-07-30 — Transition 아웃렛 패서에 "터치다운 패스" 반영 (passAcc 추가)

**배경**: 요키치/사보니스/센군 같은 플레이메이킹 빅의 어시스트가 실측(32 TEST 2)으로 확인해보니
너무 낮음(요키치 3.29 vs 실제 NBA 9~10대, 약 1/3 수준) — 원인 조사 중 (1) Star Gravity 부스트가
팀의 최고 그래비티 선수(요키치 계산 시 gravity≈124.5, 부스트 상한 30% 도달)의 자기 득점 플레이만
늘려 어시스트형 플레이 비중을 상대적으로 9%가량 깎는 것 (2) Transition의 패서 선정에 `passAcc`가
빠져있어 "발은 느려도 정확도+시야로 풀코트 패스를 꽂는" 요키치/르브론형 아웃렛 패서가 저평가되는 것,
두 가지를 확인함. 이번엔 (2)부터 수정 — Transition 패서 기준에 `passAcc`를 추가하고 비중을 상향.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `Transition` 케이스의 `outletPasser` 선정 기준 교체

**Before**:
```ts
const outletPasser = pickPasser(p => p.archetypes.connector + p.attr.passVision * 0.3, actor.playerId);
```

**After**:
```ts
const outletPasser = pickPasser(p => {
    const touchdownQuality = (p.attr.passVision + p.attr.passAcc) / 2;
    return p.archetypes.connector + touchdownQuality * 0.5;
}, actor.playerId);
```

**검증**: 요키치(connector 94.4, passVision 99, passAcc 98) 기준 재계산 — 124.1 → 143.65(+16%).
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**참고**: Star Gravity 부스트(원인 1)는 아직 미해결 — "팀의 최고 그래비티 선수가 진짜 슛 크리에이터
타입인지"를 구분하지 않고 무조건 Iso/PnR_Handler를 늘리는 구조라, 요키치처럼 스코어러이자 최고
패서인 선수의 어시스트 기회를 스스로 깎아먹는 역설이 남아있음.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — DRAW_FOUL_CURVE 중상위권 구간 하향 (최상위권과의 격차 확대)

**배경**: 바로 위 항목(`ZONE_CURVE_SCALE` 재조정)에 이어, drawFoul 최상위권(95~99)과 중상위권
(80~90)의 격차를 벌리고 싶다는 요청. 처음엔 95/99 자체를 올리는(0.15→0.2, 0.19→0.35) 안이
나왔으나 계산해보니 95~99 구간에 정확히 이번에 문제였던 선수들(엠비드96/야니스98/요키치95/
하든99/SGA98)이 몰려있어서, 이걸 올리면 방금 `ZONE_CURVE_SCALE`로 해소한 빅맨 파울 과다노출이
되살아나거나(엠비드 Rim 25.6%→30.4%) 오히려 더 악화되는(야니스 Rim →34.6%, 원래 문제 32%보다도
높음) 문제가 확인됨. 대신 "격차를 위에서 벌리지 말고 아래에서 벌리는" 방향으로 확정 — 95/99는
그대로 두고 80~90(칼 말론/샤킬 등 중상위권) 구간만 하향.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SHOOTING_FOUL.DRAW_FOUL_CURVE`의 80/85/90 breakpoint 값 변경 (95/99는 유지)

**Before**: `[80, 0.035], [85, 0.065], [90, 0.10], [95, 0.15], [99, 0.19]`
**After**: `[80, 0.015], [85, 0.035], [90, 0.06], [95, 0.15], [99, 0.19]`

**검증**: 재계산 — 칼 말론(drawFoul 90) Rim 기준 22%→19.6%로 하향, 엠비드(96)는 25.6%로 그대로
유지 → 최상위권-중상위권 격차가 2.4%p에서 6.0%p로 확대. `cd server && npx tsc -p tsconfig.json`
→ 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 슈팅파울 ZONE_CURVE_SCALE 재조정 (빅맨 자유투 과중 문제)

**배경**: 헬프디펜스 정리 후, "그냥 파울 로직"(헬프디펜스 무관) 자체를 재점검하다가
`SHOOTING_FOUL.DRAW_FOUL_CURVE × ZONE_CURVE_SCALE` 조합에서 원인을 발견. "32 TEST 2" 실측 데이터로
확정: 리그 전체 drawFoul 1~3위인 하든(99)/SGA(98)/엠비드(96)는 커브 원값이 비슷한데(0.19/0.18/0.16,
3%p 이내 차이) 실제 FTA는 엠비드(6.2개)가 하든(4개)의 1.5배 이상 — 가드는 3PT/Mid 위주라 존
스케일(25%/50%)로 크게 희석되는 반면, PostUp 위주 빅맨은 Rim/Paint(100%/80%)에서 거의 풀파워로
적용됐기 때문. 카림 압둘자바(drawFoul 84로 하든보다 15점 낮은데 평균 FTA 7개로 오히려 더 많음)도
동일 원인. `ZONE_CURVE_SCALE`을 Rim/Paint/Mid는 큰 폭으로, 3PT는 상대적으로 적게 낮춰서 재조정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SHOOTING_FOUL.ZONE_CURVE_SCALE` 값 변경

**Before**: `{ Rim: 1.0, Paint: 0.8, Mid: 0.5, '3PT': 0.25 }`
**After**: `{ Rim: 0.6, Paint: 0.5, Mid: 0.3, '3PT': 0.2 }`

**검증**: 재계산 결과 — 엠비드(drawFoul96) Rim 기준 슈팅파울 확률 32%→25.6%(-20%), Paint 22.8%→18%
(-21%); 하든(drawFoul99) 3PT 기준 7.25%→6.3%(-13%) — 빅맨 쪽이 더 크게 감소해 격차 완화 방향 확인.
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 "빈도 vs 강도" 원칙 정리: HITRATE_PENALTY/FOUL_BONUS 고정값 전환

**배경**: `helpDef` 슬라이더는 "우리 팀이 헬프를 얼마나 자주 부르는가"(빈도)를 나타내야 하는데,
기존엔 `HITRATE_PENALTY_BASE/PER_LEVEL`, `FOUL_BONUS_BASE/PER_LEVEL`가 전부 이 슬라이더에 연동돼
있어서 "헬프를 자주 부르는 팀일수록 헬프 한 번의 효과(적중률 감소폭)와 위험(파울 확률)도 세진다"는
논리적 모순이 있었음. 개인 기량 차이는 이미 `iqFactor × physFactor` 성공 게이트가 담당하므로,
슬라이더는 `ATTEMPT_BASE/PER_LEVEL`(빈도)에만 연동하고 나머지는 슬라이더 5단계(중간값) 기준
고정값으로 전환. 함께 죽은 코드가 된 `STEAL_BONUS_BASE/PER_LEVEL`(직전 커밋에서 커브 기반으로
대체됨)도 이번에 삭제.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `HITRATE_PENALTY_BASE/PER_LEVEL` → `HITRATE_PENALTY: 0.033`(고정), `FOUL_BONUS_BASE/PER_LEVEL` →
  `FOUL_BONUS: 0.006`(고정), `STEAL_BONUS_BASE/PER_LEVEL` 삭제
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — `helpHitRatePenalty`/
  `helpBonusRate` 계산식을 고정값 참조로 단순화. **서버 파일에서 A-3 헬프 스틸 공식이 직전 커밋에서
  실수로 안 바뀌고 옛 `STEAL_BONUS_BASE` 그대로 남아있던 것도 이번에 같이 발견해 수정**(server tsc가
  타입 에러로 즉시 잡아냄 — client는 여전히 옛 코드가 참조하는 상수 자체가 지워지기 전까진 무증상).

**Before**:
```ts
HITRATE_PENALTY_BASE: 0.02, HITRATE_PENALTY_PER_LEVEL: 0.03/9,   // 1단계 -2%p ~ 10단계 -5%p
FOUL_BONUS_BASE: 0.0025, FOUL_BONUS_PER_LEVEL: 0.0075/9,          // 1단계 +0.25%p ~ 10단계 +1.0%p
STEAL_BONUS_BASE: 0.003, STEAL_BONUS_PER_LEVEL: 0.009/9,          // (이미 미사용, 죽은 코드)
...
const helpHitRatePenalty = -(HITRATE_PENALTY_BASE + (helpDefLevel-1)*HITRATE_PENALTY_PER_LEVEL);
helpBonusRate = FOUL_BONUS_BASE + (helpDefLevel-1)*FOUL_BONUS_PER_LEVEL;
```

**After**:
```ts
HITRATE_PENALTY: 0.033,  // 슬라이더 5단계 기준 고정
FOUL_BONUS: 0.006,       // 슬라이더 5단계 기준 고정
...
const helpHitRatePenalty = -helpCfg.HITRATE_PENALTY;
helpBonusRate = helpCfg.FOUL_BONUS;
```

**검증**: `cd server && npx tsc -p tsconfig.json` — 최초 실행 시 서버 A-3 스틸 공식이 옛
`STEAL_BONUS_BASE` 참조로 남아있어 32건(신규 2건)으로 잡힘 → 커브 기반으로 수정 후 재실행,
기존 무관 에러 30건과 동일 확인. `npx vite build` → 클라이언트 정상 빌드. `grep`으로
`HITRATE_PENALTY_BASE`/`FOUL_BONUS_BASE`/`STEAL_BONUS_BASE` 등 잔여 참조 전체 삭제 확인.

**롤백 방법**: 위 Before 블록으로 4개 파일(constants.ts/possessionHandler.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 스틸 커브 교체 + 헬프 전용 PBP 커멘터리 추가

**배경**: 헬프 디펜스 재점검 후속. (1) 헬프 스틸 보너스가 슬라이더 기반 flat 값이라 헬퍼 개인의
`stl` 능력치를 전혀 반영 못 했음 — 블락의 헬프 메커니즘(`blk`/`rimProtector` 임계값 기반)과의
일관성을 위해 A-2 패싱레인 스틸이 이미 쓰던 `effectiveStl`/`LANE_STEAL_CURVE`를 그대로 재사용하도록
교체(새 상수 추가 없음). 실측 검증: 요키치(steal72/passPerc78→0.48%)가 고베어(steal40/passPerc72→
0.16%)보다 스틸 확률이 높고, 반대로 블락은 고베어/아데바요(8.0%)가 요키치(2.5%, 기본치뿐)를 압도 —
스킬 프로파일이 실제 스카우팅 평가와 일치함을 확인. (2) 스틸/블락/파울이 헬프 디펜더에게 귀속될 때
PBP 중계에 전용 문구가 없다는 것을 확인, `PossessionResult.isHelpPlay` 플래그를 신설해 커멘터리
생성기까지 관통시킴.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — A-3 헬프 스틸 공식 교체,
  `calculateTurnoverChance` 반환 타입에 `isHelpPlay` 추가, 파울/블락 분기에서 헬프 귀속 시
  `isHelpPlay: true`를 결과에 포함(파울은 `fouler === helpDefender`로 판별, 블락은 `isHelpBlock`
  변수로 추적)
- `services/game/engine/pbp/pbpTypes.ts` (client) / 서버 동일 — `PossessionResult.isHelpPlay?: boolean` 추가
- `services/game/engine/pbp/statsMappers.ts` (client) / 서버 동일 — miss/turnover/foul 세 곳의
  `generateCommentary()` 호출에 `isHelpPlay: !!result.isHelpPlay` 전달
- `services/game/engine/commentary/textGenerator.ts` (client) / 서버 동일 — `flags`에 `isHelpPlay`
  추가, 블락/스틸/파울 세 분기에 헬프 전용 문구 각 3종 추가

**Before** (스틸 공식):
```ts
const helpStealBonus = helpCfg.STEAL_BONUS_BASE + (defTeam.tactics.sliders.helpDef - 1) * helpCfg.STEAL_BONUS_PER_LEVEL;
```
**After**:
```ts
const effectiveStl = helpDefender.attr.stl * 0.7 + helpDefender.attr.passPerc * 0.3;
const helpStealBonus = interpolateCurve(effectiveStl, SIM_CONFIG.STEAL.LANE_STEAL_CURVE);
```
(`STEAL_BONUS_BASE`/`STEAL_BONUS_PER_LEVEL` 상수는 더 이상 안 쓰이나 이번엔 삭제하지 않고 남겨둠 —
필요 시 별도 정리)

**Before** (커멘터리, 블락 예시):
```ts
if (isBlock && defender) {
    return pick([`${actor.playerName}의 슛, ${defender.playerName}에게 가로막힙니다! (블록)`, ...]);
}
```
**After**:
```ts
if (isBlock && defender) {
    if (isHelpPlay) {
        return pick([`위크사이드에서 넘어온 ${defender.playerName}, 완벽한 타이밍의 헬프 블락!`, ...]);
    }
    return pick([...기존...]);
}
```
(스틸/파울도 동일 패턴)

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**주의사항**: 이전 항목("헬프 디펜스 시스템 재설계")에서 논의만 하고 미구현으로 남은 항목이 있음 —
`HITRATE_PENALTY`/`FOUL_BONUS`를 슬라이더 연동 없는 고정값(각각 0.033/0.006)으로 바꾸는 건
(빈도는 슬라이더가, 강도는 개인 기량이 결정해야 한다는 원칙 논의까지는 끝났으나) 아직 코드 반영
전. `STEAL_BONUS`는 이번에 커브 기반으로 완전히 교체되어 이 이슈가 해소됨.

**롤백 방법**: 위 Before 블록으로 8개 파일(possessionHandler.ts/pbpTypes.ts/statsMappers.ts/
textGenerator.ts × client/server) 되돌릴 것.

---

## 2026-07-30 — 헬프 디펜스 시스템 재설계 (헬퍼 선정 가중치, 파울 보너스 트리거, 체력 페널티 제거)

**배경**: PostUp PLAYTYPE_MOD 재조정에 이어 헬프디펜스 확률 자체를 재점검. 세 가지를 순서대로 확정:

1. **헬퍼 선정**: Rim/Paint 헬퍼 풀이 기존엔 C/PF/SF로 제한돼 있어 특정 빅맨에게 헬프 관여가
   구조적으로 쏠렸음 — 전 포지션으로 열고, 선정 자체를 helpDefIq 가중 룰렛으로 변경(눈치 빠른
   선수가 실제로 로테이션에 나설 확률부터 높아야 한다는 논의).
2. **파울 보너스 트리거**: 기존엔 `helpAttempted && helpSuccess`(IQ×운동능력 게이트 통과)일 때만
   파울 확률이 붙어서, "헬프에 성공할수록(=잘하는 선수일수록) 파울도 늘어나는" 역설이 있었음.
   체력 페널티는 이미 "시도 자체"로 트리거되고 있었다는 점에 착안해 파울 보너스도
   `helpAttempted`(시도 자체)만으로 트리거하도록 통일 — 성공 여부는 hitRate 감소/스틸 보너스에만
   영향을 주고, 파울 위험은 "몸이 그 자리에 갔다"는 사실만으로 결정되도록 재정의. 발동 빈도가
   늘어난 만큼 크기는 절반으로 재조정(1단계 +0.5%p~10단계 +2.0%p → +0.25%p~+1.0%p).
3. **체력 페널티 제거**: 헬프 시도 시 체력 소모 배율(`DRAIN_MULT`, ×1.10~×1.25)을 완전히 삭제.
   이 배율 하나만을 위해 존재하던 `isHelpDefender`/`helperPlayerId` 파라미터 체인도 함께 정리.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `HELP_DEFENSE.ZONE_POSITIONS`(Rim/Paint 전 포지션 확장), `FOUL_BONUS_BASE/PER_LEVEL`(절반 재조정),
  `DRAIN_MULT_BASE/PER_LEVEL` 삭제
- `services/game/engine/pbp/possessionHandler.ts` (client) / 서버 동일 — 헬퍼 선정을 helpDefIq 가중
  룰렛으로, 파울 보너스 트리거를 `helpAttempted`만으로 변경
- `services/game/engine/fatigueSystem.ts` (client) / 서버 동일 — `isHelpDefender` 파라미터 및
  체력 배율 블록 삭제
- `services/game/engine/pbp/stateUpdater.ts` (client) / 서버 동일 — `helperPlayerId` 파라미터 삭제
- `services/game/engine/pbp/liveEngine.ts` (client) / 서버 동일 — `updateOnCourtStates` 호출부에서
  `result.helpDefenderId` 인자 제거

**Before** (헬퍼 선정, `possessionHandler.ts`):
```ts
ZONE_POSITIONS: { Rim: ['C','PF','SF'], Paint: ['C','PF','SF'], ... }
...
helpDefender = helperPool[Math.floor(Math.random() * helperPool.length)];
```

**After**:
```ts
ZONE_POSITIONS: { Rim: ['PG','SG','SF','PF','C'], Paint: ['PG','SG','SF','PF','C'], ... }
...
const totalHelpIq = helperPool.reduce((sum, p) => sum + Math.max(1, p.attr.helpDefIq), 0);
let iqRoll = Math.random() * totalHelpIq;
helpDefender = helperPool[helperPool.length - 1];
for (const p of helperPool) {
    iqRoll -= Math.max(1, p.attr.helpDefIq);
    if (iqRoll <= 0) { helpDefender = p; break; }
}
```

**Before** (파울 보너스 트리거):
```ts
if (helpAttempted && helpSuccess && (Rim/Paint)) { helpBonusRate = FOUL_BONUS_BASE(0.005) + ...; }
```
**After**:
```ts
if (helpAttempted && (Rim/Paint)) { helpBonusRate = FOUL_BONUS_BASE(0.0025) + ...; }
```

**Before** (체력 페널티, `fatigueSystem.ts`):
```ts
if (isHelpDefender) {
    const helperDrainMult = DRAIN_MULT_BASE + (sliders.helpDef - 1) * DRAIN_MULT_PER_LEVEL;
    drain *= helperDrainMult;
}
```
**After**: 블록 전체 삭제, `isHelpDefender` 파라미터도 함께 삭제.

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일(신규 0건). `npx vite
build` → 클라이언트 정상 빌드. `grep`으로 `DRAIN_MULT`/`isHelpDefender`/`helperPlayerId` 전체
삭제 확인.

**주의사항**: `PossessionResult.helpDefenderId` 필드 자체와 `possessionHandler.ts`의 각 return문에
남아있는 `helpDefenderId` 할당은 그대로 남겨둠(더 이상 소비되진 않지만, 수십 개 return문을 건드리는
큰 범위의 기계적 변경이라 이번 범위에서 제외 — 필요 시 별도로 정리 요청).

**롤백 방법**: 위 Before 블록들로 6개 파일(constants.ts/possessionHandler.ts/fatigueSystem.ts/
stateUpdater.ts/liveEngine.ts × client/server) 전부 되돌릴 것.

---

## 2026-07-30 — 논슈팅 파울 PostUp PLAYTYPE_MOD 재조정 (1.5%p → 0.6%p)

**배경**: "32 TEST 2" 토너먼트에서 PF(개인파울) 상위 21위가 전부 센터, 그중 상당수가 고베어/AD/
웸반야마/아데바요/클랙스턴 같은 엘리트 디펜더라는 제보에서 시작한 파울 시스템 재점검. 원인 추적
중 `NON_SHOOTING_FOUL.PLAYTYPE_MOD`의 PostUp(+1.5%p, 전체 최고)이 지난 세션에 PostUp/PnR_Roll을
센터 편중(60%/70%)으로 재설계하기 *전* 볼륨 기준으로 캘리브레이션된 값이라는 게 확인됨. 지금은
PostUp의 공격 액터가 거의 항상 상대팀 최고 포스트 스코어러라, 수비도 자연히 우리 팀 최고
림프로텍터가 맡게 되고 — "엘리트 vs 엘리트" 매치업이라 `matchupFoulMult`가 할인 없이(≈1.0)
적용되는 경우가 급증. 즉 볼륨 증가 + 캘리브레이션 안 된 옛 보너스가 겹쳐서 이중으로 파울이
쌓이는 구조였음. PnR_Roll(+1.0%p)은 재조정 없이 유지하기로 확정.

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SIM_CONFIG.NON_SHOOTING_FOUL.PLAYTYPE_MOD.PostUp` 값만 변경

**Before**: `PostUp: 0.015`
**After**: `PostUp: 0.006`

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**참고**: 이번 파울 재점검에서 추가로 확인된, 아직 미해결인 이슈들 —
(1) 헬프디펜스 파울 보너스가 헬프 성공률(엘리트 디펜더일수록 높음)과 상관관계가 있어 "수비를
잘할수록 파울도 늘어나는" 역설 (2) 존 디펜스의 "Funnel inside shots to Bigs"(`possessionHandler.ts`
36-47행)가 매치업 무관 무조건 앵커 고정이라 노출 볼륨을 늘림 (3) `tacticGenerator.ts`의 `helpDef`
슬라이더가 팀의 최고 림프로텍션 스코어에 비례해 자동 상승, 엘리트 림프로텍터 보유 팀이 스스로
그 선수의 헬프 노출을 극대화하는 자기강화 루프. 엘리트 디펜더 전용 파울회피 보너스(연속값 공식
`intDef*0.35+blk*0.35+defConsist*0.30`, 또는 게임 기존 "High Tower" 태그 — DB `archetypes`
테이블의 `rimProtection≥89` 기준, `interiorDefense*0.42+block*0.14+helpDefenseIQ*0.18+
strength*0.12+vertical*0.08+defConsist*0.06`)도 논의됐으나 "미봉책"으로 판단해 보류.

**롤백 방법**: 위 Before 값으로 2개 파일(constants.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — DriveKick 킵/킥아웃 분기를 드라이버 본인 스탯 기반으로 수정 (10개 플레이타입 점검 완료)

**배경**: OffBallScreen에 이어 마지막 플레이타입 DriveKick 점검. 기존 코드는 "드라이버가 직접
마무리할지(킵) vs 킥아웃할지"를 스팟업 슈터(`actor`)의 존 선호도(`selectZone`)로 판정했는데, 이건
드라이버 본인의 침투력/패스 성향과 전혀 무관한 엉뚱한 기준이었다. 스팟업 슈터가 3점 선호가 강하면
드라이버가 아무리 골밑을 잘 뚫어도 "직접 마무리" 분기를 거의 못 타고, 반대로 슈터가 우연히 골밑
선호가 있으면 드라이버의 실제 마무리력과 무관하게 득점자가 뒤바뀌는 구조였음. 이미 계산해두었던
`penetration`(침투력)/`kickPass`(킥아웃 패스력) 값의 비율로 분기를 결정하도록 분리.

이후 순수 불도저형(잭 라빈/앤서니 에드워즈 등, 킵 비율 54~59%) vs 순수 패서형(마크 가솔/요키치/
빌 워튼 등, 킵 비율 34~48%) 10명씩 실측 검증, 패서형 상위권에 빅맨이 많다는 지적에 대해서도
"드라이버 역할 자체의 선정 확률"(`archetypes.driver+handler*0.3`)이 운동능력 낮은 빅맨에게 이미
낮게 걸려있어(가솔 84.0 vs 팍스 113.3) 실제로 이 빅맨들이 드라이버로 뽑힐 빈도 자체가 낮다는 것도
함께 확인.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `DriveKick` 케이스의 킵/킥아웃 분기 로직

**Before**:
```ts
const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
if (dkZone === 'Rim' || dkZone === 'Paint') {
    const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, dkZone);
    return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}
return { playType, actor, secondaryActor: driver, preferredZone: dkZone, shotType: dkZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.02 + driveBonus };
```

**After**:
```ts
const keepChance = penetration / (penetration + kickPass);
if (Math.random() < keepChance) {
    const driveZone = selectZone(['Rim', 'Paint'], driver, sliders) as 'Rim' | 'Paint';  // 드라이버 본인 존 선호도
    const { zone: finishZone, shotType } = resolveFinish(driver, 'drive', sliders, driveZone);
    return { playType, actor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}

const dkZone = selectZone(['3PT', 'Mid', 'Paint', 'Rim'], actor, sliders);
if (dkZone === 'Rim' || dkZone === 'Paint') {
    const { zone: finishZone, shotType } = resolveFinish(actor, 'drive', sliders, dkZone);
    return { playType, actor, secondaryActor: driver, preferredZone: finishZone, shotType, bonusHitRate: 0.02 + driveBonus };
}
return { playType, actor, secondaryActor: driver, preferredZone: dkZone, shotType: dkZone === '3PT' ? 'CatchShoot' : 'Jumper', bonusHitRate: 0.02 + driveBonus };
```

**검증**: 불도저형 10명(잭 라빈/앤서니 에드워즈/제일런 그린 등) 킵 비율 54.3~59.2%, 패서형 10명
(마크 가솔/요키치/빌 워튼 등) 킵 비율 34.2~48.0%로 명확히 분리됨을 확인. `cd server && npx tsc
-p tsconfig.json` 최초 실행 시 `selectZone(['Rim','Paint'],...)`의 반환 타입이 여전히 4존 유니온
전체(`'Rim'|'Paint'|'Mid'|'3PT'`)로 추론되어 `resolveFinish`의 zone 파라미터(`'Rim'|'Paint'`)와
안 맞는 신규 타입 에러 1건 발견 — `as 'Rim' | 'Paint'` 캐스팅으로 수정, 이후 기존 무관 에러 30건과
동일 확인(client `vite build`는 esbuild transpile-only라 애초에 이 에러를 못 잡았음 — server tsc가
다시 한번 실효성 입증). `npx vite build` → 클라이언트 정상 빌드.

**참고**: 이걸로 12개 플레이타입(PostUp/PnR_Roll/PnR_Pop/PnR_Handler/Iso/CatchShoot-passer/Cut/
Transition/Putback/Handoff/OffBallScreen/DriveKick) 전체 점검이 완료됨.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — OffBallScreen 스크리너 선정 `role` 파라미터 누락 버그 수정

**배경**: OffBallScreen 점검 중 `screener` 선정 코드에서 `pickWeightedActor`의 `role` 인자가 빠져있는
걸 발견. 기본값 `'shooter'`가 그대로 적용되면서, 스크리너 역할인데도 (1) 옵션랭크 기반
`usageMultiplier`가 적용돼 팀의 득점 옵션 순위가 높을수록 스크리너로도 더 자주 뽑히고, (2)
`ballDominance`가 반전 없이 그대로 적용돼 볼을 잡고 싶어하는 성향이 강할수록 유리하고, (3)
`playStyle`도 슛선호(+1)일수록 유리하게 작용하는 등, 셋 다 스크리너 역할과는 맞지 않는 방향으로
왜곡되고 있었다. 같은 파일의 Handoff `big`, PnR_Handler `screener`는 이미 `'passer'`를 명시하고
있어서, 이 케이스만 빠뜨린 실수로 판단됨.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `OffBallScreen` 케이스의 `screener` 선정에 `'passer'` role 추가

**Before**:
```ts
const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
```

**After**:
```ts
const screener = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — Putback `offReb` 기반 재정의 + Handoff 허브빅 선정을 passIq/hands 기반으로 교체

**배경**: Cut/Transition은 점검 결과 문제없음으로 결론. 이어서 Putback과(이전에 논의만 하고 코드
반영을 누락했던) Handoff를 함께 처리.

**Putback**: 기존 `p.attr.reb`(공격+수비+박스아웃 평균)는 세컨드찬스 전용 상황에 수비리바운드 능력까지
섞여서 부정확했다(실측: 알 호포드 offReb 35인데 reb 종합 61.3으로 과대평가). 공격리바운드(offReb)만
쓰고 점프력(vertical)·허슬을 반영, 골밑마무리(CLD)는 보조로 축소.

**Handoff**: 기존 `screener`(체격만)로 "볼을 건네는 빅"을 뽑다 보니, 손기술이 최악인 순수
림프로텍터(무톰보 hands52, 드러먼드 hands38, 고베어 hands48)가 요키치(hands98,passIq98)·
사보니스보다 위로 랭크되는 왜곡이 있었음. Handoff는 순수 스크린이 아니라 빅맨이 직접 볼을 다루다
넘겨주는 역할이라는 논의 끝에, passIq/hands 기반 "허브 스코어"로 교체 + PnR_Roll과 동일한 C/PF
자격 제한 재사용.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server)
  — `Putback`/`Handoff` 케이스 액터 선정 공식

**Before**:
```ts
// Putback
const actor = pickWeightedActor(p => p.attr.reb * 0.6 + p.attr.ins * 0.4);

// Handoff
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

**After**:
```ts
// Putback
const actor = pickWeightedActor(p =>
    p.attr.offReb * 0.40 +
    p.attr.vertical * 0.30 +
    p.attr.hustle * 0.20 +
    (((p.attr.closeShot + p.attr.layup + p.attr.dunk) / 3) * 0.10)
);

// Handoff
const handoffHubWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, 그 외 0 }
const big = pickWeightedActor(
    p => p.attr.passIq * 0.5 + p.attr.hands * 0.5,
    actor.playerId, 'passer',
    p => (handoffHubWeights[p.position] ?? 0) > 0
);
```

**검증**: Putback 리그 탑15 — 코니 호킨스/야니스/줄리어스 어빙/바클리/로드먼/러셀/하워드/마이칸/
카림/모세스 말론/벤 월리스/조쉬 하트/블레이크 그리핀/칼 말론 등 실제 역대 리바운드·허슬형과 정확히
일치(로드먼·월리스·하트처럼 골밑마무리는 약해도 리바운드+허슬로 상위권 진입 확인). Handoff 허브
탑15는 요키치(1위)·아비다스 사보니스(2위)로 정상화, 무톰보/드러먼드/고베어류는 배제됨.
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — `pickWeightedActor`의 passer 선정에서 옵션랭크/볼도미넌스 오적용 수정

**배경**: CatchShoot 점검 중, 슈퍼스타/스트레치빅이 `spacer`(슈터)로 자주 뽑히는 것 자체는 타당한데,
그 슛을 누가 어시스트했는지(passer 선정)를 검증하다가 `pickWeightedActor` 공통 로직의 구조적 문제를
발견함. `usageMultiplier`(옵션랭크 기반 배율, "1옵션일수록 슛을 더 쏘게")와 `ballDominance`(볼을
잡고 싶어하는 성향)가 둘 다 `role`(shooter/passer) 구분 없이 무조건 곱해지고 있었음 — 그 결과
"득점 옵션 순위가 높다"거나 "볼을 안 놓으려는 성향"이라는, 패스 능력과 무관한 요인이 패서(어시스트
제공자) 선정에도 그대로 가산점을 주는 모순이 있었음. 반면 `playStyle`(-1 패스퍼스트~+1 슛퍼스트)은
이미 role별로 정확히 반영되고 있었음(패스퍼스트면 패서 픽 가중치↑) — 이건 그대로 유지.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `pickWeightedActor` 내부 `usageMultiplier`/`ballDominance` 계산 로직 (모든 play type의 passer 선정에
  공통 적용되는 변경)

**Before**:
```ts
const rank = optionRanks.get(p.playerId) || 3;
const usageMultiplier = getContextualMultiplier(rank, playType);
let weight = Math.max(1, rawScore) * usageMultiplier;

weight *= (p.tendencies?.ballDominance ?? 1.0);
```

**After**:
```ts
// usageMultiplier: passer 선정엔 옵션랭크 적용 안 함 (득점 순위와 어시스트 능력은 무관)
const rank = optionRanks.get(p.playerId) || 3;
const usageMultiplier = role === 'shooter' ? getContextualMultiplier(rank, playType) : 1.0;
let weight = Math.max(1, rawScore) * usageMultiplier;

// ballDominance: passer 선정엔 0.5~1.5를 1.0 기준 대칭 반전(2.0-x) — 볼도미넌스가
// 낮을수록(볼에 덜 집착할수록) 패서 가중치가 올라가도록
const ballDom = p.tendencies?.ballDominance ?? 1.0;
weight *= role === 'shooter' ? ballDom : (2.0 - ballDom);
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` →
클라이언트 정상 빌드. 이 변경은 `pickWeightedActor`의 공통 로직이라 CatchShoot뿐 아니라 모든
play type의 passer/secondaryActor 선정에 동일하게 적용됨.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — Iso `isoScorer`의 scoringComposite를 peak/secondary 구조로 재수정

**배경**: 바로 아래 항목("Iso isoScorer 아키타입 재정의")에서 mid/three/CLD를 고정 비율(0.20/0.60/0.20)로
선형 블렌드했는데, Cut 점검 중 야니스 안테토쿤보의 사례(driver 단독 4위인데 Cut 액터 점수는 154위)를
살펴보다가 "Iso가 3점 스텝백형뿐 아니라 골밑 돌진형 파워 드라이버도 포괄해야 한다"는 논의로 이어짐.
실측 확인: 야니스의 골밑(CLD) 97.7은 커리(74.0)보다도 훨씬 높은데, 선형 블렌드에서 3점 비중이 0.60로
가장 커서 야니스의 isoScorer(81.4)가 르브론(87.3)보다도 낮게 나오는 왜곡이 있었음. 골밑 지배형과
3점 지배형 둘 다 "각자의 강점 경로"로 정당하게 평가받도록, `usageSystem.ts`의 `calculateScoringGravity`
(peak 0.7 + secondary 0.3)와 동일한 구조로 교체.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `isoScorer`의 `scoringComposite` 계산 방식 교체 (handling 비중 0.40, scoringComposite
  0.60은 유지)

**Before**:
```ts
const scoringComposite =
    (attr.mid * 0.20) +
    (threeAvg * 0.60) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.20);
```

**After**:
```ts
const isoInsideScore = (attr.closeShot + attr.layup + attr.dunk) / 3;
const isoOutsideScore = (attr.mid * 0.4) + (threeAvg * 0.6);   // outside 내부는 3점>미드 유지
const isoPeak = Math.max(isoInsideScore, isoOutsideScore);
const isoSecondary = Math.min(isoInsideScore, isoOutsideScore);
const scoringComposite = (isoPeak * 0.7) + (isoSecondary * 0.3);
```

**검증**: 445명 전체 기준 재계산 — 야니스 81.4→88.4(르브론 87.6보다 위로 역전), 자이언 75.5→83.3으로
개선. 리그 탑15는 루카(94.4)/카이리(93.3)/SGA(92.8)/래리버드(92.5)/조던(92.4)/데릭로즈(92.0)/
브런슨(91.2)/웨이드(91.1)/할리버튼(90.6)/하든(90.6)/테이텀(90.5)/미첼(90.5)/맥그레이디(90.4)/
드렉슬러(90.3)/모란트(90.3) — 3점형·미드형·골밑파워형이 고르게 섞인 명단. `cd server && npx tsc`
→ 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 되돌리면 바로 아래 항목("선형 블렌드" 버전)의 After 상태로 복귀함.
완전히 이전(운동능력 기반)으로 되돌리려면 아래 항목의 Before까지 함께 되돌릴 것.

---

## 2026-07-29 — Iso `isoScorer` 아키타입 재정의 (운동능력 제거, 3존 종합 스코어링으로 교체)

**배경**: PnR_Handler에 이어 Iso를 점검. 기존 `isoScorer = handling*0.25+mid*0.25+speed*0.25+agility*0.25`는
3점 슈팅력이 전혀 반영 안 되고 운동능력(speed+agility)이 절반을 차지해서, 폭발적인 운동능력형은
아니지만 핸들링+슈팅(특히 스텝백 3점)으로 아이솔레이션을 지배하는 유형(하든/릴라드 등)이 부당하게
낮게 나오는 문제가 확인됨(실측: 하든 83.0으로 카이리 93.5·트레이영 92.0 등 동급 스코어러 중 최하위).

논의 과정에서 단계적으로 확정:
1. 운동능력 비중 축소 + 3점 반영 시도 → 격차는 줄었지만 완전히 해소 안 됨
2. 골밑 돌파(CLD)까지 포함한 종합 스코어링으로 확장, 피지컬 완전 제거 → 하든이 그룹 상위권까지 상승,
   래리버드/듀란트/카멜로 앤서니 등 스킬형 아이소 스코어러가 리그 전체 탑15에 신규 진입
3. 3점>골밑>미드 순으로 scoringComposite 내부 비중 조정(0.60/0.20/0.20) — 3점 비중을 낮게 잡았을 때
   스테판 커리가 리그 전체 18위로 컷 밖 근접까지 밀린 것을 확인하고 재조정해 5~6위로 복귀시킴
4. handling:scoringComposite = 0.40:0.60으로 최종 확정

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `isoScorer` 공식 전면 교체

**Before**:
```ts
const isoScorer = getVal(
    (attr.handling * 0.25) +
    (attr.mid * 0.25) +
    (attr.speed * 0.25) +
    (attr.agility * 0.25)
);
```

**After**:
```ts
const scoringComposite =
    (attr.mid * 0.20) +
    (threeAvg * 0.60) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.20);
const isoScorer = getVal(
    (attr.handling * 0.40) +
    (scoringComposite * 0.60)
);
```

**검증**: 445명 전체 기준 새 공식 리그 탑15 — 루카(95.2)/카이리(93.4)/래리버드(92.9)/SGA(92.4)/
브런슨(91.8)/커리(91.5)/할리버튼(91.2)/하든(91.0)/맥그레이디(90.5)/테이텀(90.4)/제리웨스트(90.0)/
맥시(89.9)/트레이영(89.8)/머레이(89.7)/자말크로포드(89.4) — 실제 역사상 아이솔레이션 강자들과
대체로 일치. 하든이 구공식 대비 83.0→91.0으로 정상화. `isoScorer`는 Iso/PnR_Handler 액터 선정에만
쓰여 다른 부작용 없음 확인(grep 검증). `cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과
동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(archetypeSystem.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PnR_Handler 액터 선정에 득점력(isoScorer) 반영

**배경**: PnR_Pop에 이어 PnR_Handler를 점검. 기존 `handler` 아키타입(handling+passIq+passVision+passAcc)은
득점 요소가 전혀 없는데, PnR_Handler는 결국 볼핸들러가 스크린을 활용해 직접 득점(풀업/드라이브)까지
책임지는 플레이라 득점력이 반영돼야 한다는 문제 제기. 실측 확인: 앤서니 에드워즈(SG, 미드 92/3점
91.3의 엘리트 스코어러)의 handler_score가 71.6으로, 비슷한 등급의 다른 스코어러(부커 83.3, 릴라드
84.4, 하든 91.9)보다 확연히 낮게 나옴 — 순수 패스형 선수에게 밀려 실제로는 팀의 핵심 볼핸들러인
선수가 PnR_Handler 반복 기회를 상대적으로 덜 받는 구조였음.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `PnR_Handler` 액터 선정 기준만 변경 (다른 곳의 `handler` 아키타입 자체는 그대로 — 패서 역할로 계속 사용됨)

**Before**:
```ts
case 'PnR_Handler': {
    const actor = pickWeightedActor(p => p.archetypes.handler);
    ...
}
```

**After**:
```ts
case 'PnR_Handler': {
    // Iso 액터 선정과 동일하게 isoScorer(드리블+득점+운동능력)를 주축으로, handler를 보조 가중치로 사용
    const actor = pickWeightedActor(p => p.archetypes.isoScorer + p.archetypes.handler * 0.5);
    ...
}
```

**검증**: 상위 스코어러 그룹(CP3/스탁턴/트레이영/루카/마크잭슨/부커/커리/하든/앤에드워즈/릴라드)의
새 조합 점수 계산 — 앤서니 에드워즈가 그룹 최하위(handler_old 71.6)에서 하든(128.9)·릴라드(125.0)와
비슷한 중위권(127.6)으로 이동, 순수 패스형(CP3 140.4, 스탁턴 139.1)은 여전히 최상위 유지(이들도
득점력이 나쁘지 않아 조합 점수가 자연스럽게 높음). `cd server && npx tsc -p tsconfig.json` → 기존
무관 에러 30건과 동일. `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 2개 파일(playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PnR_Pop `popper` 아키타입을 screener 기반으로 재정의 (가드가 팝아웃하던 문제 수정)

**배경**: PostUp/PnR_Roll에 이어 나머지 10개 플레이타입을 점검하던 중 PnR_Pop이 눈에 띄었다. 다른
스크린 계열 플레이(PnR_Roll의 screener, OffBallScreen의 screener, Handoff의 big)는 전부 "실제로
스크린을 세울 수 있는 사람인가"(신체 스탯 기반 `screener` 아키타입)를 어떤 형태로든 반영하는데,
PnR_Pop의 `popper`만 순수 3점+슛IQ뿐이라 스크리닝 능력과 무관했다. 445명 전체 평균 실측 결과
`popper`(구공식) 순위가 PG 78.3 > SG 78.9 > SF 76.1 > PF 71.0 > C 59.0 — 픽앤팝(스크린을 세운 빅맨이
팝아웃하는 액션)인데 포인트가드가 1위로 나오는 완전히 뒤집힌 결과였음.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `popper` 공식 교체, `screener` 계산을 `screenerRaw`로 분리해 재사용
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `PnR_Pop` 액터 선정에 `PNR_ROLL` 자격 필터(C/PF만 허용) 재사용

**Before** (`archetypeSystem.ts`):
```ts
const screener = getVal(
    (attr.strength * 0.40) + (normHeight * 0.30) + (normWeight * 0.30)
);
...
const popper = getVal(
    (threeAvg * 0.70) +      // threeAvg = 코너/45도/탑 3점 통합 평균
    (attr.shotIq * 0.30)
);
```

**After**:
```ts
const screenerRaw = (attr.strength * 0.40) + (normHeight * 0.30) + (normWeight * 0.30);
const screener = getVal(screenerRaw);
...
// 코너 3점 제외(픽앤팝은 45도/탑에서만 나옴), shotIq 제거, screenerRaw 0.6 비중으로 스크리닝 능력 요구
const popper = getVal(
    screenerRaw * 0.6 +
    ((attr.three45 + attr.threeTop) / 2) * 0.4
);
```

**Before** (`playTypes.ts`):
```ts
case 'PnR_Pop': {
    const popper = pickWeightedActor(p => p.archetypes.popper);
    ...
}
```

**After**:
```ts
case 'PnR_Pop': {
    // PnR_Roll과 동일한 스크리너 풀(C/PF)만 허용 — popper 공식 자체가 이미 C/PF를 거의 동률로
    // 갈라주므로(실측 확인) 추가 배율 없이 자격 필터만 적용
    const popEligible = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, SF:0, SG:0, PG:0 }
    const popper = pickWeightedActor(
        p => p.archetypes.popper,
        undefined, 'shooter',
        p => (popEligible[p.position] ?? 0) > 0
    );
    ...
}
```

**검증**: 445명 전체 평균으로 새 `popper` 공식 계산 — C 63.3 / PF 62.8(거의 동률) / SF 59.6 / SG 54.8
/ PG 49.3로 포지션 순서가 정상화됨(SF 이하는 필터로 완전 배제되므로 순위 자체는 참고용).
`cd server && npx tsc -p tsconfig.json` → 기존 무관 에러 30건과 동일. `npx vite build` → 클라이언트
정상 빌드.

**롤백 방법**: 위 Before 블록으로 4개 파일(archetypeSystem.ts/playTypes.ts × client/server) 되돌릴 것.

---

## 2026-07-29 — PostUp/PnR_Roll 액터 선정에 포지션 가중치 추가 (센터 볼터치 부족 개선)

**배경**: "32 TEST"(32팀 멀티 리그, 95경기 실측) 데이터 분석에서 엘리트 센터들의 usage가 동급
가드/윙보다 확연히 낮다는 문제 확인(전체 슛 시도 중 C 점유율 14.2%, 5포지션 균등 기대치 20% 대비
낮음). 원인 추적 결과 (1) 플레이타입 풀 자체가 가드/윙 편향 (2) "센터 전용"이어야 할 PostUp/PnR_Roll
안에서조차 액터 선정 아키타입 공식이 포지션을 구분하지 못함 — 두 가지가 확인됐고, 이번엔 (2)를 수정.

실측(`meta_players` 445명 전체 평균):
```
postScorer(구공식) : C 74.4 | PF 74.1 | SF 70.8   → C/PF 사실상 동률
roller             : C 67.7 | PF 73.9 | SF 74.9   → 센터가 오히려 최하위
```
포지션 간 실력 차이가 거의 없거나 역전돼 있어, 순수 스킬 경쟁만으로는 "센터 전용 플레이"가 센터에게
가지 않는 구조였음. 논의 끝에 (a) `postScorer` 공식을 postPlay 중심으로 재정의하고 (b) PostUp/PnR_Roll
액터 선정에 포지션 가중치를 곱하는 방식으로 확정(하드 쿼터 대신 소프트 가중치 — 스킬 격차가 극단적인
예외 로스터에서는 여전히 뒤집힐 여지를 남김).

**변경 파일**:
- `services/game/config/constants.ts` (client) / `server/src/shared/game/config/constants.ts` (server) —
  `SIM_CONFIG.POSITION_WEIGHT` 신규
- `services/game/engine/pbp/archetypeSystem.ts` (client) / `server/src/shared/engine/pbp/archetypeSystem.ts`
  (server) — `postScorer` 공식 교체
- `services/game/engine/pbp/playTypes.ts` (client) / `server/src/shared/engine/pbp/playTypes.ts` (server) —
  `pickWeightedActor`에 `eligibleFilter` 파라미터 추가, `PostUp`/`PnR_Roll` 액터 선정에 포지션 가중치 적용

**Before** (`archetypeSystem.ts`):
```ts
const postScorer = getVal(
    (attr.ins * 0.50) +       // ins = (layup+dunk+postPlay+drawFoul+hands)/5 — postPlay 지분 1/5뿐
    (attr.strength * 0.30) +
    (attr.hands * 0.20)
);
```

**After**:
```ts
const postScorer = getVal(
    (attr.postPlay * 0.50) +
    (((attr.closeShot + attr.layup + attr.dunk) / 3) * 0.30) +
    (attr.hands * 0.20)
);
```

**Before** (`playTypes.ts`, `pickWeightedActor` + PostUp/PnR_Roll):
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter'
) => {
    let pool = players;
    if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
    ...
};
...
case 'PnR_Roll': {
    const screener = pickWeightedActor(p => p.archetypes.roller + p.archetypes.screener * 0.5);
    ...
}
...
case 'PostUp': {
    const actor = pickWeightedActor(p => p.archetypes.postScorer);
    ...
}
```

**After**:
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter',
    eligibleFilter?: (p: LivePlayer) => boolean   // NEW — Math.max(1, rawScore) 하한선 때문에
) => {                                             // criteria*0을 줘도 완전 배제가 안 돼 별도 필터 필요
    let pool = players;
    if (excludeId) pool = pool.filter(p => p.playerId !== excludeId);
    if (eligibleFilter) pool = pool.filter(eligibleFilter);
    ...
};
...
case 'PnR_Roll': {
    const rollWeights = SIM_CONFIG.POSITION_WEIGHT.PNR_ROLL;  // { C:0.7, PF:0.3, SF:0, SG:0, PG:0 }
    const screener = pickWeightedActor(
        p => (p.archetypes.roller + p.archetypes.screener * 0.5) * (rollWeights[p.position] ?? 0),
        undefined, 'shooter',
        p => (rollWeights[p.position] ?? 0) > 0   // SF/SG/PG 완전 배제
    );
    ...
}
...
case 'PostUp': {
    const postUpWeights = SIM_CONFIG.POSITION_WEIGHT.POST_UP;  // { C:0.6, PF:0.2, SF:0.1, SG:0.05, PG:0.05 }
    const actor = pickWeightedActor(p => p.archetypes.postScorer * (postUpWeights[p.position] ?? 0.05));
    ...
}
```

**검증**: 445명 전체 평균 postScorer/roller 값에 새 포지션 가중치를 곱해 계산한 예상 분포 —
PostUp: C 61.6% / PF 20.2% / SF 9.5% / SG 4.4% / PG 4.3% (목표 60/20/10/5/5에 근접),
PnR_Roll: C 68.1% / PF 31.9% (목표 70/30에 근접). `cd server && npx tsc -p tsconfig.json` → 기존
무관 에러 30건과 동일(신규 에러 0건). `npx vite build` → 클라이언트 정상 빌드.

**롤백 방법**: 위 Before 블록으로 6개 파일(constants.ts/archetypeSystem.ts/playTypes.ts × client/server)
전부 되돌릴 것 — 하나만 되돌리면 client/server 미러가 깨짐.

---

## 2026-07-29 — 드래프트 완료 직후 시즌 일정이 안 보이는 경쟁 상태(race condition) 수정

**배경**: "32 TEST" 세션에서 드래프트 완료 후 시즌 화면 진입 시 일정이 안 보이다가 새로고침하니
다시 보이는 현상 제보. DB 직접 조회로 `rooms.schedule`/`roster_state`/`game_pbp`가 전부 정상 생성돼
있는 걸 확인해 서버 데이터 자체는 문제 없음을 확인 — 클라이언트가 finalize 완료 이전에 화면을
읽어버리는 타이밍 문제로 원인 특정.

기존에 `DraftCompletedScreen`(`MultiDraftView.tsx`)이 이미 폴링으로 "일정 생성 중" 대기 로직을
갖고 있었으나, **폴링 대상이 잘못돼 있었음** — `leagues.status === 'in_progress'`를 완료 신호로
썼는데, 이 status는 `finalize.ts`의 `finalizeDraft()` 맨 앞부분에서 "동시 실행 방지용 원자적
claim"으로 실제 일정/전술 생성이 끝나기도 전에 바로 `'in_progress'`로 바뀐다. 즉 폴링이 "이제 막
시작했다"는 신호를 "다 끝났다"로 오인해 너무 일찍 `onNavigate()`를 호출했던 것 — 드래프트가 끝나자마자
"시즌으로 이동" 화면이 뜨는 게 자연스러운 사용자 흐름이라 매 세션 재현 가능성이 있는 구조적 버그.

**변경 파일**:
- `views/multi/league/MultiDraftView.tsx` (client) — `DraftCompletedScreen`의 폴링 대상을
  `leagues.status`(잘못된 조기 claim 신호) → `rooms.schedule` 실제 생성 여부로 교체. 로더 스피너
  대신 경과시간 기반 근사 진행률(점근선, 완료 전 95% 캡) 프로그레스 바로 교체
- `hooks/useMultiGameData.ts` (client) — 백업 방어선: 최초 로드 시 `room.schedule`이 비어있으면
  드래프트 완료 화면을 거치지 않고 다른 경로로 시즌 화면에 바로 들어온 경우를 위해 최대 4회
  (1.5초 간격, 총 6초)까지만 짧게 재조회. 무한 폴링 아님 — 이 최초 로드 시점에만 국한

**Before**:
```tsx
// MultiDraftView.tsx — DraftCompletedScreen
const { data } = await supabase
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .single();
if (data?.status === 'in_progress') setIsReady(true);
else timerId = setTimeout(poll, 3000);
// ...
if (!isReady) return <Loader2 className="animate-spin" .../>;

// useMultiGameData.ts
if (room.schedule) setSchedule(room.schedule as Game[]);
```

**After**:
```tsx
// MultiDraftView.tsx — DraftCompletedScreen
const { data } = await supabase
    .from('rooms')
    .select('schedule')
    .eq('id', roomId)
    .maybeSingle();
if (Array.isArray(data?.schedule) && data.schedule.length > 0) {
    setProgress(100);
    setIsReady(true);
} else {
    timerId = setTimeout(poll, POLL_INTERVAL_MS);
}
// ...
if (!isReady) return (
    <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
             style={{ width: `${progress}%` }} />
    </div>
);

// useMultiGameData.ts
if (room.schedule) {
    setSchedule(room.schedule as Game[]);
} else {
    (async () => {
        for (let i = 0; i < 4 && !cancelled; i++) {
            await new Promise(r => setTimeout(r, 1500));
            if (cancelled) return;
            const retryRoom = await loadRoom(roomId);
            if (retryRoom?.schedule) { setSchedule(retryRoom.schedule as Game[]); return; }
        }
    })();
}
```

**검증**:
- 브레이스 균형 확인, `npm run build` 성공 (client 전용 변경 — server 코드 변경 없어 Fly 재배포 불필요)
- `finalize.ts` 코드 추적으로 `roster_state`/`schedule`이 항상 같은 단일 `update()` 호출에서
  원자적으로 함께 쓰이는 것 확인 — `rooms.schedule` 존재 여부가 완료 판정 신호로 타당함을 확인

**주의사항 / 한계**:
- 실제 진행률 신호(finalize 내부 단계별 완료 이벤트)가 없어 프로그레스 바는 경과시간 기반 근사치임
  (점근선으로 95%까지 채우고 실제 완료 시 100%로 스냅) — 정확한 퍼센트가 아니라 "진행 중" 체감용
- `useMultiGameData.ts`의 재시도는 이번 최초 로드 시점에만 국한되며, 그 이후엔 예전에 확정한 "리그
  진입 시 1회만 로딩" 원칙을 그대로 유지함(일반적인 재로딩 정책 변경 아님)

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 드래프트 픽 타이머 clock skew 보정 (AI 픽 32초로 표시되던 문제)

**배경**: 드래프트 룸 픽당 제한시간을 30초로 설정했는데 AI팀 픽 타이머가 32초로 시작된다는 제보.
조사 결과 AI 전용 버그가 아니라 **서버-클라이언트 시계 오차(clock skew)** 문제로 확인. `hooks/
useLeagueDraft.ts`의 카운트다운이 `Date.now() - new Date(currentPickStartedAt).getTime()`로
클라이언트 로컬 시계와 서버가 찍은 절대시각을 직접 비교하는데, Fly.io 서버 시계와 클라이언트 시계가
몇 초만 어긋나도 그 오차가 그대로 카운트다운에 반영됨. 실측: `curl -I`로 확인한 Fly 서버 HTTP Date
헤더가 로컬 시스템 시각보다 약 3초 빠름 — 정확히 보고된 증상(30초 설정 → 32~33초 표시)과 일치.
사람 픽(30초)도 똑같이 영향받지만, 타이머가 시작되는 정확한 순간을 보고 있는 경우가 드물어 눈치채기
어렵고, AI 픽은 서버에서 2.5~3.5초 만에 끝나버리는 짧은 타이머라(`AI_MIN_DELAY_MS`/`AI_MAX_DELAY_MS`,
`DraftRoom.ts`) 시작값이 그대로 눈에 띔.

NTP 방식과 동일한 원리로 보정 — 서버가 커서를 보낼 때마다 자신의 현재 시각(`serverNow`)을 함께
실어 보내고, 클라이언트는 수신 시점에 `serverNow - Date.now()`로 skew를 계산해 이후 카운트다운
계산에 반영.

**변경 파일**:
- `server/src/protocol.ts` — `DraftCursor` 인터페이스에 `serverNow: string` 필드 추가
- `server/src/DraftRoom.ts` — `getCursor()`가 `serverNow: new Date().toISOString()` 포함하도록 수정
- `hooks/useLeagueDraft.ts` (client) — `clockSkewRef`(ms) 추가, `snapshot`/`pick`/`cursor` 메시지
  수신 시마다 `updateClockSkew(cursor)`로 skew 갱신, 타이머 계산에 `Date.now() + clockSkewRef.current`
  적용

**Before**:
```ts
// DraftRoom.ts
getCursor(): DraftCursor {
    return {
        status: this.status,
        currentPickIndex: this.currentPickIndex,
        currentPickStartedAt: this.currentPickStartedAt,
        ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
        autoPickUserIds: [...this.autoPickUserIds],
    };
}

// useLeagueDraft.ts
const elapsed   = (Date.now() - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
const remaining = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
```

**After**:
```ts
// DraftRoom.ts
getCursor(): DraftCursor {
    return {
        status: this.status,
        currentPickIndex: this.currentPickIndex,
        currentPickStartedAt: this.currentPickStartedAt,
        ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
        autoPickUserIds: [...this.autoPickUserIds],
        serverNow: new Date().toISOString(),
    };
}

// useLeagueDraft.ts
function updateClockSkew(cursor: any) {
    if (cursor?.serverNow) {
        clockSkewRef.current = new Date(cursor.serverNow).getTime() - Date.now();
    }
}
// ... snapshot/pick/cursor 핸들러에서 updateClockSkew(cursor) 호출
const correctedNow = Date.now() + clockSkewRef.current;
const elapsed       = (correctedNow - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
const remaining     = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
```

**검증**:
- `curl -I https://basketballgm-app-server.fly.dev/`의 HTTP Date 헤더 vs 로컬 `date -u` 비교로
  실제 clock skew(~3초) 존재 확인 후 수정 방향 결정
- `buildSnapshot()`이 항상 `getCursor()`를 거쳐 클라이언트에 전달되는 것 확인(스냅샷/픽델타/커서
  변경 메시지 전부 동일 경로) — `startDraft.ts`의 초기 DB `draft_cursor` 직접 쓰기(waiting/preparing
  단계)는 라이브 `DraftRoom` 인스턴스가 없을 때의 영속화 전용이라 이번 수정 대상에서 제외해도 무방
- 양 서버 파일 브레이스 균형 확인, `tsc --noEmit`에서 `serverNow`/`DraftCursor` 관련 신규 에러 없음
  (기존 무관 에러: `Cannot find module 'bun'` 그대로 존재, 이번 변경과 무관)
- `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, 배포 직후 실제 운영 중이던 드래프트
  룸(`DraftRoom:935b07ca-...`)이 정상적으로 auto pick을 이어가는 것을 로그로 확인(연속 픽 #288~293,
  스케줄된 지연 2.6~3.4초로 정상 범위)

**주의사항 / 한계**:
- `startDraft.ts`의 waiting/preparing 단계 DB 직접 쓰기 cursor에는 `serverNow`가 없음 — 다만 이
  단계는 `currentPickStartedAt: null`이라 타이머 자체가 동작하지 않으므로 영향 없음
- clock skew는 서버 재배포/시각 동기화(NTP) 상태에 따라 계속 변동 가능 — 이번 수정은 그 변동을
  실시간으로 계속 보정하는 방식이라 향후 서버 시계가 몇 초 더 틀어져도 자동으로 따라감

**롤백 방법**: 위 Before 블록으로 세 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 파울 로직 점검: 논슈팅/오펜시브/테크니컬 파울 개선

**배경**: "빅맨 파울이 너무 빨리 쌓인다" 제보에서 시작된 파울 시스템 전체 점검의 연속. 앞선 세션에서
슈팅 파울에 매치업 갭(`calculateMatchupGap`, GAP_SCALE=60) 기반 배율(0.5~1.5x)을 이미 적용했고,
이번엔 그 흐름을 이어 3.2 논슈팅 파울 → 3.5 오펜시브 파울 → 3.6 테크니컬 파울까지 순서대로 점검·개선.
3.6.1 플래그런트/3.6.2 파이트 체크는 몬테카를로 시뮬레이션으로 기존 확률을 검증한 뒤 "이정도면
충분하다"/"이건 그냥 두자"로 사용자가 명시적으로 변경 불필요를 확정 — 코드 변경 없음.

**변경 파일**:
- `services/game/config/constants.ts` (client) — `SIM_CONFIG.FOUL_EVENTS`, `SIM_CONFIG.NON_SHOOTING_FOUL`
- `server/src/shared/game/config/constants.ts` (server 미러)
- `services/game/engine/pbp/possessionHandler.ts` (client) — 3.2/3.5/3.6 블록
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러)
- `services/game/engine/pbp/statsMappers.ts` (client) — `technicalFoul` 핸들러 (3.6이 공/수 양쪽에서
  발생 가능해지면서 자유투를 "항상 수비팀"이 아니라 파울을 범한 쪽의 상대팀에게 주도록 필요해진 후속 수정)
- `server/src/shared/engine/pbp/statsMappers.ts` (server 미러)

### 3.2 논슈팅 파울 — 플레이타입별 가산 + 매치업 배율 재사용

기존엔 수비강도(defIntensity)만 반영했는데, 실제로는 플레이타입마다 신체접촉 빈도가 다르고(포스트업/
아이소 > 캐치&슛), 슈팅파울에 쓰던 매치업 배율(matchupFoulMult)도 몸싸움 상황이니 그대로 재사용하는
게 타당하다고 판단.

**Before** (`services/game/engine/pbp/possessionHandler.ts`):
```ts
let nonShootingFoulRate = SIM_CONFIG.NON_SHOOTING_FOUL.BASE_RATE
    + (defIntensity - 5.5) * SIM_CONFIG.NON_SHOOTING_FOUL.DEF_INTENSITY_FACTOR;
nonShootingFoulRate *= foulProbMod;
nonShootingFoulRate = Math.min(SIM_CONFIG.NON_SHOOTING_FOUL.MAX_RATE, nonShootingFoulRate);
```

**After**:
```ts
const nsFoulCfg = SIM_CONFIG.NON_SHOOTING_FOUL;
let nonShootingFoulRate = nsFoulCfg.BASE_RATE + (defIntensity - 5.5) * nsFoulCfg.DEF_INTENSITY_FACTOR;
nonShootingFoulRate += nsFoulCfg.PLAYTYPE_MOD[selectedPlayType] ?? 0;
nonShootingFoulRate *= foulProbMod * matchupFoulMult;
nonShootingFoulRate = Math.min(nsFoulCfg.MAX_RATE, nonShootingFoulRate);
```
`PLAYTYPE_MOD`: PostUp +1.5%p, Iso +1.2%p, PnR_Roll +1.0%p, PnR_Handler/DriveKick +0.8%p, Cut +0.6%p,
CatchShoot -1.0%p (신규 상수, `constants.ts`의 `SIM_CONFIG.NON_SHOOTING_FOUL.PLAYTYPE_MOD`).

### 3.5 오펜시브 파울 — 차징/일리걸 스크린 분리 + 귀속 버그 수정

기존엔 오펜시브 파울이 PnR 계열에서만, 그것도 `helpDefIq` 기반 확률로 발생했음 (수비수의 헬프 판단
능력이 상대의 오펜스 파울 여부를 결정한다는 게 어색하다는 지적 → `defConsist`로 교체). 또한 PnR_Handler
플레이에서 스크리너에게 걸려야 할 일리걸 스크린 파울이 볼핸들러(`actor`)에게 잘못 귀속되던 버그 발견
(`PnR_Handler`의 `actor`는 볼핸들러, 스크리너는 `secondaryActor`)도 이번에 같이 수정. 이제 (1) 모든
플레이타입에서 발생 가능한 차징(포스트업은 별도 고율) + (2) 스크린이 있는 플레이타입에서만 발생하는
일리걸 스크린, 두 독립 체크로 분리.

**Before** (핵심 로직, `helpDefIq` 기반 PnR 전용 확률):
```ts
if (selectedPlayType === 'PnR_Handler' || selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') {
    let offFoulChance = SIM_CONFIG.FOUL_EVENTS.OFFENSIVE_FOUL_BASE;
    if (defender) {
        offFoulChance += (defender.attr.helpDefIq - 70) * SIM_CONFIG.FOUL_EVENTS.CHARGE_BONUS_PER_DEF_IQ;
    }
    if (Math.random() < offFoulChance) {
        return { type: 'offensiveFoul', ..., actor, ... }; // PnR_Handler에서도 항상 actor(볼핸들러) 귀속
    }
}
```

**After**:
```ts
let chargeChance = selectedPlayType === 'PostUp'
    ? offFoulConfig.POST_OFFENSIVE_FOUL_RATE   // 2.5%
    : offFoulConfig.OFFENSIVE_FOUL_BASE;        // 1.5% (전 플레이타입)
if (defender) {
    chargeChance += (defender.attr.defConsist - 70) * offFoulConfig.CHARGE_BONUS_PER_DEF_CONSIST;
}
chargeChance = Math.max(0.005, Math.min(0.04, chargeChance));
if (Math.random() < chargeChance) {
    return { type: 'offensiveFoul', ..., actor, ... };
}

let actualScreener: LivePlayer | undefined;
let screenChance = 0;
if (selectedPlayType === 'PnR_Handler') { actualScreener = secondaryActor; screenChance = offFoulConfig.SCREEN_FOUL_RATE; }       // 0.8%
else if (selectedPlayType === 'PnR_Roll' || selectedPlayType === 'PnR_Pop') { actualScreener = actor; screenChance = offFoulConfig.SCREEN_FOUL_RATE; }
else if (selectedPlayType === 'OffBallScreen') { actualScreener = screener; screenChance = offFoulConfig.OFFBALL_SCREEN_FOUL_RATE; }  // 2.5%
if (actualScreener && Math.random() < screenChance) {
    return { type: 'offensiveFoul', ..., actor: actualScreener, ... };  // 스크리너 본인에게 정확히 귀속
}
```
확률표: 차징(기본) 1.5% / 차징(포스트업) 2.5% / 일리걸스크린(PnR계열) 0.8% / 일리걸스크린(OffBallScreen)
2.5% / Iso는 차징만 적용(스크린 없음, 기본 1.5%). `CHARGE_BONUS_PER_DEF_CONSIST` = 0.0003/point.

### 3.6 테크니컬 파울 — 공/수 양쪽 후보 + 점수차 가중

기존엔 수비팀(defender)에서만 발생 가능했는데, 테크니컬은 경기 외적 파울(항의, 다툼 등) 비중이 커서
공격팀도 받을 수 있어야 하고, 특히 큰 점수차로 지고 있는 팀이 감정적으로 더 격해진다는 게 실제 농구와
맞다는 결론. `temperament` 기반 가중치에 팀별 점수차 배율(20점차 1.3x, 30점차 이상 1.5x, 그 사이 선형)을
곱해 코트 위 10명 전체를 대상으로 룰렛 방식으로 파울러 선정.

**Before**:
```ts
if (Math.random() < SIM_CONFIG.FOUL_EVENTS.TECHNICAL_FOUL_BASE) {
    // defTeam.onCourt 중 temperament 기반 가중치로만 선정
    return { type: 'technicalFoul', ..., defender: techFouler, ... };
}
```

**After**:
```ts
if (Math.random() < offFoulConfig.TECHNICAL_FOUL_BASE) {
    const allOnCourt = [...offTeam.onCourt, ...defTeam.onCourt];
    const offDeficit = Math.max(0, defTeam.score - offTeam.score);
    const defDeficit = Math.max(0, offTeam.score - defTeam.score);
    const offMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, offDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);
    const defMult = 1 + Math.min(offFoulConfig.TECH_DEFICIT_MAX_BOOST, defDeficit * offFoulConfig.TECH_DEFICIT_PER_POINT);
    const techWeights = allOnCourt.map(p => {
        const base = Math.pow(Math.max(0.05, ((p.tendencies?.temperament ?? 0) + 1) / 2), techPower);
        const isOffPlayer = offTeam.onCourt.some(op => op.playerId === p.playerId);
        return base * (isOffPlayer ? offMult : defMult);
    });
    // 가중치 룰렛으로 allOnCourt 중 techFouler 선정 (공/수 무관)
    return { type: 'technicalFoul', ..., defender: techFouler, ... };
}
```
`TECH_DEFICIT_PER_POINT=0.015`, `TECH_DEFICIT_MAX_BOOST=0.5` (20점차→1.3x, 33점차 이상→cap 1.5x).

### 후속 수정: `statsMappers.ts`의 `technicalFoul` 핸들러 (자유투 귀속)

3.6이 공격팀도 대상이 되면서 "자유투는 항상 수비팀에게"라는 기존 가정이 깨짐 → 파울러가 어느 팀
소속인지 판별해 상대팀에게 자유투를 주도록 수정.

**Before** (`services/game/engine/pbp/statsMappers.ts`):
```ts
} else if (type === 'technicalFoul') {
    if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
    const ftShooter = [...defTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0]; // 항상 defTeam이 슈터라고 가정 → 버그
    ...
}
```

**After**:
```ts
} else if (type === 'technicalFoul') {
    if (defender) { defender.techFouls = (defender.techFouls || 0) + 1; }
    const foulerIsOffense = !!defender && offTeam.onCourt.some(p => p.playerId === defender.playerId);
    const ftTeam = foulerIsOffense ? defTeam : offTeam;       // 파울러의 상대팀이 자유투
    const foulerTeam = foulerIsOffense ? offTeam : defTeam;
    const ftShooter = [...ftTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
    ...
    const isEjected = defender && (defender.techFouls || 0) >= 2;
    if (isEjected && defender) { defender.pf = 6; }  // 2테크 퇴장 처리 추가
}
```

**검증**: `cd server && npx tsc -p tsconfig.json` → 기존부터 있던 무관 에러 30건과 정확히 동일(신규
에러 0건). `npx vite build` → 클라이언트 정상 빌드 완료(경고는 청크 사이즈 관련 기존 이슈, 무관).
검증 과정에서 `defender.attr.steal`(오타, 정확히는 `.stl`)을 client/server `flowEngine.ts`의
`calculateMatchupGap` 함수에서 발견해 함께 수정 — client `vite build`는 안 잡고 server `tsc`만 잡아냄.

**롤백 방법**: 위 각 섹션의 Before 블록으로 되돌리면 됨. 5개 파일(constants.ts 2개, possessionHandler.ts
2개, statsMappers.ts 2개 — 총 6개) 모두 client/server 쌍으로 같이 되돌릴 것.

---

## 2026-07-29 — 버저비터 승부결정 포제션의 "조용한 +1점" 버그 수정

**배경**: `BIG LEAGUE TEST 7`(room `b45d2d1c-d0a1-4d5a-8b0d-cd8848ae1177`)의 보스턴vs멤피스 경기
(`game_id: T_R4_M1_G4`)에서 스케쥴 화면 스코어(109-108)와 리뷰 화면 스코어(108-108)가 다르고, PBP
탭에도 버저비터 관련 내용이 전혀 없다는 제보. DB 직접 조회로 확인: `game_pbp.away_score`(스케쥴이
읽는 원본 컬럼)=109, `away_box` 선수별 `pts` 합계(리뷰 화면이 계산해 보여주는 값)=108, `events` 로그는
4쿼터 0:00에 108-108 동점 3점으로 끝나고 그 이후 이벤트가 0건(OT 이벤트도 0건).

원인은 `liveEngine.ts:_handleGameEnd()`의 "동점 → 버저비터 포제션" 로직. 4쿼터가 동점으로 끝나면
`minHitRate:0.75`로 마지막 포제션을 한 번 더 시뮬레이션해 반드시 승자를 가르는데, 그 결과가
`type==='score'`(깨끗한 성공)이면 정상적으로 로그/박스스코어에 반영되지만, 나머지 ~25%(미스/턴오버/
파울 등)로 나오면 "그래도 이겨야 하니까" `buzzTeam.score += 1`로 **팀 스코어에만 조용히 point를
얹고 끝났음** — 어떤 선수 박스스코어에도 안 잡히고 PBP 로그도 안 남는 구조. 이번 경기가 정확히 그
케이스였음(래리 버드의 버저비터 3점이 동점을 만든 뒤, 후속 승부결정 포제션이 미스/턴오버성 결과로
나와 조용히 보스턴에 1점이 얹어짐).

**변경 파일**:
- `services/game/engine/pbp/liveEngine.ts` (client) — `_handleGameEnd()`의 non-score 분기에서
  `buzzResult.actor.pts += 1`로 박스스코어 반영 + 결과 타입(miss/foul/offensiveFoul/turnover/기타)에
  맞는 문구를 고르는 `buildBuzzerFallbackMessage()` 신규 + `state.logs.push()`로 PBP 로그 추가
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러) — 동일 변경

**Before**:
```ts
if (buzzResult.type === 'score') {
    applyPossessionResult(state, buzzResult);
} else {
    // 미스(~25%) → silent +1pt (로그 없음, 우연처럼 보임)
    const buzzTeam = buzzIsHome ? state.home : state.away;
    buzzTeam.score += 1;
}
```

**After**:
```ts
function buildBuzzerFallbackMessage(result: PossessionResult): string {
    const name = result.actor.playerName;
    switch (result.type) {
        case 'miss':
            return `${name}의 슛이 빗나갔지만, 흘러나온 볼을 다시 잡아 극적으로 집어넣습니다!`;
        case 'foul':
        case 'offensiveFoul':
            return `혼전 속 파울 상황에서도 ${name}의 팀이 침착하게 추가 득점을 챙깁니다.`;
        case 'turnover':
            return `공을 놓칠 뻔한 위기에서도, ${name}의 팀이 혼전 끝에 극적으로 득점을 만들어냅니다.`;
        default:
            return `극도의 혼전 속에서 ${name}의 팀이 마지막 순간 득점을 만들어냅니다.`;
    }
}
// ...
if (buzzResult.type === 'score') {
    applyPossessionResult(state, buzzResult);
} else {
    const buzzTeam = buzzIsHome ? state.home : state.away;
    buzzResult.actor.pts += 1;
    buzzTeam.score += 1;
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: '0:00',
        teamId: buzzTeam.id,
        text: buildBuzzerFallbackMessage(buzzResult),
        type: 'score',
        points: 1,
    });
}
```

**검증**:
- Node 스크립트로 `buildBuzzerFallbackMessage()`가 miss/foul/offensiveFoul/turnover/technicalFoul/
  flagrantFoul 등 모든 realistic 타입에 대해 자연스러운 문구를 반환하는지 확인
- client/server diff 확인(완전 동일), 양 파일 중괄호 균형 확인
- `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인 (배포 중 "instance refused connection"/lease 관련 로그는 기존에 확인된 일시적
  부팅 노이즈)

**주의사항 / 한계**:
- 이 로그가 실제로 새 스코어와 일치해서 뜨는지는 **배포 이후 새로 발생하는 동점 종료 경기**에서만
  확인 가능 — 기존에 이미 이 버그로 스코어가 어긋난 과거 경기(`T_R4_M1_G4` 포함)는 DB에 저장된
  `events`/`home_box`/`away_box`가 이미 확정된 상태라 재시뮬레이션 없이는 소급 수정되지 않음
- `buzzResult.type`이 `turnover`/`offensiveFoul` 등일 때 "공격팀이 득점한다"는 서사가 다소 부자연스러울
  수 있음(턴오버 직후 득점은 논리적으로 어색) — 그래도 NBA는 동점 종료가 없어 승자를 반드시 가려야
  하므로, 문구를 최대한 그럴듯하게 다듬는 선에서 타협함. 완전히 자연스럽게 만들려면 버저비터 포제션
  자체를 재설계해야 하는데 이번 범위 밖.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-29 — 매치업 격차를 슈팅파울 배수(0.5~1.5x) + 적중률 미스매치(±12%)에 반영

**배경**: 파울 로직 점검 중 발견 — 슈팅파울 확률식(`SIM_CONFIG.SHOOTING_FOUL`)이 공격자의 절대
`drawFoul` 스탯과 팀 슬라이더만 볼 뿐, "이 공격자가 이 수비자를 신체/기술로 압도하는가"라는
매치업 개념이 전혀 없었음(사용자 지적). 반면 적중률 쪽(`flowEngine.ts`)에는 이미 비슷한 미스매치
로직이 있었지만 스위치가 실제로 일어났을 때만 계산됨. 실제 농구 논의(사용자와 여러 라운드)로
다음을 확정: ① 골밑은 힘(strength, 몸싸움) vs 수비자의 파울없이막는기술(intDef·blk 65% + 신체
전제조건 strength·vertical 35%), 퍼리미터는 속도/민첩(공격) vs 컨테인기술(perDef 35% + 신체
agility·speed 45% + 손기술 stl 20%). ② 격차의 결과는 "가드가 빅맨을 못 막으면 대부분 그냥
뚫릴 뿐 파울로 이어지는 게 대부분이 아니다"는 사용자 지적에 따라, **파울은 최대 0.5~1.5배로만
보조적으로 반영**하고 **적중률(±12%)이 주 채널**이 되도록 설계. GAP_SCALE(정규화 스케일)은
실제 선수 매치업(윌트/하더웨이/카터/하킴 등, BIG LEAGUE TEST 7·MIL 실측 스탯) 시뮬레이션
아티팩트로 60 확정.

**변경 파일**:
- `services/game/engine/pbp/flowEngine.ts` (client) — `calculateMatchupGap()`/`MATCHUP_GAP_SCALE`
  신규 export, 기존 스위치 전용 미스매치 블록을 대체
- `server/src/shared/engine/pbp/flowEngine.ts` (server 미러) — 동일
- `services/game/engine/pbp/possessionHandler.ts` (client) — 슈팅파울 확률에 매치업 배수 곱연산 추가
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before** (`flowEngine.ts`, 적중률 미스매치 — 스위치 전용):
```ts
let isMismatch = false;
if (isSwitch) {
    const heightDiff = defender.attr.height - actor.attr.height;
    ... isGuardOnBig / isBigOnGuard / skillGap(아키타입 비교) 개별 체크 ...
    if (isGuardOnBig || isBigOnGuard || skillGap >= 15) {
        isMismatch = true;
        const effectiveGap = Math.max(skillGap, 0); // 음수면 보너스 0 (한쪽만 처리)
        hitRate += Math.min(0.12, (Math.max(effectiveGap, 15) / 100) * 0.3);
    } else {
        hitRate -= 0.03; // 성공적 스위치
    }
}
```

**After**:
```ts
// 신규 export
export function calculateMatchupGap(actor, defender, zone): number {
    if (zone === 'Rim' || zone === 'Paint') {
        const offPower = actor.attr.strength;
        const defSkill = defender.attr.intDef*0.35 + defender.attr.blk*0.30
                       + defender.attr.strength*0.20 + defender.attr.vertical*0.15;
        return offPower - defSkill;
    }
    const offPower = (actor.attr.speed + actor.attr.agility) / 2;
    const defSkill = defender.attr.perDef*0.35 + defender.attr.agility*0.25
                    + defender.attr.speed*0.20 + defender.attr.stl*0.20;
    return offPower - defSkill;
}
export const MATCHUP_GAP_SCALE = 60;

// calculateHitRate() 내부 — 스위치 무관하게 항상 계산, 대칭 적용
const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
const isMismatch = Math.abs(gapNormalized) >= 0.3;
hitRate += gapNormalized * 0.12; // -12%~+12%, 양방향
if (!isMismatch && isSwitch) hitRate -= 0.03; // 성공적 스위치는 유지
```

**After** (`possessionHandler.ts`, 슈팅파울 배수 — 기존 `foulProbMod` 곱연산 지점에 추가):
```ts
const matchupGap = calculateMatchupGap(actor, defender, preferredZone);
const gapNormalized = Math.max(-1, Math.min(1, matchupGap / MATCHUP_GAP_SCALE));
const matchupFoulMult = 1 + gapNormalized * 0.5; // 0.5배(수비 압도) ~ 1.5배(수비 압도당함)
shootingFoulRate *= foulProbMod * matchupFoulMult;
```

**검증**:
- `npx tsc -p server/tsconfig.json` — `flowEngine.ts`/`possessionHandler.ts` 관련 신규 오류 0건
  (기존 무관한 30건은 그대로, 파일 목록 겹치지 않음 확인).
  이 과정에서 `defender.attr.steal`이라는 존재하지 않는 필드 오타를 발견해 `attr.stl`로 수정
  (client는 vite/esbuild가 타입체크를 안 해서 빌드는 통과했지만 동일 오타가 있었음 — 이전
  `attr.mid`/`attr.midRange` 사례와 똑같이 server tsc가 아니었으면 놓칠 뻔함).
- `npx vite build` — 정상 완료.
- 실제 함수 실행 검증(`npx tsx`로 수정된 `flowEngine.ts`를 직접 import): 하더웨이(공)→윌트(수)
  매치업을 실제 DB 스탯으로 넣어 계산 — 골밑 gap=-24.6(아티팩트 시뮬레이션과 정확히 일치),
  퍼리미터 gap=+31.4(동일). GAP_SCALE=60 적용 시 골밑 foulMult=0.79/hitMod=-4.9%, 퍼리미터
  foulMult=1.26/hitMod=+6.3% — "느린 빅맨이 뚫리면 주로 적중률로, 파울은 최대 1.5배까지만"
  의도대로 동작 확인.

**주의사항 / 한계**: 기존 "성공적 스위치"(-3%) 고정 보너스는 스위치가 실제로 발생했고 동시에
유의미한 미스매치(|gapNormalized|≥0.3)가 아닐 때만 유지 — 스위치 없이 격차가 작은 일반
상황에서는 조정 없음(중립).

**롤백 방법**: 위 Before 블록으로 `flowEngine.ts` 미스매치 계산부를 되돌리고,
`possessionHandler.ts`의 `matchupFoulMult` 관련 라인(3줄)을 제거하면 됨. 미러 쌍이므로 4개
파일 전부 함께.

---

## 2026-07-29 — switchFreq 기반 헬프 디펜스 풀 확장 (빅맨 골밑 파울 쏠림 완화 2/2)

**배경**: 빅맨 파울 쏠림 문제 두 번째 원인 논의. 존 디펜스가 골밑 슛을 C에게 100% 몰아주는 것
자체는(스위치 개념이 없으므로) 논리적으로 맞다고 합의(별도 항목, 이번엔 미수정). 다만 맨투맨에서도
헬프 디펜스 헬퍼 후보 풀이 `HELP_DEFENSE.ZONE_POSITIONS`(Rim/Paint → `['C','PF','SF']`)로 항상
고정돼 있어, 실제로 그 순간 골밑 근처에 없을 법한 상황(예: 우리 C가 상대 스트레치 5를 3점 라인까지
쫓아나간 상태)에서도 매 골밑 돌파마다 균등 확률로 헬프 후보에 낀다는 문제가 남음. 처음엔
`zonePref`(선수 존 선호도) 기반 가중치를 검토했으나 사용자가 "유의미한 효과가 없을 것 같다"고 판단,
대신 **스위치 위주 수비(`switchFreq`가 높음)일수록 헬프 풀이 포지션 제한 없이 온코트 전원으로
확장**되는 더 단순한 설계로 방향 전환. 배율은 처음 0.08(근거 없는 임의값)을 제안했으나, 이미 존재하는
`switchChance = switchFreq * 0.05`(스크린 스위치 확률)와 스케일을 통일하는 게 일관적이라고 판단해
최종적으로 0.05 채택.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) — 2.5 Help Defense Resolution의 헬퍼
  풀 선정부
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before**:
```ts
if (helpAttempted) {
    const zonePositions = helpCfg.ZONE_POSITIONS[preferredZone] ?? [];
    let helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId && zonePositions.includes(p.position));
    if (helperPool.length === 0) {
        helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
    }
    ...
}
```

**After**:
```ts
if (helpAttempted) {
    // switchFreq가 높을수록(스위치 위주 수비 = 수비수 전원이 유동적 로테이션에 익숙) 헬프 풀이
    // 존별 포지션 제한 없이 온코트 전원으로 확장될 확률이 생김 — 기존 switchChance와 동일 스케일.
    const universalHelpChance = defTeam.tactics.sliders.switchFreq * 0.05;
    const useFullPool = Math.random() < universalHelpChance;

    const zonePositions = helpCfg.ZONE_POSITIONS[preferredZone] ?? [];
    let helperPool = useFullPool
        ? defTeam.onCourt.filter(p => p.playerId !== defender.playerId)
        : defTeam.onCourt.filter(p => p.playerId !== defender.playerId && zonePositions.includes(p.position));
    if (helperPool.length === 0) {
        helperPool = defTeam.onCourt.filter(p => p.playerId !== defender.playerId);
    }
    ...
}
```

**동작 방식**: `switchFreq × 0.05`(1단계 5% ~ 10단계 50%) 확률로 그 포제션의 헬프 디펜스 후보 풀이
`ZONE_POSITIONS` 제한(Rim/Paint→C·PF·SF) 없이 온코트 5명 전체로 열린다. 예: SEA(switchFreq=4)는
20% 확률로 전체 5명 풀 — C가 뽑힐 확률이 최대 1/3(C·PF·SF만 있을 때)에서 1/5로 희석됨. 나머지
80%는 기존과 동일(포지션 제한 풀). 헬프 "시도 빈도"(`ATTEMPT_BASE`/`PER_LEVEL`)는 손대지 않았고,
풀에 가드가 포함돼도 헬프 성공 여부는 여전히 `helpDefIq`×`(agility+speed)` 게이트를 통과해야 해서
가드가 뽑혀도 대부분 실패로 끝남(골밑 헬프 남발 방지).

**검증**:
- `npx tsc -p server/tsconfig.json` — `possessionHandler.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 별도 시뮬레이션 스크립트 검증은 생략(국소적 산술 로직, 기존 스코프 변수만 재사용).

**주의사항 / 한계**: 존 디펜스의 "Funnel inside shots to Bigs"(C 100% 전담) 로직 자체는 이번에도
그대로 유지 — 사용자와 논의 후 이건 존 디펜스 특성상 맞는 동작이라고 판단해 수정 대상에서 제외.

**롤백 방법**: 위 Before 블록으로 두 파일의 헬퍼 풀 선정부를 되돌리면 됨.

---

## 2026-07-29 — 헬프 디펜스 슈팅파울 보너스를 실제 헬퍼에게 귀속

**배경**: "빅맨들이 파울이 너무 빨리 쌓인다" 점검 중 두 가지 원인을 발견(사용자가 직접 지목):
① 헬프 디펜스 성공 시 붙는 파울 확률 보너스(`FOUL_BONUS_BASE`~)가 실제로 헬프한 선수
(`helpDefender`)가 아니라 원래 포지션 매칭된 수비수(`defender`)한테 그대로 더해지고, 파울이 터지면
무조건 `defender`한테 기록됨. ② 존 디펜스에서 C가 골밑 슛을 100% 전담하는 문제(별도 항목, 이번엔
범위 제외 — 사용자가 1번부터 먼저 처리하기로 결정). 이번 항목은 ①만 수정. 골밑 슛을 헬프 디펜스로
막아준 건 대개 다른 빅맨(PF 등)인데, 그 리스크가 전부 원 수비수(포지션 매칭된 C 등)에게 전가되고
있었음 — 팀원이 도와준 파울까지 한 선수가 떠안는 구조.

**변경 파일**:
- `services/game/engine/pbp/possessionHandler.ts` (client) — 슈팅파울 판정부(`resolvePlayAction`
  경로의 3단계 Shooting Foul Check)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일

**Before**:
```ts
if (helpAttempted && helpSuccess && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
    shootingFoulRate += helpCfg.FOUL_BONUS_BASE + (helpDefLevel - 1) * helpCfg.FOUL_BONUS_PER_LEVEL;
}
...
if (Math.random() < shootingFoulRate) {
    return {
        type: 'freethrow',
        offTeam, defTeam, actor, defender, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
        zone: preferredZone,
        helpDefenderId,
    };
}
```

**After**:
```ts
let helpBonusRate = 0;
if (helpAttempted && helpSuccess && (preferredZone === 'Rim' || preferredZone === 'Paint')) {
    helpBonusRate = helpCfg.FOUL_BONUS_BASE + (helpDefLevel - 1) * helpCfg.FOUL_BONUS_PER_LEVEL;
    shootingFoulRate += helpBonusRate;
}
...
if (Math.random() < shootingFoulRate) {
    // 헬프 보너스가 기여한 비율만큼 확률적으로 실제 헬퍼에게 파울 귀속(전체 파울 확률 자체는 불변)
    const helpFoulShare = helpBonusRate > 0
        ? Math.min(1, (helpBonusRate * foulProbMod) / shootingFoulRate)
        : 0;
    const fouler = (helpDefender && Math.random() < helpFoulShare) ? helpDefender : defender;
    return {
        type: 'freethrow',
        offTeam, defTeam, actor, defender: fouler, points: 0, isAndOne: false, playType: selectedPlayType, isSwitch, isZone,
        zone: preferredZone,
        helpDefenderId,
    };
}
```

**동작 방식**: 헬프 보너스(`helpBonusRate`)를 별도 변수로 추적해두고, 파울이 실제로 터졌을 때
`foulProbMod`(파울트러블 배율)까지 반영한 헬프 보너스의 비중만큼 확률적으로 `helpDefender`에게
파울을 배정한다. 헬프가 없었거나 실패했으면 `helpBonusRate=0`이라 기존과 완전히 동일하게 항상
`defender`. 전체 슈팅파울 확률(게임 밸런스) 자체는 손대지 않고, **누구에게 기록되느냐만** 기여도에
비례해 재분배.

**검증**:
- `npx tsc -p server/tsconfig.json` — `possessionHandler.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 별도 시뮬레이션 스크립트 검증은 생략(변경이 국소적 산술 로직이고, `helpDefender`/`foulProbMod` 등
  기존 스코프 변수만 재사용해 타입체크로 충분히 안전하다고 판단).

**주의사항 / 한계**: 존 디펜스에서 C가 골밑 슛을 100% 전담하는 문제(이번 조사에서 함께 발견,
"Funnel inside shots to Bigs" 로직)는 이번 수정 범위에 포함되지 않음 — 별도 후속 작업 필요.

**롤백 방법**: 위 Before 블록으로 두 파일의 `helpBonusRate` 추적 및 파울 귀속 분기를 제거하면 됨.

---

## 2026-07-29 — 플레이타입 선택 가중치(PLAY_TYPE_PROFILES) base 전면 재조정

**배경**: 앵커 기반 insideOut 로직(바로 아래 항목)을 적용해도 BIG LEAGUE TEST 7의 SEA(윌트
체임벌린)가 여전히 포제션을 충분히 못 가져가는 문제가 계속됨. 실제 경기(`T_R2_M1_G4`, 107-132 패)
박스스코어를 분석한 결과, PG 팀 하더웨이가 팀내 압도적 1위(17FGA)를 가져간 반면 윌트는 6FGA에
그침(+파울아웃으로 4쿼터 결장). `computePlayTypeWeights()`의 `PLAY_TYPE_PROFILES`를 뜯어보니
원인은 슬라이더 계수가 아니라 **base 값 자체**였음 — `PnR_Handler`(3.0)와 `CatchShoot`(3.5)가
`PostUp`/`PnR_Roll`(각 1.5)보다 2배 가까이 높게 잡혀 있어서, insideOut을 아무리 낮춰도(insideFactor
최대 0.8) 그 격차를 계수 보정만으로는 못 뒤집었음. git log·주석 어디에도 이 base 값들의 산정 근거가
없었음(확인함). 아티팩트로 base 값을 직접 편집하며 4개 시나리오(중립/SEA 실제/완전인사이드/
완전아웃사이드)의 정규화된 포제션 비율을 실시간 비교 검증한 뒤, 사용자가 확정한 값을 반영.

**변경 파일**:
- `services/game/config/playTypeProfiles.ts` (client) — `PLAY_TYPE_PROFILES`의 `base` 값 10개 전체
- `server/src/shared/game/config/playTypeProfiles.ts` (server 미러) — 동일
- `docs/engine/pbp-engine.md` — `PLAY_TYPE_PROFILES` 표 및 ballMovement별 CatchShoot 비중 예시
  갱신(기존 실측치는 base 변경으로 무효화됨을 명시)

**Before**:
```ts
'Iso':           { base: 2.0, inside:  0.0, pnr:  0.0, bm: -2.0 },
'PostUp':        { base: 1.5, inside: +2.5, pnr:  0.0, bm: -1.0 },
'PnR_Handler':   { base: 3.0, inside:  0.0, pnr: +3.0, bm:  0.0 },
'PnR_Roll':      { base: 1.5, inside: +1.5, pnr: +2.0, bm:  0.0 },
'PnR_Pop':       { base: 1.0, inside: -1.5, pnr: +2.0, bm:  0.0 },
'CatchShoot':    { base: 3.5, inside: -2.0, pnr:  0.0, bm: +2.0 },
'OffBallScreen': { base: 1.5, inside: -1.0, pnr:  0.0, bm: +1.5 },
'DriveKick':     { base: 2.5, inside: -1.0, pnr:  0.0, bm: +2.0 },
'Cut':           { base: 2.0, inside: +1.5, pnr:  0.0, bm: +1.5 },
'Handoff':       { base: 1.5, inside:  0.0, pnr:  0.0, bm: +1.0 },
```

**After**:
```ts
'Iso':           { base: 1.5, inside:  0.0, pnr:  0.0, bm: -2.0 },
'PostUp':        { base: 1.5, inside: +2.5, pnr:  0.0, bm: -1.0 },
'PnR_Handler':   { base: 1.5, inside:  0.0, pnr: +3.0, bm:  0.0 },
'PnR_Roll':      { base: 1.5, inside: +1.5, pnr: +2.0, bm:  0.0 },
'PnR_Pop':       { base: 1.0, inside: -1.5, pnr: +2.0, bm:  0.0 },
'CatchShoot':    { base: 1.0, inside: -2.0, pnr:  0.0, bm: +2.0 },
'OffBallScreen': { base: 1.0, inside: -1.0, pnr:  0.0, bm: +1.5 },
'DriveKick':     { base: 0.7, inside: -1.0, pnr:  0.0, bm: +2.0 },
'Cut':           { base: 0.7, inside: +1.5, pnr:  0.0, bm: +1.5 },
'Handoff':       { base: 0.5, inside:  0.0, pnr:  0.0, bm: +1.0 },
```
(inside/pnr/bm 계수는 미변경, base만 조정)

**검증**:
- `npx tsc -p server/tsconfig.json` — `playTypeProfiles.ts` 관련 신규 오류 0건.
- `npx vite build` — 정상 완료(신규 에러 없음).
- 공식 계산값 비교(아티팩트 시뮬레이션):
  - 중립(5/5/5): 이전 CatchShoot 17.5%+PnR_Handler 15.0%=32.5% 독식 → 이후 PnR_Handler·Iso·
    PnR_Roll·PostUp 4개 13.8% 동률로 고르게 분산.
  - SEA 실제(insideOut=3/pnrFreq=5/ballMovement=6): 이전 CatchShoot 14.7%·PnR_Handler 14.2%가
    1·2위 → 이후 PostUp 19.2%·PnR_Roll 17.5%가 1·2위, PnR_Handler는 12.5%로 4위 하락.

**주의사항 / 한계**: 완전인사이드 시나리오(insideOut=1/pnrFreq=1/ballMovement=1)에서 Iso가
25.4%까지 오르는데, 이건 insideOut이 아니라 같이 낮춘 ballMovement(Iso의 bm 계수 -2.0)의
영향이 커서 순수 insideOut 단독 효과로 오독하지 않도록 주의.

**롤백 방법**: 위 Before 블록으로 두 파일의 `PLAY_TYPE_PROFILES` base 값만 되돌리면 됨(계수는
안 건드렸으므로 base 10개만 원복).

---

## 2026-07-29 — AI 자동전술 생성: 공격 포인트(insideOut)를 앵커 선수 아키타입 기반으로 결정

**배경**: "멀티플레이어 AI 자동전술 로직을 변경하자. 주전 5인의 최고 선수에 따라 공격 포인트를
조절할 수 있는 로직을 추가하고 싶음. 다른건 다 놔두고, 공격 포인트만." 요청. 기존
`generateAutoTactics()`의 `insideOut` 계산은 주전 5명 전체를 평균/최댓값(`maxOf(postScore)`,
`avgOf(spacerScore)` 등)으로 블렌드하는 방식이라, "이 팀에 카림 압둘자바·윌트 체임벌린 같은
로우포스트 전용 레전드가 있다" 같은 단일 선수의 극단적 아키타입이 잘 반영되지 않았다. 주전 중
OVR 최고 선수(앵커)를 따로 판별해, 그 선수가 엘리트 빅맨(3점 사실상 없음+포스트 지배력 매우
높음)이면 인사이드로, 엘리트 슈터(3점 최상급)면 아웃사이드로 슬라이더를 직행시키도록 변경.
BIG LEAGUE TEST 7의 실제 32팀 로스터로 시뮬레이션 검증(아티팩트) 후 반영 — 12/32팀에서 값이
바뀌었고 전부 실제 아키타입과 일치, 오탐 없음 확인. 이후 사용자가 "자동전술 생성 시 공격
포인트의 범위는 3~8 사이로 설정해줘"라고 요청해, 애초 제안했던 극단값(2/9) 대신 3/8로, 기존
블렌드(fallback) 로직의 결과값도 함께 3~8로 재클램프.

**변경 파일**:
- `services/game/tactics/tacticGenerator.ts` (client) — `generateAutoTactics()` 내 `insideOut`
  계산부
- `server/src/shared/game/tactics/tacticGenerator.ts` (server 미러) — 동일

**Before**:
```ts
const insideInd = maxOf(postScore) * 0.5 + maxOf(rollerScore) * 0.3 + maxOf(driverScore) * 0.2;
const outsideInd = avgOf(spacerScore) * 0.6 + avgOf(get3pt) * 0.4;
const insideOut = clamp(Math.round(5 + (outsideInd - insideInd) * 0.15));
```

**After**:
```ts
const anchor = starters.reduce((best, p) => (calculatePlayerOvr(p) > calculatePlayerOvr(best) ? p : best));
// server 미러는 calculatePlayerOvr 대신 calculateOvr(ovrUtils.ts) 사용, 로직 동일
const isEliteBig = get3pt(anchor) < 35 && postScore(anchor) >= 85;
const isEliteShooter = get3pt(anchor) >= 90;

let insideOut: number;
if (isEliteBig) {
    insideOut = 3;
} else if (isEliteShooter) {
    insideOut = 8;
} else {
    const insideInd = maxOf(postScore) * 0.5 + maxOf(rollerScore) * 0.3 + maxOf(driverScore) * 0.2;
    const outsideInd = avgOf(spacerScore) * 0.6 + avgOf(get3pt) * 0.4;
    insideOut = clamp(Math.round(5 + (outsideInd - insideInd) * 0.15), 3, 8);
}
```

**검증**:
- 서버: `npx tsc -p server/tsconfig.json` — `tacticGenerator.ts` 관련 신규 오류 0건.
- 클라이언트: `npx vite build` 정상 완료(신규 에러 없음).
- BIG LEAGUE TEST 7 32팀 실제 로스터(현재 선발 라인업)에 `npx tsx`로 직접 시뮬레이션 —
  카림 압둘자바(CHA)·하킴 올라주원(CHI)·조지 마이칸(CLE)·샤킬 오닐(PHI)·윌트 체임벌린(SEA) 5팀이
  엘리트빅맨으로, 스테판 커리(BKN)·래리 버드(BOS)·레이 앨런(DAL)·니콜라 요키치(HOU)·제임스
  하든(LVP)·더크 노비츠키(MIA)·루카 돈치치(NYK) 7팀이 엘리트슈터로 정확히 분류됨(오탐 없음).
  요키치는 postScore도 85+로 빅맨 조건에 근접하지만 get3pt=90.3이라 빅맨 조건(get3pt<35)을
  통과 못 하고 슈터로 분류되는 경계 사례 확인(설계상 허용).

**롤백 방법**: 위 Before 블록으로 두 파일의 `insideOut` 계산부만 되돌리면 됨(다른 슬라이더
계산은 미변경).

---

## 2026-07-29 — Scoring Gravity(옵션 순위) 엔진 전면 교체: peak/secondary 가중 + OVR 게이팅 + 대칭형 systemBonus + 99 캡 제거

**배경**: "왜 카림 압둘자바가 4옵션으로 선정되는지" 질문에서 시작된 옵션 시스템(그라비티) 조사가 여러
단계를 거쳐 4가지 구조적 문제로 정리됨. 대화 중 별도 아티팩트(BIG LEAGUE TEST 6 320명 전체 실측
데이터 기반 시뮬레이터)로 A~F안을 반복 검증한 뒤 최종안을 확정, 이번에 실제 엔진에 포팅함.
1. 기존 `zoneAvg(ins*0.4+out*0.3+mid*0.2+ft*0.1)` 고정 평균은 한쪽 zone만 압도적인 선수를
   구조적으로 저평가함 (밀워키에서 out=52뿐인 하킴 올라주원이 밸런스형 빈스 카터보다 옵션 순위가
   낮게 나옴 — insZone/outZone을 peak 0.7/secondary 0.3 동적 가중으로 교체해 해결).
2. zone 스탯 하나만 튀어도 종합 기량과 무관하게 최상위권에 몰림 (320명 중 74명이 이론상 99 도달,
   마누 지노빌리·조 존슨 등 롤플레이어급 포함) — 종합 OVR로 최종값을 곱연산 억제하는 ovrGate 추가로
   28~30명 수준으로 억제(잔존자는 전부 OVR 87+).
3. 전술 슬라이더(`insideOut`) 보정항(`systemBonus`)이 비대칭 구조(기울어진 쪽 zone 70 초과 시
   보너스만, 반대쪽 페널티 없음)라, ins/out 둘 다 70+인 투웨이 스코어러(앤서니 데이비스 등)가
   슬라이더=5(밸런스)에서 오히려 최저점을 찍는 골짜기가 생김 — `tilt*(insZone-outZone)*0.15`
   대칭형(강점 방향과 전술이 맞으면 보너스, 어긋나면 페널티)으로 교체해 slider=5에서 항상 정확히 0.
4. `Math.min(99, ...)` 하드캡이 실질적 역할이 없으면서(아래 검증 참고) 두 선수가 동시에 99에 닿으면
   동점이 되어 정렬이 뭉개지는 부작용만 있었음(밀워키 하킴/카터가 캡 때문에 배열 순서로 우연히
   항상 카터가 위로 감) — 캡 제거.

**주의(향후 수정 시 필독)**: 그라비티 전용 `insZone`/`outZone`은 `p.attr.ins`/`p.attr.out`
(`dataMapper.ts` 계산값 — hands 포함, shotIq/offConsist 등 mentality 스탯 혼합, OVR 계산 등 다른
용도로 계속 쓰임)과 **이름만 비슷할 뿐 전혀 다른 값**이다. `closeShot/layup/dunk/postPlay`(순수
인사이드)와 `midRange`+3점 서브존 평균(순수 아웃사이드)만으로 그라비티 함수 내부에서 로컬로 재조합했다.
`p.attr.ins`/`p.attr.out` 필드 자체는 건드리지 않았음.

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client)
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러)

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const zoneAvg = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const peak = Math.max(p.attr.ins, p.attr.out, p.attr.mid);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;
    return Math.min(99, zoneAvg + dominanceBonus);
}

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b) - calculateScoringGravity(a);
    });
    sortedPlayers.forEach((p, index) => { rankMap.set(p.playerId, index + 1); });
    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p)));
}
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer, insideOut: number): number {
    const a = p.attr;
    const insZone = (a.closeShot + a.layup + a.dunk + a.postPlay) / 4;
    const threeAvg = (a.threeCorner + a.three45 + a.threeTop) / 3;
    const outZone = (a.mid + threeAvg) / 2;

    const peak = Math.max(insZone, outZone);
    const secondary = Math.min(insZone, outZone);
    const peakBase = (peak * 0.7) + (secondary * 0.3) + (a.ft * 0.1);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;

    const tilt = (5 - insideOut) / 5;
    const systemBonus = tilt * (insZone - outZone) * 0.15;

    const ovrGate = Math.max(0.5, Math.min(1.15, (p.ovr - 65) / 30));
    return (peakBase + dominanceBonus + systemBonus) * ovrGate; // 99 캡 없음
}

export function getTeamOptionRanks(team: TeamState): Map<string, number> {
    const rankMap = new Map<string, number>();
    const insideOut = team.tactics.sliders.insideOut;
    const sortedPlayers = [...team.onCourt].sort((a, b) => {
        return calculateScoringGravity(b, insideOut) - calculateScoringGravity(a, insideOut);
    });
    sortedPlayers.forEach((p, index) => { rankMap.set(p.playerId, index + 1); });
    return rankMap;
}

export function getTopPlayerGravity(team: TeamState): number {
    if (team.onCourt.length === 0) return 0;
    const insideOut = team.tactics.sliders.insideOut;
    return Math.max(...team.onCourt.map(p => calculateScoringGravity(p, insideOut)));
}
```

**99 캡 제거가 안전한 이유(포팅 전 확인 완료)**: `getTeamOptionRanks`는 정렬 순서만 쓰므로 캡 유무와
무관. `getTopPlayerGravity`가 먹이는 `possessionHandler.ts:366`의 Star Gravity 부스트
(`Math.min(0.30, Math.max(0, (topGravity-63)*0.015))`)는 자체적으로 topGravity=83부터 이미
saturate되어 99 캡이 실질적으로 아무 역할을 하지 않았음. `components/dashboard/tactics/charts/
UsagePrediction.tsx`의 `calcGravity()`는 완전히 별도의(이미 캡 없는) 자체 공식이라 이번 변경과 무관.
Star Gravity 부스트 임계값(63/83)은 신규 공식 기준 BIG LEAGUE TEST 6 320명 실측 분포(중앙값 60.1,
63 미만 57%, 83 이상 19%, raw≥99 29명 — 전부 OVR 87+)와 여전히 합리적으로 맞아떨어져 재조정하지
않고 유지.

**검증**:
- 서버: `npx tsc -p server/tsconfig.json` — `usageSystem.ts`/`pbpTypes.ts`/`possessionHandler.ts`
  관련 신규 오류 0건(기존에도 있던 무관한 30건은 그대로, 파일 목록 확인해 겹치지 않음을 확인).
  이 과정에서 `attr.midRange`라는 존재하지 않는 필드를 잘못 참조한 오타를 발견해 `attr.mid`로 수정함
  (client는 vite/esbuild가 타입체크를 안 해서 빌드는 통과했지만 동일 오타가 있었음 — server tsc가
  아니었으면 놓칠 뻔함).
- 클라이언트: `npx vite build` 정상 완료(사전 존재하던 청크 크기/순환 경고만 있음, 신규 에러 없음).
- 실제 함수 실행 검증: `npx tsx`로 수정된 `services/game/engine/pbp/usageSystem.ts`를 실제 import해서
  밀워키 로스터(하킴 올라주원 vs 빈스 카터, DB 실측 스탯 + 엔진으로 계산한 실제 OVR 96/92)를 넣고
  `getTeamOptionRanks`/`getTopPlayerGravity`를 직접 호출: `insideOut=1~3`(인사이드 전술)에서 하킴이
  1옵션, `insideOut=6~10`(아웃사이드 전술)에서 카터가 1옵션으로 전환 — 설계 의도(전술 방향과 선수의
  실제 강점이 맞아야 우대)대로 동작 확인. `insideOut=5`(밸런스)는 98.15 vs 98.36으로 반올림 오차
  수준의 초박빙(설계상 자연스러움 — 아티팩트의 정수 반올림 데이터에서는 하킴이 근소 우위였으나 실제
  소수점 값으로는 카터가 근소 우위, 어느 쪽이든 큰 의미 없는 차이).

**롤백 방법**: 위 Before 블록 내용으로 두 파일(`services/game/engine/pbp/usageSystem.ts`,
`server/src/shared/engine/pbp/usageSystem.ts`)의 `calculateScoringGravity`/`getTeamOptionRanks`/
`getTopPlayerGravity` 세 함수를 그대로 되돌리면 됨(다른 함수는 미변경).

---

## 2026-07-28 — 멀티 라이브게임뷰 실시간 FT(자유투) 미반영 버그 수정

**배경**: "멀티플레이어 라이브게임뷰의 FT가 데이터 반영이 안 되는 것 같다"는 제보. 조사 결과,
경기가 `final`로 완료된 뒤에는 사전계산된 완전한 박스(`home_box`/`away_box`)를 그대로 써서 FT가
정상 표시되지만, **경기가 진행 중(live)일 때만** 스포일러 방지를 위해 별도로 만드는 델타
타임라인(`box_timeline`, 포세션마다 스탯 변화분만 기록해 elapsed 시점까지 클라이언트가 점진적으로
재구성)에서 `ftm`/`fta`가 애초에 추적 대상 필드 목록 자체에 빠져 있었던 게 원인. 즉 자유투 성공/시도
자체는 `LivePlayer` 객체에 정확히 누적되고 있었지만(`statsMappers.ts`), 그걸 매 포세션 diff로 떠서
`box_timeline`에 기록하는 `BOX_DELTA_KEYS`/`snapshotBoxStats()`가 `ftm`/`fta`를 아예 몰랐음 —
"실시간에는 항상 0, 경기 끝나면 정상"이라는 사용자 체감과 정확히 일치. 클라이언트 렌더링
(`MultiGamePbpView.tsx`)은 이미 `p.ftm`/`p.fta`를 정상적으로 읽고 있어 수정 불필요, 원인은
엔진 단계(client/server 미러 각 2파일, 총 4파일)에 한정됨.

**변경 파일**:
- `types/engine.ts` (client) — `BoxDelta`에 `ftm?: number; fta?: number;` 추가
- `server/src/shared/types/engine.ts` (server 미러) — 동일
- `services/game/engine/pbp/liveEngine.ts` (client) — `BOX_DELTA_KEYS` 배열에 `'ftm', 'fta'` 추가,
  `snapshotBoxStats()`에 `ftm: p.ftm, fta: p.fta` 추가
- `server/src/shared/engine/pbp/liveEngine.ts` (server 미러) — 동일

**Before**:
```ts
const BOX_DELTA_KEYS: (keyof BoxDelta)[] = ['pts', 'reb', 'offReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a'];

function snapshotBoxStats(p: LivePlayer): BoxDelta {
    return {
        pts: p.pts, reb: p.reb, offReb: p.offReb, ast: p.ast, stl: p.stl,
        blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a,
    };
}
```

**After**:
```ts
const BOX_DELTA_KEYS: (keyof BoxDelta)[] = ['pts', 'reb', 'offReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'];

function snapshotBoxStats(p: LivePlayer): BoxDelta {
    return {
        pts: p.pts, reb: p.reb, offReb: p.offReb, ast: p.ast, stl: p.stl,
        blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a,
        ftm: p.ftm, fta: p.fta,
    };
}
```

**검증**: 클라이언트(`types/engine.ts`/`liveEngine.ts`/`MultiGamePbpView.tsx`)와 서버
(`cd server && tsc --noEmit -p .`) 양쪽 다 신규 타입 에러 없음 확인. `MultiGamePbpView.tsx`(및
레거시 파일)의 델타 소비 코드가 `Object.entries(delta)`로 키를 제너릭하게 순회하는 방식이라 별도
클라이언트 수정 없이 새 필드를 자동으로 반영함을 코드로 확인. 실제 진행 중인 멀티 경기로 라이브
FT 반영 여부를 직접 확인하는 스모크 테스트는 미실시(서버 재배포 필요 + 실시간 경기 진행 대기 필요).

**롤백 방법**: 위 4개 파일에서 `ftm`/`fta` 관련 추가분만 제거하면 됨. client/server 미러 쌍이므로
반드시 4개 파일 전부 함께 되돌릴 것 — 하나만 되돌리면 서버가 보내는 델타와 클라이언트 타입이
불일치하게 됨(런타임 에러는 안 나지만 그 쪽 필드만 다시 조용히 0으로 고정됨).

---

## 2026-07-28 — Scoring Gravity에 dominanceBonus 추가 (S급 빅맨 저득점 2단계 수정)

**배경**: [Scoring Gravity(옵션 순위) 산정에서 mentality/체력 페널티 제거](#2026-07-28--scoring-gravity옵션-순위-산정에서-mentality체력-페널티-제거)(1단계, 아래 항목)에서 예고한 2단계 —
`calculateScoringGravity()`의 `baseOffense = ins*0.4 + out*0.3 + mid*0.2 + ft*0.1`가 인사이드(0.4)
보다 아웃+미드 합(0.5)을 더 높게 쳐서, 3점을 못 던지는 고전 센터가 실제 득점력과 무관하게 옵션 순위
최하위로 밀리는 근본 원인을 수정. 처음엔 절대 임계값(63, Star Gravity 발동 기준)을 넘기는지로
검증했으나, 실제 문제의 핵심인 `getTeamOptionRanks()`는 절대값이 아니라 **코트 위 5명 간 상대 순위**로만
동작한다는 걸 사용자가 지적 — 5인 라인업 시뮬레이션으로 재검증함. 예) 스타로 가득한 라인업(듀란트/
코비/매직/말론/샤킬형)에서 임계값80·배율0.8로는 샤킬이 절대값 기준 63을 넘겨도 여전히 5옵션(꼴찌)
이었음 — 매직(67.5)·말론(64.9)에도 못 미쳤기 때문. 배율을 1.0으로 올려야 실제로 순위가 3옵션까지
올라옴을 확인. 동시에 3레벨 스코어러(듀란트)와 순수 슈터(클레이) 비교에서, 배율을 너무 올리면
"정점 능력치만 높은 스페셜리스트가 세 구역 다 뛰어난 만능 스코어러를 역전"하는 부작용도 발견해
배율 상한(1.0, 1.2부터 역전 발생)까지 함께 확인.

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client) — `calculateScoringGravity()`에 `peak`
  (ins/out/mid 중 최댓값)이 80 초과 시 초과분×1.0을 가산하는 `dominanceBonus` 추가, 결과 99 상한
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러) — 동일 변경

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    return (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
}
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const zoneAvg = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const peak = Math.max(p.attr.ins, p.attr.out, p.attr.mid);
    const dominanceBonus = Math.max(0, peak - 80) * 1.0;
    return Math.min(99, zoneAvg + dominanceBonus);
}
```

**검증**:
- Node 스크립트로 두 가지 5인 라인업 시나리오 실측:
  - 스타 가득 라인업(듀란트/코비/매직/말론/샤킬형): 샤킬 5옵션(50.8)→3옵션(67.8), 듀란트(98.2)>클레이(97.5)
    순서 유지 확인
  - 샤킬+평범한 롤플레이어 4명: 샤킬 5옵션(50.8, 평범한 선수들보다도 밀림)→1옵션(67.8)으로 정상화
  - 배율 0.8~2.0 / 임계값 75~85 조합 스윕 — 배율 1.0·임계값 80이 "듀란트>클레이 순서 보존"과
    "스타 라인업 내 샤킬 순위 개선"을 동시에 만족하는 조합임을 확인(배율 1.2부터 순서 역전 시작)
  - 평범/벤치/수비형 등 peak 80 미만 프로필은 보너스 0으로 기존과 동일함을 확인(회귀 없음)
- client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인
- `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인 (배포 중 "not listening on 0.0.0.0:3001" 경고는 기존에 확인된 일시적 부팅 노이즈)

**주의사항 / 한계**:
- 이번 수정으로 실제 멀티플레이어 시뮬레이션에서 S급 빅맨의 옵션 순위/사용량이 개선될 것으로
  예상되나, `BIG LEAGUE TEST 5`(또는 신규 테스트 세션)에서 배포 후 실제 경기를 몇 게임 시뮬레이션해
  포지션별 득점 분포가 실제로 개선됐는지 재확인이 필요함(아직 미실시)
- Star Gravity 발동 임계값(63, 1단계에서 조정)은 이번 변경으로 재조정하지 않음 — dominanceBonus로
  값이 올라간 선수는 자연스럽게 63을 더 쉽게 넘기게 되므로 문제 없음

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — Scoring Gravity(옵션 순위) 산정에서 mentality/체력 페널티 제거

**배경**: `BIG LEAGUE TEST 5`(멀티 토너먼트, room `b3ad7461-4ce1-4293-b49a-c75641d5a0cd`) 박스스코어를
DB에서 직접 집계한 결과, 출전시간이 거의 동일(포지션별 평균 24분 안팎)한데도 포지션별 평균 득점이
PG 12.51 → SG 11.36 → SF 9.74 → PF 8.26 → C 5.92로 단조 감소, FGA도 PG 9.96 vs C 4.44로 절반 이하.
S급 센터(샤킬 오닐)조차 35.3분 선발 출전하면서 FGA 5.77개에 그침 — 포지션 자체가 구조적으로 배제되는
현상 확인. 원인 추적 결과 `usageSystem.ts:calculateScoringGravity()`(코트 위 5명의 "1~5옵션" 순위를
매기는 함수, `playTypes.ts:pickWeightedActor()`에서 옵션 순위별 최대 7.3배 사용량 배율로 이어짐)의
`baseOffense = ins*0.4 + out*0.3 + mid*0.2 + ft*0.1` 가중치가 인사이드(0.4)보다 아웃+미드 합(0.5)을
더 높게 쳐서, 3점을 못 던지는 고전 센터가 실제 득점력과 무관하게 낮은 옵션으로 밀려나는 게 근본 원인으로
드러남(이 부분은 별도로 2단계 수정 예정, 아직 미착수).

이번 커밋은 그 2단계 수정에 앞선 1단계 — `calculateScoringGravity()`가 `baseOffense`(40%) 외에
`mentality`(offConsist/shotIq/pas, 40%)와 `fatigueFactor`(체력, 최저 0.5배)까지 섞고 있었는데, 이
둘은 `flowEngine.ts`의 히트레이트 계산(shotIqNoise/consistNoise/fatigueOff 등)에 이미 독립적으로
반영되고 있어 gravity에도 넣으면 "볼을 못 받는 것"(옵션 순위 하락)과 "넣지를 못하는 것"(히트레이트
하락)이 이중으로 겹쳐 짓눌리는 문제가 있었음. gravity를 순수 raw 능력치로만 산정하도록 정리해 고볼륨
저효율/저볼륨 고효율/체력 저하 시 효율만 하락하는 선수 유형을 자연스럽게 구현할 수 있게 됨(사용자 제안).

**변경 파일**:
- `services/game/engine/pbp/usageSystem.ts` (client) — `calculateScoringGravity()`에서 mentality/
  fatigueFactor 제거
- `server/src/shared/engine/pbp/usageSystem.ts` (server 미러) — 동일 변경
- `services/game/engine/pbp/possessionHandler.ts` (client) — Star Gravity 발동 임계값 `65` → `63`
  재조정 (gravity 스케일 변경 반영)
- `server/src/shared/engine/pbp/possessionHandler.ts` (server 미러) — 동일 변경

**Before**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    const baseOffense = (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
    const consistMod = 1.0 + ((p.tendencies?.consistency ?? 0.6) - 0.5) * 0.2;
    const mentality = (p.attr.offConsist * 0.4 * consistMod) + (p.attr.shotIq * 0.4) + (p.attr.pas * 0.2);
    const fatigueFactor = Math.max(0.5, p.currentCondition / 100);
    return (baseOffense * 0.6 + mentality * 0.4) * fatigueFactor;
}

// possessionHandler.ts
const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 65) * 0.015));
```

**After**:
```ts
function calculateScoringGravity(p: LivePlayer): number {
    return (p.attr.ins * 0.4) + (p.attr.out * 0.3) + (p.attr.mid * 0.2) + (p.attr.ft * 0.1);
}

// possessionHandler.ts
const gravityBoost = Math.min(0.30, Math.max(0, (topGravity - 63) * 0.015));
```

**검증**:
- Node 스크립트로 3레벨 스코어러/순수 슈터/비슈팅 빅맨/만능 빅맨/평균 주전/벤치/수비 스페셜리스트
  7개 아키타입 프로필에 대해 condition=100 기준 old/new 공식 출력 비교 — ratio 평균 0.965(0.876~1.023
  분포), 이를 근거로 Star Gravity 임계값 65×0.965≈62.7 → 63으로 재조정
  (임계값을 새 스케일에 맞게 고칠지, gravity 공식에 보정상수를 곱해 기존 스케일에 맞출지 사용자와
  논의 후 — 소비처가 `getTopPlayerGravity()`의 절대 임계값 비교 한 곳뿐이라 공식 자체는 순수하게 두고
  임계값만 재조정하는 쪽으로 결정)
- client/server diff 확인(주석 차이만 존재, 로직 완전 동일)
- 양 파일 중괄호 균형 확인, `tsc --noEmit` 신규 에러 없음, `npm run build` 성공
- `fly deploy -a basketballgm-app-server` 배포 후 헬스체크 200, `worker#0 ready`/`scheduler started`
  정상 재기동 확인

**주의사항 / 한계**:
- `tendencies.consistency`(SaveTendency)가 이 함수에서만 소비되고 있었는데, mentality 제거로 이제
  아무 데서도 안 쓰이는 dead code가 됨 — 이번 범위에서는 삭제하지 않고 남겨둠(별도 처리 필요 시 논의)
- 지친 에이스도 이제 경기 후반까지 옵션 순위/Star Gravity 보정이 유지됨(볼 소유는 그대로, 적중률만
  `flowEngine.ts`의 fatigueOff로 하락) — 의도된 동작 변경
- **이번 변경만으로는 "S급 빅맨 저득점" 문제가 해결되지 않음.** `baseOffense`의 `ins/out/mid` 가중치
  편향(2단계 수정 대상)은 그대로 남아있어, 실제 체감 개선은 2단계 완료 후 확인 필요

**롤백 방법**: 위 Before 블록으로 4개 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 드래프트 보드 팀 헤더 AUTO 배지 레이아웃 시프트 수정

**배경**: `DraftBoard.tsx`의 팀 헤더에 온라인 점/AUTO 배지를 넣는 `<div className="flex items-center
gap-1">`가 고정 높이 없이 내용물 크기에 맞춰졌음 — 온라인 점(6px 원)만 있을 때보다 AUTO 배지
(`text-[7px]` + `py-[1px]`, 실제 렌더 높이 ~9~10px)가 더 커서, 오토픽 전환으로 배지가 나타나는
순간 그 행의 높이가 늘어나고 `<thead>`가 `sticky top-0`라 테이블 헤더 전체 높이가 갑자기 커지는
레이아웃 시프트가 발생했음. 사용자가 실제로 목격하고 수정 요청.

**변경 파일**:
- `components/draft/DraftBoard.tsx` (client) — 온라인 점/AUTO 배지를 감싸는 행에 `h-[10px]` 고정
  높이 부여(배지 유무와 무관하게 항상 같은 공간 차지). 단, 이 행 자체를 `onlineTeamIds ||
  autoPickTeamIds`가 하나라도 전달된 경우에만 렌더링해 — 이 prop들을 안 쓰는 싱글/루키 드래프트
  보드(`FantasyDraftView.tsx`, `DraftHistoryView.tsx`가 같은 `DraftBoard` 컴포넌트를 공유)에는
  영향이 전혀 없도록 함(그쪽은 기존처럼 이 행 자체가 아예 렌더링 안 됨)

**Before**:
```tsx
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    <div className="flex items-center gap-1">
        {isOnline !== undefined && <span style={{ width:6, height:6, ... }} />}
        {isAutoPick && <span className="text-[7px] ... py-[1px] ...">AUTO</span>}
    </div>
</div>
```

**After**:
```tsx
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    {(onlineTeamIds || autoPickTeamIds) && (
        <div className="flex items-center justify-center gap-1 h-[10px]">
            {isOnline !== undefined && <span style={{ width:6, height:6, ... }} />}
            {isAutoPick && <span className="text-[7px] ... py-[1px] ...">AUTO</span>}
        </div>
    )}
</div>
```

**검증**: `DraftBoard.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제 브라우저
렌더링(온라인 점만 있을 때/AUTO 배지 추가될 때 높이가 실제로 고정되는지)은 미실시.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨.

---

## 2026-07-28 — `archetypes.rebounder` dead code 삭제

**배경**: 리바운드 판정에 hustle 능력치를 추가하는 작업([리바운드 판정에 허슬(hustle) 능력치
반영](#2026-07-28--리바운드-판정에-허슬hustle-능력치-반영), 아래 항목) 도중, 역할 적합도 점수
(`archetypeSystem.ts`)의 `rebounder` 필드가 엔진 어디에서도 소비되지 않는 dead code임을 재확인함
(이전 세션에서 이미 확인해 삭제를 제안했었고, 사용자가 이번에 "archetypes.rebounder는 삭제하자"로
확정). 실제 리바운더 선정은 `reboundLogic.ts`가 `offReb`/`defReb`/`vertical`/`strength`/`boxOut`/
`hustle` raw 능력치를 직접 사용하는 훨씬 정교한 자체 공식(Harvester/Raider 보너스, motorIntensity
랜덤화 포함)을 쓰고 있어 `archetypes.rebounder`는 애초에 중복이었음.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `ArchetypeRatings` 인터페이스에서
  `rebounder: number;` 제거, `calculatePlayerArchetypes()` 내부 `rebounder` 계산 블록 및 반환
  객체에서 제거
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일 변경
- `docs/engine/player-usage.md`, `docs/engine/player-archetypes.md`, `docs/engine/pbp-engine.md`,
  `docs/domain/nba-strategy.md`, `docs/project-overview.md` — "역할 적합도 점수 12종" 표기를
  11종으로 전부 수정, rebounder 관련 서술 갱신

**Before**:
```ts
export interface ArchetypeRatings {
    handler: number; spacer: number; driver: number; screener: number;
    roller: number; popper: number; rebounder: number;
    postScorer: number; isoScorer: number; connector: number;
    perimLock: number; rimProtector: number;
}
// ...
const rebounder = disabled ? 50 : getVal(
    (attr.reb * 0.70) + (attr.hustle * 0.15) + (attr.vertical * 0.15)
);
// ...
return {
    handler, spacer, driver, screener, roller, popper, rebounder,
    postScorer, isoScorer, connector, perimLock, rimProtector,
};
```

**After**:
```ts
export interface ArchetypeRatings {
    handler: number; spacer: number; driver: number; screener: number;
    roller: number; popper: number;
    postScorer: number; isoScorer: number; connector: number;
    perimLock: number; rimProtector: number;
}
// ...
return {
    handler, spacer, driver, screener, roller, popper,
    postScorer, isoScorer, connector, perimLock, rimProtector,
};
```

**검증**: client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인,
`ArchetypeRatings`를 참조하는 다른 소비처(`shotDistribution.ts`, `pbpTypes.ts`) grep 결과 `.rebounder`
프로퍼티 직접 참조 없음 확인, `tsc --noEmit`에서 신규 에러 없음, `npm run build` 성공, `fly deploy`
후 헬스체크 200·정상 재기동 확인.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 리바운드 판정에 허슬(hustle) 능력치 반영

**배경**: 역할 적합도 점수(`archetypeSystem.ts`) 정리 작업 도중, 실제 리바운드 판정 로직
(`reboundLogic.ts`)을 다시 살펴보다가 사용자가 "리바운드에서 허슬 능력치를 사용했으면 좋겠는데
그 부분은 빠져있구나"를 지적. 팀 단위 ORB% 계산(`calculateOrbChance`의 `calcPower`)과 개인
리바운더 선택(`selectRebounder`의 `score`) 둘 다 `rebAttr(offReb/defReb) + vertical + strength +
boxOut` 4개 능력치만 사용하고 `hustle`이 빠져 있었음. 가중치 `rebAttr×0.45 + vertical×0.20 +
strength×0.10 + boxOut×0.15 + hustle×0.10`(합 1.00, rebAttr -0.05·strength -0.05로 hustle×0.10
자리 마련)을 제안해 승인받음. 사용자가 "팀 파워 공식에도 추가해줘"라고 명시적으로 요청해
두 공식(팀 레벨 + 개인 레벨) 모두에 동일하게 적용.

**변경 파일**:
- `services/game/engine/pbp/reboundLogic.ts` (client)
- `server/src/shared/engine/pbp/reboundLogic.ts` (server 미러)

**Before**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.5 + p.attr.vertical * 0.2 + p.attr.strength * 0.15 + p.attr.boxOut * 0.15);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.5 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.15 +
    p.attr.boxOut * 0.15
) * shooterPenalty;
```

**After**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 + p.attr.boxOut * 0.15 + p.attr.hustle * 0.10);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.45 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.10 +
    p.attr.boxOut * 0.15 +
    p.attr.hustle * 0.10
) * shooterPenalty;
```

**검증**: client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인,
`server/tsconfig.json` 기준 `tsc --noEmit` 결과 `reboundLogic.ts`발 신규 에러 없음(기존
`tournamentArchiver.ts`/`scheduler.ts`/`startDraft.ts`/Bun 타입 관련 에러는 이번 변경과 무관한
기존 이슈), `npm run build` 성공, `fly deploy -a basketballgm-app-server` 배포 후 헬스체크
200·`fly logs`에서 `worker#0 ready`/`scheduler started`/에러 없이 정상 재기동 확인.

**롤백 방법**: 위 Before 블록 가중치로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 멀티플레이어 어드민 트레이드(팀↔팀 선수 스왑) 신규 구현

**배경**: `docs/plan/multi-admin-trade-plan.md` 참조. 멀티플레이어에는 유저 간 협상형 트레이드도,
어드민용 로스터 교정 도구도 전혀 없었음(계약/샐러리 데이터 자체가 멀티에 없어 싱글의
`tradeExecutor.ts`는 재사용 불가 확인됨). 어드민이 `AdminTeamEditorView.tsx`(팀별 뎁스차트/로테이션/
전술을 보는 화면)에서 두 팀 사이 선수를 직접 맞교환하는 기능을 요청받아 완전 신규 구축. 추가로
"로스터 변경은 트레이드 실행 버튼을 눌러야만 반영"(카트 방식, 실시간 적용 아님)과 "트레이드 후
뎁스차트·로테이션을 1회 자동 설정"을 명시적으로 요구받음 — 후자는 기존 `generateAutoTactics()`
(뎁스차트+48칸 로테이션맵+슬라이더를 한 번에 생성하는 기존 함수, `AdminTeamEditorView.tsx`가
이미 신규 팀 초기화에 쓰고 있던 것)를 트레이드 후 양팀 모두에 재사용하는 것으로 간단히 해결 —
애초 계획서의 "stale 참조 부분 정리" 방식보다 더 간단하고 견고함(옛 참조가 남을 수 없음).

**변경 파일**:
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_execute_admin_trade_rpc`) —
  `execute_admin_trade(p_room_id, p_admin_user_id, p_team_a_id, p_team_b_id, p_players_a_to_b, p_players_b_to_a)`
  RPC 신설(`SECURITY DEFINER`). 어드민 검증(`leagues.admin_user_id`) → 각 선수가 실제로 해당 팀
  로스터에 있는지 검증 → `league_teams.roster`(jsonb 배열) 원자적 스왑(제거 후 병합). `claim_team`
  RPC와 동일 패턴 재사용
- `services/multi/leagueService.ts` (client) — `executeAdminTrade(params)` 신규, RPC 래핑 +
  에러코드별(`not_admin`/`player_not_on_team_a`/`player_not_on_team_b`/`same_team`) 한국어 메시지 매핑
- `components/dashboard/AdminTradePanel.tsx` (신규, client) — 상대 팀 선택 → 팀 A(부모가 이미
  하이드레이션한 로스터 prop 재사용)/팀 B(자체 `meta_players` 하이드레이션) 로스터를 좌우로 나열,
  `OvrBadge`로 선수 행 표시, 클릭으로 트레이드 카트에 토글, "트레이드 실행" 버튼(확인 단계 포함)을
  눌러야만 `executeAdminTrade()` 호출. 성공 시 이미 메모리에 있는 양측 `Player[]`로 트레이드 후
  로스터를 로컬 계산 → `generateAutoTactics()`로 양팀 전술 재생성 → `saveMemberTactics()`로 저장 →
  부모에 `onTradeComplete(teamA 새 전술)` 콜백
- `views/multi/league/AdminTeamEditorView.tsx` (client) — `AdminTab`에 `'trade'` 추가, "트레이드"
  탭 렌더, `handleTradeComplete()` — 트레이드 성공 시 팀A의 `draftTactics`/`draftDepthChart` 로컬
  상태를 새로 생성된 전술로 즉시 교체(`reload()`만 의존하면 로스터 인원수가 안 바뀌는 1:1 트레이드
  등에서 리셋 useEffect가 재실행되지 않아 화면이 트레이드 이전 상태를 계속 보여주는 문제를 방지)

**Before**: 멀티플레이어에 팀 간 선수 이동 수단이 전혀 없었음(트레이드 UI/RPC/엔진 모두 부재).

**After**: 어드민이 "트레이드" 탭에서 두 팀 로스터를 보고 각 팀에서 나갈 선수를 카트에 담은 뒤
"트레이드 실행" → 확인 → RPC로 `league_teams.roster` 원자적 스왑 → 양 팀 뎁스차트/로테이션
자동 재설정까지 한 번에 처리.

**검증**:
- RPC 자체: `apply_migration` 성공(문법 유효), 더미 UUID로 직접 호출해 `not_admin` 가드가 정확히
  발동함을 확인, jsonb 배열 제거+병합 로직(`["p1","p2","p3"]` - `["p2"]` + `["p9"]` →
  `["p1","p3","p9"]`)을 실제 테이블과 무관하게 격리 테스트해 정확성 확인
- 클라이언트: `AdminTradePanel.tsx`/`leagueService.ts`에 대해 synthesize한 tsc 옵션으로 신규 타입
  에러 없음. `AdminTeamEditorView.tsx`에서 발견된 에러 1건(`TabBar`의 `onTabChange` 제네릭 추론
  이슈)은 `git stash`로 대조해 **이번 변경 이전부터 있던 기존 이슈**임을 확인(줄 번호만 203→215로
  밀림)
- **실제 방에서 실사용 트레이드 스모크 테스트는 미실시** — 실제 유저 로스터 데이터를 건드리는
  작업이라 사용자 승인 없이 임의 실행하지 않음. 다음 사용 시 테스트 리그에서 먼저 확인 권장

**롤백 방법**: 코드는 위 3개 client 파일(`leagueService.ts`/`AdminTeamEditorView.tsx`)의 diff를
되돌리고 `components/dashboard/AdminTradePanel.tsx` 파일을 삭제. DB는
`DROP FUNCTION public.execute_admin_trade(uuid,uuid,uuid,uuid,jsonb,jsonb);`로 RPC 제거(코드에서
호출 안 하면 남아있어도 무해함).

---

## 2026-07-28 — 뎁스차트 OVR 배지 텍스트 크기를 로테이션 차트와 통일

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 `OvrBadge`는 `size="sm"` 기본값(`text-[10px]`)을
그대로 썼는데, 같은 프로젝트의 로테이션 차트(`RotationMatrix.tsx`, `RotationGanttChart.tsx`)는
동일한 `size="sm"`에 `className="!text-xs ..."`로 텍스트만 12px로 키워서 쓰고 있어 두 화면의
배지 글자 크기가 달랐다. 통일해달라는 요청.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용) —
  `<OvrBadge value={...} size="sm" />` → `<OvrBadge value={...} size="sm" className="!text-xs" />`
  (크기(`w-6 h-6`)·그림자 등 나머지 스타일은 요청 범위 밖이라 그대로 유지)

**Before**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />` (텍스트 10px, `OvrBadge.tsx`의 `sm` 프리셋 기본값)

**After**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" className="!text-xs" />` (텍스트 12px, 로테이션 차트와 동일)

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제 브라우저 렌더링 비교는 미실시.

**롤백 방법**: `className="!text-xs"`를 제거하면 됨.

---

## 2026-07-28 — 뎁스차트 OVR 배지 위치/표기 수정 (좌측 배지 + 닫힌상태 텍스트 정리)

**배경**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")에서 배지를 select 우측에 오버레이하고 옵션
텍스트에 `- OVR {값}`을 붙였는데, 사용자가 3가지로 정정 요청: (1) 배지를 이름 **좌측**으로 이동
(2) 선택된(닫힌 상태) 슬롯에서는 "포지션 우측 OVR 텍스트" 표기 제거 — 배지만으로 OVR을 전달
(3) 드롭다운을 펼쳤을 때는 `(OVR) 이름 - 포지션` 형식으로 표시.

문제는 네이티브 `<select>`는 "닫힌 상태에 보이는 텍스트"와 "드롭다운 옵션 텍스트"가 항상 같은
소스(선택된 `<option>`의 textContent)라서, 둘의 표기를 다르게 만들 수 없다는 점이었다 — 그래서
select 자체의 텍스트를 `text-transparent`로 완전히 숨기고, 그 위에 "이름 - 포지션"만 보여주는
별도의 커스텀 라벨 `<div>`를 오버레이하는 방식으로 전환했다. 실제 `<option>` 텍스트(드롭다운
목록에서 보이는 것)는 `(OVR) 이름 - 포지션` 그대로 유지 — 각 `<option>`에 이미 걸려있는
`text-white`/`text-slate-500` 클래스가 부모 select의 `text-transparent`보다 우선 적용되어
드롭다운 목록 자체는 계속 정상적으로 보인다(이 프로젝트가 이미 option별 색상 클래스를 쓰고
있었으므로 같은 메커니즘 재사용).

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용, 직전 항목과 동일 파일)
  - `<select>` className: `text-white`(선택시)/`text-slate-500`(빈값) 동적 처리를 제거하고
    `text-transparent` 고정 + `pl-9`(배지 자리)로 변경, `pr-16`→`pr-10`으로 원복(우측엔 체브론만 남음)
  - `<option>` 텍스트: `{name} - {position} - OVR {ovr}` → `({ovr}) {name} - {position}`
  - `OvrBadge` 오버레이 위치: `right-9` → `left-2`
  - 신규: `<div className="absolute inset-0 ... pl-9 pr-10">{selectedPlayer ? `${name} - ${position}` : '선수 선택'}</div>` — 닫힌 상태 전용 커스텀 라벨(OVR 텍스트 없음)

**Before**:
```tsx
<select className="... pl-4 pr-16 ... text-white ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ..."><OvrBadge value={...} size="sm" /></div>
)}
```

**After**:
```tsx
<select className="... pl-9 pr-10 ... text-transparent ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>({calculatePlayerOvr(p)}) {p.name} - {p.position}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute left-2 ..."><OvrBadge value={...} size="sm" /></div>
)}
<div className="absolute inset-0 flex items-center pl-9 pr-10 pointer-events-none text-xs font-semibold truncate ...">
    {selectedPlayer ? `${selectedPlayer.name} - ${selectedPlayer.position}` : '선수 선택'}
</div>
```

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제
브라우저에서 `text-transparent` select + option 색상 오버라이드 조합이 의도대로 렌더링되는지
(특히 Safari/Firefox 크로스브라우저 차이)는 미실시 — Chromium 계열에서 흔히 쓰이는 패턴이라
프로젝트 브라우저 타깃(Chrome 위주 개발) 기준으로는 위험 낮다고 판단.

**롤백 방법**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")의 After 블록으로 되돌리면 됨(두 항목을
합쳐서 원래 형태로 되돌리려면 최초 커밋, 즉 배지 자체가 없던 상태까지 더 거슬러 올라가야 함).

---

## 2026-07-28 — 뎁스차트 슬롯에 OVR 배지 표시

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 각 슬롯이 네이티브 `<select>`라 선택된 선수 이름 외에
능력치를 한눈에 볼 방법이 없었음. 선수 이름 우측에 OVR 배지를 띄워달라는 요청. 이 컴포넌트는
싱글플레이 대시보드(`DashboardView.tsx`)와 멀티플레이 전술 화면(`MultiTacticsView.tsx`,
`AdminTeamEditorView.tsx`) 3곳이 전부 공유하므로 한 번 고치면 세 화면 모두 반영됨.

네이티브 `<select>`의 `<option>`은 브라우저가 플레인 텍스트로만 렌더링해 그 안에 색상 배지를
넣을 수 없다 — 대신 select 위에 절대 위치로 `OvrBadge`(기존 재사용 컴포넌트, OVR 구간별 색상
그라데이션 자동 적용)를 오버레이해서 "닫힌 상태"에서 배지가 보이도록 했다. 드롭다운을 펼쳤을 때의
옵션 목록 자체는 배지를 못 넣으므로, 대신 옵션 텍스트에 `- OVR {값}`을 추가해 최소한의 정보는
드롭다운 안에서도 보이게 보완했다.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용)
  - `OvrBadge`(`components/common/OvrBadge.tsx`) import 추가
  - 슬롯별 선택된 선수를 `team.roster.find()`로 조회해 `calculatePlayerOvr()` 결과를
    `<OvrBadge size="sm">`로 select 우측(체브론 아이콘 왼쪽)에 절대위치 오버레이
  - `<option>` 텍스트에 `- OVR {calculatePlayerOvr(p)}` 추가
  - select의 `pr-10` → `pr-16`으로 늘려 배지+체브론 자리 확보(텍스트 겹침 방지)

**Before**:
```tsx
<select className="... pr-10 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position}</option>
    ))}
</select>
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**After**:
```tsx
<select className="... pr-16 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ...">
        <OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />
    </div>
)}
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**검증**: 수정 파일 1개(`DepthChartEditor.tsx`)에 대해 synthesize한 tsc 옵션으로 신규 타입 에러
없음 확인. JSX 중첩(`[0,1,2].map(depthIndex => { ...; return (<TableCell>...); })`) 괄호 균형 확인.
실제 브라우저 렌더링(배지 위치가 체브론과 안 겹치는지)은 미실시.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨. 서버/DB 변경 없음(클라이언트 전용, 3개 화면 공용
컴포넌트라 롤백 시 세 화면 모두 원상복구됨).

---

## 2026-07-28 — spacer 아키타입, archetypesEnabled 토글과 무관하게 항상 실계산

**배경**: 직전 항목(3점 코너 편향 버그) 조사 중, CatchShoot 액터 선택(`pickWeightedActor(p => p.archetypes.spacer)`)이
사실상 무의미하다는 걸 발견함 — `archetypeSystem.ts`의 `ARCHETYPES_DISABLED = true`(기본값, `SimSettings.archetypesEnabled`도
기본 false)일 때 12개 아키타입 전부 무조건 50으로 반환돼서, 르브론이든 주바치든 spacer 점수가 동일했음.

`git log`로 추적해보니 이 disabled 상태는 의도된 설계가 아니라 4개월 전(`98f84a3 disabled player archetypes`,
직전 커밋 `c1ea42c feat: Integrate dynamic archetype system` 직후) BLOCK/PLAYMAKING/CLUTCH_ARCHETYPE/ZONE_SHOOTING과
함께 `★ TEMPORARY`로 표시된 채 응급 롤백된 뒤 재검토 없이 방치된 것으로 확인됨(단, 이 4개는 `SIM_CONFIG`의 별도
하드코딩 상수라 `archetypesEnabled`와 런타임으로 연결되어 있지 않음 — 이번 변경과 무관).

12개 공식을 전부 확인해본 결과 전혀 "분류형 아키타입"이 아니라 기존 raw 능력치(threeVal/shotIq/handling 등,
전부 엔진 다른 곳에서 이미 검증되어 쓰이는 값)의 단순 가중평균이라, 계산 자체의 리스크는 낮다고 판단.
다만 12개 전부를 한꺼번에 켜는 것(BLOCK 등 4개 시스템도 얽힌 더 큰 결정)은 왜 원래 꺼졌는지 재확인이
필요한 별도 논의로 미루고, 이번엔 지금 당장 문제가 되는 **spacer 하나만** 토글과 무관하게 항상 실계산하도록
범위를 좁힘 — 나머지 11개(handler/driver/screener 등)는 여전히 토글에 따라 50으로 뭉개짐.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()`
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
if (disabled) {
    return {
        handler: 50, spacer: 50, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;
// ... (normHeight/normWeight, 그리고 return 블록에서 spacer: getVal(threeAvg*0.6 + shotIq*0.25 + offConsist*0.15) 계산)
```

**After**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;

// spacer는 나머지 11개와 달리 토글과 무관하게 항상 실계산
const spacer = getVal((threeAvg * 0.60) + (attr.shotIq * 0.25) + (attr.offConsist * 0.15));

if (disabled) {
    return {
        handler: 50, spacer, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
// ... (나머지 11개는 그대로, return 블록의 spacer는 위에서 계산한 변수 재사용)
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공. Node
재현: 주바치류 raw 능력치(threeVal 45, shotIq/offConsist 70 가정) → spacer 55.0, 커리급(threeVal 95,
shotIq 92, offConsist 88) → spacer 93.2 — 이전엔 disabled 상태에서 둘 다 50으로 동일했던 것이 이제
실제 능력치 차이만큼 갈라짐을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 기동 확인.

**주의사항 / 한계**: 이 수정만으로는 주바치 문제가 완전히 안 풀림 — 그의 raw 3점 능력치(45)가 낮지 않아
spacer가 50→55로 오히려 살짝 오름(텐던시가 아니라 능력치 기반이라 여전히 "3점을 실제로 쏘고 싶어하는가"는
안 봄). CatchShoot 액터 선택에 `zonePref.three`(텐던시) 배율을 곱하는 후속 작업("방법 2")이 별도로 필요함 —
다음 논의/작업 대상으로 남겨둠.

**롤백 방법**: 두 파일에서 `spacer` 계산을 `disabled` 체크 이전으로 끌어올린 부분과, `disabled` 분기의
`spacer: 50` → `spacer`(변수 참조) 변경을 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 3점 텐던시 전부 0인 선수가 항상 우측 코너로만 쏘던 버그 수정

**배경**: "FMK 빅 토너먼트" 선수 데이터를 분석하다가, 댈러스의 이비차 주바치(`tendencies.zones`가
`{ra:100, itp:36, mid:7, atb:0, cnr:0, p45:0}` — 3점 텐던시 완전히 0)가 실제 게임에서 5경기 연속
3점을 시도했고, 그 시도가 **매 경기 예외 없이 전부 `zone_c3_r`(우측 코너)**로 기록된 것을 발견해서
추적함.

원인은 두 단계: ① `CatchShoot` 플레이타입은 `preferredZone: '3PT'`가 하드코딩돼 있고, 액터 선택
(`pickWeightedActor`)이 `Math.max(1, rawScore)`로 최소 가중치를 항상 보장해서 3점 텐던시 0인 선수도
낮은 확률로 캐치앤슛 슈터로 뽑힐 수 있음(설계상 있을 수 있는 부분, 이번엔 안 건드림 — 사용자가
"방법 2"로 명명, 추후 별도 논의 예정). ② `resolveDynamicZone()`의 3점 서브존(코너/45도/탑) 분배
로직이 `threeSubPref` 3개 값이 전부 0일 때 `total = 0 || 1`(JS에서 `0`은 falsy)로 인해 확률이 전부
0이 되고, `rand`(항상 0 이상)가 모든 `if (rand < ...)`를 통과해 매번 마지막 `return 'zone_c3_r'`로
고정되는 **실제 코드 버그**. 이번엔 ②만 수정(사용자가 "방법 1"로 명명, 우선 적용 합의).

**변경 파일**:
- `services/game/engine/shotDistribution.ts` (client) — `resolveDynamicZone()`의 3PT 분기
- `server/src/shared/engine/shotDistribution.ts` (server 미러) — 동일 수정

**Before**:
```ts
const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```

**After**:
```ts
const spRaw = player.threeSubPref;
const spTotal = spRaw ? spRaw.cnr + spRaw.p45 + spRaw.atb : 0;
const sp = spTotal > 0 ? spRaw : { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```
(`threeSubPref`가 있지만 합이 0인 경우도 "없는 경우"와 동일하게 기본 30/40/30 분포로 폴백하도록
한 줄만 조건 확장 — 나머지 로직 동일)

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현 스크립트로 확인 — 수정 전엔 all-zero threeSubPref 입력 시 20000회 전부 `zone_c3_r`,
수정 후엔 `zone_atb3_c`(≈30%)/`zone_atb3_r`(≈24%)/`zone_atb3_l`(≈16%)/`zone_c3_r`(≈18%)/`zone_c3_l`
(≈12%)로 고르게 분산됨을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 재기동 확인.

**롤백 방법**: 두 파일에서 `spRaw`/`spTotal` 도입 부분을 제거하고 `const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };`로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

**관련 논의**: "방법 2"(CatchShoot 액터 선택 시 3점 텐던시가 낮은 선수의 가중치를 더 깎아서, 애초에
그런 선수가 캐치앤슛 슈터로 뽑히는 빈도 자체를 줄이는 것)는 사용자 합의로 이번 범위에서 제외,
추후 별도 논의 예정.

---

## 2026-07-28 — 역할 적합도 점수 11종(rebounder 제외) 토글과 무관하게 항상 실계산

**배경**: 직전 항목(spacer 예외 처리)에 이어서, 나머지 11개도 조사해본 결과 `archetypesEnabled`
disabled 상태에서 50으로 뭉개지는 게 `playTypes.ts`의 액터/패서 선택뿐 아니라 두 군데를 더
무력화시키고 있었음을 발견:
- **미스매치 판정** (`flowEngine.ts:296-320`) — `offSkill`(spacer/driver/postScorer) vs
  `defSkill`(perimLock/rimProtector) 비교인데, 수비 쪽이 항상 50 고정이라 `skillGap`이 포지션
  기반 케이스(가드-빅 매치업) 말고는 15 이상 나올 수 없어 `hitRate -= 0.03` 페널티만 거의 항상
  적용되고 있었음
- **헬프 디펜스 블락 보너스** (`possessionHandler.ts:977`) — `rimProtector > HELP_RIM_THRESHOLD(75)`
  체크인데 rimProtector가 항상 50이라 조건이 누구에게도 절대 참이 될 수 없어 완전히 죽어있었음
- `rebounder`는 조사 결과 `archetypes.rebounder`를 읽는 코드가 엔진 어디에도 없는 순수 dead code
  (`reboundLogic.ts`는 raw 능력치를 직접 씀) — 사용자 판단으로 이번 범위에서 제외, 리바운드 로직
  재검토 시 별도로 다루기로 함

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()` 구조 개편
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**: `disabled` 분기와 `!disabled` 분기 두 갈래로 나뉘어, disabled 시 11개(spacer 제외) 전부
`50` 하드코딩 반환, 아니면 전부 실계산 반환하는 구조(직전 항목의 spacer 예외만 반영된 상태).

**After**: 두 분기를 제거하고 handler/spacer/driver/screener/roller/popper/postScorer/isoScorer/
connector/perimLock/rimProtector 11개를 전부 함수 상단에서 무조건 실계산하는 `const`로 선언,
`rebounder`만 `disabled ? 50 : getVal(...)`로 예외 유지. 마지막에 12개를 한 번에 조립해서 반환하는
단일 return으로 단순화:
```ts
const handler = getVal(...);
const spacer = getVal(...);
// ... (9개 더, 전부 무조건 실계산) ...
const rebounder = disabled ? 50 : getVal(attr.reb*0.70 + attr.hustle*0.15 + attr.vertical*0.15);
const rimProtector = getVal(...);

return { handler, spacer, driver, screener, roller, popper, rebounder, postScorer, isoScorer, connector, perimLock, rimProtector };
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현: 엘리트 림프로텍터 능력치(blk=92, intDef=90, height=213) 입력 시 `disabled=true`여도
`rimProtector=88.3`으로 계산돼 `HELP_RIM_THRESHOLD(75)`를 정상적으로 넘음(수정 전엔 무조건 50이라
절대 못 넘었음), `rebounder`는 여전히 50 고정 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상
기동 확인.

**주의사항 / 한계**: 미스매치 판정 시스템은 이제 공격/수비 양쪽 다 실계산되므로 `skillGap`이 의미
있게 작동하지만, 실제로 밸런스가 어떻게 나오는지(미스매치 보너스 발동 빈도, 헬프 블락 발동 빈도 변화)
브라우저/실경기 테스트는 미실시 — 다음 실제 토너먼트 시뮬레이션에서 관찰 필요.

**롤백 방법**: 두 파일에서 함수 본문을 이전(11개 즉시 50 하드코딩 disabled 분기 + 전체 재계산
enabled 분기 이중 구조)으로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 라이브게임 박스스코어에 FT(자유투) 컬럼 추가

**배경**: 멀티플레이어 라이브 게임(PBP) 화면의 박스스코어 테이블에 FG/3P만 있고 FT(자유투 성공-시도)가 없어서 추가 요청.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `PlayerBoxPanel`의 `BOX_GRID`에 컬럼 폭(48px) 추가, 헤더에 `FT` 라벨 추가, 선수 행에 `{p.ftm}-{p.fta}` 추가, `total` useMemo에 `ftm`/`fta` 합계 추가, 팀 합계 행에 FT% 셀 추가(`total.ftm / total.fta * 100`, FG%/3P%와 동일한 표시 방식).

**Before**:
```ts
const BOX_GRID = 'minmax(0,1fr) 26px 28px 32px 28px 28px 28px 28px 28px 32px 56px 48px';
// total: pts/reb/ast/stl/blk/tov/pf/fgm/fga/p3m/p3a
// 헤더: ... FG, 3P
// 행:   ... {p.fgm}-{p.fga}, {p.p3m}-{p.p3a}
// 팀합계: ... FG%, 3P%
```

**After**:
```ts
const BOX_GRID = 'minmax(0,1fr) 26px 28px 32px 28px 28px 28px 28px 28px 32px 56px 48px 48px';
// total에 ftm/fta 추가
// 헤더: ... FG, 3P, FT
// 행:   ... {p.fgm}-{p.fga}, {p.p3m}-{p.p3a}, {p.ftm}-{p.fta}
// 팀합계: ... FG%, 3P%, FT%
```

**검증**: `esbuild` 구문 파싱만 확인, `PlayerBoxScore` 타입에 `ftm`/`fta` 필드 존재 확인. 브라우저 실행 검증은 하지 않음.

**롤백 방법**: `BOX_GRID`에서 마지막 `48px` 제거, 헤더/행/팀합계에서 FT 관련 셀 3곳 제거, `total`에서 `ftm`/`fta` 제거.

---

## 2026-07-28 — 라이브게임 헤더 스코어링 런 표시 시 높이 변동 수정

**배경**: 스코어버그 헤더 중앙 컬럼의 "스코어링 런"(🔥 팀 X-Y) 줄이 런이 있을 때만 조건부로 렌더링되고 없으면 아예 DOM에서 빠져, 런 유무에 따라 컬럼이 2줄/3줄을 오가며 헤더 전체 높이가 미세하게 바뀌는 레이아웃 시프트가 있었음.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — 스코어링 런 `<span>`을 조건부 렌더링(`{isLive && activeRun && (...)}`)에서 항상 렌더링하되 값이 없을 때 `invisible` 클래스로 시각적으로만 숨기는 방식으로 변경. `activeRun` 참조를 전부 옵셔널 체이닝(`activeRun?.`)으로 변경하고 폴백값(`?? 0`) 추가.

**Before**:
```tsx
{isLive && activeRun && (
    <span className="text-xs font-bold text-white whitespace-nowrap">
        🔥 {(activeRun.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
        {activeRun.teamPts}-{activeRun.oppPts}
    </span>
)}
```

**After**:
```tsx
<span className={`text-xs font-bold text-white whitespace-nowrap ${isLive && activeRun ? '' : 'invisible'}`}>
    🔥 {(activeRun?.teamId === gameData?.home_team_id ? homeAbbr : awayAbbr)}{' '}
    {activeRun?.teamPts ?? 0}-{activeRun?.oppPts ?? 0}
</span>
```

**검증**: `esbuild` 구문 파싱만 확인. 브라우저 실행 검증은 하지 않음.

**롤백 방법**: 위 span을 Before 블록으로 되돌리면 됨.

---

## 2026-07-28 — 라이브게임 박스스코어에 코트 위 선수 하이라이트 추가

**배경**: 멀티플레이어 라이브 게임(PBP) 화면의 박스스코어 테이블에서 현재 코트 위 5명을 시각적으로 구분할 방법이 없었음. `box_timeline`(`BoxTick[]`)의 각 tick에 `on: string[]`(그 포세션에 코트 위 있던 10명 playerId)이 이미 저장돼 있었지만 `buildLiveBox()`가 mp 누적에만 쓰고 버리고 있었음 — 이를 재사용해 UI 요청 기능만 추가.

**변경 파일**:
- `views/multi/season/MultiGamePbpView.tsx` — `getOnCourtIds(timeline, elapsed)` 헬퍼 신규 추가(elapsed 이하 마지막 tick의 `on` 배열 반환), `onCourtIds` useMemo 추가(`liveHomeBox`/`liveAwayBox`와 동일한 의존성), `PlayerBoxPanel`에 `onCourtIds?: Set<string>` prop 추가해 행 className에 `bg-emerald-400/15` 조건부 적용(최초 `bg-emerald-500/10`이었으나 사용자 요청으로 더 밝게 조정), live 박스 호출부 2곳(원정/홈)에 prop 전달.

**Before**:
```tsx
const PlayerBoxPanel: React.FC<{ players: PlayerBoxScore[]; label: string }> = ({ players, label }) => {
    ...
    {sorted.map((p, i) => (
        <div className={`... ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`} ...>
```

**After**:
```tsx
const PlayerBoxPanel: React.FC<{ players: PlayerBoxScore[]; label: string; onCourtIds?: Set<string> }> = ({ players, label, onCourtIds }) => {
    ...
    {sorted.map((p, i) => (
        <div className={`... ${onCourtIds?.has(p.playerId) ? 'bg-emerald-400/15' : i % 2 === 0 ? 'bg-slate-800/20' : ''}`} ...>
```

**검증**: `esbuild`로 구문 파싱만 확인. 브라우저 실행 검증은 하지 않음.

**주의사항**: `final`(경기 종료 후 전체 공개) 상태의 박스스코어 호출부에는 `onCourtIds`를 전달하지 않음 — 코트 위 개념은 라이브 진행 중에만 의미가 있음.

**롤백 방법**: `PlayerBoxPanel`의 `onCourtIds` prop과 className 조건, `getOnCourtIds`/`onCourtIds` useMemo, 두 호출부의 `onCourtIds={onCourtIds}` prop 전달부 제거.

---

## 2026-07-28 — 일정 화면에서 미확정 다음 라운드 대진 스포일러 노출 수정

**배경**: 토너먼트 Bo7 시리즈가 아직 3:3(미확정)인데도 "시즌 일정"(`MultiScheduleView.tsx`) 화면에는 다음 라운드 매치업이 상대팀 이름까지 확정되어 노출되는 버그 제보. 원인 추적 결과, 서버(`server/src/simRunner.ts::handleTournamentAdvance`)는 시리즈 결정 경기를 시뮬레이션한 즉시(사용자가 실제로 10분 리플레이를 보기 전) `league.bracket_data.series`에 다음 라운드 진출팀을 채우고 `room.schedule`에 해당 라운드 경기를 추가한다. 브라켓 화면(`TournamentBracketView.tsx`)은 이미 `liveSeries`라는 재계산 로직으로 "피더 시리즈가 `isFinal` 게이팅을 통과했는지"에 따라 다음 라운드를 TBD로 되돌리는 방어 로직이 있었지만, 일정 화면은 raw `schedule`을 그대로 나열만 해서 이 게이팅이 전혀 없었다 — `GameRow`가 `state`(scheduled/live/final)와 무관하게 팀 이름을 항상 렌더링했기 때문에, 서버가 백엔드에서 다음 라운드를 미리 만든 순간 바로 스포일러로 노출됨.

**변경 파일**:
- `views/multi/season/multiGameReveal.ts` — `TournamentBracketView.tsx`에 있던 시리즈 게이팅 로직(라운드 1부터 순서대로 재계산해 피더 시리즈가 `isFinal`을 통과 못했으면 `higherSeedId`/`lowerSeedId`를 강제로 `'TBD'`로 되돌림)을 `computeRevealedSeries(series, schedule, serverNowMs)`라는 공용 함수로 추출해 신규 export.
- `views/multi/season/TournamentBracketView.tsx` — 기존에 인라인으로 있던 `liveSeries` useMemo 내부 로직(약 45줄)을 제거하고 `computeRevealedSeries()` 호출로 교체(동작 동일, 중복 제거).
- `views/multi/season/MultiScheduleView.tsx` — `allGames` useMemo에 `revealedSeriesById`(← `computeRevealedSeries()`) 기반 필터를 추가. `g.isPlayoff && g.seriesId`인 경기는 해당 시리즈가 게이팅상 아직 양쪽 다 확정(`higherSeedId`/`lowerSeedId` 둘 다 `'TBD'` 아님)되지 않았으면 목록에서 아예 제외.

**Before**:
```ts
// MultiScheduleView.tsx
const allGames = useMemo(() =>
    [...schedule]
        .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
        .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
[schedule, simStart, gprd]);
```

**After**:
```ts
// MultiScheduleView.tsx
const revealedSeriesById = useMemo(() => {
    const series: any[] = (league?.bracket_data as any)?.series ?? [];
    if (!series.length) return null;
    return computeRevealedSeries(series, schedule as any, serverNow);
}, [league?.bracket_data, schedule, serverNow]);

const allGames = useMemo(() =>
    [...schedule]
        .filter(g => {
            if (!g.isPlayoff || !g.seriesId || !revealedSeriesById) return true;
            const gated = revealedSeriesById.get(g.seriesId);
            return !!gated && gated.higherSeedId !== 'TBD' && gated.lowerSeedId !== 'TBD';
        })
        .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }))
        .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date)),
[schedule, simStart, gprd, revealedSeriesById]);
```

**검증**: `esbuild`로 수정한 3개 파일(`multiGameReveal.ts`, `TournamentBracketView.tsx`, `MultiScheduleView.tsx`) 구문 파싱만 확인(에러 없음). 로컬 dev 서버로 실제 브라우저 재현(3:3 상태에서 일정 화면에 다음 라운드가 안 뜨는지)은 하지 않음.

**롤백 방법**: `MultiScheduleView.tsx`의 `revealedSeriesById`/필터 블록 제거하고 `allGames`를 Before 상태로 되돌림. `TournamentBracketView.tsx`의 `liveSeries` useMemo를 원래 인라인 45줄 로직으로 복원(git에서 이 커밋 diff 참고). `multiGameReveal.ts`의 `computeRevealedSeries`/`seriesMatchIndex`/`SeriesGameLike` 제거.

---

## 2026-07-28 — 멀티플레이어에서 아키타입/태그 DB 설정 preload 누락 수정

**배경**: 어드민(PlayerEditorPage)과 멀티플레이어 세션에서 같은 선수의 OVR/특성 태그가 다르게 표시되는 버그 조사 결과 발견. `services/admin/gameConfigService.ts`의 `archetypeCache`/`tagCache`는 `preloadGameConfig()`를 명시적으로 호출해야만 채워지는 모듈 싱글턴인데, 이 앱에서 유일한 호출부(`hooks/useGameData.ts`)가 `/multi` 라우트에서는 `skipSingleLoad=true`로 인해 INIT LOGIC effect 최상단(`if (skipSingleLoad) return`)에서 즉시 return되어 버려 멀티플레이어에서는 이 호출이 한 번도 실행되지 않았다. 그 결과 `utils/ovrEngine.ts`(OVR 계산의 tagBonus), `pages/PlayerEditorPage.tsx`(어드민 표시), `services/playerDevelopment/archetypeEvaluator.ts`(선수 프로필 특성 태그 표시) 세 곳 모두 "DB 커스텀 태그가 있으면 그걸 쓰고 없으면 하드코딩 폴백" 패턴인데, 멀티플레이어만 항상 폴백을 타면서 어드민과 다른 tagBonus/태그 목록이 계산됨. 실측: 스카티 반스(커스텀 오버라이드 없음, PF)의 raw OVR이 하드코딩 폴백 기준 91.7(→92), DB 커스텀 태그(15개, 전부 미충족→tagBonus 0) 기준 89.9(→90)로 정확히 일치 확인. 화면상으로도 DB 태그 목록에 없는 `off_ball_mover`(하드코딩 폴백 전용 ID, DB는 `space_ace`로 대체됨)가 멀티플레이어 선수 프로필에 뜨는 것으로 재확인.

**변경 파일**:
- `hooks/useGameData.ts` — `preloadGameConfig()` 호출을 `skipSingleLoad` 가드가 있는 INIT LOGIC effect(197행 근처, 기존 190행)에서 제거하고, 훅 최상단(51행 이후)에 의존성 배열 `[]`인 별도 `useEffect`로 이동해 `skipSingleLoad` 값과 무관하게 항상 1회 실행되도록 함.

**Before**:
```ts
export const useGameData = (session, isGuestMode, rosterMode, skipSingleLoad = false) => {
    const queryClient = useQueryClient();
    // ...state...
    useEffect(() => {
        if (skipSingleLoad) return;   // ← /multi 라우트면 여기서 즉시 return
        if (hasInitialLoadRef.current || isResettingRef.current) return;
        if (isBaseDataLoading || !baseData) return;
        const initializeGame = async () => {
            const isMultiRoute = window.location.pathname.startsWith('/multi');
            preloadGameConfig().catch(() => {});   // ← 멀티플레이어에서는 도달 불가
            setIsSaveLoading(true);
            ...
```

**After**:
```ts
export const useGameData = (session, isGuestMode, rosterMode, skipSingleLoad = false) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        preloadGameConfig().catch(() => {});   // skipSingleLoad와 무관하게 항상 1회 실행
    }, []);

    // --- State ---
    ...
    useEffect(() => {
        if (skipSingleLoad) return;
        ...
        const initializeGame = async () => {
            const isMultiRoute = window.location.pathname.startsWith('/multi');
            setIsSaveLoading(true);   // preloadGameConfig() 호출 제거(중복이라 위로 이동)
            ...
```

**검증**: `fetchArchetypeConfig`/`fetchTagConfig`는 내부적으로 모듈 캐시(`archetypeCache`/`tagCache`)를 체크해 이미 로드됐으면 즉시 반환하므로, 싱글플레이어 경로에서 두 곳(신규 effect + 기존 initializeGame 흐름)이 잠깐이라도 겹쳐 호출되어도 중복 네트워크 요청·부작용 없음. 별도 브라우저 실행 검증은 하지 않음(로컬 dev 서버 미기동) — `preloadGameConfig`가 정상적으로 `useGameData` 훅 스코프 안에서 import되어 있는지, `useEffect` import 존재 여부만 정적으로 확인함.

**롤백 방법**: `hooks/useGameData.ts` 51~61행에 추가한 `useEffect` 블록을 삭제하고, 197행(`setIsSaveLoading(true);`) 바로 위에 `preloadGameConfig().catch(() => {});` 호출을 다시 삽입하면 Before 상태로 복귀.

---

## 2026-07-28 — 리그 생성 모달에 정규화 강도 선택 추가

**배경**: "리그 상대 정규화 강도"(고OVR 드래프트 풀에서 득점 과열 억제)는 `LeagueSettingsView.tsx`(드래프트 이전 recruiting 단계에서 접근 가능한 세션 설정 화면)에는 이미 있었지만, 리그를 **처음 생성**하는 `CreateLeagueModal.tsx`에는 없어서 생성 직후엔 항상 DB 기본값(사실상 비어있음, 실질적으로 레벨3=k0.7 폴백)으로만 시작했다. 생성 단계에서도 선택 가능하게 해달라는 요청.

**변경 파일**:
- `types/simSettings.ts` — `NORMALIZATION_LEVELS`(레벨0~5 → {enabled,k,label} 매핑), `DEFAULT_NORMALIZATION_LEVEL`(=3) 신규 export. 기존 `LeagueSettingsView.tsx`에 로컬로 있던 동일 배열을 여기로 옮겨 두 화면이 공유하도록 함.
- `views/multi/league/LeagueSettingsView.tsx` — 로컬 `NORMALIZATION_LEVELS` 정의 삭제, `types/simSettings.ts`에서 import. 하드코딩된 fallback `3` → `DEFAULT_NORMALIZATION_LEVEL`로 교체(동작 변화 없음).
- `services/multi/leagueService.ts` — `CreateRoomParams`에 `simSettings?: SimSettings` 추가, `createRoom()`의 insert 페이로드에 `sim_settings` 조건부 포함.
- `components/multi/CreateLeagueModal.tsx` — `normalizationLevel` state(기본값 `DEFAULT_NORMALIZATION_LEVEL`) 추가, 드래프트 설정 섹션 아래 "엔진 설정" 섹션(0~5 숫자 입력)을 신설, `handleSubmit`의 `createRoom()` 호출에 `simSettings: { normalization: { enabled, k } }` 전달.

**Before**: `CreateLeagueModal.tsx`는 `createRoom({ leagueId, maxPlayers })`만 호출 — `sim_settings` 컬럼이 DB 기본값으로 남고, 방장이 recruiting 단계에서 `LeagueSettingsView`에 들어가 별도로 저장해야만 정규화 값이 명시적으로 채워짐.

**After**: 생성 모달에서 0(끔)~5(최대) 레벨을 선택하면 `createRoom()` insert 시점에 `rooms.sim_settings.normalization = { enabled, k }`가 바로 채워짐. 생성 후에도 `LeagueSettingsView`에서 그대로 재확인/변경 가능(같은 `NORMALIZATION_LEVELS` 프리셋 사용).

**검증**: 루트에 tsconfig.json이 없어 프론트엔드는 tsc 타입체크 대상이 아님(Vite/esbuild가 타입 어노테이션만 strip) — 기존 `LeagueSettingsView.tsx`도 동일한 패턴(`SimSettings` 타입에 없는 `normalization` 키를 런타임에서 읽고 씀)이라 기존 관례를 그대로 따름. 브라우저 수동 확인은 하지 않음(로컬 dev 서버 미기동).

**롤백 방법**: 위 4개 파일을 각 Before 상태로 되돌리면 됨 — `CreateLeagueModal.tsx`의 `createRoom()` 호출에서 `simSettings` 제거, `leagueService.ts`의 `CreateRoomParams.simSettings`/insert 조건부 스프레드 제거, `LeagueSettingsView.tsx`에 로컬 `NORMALIZATION_LEVELS` 재추가, `types/simSettings.ts`에서 신규 export 제거.

---

## 2026-07-28 — 오토픽 유저 "AUTO" 배지 표시

**배경**: 오토픽 관련 기능(개념/토글/트리거 0~3)이 전부 구현됐지만, 어떤 팀이 지금 오토픽
상태인지 드래프트 화면에서 시각적으로 확인할 방법이 없었음. 사용자 요청으로 두 곳에 배지 추가.
UI 전용 변경이라 처음엔 dev-log 기록 생략을 판단했으나, 사용자가 "dev-log에는 항상 기록을
남겨라"고 명시적으로 정정 — 이후 UI 변경도 전부 기록한다.

**변경 파일**:
- `components/draft/DraftBoard.tsx` (client) — `autoPickTeamIds?: Set<string>` prop 추가, 팀 헤더의
  온라인/오프라인 점 옆에 "AUTO" 배지 렌더링(상시 노출, 대기실/본 드래프트 화면 공용)
- `components/draft/DraftHeader.tsx` (client) — `isCurrentTeamAutoPick?: boolean` prop 추가(기본값
  `false` — 싱글/루키 드래프트와 공용 컴포넌트라 안 넘기면 기존 동작 그대로), "현재 차례" 팀 이름
  옆에 "AUTO" 배지 표시
- `views/multi/league/MultiDraftView.tsx` (client) — `autoPickTeamIds`(`pickOrder` + `autoPickUserIds`로
  userId→teamId 변환), `isCurrentTeamAutoPick` 파생값 계산 후 두 컴포넌트에 전달(대기실/본 화면의
  `DraftBoard` 2곳 + `DraftHeader` 1곳)

**Before**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    {isOnline !== undefined && <span style={{ ...dot... }} />}
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
```

**After**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    <div className="flex items-center gap-1">
        {isOnline !== undefined && <span style={{ ...dot... }} />}
        {isAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
    </div>
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
{isCurrentTeamAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
```

**검증**: 수정한 3개 파일(`DraftBoard.tsx`/`DraftHeader.tsx`/`MultiDraftView.tsx`)에 대해
synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 두 컴포넌트 모두 싱글/루키 드래프트와 공용이라
새 prop을 옵셔널+기본값 `false`/`undefined`로 둬서 기존 호출부(넘기지 않는 곳)엔 영향 없음.
실제 브라우저 렌더링 확인은 미실시.

**롤백 방법**: 위 3개 파일에서 이번 diff(각 prop 추가분 + JSX 배지 블록)를 되돌리면 됨. 서버/DB
변경 없음(클라이언트 전용).

---

## 2026-07-28 — 시즌 데이터(useMultiGameData)를 LeagueLayout으로 끌어올림 — 리그 진입 시 1회만 로드

**배경**: `useMultiGameData()`가 `MultiSeasonLayout`에서 호출되고 있었는데, 이 레이아웃은
`/season/*` 하위 라우트에만 적용됨(로비/설정/어드민 화면은 그 밖의 `LeagueLayout` 형제 라우트).
로비·설정 화면으로 나갔다가 다시 일정/로스터 등 시즌 화면으로 돌아오면 `MultiSeasonLayout`이
언마운트→재마운트되면서 `useMultiGameData()`가 매번 방 데이터부터 처음부터 다시 로드해 로더가
반복적으로 떴음. 사용자와 논의 후 "리그 진입 시점에 한 번만 로딩하고 이후엔 재로딩 없이" 방향으로
결정 — 새로고침 시 다시 로드되는 건 SPA 특성상 불가피하고 오히려 정상 동작이라는 점도 함께 확인함.

**변경 파일**:
- `views/multi/league/LeagueLayout.tsx` (client) — `useMultiGameData(session, state.room?.id ?? null)`
  호출 + `SeasonCtx.Provider`를 여기로 이전. 단, 이 레이아웃 자체의 로딩 게이트는 `state.isLoading`
  (리그 데이터)만 기준으로 유지 — 시즌 데이터 로딩 완료를 기다리지 않고 로비/설정 화면은 즉시 렌더링됨
  (시즌 데이터는 백그라운드에서 병행 로드)
- `views/multi/season/MultiSeasonLayout.tsx` (client) — `useMultiGameData()` 직접 호출과
  `SeasonCtx.Provider` 제거, `useSeasonContext()`로 이미 로드된 데이터를 소비만 함. `gameData.isLoading`
  체크는 유지(URL로 시즌 라우트에 곧바로 진입해 아직 로딩 중인 극히 짧은 순간을 위한 안전장치)

**Before** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <Outlet />
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const { room } = useLeagueContext();
    const { session } = useGame();
    const gameData = useMultiGameData(session, room?.id ?? null);

    if (gameData.isLoading) { return <Loader2 .../>; }

    return (
        <SeasonCtx.Provider value={gameData}>
            ... <Outlet /> ...
        </SeasonCtx.Provider>
    );
}
```

**After** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();
    const { session } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <SeasonCtx.Provider value={gameData}>
                <Outlet />
            </SeasonCtx.Provider>
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const gameData = useSeasonContext();

    if (gameData.isLoading) { return <Loader2 .../>; }

    return ( ... <Outlet /> ... );  // SeasonCtx.Provider 없음 — 상위(LeagueLayout)에서 이미 제공
}
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(2개 파일 OK), `npm run build`
성공. 순환 임포트 확인 — `seasonContext.ts`가 `hooks/useMultiGameData.ts`와 react만 참조하는 독립
파일이라 `LeagueLayout.tsx`에서 import해도 순환 없음(`hooks/useMultiGameData.ts`/`hooks/useCurrentLeague.ts`
쪽도 `views/multi/league/`를 참조하지 않음을 확인). 클라이언트 UI 전용 변경, 서버 배포 불필요.

**주의사항 / 한계**: 이제 리그의 어떤 하위 화면(로비 포함)에 들어가도 시즌 데이터 로드가 백그라운드로
같이 시작됨 — 드래프트/모집 중이라 시즌이 아직 시작 안 된 리그에서도 매번 이 조회가 발생하는
트레이드오프가 있음(사용자가 명시적으로 선택한 방향, "로비/설정 화면 진입 속도가 느려질 수 있다"는
점 사전 고지 후 승인받음). 실제 브라우저 확인(로비↔일정 반복 이동 시 로더 재출현 여부)은 미실시.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨 — 서로 짝을 이루는 변경이라 반드시 함께
되돌릴 것(하나만 되돌리면 `SeasonCtx`가 이중으로 제공되거나 아예 제공되지 않아 `useSeasonContext()`가
깨짐).

---

## 2026-07-27 — 재접속 시 오토픽 자동 해제(트리거 3) — 명시적으로 켠 경우는 보존

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 3, 마지막 남은 항목. 타임아웃 연속 미스나
드래프트 시작 시 미입장으로 오토픽 전환된 유저가 WS 재접속(auth 성공)하면 자동으로 오토픽을
해제하고 수동 모드로 복귀시킨다.

구현 중 발견한 중요한 함정: `autoPickUserIds`는 단일 Set이라 "왜 오토픽 상태가 됐는지"(시스템이
자동 감지했는지, 본인/어드민이 일부러 켰는지)를 구분하지 못한다. 재접속 시 무조건 해제해버리면,
"이번 판은 바빠서 계속 오토픽으로 둘게"라고 셀프토글이나 어드민 토글로 **명시적으로 설정한** 유저가
잠깐 다른 탭에서 재접속하는 순간 그 설정이 의도치 않게 풀려버리는 회귀가 생긴다. 이번 세션 초반에
합의한 "재접속 시 자동 해제"는 어디까지나 시스템이 자동으로 감지해 넣은 경우에 한정된 논의였으므로,
이 구분을 새로 추가해 반영했다.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `autoPickManualUserIds: Set<string>` 상태 신설 — `autoPickUserIds`의 부분집합으로, 셀프/어드민
    토글로 명시적으로 켠 유저만 표시(자동 트리거는 여기 포함 안 됨)
  - `setAutoPick()` — on/off 시 `autoPickManualUserIds`도 함께 갱신
  - `revertAutoPickOnReconnect(userId)` 신규 — `autoPickUserIds`엔 있지만 `autoPickManualUserIds`엔
    없는 경우(=자동 트리거)에 한해서만 `setAutoPick(userId, false)` 호출
  - `handleSubmitPick()` — 본인이 직접 픽 제출 시 `autoPickManualUserIds`도 함께 삭제(수동 픽은
    오토픽 사유·출처를 불문하고 전부 무효화하는 게 맞다고 판단)
- `server/src/index.ts` (server) — `auth` 처리에서 `room.addSocket(ws)` 직후
  `await room.revertAutoPickOnReconnect(userId)` 호출 추가

**Before**:
```ts
// setAutoPick()
if (enabled) this.autoPickUserIds.add(targetUserId);
else         this.autoPickUserIds.delete(targetUserId);

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
// (재접속 시 오토픽 해제 로직 없음)
```

**After**:
```ts
// setAutoPick()
if (enabled) {
    this.autoPickUserIds.add(targetUserId);
    this.autoPickManualUserIds.add(targetUserId);
} else {
    this.autoPickUserIds.delete(targetUserId);
    this.autoPickManualUserIds.delete(targetUserId);
}

// 신규 메서드
async revertAutoPickOnReconnect(userId: string): Promise<void> {
    if (this.autoPickUserIds.has(userId) && !this.autoPickManualUserIds.has(userId)) {
        await this.setAutoPick(userId, false);
    }
}

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
this.autoPickManualUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
await room.revertAutoPickOnReconnect(userId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`index.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module/name 'Bun'"(@types/bun 미설치)만 남음). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `autoPickManualUserIds` 필드, `setAutoPick()`의 분기
확장, `revertAutoPickOnReconnect()` 메서드, `handleSubmitPick()`의 `autoPickManualUserIds.delete()`
를 위 Before 블록으로 되돌리고, `server/src/index.ts`의 `revertAutoPickOnReconnect()` 호출 1줄
제거. client 미러 없음(서버 전용 로직). 이것으로 `docs/plan/draft-autopick-plan.md`의 트리거 0~4
전체가 구현 완료됨.

---

## 2026-07-27 — 픽 타임아웃 연속 미스 시 오토픽 전환(트리거 1) + 어드민 세션 설정 노출

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 1. 유저가 `autoPickAfterMisses`회(어드민이
세션 설정에서 지정, 기본 1회) 연속으로 픽 타이머를 전부 소진하면 그 유저를 오토픽 모드로 전환.
"연속"이 기준이므로 본인이 직접 픽을 제출하면(=돌아왔다는 증거) 미스 카운트를 리셋하고, 이미
오토픽 모드였다면 그것도 함께 해제한다 — 안 그러면 본인 의사와 무관하게 다음 차례부터 계속
자동픽되는 어색한 상태가 남는다.

이 임계치는 다른 드래프트 설정(라운드 수/픽 제한시간 등)과 동일하게 `leagues` 테이블 컬럼으로
추가하고 `CreateLeagueModal`/`LeagueSettingsView`에 입력 필드를 노출했다 — `LeagueSettingsView`의
"스케줄" 섹션은 `!isInProgress`로 잠기므로(드래프트 시작 후 라운드 수를 못 바꾸는 것과 동일하게)
이 값도 드래프트가 실제로 시작되기 전까지만 조정 가능하다. `DraftConfig`는 방 준비 시점
(`buildDraftSetup()`)에 한 번 굳어지므로 드래프트 도중 실시간 반영은 불가능 — 애초에 기존 라운드
수/픽 제한시간과 동일한 제약이라 새로 생긴 한계는 아니다.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftConfig.autoPickAfterMisses: number` 추가
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickAfterMisses: number` 추가
- `server/src/DraftRoom.ts` (server) — `pickMissCounts: Map<string, number>` 상태 신설(메모리 전용),
  `onPickTimeout()`에서 미스 카운트 증가 후 임계치 도달 시 `autoPickUserIds.add()`, `handleSubmitPick()`
  에서 본인 제출 시 `pickMissCounts.delete()` + `autoPickUserIds.delete()`
- `server/src/startDraft.ts` (server) — `DEFAULT_AUTO_PICK_AFTER_MISSES = 1`, `buildDraftSetup()`에서
  `league.draft_auto_pick_after_misses ?? DEFAULT_AUTO_PICK_AFTER_MISSES` 읽어 `draftConfig`에 포함
- `hooks/useLeagueDraft.ts` (client) — `assembleState()`에 `autoPickAfterMisses` 반영
- `services/multi/roomQueries.ts` (client) — `LeagueRow.draft_auto_pick_after_misses: number` 추가
- `services/multi/leagueService.ts` (client) — `CreateLeagueParams.options`/`UpdateLeagueSettingsParams`에
  `draftAutoPickAfterMisses` 추가, `createLeague()`/`updateLeagueSettings()` payload 매핑 라인 추가
- `components/multi/CreateLeagueModal.tsx` (client) — "오토픽 전환 기준(연속 미스)" 입력 필드(1–5) 추가
- `views/multi/league/LeagueSettingsView.tsx` (client) — 동일 입력 필드 추가(스케줄 섹션,
  `!isInProgress`일 때만 노출)
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_draft_auto_pick_after_misses`) —
  `ALTER TABLE public.leagues ADD COLUMN draft_auto_pick_after_misses integer NOT NULL DEFAULT 1;`
  (이 컬럼 없이는 `createLeague`/`updateLeagueSettings`가 Postgres 에러로 실패함)

**Before**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
const result = await this.persistPick(userId, playerId);
```

**After**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const misses = (this.pickMissCounts.get(entry.userId) ?? 0) + 1;
this.pickMissCounts.set(entry.userId, misses);
if (misses >= this.config.autoPickAfterMisses) {
    this.autoPickUserIds.add(entry.userId);
}
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
const result = await this.persistPick(userId, playerId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`startDraft.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module 'bun'"/`startDraft.ts`의 discriminated union `.error` 이슈만 남음, 둘 다
이번 변경 이전부터 존재). 클라이언트 6개 파일(`multiDraft.ts`/`useLeagueDraft.ts`/`roomQueries.ts`/
`leagueService.ts`/`CreateLeagueModal.tsx`/`LeagueSettingsView.tsx`)도 synthesize한 tsc 옵션으로
신규 에러 없음 확인(남은 에러는 `sim_settings`/`normalization` 관련 완전히 무관한 기존 이슈).
`information_schema.columns`로 마이그레이션 전 `leagues` 테이블에 해당 컬럼이 없었음을 먼저 확인 후
`ADD COLUMN`으로 추가, 적용 결과 `success:true`. 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 9개 코드 파일에서 이번 diff를 되돌리고, DB는
`ALTER TABLE public.leagues DROP COLUMN draft_auto_pick_after_misses;`로 컬럼 제거(선택사항 — 컬럼이
남아있어도 코드가 안 읽으면 무해함). `protocol.ts` ↔ `types/multiDraft.ts`는 미러 쌍이므로 함께 되돌릴 것.

---

## 2026-07-27 — 스케줄 화면 PTS/REB/AST 리더 localStorage 캐싱

**배경**: `MultiScheduleView.tsx`가 시즌 하위 탭을 오가며 재마운트될 때마다, 그리고 마운트된 동안
5초마다 방 안의 `game_pbp` 전체 row(`home_box`/`away_box` JSON 포함)를 다시 조회해서 PTS/REB/AST
리더를 계산하고 있었음. `game_pbp` row는 시뮬레이션 완료 시 1회 upsert된 뒤 갱신되지 않으므로
(관리자 수동 재시뮬레이션은 극히 예외적이라 이번 범위에서 제외, 사용자 확인 완료), 이미 끝난 경기는
매번 다시 조회할 필요가 없음. 상세 설계는
[schedule-leaders-cache-plan.md](../plan/schedule-leaders-cache-plan.md) 참조.

조사 중 발견: 토너먼트 게임 ID(`T_R{round}_M{matchIndex}`, `server/src/shared/tournamentBracket.ts`)가
완전히 위치 기반이라 랜덤 요소가 없음. `resetTournament()`가 같은 `room.id`를 재사용해 드래프트부터
다시 시작하므로, 리셋 후 새 토너먼트의 동일 라운드/매치가 예전과 **같은 game_id**를 다시 갖게 됨 —
캐시를 영구 보존하면 리셋 전 경기의 리더가 리셋 후 동명 경기에 잘못 붙는 실제 버그가 생겨, 사용자가
직접 요청하지 않았지만 리셋 시점 캐시 무효화를 계획에 포함시킴(승인받음).

**변경 파일**:
- `services/multi/gameLeadersCache.ts` (신규, client 전용) — `loadGameLeadersCache`/
  `mergeGameLeadersCache`/`clearGameLeadersCache`, `nbagm:gameLeaders:{roomId}` 키로 localStorage 영속화.
  `GameLeaders`/`StatLeader` 타입도 여기로 이전(기존 `MultiScheduleView.tsx` 로컬 정의 제거)
- `views/multi/season/MultiScheduleView.tsx` — `gameLeadersMap` 초기값을 캐시로 채움, 폴링 로직을
  "캐시에 없는 `played` 게임만" 델타 조회하도록 변경, 캐시에 빠진 게 없으면 네트워크 요청 자체를 스킵
- `views/multi/league/LeagueSettingsView.tsx` — `handleReset()`에서 `resetTournament()` 성공 직후
  `clearGameLeadersCache(room.id)` 호출 추가

**Before** (`MultiScheduleView.tsx`, `gameLeadersMap` 로딩):
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>({});
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id);
        if (cancelled || !data) return;
        const map: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            map[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(map);
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id]);
```

**After**:
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>(
    () => room?.id ? loadGameLeadersCache(room.id) : {},
);
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const cached = loadGameLeadersCache(room.id);
        const missingIds = schedule.filter(g => g.played && !(g.id in cached)).map(g => g.id);

        if (missingIds.length === 0) {
            setGameLeadersMap(cached);
            return;
        }

        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id)
            .in('game_id', missingIds);
        if (cancelled || !data) return;
        const updates: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            updates[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(mergeGameLeadersCache(room.id, updates));
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id, schedule]);
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(3개 파일 전부 OK),
`npm run build` 성공. 클라이언트 UI/로직 전용 변경이라 서버 배포 불필요. 실제 브라우저에서 Network
탭으로 캐시 히트/델타 조회 동작 확인은 미실시.

**롤백 방법**: `services/multi/gameLeadersCache.ts` 삭제, `MultiScheduleView.tsx`를 위 Before
블록 및 로컬 `interface StatLeader`/`GameLeaders` 정의로 되돌리기, `LeagueSettingsView.tsx`의
`handleReset()`에서 `clearGameLeadersCache(room.id)` 호출 및 관련 import 제거.

---

## 2026-07-27 — 드래프트 시작 시 미입장 유저 자동 오토픽 전환

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 2. 오토픽 개념/셀프·어드민 토글(직전 항목)에
이어서, 드래프트가 `waiting → active`로 전환되는 순간 방에 WS로 연결돼 있지 않은 유저를 즉시
오토픽 모드로 전환하는 로직 추가. `room.sockets`(서버가 이미 들고 있는 WS 연결 목록)로 판정하며,
Supabase Presence 등 별도 인프라 없이 서버 자체 정보만으로 처리.

이 판정은 "깨끗한 종료"(탭 닫기, 페이지 이동, 브라우저 종료 → WS close 이벤트 발생)는 정확하지만
"네트워크가 갑자기 끊긴 경우"는 서버가 close 이벤트를 못 받아 일시적으로 놓칠 수 있다는 한계가
있음(감내 가능한 트레이드오프로 채택 — 어차피 그 유저 차례에 응답이 없으면 기존 `onPickTimeout()`이
오토픽으로 전환시킴). 다만 이 논의 중 `broadcast()`가 죽은 소켓의 `send()` 실패를 그냥 무시만 하고
`sockets`에서 제거하지 않는 실제 허점을 발견해 함께 고침 — 이 청소를 안 하면 죽은 소켓이 계속
"접속 중"으로 남아 `getConnectedUserIds()` 판정이 부정확해짐.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `activate()` 최상단에 미입장 유저 감지 루프 추가 (`pickOrder`를 유저당 1회만 순회, AI 슬롯 제외)
  - `getConnectedUserIds()` private 헬퍼 신설 — `[...this.sockets].map(ws => ws.data.userId)`
  - `broadcast()` — `ws.send()` 실패 시 `this.sockets.delete(ws)` 추가(기존엔 catch에서 그냥 무시)

**Before**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { /* 소켓 이미 닫힘 */ }
    }
}
```

**After**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    const connected = this.getConnectedUserIds();
    const seen = new Set<string>();
    for (const entry of this.config.pickOrder) {
        if (entry.isAi || seen.has(entry.userId)) continue;
        seen.add(entry.userId);
        if (!connected.has(entry.userId)) this.autoPickUserIds.add(entry.userId);
    }

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { this.sockets.delete(ws); }
    }
}
```

**검증**: `server/tsconfig.json`(직전 세션에서 신규 추가됨) 기준 `cd server && tsc --noEmit -p .`
실행 — `DraftRoom.ts`는 기존부터 있던 "Cannot find module 'bun'"(@types/bun 미설치, 무관) 1건 외
신규 에러 없음. 나머지 에러도 전부 이번 변경과 무관한 기존 파일들(`scheduler.ts`/`tournamentArchiver.ts`/
`simRunner.ts`/`startDraft.ts` 등 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `activate()`의 미입장 감지 루프, `getConnectedUserIds()`
메서드, `broadcast()`의 `this.sockets.delete(ws)` 3곳을 위 Before 블록으로 되돌리면 됨. client 미러
없음(서버 전용 로직).

---

## 2026-07-27 — 경기 시뮬레이션 Worker Thread 분리

**배경**: 멀티플레이어 서버가 큰 토너먼트 진행 중 경기 시뮬레이션(경기당 4.5~10초 동기 연산,
`runFullGameSimulation()`)에 메인 스레드 이벤트 루프가 막혀 HTTP/WS 연결이 끊기는 문제 발생
("진행중인 경기 보기"가 "경기 데이터를 준비하는 중입니다..."만 뜨고 안 들어가짐). 1차로
스케줄러 루프에 `setImmediate` 양보를 넣었으나(경기 "사이"만 양보) 경기 "한 개" 자체의 블로킹은
그대로 남아 효과 없었음. VM 스펙업은 Bun/Node가 JS를 단일 스레드로 실행하므로 근본 해결이 안 돼
기각. 상세 설계·리스크 분석은 [worker-thread-sim-plan.md](../plan/worker-thread-sim-plan.md) 참조.

**변경 파일**:
- `server/src/workers/simWorker.ts` (신규) — 워커 스레드 엔트리, `runSimulation()`을 그대로 import해 실행
- `server/src/workers/simWorkerPool.ts` (신규) — 풀 매니저. 스폰 직후 ping/pong 헬스체크,
  워커 크래시 시 `game_sim_claims` 안전망 정리, 5분 간격 stale 클레임 청소, 60초 태스크 타임아웃
- `server/src/workers/protocol.ts` (신규) — 메인↔워커 메시지 타입 (discriminated union)
- `server/src/scheduler.ts` — `runSimGames()`의 순차 `for...await` 루프를
  `Promise.allSettled(tasks.map(... simWorkerPool.runSimulationInWorker ...))`로 교체, 지난번 넣은
  `setImmediate` 양보 제거(더 이상 불필요), stale 클레임 청소 인터벌 추가
- `server/src/index.ts` — 어드민 수동 시뮬 엔드포인트(`handleSimOverride`)를 `simWorkerPool` 경유로
  교체, 부팅 시퀀스에 `await simWorkerPool.init()` 추가
- `server/tsconfig.json` (신규) — server 디렉토리에 tsconfig가 없어서 이번 세션 내내
  `tsc --noEmit -p .`가 "Cannot find a tsconfig.json" 에러로 즉시 실패하고 있었는데, grep이
  거기서 매칭되는 줄이 없어 "에러 없음"으로 잘못 보였음(허위 통과). 이 파일 추가로 실제 타입체크가
  동작하게 됨 — 향후 서버 변경 검증에도 계속 사용

**Before** (`server/src/scheduler.ts`, `runSimGames()` 말미):
```ts
for (const { roomId, gameId } of tasks) {
    const result = await runSimulation(roomId, gameId);
    if (!result.ok && !result.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${result.error}`);
    }
    await new Promise(resolve => setImmediate(resolve));
}
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**After**:
```ts
const results = await Promise.allSettled(
    tasks.map(({ roomId, gameId }) => simWorkerPool.runSimulationInWorker(roomId, gameId)),
);
results.forEach((r, i) => {
    const { roomId, gameId } = tasks[i];
    if (r.status === 'rejected') {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.reason}`);
    } else if (!r.value.ok && !r.value.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.value.error}`);
    }
});
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**검증**:
- `server/tsconfig.json` 신규 작성 후 `tsc --noEmit -p .` 실행 — 신규/변경 파일에서 새로 생긴 에러
  없음(남은 건 프로젝트 전역에 이미 있던 "Cannot find name 'Bun'"(@types/bun 미설치) 및 무관한
  기존 파일들의 사전 존재 이슈뿐, 확인 완료)
- 브레이스/괄호 균형 확인(5개 파일 전부 OK)
- **로컬 스모크 테스트 미실시** — 이 개발 환경에 `bun` 바이너리가 설치되어 있지 않아 워커 스폰을
  로컬에서 직접 띄워볼 수 없었음. Fly.io 배포 이미지에는 Bun이 있으므로, 배포 직후 로그로
  `[simPool] worker#N ready`(ping/pong 헬스체크 통과) 확인을 사실상의 최초 검증으로 사용
- 실측 확인: 배포 전 Supabase에 직접 쿼리해서 `game_sim_claims` 839건 중 823건이 10분 이상 경과,
  그중 124건은 대응하는 `game_pbp` row가 없는 진짜 고아 레코드임을 확인 — 이번에 추가한 stale
  클레임 청소가 이론이 아니라 실제로 존재하는 문제를 다룬다는 근거

**롤백 방법**: `server/src/workers/` 디렉토리 3개 파일 삭제, `scheduler.ts`/`index.ts`를 위 Before
블록 및 원래 `import { runSimulation } from './simRunner'`로 되돌리고 `simWorkerPool.init()` 호출
제거. `server/tsconfig.json`은 삭제해도 런타임에 영향 없음(타입체크 전용).

---

## 2026-07-27 — 멀티 드래프트 오토픽 모드(신규 개념) + 셀프/어드민 토글

**배경**: 멀티플레이어 드래프트에서 (1) 픽 타임아웃 (2) 드래프트 시작 시 미입장 (3) 어드민 강제 지정 —
3가지 트리거로 유저를 "오토픽 모드"로 전환하는 기능을 계획(`docs/plan/draft-autopick-plan.md`)했고,
그중 가장 먼저 "오토픽 모드" 개념 자체 + 셀프 토글(본인 팀 on/off) + 어드민 토글(모든 유저 on/off)을
구현. 타임아웃/미입장 자동 트리거는 이번 범위에서 제외(추후 별도 작업).

기존 `onPickTimeout()`은 타임아웃된 픽 1개만 대납하고 다음 픽부터는 다시 정상 타이머로 돌아가는
"1회성" 동작이었는데, 이번에 추가한 오토픽은 **해제 전까지 계속 유지되는 영속 모드**라는 점이 다름.

영속화 방식은 메모리 전용으로 결정(사용자 확인 완료) — `submit_draft_pick_v2` RPC가 매 픽마다
`rooms.draft_cursor`를 통째로 덮어써서(`status`/`currentPickIndex`/`currentPickStartedAt`만 포함)
`autoPickUserIds`를 DB에 안정적으로 지속시킬 수 없다는 걸 실제 RPC 정의(`pg_get_functiondef`)로 확인함.
서버 재시작 시 오토픽 상태가 리셋되지만, 해당 유저가 여전히 자리에 없다면 다음 타임아웃에서 다시
감지되어 자동 복구된다(1회성 지연만 재발생) — 감내 가능한 트레이드오프로 채택.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftCursor.autoPickUserIds: string[]` 추가, `ToggleAutoPickMsg` 신규,
  `AdminMsg.action`에 `'toggle-autopick'` 추가(+ params에 `targetUserId`/`enabled`)
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickUserIds: string[]` 추가
- `server/src/DraftRoom.ts` (server) — `autoPickUserIds: Set<string>` 상태(메모리 전용, `load()`에서
  의도적으로 미복원), `setAutoPick(userId, enabled)` 메서드, `scheduleNext()`/`onAiPick()` 조건을
  `entry.isAi` → `entry.isAi || autoPickUserIds.has(entry.userId)`로 확장, `handleAdmin()`에
  `'toggle-autopick'` 케이스 추가, `persistPick()` 호출 시 `isAi` 인자를 `true` 하드코딩 대신
  `entry.isAi ?? false`로 전달(오토픽 대납된 실제 사람 유저가 `draft_picks.is_ai=true`로 잘못
  기록되는 것 방지)
- `server/src/index.ts` (server) — `toggleAutoPick` 클라 메시지 처리(본인 userId 대상, 어드민 권한 불필요)
- `hooks/useLeagueDraft.ts` (client) — `assembleState`/`cursorFields`에 `autoPickUserIds` 반영,
  `sendAdmin` params 타입 확장, `toggleAutoPick(enabled)` 함수 추가·반환
- `components/draft/DraftAdminPanel.tsx` (client) — "유저별 오토픽" 섹션 추가(참가자별 on/off 버튼)
- `views/multi/league/MultiDraftView.tsx` (client) — 상단 바에 "내 오토픽" 셀프 토글 버튼 추가

**Before**:
```ts
// DraftRoom.ts scheduleNext()
if (entry.isAi) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry?.isAi) return;
...
const result = await this.persistPick(entry.userId, bestId, true);
```

**After**:
```ts
// scheduleNext()
if (entry.isAi || this.autoPickUserIds.has(entry.userId)) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry || (!entry.isAi && !this.autoPickUserIds.has(entry.userId))) return;
...
const result = await this.persistPick(entry.userId, bestId, entry.isAi ?? false);
```

**검증**: `tsc --noEmit`(project tsconfig 부재로 synthesize한 임시 옵션) 실행 결과, 수정한 7개 파일
(`DraftRoom.ts`/`protocol.ts`/`index.ts`/`multiDraft.ts`/`useLeagueDraft.ts`/`DraftAdminPanel.tsx`/
`MultiDraftView.tsx`) 관련 신규 에러 없음 확인(남은 에러는 전부 이번 변경과 무관한 기존 파일들 —
Bun 타입 누락, 다른 서비스 파일들의 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 8개 파일에서 이번 커밋의 diff만 되돌리면 됨. `protocol.ts` ↔ `types/multiDraft.ts`는
미러 쌍이므로 반드시 함께 되돌릴 것 — 하나만 되돌리면 `DraftCursor`/`MultiDraftState` 필드 불일치로
클라이언트가 `autoPickUserIds`를 못 읽거나 서버가 보내지 않는 필드를 기대하는 불일치가 생김.

---

## 2026-07-27 — playStyle 액터 선택 로직을 역할(슈터/패서) 기반으로 통합

**배경**: `ballDominance`(볼 소유 빈도)와 `playStyle`(슛 vs 패스 성향) 텐던시의 상호작용을 논의하다가,
"플레이스타일이 패스퍼스트면 어시스터로 뽑힐 확률이 높아지고 야투를 덜 던지게" 만들고 싶다는 요청.
기존 로직은 `pickWeightedActor()` 하나가 슈터 픽/패서 픽 양쪽에 재사용되는데, playStyle 보정이
"플레이타입 종류"로만 4개(Iso/PostUp/PnR_Handler/Handoff) 한정 분기돼 있어서 역할(슈터냐 패서냐)
구분이 없었고, 나머지 8개 플레이타입은 아예 영향이 없었음. 이번 변경으로 전체 12개 플레이타입에
역할 기반으로 통일 적용.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client)
- `server/src/shared/engine/pbp/playTypes.ts` (server 미러)
- `services/game/config/constants.ts` (client)
- `server/src/shared/game/config/constants.ts` (server 미러)

**Before** (`playTypes.ts`, `resolvePlayAction` 내부):
```ts
const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: pass-first(-1) vs shoot-first(+1)
        // Iso, PostUp → shoot-first boost: +30% at playStyle=+1.0
        // PnR_Handler, Handoff → pass-first boost: +20% at playStyle=-1.0
        // CatchShoot, Cut → neutral (receiver role)
        const ps = p.tendencies?.playStyle ?? 0;
        if (playType === 'Iso' || playType === 'PostUp') {
            weight *= (1 + ps * 0.3);
        } else if (playType === 'PnR_Handler' || playType === 'Handoff') {
            weight *= (1 - ps * 0.2);
        }
        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId
    );
};

// PnR_Handler 케이스
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);

// Handoff 케이스
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
```

**After**:
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter'
) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: role 기반 통합 배율 (슈터 vs 패서)
        const ps = p.tendencies?.playStyle ?? 0;
        const psCfg = SIM_CONFIG.PLAY_SELECTION;
        weight *= role === 'shooter' ? (1 + ps * psCfg.PLAYSTYLE_SHOOTER_K) : (1 - ps * psCfg.PLAYSTYLE_PASSER_K);

        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId,
        'passer'
    );
};

// PnR_Handler 케이스 — 스크리너를 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer');

// Handoff 케이스 — 빅맨을 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

`pickPasser`가 내부적으로 `'passer'` role을 넘기도록 바뀌어서, 나머지 9개 플레이타입(Iso, PnR_Roll,
PnR_Pop, PostUp, CatchShoot, Cut, Transition, OffBallScreen, DriveKick)의 패서 픽은 호출부 수정 없이
자동으로 새 로직을 탄다. `pickWeightedActor`의 다른 모든 슈터(actor) 픽은 `role` 인자를 생략해
기본값 `'shooter'`를 그대로 사용 — 호출부 무수정.

**Before** (`constants.ts`, `SIM_CONFIG.ZONE_SELECTION` 다음):
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
FOUL_TROUBLE: {
```

**After**:
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
// Play Selection: pickWeightedActor의 역할(슈터/패서) 기반 playStyle 배율
PLAY_SELECTION: {
    PLAYSTYLE_SHOOTER_K: 0.25,  // 슈터 픽: weight *= (1 + ps*K)
    PLAYSTYLE_PASSER_K: 0.25,   // 패서 픽: weight *= (1 - ps*K)
},
FOUL_TROUBLE: {
```

**검증**:
- Node 재현 스크립트: ps=-1 → shooter×0.75/passer×1.25, ps=0 → 1.0/1.0, ps=+1 → shooter×1.25/passer×0.75 (의도대로 확인)
- `tsc --noEmit` client/server 모두 신규 에러 없음
- `npm run build` 성공 (2195 모듈)
- `fly deploy -a basketballgm-app-server` 배포 성공, HTTP 200, 로그 정상(WebSocket 서버 기동 확인). 배포 중 "not listening on 0.0.0.0:3001" 경고는 부팅 타이밍 노이즈로 확인된 기존 알려진 패턴(직후 로그에 정상 리스닝 확인됨)

**롤백 방법**: 위 Before 블록 4곳(client playTypes.ts, server playTypes.ts, client constants.ts, server constants.ts)을 그대로 되돌리고 `fly deploy -a basketballgm-app-server` 재배포.

**관련 논의**: 이전 커밋에서 어시스트 기록 확률에 걸려있던 playStyle 보정(`statsMappers.ts`의 `assistMod`)은
"패스는 패스, 어시스트는 어시스트"라는 판단 하에 별도로 제거함 (이 항목보다 먼저 진행된 변경, 별도 기록 없음 — 필요시 git log 참조).
