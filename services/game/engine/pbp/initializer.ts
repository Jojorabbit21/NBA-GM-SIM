
import { Team, GameTactics, DepthChart, Player } from '../../../../types';
import { LeagueCoachingData } from '../../../../types/coaching';
import { TeamState, LivePlayer } from './pbpTypes';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { INITIAL_STATS, calculatePlayerOvr } from '../../../../utils/constants';
import { generateAutoTactics } from '../../tactics/tacticGenerator';
import { getCoachPreferences } from '../../../coachingStaff/coachGenerator';
import { generateSaveTendencies, DEFAULT_TENDENCIES } from '../../../../utils/hiddenTendencies';
import { DEFAULT_SLIDERS } from '../../config/tacticPresets';

/**
 * Player.tendencies.zones(선수 DNA) → 4존 선호도(ra/itp/mid/three) 정규화.
 * RA(Restricted Area)와 ITP(In The Paint)를 별도 존으로 분리.
 * - RA: Dunk, Layup (피지컬 피니시)
 * - ITP: Floater, Hook, Short Jumper (closeShot 기반 스킬 피니시)
 * 텐던시 데이터가 없으면 능력치 기반 fallback.
 */
function buildZonePref(p: Player): { ra: number; itp: number; mid: number; three: number } {
    let rawRa: number, rawItp: number, rawMid: number, rawThree: number;

    if (p.tendencies?.zones) {
        const z = p.tendencies.zones;
        rawRa    = z.ra || 0;
        rawItp   = z.itp || 0;
        rawMid   = z.mid || 0;
        rawThree = (z.cnr || 0) + (z.p45 || 0) + (z.atb || 0);
    } else {
        // fallback: 능력치 기반
        rawRa    = p.ins || 70;
        rawItp   = 35;
        rawMid   = p.midRange || 70;
        rawThree = ((p.threeCorner || 70) + (p.three45 || 70) + (p.threeTop || 70)) / 3;
    }

    const total = rawRa + rawItp + rawMid + rawThree || 1;
    return {
        ra:    rawRa / total,
        itp:   rawItp / total,
        mid:   rawMid / total,
        three: rawThree / total,
    };
}

