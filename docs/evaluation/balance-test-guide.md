# 클로즈드 베타 밸런싱 운영 가이드

> **대상**: 운영자 (개발자 본인)
> **규모**: 5~10명 테스터 × 2~4주
> **목표**: 36개 선수 능력치 전부를 정성(체감) + 정량(리그 통계 분포) 두 축으로 밸런싱
> **전제 문서**: [Skill Rubric](./skill-rubric.md) · [Rating Tuning](./rating-tuning.md) · [OVR Engine](./ovr-engine.md)

---

## 1. Context — 왜 이 작업이 필요한가

### 배경
OVR 엔진 v2와 `scripts/ratings/` 하위 30여 개의 `fix-*.mjs` 튜닝 도구가 갖춰졌지만, 이 튜닝들은 **개발자 1인의 관찰과 통계 비교**로만 검증되어 왔다. `skill-rubric.md`가 37개 능력치 × 6구간 × 3계층으로 "능력치 X일 때 엔진이 어떻게 반응해야 하는가"의 명세서 역할을 하지만, 실제 엔진 거동이 이 명세에 부합하는지 **외부 관찰자 관점에서 검증된 적이 없다**.

### 목표
1. **Skill Rubric 명세 위반 지점 식별** — 능력치 구간별로 의도된 플레이/스탯 범위에서 벗어나는 능력치 탐지
2. **정량 이상치 트리거 확보** — 리그 전체 스탯 분포를 실제 리그와 대조해 큰 갭 탐지
3. **정성 체감 이슈 수집** — "90+ 능력치 선수가 엘리트로 안 느껴진다" 같은 주관적 피드백을 구조화해 수집
4. **튜닝 우선순위 확정** — 다음 튜닝 사이클에 어떤 `fix-*.mjs`를 어떤 방향으로 돌릴지 근거 자료 축적

### Non-Goals
- 통계적 유의성 확보 (표본 5~10명으로는 불가능)
- OVR 엔진 구조 자체 변경 (커브/베이스 능력치 조정에 한정. `utils/ovrEngine.ts` 로직 수정 금지)
- 대규모 UI 신규 개발 (리그 평균 뷰, 멀티 슬롯 등)

---

## 2. 테스트 라운드 분할 전략

36개 능력치를 한 번에 검증 요청하면 테스터 인지 과부하로 피드백이 피상적이 된다. **3라운드로 분할**해 카테고리를 집중한다.

### 라운드 구성

| 라운드 | 기간 | 타깃 능력치 | 핵심 질문 |
|--------|------|-------------|-----------|
| **R1 — 스코어링** | 1주 | close / mid / 3c / 3_45 / 3t / ft / lay / dnk / post / draw / hands / handle (~12개) | "슈퍼스코어러가 스코어러답게 느껴지는가? 리그 득점/슈팅 분포가 정상인가?" |
| **R2 — 수비·피지컬** | 1주 | idef / pdef / hdef / stl / blk / dcon / dreb + spd / agi / str / vert / sta / dur (~13개) | "수비 특화 선수가 실제로 상대 FG%를 깎는가? 피지컬 괴물이 체감되는가?" |
| **R3 — IQ·플레이메이킹** | 1~2주 | pacc / pvis / pper / ocon / siq / piq + intangibles 등 (~10~12개) | "엘리트 패서가 팀 오펜스 흐름을 바꾸는가? IQ 낮은 선수의 실수가 체감되는가?" |

### 순서 근거
- **스코어링 먼저**: `flowEngine.ts`의 `calculateHitRate()`가 가장 많이 호출되는 경로라 이상치가 가장 눈에 띈다. `constants.ts`의 `*_OFF_CURVE` 튜닝 노브도 잘 정리되어 있어 반복 수정이 빠르다.
- **수비/피지컬 중간**: 스코어링이 먼저 잡혀 있어야 "수비가 약한 건지 상대 공격이 강한 건지" 혼동이 줄어든다.
- **IQ/플레이메이킹 마지막**: 정성 피드백 의존도가 가장 높고, 앞 라운드 튜닝 결과 위에서 판단해야 의미가 있다.

### 라운드당 테스터 태스크
- 자유 시즌 1개 완주 (82경기, 자동 시뮬 허용)
- 해당 라운드 카테고리의 **상위 능력치 선수 3명 + 하위 능력치 선수 3명 지정 관찰** (운영자가 사전 선정해 배포)
- 라운드 마지막 2일: 정성 평가 폼 작성 + 인터뷰 30분

