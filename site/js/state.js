// Tillstånd i localStorage under "cc2". Allt i try/catch: utan lagring körs terminalen ändå, utan minne.

const KEY = 'cc2';

export function emptyState() {
  return {
    v: 1,
    solved: [], // [[låsId, nyckel i base64], …] i den ordning de löstes
    unlocked: [], // upplåsta verktyg
    errors: 0,
    events: [], // körda händelser
    hints: {}, // sida → { n: antal nivåer, t: tidpunkt för senaste }
    counters: {}, // räknare för kommandon med varianter
  };
}

export function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return emptyState();
    return { ...emptyState(), ...s };
  } catch {
    return emptyState();
  }
}

export function saveState(s) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ingen lagring – fortsätt utan minne */
  }
}

export function clearState() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignorera */
  }
}

export const isSolved = (s, id) => s.solved.some(([k]) => k === id);
export const keyOf = (s, id) => s.solved.find(([k]) => k === id)?.[1] ?? null;
