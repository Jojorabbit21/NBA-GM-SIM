// cardBackground.ts — 카드 컬렉션 배경 설정(meta_player_card_collections.bg_*)을 실제 CSS
// background 값으로 바꾸는 공용 헬퍼. 어드민 컬렉션 화면의 미리보기와, 나중에 개인 팩 드래프트
// 카드(components/draft/PersonalDraftCard.tsx)가 같은 함수를 써야 두 화면이 어긋나지 않는다.
//
// bg_type
//   'team'     : 컬렉션 배경 없음 — 카드 원팀 컬러 그라디언트(호출부가 teamGradient로 전달) 그대로.
//   'solid'    : 단색.
//   'gradient' : 2색 선형 그라디언트 + 각도.
//   'image'    : 업로드한 이미지(WebP 등)를 cover로. 이미지가 없으면 team으로 폴백.

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

/**
 * @param settings     컬렉션 배경 설정(없으면 team 취급).
 * @param teamGradient 카드 원팀 [primary, secondary] — 'team'일 때와 폴백에 사용.
 * @returns CSS `background` 속성 문자열.
 */
export function buildCardBackground(
    settings: Partial<CardBackgroundSettings> | null | undefined,
    teamGradient: readonly [string, string],
): string {
    const teamCss = `linear-gradient(165deg, ${teamGradient[0]} 0%, ${teamGradient[1]} 100%)`;
    if (!settings) return teamCss;
    switch (settings.bg_type) {
        case 'solid':
            return settings.bg_color || teamCss;
        case 'gradient': {
            const from = settings.bg_gradient_from || teamGradient[0];
            const to = settings.bg_gradient_to || teamGradient[1];
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
