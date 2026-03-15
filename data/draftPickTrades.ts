
import { DraftPickAsset } from '../types/draftAssets';

/**
 * 실제 NBA 드래프트 픽 거래 현황 (2025-26 시즌 개막 시점 기준)
 * 2025년 10월 이전에 성사된 거래만 포함. 시즌 중 트레이드는 제외.
 *
 * Sources:
 * - RealGM NBA Future Draft Picks (basketball.realgm.com)
 * - Hoops Rumors Traded First/Second-Round Picks (2025, 2026)
 * - ESPN NBA Draft Asset Rankings
 * - Fanspo/Tankathon/Spotrac draft pick trackers
 *
 * 팀 ID 매핑:
 * law = LA Clippers, lam = LA Lakers, nyk = NY Knicks, no = New Orleans, sa = San Antonio
 *
 * 주요 거래 출처:
 * - KD 트레이드 (2023): BKN ↔ PHX — NYK 픽 의무 계승
 * - Westbrook 트레이드 (2023): UTA → LAM 픽 보유
 * - Dejounte Murray 트레이드 (2022.06): SA ↔ ATL — ATL 픽 + 스왑
 * - Damian Lillard 트레이드 (2023.09): POR ↔ MIL — MIL 스왑 + 픽
 * - Bradley Beal 트레이드 (2023.06): WAS ↔ PHX — PHX 스왑 + 픽
 * - Desmond Bane 트레이드 (2025.06): ORL ↔ MEM — ORL 픽 대량 이동
 * - Luka Doncic 트레이드 (2025.02): DAL ↔ LAM — LAM 2029 1st
 * - MPJ 트레이드 (2025.07): DEN ↔ BKN — DEN 2032 1st
 * - De'Andre Hunter 트레이드 (2025.02): ATL ↔ CLE — CLE 스왑
 * - Rob Dillingham 트레이드 (2024.06): SA ↔ MIN — MIN 스왑 + 픽
 */

/** 거래된 1라운드 픽 목록 — originalTeamId의 픽이 currentTeamId로 이동 */
export const TRADED_FIRST_ROUND_PICKS: Omit<DraftPickAsset, 'round'>[] & { round: 1 }[] = [
    // ──────────────── 2026 Draft ────────────────
    // OKC: 리그 최다 픽 보유
    { season: 2026, round: 1, originalTeamId: 'law', currentTeamId: 'okc', protection: { type: 'none' } },
    { season: 2026, round: 1, originalTeamId: 'phi', currentTeamId: 'okc', protection: { type: 'top', threshold: 4, fallbackSeason: 2027, fallbackRound: 1 } },
    { season: 2026, round: 1, originalTeamId: 'hou', currentTeamId: 'okc', protection: { type: 'top', threshold: 4, fallbackRound: 2 } },
    { season: 2026, round: 1, originalTeamId: 'uta', currentTeamId: 'okc', protection: { type: 'top', threshold: 8 } },
    // CHI: Portland 픽 획득
    { season: 2026, round: 1, originalTeamId: 'por', currentTeamId: 'chi', protection: { type: 'top', threshold: 14, fallbackSeason: 2027, fallbackRound: 1 } },
    // NYK: Washington 픽 획득
    { season: 2026, round: 1, originalTeamId: 'was', currentTeamId: 'nyk', protection: { type: 'top', threshold: 8 } },
    // LAW (Clippers): Indiana 픽 획득
    { season: 2026, round: 1, originalTeamId: 'ind', currentTeamId: 'law', protection: { type: 'top', threshold: 4, fallbackSeason: 2031, fallbackRound: 1 } },
    // ATL: New Orleans 픽 보유
    { season: 2026, round: 1, originalTeamId: 'no', currentTeamId: 'atl', protection: { type: 'none' } },
    // MEM: Orlando 픽 보유 (Desmond Bane 트레이드, 2025.06)
    { season: 2026, round: 1, originalTeamId: 'orl', currentTeamId: 'mem', protection: { type: 'none' } },

    // ──────────────── 2027 Draft ────────────────
    // BKN: Knicks 픽 보유 (KD 트레이드 후유증)
    { season: 2027, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },
    // UTA: Lakers 픽 보유 (Westbrook 트레이드)
    { season: 2027, round: 1, originalTeamId: 'lam', currentTeamId: 'uta', protection: { type: 'top', threshold: 4 } },
    // HOU: Phoenix 픽 보유
    { season: 2027, round: 1, originalTeamId: 'phx', currentTeamId: 'hou', protection: { type: 'none' } },
    // SA: Atlanta 픽 보유 (Dejounte Murray 트레이드, 2022.06)
    { season: 2027, round: 1, originalTeamId: 'atl', currentTeamId: 'sa', protection: { type: 'none' } },
    // SAC: San Antonio 픽 보유 (top-16 보호)
    { season: 2027, round: 1, originalTeamId: 'sa', currentTeamId: 'sac', protection: { type: 'top', threshold: 16 } },
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
    // POR: Orlando 픽 보유 (MEM 경유 — Bane 트레이드 → 드래프트나이트 재거래, 2025.06)
    { season: 2028, round: 1, originalTeamId: 'orl', currentTeamId: 'por', protection: { type: 'none' } },

    // ──────────────── 2029 Draft ────────────────
    // BKN: Knicks 픽 보유
    { season: 2029, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },
    // DAL: Lakers 픽 보유 (Luka Doncic 트레이드, 2025.02)
    { season: 2029, round: 1, originalTeamId: 'lam', currentTeamId: 'dal', protection: { type: 'none' } },

    // ──────────────── 2030 Draft ────────────────
    // WAS: Golden State 픽 보유
    { season: 2030, round: 1, originalTeamId: 'gs', currentTeamId: 'was', protection: { type: 'top', threshold: 20 } },
    // MEM: Orlando 픽 보유 (Desmond Bane 트레이드, 2025.06)
    { season: 2030, round: 1, originalTeamId: 'orl', currentTeamId: 'mem', protection: { type: 'none' } },

    // ──────────────── 2031 Draft ────────────────
    // BKN: Knicks 픽 보유
    { season: 2031, round: 1, originalTeamId: 'nyk', currentTeamId: 'bkn', protection: { type: 'none' } },
    // UTA: Phoenix 픽 보유
    { season: 2031, round: 1, originalTeamId: 'phx', currentTeamId: 'uta', protection: { type: 'none' } },
    // SAC: Minnesota 픽 보유
    { season: 2031, round: 1, originalTeamId: 'min', currentTeamId: 'sac', protection: { type: 'none' } },

    // ──────────────── 2032 Draft ────────────────
    // BKN: Denver 픽 보유 (MPJ 트레이드, 2025.07)
    { season: 2032, round: 1, originalTeamId: 'den', currentTeamId: 'bkn', protection: { type: 'none' } },
];

