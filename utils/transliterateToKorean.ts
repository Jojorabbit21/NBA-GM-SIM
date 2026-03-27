/**
 * 영어 이름 → 한국어 음역 (e.g. "James" → "제임스", "Dave Joerger" → "데이브 조어거")
 *
 * - 이름(first name): 사전 우선
 * - 성(last name) + 사전 미등재 단어: 패턴 기반 음역
 */

// ── 이름(First name) 사전 ──────────────────────────────────────────────────
const FIRST_NAME_KO: Record<string, string> = {
    aaron: '에런', adam: '아담', alan: '앨런', alex: '알렉스',
    andy: '앤디', antonio: '안토니오',
    barry: '배리', ben: '벤', bill: '빌', billy: '빌리',
    bob: '밥', bobby: '바비', brad: '브래드', brandon: '브랜든',
    brian: '브라이언', bruce: '브루스', bryan: '브라이언',
    carlos: '카를로스', chad: '채드', charles: '찰스',
    chris: '크리스', chuck: '척', clay: '클레이', cole: '콜',
    craig: '크레이그', curt: '커트',
    dan: '댄', daniel: '다니엘', dave: '데이브', david: '데이비드',
    dean: '딘', dennis: '데니스', derek: '데릭', doc: '닥',
    don: '돈', donald: '도널드', doug: '더그', drew: '드류',
    dwane: '드웨인', dwayne: '드웨인',
    ed: '에드', edward: '에드워드', eric: '에릭', erik: '에릭',
    frank: '프랭크', fred: '프레드',
    gary: '게리', george: '조지', gerald: '제럴드',
    glen: '글렌', glenn: '글렌', gordon: '고든', greg: '그렉',
    jack: '잭', jake: '제이크', james: '제임스',
    jason: '제이슨', jay: '제이', jeff: '제프', jeffrey: '제프리',
    jerry: '제리', jim: '짐', jimmy: '지미',
    joe: '조', john: '존', jon: '존',
    jonathan: '조나단', jordan: '조던', joseph: '조셉',
    josh: '조쉬', joshua: '조슈아', justin: '저스틴',
    keith: '키스', kelly: '켈리', ken: '켄', kenny: '케니',
    kevin: '케빈',
    larry: '래리', lee: '리', lloyd: '로이드', luke: '루크',
    mark: '마크', martin: '마틴', matt: '매트', matthew: '매튜',
    michael: '마이클', mike: '마이크',
    nate: '네이트', nick: '닉',
    pat: '팻', patrick: '패트릭', paul: '폴', peter: '피터',
    phil: '필',
    randy: '랜디', ray: '레이', raymond: '레이먼드', rex: '렉스',
    richard: '리처드', rick: '릭', rob: '롭', robert: '로버트',
    ron: '론', ryan: '라이언',
    sam: '샘', scott: '스콧', sean: '숀', shane: '셰인', shawn: '션',
    stan: '스탠', steve: '스티브', steven: '스티브', suki: '수키',
    taylor: '테일러', terry: '테리', thomas: '토마스',
    tim: '팀', timothy: '티모시', todd: '토드', tom: '톰', tony: '토니',
    travis: '트래비스', tyler: '타일러',
    victor: '빅터', vincent: '빈센트',
    wade: '웨이드', walter: '월터', wayne: '웨인',
    will: '윌', william: '윌리엄',
};

// ── 패턴 기반 음역 (longer patterns first) ────────────────────────────────
// [영어 패턴, 한국어 음역]
const PATTERNS: [string, string][] = [
    // 3-char
    ['igh', '아이'], ['sch', '스'], ['tch', '치'],
    // 2-char consonant digraphs
    ['ch', '치'], ['sh', '시'], ['ph', '프'], ['th', '스'],
    ['wh', '화'], ['ck', '크'], ['qu', '쿠'], ['gh', ''],
    ['ng', '응'], ['rr', '르'], ['ll', '르'], ['ss', '스'],
    ['tt', '트'], ['nn', '느'], ['ff', '프'], ['bb', '브'], ['mm', '므'],
    // 2-char vowel combos
    ['oo', '우'], ['ee', '이'], ['ea', '이'], ['ai', '에이'],
    ['ay', '에이'], ['oi', '오이'], ['oa', '오'], ['ou', '우'],
    ['ow', '오우'], ['au', '오'], ['aw', '오'], ['ie', '이'],
    ['ei', '에이'], ['ue', '우'], ['ew', '유'], ['oe', '오'],
    // Vowel + r (영어 r 탈락 발음 처리)
    ['er', '어'], ['ar', '아'], ['or', '오'], ['ir', '어'], ['ur', '어'],
    // Vowel + nasal (음절 닫힘)
    ['an', '안'], ['en', '언'], ['in', '인'], ['on', '온'], ['un', '언'],
    ['am', '암'], ['em', '엠'], ['im', '임'], ['om', '옴'], ['um', '엄'],
    ['al', '알'], ['el', '엘'], ['il', '일'], ['ol', '올'], ['ul', '울'],
    // Single vowels
    ['a', '아'], ['e', '에'], ['i', '이'], ['o', '오'], ['u', '우'],
    ['y', '이'],
    // Single consonants (default vowel ㅡ 붙임)
    ['b', '브'], ['c', '크'], ['d', '드'], ['f', '프'], ['g', '그'],
    ['h', '흐'], ['j', '지'], ['k', '크'], ['l', '르'], ['m', '므'],
    ['n', '느'], ['p', '프'], ['q', '크'], ['r', '르'], ['s', '스'],
    ['t', '트'], ['v', '브'], ['w', '와'], ['x', '크스'], ['z', '즈'],
];

function phoneticWord(word: string): string {
    let s = word.toLowerCase().replace(/[^a-z]/g, '');
    let result = '';
    while (s.length > 0) {
        let matched = false;
        for (const [pat, ko] of PATTERNS) {
            if (s.startsWith(pat)) {
                result += ko;
                s = s.slice(pat.length);
                matched = true;
                break;
            }
        }
        if (!matched) s = s.slice(1);
    }
    return result;
}

/**
 * 영어 이름을 한국어 음역으로 변환.
 * 첫 번째 토큰(이름)은 사전 우선, 이후 토큰(성)은 패턴 기반.
 */
export function transliterateToKorean(name: string): string {
    const words = name.trim().split(/\s+/);
    return words.map((word, idx) => {
        const lower = word.toLowerCase();
        if (idx === 0 && FIRST_NAME_KO[lower]) return FIRST_NAME_KO[lower];
        return phoneticWord(word) || word; // 변환 실패 시 원본 유지
    }).join(' ');
}
