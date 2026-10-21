// DmNewConversation.tsx — 새 대화 상대 고르기(채팅 위젯 우측). 계획: docs/plan/league-chat-plan.md "DM 2차 확정안"
//
// 후보 = 같은 방의 사람 참가자(list_dm_candidates — 나·AI 팀 제외, 관전자는 멤버가 아니라 애초에 없음).
// 이미 대화 중인 상대(좌측 DM 목록에 있는 사람)는 목록에서 뺀다. 고르면 그 상대와의 대화창이 열린다(첫 메시지를 보내야 목록에 생김).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../common/IconButton';
import { EmptyState } from '../../common/EmptyState';
import { Spinner } from '../../common/Spinner';
import { Button } from '../../common/Button';
import { listDmCandidates, type DmCandidate } from '../../../services/multi/chatService';
import type { DmPeer } from '../../../hooks/useLeagueDm';
import { ChatAvatar } from './ChatThread';

interface Props {
    roomId: string;
    /** 이미 대화 중인 상대 user_id */
    excludeUserIds: ReadonlySet<string>;
    onlineUserIds: ReadonlySet<string>;
    onPick: (peer: DmPeer) => void;
    onClose: () => void;
}

export const DmNewConversation: React.FC<Props> = ({ roomId, excludeUserIds, onlineUserIds, onPick, onClose }) => {
    const [candidates, setCandidates] = useState<DmCandidate[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [tick, setTick] = useState(0);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        listDmCandidates(roomId)
            .then(rows => { if (!cancelled) { setCandidates(rows); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, [roomId, tick]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const available = useMemo(() => candidates.filter(c => !excludeUserIds.has(c.user_id)), [candidates, excludeUserIds]);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return available;
        return available.filter(c => c.nickname.toLowerCase().includes(q) || (c.team_name ?? '').toLowerCase().includes(q));
    }, [available, query]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between h-[52px] pl-4 pr-2.5 border-b border-slate-800 shrink-0">
                <span className="text-sm font-bold text-white">새 대화</span>
                <IconButton label="새 대화 닫기" size="lg" tone="ghost" onClick={onClose}><X size={16} /></IconButton>
            </div>

            <div className="px-4 pt-3 pb-2 shrink-0">
                <label htmlFor="dm-candidate-search" className="sr-only">참가자 검색</label>
                <input
                    id="dm-candidate-search"
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="닉네임 또는 팀 이름"
                    className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950/40 px-3 text-sm text-slate-100 placeholder:text-slate-500 ko-normal focus:outline-none focus:border-indigo-400"
                />
            </div>

            {status === 'ready' && available.length > 0 && (
                <div className="px-4 pt-1 pb-1.5 text-xs font-bold text-slate-500 shrink-0">참가자 {available.length}명</div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-2">
                {status === 'loading' && <Spinner variant="section" />}
                {status === 'error' && (
                    <EmptyState
                        padding="sm"
                        title="참가자 목록을 불러오지 못했어요"
                        action={<Button variant="secondary" size="sm" onClick={() => setTick(t => t + 1)}>다시 시도</Button>}
                    />
                )}
                {status === 'ready' && available.length === 0 && (
                    <EmptyState padding="sm" title="새로 대화할 수 있는 참가자가 없어요" />
                )}
                {status === 'ready' && available.length > 0 && shown.length === 0 && (
                    <EmptyState padding="sm" title="검색 결과가 없어요" />
                )}
                {status === 'ready' && shown.map(c => (
                    <button
                        key={c.user_id}
                        type="button"
                        onClick={() => onPick({ userId: c.user_id, name: c.nickname, teamId: c.team_id, teamAbbr: c.team_abbr, teamName: c.team_name })}
                        className="w-full min-h-[48px] flex items-center gap-3 px-2 py-1.5 rounded-lg text-left hover:bg-slate-800/60 transition-colors"
                    >
                        <ChatAvatar teamId={c.team_id} teamName={c.team_name} online={onlineUserIds.has(c.user_id)} size="sm" />
                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-slate-200 truncate ko-normal">{c.nickname}</span>
                            {c.team_name && <span className="text-xs font-medium text-slate-400 truncate ko-normal">{c.team_name}</span>}
                        </span>
                    </button>
                ))}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-800 text-xs text-slate-500 shrink-0">AI 팀과 관전자에게는 보낼 수 없어요.</div>
        </div>
    );
};
