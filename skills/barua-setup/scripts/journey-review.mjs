// Local source review and exact approval binding. No dependencies or network.
// These checks establish recorded scope and identity, not semantic truth.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

const LIMIT = 512 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const LANGUAGE = /^[a-z]{2}$/;
const fail = message => { throw Object.assign(new Error(message), { code: 'journey_review' }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = Infinity) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const strings = (value, minimum = 0, max = Infinity) => Array.isArray(value) && value.length >= minimum && value.every(item => text(item, max));
const date = value => text(value) && Number.isFinite(Date.parse(value));
const complete = value => object(value) && value.status === 'complete' && date(value.checked_at) && strings(value.findings);
const unique = values => new Set(values).size === values.length;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

// Keep every documented strategy field except private evidence arrays. Review
// receipts, observations and workspace state must not enter the playbook: adding
// the exact-input digest would otherwise change the input it certifies.
const STRATEGY_FIELDS = [
  ['journey_ids', 'Journey'], ['kind', 'Kind'], ['outcome', 'Outcome'],
  ['trigger', 'Trigger'], ['actor', 'Actor'], ['subject', 'Subject'],
  ['eligibility', 'Eligible'], ['timing', 'Timing'], ['stops', 'Stop'],
  ['reentry', 'Repeat'], ['context', 'Context'], ['facts', 'Facts'],
  ['current_sender', 'Sends now'], ['proposed_sender', 'Send via'],
  ['duplicate_prevention', 'Avoid duplicates'], ['reason', 'Why'],
  ['implementation', 'Build status'], ['dependency', 'Needs'],
  ['next_action', 'Next'], ['planned_events', 'Events'],
];
const HELD_FIELDS = new Set(['journey_ids', 'kind', 'outcome', 'reason', 'dependency', 'next_action',
  'current_sender', 'proposed_sender']);
const SHARED_FIELDS = new Set(['kind', 'context', 'facts', 'current_sender', 'proposed_sender']);
// Mirrors program/types.ts. These purposes are code-defined, never authored by
// play.propose, even when one reviewed service opportunity covers several.
const SERVICE_PURPOSES = new Set(['receipt', 'order_shipped', 'order_delivered', 'order_delayed', 'order_cancelled', 'order_refunded']);
const lf = value => value.replace(/\r\n?/g, '\n');
const recorded = value => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
  ? 'Not recorded' : typeof value === 'string' ? lf(value) : JSON.stringify(stable(value));
const strategyValue = value => Array.isArray(value) && value.length ? value.map(recorded).join('; ') : recorded(value);

function perPlay(review) {
  if (!object(review) || !Object.hasOwn(review, 'authoring_mode')) return false;
  if (review.authoring_mode !== 'per_play') fail('Use authoring_mode per_play, or omit it for the legacy playbook.');
  if (!Array.isArray(review.opportunities)) fail('Record opportunity rows for per_play authoring.');
  for (const row of review.opportunities ?? []) {
    if (!object(row)) fail('Record opportunity objects for per_play authoring.');
    const target = row.execution_target;
    const keys = target?.type === 'fixed_service' ? ['type', 'purposes'] : ['type'];
    if (!object(target) || !['marketing', 'fixed_service', 'none'].includes(target.type)
      || Object.keys(target).some(key => !keys.includes(key)))
      fail(`Record a typed execution_target for ${recorded(row.id)}: marketing, fixed_service or none.`);
    if (target.type !== 'none' && (row.decision !== 'covered' || row.kind === 'control'
      || !text(row.kind)))
      fail(`Only covered, non-control opportunities owned by Barua can execute: ${recorded(row.id)}.`);
    // The typed target declares Barua ownership/marketing consent. Independent
    // source review checks consistency with the verbatim sender and rules;
    // guessing authority from their free-form prose would not prove it.
    if (target.type === 'marketing' && SERVICE_PURPOSES.has(row.id))
      fail(`Marketing cannot author a reserved service purpose: ${recorded(row.id)}.`);
    if (target.type === 'fixed_service' && (!strings(target.purposes, 1) || !unique(target.purposes)
      || target.purposes.some(purpose => !SERVICE_PURPOSES.has(purpose))))
      fail(`Choose distinct reserved purposes for the fixed service target ${recorded(row.id)}.`);
  }
  return true;
}

function strategyRow(row, fields = STRATEGY_FIELDS) {
  const held = row.decision === 'blocked' || row.decision === 'excluded';
  return [
    `${held ? 'Do not create a Play. ' : row.kind === 'control' ? 'Control, do not create a Play. ' : ''}${row.id} (${recorded(row.decision)})`,
    ...fields.map(([field, label]) => `${label}: ${strategyValue(row[field])}`),
  ].join('\n');
}

function compilePlaybook(review) {
  const rows = Array.isArray(review?.opportunities) ? review.opportunities : [];
  if (!rows.length || rows.some(row => !text(row?.id, 128)) || !unique(rows.map(row => row.id)))
    fail('Record distinct opportunity IDs before generating the playbook.');
  const scope = review.owner_scope ?? {};
  if (!object(scope)
    || (scope.requirement !== undefined && scope.requirement !== null && typeof scope.requirement !== 'string')
    || (scope.boundaries !== undefined && (!Array.isArray(scope.boundaries)
      || scope.boundaries.some(value => typeof value !== 'string'))))
    fail('Use an owner scope object with a text or null requirement and a list of boundary strings.');
  const separate = perPlay(review);
  const rendered = rows.map(row => {
    const held = row.decision === 'blocked' || row.decision === 'excluded';
    return { id: row.id, text: strategyRow(row, STRATEGY_FIELDS.filter(([field]) =>
      held ? HELD_FIELDS.has(field) : !separate || SHARED_FIELDS.has(field))) };
  });
  // Shorten repeated labels only. Keep field values and line boundaries intact:
  // URL readers, factual checks and human approval all consume this same text.
  const output = [
    `Product: ${strategyValue(review.product)}`,
    'Follow each decision and its proposed sending owner. Covered means strategy coverage, not implementation or launch. Keep messages assigned to another sender with that sender.',
    ...(separate ? ['This playbook contains shared factual context. Complete executable rules remain in the reviewed per-Play requests; reconcile each prepared Play against those rules before approval.'] : []),
    ...(scope.requirement === undefined ? [] : [`Owner requirement: ${strategyValue(scope.requirement)}`]),
    ...(scope.boundaries === undefined ? [] : [`Owner boundaries: ${strategyValue(scope.boundaries)}`]),
    ...rendered.map(row => row.text),
  ].join('\n\n').trim();
  return { output, rendered };
}

// Full chain: local JSON/action <=512 KiB; brand input trims to 41..24,000
// JS characters (management/catalog.ts). Proposals retain only 32 KiB UTF-8
// (learn.ts PROPOSAL_PLAYBOOK_BYTES); individual authoring keeps the full
// playbook but may refuse its total prompt cap. Never raise or truncate here.
const PLAYBOOK_CHARACTERS = 24_000, PLAYBOOK_BYTES = 32 * 1024;
function playbookMeasurement({ output, rendered }) {
  const characters = output.length, bytes = Buffer.byteLength(output);
  const rows = rendered.map(({ id, text }) => ({ id, characters: text.length, bytes: Buffer.byteLength(text) }));
  return { characters, bytes, limits: { characters: PLAYBOOK_CHARACTERS, bytes: PLAYBOOK_BYTES },
    fits: characters <= PLAYBOOK_CHARACTERS && bytes <= PLAYBOOK_BYTES,
    remaining: { characters: PLAYBOOK_CHARACTERS - characters, bytes: PLAYBOOK_BYTES - bytes },
    overhead: { characters: characters - rows.reduce((sum, row) => sum + row.characters, 0),
      bytes: bytes - rows.reduce((sum, row) => sum + row.bytes, 0) }, rows };
}

export function measurePlaybook(review) {
  return playbookMeasurement(compilePlaybook(review));
}

export function renderPlaybook(review) {
  const compiled = compilePlaybook(review), { output, rendered } = compiled;
  const { characters: chars, bytes, fits } = playbookMeasurement(compiled);
  if (!fits) {
    const largest = [...rendered].sort((a, b) => Buffer.byteLength(b.text) - Buffer.byteLength(a.text)).slice(0, 4)
      .map(row => `${JSON.stringify(row.id)} (${row.text.length} characters, ${Buffer.byteLength(row.text)} bytes)`).join('; ');
    const next = review.authoring_mode === 'per_play'
      ? 'Keep the original facts and rules; this shared playbook cannot be transported.'
      : 'Compact the recorded strategy and repeat its review.';
    fail(`The generated playbook has ${chars} characters and ${bytes} UTF-8 bytes; limits are 24,000 characters and 32,768 bytes. ${next} Largest rows: ${largest}.`);
  }
  return output;
}

// Entire chain: action/review JSON <=512 KiB; API strings use UTF-16 lengths
// 4000/2000/1000, at most 12 requirements of 1000, intent JSON <=24000 UTF-8
// bytes. SQL uses code points and <=24576 jsonb bytes; the 576-byte reserve
// covers JSON formatting for these bounded keys/items. The worker parses the
// same PlayIntent again. Preserve every chunk through its trim normalization.
function checkIntent(input) {
  for (const [name, cap] of [['intent', 4000], ['audience', 2000], ['goal', 1000], ['trigger', 1000]]) {
    if (input[name] === undefined && name !== 'intent') continue;
    if (!text(input[name], cap) || [...input[name]].length > cap || input[name].trim() !== input[name])
      fail(`The complete per-Play ${name} exceeds its ${cap}-character limit or would change during trimming. Keep the original rules; this request cannot be transported.`);
  }
  if (!Array.isArray(input.requirements) || input.requirements.length > 12
    || input.requirements.some(value => !text(value, 1000) || [...value].length > 1000 || value.trim() !== value))
    fail('The complete per-Play requirements must fit 12 unchanged chunks of at most 1,000 characters. Keep every control and rule.');
  if (Buffer.byteLength(JSON.stringify(input)) > 24_000)
    fail('The complete per-Play intent exceeds 24,000 UTF-8 bytes. Keep every control and rule; this request cannot be transported.');
}

export function compilePlayRequest(review, opportunityId, expectedToken) {
  if (!perPlay(review)) fail('Per-Play requests require authoring_mode per_play.');
  const rows = review.opportunities;
  if (!Array.isArray(rows) || !rows.length || !unique(rows.map(row => row?.id)) || rows.some(row => !text(row?.id, 128)))
    fail('Record distinct opportunity IDs before compiling a per-Play request.');
  const row = rows.find(row => row.id === opportunityId);
  if (!row || row.execution_target.type !== 'marketing')
    fail('Choose a covered marketing opportunity. Fixed service, held, external and control decisions cannot propose marketing Plays.');
  const field = name => `${STRATEGY_FIELDS.find(([key]) => key === name)[1]}: ${strategyValue(row[name])}`;
  const fields = names => names.map(field).join('\n');
  const controlText = rows.filter(row => row.decision === 'covered' && row.kind === 'control')
    .map(row => strategyRow(row)).join('\n\n');
  const groups = [], chunks = [];
  const lines = controlText ? controlText.split('\n') : [];
  for (const [index, line] of lines.entries()) {
    if (line.length > 1000) fail('A complete control line exceeds 1,000 characters. Keep the original rule; this request cannot be transported.');
    // A newline may separate requirements only when neither resulting edge
    // would be trimmed. Keep blank/whitespace lines with both their neighbors,
    // then pack those indivisible groups. This can move a cut earlier than the
    // 1000-character boundary without changing requirements.join('\n').
    const previous = lines[index - 1] ?? '';
    const safeBoundary = previous.length > 0 && line.length > 0
      && previous.trimEnd() === previous && line.trimStart() === line;
    if (!groups.length || safeBoundary) groups.push(line);
    else groups[groups.length - 1] += '\n' + line;
  }
  for (const group of groups) {
    if (!chunks.length || chunks.at(-1).length + 1 + group.length > 1000) chunks.push(group);
    else chunks[chunks.length - 1] += '\n' + group;
  }
  const input = {
    intent: `${row.id} (${row.decision})\n${fields(['journey_ids', 'kind', 'outcome', 'current_sender', 'proposed_sender',
      'duplicate_prevention', 'reason', 'implementation', 'dependency', 'next_action'])}`,
    audience: fields(['actor', 'subject', 'eligibility']),
    trigger: fields(['trigger', 'timing', 'reentry']),
    requirements: [...['stops', 'context', 'facts', 'planned_events'].map(field), ...chunks],
  };
  checkIntent(input);
  if (expectedToken !== undefined && !text(expectedToken, 256)) fail('Provide the current catalog token for this exact request.');
  return { action: 'play.propose', input: { ...(expectedToken === undefined ? {} : { expectedToken }), ...input } };
}

function markdownText(value) {
  return recorded(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\uFEFF/g, '&#65279;').replace(/[\\`*_[\]{}!|~]/g, '\\$&')
    .replace(/^([ \t]*)(#+|[-+=]+|\d+[.)])(?=\s|$)/gm, (_match, indent, marker) =>
      indent + marker.replace(/[#+=.)-]/g, '\\$&'))
    .replace(/^[ \t]+/gm, indent => indent.replace(/ /g, '&#32;').replace(/\t/g, '&#9;'))
    .replace(/\n/g, '  \n');
}
const label = name => name.replace(/_/g, ' ').replace(/^./, first => first.toUpperCase());

// A complete readable projection, even when discovery is unfinished or a Play
// is held. Include additive fields too; rendering is not a certification gate.
export function renderMarkdown(review) {
  function section(name, value, depth) {
    const heading = `${'#'.repeat(Math.min(depth, 6))} ${markdownText(name)}`;
    if (Array.isArray(value) && value.some(item => object(item) || Array.isArray(item))) {
      return [heading, ...value.map((item, index) => section(
        object(item) && text(item.id) ? item.id : `Entry ${index + 1}`, item, depth + 1))].join('\n\n');
    }
    if (object(value)) return [heading, ...(Object.keys(value).length ? Object.entries(value)
      .map(([key, item]) => section(label(key), item, depth + 1)) : ['Not recorded'])].join('\n\n');
    const content = Array.isArray(value) && value.length
      ? value.map(item => `- ${markdownText(item)}`).join('\n') : markdownText(value);
    if (depth === 2) return `${heading}\n\n${content}`;
    return `${markdownText(name)}:${Array.isArray(value) && value.length ? '\n\n' : ' '}${content}`;
  }
  const values = object(review) ? review : {};
  const overview = Array.isArray(values.opportunities) && values.opportunities.length
    ? values.opportunities.map((row, index) => [
      `### ${markdownText(text(row?.id) ? row.id : `Entry ${index + 1}`)}`,
      [['decision', 'Recorded decision'], ['outcome', 'Outcome'], ['proposed_sender', 'Proposed sender'],
        ...['dependency', 'next_action'].filter(key => row?.[key] != null && row[key] !== '')
          .map(key => [key, label(key)])]
        .map(([key, name]) => `${name}: ${markdownText(row?.[key])}`).join('  \n'),
    ].join('\n\n')).join('\n\n') : 'Not recorded';
  // Decisions and their recorded reviews come before the supporting inventory.
  // Keep all fields, including unknown additions, in a stable top-level order.
  const order = ['product', 'captured_at', 'owner_scope', 'opportunities', 'coverage_review', 'reconciliation',
    'approval_observations', 'submission_reviews', 'discovery_review', 'journeys', 'source_inventory',
    'sources', 'workspace', 'version'];
  const keys = [...order.filter(key => Object.hasOwn(values, key)),
    ...Object.keys(values).filter(key => !order.includes(key)).sort()];
  const output = ['# Journey review',
    'This is the recorded review, including unfinished work. It does not certify source coverage or approval.',
    `## Recorded decisions\n\n${overview}`,
    ...keys.map(key => section(label(key), values[key], 2)),
  ].join('\n\n').trimEnd() + '\n';
  if (Buffer.byteLength(output) > LIMIT)
    fail(review?.authoring_mode === 'per_play' ? 'The complete generated Markdown exceeds 512 KiB. Keep every recorded field; this review cannot be transported.'
      : 'The generated Markdown exceeds 512 KiB. Compact the recorded review without dropping its scope, then generate it again.');
  return output;
}

// No remote assets, script, HTML interpolation, or browser-dependent Markdown
// parser. The complete JSON remains the source; this projection is offline.
export function renderHtml(review) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function content(value, depth = 2) {
    if (Array.isArray(value)) return value.length
      ? `<ol>${value.map(item => `<li>${content(item, depth + 1)}</li>`).join('')}</ol>` : '<p>Not recorded</p>';
    if (object(value)) return Object.entries(value).map(([key, item]) => `<section><h${Math.min(depth, 6)}>${escape(label(key))}</h${Math.min(depth, 6)}>${content(item, depth + 1)}</section>`).join('');
    return `<p>${escape(recorded(value))}</p>`;
  }
  // Cards already show these nonempty scalar/list values. Keep every other
  // field here, including null/false/zero and unexpected additive structures.
  const remaining = (row, shown) => Object.fromEntries(Object.entries(row).filter(([key, value]) =>
    !shown.includes(key) || !(text(value) || (Array.isArray(value) && value.length && value.every(item => typeof item === 'string')))));
  const details = (row, shown) => {
    const rest = remaining(row, shown);
    return Object.keys(rest).length ? `<details><summary>Supporting details</summary>${content(rest, 4)}</details>` : '';
  };
  const values = object(review) ? review : {};
  const journeys = Array.isArray(values.journeys) ? values.journeys.map(row =>
    `<article><h3>${escape(row.id ?? 'Journey')}</h3><p>${escape(row.situation ?? 'Not recorded')}</p>${row.notes ? `<p>${escape(row.notes)}</p>` : ''}<p class="muted">Related decisions: ${escape((row.opportunity_ids ?? []).join(', ') || 'Not recorded')}</p>${details(row, ['id', 'situation', 'notes', 'opportunity_ids'])}</article>`).join('') : '<p>No journeys recorded yet.</p>';
  const mechanics = ['trigger', 'actor', 'subject', 'eligibility', 'timing', 'stops', 'reentry', 'duplicate_prevention', 'current_sender', 'proposed_sender'];
  const decisions = Array.isArray(values.opportunities) ? values.opportunities.map(row =>
    `<article><h3>${escape(row.outcome ?? row.id ?? 'Opportunity')}</h3><p class="muted">${escape(row.id ?? '')} · ${escape(row.decision ?? 'Unassessed')}</p><p>${escape(row.reason ?? '')}</p><dl>${mechanics.filter(key => row[key] != null).map(key => `<dt>${escape(label(key))}</dt><dd>${Array.isArray(row[key]) ? row[key].map(item => escape(item)).join('<br>') : escape(row[key])}</dd>`).join('')}</dl>${row.dependency ? `<p><strong>Dependency:</strong> ${escape(row.dependency)}</p>` : ''}${row.next_action ? `<p><strong>Next:</strong> ${escape(row.next_action)}</p>` : ''}${details(row, ['outcome', 'id', 'decision', 'reason', ...mechanics, 'dependency', 'next_action'])}</article>`).join('') : '<p>No decisions recorded yet.</p>';
  const plan = values.intended_inputs?.plan_input ?? values.independent_review?.plan_input;
  const events = Array.isArray(values.event_taxonomy) && values.event_taxonomy.length ? values.event_taxonomy : plan?.events;
  const taxonomy = Array.isArray(events) ? events.map(event => `<article><h3>${escape(event.name)}</h3><p>${escape(event.description ?? '')}</p>${event.emit_when ? `<p><strong>Emit when:</strong> ${escape(event.emit_when)}</p>` : ''}${event.event_id ? `<p><strong>Occurrence identity:</strong> ${escape(event.event_id)}</p>` : ''}${event.evidence ? `<p><strong>Source:</strong> ${escape(event.evidence.join(', '))}</p>` : ''}${event.consumers ? `<p><strong>Consumers:</strong> ${escape(event.consumers.join(', '))}</p>` : ''}<dl>${Object.entries(event.properties ?? {}).map(([name, schema]) => `<dt>${escape(name)}</dt><dd>${escape(schema?.type ?? 'Unspecified type')} · ${schema?.required ? 'required' : 'optional'}${schema?.use ? ` · ${escape(schema.use)}` : ''}</dd>`).join('') || '<dt>Properties</dt><dd>None</dd>'}</dl><details><summary>Complete event schema</summary>${content(event, 4)}</details></article>`).join('') + (plan?.not_emitted?.length ? `<h3>Core facts not emitted</h3>${content(plan.not_emitted, 4)}` : '') : '<p>The complete event input has not been recorded yet.</p>';
  // Collections rendered in complete cards above must not be repeated in the
  // evidence projection: a valid JSON plan plus source cases still has to fit
  // the same 512 KiB private-file/HTML limit. No field or packet is discarded.
  const evidence = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
    !(['journeys', 'opportunities'].includes(key) && Array.isArray(value) && value.length)
    && !(key === 'event_taxonomy' && Array.isArray(value) && value.length)));
  const output = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(values.product ?? 'Customer lifecycle')} | Barua setup plan</title>
