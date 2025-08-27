// PaletteGenerator.js
// Alternative palette extraction: Median Cut, Octree, Vibrant swatches.

/** @typedef {{r:number,g:number,b:number}} RGB */
const clamp = (n, min, max) => (n < min ? min : n > max ? max : n);
const toHex = (r, g, b) => '#' + [r, g, b].map(x => clamp(x, 0, 255).toString(16).padStart(2, '0').toUpperCase()).join('');
const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > .5 ? d / (2 - max - min) : d / (max + min);
        switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
        h /= 6;
    }
    return { h: Math.round(h * 360), s, l };
};

/** Sample pixels from ImageData (stride for speed) */
function samplePixels(imageData, step = 4) {
    const { data, width, height } = imageData;
    const px = [];
    // Skip alpha-transparent pixels; stride to cut work
    for (let y = 0; y < height; y += Math.max(1, Math.floor(step / 2))) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) << 2;
            const a = data[i + 3];
            if (a < 16) continue;
            px.push([data[i], data[i + 1], data[i + 2]]);
        }
    }
    return px;
}

/** ---------- Median Cut ---------- */
function medianCutQuant(pixels, count) {
    // Buckets hold pixels and channel extents
    let buckets = [{
        px: pixels,
        rmin: 255, rmax: 0, gmin: 255, gmax: 0, bmin: 255, bmax: 0
    }];

    const updateExtents = (b) => {
        b.rmin = b.gmin = b.bmin = 255;
        b.rmax = b.gmax = b.bmax = 0;
        for (const [r, g, bv] of b.px) {
            if (r < b.rmin) b.rmin = r; if (r > b.rmax) b.rmax = r;
            if (g < b.gmin) b.gmin = g; if (g > b.gmax) b.gmax = g;
            if (bv < b.bmin) b.bmin = bv; if (bv > b.bmax) b.bmax = bv;
        }
    };
    updateExtents(buckets[0]);

    while (buckets.length < count) {
        // Pick bucket with largest range
        buckets.sort((a, b) => Math.max(b.rmax - b.rmin, b.gmax - b.gmin, b.bmax - b.bmin) -
            Math.max(a.rmax - a.rmin, a.gmax - a.gmin, a.bmax - a.bmin));
        const b = buckets.shift();
        if (!b || b.px.length <= 1) break;

        const rRange = b.rmax - b.rmin, gRange = b.gmax - b.gmin, bRange = b.bmax - b.bmin;
        const chan = rRange >= gRange && rRange >= bRange ? 0 : (gRange >= bRange ? 1 : 2);
        b.px.sort((p1, p2) => p1[chan] - p2[chan]);
        const mid = b.px.length >> 1;
        const left = { px: b.px.slice(0, mid) };
        const right = { px: b.px.slice(mid) };
        updateExtents(left); updateExtents(right);
        buckets.push(left, right);
    }

    // Average each bucket
    return buckets.map(b => {
        let r = 0, g = 0, bl = 0;
        for (const p of b.px) { r += p[0]; g += p[1]; bl += p[2]; }
        const n = Math.max(1, b.px.length);
        const R = Math.round(r / n), G = Math.round(g / n), B = Math.round(bl / n);
        return { r: R, g: G, b: B, hex: toHex(R, G, B), hsl: rgbToHsl(R, G, B) };
    });
}

/**
 * Median Cut palette
 * @param {ImageData} imageData
 * @param {number} count
 * @returns {{r:number,g:number,b:number,hex:string,hsl:{h:number,s:number,l:number}}[]}
 */
export function medianCut(imageData, count = 5) {
    const px = samplePixels(imageData, 4);
    return medianCutQuant(px, clamp(count, 2, 16));
}

