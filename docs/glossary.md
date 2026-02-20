# NBA 스탯 Glossary

> 출처: Basketball-Reference.com Official Glossary
> 스탯 관련 수정 시 이 파일을 반드시 참조할 것.

---

## 기본 스탯 (Basic / Box Score Stats)

| 약어 | 풀네임 | 계산 공식 / 설명 |
|------|--------|----------------|
| G | Games | 경기 수 |
| GS | Games Started | 선발 출전 수 (1982부터) |
| MP | Minutes Played | 출전 시간 |
| PTS | Points | 득점 |
| FG | Field Goals | 필드골 성공 (2점+3점) |
| FGA | Field Goal Attempts | 필드골 시도 |
| FG% | Field Goal Percentage | `FG / FGA` |
| 2P | 2-Point Field Goals | 2점슛 성공 |
| 2PA | 2-Point FG Attempts | 2점슛 시도 |
| 2P% | 2-Point FG Percentage | `2P / 2PA` |
| 3P | 3-Point Field Goals | 3점슛 성공 |
| 3PA | 3-Point FG Attempts | 3점슛 시도 |
| 3P% | 3-Point FG Percentage | `3P / 3PA` |
| FT | Free Throws | 자유투 성공 |
| FTA | Free Throw Attempts | 자유투 시도 |
| FT% | Free Throw Percentage | `FT / FTA` |
| ORB | Offensive Rebounds | 공격 리바운드 |
| DRB | Defensive Rebounds | 수비 리바운드 |
| TRB | Total Rebounds | 총 리바운드 = `ORB + DRB` |
| AST | Assists | 어시스트 |
| STL | Steals | 스틸 |
| BLK | Blocks | 블록 |
| TOV | Turnovers | 턴오버 |
| PF | Personal Fouls | 개인 파울 |

---

## 슈팅 효율 스탯 (Shooting Efficiency)

| 약어 | 풀네임 | 계산 공식 |
|------|--------|---------|
| eFG% | Effective Field Goal % | `(FG + 0.5 × 3P) / FGA` |
| TS% | True Shooting % | `PTS / (2 × (FGA + 0.44 × FTA))` |

- **eFG%**: 3점슛이 2점슛보다 가치 있음을 반영. FG%보다 실질적인 슈팅 효율 지표.
- **TS%**: FG, 3P, FT를 모두 통합한 최종 슈팅 효율. 리그 평균 ~57%.

---

## 비율 스탯 — 리바운드 (Rebound Rate Stats)

> 선수가 코트에 있을 때 가능한 리바운드 중 실제로 잡은 비율 추정.

| 약어 | 풀네임 | 계산 공식 |
|------|--------|---------|
| ORB% | Offensive Rebound % | `100 × (ORB × (팀MP / 5)) / (MP × (팀ORB + 상대DRB))` |
| DRB% | Defensive Rebound % | `100 × (DRB × (팀MP / 5)) / (MP × (팀DRB + 상대ORB))` |
| TRB% | Total Rebound % | `100 × (TRB × (팀MP / 5)) / (MP × (팀TRB + 상대TRB))` |

---

## 비율 스탯 — 어시스트 / 턴오버 / 스틸 / 블록 (Rate Stats)

| 약어 | 풀네임 | 계산 공식 |
|------|--------|---------|
| AST% | Assist % | `100 × AST / (((MP / (팀MP / 5)) × 팀FG) - FG)` |
| TOV% | Turnover % | `100 × TOV / (FGA + 0.44 × FTA + TOV)` |
| STL% | Steal % | `100 × (STL × (팀MP / 5)) / (MP × 상대Poss)` |
| BLK% | Block % | `100 × (BLK × (팀MP / 5)) / (MP × (상대FGA - 상대3PA))` |

- **AST%**: 선수가 코트에 있을 때 팀 필드골 중 어시스트한 비율.
- **TOV%**: 100번의 플레이당 턴오버 수. 낮을수록 좋음.
- **STL%**: 코트에 있을 때 상대 소유권 중 스틸로 끝난 비율.
- **BLK%**: 코트에 있을 때 상대 2점슛 시도 중 블록한 비율.

---

## 사용률 (Usage)

| 약어 | 풀네임 | 계산 공식 |
|------|--------|---------|
| USG% | Usage Percentage | `100 × ((FGA + 0.44 × FTA + TOV) × (팀MP / 5)) / (MP × (팀FGA + 0.44 × 팀FTA + 팀TOV))` |

