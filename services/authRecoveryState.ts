// Tracks an in-progress password recovery. verifyOtp(type: 'recovery') creates a real session,
// which would make the app treat the user as logged in (and unmount the auth form) before the
// new password is set. useAuth ignores SIGNED_IN while this flag is on.
let recoveryInProgress = false;

export const setRecoveryInProgress = (v: boolean) => { recoveryInProgress = v; };
export const isRecoveryInProgress = () => recoveryInProgress;
