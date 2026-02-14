
import { GameState, PossessionResult, LivePlayer, TeamState, ShotEvent } from './pbpTypes';
import { PbpLog, PlayType } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveDynamicZone } from '../shotDistribution';
import { generateShotCoordinate, CourtSide } from '../../../../utils/courtCoordinates';

/**
 * Generates a descriptive text for the shot based on PlayType and Zone.
 */
function getShotDescription(
    actor: LivePlayer, 
    playType: PlayType | undefined, 
    zone: 'Rim' | 'Paint' | 'Mid' | '3PT' | undefined,
    isMake: boolean
): string {
    if (!zone || !playType) return isMake ? '득점 성공' : '슛 실패';

    const canDunk = actor.attr.vertical > 70 && actor.attr.ins > 60; // Simple check
    const descriptions: string[] = [];

    // 1. 3-Point Line
    if (zone === '3PT') {
        if (playType === 'CatchShoot' || playType === 'PnR_Pop') {
            descriptions.push('캐치앤슛 3점', '오픈 찬스 3점', '패스를 받아 3점슛', '빠른 릴리즈의 3점');
        } else if (playType === 'Iso') {
            descriptions.push('스텝백 3점', '풀업 3점', '드리블 후 3점', '수비를 앞에 두고 3점');
        } else if (playType === 'Transition') {
            descriptions.push('트랜지션 3점', '속공 상황에서 3점', '얼리 오펜스 3점');
        } else {
            descriptions.push('외곽 3점슛', '3점 라인 밖 점퍼');
        }
    } 
    // 2. Mid-Range
    else if (zone === 'Mid') {
        if (playType === 'PnR_Handler') {
            descriptions.push('스크린을 타고 풀업 점퍼', '미드레인지 풀업', '자유투 라인 점퍼');
        } else if (playType === 'Iso') {
            descriptions.push('페이드어웨이', '드리블 돌파 후 점퍼', '풀업 미드레인지', '미드레인지 점퍼');
        } else if (playType === 'PostUp') {
            descriptions.push('포스트업 페이드어웨이', '턴어라운드 점퍼', '포스트업 후 훅슛');
        } else {
            descriptions.push('미드레인지 슛', '중거리 슛');
        }
    } 
    // 3. Paint / Rim
    else {
        if (playType === 'PnR_Roll') {
            if (canDunk) descriptions.push('앨리웁 덩크', '강력한 덩크', '투핸드 덩크');
            descriptions.push('픽앤롤 레이업', '골밑 마무리', '빈 공간을 파고들어 레이업');
        } else if (playType === 'Cut') {
            if (canDunk) descriptions.push('컷인 덩크', '원핸드 슬램');
            descriptions.push('백도어 컷 레이업', '기습적인 골밑 득점', '리버스 레이업');
        } else if (playType === 'Transition') {
            if (canDunk) descriptions.push('속공 덩크', '트랜지션 슬램', '원맨 속공 덩크');
            descriptions.push('속공 레이업', '유로스텝 레이업', '코스트 투 코스트');
        } else if (playType === 'PostUp') {
            if (canDunk) descriptions.push('포스트업 후 덩크');
            descriptions.push('포스트업 훅슛', '골밑 훅슛', '드롭스텝 레이업', '파워 레이업');
        } else {
            // ISO or others driving to rim
            if (canDunk) descriptions.push('드라이브 덩크', '돌파 후 덩크');
            descriptions.push('드라이브 레이업', '플로터', '핑거롤 레이업', '더블 클러치', '컨택을 이겨내고 레이업');
        }
    }

    // Return random flavor text
    return descriptions[Math.floor(Math.random() * descriptions.length)];
}

/**
 * Applies the result of a possession to the player and team stats.
 * Also generates the PBP log entry.
 */
