
import { GameState, PossessionResult, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';
import { resolveRebound } from './reboundLogic';
import { SIM_CONFIG } from '../../config/constants';

// Modularized Imports
import { generateCommentary, getReboundCommentary, getFreeThrowReboundCommentary, getTechnicalFoulCommentary, getFlagrant1Commentary, getFlagrant2Commentary, getShootingFoulCommentary } from '../commentary/textGenerator';
import { updateZoneStats, updatePlusMinus } from './handlers/statUtils';
import { recordShotEvent } from './handlers/visUtils';

function bumpDefendedShot(defender: LivePlayer, broadZone: string, subZone: string | undefined, isMake: boolean): void {
    defender.contestedAttempted = (defender.contestedAttempted ?? 0) + 1;
    if (isMake) defender.contestedMade = (defender.contestedMade ?? 0) + 1;

    const zone6 =
        subZone === 'zone_rim'    ? 'RA' :
        subZone === 'zone_paint'  ? 'ITP' :
        subZone === 'zone_mid_l' || subZone === 'zone_mid_c' || subZone === 'zone_mid_r' ? 'MID' :
        subZone === 'zone_c3_l'  || subZone === 'zone_c3_r'  ? 'CNR' :
        subZone === 'zone_atb3_l'|| subZone === 'zone_atb3_r' ? 'WING' :
        subZone === 'zone_atb3_c' ? 'ATB' :
        broadZone === 'Rim' ? 'RA' :
        broadZone === 'Paint' ? 'ITP' :
        broadZone === 'Mid' ? 'MID' :
        broadZone === '3PT' ? 'ATB' : null;

    if (zone6) {
        const keyA = `def${zone6}Attempted` as keyof LivePlayer;
        const keyM = `def${zone6}Made` as keyof LivePlayer;
        (defender[keyA] as number) = ((defender[keyA] as number) ?? 0) + 1;
        if (isMake) (defender[keyM] as number) = ((defender[keyM] as number) ?? 0) + 1;
    }
}

/**
 * Hot/Cold Streak 업데이트
 * 슛 결과 후 호출하여 선수의 핫/콜드 레이팅 갱신
 */
function updateHotCold(player: LivePlayer, isMake: boolean): void {
    player.recentShots.push(isMake);
    if (player.recentShots.length > 5) player.recentShots.shift();

    const total = player.recentShots.length;
    if (total < 2) { player.hotColdRating = 0; return; }

    const makes = player.recentShots.filter(Boolean).length;
    const recentPct = makes / total;

    // 3연속 성공/실패 시 스트릭 보너스
    let streakBonus = 0;
    if (total >= 3) {
        const last3 = player.recentShots.slice(-3);
        if (last3.every(Boolean)) streakBonus = 0.15;
        else if (last3.every(s => !s)) streakBonus = -0.15;
    }

    player.hotColdRating = Math.max(-1, Math.min(1,
        (recentPct - 0.5) * 1.5 + streakBonus
    ));
}

/**
 * 쿼터 전환 / 타임아웃 시 핫/콜드 반감
 */
export function dampenHotCold(team: { onCourt: LivePlayer[], bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating *= 0.5;
        // 앞 2개 제거 (최근 기록만 남김)
        if (p.recentShots.length > 2) {
            p.recentShots = p.recentShots.slice(-3);
        }
    });
}

/**
 * 하프타임 시 핫/콜드 완전 리셋
 */
export function resetHotCold(team: { onCourt: LivePlayer[], bench: LivePlayer[] }): void {
    [...team.onCourt, ...team.bench].forEach(p => {
        p.hotColdRating = 0;
        p.recentShots = [];
    });
}

/**
 * Helper to add a log entry to the GameState
 * possessionOutcome이 주어지면 이 로그를 "포제션이 끝나는 시점"으로 스탬프한다(인사이트 차트
 * 포제션 마커용) — 오펜시브 리바운드/테크니컬·플래그런트 파울(공격권 유지)처럼 포제션이 계속되는
 * 경우는 호출부에서 이 인자를 생략한다. possessionTeamId는 이 포제션의 실제 공격팀 — 블록/수비파울
 * 로그처럼 teamId가 수비팀으로 찍히는 경우를 위해 별도로 받는다(생략 시 teamId를 그대로 씀).
 */

