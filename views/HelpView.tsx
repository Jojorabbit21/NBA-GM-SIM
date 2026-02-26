
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../components/common/Button';
import { USER_GUIDE_MD } from '../docs/userGuideContent';

interface HelpViewProps {
    onBack: () => void;
}

const components = {
    h1: ({ children }: any) => (
        <h1 className="text-3xl font-black text-white tracking-tight mt-2 mb-4">{children}</h1>
    ),
    h2: ({ children }: any) => (
        <h2 className="text-2xl font-black text-white tracking-tight mt-12 mb-6 pb-3 border-b border-slate-800">{children}</h2>
    ),
    h3: ({ children }: any) => (
        <h3 className="text-xl font-bold text-indigo-400 mt-8 mb-4">{children}</h3>
    ),
    h4: ({ children }: any) => (
        <h4 className="text-lg font-bold text-slate-200 mt-6 mb-3">{children}</h4>
    ),
    p: ({ children }: any) => (
        <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
    ),
    strong: ({ children }: any) => (
        <strong className="text-white font-bold">{children}</strong>
    ),
    em: ({ children }: any) => (
        <em className="text-slate-200 italic">{children}</em>
    ),
    hr: () => (
        <hr className="border-slate-800 my-8" />
    ),
    ul: ({ children }: any) => (
        <ul className="list-disc pl-6 space-y-1.5 mb-4 text-slate-300">{children}</ul>
    ),
    ol: ({ children }: any) => (
        <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-slate-300">{children}</ol>
    ),
    li: ({ children }: any) => (
        <li className="text-slate-400 leading-relaxed">{children}</li>
    ),
    blockquote: ({ children }: any) => (
        <div className="border-l-4 border-indigo-500 bg-indigo-500/5 rounded-r-xl px-5 py-4 my-4 text-sm">
            {children}
        </div>
    ),
    code: ({ children, className }: any) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
            return (
                <code className="block bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-indigo-300 overflow-x-auto whitespace-pre my-4">
                    {children}
                </code>
            );
        }
        return (
            <code className="bg-slate-800 text-indigo-300 rounded px-1.5 py-0.5 text-sm font-mono">{children}</code>
        );
    },
    pre: ({ children }: any) => <pre className="my-4">{children}</pre>,
    table: ({ children }: any) => (
        <div className="overflow-x-auto my-4 rounded-xl border border-slate-800">
            <table className="w-full text-sm">{children}</table>
        </div>
    ),
    thead: ({ children }: any) => (
        <thead className="bg-slate-800/80">{children}</thead>
    ),
    tbody: ({ children }: any) => (
        <tbody className="divide-y divide-slate-800/50">{children}</tbody>
    ),
    tr: ({ children }: any) => (
        <tr className="hover:bg-slate-800/30 transition-colors">{children}</tr>
    ),
    th: ({ children }: any) => (
        <th className="px-4 py-2.5 text-left text-slate-200 font-bold text-xs uppercase tracking-wider">{children}</th>
    ),
    td: ({ children }: any) => (
        <td className="px-4 py-2.5 text-slate-400">{children}</td>
    ),
    a: ({ href, children }: any) => (
        <a href={href} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
};

export const HelpView: React.FC<HelpViewProps> = ({ onBack }) => {
    return (
        <div className="flex flex-col min-h-full animate-in fade-in duration-500 ko-normal pb-20 w-full">
            <div className="w-full">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {USER_GUIDE_MD}
                </ReactMarkdown>
            </div>

            <div className="flex justify-center mt-8">
                <Button variant="secondary" size="lg" onClick={onBack}>
                    대시보드로 돌아가기
                </Button>
            </div>
        </div>
    );
};
