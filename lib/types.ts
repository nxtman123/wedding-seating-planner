/**
 * How strongly two guests should, or should not, share a table.
 *
 * Six rungs, read as a sentence in the row that carries them:
 *
 *   1  must sit with     a rule you are enforcing
 *   2  ought to sit with a duty — separating them would be a small wrong
 *   3  likes to sit with a preference, and a soft one
 *   4  could sit with    permission, worth nothing either way
 *  -2  rather avoid      a preference the other way
 *  -1  must avoid        the strongest push there is
 *
 * The rung below "could" is not on this list, because it is what a pair has when
 * nothing has been said about them: two guests with no pairing carry a small
 * penalty for sharing a table, so strangers drift apart on their own and the
 * work is in saying who belongs together. "Could sit together" is then exactly
 * the act of lifting that penalty — a group that may share a table without
 * anyone being pulled towards it.
 *
 * Tables are circular and every seat at one is equivalent, so a table is really
 * just a set of guests — there is no "next to" finer than "same table".
 */
export type PairingLevel = -2 | -1 | 1 | 2 | 3 | 4;

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

/**
 * A row of the room: `count` tables that seat `seats` each. Several rows make a
 * room of mixed sizes — ten eights and a pair of sixteens, say.
 */
export interface TableSpec {
  id: string;
  count: number;
  seats: number;
}

/** Guest id -> table index, for guests locked in place before a solve. */
export type Pins = Record<string, number>;

/**
 * The whole document.
 *
 * `order` is the guest list as drawn: a sequence of top-level entries, each
 * either a loose guest's id or a group's id, so a group can sit anywhere among
 * the loose guests. Guests inside a group are not in `order` — their sequence
 * comes from their relative order in `guests`, which is itself kept flattened to
 * match what `order` draws.
 *
 * `tables` is the last arrangement the solver produced —
 * an array of tables, each holding the ids of the guests seated there. It is
 * empty until the first Generate, and the number of tables is *derived* from
 * the guest count rather than stored (see `tableCount()` in `lib/solver.ts`).
 */
export interface SeatingDoc {
  /**
   * Schema version, so a document written before a change can be brought
   * forward. Absent means version 1, from before the fourth level existed.
   */
  version: number;
  guests: Guest[];
  groups: Group[];
  order: string[];
  pairings: Pairing[];
  /** The room, as rows of "N tables of M seats". Order sets table numbering. */
  tableSpecs: TableSpec[];
  /**
   * Names given to tables, by position. A hole means the table goes by its
   * number. Keyed by position like `pins` and `tables` are, so re-describing the
   * room shifts names the same way it shifts everything else.
   */
  tableNames: string[];
  /**
   * What this plan is called. Absent until named, and cleared back to absent
   * rather than stored empty, so `docTitle` can supply the default.
   */
  title?: string;
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

/** How one level fared in the current seating, for the score breakdown. */
export interface LevelTally {
  level: PairingLevel;
  /** Pairings at this level, whatever became of them. */
  total: number;
  violated: number;
}
