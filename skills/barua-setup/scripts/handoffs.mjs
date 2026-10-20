// Local receipts preserve owner links when approval finishes before the next
// setup read. Printing a receipt does not establish that the owner saw it.
// Create the private journal with mktemp first; this helper never creates it.
// node handoffs.mjs --record <journal> < response.json
// node handoffs.mjs --report <journal> < latest-setup.json
import { openSync, closeSync, fstatSync, readSync, writeSync, constants } from 'node:fs';

const MAX_INPUT = 64 * 1024, MAX_FILE = 256 * 1024, MAX_ENTRIES = 256;
class Refusal extends Error {}
const refuse = message => { throw new Refusal(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0
  && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
function json(value) {
  try { return JSON.parse(value); } catch { refuse('Expected valid JSON; no input was saved.'); }
}
function entry(value, kind) {
  if (!object(value) || !text(value.step, 80) || !/^[a-z][a-z0-9_]*$/.test(value.step)
    || !text(value.url, 2048) || !text(value.why, 4096)) refuse('Each step needs a valid step, URL and reason.');
  let url;
  try { url = new URL(value.url); } catch { refuse('A step URL is invalid.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) refuse('A step URL must be HTTP(S) without credentials.');
  return { kind, step: value.step, url: value.url, why: value.why };
}
function receipts(body) {
  if (!object(body)) refuse('Expected an API response object.');
  const required = body.needs_human === undefined ? [] : Array.isArray(body.needs_human) ? body.needs_human : [body.needs_human];
  const optional = body.optional ?? [];
  if (!Array.isArray(optional) || required.length + optional.length > MAX_ENTRIES) refuse('Too many or invalid handoff entries.');
  return [...required.map(value => entry(value, 'needs_human')), ...optional.map(value => entry(value, 'optional'))];
}
function render(entries, done = new Set()) {
  const unique = new Map(entries.map(value => [JSON.stringify([value.step, value.url]), value]));
  if (unique.size > MAX_ENTRIES) refuse('Too many handoff entries.');
  return [...unique.values()].map(value => `${done.has(value.step) ? 'completed_owner_step' : value.kind}: ${value.step} ${value.url}\n  why: ${value.why}\n`).join('');
}

let fd;
try {
  const [mode, path] = process.argv.slice(2);
  if (!['--record', '--report'].includes(mode) || !path || process.argv.length !== 4) refuse('Use --record <journal> or --report <journal>, with response JSON on stdin.');
  const chunks = []; let inputBytes = 0;
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > MAX_INPUT) refuse('Response exceeds 64 KiB.');
    chunks.push(chunk);
  }
  const body = json(Buffer.concat(chunks).toString('utf8')), current = receipts(body);
  const done = mode === '--report' ? body.done : [];
  if (!Array.isArray(done) || done.length > MAX_ENTRIES || done.some(value => !text(value, 80))
    || (mode === '--report' && !Array.isArray(body.needs_human))) refuse('Report requires the latest setup response, including needs_human and done.');
  fd = openSync(path, constants.O_NOFOLLOW | constants.O_NONBLOCK
    | (mode === '--record' ? constants.O_RDWR | constants.O_APPEND : constants.O_RDONLY));
  const stat = fstatSync(fd);
  if (!stat.isFile() || typeof process.getuid !== 'function' || stat.uid !== process.getuid()
    || (stat.mode & 0o077) !== 0 || stat.nlink !== 1) refuse('Journal must be a private regular file owned by your user, without links.');
  if (stat.size > MAX_FILE) refuse('Journal exceeds 256 KiB.');
  const buffer = Buffer.alloc(MAX_FILE + 1); let bytes = 0, count;
  while (bytes < buffer.length && (count = readSync(fd, buffer, bytes, buffer.length - bytes, bytes)) > 0) bytes += count;
  if (bytes > MAX_FILE) refuse('Journal exceeds 256 KiB.');
  const saved = buffer.subarray(0, bytes).toString('utf8');
  if (saved && !saved.endsWith('\n')) refuse('Journal has an incomplete receipt.');
  const lines = saved ? saved.trimEnd().split('\n') : [];
  if (lines.length > MAX_ENTRIES) refuse('Too many saved handoff entries.');
  const previous = lines.map(line => {
    const value = json(line);
    if (!['needs_human', 'optional'].includes(value?.kind)) refuse('Journal has an invalid receipt.');
    return entry(value, value.kind);
  });
  const output = render(mode === '--record' ? current : [...previous, ...current], new Set(done));
  if (mode === '--record' && current.length) {
    const append = Buffer.from(current.map(value => JSON.stringify(value) + '\n').join(''));
    if (previous.length + current.length > MAX_ENTRIES || fstatSync(fd).size + append.length > MAX_FILE) refuse('Journal limit reached; keep it and report its saved handoffs.');
    // O_APPEND and one write preserve other writers' receipts; never rewrite.
    if (writeSync(fd, append) !== append.length) refuse('Receipt append was incomplete; keep the journal for review.');
  }
  process.stdout.write(output);
} catch (error) {
  process.stderr.write(`handoffs: ${error instanceof Refusal ? error.message : 'Could not open or append the existing private journal.'}\n`);
  process.exitCode = 1;
} finally { if (fd !== undefined) closeSync(fd); }
