
import { Team, GameTactics, OffenseTactic, DefenseTactic, DepthChart, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

/**
 * AI 팀 및 사용자 자동 설정을 위한 전술 생성기
 * [v1.1 Update] 단순 스탯 비교가 아닌, 선발 라인업의 구성과 '적합도 점수(Suitability Score)'를 기반으로 6가지 전술 중 최적을 선택함.
 */
export const generateAutoTactics = (team: Team): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // 1. 뎁스 차트 구성 로직 (기존 유지)
    const depthChart: DepthChart = {
        PG: [null, null, null],
        SG: [null, null, null],
        SF: [null, null, null],
        PF: [null, null, null],
        C:  [null, null, null]
    };

    const usedIds = new Set<string>();
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    // 주전(1순위) 및 벤치(2순위) 선발
    for (let depth = 0; depth <= 1; depth++) {
        for (const pos of positions) {
            const candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
            if (candidate) {
                depthChart[pos][depth] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                const fallback = sortedRoster.find(p => !usedIds.has(p.id));
                if (fallback) {
                    depthChart[pos][depth] = fallback.id;
                    usedIds.add(fallback.id);
                }
            }
        }
    }

    // 써드 멤버(3순위) 선발
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

    // 2. 로테이션 맵 구성 (기존 유지)
    const rotationMap: Record<string, boolean[]> = {};
    sortedRoster.forEach(p => {
        rotationMap[p.id] = Array(48).fill(false);
    });

    for (const pos of positions) {
        const starterId = depthChart[pos][0];
        const benchId = depthChart[pos][1];

        if (starterId && rotationMap[starterId]) {
            const sMap = rotationMap[starterId];
            for (let i = 0; i < 12; i++) sMap[i] = true;
            for (let i = 24; i < 36; i++) sMap[i] = true;
            for (let i = 18; i < 24; i++) sMap[i] = true;
            for (let i = 42; i < 48; i++) sMap[i] = true;
        }

        if (benchId && rotationMap[benchId]) {
            const bMap = rotationMap[benchId];
            for (let i = 12; i < 18; i++) bMap[i] = true;
            for (let i = 36; i < 42; i++) bMap[i] = true;
        }
    }

    // -------------------------------------------------------------------------
    // 3. 고도화된 전술 선택 알고리즘 (Scoring System)
    // -------------------------------------------------------------------------
    
    // 선발 라인업 추출 (ID -> Player Object)
    const startersList = positions.map(pos => {
        const pid = depthChart[pos][0];
        return team.roster.find(p => p.id === pid);
    }).filter(p => p !== undefined) as Player[];

    // 데이터가 부족하면 기본값 반환
    if (startersList.length < 5) {
        return {
            offenseTactics: ['Balance'],
            defenseTactics: ['ManToManPerimeter'],
            sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2 },
            starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
            minutesLimits: {}, rotationMap, depthChart
        };
    }

    // --- A. 그룹별 핵심 지표 산출 ---
    const guards = startersList.filter(p => p.position.includes('G'));
    const bigs = startersList.filter(p => ['PF', 'C'].includes(p.position));

    // 팀 평균 3점슛 (코너, 45도, 탑 평균)
    const team3ptAvg = startersList.reduce((sum, p) => sum + (p.threeCorner + p.three45 + p.threeTop)/3, 0) / 5;
    
    // 팀 평균 속도
    const teamSpeedAvg = startersList.reduce((sum, p) => sum + p.speed, 0) / 5;
    
    // 팀 평균 수비력
    const teamDefAvg = startersList.reduce((sum, p) => sum + p.def, 0) / 5;

    // 최고의 볼 핸들러 창출 능력 (미첼, 돈치치 등) -> Handling + ShotIQ + MidRange
    const maxGuardCreation = guards.length > 0 
        ? Math.max(...guards.map(g => g.handling * 0.4 + g.shotIq * 0.3 + g.midRange * 0.3))
        : 0;

    // 최고의 빅맨 파괴력 (엠비드, 요키치, 야니스 등) -> Inside + Post + Strength
    const maxPostPower = bigs.length > 0
        ? Math.max(...bigs.map(b => b.ins * 0.4 + b.postPlay * 0.4 + b.strength * 0.2))
        : 0;
    
    // 빅맨 기동성 (야니스 vs 엠비드 구분을 위함)
    const bigmanSpeed = bigs.length > 0
        ? bigs.reduce((sum, b) => sum + b.speed, 0) / bigs.length
        : 50;


    // --- B. 전술별 적합도 점수 계산 ---
    const scores: Record<OffenseTactic, number> = {
        'Balance': 60,        // 기본 점수
        'PaceAndSpace': 0,
        'PerimeterFocus': 0,
        'PostFocus': 0,
        'Grind': 0,
        'SevenSeconds': 0
    };

    // 1. Pace & Space: 슈팅과 스페이싱 중시
    // 조건: 팀 3점이 높고, 빅맨도 슛이 있으면 유리
    scores['PaceAndSpace'] = (team3ptAvg * 1.5) + (startersList.filter(p => (p.threeTop + p.three45)/2 > 80).length * 5);
    
    // 2. Seven Seconds: 속도와 3점 중시
    // 조건: 팀이 빠르고 슛이 좋음. 빅맨이 빠르면(야니스) 유리함
    scores['SevenSeconds'] = (teamSpeedAvg * 1.2) + (team3ptAvg * 0.8) + (bigmanSpeed > 75 ? 10 : 0);

    // 3. Perimeter Focus: 가드 중심
    // 조건: 가드 에이스의 능력치가 빅맨보다 높거나 압도적일 때 (미첼 케이스 해결)
    scores['PerimeterFocus'] = (maxGuardCreation * 1.8) + (team3ptAvg * 0.5);
    // 가드가 빅맨보다 훨씬 강하면 추가 가산점
    if (maxGuardCreation > maxPostPower + 5) scores['PerimeterFocus'] += 15;

    // 4. Post Focus: 빅맨 중심
    // 조건: 정통 빅맨이 강력할 때. 단, 너무 빠르면(야니스) 7초나 밸런스로 유도
    scores['PostFocus'] = (maxPostPower * 1.8) - (team3ptAvg * 0.3); // 3점이 너무 좋으면 아까움
    if (bigmanSpeed > 80) scores['PostFocus'] -= 10; // 야니스 같은 달리는 빅맨은 포스트 짱박기 비추

    // 5. Grind: 수비 중심, 느린 템포
    // 조건: 수비가 좋고, 공격력이 애매할 때
    scores['Grind'] = (teamDefAvg * 1.5) + (100 - teamSpeedAvg) * 0.5;

    // 6. Balance: 보정
    // 특정 전술 점수가 너무 낮으면 밸런스로 회귀
    const maxScore = Math.max(...Object.values(scores).filter(s => s !== 60));
    if (maxScore < 75) scores['Balance'] += 20; // 뚜렷한 색깔이 없으면 밸런스 선호


    // --- C. 최종 선택 ---
    let selectedTactic: OffenseTactic = 'Balance';
    let highestScore = -999;

    (Object.keys(scores) as OffenseTactic[]).forEach(t => {
        if (scores[t] > highestScore) {
            highestScore = scores[t];
            selectedTactic = t;
        }
    });

    // --- D. 수비 전술 및 슬라이더 자동 조정 ---
    // 팀 블락 능력이 좋으면 지역방어 선호, 아니면 맨투맨
    const teamBlkAvg = startersList.reduce((sum, p) => sum + p.blk, 0) / 5;
    const defTactic: DefenseTactic = teamBlkAvg > 75 ? 'ZoneDefense' : 'ManToManPerimeter';

    // 전술에 따른 슬라이더 프리셋 매핑
    const sliderPresets: Record<OffenseTactic, any> = {
        'Balance':        { pace: 5, offReb: 5, zone: 3 },
        'PaceAndSpace':   { pace: 7, offReb: 3, zone: 2 },
        'PerimeterFocus': { pace: 5, offReb: 4, zone: 2 },
        'PostFocus':      { pace: 3, offReb: 8, zone: 4 }, // 느리고 리바운드 집중
        'Grind':          { pace: 2, offReb: 6, zone: 5 }, // 매우 느리고 수비 집중
        'SevenSeconds':   { pace: 10, offReb: 4, zone: 1 } // 극도로 빠름
    };

    const preset = sliderPresets[selectedTactic];

    const startersMap = {
        PG: depthChart.PG[0] || '',
        SG: depthChart.SG[0] || '',
        SF: depthChart.SF[0] || '',
        PF: depthChart.PF[0] || '',
        C:  depthChart.C[0] || ''
    };

    return {
        offenseTactics: [selectedTactic],
        defenseTactics: [defTactic],
        sliders: {
            pace: preset.pace,
            offReb: preset.offReb,
            defIntensity: Math.min(10, Math.round(teamDefAvg / 10)), // 수비력에 비례한 강도
            defReb: 5,
            fullCourtPress: teamSpeedAvg > 80 ? 3 : 1, // 빠르면 프레스 빈도 높임
            zoneUsage: preset.zone
        },
        starters: startersMap,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
