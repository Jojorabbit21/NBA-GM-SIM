
import { Team, GameTactics, OffenseTactic, DefenseTactic, DepthChart, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

/**
 * AI 팀 및 사용자 자동 설정을 위한 전술 생성기
 */
export const generateAutoTactics = (team: Team): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // 1. 뎁스 차트 구성 로직
    const depthChart: DepthChart = {
        PG: [null, null, null],
        SG: [null, null, null],
        SF: [null, null, null],
        PF: [null, null, null],
        C:  [null, null, null]
    };

    const usedIds = new Set<string>();
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    // 주전(1순위) 및 벤치(2순위) 선발: 포지션 우선 + 오버롤 순
    for (let depth = 0; depth <= 1; depth++) {
        for (const pos of positions) {
            const candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
            if (candidate) {
                depthChart[pos][depth] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                // 포지션에 맞는 선수가 없으면 남은 선수 중 오버롤 최상위
                const fallback = sortedRoster.find(p => !usedIds.has(p.id));
                if (fallback) {
                    depthChart[pos][depth] = fallback.id;
                    usedIds.add(fallback.id);
                }
            }
        }
    }

    // 써드 멤버(3순위) 선발: 포지션 우선 선발, 없으면 유사(남은 최고 오버롤) 선수
    for (const pos of positions) {
        let candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
        if (!candidate) {
            candidate = sortedRoster.find(p => !usedIds.has(p.id));
        }
        if (candidate) {
            depthChart[pos][2] = candidate.id;
            usedIds.add(candidate.id);
        }
    }

    // 2. 로테이션 맵 구성 로직 (48분 타임라인)
    const rotationMap: Record<string, boolean[]> = {};
    
    // 초기화
    sortedRoster.forEach(p => {
        rotationMap[p.id] = Array(48).fill(false);
    });

    for (const pos of positions) {
        const starterId = depthChart[pos][0];
        const benchId = depthChart[pos][1];

        if (starterId && rotationMap[starterId]) {
            const sMap = rotationMap[starterId];
            // 1쿼터(0-11), 3쿼터(24-35) 전체 출전
            for (let i = 0; i < 12; i++) sMap[i] = true;
            for (let i = 24; i < 36; i++) sMap[i] = true;
            // 2쿼터 후반(18-23), 4쿼터 후반(42-47) 투입
            for (let i = 18; i < 24; i++) sMap[i] = true;
            for (let i = 42; i < 48; i++) sMap[i] = true;
        }

        if (benchId && rotationMap[benchId]) {
            const bMap = rotationMap[benchId];
            // 2쿼터 전반(12-17), 4쿼터 전반(36-41) 투입
            for (let i = 12; i < 18; i++) bMap[i] = true;
            for (let i = 36; i < 42; i++) bMap[i] = true;
        }
    }

    // 3. 나머지 기본 전술 설정
    const top3 = sortedRoster.slice(0, 3);
    let bestTactic: OffenseTactic = 'Balance';
    const avg3pt = top3.reduce((sum, p) => sum + (p.threeCorner + p.three45 + p.threeTop)/3, 0) / (top3.length || 1);
    
    if (avg3pt > 78) bestTactic = 'PaceAndSpace';
    else if (top3.some(p => p.ins > 80)) bestTactic = 'PostFocus';

    const defTactic: DefenseTactic = team.roster.some(p => p.blk > 80) ? 'ZoneDefense' : 'ManToManPerimeter';

    const starters = {
        PG: depthChart.PG[0] || '',
        SG: depthChart.SG[0] || '',
        SF: depthChart.SF[0] || '',
        PF: depthChart.PF[0] || '',
        C:  depthChart.C[0] || ''
    };

    return {
        offenseTactics: [bestTactic],
        defenseTactics: [defTactic],
        sliders: {
            pace: bestTactic === 'PaceAndSpace' ? 7 : 5,
            offReb: 5,
            defIntensity: 5,
            defReb: 5,
            fullCourtPress: 1,
            zoneUsage: defTactic === 'ZoneDefense' ? 7 : 2
        },
        starters,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
