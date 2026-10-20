/**
 * aiGmProfile.ts — 멀티플레이어 AI 단장 프로필 (G1).
 * 서버 미러: server/src/shared/multi/aiGmProfile.ts. 변환식/기본값을 바꿀 땐 반드시 양쪽 다 같이
 * 고칠 것(client/server 미러 쌍 — dev-log.md 기록 대상). 외부 import가 없어 두 파일은 이 헤더만 다르다.
 *
 * meta_gms의 실제 단장(팀 슬러그로 고정 배정)을 멀티에서 의미 있는 수치 4개로 변환한다.
 * 싱글의 성격 유형/슬라이더는 재료로만 쓰고 판단에 직접 쓰지 않는다 — 멀티에는 성장·픽 거래가
 * 없어 youthBias/pickWillingness는 읽지 않는다. 설계: docs/plan/multi-ai-gm-profile-plan.md
 */

export type AiGmPersonalityType =
    | 'balanced' | 'winNow' | 'rebuilder' | 'starHunter'
    | 'valueTrader' | 'defenseFocused' | 'youthMovement';

/** meta_gms 행. president_*·gm_title은 2026-10-20 추가 컬럼이라 이전 DB에선 없을 수 있다. */
export interface MetaGmRow {
    team_id: string;
    gm_name?: string | null;
    gm_title?: string | null;
    /** 농구 운영 최고 책임자(사장·부사장). 겸직이면 title이 '사장 겸 단장' 등이고 gm_name은 null */
    president_name?: string | null;
    president_title?: string | null;
    personality_type: string;
    sliders: Record<string, unknown> | string | null;
}

export interface FrontOfficeMember {
    name: string;
    title: string;
}

export interface AiGmTraits {
    /** 0.1~0.9 — 이번 시즌 성적 집착. 포기 시점·전력 변화 비중·기조 라벨 */
    competitiveness: number;
    /** −0.03~+0.03 — 수락 기준선 보정(+면 깐깐) */
    strictness: number;
    /** 0.2~0.8 — 0 쪽 뎁스형, 1 쪽 스타 집중형 (양 끝은 매핑에서 배제) */
    rosterStyle: number;
    /** 0.1~0.9 — 부상 선수 할인 완화 정도 (부상 켜진 리그에서만 사용) */
    injuryRiskTolerance: number;
}

export type RosterStyleLabel = 'depth' | 'balanced' | 'star';

export const ROSTER_STYLE_LABEL_KO: Record<RosterStyleLabel, string> = {
    depth: '뎁스 중심',
    balanced: '균형',
    star: '스타 중심',
};

/** 성향(traits)은 사람이 아니라 프런트 단위로 하나 — 사장·단장은 표시용 */
export interface AiGmProfile {
    teamSlug: string;
    president: FrontOfficeMember | null;
    gm: FrontOfficeMember | null;
    /** 대표 이름: 사장 우선, 없으면 단장 (싱글 gmProfiler.populateGMData와 같은 규칙) */
    displayName: string;
    personalityType: AiGmPersonalityType;
    traits: AiGmTraits;
    rosterStyleLabel: RosterStyleLabel;
}

const PERSONALITY_BASE: Record<AiGmPersonalityType, { competitiveness: number; strictness: number }> = {
    winNow:         { competitiveness: 0.75, strictness: -0.01 },
    starHunter:     { competitiveness: 0.70, strictness: -0.01 },
    balanced:       { competitiveness: 0.50, strictness: 0 },
    defenseFocused: { competitiveness: 0.50, strictness: 0 },
    valueTrader:    { competitiveness: 0.45, strictness: 0.02 },
    rebuilder:      { competitiveness: 0.30, strictness: 0.01 },
    youthMovement:  { competitiveness: 0.25, strictness: 0.01 },
};

const DEFAULT_SLIDER = 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function parseSliders(raw: MetaGmRow['sliders']): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return raw;
}

function sliderOf(sliders: Record<string, unknown>, key: string): number {
    const v = Number(sliders[key]);
    return Number.isFinite(v) ? clamp(v, 1, 10) : DEFAULT_SLIDER;
}

function toPersonality(raw: string): AiGmPersonalityType {
    return raw in PERSONALITY_BASE ? (raw as AiGmPersonalityType) : 'balanced';
}

export function rosterStyleLabelOf(rosterStyle: number): RosterStyleLabel {
    if (rosterStyle < 0.4) return 'depth';
    if (rosterStyle > 0.6) return 'star';
    return 'balanced';
}

export function buildAiGmProfile(row: MetaGmRow): AiGmProfile {
    const personalityType = toPersonality(row.personality_type);
    const base = PERSONALITY_BASE[personalityType];
    const sliders = parseSliders(row.sliders);
    const aggressiveness = sliderOf(sliders, 'aggressiveness');
    const starWillingness = sliderOf(sliders, 'starWillingness');
    const riskTolerance = sliderOf(sliders, 'riskTolerance');

    const traits: AiGmTraits = {
        competitiveness: clamp(base.competitiveness + 0.05 * (aggressiveness - 5), 0.1, 0.9),
        strictness: clamp(base.strictness - 0.004 * (aggressiveness - 5), -0.03, 0.03),
        rosterStyle: clamp(0.2 + 0.6 * (starWillingness - 1) / 9, 0.2, 0.8),
        injuryRiskTolerance: clamp(riskTolerance / 10, 0.1, 0.9),
    };

    const president = row.president_name
        ? { name: row.president_name, title: row.president_title || '사장' }
        : null;
    // Before the 2026-10-20 columns existed, gm_name held whichever executive the row was built around.
    const gm = row.gm_name
        ? { name: row.gm_name, title: row.gm_title || '단장' }
        : null;

    return {
        teamSlug: row.team_id.toLowerCase(),
        president,
        gm,
        displayName: president?.name ?? gm?.name ?? '',
        personalityType,
        traits,
        rosterStyleLabel: rosterStyleLabelOf(traits.rosterStyle),
    };
}

/** "사장 팻 라일리 · 단장 앤디 엘리스버그" — 없는 쪽은 생략, 겸직은 직함 하나로 */
export function formatFrontOffice(profile: Pick<AiGmProfile, 'president' | 'gm'>): string {
    return [profile.president, profile.gm]
        .filter((m): m is FrontOfficeMember => !!m)
        .map(m => `${m.title} ${m.name}`)
        .join(' · ');
}

/** team_slug(소문자) → 프로필. AI 팀의 단장은 항상 이 맵에서 슬러그로 찾는다(P1 — 저장하지 않음). */
export function buildAiGmProfileMap(rows: MetaGmRow[]): Map<string, AiGmProfile> {
    const map = new Map<string, AiGmProfile>();
    for (const row of rows) {
        const profile = buildAiGmProfile(row);
        map.set(profile.teamSlug, profile);
    }
    return map;
}
