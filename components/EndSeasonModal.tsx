
import React from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Modal } from './common/Modal';

interface EndSeasonModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onReset: () => void;
}

export const EndSeasonModal: React.FC<EndSeasonModalProps> = ({
  isOpen,
  isLoading,
  onClose,
  onReset
}) => {
  return (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="sm"
    >
        <div className="p-8 text-center flex flex-col items-center">
            <div className="bg-amber-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/30">
                <Flag className="text-amber-500" size={32} />
            </div>
            <h3 className="text-2xl font-black text-white mb-2 uppercase">시즌 종료</h3>
            <p className="text-slate-400 font-bold text-sm leading-relaxed mb-8">
                시즌이 종료되었습니다.<br/>
                데이터를 초기화하고 새 시즌을 시작하거나,<br/>
                현재 상태에서 계속 머무를 수 있습니다.
            </p>
            <div className="flex gap-4 w-full">
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50"
                >
                    계속 머무르기
                </button>
                <button
                    onClick={onReset}
                    disabled={isLoading}
                    className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-amber-900/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                    {isLoading ? '초기화 중...' : '새 시즌 시작'}
                </button>
            </div>
        </div>
    </Modal>
  );
};
