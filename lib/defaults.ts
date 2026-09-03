import type { PairingLevel, SeatingDoc } from './types';

/** Unique id helper (browser + node both expose crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const DEFAULT_SEATS_PER_TABLE = 8;

/** An empty document. Also what Reset restores. */
export function defaultDoc(): SeatingDoc {
  return {
    guests: [],
    pairings: [],
    seatsPerTable: DEFAULT_SEATS_PER_TABLE,
    extraTables: 0,
    pins: {},
    tables: [],
  };
}

/* -------------------------------------------------------------------------- */
/*  Pairing levels                                                             */
/* -------------------------------------------------------------------------- */

/** Every level, strongest pull first, strongest push last. */
export const PAIRING_LEVELS: PairingLevel[] = [1, 2, 3, -3, -2, -1];

export function isPairingLevel(value: unknown): value is PairingLevel {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === -1 ||
    value === -2 ||
    value === -3
  );
}

/**
 * Score contributed when a pair shares a table.
 *
 * The ratio between levels is 20, which is the largest table this app allows
 * (see `setSeatsPerTable`). That is the number that matters, because a group
 * applied to N guests creates N-choose-2 pairings and each guest at a full table
 * of S seats holds S-1 of them: with a ratio of 20, one pairing still outweighs
 * a whole table's worth of the level below it even at the maximum table size.
 * At the usual six seats it is not close, which is the point — a level-3 clique
 * should never crowd out a level-2 pairing on sheer volume.
 */
const LEVEL_WEIGHTS: Record<1 | 2 | 3, number> = { 1: 2000, 2: 100, 3: 5 };

/** Signed score for seating this pair together. Negative levels return < 0. */
export function levelWeight(level: PairingLevel): number {
  const magnitude = LEVEL_WEIGHTS[Math.abs(level) as 1 | 2 | 3];
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
      return 'Could sit together';
    case -3:
      return 'Could avoid each other';
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
  const strength = 4 - Math.abs(level);
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
      return 'could sit with';
    case -3:
      return 'could avoid';
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
