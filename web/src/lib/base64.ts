// Utilities to handle large base64 payloads without freezing the main thread

/**
 * Convert a base64 string into a Blob asynchronously.
 * Prefers the `fetch(data:)` pathway which is offloaded and streaming-friendly.
 * Falls back to a chunked atob implementation that yields to the event loop.
 */
export async function base64ToBlob(base64: string, contentType = 'application/octet-stream'): Promise<Blob> {
  // Fast path: let the browser decode via the networking stack
  try {
    const res = await fetch(`data:${contentType};base64,${base64}`)
    return await res.blob()
  } catch {
    // Fall through to manual chunked decode
  }

  // Fallback: decode in 1MB chunks and yield between chunks to keep UI responsive
  const sliceSize = 1024 * 1024
  const byteArrays: Uint8Array[] = []
  const byteCharacters = atob(base64)
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, Math.min(offset + sliceSize, byteCharacters.length))
    const bytes = new Uint8Array(slice.length)
    for (let i = 0; i < slice.length; i++) {
      bytes[i] = slice.charCodeAt(i)
    }
    byteArrays.push(bytes)
    // Yield to render loop to avoid long tasks
    await new Promise<void>(requestAnimationFrame)
  }
  return new Blob(byteArrays, { type: contentType })
}

/**
 * Read a Blob into a data: URL asynchronously.
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

