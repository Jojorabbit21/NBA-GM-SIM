/**
 * achievements.ts — 도전 과제 정의(순수). 계획: docs/plan/points-system-plan.md "도전 과제" (2026-11-08 확정)
 *
 * 계정당 1회. 조건은 내 팀의 기록으로 판정, 이미 쌓이는 데이터만 사용(새 추적 없음).
 * 이름은 영문(실존 인물·팀·리그명 없음 — 트로피 애칭 'Larry'·'Bill' 은 사용자 결정으로 허용).
 * 끝난 리그 기록은 세지 않는다 → ACHIEVEMENT_SINCE 이전 completed_at 행은 평가 대상 아님.
 */
import type { Rarity } from './types.ts';

export const ACHIEVEMENT_SINCE = '2026-11-08T00:00:00Z';

export const ACHIEVEMENT_REWARD: Record<Rarity, number> = { common: 50, rare: 150, unique: 400, epic: 1000 };

export type AchievementCategory = 'career' | 'season' | 'playoff' | 'players' | 'front_office';

export interface AchievementDef {
    id: string;
    name: string;
    /** 한글 조건 설명(화면용) */
    description: string;
    rarity: Rarity;
    category: AchievementCategory;
    /** 달성 전에는 조건을 가린다 */
    hidden?: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
    // B. 통산 승수 (정규시즌, 완주 시즌 합계)
    { id: 'career_wins_100',  name: 'Century Mark',       description: '정규시즌 통산 100승',   rarity: 'common', category: 'career' },
    { id: 'career_wins_250',  name: 'Tenured',            description: '정규시즌 통산 250승',   rarity: 'rare',   category: 'career' },
    { id: 'career_wins_500',  name: 'Five Hundred Club',  description: '정규시즌 통산 500승',   rarity: 'unique', category: 'career' },
    { id: 'career_wins_1000', name: 'Thousand Wins',      description: '정규시즌 통산 1,000승', rarity: 'epic',   category: 'career' },
    { id: 'career_wins_1390', name: 'Winningest Ever',    description: '정규시즌 통산 1,390승', rarity: 'epic',   category: 'career', hidden: true },

    // C. 시즌 성적
    { id: 'season_wins_41',   name: 'Above .500',         description: '한 시즌 41승(5할) 이상',          rarity: 'common', category: 'season' },
    { id: 'season_wins_50',   name: 'Fifty Piece',        description: '한 시즌 50승 이상',               rarity: 'rare',   category: 'season' },
    { id: 'season_wins_60',   name: 'Sixty Wins',         description: '한 시즌 60승 이상',               rarity: 'unique', category: 'season' },
    { id: 'season_wins_65',   name: 'Juggernaut',         description: '한 시즌 65승 이상',               rarity: 'epic',   category: 'season' },
    { id: 'season_wins_70',   name: 'Tough to Beat',      description: '한 시즌 70승 이상',               rarity: 'epic',   category: 'season', hidden: true },
    { id: 'season_wins_74',   name: 'Apex Predator',      description: '한 시즌 74승 이상',               rarity: 'epic',   category: 'season', hidden: true },
    { id: 'best_record',      name: 'Best Record',        description: '정규시즌 리그 최다승',            rarity: 'unique', category: 'season' },
    { id: 'turnaround',       name: 'Turnaround',         description: '직전 시즌보다 15승 이상 더 거둠', rarity: 'rare',   category: 'season' },

    // D. 플레이오프
    { id: 'po_qualify',       name: 'Punched the Ticket', description: '플레이오프 본선 진출',                     rarity: 'common', category: 'playoff' },
    { id: 'po_long_shot',     name: 'Long Shot',          description: '플레이인 10번 시드로 플레이오프 진출',     rarity: 'rare',   category: 'playoff' },
    { id: 'po_series_win',    name: 'Breakthrough',       description: '플레이오프 시리즈 승리',                   rarity: 'rare',   category: 'playoff' },
    { id: 'po_sweep',         name: 'Brooms Out',         description: '플레이오프 시리즈를 무패로 승리',          rarity: 'rare',   category: 'playoff' },
    { id: 'po_upset',         name: 'Upset',              description: '하위 시드로 시리즈 승리',                  rarity: 'rare',   category: 'playoff' },
    { id: 'po_conf_finals',   name: 'Final Four',         description: '컨퍼런스 파이널 진출',                     rarity: 'rare',   category: 'playoff' },
    { id: 'po_finals',        name: 'Finalist',           description: '파이널 진출',                              rarity: 'unique', category: 'playoff' },
    { id: 'champion',         name: 'Hey, Larry',         description: '우승',                                     rarity: 'epic',   category: 'playoff' },
    { id: 'champion_3',       name: 'Three-Peat',         description: '통산 우승 3회 (연속이 아니어도 됨)',       rarity: 'epic',   category: 'playoff' },
    { id: 'back_to_back',     name: 'Back to Back',       description: '같은 리그에서 2시즌 연속 우승',            rarity: 'epic',   category: 'playoff', hidden: true },
    { id: 'eighth_wonder',    name: 'Eighth Wonder',      description: '8번 시드로 우승',                          rarity: 'epic',   category: 'playoff', hidden: true },
    { id: 'flawless',         name: 'Flawless',           description: '플레이오프 전 시리즈를 무패로 우승',       rarity: 'epic',   category: 'playoff', hidden: true },

    // E. 선수 배출
    { id: 'all_star',         name: 'Hey now, You are an All-star', description: '내 팀 선수가 올스타에 선정됨',          rarity: 'common', category: 'players' },
    { id: 'all_league',       name: 'Elite Five',         description: '내 팀 선수가 올-리그 팀에 선정됨',               rarity: 'rare',   category: 'players' },
    { id: 'hardware',         name: 'Hardware',           description: '내 팀 선수가 MVP 또는 올해의 수비수 수상',       rarity: 'unique', category: 'players' },
    { id: 'finals_mvp',       name: "Bill's Path",        description: '내 팀 선수가 파이널 MVP 수상',                   rarity: 'unique', category: 'players' },

    // F. 운영
    { id: 'dealmaker',        name: 'Dealmaker',          description: '트레이드 성사',   rarity: 'common', category: 'front_office' },
    { id: 'open_market',      name: 'Open Market',        description: '자유 계약 영입',  rarity: 'common', category: 'front_office' },
    { id: 'first_pick',       name: 'With the First Pick', description: '드래프트 지명',  rarity: 'common', category: 'front_office' },
];

const BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export function achievementDef(id: string): AchievementDef | undefined { return BY_ID.get(id); }
export function achievementReward(id: string): number {
    const d = BY_ID.get(id);
    return d ? ACHIEVEMENT_REWARD[d.rarity] : 0;
}

export const CAREER_WIN_LADDER: readonly [number, string][] = [
    [100, 'career_wins_100'], [250, 'career_wins_250'], [500, 'career_wins_500'], [1000, 'career_wins_1000'], [1390, 'career_wins_1390'],
];
export const SEASON_WIN_LADDER: readonly [number, string][] = [
    [41, 'season_wins_41'], [50, 'season_wins_50'], [60, 'season_wins_60'], [65, 'season_wins_65'], [70, 'season_wins_70'], [74, 'season_wins_74'],
];
export const TURNAROUND_DELTA = 15;
export const THREE_PEAT_COUNT = 3;
