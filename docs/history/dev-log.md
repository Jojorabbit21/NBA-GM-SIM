# 개발 히스토리 노트

코드 수정 시(특히 엔진/로직 변경) 전후를 세세히 기록하는 문서. 문제가 생겼을 때 이 문서만 보고
수동 복구(역순 적용)할 수 있는 걸 목표로 한다. **최신 항목이 위로 오도록 역순 추가.**

## 기록 형식

```
## YYYY-MM-DD — 제목

**배경**: 왜 이 변경을 하는지 (어떤 문제/요청에서 시작됐는지)

**변경 파일**:
- `path/to/file.ts` (client)
- `path/to/file.ts` (server 미러)

**Before**:
​```ts
...
​```

**After**:
​```ts
...
​```

**검증**: tsc/build/deploy 결과 요약

**롤백 방법**: Before 블록 내용으로 그대로 되돌리면 됨 (또는 git 커밋 해시)
```

- 미러 쌍(client/server) 변경은 항상 둘 다 기록 — 하나만 롤백하면 미러가 깨지므로 반드시 같이 되돌릴 것.
- 상수/설정값 변경은 값 자체(이전 값 → 이후 값)를 명시.
- 이 문서는 git으로 버전 관리되므로 최악의 경우 `git log -- docs/history/dev-log.md`로도 시점별 상태 추적 가능.

---

## 2026-07-28 — 리바운드 판정에 허슬(hustle) 능력치 반영

**배경**: 역할 적합도 점수(`archetypeSystem.ts`) 정리 작업 도중, 실제 리바운드 판정 로직
(`reboundLogic.ts`)을 다시 살펴보다가 사용자가 "리바운드에서 허슬 능력치를 사용했으면 좋겠는데
그 부분은 빠져있구나"를 지적. 팀 단위 ORB% 계산(`calculateOrbChance`의 `calcPower`)과 개인
리바운더 선택(`selectRebounder`의 `score`) 둘 다 `rebAttr(offReb/defReb) + vertical + strength +
boxOut` 4개 능력치만 사용하고 `hustle`이 빠져 있었음. 가중치 `rebAttr×0.45 + vertical×0.20 +
strength×0.10 + boxOut×0.15 + hustle×0.10`(합 1.00, rebAttr -0.05·strength -0.05로 hustle×0.10
자리 마련)을 제안해 승인받음. 사용자가 "팀 파워 공식에도 추가해줘"라고 명시적으로 요청해
두 공식(팀 레벨 + 개인 레벨) 모두에 동일하게 적용.

**변경 파일**:
- `services/game/engine/pbp/reboundLogic.ts` (client)
- `server/src/shared/engine/pbp/reboundLogic.ts` (server 미러)

**Before**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.5 + p.attr.vertical * 0.2 + p.attr.strength * 0.15 + p.attr.boxOut * 0.15);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.5 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.15 +
    p.attr.boxOut * 0.15
) * shooterPenalty;
```

**After**:
```ts
// calculateOrbChance 내부 calcPower
const calcPower = (team: TeamState, rebAttr: 'offReb' | 'defReb') =>
    team.onCourt.reduce((sum, p) => {
        return sum + (p.attr[rebAttr] * 0.45 + p.attr.vertical * 0.2 + p.attr.strength * 0.10 + p.attr.boxOut * 0.15 + p.attr.hustle * 0.10);
    }, 0);

// selectRebounder 내부 score
let score = (
    p.attr[rebAttr] * 0.45 +
    p.attr.vertical * 0.2 +
    p.attr.strength * 0.10 +
    p.attr.boxOut * 0.15 +
    p.attr.hustle * 0.10
) * shooterPenalty;
```

**검증**: client/server diff 확인(주석 차이만 존재, 로직 완전 동일), 양 파일 중괄호 균형 확인,
`server/tsconfig.json` 기준 `tsc --noEmit` 결과 `reboundLogic.ts`발 신규 에러 없음(기존
`tournamentArchiver.ts`/`scheduler.ts`/`startDraft.ts`/Bun 타입 관련 에러는 이번 변경과 무관한
기존 이슈), `npm run build` 성공, `fly deploy -a basketballgm-app-server` 배포 후 헬스체크
200·`fly logs`에서 `worker#0 ready`/`scheduler started`/에러 없이 정상 재기동 확인.

**롤백 방법**: 위 Before 블록 가중치로 두 파일 모두 되돌리면 됨.

---

## 2026-07-28 — 멀티플레이어 어드민 트레이드(팀↔팀 선수 스왑) 신규 구현

**배경**: `docs/plan/multi-admin-trade-plan.md` 참조. 멀티플레이어에는 유저 간 협상형 트레이드도,
어드민용 로스터 교정 도구도 전혀 없었음(계약/샐러리 데이터 자체가 멀티에 없어 싱글의
`tradeExecutor.ts`는 재사용 불가 확인됨). 어드민이 `AdminTeamEditorView.tsx`(팀별 뎁스차트/로테이션/
전술을 보는 화면)에서 두 팀 사이 선수를 직접 맞교환하는 기능을 요청받아 완전 신규 구축. 추가로
"로스터 변경은 트레이드 실행 버튼을 눌러야만 반영"(카트 방식, 실시간 적용 아님)과 "트레이드 후
뎁스차트·로테이션을 1회 자동 설정"을 명시적으로 요구받음 — 후자는 기존 `generateAutoTactics()`
(뎁스차트+48칸 로테이션맵+슬라이더를 한 번에 생성하는 기존 함수, `AdminTeamEditorView.tsx`가
이미 신규 팀 초기화에 쓰고 있던 것)를 트레이드 후 양팀 모두에 재사용하는 것으로 간단히 해결 —
애초 계획서의 "stale 참조 부분 정리" 방식보다 더 간단하고 견고함(옛 참조가 남을 수 없음).

**변경 파일**:
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_execute_admin_trade_rpc`) —
  `execute_admin_trade(p_room_id, p_admin_user_id, p_team_a_id, p_team_b_id, p_players_a_to_b, p_players_b_to_a)`
  RPC 신설(`SECURITY DEFINER`). 어드민 검증(`leagues.admin_user_id`) → 각 선수가 실제로 해당 팀
  로스터에 있는지 검증 → `league_teams.roster`(jsonb 배열) 원자적 스왑(제거 후 병합). `claim_team`
  RPC와 동일 패턴 재사용
- `services/multi/leagueService.ts` (client) — `executeAdminTrade(params)` 신규, RPC 래핑 +
  에러코드별(`not_admin`/`player_not_on_team_a`/`player_not_on_team_b`/`same_team`) 한국어 메시지 매핑
- `components/dashboard/AdminTradePanel.tsx` (신규, client) — 상대 팀 선택 → 팀 A(부모가 이미
  하이드레이션한 로스터 prop 재사용)/팀 B(자체 `meta_players` 하이드레이션) 로스터를 좌우로 나열,
  `OvrBadge`로 선수 행 표시, 클릭으로 트레이드 카트에 토글, "트레이드 실행" 버튼(확인 단계 포함)을
  눌러야만 `executeAdminTrade()` 호출. 성공 시 이미 메모리에 있는 양측 `Player[]`로 트레이드 후
  로스터를 로컬 계산 → `generateAutoTactics()`로 양팀 전술 재생성 → `saveMemberTactics()`로 저장 →
  부모에 `onTradeComplete(teamA 새 전술)` 콜백
- `views/multi/league/AdminTeamEditorView.tsx` (client) — `AdminTab`에 `'trade'` 추가, "트레이드"
  탭 렌더, `handleTradeComplete()` — 트레이드 성공 시 팀A의 `draftTactics`/`draftDepthChart` 로컬
  상태를 새로 생성된 전술로 즉시 교체(`reload()`만 의존하면 로스터 인원수가 안 바뀌는 1:1 트레이드
  등에서 리셋 useEffect가 재실행되지 않아 화면이 트레이드 이전 상태를 계속 보여주는 문제를 방지)

**Before**: 멀티플레이어에 팀 간 선수 이동 수단이 전혀 없었음(트레이드 UI/RPC/엔진 모두 부재).

**After**: 어드민이 "트레이드" 탭에서 두 팀 로스터를 보고 각 팀에서 나갈 선수를 카트에 담은 뒤
"트레이드 실행" → 확인 → RPC로 `league_teams.roster` 원자적 스왑 → 양 팀 뎁스차트/로테이션
자동 재설정까지 한 번에 처리.

**검증**:
- RPC 자체: `apply_migration` 성공(문법 유효), 더미 UUID로 직접 호출해 `not_admin` 가드가 정확히
  발동함을 확인, jsonb 배열 제거+병합 로직(`["p1","p2","p3"]` - `["p2"]` + `["p9"]` →
  `["p1","p3","p9"]`)을 실제 테이블과 무관하게 격리 테스트해 정확성 확인
- 클라이언트: `AdminTradePanel.tsx`/`leagueService.ts`에 대해 synthesize한 tsc 옵션으로 신규 타입
  에러 없음. `AdminTeamEditorView.tsx`에서 발견된 에러 1건(`TabBar`의 `onTabChange` 제네릭 추론
  이슈)은 `git stash`로 대조해 **이번 변경 이전부터 있던 기존 이슈**임을 확인(줄 번호만 203→215로
  밀림)
- **실제 방에서 실사용 트레이드 스모크 테스트는 미실시** — 실제 유저 로스터 데이터를 건드리는
  작업이라 사용자 승인 없이 임의 실행하지 않음. 다음 사용 시 테스트 리그에서 먼저 확인 권장

**롤백 방법**: 코드는 위 3개 client 파일(`leagueService.ts`/`AdminTeamEditorView.tsx`)의 diff를
되돌리고 `components/dashboard/AdminTradePanel.tsx` 파일을 삭제. DB는
`DROP FUNCTION public.execute_admin_trade(uuid,uuid,uuid,uuid,jsonb,jsonb);`로 RPC 제거(코드에서
호출 안 하면 남아있어도 무해함).

---

## 2026-07-28 — 뎁스차트 OVR 배지 텍스트 크기를 로테이션 차트와 통일

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 `OvrBadge`는 `size="sm"` 기본값(`text-[10px]`)을
그대로 썼는데, 같은 프로젝트의 로테이션 차트(`RotationMatrix.tsx`, `RotationGanttChart.tsx`)는
동일한 `size="sm"`에 `className="!text-xs ..."`로 텍스트만 12px로 키워서 쓰고 있어 두 화면의
배지 글자 크기가 달랐다. 통일해달라는 요청.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용) —
  `<OvrBadge value={...} size="sm" />` → `<OvrBadge value={...} size="sm" className="!text-xs" />`
  (크기(`w-6 h-6`)·그림자 등 나머지 스타일은 요청 범위 밖이라 그대로 유지)

**Before**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />` (텍스트 10px, `OvrBadge.tsx`의 `sm` 프리셋 기본값)

