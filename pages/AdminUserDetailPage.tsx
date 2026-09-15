import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2, Save, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import {
    adminListUsers, adminUpdateUser, adminDeleteUser,
    adminGetUserHistory, adminUpdateLeagueHistory, adminUpdateTournamentHistory,
    adminDeleteLeagueHistory, adminDeleteTournamentHistory, adminResetUserHistory,
    type AdminUserRow, type AdminUserEditableFields,
    type AdminLeagueHistoryRow, type AdminTournamentHistoryRow,
} from '../services/admin/userAdminService';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="text-xs text-slate-400 ko-normal block mb-1.5">{label}</label>
        {children}
    </div>
);

const inputClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500';
const miniInputClass = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500';

const emptyFields: AdminUserEditableFields = {
    nickname: '', email: '', first_name: '', last_name: '',
    birth_year: null, nationality: '', avatar_url: '',
};

const PLAYOFF_RESULT_OPTIONS = [
    { value: 'champion',        label: '우승' },
    { value: 'runner_up',       label: '준우승' },
    { value: 'eliminated',      label: '탈락' },
    { value: 'missed_playoffs', label: '플레이오프 진출 실패' },
];

const leagueKey = (r: Pick<AdminLeagueHistoryRow, 'group_id' | 'season_number'>) => `${r.group_id}_${r.season_number}`;

