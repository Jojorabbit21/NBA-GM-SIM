
import { Team, Player, TradeOffer } from '../types';

// ==========================================================================================
//  💼 NBA GM SIMULATOR - TRADE ENGINE
// ==========================================================================================

export const TRADE_CONFIG = {
    BASE: {
        REPLACEMENT_LEVEL_OVR: 40,
        VALUE_EXPONENT: 2.8, // 가치 상승 폭 (높을수록 스타 가치 급상승)
    },
    AGE: {
        YOUNG_LIMIT: 23,
        HIGH_POT_THRESHOLD: 80,
        YOUNG_POT_BONUS: 0.02, // 잠재력 1당 보너스
        PRIME_START: 24,
        PRIME_END: 29,
        PRIME_BONUS: 1.1, // 전성기 나이대 가치 부스트
        OLD_START: 32,
        OLD_PENALTY_PER_YEAR: 0.08, // 32세 이후 매년 가치 하락폭
        MIN_OLD_VALUE: 0.3, // 노장 최소 가치 보존율
    },
    NEEDS: {
        WEAKNESS_THRESHOLD: 75, // 이 수치 미만이면 약점으로 간주
        STRENGTH_THRESHOLD: 85, // 이 수치 이상이면 강점으로 간주
    },
    CONTEXT: {
        FIT_BONUS: 0.20, // 팀 니즈에 맞을 시 가치 상승폭
        REDUNDANCY_PENALTY: 0.15, // 포지션 중복 시 가치 하락폭
        SALARY_DUMP_BONUS: 0.1, // 샐러리 비우기 가치
        EXPIRING_BONUS: 0.05, // 만기 계약 가치
    },
    ACCEPTANCE: {
        DEFAULT_RATIO: 1.05, // AI는 기본적으로 5% 이득을 봐야 움직임
        STAR_SWAP_RATIO: 1.0, // 스타끼리 교환은 동등 가치 인정
        REBUILDING_POT_VALUATION: 1.3, // 리빌딩 팀은 유망주 가치를 1.3배로 쳐줌
        WINNOW_VET_VALUATION: 1.2, // 윈나우 팀은 즉전감 가치를 1.2배로 쳐줌
    },
    DILUTION: {
        PACKAGE_SIZE_TRIGGER: 3, 
        LOW_ANCHOR_PENALTY: 0.60, 
        ROSTER_CLOG_PENALTY: 0.85,
    }
};

/**
 * 선수의 '절대적 가치'를 계산합니다. (팀 상황 고려 X)
 */
function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;

    // 1. Base Value based on OVR (Exponential)
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // 2. Age & Potential Logic
    if (p.age <= C.AGE.YOUNG_LIMIT) {
        // 유망주: 잠재력이 높을수록 가치 폭등
        if (p.potential > p.ovr) {
            const potBonus = 1.0 + ((p.potential - 70) * C.AGE.YOUNG_POT_BONUS); 
            baseValue *= potBonus;
        }
    } else if (p.age >= C.AGE.PRIME_START && p.age <= C.AGE.PRIME_END) {
        // 전성기: 즉시 전력감 보너스
        baseValue *= C.AGE.PRIME_BONUS;
    } else if (p.age >= C.AGE.OLD_START) {
        // 노장: 급격한 가치 하락
        const yearsOld = p.age - C.AGE.OLD_START + 1;
        const penalty = Math.pow(1 - C.AGE.OLD_PENALTY_PER_YEAR, yearsOld);
        baseValue *= Math.max(C.AGE.MIN_OLD_VALUE, penalty);
    }

    // 3. Contract Situation (Simple Logic)
    // 가성비 좋은 계약(고효율 저연봉)은 가치 상승, 악성 계약은 하락
    if (p.contractYears > 1) {
        const fairSalary = Math.pow(p.ovr - 65, 2) / 3; // 대략적인 적정 연봉 추산식
        if (p.salary < fairSalary * 0.7) baseValue *= 1.15; // 혜자 계약
        else if (p.salary > fairSalary * 1.5) baseValue *= 0.8; // 악성 계약
    } else {
        // 만기 계약(Expiring)은 리빌딩 팀에게 매력적일 수 있으나 기본 가치는 약간 하락
        baseValue *= 0.95; 
    }

    return Math.floor(baseValue);
}

/**
 * 팀의 현재 약점과 강점을 분석합니다.
 */
