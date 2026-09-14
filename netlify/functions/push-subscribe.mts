// Push subscriptions. GET /api/push/config gives the public key; POST /api/push/subscribe stores
// a subscription with the plan it should follow; DELETE removes it; GET /api/push/status?endpoint=
// says which plan a device follows.
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { createHash } from 'node:crypto';
import { fromThisSite, json, validSearch } from '../lib/api.ts';

export interface StoredSubscription {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  // The plan as a query string, the same one the page carries.
  search: string;
  createdAt: number;
  // Everything due up to this instant has been sent.
  sentUntil: number;
}

export function keyFor(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

// A subscription as browsers produce it: an https endpoint and two base64 keys.
function validSubscription(sub: unknown): sub is StoredSubscription['subscription'] {
  if (!sub || typeof sub !== 'object') return false;
  const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 1000 || !s.endpoint.startsWith('https://')) return false;
  const k = s.keys;
  const key = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 300 && /^[A-Za-z0-9_=-]+$/.test(v);
  return !!k && key(k.p256dh) && key(k.auth);
}

export default async (req: Request): Promise<Response> => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return json({ error: 'unavailable' }, 503);
  const url = new URL(req.url);
  if (url.pathname.endsWith('/config')) return json({ publicKey });
  if (!fromThisSite(req)) return json({ error: 'forbidden' }, 403);

  const store = getStore('push');
  if (url.pathname.endsWith('/status')) {
    const endpoint = url.searchParams.get('endpoint') ?? '';
    if (!endpoint.startsWith('https://')) return json({ error: 'bad-request' }, 400);
    const record = (await store.get(keyFor(endpoint), { type: 'json' })) as StoredSubscription | null;
    return json({ search: record?.search ?? null });
  }
  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as Partial<StoredSubscription> | null;
    const sub = body?.subscription;
    if (!validSubscription(sub) || !validSearch(body?.search)) return json({ error: 'bad-request' }, 400);
    const existing = (await store.get(keyFor(sub.endpoint), { type: 'json' })) as StoredSubscription | null;
    const record: StoredSubscription = {
      subscription: sub,
      search: body.search,
      createdAt: existing?.createdAt ?? Date.now(),
      sentUntil: Date.now(),
    };
    await store.setJSON(keyFor(sub.endpoint), record);
    return json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) return json({ error: 'bad-request' }, 400);
    await store.delete(keyFor(body.endpoint));
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
};

export const config: Config = { path: ['/api/push/config', '/api/push/subscribe', '/api/push/status'] };