---

## 3. 테스터 모집 및 온보딩

### 모집 규모 및 프로필

**총 7명 권장** (중도 이탈 1~2명 고려)

| 프로필 | 인원 | 역할 |
|--------|------|------|
| 헤비유저 (기존 버전 경험자) | 3~4명 | Skill Rubric 이해, 구체적 이상치 식별. 정량 피드백 주 공급원 |
| 농구 팬 (게임 첫 경험) | 2~3명 | 실제 선수 플레이 스타일 앎. "이 선수답게 느껴지는가" 정성 판단 주 공급원 |
| 일반 게이머 | 1~2명 | 게임 밸런스 이상 탐지 (특정 전략이 항상 이긴다 등) |

**피해야 할 프로필**: 개발자와 너무 가까워 비판을 꺼리는 사람. 바이어스 방지.

### 온보딩 키트 (테스터 배포용)
1. **접속 가이드** (1페이지) — 베타 URL, 발급된 계정 정보, 지원 브라우저, 문의 연락처
2. **게임 룰 요약** (1페이지) — 시즌/플레이오프 흐름, 전술 시스템, 능력치 개요
3. **라운드별 관찰 선수 리스트** — 라운드 시작 시 별도 배포
4. **피드백 제출 방법** — 인게임 피드백 버튼(우하단) + 키보드 단축키(Ctrl/Cmd+Shift+B), Google Form 링크

### 킥오프 세션
- Zoom/Discord 30분: 목표 설명, 피드백 시스템 시범, Q&A
- 전용 Discord/Slack 채널 1개 — 긴급 이슈 실시간 보고용

---

## 4. 테스트 환경 셋업

### 4.1 베타 서버 개설 (Supabase 신규 프로젝트)

> **왜 별도 프로젝트**: 베타에서 능력치를 튜닝해도 프로덕션 유저에게 즉시 영향이 가지 않도록.
> Supabase Free tier는 동시 활성 프로젝트 2개까지 무료 — prod + beta = 딱 맞음.

#### Step 1: Supabase 프로젝트 생성 (10분)
1. https://supabase.com 로그인 → 기존 조직 선택 → **"New project"**
2. 입력:
   - **Name**: `nba-gm-sim-beta`
   - **Database Password**: 강력한 비밀번호 생성 (분실 시 복구 불가 — 1Password 등 저장 필수)
   - **Region**: `Asia Pacific (Mumbai) ap-south-1` ← prod와 동일 region
   - **Plan**: `Free`
3. 생성 후 다음 정보 메모:
   - Project Ref (URL에서 `https://<ref>.supabase.co`의 `<ref>`)
   - **Settings → API → `anon public` key** (클라이언트 빌드용)
   - **Settings → API → `service_role` key** (서버 스크립트용, 빌드에 절대 포함 금지)
   - **Settings → Database → Connection string** (psql용)

#### Step 2: 스키마 복제 (30~60분)

**옵션 A — Supabase CLI (권장)**
```bash
# CLI 설치
brew install supabase/tap/supabase

# prod에 link
supabase link --project-ref buummihpewiaeltywdff

# 스키마 dump (data 제외)
supabase db dump --schema public --schema-only > /tmp/prod_schema.sql
supabase db dump --schema public --role-only   > /tmp/prod_rls.sql

# 베타 프로젝트로 전환
supabase link --project-ref <beta-ref>

# 베타에 적용
psql "$BETA_DATABASE_URL" -f /tmp/prod_schema.sql
psql "$BETA_DATABASE_URL" -f /tmp/prod_rls.sql
```

**옵션 B — Studio 수동 (CLI 없을 때)**
1. prod Studio → Database → Tables → 각 테이블 우클릭 → "Definition" 복사
2. 베타 Studio → SQL Editor → 붙여넣기 → Run
3. 적용 순서 (FK 의존성):
   - `profiles`
   - `meta_players`, `meta_schedule`, `meta_coaches`, `meta_gms`
   - `saves`, `user_game_results`, `user_playoffs_results`
   - `user_transactions`, `user_season_history`, `user_messages`
   - `hall_of_fame`
4. Studio → Authentication → Policies에서 각 RLS 정책 동일하게 복제

옵션 B 사용 시에만 추가 마이그레이션 적용:
- `migrations/multi_season_foundation.sql`
- `migrations/add_quarter_scores.sql`
- `migrations/add_hof_id.sql`
- "already exists" 에러는 무시 가능 (스키마 dump에 포함된 것)

