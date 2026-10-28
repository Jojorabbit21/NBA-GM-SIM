import type { Player } from '../types';
import { calculateScreenerPhysique } from '../services/game/engine/pbp/archetypeSystem';
import { SIM_CONFIG } from '../services/game/config/constants';

// 선수 퍼센타일 카드 — 지표 정의 + 리그 백분위 계산(순수 함수). 화면은 components/player/PercentileCard.tsx.
// 입력 행은 useLeaderboardData().sortedData(선수 + 사전 계산된 stats: ts%, usg%, zone_*, dfg% ...)를 그대로 쓴다
// (공식 재구현 금지 — 리더보드와 같은 값이어야 카드와 리더보드 순위가 어긋나지 않는다).

/** useLeaderboardData 가 내려주는 선수 행 — stats 는 사전 계산된 값이 섞인 느슨한 객체. */
export type PercentileRow = Player & { stats: any };

export type PercentileSectionId = 'value' | 'scoring' | 'shooting' | 'playmaking' | 'rebounding' | 'defense' | 'screening';

export interface PercentileMetric {
    key: string;
    label: string;
    section: PercentileSectionId;
    /** 원 단위 값(분수·경기당 등). null = 계산 불가. */
    value: (row: PercentileRow) => number | null;
    /** 표본 크기(시도 수 등) — 있으면 리그 중앙값의 20% 미만 선수는 이 지표 모집단에서 제외. */
    attempts?: (row: PercentileRow) => number;
    /** true = 낮을수록 좋은 지표(TOV%, DFG%) — 퍼센타일을 뒤집어 "막대가 길수록 좋다"로 통일. */
    inverse?: boolean;
    format: (v: number) => string;
}

export const PERCENTILE_SECTION_LABELS: Record<PercentileSectionId, string> = {
    value: '가치',
    scoring: '득점',
    shooting: '슈팅',
    playmaking: '플레이메이킹',
    rebounding: '리바운드',
    defense: '수비',
    screening: '스크린',
};

const SECTION_ORDER: PercentileSectionId[] = ['value', 'scoring', 'shooting', 'playmaking', 'rebounding', 'defense', 'screening'];

/** 퍼센타일 모집단 자격 — 총 출전시간이 (리그 최다 출전 경기 수 × 이 값)분 이상(경기당 평균 8분 상당). */
export const QUALIFY_MIN_MPG = 8;
/** attempts 가 있는 지표의 모집단 최소 시도 수 = 자격자 중앙값 × 이 비율. */
const MIN_ATTEMPT_SHARE = 0.2;

const pct1 = (v: number) => `${(v * 100).toFixed(1)}`;
const num1 = (v: number) => v.toFixed(1);
const dec3 = (v: number) => v.toFixed(3).replace(/^(-?)0\./, '$1.');   // .123 (WS/48)

/** 시즌 누적 값(ows/dws)을 48분당으로 환산 — 출전시간 0 이거나 값이 아직 없으면 null. */
const per48 = (row: PercentileRow, key: 'ows' | 'dws'): number | null => {
    const v = row.stats[key];
    const mp = row.stats.mp || 0;
    return typeof v === 'number' && mp > 0 ? (v / mp) * 48 : null;
};

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const perGame = (row: PercentileRow, total: number): number | null => {
    const g = row.stats.g || 0;
    return g > 0 ? total / g : null;
};
const zoneMade = (s: any, keys: string[]) => keys.reduce((sum, k) => sum + (s[`${k}_m`] || 0), 0);
const zoneAtt = (s: any, keys: string[]) => keys.reduce((sum, k) => sum + (s[`${k}_a`] || 0), 0);
const MID_ZONES = ['zone_mid_l', 'zone_mid_c', 'zone_mid_r'];

/**
 * 스크린 능력 점수 — SIM_CONFIG.SCREEN 가중치로 엔진 resolveScreen 의 power 와 같은 식
 * (체격 점수 × PHYSIQUE_WEIGHT + offBallMovement × TIMING_WEIGHT, 피로 미반영).
 * 엔진을 조정하면 이 값도 같이 따라가도록 새 상수를 만들지 않는다.
 */
export function calculateScreenRating(p: Pick<Player, 'strength' | 'height' | 'weight'> & { offBallMovement?: number }): number {
    const cfg = SIM_CONFIG.SCREEN;
    const physique = calculateScreenerPhysique({ strength: p.strength, height: p.height, weight: p.weight });
    return physique * cfg.PHYSIQUE_WEIGHT + (p.offBallMovement ?? 70) * cfg.TIMING_WEIGHT;
}

