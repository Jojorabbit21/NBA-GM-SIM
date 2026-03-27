
// 코치 고용/해고 엔진
// FA 코치 풀 ↔ 팀 스태프 슬롯 간 이동 처리

import type {
    Coach, CoachingStaff, CoachFAPool, LeagueCoachingData, StaffRole,
} from '../../types/coaching';

// ─────────────────────────────────────────────
// 고용 / 해고
// ─────────────────────────────────────────────

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
    overrideSalary?: number,
): { staff: CoachingStaff; pool: CoachFAPool } {
    const idx = pool.coaches.findIndex(c => c.id === coachId);
    if (idx === -1) {
        console.warn(`[hireCoach] coachId=${coachId} not found in FA pool`);
        return { staff, pool };
    }

    const newStaff = { ...staff };
    const newPool: CoachFAPool = { coaches: [...pool.coaches] };

    // 기존 코치 → FA 풀 반환
    fireCoachInternal(newStaff, newPool, role);

    // 선택 코치 → 슬롯 배치 (요구 연봉 반영)
    const coach = newPool.coaches.splice(newPool.coaches.findIndex(c => c.id === coachId), 1)[0];
    const hiredCoach = { ...coach, contractYearsRemaining: coach.contractYears };
    if (overrideSalary !== undefined) hiredCoach.contractSalary = overrideSalary;
    (newStaff as any)[role] = hiredCoach;

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
    const newPool: CoachFAPool = { coaches: [...pool.coaches] };
    fireCoachInternal(newStaff, newPool, role);
    return { staff: newStaff, pool: newPool };
}

/** 내부 헬퍼: 슬롯 코치를 FA 풀로 이동 (in-place 변이) */
function fireCoachInternal(staff: CoachingStaff, pool: CoachFAPool, role: StaffRole): void {
    const existing = (staff as any)[role] as Coach | null;
    if (!existing) return;

    // contractYearsRemaining 리셋 → FA로 재계약 필요
    pool.coaches.push({ ...existing, contractYearsRemaining: 0 });
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
    const newPool: CoachFAPool = { coaches: [...pool.coaches] };

    const roles: StaffRole[] = [
        'headCoach', 'offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach',
    ];

    for (const [teamId, staff] of Object.entries(leagueStaff)) {
        const newStaff: CoachingStaff = { ...staff };
        for (const role of roles) {
            const coach = (newStaff as any)[role] as Coach | null;
            if (!coach) continue;

            const remaining = coach.contractYearsRemaining - 1;
            if (remaining <= 0) {
                // 계약 만료 → FA 풀 반환
                newPool.coaches.push({ ...coach, contractYearsRemaining: 0 });
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
 * FA 풀 코치 목록 조회 (role 인수는 무시 — 풀이 슬롯 무관으로 통합됨)
 */
export function getFACoaches(pool: CoachFAPool, _role?: StaffRole): Coach[] {
    return pool.coaches;
}

/**
 * 팀 스태프의 특정 슬롯 코치 조회
 */
export function getStaffSlot(staff: CoachingStaff, role: StaffRole): Coach | null {
    return (staff as any)[role] ?? null;
}
