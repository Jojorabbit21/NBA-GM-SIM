## v0.20.0 · 2026년 11월 15일 · November 15, 2026

### 🏀 경기 엔진 · Game Engine

**슛을 던질 선수를 고르는 방식이 더 현실적으로 바뀝니다**
Who takes the shot is now chosen more realistically

공격 플레이마다 "누가 슛을 던지는가"를 정하는 기준을 다시 짰습니다. 롤플레이어가 어려운 슛을 떠안고 스타가 쉬운 슛만 던지던 어긋남을 줄였습니다.
We rebuilt how each play decides who takes the shot, reducing cases where role players took the hard shots while stars took the easy ones.

- **아이솔레이션**: 볼 핸들링과 1대1 득점 창출력이 좋은 선수 쪽으로 더 크게 쏠립니다
  **Isolation**: shots lean more strongly toward players with good ball handling and one-on-one scoring ability
- **픽앤롤 핸들러**: 핸들링과 득점력을 함께 본 점수가 높은 선수가 맡습니다
  **Pick-and-roll handler**: the player with the best combined handling and scoring score
- **포스트업**: 포스트 기술과 체격이 함께 좋은 선수가 맡습니다
  **Post-up**: the player with the best combination of post skill and physique
- **캐치앤슛 · 컷 · 오프스크린 · 드라이브킥**: 패스를 줄 선수를 먼저 정하고, 그 패스를 받기에 가장 열려 있는 선수가 슛을 던집니다
  **Catch-and-shoot, cuts, off-screens, drive-and-kick**: the passer is picked first, then the most open player to receive that pass takes the shot
- 라인업에 아이솔레이션이나 픽앤롤을 잘하는 선수가 있으면 팀이 그 플레이를 더 자주 시도하고, 없으면 덜 시도합니다
  If your lineup has a strong isolation or pick-and-roll player, the team runs that play more often; without one, less often
- 아이솔레이션·픽앤롤 핸들러의 풀업 3점 일부가 미드레인지 풀업으로 바뀝니다
  Some pull-up threes by isolation and pick-and-roll handlers now become midrange pull-ups
- **앤드원**: 이제 슈팅 파울이 먼저 선언되고, 그 슛이 들어가야만 앤드원이 됩니다. 팀 자유투 시도가 늘어났습니다
  **And-ones**: the shooting foul is now called first, and the shot must go in to count as an and-one. Team free-throw attempts go up
- 림·페인트·미드레인지·3점 구역별 성공률을 소폭 다듬었고, 시대별 플레이 비율도 다시 맞췄습니다
  Zone accuracy at the rim, paint, midrange and three was lightly tuned, and the era play-type mixes were rebalanced
- 사용량이 많은 선수와 적은 선수의 효율 차이가 실제 농구에 더 가까워졌습니다
  The efficiency gap between high-usage and low-usage players is closer to real basketball

**시대 설정 — 2000년대·1990년대 포스트업이 줄어듭니다**
Eras — less post-up in the 2000s and 1990s

2000년대·1990년대 설정에서 포스트업 비중이 너무 커서 득점 상위권이 빅맨으로 쏠렸습니다. 포스트업 비중을 낮추고, 줄인 몫은 아이솔레이션과 오프스크린으로 돌렸습니다. 2020년대·2010년대 설정은 그대로입니다.
Post-ups were too common in the 2000s and 1990s settings, so the top scorers were almost all bigs. Post-ups are reduced, and the share removed goes to isolation and off-screen plays. The 2020s and 2010s settings are unchanged.

**수비를 잘하는 선수가 파울을 덜 합니다**
Better defenders now foul less

- 슈팅 파울과 공 쪽 수비 파울에서, 수비 능력이 좋은 선수일수록 파울이 줄고 약한 선수일수록 늘어납니다
  On shooting fouls and on-ball defensive fouls, stronger defenders foul less and weaker ones foul more
- 골밑·포스트업 장면은 골밑 수비 실력을, 외곽 장면은 외곽 수비 실력을 봅니다
  Rim and post-up plays look at interior defense; perimeter plays look at perimeter defense
- 이전에는 스타의 파울 유도에 묻혀 수비 실력과 파울 수가 거의 관계가 없었고, 주력 빅맨에게 파울이 몰렸습니다
  Before, star foul-drawing drowned this out, so defensive skill barely mattered and fouls piled up on key bigs

**풀코트 프레스의 파울이 조정됩니다**
Full-court press fouls adjusted

- 파울 트러블에 걸린 선수는 프레스 수비에서도 하프코트와 똑같이 조심합니다
  Players in foul trouble now play carefully under the press, just as in the half court
- 트랩 파울은 두 수비수에게 반반이 아니라, 파울을 더 잘 범하는 쪽에 더 많이 돌아갑니다. 좋은 수비수가 동료 몫까지 떠안던 일이 없어집니다
  Trap fouls no longer split 50-50 between the two defenders; they go more often to the one more prone to fouling, so good defenders stop absorbing their teammate's share
- 프레스가 강한 팀의 가드·윙 퇴장이 눈에 띄게 줄어듭니다. 프레스를 강하게 쓰는 만큼 파울이 늘어나는 대가 자체는 남아 있습니다
  Guards and wings on heavy-press teams foul out noticeably less. The foul cost of pressing hard is still there

**가비지 타임 멤버 선정이 더 자연스러워집니다**
More natural garbage-time lineups

