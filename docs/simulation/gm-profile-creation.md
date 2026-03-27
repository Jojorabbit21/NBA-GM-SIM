# GM 프로필 생성 시스템

## 개요

신규 사용자가 팀을 선택한 직후, 본격적인 게임 시작 전에 단장(GM) 프로필을 생성하는 2단계 온보딩 시퀀스.

---

## 진입 플로우

```
팀 선택 완료 (기본 모드)
    → /gm-creation     ← 신규 진입점
    → /onboarding      (임명장 화면, 성으로 개인화됨)
    → / (홈)

커스텀 모드 (드래프트): /draft-lottery로 이동 — gm-creation 미진입
기존 사용자 (saves 있음): 세이브 로드 후 바로 홈 — gm-creation 미진입
```

---

## 2단계 위저드 구성

### Step 1 — 기본 정보
- **성(lastName)** : 최대 10자
- **이름(firstName)** : 최대 10자
- **출생 연도(birthYear)** : 1940 ~ 2000 범위 정수
  - 게임 내 연도 기준으로 `birthYear`을 통해 GM 나이 및 경력 계산 가능 (멀티시즌 대비)
- 3개 필드 모두 유효해야 "다음" 버튼 활성화

### Step 2 — GM 성격 선택
- **7종 성격 카드** 그리드 (2열)
- 각 카드에 성격명, 한 줄 설명, 슬라이더 5개 미리보기 표시
- `GM_SLIDER_PRESETS[type]`으로 슬라이더 값을 자동 결정 (사용자가 직접 조정 불가)
- 성격 선택 후 "단장 취임" 버튼 활성화

#### 성격별 설명
| 성격 타입 | 레이블 | 설명 |
|---|---|---|
| `balanced` | 균형형 | 팀 전력과 미래를 균형 있게 운영 |
| `winNow` | 우승지향 | 현재 우승을 위해 모든 것을 올인 |
| `rebuilder` | 리빌더 | 장기적 재건을 통한 강팀 구축 |
| `starHunter` | 스타 사냥꾼 | 슈퍼스타 영입으로 팀 전력 극대화 |
| `valueTrader` | 가성비 추구 | 가성비 선수 발굴로 효율 추구 |
| `defenseFocused` | 수비 중시 | 탄탄한 수비 조직을 바탕으로 승부 |
| `youthMovement` | 유스 무브먼트 | 젊은 선수 육성으로 미래를 향해 |

---

## 데이터 저장

"단장 취임" 버튼 클릭 시 3가지 저장 작업이 순서대로 실행됨.

### 1. `profiles` 테이블 (Supabase)

```sql
-- 추가된 컬럼 (migration: add_gm_profile_fields_to_profiles)
ALTER TABLE profiles
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name  TEXT,
  ADD COLUMN birth_year INTEGER;
```

upsert 대상: `{ id, email, first_name, last_name, birth_year }`

### 2. `leagueGMProfiles` React 상태

유저 팀의 `GMProfile`을 생성하여 기존 프로필 맵에 병합:

```ts
const userGMProfile: GMProfile = {
    teamId: myTeamId,
    name: `${lastName} ${firstName}`,   // "홍 길동"
    firstName, lastName, birthYear,      // 유저 GM 전용 필드
    personalityType,
    sliders: GM_SLIDER_PRESETS[personalityType],  // 성격에서 자동 결정
    direction: 'standPat',              // 초기 방향은 관망
};
leagueGMProfiles[myTeamId] = userGMProfile;
```

### 3. `saves.league_gm_profiles` (Supabase)

`gameData.forceSave({ leagueGMProfiles: updatedProfiles })`로 JSONB 컬럼에 영속화.

---

## GMProfile 타입 변경

`types/gm.ts`의 `GMProfile`에 유저 GM 전용 선택 필드 추가:

```ts
export interface GMProfile {
    teamId: string;
    name: string;
    personalityType: GMPersonalityType;
    sliders: GMSliders;
    direction: TeamDirection;
    directionSetDate?: string;
    // 유저 GM 전용 (선택)
    firstName?: string;
    lastName?: string;
    birthYear?: number;
}
```

CPU GM은 이 필드들이 `undefined`이므로 기존 동작에 영향 없음.

---

## 사이드바 표시

`ProtectedLayout.tsx`에서 유저 GM 이름을 계산하여 사이드바에 전달:

```ts
const userGMProfile = gameData.leagueGMProfiles?.[gameData.myTeamId ?? ''];
const gmDisplayName = userGMProfile?.firstName && userGMProfile?.lastName
    ? `${userGMProfile.lastName} ${userGMProfile.firstName}`   // "홍 길동"
    : undefined;
```

- `gmDisplayName` 있으면 → 사이드바 아이콘 레이블 및 드롭다운에 GM 이름 표시
- 없으면(기존 사용자) → 기존처럼 이메일 표시 (하위 호환)

드롭다운 계정 영역: 레이블을 "계정" → "단장"으로 변경, GM 이름 표시 + 이메일 보조 표시.

---

## OnboardingView 개인화

임명장 화면의 인사말에 성(lastName) 반영:

```
gmLastName 있음: "홍 단장님께,"
gmLastName 없음: "신임 단장님께,"   (기존 사용자 폴백)
```

`OnboardingPage.tsx`에서 `leagueGMProfiles[myTeamId]?.lastName`을 `OnboardingView`로 전달.

---

## 관련 파일

| 파일 | 역할 |
|---|---|
| `views/GMCreationView.tsx` | 2단계 위저드 UI 컴포넌트 |
| `pages/GMCreationPage.tsx` | 라우트 래퍼 + profiles/saves 저장 로직 |
| `pages/TeamSelectPage.tsx` | 팀 선택 후 `/gm-creation`으로 navigate |
| `App.tsx` | `/gm-creation` 라우트 등록 |
| `types/gm.ts` | `GMProfile`에 firstName/lastName/birthYear 추가 |
| `components/Sidebar.tsx` | `gmDisplayName` prop 수신 및 표시 |
| `components/MainLayout.tsx` | `sidebarProps.gmDisplayName` 전달 |
| `components/ProtectedLayout.tsx` | gmDisplayName 계산 및 sidebarProps 주입 |
| `views/OnboardingView.tsx` | `gmLastName` prop으로 인사말 개인화 |
| `pages/OnboardingPage.tsx` | gmLastName 추출 및 전달 |

---

## 기존 사용자 호환성

| 상황 | 동작 |
|---|---|
| saves 있는 기존 사용자 | 세이브 로드 후 홈 진입 — gm-creation 미진입 |
| `profiles.first_name` 없음 | `gmDisplayName = undefined` → 이메일 표시 |
| `league_gm_profiles`에 myTeamId 없음 | GMDetailView 기존 "성향 미표시" 분기 유지 |

---

## 멀티시즌 확장 계획

`birthYear` 필드를 통해 시즌 전환 시 GM 나이 계산 가능:

```ts
// 예시: 시즌 연도 기준 GM 나이
const gmAge = currentSeasonYear - gmProfile.birthYear;
```

미래 GM 은퇴 시스템, 경력 연차 표시, 명예의 전당 자격 조건 등에 활용 가능.
