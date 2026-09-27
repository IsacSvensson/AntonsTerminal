import { loadState, saveState } from './state.js';
import { Printer } from './render.js';
import { Shell } from './shell.js';
import { Story, applyMode } from './events.js';
import { makeHandler } from './commands.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  const screen = $('#screen');
  const printer = new Printer($('#out'), screen);
  const testMode = location.hash === '#test';
  try {
    if (testMode && sessionStorage.getItem('cc2-fast')) printer.fast = true;
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
