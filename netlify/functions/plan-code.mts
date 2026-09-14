// Short codes for opening a plan on another device, where pasting a link is awkward.
// POST /api/code with { search } stores the plan under a fresh code and returns it;
// GET /api/code/:code returns the plan, or a null search for a code that is not known. The push
// tick removes codes once the plan's days have ended.
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { randomInt } from 'node:crypto';
import { PLAN_CODE } from '../../src/config.ts';
import { normaliseCode, planStillRunning } from '../../src/ui/state.ts';
import { fromThisSite, json, validSearch } from '../lib/api.ts';

export const CODE_STORE = 'codes';

export interface StoredCode {
  // The plan as a query string, the same one the page carries.
  search: string;
  createdAt: number;
}

function freshCode(): string {
  let code = '';
  for (let i = 0; i < PLAN_CODE.length; i++) code += PLAN_CODE.alphabet[randomInt(PLAN_CODE.alphabet.length)];
  return code;
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (!fromThisSite(req)) return json({ error: 'forbidden' }, 403);
  const store = getStore(CODE_STORE);

  if (req.method === 'GET') {
    const code = normaliseCode(context.params.code ?? '');
    if (!code) return json({ error: 'invalid' }, 400);
    const record = (await store.get(code, { type: 'json' })) as StoredCode | null;
    return json({ search: record?.search ?? null });
  }
  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { search?: unknown } | null;
    if (!validSearch(body?.search)) return json({ error: 'bad-request' }, 400);
    if (!planStillRunning(body.search)) return json({ error: 'ended' }, 400);
    const record: StoredCode = { search: body.search, createdAt: Date.now() };
    // A code already in use is simply not taken; the odds are tiny, so a few tries always suffice.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = freshCode();
      const result = await store.setJSON(code, record, { onlyIfNew: true });
      if (result.modified) return json({ code });
    }
    return json({ error: 'failed' }, 500);
  }
  return json({ error: 'method' }, 405);
};

export const config: Config = { path: ['/api/code', '/api/code/:code'] };
