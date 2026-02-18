
export const getHeatmapStyle = (
    key: string, 
    value: number, 
    statRanges: Record<string, { min: number, max: number }>,
    isEnabled: boolean = true,
    isInverse: boolean = false
) => {
    if (!isEnabled) return undefined;
    
    // G (Games Played) usually shouldn't have a heatmap
    if (key === 'g' || key === 'mp') return undefined; 

    const range = statRanges[key];
    if (!range || range.max === range.min) return undefined;
    
    // Normalize value to 0..1
    let ratio = (value - range.min) / (range.max - range.min);
    ratio = Math.max(0, Math.min(1, ratio));

    let color = '';
    let opacity = 0;

    if (isInverse) {
        // Lower is better (Red for high, Green for low)
        if (ratio < 0.5) {
            color = '16, 185, 129'; // Emerald (Good)
            opacity = (0.5 - ratio) * 2 * 0.5;
        } else {
            color = '239, 68, 68'; // Red (Bad)
            opacity = (ratio - 0.5) * 2 * 0.5;
        }
    } else {
        // Higher is better (Green for high, Red for low)
        if (ratio > 0.5) {
            color = '16, 185, 129'; // Emerald
            opacity = (ratio - 0.5) * 2 * 0.5;
        } else {
            color = '239, 68, 68'; // Red
            opacity = (0.5 - ratio) * 2 * 0.5;
        }
    }
    
    // Minimum opacity to avoid looking washed out
    if (opacity < 0.05) return undefined;

    return { backgroundColor: `rgba(${color}, ${opacity})` };
};
