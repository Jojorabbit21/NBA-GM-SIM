
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SimulationCourtProps {
    isFinished: boolean;
}

export const SimulationCourt: React.FC<SimulationCourtProps> = ({ isFinished }) => {
    const [shots, setShots] = useState<{id: number, x: number, y: number, isMake: boolean}[]>([]);

    useEffect(() => {
        const shotTimer = setInterval(() => {
            setShots(prev => {
                if (isFinished) return prev;
                const isHome = Math.random() > 0.5;
                const isMake = Math.random() > 0.45;
                const hoopX = isHome ? 88.75 : 5.25;
                const direction = isHome ? -1 : 1;
                const dist = Math.random() * 28;
                const angle = (Math.random() * Math.PI) - (Math.PI / 2);
                const x = Math.max(2, Math.min(92, hoopX + Math.cos(angle) * dist * direction));
                const y = Math.max(2, Math.min(48, 25 + Math.sin(angle) * dist));
                return [...prev.slice(-40), { id: Date.now(), x, y, isMake }];
            });
        }, 200); 

        return () => clearInterval(shotTimer);
    }, [isFinished]);

    return (
        <div className="relative w-full aspect-[94/50] bg-slate-950 border-t border-slate-800">
            <svg viewBox="0 0 94 50" className="absolute inset-0 w-full h-full opacity-80">
                <rect width="94" height="50" fill="#0f172a" />
                <g fill="none" stroke="#1e293b" strokeWidth="0.4">
                    <rect x="0" y="0" width="94" height="50" />
                    <line x1="47" y1="0" x2="47" y2="50" />
                    <circle cx="47" cy="25" r="6" />
                    <circle cx="47" cy="25" r="2" fill="#1e293b" />
                    <rect x="0" y="17" width="19" height="16" />
                    <circle cx="19" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 0 3 L 14 3 A 23.75 23.75 0 0 1 14 47 L 0 47" />
                    <circle cx="5.25" cy="25" r="1.5" />
                    <rect x="75" y="17" width="19" height="16" />
                    <circle cx="75" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 94 3 L 80 3 A 23.75 23.75 0 0 0 80 47 L 94 47" />
                    <circle cx="88.75" cy="25" r="1.5" />
                </g>
            </svg>
            {shots.map(s => (
                <div key={s.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000" style={{ left: `${(s.x / 94) * 100}%`, top: `${(s.y / 50) * 100}%` }}>
                    {s.isMake ? <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] border border-emerald-300"></div> : <X size={12} className="text-red-500/60 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" strokeWidth={3} />}
                </div>
            ))}
        </div>
    );
};