#### Step 3: 메타 데이터 복제 (30~60분)

```bash
# prod meta_players 다운로드 (.env가 prod를 가리키는 상태)
node scripts/ratings/download-meta.mjs
# → scripts/data/meta_players.csv 생성 (445행)

# meta_schedule / meta_coaches / meta_gms는 Studio에서:
# Table Editor → 해당 테이블 → "Export to CSV"
```

베타 Studio → Table Editor → 각 테이블 → "Insert" → "Import data from CSV" → 위 CSV 업로드

**검증 SQL** (베타 SQL Editor에서 행 수 일치 확인):
```sql
SELECT 'meta_players'  AS tbl, COUNT(*) FROM meta_players
UNION ALL
SELECT 'meta_schedule', COUNT(*) FROM meta_schedule
UNION ALL
SELECT 'meta_coaches',  COUNT(*) FROM meta_coaches
UNION ALL
SELECT 'meta_gms',      COUNT(*) FROM meta_gms;
```

#### Step 4: Auth 설정 — 회원가입 차단 (5분)
1. 베타 Studio → **Authentication → Settings**
2. **"Allow new users to sign up" 체크 해제** → Save
3. "Enable email confirmations" → 끄기 (테스터 인증 절차 생략)
4. "Site URL" → `https://beta.basketballgm.app`
5. "Redirect URLs" → `https://beta.basketballgm.app/**` 추가

#### Step 5: 테스터 계정 발급 (15분)
1. 베타 Studio → Authentication → Users → **"Add user" → "Create new user"**
2. 각 테스터 정보 입력:
   - Email: `tester01@beta.basketballgm.app` (또는 실제 이메일)
   - Password: 임시 비밀번호 (1Password로 생성)
   - "Auto Confirm User" 체크 (인증 메일 생략)
3. 5~10번 반복
4. 발급 결과를 별도 시트에 정리: 테스터명 / 이메일 / 임시 비밀번호 / 비밀번호 변경 여부
5. 계정 정보는 **1:1 DM/이메일로만 전달** — 단체 채널 게시 절대 금지

#### Step 6: 격리 검증 (10분)
```sql
-- 베타 Studio에서 임의 능력치를 99로 변경
UPDATE meta_players
SET base_attributes = jsonb_set(base_attributes, '{3t}', '99')
WHERE id = '<테스트용-player-id>';
```
→ prod Studio에서 같은 선수 조회 → 변경 안 됨 확인 → 롤백

> ⚠️ **Supabase Free tier 주의**: 1주일 미사용 시 자동 일시정지. 베타 기간 중 매일 1회 이상 Studio 접속 필요.

---

### 4.2 베타 빌드 설정

#### .env.beta 작성 (gitignore에 추가, 로컬에만 보관)
```
REACT_APP_SUPABASE_URL=https://<beta-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<beta-anon-key>
VITE_BETA_MODE=true
VITE_FORCE_TEST_SEED=beta-2026-r1
```

#### package.json에 스크립트 추가
```json
"scripts": {
  "build:beta": "vite build --mode beta",
  "dev:beta":   "vite --mode beta"
}
```

#### .gitignore에 추가
```
.env.beta
```

---

### 4.3 도메인 + Vercel 배포 설정

#### Step 1: DNS CNAME 추가 (10분 + 전파 대기)
도메인 등록처(Cloudflare/Namecheap 등) DNS 관리 페이지에서:
- **Type**: CNAME
- **Name**: `beta`
- **Value**: `cname.vercel-dns.com`
- **TTL**: Auto
- Cloudflare 사용 시 **"DNS only"** (회색 구름) — Vercel SSL을 위해 Proxy off

검증: `dig beta.basketballgm.app` → `cname.vercel-dns.com` 응답 확인

