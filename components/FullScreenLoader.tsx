
import React from 'react';
import { Loader2 } from 'lucide-react';

const FullScreenLoader: React.FC = () => (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[1000] backdrop-blur-md">
        <Loader2 size={64} className="text-indigo-500 animate-spin mb-4 opacity-50" />
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">Loading Simulation...</p>
    </div>
);

export default FullScreenLoader;
