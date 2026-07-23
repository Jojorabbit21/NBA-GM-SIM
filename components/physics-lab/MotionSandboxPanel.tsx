
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Pause, Shuffle } from 'lucide-react';
import { PhysicsCourtView } from '../game/PhysicsCourtView';
import { PlayerSearchSelect } from './PlayerSearchSelect';
import { SliderControl } from '../common/SliderControl';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { useReelPlayback } from './useReelPlayback';
import { buildSandboxTeamState, buildSyntheticPossessionResult } from '../../services/game/engine/pbp/handlers/sandboxBuilder';
import { generateChoreography, buildCase1ContinuityDebug } from '../../services/game/engine/pbp/handlers/choreographyGenerator';
import { DEFAULT_SLIDERS } from '../../services/game/config/tacticPresets';
import { SLIDER_STEPS } from '../../services/game/config/sliderSteps';
import type { SandboxStep, SubZoneKey } from '../../services/game/engine/pbp/choreographyTypes';
import type { ChoreographyReel } from '../../services/game/engine/pbp/choreographyTypes';
import type { ChoreographyDebugLine } from '../../services/game/engine/pbp/handlers/choreographyGenerator';
import type { Player, PlayType, TacticalSliders } from '../../types';

// ─────────────────────────────────────────────────────────────
// §12 — Motion Sandbox, Milestone 1. Director's-cut authoring tool: admin picks a roster +
// one CatchShoot step by hand (no real PBP RNG, §12-1) and plays it back through the same
// Reel pipeline the real engine will eventually use. playType dropdown shows all 12 for future
// visibility but only CatchShoot is wired up this milestone — the rest fall through to
// generateChoreography()'s single-static-beat placeholder (see §8 roadmap).
// ─────────────────────────────────────────────────────────────

const SUBZONE_OPTIONS: { value: SubZoneKey; label: string }[] = [
    { value: 'zone_rim', label: '골밑 (Rim)' },
    { value: 'zone_paint', label: '페인트 (Paint)' },
    { value: 'zone_mid_l', label: '미드 - 좌' },
    { value: 'zone_mid_c', label: '미드 - 중앙' },
    { value: 'zone_mid_r', label: '미드 - 우' },
    { value: 'zone_c3_l', label: '코너3 - 좌' },
    { value: 'zone_c3_r', label: '코너3 - 우' },
    { value: 'zone_atb3_l', label: '45도(윙3) - 좌' },
    { value: 'zone_atb3_c', label: '탑3' },
    { value: 'zone_atb3_r', label: '45도(윙3) - 우' },
];

const ALL_PLAY_TYPES: PlayType[] = [
    'Iso', 'PnR_Handler', 'PnR_Roll', 'PnR_Pop', 'PostUp', 'CatchShoot',
    'Cut', 'Handoff', 'Transition', 'Putback', 'OffBallScreen', 'DriveKick',
];

