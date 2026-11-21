## v0.23.0 · 2026년 11월 22일 · November 22, 2026

### 📊 라인업 · 온/오프 분석 · Lineup and On/Off Analysis

팀 전술 › **인사이트** 탭 맨 아래에 표 두 개가 생겼습니다. 내가 짠 로테이션이 실제 경기에서 어땠는지 볼 수 있습니다.
Two new tables sit at the bottom of the **Insights** tab under Team Tactics. They show how the rotations you built actually played out.

**라인업 · Lineups**

5명 조합별 기록입니다. 함께 코트에 있던 시간이 많은 조합부터 15개를 보여 줍니다.
Stats for each five-man unit. The 15 units with the most minutes together are shown.

- **GP**: 그 조합이 함께 뛴 경기 수
  **GP**: games the unit played together
- **MIN**: 함께 코트에 있던 시간(분)
  **MIN**: minutes on the floor together
- **+/-**: 그 시간 동안의 득실 차
  **+/-**: point differential during those minutes
- **ORTG · DRTG**: 공격 100번당 득점 · 수비 100번당 실점
  **ORTG · DRTG**: points scored per 100 possessions · points allowed per 100 possessions
- **NET**: ORTG − DRTG
  **NET**: ORTG − DRTG
- **POSS**: 그 조합의 공격 횟수
  **POSS**: the unit's offensive possessions
- 오른쪽 위 **선수** 필터에서 선수를 고르면, 고른 선수들이 함께 코트에 있던 기록을 한 줄로 보여 줍니다. 두 명이면 두 선수 조합, 세 명이면 세 선수 조합입니다 (최대 5명)
  Pick players in the **Players** filter at the top right to see one row for the time those players shared the floor. Two players gives the two-man combo, three gives the three-man combo (up to 5)

**온/오프 · On/Off**

선수가 코트에 있을 때(ON)와 없을 때(OFF) 팀의 득실 효율을 비교합니다.
Compares the team's efficiency with a player on the floor (ON) and off it (OFF).

- **ON MIN · ON NET**: 그 선수가 코트에 있던 시간과 그때의 팀 NET
  **ON MIN · ON NET**: minutes with the player on the floor and the team's NET in that time
- **OFF MIN · OFF NET**: 그 선수가 코트에 없던 시간과 그때의 팀 NET
  **OFF MIN · OFF NET**: minutes with the player off the floor and the team's NET in that time
- **ON−OFF**: 두 NET의 차이 — 클수록 그 선수가 있을 때 팀이 더 좋았다는 뜻
  **ON−OFF**: the gap between the two — the bigger it is, the better the team was with that player out there

**알아 둘 점 · Good to know**

- 두 표 모두 정규시즌 / 플레이오프를 바꿔 볼 수 있습니다
  Both tables switch between Regular Season and Playoffs
- 트레이드나 방출로 팀을 떠난 선수도 우리 팀에서 함께 뛴 기록은 그대로 남습니다. 이름에 마우스를 올리면 선수 카드가, 누르면 프로필이 열립니다
  Players who left through a trade or release keep the minutes they played for your team. Hover a name for the player card, click it for the profile
- 지금 진행 중인 시즌의 지난 경기도 모두 채워져 있습니다. 이후 경기는 경기가 끝나면 바로 반영됩니다
  Every earlier game of the current season is already filled in. New games are added as soon as they finish

### 🔗 어시스트 네트워크 · Assist Network

팀 전술 › **인사이트** 탭에 **어시스트 네트워크**가 생겼습니다. 하프코트 위 포지션 자리에 선수를 놓고, 누가 누구에게 어시스트했는지 화살표로 보여 줍니다.
A new **Assist Network** sits in the **Insights** tab under Team Tactics. Players are placed at their positions on a half court, and arrows show who assisted whom.

> ⚠️ **어시스트 네트워크는 현재 진행 중인 세션이 끝난 뒤 새로 열리는 세션부터 집계됩니다.** 지금 진행 중인 세션에서는 기록이 쌓이지 않아 "기록이 없습니다"로 표시됩니다.
> ⚠️ **The Assist Network is recorded starting with sessions opened after the current session ends.** The session in progress does not collect it, so it shows "No records".

- 화살표가 굵고 밝을수록 두 선수 사이의 어시스트가 많습니다 (드묾 · 가끔 · 잦음 · 매우 잦음 4단계)
  The thicker and brighter the arrow, the more assists between the two players (four levels: Rare · Occasional · Frequent · Very Frequent)
