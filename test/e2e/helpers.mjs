import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

const FIX = new URL('../fixtures/', import.meta.url);
export const fixture = JSON.parse(readFileSync(new URL('content.test.json', FIX), 'utf8'));

/** Låter sidan läsa fixturinnehållet i stället för site/data och site/assets. */
export async function useFixture(page) {
  await page.route('**/data/content.enc.json', (r) =>
    r.fulfill({ path: fileURLToPath(new URL('content.test.enc.json', FIX)), contentType: 'application/json' }),
  );
  await page.route('**/assets/*.bin', (r) => {
    const name = new URL(r.request().url()).pathname.split('/').pop();
    return r.fulfill({ path: fileURLToPath(new URL('assets/' + name, FIX)) });
  });
}

export async function idle(page) {
  await page.waitForFunction(() => document.body.dataset.busy === '0', null, { timeout: 60_000 });
}

export async function open(page, hash = '') {
  await page.goto(hash ? './' + hash : './');
  await idle(page);
}

/** Skriver ett kommando och väntar tills all utskrift är klar. Returnerar de nya raderna. */
export async function run(page, cmd) {
  const before = await page.locator('#out > .ln').count();
  await page.fill('#in', cmd);
  await page.press('#in', 'Enter');
  await idle(page);
  const all = await page.locator('#out > .ln').allInnerTexts();
  return all.slice(before + 1); // hoppa över ekot
}

export async function lastLine(page) {
  return (await page.locator('#out > .ln').last().innerText()).trim();
}

export function xorValues(text, key) {
  return Array.from(text).map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length));
}

export { expect };
