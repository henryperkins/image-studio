// Tailwind v4 uses CSS-first config via @theme/@layer.
// Keep this minimal: only mode + optional plugin stubs for tooling.
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  // No `content` needed with @tailwindcss/vite + CSS tokens.
  theme: {},
  plugins: []
};

export default config;
