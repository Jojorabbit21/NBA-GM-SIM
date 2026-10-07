# 리그 세션 감사 로그 (league_action_logs)

> 상태: **구현 완료 (2026-10-05)** — E2E는 사용자 확인 대기. 상세 Before/After는 `docs/history/dev-log.md` 2026-10-05 (1).

## 목적
세션(room) 안에서 사용자가 내린 결정을 **리그 어드민만** 볼 수 있는 한 표에 남긴다. 세션 설정 화면의 "로그" 탭에서 열람.

## 범위 (사용자 확정 A+B)
| 묶음 | action 코드 | 기록 경로 |
|---|---|---|
| 영입/방출 | `fa_sign`, `waive` | `league_transactions` AFTER INSERT 트리거 |
| 트레이드 제안 | `trade_offer_create` / `_accept` / `_reject` / `_cancel` / `_expire` / `_invalidate` | `league_trade_offers` INSERT(지연 제약 트리거) / UPDATE OF status |
| 블록·요구 | `trade_block_set` / `_unset`, `trade_request_update` | `league_trade_blocks` INSERT/DELETE, `league_teams` UPDATE |
| 드래프트 | `draft_pick` | `draft_picks` AFTER INSERT (is_ai → system) |
| 설정/운영 | `league_settings_update`, `team_reassign`, `admin_trade`, `admin_time_jump`, `admin_tactics_update`, `admin_trade_failed`(실패 기록, 클라이언트가 `admin_log_failed_action` RPC 호출, 2026-10-06) | `leagues` UPDATE(컬럼 allowlist 63종 before/after), `league_teams.user_id` 변경, 어드민 RPC 본문 끝 1줄 |

**제외**: 유저 본인의 전술/뎁스차트/로테이션 변경(추적 불필요, 용량 대부분을 차지했을 항목). 단 **어드민이 "팀 전술" 탭에서 남의 팀 전술을 저장한 경우만** `admin_tactics_update`로 diff를 기록(RPC `admin_save_member_tactics`, 2026-10-06).

## 설계 결정
- **트리거 방식**: RPC/클라이언트 코드를 건드리지 않고 기존 표에 AFTER 트리거만 얹음. 유일한 예외가 어드민 RPC 2종(표 변경이 없어서 본문 끝에 1줄).
- **행위자 판정**: `coalesce(auth.uid(), p_actor)` → 리그 admin_user_id면 `league_admin`, `profiles.is_admin`이면 `global_admin`, 없으면 `system`. 이메일/닉네임은 기록 시점 스냅샷(나중에 닉네임을 바꿔도 당시 값 유지).
- **기록 실패는 무시**: `league_action_log_write`가 예외를 삼키고 WARNING만 — 로그 때문에 영입/트레이드 트랜잭션이 실패하면 안 됨.
- **트레이드 제안 생성은 DEFERRABLE INITIALLY DEFERRED**: `league_trade_offer_players`가 offer 행 이후에 들어오므로 커밋 시점에 읽어야 선수 목록이 잡힘.
- **블록 해제는 "선수가 아직 로스터에 있을 때만"**: 트레이드/방출 부수효과로 블록이 지워지는 건 사용자 결정이 아님.
- **보존/삭제**: 리그·룸 삭제 시 CASCADE. 시즌 아카이브 때는 그대로 둠(시즌당 1~2MB).
- **열람**: RLS SELECT = `is_global_admin()` 또는 해당 리그 admin_user_id. INSERT 정책 없음(트리거는 SECURITY DEFINER라 우회).

## 클라이언트
- `services/multi/actionLogService.ts` — 조회 전용(id 내림차순, 50건 커서), 라벨/카테고리 상수.
- `views/multi/league/settings/ActionLogTab.tsx` — 유형·팀·행위자 필터, 요약 한 줄 + JSON 펼침, 새로고침/더 보기. 실시간 구독 없음.
- `LeagueSettingsView.tsx` — `SETTINGS_TABS`에 `log`(저장 버튼 없음).

## 같은 날 추가된 인접 탭
- "팀 전술" 탭(`views/multi/league/settings/TeamTacticsTab.tsx`): 참가자 `room_members.tactics/depth_chart`를 표로 보여주고(보기), 편집 모드에서 어드민이 직접 수정·저장(2026-10-06). 저장은 RPC `admin_save_member_tactics` → 로그 `admin_tactics_update`. 동시 편집 충돌 허용(마지막 저장 우선).

## 남은 것 / 확장 후보
- [ ] 실 리그에서 E2E(각 트리거 발화·탭 렌더) 확인
- [ ] CSV 내보내기, 날짜 범위 필터 — 요청 시
- [ ] 멀티 투웨이 전환/연장 계약 같은 새 결정 유형이 생기면 트리거 추가 + `ACTION_LABELS`/`ACTION_CATEGORIES` 동시 갱신
