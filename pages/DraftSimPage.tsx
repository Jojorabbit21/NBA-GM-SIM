import React, { useState, useRef, useCallback } from 'react';
import { runDraftSimulations } from '../services/draft/draftSimulator';
import { TEAM_DATA } from '../data/teamData';
import { Copy, Check, Shuffle, RotateCcw } from 'lucide-react';

const TEAM_IDS = Object.keys(TEAM_DATA).sort();
const DEFAULT_ORDER = TEAM_IDS.slice(0, 30);

const DraftSimPage: React.FC = () => {
    const [seed, setSeed] = useState('test-seed');
    const [iterations, setIterations] = useState(1);
    const [isRunning, setIsRunning] = useState(false);
    const [lines, setLines] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    const [teamOrder, setTeamOrder] = useState<string[]>(DEFAULT_ORDER);
    const preRef = useRef<HTMLPreElement>(null);

    const setPickTeam = useCallback((pickIdx: number, teamId: string) => {
        setTeamOrder(prev => {
            const next = [...prev];
            next[pickIdx] = teamId;
            return next;
        });
    }, []);

    const shuffle = useCallback(() => {
        setTeamOrder(() =>
            Array.from({ length: 30 }, () => TEAM_IDS[Math.floor(Math.random() * TEAM_IDS.length)])
        );
    }, []);

    const resetOrder = useCallback(() => setTeamOrder(DEFAULT_ORDER), []);

    const handleRun = useCallback(async () => {
        setIsRunning(true);
        const buffer: string[] = [];
        await runDraftSimulations(
            { seed, iterations, seasonNumber: 1, pickOrder: teamOrder },
            (line) => {
                buffer.push(line);
                setLines([...buffer]);
                requestAnimationFrame(() => {
                    if (preRef.current) {
                        preRef.current.scrollTop = preRef.current.scrollHeight;
                    }
                });
            },
        );
        setIsRunning(false);
    }, [seed, iterations, teamOrder]);

    return (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 120px)' }}>
            {/* Left: Pick order panel */}
            <div className="w-52 shrink-0 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">픽 순서 (1~30)</span>
                    <div className="flex gap-1">
                        <button
                            onClick={shuffle}
                            disabled={isRunning}
                            title="랜덤 (중복 허용)"
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                        >
                            <Shuffle size={13} />
                        </button>
                        <button
                            onClick={resetOrder}
                            disabled={isRunning}
                            title="초기화"
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                    {teamOrder.map((teamId, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 w-5 text-right shrink-0">{idx + 1}</span>
                            <select
                                value={teamId}
                                onChange={e => setPickTeam(idx, e.target.value)}
                                disabled={isRunning}
                                className="flex-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-300 disabled:opacity-50 min-w-0"
                            >
                                {TEAM_IDS.map(id => (
                                    <option key={id} value={id}>
                                        {TEAM_DATA[id]?.name ?? id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Controls + Terminal */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        시드
                        <input
                            type="text"
                            value={seed}
                            onChange={e => setSeed(e.target.value)}
                            disabled={isRunning}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm w-36 disabled:opacity-50"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        반복 횟수
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={iterations}
                            onChange={e => setIterations(Math.max(1, parseInt(e.target.value) || 1))}
                            disabled={isRunning}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm w-16 disabled:opacity-50"
                        />
                    </label>
                    <button
                        onClick={handleRun}
                        disabled={isRunning}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm text-white transition-colors"
                    >
                        {isRunning ? 'Running...' : '시뮬레이션 시작'}
                    </button>
                    <button
                        onClick={() => setLines([])}
                        disabled={isRunning}
                        className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-sm text-white transition-colors"
                    >
                        초기화
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(lines.join('\n'));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        }}
                        disabled={isRunning || lines.length === 0}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-sm text-white transition-colors"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? '복사됨' : '복사'}
                    </button>
                </div>
                <pre
                    ref={preRef}
                    className="font-mono text-xs bg-black text-green-400 rounded p-4 overflow-auto whitespace-pre flex-1"
                >
                    {lines.length > 0 ? lines.join('\n') : '$ 시뮬레이션 시작 버튼을 눌러주세요'}
                </pre>
            </div>
        </div>
    );
};

export default DraftSimPage;
