
import { TEAM_DATA } from '../data/teamData';
import { rebuildDerivedConstants } from './constants';

export interface TeamEditorEntry {
    name?: string;
    logoUrl?: string;
}

export type UserEditorData = Record<string, TeamEditorEntry>;

const STORAGE_KEY = 'user_team_editor';

/** 에디터 적용 전 원본 팀명 스냅샷 (모듈 로드 시점 = applyEditor 호출 전) */
export const ORIGINAL_NAMES: Record<string, string> = {};
for (const [id, team] of Object.entries(TEAM_DATA)) {
    ORIGINAL_NAMES[id] = team.name;
}

/** 에디터로 설정된 로고 URL 인메모리 맵 (getTeamLogoUrl에서 참조) */
export const editorLogoUrls: Map<string, string> = new Map();

/** localStorage에서 에디터 데이터 로드 */
export function loadEditorData(): UserEditorData | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as UserEditorData;
    } catch {
        return null;
    }
}

/** localStorage에 에디터 데이터 저장 */
export function saveEditorData(data: UserEditorData): void {
    // 빈 엔트리 제거
    const cleaned: UserEditorData = {};
    for (const [id, entry] of Object.entries(data)) {
        const trimmed: TeamEditorEntry = {};
        if (entry.name?.trim()) trimmed.name = entry.name.trim();
        if (entry.logoUrl?.trim()) trimmed.logoUrl = entry.logoUrl.trim();
        if (Object.keys(trimmed).length > 0) cleaned[id] = trimmed;
    }
    if (Object.keys(cleaned).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
    } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
}

/** localStorage에서 에디터 데이터 제거 */
export function clearEditorData(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * 앱 시작 시 호출 — TEAM_DATA를 in-place 뮤테이트하고 파생 상수를 재빌드.
 * React 렌더링 전에 동기적으로 실행되어야 함.
 */
export function applyEditorToTeamData(): void {
    const data = loadEditorData();
    if (!data) return;

    editorLogoUrls.clear();

    for (const [teamId, entry] of Object.entries(data)) {
        const team = TEAM_DATA[teamId];
        if (!team) continue;

        if (entry.name) {
            team.name = entry.name;
        }
        if (entry.logoUrl) {
            editorLogoUrls.set(teamId, entry.logoUrl);
        }
    }

    rebuildDerivedConstants();
}
