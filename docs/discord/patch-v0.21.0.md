## v0.21.0 · 2026년 11월 16일 · November 16, 2026

### 📊 선수별 플레이타입 기록 · Player Play-Type Breakdown

선수 프로필 **샷 차트** 탭 맨 아래에 **플레이타입별 기록** 표가 생겼습니다. 이 선수가 어떤 플레이로 공격을 끝냈고, 플레이마다 얼마나 효율적이었는지를 리그 평균과 비교해 보여 줍니다.
A new **Play-type breakdown** table sits at the bottom of the **Shot Chart** tab on player profiles. It shows which plays a player finished possessions with, and how efficient each one was compared with the league average.

**표 읽는 법 · Columns**

- **횟수**: 그 플레이로 이 선수가 공격을 끝낸 횟수 (슛 · 턴오버 · 자유투를 얻은 파울)
  **Count**: how many times the player finished a play of that type (shot, turnover, or a foul that earned free throws)
- **비중**: 이 선수의 전체 공격 중 그 플레이가 차지하는 비율
  **Share**: that play's share of all the player's possessions
- **PPP**: 플레이 한 번당 득점 — 자유투와 턴오버까지 포함
  **PPP**: points per play, including free throws and turnovers
- **리그평균 · +/-**: 같은 플레이타입의 리그 전체 PPP, 그리고 그와의 차이
  **League avg · +/-**: the league-wide PPP for that play type, and the difference from it
- **FG% · TOV%**: 그 플레이에서의 야투 성공률과 턴오버 비율 (PC 화면만)
  **FG% · TOV%**: field-goal percentage and turnover rate on that play (desktop only)

**알아 둘 점 · Good to know**

- 리그 평균보다 확실히 높으면 초록, 낮으면 빨강으로 표시합니다. 횟수가 적은 플레이는 흐리게 보입니다
  Clearly above the league average shows green, clearly below shows red. Plays with few possessions are dimmed
- 샷 차트의 정규시즌 / 플레이오프 전환을 따릅니다. 결과·쿼터·슛 타입·상대팀 필터는 슛 단위라 이 표에는 적용되지 않습니다
  The table follows the shot chart's Regular Season / Playoffs switch. The result, quarter, shot type and opponent filters work per shot, so they do not apply to this table
- 공격 리바운드 직후의 풋백도 하나의 플레이타입으로 보여 줍니다
  Putbacks right after an offensive rebound are shown as their own play type
- 패스가 끊긴 턴오버는 패스를 준 선수의 기록으로, 24초 바이얼레이션은 팀 턴오버라 선수 기록에는 넣지 않습니다
  Intercepted passes count against the passer; shot-clock violations are team turnovers and are not charged to a player
- 현재 진행 중인 시즌의 이전 경기는 경기 기록을 바탕으로 복원해 채웠습니다. 슛 기록은 정확하고, 턴오버와 자유투를 어느 플레이에 넣을지는 추정이라 약간의 오차가 있습니다. 이번 업데이트 이후 치르는 경기부터는 정확한 값이 쌓입니다
  Earlier games in the current season were rebuilt from game records. Shots are exact; which play each turnover and free-throw trip belongs to is estimated, so there is a small margin of error. Games played from this update on are recorded exactly

### 📰 파워랭킹 개편 · Power Rankings Rework

매월 초 리그 소식으로 오는 **파워랭킹**의 평가 방식과 표가 바뀝니다.
The monthly **Power Rankings** letter in League News has a new evaluation method and a new table.

**재능 항목이 사라지고, 공격·수비를 부문별로 평가합니다**
Talent is gone — offense and defense are now rated by category

- **재능** 항목을 없앴습니다. 팀 간 전력 차이가 아주 작아도 리그에서 가장 낮은 팀이 0.0으로 표시되던 항목입니다
  The **Talent** column is removed. It showed 0.0 for the lowest team in the league even when the real gap between teams was tiny
- 공격과 수비를 **4개 부문씩** 나눠, 부문마다 **리그 순위**를 보여 줍니다. 점수 대신 "3위", "17위"처럼 순위로 표시합니다
  Offense and defense are each split into **four categories**, and every category shows the team's **league rank** — a rank such as 3rd or 17th instead of a score
