
import React from 'react';
import { Construction } from 'lucide-react';

interface Props {
    title: string;
}

const MultiComingSoonView: React.FC<Props> = ({ title }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-200 pretendard gap-4">
        <Construction size={40} className="text-slate-600" />
        <div className="text-center">
            <h2 className="text-lg font-black text-slate-300 ko-tight">{title}</h2>
            <p className="text-sm text-slate-500 ko-normal mt-1">준비 중입니다.</p>
        </div>
    </div>
);

export default MultiComingSoonView;
