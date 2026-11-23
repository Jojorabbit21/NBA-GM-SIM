import React, { useCallback, useMemo, useState } from 'react';
import type { Team, GameTactics, DepthChart, Player } from '../../types';
import { TabBar } from '../../components/common/TabBar';
import { Button } from '../../components/common/Button';
import { IconButton } from '../../components/common/IconButton';
import { InlineNotice } from '../../components/common/InlineNotice';
import { Dropdown, DropdownButton } from '../../components/common/Dropdown';
import { TeamLogo } from '../../components/common/TeamLogo';
import { PencilIcon } from '../../components/home/homeIcons';
import { DepthRotationBoard } from '../../components/dashboard/DepthRotationBoard';
import { TacticsSlidersPanel } from '../../components/dashboard/tactics/TacticsSlidersPanel';
import { TacticSetTimeline } from '../../components/dashboard/tactics/TacticSetTimeline';
import { generateSlidersForStarters } from '../../services/game/tactics/tacticGenerator';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';
import { getSetLabel, getSetSliders, withSetSliders, withSetName, isClutchOn } from '../../utils/tacticSetEdit';
import { TACTIC_PRESET_NAME_MAX, normalizePresetName } from '../../services/multi/tacticPresets';
import { isImeComposing } from '../../utils/ime';
import type { TacticSetId } from '../../services/game/engine/pbp/tacticSchedule';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme } from '../../utils/teamTheme';
import { QUICK_SIDES, QUICK_SIDE_LABEL, type QuickSide } from './quickGameTypes';

// [2026-11-23] Quick Game 2단계 — 멀티 전술 화면(MultiTacticsView)의 "뎁스 차트 · 로테이션" / "팀 전술" 탭을
// 프리셋·저장·트레이닝·인사이트 없이 그대로 옮긴 것. 맨 위 팀 선택 영역(원정/홈 두 칸, 각 팀 테마 배경)으로 진영 전환.

type QuickTacticsTab = 'depth' | 'team';
const TABS: { id: QuickTacticsTab; label: string }[] = [
    { id: 'depth', label: '뎁스 차트 · 로테이션' },
    { id: 'team', label: '팀 전술' },
];

export interface QuickTacticsSide {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
}

interface QuickTacticsSetupProps {
    sides: Record<QuickSide, QuickTacticsSide>;
    activeSide: QuickSide;
    onActiveSideChange: (side: QuickSide) => void;
    onUpdateTactics: (side: QuickSide, t: GameTactics) => void;
    onUpdateDepthChart: (side: QuickSide, dc: DepthChart) => void;
}

