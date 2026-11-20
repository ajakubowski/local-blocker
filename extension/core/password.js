const ITERATIONS = 600000;
const bytesToHex = bytes => [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
const hexToBytes = hex => Uint8Array.from(hex.match(/../g), b => Number.parseInt(b, 16));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
}

export async function createVerifier(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new Error('Use a password with 8–1,024 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { algorithm: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: bytesToHex(salt), hash: bytesToHex(await derive(password, salt, ITERATIONS)) };
}

export async function verifyPassword(password, verifier) {
  if (typeof password !== 'string' || password.length > 1024 || !verifier || verifier.algorithm !== 'PBKDF2-SHA-256' || verifier.iterations !== ITERATIONS || !/^[a-f0-9]{32}$/.test(verifier.salt) || !/^[a-f0-9]{64}$/.test(verifier.hash)) return false;
  const actual = await derive(password, hexToBytes(verifier.salt), verifier.iterations);
  const expected = hexToBytes(verifier.hash);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}
