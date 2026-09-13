// Every five minutes: regenerate each subscribed plan and push whatever falls due in the window
// since the last send. Subscriptions that the push service reports gone are removed.
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import webpush from 'web-push';
import { generatePlan } from '../../src/algorithm/generate.ts';
import { dueMessages } from '../../src/push/due.ts';
import { readInput } from '../../src/ui/state.ts';
import type { StoredSubscription } from './push-subscribe.mts';

// A subscription is left alone once its plan has been over for this long.
const KEEP_AFTER_PLAN_MS = 7 * 24 * 3_600_000;

export default async (): Promise<Response> => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@example.com';
  if (!publicKey || !privateKey) return new Response('no keys', { status: 503 });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const store = getStore('push');
  const now = Date.now();
  let sent = 0;
  let removed = 0;
  const { blobs } = await store.list();
  for (const { key } of blobs) {
    const record = (await store.get(key, { type: 'json' })) as StoredSubscription | null;
    if (!record) continue;
    let plan;
    try {
      plan = generatePlan(readInput(record.search));
    } catch {
      await store.delete(key);
      removed += 1;
      continue;
    }
    if (now > plan.planEnd + KEEP_AFTER_PLAN_MS) {
      await store.delete(key);
      removed += 1;
      continue;
    }
    // Never replay more than an hour, so a stalled scheduler does not dump old instructions.
    const from = Math.max(record.sentUntil, now - 3_600_000);
    const due = dueMessages(plan, from, now);
    for (const m of due) {
      try {
        await webpush.sendNotification(
          record.subscription,
          JSON.stringify({ title: m.title, body: m.body, url: `/${record.search}`, tag: m.key }),
          { TTL: 1800, urgency: 'high' },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await store.delete(key);
          removed += 1;
          break;
        }
      }
    }
    if (blobs.some((b) => b.key === key)) await store.setJSON(key, { ...record, sentUntil: now });
  }
  return new Response(JSON.stringify({ subscriptions: blobs.length, sent, removed }), {
    headers: { 'content-type': 'application/json' },
  });
};

export const config: Config = { schedule: '*/5 * * * *' };
