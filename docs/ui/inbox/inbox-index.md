# Inbox 시스템 구조

## 개요

Inbox는 게임 내 메시지 시스템으로, 경기 결과/트레이드/부상/시즌 리뷰/어워드 등 13종의 메시지 타입을 처리한다.
원래 `views/InboxView.tsx` 단일 파일(2,323줄)이었으나, `components/inbox/` 하위로 분리되어 현재 15개 파일(총 ~2,000줄)로 구성된다.

---

## 파일 구조

```
views/
└── InboxView.tsx              (167줄) 상태 관리 + 레이아웃 쉘

components/inbox/
├── shared/                    공유 유틸리티/컴포넌트
│   ├── inboxTypes.ts          (6줄)   타입 정의
│   ├── inboxConstants.ts      (49줄)  컬럼/탭 상수
│   ├── inboxUtils.ts          (19줄)  fmtStatVal, makeComputeRank
│   ├── RosterStatsTable.tsx   (111줄) 로스터 스탯 테이블 (4곳 통합)
│   └── TeamStatsWithRanks.tsx (84줄)  팀 스탯 + 탭 + 순위 행 (4곳 통합)
│
├── MessageList.tsx            (95줄)  좌측 사이드바 (메시지 목록)
├── MessageContentRenderer.tsx (536줄) switch 디스패처 + 인라인 케이스
│
├── GameRecapViewer.tsx        (239줄) 경기 박스스코어
├── SeasonReviewRenderer.tsx   (161줄) 시즌 리뷰
├── RegSeasonChampionRenderer.tsx (54줄) 정규시즌 우승
├── PlayoffChampionRenderer.tsx   (58줄) 플레이오프 우승
├── HofQualificationRenderer.tsx  (100줄) 명예의 전당 자격
├── ScoutReportRenderer.tsx    (68줄)  월별 스카우트 리포트
└── AwardsReportViewer.tsx     (426줄) 시즌 어워드 (MVP/DPOY/All-NBA)
```

---

## 데이터 흐름

```
messageService (Supabase)
    │
    ▼
InboxView.tsx ─── 상태 관리 (messages, selectedMessage, selectedContent, page)
    │                │
    │                └── contentCache (useRef<Map>) — 메시지 내용 캐시
    │
    ├── MessageList ← messages, selectedMessageId, callbacks
    │       좌측 사이드바: 메시지 목록, 페이지네이션, 모두 읽음
    │
    └── MessageContentRenderer ← type, content, teams, myTeamId, callbacks
            switch(type) → 각 렌더러 컴포넌트로 위임
```

---

## 메시지 타입 (13종)

| 타입 | 렌더러 | 설명 |
|------|--------|------|
| `GAME_RECAP` | GameRecapViewer | 경기 박스스코어 (정렬 가능) |
| `TRADE_ALERT` | 인라인 (MCR) | 트레이드 알림 (참여 구단/선수) |
| `INJURY_REPORT` | 인라인 (MCR) | 부상 리포트 (심각도/복귀일) |
| `SEASON_REVIEW` | SeasonReviewRenderer | 시즌 리뷰 (팀스탯+순위+로스터) |
| `PLAYOFF_STAGE_REVIEW` | 인라인 (MCR) | 플레이오프 라운드 결과 |
| `SEASON_AWARDS` | AwardsReportViewer | MVP/DPOY/All-NBA 투표 결과 |
| `OWNER_LETTER` | 인라인 (MCR) | 구단주 서신 |
| `HOF_QUALIFICATION` | HofQualificationRenderer | 명예의 전당 점수 |
| `FINALS_MVP` | 인라인 (MCR) | 파이널 MVP 선정 |
| `REG_SEASON_CHAMPION` | RegSeasonChampionRenderer | 정규시즌 우승 |
| `PLAYOFF_CHAMPION` | PlayoffChampionRenderer | 플레이오프 우승 |
| `SCOUT_REPORT` | ScoutReportRenderer | 월별 선수 성장/퇴화 리포트 |
| `SYSTEM` | 인라인 (MCR) | 시스템 메시지 (텍스트) |

> **인라인 (MCR)** = MessageContentRenderer.tsx 내부에서 직접 렌더링 (별도 파일 없음)

---

## 공유 컴포넌트 상세

### shared/inboxTypes.ts

```typescript
SortKey      // 박스스코어 정렬 키 (16종)
ChampStatTab // 'Traditional' | 'Advanced' (챔피언/HOF용)
TeamStatTab  // 'Traditional' | 'Advanced' | 'Opponent' (시즌리뷰용)
StatColDef   // 컬럼 정의 { key, label, fmt, inv? }
```

### shared/inboxConstants.ts

| 상수 | 용도 |
|------|------|
| `SR_TEAM_COLS` | 시즌리뷰 팀 스탯 컬럼 (Traditional/Advanced/Opponent) |
| `SR_TAB_LABELS` | 시즌리뷰 탭 라벨 |
| `CHAMP_TEAM_COLS` | 챔피언/HOF 팀 스탯 컬럼 (= SR Traditional + Advanced 참조) |
| `CHAMP_TAB_LABELS` | 챔피언/HOF 탭 라벨 |
| `HOF_SCORE_COLS` | HOF 점수 테이블 컬럼 (총점/정규시즌/득실차/스탯/플레이오프) |

### shared/inboxUtils.ts

| 함수 | 설명 |
|------|------|
| `fmtStatVal(v, fmt)` | 스탯 포맷 (`'num'`→1자리, `'pct'`→.XXX, `'diff'`→+/-) |
| `makeComputeRank(allTeamsStats, focusTeamId)` | 순위 계산 팩토리 (4곳 중복 제거) |

