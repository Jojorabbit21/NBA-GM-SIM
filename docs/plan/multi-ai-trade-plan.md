# 멀티플레이어 AI ↔ 유저 트레이드 계획

작성: 2026-10-19 · 개정: 2026-10-19 (세션 설정 "AI 트레이드" 섹션 추가 — 5장 / 1단계 하드 필터 축소: 시즌 상한·재트레이드 금지·프랜차이즈 보호 제거 — D8~D10) · 상태: **계획 (결정 대기)**
관련: `docs/plan/multi-trade-cba-gaps.md`(CBA 미구현 추적), `services/tradeEngine/`(싱글 CPU 엔진), `migrations/add_trade_roster_limit_check.sql`(현행 `respond_trade_offer`)

---

## 0. 결정 사항

| # | 질문 | 제안 | 결정 |
|---|---|---|---|
| D1 | AI 응답 지연 기준 | **가상 날짜 기준**: 제안 후 N번째 가상 자정에 답변(N은 설정값, 기본 1). 타임라인이 없는 방(토너먼트·구 리그)은 실시간 N×10분 | 미정 |
| D2 | 설정 항목 기본값 | 5-2 표의 "기본값" 열 (난이도 보통 = 5% 이상 이득일 때 수락, 하루 3건, 동일 패키지 7일) | 미정 |
| D3 | 설정 저장 위치 | **`leagues.ai_trade_enabled` + `leagues.ai_trade_settings jsonb`** (sim_settings 아님 — 제안 생성 RPC가 SQL에서 제한 수치를 읽어야 하고, 기존 `*_enabled` + 값 패턴·감사 로그 트리거와 맞춤) | 미정 |
| D4 | 마스터 토글 기본값 | **꺼짐**. 기존 리그·새 리그 모두 커미셔너가 켜야 동작 | 미정 |
| D5 | 기존 "트레이드 수락 기준"/"CPU 트레이드 확률" 입력란 | 멀티에서 소비처 0인 껍데기라 **트레이드 설정 섹션에서 제거**(저장값은 sim_settings에 그대로 둠). AI↔AI 트레이드를 만들 때 AI 트레이드 섹션에 다시 설계 | 미정 |
| D6 | 빈 토글 UI 처리 | `finance_enabled`, `training_enabled`는 소비처가 없음. 설정 화면에 "준비 중" 표기를 할지 (이 계획 범위 밖, 별도 결정) | 미정 |
| D7 | AI 트레이드를 끌 때 대기 중인 AI 대상 제안 | **다음 응답기 tick에서 거절 처리**(사유 `ai_trade_disabled`) — 유저가 결과를 알 수 있게. 만료로 두는 것보다 명확 | 미정 |
| D8 | 포지션 하드 거절 기준 | 거래 후 AI 팀의 **C 0명 또는 PG 0명**일 때만 거절. 그 외 포지션이 얇아지는 건 3단계 `positionDepth` 감점 | **확정 (2026-10-19)** |
| D9 | 시즌 트레이드 상한 (AI 팀당 / 유저당) | **제거**. 평가에서 탈락하면 애초에 성사되지 않으므로 불필요 — 모델 오류는 상한으로 덮지 않고 평가 로그로 찾아 모델을 고친다 | **확정 (2026-10-19)** |
| D10 | 받은 선수 재트레이드 금지 / 프랜차이즈 선수 보호 | **둘 다 제거**. 유저끼리 직접 트레이드가 가능해 AI 경유 세탁은 의미 없음. 스타 보호는 가치 곡선(지수형+스타 배율)·전력 변화 비중에 맡김 (영향 예측 4-3) | **확정 (2026-10-19)** |

---

## 1. 현황 (2026-10-19 코드 확인)

### 1-1. 트레이드 경로
- `create_trade_offer`: 받는 팀이 `user_id IS NULL OR is_ai`면 `target_not_human` 예외. **관리자만 임시 예외**(`migrations/temp_allow_admin_trade_offer_to_ai_team.sql`, 정식 오픈 전 원복 대상).
- `respond_trade_offer(p_offer_id, p_action)`:
  - 첫 줄에서 `auth.uid()`가 없으면 `not_authenticated` → **서버(service role)에서 그대로 호출할 수 없음**.
  - 관리자(`v_admin`)는 샐러리 매칭을 **건너뜀** → AI 경로가 관리자 권한을 빌리면 CBA가 무력화됨.
  - 수락 시 하드 규칙 검사: 데드라인 / 오래된 제안 / 샐러리 매칭(`cap_enabled AND trade_salary_matching_enabled`) / 로스터 정원(`max_roster_size`). 성사 시 같은 선수가 걸린 다른 대기 제안 `invalidated`, 리그 이벤트 발행.
