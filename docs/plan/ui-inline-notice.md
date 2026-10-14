# 에러·상태 안내 표시 정책(0-7) — 인라인 배치안

> 작성: 2026-10-13. `docs/plan/ui-consolidation.md` 7장 7번의 결정 결과와, 멀티 세션 전 화면을 정독(에이전트 3개)해 뽑은 **자리별 배치안**.
> 디자인 시안: https://claude.ai/artifact/MWDyntdpHNGc8buBeQkuRX (톤 4종 × md/sm, 14개 화면 목업, 좁은 폭 줄바꿈, 아이콘+툴팁 비교).
> 2026-10-02의 "오류는 전부 토스트" 방침을 **이 문서가 대체**한다(`toast-notification-center-plan.md`는 토스트 컴포넌트 설계로만 유효).

## 1. 경계 규칙 (확정)

| 채널 | 들어가는 것 | 수명 |
|---|---|---|
| **토스트** `notify.*` | ① 리그 이벤트(경기 종료·트레이드 오퍼 수신/응답·드래프트 내 차례·시즌 전환) ② **붙을 자리가 없는** 백그라운드 실패(실시간 연결 끊김, 자동 저장 실패, 부트스트랩 재시도 소진) | transient 8초 / 중요 건 수동 닫기 |
| **`InlineNotice`** | ① 버튼 액션의 실패(RPC 거절) ② 폼 검증 ③ 사전 차단·제약 안내 ④ 미저장 경고 ⑤ 저장·완료 확인 | 다음 시도 시작 또는 관련 입력 변경 시 소거. **에러는 타이머로 지우지 않음.** 성공 확인만 `autoHideMs`(2~3초) |
| **`StatusDot`** | 표 행·목록 항목·탭 라벨·칩처럼 조밀한 곳의 **항목별 상태**(무효화됨, 전술 미저장, 후보 부족, 탭 미저장) | 상태가 유지되는 동안 |

판단 기준은 중요도가 아니라 **"메시지가 붙을 자리(anchor)가 있는가"**. 액션 실패를 StatusDot으로 1차 표시하지 않는다(실패 사실이 20px 점에 묻히고, 이유를 보려면 호버가 필요하며, 터치엔 호버가 없음).

## 2. 컴포넌트 (2026-10-13 신설)

- `components/common/InlineNotice.tsx` — `tone: danger|warning|info|success`, `size: md|sm`, `onDismiss?`, `autoHideMs?`.
  - md: 틴트 박스, **아이콘 없음·라운드 없음**, 패딩 12/16px, 14px/20px, 부모 가로 폭을 채움(1줄 44px, 2줄 64px). 최소 권장 폭 180px.
  - sm: 글자만 12px/16px. 버튼 옆·입력 아래·탭 바 `rightSlot`.
  - 톤 색: danger `red-500/10 · red-500/20 · red-400`, warning `amber-500/10 · /20 · amber-400`, info `indigo-500/10 · /30 · indigo-300`, success `emerald-500/10 · /30 · emerald-400`.
  - `break-keep` 어절 줄바꿈, 말줄임 없음. danger는 `role="alert"`.
- `components/common/StatusDot.tsx` — `tone`, `label`(필수, 툴팁+aria-label), `size: sm 16|md 20`. lucide `AlertCircle/AlertTriangle/Info/CheckCircle2`. 툴팁은 `InjuryStatusBadge`와 같은 body 포탈 + `z-tooltip`, 호버·포커스·클릭 토글(터치)·Escape.

## 3. 선행 작업 — 한국어 문구 매핑이 없는 서비스

인라인으로 옮겨도 문구가 `not_team_owner`, `pick_count_mismatch: expected 2 got 1`이면 정책 목적이 달성되지 않는다. 치환 전에 서비스 레이어에서 매핑한다.