점수 차가 크게 벌어져 가비지 타임이 되면 주전을 쉬게 하고 벤치 선수를 내보냅니다. 이때 누구를 내보낼지 정하는 방식이 OVR이 아니라 감독이 짠 뎁스 차트를 따르도록 바뀌었습니다. 실제 농구처럼, 평소 뒤에서 기회를 기다리던 벤치 선수들이 가비지 타임을 맡습니다.
When a blowout reaches garbage time, starters sit and the bench comes in. Who comes in is now decided by the depth chart you set, not by OVR. Just like real basketball, the players waiting at the end of the bench get the garbage-time minutes.

- 이전에는 OVR만 보고 골라서, 같은 포지션 벤치 선수가 많은 팀에서는 뎁스 차트 후순위 선수가 가비지 타임에도 기회를 얻지 못하는 일이 있었습니다
  Before, picks were based on OVR alone, so on teams deep at one position, players low on the depth chart could miss out even in garbage time
- 이제는 로테이션에서 출전 시간을 받지 못한 선수도 가비지 타임에는 코트를 밟을 수 있습니다
  Now players who get no minutes in your rotation can still see the floor in garbage time
- 뎁스 차트에 올리지 않은 선수는 같은 포지션의 가장 뒤 순번으로 봅니다
  Players left off the depth chart count as last at their position
- 그 선수가 부상 중이거나 가비지 타임이 시작될 때 코트에 있었다면, 바로 앞 순번 선수가 나갑니다
  If that player is injured or was on the floor when garbage time began, the next player up goes in instead
- 가비지 타임이 시작되는 기준과 주전이 돌아오는 기준은 그대로입니다
  When garbage time starts, and when starters come back, are unchanged

### 📊 새 지표 — 스크린 돌파율 · 막은 돌파 · New Metrics — Fight-Through & Drives Faced

수비 쪽 지표가 두 개 생겼습니다.
Two new defensive metrics.

**FIT% — 스크린 돌파율 (Fight-Through %)**

- 맞은 스크린 중, 스크린에 걸리지 않고 완전히 빠져나간 비율입니다
  The share of screens faced that the defender got through without being caught at all
- 스크린을 세우는 쪽의 SCRN%와 짝이 되는 지표입니다
  The counterpart of SCRN%, which measures the screener
- 수비수의 민첩성·외곽 수비·힘이 좋고 상대 스크리너가 약할수록 높아집니다
  Higher for defenders with good agility, perimeter defense and strength, and against weaker screeners
- 스위치로 넘긴 스크린은 집계하지 않습니다
  Screens handled by a switch are not counted

**DRFD — 막은 돌파 (Drives Faced)**

- 림·페인트로 드리블 돌파해 온 선수를 맨투맨으로 막은 횟수(경기당)입니다
  How many dribble drives to the rim or paint a defender faced in man-to-man (per game)
- 높고 낮음이 좋고 나쁨이 아닙니다. 상대 주 볼핸들러를 막는 수비수일수록 많이 쌓입니다
  Neither high nor low is good or bad. Defenders who guard the opponent's main ball handler pile up more
- 지역방어에서 막은 돌파는 포함하지 않습니다
  Drives faced in zone defense are not included

**어디서 보이나요 · Where to find them**

- 리더보드 > 수비 탭: FIT% · DRFD
  Leaderboard > Defense tab: FIT% · DRFD
- 선수 프로필 > 퍼센타일 카드 > 수비: FIT% (맞은 스크린이 너무 적으면 NQ)
  Player profile > Percentile card > Defense: FIT% (NQ when too few screens faced)
- 선수 프로필 > 게임 로그 > Defense: FIT(빠져나간 수/맞은 수) · DRFD
  Player profile > Game log > Defense: FIT (got through / faced) · DRFD

**읽을 때 알아 둘 점 · Reading the numbers**

- 이번 업데이트 이후 치러진 경기부터 집계됩니다. 이전 경기는 비어 있습니다
  Counted from games played after this update. Earlier games are blank
- 시즌 초반이나 출전이 적은 선수는 값이 크게 흔들립니다
  Values swing a lot early in the season and for players with few minutes

### 📈 기록 · Stats

- 팀 > 선수 기록의 "정규" 표에 플레이오프 기록이 섞여 나오던 문제를 고쳤습니다. 뉴스·올스타 화면의 선수 카드도 같은 기준(정규시즌)으로 맞췄습니다
  Fixed the "Regular" table in Team > Player Stats mixing in playoff numbers. Player cards in the news and all-star screens now use the same regular-season basis
- 올스타·라이징 스타 같은 이벤트 경기가 시즌 기록, 어워드 투표용 기록, 샷 차트, 게임 로그에 섞이지 않습니다
  Event games such as the All-Star and Rising Stars games no longer mix into season stats, award-voting stats, shot charts or game logs
- 전술 화면의 플레이타입 PPP·CONTEST와 프로필 샷 차트에서 정규시즌과 플레이오프를 따로 볼 수 있습니다
  Play-type PPP and CONTEST on the tactics screen, and the profile shot chart, can now be viewed for the regular season and playoffs separately
- 선수 프로필 게임 로그가 정규시즌과 플레이오프 구역으로 나뉘고, 기록 탭에 플레이오프 행이 표시됩니다
  The player profile game log is split into regular-season and playoff sections, and the stats tab shows a playoff row
- 팀 홈 화면의 전적에 플레이오프 승패가 섞이던 문제를 고쳤습니다
  Fixed playoff wins and losses being added to the team record on the team home screen
- 시즌 기록을 불러오는 속도가 크게 빨라졌습니다
  Season stats load much faster

### ⚙️ 안정성 · Stability

- 경기 기록 저장이 실패하면 자동으로 다시 시도하고, 기록이 저장되지 않은 경기는 끝난 것으로 표시하지 않습니다
  If saving a game record fails, it is retried automatically, and a game whose record was not saved is never marked as played
