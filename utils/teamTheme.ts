
// Shared team color theme logic (used by Sidebar + DashboardHeader)

// 사이드바 비선택 아이콘 색상 — Figma Colors.tokens.json {TEAM}/secondary
export const SIDEBAR_ICON_COLORS: Record<string, string> = {
    'atl': '#FFC72C', 'bos': '#FFFFFF', 'bkn': '#FFFFFF',
    'cha': '#FFFFFF', 'chi': '#FFFFFF', 'cle': '#FFB81C',
    'dal': '#FFFFFF', 'den': '#FEC524', 'det': '#FFFFFF',
    'gs':  '#FDB927', 'hou': '#FFFFFF', 'ind': '#FDBB30',
    'law': '#D50032', 'lam': '#FDB927', 'mem': '#FFFFFF',
    'mia': '#F9A01B', 'mil': '#EEE1C6', 'min': '#79BC43',
    'no':  '#B4975A', 'nyk': '#F58426', 'okc': '#FFFFFF',
    'orl': '#FFFFFF', 'phi': '#D50032', 'phx': '#E56020',
    'por': '#FFFFFF', 'sac': '#FFFFFF', 'sa':  '#FFFFFF',
    'tor': '#FFFFFF', 'uta': '#7BA4DB', 'was': '#C4CED4',
};

// 사이드바 선택(active) 아이콘 색상 — 피그마 기준 전 팀 #ffffff (기본값)
export const SIDEBAR_SELECTED_ICON_COLORS: Record<string, string> = {};

export interface TeamTheme {
    bg: string;
    text: string;
    accent: string;
}

const DEFAULT_COLORS = { primary: '#334155', secondary: '#64748b', text: '#FFFFFF' };

// ── Button Theme ──
export interface ButtonTheme {
    bg: string;
    text: string;
    glow: string;
}

// 팀별 버튼 색상 오버라이드 — 기본값: bg=primary, text=white, glow=primary
type ColorRef = 'primary' | 'secondary' | 'tertiary' | 'text' | `#${string}`;
const BTN_OVERRIDES: Record<string, Partial<Record<keyof ButtonTheme, ColorRef>>> = {
    // Gold/bronze secondary as button bg
    'cle': { bg: 'secondary', text: '#000000', glow: 'secondary' },
    'ind': { bg: 'secondary', text: '#000000', glow: 'secondary' },
    'no':  { bg: 'secondary', text: 'primary', glow: 'secondary' },
    'nyk': { bg: 'secondary', text: 'text',    glow: 'secondary' },
    // Secondary as button bg
    'law': { bg: 'secondary', text: 'text',    glow: 'secondary' },
    'phi': { bg: 'secondary', text: 'text',    glow: 'secondary' },
    'phx': { bg: 'secondary', text: 'text',    glow: 'secondary' },
    // Black primary → use silver secondary for visibility
    'bkn': { bg: 'secondary', text: 'primary', glow: 'secondary' },
    'sa':  { bg: 'secondary', text: 'primary', glow: 'secondary' },
    // Tertiary as button bg
    'min': { bg: 'tertiary',  text: 'text',    glow: 'tertiary'  },
    'tor': { bg: '#753BBD',   text: 'text',    glow: '#753BBD'   },
    // Gold/accent text on primary bg
    'den': { text: 'tertiary' },
    'gs':  { text: 'secondary' },
    'lam': { text: 'secondary' },
    'mia': { text: 'tertiary' },
};

export function getButtonTheme(
    teamId: string | null,
    colors: { primary: string; secondary: string; tertiary?: string; text: string } | null
): ButtonTheme {
    const c = colors || { ...DEFAULT_COLORS, tertiary: undefined };
    const defaults: ButtonTheme = {
        bg: c.primary,
        text: '#FFFFFF',
        glow: c.primary,
    };
    const o = teamId ? BTN_OVERRIDES[teamId] : undefined;
    if (!o) return defaults;
    const r = (ref: ColorRef): string => {
        if (ref.startsWith('#')) return ref;
        return (c as Record<string, string | undefined>)[ref] ?? '#FFFFFF';
    };
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
    // accent → text (continued)
    'det': { accent: 'text' },
    'tor': { accent: 'text' },
    // text → secondary
    'mem': { text: 'text' },
    'nyk': { text: 'text' },
    'okc': { text: 'text', accent: 'text' },
    // misc
    'law': { accent: 'text' },
    'min': { accent: '#79BC43' },
    'sa':  { accent: 'text' },
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