const ROSTER_SLOTS = 5;
const SLOT_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export const MotionSandboxPanel: React.FC = () => {
    const [pool, setPool] = useState<Player[]>([]);
    const [poolLoading, setPoolLoading] = useState(true);
    const [rosterIds, setRosterIds] = useState<string[]>(Array(ROSTER_SLOTS).fill(''));
    const [actorId, setActorId] = useState('');
    const [assisterId, setAssisterId] = useState('');
    const [subZone, setSubZone] = useState<SubZoneKey>('zone_atb3_c');
    const [outcome, setOutcome] = useState<'score' | 'miss'>('score');
    const [rebounderId, setRebounderId] = useState('');
    const [entryEnabled, setEntryEnabled] = useState(false);
    const [inbounderId, setInbounderId] = useState('');
    const [reel, setReel] = useState<ChoreographyReel | null>(null);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [debugLines, setDebugLines] = useState<ChoreographyDebugLine[]>([]);
    const [showMotionDebug, setShowMotionDebug] = useState(true);
    const [sliders, setSliders] = useState<TacticalSliders>(DEFAULT_SLIDERS);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setPoolLoading(true);
            const { data, error } = await supabase
                .from('meta_players')
                .select('id, name, position, base_attributes, tendencies')
                .eq('in_multi_pool', true)
                .or('base_team_id.not.is.null,draft_year.eq.2026');
            if (!cancelled) {
                if (!error && data) setPool(data.map((r: any) => mapRawPlayerToRuntimePlayer(r, false)));
                setPoolLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const roster = useMemo(
        () => rosterIds.map(id => pool.find(p => p.id === id)).filter((p): p is Player => !!p),
        [rosterIds, pool],
    );
    const usedRosterIds = useMemo(() => new Set(rosterIds.filter(Boolean)), [rosterIds]);
    const canPlay = roster.length === ROSTER_SLOTS && !!actorId && !!assisterId && actorId !== assisterId;

    const { displaySnapshot, ballDisplay, running, setRunning, speed, setSpeed, trails } = useReelPlayback(reel);

    // 최종 목적지 마커 — 릴의 마지막 비트 스냅샷이 곧 "각 선수가 최종적으로 있어야 할 자리".
    // 실제 재생 결과(트레일)와 겹쳐 보면 관성/지글링이 목표를 못 맞추는 건지, 목표 자체가
    // 계속 바뀌는 건지 구분할 수 있다.
    const finalPositionMarkers = useMemo(() => {
        if (!reel || reel.length === 0) return [];
        const lastSnapshot = reel[reel.length - 1].snapshot;
        return lastSnapshot.positions.map(p => ({ x: p.x, y: p.y, color: '#facc15', opacity: 0.9 }));
    }, [reel]);

    const handleRosterSlotChange = useCallback((idx: number, playerId: string) => {
        setRosterIds(prev => {
            const next = [...prev];
            next[idx] = playerId;
            return next;
        });
    }, []);

    const handleRandomRoster = useCallback(() => {
        if (pool.length === 0) return;
        const used = new Set<string>();
        const next = SLOT_POSITIONS.map(pos => {
            const candidates = pool.filter(p => p.position === pos && !used.has(p.id));
            const fallback = pool.filter(p => !used.has(p.id));
            const picks = candidates.length > 0 ? candidates : fallback;
            if (picks.length === 0) return '';
            const chosen = picks[Math.floor(Math.random() * picks.length)];
            used.add(chosen.id);
            return chosen.id;
        });
        setRosterIds(next);
        setActorId('');
        setAssisterId('');
    }, [pool]);

    const updateSlider = useCallback((key: keyof TacticalSliders, val: number) => {
        setSliders(prev => ({ ...prev, [key]: val }));
    }, []);

    const handlePlay = useCallback(() => {
        setBuildError(null);
        if (!canPlay) return;
        try {
            const offTeam = buildSandboxTeamState('SANDBOX_OFF', roster, sliders);
            const defTeam = buildSandboxTeamState('SANDBOX_DEF', roster); // Milestone 1: placeholder, not rendered
            const step: SandboxStep = {
                id: 'step-1',
                playType: 'CatchShoot',
                subZone,
                outcome,
                actorId,
                assisterId,
                entry: entryEnabled ? 'case1' : undefined,
                inbounderId: entryEnabled && inbounderId ? inbounderId : undefined,
                rebounderId: outcome === 'miss' && rebounderId ? rebounderId : undefined,
            };
            const result = buildSyntheticPossessionResult(step, offTeam, defTeam);
            const missDebug: ChoreographyDebugLine[] = [];
            const newReel = generateChoreography(result, 6, offTeam.id, missDebug);
            setReel(newReel);
            setDebugLines([...buildCase1ContinuityDebug(result), ...missDebug]);
        } catch (err) {
            setBuildError(err instanceof Error ? err.message : String(err));
            setReel(null);
            setDebugLines([]);
        }
    }, [canPlay, roster, subZone, outcome, actorId, assisterId, entryEnabled, inbounderId, rebounderId, sliders]);

    return (
        <div className="flex gap-4 h-full min-h-0">
            {/* ── 좌측: 설정 패널 ── */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">로스터 (공격 5명)</label>
                        <button
                            onClick={handleRandomRoster}
                            disabled={poolLoading || pool.length === 0}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-[10px] font-bold rounded transition-colors"
                        >
                            <Shuffle size={11} /> 랜덤 로스터
                        </button>
                    </div>
                    {poolLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> 선수 풀 로딩 중...</div>
                    ) : (
                        <div className="space-y-1.5">
                            {rosterIds.map((id, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <span className="w-7 shrink-0 text-center text-[10px] font-black text-indigo-400 bg-slate-800 border border-slate-700 rounded py-1.5">
                                        {SLOT_POSITIONS[i]}
                                    </span>
                                    <PlayerSearchSelect
                                        players={pool}
                                        value={id}
                                        onChange={pid => handleRosterSlotChange(i, pid)}
                                        disabledIds={usedRosterIds}
                                        placeholder={`슬롯 ${i + 1} 선수 선택`}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">스텝 1 — playType</label>
                    <select
                        value="CatchShoot"
                        disabled
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white opacity-80"
                    >
                        {ALL_PLAY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}{pt !== 'CatchShoot' ? ' (다음 마일스톤)' : ''}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-slate-500">Milestone 1은 CatchShoot만 실제 동작 — 나머지 11개는 §8 설계 완료, 구현 대기.</p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">액터 (슈터)</label>
                    <select value={actorId} onChange={e => setActorId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
                        <option value="">선택</option>
                        {roster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">어시스터 (패서)</label>
                    <select value={assisterId} onChange={e => setAssisterId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
                        <option value="">선택</option>
                        {roster.filter(p => p.id !== actorId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={entryEnabled}
                            onChange={e => setEntryEnabled(e.target.checked)}
                            className="accent-indigo-600"
                        />
                        케이스 1로 시작 (우리 진영 베이스라인 인바운드 → 풀코트 전진)
                    </label>
                    {entryEnabled && (
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500">인바운더 (비워두면 자동 배정)</label>
                            <select
                                value={inbounderId}
                                onChange={e => setInbounderId(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                            >
                                <option value="">자동 배정</option>
                                {roster.filter(p => p.id !== assisterId).map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.position})</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <p className="text-[10px] text-slate-500">압박 강도 분기는 수비 AI 구현 후 고도화 예정(§14) — 지금은 평상시 전진만.</p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">subZone</label>
                    <select value={subZone} onChange={e => setSubZone(e.target.value as SubZoneKey)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
                        {SUBZONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">결과</label>
                    <div className="flex bg-slate-800 rounded-lg p-0.5">
                        {(['score', 'miss'] as const).map(o => (
                            <button
                                key={o}
                                onClick={() => setOutcome(o)}
                                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${outcome === o ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                {o === 'score' ? '성공' : '실패'}
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500">턴오버/파울은 다음 마일스톤(엔트리 시퀀스 연결 필요, §6).</p>
                </div>

                {outcome === 'miss' && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">리바운더</label>
                        <select
                            value={rebounderId}
                            onChange={e => setRebounderId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                            <option value="">미지정 (수비 리바운드로 처리)</option>
                            {roster.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.position})</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-500">
                            공격 리바운드 크래시는 "전술 설정" 탭의 "공격 리바운드" 슬라이더로 인원수가 정해지고,
                            여기서 고른 리바운더는 슬라이더 결과와 무관하게 항상 크래시 인원에 강제 포함됩니다.
                        </p>
                    </div>
                )}

                <button
                    onClick={handlePlay}
                    disabled={!canPlay}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg transition-colors"
                >
                    <Play size={13} /> 재생 생성
                </button>
                {buildError && <p className="text-[10px] text-red-400">{buildError}</p>}

                {reel && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                        <button
                            onClick={() => setRunning(r => !r)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                            {running ? <><Pause size={12} /> 일시정지</> : <><Play size={12} /> 재생</>}
                        </button>
                    </div>
                )}
                {reel && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            속도 ({speed.toFixed(1)}x)
                        </label>
                        <input type="range" min={0.25} max={2} step={0.25} value={speed}
                            onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full" />
                    </div>
                )}
                {reel && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer pt-2 border-t border-slate-800">
                        <input type="checkbox" checked={showMotionDebug} onChange={e => setShowMotionDebug(e.target.checked)} className="accent-indigo-600" />
                        최종 위치(●)·이동 경로 표시
                    </label>
                )}
            </div>

            {/* ── 가운데: 코트 + 디버그 터미널 ── */}
            <div className="flex-1 min-w-0 flex flex-col items-center gap-3 overflow-y-auto">
                <div className="w-full max-w-3xl shrink-0">
                    {reel ? (
                        <PhysicsCourtView
                            courtSnapshot={displaySnapshot}
                            homeTeamId="SANDBOX_OFF"
                            homeColor="#6366f1"
                            awayColor="#f59e0b"
                            ball={ballDisplay}
                            markers={showMotionDebug ? finalPositionMarkers : undefined}
                            trails={showMotionDebug ? trails : undefined}
                        />
                    ) : (
                        <div className="aspect-[940/500] flex items-center justify-center text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl">
                            로스터 5명·액터·어시스터를 고르고 "재생 생성"을 눌러주세요.
                        </div>
                    )}
                </div>

                {/* 안무 연속성 디버그 터미널 — 릴 사이에 실제 어떤 선수/좌표 데이터가 전달되는지 확인용 */}
                <div className="w-full max-w-3xl bg-black border border-slate-800 rounded-lg font-mono text-[11px] overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        continuity-debug
                    </div>
                    <div className="px-3 py-2 max-h-40 overflow-y-auto space-y-1">
                        {debugLines.length === 0 ? (
                            <p className="text-slate-600">
                                {reel
                                    ? '# 케이스 1 엔트리가 꺼져 있어 연속성 핸드오프 데이터 없음 (단독 CatchShoot)'
                                    : '# "재생 생성"을 누르면 여기에 릴 간 전달 데이터가 표시됩니다'}
                            </p>
                        ) : (
                            debugLines.map((line, i) => (
                                <p key={i} className="text-emerald-400">
                                    <span className="text-slate-500">[{line.label}]</span> {line.detail}
                                </p>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── 우측: 전술 설정 탭 ── */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pl-4 border-l border-slate-800">
                <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">전술 설정 (공격팀)</h3>
                    <p className="text-[10px] text-slate-500">
                        현재는 "공격 포인트" 슬라이더만 캐치앤슛 스페이서 배치(인사이드/아웃사이드 존 선택)에 반영됩니다.
                        나머지 슬라이더는 후속 마일스톤에서 순차 연동 예정.
                    </p>
                </div>

                <div className="space-y-1">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">게임 운영</h4>
                    <SliderControl label="게임 템포" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                        steps={SLIDER_STEPS.pace} tooltip="빠를수록 빠른 공수전환과 얼리 오펜스를 시도합니다." />
                    <SliderControl label="볼 회전" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                        steps={SLIDER_STEPS.ballMovement} tooltip="패스 위주일수록 오픈 찬스를 찾지만, 턴오버 위험도 증가합니다." />
                    <SliderControl label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                        steps={SLIDER_STEPS.offReb} tooltip="적극 가담할수록 세컨드찬스가 늘지만, 상대 속공에 취약해집니다." />
                </div>

                <div className="h-px bg-slate-800" />

                <div className="space-y-1">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">슈팅 전략</h4>
                    <SliderControl label="3점 슛 빈도" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                        steps={SLIDER_STEPS.shot_3pt} tooltip="팀의 3점 시도 빈도를 결정합니다." />
                    <SliderControl label="골밑 공격 빈도" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                        steps={SLIDER_STEPS.shot_rim} tooltip="가장 효율적인 슛 구역으로, 드라이브/컷 능력과 연계됩니다." />
                    <SliderControl label="중거리 슛 빈도" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                        steps={SLIDER_STEPS.shot_mid} tooltip="중거리 슛은 효율이 낮습니다. 엘리트 미드레인지 슈터가 없다면 소극적으로 유지하세요." />
                </div>

                <div className="h-px bg-slate-800" />

                <div className="space-y-1">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">코칭 철학</h4>
                    <SliderControl label="공격 스타일" value={sliders.playStyle} onChange={v => updateSlider('playStyle', v)}
                        steps={SLIDER_STEPS.playStyle} tooltip="히어로 볼은 스타 선수의 1:1 창조력에 의존합니다. 시스템 농구는 팀 전체의 패싱/무빙으로 오픈 슛을 만듭니다." />
                    <SliderControl label="공격 포인트" value={sliders.insideOut} onChange={v => updateSlider('insideOut', v)}
                        steps={SLIDER_STEPS.insideOut} tooltip="인사이드는 페인트존 공격(포스트업, 컷, 롤)을 강조합니다. 아웃사이드는 외곽 슈팅(캐치앤슛, 팝, 드라이브킥)을 강조합니다." />
                    <SliderControl label="P&R 의존도" value={sliders.pnrFreq} onChange={v => updateSlider('pnrFreq', v)}
                        steps={SLIDER_STEPS.pnrFreq} tooltip="높을수록 픽앤롤 관련 플레이(핸들러, 롤, 팝) 비중이 커집니다. 핸들러+스크리너 콤비가 좋을수록 효과적." />
                </div>
            </div>
        </div>
    );
};
