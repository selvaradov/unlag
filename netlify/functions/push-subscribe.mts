// Push subscriptions. GET /api/push/config gives the public key; POST /api/push/subscribe stores
// a subscription with the plan it should follow; DELETE removes it.
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { createHash } from 'node:crypto';

export interface StoredSubscription {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  // The plan as a query string, the same one the page carries.
  search: string;
  createdAt: number;
  // Everything due up to this instant has been sent.
  sentUntil: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function keyFor(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

function fromThisSite(req: Request): boolean {
  const site = new URL(req.url).host;
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  try {
    return new URL(req.headers.get('referer') ?? req.headers.get('origin') ?? '').host === site;
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return json({ error: 'unavailable' }, 503);
  const url = new URL(req.url);
  if (url.pathname.endsWith('/config')) return json({ publicKey });
  if (!fromThisSite(req)) return json({ error: 'forbidden' }, 403);

  const store = getStore('push');
  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as Partial<StoredSubscription> | null;
    const sub = body?.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || typeof body?.search !== 'string')
      return json({ error: 'bad-request' }, 400);
    if (body.search.length > 2000) return json({ error: 'bad-request' }, 400);
    const record: StoredSubscription = {
      subscription: sub,
      search: body.search,
      createdAt: Date.now(),
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

export const config: Config = { path: ['/api/push/config', '/api/push/subscribe'] };
