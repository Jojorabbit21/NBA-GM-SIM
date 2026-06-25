
import { Team, GameTactics, DepthChart, Player } from '../../types.ts';
import { HeadCoachPreferences } from '../../types/coaching.ts';
import { calculatePlayerOvr } from '../../utils/constants.ts';
import { DEFAULT_SLIDERS } from '../config/tacticPresets.ts';
import { SLIDER_STEPS, valueToStep, stepToValue } from '../config/sliderSteps.ts';

// --- Helpers ---
const clamp = (v: number, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(v)));
const avgVals = (...vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;

const ato = (score: number, low: number, high: number): number =>
    clamp(((score - low) / (high - low)) * 9 + 1);

const snap = (key: string, value: number): number => {
    if (!SLIDER_STEPS[key]) return value;
    return stepToValue(key, valueToStep(key, value));
};

// --- Archetype Score Functions ---
const get3pt        = (p: Player) => (p.threeCorner + p.three45 + p.threeTop) / 3;
const handlerScore  = (p: Player) => p.handling * 0.35 + p.plm * 0.25 + p.passVision * 0.20 + p.passAcc * 0.20;
const spacerScore   = (p: Player) => get3pt(p) * 0.60 + p.shotIq * 0.25 + p.offConsist * 0.15;
const driverScore   = (p: Player) => p.speed * 0.20 + p.agility * 0.15 + p.vertical * 0.10 + p.ins * 0.35 + p.midRange * 0.20;
const screenerScore = (p: Player) => p.strength * 0.40 + Math.max(0, p.height - 185) * 3 * 0.30 + Math.max(0, p.weight - 80) * 1.6 * 0.30;
const rollerScore   = (p: Player) => p.ins * 0.40 + p.vertical * 0.30 + p.speed * 0.30;
const postScore     = (p: Player) => p.ins * 0.50 + p.strength * 0.30 + p.hands * 0.20;
const isoScore      = (p: Player) => p.handling * 0.25 + p.midRange * 0.25 + p.speed * 0.25 + p.agility * 0.25;
const rimProtScore  = (p: Player) => p.blk * 0.35 + p.intDef * 0.35 + p.vertical * 0.15 + Math.max(0, p.height - 185) * 3 * 0.15;
const perimLockScore = (p: Player) => p.perDef * 0.50 + p.agility * 0.25 + p.steal * 0.25;

const COACH_INFLUENCE = 0.4;

const lerp = (roster: number, coach: number, w: number): number =>
    Math.round(roster * (1 - w) + coach * w);

function blendWithCoach(
    sliders: GameTactics['sliders'],
    prefs: HeadCoachPreferences
): GameTactics['sliders'] {
    const W = COACH_INFLUENCE;
    return {
        ...sliders,
        playStyle:    snap('playStyle',    lerp(sliders.playStyle,    prefs.offenseIdentity, W)),
        ballMovement: snap('ballMovement', lerp(sliders.ballMovement, prefs.offenseIdentity, W)),
        pace:   snap('pace',   lerp(sliders.pace,   prefs.tempo, W)),
        offReb: snap('offReb', lerp(sliders.offReb, 11 - prefs.tempo, W)),
        insideOut: snap('insideOut', lerp(sliders.insideOut, prefs.scoringFocus, W)),
        shot_3pt:  snap('shot_3pt',  lerp(sliders.shot_3pt,  prefs.scoringFocus, W)),
        shot_rim:  snap('shot_rim',  lerp(sliders.shot_rim,  11 - prefs.scoringFocus, W)),
        pnrFreq: snap('pnrFreq', lerp(sliders.pnrFreq, prefs.pnrEmphasis, W)),
        defIntensity:   snap('defIntensity',   lerp(sliders.defIntensity,   prefs.defenseStyle, W)),
        fullCourtPress: snap('fullCourtPress', lerp(sliders.fullCourtPress, prefs.defenseStyle, W)),
        helpDef:    snap('helpDef',    lerp(sliders.helpDef,    prefs.helpScheme, W)),
        switchFreq: snap('switchFreq', lerp(sliders.switchFreq, prefs.helpScheme, W)),
        zoneFreq:  lerp(sliders.zoneFreq,  prefs.zonePreference, W),
        zoneUsage: lerp(sliders.zoneUsage, prefs.zonePreference, W),
    };
}

export const generateAutoTactics = (team: Team, coachPrefs?: HeadCoachPreferences): GameTactics => {
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    const sortedRoster = [...healthy].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    const depthChart: DepthChart = {
        PG: [null, null, null],
        SG: [null, null, null],
        SF: [null, null, null],
        PF: [null, null, null],
        C:  [null, null, null]
    };
    const usedIds = new Set<string>();
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (let depth = 0; depth <= 1; depth++) {
        for (const pos of positions) {
            const candidate = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id));
            if (candidate) {
                depthChart[pos][depth] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                const fallback = sortedRoster.find(p => !usedIds.has(p.id));
                if (fallback) { depthChart[pos][depth] = fallback.id; usedIds.add(fallback.id); }
            }
        }
    }
    for (const pos of positions) {
        const c = sortedRoster.find(p => p.position.includes(pos) && !usedIds.has(p.id))
               ?? sortedRoster.find(p => !usedIds.has(p.id));
        if (c) { depthChart[pos][2] = c.id; usedIds.add(c.id); }
    }

    const rotationMap: Record<string, boolean[]> = {};
    sortedRoster.forEach(p => { rotationMap[p.id] = Array(48).fill(false); });

    for (const pos of positions) {
        const starterId = depthChart[pos][0];
        const benchId = depthChart[pos][1];
        if (starterId && rotationMap[starterId]) {
            const s = rotationMap[starterId];
            for (let i = 0; i < 12; i++) s[i] = true;
            for (let i = 18; i < 36; i++) s[i] = true;
            for (let i = 42; i < 48; i++) s[i] = true;
        }
        if (benchId && rotationMap[benchId]) {
            const b = rotationMap[benchId];
            for (let i = 12; i < 18; i++) b[i] = true;
            for (let i = 36; i < 42; i++) b[i] = true;
        }
    }

    const startersMap = {
        PG: depthChart.PG[0] || '',
        SG: depthChart.SG[0] || '',
        SF: depthChart.SF[0] || '',
        PF: depthChart.PF[0] || '',
        C:  depthChart.C[0]  || ''
    };

    const starters = positions.map(pos => {
        const pid = depthChart[pos][0];
        return team.roster.find(p => p.id === pid);
    }).filter((p): p is Player => p !== undefined);

    if (starters.length < 5) {
        return {
            sliders: { ...DEFAULT_SLIDERS },
            starters: startersMap,
            minutesLimits: {},
            rotationMap,
            depthChart
        };
    }

    const maxOf = (fn: (p: Player) => number) => Math.max(...starters.map(fn));
    const avgOf = (fn: (p: Player) => number) => avgVals(...starters.map(fn));

    const PG = starters.find(p => p.position.includes('PG')) ?? starters[0];
    const SG = starters.find(p => p.position.includes('SG')) ?? starters[1];
    const bigPlayers = starters.filter(p => p.position.includes('PF') || p.position === 'C');

    const avgStamina = avgOf(p => p.stamina);

    let pace = ato(avgVals(PG.speed, SG.speed), 60, 90);
    if (avgStamina < 72) pace = clamp(pace - 2);

    let ballMovement = ato(avgOf(p => avgVals(p.plm, p.passVision)), 62, 88);
    if (avgOf(p => p.handling) < 65) ballMovement = clamp(ballMovement - 2);

    const bigRebAvg = bigPlayers.length > 0 ? avgVals(...bigPlayers.map(p => p.reb)) : 65;
    let offReb = ato(bigRebAvg, 65, 90);
    if (pace >= 8) offReb = clamp(offReb - 2);

    const heroInd = (maxOf(isoScore) + maxOf(postScore)) / 2;
    const sysInd = (avgOf(spacerScore) + avgOf(driverScore)) / 2;
    let playStyle = clamp(Math.round(5 + (sysInd - heroInd) * 0.15));

    const topPassVision = maxOf(p => p.passVision);
    if (topPassVision >= 88) playStyle = clamp(playStyle + 2);
    else if (topPassVision >= 82) playStyle = clamp(playStyle + 1);

    const insideInd = maxOf(postScore) * 0.5 + maxOf(rollerScore) * 0.3 + maxOf(driverScore) * 0.2;
    const outsideInd = avgOf(spacerScore) * 0.6 + avgOf(get3pt) * 0.4;
    const insideOut = clamp(Math.round(5 + (outsideInd - insideInd) * 0.15));

    const pnrRaw = maxOf(handlerScore) * 0.5 + maxOf(screenerScore) * 0.3 + maxOf(rollerScore) * 0.2;
    const pnrFreq = clamp(Math.max(6, ato(pnrRaw, 62, 88)));

    const shot_3pt = ato(avgOf(get3pt), 62, 85);
    const shot_rim = ato(avgOf(p => p.ins) * 0.6 + maxOf(driverScore) * 0.4, 62, 88);

    const avgMidRange = avgOf(p => p.midRange);
    const shot_mid = avgMidRange >= 88 ? 9 : avgMidRange >= 82 ? 5 : 2;

    const defIntensity = ato(avgOf(p => p.perDef), 60, 88);
    const helpDef = ato(maxOf(rimProtScore) * 0.6 + avgOf(p => p.helpDefIq) * 0.4, 60, 90);

    let switchFreq = ato(avgOf(perimLockScore) * 0.6 + avgOf(p => p.agility) * 0.4, 62, 88);
    if (maxOf(rimProtScore) >= 88) switchFreq = clamp(Math.min(switchFreq, 5));

    const guardStaminaSpeed = avgVals(PG.stamina, PG.speed, SG.stamina, SG.speed);
    const fullCourtPress = guardStaminaSpeed >= 88 ? 8 : guardStaminaSpeed >= 82 ? 4 : 1;

    const intDefPower = avgOf(p => (p.intDef + p.blk) / 2);
    const perimPower  = avgOf(p => (p.perDef + p.steal) / 2);
    const powerDiff = intDefPower - perimPower;
    const zoneFreq = powerDiff >= 15 ? 9 : powerDiff <= -10 ? 1 : 5;

    const rosterSliders = {
        pace: snap('pace', pace),
        ballMovement: snap('ballMovement', ballMovement),
        offReb: snap('offReb', offReb),
        playStyle: snap('playStyle', playStyle),
        insideOut: snap('insideOut', insideOut),
        pnrFreq: snap('pnrFreq', pnrFreq),
        shot_3pt: snap('shot_3pt', shot_3pt),
        shot_mid,
        shot_rim: snap('shot_rim', shot_rim),
        defIntensity: snap('defIntensity', defIntensity),
        helpDef: snap('helpDef', helpDef),
        switchFreq: snap('switchFreq', switchFreq),
        defReb: DEFAULT_SLIDERS.defReb,
        zoneFreq,
        fullCourtPress,
        zoneUsage: zoneFreq,
        pnrDefense: DEFAULT_SLIDERS.pnrDefense,
    };

    return {
        sliders: coachPrefs ? blendWithCoach(rosterSliders, coachPrefs) : rosterSliders,
        starters: startersMap,
        minutesLimits: {},
        rotationMap,
        depthChart
    };
};
