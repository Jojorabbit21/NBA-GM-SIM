
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, FileText, Info } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  icon?: 'privacy' | 'terms' | 'updates';
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, title, content, icon }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
      switch(icon) {
          case 'privacy': return <Shield className="text-emerald-400" size={24} />;
          case 'terms': return <FileText className="text-indigo-400" size={24} />;
          case 'updates': return <Info className="text-blue-400" size={24} />;
          default: return <FileText className="text-slate-400" size={24} />;
      }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        ref={modalRef} 
        className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-xl">
                {renderIcon()}
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight oswald">{title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-900">
            <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-line leading-relaxed">
                {content}
            </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-800 bg-slate-950/50 rounded-b-3xl flex justify-end">
            <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
            >
                확인
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
