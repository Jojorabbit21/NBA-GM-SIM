# 고급 선수 지표 도입 계획 (PER / WS / BPM / VORP / Four Factors + 자체 임팩트 지표)

작성: 2026-10-28 · 상태: 계획 (착수 전)

## 0. 결정 사항 (2026-10-28 사용자 확정)
- **공식이 공개된 지표는 그대로 구현**: PER, Win Shares, BPM, VORP, Four Factors. (PER은 lg_aPER 일일 스냅샷 방식으로 확정 — 아래 Phase A 표 참조)
- **계수가 비공개인 지표 중 RPM·EPM형만 구현**하고, 원본을 복제하지 않고 우리 시뮬 데이터로 **계수를 직접 적합(fit)** 해서 **독자 이름**(TIM, XIM)으로 노출한다. **LEBRON형(RAI)·DARKO형(Form)은 2026-10-28 구현하지 않기로 결정** — 시뮬에서는 TIM/XIM과 사실상 겹치고(RAI), 능력치·OVR이 공개돼 있어 "숨은 실력 추정"의 의미가 약하며(Form), RAI의 운 보정은 xPts 박스 필드 신설(클라/서버 미러)이 필요해 실익 대비 비용이 크다고 판단.
- 근거: 공식·방법론은 저작권 보호 대상이 아니며(아이디어/표현 이분법), 문제가 되는 것은 ① 타 사이트 코드·설명문 복사 ② 데이터 대량 복사 ③ 약관 ④ 상표(이름). 이 프로젝트는 ①~③이 해당 없고 ④만 이름 변경으로 회피한다. (법률 자문 아님 — 상업 출시 전 한국 변호사 확인 권장)
- ZenGM 클린룸 원칙([[feedback_zengm_license_cleanroom]])과 동일: 코드·주석·설명문은 전부 직접 작성, 출처 코드 붙여넣기 금지.

## 1. 현황
- `utils/advancedBoxStats.ts`: TS%, eFG%, USG%, AST%, TOV%, OREB%/DREB%/TRB% (MP 비중 스케일링 근사식, 팀 합계 `computeTeamBoxTotals`).
- 팀 ORtg/DRtg/NRtg/Pace, 쿼터별·라인업별 효율: `docs/plan/advanced-game-analytics.md` (Insights/Lineups 탭).
- 클라/서버 미러 쌍 필요 여부는 착수 시 `server/src/shared/utils/` 확인 (Docker가 server/src만 복사).

## 2. Phase A — 공개 공식 지표 (박스스코어 기반)
| 지표 | 입력 | 비고 |
|---|---|---|
| **Four Factors** | 팀 eFG%, TOV%, ORB%, FT/FGA (공격·수비 각각) | 팀 단위, 가장 쉬움 → 먼저 |
| **PER** | 박스스코어 + 리그 상수(lg_aPER, factor, VOP, DRB%, 리그 페이스) | **(2026-10-28 제외했다가 같은 날 재추가)** lg_aPER 은 전원 가중평균이라 매번 계산하지 않고 **리그 상수 스냅샷**(방×시즌 1행)으로 저장, **가상 날짜가 바뀔 때 1회 갱신**(멀티는 `current_virtual_date(room_id)` 기준 — `rooms.sim_date`·실시간 24h 금지, 싱글은 시뮬 하루 종료 시). 화면은 선수 시즌 누적+팀 합계+스냅샷으로 계산, 시즌 초·표본 부족 시 직전 시즌/기본값 폴백, 어워드 투표·시즌 아카이브에서만 최종 전원 재계산 |
| **Win Shares (OWS/DWS/WS/48)** | 선수 박스 + 팀 합계 + 리그 평균 (한계득점·한계수비) | 팀 승수와 합이 맞도록 배분 → 팀 단위 집계 필요 |
| **BPM / VORP** | 박스 + 팀 레이팅 + 출전비중 | VORP = BPM 기반 누적. 계수는 §3에서 **우리 엔진에 맞게 재적합**한 버전을 쓰고, 공개 계수 그대로 쓴 버전과 비교 검증 |

- 구현 위치: `utils/advancedBoxStats.ts` 확장 또는 `utils/advancedMetrics/` 분리(파일 비대화 방지). 순수 함수, 입력은 `PlayerBoxScore` 집계.
- 시즌 누적/평균 계산은 `stateReplayer` 집계 결과 재사용 (신규 DB 컬럼 없음, 박스스코어에서 파생).