#### Step 2: vercel.json 리다이렉트 예외 (5분)
현재 규칙이 `beta.basketballgm.app`도 prod로 리다이렉트하므로 수정:
```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [
        {
          "type": "host",
          "value": "(?!basketballgm\\.app$)(?!beta\\.basketballgm\\.app$).*"
        }
      ],
      "destination": "https://basketballgm.app/$1",
      "permanent": true
    }
  ],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Step 3: git beta 브랜치 + Vercel 도메인 매핑 (15분)
```bash
git checkout -b beta
git push origin beta
```
1. Vercel 대시보드 → 프로젝트 → **Settings → Domains**
2. "Add Domain" → `beta.basketballgm.app` → "Add"
3. DNS 검증 후 도메인 "Edit" → **Git Branch → `beta`** → Save

이제 `beta` 브랜치 push → 자동으로 `beta.basketballgm.app` 배포

#### Step 4: Vercel 환경변수 분리 (15분)
Settings → Environment Variables에서 다음을 **Preview 환경 + Branch=beta**로만 추가:

| Variable | Value | Environment | Branch |
|----------|-------|-------------|--------|
| `REACT_APP_SUPABASE_URL` | `https://<beta-ref>.supabase.co` | Preview | beta |
| `REACT_APP_SUPABASE_ANON_KEY` | `<beta-anon-key>` | Preview | beta |
| `VITE_BETA_MODE` | `true` | Preview | beta |
| `VITE_FORCE_TEST_SEED` | `beta-2026-r1` | Preview | beta |

> ⚠️ **Production 환경에는 절대 추가 금지** — prod는 기존 값 유지

#### Step 5: 첫 베타 배포 검증
`git push origin beta` 후 `https://beta.basketballgm.app` 접속하여 확인:
- [ ] 회원가입 탭/버튼 안 보이고 안내 배너 표시
- [ ] DevTools Network → Supabase 호출이 `<beta-ref>.supabase.co`인지
- [ ] 우하단에 베타 피드백 플로팅 버튼 노출
- [ ] 발급한 임시 계정으로 로그인 성공
- [ ] 새 게임 시작 → `saves.tendency_seed` = `beta-2026-r1` 확인

---

### 4.4 텐던시 시드 고정

`hooks/useGameData.ts` 팀 선택 시점의 `crypto.randomUUID()` 호출을 환경변수 분기로 교체:
- `VITE_FORCE_TEST_SEED`가 설정되어 있으면 해당 값을 시드로 사용
- 미설정 시 기존 동작(랜덤 UUID) 유지 → prod에는 영향 없음
- 라운드마다 Vercel 환경변수의 `VITE_FORCE_TEST_SEED`를 `beta-2026-r2` → `r3`으로 변경 후 재배포

> ⚠️ **시드 고정 한계**: 선수 성향/코치/드래프트만 결정론적. PBP 엔진의 `Math.random()` 직접 호출(31곳)은 그대로이므로 **경기 결과 자체는 비결정론**. 테스터 간 "같은 경기"를 공유하는 것은 불가능하며 대량 집계(평균값)에 의존해야 함.

---

### 4.5 인게임 리포트 시스템

시뮬레이션 도중 어디서든 1초 안에 리포트가 가능하도록:

**진입점 3가지**:
1. **우하단 플로팅 버튼** (`BetaFeedbackButton.tsx`) — 모든 페이지에서 고정 노출
2. **키보드 단축키** (`Ctrl+Shift+B` / Mac: `Cmd+Shift+B`)
3. 사이드바 메뉴 하단 항목

**리포트 폼 필드**:
- 카테고리: `rating`(능력치 이상) / `engine`(엔진 동작) / `balance`(전반 밸런스) / `ui`(UI 버그) / `other`
- 심각도: 1~5점
- 자유 코멘트 (10자 이상)
- "현재 상태 자동 첨부" 체크박스 (default on)

**자동 첨부 컨텍스트**:
- `sim_date` · `tendency_seed` · `current_view` · `focused_player_id` · `last_game_id` · `team_id` · `snapshot_version` · `round_tag` · `user_agent`

**저장 위치**: 베타 Supabase의 `feedback` 테이블 (아래 부록 B 참조)

---

### 4.6 회원가입 이중 가드

- **서버 측**: Supabase 베타 프로젝트 Auth에서 signup 비활성화 (Step 4 참조)
- **클라이언트 측**: `VITE_BETA_MODE=true`일 때 `AuthView.tsx`에서 회원가입 UI 숨김 + 안내 배너 표시
- 이중 가드로 API 직접 호출 우회 방지

---

## 5. 데이터 수집 방법

### 자동 수집 (추가 작업 없음)
| 데이터 | 저장 위치 | 용도 |
|--------|-----------|------|
| Box score, PBP logs, 샷 이벤트, 로테이션 | `user_game_results` JSONB | 라운드 종료 후 스탯 집계, 능력치 vs 실제 퍼포먼스 교차 분석 |
| 시즌 스냅샷 (player_stats, player_overrides) | `user_season_history` | 시즌 단위 집계, 커리어 추적 |
| 인게임 리포트 | `feedback` 테이블 | 정성 이슈 raw 데이터 |

