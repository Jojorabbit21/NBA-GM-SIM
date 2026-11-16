
/**
 * powerRankingCategories.ts — 파워랭킹 부문 정의(공격 4 + 수비 4). 런타임 의존성 없음.
 * 서버 미러: server/src/shared/multi/powerRankingCategories.ts — 부문을 바꿀 땐 반드시 양쪽 다 같이 고칠 것.
 * 계산(powerRanking.ts)과 뉴스 페이로드 파서·표(leagueEventPayload.ts / newsFeedCards.tsx)가 같이 쓴다 —
 * 파서가 powerRanking.ts(OVR 엔진·게임 설정까지 끌고 옴)를 임포트하지 않도록 따로 뺐다.
 */
import type { ArchetypeModuleScores } from '../../types/archetype';

// [2026-11-16] 파워랭킹 부문 — 공격 4 + 수비 4. 종합 점수(powerScore)는 이 8개 부문의 리그 내
// 순위만으로 정해진다(예전 "재능"·"포지션 밸런스" 항목 폐지 — dev-log 2026-11-16).
// 부문 값 = 로테이션 가중 팀 평균 모듈 점수(모듈이 둘이면 그 평균).
// 11개 모듈 중 offballAttack(슈팅·샷 창출과 팀 단위 상관 0.7)과 motorAvailability(체력·내구성 —
// 공수 어느 쪽도 아님)는 부문에 넣지 않는다.
export type PowerCategoryKey =
    | 'shooting' | 'shotCreation' | 'inside' | 'playmaking'
    | 'perimeterDefense' | 'teamDefense' | 'rimProtection' | 'rebounding';

export interface PowerCategory {
    key: PowerCategoryKey;
    side: 'offense' | 'defense';
    /** 표 헤더 라벨 — "공격"/"수비" 그룹 헤더 아래에 놓인다 */
    label: string;
    modules: (keyof ArchetypeModuleScores)[];
}

export const POWER_CATEGORIES: PowerCategory[] = [
    { key: 'shooting', side: 'offense', label: '슈팅', modules: ['spotUpShooting'] },
    { key: 'shotCreation', side: 'offense', label: '샷 창출', modules: ['shotCreation'] },
    { key: 'inside', side: 'offense', label: '골밑', modules: ['rimFinishing', 'postCraft'] },
    { key: 'playmaking', side: 'offense', label: '패스', modules: ['playmaking'] },
    { key: 'perimeterDefense', side: 'defense', label: '외곽', modules: ['poaDefense'] },
    { key: 'teamDefense', side: 'defense', label: '팀 수비', modules: ['teamDefense'] },
    { key: 'rimProtection', side: 'defense', label: '림 보호', modules: ['rimProtection'] },
    { key: 'rebounding', side: 'defense', label: '리바운드', modules: ['rebounding'] },
];
