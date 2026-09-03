import { uid } from './defaults';
import type { Group, Guest, Pairing, PairingLevel, SeatingDoc } from './types';

/* -------------------------------------------------------------------------- */
/*  Guests                                                                     */
/* -------------------------------------------------------------------------- */

/** Append one guest. A blank or whitespace-only name is ignored. */
export function addGuest(doc: SeatingDoc, name: string): SeatingDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const guest: Guest = { id: uid(), name: trimmed, groupId: null };
  return normalize({ ...doc, guests: [...doc.guests, guest] });
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
    added.push({ id: uid(), name, groupId: null });
  }
  if (added.length === 0) return doc;
  return normalize({ ...doc, guests: [...doc.guests, ...added] });
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

/** Remove guests along with every pairing, pin and seat that referenced them. */
export function removeGuests(doc: SeatingDoc, ids: string[]): SeatingDoc {
  const going = new Set(ids);
  if (going.size === 0) return doc;
  const pins = { ...doc.pins };
  for (const id of going) delete pins[id];
  return {
    ...doc,
    guests: doc.guests.filter((g) => !going.has(g.id)),
    pairings: doc.pairings.filter((p) => !going.has(p.a) && !going.has(p.b)),
    pins,
    tables: doc.tables.map((t) => t.filter((id) => !going.has(id))),
  };
}

/**
 * Move guests so they sit together before position `index`, where `index` is
 * counted against the list as it stands now — `guests.length` means the end.
 *
 * The guests need not be adjacent: they are lifted out of wherever they are and
 * land as one contiguous block, keeping their order relative to each other.
 * Lifting them out shifts the insertion point up by however many of them were
 * above it, which is what `above` corrects for.
 */
export function moveGuests(
  doc: SeatingDoc,
  ids: string[],
  index: number,
): SeatingDoc {
  const moving = new Set(ids);
  if (moving.size === 0) return doc;
  const target = Math.max(0, Math.min(doc.guests.length, index));
  const above = doc.guests
    .slice(0, target)
    .filter((g) => moving.has(g.id)).length;
  const block = doc.guests.filter((g) => moving.has(g.id));
  const rest = doc.guests.filter((g) => !moving.has(g.id));
  const at = target - above;
  return { ...doc, guests: [...rest.slice(0, at), ...block, ...rest.slice(at)] };
}

/** Look up a display name, falling back for ids that no longer exist. */
export function guestName(doc: SeatingDoc, id: string): string {
  return doc.guests.find((g) => g.id === id)?.name || 'Unknown guest';
}

/* -------------------------------------------------------------------------- */
/*  Groups                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Put `guests` back into the order the list draws: loose guests first, then each
 * group's members in `groups` order, everyone keeping their relative position.
 * A guest pointing at a group that no longer exists counts as loose.
 *
 * Every operation that changes membership or group order ends here, which is
 * what lets a position in the list be a plain index into `guests`.
 */
export function normalize(doc: SeatingDoc): SeatingDoc {
  const known = new Set(doc.groups.map((g) => g.id));
  const of = (groupId: string | null) =>
    doc.guests.filter((g) =>
      groupId === null
        ? g.groupId === null || !known.has(g.groupId)
        : g.groupId === groupId,
    );
  const guests = [...of(null), ...doc.groups.flatMap((g) => of(g.id))];
  return { ...doc, guests };
}

/** The guests under a group, or the loose ones when given null. */
export function groupMembers(doc: SeatingDoc, groupId: string | null): Guest[] {
  const known = new Set(doc.groups.map((g) => g.id));
  return doc.guests.filter((g) =>
    groupId === null
      ? g.groupId === null || !known.has(g.groupId)
      : g.groupId === groupId,
  );
}

/** Append a group. A blank name is ignored. */
export function addGroup(doc: SeatingDoc, name: string): SeatingDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const group: Group = { id: uid(), name: trimmed };
  return { ...doc, groups: [...doc.groups, group] };
}

export function renameGroup(
  doc: SeatingDoc,
  id: string,
  name: string,
): SeatingDoc {
  return {
    ...doc,
    groups: doc.groups.map((g) => (g.id === id ? { ...g, name } : g)),
  };
}

/** Remove a group. Its members are turned loose rather than deleted. */
export function removeGroup(doc: SeatingDoc, id: string): SeatingDoc {
  return normalize({
    ...doc,
    groups: doc.groups.filter((g) => g.id !== id),
    guests: doc.guests.map((g) =>
      g.groupId === id ? { ...g, groupId: null } : g,
    ),
  });
}

