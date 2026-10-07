
import React from 'react';

// 코트 바닥/페인트존/라인 색상을 props로 받는 "정적 코트 도형"만 담당 — 슛 마커/범례/툴팁 등
// 상호작용 요소는 없음. MultiFullCourtChart.tsx(실제 라이브 샷차트)와 TeamSettingsPanel.tsx
// (설정 미리보기)가 이 컴포넌트를 공유해서, 예전에 CourtBackground.tsx/MultiFullCourtChart.tsx가
// 동일 색상값을 각자 중복 하드코딩했던 것과 같은 미러 불일치가 재발하지 않게 한다.

interface CourtPreviewProps {
    background: string;
    paint:      string;
    line:       string;
    /** [2026-10-02] 코트 중앙(센터 서클)에 그릴 홈팀 로고 URL — 없으면 로고 미표시. */
    /** [2026-10-02] 3점 라인 안쪽 채움색 — 없으면 background와 동일(구분 없음). */
    three?:     string;
    logoUrl?:   string | null;
    /** 로고 크기(%) — 100 = LOGO_BASE_SIZE(220px). 팀 설정값(50~200). */
    logoScale?: number;
}

const BasketLines: React.FC<{ stroke: string }> = ({ stroke }) => (
    <g fill="none" stroke={stroke} strokeWidth="2" strokeMiterlimit="10">
        <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
        <polyline points="0,170 190,170 190,330 0,330" />
        <line x1="190" y1="310" y2="310" />
        <line y1="190" x2="190" y2="190" />
        <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
        <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
        <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
        <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
        <line x1="280" y1="480" x2="280" y2="500" />
        <line x1="280" x2="280" y2="20" />
        <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
        <line x1="145" y1="310" x2="145" y2="318" />
        <line x1="115" y1="310" x2="115" y2="318" />
        <line x1="85"  y1="310" x2="85"  y2="318" />
        <line x1="70"  y1="310" x2="70"  y2="318" />
        <line x1="145" y1="182" x2="145" y2="190" />
        <line x1="115" y1="182" x2="115" y2="190" />
        <line x1="85"  y1="182" x2="85"  y2="190" />
        <line x1="70"  y1="182" x2="70"  y2="190" />
        <line x1="40"  y1="222" x2="40"  y2="278" stroke="#333" strokeWidth="2" />
        <circle cx="48" cy="250" r="7.5" stroke="#e65100" />
    </g>
);

// 로고 기본(100%) 크기 — 940x500 코트 기준. 센터 서클(지름 120)보다 크게 잡아 코트 중앙을 채운다.
const LOGO_BASE_SIZE = 220;

// [주의] 자체 <svg> 태그를 만들지 않고 SVG 자식 노드만 반환한다 — 호출부가 viewBox="0 0 940 500"인
// 자신의 <svg> 안에 이 컴포넌트를 그대로 끼워 넣어 쓴다(샷 마커 등 다른 레이어와 좌표계 공유 목적).
export const CourtPreview: React.FC<CourtPreviewProps> = ({ background, paint, line, three, logoUrl, logoScale = 100 }) => (
    <>
        {/* Background */}
        <rect width="940" height="500" fill={background} />

        {/* 3점 라인 안쪽 (BasketLines의 3점 곡선 + 베이스라인으로 닫은 영역) — 페인트존보다 아래 레이어 */}
        {three && three !== background && (
            <>
                <path d="M0,30h140s150,55,150,220-150,220,-150,220H0Z" fill={three} />
                <path d="M0,30h140s150,55,150,220-150,220,-150,220H0Z" fill={three} transform="translate(940,0) scale(-1,1)" />
            </>
        )}

        {/* Paint backgrounds */}
        <rect y="170" width="190" height="160" fill={paint} />
        <rect x="750" y="170" width="190" height="160" fill={paint} />

        {/* Center logo (team setting, optional) — 코트 라인보다 아래 레이어(라인이 로고 위로 지나감). 센터 서클(r=60) 안에 맞춘다. 샷 마커 등 상호작용 방해 금지 */}
        {logoUrl && (
            <image
                href={logoUrl}
                x={470 - LOGO_BASE_SIZE / 2 * logoScale / 100} y={250 - LOGO_BASE_SIZE / 2 * logoScale / 100}
                width={LOGO_BASE_SIZE * logoScale / 100} height={LOGO_BASE_SIZE * logoScale / 100}
                preserveAspectRatio="xMidYMid meet"
                opacity="0.9"
                pointerEvents="none"
            />
        )}

        {/* Left basket */}
        <BasketLines stroke={line} />

        {/* Right basket (X-mirror) */}
        <g transform="translate(940,0) scale(-1,1)">
            <BasketLines stroke={line} />
        </g>

        {/* Center court */}
        <g fill="none" stroke={line} strokeWidth="2">
            <line x1="470" y1="0" x2="470" y2="500" />
            <circle cx="470" cy="250" r="60" />
            <circle cx="470" cy="250" r="20" />
        </g>
    </>
);
