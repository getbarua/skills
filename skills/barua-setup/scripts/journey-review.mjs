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
const lf = value => value.replace(/\r\n?/g, '\n');
const recorded = value => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
  ? 'Not recorded' : typeof value === 'string' ? lf(value) : JSON.stringify(stable(value));
const strategyValue = value => Array.isArray(value) && value.length ? value.map(recorded).join('; ') : recorded(value);

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
  const rendered = rows.map(row => {
    const held = row.decision === 'blocked' || row.decision === 'excluded';
    return { id: row.id, text: [
      `${held ? 'Do not create a Play. ' : row.kind === 'control' ? 'Control, do not create a Play. ' : ''}${row.id} (${recorded(row.decision)})`,
      ...STRATEGY_FIELDS.filter(([field]) => !held || HELD_FIELDS.has(field))
        .map(([field, label]) => `${label}: ${strategyValue(row[field])}`),
    ].join('\n') };
  });
  // Shorten repeated labels only. Keep field values and line boundaries intact:
  // URL readers, factual checks and human approval all consume this same text.
  const output = [
    `Product: ${strategyValue(review.product)}`,
    'Follow each decision and its proposed sending owner. Covered means strategy coverage, not implementation or launch. Keep messages assigned to another sender with that sender.',
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
    fail(`The generated playbook has ${chars} characters and ${bytes} UTF-8 bytes; limits are 24,000 characters and 32,768 bytes. Compact the recorded strategy and repeat its review. Largest rows: ${largest}.`);
  }
  return output;
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
    fail('The generated Markdown exceeds 512 KiB. Compact the recorded review without dropping its scope, then generate it again.');
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
    || /\b(?:ik|mk)_[A-Za-z0-9_-]{8,}\b|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/i.test(raw))
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
    || !singleLine(context.model) || !singleLine(context.effort))
    fail('Provide only owner_request, source_files paths, strategy_file JSON path, packet_file JSON path, model and effort.');
  const artifacts = [resolve(context.strategy_file), resolve(context.packet_file)];
  if (artifacts[0] === artifacts[1] || context.source_files.some(file => artifacts.includes(resolve(file))))
    fail('Keep the source paths separate from the strategy and packet paths.');
  // Read only the shipped procedure. Source and author files remain unopened
  // until the native reviewer has recorded its source-first expectations.
  const template = readPrivate(fileURLToPath(new URL(discovery
    ? '../templates/journey-discovery-task.md' : '../templates/journey-review-task.md', import.meta.url)), [], 'task template');
  const contract = fileURLToPath(new URL('../references/events.md', import.meta.url));
  const fields = discovery ? ['owner_request', 'source_files', 'model', 'effort'] : REVIEW_CONTEXT_FIELDS;
  return { prompt: `${template.toString('utf8').trimEnd()}${discovery ? '' : `\n\nAuthoritative event contract (path): ${JSON.stringify(contract)}`}\n\nTask context (JSON):\n${JSON.stringify(Object.fromEntries(fields.map(key => [key, context[key]])), null, 2)}\n`,
    expected_model: context.model,
    native_call: { subagent_type: 'general-purpose', effort: context.effort, run_in_background: false } };
}

export const renderReviewerTask = context => renderTask(context, false);
export const renderDiscoveryTask = context => renderTask(context, true);

export function checkMarkdown(file, review, secrets = []) {
  if (!/\.json$/i.test(file)) fail('Use a .json journey file with its generated .md sibling.');
  const bytes = readPrivate(file.replace(/\.json$/i, '.md'), secrets, 'Markdown');
  if (!bytes.equals(Buffer.from(renderMarkdown(review))))
    fail('The Markdown does not match this review. Generate its current readable view before continuing.');
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
  'reconciliation', 'approval_observations', 'submission_reviews', 'independent_review']);
