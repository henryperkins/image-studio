import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fstatic from "@fastify/static";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const app = Fastify({ logger: true });

const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5174";
await app.register(cors, { origin: ORIGIN });
await app.register(multipart);

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""),
  key: process.env.AZURE_OPENAI_API_KEY || "",
  // Sora preview
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "preview",
  // Images gen
  imageApiVersion: process.env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview",
  imageDeployment: process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || "",
  // Vision chat
  chatApiVersion: process.env.AZURE_OPENAI_CHAT_API_VERSION || "2024-02-15-preview",
  visionDeployment: process.env.AZURE_OPENAI_VISION_DEPLOYMENT || ""
};
if (!AZ.endpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");

// ----------------- library layout -----------------
const DATA_DIR = path.resolve(process.cwd(), "data");
const IMG_DIR = path.join(DATA_DIR, "images");
const VID_DIR = path.join(DATA_DIR, "videos");
const MANIFEST = path.join(DATA_DIR, "manifest.json");

type ImageItem = {
  kind: "image";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

type VideoItem = {
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

type LibraryItem = ImageItem | VideoItem;

async function ensureDirs() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  await fs.mkdir(VID_DIR, { recursive: true });
  try { await fs.access(MANIFEST); } catch { await fs.writeFile(MANIFEST, "[]"); }
}
await ensureDirs();

async function readManifest(): Promise<LibraryItem[]> {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf-8")); } catch { return []; }
}
async function writeManifest(items: LibraryItem[]) {
  await fs.writeFile(MANIFEST, JSON.stringify(items, null, 2));
}

// Static
await app.register(fstatic, { root: IMG_DIR, prefix: "/static/images/", decorateReply: false });
await app.register(fstatic, { root: VID_DIR, prefix: "/static/videos/", decorateReply: false });

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (AZ.key) h["api-key"] = AZ.key;
  return h;
}

// ----------------- IMAGES: generate -----------------
const ImageReq = z.object({
  prompt: z.string().min(1),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("high"),
  output_format: z.enum(["png", "jpeg"]).default("png"),
  n: z.number().int().min(1).max(10).default(1)
});

app.post("/api/images/generate", async (req, reply) => {
  const body = ImageReq.parse(req.body);
  if (!AZ.imageDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_IMAGE_DEPLOYMENT" });

  try {
    const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.imageDeployment)}/images/generations?api-version=${AZ.imageApiVersion}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: body.prompt,
        size: body.size,
        quality: body.quality,
        output_format: body.output_format,
        n: body.n
      })
    });
    if (!r.ok) throw new Error(`Azure image gen failed: ${r.status} ${await r.text()}`);
    const data = await r.json() as any;
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image payload returned");

    const id = crypto.randomUUID();
    const ext = body.output_format === "jpeg" ? "jpg" : "png";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, "base64"));

    const item: ImageItem = {
      kind: "image",
      id, filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: body.output_format,
      createdAt: new Date().toISOString()
    };
    const items = await readManifest();
    items.unshift(item);
    await writeManifest(items);

    return reply.send({ image_base64: b64, model: "gpt-image-1", size: body.size, format: body.output_format, library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Image generation failed" });
  }
});

// ----------------- IMAGES: edit (gpt-image-1 inpainting/transform) -----------------
const ImageEditReq = z.object({
  image_id: z.string().min(1),
  prompt: z.string().min(1),
  // PNG data URL for mask; transparent pixels mark regions to change
  mask_data_url: z.string().url().optional(),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  output_format: z.enum(["png", "jpeg"]).default("png")
});

function dataURLtoBuffer(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  return Buffer.from(m[2], "base64");
}