| 서비스 | 상태 | 할 일 |
|---|---|---|
| `services/multi/faService.ts` `mapFaError` | 13종 한국어 + 기본 문구 | 없음(안전) |
| `services/multi/tradeService.ts` `mapTradeOfferError` | 20종 한국어, **기본값 `return msg`(영어 원문)** | 기본 문구 "요청 처리 중 오류가 발생했습니다."로 |
| `services/multi/tradeService.ts` `setTradeBlock/updateTeamTradeRequest` | 원문 반환(모달이 고정 문구로 덮음) | 없음 |
| `services/multi/personalDraft.ts` 3함수 | **매핑 전무**(RPC 코드: `not_team_owner, not_personal_draft_league, draft_not_started, draft_already_completed, pack_not_generated, pick_count_mismatch, duplicate_card, player_not_in_pack, duplicate_player, invalid_format, invalid_round_config`) | `mapPersonalDraftError` 신설 |
| `hooks/useLeagueDraft.ts` `submitPick` | 클라 `not authenticated / not your turn / connection lost / timeout` + 서버 `draft_not_active, not_your_turn, already_drafted, unauthorized, internal` | `mapDraftError` 신설 |
| `services/multi/leagueService.ts` `joinLeague` | `room not found` + DB 원문 | 매핑 추가 |
| `leagueService.ts` `claimTeam` | 3종 한국어 + 기본 원문 | 기본 문구 추가 |
| `leagueService.ts` `releaseTeam/leaveLeague` | 1종 한국어 + 원문 | 기본 문구 추가 |
| `leagueService.ts` `updateLeagueSettings/updateTeamName/updateTeamProfile/resetTournament/applyLeagueReschedule/adminTimeJump` | 원문 | 기본 문구 추가(함수별 "…에 실패했습니다") |
| 서버 `/start-draft`, `/run-lottery`, `/sim-override` 응답 | `Unauthorized, Forbidden, league not in recruiting status, draft already started, Room not found` | 클라에서 코드→문구 매핑 |

## 4. 화면별 배치안

표기: **md/sm** = InlineNotice 크기, 톤은 괄호. "현재" 열의 **토스트**는 제거 대상. 줄 번호는 2026-10-13 워킹트리 기준.

### 4-1. 협상·방출·FA·트레이드

| 화면 | 자리 | 트리거 | 현재 | 제안 | 앵커 / 소거 |
|---|---|---|---|---|---|
| 협상 `MultiNegotiationView` | L1529 | `isRosterFull` 사전 차단 | amber 박스+ShieldAlert+rounded-xl | **md(warning)** | 제출 버튼 위(현 위치). `isTwoWaySlotsFull`도 같은 박스로 확장(지금은 버튼 라벨만) |
| | L1536 | `signFreeAgentNegotiated` 거절(`mapFaError`) | red 박스+아이콘 | **md(danger)** | 제출 버튼 위. 소거: 다음 시도 시작(현행) + **연봉/연수 입력 변경 시 추가** |
| | L1549 | 버튼 라벨 "로스터 정원 초과/투웨이 정원 초과" | 라벨 | 라벨은 "오퍼 제출"로 되돌림(박스와 중복) | — |
| | `isOnCooldown` | 쿨다운 중 | 채팅 말풍선만 | **md(info)** 후보 "N일 뒤 다시 협상할 수 있습니다"(선택) | 우측 패널 상단 |
| 방출 `MultiReleaseView` | L680 | `releasePlayer` 거절 | red 박스 | **md(danger)** | 확인 버튼 위. 확인 모달이 닫힌 뒤 보이므로 순서 OK |
| | L558 | 스트레치 불가 사유 5종(사전 차단) | **red 글자 14px**(에러로 오인) | **sm(warning)** | 스트레치 체크박스 아래 |
| FA `MultiFreeAgentView` | L160 | 즉시 계약(`handleSign`) 거절 — **CBA 꺼진 리그 한정**(`cba_rules_enabled`면 버튼이 협상 화면으로 이동만 하므로 FA 화면에 실패 없음). 실제 발생은 `player_already_signed`(타 팀 선점 경합)·`roster_full`(다른 탭/트레이드로 정원이 찬 직후) 같은 **경합 케이스** | **토스트** | **md(danger)** + 문구에 선수명 포함 | 툴바 아래·표 위 띠(전체 폭). 행 셀은 `width:1%`라 불가. 소거: 다음 `handleSign` 시작 |
| | L408 | CBA 꺼짐 + 정원 가득 → 버튼 disabled | `title` 툴팁 | **현행 유지** (2026-10-13 결정: 정원 가득은 실패가 아니라 상태이고 버튼 비활성+툴팁이 이미 사전 차단. 상시 띠는 소음, 행마다 StatusDot도 과함) | — |
| 트레이드 `MultiFrontOfficeView` | L700 + L1235 | `respondTradeOffer` 거절 | **토스트 + 인라인 red 글자 이중** | 토스트 제거 → **md(danger)** | 제안서 본문 하단, 버튼 행 위(현 `respondFailures` 자리). 소거: 같은 제안 재시도(현행) |
| | L1018 | `createTradeOffer` 거절 | **토스트** | **md(danger)** | 우측 열 "제안 보내기" 위. 폭 1024px 기준 약 172px(**미달 가능**) → 1280px 기준 231px. 소거: 전송 시작 + 카트 변경 |
| | L1895~1905 | `tradeSendErrors`(로스터 슬롯 초과 4종) + `salaryMatchErrors` | **fuchsia 글자** | **md(warning)** | 캡 요약 아래·메시지 위(현 위치) |
| | L1225~1231 | `salaryMatchWarnings` — 발신 시점엔 매칭이 맞았지만 **열람 시점의 양 팀 페이롤**(그사이 체결된 다른 트레이드·FA 계약·방출·데드머니 변동)로 다시 계산해 어긋난 경우. 서버가 수락 시 같은 검사로 거부하므로 그 예고 | fuchsia 글자 + "(수락 시 서버에서 거부됩니다)" 접미 | **md(warning)**, 접미 문구 **제거**(2026-10-13 결정 — 문구는 매칭 사실만, 거부 예고는 수락 실패 md danger가 맡음) | 수신 상세, 캡 변화 아래 |
| | L1264~1271 | `status === 'invalidated'` | **문구 없음**(`: null`) | **md(warning)** "선수 구성이 바뀌어 제안이 무효화되었습니다"(서버 사유 확인 필요) | 결과 문구 자리 |
| | L1675/1924 | 데드라인 경과 | 칩 비활성 + 버튼 라벨 | **sm(warning)** "트레이드 데드라인이 지났습니다 (날짜)" — 화면 헤더 우측의 데드라인 날짜 텍스트 **자리를 대체**(2026-10-13 결정, md 아님) + 버튼 라벨 원복 | 헤더 `justify-between` 우측 끝 |
| | L1267 | "트레이드가 거절되었습니다" | red 굵은 글자 | 상태 라벨 — 대상 아님 | — |
| 트레이드 블록 모달 `MyTradeBlockModal` | L207 | 저장 실패(고정 문구) | **토스트** | **sm(danger)** 업데이트 버튼 왼쪽(성공 표시와 같은 자리) — 폭 부족하면 툴바 아래 md | 소거: 저장 시작 + 편집 변경 |
| | L120 | "저장 완료" 2초 | 인라인 emerald | **sm(success) autoHideMs=2000** | 같은 자리 |
| | 닫기 | dirty 상태에서 닫아도 경고 없음 | **없음** | **sm(warning)** "저장되지 않은 변경사항이 있습니다." — 업데이트 버튼 **왼쪽**(저장 실패/완료 sm과 같은 슬롯, 2026-10-13 결정으로 md→sm) | dirty 해제 시 |