- 선수 위에 마우스를 올리면 그 선수의 선만 강조되고, 동료별 **패스 · 성공 · FG% · AST**가 팝업으로 뜹니다
  Hover a player to highlight only their arrows and open a popup with **passes · makes · FG% · AST** for each teammate
- **패스**는 그 동료에게 준 패스 중 슛으로 이어진 횟수, **성공**은 그중 들어간 슛, **AST**는 그중 어시스트로 기록된 횟수입니다
  **Passes** counts passes to that teammate that led to a shot, **makes** is how many of those went in, and **AST** is how many were credited as assists
- 오른쪽 목록에서 선수별 패스 · 성공 · FG% · AST와 받은 어시스트를 한눈에 볼 수 있습니다. 현재 로스터 선수만 표시합니다
  The list on the right shows each player's passes · makes · FG% · AST and assists received. Only current roster players are shown

### 📈 선수 프로필 · 플레이타입별 기록 · Player Profile Play-Type Table

선수 프로필 **샷 차트** 탭 아래의 **플레이타입별 기록** 표가 바뀌었습니다.
The **Play-type breakdown** table under the **Shot Chart** tab on player profiles has changed.

- 기록이 없는 플레이타입도 모두 표시합니다
  Every play type is listed, even ones with no possessions
- 리그 평균은 따로 칸을 두지 않고 PPP 옆 괄호 안에 보여 줍니다 (예: **1.05** (0.98))
  The league average now sits in parentheses next to PPP instead of in its own column (e.g. **1.05** (0.98))
- 횟수가 적은 플레이도 흐리게 처리하지 않고 다른 행과 같은 색으로 보여 줍니다
  Plays with few possessions are no longer dimmed

**킥아웃과 패스 지표 · Kick-outs and Passing Stats**

> ⚠️ **킥아웃 행과 CPP · PO · AST/Play · PAST는 현재 진행 중인 세션이 끝난 뒤 새로 열리는 세션부터 집계됩니다.** 지금 진행 중인 세션에서는 0으로 표시됩니다.
> ⚠️ **The Kick-out row and CPP · PO · AST/Play · PAST are recorded starting with sessions opened after the current session ends.** They show 0 in the session in progress.

- **킥아웃**: 동료가 포스트업 · 돌파 · 더블팀 상황에서 빼준 공을 받아 끝낸 플레이. 이전에는 패스를 준 동료의 플레이타입(예: 포스트업)으로 잡혔습니다
  **Kick-out**: plays finished off a pass kicked out by a teammate from a post-up, drive or double team. These used to count under the passer's play type (e.g. Post Up)
- **CPP**: 플레이 한 번당 만든 득점 — 내 득점과 내 어시스트로 들어간 득점을 합쳐서 계산
  **CPP**: creation per play — your own points plus the points from your assists
- **PO**: 그 플레이를 패스로 끝낸 횟수 (킥아웃 · 롤맨에게 준 패스 · 드라이브 앤 킥)
  **PO**: times you ended that play with a pass (kick-outs, feeds to the roller, drive-and-kicks)
- **AST/Play**: 플레이 한 번당 어시스트
  **AST/Play**: assists per play
- **PAST**: 내 어시스트로 들어간 득점
  **PAST**: points scored off your assists
- 팀 전술의 플레이타입별 PPP는 그대로입니다. 킥아웃으로 들어간 슛은 그 공격을 시작한 플레이(예: 포스트업)의 결과로 계속 잡힙니다
  Team play-type PPP is unchanged — a made kick-out shot still counts toward the play that started the possession (e.g. Post Up)

### 🧭 리그 화면 · League Screens

- **선수 프로필**: 탭을 바꾸면 화면이 맨 위로 돌아갑니다. 이전에는 보던 탭의 스크롤 위치가 그대로 남았습니다
  **Player profile**: switching tabs now takes you back to the top. Before, the previous tab's scroll position carried over

### 🛠 수정 · Fixes

- **선수 이동 내역**: 스네이크 드래프트에서 짝수 라운드의 지명 순번이 거꾸로 표시되던 문제를 고쳤습니다 (예: 2라운드 마지막 지명이 "2R 1st"로 보이던 문제)
  **Transaction history**: fixed even-round pick numbers showing in reverse for snake drafts (e.g. the last pick of round 2 showing as "2R 1st")