**After**: `<OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" className="!text-xs" />` (텍스트 12px, 로테이션 차트와 동일)

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제 브라우저 렌더링 비교는 미실시.

**롤백 방법**: `className="!text-xs"`를 제거하면 됨.

---

## 2026-07-28 — 뎁스차트 OVR 배지 위치/표기 수정 (좌측 배지 + 닫힌상태 텍스트 정리)

**배경**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")에서 배지를 select 우측에 오버레이하고 옵션
텍스트에 `- OVR {값}`을 붙였는데, 사용자가 3가지로 정정 요청: (1) 배지를 이름 **좌측**으로 이동
(2) 선택된(닫힌 상태) 슬롯에서는 "포지션 우측 OVR 텍스트" 표기 제거 — 배지만으로 OVR을 전달
(3) 드롭다운을 펼쳤을 때는 `(OVR) 이름 - 포지션` 형식으로 표시.

문제는 네이티브 `<select>`는 "닫힌 상태에 보이는 텍스트"와 "드롭다운 옵션 텍스트"가 항상 같은
소스(선택된 `<option>`의 textContent)라서, 둘의 표기를 다르게 만들 수 없다는 점이었다 — 그래서
select 자체의 텍스트를 `text-transparent`로 완전히 숨기고, 그 위에 "이름 - 포지션"만 보여주는
별도의 커스텀 라벨 `<div>`를 오버레이하는 방식으로 전환했다. 실제 `<option>` 텍스트(드롭다운
목록에서 보이는 것)는 `(OVR) 이름 - 포지션` 그대로 유지 — 각 `<option>`에 이미 걸려있는
`text-white`/`text-slate-500` 클래스가 부모 select의 `text-transparent`보다 우선 적용되어
드롭다운 목록 자체는 계속 정상적으로 보인다(이 프로젝트가 이미 option별 색상 클래스를 쓰고
있었으므로 같은 메커니즘 재사용).

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용, 직전 항목과 동일 파일)
  - `<select>` className: `text-white`(선택시)/`text-slate-500`(빈값) 동적 처리를 제거하고
    `text-transparent` 고정 + `pl-9`(배지 자리)로 변경, `pr-16`→`pr-10`으로 원복(우측엔 체브론만 남음)
  - `<option>` 텍스트: `{name} - {position} - OVR {ovr}` → `({ovr}) {name} - {position}`
  - `OvrBadge` 오버레이 위치: `right-9` → `left-2`
  - 신규: `<div className="absolute inset-0 ... pl-9 pr-10">{selectedPlayer ? `${name} - ${position}` : '선수 선택'}</div>` — 닫힌 상태 전용 커스텀 라벨(OVR 텍스트 없음)

**Before**:
```tsx
<select className="... pl-4 pr-16 ... text-white ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ..."><OvrBadge value={...} size="sm" /></div>
)}
```

**After**:
```tsx
<select className="... pl-9 pr-10 ... text-transparent ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option ...>({calculatePlayerOvr(p)}) {p.name} - {p.position}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute left-2 ..."><OvrBadge value={...} size="sm" /></div>
)}
<div className="absolute inset-0 flex items-center pl-9 pr-10 pointer-events-none text-xs font-semibold truncate ...">
    {selectedPlayer ? `${selectedPlayer.name} - ${selectedPlayer.position}` : '선수 선택'}
</div>
```

**검증**: `DepthChartEditor.tsx`에 대해 synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 실제
브라우저에서 `text-transparent` select + option 색상 오버라이드 조합이 의도대로 렌더링되는지
(특히 Safari/Firefox 크로스브라우저 차이)는 미실시 — Chromium 계열에서 흔히 쓰이는 패턴이라
프로젝트 브라우저 타깃(Chrome 위주 개발) 기준으로는 위험 낮다고 판단.

**롤백 방법**: 직전 항목("뎁스차트 슬롯에 OVR 배지 표시")의 After 블록으로 되돌리면 됨(두 항목을
합쳐서 원래 형태로 되돌리려면 최초 커밋, 즉 배지 자체가 없던 상태까지 더 거슬러 올라가야 함).

---

## 2026-07-28 — 뎁스차트 슬롯에 OVR 배지 표시

**배경**: 뎁스차트(`DepthChartEditor.tsx`)의 각 슬롯이 네이티브 `<select>`라 선택된 선수 이름 외에
능력치를 한눈에 볼 방법이 없었음. 선수 이름 우측에 OVR 배지를 띄워달라는 요청. 이 컴포넌트는
싱글플레이 대시보드(`DashboardView.tsx`)와 멀티플레이 전술 화면(`MultiTacticsView.tsx`,
`AdminTeamEditorView.tsx`) 3곳이 전부 공유하므로 한 번 고치면 세 화면 모두 반영됨.

네이티브 `<select>`의 `<option>`은 브라우저가 플레인 텍스트로만 렌더링해 그 안에 색상 배지를
넣을 수 없다 — 대신 select 위에 절대 위치로 `OvrBadge`(기존 재사용 컴포넌트, OVR 구간별 색상
그라데이션 자동 적용)를 오버레이해서 "닫힌 상태"에서 배지가 보이도록 했다. 드롭다운을 펼쳤을 때의
옵션 목록 자체는 배지를 못 넣으므로, 대신 옵션 텍스트에 `- OVR {값}`을 추가해 최소한의 정보는
드롭다운 안에서도 보이게 보완했다.

**변경 파일**:
- `components/dashboard/DepthChartEditor.tsx` (client, 싱글/멀티 3개 화면 공용)
  - `OvrBadge`(`components/common/OvrBadge.tsx`) import 추가
  - 슬롯별 선택된 선수를 `team.roster.find()`로 조회해 `calculatePlayerOvr()` 결과를
    `<OvrBadge size="sm">`로 select 우측(체브론 아이콘 왼쪽)에 절대위치 오버레이
  - `<option>` 텍스트에 `- OVR {calculatePlayerOvr(p)}` 추가
  - select의 `pr-10` → `pr-16`으로 늘려 배지+체브론 자리 확보(텍스트 겹침 방지)

**Before**:
```tsx
<select className="... pr-10 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position}</option>
    ))}
</select>
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**After**:
```tsx
<select className="... pr-16 ...">
    <option value="">선수 선택</option>
    {sortedRoster.map(p => (
        <option key={p.id} value={p.id}>{p.name} - {p.position} - OVR {calculatePlayerOvr(p)}</option>
    ))}
