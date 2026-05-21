
export interface VirtualTeamTemplate {
    team_slug:       string;
    team_name:       string;
    team_abbr:       string;
    city:            string;
    color_primary:   string;
    color_secondary: string;
    conference:      'East' | 'West';
}

/** 30팀 외에 토너먼트(32/64팀 등)에서 사용하는 가상 AI 팀 34개 */
export const VIRTUAL_TEAMS: VirtualTeamTemplate[] = [
    { team_slug: 'sea', team_name: '시애틀 에메랄즈',         team_abbr: 'SEA', city: '시애틀',       color_primary: '#006241', color_secondary: '#C8A84B', conference: 'West' },
    { team_slug: 'lvp', team_name: '라스베이거스 팬텀스',     team_abbr: 'LVP', city: '라스베이거스', color_primary: '#5B2D8E', color_secondary: '#C0C0C0', conference: 'West' },
    { team_slug: 'bal', team_name: '볼티모어 타이즈',         team_abbr: 'BAL', city: '볼티모어',     color_primary: '#1B2A4A', color_secondary: '#D4321E', conference: 'East' },
    { team_slug: 'kcf', team_name: '캔자스시티 포지',         team_abbr: 'KCF', city: '캔자스시티',   color_primary: '#003087', color_secondary: '#FFC72C', conference: 'West' },
    { team_slug: 'lou', team_name: '루이빌 서러브레즈',       team_abbr: 'LOU', city: '루이빌',       color_primary: '#A4122A', color_secondary: '#C0C0C0', conference: 'East' },
    { team_slug: 'pit', team_name: '피츠버그 스틸',           team_abbr: 'PIT', city: '피츠버그',     color_primary: '#101820', color_secondary: '#EEB111', conference: 'East' },
    { team_slug: 'nas', team_name: '내슈빌 사운드',           team_abbr: 'NAS', city: '내슈빌',       color_primary: '#041C2C', color_secondary: '#EAAA00', conference: 'East' },
    { team_slug: 'aus', team_name: '오스틴 베놈',             team_abbr: 'AUS', city: '오스틴',       color_primary: '#BF5700', color_secondary: '#333F48', conference: 'West' },
    { team_slug: 'tam', team_name: '탬파 서지',               team_abbr: 'TAM', city: '탬파',         color_primary: '#0047AB', color_secondary: '#FFD700', conference: 'East' },
    { team_slug: 'clv', team_name: '콜럼버스 밸러',           team_abbr: 'CLV', city: '콜럼버스',     color_primary: '#BB0000', color_secondary: '#4A4A4A', conference: 'East' },
    { team_slug: 'jax', team_name: '잭슨빌 퓨리',             team_abbr: 'JAX', city: '잭슨빌',       color_primary: '#00686B', color_secondary: '#101820', conference: 'East' },
    { team_slug: 'ral', team_name: '롤리 스톰',               team_abbr: 'RAL', city: '롤리',         color_primary: '#76232F', color_secondary: '#101820', conference: 'East' },
    { team_slug: 'cin', team_name: '신시내티 리버호크스',     team_abbr: 'CIN', city: '신시내티',     color_primary: '#C6011F', color_secondary: '#003087', conference: 'East' },
    { team_slug: 'stl', team_name: '세인트루이스 아치',       team_abbr: 'STL', city: '세인트루이스', color_primary: '#C41E3A', color_secondary: '#00235B', conference: 'West' },
    { team_slug: 'sds', team_name: '샌디에이고 솔',           team_abbr: 'SDS', city: '샌디에이고',   color_primary: '#00205B', color_secondary: '#D4A017', conference: 'West' },
    { team_slug: 'buf', team_name: '버팔로 블리자드',         team_abbr: 'BUF', city: '버팔로',       color_primary: '#003087', color_secondary: '#E8E8E8', conference: 'East' },
    { team_slug: 'abq', team_name: '앨버커키 듄스',           team_abbr: 'ABQ', city: '앨버커키',     color_primary: '#006B6B', color_secondary: '#E8602C', conference: 'West' },
    { team_slug: 'tuc', team_name: '투손 스코피언스',         team_abbr: 'TUC', city: '투손',         color_primary: '#D45500', color_secondary: '#3D1F00', conference: 'West' },
    { team_slug: 'elp', team_name: '엘패소 바케로스',         team_abbr: 'ELP', city: '엘패소',       color_primary: '#0D1B4B', color_secondary: '#E8610A', conference: 'West' },
    { team_slug: 'tul', team_name: '털사 러프넥스',           team_abbr: 'TUL', city: '털사',         color_primary: '#101820', color_secondary: '#C8A84B', conference: 'West' },
    { team_slug: 'oma', team_name: '오마하 바이슨',           team_abbr: 'OMA', city: '오마하',       color_primary: '#00235B', color_secondary: '#CC2222', conference: 'West' },
    { team_slug: 'dsm', team_name: '디모인 호크스',           team_abbr: 'DSM', city: '디모인',       color_primary: '#1B5E20', color_secondary: '#C8A84B', conference: 'West' },
    { team_slug: 'boi', team_name: '보이시 팀버',             team_abbr: 'BOI', city: '보이시',       color_primary: '#1A3C28', color_secondary: '#8B5E3C', conference: 'West' },
    { team_slug: 'ric', team_name: '리치먼드 로열스',         team_abbr: 'RIC', city: '리치먼드',     color_primary: '#4A0E82', color_secondary: '#D4AF37', conference: 'East' },
    { team_slug: 'har', team_name: '하트퍼드 차터',           team_abbr: 'HAR', city: '하트퍼드',     color_primary: '#002147', color_secondary: '#E8610A', conference: 'East' },
    { team_slug: 'pro', team_name: '프로비던스 앵커스',       team_abbr: 'PRO', city: '프로비던스',   color_primary: '#1A4A1A', color_secondary: '#9E9E9E', conference: 'East' },
    { team_slug: 'bir', team_name: '버밍엄 아이언',           team_abbr: 'BIR', city: '버밍엄',       color_primary: '#3A5F8A', color_secondary: '#E8610A', conference: 'East' },
    { team_slug: 'lrk', team_name: '리틀록 레전즈',           team_abbr: 'LRK', city: '리틀록',       color_primary: '#880000', color_secondary: '#1A1A6E', conference: 'West' },
    { team_slug: 'knx', team_name: '녹스빌 헬벤더스',         team_abbr: 'KNX', city: '녹스빌',       color_primary: '#FF6600', color_secondary: '#101820', conference: 'East' },
    { team_slug: 'lex', team_name: '렉싱턴 센티넬스',         team_abbr: 'LEX', city: '렉싱턴',       color_primary: '#00235B', color_secondary: '#B8A050', conference: 'East' },
    { team_slug: 'spo', team_name: '스포케인 쇼크',           team_abbr: 'SPO', city: '스포케인',     color_primary: '#CC0000', color_secondary: '#101820', conference: 'West' },
    { team_slug: 'anc', team_name: '앵커리지 오로라',         team_abbr: 'ANC', city: '앵커리지',     color_primary: '#1B2F5A', color_secondary: '#00BCD4', conference: 'West' },
    { team_slug: 'hon', team_name: '호놀룰루 웨이브스',       team_abbr: 'HON', city: '호놀룰루',     color_primary: '#005F6B', color_secondary: '#D4A017', conference: 'West' },
    { team_slug: 'vir', team_name: '버지니아비치 브레이커스', team_abbr: 'VIR', city: '버지니아비치', color_primary: '#003087', color_secondary: '#00BCD4', conference: 'East' },
];
