
import { useMemo } from 'react';
import { Team, Game, Player } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { FilterItem, ViewMode } from '../data/leaderboardConfig';

const ZONE_KEYS = [
    'zone_rim', 'zone_paint', 
    'zone_mid_l', 'zone_mid_c', 'zone_mid_r', 
    'zone_c3_l', 'zone_c3_r', 
    'zone_atb3_l', 'zone_atb3_c', 'zone_atb3_r'
];

export const useLeaderboardData = (
    teams: Team[],
    schedule: Game[],
    activeFilters: FilterItem[],
    sortConfig: { key: string; direction: 'asc' | 'desc' },
    mode: ViewMode,
    selectedTeams: string[] = [],
    selectedPositions: string[] = [],
    searchQuery: string = ''
) => {
    // 2. Aggregate Team Stats including Zones AND Opponent Stats
    const teamStats = useMemo(() => {
        return teams.map(t => {
            const teamGames = schedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
            const playedCount = teamGames.length || 1; 
            
            let totalPts = 0;
            let totalPa = 0;
            let wins = 0;
            let losses = 0;
            
            // Opponent Totals
            let oppFgm = 0; let oppFga = 0;
            let opp3pm = 0; let opp3pa = 0;
            let oppFtm = 0; let oppFta = 0;
            let oppReb = 0; let oppOreb = 0; let oppDreb = 0;
            let oppAst = 0; let oppStl = 0; let oppBlk = 0;
            let oppTov = 0; let oppPf = 0;

            teamGames.forEach(g => {
                const isHome = g.homeTeamId === t.id;
                const myScore = isHome ? g.homeScore : g.awayScore;
                const oppScore = isHome ? g.awayScore : g.homeScore;
                
                if (myScore > oppScore) wins++; else losses++;
                totalPts += myScore;
                totalPa += oppScore;

                // We assume Game object has homeStats and awayStats for box score summaries.
                // If not available, these will be 0, but logic is prepared for when they are.
                const oppStats = isHome ? (g as any).awayStats : (g as any).homeStats;
                if (oppStats) {
                    oppFgm += oppStats.fgm || 0; oppFga += oppStats.fga || 0;
                    opp3pm += oppStats.p3m || 0; opp3pa += oppStats.p3a || 0;
                    oppFtm += oppStats.ftm || 0; oppFta += oppStats.fta || 0;
                    oppReb += oppStats.reb || 0; oppOreb += oppStats.offReb || 0; oppDreb += oppStats.defReb || 0;
                    oppAst += oppStats.ast || 0; oppStl += oppStats.stl || 0; oppBlk += oppStats.blk || 0;
                    oppTov += oppStats.tov || 0; 
                    // oppPf might not be tracked in TeamStats
                }
            });

            // Aggregate totals from roster (My Team Stats)
            const totals = t.roster.reduce((acc: any, p) => {
                const s = p.stats;
                const newAcc = { ...acc };

                // Traditional
                newAcc.reb += s.reb;
                newAcc.offReb += (s.offReb || 0);
                newAcc.defReb += (s.defReb || 0);
                newAcc.ast += s.ast;
                newAcc.stl += s.stl;
                newAcc.blk += s.blk;
                newAcc.tov += s.tov;
                newAcc.fgm += s.fgm;
                newAcc.fga += s.fga;
                newAcc.p3m += s.p3m;
                newAcc.p3a += s.p3a;
                newAcc.ftm += s.ftm;
                newAcc.fta += s.fta;
                newAcc.rimM += (s.rimM || 0);
                newAcc.rimA += (s.rimA || 0);
                newAcc.midM += (s.midM || 0);
                newAcc.midA += (s.midA || 0);

                // Detailed Zones
                ZONE_KEYS.forEach(z => {
                    newAcc[`${z}_m`] = (newAcc[`${z}_m`] || 0) + (s[`${z}_m`] || 0);
                    newAcc[`${z}_a`] = (newAcc[`${z}_a`] || 0) + (s[`${z}_a`] || 0);
                });

                return newAcc;
            }, { 
                reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, 
                fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
                rimM: 0, rimA: 0, midM: 0, midA: 0 
            });

            const tsa = totals.fga + 0.44 * totals.fta;
            const teamPoss = totals.fga + 0.44 * totals.fta + totals.tov - totals.offReb; 
            
            // Build stats object
            const stats: any = {
                g: playedCount,
                mp: 48,
                pts: totalPts / playedCount,
                pa: totalPa / playedCount,
                
                reb: totals.reb / (t.wins + t.losses || 1), 
                oreb: totals.offReb / (t.wins + t.losses || 1),
                dreb: totals.defReb / (t.wins + t.losses || 1),
                ast: totals.ast / (t.wins + t.losses || 1),
                stl: totals.stl / (t.wins + t.losses || 1),
                blk: totals.blk / (t.wins + t.losses || 1),
                tov: totals.tov / (t.wins + t.losses || 1),
                
                fgm: totals.fgm / (t.wins + t.losses || 1),
                fga: totals.fga / (t.wins + t.losses || 1),
                'fg%': totals.fga > 0 ? totals.fgm / totals.fga : 0,
                
                p3m: totals.p3m / (t.wins + t.losses || 1),
                p3a: totals.p3a / (t.wins + t.losses || 1),
                '3p%': totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
                
                ftm: totals.ftm / (t.wins + t.losses || 1),
                fta: totals.fta / (t.wins + t.losses || 1),
                'ft%': totals.fta > 0 ? totals.ftm / totals.fta : 0,
                
                // Aggregated Zone Stats
                rimM: totals.rimM, rimA: totals.rimA,
                'rim%': totals.rimA > 0 ? totals.rimM / totals.rimA : 0,
                midM: totals.midM, midA: totals.midA,
                'mid%': totals.midA > 0 ? totals.midM / totals.midA : 0,
                '3pM': totals.p3m, 

                'ts%': tsa > 0 ? totalPts / (2 * tsa) : 0, 
                pm: (totalPts - totalPa) / playedCount,

                // --- Advanced Stats (Team) ---
                'efg%': totals.fga > 0 ? (totals.fgm + 0.5 * totals.p3m) / totals.fga : 0,
                'tov%': teamPoss > 0 ? totals.tov / teamPoss : 0,
                'usg%': 1.0, 
                'ast%': totals.fgm > 0 ? totals.ast / totals.fgm : 0,
                'orb%': (totals.offReb + oppDreb) > 0 ? totals.offReb / (totals.offReb + oppDreb) : 0,
                'drb%': (totals.defReb + oppOreb) > 0 ? totals.defReb / (totals.defReb + oppOreb) : 0,
                'trb%': (totals.reb + oppReb) > 0 ? totals.reb / (totals.reb + oppReb) : 0,
                'stl%': 0, // Calculated below
                'blk%': 0, // Calculated below
                '3par': totals.fga > 0 ? totals.p3a / totals.fga : 0,
                'ftr': totals.fga > 0 ? totals.fta / totals.fga : 0,

                // --- Opponent Stats ---
                'opp_pts': totalPa / playedCount,
                'opp_fg%': oppFga > 0 ? oppFgm / oppFga : 0,
                'opp_3p%': opp3pa > 0 ? opp3pm / opp3pa : 0,
                'opp_ast': oppAst / playedCount,
                'opp_reb': oppReb / playedCount,
                'opp_oreb': oppOreb / playedCount,
                'opp_stl': oppStl / playedCount,
                'opp_blk': oppBlk / playedCount,
                'opp_tov': oppTov / playedCount,
                'opp_pf': oppPf / playedCount,
            };

            // Refine Advanced Stats that need Opponent Data
            const oppPoss = oppFga + 0.44 * oppFta + oppTov - oppOreb;
            stats['stl%'] = oppPoss > 0 ? totals.stl / oppPoss : 0;
            const opp2pa = oppFga - opp3pa;
            stats['blk%'] = opp2pa > 0 ? totals.blk / opp2pa : 0;

            // Calculate per-zone Percentages and Per-Game averages
            ZONE_KEYS.forEach(z => {
                const m = totals[`${z}_m`] || 0;
                const a = totals[`${z}_a`] || 0;
                stats[`${z}_m`] = m / playedCount; // Per Game
                stats[`${z}_a`] = a / playedCount; // Per Game
                stats[`${z}_pct`] = a > 0 ? m / a : 0;
            });

            return {
                ...t,
                wins, 
                losses,
                stats,
                rawTotals: totals,
                rawOppTotals: { oppFgm, oppFga, opp3pm, opp3pa, oppFtm, oppFta, oppReb, oppOreb, oppDreb, oppAst, oppStl, oppBlk, oppTov, oppPoss }
            };
        });
    }, [teams, schedule]);

    // 1. Flatten Players & Pre-calculate Zone % AND Advanced Stats
    const allPlayers = useMemo(() => {
        return teams.flatMap(t => {
            // Find team stat object to get Opponent stats for context
            const tStat = teamStats.find(ts => ts.id === t.id);
            const teamMin = (tStat?.stats.g || 1) * 48;
            const teamFgm = tStat?.rawTotals.fgm || 0;
            const teamPoss = (tStat?.rawTotals.fga || 0) + 0.44 * (tStat?.rawTotals.fta || 0) + (tStat?.rawTotals.tov || 0) - (tStat?.rawTotals.offReb || 0);
            
            const oppDreb = tStat?.rawOppTotals.oppDreb || 0;
            const oppOreb = tStat?.rawOppTotals.oppOreb || 0;
            const oppReb = tStat?.rawOppTotals.oppReb || 0;
            const oppPoss = tStat?.rawOppTotals.oppPoss || 0;
            const opp2pa = (tStat?.rawOppTotals.oppFga || 0) - (tStat?.rawOppTotals.opp3pa || 0);

            return t.roster.map(p => {
                const s = { ...p.stats } as any;
                const g = s.g || 1;
                const mp = s.mp || 1; // Total minutes played
                
                // Pre-calculate zone percentages
                ZONE_KEYS.forEach(z => {
                    const m = s[`${z}_m`] || 0;
                    const a = s[`${z}_a`] || 0;
                    s[`${z}_pct`] = a > 0 ? m / a : 0;
                });

                // --- Advanced Stats (Player) ---
                const tsa = s.fga + 0.44 * s.fta;
                s['ts%'] = tsa > 0 ? s.pts / (2 * tsa) : 0;
                s['efg%'] = s.fga > 0 ? (s.fgm + 0.5 * s.p3m) / s.fga : 0;
                s['tov%'] = (s.fga + 0.44 * s.fta + s.tov) > 0 ? s.tov / (s.fga + 0.44 * s.fta + s.tov) : 0;
                
                // USG%
                const playerPossCount = s.fga + 0.44 * s.fta + s.tov;
                if (mp > 0 && teamPoss > 0) {
                    s['usg%'] = (playerPossCount * (teamMin / 5)) / (mp * teamPoss);
                } else {
                    s['usg%'] = 0;
                }

                // AST%
                if (mp > 0) {
                    const denominator = ((mp / (teamMin / 5)) * teamFgm) - s.fgm;
                    s['ast%'] = denominator > 0 ? s.ast / denominator : 0;
                } else {
                    s['ast%'] = 0;
                }

                // ORB%
                const teamOreb = tStat?.rawTotals.offReb || 0;
                const totalOrebChances = teamOreb + oppDreb;
                if (mp > 0 && totalOrebChances > 0) {
                    s['orb%'] = (s.offReb * (teamMin / 5)) / (mp * totalOrebChances);
                } else s['orb%'] = 0;

                // DRB%
                const teamDreb = tStat?.rawTotals.defReb || 0;
                const totalDrebChances = teamDreb + oppOreb;
                if (mp > 0 && totalDrebChances > 0) {
                    s['drb%'] = (s.defReb * (teamMin / 5)) / (mp * totalDrebChances);
                } else s['drb%'] = 0;

                // TRB%
                const totalRebChances = (tStat?.rawTotals.reb || 0) + oppReb;
                if (mp > 0 && totalRebChances > 0) {
                    s['trb%'] = (s.reb * (teamMin / 5)) / (mp * totalRebChances);
                } else s['trb%'] = 0;

                // STL%
                if (mp > 0 && oppPoss > 0) {
                    s['stl%'] = (s.stl * (teamMin / 5)) / (mp * oppPoss);
                } else s['stl%'] = 0;

                // BLK%
                if (mp > 0 && opp2pa > 0) {
                    s['blk%'] = (s.blk * (teamMin / 5)) / (mp * opp2pa);
                } else s['blk%'] = 0;

                s['3par'] = s.fga > 0 ? s.p3a / s.fga : 0;
                s['ftr'] = s.fga > 0 ? s.fta / s.fga : 0;

                return { 
                    ...p, 
                    stats: s,
                    teamId: t.id, 
                    teamName: t.name,
                    teamCity: t.city
                };
            });
        });
    }, [teams, teamStats]);

    // 3. Calculate Global Min/Max for Color Scale (Heatmap)
    const statRanges = useMemo(() => {
        const ranges: Record<string, { min: number, max: number }> = {};
        const update = (k: string, v: number) => {
            if (!ranges[k]) ranges[k] = { min: v, max: v };
            else {
                ranges[k].min = Math.min(ranges[k].min, v);
                ranges[k].max = Math.max(ranges[k].max, v);
            }
        };

        if (mode === 'Players') {
            allPlayers.forEach(p => {
                const s = p.stats as any;
                const g = s.g || 1;
                // Pre-calculate per-game values for range finding
                update('pts', s.pts / g);
                update('reb', s.reb / g);
                update('oreb', (s.offReb || 0) / g);
                update('dreb', (s.defReb || 0) / g);
                update('ast', s.ast / g);
                update('stl', s.stl / g);
                update('blk', s.blk / g);
                update('tov', s.tov / g);
                update('fg%', s.fga > 0 ? s.fgm / s.fga : 0);
                update('3p%', s.p3a > 0 ? s.p3m / s.p3a : 0);
                update('ft%', s.fta > 0 ? s.ftm / s.fta : 0);
                update('rim%', (s.rimA || 0) > 0 ? (s.rimM || 0) / s.rimA : 0);
                update('mid%', (s.midA || 0) > 0 ? (s.midM || 0) / s.midA : 0);
                
                const tsa = s.fga + 0.44 * s.fta;
                update('ts%', tsa > 0 ? s.pts / (2 * tsa) : 0);
                update('pm', s.plusMinus / g);
                update('ovr', calculatePlayerOvr(p));

                // Zone Stats
                ZONE_KEYS.forEach(z => {
                    // M & A are aggregates in player stats, convert to per game for range?
                    // Usually range for M/A is useful.
                    update(`${z}_m`, (s[`${z}_m`] || 0) / g);
                    update(`${z}_a`, (s[`${z}_a`] || 0) / g);
                    update(`${z}_pct`, s[`${z}_pct`]);
                });

                // Advanced Stats
                update('efg%', s['efg%']);
                update('tov%', s['tov%']);
                update('usg%', s['usg%']);
                update('ast%', s['ast%']);
                update('orb%', s['orb%']);
                update('drb%', s['drb%']);
                update('trb%', s['trb%']);
                update('stl%', s['stl%']);
                update('blk%', s['blk%']);
                update('3par', s['3par']);
                update('ftr', s['ftr']);
            });
        } else {
            teamStats.forEach(t => {
                const s = t.stats;
                update('wins', t.wins);
                update('losses', t.losses);
                update('winPct', (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0);
                
                // Team stats object already has pre-calculated averages/totals with correct keys
                Object.keys(s).forEach(key => {
                     if (typeof (s as any)[key] === 'number') {
                         update(key, (s as any)[key]);
                     }
                });
            });
        }
        return ranges;
    }, [mode, allPlayers, teamStats]);

    // 4. Sort and Filter Data
    const sortedData = useMemo(() => {
        let data: any[] = mode === 'Players' ? [...allPlayers.filter(p => p.stats.g > 0)] : [...teamStats];

        // --- APPLY NEW FILTERS (Team, Position, Search) ---
        if (mode === 'Players') {
            // Team Filter
            if (selectedTeams.length > 0) {
                data = data.filter(p => selectedTeams.includes(p.teamId));
            }
            // Position Filter
            if (selectedPositions.length > 0) {
                data = data.filter(p => selectedPositions.includes(p.position));
            }
            // Search Filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                data = data.filter(p => p.name.toLowerCase().includes(query));
            }
        } else {
            // Team Mode Filters
            if (selectedTeams.length > 0) {
                data = data.filter(t => selectedTeams.includes(t.id));
            }
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                data = data.filter(t => t.name.toLowerCase().includes(query) || t.city.toLowerCase().includes(query));
            }
        }

        // --- APPLY STAT FILTERS ---
        if (activeFilters.length > 0) {
            data = data.filter(item => {
                return activeFilters.every(filter => {
                    if (filter.type !== 'stat') return true; 
                    
                    let itemVal = 0;
                    if (mode === 'Players') {
                        const p = item as Player;
                        const g = p.stats.g || 1;
                        const s = p.stats as any;

                        if (filter.category && filter.category.startsWith('zone_')) {
                             // Zone Stats
                             if (filter.category.endsWith('_pct')) {
                                 itemVal = (s[filter.category] || 0) * 100;
                             } else {
                                 // M or A (Average per game)
                                 itemVal = (s[filter.category] || 0) / g;
                             }
                        } else {
                            // Traditional & Advanced Stats
                            // Check if key exists in stats object directly (Advanced stats are pre-calced in s)
                            if (s[filter.category!] !== undefined) {
                                itemVal = s[filter.category!];
                                // If it's a percentage stat (0-1), multiply by 100 for filter if user inputs 50 for 50%
                                if (filter.category!.endsWith('%')) {
                                    itemVal *= 100;
                                } else if (!['usg%', 'ast%', 'orb%', 'drb%', 'trb%', 'stl%', 'blk%', '3par', 'ftr'].includes(filter.category!)) {
                                    // Per Game for traditional counts
                                    // Advanced stats are already ratios, so no /g
                                    // Traditional counts need /g
                                    if (['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'oreb', 'dreb', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'].includes(filter.category!)) {
                                        itemVal = itemVal / g;
                                    }
                                }
                            } else {
                                // Fallback for calculated on fly (like ovr)
                                switch(filter.category) {
                                    case 'ovr': itemVal = calculatePlayerOvr(p); break;
                                    default: itemVal = 0;
                                }
                            }
                        }
                    } else {
                        const t = item as typeof teamStats[0];
                        const s = t.stats;
                        
                        if (filter.category && filter.category.startsWith('zone_')) {
                             if (filter.category.endsWith('_pct')) {
                                 itemVal = (s[filter.category] || 0) * 100;
                             } else {
                                 itemVal = s[filter.category] || 0;
                             }
                        } else {
                            if (s[filter.category!] !== undefined) {
                                itemVal = s[filter.category!];
                                if (filter.category!.endsWith('%')) {
                                    itemVal *= 100;
                                }
                            }
                        }
                    }

                    const criteria = filter.value as number;
                    switch (filter.operator) {
                        case '>': return itemVal > criteria;
                        case '<': return itemVal < criteria;
                        case '>=': return itemVal >= criteria;
                        case '<=': return itemVal <= criteria;
                        case '=': return Math.abs(itemVal - criteria) < 0.1;
                        default: return true;
                    }
                });
            });
        }

        // --- SORTING ---
        return data.sort((a, b) => {
            let valA: number | string = 0;
            let valB: number | string = 0;

            const getVal = (item: any) => {
                if (mode === 'Players') {
                    const p = item as Player;
                    const g = p.stats.g || 1;
                    const s = p.stats as any;
                    
                    if (sortConfig.key === 'name') return p.name;
                    if (sortConfig.key === 'position') return p.position;
                    if (sortConfig.key === 'ovr') return calculatePlayerOvr(p);
                    
                    // Direct access for most keys now (including advanced)
                    if (s[sortConfig.key] !== undefined) {
                        const val = s[sortConfig.key];
                        // If it's a count stat, average it. If ratio, use as is.
                        if (['pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pm', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'].includes(sortConfig.key)) {
                            return val / g;
                        }
                        return val;
                    }
                    
                    // Zone Keys (M, A, PCT)
                    if (sortConfig.key.endsWith('_m') || sortConfig.key.endsWith('_a')) {
                         return (s[sortConfig.key] || 0) / g;
                    }
                    if (sortConfig.key.endsWith('_pct')) {
                         return s[sortConfig.key] || 0;
                    }

                    return 0;
                } else {
                    const t = item as typeof teamStats[0];
                    if (sortConfig.key === 'name') return t.city;
                    if (sortConfig.key === 'wins') return t.wins;
                    if (sortConfig.key === 'losses') return t.losses;
                    if (sortConfig.key === 'winPct') return (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0;
                    
                    return (t.stats as any)[sortConfig.key] || 0;
                }
            };

            valA = getVal(a);
            valB = getVal(b);

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortConfig.direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
        });

    }, [allPlayers, teamStats, mode, sortConfig, activeFilters, selectedTeams, selectedPositions, searchQuery]);

    return { sortedData, statRanges };
};
