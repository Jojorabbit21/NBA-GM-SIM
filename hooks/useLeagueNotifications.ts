// useLeagueNotifications.ts — 리그 진행 알림을 전역 토스트(notify.league)로 올리는 공급원 훅.
// [2026-10-02] docs/plan/toast-notification-center-plan.md 3단계(§4, §5-3, §5-4).
// LeagueLayout에 **한 번만** 마운트한다(사이드바·헤더처럼 여러 곳에서 쓰면 채널이 중복되고 같은 알림이
// 두 번 발행됨 — 저장소의 dedupeKey가 막아주긴 하지만 구독 자체를 하나로 유지하는 게 원칙).
//
// 공급원 3개(Supabase Realtime postgres_changes):
//   A. league_events INSERT(room 필터) — 400ms 창에 모아 묶음/필터 후 발행. 뉴스피드 훅의 디바운스 창과 동일.
//   B. league_trade_offers INSERT(to_team_id = 내 팀) — "제안 도착", persistent, 메시지함 링크.
//   C. league_trade_offers UPDATE(from_team_id = 내 팀) — 내가 보낸 제안의 결과(수락 persistent / 거절·만료·무효화 transient).
// 영속화 없음: 원본이 DB(뉴스피드·메시지함)에 있다. 룸이 바뀌거나 리그를 나가면 이전 룸의 리그 알림만 지운다(§5-4).
// 라이브 중계 화면에서의 transient 폐기는 저장소(pushNotification)가 라우트로 판정한다(§5-3).
//
// 수신 범위(사용자 설정, localStorage): 'my_team'(기본) = 내 팀이 관련된 이벤트만 / 'all' = 리그 전체 / 'off' = 끔.
// 설정 UI는 5단계에서 붙인다 — 지금은 getter/setter만 export.

import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { notify } from '../services/notifications/notify';
import { clearLeagueNotifications } from '../services/notifications/notificationStore';
import { mapRow, type LeagueEvent } from './useLeagueHeadlines';
import { buildNewsTitle } from '../services/multi/newsBlurb';
import type { LeagueTeamRow } from '../services/multi/roomQueries';
import type { TradeOfferRow } from '../services/multi/tradeService';

export type LeagueNotificationScope = 'my_team' | 'all' | 'off';
const SCOPE_KEY = 'nba-gm-sim-notif-league-scope';
const BUNDLE_WINDOW_MS = 400;
const GATED_POLL_TYPES = ['playoff_series_result', 'playoff_champion', 'finals_mvp'];
const POLL_INTERVAL_MS = 30_000;
const POLL_LOOKBACK_MS = 60 * 60 * 1000;

export function getLeagueNotificationScope(): LeagueNotificationScope {
    try {
        const v = window.localStorage.getItem(SCOPE_KEY);
        return v === 'all' || v === 'off' || v === 'my_team' ? v : 'my_team';
    } catch { return 'my_team'; }
}
export function setLeagueNotificationScope(scope: LeagueNotificationScope): void {
    try { window.localStorage.setItem(SCOPE_KEY, scope); } catch { /* 사생활 모드 등 — 무시 */ }
}

/** [2026-10-02] 토스트로 알리는 리그 이벤트 종류 — 사용자 지정 허용 목록. 나머지 25종(트레이드 소식·파워랭킹·연승·개인
 *  기록·경기 결과·수상 4종·올스타 10종·로터리·플레이인/플레이오프 대진·플레이오프 경기 결과)은 뉴스피드에만 남기고
 *  토스트는 보내지 않는다. 시리즈 결과·우승·파이널 MVP·부상·징계만 알림. */
const TOASTED_EVENT_TYPES = new Set<LeagueEvent['type']>([
    'injury', 'suspension', 'playoff_series_result', 'playoff_champion', 'finals_mvp',
]);

