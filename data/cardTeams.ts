// cardTeams.ts — 시즌 카드(meta_player_cards.base_team_id)에서 고를 수 있는 "30팀 외 확장 팀".
// [2026-09-20] 사용자 요청 "카드에서 시애틀 에메랄즈 팀도 선택 가능하도록 해줘." 가상 확장팀
// (data/virtualTeams.ts, 토너먼트 32/64팀용)은 resolveTeamId/getRealTeamLogoUrl이 이미 해석하지만
// TEAM_DATA/TEAM_COLORS에는 없어 카드 편집기 선택지·카드 팀명·기본 팀 컬러에서 빠져 있었다.
// 여기 목록에 넣은 팀만 카드 시스템(편집기 선택지, 팀별 컬러 패널, 카드 팀명/기본 그라디언트)에 노출된다.
// 순수 데이터 모듈 — import 없음(순환 방지). virtualTeams.ts도 import 없는 순수 데이터.
import { VIRTUAL_TEAMS, type VirtualTeamTemplate } from './virtualTeams';

export interface CardExtraTeam {
    id: string;
    city: string;
    name: string;
    abbr: string;
    primary: string;
    secondary: string;
}

const CARD_EXTRA_TEAM_SLUGS = ['sea'];

function toCardTeam(t: VirtualTeamTemplate): CardExtraTeam {
    // team_name은 "시애틀 에메랄즈"처럼 도시+팀명 — 도시를 떼어 name만 남긴다(TEAM_DATA와 같은 모양).
    const name = t.team_name.startsWith(t.city) ? t.team_name.slice(t.city.length).trim() : t.team_name;
    return { id: t.team_slug, city: t.city, name, abbr: t.team_abbr, primary: t.color_primary, secondary: t.color_secondary };
}

export const CARD_EXTRA_TEAMS: CardExtraTeam[] = VIRTUAL_TEAMS
    .filter(t => CARD_EXTRA_TEAM_SLUGS.includes(t.team_slug))
    .map(toCardTeam);

export function getCardExtraTeam(teamId: string | null | undefined): CardExtraTeam | null {
    if (!teamId) return null;
    return CARD_EXTRA_TEAMS.find(t => t.id === teamId) ?? null;
}