### 수동 수집

#### 라운드 종료 정성 평가 폼 (Google Form 권장)
각 라운드마다 별도 폼 생성, 라운드 끝 2일 전 배포:

```
[라운드 정보]
- 라운드 번호: R1 / R2 / R3
- 플레이한 시즌 수:
- 총 플레이 시간 (시간):

[관찰 선수별 평가 — 3명]
선수명: ___
1. 이 선수가 "이 선수답게" 느껴졌나요? (1=전혀, 5=매우)
2. 어떤 플레이가 어색했나요? (자유 서술)
3. 어떤 능력치가 과대/과소평가된 것 같나요?

[카테고리 전반 평가]
1. 최상위 선수가 엘리트답게 느껴졌나요? (1-5)
2. 상위/하위 선수 간 체감 차이가 뚜렷한가요? (1-5)
3. 리그 전체 스탯 분포가 실제 리그와 비슷해 보이나요? (1-5)
4. 가장 이상하다고 느낀 순간 3가지 (자유 서술)

[열린 질문]
- 이 라운드에서 가장 재미있었던 플레이
- 가장 답답했던 플레이
```

#### 중간/종료 인터뷰
- 각 라운드 끝에 테스터 2~3명과 30분 1:1 인터뷰
- 폼에 쓰지 못한 디테일, "예를 들어 어떤 경기?" 추적 질문
- 메모는 `docs/evaluation/beta-notes/round<N>-interviews.md`에 비공개 저장

---

## 6. 밸런스 판단 기준

### 원칙: 정성 우선, 정량은 이상치 트리거

5~10명 표본에서 정량 지표는 통계적 유의성이 없다. "정량에서 실제 리그와 크게 벗어나는 지표 → 해당 영역의 정성 피드백을 집중적으로 읽는다"는 흐름으로 사용.

### 정량 기준 — 리그 평균 참조값 (허용 ±10%)

| 지표 | 리그 평균 | 허용 구간 | 산출 방식 |
|------|----------|-----------|-----------|
| 팀 PPG | 114 | 108~120 | `user_game_results.box_score` 집계 |
| eFG% | 54.5% | 51~58% | 선수 스탯 집계 |
| 3PT% (리그) | 36.5% | 34~39% | box_score 집계 |
| FT% (리그) | 78% | 75~81% | box_score 집계 |
| TOV/G | 13.8 | 12~16 | box_score 집계 |
| AST/G | 27 | 24~30 | box_score 집계 |
| USG% 표준편차 | ~7 | ~5~9 | 주전 5명의 USG% 분포 |

### Skill Rubric 명세 위반 탐지
`skill-rubric.md`에 각 능력치 구간별로 예상 스탯 범위가 정의되어 있다. 라운드 종료 후:
- **각 능력치 상위 10% 선수의 실제 스탯이 Rubric의 Tier1/Tier2 범위에 들어오는가?**
  - 예: `threeCorner` 상위 10% 선수의 3P% 평균이 Rubric 명세 범위인지
  - 벗어나면 이상치 플래그
- **하위 구간도 동일하게 체크**

### 정성 피드백 라벨링 (운영자가 수동)

| 라벨 | 의미 | 액션 |
|------|------|------|
| **Blocker** | 게임 재미 자체를 깨는 수준 (예: 3PT 90+인데 30% 찍힘) | 즉시 튜닝, 다음 라운드 전 패치 |
| **Major** | 체감 차이는 크지만 플레이는 가능 | 해당 라운드 튜닝 목록에 포함 |
| **Minor** | "살짝 이상" 수준 | 기록만, 베타 종료 후 일괄 판단 |
| **Signal** | 단발성 개인 의견, 다른 테스터와 불일치 | 기록 후 교차 확인용 보관 |

**복수 동의 규칙**: 동일 능력치/선수에 **2명 이상 Major** 지적 → 자동으로 튜닝 우선순위 P0로 승격.

### 판정 매트릭스 (라운드 종료 시 운영자 작성)

| 능력치 | 정량 이상? | Major+ 수 | 최종 판정 | 우선순위 |
|--------|-----------|-----------|-----------|----------|
| threeCorner | Y | 3 | Fix | P0 |
| midRange | N | 1 | Watch | P2 |
| ... | | | | |

---

## 7. 튜닝 사이클

