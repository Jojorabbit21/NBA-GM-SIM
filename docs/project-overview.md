# NBA-GM-SIM 프로젝트 조감도

프로젝트 전체 파일 구조와 각 파일의 역할/연결 관계를 한눈에 파악할 수 있는 참조 문서.
신규 기능 개발 또는 버그 수정 시 어느 파일을 수정해야 하는지 빠르게 탐색하기 위한 조감도.

---

## 1. 기술 스택 & 프로젝트 기본 정보

| 항목 | 값 |
|---|---|
| **프레임워크** | React 18 + TypeScript + Vite |
| **스타일링** | Tailwind CSS |
| **DB/인증** | Supabase (PostgreSQL + Auth) |
| **배포** | Vercel |
| **상태관리** | React `useState` + 커스텀 훅 (No Redux/Zustand) |
| **데이터 fetch** | TanStack React Query |
| **분석** | Google Analytics 4 |
| **AI** | Gemini (비활성화), Anthropic SDK (package.json에 있음) |

### 루트 설정 파일
| 파일 | 역할 |
|---|---|
| `vite.config.ts` | 빌드 설정. 청크 분리(react/db/ui/ai-vendor), **CIRCULAR_DEPENDENCY 감지 시 빌드 실패** |
| `tailwind.config.js` | Tailwind 설정 |
| `index.html` / `index.tsx` | SPA 진입점 |
| `App.tsx` | 최상위 컴포넌트. 훅 조합, 전역 상태, 렌더링 가드 |
| `types.ts` | `types/` 하위 타입 전체 re-export |

---

## 2. 디렉토리 구조 전체 트리

