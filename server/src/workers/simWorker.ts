/**
 * simWorker.ts — 경기 시뮬레이션 워커 스레드 엔트리포인트.
 *
 * simWorkerPool.ts가 스폰하는 별도 OS 스레드에서 실행된다. runSimulation()의 동기 연산
 * (경기당 4.5~10초)을 메인 스레드에서 격리하는 게 목적 — 설계 배경은
 * docs/plan/worker-thread-sim-plan.md 참조.
 */
import { runSimulation } from '../simRunner';
import type { WorkerRequest, WorkerResponse } from './protocol';

addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data;

    if (msg.type === 'ping') {
        postMessage({ type: 'pong' } satisfies WorkerResponse);
        return;
    }

    if (msg.type === 'run') {
        try {
            const result = await runSimulation(msg.roomId, msg.gameId, msg.forceStartNow);
            postMessage({ type: 'success', id: msg.id, result } satisfies WorkerResponse);
        } catch (err) {
            // runSimulation()은 내부적으로 이미 try/catch해서 { ok:false, error } 를 반환하므로
            // 여기까지 throw가 올라오는 건 예상 밖의 상황(예: 모듈 로드 실패)이다. 그래도 워커가
            // 응답 없이 죽어버리면 풀의 타임아웃(60초)에 걸려서야 감지되니, 잡히는 대로 즉시 보고한다.
            postMessage({ type: 'failure', id: msg.id, error: String(err) } satisfies WorkerResponse);
        }
        return;
    }
});
