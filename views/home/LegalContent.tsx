import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
    ABOUT_CONTENT, ABOUT_CONTENT_EN, ABOUT_TITLE, ABOUT_TITLE_EN,
    LEGAL_LAST_UPDATED, LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_NAME_EN,
    PRIVACY_POLICY_CONTENT, PRIVACY_POLICY_CONTENT_EN, PRIVACY_POLICY_TITLE, PRIVACY_POLICY_TITLE_EN,
    TERMS_OF_SERVICE_CONTENT, TERMS_OF_SERVICE_CONTENT_EN, TERMS_OF_SERVICE_TITLE, TERMS_OF_SERVICE_TITLE_EN,
} from '../../utils/legalTexts';
import { APP_FULL_NAME } from '../../utils/constants';

// 홈 푸터 About / Terms of Use / Privacy 의 본문 패널 — StartScreen 의 가운데 컨텐츠 영역(두 패널 자리)에
// 끼워 넣는다. 상단 로고·푸터는 StartScreen 이 그대로 유지하고 이 패널만 스왑된다(/about, /terms, /privacy 는
// 모두 AuthPage → StartScreen 을 그리며, StartScreen 이 pathname 으로 kind 를 정한다).
// [2026-11-09] 신설(처음엔 전체 화면 pages/LegalPage.tsx 였으나 같은 날 컨텐츠 영역 스왑 방식으로 변경).
// 같은 날 "법적 고지서 느낌" 요청으로 레이아웃 재구성: 가운데 정렬 문서 제목 블록(제목·서비스명·시행일·이중 괘선) →
// 조문 섹션(소제목 + 항/호는 번호·글머리를 별도 열로 뺀 내어쓰기) → 섹션 사이 가는 괘선 → 문서 끝 운영자 표기.
// 같은 날 상단 탭 그룹(세 문서 이동) + 우측 끝 KOR/EN 토글(컴포넌트 상태, 탭을 바꿔도 유지).

export type LegalKind = 'about' | 'terms' | 'privacy';
type Lang = 'ko' | 'en';

/** 상단 탭 순서 = 푸터 링크 순서. 한 문서로 들어와도 탭으로 나머지 문서에 바로 갈 수 있다. [2026-11-09] */
export const LEGAL_TABS: { kind: LegalKind; label: Record<Lang, string>; path: string }[] = [
    { kind: 'about',   label: { ko: '서비스 소개',       en: 'About' },          path: '/about' },
    { kind: 'terms',   label: { ko: '이용약관',          en: 'Terms of Use' },   path: '/terms' },
    { kind: 'privacy', label: { ko: '개인정보 처리방침', en: 'Privacy Policy' }, path: '/privacy' },
];

export const LEGAL_PATHS: Record<string, LegalKind> = Object.fromEntries(LEGAL_TABS.map(t => [t.path, t.kind]));

const DOCS: Record<Lang, Record<LegalKind, { title: string; content: string; formal: boolean }>> = {
    ko: {
        about:   { title: ABOUT_TITLE,            content: ABOUT_CONTENT,            formal: false },
        terms:   { title: TERMS_OF_SERVICE_TITLE, content: TERMS_OF_SERVICE_CONTENT, formal: true },
        privacy: { title: PRIVACY_POLICY_TITLE,   content: PRIVACY_POLICY_CONTENT,   formal: true },
    },
    en: {
        about:   { title: ABOUT_TITLE_EN,            content: ABOUT_CONTENT_EN,            formal: false },
        terms:   { title: TERMS_OF_SERVICE_TITLE_EN, content: TERMS_OF_SERVICE_CONTENT_EN, formal: true },
        privacy: { title: PRIVACY_POLICY_TITLE_EN,   content: PRIVACY_POLICY_CONTENT_EN,   formal: true },
    },
};

const UI: Record<Lang, { home: string; effective: string; updated: string; operator: string }> = {
    ko: { home: '홈',   effective: '시행일',        updated: '최종 수정',   operator: LEGAL_OPERATOR_NAME },
    en: { home: 'Home', effective: 'Effective',     updated: 'Last updated', operator: LEGAL_OPERATOR_NAME_EN },
};

// ── 텍스트 → 구조 ────────────────────────────────────────────────────────────
// legalTexts 의 문자열 규칙: 빈 줄 = 블록 경계. 블록 첫 줄이 "제N조 (…)"/"Article N (…)" / "N. 제목" / "부칙"/"Addendum" 이면
// 조문 소제목. 블록 안 줄: "N. …" = 항(번호 열), "- …" = 호(글머리 열), 그 외 = 본문 문단.
// "시행일: …"/"Effective date: …" 단독 블록 = 문서 메타.
const HEADING_RE = /^((제\d+조|Article\s+\d+)\s*\(.+\)|\d{1,2}\.\s.+|부칙|Addendum)$/;
const EFFECTIVE_RE = /^(시행일|Effective date):\s*(.+)$/;
const ORDERED_RE = /^(\d{1,2})\.\s+(.+)$/;
const BULLET_RE = /^-\s+(.+)$/;

type Line =
    | { kind: 'p'; text: string }
    | { kind: 'ol'; marker: string; text: string }
    | { kind: 'ul'; text: string };

interface Section { heading: string | null; lines: Line[] }

