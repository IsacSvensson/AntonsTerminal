import { test } from '@playwright/test';
import { useFixture, open, run, idle, lastLine, xorValues, fixture, expect } from './helpers.mjs';

const A = fixture.answers;
const L = fixture.content.locks;

test.beforeEach(async ({ page }) => {
  await useFixture(page);
});

test('intro, hjälp, spärrar och fel', async ({ page }) => {
  await open(page, '#sida3');
  await expect(page).toHaveTitle('millarossli');
  const out = page.locator('#out');
  await expect(out).toContainText('Hej testare.');
  await expect(out.locator('.va').first()).toBeVisible();

  const help = await run(page, 'HJÄLP');
  expect(help.join('\n')).toContain('svar <sida> <svar>');
  expect(help.join('\n')).not.toContain('bas <tal>');
  expect(await run(page, 'help')).toEqual(help);

  expect(await run(page, 'svar 43 något')).toEqual(['Börja med första.']);
  expect(await run(page, 'svar 61 något')).toEqual(['Börja med första.']);
  expect(await run(page, 'svar 37 något')).toEqual(['Inte här.']);
  expect(await run(page, 'nycklar')).toEqual(['Inga nycklar.']);
  expect(await run(page, 'faktorisera 15')).toEqual(['Själv.']);
  expect(await run(page, 'ps')).toEqual(['PID  NAMN', '1  test']);
  expect(await run(page, 'kill test')).toEqual(['Nix.']);
  expect(await run(page, 'kill vemsomhelst')).toEqual(['Vem då?']);
  expect(await run(page, 'whoami')).toEqual(['testperson']);

  // verktyg som inte är upplåsta beter sig som okända kommandon; de tre första felen i klartext
  for (let i = 0; i < 3; i++) {
    expect(await run(page, 'bas 1 10 2')).toEqual(['Okänt kommando.']);
    await expect(out.locator('.ln').last()).toHaveClass(/\bve\b/);
  }
  const wrong = await run(page, 'svar 41 fel');
  expect(['Nej.', 'Fel.', 'Inte det.']).toContain(wrong[0]);
  await expect(out.locator('.ln').last()).toHaveClass(/\bva\b/); // fjärde felet i huvudrösten
});

