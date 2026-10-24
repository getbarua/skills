// Read-only management diagnostics and private email artifacts. Node 18.17+.
import { parseArgs } from 'node:util';
import { readPrivateInput } from './private-input.mjs';
import { fail, origin } from './owner-storage.mjs';
import { privateOutput } from './inspect-output.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9_]{0,63}$/;
const KEY = /^mk_[A-Za-z0-9_-]{43}$/;
const secretFields = /secret|password|authorization|(?:^|_)token$|^(access|refresh|id|auth|api|bearer)Token$|(?:management|integration|runtime|api)[_-]?key$|^key$/i;
const htmlFields = /^(?:body_?html|html)$/i;
const credentials = [process.env.BARUA_MANAGEMENT_KEY, process.env.BARUA_OWNER_TOKEN, process.env.BARUA_API_KEY].filter(Boolean);
const CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
const commands = {
  keys: { path: '/keys' }, brand: { path: '/brand' }, plan: { path: '/plan' },
  'event-status': { path: '/events/status' }, events: { path: '/diagnostics/events' }, stats: { path: '/diagnostics/stats', options: ['health'] },
  catalog: { path: '/plays/catalog' }, domain: { path: '/domain', options: ['provider', 'config-id'] },
  'inbound-templates': { path: '/templates/inbound', options: ['before'] },
  'inbound-template': { path: a => `/templates/inbound/${a.id}`, id: true },
  plays: { path: '/plays', options: ['revision', 'after', 'group', 'status', 'query'] },
  'play-map': { path: '/plays/map', options: ['revision', 'after'] },
  'play-mode': { path: '/plays/mode' }, 'play-results': { path: '/plays/results', options: ['play-id'], repeated: 'play-id' },
  'play-template': { path: a => `/plays/${a['play-id']}/template`, options: ['play-id', 'revision-id', 'step-id', 'language'], play: true },
  'play-profiles': { path: '/plays/profiles', body: true },
  'play-preview': { path: a => `/plays/${a['play-id']}/preview`, options: ['play-id'], play: true, body: true },
  'profile-preview': { path: a => `/people/${a.id}/preview`, id: true, body: true },
  emails: { path: '/emails', options: ['status', 'person-id', 'decision-id', 'campaign-recipient-id', 'play-id', 'limit', 'cursor'] },
  email: { path: a => `/emails/${a.id}`, id: true },
  'email-preview': { path: a => `/emails/${a.id}/preview`, id: true, download: 'preview' },
  'email-raw': { path: a => `/emails/${a.id}/raw`, id: true, download: 'raw' },
};
const HELP = `Usage: node scripts/inspect.mjs <command> [options]

Reads: keys, brand, plan, event-status, events, stats, catalog, domain,
       inbound-templates, inbound-template, plays, play-map, play-mode,
       play-results, play-template, play-profiles, play-preview, profile-preview,
       emails, email, email-preview, email-raw

BARUA_URL defaults to https://barua.ai. BARUA_MANAGEMENT_KEY is the workspace
management key. Owner tokens and event keys cannot substitute for it.
BARUA_WORKSPACE_ID or --workspace optionally checks its exact workspace.
Credentials never belong in arguments. Install owner-storage.mjs,
private-input.mjs and inspect-output.mjs beside this file.

--id <uuid>                 email, inbound template or preview profile ID
--input-file <file>         private JSON for play-profiles/play-preview/profile-preview;
                            otherwise those commands read JSON stdin
--output-file <new-file>    private exact JSON artifact for ordinary reads;
                            required for email-preview and email-raw
--play-id <slug>            selected Play; repeat up to 12 times for play-results
--revision-id <uuid>        exact template revision
--step-id <id>              exact template step
--language <tag>            exact template language
--revision <value>          plays/map snapshot revision
--after <value>             plays/map next cursor
--group <slug>              plays group
--query <text>              plays label search (never a customer email)
--status <value>            plays state or email status, according to the command
--before <timestamp>        inbound templates next timestamp
--provider <ses|mailgun>    sender configuration; mailgun is historical only
--config-id <uuid>          exact sender configuration
--person-id <uuid>          emails filter
--decision-id <uuid>        emails filter
--campaign-recipient-id <uuid>  emails filter
--limit <1..100>            emails page size
--cursor <value>            emails next cursor
--health                   stats includes delivery-ledger health reads
--timeout-ms <1..300000>    shared time limit, default 60000

These commands perform reads only. POST lookup/preview bodies are private
inputs and do not send or save email. Raw HTML never appears on stdout.
email-preview saves the server's inert text preview with an embedded restrictive
content policy for local viewing. email-raw explicitly saves the original
untrusted HTML bytes; do not open that file as a preview. Output files are
exclusive mode 0600, refuse final symlinks, and must be ignored inside Git.
JSON output hides HTML fields; --output-file saves the full private response.
No automatic retries or page walks. Follow the returned cursor deliberately.
Use manage.mjs for people, saved segments, campaigns and management operations.
Exit: 0 success, 1 helper/transport error, 2 authorization refused, 3 server refusal.
`;

