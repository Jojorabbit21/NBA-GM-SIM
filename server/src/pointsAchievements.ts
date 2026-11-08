/**
 * pointsAchievements.ts — 도전 과제(계정당 1회) 해금·평가 (2026-11-08).
 * 계획: docs/plan/points-system-plan.md "도전 과제", 정의: shared/points/achievements.ts
 *
 * 해금은 전부 RPC unlock_achievement 로 — user_achievements PK 가 멱등 앵커, 들어갔을 때만 BP 지급(한 트랜잭션).
 * 평가 지점 세 곳:
 *   1) 즉시형 훅 — pointsSettlement(플레이오프 진출·시리즈 확정)·pointsAllStar(올스타·어워드)가 지급하는 그 자리에서 unlock 호출
 *   2) 시즌 종료형 — runAchievementSweeps(): league_user_history 중 points_evaluated_at null 행(ACHIEVEMENT_SINCE 이후 완료)을 유저별로 평가
 *      (통산 승수·시즌 승수·Best Record·Turnaround·우승 3회·Back to Back) 후 표식
 *   3) 운영 — 같은 스윕에서 trade_offers(accepted)/league_transactions(fa_sign)/draft_picks 의 ACHIEVEMENT_SINCE 이후 행으로 첫 1회 해금
 * 해금 실패는 로그만 남기고 호출부 흐름을 막지 않는다(다음 평가 때 다시 시도되며 멱등).
 */
import { supabase } from './supabaseAdmin.ts';
import {
    ACHIEVEMENT_SINCE, CAREER_WIN_LADDER, SEASON_WIN_LADDER, THREE_PEAT_COUNT, TURNAROUND_DELTA, achievementReward,
} from './shared/points/achievements.ts';

export async function unlockAchievement(userId: string, achievementId: string, ref: Record<string, unknown> = {}): Promise<boolean> {
    const reward = achievementReward(achievementId);
    if (reward <= 0) { console.warn(`[points:ach] 정의 없는 과제 ${achievementId}`); return false; }
    const { data, error } = await supabase.rpc('unlock_achievement', {
        p_user_id: userId, p_achievement_id: achievementId, p_reward: reward, p_ref: ref,
    });
    if (error) { console.error(`[points:ach] unlock ${achievementId} user=${userId} 실패:`, error.message); return false; }
    const unlocked = !!(data as any)?.unlocked;
    if (unlocked) console.log(`[points:ach] ${achievementId} → user=${userId} (+${reward})`);
    return unlocked;
}

// ── 스윕(scheduler tick) ───────────────────────────────────────────────────────

const SWEEP_INTERVAL_MS = 5 * 60_000;   // 운영 과제 스윕은 5분마다(즉시성이 중요하지 않음)
let lastFrontOfficeSweep = 0;

export async function runAchievementSweeps(): Promise<void> {
    try { await sweepSeasonHistory(); } catch (e) { console.error('[points:ach] season sweep 실패:', e); }
    if (Date.now() - lastFrontOfficeSweep >= SWEEP_INTERVAL_MS) {
        lastFrontOfficeSweep = Date.now();
        try { await sweepFrontOffice(); } catch (e) { console.error('[points:ach] front office sweep 실패:', e); }
    }
}

interface HistoryRow {
    group_id: string; user_id: string; season_number: number; league_id: string | null;
    wins: number | null; losses: number | null; playoff_result: string | null; completed_at: string | null;
    points_evaluated_at: string | null;
}

