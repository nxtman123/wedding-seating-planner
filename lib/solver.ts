import { levelWeight } from './defaults';
import type { PairingLevel, PairingOutcome, SeatingDoc } from './types';

/* -------------------------------------------------------------------------- */
/*  Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The room as a flat list of capacities, one per table, in the order its rows
 * are written — so table numbering follows the editor. A row of "2 tables of 16"
 * becomes two entries of 16.
 */
export function tableSizes(doc: SeatingDoc): number[] {
  return doc.tableSpecs.flatMap((spec) =>
    Array.from({ length: Math.max(0, Math.floor(spec.count)) }, () =>
      Math.max(1, Math.floor(spec.seats)),
    ),
  );
}

export function tableCount(doc: SeatingDoc): number {
  return tableSizes(doc).length;
}

/** Every seat in the room, which may be fewer than there are guests. */
export function seatCount(doc: SeatingDoc): number {
  return tableSizes(doc).reduce((n, seats) => n + seats, 0);
}

/* -------------------------------------------------------------------------- */
/*  Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** Guest id -> the weighted pairings that guest appears in. */
type Affinities = Map<string, { other: string; weight: number }[]>;

function buildAffinities(doc: SeatingDoc): Affinities {
  const known = new Set(doc.guests.map((g) => g.id));
  const map: Affinities = new Map();
  for (const g of doc.guests) map.set(g.id, []);
  for (const p of doc.pairings) {
    if (p.a === p.b || !known.has(p.a) || !known.has(p.b)) continue;
    const weight = levelWeight(p.level);
    map.get(p.a)!.push({ other: p.b, weight });
    map.get(p.b)!.push({ other: p.a, weight });
  }
  return map;
}

/**
 * Total score of an arrangement: the summed weight of every pairing whose two
 * guests share a table. Positive pairings add when together, negative pairings
 * subtract. Higher is better.
 */
export function scoreAssignment(doc: SeatingDoc, tables: string[][]): number {
  const seat = seatIndex(tables);
  let total = 0;
  const known = new Set(doc.guests.map((g) => g.id));
  for (const p of doc.pairings) {
    if (p.a === p.b || !known.has(p.a) || !known.has(p.b)) continue;
    const ta = seat.get(p.a);
    const tb = seat.get(p.b);
    if (ta === undefined || tb === undefined || ta !== tb) continue;
    total += levelWeight(p.level);
  }
  return total;
}

/** Guest id -> the index of the table they are seated at. */
export function seatIndex(tables: string[][]): Map<string, number> {
  const seat = new Map<string, number>();
  tables.forEach((table, i) => {
    for (const id of table) seat.set(id, i);
  });
  return seat;
}

/**
 * How each pairing fared. A positive pairing is `satisfied` when the pair share
 * a table and `violated` otherwise; a negative pairing is the reverse.
 * `unplaced` means at least one of the two is not seated yet.
 */
export function pairingOutcomes(
  doc: SeatingDoc,
  tables: string[][],
): Map<string, PairingOutcome> {
  const seat = seatIndex(tables);
  const out = new Map<string, PairingOutcome>();
  for (const p of doc.pairings) {
    const ta = seat.get(p.a);
    const tb = seat.get(p.b);
    if (ta === undefined || tb === undefined) {
      out.set(p.id, 'unplaced');
      continue;
    }
    const together = ta === tb;
    const wanted = p.level > 0;
    out.set(p.id, together === wanted ? 'satisfied' : 'violated');
  }
  return out;
}

/** The negative pairings whose two guests ended up at the same table. */
export function conflictsAtTable(
  doc: SeatingDoc,
  tables: string[][],
  tableIndex: number,
): { a: string; b: string; level: PairingLevel }[] {
  const here = new Set(tables[tableIndex] ?? []);
  return doc.pairings
    .filter((p) => p.level < 0 && here.has(p.a) && here.has(p.b))
    .map((p) => ({ a: p.a, b: p.b, level: p.level }));
}

/* -------------------------------------------------------------------------- */
/*  Random numbers                                                             */
/* -------------------------------------------------------------------------- */

/** mulberry32 — small, fast, seedable, so a given seed replays exactly. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/*  Construction                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The pins the room can actually honor, in guest-list order. A pin is dropped
 * when its table no longer exists (the room shrank) or is already full — those
 * guests are then treated as free rather than frozen somewhere they never asked
 * to sit.
 */
function resolvePins(doc: SeatingDoc, sizes: number[]) {
  const honored = new Map<string, number>();
  const used = new Array<number>(sizes.length).fill(0);
  for (const guest of doc.guests) {
    const pinned = doc.pins[guest.id];
    if (pinned === undefined || pinned < 0 || pinned >= sizes.length) continue;
    if (used[pinned] >= sizes[pinned]) continue;
    used[pinned]++;
    honored.set(guest.id, pinned);
  }
  return honored;
}

