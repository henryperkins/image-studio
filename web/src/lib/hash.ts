// Lightweight hashing helpers with safe fallbacks for insecure contexts
// - Uses Web Crypto SHA-256 when available (secure contexts like https/localhost)
// - Falls back to a fast non-cryptographic 64-bit hash for dedupe only

/**
 * Compute a stable hex hash for text.
 * Prefers SHA-256 via Web Crypto; falls back to a 64-bit non-crypto hash
 * in environments where `crypto.subtle` is unavailable (e.g., mobile over http).
 */
export async function hashText(text: string): Promise<string> {
  const te = new TextEncoder();
  const data = te.encode(text);

  try {
    if (typeof globalThis !== 'undefined') {
      const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
      if (cryptoObj?.subtle?.digest) {
        const buf = await cryptoObj.subtle.digest('SHA-256', data);
        const arr = Array.from(new Uint8Array(buf));
        return arr.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    }
  } catch {
    // fall through to non-crypto path
  }

  // Fallback: fast 64-bit non-cryptographic hash (sufficient for dedupe keys)
  return nonCryptoHash64Hex(text);
}

/**
 * UUID generator with a safe fallback if `crypto.randomUUID` is unavailable.
 */
export function safeRandomUUID(): string {
  try {
    if (typeof globalThis !== 'undefined') {
      const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
      if (cryptoObj?.randomUUID) {
        return cryptoObj.randomUUID();
      }
    }
  } catch {
    // ignore
  }
  // RFC4122 v4-ish fallback using Math.random (not cryptographically secure)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --------- Internals ---------

function nonCryptoHash64Hex(input: string): string {
  // Two 32-bit accumulators with different seeds
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const lo = (h1 >>> 0).toString(16).padStart(8, '0');
  const hi = (h2 >>> 0).toString(16).padStart(8, '0');
  return hi + lo;
}
