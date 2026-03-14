
import React from 'react';
import { Player, Team, TradeOffer } from '../../../types';
import { DraftPickAsset, LeaguePickAssets } from '../../../types/draftAssets';
import { PersistentPickRef, PersistentTradeOffer } from '../../../types/trade';
import { TradeNegotiationBuilder } from '../TradeNegotiationBuilder';
import { OutgoingOffersPanel } from '../OutgoingOffersPanel';
import { LeagueGMProfiles } from '../../../types/gm';

interface ScoutProposalTabProps {
    teams: Team[];
    userTeam: Team;
    userPicks: DraftPickAsset[];
    leaguePickAssets?: LeaguePickAssets;
    leagueGMProfiles?: LeagueGMProfiles;
    isTradeDeadlinePassed: boolean;
    currentSimDate: string;
    handleViewPlayer: (p: Player) => void;

    // 비동기 제안
    sendPersistentProposal: (
        targetTeamId: string,
        offeredPlayerIds: string[],
        offeredPicks: PersistentPickRef[],
        requestedPlayerIds: string[],
        requestedPicks: PersistentPickRef[]
    ) => void;

    // 즉시 협상 (레거시)
    proposalTargetTeamId: string;
    proposalSelectedIds: Set<string>;
    proposalRequirements: TradeOffer[];
    proposalIsProcessing: boolean;
    proposalSearchPerformed: boolean;
    setProposalTargetTeamId: (id: string) => void;
    setProposalSelectedIds: (ids: Set<string>) => void;
    setProposalSearchPerformed: (v: boolean) => void;
    handleRequestRequirements: () => void;
    onAcceptRequirement: (req: TradeOffer, targetTeam: Team) => void;

    // 발신 오퍼
    outgoingOffers: PersistentTradeOffer[];
}

export const ScoutProposalTab: React.FC<ScoutProposalTabProps> = ({
    teams,
    userTeam,
    userPicks,
    leaguePickAssets,
    leagueGMProfiles,
    isTradeDeadlinePassed,
    currentSimDate,
    handleViewPlayer,
    sendPersistentProposal,
    proposalTargetTeamId,
    proposalSelectedIds,
    proposalRequirements,
    proposalIsProcessing,
    proposalSearchPerformed,
    setProposalTargetTeamId,
    setProposalSelectedIds,
    setProposalSearchPerformed,
    handleRequestRequirements,
    onAcceptRequirement,
    outgoingOffers,
}) => {
    return (
        <div className="flex flex-col flex-1 min-h-0 h-full">
            {/* Builder */}
            <div className="flex-1 flex min-h-0">
                <TradeNegotiationBuilder
                    teams={teams}
                    userTeam={userTeam}
                    userPicks={userPicks}
                    leaguePickAssets={leaguePickAssets}
                    leagueGMProfiles={leagueGMProfiles}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    currentSimDate={currentSimDate}
                    handleViewPlayer={handleViewPlayer}
                    sendPersistentProposal={sendPersistentProposal}
                    showInstantMode
                    handleRequestRequirements={handleRequestRequirements}
                    proposalIsProcessing={proposalIsProcessing}
                    proposalRequirements={proposalRequirements}
                    proposalSearchPerformed={proposalSearchPerformed}
                    onAcceptRequirement={onAcceptRequirement}
                    // 외부 상태 연동 (useTradeSystem)
                    externalTargetTeamId={proposalTargetTeamId}
                    onTargetTeamChange={setProposalTargetTeamId}
                    externalSelectedIds={proposalSelectedIds}
                    onSelectedIdsChange={setProposalSelectedIds}
                    onSearchPerformedReset={() => setProposalSearchPerformed(false)}
                />
            </div>

            {/* Outgoing Offers */}
            <OutgoingOffersPanel
                teams={teams}
                outgoingOffers={outgoingOffers}
                handleViewPlayer={handleViewPlayer}
                currentSimDate={currentSimDate}
            />
        </div>
    );
};
