/**
 * AdminTradeBlock — 세션 설정 "트레이드" 탭 하단의 어드민 수동 트레이드 블록.
 *
 * [2026-10-06] 삭제된 AdminTeamEditorView의 "트레이드" 탭을 세션 설정으로 옮긴 것. 팀 A 선택 + 로스터 하이드레이션만
 * 여기서 하고, 실제 카트/실행은 기존 AdminTradePanel이 담당한다(execute_admin_trade RPC → 성공 시 세션 로그 admin_trade,
 * 실패 시 토스트 없이 admin_trade_failed 로그 + 패널 안 상태줄). 성공 후 reload()로 리그 컨텍스트(로스터)를 다시 읽는다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { AdminTradePanel } from '../../../../components/dashboard/AdminTradePanel';
import { fetchMetaPlayersByRosterIds } from '../../../../services/multi/instancePlayers';
import { mapRawPlayerToRuntimePlayer } from '../../../../services/dataMapper';
import { shouldUseCustomOverrides } from '../../../../utils/leagueOverrides';
import type { Player } from '../../../../types';
import { useLeagueContext } from '../LeagueLayout';
import { useGame } from '../../../../hooks/useGameContext';

const ROSTER_COLS = 'id, name, position, draft_year, base_attributes, tendencies';

export const AdminTradeBlock: React.FC = () => {
    const { league, room, members, leagueTeams, reload } = useLeagueContext();
    const { session } = useGame();
    const useCustomOverrides = shouldUseCustomOverrides(league);

    const sortedTeams = useMemo(() => [...leagueTeams].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr)), [leagueTeams]);
    const [teamASlug, setTeamASlug] = useState('');
    useEffect(() => {
        if (!teamASlug && sortedTeams.length > 0) setTeamASlug(sortedTeams[0].team_slug);
    }, [teamASlug, sortedTeams]);

    const teamARow = leagueTeams.find(t => t.team_slug === teamASlug) ?? null;
    const rosterKey = teamARow?.roster?.join(',') ?? '';
    const [teamARoster, setTeamARoster] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!room?.id || !teamARow?.roster?.length) { setTeamARoster([]); return; }
        let cancelled = false;
        setLoading(true);
        const ids = teamARow.roster;
        fetchMetaPlayersByRosterIds(room.id, ids, ROSTER_COLS)
            .then(raw => {
                if (cancelled) return;
                const byId = new Map(raw.map(r => [String(r.id), r]));
                const ordered = ids.map(id => byId.get(String(id))).filter(Boolean) as Record<string, unknown>[];
                setTeamARoster(ordered.map(r => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true)));
            })
            .catch(e => console.error('[adminTrade.teamA]', e))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room?.id, rosterKey, useCustomOverrides]);

    if (!room?.id || !session?.user?.id) return null;

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ArrowLeftRight size={14} className="text-indigo-400" />
                어드민 트레이드
            </h2>
            <p className="text-xs text-slate-500 ko-normal leading-relaxed">
                두 팀의 선수를 즉시 맞바꿉니다. 샐러리 매칭·데드라인·로스터 정원 검사를 거치지 않고, 양 팀 뎁스차트와 로테이션은
                자동으로 다시 설정됩니다. 실행 결과(성공·실패 모두)는 "로그" 탭에 기록됩니다.
            </p>
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 ko-normal shrink-0">팀 A</span>
                <select
                    value={teamASlug}
                    onChange={e => setTeamASlug(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                    {sortedTeams.map(t => (
                        <option key={t.team_slug} value={t.team_slug}>{t.team_abbr} · {t.team_name}{t.is_ai ? ' (AI)' : ''}</option>
                    ))}
                </select>
                {loading && <Loader2 size={14} className="animate-spin text-slate-500" />}
            </div>
            {teamARow && (
                <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl -mx-2">
                    <AdminTradePanel
                        roomId={room.id}
                        adminUserId={session.user.id}
                        leagueTeams={leagueTeams}
                        members={members}
                        teamASlug={teamASlug}
                        teamARoster={teamARoster}
                        useCustomOverrides={useCustomOverrides}
                        onTradeComplete={() => reload()}
                    />
                </div>
            )}
        </section>
    );
};
