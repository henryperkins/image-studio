// ImageFilters.js
// Lightweight, in-place-safe image filters that return NEW ImageData.

/** Clamp helper */
const clamp = (n, min, max) => (n < min ? min : n > max ? max : n);

// Fallback stub for environments without ImageData (e.g., lint in Node). Real browser will have native.
// This is minimal and only meant to avoid ReferenceErrors in static analysis; not for actual pixel ops outside browser.
// eslint-disable-next-line no-undef
const ImageDataCtor = typeof ImageData !== 'undefined' ? ImageData : class ImageData {
    constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
};

/**
 * Adjust brightness: value ∈ [-100, 100] where 0=no change.
 * Adds value% of 255 to RGB channels (gamma-naive for speed).
 * @param {ImageData} imageData
 * @param {number} value
 * @returns {ImageData}
 */
export function adjustBrightness(imageData, value = 0) {
    const out = new ImageDataCtor(imageData.width, imageData.height);
    const src = imageData.data, dst = out.data;
    const delta = (value / 100) * 255;
    for (let i = 0; i < src.length; i += 4) {
        dst[i + 0] = clamp(src[i + 0] + delta, 0, 255);
        dst[i + 1] = clamp(src[i + 1] + delta, 0, 255);
        dst[i + 2] = clamp(src[i + 2] + delta, 0, 255);
        dst[i + 3] = src[i + 3];
    }
    return out;
}

/** RGB→HSL and back (fast path) */
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > .5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = ((b - r) / d + 2); break;
            default: h = ((r - g) / d + 4);
        }
        h /= 6;
    }
    return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
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
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}

/**
 * Adjust saturation: value ∈ [-100, 100] where 0=no change.
 * Works in HSL space; preserves luminance and hue.
 * @param {ImageData} imageData
 * @param {number} value
 * @returns {ImageData}
 */
export function adjustSaturation(imageData, value = 0) {
    const out = new ImageDataCtor(imageData.width, imageData.height);
    const src = imageData.data, dst = out.data;
    const factor = clamp(value, -100, 100) / 100; // add percentage to S
    for (let i = 0; i < src.length; i += 4) {
        const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];
        const [h, s, l] = rgbToHsl(r, g, b);
        const ns = clamp(s + factor * (factor > 0 ? (1 - s) : s), 0, 1);
        const [nr, ng, nb] = hslToRgb(h, ns, l);
        dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb; dst[i + 3] = a;
    }
    return out;
}

/**
 * Crop/focus a region from imageData. Returns new ImageData(width, height).
 * Coordinates are in pixel space relative to the source imageData.
 * @param {ImageData} imageData
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function focusRegion(imageData, x, y, width, height) {
    const sx = clamp(Math.floor(x), 0, imageData.width - 1);
    const sy = clamp(Math.floor(y), 0, imageData.height - 1);
    const sw = clamp(Math.floor(width), 1, imageData.width - sx);
    const sh = clamp(Math.floor(height), 1, imageData.height - sy);

    const out = new ImageDataCtor(sw, sh);
    const src = imageData.data, dst = out.data;

    for (let row = 0; row < sh; row++) {
        const srcBase = ((sy + row) * imageData.width + sx) << 2;
        const dstBase = (row * sw) << 2;
        dst.set(src.subarray(srcBase, srcBase + (sw << 2)), dstBase);
    }
    return out;
}
