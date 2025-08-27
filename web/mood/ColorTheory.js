// ColorTheory.js
// Color harmony + semantic mood helpers (no deps, ES module)

/** @typedef {{r:number,g:number,b:number}} RGB */
/** @typedef {{h:number,s:number,l:number}} HSL */

/** Clamp helper */
const clamp = (n, min, max) => (n < min ? min : n > max ? max : n);

/** HEX -> RGB */
export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3
        ? h.split('').map(c => c + c).join('')
        : h.padEnd(6, '0').slice(0, 6);
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return { r, g, b };
}

/** RGB -> HEX (#RRGGBB) */
export function rgbToHex(r, g, b) {
    const to2 = (n) => clamp(n, 0, 255).toString(16).padStart(2, '0').toUpperCase();
    return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** RGB -> HSL (0-360, 0-100, 0-100) */
export function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = ((b - r) / d + 2); break;
            default: h = ((r - g) / d + 4); break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL -> RGB */
export function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hk = h / 360;
    const tc = [hk + 1 / 3, hk, hk - 1 / 3].map(v => (v + 1) % 1);
    const c = tc.map(t => {
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    });
    return { r: Math.round(c[0] * 255), g: Math.round(c[1] * 255), b: Math.round(c[2] * 255) };
}

/** Rotate hue by degrees, keep s/l the same */
function rotateHue(hex, deg) {
    const { r, g, b } = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    const h = (hsl.h + deg + 360) % 360;
    const rgb = hslToRgb(h, hsl.s, hsl.l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** Return unique hex array, keep order */
function uniq(hexes) {
    const seen = new Set();
    const out = [];
    for (const h of hexes) {
        const k = h.toUpperCase();
        if (!seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
}

/** Complementary (base, base+180) */
export function getComplementary(hex) {
    return uniq([hex, rotateHue(hex, 180)]);
}

/** Analogous (±30, ±60 around base). Returns 5 colors centered on base */
export function getAnalogous(hex) {
    return uniq([
        rotateHue(hex, -60),
        rotateHue(hex, -30),
        hex,
        rotateHue(hex, 30),
        rotateHue(hex, 60)
    ]);
}

/** Triadic (base, ±120) */
export function getTriadic(hex) {
    return uniq([hex, rotateHue(hex, 120), rotateHue(hex, -120)]);
}

/**
 * Color "mood" heuristics.
 * Returns { temperature: 'Warm|Cool|Neutral', brightness: 'Dark|Mid|Light', energy: 'Calm|Balanced|Vibrant', tags: string[] }
 */
export function getColorMood(hex) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    const tempScore = (r - b) / 255;
    const temperature = tempScore > 0.1 ? 'Warm' : tempScore < -0.1 ? 'Cool' : 'Neutral';
    const brightness = l < 30 ? 'Dark' : l > 70 ? 'Light' : 'Mid';
    const energy = s < 25 ? 'Calm' : s > 65 ? 'Vibrant' : 'Balanced';

    const tags = [];
    if (temperature === 'Warm') tags.push('cozy', 'energetic');
    if (temperature === 'Cool') tags.push('serene', 'fresh');
    if (brightness === 'Dark') tags.push('moody');
    if (brightness === 'Light') tags.push('airy');
    if (energy === 'Calm') tags.push('minimal');
    if (energy === 'Vibrant') tags.push('bold');

    // Simple semantic by hue
    const hueBand = (start, end) => (h >= start && h < end);
    if (hueBand(0, 15) || hueBand(345, 360)) tags.push('passion');
    else if (hueBand(15, 45)) tags.push('optimism');
    else if (hueBand(45, 90)) tags.push('growth');
    else if (hueBand(90, 150)) tags.push('tranquil');
    else if (hueBand(150, 210)) tags.push('tech');
    else if (hueBand(210, 270)) tags.push('trust');
    else if (hueBand(270, 330)) tags.push('creative');
    else tags.push('balanced');

    return { temperature, brightness, energy, tags: uniq(tags) };
}

/** Generate split-complementary (base, +150, -150) */
export function getSplitComplementary(hex) {
    return uniq([hex, rotateHue(hex, 150), rotateHue(hex, -150)]);
}

/** Generate tetradic (base, +60, +180, +240) */
export function getTetradic(hex) {
    return uniq([hex, rotateHue(hex, 60), rotateHue(hex, 180), rotateHue(hex, 240)]);
}
