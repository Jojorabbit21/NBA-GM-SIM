
import { TEAM_DATA } from '../data/teamData';
import { rebuildDerivedConstants } from './constants';

export interface TeamPatchEntry {
    name?: string;
    logoUrl?: string;
}

export type UserPatch = Record<string, TeamPatchEntry>;

const STORAGE_KEY = 'user_team_patch';

/** 패치된 로고 URL을 저장하는 인메모리 맵 (getTeamLogoUrl에서 참조) */
export const patchedLogoUrls: Map<string, string> = new Map();

/** localStorage에서 패치 로드 */
export function loadPatch(): UserPatch | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as UserPatch;
    } catch {
        return null;
    }
}

/** localStorage에 패치 저장 */
export function savePatch(patch: UserPatch): void {
    // 빈 엔트리 제거
    const cleaned: UserPatch = {};
    for (const [id, entry] of Object.entries(patch)) {
        const trimmed: TeamPatchEntry = {};
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

/** localStorage에서 패치 제거 */
export function clearPatch(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * 앱 시작 시 호출 — TEAM_DATA를 in-place 뮤테이트하고 파생 상수를 재빌드.
 * React 렌더링 전에 동기적으로 실행되어야 함.
 */
export function applyPatchToTeamData(): void {
    const patch = loadPatch();
    if (!patch) return;

    patchedLogoUrls.clear();

    for (const [teamId, entry] of Object.entries(patch)) {
        const team = TEAM_DATA[teamId];
        if (!team) continue;

        if (entry.name) {
            team.name = entry.name;
        }
        if (entry.logoUrl) {
            patchedLogoUrls.set(teamId, entry.logoUrl);
        }
    }

    rebuildDerivedConstants();
}
