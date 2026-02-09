
import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './common/Modal';

interface ResetDataModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ResetDataModal: React.FC<ResetDataModalProps> = ({ 
  isOpen, 
  isLoading, 
  onClose, 
  onConfirm 
}) => {
  return (
    <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        size="sm"
        // No Header Title, using custom body content
    >
        <div className="p-8 text-center flex flex-col items-center">
            <div className="bg-red-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-red-500/30">
                <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h3 className="text-2xl font-black text-white mb-2 uppercase oswald">데이터 초기화</h3>
            <p className="text-slate-400 font-bold text-sm leading-relaxed mb-8">
                현재 진행 중인 모든 시즌 데이터와 세이브 파일이 영구적으로 삭제됩니다.<br/>
                이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?
            </p>
            <div className="flex gap-4 w-full">
                <button 
                    onClick={onClose} 
                    disabled={isLoading}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50"
                >
                    취소
                </button>
                <button 
                    onClick={onConfirm} 
                    disabled={isLoading}
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                    {isLoading ? '초기화 중...' : '초기화 실행'}
                </button>
            </div>
        </div>
    </Modal>
  );
};
