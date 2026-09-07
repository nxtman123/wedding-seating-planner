import type { PairingLevel, SeatingDoc, TableSpec } from './types';

/** Unique id helper (browser + node both expose crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Bumped when stored documents need bringing forward; see lib/storage.ts. */
export const DOC_VERSION = 4;

export const DEFAULT_SEATS_PER_TABLE = 8;

/** Largest table the room editor will accept, and the widest a level can span. */
export const MAX_SEATS_PER_TABLE = 20;

/** A fresh row for the room editor. */
export function newTableSpec(
  count = 1,
  seats = DEFAULT_SEATS_PER_TABLE,
): TableSpec {
  return { id: uid(), count, seats };
}

/** An empty document. Also what Reset restores. */
export function defaultDoc(): SeatingDoc {
  return {
    version: DOC_VERSION,
    guests: [],
    groups: [],
    order: [],
    pairings: [],
    tableSpecs: [newTableSpec(10)],
    tableNames: [],
    pins: {},
    tables: [],
  };
}

/* -------------------------------------------------------------------------- */
/*  Pairing levels                                                             */
/* -------------------------------------------------------------------------- */

/** Every level, strongest pull first, strongest push last. */
export const PAIRING_LEVELS: PairingLevel[] = [1, 2, 3, 4, -2, -1];

export function isPairingLevel(value: unknown): value is PairingLevel {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === -2 ||
    value === -1
  );
}

/**
 * Score contributed when a pair shares a table.
 *
 * What matters is not the numbers but the gaps between them, because a guest at
 * a table of S seats holds S-1 pairs at once and they all count. So the question
 * for any rung is how many of the rung below it takes to outweigh one of it.
 *
 * Only the top step is guaranteed: a "must" clears a whole table of "ought"s at
 * any table this app allows. Below that the ladder is deliberately soft — seven
 * "likes" at a full table outweigh one "ought", and six unmentioned guests
 * outweigh one "likes" — because a table wants to be a group rather than a chain
 * of pairs, and the pull of the company someone keeps should be able to win.
 *
 * A "must not" is worth two "must"s, so it bends rather than breaks: hem someone
 * in with enough musts and it will give, and the report will say so rather than
 * the solver wrecking something else to hold it.
 *
 * "Could sit together" is worth nothing on purpose. It does not pull anyone
 * anywhere; it only cancels the penalty below, which is the whole of its job.
 */
const LEVEL_WEIGHTS: Record<PairingLevel, number> = {
  1: 600,
  2: 30,
  3: 6,
  4: 0,
  [-2]: -6,
  [-1]: -1200,
};

/**
 * What a pair with no pairing at all costs when seated together.
 *
 * Small on its own, but it applies to every such pair, so a table of eight
 * strangers starts 28 of these in the hole and the solver has a reason to keep
 * groups apart without anyone saying so. It is also what makes "could sit
 * together" mean something: setting it lifts this, which is why that rung can be
 * worth zero.
 */
export const IMPLICIT_WEIGHT = -1;

/** Signed score for seating this pair together. Negative levels return < 0. */
export function levelWeight(level: PairingLevel): number {
  return LEVEL_WEIGHTS[level];
}

/**
 * The level as it applies to a whole group, for the form that sets one. Uses the
 * same must / should / could ladder as `levelPhrase`, so the two selects speak
 * the same language — this one about the group, that one about a single pair.
 */
export function levelLabel(level: PairingLevel): string {
  switch (level) {
    case 1:
      return 'Must sit together';
    case 2:
      return 'Ought to sit together';
    case 3:
      return 'Like to sit together';
    case 4:
      return 'Could sit together';
    case -2:
      return 'Rather not sit together';
    case -1:
      return 'Must not sit together';
  }
}

/**
 * A face for each rung. The dropdowns are native, so their open list gets none
 * of the chip colours — an emoji is the one mark that survives into it, and it
 * carries the ladder better than a run of signs did.
 */
export function levelBadge(level: PairingLevel): string {
  switch (level) {
    case 1:
      return '❤️';
    case 2:
      return '🤝';
    case 3:
      return '😃';
    case 4:
      return '👋';
    case -2:
      return '😬';
    case -1:
      return '🚫';
  }
}

/**
 * The level as a relation, for the dropdown that sits between the two names in
 * a pairing row: "Ken Tiel · must sit with · Dora Tiel". Parallel on both sides
 * of zero — must / should / could, sit with / avoid — so the ladder is legible
 * without a key.
 */
export function levelPhrase(level: PairingLevel): string {
  switch (level) {
    case 1:
      return 'must sit with';
    case 2:
      return 'ought to sit with';
    case 3:
      return 'likes to sit with';
    case 4:
      return 'could sit with';
    case -2:
      return 'rather avoid';
    case -1:
      return 'must avoid';
  }
}

/** CSS modifier class for a level chip — `.level-pos-1` … `.level-neg-1`. */
export function levelClass(level: PairingLevel): string {
  return level > 0 ? `level-pos-${level}` : `level-neg-${Math.abs(level)}`;
}
