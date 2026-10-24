// Headless Barua management. Node 18.17+, no dependencies. Credentials come
// only from the environment; ordinary output is one redacted JSON object.
// Install private-input.mjs beside this file for bounded local JSON reads.
import { parseArgs } from 'node:util';
import { openSync, closeSync, writeFileSync, realpathSync, unlinkSync, constants, fchmodSync } from 'node:fs';
import { readPrivateInput } from './private-input.mjs';
import { dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const STATUSES = new Set(['awaiting_approval', 'ready', 'running', 'succeeded', 'failed', 'cancelled', 'stale', 'satisfied']);
const TERMINAL = new Set(['succeeded', 'satisfied', 'failed', 'cancelled', 'stale']);
const SECRET_FIELD = /secret|password|authorization|^(?:(?:access|refresh|id|auth|api|bearer)[_-]?)?token$|(?:management|integration|runtime|api)[_-]?key$|^key$/i;
const credentials = ['BARUA_MANAGEMENT_KEY', 'BARUA_OWNER_TOKEN'].map(name => process.env[name]).filter(Boolean);
// Only a successful Play detail may expose its optimistic review fingerprint.
// It is not authorization; all other token fields retain credential redaction.
const reviewSummaries = new WeakSet();
const HELP = `Usage: node scripts/manage.mjs <command> [options]

Commands: connect, recover-key, connections, capabilities, setup, usage, operations, status,
          action, resume, cancel, review, wait, proof, review-package, segments, segment, campaigns,
          campaign, campaign-recipients, campaign-job, segment-fields, play-catalog, play, play-job,
          play-definition, play-validate, play-simulate, play-runs, play-trace, play-admissions,
          play-feedback, play-paths, people, people-search, person, person-activity, person-events

BARUA_URL defaults to https://barua.ai. BARUA_MANAGEMENT_KEY authorizes
management calls. connect/recover-key/connections/review use BARUA_OWNER_TOKEN and
BARUA_WORKSPACE_ID instead. Credentials are never accepted as arguments.

--input-file <file>       JSON body for connect/action/review/people-search; otherwise stdin
--journey-review-file <file>  private source review for plan.propose or brand actions;
                             exact per-Play request for play.propose;
                             exact approval observations for play.approve;
                             requires its current generated .md sibling
--opportunity-id <id>    reviewed marketing opportunity for play.propose;
                         requires --journey-review-file
--idempotency-key <id>    required for connect/action; reuse after response loss
--id <uuid>              operation ID for status/resume/cancel/review/wait/proof
                         connection ID for recover-key; segment/campaign ID for its read;
                         job ID for campaign-job/play-job; run ID for play-trace;
                         person ID for person/person-activity/person-events
--session-id <uuid>      session ID from person-activity, required for person-events
--cursor <cursor>        next_cursor from people/person-activity/person-events
--limit <n>              people/person-activity/person-events page size, 1..100
--play-id <slug>         exact Play ID for play and play-* inspection commands
--revision-id <uuid>     immutable revision for play/definition/validate/simulate/paths
--after <cursor>         next cursor from operations, segment/campaign lists,
                         campaign recipients or Play history pages
--status <status>        play-admissions filter: blocked, admitted, expired, cancelled
--secret-file <file>     exclusive 0600 destination; inside Git it must be ignored
--secret-command-file <file>  JSON argv array for an authorized command; the new
                             secret goes to its stdin; its output is suppressed
--timeout-ms <n>         total bound including secret storage, 1..300000, default 60000
--poll-ms <n>            wait polling interval, 100..10000, default 1000
--output-dir <new-dir>   review-package: private HTML and JSON, never overwritten
--proof-id <uuid>        review-package: read an existing delivery proof

People commands require people:read. people-search reads exactly one of email
or external_id from a private JSON body, with optional limit and cursor.
It is read-only. Keep search details out of command arguments and URLs.
Profile sections marked unavailable must not be interpreted as empty.

connect, recover-key and action key.create require a secret destination before sending.
resume and wait require one before executing a key.create operation. Never
reuse an occupied secret file. A failed secret transfer can be recovered by
repeating the same creation request or resuming its operation with a new file.
recover-key --id saves the same connection key again with owner authorization;
it takes no input or idempotency key and never creates another connection.
After a failed transfer, repeat recover-key with the same ID and a new file.
wait resumes ready operations and expired leases. It also recovers completed
key creation into the requested destination. It never grants approval.
For Play authoring actions, wait follows the saved job until its exact revision
is ready or preparation fails. An accepted operation alone is not a ready Play.
play-simulate reads synthetic simulation input from JSON; it sends no email.
usage reads the current monthly allowance. play-admissions reads waiting or
settled starts before a run; it needs customer-read permission. A blocked start
has no run ID. These commands cannot change an allowance.
proof --bind-stdin accepts JSON {eventId} to bind a real event; --input-file
also binds. Plain proof --id only reads and never waits for stdin.
Exit: 0 success, 1 helper/transport error, 2 authorization refused,
      3 terminal unsuccessful, 4 awaiting approval, 5 still running at timeout
      or delivery not yet confirmed. A proof exits 0 only when delivered.
review-package reads current setup and exact example emails without changing
anything. Optional --input-file supplies version-bound repository evidence.
Install the whole skill: this command also needs scripts/review-package.mjs.
Action evidence uses scripts/journey-review.mjs. Only its compact approval
record is sent; the source inventory stays in your private artifact.
`;

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function redact(value) {
  if (typeof value === 'string') {
    for (const credential of credentials) value = value.split(credential).join('[REDACTED]');
    return value.replace(/\b(?:ik|mk)_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) =>
    [redact(name), (SECRET_FIELD.test(name) && !(name === 'token' && reviewSummaries.has(value))) || /^event[_-]?id$/i.test(name) || (value.action === 'person.erase' && name === 'input')
      ? '[REDACTED]' : redact(item)]));
  return value;
}
function integer(value, fallback, minimum, maximum, name) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) fail('invalid_flag', `Invalid ${name}.`);
  return Number(value);
}
async function inputBody(file, deadline) {
  let text;
  if (file) {
    text = readPrivateInput(file, { maxBytes: 524288, deadline, code: 'input_too_large', message: 'Use a JSON file of at most 512 KiB.' }).text;
  } else {
    if (process.stdin.isTTY) {
      fail('input_required', 'Send the JSON body on stdin or with --input-file.');
    }
    let bytes = 0; const chunks = [];
    const timer = setTimeout(() => process.stdin.destroy(Object.assign(new Error('The time limit ended while reading the JSON body.'), { code: 'timeout' })),
      Math.max(1, deadline - Date.now()));
    try {
      for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 524288) fail('input_too_large', 'The JSON body must fit within 512 KiB.');
        chunks.push(chunk);
      }
    } finally { clearTimeout(timer); }
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(text) > 524288) fail('input_too_large', 'The JSON body must fit within 512 KiB.');
  let body;
  try { body = JSON.parse(text); } catch { fail('invalid_json', 'Send a JSON object as the request body.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_json', 'Send a JSON object as the request body.');
  return body;
}