// [2026-10-08] PBP 공격권 안내용 연고지명. 싱글은 TeamState.city("밀워키"), 멀티는 city가 비어 있고
// name이 "밀워키 스태그스" 형태(leagueService가 `${city} ${name}`으로 생성, 유저 개명 가능)라
// 첫 어절을 연고지로 간주. 어절이 하나뿐이면 이름 전체를 사용.
function regionOf(team: { name: string; city?: string }): string {
    const city = team.city?.trim();
    if (city) return city;
    const first = team.name.trim().split(/\s+/)[0];
    return first || team.name;
}

function addLog(state: GameState, teamId: string, text: string, type: PbpLog['type'], points?: number, foulTeamId?: string, possessionOutcome?: PbpLog['possessionOutcome'], possessionTeamId?: string) {
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId,
        text,
        type,
        points: points as 1 | 2 | 3 | undefined,
        foulTeamId,
        isPossessionEnd: possessionOutcome ? true : undefined,
        possessionOutcome,
        possessionTeamId: possessionOutcome ? (possessionTeamId ?? teamId) : undefined,
    });
}

/**
 * Applies the result of a possession to the player and team stats.
 * Also generates the PBP log entry.
 * Acts as the main orchestrator for Game Rule application (And-1, Bonus, Rebounds).
 */
// ── [2026-10-18] 플레이타입별 실적 집계(멀티 PPP) ─────────────────────────────────
// 플레이 1회 = 그 playType으로 끝난 슛(성공/실패)·턴오버·오펜시브 파울·샷클락 위반·슈팅 파울 자유투·보너스 자유투.
// 비보너스 파울(자유투 없음 → 공격 계속)·테크니컬·플래그런트(플레이와 무관한 자유투)·싸움은 제외.
// 공격 리바운드로 이어진 공격은 다음 applyPossessionResult 호출에서 별도 플레이로 잡힌다.
// pts/fta는 applyPossessionResult 진입~종료 사이 공격팀 점수·슈터 자유투 시도 증가분(앤드원·자유투 포함).
// client(services/game/engine/pbp/statsMappers.ts) ↔ server(server/src/shared/engine/pbp/statsMappers.ts) 미러.
const PLAY_TYPE_COUNTED_RESULTS = new Set<PossessionResult['type']>([
    'score', 'miss', 'turnover', 'offensiveFoul', 'shotClockViolation', 'freethrow', 'foul',
]);
function recordPlayTypeStat(state: GameState, result: PossessionResult, pts: number, fta: number): void {
    const { type, playType, offTeam } = result;
    if (!playType || !PLAY_TYPE_COUNTED_RESULTS.has(type)) return;
    if (type === 'foul' && fta <= 0) return; // 비보너스 파울 — 공격이 이어지므로 플레이 미종료
    if (!state.playTypeStats) state.playTypeStats = {};
    let byTeam = state.playTypeStats[offTeam.id];
    if (!byTeam) { byTeam = {}; state.playTypeStats[offTeam.id] = byTeam; }
    let line = byTeam[playType];
    if (!line) { line = { poss: 0, pts: 0, fga: 0, fgm: 0, fta: 0, tov: 0 }; byTeam[playType] = line; }
    line.poss += 1;
    line.pts += pts;
    line.fta += fta;
    if (type === 'score') { line.fga += 1; line.fgm += 1; }
    else if (type === 'miss') { line.fga += 1; }
    else if (type === 'turnover' || type === 'offensiveFoul' || type === 'shotClockViolation') { line.tov += 1; }
}