function getTeamNeeds(team: Team): { needs: string[], strengths: string[], isContender: boolean } {
    const C = TRADE_CONFIG.NEEDS;
    // 상위 8명(로테이션 멤버) 기준 분석
    const top8 = [...team.roster].sort((a,b) => b.ovr - a.ovr).slice(0, 8);
    
    if (top8.length === 0) return { needs: [], strengths: [], isContender: false };

    // 팀의 평균 OVR로 컨텐더 여부 판단
    const avgOvr = top8.reduce((s, p) => s + p.ovr, 0) / top8.length;
    const isContender = avgOvr >= 80;

    const avg = (attr: keyof Player) => top8.reduce((sum, p) => sum + (p[attr] as number), 0) / top8.length;

    const stats = {
        ins: avg('ins'),
        out: avg('out'),
        plm: avg('plm'),
        def: avg('def'),
        reb: avg('reb')
    };

    const needs: string[] = [];
    const strengths: string[] = [];

    // 포지션 구멍 찾기 (주전급 중 OVR 75 미만인 포지션)
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    positions.forEach(pos => {
        const playersAtPos = top8.filter(p => p.position === pos);
        if (playersAtPos.length === 0 || Math.max(...playersAtPos.map(p=>p.ovr)) < 75) {
            needs.push(pos);
        }
    });

    if (stats.ins < C.WEAKNESS_THRESHOLD) needs.push('ins');
    if (stats.out < C.WEAKNESS_THRESHOLD) needs.push('out');
    if (stats.plm < C.WEAKNESS_THRESHOLD) needs.push('plm');
    if (stats.def < C.WEAKNESS_THRESHOLD) needs.push('def');
    if (stats.reb < C.WEAKNESS_THRESHOLD) needs.push('reb');

    return { needs, strengths, isContender };
}

/**
 * 특정 팀 입장에서, 영입하려는 선수의 가치를 재평가합니다 (Fit 고려).
 */
function getContextualTradeValue(player: Player, teamContext: Team, isAcquiring: boolean): number {
    const C = TRADE_CONFIG.CONTEXT;
    const A = TRADE_CONFIG.ACCEPTANCE;
    let value = getPlayerTradeValue(player);
    const { needs, isContender } = getTeamNeeds(teamContext);
    
    if (isAcquiring) {
        let fitMultiplier = 1.0;

        // 1. 니즈 충족 보너스
        if (needs.includes(player.position)) fitMultiplier += C.FIT_BONUS;
        if (needs.includes('ins') && player.ins > 80) fitMultiplier += C.FIT_BONUS;
        if (needs.includes('out') && player.out > 80) fitMultiplier += C.FIT_BONUS;
        if (needs.includes('plm') && player.plm > 80) fitMultiplier += C.FIT_BONUS;
        if (needs.includes('def') && player.def > 80) fitMultiplier += C.FIT_BONUS;
        if (needs.includes('reb') && player.reb > 80) fitMultiplier += C.FIT_BONUS;

        // 2. 포지션 중복 페널티
        const playersAtPos = teamContext.roster.filter(p => p.position === player.position && p.ovr >= player.ovr - 3);
        if (playersAtPos.length >= 2) {
            fitMultiplier -= C.REDUNDANCY_PENALTY;
        }

        // 3. 팀 성향에 따른 가치 평가
        if (!isContender) {
            // 리빌딩 팀: 유망주(23세 이하, 고포텐) 선호, 노장 기피
            if (player.age <= 23 && player.potential > 80) fitMultiplier *= A.REBUILDING_POT_VALUATION;
            if (player.age > 30) fitMultiplier *= 0.7;
        } else {
            // 윈나우 팀: 즉전감(OVR 80+) 선호
            if (player.ovr >= 80) fitMultiplier *= A.WINNOW_VET_VALUATION;
        }

        value *= fitMultiplier;
    } else {
        // 내보내는 선수: 핵심 코어면 가치 높게 책정 (잘 안 팔려 함)
        const rank = [...teamContext.roster].sort((a,b) => b.ovr - a.ovr).findIndex(p => p.id === player.id);
        if (rank <= 2) value *= 1.2; // Top 3 보호 본능
    }

    return value;
}

/**
 * [Public] 트레이드 블록 오퍼 생성 함수
 * - 유저의 제안(tradingPlayers)에 대해 다른 29개 팀이 오퍼를 던집니다.
 */
