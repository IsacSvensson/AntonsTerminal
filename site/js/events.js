// Innehållet: offentlig del + lås som dekrypteras med nycklar härledda ur svaren.
// All text och allt beteende utöver grundverktygen kommer härifrån.

import { deriveKey, decryptJSON, decryptFile, fromB64, toB64 } from './crypto.js';
import { isSolved, keyOf, saveState } from './state.js';

export class Story {
  constructor(enc, state) {
    this.enc = enc;
    this.pub = enc.public;
    this.state = state;
    this.open = new Map(); // låsId → dekrypterat innehåll, i lösningsordning
  }

  /** Dekrypterar de lås som redan är lösta, med nycklarna i tillståndet. */
  async restore() {
    const keep = [];
    for (const [id, k] of this.state.solved) {
      const box = this.enc.locks[id];
      const content = box ? await decryptJSON(fromB64(k), box) : null;
      if (content) {
        this.open.set(id, content);
        keep.push([id, k]);
      }
    }
    if (keep.length !== this.state.solved.length) {
      this.state.solved = keep;
      saveState(this.state);
    }
  }

  solved(id) {
    return isSolved(this.state, id);
  }

  keyBytes(id) {
    const k = keyOf(this.state, id);
    return k ? fromB64(k) : null;
  }

  opened() {
    return [...this.open.values()];
  }

  msg(k) {
    return this.pub.msg?.[k] ?? k;
  }

  /** Senast definierade värde av ett fält bland öppnade lås, annars det offentliga. */
  latest(field, fallback) {
    let v = fallback;
    for (const c of this.opened()) if (field in c) v = c[field];
    return v;
  }

  cmds() {
    return Object.assign({}, this.pub.cmds, ...this.opened().map((c) => c.cmds ?? {}));
  }

  help() {
    return [...(this.pub.help ?? []), ...this.opened().flatMap((c) => c.help ?? [])];
  }

  hints() {
    return Object.assign({}, this.pub.hints, ...this.opened().map((c) => c.hints ?? {}));
  }

  keys() {
    const out = {};
    for (const c of this.opened()) if (c.key) out[c.key.page] = c.key.value;
    return out;
  }

  greet() {
    return this.latest('greet', this.pub.greet);
  }

  flicker() {
    return this.latest('flicker', null);
  }

  plain() {
    return this.opened().some((c) => c.plain);
  }

  /** Försöker öppna ett lås. Returnerar { key, content } eller null. */
  async tryOpen(id, answer) {
    const box = this.enc.locks[id];
    const meta = this.pub.locks[id];
    if (!box || !meta) return null;
    const prevKey = meta.prev ? this.keyBytes(meta.prev) : null;
    if (meta.prev && !prevKey) return null;
    const key = await deriveKey(answer, id, prevKey);
    const content = await decryptJSON(key, box);
    return content ? { key, content } : null;
  }

  async loadAsset(step) {
    const key = this.keyBytes(step.lock);
    const get = async (name, type) => {
      if (!name) return null;
      const res = await fetch(`assets/${name}.bin`);
      if (!res.ok) return null;
      const pt = await decryptFile(key, new Uint8Array(await res.arrayBuffer()));
      return pt ? URL.createObjectURL(new Blob([pt], { type })) : null;
    };
    const [gif, qrc] = await Promise.all([get(step.gif, 'image/gif'), get(step.qrc, 'application/octet-stream')]);
    return { gif, qrc };
  }
}

/** Tillämpar det som beror på öppnade lås: flimmer, klartextläge och huvudfältet. */
export function applyMode(ctx, { logo = 'static' } = {}) {
  ctx.printer.flicker = ctx.story.flicker();
  document.body.classList.toggle('plain', ctx.story.plain());
  ctx.hud?.update({ logo });
}

