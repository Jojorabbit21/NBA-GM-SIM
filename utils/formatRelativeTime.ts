/**
 * Returns a human-readable relative time string from an ISO date string.
 * e.g. "방금", "5분 전", "3시간 전", "어제", "3일 전"
 */
export function formatRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60)  return '방금';
    if (diffMin < 60)  return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay === 1) return '어제';
    return `${diffDay}일 전`;
}
