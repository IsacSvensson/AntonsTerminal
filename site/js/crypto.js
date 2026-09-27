// Normalisering, nyckelhärledning och AES-GCM.
// Samma modul används i webbläsaren och av byggskript i Node (globalThis.crypto).

export const ITERATIONS = 150000;
export const IV_BYTES = 12;

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

/** NFD, utan diakritiska tecken, versaler, bara A–Z och 0–9. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** Salt för ett lås: "cc2|<id>|<base64 av föregående låsnyckel>" (tomt om inget föregående). */
export function saltFor(lockId, prevKey) {
  return 'cc2|' + lockId + '|' + (prevKey ? toB64(prevKey) : '');
}

/** PBKDF2-SHA256(norm(svar), salt, 150 000, 256 bitar) → 32 byte. */
export async function deriveKey(answer, lockId, prevKey = null, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', te.encode(norm(answer)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(saltFor(lockId, prevKey)), iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

async function aesKey(raw, usage) {
  return subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

export async function encryptBytes(keyBytes, data, iv = randomBytes(IV_BYTES)) {
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyBytes, 'encrypt'), data);
  return { iv, ct: new Uint8Array(ct) };
}

/** Returnerar klartext, eller null om nyckeln är fel (GCM-taggen avgör). */
export async function decryptBytes(keyBytes, iv, ct) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(keyBytes, 'decrypt'), ct);
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

export async function encryptJSON(keyBytes, obj) {
  const { iv, ct } = await encryptBytes(keyBytes, te.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON(keyBytes, box) {
  const pt = await decryptBytes(keyBytes, fromB64(box.iv), fromB64(box.ct));
  return pt ? JSON.parse(td.decode(pt)) : null;
}

/** Fil på disk: iv (12 byte) följt av chiffertext med tagg. */
export async function encryptFile(keyBytes, data) {
  const { iv, ct } = await encryptBytes(keyBytes, data);
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptFile(keyBytes, file) {
  return decryptBytes(keyBytes, file.subarray(0, IV_BYTES), file.subarray(IV_BYTES));
}

/**
 * Bygger den krypterade innehållsfilen.
 * plain   = { v, public, locks: { id: {...} } }
 * answers = { id: svar }
 * Kedjan läses ur plain.public.locks[id].prev.
 * Returnerar { enc, keys } där keys[id] är den härledda nyckeln.
 */
export async function packContent(plain, answers, iterations = ITERATIONS) {
  const prev = Object.fromEntries(
    Object.keys(plain.locks).map((id) => [id, plain.public.locks?.[id]?.prev ?? null]),
  );
  const keys = {};
  const pending = Object.keys(plain.locks);
  while (pending.length) {
    const i = pending.findIndex((id) => !prev[id] || keys[prev[id]]);
    if (i < 0) throw new Error('lås utan giltig kedja: ' + pending.join(', '));
    const id = pending.splice(i, 1)[0];
    if (!(id in answers)) throw new Error('svar saknas för lås ' + id);
    keys[id] = await deriveKey(answers[id], id, prev[id] ? keys[prev[id]] : null, iterations);
  }
  const locks = {};
  for (const id of Object.keys(plain.locks)) locks[id] = await encryptJSON(keys[id], plain.locks[id]);
  return { enc: { v: plain.v ?? 1, public: plain.public, locks }, keys };
}
