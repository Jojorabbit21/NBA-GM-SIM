
export interface TeamStaticData {
    id: string;
    city: string;
    name: string;
    conference: 'East' | 'West';
    division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
    owner: string;
    colors: {
        primary: string;
        secondary: string;
        text: string;
    };
}

// ── Team Colors (DB에 없으므로 클라이언트 static) ──
export const TEAM_COLORS: Record<string, { primary: string; secondary: string; text: string }> = {
    'atl': { primary: '#C8102E', secondary: '#FDB927', text: '#FFFFFF' },
    'bos': { primary: '#007A33', secondary: '#BA9653', text: '#FFFFFF' },
    'bkn': { primary: '#000000', secondary: '#FFFFFF', text: '#FFFFFF' },
    'cha': { primary: '#00788C', secondary: '#1D1160', text: '#FFFFFF' },
    'chi': { primary: '#BA0C2F', secondary: '#000000', text: '#FFFFFF' },
    'cle': { primary: '#6F263D', secondary: '#B9975B', text: '#FFFFFF' },
    'dal': { primary: '#0050B5', secondary: '#9EA2A2', text: '#FFFFFF' },
    'den': { primary: '#0E2240', secondary: '#8B2131', text: '#FEC524' },
    'det': { primary: '#C8102E', secondary: '#1D42BA', text: '#FFFFFF' },
    'gs':  { primary: '#1D428A', secondary: '#FFC72C', text: '#FFFFFF' },
    'hou': { primary: '#CE1141', secondary: '#000000', text: '#FFFFFF' },
    'ind': { primary: '#0C2340', secondary: '#FFCD00', text: '#FFFFFF' },
    'law': { primary: '#C8102E', secondary: '#0C2340', text: '#FFFFFF' },
    'lam': { primary: '#552583', secondary: '#FDB927', text: '#FFC72C' },
    'mem': { primary: '#5D76A9', secondary: '#12173F', text: '#FFFFFF' },
    'mia': { primary: '#98002E', secondary: '#F9A01B', text: '#FFFFFF' },
    'mil': { primary: '#00471B', secondary: '#EEE1C6', text: '#FFFFFF' },
    'min': { primary: '#0C2340', secondary: '#236192', text: '#FFFFFF' },
    'no':  { primary: '#0C2340', secondary: '#B9975B', text: '#FFFFFF' },
    'nyk': { primary: '#006BB6', secondary: '#F58426', text: '#FFFFFF' },
    'okc': { primary: '#0072CE', secondary: '#F9423A', text: '#FFFFFF' },
    'orl': { primary: '#0050B5', secondary: '#9EA2A2', text: '#FFFFFF' },
    'phi': { primary: '#1D4289', secondary: '#C8102E', text: '#FFFFFF' },
    'phx': { primary: '#1D1160', secondary: '#E56020', text: '#FFFFFF' },
    'por': { primary: '#C8102E', secondary: '#010101', text: '#FFFFFF' },
    'sac': { primary: '#5A2D81', secondary: '#63727A', text: '#FFFFFF' },
    'sa':  { primary: '#000000', secondary: '#C4CED4', text: '#FFFFFF' },
    'tor': { primary: '#BA0C2F', secondary: '#000000', text: '#FFFFFF' },
    'uta': { primary: '#4E008E', secondary: '#79A3DC', text: '#FFFFFF' },
    'was': { primary: '#002B5C', secondary: '#E31837', text: '#FFFFFF' },
};

const DEFAULT_COLORS = { primary: '#6366f1', secondary: '#818cf8', text: '#FFFFFF' };