<style>body{margin:0;background:#f6f4ef;color:#252720;font:16px/1.6 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:40px 24px}h1{font-size:2.2rem;line-height:1.2}h2{margin-top:2rem;border-bottom:1px solid #d7d8ce;padding-bottom:8px}h3,h4,h5,h6{font-size:1rem;margin:16px 0 4px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0 12px}li{padding:8px 0}section{min-width:0}header,aside,article{padding:20px;background:white;border:1px solid #d7d8ce;border-radius:12px}aside{margin:20px 0}article{margin:12px 0}ol{padding-left:24px}.muted{color:#62675a}dl{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,3fr);gap:6px 16px}dt{font-weight:600;overflow-wrap:anywhere}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600;padding:16px 0}@media(max-width:600px){main{padding:20px 16px}h1{font-size:1.7rem}dl{display:block}dd{margin:0 0 12px}}</style></head>
<body><main><header><p class="muted">Barua setup plan</p><h1>${escape(values.product ?? 'Customer lifecycle')}</h1><p>The full customer lifecycle and event taxonomy. This private snapshot is not an approval or a delivery receipt.</p></header>
<aside><strong>Now</strong><p>Review the recorded decisions and any unresolved dependencies below.</p><strong>Done</strong><p>${escape(values.coverage_review?.status === 'complete' ? 'Source discovery and lifecycle coverage recorded.' : 'The artifact is saved; discovery or coverage is still in progress.')}</p><strong>Next</strong><p>Follow the recorded next actions and recheck current workspace state before continuing.</p></aside>
<h2>Customer journeys</h2>${journeys}<h2>Lifecycle decisions</h2>${decisions}<h2>Event taxonomy</h2>${taxonomy}
<details><summary>Source evidence and saved inputs</summary>${content(evidence)}</details></main></body></html>\n`;
  if (Buffer.byteLength(output) > LIMIT) fail('The complete generated HTML exceeds 512 KiB. Keep every recorded field and shorten repeated explanation.');
  return output;
}

function readPrivate(file, secrets = [], kind = 'JSON') {
  let fd, bytes;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if (!fstatSync(fd).isFile()) fail(`Use a regular journey review ${kind} file.`);
    const buffer = Buffer.alloc(LIMIT + 1);
    let size = 0, count;
    while (size < buffer.length && (count = readSync(fd, buffer, size, buffer.length - size, null))) size += count;
    if (size > LIMIT) fail(`The review ${kind} file must fit within 512 KiB.`);
    bytes = buffer.subarray(0, size);
  } catch (error) {
    if (error.code === 'journey_review') throw error;
    fail(`The review ${kind} file could not be read. Use a regular file without a linked file path.`);
  } finally { if (fd !== undefined) closeSync(fd); }
  const raw = bytes.toString('utf8');
  if (secrets.some(secret => secret && raw.includes(secret))
    || /\b(?:ik|mk|pk)_[A-Za-z0-9_-]{8,}\b|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/i.test(raw))
    fail('Remove credentials from the review file before continuing.');
  return bytes;
}

function readJson(file, secrets = []) {
  const bytes = readPrivate(file, secrets), raw = bytes.toString('utf8');
  try {
    const value = JSON.parse(raw);
    if (!object(value)) fail('The review file must contain a JSON object.');
    return { value, sha256: sha256(bytes) };
  } catch (error) {
    if (error.code === 'journey_review') throw error;
    fail('The review file is not valid JSON.');
  }
}

export function readJourneyReview(file, secrets = []) {
  const { value, sha256 } = readJson(file, secrets);
  return { review: value, artifactSha256: sha256 };
}

const REVIEW_CONTEXT_FIELDS = ['owner_request', 'source_files', 'strategy_file', 'packet_file', 'model', 'effort'];
function renderTask(context, discovery) {
  const singleLine = value => text(value) && !/[\x00-\x1f\x7f]/.test(value);
  const path = value => singleLine(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (!object(context) || Object.keys(context).some(key => !REVIEW_CONTEXT_FIELDS.includes(key))
    || !text(context.owner_request) || context.owner_request.includes('\0')
    || !Array.isArray(context.source_files) || !context.source_files.length
    || !context.source_files.every(path) || !unique(context.source_files)
    || !path(context.strategy_file) || !/\.json$/i.test(context.strategy_file)
    || !path(context.packet_file) || !/\.json$/i.test(context.packet_file)
    || (context.model !== undefined && !singleLine(context.model)) || (context.effort !== undefined && !singleLine(context.effort)))
    fail('Provide owner_request, source_files paths, strategy_file JSON path and packet_file JSON path.');
  const artifacts = [resolve(context.strategy_file), resolve(context.packet_file)];
  if (artifacts[0] === artifacts[1] || context.source_files.some(file => artifacts.includes(resolve(file))))
    fail('Keep the source paths separate from the strategy and packet paths.');
  // Read only the shipped procedure. Source and author files remain unopened
  // until the agent has recorded its source-first expectations.
  const template = readPrivate(fileURLToPath(new URL(discovery
    ? '../templates/journey-discovery-task.md' : '../templates/journey-review-task.md', import.meta.url)), [], 'task template');
  const contract = fileURLToPath(new URL('../references/events.md', import.meta.url));
  const fields = discovery ? ['owner_request', 'source_files'] : REVIEW_CONTEXT_FIELDS.filter(key => !['model', 'effort'].includes(key));
  return { prompt: `${template.toString('utf8').trimEnd()}${discovery ? '' : `\n\nAuthoritative event contract (path): ${JSON.stringify(contract)}`}\n\nTask context (JSON):\n${JSON.stringify(Object.fromEntries(fields.map(key => [key, context[key]])), null, 2)}\n` };
}

export const renderReviewerTask = context => renderTask(context, false);
export const renderDiscoveryTask = context => renderTask(context, true);

export function checkMarkdown(file, review, secrets = []) {
  if (!/\.json$/i.test(file)) fail('Use a .json journey file with its generated .md sibling.');
  const bytes = readPrivate(file.replace(/\.json$/i, '.md'), secrets, 'Markdown');
  if (!bytes.equals(Buffer.from(renderMarkdown(review))))
    fail('The Markdown does not match this review. Generate its current readable view before continuing.');
}

export function checkHtml(file, review, secrets = []) {
  if (!/\.json$/i.test(file)) fail('Use a .json journey file with its generated .html sibling.');
  const bytes = readPrivate(file.replace(/\.json$/i, '.html'), secrets, 'HTML');
  if (!bytes.equals(Buffer.from(renderHtml(review))))
    fail('The HTML does not match this plan. Generate its current readable view before continuing.');
}

// Bind the executable action/input only. Request IDs, timestamps and other
// transport metadata outside input are irrelevant; self-evidence is excluded.
export function submissionHash(command) {
  if (!object(command) || !text(command.action) || !object(command.input)) fail('Use an action with its exact input object.');
  const { reconciliation: _evidence, ...input } = command.input;
  return sha256(JSON.stringify(stable({ action: command.action, input })));
}

// Only observation/receipt fields are omitted. New strategy metadata, source
// revisions and every held opportunity field remain part of this binding.
const OPERATIONAL_FIELDS = new Set(['captured_at', 'discovery_review', 'coverage_review', 'workspace',
  'reconciliation', 'approval_observations', 'submission_reviews', 'independent_review', 'intended_inputs']);
const digest = value => sha256(JSON.stringify(stable(value)));
export function strategyDigest(review) {
  if (!object(review)) fail('Use a journey review object to calculate its strategy digest.');
  const strategy = Object.fromEntries(Object.entries(review).filter(([name]) => !OPERATIONAL_FIELDS.has(name)));
  // Source-case evidence has its own source/decision bindings, so including it
  // here does not create a digest cycle. Other observation metadata stays out.
  if (review.coverage_review?.source_cases !== undefined)
    strategy.coverage_review = { source_cases: review.coverage_review.source_cases };
  return digest(strategy);
}

function sourceCaseBindings(review, opportunity, sourceIds) {
  const facts = sourceIds.map(id => review.source_inventory.find(row => row.id === id));
  if (facts.some(row => !row)) fail('Source cases must reference recorded source inventory IDs.');
  return { source_sha256: digest({ sources: review.sources, facts }), decision_sha256: digest({ opportunity,
    owner_scope: review.owner_scope,
    controls: review.opportunities.filter(row => row.kind === 'control'),
    event_taxonomy: review.event_taxonomy?.filter(row => opportunity.planned_events?.includes(row.name)) }) };
}

export function renderSourceCases(review) {
  checkDiscovery(review, { allowIncompleteReviews: true });
  return review.opportunities.map((row, index) => {
    const source_ids = review.source_inventory.filter(fact => fact.opportunity_ids.includes(row.id)).map(fact => fact.id);
    return { id: `case-${index + 1}`, opportunity_id: row.id, source_ids,
      ...sourceCaseBindings(review, row, source_ids), case_kind: 'boundary',
      source_state: null, intended_action: null, source_preconditions: [], method: null,
      observed_result: { kind: null, detail: null }, expected_outcome: null, planned_outcome: null,
      evidence: [], checked_at: null };
  });
}

export function checkSourceCases(review) {
  const cases = review.coverage_review?.source_cases;
  if (!Array.isArray(cases) || !cases.length || cases.some(row => !text(row?.id, 128)) || !unique(cases.map(row => row.id)))
    fail('Record distinct source cases in coverage_review.source_cases before submitting the current inputs.');
  const opportunities = new Map(review.opportunities.map(row => [row.id, row]));
  for (const row of cases) {
    const opportunity = opportunities.get(row.opportunity_id);
    if (!opportunity || !strings(row.source_ids, 1) || !unique(row.source_ids)
      || !['typical', 'boundary'].includes(row.case_kind) || !text(row.source_state) || !text(row.intended_action)
      || !strings(row.source_preconditions) || !['isolated_test', 'source_trace'].includes(row.method)
      || !['returned', 'rejected', 'state', 'unavailable'].includes(row.observed_result?.kind)
      || !text(row.observed_result?.detail) || !strings(row.evidence, 1) || !date(row.checked_at)
      || !['send', 'hold', 'stop'].includes(row.expected_outcome) || !['send', 'hold', 'stop'].includes(row.planned_outcome))
      fail('Each source case needs its state, exact action, preconditions, observed source result, planned comparison and evidence.');
    const bindings = sourceCaseBindings(review, opportunity, row.source_ids);
    if (row.source_sha256 !== bindings.source_sha256 || row.decision_sha256 !== bindings.decision_sha256)
      fail('Source case evidence is stale for the current source facts or exact decision. Recheck affected cases.');
    if (row.expected_outcome !== row.planned_outcome)
      fail('A source case contradicts the intended decision. Correct its rules before submission, including held work.');
    if (row.observed_result.kind === 'unavailable' && (row.method !== 'source_trace'
      || opportunity.decision !== 'blocked' || !text(opportunity.dependency) || !text(opportunity.next_action)
      || row.planned_outcome !== 'hold'))
      fail('Unavailable source execution needs an honest source trace and a blocked decision with its dependency and next action.');
  }
  for (const opportunity of review.opportunities) {
    if (!cases.some(row => row.opportunity_id === opportunity.id && row.case_kind === 'boundary'))
      fail('Exercise or trace a boundary case for every decision, including held and excluded work.');
  }
  for (const fact of review.source_inventory.filter(row => row.material)) {
    for (const id of fact.opportunity_ids) {
      if (!cases.some(row => row.opportunity_id === id && row.source_ids.includes(fact.id)))
        fail('Apply each material source fact to every linked decision in the source-case table.');
    }
  }
}

export function checklistDigest(checklist) {
  if (!Array.isArray(checklist) || !checklist.length || checklist.some(row => !text(row?.id, 128)
    || !text(row.expected) || !strings(row.evidence, 1)
    || ((Object.hasOwn(row, 'current') || Object.hasOwn(row, 'prerequisites'))
      && (!text(row.current) || !strings(row.prerequisites)))) || !unique(checklist.map(row => row.id)))
    fail('Record a distinct source-derived checklist with expectations and evidence.');
  // Preserve the old three-field digest while binding all new discovery facts.
  // Only the final comparison's links and judgment may be added afterward.
  return digest(checklist.map(row => Object.fromEntries(Object.entries(row)
    .filter(([key]) => !['opportunity_ids', 'verdict'].includes(key)))));
}

export function reviewPacket(review, { plan_input, brand_patch, checklist } = {}) {
  if (!object(plan_input) || !Array.isArray(plan_input.events) || !object(brand_patch))
    fail('Provide the complete plan_input and brand_patch objects for the saved plan.');
  normalizedPlan(plan_input);
  const playbook = renderPlaybook(review);
  const packet = { strategy_sha256: strategyDigest(review), plan_input, plan_sha256: digest(plan_input),
    brand_patch, brand_patch_sha256: digest(brand_patch), playbook, playbook_sha256: sha256(playbook),
    ...(perPlay(review) ? { play_requests: review.opportunities.filter(row => row.execution_target.type === 'marketing')
      .map(row => ({ opportunity_id: row.id, ...compilePlayRequest(review, row.id) })) } : {}),
    ...(checklist === undefined ? {} : { checklist_sha256: checklistDigest(checklist) }) };
  if (Buffer.byteLength(JSON.stringify(packet) + '\n') > LIMIT) fail('The complete review packet exceeds 512 KiB. No rules or control copies may be omitted.');
  return packet;
}

// Bind source, strategy and exact executable inputs. Review identity is optional
// history, never authority. Legacy receipts remain readable as input packets.
export function checkIntendedInputs(review, command) {
  checkDiscovery(review);
  const receipt = review?.intended_inputs ?? review?.independent_review;
  if (!object(receipt)) fail('Save the complete intended_inputs packet before this action.');
  if (review.intended_inputs) {
    checkTaxonomy(review, receipt.plan_input);
    checkSourceCases(review);
  }
  const packet = reviewPacket(review, { plan_input: receipt.plan_input, brand_patch: receipt.brand_patch });
  for (const field of ['strategy_sha256', 'plan_sha256', 'brand_patch_sha256', 'playbook_sha256']) {
    if (!HASH.test(receipt[field] ?? '') || receipt[field] !== packet[field])
      fail('The saved inputs no longer match the recorded strategy. Regenerate the packet for the current plan.');
  }
  if (command?.action === 'plan.propose' && digest(command.input) !== receipt.plan_sha256)
    fail('The plan input differs from the saved intended inputs. Regenerate the packet for the current plan.');
  if (['brand.confirm', 'brand.update'].includes(command?.action)) {
    const { expectedVersion: _version, proposalHash: _proposal, seen: _seen, playbook, ...semantic } = command.input ?? {};
    if (typeof playbook !== 'string' || sha256(playbook) !== receipt.playbook_sha256)
      fail('Use the exact generated playbook from the current artifact before submitting.');
    if (digest(semantic) !== digest({ patch: receipt.brand_patch }))
      fail('The brand patch differs from the saved intended inputs. Regenerate the packet first.');
  }
  return receipt;
}

// Compatibility for installed callers. This no longer checks reviewer identity.
export const checkIndependentReview = checkIntendedInputs;

// New packets expose core as well as custom events, their actual emit sites and
// consumers. Legacy receipts keep their historical schema; their full strategy
// and exact plan bindings are still checked above.
export function checkTaxonomy(review, plan) {
  const rows = review.event_taxonomy, opportunities = new Set(review.opportunities.map(row => row.id));
  if (!Array.isArray(rows) || !rows.length || !unique(rows.map(row => row?.name))
    || rows.some(row => !text(row?.name) || !text(row.description) || !text(row.emit_when) || !text(row.event_id)
      || !strings(row.evidence, 1) || !object(row.properties) || !strings(row.consumers, 1)
      || row.consumers.some(id => !opportunities.has(id))))
    fail('Record the complete event_taxonomy with source, emission, occurrence identity, property schema and consumers.');
  const byName = new Map(rows.map(row => [row.name, row]));
  for (const row of review.opportunities) for (const name of row.planned_events ?? [])
    if (!byName.get(name)?.consumers.includes(row.id)) fail('Every planned event must reach its consuming opportunity in the event taxonomy.');
  for (const event of plan?.events ?? [])
    if (!byName.has(event.name) || !isDeepStrictEqual(byName.get(event.name).properties, event.properties ?? {}))
      fail('The event taxonomy must contain every custom event and its exact planned properties.');
}

// The public helper cannot import the server. This comparison mirrors only
// plan.ts's lossless wire/read projection, not the API's admission validator.
// Unknown definition fields are refused rather than silently dropped.
function normalizedPlan(plan, readback = false) {
  const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
  if (!object(plan) || !Array.isArray(plan.events)
    || (!readback && !only(plan, ['events', 'not_emitted'])))
    fail('Read the complete reviewed event definitions before approving a plan.');
  const events = plan.events.map(event => {
    if (!only(event, ['name', 'description', 'properties']) || !text(event.name) || !text(event.description)
      || (event.properties !== undefined && !object(event.properties)))
      fail('The plan contains an unreadable event definition.');
    const properties = Object.fromEntries(Object.entries(event.properties ?? {}).map(([name, property]) => {
      const lengthKey = readback ? 'maxLength' : 'max_length';
      if (!only(property, ['type', 'required', 'use', lengthKey])
        || !['string', 'number', 'integer', 'boolean', 'timestamp', 'url', 'currency'].includes(property.type)
        || typeof property.required !== 'boolean' || !['copy', 'targeting'].includes(property.use))
        fail('The plan contains an unreadable property definition.');
      const limit = property[lengthKey];
      if (limit !== undefined && (property.type !== 'string' || !Number.isInteger(limit) || limit < 1 || limit > 500))
        fail('The plan contains an unreadable string limit.');
      return [name, { type: property.type, required: property.required, use: property.use,
        ...(property.type === 'string' ? { maxLength: limit ?? 200 } : {}) }];
    }));
    return { name: event.name, description: event.description.trim(), properties };
  });
  const declarations = readback ? plan.notEmitted : (plan.not_emitted === undefined ? [] : plan.not_emitted);
  if (!Array.isArray(declarations) || declarations.some(row => !only(row, ['name', 'reason'])
    || !text(row.name) || !text(row.reason)) || !unique(events.map(row => row.name))
    || !unique(declarations.map(row => row.name)))
    fail('Read complete, distinct plan events and not-emitted declarations.');
  const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  return stable({ events: events.sort(byName), notEmitted: declarations.map(({ name, reason }) =>
    ({ name, reason: reason.trim() })).sort(byName) });
}

export function checkPlanApproval(review, view, input) {
  const receipt = checkIndependentReview(review);
  if (!object(input) || Object.keys(input).some(name => name !== 'version')
    || !Number.isSafeInteger(input.version) || input.version < 1 || input.version !== review.workspace?.plan_version)
    fail('Use the recorded workspace plan version for this reviewed approval.');
  if (!object(view) || !Object.hasOwn(view, 'proposed') || !Object.hasOwn(view, 'approved'))
    fail('Read the current proposed and approved plan before approving.');
  // Never replay an old approved target through a newer outstanding proposal.
  const target = view.proposed === null ? view.approved : view.proposed;
  if (!object(target) || target.version !== input.version || target.coreVersion !== 'core@1'
    || !Array.isArray(target.shadowed) || target.shadowed.length)
    fail('The reviewed plan is missing, superseded or shadowed. Read and review the current plan.');
  if (!isDeepStrictEqual(normalizedPlan(receipt.plan_input), normalizedPlan(target, true)))
    fail('The current plan definitions or declarations differ from the saved intended inputs.');
  return target;
}

export function checkDiscovery(review, { allowIncompleteReviews = false } = {}) {
  perPlay(review);
  if (review?.version !== 1 || !text(review.product) || !date(review.captured_at)
    || !Array.isArray(review.sources) || !review.sources.length
    || review.sources.some(source => !text(source?.repo) || !text(source?.revision)))
    fail('Record the product and inspected source revisions in journey-review.json.');
  if (!allowIncompleteReviews && (!complete(review.discovery_review) || !complete(review.coverage_review)))
    fail('Finish the separate source discovery and coverage reviews before this action.');
  const journeys = review.journeys, opportunities = review.opportunities, inventory = review.source_inventory;
  if (![journeys, opportunities, inventory].every(rows => Array.isArray(rows) && rows.length)
    || [journeys, opportunities, inventory].some(rows => rows.some(row => !text(row?.id, 128)) || !unique(rows.map(row => row.id))))
    fail('Record distinct source inventory, journey and opportunity IDs before this action.');
  const byJourney = new Map(journeys.map(row => [row.id, row])), byOpportunity = new Map(opportunities.map(row => [row.id, row]));
  for (const row of journeys) {
    if (typeof row.notes !== 'string') fail('Record journey notes as text, including an empty string when there are no notes.');
    if (row.assessment !== 'assessed' || !text(row.situation) || !strings(row.evidence, 1)
      || !strings(row.opportunity_ids, 1) || !unique(row.opportunity_ids)
      || row.opportunity_ids.some(id => !byOpportunity.get(id)?.journey_ids?.includes(row.id)))
      fail('Assess each discovered journey and link it to its opportunity decisions in both directions.');
  }
  for (const row of opportunities) {
    // These fields are nullable, not optional or arbitrary JSON. Apply the
    // same recorded-shape contract to held/excluded rows before any request.
    if (!['lifecycle', 'service', 'micro', 'control'].includes(row.kind) || !text(row.outcome))
      fail('Record a valid kind and outcome for every opportunity.');
    for (const name of ['trigger', 'actor', 'subject', 'eligibility', 'timing', 'reentry',
      'current_sender', 'proposed_sender', 'duplicate_prevention', 'dependency', 'next_action']) {
      if (row[name] !== null && !text(row[name])) fail(`Opportunity ${row.id} ${name} must be nonempty text or null.`);
    }
    for (const name of ['stops', 'context', 'facts', 'planned_events']) {
      if (!strings(row[name])) fail(`Opportunity ${row.id} ${name} must be a list of nonempty strings.`);
    }
    if (!['covered', 'excluded', 'blocked'].includes(row.decision) || !text(row.reason) || !strings(row.evidence, 1)
      || !strings(row.journey_ids, 1) || !unique(row.journey_ids)
      || row.journey_ids.some(id => !byJourney.get(id)?.opportunity_ids?.includes(row.id)))
      fail('Each opportunity needs a source-backed decision and matching journey links.');
    if (!text(row.implementation)) fail('Record implementation status text for every opportunity, including held and excluded work.');
    if (row.decision === 'covered' && (['trigger', 'actor', 'subject', 'eligibility', 'timing', 'reentry',
      'current_sender', 'proposed_sender', 'duplicate_prevention'].some(name => !text(row[name])) || !strings(row.stops, 1)))
      fail('Complete the concrete rules and sending ownership for each covered opportunity.');
    if (row.decision === 'blocked' && (!text(row.dependency) || !text(row.next_action)))
      fail('Give each blocked opportunity its dependency and next action.');
  }
  for (const row of inventory) {
    if (!['entity', 'variant', 'transition', 'time_condition', 'sender'].includes(row.kind)
      || !['observed', 'proposed', 'unknown'].includes(row.status) || !text(row.statement)
      || typeof row.material !== 'boolean' || !strings(row.evidence, row.status === 'observed' ? 1 : 0)
      || !strings(row.opportunity_ids, row.material ? 1 : 0) || !unique(row.opportunity_ids)
      || row.opportunity_ids.some(id => !byOpportunity.has(id)))
      fail('Map every material source inventory row to assessed opportunities, with its evidence and fact status.');
  }
  return byOpportunity;
}

export function checkSubmission(review, command, opportunityId) {
  checkDiscovery(review);
  if (command?.action === 'play.propose') {
    if (!text(opportunityId, 128) || !text(command.input?.expectedToken, 256))
      fail('Provide --opportunity-id and the current catalog token for a reviewed Play proposal.');
    const { expectedToken, ...semantic } = command.input;
    if (!isDeepStrictEqual(semantic, compilePlayRequest(review, opportunityId).input))
      fail('The Play proposal differs from the complete reviewed request. Use the exact compiled input, including every control.');
  } else if (opportunityId !== undefined) fail('Use --opportunity-id only for play.propose.');
  if (['brand.confirm', 'brand.update'].includes(command?.action)) {
    const expected = Buffer.from(renderPlaybook(review));
    if (typeof command.input?.playbook !== 'string' || !Buffer.from(command.input.playbook).equals(expected))
      fail('Use the exact generated playbook for this artifact. Review the recorded rules, regenerate the playbook and then review the new action input.');
  }
  checkIndependentReview(review, command);
  const digest = submissionHash(command);
  const matches = Array.isArray(review.submission_reviews)
    ? review.submission_reviews.filter(row => row?.action === command.action && row.input_sha256 === digest) : [];
  if (matches.length !== 1 || matches[0].status !== 'complete' || !date(matches[0].checked_at)
    || !Array.isArray(matches[0].claims) || !matches[0].claims.length)
    fail('Review the exact action input against the source, then record its digest and claim review.');
  for (const claim of matches[0].claims) {
    if (!text(claim?.text) || !['observed', 'proposed', 'unknown'].includes(claim.status)
      || !['included', 'omitted'].includes(claim.disposition) || !strings(claim.evidence, claim.status === 'observed' ? 1 : 0)
      || (claim.status === 'unknown' && claim.disposition !== 'omitted'))
      fail('Ground included factual claims in source evidence. Label proposals and omit unknown claims from the submitted input.');
  }
}

function approvalRecord({ review, artifactSha256 }, input) {
  const opportunities = checkDiscovery(review);
  checkIndependentReview(review);
  if (!HASH.test(artifactSha256) || !text(input?.playId) || !text(input.revisionId) || !text(input.expectedToken)
    || !strings(input.languages, 1) || input.languages.length > 20 || !unique(input.languages)
    || input.languages.some(language => !LANGUAGE.test(language)))
    fail('Approve an exact Play revision and current token with distinct requested languages.');
  const observations = Array.isArray(review.approval_observations) ? review.approval_observations.filter(row =>
    row?.play_id === input.playId && row.revision_id === input.revisionId && row.review_token === input.expectedToken) : [];
  if (observations.length !== 1 || observations[0].status !== 'matches' || !date(observations[0].checked_at)
    || !HASH.test(observations[0].content_hash ?? '') || !HASH.test(observations[0].policy_hash ?? ''))
    fail('Record a matching approval observation for this request. Older artifacts remain readable but cannot authorize a new approval.');
  const observation = observations[0], decisions = observation.opportunities;
  if (!Array.isArray(decisions) || !decisions.length || !unique(decisions.map(row => row?.id))
    || decisions.some(row => !text(row?.id, 128) || opportunities.get(row.id)?.decision !== 'covered' || !strings(row.checks, 1, 2000)))
    fail('Match this approval to distinct covered opportunities with specific review findings.');
  const previews = observation.previews;
  if (!Array.isArray(previews) || !previews.length || !unique(previews.map(row => row?.stepId))
    || previews.some(row => !text(row?.stepId, 128) || !strings(row.languages, 1) || !unique(row.languages)
      || row.languages.some(language => !LANGUAGE.test(language)) || input.languages.some(language => !row.languages.includes(language))))
    fail('Record every selected email step preview in each requested language before approving.');
  return { opportunities, record: { schemaVersion: 'barua-play-reconciliation@1', artifactSha256,
    contentHash: observation.content_hash, policyHash: observation.policy_hash,
    opportunities: decisions.map(({ id, checks }) => ({ id, checks })),
    previews: previews.map(({ stepId }) => ({ stepId, languages: [...input.languages] })) } };
}

function readableTarget(detail, input) {
  const target = detail?.approvalTarget, selected = detail?.selected, steps = selected?.flow?.steps;
  if (detail?.summary?.id !== input.playId || !text(detail.summary.token)
    || target?.revisionId !== input.revisionId || selected?.id !== input.revisionId
    || target?.contentHash !== selected?.contentHash || !HASH.test(target?.contentHash ?? '')
    || !HASH.test(target?.policyHash ?? '') || typeof target?.sourceCurrent !== 'boolean' || !object(target?.play)
    || !Array.isArray(steps) || !steps.length || steps.some(step => !text(step?.id, 128)) || !unique(steps.map(step => step.id)))
    fail('Read the exact approval target and selected revision flow before continuing.');
  return { target, steps };
}

function checkExecutionApproval(review, opportunities, record, target, input) {
  if (!perPlay(review)) return;
  for (const decision of record.opportunities) {
    const execution = opportunities.get(decision.id).execution_target;
    const service = SERVICE_PURPOSES.has(input.playId);
    if (target.play.id !== input.playId || execution.type === 'none'
      || (execution.type === 'marketing' && (service || ![undefined, 'marketing'].includes(target.play.class)))
      || (execution.type === 'fixed_service' && (!service || target.play.class !== 'transactional'
        || !execution.purposes.includes(input.playId))))
      fail('The exact approval target does not match the reviewed execution target and sending lane.');
  }
}

export function bindApproval(artifact, detail, input) {
  const { opportunities, record } = approvalRecord(artifact, input), { target, steps } = readableTarget(detail, input);
  checkExecutionApproval(artifact.review, opportunities, record, target, input);
  if (detail.summary.token !== input.expectedToken || target.sourceCurrent !== true
    || record.contentHash !== target.contentHash || record.policyHash !== target.policyHash)
    fail('The current approval target no longer matches the recorded review. Refresh the review before approving.');
  // Display roles and executable approval targets are different contracts.
  // Preserve the current-proposal review guard only when that exact displayed
  // policy is the canonical target; historical/additive targets are not relabeled.
  if (detail.proposed?.id === input.revisionId && isDeepStrictEqual(detail.proposed.play, target.play)) {
    const rows = Array.isArray(artifact.review.reconciliation) ? artifact.review.reconciliation.filter(row =>
      row?.play_id === input.playId && row.revision_id === input.revisionId && row.role === 'proposed'
        && row.review_token === input.expectedToken) : [];
    if (rows.some(row => row.status !== 'matches' || row.content_hash !== target.contentHash || opportunities.get(row.opportunity_id)?.decision !== 'covered')
      || record.opportunities.some(decision => rows.filter(row => row.opportunity_id === decision.id
        && row.content_hash === target.contentHash && row.status === 'matches' && strings(row.checks, 1) && date(row.checked_at)).length !== 1))
      fail('Reconcile the current proposed policy with its exact revision, token and covered opportunities before approving.');
  }
  if (record.previews.length !== steps.length || record.previews.some(row => !steps.some(step => step.id === row.stepId)))
    fail('Record every selected email step preview in each requested language before approving.');
  return record;
}

export function replayApproval(artifact, detail, input) {
  const { opportunities, record } = approvalRecord(artifact, input), { target } = readableTarget(detail, input);
  checkExecutionApproval(artifact.review, opportunities, record, target, input);
  if (detail.summary.token === input.expectedToken || record.contentHash !== target.contentHash)
    fail('Only an advanced review token can retry the original saved approval request.');
  // Preserve the original evidence exactly. The server replays a matching
  // idempotency key before checking current state; a new stale-token request
  // cannot grant approval. Never use this path for a failed fresh preview.
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: {
      'input-file': { type: 'string' }, 'journey-review-file': { type: 'string' },
      'opportunity-id': { type: 'string' },
      'check-final': { type: 'boolean' },
      render: { type: 'string' },
    }, allowPositionals: true });
    if (values['opportunity-id'] !== undefined && (values.render || !values['journey-review-file']))
      fail('Use --opportunity-id with a play.propose action and --journey-review-file.');
    if (values['check-final']) {
      if (positionals.length || !values['journey-review-file'] || values.render || values['input-file'] || values['opportunity-id'])
        fail('Use --check-final with only --journey-review-file.');
      const { review } = readJourneyReview(values['journey-review-file']);
      checkIntendedInputs(review);
      checkHtml(values['journey-review-file'], review);
      process.stdout.write(JSON.stringify({ currentArtifactMatches: true, strategySha256: strategyDigest(review) }) + '\n');
    } else if (['discovery-task', 'reviewer-task'].includes(values.render)) {
      if (positionals.length || !values['input-file'] || values['journey-review-file'])
        fail('Use --render discovery-task or reviewer-task with only --input-file for the review context.');
      const render = values.render === 'discovery-task' ? renderDiscoveryTask : renderReviewerTask;
      process.stdout.write(JSON.stringify(render(readJson(values['input-file']).value)) + '\n');
    } else if (values.render) {
      if (positionals.length || !values['journey-review-file']
        || !['playbook', 'size', 'markdown', 'html', 'packet', 'digest', 'source-cases'].includes(values.render)
        || (values.render === 'packet' ? !values['input-file'] : values['input-file']))
        fail('Use --render playbook, size, markdown, html, digest or source-cases with --journey-review-file. Packet also needs --input-file with plan_input and brand_patch.');
      const { review } = readJourneyReview(values['journey-review-file']);
      const output = values.render === 'playbook' ? renderPlaybook(review) : values.render === 'markdown' ? renderMarkdown(review) : values.render === 'html' ? renderHtml(review)
        : JSON.stringify(values.render === 'size' ? measurePlaybook(review)
          : values.render === 'digest' ? { strategy_sha256: strategyDigest(review) }
          : values.render === 'source-cases' ? renderSourceCases(review)
          : reviewPacket(review, readJson(values['input-file']).value)) + '\n';
      process.stdout.write(output);
      process.exitCode = 0;
    } else {
      if (positionals.length || !values['input-file']) fail('Use --input-file with the exact action JSON to calculate its review digest.');
      const { value } = readJson(values['input-file']);
      if (values['journey-review-file']) {
        if (!['plan.propose', 'brand.confirm', 'brand.update', 'play.propose'].includes(value.action))
          fail('Local submission checks support plan proposals, brand actions and Play proposals. Use manage.mjs for an exact Play approval.');
        const { review } = readJourneyReview(values['journey-review-file']);
        checkHtml(values['journey-review-file'], review);
        checkSubmission(review, value, values['opportunity-id']);
      }
      process.stdout.write(JSON.stringify({ action: value.action, inputSha256: submissionHash(value),
        ...(values['journey-review-file'] ? { recordedReviewMatches: true } : {}) }) + '\n');
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: { code: error.code ?? 'journey_review', message: error.message } }) + '\n');
    process.exitCode = 1;
  }
}
