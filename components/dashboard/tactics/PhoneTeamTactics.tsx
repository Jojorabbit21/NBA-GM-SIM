// PhoneTeamTactics.tsx — 폰(<768) 전술 화면 "팀 전술" 탭 렌더러. [2026-10-28 모바일 전술]
// docs/ui/mobile-design-system.md §9-1-11 X4·X5·X7·X8. 상태·핸들러(세트 선택·이름 변경·자동 설정·초기화·슬라이더 갱신·프리셋)는
// MultiTacticsView가 그대로 들고 있고, 이 파일은 폰 화면만 그린다:
//   툴바 44(프리셋 선택기 toolbarExtra + ⋯ 시트: 전술 자동 설정 · 초기화) → 세트 줄 44(SheetSelect 1번/2번/클러치 + ✎ 이름 변경 시트 + 안내)
//   → 안내(InlineNotice: 자동 설정 실패 · 2번 구간 0분 · 클러치 잠금) → 전술 로테이션 차트(TacticSetTimeline 폰 분기)
//   → 슬라이더 1열(§7-1: 라벨 + ? 시트 + 현재 단계 라벨 / − 44 · 트랙 6(눈금 점 없음) · 썸 24 · + 44) → 플레이타입 PPP → "슬라이더 설명 보기" 행 → 설명 시트
//   클러치 잠금이면 슬라이더 영역 opacity 40 + 터치 차단(데스크톱 동일).
import React, { useMemo, useState } from 'react';
import { ChevronRight, HelpCircle, Minus, MoreHorizontal, PenLine, Plus } from 'lucide-react';
import type { GameTactics, TacticalSliders } from '../../../types';
import type { TacticSetId } from '../../../services/game/engine/pbp/tacticSchedule';
import { getSetLabel } from '../../../utils/tacticSetEdit';
import { TACTIC_PRESET_NAME_MAX, normalizePresetName } from '../../../services/multi/tacticPresets';
import { DEFAULT_SLIDERS } from '../../../services/game/config/tacticPresets';
import { OFFENSE_SLIDER_GROUPS, DEFENSE_SLIDER_GROUPS, type SliderItemConfig } from './tacticsSliderConfig';
import { SliderNoteContent } from './SliderNoteContent';
import { PlayTypePPP, type PlayTypeActual } from './charts/PlayTypePPP';
import { TacticSetTimeline } from './TacticSetTimeline';
import { BottomSheet, SheetGroupTitle } from '../../mobile/BottomSheet';
import { SheetSelect } from '../../mobile/ActionSheet';
import { InlineNotice } from '../../common/InlineNotice';
import { Button } from '../../common/Button';
import { isImeComposing } from '../../../utils/ime';

interface PhoneTeamTacticsProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    selectedSet: TacticSetId;
    onSelectSet: (s: TacticSetId) => void;
    /** 고른 세트의 슬라이더가 들어 있는 편집 대상(MultiTacticsView.editingTactics) */
    editingTactics: GameTactics;
    onUpdateSetTactics: (t: GameTactics) => void;
    clutchLocked: boolean;
    altMinutes: number;
    autoSetNotice: string | null;
    onAutoSet: () => void;
    onReset: () => void;
    onRenameSet: (name: string) => void;
    /** 프리셋 선택기(데스크톱과 같은 TacticPresetSelector) */
    toolbarExtra?: React.ReactNode;
    playTypeActual?: PlayTypeActual;
}

const SET_IDS: TacticSetId[] = ['main', 'alt', 'clutch'];
const MenuRow: React.FC<{ label: string; sub?: string; danger?: boolean; onClick: () => void }> = ({ label, sub, danger = false, onClick }) => (
    <button type="button" onClick={onClick} className={`w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left active:bg-white/5 ${danger ? 'text-red-400' : 'text-slate-200'}`}>
        <span className="text-sm font-semibold">{label}</span>
        {sub && <span className="text-xs text-slate-500 shrink-0">{sub}</span>}
    </button>
);

