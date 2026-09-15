-- ============================================================
-- room_player_state.contract: 멀티플레이어 리그별 계약 오버라이드
--
-- 배경: meta_players.base_attributes.contract를 이제 "2026-27 시즌 기준 실제 계약"을
-- 사람이 직접 조사해 채우는 방식으로 바꾸기로 했다(자동 bbref 갱신 중단). 그런데 멀티
-- 플레이어는 트레이드/FA서명/방출 때 선수 계약을 전혀 리그별로 저장하지 않고 있었다 —
-- services/multi/buildLeagueTeams.ts가 매번 meta_players.base_attributes.contract를
-- 그대로 통과시킬 뿐이라, 리그 A에서 계약이 바뀌어도 리그 B(그리고 meta_players 자체)엔
-- 전혀 반영되지 않고, 같은 리그를 다시 불러와도 원본 값으로 되돌아간다.
--
-- 싱글플레이어는 이미 이 문제를 saves.roster_state[playerId].contract로 풀고 있다
-- (hooks/useGameData.ts) — meta_players는 그대로 두고, 세이브(여기서는 리그) 단위로
-- "바뀐 계약"만 오버라이드 저장. room_player_state는 이미 (room_id, player_id) 단위로
-- 딱 이 역할(부상/체력)을 하고 있는 테이블이라 그대로 확장한다.
--
-- 저장 형태는 types/player.ts의 PlayerContract와 동일: {years, currentYear, type, option?}.
-- null이면 "이 리그에서 이 선수는 아직 원본 계약 그대로"라는 뜻 — meta_players로 폴백한다
-- (hooks/useLeagueRawStats.ts → services/multi/buildLeagueTeams.ts가 이 우선순위로 merge).
--
-- 용량: 새 테이블도, 새로운 (room, player) 행 증식도 아니다 — 이미 존재하는 행에 컬럼
-- 하나 얹는 것뿐이라 증가율은 기존 부상 이력 추적과 동일하다. 계약 하나당 JSONB로
-- 100~300바이트 수준이라 리그 수가 늘어나도 무시할 만한 크기다.
--
-- 이번 백필: 기존에 이미 존재하는 모든 (room_id, player_id) 행에, 그 선수의 현재
-- meta_players.base_attributes.contract(2026-27 시즌 기준 값)를 그대로 복사해 넣는다 —
-- 이 시점 이후로는 각 리그가 자신의 행을 독립적으로 갱신해나가는 출발점이 된다.
-- ============================================================

ALTER TABLE public.room_player_state
    ADD COLUMN IF NOT EXISTS contract jsonb;

UPDATE public.room_player_state rps
SET contract = mp.base_attributes->'contract'
FROM public.meta_players mp
WHERE rps.player_id = mp.id::text
  AND rps.contract IS NULL
  AND mp.base_attributes->'contract' IS NOT NULL;

-- [적용] 2026-09-15 Supabase MCP로 반영