/**
 * 거래된 2라운드 픽 목록 (2026 시즌 기준, 2025.10 이전 거래)
 *
 * 2라운드 픽은 조건부 번들(다수 팀 간 최유리 픽 배분)이 많아,
 * primary destination(가장 유력한 목적지) 기준으로 단순화.
 * 2027 이후 2라운드는 정보 부족으로 각 팀 자기 픽 유지로 처리.
 */
export const TRADED_SECOND_ROUND_PICKS: Omit<DraftPickAsset, 'round'>[] & { round: 2 }[] = [
    // ──────────────── 2026 Draft (2nd Round) ────────────────
    // 직접 거래 (단순 1:1)
    { season: 2026, round: 2, originalTeamId: 'chi', currentTeamId: 'hou', protection: { type: 'none' } },
    { season: 2026, round: 2, originalTeamId: 'cle', currentTeamId: 'law', protection: { type: 'none' } },
    { season: 2026, round: 2, originalTeamId: 'lam', currentTeamId: 'gs', protection: { type: 'none' } },
    { season: 2026, round: 2, originalTeamId: 'phx', currentTeamId: 'dal', protection: { type: 'none' } },
    // 조건부 거래 (primary destination 기준)
    { season: 2026, round: 2, originalTeamId: 'ind', currentTeamId: 'mem', protection: { type: 'none' } },     // Bundle A
    { season: 2026, round: 2, originalTeamId: 'uta', currentTeamId: 'sa', protection: { type: 'none' } },      // picks 31-55 → SA
    { season: 2026, round: 2, originalTeamId: 'no', currentTeamId: 'chi', protection: { type: 'none' } },      // Bundle B: CHI 최유리
    { season: 2026, round: 2, originalTeamId: 'dal', currentTeamId: 'okc', protection: { type: 'none' } },     // OKC 스왑 (PHI/DAL 중 유리)
    { season: 2026, round: 2, originalTeamId: 'mem', currentTeamId: 'law', protection: { type: 'none' } },     // picks 31-42 → LAW
    { season: 2026, round: 2, originalTeamId: 'mil', currentTeamId: 'bos', protection: { type: 'none' } },     // DET/MIL bundle
    { season: 2026, round: 2, originalTeamId: 'por', currentTeamId: 'sa', protection: { type: 'none' } },      // Bundle B
    { season: 2026, round: 2, originalTeamId: 'gs', currentTeamId: 'mia', protection: { type: 'none' } },      // GS → MIA
    { season: 2026, round: 2, originalTeamId: 'cha', currentTeamId: 'sac', protection: { type: 'none' } },     // picks 31-55 → SAC
    { season: 2026, round: 2, originalTeamId: 'law', currentTeamId: 'bkn', protection: { type: 'none' } },     // Bundle A
    { season: 2026, round: 2, originalTeamId: 'atl', currentTeamId: 'den', protection: { type: 'none' } },     // Bundle A
    { season: 2026, round: 2, originalTeamId: 'phi', currentTeamId: 'phx', protection: { type: 'none' } },     // OKC/PHI/DAL 스왑 → PHX 2번째
    { season: 2026, round: 2, originalTeamId: 'mia', currentTeamId: 'sa', protection: { type: 'none' } },      // Bundle A
    { season: 2026, round: 2, originalTeamId: 'den', currentTeamId: 'chi', protection: { type: 'none' } },     // DEN → CHI
    { season: 2026, round: 2, originalTeamId: 'min', currentTeamId: 'was', protection: { type: 'none' } },     // MIN → WAS
    { season: 2026, round: 2, originalTeamId: 'bos', currentTeamId: 'atl', protection: { type: 'none' } },     // Bundle A
    { season: 2026, round: 2, originalTeamId: 'det', currentTeamId: 'no', protection: { type: 'none' } },      // DET/MIL bundle
    { season: 2026, round: 2, originalTeamId: 'sa', currentTeamId: 'min', protection: { type: 'none' } },      // Bundle A
    { season: 2026, round: 2, originalTeamId: 'okc', currentTeamId: 'was', protection: { type: 'none' } },     // OKC → WAS (최비유리)
];

