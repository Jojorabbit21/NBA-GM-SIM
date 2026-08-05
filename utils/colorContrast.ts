
// 배경색(hex) 위에서 가독성이 더 나은 전경색(흰/검)을 WCAG 상대 명도 기준으로 고른다.
// colorText가 아직 없는 레코드(구버전 데이터, 미전파 경로)에 대한 안전망 폴백으로 사용.

// 팀/코트 색상 입력 폼 전반(TeamSetupModal/TeamSettingsModal/leagueService 검증)이 공유하는
// #RRGGBB 형식 검사 — 각자 독립 선언해서 3중복이 나던 것을 여기 하나로 통일.
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const chans = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
}

export function getReadableTextColor(backgroundHex: string | null | undefined, fallback = '#FFFFFF'): string {
    const rgb = backgroundHex ? hexToRgb(backgroundHex) : null;
    if (!rgb) return fallback;
    return relativeLuminance(rgb) > 0.42 ? '#000000' : '#FFFFFF';
}

// WCAG 명도 대비율(1~21). 팀 컬러 에디터류 UI에서 "이 조합 읽기 힘들어요" 경고에 사용.
export function contrastRatio(hexA: string, hexB: string): number {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return 21;
    const L1 = relativeLuminance(a) + 0.05;
    const L2 = relativeLuminance(b) + 0.05;
    return L1 > L2 ? L1 / L2 : L2 / L1;
}