// Admin 편집기 "사용자 관리" 탭의 상세 페이지 — /admin/editor/users/:userId.
// 목록(AdminUserManagerPage)에서 행 클릭 시 state로 넘어온 유저 데이터를 우선 쓰고,
// 새로고침 등으로 state가 없으면 전체 목록을 다시 불러와 id로 찾는다(전용 단건 조회
// 엔드포인트를 따로 만들지 않고 기존 /admin/users 목록 API를 재사용).
const AdminUserDetailPage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const stateUser = (location.state as { user?: AdminUserRow } | null)?.user;

    const [user,      setUser]      = useState<AdminUserRow | null>(stateUser ?? null);
    const [isLoading, setIsLoading] = useState(!stateUser);
    const [loadErr,   setLoadErr]   = useState<string | null>(null);
    const [fields,    setFields]    = useState<AdminUserEditableFields>(emptyFields);

    const [saving,   setSaving]   = useState(false);
    const [saveErr,  setSaveErr]  = useState<string | null>(null);
    const [saveOk,   setSaveOk]   = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleting,      setDeleting]      = useState(false);
    const [deleteErr,     setDeleteErr]     = useState<string | null>(null);

    // ── 멀티플레이 전적 ────────────────────────────────────────────────────────
    const [leagueRows,     setLeagueRows]     = useState<AdminLeagueHistoryRow[]>([]);
    const [tournamentRows, setTournamentRows] = useState<AdminTournamentHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyErr,     setHistoryErr]     = useState<string | null>(null);
    // 행별 저장/삭제 상태 — 키는 leagueKey(리그) 또는 row.id(토너먼트)
    const [rowSaving,      setRowSaving]      = useState<Record<string, boolean>>({});
    const [rowErr,         setRowErr]         = useState<Record<string, string | null>>({});
    const [rowSavedOk,     setRowSavedOk]     = useState<Record<string, boolean>>({});
    const [rowDeleteConfirm, setRowDeleteConfirm] = useState<string | null>(null);

    const [resetConfirm, setResetConfirm] = useState(false);
    const [resetting,    setResetting]    = useState(false);
    const [resetErr,     setResetErr]     = useState<string | null>(null);

    const loadHistory = useCallback(() => {
        if (!userId) return;
        setHistoryLoading(true);
        adminGetUserHistory(userId).then(({ league, tournament, error }) => {
            setLeagueRows(league);
            setTournamentRows(tournament);
            setHistoryErr(error);
            setHistoryLoading(false);
        });
    }, [userId]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    useEffect(() => {
        if (user || !userId) return;
        setIsLoading(true);
        adminListUsers().then(({ data, error }) => {
            const found = data.find(u => u.id === userId) ?? null;
            setUser(found);
            setLoadErr(error ?? (found ? null : '사용자를 찾을 수 없습니다'));
            setIsLoading(false);
        });
    }, [userId, user]);

    useEffect(() => {
        if (!user) return;
        setFields({
            nickname:    user.nickname    ?? '',
            email:       user.email       ?? '',
            first_name:  user.first_name  ?? '',
            last_name:   user.last_name   ?? '',
            birth_year:  user.birth_year  ?? null,
            nationality: user.nationality ?? '',
            avatar_url:  user.avatar_url  ?? '',
        });
    }, [user]);

    const isSelf = userId === ADMIN_USER_ID;

    const handleSave = async () => {
        if (!userId) return;
        setSaving(true);
        setSaveErr(null);
        setSaveOk(false);
        const { data, error } = await adminUpdateUser(userId, fields);
        setSaving(false);
        if (error) { setSaveErr(error); return; }
        if (data) setUser(data);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
    };

    const handleDelete = async () => {
        if (!userId) return;
        setDeleting(true);
        setDeleteErr(null);
        const { error } = await adminDeleteUser(userId);
        setDeleting(false);
        if (error) { setDeleteErr(error); return; }
        navigate('/admin/editor/users', { replace: true });
    };

    const updateLeagueField = (idx: number, patch: Partial<AdminLeagueHistoryRow>) => {
        setLeagueRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
    };
    const updateTournamentField = (idx: number, patch: Partial<AdminTournamentHistoryRow>) => {
        setTournamentRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
    };

    const saveLeagueRow = async (row: AdminLeagueHistoryRow) => {
        const key = leagueKey(row);
        setRowSaving(s => ({ ...s, [key]: true }));
        setRowErr(s => ({ ...s, [key]: null }));
        const { error } = await adminUpdateLeagueHistory(row.group_id, row.user_id, row.season_number, {
            league_name: row.league_name, team_count: row.team_count,
            wins: row.wins, losses: row.losses,
            playoff_wins: row.playoff_wins, playoff_losses: row.playoff_losses,
            final_rank: row.final_rank, playoff_result: row.playoff_result,
        });
        setRowSaving(s => ({ ...s, [key]: false }));
        if (error) { setRowErr(s => ({ ...s, [key]: error })); return; }
        setRowSavedOk(s => ({ ...s, [key]: true }));
        setTimeout(() => setRowSavedOk(s => ({ ...s, [key]: false })), 2000);
    };

    const saveTournamentRow = async (row: AdminTournamentHistoryRow) => {
        const key = row.id;
        setRowSaving(s => ({ ...s, [key]: true }));
        setRowErr(s => ({ ...s, [key]: null }));
        const { error } = await adminUpdateTournamentHistory(row.id, {
            placement: row.placement, final_round: row.final_round,
            series_wins: row.series_wins, series_losses: row.series_losses,
            game_wins: row.game_wins, game_losses: row.game_losses,
            pts_for: row.pts_for, pts_against: row.pts_against,
        });
        setRowSaving(s => ({ ...s, [key]: false }));
        if (error) { setRowErr(s => ({ ...s, [key]: error })); return; }
        setRowSavedOk(s => ({ ...s, [key]: true }));
        setTimeout(() => setRowSavedOk(s => ({ ...s, [key]: false })), 2000);
    };

    const deleteLeagueRow = async (row: AdminLeagueHistoryRow) => {
        const key = leagueKey(row);
        setRowSaving(s => ({ ...s, [key]: true }));
        const { error } = await adminDeleteLeagueHistory(row.group_id, row.user_id, row.season_number);
        setRowSaving(s => ({ ...s, [key]: false }));
        if (error) { setRowErr(s => ({ ...s, [key]: error })); return; }
        setRowDeleteConfirm(null);
        setLeagueRows(rows => rows.filter(r => leagueKey(r) !== key));
    };

    const deleteTournamentRow = async (row: AdminTournamentHistoryRow) => {
        setRowSaving(s => ({ ...s, [row.id]: true }));
        const { error } = await adminDeleteTournamentHistory(row.id);
        setRowSaving(s => ({ ...s, [row.id]: false }));
        if (error) { setRowErr(s => ({ ...s, [row.id]: error })); return; }
        setRowDeleteConfirm(null);
        setTournamentRows(rows => rows.filter(r => r.id !== row.id));
    };

    const handleResetHistory = async () => {
        if (!userId) return;
        setResetting(true);
        setResetErr(null);
        const { error } = await adminResetUserHistory(userId);
        setResetting(false);
        if (error) { setResetErr(error); return; }
        setResetConfirm(false);
        setLeagueRows([]);
        setTournamentRows([]);
    };

    if (isLoading) {
        return <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-600" /></div>;
    }
    if (!user) {
        return <p className="text-sm text-red-400">{loadErr ?? '사용자를 찾을 수 없습니다'}</p>;
    }

    return (
        <div className="max-w-3xl space-y-6">
            <button onClick={() => navigate('/admin/editor/users')} className="text-slate-400 hover:text-white text-sm">
                ← 사용자 목록
            </button>

            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <div>
                    <h2 className="text-base font-black text-white ko-tight">{user.nickname || '(닉네임 없음)'}</h2>
                    <p className="text-xs text-slate-500 ko-normal mt-0.5">
                        ID {user.id}
                        {isSelf && <span className="ml-2 text-indigo-400 font-bold">고정 어드민 계정</span>}
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="닉네임">
                        <input
                            type="text"
                            value={fields.nickname ?? ''}
                            onChange={e => setFields(f => ({ ...f, nickname: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="이메일 (표시용 — 실제 로그인 계정은 변경되지 않음)">
                        <input
                            type="email"
                            value={fields.email ?? ''}
                            onChange={e => setFields(f => ({ ...f, email: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="성">
                        <input
                            type="text"
                            value={fields.last_name ?? ''}
                            onChange={e => setFields(f => ({ ...f, last_name: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="이름">
                        <input
                            type="text"
                            value={fields.first_name ?? ''}
                            onChange={e => setFields(f => ({ ...f, first_name: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="출생 연도">
                        <input
                            type="number"
                            value={fields.birth_year ?? ''}
                            onChange={e => setFields(f => ({ ...f, birth_year: e.target.value ? Number(e.target.value) : null }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="국적">
                        <input
                            type="text"
                            value={fields.nationality ?? ''}
                            onChange={e => setFields(f => ({ ...f, nationality: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <div className="sm:col-span-2">
                        <Field label="아바타 URL">
                            <input
                                type="text"
                                value={fields.avatar_url ?? ''}
                                onChange={e => setFields(f => ({ ...f, avatar_url: e.target.value }))}
                                className={inputClass}
                            />
                        </Field>
                    </div>
                </div>

                <p className="text-[11px] text-slate-600 ko-normal">
                    가입일 {new Date(user.created_at).toLocaleString('ko-KR')} · 최종 수정 {new Date(user.updated_at).toLocaleString('ko-KR')}
                </p>

                {saveErr && <p className="text-xs text-red-400 ko-normal">{saveErr}</p>}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                >
                    {saving
                        ? <><Loader2 size={13} className="animate-spin" />저장 중…</>
                        : saveOk
                        ? <><CheckCircle2 size={13} />저장됨</>
                        : <><Save size={13} />저장</>
                    }
                </button>
            </section>

            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white ko-tight">멀티플레이 전적</h2>
                    {!resetConfirm ? (
                        <button
                            onClick={() => setResetConfirm(true)}
                            disabled={historyLoading || (leagueRows.length === 0 && tournamentRows.length === 0)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-red-300 transition-colors"
                        >
                            <RotateCcw size={12} />
                            전적 초기화
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">전적을 전부 지울까요?</span>
                            <button
                                onClick={handleResetHistory}
                                disabled={resetting}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-colors"
                            >
                                {resetting ? <Loader2 size={12} className="animate-spin" /> : '확인'}
                            </button>
                            <button
                                onClick={() => { setResetConfirm(false); setResetErr(null); }}
                                disabled={resetting}
                                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs text-slate-300 transition-colors"
                            >
                                취소
                            </button>
                        </div>
                    )}
                </div>
                <p className="text-[11px] text-slate-600 ko-normal -mt-2">
                    "전적 초기화"는 아래 리그/토너먼트 기록을 모두 삭제합니다(홈 화면 "멀티플레이 전적"에 표시되는 것과 동일한 데이터). 되돌릴 수 없습니다.
                </p>

                {(historyErr || resetErr) && (
                    <p className="text-xs text-red-400 ko-normal">{historyErr ?? resetErr}</p>
                )}

                {historyLoading ? (
                    <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-600" /></div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">리그 ({leagueRows.length})</p>
                            {leagueRows.length === 0 ? (
                                <p className="text-xs text-slate-600">리그 참가 기록이 없습니다.</p>
                            ) : leagueRows.map((row, idx) => {
                                const key = leagueKey(row);
                                return (
                                    <div key={key} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <input
                                                type="text"
                                                value={row.league_name}
                                                onChange={e => updateLeagueField(idx, { league_name: e.target.value })}
                                                className={`${miniInputClass} font-bold flex-1`}
                                            />
                                            <span className="text-[11px] text-slate-500 whitespace-nowrap">시즌 {row.season_number} · {row.tier.toUpperCase()}</span>
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                            <Field label="참가팀 수">
                                                <input type="number" value={row.team_count}
                                                    onChange={e => updateLeagueField(idx, { team_count: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="정규시즌 W">
                                                <input type="number" value={row.wins}
                                                    onChange={e => updateLeagueField(idx, { wins: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="정규시즌 L">
                                                <input type="number" value={row.losses}
                                                    onChange={e => updateLeagueField(idx, { losses: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="플레이오프 W">
                                                <input type="number" value={row.playoff_wins}
                                                    onChange={e => updateLeagueField(idx, { playoff_wins: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="플레이오프 L">
                                                <input type="number" value={row.playoff_losses}
                                                    onChange={e => updateLeagueField(idx, { playoff_losses: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="최종 순위">
                                                <input type="number" value={row.final_rank ?? ''}
                                                    onChange={e => updateLeagueField(idx, { final_rank: e.target.value ? Number(e.target.value) : null })}
                                                    className={miniInputClass} />
                                            </Field>
                                        </div>
                                        <div className="flex items-end justify-between gap-2">
                                            <div className="w-48">
                                                <Field label="플레이오프 결과">
                                                    <select
                                                        value={row.playoff_result ?? ''}
                                                        onChange={e => updateLeagueField(idx, { playoff_result: e.target.value || null })}
                                                        className={miniInputClass}
                                                    >
                                                        <option value="">—</option>
                                                        {PLAYOFF_RESULT_OPTIONS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </Field>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {rowErr[key] && <span className="text-[11px] text-red-400">{rowErr[key]}</span>}
                                                {rowDeleteConfirm === key ? (
                                                    <>
                                                        <span className="text-[11px] text-slate-400">삭제할까요?</span>
                                                        <button onClick={() => deleteLeagueRow(row)} disabled={rowSaving[key]}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-[11px] font-bold text-white transition-colors">확인</button>
                                                        <button onClick={() => setRowDeleteConfirm(null)} disabled={rowSaving[key]}
                                                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-[11px] text-slate-300 transition-colors">취소</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setRowDeleteConfirm(key)}
                                                        className="p-1.5 bg-slate-800 hover:bg-red-600 rounded-lg text-slate-400 hover:text-white transition-colors">
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => saveLeagueRow(row)}
                                                    disabled={rowSaving[key]}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-[11px] font-bold text-white transition-colors"
                                                >
                                                    {rowSaving[key]
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : rowSavedOk[key]
                                                        ? <CheckCircle2 size={11} />
                                                        : <Save size={11} />
                                                    }
                                                    저장
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">토너먼트 ({tournamentRows.length})</p>
                            {tournamentRows.length === 0 ? (
                                <p className="text-xs text-slate-600">토너먼트 참가 기록이 없습니다.</p>
                            ) : tournamentRows.map((row, idx) => {
                                const key = row.id;
                                return (
                                    <div key={key} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 space-y-2">
                                        <p className="text-sm font-bold text-white">{row.tournament_archives?.name ?? '토너먼트'}</p>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                            <Field label="최종 순위">
                                                <input type="number" value={row.placement}
                                                    onChange={e => updateTournamentField(idx, { placement: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="최종 라운드">
                                                <input type="number" value={row.final_round}
                                                    onChange={e => updateTournamentField(idx, { final_round: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="시리즈 W">
                                                <input type="number" value={row.series_wins}
                                                    onChange={e => updateTournamentField(idx, { series_wins: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="시리즈 L">
                                                <input type="number" value={row.series_losses}
                                                    onChange={e => updateTournamentField(idx, { series_losses: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="경기 W">
                                                <input type="number" value={row.game_wins}
                                                    onChange={e => updateTournamentField(idx, { game_wins: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                            <Field label="경기 L">
                                                <input type="number" value={row.game_losses}
                                                    onChange={e => updateTournamentField(idx, { game_losses: Number(e.target.value) || 0 })}
                                                    className={miniInputClass} />
                                            </Field>
                                        </div>
                                        <div className="flex items-end justify-between gap-2">
                                            <div className="grid grid-cols-2 gap-2 w-48">
                                                <Field label="득점">
                                                    <input type="number" value={row.pts_for}
                                                        onChange={e => updateTournamentField(idx, { pts_for: Number(e.target.value) || 0 })}
                                                        className={miniInputClass} />
                                                </Field>
                                                <Field label="실점">
                                                    <input type="number" value={row.pts_against}
                                                        onChange={e => updateTournamentField(idx, { pts_against: Number(e.target.value) || 0 })}
                                                        className={miniInputClass} />
                                                </Field>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {rowErr[key] && <span className="text-[11px] text-red-400">{rowErr[key]}</span>}
                                                {rowDeleteConfirm === key ? (
                                                    <>
                                                        <span className="text-[11px] text-slate-400">삭제할까요?</span>
                                                        <button onClick={() => deleteTournamentRow(row)} disabled={rowSaving[key]}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-[11px] font-bold text-white transition-colors">확인</button>
                                                        <button onClick={() => setRowDeleteConfirm(null)} disabled={rowSaving[key]}
                                                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-[11px] text-slate-300 transition-colors">취소</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setRowDeleteConfirm(key)}
                                                        className="p-1.5 bg-slate-800 hover:bg-red-600 rounded-lg text-slate-400 hover:text-white transition-colors">
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => saveTournamentRow(row)}
                                                    disabled={rowSaving[key]}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-[11px] font-bold text-white transition-colors"
                                                >
                                                    {rowSaving[key]
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : rowSavedOk[key]
                                                        ? <CheckCircle2 size={11} />
                                                        : <Save size={11} />
                                                    }
                                                    저장
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

            {!isSelf && (
                <section className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-bold text-red-300 flex items-center gap-2">
                        <Trash2 size={14} className="text-red-400" />
                        계정 삭제
                    </h2>
                    <p className="text-xs text-slate-400 ko-normal leading-relaxed">
                        이 계정을 완전히 삭제합니다. 로그인 계정과 프로필이 삭제되고, 현재 보유 중인 팀은
                        자동으로 반환됩니다. 되돌릴 수 없습니다.
                    </p>

                    {!deleteConfirm ? (
                        <button
                            onClick={() => setDeleteConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-bold text-white transition-colors"
                        >
                            <Trash2 size={13} />
                            계정 삭제
                        </button>
                    ) : (
                        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-white ko-tight">정말 삭제하시겠습니까?</p>
                            <p className="text-xs text-slate-400 ko-normal">
                                "{user.nickname || user.email || user.id}" 계정이 영구적으로 삭제됩니다.
                            </p>
                            {deleteErr && <p className="text-xs text-red-400 ko-normal">{deleteErr}</p>}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    {deleting
                                        ? <><Loader2 size={13} className="animate-spin" />삭제 중…</>
                                        : <><Trash2 size={13} />삭제 실행</>
                                    }
                                </button>
                                <button
                                    onClick={() => { setDeleteConfirm(false); setDeleteErr(null); }}
                                    disabled={deleting}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-sm text-slate-300 transition-colors"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default AdminUserDetailPage;
