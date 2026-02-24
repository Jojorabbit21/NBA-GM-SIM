
// Shared court zone constants for shot chart visualizations
// 435 x 403 Canvas Coordinate System

export const ZONE_PATHS = {
    ATB3_C: "M.8,64.3V.6h433v63.7l-114.1,114.1-.3-.2c-30.9-17.8-66.2-27.2-102-27.2s-71.2,9.4-102,27.2l-.3.2L.8,64.3Z",
    MID_C: "M81.9,202.6l.4-.4c37.2-32.8,85.1-50.8,135-50.8s97.8,18,135,50.8l.4.4-66.8,66.8v-32h-137.2v32l-66.8-66.8Z",
    ATB3_R: "M407.1,278.7l-.2-.3c-15.3-37.3-40.9-68.9-74.1-91.7-4.3-3-8.8-5.8-13.4-8.4l-.6-.3,115-115v215.8h-26.7Z",
    MID_R: "M285.9,401.6v-133.6l66.1-66.1.4.3c23.4,20.6,42.1,47,54.1,76.1h0v123.2h-120.5Z",
    ATB3_L: "M.8,278.7V62.9l115,115-.6.3c-4.6,2.6-9.1,5.5-13.4,8.4-33.3,22.8-58.9,54.4-74.1,91.6v.2c-.1,0-.3.2-.3.2H.8Z",
    MID_L: "M28.2,401.6v-123.1h0c11.9-29.2,30.6-55.6,54.1-76.2l.4-.3,66.1,66.1v133.6H28.2Z",
    C3_R: "M406.9,277.7h26.9v123.9h-26.9Z",
    PAINT: "M149.1,237.9h136.4v163.7h-136.4Z",
    RIM: "M149.1,318.5h136.4v83.1h-136.4Z",
    C3_L: "M.8,277.7h26.9v123.9h-26.9Z",
};

export const COURT_LINES = [
    "M149.6,238.4h135.4v162.7h-135.4v-162.7M148.2,236.9v165.6h138.2v-165.6h-138.2Z",
    "M269.2,237.7h-1.4c0-27.8-22.6-50.4-50.4-50.4s-50.4,22.6-50.4,50.4h-1.4c0-28.6,23.3-51.8,51.8-51.8s51.8,23.3,51.8,51.8Z",
    "M269.1,237.7c0,2.6-.2,5.3-.6,7.9l-1.4-.2c.6-3.6.7-7.3.5-11h1.4c0,1,.1,2.2.1,3.3ZM267.1,223.2l-1.4.4c-1-3.5-2.4-6.9-4.2-10.1l1.3-.7c1.8,3.3,3.3,6.8,4.3,10.4ZM265.6,256.5c-1.4,3.5-3.1,6.9-5.2,10l-1.2-.8c2-3,3.7-6.3,5.1-9.7l1.3.5ZM256.3,203.5l-1.1.9c-2.4-2.7-5.1-5.2-8.1-7.4l.9-1.2c3,2.2,5.8,4.8,8.3,7.6ZM253.1,275.1c-2.7,2.6-5.7,4.9-9,6.9l-.7-1.2c3.1-1.9,6.1-4.1,8.7-6.7l1,1ZM238.2,190.2l-.6,1.3c-3.4-1.5-6.9-2.6-10.5-3.3l.3-1.4c3.7.7,7.3,1.9,10.8,3.4ZM233.9,286.8c-1.4.5-2.8.9-4.3,1.2-2.2.5-4.5,1-6.8,1.2l-.2-1.4c2.2-.2,4.4-.6,6.6-1.2,1.4-.3,2.8-.7,4.1-1.2l.5,1.4ZM216.2,187.3c-3.6,0-7.3.6-10.9,1.5-2.8.7-5.5,1.6-8.2,2.7l-.6-1.3c2.7-1.2,5.5-2.1,8.4-2.8,3.7-.9,7.4-1.4,11.2-1.5v1.4ZM211.8,287.8l-.2,1.4c-3.7-.4-7.5-1.2-11-2.5l.5-1.4c3.5,1.2,7.1,2,10.7,2.4ZM191.1,280.7l-.7,1.2c-3.2-2-6.2-4.3-9-6.9l1-1c2.6,2.5,5.6,4.8,8.7,6.7ZM187.6,196.9c-3,2.2-5.7,4.6-8.1,7.4l-1.1-1c2.5-2.8,5.3-5.4,8.3-7.6l.8,1.2ZM175.4,265.6l-1.2.8c-2.1-3.1-3.8-6.5-5.2-10l1.3-.5c1.3,3.4,3,6.7,5,9.8ZM173.2,213.3c-1.8,3.2-3.2,6.6-4.2,10.1l-1.4-.4c1.1-3.6,2.5-7.1,4.4-10.4l1.3.7ZM167.5,245.2l-1.4.2c-.6-3.7-.7-7.5-.5-11.3h1.4c-.2,3.7,0,7.4.5,11.1Z",
    "M252.9,355.9v10.7h-1.4v-10.7c0-18.9-15.3-34.2-34.2-34.2s-34.2,15.3-34.2,34.2v10.7h-1.4v-10.7c0-19.6,16-35.6,35.6-35.6s35.6,16,35.6,35.6Z",
    "M407.4,278.3v122.8h-1.4v-122.5c-31.5-76.9-105.5-126.6-188.6-126.6S60.2,201.7,28.7,278.6v122.5h-1.4v-122.9h0c15.2-37.4,40.9-69.1,74.3-91.9,34.2-23.4,74.2-35.7,115.7-35.7s81.6,12.4,115.7,35.7c33.4,22.8,59,54.6,74.3,91.9h0Z"
];

