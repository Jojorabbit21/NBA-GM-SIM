
import React, { useState } from 'react';
import { Github, Twitter, Mail, Shield, FileText, Info, HelpCircle } from 'lucide-react';
import { AppView } from '../types';
import { LegalModal } from './LegalModal';
import { 
    PRIVACY_POLICY_TITLE, 
    PRIVACY_POLICY_CONTENT, 
    TERMS_OF_SERVICE_TITLE, 
    TERMS_OF_SERVICE_CONTENT,
    UPDATE_NOTES_TITLE,
    UPDATE_NOTES_CONTENT
} from '../utils/legalTexts';

interface FooterProps {
  onNavigate: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const currentYear = new Date().getFullYear();
  const [legalModalState, setLegalModalState] = useState<{
      isOpen: boolean;
      type: 'privacy' | 'terms' | 'updates' | null;
  }>({ isOpen: false, type: null });

  const handleNavigation = (view: AppView) => {
    onNavigate(view);
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openLegalModal = (type: 'privacy' | 'terms' | 'updates') => {
      setLegalModalState({ isOpen: true, type });
  };

  const closeLegalModal = () => {
      setLegalModalState({ ...legalModalState, isOpen: false });
  };

  const getModalContent = () => {
      switch (legalModalState.type) {
          case 'privacy': return { title: PRIVACY_POLICY_TITLE, content: PRIVACY_POLICY_CONTENT };
          case 'terms': return { title: TERMS_OF_SERVICE_TITLE, content: TERMS_OF_SERVICE_CONTENT };
          case 'updates': return { title: UPDATE_NOTES_TITLE, content: UPDATE_NOTES_CONTENT };
          default: return { title: '', content: '' };
      }
  };

  const { title, content } = getModalContent();

  return (
    <>
        <footer className="bg-slate-950 border-t border-slate-800 pt-16 pb-8 mt-auto relative z-10">
        {/* Container padding matches App.tsx main content padding (p-8 lg:p-12) */}
        <div className="w-full px-8 lg:px-12">
            
            {/* Main Content: Flex layout for left-aligned stacking */}
            <div className="flex flex-col md:flex-row items-start gap-12 lg:gap-24 mb-16">
            
            {/* Brand & Disclaimer Section */}
            <div className="max-w-sm space-y-4">
                <h3 className="text-2xl font-black text-white italic tracking-tighter">
                NBA <span className="text-indigo-500">GM SIM</span>
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed font-medium">
                본 서비스는 팬 메이드 시뮬레이션 게임이며, NBA(National Basketball Association) 
                또는 산하 구단과 직접적인 연관이 없습니다. 모든 팀 로고와 선수 이름의 저작권은 
                해당 소유자에게 있습니다.
                </p>
                <div className="flex gap-4 pt-2">
                <a href="#" className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                    <Github size={18} />
                </a>
                <a href="#" className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-all">
                    <Twitter size={18} />
                </a>
                <a href="#" className="p-2 bg-slate-900 rounded-full text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all">
                    <Mail size={18} />
                </a>
                </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Game Menu</h4>
                <ul className="space-y-2 text-sm font-bold text-slate-400">
                <li><button onClick={() => handleNavigation('Roster')} className="hover:text-indigo-400 transition-colors text-left">로스터 관리</button></li>
                <li><button onClick={() => handleNavigation('Transactions')} className="hover:text-indigo-400 transition-colors text-left">트레이드 센터</button></li>
                <li><button onClick={() => handleNavigation('Standings')} className="hover:text-indigo-400 transition-colors text-left">리그 순위표</button></li>
                <li><button onClick={() => handleNavigation('Leaderboard')} className="hover:text-indigo-400 transition-colors text-left">리더보드</button></li>
                <li><button onClick={() => handleNavigation('Playoffs')} className="hover:text-indigo-400 transition-colors text-left">플레이오프</button></li>
                <li><button onClick={() => handleNavigation('Schedule')} className="hover:text-indigo-400 transition-colors text-left">일정 및 결과</button></li>
                </ul>
            </div>

            {/* Legal & Info */}
            <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Legal & Info</h4>
                <ul className="space-y-2 text-sm font-bold text-slate-400">
                <li>
                    <button onClick={() => handleNavigation('Help')} className="flex items-center gap-2 hover:text-emerald-400 transition-colors text-left">
                    <HelpCircle size={14} /> 게임 가이드
                    </button>
                </li>
                <li>
                    <button onClick={() => openLegalModal('privacy')} className="flex items-center gap-2 hover:text-emerald-400 transition-colors text-left">
                    <Shield size={14} /> 개인정보처리방침
                    </button>
                </li>
                <li>
                    <button onClick={() => openLegalModal('terms')} className="flex items-center gap-2 hover:text-emerald-400 transition-colors text-left">
                    <FileText size={14} /> 이용약관
                    </button>
                </li>
                <li>
                    <button onClick={() => openLegalModal('updates')} className="flex items-center gap-2 hover:text-emerald-400 transition-colors text-left">
                    <Info size={14} /> 업데이트 노트
                    </button>
                </li>
                </ul>
            </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-slate-900 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                © {currentYear} NBA GM Simulator. All rights reserved.
            </p>
            <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Version 1.0.2 (Beta)
            </p>
            </div>
        </div>
        </footer>

        {/* Legal Modal */}
        <LegalModal 
            isOpen={legalModalState.isOpen}
            onClose={closeLegalModal}
            icon={legalModalState.type || undefined}
            title={title}
            content={content}
        />
    </>
  );
};
