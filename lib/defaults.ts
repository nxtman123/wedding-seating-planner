import type { PairingLevel, SeatingDoc, TableSpec } from './types';

/** Unique id helper (browser + node both expose crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Bumped when stored documents need bringing forward; see lib/storage.ts. */
export const DOC_VERSION = 3;

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
export const PAIRING_LEVELS: PairingLevel[] = [1, 2, 3, -1];

export function isPairingLevel(value: unknown): value is PairingLevel {
  return value === 1 || value === 2 || value === 3 || value === -1;
}

/**
 * Score contributed when a pair shares a table.
 *
 * The ratio between rungs is 20, which is the largest table this app allows
 * (see `MAX_SEATS_PER_TABLE`). That is the number that matters, because a group
 * applied to N guests creates N-choose-2 pairings and each guest at a full table
 * of S seats holds S-1 of them: at 20 to 1, one pairing still outweighs a whole
 * table's worth of the rung below it even at the maximum table size.
 *
 * "Could sit together" is worth nothing on purpose. It does not pull anyone
 * anywhere; it only cancels the penalty below, which is the whole of its job.
 */
const LEVEL_WEIGHTS: Record<PairingLevel, number> = {
  1: 400,
  2: 20,
  3: 0,
  [-1]: -8000,
};

/**
 * What a pair with no pairing at all costs when seated together.
 *
 * Small, but it applies to every such pair, so a table of eight strangers starts
 * 28 of these in the hole and the solver has a reason to keep groups apart
 * without anyone saying so. It is also what makes "could sit together" mean
 * something: setting it lifts this, which is why that rung can be worth zero.
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
      return 'Should sit together';
    case 3:
      return 'Could sit together';
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
      return '👍';
    case 3:
      return '🙂';
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
      return 'should sit with';
    case 3:
      return 'could sit with';
    case -1:
      return 'must avoid';
  }
}

/** CSS modifier class for a level chip — `.level-pos-1` … `.level-neg-1`. */
export function levelClass(level: PairingLevel): string {
  return level > 0 ? `level-pos-${level}` : `level-neg-${Math.abs(level)}`;
}
