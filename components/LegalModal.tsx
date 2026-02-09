
import React from 'react';
import { Shield, FileText, Info } from 'lucide-react';
import { Modal } from './common/Modal';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  icon?: 'privacy' | 'terms' | 'updates';
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, title, content, icon }) => {
  
  const renderIcon = () => {
      switch(icon) {
          case 'privacy': return <Shield className="text-emerald-400" size={24} />;
          case 'terms': return <FileText className="text-indigo-400" size={24} />;
          case 'updates': return <Info className="text-blue-400" size={24} />;
          default: return <FileText className="text-slate-400" size={24} />;
      }
  };

  const headerContent = (
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-800 rounded-xl">
            {renderIcon()}
        </div>
        <h2 className="text-xl font-black text-white uppercase tracking-tight oswald">{title}</h2>
      </div>
  );

  const footerContent = (
      <div className="flex justify-end">
        <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
        >
            확인
        </button>
      </div>
  );

  return (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={headerContent}
        footer={footerContent}
        size="md"
    >
        <div className="p-8">
            <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-line leading-relaxed">
                {content}
            </div>
        </div>
    </Modal>
  );
};
