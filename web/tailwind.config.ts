import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─── SSOLAP 하이엔드 메탈릭 디자인 시스템 ─────────────────────────
      colors: {
        // 기본 팔레트
        ssolap: {
          black:      '#0A0A14',   // 최심 배경
          dark:       '#0F0F1A',   // 카드 배경
          surface:    '#1A1A2A',   // 서피스
          border:     '#2A2A3A',   // 기본 테두리
          muted:      '#3A3A4A',   // 비활성 텍스트
          subtle:     '#4A4A5A',   // 서브텍스트

          // 시그니처 메탈릭 컬러
          silver:     '#8EA4BC',   // 차가운 실버
          'silver-light': '#C8D8E8', // 하이라이트 실버
          gunmetal:   '#2A3A4A',   // 건메탈
          chrome:     '#B0C4DE',   // 크롬

          // 액션 컬러
          primary:    '#8EA4BC',   // 주요 액션
          'primary-glow': '#B0C4DE40',
        },

        // 상태 컬러
        status: {
          success:  '#3D7A3D',
          warning:  '#7A5A1A',
          danger:   '#7A1A1A',
          info:     '#1A3A7A',
        },
      },

      // ─── 폰트 ──────────────────────────────────────────────────────────
      fontFamily: {
        sans:  ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },

      // ─── 간격 ──────────────────────────────────────────────────────────
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '112': '28rem',
        '128': '32rem',
      },

      // ─── 테두리 ────────────────────────────────────────────────────────
      // SSOLAP 정책: 모서리 없음 (borderRadius 사용 금지)
      borderRadius: {
        none: '0',
        // 예외적으로 pill 형태만 허용 (뱃지류)
        full: '9999px',
      },

      // ─── 그림자 (글로우 효과) ──────────────────────────────────────────
      boxShadow: {
        'glow-silver': '0 0 20px #8EA4BC40',
        'glow-chrome': '0 0 30px #B0C4DE30',
        'glow-sm':     '0 0 8px #8EA4BC30',
        'inner-dark':  'inset 0 2px 8px #00000080',
      },

      // ─── 애니메이션 ────────────────────────────────────────────────────
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px #8EA4BC30' },
          '50%':      { boxShadow: '0 0 25px #8EA4BC60' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'metal-shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'pulse-glow':    'pulse-glow 2s ease-in-out infinite',
        'slide-up':      'slide-up 0.2s ease-out',
        'fade-in':       'fade-in 0.15s ease-out',
        'metal-shimmer': 'metal-shimmer 3s linear infinite',
      },

      // ─── 배경 그라디언트 ────────────────────────────────────────────────
      backgroundImage: {
        'metal-linear': 'linear-gradient(135deg, #1A2A3A 0%, #0A0A14 50%, #1A1A2A 100%)',
        'metal-radial': 'radial-gradient(ellipse at top left, #2A3A4A, #0A0A14)',
        'silver-shine': 'linear-gradient(90deg, transparent, #8EA4BC20, transparent)',
      },
    },
  },
  plugins: [],
};

export default config;
