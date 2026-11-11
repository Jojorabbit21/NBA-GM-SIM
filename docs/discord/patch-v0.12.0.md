## v0.12.0 · 2026년 10월 27~28일 · October 27–28, 2026

### 📱 모바일 지원 · Mobile Support

폰 화면 전용 레이아웃이 생겼습니다. 하단 탭 바로 주요 화면을 오가고, 상단 바에서 가상 날짜·다음 경기·검색을 볼 수 있습니다.
A dedicated phone layout is here. Use the bottom tab bar to move between main screens, and the top bar for the virtual date, next game, and search.

- 리그 홈, 팀, 전술(로테이션은 쿼터별 12분 막대), 순위표·리더보드, 뉴스피드, 경기 일정·라이브·경기 결과, 선수 프로필을 지원합니다
  Supported: League Home, Team, Tactics (rotation as 12-minute bars per quarter), Standings and Leaderboards, News Feed, Schedule / Live / Game Results, and Player Profile
- 트레이드·자유 계약·계약 협상·방출도 폰에서 쓸 수 있습니다
  Trades, free agency, contract negotiation, and waivers also work on phones

### 🏀 경기 엔진 · Game Engine

**속공 재설계 · Fast Break Redesign**
- 속공을 볼 운반자, 앞서 달리는 러너, 뒤따라오는 트레일러로 나눠 진행합니다
  Fast breaks now involve a ball carrier, a lead runner, and a trailer
- 리바운더가 직접 치고 나가거나 아웃렛 패스를 뿌리고, 러너에게 앨리웁이 연결되기도 합니다
  Rebounders can push the ball themselves or throw an outlet pass, and alley-oops to the runner can happen
- 러너는 스피드와 체격을 함께 봅니다
  Runners are chosen by both speed and size

**공격 전개 · Offensive Flow**
- 수비가 도움 수비로 몰려들면 빈 동료에게 빼 주는 킥아웃이 나옵니다
  When the defense collapses to help, kick-outs to open teammates now happen
- 팀의 확실한 1옵션은 공을 쥐는 비중이 지나치게 줄지 않습니다
  A team's clear first option no longer loses too much usage
- 교체는 공이 죽었을 때만 이뤄집니다
  Substitutions only happen on dead balls
- 공격 리바운드 직후 공격권이 상대에게 넘어가던 문제를 고쳤습니다
  Fixed possession wrongly flipping to the opponent after an offensive rebound
- 경기는 항상 점프볼로 시작하며, 홈 어드밴티지를 현실 수준으로 낮췄습니다
  Games always start with a jump ball, and home-court advantage was lowered to a realistic level

### 📊 선수 기록 · Player Stats

- 선수 프로필에 **퍼센타일** 탭이 생겨, 리그 안에서 각 기록의 위치를 보여 줍니다
  A new **Percentile** tab on player profiles shows where each stat ranks in the league
- 새 지표 **PER**, **Win Shares**(공격·수비·합계·48분당), **SCRN%**(스크린 성공 비율)가 추가됐습니다
  New metrics: **PER**, **Win Shares** (offensive, defensive, total, per 48), and **SCRN%** (screen success rate)
- 트레이드·올스타 서신의 기록은 보낸 시점 기준으로 고정됩니다
  Stats in trade and All-Star messages are now frozen at the time they were sent