### 타임라인 (3주 기본)
```
D-3 ~ D-1 : 인프라 보강 (베타 Supabase + Vercel + 코드)
D+0        : 킥오프, R1 배포 (seed: beta-2026-r1)
D+6        : R1 종료 (정성 폼 마감)
D+7        : 튜닝 사이클 → R2 배포 (seed: beta-2026-r2)
D+13       : R2 종료
D+14       : 튜닝 사이클 → R3 배포 (seed: beta-2026-r3)
D+20       : R3 종료
D+21       : 최종 인터뷰 + 결과 정리
```

### 라운드 종료 후 튜닝 사이클 (D+7, D+14, ~1일)

**Step 1 — 데이터 수집 (2~3시간)**
```bash
# 베타 DB에서 user_game_results dump (스크립트 필요 — 아래 8장 참조)
node scripts/ratings/analyze-rounds.mjs --round R1 --category shooting

# 해당 라운드 카테고리의 기존 분석 스크립트
node scripts/ratings/analyze-3pt.mjs
node scripts/ratings/analyze-siq.mjs
```
- feedback 테이블 → Supabase Studio에서 CSV Export
- Google Form CSV 다운로드

**Step 2 — 판정 매트릭스 작성 (3~4시간)**
- 정량 이상치 + 정성 Major+ 수 결합
- P0 (Fix) 라벨만 이번 사이클에서 처리 — P1/P2는 다음 라운드 이후

**Step 3 — 튜닝 실행 (오후)**

| 문제 유형 | 사용 도구 | 영향 범위 |
|-----------|-----------|-----------|
| 특정 능력치 베이스값이 리그 전반에서 높/낮음 | `scripts/ratings/fix-<ability>.mjs` | meta_players 베이스 — **기존 save 자동 호환** |
| 슛 커브가 잘못됨 (상/하위가 덜 벌어짐) | `services/game/engine/pbp/constants.ts:30-88`의 `SHOOTING_*_OFF_CURVE` 수정 | 재빌드로 즉시 반영, **save 자동 호환** |
| OBM/Box 밸런스 | `scripts/ratings/balance-obm-box.mjs` | meta_players — **save 자동 호환** |
| OVR 엔진 가중치 | **이번 베타 스코프 아웃** | 모든 save의 displayOVR 즉시 변화 |

**Step 4 — 호환성 스모크 테스트**
- 베이스 능력치만 변경 시: 기존 save 로드 → crash 없음, displayOVR 점프 합리적 범위
- `services/snapshotBuilder.ts`의 `CURRENT_SNAPSHOT_VERSION` 건드리지 않음 (이번 베타 금지)

**Step 5 — 재배포**
- 라운드별 `VITE_FORCE_TEST_SEED` 갱신 (`beta-2026-r1` → `r2` → `r3`) → Vercel 환경변수 수정 → `git push origin beta`
- 테스터 공지: "R2 시작. 이번에 바뀐 것: threeCorner +2, midRange curve steepened"

**Step 6 — 라운드 리포트 저장**
- `docs/evaluation/beta-notes/round<N>-report.md` 작성 (판정 매트릭스 + 튜닝 결정 + 다음 라운드 공지)

---

## 8. 수집 데이터 분석 워크플로우

### 신규 스크립트: `scripts/ratings/analyze-rounds.mjs`

기존 `analyze-*.mjs` 6개는 meta_players 데이터만 분석하고 실제 플레이 결과와 결합하지 않는다. 이 갭을 메우는 스크립트.

**역할**: 베타 기간 `user_game_results`를 풀링해 능력치 vs 실제 스탯 교차 분석

**입력**: `--round R1|R2|R3`, `--category shooting|defense|playmaking`

**출력**:
- 카테고리 능력치 vs 실제 스탯 산점도용 CSV
- 능력치 → 실제 스탯 회귀 기울기 + R²
- 리그 평균 참조값 표 (6장 표 자동 생성)
- Skill Rubric 위반 선수 상위 10명

**흐름**:
1. 베타 Supabase에서 `user_game_results` 페이지네이션 pull
2. box_score → player_id별 집계 → FG%, 3P%, USG%, TS% 계산 (`useLeaderboardData.ts:275-384` 동일 공식)
3. `meta_players` 능력치 조인
4. 6구간(Skill Rubric)별 실제 스탯 중앙값/분포 출력
5. Rubric 참조값 범위 이탈 선수 `VIOLATION` 태그

