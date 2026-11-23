import React from 'react';
import { BackChevron } from '../../components/home/homeIcons';

// [2026-11-23] Quick Game 상단 바 — [← QUICK GAME] [단계 표시] [동작 버튼].
// 단계 표시는 홈 가입/비밀번호 찾기의 Stepper(components/home/HomeAuth.tsx)와 같은 모양(위쪽 2px 선 + "번호 이름").
export const QUICK_STEPS = ['팀·선수 선택', '전술 설정', '경기 진행', '경기 결과'] as const;

interface QuickGameHeaderProps {
    /** 0-based 현재 단계 */
    step: number;
    onBack: () => void;
    /** 이미 지나온 단계를 누르면 그 단계로(지나오지 않은 단계는 비활성) */
    onStepClick?: (step: number) => void;
    /** 단계를 누를 수 있는 최대 index(포함) */
    maxClickableStep?: number;
    actions?: React.ReactNode;
    compact?: boolean;
}

export const QuickGameHeader: React.FC<QuickGameHeaderProps> = ({ step, onBack, onStepClick, maxClickableStep = -1, actions, compact = false }) => (
    <header className={`shrink-0 bg-slate-900 border-b border-slate-800 ${compact ? 'px-2 pt-1 pb-2' : 'h-16 px-4'} flex ${compact ? 'flex-col gap-1' : 'items-center gap-6'}`}>
        <div className={`flex items-center justify-between gap-3 ${compact ? 'h-12' : 'shrink-0'}`}>
            <button type="button" onClick={onBack} aria-label="홈으로 돌아가기" className="h-11 px-2 flex items-center gap-3 text-white hover:text-slate-300 transition-colors">
                <BackChevron />
                <span className="font-display text-2xl leading-none tracking-[0.03em] whitespace-nowrap">Quick Game</span>
            </button>
            {compact && actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        <ol className={`flex text-xs font-bold gap-1.5 ${compact ? 'px-2' : 'flex-1 max-w-[640px] mx-auto'}`}>
            {QUICK_STEPS.map((name, i) => {
                const clickable = !!onStepClick && i !== step && i <= maxClickableStep;
                const tone = i === step ? 'border-[#00D492] text-[#00D492]' : i < step ? 'border-slate-500 text-slate-300' : 'border-slate-700 text-slate-500';
                return (
                    <li key={name} aria-current={i === step ? 'step' : undefined} className={`flex-1 min-w-0 border-t-2 ${tone}`}>
                        {clickable ? (
                            <button type="button" onClick={() => onStepClick!(i)} className="w-full pt-1.5 text-left truncate hover:text-white transition-colors">
                                {i + 1} {name}
                            </button>
                        ) : (
                            <span className="block pt-1.5 truncate">{i + 1} {name}</span>
                        )}
                    </li>
                );
            })}
        </ol>
        {!compact && <div className="shrink-0 flex items-center gap-2 min-w-[180px] justify-end">{actions}</div>}
    </header>
);
