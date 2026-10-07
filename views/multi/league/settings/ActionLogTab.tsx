/**
 * ActionLogTab — 세션 설정 "로그" 탭 (어드민 전용).
 *
 * [2026-10-05] league_action_logs(DB 트리거/RPC가 기록)를 최신순으로 보여준다. 카테고리·팀·행위자 필터와
 * "더 보기"(id 커서, 50건씩)만 있고 편집/삭제는 없다. 행마다 details를 펼쳐 원본 JSON을 볼 수 있다.
 * 읽기 전용이라 실시간 구독은 하지 않고 "새로고침" 버튼으로 다시 불러온다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import type { LeagueTeamRow, RoomRow } from '../../../../services/multi/roomQueries';
import {
    listActionLogs, ACTION_LABELS, ACTION_CATEGORIES, ROLE_LABELS, ACTION_LOG_PAGE_SIZE,
    type ActionLogRow,
} from '../../../../services/multi/actionLogService';
import { notify } from '../../../../services/notifications/notify';

interface Props {
    room: RoomRow | null;
    leagueTeams: LeagueTeamRow[];
}

type NamedRef = { id?: string; name?: string | null; slug?: string | null };

const fmtDateTime = (iso: string): string => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const ROLE_BADGE: Record<string, string> = {
    user:         'bg-slate-700 text-slate-200',
    league_admin: 'bg-indigo-600/40 text-indigo-200',
    global_admin: 'bg-fuchsia-600/40 text-fuchsia-200',
    system:       'bg-slate-800 text-slate-400 border border-slate-700',
};

const ACTION_TONE: Record<string, string> = {
    fa_sign: 'text-emerald-300', waive: 'text-red-300',
    trade_offer_accept: 'text-emerald-300', admin_trade: 'text-emerald-300',
    trade_offer_reject: 'text-amber-300', trade_offer_cancel: 'text-amber-300',
    trade_offer_expire: 'text-slate-400', trade_offer_invalidate: 'text-slate-400',
    admin_trade_failed: 'text-red-300',
    league_settings_update: 'text-fuchsia-300', admin_time_jump: 'text-fuchsia-300', team_reassign: 'text-fuchsia-300',
};

const names = (list: unknown): string => {
    if (!Array.isArray(list)) return '';
    return list.map((x: NamedRef) => x?.name ?? x?.id ?? '').filter(Boolean).join(', ');
};

export const ActionLogTab: React.FC<Props> = ({ room, leagueTeams }) => {
    const [rows, setRows]         = useState<ActionLogRow[]>([]);
    const [loading, setLoading]   = useState(false);
    const [hasMore, setHasMore]   = useState(false);
    const [category, setCategory] = useState<string>('all');
    const [teamId, setTeamId]     = useState<string>('');
    const [actor, setActor]       = useState<string>('');
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const teamById = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        leagueTeams.forEach(t => m.set(t.id, t));
        return m;
    }, [leagueTeams]);

    // 행위자 드롭다운 — 지금까지 불러온 로그에 등장한 사람만 (별도 멤버 조회 없이 충분).
    const actors = useMemo(() => {
        const m = new Map<string, string>();
        rows.forEach(r => {
            if (r.actor_user_id) m.set(r.actor_user_id, r.actor_nickname || r.actor_email || r.actor_user_id.slice(0, 8));
        });
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const actions = useMemo(
        () => (category === 'all' ? undefined : ACTION_CATEGORIES.find(c => c.id === category)?.actions),
        [category],
    );

    const load = useCallback(async (beforeId: number | null) => {
        if (!room?.id) return;
        setLoading(true);
        const { rows: next, error } = await listActionLogs({
            roomId: room.id, actions, teamId: teamId || null, actorUserId: actor || null, beforeId,
        });
        setLoading(false);
        if (error) {
            notify.error('세션 로그를 불러오지 못했습니다. 잠시 후 다시 시도하세요.', { source: 'actionLog.load' });
            console.error('[actionLog.load]', error);
            return;
        }
        setRows(prev => (beforeId ? [...prev, ...next] : next));
        setHasMore(next.length === ACTION_LOG_PAGE_SIZE);
    }, [room?.id, actions, teamId, actor]);

    useEffect(() => { setExpanded(new Set()); void load(null); }, [load]);

    const toggle = (id: number) => setExpanded(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const teamLabel = (id: string | null): string => {
        if (!id) return '—';
        const t = teamById.get(id);
        return t ? (t.team_abbr || t.team_name) : id.slice(0, 8);
    };

    /** 행 요약 한 줄 — details 구조는 액션별로 다르므로 여기서만 분기한다. */
    const summarize = (r: ActionLogRow): string => {
        const d = r.details ?? {};
        switch (r.action) {
            case 'fa_sign':
            case 'waive': {
                const name = (d.player_name as string) ?? (d.player as NamedRef)?.name ?? r.target_player_ids[0] ?? '';
                return name;
            }
            case 'trade_offer_create': case 'trade_offer_accept': case 'trade_offer_reject':
            case 'trade_offer_cancel': case 'trade_offer_expire': case 'trade_offer_invalidate': {
                const from = (d.from_team as NamedRef)?.slug?.toUpperCase() ?? teamLabel(r.target_team_ids[0] ?? null);
                const to   = (d.to_team as NamedRef)?.slug?.toUpperCase() ?? teamLabel(r.target_team_ids[1] ?? null);
                const pf = names(d.players_from), pt = names(d.players_to);
                return `${from} → ${to}: ${pf || '없음'}  |  ${to} → ${from}: ${pt || '없음'}`;
            }
            case 'admin_trade': {
                const a = (d.team_a as NamedRef)?.slug?.toUpperCase() ?? 'A';
                const b = (d.team_b as NamedRef)?.slug?.toUpperCase() ?? 'B';
                const note = d.note ? ` · 사유: ${d.note as string}` : '';
                return `${a} → ${b}: ${names(d.players_a_to_b) || '없음'}  |  ${b} → ${a}: ${names(d.players_b_to_a) || '없음'}${note}`;
            }
            case 'trade_block_set': case 'trade_block_unset':
                return (d.player as NamedRef)?.name ?? r.target_player_ids[0] ?? '';
            case 'trade_request_update':
                return `변경: ${Object.keys((d.changed as object) ?? {}).join(', ')}`;
            case 'team_reassign':
                return `${(d.team as NamedRef)?.name ?? ''} · ${d.after_user_id ? '담당자 배정' : 'AI로 전환'}`;
            case 'draft_pick': {
                const p = d.player as NamedRef & { position?: string; ovr?: number };
                return `${d.round ?? '?'}R ${d.pick_index ?? d.slot ?? ''}번 · ${p?.name ?? ''}${p?.position ? ` (${p.position}` : ''}${p?.ovr != null ? ` ${p.ovr})` : p?.position ? ')' : ''}`;
            }
            case 'league_settings_update':
                return `변경: ${Object.keys((d.changed as object) ?? {}).join(', ')}`;
            case 'admin_trade_failed': {
                const a = (d.team_a as NamedRef)?.slug?.toUpperCase() ?? 'A';
                const b = (d.team_b as NamedRef)?.slug?.toUpperCase() ?? 'B';
                return `${a} ↔ ${b} · 실패: ${(d.reason as string) ?? '원인 미상'}${d.note ? ` · 사유: ${d.note as string}` : ''}`;
            }
            case 'admin_tactics_update': {
                const parts: string[] = [];
                const names = (d.player_names as Record<string, string>) ?? {};
                const nm = (id: string) => names[id] ?? id.slice(0, 8);
                if (d.sliders) parts.push(`슬라이더 ${Object.keys(d.sliders as object).length}개`);
                if (d.starters) parts.push(`선발 ${Object.keys(d.starters as object).join('/')}`);
                if (d.depth_chart) parts.push('뎁스차트');
                if (Array.isArray(d.rotation_changed)) parts.push(`로테이션 ${(d.rotation_changed as string[]).map(nm).join(', ')}`);
                if (d.minutes_limits) parts.push(`분 제한 ${Object.keys(d.minutes_limits as object).map(nm).join(', ')}`);
                if (d.player_tactics) parts.push(`선수 전술 ${Object.keys(d.player_tactics as object).map(nm).join(', ')}`);
                if (d.stopper) parts.push('스토퍼');
                return `${(d.team as NamedRef)?.slug?.toUpperCase() ?? ''}${d.created ? ' (신규 생성)' : ''} · ${parts.join(' · ') || '변경 없음'}`;
            }
            case 'admin_time_jump': {
                const h = Math.round(Number(d.delta_seconds ?? 0) / 3600);
                return `${d.through ?? ''}까지 (약 ${h}시간 앞당김)`;
            }
            default:
                return '';
        }
    };

    const selectClass = 'bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500';

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-indigo-300" />
                <h3 className="text-sm font-bold text-white ko-tight">세션 로그</h3>
                <span className="text-xs text-slate-500 ko-normal">영입·방출·트레이드·드래프트·설정 변경 등 이 세션에서 내려진 결정의 기록</span>
                <button
                    onClick={() => void load(null)}
                    disabled={loading}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-xs font-bold text-white transition-colors"
                >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}새로고침
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                    <option value="all">전체 유형</option>
                    {ACTION_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select value={teamId} onChange={e => setTeamId(e.target.value)} className={selectClass}>
                    <option value="">전체 팀</option>
                    {[...leagueTeams].sort((a, b) => a.team_abbr.localeCompare(b.team_abbr)).map(t => (
                        <option key={t.id} value={t.id}>{t.team_abbr} · {t.team_name}</option>
                    ))}
                </select>
                <select value={actor} onChange={e => setActor(e.target.value)} className={selectClass}>
                    <option value="">전체 행위자</option>
                    {actors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <span className="text-xs text-slate-500 ko-normal ml-auto">{rows.length}건 표시</span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-slate-400 border-b border-slate-700/60">
                            <th className="text-left py-2 pr-2 w-6" />
                            <th className="text-left py-2 pr-3 whitespace-nowrap">시각</th>
                            <th className="text-left py-2 pr-3 whitespace-nowrap">게임 날짜</th>
                            <th className="text-left py-2 pr-3 whitespace-nowrap">행위자</th>
                            <th className="text-left py-2 pr-3 whitespace-nowrap">팀</th>
                            <th className="text-left py-2 pr-3 whitespace-nowrap">유형</th>
                            <th className="text-left py-2">내용</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading && (
                            <tr><td colSpan={7} className="py-8 text-center text-slate-500 ko-normal">기록이 없습니다.</td></tr>
                        )}
                        {rows.map(r => {
                            const open = expanded.has(r.id);
                            return (
                                <React.Fragment key={r.id}>
                                    <tr onClick={() => toggle(r.id)} className="border-b border-slate-800 hover:bg-slate-700/30 cursor-pointer align-top">
                                        <td className="py-2 pr-2 text-slate-500">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap text-slate-300 tabular-nums">{fmtDateTime(r.created_at)}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap text-slate-400 tabular-nums">{r.sim_date ? r.sim_date.replace(/-/g, '/') : '—'}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5 ${ROLE_BADGE[r.actor_role] ?? ROLE_BADGE.user}`}>
                                                {ROLE_LABELS[r.actor_role] ?? r.actor_role}
                                            </span>
                                            <span className="text-white">{r.actor_nickname || r.actor_email || (r.actor_role === 'system' ? '' : r.actor_user_id?.slice(0, 8) ?? '')}</span>
                                        </td>
                                        <td className="py-2 pr-3 whitespace-nowrap text-white font-bold">{teamLabel(r.team_id)}</td>
                                        <td className={`py-2 pr-3 whitespace-nowrap font-bold ${ACTION_TONE[r.action] ?? 'text-white'}`}>{ACTION_LABELS[r.action] ?? r.action}</td>
                                        <td className="py-2 text-slate-200 ko-normal">{summarize(r)}</td>
                                    </tr>
                                    {open && (
                                        <tr className="border-b border-slate-800 bg-slate-900/60">
                                            <td colSpan={7} className="py-2 px-3">
                                                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-all font-mono leading-snug">
                                                    {JSON.stringify({ ...r.details, _players: r.target_player_ids, _teams: r.target_team_ids.map(teamLabel) }, null, 2)}
                                                </pre>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {hasMore && (
                <div className="flex justify-center">
                    <button
                        onClick={() => void load(rows[rows.length - 1]?.id ?? null)}
                        disabled={loading}
                        className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-xs font-bold text-white transition-colors"
                    >
                        {loading ? '불러오는 중…' : '더 보기'}
                    </button>
                </div>
            )}
        </section>
    );
};
