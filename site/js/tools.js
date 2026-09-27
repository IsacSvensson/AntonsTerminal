// Räkneverktygen. Ren logik utan DOM, testas med node:test.

export class ToolError extends Error {
  constructor(code, detail = '') {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- NYCKEL-notation

/** Pythons slice-semantik på en teckenlista. */
export function pySlice(arr, start, stop, step) {
  const n = arr.length;
  step = step ?? 1;
  if (step === 0) throw new ToolError('step');
  const out = [];
  if (step > 0) {
    let a = start == null ? 0 : start < 0 ? Math.max(0, start + n) : Math.min(start, n);
    const b = stop == null ? n : stop < 0 ? Math.max(0, stop + n) : Math.min(stop, n);
    for (; a < b; a += step) out.push(arr[a]);
  } else {
    let a = start == null ? n - 1 : start < 0 ? Math.max(-1, start + n) : Math.min(start, n - 1);
    const b = stop == null ? -1 : stop < 0 ? Math.max(-1, stop + n) : Math.min(stop, n - 1);
    for (; a > b; a += step) out.push(arr[a]);
  }
  return out;
}

function pyIndex(arr, i) {
  const j = i < 0 ? i + arr.length : i;
  if (j < 0 || j >= arr.length) throw new ToolError('index', String(i));
  return [arr[j]];
}

/**
 * Räknar t.ex. "NYCKEL[41][0] + NYCKEL[53][2] + NYCKEL[53][:2]".
 * keys = { 41: "…", … }. Indexering sker per tecken (Å är ett tecken).
 */
export function evalNyckel(expr, keys) {
  const src = String(expr);
  let pos = 0;
  const ws = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };
  const eat = (ch) => {
    ws();
    if (src[pos] !== ch) throw new ToolError('syntax', `väntade ${ch} vid ${pos + 1}`);
    pos++;
  };
  const peek = () => {
    ws();
    return src[pos];
  };
  const int = (optional) => {
    ws();
    const m = /^[+-]?\d+/.exec(src.slice(pos));
    if (!m) {
      if (optional) return null;
      throw new ToolError('syntax', `väntade tal vid ${pos + 1}`);
    }
    pos += m[0].length;
    return parseInt(m[0], 10);
  };

  const term = () => {
    ws();
    const m = /^nyckel/i.exec(src.slice(pos));
    if (!m) throw new ToolError('syntax', `väntade NYCKEL vid ${pos + 1}`);
    pos += m[0].length;
    eat('[');
    const page = int(false);
    eat(']');
    if (!Object.prototype.hasOwnProperty.call(keys, page) || keys[page] == null) {
      throw new ToolError('nokey', String(page));
    }
    let chars = Array.from(keys[page]);
    while (peek() === '[') {
      eat('[');
      const a = int(true);
      if (peek() === ':') {
        eat(':');
        const b = int(true);
        let c = null;
        if (peek() === ':') {
          eat(':');
          c = int(true);
        }
        chars = pySlice(chars, a, b, c);
      } else {
        if (a == null) throw new ToolError('syntax', `tomt index vid ${pos + 1}`);
        chars = pyIndex(chars, a);
      }
      eat(']');
    }
    return chars.join('');
  };

  let out = term();
  while (peek() === '+') {
    eat('+');
    out += term();
  }
  ws();
  if (pos < src.length) throw new ToolError('syntax', `oväntat tecken vid ${pos + 1}`);
  return out;
}

// ---------------------------------------------------------------- bas

const DIG = '0123456789abcdefghijklmnopqrstuvwxyz';

function parseBase(s) {
  if (!/^\d+$/.test(String(s))) throw new ToolError('base', String(s));
  const b = parseInt(s, 10);
  if (b < 2 || b > 256) throw new ToolError('base', String(s));
  return b;
}

/** Omvandlar mellan baser 2–256. Över 36 skrivs siffrorna kommaseparerade. */
export function bas(numStr, fromStr, toStr) {
  const from = parseBase(fromStr);
  const to = parseBase(toStr);
  const s = String(numStr).trim();
  if (!s) throw new ToolError('args');
  let digits;
  if (from > 36 || s.includes(',')) {
    digits = s.split(',').map((d) => {
      if (!/^\d+$/.test(d.trim())) throw new ToolError('digit', d);
      return parseInt(d.trim(), 10);
    });
  } else {
    digits = Array.from(s.toLowerCase()).map((ch) => {
      const v = DIG.indexOf(ch);
      if (v < 0) throw new ToolError('digit', ch);
      return v;
    });
  }
  let value = 0n;
  for (const d of digits) {
    if (d >= from) throw new ToolError('digit', String(d));
    value = value * BigInt(from) + BigInt(d);
  }
  const out = [];
  const B = BigInt(to);
  do {
    out.unshift(Number(value % B));
    value /= B;
  } while (value > 0n);
  return to > 36 ? out.join(',') : out.map((d) => DIG[d]).join('').toUpperCase();
}

// ---------------------------------------------------------------- ascii och xor

export function isPrintable(code) {
  return (code >= 32 && code < 127) || code >= 160;
}

export function bytesToText(bytes) {
  return bytes.map((b) => (isPrintable(b) ? String.fromCharCode(b) : '·')).join('');
}

/** Delar "12 27, 7" till tal. Returnerar null om något inte är ett heltal. */
export function parseNumbers(s) {
  const parts = String(s).split(/[\s,]+/).filter(Boolean);
  if (!parts.length || !parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.map((p) => parseInt(p, 10));
}

/** Tal → tecken, eller text → tal. */
export function ascii(input) {
  const nums = parseNumbers(input);
  if (nums) {
    for (const n of nums) if (n > 255) throw new ToolError('byte', String(n));
    return { mode: 'text', text: bytesToText(nums), values: nums };
  }
  const text = String(input);
  if (!text.trim()) throw new ToolError('args');
  const values = Array.from(text).map((c) => c.codePointAt(0));
  return { mode: 'numbers', text, values };
}

/** Upprepad XOR av byte-värden med en ASCII-nyckel. */
export function xor(valuesStr, key) {
  const values = parseNumbers(valuesStr);
  if (!values) throw new ToolError('args');
  for (const v of values) if (v > 255) throw new ToolError('byte', String(v));
  const kb = Array.from(String(key ?? '')).map((c) => c.codePointAt(0));
  if (!kb.length) throw new ToolError('nokeyarg');
  for (const k of kb) if (k > 255) throw new ToolError('byte', String(k));
  const out = values.map((v, i) => v ^ kb[i % kb.length]);
  return { values: out, text: bytesToText(out), printable: out.every(isPrintable) };
}

// ---------------------------------------------------------------- RSA-räkning

export function parseBig(s) {
  const t = String(s ?? '').trim();
  if (!/^-?\d+$/.test(t)) throw new ToolError('number', t);
  return BigInt(t);
}

const mod = (a, m) => ((a % m) + m) % m;

export function powmod(aStr, bStr, nStr) {
  const a = parseBig(aStr);
  const b = parseBig(bStr);
  const n = parseBig(nStr);
  if (n <= 0n) throw new ToolError('modulus');
  if (b < 0n) throw new ToolError('exponent');
  if (n === 1n) return 0n;
  let result = 1n;
  let base = mod(a, n);
  let e = b;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % n;
    base = (base * base) % n;
    e >>= 1n;
  }
  return result;
}

/** Modulär invers, eller null om den inte finns. */
export function modinv(aStr, mStr) {
  const a = parseBig(aStr);
  const m = parseBig(mStr);
  if (m <= 0n) throw new ToolError('modulus');
  let [r0, r1] = [mod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) return m === 1n ? 0n : null;
  return mod(s0, m);
}
