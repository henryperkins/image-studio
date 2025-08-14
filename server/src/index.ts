import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fstatic from "@fastify/static";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = Fastify({ logger: true });

const ORIGIN = /http:\/\/localhost:[0-9]+/;
app.log.info(`CORS origin set to: ${ORIGIN}`);
await app.register(cors, { origin: ORIGIN });

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""),
  key: process.env.AZURE_OPENAI_API_KEY || "",
  // Sora API (v1 preview surface)
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "preview",
  // Images (gpt-image-1)
  imageApiVersion: process.env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview",
  imageDeployment: process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || "",
  // Chat/Vision (gpt-4.1 or similar)
  chatApiVersion: process.env.AZURE_OPENAI_CHAT_API_VERSION || "2024-02-15-preview",
  visionDeployment: process.env.AZURE_OPENAI_VISION_DEPLOYMENT || ""
};
if (!AZ.endpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");

// ---------- library paths ----------
const DATA_DIR = path.resolve(process.cwd(), "data");
const IMG_DIR = path.join(DATA_DIR, "images");
const VIDEO_DIR = path.join(DATA_DIR, "videos");
const IMG_MANIFEST = path.join(IMG_DIR, "manifest.json");
const VIDEO_MANIFEST = path.join(VIDEO_DIR, "manifest.json");

type ImageLibraryItem = {
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

type VideoLibraryItem = {
  id: string;
  url: string;
  filename: string;
  prompt: string;
  width: number;
  height: number;
  duration: number;
  format: "mp4";
  jobId: string;
  generationId: string;
  createdAt: string;
};

async function ensureDirs() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  try { await fs.access(IMG_MANIFEST); } catch { await fs.writeFile(IMG_MANIFEST, "[]"); }
  try { await fs.access(VIDEO_MANIFEST); } catch { await fs.writeFile(VIDEO_MANIFEST, "[]"); }
}
await ensureDirs();

async function readImageManifest(): Promise<ImageLibraryItem[]> {
  try { return JSON.parse(await fs.readFile(IMG_MANIFEST, "utf-8")); } catch { return []; }
}
async function writeImageManifest(items: ImageLibraryItem[]) {
  await fs.writeFile(IMG_MANIFEST, JSON.stringify(items, null, 2));
}

async function readVideoManifest(): Promise<VideoLibraryItem[]> {
  try { return JSON.parse(await fs.readFile(VIDEO_MANIFEST, "utf-8")); } catch { return []; }
}
async function writeVideoManifest(items: VideoLibraryItem[]) {
  await fs.writeFile(VIDEO_MANIFEST, JSON.stringify(items, null, 2));
}

// Serve /static/images/<file>
await app.register(fstatic, { root: IMG_DIR, prefix: "/static/images/", decorateReply: false });

// Serve /static/videos/<file>
await app.register(fstatic, { root: VIDEO_DIR, prefix: "/static/videos/", decorateReply: false });

// ---------- Images (gpt-image-1 on Azure) ----------
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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AZ.key) headers["api-key"] = AZ.key;

    const r = await fetch(url, {
      method: "POST",
      headers,
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
    const data = (await r.json()) as any;
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image payload returned (b64_json missing)");

    // Save to library
    const id = crypto.randomUUID();
    const ext = body.output_format === "jpeg" ? "jpg" : "png";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, "base64"));

    const item: ImageLibraryItem = {
      id,
      filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: body.output_format,
      createdAt: new Date().toISOString()
    };
    const items = await readImageManifest();
    items.unshift(item);
    await writeImageManifest(items);

    return reply.send({
      image_base64: b64,
      model: "gpt-image-1",
      size: body.size,
      format: body.output_format,
      library_item: item
    });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Image generation failed" });
  }
});

// ---------- Library endpoints ----------
app.get("/api/library/images", async (_req, reply) => {
  const items = await readImageManifest();
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reply.send({ items });
});

app.delete("/api/library/images/:id", async (req, reply) => {
  const id = (req.params as any)?.id as string;
  if (!id) return reply.status(400).send({ error: "Missing id" });
  const items = await readImageManifest();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return reply.status(404).send({ error: "Not found" });
  const [removed] = items.splice(idx, 1);
  await writeImageManifest(items);
  try { await fs.unlink(path.join(IMG_DIR, removed.filename)); } catch {}
  return reply.send({ ok: true });
});

