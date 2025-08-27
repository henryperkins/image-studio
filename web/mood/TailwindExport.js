/**
 * Tailwind Export Module - Generates Tailwind CSS v4 themes and v3 configs
 * Self-contained version without external dependencies
 */

/**
 * Sanitizes a color name for use as CSS custom property or JS object key
 */
function sanitizeColorName(name, mode = 'css') {
  if (!name) return '';
  
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  
  if (mode === 'css' && /^[0-9]/.test(sanitized)) {
    sanitized = 'c-' + sanitized;
  }
  
  if (mode === 'js') {
    sanitized = sanitized.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  return sanitized || 'color';
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  };
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  
  const tc = [hk + 1/3, hk, hk - 1/3].map(v => (v + 1) % 1);
  const c = tc.map(t => 
    t < 1/6 ? p + (q - p) * 6 * t :
    t < 1/2 ? q :
    t < 2/3 ? p + (q - p) * (2/3 - t) * 6 :
    p
  );
  
  return {
    r: Math.round(c[0] * 255),
    g: Math.round(c[1] * 255),
    b: Math.round(c[2] * 255)
  };
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Convert RGB to OKLCH
 * Based on the OKLCH color space used in Tailwind v4
 */
function rgbToOklch(r, g, b) {
  // Normalize RGB values
  r /= 255;
  g /= 255;
  b /= 255;
  
  // Convert to linear RGB
  const linearize = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  
  // Convert to OKLab
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b_oklab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  
  // Convert to OKLCH
  const C = Math.sqrt(a * a + b_oklab * b_oklab);
  let H = Math.atan2(b_oklab, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  
  return {
    l: Math.max(0, Math.min(1, L)),
    c: Math.max(0, C),
    h: H
  };
}

/**
 * Format OKLCH value for CSS
 */
function formatOklch(l, c, h) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(3)})`;
}

/**
 * Generate a color scale from a base hex color
 * Returns both hex and OKLCH values for flexibility
 */
function generateColorScale(hex, format = 'hex') {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  
  const levels = {
    50: 98,
    100: 95,
    200: 90,
    300: 82,
    400: 70,
    500: 50,
    600: 40,
    700: 30,
    800: 20,
    900: 10,
    950: 5
  };
  
  const scale = {};
  
  for (const [key, lightness] of Object.entries(levels)) {
    const saturation = Math.max(10, Math.min(100, 
      key <= 300 ? s * 0.9 : 
      key >= 800 ? s * 0.85 : 
      s
    ));
    
    const rgb = hslToRgb(h, saturation, lightness);
    
    if (format === 'oklch') {
      const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
      scale[key] = formatOklch(oklch.l, oklch.c, oklch.h);
    } else {
      scale[key] = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }
  
  return scale;
}

/**
 * Calculate relative luminance for contrast calculation
 */
function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio
 */
function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine the best text color (white or black) for a background
 */
function getAccessibleTextColor(bgHex) {
  const whiteContrast = getContrastRatio(bgHex, '#ffffff');
  const blackContrast = getContrastRatio(bgHex, '#000000');
  return whiteContrast > blackContrast ? '#ffffff' : '#000000';
}

/**
 * Group colors by similarity and purpose
 */
function groupColors(colors) {
  const groups = {
    brand: [],
    accent: [],
    neutral: [],
    semantic: [],
    custom: []
  };
  
  const seen = new Set();
  
  for (const color of colors) {
    if (seen.has(color.hex)) continue;
    seen.add(color.hex);
    
    const name = (color.name || '').toLowerCase();
    const { r, g, b } = hexToRgb(color.hex);
    const { s } = rgbToHsl(r, g, b);
    
    // Categorize based on name and saturation
    if (name.includes('brand') || name.includes('primary')) {
      groups.brand.push(color);
    } else if (name.includes('accent') || name.includes('secondary')) {
      groups.accent.push(color);
    } else if (name.includes('neutral') || name.includes('gray') || s < 10) {
      groups.neutral.push(color);
    } else if (name.includes('success') || name.includes('error') || 
               name.includes('warning') || name.includes('info')) {
      groups.semantic.push(color);
    } else {
      groups.custom.push(color);
    }
  }
  
  // If no brand colors, use first color as brand
  if (groups.brand.length === 0 && colors.length > 0) {
    groups.brand.push(colors[0]);
  }
  
  return groups;
}

/**
 * Build Tailwind v4 CSS theme
 */
export function buildTailwindV4Theme(colors, options = {}) {
  const {
    generateScales = true,
    includeSemantics = true,
    includeDarkMode = true,
    includeAccessibility = true,
    colorFormat = 'oklch' // 'oklch' or 'hex'
  } = options;
  
  const groups = groupColors(colors);
  const tokens = [];
  const darkTokens = [];
  
  // Helper to format color value
  const formatColor = (hex) => {
    if (colorFormat === 'oklch') {
      const { r, g, b } = hexToRgb(hex);
      const oklch = rgbToOklch(r, g, b);
      return formatOklch(oklch.l, oklch.c, oklch.h);
    }
    return hex;
  };
  
  // Generate brand colors
  if (groups.brand.length > 0) {
    const brandBase = groups.brand[0];
    if (generateScales) {
      const scale = generateColorScale(brandBase.hex, colorFormat);
      for (const [key, value] of Object.entries(scale)) {
        tokens.push(`  --color-brand-${key}: ${value};`);
      }
    } else {
      tokens.push(`  --color-brand: ${formatColor(brandBase.hex)};`);
    }
  }
  
  // Generate accent colors
  if (groups.accent.length > 0) {
    const accentBase = groups.accent[0];
    if (generateScales) {
      const scale = generateColorScale(accentBase.hex, colorFormat);
      for (const [key, value] of Object.entries(scale)) {
        tokens.push(`  --color-accent-${key}: ${value};`);
      }
    } else {
      tokens.push(`  --color-accent: ${formatColor(accentBase.hex)};`);
    }
  }
  
  // Generate neutral colors
  if (groups.neutral.length > 0) {
    const neutralBase = groups.neutral[0];
    if (generateScales) {
      const scale = generateColorScale(neutralBase.hex, colorFormat);
      for (const [key, value] of Object.entries(scale)) {
        tokens.push(`  --color-neutral-${key}: ${value};`);
      }
    } else {
      tokens.push(`  --color-neutral: ${formatColor(neutralBase.hex)};`);
    }
  }
  
  // Add custom colors
  for (const color of groups.custom) {
    const name = sanitizeColorName(color.name || 'custom', 'css');
    tokens.push(`  --color-${name}: ${formatColor(color.hex)};`);
    if (includeAccessibility && colorFormat === 'hex') {
      const textColor = getAccessibleTextColor(color.hex);
      tokens.push(`  --color-${name}-text: ${textColor}; /* contrast: ${getContrastRatio(color.hex, textColor).toFixed(2)} */`);
    }
  }
  
  // Add semantic colors
  if (includeSemantics) {
    tokens.push('');
    tokens.push('  /* Semantic aliases */');
    tokens.push('  --color-bg: var(--color-neutral-50, #ffffff);');
    tokens.push('  --color-bg-secondary: var(--color-neutral-100, #f9fafb);');
    tokens.push('  --color-fg: var(--color-neutral-900, #111827);');
    tokens.push('  --color-fg-secondary: var(--color-neutral-700, #374151);');
    tokens.push('  --color-border: var(--color-neutral-200, #e5e7eb);');
    tokens.push('  --color-primary: var(--color-brand-500, var(--color-brand));');
    tokens.push('  --color-primary-hover: var(--color-brand-600, var(--color-brand));');
    
    // Dark mode semantics
    if (includeDarkMode) {
      darkTokens.push('  --color-bg: var(--color-neutral-950, #030712);');
      darkTokens.push('  --color-bg-secondary: var(--color-neutral-900, #111827);');
      darkTokens.push('  --color-fg: var(--color-neutral-50, #f9fafb);');
      darkTokens.push('  --color-fg-secondary: var(--color-neutral-300, #d1d5db);');
      darkTokens.push('  --color-border: var(--color-neutral-800, #1f2937);');
      darkTokens.push('  --color-primary: var(--color-brand-400, var(--color-brand));');
      darkTokens.push('  --color-primary-hover: var(--color-brand-300, var(--color-brand));');
    }
  }
  
  // Build final CSS
  let css = `/* Generated by Mood Palette - Tailwind CSS v4 Theme
 * Integration:
 *   1. Save this as 'tailwind-theme.css' in your project
 *   2. Import BEFORE @tailwind utilities in your main CSS:
 *      @import './tailwind-theme.css';
 *      @import 'tailwindcss';
 */

