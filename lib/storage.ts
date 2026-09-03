import {
  DEFAULT_SEATS_PER_TABLE,
  defaultDoc,
  isPairingLevel,
  uid,
} from './defaults';
import type { Pairing, SeatingDoc } from './types';

const KEY = 'wedding-seating/v1';

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural check on anything coming out of localStorage or an imported file,
 * so a stale or hand-edited document can't crash the app.
 */
export function isDoc(value: unknown): value is SeatingDoc {
  if (!isRecord(value)) return false;
  const { guests, pairings, seatsPerTable, extraTables, pins, tables } = value;

  if (!Array.isArray(guests)) return false;
  const ids = new Set<string>();
  for (const g of guests) {
    if (!isRecord(g)) return false;
    if (typeof g.id !== 'string' || typeof g.name !== 'string') return false;
    ids.add(g.id);
  }

  if (!Array.isArray(pairings)) return false;
  for (const p of pairings) {
    if (!isRecord(p)) return false;
    if (typeof p.id !== 'string') return false;
    if (typeof p.a !== 'string' || typeof p.b !== 'string') return false;
    if (!isPairingLevel(p.level)) return false;
  }

  if (typeof seatsPerTable !== 'number' || !Number.isFinite(seatsPerTable)) {
    return false;
  }
  if (typeof extraTables !== 'number' || !Number.isFinite(extraTables)) {
    return false;
  }

  if (!isRecord(pins)) return false;
  for (const v of Object.values(pins)) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return false;
  }

  if (!Array.isArray(tables)) return false;
  for (const t of tables) {
    if (!Array.isArray(t)) return false;
    if (t.some((id) => typeof id !== 'string')) return false;
  }

  return true;
}

/**
 * Drop anything pointing at a guest that no longer exists, and clamp the room
 * settings. Cheap insurance for documents edited by hand.
 */
function sanitize(doc: SeatingDoc): SeatingDoc {
  const ids = new Set(doc.guests.map((g) => g.id));
  const pins: Record<string, number> = {};
  for (const [id, table] of Object.entries(doc.pins)) {
    if (ids.has(id) && table >= 0) pins[id] = table;
  }
  return {
    guests: doc.guests,
    pairings: doc.pairings.filter(
      (p) => p.a !== p.b && ids.has(p.a) && ids.has(p.b),
    ),
    seatsPerTable: Math.max(
      1,
      Math.min(20, Math.round(doc.seatsPerTable) || DEFAULT_SEATS_PER_TABLE),
    ),
    extraTables: Math.max(0, Math.min(50, Math.round(doc.extraTables) || 0)),
    pins,
    tables: doc.tables.map((t) => t.filter((id) => ids.has(id))),
  };
}

/* -------------------------------------------------------------------------- */
/*  localStorage                                                               */
/* -------------------------------------------------------------------------- */

export function loadDoc(): SeatingDoc {
  if (typeof window === 'undefined') return defaultDoc();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultDoc();
    const parsed: unknown = JSON.parse(raw);
    return isDoc(parsed) ? sanitize(parsed) : defaultDoc();
  } catch {
    return defaultDoc();
  }
}

export function saveDoc(doc: SeatingDoc): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/* -------------------------------------------------------------------------- */
/*  JSON export / import                                                       */
/* -------------------------------------------------------------------------- */

/** Trigger a JSON download of the guest list, pairings and current seating. */
export function exportDoc(doc: SeatingDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wedding-seating.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Give every guest a fresh id and rewrite the pairings, pins and seating that
 * referenced the old ones, so an imported file can never collide with ids
 * already in memory.
 */
function reIdDoc(doc: SeatingDoc): SeatingDoc {
  const remap = new Map<string, string>();
  const guests = doc.guests.map((g) => {
    const id = uid();
    remap.set(g.id, id);
    return { ...g, id };
  });
  const pairings: Pairing[] = doc.pairings.map((p) => ({
    ...p,
    id: uid(),
    a: remap.get(p.a) ?? p.a,
    b: remap.get(p.b) ?? p.b,
  }));
  const pins: Record<string, number> = {};
  for (const [id, table] of Object.entries(doc.pins)) {
    const next = remap.get(id);
    if (next) pins[next] = table;
  }
  return {
    ...doc,
    guests,
    pairings,
    pins,
    tables: doc.tables.map((t) =>
      t.map((id) => remap.get(id)).filter((id): id is string => !!id),
    ),
  };
}

/** Parse an imported file's text into a document, throwing on bad shape. */
export function parseDocFile(text: string): SeatingDoc {
  const parsed: unknown = JSON.parse(text);
  if (!isDoc(parsed)) {
    throw new Error('File does not contain a guest list and pairings.');
  }
  return reIdDoc(sanitize(parsed));
}
