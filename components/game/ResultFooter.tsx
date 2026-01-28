
import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ResultFooterProps {
    onFinish: () => void;
}

export const ResultFooter: React.FC<ResultFooterProps> = ({ onFinish }) => {
    return (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center z-50">
            <button 
                onClick={onFinish}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4"
            >
                Continue to Dashboard <ChevronRight />
            </button>
        </div>
    );
};
