
import React from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Team } from '../../types';
import { useSaveSummary } from '../../hooks/useSaveSummary';
import { SingleSaveCard } from './SingleSaveCard';
import { MultiPlayCard } from './MultiPlayCard';
import { LogOut, User } from 'lucide-react';
import { APP_NAME, APP_YEAR } from '../../utils/constants';

interface LobbyPanelProps {
    session:      Session;
    teams:        Team[];
    nickname:     string;
    onContinue:   () => void;
    onNewGame:    () => void;
    onLogout:     () => void;
}

export const LobbyPanel: React.FC<LobbyPanelProps> = ({
    session, teams, nickname, onContinue, onNewGame, onLogout,
}) => {
    const { data: summary, isLoading } = useSaveSummary(session.user.id);
    const email = session.user.email ?? '';
    const savedTeam = summary ? teams.find(t => t.id === summary.teamId) : undefined;
    const initial = (nickname || email).charAt(0).toUpperCase();

    return (
        <div className="w-full max-w-2xl space-y-5 animate-in fade-in zoom-in-95 duration-300 pretendard">

            {/* 앱 타이틀 */}
            <div className="text-center mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em]">
                    {APP_NAME} · {APP_YEAR}
                </p>
            </div>

            {/* 프로필 섹션 */}
            <div className="flex items-center gap-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4">
                {/* 아바타 */}
                <div className="w-11 h-11 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0 select-none">
                    {initial || <User size={20} />}
                </div>

                {/* 유저 정보 */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{nickname || 'GM'}</p>
                    <p className="text-xs text-slate-500 truncate">{email}</p>
                </div>

                {/* 로그아웃 */}
                <button
                    onClick={onLogout}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 shrink-0"
                >
                    <LogOut size={13} />
                    <span className="ko-normal">로그아웃</span>
                </button>
            </div>

            {/* 모드 카드 */}
            <div className="grid grid-cols-2 gap-4">
                {isLoading ? (
                    <SkeletonCard />
                ) : (
                    <SingleSaveCard
                        summary={summary ?? null}
                        teamName={savedTeam?.name}
                        teamLogo={savedTeam?.logo}
                        onContinue={onContinue}
                        onNewGame={onNewGame}
                    />
                )}
                <MultiPlayCard />
            </div>
        </div>
    );
};

const SkeletonCard: React.FC = () => (
    <div className="rounded-2xl bg-slate-700/30 animate-pulse h-56" />
);