### 4-2. 로비·드래프트·팀 설정 모달

| 화면 | 자리 | 트리거 | 현재 | 제안 | 앵커 / 소거 |
|---|---|---|---|---|---|
| 로비 `LeagueLobbyPanel` | L311 | 참가/선점/탈퇴/강퇴 실패 | red-900/20 박스 text-xs | **md(danger)** (타이밍 안내 문구는 warning) | "참가 팀" h3 아래·목록 위(좌측 열 ≈600px) 또는 현 위치. 소거: 다음 시도(현행) |
| | L596 | 마감 전 자동 강퇴 경고 | amber 글자 | **sm(warning)** | 현 위치 |
| | L232 | `handleKick` 실패해도 `reload()` | — | 의도 확인 후 정리 | — |
| 개인 드래프트 `PersonalDraftView` | L242 | RPC 실패(영어 원문) | red 박스 text-xs | **md(danger)** (매핑 선행) | 중앙 열 상단(≈800px). 소거: 제출 시작(현행) + **카드 재선택·팩 변경 시 추가** |
| | L237 | `lastAutoPicked` 자동 지명 안내 | amber 박스, 닫기 없음 | **md(warning) + onDismiss** | 같은 자리 |
| | `usePersonalDraft` L355~360 | `expired` → `error`에도 세팅 | **같은 사건이 amber+red 두 박스** | `setError` 제거, `lastAutoPicked`로 일원화 | — |
| 드래프트 룸 `MultiDraftView` | L503 | `pickError`(영어 코드) | red 글자 띠 | **sm(danger)** 선수 풀 툴바의 "드래프트" 버튼 **왼쪽**(2026-10-13 결정, md→sm) (매핑 선행) | 소거: 다음 시도(현행) + **내 차례 종료/드래프트 상태 변경 시 추가** |
| | `useLeagueDraft` L262~271 | `toggleAutoPick/sendAdmin`·`submitPick` 소켓 닫힘 | **무표시** | **sm(danger)** 같은 자리(드래프트 버튼 왼쪽) "연결이 끊겨 지명을 보낼 수 없습니다. 다시 연결 중…" — pickError와 한 슬롯 공유 | 재연결 시 |
| 팀 설정 패널 `TeamSettingsPanel` | L149 | 드래프트 중 변경 불가 | amber 박스 rounded-xl | **md(info)** | 폼 위(현 위치) |
| | L261 | `saveErr`(검증 2종 + RPC 원문) | red 글자 | 검증 → 해당 입력 아래 **sm(danger)**, RPC → 저장 버튼 위 **md(danger)** | 소거: 저장 시작(현행) + **입력 변경 시 추가** |
| | L210 | 색 대비 경고 `⚠` | amber 글자 | **sm(warning)**, `⚠` 제거 | `TeamSetupModal` L164와 중복 → 공통화 |
| 팀 설정 모달 `TeamSetupModal` | L170 | 검증 6종 + 저장 원문 | red 글자 | 최소안 **md(danger)** 현 위치(폭 ≈336px) | 소거: 저장 시작·모달 열 때(현행) + 입력 변경 |
| 팀 선택 모달 `TeamSelectModal` | L134 | join/claim 실패 | red 글자 | **md(danger)** 푸터 첫 자식 | 소거: 팀 재선택·시도 시작(현행, 양호) |
| | L36 | 목록 로딩 실패 → 스피너 고착 | **무표시** | **md(danger)** + 다시 불러오기 | — |
| 리그 생성 모달 `CreateLeagueModal` | L1176 | 검증 13종 + 서비스 원문 | red 글자 | 서버 거절 → 푸터 **md(danger)**; 날짜 검증 5종은 해당 입력 아래 **sm(danger)**(2단계) | 소거: 검증 통과 후에만(현행) → **입력 변경 시 추가** |
| | L971 | `lateGameClamped` | amber span | **sm(warning)** | 도움말 아래 |
| | L1004~1028 | `timelineFeasibility` 불가 | red 틴트 박스 + ul | 에러 부분만 **md(danger)**(ul 포함, 자유 높이) | 현 위치 |
| 포맷 편집기 `PersonalDraftFormatEditor` | L417~428 요약 박스 | `syncError`(danger) / `checkErr`(danger) / `rosterWarn`(warning) / 성공(success) 5분기 | 박스 색 분기 + AlertTriangle 3개 | 박스 바탕은 `slate-800/60` 고정, 안내만 **md** 4톤으로 박스 밖(이중 틴트 회피) | `checkErr` 입력 변경 소거 이미 구현, **`positionTargets` 의존성 누락** 보완 |
| | L345/390 | 라운드별 후보 부족 | 행 red 배경 + 숫자 red | **StatusDot(danger)** 후보 열 | — |
| 닉네임 모달 `NicknameModal` | L79 | 저장 실패(고정 문구) | red 글자 | **sm(danger)** 입력 아래(2026-10-13 결정, md→sm — 모달이 작아 글자만) | 소거: 저장 시작(현행) + 입력 변경 |
| | L40 | `league_teams` 닉네임 동기화 실패 무시 | **무표시** | 실패 시 같은 md로 안내 | — |

