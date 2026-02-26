
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
        id: 'atl', city: '애틀랜타', name: '파이어버드', conference: 'East', division: 'Southeast',
        owner: '앤서니 R.',
        colors: { primary: '#C8102E', secondary: '#FDB927', text: '#FFFFFF' }
    },
    'bos': {
        id: 'bos', city: '보스턴', name: '세이지', conference: 'East', division: 'Atlantic',
        owner: '빅터 G.',
        colors: { primary: '#007A33', secondary: '#BA9653', text: '#FFFFFF' }
    },
    'bkn': {
        id: 'bkn', city: '브루클린', name: '나이츠', conference: 'East', division: 'Atlantic',
        owner: '제이슨 C.',
        colors: { primary: '#000000', secondary: '#FFFFFF', text: '#FFFFFF' }
    },
    'cha': {
        id: 'cha', city: '샬럿', name: '스팅어스', conference: 'East', division: 'Southeast',
        owner: '리처드 S.',
        colors: { primary: '#00788C', secondary: '#1D1160', text: '#FFFFFF' }
    },
    'chi': {
        id: 'chi', city: '시카고', name: '차저스', conference: 'East', division: 'Central',
        owner: '마이클 R.',
        colors: { primary: '#BA0C2F', secondary: '#000000', text: '#FFFFFF' }
    },
    'cle': {
        id: 'cle', city: '클리블랜드', name: '랜서스', conference: 'East', division: 'Central',
        owner: '대니얼 G.',
        colors: { primary: '#6F263D', secondary: '#B9975B', text: '#FFFFFF' }
    },
    'dal': {
        id: 'dal', city: '댈러스', name: '머스탱', conference: 'West', division: 'Southwest',
        owner: '미리엄 A.',
        colors: { primary: '#0050B5', secondary: '#9EA2A2', text: '#FFFFFF' }
    },
    'den': {
        id: 'den', city: '덴버', name: '시프터스', conference: 'West', division: 'Northwest',
        owner: '스탠리 K.',
        colors: { primary: '#0E2240', secondary: '#8B2131', text: '#FEC524' }
    },
    'det': {
        id: 'det', city: '디트로이트', name: '스탈리온스', conference: 'East', division: 'Central',
        owner: '토마스 G.',
        colors: { primary: '#C8102E', secondary: '#1D42BA', text: '#FFFFFF' }
    },
    'gs': {
        id: 'gs', city: '골든스테이트', name: '뱅가즈', conference: 'West', division: 'Pacific',
        owner: '조셉 L.',
        colors: { primary: '#1D428A', secondary: '#FFC72C', text: '#FFFFFF' }
    },
    'hou': {
        id: 'hou', city: '휴스턴', name: '이글스', conference: 'West', division: 'Southwest',
        owner: '틸먼 F.',
        colors: { primary: '#CE1141', secondary: '#000000', text: '#FFFFFF' }
    },
    'ind': {
        id: 'ind', city: '인디애나', name: '레이서스', conference: 'East', division: 'Central',
        owner: '허버트 S.',
        colors: { primary: '#0C2340', secondary: '#FFCD00', text: '#FFFFFF' }
    },
    'la2': {
        id: 'la2', city: 'LA', name: '와일드캣', conference: 'West', division: 'Pacific',
        owner: '스티븐 B.',
        colors: { primary: '#C8102E', secondary: '#0C2340', text: '#FFFFFF' }
    },
    'la1': {
        id: 'la1', city: 'LA', name: '레전드', conference: 'West', division: 'Pacific',
        owner: '지나 B.',
        colors: { primary: '#552583', secondary: '#FDB927', text: '#FFC72C' }
    },
    'mem': {
        id: 'mem', city: '멤피스', name: '코디악스', conference: 'West', division: 'Southwest',
        owner: '로버트 P.',
        colors: { primary: '#5D76A9', secondary: '#12173F', text: '#FFFFFF' }
    },
    'mia': {
        id: 'mia', city: '마이애미', name: '블레이즈', conference: 'East', division: 'Southeast',
        owner: '미키 A.',
        colors: { primary: '#98002E', secondary: '#F9A01B', text: '#FFFFFF' }
    },
    'mil': {
        id: 'mil', city: '밀워키', name: '스태그', conference: 'East', division: 'Central',
        owner: '웨슬리 E.',
        colors: { primary: '#00471B', secondary: '#EEE1C6', text: '#FFFFFF' }
    },
    'min': {
        id: 'min', city: '미네소타', name: '프로스트울브스', conference: 'West', division: 'Northwest',
        owner: '글렌 T.',
        colors: { primary: '#0C2340', secondary: '#236192', text: '#FFFFFF' }
    },
    'no': {
        id: 'no', city: '뉴올리언스', name: '헤론스', conference: 'West', division: 'Southwest',
        owner: '게일 B.',
        colors: { primary: '#0C2340', secondary: '#B9975B', text: '#FFFFFF' }
    },
    'nyk': {
        id: 'nyk', city: '뉴욕', name: '엠파이어', conference: 'East', division: 'Atlantic',
        owner: '제임스 D.',
        colors: { primary: '#006BB6', secondary: '#F58426', text: '#FFFFFF' }
    },
    'okc': {
        id: 'okc', city: '오클라호마시티', name: '볼트', conference: 'West', division: 'Northwest',
        owner: '클레이턴 B.',
        colors: { primary: '#0072CE', secondary: '#F9423A', text: '#FFFFFF' }
    },
    'orl': {
        id: 'orl', city: '올랜도', name: '미스틱스', conference: 'East', division: 'Southeast',
        owner: '대니얼 D.',
        colors: { primary: '#0050B5', secondary: '#9EA2A2', text: '#FFFFFF' }
    },
    'phi': {
        id: 'phi', city: '필라델피아', name: '리버티', conference: 'East', division: 'Atlantic',
        owner: '조시 H.',
        colors: { primary: '#1D4289', secondary: '#C8102E', text: '#FFFFFF' }
    },
    'phx': {
        id: 'phx', city: '피닉스', name: '카이요티스', conference: 'West', division: 'Pacific',
        owner: '매튜 I.',
        colors: { primary: '#1D1160', secondary: '#E56020', text: '#FFFFFF' }
    },
    'por': {
        id: 'por', city: '포틀랜드', name: '파이오니어스', conference: 'West', division: 'Northwest',
        owner: '조디 A.',
        colors: { primary: '#C8102E', secondary: '#010101', text: '#FFFFFF' }
    },
    'sac': {
        id: 'sac', city: '새크라멘토', name: '모나크스', conference: 'West', division: 'Pacific',
        owner: '비벡 R.',
        colors: { primary: '#5A2D81', secondary: '#63727A', text: '#FFFFFF' }
    },
    'sa': {
        id: 'sa', city: '샌안토니오', name: '아웃로스', conference: 'West', division: 'Southwest',
        owner: '피터 H.',
        colors: { primary: '#000000', secondary: '#C4CED4', text: '#FFFFFF' }
    },
    'tor': {
        id: 'tor', city: '토론토', name: '노스가드', conference: 'East', division: 'Atlantic',
        owner: '래리 T.',
        colors: { primary: '#BA0C2F', secondary: '#000000', text: '#FFFFFF' }
    },
    'uta': {
        id: 'uta', city: '유타', name: '하이랜더스', conference: 'West', division: 'Northwest',
        owner: '라이언 S.',
        colors: { primary: '#4E008E', secondary: '#79A3DC', text: '#FFFFFF' }
    },
    'was': {
        id: 'was', city: '워싱턴', name: '아케인스', conference: 'East', division: 'Southeast',
        owner: '테드 L.',
        colors: { primary: '#002B5C', secondary: '#E31837', text: '#FFFFFF' }
    }
};

export const getTeamColor = (id: string, type: 'primary' | 'secondary' = 'primary') => {
    const team = TEAM_DATA[id];
    return team ? team.colors[type] : '#000000';
};

export const getAllTeamsList = () => Object.values(TEAM_DATA);