/** ---------- Octree Quantization ---------- */
class OctreeNode {
    constructor(level = 0) {
        this.level = level;
        this.count = 0;
        this.rsum = 0; this.gsum = 0; this.bsum = 0;
        this.children = new Array(8).fill(null);
        this.leaf = (level === 8);
        this.next = null; // reducer list
    }
}
class Octree {
    constructor() {
        this.root = new OctreeNode(0);
        this.levels = Array.from({ length: 9 }, () => ({ head: null }));
        this.leafCount = 0;
    }
    _indexFor(r, g, b, level) {
        const shift = 7 - level;
        const rbit = (r >> shift) & 1;
        const gbit = (g >> shift) & 1;
        const bbit = (b >> shift) & 1;
        return (rbit << 2) | (gbit << 1) | bbit;
    }
    _addToLevelList(node) {
        const list = this.levels[node.level];
        node.next = list.head;
        list.head = node;
    }
    insert(r, g, b) {
        let node = this.root;
        for (let level = 0; level < 8; level++) {
            const idx = this._indexFor(r, g, b, level);
            if (!node.children[idx]) {
                node.children[idx] = new OctreeNode(level + 1);
                this._addToLevelList(node.children[idx]);
            }
            node = node.children[idx];
        }
        if (node.leaf) {
            node.count++;
            node.rsum += r; node.gsum += g; node.bsum += b;
            if (node.count === 1) this.leafCount++;
        }
    }
    reduce(targetLeaves) {
        for (let level = 7; level >= 0 && this.leafCount > targetLeaves; level--) {
            let node = this.levels[level + 1].head;
            while (node) {
                const next = node.next;
                if (node.leaf && node.count > 0) { node = next; continue; }
                // Merge children into parent
                let r = 0, g = 0, b = 0, count = 0, hadChild = false;
                for (let i = 0; i < 8; i++) {
                    const ch = node.children[i];
                    if (!ch) continue;
                    hadChild = true;
                    r += ch.rsum; g += ch.gsum; b += ch.bsum; count += ch.count;
                    if (ch.leaf && ch.count > 0) this.leafCount--;
                    node.children[i] = null;
                }
                if (hadChild) {
                    node.leaf = true;
                    node.rsum += r; node.gsum += g; node.bsum += b; node.count += count;
                    if (node.count > 0) this.leafCount++;
                }
                node = next;
            }
        }
    }
    palette(max) {
        const out = [];
        const collect = (n) => {
            if (!n) return;
            if (n.leaf && n.count > 0) {
                const R = Math.round(n.rsum / n.count);
                const G = Math.round(n.gsum / n.count);
                const B = Math.round(n.bsum / n.count);
                out.push({ r: R, g: G, b: B, hex: toHex(R, G, B), hsl: rgbToHsl(R, G, B) });
            } else {
                for (const c of n.children) collect(c);
            }
        };
        collect(this.root);
        out.sort((a, b) => b.hsl.s - a.hsl.s); // slight preference
        return out.slice(0, max);
    }
}

/**
 * Octree quantization palette
 * @param {ImageData} imageData
 * @param {number} count
 */
export function octreeQuantization(imageData, count = 5) {
    const tree = new Octree();
    const { data } = imageData;
    // Sample moderately for speed
    for (let i = 0; i < data.length; i += 16) {
        const a = data[i + 3];
        if (a < 16) continue;
        tree.insert(data[i], data[i + 1], data[i + 2]);
    }
    if (tree.leafCount > count) tree.reduce(count);
    return tree.palette(count);
}

/** ---------- Vibrant swatches (Android Palette-like) ---------- */
/**
 * Pick representative swatches: vibrant/dark/light + muted variants.
 * Strategy: take 48 quantized colors, score by saturation & luma windows.
 * @param {ImageData} imageData
 * @returns {{
 *  dominant?: any, vibrant?: any, lightVibrant?: any, darkVibrant?: any,
 *  muted?: any, lightMuted?: any, darkMuted?: any, all: any[]
 * }}
 */
export function vibrantColors(imageData) {
    const base = octreeQuantization(imageData, 48);
    if (base.length === 0) return { all: [] };
    // Dominant: most frequent-ish — octree doesn’t track counts here, so approximate by luma closeness & saturation
    const dominant = base[0];

    const pick = (pred, score) => {
        let best = null, bestScore = -Infinity;
        for (const c of base) {
            if (!pred(c)) continue;
            const s = score(c);
            if (s > bestScore) { best = c; bestScore = s; }
        }
        return best || null;
    };
    const sWeight = 1.4, lWeight = 1.0;

    const vibrant = pick(
        c => c.hsl.s >= 0.5 && c.hsl.l >= 0.35 && c.hsl.l <= 0.7,
        c => sWeight * c.hsl.s - Math.abs(0.55 - c.hsl.l) * lWeight
    );
    const lightVibrant = pick(
        c => c.hsl.s >= 0.5 && c.hsl.l > 0.7,
        c => sWeight * c.hsl.s - Math.abs(0.82 - c.hsl.l) * lWeight
    );
    const darkVibrant = pick(
        c => c.hsl.s >= 0.5 && c.hsl.l < 0.35,
        c => sWeight * c.hsl.s - Math.abs(0.25 - c.hsl.l) * lWeight
    );
    const muted = pick(
        c => c.hsl.s < 0.4 && c.hsl.l >= 0.35 && c.hsl.l <= 0.7,
        c => (0.4 - c.hsl.s) - Math.abs(0.5 - c.hsl.l)
    );
    const lightMuted = pick(
        c => c.hsl.s < 0.4 && c.hsl.l > 0.7,
        c => (0.4 - c.hsl.s) - Math.abs(0.82 - c.hsl.l)
    );
    const darkMuted = pick(
        c => c.hsl.s < 0.4 && c.hsl.l < 0.35,
        c => (0.4 - c.hsl.s) - Math.abs(0.22 - c.hsl.l)
    );

    return {
        dominant, vibrant, lightVibrant, darkVibrant, muted, lightMuted, darkMuted,
        all: base
    };
}