@theme {
${tokens.join('\n')}
}`;

  if (includeDarkMode && darkTokens.length > 0) {
    css += `\n\n@media (prefers-color-scheme: dark) {
  @theme {
${darkTokens.map(t => '  ' + t).join('\n')}
  }
}`;
  }
  
  css += `\n\n/* Usage examples:
 * <div class="bg-[--color-bg] text-[--color-fg]">Content</div>
 * <button class="bg-brand-500 hover:bg-brand-600">Click me</button>
 * <div class="border-[--color-border]">Card</div>
 */`;
  
  return css;
}

/**
 * Build Tailwind v3 JavaScript config
 */
export function buildTailwindV3Config(colors, options = {}) {
  const { generateScales = true, format = 'esm' } = options;
  const groups = groupColors(colors);
  const colorConfig = {};
  
  // Build brand colors
  if (groups.brand.length > 0) {
    const brandBase = groups.brand[0];
    if (generateScales) {
      colorConfig.brand = generateColorScale(brandBase.hex);
    } else {
      colorConfig.brand = brandBase.hex;
    }
  }
  
  // Build accent colors
  if (groups.accent.length > 0) {
    const accentBase = groups.accent[0];
    if (generateScales) {
      colorConfig.accent = generateColorScale(accentBase.hex);
    } else {
      colorConfig.accent = accentBase.hex;
    }
  }
  
  // Build neutral colors
  if (groups.neutral.length > 0) {
    const neutralBase = groups.neutral[0];
    if (generateScales) {
      colorConfig.neutral = generateColorScale(neutralBase.hex);
    } else {
      colorConfig.neutral = neutralBase.hex;
    }
  }
  
  // Add custom colors
  for (const color of groups.custom) {
    const name = sanitizeColorName(color.name || 'custom', 'js');
    colorConfig[name] = color.hex;
  }
  
  // Format as JavaScript
  const colorsJson = JSON.stringify(colorConfig, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'");
  
  const exportStatement = format === 'cjs' 
    ? 'module.exports ='
    : 'export default';
  
  return `/** 
 * Generated by Mood Palette - Tailwind v3 Config
 * Add to your tailwind.config.js:
 * 
 * const colors = require('./tailwind-colors.js');
 * // or: import colors from './tailwind-colors.js';
 * 
 * module.exports = {
 *   theme: {
 *     extend: {
 *       colors: colors
 *     }
 *   }
 * }
 */

${exportStatement} ${colorsJson};`;
}

/**
 * Main export function for Tailwind formats
 */
export function exportTailwind(colors, version = 'v4', options = {}) {
  if (version === 'v4') {
    return {
      content: buildTailwindV4Theme(colors, options),
      filename: 'tailwind-theme.css',
      mimetype: 'text/css'
    };
  } else {
    return {
      content: buildTailwindV3Config(colors, options),
      filename: 'tailwind-colors.js',
      mimetype: 'application/javascript'
    };
  }
}