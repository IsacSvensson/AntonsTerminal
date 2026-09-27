import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  norm,
  deriveKey,
  encryptJSON,
  decryptJSON,
  encryptFile,
  decryptFile,
  packContent,
  saltFor,
  toB64,
  fromB64,
} from '../../site/js/crypto.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/content.test.json', import.meta.url), 'utf8'));
const encFixture = JSON.parse(await readFile(new URL('../fixtures/content.test.enc.json', import.meta.url), 'utf8'));

test('norm', () => {
  assert.equal(norm('Hej på dig!'), 'HEJPADIG');
  assert.equal(norm('  äpple-PÄRON 12 '), 'APPLEPARON12');
  assert.equal(norm('Ölkällaren Å'), 'OLKALLARENA');
  assert.equal(norm('é'), 'E');
  assert.equal(norm(''), '');
  assert.equal(norm(null), '');
});

test('base64 rundtur', () => {
  const b = new Uint8Array([0, 1, 2, 250, 255, 128]);
  assert.deepEqual(fromB64(toB64(b)), b);
});

test('salt och kedja', () => {
  assert.equal(saltFor('11', null), 'cc2|11|');
  assert.equal(saltFor('12', new Uint8Array([1, 2, 3])), 'cc2|12|AQID');
});

test('KDF: samma svar i olika form ger samma nyckel, fel svar en annan', async () => {
  const a = await deriveKey('Äpple', '11', null, 1000);
  const b = await deriveKey('  apple ', '11', null, 1000);
  const c = await deriveKey('päron', '11', null, 1000);
  const d = await deriveKey('Äpple', '12', null, 1000);
  assert.equal(a.length, 32);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(a, d);
  const chained = await deriveKey('Äpple', '11', c, 1000);
  assert.notDeepEqual(a, chained);
});

test('AES-GCM rundtur och fel nyckel', async () => {
  const k = await deriveKey('test', '1', null, 1000);
  const wrong = await deriveKey('fel', '1', null, 1000);
  const box = await encryptJSON(k, { hej: 'på dig', n: [1, 2] });
  assert.deepEqual(await decryptJSON(k, box), { hej: 'på dig', n: [1, 2] });
  assert.equal(await decryptJSON(wrong, box), null);
  const file = await encryptFile(k, new Uint8Array([9, 8, 7]));
  assert.deepEqual(await decryptFile(k, file), new Uint8Array([9, 8, 7]));
  assert.equal(await decryptFile(wrong, file), null);
  const box2 = await encryptJSON(k, { hej: 'på dig', n: [1, 2] });
  assert.notEqual(box.iv, box2.iv);
});

test('packContent kedjar nycklarna enligt prev', async () => {
  const plain = {
    v: 1,
    public: { locks: { a: { prev: null }, b: { prev: 'a' } } },
    locks: { b: { t: 'B' }, a: { t: 'A' } },
  };
  const { enc, keys } = await packContent(plain, { a: 'ett', b: 'två' }, 1000);
  assert.deepEqual(keys.a, await deriveKey('ett', 'a', null, 1000));
  assert.deepEqual(keys.b, await deriveKey('två', 'b', keys.a, 1000));
  assert.deepEqual(await decryptJSON(keys.b, enc.locks.b), { t: 'B' });
});

test('fixturen: alla lås öppnas med rätt svar i kedjan, fel svar misslyckas', async () => {
  const meta = encFixture.public.locks;
  const keys = {};
  for (const id of ['41', '43', '47', '53', '59', '61']) {
    const prev = meta[id].prev ? keys[meta[id].prev] : null;
    const wrong = await deriveKey(fixture.answers[id] + 'X', id, prev);
    assert.equal(await decryptJSON(wrong, encFixture.locks[id]), null, `fel svar öppnar inte ${id}`);
    keys[id] = await deriveKey(fixture.answers[id].toLowerCase(), id, prev);
    const c = await decryptJSON(keys[id], encFixture.locks[id]);
    assert.deepEqual(c, fixture.content.locks[id], `lås ${id}`);
  }
  // rätt svar men utan kedjan öppnar inte
  const unchained = await deriveKey(fixture.answers['43'], '43', null);
  assert.equal(await decryptJSON(unchained, encFixture.locks['43']), null);
  // tillgångarna
  for (const [name, a] of Object.entries(fixture.assets)) {
    const file = new Uint8Array(await readFile(new URL(`../fixtures/assets/${name}.bin`, import.meta.url)));
    const raw = new Uint8Array(await readFile(new URL(`../fixtures/${a.src}`, import.meta.url)));
    assert.deepEqual(await decryptFile(keys[a.lock], file), raw, name);
  }
});

test('offentlig del innehåller inga lås-texter', () => {
  const pub = JSON.stringify(encFixture.public);
  for (const lock of Object.values(fixture.content.locks)) {
    for (const s of lock.steps ?? []) if (s.t && s.t.length > 6) assert.ok(!pub.includes(s.t), s.t);
  }
});
