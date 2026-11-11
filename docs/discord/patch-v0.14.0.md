## v0.14.0 · 2026년 11월 5일 · November 5, 2026

### 🏀 경기 엔진 · Game Engine

**시간 운영 · Clock Management**
남은 시간과 점수에 따라 팀이 공격 시간을 다르게 씁니다. 중계에도 "2-for-1을 노리고 빠르게 공격합니다" 같은 상황이 함께 나옵니다.
Teams now manage the clock based on time and score, and the broadcast calls it out, such as going fast for a 2-for-1.

- 쿼터 막판에는 2-for-1을 노리고, 시간이 부족하면 마지막 슛까지 시간을 끝까지 씁니다
  Late in quarters, teams go for 2-for-1s, or run the clock down for the last shot when time is short
- 4쿼터 막판 지는 팀은 서두르고, 앞선 팀은 시간을 끌며 속공을 자제하다 드리블 아웃으로 마무리합니다
  Trailing teams hurry late in the fourth, while leading teams slow down, avoid fast breaks, and dribble out the clock

**파울 작전과 막판 타임아웃 · Intentional Fouls & Late Timeouts**
- 지고 있는 팀은 시계를 멈추려고 일부러 파울하고, 자유투가 끝나면 타임아웃 뒤 프런트코트에서 공격합니다
  Trailing teams foul on purpose to stop the clock, then call a timeout and inbound in the frontcourt

**버저비터 · Buzzer-Beaters**
쿼터 종료 직전에는 하프라인 부근의 장거리 슛이 나오고, 막판 공격은 버저 직전까지 기다려 슛합니다.
With almost no time left in a quarter, long heaves from around half court appear, and final possessions wait until just before the buzzer.

**규정 반영 · Rules**
- 2~4쿼터 시작 공격권이 규정대로 번갈아 주어집니다
  Quarter-opening possessions now alternate as per the rules
- 타임아웃은 공이 죽었을 때나 공을 가진 팀만 부를 수 있고, 4쿼터·연장 마지막 2분에는 타임아웃 후 프런트코트에서 시작합니다
  Timeouts can only be called on dead balls or by the team with the ball, and in the last 2 minutes of the fourth and OT play resumes in the frontcourt

**풋백과 림 공격 · Putbacks & Rim Attacks**
- 림 바로 밑에서 공격 리바운드를 잡으면 곧바로 풋백하는 경우가 많아졌습니다
  Offensive rebounds grabbed right under the rim are more often put back immediately

### 🩹 부상 시스템 개편 · Injury System Overhaul

- 부상이 부위별로 세분화됐습니다(타박상, 염좌, 근육·인대 파열, 골절 등)
  Injuries are now split by body part and type (contusion, sprain, muscle or ligament tear, fracture, and more)
- 경기 중에는 다친 부위와 상태만 중계되고, 진단명과 결장 기간은 경기 후 1~2일 안에 발표됩니다
  During games only the injured area and condition are shown, and the diagnosis and time out are announced within 1–2 days
- 상태 배지: 초록(진단 전) · 주황(가벼운 부상) · 빨강(중상) · 파랑(출장정지) · 회색(개인 사유)
  Status badges: green (pending diagnosis), orange (minor), red (serious), blue (suspension), gray (personal)
- 내 팀에 부상자나 결장자가 생기면 알림 위젯으로 알려 드립니다
  You get a widget alert when someone on your team is hurt or out

### 📊 팀 기록 추가 · New Team Stats

- 새 기록: POTV(상대 턴오버 직후 득점), FBPS(속공 득점), PITP(페인트존 득점), SPTS(세컨드 찬스 득점)
  New stats: POTV (points off turnovers), FBPS (fast-break points), PITP (points in the paint), SPTS (second-chance points)
- 리더보드 팀 Advanced, 전술 인사이트, 경기 결과의 새 "팀 기록" 탭에서 볼 수 있습니다
  Find them in Leaderboard team Advanced, Tactics Insights, and the new Team Stats tab in game results

### 🎙️ 중계 · Commentary

- 3점슛 파울이 골밑 파울로 중계되던 문제 등, 문구와 실제 슛·파울 종류가 어긋나던 문제를 고쳤습니다
  Fixed wording that did not match the actual shot or foul type, such as three-point fouls being described as inside fouls
- 스틸·블록·파울에서 누가 했는지 이름이 문장 앞에 바로 보입니다
  Steals, blocks, and fouls now put the player's name up front
- 따로 떨어진 안내 줄을 없애 중계가 더 간결해졌고, 줄 색도 모든 경기 화면에서 같은 규칙으로 통일했습니다
  Stand-alone notice lines were removed for a cleaner feed, and line colors are now consistent across all game screens

### 🖥️ 화면 · Interface

- 프로필 아이콘이 닉네임 첫 글자로 바뀌었고, 로비에서 배경색을 고를 수 있습니다
  Profile icons now show your nickname's first letter, with a background color you can pick in the lobby
- 팀 전술 프리셋을 새로 추가하면 현재 화면을 복사하지 않고 새 전술로 시작합니다
  Adding a new tactic preset now starts fresh instead of copying the current one