test('hela kedjan med fixturen, omladdning behåller tillståndet', async ({ page }) => {
  await open(page, '#test');
  await run(page, 'test snabb');
  const out = page.locator('#out');

  expect(await run(page, `svar 41 ${A['41'].toLowerCase()}`)).toEqual(['Första låset öppet.', 'Nyckel: KORT']);
  expect(await run(page, 'svar 41 igen')).toEqual(['Redan öppen.']);
  expect((await run(page, 'hjalp')).join('\n')).toContain('bas <tal>');
  expect(await run(page, 'bas 5,77 256 10')).toEqual(['1357']);
  expect(await run(page, 'ascii 72 101 106')).toEqual(['Hej']);
  expect(await run(page, 'nyckel NYCKEL[41][1:3] + NYCKEL[41][-1]')).toEqual(['ORT']);
  expect(await run(page, 'nyckel NYCKEL[43][0]')).toEqual(['Saknas: 43']);
  expect(await run(page, 'xor 1 2 --nyckel A')).toEqual(['Okänt kommando.']);

  // spärr för 61 innan de tre är lösta
  expect(await run(page, 'svar 61 x')).toEqual(['Inte än.']);
  expect(await run(page, `svar 43 ${A['43']}`)).toEqual(['Andra låset.', 'Nyckel: SKOG']);
  expect(await run(page, `svar 47 paron`)).toEqual(['Tredje låset.', 'Nyckel: BERG']);

  // omladdning mitt i
  await page.reload();
  await idle(page);
  await expect(out.locator('.ln').first()).toHaveText('Välkommen åter.');
  expect(await run(page, 'nycklar')).toEqual(['41  KORT', '43  SKOG', '47  BERG']);

  expect(await run(page, `svar 53 ${A['53']}`)).toEqual(['Fjärde låset.', 'Nyckel: TORN', 'Alla tre klara.']);
  expect(await run(page, 'svar 61 x')).toEqual(['Inte än.']); // 59 saknas

  // xor med fel nyckel: bara utskrift
  const vals = xorValues('HEJ HEJ', A['59']).join(' ');
  const r1 = await run(page, `xor ${vals} --nyckel HUND`);
  expect(r1.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.asset')).toHaveCount(0);

  // xor med rätt nyckel: texten, sedan händelsen med GIF och nedladdning
  const r2 = await run(page, `xor ${vals} --nyckel ${A['59']}`);
  expect(r2[0]).toBe('HEJ HEJ');
  expect(r2.join('\n')).toContain('Andra rösten här.');
  await expect(out.locator('.vb', { hasText: 'Andra rösten här.' })).toBeVisible();
  const img = page.locator('.asset img.qr').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await img.evaluate((i) => getComputedStyle(i).imageRendering)).toBe('pixelated');
  expect((await img.boundingBox()).width).toBeGreaterThanOrEqual(280);
  const dl = page.locator('.asset a.dl').first();
  await expect(dl).toHaveAttribute('download', 'test-a.qrc');
  const [download] = await Promise.all([page.waitForEvent('download'), dl.click()]);
  expect(download.suggestedFilename()).toBe('test-a.qrc');
  const bytes = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(bytes).toString()).toBe('fixture cartridge A\n');
  await expect(page.locator('a[href="konsol/"]')).toHaveText('konsolen');

  // efter händelsen
  const help = page.locator('#out .ln');
  await run(page, 'hjälp');
  await expect(help.filter({ hasText: 'extra' }).last()).toHaveClass(/\bvb\b/);
  expect(await run(page, 'powmod 65 17 3233')).toEqual(['2790']);
  expect(await run(page, 'modinv 6 9')).toEqual(['ingen invers']);
  expect(await run(page, 'ps')).toEqual(['PID  NAMN', '1  test', '1  annan  borta']);
  expect(await run(page, 'kill test')).toEqual(['Försök igen.']);
  await run(page, 'vem');
  await run(page, 'vem');
  expect(await run(page, 'vem')).toEqual(['testperson']); // tredje gången: blinkande rad som försvinner
  await run(page, 'extra');
  await expect(page.locator('.asset')).toHaveCount(2);

  await page.reload();
  await idle(page);
  expect(await run(page, 'ps')).toEqual(['PID  NAMN', '1  test', '1  annan  borta']);

  // finalen
  const fin = await run(page, `svar 61 ${A['61']}`);
  expect(fin).toContain('Brevrad ett.');
  await expect(page.locator('body')).toHaveClass(/\bplain\b/);
  await expect(page.locator('.vp').first()).toBeVisible();
  await expect(page.locator('.asset img.qr').last()).toBeVisible();
  const font = await page.locator('.va').first().evaluate((e) => getComputedStyle(e).fontFamily);
  expect(font).not.toMatch(/^"?Codex/);
  expect(await run(page, 'vem')).toEqual(['alla']);
  expect(await run(page, 'kill test')).toEqual(['Ingen kvar.']);

  await page.reload();
  await idle(page);
  await expect(page.locator('body')).toHaveClass(/\bplain\b/);
  const all = await run(page, 'meddelanden');
  expect(all).toContain('Hej testare.');
  expect(all).toContain('Brevrad två.');
  expect(all).toContain('Alla tre klara.');
});