// Value 의 TIM/XIM/BPM/VORP·SCRN% 는 해당 지표 구현 전까지 목록에 없다 — 섹션이 비면 카드에서 숨긴다
// (docs/plan/advanced-metrics-plan.md §7~8).
export const PERCENTILE_METRICS: PercentileMetric[] = [
    // 가치 — PER·WS/48·OWS/48·DWS/48 만 구현(나머지 TIM/XIM/BPM/VORP 은 advanced-metrics-plan §2~3). 값은 useLeaderboardData 가 stats.per / stats.ws48 로 채운다.
    { key: 'per', label: 'PER', section: 'value', value: r => r.stats['per'], format: num1 },
    { key: 'ws48', label: 'WS/48', section: 'value', value: r => r.stats['ws48'], format: dec3 },
    { key: 'ows48', label: 'OWS/48', section: 'value', value: r => per48(r, 'ows'), format: dec3 },
    { key: 'dws48', label: 'DWS/48', section: 'value', value: r => per48(r, 'dws'), format: dec3 },
    // 득점
    { key: 'ts%', label: 'TS%', section: 'scoring', value: r => r.stats['ts%'], attempts: r => r.stats.fga + 0.44 * r.stats.fta, format: pct1 },
    { key: 'efg%', label: 'eFG%', section: 'scoring', value: r => r.stats['efg%'], attempts: r => r.stats.fga, format: pct1 },
    { key: 'usg%', label: 'USG%', section: 'scoring', value: r => r.stats['usg%'], format: pct1 },
    { key: 'ftr', label: 'FTr', section: 'scoring', value: r => r.stats['ftr'], attempts: r => r.stats.fga, format: pct1 },
    // 슈팅
    { key: '3p%', label: '3P%', section: 'shooting', value: r => ratio(r.stats.p3m, r.stats.p3a), attempts: r => r.stats.p3a, format: pct1 },
    { key: '3par', label: '3PAr', section: 'shooting', value: r => r.stats['3par'], attempts: r => r.stats.fga, format: pct1 },
    { key: 'ft%', label: 'FT%', section: 'shooting', value: r => ratio(r.stats.ftm, r.stats.fta), attempts: r => r.stats.fta, format: pct1 },
    { key: 'rim%', label: '림 FG%', section: 'shooting', value: r => ratio(zoneMade(r.stats, ['zone_rim']), zoneAtt(r.stats, ['zone_rim'])), attempts: r => zoneAtt(r.stats, ['zone_rim']), format: pct1 },
    { key: 'mid%', label: '미드레인지 FG%', section: 'shooting', value: r => ratio(zoneMade(r.stats, MID_ZONES), zoneAtt(r.stats, MID_ZONES)), attempts: r => zoneAtt(r.stats, MID_ZONES), format: pct1 },
    // 플레이메이킹
    { key: 'ast%', label: 'AST%', section: 'playmaking', value: r => r.stats['ast%'], format: pct1 },
    { key: 'tov%', label: 'TOV%', section: 'playmaking', value: r => r.stats['tov%'], attempts: r => r.stats.fga + 0.44 * r.stats.fta + r.stats.tov, inverse: true, format: pct1 },
    // 리바운드
    { key: 'orb%', label: 'ORB%', section: 'rebounding', value: r => r.stats['orb%'], format: pct1 },
    { key: 'drb%', label: 'DRB%', section: 'rebounding', value: r => r.stats['drb%'], format: pct1 },
    // 수비
    { key: 'stl%', label: 'STL%', section: 'defense', value: r => r.stats['stl%'], format: pct1 },
    { key: 'blk%', label: 'BLK%', section: 'defense', value: r => r.stats['blk%'], format: pct1 },
    { key: 'dfg%', label: 'DFG%', section: 'defense', value: r => ((r.stats.contestedAttempted || 0) > 0 ? r.stats['dfg%'] : null), attempts: r => r.stats.contestedAttempted || 0, inverse: true, format: pct1 },
    { key: 'cont', label: 'CONT', section: 'defense', value: r => r.stats['cont'], format: num1 },
    { key: 'tovf', label: 'TOVF', section: 'defense', value: r => perGame(r, r.stats.tovForced || 0), format: num1 },
    // 스크린 — SCRN% 는 판정된 스크린 중 clean 비율(엔진이 2026-10-28 이후 경기부터 scrClean/scrPartial/scrFail 을 기록, advanced-metrics-plan §8).
    // 판정이 없으면 "-", 판정 횟수가 적으면(자격자 중앙값의 20% 미만) NQ. SCRN 은 능력치 합성값(엔진 resolveScreen 의 입력).
    { key: 'scrn%', label: 'SCRN%', section: 'screening', value: r => ((r.stats['scrj'] || 0) > 0 ? r.stats['scrn%'] : null), attempts: r => r.stats['scrj'] || 0, format: pct1 },
    { key: 'scrn', label: 'SCRN', section: 'screening', value: r => calculateScreenRating(r), format: v => v.toFixed(0) },
];

