## v0.16.0 · 2026년 11월 7일 · November 7, 2026

### 🏀 경기 엔진 · Game Engine

**픽앤롤은 스크린이 결과를 가릅니다**
Pick-and-Roll Decided by the Screen

볼 핸들러가 받는 스크린이 제대로 걸렸는지가 결과를 직접 바꿉니다. 스크리너의 체격·타이밍과 핸들러 수비수의 민첩성·수비력을 겨뤄 판정합니다.
Whether the ball handler's screen actually lands now directly shapes the outcome, based on the screener's size and timing versus the defender's agility and defense.

- 드롭 수비: 스크린이 걸리면 수비가 떨어져 슛이 쉬워지고, 막히면 수비가 붙은 채 슛을 던집니다
  Drop coverage: a good screen leaves the defender behind for an easier shot; a blocked screen means a contested shot
- 헤지 수비: 걸리면 빅맨을 돌아나가고, 막히면 갇혀 더블팀(턴오버 또는 패스아웃)을 당합니다
  Hedge coverage: a good screen beats the big; a blocked one traps the handler in a double team (turnover or pass-out)
- 블리츠 수비: 걸리면 더블팀이 늦게 와 빠져나가기 쉽고, 막히면 어렵습니다
  Blitz coverage: a good screen means the double arrives late; a blocked one makes escaping hard
- 스크린이 약한 빅맨과의 픽앤롤은 아이솔레이션보다 불리할 수 있고, 스크린이 좋은 빅맨과는 더 위력적입니다
  Pick-and-rolls with weak screeners can be worse than isolation; with strong screeners they are more dangerous
- 핸들러에게 무조건 붙던 작은 슛 보정은 없앴습니다
  Removed the flat shooting bonus ball handlers always received

**슈팅 보정**
Shooting Adjustments

- 캐치앤슛 3점, 코너 3점, 미드레인지 슛이 전반적으로 조금 더 잘 들어갑니다
  Catch-and-shoot threes, corner threes, and mid-range shots go in slightly more often

**턴오버가 실제 농구처럼**
More Realistic Turnovers

- 패스가 가로채이면 턴오버는 패스한 선수에게 기록됩니다
  Intercepted passes are now charged to the passer
- 직접 공을 빼앗기는 일은 드리블하거나 포스트업하는 선수에게만 일어납니다
  Ball strips only happen to dribblers and post-up players
- 리그 전체 턴오버 수는 비슷하고, 볼 핸들러·포스트업 선수는 늘고 캐치앤슛 슈터·롤맨·커터는 줄어듭니다
  League-wide turnovers stay about the same; ball handlers and post players turn it over more, spot-up shooters, rollers, and cutters less
- 가로채인 패스의 턴오버는 패스한 선수의 플레이타입으로 집계됩니다
  Intercepted-pass turnovers are tallied under the passer's play type

### 🎙️ 중계 · Commentary

- 팀을 연고지 대신 팀 이름으로 부릅니다. 같은 연고지 두 팀도 구분됩니다
  Teams are now called by team name instead of city, so two teams from one city are distinguishable
- 체력 교체도 일반 교체와 같게 표시하고, 같은 순간의 여러 교체는 한 줄로 모읍니다
  Fatigue substitutions look like normal subs, and simultaneous subs are grouped on one line
- 헤지 더블팀 턴오버와 가로채인 패스에 전용 문장이 생겼습니다
  Added dedicated lines for hedge double-team turnovers and intercepted passes