// Input, HTTP retries/polls, Git checks and secret delivery share main's one
// absolute deadline (1..300000 ms, default 60000). Each subprocess gets at most
// 15000 ms of the remaining budget, with no extra shutdown grace. Node's spawn
// timeout only sends a signal and still waits for close: SIGTERM handlers or
// inherited pipes can keep that wait alive. Kill and detach all our handles
// at expiry, and settle independently of close. Subprocess output is private.
function secretProcess(argv, env, deadline, input) {
  const transfer = input !== undefined;
  const code = transfer ? 'secret_transfer_failed' : 'secret_destination';
  const message = transfer ? 'The secret destination command did not complete. Retry the same key request with a new secret destination.'
    : 'Could not check the secret destination Git boundary.';
  const expires = Math.min(deadline, Date.now() + 15000);
  if (Date.now() >= expires) fail(code, message);
  return new Promise((done, reject) => {
    // Never run a shell or give a subprocess the caller's Barua credentials.
    const childEnv = { ...env }; delete childEnv.BARUA_MANAGEMENT_KEY; delete childEnv.BARUA_OWNER_TOKEN;
    let child;
    try { child = spawn(argv[0], argv.slice(1), { env: childEnv, stdio: transfer ? ['pipe', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'] }); }
    catch { reject(Object.assign(new Error(message), { code })); return; }
    let settled = false, stdout = '', stderr = '', bytes = 0;
    const stop = () => {
      child.kill('SIGKILL');
      child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
      child.unref();
    };
    const finish = (error, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { stop(); reject(Object.assign(new Error(message), { code })); }
      else done({ status, stdout, stderr });
    };
    const timer = setTimeout(() => finish(true), Math.max(1, expires - Date.now()));
    child.once('error', () => finish(true));
    child.once('close', status => finish(Date.now() >= expires, status));
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream?.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 65536) { finish(true); return; }
        if (name === 'stdout') stdout += chunk; else stderr += chunk;
      });
    }
    if (transfer) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

// Reserve before requesting a key. O_EXCL refuses existing files and final
// symlinks. Resolve the parent first so the Git boundary sees the destination
// that will actually receive the credential, including symlinked directories.
async function secretSink(args, deadline) {
  if (args['secret-file'] && args['secret-command-file']) fail('invalid_flag', 'Choose one secret destination.');
  if (args['secret-file']) {
    const requested = resolve(args['secret-file']);
    const path = resolve(realpathSync(dirname(requested)), basename(requested));
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    const git = await secretProcess(['git', '-C', dirname(path), 'rev-parse', '--show-toplevel'], { ...gitEnv, LC_ALL: 'C' }, deadline);
    if (git.status !== 0 && !(git.status === 128 && /not a git repository/i.test(git.stderr))) {
      fail('secret_destination', 'Could not check the secret destination Git boundary.');
    }
    if (git.status === 0 && (await secretProcess(['git', '-C', dirname(path), 'check-ignore', '-q', '--', path], gitEnv, deadline)).status !== 0) {
      fail('secret_destination', 'A secret file inside a Git repository must already be ignored.');
    }
    let fd;
    try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch { fail('secret_destination', 'The secret destination must be a new writable file. Existing files are never overwritten.'); }
    fchmodSync(fd, 0o600);
    let saved = false;
    return {
      async save(secret) {
        if (Date.now() >= deadline) fail('secret_transfer_failed', 'The time limit ended before saving the key. Retry the same key request with a new secret destination.');
        writeFileSync(fd, `${secret}\n`); saved = true; return { secret_saved: true, destination: path };
      },
      close() { closeSync(fd); if (!saved) unlinkSync(path); },
    };
  }
  if (args['secret-command-file']) {
    let argv;
    try { argv = JSON.parse(readPrivateInput(args['secret-command-file'], { maxBytes: 65536, deadline,
      code: 'secret_destination', message: 'Use a regular secret command file of at most 64 KiB.' }).text); }
    catch { fail('secret_destination', 'The secret command file must contain a JSON argv array of at most 64 KiB.'); }
    if (!Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(arg => typeof arg !== 'string' || arg.includes('\0')) || !argv[0]) {
      fail('secret_destination', 'The secret command file must contain a nonempty JSON argv array.');
    }
    return {
      async save(secret) {
        const result = await secretProcess(argv, process.env, deadline, `${secret}\n`);
        if (result.status !== 0) fail('secret_transfer_failed', 'The secret destination command failed. Retry the same key request with a new secret destination.');
        return { secret_saved: true, destination: 'command stdin' };
      }, close() {},
    };
  }
  fail('secret_destination_required', 'Provide --secret-file or --secret-command-file before creating or recovering a key.');
}

function retryDelay(response, attempt) {
  const raw = response?.headers.get('retry-after')?.trim() ?? '';
  const delay = /^\d+$/.test(raw) ? Number(raw) * 1000 : /GMT$/i.test(raw) ? Date.parse(raw) - Date.now() : NaN;
  return Number.isFinite(delay) ? Math.max(0, delay) : 500 * 2 ** attempt;
}
function operationFrom(body) {
  const operation = body?.operation ?? body;
  if (!UUID.test(operation?.id ?? '') || !STATUSES.has(operation?.status)) fail('unexpected_response', 'Barua did not return a recognized operation.');
  return operation;
}
function operationExit(operation) {
  return ['succeeded', 'satisfied'].includes(operation.status) ? 0 : operation.status === 'awaiting_approval' ? 4
    : ['failed', 'cancelled', 'stale'].includes(operation.status) ? 3 : 5;
}

async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean' }, 'input-file': { type: 'string' }, 'idempotency-key': { type: 'string' },
    id: { type: 'string' }, 'secret-file': { type: 'string' },
    'play-id': { type: 'string' }, 'revision-id': { type: 'string' }, after: { type: 'string' }, status: { type: 'string' },
    'secret-command-file': { type: 'string' }, 'timeout-ms': { type: 'string' }, 'poll-ms': { type: 'string' }, 'bind-stdin': { type: 'boolean' },
    'output-dir': { type: 'string' }, 'proof-id': { type: 'string' }, 'journey-review-file': { type: 'string' },
    'opportunity-id': { type: 'string' },
    'session-id': { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'string' },
  } });
  if (args.help) return { help: true, exit: 0 };
  const command = positionals[0];
  const playCommands = ['play','play-definition','play-validate','play-simulate','play-runs','play-trace','play-admissions','play-feedback','play-paths'];
  const commands = ['connect','recover-key','connections','capabilities','setup','usage','operations','status','action','resume','cancel','review','wait','proof',
    'review-package','segments','segment','campaigns','campaign','campaign-recipients','campaign-job','segment-fields',
    'play-catalog','play-job','people','people-search','person','person-activity','person-events', ...playCommands];
  if (positionals.length !== 1 || !commands.includes(command)) fail('invalid_flag', 'Choose a command from --help.');
  const hasId = ['recover-key','status','resume','cancel','review','wait','proof','segment','campaign','campaign-recipients','campaign-job','play-job','play-trace','person','person-activity','person-events'].includes(command);
  if (hasId ? !UUID.test(args.id ?? '') : args.id !== undefined) fail('invalid_flag', 'Provide --id only for a command that takes a UUID.');
  if (command === 'person-events' ? !UUID.test(args['session-id'] ?? '') : args['session-id'] !== undefined) {
    fail('invalid_flag', 'Provide --session-id only for person-events, using a session UUID.');
  }
  const peoplePage = ['people','person-activity','person-events'].includes(command);
  if (args.cursor !== undefined && (!peoplePage || !args.cursor || args.cursor.length > 4096 || /[\u0000-\u001f\u007f]/.test(args.cursor))) {
    fail('invalid_flag', 'Use --cursor with a people or activity page and its returned cursor.');
  }
  if (args.limit !== undefined && (!peoplePage || !/^(?:[1-9][0-9]?|100)$/.test(args.limit))) {
    fail('invalid_flag', 'Use --limit with a people or activity page, from 1 to 100.');
  }
  if (playCommands.includes(command) ? !/^[a-z][a-z0-9_]{0,63}$/.test(args['play-id'] ?? '') : args['play-id'] !== undefined) {
    fail('invalid_flag', 'Provide --play-id for a Play inspection command.');
  }
  const needsRevision = ['play-definition','play-validate','play-simulate','play-paths'].includes(command);
  if (needsRevision ? !UUID.test(args['revision-id'] ?? '') : args['revision-id'] !== undefined
    && (command !== 'play' || !UUID.test(args['revision-id']))) {
    fail('invalid_flag', 'Provide --revision-id for exact-version inspection.');
  }
  const playHistory = ['play-runs','play-trace','play-admissions','play-feedback'].includes(command);
  if (args.after !== undefined && ((!playHistory && !['operations','segments','campaigns','campaign-recipients'].includes(command))
    || !args.after || args.after.length > (playHistory ? 256 : 2048) || /[\u0000-\u001f\u007f]/.test(args.after))) {
    fail('invalid_flag', 'Use --after only with a list or history page and its returned cursor.');
  }
  if (command === 'play-admissions' && args.after !== undefined && !UUID.test(args.after)) {
    fail('invalid_flag', 'Use the UUID cursor returned by the admissions page.');
  }
  if (args.status !== undefined && (command !== 'play-admissions' || !['blocked','admitted','expired','cancelled'].includes(args.status))) {
    fail('invalid_flag', 'Use --status only for play-admissions with a supported status.');
  }
  const creates = ['connect','action'].includes(command);
  if (creates ? !/^[!-~]{1,128}$/.test(args['idempotency-key'] ?? '') : args['idempotency-key'] !== undefined) {
    fail('invalid_flag', 'Provide an Idempotency-Key for connect or action.');
  }
  const writes = ['connect','action','review','proof','play-simulate'].includes(command);
  const privateRead = command === 'people-search';
  if (args['bind-stdin'] && (command !== 'proof' || args['input-file'])) fail('invalid_flag', 'Use --bind-stdin only with proof and without --input-file.');
  if (!writes && !privateRead && command !== 'review-package' && args['input-file']) fail('invalid_flag', 'This command does not take a JSON body.');
  if (command === 'review-package' ? !args['output-dir'] : args['output-dir'] || args['proof-id']) fail('invalid_flag', 'Use --output-dir with review-package.');
  if (args['proof-id'] && !UUID.test(args['proof-id'])) fail('invalid_flag', 'Use a proof operation UUID with --proof-id.');
  if (!['connect','recover-key','action','resume','wait'].includes(command) && (args['secret-file'] || args['secret-command-file'])) {
    fail('invalid_flag', 'This command does not return a key.');
  }
  let base;
  try { base = new URL(process.env.BARUA_URL ?? 'https://barua.ai'); } catch { fail('invalid_origin', 'BARUA_URL must be an HTTPS origin.'); }
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && LOCAL.has(base.hostname))) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) fail('invalid_origin', 'BARUA_URL must be an HTTPS origin without credentials, path, query or fragment. HTTP is allowed on localhost.');
  const owner = ['connect','recover-key','connections','review'].includes(command);
  const key = owner ? process.env.BARUA_OWNER_TOKEN : process.env.BARUA_MANAGEMENT_KEY;
  if (!key || /\s/.test(key) || (!owner && !/^mk_[A-Za-z0-9_-]{43}$/.test(key))) fail('missing_credentials', owner ? 'Set BARUA_OWNER_TOKEN.' : 'Set BARUA_MANAGEMENT_KEY to a management key.');
  if (owner && !UUID.test(process.env.BARUA_WORKSPACE_ID ?? '')) fail('missing_workspace', 'Set BARUA_WORKSPACE_ID to the authorized workspace ID.');
  const timeout = integer(args['timeout-ms'], 60000, 1, 300000, '--timeout-ms');
  const poll = integer(args['poll-ms'], 1000, 100, 10000, '--poll-ms');
  const deadline = Date.now() + timeout;
  const headers = { authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json',
    ...(owner ? { 'x-workspace-id': process.env.BARUA_WORKSPACE_ID } : {}),
    ...(creates ? { 'idempotency-key': args['idempotency-key'] } : {}) };
  const body = ((writes || privateRead) && (command !== 'proof' || args['input-file'] || args['bind-stdin'])) || (command === 'review-package' && args['input-file'])
    ? await inputBody(args['input-file'], deadline) : undefined;
  if (command === 'proof' && body !== undefined && (Object.keys(body).length !== 1 || typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 577)) {
    fail('invalid_proof', 'Bind a proof with a JSON object containing only eventId.');
  }
  if (command === 'proof' && body?.eventId) credentials.push(body.eventId);
  if (command === 'action' && (typeof body.action !== 'string' || !body.input || typeof body.input !== 'object' || Array.isArray(body.input))) {
    fail('invalid_action', 'Send {action, input} with an input object.');
  }
  let journey, journeyBytes = 0;
  if (args['opportunity-id'] !== undefined && (command !== 'action' || body.action !== 'play.propose' || !args['journey-review-file']))
    fail('invalid_flag', 'Use --opportunity-id with play.propose and --journey-review-file.');
  if (args['journey-review-file']) {
    if (command !== 'action' || !['plan.propose', 'plan.approve', 'brand.confirm', 'brand.update', 'play.approve', 'play.propose'].includes(body.action))
      fail('invalid_flag', 'Use --journey-review-file with a plan action, brand action, Play proposal or Play approval.');
    let review;
    try { review = await import(new URL('./journey-review.mjs', import.meta.url)); }
    catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') fail('missing_module', 'Install the whole barua-setup skill, including scripts/journey-review.mjs.');
      throw error;
    }
    const artifact = review.readJourneyReview(args['journey-review-file'], credentials);
    review.checkMarkdown(args['journey-review-file'], artifact.review, credentials);
    // The record binds the source review to its strategy and intended inputs.
    // Runtime evidence outside this helper establishes who performed it.
    review.checkIndependentReview(artifact.review, body);
    if (body.action === 'play.approve') {
      if (body.input.reconciliation !== undefined) fail('journey_review', 'Use the private artifact or a prepared reconciliation record, without combining them.');
      review.checkDiscovery(artifact.review);
      journey = { review, artifact };
    } else if (body.action === 'plan.approve') {
      review.checkDiscovery(artifact.review);
      journey = { review, artifact };
    } else review.checkSubmission(artifact.review, body, args['opportunity-id']);
  }
  let sink;
  const ensureSink = async () => (sink ??= await secretSink(args, deadline));
  async function request(path, method = 'GET', input) {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() >= deadline) fail('timeout', 'The time limit ended. Read the operation or retry the same request.');
      try {
        const response = await fetch(new URL(path, base), { method, headers, redirect: 'manual',
          ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(Math.max(1, Math.min(command === 'review-package' ? 30000 : 15000, deadline - Date.now()))) });
        if (response.status >= 300 && response.status < 400) fail('redirect_refused', 'Barua redirected the request. No credentials were forwarded. Check BARUA_URL.');
        let text;
        if (command === 'review-package' || journey) {
          // Bound each reply while streaming, before allocating its JSON object.
          let bytes = 0; const chunks = [];
          for await (const chunk of response.body ?? []) {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) fail(journey ? 'journey_review' : 'package_limit', journey
              ? 'A review response exceeded 2 MiB. Check the saved operation before retrying.'
              : 'A review response exceeded 2 MiB. No package was saved.');
            if (journey) {
              journeyBytes += chunk.length;
              if (journeyBytes > 16 * 1024 * 1024) fail('journey_review', 'Approval review responses exceeded 16 MiB. Check the saved operation before retrying.');
            }
            chunks.push(chunk);
          }
          text = Buffer.concat(chunks).toString('utf8');
        } else text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { fail('unexpected_response', 'Barua did not return JSON.'); }
        last = { status: response.status, body: data, retry_after_ms: retryDelay(response, attempt) };
        if (response.status !== 429 && response.status < 500) return last;
      } catch (error) {
        if (typeof error.code === 'string') throw error;
        last = { status: 0, body: { code: 'unreachable', message: 'Could not reach Barua. Retry the same request.' }, retry_after_ms: retryDelay(null, attempt) };
      }
      if (attempt === 3 || Date.now() + last.retry_after_ms >= deadline) return last;
      await sleep(last.retry_after_ms);
    }
    return last;
  }
  async function finish(response, operationExpected = false) {
    if (response.status < 200 || response.status >= 300) return { exit: [401,403].includes(response.status) ? 2 : 1, ...response };
    const operation = operationExpected ? operationFrom(response.body) : null;
    // A historical success may outlive the key or its recovery permission.
    // Creation/recovery commands succeed only when they deliver the secret;
    // status and owner decisions remain metadata-only reads of that history.
    const managementSecret = ['connect', 'recover-key'].includes(command);
    if ((managementSecret || (operation?.action === 'key.create' && operation.status === 'succeeded'
      && ['action', 'resume', 'wait'].includes(command))) && response.body?.secret === undefined) {
      fail('secret_unavailable', 'Barua could not recover this key. Check its current access before continuing.');
    }
    let saved = {};
    if (response.body?.secret !== undefined) {
      const format = managementSecret ? /^mk_[A-Za-z0-9_-]{43}$/ : /^(?:mk|ik)_[A-Za-z0-9_-]{43}$/;
      if (typeof response.body.secret !== 'string' || !format.test(response.body.secret)) fail('unexpected_response', 'Barua returned an invalid key.');
      credentials.push(response.body.secret);
      saved = await (await ensureSink()).save(response.body.secret);
    }
    return { exit: operation ? operationExit(operation) : 0, ...response, ...saved };
  }
  const prefix = '/api/management/v1';
  async function preparedResult(response) {
    const result = await finish(response, true), operation = operationFrom(response.body);
    if (command !== 'wait' || !['succeeded','satisfied'].includes(operation.status)
      || !['play.propose','play.request-changes','play.retry'].includes(operation.action)) return result;
    const jobId = operation.result?.jobId ?? operation.result?.id ?? operation.input?.jobId;
    if (!UUID.test(jobId ?? '')) fail('unexpected_response', 'The accepted Play action did not return a preparation request.');
    let job;
    while (Date.now() < deadline) {
      let next;
      try { next = await request(`${prefix}/plays/jobs/${jobId}`); }
      catch (error) { if (error.code === 'timeout') break; throw error; }
      // The operation is already accepted. A poll aborted at our own deadline
      // cannot turn that saved request into a transport failure.
      if (next.status === 0 && Date.now() >= deadline) break;
      if (next.status < 200 || next.status >= 300) return await finish(next);
      job = next.body;
      if (!['accepted','preparing','ready','failed'].includes(job?.state)) fail('unexpected_response', 'Barua returned an unknown preparation state.');
      if (job.state === 'ready') {
        if (!UUID.test(job.revisionId ?? '')) fail('unexpected_response', 'Preparation finished without an exact Play version.');
        return { ...result, preparation: job, exit: 0 };
      }
      if (job.state === 'failed') return { ...result, preparation: job, exit: 3 };
      if (Date.now() + poll >= deadline) break;
      await sleep(poll);
    }
    return { ...result, preparation: job ?? { jobId, state: 'accepted' }, exit: 5, timed_out: true };
  }
  try {
    if (command === 'review-package') {
      let collect;
      try { ({ reviewPackage: collect } = await import(new URL('./review-package.mjs', import.meta.url))); }
      catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') fail('missing_module', 'Install the whole barua-setup skill, including scripts/review-package.mjs.');
        throw error;
      }
      return await collect({ request, redact, base: base.origin, outputDir: args['output-dir'], evidence: body,
        proofId: args['proof-id'], deadline });
    }
    if (['connect', 'recover-key'].includes(command) || (command === 'action' && body.action === 'key.create')) await ensureSink();
    // Await completion before finally closes/removes a reserved secret file.
    if (command === 'connect') return await finish(await request('/api/agent-connections', 'POST', body));
    if (command === 'recover-key') return await finish(await request(`/api/agent-connections/${args.id}/key`, 'POST'));
    if (command === 'connections') return await finish(await request('/api/agent-connections'));
    if (command === 'people-search') return await finish(await request(`${prefix}/people/search`, 'POST', body));
    if (peoplePage || command === 'person') {
      const path = command === 'people' ? '/people' : `/people/${args.id}`
        + (command === 'person-activity' ? '/activity' : command === 'person-events' ? `/sessions/${args['session-id']}/events` : '');
      const query = new URLSearchParams({ ...(args.limit ? { limit: args.limit } : {}), ...(args.cursor ? { cursor: args.cursor } : {}) });
      return await finish(await request(`${prefix}${path}${query.size ? `?${query}` : ''}`));
    }
    if (['capabilities','setup','usage','operations','segments','campaigns','segment-fields'].includes(command)) {
      return await finish(await request(`${prefix}/${command}${args.after === undefined ? '' : `?after=${encodeURIComponent(args.after)}`}`));
    }
    const readRoute = { segment: 'segments', campaign: 'campaigns', 'campaign-job': 'campaign-jobs' }[command];
    if (readRoute) return await finish(await request(`${prefix}/${readRoute}/${args.id}`));
    if (command === 'campaign-recipients') return await finish(await request(
      `${prefix}/campaigns/${args.id}/recipients${args.after === undefined ? '' : `?after=${encodeURIComponent(args.after)}`}`));
    if (command === 'play-catalog') return await finish(await request(`${prefix}/plays/catalog`));
    if (command === 'play-job') return await finish(await request(`${prefix}/plays/jobs/${args.id}`));
    if (playCommands.includes(command)) {
      const path = `${prefix}/plays/${args['play-id']}`;
      if (command === 'play') {
        const response = await request(`${path}/detail${args['revision-id'] ? `?revisionId=${args['revision-id']}` : ''}`);
        if (response.status >= 200 && response.status < 300 && response.body?.summary?.id === args['play-id']) {
          reviewSummaries.add(response.body.summary);
        }
        return await finish(response);
      }
      if (command === 'play-validate' || command === 'play-simulate') return await finish(await request(`${path}/${command === 'play-validate' ? 'validate' : 'simulate'}`,
        'POST', { revisionId: args['revision-id'], ...(command === 'play-simulate' ? { input: body } : {}) }));
      const suffix = { 'play-definition': 'definition', 'play-runs': 'runs', 'play-trace': `runs/${args.id}`,
        'play-admissions': 'admissions', 'play-feedback': 'feedback', 'play-paths': 'path-counts' }[command];
      const query = new URLSearchParams({ ...(needsRevision ? { revisionId: args['revision-id'] } : {}), ...(args.after ? { after: args.after } : {}), ...(args.status ? { status: args.status } : {}) });
      return await finish(await request(`${path}/${suffix}${query.size ? `?${query}` : ''}`));
    }
    if (command === 'review') return await finish(await request(`/api/agent-connections/operations/${args.id}/review`, 'POST', body), true);
    if (command === 'action') {
      if (journey && body.action === 'plan.approve') {
        const plan = await request(`${prefix}/plan`);
        if (plan.status < 200 || plan.status >= 300) return await finish(plan);
        // Plan versions are immutable. If superseded after this read, the
        // existing approval RPC refuses that version under its row lock.
        journey.review.checkPlanApproval(journey.artifact.review, plan.body, body.input);
      } else if (journey) {
        const { playId, revisionId } = body.input;
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(playId ?? '') || !UUID.test(revisionId ?? ''))
          fail('journey_review', 'Provide the exact Play ID and revision before reading its approval target.');
        const detail = await request(`${prefix}/plays/${playId}/detail?revisionId=${revisionId}`);
        if (detail.status < 200 || detail.status >= 300) return await finish(detail);
        const replay = typeof detail.body?.summary?.token === 'string' && detail.body.summary.token !== body.input.expectedToken;
        const reconciliation = replay
          ? journey.review.replayApproval(journey.artifact, detail.body, body.input)
          : journey.review.bindApproval(journey.artifact, detail.body, body.input);
        body.input = { ...body.input, reconciliation };
        if (Buffer.byteLength(JSON.stringify(body)) > 524288) fail('input_too_large', 'The approval and its review evidence must fit within 512 KiB.');
        // One exact detail plus S×L previews (L <= 20), then the action.
        // Each request has at most four transport attempts. All share the
        // original deadline, 2 MiB per reply and 16 MiB total streamed bytes
        // across retries. There is no separate step-count ceiling.
        // An advanced token can only resend the original receipt for server
        // idempotency replay. A new stale-token request cannot grant approval.
        // Matching-token render failures never enter that recovery path.
        for (const preview of replay ? [] : reconciliation.previews) for (const language of preview.languages) {
          const response = await request(`${prefix}/plays/${playId}/preview`, 'POST',
            { example: true, revisionId, stepId: preview.stepId, language });
          if (response.status < 200 || response.status >= 300) return await finish(response);
          if (typeof response.body?.subject !== 'string' || !response.body.subject.trim()
            || typeof response.body?.bodyHtml !== 'string' || !response.body.bodyHtml.trim()
            || !Array.isArray(response.body.lintIssues) || response.body.lintIssues.length)
            fail('journey_review', 'An exact email preview is unavailable or failed its checks. Review it before approving.');
        }
      }
      return await finish(await request(`${prefix}/actions`, 'POST', body), true);
    }
    if (command === 'proof') {
      const proofResult = async response => {
        const result = await finish(response);
        if (result.exit === 0) result.exit = result.body.status === 'delivered' ? 0 : result.body.status === 'failed' ? 3 : 5;
        return result;
      };
      if (body !== undefined) {
        let bound = await request(`${prefix}/proofs/${args.id}/bind`, 'POST', body);
        // Intake applies asynchronously. Retain the private identifier only
        // in this process until the server confirms an event-row binding.
        // A timeout/restart requires the same bind input again; a plain GET
        // cannot recover an identifier that was deliberately never stored.
        while (bound.status >= 200 && bound.status < 300 && !bound.body?.event_row_id
          && bound.body?.reason_code === 'event_not_applied') {
          if (Date.now() + poll >= deadline) return { ...await proofResult(bound), timed_out: true };
          await sleep(poll);
          let next;
          try { next = await request(`${prefix}/proofs/${args.id}/bind`, 'POST', body); }
          catch (error) {
            if (error.code === 'timeout') return { ...await proofResult(bound), timed_out: true };
            throw error;
          }
          if (next.status === 0 && Date.now() >= deadline) return { ...await proofResult(bound), timed_out: true };
          bound = next;
        }
        if (bound.status < 200 || bound.status >= 300) return await finish(bound);
        // Keep wrong-key/stale/identity refusals visible. Reading an unbound
        // proof here would erase their useful reason with awaiting_event.
        if (!bound.body?.event_row_id) return await proofResult(bound);
      }
      return await proofResult(await request(`${prefix}/proofs/${args.id}`));
    }
    if (command === 'cancel') return await finish(await request(`${prefix}/operations/${args.id}/cancel`, 'POST', {}), true);
    let response = await request(`${prefix}/operations/${args.id}`);
    if (response.status !== 200) return await finish(response);
    let operation = operationFrom(response.body);
    if (command === 'status') return await finish(response, true);
    if (command === 'resume') {
      if (operation.action === 'key.create') await ensureSink();
      return await finish(await request(`${prefix}/operations/${args.id}/resume`, 'POST', {}), true);
    }
    // A new process resumes the durable operation. No local chat state or
    // approval inference enters this loop; a review remains the owner's act.
    while (!TERMINAL.has(operation.status) && Date.now() < deadline) {
      try {
        const lease = Date.parse(operation.lease_until ?? '');
        if (operation.status === 'ready' || (operation.status === 'running' && Number.isFinite(lease) && lease <= Date.now())) {
          if (operation.action === 'key.create') await ensureSink();
          const resumed = await request(`${prefix}/operations/${args.id}/resume`, 'POST', {});
          if (resumed.status === 0 && Date.now() >= deadline) break;
          response = resumed;
          if (response.status < 200 || response.status >= 300 || response.body?.secret !== undefined) return await finish(response, true);
          operation = operationFrom(response.body);
          if (TERMINAL.has(operation.status)) return await preparedResult(response);
        }
        if (Date.now() + poll >= deadline) break;
        await sleep(poll);
        if (Date.now() >= deadline) break;
        const polled = await request(`${prefix}/operations/${args.id}`);
        if (polled.status === 0 && Date.now() >= deadline) break;
        response = polled;
        if (response.status !== 200) return await finish(response);
        operation = operationFrom(response.body);
      } catch (error) {
        if (error.code === 'timeout') break;
        throw error;
      }
    }
    // Status reads intentionally omit secrets, including after another
    // process completed the operation. Reuse its recovery endpoint once;
    // never create a replacement key or imply an unwritten file was saved.
    if (operation.action === 'key.create' && operation.status === 'succeeded' && response.body?.secret === undefined) {
      await ensureSink();
      return await finish(await request(`${prefix}/operations/${args.id}/resume`, 'POST', {}), true);
    }
    return { ...await preparedResult(response), ...(!TERMINAL.has(operation.status) ? { timed_out: true } : {}) };
  } finally { sink?.close(); }
}

const result = await main().catch(error => ({ exit: error.exit === 2 ? 2 : 1, error: { code: error.code ?? 'helper_error', message: error.message ?? 'The helper could not complete the request.' } }));
if (result.help) process.stdout.write(HELP);
else process.stdout.write(`${JSON.stringify(redact({ ok: result.exit === 0, ...result }), null, 2)}\n`);
process.exitCode = result.exit;