export interface PercentileEntry {
    metric: PercentileMetric;
    /** 원 단위 값 — null 이면 "—" 표기. */
    value: number | null;
    /** 1~100(높을수록 좋음, inverse 지표는 이미 뒤집힘). 값이 없거나 모집단이 비면 null. */
    percentile: number | null;
    /** false = 자격 미달(NQ) — 선수 총 출전시간 부족 또는 이 지표의 시도 수 부족. 백분위는 그대로 계산해 두고 표시만 NQ 로 바꾼다. */
    qualified: boolean;
}

export interface PercentileSection {
    id: PercentileSectionId;
    label: string;
    entries: PercentileEntry[];
}

export interface PercentileCardData {
    sections: PercentileSection[];
    /** 모집단(자격자) 수. */
    qualifiedCount: number;
    /** 자격 기준 총 출전시간(분). */
    minMinutes: number;
    /** 대상 선수가 자격 기준을 충족하는지 — 아니면 카드에 "참고용" 안내. */
    subjectQualified: boolean;
    /** 대상 선수가 시즌 출전 기록(행)을 갖고 있는지. */
    hasSubject: boolean;
}

const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** 대상 선수의 값을 모집단(대상 제외)과 비교한 백분위(1~100). 동점은 절반만 인정. */
function percentileOf(x: number, pool: number[], inverse: boolean): number | null {
    if (pool.length === 0) return null;
    let worse = 0;
    let equal = 0;
    for (const v of pool) {
        if (v === x) equal++;
        else if (inverse ? v > x : v < x) worse++;
    }
    const raw = ((worse + 0.5 * equal) / pool.length) * 100;
    return Math.min(100, Math.max(1, Math.round(raw)));
}

export function buildPercentileCard(rows: PercentileRow[], playerId: string): PercentileCardData {
    const maxG = rows.reduce((m, r) => Math.max(m, r.stats.g || 0), 0);
    const minMinutes = QUALIFY_MIN_MPG * maxG;
    const qualified = rows.filter(r => (r.stats.mp || 0) >= minMinutes && (r.stats.g || 0) > 0);
    const subject = rows.find(r => r.id === playerId);
    const subjectQualified = !!subject && (subject.stats.mp || 0) >= minMinutes;

    const sections: PercentileSection[] = [];
    for (const sectionId of SECTION_ORDER) {
        const metrics = PERCENTILE_METRICS.filter(m => m.section === sectionId);
        if (metrics.length === 0) continue;

        const entries: PercentileEntry[] = metrics.map(metric => {
            const value = subject ? metric.value(subject) : null;
            if (!subject || value === null || !Number.isFinite(value)) return { metric, value: null, percentile: null, qualified: false };

            // 시도 수가 자격자 중앙값의 20% 미만이면 이 지표 모집단에서 빠지고, 대상 선수는 NQ 로 표시한다(백분위는 그대로 계산).
            let minAttempts = 0;
            let subjectAttempts = Infinity;
            if (metric.attempts) {
                minAttempts = MIN_ATTEMPT_SHARE * median(qualified.map(r => metric.attempts!(r)));
                subjectAttempts = metric.attempts(subject);
                if (subjectAttempts <= 0) return { metric, value, percentile: null, qualified: false };
            }

            const pool: number[] = [];
            for (const r of qualified) {
                if (r.id === playerId) continue;
                if (metric.attempts && metric.attempts(r) < minAttempts) continue;
                const v = metric.value(r);
                if (v !== null && Number.isFinite(v)) pool.push(v);
            }
            return {
                metric, value,
                percentile: percentileOf(value, pool, !!metric.inverse),
                qualified: subjectQualified && subjectAttempts >= minAttempts,
            };
        });
        sections.push({ id: sectionId, label: PERCENTILE_SECTION_LABELS[sectionId], entries });
    }

    return { sections, qualifiedCount: qualified.length, minMinutes, subjectQualified, hasSubject: !!subject };
}
