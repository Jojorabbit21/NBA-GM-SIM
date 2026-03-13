
import { TeamFinanceStaticData } from '../types/finance';

/**
 * 30팀 재정 정적 데이터
 *
 * 데이터 출처:
 * - 구단주 순자산: Forbes / 1075 The Fan (2025)
 * - 경기장 좌석수: NBA.com / Wikipedia
 * - 광역 인구: U.S. Census Bureau / Hoop-Social market rankings
 * - 입장료: StageFront / Sportscasting (2024-25 시즌 평균)
 * - 로컬 미디어/스폰서: Sportico / SponsorUnited 추정치
 *
 * 구단주 성향 (spendingWillingness 등)은 실제 구단 행보 기반 수치화
 */
export const TEAM_FINANCE_DATA: Record<string, TeamFinanceStaticData> = {
    // ── EASTERN CONFERENCE ──

    // Atlantic Division
    'bos': {
        ownerProfile: {
            name: '빅터 G.',
            netWorth: 5.0,
            spendingWillingness: 8,
            winNowPriority: 9,
            marketingFocus: 7,
            patience: 4,
        },
        market: {
            metroPopulation: 490,
            marketTier: 1,
            arenaCapacity: 19156,
            arenaName: 'Harbor Garden',
            baseTicketPrice: 95,
            localMediaDeal: 60_000_000,
            sponsorshipBase: 75_000_000,
        },
    },
    'bkn': {
        ownerProfile: {
            name: '제이슨 C.',
            netWorth: 13.7,
            spendingWillingness: 7,
            winNowPriority: 6,
            marketingFocus: 8,
            patience: 5,
        },
        market: {
            metroPopulation: 1910,
            marketTier: 1,
            arenaCapacity: 17732,
            arenaName: 'Atlantic Center',
            baseTicketPrice: 70,
            localMediaDeal: 55_000_000,
            sponsorshipBase: 70_000_000,
        },
    },
    'nyk': {
        ownerProfile: {
            name: '제임스 D.',
            netWorth: 2.5,
            spendingWillingness: 7,
            winNowPriority: 8,
            marketingFocus: 9,
            patience: 3,
        },
        market: {
            metroPopulation: 1910,
            marketTier: 1,
            arenaCapacity: 19812,
            arenaName: 'Empire Arena',
            baseTicketPrice: 150,
            localMediaDeal: 100_000_000,
            sponsorshipBase: 120_000_000,
        },
    },
    'phi': {
        ownerProfile: {
            name: '조시 H.',
            netWorth: 10.7,
            spendingWillingness: 7,
            winNowPriority: 8,
            marketingFocus: 7,
            patience: 4,
        },
        market: {
            metroPopulation: 620,
            marketTier: 1,
            arenaCapacity: 20478,
            arenaName: 'Liberty Bell Arena',
            baseTicketPrice: 65,
            localMediaDeal: 50_000_000,
            sponsorshipBase: 55_000_000,
        },
    },
    'tor': {
        ownerProfile: {
            name: '래리 T.',
            netWorth: 32.0,
            spendingWillingness: 6,
            winNowPriority: 6,
            marketingFocus: 7,
            patience: 6,
        },
        market: {
            metroPopulation: 620,
            marketTier: 2,
            arenaCapacity: 19800,
            arenaName: 'Maple Leaf Arena',
            baseTicketPrice: 75,
            localMediaDeal: 45_000_000,
            sponsorshipBase: 55_000_000,
        },
    },

    // Central Division
    'chi': {
        ownerProfile: {
            name: '마이클 R.',
            netWorth: 1.7,
            spendingWillingness: 4,
            winNowPriority: 4,
            marketingFocus: 7,
            patience: 7,
        },
        market: {
            metroPopulation: 940,
            marketTier: 1,
            arenaCapacity: 20917,
            arenaName: 'Lakeshore Center',
            baseTicketPrice: 55,
            localMediaDeal: 50_000_000,
            sponsorshipBase: 60_000_000,
        },
    },
    'cle': {
        ownerProfile: {
            name: '대니얼 G.',
            netWorth: 26.7,
            spendingWillingness: 8,
            winNowPriority: 8,
            marketingFocus: 6,
            patience: 4,
        },
        market: {
            metroPopulation: 210,
            marketTier: 3,
            arenaCapacity: 19432,
            arenaName: 'Ironworks FieldHouse',
            baseTicketPrice: 45,
            localMediaDeal: 30_000_000,
            sponsorshipBase: 35_000_000,
        },
    },
    'det': {
        ownerProfile: {
            name: '토마스 G.',
            netWorth: 6.0,
            spendingWillingness: 5,
            winNowPriority: 5,
            marketingFocus: 6,
            patience: 6,
        },
        market: {
            metroPopulation: 440,
            marketTier: 2,
            arenaCapacity: 20332,
            arenaName: 'Motor City Arena',
            baseTicketPrice: 35,
            localMediaDeal: 35_000_000,
            sponsorshipBase: 35_000_000,
        },
    },
    'ind': {
        ownerProfile: {
            name: '허버트 S.',
            netWorth: 15.9,
            spendingWillingness: 5,
            winNowPriority: 6,
            marketingFocus: 5,
            patience: 6,
        },
        market: {
            metroPopulation: 210,
            marketTier: 3,
            arenaCapacity: 18165,
            arenaName: 'Crossroads Fieldhouse',
            baseTicketPrice: 40,
            localMediaDeal: 25_000_000,
            sponsorshipBase: 28_000_000,
        },
    },
    'mil': {
        ownerProfile: {
            name: '웨슬리 E.',
            netWorth: 10.8,
            spendingWillingness: 7,
            winNowPriority: 8,
            marketingFocus: 6,
            patience: 4,
        },
        market: {
            metroPopulation: 160,
            marketTier: 4,
            arenaCapacity: 17341,
            arenaName: 'Brewery Forum',
            baseTicketPrice: 55,
            localMediaDeal: 22_000_000,
            sponsorshipBase: 30_000_000,
        },
    },

    // Southeast Division
    'atl': {
        ownerProfile: {
            name: '앤서니 R.',
            netWorth: 13.4,
            spendingWillingness: 5,
            winNowPriority: 5,
            marketingFocus: 7,
            patience: 6,
        },
        market: {
            metroPopulation: 610,
            marketTier: 2,
            arenaCapacity: 17500,
            arenaName: 'Peachtree Arena',
            baseTicketPrice: 40,
            localMediaDeal: 40_000_000,
            sponsorshipBase: 45_000_000,
        },
    },
    'cha': {
        ownerProfile: {
            name: '리처드 S.',
            netWorth: 2.0,
            spendingWillingness: 4,
            winNowPriority: 4,
            marketingFocus: 5,
            patience: 7,
        },
        market: {
            metroPopulation: 270,
            marketTier: 3,
            arenaCapacity: 19077,
            arenaName: 'Queen City Center',
            baseTicketPrice: 28,
            localMediaDeal: 25_000_000,
            sponsorshipBase: 25_000_000,
        },
    },
    'mia': {
        ownerProfile: {
            name: '미키 A.',
            netWorth: 6.2,
            spendingWillingness: 6,
            winNowPriority: 7,
            marketingFocus: 8,
            patience: 5,
        },
        market: {
            metroPopulation: 630,
            marketTier: 2,
            arenaCapacity: 19600,
            arenaName: 'Biscayne Center',
            baseTicketPrice: 75,
            localMediaDeal: 40_000_000,
            sponsorshipBase: 55_000_000,
        },
    },
    'orl': {
        ownerProfile: {
            name: '대니얼 D.',
            netWorth: 5.1,
            spendingWillingness: 5,
            winNowPriority: 6,
            marketingFocus: 5,
            patience: 7,
        },
        market: {
            metroPopulation: 270,
            marketTier: 3,
            arenaCapacity: 18846,
            arenaName: 'Sunshine Center',
            baseTicketPrice: 38,
            localMediaDeal: 30_000_000,
            sponsorshipBase: 30_000_000,
        },
    },
    'was': {
        ownerProfile: {
            name: '테드 L.',
            netWorth: 2.0,
            spendingWillingness: 4,
            winNowPriority: 4,
            marketingFocus: 6,
            patience: 7,
        },
        market: {
            metroPopulation: 640,
            marketTier: 2,
            arenaCapacity: 20356,
            arenaName: 'Monument Arena',
            baseTicketPrice: 30,
            localMediaDeal: 40_000_000,
            sponsorshipBase: 40_000_000,
        },
    },

    // ── WESTERN CONFERENCE ──

    // Northwest Division
    'den': {
        ownerProfile: {
            name: '스탠리 K.',
            netWorth: 21.3,
            spendingWillingness: 5,
            winNowPriority: 7,
            marketingFocus: 5,
            patience: 6,
        },
        market: {
            metroPopulation: 300,
            marketTier: 2,
            arenaCapacity: 19520,
            arenaName: 'Mile High Arena',
            baseTicketPrice: 55,
            localMediaDeal: 30_000_000,
            sponsorshipBase: 35_000_000,
        },
    },
    'min': {
        ownerProfile: {
            name: '글렌 T.',
            netWorth: 7.15,
            spendingWillingness: 6,
            winNowPriority: 7,
            marketingFocus: 5,
            patience: 5,
        },
        market: {
            metroPopulation: 370,
            marketTier: 2,
            arenaCapacity: 18798,
            arenaName: 'North Star Center',
            baseTicketPrice: 50,
            localMediaDeal: 30_000_000,
            sponsorshipBase: 32_000_000,
        },
    },
    'okc': {
        ownerProfile: {
            name: '클레이턴 B.',
            netWorth: 0.4,
            spendingWillingness: 6,
            winNowPriority: 7,
            marketingFocus: 5,
            patience: 8,
        },
        market: {
            metroPopulation: 140,
            marketTier: 4,
            arenaCapacity: 18203,
            arenaName: 'Prairie Center',
            baseTicketPrice: 50,
            localMediaDeal: 18_000_000,
            sponsorshipBase: 22_000_000,
        },
    },
    'por': {
        ownerProfile: {
            name: '조디 A.',
            netWorth: 20.3,
            spendingWillingness: 5,
            winNowPriority: 4,
            marketingFocus: 5,
            patience: 8,
        },
        market: {
            metroPopulation: 250,
            marketTier: 3,
            arenaCapacity: 19393,
            arenaName: 'Rose Garden Arena',
            baseTicketPrice: 28,
            localMediaDeal: 25_000_000,
            sponsorshipBase: 25_000_000,
        },
    },
    'uta': {
        ownerProfile: {
            name: '라이언 S.',
            netWorth: 1.67,
            spendingWillingness: 6,
            winNowPriority: 5,
            marketingFocus: 6,
            patience: 7,
        },
        market: {
            metroPopulation: 130,
            marketTier: 4,
            arenaCapacity: 18306,
            arenaName: 'Salt Lake Arena',
            baseTicketPrice: 30,
            localMediaDeal: 20_000_000,
            sponsorshipBase: 22_000_000,
        },
    },

    // Pacific Division
    'gs': {
        ownerProfile: {
            name: '조셉 L.',
            netWorth: 2.6,
            spendingWillingness: 8,
            winNowPriority: 8,
            marketingFocus: 9,
            patience: 3,
        },
        market: {
            metroPopulation: 470,
            marketTier: 1,
            arenaCapacity: 18064,
            arenaName: 'Golden Gate Arena',
            baseTicketPrice: 120,
            localMediaDeal: 70_000_000,
            sponsorshipBase: 100_000_000,
        },
    },
    'law': {
        ownerProfile: {
            name: '스티븐 B.',
            netWorth: 155.8,
            spendingWillingness: 10,
            winNowPriority: 9,
            marketingFocus: 8,
            patience: 3,
        },
        market: {
            metroPopulation: 1290,
            marketTier: 1,
            arenaCapacity: 18000,
            arenaName: 'Pacific Dome',
            baseTicketPrice: 85,
            localMediaDeal: 55_000_000,
            sponsorshipBase: 80_000_000,
        },
    },
    'lam': {
        ownerProfile: {
            name: '지나 B.',
            netWorth: 5.9,
            spendingWillingness: 7,
            winNowPriority: 7,
            marketingFocus: 9,
            patience: 4,
        },
        market: {
            metroPopulation: 1290,
            marketTier: 1,
            arenaCapacity: 19067,
            arenaName: 'Sunset Arena',
            baseTicketPrice: 120,
            localMediaDeal: 150_000_000,
            sponsorshipBase: 110_000_000,
        },
    },
    'phx': {
        ownerProfile: {
            name: '매튜 I.',
            netWorth: 9.8,
            spendingWillingness: 9,
            winNowPriority: 9,
            marketingFocus: 7,
            patience: 2,
        },
        market: {
            metroPopulation: 510,
            marketTier: 2,
            arenaCapacity: 18055,
            arenaName: 'Desert Center',
            baseTicketPrice: 65,
            localMediaDeal: 35_000_000,
            sponsorshipBase: 45_000_000,
        },
    },
    'sac': {
        ownerProfile: {
            name: '비벡 R.',
            netWorth: 0.7,
            spendingWillingness: 6,
            winNowPriority: 7,
            marketingFocus: 6,
            patience: 5,
        },
        market: {
            metroPopulation: 250,
            marketTier: 3,
            arenaCapacity: 17608,
            arenaName: 'Capitol Center',
            baseTicketPrice: 45,
            localMediaDeal: 25_000_000,
            sponsorshipBase: 28_000_000,
        },
    },

    // Southwest Division
    'dal': {
        ownerProfile: {
            name: '미리엄 A.',
            netWorth: 39.9,
            spendingWillingness: 8,
            winNowPriority: 8,
            marketingFocus: 7,
            patience: 4,
        },
        market: {
            metroPopulation: 790,
            marketTier: 1,
            arenaCapacity: 19200,
            arenaName: 'Lone Star Center',
            baseTicketPrice: 65,
            localMediaDeal: 45_000_000,
            sponsorshipBase: 55_000_000,
        },
    },
    'hou': {
        ownerProfile: {
            name: '틸먼 F.',
            netWorth: 10.5,
            spendingWillingness: 5,
            winNowPriority: 6,
            marketingFocus: 7,
            patience: 5,
        },
        market: {
            metroPopulation: 720,
            marketTier: 2,
            arenaCapacity: 18055,
            arenaName: 'Space City Center',
            baseTicketPrice: 35,
            localMediaDeal: 40_000_000,
            sponsorshipBase: 45_000_000,
        },
    },
    'mem': {
        ownerProfile: {
            name: '로버트 P.',
            netWorth: 29.6,
            spendingWillingness: 6,
            winNowPriority: 7,
            marketingFocus: 4,
            patience: 6,
        },
        market: {
            metroPopulation: 140,
            marketTier: 4,
            arenaCapacity: 18119,
            arenaName: 'Bluff City Forum',
            baseTicketPrice: 30,
            localMediaDeal: 15_000_000,
            sponsorshipBase: 18_000_000,
        },
    },
    'no': {
        ownerProfile: {
            name: '게일 B.',
            netWorth: 4.7,
            spendingWillingness: 5,
            winNowPriority: 5,
            marketingFocus: 4,
            patience: 6,
        },
        market: {
            metroPopulation: 130,
            marketTier: 4,
            arenaCapacity: 16867,
            arenaName: 'Crescent Center',
            baseTicketPrice: 28,
            localMediaDeal: 15_000_000,
            sponsorshipBase: 18_000_000,
        },
    },
    'sa': {
        ownerProfile: {
            name: '피터 H.',
            netWorth: 0.2,
            spendingWillingness: 5,
            winNowPriority: 5,
            marketingFocus: 5,
            patience: 8,
        },
        market: {
            metroPopulation: 260,
            marketTier: 3,
            arenaCapacity: 18418,
            arenaName: 'Alamo Center',
            baseTicketPrice: 40,
            localMediaDeal: 20_000_000,
            sponsorshipBase: 25_000_000,
        },
    },
};
