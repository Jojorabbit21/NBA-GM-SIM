
import React, { useId } from 'react';
import type { CourtTexture } from '../../types/points';

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
    /** [2026-11-09] 림·백보드 색 — 상점 "림 세트" 상품. 없으면 기존 고정값(주황 림·짙은 회색 백보드) */
    rim?: string;
    backboard?: string;
    /** [2026-11-09] 바닥 질감 — 상점 "바닥 질감" 상품. 배경 위·3점/페인트 아래 오버레이. 없으면 민무늬 */
    texture?: CourtTexture | null;
}

// ── 바닥 질감 오버레이 ────────────────────────────────────────────────────────
// 어두운 선(검정 α.16)과 한 픽셀 비낀 밝은 선(흰색 α.09)을 겹쳐 음각처럼 — 밝은 코트·어두운 코트 어느 쪽에서도 보인다.
// 패턴 id 는 useId 로 인스턴스마다 다르게(상점 카드처럼 한 페이지에 여러 코트가 있어도 충돌 없음).
const DARK = 'rgba(0,0,0,0.16)';
const LIGHT = 'rgba(255,255,255,0.09)';

const TexturePattern: React.FC<{ id: string; texture: CourtTexture }> = ({ id, texture }) => {
    switch (texture) {
        case 'plank':   // 가로 널빤지 — 24px 보드, 두 줄마다 이음새 위치가 어긋남
            return (
                <pattern id={id} width="160" height="48" patternUnits="userSpaceOnUse">
                    <g fill="none" strokeWidth="1.5">
                        <path d="M0,23.5H160 M0,47.5H160 M40,0V24 M120,24V48" stroke={DARK} />
                        <path d="M0,24.5H160 M0,0.5H160 M41,0V24 M121,24V48" stroke={LIGHT} />
                    </g>
                </pattern>
            );
        case 'herringbone':   // 지그재그 쉐브론
            return (
                <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
                    <g fill="none" strokeWidth="1.5">
                        <path d="M0,20L20,0L40,20 M0,40L20,20L40,40" stroke={DARK} />
                        <path d="M0,21L20,1L40,21 M0,41L20,21L40,41" stroke={LIGHT} />
                    </g>
                </pattern>
            );
        case 'parquet':   // 쪽모이 — 40px 정사각형, 가로결·세로결 교차
            return (
                <pattern id={id} width="80" height="80" patternUnits="userSpaceOnUse">
                    <g fill="none" strokeWidth="1.2">
                        <path d="M0,40H80 M40,0V80 M0,0H80 M0,0V80" stroke={DARK} />
                        {/* 좌상·우하: 세로결 / 우상·좌하: 가로결 */}
                        <path d="M10,0V40 M20,0V40 M30,0V40 M50,40V80 M60,40V80 M70,40V80 M40,10H80 M40,20H80 M40,30H80 M0,50H40 M0,60H40 M0,70H40" stroke={DARK} opacity="0.7" />
                        <path d="M11,0V40 M21,0V40 M31,0V40 M51,40V80 M61,40V80 M71,40V80 M40,11H80 M40,21H80 M40,31H80 M0,51H40 M0,61H40 M0,71H40" stroke={LIGHT} />
                    </g>
                </pattern>
            );
        case 'gloss':   // 하이글로스 — 패턴 아님(아래 TextureOverlay 에서 그라데이션으로 처리)
        default:
            return null;
    }
};

const TextureOverlay: React.FC<{ texture: CourtTexture }> = ({ texture }) => {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const pid = `court-tex-${uid}`;
    if (texture === 'gloss') {
        return (
            <>
                <defs>
                    <linearGradient id={`${pid}-g`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fff" stopOpacity="0.26" />
                        <stop offset="0.45" stopColor="#fff" stopOpacity="0.04" />
                        <stop offset="0.7" stopColor="#000" stopOpacity="0.06" />
                        <stop offset="1" stopColor="#000" stopOpacity="0.16" />
                    </linearGradient>
                    <linearGradient id={`${pid}-b`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
                        <stop offset="0.5" stopColor="#fff" stopOpacity="0.12" />
                        <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <rect width="940" height="500" fill={`url(#${pid}-g)`} />
                <rect width="940" height="500" fill={`url(#${pid}-b)`} transform="skewX(-20)" />
            </>
        );
    }
    return (
        <>
            <defs><TexturePattern id={pid} texture={texture} /></defs>
            <rect width="940" height="500" fill={`url(#${pid})`} />
        </>
    );
};

const DEFAULT_RIM = '#e65100';
const DEFAULT_BACKBOARD = '#333';

const BasketLines: React.FC<{ stroke: string; rim?: string; backboard?: string }> = ({ stroke, rim = DEFAULT_RIM, backboard = DEFAULT_BACKBOARD }) => (
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
        <line x1="40"  y1="222" x2="40"  y2="278" stroke={backboard} strokeWidth="2" />
        <circle cx="48" cy="250" r="7.5" stroke={rim} />
    </g>
);

// 로고 기본(100%) 크기 — 940x500 코트 기준. 센터 서클(지름 120)보다 크게 잡아 코트 중앙을 채운다.
const LOGO_BASE_SIZE = 220;

// [주의] 자체 <svg> 태그를 만들지 않고 SVG 자식 노드만 반환한다 — 호출부가 viewBox="0 0 940 500"인
// 자신의 <svg> 안에 이 컴포넌트를 그대로 끼워 넣어 쓴다(샷 마커 등 다른 레이어와 좌표계 공유 목적).
export const CourtPreview: React.FC<CourtPreviewProps> = ({ background, paint, line, three, logoUrl, logoScale = 100, rim, backboard, texture }) => (
    <>
        {/* Background */}
        <rect width="940" height="500" fill={background} />
        {/* 바닥 질감 — 배경 위, 3점/페인트 채움 아래(채움 색이 질감을 덮는다: 페인트존은 민무늬처럼 보임) */}
        {texture && <TextureOverlay texture={texture} />}

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
        <BasketLines stroke={line} rim={rim} backboard={backboard} />

        {/* Right basket (X-mirror) */}
        <g transform="translate(940,0) scale(-1,1)">
            <BasketLines stroke={line} rim={rim} backboard={backboard} />
        </g>

        {/* Center court */}
        <g fill="none" stroke={line} strokeWidth="2">
            <line x1="470" y1="0" x2="470" y2="500" />
            <circle cx="470" cy="250" r="60" />
            <circle cx="470" cy="250" r="20" />
        </g>
    </>
);