### 선택 스크립트: `scripts/ratings/collect-feedback.mjs`
feedback 테이블 dump + 카테고리/severity/선수ID별 group count CSV 출력

---

## 9. 종료 및 성공 조건

### 성공 KPI (3개 모두 달성 시 종료)
1. **커버리지**: 36개 능력치 중 **30개 이상** 판정 완료 (Fix 완료 / Watch / OK)
2. **Blocker 0**: 최종 라운드 기준 Blocker 라벨 0건
3. **정량 수렴**: 6장 참조값 표에서 허용 구간 이탈 지표 **≤ 2개**

### 모니터링 KPI (참고용)
- 테스터 완주율 ≥ 70% (7명 중 5명이 R3까지 참여)
- 총 인게임 리포트 수 ≥ 50건
- 정성 폼 제출률 라운드당 ≥ 80%

### 종료 산출물
- `docs/evaluation/beta-notes/final-report.md`: 전체 요약 + 수정된 능력치 리스트 + 다음 튜닝 사이클 백로그
- 미해결 이슈: GitHub Issue로 이관 (라벨: `balance`, `beta-followup`)
- 베타 → 프로덕션 머지: 아래 부록 D 참조

---

## 10. 리스크와 한계

| 리스크 | 완화 방법 |
|--------|-----------|
| **통계적 한계** (5~10명 × 82경기 ≈ 410~820경기) | 정량은 이상치 트리거로만 사용. 최종 판정은 정성 + Rubric 교차 검증 |
| **PBP 엔진 비결정론** (Math.random() 31곳) | "같은 경기 재현" 포기. 대신 대량 집계 평균값에 의존 |
| **헤비유저 편향** (기존 감각이 기준) | 판정 매트릭스에 "어떤 프로필이 제기했는가" 메타데이터 기록 |
| **짧은 기간** (라운드당 1주 빠듯) | 자동 시뮬 적극 활용. 불가피하면 4주 옵션 선택 |
| **인게임 리포트 마찰** | 플로팅 버튼 상시 노출 + 키보드 단축키로 마찰 최소화 |
| **OVR 엔진 수정 시 save 영향** | 이번 베타에서는 OVR 엔진 로직 변경 금지. 커브/베이스만 조정 |
| **R1 튜닝이 R2 평가 오염** | 라운드 간 튜닝은 "그 라운드의 Blocker만" 제한. 튜닝 로그 테스터에게 공개 |

---

## 부록 A: 운영자 체크리스트

### 베타 시작 전 (D-3 ~ D-1)
- [ ] 베타 Supabase 프로젝트 생성 + 스키마 복제
- [ ] meta_* 시드 데이터 복제 + 행 수 검증
- [ ] Auth 설정: signup 비활성화
- [ ] 테스터 계정 5~10개 발급
- [ ] `.env.beta` 작성 + `.gitignore` 추가
- [ ] `package.json` `build:beta` 스크립트 추가
- [ ] `vercel.json` 리다이렉트 예외 수정
- [ ] git beta 브랜치 생성 + Vercel 도메인 매핑
- [ ] Vercel 환경변수 분리 설정
- [ ] `feedback` 테이블 SQL 베타 프로젝트에 적용
- [ ] 코드 변경 (FeedbackModal, BetaFeedbackButton, AuthView, useGameData seed 분기) commit → `beta` 브랜치 push
- [ ] 첫 베타 배포 6항목 검증
- [ ] 테스터 계정 정보 1:1 전달
- [ ] 온보딩 키트 배포
- [ ] R1 관찰 선수 리스트 작성
- [ ] Google Form R1용 생성
- [ ] 킥오프 세션 일정 잡기

### 라운드 진행 중 (D+0 ~ D+6)
- [ ] D+0: 배포 공지, 킥오프 세션
- [ ] D+2, D+4: 참여율 체크, 미응답 테스터 리마인드
- [ ] D+6: 폼 마감 24시간 전 리마인드

### 라운드 종료 후 (D+7)
- [ ] `analyze-rounds.mjs` 실행
- [ ] 해당 카테고리 `analyze-*.mjs` 실행
- [ ] feedback 테이블 CSV export + 정성 폼 CSV 결합
- [ ] 판정 매트릭스 작성 (P0만 튜닝)
- [ ] `fix-*.mjs` 실행 + `constants.ts` 커브 조정
- [ ] 호환성 스모크 테스트
- [ ] 다음 라운드 빌드 재배포 (seed 갱신)
- [ ] `docs/evaluation/beta-notes/round<N>-report.md` 커밋

