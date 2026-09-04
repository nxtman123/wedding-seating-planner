import {
  MAX_SEATS_PER_TABLE,
  PAIRING_LEVELS,
  newTableSpec,
  uid,
} from './defaults';
import { tableSizes } from './solver';
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

/** "Group N" for the lowest N not already taken, so names never collide. */
function nextGroupName(doc: SeatingDoc): string {
  const taken = new Set(doc.groups.map((g) => g.name));
  let n = 1;
  while (taken.has(`Group ${n}`)) n++;
  return `Group ${n}`;
}

/**
 * Add a group, optionally taking guests straight into it. Those guests come
 * whatever group they were in before — a guest sits under one group at a time,
 * so gathering them here takes them out of there.
 *
 * The group lands where the first of those guests who was not already in one
 * sits, so it appears where the work was happening. With nobody to anchor it —
 * an empty group, or one poached entirely out of other groups — it goes to the
 * top, in sight rather than stranded below everyone.
 */
export function addGroup(
  doc: SeatingDoc,
  withGuests: string[] = [],
): SeatingDoc {
  const group: Group = { id: uid(), name: nextGroupName(doc) };
  const groupIds = new Set(doc.groups.map((g) => g.id));
  const taking = new Set(withGuests);
  const anchor = doc.guests.find(
    (g) => taking.has(g.id) && isLoose(g, groupIds),
  );
  const at = anchor ? Math.max(0, doc.order.indexOf(anchor.id)) : 0;
  const order = [...doc.order];
  order.splice(at, 0, group.id);

  const next = normalize({ ...doc, groups: [...doc.groups, group], order });
  return withGuests.length > 0
    ? assignToGroup(next, withGuests, group.id)
    : next;
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

/** Add a row to the room: N tables of M seats. */
export function addTableSpec(doc: SeatingDoc): SeatingDoc {
  return { ...doc, tableSpecs: [...doc.tableSpecs, newTableSpec()] };
}

/**
 * Change a row's table count or seat size. Both are clamped: a row of zero
 * tables is allowed, since it is a natural stop on the way to typing a number,
 * but a table of zero seats is not.
 */
export function setTableSpec(
  doc: SeatingDoc,
  id: string,
  patch: { count?: number; seats?: number },
): SeatingDoc {
  return {
    ...doc,
    tableSpecs: doc.tableSpecs.map((spec) =>
      spec.id === id
        ? {
            ...spec,
            count:
              patch.count === undefined
                ? spec.count
                : Math.max(0, Math.min(200, Math.round(patch.count) || 0)),
            seats:
              patch.seats === undefined
                ? spec.seats
                : Math.max(
                    1,
                    Math.min(
                      MAX_SEATS_PER_TABLE,
                      Math.round(patch.seats) || 1,
                    ),
                  ),
          }
        : spec,
    ),
  };
}

export function removeTableSpec(doc: SeatingDoc, id: string): SeatingDoc {
  return { ...doc, tableSpecs: doc.tableSpecs.filter((s) => s.id !== id) };
}

/** A table's name: whatever it was given, or its number. */
export function tableName(doc: SeatingDoc, index: number): string {
  return doc.tableNames[index] ?? `Table ${index + 1}`;
}

/**
 * Name a table. An empty name is kept rather than falling back, so clearing the
 * field leaves it clear instead of refilling as the last letter is deleted.
 */
export function setTableName(
  doc: SeatingDoc,
  index: number,
  name: string,
): SeatingDoc {
  const tableNames = [...doc.tableNames];
  while (tableNames.length <= index) tableNames.push(undefined as never);
  tableNames[index] = name;
  return { ...doc, tableNames };
}

/**
 * Seat guests at a table and pin them there, without re-solving the room.
 *
 * They leave wherever they were sitting. If the table cannot hold them all,
 * whoever was there unpinned gives up their seat first — moved to the first
 * table with room, or left standing when there is none. Arrivals beyond the
 * table's capacity are left standing too, and unpinned: pinning someone to a
 * table with no seat for them would be a promise the solver cannot keep.
 */
export function seatGuestsAt(
  doc: SeatingDoc,
  ids: string[],
  tableIndex: number,
): SeatingDoc {
  const arriving = [...new Set(ids)];
  const moving = new Set(arriving);
  const sizes = tableSizes(doc);
  if (arriving.length === 0 || tableIndex < 0 || tableIndex >= sizes.length) {
    return doc;
  }

  // Lift the arrivals out of wherever they sit, keeping the room's shape.
  const tables: string[][] = sizes.map((_, i) =>
    (doc.tables[i] ?? []).filter((id) => !moving.has(id)),
  );
  const pins = { ...doc.pins };

  // Make room by moving out whoever is there but not pinned there.
  const bumped: string[] = [];
  const room = () => sizes[tableIndex] - tables[tableIndex].length;
  while (room() < arriving.length) {
    const victim = [...tables[tableIndex]]
      .reverse()
      .find((id) => pins[id] === undefined);
    if (victim === undefined) break;
    tables[tableIndex] = tables[tableIndex].filter((id) => id !== victim);
    bumped.push(victim);
  }

  const taken = arriving.slice(0, Math.max(0, room()));
  const standing = arriving.slice(taken.length);
  tables[tableIndex] = [...tables[tableIndex], ...taken];
  for (const id of taken) pins[id] = tableIndex;
  for (const id of standing) delete pins[id];

  for (const id of bumped) {
    const spot = tables.findIndex((t, i) => t.length < sizes[i]);
    if (spot >= 0) tables[spot].push(id);
  }

  // Keep each table in guest-list order, as the solver leaves them.
  const rank = new Map(doc.guests.map((g, i) => [g.id, i]));
  return {
    ...doc,
    pins,
    tables: tables.map((t) =>
      [...t].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)),
    ),
  };
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
 * Guest id -> their pairings tallied by level, strongest first, with levels they
 * have none of left out. Every guest is present, so callers can look any up.
 */
