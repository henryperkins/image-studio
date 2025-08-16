// Video frame analysis capability (placeholder implementation)
import { VideoParams, Frame } from '../types/vision.js';
import { promises as fs } from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { setTimeout as sleep } from "node:timers/promises";

let runningFfmpeg = 0;
const MAX_CONCURRENT_FFMPEG = Number(process.env.MAX_CONCURRENT_FFMPEG || 2);
const FFMPEG_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS || 30_000);

async function withFfmpegSlot<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  while (runningFfmpeg >= MAX_CONCURRENT_FFMPEG) {
    await sleep(50);
    if (Date.now() - start > 5_000) throw new Error("FFmpeg concurrency queue timeout");
  }
  runningFfmpeg++;
  try { return await fn(); } finally { runningFfmpeg--; }
}

export interface VideoFrameExtractionOptions {
  method: 'uniform' | 'scene-detection' | 'manual';
  maxFrames: number;
  minInterval: number; // seconds
  outputFormat: 'png' | 'jpeg';
  quality: number; // 1-31 for JPEG, lower is better
}

export async function extractKeyframes(
  videoPath: string, 
  options: VideoFrameExtractionOptions
): Promise<Frame[]> {
  const {
    method = 'uniform',
    maxFrames = 10,
    minInterval = 1.0,
    outputFormat = 'png',
    quality = 2
  } = options;

  // Get video duration first
  const duration = await getVideoDuration(videoPath);
  const frames: Frame[] = [];

  switch (method) {
    case 'uniform':
      frames.push(...await extractUniformFrames(videoPath, duration, maxFrames, minInterval, outputFormat, quality));
      break;
    case 'scene-detection':
      frames.push(...await extractSceneFrames(videoPath, maxFrames, outputFormat, quality));
      break;
    case 'manual':
      // Manual timestamps would be provided externally
      throw new Error('Manual frame extraction requires timestamp specification');
    default:
      throw new Error(`Unsupported extraction method: ${method}`);
  }

  return frames;
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const ffmpegPath = ffmpegStatic as string;
  
  return withFfmpegSlot<number>(() => new Promise((resolve, reject) => {
    const args = [
      '-i', videoPath,
      '-f', 'null',
      '-'
    ];

    const proc = child_process.spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrOutput = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2_000).unref();
      reject(new Error('FFmpeg duration check timeout'));
    }, FFMPEG_TIMEOUT_MS).unref();

    proc.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    proc.on('close', () => {
      clearTimeout(timer);
      if (killed) return;
      // Parse duration from ffmpeg output
      const durationMatch = stderrOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        resolve(totalSeconds);
      } else {
        reject(new Error('Could not determine video duration'));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }));
}

async function extractUniformFrames(
  videoPath: string, 
  duration: number, 
  maxFrames: number,
  minInterval: number,
  outputFormat: string,
  quality: number
): Promise<Frame[]> {
  const interval = Math.max(minInterval, duration / maxFrames);
  const actualFrameCount = Math.min(maxFrames, Math.floor(duration / minInterval));
  const frames: Frame[] = [];

  for (let i = 0; i < actualFrameCount; i++) {
    const timestamp = (i + 0.5) * interval; // Offset to avoid black frames at start
    if (timestamp >= duration) break;

    const frameBuffer = await extractSingleFrame(videoPath, timestamp, outputFormat, quality);
    const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = `data:${mimeType};base64,${frameBuffer.toString('base64')}`;

    frames.push({
      timestamp,
      data_url: dataUrl
    });
  }

  return frames;
}

async function extractSceneFrames(
  videoPath: string,
  maxFrames: number,
  outputFormat: string,
  quality: number
): Promise<Frame[]> {
  // Use FFmpeg scene detection to find scene changes
  const ffmpegPath = ffmpegStatic as string;
  const sceneTimestamps: number[] = [];

  return withFfmpegSlot<Frame[]>(() => new Promise((resolve, reject) => {
    const args = [
      '-i', videoPath,
      '-filter:v', 'select=gt(scene\\,0.3)',
      '-f', 'null',
      '-'
    ];

    const proc = child_process.spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrOutput = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2_000).unref();
      reject(new Error('FFmpeg scene detection timeout'));
    }, FFMPEG_TIMEOUT_MS).unref();

    proc.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    proc.on('close', async () => {
      clearTimeout(timer);
      if (killed) return;
      try {
        // Parse scene timestamps from output
        const sceneMatches = stderrOutput.match(/pts_time:([\d.]+)/g);
        if (sceneMatches) {
          sceneMatches.forEach(match => {
            const timestamp = parseFloat(match.replace('pts_time:', ''));
            sceneTimestamps.push(timestamp);
          });
        }

        // Limit to maxFrames
        const limitedTimestamps = sceneTimestamps
          .sort((a, b) => a - b)
          .slice(0, maxFrames);

        // Extract frames at detected scene changes
        const frames: Frame[] = [];
        for (const timestamp of limitedTimestamps) {
          const frameBuffer = await extractSingleFrame(videoPath, timestamp, outputFormat, quality);
          const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
          const dataUrl = `data:${mimeType};base64,${frameBuffer.toString('base64')}`;

          frames.push({
            timestamp,
            data_url: dataUrl
          });
        }

        resolve(frames);
      } catch (error) {
        reject(error);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }));
}