```
NBA-GM-SIM/
├── App.tsx                        최상위 컴포넌트
├── index.tsx                      React 앱 마운트
├── index.css                      전역 CSS
├── types.ts                       타입 re-export 허브
│
├── types/                         ─── 타입 정의 (16개 파일)
│   ├── app.ts                     AppView(20종), OffseasonPhase(5단계)
│   ├── player.ts                  Player, PlayerStats, SavedPlayerState, PlayerContract
│   ├── team.ts                    Team, DeadMoneyEntry, ReleaseType
│   ├── game.ts                    Game, PlayoffSeries, ReplaySnapshot
│   ├── engine.ts                  PlayerBoxScore, PbpLog, ShotEvent, QuarterScores
│   ├── tactics.ts                 TacticalSliders(13개), DepthChart, GameTactics
│   ├── trade.ts                   Transaction, TradeDetails, LeagueTradeBlocks, PersistentTradeOffer
│   ├── gm.ts                      GMProfile, GMPersonalityType(7종), TeamDirection(5종), GMSliders
│   ├── fa.ts                      FARole(7종), SigningType, FAMarketEntry, LeagueFAMarket
│   ├── finance.ts                 TeamFinance, SavedTeamFinances, OwnerProfile
│   ├── message.ts                 MessageType(25종), Message, 타입별 content 구조
│   ├── archetype.ts               ArchetypeType(13종), TraitTag(14종), ArchetypeModuleScores
│   ├── draftAssets.ts             DraftPickAsset, PickProtection, SwapRight, LeaguePickAssets
│   ├── simSettings.ts             SimSettings, DEFAULT_SIM_SETTINGS
│   ├── coaching.ts                HeadCoach, HeadCoachPreferences(7개 슬라이더)
│   └── generatedPlayer.ts         GeneratedPlayerRow, LeagueFAPool
│
├── hooks/                         ─── 커스텀 훅 (9개 파일)
│   ├── useAuth.ts                 Supabase 인증, 게스트 모드
│   ├── useGameData.ts             ★ 핵심 허브. 전체 게임 상태 20+개 useState
│   ├── useSimulation.ts           날짜 진행, 경기 실행, 시즌 이벤트, 오프시즌
│   ├── useLiveGame.ts             인터랙티브 PBP 경기. 타이머 기반 포세션 스텝
│   ├── useTradeSystem.ts          트레이드 블록/오퍼 상태, tradeExecutor 연결
│   ├── useFullSeasonSim.ts        배치 시즌 시뮬 (테스트용)
│   ├── useLeaderboardData.ts      리더보드 데이터 집계 (useMemo)
│   ├── useShotChartTooltip.ts     샷차트 마우스 추적 + 클러스터링
│   └── useUpdateChecker.ts        5분 폴링으로 앱 업데이트 감지
│
├── services/                      ─── 비즈니스 로직 (50+개 파일)
│   ├── supabaseClient.ts          Supabase 클라이언트 싱글턴
│   ├── queries.ts                 ★ DB fetch 허브. meta_* 5개 테이블 병렬 fetch
│   ├── persistence.ts             saves 테이블 CRUD (saveCheckpoint/loadCheckpoint)
│   ├── dataMapper.ts              DB raw → 런타임 타입 변환 (JSONB 파싱)
│   ├── stateReplayer.ts           박스스코어 전체 재생 → 현재 상태 재구성 (스냅샷 없는 fallback)
│   ├── snapshotBuilder.ts         ReplaySnapshot v4 빌드/복원 (성장/부상/어워드 포함)
│   ├── gameEngine.ts              simulateGame() — pbp/main.ts의 thin wrapper
│   ├── simulationService.ts       특정 날짜 CPU 경기 일괄 시뮬
│   ├── messageService.ts          user_messages 테이블 CRUD (12종+ 메시지)
│   ├── playoffService.ts          user_playoffs 테이블 저장/로드
│   ├── hallOfFameService.ts       hall_of_fame 글로벌 테이블 CRUD
│   ├── seasonArchive.ts           user_season_history 아카이브
│   ├── reportGenerator.ts         시즌/오너레터/플레이오프/우승 보고서 빌드
│   ├── tradeEngine.ts             트레이드 엔진 외부 파사드 (generateOffers/simulateCPUTrades)
│   ├── analytics.ts               Google Analytics 4 이벤트
│   ├── geminiService.ts           Gemini AI (현재 전부 비활성화)
│   ├── moraleService.ts           선수 사기(0~100) 갱신 (게임 결과/오프시즌 감쇠)
│   ├── playerPopularity.ts        선수 인기도(local/national) 갱신 (재정 직결)
│   ├── popularitySeeds.ts         NBA 스타 인기도 초기 시드 테이블
│   ├── tacticsService.ts          user_tactics 프리셋 CRUD
│   │
│   ├── game/                      ─── 경기 엔진
│   │   ├── config/
│   │   │   ├── constants.ts       SIM_CONFIG (포세션수/슈팅확률/피로계수 등)
│   │   │   ├── playTypeProfiles.ts 슬라이더→플레이타입 가중치
│   │   │   ├── sliderSteps.ts     슬라이더 단계 설정
│   │   │   ├── tacticPresets.ts   전술 프리셋 정의
│   │   │   └── usageWeights.ts    선수 사용 가중치
│   │   ├── engine/
│   │   │   ├── pbp/               ─── PBP 엔진 핵심 (실제 사용)
│   │   │   │   ├── main.ts        runFullGameSimulation() — 경기 진입점
│   │   │   │   ├── liveEngine.ts  createGameState/stepPossession/extractSimResult
│   │   │   │   ├── flowEngine.ts  calculateHitRate() — 슈팅 적중률 계산
│   │   │   │   ├── possessionHandler.ts simulatePossession() — 단일 포세션
│   │   │   │   ├── initializer.ts initTeamState() — 경기 초기 상태
│   │   │   │   ├── pbpTypes.ts    LivePlayer, GameState, TeamState, ClutchContext
│   │   │   │   ├── playTypes.ts   resolvePlayAction() — 플레이타입 선택
│   │   │   │   ├── reboundLogic.ts resolveRebound() — 리바운드 확률
│   │   │   │   ├── rotationLogic.ts checkAndApplyRotation() — 로테이션 매트릭스
│   │   │   │   ├── substitutionSystem.ts checkSubstitutionsV2() — 파울/체력 교체
│   │   │   │   ├── shotDistribution.ts  resolveDynamicZone() — 슛 존 분배
│   │   │   │   ├── statsMappers.ts applyPossessionResult() — 박스스코어 누적
│   │   │   │   ├── stateUpdater.ts updateOnCourtStates() — 체력/핫콜드 갱신
│   │   │   │   ├── timeEngine.ts  calculatePossessionTime(), formatTime()
│   │   │   │   ├── usageSystem.ts getTeamOptionRanks() — 1~5옵션 순위
│   │   │   │   ├── archetypeSystem.ts 12종 아키타입 점수 계산
│   │   │   │   └── handlers/
│   │   │   │       ├── statUtils.ts    존별 슈팅 통계 누적
│   │   │   │       ├── visUtils.ts     슛 이벤트 기록 (샷차트용)
│   │   │   │       └── courtPositions.ts 선수 코트 좌표 계산 (애니메이션용)
│   │   │   ├── aceStopperSystem.ts  에이스 스토퍼 수비 임팩트 계산
│   │   │   ├── fatigueSystem.ts     체력 소모/회복 계산
│   │   │   ├── shotDistribution.ts  pbp/shotDistribution re-export
│   │   │   └── commentary/
│   │   │       └── textGenerator.ts 한국어 PBP 중계 텍스트 생성
│   │   └── tactics/
│   │       ├── tacticGenerator.ts  generateAutoTactics() — AI 자동 전술 생성
│   │       └── minutesManager.ts   stableSort/distributeMinutes
│   │
│   ├── simulation/                ─── 시뮬레이션 오케스트레이션
│   │   ├── cpuGameService.ts      CPU 경기 배치 처리 (성장/인기도/사기/재정 누적)
│   │   ├── userGameService.ts     유저 경기 결과 적용, 부상 처리, DB 저장
│   │   ├── seasonService.ts       날짜별 시즌 이벤트 (플레이오프/어워드/CPU트레이드)
│   │   ├── offseasonEventHandler.ts 오프시즌 상태 머신 (로터리→드래프트→FA→개막)
│   │   └── batchSeasonService.ts  시즌 전체 배치 시뮬 (테스트용)
│   │
│   ├── tradeEngine/               ─── 트레이드 엔진 (14개 파일)
│   │   ├── tradeExecutor.ts       ★ 통합 실행 진입점 (유효성→샐러리→NTC→실행)
│   │   ├── salaryRules.ts         CBA 샐러리 매칭 규칙 (125%/110%/100%)
│   │   ├── stepienRule.ts         스테피언 룰 검증
│   │   ├── tradeValue.ts          선수 트레이드 가치 산정
│   │   ├── pickValueEngine.ts     픽 가치 계산 (슬롯커브×연도할인×보호할인)
│   │   ├── gmProfiler.ts          GM 프로필 싱글턴 관리
│   │   ├── tradeBlockManager.ts   영속 트레이드 블록 관리/CPU 오퍼 생성
│   │   ├── cpuTradeSimulator.ts   CPU 트레이드 5단계 파이프라인
│   │   ├── tradeParticipation.ts  팀별 트레이드 참가 점수
│   │   ├── tradeGoalEngine.ts     CPU 트레이드 목표 결정 (6종)
│   │   ├── tradeTargetFinder.ts   타깃 선수 탐색
│   │   ├── tradeUtilityEngine.ts  트레이드 효용 평가 (수락 여부)
│   │   ├── assetAvailability.ts   선수 트레이드 가용성 점수
│   │   ├── teamAnalysis.ts        팀 강약점 분석, TeamTradeState 빌드
│   │   ├── offerGenerator.ts      오퍼 생성
│   │   ├── counterGenerator.ts    카운터 오퍼 생성
│   │   └── tradeConfig.ts         트레이드 엔진 수치 상수
│   │
│   ├── fa/                        ─── FA 시스템
│   │   ├── faMarketBuilder.ts     FA 시장 개설, CPU 서명, 선수 방출, 페이롤 계산
│   │   ├── faValuation.ts         FA 역할(7종), 수요 계산, 오퍼 평가
│   │   ├── cpuWaiverEngine.ts     CPU 웨이버 의사결정 (KeepValue vs ReplacementValue)
│   │   └── extensionEngine.ts     계약 연장 협상 엔진
│   │
│   ├── financeEngine/             ─── 재정 엔진
│   │   ├── budgetManager.ts       BudgetManager 싱글턴 (수익 누적/럭셔리택스)
│   │   ├── attendanceModel.ts     관중/입장수익/머천다이즈 계산
│   │   ├── revenueCalculator.ts   고정 수익/지출, 팀 재정 초기화
│   │   └── index.ts               getBudgetManager/resetBudgetManager
│   │
│   ├── playerDevelopment/         ─── 선수 성장
│   │   ├── playerAging.ts         Per-game 미세 성장, 에이징 그룹, 오프시즌 처리
│   │   └── archetypeEvaluator.ts  13종 아키타입 + 14종 트레이트 태그 평가
│   │
│   ├── draft/                     ─── 드래프트
│   │   ├── lotteryEngine.ts       NBA 2019+ 로터리 시스템
│   │   ├── rookieGenerator.ts     드래프트 클래스 자동 생성
│   │   ├── draftOrderResolver.ts  보호/스왑 반영한 최종 드래프트 오더
│   │   └── rookieRepository.ts    user_generated_players 테이블 CRUD
│   │
│   ├── draftAssets/
│   │   └── pickInitializer.ts     30팀 × 2026~2032 픽 자산 초기화
│   │
│   └── coachingStaff/
│       └── coachGenerator.ts      코치 싱글턴 관리, 결정론적 자동 생성
│
├── utils/                         ─── 유틸리티 (29개 파일)
│   ├── constants.ts               ★ 리그 재정 상수, OVR 계산 래퍼, FALLBACK_TEAMS
│   ├── ovrUtils.ts                calculateOvr() — 순수 함수
│   ├── overallWeights.ts          포지션별 25개 능력치 가중치 테이블
│   ├── seasonConfig.ts            buildSeasonConfig() — 시즌 번호 기반 날짜 생성
│   ├── scheduleGenerator.ts       NBA 82경기 일정 자동 생성
│   ├── simulationUtils.ts         applyBoxToRoster/updateTeamStats/sumTeamBoxScore
│   ├── simulationMath.ts          승리 확률 계산, WP 스냅샷
│   ├── playoffLogic.ts            플레이오프 브래킷 초기화/진행
│   ├── standingsStats.ts          순위 통계 (홈/원정/컨퍼런스/최근10경기)
│   ├── tiebreaker.ts              NBA 규칙 타이브레이커
│   ├── awardVoting.ts             100인 투표 어워드 시뮬 (MVP/DPOY/All-NBA)
│   ├── awardStamper.ts            어워드 → Player.awards[] 영속화
│   ├── hallOfFameScorer.ts        HOF 점수 계산
│   ├── hiddenTendencies.ts        결정론적 히든 텐던시 생성 (시드 기반)
│   ├── scoutReport.ts             히든 텐던시 → 한국어 스카우트 리포트
│   ├── injuries.ts                KNOWN_INJURIES 초기 데이터
│   ├── tacticUtils.ts             OVR 스타일, 전술 이력 업데이트
│   ├── teamTheme.ts               팀 브랜드 컬러 → Tailwind 스타일
│   ├── formatMoney.ts             $51.4M 포맷 변환
│   ├── courtCoordinates.ts        코트 치수 상수 + 슈팅 좌표
│   ├── courtZones.ts              SVG 존 경로, 리그 평균 FG%, 색상 스타일
│   ├── heatmapUtils.ts            스탯 히트맵 색상 계산
│   ├── defensiveStats.ts          팀별 수비 스탯 집계
│   ├── draftUtils.ts              generateSnakeDraftOrder()
│   ├── editorManager.ts           팀명/로고 커스텀 에디터 (localStorage)
│   ├── editorState.ts             editorLogoUrls Map (순환 임포트 방지 분리)
│   ├── supabaseUtils.ts           throwIfSupabaseError 헬퍼
│   ├── device.ts                  디바이스 ID 생성
│   └── legalTexts.ts              약관 텍스트
│
├── views/                         ─── 페이지 뷰 (29개 파일)
│   ├── AuthView.tsx               로그인/회원가입
│   ├── OnboardingView.tsx         팀 선택 후 온보딩 애니메이션
│   ├── ModeSelectView.tsx         기본/커스텀 모드 선택
│   ├── TeamSelectView.tsx         30팀 선택
│   ├── DraftPoolSelectView.tsx    드래프트 풀 선택
│   ├── DashboardView.tsx          ★ 메인 화면 (6탭: 로테이션/전술/로스터/기록/스카우트/일정)
│   ├── RosterView.tsx             전체 30팀 로스터 탐색
│   ├── ScheduleView.tsx           시즌 일정, 경기 참관/직접 플레이
│   ├── StandingsView.tsx          리그/컨퍼런스/디비전 순위
│   ├── LeaderboardView.tsx        선수/팀 리더보드 (히트맵)
│   ├── TransactionsView.tsx       트레이드 화면 4탭
│   ├── PlayoffsView.tsx           플레이오프 브래킷
│   ├── GameSimulationView.tsx     PBP 경기 시뮬레이션 애니메이션
│   ├── LiveGameView.tsx           ★ 인터랙티브 경기 (타임아웃/교체 조작)
│   ├── GameResultView.tsx         경기 결과 5탭 (박스스코어/샷차트/PBP/로테이션/전술)
│   ├── InboxView.tsx              인박스 메시지 (12종+)
│   ├── PlayerDetailView.tsx       선수 상세 (능력치/아키타입/성장이력/스카우트)
│   ├── CoachDetailView.tsx        코치 상세
│   ├── GMDetailView.tsx           GM 상세 (성격/슬라이더/팀방향)
│   ├── FrontOfficeView.tsx        구단 운영 4탭 (클럽/연봉/코칭/픽)
│   ├── FAView.tsx                 FA 시장 (협상/방출/연장)
│   ├── HallOfFameView.tsx         글로벌 명예의 전당 리더보드
│   ├── DraftLotteryView.tsx       드래프트 로터리 애니메이션
│   ├── RookieDraftView.tsx        루키 드래프트 (오프시즌)
│   ├── FantasyDraftView.tsx       판타지 드래프트 (게임 시작)
│   ├── DraftView.tsx              드래프트 보드 (읽기 전용)
│   ├── DraftHistoryView.tsx       드래프트 이력
│   ├── OvrCalculatorView.tsx      OVR 계산기
│   └── HelpView.tsx               도움말
│
├── components/                    ─── UI 컴포넌트
│   ├── AppRouter.tsx              ★ 29개 뷰 조건부 렌더링 중앙 라우터
│   ├── MainLayout.tsx             레이아웃 (사이드바+헤더+콘텐츠)
│   ├── Sidebar.tsx                좌측 내비게이션
│   ├── SharedComponents.tsx       OVR 배지 등급 스타일
│   ├── EditorModal.tsx            팀/선수 에디터 모달
│   ├── SimSettingsModal.tsx       시뮬레이션 설정 모달
│   ├── EndSeasonModal.tsx         시즌 종료 모달
│   ├── ResetDataModal.tsx         데이터 리셋 확인
│   ├── FullScreenLoader.tsx       DatabaseErrorView 포함
│   ├── SkeletonLoader.tsx         로딩 스켈레톤
│   ├── LiveScoreTicker.tsx        실시간 스코어 틱커
│   ├── VisualShotChart.tsx        샷차트 시각화
│   ├── UpdateToast.tsx            앱 업데이트 알림
│   ├── common/                    Badge, Button, Card, Modal, OvrBadge, PageHeader,
│   │                              PlayerAwardBadges, SliderControl, StarRating, TabBar,
│   │                              Table, TeamLogo, Dropdown, DirectionBadge
│   ├── dashboard/
│   │   ├── DashboardHeader.tsx    날짜/승률/다음경기 헤더
│   │   ├── DateSkipDropdown.tsx   날짜 스킵 드롭다운
│   │   ├── DepthChartEditor.tsx   뎁스차트 드래그 편집
│   │   ├── RotationGanttChart.tsx 로테이션 간트 차트
│   │   ├── RotationManager.tsx    로테이션 관리 래퍼
│   │   ├── RotationMatrix.tsx     48분 토글 로테이션 편집
│   │   ├── TacticsBoard.tsx       전술 슬라이더 + 6종 차트 탭
│   │   ├── GMProfileCard.tsx      GM 프로필 카드
│   │   ├── CoachProfileCard.tsx   코치 프로필 카드
│   │   ├── OpponentScoutPanel.tsx 상대팀 스카우트 패널
│   │   └── tactics/               TacticalHalfCourt, TacticsDataPanel, TacticsSlidersPanel,
│   │       charts/                PlayTypePPP, RadarChart, RatingTrend, RiskGauge,
│   │                              ShotDistribution, TeamZoneChart, UsagePrediction
│   ├── game/                      BoxScoreTable, PlayerMarkers, ResultFooter, ResultHeader,
│   │   tabs/                      RotationChart, ScoreGraph, ShotTooltip, TacticsAnalysis
│   │                              GameBoxScoreTab, GamePbpTab, GameRotationTab,
│   │                              GameShotChartTab, GameTacticsTab, LiveTacticsTab
│   ├── inbox/                     MessageList, MessageContentRenderer,
│   │                              AwardsReportViewer, GameRecapViewer,
│   │                              HofQualificationRenderer, PlayoffChampionRenderer,
│   │                              RegSeasonChampionRenderer, ScoutReportRenderer,
│   │                              SeasonReviewRenderer
│   ├── transactions/              OfferCard, TradeConfirmModal, TradeNegotiationBuilder,
│   │   tabs/                      LeagueBlockTab, TradeBlockTab, IncomingOffersTab,
│   │                              TradeProposalTab, TradeHistoryTab
│   ├── draft/                     DraftBoard, DraftHeader, MyRoster, PickHistory,
│   │                              PlayerPool, RookieDraftBoard
│   ├── frontoffice/               DraftPicksPanel
│   ├── leaderboard/               LeaderboardTable, LeaderboardToolbar
│   ├── playoffs/                  BracketConnector, GridSeriesBox
│   ├── roster/                    RosterGrid, RosterTabs, SalaryCapDashboard,
│   │                              StartingLineup, TacticsHistory, TeamGameLog
│   └── simulation/                FullSeasonSimModal, LiveScoreboard, SimulationCourt
│
├── data/                          ─── 정적 데이터
│   ├── teamData.ts                30팀 색상/컨퍼런스/구단주 + populateTeamData()
│   ├── teamFinanceData.ts         팀 재정 초기값 (구장 규모/마켓 티어)
│   ├── attributeConfig.ts         ATTR_KR_LABEL — 능력치 한국어 레이블
│   ├── draftPickTrades.ts         실제 NBA 픽 거래 현황 데이터
│   ├── leaderboardConfig.ts       리더보드 컬럼/카테고리 설정
│   ├── mappings.ts                TEAM_ID_MAP
│   └── uiConstants.ts             UI 상수
│
├── api/                           ─── Vercel Edge Functions (실험적)
│   └── trade-engine.ts            트레이드 엔진 API (현재 미사용)
│
├── scripts/                       ─── 데이터 관리 스크립트 (파이썬/mjs)
│   ├── data/                      meta_players.csv, 레이팅 CSV 원본
│   ├── output/                    생성된 SQL 파일들
│   ├── ratings/                   능력치별 조정 스크립트 (40+개)
│   ├── draft/                     create_draft_2026.mjs
│   ├── br-converter/              Basketball Reference 데이터 변환
│   ├── sql/                       NBA 계약 업데이트 SQL
│   ├── fetch_*.py                 NBA Stats API 수집 스크립트
│   ├── gen_*.py                   커리어 SQL 생성 스크립트
│   └── merge_career_stats.py      커리어 스탯 병합
│
├── sql/ & migrations/             ─── DB 스키마
│   ├── insert_c.sql / insert_pf.sql  포지션별 선수 삽입
│   ├── meta_coaches.sql / meta_gms.sql  코치/GM 데이터
│   └── migrations/                add_hof_id, add_quarter_scores,
│                                  multi_season_foundation
│
└── docs/                          ─── 프로젝트 문서
    ├── engine/                    pbp-engine, rotation, fatigue, clutch, momentum (20개+)
    ├── simulation/                trade-system, fa-system, finance-system, playoff
    ├── domain/                    nba-strategy, nba-trade-salary, glossary
    ├── evaluation/                rating-generation, rating-standards
    ├── ui/                        design-system, inbox-ui, routing-plan
    ├── infra/                     Supabase 모니터링, 버전 업데이트
    └── plan/                      fantasy-draft, live-pbp, multi-season, monetization
```

