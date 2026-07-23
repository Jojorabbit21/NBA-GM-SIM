
import React from 'react';

// ─────────────────────────────────────────────────────────────
// Court background SVG (paint fills + court lines), extracted from LiveShotChart
// (views/LiveGameView.tsx ~707-785) so the physics lab can render the same court
// without depending on the full LiveGameView/shot-chart component.
// Coordinate system: viewBox 0-940 x 0-500 = 94x50 ft court scaled by 10 (S=10).
// ─────────────────────────────────────────────────────────────

export const CourtBackground: React.FC = () => (
    <>
        {/* Court Background */}
        <rect width="940" height="500" fill="rgb(221,200,173)" />
        {/* Paint Fills */}
        <rect y="170" width="190" height="160" fill="rgb(195,172,145)" />
        <rect x="750" y="170" width="190" height="160" fill="rgb(195,172,145)" />

        {/* ── Court Lines ── */}
        <g fill="none" stroke="#4a3728" strokeWidth="2" strokeMiterlimit="10">
            {/* Left 3-Point Line */}
            <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
            {/* Left Paint (open on baseline) */}
            <polyline points="0,170 190,170 190,330 0,330" />
            {/* Left FT Lane Lines */}
            <line x1="190" y1="310" y2="310" />
            <line y1="190" x2="190" y2="190" />
            {/* Left FT Circle (solid half) */}
            <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
            {/* Left FT Circle (dashed half) */}
            <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
            <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
            <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
            {/* Left Corner 3 Lines */}
            <line x1="280" y1="480" x2="280" y2="500" />
            <line x1="280" x2="280" y2="20" />
            {/* Left Restricted Area */}
            <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
            {/* Left Lane Tick Marks */}
            <line x1="145" y1="310" x2="145" y2="318" />
            <line x1="115" y1="310" x2="115" y2="318" />
            <line x1="85" y1="310" x2="85" y2="318" />
            <line x1="70" y1="310" x2="70" y2="318" />
            <line x1="145" y1="182" x2="145" y2="190" />
            <line x1="115" y1="182" x2="115" y2="190" />
            <line x1="85" y1="182" x2="85" y2="190" />
            <line x1="70" y1="182" x2="70" y2="190" />
            {/* Left Backboard */}
            <line x1="40" y1="222" x2="40" y2="278" stroke="#333" />
            {/* Left Basket */}
            <circle cx="48" cy="250" r="7.5" stroke="#e65100" />

            {/* Center Line */}
            <line x1="470" x2="470" y2="500" />
            {/* Center Circle */}
            <circle cx="470" cy="250" r="60" />
            <circle cx="470" cy="250" r="20" />

            {/* Right 3-Point Line */}
            <path d="M940,470h-140s-150,-55,-150,-220,150,-220,150,-220h140" />
            {/* Right Paint (open on baseline) */}
            <polyline points="940,330 750,330 750,170 940,170" />
            {/* Right FT Lane Lines */}
            <line x1="750" y1="190" x2="940" y2="190" />
            <line x1="940" y1="310" x2="750" y2="310" />
            {/* Right FT Circle (solid half) */}
            <path d="M750,310c-33.14,0-60-26.86-60-60s26.86-60,60-60" />
            {/* Right FT Circle (dashed half) */}
            <path d="M750,190c1.6,0,3.18.06,4.75.19" />
            <path d="M762.23,191.25c27.27,5.65,47.77,29.81,47.77,58.75s-22.39,55.27-51.49,59.4" strokeDasharray="9.58 7.56" />
            <path d="M754.75,309.81c-1.57.12-3.15.19-4.75.19" />
            {/* Right Corner 3 Lines */}
            <line x1="660" y1="20" x2="660" />
            <line x1="660" y1="500" x2="660" y2="480" />
            {/* Right Restricted Area */}
            <path d="M900,210h-12.5c-22.09,0-40,17.91-40,40s17.91,40,40,40h12.5" />
            {/* Right Lane Tick Marks */}
            <line x1="795" y1="190" x2="795" y2="182" />
            <line x1="825" y1="190" x2="825" y2="182" />
            <line x1="855" y1="190" x2="855" y2="182" />
            <line x1="870" y1="190" x2="870" y2="182" />
            <line x1="795" y1="318" x2="795" y2="310" />
            <line x1="825" y1="318" x2="825" y2="310" />
            <line x1="855" y1="318" x2="855" y2="310" />
            <line x1="870" y1="318" x2="870" y2="310" />
            {/* Right Backboard */}
            <line x1="900" y1="278" x2="900" y2="222" stroke="#333" />
            {/* Right Basket */}
            <circle cx="892" cy="250" r="7.5" stroke="#e65100" />
        </g>
    </>
);
