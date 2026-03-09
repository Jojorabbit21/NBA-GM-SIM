
import React, { useState } from 'react';
import { Shield, FileText } from 'lucide-react';
import { Modal } from './common/Modal';
import {
  TERMS_OF_SERVICE_TITLE,
  TERMS_OF_SERVICE_CONTENT,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_CONTENT,
} from '../utils/legalTexts';

type LegalTab = 'terms' | 'privacy';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS: { key: LegalTab; label: string; icon: React.ReactNode; title: string; content: string }[] = [
  { key: 'terms', label: '이용약관', icon: <FileText size={16} />, title: TERMS_OF_SERVICE_TITLE, content: TERMS_OF_SERVICE_CONTENT },
  { key: 'privacy', label: '개인정보처리방침', icon: <Shield size={16} />, title: PRIVACY_POLICY_TITLE, content: PRIVACY_POLICY_CONTENT },
];

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<LegalTab>('terms');
  const current = TABS.find(t => t.key === activeTab)!;

  const headerContent = (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-slate-800 rounded-xl">
        {current.icon}
      </div>
      <h2 className="text-xl font-black text-white uppercase tracking-tight oswald">{current.title}</h2>
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
      {/* Tabs */}
      <div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center h-12">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 font-black text-xs px-4 h-full transition-all ${
              activeTab === tab.key
                ? 'text-indigo-400 border-indigo-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-8">
        <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-line leading-relaxed">
          {current.content}
        </div>
      </div>
    </Modal>
  );
};