- 멀티 트레이드는 **선수만** 거래 (픽 없음).
- 스케줄러(`server/src/scheduler.ts`) 30초 폴링, 제안 만료 스윕 10분 주기. 가상 자정 처리 훅 `processRoomMidnights()` 존재(체력 회복용).
- 서버 선수 로딩: `server/src/playerLoader.ts` `loadRoomPlayers()` — `custom_overrides` 판단까지 포함.

### 1-2. 싱글 CPU 엔진 (재사용 후보)
- `getPlayerTradeValue()`: `(OVR−40)^3.8` × 스타 배율(슈퍼스타 1.8 / 스타 1.2) → **이미 비선형**이라 "조각 여럿 = 스타 1명" 교환에 강함.
- 단, 다음 항목이 **토글과 무관하게 항상 계산**됨: 나이 프리미엄/하락, 만기 계약 보너스, 나쁜 계약 패널티(**$15M 절대값** — 멀티는 리그별 캡 금액이 달라 캡 비율로 바꿔야 함), 부상 패널티.
- `getPlayerValueToTeam()`: 역할 필요도, 타임라인 나이, 스타 의향, 유스 편향, 부상 위험, 포지션 중복.
- `calculateAcceptScore()`: 유틸리티 vs 팀 방향별 임계값.
- 의존성: `utils/constants`, `fa/faValuation`, `fa/faMarketBuilder`, `types/gm` 등 클라이언트 모듈 → **그대로 미러하지 않고 필요한 공식만 새 순수 모듈로 옮긴다**(싱글 엔진은 건드리지 않음).

### 1-3. 리그 토글이 실제로 동작하는지

| 토글 | 실제 동작 | AI 판단에 쓸 근거 |
|---|---|---|
| `cap_enabled`, `trade_salary_matching_enabled`, `apron1/2_enabled` | ✅ 트레이드 RPC가 강제 | 있음 |
| `luxury_tax_enabled` | ⚠️ 표시용 라인뿐, **징수 없음** | 약함 |
| `finance_enabled` | ❌ 소비처 0 | 없음 |
| `training_enabled` | ❌ 소비처 0, **멀티 서버에 성장·노화 코드 자체가 없음** | 없음 |
| `fa_enabled` | ✅ FA 서명/방출 RPC만 막음. **계약 연차 진행(`advanceContractSeason`) 호출부 0** → 계약 만료 개념 없음 | 만기 관련은 없음 |
| `sim_settings.injuriesEnabled` / `injuryFrequency` | ✅ `room_player_state`로 영속화 동작 | 있음 |
| `trade_deadline_enabled` / `trade_deadline_date` | ✅ | 있음 |
| `max_roster_size`, `playoffTeamCount`, `play_in_enabled` | ✅ | 있음 |
| `two_way_enabled` | ✅ | 있음 |
| `coaching_enabled`, `archetypesEnabled` | 엔진에서 사용 | 2단계 이후 |
| `use_custom_overrides` | ✅ `playerLoader`가 처리 | OVR 일관성 필수 |

---

## 2. 범위

**1단계 범위**: 유저 → AI 팀 제안을 AI가 평가해 **수락 / 거절(사유 코드)** 응답.

**범위 밖 (이후 단계)**: 역제안(카운터), AI → 유저 선제안, AI ↔ AI 트레이드, 픽 거래, 예외조항(TPE 등, `multi-trade-cba-gaps.md` 2~4번).

---

## 3. 전체 흐름

```
[유저] create_trade_offer(to = AI 팀)
   │  · leagues.ai_trade_enabled 확인
   │  · 남용 제한(5-2) 검사
   │  · ai_review_after = responseDelayDays번째 가상 자정 (D1)
   ▼
league_trade_offers  status = pending
   │
[Fly 스케줄러] aiTradeResponder.tick()  ← 30초 폴링 안에서 실행
   │  · ai_review_after 지난 AI 대상 pending 제안 조회
   │  · 양 팀 로스터 로드(loadRoomPlayers) + 리그 설정 로드
   │  · buildAiTradeRules() → evaluateAiTradeOffer()   (순수 함수)
   │  · 평가 로그 저장(league_ai_trade_evaluations, 관리자 전용)
   ▼
ai_respond_trade_offer(offer_id, 'accept' | 'reject', reason_code)   (service role 전용)
   │  · 내부적으로 respond_trade_offer와 같은 실행 코어 사용
   │  · 관리자 바이패스 없음 → 하드 규칙(매칭/정원/데드라인) 그대로 강제
   │  · accept인데 하드 규칙 실패 → 예외를 잡아 reject(reason = rule_violation)로 재기록
   ▼
유저 화면: Realtime(replica identity full)로 상태 변경 수신 → 결과 + 사유 표시
```

**하드 규칙을 AI 쪽에 다시 구현하지 않는다.** 수락을 시도하면 SQL 코어가 판정하고, 실패하면 거절로 바꾼다. 매칭 규칙의 기준이 SQL 한 곳에만 남는다.

---

## 4. AI 판단 모델

