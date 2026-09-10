
import React from 'react';

// 올스타 화면(views/multi/season/MultiAllStarView.tsx) 전용 세로 하프코트 도형.
//
// CourtPreview.tsx(가로 풀코트 940x500, 샷차트/로스터 화면과 공유)를 회전+크롭+림
// 마스킹으로 억지로 재사용하다가, 공유 컴포넌트를 계속 워크어라운드로 우회하는 게 더
// 비효율적이라 판단해 별도 컴포넌트로 분리했다 — 이제 CourtPreview.tsx는 전혀 건드리지
// 않으므로 샷차트/팀 설정 미리보기에 영향 없음.
//
// 아래 <HalfCourtLines>의 경로는 CourtPreview.tsx의 BasketLines를 그대로 복사한 뒤 림
// 마커, 백보드 실선, 제한구역(림 아래 반원)을 제거한 버전(선수 마커가 그 자리를 대신
// 차지하므로 시각적으로 번잡해 사용자 요청으로 뺌) — 베지어 곡선 제어점을 손으로
// 재계산하는 대신, 원본과 동일하게 transform="translate(500,0) rotate(90)"으로 90도
// 회전시켜서 곡선 모양을 그대로 보존한다(원본 왼쪽 골대의 baseline이 새 좌표계 y=0/상단이
// 됨). viewBox는 "0 0 500 474"로 쓸 것 — 폭 500은 원본 코트 폭 그대로, 높이 474는
// 하프라인(원본 x=470) 부근에서 자른 값.
const HalfCourtLines: React.FC<{ stroke: string }> = ({ stroke }) => (
    <g fill="none" stroke={stroke} strokeWidth="2" strokeMiterlimit="10">
        {/* 3점 아크 */}
        <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
        {/* 페인트(키) 외곽선 */}
        <polyline points="0,170 190,170 190,330 0,330" />
        <line x1="190" y1="310" y2="310" />
        <line y1="190" x2="190" y2="190" />
        {/* 자유투 서클 — 앞(골대 반대쪽) 실선 */}
        <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
        <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
        {/* 자유투 서클 — 뒤(골대 쪽) 점선 */}
        <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
        <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
        {/* 제한구역(림 아래 반원)은 사용자 요청으로 생략 */}
        {/* 레인 스페이스 마크 */}
        <line x1="145" y1="310" x2="145" y2="318" />
        <line x1="115" y1="310" x2="115" y2="318" />
        <line x1="85"  y1="310" x2="85"  y2="318" />
        <line x1="70"  y1="310" x2="70"  y2="318" />
        <line x1="145" y1="182" x2="145" y2="190" />
        <line x1="115" y1="182" x2="115" y2="190" />
        <line x1="85"  y1="182" x2="85"  y2="190" />
        <line x1="70"  y1="182" x2="70"  y2="190" />
        {/* 백보드(실선)와 림(주황 원)은 이 화면 전용 요청으로 생략 */}
    </g>
);

interface AllStarHalfCourtProps {
    background: string;
    paint:      string;
    line:       string;
}

// [주의] CourtPreview.tsx와 동일하게 자체 <svg> 태그를 만들지 않고 자식 노드만 반환한다 —
// 호출부가 viewBox="0 0 500 474"인 자신의 <svg> 안에 이 컴포넌트를 그대로 끼워 넣어 쓴다.
export const AllStarHalfCourt: React.FC<AllStarHalfCourtProps> = ({ background, paint, line }) => (
    <>
        <rect width="500" height="474" fill={background} />
        <g transform="translate(500,0) rotate(90)">
            <rect y="170" width="190" height="160" fill={paint} />
            <HalfCourtLines stroke={line} />
        </g>
    </>
);
