
import React, { useCallback, useState } from 'react';
import { Copy, Trash2, Check, Play } from 'lucide-react';
import { PhysicsCourtView } from '../game/PhysicsCourtView';
import { useReelPlayback } from './useReelPlayback';
import type { ChoreographyReel } from '../../services/game/engine/pbp/choreographyTypes';
import type { CourtSnapshot } from '../../services/game/engine/pbp/pbpTypes';

// ─────────────────────────────────────────────────────────────
// 코트 위 좌표 수동 지정 도구. "가상 슈팅 포인트"(§14 후속 논의 — 존별 4~5개 후보 좌표) 같은
// 좌표 테이블을 눈으로 보면서 찍고, 코드에 바로 붙여넣을 수 있는 형태로 복사하기 위한 개발자
// 도구. PhysicsCourtView의 onCourtClick(기존에 있었지만 아무도 안 쓰던 prop)을 재사용 — 클릭
// 좌표를 코트 피트 단위로 변환하는 로직은 이미 PhysicsCourtView.handleClick()에 구현돼 있음.
// ─────────────────────────────────────────────────────────────

interface PickedPoint {
    id: string;
    label: string;
    x: number;
    y: number;
}

// 대화 중 직접 찍어서 확정한 10개 존 가상 슈팅 포인트(총 73개, 코너 6개 제외 후 최종) — 좌표
// 피커를 열 때 바로 보이도록 시딩.
const COLLECTED_POINTS: Omit<PickedPoint, 'id'>[] = [
    // 코너3 (위/아래)
    { label: 'cor_top_2', x: 3.5, y: 1.2 }, { label: 'cor_top_3', x: 8, y: 1.2 },
    { label: 'cor_top_6', x: 12.5, y: 1.2 },
    { label: 'cor_bot_2', x: 3.5, y: 48.2 }, { label: 'cor_bot_4', x: 8, y: 48.2 },
    { label: 'cor_bot_6', x: 12.5, y: 48.2 },
    // 미드레인지 (하/상/중)
    { label: 'mid_bot_1', x: 18.6, y: 40.2 }, { label: 'mid_bot_2', x: 14.6, y: 42.8 },
    { label: 'mid_bot_3', x: 10.2, y: 42.8 }, { label: 'mid_bot_4', x: 4.9, y: 42.8 },
    { label: 'mid_bot_5', x: 4.9, y: 36.7 }, { label: 'mid_bot_6', x: 10.2, y: 36.7 },
    { label: 'mid_bot_7', x: 15.1, y: 37.5 },
    { label: 'mid_top_1', x: 15.1, y: 13.2 }, { label: 'mid_top_2', x: 15.1, y: 6.6 },
    { label: 'mid_top_3', x: 18.1, y: 9.6 }, { label: 'mid_top_4', x: 9.8, y: 6.1 },
    { label: 'mid_top_5', x: 4.4, y: 6.1 }, { label: 'mid_top_6', x: 4.9, y: 12.3 },
    { label: 'mid_top_7', x: 10.2, y: 11.8 },
    { label: 'mid_cen_1', x: 21.7, y: 14 }, { label: 'mid_cen_2', x: 23.5, y: 18.1 },
    { label: 'mid_cen_3', x: 25.7, y: 24.7 }, { label: 'mid_cen_4', x: 23.5, y: 30.9 },
    { label: 'mid_cen_5', x: 21.7, y: 34.5 }, { label: 'mid_cen_6', x: 21.3, y: 21.1 },
    { label: 'mid_cen_7', x: 21.3, y: 27.4 },
    // 페인트
    { label: 'paint_1', x: 12, y: 19.4 }, { label: 'paint_2', x: 16.9, y: 19.4 },
    { label: 'paint_3', x: 12, y: 24.7 }, { label: 'paint_4', x: 16.9, y: 24.7 },
    { label: 'paint_5', x: 12, y: 30 }, { label: 'paint_6', x: 16.9, y: 30 },
    // 제한구역
    { label: 'ra_1', x: 8, y: 30.9 }, { label: 'ra_2', x: 8, y: 27.8 },
    { label: 'ra_3', x: 8, y: 24.7 }, { label: 'ra_4', x: 8, y: 22 },
    { label: 'ra_5', x: 8, y: 18.9 }, { label: 'ra_6', x: 4.9, y: 24.7 },
    { label: 'ra_7', x: 4.9, y: 27.8 }, { label: 'ra_8', x: 4.9, y: 30.9 },
    { label: 'ra_9', x: 4.9, y: 21.6 }, { label: 'ra_10', x: 4.9, y: 18.9 },
    // 45도 윙3 (하/상)
    { label: '45_bot_1', x: 16.4, y: 47.7 }, { label: '45_bot_2', x: 19.5, y: 46 },
    { label: '45_bot_3', x: 22.2, y: 43.8 }, { label: '45_bot_4', x: 24.8, y: 41.1 },
    { label: '45_bot_5', x: 27, y: 38.9 }, { label: '45_bot_6', x: 19.1, y: 48.2 },
    { label: '45_bot_7', x: 22.2, y: 46 }, { label: '45_bot_8', x: 24.8, y: 43.8 },
    { label: '45_bot_9', x: 27.5, y: 41.6 },
    { label: '45_top_1', x: 16.4, y: 2.3 }, { label: '45_top_2', x: 19.5, y: 4 },
    { label: '45_top_3', x: 22.2, y: 6.2 }, { label: '45_top_4', x: 24.8, y: 8.9 },
    { label: '45_top_5', x: 27, y: 11.1 }, { label: '45_top_6', x: 19.1, y: 1.8 },
    { label: '45_top_7', x: 22.2, y: 4 }, { label: '45_top_8', x: 24.8, y: 6.2 },
    { label: '45_top_9', x: 27.5, y: 8.4 },
    // 탑3
    { label: 'top_1', x: 28.4, y: 36.7 }, { label: 'top_2', x: 30.1, y: 32.3 },
    { label: 'top_3', x: 31.1, y: 27.8 }, { label: 'top_4', x: 31.1, y: 23 },
    { label: 'top_5', x: 30.1, y: 18.5 }, { label: 'top_6', x: 28.4, y: 14 },
    { label: 'top_7', x: 31.1, y: 14.9 }, { label: 'top_8', x: 33.3, y: 19.8 },
    { label: 'top_9', x: 31.1, y: 25.2 }, { label: 'top_10', x: 34.1, y: 25.2 },
    { label: 'top_11', x: 33.3, y: 30 }, { label: 'top_12', x: 31.5, y: 34.9 },
];

