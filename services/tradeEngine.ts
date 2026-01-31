
import { Team, Player, TradeOffer, Transaction } from '../types';

// ==========================================================================================
//  💼 NBA GM SIMULATOR - TRADE SERVICE (Client Proxy)
//  Connects to Vercel Serverless Functions.
//  ALL proprietary algorithms have been moved to the server to prevent client-side inspection.
// ==========================================================================================

// Helper to minimize payload size (Network Optimization)
// We only send attributes strictly needed for trade valuation logic.
const serializeLeagueState = (teams: Team[]) => {
    return teams.map(t => ({
        id: t.id,
        name: t.name,
        salaryCap: t.salaryCap,
        luxuryTaxLine: t.luxuryTaxLine,
        wins: t.wins,
        losses: t.losses,
        roster: t.roster.map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            age: p.age,
            salary: p.salary,
            contractYears: p.contractYears,
            ovr: p.ovr,
            potential: p.potential,
            health: p.health,
            // Core attributes for valuation only (Reduced payload)
            def: p.def, out: p.out, reb: p.reb, plm: p.plm, ins: p.ins, ath: p.ath,
            // Stats used for fit analysis
            height: p.height
        }))
    }));
};

async function callTradeApi(action: string, payload: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s Timeout

    try {
        const response = await fetch('/api/trade-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Trade Engine API Failed: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        // Debug Log from Server
        if (data.logs) {
            console.groupCollapsed(`[TradeEngine] Server Logs (${action})`);
            data.logs.forEach((l: string) => console.log(l));
            console.groupEnd();
        }

        return data;
    } catch (e: any) {
        console.error(`Trade API Error (${action}):`, e.message);
        return null;
    }
}

export async function generateTradeOffers(
    tradingPlayers: Player[], 
    myTeam: Team, 
    allTeams: Team[], 
    desiredPositions: string[] = []
): Promise<TradeOffer[]> {
    // [Fix] Inject current client state (allTeams) so server knows about recent trades
    const leagueState = serializeLeagueState(allTeams);

    const data = await callTradeApi('generate-offers', {
        myTeamId: myTeam.id,
        leagueState, // Pass current state
        tradingPlayers: tradingPlayers.map(p => ({
            id: p.id, name: p.name, salary: p.salary, position: p.position,
            age: p.age, ovr: p.ovr, potential: p.potential, contractYears: p.contractYears,
            health: p.health
        })),
        desiredPositions
    });
    return data?.offers || [];
}

export async function generateCounterOffers(
    targetPlayers: Player[], 
    targetTeam: Team, 
    myTeam: Team,
    allTeams: Team[] 
): Promise<TradeOffer[]> {
    // [Fix] Inject current client state
    const partialState = serializeLeagueState(allTeams || [myTeam, targetTeam]);

    const data = await callTradeApi('generate-counter-offers', {
        myTeamId: myTeam.id,
        targetTeamId: targetTeam.id,
        leagueState: partialState,
        targetPlayers: targetPlayers.map(p => ({
            id: p.id, name: p.name, salary: p.salary, position: p.position,
            age: p.age, ovr: p.ovr, potential: p.potential, contractYears: p.contractYears,
            health: p.health 
        }))
    });
    return data?.offers || [];
}

export async function simulateCPUTrades(
    allTeams: Team[], 
    myTeamId: string | null
): Promise<{ updatedTeams: Team[], transaction?: Transaction } | null> {
    
    const leagueState = serializeLeagueState(allTeams);

    const data = await callTradeApi('simulate-cpu-trades', { 
        myTeamId,
        leagueState 
    });
    
    if (data?.success && data?.transaction) {
        const tx = data.transaction;
        
        // Apply the server-approved trade to the LOCAL client state
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
