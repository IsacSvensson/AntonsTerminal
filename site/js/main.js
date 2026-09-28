import { loadState, saveState } from './state.js';
import { Printer } from './render.js';
import { Shell } from './shell.js';
import { Story, applyMode } from './events.js';
import { makeHandler } from './commands.js';

const $ = (s) => document.querySelector(s);

/**
 * Håller terminalen inom det synliga området när mobilens tangentbord är uppe.
 * (iOS Safari och Chrome krymper bara den synliga ytan, inte layouten, så inmatningen hamnar annars bakom
 * tangentbordet.)
 */
function fitToVisualViewport(term, screen) {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  let frame = 0;
  const apply = () => {
    frame = 0;
    const atBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 40;
    term.style.height = `${vv.height}px`;
    term.style.transform = `translateY(${vv.offsetTop}px)`;
    if (atBottom) screen.scrollTop = screen.scrollHeight;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  $('#in').addEventListener('focus', () => setTimeout(schedule, 300));
  apply();
}

async function boot() {
  const screen = $('#screen');
  fitToVisualViewport($('#term'), screen);
  const printer = new Printer($('#out'), screen);
  const testMode = location.hash === '#test';
  try {
    if (testMode && sessionStorage.getItem('cc2-fast')) printer.fast = true;
    if (testMode && sessionStorage.getItem('cc2-latin')) document.body.classList.add('latin');
  } catch {
    /* ignorera */
  }

  let enc;
  try {
    const res = await fetch('data/content.enc.json', { cache: 'no-cache' });
    enc = await res.json();
  } catch {
    printer.instant('e', '…');
    return;
  }

  const state = loadState();
  const story = new Story(enc, state);
  await story.restore();
  const ctx = { state, story, printer, testMode };
  printer.assetLoader = (step) => story.loadAsset(step);
  applyMode(ctx);

  const handle = makeHandler(ctx);
  const shell = new Shell({ form: $('#line'), input: $('#in'), screen, printer, onCommand: handle });

  shell.enqueue(async () => {
    if (!state.events.includes('intro')) {
      await printer.run(story.pub.intro);
      state.events.push('intro');
      saveState(state);
    } else {
      await printer.run(story.greet());
    }
  });
  document.body.classList.add('ready');
  $('#in').focus({ preventScroll: true });
}

boot();
