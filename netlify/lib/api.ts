// Pieces shared by the API functions: JSON responses, the same site check and plan validation.
import { planProblem } from '../../src/algorithm/validate.ts';
import { hasPlanInUrl, readInput } from '../../src/ui/state.ts';

export function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

// The page's own requests carry a same-origin fetch header or a referer from this host.
export function fromThisSite(req: Request): boolean {
  const site = new URL(req.url).host;
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  try {
    return new URL(req.headers.get('referer') ?? req.headers.get('origin') ?? '').host === site;
  } catch {
    return false;
  }
}

// A plan query string that can actually be drawn.
export function validSearch(search: unknown): search is string {
  if (typeof search !== 'string' || search.length > 2000 || !search.startsWith('?')) return false;
  return hasPlanInUrl(search) && planProblem(readInput(search)) === null;
}
