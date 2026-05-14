import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { searchPlayers, fetchPlayerById, updateBaseAttributes, updatePlayerName, updatePlayerTendencies, updateIncludeAlltime, updateInMultiPool, updateDraftYear, bulkUpdateIncludeAlltime, bulkUpdateInMultiPool, insertEditLog, fetchEditLog, insertPlayer, deletePlayer, EditLogEntry, MetaPlayerRow } from '../services/admin/playerAdminService';
import { preloadGameConfig, fetchArchetypeLabels, fetchTagConfig } from '../services/admin/gameConfigService';
import type { ArchetypeLabelConfig, TagConfigList } from '../types/gameConfig';
import { resolveTeamId } from '../utils/constants';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../services/playerPopularity';
import { adaptPlayerToInput } from '../utils/ovrUtils';
import { evaluatePlayerRawOVR, evalTagConditionOvr } from '../utils/ovrEngine';
import type { ArchetypeModuleScores } from '../types/archetype';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

// ── 능력치 색상 헬퍼 (tailwind.config attribute 스케일) ──────────────────────────
function attrColor(v: number): string {
    if (v >= 97) return 'text-attribute-s';
    if (v >= 88) return 'text-attribute-a';
    if (v >= 77) return 'text-attribute-b';
    if (v >= 66) return 'text-attribute-c';
    return 'text-attribute-d';
}

// ── 모듈 등급 헬퍼 ─────────────────────────────────────────────────────────────
function getModuleGradeInfo(score: number): { grade: string; bar: string; text: string } {
    if (score >= 88) return { grade: 'S+', bar: 'bg-violet-500',  text: 'text-violet-400' };
    if (score >= 85) return { grade: 'S',  bar: 'bg-indigo-500',  text: 'text-indigo-400' };
    if (score >= 80) return { grade: 'A+', bar: 'bg-emerald-500', text: 'text-emerald-400' };
    if (score >= 75) return { grade: 'A',  bar: 'bg-emerald-500', text: 'text-emerald-400' };
    if (score >= 72) return { grade: 'A-', bar: 'bg-teal-500',    text: 'text-teal-400' };
    if (score >= 70) return { grade: 'B+', bar: 'bg-sky-500',     text: 'text-sky-400' };
    if (score >= 65) return { grade: 'B',  bar: 'bg-sky-500',     text: 'text-sky-400' };
    if (score >= 60) return { grade: 'B-', bar: 'bg-sky-600',     text: 'text-sky-400' };
    if (score >= 55) return { grade: 'C+', bar: 'bg-amber-500',   text: 'text-amber-400' };
    if (score >= 50) return { grade: 'C',  bar: 'bg-amber-500',   text: 'text-amber-400' };
    if (score >= 45) return { grade: 'C-', bar: 'bg-orange-500',  text: 'text-orange-400' };
    return              { grade: 'D',  bar: 'bg-red-500',     text: 'text-red-400' };
}

const MODULE_ENTRIES: { key: string; label: string }[] = [
    { key: 'spotUpShooting',   label: '스팟업 슈팅' },
    { key: 'shotCreation',     label: '샷 창출' },
    { key: 'rimFinishing',     label: '림 피니시' },
    { key: 'postCraft',        label: '포스트' },
    { key: 'playmaking',       label: '플레이메이킹' },
    { key: 'offballAttack',    label: '오프볼' },
    { key: 'poaDefense',       label: 'POA 수비' },
    { key: 'teamDefense',      label: '팀 수비' },
    { key: 'rimProtection',    label: '림 보호' },
    { key: 'rebounding',       label: '리바운드' },
    { key: 'motorAvailability',label: '모터/가용성' },
];

// ── 팀 목록 ──────────────────────────────────────────────────────────────────
const TEAM_OPTIONS = [
    { id: '',    label: '— FA / 없음 —' },
    { id: 'atl', label: 'ATL · 애틀랜타 파이어버즈' },
    { id: 'bos', label: 'BOS · 보스턴 세이지' },
    { id: 'bkn', label: 'BKN · 브루클린 나이츠' },
    { id: 'cha', label: 'CHA · 샬럿 스팅어스' },
    { id: 'chi', label: 'CHI · 시카고 차저스' },
    { id: 'cle', label: 'CLE · 클리블랜드 랜서스' },
    { id: 'dal', label: 'DAL · 댈러스 머스탱스' },
    { id: 'den', label: 'DEN · 덴버 시프터스' },
    { id: 'det', label: 'DET · 디트로이트 스탈리온스' },
    { id: 'gs',  label: 'GS  · 골든스테이트 뱅가즈' },
    { id: 'hou', label: 'HOU · 휴스턴 이글스' },
    { id: 'ind', label: 'IND · 인디애나 레이서스' },
    { id: 'law', label: 'LAW · LA 와일드캣츠' },
    { id: 'lam', label: 'LAM · LA 미라지' },
    { id: 'mem', label: 'MEM · 멤피스 코디악스' },
    { id: 'mia', label: 'MIA · 마이애미 블레이즈' },
    { id: 'mil', label: 'MIL · 밀워키 스태그스' },
    { id: 'min', label: 'MIN · 미네소타 프로스트울브스' },
    { id: 'no',  label: 'NO  · 뉴올리언스 헤론스' },
    { id: 'nyk', label: 'NYK · 뉴욕 엠파이어' },
    { id: 'okc', label: 'OKC · 오클라호마시티 볼트' },
    { id: 'orl', label: 'ORL · 올랜도 미스틱스' },
    { id: 'phi', label: 'PHI · 필라델피아 리버티' },
    { id: 'phx', label: 'PHX · 피닉스 카이요티스' },
    { id: 'por', label: 'POR · 포틀랜드 파이오니어스' },
    { id: 'sac', label: 'SAC · 새크라멘토 모나크스' },
    { id: 'sa',  label: 'SA  · 샌안토니오 아웃로스' },
    { id: 'tor', label: 'TOR · 토론토 노스가드스' },
    { id: 'uta', label: 'UTA · 유타 하이랜더스' },
    { id: 'was', label: 'WAS · 워싱턴 아케인스' },
];

const POSITION_OPTIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// 인기도 드롭다운 옵션 (0~100, 10단위)
const POPULARITY_OPTIONS: { value: number; label: string }[] = [
    { value: 0,   label: '0 — 신인 수준' },
    { value: 10,  label: '10 — 거의 알려지지 않음' },
    { value: 20,  label: '20 — 인지도 형성 중' },
    { value: 30,  label: '30 — 팀 팬에게 알려짐' },
    { value: 40,  label: '40 — 어느 정도 인지됨' },
    { value: 50,  label: '50 — 팬들에게 알려짐' },
    { value: 60,  label: '60 — 팬들에게 사랑받음' },
    { value: 70,  label: '70 — 연고지 인기 선수' },
    { value: 80,  label: '80 — 홈팀 스타' },
    { value: 90,  label: '90 — 팀 아이콘' },
    { value: 100, label: '100 — 전설적 인기' },
];
const NATIONAL_POPULARITY_OPTIONS: { value: number; label: string }[] = [
    { value: 0,   label: '0 — 완전 무명' },
    { value: 10,  label: '10 — 거의 무명' },
    { value: 20,  label: '20 — 인지도 낮음' },
    { value: 30,  label: '30 — 일부에게 알려짐' },
    { value: 40,  label: '40 — 팬층 있음' },
    { value: 50,  label: '50 — 어느 정도 알려짐' },
    { value: 60,  label: '60 — 인기 선수' },
    { value: 70,  label: '70 — 적당히 유명함' },
    { value: 80,  label: '80 — 전국적으로 유명함' },
    { value: 90,  label: '90 — 슈퍼스타' },
    { value: 100, label: '100 — 글로벌 아이콘' },
];

// ── DB 키 정의 (런타임 키 사용 — DB 마이그레이션 2026-04-21 이후) ─────────────────
const STAT_SECTIONS = [
    {
        label: '인사이드',
        keys: [
            { key: 'closeShot', label: '훅/플로터' },
            { key: 'layup',     label: '레이업' },
            { key: 'dunk',      label: '덩크' },
            { key: 'postPlay',  label: '포스트 플레이' },
            { key: 'drawFoul',  label: '파울 유도' },
            { key: 'hands',     label: '볼 간수' },
        ],
    },
    {
        label: '아웃사이드',
        keys: [
            { key: 'midRange',    label: '미드레인지' },
            { key: 'threeCorner', label: '코너 3점' },
            { key: 'three45',     label: '윙 3점' },
            { key: 'threeTop',    label: '탑 3점' },
            { key: 'ft',          label: '자유투' },
            { key: 'shotIq',      label: '슈팅 IQ' },
            { key: 'offConsist',  label: '공격 일관성' },
        ],
    },
    {
        label: '패스 & 플레이메이킹',
        keys: [
            { key: 'passAcc',         label: '패스 정확도' },
            { key: 'handling',        label: '볼 핸들링' },
            { key: 'spdBall',         label: '드리블 속도' },
            { key: 'passVision',      label: '패스 시야' },
            { key: 'passIq',          label: '패스 지능' },
            { key: 'offBallMovement', label: '오프볼 무브먼트' },
        ],
    },
    {
        label: '수비',
        keys: [
            { key: 'intDef',     label: '인사이드 수비' },
            { key: 'perDef',     label: '퍼리미터 수비' },
            { key: 'steal',      label: '스틸' },
            { key: 'blk',        label: '블락' },
            { key: 'helpDefIq',  label: '도움 수비 지능' },
            { key: 'passPerc',   label: '패스 경로 예측' },
            { key: 'defConsist', label: '수비 일관성' },
        ],
    },
    {
        label: '리바운드',
        keys: [
            { key: 'offReb', label: '공격 리바운드' },
            { key: 'defReb', label: '수비 리바운드' },
            { key: 'boxOut', label: '박스아웃' },
        ],
    },
    {
        label: '운동 능력',
        keys: [
            { key: 'speed',      label: '속도' },
            { key: 'agility',    label: '민첩성' },
            { key: 'strength',   label: '근력' },
            { key: 'vertical',   label: '점프력' },
            { key: 'stamina',    label: '지구력' },
            { key: 'hustle',     label: '허슬' },
            { key: 'durability', label: '내구도' },
        ],
    },
    {
        label: '특수 & 무형',
        keys: [
            { key: 'pot',         label: 'Potential (잠재력)' },
            { key: 'intangibles', label: '무형 (IQ/리더십/클러치)' },
        ],
    },
];

const ARCHETYPE_LABEL: Record<string, string> = {
    PRIMARY_CREATOR_GUARD: 'Primary Creator',  SCORING_COMBO_GUARD: 'Dual Guard',
    MOVEMENT_SHOOTER: 'Outside Shooter',       PERIMETER_3D: 'Perimeter 3&D',
    TWO_WAY_WING: 'Two-Way Wing',              SLASHING_WING: 'Slashing Wing',
    SHOT_CREATOR_WING: 'Shot Creator Wing',    CONNECTOR_FORWARD: 'Connector Fwd',
    AERIAL_WING: 'Aerial Wing',                POST_SCORING_WING: 'Post Scoring Wing',
    WING_PROTECTOR: 'Wing Protector',          POST_SCORING_BIG: 'Post Scoring Big',
    RIM_RUNNER_BIG: 'Rim Runner',              STRETCH_BIG: 'Stretch Big',
    RIM_PROTECTOR_ANCHOR: 'Rim Protector',     PLAYMAKING_BIG: 'Playmaking Big',
    FLOOR_GENERAL_GUARD: 'Floor General',      SCORING_POINT_GUARD: 'Pure Scorer',
    DEFENSIVE_GUARD: 'Defensive Guard',        THREE_LEVEL_SCORER: '3-Level Scorer',
    LOCKDOWN_WING: 'Lockdown Wing',            SWITCHABLE_ANCHOR: 'Switchable Anchor',
    TWO_WAY_BIG: 'Two-Way Big',                REBOUNDING_BIG: 'Rebounding Big',
    ISOLATION_SCORER: 'Midrange Menace',       ELBOW_OPERATOR: 'Elbow Operator',
    ELITE_GUARD: 'Elite Guard',                LOCKDOWN_SHOOTER: 'Lockdown Shooter',
};

const TAG_LABEL: Record<string, string> = {
    elite_finisher: 'Elite Finisher', foul_merchant: 'Foul Merchant', shotmaker: 'Shotmaker',
    floor_spacer: 'Floor Spacer', off_ball_mover: 'Off-Ball Mover', plus_playmaker: '+Playmaker',
    poa_stopper: 'POA Stopper', team_defender: 'Team Defender', rim_protector: 'Rim Protector',
    glass_cleaner: 'Glass Cleaner', high_motor: 'High Motor', ironman: 'Ironman',
    streaky_scorer: 'Streaky Scorer', reliable_two_way: 'Two-Way',
};

// ── 테이블 데이터 헬퍼 ───────────────────────────────────────────────────────
const DISPLAY_ONLY_CO_KEYS = new Set([
    'contract', 'popularity', 'name', 'num', 'salary', 'lock', 'draft_year',
]);

type PlayerDataEntry = {
    archetype: string; secondary: string | null; tags: string[]; displayOvr: number;
    groups: { ins: number; out: number; plm: number; def: number; reb: number; ath: number };
    modules: Record<string, number>;
};

type CoPlayerDataEntry = PlayerDataEntry & { position: string; team: string; age: number | null };

function computePlayerDataEntry(attrs: Record<string, any>, posOverride?: string, tagCfg?: import('../types/gameConfig').TagConfigList): PlayerDataEntry {
    const pos = posOverride ?? (attrs.position as string | undefined) ?? 'SF';
    const input = adaptPlayerToInput(attrs, pos);
    const result = evaluatePlayerRawOVR(input);
    const m = result.modules;
    const ri = input.ratings;
    const tags: string[] = [];
    if (tagCfg && tagCfg.length > 0) {
        for (const entry of tagCfg) {
            if (evalTagConditionOvr(entry.condition as any, ri as any, m as any)) tags.push(entry.id);
        }
    } else {
        if (m.rimFinishing >= 85)                              tags.push('elite_finisher');
        if (ri.drawFoul >= 88)                                 tags.push('foul_merchant');
        if (m.shotCreation >= 85)                              tags.push('shotmaker');
        if (m.spotUpShooting >= 85)                            tags.push('floor_spacer');
        if (m.offballAttack >= 82 && m.spotUpShooting >= 82)   tags.push('off_ball_mover');
        if (m.playmaking >= 82)                                tags.push('plus_playmaker');
        if (m.poaDefense >= 84)                                tags.push('poa_stopper');
        if (m.teamDefense >= 84)                               tags.push('team_defender');
        if (m.rimProtection >= 85)                             tags.push('rim_protector');
        if (m.rebounding >= 84)                                tags.push('glass_cleaner');
        if (m.motorAvailability >= 85)                         tags.push('high_motor');
        if (ri.durability >= 90 && ri.stamina >= 85)           tags.push('ironman');
        if ((m.shotCreation >= 72 || m.spotUpShooting >= 72) && ri.offensiveConsistency <= 65)
                                                               tags.push('streaky_scorer');
        if (ri.offensiveConsistency >= 75 && ri.defensiveConsistency >= 75)
                                                               tags.push('reliable_two_way');
    }
    const avg3pt = (ri.cornerThree + ri.fortyFiveThree + ri.topThree) / 3;
    return {
        archetype: result.primaryArchetype.archetype,
        secondary: result.secondaryArchetype.archetype !== result.primaryArchetype.archetype
            ? result.secondaryArchetype.archetype : null,
        tags,
        displayOvr: Math.round(result.rawCurrentOVR),
        groups: {
            ins: Math.round((ri.layup + ri.dunk + ri.postPlay + ri.drawFoul + ri.hands) / 5),
            out: Math.round((ri.closeShot + ri.midRange + avg3pt + ri.freeThrow + ri.shotIQ + ri.offensiveConsistency) / 6),
            plm: Math.round((ri.passAccuracy + ri.ballHandling + ri.speedWithBall + ri.passIQ + ri.passVision + ri.offballMovement) / 6),
            def: Math.round((ri.interiorDefense + ri.perimeterDefense + ri.steal + ri.block + ri.helpDefenseIQ + ri.passPerception + ri.defensiveConsistency) / 7),
            reb: Math.round((ri.offensiveRebounds + ri.defensiveRebounds + ri.boxout) / 3),
            ath: Math.round((ri.speed + ri.agility + ri.strength + ri.vertical + ri.stamina + ri.hustle + ri.durability) / 7),
        },
        modules: {
            spotUpShooting: m.spotUpShooting, shotCreation: m.shotCreation,
            rimFinishing: m.rimFinishing,     postCraft: m.postCraft,
            playmaking: m.playmaking,         offballAttack: m.offballAttack,
            poaDefense: m.poaDefense,         teamDefense: m.teamDefense,
            rimProtection: m.rimProtection,   rebounding: m.rebounding,
            motorAvailability: m.motorAvailability,
        },
    };
}