### 4-1. 규칙 객체 — 토글은 여기서만 읽는다

```ts
// server/src/shared/aiTrade/aiTradeRules.ts
// Systems that actually exist in multi. Flip when the system ships.
export const MULTI_SYSTEMS = {
    injuries:         true,
    growth:           false,   // no growth/aging in multi server
    contractRollover: false,   // advanceContractSeason has no caller
    luxuryTaxCharge:  false,   // tax line is display-only
} as const;

export interface AiTradeRules {
    salary:   { enabled: boolean; capAmount: number; tax: boolean; taxAmount: number | null };
    injuries: { enabled: boolean; frequency: number };
    growth:   { enabled: boolean };
    contracts:{ expiryMatters: boolean };
    deadline: { enabled: boolean; date: string | null };
    maxRosterSize: number;
    playoffTeamCount: number;
    settings: AiTradeSettings;      // resolved section settings (5-2)
}

export function buildAiTradeRules(league, simSettings): AiTradeRules
```
- `growth.enabled = MULTI_SYSTEMS.growth` (training_enabled는 지금 아무 의미가 없으므로 보지 않는다)
- `contracts.expiryMatters = fa_enabled && MULTI_SYSTEMS.contractRollover`
- `salary.tax = luxury_tax_enabled && MULTI_SYSTEMS.luxuryTaxCharge`
- 평가 함수는 리그 행이나 `sim_settings`를 **직접 읽지 않는다**. 새 토글이 생기면 이 함수만 고친다.

### 4-2. 평가 5단계

**① 절대 거부 (점수 계산 전)**
| 조건 | 사유 코드 |
|---|---|
| 거래 후 AI 팀에 **C가 0명** 또는 **PG가 0명** (D8) | `roster_hole` |

- 하드 필터는 이것 하나뿐. 나머지 판단은 전부 가치 평가(③~⑤)로 한다 (D9, D10).
- 근거 데이터 (2026-10-19, 멀티 47팀 집계): 선수 포지션은 PG/SG/SF/PF/C 단일값. 팀당 평균 가드 6.8 / SF 2.5(최소 2) / 빅 5.5 / C 2.9(최소 2). "그룹별 2명 미만 거절"이었다면 SF 1명만 요청해도 대부분 거절되는 사실상 SF 트레이드 금지 규칙이 됐음.
- 엔진에 포지션 미스매치 페널티가 없어서(슬롯 포지션은 능력치 기반) 0명이 아닌 한 경기는 성립한다.

**② 팀 상황 판단** (`aiTeamState.ts`)
- 방향: `contend` / `neutral` / `rebuild`
  - 경기 수 < 10: 로스터 상위 8인 전력 리그 순위로만 판단
  - 이후: 승률 순위(`playoffTeamCount` 기준 라인) 60% + 전력 순위 40%
  - `growth.enabled = false`인 동안 `rebuild`는 "연봉 정리 + 전력 유지 선호"로만 작동 (젊음 가산 없음)
- 포지션 필요도: 상위 10인의 가드/윙/빅 분포
- GM 성향: `league_teams.ai_gm_profile`(없으면 `hash(league_id, team_slug)` 시드로 생성 후 저장) — `starWillingness`, `riskTolerance`, `stubbornness` 3개만 1단계에서 사용

**③ 선수 가치** (`aiTradeValue.ts`, 요소 레지스트리 방식)
```ts
interface ValueFactor {
    id: string;
    requires: (r: AiTradeRules) => boolean;
    apply: (v: number, p: Player, ctx: EvalContext) => number;
}
```
| 요소 | requires | 내용 |
|---|---|---|
| `base` | 항상 | `(OVR−40)^3.8` × 스타 배율(스타 88+ ×1.2 / 슈퍼스타 93+ ×1.8) (싱글 상수 재사용, OVR은 `custom_overrides` 반영된 로드 결과). **스타 보호는 이 곡선이 담당** (D10) |
| `positionNeed` | 항상 | 필요 포지션 +최대 15%, 과잉 포지션 −15% |
| `positionDepth` | 항상 | 거래 후 특정 포지션이 인접 포지션(PG↔SG↔SF↔PF↔C) 포함 2명 미만이면 감점 (D8 하드 거절의 완화판) |
| `contractEfficiency` | `salary.enabled` | 연봉 / 캡 비율 대비 OVR로 효율 계산 (**$ 절대값 금지**) |
| `taxAversion` | `salary.tax` | 1단계에선 항상 꺼짐 (징수 없음) |
| `injuryRisk` | `injuries.enabled` | 부상 중: 잔여 기간 비례 할인, 내구도 낮음: `frequency`에 비례 할인, `riskTolerance`로 완화 |
| `age` | 항상 | `growth.enabled = false`면 30세 이상 소폭 할인만, 젊음 프리미엄 없음 |
| `expiring` | `contracts.expiryMatters` | 1단계에선 항상 꺼짐 |
| `deadlineUrgency` | `deadline.enabled` | 데드라인 가상 7일 전부터 `contend`는 기준선 −2%p, `rebuild`는 +0 |

