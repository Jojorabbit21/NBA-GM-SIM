# Shot Distribution (shotDistribution.ts)

## 개요
슈팅 시도를 10개 세부 존으로 분배하는 시스템.
DB 텐던시 데이터(우선) 또는 아키타입 기반 폴백으로 선수별 슈팅 존 성향을 결정.

> **광역 존 선택(Rim/Mid/3PT)** 은 `playTypes.ts:selectZone()`에서 `LivePlayer.zonePref` 70% + 전술 슬라이더 30%로 결정.
> 본 파일(shotDistribution)은 광역 존이 결정된 후 **10개 세부 존**으로 분배하는 역할.

**파일**:
- `services/game/engine/pbp/shotDistribution.ts` — PBP 엔진용 (포세션 중 동적 존 결정)
- `services/game/engine/shotDistribution.ts` — 배치 분배용 (시즌 스탯 프로젝션)

> 두 파일은 `calculateZoneWeights`와 `resolveDynamicZone` 핵심 로직이 동일하나,
> `distributeAttemptsToZones` 시그니처가 다름 (PBP: 슬라이더+총FGA, 배치: 존별 시도 수).

---

## 10존 체계 (ZoneAttempts)

```
zone_rim_a     zone_paint_a
zone_mid_l_a   zone_mid_c_a   zone_mid_r_a
zone_c3_l_a    zone_atb3_l_a  zone_atb3_c_a  zone_atb3_r_a  zone_c3_r_a
```

| 존 | 설명 |
|------|------|
| `zone_rim` | 림 주변 |
| `zone_paint` | 페인트 존 |
| `zone_mid_l/c/r` | 미드레인지 좌/중/우 |
| `zone_c3_l/r` | 코너 3점 좌/우 |
| `zone_atb3_l/c/r` | 아크 3점 좌/중/우 |

---

## Zone Weights 계산 (`calculateZoneWeights`)

### 우선순위 1: DB 텐던시 (`calculateWeightsFromRealData`)

`player.tendencies.zones` 데이터 사용:
```typescript
zones: { ra, itp, mid, cnr, p45, atb }  // 각 존 비중
```

**처리 과정**:
1. 전체 합으로 정규화 → 0.0~1.0 확률
2. `lateral_bias` (0~3)로 좌우 분배:

| bias | 의미 | L 배수 | R 배수 |
|------|------|--------|--------|
| 0 | Strong Left | 1.6 | 0.4 |
| 1 | Slight Left | 1.2 | 0.8 |
| 2 | Slight Right (기본 오른손) | 0.8 | 1.2 |
| 3 | Strong Right | 0.4 | 1.6 |

3. Mid 존: 30% L / 40% C / 30% R → bias 적용 후 재정규화
4. 3PT 존: Corner/Wing/Top 비율 → bias 적용 후 재정규화
5. Rim 비율: `rimRatio = pRim / (pRim + pPaint)`

### 우선순위 2: 아키타입 폴백 (`calculateWeightsFromArchetype`)

DB 텐던시가 없을 때 `hiddenTendencies.lateralBias`와 아키타입으로 추론:

**기본 가중치**:
- Mid: L=0.33, C=0.34, R=0.33
- 3PT: L_corn=0.15, L_wing=0.20, C_top=0.30, R_wing=0.20, R_corn=0.15

**아키타입 보정**:
| 조건 | 효과 |
|------|------|
| spacer > 80 & handler < 70 | 코너 3PT +0.25, 탑 -0.30 |
| handler > 80 & spacer > 75 | 탑 3PT +0.30, 코너 -0.10 |

**rimRatio 보정**:
| 조건 | rimRatio |
|------|---------|
| postScorer > driver + 10 | 0.50 (포스트 중심) |
| driver > postScorer + 10 | 0.85 (드라이브 중심) |
| 기본 | 0.75 |

---

## 동적 존 해결 (`resolveDynamicZone`)

PBP 포세션 중 `broadZone`(Rim/Paint/Mid/3PT)을 세부 존으로 변환:

```
Mid: 33% L / 33% C / 34% R
3PT: 15% C3_L / 20% ATB3_L / 30% ATB3_C / 20% ATB3_R / 15% C3_R
Rim → zone_rim, Paint → zone_paint
```

> 이 함수는 선수별 weights를 사용하지 않는 단순 랜덤 분배.
> `statUtils.ts`의 `updateZoneStats`에서 호출됨.

---

## UI 프로젝션 (`getProjectedZoneDensity`)

선수 프로필 히트맵 렌더링용:
- PBP 파일: `calculateZoneWeights` 기반 실제 계산
- 배치 파일: 단순 고정값 반환 (간소화)

---

## 수정 시 주의사항
- 두 shotDistribution 파일의 동기화 주의 (calculateZoneWeights 로직 공유)
- 10존 키 이름은 `LivePlayer` 타입의 `zone_*_a`/`zone_*_m` 필드와 일치해야 함
- `lateral_bias`는 텐던시 시스템에서 결정 (tendency-system.md 참조)
- 아키타입 폴백은 `archetypeSystem.ts`의 `calculatePlayerArchetypes` 사용
