import React, { useMemo } from 'react';
import { TeamHoverCard } from '../../../components/common/TeamHoverCard';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { useServerClockBucket } from '../../../utils/serverClock';
import { calculatePlayerOvr } from '../../../utils/constants';
import { calculatePreseasonPowerRankings } from '../../../services/multi/powerRanking';
import { ROSTER_STYLE_LABEL_KO, type AiGmProfile, type FrontOfficeMember } from '../../../services/multi/aiGmProfile';
import {
    computeTeamSituations, resolveGmStance, GM_STANCE_LABEL_KO, type SituationTeamInput,
} from '../../../services/multi/aiTeamSituation';
import { computeMultiStandingsStats } from './multiSeasonUtils';
import { isFinal } from './multiGameReveal';
import { describeFrontOffice, ROSTER_STYLE_TONE, STANCE_TONE } from './frontOfficeCopy';
import type { Game, Player, Team } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';

// AI 팀 프런트 호버 카드 — 사장/단장, 로스터 성향, 현재 기조, 성향 설명.
// 설계: docs/plan/multi-ai-gm-profile-plan.md 4장(G3). 위치·지연·크기는 팀 호버 카드(TeamHoverCard)와 같다.
// 현재 기조는 카드가 열릴 때만 계산한다(내용 컴포넌트가 그때 마운트) — 30팀 파워랭킹을 현재 로스터로 다시
// 매기므로 월 단위로 게시되는 파워랭킹 뉴스보다 트레이드 직후 전력을 바로 반영한다.

/** 사람이 운영하는 팀은 단장 성향이 없으므로 상황 판정에서 중립값을 쓴다 */
const NEUTRAL_COMPETITIVENESS = 0.5;

export interface FrontOfficeContext {
    leagueTeams: LeagueTeamRow[];
    poolById: Map<string, Player>;
    aiGmProfiles: Map<string, AiGmProfile>;
    schedule: Game[];
    playoffTeamsPerConf: number;
    playInEnabled: boolean;
    /** 트레이드 데드라인이 지났으면 false — 기조 줄을 숨긴다 */
    showStance: boolean;
}

const FrontOfficeHoverContent: React.FC<{ team: LeagueTeamRow; profile: AiGmProfile; ctx: FrontOfficeContext }> = ({ team, profile, ctx }) => {
    const { leagueTeams, poolById, aiGmProfiles, schedule, playoffTeamsPerConf, playInEnabled, showStance } = ctx;
    const serverNowMs = useServerClockBucket();

    const stance = useMemo(() => {
        if (!showStance) return null;
        const slugs = leagueTeams.map(t => t.team_slug);
        const records = computeMultiStandingsStats(slugs, schedule, serverNowMs);
        const remaining = new Map(slugs.map(s => [s, 0]));
        for (const g of schedule) {
            if (g.isPlayoff || g.isAllstar || isFinal(g, serverNowMs)) continue;
            remaining.set(g.homeTeamId, (remaining.get(g.homeTeamId) ?? 0) + 1);
            remaining.set(g.awayTeamId, (remaining.get(g.awayTeamId) ?? 0) + 1);
        }
        // Regular season is over for this team — no trade stance to show.
        if ((remaining.get(team.team_slug) ?? 0) === 0) return null;

        const teams = leagueTeams.map(t => ({
            id: t.team_slug,
            roster: (t.roster ?? [])
                .map(id => poolById.get(id))
                .filter((p): p is Player => !!p)
                .map(p => ({ ...p, ovr: calculatePlayerOvr(p) })),
        })) as unknown as Team[];
        const powerBySlug = new Map(calculatePreseasonPowerRankings(teams).map(r => [r.teamId, r.powerScore]));

        const inputs: SituationTeamInput[] = leagueTeams.map(t => ({
            slug: t.team_slug,
            conference: t.conference ?? '',
            wins: records[t.team_slug]?.wins ?? 0,
            losses: records[t.team_slug]?.losses ?? 0,
            remaining: remaining.get(t.team_slug) ?? 0,
            powerScore: powerBySlug.get(t.team_slug) ?? 50,
            competitiveness: t.user_id && !t.is_ai
                ? NEUTRAL_COMPETITIVENESS
                : (aiGmProfiles.get(t.team_slug)?.traits.competitiveness ?? NEUTRAL_COMPETITIVENESS),
        }));
        const result = computeTeamSituations(inputs, { playoffTeamsPerConf, playInEnabled }).get(team.team_slug);
        return result ? resolveGmStance(result.situation, profile.traits.competitiveness) : null;
    }, [showStance, leagueTeams, schedule, serverNowMs, poolById, aiGmProfiles, playoffTeamsPerConf, playInEnabled, team.team_slug, profile]);

    const members = [profile.president, profile.gm].filter((m): m is FrontOfficeMember => !!m);

    return (
        // 팀 호버 카드(TeamHoverCardBody)와 같은 규격: 폭 300 / slate-950 / slate-700 테두리 / p-3, 글자는 text-xs만 사용,
        // 라벨 slate-400 · 값 white semibold, 구획선 slate-800. 로스터 성향·현재 기조 값만 칩(배경+글자색)으로 표시한다.
        <div className="w-[300px] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl p-3 select-none">
            <div className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-slate-800">
                <TeamLogo teamId={team.team_slug} teamName={team.team_abbr ?? team.team_slug} size="custom" className="w-9 h-9 shrink-0" shadow={false} />
                <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{team.team_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">프런트</div>
                </div>
            </div>

            {members.length > 0 && (
                <div className="flex flex-col gap-1 pb-2.5 mb-2.5 border-b border-slate-800">
                    {members.map(m => (
                        <div key={`${m.title}-${m.name}`} className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400">{m.title}</span>
                            <span className="text-xs font-semibold text-white truncate ml-2">{m.name}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-1 pb-2.5 mb-2.5 border-b border-slate-800">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">로스터 성향</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${ROSTER_STYLE_TONE[profile.rosterStyleLabel]}`}>
                        {ROSTER_STYLE_LABEL_KO[profile.rosterStyleLabel]}
                    </span>
                </div>
                {stance && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">현재 기조</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${STANCE_TONE[stance]}`}>{GM_STANCE_LABEL_KO[stance]}</span>
                    </div>
                )}
            </div>

            <p className="text-xs text-slate-400 ko-normal">{describeFrontOffice(profile.traits, profile.rosterStyleLabel)}</p>
        </div>
    );
};

/** children(프런트 이름 span 등 단일 엘리먼트)에 AI 프런트 카드를 붙인다. profile이 없으면 children 그대로. */
export const FrontOfficeHover: React.FC<{
    team: LeagueTeamRow;
    profile: AiGmProfile | null | undefined;
    ctx: FrontOfficeContext;
    children: React.ReactElement;
}> = ({ team, profile, ctx, children }) => {
    if (!profile) return children;
    return (
        <TeamHoverCard content={<FrontOfficeHoverContent team={team} profile={profile} ctx={ctx} />}>
            {children}
        </TeamHoverCard>
    );
};