---

## 3. Supabase 테이블 요약

| 테이블 | 타입 | 용도 |
|---|---|---|
| `meta_players` | 공유 읽기전용 | 445명 선수 데이터. `base_attributes` JSONB |
| `meta_schedule` | 공유 읽기전용 | 시즌 일정 |
| `meta_teams` | 공유 읽기전용 | 30팀 정적 데이터 |
| `meta_coaches` | 공유 읽기전용 | 코치 데이터 |
| `meta_gms` | 공유 읽기전용 | GM 데이터 |
| `saves` | 유저별 | 전체 게임 체크포인트 (전술/뎁스차트/스냅샷/FA마켓/트레이드블록 등) |
| `user_game_results` | 유저별 누적 | 경기별 박스스코어 |
| `user_messages` | 유저별 | 인박스 메시지 |
| `user_playoffs` | 유저별 | 플레이오프 브래킷 |
| `user_season_history` | 유저별 아카이브 | 멀티시즌 시즌 결과 |
| `user_generated_players` | 유저별 임시 | 루키 생성 선수 |
| `hall_of_fame` | 글로벌 공유 | HOF 리더보드 |

---

## 4. 핵심 데이터 흐름

### 4-1. 앱 시작 시 (로그인 후)
```
App.tsx
  └── useAuth()                       → Supabase 세션 확인
  └── useGameData()
        └── queries.ts useBaseData()  → meta_* 5개 테이블 병렬 fetch
              └── dataMapper.ts       → DB raw → Team[]/Game[] 변환
              └── coachGenerator/gmProfiler.populateData()  → 싱글턴 교체
        └── persistence.loadCheckpoint()  → saves 테이블
              └── snapshotBuilder.hydrateFromSnapshot()  → v4 스냅샷 복원
                    └── playerAging.reapplyAttrDeltas()  → 성장 재적용
              └── (fallback) stateReplayer.replayGameState()  → 박스스코어 재생
```

