# Commentary System (textGenerator.ts)

## 개요
PBP 로그에 표시되는 한국어 해설 텍스트를 생성하는 시스템.
플레이 결과, 존, 플레이 타입, 미스매치, PnR 커버리지 등 다양한 컨텍스트에 따라 해설이 분기됨.

**파일**: `services/game/engine/commentary/textGenerator.ts`
**호출 위치**: `statsMappers.ts` → `applyPossessionResult()`

---

## 함수 목록

### `generateCommentary(type, actor, defender, assister, playType, zone, flags)`
메인 해설 생성기. 모든 포세션 결과에 대한 해설을 반환.

**flags**:
```typescript
{
    isSwitch: boolean,
    isMismatch: boolean,
    isBotchedSwitch: boolean,
    isBlock: boolean,
    isSteal: boolean,
    points: number,
    pnrCoverage?: 'drop' | 'hedge' | 'blitz'
}
```

### 해설 분기 구조

#### 1. Score (득점)
우선순위:
1. PnR Coverage 전용 해설 (drop/hedge/blitz × zone × playType)
2. 3PT: botchedSwitch → assister → mismatch → 일반
3. Rim/Paint: Putback → PnR_Roll/Cut + Dunk → Dunk → mismatch → 일반
4. Mid-Range: 일반

Dunk 조건: `vertical > 70 && ins > 60`

#### 2. Miss (실패)
우선순위:
1. PnR Coverage 수비 성공 (drop+Roll, blitz+Handler, hedge+Handler)
2. Block (수비자 존재)
3. 3PT miss
4. Putback miss
5. 일반 miss

#### 3. Turnover
- Blitz 더블팀 턴오버 (스틸/일반)
- 스틸 (수비자 존재)
- 일반 턴오버

#### 4. Foul
- 수비 반칙 일반 해설

### `getReboundCommentary(rebounder, type)`
- **off**: 5가지 공격 리바운드 해설
- **def**: 4가지 수비 리바운드 해설

### `getTechnicalFoulCommentary(defender)`
- 15가지 테크니컬 파울 해설 변형

### `getFlagrant1Commentary(defender, actor)`
- 12가지 Flagrant 1 해설 변형

### `getFlagrant2Commentary(defender, actor)`
- 10가지 Flagrant 2 해설 변형

---

## 해설 총 변형 수

| 카테고리 | 변형 수 |
|----------|--------|
| 득점 (PnR coverage 포함) | ~35+ |
| 실패 (PnR coverage 포함) | ~15+ |
| 턴오버 | ~10+ |
| 파울 | 3 |
| 리바운드 | 9 |
| 테크니컬 | 15 |
| Flagrant 1 | 12 |
| Flagrant 2 | 10 |
| **총계** | **~110+** |

---

## 수정 시 주의사항
- 모든 해설은 한국어로 작성
- `pick()` 헬퍼로 배열에서 랜덤 선택
- 득점 해설에는 `(+N)` 점수 태그가 붙음
- 새로운 플레이 타입이나 결과 타입 추가 시 해설도 함께 추가 필요
- 이모지 사용: 🟨 (테크니컬), 🟥 (플래그런트), ⚡ (미스매치), 🛡️ (수비), 🚨 (퇴장/부상), ⏱ (샷클락)
