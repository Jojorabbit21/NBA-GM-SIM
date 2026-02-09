
import React, { useMemo } from 'react';
import { Player } from '../../../types';

// SVG Paths & Constants
const COURT_LINES = [
  "M149.6,403 V238.4 H285 V403", // Key
  "M269.2,237.7h-1.4c0-27.8-22.6-50.4-50.4-50.4s-50.4,22.6-50.4,50.4h-1.4c0-28.6,23.3-51.8,51.8-51.8s51.8,23.3,51.8,51.8Z", // Free Throw Circle
  "M269.1,237.7c0,2.6-.2,5.3-.6,7.9l-1.4-.2c.6-3.6.7-7.3.5-11h1.4c0,1,.1,2.2.1,3.3ZM267.1,223.2l-1.4.4c-1-3.5-2.4-6.9-4.2-10.1l1.3-.7c1.8,3.3,3.3,6.8,4.3,10.4ZM265.6,256.5c-1.4,3.5-3.1,6.9-5.2,10l-1.2-.8c2-3,3.7-6.3,5.1-9.7l1.3.5ZM256.3,203.5l-1.1.9c-2.4-2.7-5.1-5.2-8.1-7.4l.9-1.2c3,2.2,5.8,4.8,8.3,7.6ZM253.1,275.1c-2.7,2.6-5.7,4.9-9,6.9l-.7-1.2c3.1-1.9,6.1-4.1,8.7-6.7l1,1ZM238.2,190.2l-.6,1.3c-3.4-1.5-6.9-2.6-10.5-3.3l.3-1.4c3.7.7,7.3,1.9,10.8,3.4ZM233.9,286.8c-1.4.5-2.8.9-4.3,1.2-2.2.5-4.5,1-6.8,1.2l-.2-1.4c2.2-.2,4.4-.6,6.6-1.2,1.4-.3,2.8-.7,4.1-1.2l.5,1.4ZM216.2,187.3c-3.6,0-7.3.6-10.9,1.5-2.8.7-5.5,1.6-8.2,2.7l-.6-1.3c2.7-1.2,5.5-2.1,8.4-2.8,3.7-.9,7.4-1.4,11.2-1.5v1.4ZM211.8,287.8l-.2,1.4c-3.7-.4-7.5-1.2-11-2.5l.5-1.4c3.5,1.2,7.1,2,10.7,2.4ZM191.1,280.7l-.7,1.2c-3.2-2-6.2-4.3-9-6.9l1-1c2.6,2.5,5.6,4.8,8.7,6.7ZM187.6,196.9c-3,2.2-5.7,4.6-8.1,7.4l-1.1-1c2.5-2.8,5.3-5.4,8.3-7.6l.8,1.2ZM175.4,265.6l-1.2.8c-2.1-3.1-3.8-6.5-5.2-10l1.3-.5c1.3,3.4,3,6.7,5,9.8ZM173.2,213.3c-1.8,3.2-3.2,6.6-4.2,10.1l-1.4-.4c1.1-3.6,2.5-7.1,4.4-10.4l1.3.7ZM167.5,245.2l-1.4.2c-.6-3.7-.7-7.5-.5-11.3h1.4c-.2,3.7,0,7.4.5,11.1Z",
  "M252.9,355.9v10.7h-1.4v-10.7c0-18.9-15.3-34.2-34.2-34.2s-34.2,15.3-34.2,34.2v10.7h-1.4v-10.7c0-19.6,16-35.6,35.6-35.6s35.6,16,35.6,35.6Z", // Restricted Area
  "M407.4,278.3v122.8h-1.4v-122.5c-31.5-76.9-105.5-126.6-188.6-126.6S60.2,201.7,28.7,278.6v122.5h-1.4v-122.9h0c15.2-37.4,40.9-69.1,74.3-91.9,34.2-23.4,74.2-35.7,115.7-35.7s81.6,12.4,115.7,35.7c33.4,22.8,59,54.6,74.3,91.9h0Z" // 3PT Arc
];

const getStatColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 85) return 'text-purple-400';
    if (val >= 80) return 'text-indigo-400';
    if (val >= 75) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-400';
};