export function initTeamState(team: Team, tactics: GameTactics | undefined, depthChart?: DepthChart | null, tendencySeed?: string, archetypesEnabled?: boolean, coachingData?: LeagueCoachingData | null): TeamState {
    // 1. 전술이 없거나 뎁스차트가 없는 경우(AI팀 등) 자동 생성
    let safeTactics: GameTactics;
    if (!tactics || (!tactics.depthChart && !depthChart)) {
        const coachPrefs = getCoachPreferences(coachingData, team.id);
        safeTactics = generateAutoTactics(team, coachPrefs);
    } else {
        // [Safety Fix for User Tactics]
        // Ensure all slider keys exist even if user tactics are missing them
        safeTactics = {
            ...tactics,
            sliders: {
                ...DEFAULT_SLIDERS,
                ...tactics.sliders
            },
            rotationMap: tactics.rotationMap
                ? Object.fromEntries(
                    Object.entries(tactics.rotationMap).map(([pid, arr]) => [pid, [...arr]])
                  )
                : {}
        };
    }

    const effectiveDepthChart = depthChart || safeTactics.depthChart;

    // 뎁스차트에서 선수의 슬롯 포지션 조회 (PG슬롯에 배치된 SG → "PG" 반환)
    const getSlotPosition = (playerId: string): string | null => {
        if (!effectiveDepthChart) return null;
        for (const pos of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
            if (effectiveDepthChart[pos]?.includes(playerId)) return pos;
        }
        return null;
    };

    // 2. 로스터 정렬 및 라이브 플레이어 객체 생성
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    
    const liveRoster: LivePlayer[] = sortedRoster.map(p => {
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
        const attr = {
            ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
            threeCorner: p.threeCorner, three45: p.three45, threeTop: p.threeTop,
            layup: p.layup ?? p.ins, dunk: p.dunk ?? p.ins, closeShot: p.closeShot ?? p.ins,
            speed: p.speed, spdBall: p.spdBall, agility: p.agility, strength: p.strength, vertical: p.vertical,
            stamina: p.stamina, durability: p.durability, hustle: p.hustle,
            height: p.height, weight: p.weight,
            handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
            passVision: p.passVision, passIq: p.passIq, offBallMovement: p.offBallMovement ?? 70,
            shotIq: p.shotIq, offConsist: p.offConsist,
            postPlay: p.postPlay,
            def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
            helpDefIq: p.helpDefIq, defConsist: p.defConsist, passPerc: p.passPerc, drFoul: p.drawFoul,
            reb: p.reb,
            offReb: p.offReb ?? p.reb,
            defReb: p.defReb ?? p.reb,
            boxOut: p.boxOut ?? 70,
            intangibles: p.intangibles ?? 70
        };

        const currentCondition = p.condition !== undefined ? p.condition : 100;

        return {
            playerId: p.id,
            playerName: p.name,
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            pf: 0, techFouls: 0, flagrantFouls: 0, plusMinus: 0, mp: 0, g: 1, gs: 0,
            zoneData: { ...INITIAL_STATS() },
            // [Fix] Add condition to satisfy PlayerBoxScore interface
            condition: currentCondition,
            currentCondition,
            startCondition: currentCondition,
            position: getSlotPosition(p.id) || p.position,
            ovr: calculatePlayerOvr(p),
            isStarter: false,
            health: p.health || 'Healthy',
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            lastSubInTime: 0,
            conditionAtSubIn: currentCondition,
            attr,
            archetypes: calculatePlayerArchetypes(attr, currentCondition, archetypesEnabled),
            tendencies: tendencySeed ? generateSaveTendencies(tendencySeed, p.id) : DEFAULT_TENDENCIES,
            zonePref: buildZonePref(p),
            zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
            zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
            zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
            zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0,
            // [New] Hot/Cold Streak
            hotColdRating: 0,
            recentShots: [],
            // [New] Temporary Bench Tracking
            benchReason: null,
            benchedAtMinute: undefined,
            benchedAtQuarter: undefined,
            scheduledReturnMinute: undefined,
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

    // [Fix] 로스터에 실제 존재하는 선수만 남김 (트레이드/방출 후 맵에 유령 ID 잔존 방지)
    const rosterIdSet = new Set(sortedRoster.map(p => p.id));
    startingIds = startingIds.filter(id => rosterIdSet.has(id));

    // [Fix] 부상 선수는 선발에서 제외
    const injuredIds = new Set(sortedRoster.filter(p => p.health === 'Injured').map(p => p.id));
    startingIds = startingIds.filter(id => !injuredIds.has(id));

    // [Step 2] 유효성 검사 및 보정 (정확히 5명이 아니면 뎁스차트/OVR순으로 채움)
    // 로테이션 차트가 비어있거나, 5명이 안되는 경우를 대비한 안전 장치
    if (startingIds.length !== 5) {
        const depthChartStarters = Object.values(safeTactics.starters).filter(id => id !== '');
        
        // 부족하면 뎁스 차트 주전에서 충원 (부상 선수 제외)
        if (startingIds.length < 5) {
            for (const id of depthChartStarters) {
                if (startingIds.length >= 5) break;
                if (!startingIds.includes(id) && !injuredIds.has(id)) {
                    startingIds.push(id);
                }
            }
        }

        // 그래도 부족하면(AI팀 등) OVR 높은 순으로 충원 (부상 선수 제외)
        if (startingIds.length < 5) {
            for (const p of sortedRoster) {
                if (startingIds.length >= 5) break;
                if (!startingIds.includes(p.id) && !injuredIds.has(p.id)) {
                    startingIds.push(p.id);
                }
            }
        }

        // [EMERGENCY] 건강한 선수 5명 미만 시 부상 선수라도 기용 (기권패 방지)
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
    
    // 3.5. 부상 선수의 로테이션 시간을 뎁스차트 기반으로 백업에게 승계
    if (safeTactics.rotationMap && effectiveDepthChart && injuredIds.size > 0) {
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        for (const injuredId of injuredIds) {
            const injuredMap = safeTactics.rotationMap[injuredId];
            if (!injuredMap || !injuredMap.some(Boolean)) continue;

            // 해당 선수의 뎁스차트 포지션 및 순번 찾기
            let rolePos: keyof DepthChart | null = null;
            let depthIndex = -1;
            for (const pos of positions) {
                const chart = effectiveDepthChart[pos];
                if (!chart) continue;
                const idx = chart.indexOf(injuredId);
                if (idx !== -1) { rolePos = pos; depthIndex = idx; break; }
            }

            // 승계 대상 찾기: 같은 포지션의 다음 순번 → 없으면 OVR 높은 건강한 선수
            let successorId: string | null = null;
            if (rolePos) {
                const chart = effectiveDepthChart[rolePos];
                for (let i = depthIndex + 1; i < chart.length; i++) {
                    if (chart[i] && !injuredIds.has(chart[i])) {
                        successorId = chart[i];
                        break;
                    }
                }
            }
            if (!successorId) {
                // 뎁스차트에 대체자가 없으면 OVR순 건강한 선수
                const fallback = sortedRoster.find(p =>
                    p.health !== 'Injured' && p.id !== injuredId &&
                    !safeTactics.rotationMap![p.id]?.some(Boolean)
                );
                if (fallback) successorId = fallback.id;
            }

            if (successorId) {
                if (!safeTactics.rotationMap[successorId]) {
                    safeTactics.rotationMap[successorId] = Array(48).fill(false);
                }
                // 부상 선수의 출전 시간을 승계자에게 이전
                for (let i = 0; i < 48; i++) {
                    if (injuredMap[i]) {
                        safeTactics.rotationMap[successorId][i] = true;
                    }
                }
            }
            // 부상 선수의 맵 비움
            for (let i = 0; i < 48; i++) injuredMap[i] = false;
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
        timeouts: 4,
        fouls: 0,
        bonus: false,
        acePlayerId: acePlayer ? acePlayer.playerId : undefined // Assign Ace ID
    };
}