test('ledtrådar med väntetider, spärrar och andra rösten', async ({ page }) => {
  await page.clock.install();
  await open(page);
  expect(await run(page, 'ledtråd')).toEqual(['41  ○○○']);
  expect(await run(page, 'ledtrad 43')).toEqual(['Inte än.']);
  expect(await run(page, 'hint 41')).toEqual(['Fixtur ledtråd ett.']);
  let r = await run(page, 'ledtråd 41');
  expect(r[0]).toBe('Fixtur ledtråd ett.');
  expect(r[1]).toMatch(/^Vänta\. (09:5\d|10:00)$/);
  expect(await run(page, 'ascii 72')).toEqual(['Okänt kommando.']);

  await page.clock.fastForward('10:01');
  r = await run(page, 'ledtråd 41');
  expect(r).toEqual(['Fixtur ledtråd ett.', 'Fixtur ledtråd två.']);
  expect(await run(page, 'ascii 72')).toEqual(['H']); // nivå 2 låser upp ascii
  r = await run(page, 'ledtråd 41');
  expect(r[2]).toMatch(/^Vänta\. 1[45]:\d\d$/);
  await page.clock.fastForward('14:00');
  expect((await run(page, 'ledtråd 41'))[2]).toMatch(/^Vänta\. 0[01]:\d\d$/);
  await page.clock.fastForward('01:05');
  expect(await run(page, 'ledtråd 41')).toEqual(['Fixtur ledtråd ett.', 'Fixtur ledtråd två.', 'Fixtur ledtråd tre.']);
  expect(await run(page, 'ledtråd')).toEqual(['41  ●●●']);

  await run(page, `svar 41 ${A['41']}`);
  expect(await run(page, 'ledtråd')).toEqual(['41  ✓', '43  ○○○', '47  ○○○', '53  ○○○']);
  expect(await run(page, 'ledtråd 41')).toEqual(['Redan öppen.']);
  expect(await run(page, 'ledtråd 59')).toEqual(['Inte än.']);
  expect(await run(page, 'ledtråd 47')).toEqual(['F47 ett.']);

  await run(page, `svar 53 ${A['53']}`);
  const r59 = await run(page, 'ledtråd 59');
  expect(r59).toEqual(['Inte här.', 'F59 ett.']);
  await expect(page.locator('#out .ln').last()).toHaveClass(/\bvb\b/);
  expect(await lastLine(page)).toBe('F59 ett.');
});

test('test visa: granskning med lösenord, utan att röra tillståndet', async ({ page }) => {
  await open(page, '#test');
  await run(page, 'test snabb');
  const wrong = await run(page, 'test visa gissat ord ett');
  expect(wrong.at(-1)).toBe('visa: fel lösenord');
  // lösenordet ekas aldrig
  await expect(page.locator('#out')).not.toContainText('gissat ord ett');
  await expect(page.locator('#out .vu').last()).toHaveText('> test visa ••••');
  const all = (await run(page, `test visa ${fixture.reviewPassword}`)).join('\n');
  for (const id of ['41', '43', '47', '53', '59', '61']) expect(all).toContain(`── lås ${id} ──`);
  expect(all).toContain('b: Andra rösten här.');
  expect(all).toContain('p: Brevrad två.');
  expect(all).toContain('ledtråd 59:3 (b): F59 tre.');
  expect(all).toContain('── slut ──');
  await expect(page.locator('#out')).not.toContainText(fixture.reviewPassword);
  // inget är löst eller upplåst
  const status = (await run(page, 'test status')).join('\n');
  expect(status).toContain('lösta: []');
  expect(await run(page, 'bas 1 10 2')).toEqual(['Okänt kommando.']);
  // utan #test finns kommandot inte
  await page.goto('./');
  await idle(page);
  expect(await run(page, `test visa ${fixture.reviewPassword}`)).toEqual(['Okänt kommando.']);
});

test('norm ger samma resultat i webbläsaren som i Node', async ({ page }) => {
  await open(page);
  const { norm } = await import('../../site/js/crypto.js');
  const samples = ['Hej på dig', 'ÄÅÖ äåö', 'é x', 'ß straße', 'Ø ø Ł', '12 ab-CD!'];
  const inBrowser = await page.evaluate(async (s) => {
    const m = await import('./js/crypto.js');
    return s.map(m.norm);
  }, samples);
  expect(inBrowser).toEqual(samples.map(norm));
});