### 4-3. 리그 설정·전술·PBP

| 화면 | 자리 | 트리거 | 현재 | 제안 | 앵커 / 소거 |
|---|---|---|---|---|---|
| 리그 설정 `LeagueSettingsView` | L1007 | 6개 탭 공용 저장 실패(`TAB_SAVE_MAP`) | TabBar `rightSlot` red span 12px | **md(danger) 탭 바 바로 아래, 스크롤 영역 밖**(`shrink-0` 형제). sm은 폭(≈200~300px)·문구 길이(풀 부족 100자)로 기각 | 소거: 자기 탭 저장 시작(현행) + **탭 전환·폼 수정 시 추가** |
| | L1160 / L1263 | 초기화·삭제 실패 | red 글자 | **md(danger)** 확인 박스 안 버튼 행 위 | 시작·취소 시(현행) |
| | L2199 / L2219 | 드래프트 시작·추첨 실패(서버 영어) | red 글자 | **sm(danger)** 버튼 오른쪽 (매핑 선행) | 시작 시(현행) |
| | L2231 | "recruiting 상태에서만 추첨 가능합니다." | slate 글자 | **sm(info)** + 문구 한국어화 | 조건 해소 |
| | L931 | 팀 이름 저장 실패 | red 10px | **sm(danger)** 12px(td 폭 <180) | 해당 팀 저장 시작(현행) + 입력 변경 |
| | L652 `handleKick` | 추방 실패 **무표시**, `leagueStatus` 미전달 | 없음 | `kickErr` 신설 → **sm(danger)** 같은 td | 재시도 |
| | L1028 | 세션 진행 중 제약 | indigo section rounded-2xl | **md(info)** 본문 맨 위. **문구 수정**: trade/cap/roster/engine/schedule 탭은 진행 중에도 저장 가능하므로 league/draft 탭에만 노출하거나 문구 변경 | — |
| | L1597 | 계약 규칙 잠김 | slate 글자 | **md(info)** | — |
| | L683 | 페이지 로드 실패 | red 아이콘 + slate 글자 | 본문 대체 **md(danger)** + 다시 불러오기(`reload`) | — |
| | L1137 / L2171 | "기록 자동 저장 완료" / "추첨 완료" | emerald 글자 | **StatusDot(success)** 섹션 헤더 | — |
| | 탭 라벨 6개 | `isXTabDirty` | 없음(`window.confirm`만) | **StatusDot(warning)** 탭 라벨 옆 — TabBar에 슬롯 추가 필요 | — |
| 일정 탭 `ScheduleSettingsTab` | L550 | 구 구조 재배치 불가 | amber 글자 | **md(warning)** | h2 아래 |
| | L578 | `lateGameClamped` | amber span | **sm(warning)** | 도움말 끝 |
| | L617 / L618 | `settingsMsg`/`applyMsg` (실패 원문 / 성공 긴 안내) | 12px emerald/red, **둘이 동시에 뜰 수 있음** | **하나의 슬롯으로 합쳐 md(danger/info)**, 짧은 "저장됨"은 sm(success) autoHide | 버튼 행 아래. 소거: 다음 시작(현행) |
| | L643 / L649 / L713 / L724 / L727 | 재배치·점프 사전 차단(실시간) | AlertTriangle + red/amber | **md(danger/warning)** 아이콘 제거 | 실시간 |
| | L709 | `jumpMsg` | 12px | **md** 버튼 행 아래 | 다음 시작 |
| | L768 | `editErr` 경기 시각 수정 실패 | red 띠 | **md(danger)** 같은 자리 + 해당 행 **StatusDot(danger)** 보조 | 소거: 성공 시만(현행) → **재시도 시작·편집 취소 시 추가** |
| 개인 드래프트 설정 탭 `PersonalDraftSettingsTab` | L174 | 검증 2종 / `built.error`·원문 | 헤더 버튼 옆 red 12px | 검증 → 마감 입력 아래 **sm(danger)**; 저장 실패 → 헤더 아래 **md(danger)** | 저장 시작(현행) + 입력 변경 |
| | L187 / L193 | 옛 포맷 / 포맷 잠김 | amber-950 박스 + 아이콘 | **md(warning)** / **md(info)** | — |
| 팀 전술 탭 `TeamTacticsTab` | L155 | 멤버/선수 조회 실패 | **토스트**(실패가 "참가자 없음"으로 보임) | 본문 대체 **md(danger)** + 다시 불러오기(`setTick`) | 로드 시작 시 소거 |
| | L208 | 로스터 조회 실패 → 스피너 영구 | **토스트** | 스피너 자리 **md(danger)** + 다시 시도(effect에 tick 의존성 추가) | 편집 재진입·팀 변경 |
| | L260 | 저장 실패 | **토스트** | **md(danger)** 헤더 행 아래 | 저장 시작·팀 전환·편집 종료 |
| | L269 | 저장 성공 `notify.success` | **토스트** + 버튼 "저장됨" 플래시 | 토스트 제거(버튼 플래시로 충분) | — |
| | L304 | isDirty | amber 12px | **sm(warning)** | 현 위치 |
| | L360 / L381 | 자동 생성 초안 / 전술 미저장 | amber-300 글자 | **md(warning)** | — |
| | L335 | 팀 칩 "전술 미저장" `title` | 툴팁만 | **StatusDot(warning)** 칩마다 | — |
| 로그 탭 `ActionLogTab` | L88 최초/필터 | 로드 실패 | **토스트**(빈 표로 오인) | 표 자리 **md(danger)** + 다시 불러오기(`load(null)`) | 모든 load 시작 |
| | L88 더 보기 | 페이지 추가 실패 | **토스트** | **sm(danger)** 더 보기 버튼 옆 | 다음 load |
| 어드민 시뮬 `AdminSimView` | L327 | 경기 시각 수정 실패 | red 12px | **md(danger)** 목록 상단 | 성공 시만(현행) → 시작·취소 시 추가 |
| | L119 | 배치 시뮬 경기별 실패 | 로그 패널 red | 유지(로그 패널이 자리). 선택: 종료 후 `fail>0`이면 **md(warning)** 요약 | — |
| 전술 `MultiTacticsView` | L520 | isDirty | amber 12px | **sm(warning)** rightSlot | — |
| | L193~199 | 저장 실패 **완전 무시**(토스트·인라인·console 없음) | **없음** | **sm(danger)** 저장 버튼 왼쪽, 고정 문구. **같은 슬롯에서 danger가 isDirty warning을 대체**(2026-10-13 결정 — 두 문구 동시 표시 금지, 실패 중엔 미저장 경고 숨김) | 다음 저장 시작·성공 |
| 경기 PBP `MultiGamePbpView` | L1361/L2018 | `/live-game` 실패 → **화면 전체 회색 1줄** "준비하는 중"(실패인데 진행처럼 읽힘). 라이브 폴링(5초) 1회 실패에도 전체 대체, final은 재시도 없음 | slate 글자 | **원인별 5상태**(2026-10-13 결정, `fetchLiveGameView`의 HTTP 상태/`ok:false` 사유로 분기): ① 정상 ② **준비 중(404 `not found`)** — 헤더 유지, 본문 md(info) "경기 데이터를 준비하는 중입니다. 잠시 후 자동으로 다시 불러옵니다." + 5초 자동 재시도 ③ **로드 실패**(최초 조회의 네트워크/5xx) — 본문 md(danger) `w-full max-w-md` + 다시 시도 버튼(effect tick) ④ **접근 불가(403)** — md(danger) "이 리그의 참가자만 경기 기록을 볼 수 있습니다." + 뒤로가기(재시도 없음) ⑤ **라이브 일시 오류**(이미 `gameData` 있는 상태의 폴링 실패) — 데이터 유지 + 가운데 열 상단 md(warning) "연결이 불안정합니다. 마지막 수신 HH:MM:SS — 자동으로 다시 시도합니다.", 연속 2회 실패부터 표시. 401은 `handlePossibleDeadSession`에 맡기고 배너 없음 | ②③⑤ 다음 폴링 성공 시, 경기 전환 시 |
| 일정 / 브래킷 / 순위표 | — | 에러·안내 없음 | — | 대상 없음 | — |

