
import React from 'react';
import { Quote } from 'lucide-react';

export const ReviewStatBox: React.FC<{ 
    label: string, 
    value: number, 
    rank?: number, 
    isPercent?: boolean, 
    inverse?: boolean,
    colorTheme?: 'orange' | 'indigo' // Support different themes
}> = ({ label, value, rank, isPercent = false, inverse = false, colorTheme = 'orange' }) => {
    let rankColor = 'text-slate-500';
    if (rank !== undefined) {
        if (inverse) {
            if (rank <= 5) rankColor = 'text-red-400';
            else if (rank >= 25) rankColor = 'text-emerald-400';
        } else {
            if (rank <= 5) rankColor = 'text-amber-400';
            else if (rank <= 10) rankColor = 'text-emerald-400';
            else if (rank >= 25) rankColor = 'text-red-400';
        }
    }
    
    // Theme classes
    const hoverBorder = colorTheme === 'orange' ? 'hover:border-orange-500/50' : 'hover:border-indigo-500/50';
    const blurBg = colorTheme === 'orange' ? 'bg-amber-500/10' : 'bg-indigo-500/10';

    return (
        <div className={`bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group ${hoverBorder} transition-colors`}>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 z-10">{label}</span>
            <div className="flex items-baseline gap-2 z-10">
                <span className="text-2xl font-black oswald text-white">
                    {isPercent ? (value * 100).toFixed(1) + '%' : value.toFixed(1)}
                </span>
            </div>
            {rank !== undefined && (
                <div className={`text-[10px] font-bold uppercase tracking-tight bg-slate-950/50 px-2 py-0.5 rounded mt-1 ${rankColor}`}>
                    #{rank} in League
                </div>
            )}
            {(rank !== undefined && rank <= 5) && <div className={`absolute top-0 right-0 w-8 h-8 ${blurBg} blur-xl rounded-full`}></div>}
            {(rank === undefined) && <div className={`absolute top-0 right-0 w-8 h-8 ${blurBg} blur-xl rounded-full`}></div>}
        </div>
    );
};

export const ReviewOwnerMessage: React.FC<{
    ownerName: string;
    title: string;
    msg: string;
    mood: { color: string; borderColor: string; bg: string };
}> = ({ ownerName, title, msg, mood }) => {
    return (
        <div className={`relative p-8 rounded-3xl border ${mood.borderColor} ${mood.bg} flex flex-col md:flex-row gap-8 items-start shadow-xl`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20" style={{ color: mood.color.replace('text-', '') }}></div>
            
            <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl border border-slate-700 flex items-center justify-center shadow-lg">
                    <Quote size={32} className={mood.color} />
                </div>
            </div>
            
            <div className="space-y-4 flex-1">
                <div>
                    <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-1 ${mood.color}`}>From the Desk of {ownerName}</h4>
                    <h3 className="text-2xl font-black text-white">{title}</h3>
                </div>
                <div className="relative">
                    <p className="text-slate-300 leading-relaxed font-medium text-lg relative z-10">"{msg}"</p>
                </div>
                <div className="pt-4 flex justify-end">
                    <div className="text-right">
                        <p className="font-handwriting text-xl text-slate-300 transform -rotate-2 mb-2 pr-4">{ownerName}</p>
                        <div className="h-px w-48 bg-slate-700 mb-2 ml-auto"></div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Authorized Signature</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
