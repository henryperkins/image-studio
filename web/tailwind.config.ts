// Tailwind v4 uses CSS-first configuration via @theme and @layer.
// This minimal config exists only for tooling (e.g., shadcn/ui CLI)
// and deliberately avoids duplicating theme tokens defined in CSS.
import type { Config } from 'tailwindcss';

const config: Config = {
  // No content/globs needed in v4 when using @tailwindcss/vite
  darkMode: 'class',
  theme: {},
  plugins: []
};

export default config;