</select>
{selectedPlayer && (
    <div className="absolute right-9 ...">
        <OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="sm" />
    </div>
)}
<div className="absolute right-3 ..."><ChevronDown/></div>
```

**검증**: 수정 파일 1개(`DepthChartEditor.tsx`)에 대해 synthesize한 tsc 옵션으로 신규 타입 에러
없음 확인. JSX 중첩(`[0,1,2].map(depthIndex => { ...; return (<TableCell>...); })`) 괄호 균형 확인.
실제 브라우저 렌더링(배지 위치가 체브론과 안 겹치는지)은 미실시.

**롤백 방법**: 위 Before 블록으로 되돌리면 됨. 서버/DB 변경 없음(클라이언트 전용, 3개 화면 공용
컴포넌트라 롤백 시 세 화면 모두 원상복구됨).

---

## 2026-07-28 — spacer 아키타입, archetypesEnabled 토글과 무관하게 항상 실계산

**배경**: 직전 항목(3점 코너 편향 버그) 조사 중, CatchShoot 액터 선택(`pickWeightedActor(p => p.archetypes.spacer)`)이
사실상 무의미하다는 걸 발견함 — `archetypeSystem.ts`의 `ARCHETYPES_DISABLED = true`(기본값, `SimSettings.archetypesEnabled`도
기본 false)일 때 12개 아키타입 전부 무조건 50으로 반환돼서, 르브론이든 주바치든 spacer 점수가 동일했음.

`git log`로 추적해보니 이 disabled 상태는 의도된 설계가 아니라 4개월 전(`98f84a3 disabled player archetypes`,
직전 커밋 `c1ea42c feat: Integrate dynamic archetype system` 직후) BLOCK/PLAYMAKING/CLUTCH_ARCHETYPE/ZONE_SHOOTING과
함께 `★ TEMPORARY`로 표시된 채 응급 롤백된 뒤 재검토 없이 방치된 것으로 확인됨(단, 이 4개는 `SIM_CONFIG`의 별도
하드코딩 상수라 `archetypesEnabled`와 런타임으로 연결되어 있지 않음 — 이번 변경과 무관).

12개 공식을 전부 확인해본 결과 전혀 "분류형 아키타입"이 아니라 기존 raw 능력치(threeVal/shotIq/handling 등,
전부 엔진 다른 곳에서 이미 검증되어 쓰이는 값)의 단순 가중평균이라, 계산 자체의 리스크는 낮다고 판단.
다만 12개 전부를 한꺼번에 켜는 것(BLOCK 등 4개 시스템도 얽힌 더 큰 결정)은 왜 원래 꺼졌는지 재확인이
필요한 별도 논의로 미루고, 이번엔 지금 당장 문제가 되는 **spacer 하나만** 토글과 무관하게 항상 실계산하도록
범위를 좁힘 — 나머지 11개(handler/driver/screener 등)는 여전히 토글에 따라 50으로 뭉개짐.

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()`
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
if (disabled) {
    return {
        handler: 50, spacer: 50, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;
// ... (normHeight/normWeight, 그리고 return 블록에서 spacer: getVal(threeAvg*0.6 + shotIq*0.25 + offConsist*0.15) 계산)
```

**After**:
```ts
const disabled = archetypesEnabled !== undefined ? !archetypesEnabled : ARCHETYPES_DISABLED;
const fatigueFactor = Math.max(0.5, 0.5 + (condition * 0.005));
const getVal = (val: number) => val * fatigueFactor;
const threeAvg = attr.threeVal;

// spacer는 나머지 11개와 달리 토글과 무관하게 항상 실계산
const spacer = getVal((threeAvg * 0.60) + (attr.shotIq * 0.25) + (attr.offConsist * 0.15));

if (disabled) {
    return {
        handler: 50, spacer, driver: 50, screener: 50,
        roller: 50, popper: 50, rebounder: 50, postScorer: 50,
        isoScorer: 50, connector: 50, perimLock: 50, rimProtector: 50
    };
}
// ... (나머지 11개는 그대로, return 블록의 spacer는 위에서 계산한 변수 재사용)
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공. Node
재현: 주바치류 raw 능력치(threeVal 45, shotIq/offConsist 70 가정) → spacer 55.0, 커리급(threeVal 95,
shotIq 92, offConsist 88) → spacer 93.2 — 이전엔 disabled 상태에서 둘 다 50으로 동일했던 것이 이제
실제 능력치 차이만큼 갈라짐을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 기동 확인.

**주의사항 / 한계**: 이 수정만으로는 주바치 문제가 완전히 안 풀림 — 그의 raw 3점 능력치(45)가 낮지 않아
spacer가 50→55로 오히려 살짝 오름(텐던시가 아니라 능력치 기반이라 여전히 "3점을 실제로 쏘고 싶어하는가"는
안 봄). CatchShoot 액터 선택에 `zonePref.three`(텐던시) 배율을 곱하는 후속 작업("방법 2")이 별도로 필요함 —
다음 논의/작업 대상으로 남겨둠.

**롤백 방법**: 두 파일에서 `spacer` 계산을 `disabled` 체크 이전으로 끌어올린 부분과, `disabled` 분기의
`spacer: 50` → `spacer`(변수 참조) 변경을 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 3점 텐던시 전부 0인 선수가 항상 우측 코너로만 쏘던 버그 수정

**배경**: "FMK 빅 토너먼트" 선수 데이터를 분석하다가, 댈러스의 이비차 주바치(`tendencies.zones`가
`{ra:100, itp:36, mid:7, atb:0, cnr:0, p45:0}` — 3점 텐던시 완전히 0)가 실제 게임에서 5경기 연속
3점을 시도했고, 그 시도가 **매 경기 예외 없이 전부 `zone_c3_r`(우측 코너)**로 기록된 것을 발견해서
추적함.

원인은 두 단계: ① `CatchShoot` 플레이타입은 `preferredZone: '3PT'`가 하드코딩돼 있고, 액터 선택
(`pickWeightedActor`)이 `Math.max(1, rawScore)`로 최소 가중치를 항상 보장해서 3점 텐던시 0인 선수도
낮은 확률로 캐치앤슛 슈터로 뽑힐 수 있음(설계상 있을 수 있는 부분, 이번엔 안 건드림 — 사용자가
"방법 2"로 명명, 추후 별도 논의 예정). ② `resolveDynamicZone()`의 3점 서브존(코너/45도/탑) 분배
로직이 `threeSubPref` 3개 값이 전부 0일 때 `total = 0 || 1`(JS에서 `0`은 falsy)로 인해 확률이 전부
0이 되고, `rand`(항상 0 이상)가 모든 `if (rand < ...)`를 통과해 매번 마지막 `return 'zone_c3_r'`로
고정되는 **실제 코드 버그**. 이번엔 ②만 수정(사용자가 "방법 1"로 명명, 우선 적용 합의).

**변경 파일**:
- `services/game/engine/shotDistribution.ts` (client) — `resolveDynamicZone()`의 3PT 분기
- `server/src/shared/engine/shotDistribution.ts` (server 미러) — 동일 수정

**Before**:
```ts
const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```

**After**:
```ts
const spRaw = player.threeSubPref;
const spTotal = spRaw ? spRaw.cnr + spRaw.p45 + spRaw.atb : 0;
const sp = spTotal > 0 ? spRaw : { cnr: 0.30, p45: 0.40, atb: 0.30 };
const cl = (sp.cnr / 2) * leftMult, cr = (sp.cnr / 2) * rightMult;
const wl = (sp.p45 / 2) * leftMult, wr = (sp.p45 / 2) * rightMult;
const top = sp.atb;
const total = cl + wl + top + wr + cr || 1;
const pCl = cl / total, pWl = wl / total, pTop = top / total, pWr = wr / total;
if (rand < pCl) return 'zone_c3_l';
if (rand < pCl + pWl) return 'zone_atb3_l';
if (rand < pCl + pWl + pTop) return 'zone_atb3_c';
if (rand < pCl + pWl + pTop + pWr) return 'zone_atb3_r';
return 'zone_c3_r';
```
(`threeSubPref`가 있지만 합이 0인 경우도 "없는 경우"와 동일하게 기본 30/40/30 분포로 폴백하도록
한 줄만 조건 확장 — 나머지 로직 동일)

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현 스크립트로 확인 — 수정 전엔 all-zero threeSubPref 입력 시 20000회 전부 `zone_c3_r`,
수정 후엔 `zone_atb3_c`(≈30%)/`zone_atb3_r`(≈24%)/`zone_atb3_l`(≈16%)/`zone_c3_r`(≈18%)/`zone_c3_l`
(≈12%)로 고르게 분산됨을 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상 재기동 확인.

**롤백 방법**: 두 파일에서 `spRaw`/`spTotal` 도입 부분을 제거하고 `const sp = player.threeSubPref ?? { cnr: 0.30, p45: 0.40, atb: 0.30 };`로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

**관련 논의**: "방법 2"(CatchShoot 액터 선택 시 3점 텐던시가 낮은 선수의 가중치를 더 깎아서, 애초에
그런 선수가 캐치앤슛 슈터로 뽑히는 빈도 자체를 줄이는 것)는 사용자 합의로 이번 범위에서 제외,
추후 별도 논의 예정.

---

## 2026-07-28 — 역할 적합도 점수 11종(rebounder 제외) 토글과 무관하게 항상 실계산

**배경**: 직전 항목(spacer 예외 처리)에 이어서, 나머지 11개도 조사해본 결과 `archetypesEnabled`
disabled 상태에서 50으로 뭉개지는 게 `playTypes.ts`의 액터/패서 선택뿐 아니라 두 군데를 더
무력화시키고 있었음을 발견:
- **미스매치 판정** (`flowEngine.ts:296-320`) — `offSkill`(spacer/driver/postScorer) vs
  `defSkill`(perimLock/rimProtector) 비교인데, 수비 쪽이 항상 50 고정이라 `skillGap`이 포지션
  기반 케이스(가드-빅 매치업) 말고는 15 이상 나올 수 없어 `hitRate -= 0.03` 페널티만 거의 항상
  적용되고 있었음
- **헬프 디펜스 블락 보너스** (`possessionHandler.ts:977`) — `rimProtector > HELP_RIM_THRESHOLD(75)`
  체크인데 rimProtector가 항상 50이라 조건이 누구에게도 절대 참이 될 수 없어 완전히 죽어있었음
- `rebounder`는 조사 결과 `archetypes.rebounder`를 읽는 코드가 엔진 어디에도 없는 순수 dead code
  (`reboundLogic.ts`는 raw 능력치를 직접 씀) — 사용자 판단으로 이번 범위에서 제외, 리바운드 로직
  재검토 시 별도로 다루기로 함

**변경 파일**:
- `services/game/engine/pbp/archetypeSystem.ts` (client) — `calculatePlayerArchetypes()` 구조 개편
- `server/src/shared/engine/pbp/archetypeSystem.ts` (server 미러) — 동일

**Before**: `disabled` 분기와 `!disabled` 분기 두 갈래로 나뉘어, disabled 시 11개(spacer 제외) 전부
`50` 하드코딩 반환, 아니면 전부 실계산 반환하는 구조(직전 항목의 spacer 예외만 반영된 상태).

**After**: 두 분기를 제거하고 handler/spacer/driver/screener/roller/popper/postScorer/isoScorer/
connector/perimLock/rimProtector 11개를 전부 함수 상단에서 무조건 실계산하는 `const`로 선언,
`rebounder`만 `disabled ? 50 : getVal(...)`로 예외 유지. 마지막에 12개를 한 번에 조립해서 반환하는
단일 return으로 단순화:
```ts
const handler = getVal(...);
const spacer = getVal(...);
// ... (9개 더, 전부 무조건 실계산) ...
const rebounder = disabled ? 50 : getVal(attr.reb*0.70 + attr.hustle*0.15 + attr.vertical*0.15);
const rimProtector = getVal(...);

return { handler, spacer, driver, screener, roller, popper, rebounder, postScorer, isoScorer, connector, perimLock, rimProtector };
```

**검증**: client/server `tsc --noEmit` 신규 에러 없음, 브레이스 균형 확인, `npm run build` 성공.
Node 재현: 엘리트 림프로텍터 능력치(blk=92, intDef=90, height=213) 입력 시 `disabled=true`여도
`rimProtector=88.3`으로 계산돼 `HELP_RIM_THRESHOLD(75)`를 정상적으로 넘음(수정 전엔 무조건 50이라
절대 못 넘었음), `rebounder`는 여전히 50 고정 확인. `fly deploy` 배포 성공, HTTP 200, 워커 풀 정상
기동 확인.

**주의사항 / 한계**: 미스매치 판정 시스템은 이제 공격/수비 양쪽 다 실계산되므로 `skillGap`이 의미
있게 작동하지만, 실제로 밸런스가 어떻게 나오는지(미스매치 보너스 발동 빈도, 헬프 블락 발동 빈도 변화)
브라우저/실경기 테스트는 미실시 — 다음 실제 토너먼트 시뮬레이션에서 관찰 필요.

**롤백 방법**: 두 파일에서 함수 본문을 이전(11개 즉시 50 하드코딩 disabled 분기 + 전체 재계산
enabled 분기 이중 구조)으로 되돌리면 됨 — 미러 쌍이므로 반드시 함께.

---

## 2026-07-28 — 리그 생성 모달에 정규화 강도 선택 추가

**배경**: "리그 상대 정규화 강도"(고OVR 드래프트 풀에서 득점 과열 억제)는 `LeagueSettingsView.tsx`(드래프트 이전 recruiting 단계에서 접근 가능한 세션 설정 화면)에는 이미 있었지만, 리그를 **처음 생성**하는 `CreateLeagueModal.tsx`에는 없어서 생성 직후엔 항상 DB 기본값(사실상 비어있음, 실질적으로 레벨3=k0.7 폴백)으로만 시작했다. 생성 단계에서도 선택 가능하게 해달라는 요청.

**변경 파일**:
- `types/simSettings.ts` — `NORMALIZATION_LEVELS`(레벨0~5 → {enabled,k,label} 매핑), `DEFAULT_NORMALIZATION_LEVEL`(=3) 신규 export. 기존 `LeagueSettingsView.tsx`에 로컬로 있던 동일 배열을 여기로 옮겨 두 화면이 공유하도록 함.
- `views/multi/league/LeagueSettingsView.tsx` — 로컬 `NORMALIZATION_LEVELS` 정의 삭제, `types/simSettings.ts`에서 import. 하드코딩된 fallback `3` → `DEFAULT_NORMALIZATION_LEVEL`로 교체(동작 변화 없음).
- `services/multi/leagueService.ts` — `CreateRoomParams`에 `simSettings?: SimSettings` 추가, `createRoom()`의 insert 페이로드에 `sim_settings` 조건부 포함.
- `components/multi/CreateLeagueModal.tsx` — `normalizationLevel` state(기본값 `DEFAULT_NORMALIZATION_LEVEL`) 추가, 드래프트 설정 섹션 아래 "엔진 설정" 섹션(0~5 숫자 입력)을 신설, `handleSubmit`의 `createRoom()` 호출에 `simSettings: { normalization: { enabled, k } }` 전달.

**Before**: `CreateLeagueModal.tsx`는 `createRoom({ leagueId, maxPlayers })`만 호출 — `sim_settings` 컬럼이 DB 기본값으로 남고, 방장이 recruiting 단계에서 `LeagueSettingsView`에 들어가 별도로 저장해야만 정규화 값이 명시적으로 채워짐.

**After**: 생성 모달에서 0(끔)~5(최대) 레벨을 선택하면 `createRoom()` insert 시점에 `rooms.sim_settings.normalization = { enabled, k }`가 바로 채워짐. 생성 후에도 `LeagueSettingsView`에서 그대로 재확인/변경 가능(같은 `NORMALIZATION_LEVELS` 프리셋 사용).

**검증**: 루트에 tsconfig.json이 없어 프론트엔드는 tsc 타입체크 대상이 아님(Vite/esbuild가 타입 어노테이션만 strip) — 기존 `LeagueSettingsView.tsx`도 동일한 패턴(`SimSettings` 타입에 없는 `normalization` 키를 런타임에서 읽고 씀)이라 기존 관례를 그대로 따름. 브라우저 수동 확인은 하지 않음(로컬 dev 서버 미기동).

**롤백 방법**: 위 4개 파일을 각 Before 상태로 되돌리면 됨 — `CreateLeagueModal.tsx`의 `createRoom()` 호출에서 `simSettings` 제거, `leagueService.ts`의 `CreateRoomParams.simSettings`/insert 조건부 스프레드 제거, `LeagueSettingsView.tsx`에 로컬 `NORMALIZATION_LEVELS` 재추가, `types/simSettings.ts`에서 신규 export 제거.

---

## 2026-07-28 — 오토픽 유저 "AUTO" 배지 표시

**배경**: 오토픽 관련 기능(개념/토글/트리거 0~3)이 전부 구현됐지만, 어떤 팀이 지금 오토픽
상태인지 드래프트 화면에서 시각적으로 확인할 방법이 없었음. 사용자 요청으로 두 곳에 배지 추가.
UI 전용 변경이라 처음엔 dev-log 기록 생략을 판단했으나, 사용자가 "dev-log에는 항상 기록을
남겨라"고 명시적으로 정정 — 이후 UI 변경도 전부 기록한다.

**변경 파일**:
- `components/draft/DraftBoard.tsx` (client) — `autoPickTeamIds?: Set<string>` prop 추가, 팀 헤더의
  온라인/오프라인 점 옆에 "AUTO" 배지 렌더링(상시 노출, 대기실/본 드래프트 화면 공용)
- `components/draft/DraftHeader.tsx` (client) — `isCurrentTeamAutoPick?: boolean` prop 추가(기본값
  `false` — 싱글/루키 드래프트와 공용 컴포넌트라 안 넘기면 기존 동작 그대로), "현재 차례" 팀 이름
  옆에 "AUTO" 배지 표시
- `views/multi/league/MultiDraftView.tsx` (client) — `autoPickTeamIds`(`pickOrder` + `autoPickUserIds`로
  userId→teamId 변환), `isCurrentTeamAutoPick` 파생값 계산 후 두 컴포넌트에 전달(대기실/본 화면의
  `DraftBoard` 2곳 + `DraftHeader` 1곳)

**Before**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    {isOnline !== undefined && <span style={{ ...dot... }} />}
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
```

**After**:
```tsx
// DraftBoard.tsx 팀 헤더
<div className="flex flex-col items-center gap-0.5">
    <span>{td.abbr}</span>
    <div className="flex items-center gap-1">
        {isOnline !== undefined && <span style={{ ...dot... }} />}
        {isAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
    </div>
</div>

// DraftHeader.tsx 현재 차례
<span className="text-xs font-bold text-white">{currentDisplay.name}</span>
{isCurrentTeamAutoPick && <span className="... bg-indigo-400 text-indigo-950">AUTO</span>}
```

**검증**: 수정한 3개 파일(`DraftBoard.tsx`/`DraftHeader.tsx`/`MultiDraftView.tsx`)에 대해
synthesize한 tsc 옵션으로 신규 타입 에러 없음 확인. 두 컴포넌트 모두 싱글/루키 드래프트와 공용이라
새 prop을 옵셔널+기본값 `false`/`undefined`로 둬서 기존 호출부(넘기지 않는 곳)엔 영향 없음.
실제 브라우저 렌더링 확인은 미실시.

**롤백 방법**: 위 3개 파일에서 이번 diff(각 prop 추가분 + JSX 배지 블록)를 되돌리면 됨. 서버/DB
변경 없음(클라이언트 전용).

---

## 2026-07-28 — 시즌 데이터(useMultiGameData)를 LeagueLayout으로 끌어올림 — 리그 진입 시 1회만 로드

**배경**: `useMultiGameData()`가 `MultiSeasonLayout`에서 호출되고 있었는데, 이 레이아웃은
`/season/*` 하위 라우트에만 적용됨(로비/설정/어드민 화면은 그 밖의 `LeagueLayout` 형제 라우트).
로비·설정 화면으로 나갔다가 다시 일정/로스터 등 시즌 화면으로 돌아오면 `MultiSeasonLayout`이
언마운트→재마운트되면서 `useMultiGameData()`가 매번 방 데이터부터 처음부터 다시 로드해 로더가
반복적으로 떴음. 사용자와 논의 후 "리그 진입 시점에 한 번만 로딩하고 이후엔 재로딩 없이" 방향으로
결정 — 새로고침 시 다시 로드되는 건 SPA 특성상 불가피하고 오히려 정상 동작이라는 점도 함께 확인함.

**변경 파일**:
- `views/multi/league/LeagueLayout.tsx` (client) — `useMultiGameData(session, state.room?.id ?? null)`
  호출 + `SeasonCtx.Provider`를 여기로 이전. 단, 이 레이아웃 자체의 로딩 게이트는 `state.isLoading`
  (리그 데이터)만 기준으로 유지 — 시즌 데이터 로딩 완료를 기다리지 않고 로비/설정 화면은 즉시 렌더링됨
  (시즌 데이터는 백그라운드에서 병행 로드)
- `views/multi/season/MultiSeasonLayout.tsx` (client) — `useMultiGameData()` 직접 호출과
  `SeasonCtx.Provider` 제거, `useSeasonContext()`로 이미 로드된 데이터를 소비만 함. `gameData.isLoading`
  체크는 유지(URL로 시즌 라우트에 곧바로 진입해 아직 로딩 중인 극히 짧은 순간을 위한 안전장치)

**Before** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <Outlet />
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const { room } = useLeagueContext();
    const { session } = useGame();
    const gameData = useMultiGameData(session, room?.id ?? null);

    if (gameData.isLoading) { return <Loader2 .../>; }

    return (
        <SeasonCtx.Provider value={gameData}>
            ... <Outlet /> ...
        </SeasonCtx.Provider>
    );
}
```

**After** (`LeagueLayout.tsx`):
```tsx
export function LeagueLayout() {
    const { leagueId } = useParams<{ leagueId: string }>();
    const state = useCurrentLeague();
    const { session } = useGame();
    const gameData = useMultiGameData(session, state.room?.id ?? null);

    if (state.isLoading) { return <Loader2 .../>; }

    return (
        <LeagueCtx.Provider value={state}>
            <SeasonCtx.Provider value={gameData}>
                <Outlet />
            </SeasonCtx.Provider>
        </LeagueCtx.Provider>
    );
}
```
(`MultiSeasonLayout.tsx`):
```tsx
export function MultiSeasonLayout() {
    const gameData = useSeasonContext();

    if (gameData.isLoading) { return <Loader2 .../>; }

    return ( ... <Outlet /> ... );  // SeasonCtx.Provider 없음 — 상위(LeagueLayout)에서 이미 제공
}
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(2개 파일 OK), `npm run build`
성공. 순환 임포트 확인 — `seasonContext.ts`가 `hooks/useMultiGameData.ts`와 react만 참조하는 독립
파일이라 `LeagueLayout.tsx`에서 import해도 순환 없음(`hooks/useMultiGameData.ts`/`hooks/useCurrentLeague.ts`
쪽도 `views/multi/league/`를 참조하지 않음을 확인). 클라이언트 UI 전용 변경, 서버 배포 불필요.

**주의사항 / 한계**: 이제 리그의 어떤 하위 화면(로비 포함)에 들어가도 시즌 데이터 로드가 백그라운드로
같이 시작됨 — 드래프트/모집 중이라 시즌이 아직 시작 안 된 리그에서도 매번 이 조회가 발생하는
트레이드오프가 있음(사용자가 명시적으로 선택한 방향, "로비/설정 화면 진입 속도가 느려질 수 있다"는
점 사전 고지 후 승인받음). 실제 브라우저 확인(로비↔일정 반복 이동 시 로더 재출현 여부)은 미실시.

**롤백 방법**: 위 Before 블록으로 두 파일 모두 되돌리면 됨 — 서로 짝을 이루는 변경이라 반드시 함께
되돌릴 것(하나만 되돌리면 `SeasonCtx`가 이중으로 제공되거나 아예 제공되지 않아 `useSeasonContext()`가
깨짐).

---

## 2026-07-27 — 재접속 시 오토픽 자동 해제(트리거 3) — 명시적으로 켠 경우는 보존

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 3, 마지막 남은 항목. 타임아웃 연속 미스나
드래프트 시작 시 미입장으로 오토픽 전환된 유저가 WS 재접속(auth 성공)하면 자동으로 오토픽을
해제하고 수동 모드로 복귀시킨다.

구현 중 발견한 중요한 함정: `autoPickUserIds`는 단일 Set이라 "왜 오토픽 상태가 됐는지"(시스템이
자동 감지했는지, 본인/어드민이 일부러 켰는지)를 구분하지 못한다. 재접속 시 무조건 해제해버리면,
"이번 판은 바빠서 계속 오토픽으로 둘게"라고 셀프토글이나 어드민 토글로 **명시적으로 설정한** 유저가
잠깐 다른 탭에서 재접속하는 순간 그 설정이 의도치 않게 풀려버리는 회귀가 생긴다. 이번 세션 초반에
합의한 "재접속 시 자동 해제"는 어디까지나 시스템이 자동으로 감지해 넣은 경우에 한정된 논의였으므로,
이 구분을 새로 추가해 반영했다.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `autoPickManualUserIds: Set<string>` 상태 신설 — `autoPickUserIds`의 부분집합으로, 셀프/어드민
    토글로 명시적으로 켠 유저만 표시(자동 트리거는 여기 포함 안 됨)
  - `setAutoPick()` — on/off 시 `autoPickManualUserIds`도 함께 갱신
  - `revertAutoPickOnReconnect(userId)` 신규 — `autoPickUserIds`엔 있지만 `autoPickManualUserIds`엔
    없는 경우(=자동 트리거)에 한해서만 `setAutoPick(userId, false)` 호출
  - `handleSubmitPick()` — 본인이 직접 픽 제출 시 `autoPickManualUserIds`도 함께 삭제(수동 픽은
    오토픽 사유·출처를 불문하고 전부 무효화하는 게 맞다고 판단)
- `server/src/index.ts` (server) — `auth` 처리에서 `room.addSocket(ws)` 직후
  `await room.revertAutoPickOnReconnect(userId)` 호출 추가

**Before**:
```ts
// setAutoPick()
if (enabled) this.autoPickUserIds.add(targetUserId);
else         this.autoPickUserIds.delete(targetUserId);

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
// (재접속 시 오토픽 해제 로직 없음)
```

**After**:
```ts
// setAutoPick()
if (enabled) {
    this.autoPickUserIds.add(targetUserId);
    this.autoPickManualUserIds.add(targetUserId);
} else {
    this.autoPickUserIds.delete(targetUserId);
    this.autoPickManualUserIds.delete(targetUserId);
}

// 신규 메서드
async revertAutoPickOnReconnect(userId: string): Promise<void> {
    if (this.autoPickUserIds.has(userId) && !this.autoPickManualUserIds.has(userId)) {
        await this.setAutoPick(userId, false);
    }
}

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
this.autoPickManualUserIds.delete(userId);

// index.ts auth 핸들러
ws.data = { userId, roomId: msg.roomId };
room.addSocket(ws);
await room.revertAutoPickOnReconnect(userId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`index.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module/name 'Bun'"(@types/bun 미설치)만 남음). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `autoPickManualUserIds` 필드, `setAutoPick()`의 분기
확장, `revertAutoPickOnReconnect()` 메서드, `handleSubmitPick()`의 `autoPickManualUserIds.delete()`
를 위 Before 블록으로 되돌리고, `server/src/index.ts`의 `revertAutoPickOnReconnect()` 호출 1줄
제거. client 미러 없음(서버 전용 로직). 이것으로 `docs/plan/draft-autopick-plan.md`의 트리거 0~4
전체가 구현 완료됨.

---

## 2026-07-27 — 픽 타임아웃 연속 미스 시 오토픽 전환(트리거 1) + 어드민 세션 설정 노출

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 1. 유저가 `autoPickAfterMisses`회(어드민이
세션 설정에서 지정, 기본 1회) 연속으로 픽 타이머를 전부 소진하면 그 유저를 오토픽 모드로 전환.
"연속"이 기준이므로 본인이 직접 픽을 제출하면(=돌아왔다는 증거) 미스 카운트를 리셋하고, 이미
오토픽 모드였다면 그것도 함께 해제한다 — 안 그러면 본인 의사와 무관하게 다음 차례부터 계속
자동픽되는 어색한 상태가 남는다.

이 임계치는 다른 드래프트 설정(라운드 수/픽 제한시간 등)과 동일하게 `leagues` 테이블 컬럼으로
추가하고 `CreateLeagueModal`/`LeagueSettingsView`에 입력 필드를 노출했다 — `LeagueSettingsView`의
"스케줄" 섹션은 `!isInProgress`로 잠기므로(드래프트 시작 후 라운드 수를 못 바꾸는 것과 동일하게)
이 값도 드래프트가 실제로 시작되기 전까지만 조정 가능하다. `DraftConfig`는 방 준비 시점
(`buildDraftSetup()`)에 한 번 굳어지므로 드래프트 도중 실시간 반영은 불가능 — 애초에 기존 라운드
수/픽 제한시간과 동일한 제약이라 새로 생긴 한계는 아니다.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftConfig.autoPickAfterMisses: number` 추가
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickAfterMisses: number` 추가
- `server/src/DraftRoom.ts` (server) — `pickMissCounts: Map<string, number>` 상태 신설(메모리 전용),
  `onPickTimeout()`에서 미스 카운트 증가 후 임계치 도달 시 `autoPickUserIds.add()`, `handleSubmitPick()`
  에서 본인 제출 시 `pickMissCounts.delete()` + `autoPickUserIds.delete()`
- `server/src/startDraft.ts` (server) — `DEFAULT_AUTO_PICK_AFTER_MISSES = 1`, `buildDraftSetup()`에서
  `league.draft_auto_pick_after_misses ?? DEFAULT_AUTO_PICK_AFTER_MISSES` 읽어 `draftConfig`에 포함
- `hooks/useLeagueDraft.ts` (client) — `assembleState()`에 `autoPickAfterMisses` 반영
- `services/multi/roomQueries.ts` (client) — `LeagueRow.draft_auto_pick_after_misses: number` 추가
- `services/multi/leagueService.ts` (client) — `CreateLeagueParams.options`/`UpdateLeagueSettingsParams`에
  `draftAutoPickAfterMisses` 추가, `createLeague()`/`updateLeagueSettings()` payload 매핑 라인 추가
- `components/multi/CreateLeagueModal.tsx` (client) — "오토픽 전환 기준(연속 미스)" 입력 필드(1–5) 추가
- `views/multi/league/LeagueSettingsView.tsx` (client) — 동일 입력 필드 추가(스케줄 섹션,
  `!isInProgress`일 때만 노출)
- **DB 마이그레이션** (Supabase 프로젝트 `buummihpewiaeltywdff`, `add_draft_auto_pick_after_misses`) —
  `ALTER TABLE public.leagues ADD COLUMN draft_auto_pick_after_misses integer NOT NULL DEFAULT 1;`
  (이 컬럼 없이는 `createLeague`/`updateLeagueSettings`가 Postgres 에러로 실패함)

**Before**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
const result = await this.persistPick(userId, playerId);
```

**After**:
```ts
// onPickTimeout()
console.log(`[DraftRoom:${this.roomId}] pick timeout for user=${entry.userId}`);
const misses = (this.pickMissCounts.get(entry.userId) ?? 0) + 1;
this.pickMissCounts.set(entry.userId, misses);
if (misses >= this.config.autoPickAfterMisses) {
    this.autoPickUserIds.add(entry.userId);
}
const bestId = getBestAvailableId(...);
...

// handleSubmitPick()
this.pickMissCounts.delete(userId);
this.autoPickUserIds.delete(userId);
const result = await this.persistPick(userId, playerId);
```

**검증**: `cd server && tsc --noEmit -p .` — `DraftRoom.ts`/`startDraft.ts` 관련 신규 에러 없음(기존부터
있던 "Cannot find module 'bun'"/`startDraft.ts`의 discriminated union `.error` 이슈만 남음, 둘 다
이번 변경 이전부터 존재). 클라이언트 6개 파일(`multiDraft.ts`/`useLeagueDraft.ts`/`roomQueries.ts`/
`leagueService.ts`/`CreateLeagueModal.tsx`/`LeagueSettingsView.tsx`)도 synthesize한 tsc 옵션으로
신규 에러 없음 확인(남은 에러는 `sim_settings`/`normalization` 관련 완전히 무관한 기존 이슈).
`information_schema.columns`로 마이그레이션 전 `leagues` 테이블에 해당 컬럼이 없었음을 먼저 확인 후
`ADD COLUMN`으로 추가, 적용 결과 `success:true`. 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 9개 코드 파일에서 이번 diff를 되돌리고, DB는
`ALTER TABLE public.leagues DROP COLUMN draft_auto_pick_after_misses;`로 컬럼 제거(선택사항 — 컬럼이
남아있어도 코드가 안 읽으면 무해함). `protocol.ts` ↔ `types/multiDraft.ts`는 미러 쌍이므로 함께 되돌릴 것.

---

## 2026-07-27 — 스케줄 화면 PTS/REB/AST 리더 localStorage 캐싱

**배경**: `MultiScheduleView.tsx`가 시즌 하위 탭을 오가며 재마운트될 때마다, 그리고 마운트된 동안
5초마다 방 안의 `game_pbp` 전체 row(`home_box`/`away_box` JSON 포함)를 다시 조회해서 PTS/REB/AST
리더를 계산하고 있었음. `game_pbp` row는 시뮬레이션 완료 시 1회 upsert된 뒤 갱신되지 않으므로
(관리자 수동 재시뮬레이션은 극히 예외적이라 이번 범위에서 제외, 사용자 확인 완료), 이미 끝난 경기는
매번 다시 조회할 필요가 없음. 상세 설계는
[schedule-leaders-cache-plan.md](../plan/schedule-leaders-cache-plan.md) 참조.

조사 중 발견: 토너먼트 게임 ID(`T_R{round}_M{matchIndex}`, `server/src/shared/tournamentBracket.ts`)가
완전히 위치 기반이라 랜덤 요소가 없음. `resetTournament()`가 같은 `room.id`를 재사용해 드래프트부터
다시 시작하므로, 리셋 후 새 토너먼트의 동일 라운드/매치가 예전과 **같은 game_id**를 다시 갖게 됨 —
캐시를 영구 보존하면 리셋 전 경기의 리더가 리셋 후 동명 경기에 잘못 붙는 실제 버그가 생겨, 사용자가
직접 요청하지 않았지만 리셋 시점 캐시 무효화를 계획에 포함시킴(승인받음).

**변경 파일**:
- `services/multi/gameLeadersCache.ts` (신규, client 전용) — `loadGameLeadersCache`/
  `mergeGameLeadersCache`/`clearGameLeadersCache`, `nbagm:gameLeaders:{roomId}` 키로 localStorage 영속화.
  `GameLeaders`/`StatLeader` 타입도 여기로 이전(기존 `MultiScheduleView.tsx` 로컬 정의 제거)
- `views/multi/season/MultiScheduleView.tsx` — `gameLeadersMap` 초기값을 캐시로 채움, 폴링 로직을
  "캐시에 없는 `played` 게임만" 델타 조회하도록 변경, 캐시에 빠진 게 없으면 네트워크 요청 자체를 스킵
- `views/multi/league/LeagueSettingsView.tsx` — `handleReset()`에서 `resetTournament()` 성공 직후
  `clearGameLeadersCache(room.id)` 호출 추가

**Before** (`MultiScheduleView.tsx`, `gameLeadersMap` 로딩):
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>({});
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id);
        if (cancelled || !data) return;
        const map: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            map[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(map);
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id]);
```

**After**:
```ts
const [gameLeadersMap, setGameLeadersMap] = useState<Record<string, GameLeaders>>(
    () => room?.id ? loadGameLeadersCache(room.id) : {},
);
useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const loadLeaders = async () => {
        const cached = loadGameLeadersCache(room.id);
        const missingIds = schedule.filter(g => g.played && !(g.id in cached)).map(g => g.id);

        if (missingIds.length === 0) {
            setGameLeadersMap(cached);
            return;
        }

        const { data } = await supabase
            .from('game_pbp')
            .select('game_id, home_box, away_box')
            .eq('room_id', room.id)
            .in('game_id', missingIds);
        if (cancelled || !data) return;
        const updates: Record<string, GameLeaders> = {};
        for (const row of data as { ... }[]) {
            updates[row.game_id] = computeGameLeaders(row.home_box, row.away_box);
        }
        setGameLeadersMap(mergeGameLeadersCache(room.id, updates));
    };
    loadLeaders();
    const timer = setInterval(loadLeaders, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
}, [room?.id, schedule]);
```

**검증**: `tsc --noEmit`(client) 신규 에러 없음, 브레이스/괄호 균형 확인(3개 파일 전부 OK),
`npm run build` 성공. 클라이언트 UI/로직 전용 변경이라 서버 배포 불필요. 실제 브라우저에서 Network
탭으로 캐시 히트/델타 조회 동작 확인은 미실시.

**롤백 방법**: `services/multi/gameLeadersCache.ts` 삭제, `MultiScheduleView.tsx`를 위 Before
블록 및 로컬 `interface StatLeader`/`GameLeaders` 정의로 되돌리기, `LeagueSettingsView.tsx`의
`handleReset()`에서 `clearGameLeadersCache(room.id)` 호출 및 관련 import 제거.

---

## 2026-07-27 — 드래프트 시작 시 미입장 유저 자동 오토픽 전환

**배경**: `docs/plan/draft-autopick-plan.md`의 트리거 2. 오토픽 개념/셀프·어드민 토글(직전 항목)에
이어서, 드래프트가 `waiting → active`로 전환되는 순간 방에 WS로 연결돼 있지 않은 유저를 즉시
오토픽 모드로 전환하는 로직 추가. `room.sockets`(서버가 이미 들고 있는 WS 연결 목록)로 판정하며,
Supabase Presence 등 별도 인프라 없이 서버 자체 정보만으로 처리.

이 판정은 "깨끗한 종료"(탭 닫기, 페이지 이동, 브라우저 종료 → WS close 이벤트 발생)는 정확하지만
"네트워크가 갑자기 끊긴 경우"는 서버가 close 이벤트를 못 받아 일시적으로 놓칠 수 있다는 한계가
있음(감내 가능한 트레이드오프로 채택 — 어차피 그 유저 차례에 응답이 없으면 기존 `onPickTimeout()`이
오토픽으로 전환시킴). 다만 이 논의 중 `broadcast()`가 죽은 소켓의 `send()` 실패를 그냥 무시만 하고
`sockets`에서 제거하지 않는 실제 허점을 발견해 함께 고침 — 이 청소를 안 하면 죽은 소켓이 계속
"접속 중"으로 남아 `getConnectedUserIds()` 판정이 부정확해짐.

**변경 파일**:
- `server/src/DraftRoom.ts` (server, client 미러 없음 — 순수 서버 내부 로직)
  - `activate()` 최상단에 미입장 유저 감지 루프 추가 (`pickOrder`를 유저당 1회만 순회, AI 슬롯 제외)
  - `getConnectedUserIds()` private 헬퍼 신설 — `[...this.sockets].map(ws => ws.data.userId)`
  - `broadcast()` — `ws.send()` 실패 시 `this.sockets.delete(ws)` 추가(기존엔 catch에서 그냥 무시)

**Before**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { /* 소켓 이미 닫힘 */ }
    }
}
```

**After**:
```ts
async activate(): Promise<boolean> {
    if (this.status !== 'waiting') return false;

    const connected = this.getConnectedUserIds();
    const seen = new Set<string>();
    for (const entry of this.config.pickOrder) {
        if (entry.isAi || seen.has(entry.userId)) continue;
        seen.add(entry.userId);
        if (!connected.has(entry.userId)) this.autoPickUserIds.add(entry.userId);
    }

    this.status               = 'active';
    this.currentPickIndex     = 0;
    this.currentPickStartedAt = new Date().toISOString();
    ...
}

