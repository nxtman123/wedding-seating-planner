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
  return normalize({
    ...doc,
    guests: [...doc.guests, guest],
    order: [...doc.order, guest.id],
  });
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
  return normalize({
    ...doc,
    guests: [...doc.guests, ...added],
    order: [...doc.order, ...added.map((g) => g.id)],
  });
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
  return normalize({
    ...doc,
    guests: doc.guests.filter((g) => !going.has(g.id)),
    pairings: doc.pairings.filter((p) => !going.has(p.a) && !going.has(p.b)),
    pins,
    tables: doc.tables.map((t) => t.filter((id) => !going.has(id))),
    order: doc.order.filter((id) => !going.has(id)),
  });
}

/** Look up a display name, falling back for ids that no longer exist. */
export function guestName(doc: SeatingDoc, id: string): string {
  return doc.guests.find((g) => g.id === id)?.name || 'Unknown guest';
}

/* -------------------------------------------------------------------------- */
/*  Groups and list order                                                      */
/* -------------------------------------------------------------------------- */

/** Whether this guest sits loose, i.e. under no surviving group. */
function isLoose(guest: Guest, groupIds: Set<string>): boolean {
  return guest.groupId === null || !groupIds.has(guest.groupId);
}

/**
 * Repair the list's bookkeeping: `order` holds every group and every loose
 * guest exactly once and nothing else, and `guests` is flattened to the sequence
 * `order` draws. Entries keep the positions they had; anything new lands at the
 * end, anything stale is dropped.
 *
 * Every operation that changes membership, grouping or order ends here, so the
 * two arrays cannot drift apart.
 */
export function normalize(doc: SeatingDoc): SeatingDoc {
  const groupIds = new Set(doc.groups.map((g) => g.id));
  const byId = new Map(doc.guests.map((g) => [g.id, g]));
  const looseIds = doc.guests
    .filter((g) => isLoose(g, groupIds))
    .map((g) => g.id);
  const loose = new Set(looseIds);

  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of doc.order ?? []) {
    if (seen.has(id) || !(groupIds.has(id) || loose.has(id))) continue;
    order.push(id);
    seen.add(id);
  }
  for (const g of doc.groups) if (!seen.has(g.id)) order.push(g.id), seen.add(g.id);
  for (const id of looseIds) if (!seen.has(id)) order.push(id), seen.add(id);

  const guests: Guest[] = [];
  for (const id of order) {
    if (groupIds.has(id)) {
      guests.push(...doc.guests.filter((g) => g.groupId === id));
    } else {
      const guest = byId.get(id);
      if (guest) guests.push(guest);
    }
  }
  return { ...doc, order, guests };
}

/** The guests under a group, or the loose ones when given null. */
export function groupMembers(doc: SeatingDoc, groupId: string | null): Guest[] {
  const groupIds = new Set(doc.groups.map((g) => g.id));
  return doc.guests.filter((g) =>
    groupId === null ? isLoose(g, groupIds) : g.groupId === groupId,
  );
}

/**
 * Add an empty group at the top of the list, where it is in sight and ready to
 * be filled rather than stranded below everyone. It comes named "Group N" for
 * the lowest N not already taken, so the heading has something to show until it
 * is renamed, and adding several does not produce a pile of duplicates.
 */
export function addGroup(doc: SeatingDoc): SeatingDoc {
  const taken = new Set(doc.groups.map((g) => g.name));
  let n = 1;
  while (taken.has(`Group ${n}`)) n++;
  const group: Group = { id: uid(), name: `Group ${n}` };
  return normalize({
    ...doc,
    groups: [...doc.groups, group],
    order: [group.id, ...doc.order],
  });
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

/**
 * Remove a group. Its members are turned loose rather than deleted, and take the
 * group's place in the list so they stay where they were on screen.
 */
export function removeGroup(doc: SeatingDoc, id: string): SeatingDoc {
  const members = doc.guests.filter((g) => g.groupId === id).map((g) => g.id);
  return normalize({
    ...doc,
    groups: doc.groups.filter((g) => g.id !== id),
    guests: doc.guests.map((g) =>
      g.groupId === id ? { ...g, groupId: null } : g,
    ),
    order: doc.order.flatMap((entry) => (entry === id ? members : [entry])),
  });
}

/** Slide a block of entries so they sit together before `index` in `order`. */
function placeEntries(
  order: string[],
  block: string[],
  index: number,
): string[] {
  const moving = new Set(block);
  // Lifting them out shifts the insertion point up by however many were above.
  const above = order.slice(0, index).filter((id) => moving.has(id)).length;
  const rest = order.filter((id) => !moving.has(id));
  const at = Math.max(0, Math.min(rest.length, index - above));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/**
 * Turn guests loose and drop them into the list before top-level position
 * `index`. This is how a guest leaves a group, and how loose guests reorder.
 */
export function moveGuestsToList(
  doc: SeatingDoc,
  ids: string[],
  index: number,
): SeatingDoc {
  const moving = new Set(ids);
  if (moving.size === 0) return doc;
  const guests = doc.guests.map((g) =>
    moving.has(g.id) ? { ...g, groupId: null } : g,
  );
  const block = guests.filter((g) => moving.has(g.id)).map((g) => g.id);
  return normalize({
    ...doc,
    guests,
    order: placeEntries(doc.order, block, index),
  });
}

/** Move a group so its section sits before top-level position `index`. */
export function moveGroupToList(
  doc: SeatingDoc,
  id: string,
  index: number,
): SeatingDoc {
  if (!doc.groups.some((g) => g.id === id)) return doc;
  return normalize({ ...doc, order: placeEntries(doc.order, [id], index) });
}

/**
 * Put guests under a group, sitting before position `index` among its members.
 * `index` counts against the members the group has now, which is what the drop
 * points the list offers are measured against.
 */
export function moveGuestsIntoGroup(
  doc: SeatingDoc,
  ids: string[],
  groupId: string,
  index: number,
): SeatingDoc {
  const moving = new Set(ids);
  if (moving.size === 0) return doc;
  const before = doc.guests.filter((g) => g.groupId === groupId);
  const above = before.slice(0, index).filter((g) => moving.has(g.id)).length;

  const guests = doc.guests.map((g) =>
    moving.has(g.id) ? { ...g, groupId } : g,
  );
  const block = guests.filter((g) => moving.has(g.id));
  const rest = guests.filter((g) => g.groupId === groupId && !moving.has(g.id));
  const at = Math.max(0, Math.min(rest.length, index - above));
  const members = [...rest.slice(0, at), ...block, ...rest.slice(at)];

  // normalize rebuilds the flattened list; it only needs the members' relative
  // order to be right, so parking them at the end is enough.
  return normalize({
    ...doc,
    guests: [...guests.filter((g) => g.groupId !== groupId), ...members],
  });
}

/**
 * Put ticked guests under a group, at the end of it. Backs the heading's "Add to
 * group", where no position is being pointed at.
 */
export function assignToGroup(
  doc: SeatingDoc,
  ids: string[],
  groupId: string,
): SeatingDoc {
  const held = doc.guests.filter((g) => g.groupId === groupId).length;
  return moveGuestsIntoGroup(doc, ids, groupId, held);
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
