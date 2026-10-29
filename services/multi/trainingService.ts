// trainingService.ts — 트레이닝 세션: 시작(Fly POST /practice) · 오늘 상태 · 기록 · 결과 [2026-10-29]
// 설계: docs/plan/practice-scrimmage-plan.md 6절. DB: migrations/add_practice_games.sql
import { supabase } from '../supabaseClient';
import { actionFailure, httpActionFailure } from '../notifications/actionErrorCatalog';
import { FLY_SERVER } from './leagueService';
import type { TacticPresetSlot } from './tacticPresets';
import type { TrainingOffensePresetId, TrainingDefensePresetId } from './trainingPresets';
import type { PbpLog, PlayerBoxScore, ShotEvent, RotationData, BoxTick } from '../../types/engine';

export interface TrainingStartRequest {
    roomId: string;
    opponentTeamId: string;
    offensePreset: TrainingOffensePresetId;
    defensePreset: TrainingDefensePresetId;
    /** null = 현재 저장된 전술(room_members.tactics/depth_chart) */
    depthPresetSlot: TacticPresetSlot | null;
    teamPresetSlot: TacticPresetSlot | null;
}

export const startTrainingSession = async (
    req: TrainingStartRequest,
): Promise<{ ok: true; practiceGameId: string } | { ok: false; error: string }> => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    try {
        const res = await fetch(`${FLY_SERVER}/practice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(req),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { ok: false, error: httpActionFailure(res.status, data?.error, '트레이닝 시작') };
        return { ok: true, practiceGameId: String(data.practiceGameId ?? '') };
    } catch (e: unknown) {
        return { ok: false, error: actionFailure(e, '트레이닝 시작') };
    }
};

// ── 오늘 상태(get_my_practice_status) ──────────────────────────────────────
export type TrainingUnavailableReason = 'no_timeline' | 'game_day' | 'window_closed' | 'limit';

export interface TrainingStatus {
    available: boolean;
    reason: TrainingUnavailableReason | null;
    used: number;
    limit: number;
    virtualDate: string | null;
    /** 오늘 훈련 가능 시간 끝(가상 자정) */
    windowEnd: string | null;
    /** 다음 휴식일 시작 시각 */
    nextStart: string | null;
}


export async function fetchTrainingStatus(roomId: string): Promise<TrainingStatus> {
    const { data, error } = await supabase.rpc('get_my_practice_status', { p_room_id: roomId });
    if (error) throw error;
    const d = (data ?? {}) as any;
    return {
        available: !!d.available,
        reason: d.reason ?? null,
        used: Number(d.used ?? 0),
        limit: Number(d.limit ?? 3),
        virtualDate: d.virtual_date ?? null,
        windowEnd: d.window_end ?? null,
        nextStart: d.next_start ?? null,
    };
}

// ── 기록 ───────────────────────────────────────────────────────────────────
export interface TrainingLogRow {
    id: string;
    virtual_date: string;
    slot: number;
    opponent_team_id: string;
    offense_preset: TrainingOffensePresetId;
    defense_preset: TrainingDefensePresetId;
    is_playoff: boolean;
    my_score: number;
    opp_score: number;
    my_stats: Record<string, number>;
    created_at: string;
}

export async function fetchTrainingLog(roomId: string, teamId: string): Promise<TrainingLogRow[]> {
    const { data, error } = await supabase
        .from('practice_games')
        .select('id, virtual_date, slot, opponent_team_id, offense_preset, defense_preset, is_playoff, my_score, opp_score, my_stats, created_at')
        .eq('room_id', roomId)
        .eq('team_id', teamId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TrainingLogRow[];
}

// ── 결과 1건 ─────────────────────────────────────────────────────────────────
export interface TrainingResultData {
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    events: PbpLog[];
    shotEvents: ShotEvent[];
    rotationData?: RotationData;
    boxTimeline?: BoxTick[];
    quarterScores?: unknown;
    drains?: { player_id: string; drain: number }[];
}

export interface TrainingResultRow extends Omit<TrainingLogRow, 'my_stats' | 'created_at'> {
    result: TrainingResultData;
}

export async function fetchTrainingResult(id: string): Promise<TrainingResultRow | null> {
    const { data, error } = await supabase
        .from('practice_games')
        .select('id, virtual_date, slot, opponent_team_id, offense_preset, defense_preset, is_playoff, my_score, opp_score, result')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    return (data ?? null) as TrainingResultRow | null;
}
