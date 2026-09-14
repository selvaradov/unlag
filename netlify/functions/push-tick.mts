// Every five minutes: regenerate each subscribed plan and push whatever falls due since the
// last delivery. Subscriptions the push service reports gone, plans that cannot be drawn, and
// plans over for more than a week are removed. A failed delivery is retried next run. Plan codes
// whose days have ended are removed on the same schedule.
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import webpush from 'web-push';
import { generatePlan } from '../../src/algorithm/generate.ts';
import { planProblem } from '../../src/algorithm/validate.ts';
import { dueMessages } from '../../src/push/due.ts';
import { hasPlanInUrl, planStillRunning, readInput } from '../../src/ui/state.ts';
import { CODE_STORE, type StoredCode } from './plan-code.mts';
import type { StoredSubscription } from './push-subscribe.mts';

const KEEP_AFTER_PLAN_MS = 7 * 24 * 3_600_000;
// Never replay more than this, so a stalled scheduler does not dump old instructions.
const MAX_REPLAY_MS = 3_600_000;

async function sweepCodes(now: number): Promise<number> {
  const store = getStore(CODE_STORE);
  const { blobs } = await store.list();
  let removed = 0;
  for (const { key } of blobs) {
    const record = (await store.get(key, { type: 'json' })) as StoredCode | null;
    if (record && planStillRunning(record.search, now)) continue;
    await store.delete(key);
    removed += 1;
  }
  return removed;
}

export default async (): Promise<Response> => {
  const codesRemoved = await sweepCodes(Date.now());
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return new Response('no keys', { status: 503 });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const store = getStore('push');
  const now = Date.now();
  let sent = 0;
  let removed = 0;
  let retried = 0;
  const { blobs } = await store.list();
  for (const { key } of blobs) {
    const record = (await store.get(key, { type: 'json' })) as StoredSubscription | null;
    if (!record) continue;
    const input = hasPlanInUrl(record.search) ? readInput(record.search) : null;
    if (!input || planProblem(input) !== null) {
      await store.delete(key);
      removed += 1;
      continue;
    }
    const plan = generatePlan(input);
    if (now > plan.planEnd + KEEP_AFTER_PLAN_MS) {
      await store.delete(key);
      removed += 1;
      continue;
    }
    const from = Math.max(record.sentUntil, now - MAX_REPLAY_MS);
    let sentUntil = now;
    let gone = false;
    for (const m of dueMessages(plan, from, now)) {
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
          gone = true;
        } else {
          // Anything else is retried next run: mark delivery up to just before this message.
          sentUntil = m.at - 1;
          retried += 1;
        }
        break;
      }
    }
    if (gone) {
      await store.delete(key);
      removed += 1;
    } else {
      await store.setJSON(key, { ...record, sentUntil });
    }
  }
  return new Response(JSON.stringify({ subscriptions: blobs.length, sent, removed, retried, codesRemoved }), {
    headers: { 'content-type': 'application/json' },
  });
};

export const config: Config = { schedule: '*/5 * * * *' };