- **가중치 재정규화**: 꺼진 요소 때문에 전체 스케일이 흔들리지 않도록, 곱셈형 요소는 꺼지면 1.0, 덧셈형 요소는 켜진 것끼리 비중 합 1로 맞춘다.

**④ 거래 후 전력 변화**
- 상위 8인 가중 OVR(1~5번 1.0, 6~8번 0.5)을 거래 전후로 비교 → `Δstrength`
- 방향별 비중: `contend` 0.5 / `neutral` 0.3 / `rebuild` 0.1
- 받는 선수가 더 많으면 로스터 자리 비용: 순증 1명당 리그 대체 선수 가치만큼 차감

**⑤ 결정**
```
inAdj  = Σ value(받는 선수)  − 로스터 자리 비용
outAdj = Σ value(주는 선수)
ratio  = inAdj / outAdj + w_dir × Δstrength + noise
accept ⇔ ratio ≥ minValueRatioOf(settings) + stubbornness 보정(±0.03)
```
- `noise`: ±0.03, 시드 = 제안 내용 해시(양쪽 선수 id 정렬). **같은 패키지에는 항상 같은 답.**

### 4-3. 프랜차이즈 보호 제거의 영향 예측 (D10)

**긍정적 효과**
- 판단 기준이 하나(가치)로 통일 → 모든 거절을 같은 논리로 설명 가능, 설정 항목·사유 코드·경계값 버그(동점, 나이 컷) 감소
- "절대 안 되는 선수"가 없어 블록버스터 트레이드가 가능 → 유저 쪽 드라마·목표 의식
- 리빌딩 AI 팀이 노장 스타를 파는 현실적인 흐름이 자연스럽게 생김 (rebuild는 전력 하락 비중 0.1)

**부정적 효과 / 위험**
- **모델 ↔ 엔진 괴리**가 가장 큰 위험: 가치 곡선이 엔진에서 스타가 실제로 내는 승리 기여보다 스타를 싸게 매기면, AI는 "모델상 이득"을 보면서 실제 전력은 계속 잃음 → 유저 팀에 스타가 쏠리고 AI 팀이 껍데기만 남음
- 시즌 초반 스타 연쇄 이동으로 리그 판도가 급변할 수 있음 (상한도 없음, D9)
- "팀의 얼굴" 개념이 없어 우승 도전 팀이 간판을 내주는 장면이 나올 수 있음 (단, contend 전력 변화 비중 0.5가 강하게 억제)

**남아 있는 자연 방어선**
지수형 가치 곡선 + 스타 배율 / contend 팀 전력 하락 비중 / 로스터 자리 비용 / 난이도 기준선 / 단장 성향(`starWillingness`) / 샐러리 매칭(캡 켜진 리그에서 대형 연봉 스타는 큰 연봉을 같이 보내야 함)

**확인 방법 (11장 검증에 포함)**
- 스타 획득 비용 표: OVR 88/91/94 선수를 contend·neutral·rebuild 팀에서 받아 오려면 어떤 패키지가 필요한지
- 모델 ↔ 엔진 괴리: 패키지 교환 전후 양 팀으로 시즌 시뮬을 돌려, 모델상 "AI 이득" 거래가 실제 승수에서도 AI 손해가 아닌지
- 운영 지표: 시즌별 AI→유저로 이동한 88+ 선수 수 (평가 로그로 집계)

**문제가 보이면 쓸 대안**: 절대 보호를 다시 넣지 않고, 엔진 기여에 맞게 스타 배율을 올리거나 "프랜차이즈 할증"(팀 내 1위 && 88+ 가치 ×1.5)을 추가 — 불가능이 아니라 비싸게.

### 4-4. 거절 사유 (유저에게 보이는 것)
수치는 노출하지 않는다. 코드만 저장하고 문구는 클라이언트에서 매핑. `reasonDisclosure = 'simple'`이면 응답기가 사유 코드를 `declined` 하나로 저장(관리자 평가 로그에는 원래 사유 유지).

| 코드 | 문구 예시 |
|---|---|
| `value_short_large` | 제안 가치가 크게 부족합니다 (ratio < 기준 − 0.25) |
| `value_short_small` | 조금만 더 보태면 고려해 볼 만합니다 |
| `direction_mismatch` | 지금 팀 방향과 맞지 않는 거래입니다 (전력 하락이 지배적) |
| `roster_hole` | 이 거래를 하면 로스터를 꾸릴 수 없습니다 (센터 또는 포인트가드가 남지 않음) |
| `rule_violation:<원래 에러>` | 샐러리 매칭·정원 등 규칙 위반 (기존 `mapTradeOfferError` 문구 재사용) |

