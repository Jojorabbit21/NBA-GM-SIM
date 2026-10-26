// Split (situational) averages built from a player's per-game log rows — home/away, W/L, month, opponent, last N.
// Input rows are the same shape PlayerDetailView's game log uses: { date: 'YYYY-MM-DD', opponentId, isHome,
// teamScore, opponentScore, isPlayoff?, ...box fields }.

// 한 줄 = 한 분류(라벨) + 그 분류에 속한 경기들. 표시용 스탯은 화면(게임 로그와 같은 열 정의)에서 games로 계산한다.
export interface SplitLine { label: string; games: any[]; gp: number; w: number; l: number; }
export interface SplitGroup { title: string; lines: SplitLine[]; }

export function summarizeGames(label: string, games: any[]): SplitLine {
    const w = games.filter(x => x.teamScore > x.opponentScore).length;
    return { label, games, gp: games.length, w, l: games.length - w };
}

/** 정규시즌 경기만 대상으로 스플릿 그룹을 만든다. 경기가 없는 분류는 줄이 생기지 않는다. */
export function buildGameLogSplits(gameLog: any[] | undefined, allOpponentIds?: string[]): SplitGroup[] {
    // 최신순 정렬(동률은 입력 순서 유지) — 최근 N경기 계산 기준
    const games = (gameLog ?? [])
        .filter(g => !g.isPlayoff)
        .map((g, i) => ({ g, i }))
        .sort((a, b) => String(b.g.date ?? '').localeCompare(String(a.g.date ?? '')) || a.i - b.i)
        .map(x => x.g);
    if (games.length === 0) return [];

    const groups: SplitGroup[] = [];
    const add = (title: string, defs: { label: string; rows: any[] }[]) => {
        const lines = defs.filter(d => d.rows.length > 0).map(d => summarizeGames(d.label, d.rows));
        if (lines.length > 0) groups.push({ title, lines });
    };

    add('홈/원정', [
        { label: '홈', rows: games.filter(g => g.isHome) },
        { label: '원정', rows: games.filter(g => !g.isHome) },
    ]);
    add('승/패', [
        { label: '승', rows: games.filter(g => g.teamScore > g.opponentScore) },
        { label: '패', rows: games.filter(g => g.teamScore <= g.opponentScore) },
    ]);

    // 월별 — 날짜순(오래된 달 먼저)
    const byMonth = new Map<string, any[]>();
    for (const g of games) {
        const m = String(g.date ?? '').slice(0, 7);
        if (!m) continue;
        if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m)!.push(g);
    }
    add('월별', [...byMonth.keys()].sort().map(m => ({ label: `${parseInt(m.slice(5, 7))}월`, rows: byMonth.get(m)! })));

    // 상대팀별 — 약어 오름차순
    const byOpp = new Map<string, any[]>();
    for (const g of games) {
        const o = String(g.opponentId ?? '').toUpperCase();
        if (!o) continue;
        if (!byOpp.has(o)) byOpp.set(o, []);
        byOpp.get(o)!.push(g);
    }
    // 상대팀별 — allOpponentIds(리그 전체 팀에서 내 팀 제외)가 있으면 상대한 적 없는 팀도 빈 줄로 모두 표시
    const oppKeys = new Set<string>([...byOpp.keys(), ...(allOpponentIds ?? []).map(o => o.toUpperCase())]);
    const oppLines = [...oppKeys].sort().map(o => summarizeGames(o, byOpp.get(o) ?? []));
    if (oppLines.length > 0) groups.push({ title: '상대팀별', lines: oppLines });

    // 최근 N경기 — 경기 수가 N 미만이면 있는 경기 전부(G 열에 실제 경기 수가 보인다)
    groups.unshift({ title: '최근 경기', lines: [5, 10].map(n => summarizeGames(`최근 ${n}경기`, games.slice(0, n))) });

    return groups;
}
