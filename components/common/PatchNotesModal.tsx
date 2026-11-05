import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { InlineNotice } from './InlineNotice';
import { IconButton } from './IconButton';

// [2026-11-05] 패치노트 — 레포 루트 PATCH_NOTES.md를 앱 빌드에 함께 넣어 그대로 표시(main 푸시 = Vercel 재배포라 파일만 고쳐 푸시하면 반영).
// 첫 로딩 번들에 넣지 않도록 모달을 열 때 별도 청크로 불러온다. 개발 이력(docs/history/)과는 별개의 유저용 문서.
const loadPatchNotes = () => import('../../PATCH_NOTES.md?raw').then(m => m.default);

const components = {
    h1: ({ children }: any) => <h1 className="text-xl font-black text-white mb-4">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-black text-white mt-8 first:mt-0 mb-3 pb-2 border-b border-slate-800">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold text-indigo-400 mt-5 mb-2">{children}</h3>,
    h4: ({ children }: any) => <h4 className="text-sm font-bold text-slate-200 mt-4 mb-2">{children}</h4>,
    p: ({ children }: any) => <p className="text-sm text-slate-300 leading-relaxed mb-3">{children}</p>,
    strong: ({ children }: any) => <strong className="text-white font-bold">{children}</strong>,
    em: ({ children }: any) => <em className="text-slate-200 italic">{children}</em>,
    hr: () => <hr className="border-slate-800 my-6" />,
    ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-1.5 mb-3">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-1.5 mb-3">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm text-slate-300 leading-relaxed">{children}</li>,
    code: ({ children }: any) => <code className="bg-slate-800 text-indigo-300 rounded px-1.5 py-0.5 text-xs font-mono">{children}</code>,
    a: ({ href, children }: any) => (
        <a href={href} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    table: ({ children }: any) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-slate-800"><table className="w-full text-sm">{children}</table></div>
    ),
    th: ({ children }: any) => <th className="px-3 py-2 text-left text-slate-200 font-bold text-xs bg-slate-800/80">{children}</th>,
    td: ({ children }: any) => <td className="px-3 py-2 text-slate-400 border-t border-slate-800/60">{children}</td>,
};

interface PatchSection { title: string; markdown: string; }

/** "## " 제목 단위로 자른다 — 첫 "## " 앞(문서 제목·안내)은 전체 보기에서만 쓴다. 구역 끝의 "---" 구분선은 뗀다. */
function splitSections(md: string): PatchSection[] {
    const parts = md.split(/^(?=## )/m).filter(p => p.startsWith('## '));
    return parts.map(p => {
        const title = p.slice(3, p.indexOf('\n') >= 0 ? p.indexOf('\n') : undefined).trim();
        return { title, markdown: p.replace(/\n-{3,}\s*$/, '\n').trimEnd() };
    });
}

/** 날짜 목록 라벨 — "2026년 11월 5일 업데이트" → "2026년 11월 5일" */
const sectionLabel = (title: string) => title.replace(/\s*업데이트\s*$/, '');

/** 구역 본문에서 "## 제목" 첫 줄을 뗀다 — 아코디언 머리가 제목을 대신 보여 준다. */
const sectionBody = (sec: PatchSection) => sec.markdown.replace(/^## [^\n]*\n?/, '');

/**
 * @param layout 'list'(기본, 데스크톱) = 좌측 날짜 목록 + 본문 / 'accordion'(모바일 "더보기") = 날짜별 아코디언을 나열(최신 하나만 펼친 채 시작)
 */
export const PatchNotesModal: React.FC<{ isOpen: boolean; onClose: () => void; layout?: 'list' | 'accordion' }> = ({ isOpen, onClose, layout = 'list' }) => {
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    // [2026-11-05] 좌측 날짜 목록에서 고른 구역(제목) — 같은 날짜를 다시 누르면 해제되어 전체 표시
    const [selected, setSelected] = useState<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // [2026-11-05] 아코디언(모바일) — 펼친 구역 제목들. null = 아직 안 정함(로드 직후 최신 구역만 펼침)
    const [expanded, setExpanded] = useState<Set<string> | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setFailed(false);
        loadPatchNotes()
            .then(text => { if (!cancelled) setMarkdown(text); })
            .catch(() => { if (!cancelled) setFailed(true); });   // 배포 직후 옛 청크 404 등
        return () => { cancelled = true; };
    }, [isOpen]);

    const sections = useMemo(() => (markdown ? splitSections(markdown) : []), [markdown]);
    const shown = selected ? sections.find(s => s.title === selected)?.markdown ?? markdown : markdown;
    const loaded = markdown !== null;

    useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [selected]);
    const openSet = expanded ?? new Set(sections[0] ? [sections[0].title] : []);
    const toggleSection = (title: string) => {
        const next = new Set(openSet);
        if (next.has(title)) next.delete(title); else next.add(title);
        setExpanded(next);
    };

    return (
        // 로딩 중엔 좁게(md), 내용이 오면 넓게(xl)
        <Modal isOpen={isOpen} onClose={onClose} size={loaded ? 'xl' : 'md'} rounded="rounded-lg" hideCloseButton>
            <div className={`flex flex-col ${loaded ? 'h-[80vh]' : ''}`}>
                <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800">
                    <h2 className="text-sm font-black text-white ko-tight">패치노트</h2>
                    <IconButton label="닫기" size="sm" onClick={onClose}>
                        <X size={16} />
                    </IconButton>
                </div>

                {failed && !loaded ? (
                    <div className="px-5 py-6"><InlineNotice tone="danger" size="sm">패치노트를 불러오지 못했습니다.</InlineNotice></div>
                ) : !loaded ? (
                    <div className="px-5 py-6"><Spinner variant="section" /></div>
                ) : layout === 'accordion' ? (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar ko-normal">
                        {sections.map(sec => {
                            const open = openSet.has(sec.title);
                            return (
                                <div key={sec.title} className="border-b border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection(sec.title)}
                                        aria-expanded={open}
                                        className="w-full h-12 px-4 flex items-center justify-between gap-3 text-left active:bg-white/5"
                                    >
                                        <span className={`text-sm font-bold ${open ? 'text-white' : 'text-slate-300'}`}>{sectionLabel(sec.title)}</span>
                                        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {open && (
                                        <div className="px-4 pb-4">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                                                {sectionBody(sec)}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                        {/* 날짜 목록 — 폰은 가로 스크롤 한 줄 */}
                        <nav className="shrink-0 md:w-48 flex md:flex-col gap-1 p-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r border-slate-800">
                            {sections.map(sec => {
                                const active = selected === sec.title;
                                return (
                                    <button
                                        key={sec.title}
                                        type="button"
                                        onClick={() => setSelected(active ? null : sec.title)}
                                        className={`shrink-0 text-left whitespace-nowrap px-3 py-2 rounded-md text-xs font-bold transition-colors ${
                                            active ? 'bg-indigo-600/15 text-indigo-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                        }`}
                                    >
                                        {sectionLabel(sec.title)}
                                    </button>
                                );
                            })}
                        </nav>
                        <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-6 py-5 ko-normal">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                                {shown ?? ''}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