### 4-4. 드래프트 룸 연결 끊김 보강 (2026-10-13 결정 — 치환 단계에 포함해 한 번에 작업)

현재 `hooks/useLeagueDraft.ts`는 `onclose` → 지수 백오프(1s→최대 10s) 재연결 + 재연결 시 서버 `snapshot` 재수신까지는 되어 있으나, 끊김을 UI에 알리지 않고(`console.log`뿐) 좀비 소켓도 감지하지 못한다. 인라인 "연결 끊김" sm을 실제 상태로 그리기 위한 선행 보강:

| # | 보강 | 위치 | 내용 |
|---|---|---|---|
| 1 | **연결 상태 노출** | `useLeagueDraft` 반환값 | `connectionState: 'connecting' \| 'connected' \| 'reconnecting'` + `reconnectAttempt: number`. `onopen`→connected, `onclose`→reconnecting(+attempt++), 성공 시 0으로 |
| 2 | **좀비 소켓 감시** | 30초 `ping` 루프 | `pong` 미수신이 2회(60초) 연속이면 `ws.close()`로 강제 종료 → 기존 재연결 루프에 태움. `ws.onmessage`의 `pong`에서 `lastPongAt` 갱신 |
| 3 | **복귀 즉시 재연결** | `window` 이벤트 | `online`·`visibilitychange(visible)` 시 readyState가 OPEN이 아니면 백오프 타이머를 취소하고 즉시 `connect()`(백오프 리셋) |
| 4 | **끊김 중 입력 차단** | `MultiDraftView`/`MyRoster` | `connectionState !== 'connected'`면 드래프트 버튼·오토픽 토글 disabled, 툴바 "드래프트" 버튼 왼쪽 sm danger "연결이 끊겨 지명을 보낼 수 없습니다. 다시 연결 중… (N회)". `toggleAutoPick/sendAdmin`의 조용한 return은 이 차단으로 대체(호출 자체가 안 됨) |
| 5 | **에러 코드 한국어 매핑** | `useLeagueDraft` 또는 `utils/draftErrors.ts` | `not authenticated / not your turn / connection lost / timeout / draft_not_active / not_your_turn / already_drafted / unauthorized / internal` → 한국어. `already_drafted`는 "이미 지명된 선수입니다. 목록을 새로고침합니다." + 풀 갱신 |
| 6 | **pickError 소거 규칙** | `MultiDraftView` | 다음 시도 시작(현행) + 내 차례가 끝나거나 `currentPickIndex`가 바뀌면 소거 |

