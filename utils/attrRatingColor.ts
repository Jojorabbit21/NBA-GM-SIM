// 능력치(0~99) 값에 따른 색상 등급 — PlayerDetailView의 능력치 위젯에서 정의된 9단계 기준을
// 공용화. PlayerHoverCard 등 같은 스케일을 쓰는 화면은 이 함수를 참조할 것.
// (Table/PlayerPool/PlayerCardModal/ContractManagementTab은 각자 다른 3단계 기준을 의도적으로
// 유지 중이므로 통일 대상 아님 — CLAUDE.md/PlayerHoverCard 주석 참고)
//
// getAttrColor는 Tailwind JIT이 클래스명을 정적으로 스캔하므로 템플릿 리터럴로 조립하지 않고
// 각 분기에서 리터럴 문자열을 그대로 return해야 함 (동적 조립 시 클래스 누락됨).
export const getAttrColor = (val: number): string => {
    if (val >= 96) return 'text-[#0afffb]';
    if (val >= 90) return 'text-[#1bff0a]';
    if (val >= 85) return 'text-[#34f000]';
    if (val >= 80) return 'text-[#38d100]';
    if (val >= 75) return 'text-[#ffc800]';
    if (val >= 70) return 'text-[#f0bc00]';
    if (val >= 60) return 'text-[#c1731a]';
    if (val >= 50) return 'text-[#8f8f8f]';
    return 'text-[#5c5c5c]';
};

export const getAttrBarColor = (val: number): string => {
    if (val >= 96) return '#0afffb';
    if (val >= 90) return '#1bff0a';
    if (val >= 85) return '#34f000';
    if (val >= 80) return '#38d100';
    if (val >= 75) return '#ffc800';
    if (val >= 70) return '#f0bc00';
    if (val >= 60) return '#c1731a';
    if (val >= 50) return '#8f8f8f';
    return '#5c5c5c';
};
