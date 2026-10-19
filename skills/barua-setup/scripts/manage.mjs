// Headless Barua management. Node 18.17+, no dependencies. Credentials come
// only from the environment; ordinary output is one redacted JSON object.
import { parseArgs } from 'node:util';
import { openSync, closeSync, writeFileSync, readFileSync, realpathSync, unlinkSync, constants, fchmodSync, fstatSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const STATUSES = new Set(['awaiting_approval', 'ready', 'running', 'succeeded', 'failed', 'cancelled', 'stale', 'satisfied']);
const TERMINAL = new Set(['succeeded', 'satisfied', 'failed', 'cancelled', 'stale']);
const SECRET_FIELD = /secret|password|authorization|^(?:(?:access|refresh|id|auth|api|bearer)[_-]?)?token$|(?:management|integration|runtime|api)[_-]?key$|^key$/i;
const credentials = ['BARUA_MANAGEMENT_KEY', 'BARUA_OWNER_TOKEN'].map(name => process.env[name]).filter(Boolean);
const HELP = `Usage: node scripts/manage.mjs <command> [options]

Commands: connect, recover-key, connections, capabilities, setup, operations, status,
          action, resume, cancel, review, wait, proof

BARUA_URL defaults to https://barua.ai. BARUA_MANAGEMENT_KEY authorizes
management calls. connect/recover-key/connections/review use BARUA_OWNER_TOKEN and
BARUA_WORKSPACE_ID instead. Credentials are never accepted as arguments.

--input-file <file>       JSON body for connect/action/review; otherwise stdin
--idempotency-key <id>    required for connect/action; reuse after response loss
--id <uuid>              operation ID for status/resume/cancel/review/wait/proof
                         connection ID for recover-key
--secret-file <file>     exclusive 0600 destination; inside Git it must be ignored
--secret-command-file <file>  JSON argv array for an authorized command; the new
                             secret goes to its stdin; its output is suppressed
--timeout-ms <n>         total bound including secret storage, 1..300000, default 60000
--poll-ms <n>            wait polling interval, 100..10000, default 1000

connect, recover-key and action key.create require a secret destination before sending.
resume and wait require one before executing a key.create operation. Never
reuse an occupied secret file. A failed secret transfer can be recovered by
repeating the same creation request or resuming its operation with a new file.
recover-key --id saves the same connection key again with owner authorization;
it takes no input or idempotency key and never creates another connection.
After a failed transfer, repeat recover-key with the same ID and a new file.
wait resumes ready operations and expired leases. It also recovers completed
key creation into the requested destination. It never grants approval.
proof --bind-stdin accepts JSON {eventId} to bind a real event; --input-file
also binds. Plain proof --id only reads and never waits for stdin.
Exit: 0 success, 1 helper/transport error, 2 authorization refused,
      3 terminal unsuccessful, 4 awaiting approval, 5 still running at timeout
      or delivery not yet confirmed. A proof exits 0 only when delivered.
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
    [redact(name), SECRET_FIELD.test(name) || /^event[_-]?id$/i.test(name) || (value.action === 'person.erase' && name === 'input')
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
    const fd = openSync(file, 'r');
    try {
      if (!fstatSync(fd).isFile() || fstatSync(fd).size > 524288) fail('input_too_large', 'Use a JSON file of at most 512 KiB.');
      text = readFileSync(fd, 'utf8');
    } finally { closeSync(fd); }
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
    try { argv = JSON.parse(readFileSync(args['secret-command-file'], 'utf8')); } catch { fail('secret_destination', 'The secret command file must contain a JSON argv array.'); }
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
    'secret-command-file': { type: 'string' }, 'timeout-ms': { type: 'string' }, 'poll-ms': { type: 'string' }, 'bind-stdin': { type: 'boolean' },
  } });
  if (args.help) return { help: true, exit: 0 };
  const command = positionals[0];
  const commands = ['connect','recover-key','connections','capabilities','setup','operations','status','action','resume','cancel','review','wait','proof'];
  if (positionals.length !== 1 || !commands.includes(command)) fail('invalid_flag', 'Choose a command from --help.');
  const hasId = ['recover-key','status','resume','cancel','review','wait','proof'].includes(command);
  if (hasId ? !UUID.test(args.id ?? '') : args.id !== undefined) fail('invalid_flag', 'Provide --id only for a command that takes a connection or operation ID.');
  const creates = ['connect','action'].includes(command);
  if (creates ? !/^[!-~]{1,128}$/.test(args['idempotency-key'] ?? '') : args['idempotency-key'] !== undefined) {
    fail('invalid_flag', 'Provide an Idempotency-Key for connect or action.');
  }
  const writes = ['connect','action','review','proof'].includes(command);
  if (args['bind-stdin'] && (command !== 'proof' || args['input-file'])) fail('invalid_flag', 'Use --bind-stdin only with proof and without --input-file.');
  if (!writes && args['input-file']) fail('invalid_flag', 'This command does not take a JSON body.');
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
  const body = writes && (command !== 'proof' || args['input-file'] || args['bind-stdin']) ? await inputBody(args['input-file'], deadline) : undefined;
  if (command === 'proof' && body !== undefined && (Object.keys(body).length !== 1 || typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 577)) {
    fail('invalid_proof', 'Bind a proof with a JSON object containing only eventId.');
  }
  if (command === 'proof' && body?.eventId) credentials.push(body.eventId);
  if (command === 'action' && (typeof body.action !== 'string' || !body.input || typeof body.input !== 'object' || Array.isArray(body.input))) {
    fail('invalid_action', 'Send {action, input} with an input object.');
  }
  let sink;
  const ensureSink = async () => (sink ??= await secretSink(args, deadline));
  async function request(path, method = 'GET', input) {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() >= deadline) fail('timeout', 'The time limit ended. Read the operation or retry the same request.');
      try {
        const response = await fetch(new URL(path, base), { method, headers, redirect: 'manual',
          ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) });
        if (response.status >= 300 && response.status < 400) fail('redirect_refused', 'Barua redirected the request. No credentials were forwarded. Check BARUA_URL.');
        const text = await response.text();
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
  try {
    if (['connect', 'recover-key'].includes(command) || (command === 'action' && body.action === 'key.create')) await ensureSink();
    // Await completion before finally closes/removes a reserved secret file.
    if (command === 'connect') return await finish(await request('/api/agent-connections', 'POST', body));
    if (command === 'recover-key') return await finish(await request(`/api/agent-connections/${args.id}/key`, 'POST'));
    if (command === 'connections') return await finish(await request('/api/agent-connections'));
    if (['capabilities','setup','operations'].includes(command)) return await finish(await request(`${prefix}/${command}`));
    if (command === 'review') return await finish(await request(`/api/agent-connections/operations/${args.id}/review`, 'POST', body), true);
    if (command === 'action') return await finish(await request(`${prefix}/actions`, 'POST', body), true);
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
          if (TERMINAL.has(operation.status)) return await finish(response, true);
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
    return { ...await finish(response, true), ...(!TERMINAL.has(operation.status) ? { timed_out: true } : {}) };
  } finally { sink?.close(); }
}

const result = await main().catch(error => ({ exit: 1, error: { code: error.code ?? 'helper_error', message: error.message ?? 'The helper could not complete the request.' } }));
if (result.help) process.stdout.write(HELP);
else process.stdout.write(`${JSON.stringify(redact({ ok: result.exit === 0, ...result }), null, 2)}\n`);
process.exitCode = result.exit;
