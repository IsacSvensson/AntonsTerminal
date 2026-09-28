// Huvudfältet: emblem, ärenderad, T+-klocka och progressrad.
// Allt som ändras under jakten (emblemets geometri, ärenderaden, färgen på ett segment, klockans slut)
// kommer från innehållet; här finns bara det generiska.

const SVG = 'http://www.w3.org/2000/svg';
const NONACCI_CELL = 17; // px per tecken (arket är 16×16 rutor)

const pad2 = (n) => String(n).padStart(2, '0');

/** Sekunder → fyra siffror i bas 256 (mest signifikant först). */
export function base256(sec) {
  const s = Math.max(0, Math.floor(sec)) >>> 0;
  return [(s >>> 24) & 255, (s >>> 16) & 255, (s >>> 8) & 255, s & 255];
}

/** Sekunder → "hh:mm:ss" (timmarna kan bli fler än 24). */
export function hms(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

export class Hud {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.gen = 0; // avbryter pågående animationer
    this.logo = root.querySelector('#logo');
    this.caseEl = root.querySelector('#case');
    this.digits = [...root.querySelectorAll('#clock .nonacci i')];
    this.plainClock = root.querySelector('#clock .tplain');
    this.progress = root.querySelector('#progress');
    this.reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** logo: 'static' = sätt direkt, 'animate' = glid/tänd, 'keep' = rör inte emblemet. */
  update({ logo = 'static', lines = true } = {}) {
    const { story } = this.ctx;
    if (lines) this.renderCase(story.latest('hud', story.pub.hud) ?? []);
    this.renderProgress(story.latest('progress', {}) ?? {});
    if (logo !== 'keep') this.setLogo(story.latest('logo', story.pub.logo), { animate: logo === 'animate' });
    this.tick();
  }

  renderCase(lines) {
    this.caseEl.replaceChildren(
      ...lines.map((segs) => {
        const row = document.createElement('div');
        row.className = 'case-line';
        for (const s of segs) {
          const span = document.createElement('span');
          span.className = 'h' + s.v;
          span.textContent = s.t;
          row.append(span);
        }
        return row;
      }),
    );
  }

  renderProgress(colors) {
    const { story } = this.ctx;
    const ids = Object.keys(story.pub.locks ?? {});
    if (this.progress.children.length !== ids.length) {
      this.progress.replaceChildren(
        ...ids.map((id) => {
          const seg = document.createElement('div');
          seg.className = 'seg';
          seg.dataset.id = id;
          seg.textContent = id;
          return seg;
        }),
      );
    }
    for (const seg of this.progress.children) {
      const id = seg.dataset.id;
      const c = colors[id] ?? (story.solved(id) ? 'brass' : 'open');
      seg.dataset.state = c;
    }
  }

  // ------------------------------------------------------------ emblemet

  /**
   * setLogo({circles:[{cx,cy,r,color,dash,flicker}], dots:[{cx,cy,r}], morphMs, dotMs})
   * Utan animation sätts läget direkt. Med animation glider cirklarna (index mot index) till sina nya lägen,
   * nya cirklar tonas in, överflödiga tonas ut, och punkterna tänds en i taget efteråt.
   */
  setLogo(spec, { animate = false } = {}) {
    if (!spec) return;
    const gen = ++this.gen;
    const fast = this.ctx.printer?.fast;
    const circles = spec.circles ?? [];
    const dots = spec.dots ?? [];
    const morphMs = !animate ? 0 : fast ? 150 : (spec.morphMs ?? 1000);
    const dotMs = !animate ? 0 : fast ? 40 : (spec.dotMs ?? 600);

    const old = [...this.logo.querySelectorAll('circle.ring')];
    const from = old.map((el) => ({
      cx: +el.getAttribute('cx'),
      cy: +el.getAttribute('cy'),
      r: +el.getAttribute('r'),
    }));
    // punkterna tas bort direkt och tänds på nytt
    this.logo.querySelectorAll('circle.dot').forEach((el) => el.remove());

    const els = circles.map((c, i) => {
      let el = old[i];
      if (!el) {
        el = document.createElementNS(SVG, 'circle');
        el.setAttribute('class', 'ring');
        el.setAttribute('cx', c.cx);
        el.setAttribute('cy', c.cy);
        el.setAttribute('r', c.r);
        if (morphMs) el.style.opacity = '0';
        this.logo.append(el);
      }
      el.classList.toggle('blue', c.color === 'blue');
      el.classList.toggle('dash', !!c.dash);
      el.classList.toggle('flicker', !!c.flicker);
      return el;
    });
    for (const el of old.slice(circles.length)) {
      if (morphMs) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), morphMs);
      } else el.remove();
    }

    const place = (t) => {
      circles.forEach((c, i) => {
        const a = from[i] ?? c;
        const k = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
        els[i].setAttribute('cx', (a.cx + (c.cx - a.cx) * k).toFixed(2));
        els[i].setAttribute('cy', (a.cy + (c.cy - a.cy) * k).toFixed(2));
        els[i].setAttribute('r', (a.r + (c.r - a.r) * k).toFixed(2));
      });
    };

    const lightDots = () => {
      dots.forEach((d, i) => {
        const on = () => {
          if (gen !== this.gen) return;
          const el = document.createElementNS(SVG, 'circle');
          el.setAttribute('class', 'dot');
          el.setAttribute('cx', d.cx);
          el.setAttribute('cy', d.cy);
          el.setAttribute('r', d.r);
          this.logo.append(el);
        };
        if (!dotMs || this.reduced) on();
        else setTimeout(on, dotMs * (i + 1));
      });
    };

    if (!morphMs) {
      place(1);
      els.forEach((el) => (el.style.opacity = ''));
      lightDots();
      return;
    }
    if (this.reduced) {
      // mildare: tona över i stället för att glida
      this.logo.classList.add('fading');
      setTimeout(() => {
        if (gen !== this.gen) return;
        place(1);
        els.forEach((el) => (el.style.opacity = ''));
        this.logo.classList.remove('fading');
        lightDots();
      }, 300);
      return;
    }
    requestAnimationFrame(() => els.forEach((el) => (el.style.opacity = '')));
    const t0 = performance.now();
    const frame = (now) => {
      if (gen !== this.gen) return;
      const t = Math.min(1, (now - t0) / morphMs);
      place(t);
      if (t < 1) requestAnimationFrame(frame);
      else lightDots();
    };
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ klockan

  tick() {
    const { state, story } = this.ctx;
    const clock = story.latest('clock', null);
    const start = state.startedAt;
    const end = state.finishedAt ?? Date.now();
    const sec = start ? (end - start) / 1000 : 0;
    base256(sec).forEach((v, i) => {
      const el = this.digits[i];
      el.style.backgroundPosition = `-${(v % 16) * NONACCI_CELL}px -${Math.floor(v / 16) * NONACCI_CELL}px`;
      el.dataset.v = String(v);
    });
    const plain = !!(clock?.plain && state.finishedAt && document.body.classList.contains('plain'));
    this.plainClock.hidden = !plain;
    if (plain) this.plainClock.textContent = `T+ ${hms(sec)}`;
    this.root.dataset.clock = state.finishedAt ? 'stopped' : start ? 'running' : 'idle';
    this.root.dataset.seconds = String(Math.floor(sec));
  }
}
