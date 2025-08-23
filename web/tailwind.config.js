/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['SourceSerif4Variable', 'Source Serif 4', 'serif'],
        mono: ['JetBrainsMonoVariable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['var(--font-size-xs)', { lineHeight: '1.43', letterSpacing: '0.01em' }],
        sm: ['var(--font-size-sm)', { lineHeight: '1.43', letterSpacing: '0' }],
        base: ['var(--font-size-base)', { lineHeight: '1.5', letterSpacing: '0' }],
        md: ['var(--font-size-md)', { lineHeight: '1.4', letterSpacing: '0' }],
        lg: ['var(--font-size-lg)', { lineHeight: '1.33', letterSpacing: '-0.005em' }],
        xl: ['var(--font-size-xl)', { lineHeight: '1.285', letterSpacing: '-0.01em' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: '1.26', letterSpacing: '-0.012em' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: '1.2', letterSpacing: '-0.014em' }],
        '4xl': ['var(--font-size-4xl)', { lineHeight: '1.14', letterSpacing: '-0.015em' }],
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      const utilities = {
        '.font-ui': { 'font-feature-settings': 'var(--ff-ui)' },
        '.font-longform': { 'font-feature-settings': 'var(--ff-longform)', 'font-family': 'var(--font-serif)', 'hyphens': 'auto' },
        '.font-numeric': {
          'font-feature-settings': 'var(--ff-numeric)',
          'font-variant-numeric': 'tabular-nums slashed-zero lining-nums'
        },
        '.font-mono': { 'font-family': 'var(--font-mono)', 'font-feature-settings': '"zero","kern"', 'font-variant-ligatures': 'none' },
        '.tracking-tight-2': { 'letter-spacing': 'var(--track-tight-2)' },
        '.tracking-tight': { 'letter-spacing': 'var(--track-tight)' },
        '.tracking-wide-2': { 'letter-spacing': 'var(--track-wide-2)' },
        '.display-serif': {
          'font-family': 'var(--font-serif)',
          'font-feature-settings': 'var(--ff-ui)',
          'font-optical-sizing': 'auto'
        },
        '.small-caps': {
          'font-variant-caps': 'all-small-caps',
          'letter-spacing': '0.04em'
        },
        '.truncate-2': {
          display: '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden'
        }
      };
      addUtilities(utilities, ['responsive']);
    }
  ],
};