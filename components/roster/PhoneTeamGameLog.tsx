// PhoneTeamGameLog.tsx — 폰(<768) 팀 화면 "경기 기록" 탭, 카드형. [2026-10-27 모바일 팀 화면]
// docs/ui/mobile-design-system.md §9-1-4(확정), 캔버스 6행 G1·G2. 데스크톱 TeamGameLog 표의 셀 디자인을 카드 2줄로 이식:
//   상단 줄 44(스크롤 밖 고정: "N경기" + 우측 "필터" → 바텀 시트: 정렬 최신순/오래된순(라디오) · 구분 정규 시즌/플레이오프(체크박스)) →
//   섹션 머리 32("정규 시즌" + 전적) → 경기 카드. 평균 카드 없음(2026-10-27 사용자 지시로 제거).
//   카드 1줄 40 = 날짜 14/500 slate-400 · vs/@ + 상대 14/600 slate-300 · W/L emerald-400/red-400 · 스코어 emerald-300/red-300 밑줄(탭 = 경기 상세)
//   카드 2줄 = PTS · FG% · 3P% · FT% 4등분, 라벨 12/700 slate-400 위 + 값 14/500 아래. 펼치기 없음.
//   행 생성은 TeamGameLog.tsx에서 export한 buildTeamGameRows(데스크톱과 동일 숫자).
import React, { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Team, Game } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { BottomSheet, SheetOptionRow, SheetGroupTitle } from '../mobile/BottomSheet';
import { buildTeamGameRows, type TeamGameRow } from './TeamGameLog';

interface PhoneTeamGameLogProps {
    team: Team;
    schedule: Game[];
    allTeams: Team[];
    /** 스코어/1줄 탭 → 경기 상세(멀티 MultiGamePbpView). */
    onScoreClick?: (gameId: string) => void;
}

type SortOrder = 'newest' | 'oldest';

