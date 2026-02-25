
export interface TeamStaticData {
    id: string;
    city: string;
    name: string;
    conference: 'East' | 'West';
    division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
    owner: string;
    colors: {
        primary: string; // Backgrounds
        secondary: string; // Accents
        text: string; // Text on primary background
    };
}

export const TEAM_DATA: Record<string, TeamStaticData> = {
    'atl': {
        id: 'atl', city: '애틀랜타', name: '호크스', conference: 'East', division: 'Southeast',
        owner: '토니 레슬러',
        colors: { primary: '#C8102E', secondary: '#FDB927', text: '#FFFFFF' }
    },
    'bos': {
        id: 'bos', city: '보스턴', name: '셀틱스', conference: 'East', division: 'Atlantic',
        owner: '윅 그로스벡',
        colors: { primary: '#007A33', secondary: '#BA9653', text: '#FFFFFF' }
    },
    'bkn': {
        id: 'bkn', city: '브루클린', name: '네츠', conference: 'East', division: 'Atlantic',
        owner: '조 차이',
        colors: { primary: '#000000', secondary: '#FFFFFF', text: '#FFFFFF' }
    },
    'cha': {
        id: 'cha', city: '샬럿', name: '호네츠', conference: 'East', division: 'Southeast',
        owner: '릭 슈널 & 게이브 플로킨',
        colors: { primary: '#00788C', secondary: '#1D1160', text: '#FFFFFF' }
    },
    'chi': {
        id: 'chi', city: '시카고', name: '불스', conference: 'East', division: 'Central',
        owner: '마이클 라인스도프',
        colors: { primary: '#CE1141', secondary: '#000000', text: '#FFFFFF' }
    },
    'cle': {
        id: 'cle', city: '클리블랜드', name: '캐벌리어스', conference: 'East', division: 'Central',
        owner: '댄 길버트',
        colors: { primary: '#860038', secondary: '#FDBB30', text: '#FFFFFF' }
    },
    'dal': {
        id: 'dal', city: '댈러스', name: '매버릭스', conference: 'West', division: 'Southwest',
        owner: '미리암 아델슨',
        colors: { primary: '#00538C', secondary: '#B8C4CA', text: '#FFFFFF' }
    },
    'den': {
        id: 'den', city: '덴버', name: '너게츠', conference: 'West', division: 'Northwest',
        owner: '스탠 크론키',
        colors: { primary: '#0E2240', secondary: '#8B2131', text: '#FEC524' }
    },
    'det': {
        id: 'det', city: '디트로이트', name: '피스톤스', conference: 'East', division: 'Central',
        owner: '톰 고어스',
        colors: { primary: '#C8102E', secondary: '#1D42BA', text: '#FFFFFF' }
    },
    'gsw': {
        id: 'gsw', city: '골든스테이트', name: '워리어스', conference: 'West', division: 'Pacific',
        owner: '조 레이콥',
        colors: { primary: '#1D428A', secondary: '#FFC72C', text: '#FFFFFF' }
    },
    'hou': {
        id: 'hou', city: '휴스턴', name: '로케츠', conference: 'West', division: 'Southwest',
        owner: '틸먼 페르티타',
        colors: { primary: '#CE1141', secondary: '#000000', text: '#FFFFFF' }
    },
    'ind': {
        id: 'ind', city: '인디애나', name: '페이서스', conference: 'East', division: 'Central',
        owner: '허브 사이먼',
        colors: { primary: '#002D62', secondary: '#FDBB30', text: '#FFFFFF' }
    },
    'lac': {
        id: 'lac', city: 'LA', name: '클리퍼스', conference: 'West', division: 'Pacific',
        owner: '스티브 발머',
        colors: { primary: '#C8102E', secondary: '#1D428A', text: '#FFFFFF' }
    },
    'lal': {
        id: 'lal', city: 'LA', name: '레이커스', conference: 'West', division: 'Pacific',
        owner: '지니 버스',
        colors: { primary: '#552583', secondary: '#FDB927', text: '#FFC72C' }
    },
    'mem': {
        id: 'mem', city: '멤피스', name: '그리즈리스', conference: 'West', division: 'Southwest',
        owner: '로버트 페라',
        colors: { primary: '#5D76A9', secondary: '#12173F', text: '#FFFFFF' }
    },
    'mia': {
        id: 'mia', city: '마이애미', name: '히트', conference: 'East', division: 'Southeast',
        owner: '미키 애리슨',
        colors: { primary: '#98002E', secondary: '#F9A01B', text: '#FFFFFF' }
    },
    'mil': {
        id: 'mil', city: '밀워키', name: '벅스', conference: 'East', division: 'Central',
        owner: '웨스 에든스',
        colors: { primary: '#00471B', secondary: '#EEE1C6', text: '#FFFFFF' }
    },
    'min': {
        id: 'min', city: '미네소타', name: '팀버울브스', conference: 'West', division: 'Northwest',
        owner: '글렌 테일러',
        colors: { primary: '#0C2340', secondary: '#236192', text: '#FFFFFF' }
    },
    'nop': {
        id: 'nop', city: '뉴올리언스', name: '펠리컨스', conference: 'West', division: 'Southwest',
        owner: '게일 벤슨',
        colors: { primary: '#0C2340', secondary: '#C8102E', text: '#FFFFFF' }
    },
    'nyk': {
        id: 'nyk', city: '뉴욕', name: '닉스', conference: 'East', division: 'Atlantic',
        owner: '제임스 돌란',
        colors: { primary: '#006BB6', secondary: '#F58426', text: '#FFFFFF' }
    },
    'okc': {
        id: 'okc', city: '오클라호마시티', name: '썬더', conference: 'West', division: 'Northwest',
        owner: '클레이 베넷',
        colors: { primary: '#007AC1', secondary: '#EF3B24', text: '#FFFFFF' }
    },
    'orl': {
        id: 'orl', city: '올랜도', name: '매직', conference: 'East', division: 'Southeast',
        owner: '댄 디보스',
        colors: { primary: '#0077C0', secondary: '#C4CED4', text: '#FFFFFF' }
    },
    'phi': {
        id: 'phi', city: '필라델피아', name: '세븐티식서스', conference: 'East', division: 'Atlantic',
        owner: '조쉬 해리스',
        colors: { primary: '#006BB6', secondary: '#ED174C', text: '#FFFFFF' }
    },
    'phx': {
        id: 'phx', city: '피닉스', name: '선즈', conference: 'West', division: 'Pacific',
        owner: '맷 이시비아',
        colors: { primary: '#1D1160', secondary: '#E56020', text: '#FFFFFF' }
    },
    'por': {
        id: 'por', city: '포틀랜드', name: '트레일 블레이저스', conference: 'West', division: 'Northwest',
        owner: '조디 앨런',
        colors: { primary: '#E03A3E', secondary: '#000000', text: '#FFFFFF' }
    },
    'sac': {
        id: 'sac', city: '새크라멘토', name: '킹스', conference: 'West', division: 'Pacific',
        owner: '비벡 라나디베',
        colors: { primary: '#5A2D81', secondary: '#63727A', text: '#FFFFFF' }
    },
    'sas': {
        id: 'sas', city: '샌안토니오', name: '스퍼스', conference: 'West', division: 'Southwest',
        owner: '피터 J. 홀트',
        colors: { primary: '#000000', secondary: '#C4CED4', text: '#FFFFFF' }
    },
    'tor': {
        id: 'tor', city: '토론토', name: '랩터스', conference: 'East', division: 'Atlantic',
        owner: '래리 타넨바움',
        colors: { primary: '#CE1141', secondary: '#000000', text: '#FFFFFF' }
    },
    'uta': {
        id: 'uta', city: '유타', name: '재즈', conference: 'West', division: 'Northwest',
        owner: '라이언 스미스',
        colors: { primary: '#4E008E', secondary: '#79A3DC', text: '#FFFFFF' }
    },
    'was': {
        id: 'was', city: '워싱턴', name: '위저즈', conference: 'East', division: 'Southeast',
        owner: '테드 레온시스',
        colors: { primary: '#002B5C', secondary: '#E31837', text: '#FFFFFF' }
    }
};

export const getTeamColor = (id: string, type: 'primary' | 'secondary' = 'primary') => {
    const team = TEAM_DATA[id];
    return team ? team.colors[type] : '#000000';
};

export const getAllTeamsList = () => Object.values(TEAM_DATA);