export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal, offTeam, defTeam, isAndOne, playType } = result;

    // Helper to increment foul
    const commitFoul = (defP: LivePlayer) => {
        defP.pf += 1;
        defTeam.fouls += 1;
        
        // [New] Immediate Foul Out Alert
        if (defP.pf === 6) {
             addLog(state, defTeam.id, `🚨 ${defP.playerName} 6반칙 퇴장 (Foul Out)`, 'info');
        }
    };

    // Helper to update Plus/Minus for players currently on court
    const updatePlusMinus = (scoreDelta: number) => {
        if (scoreDelta === 0) return;
        offTeam.onCourt.forEach(p => p.plusMinus += scoreDelta);
        defTeam.onCourt.forEach(p => p.plusMinus -= scoreDelta);
    };

    // [New] Shot Coordinate Generation Logic
    if ((type === 'score' || type === 'miss') && zone) {
        // Determine court side based on home/away possession
        // [Update] Fixed Sides: Home always shoots Right, Away always shoots Left.
        // This keeps the chart cleaner for analysis without confusing side switches.
        const side: CourtSide = (offTeam.id === state.home.id) ? 'Right' : 'Left';

        const coords = generateShotCoordinate(zone, side);
        
        const shotEvent: ShotEvent = {
            id: `shot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            quarter: state.quarter,
            gameClock: state.gameClock,
            teamId: offTeam.id,
            playerId: actor.playerId,
            x: coords.x,
            y: coords.y,
            zone: zone,
            isMake: type === 'score',
            playType: playType,
            assistPlayerId: assister?.playerId
        };
        
        state.shotEvents.push(shotEvent);
    }

    // 1. Base Stats
    if (type === 'score') {
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) {
            actor.p3m += 1;
            actor.p3a += 1;
        }
        
        if (zone) updateZoneStats(actor, zone, true);
        if (assister) assister.ast += 1;

        offTeam.score += points;
        
        // [Update] Apply +/- for the field goal
        updatePlusMinus(points);

        // [New] Rich Shot Description
        const shotDesc = getShotDescription(actor, playType, zone, true);
        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} ${shotDesc} 성공`;
        
        if (assister) logText += ` (AST: ${assister.playerName})`;
        
        // [FIX] Accurately calculate total points for the log including And-One
        let totalPointsAdded = points; 

        // Handle And-1
        if (isAndOne && defender) {
            commitFoul(defender);
            // Simple FT logic: 80% chance to convert And-1
            if (Math.random() < (actor.attr.ft / 100)) {
                actor.pts += 1;
                actor.ftm += 1;
                actor.fta += 1;
                offTeam.score += 1;
                totalPointsAdded += 1; // Add bonus point to log tracker
                
                // [Update] Apply +/- for the And-1 FT
                updatePlusMinus(1);
                logText += ` + 앤드원 성공 (파울: ${defender.playerName})`;
            } else {
                actor.fta += 1;
                logText += ` + 앤드원 실패 (파울: ${defender.playerName})`;
            }
        }
        
        addLog(state, offTeam.id, logText, 'score', totalPointsAdded);

    } else if (type === 'miss') {
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false);

        // [New] Rich Miss Description
        const shotDesc = getShotDescription(actor, playType, zone, false);
        // Remove '성공'/'실패' suffixes from helper if they exist (though helper currently doesn't add them for specific types)
        // We construct the sentence here.
        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} ${shotDesc} 실패`;

        if (isBlock && defender) {
            defender.blk += 1;
            logText += ` (블록: ${defender.playerName})`;
            addLog(state, defTeam.id, logText, 'block');
        } else {
            addLog(state, offTeam.id, logText, 'miss');
        }

        if (rebounder) {
            rebounder.reb += 1;
            const rebType = rebounder.playerId === actor.playerId || state.home.onCourt.includes(rebounder) === state.home.onCourt.includes(actor) ? 'off' : 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;
            
            // "Putback" hint can be inferred here if offensive rebound
            addLog(state, rebounder.playerId, `${rebounder.playerName} 리바운드 (${rebType === 'off' ? '공격' : '수비'})`, 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        let logText = `[${offTeam.id.toUpperCase()}] ${actor.playerName} 턴오버`;
        
        if (isSteal && defender) {
            defender.stl += 1;
            logText += ` (스틸: ${defender.playerName})`;
        }
        addLog(state, offTeam.id, logText, 'turnover');
    
    } else if (type === 'foul') {
        // Defensive Foul on the floor (Non-shooting)
        if (defender) commitFoul(defender);
        addLog(state, defTeam.id, `${defender?.playerName} 수비 파울 (팀 파울 ${defTeam.fouls})`, 'foul');
        
        // Bonus Situation Check? (Simplified: If fouls > 4, shoot FTs)
        if (defTeam.fouls > 4) {
            // 2 Free Throws
            let ftMade = 0;
            actor.fta += 2;
            const ftPct = actor.attr.ft / 100;
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            
            // [Update] Apply +/- for Penalty FTs
            updatePlusMinus(ftMade);
            
            addLog(state, offTeam.id, `${actor.playerName} 자유투 ${ftMade}/2 성공`, 'freethrow', ftMade);
        }

    } else if (type === 'freethrow') {
        // Shooting Foul (Missed Shot)
        if (defender) commitFoul(defender);
        
        const numShots = 2; // Simplify 2 or 3 shots to 2 for now
        let ftMade = 0;
        actor.fta += numShots;
        const ftPct = actor.attr.ft / 100;
        
        for (let i=0; i<numShots; i++) {
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        }
        
        // [Update] Apply +/- for Shooting Foul FTs
        updatePlusMinus(ftMade);
        
        // [New] Detailed Foul Log with Defender Name
        addLog(state, offTeam.id, `${actor.playerName} 슈팅 파울 - 자유투 ${ftMade}/${numShots} 성공 (파울: ${defender?.playerName})`, 'freethrow', ftMade);
    }
}

function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean) {
    if (zone === 'Rim' || zone === 'Paint') {
        p.rimA++;
        if (isMake) p.rimM++;
    } else if (zone === 'Mid') {
        p.midA++;
        if (isMake) p.midM++;
    }
    // Specific Sub-Zone Update
    const subZoneKey = resolveDynamicZone(p, zone);
    const attemptKey = `${subZoneKey}_a` as keyof LivePlayer;
    if (typeof p[attemptKey] === 'number') (p as any)[attemptKey]++;
    if (isMake) {
        const makeKey = `${subZoneKey}_m` as keyof LivePlayer;
        if (typeof p[makeKey] === 'number') (p as any)[makeKey]++;
    }
}

function addLog(state: GameState, teamId: string, text: string, type: PbpLog['type'], points?: number) {
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId,
        text,
        type,
        points: points as 1 | 2 | 3 | undefined
    });
}
