
import { Team, GameTactics, OffenseTactic, DefenseTactic, DepthChart, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

/**
 * AI 팀 및 사용자 자동 설정을 위한 전술 생성기 v2.0
 * 상세 스탯 기반의 적합도 평가 및 동적 슬라이더 튜닝 적용
 */
export const generateAutoTactics = (team: Team): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    // OVR 순으로 정렬하여 기본 로스터 구성
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // 1. 뎁스 차트 자동 구성 (OVR 기반, 포지션 엄수)
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
            // 해당 포지션을 선호하는 선수 중 가장 높은 OVR
            const candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
            if (candidate) {
                depthChart[pos][depth] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                // 포지션이 딱 맞는 선수가 없으면 남은 선수 중 OVR 높은 순 (Fallback)
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

    // 2. 로테이션 맵 초기화 (기존 로직 유지)
    const rotationMap: Record<string, boolean[]> = {};
    sortedRoster.forEach(p => {
        rotationMap[p.id] = Array(48).fill(false);
    });

    // 단순화된 로테이션 할당 (주전 36분, 벤치 12분)
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
    // 3. 전술 분석 알고리즘 (Tactical Analysis Engine)
    // -------------------------------------------------------------------------
    
    // 분석 대상: 주전 5명
    const starters = positions.map(pos => {
        const pid = depthChart[pos][0];
        return team.roster.find(p => p.id === pid);
    }).filter(p => p !== undefined) as Player[];

    if (starters.length < 5) {
        // 데이터 부족 시 기본값
        return {
            offenseTactics: ['Balance'],
            defenseTactics: ['ManToManPerimeter'],
            sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2 },
            starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
            minutesLimits: {}, rotationMap, depthChart
        };
    }

    // --- A. 상세 스탯 집계 ---
    
    // 3점 능력 (평균 & 최대)
    const get3pt = (p: Player) => (p.threeCorner + p.three45 + p.threeTop) / 3;
    const team3ptAvg = starters.reduce((sum, p) => sum + get3pt(p), 0) / 5;
    const bestShooterRating = Math.max(...starters.map(p => get3pt(p)));

    // 핸들링 & 패스 (가드진)
    const guards = starters.filter(p => p.position.includes('G'));
    const maxHandle = guards.length ? Math.max(...guards.map(p => p.handling)) : 50;
    const maxPlaymaking = guards.length ? Math.max(...guards.map(p => p.plm)) : 50;

    // 포스트 & 인사이드 (빅맨진)
    const bigs = starters.filter(p => ['PF', 'C'].includes(p.position));
    const maxPost = bigs.length ? Math.max(...bigs.map(p => p.postPlay)) : 50;
    const maxInside = bigs.length ? Math.max(...bigs.map(p => p.ins)) : 50;
    
    // Stretch Big 존재 여부 (센터가 3점이 되는가?)
    const center = starters.find(p => p.position === 'C');
    const isStretchFive = center ? get3pt(center) >= 75 : false;

    // 피지컬
    const teamSpeed = starters.reduce((sum, p) => sum + p.speed, 0) / 5;
    const teamStamina = starters.reduce((sum, p) => sum + p.stamina, 0) / 5;
    const teamStr = starters.reduce((sum, p) => sum + p.strength, 0) / 5;

    // 수비
    const teamDef = starters.reduce((sum, p) => sum + p.def, 0) / 5;
    const teamBlk = starters.reduce((sum, p) => sum + p.blk, 0) / 5;
    const teamStl = starters.reduce((sum, p) => sum + p.steal, 0) / 5;


    // --- B. 전술 적합도 점수 계산 (Scoring) ---
    const scores: Record<OffenseTactic, number> = {
        'Balance': 50, // 기준점
        'PaceAndSpace': 0,
        'PerimeterFocus': 0,
        'PostFocus': 0,
        'Grind': 0,
        'SevenSeconds': 0
    };

    // 1. Pace & Space
    // 조건: 팀 전체가 슛이 좋아야 함. 센터가 외곽이 되면 큰 가산점. 핸들러의 패스 능력 필요.
    scores['PaceAndSpace'] = (team3ptAvg * 0.5) + (maxPlaymaking * 0.3) + (isStretchFive ? 15 : 0);

    // 2. Seven Seconds
    // 조건: 극단적인 속도와 체력. 슛도 받쳐줘야 함. 수비나 리바운드는 포기.
    scores['SevenSeconds'] = (teamSpeed * 0.6) + (teamStamina * 0.2) + (team3ptAvg * 0.2);

    // 3. Perimeter Focus
    // 조건: 압도적인 핸들러 에이스(아이솔레이션/픽앤롤) 존재.
    // 이전보다 가중치를 낮추고, 빅맨이 너무 강력하면 오히려 감점 (포스트 써야하니까)
    scores['PerimeterFocus'] = (maxHandle * 0.5) + (bestShooterRating * 0.3) - (maxPost * 0.2);

    // 4. Post Focus
    // 조건: 압도적인 빅맨 존재. 팀 속도가 느릴수록 유리(세트 오펜스).
    scores['PostFocus'] = (maxPost * 0.6) + (maxInside * 0.3) - (teamSpeed * 0.1);
    if (team3ptAvg < 70) scores['PostFocus'] += 10; // 슛 없으면 골밑이라도 파야함

    // 5. Grind
    // 조건: 수비가 강력하고, 템포를 죽여야 하는 팀(스피드 낮음, 힘 높음).
    scores['Grind'] = (teamDef * 0.5) + (teamStr * 0.3) + ((100 - teamSpeed) * 0.3);

    // 6. Balance (Fallback)
    // 1옵션과 2옵션의 격차가 적거나, 모든 스탯이 평범할 때 점수 상승
    const statVariance = Math.abs(maxPost - maxHandle);
    if (statVariance < 10) scores['Balance'] += 15;


    // --- C. 최종 전술 선택 ---
    let selectedTactic: OffenseTactic = 'Balance';
    let highestScore = -999;

    (Object.keys(scores) as OffenseTactic[]).forEach(t => {
        // 난수성 부여 (너무 뻔한 결과 방지, +/- 3점)
        const variance = (Math.random() * 6) - 3;
        const finalScore = scores[t] + variance;
        
        if (finalScore > highestScore) {
            highestScore = finalScore;
            selectedTactic = t;
        }
    });


    // --- D. 슬라이더 프리셋 및 동적 튜닝 (Dynamic Slider Tuning) ---
    
    // 1. 전술별 기본 프리셋
    const presets: Record<OffenseTactic, any> = {
        'Balance':        { pace: 5, offReb: 5, zone: 3, press: 1 },
        'PaceAndSpace':   { pace: 7, offReb: 3, zone: 2, press: 1 },
        'PerimeterFocus': { pace: 5, offReb: 4, zone: 2, press: 1 },
        'PostFocus':      { pace: 3, offReb: 8, zone: 4, press: 1 },
        'Grind':          { pace: 2, offReb: 6, zone: 5, press: 2 },
        'SevenSeconds':   { pace: 10, offReb: 3, zone: 1, press: 3 }
    };

    const base = presets[selectedTactic];
    const sliders = { ...base }; // Clone

    // 2. 능력치 기반 미세 조정 (Fine-tuning)
    // Pace: 팀 스피드가 빠르면 기본 전술보다 템포를 더 올림
    if (teamSpeed > 80) sliders.pace = Math.min(10, sliders.pace + 2);
    else if (teamSpeed < 50) sliders.pace = Math.max(1, sliders.pace - 2);

    // Rebound: 빅맨진의 리바운드 능력이 좋으면 공격리바운드 가담을 늘림
    const bigReb = bigs.length ? Math.max(...bigs.map(p => p.reb)) : 50;
    if (bigReb > 85) sliders.offReb = Math.min(10, sliders.offReb + 2);

    // Defense Intensity: 팀 수비력이 좋거나 스틸이 좋으면 압박 강도 상향
    const defBase = Math.round(teamDef / 10); // 50->5, 80->8
    sliders.defIntensity = Math.min(10, Math.max(1, defBase));
    if (teamStl > 80) sliders.defIntensity = Math.min(10, sliders.defIntensity + 1);

    // Full Court Press: 팀 스태미너가 좋고 가드가 많으면 시도
    if (teamStamina > 80 && guards.length >= 3) sliders.fullCourtPress = Math.min(10, sliders.press + 2);
    else sliders.fullCourtPress = sliders.press;

    // Zone Usage: 블락 능력이 좋으면 골밑을 지키는 존 디펜스 선호
    // 반대로 대인 수비(PerDef)가 좋으면 존 빈도 낮춤
    const avgPerDef = starters.reduce((sum, p) => sum + p.perDef, 0) / 5;
    if (teamBlk > avgPerDef + 10) sliders.zoneUsage = Math.min(10, sliders.zoneUsage + 3);
    else if (avgPerDef > teamBlk + 10) sliders.zoneUsage = Math.max(1, sliders.zoneUsage - 2);
    
    // 수비 전술 자동 선택
    const defTactic: DefenseTactic = sliders.zoneUsage > 6 ? 'ZoneDefense' : 'ManToManPerimeter';
    // 에이스 스토퍼: 상대팀 분석이 없으므로 자동 생성 단계에선 잘 안 씀. 
    // 단, 최고의 수비수(Def > 90)가 있다면 고려해볼만 함.
    
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
            defReb: 5, // 수비 리바운드는 보통 기본값 유지 (박스아웃은 기본이니까)
            fullCourtPress: sliders.fullCourtPress,
            zoneUsage: sliders.zoneUsage
        },
        starters: startersMap,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
