
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
