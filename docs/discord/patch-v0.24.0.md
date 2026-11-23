## v0.24.0 · 2026년 11월 23일 · November 23, 2026

### ⚡ Quick Game · Quick Game

메인 화면 **Online Leagues** 아래에 **Quick Game**이 생겼습니다. 두 팀과 선수를 고르고, 전술을 짠 뒤, 한 경기를 바로 치르는 연습 모드입니다.
**Quick Game** now sits under **Online Leagues** on the home screen. Pick two teams and their players, set your tactics, and play a single game right away.

- 로그인 없이 쓸 수 있고, 경기 결과와 설정은 어디에도 저장되지 않습니다. 새로고침하거나 화면을 나가면 사라집니다
  No login needed, and nothing is saved anywhere — results and settings disappear when you refresh or leave the page
- 모든 선수의 숨은 성향(클러치 · 일관성 등)은 중립으로 고정됩니다. 능력치와 슛 성향만으로 승부가 갈립니다
  Every player's hidden traits (clutch, consistency, etc.) are fixed to neutral, so ratings and shooting tendencies alone decide the game

### 🛠 수정 · Fixes

- **샷 차트 선수 선택**: 경기 중 샷 차트에서 선수 체크를 해제해도 다음 플레이에 다시 켜지던 문제를 고쳤습니다. 선수를 하나씩 해제한 뒤 아직 슛을 쏘지 않았던 선수가 목록에 새로 나타날 때 체크된 채로 보이던 문제도 함께 고쳤습니다. 라이브 경기와 경기 결과 화면에 모두 적용됩니다
  **Shot chart player selection**: fixed player checkboxes switching back on at the next play after you unchecked them during a live game. Also fixed players who hadn't shot yet appearing checked when they first show up in the list after you unchecked players one by one. This applies to both live games and result screens
