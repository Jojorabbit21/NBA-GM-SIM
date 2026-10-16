import React, { useMemo, useState } from 'react';
import { SegmentedControl } from '../../components/common/SegmentedControl';
import { Button } from '../../components/common/Button';
import { TEAM_DATA } from '../../data/teamData';
import { PlayoffRaceBody } from '../multi/season/MultiPlayoffRaceView';
import {
    computeConferenceRaces, computeRaceOdds, computeKeyGames, getRaceZones,
} from '../multi/season/playoffRaceUtils';
import { computeMultiStandingsStats, log5WinProb, type MultiTeamMeta } from '../multi/season/multiSeasonUtils';

// ── 순위 경쟁 화면 목업 (dev 전용: /dev/race-mock) ───────────────────────────────
// 가상 데이터를 만들어 "실제" 계산 함수(computeConferenceRaces/computeRaceOdds/computeKeyGames)와
// "실제" 화면 컴포넌트(PlayoffRaceBody)에 그대로 통과시킨다. 서버/DB 불필요. import.meta.env.DEV일 때만 라우트가 등록된다.

type Scenario = 'd30' | 'd7' | 'd4' | 'd2';
const SCENARIOS: { value: Scenario; label: string; remaining: number; daysLeft: number }[] = [
    { value: 'd30', label: '종료 30일 전', remaining: 14, daysLeft: 30 },
    { value: 'd7',  label: '종료 7일 전',  remaining: 4,  daysLeft: 7 },
    { value: 'd4',  label: '종료 4일 전',  remaining: 2,  daysLeft: 4 },
    { value: 'd2',  label: '종료 2일 전',  remaining: 1,  daysLeft: 2 },
];

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function buildMock(scenario: Scenario, seed: number) {
    const sc = SCENARIOS.find(x => x.value === scenario)!;
    const rand = rng(seed);
    const total = 82;
    const played = total - sc.remaining;

    const slugs = Object.keys(TEAM_DATA);
    const leagueTeams = slugs.map(slug => ({
        team_slug: slug,
        team_name: `${TEAM_DATA[slug].city} ${TEAM_DATA[slug].name}`,
        team_abbr: slug.toUpperCase(),
        conference: TEAM_DATA[slug].conference,
    })) as any[];

    // 컨퍼런스 안에서 순서를 섞은 뒤 강팀→약팀 실력을 부여 — 중위권(7~10위)이 촘촘하게 몰리도록 구성
    const strength: Record<string, number> = {};
    for (const conf of ['East', 'West'] as const) {
        const members = leagueTeams.filter(t => t.conference === conf).map(t => t.team_slug).sort(() => rand() - 0.5);
        members.forEach((slug, i) => { strength[slug] = 0.64 - i * 0.02 + (rand() - 0.5) * 0.04; });
    }

    const dateOf = (offsetDays: number) => {
        const d = new Date(); d.setDate(d.getDate() + offsetDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const schedule: any[] = [];

    // 지나간 경기 — 라운드마다 30팀 완전 매칭(동·서 교차 포함), 실력 기반 승패 + 점수. 맞대결/디비전/컨퍼런스 전적이 실제처럼 쌓인다.
    for (let r = 0; r < played; r++) {
        const order = [...slugs].sort(() => rand() - 0.5);
        for (let k = 0; k + 1 < order.length; k += 2) {
            const home = order[k], away = order[k + 1];
            const homeWins = rand() < log5WinProb(Math.min(0.95, strength[home] + 0.03), strength[away]);
            const margin = 1 + Math.floor(rand() * 16) + Math.max(0, Math.round(Math.abs(strength[home] - strength[away]) * 20));
            const loserPts = 98 + Math.floor(rand() * 18);
            schedule.push({
                id: `p${r}-${k}`, homeTeamId: home, awayTeamId: away, date: dateOf(-(played - r) - 3), played: true, scheduledAt: past,
                homeScore: homeWins ? loserPts + margin : loserPts, awayScore: homeWins ? loserPts : loserPts + margin,
            });
        }
    }
    const teamMeta: Record<string, MultiTeamMeta> = {};
    for (const slug of slugs) teamMeta[slug] = { conference: TEAM_DATA[slug].conference, division: TEAM_DATA[slug].division };
    // 전적은 실제 집계 함수로 계산(화면과 같은 코드)
    const statsMap = computeMultiStandingsStats(slugs, schedule, Date.now(), teamMeta);

    // 남은 경기 — 팀당 sc.remaining경기, 라운드를 남은 날짜에 고르게 배치
    for (let r = 0; r < sc.remaining; r++) {
        const order = [...slugs].sort(() => rand() - 0.5);
        const date = dateOf(Math.floor((r + 1) * sc.daysLeft / sc.remaining) - 1);
        for (let k = 0; k + 1 < order.length; k += 2) {
            schedule.push({ id: `m${r}-${k}`, homeTeamId: order[k], awayTeamId: order[k + 1], date, played: false, scheduledAt: future });
        }
    }
    return { leagueTeams, statsMap, schedule, daysLeft: sc.daysLeft };
}

const PlayoffRaceMock: React.FC = () => {
    // 쿼리로 초기 상태 지정 가능: /dev/race-mock?s=d2&pi=off&conf=West&seed=3
    const q = new URLSearchParams(window.location.search);
    const [scenario, setScenario] = useState<Scenario>((['d30', 'd7', 'd4', 'd2'] as Scenario[]).find(x => x === q.get('s')) ?? 'd7');
    const [playIn, setPlayIn] = useState<'on' | 'off'>(q.get('pi') === 'off' ? 'off' : 'on');
    const [seed, setSeed] = useState(Number(q.get('seed')) || 7);
    const [conf, setConf] = useState<'East' | 'West'>(q.get('conf') === 'West' ? 'West' : 'East');

    const playInEnabled = playIn === 'on';
    const playoffTeamsPerConf = 8;
    const zones = getRaceZones(playoffTeamsPerConf, playInEnabled);

    const data = useMemo(() => {
        const m = buildMock(scenario, seed);
        const now = Date.now();
        const races = computeConferenceRaces(m.leagueTeams, m.statsMap, m.schedule, now, playoffTeamsPerConf, playInEnabled);
        const odds = computeRaceOdds(m.leagueTeams, m.statsMap, m.schedule, now, playoffTeamsPerConf, playInEnabled);
        const teamBySlug = new Map(m.leagueTeams.map(t => [t.team_slug, t]));
        const nameOf = (s: string) => teamBySlug.get(s)?.team_name ?? s;
        const keyGames = {
            East: computeKeyGames('East', m.leagueTeams, m.statsMap, m.schedule, now, playoffTeamsPerConf, playInEnabled, nameOf),
            West: computeKeyGames('West', m.leagueTeams, m.statsMap, m.schedule, now, playoffTeamsPerConf, playInEnabled, nameOf),
        };
        return { ...m, races, odds, teamBySlug, keyGames };
    }, [scenario, seed, playInEnabled]);

    return (
        <div className="h-screen flex flex-col bg-slate-950">
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 bg-amber-950/40 border-b border-amber-900/50 text-xs text-amber-300">
                <b>목업 · 가상 데이터 (dev 전용)</b>
                <SegmentedControl<Scenario> size="sm" value={scenario} onChange={setScenario} options={SCENARIOS.map(s => ({ value: s.value, label: s.label }))} />
                <SegmentedControl<'on' | 'off'> size="sm" value={playIn} onChange={setPlayIn} options={[{ value: 'on', label: '플레이인 ON' }, { value: 'off', label: '플레이인 OFF' }]} />
                <Button variant="secondary" size="sm" onClick={() => setSeed(s => s + 1)}>다른 시나리오 생성</Button>
                <span className="text-amber-500/80">seed {seed}</span>
            </div>
            <div className="flex-1 min-h-0">
                <PlayoffRaceBody
                    conf={conf}
                    onConfChange={setConf}
                    race={data.races[conf]}
                    odds={data.odds}
                    keyGames={data.keyGames[conf]}
                    zones={zones}
                    playInEnabled={playInEnabled}
                    teamBySlug={data.teamBySlug as any}
                    daysLeft={data.daysLeft}
                    onOpenTeam={() => { /* 목업: 이동 없음 */ }}
                    onOpenGame={() => { /* 목업: 이동 없음 */ }}
                    initialExpanded={q.get('open')}
                />
            </div>
        </div>
    );
};

export default PlayoffRaceMock;
