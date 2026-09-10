/**
 * postThreePointContest.ts — 3점 챌린지 실제 슈팅 시뮬레이션.
 *
 * 배경: postAllStarVoteNews.ts의 computeAndPostThreePointContestNews()는 참가자 8명을
 * "발표"만 했지, 실제로 몇 개를 넣었는지는 시뮬레이션한 적이 없었다. 이 파일은 그 마지막
 * 단계 — 실제 대회 실행일(getAllStarKeyDates().allStarThreePointContestDate)에 도달하면
 * 참가자 전원의 슈팅을 실제로 시뮬레이션해 결과를 기록한다.
 *
 * 포맷(사용자 확정): 8명이 5랙(코너-윙-탑-윙-코너) × 5구(마지막 볼 2점, 나머지 1점) = 25구를
 * 쏘는 1라운드, 상위 3명이 결선에서 다시 25구를 쏘아 최종 우승자를 가리는 실제 NBA 방식.
 *
 * ⚠️ 참가자 명단은 재계산하지 않는다 — league_events의 allstar_three_point_contest(참가자
 * 발표 서신, 이 시즌에서 유일한 행)에 이미 저장된 8명을 그대로 읽어쓴다. 재계산하면
 * 아키타입 가중치 랜덤 추첨이 다시 돌아 발표된 명단과 실제 슈팅한 명단이 달라질 위험이
 * 있다(postAllStarGame.ts의 "로스터 재계산 금지" 원칙과 동일).
 *
 * 적중률 공식(사용자 확정 — "PBP엔진에서 사용하는 3점 성공 공식을 사용"): 실제 게임에서
 * 3점 슛 성공 여부를 굴리는 server/src/shared/engine/pbp/flowEngine.ts의
 * calculateHitRate()를 그대로 재사용한다(새 확률식을 만들지 않음 — 이미 캘리브레이션된
 * 공식이라 새로 만들면 밸런스가 안 맞을 위험). 수비수가 없는 상황을 표현하기 위해
 * isBotchedSwitch(=defRating 완전 무시하는 지름길, 선수 능력치 차이를 거의 반영 못 함)
 * 대신, "능력치는 0/중립으로 채운 가상 수비수"를 넘겨 defMod=0·매치업갭=0·수비강도보정=0이
 * 되도록 만든 뒤 calculateHitRate()의 일반 경로(THREE_OFF_CURVE 비선형 커브 포함)를 그대로
 * 통과시킨다 — 이래야 실제 게임처럼 슈터 능력치 차이가 제대로 반영된다(isBotchedSwitch
 * 지름길은 선수 간 차이를 ±3%p 수준으로 뭉개버려 컨테스트에 부적합, 계획 논의 시 확인).
 *
 * 랙 순서(왼쪽 코너→왼쪽 윙→탑→오른쪽 윙→오른쪽 코너)는 실제 3점 챌린지 랙 배치와 동일하게
 * ShotZones 3분류(zone_c3=코너/zone_atb3_l·r=45도 윙/zone_atb3_c=탑)를 그대로 사용.
 *
 * 서버 전용 — 클라이언트 미러 없음(DB 조회+시뮬 오케스트레이션이라 클라 대응물이 없음).
 * 호출부: scheduler.ts의 runThreePointContestResult() — allStarThreePointContestDate에만 호출.
 */
import { supabase } from './supabaseAdmin';
import { calculateHitRate } from './shared/engine/pbp/flowEngine.ts';
import { mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';

// 실제 3점 챌린지 랙 배치(왼쪽 코너 → 왼쪽 45도 윙 → 탑 → 오른쪽 45도 윙 → 오른쪽 코너).
// calculateHitRate()의 threeSubZone 판별 규칙(zone_c3*=코너, zone_atb3_c=탑, 나머지
// zone_atb3*=윙)과 그대로 맞물린다.
const RACK_ZONES = ['zone_c3_l', 'zone_atb3_l', 'zone_atb3_c', 'zone_atb3_r', 'zone_c3_r'] as const;
const BALLS_PER_RACK = 5;
const FINALIST_COUNT = 3;

// defMod=0(perDef/intDef=0, defConsist=70→편차 없음)·매치업갭=0(슈터 본인과 동일한 speed/
// agility)이 되도록 슈터별로 만드는 "존재하지 않는 수비수" — calculateHitRate()의 수비
// 관련 항을 전부 무력화하면서도(공격 능력치 항인 THREE_OFF_CURVE는 그대로 살아있음) 함수
// 자체는 정상 경로(isBotchedSwitch=false)로 통과시키기 위함.
function buildNoDefender(shooter: any): any {
    return {
        playerId: '__3pt_contest_no_defender__',
        attr: { perDef: 0, intDef: 0, defConsist: 70, speed: shooter.attr.speed, agility: shooter.attr.agility },
        currentCondition: 100,
        tendencies: undefined,
    };
}

const NEUTRAL_DEF_TEAM: any = { tactics: { stopperId: undefined, sliders: { defIntensity: 5.5 } } };
const NEUTRAL_OFF_SLIDERS: any = { pace: 5 };

function buildContestShooter(p: any): any {
    return {
        playerId: p.id,
        attr: {
            threeCorner: p.threeCorner, three45: p.three45, threeTop: p.threeTop,
            threeVal: (p.threeCorner + p.three45 + p.threeTop) / 3,
            shotIq: p.shotIq, offConsist: p.offConsist,
            speed: p.speed, agility: p.agility,
        },
        currentCondition: 100,
    };
}

function contestShotRate(shooter: any, threeSubZone: string): number {
    const defender = buildNoDefender(shooter);
    const result = calculateHitRate(
        shooter, defender, NEUTRAL_DEF_TEAM,
        'Iso', '3PT', NEUTRAL_OFF_SLIDERS, 0,
        undefined, false, false, undefined, false, 0,
        undefined, 'none', undefined, 'CatchShoot', threeSubZone,
    );
    return result.rate;
}

// [2026-09-09] 샷차트 그래픽(선수 선택 시 랙별 5구 각각의 성공/실패를 농구공 아이콘으로
// 표시) 요청으로 랙 합계뿐 아니라 5구 각각의 성공 여부(shots)도 함께 기록한다.
function simulateRack(shooter: any, zone: string): { score: number; shots: boolean[] } {
    const shots: boolean[] = [];
    let score = 0;
    for (let i = 0; i < BALLS_PER_RACK; i++) {
        const isMoneyball = i === BALLS_PER_RACK - 1;
        const made = Math.random() < contestShotRate(shooter, zone);
        shots.push(made);
        if (made) score += isMoneyball ? 2 : 1;
    }
    return { score, shots };
}

interface RoundEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    rackScores: number[]; rackShots: boolean[][]; total: number;
}

