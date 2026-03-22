/**
 * DashboardHeader 배경 그라디언트 스타일 모음
 * primary / secondary / tertiary 팀 색상을 받아 CSS background 문자열 반환
 */

export type GradientStyleId =
    | 'mesh_dual'
    | 'mesh_triple'
    | 'spotlight'
    | 'diagonal'
    | 'noise_glow';

export interface GradientStyleMeta {
    id: GradientStyleId;
    label: string;
    description: string;
}

export const GRADIENT_STYLES: GradientStyleMeta[] = [
    {
        id: 'mesh_dual',
        label: '듀얼 메쉬',
        description: '두 색이 안쪽에서 자연스럽게 섞이는 메쉬 효과',
    },
    {
        id: 'mesh_triple',
        label: '트리플 메쉬',
        description: '세 색이 코너에서 번지는 고급스러운 blob 효과',
    },
    {
        id: 'spotlight',
        label: '스포트라이트',
        description: '왼쪽에서 빛이 퍼지는 스포츠 방송 스타일',
    },
    {
        id: 'diagonal',
        label: '대각선 페이드',
        description: '좌상단→우하단 대각 그라디언트, 깔끔한 느낌',
    },
    {
        id: 'noise_glow',
        label: '엣지 글로우',
        description: '하단 엣지에서 올라오는 은은한 팀 컬러 글로우',
    },
];

interface GradientColors {
    primary: string;
    secondary: string;
    tertiary?: string;
}

/** hex → rgba 문자열 (alpha: 0~1) */
function hexAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    if (h.length < 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

const BASE = '#0a1628'; // 헤더 베이스 다크

/** 스타일별 background CSS 생성 */
export function buildHeaderGradient(
    styleId: GradientStyleId,
    colors: GradientColors,
): string {
    const { primary, secondary, tertiary } = colors;
    const third = tertiary ?? secondary;

    switch (styleId) {
        // ── 1. 듀얼 메쉬: primary(좌상) + secondary(우하) ──────────────────
        case 'mesh_dual':
            return [
                `radial-gradient(ellipse 60% 120% at 0% 50%, ${hexAlpha(primary, 0.65)} 0%, transparent 60%)`,
                `radial-gradient(ellipse 55% 110% at 100% 50%, ${hexAlpha(secondary, 0.45)} 0%, transparent 55%)`,
                BASE,
            ].join(', ');

        // ── 2. 트리플 메쉬: 세 꼭짓점에서 blob ────────────────────────────
        case 'mesh_triple':
            return [
                `radial-gradient(ellipse 50% 130% at 0% 0%, ${hexAlpha(primary, 0.60)} 0%, transparent 55%)`,
                `radial-gradient(ellipse 50% 130% at 100% 100%, ${hexAlpha(secondary, 0.50)} 0%, transparent 55%)`,
                `radial-gradient(ellipse 45% 80% at 50% 100%, ${hexAlpha(third, 0.35)} 0%, transparent 50%)`,
                BASE,
            ].join(', ');

        // ── 3. 스포트라이트: 좌측에서 강하게 퍼짐 ───────────────────────
        case 'spotlight':
            return [
                `radial-gradient(ellipse 35% 100% at 0% 50%, ${hexAlpha(primary, 0.85)} 0%, ${hexAlpha(primary, 0.30)} 45%, transparent 70%)`,
                `radial-gradient(ellipse 25% 60% at 80% 50%, ${hexAlpha(secondary, 0.25)} 0%, transparent 50%)`,
                BASE,
            ].join(', ');

        // ── 4. 대각선 페이드: 좌상 → 우하 ────────────────────────────────
        case 'diagonal':
            return [
                `linear-gradient(135deg, ${hexAlpha(primary, 0.75)} 0%, ${hexAlpha(secondary, 0.35)} 45%, transparent 70%)`,
                `linear-gradient(315deg, ${hexAlpha(secondary, 0.20)} 0%, transparent 40%)`,
                BASE,
            ].join(', ');

        // ── 5. 엣지 글로우: 하단 + 좌측 가장자리 글로우 ─────────────────
        case 'noise_glow':
            return [
                `linear-gradient(90deg, ${hexAlpha(primary, 0.55)} 0%, transparent 35%)`,
                `linear-gradient(0deg, ${hexAlpha(secondary, 0.35)} 0%, transparent 60%)`,
                `radial-gradient(ellipse 40% 200% at 0% 100%, ${hexAlpha(primary, 0.40)} 0%, transparent 50%)`,
                BASE,
            ].join(', ');
    }
}