// ── 신규 선수 기본 능력치 ────────────────────────────────────────────────────
const DEFAULT_PLAYER_ATTRS = (name: string, position: string, team: string): Record<string, any> => ({
    name, position, team: team || '',
    age: 25, height: 201, pot: 70, intangibles: 70,
    // Inside
    closeShot: 70, layup: 70, dunk: 70, postPlay: 70, drawFoul: 70, hands: 70,
    // Outside
    midRange: 70, threeCorner: 70, three45: 70, threeTop: 70, ft: 70, shotIq: 70, offConsist: 70,
    // Playmaking
    passAcc: 70, handling: 70, spdBall: 70, passVision: 70, passIq: 70, offBallMovement: 70,
    // Defense
    intDef: 70, perDef: 70, steal: 70, blk: 70, helpDefIq: 70, passPerc: 70, defConsist: 70,
    // Rebounds
    offReb: 70, defReb: 70, boxOut: 70,
    // Athletics
    speed: 70, agility: 70, strength: 70, vertical: 70, stamina: 70, hustle: 70, durability: 70,
});

type EditorContext = { userId?: string };

// ── PlayerEditorPage ──────────────────────────────────────────────────────────

const PlayerEditorPage: React.FC = () => {
    const { userId } = useOutletContext<EditorContext>();
    const isAdmin = userId === ADMIN_USER_ID;

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MetaPlayerRow[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selected, setSelected] = useState<MetaPlayerRow | null>(null);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
    const [includeAlltime, setIncludeAlltimeState] = useState<boolean>(true);
    const [alltimeToggling, setAlltimeToggling] = useState(false);
    const [draftYearVal, setDraftYearVal] = useState<string>('');
    const [inMultiPool, setInMultiPoolState] = useState<boolean>(true);
    const [multiPoolToggling, setMultiPoolToggling] = useState(false);
    // 테이블 필터/페이지네이션
    const [filterTeams, setFilterTeams] = useState<string[] | null>(null); // null=전체, []=선택없음, ['fa','atl'...]=개별선택
    const [filterTeamOpen, setFilterTeamOpen] = useState(false);
    const [filterDraftYearOp, setFilterDraftYearOp] = useState<string>('');  // ''|'<='|'<'|'='|'>'|'>='
    const [filterDraftYearVal, setFilterDraftYearVal] = useState<string>('');
    const [filterPos, setFilterPos] = useState<string>('all');       // 'all'|'PG'|'SG'|'SF'|'PF'|'C'
    const [filterAlltime, setFilterAlltime] = useState<string>('all'); // 'all'|'alltime_only'|'current_only'
    const [filterArchetype, setFilterArchetype] = useState<string>('all'); // 'all'|OvrArchetype(UPPER_CASE)
    const [filterTag, setFilterTag] = useState<string>('all');            // 'all'|TraitTag(snake_case)
    const [filterOvrMin, setFilterOvrMin] = useState<string>('');         // OVR 최솟값
    const [filterOvrMax, setFilterOvrMax] = useState<string>('');         // OVR 최댓값
    const [filterModule, setFilterModule] = useState<string>('');         // 모듈 키 ('' = 없음)
    const [filterModuleMin, setFilterModuleMin] = useState<string>('');   // 모듈 최솟값
    const [sortBy,  setSortBy]  = useState<'name' | 'ovr'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [ovrDisplayMode, setOvrDisplayMode] = useState<'base' | 'custom'>('base');
    // 신규 선수 추가 모달
    const [addModal, setAddModal] = useState<{ name: string; position: string; team: string } | null>(null);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    // 선수 삭제
    const [deleting, setDeleting] = useState(false);
    const [togglingRows, setTogglingRows] = useState<Record<string, 'alltime' | 'multi'>>({});
    const [tablePage, setTablePage] = useState(0);
    const [tablePageSize, setTablePageSize] = useState(10);
    const originalAttrsRef = useRef<Record<string, any>>({});
    const [tendencies, setTendencies] = useState<Record<string, any> | null>(null);
    const originalTendenciesRef = useRef<Record<string, any> | null>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bulkAlltimeRef = useRef<HTMLInputElement>(null);
    const bulkMultiRef = useRef<HTMLInputElement>(null);
    const teamFilterRef = useRef<HTMLDivElement>(null);
    const [labelConfig, setLabelConfig] = useState<ArchetypeLabelConfig>({ ...ARCHETYPE_LABEL });
    const [tagConfig, setTagConfig] = useState<TagConfigList>([]);

    useEffect(() => {
        preloadGameConfig().catch(console.error);
        fetchArchetypeLabels()
            .then(db => { if (Object.keys(db).length > 0) setLabelConfig(db); })
            .catch(console.error);
        fetchTagConfig()
            .then(tags => { if (tags.length > 0) setTagConfig(tags); })
            .catch(console.error);
    }, []);

    // 팀 필터 패널 click-outside 닫기
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (teamFilterRef.current && !teamFilterRef.current.contains(e.target as Node)) {
                setFilterTeamOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── 실시간 OVR / 아키타입 / 태그 계산 ────────────────────────────────────
    const livePreview = useMemo(() => {
        if (!selected || Object.keys(draft).length === 0) return null;

        const NON_STAT_CO_KEYS = new Set(['contract', 'popularity', 'position', 'name', 'team', 'num', 'salary', 'lock', 'draft_year']);

        const computePreview = (attrs: Record<string, any>) => {
            try {
                const pos = (attrs.position ?? selected.position ?? 'SF') as string;
                const mapped: Record<string, any> = {};
                for (const [k, v] of Object.entries(attrs)) {
                    if (k === 'custom_overrides') continue;
                    mapped[k] = v;
                }
                const input = adaptPlayerToInput(mapped, pos);
                const result = evaluatePlayerRawOVR(input);
                const displayOvr = Math.round(result.rawCurrentOVR);
                const m = result.modules;
                const r = input.ratings;
                const tags: string[] = [];
                if (m.rimFinishing >= 85)                              tags.push('elite_finisher');
                if (r.drawFoul >= 88)                                  tags.push('foul_merchant');
                if (m.shotCreation >= 85)                              tags.push('shotmaker');
                if (m.spotUpShooting >= 85)                            tags.push('floor_spacer');
                if (m.offballAttack >= 82 && m.spotUpShooting >= 82)   tags.push('off_ball_mover');
                if (m.playmaking >= 82)                                tags.push('plus_playmaker');
                if (m.poaDefense >= 84)                                tags.push('poa_stopper');
                if (m.teamDefense >= 84)                               tags.push('team_defender');
                if (m.rimProtection >= 85)                             tags.push('rim_protector');
                if (m.rebounding >= 84)                                tags.push('glass_cleaner');
                if (m.motorAvailability >= 85)                         tags.push('high_motor');
                if (r.durability >= 90 && r.stamina >= 85)             tags.push('ironman');
                if ((m.shotCreation >= 72 || m.spotUpShooting >= 72) && r.offensiveConsistency <= 65)
                                                                       tags.push('streaky_scorer');
                if (r.offensiveConsistency >= 75 && r.defensiveConsistency >= 75)
                                                                       tags.push('reliable_two_way');
                return { displayOvr, rawOvr: result.rawCurrentOVR, primaryArchetype: result.primaryArchetype, secondaryArchetype: result.secondaryArchetype, modules: m, tags };
            } catch {
                return null;
            }
        };

        const co = (draft.custom_overrides ?? {}) as Record<string, any>;
        const hasStatCo = Object.keys(co).some(k => !NON_STAT_CO_KEYS.has(k));
        return {
            base: computePreview(draft),
            co: hasStatCo ? computePreview({ ...draft, ...co }) : null,
        };
    }, [draft, selected]);

    // 초기 진입 시 전체 목록 자동 로드
    useEffect(() => {
        if (isAdmin) {
            searchPlayers('').then(setResults).catch(() => {});
        }
    }, [isAdmin]);

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setQuery(v);
        setTablePage(0);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                setResults(await searchPlayers(v));
                setShowDropdown(true);
            } catch { setResults([]); }
        }, 200);
    }, []);

    const handleFocus = useCallback(async () => {
        if (results.length === 0) {
            try { setResults(await searchPlayers('')); } catch { /* noop */ }
        }
        setShowDropdown(true);
    }, [results.length]);

    // 테이블 필터 적용
    // draft_year = 2026 (numeric) 인 선수만 드래프트 클래스(신인)로 간주
    // 다른 연도(2010, 2013 등)는 실제 입단 연도이므로 신인 아님
    // 팀 기준: base_team_id (top-level 컬럼) — 시뮬레이터와 동일한 소스
    const DRAFT_CLASS_YEAR = 2026;


    // 전체 results에 대해 base 아키타입 + 태그 + 그룹 평균 사전 계산
    const playerArchetypeMap = useMemo(() => {
        const map: Record<string, PlayerDataEntry> = {};
        for (const r of results) {
            try {
                const attrs = r.base_attributes;
                if (!attrs) continue;
                // attrs.position 없는 구형 선수는 top-level r.position으로 폴백 (구버전 동작 유지)
                const pos = (attrs.position ?? r.position) as string | undefined;
                map[r.id] = computePlayerDataEntry(attrs, pos, tagConfig);
            } catch { /* skip */ }
        }
        return map;
    }, [results, tagConfig]);

    // CO 데이터 맵 — custom_overrides를 base에 덮어씌운 전체 파생 데이터
    const playerCoDataMap = useMemo(() => {
        const map: Record<string, CoPlayerDataEntry> = {};
        for (const r of results) {
            try {
                const attrs = r.base_attributes;
                if (!attrs) continue;
                const co = (attrs.custom_overrides ?? {}) as Record<string, any>;
                if (Object.keys(co).length === 0) continue;
                const merged: Record<string, any> = { ...attrs };
                for (const [k, v] of Object.entries(co)) {
                    if (!DISPLAY_ONLY_CO_KEYS.has(k)) merged[k] = v; // position, team, age 포함
                }
                const coPos = (co.position ?? attrs.position ?? r.position ?? 'SF') as string;
                const entry = computePlayerDataEntry(merged, coPos, tagConfig);
                map[r.id] = {
                    ...entry,
                    position: coPos,
                    team: (co.team ?? attrs.team ?? r.base_team_id ?? '') as string,
                    age: co.age !== undefined ? Number(co.age) : (attrs.age ?? null),
                };
            } catch { /* skip */ }
        }
        return map;
    }, [results, tagConfig]);

    const filteredResults = useMemo(() => {
        return results.filter(r => {
            const isDraftClass = r.draft_year === DRAFT_CLASS_YEAR;
            // base_team_id는 이미 정규화된 슬러그('atl', 'gs' 등) — resolveTeamId 불필요
            const teamSlug = (r.base_team_id ?? '').trim().toLowerCase();
            const isFa = !teamSlug;

            if (filterTeams !== null) {
                if (filterTeams.length === 0) return false;
                const matchFa = filterTeams.includes('fa') && isFa;
                const matchTeam = !isDraftClass && !!teamSlug && filterTeams.includes(teamSlug);
                if (!matchFa && !matchTeam) return false;
            }

            if (filterPos !== 'all') {
                const basePos = r.position ?? r.base_attributes?.position;
                const effectivePos = ovrDisplayMode === 'custom'
                    ? (playerCoDataMap[r.id]?.position ?? basePos)
                    : basePos;
                if (effectivePos !== filterPos) return false;
            }

            if (filterAlltime === 'alltime_only' && !r.include_alltime) return false;
            if (filterAlltime === 'current_only' && r.include_alltime) return false;

            if (filterArchetype !== 'all') {
                const info = playerArchetypeMap[r.id];
                if (!info || (info.archetype !== filterArchetype && info.secondary !== filterArchetype)) return false;
            }

            if (filterTag !== 'all') {
                const info = playerArchetypeMap[r.id];
                if (!info || !info.tags.includes(filterTag)) return false;
            }

            const ovrMin = filterOvrMin !== '' ? parseInt(filterOvrMin, 10) : null;
            const ovrMax = filterOvrMax !== '' ? parseInt(filterOvrMax, 10) : null;
            if (ovrMin !== null || ovrMax !== null) {
                const baseOvr = playerArchetypeMap[r.id]?.displayOvr ?? r.base_attributes?.ovr ?? 0;
                const ovr = ovrDisplayMode === 'custom'
                    ? (playerCoDataMap[r.id]?.displayOvr ?? baseOvr)
                    : baseOvr;
                if (ovrMin !== null && ovr < ovrMin) return false;
                if (ovrMax !== null && ovr > ovrMax) return false;
            }

            if (filterDraftYearOp && filterDraftYearVal !== '') {
                const dy = r.draft_year;
                const val = Number(filterDraftYearVal);
                if (dy == null) return false;
                if (filterDraftYearOp === '<='  && !(dy <= val)) return false;
                if (filterDraftYearOp === '<'   && !(dy <  val)) return false;
                if (filterDraftYearOp === '='   && !(dy === val)) return false;
                if (filterDraftYearOp === '>'   && !(dy >  val)) return false;
                if (filterDraftYearOp === '>='  && !(dy >= val)) return false;
            }

            if (filterModule && filterModuleMin !== '') {
                const min = parseInt(filterModuleMin, 10);
                const score = playerArchetypeMap[r.id]?.modules[filterModule] ?? 0;
                if (score < min) return false;
            }

            return true;
        });
    }, [results, filterTeams, filterPos, filterAlltime, filterArchetype, filterTag, filterOvrMin, filterOvrMax, filterDraftYearOp, filterDraftYearVal, filterModule, filterModuleMin, playerArchetypeMap, playerCoDataMap, ovrDisplayMode]);

    const sortedResults = useMemo(() => {
        return [...filteredResults].sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'name') {
                cmp = a.name.localeCompare(b.name, 'ko');
            } else {
                const aBase = playerArchetypeMap[a.id]?.displayOvr ?? a.base_attributes?.ovr ?? 0;
                const bBase = playerArchetypeMap[b.id]?.displayOvr ?? b.base_attributes?.ovr ?? 0;
                const aOvr = ovrDisplayMode === 'custom' ? (playerCoDataMap[a.id]?.displayOvr ?? aBase) : aBase;
                const bOvr = ovrDisplayMode === 'custom' ? (playerCoDataMap[b.id]?.displayOvr ?? bBase) : bBase;
                cmp = aOvr - bOvr;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filteredResults, sortBy, sortDir, playerArchetypeMap, playerCoDataMap, ovrDisplayMode]);

    const handleSort = useCallback((col: 'name' | 'ovr') => {
        setSortBy(prev => {
            if (prev === col) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return col;
            }
            setSortDir(col === 'ovr' ? 'desc' : 'asc');
            return col;
        });
        setTablePage(0);
    }, []);

    const tablePageCount = Math.max(1, Math.ceil(sortedResults.length / tablePageSize));
    const tableRows = sortedResults.slice(tablePage * tablePageSize, (tablePage + 1) * tablePageSize);

    const tagLabelMap = useMemo<Record<string, string>>(() => {
        if (tagConfig.length > 0) return Object.fromEntries(tagConfig.map(t => [t.id, t.label]));
        return { ...TAG_LABEL };
    }, [tagConfig]);

    const ALL_TEAM_IDS = useMemo(() => ['fa', ...TEAM_OPTIONS.filter(t => t.id !== '').map(t => t.id)], []);
    const handleToggleTeam = useCallback((id: string) => {
        setFilterTeams(prev => {
            const base = prev === null ? ALL_TEAM_IDS : prev;
            const next = base.includes(id) ? base.filter(i => i !== id) : [...base, id];
            if (next.length >= ALL_TEAM_IDS.length) return null;
            return next;
        });
        setTablePage(0);
    }, [ALL_TEAM_IDS]);
    const handleSelectAllTeams = useCallback(() => {
        setFilterTeams(prev => prev === null ? [] : null);
        setTablePage(0);
    }, []);
    const handleFilterPos       = useCallback((v: string) => { setFilterPos(v);       setTablePage(0); }, []);
    const handleFilterAlltime   = useCallback((v: string) => { setFilterAlltime(v);   setTablePage(0); }, []);
    const handleFilterArchetype = useCallback((v: string) => { setFilterArchetype(v); setTablePage(0); }, []);
    const handleFilterTag       = useCallback((v: string) => { setFilterTag(v);       setTablePage(0); }, []);
    const handleFilterOvrMin    = useCallback((v: string) => { setFilterOvrMin(v);    setTablePage(0); }, []);
    const handleFilterOvrMax    = useCallback((v: string) => { setFilterOvrMax(v);    setTablePage(0); }, []);

    const handleOpenOvrChart = useCallback(() => {
        const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

        // 선수 데이터를 HTML에 임베드할 수 있도록 직렬화
        const playerData = results.flatMap(r => {
            const info = playerArchetypeMap[r.id];
            const coInfo = playerCoDataMap[r.id];
            const pos = r.position;
            if (!info || !POSITIONS.includes(pos as any)) return [];
            const isDraft   = r.draft_year === DRAFT_CLASS_YEAR;
            const isAlltime = !isDraft && r.include_alltime === true;
            const isActive  = !isDraft && !!r.base_team_id;
            const teamSlug  = (r.base_team_id ?? '').trim().toUpperCase();
            const teamLabel = isDraft ? `신인 '${r.draft_year}` : (teamSlug || 'FA');
            const age       = r.base_attributes?.age ?? null;
            const arch      = labelConfig[info.archetype] ?? info.archetype;
            const coArch    = coInfo ? (labelConfig[coInfo.archetype] ?? coInfo.archetype) : null;
            return [{ name: r.name, pos, team: teamLabel, age, arch, coArch, ovr: info.displayOvr, coOvr: coInfo?.displayOvr ?? null, isActive, isAlltime, isDraft }];
        });

        const cntActive  = playerData.filter(p => p.isActive).length;
        const cntAlltime = playerData.filter(p => p.isAlltime).length;
        const cntDraft   = playerData.filter(p => p.isDraft).length;

        const BUCKETS_STATIC = [[60,64],[65,69],[70,74],[75,79],[80,84],[85,89],[90,94],[95,99]];

        const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>OVR Distribution</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px}
h1{font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.sub{font-size:12px;color:#64748b;margin-bottom:16px}
.filters{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.filter-label{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.cbx{display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 12px;border-radius:6px;border:1px solid #334155;background:#1e293b;font-size:12px;color:#64748b;user-select:none;transition:border-color .15s,color .15s}
.cbx:hover{border-color:#6366f1;color:#e2e8f0}
.cbx.on{border-color:#6366f1;color:#e2e8f0}
.cbx input{accent-color:#6366f1;cursor:pointer;width:13px;height:13px}
.badge{font-size:10px;color:#475569;background:#0f172a;border-radius:4px;padding:1px 5px;margin-left:2px}
.count{font-size:12px;color:#475569;margin-left:auto}
.mode-btn{padding:5px 14px;border-radius:6px;border:1px solid #334155;background:#1e293b;font-size:12px;color:#64748b;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.mode-btn:hover{border-color:#6366f1;color:#e2e8f0}
.mode-btn.on{border-color:#6366f1;background:#312e81;color:#c7d2fe;font-weight:600}
.filter-sep{width:1px;height:20px;background:#334155;margin:0 4px}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
h2{font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.08em}
table{width:100%;font-size:12px;border-collapse:collapse}
th{text-align:right;padding:6px 10px;color:#64748b;border-bottom:1px solid #334155}
th:first-child{text-align:left}
td{text-align:right;padding:5px 10px;border-bottom:1px solid #1e293b}
td:first-child{text-align:left;font-weight:600}
.pl-wrap{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.pl-search{flex:1;padding:6px 12px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:12px;outline:none}
.pl-search:focus{border-color:#6366f1}
.pl-posfilter{display:flex;gap:6px}
.pl-posfilter button{padding:4px 10px;border-radius:5px;border:1px solid #334155;background:#0f172a;font-size:11px;font-weight:600;cursor:pointer;transition:border-color .12s,color .12s}
.pl-posfilter button:hover{border-color:#6366f1;color:#e2e8f0}
.pl-posfilter button.on{border-color:#6366f1;background:#312e81;color:#c7d2fe}
#pl-table{width:100%;font-size:12px;border-collapse:collapse}
#pl-table th{text-align:left;padding:6px 10px;color:#64748b;border-bottom:1px solid #334155;cursor:pointer;user-select:none;white-space:nowrap}
#pl-table th:hover{color:#e2e8f0}
#pl-table th.sort-asc::after{content:' ↑'}
#pl-table th.sort-desc::after{content:' ↓'}
#pl-table td{text-align:left;padding:5px 10px;border-bottom:1px solid #0f172a;white-space:nowrap}
#pl-table tr:hover td{background:rgba(99,102,241,.06)}
.pos-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.ovr-val{font-weight:700}
.co-badge{font-size:10px;color:#818cf8;margin-left:4px}
.hide{display:none}
.pl-info{font-size:11px;color:#475569}
.pl-copy{margin-left:auto;padding:4px 12px;border-radius:5px;border:1px solid #334155;background:#1e293b;font-size:11px;color:#94a3b8;cursor:pointer;transition:border-color .12s,color .12s}
.pl-copy:hover{border-color:#6366f1;color:#c7d2fe}
.pl-copy.copied{border-color:#22c55e;color:#86efac}
</style></head><body>
<h1>OVR Distribution by Position</h1>
<p class="sub">ovrEngine 동적 계산값 기준</p>
<div class="filters">
  <span class="filter-label">표시</span>
  <label class="cbx on" id="lbl-active"><input type="checkbox" id="cb-active" checked>현역<span class="badge">${cntActive}</span></label>
  <label class="cbx" id="lbl-alltime"><input type="checkbox" id="cb-alltime">올타임<span class="badge">${cntAlltime}</span></label>
  <label class="cbx" id="lbl-draft"><input type="checkbox" id="cb-draft">신인<span class="badge">${cntDraft}</span></label>
  <span class="count" id="total-count"></span>
</div>
<div class="card"><h2>포지션별 OVR 히스토그램 (5구간)</h2><canvas id="hist" height="90"></canvas></div>
<div class="card"><h2>포지션별 OVR 누적 분포 (CDF)</h2><canvas id="cdf" height="90"></canvas></div>
<div class="grid">
  <div class="card"><h2>포지션별 요약 통계</h2>
    <table><thead><tr><th>포지션</th><th>인원</th><th>평균</th><th>중앙값</th><th>최솟값</th><th>최댓값</th><th>80+</th><th>90+</th></tr></thead>
    <tbody id="stats-body"></tbody></table></div>
  <div class="card"><h2>구간별 인원 (5단위)</h2>
    <table><thead><tr><th>구간</th><th>PG</th><th>SG</th><th>SF</th><th>PF</th><th>C</th></tr></thead>
    <tbody id="bucket-body"></tbody></table></div>
</div>
<div class="card">
  <h2>선수 리스트</h2>
  <div class="pl-wrap">
    <input class="pl-search" id="pl-search" type="search" placeholder="이름 검색...">
    <div class="pl-posfilter">
      <button class="on" data-pos="ALL" onclick="setPosFilter('ALL')">전체</button>
      <button data-pos="PG" onclick="setPosFilter('PG')">PG</button>
      <button data-pos="SG" onclick="setPosFilter('SG')">SG</button>
      <button data-pos="SF" onclick="setPosFilter('SF')">SF</button>
      <button data-pos="PF" onclick="setPosFilter('PF')">PF</button>
      <button data-pos="C" onclick="setPosFilter('C')">C</button>
    </div>
    <span class="pl-info" id="pl-info"></span>
    <button class="pl-copy" id="pl-copy" onclick="copyPlayerList()">텍스트 복사</button>
  </div>
  <table id="pl-table">
    <thead><tr>
      <th style="width:36px">#</th>
      <th data-col="name">이름</th>
      <th data-col="pos">포지션</th>
      <th data-col="team">팀</th>
      <th data-col="age" style="width:48px">나이</th>
      <th data-col="ovr" style="width:56px">OVR</th>
      <th data-col="arch">아키타입</th>
    </tr></thead>
    <tbody id="pl-body"></tbody>
  </table>
</div>
<script>
const ALL = ${JSON.stringify(playerData)};
const POS = ['PG','SG','SF','PF','C'];
const BUCKETS = ${JSON.stringify(BUCKETS_STATIC)};
const COLORS = {PG:'rgba(99,102,241,.8)',SG:'rgba(14,165,233,.8)',SF:'rgba(34,197,94,.8)',PF:'rgba(249,115,22,.8)',C:'rgba(236,72,153,.8)'};
const BORDER = {PG:'rgba(99,102,241,1)',SG:'rgba(14,165,233,1)',SF:'rgba(34,197,94,1)',PF:'rgba(249,115,22,1)',C:'rgba(236,72,153,1)'};
function getOvr(p){const alltimeOn=document.getElementById('cb-alltime').checked;return p.isAlltime&&alltimeOn&&p.coOvr!==null?p.coOvr:p.ovr;}
function getFiltered(){
  const a=document.getElementById('cb-active').checked;
  const t=document.getElementById('cb-alltime').checked;
  const d=document.getElementById('cb-draft').checked;
  return ALL.filter(p=>(a&&p.isActive)||(t&&p.isAlltime)||(d&&p.isDraft));
}
function byPos(players){
  const m={PG:[],SG:[],SF:[],PF:[],C:[]};
  for(const p of players) if(m[p.pos]) m[p.pos].push(getOvr(p));
  return m;
}
function bucketDatasets(bp){
  return POS.map(pos=>({label:pos,data:BUCKETS.map(([lo,hi])=>bp[pos].filter(v=>v>=lo&&v<=hi).length),backgroundColor:COLORS[pos],borderColor:BORDER[pos],borderWidth:1,borderRadius:3}));
}
function cdfDatasets(bp){
  const rng=Array.from({length:40},(_,i)=>60+i);
  return POS.map(pos=>{
    const arr=[...bp[pos]].sort((a,b)=>a-b);const n=arr.length;
    return{label:pos,data:rng.map(o=>n?parseFloat((arr.filter(v=>v<=o).length/n*100).toFixed(1)):0),borderColor:BORDER[pos],backgroundColor:'transparent',borderWidth:2,pointRadius:0,tension:.3};
  });
}
function renderTables(bp){
  const statsRows=POS.map(pos=>{
    const arr=[...bp[pos]].sort((a,b)=>a-b);const n=arr.length;
    if(!n)return'<tr><td style="color:'+BORDER[pos]+';font-weight:700">'+pos+'</td><td colspan="7">데이터 없음</td></tr>';
    const avg=(arr.reduce((s,v)=>s+v,0)/n).toFixed(1);
    const med=n%2?arr[Math.floor(n/2)]:((arr[n/2-1]+arr[n/2])/2).toFixed(1);
    const a80=arr.filter(v=>v>=80).length,a90=arr.filter(v=>v>=90).length;
    return'<tr><td style="color:'+BORDER[pos]+';font-weight:700">'+pos+'</td><td>'+n+'</td><td>'+avg+'</td><td>'+med+'</td><td>'+arr[0]+'</td><td>'+arr[n-1]+'</td><td>'+a80+' <span style="color:#64748b;font-size:10px">('+( a80/n*100).toFixed(0)+'%)</span></td><td>'+a90+' <span style="color:#64748b;font-size:10px">'+'('+( a90/n*100).toFixed(0)+'%)</span></td></tr>';
  }).join('');
  document.getElementById('stats-body').innerHTML=statsRows;
  const maxB=Math.max(1,...BUCKETS.map(([lo,hi])=>Math.max(...POS.map(pos=>bp[pos].filter(v=>v>=lo&&v<=hi).length))));
  const bucketRows=BUCKETS.map(([lo,hi])=>{
    const cells=POS.map(pos=>{const v=bp[pos].filter(x=>x>=lo&&x<=hi).length;const w=Math.round(v/maxB*60);return'<td><span style="display:inline-block;width:'+w+'px;height:8px;border-radius:2px;background:'+COLORS[pos]+';vertical-align:middle;margin-right:4px"></span>'+v+'</td>';}).join('');
    return'<tr><td>'+lo+'–'+hi+'</td>'+cells+'</tr>';
  }).join('');
  document.getElementById('bucket-body').innerHTML=bucketRows;
}
const DOT_COLOR={PG:'#6366f1',SG:'#0ea5e9',SF:'#22c55e',PF:'#f97316',C:'#ec4899'};
const chartOpts=(xLabel)=>({responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}}},tooltip:{mode:'index'}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'#1e293b'},title:{display:!!xLabel,text:xLabel,color:'#64748b'}},y:{ticks:{color:'#94a3b8'},grid:{color:'#334155'},beginAtZero:true}}});
const initBP=byPos(getFiltered());
const histChart=new Chart(document.getElementById('hist'),{type:'bar',data:{labels:${JSON.stringify(BUCKETS_STATIC.map(([a,b])=>`${a}–${b}`))},datasets:bucketDatasets(initBP)},options:chartOpts('')});
const cdfChart=new Chart(document.getElementById('cdf'),{type:'line',data:{labels:Array.from({length:40},(_,i)=>60+i),datasets:cdfDatasets(initBP)},options:{...chartOpts('OVR'),scales:{...chartOpts('OVR').scales,y:{ticks:{color:'#94a3b8',callback:v=>v+'%'},grid:{color:'#334155'},min:0,max:100}}}});
renderTables(initBP);
document.getElementById('total-count').textContent='총 '+getFiltered().length+'명';

let plSortCol='ovr', plSortDir=-1, plPosFilter='ALL';
function getPlFiltered(){
  const q=document.getElementById('pl-search').value.toLowerCase().trim();
  return getFiltered().filter(p=>{
    if(plPosFilter!=='ALL'&&p.pos!==plPosFilter)return false;
    if(q&&!p.name.toLowerCase().includes(q))return false;
    return true;
  });
}
function renderPlayerList(){
  const players=[...getPlFiltered()];
  players.sort((a,b)=>{
    let av=a[plSortCol],bv=b[plSortCol];
    if(plSortCol==='ovr'){av=getOvr(a);bv=getOvr(b);}
    else if(plSortCol==='arch'){av=a.isAlltime&&a.coArch?a.coArch:a.arch;bv=b.isAlltime&&b.coArch?b.coArch:b.arch;}
    if(typeof av==='string'&&typeof bv==='string')return av.localeCompare(bv,'ko')*plSortDir;
    return((av??-999)-(bv??-999))*plSortDir;
  });
  const rows=players.map((p,i)=>{
    const ov=getOvr(p);
    const archLabel=p.isAlltime&&p.coArch?p.coArch:p.arch;
    const dot='<span class="pos-dot" style="background:'+DOT_COLOR[p.pos]+'"></span>';
    const ovrCell='<span class="ovr-val" style="color:'+ovrColor(ov)+'">'+ov+'</span>';
    return'<tr><td style="color:#475569;font-size:11px">'+(i+1)+'</td><td>'+p.name+'</td><td>'+dot+p.pos+'</td><td style="color:#94a3b8">'+p.team+'</td><td style="color:#94a3b8">'+( p.age??'—')+'</td><td>'+ovrCell+'</td><td style="color:#94a3b8;max-width:180px;overflow:hidden;text-overflow:ellipsis">'+archLabel+'</td></tr>';
  }).join('');
  document.getElementById('pl-body').innerHTML=rows||'<tr><td colspan="7" style="text-align:center;color:#475569;padding:20px">검색 결과 없음</td></tr>';
  document.getElementById('pl-info').textContent=players.length+'명';
  document.querySelectorAll('#pl-table th').forEach(th=>{th.classList.remove('sort-asc','sort-desc');if(th.dataset.col===plSortCol)th.classList.add(plSortDir===1?'sort-asc':'sort-desc');});
}
function ovrColor(v){if(v>=90)return'#a78bfa';if(v>=83)return'#818cf8';if(v>=75)return'#6ee7b7';if(v>=68)return'#fcd34d';return'#94a3b8';}
function copyPlayerList(){
  const players=[...getPlFiltered()];
  players.sort((a,b)=>{
    let av=a[plSortCol],bv=b[plSortCol];
    if(plSortCol==='ovr'){av=getOvr(a);bv=getOvr(b);}
    else if(plSortCol==='arch'){av=a.isAlltime&&a.coArch?a.coArch:a.arch;bv=b.isAlltime&&b.coArch?b.coArch:b.arch;}
    if(typeof av==='string'&&typeof bv==='string')return av.localeCompare(bv,'ko')*plSortDir;
    return((av??-999)-(bv??-999))*plSortDir;
  });
  const cols=['#','이름','포지션','팀','나이','OVR','아키타입'];
  const rows=players.map((p,i)=>[
    String(i+1),
    p.name,
    p.pos,
    p.team,
    p.age!=null?String(p.age):'—',
    String(getOvr(p)),
    p.isAlltime&&p.coArch?p.coArch:p.arch,
  ]);
  const widths=cols.map((c,ci)=>Math.max(c.length,...rows.map(r=>r[ci].length)));
  const pad=(s,w)=>s+' '.repeat(Math.max(0,w-s.length));
  const sep='| '+widths.map(w=>'-'.repeat(w)).join(' | ')+' |';
  const header='| '+cols.map((c,i)=>pad(c,widths[i])).join(' | ')+' |';
  const body=rows.map(r=>'| '+r.map((c,i)=>pad(c,widths[i])).join(' | ')+' |').join('\\n');
  const text=header+'\\n'+sep+'\\n'+body;
  navigator.clipboard.writeText(text).then(()=>{
    const btn=document.getElementById('pl-copy');
    btn.textContent='복사됨!';btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='텍스트 복사';btn.classList.remove('copied');},2000);
  }).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
    const btn=document.getElementById('pl-copy');
    btn.textContent='복사됨!';btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='텍스트 복사';btn.classList.remove('copied');},2000);
  });
}
function setPosFilter(pos){
  plPosFilter=pos;
  document.querySelectorAll('.pl-posfilter button').forEach(b=>{b.classList.toggle('on',b.dataset.pos===pos);});
  renderPlayerList();
}
document.querySelectorAll('#pl-table th').forEach(th=>{
  th.addEventListener('click',()=>{
    const col=th.dataset.col;
    if(!col)return;
    if(plSortCol===col){plSortDir*=-1;}else{plSortCol=col;plSortDir=col==='ovr'||col==='age'?-1:1;}
    renderPlayerList();
  });
});
document.getElementById('pl-search').addEventListener('input',renderPlayerList);
renderPlayerList();

function render(){
  ['active','alltime','draft'].forEach(id=>{document.getElementById('lbl-'+id).classList.toggle('on',document.getElementById('cb-'+id).checked);});
  const filtered=getFiltered();
  document.getElementById('total-count').textContent='총 '+filtered.length+'명';
  const bp=byPos(filtered);
  histChart.data.datasets=bucketDatasets(bp);histChart.update();
  cdfChart.data.datasets=cdfDatasets(bp);cdfChart.update();
  renderTables(bp);
  renderPlayerList();
}
['cb-active','cb-alltime','cb-draft'].forEach(id=>document.getElementById(id).addEventListener('change',render));
<\/script></body></html>`;

        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
    }, [results, playerArchetypeMap, playerCoDataMap]);

    // ── 테이블 내보내기 (CSV / Markdown / Embed HTML) ─────────────────────────
    const handleExport = useCallback((format: 'csv' | 'markdown' | 'html') => {
        const HEADERS = ['이름', '포지션', '팀', '나이', 'OVR', '1차 아키타입', '2차 아키타입', '태그'];

        const dataRows = sortedResults.map(r => {
            const isDraft   = r.draft_year === DRAFT_CLASS_YEAR;
            const teamSlug  = (r.base_team_id ?? '').trim().toLowerCase();
            const isFa      = !isDraft && !teamSlug;
            const teamLabel = isDraft
                ? `신인 '${r.draft_year}`
                : isFa ? 'FA'
                : (TEAM_OPTIONS.find(t => t.id === teamSlug)?.label.split(' · ')[0] ?? teamSlug.toUpperCase());
            const arch = playerArchetypeMap[r.id];
            return [
                r.name,
                r.position,
                teamLabel,
                String(r.base_attributes?.age ?? ''),
                arch ? String(arch.displayOvr) : String(r.base_attributes?.ovr ?? ''),
                arch ? (labelConfig[arch.archetype] ?? arch.archetype) : '',
                arch?.secondary ? (labelConfig[arch.secondary] ?? arch.secondary) : '',
                arch?.tags.length ? arch.tags.map(t => tagLabelMap[t] ?? t).join(', ') : '',
            ];
        });

        const dl = (content: string, mime: string, ext: string) => {
            const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = `players_${Date.now()}.${ext}`; a.click();
            URL.revokeObjectURL(url);
        };

        if (format === 'csv') {
            const lines = [HEADERS, ...dataRows].map(row =>
                row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
            );
            dl('\uFEFF' + lines.join('\r\n'), 'text/csv', 'csv');

        } else if (format === 'markdown') {
            const sep = '| ' + HEADERS.map(() => ':---').join(' | ') + ' |';
            const md  = [
                '| ' + HEADERS.join(' | ') + ' |',
                sep,
                ...dataRows.map(row => '| ' + row.join(' | ') + ' |'),
            ].join('\n');
            dl(md, 'text/plain', 'md');

        } else {
            // Embedded standalone HTML
            const tbody = dataRows.map(row =>
                '<tr>' +
                row.map((v, i) => `<td style="text-align:${i === 4 ? 'center' : 'left'}">${v}</td>`).join('') +
                '</tr>'
            ).join('\n');

            const exportHtml = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>선수 데이터 내보내기</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; padding: 20px; font-size: 12px; }
h1 { font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
.meta { font-size: 11px; color: #64748b; margin-bottom: 12px; }
input.search { padding: 5px 10px; border: 1px solid #334155; border-radius: 4px; background: #1e293b; color: #e2e8f0; font-size: 12px; width: 220px; margin-bottom: 12px; outline: none; }
table { border-collapse: collapse; width: 100%; background: #1e293b; border-radius: 8px; overflow: hidden; }
thead th { background: #0f172a; color: #94a3b8; font-weight: 600; padding: 7px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; border-bottom: 1px solid #334155; cursor: pointer; user-select: none; white-space: nowrap; }
thead th:hover { color: #e2e8f0; }
tbody tr { border-bottom: 1px solid #1e293b; }
tbody tr:hover { background: rgba(99,102,241,0.1); }
td { padding: 5px 10px; }
td:nth-child(5) { font-weight: 700; color: #a5b4fc; }
.hide { display: none; }
</style></head><body>
<h1>선수 데이터 내보내기</h1>
<p class="meta">${sortedResults.length}명 · NBA-GM-SIM · ${new Date().toLocaleDateString('ko-KR')}</p>
<input class="search" type="search" placeholder="이름으로 검색..." oninput="filterRows(this.value)">
<table id="t">
<thead><tr>${HEADERS.map(h => `<th onclick="sortBy(this)">${h}</th>`).join('')}</tr></thead>
<tbody>
${tbody}
</tbody></table>
<script>
function filterRows(q) {
  const lq = q.toLowerCase();
  document.querySelectorAll('#t tbody tr').forEach(r => {
    r.classList.toggle('hide', !!lq && !r.cells[0].textContent.toLowerCase().includes(lq));
  });
}
let _col = -1, _dir = 1;
function sortBy(th) {
  const col = [...th.parentElement.children].indexOf(th);
  _dir = _col === col ? -_dir : 1; _col = col;
  const tb = document.querySelector('#t tbody');
  [...tb.querySelectorAll('tr')]
    .sort((a, b) => {
      const av = a.cells[col]?.textContent?.trim() ?? '';
      const bv = b.cells[col]?.textContent?.trim() ?? '';
      const an = parseFloat(av), bn = parseFloat(bv);
      return ((!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv, 'ko')) * _dir;
    })
    .forEach(r => tb.appendChild(r));
}
<\/script></body></html>`;

            const blob = new Blob([exportHtml], { type: 'text/html' });
            window.open(URL.createObjectURL(blob), '_blank');
        }
    }, [sortedResults, playerArchetypeMap, tagLabelMap]);

    const handleSelect = useCallback(async (row: MetaPlayerRow) => {
        const [fresh, log] = await Promise.all([
            fetchPlayerById(row.id),
            fetchEditLog(row.id).catch(() => [] as EditLogEntry[]),
        ]);
        if (!fresh) return;
        setSelected(fresh);
        setIncludeAlltimeState(fresh.include_alltime ?? true);
        setInMultiPoolState(fresh.in_multi_pool ?? true);
        setDraftYearVal(fresh.draft_year != null ? String(fresh.draft_year) : '');
        const attrs = JSON.parse(JSON.stringify(fresh.base_attributes));
        if (attrs.team) {
            const slug = resolveTeamId(attrs.team);
            attrs.team = slug !== 'unknown' ? slug : '';
        }
        // base_attributes에 position/name이 없는 구형 선수는 테이블 컬럼 값으로 보완
        if (!attrs.position && fresh.position) attrs.position = fresh.position;
        if (!attrs.name && fresh.name) attrs.name = fresh.name;
        originalAttrsRef.current = JSON.parse(JSON.stringify(attrs));
        setDraft(attrs);
        const td = fresh.tendencies ? JSON.parse(JSON.stringify(fresh.tendencies)) : null;
        originalTendenciesRef.current = td;
        setTendencies(td);
        setEditLog(log);
        setShowDropdown(false);
        setQuery(row.name);
        setSaveMsg(null);
    }, []);

    const setField = useCallback((key: string, raw: string) => {
        const num = Number(raw);
        setDraft(prev => ({ ...prev, [key]: isNaN(num) ? raw : num }));
    }, []);

    // ── base contract ──────────────────────────────────────────────────────
    const setContractYear = useCallback((idx: number, raw: string) => {
        const num = Number(raw.replace(/,/g, ''));
        setDraft(prev => {
            const contract = { ...(prev.contract ?? {}), years: [...(prev.contract?.years ?? [])] };
            contract.years[idx] = isNaN(num) ? 0 : num;
            const cur = contract.currentYear ?? 0;
            return { ...prev, contract, salary: contract.years[cur] ?? prev.salary };
        });
    }, []);

    const addContractYear = useCallback(() => {
        setDraft(prev => {
            const years = [...(prev.contract?.years ?? [])];
            years.push(0);
            return { ...prev, contract: { ...(prev.contract ?? {}), years } };
        });
    }, []);

    const removeContractYear = useCallback((idx: number) => {
        setDraft(prev => {
            const years = [...(prev.contract?.years ?? [])];
            years.splice(idx, 1);
            const contract = { ...(prev.contract ?? {}), years };
            if ((contract.currentYear ?? 0) >= years.length)
                contract.currentYear = Math.max(0, years.length - 1);
            return { ...prev, contract, salary: years[contract.currentYear ?? 0] ?? prev.salary };
        });
    }, []);

    const setContractField = useCallback((key: string, val: any) => {
        setDraft(prev => ({ ...prev, contract: { ...(prev.contract ?? {}), [key]: val } }));
    }, []);

    // ── CO contract ────────────────────────────────────────────────────────
    const initCoContract = useCallback(() => {
        setDraft(prev => ({
            ...prev,
            custom_overrides: {
                ...(prev.custom_overrides ?? {}),
                contract: JSON.parse(JSON.stringify(prev.contract ?? {})),
            },
        }));
    }, []);

    const clearCoContract = useCallback(() => {
        setDraft(prev => {
            const co = { ...(prev.custom_overrides ?? {}) };
            delete co.contract;
            delete co.salary;
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const setCoContractYear = useCallback((idx: number, raw: string) => {
        const num = Number(raw.replace(/,/g, ''));
        setDraft(prev => {
            const coC = { ...(prev.custom_overrides?.contract ?? {}), years: [...(prev.custom_overrides?.contract?.years ?? [])] };
            coC.years[idx] = isNaN(num) ? 0 : num;
            const cur = coC.currentYear ?? 0;
            const coSalary = coC.years[cur];
            return {
                ...prev,
                custom_overrides: {
                    ...(prev.custom_overrides ?? {}),
                    contract: coC,
                    ...(coSalary !== undefined ? { salary: coSalary } : {}),
                },
            };
        });
    }, []);

    const addCoContractYear = useCallback(() => {
        setDraft(prev => {
            const years = [...(prev.custom_overrides?.contract?.years ?? [])];
            years.push(0);
            return {
                ...prev,
                custom_overrides: {
                    ...(prev.custom_overrides ?? {}),
                    contract: { ...(prev.custom_overrides?.contract ?? {}), years },
                },
            };
        });
    }, []);

    const removeCoContractYear = useCallback((idx: number) => {
        setDraft(prev => {
            const years = [...(prev.custom_overrides?.contract?.years ?? [])];
            years.splice(idx, 1);
            const coC = { ...(prev.custom_overrides?.contract ?? {}), years };
            if ((coC.currentYear ?? 0) >= years.length)
                coC.currentYear = Math.max(0, years.length - 1);
            return {
                ...prev,
                custom_overrides: { ...(prev.custom_overrides ?? {}), contract: coC },
            };
        });
    }, []);

    const setCoContractField = useCallback((key: string, val: any) => {
        setDraft(prev => ({
            ...prev,
            custom_overrides: {
                ...(prev.custom_overrides ?? {}),
                contract: { ...(prev.custom_overrides?.contract ?? {}), [key]: val },
            },
        }));
    }, []);

    // ── CO stat 필드 ───────────────────────────────────────────────────────
    const setCoField = useCallback((key: string, raw: string) => {
        setDraft(prev => {
            const co: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
            if (raw === '' || raw === '-') delete co[key];
            else { const num = Number(raw); co[key] = isNaN(num) ? raw : num; }
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const clearSectionCo = useCallback((keys: string[]) => {
        setDraft(prev => {
            const co: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
            keys.forEach(k => delete co[k]);
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const handleClearAllCo = useCallback(async () => {
        if (!selected) return;
        const cleared = { ...draft, custom_overrides: {} };
        setDraft(cleared);
        setSaving(true);
        setSaveMsg(null);
        try {
            await updateBaseAttributes(selected.id, cleared);
            setSaveMsg('✓ CO 전체 삭제');
        } catch (e: any) {
            setSaveMsg(`✗ 저장 실패: ${e.message}`);
        } finally {
            setSaving(false);
        }
    }, [selected, draft]);

    // ── 선수 추가 ──────────────────────────────────────────────────────────────
    const handleAddPlayer = useCallback(async () => {
        if (!addModal) return;
        const name = addModal.name.trim();
        if (!name) { setAddError('이름을 입력해주세요.'); return; }
        setAddSaving(true);
        setAddError(null);
        try {
            const attrs = DEFAULT_PLAYER_ATTRS(name, addModal.position, addModal.team);
            const newRow = await insertPlayer({
                name,
                position: addModal.position,
                base_team_id: addModal.team || null,
                base_attributes: attrs,
            });
            const refreshed = await searchPlayers('');
            setResults(refreshed);
            setAddModal(null);
            await handleSelect(newRow);
            setQuery(name);
        } catch (e: any) {
            setAddError(e.message ?? '저장 실패');
        } finally {
            setAddSaving(false);
        }
    }, [addModal]);

    // ── 선수 삭제 ──────────────────────────────────────────────────────────────
    const handleDeletePlayer = useCallback(async () => {
        if (!selected) return;
        const confirmed = window.confirm(`"${selected.name}" 선수를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
        if (!confirmed) return;
        setDeleting(true);
        try {
            await deletePlayer(selected.id);
            const refreshed = await searchPlayers('');
            setResults(refreshed);
            setSelected(null);
            setDraft({});
            setQuery('');
        } catch (e: any) {
            alert(`삭제 실패: ${e.message}`);
        } finally {
            setDeleting(false);
        }
    }, [selected]);

    // ── 부상 상태 ──────────────────────────────────────────────────────────────
    const handleHealthChange = useCallback((health: 'Healthy' | 'Injured' | 'Day-to-Day') => {
        setDraft(prev => {
            const next = { ...prev, health };
            if (health === 'Healthy') {
                delete next.injuryType;
                delete next.returnDate;
            }
            return next;
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (!selected) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const diff = computeDiff(originalAttrsRef.current, draft);
            const newName = typeof draft.name === 'string' ? draft.name.trim() : '';

            // base_attributes 저장 (name 포함)
            await updateBaseAttributes(selected.id, draft);

            // draft_year 컬럼 동기화 (변경된 경우)
            const newDraftYear = draftYearVal.trim() === '' ? null : Number(draftYearVal);
            const prevDraftYear = selected.draft_year ?? null;
            if (newDraftYear !== prevDraftYear) {
                await updateDraftYear(selected.id, newDraftYear);
                diff['draft_year'] = { before: prevDraftYear, after: newDraftYear };
                setResults(prev => prev.map(r => r.id === selected.id ? { ...r, draft_year: newDraftYear } : r));
            }

            // name 컬럼 동기화 (변경된 경우)
            if (newName && newName !== selected.name) {
                await updatePlayerName(selected.id, newName);
                setSelected(prev => prev ? { ...prev, name: newName } : prev);
                setResults(prev => prev.map(r => r.id === selected.id ? { ...r, name: newName } : r));
                setQuery(newName);
            }

            // tendencies 저장 (변경된 경우 — diff에 포함)
            const tendenciesChanged = JSON.stringify(tendencies) !== JSON.stringify(originalTendenciesRef.current);
            if (tendenciesChanged) {
                await updatePlayerTendencies(selected.id, tendencies);
                diff['tendencies'] = { before: originalTendenciesRef.current, after: tendencies };
                originalTendenciesRef.current = tendencies ? JSON.parse(JSON.stringify(tendencies)) : null;
            }

            if (Object.keys(diff).length > 0) {
                const logName = newName || selected.name;
                const entry = await insertEditLog(selected.id, logName, diff);
                if (entry) setEditLog(prev => [entry, ...prev]);
            }
            originalAttrsRef.current = JSON.parse(JSON.stringify(draft));
            const fresh = await fetchPlayerById(selected.id);
            if (fresh) {
                setSelected(fresh);
                setResults(prev => prev.map(r => r.id === selected.id ? fresh : r));
            }
            setSaveMsg('✓ 저장 완료');
        } catch (e: any) {
            setSaveMsg(`✗ 저장 실패: ${e.message}`);
        } finally {
            setSaving(false);
        }
    }, [selected, draft, tendencies, draftYearVal]);

    const handleIncludeAlltimeToggle = useCallback(async (newVal: boolean) => {
        if (!selected) return;
        setAlltimeToggling(true);
        try {
            await updateIncludeAlltime(selected.id, newVal);
            setIncludeAlltimeState(newVal);
            setResults(prev => prev.map(r => r.id === selected.id ? { ...r, include_alltime: newVal } : r));
        } catch (e: any) {
            setSaveMsg(`✗ 드래프트 풀 설정 실패: ${e.message}`);
        } finally {
            setAlltimeToggling(false);
        }
    }, [selected]);

    const handleInMultiPoolToggle = useCallback(async (newVal: boolean) => {
        if (!selected) return;
        setMultiPoolToggling(true);
        try {
            await updateInMultiPool(selected.id, newVal);
            setInMultiPoolState(newVal);
            setResults(prev => prev.map(r => r.id === selected.id ? { ...r, in_multi_pool: newVal } : r));
        } catch (e: any) {
            setSaveMsg(`✗ 멀티 풀 설정 실패: ${e.message}`);
        } finally {
            setMultiPoolToggling(false);
        }
    }, [selected]);

    const handleRowAlltimeToggle = useCallback(async (id: string, newVal: boolean) => {
        setTogglingRows(prev => ({ ...prev, [id]: 'alltime' }));
        try {
            await updateIncludeAlltime(id, newVal);
            setResults(prev => prev.map(r => r.id === id ? { ...r, include_alltime: newVal } : r));
            if (selected?.id === id) setIncludeAlltimeState(newVal);
        } catch (e: any) {
            setSaveMsg(`✗ 올타임 설정 실패: ${e.message}`);
        } finally {
            setTogglingRows(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
    }, [selected]);

    const handleRowMultiToggle = useCallback(async (id: string, newVal: boolean) => {
        setTogglingRows(prev => ({ ...prev, [id]: 'multi' }));
        try {
            await updateInMultiPool(id, newVal);
            setResults(prev => prev.map(r => r.id === id ? { ...r, in_multi_pool: newVal } : r));
            if (selected?.id === id) setInMultiPoolState(newVal);
        } catch (e: any) {
            setSaveMsg(`✗ 멀티 풀 설정 실패: ${e.message}`);
        } finally {
            setTogglingRows(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
    }, [selected]);

    // ── 일괄 업데이트 ─────────────────────────────────────────────────────────
    const [bulkSaving, setBulkSaving] = useState<'alltime' | 'multi' | null>(null);

    // 헤더 체크박스 파생 상태 (sortedResults 직접 계산)
    const alltimeAllChecked  = sortedResults.length > 0 && sortedResults.every(r => r.include_alltime);
    const alltimeSomeChecked = !alltimeAllChecked && sortedResults.some(r => r.include_alltime);
    const multiAllChecked    = sortedResults.length > 0 && sortedResults.every(r => r.in_multi_pool ?? true);
    const multiSomeChecked   = !multiAllChecked && sortedResults.some(r => r.in_multi_pool ?? true);

    // indeterminate 상태 DOM 동기화
    useEffect(() => {
        if (bulkAlltimeRef.current) bulkAlltimeRef.current.indeterminate = alltimeSomeChecked;
    }, [alltimeSomeChecked]);
    useEffect(() => {
        if (bulkMultiRef.current) bulkMultiRef.current.indeterminate = multiSomeChecked;
    }, [multiSomeChecked]);

    const handleBulkAlltimeSet = useCallback(async (value: boolean) => {
        const ids = sortedResults.map(r => r.id);
        if (ids.length === 0) return;
        setBulkSaving('alltime');
        try {
            await bulkUpdateIncludeAlltime(ids, value);
            setResults(prev => {
                const set = new Set(ids);
                return prev.map(r => set.has(r.id) ? { ...r, include_alltime: value } : r);
            });
            if (selected && ids.includes(selected.id)) setIncludeAlltimeState(value);
        } catch (e: any) {
            setSaveMsg(`✗ 올타임 일괄 설정 실패: ${e.message}`);
        } finally {
            setBulkSaving(null);
        }
    }, [sortedResults, selected]);

    const handleBulkMultiSet = useCallback(async (value: boolean) => {
        const ids = sortedResults.map(r => r.id);
        if (ids.length === 0) return;
        setBulkSaving('multi');
        try {
            await bulkUpdateInMultiPool(ids, value);
            setResults(prev => {
                const set = new Set(ids);
                return prev.map(r => set.has(r.id) ? { ...r, in_multi_pool: value } : r);
            });
            if (selected && ids.includes(selected.id)) setInMultiPoolState(value);
        } catch (e: any) {
            setSaveMsg(`✗ 멀티 풀 일괄 설정 실패: ${e.message}`);
        } finally {
            setBulkSaving(null);
        }
    }, [sortedResults, selected]);

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
                관리자 계정으로 로그인하세요.
            </div>
        );
    }

    const co: Record<string, any> = draft.custom_overrides ?? {};

    const renderStatSection = (section: typeof STAT_SECTIONS[0]) => {
        const sectionKeys = section.keys.map(k => k.key);
        const hasSectionCo = sectionKeys.some(k => co[k] !== undefined);
        return (
        <Section key={section.label} label={section.label}>
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                <table className="min-w-full divide-y divide-white/5">
                    <thead className="bg-white/5">
                        <tr>
                            <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-400">능력치</th>
                            <th scope="col" className="w-16 px-3 py-3 text-center text-xs font-semibold text-gray-400">base</th>
                            <th scope="col" className="w-16 py-3 pl-3 pr-4 text-center text-xs font-semibold text-amber-500/70">
                                <span className="inline-flex items-center justify-center gap-1">
                                    CO
                                    {hasSectionCo && (
                                        <button
                                            onClick={() => clearSectionCo(sectionKeys)}
                                            className="text-[9px] text-gray-600 hover:text-red-400 transition-colors leading-none"
                                            title="이 섹션 CO 값 전체 초기화"
                                        >✕</button>
                                    )}
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {section.keys.map(({ key, label }) => {
                            const baseVal = draft[key] as number | undefined;
                            const coVal   = co[key]   as number | undefined;
                            return (
                                <tr key={key} className="hover:bg-white/5 group transition-colors">
                                    <td className="py-3 pl-4 pr-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {baseVal !== undefined && (
                                                <span className={`text-xs font-bold font-mono w-5 text-right shrink-0 ${attrColor(baseVal)}`}>
                                                    {baseVal}
                                                </span>
                                            )}
                                            <span className="text-sm text-gray-300 truncate">{label}</span>
                                            <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{key}</span>
                                        </div>
                                    </td>
                                    <td className="w-16 px-3 py-2.5">
                                        <input
                                            type="number" min={0} max={99}
                                            className="w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white text-center ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                            value={baseVal ?? ''}
                                            onChange={e => setField(key, e.target.value)}
                                        />
                                    </td>
                                    <td className="w-16 py-2.5 pl-3 pr-4">
                                        <input
                                            type="number" min={0} max={99}
                                            placeholder="—"
                                            className={`w-full rounded px-2 py-0.5 text-sm text-center ring-1 ring-inset focus:outline-none placeholder-gray-700 transition-colors ${
                                                coVal !== undefined
                                                    ? 'bg-amber-950/20 text-amber-300 ring-amber-500/40 focus:ring-amber-400'
                                                    : 'bg-white/[0.03] text-gray-500 ring-white/10 focus:ring-amber-500/50'
                                            }`}
                                            value={coVal ?? ''}
                                            onChange={e => setCoField(key, e.target.value)}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Section>
        );
    };

    return (
        <div>
            {/* 검색 + 테이블 */}
            <div className="mb-6">
                {/* 검색 인풋 + 새 선수 추가 */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1 max-w-sm">
                        <input
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                            placeholder="선수 이름 검색 (비워두면 전체 목록)..."
                            value={query}
                            onChange={handleSearch}
                            onFocus={handleFocus}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                        />
                        {showDropdown && results.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-20 bg-slate-800 border border-slate-700 rounded-lg mt-1 overflow-y-auto overscroll-contain shadow-xl" style={{ maxHeight: '224px' }}>
                                {results.map(r => (
                                    <button
                                        key={r.id}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex justify-between items-center"
                                        onClick={() => handleSelect(r)}
                                    >
                                        <span className="text-white">{r.name}</span>
                                        <span className="text-slate-400 text-xs">{r.position} · {r.base_attributes?.team ?? '—'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setAddModal({ name: '', position: 'SF', team: '' })}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors shrink-0"
                    >
                        + 새 선수
                    </button>
                </div>

                {/* 필터 + 테이블 */}
                {results.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        {/* 필터 바 */}
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 flex-wrap">
                            <span className="text-xs text-slate-500 shrink-0">필터</span>
                            {/* 팀 필터 — 드롭다운 + 체크박스 */}
                            <div className="relative" ref={teamFilterRef}>
                                <button
                                    onClick={() => setFilterTeamOpen(p => !p)}
                                    className={`flex items-center gap-1 bg-slate-800 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${filterTeams !== null ? 'border-indigo-500 text-indigo-300' : 'border-slate-700 text-white'}`}
                                >
                                    {filterTeams === null ? '전체 팀' : filterTeams.length === 0 ? '선택 없음' : `${filterTeams.length}개 선택`}
                                    <span className="text-slate-500 ml-0.5">▾</span>
                                </button>
                                {filterTeamOpen && (
                                    <div className="absolute top-full left-0 z-50 mt-1 w-52 bg-slate-900 border border-slate-700 rounded shadow-xl max-h-72 overflow-y-auto">
                                        {/* 전체선택 */}
                                        <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-700 sticky top-0 bg-slate-900">
                                            <input
                                                type="checkbox"
                                                className="accent-indigo-500"
                                                checked={filterTeams === null}
                                                onChange={handleSelectAllTeams}
                                            />
                                            <span className="text-xs text-slate-200 font-semibold">전체선택</span>
                                        </label>
                                        {/* FA */}
                                        <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800">
                                            <input
                                                type="checkbox"
                                                className="accent-indigo-500"
                                                checked={filterTeams === null || filterTeams.includes('fa')}
                                                onChange={() => handleToggleTeam('fa')}
                                            />
                                            <span className="text-xs text-slate-300">FA</span>
                                        </label>
                                        {/* 30개 팀 */}
                                        {TEAM_OPTIONS.filter(t => t.id !== '').map(t => (
                                            <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="accent-indigo-500"
                                                    checked={filterTeams === null || filterTeams.includes(t.id)}
                                                    onChange={() => handleToggleTeam(t.id)}
                                                />
                                                <span className="text-xs text-slate-300">{t.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* 포지션 필터 */}
                            <select
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                value={filterPos}
                                onChange={e => handleFilterPos(e.target.value)}
                            >
                                <option value="all">전체 포지션</option>
                                {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {/* 올타임 풀 필터 */}
                            <select
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                value={filterAlltime}
                                onChange={e => handleFilterAlltime(e.target.value)}
                            >
                                <option value="all">전체 풀</option>
                                <option value="alltime_only">올타임 포함만</option>
                                <option value="current_only">올타임 제외만</option>
                            </select>
                            {/* 아키타입 필터 */}
                            <select
                                className={`bg-slate-800 border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 ${filterArchetype !== 'all' ? 'border-indigo-500 text-indigo-300' : 'border-slate-700'}`}
                                value={filterArchetype}
                                onChange={e => handleFilterArchetype(e.target.value)}
                            >
                                <option value="all">전체 아키타입</option>
                                {Object.entries(labelConfig).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                ))}
                            </select>
                            {/* 태그 필터 */}
                            <select
                                className={`bg-slate-800 border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 ${filterTag !== 'all' ? 'border-indigo-500 text-indigo-300' : 'border-slate-700'}`}
                                value={filterTag}
                                onChange={e => handleFilterTag(e.target.value)}
                            >
                                <option value="all">전체 태그</option>
                                {(tagConfig.length > 0 ? tagConfig : Object.entries(tagLabelMap).map(([id, label]) => ({ id, label }))).map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                            {/* 기본/커스텀 표시 모드 토글 */}
                            <div className="flex items-center rounded overflow-hidden border border-slate-700 shrink-0">
                                <button
                                    onClick={() => setOvrDisplayMode('base')}
                                    className={`px-2 py-1 text-xs transition-colors ${ovrDisplayMode === 'base' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    기본
                                </button>
                                <button
                                    onClick={() => setOvrDisplayMode('custom')}
                                    className={`px-2 py-1 text-xs transition-colors ${ovrDisplayMode === 'custom' ? 'bg-indigo-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    커스텀
                                </button>
                            </div>
                            {/* OVR 범위 필터 */}
                            <div className="flex items-center gap-1">
                                <input
                                    type="number" min={0} max={99} placeholder="OVR 최소"
                                    value={filterOvrMin}
                                    onChange={e => handleFilterOvrMin(e.target.value)}
                                    className={`w-20 bg-slate-800 border rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 ${filterOvrMin !== '' ? 'border-indigo-500' : 'border-slate-700'}`}
                                />
                                <span className="text-slate-600 text-xs">~</span>
                                <input
                                    type="number" min={0} max={99} placeholder="OVR 최대"
                                    value={filterOvrMax}
                                    onChange={e => handleFilterOvrMax(e.target.value)}
                                    className={`w-20 bg-slate-800 border rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 ${filterOvrMax !== '' ? 'border-indigo-500' : 'border-slate-700'}`}
                                />
                            </div>
                            {/* 모듈 점수 필터 */}
                            <div className="flex items-center gap-1">
                                <select
                                    value={filterModule}
                                    onChange={e => { setFilterModule(e.target.value); if (!e.target.value) setFilterModuleMin(''); setTablePage(0); }}
                                    className={`bg-slate-800 border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 ${filterModule ? 'border-indigo-500 text-indigo-300' : 'border-slate-700'}`}
                                >
                                    <option value="">모듈 필터</option>
                                    {MODULE_ENTRIES.map(({ key, label }) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                {filterModule && (
                                    <>
                                        <span className="text-slate-600 text-xs">≥</span>
                                        <input
                                            type="number" min={0} max={99} placeholder="점수"
                                            value={filterModuleMin}
                                            onChange={e => { setFilterModuleMin(e.target.value); setTablePage(0); }}
                                            className={`w-16 bg-slate-800 border rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 ${filterModuleMin !== '' ? 'border-indigo-500' : 'border-slate-700'}`}
                                        />
                                    </>
                                )}
                            </div>
                            {/* draft_year 필터 */}
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500 shrink-0">draft_year</span>
                                <select
                                    value={filterDraftYearOp}
                                    onChange={e => { setFilterDraftYearOp(e.target.value); setTablePage(0); }}
                                    className={`bg-slate-800 border rounded px-1 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 ${filterDraftYearOp ? 'border-indigo-500' : 'border-slate-700'}`}
                                >
                                    <option value="">—</option>
                                    <option value="<=">≤</option>
                                    <option value="<">&lt;</option>
                                    <option value="=">=</option>
                                    <option value=">">&gt;</option>
                                    <option value=">=">&ge;</option>
                                </select>
                                <input
                                    type="number"
                                    placeholder="연도"
                                    value={filterDraftYearVal}
                                    onChange={e => { setFilterDraftYearVal(e.target.value); setTablePage(0); }}
                                    className={`w-20 bg-slate-800 border rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 ${filterDraftYearVal !== '' ? 'border-indigo-500' : 'border-slate-700'}`}
                                />
                            </div>
                            {/* 활성 필터 초기화 */}
                            {(filterTeams !== null || filterArchetype !== 'all' || filterTag !== 'all' || filterOvrMin !== '' || filterOvrMax !== '' || filterDraftYearOp !== '' || filterDraftYearVal !== '' || filterModule !== '') && (
                                <button
                                    onClick={() => { setFilterTeams(null); handleFilterArchetype('all'); handleFilterTag('all'); handleFilterOvrMin(''); handleFilterOvrMax(''); setFilterDraftYearOp(''); setFilterDraftYearVal(''); setFilterModule(''); setFilterModuleMin(''); setTablePage(0); }}
                                    className="text-[10px] text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-800 rounded px-1.5 py-0.5 transition-colors"
                                >
                                    초기화
                                </button>
                            )}
                            <span className="ml-auto flex items-center gap-1.5">
                                <button
                                    onClick={handleOpenOvrChart}
                                    className="text-[10px] text-slate-400 hover:text-indigo-300 border border-slate-700 hover:border-indigo-600 rounded px-1.5 py-0.5 transition-colors"
                                >
                                    OVR 분포
                                </button>
                                <span className="w-px h-3 bg-slate-700" />
                                <button
                                    onClick={() => handleExport('csv')}
                                    className="text-[10px] text-slate-400 hover:text-emerald-300 border border-slate-700 hover:border-emerald-600 rounded px-1.5 py-0.5 transition-colors"
                                    title="현재 필터 결과 전체를 CSV로 내보내기"
                                >
                                    CSV
                                </button>
                                <button
                                    onClick={() => handleExport('markdown')}
                                    className="text-[10px] text-slate-400 hover:text-sky-300 border border-slate-700 hover:border-sky-600 rounded px-1.5 py-0.5 transition-colors"
                                    title="현재 필터 결과 전체를 Markdown 표로 내보내기"
                                >
                                    MD
                                </button>
                                <button
                                    onClick={() => handleExport('html')}
                                    className="text-[10px] text-slate-400 hover:text-amber-300 border border-slate-700 hover:border-amber-600 rounded px-1.5 py-0.5 transition-colors"
                                    title="현재 필터 결과 전체를 독립 HTML로 열기"
                                >
                                    HTML
                                </button>
                                <span className="text-xs text-slate-500">{sortedResults.length}명</span>
                            </span>
                        </div>

                        {/* 선수 테이블 */}
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-500 border-b border-slate-800 bg-slate-950/50">
                                    <th className="text-center px-2 py-1 font-normal whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            올타임
                                            <input
                                                ref={bulkAlltimeRef}
                                                type="checkbox"
                                                checked={alltimeAllChecked}
                                                disabled={bulkSaving === 'alltime'}
                                                onChange={() => handleBulkAlltimeSet(!alltimeAllChecked)}
                                                onClick={e => e.stopPropagation()}
                                                className="w-3 h-3 cursor-pointer accent-indigo-500 disabled:opacity-40"
                                                title={`필터된 ${sortedResults.length}명 전체 선택/해제`}
                                            />
                                        </span>
                                    </th>
                                    <th className="text-center px-2 py-1 font-normal whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            멀티
                                            <input
                                                ref={bulkMultiRef}
                                                type="checkbox"
                                                checked={multiAllChecked}
                                                disabled={bulkSaving === 'multi'}
                                                onChange={() => handleBulkMultiSet(!multiAllChecked)}
                                                onClick={e => e.stopPropagation()}
                                                className="w-3 h-3 cursor-pointer accent-emerald-500 disabled:opacity-40"
                                                title={`필터된 ${sortedResults.length}명 전체 선택/해제`}
                                            />
                                        </span>
                                    </th>
                                    <th className="text-left px-3 py-1 font-normal cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => handleSort('name')}>
                                        이름{sortBy === 'name' && <span className="ml-0.5 text-indigo-400">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                    <th className="text-left px-2 py-1 font-normal">1차 아키타입</th>
                                    <th className="text-left px-2 py-1 font-normal">2차 아키타입</th>
                                    <th className="text-left px-2 py-1 font-normal hidden xl:table-cell max-w-[160px]">태그</th>
                                    <th className="text-center px-2 py-1 font-normal w-10 whitespace-nowrap">포지션</th>
                                    <th className="text-left px-2 py-1 font-normal w-14">팀</th>
                                    <th className="text-center px-2 py-1 font-normal w-8 whitespace-nowrap">나이</th>
                                    <th className="text-center px-2 py-1 font-normal w-10 cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => handleSort('ovr')}>
                                        OVR{sortBy === 'ovr' && <span className="ml-0.5 text-indigo-400">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="인사이드">INS</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="아웃사이드">OUT</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="플레이메이킹">PLM</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="수비">DEF</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="리바운드">REB</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-white" title="운동 능력">ATH</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="Restricted Area">RA</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="In The Paint (Non-RA)">ITP</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="Mid-Range">Mid</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="Corner 3">CNR</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="Wing 3 (45°)">P45</th>
                                    <th className="text-center px-1.5 py-1 font-normal w-8 whitespace-nowrap text-slate-600" title="Above The Break (Top)">ATB</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={22} className="text-center py-6 text-slate-600">검색 결과 없음</td>
                                    </tr>
                                ) : tableRows.map(r => {
                                    const isSelected = selected?.id === r.id;
                                    const isDraft = r.draft_year === DRAFT_CLASS_YEAR;
                                    const draftYear = r.draft_year;
                                    const teamSlugVal = (r.base_team_id ?? '').trim().toLowerCase();
                                    const isFaRow = !isDraft && !teamSlugVal;
                                    const baseTeamLabel = isDraft
                                        ? `신인 '${draftYear}`
                                        : isFaRow
                                            ? 'FA'
                                            : (TEAM_OPTIONS.find(t => t.id === teamSlugVal)?.label.split(' · ')[0] ?? teamSlugVal.toUpperCase());
                                    const archInfo = playerArchetypeMap[r.id];
                                    const coInfo: CoPlayerDataEntry | undefined =
                                        ovrDisplayMode === 'custom' ? playerCoDataMap[r.id] : undefined;
                                    const displayInfo: PlayerDataEntry | undefined = coInfo ?? archInfo;
                                    // CO-overridden display values
                                    const displayPosition = coInfo?.position ?? r.position;
                                    const coTeamSlug = coInfo?.team;
                                    const teamLabel = coTeamSlug !== undefined
                                        ? (isDraft ? `신인 '${draftYear}`
                                            : !coTeamSlug ? 'FA'
                                            : (TEAM_OPTIONS.find(t => t.id === coTeamSlug)?.label.split(' · ')[0] ?? coTeamSlug.toUpperCase()))
                                        : baseTeamLabel;
                                    const displayAge = coInfo?.age != null ? coInfo.age : (r.base_attributes?.age ?? '—');
                                    return (
                                        <tr
                                            key={r.id}
                                            onClick={() => handleSelect(r)}
                                            className={`border-b border-slate-800 cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-900/40 hover:bg-indigo-900/50'
                                                    : 'hover:bg-slate-800/60'
                                            }`}
                                        >
                                            {/* 올타임 체크박스 */}
                                            <td className="px-2 py-1 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={r.include_alltime ?? false}
                                                    disabled={togglingRows[r.id] === 'alltime' || bulkSaving === 'alltime'}
                                                    onChange={e => handleRowAlltimeToggle(r.id, e.target.checked)}
                                                    className="w-3.5 h-3.5 cursor-pointer accent-indigo-500 disabled:opacity-40"
                                                />
                                            </td>
                                            {/* 멀티 체크박스 */}
                                            <td className="px-2 py-1 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={r.in_multi_pool ?? true}
                                                    disabled={togglingRows[r.id] === 'multi' || bulkSaving === 'multi'}
                                                    onChange={e => handleRowMultiToggle(r.id, e.target.checked)}
                                                    className="w-3.5 h-3.5 cursor-pointer accent-emerald-500 disabled:opacity-40"
                                                />
                                            </td>
                                            <td className="px-3 py-1 text-white font-medium">{r.name}</td>
                                            {/* 1차 아키타입 */}
                                            <td className={`px-2 py-1 ${coInfo ? 'text-indigo-300' : 'text-white'}`}>
                                                {displayInfo
                                                    ? labelConfig[displayInfo.archetype] ?? displayInfo.archetype
                                                    : '—'
                                                }
                                            </td>
                                            {/* 2차 아키타입 */}
                                            <td className={`px-2 py-1 ${coInfo ? 'text-indigo-300' : 'text-white'}`}>
                                                {displayInfo?.secondary
                                                    ? labelConfig[displayInfo.secondary] ?? displayInfo.secondary
                                                    : '—'
                                                }
                                            </td>
                                            {/* 태그 */}
                                            <td className={`px-2 py-1 text-xs hidden xl:table-cell max-w-[160px] ${coInfo ? 'text-indigo-300' : 'text-white'}`}>
                                                <span className="block truncate" title={displayInfo?.tags.map(t => tagLabelMap[t] ?? t).join(', ')}>
                                                    {displayInfo?.tags.length
                                                        ? displayInfo.tags.map(t => tagLabelMap[t] ?? t).join(', ')
                                                        : '—'
                                                    }
                                                </span>
                                            </td>
                                            <td className={`px-2 py-1 text-center ${coInfo?.position ? 'text-indigo-300' : 'text-white'}`}>
                                                {displayPosition}
                                            </td>
                                            <td className={`px-2 py-1 whitespace-nowrap ${coInfo?.team !== undefined ? 'text-indigo-300' : 'text-white'}`}>
                                                {teamLabel}
                                            </td>
                                            <td className={`px-2 py-1 text-center ${coInfo?.age != null ? 'text-indigo-300' : 'text-white'}`}>
                                                {displayAge}
                                            </td>
                                            {/* OVR */}
                                            <td className="px-2 py-1 text-center">
                                                {(() => {
                                                    const baseOvr = archInfo?.displayOvr ?? r.base_attributes?.ovr;
                                                    const coOvr = coInfo?.displayOvr;
                                                    if (coOvr !== undefined) {
                                                        const diff = coOvr - (baseOvr ?? coOvr);
                                                        return (
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <span className="text-indigo-300 font-bold">{coOvr}</span>
                                                                {diff !== 0 && (
                                                                    <span className={`text-[9px] ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                                        {diff > 0 ? `+${diff}` : diff}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        );
                                                    }
                                                    return <span className="text-white">{baseOvr ?? '—'}</span>;
                                                })()}
                                            </td>
                                            {/* 능력치 그룹 평균 */}
                                            {(['ins','out','plm','def','reb','ath'] as const).map(grp => {
                                                const baseVal = archInfo?.groups?.[grp];
                                                const coVal = coInfo?.groups?.[grp];
                                                const val = coVal ?? baseVal;
                                                return (
                                                    <td key={grp} className="px-1.5 py-1 text-center font-mono">
                                                        {val != null
                                                            ? <span className={coVal !== undefined ? 'text-indigo-300' : attrColor(val)}>{val}</span>
                                                            : <span className="text-slate-700">—</span>
                                                        }
                                                    </td>
                                                );
                                            })}
                                            {/* Tendencies zones */}
                                            {(['ra','itp','mid','cnr','p45','atb'] as const).map(zone => {
                                                const val = r.tendencies?.zones?.[zone];
                                                return (
                                                    <td key={zone} className="px-1.5 py-1 text-center font-mono">
                                                        {val != null
                                                            ? <span className="text-slate-300">{val}</span>
                                                            : <span className="text-slate-700">—</span>
                                                        }
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* 페이지네이션 */}
                        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800">
                            <button
                                disabled={tablePage === 0}
                                onClick={() => setTablePage(p => p - 1)}
                                className="px-3 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 border border-slate-700 rounded hover:border-slate-500 transition-colors"
                            >
                                ← 이전
                            </button>
                            <div className="flex items-center gap-1">
                                {tablePageCount > 1 && Array.from({ length: tablePageCount }, (_, i) => {
                                    if (tablePageCount <= 7 || Math.abs(i - tablePage) <= 2 || i === 0 || i === tablePageCount - 1) {
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => setTablePage(i)}
                                                className={`w-7 h-7 text-xs rounded transition-colors ${
                                                    i === tablePage
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                                }`}
                                            >
                                                {i + 1}
                                            </button>
                                        );
                                    }
                                    if (Math.abs(i - tablePage) === 3) {
                                        return <span key={i} className="text-slate-600 text-xs px-0.5">…</span>;
                                    }
                                    return null;
                                })}
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={tablePageSize}
                                    onChange={e => { setTablePageSize(Number(e.target.value)); setTablePage(0); }}
                                    className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-slate-500"
                                >
                                    {[10, 20, 30, 50, 100].map(n => (
                                        <option key={n} value={n}>{n}행</option>
                                    ))}
                                </select>
                                <button
                                    disabled={tablePage === tablePageCount - 1}
                                    onClick={() => setTablePage(p => p + 1)}
                                    className="px-3 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 border border-slate-700 rounded hover:border-slate-500 transition-colors"
                                >
                                    다음 →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!selected && results.length === 0 && <p className="text-slate-500 text-sm">선수를 검색해서 선택하세요.</p>}

            {selected && (
                <>
                    {/* 선수 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <span className="text-xl font-bold text-white">{selected.name}</span>
                            <span className="ml-3 text-slate-400 text-sm">
                                {draft.position ?? selected.position} · {draft.age ?? '—'}세 · {draft.team ?? '—'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {saveMsg && (
                                <span className={`text-sm ${saveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {saveMsg}
                                </span>
                            )}
                            {Object.keys(draft.custom_overrides ?? {}).length > 0 && (
                                <button
                                    onClick={handleClearAllCo}
                                    disabled={saving || deleting}
                                    className="px-3 py-2 bg-transparent hover:bg-red-950 disabled:opacity-50 text-red-500 hover:text-red-400 text-sm border border-red-900 rounded-lg transition-colors"
                                    title="custom_overrides 전체 삭제 후 즉시 저장"
                                >
                                    CO 전체 삭제
                                </button>
                            )}
                            <button
                                onClick={handleDeletePlayer}
                                disabled={saving || deleting}
                                className="px-3 py-2 bg-transparent hover:bg-red-950 disabled:opacity-50 text-red-400 hover:text-red-300 text-sm border border-red-800 rounded-lg transition-colors"
                                title="이 선수를 DB에서 영구 삭제"
                            >
                                {deleting ? '삭제 중...' : '선수 삭제'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || deleting}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                                {saving ? '저장 중...' : '적용'}
                            </button>
                        </div>
                    </div>

                    {/* ── 실시간 OVR / 아키타입 미리보기 ── */}
                    {livePreview?.base && (() => {
                        const bm = livePreview.base.modules as Record<string, number>;
                        const cm = livePreview.co?.modules as Record<string, number> | undefined;
                        const sorted = [...MODULE_ENTRIES]
                            .map(({ key, label }) => ({ key, label, base: bm[key] ?? 0, co: cm ? (cm[key] ?? 0) : null }))
                            .sort((a, b) => b.base - a.base);

                        const baseArch1 = labelConfig[livePreview.base.primaryArchetype.archetype] ?? livePreview.base.primaryArchetype.archetype;
                        const baseArch2 = labelConfig[livePreview.base.secondaryArchetype.archetype] ?? livePreview.base.secondaryArchetype.archetype;
                        const coArch1   = livePreview.co ? (labelConfig[livePreview.co.primaryArchetype.archetype] ?? livePreview.co.primaryArchetype.archetype) : null;
                        const coArch2   = livePreview.co ? (labelConfig[livePreview.co.secondaryArchetype.archetype] ?? livePreview.co.secondaryArchetype.archetype) : null;
                        const activeTags = (livePreview.co ? livePreview.co.tags : livePreview.base.tags).map((t: string) => tagLabelMap[t] ?? t);

                        return (
                            <div className="mb-4 bg-slate-900 rounded-xl border border-slate-700/60 overflow-hidden">
                                {/* OVR 헤더 */}
                                <div className="flex items-stretch border-b border-slate-700/60">
                                    {/* Base OVR */}
                                    <div className="flex flex-col items-center justify-center px-4 py-3 min-w-[68px] border-r border-slate-700/60">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">OVR</span>
                                        <span className="text-3xl font-black text-white leading-none">{livePreview.base.displayOvr}</span>
                                        <span className="text-[9px] text-slate-600 mt-0.5">raw {livePreview.base.rawOvr.toFixed(1)}</span>
                                    </div>
                                    {/* CO OVR */}
                                    {livePreview.co && (
                                        <div className="flex flex-col items-center justify-center px-4 py-3 min-w-[68px] border-r border-slate-700/60 bg-amber-500/5">
                                            <span className="text-[9px] text-amber-500 uppercase tracking-widest mb-0.5">CO</span>
                                            <span className="text-3xl font-black text-amber-300 leading-none">{livePreview.co.displayOvr}</span>
                                            <span className="text-[9px] text-slate-600 mt-0.5">raw {livePreview.co.rawOvr.toFixed(1)}</span>
                                        </div>
                                    )}
                                    {/* 아키타입 & 태그 */}
                                    <div className="flex-1 px-3 py-2.5 min-w-0">
                                        <div className="text-[11px] font-semibold leading-snug">
                                            <span className={coArch1 && coArch1 !== baseArch1 ? 'text-amber-300' : 'text-indigo-300'}>{livePreview.co ? (coArch1 ?? baseArch1) : baseArch1}</span>
                                            <span className="text-slate-600"> / </span>
                                            <span className={coArch2 && coArch2 !== baseArch2 ? 'text-amber-300' : 'text-slate-400'}>{livePreview.co ? (coArch2 ?? baseArch2) : baseArch2}</span>
                                        </div>
                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                            {activeTags.length > 0 ? activeTags.map((t: string) => (
                                                <span key={t} className="text-[9px] border border-indigo-500/40 text-indigo-400 px-1.5 py-0.5 rounded-sm bg-indigo-500/5">{t}</span>
                                            )) : (
                                                <span className="text-[9px] text-slate-700">태그 없음</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 모듈 스코어 바 */}
                                {livePreview.co ? (
                                    /* CO 있음 → 좌(Base) / 우(CO) 분할 패널 */
                                    <div className="flex divide-x divide-slate-700/60">
                                        {/* Base 패널 */}
                                        <div className="flex-1 px-3 pt-2.5 pb-3 min-w-0">
                                            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Base</div>
                                            <div className="space-y-1.5">
                                                {sorted.map(({ key, label, base }) => {
                                                    const { grade, bar, text } = getModuleGradeInfo(base);
                                                    return (
                                                        <div key={key} className="flex items-center gap-2">
                                                            <span className="text-[10px] text-slate-400 w-[72px] shrink-0 truncate">{label}</span>
                                                            <div className="flex-1 h-2 bg-slate-700/70 rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(base, 100)}%` }} />
                                                            </div>
                                                            <span className="text-[10px] text-slate-300 font-mono w-8 text-right shrink-0">{base.toFixed(1)}</span>
                                                            <span className={`text-[9px] font-bold w-5 text-right shrink-0 ${text}`}>{grade}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {/* CO 패널 */}
                                        <div className="flex-1 px-3 pt-2.5 pb-3 min-w-0 bg-amber-500/[0.03]">
                                            <div className="text-[9px] text-amber-500 uppercase tracking-widest mb-2">Custom Overrides</div>
                                            <div className="space-y-1.5">
                                                {sorted.map(({ key, label, base, co }) => {
                                                    const coVal = co ?? base;
                                                    const diff = coVal - base;
                                                    const coInfo = getModuleGradeInfo(coVal);
                                                    return (
                                                        <div key={key} className="flex items-center gap-2">
                                                            <span className="text-[10px] text-slate-400 w-[72px] shrink-0 truncate">{label}</span>
                                                            <div className="flex-1 h-2 bg-slate-700/70 rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${coInfo.bar}`} style={{ width: `${Math.min(coVal, 100)}%` }} />
                                                            </div>
                                                            <span className={`text-[10px] font-mono w-8 text-right shrink-0 ${diff !== 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{coVal.toFixed(1)}</span>
                                                            <span className={`text-[9px] font-bold w-5 text-right shrink-0 ${coInfo.text}`}>{coInfo.grade}</span>
                                                            <span className={`text-[9px] font-mono w-7 text-right shrink-0 ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-transparent'}`}>
                                                                {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : '·'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* CO 없음 → 기존 단일 패널 */
                                    <div className="px-3 pt-2.5 pb-3">
                                        <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Module Scores</div>
                                        <div className="space-y-1.5">
                                            {sorted.map(({ key, label, base }) => {
                                                const { grade, bar, text } = getModuleGradeInfo(base);
                                                return (
                                                    <div key={key} className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-400 w-[88px] shrink-0 truncate">{label}</span>
                                                        <div className="flex-1 h-2 bg-slate-700/70 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(base, 100)}%` }} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-300 font-mono w-8 text-right shrink-0">{base.toFixed(1)}</span>
                                                        <span className={`text-[9px] font-bold w-5 text-right shrink-0 ${text}`}>{grade}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── 인적 정보 — base / CO ── */}
                    <Section label="인적 정보">
                        {(() => {
                            const baseCls = 'w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors';
                            const coCls   = (hasVal: boolean) => `w-full rounded px-2 py-0.5 text-sm ring-1 ring-inset focus:outline-none placeholder-gray-700 transition-colors ${hasVal ? 'bg-amber-950/20 text-amber-300 ring-amber-500/40 focus:ring-amber-400' : 'bg-white/[0.03] text-gray-500 ring-white/10 focus:ring-amber-500/50'}`;
                            return (
                                <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                                    <table className="min-w-full divide-y divide-white/5">
                                        <thead className="bg-white/5">
                                            <tr>
                                                <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-400">필드</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-400">base</th>
                                                <th scope="col" className="py-3 pl-3 pr-4 text-left text-xs font-semibold text-amber-500/70">CO</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {/* 이름 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">이름</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">name</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5" colSpan={2}>
                                                    <input type="text" className={baseCls}
                                                        value={typeof draft.name === 'string' ? draft.name : (selected?.name ?? '')}
                                                        onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} />
                                                </td>
                                            </tr>
                                            {/* 숫자 필드 */}
                                            {([
                                                { key: 'age', label: '나이' }, { key: 'num', label: '등번호' },
                                                { key: 'height', label: '키 (cm)' }, { key: 'weight', label: '몸무게 (kg)' },
                                            ] as const).map(({ key, label }) => (
                                                <tr key={key} className="hover:bg-white/5 group transition-colors">
                                                    <td className="py-3 pl-4 pr-3">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm text-gray-300">{label}</span>
                                                            <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{key}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <input type="number" className={`${baseCls} text-center`}
                                                            value={draft[key] ?? ''} onChange={e => setField(key, e.target.value)} />
                                                    </td>
                                                    <td className="py-2.5 pl-3 pr-4">
                                                        <input type="number" placeholder="—" className={`${coCls(co[key] !== undefined)} text-center`}
                                                            value={co[key] ?? ''} onChange={e => setCoField(key, e.target.value)} />
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* 포지션 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">포지션</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">position</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <select className={baseCls} value={draft.position ?? ''} onChange={e => setField('position', e.target.value)}>
                                                        <option value="">— 선택 —</option>
                                                        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                </td>
                                                <td className="py-2.5 pl-3 pr-4">
                                                    <select className={coCls(!!co.position)} value={co.position ?? ''} onChange={e => setCoField('position', e.target.value)}>
                                                        <option value="">— (base)</option>
                                                        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                            {/* 팀 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">팀</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">team</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <select className={baseCls} value={draft.team ?? ''} onChange={e => setField('team', e.target.value)}>
                                                        {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                    </select>
                                                </td>
                                                <td className="py-2.5 pl-3 pr-4">
                                                    <select className={coCls(!!co.team)} value={co.team ?? ''} onChange={e => setCoField('team', e.target.value)}>
                                                        <option value="">— (base)</option>
                                                        {TEAM_OPTIONS.filter(t => t.id !== '').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                            {/* 인기도 서브헤더 */}
                                            <tr className="bg-white/[0.03]">
                                                <td colSpan={3} className="py-2 pl-4 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">인기도 (0~100)</td>
                                            </tr>
                                            {/* 연고지 인기 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">연고지 인기</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">pop.local</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <select className={baseCls} value={draft.popularity?.local ?? ''}
                                                        onChange={e => { const v = Number(e.target.value); setDraft(prev => ({ ...prev, popularity: { ...(prev.popularity ?? {}), local: v } })); }}>
                                                        <option value="">— 미설정 —</option>
                                                        {POPULARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                    {draft.popularity?.local !== undefined && <div className="text-[9px] text-gray-500 mt-0.5">{getLocalPopularityLabel(draft.popularity.local)}</div>}
                                                </td>
                                                <td className="py-2.5 pl-3 pr-4">
                                                    <select className={coCls(co.popularity?.local !== undefined)} value={co.popularity?.local ?? ''}
                                                        onChange={e => { const raw = e.target.value; setDraft(prev => { const c: Record<string, any> = { ...(prev.custom_overrides ?? {}) }; if (raw === '') { const pop = { ...(c.popularity ?? {}) }; delete pop.local; if (Object.keys(pop).length === 0) delete c.popularity; else c.popularity = pop; } else { c.popularity = { ...(c.popularity ?? {}), local: Number(raw) }; } return { ...prev, custom_overrides: c }; }); }}>
                                                        <option value="">— (base)</option>
                                                        {POPULARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                    {co.popularity?.local !== undefined && <div className="text-[9px] text-amber-500/80 mt-0.5">{getLocalPopularityLabel(co.popularity.local)}</div>}
                                                </td>
                                            </tr>
                                            {/* 전국 인기 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">전국 인기</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">pop.national</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <select className={baseCls} value={draft.popularity?.national ?? ''}
                                                        onChange={e => { const v = Number(e.target.value); setDraft(prev => ({ ...prev, popularity: { ...(prev.popularity ?? {}), national: v } })); }}>
                                                        <option value="">— 미설정 —</option>
                                                        {NATIONAL_POPULARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                    {draft.popularity?.national !== undefined && <div className="text-[9px] text-gray-500 mt-0.5">{getNationalPopularityLabel(draft.popularity.national)}</div>}
                                                </td>
                                                <td className="py-2.5 pl-3 pr-4">
                                                    <select className={coCls(co.popularity?.national !== undefined)} value={co.popularity?.national ?? ''}
                                                        onChange={e => { const raw = e.target.value; setDraft(prev => { const c: Record<string, any> = { ...(prev.custom_overrides ?? {}) }; if (raw === '') { const pop = { ...(c.popularity ?? {}) }; delete pop.national; if (Object.keys(pop).length === 0) delete c.popularity; else c.popularity = pop; } else { c.popularity = { ...(c.popularity ?? {}), national: Number(raw) }; } return { ...prev, custom_overrides: c }; }); }}>
                                                        <option value="">— (base)</option>
                                                        {NATIONAL_POPULARITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                    {co.popularity?.national !== undefined && <div className="text-[9px] text-amber-500/80 mt-0.5">{getNationalPopularityLabel(co.popularity.national)}</div>}
                                                </td>
                                            </tr>
                                            {/* 드래프트 서브헤더 */}
                                            <tr className="bg-white/[0.03]">
                                                <td colSpan={3} className="py-2 pl-4 pr-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">드래프트</td>
                                            </tr>
                                            {/* 드래프트 연도 */}
                                            <tr className="hover:bg-white/5 group transition-colors">
                                                <td className="py-3 pl-4 pr-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm text-gray-300">드래프트 연도</span>
                                                        <span className="text-[9px] text-gray-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">draft_year</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5" colSpan={2}>
                                                    <div className="flex items-center gap-3">
                                                        <input type="number" placeholder="없음 (현역/올타임)"
                                                            className="w-36 bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 placeholder-gray-600 transition-colors"
                                                            value={draftYearVal} onChange={e => setDraftYearVal(e.target.value)} />
                                                        {draftYearVal && (
                                                            <span className="text-sm text-gray-400">
                                                                {Number(draftYearVal) === 2026 ? '→ 신인 드래프트 클래스' : `→ ${draftYearVal}년 입단`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* 토글 행 */}
                                            <tr className="hover:bg-white/5 transition-colors">
                                                <td colSpan={3} className="py-3 pl-4 pr-4">
                                                    <div className="flex items-center gap-6">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm text-gray-300">올타임 드래프트 풀</span>
                                                            <button disabled={alltimeToggling} onClick={() => handleIncludeAlltimeToggle(!includeAlltime)}
                                                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${includeAlltime ? 'bg-indigo-600' : 'bg-white/10'}`}>
                                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${includeAlltime ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                            </button>
                                                            <span className={`text-sm ${includeAlltime ? 'text-indigo-400' : 'text-gray-600'}`}>
                                                                {alltimeToggling ? '저장 중...' : includeAlltime ? '포함' : '제외'}
                                                            </span>
                                                        </div>
                                                        <div className="w-px h-4 bg-white/10" />
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm text-gray-300">멀티 드래프트 풀</span>
                                                            <button disabled={multiPoolToggling} onClick={() => handleInMultiPoolToggle(!inMultiPool)}
                                                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${inMultiPool ? 'bg-emerald-600' : 'bg-white/10'}`}>
                                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${inMultiPool ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                            </button>
                                                            <span className={`text-sm ${inMultiPool ? 'text-emerald-400' : 'text-gray-600'}`}>
                                                                {multiPoolToggling ? '저장 중...' : inMultiPool ? '포함' : '제외'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </Section>

                    {/* ── 존 선호도 & Tendencies ── */}
                    <Section label="존 선호도 · Tendencies">
                        {(() => {
                            const LATERAL_OPTIONS = [
                                { value: 0, label: '0 — Strong Left' },
                                { value: 1, label: '1 — Left' },
                                { value: 2, label: '2 — Right' },
                                { value: 3, label: '3 — Strong Right' },
                            ];
                            const ZONES: { key: string; label: string; desc: string }[] = [
                                { key: 'ra',  label: 'RA',  desc: '페인트 근거리' },
                                { key: 'itp', label: 'ITP', desc: '페인트 중거리' },
                                { key: 'mid', label: 'Mid', desc: '미드레인지' },
                                { key: 'cnr', label: 'Cnr', desc: '코너 3점' },
                                { key: 'p45', label: 'p45', desc: '윙 3점' },
                                { key: 'atb', label: 'ATB', desc: '탑 3점' },
                            ];

                            const zones = tendencies?.zones ?? {};
                            const total = ZONES.reduce((s, z) => s + (Number(zones[z.key]) || 0), 0) || 1;

                            const setZone = (key: string, val: string) => {
                                const num = Number(val);
                                setTendencies(prev => ({
                                    ...(prev ?? { lateral_bias: 2, zones: {} }),
                                    zones: { ...(prev?.zones ?? {}), [key]: isNaN(num) ? 0 : Math.max(0, num) },
                                }));
                            };
                            const clearTendencies = () => setTendencies(null);

                            return (
                                <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                                    <table className="min-w-full divide-y divide-white/5">
                                        <thead className="bg-white/5">
                                            <tr>
                                                <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-400">존</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-400">설명</th>
                                                <th scope="col" className="w-16 px-3 py-3 text-center text-xs font-semibold text-gray-400">가중치</th>
                                                <th scope="col" className="py-3 pl-3 pr-4 text-right text-xs font-semibold text-gray-400">비율</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {ZONES.map(({ key, label, desc }) => {
                                                const val = Number(zones[key]) || 0;
                                                const pct = (val / total) * 100;
                                                return (
                                                    <tr key={key} className="hover:bg-white/5 transition-colors">
                                                        <td className="py-3 pl-4 pr-3">
                                                            <span className="text-sm font-mono font-bold text-indigo-400">{label}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-sm text-gray-400">{desc}</td>
                                                        <td className="w-16 px-3 py-2.5">
                                                            <input type="number" min={0}
                                                                className="w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white text-center ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                                                value={val} onChange={e => setZone(key, e.target.value)} />
                                                        </td>
                                                        <td className="py-3 pl-3 pr-4">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                                    <div className="h-full rounded-full bg-indigo-500/70 transition-all" style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="text-sm font-mono text-gray-400 w-12 text-right">{pct.toFixed(1)}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Lateral Bias */}
                                            <tr className="bg-white/[0.03] hover:bg-white/5 transition-colors">
                                                <td colSpan={2} className="py-3 pl-4 pr-3 text-sm text-gray-400">Lateral Bias</td>
                                                <td colSpan={2} className="py-2.5 pl-3 pr-4">
                                                    <div className="flex items-center gap-3">
                                                        <select
                                                            className="flex-1 bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                                            value={tendencies?.lateral_bias ?? 2}
                                                            onChange={e => setTendencies(prev => ({ ...(prev ?? { zones: {} }), lateral_bias: Number(e.target.value) }))}
                                                        >
                                                            {LATERAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                        {tendencies && (
                                                            <button onClick={clearTendencies} className="text-sm text-gray-600 hover:text-red-400 transition-colors shrink-0">초기화</button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </Section>

                    {/* ── 2컬럼 그리드 ── */}
                    <div className="grid grid-cols-2 gap-x-8 items-start">

                        {/* Row 1: Base 계약 | CO 계약 */}
                        <Section label="Base 계약">
                            <ContractForm
                                contract={draft.contract ?? {}}
                                salary={draft.salary}
                                onSetContractYear={setContractYear}
                                onAddYear={addContractYear}
                                onRemoveYear={removeContractYear}
                                onSetContractField={setContractField}
                                onSetSalary={v => setField('salary', v)}
                                startYear={2025 - ((draft.contract?.currentYear) ?? 0)}
                            />
                        </Section>
                        <Section label="CO 계약">
                            {draft.custom_overrides?.contract !== undefined && (
                                <div className="flex justify-end mb-2">
                                    <button
                                        onClick={clearCoContract}
                                        className="text-xs text-red-500 hover:text-red-400 border border-red-900 rounded px-2 py-0.5"
                                    >
                                        CO 계약 삭제
                                    </button>
                                </div>
                            )}
                            <ContractForm
                                contract={draft.custom_overrides?.contract ?? {}}
                                salary={draft.custom_overrides?.salary}
                                onSetContractYear={setCoContractYear}
                                onAddYear={addCoContractYear}
                                onRemoveYear={removeCoContractYear}
                                onSetContractField={setCoContractField}
                                onSetSalary={v => setCoField('salary', v)}
                                startYear={2025 - ((draft.custom_overrides?.contract?.currentYear) ?? (draft.contract?.currentYear) ?? 0)}
                            />
                        </Section>

                        {/* Row 3: 인사이드 | 아웃사이드 */}
                        {renderStatSection(STAT_SECTIONS[0])}
                        {renderStatSection(STAT_SECTIONS[1])}

                        {/* Row 3: 패스&플레이메이킹 | 수비 */}
                        {renderStatSection(STAT_SECTIONS[2])}
                        {renderStatSection(STAT_SECTIONS[3])}

                        {/* Row 4: 리바운드 + 특수&무형 | 운동 능력 */}
                        <div>
                            {renderStatSection(STAT_SECTIONS[4])}
                            {renderStatSection(STAT_SECTIONS[6])}
                        </div>
                        {renderStatSection(STAT_SECTIONS[5])}

                    </div>

                    {/* ── 부상 정보 ── */}
                    <Section label="부상 정보">
                        <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                            <table className="min-w-full divide-y divide-white/5">
                                <tbody className="divide-y divide-white/5">
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="py-3 pl-4 pr-3 text-sm text-gray-400 w-24 whitespace-nowrap">상태</td>
                                        <td className="px-3 py-3">
                                            <div className="flex gap-2">
                                                {(['Healthy', 'Day-to-Day', 'Injured'] as const).map(status => {
                                                    const active = (draft.health ?? 'Healthy') === status;
                                                    const activeClass = status === 'Healthy'
                                                        ? 'ring-1 ring-emerald-500/60 text-emerald-300 bg-emerald-950/40'
                                                        : status === 'Day-to-Day'
                                                            ? 'ring-1 ring-amber-500/60 text-amber-300 bg-amber-950/40'
                                                            : 'ring-1 ring-red-500/60 text-red-300 bg-red-950/40';
                                                    return (
                                                        <button key={status} onClick={() => handleHealthChange(status)}
                                                            className={`px-3 py-1 text-sm rounded-lg transition-colors ${active ? activeClass : 'text-gray-600 hover:text-gray-300 ring-1 ring-white/5 hover:ring-white/10'}`}>
                                                            {status === 'Healthy' ? '정상' : status === 'Day-to-Day' ? 'Day-to-Day' : '부상 중'}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                    {(draft.health ?? 'Healthy') !== 'Healthy' && (
                                        <>
                                            <tr className="hover:bg-white/5 transition-colors">
                                                <td className="py-3 pl-4 pr-3 text-sm text-gray-400 whitespace-nowrap">부상 종류</td>
                                                <td className="px-3 py-2.5">
                                                    <input type="text" placeholder="예: ACL Tear, Ankle Sprain..."
                                                        value={draft.injuryType ?? ''} onChange={e => setField('injuryType', e.target.value)}
                                                        className="w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white placeholder-gray-700 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-amber-500/60 transition-colors" />
                                                </td>
                                            </tr>
                                            <tr className="hover:bg-white/5 transition-colors">
                                                <td className="py-3 pl-4 pr-3 text-sm text-gray-400 whitespace-nowrap">복귀 예정일</td>
                                                <td className="px-3 py-2.5">
                                                    <input type="date" value={draft.returnDate ?? ''} onChange={e => setField('returnDate', e.target.value)}
                                                        className="w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-amber-500/60 transition-colors" />
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    {/* 저장 버튼 (하단) */}
                    <div className="mt-8 flex justify-end gap-3">
                        {saveMsg && (
                            <span className={`text-sm self-center ${saveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                {saveMsg}
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                            {saving ? '저장 중...' : '적용'}
                        </button>
                    </div>

                    {/* 편집 이력 */}
                    <div className="mt-10 border-t border-slate-800 pt-6">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">편집 이력</h3>
                        {editLog.length === 0 ? (
                            <p className="text-slate-600 text-xs">저장된 편집 이력이 없습니다.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {editLog.map(entry => (
                                    <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                        <div className="text-xs text-slate-500 mb-2">
                                            {new Date(entry.edited_at).toLocaleString('ko-KR')}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {Object.entries(entry.changes).map(([key, { before, after }]) => (
                                                <span key={key} className="text-xs font-mono">
                                                    <span className="text-slate-400">{key}</span>
                                                    {' '}
                                                    <span className="text-red-400">{JSON.stringify(before) ?? '없음'}</span>
                                                    <span className="text-slate-600"> → </span>
                                                    <span className="text-emerald-400">{JSON.stringify(after) ?? '없음'}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── 새 선수 추가 모달 ─────────────────────────────────────────── */}
            {addModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <h2 className="text-base font-bold text-white mb-4">새 선수 추가</h2>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">이름 *</label>
                                <input
                                    autoFocus
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                    placeholder="선수 이름"
                                    value={addModal.name}
                                    onChange={e => setAddModal(prev => prev && ({ ...prev, name: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">포지션 *</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    value={addModal.position}
                                    onChange={e => setAddModal(prev => prev && ({ ...prev, position: e.target.value }))}
                                >
                                    {['PG','SG','SF','PF','C'].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">팀 (선택)</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    value={addModal.team}
                                    onChange={e => setAddModal(prev => prev && ({ ...prev, team: e.target.value }))}
                                >
                                    {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </div>
                            {addError && (
                                <p className="text-red-400 text-xs">{addError}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-5 justify-end">
                            <button
                                onClick={() => { setAddModal(null); setAddError(null); }}
                                disabled={addSaving}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleAddPlayer}
                                disabled={addSaving || !addModal.name.trim()}
                                className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
                            >
                                {addSaving ? '추가 중...' : '추가'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

function computeDiff(
    before: Record<string, any>,
    after: Record<string, any>
): Record<string, { before: any; after: any }> {
    const changes: Record<string, { before: any; after: any }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
        if (key === 'custom_overrides') continue;
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
            changes[key] = { before: before[key], after: after[key] };
        }
    }
    const bco: Record<string, any> = before.custom_overrides ?? {};
    const aco: Record<string, any> = after.custom_overrides ?? {};
    const coKeys = new Set([...Object.keys(bco), ...Object.keys(aco)]);
    for (const k of coKeys) {
        if (JSON.stringify(bco[k]) !== JSON.stringify(aco[k])) {
            changes[`co.${k}`] = { before: bco[k], after: aco[k] };
        }
    }
    return changes;
}

function formatSalary(n: number | undefined): string {
    if (n === undefined || n === null || isNaN(n)) return '';
    return n.toLocaleString('en-US');
}

// ── 계약 폼 (Base / CO 공용) ───────────────────────────────────────────────────
interface ContractFormProps {
    contract: Record<string, any>;
    salary: number | undefined;
    onSetContractYear: (idx: number, val: string) => void;
    onAddYear: () => void;
    onRemoveYear: (idx: number) => void;
    onSetContractField: (key: string, val: any) => void;
    onSetSalary: (val: string) => void;
    startYear: number;
}

const ContractForm: React.FC<ContractFormProps> = ({
    contract, salary,
    onSetContractYear, onAddYear, onRemoveYear, onSetContractField, onSetSalary,
    startYear,
}) => {
    const years: number[] = contract.years ?? [];
    const currentYear: number = contract.currentYear ?? 0;
    const contractType: string = contract.type ?? 'veteran';
    const noTrade: boolean = !!contract.noTrade;
    const option = contract.option ?? null;

    const inputCls = 'w-full bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors';

    return (
        <div className="space-y-3">
            {/* 메타 */}
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                <table className="min-w-full divide-y divide-white/5">
                    <tbody className="divide-y divide-white/5">
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3 pl-4 pr-3 text-sm text-gray-400 whitespace-nowrap w-24">계약 타입</td>
                            <td className="px-3 py-2.5">
                                <select className={inputCls} value={contractType} onChange={e => onSetContractField('type', e.target.value)}>
                                    {['veteran','rookie','max','extension','min','two-way','10-day'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3 pl-4 pr-3 text-sm text-gray-400 whitespace-nowrap">현재 시즌</td>
                            <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <input type="number" min={0} max={Math.max(0, years.length - 1)}
                                        className="w-12 bg-white/5 rounded px-2 py-0.5 text-sm text-white text-center ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                        value={currentYear} onChange={e => onSetContractField('currentYear', Number(e.target.value))} />
                                    <span className="text-sm text-gray-600">(0부터)</span>
                                </div>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3 pl-4 pr-3 text-sm text-gray-400">옵션</td>
                            <td className="px-3 py-2.5">
                                <div className="flex items-center gap-3">
                                    <select className="bg-white/5 rounded px-2 py-0.5 text-sm text-white ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                        value={option?.type ?? 'none'}
                                        onChange={e => { const v = e.target.value; onSetContractField('option', v === 'none' ? undefined : { ...option, type: v }); }}>
                                        <option value="none">없음</option>
                                        <option value="player">Player Option</option>
                                        <option value="team">Team Option</option>
                                    </select>
                                    {option && (
                                        <>
                                            <span className="text-sm text-gray-500">년도</span>
                                            <input type="number" min={0} max={Math.max(0, years.length - 1)}
                                                className="w-10 bg-white/5 rounded px-2 py-0.5 text-sm text-white text-center ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                                                value={option.year ?? 0} onChange={e => onSetContractField('option', { ...option, year: Number(e.target.value) })} />
                                            <span className="text-sm text-gray-600">(인덱스)</span>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3 pl-4 pr-3 text-sm text-gray-400">NTC</td>
                            <td className="px-3 py-2.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={noTrade}
                                        onChange={e => onSetContractField('noTrade', e.target.checked ? true : undefined)}
                                        className="accent-indigo-500" />
                                    <span className="text-sm text-gray-300">No-Trade Clause</span>
                                </label>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* 연봉 테이블 */}
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                <table className="min-w-full divide-y divide-white/5">
                    <thead className="bg-white/5">
                        <tr>
                            <th scope="col" className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-gray-400 w-10">Y</th>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-400 w-16">시즌</th>
                            <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-400">연봉</th>
                            <th scope="col" className="py-3 pl-3 pr-4 text-right text-xs font-semibold text-gray-400 w-14">$M</th>
                            <th scope="col" className="py-3 pr-4 w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {years.map((sal, idx) => {
                            const isCurrent = idx === currentYear;
                            const isOpt = option && option.year === idx;
                            return (
                                <tr key={idx} className={`hover:bg-white/5 transition-colors ${isCurrent ? 'bg-indigo-950/30' : ''}`}>
                                    <td className="py-3 pl-4 pr-3">
                                        <span className={`font-mono text-sm ${isCurrent ? 'text-indigo-300 font-bold' : 'text-gray-500'}`}>
                                            Y{idx + 1}{isCurrent && <span className="text-indigo-400"> ●</span>}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-400 whitespace-nowrap">
                                        {startYear + idx}–{(startYear + idx + 1).toString().slice(2)}
                                        {isOpt && <span className="ml-1 text-amber-400 text-xs">[{option.type === 'player' ? 'PO' : 'TO'}]</span>}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <input type="text"
                                            className={`w-full rounded px-2 py-0.5 text-sm text-right ring-1 ring-inset focus:outline-none transition-colors ${isCurrent ? 'bg-indigo-950/30 text-indigo-200 ring-indigo-500/40 focus:ring-indigo-400' : 'bg-white/5 text-white ring-white/10 focus:ring-indigo-500/60'}`}
                                            value={formatSalary(sal)} onChange={e => onSetContractYear(idx, e.target.value)} />
                                    </td>
                                    <td className="py-3 pl-3 pr-4 text-sm font-mono text-gray-500 text-right whitespace-nowrap">
                                        {sal ? `$${(sal / 1_000_000).toFixed(1)}M` : '—'}
                                    </td>
                                    <td className="py-3 pr-4 text-center">
                                        <button onClick={() => onRemoveYear(idx)} className="text-gray-700 hover:text-red-400 text-xs transition-colors">✕</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-white/5">
                        <tr>
                            <td colSpan={5} className="py-2.5 pl-4 pr-4">
                                <div className="flex items-center gap-4">
                                    <button onClick={onAddYear} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">+ 년도 추가</button>
                                    <span className="text-sm text-gray-600">총 {years.length}년 · 잔여 {years.length - currentYear}년</span>
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* 루트 salary */}
            <div className="flex items-center gap-3 px-1">
                <span className="text-sm text-gray-400 shrink-0">salary (루트)</span>
                <input type="text"
                    className="w-36 bg-white/5 rounded px-2 py-0.5 text-sm text-white text-right ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-indigo-500/60 transition-colors"
                    value={formatSalary(salary)} onChange={e => onSetSalary(e.target.value.replace(/,/g, ''))} />
                <span className="text-sm text-gray-600">Y{currentYear + 1}과 동기화</span>
            </div>
        </div>
    );
};

// ── 섹션 래퍼 ──────────────────────────────────────────────────────────────────
const Section: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={`mb-5 ${className ?? ''}`}>
        <div className="flex items-center gap-2.5 mb-2.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em] shrink-0">{label}</span>
            <div className="flex-1 h-px bg-slate-800" />
        </div>
        {children}
    </div>
);

export default PlayerEditorPage;