export const QuickTacticsSetup: React.FC<QuickTacticsSetupProps> = ({ sides, activeSide, onActiveSideChange, onUpdateTactics, onUpdateDepthChart }) => {
    const [tab, setTab] = useState<QuickTacticsTab>('depth');
    const cur = sides[activeSide];

    // DepthRotationBoard는 memo — 콜백 identity를 진영별로 고정
    const handleTactics = useCallback((t: GameTactics) => onUpdateTactics(activeSide, t), [activeSide, onUpdateTactics]);
    const handleDepth = useCallback((dc: DepthChart) => onUpdateDepthChart(activeSide, dc), [activeSide, onUpdateDepthChart]);

    // 팀 선택 영역 — 원정/홈 두 칸이 폭을 채우고 칸마다 그 팀의 테마 배경(getTeamTheme). 선택된 칸은 밑줄(accent)로 표시, 흐림 없음.
    const teamPicker = (
        <div role="tablist" aria-label="진영" className="shrink-0 grid grid-cols-2 h-16 border-b border-black/20">
            {QUICK_SIDES.map(s => {
                const on = s === activeSide;
                const team = sides[s].team;
                const meta = TEAM_DATA[team.id];
                const th = meta ? getTeamTheme(team.id, meta.colors) : null;
                return (
                    <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onActiveSideChange(s)}
                        className={`h-full px-4 flex items-center justify-center gap-3 border-b-[3px] transition-colors duration-100 ${th ? '' : on ? 'bg-slate-900 border-indigo-400 text-indigo-400' : 'bg-slate-950 border-transparent text-slate-500'}`}
                        style={th ? { backgroundColor: th.bg, color: th.text, borderColor: on ? th.accent : 'transparent' } : undefined}
                    >
                        <TeamLogo teamId={team.id} size="md" className="shrink-0" />
                        <span className="flex flex-col items-start min-w-0 leading-tight">
                            <span className="text-xs font-bold opacity-80">{QUICK_SIDE_LABEL[s]}</span>
                            <span className="text-lg font-black truncate max-w-full">{team.city} {team.name}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {teamPicker}
            <TabBar tabs={TABS} activeTab={tab} onTabChange={id => setTab(id as QuickTacticsTab)} />
            <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'depth' ? (
                    <DepthRotationBoard
                        key={activeSide}
                        team={cur.team}
                        tactics={cur.tactics}
                        depthChart={cur.depthChart}
                        onUpdateDepthChart={handleDepth}
                        onUpdateTactics={handleTactics}
                    />
                ) : (
                    <QuickTeamTacticsPanel
                        key={activeSide}
                        roster={cur.team.roster}
                        tactics={cur.tactics}
                        depthChart={cur.depthChart}
                        onUpdateTactics={handleTactics}
                    />
                )}
            </div>
        </div>
    );
};

// ─── 팀 전술 패널 — MultiTacticsView teamPanel과 같은 구성(툴바 → 전술 세트 바 → 전술 로테이션 → 슬라이더) ───
const QuickTeamTacticsPanel: React.FC<{
    roster: Player[];
    tactics: GameTactics;
    depthChart: DepthChart | null;
    onUpdateTactics: (t: GameTactics) => void;
}> = ({ roster, tactics, depthChart, onUpdateTactics }) => {
    const [selectedSet, setSelectedSet] = useState<TacticSetId>('main');
    const [setMenuOpen, setSetMenuOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState<string | null>(null);
    const [autoSetNotice, setAutoSetNotice] = useState<string | null>(null);

    const clutchLocked = selectedSet === 'clutch' && !isClutchOn(tactics);
    const editingTactics = useMemo(() => ({ ...tactics, sliders: getSetSliders(tactics, selectedSet) }), [tactics, selectedSet]);
    const handleUpdateSetTactics = useCallback((t: GameTactics) => {
        if (selectedSet === 'clutch' && !isClutchOn(tactics)) return;
        onUpdateTactics(withSetSliders(tactics, selectedSet, t.sliders));
    }, [tactics, selectedSet, onUpdateTactics]);
    const altMinutes = useMemo(() => (tactics.sliderSchedule ?? '').split('').filter(c => c === '2').length, [tactics.sliderSchedule]);

    const confirmSetName = () => {
        if (nameDraft === null || selectedSet === 'clutch' || !normalizePresetName(nameDraft)) return;
        onUpdateTactics(withSetName(tactics, selectedSet, nameDraft));
        setNameDraft(null);
    };

    // 자동 설정 — 지금 뎁스 차트의 주전 5명 기준(멀티와 동일, 감독 성향 없음). 1번 전술 전용.
    const handleAutoSet = () => {
        const ids = (['PG', 'SG', 'SF', 'PF', 'C'] as const).map(pos => depthChart?.[pos]?.[0] || tactics.starters?.[pos] || '');
        const starters = [...new Set(ids.filter(Boolean))]
            .map(id => roster.find(p => p.id === id))
            .filter((p): p is Player => !!p);
        if (starters.length < 5) {
            setAutoSetNotice('뎁스 차트에서 주전 5명을 모두 지정해야 자동 설정할 수 있습니다');
            return;
        }
        setAutoSetNotice(null);
        onUpdateTactics(withSetSliders(tactics, 'main', generateSlidersForStarters(starters)));
        setSelectedSet('main');
        setNameDraft(null);
    };
    const handleReset = () => {
        if (clutchLocked || !window.confirm(`${getSetLabel(tactics, selectedSet)} 슬라이더를 전부 기본값으로 초기화하시겠습니까?`)) return;
        onUpdateTactics(withSetSliders(tactics, selectedSet, { ...DEFAULT_SLIDERS }));
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-600 flex items-center justify-between flex-shrink-0 gap-4">
                <span className="text-base font-black text-white shrink-0">팀 전술</span>
                <div className="flex items-center gap-2 shrink-0">
                    {autoSetNotice && <InlineNotice tone="warning" size="sm">{autoSetNotice}</InlineNotice>}
                    <Button variant="primary" shape="md" onClick={handleAutoSet}>전술 자동 설정</Button>
                    <Button variant="secondary" onClick={handleReset}>초기화</Button>
                </div>
            </div>
            <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-700 flex items-center gap-2 flex-shrink-0 min-w-0">
                {nameDraft !== null ? (
                    <>
                        <input
                            type="text"
                            value={nameDraft}
                            onChange={e => setNameDraft(e.target.value)}
                            onFocus={e => e.currentTarget.select()}
                            onKeyDown={e => {
                                if (isImeComposing(e)) return;
                                if (e.key === 'Enter') confirmSetName();
                                if (e.key === 'Escape') setNameDraft(null);
                            }}
                            maxLength={TACTIC_PRESET_NAME_MAX}
                            placeholder="전술 이름"
                            autoFocus
                            className="h-8 w-[168px] px-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <Button variant="primary" size="md" onClick={confirmSetName} disabled={!normalizePresetName(nameDraft)}>확인</Button>
                    </>
                ) : (
                    <>
                        <Dropdown
                            isOpen={setMenuOpen}
                            onOpenChange={setSetMenuOpen}
                            align="left"
                            width="w-44"
                            trigger={<DropdownButton isOpen={setMenuOpen} label={getSetLabel(tactics, selectedSet)} className="h-8 w-[168px] !px-3 !py-0" />}
                            items={(['main', 'alt', 'clutch'] as TacticSetId[]).map(id => ({
                                id,
                                label: <span className="truncate">{getSetLabel(tactics, id)}</span>,
                                active: id === selectedSet,
                                onClick: () => setSelectedSet(id),
                            }))}
                        />
                        <IconButton label="이름 변경" size="lg" tone="subtle" onClick={() => setNameDraft(getSetLabel(tactics, selectedSet))} disabled={selectedSet === 'clutch'}>
                            <PencilIcon size={16} />
                        </IconButton>
                    </>
                )}
                {selectedSet === 'alt' && altMinutes === 0 && (
                    <InlineNotice tone="danger" size="sm">전술 로테이션에 이 전술 구간이 없어 경기에 쓰이지 않습니다</InlineNotice>
                )}
                {clutchLocked && (
                    <InlineNotice tone="danger" size="sm">전술 로테이션 차트의 클러치 전술 체크박스를 켜면 편집할 수 있습니다</InlineNotice>
                )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                <TacticSetTimeline tactics={tactics} onUpdateTactics={onUpdateTactics} selectedSet={selectedSet} />
                <div className={`p-8 pb-20 ${clutchLocked ? 'opacity-40 pointer-events-none select-none' : ''}`} aria-disabled={clutchLocked}>
                    <TacticsSlidersPanel tactics={editingTactics} onUpdateTactics={handleUpdateSetTactics} roster={roster} offenseDefenseSplit />
                </div>
            </div>
        </div>
    );
};
