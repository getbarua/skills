// Owner account access. Node 18.17+, built-ins only. No automatic mutation
// retries: a lost response may hide a committed signup, invitation or send.
import { parseArgs } from 'node:util';
import { readPrivateInput } from './private-input.mjs';
import { fail, origin, sessionStore, secretSink } from './owner-storage.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = /password|secret|authorization|(?:^|_)token(?:$|_)|^(access|refresh|id|auth|api|bearer)Token$|(?:management|integration|runtime|api)[_-]?key$|^(key|invite|recovery_url)$/i;
const secrets = new Set([process.env.BARUA_OWNER_TOKEN, process.env.BARUA_MANAGEMENT_KEY].filter(Boolean));
function remember(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE.test(key) && typeof item === 'string' && item) secrets.add(item);
    else remember(item);
  }
}
function redact(value) {
  if (typeof value === 'string') {
    for (const secret of secrets) value = value.split(secret).join('[REDACTED]');
    return value.replace(/\b(?:pk|mk|ik)_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key),
    PRIVATE.test(key) && !(['secret_saved', 'password_updated'].includes(key) && typeof item === 'boolean') ? '[REDACTED]' : redact(item)]));
  return value;
}

const HELP = `Usage: node scripts/owner.mjs <command> [options]

Account: config, terms, signup, login, session, refresh, logout,
         recovery-request, recovery-complete, password-update
Workspace: workspaces, workspace-create, workspace-select, me, terms-accept,
           pixel-key-rotate,
           team, member-role, member-remove, invite, invite-resend, invite-revoke,
           invitation-preview, invitation-register, invitation-accept
Agent: connections, connect, recover-key, connection-update, connection-revoke,
       reviews, review-context, review
Legacy emails: drafts, draft, draft-approve, draft-reject, autonomy, autonomy-plays,
               autosend

Install owner-storage.mjs and private-input.mjs beside this file.

BARUA_URL defaults to https://barua.ai. --session-file or BARUA_OWNER_SESSION_FILE
names a private session file in a directory owned by you with mode 0700. Inside
Git, ignore both the session file and its .lock directory. Login credentials,
invitation tokens and recovery links come only from JSON stdin or --input-file.
Existing BARUA_OWNER_TOKEN and BARUA_WORKSPACE_ID can authorize owner API calls
without storing a session. They cannot refresh, log out, or change passwords.

--input-file <file>          JSON request body; otherwise stdin for body commands
--session-file <file>        private account session, never ordinary output
--workspace <uuid>           explicit workspace, required for workspace-select
--id <uuid>                  member, invitation, connection, review or draft ID
--after <cursor>             next cursor for workspaces, reviews or autonomy-plays
--members-after <uuid>       team member page cursor
--invitations-after <uuid>   team invitation page cursor
--revision <value>           autonomy-plays snapshot revision
--status <value>             drafts: pending, approved, rejected or sent
--idempotency-key <value>    required for connect; reuse for the same request
--secret-file <new-file>     exclusive mode 0600 key destination; ignored in Git
--secret-command-file <file> JSON argv array, at most 64 KiB; key goes to stdin
--timeout-ms <n>             total command deadline, 1..300000; default 60000

signup and workspace-create require accepted_terms: true, the exact
accepted_version and accepted_digest from terms, and a pixel-key destination.
terms-accept takes {version,digest}; invitation-accept takes
{token,accepted_terms:true,accepted_version,accepted_digest}.
Acceptance is never filled in for you.
connect and recover-key require a secret destination for the management key.
review-context reads the exact request; review needs decision, inputHash and
policyVersion from that review. It does not resume or execute the operation.
draft-approve may send an email. autosend changes legacy automatic sending.
No write is automatically retried. After a lost signup/workspace response,
sign in and list workspaces before creating again. After an uncertain invite,
read team and its delivery status before considering an explicit resend.
logout revokes this session only. Its existing access JWT expires normally.
Exit: 0 success, 1 input/transport/storage error, 2 authorization refused,
      3 server refusal, 5 invitation delivery unknown or failed.
`;

