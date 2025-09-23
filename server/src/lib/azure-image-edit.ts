import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureMaskMatchesImage, ensurePngMask } from './image-utils.js';

export type EditParams = {
  endpoint: string
  apiKey?: string
  token?: string
  model: string
  prompt: string
  imagePath: string
  maskPath?: string
  size?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
  background?: 'transparent' | 'opaque' | 'auto'
  output_format?: 'png' | 'jpeg' | 'webp'
  output_compression?: number
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard'
  apiVersion?: string
  outPath?: string
}

export async function editImage(p: EditParams) {
  const apiVersion = (p.apiVersion || 'v1').trim();
  const base = p.endpoint.replace(/\/+$/, '');

  const form = new FormData();
  form.set('model', p.model);
  form.set('prompt', p.prompt);
  if (p.size) form.set('size', p.size);
  if (p.output_format) form.set('output_format', p.output_format);
  if (p.background) form.set('background', p.background);
  if (typeof p.output_compression === 'number') form.set('output_compression', String(p.output_compression));
  if (p.quality) form.set('quality', p.quality);

  const imgBuf = await fs.readFile(p.imagePath);
  const imgMime = p.imagePath.toLowerCase().endsWith('.jpg') || p.imagePath.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  form.set('image', new File([new Uint8Array(imgBuf)], path.basename(p.imagePath), { type: imgMime }));

  if (p.maskPath) {
    ensurePngMask(p.maskPath);
    const maskBuf = await fs.readFile(p.maskPath);
    ensureMaskMatchesImage(imgBuf, maskBuf);
    form.set('mask', new File([new Uint8Array(maskBuf)], 'mask.png', { type: 'image/png' }));
  }

  const headers: Record<string,string> = {};
  if (p.token) headers['Authorization'] = `Bearer ${p.token}`;
  else if (p.apiKey) headers['api-key'] = p.apiKey;

  const url = `${base}/openai/v1/images/edits?api-version=${apiVersion}`;
  const r = await fetch(url, { method: 'POST', headers, body: form as any });
  if (!r.ok) throw new Error(`Azure image edit failed: ${r.status} ${await r.text()}`);
  const j: any = await r.json();
  const b64: string | undefined = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No edited image returned');

  const ext = p.output_format === 'jpeg' ? 'jpg' : (p.output_format || 'png');
  const out = p.outPath || path.resolve(process.cwd(), `out.${ext}`);
  await fs.writeFile(out, Buffer.from(b64, 'base64'));
  return { outPath: out, contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, size: p.size || 'auto' };
}
