
import { Game, Player, Team } from '../types';
import { calculateOvr } from './ovrUtils';

export const SEASON_START_DATE = '2025-10-20'; // Adjusted to match generic start
export const TRADE_DEADLINE = '2026-02-06';

export const TEAM_OWNERS: Record<string, string> = {
    'atl': '토니 레슬러', 'bos': '윅 그로스벡', 'bkn': '조 차이', 'cha': '릭 슈널 & 게이브 플로킨',
    'chi': '마이클 라인스도프', 'cle': '댄 길버트', 'dal': '미리암 아델슨', 'den': '스탠 크론키',
    'det': '톰 고어스', 'gsw': '조 레이콥', 'hou': '틸먼 페르티타', 'ind': '허브 사이먼',
    'lac': '스티브 발머', 'lal': '지니 버스', 'mem': '로버트 페라', 'mia': '미키 애리슨',
    'mil': '웨스 에든스', 'min': '글렌 테일러', 'nop': '게일 벤슨', 'nyk': '제임스 돌란',
    'okc': '클레이 베넷', 'orl': '댄 디보스', 'phi': '조쉬 해리스', 'phx': '맷 이시비아',
    'por': '조디 앨런', 'sac': '비벡 라나디베', 'sas': '피터 J. 홀트', 'tor': '래리 타넨바움',
    'uta': '라이언 스미스', 'was': '테드 레온시스'
};

export const FALLBACK_TEAMS = [
    { id: 'atl', city: '애틀랜타', name: '호크스', conference: 'East', division: 'Southeast' },
    { id: 'bos', city: '보스턴', name: '셀틱스', conference: 'East', division: 'Atlantic' },
    { id: 'bkn', city: '브루클린', name: '네츠', conference: 'East', division: 'Atlantic' },
    { id: 'cha', city: '샬럿', name: '호네츠', conference: 'East', division: 'Southeast' },
    { id: 'chi', city: '시카고', name: '불스', conference: 'East', division: 'Central' },
    { id: 'cle', city: '클리블랜드', name: '캐벌리어스', conference: 'East', division: 'Central' },
    { id: 'dal', city: '댈러스', name: '매버릭스', conference: 'West', division: 'Southwest' },
    { id: 'den', city: '덴버', name: '너게츠', conference: 'West', division: 'Northwest' },
    { id: 'det', city: '디트로이트', name: '피스톤스', conference: 'East', division: 'Central' },
    { id: 'gsw', city: '골든스테이트', name: '워리어스', conference: 'West', division: 'Pacific' },
    { id: 'hou', city: '휴스턴', name: '로케츠', conference: 'West', division: 'Southwest' },
    { id: 'ind', city: '인디애나', name: '페이서스', conference: 'East', division: 'Central' },
    { id: 'lac', city: 'LA', name: '클리퍼스', conference: 'West', division: 'Pacific' },
    { id: 'lal', city: 'LA', name: '레이커스', conference: 'West', division: 'Pacific' },
    { id: 'mem', city: '멤피스', name: '그리즈리스', conference: 'West', division: 'Southwest' },
    { id: 'mia', city: '마이애미', name: '히트', conference: 'East', division: 'Southeast' },
    { id: 'mil', city: '밀워키', name: '벅스', conference: 'East', division: 'Central' },
    { id: 'min', city: '미네소타', name: '팀버울브스', conference: 'West', division: 'Northwest' },
    { id: 'nop', city: '뉴올리언스', name: '펠리컨스', conference: 'West', division: 'Southwest' },
    { id: 'nyk', city: '뉴욕', name: '닉스', conference: 'East', division: 'Atlantic' },
    { id: 'okc', city: '오클라호마시티', name: '썬더', conference: 'West', division: 'Northwest' },
    { id: 'orl', city: '올랜도', name: '매직', conference: 'East', division: 'Southeast' },
    { id: 'phi', city: '필라델피아', name: '세븐티식서스', conference: 'East', division: 'Atlantic' },
    { id: 'phx', city: '피닉스', name: '선즈', conference: 'West', division: 'Pacific' },
    { id: 'por', city: '포틀랜드', name: '트레일 블레이저스', conference: 'West', division: 'Northwest' },
    { id: 'sac', city: '새크라멘토', name: '킹스', conference: 'West', division: 'Pacific' },
    { id: 'sas', city: '샌안토니오', name: '스퍼스', conference: 'West', division: 'Southwest' },
    { id: 'tor', city: '토론토', name: '랩터스', conference: 'East', division: 'Atlantic' },
    { id: 'uta', city: '유타', name: '재즈', conference: 'West', division: 'Northwest' },
    { id: 'was', city: '워싱턴', name: '위저즈', conference: 'East', division: 'Southeast' }
];

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    pf: 0,
    
    // --- New 10-Zone Shooting Data ---
    zone_rim_m: 0, zone_rim_a: 0,
    zone_paint_m: 0, zone_paint_a: 0, // Merged Paint
    zone_mid_l_m: 0, zone_mid_l_a: 0,
    zone_mid_c_m: 0, zone_mid_c_a: 0,
    zone_mid_r_m: 0, zone_mid_r_a: 0,
    zone_c3_l_m: 0, zone_c3_l_a: 0,
    zone_c3_r_m: 0, zone_c3_r_a: 0,
    zone_atb3_l_m: 0, zone_atb3_l_a: 0,
    zone_atb3_c_m: 0, zone_atb3_c_a: 0,
    zone_atb3_r_m: 0, zone_atb3_r_a: 0
});

