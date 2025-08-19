import { API_BASE_URL } from './api';
import type { AnalyticsEvent } from '@image-studio/shared';

const KEY = 'analytics:queue:v1';

function enqueue(ev: AnalyticsEvent) {
  try {
    const raw = localStorage.getItem(KEY);
    const arr: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    arr.push(ev);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

export function recordEvent(name: string, props?: Record<string, unknown>) {
  const ev: AnalyticsEvent = { name, ts: new Date().toISOString(), props };
  enqueue(ev);

  // Best-effort POST; ignore failures silently
  fetch(`${API_BASE_URL}/api/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev)
  }).catch(() => {});
}