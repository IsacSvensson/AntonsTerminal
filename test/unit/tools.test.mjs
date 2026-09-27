import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalNyckel, pySlice, bas, ascii, xor, powmod, modinv, ToolError } from '../../site/js/tools.js';

// Påhittade nycklar – inte bokens.
const KEYS = { 11: 'KÅRED', 12: 'LAMPA', 13: 'ÖSTRA' };

test('nyckel: index, negativa index, slice och +', () => {
  assert.equal(evalNyckel('NYCKEL[11][0] + NYCKEL[12][2] + NYCKEL[12][:2]', KEYS), 'KMLA');
  assert.equal(evalNyckel('nyckel[12][-1]', KEYS), 'A');
  assert.equal(evalNyckel('NYCKEL[11][1]', KEYS), 'Å'); // Å är ett tecken
  assert.equal(evalNyckel('NYCKEL[13]', KEYS), 'ÖSTRA');
  assert.equal(evalNyckel('NYCKEL[12][-3:]', KEYS), 'MPA');
  assert.equal(evalNyckel('NYCKEL[12][::-1]', KEYS), 'APMAL');
  assert.equal(evalNyckel('NYCKEL[12][::2]', KEYS), 'LMA');
  assert.equal(evalNyckel('NYCKEL[12][4:0:-2]', KEYS), 'AM');
  assert.equal(evalNyckel('NYCKEL[12][1:3][1]', KEYS), 'M');
  assert.equal(evalNyckel('  NYCKEL [ 11 ] [ -2 ] ', KEYS), 'E');
});

test('nyckel: fel', () => {
  assert.throws(() => evalNyckel('NYCKEL[99][0]', KEYS), (e) => e instanceof ToolError && e.code === 'nokey');
  assert.throws(() => evalNyckel('NYCKEL[12][5]', KEYS), (e) => e.code === 'index');
  assert.throws(() => evalNyckel('NYCKEL[12][-6]', KEYS), (e) => e.code === 'index');
  assert.throws(() => evalNyckel('NYCKEL[12][::0]', KEYS), (e) => e.code === 'step');
  assert.throws(() => evalNyckel('NYCKEL[12][0] +', KEYS), (e) => e.code === 'syntax');
  assert.throws(() => evalNyckel('__import__("os")', KEYS), (e) => e.code === 'syntax');
});

test('pySlice följer Python', () => {
  const a = Array.from('abcdefg');
  const py = (s, e, st) => pySlice(a, s, e, st).join('');
  assert.equal(py(null, null, null), 'abcdefg');
  assert.equal(py(-100, 100, null), 'abcdefg');
  assert.equal(py(5, 1, -1), 'fedc');
  assert.equal(py(-1, -8, -2), 'geca');
  assert.equal(py(100, null, -3), 'gda');
  assert.equal(py(2, 2, null), '');
});

test('bas: stora baser med komma, små baser med siffror', () => {
  assert.equal(bas('5,77', '256', '10'), '1357');
  assert.equal(bas('1357', '10', '256'), '5,77');
  assert.equal(bas('255', '10', '16'), 'FF');
  assert.equal(bas('ff', '16', '2'), '11111111');
  assert.equal(bas('100', '10', '3'), '10201');
  assert.equal(bas('10201', '3', '10'), '100');
  assert.equal(bas('0', '10', '256'), '0');
  assert.equal(bas('1,0,0', '256', '10'), '65536');
  assert.throws(() => bas('9', '8', '10'), (e) => e.code === 'digit');
  assert.throws(() => bas('1', '1', '10'), (e) => e.code === 'base');
  assert.throws(() => bas('1', '10', '257'), (e) => e.code === 'base');
  assert.throws(() => bas('3,300', '256', '10'), (e) => e.code === 'digit');
});

test('ascii: tal till text och tillbaka', () => {
  assert.deepEqual(ascii('72 101 106').text, 'Hej');
  assert.deepEqual(ascii('72,101,106').text, 'Hej');
  assert.deepEqual(ascii('Hej').values, [72, 101, 106]);
  assert.equal(ascii('1 72').text, '·H');
  assert.throws(() => ascii('300'), (e) => e.code === 'byte');
});

test('xor: upprepad nyckel', () => {
  const plain = 'TESTA EN RAD';
  const key = 'BOLT';
  const enc = Array.from(plain).map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length));
  const r = xor(enc.join(' '), key);
  assert.equal(r.text, plain);
  assert.equal(r.printable, true);
  const r2 = xor(enc.join(','), 'X');
  assert.equal(r2.values.length, plain.length);
  assert.throws(() => xor('1 2 999', 'A'), (e) => e.code === 'byte');
  assert.throws(() => xor('a b', 'A'), (e) => e.code === 'args');
});

test('powmod och modinv (påhittad RSA)', () => {
  // p = 61, q = 53, n = 3233, e = 17, d = 2753
  assert.equal(modinv('17', String(60 * 52)), 2753n);
  const c = powmod('65', '17', '3233');
  assert.equal(c, 2790n);
  assert.equal(powmod(c.toString(), '2753', '3233'), 65n);
  assert.equal(modinv('6', '9'), null);
  assert.equal(powmod('2', '100', '1000000007'), 976371285n);
  assert.equal(powmod('5', '0', '7'), 1n);
  assert.throws(() => powmod('2', '3', '0'), (e) => e.code === 'modulus');
});