/** 이벤트 종류별 이동 링크. 선수 페이지는 short code 훅이 필요해 뉴스피드로 보낸다. */
function eventLink(ev: LeagueEvent, base: string): { to: string; label?: string } {
    if ((ev.type === 'game_result' || ev.type === 'playoff_game_result') && ev.gameId) {
        return { to: `${base}/game/${ev.gameId}`, label: '경기 보기' };
    }
    if (ev.type === 'trade') return { to: `${base}/transaction?tab=history`, label: '트레이드 히스토리' };
    return { to: `${base}/news`, label: '뉴스피드' };
}

/** 내가 행동하거나 꼭 봐야 하는 것만 수동 닫기. */
function isPersistentEvent(ev: LeagueEvent): boolean {
    return ev.involvesMyTeam && (ev.type === 'playoff_series_result' || ev.type === 'playoff_champion' || ev.type === 'draft_lottery_result');
}

// [2026-10-02] 사용자 지정 문구 — 팀 이름 없이 짧게(어느 제안인지는 링크로 확인).
const OFFER_RESULT_TEXT: Partial<Record<TradeOfferRow['status'], { text: string; persistent: boolean }>> = {
    accepted:    { text: '트레이드가 실행되었습니다.', persistent: true },
    rejected:    { text: '트레이드 제안이 거절되었습니다.', persistent: false },
    expired:     { text: '트레이드 제안이 만료되었습니다.', persistent: false },
    invalidated: { text: '트레이드가 취소되었습니다.', persistent: false },
};

