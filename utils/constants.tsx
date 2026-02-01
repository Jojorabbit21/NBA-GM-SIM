import { Game, Player, Team } from '../types';

export const SEASON_START_DATE = '2025-10-22';
export const TRADE_DEADLINE = '2026-02-06';

export const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {};

export const TEAM_OWNERS: Record<string, string> = {
    'atl': 'Tony Ressler', 'bos': 'Wyc Grousbeck', 'bkn': 'Joseph Tsai', 'cha': 'Rick Schnall & Gabe Plotkin',
    'chi': 'Michael Reinsdorf', 'cle': 'Dan Gilbert', 'dal': 'Miriam Adelson', 'den': 'Ann Walton Kroenke',
    'det': 'Tom Gores', 'gsw': 'Joe Lacob', 'hou': 'Tilman Fertitta', 'ind': 'Herb Simon',
    'lac': 'Steve Ballmer', 'lal': 'Jeanie Buss', 'mem': 'Robert Pera', 'mia': 'Micky Arison',
    'mil': 'Wes Edens', 'min': 'Glen Taylor', 'nop': 'Gayle Benson', 'nyk': 'James Dolan',
    'okc': 'Clay Bennett', 'orl': 'Dan DeVos', 'phi': 'Josh Harris', 'phx': 'Mat Ishbia',
    'por': 'Jody Allen', 'sac': 'Vivek Ranadivé', 'sas': 'Peter J. Holt', 'tor': 'Larry Tanenbaum',
    'uta': 'Ryan Smith', 'was': 'Ted Leonsis'
};

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0
});

export const resolveTeamId = (nameOrId: string): string => {
    if (!nameOrId) return 'unknown';
    const lower = nameOrId.toLowerCase().trim();
    
    // Check known IDs first
    const knownIds = ['atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gsw', 'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'nop', 'nyk', 'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sas', 'tor', 'uta', 'was'];
    if (knownIds.includes(lower)) return lower;

    // Map common names/cities
    const map: Record<string, string> = {
        'atlanta': 'atl', 'hawks': 'atl',
        'boston': 'bos', 'celtics': 'bos',
        'brooklyn': 'bkn', 'nets': 'bkn',
        'charlotte': 'cha', 'hornets': 'cha',
        'chicago': 'chi', 'bulls': 'chi',
        'cleveland': 'cle', 'cavaliers': 'cle', 'cavs': 'cle',
        'dallas': 'dal', 'mavericks': 'dal', 'mavs': 'dal',
        'denver': 'den', 'nuggets': 'den',
        'detroit': 'det', 'pistons': 'det',
        'golden state': 'gsw', 'warriors': 'gsw',
        'houston': 'hou', 'rockets': 'hou',
        'indiana': 'ind', 'pacers': 'ind',
        'la clippers': 'lac', 'clippers': 'lac',
        'la lakers': 'lal', 'lakers': 'lal',
        'memphis': 'mem', 'grizzlies': 'mem',
        'miami': 'mia', 'heat': 'mia',
        'milwaukee': 'mil', 'bucks': 'mil',
        'minnesota': 'min', 'timberwolves': 'min', 'wolves': 'min',
        'new orleans': 'nop', 'pelicans': 'nop',
        'new york': 'nyk', 'knicks': 'nyk',
        'oklahoma city': 'okc', 'thunder': 'okc',
        'orlando': 'orl', 'magic': 'orl',
        'philadelphia': 'phi', '76ers': 'phi', 'sixers': 'phi',
        'phoenix': 'phx', 'suns': 'phx',
        'portland': 'por', 'trail blazers': 'por', 'blazers': 'por',
        'sacramento': 'sac', 'kings': 'sac',
        'san antonio': 'sas', 'spurs': 'sas',
        'toronto': 'tor', 'raptors': 'tor',
        'utah': 'uta', 'jazz': 'uta',
        'washington': 'was', 'wizards': 'was'
    };

    return map[lower] || lower.substring(0, 3);
};

export const getTeamLogoUrl = (teamId: string): string => {
    const id = resolveTeamId(teamId);
    return `https://buummihpewiaeltywdff.supabase.co/storage/v1/object/public/logos/${id}.png`;
};

export const calculatePlayerOvr = (p: Player, position?: string): number => {
    // Simplified OVR calculation if not provided by backend
    return p.ovr;
};

export const normalizeName = (name: string): string => {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
    // Placeholder generator logic or empty array if DB schedule is preferred
    return [];
};

export const mapDatabaseScheduleToRuntimeGame = (rows: any[]): Game[] => {
    return rows.map(r => {
        // Safe access for home_team_id / away_team_id
        const rowHomeId = r.home_team_id || r.home_team || r.HomeTeam || '';
        const rowAwayId = r.away_team_id || r.away_team || r.AwayTeam || '';

        if (rowHomeId && rowAwayId) {
             const homeTeamId = resolveTeamId(rowHomeId);
             const awayTeamId = resolveTeamId(rowAwayId);

             return {
                 id: r.id || `g_${homeTeamId}_${awayTeamId}_${r.game_date}`,
                 homeTeamId: homeTeamId,
                 awayTeamId: awayTeamId,
                 date: r.game_date || r.date,
                 homeScore: r.home_score ?? undefined,
                 awayScore: r.away_score ?? undefined,
                 played: !!r.played || (r.home_score !== undefined && r.home_score !== null),
                 isPlayoff: r.is_playoff || false,
                 seriesId: r.series_id || undefined
             };
        }

        // Fallback for CSV-like structures
        let dateStr = r.date || r.Date;
        if (dateStr && dateStr.includes(' ')) {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                }
            } catch(e) {}
        }

        const site = r.site || r.Site;
        const rowTeam = r.team || r.Team || '';
        const rowOpp = r.opponent || r.Opponent || '';
        
        const homeName = (site === '홈' || site === 'Home') ? rowTeam : rowOpp;
        const awayName = (site === '홈' || site === 'Home') ? rowOpp : rowTeam;

        const homeTeamId = resolveTeamId(homeName);
        const awayTeamId = resolveTeamId(awayName);

        return {
            id: r.id || `g_${homeTeamId}_${awayTeamId}_${dateStr}`,
            homeTeamId,
            awayTeamId,
            date: dateStr,
            homeScore: r.tmscore || r.home_score || undefined,
            awayScore: r.oppscore || r.away_score || undefined,
            played: !!(r.tmscore || r.home_score),
            isPlayoff: r.isplayoff || false,
            seriesId: r.seriesid || undefined
        };
    });
};