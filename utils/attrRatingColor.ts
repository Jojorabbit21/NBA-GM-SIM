// 능력치(0~99) 값에 따른 색상 등급 — [2026-10-19] 15단계(능력치 색상 스튜디오 아티팩트에서 사용자가 확정).
// 원래는 PlayerDetailView의 능력치 위젯에서 정의된 9단계 기준을
// 공용화. PlayerHoverCard 등 같은 스케일을 쓰는 화면은 이 함수를 참조할 것.
// (PlayerCardModal/ContractManagementTab은 각자 다른 3단계 기준을 의도적으로 유지 중이므로 통일 대상 아님 —
// CLAUDE.md/PlayerHoverCard 주석 참고. Table의 colorScale 셀은 2026-10-19부터 이 함수를 씀.)
//
// getAttrColor는 Tailwind JIT이 클래스명을 정적으로 스캔하므로 템플릿 리터럴로 조립하지 않고
// 각 분기에서 리터럴 문자열을 그대로 return해야 함 (동적 조립 시 클래스 누락됨).
export const getAttrColor = (val: number): string => {
    if (val >= 99) return 'text-[#fb00ff]';
    if (val >= 97) return 'text-[#a600ff]';
    if (val >= 95) return 'text-[#7300ff]';
    if (val >= 93) return 'text-[#0033ff]';
    if (val >= 90) return 'text-[#00ccff]';
    if (val >= 87) return 'text-[#00ffd5]';
    if (val >= 83) return 'text-[#00a81c]';
    if (val >= 80) return 'text-[#7ff91a]';
    if (val >= 77) return 'text-[#9cc700]';
    if (val >= 75) return 'text-[#e6bf00]';
    if (val >= 73) return 'text-[#d18f00]';
    if (val >= 70) return 'text-[#bd6500]';
    if (val >= 66) return 'text-[#db4200]';
    if (val >= 60) return 'text-[#e60000]';
    return 'text-[#9e0000]';
};

export const getAttrBarColor = (val: number): string => {
    if (val >= 99) return '#fb00ff';
    if (val >= 97) return '#a600ff';
    if (val >= 95) return '#7300ff';
    if (val >= 93) return '#0033ff';
    if (val >= 90) return '#00ccff';
    if (val >= 87) return '#00ffd5';
    if (val >= 83) return '#00a81c';
    if (val >= 80) return '#7ff91a';
    if (val >= 77) return '#9cc700';
    if (val >= 75) return '#e6bf00';
    if (val >= 73) return '#d18f00';
    if (val >= 70) return '#bd6500';
    if (val >= 66) return '#db4200';
    if (val >= 60) return '#e60000';
    return '#9e0000';
};
