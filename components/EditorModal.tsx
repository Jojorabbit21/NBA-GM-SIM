
import React, { useState, useMemo } from 'react';
import { Modal } from './common/Modal';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from './common/TeamLogo';
import { loadEditorData, saveEditorData, clearEditorData, UserEditorData, TeamEditorEntry, ORIGINAL_NAMES, editorLogoUrls } from '../utils/editorManager';
import { Upload, RotateCcw, Save } from 'lucide-react';

interface EditorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TEAM_IDS = Object.keys(TEAM_DATA);

type DraftState = Record<string, { name: string; logoUrl: string }>;

function buildInitialDraft(): DraftState {
    const draft: DraftState = {};
    for (const id of TEAM_IDS) {
        draft[id] = {
            name: TEAM_DATA[id].name,
            logoUrl: editorLogoUrls.get(id) ?? '',
        };
    }
    return draft;
}

export const EditorModal: React.FC<EditorModalProps> = ({ isOpen, onClose }) => {
    const [draft, setDraft] = useState<DraftState>(buildInitialDraft);
    const [jsonText, setJsonText] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);

    // 모달이 열릴 때마다 최신 상태 로드
    React.useEffect(() => {
        if (isOpen) {
            setDraft(buildInitialDraft());
            setJsonText('');
            setJsonError(null);
        }
    }, [isOpen]);

    // 원본 대비 변경 여부 체크
    const hasChanges = useMemo(() => {
        return TEAM_IDS.some(id => {
            const nameChanged = draft[id].name.trim() !== ORIGINAL_NAMES[id];
            const hasLogo = draft[id].logoUrl.trim() !== '';
            return nameChanged || hasLogo;
        });
    }, [draft]);

    const handleJsonApply = () => {
        setJsonError(null);
        try {
            const parsed = JSON.parse(jsonText);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setJsonError('JSON은 { "팀ID": { "name": "...", "logoUrl": "..." } } 형태여야 합니다.');
                return;
            }

            // 원본 이름으로 초기화 후 JSON 값 덮어쓰기
            const newDraft: DraftState = {};
            for (const id of TEAM_IDS) {
                newDraft[id] = { name: ORIGINAL_NAMES[id], logoUrl: '' };
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
        const editorData: UserEditorData = {};
        for (const id of TEAM_IDS) {
            const entry: TeamEditorEntry = {};
            const trimmedName = draft[id].name.trim();
            const trimmedLogo = draft[id].logoUrl.trim();
            // 원본과 다른 이름만 에디터 데이터에 포함
            if (trimmedName && trimmedName !== ORIGINAL_NAMES[id]) entry.name = trimmedName;
            if (trimmedLogo) entry.logoUrl = trimmedLogo;
            if (Object.keys(entry).length > 0) editorData[id] = entry;
        }
        saveEditorData(editorData);
        window.location.reload();
    };

    const existingData = loadEditorData();
    const hasSavedData = existingData !== null && Object.keys(existingData).length > 0;

    const handleReset = () => {
        if (hasSavedData) {
            // localStorage에 저장된 데이터가 있으면 삭제 후 리로드
            clearEditorData();
            window.location.reload();
        } else {
            // 저장된 데이터 없이 드래프트만 변경된 경우 → 드래프트 초기화
            setDraft(buildInitialDraft());
        }
    };

    const footer = (
        <div className="flex items-center justify-between">
            <button
                onClick={handleReset}
                disabled={!hasSavedData && !hasChanges}
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
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" title="에디터" footer={footer}>
            <div className="p-6 space-y-5">
                {/* JSON 붙여넣기 영역 */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">JSON 일괄 적용</label>
                    <textarea
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                        placeholder='{ "atl": { "name": "Hawks", "logoUrl": "https://..." }, "bos": { "name": "Celtics" } }'
                        className="w-full h-24 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 font-mono resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={handleJsonApply}
                            disabled={!jsonText.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            <Upload size={12} />
                            적용
                        </button>
                    </div>
                    {jsonError && (
                        <span className="text-xs text-red-400 font-medium">{jsonError}</span>
                    )}
                </div>

                {/* 구분선 */}
                <div className="border-t border-slate-800" />

                {/* 팀 리스트 에디터 */}
                <div className="space-y-2">
                    {/* 테이블 헤더 */}
                    <div className="grid grid-cols-[40px_3fr_7fr] gap-3 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <span></span>
                        <span>팀명</span>
                        <span>로고 URL</span>
                    </div>

                    {/* 팀 목록 (스크롤) */}
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {TEAM_IDS.map(id => {
                            const d = draft[id];
                            return (
                                <div
                                    key={id}
                                    className="grid grid-cols-[40px_3fr_7fr] gap-3 items-center px-2 py-2 rounded-xl hover:bg-slate-800/50 transition-colors"
                                >
                                    <TeamLogo teamId={id} size="sm" />
                                    <input
                                        type="text"
                                        value={d.name}
                                        onChange={(e) => handleFieldChange(id, 'name', e.target.value)}
                                        className="h-9 bg-slate-950 border border-slate-700 rounded-lg px-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    <input
                                        type="text"
                                        value={d.logoUrl}
                                        onChange={(e) => handleFieldChange(id, 'logoUrl', e.target.value)}
                                        placeholder="https://..."
                                        className="h-9 bg-slate-950 border border-slate-700 rounded-lg px-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </Modal>
    );
};
