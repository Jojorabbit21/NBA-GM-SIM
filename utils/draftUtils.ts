/**
 * 드래프트 유틸리티
 */

/** 스네이크 드래프트 순서 생성: 짝수 라운드는 정순, 홀수 라운드는 역순 */
export function generateSnakeDraftOrder(teamIds: string[], rounds: number): string[] {
    const order: string[] = [];
    for (let r = 0; r < rounds; r++) {
        const ids = r % 2 === 0 ? [...teamIds] : [...teamIds].reverse();
        order.push(...ids);
    }
    return order;
}