## 3. Phase B — 독자 임팩트 지표 (계수 직접 적합)
핵심 아이디어: **시뮬은 정답(선수 능력치)과 라인업 스틴트 전체를 알고 있다.** 실제 NBA와 달리 RAPM 노이즈를 표본 수로 해결할 수 있다.

1. **데이터 생성**: 하네스로 N시즌(권장 ≥ 20시즌 분량) 시뮬 → 스틴트(라인업 구간)별 포제션·득실 로그. 체력 누적 + 10회분 필수(`project_fta_shortage_investigation` 교훈).
2. **기준값 산출**: 스틴트 데이터로 **RAPM(릿지 회귀)** 계산 → "임팩트 정답지".
3. **박스 프라이어 적합**: per-100 포제션 박스 스탯 → RAPM 으로 회귀 → 계수 = 우리 엔진용 BPM형 식. 포지션/롤 보정 항 추가 여부는 잔차 분석 후 결정.
4. **트래킹 입력 추가** (EPM형 = XIM): 엔진이 이미 집계하는 플레이타입별 PPP, 블락(림 프로텍션), 헬프 등을 후보 피처로 넣고 유의한 것만 채택.
5. ~~시간 진화(DARKO형)~~ — 구현 안 함 (2026-10-28 결정, 위 §0 참조).
6. **검증**: (a) 홀드아웃 시즌에서 예측 RAPM 상관, (b) 능력치/OVR 과의 상관(엔진이 능력치를 제대로 반영하는지 점검 겸용), (c) 팀 NRtg 합산 일치도.

### 이름 (원본 상표 회피)
| 원본 | 우리 이름 안 | 내용 |
|---|---|---|
| RPM (ESPN 소유) | **True Impact Margin (TIM)** (2026-10-28 확정) | 박스 프라이어 + RAPM |
| EPM | **Extended Impact Margin (XIM)** (2026-10-28 확정) | 위 + 트래킹 피처 |
| ~~LEBRON~~ | ~~Role-Adjusted Impact (RAI)~~ | **구현 안 함** (2026-10-28) |
| ~~DARKO~~ | ~~Form Rating (FRM)~~ | **구현 안 함** (2026-10-28) |

> 실사용 지표는 **TIM(기본) + XIM(트래킹 확장)** 2개. 시뮬 환경에서는 둘이 많이 겹치므로 XIM 이 TIM 대비 유의한 개선이 없으면 TIM 하나로 통합해도 된다.

## 4. 주의사항
- 이 지표들은 **우리 엔진을 측정**하는 것이지 실제 NBA를 측정하는 것이 아니다. 엔진 밸런스가 바뀌면(PBP 감사 후속 작업 등) 계수 재적합 필요 → 계수 파일에 적합 시점/엔진 버전 기록.
- 어워드 투표(`awardVoting.ts`)·트레이드 가치·AI 단장 판단에 지표를 연결하면 **전술 책임 원칙**([[feedback_tactics_responsibility]])과 충돌하지 않는지 연결 시점에 재검토.
- UI 카피에 "NBA" 단어 금지([[feedback_no_nba_word]]), 지표명은 위 독자 이름 사용. PER/WS/BPM/VORP/Four Factors 는 공개 통계 용어라 그대로 쓰되 "Basketball-Reference" 등 타사 명칭·로고는 쓰지 않는다.
- 엔진/공식 수정 시 `docs/history/dev-log.md` 에 Before/After 기록 (client/server 미러 쌍 둘 다).

## 5. 단계 / 열린 질문
1. Phase A-1 Four Factors → A-2 PER(리그 상수 스냅샷 테이블/저장 위치 설계 포함) → A-3 WS(팀 합계 + 리그 평균 득점/포제션, 같은 스냅샷에 항목 추가 가능) → A-4 BPM/VORP(공개 계수판)
2. Phase B-1 하네스 + 스틴트 로그 → B-2 RAPM → B-3 박스 프라이어 적합(자체 BPM) → B-4 트래킹
3. 열린 질문: ① 이름 안 확정 ② 노출 위치(선수 상세 / 리더보드 / 박스스코어 중 어디) ③ 싱글·멀티 둘 다인지 ④ Phase A 의 BPM 을 공개 계수로 먼저 낼지, B-3 자체 적합을 기다릴지