export const PhoneTeamTactics: React.FC<PhoneTeamTacticsProps> = ({
    tactics, onUpdateTactics, selectedSet, onSelectSet, editingTactics, onUpdateSetTactics, clutchLocked, altMinutes,
    autoSetNotice, onAutoSet, onReset, onRenameSet, toolbarExtra, playTypeActual,
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [noteItem, setNoteItem] = useState<SliderItemConfig | null>(null);
    const [notesOpen, setNotesOpen] = useState(false);

    const sliders = useMemo((): TacticalSliders => ({ ...DEFAULT_SLIDERS, ...editingTactics.sliders }), [editingTactics.sliders]);
    // TacticsSlidersPanel.updateSlider와 같은 규칙 — mirrorKeys(지역 방어 → zoneUsage)는 한 번에 같이 갱신
    const updateSlider = (item: SliderItemConfig, val: number) => {
        const next: TacticalSliders = { ...sliders, [item.key]: val };
        for (const k of item.mirrorKeys ?? []) next[k] = val;
        onUpdateSetTactics({ ...editingTactics, sliders: next });
    };

    const setItems = SET_IDS.map(id => ({ value: id, label: getSetLabel(tactics, id) }));
    const mainLabel = getSetLabel(tactics, 'main');

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 툴바 — 뎁스 탭과 동일 구성 */}
            <div className="shrink-0 h-11 px-4 flex items-center gap-2 bg-slate-900 border-b border-slate-800">
                <div className="flex-1 min-w-0 flex items-center">{toolbarExtra}</div>
                <button type="button" onClick={() => setMenuOpen(true)} aria-label="전술 자동 설정 · 초기화" className="w-9 h-9 -mr-2 shrink-0 flex items-center justify-center rounded-lg text-slate-200 active:bg-white/10">
                    <MoreHorizontal size={20} />
                </button>
            </div>
            {/* 세트 줄 — 편집할 세트 + 이름 변경 + 상시 안내 */}
            <div className="shrink-0 h-11 pl-4 pr-2 flex items-center gap-2 bg-slate-900 border-b border-slate-800">
                <SheetSelect<TacticSetId> title="편집할 전술 세트" items={setItems} value={selectedSet} onChange={onSelectSet} />
                <button
                    type="button"
                    aria-label="이름 변경"
                    disabled={selectedSet === 'clutch'}
                    onClick={() => { setNameDraft(getSetLabel(tactics, selectedSet)); setRenameOpen(true); }}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 active:bg-white/10 disabled:opacity-40"
                >
                    <PenLine size={16} />
                </button>
                <span className="flex-1 min-w-0 text-[11px] leading-[14px] text-slate-400 text-right truncate">
                    지정하지 않은 시간은 1번 전술{mainLabel !== '1번 전술' ? `(${mainLabel})` : ''}로 진행
                </span>
            </div>
            {(autoSetNotice || (selectedSet === 'alt' && altMinutes === 0) || clutchLocked) && (
                <div className="shrink-0 px-4 py-2 bg-slate-900 border-b border-slate-800 flex flex-col gap-1">
                    {autoSetNotice && <InlineNotice tone="warning" size="sm">{autoSetNotice}</InlineNotice>}
                    {selectedSet === 'alt' && altMinutes === 0 && <InlineNotice tone="danger" size="sm">전술 로테이션에 이 전술 구간이 없어 경기에 쓰이지 않습니다</InlineNotice>}
                    {clutchLocked && <InlineNotice tone="danger" size="sm">전술 로테이션 차트의 클러치 전술 체크박스를 켜면 편집할 수 있습니다</InlineNotice>}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                <TacticSetTimeline tactics={tactics} onUpdateTactics={onUpdateTactics} selectedSet={selectedSet} />

                <div className={clutchLocked ? 'opacity-40 pointer-events-none select-none' : ''} aria-disabled={clutchLocked}>
                    {[...OFFENSE_SLIDER_GROUPS, ...DEFENSE_SLIDER_GROUPS].map((g, gi) => (
                        <div key={g.title} className={`px-4 pt-3 pb-2 ${gi > 0 ? 'mt-2 border-t border-slate-700' : ''}`}>
                            <h4 className="text-base font-black text-white mb-1">{g.title}</h4>
                            {g.items.map(item => (
                                <PhoneSlider key={item.key} item={item} value={sliders[item.key]} onChange={v => updateSlider(item, v)} onHelp={() => setNoteItem(item)} />
                            ))}
                        </div>
                    ))}
                    <div className="px-4 pt-4 pb-2 border-t border-slate-700">
                        <PlayTypePPP sliders={sliders} actual={playTypeActual} />
                    </div>
                </div>

                <button type="button" onClick={() => setNotesOpen(true)} className="mx-4 my-4 h-12 px-3 w-[calc(100%-32px)] flex items-center justify-between rounded-lg bg-slate-950 border border-slate-800 text-sm font-semibold text-slate-200 active:bg-white/5">
                    슬라이더 설명 보기
                    <ChevronRight size={18} className="text-slate-500" />
                </button>
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>

            {/* ⋯ 메뉴 — 전술 자동 설정(1번 전술 전용) · 초기화(고른 세트) */}
            <BottomSheet open={menuOpen} title="팀 전술" onClose={() => setMenuOpen(false)}>
                <SheetGroupTitle first>자동 설정</SheetGroupTitle>
                <MenuRow label="전술 자동 설정" sub="주전 5명 기준 · 1번 전술" onClick={() => { setMenuOpen(false); onAutoSet(); }} />
                <SheetGroupTitle>초기화</SheetGroupTitle>
                <MenuRow label={`${getSetLabel(tactics, selectedSet)} 슬라이더 기본값으로`} danger onClick={() => { setMenuOpen(false); onReset(); }} />
            </BottomSheet>

            {/* 이름 변경 시트 — 데스크톱 입력창 + 확인과 같은 규칙(Enter 확정, 최대 TACTIC_PRESET_NAME_MAX) */}
            <BottomSheet open={renameOpen} title="전술 이름 변경" onClose={() => setRenameOpen(false)}>
                <div className="flex items-center gap-2 pb-2">
                    <input
                        type="text"
                        value={nameDraft}
                        onChange={e => setNameDraft(e.target.value)}
                        onFocus={e => e.currentTarget.select()}
                        onKeyDown={e => {
                            if (isImeComposing(e)) return;
                            if (e.key === 'Enter' && normalizePresetName(nameDraft)) { onRenameSet(nameDraft); setRenameOpen(false); }
                        }}
                        maxLength={TACTIC_PRESET_NAME_MAX}
                        placeholder="전술 이름"
                        autoFocus
                        className="flex-1 min-w-0 h-11 px-3 bg-slate-800 border border-slate-700 rounded-lg text-base text-white focus:outline-none focus:border-indigo-500"
                    />
                    <Button variant="primary" size="lg" onClick={() => { onRenameSet(nameDraft); setRenameOpen(false); }} disabled={!normalizePresetName(nameDraft)}>확인</Button>
                </div>
            </BottomSheet>

            {/* ? 설명 시트 — 데스크톱 툴팁(SliderNoteContent) 내용 그대로 */}
            <BottomSheet open={noteItem !== null} title={noteItem ? `${noteItem.label} 설명` : ''} onClose={() => setNoteItem(null)}>
                {noteItem && <div className="pb-2 text-sm text-slate-300 leading-relaxed"><SliderNoteContent lines={noteItem.note} /></div>}
            </BottomSheet>

            {/* 전체 설명 시트 — 공격/수비 그룹 + 항목(라벨 + 첫 줄), 탭하면 장단점까지 펼침 */}
            <BottomSheet open={notesOpen} title="슬라이더 설명" onClose={() => setNotesOpen(false)}>
                <SliderNotesList />
            </BottomSheet>
        </div>
    );
};

/** §7-1 폰 슬라이더: 라벨 줄(라벨 14/600 + ? + 우측 현재 단계 라벨) / [− 44][range 트랙 6 · 썸 24][+ 44]. 값은 단계 인덱스로 다루고 엔진 값으로 커밋. */
const PhoneSlider: React.FC<{ item: SliderItemConfig; value: number; onChange: (engineValue: number) => void; onHelp: () => void }> = ({ item, value, onChange, onHelp }) => {
    const steps = item.steps;
    const idx = useMemo(() => {
        let best = 0, bestDist = Infinity;
        steps.forEach((s, i) => { const d = Math.abs(s.value - value); if (d < bestDist) { bestDist = d; best = i; } });
        return best;
    }, [steps, value]);
    const [local, setLocal] = useState(idx);
    // 부모 값이 바뀌면(초기화·프리셋·자동 설정) 따라간다
    const [syncedIdx, setSyncedIdx] = useState(idx);
    if (syncedIdx !== idx) { setSyncedIdx(idx); setLocal(idx); }
    const max = steps.length - 1;
    const pct = max > 0 ? (local / max) * 100 : 0;
    const commit = (i: number) => { const c = Math.max(0, Math.min(max, i)); setLocal(c); onChange(steps[c].value); };
    const stepBtn = 'w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-300 active:bg-white/10 disabled:text-slate-700';
    return (
        <div className="py-1.5">
            <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1 text-sm font-semibold text-white">
                    {item.label}
                    <button type="button" onClick={onHelp} aria-label={`${item.label} 설명`} className="w-6 h-6 -my-1 flex items-center justify-center text-slate-500 active:text-indigo-400"><HelpCircle size={14} /></button>
                </span>
                <span className="text-sm font-semibold text-[#A1A1AA]">{steps[local]?.label ?? ''}</span>
            </div>
            <div className="flex items-center -mx-2">
                <button type="button" aria-label="낮추기" disabled={local <= 0} onClick={() => commit(local - 1)} className={stepBtn}><Minus size={20} /></button>
                <div className="relative flex-1 h-11 flex items-center touch-none">
                    {/* 썸(24)은 양끝 12px 안쪽에서 움직이므로 트랙·채움도 같은 범위(left/right 12)에 맞춘다. 단계 눈금 점은 두지 않는다(2026-10-28 사용자 지시) */}
                    <div className="absolute left-3 right-3 h-1.5 rounded-full bg-slate-800" />
                    <div className="absolute left-3 h-1.5 rounded-full bg-indigo-500" style={{ width: `calc((100% - 24px) * ${pct / 100})` }} />
                    <input
                        type="range"
                        min={0}
                        max={max}
                        step={1}
                        value={local}
                        onChange={e => setLocal(parseInt(e.target.value, 10))}
                        onPointerUp={() => commit(local)}
                        onKeyUp={() => commit(local)}
                        onBlur={() => { if (steps[local]?.value !== value) commit(local); }}
                        aria-label={item.label}
                        aria-valuetext={steps[local]?.label}
                        className="relative w-full h-11 bg-transparent appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:mt-[10px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.5)] [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
                    />
                </div>
                <button type="button" aria-label="높이기" disabled={local >= max} onClick={() => commit(local + 1)} className={stepBtn}><Plus size={20} /></button>
            </div>
        </div>
    );
};

/** 전체 설명 리스트 — 그룹 제목 + 항목(라벨 14 + 첫 줄 12), 탭하면 SliderNoteContent 전체 */
const SliderNotesList: React.FC = () => {
    const [open, setOpen] = useState<string | null>(null);
    return (
        <div className="-mx-1">
            {[...OFFENSE_SLIDER_GROUPS, ...DEFENSE_SLIDER_GROUPS].map(g => (
                <React.Fragment key={g.title}>
                    <SheetGroupTitle first={g === OFFENSE_SLIDER_GROUPS[0]}>{g.category} · {g.title}</SheetGroupTitle>
                    {g.items.map(item => {
                        const on = open === item.key;
                        return (
                            <button key={item.key} type="button" onClick={() => setOpen(on ? null : item.key)} aria-expanded={on} className="w-full min-h-[48px] py-2 px-1 flex items-start justify-between gap-3 text-left border-b border-slate-800 active:bg-white/5">
                                <span className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-sm font-semibold text-slate-200">{item.label}</span>
                                    {on
                                        ? <span className="text-xs text-slate-300 leading-relaxed"><SliderNoteContent lines={item.note} /></span>
                                        : <span className="text-xs text-slate-400 truncate">{item.note[0]}</span>}
                                </span>
                                <ChevronRight size={16} className={`shrink-0 mt-0.5 text-slate-500 transition-transform ${on ? 'rotate-90' : ''}`} />
                            </button>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
};
