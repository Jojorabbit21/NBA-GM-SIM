
import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    initialName: string;
}

export const PresetRenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onConfirm, initialName }) => {
    const [name, setName] = useState(initialName);
    useEffect(() => { setName(initialName); }, [initialName, isOpen]);
    
    const header = <h3 className="text-lg font-black text-white tracking-tight">프리셋 이름 변경</h3>;
    
    const footer = (
        <div className="flex justify-end gap-3 w-full">
            <Button variant="link" size="sm" onClick={onClose} className="px-4 py-2">취소</Button>
            <Button variant="primary" size="lg" shape="xl" onClick={() => { if(name.trim()) onConfirm(name.trim()); onClose(); }}>확인</Button>
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
