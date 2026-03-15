import React, { useMemo } from 'react';
import { LeaguePickAssets, DraftPickAsset } from '../../types/draftAssets';
import { PICK_SEASONS } from '../../services/draftAssets/pickInitializer';
import { TRADED_FIRST_ROUND_PICKS, SWAP_RIGHTS } from '../../data/draftPickTrades';
import { TEAM_DATA } from '../../data/teamData';

// ── 공통 엑셀 그리드 스타일 ──
const thClass = "py-1.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-300 whitespace-nowrap border-b border-slate-600 bg-slate-800";
const tdClass = "py-1.5 px-2 text-xs font-medium whitespace-nowrap border-b border-slate-700/60";

/** 드래프트 픽 거래 기록 테이블 */
export const PickTradeHistory: React.FC<{ myTeamId: string }> = ({ myTeamId }) => {
    const teamName = (id: string) => TEAM_DATA[id]?.name || id.toUpperCase();

    // 내 팀과 관련된 거래만 필터링
    const relevantTrades = useMemo(() => {
        const trades: { date: string; season: number; round: number; type: '픽 이동' | '스왑 권리'; description: string; direction: 'in' | 'out' | 'swap' }[] = [];

        for (const t of TRADED_FIRST_ROUND_PICKS) {
            if (t.originalTeamId === myTeamId) {
                // 내 픽을 넘긴 거래
                let protLabel = '';
                if (t.protection) {
                    if (t.protection.type === 'none') protLabel = ' (보호 없음)';
                    else if (t.protection.type === 'top' && t.protection.threshold) {
                        protLabel = ` (상위 ${t.protection.threshold}순위 보호`;
                        if (t.protection.fallbackSeason) protLabel += ` → ${t.protection.fallbackSeason} ${t.protection.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환`;
                        protLabel += ')';
                    } else if (t.protection.type === 'lottery') protLabel = ' (로터리 보호)';
                }
                trades.push({
                    date: '시즌 개시 전',
                    season: t.season,
                    round: t.round,
                    type: '픽 이동',
                    description: `${t.season} ${t.round}라운드 픽 → ${teamName(t.currentTeamId)}${protLabel}`,
                    direction: 'out',
                });
            } else if (t.currentTeamId === myTeamId) {
                // 타팀 픽을 획득한 거래
                let protLabel = '';
                if (t.protection) {
                    if (t.protection.type === 'none') protLabel = ' (보호 없음)';
                    else if (t.protection.type === 'top' && t.protection.threshold) {
                        protLabel = ` (상위 ${t.protection.threshold}순위 보호`;
                        if (t.protection.fallbackSeason) protLabel += ` → ${t.protection.fallbackSeason} ${t.protection.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환`;
                        protLabel += ')';
                    } else if (t.protection.type === 'lottery') protLabel = ' (로터리 보호)';
                }
                trades.push({
                    date: '시즌 개시 전',
                    season: t.season,
                    round: t.round,
                    type: '픽 이동',
                    description: `${teamName(t.originalTeamId)}의 ${t.season} ${t.round}라운드 픽 획득${protLabel}`,
                    direction: 'in',
                });
            }
        }

        for (const s of SWAP_RIGHTS) {
            if (s.beneficiaryTeamId === myTeamId) {
                trades.push({
                    date: '시즌 개시 전',
                    season: s.season,
                    round: s.round,
                    type: '스왑 권리',
                    description: `${s.season} ${s.round}라운드 — ${teamName(s.originTeamId)}과 스왑 권리 보유`,
                    direction: 'swap',
                });
            } else if (s.originTeamId === myTeamId) {
                trades.push({
                    date: '시즌 개시 전',
                    season: s.season,
                    round: s.round,
                    type: '스왑 권리',
                    description: `${s.season} ${s.round}라운드 — ${teamName(s.beneficiaryTeamId)}에 스왑 권리 제공`,
                    direction: 'swap',
                });
            }
        }

        trades.sort((a, b) => a.season - b.season || a.round - b.round);
        return trades;
    }, [myTeamId]);

    if (relevantTrades.length === 0) {
        return <div className="text-xs text-slate-500 px-2 pb-4">관련 거래 기록이 없습니다.</div>;
    }

    return (
        <table className="w-full border-collapse text-xs table-fixed">
            <colgroup>
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '60px' }} />
                <col />
            </colgroup>
            <thead className="sticky top-0 z-10">
                <tr>
                    <th className={`${thClass} text-center`}>거래 일자</th>
                    <th className={`${thClass} text-center border-l border-slate-600`}>유형</th>
                    <th className={`${thClass} text-center border-l border-slate-600`}>방향</th>
                    <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>내용</th>
                </tr>
            </thead>
            <tbody>
                {relevantTrades.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                        <td className={`${tdClass} text-center text-slate-400`}>{t.date}</td>
                        <td className={`${tdClass} text-center border-l border-slate-600 text-slate-300`}>{t.type}</td>
                        <td className={`${tdClass} text-center border-l border-slate-600 font-bold ${
                            t.direction === 'in' ? 'text-emerald-400' : t.direction === 'out' ? 'text-red-400/70' : 'text-amber-400/70'
                        }`}>
                            {t.direction === 'in' ? '획득' : t.direction === 'out' ? '양도' : '스왑'}
                        </td>
                        <td className={`${tdClass} text-left border-l border-slate-600 pl-3 text-slate-300`}>{t.description}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

// ── 드래프트 픽 패널 ──

export const DraftPicksPanel: React.FC<{
    teamId: string;
    leaguePickAssets?: LeaguePickAssets | null;
}> = ({ teamId, leaguePickAssets }) => {
    const myPicks = leaguePickAssets?.[teamId] ?? [];

    // season-round → pick[] 매핑 (복수 픽 지원)
    const pickMap = useMemo(() => {
        const map = new Map<string, DraftPickAsset[]>();
        myPicks.forEach(p => {
            const key = `${p.season}-${p.round}`;
            const arr = map.get(key) || [];
            arr.push(p);
            map.set(key, arr);
        });
        return map;
    }, [myPicks]);

    // 내 원래 픽을 누가 가져갔는지 역방향 조회 (season-round → 현재 보유팀)
    const tradedAwayMap = useMemo(() => {
        const map = new Map<string, DraftPickAsset>();
        if (!leaguePickAssets) return map;
        for (const tid of Object.keys(leaguePickAssets)) {
            if (tid === teamId) continue;
            for (const pick of leaguePickAssets[tid]) {
                if (pick.originalTeamId === teamId) {
                    map.set(`${pick.season}-${pick.round}`, pick);
                }
            }
        }
        return map;
    }, [leaguePickAssets, teamId]);

    const teamName = (id: string) => TEAM_DATA[id]?.name || id.toUpperCase();

    // 보호 조건 라벨
    const getProtectionLabel = (pick: DraftPickAsset): string | null => {
        if (!pick.protection) return null;
        const p = pick.protection;
        if (p.type === 'none') return '보호 없음';
        if (p.type === 'top' && p.threshold) {
            const fallback = p.fallbackSeason ? ` → ${p.fallbackSeason} ${p.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환` : '';
            return `상위 ${p.threshold}순위 보호${fallback}`;
        }
        if (p.type === 'lottery') return '로터리 보호';
        return null;
    };

    // 특정 픽과 관련된 스왑 권리를 SWAP_RIGHTS 정적 데이터에서 직접 조회
    // (세이브 데이터의 swapRight 필드는 단일 객체라 복수 스왑을 누락할 수 있음)
    const getSwapLabels = (pick: DraftPickAsset): string[] => {
        const labels: string[] = [];
        for (const s of SWAP_RIGHTS) {
            if (s.season !== pick.season || s.round !== pick.round) continue;
            // 이 픽의 originalTeamId가 스왑의 originTeamId와 일치하는 경우
            if (s.originTeamId === pick.originalTeamId) {
                if (s.beneficiaryTeamId === teamId) {
                    labels.push(`↔ ${teamName(s.originTeamId)} (스왑 권리 보유)`);
                } else if (pick.currentTeamId === teamId || pick.originalTeamId === teamId) {
                    labels.push(`↔ ${teamName(s.beneficiaryTeamId)} (스왑 권리 피대상)`);
                }
            }
            // 이 픽의 originalTeamId가 스왑의 beneficiaryTeamId와 일치하는 경우
            // (내 픽에 대해 상대가 스왑 권리를 가진 경우)
            if (s.beneficiaryTeamId === pick.originalTeamId && s.originTeamId !== pick.originalTeamId) {
                if (pick.currentTeamId === teamId || pick.originalTeamId === teamId) {
                    labels.push(`↔ ${teamName(s.originTeamId)} (스왑 권리 보유)`);
                }
            }
        }
        return labels;
    };

    // 픽 하나의 비고 텍스트
    const getPickNotes = (pick: DraftPickAsset): string[] => {
        const notes: string[] = [];
        const prot = getProtectionLabel(pick);
        if (prot) notes.push(prot);
        const swapLabels = getSwapLabels(pick);
        notes.push(...swapLabels);
        return notes;
    };

    // 라운드별 행 엔트리 생성 — 각 픽이 1행씩 차지
    interface RowEntry {
        label: string;
        color: string;
        notes: string[];
    }

    const buildRoundEntries = (picks: DraftPickAsset[], round: 1 | 2, season: number): RowEntry[] => {
        const entries: RowEntry[] = [];
        const tradedPick = tradedAwayMap.get(`${season}-${round}`);
        const hasOwnPick = picks.some(p => p.originalTeamId === teamId);

        // 자기 픽 보유
        if (hasOwnPick) {
            const ownPick = picks.find(p => p.originalTeamId === teamId)!;
            entries.push({ label: '보유', color: 'text-indigo-400 font-bold', notes: getPickNotes(ownPick) });
        }

        // 자기 픽을 넘긴 경우
        if (!hasOwnPick && tradedPick) {
            entries.push({
                label: `→ ${teamName(tradedPick.currentTeamId)}`,
                color: 'text-red-400/70',
                notes: getPickNotes(tradedPick),
            });
        }

        // 타팀에서 획득한 픽 (각각 1행)
        for (const p of picks) {
            if (p.originalTeamId === teamId) continue;
            entries.push({
                label: `${teamName(p.originalTeamId)} 픽 획득`,
                color: 'text-emerald-400 font-bold',
                notes: getPickNotes(p),
            });
        }

        // 엔트리가 없으면 빈 행
        if (entries.length === 0) {
            entries.push({ label: '보유', color: 'text-indigo-400 font-bold', notes: [] });
        }

        return entries;
    };

    // 시즌별 행 데이터 생성
    const seasonRows = useMemo(() => {
        return PICK_SEASONS.map(season => {
            const r1Picks = pickMap.get(`${season}-1`) || [];
            const r2Picks = pickMap.get(`${season}-2`) || [];
            const r1Entries = buildRoundEntries(r1Picks, 1, season);
            const r2Entries = buildRoundEntries(r2Picks, 2, season);
            const rowCount = Math.max(r1Entries.length, r2Entries.length);
            return { season, r1Entries, r2Entries, rowCount };
        });
    }, [pickMap, tradedAwayMap, teamId]);

    return (
        <div className="animate-in fade-in duration-500 border-b-2 border-b-slate-500">
            <table className="w-full border-collapse text-xs table-fixed">
                <colgroup>
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '130px' }} />
                    <col />
                    <col style={{ width: '130px' }} />
                    <col />
                </colgroup>
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className={`${thClass} text-center`}>시즌</th>
                        <th className={`${thClass} text-center border-l border-slate-600`}>1라운드</th>
                        <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>비고</th>
                        <th className={`${thClass} text-center border-l border-slate-600`}>2라운드</th>
                        <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>비고</th>
                    </tr>
                </thead>
                <tbody>
                    {seasonRows.map(({ season, r1Entries, r2Entries, rowCount }) =>
                        Array.from({ length: rowCount }, (_, rowIdx) => {
                            const r1 = r1Entries[rowIdx];
                            const r2 = r2Entries[rowIdx];
                            const isFirstRow = rowIdx === 0;
                            const borderClass = rowIdx < rowCount - 1 ? 'border-b border-slate-700/30' : 'border-b border-slate-700/60';

                            return (
                                <tr key={`${season}-${rowIdx}`} className="hover:bg-slate-800/40">
                                    {isFirstRow && (
                                        <td
                                            rowSpan={rowCount}
                                            className={`${tdClass} text-center font-bold text-slate-200 bg-slate-800 border-b border-slate-700/60`}
                                        >
                                            {season}-{String(season + 1).slice(-2)}
                                        </td>
                                    )}
                                    {r1 ? (
                                        <>
                                            <td className={`py-1.5 px-2 text-xs text-center ${borderClass} border-l border-slate-600 ${r1.color}`}>
                                                {r1.label}
                                            </td>
                                            <td className={`py-1.5 px-2 text-left ${borderClass} border-l border-slate-600 pl-3`}>
                                                {r1.notes.map((note, i) => (
                                                    <div key={i} className="text-xs text-slate-100 leading-tight">{note}</div>
                                                ))}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                        </>
                                    )}
                                    {r2 ? (
                                        <>
                                            <td className={`py-1.5 px-2 text-xs text-center ${borderClass} border-l border-slate-600 ${r2.color}`}>
                                                {r2.label}
                                            </td>
                                            <td className={`py-1.5 px-2 text-left ${borderClass} border-l border-slate-600 pl-3`}>
                                                {r2.notes.map((note, i) => (
                                                    <div key={i} className="text-xs text-slate-100 leading-tight">{note}</div>
                                                ))}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                        </>
                                    )}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>

            {/* ── 드래프트 픽 거래 기록 ── */}
            <h3 className="text-sm font-bold text-slate-300 mt-6 mb-2 px-2">거래 기록</h3>
            <PickTradeHistory myTeamId={teamId} />
        </div>
    );
};
