
// 이 파일은 실제 NBA 선수들의 초기 부상 정보를 관리합니다.
// 로스터 초기화 시 이 데이터를 기반으로 부상 상태를 설정합니다.

// [Fix] 영문/한글 이름 모두 매핑되도록 키 추가 (DB 데이터가 영문일 경우 대비)
// ** 주의 : 아래의 키 배열은 사용자가 직접 수정한 내용이므로 절대 추후에 임의로 변경하지 말것!!! **
export const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
    // Korean Keys
    '제이슨 테이텀': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    '타이리스 할리버튼': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    '토린 프린스': { type: '목 수술', returnDate: '2026-06-15' },
    '스쿳 헨더슨': { type: '햄스트링 긴장', returnDate: '2025-11-05' },
    '브래들리 빌': { type: '좌둔근 파열', returnDate: '2026-06-30' },
    '카이리 어빙': { type: '전방십자인대 파열', returnDate: '2026-06-30' },
    '데렉 라이블리': { type: '우측 발바닥 수술', returnDate: '2026-02-15' },
    '잭 이디': { type: '발목인대 파열', returnDate: '2026-02-15' },
    '스카티 피펜 주니어': { type: '발가락 골절', returnDate: '2026-02-04' },
    '브랜던 클락': { type: '종아리 염좌', returnDate: '2026-03-01' },
    '타이 제롬': { type: '종아리 염좌', returnDate: '2026-02-01' },
    '디존테 머레이': { type: '아킬레스건 파열', returnDate: '2026-01-15' },

    // English Keys (Fallback for Raw DB Data)
    'Jayson Tatum': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    'Tyrese Haliburton': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    'Taurean Prince': { type: '목 수술', returnDate: '2026-06-15' },
    'Scoot Henderson': { type: '햄스트링 긴장', returnDate: '2025-11-05' },
    'Bradley Beal': { type: '좌둔근 파열', returnDate: '2026-06-30' },
    'Kyrie Irving': { type: '전방십자인대 파열', returnDate: '2026-06-30' },
    'Dereck Lively II': { type: '우측 발바닥 수술', returnDate: '2026-02-15' },
    'Zach Edey': { type: '발목인대 파열', returnDate: '2026-02-15' },
    'Scotty Pippen Jr.': { type: '발가락 골절', returnDate: '2026-02-04' },
    'Brandon Clarke': { type: '종아리 염좌', returnDate: '2026-03-01' },
    'Ty Jerome': { type: '종아리 염좌', returnDate: '2026-02-01' },
    'Dejounte Murray': { type: '아킬레스건 파열', returnDate: '2026-01-15' }
};
