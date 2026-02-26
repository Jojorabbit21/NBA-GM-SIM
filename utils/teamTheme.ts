
// Shared team color theme logic (used by Sidebar + DashboardHeader)
// Override groups: teams not listed use default (bg=primary, text=text, accent=secondary)
const ACCENT_TEXT = new Set(['atl','bos','cha','chi','cle','dal','den','gsw','hou','lal','mia','nop','orl','phi','por','sac','uta','was']);
const BG_SEC_ACCENT_TEXT = new Set(['det','tor']);
const TEXT_SEC = new Set(['mem','nyk','okc']);
const INVERTED = new Set(['lac','min','sas']); // bg↔secondary, text↔primary

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

// 팀별 버튼 색상 오버라이드 — 'primary'|'secondary'|'text' 키로 teamData 색상 참조
type ColorKey = 'primary' | 'secondary' | 'text';
const BTN_OVERRIDES: Record<string, Partial<Record<keyof ButtonTheme, ColorKey>>> = {
    // secondary가 black/near-black → text(흰) 배경 + primary 글로우
    'chi': { bg: 'text', text: 'primary', glow: 'primary' },
    'hou': { bg: 'text', text: 'primary', glow: 'primary' },
    'por': { bg: 'text', text: 'primary', glow: 'primary' },
    // BG_SEC_ACCENT_TEXT: header bg=secondary → primary 버튼
    'det': { bg: 'primary', text: 'text', glow: 'primary' },
    'tor': { bg: 'primary', text: 'text', glow: 'primary' },
    // INVERTED: header bg=secondary → primary 대비
    'lac': { bg: 'primary', text: 'text', glow: 'primary' },
    'min': { bg: 'text', text: 'primary', glow: 'secondary' },
    'sas': { bg: 'primary', text: 'text', glow: 'secondary' },
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
    return {
        bg: o.bg ? c[o.bg] : defaults.bg,
        text: o.text ? c[o.text] : defaults.text,
        glow: o.glow ? c[o.glow] : defaults.glow,
    };
}

export function getTeamTheme(
    teamId: string | null,
    colors: { primary: string; secondary: string; text: string } | null
): TeamTheme {
    const c = colors || DEFAULT_COLORS;
    const base = { bg: c.primary, text: c.text, accent: c.secondary };
    if (!teamId) return base;
    if (ACCENT_TEXT.has(teamId)) return { ...base, accent: c.text };
    if (BG_SEC_ACCENT_TEXT.has(teamId)) return { ...base, bg: c.secondary, accent: c.text };
    if (TEXT_SEC.has(teamId)) return { ...base, text: c.secondary };
    if (INVERTED.has(teamId)) return { bg: c.secondary, text: c.primary, accent: c.primary };
    return base;
}