/** 아직 평가 안 된 시즌 이력 행을 유저별로 평가. 같은 유저의 ACHIEVEMENT_SINCE 이후 전체 행을 읽어 통산·연속 조건을 본다. */
async function sweepSeasonHistory(): Promise<void> {
    const { data: pending, error } = await supabase
        .from('league_user_history')
        .select('group_id, user_id, season_number, league_id, wins, losses, playoff_result, completed_at, points_evaluated_at')
        .is('points_evaluated_at', null)
        .gte('completed_at', ACHIEVEMENT_SINCE)
        .order('completed_at', { ascending: true })
        .limit(200);
    if (error) { console.error('[points:ach] history 조회 실패:', error.message); return; }
    if (!pending?.length) return;

    const byUser = new Map<string, HistoryRow[]>();
    for (const r of pending as HistoryRow[]) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id)!.push(r);
    }

    for (const [userId, rows] of byUser) {
        // 유저의 전체(SINCE 이후) 이력 — 통산 승수·우승 횟수·직전 시즌 비교용
        const { data: allRows } = await supabase
            .from('league_user_history')
            .select('group_id, user_id, season_number, league_id, wins, losses, playoff_result, completed_at, points_evaluated_at')
            .eq('user_id', userId).gte('completed_at', ACHIEVEMENT_SINCE)
            .order('completed_at', { ascending: true });
        const all = (allRows ?? []) as HistoryRow[];
        const careerWins = all.reduce((s, r) => s + (r.wins ?? 0), 0);
        const titles = all.filter(r => r.playoff_result === 'champion').length;

        for (const r of rows) {
            const wins = r.wins ?? 0;
            const ref = { league_id: r.league_id, season: r.season_number, wins, losses: r.losses };
            for (const [thr, id] of SEASON_WIN_LADDER) if (wins >= thr) await unlockAchievement(userId, id, ref);
            for (const [thr, id] of CAREER_WIN_LADDER) if (careerWins >= thr) await unlockAchievement(userId, id, { ...ref, career_wins: careerWins });

            // Best Record — 같은 리그·시즌의 모든 행 중 최다승(아카이버가 유저 행을 한 번에 쓰므로 비교 가능)
            if (r.league_id) {
                const { data: peers } = await supabase.from('league_user_history').select('wins')
                    .eq('league_id', r.league_id).eq('season_number', r.season_number);
                const maxWins = Math.max(...((peers ?? []).map(p => (p.wins as number | null) ?? 0)), 0);
                if (wins > 0 && wins >= maxWins) await unlockAchievement(userId, 'best_record', ref);
            }

            // Turnaround — 직전 완주 시즌(completed_at 기준) 대비 +15
            const idx = all.findIndex(x => x.group_id === r.group_id && x.season_number === r.season_number);
            const prev = idx > 0 ? all[idx - 1] : null;
            if (prev && wins - (prev.wins ?? 0) >= TURNAROUND_DELTA) await unlockAchievement(userId, 'turnaround', { ...ref, prev_wins: prev.wins });

            if (r.playoff_result === 'champion') {
                if (titles >= THREE_PEAT_COUNT) await unlockAchievement(userId, 'champion_3', { ...ref, titles });
                const prevSeason = all.find(x => x.group_id === r.group_id && x.season_number === r.season_number - 1);
                if (prevSeason?.playoff_result === 'champion') await unlockAchievement(userId, 'back_to_back', ref);
            }

            await supabase.from('league_user_history')
                .update({ points_evaluated_at: new Date().toISOString() })
                .eq('group_id', r.group_id).eq('user_id', userId).eq('season_number', r.season_number);
        }
    }
}

/** 운영 과제 — 첫 트레이드 성사 / 첫 FA 영입 / 첫 드래프트 지명. 이미 해금된 유저는 건너뛴다. */
async function sweepFrontOffice(): Promise<void> {
    const { data: done } = await supabase.from('user_achievements').select('user_id, achievement_id')
        .in('achievement_id', ['dealmaker', 'open_market', 'first_pick']);
    const has = new Set((done ?? []).map(d => `${d.achievement_id}:${d.user_id}`));

    const [{ data: trades }, { data: signs }, { data: picks }] = await Promise.all([
        supabase.from('league_trade_offers').select('id, created_by, resolved_by, resolved_as_admin, resolved_at')
            .eq('status', 'accepted').gte('resolved_at', ACHIEVEMENT_SINCE),
        supabase.from('league_transactions').select('id, acted_by, resolved_as_admin, created_at')
            .eq('type', 'fa_sign').gte('created_at', ACHIEVEMENT_SINCE),
        supabase.from('draft_picks').select('id, user_id, is_ai, picked_at')
            .gte('picked_at', ACHIEVEMENT_SINCE),
    ]);

    for (const t of trades ?? []) {
        if (t.resolved_as_admin) continue;
        for (const uid of [t.created_by, t.resolved_by] as (string | null)[]) {
            if (uid && !has.has(`dealmaker:${uid}`)) { if (await unlockAchievement(uid, 'dealmaker', { offer_id: t.id })) has.add(`dealmaker:${uid}`); }
        }
    }
    for (const s of signs ?? []) {
        if (s.resolved_as_admin || !s.acted_by) continue;
        if (!has.has(`open_market:${s.acted_by}`)) { if (await unlockAchievement(s.acted_by as string, 'open_market', { transaction_id: s.id })) has.add(`open_market:${s.acted_by}`); }
    }
    for (const p of picks ?? []) {
        if (p.is_ai || !p.user_id) continue;
        if (!has.has(`first_pick:${p.user_id}`)) { if (await unlockAchievement(p.user_id as string, 'first_pick', { pick_id: p.id })) has.add(`first_pick:${p.user_id}`); }
    }
}
