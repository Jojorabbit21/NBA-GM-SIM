
import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    initialName: string;
}

export const PresetRenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onConfirm, initialName }) => {
    const [name, setName] = useState(initialName);
    useEffect(() => { setName(initialName); }, [initialName, isOpen]);
    
    const header = <h3 className="text-lg font-black text-white uppercase tracking-tight">프리셋 이름 변경</h3>;
    
    const footer = (
        <div className="flex justify-end gap-3 w-full">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">취소</button>
            <button onClick={() => { if(name.trim()) onConfirm(name.trim()); onClose(); }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all">확인</button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={header}
            footer={footer}
            size="sm"
        >
            <div className="p-6">
                 <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="전술 이름을 입력하세요"
                    autoFocus
                />
            </div>
        </Modal>
    );
};
