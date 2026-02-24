
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}", // 루트에 있는 App.tsx, index.tsx 등을 포함
  ],
  theme: {
    extend: {
      // === 시맨틱 색상 토큰 (기존 Tailwind 클래스와 공존) ===
      colors: {
        // 배경 (Surfaces)
        surface: {
          DEFAULT: '#0f172a',             // slate-950 — 전체 배경
          card: '#1e293b',                // slate-900 — 카드/패널
          glass: 'rgba(30, 41, 59, 0.8)', // slate-900/80 — 유리 효과
          flat: 'rgba(15, 23, 42, 0.5)',  // slate-950/50 — 플랫
          hover: 'rgba(255, 255, 255, 0.05)', // white/5 — 호버 오버레이
        },
        // 테두리 (Borders)
        line: {
          DEFAULT: '#1e293b',             // slate-800
          emphasis: '#334155',            // slate-700
          subtle: 'rgba(255, 255, 255, 0.05)',  // white/5
          subtler: 'rgba(255, 255, 255, 0.1)',  // white/10
        },
        // 브랜드 액센트
        accent: {
          DEFAULT: '#6366f1',             // indigo-500
          hover: '#818cf8',               // indigo-400
          strong: '#4f46e5',              // indigo-600
          muted: 'rgba(99, 102, 241, 0.1)', // indigo-500/10
        },
        // 상태: 성공
        success: {
          DEFAULT: '#10b981',             // emerald-500
          strong: '#059669',              // emerald-600
          text: '#34d399',                // emerald-400
          muted: 'rgba(16, 185, 129, 0.1)',
        },
        // 상태: 위험
        danger: {
          DEFAULT: '#ef4444',             // red-500
          strong: '#dc2626',              // red-600
          text: '#f87171',                // red-400
          muted: 'rgba(239, 68, 68, 0.1)',
        },
        // 상태: 경고
        warning: {
          DEFAULT: '#f59e0b',             // amber-500
          text: '#fbbf24',                // amber-400
          muted: 'rgba(245, 158, 11, 0.1)',
        },
        // 상태: 정보
        info: {
          DEFAULT: '#3b82f6',             // blue-500
          text: '#60a5fa',                // blue-400
          muted: 'rgba(59, 130, 246, 0.1)',
        },
        // 텍스트 계층
        content: {
          DEFAULT: '#f8fafc',             // slate-50 (주 텍스트)
          primary: '#f1f5f9',             // slate-100
          secondary: '#e2e8f0',           // slate-200
          tertiary: '#cbd5e1',            // slate-300
          muted: '#94a3b8',               // slate-400
          subtle: '#64748b',              // slate-500
        },
      },
      // === 보더 래디우스 토큰 ===
      borderRadius: {
        'card': '1.5rem',                // 카드 (= rounded-3xl)
        'button': '1rem',                // 버튼 (= rounded-2xl)
        'element': '0.75rem',            // 작은 요소 (= rounded-xl)
      },
      // === 폰트 패밀리 ===
      fontFamily: {
        'sport': ['Oswald', 'sans-serif'],
        'digital': ['"Seven Segment"', 'monospace'],
      },
      // === 글로우 섀도 ===
      boxShadow: {
        'glow-accent': '0 0 15px rgba(99, 102, 241, 0.5)',
        'glow-success': '0 0 8px rgba(16, 185, 129, 0.5)',
        'glow-ovr': '0 0 25px rgba(232, 121, 249, 0.9)',
        'glow-toast': '0 0 10px rgba(99, 102, 241, 0.5)',
      },
    },
  },
  plugins: [],
}
