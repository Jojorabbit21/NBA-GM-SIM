
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Surface ───────────────────────────────────────────────
        surface: {
          background: '#18181B',          // zinc-900  앱 전체 배경
          sidebar:    '#18181B',          // zinc-900  사이드바
          card:       '#27272A',          // zinc-800  카드·패널
          elevated:   '#27272A',          // zinc-800  드롭다운·모달
          hover:      '#52525B',          // zinc-600  불투명 호버
          disabled:   '#3F3F46',          // zinc-700  비활성 배경
          flat:       'rgba(9,9,11,0.4)', // zinc/transparent-40
          sunken:     'rgba(9,9,11,0.6)', // zinc/transparent-60
          subtle:     'rgba(9,9,11,0.2)', // zinc/transparent-20
        },
        // ── Overlay ───────────────────────────────────────────────
        overlay: {
          dim: 'rgba(9,9,11,0.8)',        // zinc/transparent-80  모달 딤
        },
        // ── Border ────────────────────────────────────────────────
        border: {
          dim:      '#27272A',                    // zinc-800  레이아웃 셸 구분선
          default:  '#3F3F46',                    // zinc-700  카드·패널 테두리
          emphasis: '#52525B',                    // zinc-600  강조 테두리
          subtle:   'rgba(255,255,255,0.05)',      // white/5   연한 구분
          subtler:  'rgba(255,255,255,0.10)',      // white/10  좀 더 진한 구분
          inverse:  '#E4E4E7',                    // zinc-200  라이트 컴포넌트 보더
        },
        // ── Text ──────────────────────────────────────────────────
        text: {
          primary:   '#FAFAFA',           // zinc-50   주 텍스트
          secondary: '#E4E4E7',           // zinc-200  보조 텍스트
          muted:     '#A1A1AA',           // zinc-400  흐린 텍스트
          disabled:  '#71717A',           // zinc-500  비활성 레이블
          inverse:   '#27272A',           // zinc-800  라이트 배경 위 다크 텍스트
          link:      '#F59E0B',           // amber-500 링크 텍스트
        },
        // ── CTA (인디고 고정) ──────────────────────────────────────
        cta: {
          subtle:   '#A5B4FC',            // indigo-300  Loading 텍스트
          border:   '#818CF8',            // indigo-400  보더
          default:  '#6366F1',            // indigo-500  Hover·Loading 배경
          strong:   '#4F46E5',            // indigo-600  Default 배경 그라디언트 시작
          stronger: '#3730A3',            // indigo-800  Default 배경 그라디언트 끝
          muted:    'rgba(99,102,241,0.1)', // indigo-500/10
        },
        // ── Status ────────────────────────────────────────────────
        status: {
          success: {
            default: '#10B981',                   // emerald-500
            strong:  '#059669',                   // emerald-600
            text:    '#34D399',                   // emerald-400
            muted:   'rgba(16,185,129,0.1)',
          },
          danger: {
            default: '#EF4444',                   // red-500
            strong:  '#DC2626',                   // red-600
            deeper:  '#B91C1C',                   // red-700
            border:  '#F87171',                   // red-400
            text:    '#F87171',                   // red-400
            subtle:  '#FCA5A5',                   // red-300
            muted:   'rgba(239,68,68,0.1)',
          },
          warning: {
            default: '#F59E0B',                   // amber-500
            strong:  '#D97706',                   // amber-600
            text:    '#FBBF24',                   // amber-400
            muted:   'rgba(245,158,11,0.1)',
          },
          info: {
            default: '#0EA5E9',                   // sky-500
            strong:  '#0284C7',                   // sky-600
            text:    '#38BDF8',                   // sky-400
            muted:   'rgba(14,165,233,0.1)',
          },
        },
        // ── Attribute (선수 능력치 등급) ───────────────────────────
        attribute: {
          s: '#E879F9',                   // fuchsia-400  97+
          a: '#34D399',                   // emerald-300  88+
          b: '#FBBF24',                   // amber-400    77+
          c: '#A1A1AA',                   // zinc-400     66+
          d: '#71717A',                   // zinc-500     ~65
        },
        // ── Rank (순위 메달) ───────────────────────────────────────
        rank: {
          gold:   '#FBBF24',              // amber-400  1위
          silver: '#D4D4D8',              // zinc-300   2위
          bronze: '#B45309',              // amber-700  3위
        },
        // ── OVR Badge 배경 ─────────────────────────────────────────
        ovr: {
          s:        '#C026D3',            // fuchsia-600
          'a-plus': '#9333EA',            // purple-600
          a:        '#7C3AED',            // violet-600
          'b-plus': '#059669',            // emerald-600
          b:        '#65A30D',            // lime-600
          c:        '#D97706',            // amber-600
          d:        '#52525B',            // zinc-600
        },
      },
      // ── Typography ──────────────────────────────────────────────
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],  // Caption / Label 10px
      },
      // ── Font Family ─────────────────────────────────────────────
      fontFamily: {
        'sans':    ['Pretendard Variable', 'Pretendard', 'sans-serif'],
        'sport':   ['Pretendard Variable', 'Pretendard', 'sans-serif'], // legacy alias
        'display': ['Bebas Neue', 'sans-serif'],   // OVR badge 숫자
        'digital': ['"Seven Segment"', 'monospace'],
      },
      // ── Elevation / Shadow ──────────────────────────────────────
      boxShadow: {
        'elevation-sm': '0 1px 3px rgba(0,0,0,0.4)',
        'elevation-md': '0 4px 12px rgba(0,0,0,0.5)',
        'elevation-lg': '0 8px 32px rgba(0,0,0,0.6)',
        // Legacy
        'glow-accent':  '0 0 15px rgba(99,102,241,0.5)',
        'glow-success': '0 0 8px rgba(16,185,129,0.5)',
        'glow-ovr':     '0 0 25px rgba(232,121,249,0.9)',
        'glow-toast':   '0 0 10px rgba(99,102,241,0.5)',
      },
    },
  },
  plugins: [],
}
