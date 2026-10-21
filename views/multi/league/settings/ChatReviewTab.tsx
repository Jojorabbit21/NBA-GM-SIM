/**
 * ChatReviewTab — 세션 설정 "신고" 탭 (세션 오너·전역 어드민 전용, 읽기 전용). [2026-10-21] "채팅 검수" → "신고"로 이름 변경
 *
 * [2026-10-21] 계획: docs/plan/league-chat-plan.md "DM 2차 확정안" 3-a/3-b/3-e. 서버: migrations/league_chat_review.sql
 * - 신고 내역: league_chat_reports 최신순(사유 다중, 신고자). 신고해도 처리는 일어나지 않는다(기록만).
 * - 메시지 검색: 본문 부분 일치 + 채널(전체/퍼블릭/DM) + 참가자(보낸 사람 또는 받는 사람) 필터, 공용 Pagination(50건/페이지).
 * - 앞뒤 보기: 신고·검색 결과의 메시지와 같은 채널에서 앞 30건 + 뒤 30건(신고 문구는 실마리일 뿐 — 맥락은 여기서 본다).
 * - 열람 범위: 퍼블릭은 오너·어드민 모두 전부. DM은 전역 어드민만 전부, 세션 오너는 신고가 접수된 대화만.
 * 실시간 구독 없음 — "새로고침"으로 다시 불러온다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Flag, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../../components/common/Button';
import { InlineNotice } from '../../../../components/common/InlineNotice';
import { Badge } from '../../../../components/common/Badge';
import { SegmentedControl } from '../../../../components/common/SegmentedControl';
import { Spinner } from '../../../../components/common/Spinner';
import { TableEmptyRow } from '../../../../components/common/EmptyState';
import { Pagination } from '../../../../components/common/Pagination';
import type { LeagueTeamRow, RoomRow } from '../../../../services/multi/roomQueries';
import {
    CHAT_REVIEW_PAGE_SIZE, chatReviewErrorMessage, fetchChatContext, listChatReports, reportReasonsText, searchChatMessages,
    type ChatReportRow, type ChatReviewChannel, type ChatReviewMessage,
} from '../../../../services/multi/chatReviewService';

interface Props {
    room: RoomRow | null;
    leagueTeams: LeagueTeamRow[];
    isGlobalAdmin: boolean;
}

type Mode = 'reports' | 'search';

const fmtDateTime = (iso: string): string => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const TH = 'text-left py-2 pr-3 text-sm font-bold text-slate-400 whitespace-nowrap';
const TD = 'py-2.5 pr-3 align-top';
const FIELD = 'bg-slate-900 border border-slate-700 rounded-lg px-2.5 h-8 text-sm text-white focus:outline-none focus:border-indigo-500';

/** 채널 표시 — 퍼블릭 / DM(보낸 사람 → 받는 사람) */
const ChannelCell: React.FC<{ recipientName: string | null; isDm: boolean }> = ({ recipientName, isDm }) => (
    isDm
        ? <span className="text-sm font-medium text-amber-300 whitespace-nowrap ko-normal">DM → {recipientName ?? '?'}</span>
        : <span className="text-sm font-medium text-slate-400 whitespace-nowrap"># 퍼블릭</span>
);

const PersonCell: React.FC<{ name: string; team: string | null }> = ({ name, team }) => (
    <div className="flex flex-col">
        <span className="text-sm font-semibold text-slate-200 ko-normal whitespace-nowrap">{name}</span>
        {team && <span className="text-xs font-medium text-slate-500 ko-normal whitespace-nowrap">{team}</span>}
    </div>
);

const BodyCell: React.FC<{ body: string }> = ({ body }) => (
    <p className="text-sm text-slate-200 ko-normal whitespace-pre-wrap [overflow-wrap:anywhere] max-w-[420px]">{body}</p>
);

