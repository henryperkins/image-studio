#!/usr/bin/env tsx
/**
 * Azure OpenAI Video (Sora) v1 Preview Test
 */
import 'dotenv/config';

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, ''),
  key: process.env.AZURE_OPENAI_API_KEY || '',
  token: process.env.AZURE_OPENAI_AUTH_TOKEN || '',
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || 'v1',
  videoDeployment: process.env.AZURE_OPENAI_VIDEO_DEPLOYMENT || 'sora'
};

function headers() {
  const h: Record<string, string> = {};
  if (AZ.token) h['Authorization'] = `Bearer ${AZ.token}`;
  else if (AZ.key) h['api-key'] = AZ.key;
  return h;
}

async function main() {
  if (!AZ.endpoint) throw new Error('Missing AZURE_OPENAI_ENDPOINT');
  if (!AZ.key && !AZ.token) throw new Error('Missing auth (AZURE_OPENAI_API_KEY or AZURE_OPENAI_AUTH_TOKEN)');

  const base = `${AZ.endpoint}/openai/v1`;
  const createUrl = `${base}/video/generations/jobs?api-version=${AZ.apiVersion}`;
  const payload = { model: AZ.videoDeployment, prompt: 'A bouncing red ball', width: 480, height: 480, n_seconds: 1 };
  console.log('POST', createUrl, JSON.stringify(payload));
  const r = await fetch(createUrl, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  console.log('Status:', r.status, r.statusText);
  const j = await r.json().catch(() => ({}));
  console.log('Body:', j);
  if (!r.ok) return;

  const jobId = j?.id; if (!jobId) return;
  const statusUrl = `${base}/video/generations/jobs/${jobId}?api-version=${AZ.apiVersion}`;
  console.log('Polling job:', statusUrl);
  let status = j?.status || 'queued';
  const t0 = Date.now();
  while (!['succeeded', 'failed', 'cancelled'].includes(status)) {
    if (Date.now() - t0 > 120000) throw new Error('Timeout waiting for job');
    await new Promise(r => setTimeout(r, 5000));
    const s = await fetch(statusUrl, { headers: headers() });
    const sj = await s.json();
    status = sj?.status;
    console.log('Status:', status);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