/** Ett lås har öppnats: spara först, kör sedan innehållet. */
export async function openLock(ctx, id, { key, content }) {
  const { state, story, printer } = ctx;
  state.solved.push([id, toB64(key)]);
  story.open.set(id, content);
  for (const u of content.unlock ?? []) if (!state.unlocked.includes(u)) state.unlocked.push(u);
  if (content.event && !state.events.includes(content.event)) state.events.push(content.event);
  if (content.clock?.stop && !state.finishedAt) state.finishedAt = Date.now();
  saveState(state);
  printer.flicker = null; // händelsen skrivs utan flimmer
  ctx.hud?.update({ logo: 'keep', lines: false }); // progressraden direkt; resten när innehållet säger till (fx logo)
  await printer.run(content.steps);
  applyMode(ctx, { logo: content.steps?.some((s) => s.fx === 'logo') ? 'keep' : 'static' });
  await checkAll(ctx);
}

/** Repliker som körs när en grupp lås alla är lösta. */
export async function checkAll(ctx) {
  const { state, story, printer } = ctx;
  for (const c of story.opened()) {
    const all = c.all;
    if (!all || state.events.includes(all.id)) continue;
    if (!all.need.every((id) => story.solved(id))) continue;
    state.events.push(all.id);
    saveState(state);
    await printer.run(all.steps);
  }
}

/** `meddelanden`: allt som har sagts, utan effekter. */
export async function replay(ctx) {
  const { state, story, printer } = ctx;
  await printer.run(story.pub.intro, { replay: true });
  for (const [id] of state.solved) {
    const c = story.open.get(id);
    if (!c) continue;
    await printer.run(c.steps, { replay: true });
  }
  for (const c of story.opened()) {
    if (c.all && state.events.includes(c.all.id)) await printer.run(c.all.steps, { replay: true });
  }
}

// ---------------------------------------------------------------- ledtrådar

const pad2 = (n) => String(n).padStart(2, '0');

export function hintAccess(ctx, page) {
  const gate = ctx.story.pub.hintGate ?? {};
  if (!(page in gate)) return 'none';
  if (ctx.story.solved(page)) return 'solved';
  const g = gate[page];
  if (g && !ctx.story.solved(g)) return 'locked';
  if (!ctx.story.hints()[page]) return 'locked';
  return 'open';
}

export async function hintList(ctx) {
  const { story, state, printer } = ctx;
  const gate = story.pub.hintGate ?? {};
  for (const page of Object.keys(gate)) {
    const access = hintAccess(ctx, page);
    if (access === 'none' || access === 'locked') continue;
    const n = state.hints[page]?.n ?? 0;
    const dots = '●'.repeat(n) + '○'.repeat(Math.max(0, 3 - n));
    await printer.line('a', `${page}  ${access === 'solved' ? '✓' : dots}`);
  }
}

export async function hint(ctx, page, now = Date.now()) {
  const { story, state, printer, testMode } = ctx;
  const access = hintAccess(ctx, page);
  if (access === 'none') return printer.line('a', story.msg('notMine'));
  if (access === 'locked') return printer.line('a', story.msg('notYet'));
  if (access === 'solved') return printer.line('a', story.msg('open'));

  const h = story.hints()[page];
  const voice = h.v ?? 'a';
  const rec = state.hints[page] ?? { n: 0, t: 0 };
  await printer.run(h.pre);
  for (let i = 0; i < rec.n; i++) await printer.line(voice, h.lines[i]);
  if (rec.n >= h.lines.length) return;

  const cooldown = (story.pub.cooldownMin ?? [0, 0, 0])[rec.n] ?? 0;
  const waitMs = testMode || rec.n === 0 ? 0 : rec.t + cooldown * 60000 - now;
  if (waitMs > 0) {
    const s = Math.ceil(waitMs / 1000);
    return printer.line('a', `${story.msg('patience')} ${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`);
  }
  await printer.line(voice, h.lines[rec.n]);
  rec.n++;
  rec.t = now;
  state.hints[page] = rec;
  for (const u of h.unlock?.[rec.n] ?? []) if (!state.unlocked.includes(u)) state.unlocked.push(u);
  saveState(state);
}