export function pairingCounts(
  doc: SeatingDoc,
): Map<string, { level: PairingLevel; count: number }[]> {
  const byGuest = new Map<string, Map<PairingLevel, number>>();
  for (const g of doc.guests) byGuest.set(g.id, new Map());
  for (const p of doc.pairings) {
    for (const id of [p.a, p.b]) {
      const tally = byGuest.get(id);
      if (!tally) continue;
      tally.set(p.level, (tally.get(p.level) ?? 0) + 1);
    }
  }
  const out = new Map<string, { level: PairingLevel; count: number }[]>();
  for (const [id, tally] of byGuest) {
    out.set(
      id,
      PAIRING_LEVELS.filter((l) => tally.has(l)).map((level) => ({
        level,
        count: tally.get(level)!,
      })),
    );
  }
  return out;
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
 * The pairs within a group that this level would strengthen: those with no
 * pairing yet, and those already pointing the same way but less insistently.
 *
 * A pair already at least this strong is left as it is — which is the point, so
 * a group of "could sit with"s can be raised without flattening the one "must
 * sit with" among them. So is a pair pointing the other way: strengthening an
 * avoid should never quietly turn it into a preference, or the reverse.
 */
export function weakerPairs(
  doc: SeatingDoc,
  ids: string[],
  level: PairingLevel,
): [string, string][] {
  const members = [...new Set(ids)];
  const out: [string, string][] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const found = findPairing(doc, members[i], members[j]);
      if (!found) {
        out.push([members[i], members[j]]);
        continue;
      }
      const sameWay = found.level > 0 === level > 0;
      // Bigger magnitude means weaker: +++ is 1, + is 3.
      if (sameWay && Math.abs(found.level) > Math.abs(level)) {
        out.push([members[i], members[j]]);
      }
    }
  }
  return out;
}

/**
 * Drop every pairing between members of a group, leaving the ones that reach
 * outside it. The counterpart to applying a level to a clique.
 */
export function removeGroupPairings(
  doc: SeatingDoc,
  ids: string[],
): SeatingDoc {
  const members = new Set(ids);
  if (members.size < 2) return doc;
  return {
    ...doc,
    pairings: doc.pairings.filter(
      (p) => !(members.has(p.a) && members.has(p.b)),
    ),
  };
}

/**
 * Drop every pairing that ties a member of the group to somebody outside it,
 * leaving the ones between members untouched. The mirror of
 * `removeGroupPairings`: that one cuts the group's inside, this one cuts it
 * loose from everyone else.
 *
 * A group of one is allowed here, unlike the inside cut, where it would have
 * nothing to work on: everything a lone guest is in reaches out of them, so
 * this is also how you unpick a single guest entirely.
 */
export function removeOutwardPairings(
  doc: SeatingDoc,
  ids: string[],
): SeatingDoc {
  const members = new Set(ids);
  if (members.size === 0) return doc;
  return {
    ...doc,
    // Keep a pairing when both ends are in the group or both are out of it;
    // drop it when exactly one end is.
    pairings: doc.pairings.filter((p) => members.has(p.a) === members.has(p.b)),
  };
}

/**
 * Whether offering "Strengthen" would do anything the wider buttons do not.
 *
 * It is worth showing when some pairs are weaker than the level but not all of
 * them — with all of them weaker, "Apply to all" has the same effect — and when
 * the weaker ones are not exactly the missing ones, which is "Apply to missing".
 * The keyboard shortcut reads this too, so the key is live exactly when the
 * button is on screen.
 */
export function canStrengthen(
  doc: SeatingDoc,
  ids: string[],
  level: PairingLevel,
): boolean {
  const pairs = pairCount([...new Set(ids)].length);
  const weaker = weakerPairs(doc, ids, level).length;
  const missing = missingPairs(doc, ids).length;
  return weaker > 0 && weaker < pairs && weaker !== missing;
}

/** Raise the group's weaker pairs to this level, leaving the rest alone. */
export function strengthenGroupLevel(
  doc: SeatingDoc,
  ids: string[],
  level: PairingLevel,
): SeatingDoc {
  let next = doc;
  for (const [a, b] of weakerPairs(doc, ids, level)) {
    next = addPairing(next, a, b, level);
  }
  return next;
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
