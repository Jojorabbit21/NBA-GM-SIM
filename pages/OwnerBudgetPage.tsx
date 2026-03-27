
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../hooks/useGameContext';
import { InvestmentPanel } from '../components/frontoffice/InvestmentPanel';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { InvestmentCategory, TeamInvestmentState } from '../types/finance';
import { autoAllocateCPUBudget, computeInvestmentEffects, createDefaultInvestmentState } from '../services/financeEngine/investmentEngine';
import { getBudgetManager } from '../services/financeEngine';

const OwnerBudgetPage: React.FC = () => {
    const navigate = useNavigate();
    const { gameData } = useGame();
    const { myTeamId, leagueInvestmentState, handleInvestmentConfirm, seasonNumber } = gameData;
    const [confirmed, setConfirmed] = useState(false);

    if (!myTeamId) return null;

    const invState: TeamInvestmentState =
        leagueInvestmentState[myTeamId] ?? createDefaultInvestmentState(seasonNumber);

    const finData = TEAM_FINANCE_DATA[myTeamId];
    const ownerName = finData?.ownerProfile.name ?? '구단주';

    const proceed = useCallback(() => {
        navigate('/');
    }, [navigate]);

    const handleConfirm = useCallback((allocations: Record<InvestmentCategory, number>) => {
        setConfirmed(true);
        handleInvestmentConfirm(allocations, proceed);
    }, [handleInvestmentConfirm, proceed]);

    const handleSkip = useCallback(() => {
        // 기본 배분: 구단주 성향 기반 자동 배분
        const ownerProfile = finData?.ownerProfile;
        const defaultAllocations = ownerProfile
            ? autoAllocateCPUBudget(myTeamId, invState.discretionaryBudget, ownerProfile)
            : { facility: 0, training: 0, scouting: 0, marketing: 0 };
        handleConfirm(defaultAllocations);
    }, [finData, myTeamId, invState.discretionaryBudget, handleConfirm]);

    if (confirmed) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="text-4xl mb-4">✅</div>
                    <div className="text-xl font-bold mb-2">투자 배분 완료</div>
                    <div className="text-gray-400 text-sm">시즌 준비가 완료되었습니다.</div>
                </div>
            </div>
        );
    }

    return (
        <InvestmentPanel
            teamId={myTeamId}
            ownerName={ownerName}
            investmentState={invState}
            onConfirm={handleConfirm}
            onSkip={handleSkip}
        />
    );
};

export default OwnerBudgetPage;
