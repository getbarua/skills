// Barua event emitter. Server only: it carries your secret integration key,
// so it refuses to run in a page or in a browser worker. Copy this file
// into your backend. For a JavaScript backend, save it as emit.mjs
// and delete the type annotations. It uses only fetch, AbortSignal,
// setTimeout, URL and JSON, so it runs on Node 18 and later, Deno, Bun and
// Workers.
//
//   const emit = createBaruaEmitter({ apiKey: env.BARUA_API_KEY, apiUrl: env.BARUA_API_URL });
//   const event = { event_id: `signed_up:${user.id}`, name: 'signed_up', external_id: String(user.id),
//     occurred_at: user.created_at.toISOString(), properties: { email: user.email } };
//   const result = await emit(event);
//   if (!result.ok) console.error('Barua event not sent', event.name, event.event_id, result.status, result.body);
//
// Call it after the database commit, from a job queue or your platform's
// waitUntil, else await it before you respond. Never leave a send running
// after the response: a serverless or edge platform can end the invocation
// there, and the event is lost along with its failure log. It retries 429,
// 5xx and network errors with backoff, a timeout included, which is safe
// because Barua drops duplicates by event_id. Any other answer comes back at
// once. Each attempt waits at most ATTEMPT_TIMEOUT_MS for Barua. The first
// pause is about FIRST_WAIT_MS and doubles, with jitter, and no pause lasts
// more than MAX_WAIT_MS, even when Retry-After asks for longer. Lower
// `attempts` until every attempt and pause together fit the time your
// platform gives the send. `attempts: 1` never retries.
//
// createBaruaEmitter throws when the key or BARUA_API_URL is wrong, when
// `attempts` is anything but a whole number from 1 to MAX_ATTEMPTS, when
// there is no fetch, and in a browser, so a misconfigured deploy fails at
// startup rather than dropping every event. The emit it returns
// never throws and never rejects: every failure resolves as `ok: false`
// with the status and Barua's answer, so a catch handler on it never runs.
// A send that got no answer resolves with status 0 and body.code
// network_error.
// Check `ok` and log a failure with the event's name and event_id, never
// the key. Barua can't see an event that never arrived, so that log is its
// only trace. `ok` is true only for Barua's own answer, a 202 whose body
// has `receipt_id` and `records`. Any other answer is `ok: false` with its
// status, another 2xx included: a 200 or 204 there came from something
// else, such as a proxy or a wrong BARUA_API_URL, and took nothing. `ok` is
// about the request: a 202 can still hold a quarantined event, which
// Barua keeps with its reasons and verify lists under `invalid`.
// `body.records` has each event's disposition.

