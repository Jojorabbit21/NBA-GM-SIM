import React, { useRef, useState } from 'react';
import { Dropdown } from '../../components/common/Dropdown';
import { Spinner } from '../../components/common/Spinner';
import { TeamLogo } from '../../components/common/TeamLogo';
import { TEAM_DATA, getAllTeamsList } from '../../data/teamData';
import { TEAM_ID_MAP } from '../../data/mappings';

// [2026-11-23] Quick Game 팀 패널의 큰 팀 드롭다운(로고 48 + 팀명 text-xl 트리거, 목록은 작은 줄).
// 열림 상태를 이 컴포넌트 안에 두고 memo — 예전엔 상태가 QuickTeamSetup에 있어 열 때마다 오른쪽 선수 풀 표(50행×27열)까지
// 다시 그려져 버벅였다. 콜백은 ref로 최신 값을 읽어 부모가 매 렌더 새 함수를 넘겨도 memo가 깨지지 않는다.

// 영문 팀명(도시 기준) A-Z — TEAM_ID_MAP 앞쪽 영어 구간에서 팀마다 처음 나오는 키가 도시명('atlanta', 'la mirage' …)
const ENGLISH_KEY: Record<string, string> = {};
for (const [key, id] of Object.entries(TEAM_ID_MAP)) {
    if (!/^[a-z .]+$/.test(key)) continue;
    if (!(id in ENGLISH_KEY)) ENGLISH_KEY[id] = key;
}
const TEAMS = getAllTeamsList().slice().sort((a, b) => (ENGLISH_KEY[a.id] ?? a.id).localeCompare(ENGLISH_KEY[b.id] ?? b.id));

const ChevronGlyph: React.FC<{ open: boolean }> = ({ open }) => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

interface QuickTeamPickerProps {
    teamId: string | null;
    /** 상대 진영 팀 — 목록에 진영 표시(고르면 부모가 상대 진영 선택을 해제) */
    takenTeamId: string | null;
    takenLabel: string;
    loading: boolean;
    /** 팀 테마가 칠해진 배경 위인지(구분선 색) */
    themed: boolean;
    isPhone: boolean;
    onSelect: (teamId: string) => void;
}

const QuickTeamPickerInner: React.FC<QuickTeamPickerProps> = ({ teamId, takenTeamId, takenLabel, loading, themed, isPhone, onSelect }) => {
    const [open, setOpen] = useState(false);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const team = teamId ? TEAM_DATA[teamId] : null;

    return (
        <Dropdown
            className="shrink-0 w-full"
            width={isPhone ? 'w-[calc(100vw-16px)]' : 'w-72'}
            align="left"
            isOpen={open}
            onOpenChange={o => { if (!loading) setOpen(o); }}
            trigger={
                <div className={`w-full h-20 px-4 flex items-center gap-4 border-b hover:bg-white/5 transition-colors cursor-pointer ${themed ? 'border-black/20' : 'border-slate-800'}`}>
                    {team
                        ? <TeamLogo teamId={teamId!} size="lg" className="shrink-0" />
                        : <span className="w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-slate-700" />}
                    <span className={`flex-1 min-w-0 truncate text-xl font-black ${team ? '' : 'text-slate-500'}`}>
                        {team ? `${team.city} ${team.name}` : '팀 선택'}
                    </span>
                    {loading ? <Spinner variant="inline" /> : <ChevronGlyph open={open} />}
                </div>
            }
        >
            <div className="p-1 max-h-80 overflow-y-auto custom-scrollbar">
                {TEAMS.map(t => {
                    const taken = t.id === takenTeamId;
                    return (
                        <button
                            type="button"
                            key={t.id}
                            onClick={() => { setOpen(false); onSelectRef.current(t.id); }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                t.id === teamId ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <TeamLogo teamId={t.id} size="xs" shadow={false} className="shrink-0" />
                            <span className="min-w-0 truncate">{t.city} {t.name}</span>
                            {taken && <span className="ml-auto text-xs font-bold text-slate-400 shrink-0">{takenLabel}</span>}
                        </button>
                    );
                })}
            </div>
        </Dropdown>
    );
};

export const QuickTeamPicker = React.memo(QuickTeamPickerInner, (a, b) =>
    a.teamId === b.teamId && a.takenTeamId === b.takenTeamId && a.takenLabel === b.takenLabel
    && a.loading === b.loading && a.themed === b.themed && a.isPhone === b.isPhone,
);
