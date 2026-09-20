// cardBackground.ts — 카드 컬렉션 배경 설정(meta_player_card_collections.bg_*)을 실제 CSS
// background 값으로 바꾸는 공용 헬퍼. 어드민 컬렉션 화면의 미리보기와, 나중에 개인 팩 드래프트
// 카드(components/draft/PersonalDraftCard.tsx)가 같은 함수를 써야 두 화면이 어긋나지 않는다.
//
// bg_type
//   'team'     : 컬렉션 배경 없음 — 카드 원팀 컬러 그라디언트(호출부가 teamGradient로 전달) 그대로.
//   'solid'    : 단색.
//   'gradient' : 2색 선형 그라디언트 + 각도.
//   'image'    : 업로드한 이미지(WebP 등)를 cover로. 이미지가 없으면 team으로 폴백.
//
// [2026-09-20] 팀별 컬러 오버라이드(meta_card_team_colors): 카드 시스템에 한해 팀 그라디언트를
// 어드민이 DB로 덮어쓸 수 있다. resolveCardTeamGradient()가 오버라이드 → TEAM_COLORS 순으로 푼다.
// data/teamData.ts는 import가 없는 순수 데이터 모듈이라 여기서 가져와도 순환이 생기지 않는다.
import { TEAM_COLORS } from '../data/teamData';
import { getCardExtraTeam } from '../data/cardTeams';

export interface CardBackgroundSettings {
    bg_type: 'team' | 'solid' | 'gradient' | 'image';
    bg_color: string | null;
    bg_gradient_from: string | null;
    bg_gradient_to: string | null;
    bg_gradient_angle: number;
    bg_image_url: string | null;
}

export const DEFAULT_CARD_BACKGROUND: CardBackgroundSettings = {
    bg_type: 'team',
    bg_color: '#1e293b',
    bg_gradient_from: '#1D428A',
    bg_gradient_to: '#0f172a',
    bg_gradient_angle: 165,
    bg_image_url: null,
};

/** 카드 전용 팀 컬러 한 팀분(meta_card_team_colors 한 행과 같은 모양). */
export interface CardTeamColor {
    gradient_from: string;
    gradient_to: string;
    gradient_angle: number;
}

/** 팀 그라디언트 기본 각도 — 오버라이드가 없을 때 TEAM_COLORS 폴백에 쓴다. */
export const CARD_TEAM_GRADIENT_ANGLE = 165;

/** 팀이 없는 카드(FA/은퇴 레전드 등)의 중립 그라디언트. */
export const NEUTRAL_CARD_TEAM_COLOR: CardTeamColor = {
    gradient_from: '#334155',
    gradient_to: '#0f172a',
    gradient_angle: CARD_TEAM_GRADIENT_ANGLE,
};

/** TEAM_COLORS(코드 상수) 기준 기본 팀 그라디언트. 모르는 팀이면 null. */
export function getDefaultCardTeamColor(teamId: string | null | undefined): CardTeamColor | null {
    if (!teamId) return null;
    const c = TEAM_COLORS[teamId];
    if (c) return { gradient_from: c.primary, gradient_to: c.secondary, gradient_angle: CARD_TEAM_GRADIENT_ANGLE };
    // [2026-09-20] 카드 전용 확장 팀(시애틀 에메랄즈 등) — data/cardTeams.ts
    const extra = getCardExtraTeam(teamId);
    if (extra) return { gradient_from: extra.primary, gradient_to: extra.secondary, gradient_angle: CARD_TEAM_GRADIENT_ANGLE };
    return null;
}

/**
 * 카드가 실제로 쓸 팀 그라디언트: DB 오버라이드 → TEAM_COLORS 기본값 → 중립색 순.
 * @param overrides useCardTeamColors()/fetchCardTeamColors()가 준 맵(없으면 기본값만 사용).
 */
export function resolveCardTeamGradient(
    teamId: string | null | undefined,
    overrides?: Record<string, CardTeamColor> | null,
): CardTeamColor {
    if (teamId && overrides?.[teamId]) return overrides[teamId];
    return getDefaultCardTeamColor(teamId) ?? NEUTRAL_CARD_TEAM_COLOR;
}

function teamGradientCss(team: CardTeamColor | readonly [string, string]): string {
    if (Array.isArray(team)) {
        return `linear-gradient(${CARD_TEAM_GRADIENT_ANGLE}deg, ${team[0]} 0%, ${team[1]} 100%)`;
    }
    const t = team as CardTeamColor;
    const angle = Number.isFinite(t.gradient_angle) ? t.gradient_angle : CARD_TEAM_GRADIENT_ANGLE;
    return `linear-gradient(${angle}deg, ${t.gradient_from} 0%, ${t.gradient_to} 100%)`;
}

/**
 * @param settings     컬렉션 배경 설정(없으면 team 취급).
 * @param team         카드 원팀 그라디언트 — resolveCardTeamGradient() 결과, 또는 옛 호출부 호환용
 *                     [primary, secondary] 튜플(각도 165 고정). 'team'일 때와 폴백에 사용.
 * @param cardImageUrl [2026-09-20] 카드별 커스텀 배경 이미지(meta_player_cards.bg_image_url).
 *                     있으면 컬렉션 배경보다 우선하고, 그 아래에 컬렉션/팀 배경을 폴백으로 깐다.
 * @returns CSS `background` 속성 문자열.
 */
export function buildCardBackground(
    settings: Partial<CardBackgroundSettings> | null | undefined,
    team: CardTeamColor | readonly [string, string],
    cardImageUrl?: string | null,
): string {
    const base = buildCollectionBackground(settings, team);
    if (cardImageUrl) return `url("${cardImageUrl}") center / cover no-repeat, ${base}`;
    return base;
}

/** 카드 이미지를 제외한 컬렉션 배경 → 팀 그라디언트 해석. */
function buildCollectionBackground(
    settings: Partial<CardBackgroundSettings> | null | undefined,
    team: CardTeamColor | readonly [string, string],
): string {
    const teamCss = teamGradientCss(team);
    const teamFrom = Array.isArray(team) ? team[0] : (team as CardTeamColor).gradient_from;
    const teamTo = Array.isArray(team) ? team[1] : (team as CardTeamColor).gradient_to;
    if (!settings) return teamCss;
    switch (settings.bg_type) {
        case 'solid':
            return settings.bg_color || teamCss;
        case 'gradient': {
            const from = settings.bg_gradient_from || teamFrom;
            const to = settings.bg_gradient_to || teamTo;
            const angle = Number.isFinite(settings.bg_gradient_angle) ? settings.bg_gradient_angle : 165;
            return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
        }
        case 'image':
            // cover + center. 이미지 로딩 전/실패 시 뒤에 팀 그라디언트가 비치도록 두 겹.
            return settings.bg_image_url
                ? `url("${settings.bg_image_url}") center / cover no-repeat, ${teamCss}`
                : teamCss;
        case 'team':
        default:
            return teamCss;
    }
}
