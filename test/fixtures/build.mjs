// Bygger det krypterade fixturinnehållet (påhittade svar) med samma kod som det riktiga bygget.
// node test/fixtures/build.mjs
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { packContent, packReview, encryptFile } from '../../site/js/crypto.js';

const dir = dirname(fileURLToPath(import.meta.url));

// 1×1 GIF och påhittade kassettbyte
const RAW = {
  'tiny.gif': Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  'fake-a.qrc': Buffer.from('fixture cartridge A\n'),
  'fake-b.qrc': Buffer.from('fixture cartridge B\n'),
};

const fx = JSON.parse(await readFile(join(dir, 'content.test.json'), 'utf8'));
const { enc, keys } = await packContent(fx.content, fx.answers);
if (fx.reviewPassword) enc.review = await packReview(keys, fx.reviewPassword);
await writeFile(join(dir, 'content.test.enc.json'), JSON.stringify(enc, null, 1) + '\n');

const out = join(dir, 'assets');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const [name, a] of Object.entries(fx.assets)) {
  await writeFile(join(out, name + '.bin'), await encryptFile(keys[a.lock], RAW[a.src]));
}
for (const [name, bytes] of Object.entries(RAW)) await writeFile(join(dir, name), bytes);
console.log('fixtur byggd:', Object.keys(enc.locks).join(' '));
