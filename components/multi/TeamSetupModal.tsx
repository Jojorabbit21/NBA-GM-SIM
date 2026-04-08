
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { setMemberTeam } from '../../services/multi/leagueService';

interface TeamSetupModalProps {
    open:            boolean;
    roomId:          string;
    userId:          string;
    /** 같은 방의 다른 멤버 team_id slug 목록 (자기 제외) — 중복 방지용 */
    existingTeamIds: string[];
    initial?: {
        name:           string;
        abbr:           string;
        colorPrimary:   string;
        colorSecondary: string;
    } | null;
    onClose: () => void;
    onSaved: () => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const TeamSetupModal: React.FC<TeamSetupModalProps> = ({
    open, roomId, userId, existingTeamIds, initial, onClose, onSaved,
}) => {
    const [name,           setName]           = useState('');
    const [abbr,           setAbbr]           = useState('');
    const [colorPrimary,   setColorPrimary]   = useState('#e11d48');
    const [colorSecondary, setColorSecondary] = useState('#fbbf24');
    const [err,            setErr]            = useState<string | null>(null);
    const [saving,         setSaving]         = useState(false);

    // 모달이 열릴 때마다 초기값으로 리셋
    useEffect(() => {
        if (!open) return;
        setName(initial?.name           ?? '');
        setAbbr(initial?.abbr           ?? '');
        setColorPrimary(initial?.colorPrimary   ?? '#e11d48');
        setColorSecondary(initial?.colorSecondary ?? '#fbbf24');
        setErr(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const displayAbbr = abbr.trim().toUpperCase();
    const safeP = HEX_RE.test(colorPrimary)   ? colorPrimary   : '#e11d48';
    const safeS = HEX_RE.test(colorSecondary) ? colorSecondary : '#fbbf24';

    const handleAbbrChange = (v: string) => setAbbr(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));

    const handleSave = async () => {
        const trimName = name.trim();

        if (trimName.length < 1 || trimName.length > 24) {
            setErr('팀명은 1~24자여야 합니다'); return;
        }
        if (!/^[A-Z0-9]{2,4}$/.test(displayAbbr)) {
            setErr('약어는 2~4자 영문/숫자여야 합니다'); return;
        }
        if (!HEX_RE.test(colorPrimary)) {
            setErr('Primary 색상은 #RRGGBB 형식이어야 합니다'); return;
        }
        if (!HEX_RE.test(colorSecondary)) {
            setErr('Secondary 색상은 #RRGGBB 형식이어야 합니다'); return;
        }
        if (existingTeamIds.includes(displayAbbr.toLowerCase())) {
            setErr(`약어 "${displayAbbr}"는 이미 같은 방에서 사용 중입니다`); return;
        }

        setSaving(true);
        setErr(null);
        const { error } = await setMemberTeam({
            roomId, userId,
            name: trimName,
            abbr: displayAbbr,
            colorPrimary,
            colorSecondary,
        });
        setSaving(false);
        if (error) { setErr(error); return; }
        onSaved();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-5">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-black text-white ko-tight">팀 설정</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* 미리보기 */}
                <div className="flex flex-col items-center gap-2">
                    <div
                        className="w-24 h-24 rounded-2xl flex items-center justify-center font-black text-3xl select-none"
                        style={{
                            backgroundColor: safeP,
                            border: `4px solid ${safeS}`,
                            color: '#ffffff',
                        }}
                    >
                        {displayAbbr || '—'}
                    </div>
                    <span className="text-sm text-slate-400 ko-normal">
                        {name.trim() || '팀명 미입력'}
                    </span>
                </div>

                {/* 입력 필드 */}
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">팀 이름</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={24}
                            placeholder="예: 서울 파이어스"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1">약어 (2~4자 영문/숫자)</label>
                        <input
                            type="text"
                            value={abbr}
                            onChange={e => handleAbbrChange(e.target.value)}
                            maxLength={4}
                            placeholder="SFR"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>

                    {/* 색상 피커 2개 */}
                    {(['primary', 'secondary'] as const).map(key => {
                        const val    = key === 'primary' ? colorPrimary   : colorSecondary;
                        const setter = key === 'primary' ? setColorPrimary : setColorSecondary;
                        const label  = key === 'primary' ? 'Primary (로고 배경)' : 'Secondary (로고 보더)';
                        const safe   = HEX_RE.test(val) ? val : '#000000';
                        return (
                            <div key={key}>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">{label}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={safe}
                                        onChange={e => setter(e.target.value)}
                                        className="w-9 h-9 rounded-lg border border-slate-700 cursor-pointer bg-transparent p-0.5 shrink-0"
                                    />
                                    <input
                                        type="text"
                                        value={val}
                                        onChange={e => setter(e.target.value)}
                                        maxLength={7}
                                        placeholder={key === 'primary' ? '#e11d48' : '#fbbf24'}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}

                {/* 버튼 */}
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? '저장 중…' : '저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};
