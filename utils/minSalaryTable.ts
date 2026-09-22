// YOS(서비스타임)별 미니멈 샐러리 = 해당 시즌 캡 × 비율(%). 실제 NBA CBA 룰북 비율 고정값.
//
// [2026-09-22] utils/constants.ts에서 분리 — constants.ts는 ovrUtils → gameConfigService →
// supabaseClient 체인을 끌고 와서 서버(server/src)가 import하면 클라이언트용 Supabase 싱글턴이
// 초기화되는 부작용이 있다. 미니멈 테이블은 순수 데이터라 의존 없는 이 파일에 두고,
// constants.ts는 기존 import 호환을 위해 재export만 한다.
//
// 이 표가 최저연봉의 유일한 소스다. 예전엔 services/fa/faValuation.ts의 calcYOSBounds()와
// faMarketBuilder.ts의 복제본이 각각 3단계 절대금액 사다리(1.5M/2.2M/3.0M)를 따로 들고 있어
// 설정 화면·협상 화면(이 표)과 FA 요구액 하한·RFA 판정(사다리)이 서로 다른 최저연봉을 썼다.
export const MIN_SALARY_YOS_TABLE: { label: string; capPct: number }[] = [
    { label: '0 YOS',   capPct: 0.82 },
    { label: '1 YOS',   capPct: 1.32 },
    { label: '2 YOS',   capPct: 1.48 },
    { label: '3 YOS',   capPct: 1.54 },
    { label: '4 YOS',   capPct: 1.59 },
    { label: '5 YOS',   capPct: 1.73 },
    { label: '6 YOS',   capPct: 1.86 },
    { label: '7 YOS',   capPct: 1.99 },
    { label: '8 YOS',   capPct: 2.13 },
    { label: '9 YOS',   capPct: 2.14 },
    { label: '10+ YOS', capPct: 2.35 },
];

/** 해당 캡·연차의 미니멈 샐러리(달러, 반올림). yos는 0~10+로 클램프. */
export function minSalaryForYos(yos: number, salaryCap: number): number {
    const idx = Math.max(0, Math.min(MIN_SALARY_YOS_TABLE.length - 1, Math.floor(yos)));
    return Math.round(salaryCap * MIN_SALARY_YOS_TABLE[idx].capPct / 100);
}