- 선수가 코트에 있을 때 팀 소유권 중 몇 %를 사용했는지 추정.
- 에이스 볼핸들러: ~30%+, 롤플레이어: ~10~15% 수준.

---

## 레이팅 스탯 (Rating Stats)

| 약어 | 풀네임 | 설명 |
|------|--------|------|
| ORtg | Offensive Rating | 선수가 코트에 있을 때 100 소유권당 팀 득점 |
| DRtg | Defensive Rating | 선수가 코트에 있을 때 100 소유권당 팀 실점 |

---

## 포제션 추정 (Possession Estimate)

**팀 포제션 계산 공식:**
```
Poss = 0.5 × (
  (팀FGA + 0.4×팀FTA - 1.07×(팀ORB/(팀ORB+상대DRB))×(팀FGA-팀FG) + 팀TOV)
  + (상대FGA + 0.4×상대FTA - 1.07×(상대ORB/(상대ORB+팀DRB))×(상대FGA-상대FG) + 상대TOV)
)
```

---

## 고급 분석 스탯 (Advanced Analytics)

| 약어 | 풀네임 | 설명 |
|------|--------|------|
| PER | Player Efficiency Rating | John Hollinger 개발. 분당 효율 지수. 리그 평균 = 15.0 |
| BPM | Box Plus/Minus | 100 소유권당 리그 평균 대비 기여도. 0 = 평균, 5+ = MVP급 |
| VORP | Value Over Replacement Player | BPM 기반. 교체급 선수(-2.0) 대비 기여도 (82경기 기준) |
| WS | Win Shares | 선수가 기여한 추정 승수 |
| WS/48 | Win Shares Per 48 Min | 48분당 기여 승수. 리그 평균 ~0.100 |
| GmSc | Game Score | `PTS + 0.4×FG - 0.7×FGA - 0.4×(FTA-FT) + 0.7×ORB + 0.3×DRB + STL + 0.7×AST + 0.7×BLK - 0.4×PF - TOV` |

**GmSc 해석:** 40점대 = 뛰어남 / 10점대 = 평균 / 음수 = 부진

---

## 팀 성적 스탯 (Team Stats)

| 약어 | 풀네임 | 계산 공식 |
|------|--------|---------|
| W | Wins | 승리 |
| L | Losses | 패배 |
| W-L% | Won-Lost % | `W / (W + L)` |
| GB | Games Behind | `((1위W - W) + (L - 1위L)) / 2` |
| MOV | Margin of Victory | `팀PTS - 상대PTS` 평균 |
| SRS | Simple Rating System | MOV + SOS 조정값 |
| SOS | Strength of Schedule | 일정 강도 (0 = 평균) |
| Pace | Pace Factor | 48분당 소유권 수 |

---

## 우리 시뮬레이션에서 구현 가능한 스탯 정리

### 박스스코어에서 직접 계산 가능 (구현 용이)

| 스탯 | 필요 데이터 | 비고 |
|------|------------|------|
| FG% | FGM, FGA | 기본 |
| 3P% | 3PM, 3PA | 기본 |
| FT% | FTM, FTA | 기본 |
| eFG% | FGM, 3PM, FGA | `(FGM + 0.5×3PM) / FGA` |
| TS% | PTS, FGA, FTA | `PTS / (2×(FGA + 0.44×FTA))` |
| TOV% | FGA, FTA, TOV | `100×TOV / (FGA + 0.44×FTA + TOV)` |
| GmSc | 전체 박스스코어 | Hollinger 공식 |

### 팀 데이터가 추가로 필요 (구현 보통)

| 스탯 | 추가 필요 데이터 |
|------|----------------|
| USG% | 팀FGA, 팀FTA, 팀TOV, 팀MP |
| ORB% | 팀ORB, 상대DRB, 팀MP |
| DRB% | 팀DRB, 상대ORB, 팀MP |
| TRB% | 팀TRB, 상대TRB, 팀MP |
| AST% | 팀FG, 팀MP |
| STL% | 상대Poss, 팀MP |
| BLK% | 상대FGA, 상대3PA, 팀MP |

### 복잡한 모델 필요 (구현 어려움)

| 스탯 | 이유 |
|------|------|
| PER | 복잡한 pace-adjustment 필요 |
| ORtg / DRtg | Dean Oliver 방법론 (소유권 레벨 데이터 필요) |
| BPM | 회귀 계수 기반, 리그 전체 데이터 필요 |
| VORP | BPM 기반 |
| WS | ORtg/DRtg 기반 |
