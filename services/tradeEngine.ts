
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
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            // Core attributes for valuation
            def: p.def, out: p.out, reb: p.reb, plm: p.plm, ins: p.ins, ath: p.ath,
            intDef: p.intDef, perDef: p.perDef,
            // Stats used for fit analysis
            height: p.height
        }))
    }));
};

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
    allTeams: Team[] // [Update] Need allTeams to pass state
): Promise<TradeOffer[]> {
    // [Fix] Inject current client state
    // Note: generateCounterOffers signature in types might need update if strict, 
    // but JS allows extra args. In usage (TransactionsView), we should pass `teams`.
    // If interface restricts, we rely on `targetTeam` and `myTeam` being up to date, 
    // but `leagueState` is safer for global context. 
    // Here we assume `allTeams` is available or passed. 
    // *Correction*: The View calls this. We need to update the View or use a global hook context.
    // For now, let's assume `allTeams` is passed or available via the argument. 
    // Actually, `TransactionsView` calls this. We must update the call site in `TransactionsView.tsx` as well.
    
    // To handle the signature mismatch without breaking types everywhere immediately,
    // we can use the passed `targetTeam` and `myTeam` as the core, but ideal is full state.
    // However, since `generateCounterOffers` only involves 2 teams, passing full league is less critical
    // UNLESS 3-team trades are involved (not yet). 
    // BUT, we should still pass `leagueState` containing at least these 2 teams updated.
    
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
    
    // [Fix] Pass full league state to CPU trade logic too
    // This prevents CPU from trading players that the user might have just acquired 
    // (if the user acquired them but the DB hasn't synced yet).
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