const digest = value => sha256(JSON.stringify(stable(value)));
export function strategyDigest(review) {
  if (!object(review)) fail('Use a journey review object to calculate its strategy digest.');
  return digest(Object.fromEntries(Object.entries(review).filter(([name]) => !OPERATIONAL_FIELDS.has(name))));
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
    fail('Provide the complete plan_input and brand_patch objects for independent review.');
  normalizedPlan(plan_input);
  const playbook = renderPlaybook(review);
  return { strategy_sha256: strategyDigest(review), plan_input, plan_sha256: digest(plan_input),
    brand_patch, brand_patch_sha256: digest(brand_patch), playbook, playbook_sha256: sha256(playbook),
    ...(checklist === undefined ? {} : { checklist_sha256: checklistDigest(checklist) }) };
}

// These checks bind a recorded decision. Session/model strings are declarations,
// not authentication: only retained harness evidence can show who ran a review.
export function checkIndependentReview(review, command) {
  checkDiscovery(review);
  const receipt = review?.independent_review;
  const identity = value => object(value) && ['session_id', 'harness', 'model', 'effort'].every(name => text(value[name]));
  if (!object(receipt) || receipt.version !== 1 || receipt.status !== 'pass'
    || !identity(receipt.author) || !identity(receipt.reviewer)
    || receipt.author.session_id === receipt.reviewer.session_id || !date(receipt.checked_at)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(receipt.checked_at)
    || !Array.isArray(receipt.findings) || receipt.findings.length)
    fail('Record a passing independent review with distinct author and reviewer sessions before this action.');
  const packet = reviewPacket(review, receipt);
  for (const field of ['strategy_sha256', 'plan_sha256', 'brand_patch_sha256', 'playbook_sha256']) {
    if (!HASH.test(receipt[field] ?? '') || receipt[field] !== packet[field])
      fail('The independent review no longer matches the recorded strategy or intended inputs. Repeat that review.');
  }
  if (receipt.checklist_sha256 !== checklistDigest(receipt.checklist))
    fail('The independent review checklist changed after its source expectations were recorded.');
  const ids = new Set((review.opportunities ?? []).map(row => row.id));
  const linked = row => strings(row?.opportunity_ids, 1) && unique(row.opportunity_ids)
    && row.opportunity_ids.every(id => ids.has(id));
  if (receipt.checklist.some(row => row.verdict !== 'pass' || !linked(row))
    || [...ids].some(id => !receipt.checklist.some(row => row.opportunity_ids.includes(id))))
    fail('Complete the independent source checklist against every opportunity decision.');
  if (!Array.isArray(receipt.counterexamples) || !receipt.counterexamples.length
    || !unique(receipt.counterexamples.map(row => row?.id))
    || receipt.counterexamples.some(row => !text(row?.id, 128) || !text(row.scenario) || !text(row.expected)
      || !text(row.result) || !strings(row.evidence, 1) || !linked(row) || row.verdict !== 'pass'))
    fail('Record the independent review of concrete adverse-state counterexamples and their results.');
  if (command?.action === 'plan.propose' && digest(command.input) !== receipt.plan_sha256)
    fail('The plan input differs from the independent review. Review the complete intended plan again.');
  if (['brand.confirm', 'brand.update'].includes(command?.action)) {
    const { expectedVersion: _version, proposalHash: _proposal, seen: _seen, playbook, ...semantic } = command.input ?? {};
    if (typeof playbook !== 'string' || sha256(playbook) !== receipt.playbook_sha256)
      fail('Use the exact generated playbook from the independently reviewed artifact before submitting.');
    if (digest(semantic) !== digest({ patch: receipt.brand_patch }))
      fail('The brand patch differs from the independent review. Review the new input first.');
  }
  return receipt;
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
    fail('The current plan definitions or declarations differ from the independent review.');
  return target;
}