app.post("/api/images/edit", async (req, reply) => {
  const body = ImageEditReq.parse(req.body);
  try {
    const items = await readManifest();
    const src = items.find(i => i.kind === "image" && i.id === body.image_id) as ImageItem | undefined;
    if (!src) return reply.status(404).send({ error: "Source image not found" });

    // Build multipart for v1 preview images/edits
    const form = new FormData();
    form.set("model", "gpt-image-1");
    form.set("prompt", body.prompt);
    form.set("size", body.size);
    form.set("output_format", body.output_format);

    // image file
    const srcPath = path.join(IMG_DIR, src.filename);
    const srcBuf = await fs.readFile(srcPath);
    const srcMime = src.filename.endsWith(".jpg") ? "image/jpeg" : "image/png";
    form.set("image", new File([srcBuf], src.filename, { type: srcMime }));

    // optional mask (PNG with transparent regions to edit)
    if (body.mask_data_url) {
      const maskBuf = dataURLtoBuffer(body.mask_data_url);
      form.set("mask", new File([maskBuf], "mask.png", { type: "image/png" }));
    }

    const url = `${AZ.endpoint}/openai/v1/images/edits?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { method: "POST", headers: authHeaders(), body: form as any });
    if (!r.ok) throw new Error(`Azure image edit failed: ${r.status} ${await r.text()}`);
    const j = await r.json() as any;
    const b64: string | undefined = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No edited image returned");

    const id = crypto.randomUUID();
    const ext = body.output_format === "jpeg" ? "jpg" : "png";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, "base64"));

    const item: ImageItem = {
      kind: "image",
      id, filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: body.output_format,
      createdAt: new Date().toISOString()
    };
    const all = await readManifest();
    all.unshift(item);
    await writeManifest(all);

    return reply.send({ image_base64: b64, library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Image edit failed" });
  }
});

// ----------------- LIBRARY: list/delete -----------------
app.get("/api/library/media", async (_req, reply) => {
  const items = await readManifest();
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reply.send({ items });
});

app.delete("/api/library/media/:id", async (req, reply) => {
  const id = (req.params as any)?.id as string;
  if (!id) return reply.status(400).send({ error: "Missing id" });
  const items = await readManifest();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return reply.status(404).send({ error: "Not found" });
  const [removed] = items.splice(idx, 1);
  await writeManifest(items);
  try {
    const dir = removed.kind === "video" ? VID_DIR : IMG_DIR;
    await fs.unlink(path.join(dir, removed.filename));
  } catch {}
  return reply.send({ ok: true });
});

// ----------------- VISION describe (GPT-4.1) -----------------
const VisionReq = z.object({
  library_ids: z.array(z.string()).optional(),
  image_urls: z.array(z.string().url()).optional(),
  detail: z.enum(["auto", "low", "high"]).default("high"),
  style: z.enum(["concise", "detailed"]).default("concise")
});
function chatHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (AZ.key) h["api-key"] = AZ.key;
  return h;
}
function guessMime(ext: string) {
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
}
async function fileToDataUrl(filePath: string) {
  const b = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = guessMime(ext);
  return `data:${mime};base64,${b.toString("base64")}`;
}
app.post("/api/vision/describe", async (req, reply) => {
  const body = VisionReq.parse(req.body);
  if (!AZ.visionDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_VISION_DEPLOYMENT" });
  const parts: Array<{ type: "image_url"; image_url: { url: string; detail?: string } }> = [];

  if (body.library_ids?.length) {
    const items = await readManifest();
    for (const id of body.library_ids) {
      const hit = items.find(x => x.kind === "image" && x.id === id) as ImageItem | undefined;
      if (!hit) continue;
      const dataUrl = await fileToDataUrl(path.join(IMG_DIR, hit.filename));
      parts.push({ type: "image_url", image_url: { url: dataUrl, detail: body.detail } });
    }
  }
  if (body.image_urls?.length) for (const u of body.image_urls) parts.push({ type: "image_url", image_url: { url: u, detail: body.detail } });
  if (!parts.length) return reply.status(400).send({ error: "No images provided" });

  const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.visionDeployment)}/chat/completions?api-version=${AZ.chatApiVersion}`;
  const system = body.style === "concise"
    ? "You are an expert visual describer for video prompt engineering. Summarize key content, composition, palette, lighting, and style in 3–6 bullets. End with 'Suggested prompt:' line."
    : "You are an expert visual describer for video prompt engineering. Provide thorough description (subject, composition, palette, lighting, camera, mood, textures). End with 'Suggested prompt:' line.";

  const r = await fetch(url, {
    method: "POST", headers: chatHeaders(),
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text: "Analyze the following image(s)." }, ...parts] }
      ],
      max_tokens: 400, temperature: 0.2
    })
  });
  if (!r.ok) return reply.status(400).send({ error: await r.text() });
  const j = await r.json() as any;
  return reply.send({ description: j?.choices?.[0]?.message?.content ?? "" });
});