private broadcast(payload: string): void {
    for (const ws of this.sockets) {
        try { ws.send(payload); } catch { this.sockets.delete(ws); }
    }
}
```

**검증**: `server/tsconfig.json`(직전 세션에서 신규 추가됨) 기준 `cd server && tsc --noEmit -p .`
실행 — `DraftRoom.ts`는 기존부터 있던 "Cannot find module 'bun'"(@types/bun 미설치, 무관) 1건 외
신규 에러 없음. 나머지 에러도 전부 이번 변경과 무관한 기존 파일들(`scheduler.ts`/`tournamentArchiver.ts`/
`simRunner.ts`/`startDraft.ts` 등 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: `server/src/DraftRoom.ts`에서 `activate()`의 미입장 감지 루프, `getConnectedUserIds()`
메서드, `broadcast()`의 `this.sockets.delete(ws)` 3곳을 위 Before 블록으로 되돌리면 됨. client 미러
없음(서버 전용 로직).

---

## 2026-07-27 — 경기 시뮬레이션 Worker Thread 분리

**배경**: 멀티플레이어 서버가 큰 토너먼트 진행 중 경기 시뮬레이션(경기당 4.5~10초 동기 연산,
`runFullGameSimulation()`)에 메인 스레드 이벤트 루프가 막혀 HTTP/WS 연결이 끊기는 문제 발생
("진행중인 경기 보기"가 "경기 데이터를 준비하는 중입니다..."만 뜨고 안 들어가짐). 1차로
스케줄러 루프에 `setImmediate` 양보를 넣었으나(경기 "사이"만 양보) 경기 "한 개" 자체의 블로킹은
그대로 남아 효과 없었음. VM 스펙업은 Bun/Node가 JS를 단일 스레드로 실행하므로 근본 해결이 안 돼
기각. 상세 설계·리스크 분석은 [worker-thread-sim-plan.md](../plan/worker-thread-sim-plan.md) 참조.

**변경 파일**:
- `server/src/workers/simWorker.ts` (신규) — 워커 스레드 엔트리, `runSimulation()`을 그대로 import해 실행
- `server/src/workers/simWorkerPool.ts` (신규) — 풀 매니저. 스폰 직후 ping/pong 헬스체크,
  워커 크래시 시 `game_sim_claims` 안전망 정리, 5분 간격 stale 클레임 청소, 60초 태스크 타임아웃
- `server/src/workers/protocol.ts` (신규) — 메인↔워커 메시지 타입 (discriminated union)
- `server/src/scheduler.ts` — `runSimGames()`의 순차 `for...await` 루프를
  `Promise.allSettled(tasks.map(... simWorkerPool.runSimulationInWorker ...))`로 교체, 지난번 넣은
  `setImmediate` 양보 제거(더 이상 불필요), stale 클레임 청소 인터벌 추가
- `server/src/index.ts` — 어드민 수동 시뮬 엔드포인트(`handleSimOverride`)를 `simWorkerPool` 경유로
  교체, 부팅 시퀀스에 `await simWorkerPool.init()` 추가
- `server/tsconfig.json` (신규) — server 디렉토리에 tsconfig가 없어서 이번 세션 내내
  `tsc --noEmit -p .`가 "Cannot find a tsconfig.json" 에러로 즉시 실패하고 있었는데, grep이
  거기서 매칭되는 줄이 없어 "에러 없음"으로 잘못 보였음(허위 통과). 이 파일 추가로 실제 타입체크가
  동작하게 됨 — 향후 서버 변경 검증에도 계속 사용

**Before** (`server/src/scheduler.ts`, `runSimGames()` 말미):
```ts
for (const { roomId, gameId } of tasks) {
    const result = await runSimulation(roomId, gameId);
    if (!result.ok && !result.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${result.error}`);
    }
    await new Promise(resolve => setImmediate(resolve));
}
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**After**:
```ts
const results = await Promise.allSettled(
    tasks.map(({ roomId, gameId }) => simWorkerPool.runSimulationInWorker(roomId, gameId)),
);
results.forEach((r, i) => {
    const { roomId, gameId } = tasks[i];
    if (r.status === 'rejected') {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.reason}`);
    } else if (!r.value.ok && !r.value.skipped) {
        console.error(`[scheduler:sim] room=${roomId} game=${gameId} error=${r.value.error}`);
    }
});
await advanceSimDates(rooms as RoomRow[], leagueMap, now.slice(0, 10));
```

**검증**:
- `server/tsconfig.json` 신규 작성 후 `tsc --noEmit -p .` 실행 — 신규/변경 파일에서 새로 생긴 에러
  없음(남은 건 프로젝트 전역에 이미 있던 "Cannot find name 'Bun'"(@types/bun 미설치) 및 무관한
  기존 파일들의 사전 존재 이슈뿐, 확인 완료)
- 브레이스/괄호 균형 확인(5개 파일 전부 OK)
- **로컬 스모크 테스트 미실시** — 이 개발 환경에 `bun` 바이너리가 설치되어 있지 않아 워커 스폰을
  로컬에서 직접 띄워볼 수 없었음. Fly.io 배포 이미지에는 Bun이 있으므로, 배포 직후 로그로
  `[simPool] worker#N ready`(ping/pong 헬스체크 통과) 확인을 사실상의 최초 검증으로 사용
- 실측 확인: 배포 전 Supabase에 직접 쿼리해서 `game_sim_claims` 839건 중 823건이 10분 이상 경과,
  그중 124건은 대응하는 `game_pbp` row가 없는 진짜 고아 레코드임을 확인 — 이번에 추가한 stale
  클레임 청소가 이론이 아니라 실제로 존재하는 문제를 다룬다는 근거

**롤백 방법**: `server/src/workers/` 디렉토리 3개 파일 삭제, `scheduler.ts`/`index.ts`를 위 Before
블록 및 원래 `import { runSimulation } from './simRunner'`로 되돌리고 `simWorkerPool.init()` 호출
제거. `server/tsconfig.json`은 삭제해도 런타임에 영향 없음(타입체크 전용).

---

## 2026-07-27 — 멀티 드래프트 오토픽 모드(신규 개념) + 셀프/어드민 토글

**배경**: 멀티플레이어 드래프트에서 (1) 픽 타임아웃 (2) 드래프트 시작 시 미입장 (3) 어드민 강제 지정 —
3가지 트리거로 유저를 "오토픽 모드"로 전환하는 기능을 계획(`docs/plan/draft-autopick-plan.md`)했고,
그중 가장 먼저 "오토픽 모드" 개념 자체 + 셀프 토글(본인 팀 on/off) + 어드민 토글(모든 유저 on/off)을
구현. 타임아웃/미입장 자동 트리거는 이번 범위에서 제외(추후 별도 작업).

기존 `onPickTimeout()`은 타임아웃된 픽 1개만 대납하고 다음 픽부터는 다시 정상 타이머로 돌아가는
"1회성" 동작이었는데, 이번에 추가한 오토픽은 **해제 전까지 계속 유지되는 영속 모드**라는 점이 다름.

영속화 방식은 메모리 전용으로 결정(사용자 확인 완료) — `submit_draft_pick_v2` RPC가 매 픽마다
`rooms.draft_cursor`를 통째로 덮어써서(`status`/`currentPickIndex`/`currentPickStartedAt`만 포함)
`autoPickUserIds`를 DB에 안정적으로 지속시킬 수 없다는 걸 실제 RPC 정의(`pg_get_functiondef`)로 확인함.
서버 재시작 시 오토픽 상태가 리셋되지만, 해당 유저가 여전히 자리에 없다면 다음 타임아웃에서 다시
감지되어 자동 복구된다(1회성 지연만 재발생) — 감내 가능한 트레이드오프로 채택.

**변경 파일**:
- `server/src/protocol.ts` (server) — `DraftCursor.autoPickUserIds: string[]` 추가, `ToggleAutoPickMsg` 신규,
  `AdminMsg.action`에 `'toggle-autopick'` 추가(+ params에 `targetUserId`/`enabled`)
- `types/multiDraft.ts` (client 미러) — `MultiDraftState.autoPickUserIds: string[]` 추가
- `server/src/DraftRoom.ts` (server) — `autoPickUserIds: Set<string>` 상태(메모리 전용, `load()`에서
  의도적으로 미복원), `setAutoPick(userId, enabled)` 메서드, `scheduleNext()`/`onAiPick()` 조건을
  `entry.isAi` → `entry.isAi || autoPickUserIds.has(entry.userId)`로 확장, `handleAdmin()`에
  `'toggle-autopick'` 케이스 추가, `persistPick()` 호출 시 `isAi` 인자를 `true` 하드코딩 대신
  `entry.isAi ?? false`로 전달(오토픽 대납된 실제 사람 유저가 `draft_picks.is_ai=true`로 잘못
  기록되는 것 방지)
- `server/src/index.ts` (server) — `toggleAutoPick` 클라 메시지 처리(본인 userId 대상, 어드민 권한 불필요)
- `hooks/useLeagueDraft.ts` (client) — `assembleState`/`cursorFields`에 `autoPickUserIds` 반영,
  `sendAdmin` params 타입 확장, `toggleAutoPick(enabled)` 함수 추가·반환
- `components/draft/DraftAdminPanel.tsx` (client) — "유저별 오토픽" 섹션 추가(참가자별 on/off 버튼)
- `views/multi/league/MultiDraftView.tsx` (client) — 상단 바에 "내 오토픽" 셀프 토글 버튼 추가

**Before**:
```ts
// DraftRoom.ts scheduleNext()
if (entry.isAi) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry?.isAi) return;
...
const result = await this.persistPick(entry.userId, bestId, true);
```

**After**:
```ts
// scheduleNext()
if (entry.isAi || this.autoPickUserIds.has(entry.userId)) {
    this.aiTimer = setTimeout(() => this.onAiPick(), delay);
} else {
    this.pickTimer = setTimeout(() => this.onPickTimeout(), this.config.pickDurationSec * 1000);
}

// onAiPick()
if (!entry || (!entry.isAi && !this.autoPickUserIds.has(entry.userId))) return;
...
const result = await this.persistPick(entry.userId, bestId, entry.isAi ?? false);
```

**검증**: `tsc --noEmit`(project tsconfig 부재로 synthesize한 임시 옵션) 실행 결과, 수정한 7개 파일
(`DraftRoom.ts`/`protocol.ts`/`index.ts`/`multiDraft.ts`/`useLeagueDraft.ts`/`DraftAdminPanel.tsx`/
`MultiDraftView.tsx`) 관련 신규 에러 없음 확인(남은 에러는 전부 이번 변경과 무관한 기존 파일들 —
Bun 타입 누락, 다른 서비스 파일들의 사전 존재 이슈). 실제 배포/브라우저 테스트는 미실시.

**롤백 방법**: 위 8개 파일에서 이번 커밋의 diff만 되돌리면 됨. `protocol.ts` ↔ `types/multiDraft.ts`는
미러 쌍이므로 반드시 함께 되돌릴 것 — 하나만 되돌리면 `DraftCursor`/`MultiDraftState` 필드 불일치로
클라이언트가 `autoPickUserIds`를 못 읽거나 서버가 보내지 않는 필드를 기대하는 불일치가 생김.

---

## 2026-07-27 — playStyle 액터 선택 로직을 역할(슈터/패서) 기반으로 통합

**배경**: `ballDominance`(볼 소유 빈도)와 `playStyle`(슛 vs 패스 성향) 텐던시의 상호작용을 논의하다가,
"플레이스타일이 패스퍼스트면 어시스터로 뽑힐 확률이 높아지고 야투를 덜 던지게" 만들고 싶다는 요청.
기존 로직은 `pickWeightedActor()` 하나가 슈터 픽/패서 픽 양쪽에 재사용되는데, playStyle 보정이
"플레이타입 종류"로만 4개(Iso/PostUp/PnR_Handler/Handoff) 한정 분기돼 있어서 역할(슈터냐 패서냐)
구분이 없었고, 나머지 8개 플레이타입은 아예 영향이 없었음. 이번 변경으로 전체 12개 플레이타입에
역할 기반으로 통일 적용.

**변경 파일**:
- `services/game/engine/pbp/playTypes.ts` (client)
- `server/src/shared/engine/pbp/playTypes.ts` (server 미러)
- `services/game/config/constants.ts` (client)
- `server/src/shared/game/config/constants.ts` (server 미러)

**Before** (`playTypes.ts`, `resolvePlayAction` 내부):
```ts
const pickWeightedActor = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: pass-first(-1) vs shoot-first(+1)
        // Iso, PostUp → shoot-first boost: +30% at playStyle=+1.0
        // PnR_Handler, Handoff → pass-first boost: +20% at playStyle=-1.0
        // CatchShoot, Cut → neutral (receiver role)
        const ps = p.tendencies?.playStyle ?? 0;
        if (playType === 'Iso' || playType === 'PostUp') {
            weight *= (1 + ps * 0.3);
        } else if (playType === 'PnR_Handler' || playType === 'Handoff') {
            weight *= (1 - ps * 0.2);
        }
        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId
    );
};

// PnR_Handler 케이스
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId);

// Handoff 케이스
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId);
```

**After**:
```ts
const pickWeightedActor = (
    criteria: (p: LivePlayer) => number,
    excludeId?: string,
    role: 'shooter' | 'passer' = 'shooter'
) => {
    ...
    const candidates = pool.map(p => {
        ...
        let weight = Math.max(1, rawScore) * usageMultiplier;
        weight *= (p.tendencies?.ballDominance ?? 1.0);

        // [SaveTendency] playStyle: role 기반 통합 배율 (슈터 vs 패서)
        const ps = p.tendencies?.playStyle ?? 0;
        const psCfg = SIM_CONFIG.PLAY_SELECTION;
        weight *= role === 'shooter' ? (1 + ps * psCfg.PLAYSTYLE_SHOOTER_K) : (1 - ps * psCfg.PLAYSTYLE_PASSER_K);

        return { p, weight: Math.max(0.01, weight) };
    });
    ...
};

const pickPasser = (criteria: (p: LivePlayer) => number, excludeId?: string) => {
    return pickWeightedActor(
        p => criteria(p) * Math.pow(p.attr.passVision * p.attr.passIq / 2500, 1.5),
        excludeId,
        'passer'
    );
};

// PnR_Handler 케이스 — 스크리너를 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.handler);
const screener = pickWeightedActor(p => p.archetypes.screener + p.archetypes.roller * 0.5, actor.playerId, 'passer');

// Handoff 케이스 — 빅맨을 명시적으로 passer role 태깅
const actor = pickWeightedActor(p => p.archetypes.spacer + p.archetypes.driver * 0.5);
const big = pickWeightedActor(p => p.archetypes.screener, actor.playerId, 'passer');
```

`pickPasser`가 내부적으로 `'passer'` role을 넘기도록 바뀌어서, 나머지 9개 플레이타입(Iso, PnR_Roll,
PnR_Pop, PostUp, CatchShoot, Cut, Transition, OffBallScreen, DriveKick)의 패서 픽은 호출부 수정 없이
자동으로 새 로직을 탄다. `pickWeightedActor`의 다른 모든 슈터(actor) 픽은 `role` 인자를 생략해
기본값 `'shooter'`를 그대로 사용 — 호출부 무수정.

**Before** (`constants.ts`, `SIM_CONFIG.ZONE_SELECTION` 다음):
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
FOUL_TROUBLE: {
```

**After**:
```ts
ZONE_SELECTION: {
    ZONE_PREF_THRESHOLD: 0.15,
    SLIDER_SENSITIVITY: 0.5,
},
// Play Selection: pickWeightedActor의 역할(슈터/패서) 기반 playStyle 배율
PLAY_SELECTION: {
    PLAYSTYLE_SHOOTER_K: 0.25,  // 슈터 픽: weight *= (1 + ps*K)
    PLAYSTYLE_PASSER_K: 0.25,   // 패서 픽: weight *= (1 - ps*K)
},
FOUL_TROUBLE: {
```

**검증**:
- Node 재현 스크립트: ps=-1 → shooter×0.75/passer×1.25, ps=0 → 1.0/1.0, ps=+1 → shooter×1.25/passer×0.75 (의도대로 확인)
- `tsc --noEmit` client/server 모두 신규 에러 없음
- `npm run build` 성공 (2195 모듈)
- `fly deploy -a basketballgm-app-server` 배포 성공, HTTP 200, 로그 정상(WebSocket 서버 기동 확인). 배포 중 "not listening on 0.0.0.0:3001" 경고는 부팅 타이밍 노이즈로 확인된 기존 알려진 패턴(직후 로그에 정상 리스닝 확인됨)

**롤백 방법**: 위 Before 블록 4곳(client playTypes.ts, server playTypes.ts, client constants.ts, server constants.ts)을 그대로 되돌리고 `fly deploy -a basketballgm-app-server` 재배포.

**관련 논의**: 이전 커밋에서 어시스트 기록 확률에 걸려있던 playStyle 보정(`statsMappers.ts`의 `assistMod`)은
"패스는 패스, 어시스트는 어시스트"라는 판단 하에 별도로 제거함 (이 항목보다 먼저 진행된 변경, 별도 기록 없음 — 필요시 git log 참조).