export function generateTradeOffers(
    tradingPlayers: Player[], 
    myTeam: Team, 
    allTeams: Team[]
): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const mySalary = tradingPlayers.reduce((sum, p) => sum + p.salary, 0);
    
    // 유저 패키지의 기본 가치 합산
    
    const offers: TradeOffer[] = [];
    const otherTeams = allTeams.filter(t => t.id !== myTeam.id);

    // 최적화: 모든 팀을 다 돌되, 내부 루프를 빠르게 탈출
    for (const targetTeam of otherTeams) {
        // 1. 상대 팀 입장에서 유저 카드 평가
        let userPackageValueToAI = 0;
        tradingPlayers.forEach(p => {
            userPackageValueToAI += getContextualTradeValue(p, targetTeam, true);
        });

        // 가치가 너무 낮으면 스킵
        if (userPackageValueToAI < 500) continue;

        // 2. 상대 팀에서 줄 수 있는 카드 탐색
        // 상대 팀 로스터를 가치 역순(낮은 것부터) + 샐러리 필러 고려하여 정렬
        const candidates = [...targetTeam.roster].sort((a,b) => getPlayerTradeValue(a) - getPlayerTradeValue(b));
        
        // 1~3명 조합 시도 (단순화된 조합 로직)
        // 랜덤성을 부여하여 매번 다른 오퍼가 나오도록 함
        for (let i = 0; i < 20; i++) { 
            const packSize = Math.floor(Math.random() * 3) + 1; // 1~3명
            const tradePack: Player[] = [];
            const visitedIndices = new Set<number>();

            // 패키지 구성 시도
            for (let k = 0; k < packSize; k++) {
                const idx = Math.floor(Math.random() * candidates.length);
                if (!visitedIndices.has(idx)) {
                    visitedIndices.add(idx);
                    tradePack.push(candidates[idx]);
                }
            }

            if (tradePack.length === 0) continue;

            // 3. AI 패키지 가치 및 샐러리 계산
            let aiPackageValue = 0;
            let aiSalary = 0;
            tradePack.forEach(p => {
                aiPackageValue += getContextualTradeValue(p, targetTeam, false); // AI가 잃는 가치
                aiSalary += p.salary;
            });

            // 4. 샐러리 매칭 (NBA 룰: 대략 75% ~ 125% + 여유분)
            const salaryRatio = mySalary > 0 ? aiSalary / mySalary : 0;
            const isSalaryMatch = Math.abs(mySalary - aiSalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);

            if (!isSalaryMatch) continue;

            // 5. 가치 비교 (AI는 손해를 보지 않으려 함)
            if (userPackageValueToAI >= aiPackageValue * C.DEFAULT_RATIO) {
                
                // 중복 오퍼 체크
                const isDup = offers.some(o => 
                    o.teamId === targetTeam.id && 
                    o.players.length === tradePack.length && 
                    o.players.every(p => tradePack.some(tp => tp.id === p.id))
                );

                if (!isDup) {
                    const rawUserVal = tradingPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    const rawTargetVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);

                    offers.push({
                        teamId: targetTeam.id,
                        teamName: targetTeam.name,
                        players: tradePack,
                        diffValue: rawTargetVal - rawUserVal 
                    });
                }
            }
        }
    }

    // 가치 차이가 큰 순서(유저에게 이득인 순서)로 정렬하여 상위 5개 반환
    return offers.sort((a, b) => b.diffValue - a.diffValue).slice(0, 5);
}

/**
 * [Public] 역제안 생성 함수
 * - 유저가 특정 선수(targetPlayers)를 원할 때, AI가 우리 팀에서 가져갈 선수를 요구
 */
export function generateCounterOffers(
    targetPlayers: Player[],
    targetTeam: Team,
    myTeam: Team
): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const targetValueToAI = targetPlayers.reduce((sum, p) => sum + getContextualTradeValue(p, targetTeam, false), 0); // AI가 잃는 가치
    const targetSalary = targetPlayers.reduce((sum, p) => sum + p.salary, 0);
    
    const offers: TradeOffer[] = [];
    
    // AI가 우리 팀(User Team)을 스캔하여 원하는 자원 탐색
    const myCandidates = [...myTeam.roster].sort((a,b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));

    // 조합 탐색 (단순화: 1~2명 조합)
    
    for (let i = 0; i < 50; i++) { // 최대 50번 시도
        const packSize = Math.floor(Math.random() * 2) + 1; // 1~2명
        const tradePack: Player[] = [];
        const visited = new Set<number>();

        // 1. 메인 칩 선택
        for (let k = 0; k < packSize; k++) {
            const idx = Math.floor(Math.random() * myCandidates.length);
            if (!visited.has(idx)) {
                visited.add(idx);
                tradePack.push(myCandidates[idx]);
            }
        }

        if (tradePack.length === 0) continue;

        let myPackValueToAI = 0; // AI 입장에서 내가 주는 카드의 가치
        let myPackSalary = 0;

        tradePack.forEach(p => {
            myPackValueToAI += getContextualTradeValue(p, targetTeam, true);
            myPackSalary += p.salary;
        });

        // 샐러리 매칭
        const salaryRatio = targetSalary > 0 ? myPackSalary / targetSalary : 0;
        const isSalaryMatch = Math.abs(targetSalary - myPackSalary) < 5 || (salaryRatio >= 0.75 && salaryRatio <= 1.30);

        if (!isSalaryMatch) continue;

        // 가치 비교
        if (myPackValueToAI >= targetValueToAI * C.DEFAULT_RATIO) {
             const isDup = offers.some(o => 
                o.players.length === tradePack.length && 
                o.players.every(p => tradePack.some(tp => tp.id === p.id))
            );

            if (!isDup) {
                // 너무 터무니없는 제안(2배 이상 가치 요구)은 제외
                if (myPackValueToAI > targetValueToAI * 2.5) continue;

                const rawUserVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                const rawTargetVal = targetPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);

                offers.push({
                    teamId: myTeam.id,
                    teamName: myTeam.name,
                    players: tradePack,
                    diffValue: rawUserVal - rawTargetVal // 여기서는 '요구사항의 가치'를 보여줌
                });
            }
        }
    }

    // AI가 요구하는 것 중, 유저 입장에서 그나마 손해가 덜한 순서(diffValue가 작은 순서)로 정렬
    return offers.sort((a,b) => a.diffValue - b.diffValue).slice(0, 3);
}