export const resolveTeamId = (nameOrId: string | null | undefined): string => {
    if (!nameOrId) return 'unknown';
    // Convert to string and clean up
    const input = String(nameOrId).toLowerCase().trim();
    
    // Exact match for known IDs
    const knownIds = ['atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gsw', 'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'nop', 'nyk', 'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sas', 'tor', 'uta', 'was'];
    if (knownIds.includes(input)) return input;

    // Comprehensive Map
    const map: Record<string, string> = {
        // English
        'atlanta': 'atl', 'hawks': 'atl',
        'boston': 'bos', 'celtics': 'bos',
        'brooklyn': 'bkn', 'nets': 'bkn', 'bKN': 'bkn',
        'charlotte': 'cha', 'hornets': 'cha',
        'chicago': 'chi', 'bulls': 'chi',
        'cleveland': 'cle', 'cavaliers': 'cle', 'cavs': 'cle',
        'dallas': 'dal', 'mavericks': 'dal', 'mavs': 'dal',
        'denver': 'den', 'nuggets': 'den',
        'detroit': 'det', 'pistons': 'det',
        'golden state': 'gsw', 'warriors': 'gsw',
        'houston': 'hou', 'rockets': 'hou',
        'indiana': 'ind', 'pacers': 'ind',
        'la clippers': 'lac', 'clippers': 'lac', 'lac': 'lac',
        'la lakers': 'lal', 'lakers': 'lal', 'los angeles lakers': 'lal', 'los angeles clippers': 'lac',
        'memphis': 'mem', 'grizzlies': 'mem',
        'miami': 'mia', 'heat': 'mia',
        'milwaukee': 'mil', 'bucks': 'mil',
        'minnesota': 'min', 'timberwolves': 'min', 'wolves': 'min',
        'new orleans': 'nop', 'pelicans': 'nop', 'n.o.': 'nop', 'nop': 'nop',
        'new york': 'nyk', 'knicks': 'nyk', 'n.y.': 'nyk', 'nyk': 'nyk',
        'oklahoma city': 'okc', 'thunder': 'okc', 'okc': 'okc',
        'orlando': 'orl', 'magic': 'orl',
        'philadelphia': 'phi', '76ers': 'phi', 'sixers': 'phi', 'phi': 'phi',
        'phoenix': 'phx', 'suns': 'phx', 'pho': 'phx',
        'portland': 'por', 'trail blazers': 'por', 'blazers': 'por',
        'sacramento': 'sac', 'kings': 'sac',
        'san antonio': 'sas', 'spurs': 'sas', 'sas': 'sas',
        'toronto': 'tor', 'raptors': 'tor',
        'utah': 'uta', 'jazz': 'uta',
        'washington': 'was', 'wizards': 'was', 'wsh': 'was',
        // Korean (For compatibility)
        '애틀랜타': 'atl', '호크스': 'atl',
        '보스턴': 'bos', '셀틱스': 'bos',
        '브루클린': 'bkn', '네츠': 'bkn',
        '샬럿': 'cha', '호네츠': 'cha',
        '시카고': 'chi', '불스': 'chi',
        '클리블랜드': 'cle', '캐벌리어스': 'cle',
        '댈러스': 'dal', '매버릭스': 'dal',
        '덴버': 'den', '너게츠': 'den',
        '디트로이트': 'det', '피스톤스': 'det',
        '골든스테이트': 'gsw', '워리어스': 'gsw',
        '휴스턴': 'hou', '로케츠': 'hou',
        '인디애나': 'ind', '페이서스': 'ind',
        '클리퍼스': 'lac',
        '레이커스': 'lal',
        '멤피스': 'mem', '그리즈리스': 'mem',
        '마이애미': 'mia', '히트': 'mia',
        '밀워키': 'mil', '벅스': 'mil',
        '미네소타': 'min', '팀버울브스': 'min',
        '뉴올리언스': 'nop', '펠리컨스': 'nop',
        '뉴욕': 'nyk', '닉스': 'nyk',
        '오클라호마시티': 'okc', '썬더': 'okc',
        '올랜도': 'orl', '매직': 'orl',
        '필라델피아': 'phi', '세븐티식서스': 'phi',
        '피닉스': 'phx', '선즈': 'phx',
        '포틀랜드': 'por', '트레일블레이저스': 'por',
        '새크라멘토': 'sac', '킹스': 'sac',
        '샌안토니오': 'sas', '스퍼스': 'sas',
        '토론토': 'tor', '랩터스': 'tor',
        '유타': 'uta', '재즈': 'uta',
        '워싱턴': 'was', '위저즈': 'was'
    };

    // Direct Check
    if (map[input]) return map[input];

    // Partial match fallback
    for (const key in map) {
        if (input.includes(key)) return map[key];
    }

    return 'unknown';
};

export const getTeamLogoUrl = (teamId: string): string => {
    const id = resolveTeamId(teamId);
    
    // [Optimization] Chicago Bulls logo (chi.svg) contains a massive base64 string
    // causing performance issues. Use PNG version instead.
    if (id === 'chi') return '/logos/chi.png';
    
    return `/logos/${id}.svg`;
};

// [Critical] Import OVR calc from logic file to ensure consistency
// This replaces the old static p.ovr return.
export const calculatePlayerOvr = (p: Player, position?: string): number => {
    return calculateOvr(p, position || p.position);
};

export const generateSeasonSchedule = (myTeamId: string): Game[] => {
    return [];
};
