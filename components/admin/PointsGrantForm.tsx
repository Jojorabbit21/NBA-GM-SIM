import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { InlineNotice } from '../common/InlineNotice';

interface PointsGrantFormProps {
    /** 양수 = 지급, 음수 = 회수. 성공이면 null, 실패면 사용자 문구를 돌려준다. */
    onSubmit: (amount: number, note: string) => Promise<string | null>;
    /** 있으면 버튼 → "확인/취소" 단계를 거친다(전체 대상처럼 되돌리기 어려운 동작). `{n}` 자리에 금액이 들어간다 */
    confirmText?: { grant: string; revoke: string };
    /** 성공 직후 잠깐 보여줄 문구(3초 후 사라짐) */
    successText?: (amount: number) => string;
}

const inputClass = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500';

// 어드민 포인트 지급/회수 입력 — 금액(양수)·메모(필수) + 지급/회수 버튼. 사용자 상세와 사용자 목록(전체)이 공유.
// 메모는 원장 meta.note 로 남아 내역에 그대로 표시된다.
export const PointsGrantForm: React.FC<PointsGrantFormProps> = ({ onSubmit, confirmText, successText }) => {
    const [amountText, setAmountText] = useState('');
    const [note, setNote] = useState('');
    const [pending, setPending] = useState<'grant' | 'revoke' | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    const amount = Math.floor(Number(amountText));
    const valid = Number.isFinite(amount) && amount > 0 && note.trim().length > 0;

    const run = async (kind: 'grant' | 'revoke') => {
        setBusy(true); setErr(null); setOk(null);
        const signed = kind === 'grant' ? amount : -amount;
        const e = await onSubmit(signed, note.trim());
        setBusy(false);
        setPending(null);
        if (e) { setErr(e); return; }
        setOk(successText ? successText(signed) : (kind === 'grant' ? '지급했습니다.' : '회수했습니다.'));
        setAmountText(''); setNote('');
    };

    const click = (kind: 'grant' | 'revoke') => {
        setErr(null); setOk(null);
        if (confirmText) setPending(kind); else void run(kind);
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="number" min={1} step={1} inputMode="numeric" placeholder="금액"
                    value={amountText} onChange={e => setAmountText(e.target.value)}
                    className={`${inputClass} w-28 tabular-nums`}
                />
                <input
                    type="text" placeholder="메모" maxLength={200}
                    value={note} onChange={e => setNote(e.target.value)}
                    className={`${inputClass} flex-1 min-w-[160px]`}
                />
                {pending ? (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">
                            {(pending === 'grant' ? confirmText!.grant : confirmText!.revoke).replace('{n}', amount.toLocaleString('ko-KR'))}
                        </span>
                        <button
                            onClick={() => run(pending)} disabled={busy}
                            className={`px-2.5 py-1 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-colors ${pending === 'grant' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-red-600 hover:bg-red-500'}`}
                        >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : '확인'}
                        </button>
                        <button
                            onClick={() => setPending(null)} disabled={busy}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs text-slate-300 transition-colors"
                        >
                            취소
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            onClick={() => click('grant')} disabled={!valid || busy}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors"
                        >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : '지급'}
                        </button>
                        <button
                            onClick={() => click('revoke')} disabled={!valid || busy}
                            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-red-300 transition-colors"
                        >
                            회수
                        </button>
                    </>
                )}
            </div>
            {err && <InlineNotice tone="danger" size="sm">{err}</InlineNotice>}
            {ok && <InlineNotice tone="success" size="sm" autoHideMs={3000}>{ok}</InlineNotice>}
        </div>
    );
};
