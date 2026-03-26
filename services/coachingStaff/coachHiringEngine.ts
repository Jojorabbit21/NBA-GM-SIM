
// 코치 고용/해고 엔진
// FA 코치 풀 ↔ 팀 스태프 슬롯 간 이동 처리

import type {
    CoachingStaff, CoachFAPool, LeagueCoachingData, StaffRole,
    HeadCoach, OffenseCoordinator, DefenseCoordinator, DevelopmentCoach, TrainingCoach,
} from '../../types/coaching';

// ─────────────────────────────────────────────
// 고용 / 해고
// ─────────────────────────────────────────────

type AnyCoach = HeadCoach | OffenseCoordinator | DefenseCoordinator | DevelopmentCoach | TrainingCoach;

function getPoolArray(pool: CoachFAPool, role: StaffRole): AnyCoach[] {
    switch (role) {
        case 'headCoach':          return pool.headCoaches;
        case 'offenseCoordinator': return pool.offenseCoordinators;
        case 'defenseCoordinator': return pool.defenseCoordinators;
        case 'developmentCoach':   return pool.developmentCoaches;
        case 'trainingCoach':      return pool.trainingCoaches;
    }
}

/**
 * FA 풀에서 코치를 고용해 팀 스태프 슬롯에 배치.
 * 해당 슬롯에 기존 코치가 있으면 FA 풀로 반환.
 *
 * @returns 변경된 { staff, pool } 복사본
 */
export function hireCoach(
    staff: CoachingStaff,
    pool: CoachFAPool,
    role: StaffRole,
    coachId: string,
): { staff: CoachingStaff; pool: CoachFAPool } {
    const poolArr = getPoolArray(pool, role);
    const idx = poolArr.findIndex(c => c.id === coachId);
    if (idx === -1) {
        console.warn(`[hireCoach] coachId=${coachId} not found in FA pool (role=${role})`);
        return { staff, pool };
    }

    const newStaff = { ...staff };
    const newPool = {
        headCoaches:         [...pool.headCoaches],
        offenseCoordinators: [...pool.offenseCoordinators],
        defenseCoordinators: [...pool.defenseCoordinators],
        developmentCoaches:  [...pool.developmentCoaches],
        trainingCoaches:     [...pool.trainingCoaches],
    };

    // 기존 코치 → FA 풀 반환
    fireCoachInternal(newStaff, newPool, role);

    // 선택 코치 → 슬롯 배치
    const newPoolArr = getPoolArray(newPool, role);
    const coach = newPoolArr.splice(newPoolArr.findIndex(c => c.id === coachId), 1)[0];
    (newStaff as any)[role] = coach;

    return { staff: newStaff, pool: newPool };
}

/**
 * 팀 스태프에서 코치를 해고해 FA 풀로 반환.
 *
 * @returns 변경된 { staff, pool } 복사본
 */
export function fireCoach(
    staff: CoachingStaff,
    pool: CoachFAPool,
    role: StaffRole,
): { staff: CoachingStaff; pool: CoachFAPool } {
    const newStaff = { ...staff };
    const newPool = {
        headCoaches:         [...pool.headCoaches],
        offenseCoordinators: [...pool.offenseCoordinators],
        defenseCoordinators: [...pool.defenseCoordinators],
        developmentCoaches:  [...pool.developmentCoaches],
        trainingCoaches:     [...pool.trainingCoaches],
    };
    fireCoachInternal(newStaff, newPool, role);
    return { staff: newStaff, pool: newPool };
}

/** 내부 헬퍼: 슬롯 코치를 FA 풀로 이동 (in-place 변이) */
function fireCoachInternal(staff: CoachingStaff, pool: CoachFAPool, role: StaffRole): void {
    const existing = (staff as any)[role] as AnyCoach | null;
    if (!existing) return;

    // contractYearsRemaining 리셋 → FA로 재계약 필요
    const resetCoach = { ...existing, contractYearsRemaining: 0 };
    getPoolArray(pool, role).push(resetCoach);
    (staff as any)[role] = null;
}

// ─────────────────────────────────────────────
// 계약 연수 처리 (시즌 종료 시 호출)
// ─────────────────────────────────────────────

/**
 * 리그 전체 코치 계약 연수 -1 처리.
 * contractYearsRemaining === 0 → FA 풀로 반환.
 *
 * @returns 변경된 { leagueStaff, pool } 복사본
 */
export function processCoachContracts(
    leagueStaff: LeagueCoachingData,
    pool: CoachFAPool,
): { leagueStaff: LeagueCoachingData; pool: CoachFAPool } {
    const newLeagueStaff: LeagueCoachingData = {};
    const newPool: CoachFAPool = {
        headCoaches:         [...pool.headCoaches],
        offenseCoordinators: [...pool.offenseCoordinators],
        defenseCoordinators: [...pool.defenseCoordinators],
        developmentCoaches:  [...pool.developmentCoaches],
        trainingCoaches:     [...pool.trainingCoaches],
    };

    const roles: StaffRole[] = [
        'headCoach', 'offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach',
    ];

    for (const [teamId, staff] of Object.entries(leagueStaff)) {
        const newStaff: CoachingStaff = { ...staff };
        for (const role of roles) {
            const coach = (newStaff as any)[role] as AnyCoach | null;
            if (!coach) continue;

            const remaining = coach.contractYearsRemaining - 1;
            if (remaining <= 0) {
                // 계약 만료 → FA 풀 반환
                const expiredCoach = { ...coach, contractYearsRemaining: 0 };
                getPoolArray(newPool, role).push(expiredCoach);
                (newStaff as any)[role] = null;
            } else {
                (newStaff as any)[role] = { ...coach, contractYearsRemaining: remaining };
            }
        }
        newLeagueStaff[teamId] = newStaff;
    }

    return { leagueStaff: newLeagueStaff, pool: newPool };
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

/**
 * FA 풀에서 특정 역할 코치 목록 조회
 */
export function getFACoaches(pool: CoachFAPool, role: StaffRole): AnyCoach[] {
    return getPoolArray(pool, role);
}

/**
 * 팀 스태프의 특정 슬롯 코치 조회
 */
export function getStaffSlot(staff: CoachingStaff, role: StaffRole): AnyCoach | null {
    return (staff as any)[role] ?? null;
}