### 베타 종료 시 (D+21)
- [ ] 최종 인터뷰 2~3명
- [ ] `final-report.md` 작성
- [ ] 미해결 이슈 GitHub Issue 이관
- [ ] 베타 → prod 머지 절차 실행 (부록 D)
- [ ] 베타 전용 코드 `VITE_BETA_MODE` 게이팅으로 prod에서 비활성화 확인

---

## 부록 B: Feedback 테이블 SQL

베타 Supabase 프로젝트 Studio → SQL Editor에서 실행:

```sql
CREATE TABLE feedback (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  category    TEXT NOT NULL CHECK (category IN ('rating','engine','balance','ui','other')),
  severity    SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  comment     TEXT NOT NULL,
  context     JSONB NOT NULL DEFAULT '{}'::jsonb,
  round_tag   TEXT  -- 'R1' / 'R2' / 'R3' (VITE_FORCE_TEST_SEED 값에서 추출)
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- 테스터는 본인 데이터만 INSERT 가능
CREATE POLICY feedback_insert_own ON feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- SELECT는 service_role만 (Supabase Studio 직접 조회)
```

`context` JSONB 예시:
```json
{
  "sim_date": "2026-01-15",
  "tendency_seed": "beta-2026-r1",
  "current_view": "/leaderboard",
  "focused_player_id": "player-123",
  "last_game_id": "game-456",
  "team_id": "LAL",
  "snapshot_version": 4,
  "user_agent": "Mozilla/5.0 ..."
}
```

---

## 부록 C: 핵심 파일 참조

| 역할 | 파일 |
|------|------|
| 능력치 평가 기준 (판정의 원천) | `docs/evaluation/skill-rubric.md` |
| OVR 계산 엔진 | `utils/ovrEngine.ts`, `utils/ovrUtils.ts` |
| 능력치 → Hit Rate 매핑 단일 진입점 | `services/game/engine/pbp/flowEngine.ts:46-400` |
| 슛 커브 튜닝 노브 | `services/game/engine/pbp/constants.ts:30-88` |
| 능력치별 fix 스크립트 | `scripts/ratings/fix-*.mjs` × 30+ |
| Advanced Stats 계산 | `hooks/useLeaderboardData.ts:275-384` |
| 시즌 아카이브 | `services/seasonArchive.ts` |
| save 호환성 구조 (attrDeltas) | `services/snapshotBuilder.ts:32-44` |
| meta 다운로드 스크립트 | `scripts/ratings/download-meta.mjs` |

---

## 부록 D: 베타 → 프로덕션 머지 절차

베타에서 검증된 능력치를 prod에 반영하는 절차. **자동 복사 금지 — 반드시 diff 검토 후 선택적으로 적용.**

1. 베타 프로젝트의 최종 `meta_players` dump:
   ```bash
   # .env를 베타 Supabase로 임시 전환 후
   node scripts/ratings/download-meta.mjs
   # → scripts/data/meta_players.csv (베타 최종 상태)
   ```
2. prod 현재 상태와 diff:
   ```bash
   git diff HEAD scripts/data/meta_players.csv
   # 또는 별도 diff 도구로 변경된 player_id/attribute 목록 추출
   ```
3. 운영자가 diff 검토 → 채택할 변경만 선택
4. `scripts/ratings/sync.mjs`로 prod에 SQL 적용
5. prod 배포 → 기존 user save는 `attrDeltas` 패턴으로 **자동 호환** (다음 로그인 시 새 베이스 + 기존 델타 재계산)
6. 베타 Supabase 프로젝트는 다음 사이클을 위해 보존하거나 삭제

---

## 주의사항 요약

1. **OVR 엔진 로직 변경 금지** — `utils/ovrEngine.ts` 수정은 모든 save의 displayOVR 즉시 이동. 이번 베타 스코프 아웃.
2. **`.env.beta` 커밋 금지** — `.gitignore` 확인 필수. service_role key 포함 가능성.
3. **테스터 계정 정보는 1:1 전달만** — 단체 채널 게시 금지.
4. **회원가입 이중 가드 필수** — 클라이언트 UI 숨김만으로 부족. Supabase Auth 설정 서버 측 차단 필수.
5. **베타 Supabase 1주일 방치 시 일시정지** — 매일 1회 Studio 접속 유지.
6. **베타 → prod 머지는 수동** — 자동 복사 금지, diff 검토 후 선택적 적용.
