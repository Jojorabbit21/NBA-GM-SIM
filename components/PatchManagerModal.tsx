
import React, { useState, useMemo } from 'react';
import { Modal } from './common/Modal';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from './common/TeamLogo';
import { loadPatch, savePatch, clearPatch, UserPatch, TeamPatchEntry } from '../utils/patchManager';
import { Upload, RotateCcw, Save } from 'lucide-react';

interface PatchManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/** 기본 팀 이름 (패치 전 원본) — 모듈 로드 시점의 스냅샷이 아니라 teamData의 원본을 표시 */
const TEAM_IDS = Object.keys(TEAM_DATA);

type DraftState = Record<string, { name: string; logoUrl: string }>;

function buildInitialDraft(): DraftState {
    const existing = loadPatch() ?? {};
    const draft: DraftState = {};
    for (const id of TEAM_IDS) {
        draft[id] = {
            name: existing[id]?.name ?? '',
            logoUrl: existing[id]?.logoUrl ?? '',
        };
    }
    return draft;
}

export const PatchManagerModal: React.FC<PatchManagerModalProps> = ({ isOpen, onClose }) => {
    const [draft, setDraft] = useState<DraftState>(buildInitialDraft);
    const [jsonText, setJsonText] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);

    // 모달이 열릴 때마다 최신 패치 로드
    React.useEffect(() => {
        if (isOpen) {
            setDraft(buildInitialDraft());
            setJsonText('');
            setJsonError(null);
        }
    }, [isOpen]);

    const hasChanges = useMemo(() => {
        return TEAM_IDS.some(id => draft[id].name.trim() !== '' || draft[id].logoUrl.trim() !== '');
    }, [draft]);

    const handleJsonApply = () => {
        setJsonError(null);
        try {
            const parsed = JSON.parse(jsonText);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setJsonError('JSON은 { "팀ID": { "name": "...", "logoUrl": "..." } } 형태여야 합니다.');
                return;
            }

            const newDraft: DraftState = {};
            for (const id of TEAM_IDS) {
                newDraft[id] = { name: '', logoUrl: '' };
            }

            let appliedCount = 0;
            for (const [key, value] of Object.entries(parsed)) {
                const teamId = key.toLowerCase();
                if (!TEAM_DATA[teamId]) continue;
                if (typeof value !== 'object' || value === null) continue;
                const entry = value as Record<string, unknown>;
                if (typeof entry.name === 'string') newDraft[teamId].name = entry.name;
                if (typeof entry.logoUrl === 'string') newDraft[teamId].logoUrl = entry.logoUrl;
                appliedCount++;
            }

            if (appliedCount === 0) {
                setJsonError('유효한 팀 데이터를 찾을 수 없습니다. 팀 ID(atl, bos 등)를 확인하세요.');
                return;
            }

            setDraft(newDraft);
            setJsonError(null);
        } catch {
            setJsonError('JSON 파싱 오류: 올바른 JSON 형식인지 확인하세요.');
        }
    };

    const handleFieldChange = (teamId: string, field: 'name' | 'logoUrl', value: string) => {
        setDraft(prev => ({
            ...prev,
            [teamId]: { ...prev[teamId], [field]: value },
        }));
    };

    const handleSave = () => {
        const patch: UserPatch = {};
        for (const id of TEAM_IDS) {
            const entry: TeamPatchEntry = {};
            if (draft[id].name.trim()) entry.name = draft[id].name.trim();
            if (draft[id].logoUrl.trim()) entry.logoUrl = draft[id].logoUrl.trim();
            if (Object.keys(entry).length > 0) patch[id] = entry;
        }
        savePatch(patch);
        window.location.reload();
    };

    const handleReset = () => {
        clearPatch();
        window.location.reload();
    };

    const existingPatch = loadPatch();
    const hasSavedPatch = existingPatch !== null && Object.keys(existingPatch).length > 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="커스텀 패치" size="xl">
            <div className="p-6 space-y-6">
                {/* JSON 붙여넣기 영역 */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-400">JSON 일괄 적용</label>
                    <textarea
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                        placeholder='{ "atl": { "name": "Hawks", "logoUrl": "https://..." }, "bos": { "name": "Celtics" } }'
                        className="w-full h-28 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 font-mono resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleJsonApply}
                            disabled={!jsonText.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            <Upload size={14} />
                            JSON 적용
                        </button>
                        {jsonError && (
                            <span className="text-xs text-red-400 font-medium">{jsonError}</span>
                        )}
                    </div>
                </div>

                {/* 구분선 */}
                <div className="border-t border-slate-800" />

                {/* 팀 리스트 에디터 */}
                <div className="space-y-2">
                    {/* 테이블 헤더 */}
                    <div className="grid grid-cols-[48px_120px_1fr_1fr] gap-3 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <span></span>
                        <span>기본 팀명</span>
                        <span>패치 팀명</span>
                        <span>로고 URL</span>
                    </div>

                    {/* 팀 목록 (스크롤) */}
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {TEAM_IDS.map(id => {
                            const team = TEAM_DATA[id];
                            const d = draft[id];
                            const isModified = d.name.trim() !== '' || d.logoUrl.trim() !== '';

                            return (
                                <div
                                    key={id}
                                    className={`grid grid-cols-[48px_120px_1fr_1fr] gap-3 items-center px-2 py-2 rounded-xl transition-colors ${
                                        isModified ? 'bg-indigo-500/10 border border-indigo-500/20' : 'hover:bg-slate-800/50'
                                    }`}
                                >
                                    <TeamLogo teamId={id} size="sm" />
                                    <span className="text-sm text-slate-400 truncate" title={`${team.city} ${team.name}`}>
                                        {team.name}
                                    </span>
                                    <input
                                        type="text"
                                        value={d.name}
                                        onChange={(e) => handleFieldChange(id, 'name', e.target.value)}
                                        placeholder={team.name}
                                        className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    <input
                                        type="text"
                                        value={d.logoUrl}
                                        onChange={(e) => handleFieldChange(id, 'logoUrl', e.target.value)}
                                        placeholder="https://..."
                                        className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono text-xs"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 푸터 — Modal의 footer prop이 아닌 body 하단에 sticky 배치 */}
            <div className="px-6 pb-6 pt-3 flex items-center justify-between border-t border-slate-800 bg-slate-900">
                <button
                    onClick={handleReset}
                    disabled={!hasSavedPatch}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-400 hover:bg-red-400/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <RotateCcw size={14} />
                    초기화
                </button>
                <button
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                    <Save size={14} />
                    저장 및 적용
                </button>
            </div>
        </Modal>
    );
};