### 4-2. 날짜 진행 (경기 실행)
```
useSimulation.advanceDate()
  ├── [CPU 경기]  simulationService.simulateCpuGames()
  │                 └── gameEngine.simulateGame()
  │                       └── pbp/main.runFullGameSimulation()
  │                             └── liveEngine.createGameState + stepPossession 루프
  │                                   └── possessionHandler.simulatePossession()
  │                                         └── flowEngine.calculateHitRate()
  ├── [유저 경기] userGameService.runUserSimulation()
  ├── seasonService.handleSeasonEvents()  → 어워드/트레이드/플레이오프
  └── persistence.saveCheckpoint()       → saves 저장
```

### 4-3. PBP 엔진 내부 포세션 흐름
```
liveEngine.stepPossession()
  └── possessionHandler.simulatePossession()
        ├── usageSystem.getTeamOptionRanks()     5인 옵션 순위
        ├── playTypes.resolvePlayAction()        플레이타입 선택
        ├── flowEngine.calculateHitRate()        적중률 계산
        │     ├── aceStopperSystem               에이스 스토퍼 보정
        │     └── ClutchContext                  클러치 상황 보정
        ├── reboundLogic.resolveRebound()        리바운드 판정
        └── statsMappers.applyPossessionResult() 박스스코어 누적
  └── stateUpdater.updateOnCourtStates()        체력/핫콜드 갱신
  └── rotationLogic.checkAndApplyRotation()     로테이션 매트릭스 체크
  └── substitutionSystem.checkSubstitutionsV2() 파울/체력 교체 체크
```