## 6. 노출 스코프 (2026-10-28 확정)
**범위: 멀티만 · 과거 시즌 값 없음(현재 시즌만) · 모바일(phone) 포함.** 싱글(`LeaderboardView` 등)과 선수 상세 커리어 표는 이번 범위 밖.

| 화면 | 파일 | 추가 지표 | 비고 |
|---|---|---|---|
| 리더보드 Advanced | `views/multi/season/MultiLeaderboardView.tsx`, `data/leaderboardConfig.ts` `ADVANCED_COLUMNS`, `hooks/useLeaderboardData.ts` | PER, WS, WS/48, BPM, VORP, TIM, XIM | 열 추가 + 정렬·히트맵. **계산 허브** — 아래 화면들이 같은 정의를 공유 |
| 로스터 Advanced 스택 | `components/roster/RosterStatsStack.tsx`, `RosterGrid.tsx`, 폰: `PhoneRosterStats.tsx` | 같은 열 | 폰은 `PLAYER_COLUMNS`를 그대로 쓰므로(`mobile-design-system.md` §로스터 통계) 열 정의 추가만으로 전파. 폭이 문제면 가로 스크롤 표 규칙 유지(표를 카드로 접는 변환 금지) |
| 팀 인사이트 | `views/multi/season/MultiTacticsView.tsx` (`OFFENSE_STATS`/`SHOOTING_STATS`/`DEFENSE_STATS`) | Four Factors 공격·수비 8개 + 리그 순위 | 이미 있는 eFG%·TOV%·FTr 외 ORB%, FT/FGA, 상대 DRB% 등 보강. 폰 분기는 이 파일이 `useViewportClass` 사용 중 |
| 선수 비교 | `views/multi/season/MultiPlayerCompareView.tsx` (Advanced 카테고리) | PER, WS, WS/48, BPM, VORP, TIM, XIM | 폰은 "더보기" 메뉴 진입 화면 — 폰 레이아웃 지원 여부 착수 시 확인 |

**제외 확정**: 박스스코어 Advanced 표(PIE 이미 있음), 선수 상세 커리어 표(과거 시즌 값 없음 결정), `PlayerHoverCard`, 싱글 화면, 어워드/HOF/뉴스 카드 로직 연결(표시 아닌 로직이라 별도 계획).

**미확정 해석 (착수 전 확인)**: 사용자 지시 "P0, P1의 선수 비교에만"을 "P0 전부 + P1 중 선수 비교만"으로 해석. TIM/XIM 도 비교 화면에 포함하는 것으로 가정.

**(2026-10-28 갱신)** 퍼센타일 탭에는 시즌 드롭다운(세션에서 진행된 시즌 목록)이 추가됐지만, 지난 시즌 데이터 로딩은 멀티 시즌 전환 구현 이후로 미뤘다(현재 DB 에 시즌 2 이상 없음) — 아래 "과거 시즌 값 없음"은 지난 시즌 선택 시 안내만 나오는 현재 상태로 유효.

**과거 시즌 값 없음의 효과**: 시즌 아카이브(`user_season_history` 계열) 스키마 변경 불필요. 리그 상수 스냅샷도 현재 시즌 1행이면 충분(시즌 종료 후엔 의미 없어도 무방). 시즌 전환 시 새 시즌 스냅샷을 초기화하고 시즌 초 폴백(직전 시즌 값)만 필요하다면 직전 스냅샷 1개는 유지.

## 7. 퍼센타일 랭킹 카드 (2026-10-28 논의, 구성 확정 — 노출 위치만 미정)
Baseball Savant 의 선수 퍼센타일 카드(섹션별 빨강/파랑 막대 + 퍼센타일 원형 + 실제 값)를 농구식으로 옮긴다. 영감만 가져오고 디자인·카피는 자체 제작(타사 로고·명칭 사용 금지).

