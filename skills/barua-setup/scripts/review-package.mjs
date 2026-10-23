// Read-only export, installed beside manage.mjs. No credentials or customer
// profiles enter this module. The existing API remains the decision authority.
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync, rmdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9_]{0,63}$/;
// One 300s helper deadline covers metadata, all pages/previews and final checks.
// Each attempt <=30s and <=2MiB; collected successful JSON <=16MiB, <=100 plays,
// <=100 pending-operation pages per pass and <=256 exact previews. Hitting any bound
// fails the whole export before writing. No partial artifact can look complete.
// Both passes share those bytes/deadline: <=2*100 play pages + 100 details +
// 256 previews + 2*100 operation pages + 6 setup/plan/authority reads +
// 2 optional proof reads = 764 calls, <=3056 transport attempts; retries share the cap.
const BYTES = 16 * 1024 * 1024, PLAYS = 100, PAGES = 100, PREVIEWS = 256;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const need = (ok, message = 'Barua returned incomplete review data. No package was saved.') => {
  if (!ok) fail('unexpected_response', message);
};
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const actor = value => value ? pick(value, ['kind', 'label', 'policyVersion']) : null;
const authority = c => pick(c, ['id', 'tenant_id', 'owner_id', 'label', 'permissions', 'review', 'policy_version', 'terms_current', 'expires_at', 'revoked_at']);
const summaryFields = ['id', 'name', 'audience', 'reviewState', 'sendingState', 'proposalRevisionId', 'approvedRevisionId',
  'languages', 'approvedLanguages', 'hasUpdate', 'holdReason', 'preparationNote', 'removalProposed', 'controlPlayId', 'entriesStopped'];
// entriesStopped is added only by the detail RPC. Its control row invalidates
// the Play revision marker; compare the remaining captured fields to the list.
const pageSummaryFields = summaryFields.filter(field => field !== 'entriesStopped');
// This report contains typed configuration, never raw key/operation payloads.
// A schema property or target field named "key" is not a credential. Retain
// its meaning while applying the helper's secret-text redaction everywhere.
function redactText(value, redact) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(item => redactText(item, redact));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([name, item]) => [redact(name), redactText(item, redact)]));
  return value;
}

// Installed without app imports. Mirror tracking/validate.ts effectiveLimits
// and tracking/catalog.ts propertiesMetadata; CLI parity tests cover every
// property type against the public plan response, including nested entries.
function effectiveProperties(properties) {
  return Object.fromEntries(Object.entries(properties).map(([name, def]) => {
    let limits = {};
    switch (def.type) {
      case 'array': limits = def.maxEntries !== undefined ? { maxEntries: def.maxEntries } : {}; break;
      case 'url': limits = { maxLength: Math.min(def.maxLength ?? 2048, 2048) }; break;
      case 'email': limits = { maxLength: Math.min(def.maxLength ?? 320, 320) }; break;
      case 'string': limits = def.maxLength !== undefined ? { maxLength: def.maxLength } : {}; break;
      case 'integer': limits = { minimum: Math.max(def.minimum ?? -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER),
        maximum: Number.MAX_SAFE_INTEGER }; break;
      case 'number': limits = { ...pick(def, ['minimum', 'exclusiveMinimum']) }; break;
    }
    return [name, { type: def.type, required: def.required, use: def.use, ...limits,
      ...(def.format ? { format: def.format } : {}),
      ...(def.type === 'array' ? { entry: effectiveProperties(def.entry ?? {}) } : {}) }];
  }));
}
const eventProjection = event => ({ ...event, properties: effectiveProperties(event.properties), storedProperties: event.properties });
const planProjection = value => value === null ? null : { ...value, events: value.events.map(eventProjection) };

async function pendingOperations(read, connectionId) {
  const operations = [], cursors = new Set(), ids = new Set();
  let cursor;
  for (let n = 0; ; n++) {
    const page = await read('/operations?status=awaiting_approval' + (cursor ? `&after=${encodeURIComponent(cursor)}` : ''));
    need(Array.isArray(page.operations));
    for (const op of page.operations) {
      need(UUID.test(op.id) && !ids.has(op.id) && op.connection_id === connectionId);
      ids.add(op.id);
      // An older server may ignore the additive filter; do not mislabel history.
      if (op.status === 'awaiting_approval') operations.push(pick(op,
        ['id', 'action', 'input_hash', 'policy_version', 'status', 'created_at']));
    }
    if (page.next === null) return operations;
    need(UUID.test(page.next) && !cursors.has(page.next));
    cursors.add(page.next); cursor = page.next;
    if (n + 1 >= PAGES) fail('package_limit', 'Too many operation pages. No package was saved.');
  }
}

async function* playPages(read, first) {
  need(Array.isArray(first.plays) && typeof first.revision === 'string' && Number.isSafeInteger(first.total) && first.total >= 0);
  if (first.total > PLAYS) fail('package_limit', 'This export supports up to 100 plays. No package was saved.');
  const ids = new Set(), cursors = new Set();
  let page = first;
  for (let n = 0; ; n++) {
    need(page.revision === first.revision && page.total === first.total && Array.isArray(page.plays));
    for (const summary of page.plays) {
      need(SLUG.test(summary.id) && !ids.has(summary.id) && ids.size < PLAYS);
      ids.add(summary.id);
    }
    yield page;
    if (page.next === null) break;
    need(typeof page.next === 'string' && !cursors.has(page.next));
    cursors.add(page.next);
    if (n + 1 >= PAGES) fail('package_limit', 'Too many play pages. No package was saved.');
    page = await read(`/plays?revision=${encodeURIComponent(first.revision)}&after=${encodeURIComponent(page.next)}`);
  }
  need(ids.size === first.total, 'The play list was incomplete. No package was saved.');
}

