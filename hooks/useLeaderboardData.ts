
import { useMemo } from 'react';
import { Team, Game, Player } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { FilterItem, ViewMode } from '../data/leaderboardConfig';

export const useLeaderboardData = (
    teams: Team[],
    schedule: Game[],
    activeFilters: FilterItem[],
    sortConfig: { key: string; direction: 'asc' | 'desc' },
    mode: ViewMode
) => {
    // 1. Flatten Players
    const allPlayers = useMemo(() => {
        return teams.flatMap(t => 
            t.roster.map(p => ({ 
                ...p, 
                teamId: t.id, 
                teamName: t.name,
                teamCity: t.city
            }))
        );
    }, [teams]);

    // 2. Aggregate Team Stats
    const teamStats = useMemo(() => {
        // Check for active date filter
        const dateFilter = activeFilters.find(f => f.type === 'date');
        let targetSchedule = schedule;

        if (dateFilter && typeof dateFilter.value === 'string') {
            const { start, end } = JSON.parse(dateFilter.value);
            targetSchedule = schedule.filter(g => {
                const gDate = g.date; 
                return gDate >= start && gDate <= end;
            });
        }

        return teams.map(t => {
            const teamGames = targetSchedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
            const playedCount = teamGames.length || 1; 
            
            let totalPts = 0;
            let totalPa = 0;
            let wins = 0;
            let losses = 0;
            
            teamGames.forEach(g => {
                let myScore = 0;
                let oppScore = 0;
                if (g.homeTeamId === t.id) {
                    myScore = g.homeScore || 0;
                    oppScore = g.awayScore || 0;
                    totalPts += myScore;
                    totalPa += oppScore;
                } else {
                    myScore = g.awayScore || 0;
                    oppScore = g.homeScore || 0;
                    totalPts += myScore;
                    totalPa += oppScore;
                }
                if (myScore > oppScore) wins++;
                else losses++;
            });

            const totals = t.roster.reduce((acc, p) => ({
                reb: acc.reb + p.stats.reb,
                offReb: acc.offReb + (p.stats.offReb || 0),
                defReb: acc.defReb + (p.stats.defReb || 0),
                ast: acc.ast + p.stats.ast,
                stl: acc.stl + p.stats.stl,
                blk: acc.blk + p.stats.blk,
                tov: acc.tov + p.stats.tov,
                fgm: acc.fgm + p.stats.fgm,
                fga: acc.fga + p.stats.fga,
                p3m: acc.p3m + p.stats.p3m,
                p3a: acc.p3a + p.stats.p3a,
                ftm: acc.ftm + p.stats.ftm,
                fta: acc.fta + p.stats.fta,
                rimM: acc.rimM + (p.stats.rimM || 0),
                rimA: acc.rimA + (p.stats.rimA || 0),
                midM: acc.midM + (p.stats.midM || 0),
                midA: acc.midA + (p.stats.midA || 0),
            }), { 
                reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, 
                fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
                rimM: 0, rimA: 0, midM: 0, midA: 0 
            });

            const tsa = totals.fga + 0.44 * totals.fta;
            
            return {
                ...t,
                wins, 
                losses,
                stats: {
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
                    
                    // Zone Stats
                    rimM: totals.rimM, rimA: totals.rimA,
                    'rim%': totals.rimA > 0 ? totals.rimM / totals.rimA : 0,
                    midM: totals.midM, midA: totals.midA,
                    'mid%': totals.midA > 0 ? totals.midM / totals.midA : 0,
                    '3pM': totals.p3m, // Alias for chart

                    'ts%': tsa > 0 ? (totalPts / playedCount) / (2 * (tsa/playedCount)) : 0, 
                    pm: (totalPts - totalPa) / playedCount,
                }
            };
        });
    }, [teams, schedule, activeFilters]);

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
                const s = p.stats;
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

        // --- APPLY STAT FILTERS ---
        if (activeFilters.length > 0) {
            data = data.filter(item => {
                return activeFilters.every(filter => {
                    if (filter.type !== 'stat') return true; 
                    
                    let itemVal = 0;
                    if (mode === 'Players') {
                        const p = item as Player;
                        const g = p.stats.g || 1;
                        // Map filter category to value
                        switch(filter.category) {
                            case 'pts': itemVal = p.stats.pts / g; break;
                            case 'reb': itemVal = p.stats.reb / g; break;
                            case 'ast': itemVal = p.stats.ast / g; break;
                            case 'stl': itemVal = p.stats.stl / g; break;
                            case 'blk': itemVal = p.stats.blk / g; break;
                            case 'tov': itemVal = p.stats.tov / g; break;
                            case 'fg%': itemVal = (p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0) * 100; break;
                            case '3p%': itemVal = (p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0) * 100; break;
                            case 'ts%': {
                                const tsa = p.stats.fga + 0.44 * p.stats.fta;
                                itemVal = tsa > 0 ? (p.stats.pts / (2*tsa)) * 100 : 0;
                                break;
                            }
                            case 'ovr': itemVal = calculatePlayerOvr(p); break;
                            default: itemVal = 0;
                        }
                    } else {
                        const t = item as typeof teamStats[0];
                        const s = t.stats;
                        // Map filter category to team stat value
                        switch(filter.category) {
                            case 'pts': itemVal = s.pts; break;
                            case 'reb': itemVal = s.reb; break;
                            case 'ast': itemVal = s.ast; break;
                            case 'fg%': itemVal = s['fg%'] * 100; break;
                            case '3p%': itemVal = s['3p%'] * 100; break;
                            default: itemVal = 0;
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
                    const s = p.stats;
                    
                    if (sortConfig.key === 'name') return p.name;
                    if (sortConfig.key === 'position') return p.position;
                    if (sortConfig.key === 'ovr') return calculatePlayerOvr(p);
                    
                    // Stat keys
                    if (sortConfig.key === 'mp') return s.mp / g;
                    if (sortConfig.key === 'pts') return s.pts / g;
                    if (sortConfig.key === 'reb') return s.reb / g;
                    if (sortConfig.key === 'oreb') return (s.offReb || 0) / g;
                    if (sortConfig.key === 'dreb') return (s.defReb || 0) / g;
                    if (sortConfig.key === 'ast') return s.ast / g;
                    if (sortConfig.key === 'stl') return s.stl / g;
                    if (sortConfig.key === 'blk') return s.blk / g;
                    if (sortConfig.key === 'tov') return s.tov / g;
                    if (sortConfig.key === 'pm') return s.plusMinus / g;
                    
                    if (sortConfig.key === 'fg%') return s.fga > 0 ? s.fgm/s.fga : 0;
                    if (sortConfig.key === '3p%') return s.p3a > 0 ? s.p3m/s.p3a : 0;
                    if (sortConfig.key === 'ft%') return s.fta > 0 ? s.ftm/s.fta : 0;
                    if (sortConfig.key === 'rim%') return (s.rimA||0) > 0 ? (s.rimM||0)/(s.rimA||0) : 0;
                    if (sortConfig.key === 'mid%') return (s.midA||0) > 0 ? (s.midM||0)/(s.midA||0) : 0;
                    if (sortConfig.key === 'ts%') {
                        const tsa = s.fga + 0.44 * s.fta;
                        return tsa > 0 ? s.pts / (2 * tsa) : 0;
                    }

                    return (s as any)[sortConfig.key] || 0;
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

    }, [allPlayers, teamStats, mode, sortConfig, activeFilters]);

    return { sortedData, statRanges };
};