| 섹션 | 지표 | 데이터 상태 |
|---|---|---|
| Value | **PER**, TIM, XIM, BPM, VORP, WS/48 | 본 계획 신규 지표 (PER 추가 확정) |
| Scoring | TS%, eFG%, USG%, FTr | 기존 (PTS/36 은 리더보드에 없어 제외 결정) |
| Shooting | 3P%, 3PAr, FT%, 림 FG%, 미드레인지 FG% | 기존(존별 FGM/FGA) |
| Playmaking | AST%, TOV%(역방향) | 기존 |
| Rebounding | ORB%, DRB% | 기존 |
| Defense | STL%, BLK%, DFG%(역방향), CONT, TOVF | 기존 |
| **Screening** | **SCRN%**(클린 스크린 비율, 유일한 스크린 성적 지표) + 스크린 능력 점수(제안, §8) | SCRN% 는 엔진 집계 필요·배포 이후 경기부터, 능력 점수는 즉시 가능 |

- **역방향 지표**(TOV%, PF, DFG%)는 막대를 뒤집는다 — 리더보드 `isInverse` 재사용.
- **모집단**: 최소 출전시간 조건 필요(미충족 선수는 퍼센타일 숨김). 값/순위는 `useLeaderboardData` 에서 계산.
- **Screening 섹션은 SCRN% 판정 횟수가 최소치에 못 미치면(배포 직후 포함) 숨김 또는 "집계 중" 표기**(소급 불가).
- 제외: Athleticism(능력치는 재능이지 성적이 아님), 기대 지표 xFG%(xPts 저장 필요, 추후 별도 검토), 플레이타입별 선수 PPP(현재 팀 단위만 집계).
- **확정/미결 (2026-10-28)**: ① 노출 위치: **선수 프로필 화면의 "퍼센타일" 탭(멀티 전용)으로 확정·1차 구현 완료(2026-10-28)** — `PlayerPercentileTab`/`PercentileCard`/`utils/percentileCard.ts`. 현재 카드에는 기존 지표 + SCRN(능력)만 있고 Value 섹션·SCRN% 는 해당 지표 구현 후 `PERCENTILE_METRICS` 에 추가(비교 화면·호버 카드 노출은 보류) ② 모바일은 **섹션 접기 없이 전체 표기**(1차) ③ 색 팔레트는 **하위 파랑 → 평균 회청 → 상위 빨강 발산 스케일**, 레이아웃은 공용 `Table`(flush)로 확정(2026-10-28 사용자 지시). SCRN 설명 문구는 두지 않고, SCRN% 행은 엔진 집계 전이라도 "-"로 표시.

## 8. 스크린 지표 SCRN% (2026-10-28 확정: 스크린 지표는 이것 하나만 표시)
**SCR(횟수)·SAST(스크린 어시스트)는 구현하지 않기로 결정**(이전 B안 등 관련 논의는 폐기). 표시 지표는 **SCRN%** 하나.

| 지표 | 정의 |
|---|---|
| **SCRN%** | 판정된 스크린 중 `clean` 비율 = clean ÷ (clean+partial+fail). 저장은 카운트 `scrClean`/`scrPartial`/`scrFail` 3개 |

**SCRN% 를 고른 이유**: `screenResult` 는 **스크리너 체격·타이밍 vs 스크린 받는 수비수 회피력**으로만 뽑히는 값이라 스크린의 질을 직접 반영한다. SAST 는 득점 결과라 핸들러·슈터 실력에 크게 좌우된다(스크리너 능력이 슈터에 주는 효과는 성공률 최대 약 2.7%p). 엔진이 이미 계산해 이벤트(`pbpTypes.ts` `screenResult?`)에 싣고 있으나 **현재 소비처가 없다**(생산·타입 정의뿐, 2026-10-28 grep).

### 엔진 쪽 근거 (2026-10-28 코드 확인)
- 스크린 판정은 `resolveScreen`(`possessionHandler.ts` ~372~423): PnR_Handler / PnR_Roll / PnR_Pop / **Handoff**. 스크리너 식별 — PnR_Handler=`secondaryActor`, Handoff=`secondaryActor`(공을 건네는 빅), PnR_Roll/Pop=`actor`. (OffBallScreen 은 판정 대상 아님 → SCRN% 에 포함되지 않음.) 일리걸 스크린 파울용 `actualScreener`(~1151~1162)는 Handoff 가 빠져 있어 **재사용 금지**.
- 판정 생략 조건: 킥아웃·스위치·미스 스위치 → `result` undefined. **분모는 "판정된 스크린 수"**이므로 화면에 판정 횟수를 표기하고, 퍼센타일은 **최소 판정 횟수** 조건을 둔다.
- 결과 효과: 슈터 성공률 보너스(클린 +5%p / 부분 +2%p / 실패 0, 마이너스 없음, 지역 방어는 절반).
- 클라/서버 미러: `services/game/engine/pbp/` ↔ `server/src/shared/engine/pbp/`. `screenResult` 줄 번호가 다르다(클라 1642·1653, 서버 1578·1589) — 두 파일 각각 확인해서 수정.

