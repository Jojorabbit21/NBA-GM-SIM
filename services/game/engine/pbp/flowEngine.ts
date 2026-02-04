
import { GameState, PossessionResult, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime } from './timeEngine';
import { OFFENSE_STRATEGY_CONFIG, DEFENSE_STRATEGY_CONFIG } from './strategyMap';
import { OffenseTactic, DefenseTactic, PlayType } from '../../../../types';
import { resolvePlayAction, PlayContext } from './playTypes';

// --- Text Generator Interfaces ---
type ShotZone = 'Rim' | 'Paint' | 'Mid-L' | 'Mid-C' | 'Mid-R' | '3PT-L' | '3PT-C' | '3PT-R' | '3PT-Corn';
type ShotType = 'Dunk' | 'Layup' | 'Hook' | 'Floater' | 'Jumper' | 'Fadeaway' | 'CatchShoot' | 'Pullup';

// --- Helper: Calculate Team Tactical Fit Score (0.8 ~ 1.2) ---
function calculateOffensiveEfficiency(team: TeamState): number {
    const config = OFFENSE_STRATEGY_CONFIG[team.tactics.offenseTactics[0] || 'Balance'];
    return calculateEfficiency(team, config.fit);
}

function calculateDefensiveEfficiency(team: TeamState): number {
    const config = DEFENSE_STRATEGY_CONFIG[team.tactics.defenseTactics[0] || 'ManToManPerimeter'];
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

// --- Helper: Select Play Type based on Strategy Distribution ---
function selectPlayType(tactic: OffenseTactic): PlayType {
    const config = OFFENSE_STRATEGY_CONFIG[tactic || 'Balance'];
    const dist = config.playDistribution;
    
    let roll = Math.random();
    for (const [type, prob] of Object.entries(dist)) {
        roll -= prob as number;
        if (roll <= 0) return type as PlayType;
    }
    
    return 'Iso'; // Fallback
}

// --- Helper: Generate Flavor Text ---
function generateScoreLog(context: PlayContext): string {
    const { playType, actor, secondaryActor, shotType, preferredZone } = context;
    const pName = actor.playerName;
    const sName = secondaryActor ? secondaryActor.playerName : '';
    
    // Template system
    // We can expand this indefinitely
    const logs: string[] = [];

    switch (playType) {
        case 'Iso':
            if (shotType === 'Pullup') logs.push(`${pName}, 현란한 드리블 후 풀업 점퍼!`);
            else logs.push(`${pName}, 1대1 상황에서 돌파 득점.`);
            break;
        case 'PnR_Handler':
            if (secondaryActor) logs.push(`${sName}의 스크린을 타고 ${pName}의 슛!`);
            else logs.push(`${pName}, 픽앤롤 게임으로 득점을 만들어냅니다.`);
            break;
        case 'PnR_Roll':
            if (secondaryActor) logs.push(`${secondaryActor.playerName}의 킬패스! ${pName}의 호쾌한 덩크!`);
            else logs.push(`${pName}, 롤링 후 골밑 마무리.`);
            break;
        case 'PnR_Pop':
            logs.push(`${pName}, 팝아웃 후 오픈 찬스에서 슛.`);
            break;
        case 'PostUp':
            if (shotType === 'Hook') logs.push(`${pName}, 포스트업에 이은 훅슛 성공.`);
            else logs.push(`${pName}, 수비수를 등지고 페이더웨이!`);
            break;
        case 'CatchShoot':
            if (secondaryActor) logs.push(`${sName}의 킥아웃 패스, ${pName}의 3점!`);
            else logs.push(`${pName}, 캐치앤슛 깨끗합니다.`);
            break;
        case 'Cut':
             logs.push(`${pName}, 빈 공간으로 컷인 득점.`);
             break;
        case 'Handoff':
             logs.push(`${sName}의 핸드오프를 받아 ${pName}의 득점.`);
             break;
        case 'Transition':
             logs.push(`${pName}, 빠른 속공으로 레이업 올려놓습니다.`);
             break;
        default:
             logs.push(`${pName}, 득점 성공.`);
    }

    return logs[Math.floor(Math.random() * logs.length)];
}

function getLocationName(zone: string): string {
    const names: Record<string, string> = {
        'Rim': '골밑',
        'Paint': '페인트존',
        'Mid': '미드레인지',
        '3PT': '3점 라인',
    };
    return names[zone] || '외곽';
}

function mapZoneToShotZone(simpleZone: 'Rim' | 'Paint' | 'Mid' | '3PT'): ShotZone {
    if (simpleZone === '3PT') {
        const r = Math.random();
        if (r < 0.2) return '3PT-Corn';
        if (r < 0.6) return '3PT-C';
        return '3PT-L'; // Simplified
    }
    if (simpleZone === 'Mid') return 'Mid-C';
    return simpleZone;
}

// --- Main Logic ---

export function resolvePossession(state: GameState): PossessionResult {
    const attTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    
    // 1. Determine Play Type & Actor
    const tactic = attTeam.tactics.offenseTactics[0];
    const playType = selectPlayType(tactic);
    const playContext = resolvePlayAction(attTeam, playType);
    
    const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playContext;
    const defender = defTeam.onCourt.sort((a, b) => b.attr.def - a.attr.def)[0]; // Simplified defender selection for now

    // 2. Calculate Time
    const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, tactic);

    // 3. Efficiency Modifiers
    const attEfficiency = calculateOffensiveEfficiency(attTeam); 
    const defEfficiency = calculateDefensiveEfficiency(defTeam);
    
    // --- Turnover Check ---
    let toChance = 0.12;
    if (playType === 'Iso') toChance = 0.10; // Less passing, fewer TOs
    if (playType === 'PnR_Handler') toChance = 0.14; // Traffic
    
    toChance -= (actor.archetypes.connector - 50) * 0.001; 
    toChance /= attEfficiency; 
    
    const pressure = (defTeam.tactics.sliders.defIntensity + defTeam.tactics.sliders.fullCourtPress) / 20; 
    toChance += (pressure * 0.05);

    if (Math.random() < toChance) {
        return {
            type: 'turnover',
            player: actor,
            secondaryPlayer: defender, // Credited with steal roughly
            timeTaken,
            logText: `${actor.playerName}, ${playType} 시도 중 턴오버.`,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    }

    // --- Shot Success Calculation ---
    // Base Rates
    let hitRate = 0.45; 
    if (preferredZone === 'Rim') hitRate = 0.60;
    if (preferredZone === '3PT') hitRate = 0.36;
    if (preferredZone === 'Mid') hitRate = 0.42;

    // Apply Play Bonus
    hitRate += bonusHitRate;

    // Attribute Modifier
    const offRating = preferredZone === '3PT' ? actor.attr.out : actor.attr.ins;
    const defRating = preferredZone === '3PT' ? defender.attr.perDef : defender.attr.intDef;
    hitRate += (offRating - defRating) * 0.002;

    // Efficiency Modifiers
    hitRate *= attEfficiency;
    hitRate *= (2.0 - defEfficiency); 

    const points = preferredZone === '3PT' ? 3 : 2;

    if (Math.random() < hitRate) {
        // MADE SHOT
        const logText = generateScoreLog(playContext);

        return {
            type: 'score',
            points: points,
            player: actor,
            secondaryPlayer: secondaryActor, // Assister
            timeTaken,
            logText,
            nextPossession: state.possession === 'home' ? 'away' : 'home',
            isDeadBall: false
        };
    } else {
        // MISSED SHOT
        // Rebound logic (Simplified)
        const rebounder = defTeam.onCourt.sort((a,b) => b.attr.reb - a.attr.reb)[0];
        
        return {
            type: 'miss',
            player: actor,
            rebounder: rebounder,
            timeTaken,
            logText: `${actor.playerName}, ${getLocationName(preferredZone)} 슛 실패.`,
            nextPossession: state.possession === 'home' ? 'away' : 'home', // Defensive rebound usually
            isDeadBall: false
        };
    }
}