참고: 서버(`DraftRoom`)는 이미 클라이언트와 무관하게 픽 타이머를 돌리고(타임아웃 시 베스트 선수 자동 지명, 연속 미스 시 오토픽 전환, 재접속 시 시스템 오토픽 자동 해제) 있으므로 서버 쪽 변경은 없다. 보드의 온라인 외곽선은 Supabase presence 기준이라 WS 끊김과 불일치할 수 있음 — 이번 범위에선 손대지 않는다(별도 항목).

## 5. 토스트 제거 대상 (전부 붙을 자리 있음)

`MultiFreeAgentView` L160 · `MultiFrontOfficeView` L700, L1018 · `MyTradeBlockModal` L207 · `TeamTacticsTab` L155, L208, L260, L269(success) · `ActionLogTab` L88 — **9곳**. 조사 범위에서 "토스트 유지"로 판정된 곳은 0.
토스트에 남는 것: `useLeagueNotifications`(리그 이벤트), 부트스트랩 게이트 재시도 소진, 실시간 채널 끊김(현재 무표시 — 후속).

## 6. 조사 중 발견한 버그·사각지대 (인라인화와 함께 처리)

1. `usePersonalDraft` L355~360 — `expired`를 `error`에도 세팅해 amber+red 이중 표시
2. `MultiFrontOfficeView` L700+L1235 — 응답 실패 토스트+인라인 이중
3. `MultiTacticsView` L193 — 저장 실패 완전 무시
4. `LeagueSettingsView` L652 — 추방 실패 무표시, `leaveLeague`에 `leagueStatus` 미전달(사전 차단 문구 죽은 코드)
5. `LeagueSettingsView` L1028 — "팀 강퇴만 가능" 문구가 저장 가능한 탭에서도 노출
6. `leagueService.updateLeagueSettings` — `leagues` 반영 후 `rooms/league_teams` 실패 시 `reload()` 없이 폼만 dirty(부분 저장)
7. `MyTradeBlockModal` — `Promise.all` 부분 성공을 전체 실패로 표시, 닫기 시 미저장 경고 없음
8. `TeamTacticsTab` L197/L208 — 로스터 빈 팀·조회 실패 시 `editReady` 영구 false(스피너 고착)
9. `TeamSelectModal` L36 — 목록 로딩 `.then`만, 실패 시 스피너 고착; claim 실패 후 `selectedId`가 남의 팀을 가리킬 수 있음
10. `NicknameModal` L40 — `league_teams` 동기화 실패 무시(프로필만 바뀜)
11. `useLeagueDraft` L262~271 — `toggleAutoPick/sendAdmin` 소켓 닫힘 시 무반응
12. `MultiGamePbpView` — 라이브 폴링 1회 실패에 전체 화면 대체, final 실패 시 재시도 불가, 문구가 "준비하는 중"
13. `ScheduleSettingsTab` — `settingsMsg`/`applyMsg` 동시 표시
14. `PersonalDraftFormatEditor` L106 — `checkErr` 소거 effect에 `positionTargets` 의존성 누락
15. `LeagueLobbyPanel` L232 — `handleKick` 실패 후에도 `reload()`
16. `TeamSettingsPanel` L210 / `TeamSetupModal` L164 — 색 대비 경고 중복 코드
17. `MultiReleaseView` L558 — 사전 차단 사유가 red(에러)로 표시