/**
 * Build a starting arrangement: bundle guests that strongly want to be together
 * into clusters no larger than a table, then first-fit-decreasing the clusters
 * into tables. Pinned guests are seated first and their tables are pre-charged
 * so the packer respects the space they take up.
 */
function seedAssignment(
  doc: SeatingDoc,
  rng: () => number,
  sizes: number[],
  honored: Map<string, number>,
): string[][] {
  const seating: string[][] = sizes.map(() => []);
  const biggest = Math.max(1, ...sizes);

  // Pins go down first and never move.
  for (const [id, table] of honored) seating[table].push(id);

  // Union-find over the remaining guests, joining the strongest wants first.
  const parent = new Map<string, string>();
  const size = new Map<string, number>();
  const free = doc.guests.filter((g) => !honored.has(g.id)).map((g) => g.id);
  for (const id of free) {
    parent.set(id, id);
    size.set(id, 1);
  }
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(id) !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };

  const wants = doc.pairings
    .filter((p) => p.level > 0 && parent.has(p.a) && parent.has(p.b))
    // Jitter the ordering so restarts explore different clusterings, but keep
    // level-1 pairings strictly ahead of level-2 and so on.
    .map((p) => ({ p, key: levelWeight(p.level) * (0.9 + rng() * 0.2) }))
    .sort((x, y) => y.key - x.key);

  for (const { p } of wants) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra === rb) continue;
    // A cluster can only ever fit if it fits the largest table in the room.
    if (size.get(ra)! + size.get(rb)! > biggest) continue;
    parent.set(rb, ra);
    size.set(ra, size.get(ra)! + size.get(rb)!);
  }

  const clusters = new Map<string, string[]>();
  for (const id of free) {
    const root = find(id);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(id);
    else clusters.set(root, [id]);
  }

  const ordered = [...clusters.values()].sort((x, y) => y.length - x.length);
  for (const cluster of ordered) {
    // Prefer the fullest table that still fits the cluster, so partial tables
    // fill up before empty ones get broken open.
    let best = -1;
    let bestRoom = Infinity;
    for (let i = 0; i < sizes.length; i++) {
      const room = sizes[i] - seating[i].length;
      if (room >= cluster.length && room < bestRoom) {
        best = i;
        bestRoom = room;
      }
    }
    if (best >= 0) {
      seating[best].push(...cluster);
      continue;
    }
    // Cluster doesn't fit anywhere whole — scatter it into whatever is open.
    // A guest with nowhere left to sit is dropped: the room is short of seats,
    // which the panel reports rather than the solver papering over.
    for (const id of cluster) {
      const target = seating.findIndex((t, i) => t.length < sizes[i]);
      if (target >= 0) seating[target].push(id);
    }
  }

  return seating;
}

/* -------------------------------------------------------------------------- */
/*  Local search                                                               */
/* -------------------------------------------------------------------------- */

/** Change in score from moving `guest` out of `from` and into `to`. */
function moveDelta(
  affinities: Affinities,
  seat: Map<string, number>,
  guest: string,
  from: number,
  to: number,
): number {
  let delta = 0;
  for (const link of affinities.get(guest) ?? []) {
    const where = seat.get(link.other);
    if (where === from) delta -= link.weight;
    if (where === to) delta += link.weight;
  }
  return delta;
}

/** Change in score from swapping two guests between their tables. */
function swapDelta(
  affinities: Affinities,
  seat: Map<string, number>,
  x: string,
  y: string,
): number {
  const tx = seat.get(x)!;
  const ty = seat.get(y)!;
  let delta = 0;
  for (const link of affinities.get(x) ?? []) {
    if (link.other === y) continue;
    const where = seat.get(link.other);
    if (where === tx) delta -= link.weight;
    if (where === ty) delta += link.weight;
  }
  for (const link of affinities.get(y) ?? []) {
    if (link.other === x) continue;
    const where = seat.get(link.other);
    if (where === ty) delta -= link.weight;
    if (where === tx) delta += link.weight;
  }
  return delta;
}

/**
 * Simulated annealing over two neighborhoods — move one guest to a table with a
 * free seat, or swap two guests across tables — followed by a greedy pass that
 * takes every remaining improvement. Mutates `seating` in place and returns the
 * score it reached.
 */
