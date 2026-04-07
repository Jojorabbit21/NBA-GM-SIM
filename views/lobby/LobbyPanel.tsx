
import React from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Team } from '../../types';
import { useSaveSummary } from '../../hooks/useSaveSummary';
import { SingleSaveCard } from './SingleSaveCard';
import { MultiPlayCard } from './MultiPlayCard';

interface LobbyPanelProps {
    session:      Session;
    teams:        Team[];
    nickname:     string;
    onContinue:   () => void;   // setPlayMode('single') + navigate('/')
    onNewGame:    () => void;   // setPlayMode('single') + navigate('/')
    onLogout:     () => void;
}

export const LobbyPanel: React.FC<LobbyPanelProps> = ({
    session, teams, nickname, onContinue, onNewGame, onLogout,
}) => {
    const { data: summary, isLoading } = useSaveSummary(session.user.id);

    const savedTeam = summary
        ? teams.find(t => t.id === summary.teamId)
        : undefined;

    return (
        <div className="w-full max-w-3xl animate-in fade-in zoom-in-95 duration-300">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-slate-300 ko-normal">
                    안녕하세요,{' '}
                    <span className="font-semibold text-white">{nickname}</span>
                </p>
                <button
                    onClick={onLogout}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors ko-normal"
                >
                    로그아웃
                </button>
            </div>

            {/* 카드 영역 */}
            <div className="flex gap-5">
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
    <div className="w-72 bg-slate-800/20 border border-slate-700/30 rounded-3xl p-8 shrink-0 animate-pulse">
        <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-700/50" />
            <div className="space-y-2">
                <div className="h-4 w-32 bg-slate-700/50 rounded" />
                <div className="h-3 w-20 bg-slate-700/40 rounded" />
            </div>
            <div className="border-t border-slate-700/30 pt-3 space-y-2">
                <div className="h-5 w-16 bg-slate-700/50 rounded" />
                <div className="h-3 w-24 bg-slate-700/30 rounded" />
            </div>
        </div>
    </div>
);
