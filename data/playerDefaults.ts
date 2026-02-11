
import { PlayerTendencies } from '../types';

/**
 * NBA 2025-26 시즌 LA 레이커스 선수들의 현실적인 플레이 성향 데이터
 */
export const LAKERS_DEFAULTS: Record<string, PlayerTendencies> = {
    '르브론 제임스': {
        lateral_bias: 2,
        zones: { ra: 40, itp: 20, mid: 15, cnr: 5, p45: 5, atb: 15 }
    },
    '앤서니 데이비스': {
        lateral_bias: 2,
        zones: { ra: 55, itp: 30, mid: 10, cnr: 0, p45: 2, atb: 3 }
    },
    '디앤젤로 러셀': {
        lateral_bias: 1, // 왼손잡이
        zones: { ra: 15, itp: 10, mid: 25, cnr: 5, p45: 15, atb: 30 }
    },
    '오스틴 리브스': {
        lateral_bias: 2,
        zones: { ra: 30, itp: 25, mid: 15, cnr: 10, p45: 10, atb: 10 }
    },
    '루이 하치무라': {
        lateral_bias: 2,
        zones: { ra: 30, itp: 10, mid: 35, cnr: 20, p45: 5, atb: 0 }
    },
    '달튼 크넥트': {
        lateral_bias: 2,
        zones: { ra: 20, itp: 5, mid: 10, cnr: 20, p45: 25, atb: 20 }
    },
    '잭슨 헤이즈': {
        lateral_bias: 2,
        zones: { ra: 90, itp: 10, mid: 0, cnr: 0, p45: 0, atb: 0 }
    },
    '게이브 빈센트': {
        lateral_bias: 2,
        zones: { ra: 20, itp: 10, mid: 10, cnr: 15, p45: 20, atb: 25 }
    },
    '재러드 반더빌트': {
        lateral_bias: 2,
        zones: { ra: 75, itp: 5, mid: 0, cnr: 20, p45: 0, atb: 0 }
    },
    '크리스티안 우드': {
        lateral_bias: 2,
        zones: { ra: 40, itp: 10, mid: 5, cnr: 5, p45: 10, atb: 30 }
    },
    '캠 레디쉬': {
        lateral_bias: 2,
        zones: { ra: 40, itp: 10, mid: 10, cnr: 25, p45: 10, atb: 5 }
    },
    '맥스 크리스티': {
        lateral_bias: 2,
        zones: { ra: 25, itp: 10, mid: 15, cnr: 25, p45: 15, atb: 10 }
    }
};
