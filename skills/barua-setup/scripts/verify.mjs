// barua-setup verify: asks Barua what arrived from your key and exits with
// the verdict, so a coding agent can loop on it. Node 18.17 or later, no
// dependencies. It prints one JSON object and nothing else, and it never
// reads from the terminal, so a headless agent can run it unattended.
//
//   node scripts/verify.mjs --since 2026-09-26T10:00:00Z
//
// The exit codes, and the verdict behind them, come from Barua's
// GET /api/integrations/v1/events/status. This script never recomputes them.
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EXIT = { ok: 0, error: 1, auth: 2, validation: 3, needs_human: 4 };
const VERDICT_EXITS = new Set([EXIT.ok, EXIT.validation, EXIT.needs_human]);
const DEFAULT_API = 'https://barua.ai';
const STATUS_PATH = '/api/integrations/v1/events/status';
const RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_WAIT_MS = 30_000;
const ENV_FILES = ['.env.local', '.env'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const KEY_FIX = 'Ask the workspace owner for a Barua test key. Run git check-ignore -q <env file> on the file you mean to write, and put the key there as BARUA_API_KEY only when it exits 0.';
// A live key gets no verdict in either mode. Agents trigger flows with the
// key verify reads, so a live one there sends live events, and the test
// verdict never holds what a live key sent. Exit 2 is where an agent
// already stops and asks for a test key.
const LIVE_KEY = {
  code: 'live_key',
  message: 'This is a live key. Agents use the test key. With a live one they make no other call to Barua and run no flows. A person keeps the live key in hosting secrets.',
  fix: KEY_FIX,
};
const HELP = `Usage: node scripts/verify.mjs [--since <time>] [--live] [--api <url>]

Asks Barua what arrived from your key since --since, prints one JSON object,
and exits with the verdict:
  0  nothing left to do for this mode
  1  verify couldn't run; error says why
  2  no test key (none, or a live one), or Barua refused the key; stop
     calling Barua and running flows, and ask the owner for a test key
  3  fix each entry in missing and invalid, then run again with the same --since,
     or with a --since after your fix when warnings says more than 10,000 failed
  4  a person must act; show them each needs_human url and why

  --since <time>  ISO 8601 with a timezone, such as 2026-09-26T10:00:00Z.
                  Barua reads the last 24 hours without it, and at most 7 days.
  --live          the live verdict (what production sent) instead of the test one.
  --api <url>     Barua's address, https (plain http only for localhost).
                  Default: BARUA_API_URL, else https://barua.ai.

The key comes from BARUA_API_KEY, else a BARUA_API_KEY= line in ./.env.local
or ./.env. Agents use the test key, and write it only into a file for which
git check-ignore -q <env file> exits 0.
`;

const mode = process.argv.includes('--live') ? 'live' : 'test';

const flagError = (message) => ({
  exit: EXIT.error,
  error: { code: 'invalid_flag', message, fix: 'Run node scripts/verify.mjs --help for the flags.' },
});

/** The value of NAME in an env file's text: the last NAME= line, with an
 *  optional export, quotes, and a trailing comment. */
function envFileValue(text, name) {
  let found = null;
  const line = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(line);
    if (!match) continue;
    const value = match[1].trim();
    const quoted = value.match(/^(["'])(.*?)\1/);
    found = quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim();
  }
  return found;
}

/** NAME from the environment, else from ./.env.local, else ./.env. */
function setting(name) {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  for (const file of ENV_FILES) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const value = envFileValue(text, name);
    if (value) return value;
  }
  return null;
}

/** Retry-After as whole seconds or an HTTP date, capped; anything else,
 *  such as -5 or an empty value, gets the exponential backoff, never a
 *  wait of nothing (RFC 9110 section 10.2.3). */
function waitFor(response, attempt) {
  const header = response?.headers.get('retry-after')?.trim() ?? '';
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : /GMT$/.test(header) ? Date.parse(header) - Date.now() : Number.NaN;
  if (Number.isFinite(ms)) return Math.min(Math.max(ms, 0), MAX_WAIT_MS);
  return 500 * 2 ** attempt;
}

/** GET the status, retrying 429, 5xx and network errors RETRIES times. */
async function readStatus(url, key) {
  let last = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (last) await sleep(last.wait);
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'user-agent': 'barua-setup-verify/1' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }
      if (response.status !== 429 && response.status < 500) return { status: response.status, body };
      last = { status: response.status, body, wait: waitFor(response, attempt) };
    } catch (error) {
      last = { status: 0, failure: error, wait: waitFor(null, attempt) };
    }
  }
  return last;
}

const isErrorBody = (body) => body !== null && typeof body === 'object'
  && ['code', 'message', 'fix'].every((field) => typeof body[field] === 'string');