## 7. StatusDot 후보 (항목별 상태)

| 위치 | 상태 | 확신 |
|---|---|---|
| 트레이드 인박스 행 `renderOfferListRow` | invalidated / expired | 높음 |
| 트레이드 블록 표 "제안하기" 열 | AI 팀이라 제안 불가 | 중간 |
| 포맷 편집기 라운드 행 후보 열 | 후보 부족(`title` 이미 있음) | 높음 |
| 설정 탭 라벨 6개 | 탭 미저장 | 높음(TabBar 슬롯 필요) |
| 팀 전술 탭 팀 칩 | 전술 미저장 | 높음 |
| ~~설정 섹션 헤더~~ | 추첨 완료 / 기록 저장 완료 — **기각(2026-10-13)**, 기존 텍스트 유지 | 중간 |
| 일정표 행 | 시각 수정 실패(보조) | 낮음 |
| 개인 드래프트 카드 `disabledReason` | 비활성 사유 | 미확인(카드 컴포넌트 미정독) |
| 로비 팀 행 | 드래프트 완료 여부 | 미확인(데이터 소스 없음) |

## 8. 결정 (2026-10-13 목업 검토로 확정 — https://claude.ai/artifact/3QBTroEtbtRsgzduQZJK4g 24화면)

목업 검토에서 바뀐 것: FA 정원 가득 띠 제거(계약 실패는 CBA 꺼진 리그 한정) · 트레이드 데드라인 경과 → 헤더 날짜 자리 sm · 수신 오퍼 샐러리 경고 접미 제거 · 트레이드 블록 모달 미저장 → 업데이트 버튼 왼쪽 sm · 드래프트 룸 두 안내 → 드래프트 버튼 왼쪽 sm(+4-4 연결 보강) · 닉네임 모달 sm · 전술 저장 실패 시 미저장 warning 숨김(같은 슬롯은 danger 우선) · PBP 5상태.

