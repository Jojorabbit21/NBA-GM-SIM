
/**
 * dataMapper.ts — Deno Edge Function용 선수 데이터 매핑
 * services/dataMapper.ts의 핵심 로직을 Deno 호환으로 포팅.
 * React/Node 의존 없음.
 */

import { calculateOvrWithArchetype } from './utils/ovrUtils.ts';

// ── 카테고리 속성 정의 ────────────────────────────────────────────────────────

const CATEGORY_ATTRS: Record<string, string[]> = {
    ins: ['closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul'],
    out: ['midRange', 'threeCorner', 'three45', 'threeTop', 'shotIq', 'offConsist'],
    plm: ['passAcc', 'handling', 'spdBall', 'passIq', 'passVision', 'offBallMovement'],
    def: ['intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'],
    reb: ['offReb', 'defReb', 'boxOut'],
    ath: ['speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle'],
};

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function getCol(item: any, keys: string[]): any {
    for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return undefined;
}

function clamp(v: number, min = 35, max = 99): number {
    return Math.max(min, Math.min(max, v));
}

function calcCategoryAvg(player: any, cat: string): number {
    const attrs = CATEGORY_ATTRS[cat];
    if (!attrs?.length) return 70;
    const sum = attrs.reduce((s, a) => s + (Number(player[a]) || 70), 0);
    return Math.round(sum / attrs.length);
}

// ── 메인 매퍼 ─────────────────────────────────────────────────────────────────

/**
 * meta_players 행(base_attributes JSONB 포함)을 런타임 Player 객체로 변환.
 */
export function mapRawPlayerToRuntimePlayer(raw: any, applyCustomOverrides = false): any {
    const baseAttrs = typeof raw.base_attributes === 'string'
        ? JSON.parse(raw.base_attributes)
        : (raw.base_attributes || {});

    const tendencies = typeof raw.tendencies === 'string'
        ? JSON.parse(raw.tendencies)
        : (raw.tendencies || undefined);

    const p = { ...raw, ...baseAttrs };
    if (raw.name)     p.name     = raw.name;
    if (raw.position) p.position = raw.position;

    // Apply custom_overrides when alltime pool is active (balances legends against modern players)
    if (applyCustomOverrides) {
        const customOverrides = baseAttrs.custom_overrides;
        if (customOverrides && typeof customOverrides === 'object' && !Array.isArray(customOverrides)) {
            for (const [k, v] of Object.entries(customOverrides)) {
                if (typeof v === 'number') p[k] = v;
            }
            for (const cat of Object.keys(CATEGORY_ATTRS)) {
                p[cat] = calcCategoryAvg(p, cat);
            }
        }
    }

    const potentialRaw = Number(getCol(p, ['pot', 'potential', 'POT', 'Potential']));

    const ins = Number(getCol(p, ['ins', 'INS']) || 70);
    const out = Number(getCol(p, ['out', 'OUT']) || 70);
    const ath = Number(getCol(p, ['ath', 'ATH']) || 70);
    const plm = Number(getCol(p, ['plm', 'PLM']) || 70);
    const def = Number(getCol(p, ['def', 'DEF']) || 70);
    const reb = Number(getCol(p, ['reb', 'REB']) || 70);

    const player: any = {
        id:           String(raw.id || ''),
        name:         String(getCol(p, ['name', 'Player', 'Name']) || 'Unknown'),
        position:     String(getCol(p, ['position', 'Pos', 'Position']) || 'G'),
        age:          Number(getCol(p, ['age', 'Age']) || 20),
        potential:    (potentialRaw && !isNaN(potentialRaw)) ? potentialRaw : 75,
        // meta_players에 박제된 부상 상태(예: 실존 인물의 실제 부상 이력)는 멀티플레이어에 적용하지
        // 않는다 — 이 파일은 드래프트 풀(startDraft.ts)과 경기별 로스터 조립(simRunner.ts)에서만
        // 쓰이므로 항상 Healthy로 시작하고, 토너먼트 진행 중 새로 발생하는 부상은
        // applyRosterState()가 room.roster_state의 값으로 별도로 덮어쓴다.
        health:       'Healthy' as string,
        injuryType:   undefined,
        returnDate:   undefined,
        condition:    100,
        tendencies,

        // 카테고리 평균
        ins, out, ath, plm, def, reb,

        // 개별 스탯
        closeShot:       Number(getCol(p, ['close', 'closeShot']) || ins),
        midRange:        Number(getCol(p, ['mid',   'midRange'])   || out),
        threeCorner:     Number(getCol(p, ['3c',    'threeCorner']) || out),
        three45:         Number(getCol(p, ['3_45',  'three45'])    || out),
        threeTop:        Number(getCol(p, ['3t',    'threeTop'])   || out),
        ft:              Number(getCol(p, ['ft',    'FT'])         || 75),
        shotIq:          Number(getCol(p, ['siq',   'shotIq'])     || 75),
        offConsist:      Number(getCol(p, ['ocon',  'offConsist']) || 70),
        layup:           Number(getCol(p, ['lay',   'layup'])      || ins),
        dunk:            Number(getCol(p, ['dnk',   'dunk'])       || ins),
        postPlay:        Number(getCol(p, ['post',  'postPlay'])   || ins),
        drawFoul:        Number(getCol(p, ['draw',  'drawFoul'])   || 70),
        hands:           Number(getCol(p, ['hands'])               || 70),
        passAcc:         Number(getCol(p, ['pacc',  'passAcc'])    || plm),
        handling:        Number(getCol(p, ['handl', 'handling'])   || plm),
        spdBall:         Number(getCol(p, ['spwb',  'spdBall'])    || plm),
        passIq:          Number(getCol(p, ['piq',   'passIq'])     || plm),
        passVision:      Number(getCol(p, ['pvis',  'passVision']) || plm),
        offBallMovement: Number(getCol(p, ['obm',   'offBallMovement']) || plm),
        intDef:          Number(getCol(p, ['idef',  'intDef'])     || def),
        perDef:          Number(getCol(p, ['pdef',  'perDef'])     || def),
        steal:           Number(getCol(p, ['stl',   'steal'])      || def),
        blk:             Number(getCol(p, ['blk',   'Blk'])        || def),
        helpDefIq:       Number(getCol(p, ['hdef',  'helpDefIq'])  || 70),
        passPerc:        Number(getCol(p, ['pper',  'passPerc'])   || 70),
        defConsist:      Number(getCol(p, ['dcon',  'defConsist']) || 70),
        offReb:          Number(getCol(p, ['oreb',  'offReb'])     || reb),
        defReb:          Number(getCol(p, ['dreb',  'defReb'])     || reb),
        boxOut:          Number(getCol(p, ['box',   'boxOut'])     || reb),
        speed:           Number(getCol(p, ['spd',   'speed'])      || ath),
        agility:         Number(getCol(p, ['agi',   'agility'])    || ath),
        strength:        Number(getCol(p, ['str',   'strength'])   || ath),
        vertical:        Number(getCol(p, ['vert',  'vertical'])   || ath),
        stamina:         Number(getCol(p, ['sta',   'stamina'])    || 80),
        hustle:          Number(getCol(p, ['hus',   'hustle'])     || 75),
        durability:      Number(getCol(p, ['dur',   'durability']) || 80),
        intangibles:     Number(getCol(p, ['intangibles'])         || 70),
        height:          Number(getCol(p, ['height', 'Height'])    || 200),
        weight:          Number(getCol(p, ['weight', 'Weight', 'Wt']) || 100),

        // 계약 (시뮬에서는 불필요하지만 타입 호환을 위해)
        contract: { years: [5_000_000], currentYear: 0, type: 'veteran' },

        stats: undefined,
        awards: [],
        attrDeltas: undefined,
    };

    const ovrResult = calculateOvrWithArchetype(player);
    player.ovr = ovrResult.ovr;
    player.archetype = ovrResult.archetype;
    // potential은 항상 현재 ovr 이상이어야 함(성장 로직이 potential < ovr을 가정하지 않음)
    player.potential = (potentialRaw && !isNaN(potentialRaw)) ? Math.max(potentialRaw, player.ovr) : Math.max(75, player.ovr + 5);

    return player;
}

