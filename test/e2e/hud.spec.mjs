import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { useFixture, open, run, idle, xorValues, fixture, expect } from './helpers.mjs';

const SHOTS = new URL('../shots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, SHOTS));
const A = fixture.answers;

test.use({ viewport: { width: 360, height: 740 } });

async function measure(page) {
  return page.evaluate(() => ({
    hud: document.querySelector('#hud').getBoundingClientRect().height,
    overflowDoc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowHud: document.querySelector('#hud').scrollWidth - document.querySelector('#hud').clientWidth,
    rings: [...document.querySelectorAll('#logo circle.ring')].map((c) => ({
      cx: +c.getAttribute('cx'),
      r: +c.getAttribute('r'),
      blue: c.classList.contains('blue'),
      dash: c.classList.contains('dash'),
    })),
    dots: document.querySelectorAll('#logo circle.dot').length,
    segs: [...document.querySelectorAll('#progress .seg')].map((s) => s.dataset.state),
    caseText: document.querySelector('#case').innerText.trim(),
    clock: document.querySelector('#hud').dataset.clock,
    seconds: +document.querySelector('#hud').dataset.seconds,
    plainClock: document.querySelector('#clock .tplain').hidden ? null : document.querySelector('#clock .tplain').textContent,
  }));
}

test('huvudfältet i tre lägen vid 360 px: emblem, ärenderad, progress och klocka', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobil', 'en gång räcker (viewport sätts här)');
  await useFixture(page);
  await open(page, '#test');

  // 1. före intrånget
  let m = await measure(page);
  expect(m.hud).toBeLessThanOrEqual(120);
  expect(m.overflowDoc).toBeLessThanOrEqual(0);
  expect(m.overflowHud).toBeLessThanOrEqual(0);
  expect(m.rings).toEqual([{ cx: 32, r: 10, blue: false, dash: false }]);
  expect(m.segs).toEqual(['open', 'open', 'open', 'open', 'open', 'open']);
  expect(m.caseText).toBe('fall 2000-01-01\nfrån test');
  expect(m.clock).toBe('running');
  // klockan räknar upp
  const s0 = m.seconds;
  await page.waitForFunction((s) => +document.querySelector('#hud').dataset.seconds >= s + 2, s0, { timeout: 5000 });
  const digit = await page.locator('#clock .nonacci i').last().evaluate((e) => [e.dataset.v, getComputedStyle(e).backgroundImage]);
  expect(Number(digit[0])).toBeGreaterThanOrEqual(2);
  expect(digit[1]).toContain('nonacci.png');
  await page.screenshot({ path: shot('hud-1-fore.png') });

  await run(page, 'test snabb');
  await run(page, `svar 41 ${A['41']}`);
  expect((await measure(page)).segs).toEqual(['brass', 'open', 'open', 'open', 'open', 'open']);
  for (const p of ['43', '47', '53']) await run(page, `svar ${p} ${A[p]}`);

  // 2. efter intrånget
  await run(page, `xor ${xorValues('HEJ', A['59']).join(' ')} --nyckel ${A['59']}`);
  await page.waitForTimeout(500);
  m = await measure(page);
  expect(m.rings).toEqual([
    { cx: 16, r: 8, blue: false, dash: false },
    { cx: 48, r: 8, blue: true, dash: true },
  ]);
  expect(m.segs).toEqual(['brass', 'brass', 'brass', 'brass', 'blue', 'open']);
  expect(m.caseText).toBe('fall 2000-01-01\nfrån test / b');
  expect(m.hud).toBeLessThanOrEqual(120);
  expect(m.overflowDoc).toBeLessThanOrEqual(0);
  await page.screenshot({ path: shot('hud-2-intrang.png') });

  // omladdning behåller läget
  await page.reload();
  await idle(page);
  expect((await measure(page)).rings.length).toBe(2);

  // 3. finalen
  await run(page, `svar 61 ${A['61']}`);
  await page.waitForTimeout(800);
  m = await measure(page);
  expect(m.rings).toEqual([
    { cx: 26, r: 12, blue: false, dash: false },
    { cx: 38, r: 12, blue: false, dash: false },
  ]);
  expect(m.dots).toBe(2);
  expect(m.segs).toEqual(['brass', 'brass', 'brass', 'brass', 'brass', 'brass']);
  expect(m.caseText).toBe('FALL 2000-01-01\nFRÅN SLUT');
  expect(m.clock).toBe('stopped');
  expect(m.plainClock).toMatch(/^T\+ \d\d:\d\d:\d\d$/);
  expect(m.hud).toBeLessThanOrEqual(120);
  expect(m.overflowDoc).toBeLessThanOrEqual(0);
  // klockan står still
  const stopped = m.seconds;
  await page.waitForTimeout(2200);
  expect((await measure(page)).seconds).toBe(stopped);
  await page.screenshot({ path: shot('hud-3-final.png') });

  await page.reload();
  await idle(page);
  m = await measure(page);
  expect(m.dots).toBe(2);
  expect(m.clock).toBe('stopped');
  expect(m.seconds).toBe(stopped);
});
