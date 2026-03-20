import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { RosterMode, DraftPoolType, Player } from '../types';
import type { PendingOffseasonAction } from '../types/app';
import type { useGameData } from './useGameData';
import type { useSimulation } from './useSimulation';
import type { useFullSeasonSim } from './useFullSeasonSim';

// ─── 타입 정의 ───────────────────────────────────────────────────

export interface GameContextValue {
    // Auth
    session: Session | null;
    isGuestMode: boolean;
    authLoading: boolean;
    logout: () => void;

    // 게임 데이터 (useGameData 전체)
    gameData: ReturnType<typeof useGameData>;

    // 시뮬레이션 (useSimulation 전체)
    sim: ReturnType<typeof useSimulation>;

    // 배치 시즌 시뮬 (useFullSeasonSim 전체)
    handleSimulateSeason: (targetDate?: string) => void;
    batchProgress: ReturnType<typeof useFullSeasonSim>['batchProgress'];
    handleCancelBatch: () => void;

    // Toast
    setToastMessage: (msg: string | null) => void;

    // 읽지 않은 메시지
    unreadCount: number;
    refreshUnreadCount: () => Promise<void>;

    // 오프시즌 대기 액션
    pendingOffseasonAction: PendingOffseasonAction;

    // 모드
    rosterMode: RosterMode | null;
    setRosterMode: (mode: RosterMode | null) => void;
    draftPoolType: DraftPoolType | null;
    setDraftPoolType: (pool: DraftPoolType | null) => void;

    // HOF
    hasSubmittedHof: boolean;

    // 상세 뷰 상태 (App 레벨 리프팅)
    viewPlayerData: { player: Player; teamName?: string; teamId?: string } | null;
    setViewPlayerData: (data: { player: Player; teamName?: string; teamId?: string } | null) => void;
    viewCoachData: { coach: any; teamId: string } | null;
    setViewCoachData: (data: { coach: any; teamId: string } | null) => void;
    viewGMTeamId: string | null;
    setViewGMTeamId: (id: string | null) => void;
    selectedTeamId: string | null;
    setSelectedTeamId: (id: string | null) => void;

    // Toast
    toastMessage: string | null;

    // Reset 모달
    isResetModalOpen: boolean;
    isResetting: boolean;
    openResetModal: () => void;
    closeResetModal: () => void;
    handleResetConfirm: () => Promise<void>;

    // Editor 모달
    isEditorModalOpen: boolean;
    openEditor: () => void;
    closeEditor: () => void;

    // SimSettings 모달
    isSimSettingsOpen: boolean;
    openSimSettings: () => void;
    closeSimSettings: () => void;
}

// ─── Context 생성 ────────────────────────────────────────────────

const GameContext = createContext<GameContextValue | null>(null);

// ─── useGame 훅 ──────────────────────────────────────────────────

export function useGame(): GameContextValue {
    const ctx = useContext(GameContext);
    if (!ctx) throw new Error('useGame must be used within GameContextProvider');
    return ctx;
}

export default GameContext;