export function checkDiscovery(review) {
  if (review?.version !== 1 || !text(review.product) || !date(review.captured_at)
    || !Array.isArray(review.sources) || !review.sources.length
    || review.sources.some(source => !text(source?.repo) || !text(source?.revision)))
    fail('Record the product and inspected source revisions in journey-review.json.');
  if (!complete(review.discovery_review) || !complete(review.coverage_review))
    fail('Finish the separate source discovery and coverage reviews before this action.');
  const journeys = review.journeys, opportunities = review.opportunities, inventory = review.source_inventory;
  if (![journeys, opportunities, inventory].every(rows => Array.isArray(rows) && rows.length)
    || [journeys, opportunities, inventory].some(rows => rows.some(row => !text(row?.id, 128)) || !unique(rows.map(row => row.id))))
    fail('Record distinct source inventory, journey and opportunity IDs before this action.');
  const byJourney = new Map(journeys.map(row => [row.id, row])), byOpportunity = new Map(opportunities.map(row => [row.id, row]));
  for (const row of journeys) {
    if (row.assessment !== 'assessed' || !text(row.situation) || !strings(row.evidence, 1)
      || !strings(row.opportunity_ids, 1) || !unique(row.opportunity_ids)
      || row.opportunity_ids.some(id => !byOpportunity.get(id)?.journey_ids?.includes(row.id)))
      fail('Assess each discovered journey and link it to its opportunity decisions in both directions.');
  }
  for (const row of opportunities) {
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

export function checkSubmission(review, command) {
  checkDiscovery(review);
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

export function bindApproval(artifact, detail, input) {
  const { opportunities, record } = approvalRecord(artifact, input), { target, steps } = readableTarget(detail, input);
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
  const { record } = approvalRecord(artifact, input), { target } = readableTarget(detail, input);
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
      render: { type: 'string' },
    }, allowPositionals: true });
    if (['discovery-task', 'reviewer-task'].includes(values.render)) {
      if (positionals.length || !values['input-file'] || values['journey-review-file'])
        fail('Use --render discovery-task or reviewer-task with only --input-file for the review context.');
      const render = values.render === 'discovery-task' ? renderDiscoveryTask : renderReviewerTask;
      process.stdout.write(JSON.stringify(render(readJson(values['input-file']).value)) + '\n');
    } else if (values.render) {
      if (positionals.length || !values['journey-review-file']
        || !['playbook', 'size', 'markdown', 'packet', 'digest'].includes(values.render)
        || (values.render === 'packet' ? !values['input-file'] : values['input-file']))
        fail('Use --render playbook, size, markdown or digest with --journey-review-file. Packet also needs --input-file with plan_input and brand_patch.');
      const { review } = readJourneyReview(values['journey-review-file']);
      const output = values.render === 'playbook' ? renderPlaybook(review) : values.render === 'markdown' ? renderMarkdown(review)
        : JSON.stringify(values.render === 'size' ? measurePlaybook(review)
          : values.render === 'digest' ? { strategy_sha256: strategyDigest(review) }
          : reviewPacket(review, readJson(values['input-file']).value)) + '\n';
      process.stdout.write(output);
      process.exitCode = 0;
    } else {
      if (positionals.length || !values['input-file']) fail('Use --input-file with the exact action JSON to calculate its review digest.');
      const { value } = readJson(values['input-file']);
      if (values['journey-review-file']) {
        if (!['plan.propose', 'brand.confirm', 'brand.update'].includes(value.action))
          fail('Local submission checks support plan proposals and brand actions. Use manage.mjs for an exact Play approval.');
        const { review } = readJourneyReview(values['journey-review-file']);
        checkMarkdown(values['journey-review-file'], review);
        checkSubmission(review, value);
      }
      process.stdout.write(JSON.stringify({ action: value.action, inputSha256: submissionHash(value),
        ...(values['journey-review-file'] ? { recordedReviewMatches: true } : {}) }) + '\n');
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: { code: error.code ?? 'journey_review', message: error.message } }) + '\n');
    process.exitCode = 1;
  }
}