/** Move a group so it sits before position `index` among the groups. */
export function moveGroup(
  doc: SeatingDoc,
  id: string,
  index: number,
): SeatingDoc {
  const from = doc.groups.findIndex((g) => g.id === id);
  if (from < 0) return doc;
  const target = Math.max(0, Math.min(doc.groups.length, index));
  if (target === from || target === from + 1) return doc;
  const groups = [...doc.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(target > from ? target - 1 : target, 0, moved);
  return normalize({ ...doc, groups });
}

/**
 * Put guests under a group — or turn them loose with null — leaving them at the
 * end of wherever they land. Used by the group heading's "Add to group".
 */
export function assignToGroup(
  doc: SeatingDoc,
  ids: string[],
  groupId: string | null,
): SeatingDoc {
  const moving = new Set(ids);
  if (moving.size === 0) return doc;
  return normalize({
    ...doc,
    guests: doc.guests.map((g) =>
      moving.has(g.id) ? { ...g, groupId } : g,
    ),
  });
}

/**
 * Drop guests into a group at a given position in the list. `index` counts
 * against `guests` as it stands, the same as `moveGuests`, and must fall inside
 * the target group's run — which is what the drop points the list offers give.
 */
export function moveGuestsInto(
  doc: SeatingDoc,
  ids: string[],
  groupId: string | null,
  index: number,
): SeatingDoc {
  const moving = new Set(ids);
  if (moving.size === 0) return doc;
  const regrouped = {
    ...doc,
    guests: doc.guests.map((g) =>
      moving.has(g.id) ? { ...g, groupId } : g,
    ),
  };
  return normalize(moveGuests(regrouped, ids, index));
}

/* -------------------------------------------------------------------------- */
/*  Pairings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pairing between two guests, given in either order, or null if they have
 * none. Pairings are unordered, so this is the only correct way to look one up.
 */
export function findPairing(
  doc: SeatingDoc,
  a: string,
  b: string,
): Pairing | null {
  if (!a || !b || a === b) return null;
  return (
    doc.pairings.find(
      (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
    ) ?? null
  );
}

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
  const existing = findPairing(doc, a, b);
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
 * Everyone named in a pairing that touches the picked group: the picked guests
 * themselves, plus whoever those pairings reach out to. Exactly the guests
 * appearing in the two bands the pairing list floats to the top, so the guest
 * list can mark the same set.
 */
export function linkedGuests(
  doc: SeatingDoc,
  picked: string[],
): Set<string> {
  const chosen = new Set(picked);
  const linked = new Set<string>();
  if (chosen.size === 0) return linked;
  for (const p of doc.pairings) {
    if (!chosen.has(p.a) && !chosen.has(p.b)) continue;
    linked.add(p.a);
    linked.add(p.b);
  }
  return linked;
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

/* -------------------------------------------------------------------------- */
/*  Groups                                                                     */
/* -------------------------------------------------------------------------- */

/** How many unordered pairs a group of this size contains. */
export function pairCount(size: number): number {
  return size < 2 ? 0 : (size * (size - 1)) / 2;
}

/**
 * Give every pair within a group the same level — a clique, in graph terms.
 * Pairings the members already had between them are overwritten rather than
 * duplicated, so applying to a group is the last word on how its members relate.
 */
export function applyGroupLevel(
  doc: SeatingDoc,
  ids: string[],
  level: PairingLevel,
): SeatingDoc {
  const members = [...new Set(ids)];
  let next = doc;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      next = addPairing(next, members[i], members[j], level);
    }
  }
  return next;
}

/**
 * The pairs within a group that have no pairing yet, as `[a, b]` tuples. Backs
 * both the count of what filling the gaps would create and the filling itself.
 */
export function missingPairs(
  doc: SeatingDoc,
  ids: string[],
): [string, string][] {
  const members = [...new Set(ids)];
  const gaps: [string, string][] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (!findPairing(doc, members[i], members[j])) {
        gaps.push([members[i], members[j]]);
      }
    }
  }
  return gaps;
}

/**
 * Give the group's unpaired pairs a level, leaving every pairing the members
 * already have between them exactly as it was. The complement of
 * `applyGroupLevel`, which overwrites those instead.
 */
export function fillGroupLevel(
  doc: SeatingDoc,
  ids: string[],
  level: PairingLevel,
): SeatingDoc {
  let next = doc;
  for (const [a, b] of missingPairs(doc, ids)) {
    next = addPairing(next, a, b, level);
  }
  return next;
}

/**
 * The level every pair in a group already shares, or null when the group is
 * smaller than two, has a pair with no pairing, or mixes levels. Lets the form
 * show what a group agrees on instead of whatever level was last used.
 */
export function commonLevel(
  doc: SeatingDoc,
  ids: string[],
): PairingLevel | null {
  const members = [...new Set(ids)];
  if (members.length < 2) return null;
  let shared: PairingLevel | null = null;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const found = findPairing(doc, members[i], members[j]);
      if (!found) return null;
      if (shared === null) shared = found.level;
      else if (shared !== found.level) return null;
    }
  }
  return shared;
}