**사유 문구는 해당 요소가 켜져 있을 때만 사용할 수 있다** (예: 캡이 꺼진 리그에서 연봉 관련 사유 금지).

---

## 5. 세션 설정 — "AI 트레이드" 섹션

### 5-1. 위치와 저장 방식

- **세션 설정 → 트레이드 탭**, 기존 "트레이드 설정" 섹션과 "어드민 트레이드" 블록 사이에 새 섹션 **"AI 트레이드"**.
- 관리자 전용, 진행 중 세션에서도 변경 가능 (기존 트레이드 설정과 동일).
- 저장: 트레이드 탭 공용 저장 버튼(`TAB_SAVE_MAP.trade`) 하나로 함께 저장 — `isTradeTabDirty`에 AI 항목 포함, `handleSaveTradeSettings`가 `updateLeagueSettings({ aiTradeEnabled, aiTradeSettings })`도 전달.
- DB: `leagues.ai_trade_enabled boolean` + `leagues.ai_trade_settings jsonb` (D3). `update_league_settings_atomic`은 `leagues` 컬럼을 범용 처리하므로 **RPC 수정 불필요**.
- 감사 로그: `trg_lal_league_settings`의 `v_cols`에 두 컬럼 추가 → 설정 변경이 "리그 설정 변경" 로그에 남음.
- 값 검증: 클라 입력에서 범위 클램프 + **읽는 쪽(서버 TS·SQL)에서도 다시 클램프** — DB에 범위 밖 값이 들어가도 무해하게.
- 기본값·범위의 원본은 `aiTradeSettings.ts` 한 곳 (서버 `server/src/shared/aiTrade/` ↔ 클라 `services/multi/aiTrade/` **미러 쌍**). SQL은 제한 수치 2개(하루 제안 수, 동일 패키지 금지)만 `coalesce(기본값)`으로 읽으므로, 기본값을 바꾸면 SQL 마이그레이션도 같이 바꾼다(dev-log에 세 곳 동시 기록).

### 5-2. 설정 항목

```ts
// aiTradeSettings.ts (server/src/shared/aiTrade ↔ services/multi/aiTrade mirror)
export interface AiTradeSettings {
    difficulty:            'easy' | 'normal' | 'hard' | 'very_hard' | 'custom';
    customMinValueRatio:   number;   // used only when difficulty = 'custom'
    responseDelayDays:     number;
    dailyOffersPerAiTeam:  number;
    rejectedPackageCooldownDays: number;
    reasonDisclosure:      'detailed' | 'simple';
}
export const AI_TRADE_SETTINGS_DEFAULTS: AiTradeSettings
export function resolveAiTradeSettings(raw: unknown): AiTradeSettings   // fill defaults + clamp
export function minValueRatioOf(s: AiTradeSettings): number
```

**① 기본**

| 항목 | UI | 범위 | 기본값 | 의미 |
|---|---|---|---|---|
| AI 트레이드 허용 | 마스터 토글 (`ai_trade_enabled`) | on/off | off (D4) | 끄면 AI 팀이 제안 대상 목록에서 빠지고, 아래 항목은 전부 비활성(값은 유지) |
| 난이도 | 4단 프리셋 + "직접 설정" | 쉬움 0.95 / 보통 1.05 / 어려움 1.15 / 매우 어려움 1.25 / 직접 0.90~1.30 (0.01 단위) | 보통 | AI가 수락하는 최소 가치 비율 (받는 조정 가치 ÷ 주는 조정 가치). 1.00 = 손익 0 |
| 응답 지연 | 숫자 | 1~3 가상일 | 1 | 제안 후 몇 번째 가상 자정에 답할지. 타임라인 없는 방은 ×10분(실시간) |

**② 제한 수치**

| 항목 | 범위 | 기본값 | 의미 |
|---|---|---|---|
| 같은 AI 팀에 하루 제안 수 | 1~10 | 3 | 유저 1명이 AI 팀 1곳에 가상 하루 동안 보낼 수 있는 제안 수 |
| 거절된 동일 패키지 재제안 금지 | 0~30 가상일 (0 = 제한 없음) | 7 | 같은 선수 구성(양쪽 선수 id 집합 동일)으로 다시 보내기 금지 |

두 항목 모두 목적은 **기준선 탐색 방지**(조금씩 바꿔 보내며 수락선을 역산하는 것). 시즌 상한·재트레이드 금지는 두지 않는다 (D9, D10).

**③ 판단 옵션**

| 항목 | UI | 기본값 | 의미 |
|---|---|---|---|
| 거절 사유 공개 | 2택 | 상세 | 상세 = 4-4 사유 문구 / 간단 = "거절했습니다"만 (기준선 역산이 더 어려움) |

**④ 현재 AI가 고려하는 요소 (읽기 전용 패널)**

