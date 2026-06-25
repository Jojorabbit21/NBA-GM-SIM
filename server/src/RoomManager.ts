/**
 * RoomManager — 활성 DraftRoom 인스턴스 레지스트리.
 *
 * - roomId → DraftRoom 싱글 맵
 * - 첫 WS 연결 또는 스케줄러 트리거 시 lazy load
 * - finalize/destroy로 메모리 해제
 */
import { DraftRoom } from './DraftRoom';

const rooms   = new Map<string, DraftRoom>();
const pending = new Map<string, Promise<DraftRoom | null>>();

export const RoomManager = {
    /** 이미 로드된 방 반환 (없으면 undefined) */
    get(roomId: string): DraftRoom | undefined {
        return rooms.get(roomId);
    },

    /**
     * 방이 메모리에 없으면 DB에서 로드해 캐싱.
     * 동시에 여러 호출이 와도 Promise 캐싱으로 한 번만 로드.
     * 로드 실패 시 null 반환.
     */
    async getOrLoad(roomId: string): Promise<DraftRoom | null> {
        const existing = rooms.get(roomId);
        if (existing) return existing;

        // 이미 로딩 중이면 같은 Promise 반환 (race condition 방지)
        if (pending.has(roomId)) return pending.get(roomId)!;

        const p = (async () => {
            try {
                const room = await DraftRoom.load(roomId);
                rooms.set(roomId, room);
                console.log(`[RoomManager] loaded room ${roomId} (pool=${room.poolSize} players)`);
                return room;
            } catch (e: any) {
                console.error(`[RoomManager] failed to load ${roomId}: ${e?.message}`);
                return null;
            } finally {
                pending.delete(roomId);
            }
        })();

        pending.set(roomId, p);
        return p;
    },

    /**
     * 방 타이머 정리 + 맵에서 제거.
     * finalize 완료 후 또는 scheduler가 정리 시 호출.
     */
    destroy(roomId: string): void {
        const room = rooms.get(roomId);
        if (!room) return;
        room.clearTimers();
        rooms.delete(roomId);
        console.log(`[RoomManager] destroyed room ${roomId}`);
    },

    /** 전체 활성 방 배열 */
    getAll(): DraftRoom[] {
        return [...rooms.values()];
    },

    /** 현재 방 개수 (헬스체크용) */
    size(): number {
        return rooms.size;
    },
};