### 구현 단계
1. `PlayerBoxScore`(`types/player.ts`/`types/engine.ts` + 서버 `shared/types`)에 옵셔널 `scrClean`/`scrPartial`/`scrFail` 추가(없으면 0, 기존 박스스코어 호환).
2. `possessionHandler.ts` `resolveScreen` 호출 지점(~1506, 슛 계산 직전)에서 스크리너에게 결과별 카운트. `screenResult` 이벤트 필드는 슛 결과 이벤트에만 실려 누락 가능하므로 이벤트 소비 방식은 쓰지 않는다.
3. `statUtils.ts`/`statsMappers`/`stateReplayer`: 누적·시즌 합산 경로에 3필드 추가. `user_game_results` 박스 JSONB 에 필드만 추가(스키마 변경 없음).
4. `useLeaderboardData`/`leaderboardConfig`: SCRN%(+판정 횟수) 열 추가 → 카드와 리더보드 공용.
5. `dev-log.md` 에 Before/After 기록(클라/서버 쌍 둘 다), 롤백 방법 포함.
6. 검증: 하네스로 N경기 → ① 스크리너 아키타입·고체격 빅의 SCRN% 상위 여부 ② 스크린 능력 점수(아래)와 SCRN% 상관 ③ 같은 시드로 구현 전후 기존 박스스코어 동일(카운트만 추가, 판정 로직 불변).

### 주의사항
- **배포 이후 경기부터 집계**(소급 불가). Screening 섹션은 판정 횟수가 최소치 미만이면 퍼센타일 숨김/"집계 중".
- 서버 배포는 `scripts/deploy-server.sh` 로만.

### 스크린 능력 점수 (2026-10-28 확정 — 카드에 포함)
스크린 "재능"을 능력치로 지표화해 SCRN%(실적) 옆에 둔다.
- **공식은 엔진과 같게**: `power = screener 아키타입(=calculateScreenerPhysique: 근력·키·몸무게) × SIM_CONFIG.SCREEN.PHYSIQUE_WEIGHT(0.7) + offBallMovement × TIMING_WEIGHT(0.3)` (`resolveScreen` 의 `power`). **피로 미반영** 값을 쓴다(자격 판정과 동일 기준). 가중치는 SIM_CONFIG 에서 읽어 엔진과 어긋나지 않게 한다 — 새 상수 만들지 말 것.
- 소스 함수는 `archetypeSystem.ts`(`calculateScreenerPhysique`) 클라/서버 미러 둘 다 이미 있음 → **엔진 변경·저장·소급 문제 없음**, 지금 있는 능력치로 즉시 계산 가능.
- 이름 확정(2026-10-28): **`SCRN`**(스크린 능력 점수, 0~100 능력치 기반). 실적 지표 `SCRN%`와는 % 유무로 구분 — 카드에서 능력 줄은 "능력치 기반" 라벨로 구분. 힘·체격·오프볼무브먼트를 각각 따로 지표로 만들지는 않는다(이미 능력치 화면에 있고, 합성값이 엔진의 실제 판정 입력).
- 카드 표시: Screening 섹션 2줄 — **스크린 능력(재능, 능력치 기반 퍼센타일) / SCRN%(실적)**. 능력 줄은 "성적이 아닌 능력치 기반"임을 라벨·스타일로 구분(이전 결정: 능력치는 성적 카드에 섞지 않는다 — 예외로 확정. **예외 허용 기준(사용자 결정 2026-10-28)**: 속도·민첩성 같은 단일 능력치가 아니라 **여러 능력치(운동능력+오프볼 움직임 등)가 합쳐진 값이고, 그 값이 엔진 판정 입력으로 직접 성적을 결정**하는 경우만 카드에 올린다. 단일 능력치나 판정에 쓰이지 않는 값은 계속 제외).
- 모집단: 능력 점수는 출전시간 조건 없이 전 선수 가능하나, 카드 일관성을 위해 SCRN% 와 같은 모집단(최소 출전) 사용을 기본안으로.