/** 스왑 권리 목록 — beneficiaryTeamId가 originTeamId와 픽 교환 권리 보유 */
export const SWAP_RIGHTS: {
    season: number;
    round: 1;
    beneficiaryTeamId: string;
    originTeamId: string;
}[] = [
    // ──── 2026 ────
    { season: 2026, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'atl' },     // Spurs ↔ Hawks (Murray 트레이드, 2022.06)
    { season: 2026, round: 1, beneficiaryTeamId: 'atl', originTeamId: 'cle' },    // Hawks ↔ Cavaliers (Hunter 트레이드, 2025.02)
    // ──── 2027 ────
    { season: 2027, round: 1, beneficiaryTeamId: 'okc', originTeamId: 'law' },    // Thunder ↔ Clippers
    { season: 2027, round: 1, beneficiaryTeamId: 'hou', originTeamId: 'bkn' },    // Rockets ↔ Nets
    { season: 2027, round: 1, beneficiaryTeamId: 'no', originTeamId: 'mil' },     // Pelicans ↔ Bucks
    // ──── 2028 ────
    { season: 2028, round: 1, beneficiaryTeamId: 'okc', originTeamId: 'dal' },    // Thunder ↔ Mavericks
    { season: 2028, round: 1, beneficiaryTeamId: 'uta', originTeamId: 'cle' },    // Jazz ↔ Cavaliers
    { season: 2028, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'bos' },     // Spurs ↔ Celtics (top-1 protected)
    { season: 2028, round: 1, beneficiaryTeamId: 'was', originTeamId: 'mil' },    // Wizards ↔ Bucks (Beal 트레이드)
    { season: 2028, round: 1, beneficiaryTeamId: 'por', originTeamId: 'mil' },    // Blazers ↔ Bucks (Lillard 트레이드, 2023.09)
    // ──── 2029 ────
    { season: 2029, round: 1, beneficiaryTeamId: 'law', originTeamId: 'phi' },    // Clippers ↔ 76ers (top-3 protected)
    { season: 2029, round: 1, beneficiaryTeamId: 'mem', originTeamId: 'orl' },    // Grizzlies ↔ Magic (Bane 트레이드, 2025.06)
    { season: 2029, round: 1, beneficiaryTeamId: 'hou', originTeamId: 'dal' },    // Rockets ↔ Mavericks (HOU/DAL/PHX 3팀 근사)
    // ──── 2030 ────
    { season: 2030, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'dal' },     // Spurs ↔ Mavericks (top-1 protected)
    { season: 2030, round: 1, beneficiaryTeamId: 'mem', originTeamId: 'phx' },    // Grizzlies ↔ Suns
    { season: 2030, round: 1, beneficiaryTeamId: 'por', originTeamId: 'mil' },    // Blazers ↔ Bucks (Lillard 트레이드, 2023.09)
    { season: 2030, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'min' },     // Spurs ↔ Wolves (Dillingham 트레이드, 2024.06)
    { season: 2030, round: 1, beneficiaryTeamId: 'was', originTeamId: 'phx' },    // Wizards ↔ Suns (Beal 트레이드, 2023.06)
    // ──── 2031 ────
    { season: 2031, round: 1, beneficiaryTeamId: 'sa', originTeamId: 'sac' },     // Spurs ↔ Kings
];