function seedPoints(): PickedPoint[] {
    return COLLECTED_POINTS.map((p, i) => ({ ...p, id: `seed-${i}` }));
}

/** 한 지점에 선수 1명을 세워두고 슛 1회만 재생하는 최소 릴. 실제 안무 파이프라인
 *  (generateChoreography 등) 없이, 이 도구용으로 최소 스냅샷만 직접 구성 — 캐치→슛 흐름은
 *  기존 CatchShoot 패턴(§8-6)과 동일한 타이밍(0.3s 홀드 + 0.8s 슛)을 그대로 따름. */
function buildDemoReel(point: { x: number; y: number }): ChoreographyReel {
    const snapshot: CourtSnapshot = {
        offTeamId: 'DEMO',
        positions: [
            { playerId: 'demo-shooter', x: point.x, y: point.y, role: 'ballHandler', hasBall: true, position: 'SF', isHome: true },
        ],
    };
    return [
        { snapshot, durationSec: 0.3, ballEvent: 'dribble' },
        { snapshot, durationSec: 0.8, ballEvent: 'shoot' },
    ];
}

export const CourtPointPicker: React.FC = () => {
    const [points, setPoints] = useState<PickedPoint[]>(seedPoints);
    const [copied, setCopied] = useState(false);
    const [showZoneGuides, setShowZoneGuides] = useState(true);
    const [demoReel, setDemoReel] = useState<ChoreographyReel | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { displaySnapshot, ballDisplay } = useReelPlayback(demoReel);

    const handlePlayPoint = useCallback((point: { x: number; y: number }) => {
        setDemoReel(buildDemoReel(point));
    }, []);

    const handleCourtClick = useCallback((point: { x: number; y: number }) => {
        setPoints(prev => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, label: `point_${prev.length + 1}`, x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 },
        ]);
        setCopied(false);
    }, []);

    const handleLabelChange = useCallback((id: string, label: string) => {
        setPoints(prev => prev.map(p => (p.id === id ? { ...p, label } : p)));
    }, []);

    const handleCoordChange = useCallback((id: string, axis: 'x' | 'y', raw: string) => {
        const value = parseFloat(raw);
        setPoints(prev => prev.map(p => (p.id === id ? { ...p, [axis]: Number.isFinite(value) ? value : p[axis] } : p)));
    }, []);

    const handleDelete = useCallback((id: string) => {
        setPoints(prev => prev.filter(p => p.id !== id));
    }, []);

    const handleClear = useCallback(() => {
        setPoints([]);
        setCopied(false);
    }, []);

    const handleReload = useCallback(() => {
        setPoints(seedPoints());
        setCopied(false);
    }, []);

    const handleCopy = useCallback(() => {
        const body = points.map(p => `    ${p.label}: { x: ${p.x}, y: ${p.y} },`).join('\n');
        const text = `{\n${body}\n}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [points]);

    return (
        <div className="flex gap-4 h-full min-h-0">
            {/* ── 좌측: 찍은 포인트 목록 ── */}
            <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
                <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">코트 좌표 피커</label>
                    <p className="text-[10px] text-slate-500 mt-1">코트를 클릭해 포인트를 추가하거나, 아래 목록에서 라벨·x·y를 직접 수정하세요. 수정하면 코트에 바로 반영됩니다.</p>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={showZoneGuides} onChange={e => setShowZoneGuides(e.target.checked)} className="accent-indigo-600" />
                    존 경계 가이드 표시
                </label>
                {showZoneGuides && (
                    <p className="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 rounded-lg p-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400 mr-1.5 align-middle" />
                        PlayerDetailView 샷차트에서 쓰는 10개 존 경계 그대로(<code className="text-slate-400">utils/courtZones.ts</code>) — 왼쪽 골대 기준, 오른쪽은 자동 미러링
                    </p>
                )}

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        disabled={points.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors"
                    >
                        {copied ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 좌표 복사</>}
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={points.length === 0}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-xs font-bold rounded-lg transition-colors"
                    >
                        <Trash2 size={13} /> 전체 삭제
                    </button>
                </div>
                <button
                    onClick={handleReload}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg transition-colors"
                >
                    저장된 73개 포인트 다시 불러오기
                </button>

                <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                    <span className="w-5" />
                    <span className="flex-1">라벨</span>
                    <span className="w-14 text-center">x</span>
                    <span className="w-14 text-center">y</span>
                    <span className="w-4" />
                </div>
                <div className="space-y-1.5">
                    {points.length === 0 ? (
                        <p className="text-[11px] text-slate-600">아직 찍은 포인트가 없습니다.</p>
                    ) : (
                        points.map(p => (
                            <div
                                key={p.id}
                                onClick={() => setSelectedId(p.id)}
                                className={`flex items-center gap-1.5 bg-slate-800 border rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                                    selectedId === p.id ? 'border-cyan-400' : 'border-slate-700'
                                }`}
                            >
                                <button
                                    onClick={() => { handlePlayPoint(p); setSelectedId(p.id); }}
                                    className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                                >
                                    <Play size={10} />
                                </button>
                                <input
                                    value={p.label}
                                    onChange={e => handleLabelChange(p.id, e.target.value)}
                                    className="flex-1 min-w-0 bg-transparent text-xs text-white outline-none"
                                />
                                <input
                                    type="number" step={0.1} value={p.x}
                                    onChange={e => handleCoordChange(p.id, 'x', e.target.value)}
                                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-white font-mono outline-none focus:border-indigo-500"
                                />
                                <input
                                    type="number" step={0.1} value={p.y}
                                    onChange={e => handleCoordChange(p.id, 'y', e.target.value)}
                                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-white font-mono outline-none focus:border-indigo-500"
                                />
                                <button onClick={() => handleDelete(p.id)} className="shrink-0 text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── 우측: 코트 ── */}
            <div className="flex-1 min-w-0 flex items-center justify-center">
                <div className="w-full max-w-3xl">
                    <PhysicsCourtView
                        courtSnapshot={displaySnapshot}
                        homeTeamId="DEMO"
                        homeColor="#6366f1"
                        awayColor="#f59e0b"
                        onCourtClick={handleCourtClick}
                        markers={points.map(p => ({
                            x: p.x, y: p.y,
                            onClick: () => { handlePlayPoint(p); setSelectedId(p.id); },
                            opacity: selectedId === p.id ? 0.8 : 0.3,
                        }))}
                        showZoneGuides={showZoneGuides}
                        ball={ballDisplay}
                    />
                </div>
            </div>
        </div>
    );
};
