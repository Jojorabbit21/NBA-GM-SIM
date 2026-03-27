
import { TeamFinanceStaticData } from '../types/finance';

export let TEAM_FINANCE_DATA: Record<string, TeamFinanceStaticData> = {};

/** meta_teams DB 데이터로 TEAM_FINANCE_DATA 교체 */
export function populateFinanceData(rows: any[]): void {
    for (const row of rows) {
        const attrs = typeof row.base_attributes === 'string'
            ? JSON.parse(row.base_attributes) : (row.base_attributes || {});
        if (attrs.ownerProfile && attrs.market) {
            TEAM_FINANCE_DATA[row.id] = {
                ownerProfile: attrs.ownerProfile,
                market: attrs.market,
            };
        }
    }
}
