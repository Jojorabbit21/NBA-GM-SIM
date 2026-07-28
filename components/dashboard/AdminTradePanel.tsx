
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, ArrowLeftRight, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { generateAutoTactics } from '../../services/gameEngine';
import { saveMemberTactics } from '../../services/multi/roomPersistence';
import { executeAdminTrade } from '../../services/multi/leagueService';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import type { LeagueTeamRow, RoomMemberRow } from '../../services/multi/roomQueries';
import type { Player, Team, GameTactics } from '../../types';

interface AdminTradePanelProps {
    roomId: string;
    adminUserId: string;
    leagueTeams: LeagueTeamRow[];
    members: RoomMemberRow[];
    teamASlug: string;
    teamARoster: Player[];
    useCustomOverrides: boolean;
    /** 트레이드 성공 직후 팀A(현재 뎁스차트/로테이션 탭에서 보고 있는 팀)의 새 전술 —
     *  부모가 자신의 draftTactics/draftDepthChart 로컬 상태를 즉시 갱신하는 데 사용 */
    onTradeComplete: (teamATactics: GameTactics) => void;
}

/** 선수 한 명 행 — 클릭으로 트레이드 카트에 담기/빼기 */
const PlayerRow: React.FC<{ player: Player; selected: boolean; onToggle: () => void }> = ({ player, selected, onToggle }) => (
    <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
            selected ? 'bg-indigo-600/30 ring-1 ring-indigo-500' : 'hover:bg-white/5'
        }`}
    >
        <OvrBadge value={calculatePlayerOvr(player)} size="sm" className="!text-xs shrink-0" />
        <span className="text-xs font-semibold text-white truncate">{player.name}</span>
        <span className="text-[10px] text-slate-500 shrink-0">{player.position}</span>
    </button>
);

export const AdminTradePanel: React.FC<AdminTradePanelProps> = ({
    roomId,
    adminUserId,
    leagueTeams,
    members,
    teamASlug,
    teamARoster,
    useCustomOverrides,
    onTradeComplete,
}) => {
    const teamARow = leagueTeams.find(t => t.team_slug === teamASlug) ?? null;

    const otherTeams = useMemo(
        () => [...leagueTeams].filter(t => t.team_slug !== teamASlug).sort((a, b) => a.team_name.localeCompare(b.team_name)),
        [leagueTeams, teamASlug],
    );

    const [teamBSlug, setTeamBSlug] = useState<string>('');
    useEffect(() => {
        if (!teamBSlug || teamBSlug === teamASlug || !otherTeams.some(t => t.team_slug === teamBSlug)) {
            setTeamBSlug(otherTeams[0]?.team_slug ?? '');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otherTeams, teamASlug]);

    const teamBRow = leagueTeams.find(t => t.team_slug === teamBSlug) ?? null;

    // ── 팀 B 로스터 하이드레이션 (팀 A는 부모가 이미 하이드레이션해서 prop으로 넘겨줌) ──
    const [teamBRoster, setTeamBRoster] = useState<Player[]>([]);
    const [teamBLoading, setTeamBLoading] = useState(false);
    const teamBRosterKey = teamBRow?.roster?.join(',') ?? '';

    useEffect(() => {
        if (!teamBRow?.roster?.length) { setTeamBRoster([]); return; }
        setTeamBLoading(true);
        const ids = teamBRow.roster;
        supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', ids)
            .then(({ data }) => {
                if (!data) { setTeamBLoading(false); return; }
                const byId = new Map(data.map((raw: any) => [String(raw.id), raw]));
                const ordered = ids.map(id => byId.get(String(id))).filter(Boolean);
                setTeamBRoster(ordered.map((raw: any) => mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true)));
                setTeamBLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamBRosterKey]);

    // ── 트레이드 카트 (실행 버튼을 눌러야만 실제 반영됨) ────────────────────────
    const [cartAtoB, setCartAtoB] = useState<Set<string>>(new Set());
    const [cartBtoA, setCartBtoA] = useState<Set<string>>(new Set());

    // 상대 팀을 바꾸면 카트 초기화 (다른 팀 기준으로 담아둔 선수가 남아있으면 혼란)
    useEffect(() => { setCartAtoB(new Set()); setCartBtoA(new Set()); }, [teamBSlug]);

    const toggleA = useCallback((id: string) => {
        setCartAtoB(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);
    const toggleB = useCallback((id: string) => {
        setCartBtoA(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const [confirming, setConfirming] = useState(false);
    const [executing, setExecuting]   = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [successFlash, setSuccessFlash] = useState(false);

    const teamAOut = useMemo(() => teamARoster.filter(p => cartAtoB.has(p.id)), [teamARoster, cartAtoB]);
    const teamBOut = useMemo(() => teamBRoster.filter(p => cartBtoA.has(p.id)), [teamBRoster, cartBtoA]);
    const canExecute = (cartAtoB.size > 0 || cartBtoA.size > 0) && !!teamARow && !!teamBRow;

    const handleExecute = useCallback(async () => {
        if (!teamARow || !teamBRow) return;
        setExecuting(true);
        setError(null);

        const playersAtoB = [...cartAtoB];
        const playersBtoA = [...cartBtoA];

        const { error: tradeErr } = await executeAdminTrade({
            roomId, adminUserId,
            teamAId: teamARow.id, teamBId: teamBRow.id,
            playersAtoB, playersBtoA,
        });

        if (tradeErr) {
            setError(tradeErr);
            setExecuting(false);
            setConfirming(false);
            return;
        }

        // 로스터는 이미 양쪽 다 전체 Player 객체를 들고 있으므로 재조회 없이 바로 로컬 계산 →
        // 뎁스차트/로테이션 1회 자동 설정(generateAutoTactics)에 바로 사용
        const outA = new Set(playersAtoB);
        const outB = new Set(playersBtoA);
        const newTeamARoster = [...teamARoster.filter(p => !outA.has(p.id)), ...teamBRoster.filter(p => outB.has(p.id))];
        const newTeamBRoster = [...teamBRoster.filter(p => !outB.has(p.id)), ...teamARoster.filter(p => outA.has(p.id))];

        const shell = (slug: string, name: string, roster: Player[]): Team => ({
            id: slug, name, city: '', logo: '', conference: 'East', division: '',
            wins: 0, losses: 0, budget: 0, salaryCap: 0, luxuryTaxLine: 0, roster,
        });

        const newTacticsA = generateAutoTactics(shell(teamASlug, teamARow.team_name, newTeamARoster));
        const newTacticsB = generateAutoTactics(shell(teamBSlug, teamBRow.team_name, newTeamBRoster));

        const memberA = members.find(m => m.team_id === teamASlug) ?? null;
        const memberB = members.find(m => m.team_id === teamBSlug) ?? null;
        if (memberA) await saveMemberTactics(roomId, memberA.user_id, newTacticsA, newTacticsA.depthChart);
        if (memberB) await saveMemberTactics(roomId, memberB.user_id, newTacticsB, newTacticsB.depthChart);

        setCartAtoB(new Set());
        setCartBtoA(new Set());
        setExecuting(false);
        setConfirming(false);
        setSuccessFlash(true);
        setTimeout(() => setSuccessFlash(false), 2000);

        onTradeComplete(newTacticsA);
    }, [teamARow, teamBRow, cartAtoB, cartBtoA, teamARoster, teamBRoster, teamASlug, teamBSlug, members, roomId, adminUserId, onTradeComplete]);

    if (otherTeams.length === 0) {
        return <div className="p-8 text-sm text-slate-500 ko-normal">트레이드할 상대 팀이 없습니다.</div>;
    }

    return (
        <div className="p-6 space-y-5">
            {/* 상대 팀 선택 */}
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 ko-normal shrink-0">상대 팀</span>
                <select
                    value={teamBSlug}
                    onChange={e => setTeamBSlug(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                    {otherTeams.map(t => (
                        <option key={t.team_slug} value={t.team_slug}>{t.team_name}{t.is_ai ? ' (AI)' : ''}</option>
                    ))}
                </select>
                {teamBLoading && <Loader2 size={14} className="animate-spin text-slate-500" />}
            </div>

            {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-400 ko-normal">
                    <AlertTriangle size={13} className="shrink-0" />
                    {error}
                </div>
            )}
            {successFlash && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40 text-xs text-emerald-400 ko-normal">
                    <Check size={13} className="shrink-0" />
                    트레이드가 완료되고 양 팀 뎁스차트·로테이션이 자동으로 재설정됐습니다.
                </div>
            )}

            {/* 양팀 로스터 */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/60 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800 text-xs font-bold text-indigo-400 ko-normal">
                        {teamARow?.team_name ?? '팀 A'} · {teamAOut.length}명 선택
                    </div>
                    <div className="p-1.5 space-y-0.5 max-h-96 overflow-y-auto">
                        {teamARoster.map(p => (
                            <PlayerRow key={p.id} player={p} selected={cartAtoB.has(p.id)} onToggle={() => toggleA(p.id)} />
                        ))}
                    </div>
                </div>
                <div className="bg-slate-900/60 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800 text-xs font-bold text-slate-300 ko-normal">
                        {teamBRow?.team_name ?? '팀 B'} · {teamBOut.length}명 선택
                    </div>
                    <div className="p-1.5 space-y-0.5 max-h-96 overflow-y-auto">
                        {teamBRoster.map(p => (
                            <PlayerRow key={p.id} player={p} selected={cartBtoA.has(p.id)} onToggle={() => toggleB(p.id)} />
                        ))}
                    </div>
                </div>
            </div>

            {/* 트레이드 요약 + 실행 */}
            {(teamAOut.length > 0 || teamBOut.length > 0) && (
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs ko-normal">
                        <ArrowLeftRight size={13} className="text-indigo-400 shrink-0" />
                        <span className="text-slate-400">{teamARow?.team_name} → {teamBRow?.team_name}:</span>
                        <span className="text-white font-semibold">{teamAOut.map(p => p.name).join(', ') || '없음'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs ko-normal">
                        <ArrowLeftRight size={13} className="text-indigo-400 shrink-0" />
                        <span className="text-slate-400">{teamBRow?.team_name} → {teamARow?.team_name}:</span>
                        <span className="text-white font-semibold">{teamBOut.map(p => p.name).join(', ') || '없음'}</span>
                    </div>

                    {confirming ? (
                        <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-amber-400 ko-normal flex-1">
                                이 트레이드를 실행할까요? 되돌릴 수 없습니다.
                            </span>
                            <button
                                onClick={() => setConfirming(false)}
                                disabled={executing}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleExecute}
                                disabled={executing}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-700/60 hover:bg-red-600/60 text-red-200 disabled:opacity-40"
                            >
                                {executing ? <Loader2 size={13} className="animate-spin" /> : '확인'}
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirming(true)}
                            disabled={!canExecute}
                            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ArrowLeftRight size={13} />
                            트레이드 실행
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
