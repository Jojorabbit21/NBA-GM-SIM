/**
 * expectedPoints.ts — AI 감독: 플레이타입별 기대 득점 추정 (C1 확장, 서버 전용)
 *
 * "오늘 이 상대에게 어떤 플레이를 하면 몇 점이 나오나"를 **엔진 자신의 함수로** 잰다 — 별도 평가 공식이나
 * 외부 기준(리그·보정표) 없이, 엔진이 실제 경기에서 쓰는 두 함수를 그대로 호출한다:
 *   1) resolvePlayAction() — 이 플레이를 하면 누가, 어느 구역에서, 어떤 슛을 쏘는가(엔진 액터 선정 그대로)
 *   2) calculateHitRate()  — 그 선수가 엔진 기본 매치업 수비수(같은 슬롯 포지션) 상대로 성공할 확률
 * 기대 득점 = 성공 확률 × 점수(3PT 3, 그 외 2). 플레이당 SAMPLES번 뽑아 평균.
 *
 * 범위(1차): **슛 기준** 기대 득점만. 공격권 처리 단계의 보정(블록·파울/자유투·턴오버·공격 리바운드·헬프 수비·
 * 존 수비·모멘텀 등, possessionHandler)은 넣지 않는다 — 플레이끼리 순서를 정하는 용도.
 *
 * 결정론: 두 엔진 함수는 Math.random을 쓴다(액터·구역 선택, 슛 노이즈, 집중력 저하). 같은 로스터·상대면 항상
 * 같은 결과가 나오도록, 추정하는 동안만 Math.random을 시드 고정 난수로 바꿔 끼우고 finally에서 되돌린다.
 * 전부 동기 코드라 그 사이 다른 경기 시뮬이 끼어들 수 없다. 노이즈를 끄는 게 아니라 고정된 순서로 굴리므로
 * 집중력 저하 같은 확률도 기대값에 그대로 들어간다. 엔진 코드는 수정하지 않는다.
 *
 * 입력은 두 팀의 TeamState(initializer.initTeamState로 생성 — 경기 직전 simRunner가 가진 로스터·전술로 만듦).
 * 공격 슬라이더는 중립값(DEFAULT_SLIDERS)으로 고정 — 현재 저장된 전술이 추정을 오염시키지 않게(전술을 정하려고
 * 재는 값이므로). 순수 함수, DB 접근 없음.
 */
import type { PlayType } from '../../../types.ts';
import type { LivePlayer, TeamState } from '../../../engine/pbp/pbpTypes.ts';
import { resolvePlayAction } from '../../../engine/pbp/playTypes.ts';
import { calculateHitRate } from '../../../engine/pbp/flowEngine.ts';
import { DEFAULT_SLIDERS } from '../../config/tacticPresets.ts';

/** 추정 대상 플레이타입(엔진 resolvePlayAction이 처리하는 12종 전부) */
export const EV_PLAY_TYPES: PlayType[] = [
    'Iso', 'PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'PostUp', 'CatchShoot',
    'Cut', 'Handoff', 'OffBallScreen', 'DriveKick', 'Transition', 'Putback',
];

/** 플레이당 표본 수 — 60이면 12종 × 60 = 720회(실측은 dev-log 참고). 늘리면 안정, 줄이면 가벼움 */
const SAMPLES = 60;
/** 기본 시드 — 같은 입력이면 같은 결과 */
const DEFAULT_SEED = 20261021;

export interface PlayTypeEV {
    playType: PlayType;
    /** 슛 1회당 기대 득점 */
    ev: number;
    /** 평균 성공 확률 0~1 */
    hitRate: number;
    /** 3점 시도 비율 0~1 */
    threeShare: number;
    /** 이 플레이를 했을 때 슛을 쏜 선수 비중(상위 3명) */
    shooters: { id: string; name: string; share: number; ev: number }[];
}

export interface ExpectedPointsResult {
    teamId: string;
    opponentId: string;
    samples: number;
    byPlayType: Record<PlayType, PlayTypeEV>;
    /** ev 내림차순 */
    ranking: PlayType[];
}

/** mulberry32 — 32비트 시드 고정 난수 [0, 1) */
function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** fn 실행 동안만 Math.random을 시드 고정 난수로 교체(동기 전용) */
function withSeededRandom<T>(seed: number, fn: () => T): T {
    const original = Math.random;
    Math.random = seededRng(seed);
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

/** 엔진 기본 매치업(possessionHandler identifyDefender의 기본 규칙): 같은 슬롯 포지션, 없으면 첫 번째 */
function matchupDefender(actor: LivePlayer, def: TeamState): LivePlayer | undefined {
    return def.onCourt.find(p => p.position === actor.position) ?? def.onCourt[0];
}

/**
 * 공격팀 off가 수비팀 def를 상대로 플레이타입별 슛 기대 득점을 추정한다.
 * off/def의 onCourt(현재 선발 5명) 기준. seed를 바꾸면 다른 표본 순서.
 */
export function estimatePlayTypeEV(off: TeamState, def: TeamState, opts: { samples?: number; seed?: number } = {}): ExpectedPointsResult {
    const samples = opts.samples ?? SAMPLES;
    const sliders = { ...DEFAULT_SLIDERS };

    const byPlayType = withSeededRandom(opts.seed ?? DEFAULT_SEED, () => {
        const out = {} as Record<PlayType, PlayTypeEV>;
        for (const pt of EV_PLAY_TYPES) {
            let evSum = 0, rateSum = 0, threes = 0, n = 0;
            const perShooter = new Map<string, { name: string; count: number; evSum: number }>();
            for (let i = 0; i < samples; i++) {
                const ctx = resolvePlayAction(off, pt, sliders);
                const defender = matchupDefender(ctx.actor, def);
                if (!defender) continue;
                const { rate } = calculateHitRate(
                    ctx.actor, defender, def, pt, ctx.preferredZone, sliders, ctx.bonusHitRate,
                    off.acePlayerId, false, false, undefined, false, 0, undefined, 'none', undefined, ctx.shotType,
                );
                const pts = ctx.preferredZone === '3PT' ? 3 : 2;
                const ev = rate * pts;
                evSum += ev; rateSum += rate; n++;
                if (pts === 3) threes++;
                const s = perShooter.get(ctx.actor.playerId) ?? { name: ctx.actor.playerName, count: 0, evSum: 0 };
                s.count++; s.evSum += ev;
                perShooter.set(ctx.actor.playerId, s);
            }
            const shooters = [...perShooter.entries()]
                .map(([id, s]) => ({ id, name: s.name, share: s.count / Math.max(1, n), ev: s.evSum / s.count }))
                .sort((a, b) => (b.share - a.share) || a.id.localeCompare(b.id))
                .slice(0, 3);
            out[pt] = {
                playType: pt,
                ev: n ? evSum / n : 0,
                hitRate: n ? rateSum / n : 0,
                threeShare: n ? threes / n : 0,
                shooters,
            };
        }
        return out;
    });

    const ranking = [...EV_PLAY_TYPES].sort((a, b) => (byPlayType[b].ev - byPlayType[a].ev) || a.localeCompare(b));
    return { teamId: off.id, opponentId: def.id, samples, byPlayType, ranking };
}
