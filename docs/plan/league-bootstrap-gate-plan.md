# 리그 진입 부트스트랩 게이트

> 상태: **구현 완료 (2026-10-06)** — 실 리그 E2E는 사용자 확인 대기. 상세 Before/After는 `docs/history/dev-log.md` 2026-10-06 (5), (6).
> **같은 날 변경**: 전용 진행률 화면(아티팩트 v18 https://claude.ai/artifact/EvwKyCH6LioDiB6As9U9dJ)은 실제 로딩이 1초 안쪽이라
> 막대가 보이지 않고 화면이 두 번 바뀌어 폐기. 로딩 중엔 LeagueLayout 기존 스피너(+재치 문구)가 이어지고, 확정 실패만 별도 화면.

## 배경
리그 레이아웃은 리그·룸·멤버·팀(+시즌 데이터)만 기다렸다가 화면을 내려줬고, 홈이 마운트되며 열 개 남짓의 쿼리를 각자 쐈다.
그래서 (1) 네트워크가 흔들리면 쿼리마다 토스트가 따로 떴고(최대 5장 스택), (2) 섹션마다 데이터가 따로 늦게 떴다.
사용자 결정: 진입 시 공통 데이터를 전부 받아 캐시에 넣은 뒤 홈을 보여주고, 그동안은 기존 스피너를 그대로 둔다(진행률 화면은 시도 후 폐기).

## 범위
| 묶음 | 쿼리 키 | 비고 |
|---|---|---|
| 공통 6 | multiSearchPool · metaPlayerOrder · gameShortCodes · leagueRawPlayers · leagueRawSeasonInjury · playerSeasonStatsLeague | 멀티 화면 대부분이 공유 |
| 홈 3(+2) | homeLeagueTransactions · leagueNewsStories(필터 없음 / trade / injury+suspension) · pendingTradeCount(내 팀 있을 때) | 홈 섹션·사이드바 배지 |

**미리 받지 않는 것**: 매개변수가 붙는 화면 전용 쿼리(선수 상세·박스스코어·뉴스피드 선택 선수), `leagueRawPbp`(game_pbp 전체, 무거움), 한 화면 전용(팀 고급 기록·상대 존·트레이드 데이터).

## 설계
- **옵션 팩토리**: 각 훅이 `xxxQuery(...)`를 export(키+queryFn+staleTime). 화면의 `useQuery({...xxxQuery(), enabled})`와 게이트의 `fetchQuery(xxxQuery())`가 **같은 키·같은 함수**를 쓰므로 캐시가 정확히 맞물린다.
- **게이트 위치**: `LeagueLayout` — 리그/시즌 로딩 뒤 `useLeagueBootstrap()`이 `ready`가 될 때까지 기존 스피너를 계속 렌더(사용자 눈엔 스피너 1회). 홈뿐 아니라 로스터·전술 주소로 바로 들어와도 같은 게이트를 거침.
- **건너뛰기**: 캐시에 데이터가 있는 쿼리는 대기 대상에서 제외. 전부 있으면 `ready` 즉시 → 스피너 안 뜸. 신선도는 화면 쪽 useQuery가 평소처럼 재조회.
- **조용한 재시도**: 실패분만 3초 간격 3회(`BOOTSTRAP_RETRY_*`). 그동안 스피너 그대로. 401도 같은 창(대부분 탭 복귀 직후 토큰 갱신 지연).
- **확정 실패**: 3회 소진 시 `LeagueBootstrapErrorScreen`(문구 + 버튼). 네트워크/DB → "다시 시도"(실패분 재요청), 401 → "다시 로그인"(signOut 후 /auth).
- **출구**: 실패 화면 좌상단 "‹ 홈으로"(`/`)만. 로딩 중(스피너)에는 출구 없음(1초 안쪽). 공통 데이터 없이 리그 안으로는 못 들어감.
- **토스트 제외**: `services/notifications/bootstrapQueryKeys.ts`의 9개 루트 키는 errorCollector가 무시(게이트가 처리, 진입 뒤 백그라운드 실패는 이전 데이터 사용).
- **진행률**: 없음. (처음엔 퍼센트·막대가 있었으나 `done`이 `allSettled` 종료 후 한 번만 갱신돼 0→100 점프였고, 로딩도 1초 안쪽이라 폐기.)
- **문구**: 스피너 아래 `utils/loadingQuips.ts` 5종, 2초마다 직전과 다르게 무작위(`components/multi/LeagueLoadingScreen.tsx`).
- **로고**: 스피너 위 BM27 로고(`public/logos/main.svg`, h-9, 시작 메뉴와 동일).

## 파일
- `hooks/useLeagueBootstrap.ts`(게이트 훅) · `components/multi/LeagueLoadingScreen.tsx`(스피너+문구) · `components/multi/LeagueBootstrapErrorScreen.tsx`(확정 실패 화면) · `utils/loadingQuips.ts` · `services/notifications/bootstrapQueryKeys.ts`
- 옵션 팩토리 추가: `useMultiSearchData` `usePlayerShortCodes` `useGameShortCodes` `useLeagueRawStats` `usePlayerSeasonStatsLeague` `useLeagueHeadlines` `usePendingTradeCount` + 신규 `hooks/useHomeLeagueTransactions.ts`(MultiSeasonPage 인라인에서 분리)
- `views/multi/league/LeagueLayout.tsx` · `services/notifications/errorCollector.ts`

## 남은 것
- [ ] 실 리그 E2E: 첫 진입 스피너 1회만, 재진입 건너뛰기, 네트워크 차단 시 9초 뒤 확정 실패, 다시 시도
- [ ] 토스트 카탈로그 아티팩트 "조회 쿼리 34종"에 게이트 대상 9개 표시(토스트 아님)
- [ ] (선택) 같은 원인 다발 실패 묶기 — 선수 상세처럼 화면 전용 쿼리 5~6개가 동시에 실패하는 경우