export function useLeagueNotifications(params: {
    roomId: string | null | undefined;
    leagueId: string | undefined;
    leagueTeams: LeagueTeamRow[];
    myTeam: LeagueTeamRow | null | undefined;
}) {
    const { roomId, leagueId, leagueTeams, myTeam } = params;
    // 콜백에서 최신 팀 목록을 보되 구독은 roomId/myTeam.id가 바뀔 때만 다시 열도록 ref로 분리.
    const teamsRef = useRef(leagueTeams);
    teamsRef.current = leagueTeams;
    const myTeamRef = useRef(myTeam);
    myTeamRef.current = myTeam;

    // §5-4 룸 전환/이탈 시 이전 룸의 리그 알림만 정리
    useEffect(() => {
        return () => { if (roomId) clearLeagueNotifications(roomId); };
    }, [roomId]);

    // A. league_events
    useEffect(() => {
        if (!roomId || !leagueId) return;
        const base = `/multi/leagues/${leagueId}/season`;
        const buffer: any[] = [];
        let timer: ReturnType<typeof setTimeout> | null = null;

        // 실시간·폴링 두 경로가 같은 이벤트를 두 번 알리지 않도록 이미 알린 id를 기억한다.
        const notified = new Set<string>();

        const flush = () => {
            timer = null;
            const rows = buffer.splice(0, buffer.length);
            const scope = getLeagueNotificationScope();
            if (scope === 'off' || rows.length === 0) return;
            const teams = teamsRef.current;
            const teamBySlug = new Map(teams.map(t => [t.team_slug, t]));
            const mySlug = myTeamRef.current?.team_slug ?? null;
            const events = rows.map(r => mapRow(r, mySlug));
            const rest = events.filter(ev => TOASTED_EVENT_TYPES.has(ev.type) && (scope === 'all' || ev.involvesMyTeam) && !notified.has(String(ev.id)));
            for (const ev of rest) {
                notified.add(String(ev.id));
                let title: string | null = null;
                try { title = buildNewsTitle(ev, teamBySlug); } catch { title = null; }
                const message = title ?? ev.headline;
                if (!message) continue;   // 해석 불가(알 수 없는 타입/빈 페이로드) → 깨진 알림을 띄우지 않음
                notify.league(message, {
                    roomId, source: 'league.events', dedupeKey: `levt:${ev.id}`,
                    persistent: isPersistentEvent(ev),
                    leagueEvent: { eventId: ev.id, type: ev.type },
                    link: eventLink(ev, base),
                });
            }
        };

        const channel = supabase
            .channel(`league-notify-events-${roomId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'league_events', filter: `room_id=eq.${roomId}` },
                (payload: any) => {
                    if (!payload?.new || payload.new.room_id !== roomId) return;   // 룸 불일치 방어
                    buffer.push(payload.new);
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(flush, BUNDLE_WINDOW_MS);
                })
            .subscribe();

        // [2026-10-24] 스포일러 방지 — 시리즈 결과/우승/파이널 MVP는 game_id가 걸려 있어 RLS가 경기 중계가 끝날 때까지 숨긴다.
        // Realtime은 INSERT 시점에 RLS를 판정하므로 공개 전 행은 영영 오지 않는다 → 공개 후 조회로 보충한다.
        // 첫 조회는 이미 공개돼 있던 행을 "알린 것"으로만 기록(접속 직후 과거 알림이 쏟아지지 않게).
        let seeded = false;
        let stopped = false;
        const poll = async () => {
            try {
                const since = new Date(Date.now() - POLL_LOOKBACK_MS).toISOString();
                const { data } = await supabase
                    .from('league_events')
                    .select('id, type, team_ids, player_ids, score, payload, created_at, game_id, sim_date, room_id')
                    .eq('room_id', roomId)
                    .in('type', GATED_POLL_TYPES)
                    .gte('created_at', since)
                    .limit(20);
                if (stopped || !data) return;
                if (!seeded) {
                    seeded = true;
                    for (const r of data) notified.add(String(r.id));
                    return;
                }
                const fresh = data.filter(r => !notified.has(String(r.id)));
                if (fresh.length === 0) return;
                buffer.push(...fresh);
                flush();
            } catch { /* 조용히 다음 주기에 재시도 */ }
        };
        void poll();
        const pollTimer = setInterval(() => { if (!document.hidden) void poll(); }, POLL_INTERVAL_MS);
        return () => {
            stopped = true;
            clearInterval(pollTimer);
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [roomId, leagueId]);

    // B/C. 트레이드 제안 — 내 팀이 있을 때만
    const myTeamId = myTeam?.id ?? null;
    useEffect(() => {
        if (!roomId || !leagueId || !myTeamId) return;
        const base = `/multi/leagues/${leagueId}/season`;

        const channel = supabase
            .channel(`league-notify-offers-${roomId}-${myTeamId}`)
            // B. 받은 제안 도착
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'league_trade_offers', filter: `to_team_id=eq.${myTeamId}` },
                (payload: any) => {
                    const o = payload?.new as TradeOfferRow | undefined;
                    if (!o || o.room_id !== roomId || o.status !== 'pending') return;
                    notify.league('트레이드 제안이 도착했습니다.', {
                        roomId, source: 'trade.offer.incoming', persistent: true, title: '트레이드 제안',
                        dedupeKey: `offer:${o.id}:in`,
                        link: { to: `${base}/transaction?tab=inbox`, label: '메시지함 열기' },
                    });
                })
            // C. 보낸 제안의 결과
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'league_trade_offers', filter: `from_team_id=eq.${myTeamId}` },
                (payload: any) => {
                    const o = payload?.new as TradeOfferRow | undefined;
                    if (!o || o.room_id !== roomId) return;
                    const spec = OFFER_RESULT_TEXT[o.status];
                    if (!spec) return;   // pending/cancelled(내가 취소) 등은 알림 없음
                    notify.league(spec.text, {
                        roomId, source: `trade.offer.${o.status}`, persistent: spec.persistent, title: '트레이드 제안 결과',
                        dedupeKey: `offer:${o.id}:${o.status}`,
                        link: { to: `${base}/transaction?tab=${o.status === 'accepted' ? 'history' : 'inbox'}`, label: o.status === 'accepted' ? '트레이드 히스토리' : '메시지함 열기' },
                    });
                })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [roomId, leagueId, myTeamId]);
}