// ── TEAM_DATA (하드코딩 fallback → DB fetch 성공 시 덮어쓰기) ──
export let TEAM_DATA: Record<string, TeamStaticData> = {
    'atl': { id: 'atl', city: '애틀랜타', name: '파이어버드', conference: 'East', division: 'Southeast', owner: '앤서니 R.', colors: TEAM_COLORS['atl'] },
    'bos': { id: 'bos', city: '보스턴', name: '세이지', conference: 'East', division: 'Atlantic', owner: '빅터 G.', colors: TEAM_COLORS['bos'] },
    'bkn': { id: 'bkn', city: '브루클린', name: '나이츠', conference: 'East', division: 'Atlantic', owner: '제이슨 C.', colors: TEAM_COLORS['bkn'] },
    'cha': { id: 'cha', city: '샬럿', name: '스팅어스', conference: 'East', division: 'Southeast', owner: '리처드 S.', colors: TEAM_COLORS['cha'] },
    'chi': { id: 'chi', city: '시카고', name: '차저스', conference: 'East', division: 'Central', owner: '마이클 R.', colors: TEAM_COLORS['chi'] },
    'cle': { id: 'cle', city: '클리블랜드', name: '랜서스', conference: 'East', division: 'Central', owner: '대니얼 G.', colors: TEAM_COLORS['cle'] },
    'dal': { id: 'dal', city: '댈러스', name: '머스탱', conference: 'West', division: 'Southwest', owner: '미리엄 A.', colors: TEAM_COLORS['dal'] },
    'den': { id: 'den', city: '덴버', name: '시프터스', conference: 'West', division: 'Northwest', owner: '스탠리 K.', colors: TEAM_COLORS['den'] },
    'det': { id: 'det', city: '디트로이트', name: '스탈리온스', conference: 'East', division: 'Central', owner: '토마스 G.', colors: TEAM_COLORS['det'] },
    'gs':  { id: 'gs', city: '골든스테이트', name: '뱅가즈', conference: 'West', division: 'Pacific', owner: '조셉 L.', colors: TEAM_COLORS['gs'] },
    'hou': { id: 'hou', city: '휴스턴', name: '이글스', conference: 'West', division: 'Southwest', owner: '틸먼 F.', colors: TEAM_COLORS['hou'] },
    'ind': { id: 'ind', city: '인디애나', name: '레이서스', conference: 'East', division: 'Central', owner: '허버트 S.', colors: TEAM_COLORS['ind'] },
    'law': { id: 'law', city: 'LA', name: '와일드캣', conference: 'West', division: 'Pacific', owner: '스티븐 B.', colors: TEAM_COLORS['law'] },
    'lam': { id: 'lam', city: 'LA', name: '미라지', conference: 'West', division: 'Pacific', owner: '지나 B.', colors: TEAM_COLORS['lam'] },
    'mem': { id: 'mem', city: '멤피스', name: '코디악스', conference: 'West', division: 'Southwest', owner: '로버트 P.', colors: TEAM_COLORS['mem'] },
    'mia': { id: 'mia', city: '마이애미', name: '블레이즈', conference: 'East', division: 'Southeast', owner: '미키 A.', colors: TEAM_COLORS['mia'] },
    'mil': { id: 'mil', city: '밀워키', name: '스태그', conference: 'East', division: 'Central', owner: '웨슬리 E.', colors: TEAM_COLORS['mil'] },
    'min': { id: 'min', city: '미네소타', name: '프로스트울브스', conference: 'West', division: 'Northwest', owner: '글렌 T.', colors: TEAM_COLORS['min'] },
    'no':  { id: 'no', city: '뉴올리언스', name: '헤론스', conference: 'West', division: 'Southwest', owner: '게일 B.', colors: TEAM_COLORS['no'] },
    'nyk': { id: 'nyk', city: '뉴욕', name: '엠파이어', conference: 'East', division: 'Atlantic', owner: '제임스 D.', colors: TEAM_COLORS['nyk'] },
    'okc': { id: 'okc', city: '오클라호마시티', name: '볼트', conference: 'West', division: 'Northwest', owner: '클레이턴 B.', colors: TEAM_COLORS['okc'] },
    'orl': { id: 'orl', city: '올랜도', name: '미스틱스', conference: 'East', division: 'Southeast', owner: '대니얼 D.', colors: TEAM_COLORS['orl'] },
    'phi': { id: 'phi', city: '필라델피아', name: '리버티', conference: 'East', division: 'Atlantic', owner: '조시 H.', colors: TEAM_COLORS['phi'] },
    'phx': { id: 'phx', city: '피닉스', name: '카이요티스', conference: 'West', division: 'Pacific', owner: '매튜 I.', colors: TEAM_COLORS['phx'] },
    'por': { id: 'por', city: '포틀랜드', name: '파이오니어스', conference: 'West', division: 'Northwest', owner: '조디 A.', colors: TEAM_COLORS['por'] },
    'sac': { id: 'sac', city: '새크라멘토', name: '모나크스', conference: 'West', division: 'Pacific', owner: '비벡 R.', colors: TEAM_COLORS['sac'] },
    'sa':  { id: 'sa', city: '샌안토니오', name: '아웃로스', conference: 'West', division: 'Southwest', owner: '피터 H.', colors: TEAM_COLORS['sa'] },
    'tor': { id: 'tor', city: '토론토', name: '노스가드', conference: 'East', division: 'Atlantic', owner: '래리 T.', colors: TEAM_COLORS['tor'] },
    'uta': { id: 'uta', city: '유타', name: '하이랜더스', conference: 'West', division: 'Northwest', owner: '라이언 S.', colors: TEAM_COLORS['uta'] },
    'was': { id: 'was', city: '워싱턴', name: '아케인스', conference: 'East', division: 'Southeast', owner: '테드 L.', colors: TEAM_COLORS['was'] },
};

// ── meta_teams DB 데이터로 TEAM_DATA 교체 ──
export function populateTeamData(rows: any[]): void {
    const newData: Record<string, TeamStaticData> = {};
    for (const row of rows) {
        const id = row.id;
        const attrs = typeof row.base_attributes === 'string'
            ? JSON.parse(row.base_attributes) : (row.base_attributes || {});
        newData[id] = {
            id,
            city: row.city,
            name: row.name,
            conference: row.conference as 'East' | 'West',
            division: row.division,
            owner: attrs.owner || '',
            colors: TEAM_COLORS[id] || DEFAULT_COLORS,
        };
    }
    TEAM_DATA = newData;
}

export const getTeamColor = (id: string, type: 'primary' | 'secondary' = 'primary') => {
    const team = TEAM_DATA[id];
    return team ? team.colors[type] : '#000000';
};

export const getAllTeamsList = () => Object.values(TEAM_DATA);
