// Plan codes: a short code from the server that opens this plan on another device.
import { normaliseCode } from './state.ts';

export type PlanCodeErrorCode = 'invalid' | 'not-found' | 'ended' | 'forbidden' | 'failed';

export class PlanCodeError extends Error {
  code: PlanCodeErrorCode;
  constructor(code: PlanCodeErrorCode) {
    super(code);
    this.code = code;
  }
}

// The server names the problem in the body; anything unexpected is a plain failure.
async function failure(res: Response): Promise<PlanCodeError> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const known: PlanCodeErrorCode[] = ['invalid', 'ended', 'forbidden'];
  const code = known.find((k) => k === body?.error) ?? 'failed';
  return new PlanCodeError(code);
}

// The code for a plan is asked for once per page; a rerender shows the same one.
let issued: { search: string; code: string } | null = null;

export function issuedCode(search: string): string | null {
  return issued?.search === search ? issued.code : null;
}

export async function createCode(search: string): Promise<string> {
  const known = issuedCode(search);
  if (known) return known;
  let res: Response;
  try {
    res = await fetch('/api/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ search }),
    });
  } catch {
    throw new PlanCodeError('failed');
  }
  if (!res.ok) throw await failure(res);
  const { code } = (await res.json()) as { code: string };
  issued = { search, code };
  return code;
}

// The plan query string a code stands for.
export async function lookupCode(raw: string): Promise<string> {
  const code = normaliseCode(raw);
  if (!code) throw new PlanCodeError('invalid');
  let res: Response;
  try {
    res = await fetch(`/api/code/${code}`);
  } catch {
    throw new PlanCodeError('failed');
  }
  if (!res.ok) throw await failure(res);
  const { search } = (await res.json()) as { search: string | null };
  if (search === null) throw new PlanCodeError('not-found');
  return search;
}