// ----------------- SORA: generate (and save to library) -----------------
const SoraReq = z.object({
  prompt: z.string().min(1),
  width: z.number().int().min(256).max(1920).default(1080),
  height: z.number().int().min(256).max(1920).default(1080),
  n_seconds: z.number().int().min(1).max(20).default(10),
  reference_image_urls: z.array(z.string().url()).optional()
});
function soraHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (AZ.key) h["api-key"] = AZ.key;
  return h;
}
app.post("/api/videos/sora/generate", async (req, reply) => {
  const body = SoraReq.parse(req.body);
  try {
    const base = `${AZ.endpoint}/openai/v1`;
    const createUrl = `${base}/video/generations/jobs?api-version=${AZ.apiVersion}`;
    const refBlock = (body.reference_image_urls?.length ?? 0) > 0 ? `\n\n[Reference images]\n${body.reference_image_urls!.join("\n")}` : "";
    const finalPrompt = `${body.prompt}${refBlock}`;

    const created = await fetch(createUrl, {
      method: "POST",
      headers: { ...soraHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sora", prompt: finalPrompt, width: body.width, height: body.height, n_seconds: body.n_seconds })
    });
    if (!created.ok) throw new Error(await created.text());
    const job = await created.json() as any;
    const jobId = job?.id; if (!jobId) throw new Error("No job id returned");

    const statusUrl = `${base}/video/generations/jobs/${jobId}?api-version=${AZ.apiVersion}`;
    const started = Date.now();
    let status = job?.status || "queued";
    let generations: any[] = job?.generations || [];

    while (!["succeeded", "failed", "cancelled"].includes(status)) {
      if (Date.now() - started > 6 * 60 * 1000) throw new Error("Timed out waiting for Sora job");
      await new Promise(r => setTimeout(r, 5000));
      const sRes = await fetch(statusUrl, { headers: soraHeaders() });
      if (!sRes.ok) throw new Error(await sRes.text());
      const s = await sRes.json();
      status = s?.status;
      generations = s?.generations || [];
    }
    if (status !== "succeeded") return reply.status(400).send({ error: `Job ${status}` });

    const generationId = generations?.[0]?.id; if (!generationId) throw new Error("No generation id");
    const contentUrl = `${base}/video/generations/${generationId}/content/video?api-version=${AZ.apiVersion}`;
    const vRes = await fetch(contentUrl, { headers: soraHeaders() });
    if (!vRes.ok) throw new Error(await vRes.text());
    const ab = await vRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");

    // Save to library
    const id = crypto.randomUUID();
    const filename = `${id}.mp4`;
    await fs.writeFile(path.join(VID_DIR, filename), Buffer.from(b64, "base64"));
    const item: VideoItem = {
      kind: "video",
      id, filename,
      url: `/static/videos/${filename}`,
      prompt: body.prompt,
      width: body.width, height: body.height,
      duration: body.n_seconds,
      createdAt: new Date().toISOString()
    };
    const items = await readManifest();
    items.unshift(item);
    await writeManifest(items);

    return reply.send({ job_id: jobId, generation_id: generationId, video_base64: b64, content_type: "video/mp4", library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Sora generation failed" });
  }
});

// ----------------- VIDEOS: basic edits (trim) -----------------
const VideoTrimReq = z.object({
  video_id: z.string().min(1),
  start: z.number().min(0).default(0),
  duration: z.number().min(0.1)
});
app.post("/api/videos/edit/trim", async (req, reply) => {
  const body = VideoTrimReq.parse(req.body);
  const items = await readManifest();
  const src = items.find(i => i.kind === "video" && i.id === body.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Source video not found" });

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const outName = `${id}.mp4`;
  const outPath = path.join(VID_DIR, outName);

  const ffmpegPath = (ffmpegStatic as string);
  await new Promise<void>((resolve, reject) => {
    const args = ["-ss", String(body.start), "-t", String(body.duration), "-i", inPath, "-c", "copy", outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: "video",
    id,
    filename: outName,
    url: `/static/videos/${outName}`,
    prompt: `${src.prompt} (trim ${body.start}s +${body.duration}s)`,
    width: src.width, height: src.height,
    duration: body.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);

  // stream back base64 (for immediate preview)
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

app.get("/healthz", async () => ({ ok: true }));

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: "0.0.0.0" }).catch((e) => { app.log.error(e); process.exit(1); });