async function extractSingleFrame(
  videoPath: string,
  timestamp: number,
  outputFormat: string,
  quality: number
): Promise<Buffer> {
  const ffmpegPath = ffmpegStatic as string;

  return new Promise((resolve, reject) => {
    const args = [
      '-ss', timestamp.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-f', outputFormat,
      '-q:v', quality.toString(),
      '-'
    ];

    const process = child_process.spawn(ffmpegPath, args);
    const chunks: Buffer[] = [];

    process.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

// Analyze temporal coherence between frames
export function analyzeTemporalCoherence(frames: Frame[]): number {
  if (frames.length < 2) return 10; // Single frame is perfectly coherent

  // This is a simplified analysis - in a full implementation,
  // you would compare visual similarity between consecutive frames
  // using computer vision techniques or send frames to vision API
  
  // For now, return a score based on frame interval consistency
  const intervals: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    intervals.push(frames[i].timestamp - frames[i-1].timestamp);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => 
    sum + Math.pow(interval - avgInterval, 2), 0
  ) / intervals.length;

  // Score from 1-10, higher variance = lower coherence
  const coherenceScore = Math.max(1, 10 - (variance * 2));
  return Math.round(coherenceScore * 10) / 10;
}

// Identify important segments in video
export function identifyImportantSegments(
  frames: Frame[], 
  minSegmentLength: number = 2.0
): Array<{ start_time: number; end_time: number; description: string }> {
  if (frames.length < 2) {
    return [{
      start_time: 0,
      end_time: frames[0]?.timestamp || 0,
      description: 'Single frame segment'
    }];
  }

  const segments: Array<{ start_time: number; end_time: number; description: string }> = [];
  let currentSegmentStart = frames[0].timestamp;

  for (let i = 1; i < frames.length; i++) {
    const interval = frames[i].timestamp - frames[i-1].timestamp;
    
    // If there's a large gap, end current segment and start new one
    if (interval > minSegmentLength * 2) {
      segments.push({
        start_time: currentSegmentStart,
        end_time: frames[i-1].timestamp,
        description: `Scene segment ${segments.length + 1}`
      });
      currentSegmentStart = frames[i].timestamp;
    }
  }

  // Add final segment
  segments.push({
    start_time: currentSegmentStart,
    end_time: frames[frames.length - 1].timestamp,
    description: `Scene segment ${segments.length + 1}`
  });

  return segments;
}

// Quality assessment for extracted frames
export function assessFrameQuality(frames: Frame[]): string[] {
  return frames.map((frame, index) => {
    // Basic quality assessment based on data size and timestamp
    const sizeKB = (frame.data_url.length * 3/4) / 1024; // Rough base64 to bytes conversion
    
    if (sizeKB < 10) return 'Low quality - very small file size';
    if (sizeKB > 200) return 'High quality - large file size';
    if (frame.timestamp < 1) return 'Potentially low quality - near video start';
    
    return 'Good quality';
  });
}

// Placeholder for full video analysis implementation
export async function analyzeVideoSequence(
  videoPath: string,
  options: VideoFrameExtractionOptions & VideoParams
): Promise<any> {
  // Extract keyframes
  const frames = await extractKeyframes(videoPath, options);
  
  // Analyze temporal coherence
  const coherence = analyzeTemporalCoherence(frames);
  
  // Identify segments
  const segments = identifyImportantSegments(frames);
  
  // Assess quality
  const quality = assessFrameQuality(frames);

  return {
    frames,
    video_analysis: {
      scene_segments: segments,
      motion_analysis: {
        camera_movement: 'Analysis not implemented',
        subject_movement: 'Analysis not implemented',
        transitions: 'Analysis not implemented'
      },
      temporal_coherence: coherence,
      keyframe_quality: quality
    }
  };
}