const errorBody = (body) => ({ code: body.code, message: body.message, fix: body.fix });
const list = (value) => (Array.isArray(value) ? value : []);

async function main() {
  let args;
  try {
    ({ values: args } = parseArgs({
      options: { live: { type: 'boolean' }, since: { type: 'string' }, api: { type: 'string' }, help: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return flagError(error.message);
  }
  if (args.help) return { help: true };

  if (args.since !== undefined) {
    const zoned = /(?:z|[+-]\d{2}:?\d{2})$/i.test(args.since);
    if (!zoned || !Number.isFinite(Date.parse(args.since))) {
      return flagError(`--since must be an ISO 8601 time with a timezone, such as 2026-09-26T10:00:00Z. Got ${JSON.stringify(args.since)}.`);
    }
  }

  const apiText = args.api ?? setting('BARUA_API_URL') ?? DEFAULT_API;
  let api;
  try { api = new URL(apiText); } catch { return flagError(`--api must be a URL such as ${DEFAULT_API}.`); }
  // The key travels in a header, so only https leaves this machine.
  // references/emit.ts holds BARUA_API_URL to the same rule and hosts.
  if (api.protocol !== 'https:' && !(api.protocol === 'http:' && LOCAL_HOSTS.has(api.hostname))) {
    return flagError('--api must be an https URL. Plain http works only for localhost.');
  }

  const key = setting('BARUA_API_KEY');
  if (!key) {
    return {
      exit: EXIT.auth,
      error: { code: 'missing_key', message: 'No BARUA_API_KEY in the environment, ./.env.local or ./.env.', fix: KEY_FIX },
    };
  }

  const url = new URL(STATUS_PATH, api);
  if (args.since !== undefined) url.searchParams.set('since', args.since);
  const result = await readStatus(url, key);

  if (result.status === 0) {
    const reason = result.failure?.name === 'TimeoutError' ? 'the request timed out'
      : result.failure?.cause?.code ?? result.failure?.message ?? 'the network failed';
    return {
      exit: EXIT.error,
      error: { code: 'unreachable', message: `Could not reach ${api.origin}: ${reason}.`, fix: 'Check --api or BARUA_API_URL and the network, then run verify again.' },
    };
  }
  if (result.status === 401) {
    return { exit: EXIT.auth, error: isErrorBody(result.body) ? errorBody(result.body) : { code: 'invalid_key', message: 'Barua refused the key.', fix: KEY_FIX } };
  }
  if (result.status !== 200) {
    return {
      exit: EXIT.error,
      error: isErrorBody(result.body) ? errorBody(result.body)
        : { code: 'unavailable', message: `Barua answered ${result.status}.`, fix: 'Run verify again in a minute.' },
    };
  }

  const body = result.body;
  if (body?.key_mode === 'live') return { exit: EXIT.auth, key_mode: 'live', error: LIVE_KEY };
  const verdict = body?.key_mode === 'test' ? body.verdict?.[mode] : null;
  if (!verdict || !VERDICT_EXITS.has(verdict.exit)) {
    return {
      exit: EXIT.error,
      error: { code: 'unexpected_response', message: `Barua's answer had no ${mode} verdict.`, fix: 'Run verify again. If it repeats, write to chris@barua.ai.' },
    };
  }
  const warnings = [];
  if (verdict.failures_truncated) {
    warnings.push(`More than 10,000 ${mode} events failed since ${body.since}. Fix what is listed, then run verify again with a --since after your fix.`);
  }
  return {
    exit: verdict.exit,
    since: body.since ?? null,
    key_mode: body.key_mode,
    plan_version: body.plan_version ?? null,
    missing: list(verdict.missing),
    invalid: list(verdict.invalid),
    awaiting_approval: list(verdict.awaiting_approval),
    not_seen_yet: list(verdict.not_seen_yet),
    not_emitted: list(verdict.not_emitted),
    needs_human: list(verdict.needs_human),
    warnings,
  };
}

const result = await main().catch((error) => ({
  exit: EXIT.error,
  error: { code: 'internal', message: String(error?.message ?? error), fix: 'Run verify again. If it repeats, write to chris@barua.ai.' },
}));

if (result.help) {
  process.stdout.write(HELP, () => process.exit(EXIT.ok));
} else {
  const out = {
    ok: result.exit === EXIT.ok,
    exit: result.exit,
    mode,
    since: null,
    key_mode: null,
    plan_version: null,
    missing: [],
    invalid: [],
    awaiting_approval: [],
    not_seen_yet: [],
    not_emitted: [],
    needs_human: [],
    warnings: [],
    error: null,
    ...result,
  };
  out.ok = out.exit === EXIT.ok;
  // Exit only once the JSON has reached the pipe: a bare exit can cut a
  // large write to a pipe short.
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`, () => process.exit(out.exit));
}
