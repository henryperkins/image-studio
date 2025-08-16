export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export type ImageItem = {
  kind: "image";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

export type VideoItem = {
  kind: "video";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  width: number;
  height: number;
  duration: number;
  createdAt: string;
};

export type LibraryItem = ImageItem | VideoItem;
export const isVideoItem = (i: LibraryItem): i is VideoItem => i.kind === "video";

export async function listLibrary(): Promise<LibraryItem[]> {
  const r = await fetch(`${API_BASE_URL}/api/library/media`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).items as LibraryItem[];
}

export async function deleteLibraryItem(id: string) {
  const r = await fetch(`${API_BASE_URL}/api/library/media/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

export async function generateImage(prompt: string, size: string, quality: string, format: "png"|"jpeg") {
  const r = await fetch(`${API_BASE_URL}/api/images/generate`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ prompt, size, quality, output_format: format, n: 1 })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function editImage(image_id: string, prompt: string, mask_data_url?: string, size: string = "1024x1024", output_format: "png"|"jpeg" = "png") {
  const r = await fetch(`${API_BASE_URL}/api/images/edit`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ image_id, prompt, mask_data_url, size, output_format })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function describeImagesByIds(ids: string[], detail: "auto"|"low"|"high" = "high", mode: "describe"|"video_ideas" = "describe", style: "concise"|"detailed" = "concise") {
  const r = await fetch(`${API_BASE_URL}/api/vision/describe`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ library_ids: ids, detail, style })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as { description: string };
}

export async function generateVideo(prompt: string, width: number, height: number, n_seconds: number, reference_image_urls: string[]) {
  const r = await fetch(`${API_BASE_URL}/api/videos/sora/generate`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ prompt, width, height, n_seconds, reference_image_urls })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function trimVideo(video_id: string, start: number, duration: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/trim`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, start, duration })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function cropVideo(video_id: string, x: number, y: number, width: number, height: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/crop`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, x, y, width, height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function resizeVideo(video_id: string, width: number, height: number, fit: "contain"|"cover"|"stretch" = "contain", bg = "black") {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/resize`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, width, height, fit, bg })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function speedVideo(video_id: string, speed: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/speed`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, speed })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function muteVideo(video_id: string) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/mute`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function volumeVideo(video_id: string, gain_db: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/volume`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, gain_db })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function overlayImageOnVideo(video_id: string, image_id: string, opts: { x?: string; y?: string; overlay_width?: number; overlay_height?: number; opacity?: number } = {}) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/overlay`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, image_id, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function concatVideos(video_ids: string[], target_width?: number, target_height?: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/concat`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_ids, target_width, target_height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}