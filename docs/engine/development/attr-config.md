# 속성별 설정 테이블 (ATTR_CONFIG)

> 소스: `services/playerDevelopment/playerAging.ts`

## 개요

37개 세부 능력치 각각에 대해 성장 가능 여부, 성장 한도, 퇴화 시점, 퇴화 속도를 개별 정의한다.

## AttrConfig 인터페이스

| 필드 | 타입 | 설명 |
|------|------|------|
| `growable` | boolean | 후천적 성장 가능 여부 |
| `maxPerGameGrowth` | number | 1경기당 최대 성장 delta |
| `perfStats` | CategoryKey[] | 성장에 영향을 주는 퍼포먼스 카테고리 |
| `declineOnset` | number | 퇴화 시작 나이 |
| `maxSeasonDecline` | number | 시즌당 최대 퇴화량 |
| `declineGroup` | string | 퇴화 그룹 (peakAge/노이즈 참조) |
| `floor` | number | 바닥값 (이 이하로 떨어지지 않음) |

---

## INSIDE (ins)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| closeShot | O | 0.12 | ins | 35 | 3.0 | lateStable | 38 | 테크닉 |
| layup | O | 0.12 | ins | 38 | 3.5 | lateStable | 38 | 피니싱 기술, 매우 늦게 퇴화 |
| dunk | O | 0.12 | ins | 30 | 3.0 | midPhysical | 40 | 성장 가능, 30세부터 퇴화 |
| postPlay | O | 0.10 | ins | 35 | 2.0 | lateStable | 38 | 풋워크, 경험으로 발전 |
| drawFoul | O | 0.08 | ins | 38 | 1.5 | lateStable | 38 | 기교/영리함 |
| hands | O | 0.10 | ins | 35 | 1.5 | lateStable | 38 | 연습으로 개선 |

## OUTSIDE (out)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| midRange | O | 0.15 | out | 33 | 1.5 | iqSkill | 40 | 순수 슈팅 스킬 |
| threeCorner | O | 0.15 | out | 33 | 1.5 | iqSkill | 40 | 슈팅 스킬 |
| three45 | O | 0.15 | out | 33 | 1.5 | iqSkill | 40 | 슈팅 스킬 |
| threeTop | O | 0.15 | out | 33 | 1.5 | iqSkill | 40 | 슈팅 스킬 |
| ft | O | 0.12 | out | 34 | 1.0 | iqSkill | 40 | 가장 연습 가능한 스킬 |
| shotIq | O (IQ) | 0.05 | out | 38 | 1.0 | iqSkill | 40 | 경험/판단력 |
| offConsist | O (IQ) | 0.05 | ins,out | 32 | 1.0 | iqSkill | 40 | 정신력/경험 |

## PLAYMAKING (plm)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| passAcc | O | 0.12 | plm | 33 | 1.5 | iqSkill | 40 | 드릴 가능한 스킬 |
| handling | O | 0.12 | plm | 32 | 1.5 | iqSkill | 40 | 드릴 가능한 스킬 |
| spdBall | 제한 | 0.05 | plm | 30 | 2.5 | midPhysical | 38 | 기본 스피드에 제약 |
| passIq | O (IQ) | 0.05 | plm | 38 | 1.0 | iqSkill | 40 | 경험/IQ |
| passVision | O (IQ) | 0.05 | plm | 38 | 1.0 | iqSkill | 40 | 경험/IQ |
| offBallMovement | O | 0.10 | plm | 32 | 1.5 | lateStable | 38 | 전술 이해도 |

## DEFENSE (def)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| intDef | O | 0.12 | def | 32 | 2.0 | lateStable | 38 | 포지셔닝/기술 |
| perDef | O | 0.12 | def | 32 | 2.0 | lateStable | 38 | 포지셔닝/기술 |
| steal | 제한 | 0.06 | def | 36 | 2.5 | lateStable | 38 | 순발력 의존 |
| blk | 제한 | 0.06 | def | 29 | 2.5 | midPhysical | 38 | 신장/수직점프 의존 |
| helpDefIq | O (IQ) | 0.10 | def | 33 | 1.5 | iqSkill | 40 | 수비 IQ |
| passPerc | O (IQ) | 0.10 | def | 33 | 1.5 | iqSkill | 40 | 수비 IQ |
| defConsist | O (IQ) | 0.10 | def | 34 | 1.0 | iqSkill | 40 | 정신력/경험 |

## REBOUND (reb)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| offReb | 제한 | 0.06 | reb | 30 | 3.0 | midPhysical | 38 | 피지컬+노력 |
| defReb | O | 0.10 | reb | 31 | 2.0 | lateStable | 38 | 포지셔닝/기술 |
| boxOut | O | 0.10 | reb | 31 | 2.0 | lateStable | 38 | 테크닉 |

## ATHLETIC (ath)

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| speed | **X** | 0.0 | - | 27 | 3.5 | earlyAthletic | 40 | 유전적 한계 |
| agility | **X** | 0.0 | - | 27 | 3.0 | earlyAthletic | 40 | 유전적 한계 |
| strength | 제한 | 0.05 | - | 30 | 2.0 | midPhysical | 38 | 웨이트 트레이닝 제한적 |
| vertical | **X** | 0.0 | - | 27 | 3.0 | earlyAthletic | 40 | 유전적 한계 |
| stamina | 제한 | 0.05 | - | 29 | 2.0 | midPhysical | 38 | 컨디셔닝 소폭 개선 |
| hustle | 제한 | 0.05 | - | 31 | 1.5 | midPhysical | 38 | 노력/모터 |
| durability | **X** | 0.0 | - | 30 | 2.0 | midPhysical | 40 | 체질/유전 |

## OTHER

| 속성 | 성장 | max/경기 | perf | 퇴화onset | max퇴화/시즌 | 퇴화그룹 | 바닥 | 근거 |
|------|------|---------|------|---------|-----------|---------|------|------|
| intangibles | **X** | 0.0 | - | never | 0.0 | never | 40 | 고정값, 성장/퇴화 모두 불가 |

---

## 속성 분류 요약

- **성장 불가 (4개)**: speed, agility, vertical, durability — 순수 신체 능력
- **제한적 성장 (6개)**: spdBall, steal, blk, offReb, strength, stamina, hustle — 피지컬 의존도 높음
- **완전 성장 (26개)**: 나머지 스킬/IQ 속성 (dunk 포함)
- **성장/퇴화 모두 불가 (1개)**: intangibles — 고정값

---

## 퇴화 그룹 (DECLINE_GROUPS)

개별 속성의 `declineOnset`/`maxSeasonDecline`/`floor`는 ATTR_CONFIG에서 직접 정의.
퇴화 그룹은 `peakAge`(유지 노이즈 시작점)와 노이즈 크기만 정의한다.

| 그룹 | peakAge | noiseStdev | 대상 속성 |
|------|---------|-----------|----------|
| earlyAthletic | 25 | 0.4 | speed, agility, vertical |
| midPhysical | 27 | 0.4 | dunk, spdBall, blk, offReb, strength, stamina, hustle, durability |
| lateStable | 29 | 0.3 | closeShot, layup, postPlay, drawFoul, hands, intDef, perDef, steal, defReb, boxOut, offBallMovement |
| iqSkill | 32 | 0.2 | 슈팅, 패스, IQ 계열 전체 |
| never | 99 | 0.0 | intangibles |

### peakAge ~ declineOnset 구간

peakAge 이후 ~ declineOnset 이전: **유지 노이즈** 구간. 소폭 등락이 시드 기반으로 발생하지만 체계적 퇴화는 아님.