// ── roster_state 적용 ────────────────────────────────────────────────────────

/**
 * roster_state 오버라이드를 플레이어 객체에 적용.
 * attrDeltas(시즌 내 능력치 누적 변화)도 반영.
 */
export function applyRosterState(player: any, rosterState: Record<string, any>): void {
    const state = rosterState?.[player.id];
    if (!state) return;

    if (state.condition !== undefined) player.condition = state.condition;
    if (state.health)     player.health     = state.health;
    if (state.injuryType) player.injuryType = state.injuryType;
    if (state.returnDate) player.returnDate = state.returnDate;
    if (state.age !== undefined) player.age = state.age;

    // 시즌 내 능력치 변화 재적용
    if (state.attrDeltas) {
        player.attrDeltas = state.attrDeltas;
        for (const [attr, delta] of Object.entries(state.attrDeltas as Record<string, number>)) {
            if (!delta) continue;
            const cur = Number(player[attr] || 70);
            player[attr] = clamp(cur + delta);
        }
        // 카테고리 평균 재계산
        for (const cat of Object.keys(CATEGORY_ATTRS)) {
            player[cat] = calcCategoryAvg(player, cat);
        }
        const ovrResult = calculateOvrWithArchetype(player);
        player.ovr = ovrResult.ovr;
        player.archetype = ovrResult.archetype;
    }
}

// ── Team 빌더 ─────────────────────────────────────────────────────────────────

/**
 * league_teams 행 + meta_players + roster_state → Team 런타임 객체
 */
export function buildTeamForSim(
    leagueTeam: { team_slug: string; team_name: string; roster: string[] },
    playerMap: Map<string, any>,  // playerId → Player
    rosterState: Record<string, any>,
): any {
    const roster = leagueTeam.roster
        .map(id => playerMap.get(id))
        .filter(Boolean)
        .map(p => {
            const clone = { ...p };
            applyRosterState(clone, rosterState);
            return clone;
        });

    return {
        id:           leagueTeam.team_slug,
        name:         leagueTeam.team_name,
        city:         '',
        logo:         '',
        conference:   'East' as const,
        division:     '',
        wins:         0,
        losses:       0,
        budget:       150_000_000,
        salaryCap:    140_000_000,
        luxuryTaxLine:170_000_000,
        roster,
    };
}
