import {
  DEFAULT_SEATS_PER_TABLE,
  MAX_SEATS_PER_TABLE,
  defaultDoc,
  isPairingLevel,
  newTableSpec,
  uid,
} from './defaults';
import { normalize } from './guests';
import type {
  Group,
  Guest,
  Pairing,
  SeatingDoc,
  TableSpec,
} from './types';

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
  const { guests, pairings, pins, tables } = value;
  const { seatsPerTable, extraTables } = value as {
    seatsPerTable?: unknown;
    extraTables?: unknown;
  };

  if (!Array.isArray(guests)) return false;
  const ids = new Set<string>();
  for (const g of guests) {
    if (!isRecord(g)) return false;
    if (typeof g.id !== 'string' || typeof g.name !== 'string') return false;
    // Absent in documents saved before groups existed; sanitize fills it in.
    if (
      g.groupId !== undefined &&
      g.groupId !== null &&
      typeof g.groupId !== 'string'
    ) {
      return false;
    }
    ids.add(g.id);
  }

  const listOrder = (value as { order?: unknown }).order;
  if (listOrder !== undefined) {
    if (!Array.isArray(listOrder)) return false;
    if (listOrder.some((id) => typeof id !== 'string')) return false;
  }

  const groups = (value as { groups?: unknown }).groups;
  if (groups !== undefined) {
    if (!Array.isArray(groups)) return false;
    for (const g of groups) {
      if (!isRecord(g)) return false;
      if (typeof g.id !== 'string' || typeof g.name !== 'string') return false;
    }
  }

  if (!Array.isArray(pairings)) return false;
  for (const p of pairings) {
    if (!isRecord(p)) return false;
    if (typeof p.id !== 'string') return false;
    if (typeof p.a !== 'string' || typeof p.b !== 'string') return false;
    if (!isPairingLevel(p.level)) return false;
  }

  const names = (value as { tableNames?: unknown }).tableNames;
  if (names !== undefined) {
    if (!Array.isArray(names)) return false;
    // Holes are allowed — an unnamed table simply has none.
    if (names.some((n) => n !== null && n !== undefined && typeof n !== 'string')) {
      return false;
    }
  }

  const specs = (value as { tableSpecs?: unknown }).tableSpecs;
  if (specs !== undefined) {
    if (!Array.isArray(specs)) return false;
    for (const spec of specs) {
      if (!isRecord(spec)) return false;
      if (typeof spec.id !== 'string') return false;
      if (typeof spec.count !== 'number' || !Number.isFinite(spec.count)) {
        return false;
      }
      if (typeof spec.seats !== 'number' || !Number.isFinite(spec.seats)) {
        return false;
      }
    }
  }
  if (seatsPerTable !== undefined && typeof seatsPerTable !== 'number') {
    return false;
  }
  if (extraTables !== undefined && typeof extraTables !== 'number') {
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
 * The room, from whichever shape the document carries it in. Documents written
 * before the room had rows hold a seat size and a count of spare tables; those
 * become the single row they described. A document with neither gets a room big
 * enough for the guests it has, so nobody is left standing on load.
 */
function roomOf(
  doc: SeatingDoc & { seatsPerTable?: unknown; extraTables?: unknown },
  guestCount: number,
): TableSpec[] {
  if (Array.isArray(doc.tableSpecs) && doc.tableSpecs.length > 0) {
    return doc.tableSpecs.map((spec) => ({
      id: typeof spec.id === 'string' ? spec.id : uid(),
      count: Math.max(0, Math.min(200, Math.round(spec.count) || 0)),
      seats: Math.max(
        1,
        Math.min(MAX_SEATS_PER_TABLE, Math.round(spec.seats) || 1),
      ),
    }));
  }
  const seats =
    typeof doc.seatsPerTable === 'number' && doc.seatsPerTable >= 1
      ? Math.max(1, Math.min(MAX_SEATS_PER_TABLE, Math.round(doc.seatsPerTable)))
      : DEFAULT_SEATS_PER_TABLE;
  const spare =
    typeof doc.extraTables === 'number'
      ? Math.max(0, Math.min(50, Math.round(doc.extraTables)))
      : 0;
  const count = Math.max(1, Math.ceil(guestCount / seats)) + spare;
  return [{ ...newTableSpec(count, seats) }];
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
  // Documents predating groups have neither field; a groupId with no group left
  // to point at is turned loose rather than stranding the guest.
  const groups: Group[] = doc.groups ?? [];
  // Absent before the list could interleave groups; normalize rebuilds it.
  const order: string[] = Array.isArray(doc.order) ? doc.order : [];
  const known = new Set(groups.map((g) => g.id));
  const guests: Guest[] = doc.guests.map((g) => ({
    ...g,
    groupId: g.groupId && known.has(g.groupId) ? g.groupId : null,
  }));
  return normalize({
    guests,
    groups,
    order,
    pairings: doc.pairings.filter(
      (p) => p.a !== p.b && ids.has(p.a) && ids.has(p.b),
    ),
    tableSpecs: roomOf(doc, guests.length),
    tableNames: Array.isArray(doc.tableNames)
      ? doc.tableNames.map((n) => (typeof n === 'string' ? n : (undefined as never)))
      : [],
    pins,
    tables: doc.tables.map((t) => t.filter((id) => ids.has(id))),
  });
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
  const groupRemap = new Map<string, string>();
  const groups = doc.groups.map((g) => {
    const id = uid();
    groupRemap.set(g.id, id);
    return { ...g, id };
  });
  const remap = new Map<string, string>();
  const guests = doc.guests.map((g) => {
    const id = uid();
    remap.set(g.id, id);
    return {
      ...g,
      id,
      groupId: g.groupId ? (groupRemap.get(g.groupId) ?? null) : null,
    };
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
  const order = doc.order
    .map((id) => remap.get(id) ?? groupRemap.get(id))
    .filter((id): id is string => !!id);
  return {
    ...doc,
    guests,
    groups,
    order,
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
