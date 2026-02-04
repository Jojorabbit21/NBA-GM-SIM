import { GameState, PossessionResult, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime } from './timeEngine';
import { OFFENSE_TACTIC_CONFIG, DEFENSE_TACTIC_CONFIG } from './tacticMaps';
import { OffenseTactic, DefenseTactic } from '../../../../types';

// --- Text Generator Interfaces ---
type ShotZone = 'Rim' | 'Paint' | 'Mid-L' | 'Mid-C' | 'Mid-R' | '3PT-L' | '3PT-C' | '3PT-R' | '3PT-Corn';
type ShotType = 'Dunk' | 'Layup' | 'Hook' | 'Floater' | 'Jumper' | 'Fadeaway' | 'CatchShoot' | 'Pullup';

// --- Helper: Calculate Team Tactical Fit Score (0.8 ~ 1.2) ---
function calculateOffensiveEfficiency(team: TeamState): number {
    const config = OFFENSE_TACTIC_CONFIG[team.tactics.offenseTactics[0] || 'Balance'];
    return calculateEfficiency(team, config.fit);
}

function calculateDefensiveEfficiency(team: TeamState): number {
    const config = DEFENSE_TACTIC_CONFIG[team.tactics.defenseTactics[0] || 'ManToManPerimeter'];
    return calculateEfficiency(team, config.fit);
}

function calculateEfficiency(team: TeamState, fitWeights: Partial<Record<string, number>>): number {
    let totalFitScore = 0;
    let maxPossibleScore = 0;

    team.onCourt.forEach(p => {
        Object.entries(fitWeights).forEach(([arch, weight]) => {
            const rating = p.archetypes[arch as keyof typeof p.archetypes] || 50;
            const w = weight as number;
            totalFitScore += rating * w;
            maxPossibleScore += 100 * w;
        });
    });

    const rawRatio = maxPossibleScore > 0 ? totalFitScore / maxPossibleScore : 0.5;
    return 0.8 + (rawRatio * 0.4);
}

// --- Helper: Select Actor ---
function selectActor(team: TeamState, type: 'offense' | 'defense'): LivePlayer {
    let config;
    if (type === 'offense') {
        config = OFFENSE_TACTIC_CONFIG[team.tactics.offenseTactics[0] || 'Balance'];
    } else {
        config = DEFENSE_TACTIC_CONFIG[team.tactics.defenseTactics[0] || 'ManToManPerimeter'];
    }
    
    const players = team.onCourt;
    if (players.length === 0) throw new Error("No players");

    const usageScores = players.map(p => {
        let score = 10; 
        
        Object.entries(config.usage).forEach(([arch, weight]) => {
            const rating = p.archetypes[arch as keyof typeof p.archetypes] || 0;
            const w = weight as number;
            score += rating * w;
        });

        if (type === 'offense') score += (p.ovr * 2); 
        else score += (p.attr.def * 2); 

        if (p.currentCondition < 50) score *= 0.7; 

        return { player: p, score };
    });

    const totalWeight = usageScores.reduce((sum, item) => sum + item.score, 0);
    let randomVal = Math.random() * totalWeight;

    for (const item of usageScores) {
        randomVal -= item.score;
        if (randomVal <= 0) return item.player;
    }

    return players[0];
}

