# Tactic System (전술 자동 생성 + 슬라이더 + 분 배분)

## 개요
AI 팀 및 사용자 초기 설정을 위한 전술 자동 생성 시스템.
선수 능력치 기반 아키타입 분석 → 슬라이더 값 계산 → 뎁스차트/로테이션맵 구성.

**파일**:
- `services/game/tactics/tacticGenerator.ts` — 메인 전술 생성기
- `services/game/config/tacticPresets.ts` — 디폴트 슬라이더 값
- `services/game/config/sliderSteps.ts` — 슬라이더 UI 스텝 정의
- `services/game/tactics/minutesManager.ts` — 분 배분 + 정렬

---

## tacticGenerator.ts — `generateAutoTactics`

### 처리 단계

#### 1. 뎁스차트 자동 구성
- OVR 순으로 정렬된 건강한 선수 리스트
- 포지션별 1순위(스타터) → 2순위(벤치) → 3순위(백업) 배치
- 포지션 매칭 실패 시 남은 최고 OVR 선수로 폴백

#### 2. 로테이션맵 초기화
선수당 48분(분 단위) boolean 배열:
```
스타터: [0-12]=ON, [12-18]=OFF, [18-36]=ON, [36-42]=OFF, [42-48]=ON  (36분)
벤치:   [12-18]=ON, [36-42]=ON  (12분)
```

#### 3. 아키타입 점수 함수 (nba-strategy.md 기반)
| 함수 | 공식 | 용도 |
|------|------|------|
| `handlerScore` | handling×0.35 + plm×0.25 + passVision×0.20 + passAcc×0.20 | PnR, 볼무브 |
| `spacerScore` | 3pt×0.60 + shotIq×0.25 + offConsist×0.15 | C&S, 3pt |
| `driverScore` | speed×0.20 + agility×0.15 + vertical×0.10 + ins×0.35 + mid×0.20 | 드라이브 |
| `screenerScore` | strength×0.40 + height보정×0.30 + weight보정×0.30 | PnR |
| `rollerScore` | ins×0.40 + vertical×0.30 + speed×0.30 | PnR Roll |
| `postScore` | ins×0.50 + strength×0.30 + hands×0.20 | 포스트업 |
| `isoScore` | handling×0.25 + mid×0.25 + speed×0.25 + agility×0.25 | ISO |
| `rimProtScore` | blk×0.35 + intDef×0.35 + vertical×0.15 + height보정×0.15 | 헬프디펜스 |
| `perimLockScore` | perDef×0.50 + agility×0.25 + steal×0.25 | 스위치/수비 |

#### 4. 슬라이더 계산

**공격 슬라이더**:
| 슬라이더 | 산출 방식 |
|---------|----------|
| `pace` | 가드 평균 speed → stamina 낮으면 -2 |
| `ballMovement` | plm + passVision 평균 |
| `offReb` | 빅맨 reb 평균 → 하이페이스면 -2 |
| `playStyle` | 히어로 볼(2) ↔ 시스템 농구(9) — heroScore vs systemScore 비교 |
| `insideOut` | 인사이드(2) ↔ 아웃사이드(9) — insideScore vs outsideScore 비교 |
| `pnrFreq` | P&R 의존도 낮음(2) ↔ 높음(9) — handler+screener+roller 복합 |
| `shot_3pt` | avgOf(3pt), `shot_rim`, `shot_mid` |

**수비 슬라이더**:
| 슬라이더 | 산출 방식 |
|---------|----------|
| `defIntensity` | perDef 평균 |
| `helpDef` | rimProt × 0.6 + helpDefIq × 0.4 |
| `switchFreq` | perimLock + agility (림앵커 있으면 최대 5로 제한) |
| `fullCourtPress` | 가드 stamina×speed 평균 (88+→8, 82+→4, else→1) |
| `zoneFreq` | 내선 vs 외곽 수비력 차이 |

**코칭 철학 슬라이더**: 3개 추상 슬라이더가 내부적으로 10개 하프코트 플레이타입 가중치를 자동 산출:
- `playStyle` (2~9): 히어로 볼 ↔ 시스템 농구
- `insideOut` (2~9): 인사이드 ↔ 아웃사이드
- `pnrFreq` (2~9): P&R 의존도 낮음 ↔ 높음
- 가중치 산출: `computePlayTypeWeights(sliders)` (`playTypeProfiles.ts`)
- 10개 플레이타입: Iso, PostUp, PnR_Handler, PnR_Roll, PnR_Pop, CatchShoot, OffBallScreen, DriveKick, Cut, Handoff

**NBA 전술 철학 반영**:
- 풀코트 프레스 = 극도 체력 소모 → 보수적

---

## tacticPresets.ts — `DEFAULT_SLIDERS`

모든 슬라이더 5 (중립) + fullCourtPress=1, zoneUsage=5, pnrDefense=1
코칭 철학: playStyle=5, insideOut=5, pnrFreq=5 (밸런스)

---

## sliderSteps.ts — UI 스텝 정의

각 슬라이더는 3단계 스텝으로 UI 표시:
```typescript
pace: [{ value: 2, label: '느림' }, { value: 5, label: '보통' }, { value: 9, label: '빠름' }]
```

**함수**:
- `valueToStep(key, value)`: 엔진 값 → 가장 가까운 스텝 인덱스
- `stepToValue(key, stepIndex)`: 스텝 인덱스 → 엔진 값

`pnrDefense`는 엔진이 0~2를 직접 사용하므로 SLIDER_STEPS에 미포함.

---

## minutesManager.ts

### `stableSort(a, b)`
결정론적 정렬: OVR 내림차순, 동점 시 ID 오름차순.

### `distributeMinutes(roster, isStarter, limits, sliders)`
총 240분(5인 × 48분)을 선수별로 배분:
1. 명시적 limit이 있으면 그대로 사용
2. 스타터: 32분, 상위 10명: 16분, 그 외: 0분
3. 총합을 240으로 정규화 (`factor = 240 / used`)
4. 반올림 오차 보정 (±1분씩 조정)

---

## 수정 시 주의사항
- `ato(score, low, high)` 헬퍼: 점수 → 1~10 슬라이더 변환
- `snap(key, value)`: 계산된 값을 가장 가까운 스텝 값으로 스냅
- 슬라이더 추가 시: tacticPresets + sliderSteps + tacticGenerator 모두 업데이트
- generateAutoTactics는 AI 팀과 초기 사용자 설정 모두에 사용됨
- 플레이타입 가중치 산출: `playTypeProfiles.ts`의 `computePlayTypeWeights()` 사용 (possessionHandler에서 호출)
