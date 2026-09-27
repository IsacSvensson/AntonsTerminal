import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { useFixture, open, run, expect } from './helpers.mjs';

const SHOTS = new URL('../shots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });

test.use({ viewport: { width: 375, height: 667 } });

test('375 px: ingen horisontell scroll, Codex-typsnittet och sifferfallback', async ({ page }, info) => {
  await useFixture(page);
  await open(page, '#test');
  await run(page, 'test snabb');
  await run(page, 'svar 41 kanel');
  await run(page, 'hjälp');
  await run(page, 'bas 1234567890123456789012345678901234567890 10 256');
  await run(page, 'ascii 72 101 106 32 49 50 51');
  await run(page, 'nycklar');

  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('19px Codex'))).toBe(true);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Codex').map((f) => f.status),
  );
  expect(loaded).toContain('loaded');

  // Codex saknar siffror: siffrorna ska ritas med fallback-typsnittet (samma bredd som i monospace)
  const widths = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    const mono = getComputedStyle(document.body).fontFamily;
    const w = (font, t) => {
      c.font = font;
      return c.measureText(t).width;
    };
    return {
      digitsCodex: w(`19px Codex, ${mono}`, '0123456789'),
      digitsMono: w(`19px ${mono}`, '0123456789'),
      lettersCodex: w(`19px Codex, ${mono}`, 'ABCDEFGHIJ'),
      lettersMono: w(`19px ${mono}`, 'ABCDEFGHIJ'),
    };
  });
  expect(widths.digitsCodex).toBeCloseTo(widths.digitsMono, 1);
  expect(Math.abs(widths.lettersCodex - widths.lettersMono)).toBeGreaterThan(1);

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    screen: document.querySelector('#screen').scrollWidth - document.querySelector('#screen').clientWidth,
  }));
  expect(overflow.doc).toBeLessThanOrEqual(0);
  expect(overflow.screen).toBeLessThanOrEqual(0);

  // inmatningen zoomar inte på iOS (minst 16 px) och har rätt attribut
  const input = page.locator('#in');
  expect(parseFloat(await input.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(input).toHaveAttribute('autocapitalize', 'off');
  await expect(input).toHaveAttribute('autocorrect', 'off');
  await expect(input).toHaveAttribute('spellcheck', 'false');

  await page.screenshot({ path: new URL(`${info.project.name}-375.png`, SHOTS).pathname.replace(/^\/(\w:)/, '$1') });
});