const STAT4: { key: string; label: string }[] = [
    { key: 'pts', label: 'PTS' }, { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' },
];
const fmt = (key: string, v: number) => key.includes('%') ? `${(v * 100).toFixed(1)}%` : String(Math.round(v));

const GameCard: React.FC<{ row: TeamGameRow; oppName: string; onClick?: () => void }> = ({ row, oppName, onClick }) => (
    <article className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <button type="button" onClick={onClick} disabled={!onClick} className="w-full h-10 px-3 flex items-center gap-2.5 text-left active:bg-white/5 disabled:cursor-default">
            <span className="w-11 shrink-0 text-sm font-medium text-slate-400 tabular-nums">{row.date.slice(5).replace('-', '/')}</span>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="shrink-0 text-sm font-medium text-slate-400">{row.isHome ? 'vs' : '@'}</span>
                <span className="text-sm font-semibold text-slate-300 truncate">{oppName}</span>
            </span>
            <span className={`shrink-0 text-sm font-medium ${row.isWin ? 'text-emerald-400' : 'text-red-400'}`}>{row.isWin ? 'W' : 'L'}</span>
            <span className={`shrink-0 min-w-[56px] text-right text-sm font-medium tabular-nums underline decoration-white/25 ${row.isWin ? 'text-emerald-300' : 'text-red-300'}`}>{row.myScore}-{row.oppScore}</span>
        </button>
        <div className="grid grid-cols-4 px-3 py-2 border-t border-slate-800">
            {STAT4.map(c => (
                <span key={c.key} className="flex flex-col items-center gap-0.5 min-w-0">
                    <span className="text-xs font-bold text-slate-400">{c.label}</span>
                    <span className="text-sm font-medium text-white tabular-nums">{fmt(c.key, row.stats[c.key] ?? 0)}</span>
                </span>
            ))}
        </div>
    </article>
);

const Section: React.FC<{ title: string; rows: TeamGameRow[]; order: SortOrder; oppName: (id: string) => string; onScoreClick?: (gameId: string) => void }> = ({ title, rows, order, oppName, onScoreClick }) => {
    const wins = rows.filter(r => r.isWin).length;
    const sorted = [...rows].sort((a, b) => order === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    return (
        <>
            <div className="h-8 px-1 flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-500">{title}</span>
                <span className="text-sm font-medium text-slate-400 tabular-nums">{wins}-{rows.length - wins}</span>
            </div>
            {sorted.map(r => <GameCard key={r.gameId} row={r} oppName={oppName(r.oppId)} onClick={onScoreClick ? () => onScoreClick(r.gameId) : undefined} />)}
        </>
    );
};

export const PhoneTeamGameLog: React.FC<PhoneTeamGameLogProps> = ({ team, schedule, allTeams, onScoreClick }) => {
    const rows = useMemo(() => buildTeamGameRows(schedule, team.id), [schedule, team.id]);
    const nameById = useMemo(() => new Map(allTeams.map(t => [t.id, t.name])), [allTeams]);
    const oppName = (id: string) => nameById.get(id) ?? id;
    const regular = rows.filter(r => !r.isPlayoff);
    const playoff = rows.filter(r => r.isPlayoff);

    // 필터 — 정렬(최신순 기본) + 구분 체크(정규 시즌·플레이오프, 기본 둘 다). 플레이오프 경기가 없으면 그 체크박스는 숨긴다.
    const [filterOpen, setFilterOpen] = useState(false);
    const [order, setOrder] = useState<SortOrder>('newest');
    const [showRegular, setShowRegular] = useState(true);
    const [showPlayoff, setShowPlayoff] = useState(true);
    const hasPlayoff = playoff.length > 0;
    const filterActive = order !== 'newest' || !showRegular || (hasPlayoff && !showPlayoff);

    const sections: { title: string; rows: TeamGameRow[] }[] = [];
    if (showPlayoff && hasPlayoff) sections.push({ title: '플레이오프', rows: playoff });
    if (showRegular && regular.length > 0) sections.push({ title: '정규 시즌', rows: regular });
    // 오래된순이면 시간 순서대로 정규 시즌 섹션이 먼저.
    if (order === 'oldest') sections.reverse();
    const shownCount = sections.reduce((n, s) => n + s.rows.length, 0);

    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 h-11 px-4 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950">
                <span className="text-xs text-slate-500 tabular-nums">{shownCount}경기 · {order === 'newest' ? '최신순' : '오래된순'}</span>
                <button type="button" aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)} className="relative h-8 pl-2.5 pr-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 active:bg-slate-700">
                    <SlidersHorizontal size={14} />필터
                    {filterActive && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-950" />}
                </button>
            </div>
            <BottomSheet open={filterOpen} title="경기 기록 필터" onClose={() => setFilterOpen(false)}>
                <SheetGroupTitle first>정렬</SheetGroupTitle>
                <SheetOptionRow type="radio" label="최신순" checked={order === 'newest'} onChange={() => setOrder('newest')} />
                <SheetOptionRow type="radio" label="오래된순" checked={order === 'oldest'} onChange={() => setOrder('oldest')} />
                <SheetGroupTitle>구분</SheetGroupTitle>
                <SheetOptionRow type="checkbox" label="정규 시즌" checked={showRegular} onChange={() => setShowRegular(v => !v)} />
                {hasPlayoff && <SheetOptionRow type="checkbox" label="플레이오프" checked={showPlayoff} onChange={() => setShowPlayoff(v => !v)} />}
            </BottomSheet>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {rows.length === 0 ? (
                    <div className="py-10"><EmptyState title="경기 기록이 없습니다." /></div>
                ) : shownCount === 0 ? (
                    <div className="py-10"><EmptyState title="필터 조건에 맞는 경기가 없습니다." /></div>
                ) : (
                    <div className="px-4 pt-3 flex flex-col gap-2">
                        {sections.map(s => <Section key={s.title} title={s.title} rows={s.rows} order={order} oppName={oppName} onScoreClick={onScoreClick} />)}
                    </div>
                )}
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>
        </div>
    );
};