function improve(
  doc: SeatingDoc,
  seating: string[][],
  affinities: Affinities,
  movable: string[],
  sizes: number[],
  rng: () => number,
  iterations: number,
  deadline: number,
): number {
  const seat = seatIndex(seating);
  /*
   * Only guests who actually got a seat can be moved around. When the room has
   * fewer seats than guests the seeding leaves the remainder out, and reaching
   * for one of those here would be reaching into a table that does not exist.
   */
  const inPlay = movable.filter((id) => seat.has(id));
  if (inPlay.length === 0 || seating.length < 2) {
    return scoreAssignment(doc, seating);
  }
  let score = scoreAssignment(doc, seating);

  const remove = (table: number, guest: string) => {
    const list = seating[table];
    list.splice(list.indexOf(guest), 1);
  };

  const startTemp = 400;
  const endTemp = 0.5;
  // Reserve the tail of the budget so the polish pass always gets to run.
  const annealDeadline = deadline - (deadline - Date.now()) * 0.3;

  for (let step = 0; step < iterations; step++) {
    if ((step & 255) === 0 && Date.now() > annealDeadline) break;

    const temp =
      startTemp * Math.pow(endTemp / startTemp, step / iterations);
    const guest = inPlay[(rng() * inPlay.length) | 0];
    const from = seat.get(guest)!;

    if (rng() < 0.5) {
      // Move into a table with a spare seat.
      const to = (rng() * seating.length) | 0;
      if (to === from || seating[to].length >= sizes[to]) continue;
      const delta = moveDelta(affinities, seat, guest, from, to);
      if (delta >= 0 || rng() < Math.exp(delta / temp)) {
        remove(from, guest);
        seating[to].push(guest);
        seat.set(guest, to);
        score += delta;
      }
    } else {
      // Swap with another movable guest at a different table.
      const partner = inPlay[(rng() * inPlay.length) | 0];
      if (partner === guest) continue;
      const to = seat.get(partner)!;
      if (to === from) continue;
      const delta = swapDelta(affinities, seat, guest, partner);
      if (delta >= 0 || rng() < Math.exp(delta / temp)) {
        remove(from, guest);
        remove(to, partner);
        seating[to].push(guest);
        seating[from].push(partner);
        seat.set(guest, to);
        seat.set(partner, from);
        score += delta;
      }
    }
  }

  // Greedy polish: annealing ends warm, so take any improvement still on offer.
  let improved = true;
  while (improved && Date.now() <= deadline) {
    improved = false;
    for (const guest of inPlay) {
      const from = seat.get(guest)!;
      for (let to = 0; to < seating.length; to++) {
        if (to === from || seating[to].length >= sizes[to]) continue;
        const delta = moveDelta(affinities, seat, guest, from, to);
        if (delta > 0) {
          remove(from, guest);
          seating[to].push(guest);
          seat.set(guest, to);
          score += delta;
          improved = true;
          break;
        }
      }
    }
    for (const guest of inPlay) {
      for (const partner of inPlay) {
        if (partner === guest) continue;
        if (seat.get(partner) === seat.get(guest)) continue;
        const delta = swapDelta(affinities, seat, guest, partner);
        if (delta > 0) {
          const from = seat.get(guest)!;
          const to = seat.get(partner)!;
          remove(from, guest);
          remove(to, partner);
          seating[to].push(guest);
          seating[from].push(partner);
          seat.set(guest, to);
          seat.set(partner, from);
          score += delta;
          improved = true;
        }
      }
    }
  }

  return score;
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

export interface SolveOptions {
  /** Seed for the PRNG, so a run can be replayed. Defaults to random. */
  seed?: number;
  /** Independent restarts; the best-scoring one wins. */
  restarts?: number;
  /** Wall-clock ceiling in ms, split across restarts. */
  budgetMs?: number;
}

export interface SolveResult {
  tables: string[][];
  score: number;
}

/**
 * Assign every guest to a table, maximizing the score. Runs synchronously
 * inside its time budget — small enough for a wedding-sized guest list that a
 * worker would be overkill.
 */
export function solveSeating(
  doc: SeatingDoc,
  options: SolveOptions = {},
): SolveResult {
  const sizes = tableSizes(doc);
  if (doc.guests.length === 0 || sizes.length === 0) {
    return { tables: sizes.map(() => []), score: 0 };
  }

  const restarts = options.restarts ?? 8;
  const budgetMs = options.budgetMs ?? 400;
  const seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const affinities = buildAffinities(doc);
  const iterations = 20000 + doc.guests.length * 400;
  const perRestart = budgetMs / restarts;

  const honored = resolvePins(doc, sizes);
  const movable = doc.guests.map((g) => g.id).filter((id) => !honored.has(id));

  let best: string[][] | null = null;
  let bestScore = -Infinity;

  for (let restart = 0; restart < restarts; restart++) {
    const rng = mulberry32(seed + restart * 0x9e3779b9);
    const seating = seedAssignment(doc, rng, sizes, honored);
    const score = improve(
      doc,
      seating,
      affinities,
      movable,
      sizes,
      rng,
      iterations,
      Date.now() + perRestart,
    );
    if (score > bestScore) {
      bestScore = score;
      best = seating;
    }
  }

  const result = best ?? sizes.map(() => []);
  // Stable presentation: guests appear at a table in guest-list order.
  const order = new Map(doc.guests.map((g, i) => [g.id, i]));
  for (const table of result) {
    table.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  }
  return { tables: result, score: bestScore };
}
