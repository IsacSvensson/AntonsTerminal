// Utskrift: röster, skrivanimation och effekter.
//   a = huvudröst (Codex, skrivs tecken för tecken)
//   b = andra rösten (blå monospace, ojämn takt)
//   p = klartext, rad för rad
//   u = det användaren skrev
//   e = fel i klartext
//   n = tal och verktygsutdata i monospace

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const CHAR_MS = 35;

export class Printer {
  constructor(out, scroller) {
    this.out = out;
    this.scroller = scroller;
    this.fast = false; // ingen skrivanimation
    this.skipLine = false; // avsluta aktuell rad direkt
    this.skipAll = false; // skriv ut resten direkt
    this.flicker = null; // { every } – kort flimmer i huvudrösten
    this.aCount = 0;
    this.assetLoader = null; // async (steg) => { gif, qrc } som blob-URL:er
    this.reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  get instantMode() {
    return this.fast || this.skipAll;
  }

  scroll() {
    this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  wait(ms) {
    return sleep(this.instantMode ? Math.min(ms, 30) : ms);
  }

  element(voice, extra = '') {
    const d = document.createElement('div');
    d.className = 'ln v' + voice + (extra ? ' ' + extra : '');
    this.out.append(d);
    return d;
  }

  clear() {
    this.out.replaceChildren();
  }

  /** Skriver en rad direkt, utan animation. */
  instant(voice, text, step = {}) {
    const el = this.element(voice, step.cls);
    el.append(text ?? '');
    this.appendLink(el, step);
    this.scroll();
    return el;
  }

  appendLink(el, step) {
    if (!step.link) return;
    const a = document.createElement('a');
    a.href = step.link.href;
    a.textContent = step.link.t;
    a.target = '_blank';
    a.rel = 'noopener';
    el.append(a);
  }

  /** Skriver en rad i given röst. */
  async line(voice, text, step = {}) {
    this.skipLine = false;
    text = String(text ?? '');
    let el;
    if (this.instantMode || step.flash || voice === 'u' || voice === 'e' || voice === 'n') {
      el = this.instant(voice, step.cut ? text.slice(0, Math.floor(text.length * step.cut)) : text, step);
    } else if (voice === 'p') {
      el = this.instant(voice, text, { ...step, cls: 'fadein' });
      await this.wait(step.pause ?? 900);
    } else {
      el = this.element(voice, step.cls);
      const node = document.createTextNode('');
      el.append(node);
      await (voice === 'b' ? this.typeUneven(node, text, step) : this.typeEven(node, el, text, step));
      this.appendLink(el, step);
      this.scroll();
    }
    if (step.flash) {
      await sleep(step.flash);
      el.remove();
      return null;
    }
    if (voice === 'a' && this.flicker && !step.cut) {
      this.aCount++;
      if (this.aCount % this.flicker.every === 0) this.flick(el);
    }
    return el;
  }

  async typeEven(node, el, text, step) {
    const chars = Array.from(text);
    const stop = step.cut ? Math.max(1, Math.floor(chars.length * step.cut)) : chars.length;
    for (let i = 0; i < stop; i++) {
      if (this.skipLine || this.instantMode) {
        node.data = chars.slice(0, stop).join('');
        break;
      }
      node.data += chars[i];
      if (i % 4 === 0) this.scroll();
      await sleep(CHAR_MS);
    }
    if (step.cut && stop < chars.length) {
      // raden bryts mitt i ett tecken
      const half = document.createElement('span');
      half.className = 'cut';
      half.textContent = chars[stop];
      el.append(half);
    }
  }

  async typeUneven(node, text) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const ch of Array.from(text)) {
      if (this.skipLine || this.instantMode) {
        node.data = text;
        return;
      }
      if (/\S/.test(ch) && Math.random() < 0.05) {
        node.data += pick(letters);
        await sleep(rand(90, 150));
        node.data = node.data.slice(0, -1);
        await sleep(rand(50, 90));
      }
      node.data += ch;
      this.scroll();
      await sleep(ch === ' ' ? rand(60, 160) : rand(28, 95));
    }
  }