function parse(content: string): { effective: string | null; sections: Section[] } {
    let effective: string | null = null;
    const sections: Section[] = [];
    for (const block of content.trim().split(/\n\s*\n/)) {
        const rawLines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (rawLines.length === 0) continue;
        const eff = rawLines.length === 1 ? EFFECTIVE_RE.exec(rawLines[0]) : null;
        if (eff) { effective = eff[2]; continue; }

        let heading: string | null = null;
        let body = rawLines;
        if (HEADING_RE.test(rawLines[0])) { heading = rawLines[0]; body = rawLines.slice(1); }

        const lines: Line[] = body.map(l => {
            const o = ORDERED_RE.exec(l);
            if (o) return { kind: 'ol', marker: `${o[1]}.`, text: o[2] };
            const b = BULLET_RE.exec(l);
            if (b) return { kind: 'ul', text: b[1] };
            return { kind: 'p', text: l };
        });
        sections.push({ heading, lines });
    }
    return { effective, sections };
}

// ── 렌더 ─────────────────────────────────────────────────────────────────────
const LineView: React.FC<{ line: Line }> = ({ line }) => {
    if (line.kind === 'p') return <p>{line.text}</p>;
    if (line.kind === 'ol') {
        return (
            <div className="grid grid-cols-[2em_1fr] gap-x-1">
                <span className="tabular-nums text-slate-400">{line.marker}</span>
                <span>{line.text}</span>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-[2em_1fr] gap-x-1 pl-[2em]">
            <span className="text-slate-500 text-center">–</span>
            <span>{line.text}</span>
        </div>
    );
};

export const LegalContent: React.FC<{
    kind: LegalKind;
    onBack: () => void;
    /** 상단 탭 클릭 — 호출부(StartScreen)가 해당 path 로 navigate 해서 URL·문서를 함께 바꾼다 */
    onSelect: (kind: LegalKind) => void;
}> = ({ kind, onBack, onSelect }) => {
    const [lang, setLang] = useState<Lang>('ko');
    const doc = DOCS[lang][kind];
    const ui = UI[lang];
    const bodyRef = useRef<HTMLDivElement>(null);

    // 문서가 바뀌면(푸터에서 다른 링크 클릭) 본문 스크롤을 맨 위로
    useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [kind]);

    const { effective, sections } = parse(doc.content);

    return (
        <div className="w-full h-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 pretendard">
            <div className="shrink-0 flex items-center">
                <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                    <span className="ko-normal">{ui.home}</span>
                </button>
            </div>

            {/* 문서 탭 + 우측 끝 언어 토글 — InlineLeagueList 탭과 같은 형식(하단 2px 주황 인디케이터). 스크롤바 없음 */}
            <div className="shrink-0 flex items-center gap-1 border-b border-slate-700/50 -mt-1">
                {LEGAL_TABS.map(tab => (
                    <button
                        key={tab.kind}
                        onClick={() => { if (tab.kind !== kind) onSelect(tab.kind); }}
                        className={`px-3 py-2 text-base font-bold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                            tab.kind === kind
                                ? 'border-orange-500 text-white'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <span className="ko-normal">{tab.label[lang]}</span>
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-1 pb-1.5 text-xs font-bold tabular-nums">
                    {(['ko', 'en'] as Lang[]).map((l, i) => (
                        <React.Fragment key={l}>
                            {i > 0 && <span className="text-slate-600">/</span>}
                            <button
                                onClick={() => setLang(l)}
                                className={`px-1.5 py-0.5 rounded transition-colors ${
                                    lang === l ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {l === 'ko' ? 'KOR' : 'EN'}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* 문서 본문 — 패널 높이 안에서만 스크롤. 가운데 폭 제한으로 문서 한 장처럼 */}
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
                <article className="max-w-[720px] mx-auto px-1 sm:px-4 pb-6 text-[13.5px] leading-7 text-slate-300 ko-normal">

                    {/* 제목 블록 — 가운데 정렬, 이중 괘선 */}
                    <header className="text-center pt-2 pb-5 border-b-2 border-slate-500/70">
                        <p className="text-xs tracking-wide text-slate-500">{APP_FULL_NAME}</p>
                        <h1 className="mt-1.5 text-2xl font-black text-white ko-tight">{doc.title}</h1>
                        {doc.formal && (
                            <p className="mt-2 text-xs text-slate-400 tabular-nums">
                                {ui.effective} {effective ?? LEGAL_LAST_UPDATED}
                                <span className="mx-2 text-slate-600">|</span>
                                {ui.updated} {LEGAL_LAST_UPDATED}
                            </p>
                        )}
                    </header>
                    <div className="border-b border-slate-600/60 mt-[3px]" />

                    {/* 조문 */}
                    <div className="divide-y divide-slate-700/50">
                        {sections.map((sec, i) => (
                            <section key={i} className="py-5 space-y-1.5">
                                {sec.heading && (
                                    <h2 className="text-[15px] font-bold text-white ko-tight mb-2">{sec.heading}</h2>
                                )}
                                {sec.lines.map((line, j) => <LineView key={j} line={line} />)}
                            </section>
                        ))}
                    </div>

                    {/* 문서 끝 — 운영자 표기 */}
                    {doc.formal && (
                        <footer className="pt-6 text-center text-xs text-slate-500">
                            <div className="border-t border-slate-600/60 mb-4" />
                            {ui.operator}
                        </footer>
                    )}
                </article>
            </div>
        </div>
    );
};