export const ChatReviewTab: React.FC<Props> = ({ room, leagueTeams, isGlobalAdmin }) => {
    const roomId = room?.id ?? null;
    const [mode, setMode] = useState<Mode>('reports');

    // ── 신고 내역 ──
    const [reports, setReports] = useState<ChatReportRow[]>([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [reportsHasMore, setReportsHasMore] = useState(false);
    const [reportsErr, setReportsErr] = useState<{ more: boolean; text: string } | null>(null);

    // ── 검색 ──
    const [query, setQuery] = useState('');
    const [channel, setChannel] = useState<ChatReviewChannel>('all');
    const [userId, setUserId] = useState('');
    const [applied, setApplied] = useState<{ query: string; channel: ChatReviewChannel; userId: string }>({ query: '', channel: 'all', userId: '' });
    const [results, setResults] = useState<ChatReviewMessage[]>([]);
    const [searchPage, setSearchPage] = useState(1);
    const [searchTotal, setSearchTotal] = useState(0);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchErr, setSearchErr] = useState<string | null>(null);

    // ── 앞뒤 보기 ──
    const [context, setContext] = useState<{ targetId: number; label: string } | null>(null);
    const [contextRows, setContextRows] = useState<ChatReviewMessage[]>([]);
    const [contextLoading, setContextLoading] = useState(false);
    const [contextErr, setContextErr] = useState<string | null>(null);

    const loadReports = useCallback(async (beforeId: number | null) => {
        if (!roomId) return;
        setReportsLoading(true);
        setReportsErr(null);
        try {
            const rows = await listChatReports(roomId, beforeId);
            setReports(prev => (beforeId ? [...prev, ...rows] : rows));
            setReportsHasMore(rows.length === CHAT_REVIEW_PAGE_SIZE);
        } catch (e) {
            setReportsErr({ more: !!beforeId, text: chatReviewErrorMessage(e) });
        } finally {
            setReportsLoading(false);
        }
    }, [roomId]);

    const loadSearch = useCallback(async () => {
        if (!roomId) return;
        setSearchLoading(true);
        setSearchErr(null);
        try {
            const { rows, total } = await searchChatMessages(roomId, {
                query: applied.query, channel: applied.channel, userId: applied.userId || null, page: searchPage,
            });
            setResults(rows);
            // 페이지가 범위를 넘으면(새 검색으로 결과가 줄어든 경우 등) 행이 없어 total도 0 — 그때는 이전 total 유지 대신 1페이지로
            if (rows.length === 0 && searchPage > 1) { setSearchPage(1); return; }
            setSearchTotal(total);
        } catch (e) {
            setSearchErr(chatReviewErrorMessage(e));
        } finally {
            setSearchLoading(false);
        }
    }, [roomId, applied, searchPage]);

    useEffect(() => { void loadReports(null); }, [loadReports]);
    useEffect(() => { if (mode === 'search') void loadSearch(); }, [mode, loadSearch]);

    const openContext = useCallback(async (messageId: number, label: string) => {
        if (!roomId) return;
        setContext({ targetId: messageId, label });
        setContextRows([]);
        setContextErr(null);
        setContextLoading(true);
        try {
            setContextRows(await fetchChatContext(roomId, messageId));
        } catch (e) {
            setContextErr(chatReviewErrorMessage(e));
        } finally {
            setContextLoading(false);
        }
    }, [roomId]);

    const submitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setApplied({ query, channel, userId });
        setSearchPage(1);
    };

    const refresh = () => {
        if (context) { void openContext(context.targetId, context.label); return; }
        if (mode === 'reports') void loadReports(null); else void loadSearch();
    };

    const participants = [...leagueTeams]
        .filter(t => !!t.user_id)
        .sort((a, b) => a.team_abbr.localeCompare(b.team_abbr));

    const channelLabel = (m: { recipient_id: string | null; author_name: string; recipient_name: string | null }) =>
        m.recipient_id ? `DM · ${m.author_name} ↔ ${m.recipient_name ?? '?'}` : '# 퍼블릭';

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Flag size={16} className="text-indigo-300" />
                <h3 className="text-sm font-bold text-white ko-tight">신고</h3>
                <span className="text-xs text-slate-500 ko-normal">신고 내역과 채팅 메시지 검색. 신고해도 자동 처리는 없어요(기록만).</span>
                <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                    onClick={refresh}
                    isLoading={reportsLoading || searchLoading || contextLoading}
                    icon={<RefreshCw size={12} />}
                >
                    새로고침
                </Button>
            </div>

            {!isGlobalAdmin && (
                <InlineNotice tone="info">DM은 신고가 접수된 대화만 볼 수 있어요. 전체 DM 검색은 전역 어드민만 할 수 있어요.</InlineNotice>
            )}

            {context ? (
                // ── 앞뒤 보기 ──
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Button variant="link" size="sm" icon={<ArrowLeft size={14} />} onClick={() => setContext(null)}>목록으로</Button>
                        <span className="text-sm font-bold text-slate-200 ko-normal">{context.label}</span>
                        <span className="text-xs text-slate-500 ko-normal">선택한 메시지 앞뒤 최대 30건씩</span>
                    </div>
                    {contextLoading && <Spinner variant="section" />}
                    {contextErr && <InlineNotice tone="danger">{contextErr}</InlineNotice>}
                    {!contextLoading && !contextErr && (
                        <ol className="flex flex-col border border-slate-800 rounded-xl overflow-hidden">
                            {contextRows.map(m => {
                                const target = m.id === context.targetId;
                                return (
                                    <li
                                        key={m.id}
                                        aria-current={target ? 'true' : undefined}
                                        className={`grid grid-cols-[120px_140px_minmax(0,1fr)_auto] gap-3 px-3 py-2 border-b border-slate-800 last:border-b-0 ${target ? 'bg-indigo-500/10' : ''}`}
                                    >
                                        <span className="text-xs font-medium text-slate-500 tabular-nums pt-0.5">{fmtDateTime(m.created_at)}</span>
                                        <PersonCell name={m.author_name} team={m.author_team} />
                                        <BodyCell body={m.body} />
                                        <span className="flex items-start gap-1">
                                            {target && <Badge variant="brand" size="sm">선택</Badge>}
                                            {m.reported && <Badge variant="danger" size="sm">신고됨</Badge>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            ) : (
                <>
                    <SegmentedControl<Mode>
                        size="sm"
                        value={mode}
                        onChange={setMode}
                        aria-label="검수 보기"
                        options={[
                            { value: 'reports', label: '신고 내역' },
                            { value: 'search', label: '메시지 검색' },
                        ]}
                    />

                    {mode === 'reports' ? (
                        reportsErr && !reportsErr.more ? (
                            <div className="flex flex-col items-start gap-3 py-4">
                                <InlineNotice tone="danger">{reportsErr.text}</InlineNotice>
                                <Button variant="secondary" size="sm" onClick={() => void loadReports(null)}>다시 불러오기</Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className={TH}>신고 시각</th>
                                            <th className={TH}>채널</th>
                                            <th className={TH}>작성자</th>
                                            <th className={TH}>메시지</th>
                                            <th className={TH}>사유</th>
                                            <th className={TH}>신고자</th>
                                            <th className={TH} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reports.length === 0 && !reportsLoading && (
                                            <TableEmptyRow colSpan={7}>접수된 신고가 없습니다.</TableEmptyRow>
                                        )}
                                        {reports.map(r => (
                                            <tr key={r.report_id} className="border-b border-slate-800">
                                                <td className={`${TD} text-sm font-medium text-slate-400 tabular-nums whitespace-nowrap`}>{fmtDateTime(r.reported_at)}</td>
                                                <td className={TD}><ChannelCell isDm={!!r.recipient_id} recipientName={r.recipient_name} /></td>
                                                <td className={TD}><PersonCell name={r.author_name} team={r.author_team} /></td>
                                                <td className={TD}>
                                                    <BodyCell body={r.body} />
                                                    <span className="text-xs text-slate-500 tabular-nums">작성 {fmtDateTime(r.message_at)}</span>
                                                </td>
                                                <td className={TD}>
                                                    <span className="text-sm font-medium text-slate-200 ko-normal">{reportReasonsText(r.reasons)}</span>
                                                </td>
                                                <td className={TD}><PersonCell name={r.reporter_name} team={r.reporter_team} /></td>
                                                <td className={`${TD} text-right`}>
                                                    <Button variant="secondary" size="xs" onClick={() => void openContext(r.message_id, channelLabel(r))}>앞뒤 보기</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {reportsLoading && reports.length === 0 && <Spinner variant="section" />}
                                {reportsHasMore && (
                                    <div className="flex items-center gap-3 pt-3">
                                        <Button variant="secondary" size="sm" isLoading={reportsLoading} onClick={() => void loadReports(reports[reports.length - 1]?.report_id ?? null)}>더 보기</Button>
                                        {reportsErr?.more && <InlineNotice tone="danger" size="sm">{reportsErr.text}</InlineNotice>}
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="space-y-3">
                            <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                                <label htmlFor="chat-review-query" className="sr-only">검색어</label>
                                <input
                                    id="chat-review-query"
                                    type="search"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="메시지 내용 검색"
                                    className={`${FIELD} w-64 placeholder:text-slate-500`}
                                />
                                <label htmlFor="chat-review-channel" className="sr-only">채널</label>
                                <select id="chat-review-channel" value={channel} onChange={e => setChannel(e.target.value as ChatReviewChannel)} className={FIELD}>
                                    <option value="all">전체 채널</option>
                                    <option value="public">퍼블릭</option>
                                    <option value="dm">DM</option>
                                </select>
                                <label htmlFor="chat-review-user" className="sr-only">참가자</label>
                                <select id="chat-review-user" value={userId} onChange={e => setUserId(e.target.value)} className={FIELD}>
                                    <option value="">전체 참가자</option>
                                    {participants.map(t => <option key={t.id} value={t.user_id ?? ''}>{t.team_abbr} · {t.team_name}</option>)}
                                </select>
                                <Button type="submit" variant="primary" size="md" icon={<Search size={14} />} isLoading={searchLoading}>검색</Button>
                                <span className="text-xs text-slate-500 ko-normal ml-auto">최신순</span>
                            </form>

                            {searchErr ? (
                                <div className="flex flex-col items-start gap-3 py-4">
                                    <InlineNotice tone="danger">{searchErr}</InlineNotice>
                                    <Button variant="secondary" size="sm" onClick={() => void loadSearch()}>다시 불러오기</Button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-800">
                                                <th className={TH}>시각</th>
                                                <th className={TH}>채널</th>
                                                <th className={TH}>작성자</th>
                                                <th className={TH}>메시지</th>
                                                <th className={TH} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {results.length === 0 && !searchLoading && (
                                                <TableEmptyRow colSpan={5}>검색 결과가 없습니다.</TableEmptyRow>
                                            )}
                                            {results.map(m => (
                                                <tr key={m.id} className="border-b border-slate-800">
                                                    <td className={`${TD} text-sm font-medium text-slate-400 tabular-nums whitespace-nowrap`}>{fmtDateTime(m.created_at)}</td>
                                                    <td className={TD}><ChannelCell isDm={!!m.recipient_id} recipientName={m.recipient_name} /></td>
                                                    <td className={TD}><PersonCell name={m.author_name} team={m.author_team} /></td>
                                                    <td className={TD}>
                                                        <div className="flex items-start gap-2">
                                                            <BodyCell body={m.body} />
                                                            {m.reported && <Badge variant="danger" size="sm" className="shrink-0">신고됨</Badge>}
                                                        </div>
                                                    </td>
                                                    <td className={`${TD} text-right`}>
                                                        <Button variant="secondary" size="xs" onClick={() => void openContext(m.id, channelLabel(m))}>앞뒤 보기</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {searchLoading && results.length === 0 && <Spinner variant="section" />}
                                    {searchTotal > 0 && (
                                        <Pagination
                                            page={searchPage}
                                            pageSize={CHAT_REVIEW_PAGE_SIZE}
                                            totalItems={searchTotal}
                                            onPageChange={setSearchPage}
                                            unit="건"
                                            className="mt-3"
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