### 4-4. 오프시즌 파이프라인
```
offseasonEventHandler.checkOffseasonEvent()
  POST_FINALS    → detectFinalsEnd() → archiveCurrentSeason()
  POST_LOTTERY   → runLotteryEngine() → DraftLotteryView 강제 이동
  POST_DRAFT     → RookieDraftView 강제 이동
  FA_OPEN        → openFAMarket() → simulateCPUWaivers() → cpuTradeSimulator
  PRE_SEASON     → simulateCPUSigning() → generateSeasonSchedule()
                 → openingNight() (새 일정 생성, W/L 리셋)
```

### 4-5. 트레이드 파이프라인 (CPU)
```
seasonService → cpuTradeSimulator.runCPUTradeRound()
  1. tradeParticipation.calculateParticipationScore()  팀별 참가 점수
  2. tradeGoalEngine.generateTradeGoal()               목표 결정 (6종)
  3. tradeTargetFinder.findTradeTargets()              타깃 탐색
  4. assetAvailability.getPlayerAvailability()         가용성 체크
  5. tradeUtilityEngine.evaluateTradeUtility()         효용 검증
  └── tradeExecutor.executeTrade()                     실행 (CBA 검증 포함)
```

---

## 5. 상태 관리 구조

stores/ 디렉토리 없음. React `useState` + 커스텀 훅으로 관리:

