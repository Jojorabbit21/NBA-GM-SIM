
// 이 파일은 실제 NBA 선수들의 초기 부상 정보를 관리합니다.
// 로스터 초기화 시 이 데이터를 기반으로 부상 상태를 설정합니다.

// 사용자가 직접 수정한 내용이니 이후 변경 금지.
export const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {
    '제이슨 테이텀': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    '타이리스 할리버튼': { type: '아킬레스건 파열', returnDate: '2026-06-30' },
    '토리안 프린스': { type: '목 수술', returnDate: '2026-06-15' },
    '스쿳 헨더슨': { type: '햄스트링 긴장', returnDate: '2025-11-05' },
    '브래들리 빌': { type: '좌둔근 파열', returnDate: '2026-06-30' },
    '카이리 어빙': { type: '전방십자인대 파열', returnDate: '2026-06-30' },
    '데릭 라이블리 2세': { type: '우측 발바닥 수술', returnDate: '2026-02-15' },
    '잭 이디': { type: '발목인대 파열', returnDate: '2026-02-15' },
    '스카티 피펜 Jr.': { type: '발가락 골절', returnDate: '2026-02-04' },
    '브랜든 클라크': { type: '종아리 염좌', returnDate: '2026-03-01' },
    '타이 제롬': { type: '종아리 염좌', returnDate: '2026-02-01' },
    '디존테 머레이': { type: '아킬레스건 파열', returnDate: '2026-01-15' }
};
