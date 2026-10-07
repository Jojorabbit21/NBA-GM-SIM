import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { HEX_COLOR_RE } from '../../utils/colorContrast';

// [2026-10-02] Global default court colors, editable by admin (app_settings.court_default_colors).
// league_teams.court_* = NULL means "follow the global default"; a non-null value is a team override.
export interface CourtColors { background: string; paint: string; line: string; three: string }

const SETTINGS_KEY = 'court_default_colors';
// [2026-10-02] Per-team-slug default (overrides the global one for that slug): { [team_slug]: CourtColors }.
// Resolution: league_teams.court_* (team override) -> team-slug default -> global default.
const TEAM_SETTINGS_KEY = 'court_team_default_colors';
export type TeamCourtDefaults = Record<string, CourtColors>;

// Fallback when the settings row is missing/unreachable (matches the original hardcoded wood court).
export const FALLBACK_COURT_COLORS: CourtColors = { background: '#DDC8AD', paint: '#C3AC91', line: '#4A3728', three: '#DDC8AD' };

interface CourtDefaultsState { global: CourtColors; teams: TeamCourtDefaults }

let cached: CourtDefaultsState | null = null;
let inflight: Promise<CourtDefaultsState> | null = null;
const listeners = new Set<(c: CourtDefaultsState) => void>();

const sanitize = (raw: unknown): CourtColors => {
    const r = (raw ?? {}) as Partial<CourtColors>;
    const pick = (v: unknown, fb: string) => (typeof v === 'string' && HEX_COLOR_RE.test(v) ? v : fb);
    const background = pick(r.background, FALLBACK_COURT_COLORS.background);
    return {
        background,
        paint: pick(r.paint, FALLBACK_COURT_COLORS.paint),
        line:  pick(r.line,  FALLBACK_COURT_COLORS.line),
        // 설정이 만들어지기 전(three 없음)에는 3점 안쪽 = 코트 배경(이전 모습 그대로)
        three: pick(r.three, background),
    };
};

const sanitizeTeams = (raw: unknown): TeamCourtDefaults => {
    const out: TeamCourtDefaults = {};
    if (raw && typeof raw === 'object') {
        for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) out[slug] = sanitize(v);
    }
    return out;
};

const load = (force = false): Promise<CourtDefaultsState> => {
    if (cached && !force) return Promise.resolve(cached);
    if (inflight && !force) return inflight;
    inflight = (async () => {
        const { data } = await supabase.from('app_settings').select('key,value').in('key', [SETTINGS_KEY, TEAM_SETTINGS_KEY]);
        const byKey = new Map((data ?? []).map(r => [r.key as string, r.value]));
        cached = { global: sanitize(byKey.get(SETTINGS_KEY)), teams: sanitizeTeams(byKey.get(TEAM_SETTINGS_KEY)) };
        return cached;
    })().finally(() => { inflight = null; });
    return inflight;
};

const publish = (next: CourtDefaultsState) => { cached = next; listeners.forEach(l => l(next)); };

export const fetchCourtDefaults = (force = false): Promise<CourtColors> => load(force).then(c => c.global);
export const fetchTeamCourtDefaults = (force = false): Promise<TeamCourtDefaults> => load(force).then(c => c.teams);

export const saveCourtDefaults = async (colors: CourtColors): Promise<{ error: string | null }> => {
    const clean = sanitize(colors);
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: SETTINGS_KEY, value: clean, updated_at: new Date().toISOString() });
    if (error) return { error: error.message };
    publish({ global: clean, teams: cached?.teams ?? {} });
    return { error: null };
};

/** Replaces the whole per-team default map (a slug absent from the map follows the global default). */
export const saveTeamCourtDefaults = async (teams: TeamCourtDefaults): Promise<{ error: string | null }> => {
    const clean = sanitizeTeams(teams);
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: TEAM_SETTINGS_KEY, value: clean, updated_at: new Date().toISOString() });
    if (error) return { error: error.message };
    publish({ global: cached?.global ?? FALLBACK_COURT_COLORS, teams: clean });
    return { error: null };
};

/**
 * Effective default court colors for a team slug: its per-team default if the admin set one,
 * otherwise the global default (synchronously the fallback until the first fetch resolves).
 */
export const useCourtDefaults = (teamSlug?: string | null): CourtColors => {
    const [state, setState] = useState<CourtDefaultsState>(cached ?? { global: FALLBACK_COURT_COLORS, teams: {} });
    useEffect(() => {
        let alive = true;
        load().then(c => { if (alive) setState(c); });
        listeners.add(setState);
        return () => { alive = false; listeners.delete(setState); };
    }, []);
    return (teamSlug && state.teams[teamSlug]) || state.global;
};
