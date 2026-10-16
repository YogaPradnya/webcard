import { randomInt } from 'crypto';

export function randomDigits(length) {
  let s = '';
  for (let i = 0; i < length; i++) s += String(randomInt(0, 10));
  return s;
}

export async function uniqueCode(gen, exists, maxTries = 10) {
  for (let i = 0; i < maxTries; i++) {
    const code = gen();
    // eslint-disable-next-line no-await-in-loop
    if (!(await exists(code))) return code;
  }
  throw new Error('Gagal membuat kode unik.');
}