function simulateRound(shooter: any, meta: { playerId: string; playerName: string; teamSlug: string; position: string }): RoundEntry {
    const racks = RACK_ZONES.map(zone => simulateRack(shooter, zone));
    return {
        ...meta,
        rackScores: racks.map(r => r.score),
        rackShots: racks.map(r => r.shots),
        total: racks.reduce((a, r) => a + r.score, 0),
    };
}

// 동점 처리 — total 내림차순, 그래도 같으면 마지막 랙(가장 최근 랙) 점수, 그래도 같으면
// playerId 오름차순으로 완전히 결정론적으로 정렬(실전 슛오프 서브시스템은 이번 범위 밖).
function rankEntries(entries: RoundEntry[]): RoundEntry[] {
    return [...entries].sort((a, b) =>
        b.total - a.total ||
        b.rackScores[b.rackScores.length - 1] - a.rackScores[a.rackScores.length - 1] ||
        a.playerId.localeCompare(b.playerId),
    );
}

export async function computeAndRunThreePointContest(
    roomId: string, leagueId: string, virtualDate: string,
): Promise<void> {
    const { data: room } = await supabase
        .from('rooms').select('season, season_number').eq('id', roomId).maybeSingle();
    if (!room) {
        console.error(`[3ptContest] room=${roomId} 조회 실패`);
        return;
    }
    const seasonNumber = (room as any).season_number ?? 1;
    const seasonLabel = (room as any).season ?? '';

    // ── 멱등성 — 이 시즌에 이미 결과가 있으면 스킵 ──────────────────────────────────────
    const { count: alreadyDone } = await supabase
        .from('league_events')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('type', 'allstar_three_point_contest_result').eq('season_number', seasonNumber);
    if ((alreadyDone ?? 0) > 0) {
        console.log(`[3ptContest] room=${roomId} 이미 결과 있음 — 스킵`);
        return;
    }

    // ── 저장된 참가자 명단 조회 (재계산 금지) ────────────────────────────────────────────
    const { data: announceRow, error: announceErr } = await supabase
        .from('league_events')
        .select('payload')
        .eq('room_id', roomId).eq('type', 'allstar_three_point_contest')
        .order('sim_date', { ascending: false })
        .limit(1)
        .maybeSingle();
    const participants = (announceRow?.payload as any)?.participants as
        { playerId: string; playerName: string; teamSlug: string; position: string }[] | undefined;
    if (announceErr || !participants?.length) {
        console.error(`[3ptContest] room=${roomId} 참가자 명단 없음 — 스킵:`, announceErr?.message);
        return;
    }

    const { data: rawPlayers } = await supabase
        .from('meta_players')
        .select('id, name, position, base_attributes, tendencies')
        .in('id', participants.map(p => p.playerId));
    const playerMap = new Map<string, any>();
    for (const raw of rawPlayers ?? []) {
        playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, false));
    }

    const shooters = participants
        .map(p => {
            const raw = playerMap.get(p.playerId);
            if (!raw) return null;
            return { meta: p, shooter: buildContestShooter(raw) };
        })
        .filter((x): x is { meta: typeof participants[number]; shooter: any } => !!x);
    if (shooters.length === 0) {
        console.error(`[3ptContest] room=${roomId} 참가자 능력치 조회 실패 — 스킵`);
        return;
    }

    const round1 = rankEntries(shooters.map(({ meta, shooter }) => simulateRound(shooter, meta)));
    const finalists = shooters.filter(s => round1.slice(0, FINALIST_COUNT).some(e => e.playerId === s.meta.playerId));
    const round2 = rankEntries(finalists.map(({ meta, shooter }) => simulateRound(shooter, meta)));
    const winnerId = round2[0]?.playerId;

    console.log(`[3ptContest] room=${roomId} 우승: ${round2[0]?.playerName} (${round2[0]?.total}점)`);

    const { error: insertErr } = await supabase.from('league_events').insert({
        room_id: roomId, league_id: leagueId, season_number: seasonNumber,
        sim_date: virtualDate, type: 'allstar_three_point_contest_result',
        player_ids: round1.map(e => e.playerId),
        payload: {
            v: 1,
            headline: `${seasonLabel}시즌 3점 챌린지 결과가 발표됐습니다`,
            seasonLabel, round1,
            finalistIds: round1.slice(0, FINALIST_COUNT).map(e => e.playerId),
            round2, winnerId,
        },
    });
    if (insertErr) console.error(`[3ptContest] room=${roomId} 결과 insert 실패:`, insertErr.message);
}