// --- Helper: Determine Shot Context ---
function determineShotContext(player: LivePlayer, tactic: OffenseTactic): { zone: ShotZone, type: ShotType, points: 2 | 3 } {
    const config = OFFENSE_TACTIC_CONFIG[tactic || 'Balance'];
    const bias = config.shotBias || { rim: 1, mid: 1, three: 1 };
    
    // Calculate weights based on attributes + tactic bias
    const rimW = (player.attr.ins * 1.2 + player.archetypes.driver * 0.5) * bias.rim;
    const midW = (player.attr.mid * 1.0 + player.archetypes.isoScorer * 0.5) * bias.mid;
    const threeW = (player.attr.out * 1.0 + player.archetypes.spacer * 0.8) * bias.three;
    
    const totalW = rimW + midW + threeW;
    const roll = Math.random() * totalW;

    // 1. Determine Range
    if (roll < rimW) {
        // RIM / PAINT
        const isPostUp = player.archetypes.postScorer > 70 && Math.random() < 0.6;
        
        if (isPostUp) {
            return { zone: 'Paint', type: 'Hook', points: 2 };
        } else {
            // Dunk vs Layup based on Vertical/Dunk attr
            // (Assuming 'ins' correlates with dunk/layup mix)
            const canDunk = player.attr.vertical > 70 && player.attr.ins > 70;
            const isDunk = canDunk && Math.random() < 0.4;
            return { zone: 'Rim', type: isDunk ? 'Dunk' : 'Layup', points: 2 };
        }
    } else if (roll < rimW + midW) {
        // MID-RANGE
        const zones: ShotZone[] = ['Mid-L', 'Mid-C', 'Mid-R'];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        
        // Move type based on attributes
        let type: ShotType = 'Jumper';
        if (player.attr.handling > 80) type = 'Pullup';
        else if (player.attr.postPlay > 70 && Math.random() < 0.3) type = 'Fadeaway';
        else if (player.attr.ins > 70 && Math.random() < 0.3) type = 'Floater';
        
        return { zone, type, points: 2 };
    } else {
        // 3-POINT
        const zones: ShotZone[] = ['3PT-L', '3PT-C', '3PT-R', '3PT-Corn'];
        // Corner specialist logic
        let zone = zones[Math.floor(Math.random() * 3)]; // Default Top/Wing
        if (player.archetypes.spacer > 80 && player.archetypes.handler < 60) {
            if (Math.random() < 0.5) zone = '3PT-Corn';
        }
        
        const type: ShotType = (player.archetypes.handler > 75 && Math.random() < 0.4) ? 'Pullup' : 'CatchShoot';
        return { zone, type, points: 3 };
    }
}

// --- Helper: Generate Flavor Text ---
function generateScoreLog(player: LivePlayer, assister: LivePlayer | undefined, context: { zone: ShotZone, type: ShotType, points: number }): string {
    const { zone, type, points } = context;
    const pName = player.playerName;
    const aName = assister ? ` (${assister.playerName} A)` : '';
    
    const templates: Record<string, string[]> = {
        'Dunk': [
            `${pName}, 강력한 원핸드 슬램덩크!${aName}`,
            `${pName}, 림을 부술듯한 덩크!${aName}`,
            `${pName}, 베이스라인 돌파 후 호쾌한 덩크!${aName}`,
            `${pName}의 앨리웁 덩크 작렬!${aName}`
        ],
        'Layup': [
            `${pName}, 수비 사이를 뚫고 레이업 득점.${aName}`,
            `${pName}의 가벼운 핑거롤 레이업.${aName}`,
            `${pName}, 돌파에 이은 리버스 레이업 성공!${aName}`,
            `${pName}, 골밑 혼전 상황에서 침착한 마무리.${aName}`
        ],
        'Hook': [
            `${pName}, 우직한 포스트업 후 훅슛 성공.${aName}`,
            `${pName}, 골밑에서 베이비 훅슛.${aName}`
        ],
        'Floater': [
            `${pName}, 수비수 키를 넘기는 플로터!${aName}`,
            `${pName}, 감각적인 티어드롭 슛 성공.${aName}`
        ],
        'Jumper': [
            `${pName}, ${getLocationName(zone)}에서 점퍼 성공.${aName}`,
            `${pName}의 깔끔한 미드레인지 점프슛.${aName}`,
            `${pName}, 빈 공간을 찾아 점퍼를 성공시킵니다.${aName}`
        ],
        'Fadeaway': [
            `${pName}, 수비를 달고 페이더웨이! 들어갑니다.${aName}`,
            `${pName}, 균형이 무너진 상태에서 페이더웨이 성공.${aName}`
        ],
        'Pullup': [
            `${pName}, 드리블 후 급정지 점퍼 적중!${aName}`,
            `${pName}, 스크린을 타고 풀업 점프슛.${aName}`
        ],
        'CatchShoot': [
            `${pName}, 패스를 받자마자 ${getLocationName(zone)} 3점슛!${aName}`,
            `${pName}의 오픈 찬스, 3점슛 깨끗합니다.${aName}`,
            `${pName}, ${getLocationName(zone)}에서 캐치앤슛 성공.${aName}`
        ],
        '3PT_Pullup': [ // Custom key for 3PT pullups
            `${pName}, ${getLocationName(zone)}에서 자신감 있는 풀업 3점!${aName}`,
            `${pName}, 수비수를 앞에 두고 3점슛을 꽂습니다!${aName}`
        ]
    };

    let key: string = type;
    if (points === 3 && type === 'Pullup') key = '3PT_Pullup';
    if (points === 3 && type === 'Jumper') key = 'CatchShoot'; // Fallback

    const pool = templates[key] || templates['Jumper'];
    return pool[Math.floor(Math.random() * pool.length)];
}

