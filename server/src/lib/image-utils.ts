import { imageSize } from 'image-size';

export type Dimensions = { width: number; height: number }

export function getDimensionsFromBuffer(buf: Buffer): Dimensions {
  const res = imageSize(buf);
  if (!res.width || !res.height) throw new Error('Unable to read image dimensions');
  return { width: res.width, height: res.height };
}

export function ensurePngMask(dataUrlOrFilename?: string) {
  if (!dataUrlOrFilename) return;
  // Accept either a data URL or filename; enforce PNG for masks
  if (dataUrlOrFilename.startsWith('data:')) {
    const mime = dataUrlOrFilename.slice(5, dataUrlOrFilename.indexOf(';'));
    if (mime.toLowerCase() !== 'image/png') {
      throw new Error('Mask must be a PNG (data:image/png;base64,...)');
    }
  } else if (!dataUrlOrFilename.toLowerCase().endsWith('.png')) {
    throw new Error('Mask file must be a .png image');
  }
}

export function ensureMaskMatchesImage(src: Buffer, mask: Buffer) {
  const a = getDimensionsFromBuffer(src);
  const b = getDimensionsFromBuffer(mask);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Mask dimensions ${b.width}x${b.height} must match source ${a.width}x${a.height}`);
  }
}

