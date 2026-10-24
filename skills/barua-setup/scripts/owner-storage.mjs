// Private storage for owner.mjs. Built-ins only; no shell, credential argv or
// inherited Barua credentials in secret-destination subprocesses.
import { constants, openSync, closeSync, fchmodSync, lstatSync, writeFileSync,
  fsyncSync, renameSync, unlinkSync, mkdirSync, rmdirSync, realpathSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readPrivateInput } from './private-input.mjs';

export function fail(code, message) { throw Object.assign(new Error(message), { code }); }
export function origin(value) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_origin', 'Use a valid HTTPS origin.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    fail('invalid_origin', 'Use an HTTPS origin without a path, credentials, query or fragment.');
  }
  return url.origin;
}

function processCall(argv, deadline, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !name.startsWith('GIT_') && !name.startsWith('BARUA_') && !/SUPABASE|TOKEN|PASSWORD|SECRET|API_KEY/i.test(name)));
  return new Promise((accept, reject) => {
    const child = spawn(argv[0], argv.slice(1), { env: { ...env, LC_ALL: 'C' }, stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'ignore', 'ignore'] });
    let settled = false, stdout = '', stderr = '', bytes = 0;
    const finish = (error, status) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) {
        child.kill('SIGKILL'); child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
        reject(Object.assign(new Error('The private destination check or transfer failed.'), { code: 'secret_destination' }));
      } else accept({ status, stdout, stderr });
    };
    const timer = setTimeout(() => finish(true), Math.max(1, Math.min(15000, deadline - Date.now())));
    child.once('error', () => finish(true)); child.once('close', code => finish(false, code));
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) stream?.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) return finish(true);
      if (name === 'stdout') stdout += chunk; else stderr += chunk;
    });
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

async function ignored(path, deadline) {
  const git = await processCall(['git', '-C', dirname(path), 'rev-parse', '--show-toplevel'], deadline);
  if (git.status === 128 && /not a git repository/i.test(git.stderr)) return;
  if (git.status !== 0 || (await processCall(['git', '-C', dirname(path), 'check-ignore', '-q', '--', path], deadline)).status !== 0) {
    fail('secret_destination', 'Private files inside a Git repository must already be ignored.');
  }
}
function canonical(file) { return resolve(realpathSync(dirname(resolve(file))), basename(file)); }
function checked(stat) {
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 524288) {
    fail('session_permissions', 'The session must be a private regular file owned by you.');
  }
  return stat;
}

// Serializes reads, token refresh, workspace selection and logout across CLI
// processes. Never steal an old lock: the first process may still be refreshing.
export async function sessionStore(requested, deadline) {
  if (!requested) fail('session_required', 'Set BARUA_OWNER_SESSION_FILE or --session-file to a private file.');
  const path = canonical(requested), parent = lstatSync(dirname(path));
  if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0) {
    fail('session_permissions', 'Keep the session in a directory owned by you with mode 0700.');
  }
  await ignored(path, deadline);
  const lock = `${path}.lock`;
  await ignored(lock, deadline);
  const until = Math.min(deadline, Date.now() + 10000);
  while (true) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= until) fail('session_busy', 'Another command holds the session lock. Wait for it to finish.');
      await sleep(Math.min(50, Math.max(1, until - Date.now())));
    }
  }
  let original;
  const store = {
    path,
    read() {
      let read;
      try { read = readPrivateInput(path, { maxBytes: 524288, deadline, noFollow: true, validate: checked,
        code: 'session_permissions', message: 'The session must be a private regular file owned by you.' }); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      original = read.stat; return JSON.parse(read.text);
    },
    save(value) {
      if (Date.now() >= deadline) fail('timeout', 'The time limit ended before saving the session.');
      let current;
      try { current = lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (original ? (!current || current.ino !== original.ino || current.dev !== original.dev) : current) {
        fail('session_changed', 'The session changed outside this command. No file was overwritten.');
      }
      const temporary = `${lock}/${randomUUID()}`;
      const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      fchmodSync(fd, 0o600);
      try { writeFileSync(fd, `${JSON.stringify(value)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
      try { renameSync(temporary, path); } catch (error) { unlinkSync(temporary); throw error; }
      const directory = openSync(dirname(path), constants.O_RDONLY);
      try { fsyncSync(directory); } finally { closeSync(directory); }
      original = lstatSync(path);
    },
    close() { rmdirSync(lock); },
  };
  return store;
}

export async function secretSink(args, deadline) {
  if (Boolean(args['secret-file']) === Boolean(args['secret-command-file'])) fail('secret_destination', 'Choose exactly one private secret destination.');
  if (args['secret-command-file']) {
    let argv;
    try { argv = JSON.parse(readPrivateInput(args['secret-command-file'], { maxBytes: 65536, deadline,
      code: 'secret_destination', message: 'Use a regular secret command file of at most 64 KiB.' }).text); }
    catch { fail('secret_destination', 'Use a JSON argv array of at most 64 KiB for the secret command.'); }
    if (!Array.isArray(argv) || !argv.length || argv.length > 100 || argv.some(value => typeof value !== 'string' || value.includes('\0')) || !argv[0]) {
      fail('secret_destination', 'Use a nonempty JSON argv array for the secret command.');
    }
    return { async save(secret) {
      if ((await processCall(argv, deadline, `${secret}\n`)).status !== 0) fail('secret_transfer_failed', 'The secret transfer failed. Recover the same key into a new destination.');
      return { secret_saved: true, destination: 'command stdin' };
    }, close() {} };
  }
  const path = canonical(args['secret-file']); await ignored(path, deadline);
  let fd;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { fail('secret_destination', 'Use a new private secret file. Existing files are never overwritten.'); }
  fchmodSync(fd, 0o600);
  let saved = false;
  return { async save(secret) {
    if (Date.now() >= deadline) fail('secret_transfer_failed', 'The time limit ended before saving the key.');
    writeFileSync(fd, `${secret}\n`); fsyncSync(fd); saved = true;
    return { secret_saved: true, destination: path };
  }, close() { closeSync(fd); if (!saved) unlinkSync(path); } };
}
