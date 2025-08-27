// ExportFormats.js
// Binary palette exports: ASE (Adobe Swatch Exchange), ACO (Photoshop), plus Sketch JSON.
// Returns Uint8Array for binary formats; string for Sketch JSON.

/** @typedef {{hex:string,name?:string}} ColorLike */

const clamp = (n, min, max) => (n < min ? min : n > max ? max : n);
const toFloatBE = (v) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v, false);
    return new Uint8Array(buf);
};
const u16BE = (n) => new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
const u32BE = (n) => new Uint8Array([
    (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff
]);

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3
        ? h.split('').map(c => c + c).join('')
        : h.padEnd(6, '0').slice(0, 6);
    return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16)
    };
}

/**
 * Adobe Swatch Exchange (ASE) minimal writer.
 * - Header "ASEF" + version 1.0 + blockCount
 * - For each color: type 0x0001, UTF-16BE name, model "RGB ", 4 floats (R,G,B,0), color type (0=global)
 * Spec nuance: string length is u16 count of 16-bit chars INCLUDING the trailing null.
 * @param {ColorLike[]} colors
 * @returns {Uint8Array}
 */
export function toASE(colors) {
    const blocks = colors.map((c, i) => {
        const name = (c.name || `Color ${i + 1}`);
        const nameChars = Array.from(name);
        const nameLen = nameChars.length + 1; // include null terminator
        const nameBuf = new Uint8Array(2 + nameLen * 2);
        nameBuf.set(u16BE(nameLen), 0);
        // UTF-16BE chars
        nameChars.forEach((ch, idx) => {
            const code = ch.codePointAt(0) || 32;
            nameBuf.set(u16BE(code), 2 + idx * 2);
        });
        // trailing null
        nameBuf.set(u16BE(0), 2 + (nameLen - 1) * 2);

        const { r, g, b } = hexToRgb(c.hex);
        const model = new Uint8Array([0x52, 0x47, 0x42, 0x20]); // 'RGB '
        const floats = new Uint8Array([
            ...toFloatBE(r / 255), ...toFloatBE(g / 255), ...toFloatBE(b / 255), ...toFloatBE(0)
        ]);
        const colorType = u16BE(0);

        // Block body = name + model + floats + colorType
        const body = new Uint8Array(nameBuf.length + 4 + 16 + 2);
        body.set(nameBuf, 0);
        body.set(model, nameBuf.length);
        body.set(floats, nameBuf.length + 4);
        body.set(colorType, nameBuf.length + 4 + 16);

        const type = u16BE(0x0001);
        const len = u32BE(body.length);
        const out = new Uint8Array(2 + 4 + body.length);
        out.set(type, 0);
        out.set(len, 2);
        out.set(body, 6);
        return out;
    });

    const signature = new Uint8Array([0x41, 0x53, 0x45, 0x46]); // 'ASEF'
    const version = new Uint8Array([0x00, 0x01, 0x00, 0x00]); // major=1, minor=0
    const blockCount = u32BE(blocks.length);

    const totalLen = 4 + 4 + 4 + blocks.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(totalLen);
    let off = 0;
    out.set(signature, off); off += 4;
    out.set(version, off); off += 4;
    out.set(blockCount, off); off += 4;
    for (const b of blocks) { out.set(b, off); off += b.length; }
    return out;
}

/**
 * Photoshop ACO (v1) writer.
 * v1: [version u16=1][count u16][count * (space u16 + 4*u16 components)]
 * For RGB, components are 0..65535 where 255 -> 65535 (≈ component * 257).
 * @param {ColorLike[]} colors
 * @returns {Uint8Array}
 */
export function toACO(colors) {
    const count = colors.length;
    const header = new Uint8Array([0x00, 0x01, 0x00, count & 0xff]); // version=1, count (big-endian u16)
    header[2] = (count >> 8) & 0xff;

    const body = new Uint8Array(count * 10); // each record: 2 (space) + 8 (4 components)
    let off = 0;
    for (const c of colors) {
        const { r, g, b } = hexToRgb(c.hex);
        const space = u16BE(0); // 0=RGB
        const to16 = (v) => u16BE(clamp(Math.round(v * 257), 0, 65535));

        body.set(space, off); off += 2;
        body.set(to16(r), off); off += 2;
        body.set(to16(g), off); off += 2;
        body.set(to16(b), off); off += 2;
        body.set(u16BE(0), off); off += 2; // unused 4th component
    }

    const out = new Uint8Array(header.length + body.length);
    out.set(header, 0);
    out.set(body, header.length);
    return out;
}

/**
 * Sketch palette JSON (compatible with common plugins and color assets importers)
 * @param {ColorLike[]} colors
 * @returns {string} JSON string
 */
export function toSketchPalette(colors) {
    const entries = colors.map((c, i) => {
        const { r, g, b } = hexToRgb(c.hex);
        return {
            name: c.name || `Color ${i + 1}`,
            red: +(r / 255).toFixed(6),
            green: +(g / 255).toFixed(6),
            blue: +(b / 255).toFixed(6),
            alpha: 1
        };
    });
    return JSON.stringify({
        compatibleVersion: '1.0',
        pluginVersion: '1.0',
        colors: entries
    }, null, 2);
}
