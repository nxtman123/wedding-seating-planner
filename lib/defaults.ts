import type { PairingLevel, SeatingDoc, TableSpec } from './types';

/** Unique id helper (browser + node both expose crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Bumped when stored documents need bringing forward; see lib/storage.ts. */
export const DOC_VERSION = 2;

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

/** How many rungs each ladder has, which sets both the badges and the weights. */
export const LEVEL_COUNT = 4;

/** Every level, strongest pull first, strongest push last. */
export const PAIRING_LEVELS: PairingLevel[] = [1, 2, 3, 4, -4, -3, -2, -1];

export function isPairingLevel(value: unknown): value is PairingLevel {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value !== 0 &&
    Math.abs(value) <= LEVEL_COUNT
  );
}

/**
 * Score contributed when a pair shares a table.
 *
 * The ratio between levels is 20, which is the largest table this app allows
 * (see `MAX_SEATS_PER_TABLE`). That is the number that matters, because a group
 * applied to N guests creates N-choose-2 pairings and each guest at a full table
 * of S seats holds S-1 of them: with a ratio of 20, one pairing still outweighs
 * a whole table's worth of the level below it even at the maximum table size.
 * At the default eight seats it is not close, which is the point — a clique of
 * the weakest level should never crowd out a stronger pairing on sheer volume.
 *
 * The weakest rung is 1, so the ladder reads 1, 20, 400, 8000 upwards.
 */
const LEVEL_WEIGHTS: Record<1 | 2 | 3 | 4, number> = {
  1: 8000,
  2: 400,
  3: 20,
  4: 1,
};

/** Signed score for seating this pair together. Negative levels return < 0. */
export function levelWeight(level: PairingLevel): number {
  const magnitude = LEVEL_WEIGHTS[Math.abs(level) as 1 | 2 | 3 | 4];
  return level > 0 ? magnitude : -magnitude;
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
      return 'Prefers to sit together';
    case 4:
      return 'Could sit together';
    case -4:
      return 'Could avoid each other';
    case -3:
      return 'Prefers to avoid each other';
    case -2:
      return 'Should avoid each other';
    case -1:
      return 'Must avoid each other';
  }
}

/**
 * The level as a run of signs, strongest first: `+++` down to `+`, and `−` down
 * to `−−−`. Reads the right way round, unlike the levels themselves, where 1 is
 * the strongest and 3 the weakest.
 */
export function levelBadge(level: PairingLevel): string {
  const strength = LEVEL_COUNT + 1 - Math.abs(level);
  return (level > 0 ? '+' : '−').repeat(strength);
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
      return 'prefers to sit with';
    case 4:
      return 'could sit with';
    case -4:
      return 'could avoid';
    case -3:
      return 'prefers to avoid';
    case -2:
      return 'should avoid';
    case -1:
      return 'must avoid';
  }
}

/** CSS modifier class for a level chip — `.level-pos-1` … `.level-neg-3`. */
export function levelClass(level: PairingLevel): string {
  return level > 0 ? `level-pos-${level}` : `level-neg-${Math.abs(level)}`;
}
