## v0.10.0 · 2026년 10월 17~22일 · October 17–22, 2026

### 🔋 체력 시스템 · Stamina

- 경기 사이에 체력이 회복됩니다. 하루가 지날 때마다 회복되고, 백투백 연전이면 덜 회복됩니다
  Stamina recovers between games, daily, but less on back-to-backs
- 로스터·뎁스 차트·선수 프로필·라이브 박스스코어에서 체력을 볼 수 있습니다
  View stamina on the roster, depth chart, player profile, and live box score
- 경기 결과가 공개되기 전에는 경기 전 체력이 표시됩니다
  Before a result is revealed, pre-game stamina is shown to avoid spoilers
- 리그 관리자가 회복량과 경기 중 체력 소모를 세션 설정에서 조정할 수 있습니다
  League admins can tune recovery and in-game drain in session settings

### 🧠 전술 · Tactics

- **전술 프리셋**: 뎁스 차트·로테이션과 팀 전술을 이름 붙인 프리셋으로 저장하고 바꿔 쓸 수 있습니다
  **Tactic presets**: save depth chart/rotation and team tactics as named presets and swap between them
- 슬라이더 옆 물음표를 누르면 장단점 설명이 나옵니다
  Click the question mark next to a slider for pros and cons
- "전술 자동 설정"이 현재 주전을 기준으로 전술을 만들어 줍니다
  "Auto Tactics" builds a tactic from your current starters
- 전술 화면에서 플레이타입별 득점 효율(PPP)을 볼 수 있습니다
  See points per possession (PPP) by play type on the tactics screen
- **AI 팀 감독**: AI 팀은 경기 전에 선수 구성과 출전 시간표를 스스로 짭니다
  **AI coaches**: AI-run teams now set their own lineups and minutes before games

### 🏀 경기 엔진 · Game Engine

- 타임아웃 규정을 반영했습니다(경기당 횟수, 의무 타임아웃, 4쿼터 사용 제한)
  Timeout rules added: per-game limits, mandatory timeouts, and 4th-quarter restrictions
- 부상·퇴장으로 빠진 선수의 출전 시간을 자연스럽게 나눠 받습니다
  Minutes of injured or ejected players are redistributed more naturally
- 코트 위 포지션 배치가 꼬이던 문제를 고쳤습니다
  Fixed on-court position assignment issues
- 지친 선수 교체와 비상 교체 규칙을 개선했습니다
  Improved substitutions for tired players and emergency subs
- 훅슛·덩크 선택과 체격에 따른 골밑 마무리를 다듬었습니다
  Refined hook shot and dunk selection, and rim finishing based on body type

### 💬 리그 채팅 · League Chat

- 화면 오른쪽 아래 버튼으로 리그 채팅을 엽니다
  Open league chat from the button at the bottom right
- 1:1 메시지(DM)와 메시지 신고 기능이 있습니다
  Includes direct messages and message reporting
- 리그 알림도 같은 위젯의 알림 탭에서 모아 봅니다
  League alerts are gathered in the widget's Alerts tab

### 🤝 트레이드 · Trades

- 받은 제안에 역제안을 보낼 수 있고, 주고받은 제안이 스레드로 묶여 보입니다
  Counter-offer to received proposals; exchanges are grouped as threads
- 거절할 때 사유를 남길 수 있습니다
  Leave a reason when declining
- 수락·거절·취소 전에 한 번 더 확인합니다
  Accept, decline, and cancel now ask for confirmation
- 트레이드 블록에 올리지 않은 선수에게도 제안할 수 있습니다
  You can propose trades for players not on the trading block

### 👥 리그 · League

- **관전 모드**: 참가하지 않은 리그도 읽기 전용으로 둘러볼 수 있습니다
  **Spectator mode**: browse leagues you haven't joined, read-only
- 관리자가 참가자를 내보내면 그 팀은 AI가 맡고, 초대 링크로 새 참가자에게 넘길 수 있습니다
  When an admin removes a participant, AI takes over the team and it can be handed to a new player via invite link
- **선수 비교**: 도구 메뉴에서 능력치와 기록을 비교합니다(드래프트 전에도 사용 가능)
  **Player compare**: compare ratings and stats from the Tools menu, even before the draft
- 팀 이름에 마우스를 올리면 팀 정보 카드가 나옵니다
  Hover a team name to see a team info card
- 순위표에 순위 변동(▲▼)이 표시됩니다
  Standings show rank changes (▲▼)
- 플레이오프 시리즈 결과·우승 알림은 중계가 끝난 뒤에 옵니다
  Playoff series and championship alerts now arrive after the broadcast ends

### 🔐 계정 · Account

- 비밀번호 찾기·재설정(인증 코드 방식)을 추가했습니다
  Added password recovery and reset via verification code
- 보안 점검을 진행해 여러 취약 지점을 보강했습니다
  Completed a security review and hardened several weak points
