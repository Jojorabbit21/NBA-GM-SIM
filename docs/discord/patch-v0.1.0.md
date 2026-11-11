## v0.1.0 · 2026년 7월 27~31일 · July 27–31, 2026

### 🏀 경기 엔진 밸런스 · Game Engine Balance

**에이스 판단 — 팀의 1옵션을 선수의 최고 능력과 보조 능력을 함께 보고 정합니다. 골밑 스타 빅맨도 제 몫의 득점을 올립니다**
Ace detection — a team's go-to option is chosen from a player's best and supporting skills. Star bigs near the rim now get their share of scoring.

**플레이타입 배분 — 아이솔레이션·픽앤롤·포스트업·핸드오프 등 각 플레이에 어울리는 선수가 공을 잡도록 선정 방식을 다시 짰습니다**
Play type assignment — selection was rebuilt so the right player handles the ball in isolations, pick-and-rolls, post-ups, and handoffs.

- 킥아웃: 포스트업과 픽앤롤에서 수비를 끌어들인 뒤 밖으로 빼 주는 패스가 생겨 플레이메이킹 빅맨의 어시스트가 늘었습니다
  Kick-outs: passes out of post-ups and pick-and-rolls after drawing the defense raise playmaking bigs' assists
- 리바운드: 공격·수비 리바운드를 따로 판정하고, 허슬과 체격이 반영됩니다
  Rebounds: offensive and defensive boards are resolved separately, factoring in hustle and size
- 파울: 수비가 좋은 빅맨은 파울을 덜 범하고, 미스매치는 파울과 슛 성공률에 함께 영향을 줍니다
  Fouls: strong defensive bigs foul less, and mismatches affect both fouls and shooting
- 도움 수비: 도움 수비 상황의 스틸과 중계 문구가 추가됐습니다
  Help defense: steals from help situations and matching commentary were added
- 속공: 아웃렛 패스와 길게 뿌리는 패스가 속공에 반영됩니다
  Fast breaks: outlet and long passes now feed transition plays
- 턴오버는 플레이 종류에 맞는 능력치로 판정해 빅맨 턴오버가 과하던 문제를 고쳤습니다
  Turnovers use the ratings that fit each play type, fixing excessive big-man turnovers
- 슈팅 효율 상위권이 지나치게 부풀던 문제를 바로잡았습니다
  Fixed inflated shooting efficiency at the top of the leaderboard
- 핫·콜드 흐름은 성공률에 영향을 주지 않는 연출로 바뀌었습니다
  Hot/cold streaks are now presentation only and no longer affect shooting
- AI 자동 전술이 팀의 핵심 선수 유형에 맞춰 공격 방향을 정합니다
  AI auto-tactics choose an offensive direction based on the team's key player types

### 🎯 드래프트 · Draft

**오토픽 — 직접 켜거나, 드래프트 시작 때 입장하지 않았거나, 픽 시간을 연달아 놓치면 자동 지명으로 전환됩니다**
Auto-pick — switches on if you enable it, are absent at draft start, or miss consecutive picks.

- 다시 접속하면 자동으로 해제됩니다(직접 켠 경우는 유지)
  It turns off when you reconnect (unless you enabled it yourself)
- 오토픽 중인 팀에는 AUTO 배지가 붙습니다
  Teams on auto-pick show an AUTO badge

### ⚙️ 안정성 · Stability

- 경기 시뮬레이션을 별도로 처리하도록 서버를 개선해, 경기가 몰려도 접속이 끊기거나 "진행 중인 경기 보기"가 막히지 않습니다
  Game simulation now runs separately on the server, so heavy game loads no longer cause disconnects or block "Watch live games"
- 라이브 박스스코어에 자유투 열과 코트 위 선수 강조가 추가됐습니다
  Live box scores gain a free throw column and highlight players on the court
