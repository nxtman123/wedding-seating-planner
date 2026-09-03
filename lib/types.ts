/**
 * How strongly two guests should, or should not, share a table.
 *
 * Positive levels pull a pair together, negative levels push them apart, and
 * `1` / `-1` are the strongest in each direction. Tables are circular and every
 * seat at one is equivalent, so a table is really just a set of guests — there
 * is no "next to" finer than "same table".
 */
export type PairingLevel = -3 | -2 | -1 | 1 | 2 | 3;

/** A named section of the guest list — a family, a table's worth of friends. */
export interface Group {
  id: string;
  name: string;
}

/** Someone attending the reception. Names need not be unique. */
export interface Guest {
  id: string;
  name: string;
  /** The group they sit under in the list, or null when loose. */
  groupId: string | null;
}

/**
 * A relationship between two guests. `a` and `b` are `Guest.id`s and the pair is
 * unordered — `lib/guests.ts` refuses to add the reverse of an existing pairing.
 */
export interface Pairing {
  id: string;
  a: string;
  b: string;
  level: PairingLevel;
}

/** Guest id -> table index, for guests locked in place before a solve. */
export type Pins = Record<string, number>;

/**
 * The whole document.
 *
 * `guests` is held in the order the list draws it: the loose guests first, then
 * each group's members in `groups` order. Keeping that canonical means a
 * position in the list is just an index into `guests`, and grouping never needs
 * a second source of order to disagree with.
 *
 * `tables` is the last arrangement the solver produced —
 * an array of tables, each holding the ids of the guests seated there. It is
 * empty until the first Generate, and the number of tables is *derived* from
 * the guest count rather than stored (see `tableCount()` in `lib/solver.ts`).
 */
export interface SeatingDoc {
  guests: Guest[];
  groups: Group[];
  pairings: Pairing[];
  /** Seats at every table. Circular tables, so this is just a capacity. */
  seatsPerTable: number;
  /** Slack tables beyond the minimum needed to fit everyone. */
  extraTables: number;
  pins: Pins;
  tables: string[][];
}

/** Whether a pairing got what it asked for in the current arrangement. */
export type PairingOutcome = 'satisfied' | 'violated' | 'unplaced';

/**
 * The group being composed, held outside the document because it is transient
 * UI state. Two guests make a single pairing; more make a clique, where every
 * pair in the group gets the same level. Order is only the order they were
 * picked in, shown as the numbers on the guest rows.
 */
export interface PairingDraft {
  guests: string[];
  level: PairingLevel;
}