export interface BaruaEvent {
  event_id: string;
  name: string;
  external_id: string;
  occurred_at: string;
  properties?: Record<string, unknown>;
}
export interface BaruaEmitResult { ok: boolean; status: number; body: unknown }
export interface BaruaEmitterOptions {
  apiKey: string;
  apiUrl?: string;
  fetch?: typeof fetch;
  attempts?: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_ATTEMPTS = 5;
const FIRST_WAIT_MS = 500;
const ATTEMPT_TIMEOUT_MS = 10_000;
const MAX_WAIT_MS = 30_000;

// True in a page or a browser worker. A page has `document`. Every browser
// worker, module workers included, has `importScripts` and a user agent that
// starts with Mozilla/, a token almost every browser sends. Server runtimes
// pass: Node, Bun and Deno have no importScripts (Deno's own workers do have
// WorkerGlobalScope, so that name can't tell a browser), and Cloudflare
// Workers, which keep an importScripts stub on compatibility dates before
// 2024-03-04, report the user agent Cloudflare-Workers. This catches an
// emitter bundled into browser code at startup. It can't take back a key
// that a browser bundle already carries, so the key stays in server code.
function inBrowser(): boolean {
  const scope = globalThis as { document?: unknown; importScripts?: unknown; navigator?: { userAgent?: unknown } };
  if (typeof scope.document !== 'undefined') return true;
  const agent = scope.navigator?.userAgent;
  return typeof scope.importScripts === 'function' && typeof agent === 'string' && agent.startsWith('Mozilla/');
}

export function createBaruaEmitter({ apiKey, apiUrl, fetch: send = globalThis.fetch, attempts = MAX_ATTEMPTS }: BaruaEmitterOptions) {
  if (inBrowser()) throw new Error('Barua events are sent from your server only.');
  // attempts often comes from config or a time budget. Below 1, or NaN, it
  // would send nothing and resolve every event as failed; Infinity would
  // retry forever. events.md allows 5 attempts in all.
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_ATTEMPTS) {
    throw new Error(`attempts must be a whole number from 1 to ${MAX_ATTEMPTS}.`);
  }
  // Without one, every send would fail as network_error after all its retries.
  if (typeof send !== 'function') throw new Error('Barua needs fetch: run on Node 18 or later, or pass one as fetch.');
  if (typeof apiKey !== 'string' || !/^ik_[A-Za-z0-9_-]{43}$/.test(apiKey)) {
    throw new Error('Barua needs an integration key: ik_ followed by 43 characters, from BARUA_API_KEY.');
  }
  // The key travels in a header, so it leaves this machine only over https.
  // Plain http is allowed to this machine alone, the same rule (and the same
  // hosts) as the skill's scripts/verify.mjs.
  let base: URL | null = null;
  try { base = new URL(apiUrl || 'https://barua.ai'); } catch { /* refused below */ }
  if (!base || (base.protocol !== 'https:' && !(base.protocol === 'http:' && LOCAL_HOSTS.has(base.hostname)))) {
    throw new Error('BARUA_API_URL must be an https URL, such as https://barua.ai. Plain http works only for localhost.');
  }
  const url = new URL('/api/integrations/v1/events', base).href;

  // `mode: 'backfill'` is for history. Live events are what your product
  // sends as they happen, and only those finish Barua's deploy check.
  return async function emit(events: BaruaEvent | BaruaEvent[], options: { mode?: 'live' | 'backfill' } = {}): Promise<BaruaEmitResult> {
    let last: BaruaEmitResult = { ok: false, status: 0, body: null };
    try {
      // A misspelt mode would send history as live, which can finish the
      // deploy check without a real-time emitter. It resolves unsent instead.
      if (options.mode !== undefined && options.mode !== 'live' && options.mode !== 'backfill') {
        throw new Error(`mode must be 'live' or 'backfill', not ${JSON.stringify(options.mode)}.`);
      }
      const records = Array.isArray(events) ? events : [events];
      const body = JSON.stringify(options.mode === 'backfill' ? { mode: 'backfill', records } : { records });
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let wait = Math.min(FIRST_WAIT_MS * 2 ** (attempt - 1) * (0.5 + Math.random()), MAX_WAIT_MS);
        try {
          const response = await send(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body,
            signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          });
          const text = await response.text();
          let parsed: unknown = text;
          try { parsed = JSON.parse(text); } catch { /* keep the text */ }
          // Barua answers a send it took with 202 and a receipt, and with
          // nothing else (events.md). Judging by response.ok would count a
          // 200 or 204 from a proxy as sent, with no retry and no log.
          const receipt = parsed as { receipt_id?: unknown; records?: unknown } | null;
          const accepted = response.status === 202 && typeof receipt === 'object' && receipt !== null
            && typeof receipt.receipt_id === 'string' && Array.isArray(receipt.records);
          last = { ok: accepted, status: response.status, body: parsed };
          if (response.status !== 429 && response.status < 500) return last;
          // Whole seconds only (RFC 9110 delay-seconds). An empty or
          // negative value keeps the backoff instead of no wait at all.
          const retryAfter = response.headers.get('retry-after')?.trim() ?? '';
          if (/^\d+$/.test(retryAfter)) wait = Math.min(Number(retryAfter) * 1000, MAX_WAIT_MS);
        } catch (error) {
          last = { ok: false, status: 0, body: { code: 'network_error', message: String(error) } };
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, wait));
      }
    } catch (error) {
      last = { ok: false, status: 0, body: { code: 'invalid_event', message: String(error) } };
    }
    return last;
  };
}