### shared/RosterStatsTable.tsx

로스터 스탯 테이블 — 4곳(시즌리뷰/정규시즌우승/플레이오프우승/HOF)에서 공유.

| Prop | 타입 | 설명 |
|------|------|------|
| `rosterStats?` | `RosterStatRow[]` | 선수별 스탯 배열 (없으면 렌더링 안 함) |
| `sectionLabel` | `string` | 섹션 제목 |
| `onPlayerClick?` | `(id: string) => void` | 선수 클릭 핸들러 (SeasonReview만 사용) |
| `stickyPlayerCol?` | `boolean` | 선수 컬럼 sticky 여부 (기본 true, SeasonReview는 false) |

### shared/TeamStatsWithRanks.tsx

팀 스탯 + 탭 스위처 + 리그 순위 행 — 4곳에서 공유. 내부에서 `activeTab` 상태를 소유.

| Prop | 타입 | 설명 |
|------|------|------|
| `sectionTitle` | `string` | 섹션 제목 |
| `tabs` | `string[]` | 탭 목록 |
| `tabLabels` | `Record<string, string>` | 탭 한글 라벨 |
| `colsMap` | `Record<string, StatColDef[]>` | 탭→컬럼 매핑 |
| `teamStats` | `Record<string, number>` | 팀 스탯 데이터 |
| `computeRank` | `(key, inv?) => number` | 순위 계산 함수 |
| `goodRankThreshold?` | `number` | 순위 emerald 기준 (기본 10) |
| `badRankThreshold?` | `number` | 순위 red 기준 (기본 21) |

> PlayoffChampion만 goodRankThreshold=3, badRankThreshold=ceil(totalTeams×0.7) 사용.

---

## 주요 컴포넌트 상세

### InboxView.tsx (views/)

페이지 레벨 컴포넌트. AppRouter에서 직접 렌더링.

**상태:**
- `messages` / `selectedMessage` / `selectedContent` — 메시지 목록/선택/내용
- `page` / `totalCount` — 페이지네이션
- `contentCache` (useRef) — 메시지 내용 캐시 (같은 메시지 재선택 시 재요청 방지)

**콜백:**
- `handleSelectMessage` — 메시지 선택 + 캐시 확인 + 읽음 처리
- `handlePlayerClick` — 선수 클릭 → teams에서 찾아 onViewPlayer 호출
- `getDisplayDate` — 플레이오프 GAME_RECAP의 날짜 파싱

### MessageContentRenderer.tsx

switch 디스패처. 13개 메시지 타입을 분기.

**내부 상태:**
- `isFetchingResult` — 경기 상세 보기 로딩 (GAME_RECAP, PLAYOFF_STAGE_REVIEW에서 사용)

**내부 헬퍼:**
- `getSnapshot(id, savedOvr?, savedPos?)` — 선수 OVR/포지션 조회 (teams에서 먼저, 없으면 savedOvr 사용)
- `handleViewDetails(gameId)` — DB에서 전체 경기 결과 fetch → onViewGameResult 호출

**인라인 렌더링 케이스 (별도 파일 불필요):**
- `TRADE_ALERT` — 테이블 1개 (참여구단/IN/OUT)
- `INJURY_REPORT` — 카드 1개 (심각도/부상유형/복귀일)
- `PLAYOFF_STAGE_REVIEW` — 시리즈 헤더 + 경기 결과 테이블 + 통합 박스스코어
- `FINALS_MVP` — 히어로 + 코어스탯 + 기사 + 리더보드 테이블
- `OWNER_LETTER` — 텍스트 메시지
- `SYSTEM` — 단순 텍스트

### GameRecapViewer.tsx

경기 박스스코어. 내부에 `SortableHeader` 서브컴포넌트 포함.

**기능:** 홈/어원 탭, 컬럼별 정렬 (SortKey), 선수 클릭, 경기 상세 보기 버튼.

### SeasonReviewRenderer.tsx

시즌 리뷰. TeamStatsWithRanks(3탭: Traditional/Advanced/Opponent) + RosterStatsTable 사용.

### AwardsReportViewer.tsx (426줄 — inbox 최대)

시즌 어워드. MVP/DPOY 히어로 카드, 투표 결과 테이블, All-NBA/All-Defensive 팀, 접이식 투표 상세.

---

## 확장 가이드

### 새 메시지 타입 추가
1. `types/message.ts`에 새 `MessageType` 추가 + Content 타입 정의
2. `MessageContentRenderer.tsx`의 switch에 case 추가
3. 렌더링이 복잡하면(>50줄) 별도 `components/inbox/XxxRenderer.tsx` 생성
4. 단순하면 인라인으로 처리

### 추후 추출 후보
- `PLAYOFF_STAGE_REVIEW` (현재 ~150줄 인라인) — 가장 큰 인라인 케이스
- `FINALS_MVP` (~100줄 인라인) — 히어로+리더보드

---

## 중복 제거 히스토리

리팩토링 전 4곳에서 복사되어 있던 코드를 공유 컴포넌트로 통합:

| 중복 항목 | Before | After |
|-----------|--------|-------|
| `computeRank` useCallback | 4곳 × ~15줄 | `makeComputeRank()` 팩토리 1곳 |
| 로스터 스탯 테이블 JSX | 4곳 × ~40줄 | `RosterStatsTable` 1곳 |
| 팀스탯+탭+순위 행 JSX | 4곳 × ~50줄 | `TeamStatsWithRanks` 1곳 |
| `CHAMP_TEAM_COLS` 배열 | 3곳 중복 정의 | `SR_TEAM_COLS` 참조로 통합 |

총 ~400줄 중복 제거.
