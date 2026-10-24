// Exclusive private output for inspect.mjs. Raw downloads preserve exact bytes;
// they must not use the secret sink, whose newline is part of its key protocol.
import { openSync, closeSync, realpathSync, constants, fchmodSync, writeFileSync, fsyncSync, unlinkSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const failure = () => Object.assign(new Error('Use a new writable private output file, already ignored when inside Git.'), { code: 'private_output' });
export function privateOutput(requested, deadline) {
  let path, fd;
  try {
    path = resolve(realpathSync(dirname(resolve(requested))), basename(requested));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      !name.startsWith('GIT_') && !name.startsWith('BARUA_') && !/TOKEN|PASSWORD|SECRET|API_KEY|SUPABASE/i.test(name)));
    const git = args => {
      if (Date.now() >= deadline) throw failure();
      const result = spawnSync('git', ['-C', dirname(path), ...args], { env: { ...env, LC_ALL: 'C' },
        timeout: Math.max(1, Math.min(15000, deadline - Date.now())), killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 65536 });
      if (result.error) throw failure();
      return result;
    };
    const root = git(['rev-parse', '--show-toplevel']);
    if (root.status === 0 ? git(['check-ignore', '-q', '--', path]).status !== 0
      : !(root.status === 128 && /not a git repository/i.test(root.stderr))) throw failure();
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    fchmodSync(fd, 0o600);
  } catch { if (fd !== undefined) closeSync(fd); throw failure(); }
  let saved = false;
  return {
    save(bytes) {
      if (Date.now() >= deadline) throw Object.assign(new Error('The time limit ended before saving the private output.'), { code: 'timeout' });
      writeFileSync(fd, bytes); fsyncSync(fd); saved = true;
      return { saved: true, path, bytes: Buffer.byteLength(bytes) };
    },
    close() { closeSync(fd); if (!saved) unlinkSync(path); },
  };
}
