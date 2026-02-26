
// Shared team color theme logic (used by Sidebar + DashboardHeader)

export interface TeamTheme {
    bg: string;
    text: string;
    accent: string;
}

const DEFAULT_COLORS = { primary: '#4f46e5', secondary: '#6366f1', text: '#FFFFFF' };

// ── Button Theme ──
export interface ButtonTheme {
    bg: string;
    text: string;
    glow: string;
}

function isLightColor(hex: string): boolean {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

// 팀별 버튼 색상 오버라이드 — 키('primary'|'secondary'|'text') 또는 '#hex' 직접 지정
type ColorRef = 'primary' | 'secondary' | 'text' | `#${string}`;
const BTN_OVERRIDES: Record<string, Partial<Record<keyof ButtonTheme, ColorRef>>> = {
    // secondary가 black/near-black → text(흰) 배경 + primary 글로우
    'atl': { bg: 'text', text: 'primary', glow: 'text' },
    'bos': { bg: 'text', text: 'primary', glow: 'text' },
    'cha': { bg: 'text', text: 'primary', glow: 'text' },
    'chi': { bg: 'text', text: 'primary', glow: 'text' },
    'cle': { bg: 'secondary', text: '#000000', glow: 'secondary' },
    'hou': { bg: 'text', text: 'primary', glow: 'text' },
    'por': { bg: 'text', text: 'primary', glow: 'primary' },
    // BG_SEC_ACCENT_TEXT: header bg=secondary → primary 버튼
    'det': { bg: 'primary', text: 'text', glow: 'primary' },
    'ind': { bg: 'secondary', text: '#000000', glow: 'secondary' },
    'mia': { bg: '#41B6E6', text: '#DB3EB1', glow: '#41B6E6' },
    'mil': { bg: '#0057B7', text: 'text', glow: '#0057B7'},
    'nyk': { bg: 'secondary', text: 'text', glow: 'secondary'},
    'orl': { bg: '#FFFFFF', text: 'primary', glow: '#FFFFFF'},
    'phi': { glow: 'secondary'},
    'tor': { bg: '#753BBD', text: 'text', glow: '#753BBD' },
    'dal': { bg: 'text', text: 'primary', glow: 'primary'},
    'den': { bg: 'text', text: 'primary', glow: 'text'},
    'gs': { bg: '#FFFFFF', text: 'primary', glow: 'primary'},
    // INVERTED: header bg=secondary → primary 대비
    'law': { bg: 'primary', text: '#FFFFFF', glow: 'primary' },
    'min': { bg: '#78BE21', text: 'text', glow: '#78BE21' },
    'sa': { bg: 'primary', text: 'text', glow: 'secondary' },
    'sac': { bg: 'text', text: 'primary', glow: 'primary' },
    // secondary 너무 어두워 글로우 안 보임
    'mem': { bg: 'text', text: 'secondary', glow: 'primary' },
    // secondary가 white → 글로우를 text로
    'bkn': { glow: 'text' },
};

export function getButtonTheme(
    teamId: string | null,
    colors: { primary: string; secondary: string; text: string } | null
): ButtonTheme {
    const c = colors || DEFAULT_COLORS;
    const light = isLightColor(c.secondary);
    const defaults: ButtonTheme = {
        bg: c.secondary,
        text: light ? c.primary : '#FFFFFF',
        glow: light ? c.primary : c.secondary,
    };
    const o = teamId ? BTN_OVERRIDES[teamId] : undefined;
    if (!o) return defaults;
    const r = (ref: ColorRef) => ref.startsWith('#') ? ref : c[ref as keyof typeof c];
    return {
        bg: o.bg ? r(o.bg) : defaults.bg,
        text: o.text ? r(o.text) : defaults.text,
        glow: o.glow ? r(o.glow) : defaults.glow,
    };
}

// 팀별 테마 색상 오버라이드 — 기본값: { bg: primary, text: text, accent: secondary }
const THEME_OVERRIDES: Record<string, Partial<Record<keyof TeamTheme, ColorRef>>> = {
    // accent → text
    'atl': { accent: 'text' },
    'bos': { accent: 'text' },
    'cha': { accent: 'text' },
    'chi': { accent: 'text' },
    'cle': { accent: 'text' },
    'dal': { accent: 'text' },
    'den': { accent: 'text' },
    'gs': { accent: 'text' },
    'hou': { accent: 'text' },
    'lam': { accent: 'text' },
    'mia': { accent: 'text' },
    'no': { accent: 'text' },
    'orl': { accent: 'text' },
    'phi': { accent: 'text' },
    'por': { accent: 'text' },
    'sac': { accent: 'text' },
    'uta': { accent: 'text' },
    'was': { accent: 'text' },
    // bg → secondary, accent → text
    'det': { bg: 'secondary', accent: 'text' },
    'tor': { bg: 'secondary', accent: 'text' },
    // text → secondary
    'mem': { text: 'text' },
    'nyk': { text: 'text'},
    'okc': { text: 'text', accent: 'text' },
    // inverted
    'law': { bg: 'secondary', text: 'text', accent: 'text' },
    'min': { bg: 'primary', text: 'text', accent: '#78BE21' },
    'sa': { bg: 'secondary', text: 'primary', accent: 'primary' },
};

export function getTeamTheme(
    teamId: string | null,
    colors: { primary: string; secondary: string; text: string } | null
): TeamTheme {
    const c = colors || DEFAULT_COLORS;
    const defaults: TeamTheme = { bg: c.primary, text: c.text, accent: c.secondary };
    const o = teamId ? THEME_OVERRIDES[teamId] : undefined;
    if (!o) return defaults;
    const r = (ref: ColorRef) => ref.startsWith('#') ? ref : c[ref as keyof typeof c];
    return {
        bg: o.bg ? r(o.bg) : defaults.bg,
        text: o.text ? r(o.text) : defaults.text,
        accent: o.accent ? r(o.accent) : defaults.accent,
    };
}
