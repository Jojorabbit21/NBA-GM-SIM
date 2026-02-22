
import { Team, GameTactics, DepthChart } from '../../../../types';
import { TeamState, LivePlayer } from './pbpTypes';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { INITIAL_STATS, calculatePlayerOvr } from '../../../../utils/constants';
import { generateAutoTactics } from '../../tactics/tacticGenerator';

export function initTeamState(team: Team, tactics: GameTactics | undefined, depthChart?: DepthChart | null): TeamState {
    // 1. 전술이 없거나 뎁스차트가 없는 경우(AI팀 등) 자동 생성
    let safeTactics: GameTactics;
    if (!tactics || (!tactics.depthChart && !depthChart)) {
        safeTactics = generateAutoTactics(team);
    } else {
        // [Safety Fix for User Tactics]
        // Ensure all slider keys exist even if user tactics are missing them
        safeTactics = {
            ...tactics,
            sliders: {
                pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 5, zoneUsage: 5,
                ballMovement: 5, play_pnr: 5, play_post: 5, play_iso: 5, play_cns: 5, play_drive: 5,
                shot_3pt: 5, shot_mid: 5, shot_rim: 5, helpDef: 5, switchFreq: 5, zoneFreq: 5,
                ...tactics.sliders
            }
        };
    }

    const effectiveDepthChart = depthChart || safeTactics.depthChart;

    // 2. 로스터 정렬 및 라이브 플레이어 객체 생성
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    
    const liveRoster: LivePlayer[] = sortedRoster.map(p => {
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
        const attr = {
            ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
            speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
            stamina: p.stamina, durability: p.durability, hustle: p.hustle,
            height: p.height, weight: p.weight,
            handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
            passVision: p.passVision, passIq: p.passIq, shotIq: p.shotIq, offConsist: p.offConsist,
            postPlay: p.postPlay,
            def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
            helpDefIq: p.helpDefIq, defConsist: p.defConsist, passPerc: p.passPerc, drFoul: p.drawFoul, foulTendency: 50,
            reb: p.reb
        };

        const currentCondition = p.condition !== undefined ? p.condition : 100;

        return {
            playerId: p.id,
            playerName: p.name,
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            pf: 0, plusMinus: 0, mp: 0, g: 1, gs: 0,
            zoneData: { ...INITIAL_STATS() },
            // [Fix] Add condition to satisfy PlayerBoxScore interface
            condition: currentCondition,
            currentCondition,
            startCondition: currentCondition,
            position: p.position,
            ovr: calculatePlayerOvr(p),
            isStarter: false,
            health: p.health || 'Healthy',
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            lastSubInTime: 0,
            conditionAtSubIn: currentCondition,
            attr,
            archetypes: calculatePlayerArchetypes(attr, currentCondition),
            zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
            zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
            zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
            zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0,
            // [New] Ace Stopper Tracking
            matchupEffectSum: 0,
            matchupEffectCount: 0
        };
    });

    // 3. 선발 라인업 결정 로직 (Prioritize Rotation Map Minute 0)
    // 단장님 지시사항: 로테이션 차트가 절대 법이다.
    
    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];
    
    let startingIds: string[] = [];

    // [Step 1] 로테이션 맵의 0분대 설정 확인
    if (safeTactics.rotationMap) {
        Object.entries(safeTactics.rotationMap).forEach(([playerId, schedule]) => {
            // 0분(경기 시작)에 true로 설정된 선수 추출
            if (schedule[0] === true) {
                startingIds.push(playerId);
            }
        });
    }

    // [Step 2] 유효성 검사 및 보정 (정확히 5명이 아니면 뎁스차트/OVR순으로 채움)
    // 로테이션 차트가 비어있거나, 5명이 안되는 경우를 대비한 안전 장치
    if (startingIds.length !== 5) {
        const depthChartStarters = Object.values(safeTactics.starters).filter(id => id !== '');
        
        // 부족하면 뎁스 차트 주전에서 충원
        if (startingIds.length < 5) {
            for (const id of depthChartStarters) {
                if (startingIds.length >= 5) break;
                // 이미 로테이션 차트로 뽑힌 선수가 아니면 추가
                if (!startingIds.includes(id)) {
                    startingIds.push(id);
                }
            }
        }

        // 그래도 부족하면(AI팀 등) OVR 높은 순으로 충원
        if (startingIds.length < 5) {
            for (const p of sortedRoster) {
                if (startingIds.length >= 5) break;
                if (!startingIds.includes(p.id)) {
                    startingIds.push(p.id);
                }
            }
        }

        // 5명 초과면(실수로 6명 체크 등) 앞에서부터 5명만 자름
        if (startingIds.length > 5) {
            startingIds = startingIds.slice(0, 5);
        }
    }
    
    // 4. 결정된 ID를 기반으로 코트/벤치 배정
    liveRoster.forEach(p => {
        if (startingIds.includes(p.playerId)) {
            p.isStarter = true;
            p.gs = 1;
            p.lastSubInTime = 720; // 12 mins remaining
            onCourt.push(p);
        } else {
            bench.push(p);
        }
    });

    // [New] Determine Ace Player (Highest OVR Starter)
    // Reduce used to safely find max OVR player without sorting array in place
    const acePlayer = onCourt.length > 0 
        ? onCourt.reduce((prev, curr) => (prev.ovr > curr.ovr) ? prev : curr, onCourt[0])
        : null;

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: safeTactics,
        depthChart: effectiveDepthChart || undefined,
        onCourt,
        bench,
        timeouts: 7,
        fouls: 0,
        bonus: false,
        acePlayerId: acePlayer ? acePlayer.playerId : undefined // Assign Ace ID
    };
}