export function applyPossessionResult(state: GameState, result: PossessionResult) {
    const { type, actor, defender, assister, rebounder, points, zone, isBlock, isSteal, offTeam, defTeam, isAndOne, playType } = result;
    const { isSwitch, isMismatch, isBotchedSwitch, pnrCoverage } = result;
    // [2026-10-18] 플레이타입 실적 — 이 플레이로 난 득점/자유투를 진입·종료 차이로 계산(recordPlayTypeStat)
    const ptScoreBefore = offTeam.score;
    const ptFtaBefore = actor.fta;

    // 1. Update Matchup Tracking (Ace Stopper Logic)
    if (result.isAceTarget && typeof result.matchupEffect === 'number') {
        actor.matchupEffectSum += result.matchupEffect;
        actor.matchupEffectCount += 1;
    }

    // Helper: Commit Foul — 이번 파울이 6번째(퇴장)면 true 반환.
    // [2026-10-07] 예전엔 여기서 `🚨 X 6반칙 퇴장 (Foul Out)` info 로그를 별도로 찍었는데(파울 로그보다
    // 먼저 찍히는 순서 문제 + 오펜시브 파울은 접미사와 중복), 이제 호출부가 파울 커멘터리 끝에
    // 퇴장 문장(" 6반칙으로 파울 아웃됩니다.")을 이어붙인다. 전용 로그/사이렌 이모지 제거.
    const commitFoul = (defP: LivePlayer): boolean => {
        defP.pf += 1;
        defTeam.fouls += 1;
        if (defP.pf === 6) defP.ejectionReason = 'foul_out';
        return defP.pf === 6;
    };

    // Helper: Resolve rebound on missed free throw (로그는 직접 안 찍고 결과만 반환)
    // [2026-10-07] 아래 2026-08-05 설명의 "한 줄로 합치는 방식"은 폐기 — 지금은 별도 줄(아래 FtRebound 참조).
    // [Fix 2026-08-05] "자유투 실패 → 리바운드" 순서로 보여야 하는데, 이 헬퍼가 자유투 결과
    // 로그보다 먼저 자기 리바운드 로그를 addLog로 즉시 찍어버려서 "리바운드 → 자유투 실패"로
    // 순서가 뒤집혀 있었음. 호출부가 리바운드 텍스트를 돌려받아 자유투 로그 문장 뒤에 이어붙여
    // 한 줄로 합치는 방식으로 변경 — 순서 문제 자체가 구조적으로 발생할 수 없게 됨.
    // 반환값(rebType)으로 호출부가 "오펜시브 리바운드라 포제션이 계속되는지"를 판단해
    // isPossessionEnd 스탬프 여부를 결정한다 — FG 미스 경로(missEndsPossession)와 동일 기준.
    // [2026-10-07] 리바운드를 자유투 로그와 "별도 줄"로 분리 — 호출부가 자유투 로그를 먼저 찍은 뒤
    // 반환된 player/text로 리바운드 info 로그를 이어서 찍는다(순서는 그대로 보장, 줄만 분리).
    type FtRebound = { type: 'off' | 'def'; text: string; player: LivePlayer };
    // 리바운드 로그의 teamId는 리바운더의 팀 ID — 예전 FG 미스 리바운드는 playerId를 넣어 뷰에서
    // 항상 원정 쪽(isHome=false)에 표시되던 버그가 있었음. resolveRebound의 슈터 팀 판별과 동일 방식.
    const teamIdOf = (pl: LivePlayer): string =>
        state.home.onCourt.some(x => x.playerId === pl.playerId) ? state.home.id : state.away.id;
    const handleFreeThrowRebound = (shooter: LivePlayer): FtRebound => {
        // [2026-07-31] TEAM_REB_RATE_FT 제거 — FG 미스와 동일한 증발 버그(possessionHandler.ts
        // 참고), 마지막 자유투 미스 시 항상 개인에게 배정하도록 단순화.
        const { player: rebPlayer, type: rebType } = resolveRebound(state.home, state.away, shooter.playerId);

        rebPlayer.reb += 1;
        if (rebType === 'off') rebPlayer.offReb += 1;
        else rebPlayer.defReb += 1;

        const rebText = getFreeThrowReboundCommentary(rebPlayer, rebType, shooter);
        return { type: rebType, text: rebText, player: rebPlayer };
    };

    // 2. Record Shot Event (Visualization)
    recordShotEvent(state, result);

    // [2026-08-03] Mismatch Announcement — score/miss 커멘터리(textGenerator.ts)는 이미
    // isMismatch를 반영한 전용 문구(예: "느린 수비를 제치고 골밑 득점 성공")를 갖고 있어서
    // 이 안내를 같이 띄우면 같은 사실을 두 줄로 중복 안내하게 됨. turnover/foul 커멘터리는
    // 아직 isMismatch 분기 문구가 없어(항상 isMismatch: false로 호출) 그 경우에만 이 안내로 대체.
    if (isMismatch && type !== 'score' && type !== 'miss') {
        addLog(state, offTeam.id, `⚡ 미스매치! ${actor.playerName}가 이점을 활용합니다.`, 'info');
    }

    // 3. Apply Logic based on Result Type
    if (type === 'score') {
        // Update Actor Stats
        actor.pts += points;
        actor.fgm += 1;
        actor.fga += 1;
        if (points === 3) {
            actor.p3m += 1;
            actor.p3a += 1;
        }
        if (zone) updateZoneStats(actor, zone, true, result.subZone);
        if (defender && zone) bumpDefendedShot(defender, zone, result.subZone, true);
        updateHotCold(actor, true);

        // Update Assist (Play-type-based probability — not all secondary actors earn credit)
        if (assister) {
            const assistOdds: Record<string, number> = {
                'CatchShoot':    0.97, // Kick-out to open shooter → 거의 항상 어시스트
                'DriveKick':     0.97, // 드라이브 킥아웃 = 의도적 패스
                'Cut':           0.95, // Passer to cutting slasher
                'OffBallScreen': 0.95, // 스크린 후 캐치앤슛, 의도적 패스
                'PnR_Pop':       0.95, // Handler kicks to popping big
                'PnR_Roll':      0.90, // Handler feeds rolling big
                'Handoff':       0.78, // Ball-handler hands off
                'Transition':    0.78, // 속공 아웃렛/푸시 패스 — 대부분 어시스트
                'PostUp':        0.55, // 엔트리 패스 크레딧 반영
                'PnR_Handler':   0.50, // PnR 진입 전 패스 + 스크린 어시스트 반영
                'Iso':           0.38, // 엔트리 패스 + 짧은 드리블 후 슛
                'Putback':       0.10, // Tip-in rarely credited
            };
            // [2026-07-31] PostUp/PnR_Roll 킥아웃은 더블팀을 뚫고 던지는 명백한 의도적 패스라
            // DriveKick(0.97)급으로 취급 — 원래 playType의 assistOdds(PostUp 0.55/PnR_Roll 0.90)는
            // 엔트리패스/앨리웁 기준으로 잡힌 값이라 킥아웃엔 안 맞음. 고정 0.9로 오버라이드.
            const prob = result.isKickout ? 0.9 : (playType ? (assistOdds[playType] ?? 0.60) : 0.60);
            if (Math.random() < prob) assister.ast += 1;
        }

        // Update Team Score
        offTeam.score += points;
        updatePlusMinus(offTeam, defTeam, points);

        // Generate Commentary
        let logText = generateCommentary('score', actor, defender, assister, playType, zone, {
            isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
            isBlock: false, isSteal: false, points, pnrCoverage: pnrCoverage || undefined,
            isKickout: !!result.isKickout
        }, result.shotType);
        
        // [2026-10-07] 앤드원을 득점 → 파울 → 자유투 3개 로그로 분리(비슈팅 파울과 동일 구조로 파울자 노출).
        // 득점 로그 points는 야투 점수만(예전엔 FT 포함 합산), 포제션 종료 마커는 마지막 로그(자유투)가 찍는다.
        // 팀스탯 PTS/쿼터 점수는 score+freethrow points 합산이라 총점 불변. 파울 로그에 foulTeamId를
        // 넣어 팀파울 집계(뷰)에도 포함 — 예전엔 득점 로그에 마커가 없어 앤드원 파울이 집계에서 빠졌음.
        addLog(state, offTeam.id, logText, 'score', points, undefined, (isAndOne && defender) ? undefined : 'scoring');

        if (isAndOne && defender) {
            const fouledOut = commitFoul(defender);
            let foulLog = getShootingFoulCommentary(defender, actor, playType, false, true);
            if (fouledOut) foulLog += ' 6반칙으로 파울 아웃됩니다.';
            foulLog += ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)`;
            addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);

            // 앤드원 자유투 1개 — 실패 시 리바운드 텍스트를 같은 줄에 이어붙임(순서 보장)
            let ftMade = 0;
            let ftEndsPossession = true;
            let ftReb: FtRebound | null = null;
            let ftLogText = `${actor.playerName}, 앤드원 자유투 `;
            actor.fta += 1;
            if (Math.random() < (actor.attr.ft / 100)) {
                actor.pts += 1; actor.ftm += 1; offTeam.score += 1; ftMade = 1;
                updatePlusMinus(offTeam, defTeam, 1);
                ftLogText += '1/1 성공';
            } else {
                ftLogText += '0/1 성공';
                ftReb = handleFreeThrowRebound(actor);
                ftEndsPossession = ftReb.type !== 'off';
            }
            // 야투가 이미 들어간 포제션이므로 자유투 결과와 무관하게 scoring
            addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? 'scoring' : undefined);
            if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');
        }

    } else if (type === 'miss') {
        // Update Stats
        actor.fga += 1;
        if (zone === '3PT') actor.p3a += 1;
        if (zone) updateZoneStats(actor, zone, false, result.subZone);
        if (defender && zone) bumpDefendedShot(defender, zone, result.subZone, false);
        updateHotCold(actor, false);

        // Generate Commentary
        let logText = generateCommentary('miss', actor, defender, assister, playType, zone, {
             isSwitch: !!isSwitch, isMismatch: !!isMismatch, isBotchedSwitch: !!isBotchedSwitch,
             isBlock: !!isBlock, isSteal: false, points: 0, pnrCoverage: pnrCoverage || undefined,
             isHelpPlay: !!result.isHelpPlay, isKickout: !!result.isKickout
        }, result.shotType);

        // 오펜시브 리바운드면 포제션이 계속되므로(같은 팀이 다시 공격) 이 미스 로그를
        // "포제션 종료"로 스탬프하지 않는다 — stepPossession()의 retainPossession(isOffReb) 판정과
        // 동일 기준(rebounder + reboundType==='off').
        const missEndsPossession = !(rebounder && result.reboundType === 'off');
        const missOutcome = missEndsPossession ? 'nonScoring' : undefined;

        // Handle Block Stat
        if (isBlock && defender) {
            defender.blk += 1;
            addLog(state, defTeam.id, logText, 'block', undefined, undefined, missOutcome, offTeam.id);
        } else {
            addLog(state, offTeam.id, logText, 'miss', undefined, undefined, missOutcome);
        }

        // Handle Rebound (Field Goal)
        if (rebounder) {
            rebounder.reb += 1;
            const rebType = result.reboundType || 'def';
            if (rebType === 'off') rebounder.offReb += 1;
            else rebounder.defReb += 1;

            // Rebound Log
            const rebText = getReboundCommentary(rebounder, rebType, actor, zone);
            addLog(state, teamIdOf(rebounder), rebText, 'info');
        }

    } else if (type === 'turnover') {
        actor.tov += 1;
        
        let logText = generateCommentary('turnover', actor, defender, undefined, playType, undefined, {
             isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
             isBlock: false, isSteal: !!isSteal, points: 0, pnrCoverage: pnrCoverage || undefined,
             isHelpPlay: !!result.isHelpPlay
        });
        
        if (isSteal && defender) {
            defender.stl += 1;
            defender.tovForced += 1;
        }
        addLog(state, offTeam.id, logText, 'turnover', undefined, undefined, 'turnover');

    } else if (type === 'foul') {
        const fouledOut = defender ? commitFoul(defender) : false;

        let logText = generateCommentary('foul', actor, defender, undefined, playType, undefined, {
             isSwitch: !!isSwitch, isMismatch: false, isBotchedSwitch: false,
             isBlock: false, isSteal: false, points: 0,
             isHelpPlay: !!result.isHelpPlay
        });

        // [2026-10-07] 구조: "이름, 파울 내용. [6반칙으로 파울 아웃됩니다.] (N반칙, 팀 N반칙)"
        if (fouledOut) logText += ' 6반칙으로 파울 아웃됩니다.';
        logText += defender ? ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)` : ` (팀 ${defTeam.fouls}반칙)`;
        // 보너스 자유투로 이어지면(아래) 그 자유투 로그가 진짜 포제션 종료 지점이므로 이 파울
        // 로그 자체는 스탬프하지 않는다 — 보너스가 아니면(자유투 없이 그대로 공격권 전환) 이
        // 파울 로그가 곧 포제션 종료(점수 변화 없는 nonScoring)다.
        addLog(state, defTeam.id, logText, 'foul', undefined, defTeam.id, defTeam.fouls > 4 ? undefined : 'nonScoring', offTeam.id);

        // Bonus Situation (Team Fouls > 4) -> 2 Free Throws
        if (defTeam.fouls > 4) {
            let ftMade = 0;
            const ftPct = actor.attr.ft / 100;
            const numShots = 2;

            actor.fta += numShots;

            // Shot 1
            if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }

            // Shot 2
            let lastShotMade = false;
            if (Math.random() < ftPct) {
                actor.ftm++; actor.pts++; offTeam.score++; ftMade++;
                lastShotMade = true;
            }

            updatePlusMinus(offTeam, defTeam, ftMade);

            // 마지막 자유투가 빗나가면 리바운드 결과부터 확인 — 오펜시브 리바운드면 포제션이
            // 계속되므로 이 자유투 로그를 포제션 종료로 스탬프하지 않는다(FG 미스 경로와 동일 기준).
            let ftEndsPossession = true;
            let ftReb: FtRebound | null = null;
            const ftLogText = `${actor.playerName}, 팀 파울로 얻은 자유투 ${ftMade}/${numShots} 성공`;
            if (!lastShotMade) {
                ftReb = handleFreeThrowRebound(actor);
                ftEndsPossession = ftReb.type !== 'off';
            }
            addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
            if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');
        }

    } else if (type === 'freethrow') {
        // Shooting Foul (2 shots normally, 3 shots if fouled on a 3PT attempt)
        // [2026-10-07] 파울 로그를 자유투 로그와 분리 — 비슈팅 파울과 동일 구조
        // "이름, 파울 내용. [6반칙으로 파울 아웃됩니다.] (N반칙, 팀 N반칙)".
        // foulTeamId(팀파울 집계 마커)는 자유투 로그 → 파울 로그로 이동(이중 집계 방지),
        // 포제션 종료 마커는 자유투 로그가 유지.
        if (defender) {
            const fouledOut = commitFoul(defender);
            let foulLog = getShootingFoulCommentary(defender, actor, playType, !!result.isHelpPlay, false);
            if (fouledOut) foulLog += ' 6반칙으로 파울 아웃됩니다.';
            foulLog += ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)`;
            addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);
        }

        const numShots = zone === '3PT' ? 3 : 2;
        let ftMade = 0;
        actor.fta += numShots;
        const ftPct = actor.attr.ft / 100;

        let lastShotMade = false;
        for (let i = 0; i < numShots; i++) {
            const made = Math.random() < ftPct;
            if (made) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
            if (i === numShots - 1) lastShotMade = made;
        }

        updatePlusMinus(offTeam, defTeam, ftMade);

        // 마지막 자유투가 빗나가면 리바운드 결과부터 확인 — 오펜시브 리바운드면 포제션이
        // 계속되므로 이 자유투 로그를 포제션 종료로 스탬프하지 않는다(FG 미스 경로와 동일 기준).
        let ftEndsPossession = true;
        let ftReb: FtRebound | null = null;
        const ftLogText = `${actor.playerName}, 자유투 ${ftMade}/${numShots} 성공`;
        if (!lastShotMade) {
            ftReb = handleFreeThrowRebound(actor);
            ftEndsPossession = ftReb.type !== 'off';
        }
        addLog(state, offTeam.id, ftLogText, 'freethrow', ftMade, undefined, ftEndsPossession ? (ftMade > 0 ? 'scoring' : 'nonScoring') : undefined);
        if (ftReb) addLog(state, teamIdOf(ftReb.player), ftReb.text, 'info');

    } else if (type === 'offensiveFoul') {
        // 오펜시브 파울: 공격자에게 PF + TOV, 수비팀 공 넘김
        actor.pf += 1;
        actor.tov += 1;

        const isCharge = result.foulSubtype === 'charge';
        // [2026-10-07] 구조: "이름, 차징/일리걸 스크린 오펜시브 파울. [6반칙으로 파울 아웃됩니다.] (N반칙, 팀 N반칙)"
        // 오펜시브 파울은 팀 파울(보너스)에 합산되지 않으므로 팀 반칙 수는 그대로(offTeam.fouls) 표기.
        const foulDesc = isCharge ? '차징' : '일리걸 스크린';
        const ejectionText = actor.pf >= 6 ? ' 6반칙으로 파울 아웃됩니다.' : '';
        if (actor.pf >= 6) actor.ejectionReason = 'foul_out';

        // 차징만 tovForced 귀속 — defConsist가 실제 확률에 기여해 인과관계 있음(일리걸 스크린은
        // flat rate라 defender 능력치와 무관, 귀속 제외)
        if (isCharge && defender) {
            defender.tovForced += 1;
        }

        addLog(state, offTeam.id, `${actor.playerName}, ${foulDesc} 오펜시브 파울.${ejectionText} (${actor.pf}반칙, 팀 ${offTeam.fouls}반칙)`, 'foul', undefined, undefined, 'turnover');

    } else if (type === 'technicalFoul') {
        // 테크니컬 파울: PF 미합산, 별도 techFouls 카운트, FT 1개(베스트 슈터), 공격권 유지
        if (defender) {
            defender.techFouls = (defender.techFouls || 0) + 1;
        }

        // [2026-07-29] 테크니컬 파울범이 공격팀 선수일 수도 있음(공수 양팀 후보로 확장됨) —
        // 자유투는 항상 "파울을 범하지 않은 쪽" 팀에게 귀속되어야 함(예전엔 defender가 항상
        // 수비수라는 전제로 offTeam에 고정돼 있었음).
        const foulerIsOffense = !!defender && offTeam.onCourt.some(p => p.playerId === defender.playerId);
        const ftTeam = foulerIsOffense ? defTeam : offTeam;
        const foulerTeam = foulerIsOffense ? offTeam : defTeam;

        // 베스트 FT 슈터가 자유투 1개
        const ftShooter = [...ftTeam.onCourt].sort((a, b) => b.attr.ft - a.attr.ft)[0];
        const ftPct = ftShooter.attr.ft / 100;
        ftShooter.fta += 1;
        let ftMade = 0;
        if (Math.random() < ftPct) {
            ftShooter.ftm += 1; ftShooter.pts += 1; ftTeam.score += 1; ftMade = 1;
            updatePlusMinus(ftTeam, foulerTeam, 1);
        }

        // 2 테크니컬 = 자동 퇴장
        const isEjected = defender && (defender.techFouls || 0) >= 2;
        if (isEjected && defender) {
            defender.ejectionReason = 'technical'; // pf는 건드리지 않음 — 퇴장은 isOut()이 ejectionReason으로 판정
        }

        // 해설 텍스트
        const commentaryBase = defender
            ? getTechnicalFoulCommentary(defender)
            : `테크니컬 파울이 선언됩니다!`;
        const ejectionSuffix = isEjected ? ' 2번째 테크니컬 파울로 퇴장당합니다.' : '';
        // [2026-10-07] 파울 로그 → 자유투 로그 분리. 테크니컬은 PF/팀파울 미합산이라 반칙 수 괄호 없음.
        // 자유투는 freethrow 타입으로 찍어야 뷰의 팀 PTS(score+freethrow points 합산)에 포함된다 —
        // 예전엔 foul 타입 한 줄에 points를 실어 팀스탯/쿼터 점수 집계에서 빠져 있었음.
        addLog(state, foulerTeam.id, `${commentaryBase}${ejectionSuffix}`, 'foul');
        // [2026-10-08] 테크니컬은 공격권에 영향 없음(중단 시점 팀 = offTeam이 재개). 자유투 팀 기준으로
        // 공격권이 같은 팀이면 "유지", 상대(offTeam)에게 가면 "넘어갑니다"로 분기.
        const possessionNote = ftTeam.id === offTeam.id
            ? `${regionOf(offTeam)}의 공격권이 유지됩니다.`
            : `${regionOf(offTeam)}에게 공격권이 넘어갑니다.`;
        addLog(state, ftTeam.id, `${ftShooter.playerName}, 테크니컬 자유투 ${ftMade}/1 성공. ${possessionNote}`, 'freethrow', ftMade);

    } else if (type === 'flagrantFoul') {
        // 플래그런트 파울: PF 합산, FT 2개(파울 당한 선수), 공격권 유지
        const fouledOut = defender ? commitFoul(defender) : false;

        const isFlagrant2 = result.isFlagrant2;

        // 자유투 2개 (파울 당한 공격자 = actor)
        const ftPct = actor.attr.ft / 100;
        actor.fta += 2;
        let ftMade = 0;
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        if (Math.random() < ftPct) { actor.ftm++; actor.pts++; offTeam.score++; ftMade++; }
        updatePlusMinus(offTeam, defTeam, ftMade);

        // flagrantFouls 카운트
        if (defender) {
            defender.flagrantFouls = (defender.flagrantFouls || 0) + 1;
        }

        // 해설 텍스트
        const commentary = defender
            ? (isFlagrant2 ? getFlagrant2Commentary(defender, actor, playType) : getFlagrant1Commentary(defender, actor, playType))
            : `플래그런트 ${isFlagrant2 ? '2' : '1'}!`;
        // [2026-10-07] 파울 로그 → 자유투 로그 분리. 구조는 다른 파울과 동일
        // "내용. [6반칙으로 파울 아웃됩니다.] (N반칙, 팀 N반칙)". F2는 커멘터리 자체가 "즉시 퇴장"이라
        // 6반칙 문장은 F1에서 6번째 파울이 된 경우에만 붙임. 자유투는 freethrow 타입(팀 PTS 집계 포함).
        let foulLog = commentary;
        if (fouledOut && defender && !isFlagrant2) foulLog += ' 6반칙으로 파울 아웃됩니다.';
        // [2026-10-19] NBA 규정: 한 경기에서 플래그런트 1을 두 번째로 받으면 자동 퇴장(PF는 그대로 +1만)
        if (defender && !isFlagrant2 && (defender.flagrantFouls || 0) >= 2 && !defender.ejectionReason) {
            defender.ejectionReason = 'flagrant';
            foulLog += ' 플래그런트 1을 두 번째로 받아 퇴장당합니다.';
        }
        foulLog += defender ? ` (${defender.pf}반칙, 팀 ${defTeam.fouls}반칙)` : ` (팀 ${defTeam.fouls}반칙)`;
        addLog(state, defTeam.id, foulLog, 'foul', undefined, defTeam.id);
        // [2026-10-08] 플래그런트는 파울당한 팀(offTeam)이 자유투 후 공격권 유지 — 로그에 명시
        addLog(state, offTeam.id, `${actor.playerName}, 플래그런트 자유투 ${ftMade}/2 성공. ${regionOf(offTeam)}의 공격권이 유지됩니다.`, 'freethrow', ftMade);

        // F2 = 즉시 퇴장. [2026-10-07] getFlagrant2Commentary 문장 풀이 전부 퇴장을 언급하므로 🚨 전용 로그 삭제
        if (isFlagrant2 && defender) {
            defender.ejectionReason = 'flagrant';
        }

    } else if (type === 'shotClockViolation') {
        // 샷클락 바이올레이션: TOV + 수비팀 공 넘김
        actor.tov += 1;

        const teamName = offTeam.id === state.home.id
            ? state.home.name
            : state.away.name;
        addLog(state, offTeam.id, `⏱ 24초 샷클락 바이올레이션 — ${teamName} 턴오버`, 'turnover', undefined, undefined, 'turnover');

    } else if (type === 'fight') {
        // 싸움: 양측 퇴장 + 출장정지
        const fighter = result.fighter;
        const opponent = result.fightOpponent;
        const fighterSusp = result.fighterSuspension ?? 1;
        const oppSusp = result.opponentSuspension ?? 1;

        if (fighter) {
            fighter.ejectionReason = 'fight';
            fighter.techFouls = (fighter.techFouls || 0) + 2; // 자동 2 테크니컬
        }
        if (opponent) {
            opponent.ejectionReason = 'fight';
            opponent.techFouls = (opponent.techFouls || 0) + 1;
        }

        // 출장정지 기록
        const timeStr = formatTime(state.gameClock);
        // [2026-10-07] 출장정지 경기 수는 경기 후 사무국 결정 사항이라 PBP에서 제거 — 경기 후 인박스
        // (userGameService/batchSeasonService SUSPENSION) / 멀티 뉴스피드(simRunner detectSuspensionEvent)가
        // state.suspensions를 읽어 따로 전달한다. PBP엔 퇴장 사실만 남김.
        if (fighter && opponent) {
            addLog(state, defTeam.id,
                `${fighter.playerName}이(가) ${opponent.playerName}에게 주먹을 휘두릅니다! 양 선수 경기장에서 퇴장당합니다.`,
                'info');
        }

        // SuspensionEvent 기록 (liveEngine에서 수거)
        if (fighter && opponent) {
            state.suspensions.push({
                playerId: fighter.playerId,
                playerName: fighter.playerName,
                teamId: defTeam.id,
                opponentPlayerId: opponent.playerId,
                opponentPlayerName: opponent.playerName,
                opponentTeamId: offTeam.id,
                suspensionGames: fighterSusp,
                opponentSuspensionGames: oppSusp,
                quarter: state.quarter,
                timeRemaining: timeStr,
            });
        }

        // 싸움 후에도 출장정지된 선수를 부상 처리하여 이후 경기 결장
        if (fighter) {
            fighter.health = 'Injured';
            fighter.injuryType = '출장정지 (싸움)';
            fighter.returnDate = `${fighterSusp}경기`;
            fighter.injuredThisGame = true;
        }
        if (opponent) {
            opponent.health = 'Injured';
            opponent.injuryType = '출장정지 (싸움)';
            opponent.returnDate = `${oppSusp}경기`;
            opponent.injuredThisGame = true;
        }
    }

    recordPlayTypeStat(state, result, offTeam.score - ptScoreBefore, actor.fta - ptFtaBefore);
}