- **공격**: 슈팅 (3점을 비롯한 외곽 슛) · 샷 창출 (스스로 슛 기회를 만들어 넣는 능력) · 골밑 (림 근처 마무리와 포스트 플레이) · 패스 (시야와 패스, 볼 운반)
  **Offense**: Shooting (threes and other outside shots) · Shot Creation (making and hitting your own shot) · Inside (finishing at the rim and post play) · Passing (vision, passing and ball handling)
- **수비**: 외곽 (공을 가진 상대를 막는 대인 수비) · 팀 수비 (헬프 수비와 패스 길 차단) · 림 보호 (골밑 수비와 블록) · 리바운드 (리바운드와 박스아웃)
  **Defense**: Perimeter (on-ball defense) · Team Defense (help defense and passing lanes) · Rim Protection (interior defense and blocks) · Rebounding (rebounds and boxing out)
- 부문 순위는 로테이션 선수들의 능력치로 매기며, 출전 비중이 큰 선수일수록 더 크게 반영합니다
  Category ranks come from the ratings of your rotation players, weighted toward those who play more
- 순위 숫자는 상위권일수록 초록, 하위권일수록 붉은 계열로 표시합니다
  Rank numbers are tinted green toward the top of the league and red toward the bottom

**파워스코어**
Power Score

- **파워스코어**는 8개 부문 순위를 평균해 0~100으로 나타낸 값입니다. 표에 보이는 부문 순위만으로 정해지며, 표에 없는 항목은 더 이상 반영하지 않습니다
  **Power Score** is the average of the eight category ranks on a 0–100 scale. It is decided only by the ranks shown in the table — nothing outside the table is counted anymore
- 평가 방식이 달라져 팀 순위가 이전 파워랭킹과 크게 달라질 수 있습니다
  Because the method changed, team rankings can differ a lot from earlier Power Rankings

**알아 둘 점 · Good to know**

- 평가 방식이 바뀐 첫 달에는 지난달 대비 순위 상승·하락 팀을 표시하지 않습니다. 다음 달부터 다시 표시합니다
  In the first month under the new method, the biggest riser and faller are not shown. They return next month
- 이번 달 파워랭킹이 이미 발표된 리그에는 새 방식으로 다시 보냈습니다. 제목에 **[재발송]** 이 붙어 있습니다
  Leagues that had already received this month's Power Rankings got them again under the new method, marked **[재발송]** (re-sent) in the title
- 이전에 받은 파워랭킹 서신은 재능 열 없이 공격·수비·파워스코어만 표시합니다
  Earlier Power Rankings letters now show only Offense, Defense and Power Score, without the Talent column
- 화면이 좁으면 표를 옆으로 넘겨 볼 수 있고, 팀 이름은 왼쪽에 고정됩니다
  On narrow screens the table scrolls sideways while team names stay pinned on the left

### 🛠 수정 · Fixes

- **파워랭킹**: **피크시즌 능력치 적용**을 켠 리그에서 파워랭킹만 기본 능력치로 계산하던 문제를 고쳤습니다. 이제 경기에 쓰이는 것과 같은 능력치로 계산합니다
  **Power Rankings**: in leagues with **Peak-season ratings** turned on, the rankings were still calculated from base ratings. They now use the same ratings as the games
- **드래프트**: 지명 차례가 넘어가지 않고 멈추던 문제를 고쳤습니다. 지명 시간이 끝나는 순간 직접 지명과 자동 지명이 겹칠 때 생기던 오류도 함께 고쳤습니다
  **Draft**: fixed the draft getting stuck on a pick and not moving to the next team. Also fixed errors when a manual pick and an auto-pick collided right as the pick clock ran out
- **FA 영입**: CBA 규정을 끈 리그에서 FA를 바로 영입하면 거래 내역과 선수 이동 내역에 남지 않던 문제를 고쳤습니다
  **Free agency**: in leagues with CBA rules turned off, signing a free agent instantly now shows up in the transaction history and player movement history again