function checkEvidence(input, report) {
  if (input === undefined) return null;
  const object = (value, keys) => need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)), 'Check the evidence fields in references/review-package.md.');
  const text = value => need(typeof value === 'string' && value.trim().length > 0 && value.length <= 4000, 'Evidence text must contain 1 to 4000 characters.');
  const list = (value, max, check) => {
    need(Array.isArray(value) && value.length <= max, `Evidence lists must contain at most ${max} entries.`);
    value.forEach(check);
  };
  object(input, ['workspaceId', 'planVersion', 'sourceCommit', 'summary', 'events', 'plays', 'assumptions', 'remaining']);
  need(input.workspaceId === report.workspace.id && input.planVersion === (report.plan.proposed?.version ?? report.plan.approved?.version ?? null),
    'The evidence workspace or plan version changed. Refresh the evidence before exporting.');
  need(typeof input.sourceCommit === 'string' && /^[0-9a-f]{7,64}$/i.test(input.sourceCommit), 'Evidence needs the source Git commit.');
  text(input.summary);
  const knownEvents = new Set([...report.plan.core, ...(report.plan.proposed ?? report.plan.approved)?.events ?? []].map(event => event.name));
  const events = new Set();
  list(input.events, 100, event => {
    object(event, ['name', 'source', 'trigger', 'why', 'status', 'checks']);
    need(knownEvents.has(event.name) && !events.has(event.name), 'Evidence events must be unique names from the selected plan.');
    events.add(event.name);
    for (const field of ['source', 'trigger', 'why']) text(event[field]);
    need(['planned', 'implemented', 'tested', 'deployed', 'not_applicable'].includes(event.status), 'Use a documented evidence status.');
    if (event.checks !== undefined) list(event.checks, 20, check => {
      object(check, ['command', 'result']); text(check.command); text(check.result);
    });
  });
  const revisions = new Set();
  list(input.plays, 200, play => {
    object(play, ['playId', 'revisionId', 'why']); text(play.why);
    const key = `${play.playId}:${play.revisionId}`;
    need(!revisions.has(key) && report.plays.some(p => p.summary.id === play.playId && p.revisions.some(r => r.id === play.revisionId)),
      'A play in the evidence changed or is missing. Use the exact current revision.');
    revisions.add(key);
  });
  list(input.assumptions, 50, text); list(input.remaining, 50, text);
  return input;
}

