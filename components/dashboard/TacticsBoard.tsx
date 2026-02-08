
const SliderControl: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, max?: number, leftLabel?: string, rightLabel?: string, tooltip?: string }> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip }) => (
  <div className="space-y-2 group/slider w-full">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-sm font-black text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
        {tooltip && (
            <div className="relative group/tooltip">
                <HelpCircle size={14} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2.5 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed text-center">
                    {tooltip}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-slate-700 rotate-45"></div>
                </div>
            </div>
        )}
      </div>
      <span className="text-lg font-black text-indigo-400 font-mono">{value}</span>
    </div>
    <div className="relative flex items-center h-6">
       <input 
         type="range" 
         min={min} 
         max={max} 
         value={value} 
         onChange={(e) => onChange(parseInt(e.target.value))} 
         className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
       />
    </div>
    <div className="flex justify-between text-xs font-bold text-slate-600 uppercase tracking-tighter">
       <span>{leftLabel || 'Low'}</span>
       <span>{rightLabel || 'High'}</span>
    </div>
  </div>
);
