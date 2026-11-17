/**
 * engineProfile.ts — 방 단위 엔진 프로필 (2026-11-17)
 *
 * 방마다 경기를 어느 엔진으로 돌릴지 고른다(rooms.sim_settings.engineProfile, 세션 설정 엔진 탭).
 *   'stable' (기본·미지정) : 배포 엔진 보관본 — server/src/engineSnapshots/v253 (커밋 fd3e3952, Fly v253 그대로)
 *   'next'                 : 개발 중인 엔진 — server/src/shared/engine
 *
 * 목적: 운영 중인 세션의 경기 결과를 건드리지 않고 새 엔진을 별도 테스트 세션에서만 돌려 보기.
 * 보관본은 그 커밋의 파일을 그대로 복사한 것이라(scripts/engineSnapshot.mjs verify v253 로 대조) 값을 바꾸는 스위치가 없다.
 *
 * 엔진을 부르는 서버 코드(simRunner·practiceRunner·postAllStarGame·postThreePointContest)는 엔진 함수를 직접 import 하지 않고
 * engineFor(simSettings) 로 받아 쓴다. 엔진에 새 진입 함수를 추가하면 EngineApi 와 보관본 index.ts(= scripts/engineSnapshot.mjs
 * 의 ENTRY) 양쪽에 있어야 한다.
 *
 * 기본값을 'next' 로 바꾸는 시점(보관본을 쓰는 세션이 끝난 뒤): shared/types/simSettings.ts 의 DEFAULT_ENGINE_PROFILE.
 */
import * as stableV253 from './engineSnapshots/v253/index.ts';
import { runFullGameSimulation } from './shared/engine/pbp/main.ts';
import { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';
import { calculateHitRate } from './shared/engine/pbp/flowEngine.ts';
import { calculatePlayerOvr } from './shared/utils/ovrUtils.ts';
import { resolveEngineProfile, type EngineProfile } from './shared/types/simSettings.ts';

export interface EngineApi {
    profile: EngineProfile;
    runFullGameSimulation: typeof runFullGameSimulation;
    resolveNormalizationContext: typeof resolveNormalizationContext;
    calculateHitRate: typeof calculateHitRate;
    calculatePlayerOvr: typeof calculatePlayerOvr;
}

const ENGINES: Record<EngineProfile, EngineApi> = {
    // 보관본의 타입은 그 커밋 시점의 것 — 호출 형태는 같고(추가 인자는 전부 선택) 반환값은 기존 저장 코드가 그대로 받는다
    stable: { profile: 'stable', ...(stableV253 as unknown as Omit<EngineApi, 'profile'>) },
    next: { profile: 'next', runFullGameSimulation, resolveNormalizationContext, calculateHitRate, calculatePlayerOvr },
};

/** 방의 sim_settings(또는 null)로 그 방이 쓸 엔진을 고른다. 값이 없으면 'stable'. */
export function engineFor(simSettings: { engineProfile?: unknown } | null | undefined): EngineApi {
    return ENGINES[resolveEngineProfile(simSettings?.engineProfile)];
}
