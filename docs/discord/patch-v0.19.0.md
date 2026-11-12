## v0.19.0 · 2026년 11월 12일 · November 12, 2026

### 📊 새 지표 — 임팩트 · New Metrics — Impact

선수가 코트에 있을 때 팀의 득점과 실점을 얼마나 움직이는지 보여 주는 지표가 생겼습니다. 이 게임의 경기 데이터로 직접 만든 지표입니다.
New metrics show how much a player moves his team's scoring and points allowed while he is on the floor. They are built from this game's own play data.

**BIM — 박스 임팩트 마진 (Box Impact Margin)**

- 박스스코어 기록으로, 그 선수가 뛰는 동안 팀 득실차가 100포제션당 몇 점 달라지는지를 추정합니다
  Estimates from box score stats how many points per 100 possessions a player shifts his team's margin
- **OBIM**은 공격 쪽(팀 득점), **DBIM**은 수비 쪽(팀 실점)이고, **BIM**은 둘의 합입니다
  **OBIM** is the offensive side (team scoring), **DBIM** the defensive side (points allowed), and **BIM** is their sum
- 리그 평균 선수가 0입니다. +5면 평균보다 100포제션당 5점만큼 보탬이 된다는 뜻입니다
  A league-average player is 0. +5 means 5 points per 100 possessions better than average
- 같은 팀 선수들의 값을 출전 시간만큼 합치면 그 팀의 실제 득실차와 맞아떨어집니다
  Teammates' values, weighted by minutes, add up to the team's actual point margin

**GOBERT — 수비 전문 지표 (Guarded-shot Outcomes & Box Estimate, Regressed and Team-adjusted)**

- 수비 기록만으로 그 선수가 팀 실점을 100포제션당 몇 점 줄이는지를 추정합니다
  Estimates from defensive stats alone how many points per 100 possessions a player takes off his team's points allowed
- 수비한 상대 슛(골밑·미드레인지·3점별로 얼마나 막아섰고 얼마나 허용했는지), 턴오버 유도, 블록, 수비 리바운드, 파울을 씁니다
  Uses shots defended (how many, and how many allowed, at the rim, midrange, and three), forced turnovers, blocks, defensive rebounds, and fouls
- 스틸과 블록은 적어도 상대 슛을 잘 막는 수비수가 DBIM보다 높게 나옵니다
  Defenders who shut down shots without piling up steals and blocks rate higher here than in DBIM
- 리그 평균이 0이고, 클수록 좋습니다
  League average is 0, and higher is better

**읽을 때 알아 둘 점 · Reading the numbers**

- 시즌 초반에는 값이 크게 흔들립니다. 팀당 20경기쯤 지나면 믿을 만해집니다
  Values swing a lot early in the season and settle after about 20 games per team
- 출전 시간이 아주 적은 선수는 값이 극단적으로 나올 수 있습니다
  Players with very few minutes can show extreme values
- 기록에 남지 않는 수비는 잡아내지 못합니다
  Defense that leaves no stat behind is not captured

### 🏆 리더보드 · Leaderboard

- 선수 리더보드에 **임팩트** 탭이 생겼습니다: PER · OWS · DWS · WS · WS/48 · OBIM · DBIM · BIM · GOBERT
  The player leaderboard has a new **Impact** tab: PER · OWS · DWS · WS · WS/48 · OBIM · DBIM · BIM · GOBERT
- PER과 윈셰어는 어드밴스드 탭에서 임팩트 탭으로 옮겼습니다
  PER and Win Shares moved from the Advanced tab to the Impact tab
- 리더보드 아래 용어 목록에서 약어와 설명이 붙어서 나오고, 새 지표는 무엇의 줄임말인지 함께 적었습니다
  In the glossary under the leaderboard, each abbreviation now sits right next to its description, and the new metrics are spelled out

### 👤 선수 프로필 — 퍼센타일 · Player Profile — Percentiles

- **가치** 묶음에 OBIM · DBIM · BIM · GOBERT가 추가됐습니다
  OBIM · DBIM · BIM · GOBERT are added to the **Value** group
- 좌우 두 단의 줄 수가 같아지도록 묶음 순서를 정리했고, 묶음 사이 구분을 더 또렷하게 했습니다
  Groups are reordered so both columns have the same number of rows, and the separation between groups is clearer
- 정규시즌에서 플레이오프로 처음 바꿀 때 화면 전체가 로딩 표시로 바뀌던 것을 고쳤습니다
  Switching from regular season to playoffs for the first time no longer replaces the whole screen with a loading indicator