function safe(value) {
  if (typeof value === 'string') {
    for (const credential of credentials) value = value.split(credential).join('[REDACTED]');
    return value.replace(/\b(?:pk|mk|ik)_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) =>
    [safe(name), secretFields.test(name) ? '[REDACTED]' : htmlFields.test(name) ? '[PRIVATE_CONTENT]' : safe(item)]));
  return value;
}
async function bodyInput(file, deadline) {
  let text;
  if (file) {
    text = readPrivateInput(file, { maxBytes: 16384, deadline, code: 'input_size', message: 'Use a JSON object of at most 16 KiB.' }).text;
  } else {
    if (process.stdin.isTTY) fail('input_required', 'Supply private JSON stdin or --input-file.');
    const chunks = []; let size = 0;
    const timer = setTimeout(() => process.stdin.destroy(Object.assign(new Error('The time limit ended while reading input.'), { code: 'timeout' })), Math.max(1, deadline - Date.now()));
    try { for await (const chunk of process.stdin) { size += chunk.length; if (size > 16384) fail('input_size', 'Use a JSON object of at most 16 KiB.'); chunks.push(chunk); } }
    finally { clearTimeout(timer); }
    text = Buffer.concat(chunks).toString('utf8');
  }
  let body; try { body = JSON.parse(text); } catch { fail('invalid_json', 'Use a JSON object.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_json', 'Use a JSON object.');
  return body;
}

async function main() {
  let parsed;
  try { parsed = parseArgs({ allowPositionals: true, strict: true, options: Object.fromEntries([
    'workspace', 'id', 'input-file', 'output-file', 'revision-id', 'step-id', 'language', 'revision', 'after', 'group', 'status', 'query',
    'before', 'provider', 'config-id', 'person-id', 'decision-id', 'campaign-recipient-id', 'limit', 'cursor', 'timeout-ms']
    .map(name => [name, { type: 'string' }]).concat([['play-id', { type: 'string', multiple: true }], ['health', { type: 'boolean' }], ['help', { type: 'boolean' }]])) }); }
  catch { fail('invalid_flag', 'Use --help for supported options. Credentials are never arguments.'); }
  const args = parsed.values, [command] = parsed.positionals, spec = commands[command];
  if (args.help) { console.log(HELP); return; }
  if (parsed.positionals.length !== 1 || !spec) fail('invalid_command', 'Choose one read command. Use --help.');
  const allowed = new Set(['workspace', 'timeout-ms', 'output-file', ...(spec.options ?? []), ...(spec.id ? ['id'] : []), ...(spec.body ? ['input-file'] : [])]);
  for (const name of Object.keys(args)) if (!allowed.has(name)) fail('invalid_flag', `The ${name} option does not apply to this read.`);
  if (args['timeout-ms'] !== undefined && (!/^\d+$/.test(args['timeout-ms']) || +args['timeout-ms'] < 1 || +args['timeout-ms'] > 300000)) fail('invalid_flag', 'Use a timeout between 1 and 300000 milliseconds.');
  const deadline = Date.now() + Number(args['timeout-ms'] ?? 60000);
  const base = origin(process.env.BARUA_URL ?? 'https://barua.ai');
  const credential = process.env.BARUA_MANAGEMENT_KEY;
  if (!KEY.test(credential ?? '')) fail('management_key_required', 'Set BARUA_MANAGEMENT_KEY to a workspace management key.');
  const workspace = args.workspace ?? process.env.BARUA_WORKSPACE_ID;
  if (workspace !== undefined && !UUID.test(workspace)) fail('invalid_flag', 'Use a valid workspace ID.');
  for (const name of ['id', 'revision-id', 'config-id', 'person-id', 'decision-id', 'campaign-recipient-id']) {
    if ((name === 'id' && spec.id || name === 'revision-id' && command === 'play-template' || args[name] !== undefined) && !UUID.test(args[name] ?? '')) fail('invalid_flag', `Use a valid ${name}.`);
  }
  const plays = args['play-id'];
  if (plays && (plays.length > (spec.repeated ? 12 : 1) || plays.some(play => !SLUG.test(play)))) fail('invalid_flag', 'Use valid Play IDs, up to 12 for results.');
  if ((spec.play || spec.repeated) && !plays?.length) fail('invalid_flag', 'Choose the exact Play ID.');
  if (plays && !spec.repeated) args['play-id'] = plays[0];
  for (const name of ['after', 'revision', 'group', 'query', 'step-id', 'language', 'before', 'cursor']) {
    if (args[name] !== undefined && (!args[name] || args[name].length > 2048 || /[\x00-\x1f\x7f]/.test(args[name]))) fail('invalid_flag', `Use a valid ${name}.`);
  }
  if (command === 'play-template' && (!args['step-id'] || !args.language)) fail('invalid_flag', 'Choose the template step and language.');
  if (args.limit !== undefined && (!/^\d+$/.test(args.limit) || +args.limit < 1 || +args.limit > 100)) fail('invalid_flag', 'Use a page size from 1 to 100.');
  if (args.provider !== undefined && !['ses', 'mailgun'].includes(args.provider)) fail('invalid_flag', 'Use ses or mailgun.');
  if (spec.download && !args['output-file']) fail('private_output', 'Choose a new private --output-file before downloading email content.');
  const body = spec.body ? await bodyInput(args['input-file'], deadline) : undefined;
  const query = new URLSearchParams();
  const queryNames = { 'config-id': 'configId', 'revision-id': 'revisionId', 'step-id': 'stepId', query: 'q', 'play-id': 'playId' };
  for (const name of spec.options ?? []) {
    if (args[name] === undefined || spec.play && name === 'play-id') continue;
    const key = command === 'emails' ? name.replaceAll('-', '_') : queryNames[name] ?? name;
    for (const value of Array.isArray(args[name]) ? args[name] : [args[name]]) query.append(key, value === true ? '1' : String(value));
  }
  let sink;
  try {
    if (args['output-file']) sink = privateOutput(args['output-file'], deadline);
    const path = typeof spec.path === 'function' ? spec.path(args) : spec.path;
    if (Date.now() >= deadline) fail('timeout', 'The time limit ended before the read started.');
    let response;
    try { response = await fetch(`${base}/api/management/v1${path}${query.size ? `?${query}` : ''}`, {
      method: spec.body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      headers: { authorization: `Bearer ${credential}`, ...(workspace ? { 'x-workspace-id': workspace } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}), accept: spec.download ? '*/*' : 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }); } catch { fail('read_unavailable', 'The read did not finish. No change was requested.'); }
    const chunks = []; let bytes = 0;
    try { for await (const chunk of response.body ?? []) { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) fail('response_size', 'The read exceeded 8 MiB.'); chunks.push(chunk); } }
    catch { fail('read_unavailable', 'The response could not be read completely. No artifact was saved.'); }
    const data = Buffer.concat(chunks);
    if (!response.ok) {
      let code = 'read_refused'; try { const parsed = JSON.parse(data); if (/^[a-z][a-z0-9_]{0,79}$/.test(parsed.code)) code = parsed.code; } catch {}
      throw Object.assign(new Error(`The server refused this read (HTTP ${response.status}).`), { code, status: response.status });
    }
    if (spec.download) {
      const type = response.headers.get('content-type') ?? '';
      if (spec.download === 'raw') {
        if (!type.startsWith('application/octet-stream') || !/^attachment(?:;|$)/i.test(response.headers.get('content-disposition') ?? '')) fail('unsafe_response', 'The server did not return an explicit raw attachment.');
        console.log(JSON.stringify(safe({ ok: true, artifact: { ...sink.save(data), kind: 'untrusted_raw_html' } })));
      } else {
        if (!type.startsWith('text/html') || response.headers.get('content-security-policy') !== CSP) fail('unsafe_response', 'The server did not return a protected email preview.');
        const html = data.toString('utf8');
        // The canonical server preview has only escaped text in one <pre>.
        // Refuse a changed format rather than save active content locally.
        if (!/^<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Email text preview<\/title><\/head><body><pre>[^<]*<\/pre><\/body><\/html>$/.test(html)) fail('unsafe_response', 'The server preview is not an inert text document.');
        const document = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`);
        console.log(JSON.stringify(safe({ ok: true, artifact: { ...sink.save(Buffer.from(document)), kind: 'inert_email_preview' } })));
      }
    } else {
      let result; try { result = JSON.parse(data); } catch { fail('invalid_response', 'The server did not return JSON.'); }
      const artifact = sink ? sink.save(data) : undefined;
      console.log(JSON.stringify(safe({ ok: true, body: result, ...(artifact ? { artifact } : {}) })));
    }
  } finally { sink?.close(); }
}
main().catch(error => {
  const known = typeof error.code === 'string' && /^[a-z][a-z0-9_]+$/.test(error.code);
  console.log(JSON.stringify(safe({ ok: false, error: { code: known ? error.code : 'helper_error',
    message: known ? error.message : 'The read could not complete. Check the private file and options.', ...(error.status ? { status: error.status } : {}) } })));
  process.exitCode = [401, 403].includes(error.status) || error.code === 'management_key_required' ? 2 : error.status ? 3 : 1;
});