export async function reviewPackage({ request, redact, base, outputDir, evidence, proofId, deadline }) {
  const destination = resolve(realpathSync(dirname(resolve(outputDir))), basename(resolve(outputDir)));
  if (existsSync(destination)) fail('output_exists', 'Choose a new output directory. Existing review packages are never overwritten.');
  let bytes = 0;
  const read = async (path, method = 'GET', body) => {
    if (Date.now() >= deadline) fail('timeout', 'The review export timed out. No package was saved. Retry with --timeout-ms 300000.');
    const response = await request('/api/management/v1' + path, method, body);
    if (response.status < 200 || response.status >= 300) {
      throw Object.assign(new Error(`Could not read the complete review package (HTTP ${response.status}). No package was saved.`),
        { code: response.body?.code ?? 'review_unavailable', exit: [401, 403].includes(response.status) ? 2 : 1 });
    }
    bytes += Buffer.byteLength(JSON.stringify(response.body));
    if (bytes > BYTES) fail('package_limit', 'The review package exceeded 16 MiB. No package was saved.');
    return response.body;
  };
  const capabilities = await read('/capabilities'), connection = capabilities.connection;
  need(capabilities.version === 'management@1' && UUID.test(connection?.tenant_id) && UUID.test(connection?.id)
    && Array.isArray(connection.permissions) && Array.isArray(connection.review) && Number.isSafeInteger(connection.policy_version));
  const setup = await read('/setup');
  need(typeof setup.version === 'string' && setup.facts?.tenantId === connection.tenant_id && setup.tenant
    && Array.isArray(setup.steps) && Array.isArray(setup.events) && typeof setup.setup_complete === 'boolean'
    && ['feedEnabled', 'sendingOn', 'liveKeyDeployed'].every(key => typeof setup.facts[key] === 'boolean')
    && typeof setup.facts.domainState === 'string');
  const plan = await read('/plan');
  if (!Array.isArray(plan.core) || !plan.core.length) fail('server_update_required', 'Barua needs the review-package server update before exporting. No package was saved.');
  need(plan.core.every(event => SLUG.test(event.name) && event.properties && typeof event.description === 'string'));
  for (const value of [plan.proposed, plan.approved]) need(value === null || (Number.isSafeInteger(value?.version)
    && Array.isArray(value.events) && Array.isArray(value.notEmitted) && Array.isArray(value.shadowed)));
  const href = (screen, detail) => `${base}/app/#/w/${encodeURIComponent(connection.tenant_id)}/${screen}${detail ? '/' + encodeURIComponent(detail) : ''}`;
  const report = {
    schemaVersion: 'barua-review@1', managementVersion: capabilities.version, capturedAt: new Date().toISOString(),
    workspace: { id: connection.tenant_id, name: setup.tenant.name, siteUrl: setup.tenant.brand_pack?.site_url ?? setup.tenant.site_origin },
    connection: { id: connection.id, label: connection.label, policyVersion: connection.policy_version,
      permissions: connection.permissions, review: connection.review },
    workspaceVersion: setup.version,
    // Derive display metadata without changing the captured plan used by the
    // final snapshot check. storedProperties also keeps raw-only changes visible.
    plan: { core: plan.core.map(eventProjection), approved: planProjection(plan.approved),
      proposed: planProjection(plan.proposed), approvalActor: actor(plan.approvalActor) },
    launch: { facts: pick(setup.facts, ['emailProvider', 'fromEmail', 'sendingDomain', 'domainState', 'feedEnabled', 'sendingOn', 'liveKeyDeployed', 'plan', 'verdict']),
      steps: setup.steps, events: setup.events, setupComplete: setup.setup_complete,
      senderName: setup.tenant.brand_pack?.from_name ?? null,
      languagePolicy: setup.tenant.brand_pack?.language_policy ?? null,
      sendingHours: setup.tenant.brand_pack?.send_policy ?? null,
      workspaceTimezone: setup.tenant.brand_pack?.timezone ?? null },
    plays: [], operations: [], proof: null,
    links: { plan: href('settings', 'plan'), agents: href('settings', 'agents'), setup: href('settings', 'setup'), plays: href('plays') },
  };
  report.operations = await pendingOperations(read, connection.id);
  const selectedProof = async () => {
    if (!proofId) return null;
    const proof = await read(`/proofs/${proofId}`);
    need(proof.id === proofId && typeof proof.status === 'string' && UUID.test(proof.revision_id));
    // No person, source event, key, message, receipt or enrollment identifiers.
    return pick(proof, ['id', 'started_at', 'revision_id', 'status', 'reason_code', 'sent_at', 'delivered_at']);
  };
  const proof = await selectedProof();
  const first = await read('/plays');
  let previews = 0;
  for await (const page of playPages(read, first)) {
    for (const summary of page.plays) {
      const detail = await read(`/plays/${encodeURIComponent(summary.id)}/detail`);
      if (detail.summary?.id !== summary.id || detail.summary?.token !== summary.token
        || detail.summary?.proposalRevisionId !== summary.proposalRevisionId || detail.summary?.approvedRevisionId !== summary.approvedRevisionId) {
        fail('snapshot_changed', 'A play changed during export. Retry to capture its current version.');
      }
      // Removal keeps the last revision ID in the summary, but intentionally
      // returns no proposed policy. The approved policy can still be running.
      need((detail.summary.removalProposed ? detail.proposed === null : (detail.proposed?.id ?? null) === summary.proposalRevisionId)
        && (detail.approved?.id ?? null) === summary.approvedRevisionId);
      const item = { summary: pick(detail.summary, summaryFields), revisions: [], previews: [],
        feedback: detail.feedback ? pick(detail.feedback, ['state', 'note', 'error']) : null, reviewUrl: href('plays', summary.id) };
      for (const [kind, revision] of [['proposed', detail.proposed], ['approved', detail.approved]]) {
        if (!revision) continue;
        need(UUID.test(revision.id) && typeof revision.contentHash === 'string'
          && Array.isArray(revision.languages) && Array.isArray(revision.flow?.steps) && revision.play);
        // Revision identity binds the emails, not the independently approved
        // policy/language grant. Keep both role-specific metadata projections.
        item.revisions.push({ ...pick(revision, ['id', 'contentHash', 'createdAt', 'sourceCurrent', 'area', 'play', 'flow', 'languages', 'approvedLanguages']),
          roles: [kind], approvalActor: actor(revision.approvalActor) });
        for (const step of revision.flow.steps) {
          // Revision languages cover complete sequences; each step can have
          // additional templates that the owner still needs to inspect.
          need(Array.isArray(step.languages));
          for (const language of step.languages) {
            if (item.previews.some(value => value.revisionId === revision.id && value.stepId === step.id && value.language === language)) continue;
            if (++previews > PREVIEWS) fail('package_limit', 'This export supports up to 256 email previews. No package was saved.');
            need(typeof step.id === 'string' && typeof language === 'string');
            const preview = await read(`/plays/${encodeURIComponent(summary.id)}/preview`, 'POST', {
              revisionId: revision.id, stepId: step.id, language, example: true,
            });
            need(typeof preview.reason === 'string' && Array.isArray(preview.lintIssues)
              && (preview.subject === null || typeof preview.subject === 'string')
              && (preview.bodyHtml === null || typeof preview.bodyHtml === 'string'));
            item.previews.push({ revisionId: revision.id, stepId: step.id, language,
              ...pick(preview, ['reason', 'subject', 'bodyHtml', 'lintIssues']) });
          }
        }
      }
      report.plays.push(item);
    }
  }
  if (proof) report.proof = { ...proof,
    matchesApprovedRevision: report.plays.some(p => p.revisions.some(r => r.roles.includes('approved') && r.id === proof.revision_id)) };
  const afterPage = await read('/plays'), afterSummaries = [];
  // Preparation notes are added after the SQL page and can change without
  // its revision. Compare every captured summary, including later pages.
  for await (const page of playPages(read, afterPage)) {
    afterSummaries.push(...page.plays.map(summary => pick(summary, pageSummaryFields)));
  }
  const afterPlan = await read('/plan'), afterSetup = await read('/setup');
  const afterOperations = await pendingOperations(read, connection.id), afterProof = await selectedProof();
  const afterCapabilities = await read('/capabilities');
  // The workspace version covers configuration, not incoming event receipts.
  // Setup has no per-request clock field: compare its full measured response.
  if (afterPage.revision !== first.revision || afterPage.total !== first.total || !same(plan, afterPlan)
    || !same(setup, afterSetup) || !same(authority(connection), authority(afterCapabilities.connection))
    || !same(report.plays.map(play => pick(play.summary, pageSummaryFields)), afterSummaries)
    || !same(report.operations, afterOperations) || !same(proof, afterProof)) {
    fail('snapshot_changed', 'Review data changed during export. Retry to capture its current state.');
  }
  report.evidence = checkEvidence(evidence, report);
  const clean = redactText(report, redact);
  clean.id = createHash('sha256').update(JSON.stringify(clean)).digest('hex');
  const json = JSON.stringify(clean, null, 2) + '\n', html = renderPackage(clean);
  if (Buffer.byteLength(json) + Buffer.byteLength(html) > BYTES) fail('package_limit', 'The rendered package exceeded 16 MiB. No package was saved.');
  if (Date.now() >= deadline) fail('timeout', 'The review export timed out. No package was saved.');
  // Reserve a new private directory only after every read/check succeeds.
  // On failure remove only files this invocation created, never a prior report.
  try { mkdirSync(destination, { mode: 0o700 }); }
  catch { fail('output_exists', 'Choose a new writable output directory. Existing review packages are never overwritten.'); }
  const written = [];
  try {
    for (const [name, content] of [['review.json', json], ['index.html', html]]) {
      const path = join(destination, name);
      const fd = openSync(path, 'wx', 0o600); written.push(path);
      try { writeFileSync(fd, content); } finally { closeSync(fd); }
    }
  } catch (error) {
    for (const path of written) unlinkSync(path);
    try { rmdirSync(destination); } catch {}
    throw error;
  }
  return { exit: 0, package_id: clean.id, captured_at: clean.capturedAt,
    artifacts: { html: join(destination, 'index.html'), json: join(destination, 'review.json') },
    plays: clean.plays.length, previews, pending_reviews: clean.operations.length };
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prose = value => escape(value ?? 'Not supplied');
const human = value => String(value ?? '').replaceAll('_', ' ').replaceAll('.', ' ');
const areaName = value => ({ before: 'Before the first milestone', tasks: 'Task help', unplaced: 'Placement unknown',
  'lane:service': 'Receipts and order updates' })[value] ?? (human(String(value ?? '').replace(/^(lane|stage):/, '')) || 'Not recorded');
const duration = hours => hours && hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`;
function nextActor(step) {
  if (step.done) return 'Complete';
  // The shared setup actor predates delegated management. Its action hints
  // carry the current grant and review choice; do not invent an owner stop.
  if (step.action) {
    if (!step.agent_allowed) return 'Owner or additional access';
    return step.requires_review ? 'Owner review, then agent' : 'Agent';
  }
  return step.actor === 'barua' ? 'Barua' : step.actor === 'agent' ? 'Agent' : 'Owner';
}
function condition(value) {
  if (!value) return 'Condition unavailable';
  if (value.op === 'all' || value.op === 'any') return value.conditions.length
    ? value.conditions.map(c => `(${condition(c)})`).join(value.op === 'all' ? ' and ' : ' or ') : value.op === 'all' ? 'Always' : 'Never';
  if (value.op === 'not') return `Unless (${condition(value.condition)})`;
  const message = /^messages\.([a-z0-9_]+)\.(opened|clicked|delivered)$/.exec(value.field);
  if (message && ['eq', 'ne'].includes(value.op) && typeof value.value === 'boolean') {
    const positive = value.op === 'eq' ? value.value : !value.value;
    return `${human(message[1])}: ${positive ? '' : 'no '}${message[2] === 'opened' ? 'open' : message[2] === 'clicked' ? 'click' : 'delivery'} reported`;
  }
  if (value.op === 'exists') return `${human(value.field)} is present`;
  if (value.op === 'elapsed') return `${duration(value.hours)} has passed since ${human(value.field)}`;
  const comparison = { eq: 'is', ne: 'is not', lt: 'is less than', lte: 'is at most', gt: 'is greater than', gte: 'is at least', in: 'is one of' };
  return `${human(value.field)} ${comparison[value.op] ?? value.op} ${value.value === null ? 'empty' : Array.isArray(value.value) ? value.value.join(', ') : value.value}`;
}
const rows = entries => `<dl>${entries.map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${prose(value)}</dd></div>`).join('')}</dl>`;
const list = values => values.length ? `<ul>${values.map(value => `<li>${prose(value)}</li>`).join('')}</ul>` : '<p>None recorded.</p>';
const link = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
function workspacePolicyRows(launch) {
  // This module is installed without the app. Keep the display defaults in
  // parity with pipeline/language.ts and sendWindow.ts; the CLI regression
  // compares their effective choices, while exact saved policy stays below.
  const language = launch.languagePolicy, send = launch.sendingHours;
  const norm = value => (value ?? '').slice(0, 2).toLowerCase();
  const fallback = norm(language?.fallback) || 'en';
  const supported = (language?.supported ?? [fallback]).map(norm).filter(Boolean);
  const mode = language?.mode ?? 'match_supported';
  const window = send?.window;
  const validWindow = window && Number.isInteger(window.start) && Number.isInteger(window.end)
    && window.start >= 8 && window.end <= 21 && window.start < window.end;
  const hours = validWindow ? window : { start: 9, end: 11 };
  const weekdays = typeof send?.weekdays_only === 'boolean' ? send.weekdays_only : send?.audience === 'b2b';
  return rows([
    ['Language selection', mode === 'fixed' ? 'Always use the fallback language'
      : mode === 'match_person' ? 'Match the person’s language; use the fallback when it is unknown'
        : 'Match the person’s language when supported; use the fallback otherwise'],
    ['Supported languages', supported.join(', ') || 'None recorded'],
    ['Fallback language', fallback],
    ['Marketing send window', `${String(hours.start).padStart(2, '0')}:00 to ${String(hours.end).padStart(2, '0')}:00; ${weekdays ? 'Weekdays only' : 'Every day'}${validWindow ? '' : '; default hours'}`],
    ['Scheduling time zone', `Recipient timezone first; workspace setting: ${launch.workspaceTimezone ?? 'not set'}; UTC when neither is available`],
  ]) + `<details><summary>Exact workspace policies</summary><pre>${escape(JSON.stringify({
    languagePolicy: launch.languagePolicy, sendingHours: launch.sendingHours, workspaceTimezone: launch.workspaceTimezone,
  }, null, 2))}</pre></details>`;
}
function properties(values, prefix = '') {
  const labels = { maxLength: 'Maximum length', minimum: 'Minimum', exclusiveMinimum: 'Greater than', maximum: 'Maximum', format: 'Format', maxEntries: 'Maximum entries' };
  return Object.entries(values).map(([name, value]) => {
    const constraints = Object.entries(value).filter(([key]) => !['type', 'required', 'use', 'entry'].includes(key))
      .map(([key, limit]) => `${labels[key] ?? human(key)}: ${typeof limit === 'object' ? JSON.stringify(limit) : limit}`).join('; ');
    return `<tr><td data-label="Field"><code>${escape(prefix + name)}</code></td><td data-label="Type">${escape(value.type)}${value.required ? ', required' : ', optional'}</td><td data-label="Use">${value.use === 'copy' ? 'May appear in emails' : 'Targeting only'}</td><td data-label="Constraints">${escape(constraints || 'None')}</td></tr>${value.entry ? properties(value.entry, prefix + name + '[].') : ''}`;
  }).join('');
}
function eventContract(event, label) {
  const { storedProperties, ...captured } = event;
  return `${label ? `<h4>${escape(label)}</h4>` : ''}<p>${prose(event.description)}</p>
    ${event.idFrom ? rows([['Event identity', event.idFrom]]) : ''}
    ${event.directionless ? '<p>This event records a choice or state; it is not a measured outcome by name alone.</p>' : ''}
    <details><summary>Data carried (${Object.keys(event.properties).length} ${Object.keys(event.properties).length === 1 ? 'field' : 'fields'})</summary><p>Effective limits include Barua’s built-in caps and the stored constraints for this version.</p><table class="contract-fields"><thead><tr><th>Field</th><th>Type</th><th>Use</th><th>Constraints</th></tr></thead><tbody>${properties(event.properties)}</tbody></table></details>
    <details><summary>Exact stored event contract</summary><pre>${escape(JSON.stringify({ ...captured, properties: storedProperties }, null, 2))}</pre></details>`;
}
function eventResults(status) {
  return (status ? rows([
    ['Required by the current contract', status.required ? 'Yes' : 'No'],
    ['Approved omission', status.not_emitted ?? 'None'],
  ]) : '') + ['test', 'live'].map(mode => {
    const block = status?.[mode], latest = block?.latest;
    return rows([[`Latest ${mode} result`, latest ? `${latest.status}${latest.code ? ` (${latest.code})` : ''} at ${latest.at}` : 'No result in the current status window'],
      [`${human(mode)} result counts`, Object.entries(block?.counts ?? {}).map(([state, count]) => `${human(state)}: ${count}`).join('; ') || 'None recorded']])
      + (block?.reasons?.length ? `<details open><summary>${escape(human(mode))} diagnostics</summary>${list(block.reasons.map(reason =>
        `${reason.code}: ${reason.message} Fix: ${reason.fix} (${reason.count} records; last seen ${reason.last_seen_at})`))}</details>` : '');
  }).join('');
}
function eventVerdicts(verdict) {
  // Management setup deliberately supplies reduced verdicts. Do not turn
  // absent invalid/missing/truncation lists into an invented clean result.
  const next = verdict?.live?.needs_human ?? [];
  return rows(['test', 'live'].map(mode => {
    const exit = verdict?.[mode]?.exit;
    return [`${human(mode)} event check`, exit === 0 ? 'Passed (exit 0)' : exit === 3 ? 'Needs attention (exit 3)'
      : exit === 4 ? 'Setup action needed (exit 4)' : 'Result unavailable'];
  })) + (['test', 'live'].some(mode => verdict?.[mode]?.exit === 3)
    ? '<p class="notice">Detailed verdict reasons are unavailable in this management snapshot. A missing or invalid event, or more failures than the status sample can include, may need attention. Review the available event results and recheck event status before launch.</p>' : '')
    + (next.length ? list(next.map(step => `${human(step.step)}: ${step.why} Next: ${step.resume}`)) : '');
}
const emailDocument = html => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{margin:16px;font:16px/1.6 system-ui;color:#201b16;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${html}</body></html>`;
// The installed skill has no app imports. A rendering regression compares
// these with app/ui/lib/serviceCopy.ts's current purpose and scheduling copy.
// Stored briefs/rules remain untouched: they enter the exact rule fingerprint.
const SERVICE_EMAIL_PURPOSE = 'The words of this email are written once for your store and approved by you; every order detail is filled in from the order itself.';
const SERVICE_MINIMUM_GAP = 'None. Each receipt or order update is its own email.';
function serviceRepeat(flow) {
  const key = flow.reentry.field?.split('.').at(-1);
  return key === 'order_id' ? 'Once per order'
    : key === 'shipment_id' ? 'Once per shipment'
    : key === 'refund_id' ? 'Once per refund'
    : key === 'event_id' ? 'Once per new delivery date' : 'Once per event';
}
// Mirror PlayBranchMap's rendered path description. Normalize authored names
// only: punctuation in executable predicates and identifiers is significant.
// Version 2 steps are reusable emails, not an execution order. CLI tests
// compare every node kind with that consumer; the captured graph stays exact.
function graphDescription(flow) {
  const emailName = id => {
    const step = flow.steps.find(step => step.id === id);
    return step ? String(step.name).replace(/\s*—\s*/g, ', ').replace(/\s+--\s+/g, ', ') : id;
  };
  const title = node => node.type === 'send'
    ? emailName(node.step_id)
    : node.type === 'branch' ? 'Choose a path' : node.type === 'delay' ? `Wait ${duration(node.hours)}`
      : node.type === 'wait' ? `Wait up to ${duration(node.timeout_hours)}` : 'Finish';
  const named = id => {
    const node = flow.graph.nodes.find(item => item.id === id);
    return node ? title(node) : id;
  };
  return [`Start at ${named(flow.graph.start)}.`, ...flow.graph.nodes.map(node => {
    const name = named(node.id);
    if (node.type === 'end') return `${name}: the journey ends.`;
    if (node.type === 'send') return `${name}: send this email, then ${named(node.next)}.${node.skip_when ? ` Skip when ${condition(node.skip_when)}; continue to ${named(node.on_skip)}.` : ''}`;
    if (node.type === 'delay') return `${name}: count from ${node.anchor === 'send' ? `acceptance of ${emailName(node.step_id)}` : 'arrival at this step'}, then ${named(node.next)}.`;
    if (node.type === 'wait') return `${name}: when ${condition(node.when)}, continue to ${named(node.matched)}; after the deadline, continue to ${named(node.timeout)}.`;
    return `${name}: ${node.paths.map((path, i) => `${i + 1}. When ${condition(path.when)}, continue to ${named(path.next)}`).join('; ')}; otherwise ${named(node.fallback)}.`;
  })];
}
function revisionHtml(item, revision, report) {
  const p = revision.play, flow = revision.flow, note = report.evidence?.plays.find(n => n.playId === item.summary.id && n.revisionId === revision.id);
  const service = p.class === 'transactional', branching = flow.version === 2, emailList = branching ? 'ul' : 'ol';
  return `<section class="version"><h4>${revision.roles.map(human).map(escape).join(' / ')} version</h4>
    <p class="meta">Revision ${escape(revision.id)} · ${escape(revision.createdAt)}</p>
    ${!revision.sourceCurrent ? '<p class="notice">Update needed. The inputs behind this version have changed.</p>' : ''}
    ${rows([
      ['Audience', p.audience], ['Why this play', note ? `${note.why} (agent-reported)` : 'Agent rationale not supplied'],
      ['Required context', p.grounded_in ?? 'None recorded'],
      ['Proposed context', p.when?.join('; ') || 'None recorded'],
      ['Audience stages', p.stages?.map(stage => stage === null ? 'Before the first milestone' : human(stage)).join(', ') || areaName(revision.area)],
      ['Task help', p.journey_tasks?.map(human).join(', ') || 'No specific task'],
      ['Intended outcome', p.goal ? human(p.goal.replace(/^event:/, '')) : 'No measured outcome'],
      ['Starts when', condition(flow.entry)], ['Stops when', flow.exit ? condition(flow.exit) : branching ? 'People leave when their path finishes.' : 'The sequence finishes'],
      ['Selected item', flow.target ? `${human(flow.target.collection)}, identified by ${human(flow.target.key)}; ${condition(flow.target.where)}` : 'No selected item'],
      ['Email type', service ? 'Service email' : 'Marketing email; recipient consent and workspace permission rules still apply'],
      ['Repeat', service ? serviceRepeat(flow) : flow.reentry.mode === 'once' ? 'Once per person' : `Each new ${human(flow.reentry.field)}; at least ${flow.reentry.cooldown_days} days apart`],
      ['Occurrence time', flow.reentry.timestamp_field ? human(flow.reentry.timestamp_field) : 'No explicit timestamp field'],
      ['Minimum time between plays', service ? SERVICE_MINIMUM_GAP : `${p.cadence_days} days`],
      ['Lifetime limit', p.max_lifetime ? `${p.max_lifetime} per person` : 'No play-specific limit'],
      ['Related history', p.legacy_slugs?.join(', ') || 'This play only'],
      ['Additional restrictions', p.never?.join('; ') || 'None recorded'],
      ['Season', p.window ? `${p.window.from} through ${p.window.to} (UTC)` : 'All year'],
      ['Priority', flow.priority], ['Prepared languages', revision.languages?.join(', ') || 'None'],
      ['Approved languages', revision.approvedLanguages?.join(', ') || 'None'],
      // Provenance is keyed to email revision identity, not this policy role.
      ['Email version approval', revision.approvalActor ? `${revision.approvalActor.label} (${revision.approvalActor.kind}); historical record for these emails, not approval of changed rules` : 'No approval recorded'],
    ])}
    ${branching ? `<div class="play-paths"><h5>Play paths</h5><p>One path runs for each person.</p>${list(graphDescription(flow))}
      <p>An unavailable signal keeps the person waiting. “Otherwise” is used only after each earlier condition is known to be false.</p></div>
      <h5>Available emails</h5>` : ''}
    <${emailList} class="sequence">${flow.steps.map(step => `<li><h5>${escape(step.name)}</h5>
      ${branching ? `<p>The person reaches this email on their selected path.</p>${flow.graph.nodes
        .filter(node => node.type === 'send' && node.step_id === step.id && node.skip_when)
        .map(node => `<p>Skip when ${escape(condition(node.skip_when))}.</p>`).join('')}`
        : `<p>${escape(duration(step.delay.hours))} after ${escape(step.delay.anchor === 'enrollment' ? 'entering the play' : step.delay.anchor === 'previous_send' ? 'the previous email' : human(step.delay.event_field))}.</p>
      <p>Send when ${escape(condition(step.when))}.${step.skip_when ? ` Skip when ${escape(condition(step.skip_when))}.` : ''}</p>`}
      <p>${prose(service ? SERVICE_EMAIL_PURPOSE : step.copy_brief)}</p>
      ${rows([['Personalization', `Required: ${step.required_fields?.map(human).join(', ') || 'none'}; defaults: ${Object.entries(step.optional_fields ?? {}).map(([field, value]) => `${human(field)}: ${value}`).join('; ') || 'none'}`]])}
      ${item.previews.filter(p => p.revisionId === revision.id && p.stepId === step.id).map(preview => `<details class="email"><summary>Email preview · ${escape(preview.language)} · ${prose(preview.subject ?? 'Preview unavailable')}</summary>
        <p>Example person. Nothing was sent. Remote images and active content are blocked.</p>
        <p>${prose(preview.reason)}</p>${preview.lintIssues.length ? `<p class="notice">Needs attention: ${escape(preview.lintIssues.join('; '))}</p>` : ''}
        ${preview.bodyHtml ? `<iframe sandbox="" referrerpolicy="no-referrer" title="${escape(step.name + ' · ' + preview.language)}" srcdoc="${escape(emailDocument(preview.bodyHtml))}"></iframe>` : '<p>This email has no rendered preview yet.</p>'}
      </details>`).join('') || '<p>No languages are ready to preview.</p>'}</li>`).join('')}</${emailList}>
    <details><summary>Exact version details</summary><pre>${escape(JSON.stringify({ revisionId: revision.id, contentHash: revision.contentHash, area: revision.area, play: p, flow }, null, 2))}</pre></details>
  </section>`;
}

function renderPackage(report) {
  const chosen = report.plan.proposed ?? report.plan.approved, facts = report.launch.facts;
  const events = [...report.plan.core, ...(chosen?.events ?? [])];
  const removed = (report.plan.approved?.events ?? []).filter(event => !events.some(next => next.name === event.name));
  const otherStatuses = report.launch.events.filter(status => !events.some(event => event.name === status.name));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src 'self' about:; img-src data:; form-action 'none'; base-uri 'none'">
    <meta name="referrer" content="no-referrer"><title>${escape(report.workspace.name)} · Setup review</title>
    <style>
    .setup-status td:nth-child(2){overflow-wrap:normal;word-break:normal;min-width:5.5em}
    @media(max-width:640px){
      .contract-fields thead{display:none}
      .contract-fields tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}
      .contract-fields td{display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px;border:0;padding:4px 0}
      .contract-fields td::before{content:attr(data-label);font-weight:600}
    }</style>
    <style>:root{--paper:#faf5ec;--ink:#201b16;--link:#b5370f;--line:#d9cfc2;--muted:#62594f}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}main{max-width:1060px;margin:auto;padding:40px 28px 80px}h1,h2,h3,h4,h5{line-height:1.25;letter-spacing:-.02em}h1{font-size:42px;margin:10px 0 20px}h2{font-size:28px;margin-top:56px}h3{font-size:23px}h4{font-size:19px}h5{font-size:17px;margin:8px 0}a{color:var(--link);text-underline-offset:3px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:20px 0;border-block:1px solid var(--line)}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.notice{border-left:3px solid var(--link);padding:12px 18px;background:#fff8f1}.card,.version{padding:24px;border:1px solid var(--line);border-radius:12px;margin:20px 0;background:#fffdf8}.version{background:transparent}.chip{display:inline-block;padding:3px 10px;background:#efe7db;border-radius:20px;font-size:13px;margin:0 5px 8px 0}dl{margin:18px 0}dl>div{display:grid;grid-template-columns:minmax(150px,1fr) 3fr;gap:20px;padding:8px 0;border-bottom:1px solid var(--line)}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}details{margin:16px 0}summary{cursor:pointer;font-weight:600}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}code{overflow-wrap:anywhere}iframe{width:100%;height:520px;border:1px solid var(--line);border-radius:8px;background:white}.sequence{padding-left:24px}.sequence>li{padding:12px 0}.email{padding:16px;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:56px;padding-top:20px}@media(max-width:640px){main{padding:24px 16px}h1{font-size:32px}.card,.version{padding:16px}dl>div{display:block}dd{margin-top:4px}th,td{padding:6px}.sequence{padding-left:18px}}@media print{details{display:block}iframe{height:620px}.card{break-inside:avoid}}</style></head><body><main>
    <p class="meta">BARUA SETUP REVIEW · ${escape(report.capturedAt)}</p>
    <h1>${escape(report.workspace.name)}</h1><p>${escape(report.workspace.siteUrl)}</p>
    <p>Review the event plan and the emails it can start. This package is a snapshot. Open Barua to check the current version before deciding.</p>
    <nav aria-label="Report sections"><a href="#events">Event plan</a><a href="#plays">Proposed plays</a><a href="#launch">Launch status</a><a href="#decisions">Your decisions</a></nav>
    ${report.evidence ? `<p>${escape(report.evidence.summary)}</p><p class="meta">Repository notes are agent-reported and unverified by this exporter. Source commit: ${escape(report.evidence.sourceCommit)}.</p>` : '<p class="notice">Source implementation not supplied. This report shows Barua’s configuration; repository checks and deployment evidence still need to be supplied by the agent.</p>'}
    <h2 id="events">Event plan</h2><p>${chosen ? `${report.plan.proposed ? 'Proposed' : 'Approved'} plan version ${escape(chosen.version)}.` : 'No tracking plan has been proposed or approved.'} ${link(report.links.plan, 'Review the plan in Barua')}</p>
    ${removed.length ? `<p class="notice">Custom events removed by this proposal: ${escape(removed.map(e => e.name).join(', '))}.</p>` : ''}
    ${chosen?.shadowed.length ? `<div class="notice"><strong>Custom events now defined by Barua</strong>${list(chosen.shadowed.map(event => `${event.name}: ${event.reason}`))}</div>` : ''}
    <h3>Event checks</h3>${eventVerdicts(facts.verdict)}
    ${otherStatuses.length ? `<h3>Events outside this plan</h3>${otherStatuses.map(status => `<article class="card"><h4>${escape(status.name ?? 'Unnamed event')}</h4><p>This status entry is outside the selected plan. Its result can still affect the event check.</p>${eventResults(status)}</article>`).join('')}` : ''}
    <h3>Event contracts</h3>
    ${events.map(event => {
      const omission = chosen?.notEmitted?.find(value => value.name === event.name), note = report.evidence?.events.find(value => value.name === event.name);
      const approved = report.plan.approved?.events.find(value => value.name === event.name);
      const changed = report.plan.proposed && approved && !same(event, approved);
      const approvedOmission = report.plan.approved?.notEmitted.find(value => value.name === event.name);
      const status = report.launch.events.find(value => value.name === event.name);
      return `<article class="card"><h3>${escape(human(event.name))}</h3><p class="meta">${escape(event.name)} · ${escape(event.source ?? 'custom')}${event.emit ? ' · ' + escape(event.emit) : ''}</p>
        ${eventContract(event, event.source === 'core' ? '' : `${report.plan.proposed ? 'Proposed' : 'Approved'} contract · plan version ${chosen.version}`)}
        ${changed ? `<div class="notice">${eventContract(approved, `Approved contract · plan version ${report.plan.approved.version}`)}</div>` : ''}
        ${omission ? `<p class="notice">Not emitted${report.plan.proposed ? ' in the proposal' : ''}: ${escape(omission.reason)}</p>` : ''}
        ${report.plan.proposed && !same(omission ?? null, approvedOmission ?? null)
          ? `<p>Approved omission: ${prose(approvedOmission?.reason ?? 'None; the approved plan has no omission for this event')}.</p>` : ''}
        ${note ? rows([['Product trigger', note.trigger], ['Source', note.source], ['Why collect it', note.why], ['Agent reports', human(note.status)]])
          + (note.checks?.length ? `<details><summary>Agent-reported checks</summary>${list(note.checks.map(check => `${check.command}: ${check.result}`))}</details>` : '')
          : '<p class="meta">Source implementation not supplied for this event.</p>'}
        ${eventResults(status)}</article>`;
    }).join('')}
    ${removed.map(event => `<article class="card"><h3>${escape(human(event.name))}</h3><p class="notice">Removed by the proposal. The approved contract remains in effect until that proposal is approved.</p>${eventContract(event, `Approved contract · plan version ${report.plan.approved.version}`)}</article>`).join('')}
    <h2 id="plays">Proposed plays</h2><p>${report.plays.length} plays captured. Each version includes its own rules and example emails. ${link(report.links.plays, 'Open Plays')}</p>
    ${report.plays.length ? report.plays.map(item => `<article class="card"><h3>${escape(item.summary.name)}</h3>
      <span class="chip">${escape(human(item.summary.reviewState))}</span><span class="chip">${escape(human(item.summary.sendingState))}</span>
      ${item.summary.preparationNote ? `<p class="notice">${escape(item.summary.preparationNote)}</p>` : ''}
      ${item.summary.holdReason ? `<p>${escape(item.summary.holdReason)}</p>` : ''}
      ${item.summary.removalProposed ? '<p class="notice">Removal proposed. Review what should happen to this play.</p>' : ''}
      ${item.summary.controlPlayId ? `<p>Sending controls belong to ${escape(item.summary.controlPlayId)}. Check that play in Barua before changing sending.</p>` : ''}
      ${item.revisions.some(revision => revision.flow.version === 2) || item.summary.entriesStopped === true
        ? `<p class="notice">${item.summary.entriesStopped === true ? 'New entries are stopped. Existing journeys keep their saved progress.'
          : item.summary.entriesStopped === false ? 'New entries are allowed under the approved rules.'
            : 'The current new-entry setting was not supplied. Check it in Barua.'}</p>` : ''}
      ${item.revisions.length ? item.revisions.map(revision => revisionHtml(item, revision, report)).join('') : '<p>No email version is ready yet.</p>'}
      ${item.feedback ? `<p>Latest change request (${escape(item.feedback.state)}): ${escape(item.feedback.note)}</p>` : ''}
      ${item.feedback?.error ? `<p class="notice">Change request error: ${escape(item.feedback.error)}</p>` : ''}
      <p>${link(item.reviewUrl, 'Review or request changes in Barua')}</p></article>`).join('') : '<p>No plays are available yet. The plan and brand may still need approval, or Barua may still be preparing them.</p>'}
    <h2 id="launch">Launch status</h2><p>These are Barua’s observed settings at capture time. Repository notes above do not verify deployment or delivery.</p>
    ${workspacePolicyRows(report.launch)}
    ${rows([['Live event intake', facts.feedEnabled ? 'On' : 'Off'], ['Email sending', facts.sendingOn ? 'On' : 'Paused'],
      ['Sender', [report.launch.senderName, facts.fromEmail].filter(Boolean).join(' · ') || 'Not configured'],
      ['Sending service', facts.emailProvider === 'ses' ? 'Current service' : facts.emailProvider === 'mailgun' ? 'Retired service' : 'Not supplied'],
      ['Sending domain', `${facts.sendingDomain ?? 'Not configured'} (${facts.domainState})`],
      ['Live event key seen', facts.liveKeyDeployed ? 'Yes, a live signup was observed' : 'Not proven'],
      ['Delivery check record', report.proof ? `${human(report.proof.status)}; started ${report.proof.started_at}; ${report.proof.matchesApprovedRevision ? 'revision ID matches a currently approved email revision' : 'does not match a currently approved revision'}` : 'Not supplied. Earlier setup completion does not prove this launch.']])}
    ${facts.emailProvider === 'mailgun' ? '<p class="notice">Verification with the retired sending service does not complete current sender setup. Prepare the domain in the current From address, then verify and activate it.</p>' : ''}
    ${report.proof ? '<p class="notice">Reading this record does not verify the current launch settings or event key. It does not recheck the email provider.</p>' : ''}
    ${report.proof ? `<p class="meta">Proof revision ${escape(report.proof.revision_id)}. ${escape(report.proof.reason_code)}${report.proof.delivered_at ? '. Delivered at ' + escape(report.proof.delivered_at) : ''}.</p>` : ''}
    <table class="setup-status"><thead><tr><th>Setup step</th><th>State</th><th>Next actor</th></tr></thead><tbody>${report.launch.steps.map(step => `<tr><td>${escape(human(step.id))}${step.optional ? ' (optional)' : ''}</td><td>${escape(human(step.state))}</td><td>${escape(nextActor(step))}</td></tr>`).join('')}</tbody></table>
    <p>${link(report.links.setup, 'Open current setup')}</p>
    <h2 id="decisions">Your decisions</h2>
    <p>${report.connection.review.length ? `This connection requires human review at: ${escape(report.connection.review.join(', '))}.` : 'This connection has no human review checkpoints. The agent can continue within its granted permissions.'} Generating this package changes no approval or sending setting.</p>
    ${report.operations.length ? `<p>${report.operations.length} requests from this connection were waiting for review when read.</p>${list(report.operations.map(op => `${op.action} · request ${op.id} · policy version ${op.policy_version}`))}` : '<p>No pending requests were returned for this connection.</p>'}
    <p>${link(report.links.agents, 'Open agent requests')}</p>
    <p>To approve, open the matching request in Barua and compare its plan or email version with this report. For a play change, use its request-changes control. For event-plan changes, reject the pending request and tell your agent what should change. A changed proposal needs a new package and any review required by your policy.</p>
    ${report.evidence ? `<h3>Assumptions to check</h3>${list(report.evidence.assumptions)}<h3>Remaining work reported by the agent</h3>${list(report.evidence.remaining)}` : ''}
    <footer><p class="meta">Workspace ${escape(report.workspace.id)} · ${escape(report.connection.label)} · permission version ${escape(report.connection.policyVersion)}<br>Package ${escape(report.id)}<br>Workspace version ${escape(report.workspaceVersion)}</p>
    <p>This private export contains your business configuration and email copy. Share it through an approved channel. The JSON copy preserves the captured versions for your agent; it is not an approval receipt.</p></footer>
  </main></body></html>`;
}