리그의 다른 토글 상태를 `buildAiTradeRules()`(클라 미러)로 계산해, 각 가치 요소의 상태를 보여준다. 다른 탭에서 바꾼 저장 전 값이 아니라 **저장된 값 기준**.

| 표시 | 조건 |
|---|---|
| ✅ 반영 중 | 리그 토글 on && 시스템 존재 (예: "부상 위험 — 부상 시스템 켜짐") |
| ⏸ 꺼짐 | 리그 토글 off (예: "연봉 효율 — 샐러리캡 꺼짐") |
| 🕓 준비 중 | 멀티에 시스템 없음 (`MULTI_SYSTEMS` false, 예: "성장 가능성 — 멀티 성장 시스템 준비 중") |

항상 반영되는 하드 규칙(샐러리 매칭 / 로스터 정원 / 데드라인)도 같은 패널에 각 토글 상태와 함께 표시.

### 5-3. 화면 구성

```
┌ AI 트레이드 ─────────────────────────────────────────────┐
│ 유저가 AI 팀에 트레이드를 제안할 수 있게 하고, AI의 판단 기준을 조절합니다.  │
│                                                          │
│ [■] AI 트레이드 허용                                        │
│                                                          │
│ 난이도   [쉬움][보통●][어려움][매우 어려움][직접 설정]   (1.05)      │
│ 응답 지연 [ 1 ] 가상일 뒤 자정                                 │
│ ── 제한 ──────────────────────────────────────────────── │
│ 같은 AI 팀에 하루 제안 수           [ 3 ]                     │
│ 거절된 동일 패키지 재제안 금지         [ 7 ] 일   (0 = 제한 없음)    │
│ ── 판단 옵션 ───────────────────────────────────────────── │
│ 거절 사유 공개  (●상세 ○간단)                                 │
│ ── 현재 AI가 고려하는 요소 ──────────────────────────────── │
│ ✅ 선수 능력 · ✅ 포지션 필요도 · ✅ 연봉 효율(샐러리캡 켜짐)          │
│ ⏸ 부상 위험(부상 꺼짐) · 🕓 성장 가능성(준비 중) · 🕓 만기 계약(준비 중) │
│ 하드 규칙: ✅ 샐러리 매칭 · ✅ 로스터 정원 15 · ✅ 데드라인 2027-02-11   │
└──────────────────────────────────────────────────────────┘
```

- 기존 섹션과 같은 스타일: 체크박스 행(on = amber 테두리), 숫자 입력 `w-20` 가운데 정렬, 각 항목 아래 11px 설명.
- 마스터 토글 off면 하위 입력 전부 `disabled` + 흐리게 (값은 그대로 보존).
- 버튼 타이포그래피 규칙(uppercase/tracking-widest 금지) 준수, 프리셋 버튼은 세그먼트 형태.

### 5-4. 시즌 중 변경 시 동작

| 변경 | 동작 |
|---|---|
| 난이도·판단 옵션 | 저장 이후 **평가하는 제안부터** 적용 (이미 대기 중인 제안 포함 — 평가 시점 설정 사용) |
| 제한 수치 낮춤 | 새로 보내는 제안부터 적용. 이미 대기 중인 제안은 취소하지 않음 |
| 응답 지연 변경 | 새 제안부터. 대기 중인 제안의 `ai_review_after`는 그대로 |
| 마스터 토글 끔 | 새 제안 차단 + 대기 중인 AI 대상 제안은 다음 tick에서 거절(`ai_trade_disabled`, D7) |
| 마스터 토글 켬 | 즉시 AI 팀이 대상 목록에 나타남 |


## 6. DB 변경

| 대상 | 변경 |
|---|---|
| `leagues` | `ai_trade_enabled boolean NOT NULL DEFAULT false` (D4), `ai_trade_settings jsonb NOT NULL DEFAULT '{}'` (빈 객체 = 전부 기본값, 5-2) |
| `trg_lal_league_settings` | `v_cols`에 `ai_trade_enabled`, `ai_trade_settings` 추가 (감사 로그) |
| `league_teams` | `ai_gm_profile jsonb NULL` (지연 생성) |
| `league_trade_offers` | `ai_review_after timestamptz NULL`, `ai_reason_code text NULL` |
| 신규 `league_ai_trade_evaluations` | `offer_id`, `rules jsonb`, `factors jsonb`, `ratio`, `threshold`, `verdict`, `created_at` — RLS: 리그 관리자만 SELECT (튜닝용) |
| `respond_trade_offer` | 본문을 `_execute_trade_offer(p_offer_id, p_action, p_actor uuid, p_bypass boolean)` 코어로 추출, 기존 함수는 auth 확인 후 코어 호출 (동작 동일) |
| 신규 `ai_respond_trade_offer(p_offer_id, p_action, p_reason_code)` | SECURITY DEFINER, `anon`/`authenticated` EXECUTE 회수, `service_role`만 허용. 받는 팀 `is_ai` 확인, `p_bypass = false` 고정 |
| `create_trade_offer` | AI 대상 허용 조건 = `ai_trade_enabled`. `ai_trade_settings`에서 제한 수치(하루 제안 수 / 동일 패키지 금지)를 `coalesce`+클램프로 읽어 검사, `ai_review_after` = `responseDelayDays` 기준 설정. **임시 관리자 예외 제거** |