// League average FG% by zone
export const ZONE_AVG = { rim: 0.62, paint: 0.42, mid: 0.40, c3: 0.38, atb3: 0.35 };

// Zone configuration for chart rendering (cx/cy = label position in 435x403 canvas)
export const ZONE_CONFIG = [
    { pathKey: 'PAINT' as const, avgKey: 'paint' as const, label: "페인트존", key: 'paint', cx: 217, cy: 290 },
    { pathKey: 'RIM' as const, avgKey: 'rim' as const, label: "골밑", key: 'rim', cx: 217, cy: 375 },
    { pathKey: 'MID_L' as const, avgKey: 'mid' as const, label: "좌측 미드레인지", key: 'midL', cx: 80, cy: 300 },
    { pathKey: 'MID_C' as const, avgKey: 'mid' as const, label: "중앙 미드레인지", key: 'midC', cx: 217, cy: 200 },
    { pathKey: 'MID_R' as const, avgKey: 'mid' as const, label: "우측 미드레인지", key: 'midR', cx: 355, cy: 300 },
    { pathKey: 'C3_L' as const, avgKey: 'c3' as const, label: "좌측 코너", key: 'c3L', cx: 35, cy: 350 },
    { pathKey: 'ATB3_L' as const, avgKey: 'atb3' as const, label: "좌측 45도", key: 'atb3L', cx: 40, cy: 140 },
    { pathKey: 'ATB3_C' as const, avgKey: 'atb3' as const, label: "탑 오브 더 키", key: 'atb3C', cx: 217, cy: 80 },
    { pathKey: 'ATB3_R' as const, avgKey: 'atb3' as const, label: "우측 45도", key: 'atb3R', cx: 395, cy: 140 },
    { pathKey: 'C3_R' as const, avgKey: 'c3' as const, label: "우측 코너", key: 'c3R', cx: 400, cy: 350 },
];

// Determine zone heatmap style — single green color, opacity = efficiency
export const getZoneStyle = (makes: number, attempts: number, avg: number) => {
    if (attempts === 0) return { fill: '#10b981', opacity: 0.04, delta: 0 };
    const pct = makes / attempts;
    const delta = pct - avg;
    // Map delta to opacity: -0.15 → 0.06, 0 → 0.22, +0.15 → 0.50
    const opacity = Math.min(0.55, Math.max(0.06, 0.22 + delta * 2));
    return { fill: '#10b981', opacity, delta };
};

// Get pill label colors — green intensity matches zone opacity
export const getZonePillColors = (delta: number, hasAttempts: boolean) => {
    if (!hasAttempts) return { pillFill: '#1e293b', textFill: '#94a3b8', borderStroke: '#334155' };
    if (delta >= 0.05) return { pillFill: '#064e3b', textFill: '#34d399', borderStroke: '#059669' };
    if (delta <= -0.05) return { pillFill: '#0f172a', textFill: '#64748b', borderStroke: '#1e293b' };
    return { pillFill: '#0c2a1f', textFill: '#6ee7b7', borderStroke: '#065f46' };
};