const getStatHex = (val: number) => {
    if (val >= 90) return '#e879f9'; 
    if (val >= 85) return '#c084fc'; 
    if (val >= 80) return '#818cf8'; 
    if (val >= 75) return '#34d399'; 
    if (val >= 70) return '#fbbf24'; 
    return '#64748b'; 
};

const CourtStatItem: React.FC<{ label: string, value: number, top: string, left: string, align?: 'left'|'center'|'right' }> = ({ label, value, top, left, align='center' }) => (
    <div className={`absolute flex flex-col items-center justify-center transform -translate-y-1/2 z-10 bg-slate-800 border border-slate-600 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg min-w-[60px]`} style={{ top, left, transform: `translate(${align === 'center' ? '-50%' : align === 'left' ? '0' : '-100%'}, -50%)` }}>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">{label}</span>
        <span className={`text-lg font-black font-mono leading-none ${getStatColor(value)}`}>{value}</span>
    </div>
);

interface TacticalHalfCourtProps {
    starters: Player[];
    type: 'offense' | 'defense';
}

export const TacticalHalfCourt: React.FC<TacticalHalfCourtProps> = ({ starters, type }) => {
    const stats = useMemo(() => {
        if (starters.length === 0) return null;
        
        const getGroupAvg = (positions: string[], stat: keyof Player) => {
            const group = starters.filter(p => positions.some(pos => p.position.includes(pos)));
            if (!group.length) return 0;
            return Math.round(group.reduce((acc, p) => acc + (p[stat] as number || 0), 0) / group.length);
        };

        const sum = (key: keyof Player) => starters.reduce((acc, p) => acc + (p[key] as number || 0), 0);
        const avg = (val: number) => Math.round(val / starters.length);

        const layup = sum('layup');
        const dunk = sum('dunk');
        const close = sum('closeShot');
        const mid = sum('midRange');
        const threeSum = starters.reduce((acc, p) => acc + ((p.threeCorner + p.three45 + p.threeTop) / 3), 0);
        
        const perDef = getGroupAvg(['PG', 'SG', 'SF'], 'perDef');
        const steal = getGroupAvg(['PG', 'SG', 'SF'], 'steal');
        const intDef = getGroupAvg(['SF', 'PF', 'C'], 'intDef');
        const block = getGroupAvg(['SF', 'PF', 'C'], 'blk');

        return {
            rim: avg((layup + dunk) / 2),
            paint: avg(close),
            mid: avg(mid),
            three: Math.round(threeSum / starters.length),
            perDef,
            intDef,
            steal,
            block
        };
    }, [starters]);

    if (!stats) return <div className="h-full flex items-center justify-center text-slate-500 text-xs">주전 정보 없음</div>;

    return (
        <div className="w-full aspect-[435/403] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative shadow-inner group">
            <svg viewBox="0 0 435 403" className="w-full h-full">
                <rect x="0" y="0" width="435" height="403" fill="#0f172a" />
                <path d={COURT_LINES[0]} fill={getStatHex(stats.intDef)} fillOpacity="0.3" stroke="none" />
                <g fill="none" stroke="#475569" strokeWidth="2">
                    {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                    <circle cx="217.5" cy="375" r="7.5" stroke="#94a3b8" />
                    <line x1="187.5" y1="390" x2="247.5" y2="390" stroke="#94a3b8" strokeWidth="3" /> 
                </g>
            </svg>

            <div className="absolute inset-0">
                {type === 'offense' ? (
                    <>
                        <CourtStatItem label="3PT" value={stats.three} top="20%" left="50%" />
                        <CourtStatItem label="MID" value={stats.mid} top="48%" left="50%" />
                        <CourtStatItem label="PAINT" value={stats.paint} top="75%" left="50%" />
                        <CourtStatItem label="RIM" value={stats.rim} top="88%" left="25%" align="left" />
                    </>
                ) : (
                    <>
                        <CourtStatItem label="PER. DEF" value={stats.perDef} top="35%" left="30%" align="right" />
                        <CourtStatItem label="STEAL" value={stats.steal} top="35%" left="70%" align="left" />
                        <CourtStatItem label="INT. DEF" value={stats.intDef} top="75%" left="30%" align="right" />
                        <CourtStatItem label="BLOCK" value={stats.block} top="75%" left="70%" align="left" />
                    </>
                )}
            </div>
        </div>
    );
};
