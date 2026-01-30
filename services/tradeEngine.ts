
import { Team, Player, TradeOffer, Transaction } from '../types';

// ==========================================================================================
//  💼 NBA GM SIMULATOR - TRADE SERVICE (Client Proxy)
//  Connects to Vercel Serverless Functions.
//  ALL proprietary algorithms have been moved to the server to prevent client-side inspection.
// ==========================================================================================

async function callTradeApi(action: string, payload: any) {
    try {
        const response = await fetch('/api/trade-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload })
        });

        if (!response.ok) {
            throw new Error('Trade Engine API Failed');
        }

        return await response.json();
    } catch (e) {
        console.error(`Trade API Error (${action}):`, e);
        return null;
    }
}

export async function generateTradeOffers(
    tradingPlayers: Player[], 
    myTeam: Team, 
    allTeams: Team[], // Kept for interface compatibility
    desiredPositions: string[] = []
): Promise<TradeOffer[]> {
    const data = await callTradeApi('generate-offers', {
        myTeamId: myTeam.id,
        tradingPlayers: tradingPlayers.map(p => ({
            id: p.id, name: p.name, salary: p.salary, position: p.position,
            age: p.age, ovr: p.ovr, potential: p.potential, contractYears: p.contractYears
        })),
        desiredPositions
    });
    return data?.offers || [];
}

export async function generateCounterOffers(
    targetPlayers: Player[], 
    targetTeam: Team, 
    myTeam: Team
): Promise<TradeOffer[]> {
    const data = await callTradeApi('generate-counter-offers', {
        myTeamId: myTeam.id,
        targetTeamId: targetTeam.id,
        targetPlayers: targetPlayers.map(p => ({
            id: p.id, name: p.name, salary: p.salary, position: p.position,
            age: p.age, ovr: p.ovr, potential: p.potential, contractYears: p.contractYears
        }))
    });
    return data?.offers || [];
}

export async function simulateCPUTrades(
    allTeams: Team[], 
    myTeamId: string | null
): Promise<{ updatedTeams: Team[], transaction?: Transaction } | null> {
    
    // 1. Request trade simulation from the server
    // The server uses its own DB-backed roster to find a valid trade.
    const data = await callTradeApi('simulate-cpu-trades', { myTeamId });
    
    if (data?.success && data?.transaction) {
        const tx = data.transaction;
        
        // 2. Apply the server-approved trade to the LOCAL client state
        // We receive the Transaction object which tells us who went where.
        // We must manually swap these players in the local `allTeams` array so the UI updates instantly.
        const buyerId = tx.teamId;
        const sellerId = tx.details.partnerTeamId;
        const acquired = tx.details.acquired; // Players going to Buyer
        const traded = tx.details.traded;     // Players going to Seller

        const updatedTeams = allTeams.map(t => {
            if (t.id === buyerId) {
                // Remove players traded away, Add acquired players
                const remaining = t.roster.filter(p => !traded.some((tp:any) => tp.id === p.id));
                // We need to pull the full player objects from the seller's roster (since TX only has metadata)
                const sellerTeam = allTeams.find(st => st.id === sellerId);
                const newPlayers = sellerTeam?.roster.filter(p => acquired.some((ap:any) => ap.id === p.id)) || [];
                return { ...t, roster: [...remaining, ...newPlayers] };
            }
            if (t.id === sellerId) {
                // Remove players acquired by buyer, Add traded players from buyer
                const remaining = t.roster.filter(p => !acquired.some((ap:any) => ap.id === p.id));
                const buyerTeam = allTeams.find(bt => bt.id === buyerId);
                const newPlayers = buyerTeam?.roster.filter(p => traded.some((tp:any) => tp.id === p.id)) || [];
                return { ...t, roster: [...remaining, ...newPlayers] };
            }
            return t;
        });

        return { updatedTeams, transaction: tx };
    }

    return null;
}