```
App.tsx (전역 상태 허브)
├── useAuth()           isAuthenticated, isGuest, user
├── useGameData()       teams[], schedule[], tactics, depthChart,
│                       rotationMap, faMarket, tradeBlocks, pickAssets,
│                       gmProfiles, coachingData, simSettings, offseasonPhase ...
├── useSimulation()     isSimulating, pendingAction, 날짜 진행 함수들
├── useFullSeasonSim()  batchProgress, isBatchRunning
└── view (useState)     현재 화면 AppView 타입

// 뷰 로컬 상태
TransactionsView  → useTradeSystem()     트레이드 상태
LiveGameView      → useLiveGame()        실시간 경기 상태
LeaderboardView   → useLeaderboardData() 집계 데이터
```

---

## 6. 주요 파일별 수정 가이드

| 수정하고 싶은 것 | 수정해야 할 파일 |
|---|---|
| 슈팅 적중률 계산 | `services/game/engine/pbp/flowEngine.ts` |
| 포세션 로직 (파울/턴오버) | `services/game/engine/pbp/possessionHandler.ts` |
| 로테이션 교체 | `services/game/engine/pbp/rotationLogic.ts` |
| 체력 소모/회복 | `services/game/engine/fatigueSystem.ts` |
| 선수 성장/퇴화 | `services/playerDevelopment/playerAging.ts` |
| 아키타입 평가 | `services/playerDevelopment/archetypeEvaluator.ts` |
| FA 수요/오퍼 평가 | `services/fa/faValuation.ts` |
| CPU 웨이버 결정 | `services/fa/cpuWaiverEngine.ts` |
| 트레이드 가치 | `services/tradeEngine/tradeValue.ts` |
| 픽 가치 | `services/tradeEngine/pickValueEngine.ts` |
| CBA 샐러리 규칙 | `services/tradeEngine/salaryRules.ts` |
| CPU 트레이드 목표 | `services/tradeEngine/tradeGoalEngine.ts` |
| 재정 수익 계산 | `services/financeEngine/attendanceModel.ts` |
| 럭셔리 택스 | `services/financeEngine/budgetManager.ts` |
| OVR 가중치 | `utils/overallWeights.ts` |
| 시즌 날짜 생성 | `utils/seasonConfig.ts` |
| 어워드 투표 | `utils/awardVoting.ts` |
| 플레이오프 브래킷 | `utils/playoffLogic.ts` |
| 인박스 메시지 타입 추가 | `types/message.ts` → `services/messageService.ts` → `components/inbox/` |
| 새 뷰 추가 | `types/app.ts` → `components/AppRouter.tsx` → `components/Sidebar.tsx` |
| DB 스키마 변경 | `migrations/` + `services/persistence.ts` + `types/` 해당 파일 |
