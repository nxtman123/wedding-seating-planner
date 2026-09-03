import { uid } from './defaults';
import type { Guest, PairingLevel, SeatingDoc } from './types';

/* -------------------------------------------------------------------------- */
/*  Guests                                                                     */
/* -------------------------------------------------------------------------- */

/** Append one guest. A blank or whitespace-only name is ignored. */
export function addGuest(doc: SeatingDoc, name: string): SeatingDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return { ...doc, guests: [...doc.guests, { id: uid(), name: trimmed }] };
}

/**
 * Append every non-blank line of a pasted list. Names already on the list are
 * skipped, so re-pasting an updated list only adds what is new.
 */
export function addGuestsFromText(doc: SeatingDoc, text: string): SeatingDoc {
  const existing = new Set(doc.guests.map((g) => g.name.toLowerCase()));
  const added: Guest[] = [];
  for (const line of text.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    added.push({ id: uid(), name });
  }
  if (added.length === 0) return doc;
  return { ...doc, guests: [...doc.guests, ...added] };
}

export function renameGuest(
  doc: SeatingDoc,
  id: string,
  name: string,
): SeatingDoc {
  return {
    ...doc,
    guests: doc.guests.map((g) => (g.id === id ? { ...g, name } : g)),
  };
}

/** Remove a guest along with every pairing, pin and seat that referenced them. */
export function removeGuest(doc: SeatingDoc, id: string): SeatingDoc {
  const pins = { ...doc.pins };
  delete pins[id];
  return {
    ...doc,
    guests: doc.guests.filter((g) => g.id !== id),
    pairings: doc.pairings.filter((p) => p.a !== id && p.b !== id),
    pins,
    tables: doc.tables.map((t) => t.filter((g) => g !== id)),
  };
}

/** Look up a display name, falling back for ids that no longer exist. */
export function guestName(doc: SeatingDoc, id: string): string {
  return doc.guests.find((g) => g.id === id)?.name || 'Unknown guest';
}

/* -------------------------------------------------------------------------- */
/*  Pairings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Add a pairing between two guests. Self-pairings are rejected, and because a
 * pairing is unordered, re-adding an existing pair just changes its level
 * rather than creating a duplicate.
 */
export function addPairing(
  doc: SeatingDoc,
  a: string,
  b: string,
  level: PairingLevel,
): SeatingDoc {
  if (!a || !b || a === b) return doc;
  const existing = doc.pairings.find(
    (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
  );
  if (existing) return setPairingLevel(doc, existing.id, level);
  return { ...doc, pairings: [...doc.pairings, { id: uid(), a, b, level }] };
}

export function setPairingLevel(
  doc: SeatingDoc,
  id: string,
  level: PairingLevel,
): SeatingDoc {
  return {
    ...doc,
    pairings: doc.pairings.map((p) => (p.id === id ? { ...p, level } : p)),
  };
}

export function removePairing(doc: SeatingDoc, id: string): SeatingDoc {
  return { ...doc, pairings: doc.pairings.filter((p) => p.id !== id) };
}

/** Strongest pull first, then weaker pulls, then pushes ending at "must not". */
export function sortedPairings(doc: SeatingDoc) {
  const rank = (level: PairingLevel) => (level > 0 ? level : 10 - level);
  return [...doc.pairings].sort((x, y) => rank(x.level) - rank(y.level));
}

/* -------------------------------------------------------------------------- */
/*  Room and pins                                                              */
/* -------------------------------------------------------------------------- */

export function setSeatsPerTable(doc: SeatingDoc, seats: number): SeatingDoc {
  const clamped = Math.max(1, Math.min(20, Math.round(seats) || 1));
  return { ...doc, seatsPerTable: clamped };
}

export function setExtraTables(doc: SeatingDoc, extra: number): SeatingDoc {
  const clamped = Math.max(0, Math.min(50, Math.round(extra) || 0));
  return { ...doc, extraTables: clamped };
}

/** Lock a guest to the table they are currently seated at. */
export function setPin(
  doc: SeatingDoc,
  guestId: string,
  tableIndex: number,
): SeatingDoc {
  return { ...doc, pins: { ...doc.pins, [guestId]: tableIndex } };
}

export function clearPin(doc: SeatingDoc, guestId: string): SeatingDoc {
  const pins = { ...doc.pins };
  delete pins[guestId];
  return { ...doc, pins };
}

export function clearAllPins(doc: SeatingDoc): SeatingDoc {
  return { ...doc, pins: {} };
}

/**
 * Guest id -> how many pairings they appear in, split by direction. Guests with
 * no pairings are present with zeroes, so callers can look up any guest.
 */
export function pairingCounts(
  doc: SeatingDoc,
): Map<string, { together: number; apart: number }> {
  const counts = new Map<string, { together: number; apart: number }>();
  for (const g of doc.guests) counts.set(g.id, { together: 0, apart: 0 });
  for (const p of doc.pairings) {
    for (const id of [p.a, p.b]) {
      const c = counts.get(id);
      if (!c) continue;
      if (p.level > 0) c.together++;
      else c.apart++;
    }
  }
  return counts;
}
