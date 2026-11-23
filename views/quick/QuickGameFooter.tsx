import React from 'react';
import { APP_NAME, APP_YEAR } from '../../utils/constants';
import { APP_VERSION, FOOTER_LINKS, getServiceDisclaimer } from '../../utils/serviceInfo';

// [2026-11-23] Quick Game 푸터 — 메인 화면(StartScreen) 푸터와 같은 내용: 서비스 링크 · 카피라이트·버전 | 상표 디스클레이머.
// 멀티의 MultiFooter는 리그 사이드바 메뉴(사이트맵)를 읽어 리그 밖에서 못 쓴다. 링크는 새 탭 — 같은 탭으로 가면 진행 중인 설정이 사라진다.
// 고정하지 않는다: 스크롤되는 화면(경기·결과)은 본문 끝, 스크롤 없는 1·2단계는 화면 하단.
export const QuickGameFooter: React.FC<{ isPhone?: boolean }> = ({ isPhone = false }) => (
    <footer className={`shrink-0 border-t border-slate-800 bg-slate-950 ${isPhone ? 'px-4 py-4 flex flex-col gap-2' : 'px-6 py-4 flex flex-wrap items-start justify-between gap-x-12 gap-y-2'}`}>
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold">
                {FOOTER_LINKS.map(({ label, path, href }) => (
                    <a key={label} href={href ?? path} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white transition-colors">
                        {label}
                    </a>
                ))}
            </div>
            <span className="text-xs text-slate-400 ko-normal">© {APP_YEAR} {APP_NAME}. All rights reserved. · {APP_VERSION}</span>
        </div>
        <p className={`text-[11px] leading-normal text-slate-400 ${isPhone ? '' : 'flex-1 basis-[420px] max-w-[720px] text-right'}`}>{getServiceDisclaimer()}</p>
    </footer>
);
