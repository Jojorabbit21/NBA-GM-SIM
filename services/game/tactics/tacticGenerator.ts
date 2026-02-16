
import { Team, GameTactics, OffenseTactic, DefenseTactic, DepthChart, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

/**
 * AI 팀 및 사용자 자동 설정을 위한 전술 생성기 v3.0
 * '엘리트 스탯 임계점(Threshold)' 기반 가산점 로직 적용
 * 모든 전술의 기대 점수 범위를 정규화하여 특정 전술 편중 현상 해결
 */
export const generateAutoTactics = (team: Team): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    // OVR 순으로 정렬하여 기본 로스터 구성
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // 1. 뎁스 차트 자동 구성
    const depthChart: DepthChart = {
        PG: [null, null, null],
        SG: [null, null, null],
        SF: [null, null, null],
        PF: [null, null, null],
        C:  [null, null, null]
    };

    const usedIds = new Set<string>();
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    // 1-1. 주전 및 벤치(1, 2순위) 선발
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

    // 1-2. 써드 멤버(3순위) 선발
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

    // 2. 로테이션 맵 초기화
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
    // 3. 전술 분석 알고리즘 (Tactical Analysis Engine v3.0)
    // -------------------------------------------------------------------------
    
    const starters = positions.map(pos => {
        const pid = depthChart[pos][0];
        return team.roster.find(p => p.id === pid);
    }).filter(p => p !== undefined) as Player[];

    if (starters.length < 5) {
        return {
            offenseTactics: ['Balance'],
            defenseTactics: ['ManToManPerimeter'],
            sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2 },
            starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
            minutesLimits: {}, rotationMap, depthChart
        };
    }

    // --- A. 상세 스탯 집계 ---
    const get3pt = (p: Player) => (p.threeCorner + p.three45 + p.threeTop) / 3;
    const team3ptAvg = starters.reduce((sum, p) => sum + get3pt(p), 0) / 5;
    const bestShooterRating = Math.max(...starters.map(p => get3pt(p)));

    const guards = starters.filter(p => p.position.includes('G'));
    const maxHandle = guards.length ? Math.max(...guards.map(p => p.handling)) : 50;
    const maxPlaymaking = guards.length ? Math.max(...guards.map(p => p.plm)) : 50;

    const bigs = starters.filter(p => ['PF', 'C'].includes(p.position));
    const maxPost = bigs.length ? Math.max(...bigs.map(p => p.postPlay)) : 50;
    const maxInside = bigs.length ? Math.max(...bigs.map(p => p.ins)) : 50;
    
    // Stretch Big 존재 여부
    const center = starters.find(p => p.position === 'C');
    const isStretchFive = center ? get3pt(center) >= 78 : false; // 기준 상향 (75 -> 78)

    // 피지컬 & 수비
    const teamSpeed = starters.reduce((sum, p) => sum + p.speed, 0) / 5;
    const teamStamina = starters.reduce((sum, p) => sum + p.stamina, 0) / 5;
    const teamStr = starters.reduce((sum, p) => sum + p.strength, 0) / 5;
    const teamDef = starters.reduce((sum, p) => sum + p.def, 0) / 5;
    const teamBlk = starters.reduce((sum, p) => sum + p.blk, 0) / 5;
    const teamStl = starters.reduce((sum, p) => sum + p.steal, 0) / 5;


    // --- B. 전술 적합도 점수 계산 (Scoring v3.0) ---
    // 모든 전술의 기본 점수(Base Score)를 40점으로 통일
    // 가중치(Multiplier) 합계를 0.5 ~ 0.6 수준으로 통일하여 스탯 인플레이션 방지
    // 핵심 조건(Threshold) 달성 시에만 큰 폭의 보너스 부여

    const scores: Record<OffenseTactic, number> = {
        'Balance': 40,
        'PaceAndSpace': 40,
        'PerimeterFocus': 40,
        'PostFocus': 40,
        'Grind': 40,
        'SevenSeconds': 40
    };

    // 1. Balance (안전한 선택지)
    // 1옵션과 5옵션의 OVR 차이가 적으면(15 이하) 조직력이 좋다고 판단하여 가산점
    const ovrMin = Math.min(...starters.map(p => calculatePlayerOvr(p)));
    const ovrMax = Math.max(...starters.map(p => calculatePlayerOvr(p)));
    scores['Balance'] += (ovrMin / 2); // 기본기 점수
    if ((ovrMax - ovrMin) < 15) scores['Balance'] += 10; // 조직력 보너스

    // 2. Pace & Space (3점 + 패스)
    // 가중치: 3점(0.3) + 패스(0.2)
    scores['PaceAndSpace'] += (team3ptAvg * 0.3) + (maxPlaymaking * 0.2);
    // [Threshold] 팀 3점 평균이 80 이상이거나, 스트레치 빅맨이 있을 때만 강력 추천
    if (team3ptAvg > 80) scores['PaceAndSpace'] += 15;
    if (isStretchFive) scores['PaceAndSpace'] += 10;

    // 3. Seven Seconds (속도 + 체력)
    // 가중치: 속도(0.35) + 체력(0.15)
    scores['SevenSeconds'] += (teamSpeed * 0.35) + (teamStamina * 0.15);
    // [Threshold] 팀 평균 속도가 82를 넘는 '엘리트 런앤건' 팀에게만 보너스
    if (teamSpeed > 82) scores['SevenSeconds'] += 20; // 압도적인 속도일 때만 1순위 등극

    // 4. Perimeter Focus (핸들러 + 슛)
    // 가중치: 핸들링(0.3) + 최고슈터(0.2)
    scores['PerimeterFocus'] += (maxHandle * 0.3) + (bestShooterRating * 0.2);
    // [Threshold] 리그 탑급 핸들러(90+) 보유 시 몰빵 전술 유효
    if (maxHandle >= 90) scores['PerimeterFocus'] += 20;
    else if (maxHandle >= 85) scores['PerimeterFocus'] += 10;

    // 5. Post Focus (빅맨)
    // 가중치: 포스트(0.4) + 인사이드(0.1)
    scores['PostFocus'] += (maxPost * 0.4) + (maxInside * 0.1);
    // [Threshold] 리그 탑급 빅맨(90+) 보유 시 유효
    if (maxPost >= 90) scores['PostFocus'] += 20;
    // 팀 3점이 너무 낮으면(70 미만) 강제로 포스트를 해야 함 (생존형 가산점)
    if (team3ptAvg < 70) scores['PostFocus'] += 15;

    // 6. Grind (수비 + 힘 + 저속)
    // 가중치: 수비(0.3) + 힘(0.2)
    scores['Grind'] += (teamDef * 0.3) + (teamStr * 0.2);
    // [Threshold] 수비력이 80 이상인 늪농구 팀
    if (teamDef >= 80) scores['Grind'] += 15;
    // 공격력이 너무 낮으면(오버롤 75 미만) 수비라도 해야 함
    if (ovrMax < 80) scores['Grind'] += 10;


    // --- C. 최종 전술 선택 (Randomness 추가) ---
    let selectedTactic: OffenseTactic = 'Balance';
    let highestScore = -999;

    (Object.keys(scores) as OffenseTactic[]).forEach(t => {
        // +/- 4점의 난수 부여로 경계선에 있는 전술들의 다양성 확보
        const variance = (Math.random() * 8) - 4;
        const finalScore = scores[t] + variance;
        
        if (finalScore > highestScore) {
            highestScore = finalScore;
            selectedTactic = t;
        }
    });


    // --- D. 슬라이더 미세 조정 (Micro-Adjustment) ---
    const presets: Record<OffenseTactic, any> = {
        'Balance':        { pace: 5, offReb: 5, zone: 3, press: 1 },
        'PaceAndSpace':   { pace: 7, offReb: 3, zone: 2, press: 1 },
        'PerimeterFocus': { pace: 4, offReb: 4, zone: 2, press: 1 },
        'PostFocus':      { pace: 2, offReb: 8, zone: 4, press: 1 },
        'Grind':          { pace: 1, offReb: 7, zone: 5, press: 2 },
        'SevenSeconds':   { pace: 10, offReb: 2, zone: 1, press: 3 }
    };

    const base = presets[selectedTactic];
    const sliders = { ...base };

    // 1. Pace Tuning
    // 팀 스피드가 평균(60)보다 높으면 페이스를 올림. 10포인트당 1칸.
    const speedDiff = Math.floor((teamSpeed - 60) / 10);
    sliders.pace = Math.max(1, Math.min(10, sliders.pace + speedDiff));

    // 2. Rebound Tuning
    // 빅맨 리바운드 능력치에 따라 보정
    const bigReb = bigs.length ? Math.max(...bigs.map(p => p.reb)) : 50;
    const rebDiff = Math.floor((bigReb - 65) / 10);
    sliders.offReb = Math.max(1, Math.min(10, sliders.offReb + rebDiff));

    // 3. Defense Intensity Tuning
    // 팀 수비력이 좋거나 스틸이 좋으면 압박 강도 상향
    const defDiff = Math.floor((teamDef - 60) / 10);
    sliders.defIntensity = Math.max(1, Math.min(10, 5 + defDiff));
    if (teamStl > 80) sliders.defIntensity = Math.min(10, sliders.defIntensity + 1);

    // 4. Press & Zone
    if (teamStamina > 85 && guards.length >= 3) sliders.fullCourtPress = Math.min(10, sliders.press + 2);
    else sliders.fullCourtPress = sliders.press;

    // 블락 능력이 좋으면 골밑을 지키는 존 디펜스 선호
    const avgPerDef = starters.reduce((sum, p) => sum + p.perDef, 0) / 5;
    if (teamBlk > avgPerDef + 15) sliders.zoneUsage = Math.min(10, sliders.zoneUsage + 3);
    else if (avgPerDef > teamBlk + 10) sliders.zoneUsage = Math.max(1, sliders.zoneUsage - 2);

    const defTactic: DefenseTactic = sliders.zoneUsage > 6 ? 'ZoneDefense' : 'ManToManPerimeter';

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
            pace: sliders.pace,
            offReb: sliders.offReb,
            defIntensity: sliders.defIntensity,
            defReb: 5,
            fullCourtPress: sliders.fullCourtPress,
            zoneUsage: sliders.zoneUsage
        },
        starters: startersMap,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