남아 있던 5항목은 아래 기본안으로 확정:
1. **트레이드 새 제안 우측 열**: 그대로 md(1024px에서도 2~3줄로 접힐 뿐 깨지지 않음). 1024 미만은 지원 범위 밖
2. **리그 설정 세션 진행 중 문구**: league/draft 탭에서만 노출하고 문구는 "세션이 진행 중입니다. 리그 기본 설정과 드래프트 설정은 변경할 수 없습니다."
3. **TeamTacticsTab 저장 성공 토스트**: 제거(버튼 "저장됨" 플래시만)
4. **폼 검증 입력별 분리**: 1차는 현 슬롯 교체(md/sm), 입력별 분리는 2차
5. **PBP**: 5상태 분기(4-3 표 참조)

공통 규칙 추가: **한 슬롯에 danger와 warning이 겹치면 danger만**(미저장 warning은 저장 실패 중 숨김).

## 9. 치환 순서 — 진행 상태 (2026-10-13)

1. ✅ 3장 한국어 매핑 — `actionErrorCatalog.ts`(`actionFailure`/`httpActionFailure`), `utils/draftErrors.ts`, `mapPersonalDraftError`, `mapTradeOfferError` 기본값, `leagueService` 33곳 (dev-log "1단계")
2. ✅ 4-1 협상·방출·FA·트레이드·블록 모달 — 토스트 4곳 제거 (dev-log "2단계")
3. ✅ 4-2 로비·개인 드래프트·드래프트 룸(+4-4 WS 보강 전부)·팀 설정·모달 5종 (dev-log "3단계")
4. ✅ 4-3 리그 설정 6탭·어드민 시뮬·전술·PBP 5상태 — 토스트 5곳 제거, 멀티 스코프 `notify.error/success` 0 (dev-log "4단계")
5. ◐ StatusDot — 적용 4곳: 트레이드 인박스 행(무효화/만료), 팀 전술 탭 팀 칩(전술 미저장), 포맷 편집기 라운드 행(후보 부족), ✅ 설정 탭 라벨(2026-10-13, TabBar `tabs[].dot` 슬롯 신설 — TAB_SAVE_MAP 6탭의 dirty → warning 점). ✅ 일정표 행 시각 수정 실패(2026-10-13 — 점이 아니라 행 편집 입력 아래 danger sm으로, 이유가 호버 뒤에 숨지 않게. 상단 editErr 슬롯은 "지금 바로 시작" 실패 전용). **기각(2026-10-13 결정)**: 섹션 헤더 2곳 — "추첨 완료"는 본문에 이미 완료 문장+순서 그리드가 있고, "기록 자동 저장 완료"는 헤더 우측 텍스트가 이미 있어 점으로 바꾸면 호버해야 읽혀 정보가 줄어듦. 섹션 헤더처럼 글자를 쓸 자리가 있는 곳은 텍스트 유지
6. ◐ 6장 버그 중 인라인화와 무관한 것 — ✅ ⑥·⑦은 **"부분 저장" 자체를 제거**(2026-10-13 결정: 한 건이라도 실패면 저장 불가): `update_league_settings_atomic`·`set_trade_block_batch` RPC(트랜잭션)로 이관, `migrations/atomic_trade_block_and_league_settings.sql`. ✅ ⑩ `NicknameModal`도 `set_my_nickname` RPC로 원자화(`migrations/set_my_nickname_atomic.sql`). ✅ ⑮ 로비 `handleKick` 실패 시 `return`으로 통일. **6장 17건 전부 해소.**

**2차로 미룬 것**: 폼 검증을 입력별 sm으로 분리 — ✅ TeamSetupModal 6종·PersonalDraftSettingsTab 2종(2026-10-13, `fieldErrors` 맵 패턴 + ColorField `error` prop, 설계 목업 https://claude.ai/artifact/CaKweUpxAcXQiAEQ28ttqh). ✅ CreateLeagueModal 13종(2026-10-13 같은 패턴, 8개 FieldKey, 어드민 아님·타임라인 가능성·서버 실패만 푸터 md 유지). ✅ TeamSettingsPanel 9종(2026-10-13, 닉네임 + 팀 컬러 4 + 코트 컬러 4 — `setSaveErr`로 검증하고 있어 이전 grep에서 누락됐던 것). **폼 검증 입력별 분리 전부 완료.**
**목업과 다른 점**: PBP 로드 실패 화면은 헤더 없이 본문만(헤더가 팀 데이터를 필요로 함); 리그 설정 드래프트 탭의 추첨/시작 실패 sm은 버튼 오른쪽이 아니라 버튼 위 같은 자리.
