/**
 * protocol.ts — simWorkerPool ↔ simWorker 간 메시지 타입.
 * 직렬화 대상은 문자열/불리언/단순 객체뿐 — 팀/선수 등 큰 객체는 워커 경계를 넘지 않는다
 * (워커가 자체 Supabase 클라이언트로 직접 읽고 쓰므로).
 */
import type { SimResult } from '../simRunner';

export type WorkerRequest =
    | { type: 'ping' }
    | { type: 'run'; id: string; roomId: string; gameId: string; forceStartNow?: boolean };

export type WorkerResponse =
    | { type: 'pong' }
    | { type: 'success'; id: string; result: SimResult }
    | { type: 'failure'; id: string; error: string };
