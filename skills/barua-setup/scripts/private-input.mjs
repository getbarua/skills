// Bounded local input shared by the headless helpers. O_NONBLOCK prevents a
// FIFO open from waiting for a writer before we can reject its file type.
// The descriptor is checked once, then read only through cap+1 bytes: a file
// growing after fstat cannot bypass the cap or force an unbounded allocation.
import { constants, openSync, closeSync, fstatSync, readSync } from 'node:fs';

export function readPrivateInput(path, { maxBytes, deadline, code, message, noFollow = false, validate }) {
  const refuse = () => { throw Object.assign(new Error(message), { code }); };
  const checkTime = () => {
    if (Date.now() >= deadline) throw Object.assign(new Error('The time limit ended while reading the private input.'), { code: 'timeout' });
  };
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(deadline)) refuse();
  checkTime();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (noFollow ? constants.O_NOFOLLOW : 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) refuse();
    validate?.(stat);
    const bytes = Buffer.alloc(maxBytes + 1); let length = 0;
    for (;;) {
      checkTime();
      const count = readSync(fd, bytes, length, Math.min(65536, bytes.length - length), null);
      if (!count) break;
      length += count;
      if (length > maxBytes) refuse();
    }
    checkTime();
    return { text: bytes.toString('utf8', 0, length), stat };
  } finally { closeSync(fd); }
}