// ---------- Video library endpoints ----------
app.get("/api/library/videos", async (_req, reply) => {
  const items = await readVideoManifest();
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reply.send({ items });
});

app.delete("/api/library/videos/:id", async (req, reply) => {
  const id = (req.params as any)?.id as string;
  if (!id) return reply.status(400).send({ error: "Missing id" });
  const items = await readVideoManifest();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return reply.status(404).send({ error: "Not found" });
  const [removed] = items.splice(idx, 1);
  await writeVideoManifest(items);
  try { await fs.unlink(path.join(VIDEO_DIR, removed.filename)); } catch {}
  return reply.send({ ok: true });
});

// ---------- Vision describe (GPT-4.1 on Azure chat/completions) ----------
const VisionReq = z.object({
  library_ids: z.array(z.string().nullable()).transform(arr => arr?.filter(id => id !== null) || []).optional(),
  image_urls: z.array(z.string().url()).optional(),
  detail: z.enum(["auto", "low", "high"]).default("high"),
  style: z.enum(["concise", "detailed"]).default("concise"),
  mode: z.enum(["describe", "video_ideas"]).default("describe")
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

  // Collect image parts: prefer library ids → base64 data URLs (guaranteed accessible); optionally accept direct URLs.
  const parts: Array<{ type: "image_url"; image_url: { url: string; detail?: string } }> = [];
  if (body.library_ids?.length) {
    const items = await readImageManifest();
    for (const id of body.library_ids) {
      const hit = items.find(x => x.id === id);
      if (!hit) continue;
      const filePath = path.join(IMG_DIR, hit.filename);
      const dataUrl = await fileToDataUrl(filePath);
      parts.push({ type: "image_url", image_url: { url: dataUrl, detail: body.detail } });
    }
  }
  if (body.image_urls?.length) {
    for (const u of body.image_urls) {
      parts.push({ type: "image_url", image_url: { url: u, detail: body.detail } });
    }
  }
  if (parts.length === 0) return reply.status(400).send({ error: "No images provided" });

  try {
    const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.visionDeployment)}/chat/completions?api-version=${AZ.chatApiVersion}`;
    
    let system: string;
    if (body.mode === "video_ideas") {
      system = body.style === "concise"
        ? `You are a cinematic director expert in Sora AI video generation. Analyze the image and provide:
1. Scene Analysis (2-3 bullets): Key elements, composition, lighting, mood
2. Camera Movements: Suggest 2-3 specific techniques (pan, dolly, tracking, crane, handheld)
3. Video Concept: A brief narrative arc with transitions
4. Sora Prompt: Start with 'Suggested Sora prompt:' followed by a cinematic prompt including camera movements, transitions, and visual style (e.g., "shot on 35mm film", specific lighting).
Keep total response under 200 words.`
        : `You are a cinematic director expert in Sora AI video generation. Provide detailed analysis:
1. Scene Analysis: Subject, composition, color palette, lighting, depth, textures
2. Camera Techniques: 3-4 specific movements with timing (e.g., "slow dolly in over 3 seconds")
3. Transitions: Creative scene connections (whip pan, fade, match cut)
4. Narrative Flow: Beginning, middle, end with pacing suggestions
5. Technical Specs: Film type, depth of field, color grading recommendations
6. Sora Prompt: Start with 'Suggested Sora prompt:' followed by a comprehensive cinematic prompt.
Focus on dynamic movement and storytelling.`;
    } else {
      system = body.style === "concise"
        ? "You are an expert visual describer for video prompt engineering. Summarize key content, composition, color palette, lighting, and style in 3–6 bullets, then produce ONE final improved prompt line that starts with 'Suggested prompt:'. Avoid speculation."
        : "You are an expert visual describer for video prompt engineering. Provide a thorough description of subject, composition, palette, lighting, camera/lens, mood, and notable textures. End with a line starting 'Suggested prompt:' with an improved prompt. Avoid speculation.";
    }
    const payload = {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze the following image(s), then write output as described." },
            ...parts
          ]
        }
      ],
      max_tokens: 400,
      temperature: 0.2
    };

    const r = await fetch(url, { method: "POST", headers: chatHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`Azure vision failed: ${r.status} ${await r.text()}`);
    const j = await r.json() as any;
    const text: string = j?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty response from vision model");
    return reply.send({ description: text });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Vision describe failed" });
  }
});

// ---------- Sora video (Azure preview job API) ----------
const SoraReq = z.object({
  prompt: z.string().min(1),
  width: z.number().int().min(256).max(1920).default(1080),
  height: z.number().int().min(256).max(1920).default(1080),
  n_seconds: z.number().int().min(1).max(20).default(10),
  reference_image_urls: z.array(z.string().url()).optional()
});
function soraHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (AZ.key) h["api-key"] = AZ.key;
  else {
    const bearer = process.env.AZURE_OPENAI_BEARER || "";
    if (bearer) h["Authorization"] = `Bearer ${bearer}`;
  }
  return h;
}
app.post("/api/videos/sora/generate", async (req, reply) => {
  const body = SoraReq.parse(req.body);
  try {
    const base = `${AZ.endpoint}/openai/v1`;
    const createUrl = `${base}/video/generations/jobs?api-version=${AZ.apiVersion}`;

    const refBlock = (body.reference_image_urls?.length ?? 0) > 0
      ? `\n\n[Reference images]\n${body.reference_image_urls!.join("\n")}`
      : "";
    const finalPrompt = `${body.prompt}${refBlock}`;

    const created = await fetch(createUrl, {
      method: "POST",
      headers: soraHeaders(),
      body: JSON.stringify({
        model: "sora",
        prompt: finalPrompt,
        width: body.width,
        height: body.height,
        n_seconds: body.n_seconds
      })
    });
    if (!created.ok) throw new Error(await created.text());
    const job = await created.json();
    const jobId: string | undefined = job?.id;
    if (!jobId) throw new Error("No job id returned");

    const statusUrl = `${base}/video/generations/jobs/${jobId}?api-version=${AZ.apiVersion}`;
    const started = Date.now();
    let status = job?.status || "queued";
    let generations: any[] = job?.generations || [];

    while (!["succeeded", "failed", "cancelled"].includes(status)) {
      if (Date.now() - started > 6 * 60 * 1000) throw new Error("Timed out waiting for Sora job");
      await new Promise((r) => setTimeout(r, 5000));
      const sRes = await fetch(statusUrl, { headers: soraHeaders() });
      if (!sRes.ok) throw new Error(await sRes.text());
      const s = await sRes.json();
      status = s?.status;
      generations = s?.generations || [];
      req.log.info({ jobId, status }, "Sora status");
    }

    if (status !== "succeeded") return reply.status(400).send({ error: `Job ${status}` });
    const generationId = generations?.[0]?.id;
    if (!generationId) throw new Error("No generation id");

    const contentUrl = `${base}/video/generations/${generationId}/content/video?api-version=${AZ.apiVersion}`;
    const vRes = await fetch(contentUrl, { headers: soraHeaders() });
    if (!vRes.ok) throw new Error(await vRes.text());
    const ab = await vRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");

    // Save video to library
    const videoId = crypto.randomUUID();
    const videoFilename = `${videoId}.mp4`;
    await fs.writeFile(path.join(VIDEO_DIR, videoFilename), Buffer.from(ab));

    const videoItem: VideoLibraryItem = {
      id: videoId,
      filename: videoFilename,
      url: `/static/videos/${videoFilename}`,
      prompt: body.prompt,
      width: body.width,
      height: body.height,
      duration: body.n_seconds,
      format: "mp4",
      jobId,
      generationId,
      createdAt: new Date().toISOString()
    };
    const videoItems = await readVideoManifest();
    videoItems.unshift(videoItem);
    await writeVideoManifest(videoItems);

    return reply.send({ 
      job_id: jobId, 
      generation_id: generationId, 
      content_type: "video/mp4", 
      video_base64: b64,
      library_item: videoItem
    });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Sora generation failed" });
  }
});

app.get("/healthz", async () => ({ ok: true }));

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: "0.0.0.0" }).catch((e) => { app.log.error(e); process.exit(1); });