function getLocationName(zone: ShotZone): string {
    const names: Record<ShotZone, string> = {
        'Rim': '골밑',
        'Paint': '페인트존',
        'Mid-L': '좌측 엘보우',
        'Mid-C': '자유투 라인 부근',
        'Mid-R': '우측 윙',
        '3PT-L': '좌측 45도',
        '3PT-C': '탑',
        '3PT-R': '우측 45도',
        '3PT-Corn': '코너'
    };
    return names[zone] || '외곽';
}

// --- Main Logic ---

export function resolvePossession(state: GameState): PossessionResult {
    const attTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    
    // 1. Calculate Time & Actors
    const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, attTeam.tactics.offenseTactics[0]);
    const actor = selectActor(attTeam, 'offense'); 
    const defender = selectActor(defTeam, 'defense'); 

    // 2. Calculate Efficiency Modifiers
    const attEfficiency = calculateOffensiveEfficiency(attTeam); 
    const defEfficiency = calculateDefensiveEfficiency(defTeam);
    
    // --- Turnover Check ---
    let toChance = 0.13;
    toChance -= (actor.archetypes.connector - 50) * 0.001; 
    toChance /= attEfficiency; 
    
    const pressure = (defTeam.tactics.sliders.defIntensity + defTeam.tactics.sliders.fullCourtPress) / 20; 
    toChance += (pressure * 0.05);

    if (Math.random() < toChance) {
        const isSteal = Math.random() < (0.4 + (defender.archetypes.perimLock * 0.005)); 
        const stealer = isSteal ? defender : undefined;
        return {
            type: 'turnover',
            player: actor,
            secondaryPlayer: stealer,
            timeTaken,
            logText: stealer 
                ? `${stealer.playerName}의 스틸! ${actor.playerName}의 공을 가로챕니다.`
                : `${actor.playerName}, 패스 미스로 턴오버를 범합니다.`,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    }

    // --- Foul Check ---
    const foulChance = 0.05 + (defTeam.tactics.sliders.defIntensity * 0.005) - (defender.archetypes.connector * 0.0005); 
    if (Math.random() < foulChance) {
        const isShootingFoul = Math.random() < 0.3;
        const isBonus = defTeam.fouls >= 5;
        
        if (isShootingFoul || isBonus) {
            return resolveFreeThrows(actor, defender, timeTaken, state.possession);
        } else {
            defTeam.fouls++;
            return {
                type: 'foul',
                player: defender,
                secondaryPlayer: actor,
                timeTaken,
                logText: `${defender.playerName}의 반칙. (팀 파울: ${defTeam.fouls})`,
                nextPossession: state.possession,
                isDeadBall: true
            };
        }
    }

    // --- Shot Selection & Resolution ---
    const shotContext = determineShotContext(actor, attTeam.tactics.offenseTactics[0]);
    const { zone, type, points } = shotContext;
    
    // --- Block Check ---
    let blockChance = (defender.archetypes.rimProtector * 0.002);
    if (points === 3) blockChance *= 0.1; // Harder to block 3s
    if (type === 'Dunk') blockChance *= 0.5; // Harder to block dunks

    if (Math.random() < blockChance) {
        return {
            type: 'block',
            player: defender,
            secondaryPlayer: actor,
            timeTaken,
            logText: `${actor.playerName}의 슛을 ${defender.playerName}가 블록해냈습니다!`,
            nextPossession: Math.random() < 0.5 ? 'home' : 'away',
            isDeadBall: false
        };
    }

    // --- Shot Success Calculation ---
    let hitRate = points === 3 ? 0.35 : 0.48;
    
    // Adjust based on shot type difficulty
    if (type === 'Dunk') hitRate += 0.3;
    if (type === 'Layup') hitRate += 0.1;
    if (type === 'Fadeaway') hitRate -= 0.1;
    if (type === 'Pullup') hitRate -= 0.05;

    // Attribute Modifier
    const offRating = points === 3 ? actor.attr.out : actor.attr.ins;
    const defRating = points === 3 ? defender.attr.perDef : defender.attr.intDef;
    hitRate += (offRating - defRating) * 0.002;

    // Efficiency Modifiers
    hitRate *= attEfficiency;
    hitRate *= (2.0 - defEfficiency); 

    // Playmaker Boost
    const potentialAssister = getRandomPlayer(attTeam.onCourt, actor.playerId);
    const assistBonus = potentialAssister.archetypes.handler * 0.0005; 
    hitRate += assistBonus;

    if (Math.random() < hitRate) {
        // MADE SHOT
        const assistChance = 0.5 + (potentialAssister.archetypes.connector * 0.003);
        // Iso shots have lower assist chance
        const isIso = type === 'Pullup' || type === 'Fadeaway' || type === 'Dunk'; 
        const finalAssistChance = isIso ? assistChance * 0.5 : assistChance;
        
        const assister = Math.random() < finalAssistChance ? potentialAssister : undefined;
        
        // Generate detailed log
        const logText = generateScoreLog(actor, assister, shotContext);

        if (Math.random() < 0.03) {
             return resolveFreeThrows(actor, defender, timeTaken, state.possession, points);
        }

        return {
            type: 'score',
            points: points as 2 | 3,
            player: actor,
            secondaryPlayer: assister,
            timeTaken,
            logText,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    } else {
        // MISSED SHOT
        const homeReb = state.home.onCourt.reduce((sum, p) => sum + p.archetypes.rebounder, 0);
        const awayReb = state.away.onCourt.reduce((sum, p) => sum + p.archetypes.rebounder, 0);
        
        const defRebPower = (state.possession === 'home' ? awayReb : homeReb) * 1.5;
        const offRebPower = (state.possession === 'home' ? homeReb : awayReb);
        
        const offRebChance = offRebPower / (offRebPower + defRebPower);
        const isOffReb = Math.random() < offRebChance;
        
        const reboundTeam = isOffReb ? attTeam : defTeam;
        const rebounder = selectRebounder(reboundTeam.onCourt);

        // Simple miss text
        let missText = `${actor.playerName}, ${getLocationName(zone)} 슛 실패.`;
        if (points === 3) missText = `${actor.playerName}, 3점슛 빗나갑니다.`;
        if (type === 'Dunk') missText = `${actor.playerName}, 덩크 실패! 림을 맞고 나옵니다.`;

        return {
            type: 'miss',
            player: actor,
            rebounder: rebounder,
            timeTaken,
            logText: `${missText} 리바운드: ${rebounder.playerName}.`,
            nextPossession: isOffReb ? 'keep' : (state.possession === 'home' ? 'away' : 'home'),
            isDeadBall: false
        };
    }
}

function selectRebounder(players: LivePlayer[]): LivePlayer {
    const weighted = players.map(p => ({ p, w: p.archetypes.rebounder + (p.attr.vertical * 0.5) }));
    const total = weighted.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    for (const item of weighted) {
        r -= item.w;
        if (r <= 0) return item.p;
    }
    return players[0];
}

function resolveFreeThrows(shooter: LivePlayer, fouler: LivePlayer, time: number, possession: string, andOnePoints?: number): PossessionResult {
    const ftPct = shooter.attr.ft / 100;
    const count = andOnePoints ? 1 : 2; 
    let made = 0;
    
    for(let i=0; i<count; i++) {
        if (Math.random() < ftPct) made++;
    }
    
    const totalPoints = (andOnePoints || 0) + made;
    
    let text = "";
    if (andOnePoints) {
        text = `${shooter.playerName}, 앤드원! 추가 자유투 ${made > 0 ? '성공' : '실패'}. (${totalPoints}점 플레이)`;
    } else {
        text = `${fouler.playerName}의 파울. ${shooter.playerName} 자유투 ${made}/${count} 성공.`;
    }

    return {
        type: 'freethrow',
        points: totalPoints as any, 
        attempts: count, 
        player: shooter,
        secondaryPlayer: fouler, 
        timeTaken: time,
        logText: text,
        nextPossession: possession === 'home' ? 'away' : 'home', 
        isDeadBall: true
    };
}

function getRandomPlayer(players: LivePlayer[], excludeId?: string): LivePlayer {
    if (!players || players.length === 0) throw new Error("No players");
    let pool = players;
    if (excludeId) {
        pool = players.filter(p => p.playerId !== excludeId);
        if (pool.length === 0) pool = players;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}