import type { PairingLevel, SeatingDoc } from './types';

/** Unique id helper (browser + node both expose crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const DEFAULT_SEATS_PER_TABLE = 6;

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
 * Score contributed when a pair shares a table. Magnitudes are spread far apart
 * so the solver never trades a level-1 pairing for any number of weaker ones:
 * one level-1 outweighs eight level-2s, one level-2 outweighs five level-3s.
 */
const LEVEL_WEIGHTS: Record<1 | 2 | 3, number> = { 1: 1000, 2: 120, 3: 20 };

/** Signed score for seating this pair together. Negative levels return < 0. */
export function levelWeight(level: PairingLevel): number {
  const magnitude = LEVEL_WEIGHTS[Math.abs(level) as 1 | 2 | 3];
  return level > 0 ? magnitude : -magnitude;
}

export function levelLabel(level: PairingLevel): string {
  switch (level) {
    case 1:
      return 'Must sit together';
    case 2:
      return 'Strongly prefer together';
    case 3:
      return 'Nice to have together';
    case -3:
      return 'Prefer apart';
    case -2:
      return 'Strongly avoid';
    case -1:
      return 'Must not share a table';
  }
}

/** Compact form for the chip on a pairing row, e.g. "+1" or "−2". */
export function levelBadge(level: PairingLevel): string {
  return level > 0 ? `+${level}` : `−${Math.abs(level)}`;
}

/**
 * Short form for the in-row dropdown, e.g. "+1 together". Long enough to read
 * without a legend, short enough not to crowd the names beside it.
 */
export function levelShort(level: PairingLevel): string {
  return `${levelBadge(level)} ${level > 0 ? 'together' : 'apart'}`;
}

/** CSS modifier class for a level chip — `.level-pos-1` … `.level-neg-3`. */
export function levelClass(level: PairingLevel): string {
  return level > 0 ? `level-pos-${level}` : `level-neg-${Math.abs(level)}`;
}
