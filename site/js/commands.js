// Kommandotolken.

import { ToolError, evalNyckel, bas, ascii, xor, powmod, modinv } from './tools.js';
import { norm, reviewKey, decryptJSON, fromB64 } from './crypto.js';
import { saveState, clearState } from './state.js';
import { openLock, replay, hint, hintList } from './events.js';

const ALIASES = {
  help: 'hjalp',
  ledtrad: 'ledtrad',
  hint: 'ledtrad',
  whoami: 'vem',
  clear: 'rensa',
  faktorisera: 'faktor',
  factor: 'faktor',
};

const TOOLS = ['bas', 'ascii', 'xor', 'powmod', 'modinv'];

/** Kommandonamn utan diakritiska tecken och skiftläge: HJÄLP → hjalp. */
export function cmdName(s) {
  const n = String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return ALIASES[n] ?? n;
}

export function makeHandler(ctx) {
  const { state, story, printer } = ctx;
  const say = (t) => printer.line('a', t);
  const num = (t) => printer.line('n', t);
  const has = (tool) => state.unlocked.includes(tool);

  async function error(kind) {
    state.errors++;
    saveState(state);
    let t = story.msg(kind);
    if (Array.isArray(t)) t = t[Math.floor(Math.random() * t.length)];
    const plainLimit = story.pub.errorsPlain ?? 3;
    await printer.line(state.errors <= plainLimit ? 'e' : 'a', t);
  }

  async function syntax(cmd) {
    const entry = story.help().find((h) => cmdName(h.c.split(/\s+/)[0]) === cmd);
    await say(story.msg('syntax') + (entry ? '  ' + entry.c : ''));
  }

  async function toolError(e, cmd) {
    if (!(e instanceof ToolError)) throw e;
    if (e.code === 'nokey') return say(story.msg('noKey') + ' ' + e.detail);
    if (e.code === 'index' || e.code === 'step') return say(story.msg('range'));
    return syntax(cmd);
  }

  async function runCustom(name, spec) {
    if (spec.alt) {
      const c = (state.counters[name] = (state.counters[name] ?? 0) + 1);
      saveState(state);
      if (c % spec.alt.every === 0) await printer.run(spec.alt.steps);
    }
    await printer.run(spec.steps);
  }

  async function svar(args) {
    const [page, ...rest] = args;
    const answer = rest.join(' ');
    if (!page || !/^\d+$/.test(page)) return syntax('svar');
    const meta = story.pub.locks?.[page];
    if (!meta) return say(story.msg('notMine'));
    if (story.solved(page)) return say(story.msg('open'));
    // spärrar: [[lås som krävs, meddelande], …] i ordning
    for (const [id, m] of meta.gates ?? []) if (!story.solved(id)) return say(story.msg(m));
    if (meta.prev && !story.solved(meta.prev)) return say(story.msg('notYet'));
    if (!norm(answer)) return syntax('svar');
    const res = await story.tryOpen(page, answer);
    if (!res) return error('wrong');
    await openLock(ctx, page, res);
  }

  /** Lås som öppnas av xor-nyckeln (inte av svar). */
  async function tryXorLocks(key) {
    for (const [id, meta] of Object.entries(story.pub.locks ?? {})) {
      if (meta.via !== 'xor' || story.solved(id)) continue;
      if (meta.prev && !story.solved(meta.prev)) continue;
      if (!norm(key)) continue;
      const res = await story.tryOpen(id, key);
      if (res) await openLock(ctx, id, res);
    }
  }

  async function test(args) {
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'status') {
      const s = {
        lösta: state.solved.map(([id]) => id),
        verktyg: state.unlocked,
        fel: state.errors,
        händelser: state.events,
        ledtrådar: Object.fromEntries(Object.entries(state.hints).map(([k, v]) => [k, v.n])),
      };
      for (const [k, v] of Object.entries(s)) await num(`${k}: ${JSON.stringify(v)}`);
    } else if (sub === 'reset') {
      clearState();
      location.reload();
    } else if (sub === 'snabb') {
      printer.fast = !printer.fast;
      try {
        sessionStorage.setItem('cc2-fast', printer.fast ? '1' : '');
      } catch {
        /* ignorera */
      }
      await num(`snabb: ${printer.fast ? 'på' : 'av'}`);
    } else if (sub === 'glitch') {
      await printer.glitch(1500);
    } else if (sub === 'visa') {
      await review(args.slice(1).join(' '));
    } else {
      await num('test status | reset | snabb | glitch | visa <lösenord>');
    }
  }

  /** Granskning: skriver ut allt innehåll i klartext utan att röra tillståndet. */
  async function review(password) {
    const box = story.enc.review;
    if (!box) return num('visa: ingen granskningsdel i innehållet');
    if (!password) return num('visa: lösenord saknas');
    await num('visa: kontrollerar …');
    const r = await decryptJSON(await reviewKey(password), box);
    if (!r) return num('visa: fel lösenord');
    const show = (s) => {
      if (s.fx === 'asset') return printer.instant('n', `   [fil ${s.dl ?? ''}${s.label ? ' · ' + s.label : ''}${s.note ? ' · ' + s.note : ''}]`);
      if (s.fx) return printer.instant('n', `   [${s.fx}${s.ms ? ' ' + s.ms + ' ms' : ''}]`);
      const link = s.link ? s.link.t : '';
      const tags = [s.cut ? 'avbruten' : '', s.flash ? 'blinkar' : ''].filter(Boolean).join(', ');
      return printer.instant('n', `${s.v}: ${s.t ?? ''}${link}${tags ? `  (${tags})` : ''}`);
    };
    const pub = story.pub;
    printer.instant('n', '── offentligt ──');
    for (const s of pub.intro ?? []) show(s);
    for (const h of Object.values(pub.hints ?? {})) for (const t of h.lines) printer.instant('n', `ledtråd: ${t}`);
    for (const id of Object.keys(story.enc.locks)) {
      const key = r.keys[id];
      const c = key ? await decryptJSON(fromB64(key), story.enc.locks[id]) : null;
      printer.instant('n', `── lås ${id} ──`);
      if (!c) {
        printer.instant('n', '(kunde inte dekrypteras)');
        continue;
      }
      if (c.key) printer.instant('n', `nyckel: ${c.key.page} ${c.key.value}`);
      if (c.unlock) printer.instant('n', `låser upp: ${c.unlock.join(', ')}`);
      for (const s of c.steps ?? []) show(s);
      if (c.all) {
        printer.instant('n', `när ${c.all.need.join(', ')} är lösta:`);
        for (const s of c.all.steps) show(s);
      }
      for (const [page, h] of Object.entries(c.hints ?? {})) {
        for (const s of h.pre ?? []) show(s);
        h.lines.forEach((t, i) => printer.instant('n', `ledtråd ${page}:${i + 1} (${h.v ?? 'a'}): ${t}`));
      }
      for (const [name, spec] of Object.entries(c.cmds ?? {})) {
        printer.instant('n', `kommando ${name}:`);
        for (const s of spec.alt?.steps ?? []) show(s);
        for (const s of spec.steps ?? []) show(s);
      }
      for (const s of c.greet ?? []) show(s);
    }
    printer.instant('n', '── slut ──');
  }

  return async function handle(input) {
    const line = String(input).trim();
    if (!line) return;
    const head = line.split(/\s+/)[0];
    const name = cmdName(head);
    const rest = line.slice(head.length).trim();
    const args = rest ? rest.split(/\s+/) : [];

    // Kommandon som definieras av innehållet (dolda kommandon och deras varianter).
    const custom = story.cmds();
    const customKey = name === 'kill' ? (args[0] ? 'kill ' + cmdName(args[0]) : 'kill') : name;
    const spec = custom[customKey] ?? (name === 'kill' ? custom['kill'] : undefined);
    if (spec && !['svar', 'hjalp'].includes(name)) return runCustom(customKey, spec);

    try {
      switch (name) {
        case 'hjalp': {
          for (const h of story.help()) {
            if (h.tool && !has(h.tool)) continue;
            await printer.line(h.v ?? 'a', h.d ? `${h.c}  ${h.d}` : h.c);
          }
          return;
        }
        case 'svar':
          return await svar(args);
        case 'nycklar': {
          const keys = story.keys();
          const pages = Object.keys(keys);
          if (!pages.length) return say(story.msg('noKeys'));
          for (const p of pages) await say(`${p}  ${keys[p]}`);
          return;
        }
        case 'nyckel':
          if (!rest) return syntax('nyckel');
          return await say(evalNyckel(rest, story.keys()));
        case 'meddelanden':
          return await replay(ctx);
        case 'ledtrad':
          return args[0] ? await hint(ctx, args[0]) : await hintList(ctx);
        case 'rensa':
          printer.clear();
          return;
        case 'test':
          if (ctx.testMode) return await test(args);
          break;
      }

      if (TOOLS.includes(name) && has(name)) {
        switch (name) {
          case 'bas':
            if (args.length !== 3) return syntax('bas');
            return await num(bas(args[0], args[1], args[2]));
          case 'ascii': {
            if (!rest) return syntax('ascii');
            const r = ascii(rest);
            return r.mode === 'text' ? await say(r.text) : await num(r.values.join(' '));
          }
          case 'xor': {
            const m = /(?:^|\s)--?nyckel(?:\s+|=)(.*)$/i.exec(rest);
            if (!m) return syntax('xor');
            const key = m[1].trim();
            const r = xor(rest.slice(0, m.index), key);
            await say(r.text);
            if (!r.printable) await num(r.values.join(' '));
            await tryXorLocks(key);
            return;
          }
          case 'powmod':
            if (args.length !== 3) return syntax('powmod');
            return await num(powmod(args[0], args[1], args[2]).toString());
          case 'modinv': {
            if (args.length !== 2) return syntax('modinv');
            const r = modinv(args[0], args[1]);
            return r == null ? await say(story.msg('noInverse')) : await num(r.toString());
          }
        }
      }
    } catch (e) {
      return toolError(e, name);
    }
    return error('unknown');
  };
}
