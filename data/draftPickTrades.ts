
import { DraftPickAsset } from '../types/draftAssets';

/**
 * 실제 NBA 드래프트 픽 거래 현황 (2025-26 시즌 기준)
 * 게임 시작 시점(2025년 10월)의 리그 전체 1라운드 픽 소유 상태를 반영.
 *
 * Sources:
 * - ESPN NBA Draft Asset Rankings
 * - Hoops Rumors Traded First-Round Picks (2025, 2026)
 * - FanSided team-specific draft pick trackers
 *
 * 팀 ID 매핑:
 * law = LA Clippers, lam = LA Lakers, nyk = NY Knicks, no = New Orleans, sa = San Antonio
 */

/** 거래된 1라운드 픽 목록 — originalTeamId의 픽이 currentTeamId로 이동 */
export const TRADED_FIRST_ROUND_PICKS: Omit<DraftPickAsset, 'round'>[] & { round: 1 }[] = [
    // ──────────────── 2026 Draft ────────────────
    // OKC: 리그 최다 픽 보유
    { season: 2026, round: 1, originalTeamId: 'law', currentTeamId: 'okc', protection: { type: 'none' } },
    { season: 2026, round: 1, originalTeamId: 'phi', currentTeamId: 'okc', protection: { type: 'top', threshold: 4, fallbackSeason: 2027, fallbackRound: 1 } },
    { season: 2026, round: 1, originalTeamId: 'hou', currentTeamId: 'okc', protection: { type: 'top', threshold: 4 } },
    { season: 2026, round: 1, originalTeamId: 'uta', currentTeamId: 'okc', protection: { type: 'top', threshold: 8 } },
    // CHI: Portland 픽 획득
    { season: 2026, round: 1, originalTeamId: 'por', currentTeamId: 'chi', protection: { type: 'top', threshold: 14, fallbackSeason: 2027, fallbackRound: 1 } },
    // NYK: Washington 픽 획득
    { season: 2026, round: 1, originalTeamId: 'was', currentTeamId: 'nyk', protection: { type: 'top', threshold: 8 } },
    // LAW (Clippers): Indiana 픽 획득
    { season: 2026, round: 1, originalTeamId: 'ind', currentTeamId: 'law', protection: { type: 'top', threshold: 4, fallbackSeason: 2031, fallbackRound: 1 } },
    // ATL: New Orleans/Milwaukee 중 유리한 픽
    { season: 2026, round: 1, originalTeamId: 'no', currentTeamId: 'atl', protection: { type: 'none' } },

    // ──────────────── 2027 Draft ────────────────
    // BKN: Knicks 픽 보유 (KD 트레이드 후유증)
    { season: 2027, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },
    // UTA: Lakers 픽 보유 (Westbrook 트레이드)
    { season: 2027, round: 1, originalTeamId: 'lam', currentTeamId: 'uta', protection: { type: 'top', threshold: 4 } },
    // HOU: Phoenix 픽 보유
    { season: 2027, round: 1, originalTeamId: 'phx', currentTeamId: 'hou', protection: { type: 'none' } },
    // SA: Atlanta 픽 보유 (Dejounte Murray 트레이드)
    { season: 2027, round: 1, originalTeamId: 'atl', currentTeamId: 'sa', protection: { type: 'none' } },
    // SAC: San Antonio 픽 보유
    { season: 2027, round: 1, originalTeamId: 'sa', currentTeamId: 'sac', protection: { type: 'none' } },
    // CHA: Dallas & Miami 픽 보유
    { season: 2027, round: 1, originalTeamId: 'dal', currentTeamId: 'cha', protection: { type: 'top', threshold: 2 } },
    { season: 2027, round: 1, originalTeamId: 'mia', currentTeamId: 'cha', protection: { type: 'top', threshold: 14, fallbackSeason: 2028, fallbackRound: 1 } },
    // NO: Milwaukee 픽 보유
    { season: 2027, round: 1, originalTeamId: 'mil', currentTeamId: 'no', protection: { type: 'top', threshold: 4 } },
    // OKC: Denver 픽 보유
    { season: 2027, round: 1, originalTeamId: 'den', currentTeamId: 'okc', protection: { type: 'top', threshold: 5, fallbackSeason: 2028, fallbackRound: 1 } },

    // ──────────────── 2028 Draft ────────────────
    // PHI: Clippers 픽 보유
    { season: 2028, round: 1, originalTeamId: 'law', currentTeamId: 'phi', protection: { type: 'none' } },
    // CHA: Miami 픽 보유 (2027 보호 발동 시 2028 언프로텍티드)
    { season: 2028, round: 1, originalTeamId: 'mia', currentTeamId: 'cha', protection: { type: 'none' } },
    // BKN: Philadelphia 픽 보유
    { season: 2028, round: 1, originalTeamId: 'phi', currentTeamId: 'bkn', protection: { type: 'top', threshold: 8 } },

    // ──────────────── 2029 Draft ────────────────
    // BKN: Knicks 픽 보유
    { season: 2029, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },

    // ──────────────── 2030 Draft ────────────────
    // WAS: Golden State 픽 보유
    { season: 2030, round: 1, originalTeamId: 'gs', currentTeamId: 'was', protection: { type: 'top', threshold: 20 } },

    // ──────────────── 2031 Draft ────────────────
    // BKN: Knicks 픽 보유
    { season: 2031, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },
    // UTA: Phoenix 픽 보유
    { season: 2031, round: 1, originalTeamId: 'phx', currentTeamId: 'uta', protection: { type: 'none' } },
    // SAC: Minnesota 픽 보유
    { season: 2031, round: 1, originalTeamId: 'min', currentTeamId: 'sac', protection: { type: 'none' } },

    // ──────────────── 2032 Draft ────────────────
    // (현재까지 알려진 거래 없음 — 먼 미래)
];

/** 스왑 권리 목록 — beneficiaryTeamId가 originTeamId와 픽 교환 권리 보유 */
export const SWAP_RIGHTS: {
    season: number;
    round: 1;
    beneficiaryTeamId: string;
    originTeamId: string;
}[] = [
    // 2027
    { season: 2027, round: 1, beneficiaryTeamId: 'okc', originTeamId: 'law' },   // Thunder ↔ Clippers
    { season: 2027, round: 1, beneficiaryTeamId: 'hou', originTeamId: 'bkn' },   // Rockets ↔ Nets
    // 2028
    { season: 2028, round: 1, beneficiaryTeamId: 'okc', originTeamId: 'dal' },   // Thunder ↔ Mavericks
    { season: 2028, round: 1, beneficiaryTeamId: 'uta', originTeamId: 'cle' },   // Jazz ↔ Cavaliers
    { season: 2028, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'bos' },    // Spurs ↔ Celtics (top-1 protected)
    { season: 2028, round: 1, beneficiaryTeamId: 'was', originTeamId: 'mil' },   // Wizards ↔ Bucks
    // 2029
    { season: 2029, round: 1, beneficiaryTeamId: 'law', originTeamId: 'phi' },   // Clippers ↔ 76ers (top-3 protected)
    // 2030
    { season: 2030, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'dal' },    // Spurs ↔ Mavericks (top-1 protected)
    { season: 2030, round: 1, beneficiaryTeamId: 'mem', originTeamId: 'phx' },   // Grizzlies ↔ Suns
    // 2031
    { season: 2031, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'sac' },    // Spurs ↔ Kings
];