에러 코드 신규: `ai_trade_disabled`, `ai_offer_rate_limited`, `ai_offer_duplicate_rejected` → 클라 `mapTradeOfferError`에 추가.

---

## 7. 서버 변경 (Fly)

| 파일 | 내용 |
|---|---|
| `server/src/shared/aiTrade/aiTradeSettings.ts` | 5-2 설정 기본값·범위·`resolveAiTradeSettings()` (클라 미러 쌍) |
| `server/src/shared/aiTrade/aiTradeRules.ts` | 4-1 규칙 객체 + `MULTI_SYSTEMS` (클라 미러 쌍 — 고려 요소 패널용) |
| `server/src/shared/aiTrade/aiTeamState.ts` | 4-2 ② 팀 방향·필요도, GM 프로필 시드 생성 |
| `server/src/shared/aiTrade/aiTradeValue.ts` | 4-2 ③ 요소 레지스트리 |
| `server/src/shared/aiTrade/evaluateAiTradeOffer.ts` | ①~⑤ 조합, 결과 `{ verdict, reasonCode, ratio, threshold, factors }` |
| `server/src/aiTradeResponder.ts` | DB 조회 → 평가 → `ai_respond_trade_offer` 호출 → 로그 저장. 실패 시 다음 tick 재시도, 같은 제안 동시 처리 방지(`status = pending` 조건부 처리는 RPC가 보장) |
| `server/src/scheduler.ts` | tick 안에 `aiTradeResponder.tick()` 추가 |

- `aiTradeSettings.ts`, `aiTradeRules.ts`는 **클라 미러 쌍**(설정 화면·고려 요소 패널용). 나머지(teamState / value / evaluate)는 서버 전용, 클라이언트는 사유 코드 → 문구 매핑만 가진다.
- Docker가 `server/src`만 복사하므로 새 모듈은 반드시 `server/src/shared/` 아래.

## 8. 클라이언트 변경

| 파일 | 내용 |
|---|---|
| `views/multi/season/MultiFrontOfficeView.tsx` | `humanTargetTeams` → `ai_trade_enabled`면 AI 팀 포함. **`isAdmin ||` 임시 조건 제거** |
| 같은 파일 / 수신함 | AI 대상 대기 제안에 "AI 검토 중 · 다음 날 답변", 거절 시 사유 문구 표시 |
| `views/multi/league/LeagueSettingsView.tsx` | 트레이드 탭에 "AI 트레이드" 섹션 신설 (5장 전체). 기존 "트레이드 수락 기준"/"CPU 트레이드 확률" 입력란 제거 (D5) |
| `services/multi/aiTrade/aiTradeSettings.ts`, `aiTradeRules.ts` | 서버 미러 — 기본값·범위·클램프, 고려 요소 패널 계산 |
| `services/multi/leagueService.ts` | `updateLeagueSettings`에 `aiTradeEnabled`, `aiTradeSettings` 파라미터 (`payload.ai_trade_enabled` / `ai_trade_settings`) |
| `services/multi/roomQueries.ts` / `hooks/useLeagueConfig.ts` | 리그 타입에 두 컬럼 추가 |
| `services/multi/tradeService.ts` | `TradeOfferRow`에 `ai_review_after`, `ai_reason_code` 추가, 에러 매핑 3종 |
| 관리자 로그 탭 | (선택) 평가 로그 보기 — 2단계로 미뤄도 됨 |

에러 표시는 정책대로 **InlineNotice 인라인** (액션 실패), 토스트 아님.

---

## 9. 남용 방지

수치는 전부 세션 설정 기본값이며 커미셔너가 조절 가능 (5-2).

| 시나리오 | 대응 |
|---|---|
| 기준선 탐색 (조금씩 바꿔 재전송) | 응답 지연 + 하루 제안 수 + 동일 패키지 재제안 금지 + 사유 공개 수준(상세도 2단계 구간만) + 내용 시드 노이즈 |
| 여러 유저가 AI 팀을 차례로 털기 | 별도 상한 없음 (D9) — 평가에서 탈락하면 성사 안 됨. 모델 빈틈은 평가 로그·운영 지표(4-3)로 찾아 모델을 수정 |
| AI를 경유한 유저 간 선수 세탁 | 대응 없음 (D10) — 유저끼리 직접 트레이드 가능하므로 AI 경유는 각 단계 AI 이득만큼 유저 손해 |
| AI 팀 스타 쏠림 | 가치 곡선·전력 변화 비중으로 억제, 4-3 운영 지표로 감시 |
| 부상 선수 떠넘기기 | `injuryRisk` 요소 (부상 켜진 리그) |
| 연봉 떠넘기기 | `contractEfficiency` 요소 + 샐러리 매칭 하드 규칙 |
| 관리자 우회 | AI 경로는 바이패스 없음 |