  /** Ett eller två ord blinkar kort i den andra röstens stil. */
  async flick(el) {
    const text = el.textContent;
    const words = text.split(/(\s+)/);
    const idx = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const chosen = new Set([pick(idx)]);
    if (idx.length > 3 && Math.random() < 0.5) chosen.add(pick(idx));
    el.replaceChildren(
      ...words.map((w, i) => {
        if (!chosen.has(i)) return document.createTextNode(w);
        const s = document.createElement('span');
        s.className = 'flk';
        s.textContent = w;
        return s;
      }),
    );
    await sleep(rand(100, 150));
    el.querySelectorAll('.flk').forEach((s) => s.classList.remove('flk'));
  }

  /** Glitch: rader förskjuts, tecken byter skrift, en inverterad bildruta. */
  async glitch(ms = 1500) {
    const body = document.body;
    if (this.reduced) {
      body.classList.add('glitch-soft');
      await sleep(Math.min(ms, 700));
      body.classList.remove('glitch-soft');
      return;
    }
    const lines = [...this.out.children].slice(-40);
    const reset = () =>
      lines.forEach((l) => {
        l.style.transform = '';
        l.classList.remove('lat');
      });
    const t0 = performance.now();
    let inverted = false;
    while (performance.now() - t0 < ms) {
      reset();
      for (let k = 0; k < Math.min(5, lines.length); k++) {
        const l = pick(lines);
        l.style.transform = `translateX(${Math.round(rand(-14, 14))}px)`;
        if (Math.random() < 0.5) l.classList.add('lat');
      }
      if (!inverted && performance.now() - t0 > ms * 0.45) {
        inverted = true;
        body.classList.add('inv');
        await sleep(90);
        body.classList.remove('inv');
      }
      await sleep(rand(45, 90));
    }
    reset();
  }

  /** Förvandling: varje tecken i huvudrösten byter skrift, ett i taget i slumpad ordning. */
  async transform(ms = 5000) {
    const spans = [];
    for (const line of this.out.querySelectorAll('.va')) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const frag = document.createDocumentFragment();
        for (const ch of Array.from(node.data)) {
          if (/\s/.test(ch)) {
            frag.append(ch);
          } else {
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = ch;
            frag.append(s);
            spans.push(s);
          }
        }
        node.replaceWith(frag);
      }
    }
    for (let i = spans.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spans[i], spans[j]] = [spans[j], spans[i]];
    }
    document.body.classList.add('merging');
    const total = this.fast ? 300 : ms;
    const t0 = performance.now();
    let done = 0;
    while (done < spans.length) {
      const target = Math.min(spans.length, Math.ceil((spans.length * (performance.now() - t0)) / total));
      for (; done < target; done++) spans[done].classList.add('lat');
      await sleep(16);
    }
    await sleep(this.fast ? 0 : 400);
    document.body.classList.add('plain');
    document.body.classList.remove('merging');
  }

  async asset(step) {
    const box = this.element('x', 'asset');
    const img = document.createElement('img');
    img.alt = step.alt ?? '';
    img.className = 'qr';
    const a = document.createElement('a');
    a.className = 'dl';
    a.textContent = step.label ?? '↓';
    a.download = step.dl ?? 'fil';
    box.append(img, a);
    this.scroll();
    try {
      const urls = await this.assetLoader(step);
      if (urls.gif) {
        img.src = urls.gif;
        await img.decode().catch(() => {});
      } else img.remove();
      if (urls.qrc) a.href = urls.qrc;
      else a.remove();
    } catch {
      img.remove();
      a.remove();
    }
    this.scroll();
    if (step.note) await this.line('b', step.note);
  }

  /** Kör en lista steg från innehållet. replay = skriv ut direkt och hoppa över effekter. */
  async run(steps, { replay = false } = {}) {
    for (const s of steps ?? []) {
      if (s.fx) {
        if (s.fx === 'asset') await this.asset(s);
        else if (replay) continue;
        else if (s.fx === 'wait') await this.wait(s.ms ?? 500);
        else if (s.fx === 'glitch') await this.glitch(s.ms);
        else if (s.fx === 'transform') await this.transform(s.ms);
        else if (s.fx === 'logo') await this.onLogo?.(s);
      } else if (replay) {
        if (!s.flash) this.instant(s.v, s.cut ? s.t.slice(0, Math.floor(s.t.length * s.cut)) : s.t, s);
      } else {
        await this.line(s.v, s.t, s);
      }
    }
  }
}
