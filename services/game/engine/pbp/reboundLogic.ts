
import { TeamState, LivePlayer } from './pbpTypes';

// Helper: Determine Rebounder based on Position & Stats + Slider Commitment
export function resolveRebound(homeTeam: TeamState, awayTeam: TeamState, shooterId: string): { player: LivePlayer, type: 'off' | 'def' } {
    // Determine offense vs defense from shooter's team
    const isHomeShooter = homeTeam.onCourt.some(p => p.playerId === shooterId);
    const offTeam = isHomeShooter ? homeTeam : awayTeam;
    const defTeam = isHomeShooter ? awayTeam : homeTeam;

    // Slider Multipliers — defReb: 박스아웃 집중도, offReb: 공격 리바 가담 의지
    // defReb=1 → x0.84 (속공 우선), defReb=5 → x1.0 (중립), defReb=10 → x1.2 (풀 박스아웃)
    const defRebMult = 0.80 + (defTeam.tactics.sliders.defReb * 0.04);
    const offRebMult = 0.80 + (offTeam.tactics.sliders.offReb * 0.04);

    // 1. Collect all candidates
    const allPlayers = [...homeTeam.onCourt, ...awayTeam.onCourt];

    // 2. Calculate Rebound Score for each
    // Score = RebAttr * 0.6 + Vert * 0.2 + Height * 0.2 + SliderMult + Random Factor
    const candidates = allPlayers.map(p => {
        // Penalty for shooter (harder to get own rebound usually)
        const shooterPenalty = p.playerId === shooterId ? 0.3 : 1.0;

        // Position bias (Bigs are closer to rim)
        let posBonus = 1.0;
        if (p.position === 'C') posBonus = 1.3;
        else if (p.position === 'PF') posBonus = 1.2;

        // Slider multiplier: 공격팀 or 수비팀 여부에 따라 적용
        const isOffPlayer = offTeam.onCourt.some(p2 => p2.playerId === p.playerId);
        const sliderMult = isOffPlayer ? offRebMult : defRebMult;

        const score = (
            (p.attr.reb * 0.6) +
            (p.attr.vertical * 0.2) +
            ((p.attr.height - 180) * 0.5)
        ) * posBonus * shooterPenalty * sliderMult * Math.random();

        return { p, score };
    });

    // 3. Sort by Score
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0].p;

    // 4. Determine Type
    const isHomeWinner = homeTeam.onCourt.some(p => p.playerId === winner.playerId);
    const type = (isHomeShooter === isHomeWinner) ? 'off' : 'def';

    return { player: winner, type };
}