---

## 10. 작업 순서

1. **DB 1**: `respond_trade_offer` 코어 추출 (동작 변경 없음) → 기존 유저↔유저 트레이드 수락/거절/취소 회귀 확인
2. **설정 먼저**: `aiTradeSettings.ts`/`aiTradeRules.ts` 미러 쌍 + `leagues` 두 컬럼 + 감사 로그 트리거 + 세션 설정 "AI 트레이드" 섹션(5장, 기존 두 입력란 제거). 이 시점엔 저장만 되고 동작은 없음 — 섹션 상단에 "AI 응답 기능 준비 중" 안내
3. **DB 2**: `league_trade_offers` 컬럼, `ai_respond_trade_offer`, `create_trade_offer` 수정(설정 기반 제한 + 임시 관리자 예외 제거), 평가 로그 테이블
4. **서버 순수 모듈**: teamState → value → evaluate
5. **검증 하네스** (11장) 통과
6. **서버 응답기 + 스케줄러 연결**, Fly 배포 (`flyctl releases`로 배포 버전 확인)
7. **클라이언트**: 대상 팀 목록, 대기·사유 표시, 에러 매핑, 섹션의 "준비 중" 안내 제거
8. 테스트 리그에서 E2E: 제안 → 다음 가상 자정 응답 → 성사 시 로스터 이동·이벤트·다른 제안 invalidated 확인
9. `docs/history/dev-log.md` 기록, `multi-trade-cba-gaps.md`·`plan-index.md` 상태 갱신, 임시 조치 메모 정리

## 11. 검증 계획

테스트 프레임워크가 없으므로 `bun` 스크립트 하네스로 실제 리그 로스터를 읽어 검증한다.

- **토글 매트릭스**: 같은 제안 세트를 {전부 켬, 캡 끔, 부상 끔, 매칭 끔, 데드라인 임박} 조합으로 평가 → 해당 요소만 결과에 영향을 주는지, 꺼진 요소의 사유 코드가 나오지 않는지
- **악용 시나리오 고정 케이스**: 벤치 4명 → 스타 1명 / 부상 스타 떠넘기기 / 고연봉 저OVR 떠넘기기 / 같은 패키지 반복 → 전부 거절
- **공정 거래 수락률**: 양쪽 가치가 ±5% 이내인 무작위 1:1·2:2 제안 수백 건 → '보통' 난이도 수락률이 의도 범위(예: 15~35%)인지
- **설정 반영**: 난이도 프리셋 4단계별 수락률이 단조 감소하는지, 하루 제안 수·동일 패키지 금지의 경계값(0 = 제한 없음 포함)에서 RPC가 정확히 막는지, `resolveAiTradeSettings()`가 범위 밖·누락 값을 기본값/클램프로 처리하는지
- **스타 획득 비용 / 모델↔엔진 괴리** (4-3): OVR 88/91/94 선수 획득에 필요한 패키지 표, 교환 전후 시즌 시뮬로 AI 승수 변화 확인
- **포지션 하드 필터**: C·PG 0명이 되는 거래만 `roster_hole`, SF 1명 남는 거래는 감점만 받는지
- **결정성**: 같은 제안 2회 평가 → 같은 결과
- **방향성**: contend 팀은 즉시 전력 상승 거래를, rebuild 팀은 연봉 정리 거래를 상대적으로 더 수락하는지

## 12. 롤백

- 운영 중 즉시 중단: 세션 설정에서 "AI 트레이드 허용" 끄기 (대기 중인 AI 대상 제안은 다음 tick에 `ai_trade_disabled`로 거절, D7)
- 전체 롤백: 스케줄러에서 `aiTradeResponder.tick()` 제거 후 재배포 → `create_trade_offer`를 이전 정의로 복원 (관리자 임시 예외까지 복원할지는 그때 결정) → 추가 컬럼·테이블은 남겨도 무해
- `respond_trade_offer` 코어 추출은 동작 동일 리팩터라 단독 롤백 불필요, 필요 시 마이그레이션 파일에 남긴 원본 정의로 복원

## 13. 이후 단계

- **2단계**: 역제안 — "이 선수 대신 저 선수를 넣으면 수락"(싱글 `counterGenerator.ts` 참고), 관리자 평가 로그 UI
- **3단계**: AI → 유저 선제안 (유저 트레이드 블록 + `team_trade_requests` 기반)
- **시스템 연동 대기**: 성장·노화(`MULTI_SYSTEMS.growth`), 계약 연차 진행(`contractRollover`), 사치세 징수(`luxuryTaxCharge`)가 생기면 플래그만 켜서 해당 요소 활성화