async function input(file, deadline) {
  let text;
  if (file) {
    text = readPrivateInput(file, { maxBytes: 524288, deadline, code: 'input_size', message: 'Use a JSON file of at most 512 KiB.' }).text;
  } else {
    if (process.stdin.isTTY) fail('input_required', 'Send a JSON object through stdin or --input-file.');
    const chunks = []; let bytes = 0;
    const timer = setTimeout(() => process.stdin.destroy(Object.assign(new Error('The time limit ended while reading input.'), { code: 'timeout' })), Math.max(1, deadline - Date.now()));
    try { for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > 524288) fail('input_size', 'The JSON body must fit within 512 KiB.'); chunks.push(chunk); } }
    finally { clearTimeout(timer); }
    text = Buffer.concat(chunks).toString('utf8');
  }
  let body;
  try { body = JSON.parse(text); } catch { fail('invalid_json', 'Send a JSON object.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_json', 'Send a JSON object.');
  remember(body); return body;
}

async function request(url, method, body, headers, deadline) {
  if (Date.now() >= deadline) fail('timeout', 'The time limit ended before sending the request.');
  let response;
  try { response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { fail('request_uncertain', method === 'GET' ? 'The request did not finish. Try the read again.' : 'No response was received. The change may have completed. Inspect its saved state before retrying.'); }
  const chunks = []; let size = 0;
  try { for await (const chunk of response.body ?? []) { size += chunk.length; if (size > 4194304) fail('response_size', 'The response exceeded 4 MiB.'); chunks.push(chunk); } }
  catch { fail('response_uncertain', 'The response could not be read. Inspect saved state before retrying a change.'); }
  const text = Buffer.concat(chunks).toString('utf8');
  let result;
  try { result = text ? JSON.parse(text) : {}; }
  catch { fail('response_uncertain', 'The response was not JSON. Inspect saved state before retrying a change.'); }
  remember(result);
  if (!response.ok) {
    // Provider messages can quote submitted credentials. Keep errors bounded
    // and return the status, rather than arbitrary provider response bodies.
    const code = typeof result.code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(result.code) ? result.code : 'request_refused';
    throw Object.assign(new Error(`The server refused this request (HTTP ${response.status}).`), { code, status: response.status });
  }
  return result;
}

function uuid(value, name) { if (!UUID.test(value ?? '')) fail('invalid_flag', `Use a valid ${name} ID.`); return value; }
function requiredTerms(body, names) { for (const name of names) if (typeof body[name] !== 'string' || !body[name]) fail('terms_required', 'Provide the exact version and digest you reviewed.'); }
function validateAuth(config) {
  const issuer = origin(config?.auth?.issuer), key = config?.auth?.publishable_key;
  let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  try { if (typeof key === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { publicKey = false; }
  if (!publicKey) fail('auth_config', 'The sign-in configuration does not contain a public key.');
  return { issuer, key };
}
function sessionData(result, barua, auth, previous = {}) {
  if (!result || typeof result.access_token !== 'string' || !result.access_token || typeof result.refresh_token !== 'string' || !result.refresh_token ||
    !Number.isFinite(result.expires_in) || result.expires_in <= 0 || !UUID.test(result.user?.id ?? '')) fail('auth_response', 'Sign-in did not return a complete session.');
  return { format: 1, barua, issuer: auth.issuer, publishable_key: auth.key, access_token: result.access_token,
    refresh_token: result.refresh_token, expires_at: Math.floor(Date.now() / 1000) + result.expires_in,
    user: { id: result.user.id, email: result.user.email }, workspace: previous.workspace ?? null };
}
function summary(session) { return { signed_in: Boolean(session?.access_token), user: session?.user ?? null, workspace: session?.workspace ?? null, expires_at: session?.expires_at ?? null }; }

const commands = {
  workspaces: { route: '/api/workspaces', identity: true, flags: ['after'] },
  'workspace-create': { route: '/api/workspaces', identity: true, method: 'POST', body: true, key: 'apiKey', terms: true },
  me: { route: '/api/me' },
  'terms-accept': { route: '/api/terms/accept', method: 'POST', body: true },
  'pixel-key-rotate': { route: '/api/tenant/key', method: 'POST', key: 'apiKey' },
  team: { route: w => `/api/workspaces/${w}/members`, flags: ['members-after', 'invitations-after'] },
  'member-role': { route: (w, id) => `/api/workspaces/${w}/members/${id}`, method: 'PATCH', body: true, id: true },
  'member-remove': { route: (w, id) => `/api/workspaces/${w}/members/${id}`, method: 'DELETE', id: true },
  invite: { route: w => `/api/workspaces/${w}/invitations`, method: 'POST', body: true, delivery: true },
  'invite-resend': { route: (w, id) => `/api/workspaces/${w}/invitations/${id}/resend`, method: 'POST', id: true, delivery: true },
  'invite-revoke': { route: (w, id) => `/api/workspaces/${w}/invitations/${id}`, method: 'DELETE', id: true },
  'invitation-preview': { route: '/api/invitations/preview', method: 'POST', body: true, public: true },
  'invitation-register': { route: '/api/invitations/register', method: 'POST', body: true, public: true },
  'invitation-accept': { route: '/api/invitations/accept', method: 'POST', body: true, identity: true, terms: true },
  connections: { route: '/api/agent-connections' },
  connect: { route: '/api/agent-connections', method: 'POST', body: true, key: 'secret', flags: ['idempotency-key'] },
  'recover-key': { route: (_w, id) => `/api/agent-connections/${id}/key`, method: 'POST', id: true, key: 'secret' },
  'connection-update': { route: (_w, id) => `/api/agent-connections/${id}`, method: 'PATCH', body: true, id: true },
  'connection-revoke': { route: (_w, id) => `/api/agent-connections/${id}`, method: 'DELETE', id: true },
  reviews: { route: '/api/agent-connections/operations', flags: ['after'] },
  'review-context': { route: (_w, id) => `/api/agent-connections/operations/${id}/context`, id: true },
  review: { route: (_w, id) => `/api/agent-connections/operations/${id}/review`, method: 'POST', body: true, id: true },
  drafts: { route: '/api/drafts', flags: ['status'] },
  draft: { route: (_w, id) => `/api/drafts/${id}`, id: true },
  'draft-approve': { route: (_w, id) => `/api/drafts/${id}/approve`, method: 'POST', body: true, id: true },
  'draft-reject': { route: (_w, id) => `/api/drafts/${id}/reject`, method: 'POST', body: true, id: true },
  autonomy: { route: '/api/autonomy' },
  'autonomy-plays': { route: '/api/autonomy/plays', flags: ['after', 'revision'] },
  autosend: { route: '/api/tenant/autosend', method: 'POST', body: true },
};
const authCommands = new Set(['config', 'terms', 'signup', 'login', 'session', 'refresh', 'logout', 'recovery-request', 'recovery-complete', 'password-update', 'workspace-select']);
const bodyAuth = new Set(['signup', 'login', 'recovery-request', 'recovery-complete', 'password-update']);

async function main() {
  let parsed;
  try { parsed = parseArgs({ allowPositionals: true, strict: true, options: Object.fromEntries([
    'session-file', 'input-file', 'workspace', 'id', 'after', 'members-after', 'invitations-after', 'revision', 'status',
    'idempotency-key', 'secret-file', 'secret-command-file', 'timeout-ms'].map(name => [name, { type: 'string' }]).concat([['help', { type: 'boolean' }]])) }); }
  catch { fail('invalid_flag', 'Use --help for supported options. Credentials are never command arguments.'); }
  const args = parsed.values, [command] = parsed.positionals;
  if (args.help) { console.log(HELP); return; }
  const spec = commands[command];
  if (parsed.positionals.length !== 1 || (!spec && !authCommands.has(command))) fail('invalid_command', 'Choose one supported command. Use --help.');
  const allowed = new Set(['session-file', 'timeout-ms', ...(spec?.flags ?? [])]);
  if (spec?.body || bodyAuth.has(command)) allowed.add('input-file');
  if (spec?.id) allowed.add('id');
  if ((spec && !spec.public && !spec.identity) || command === 'workspace-select') allowed.add('workspace');
  if (spec?.key || command === 'signup') { allowed.add('secret-file'); allowed.add('secret-command-file'); }
  for (const name of Object.keys(args)) if (!allowed.has(name)) fail('invalid_flag', `The ${name} option does not apply to this command.`);
  if (args['timeout-ms'] !== undefined && (!/^\d+$/.test(args['timeout-ms']) || Number(args['timeout-ms']) < 1 || Number(args['timeout-ms']) > 300000)) fail('invalid_flag', 'Use a timeout between 1 and 300000 milliseconds.');
  const deadline = Date.now() + Number(args['timeout-ms'] ?? 60000);
  const barua = origin(process.env.BARUA_URL ?? 'https://barua.ai');
  if (spec?.id) uuid(args.id, 'record');
  if (args.workspace) uuid(args.workspace, 'workspace');
  for (const name of spec?.flags ?? []) if (args[name] !== undefined && (!args[name] || args[name].length > 2048 || /[\x00-\x20\x7f]/.test(args[name]))) fail('invalid_flag', `Use a valid ${name}.`);
  if (command === 'connect' && (!args['idempotency-key'] || args['idempotency-key'].length > 128)) fail('invalid_flag', 'Provide the same idempotency key for the same connection request.');
  if (args.status && !['pending', 'approved', 'rejected', 'sent'].includes(args.status)) fail('invalid_flag', 'Use pending, approved, rejected or sent.');
  const body = spec?.body || bodyAuth.has(command) ? await input(args['input-file'], deadline) : undefined;
  if (spec?.terms || command === 'signup') {
    requiredTerms(body, ['accepted_version', 'accepted_digest']);
    if (body.accepted_terms !== true) fail('terms_required', 'Provide accepted_terms: true only after reviewing the exact legal documents.');
  }
  if (command === 'terms-accept') requiredTerms(body, ['version', 'digest']);
  let store, sink, session;
  try {
    if (spec?.key || command === 'signup') sink = await secretSink(args, deadline);
    const needsSession = !spec?.public && !['config', 'terms', 'recovery-request'].includes(command);
    const envToken = process.env.BARUA_OWNER_TOKEN;
    if (spec && !spec.public && envToken && (args['session-file'] || process.env.BARUA_OWNER_SESSION_FILE)) {
      fail('auth_ambiguous', 'Choose a saved owner session or BARUA_OWNER_TOKEN, so the acting account is unambiguous.');
    }
    if (needsSession && !(spec && envToken)) {
      store = await sessionStore(args['session-file'] ?? process.env.BARUA_OWNER_SESSION_FILE, deadline);
      session = store.read(); remember(session);
      if (session && session.barua !== barua) fail('session_origin', 'This session belongs to another barua origin. Use its original BARUA_URL.');
    }
    const api = (path, method = 'GET', data, token, workspace, extra = {}) => request(`${barua}${path}`, method, data,
      { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(workspace ? { 'x-workspace-id': workspace } : {}), ...extra }, deadline);
    let auth;
    const authConfig = async () => {
      if (!auth) auth = validateAuth(await api('/api/auth/config'));
      if (session?.issuer && session.issuer !== auth.issuer) fail('session_issuer', 'The sign-in issuer changed. The saved session was not sent.');
      return auth;
    };
    const authCall = async (path, data, token, method = 'POST') => {
      const config = await authConfig();
      return request(`${config.issuer}/auth/v1${path}`, method, data, { apikey: config.key, ...(token ? { authorization: `Bearer ${token}` } : {}) }, deadline);
    };
    const refresh = async () => {
      if (!session?.refresh_token) fail('not_signed_in', 'Sign in before refreshing the session.');
      const result = await authCall('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      const updated = sessionData(result, barua, auth, session);
      if (updated.user.id !== session.user.id) fail('session_identity', 'The refreshed session has a different owner.');
      store.save(updated); session = updated; return updated.access_token;
    };
    const token = async () => {
      if (spec && envToken) return envToken;
      if (!session?.access_token) fail('not_signed_in', 'Sign in first.');
      if (session.expires_at <= Date.now() / 1000 + 60) return refresh();
      return session.access_token;
    };
    let result;
    if (command === 'config' || command === 'terms') {
      const config = await api('/api/auth/config'); validateAuth(config);
      result = command === 'terms' ? config.terms : config;
    } else if (command === 'session') result = summary(session);
    else if (command === 'login' || command === 'signup') {
      if (session?.access_token) fail('session_exists', 'Log out before replacing an existing signed-in session.');
      let created;
      // Validate auth configuration before admitting an account. The server
      // alone checks the signup code and records admission and exact terms.
      await authConfig();
      if (command === 'signup') {
        created = await api('/api/auth/signup', 'POST', body);
        if (typeof created.apiKey !== 'string' || !created.apiKey) fail('secret_missing', 'The account response did not include its pixel key. Inspect workspaces before creating again.');
        await sink.save(created.apiKey);
      }
      const signed = await authCall('/token?grant_type=password', { email: body.email, password: body.password });
      session = sessionData(signed, barua, auth, { workspace: created?.tenantId });
      store.save(session); result = { ...summary(session), ...(created ? { workspace_created: created.tenantId, secret_saved: true } : {}) };
    } else if (command === 'refresh') { await refresh(); result = summary(session); }
    else if (command === 'logout') {
      if (session?.access_token) {
        // Revocation needs a current access token. A refusal does not prove
        // the refresh token is unusable, so keep the session until confirmed.
        await authCall('/logout?scope=local', undefined, await token());
        store.save({ format: 1, barua }); session = null;
      }
      result = { signed_out: true };
    } else if (command === 'recovery-request') {
      await authCall('/recover', { email: body.email }); result = { recovery_requested: true };
    } else if (command === 'recovery-complete') {
      if (session?.access_token) fail('session_exists', 'Log out or choose a new private session file before using a recovery link.');
      await authConfig();
      let hash = body.token_hash;
      if (body.recovery_url !== undefined) {
        let link; try { link = new URL(body.recovery_url); } catch { fail('recovery_link', 'Use the original recovery link.'); }
        if (link.origin !== auth.issuer || link.pathname !== '/auth/v1/verify' || link.username || link.password || link.hash || link.searchParams.get('type') !== 'recovery') fail('recovery_link', 'Use the recovery link from the configured sign-in service.');
        hash = link.searchParams.get('token');
      }
      if (typeof hash !== 'string' || !hash || typeof body.password !== 'string' || body.password.length < 10) fail('recovery_input', 'Provide a recovery token hash or link and a new password of at least 10 characters.');
      secrets.add(hash);
      const verified = await authCall('/verify', { type: 'recovery', token_hash: hash });
      // Save the recovered session before the password write. A lost response
      // must not discard the only usable session after consuming the link.
      session = sessionData(verified, barua, auth); store.save(session);
      await authCall('/user', { password: body.password }, session.access_token, 'PUT');
      result = { password_updated: true, ...summary(session) };
    } else if (command === 'password-update') {
      if (typeof body.password !== 'string' || body.password.length < 10) fail('recovery_input', 'Provide a new password of at least 10 characters.');
      await authCall('/user', { password: body.password }, await token(), 'PUT');
      result = { password_updated: true };
    } else if (command === 'workspace-select') {
      const workspace = uuid(args.workspace, 'workspace');
      await api('/api/me', 'GET', undefined, await token(), workspace);
      session.workspace = workspace; store.save(session); result = summary(session);
    } else {
      const workspace = spec.public || spec.identity ? undefined : uuid(args.workspace ?? session?.workspace ?? process.env.BARUA_WORKSPACE_ID, 'workspace');
      const path = typeof spec.route === 'function' ? spec.route(workspace, args.id) : spec.route;
      const query = new URLSearchParams();
      for (const name of spec.flags ?? []) if (args[name] !== undefined && name !== 'idempotency-key') query.set(name.replaceAll('-', '_'), args[name]);
      const extra = args['idempotency-key'] ? { 'idempotency-key': args['idempotency-key'] } : {};
      result = await api(`${path}${query.size ? `?${query}` : ''}`, spec.method ?? 'GET', body, spec.public ? undefined : await token(), workspace, extra);
      if (spec.key) {
        if (typeof result[spec.key] !== 'string' || !result[spec.key]) fail('secret_missing', 'The response did not contain a key. Inspect saved state before retrying.');
        result = { ...result, ...await sink.save(result[spec.key]) };
      }
      if (spec.delivery && result.delivery_status !== 'accepted') process.exitCode = 5;
    }
    console.log(JSON.stringify(redact({ ok: true, body: result })));
  } finally { try { sink?.close(); } finally { store?.close(); } }
}

main().catch(error => {
  // Never print raw parseArgs, filesystem, fetch or provider exceptions: they
  // can carry credential input, a recovery URL or a child process command.
  const known = typeof error.code === 'string' && /^[a-z][a-z0-9_]+$/.test(error.code);
  console.log(JSON.stringify(redact({ ok: false, error: { code: known ? error.code : 'helper_error',
    message: known ? error.message : 'The command could not complete. Check the private file and input.', ...(error.status ? { status: error.status } : {}) } })));
  process.exitCode = [401, 403].includes(error.status) ? 2 : error.status ? 3 : 1;
});
