'use client';

import { useRef } from 'react';
import useScrollEdges from '@/components/useScrollEdges';
import {
  PAIRING_LEVELS,
  levelBadge,
  levelClass,
  levelLabel,
  levelPhrase,
} from '@/lib/defaults';
import {
  canStrengthen,
  guestName,
  missingPairs,
  pairCount,
  sortedPairings,
  weakerPairs,
} from '@/lib/guests';
import type {
  Pairing,
  PairingDraft,
  PairingLevel,
  PairingOutcome,
  SeatingDoc,
} from '@/lib/types';

export interface PairingPanelProps {
  doc: SeatingDoc;
  /** Pairing id -> how it fared in the current seating. Empty before a solve. */
  outcomes: Map<string, PairingOutcome>;
  /**
   * The group being composed. Owned by the page, and picked entirely in the
   * guest list — this panel only sets the level and applies it.
   */
  draft: PairingDraft;
  onLevelChange: (level: PairingLevel) => void;
  /** Apply the level to every pair in the group, overwriting what exists. */
  onApply: () => void;
  /** Apply the level only to pairs in the group that have no pairing yet. */
  onApplyMissing: () => void;
  /** Apply the level only where it would strengthen what is already there. */
  onApplyStrengthen: () => void;
  /** Drop every pairing between members of the group. */
  onRemoveInside: () => void;
  /** Drop every pairing tying a member of the group to somebody outside it. */
  onRemoveOutward: () => void;
  onSetLevel: (id: string, level: PairingLevel) => void;
  onRemove: (id: string) => void;
}

/**
 * Whether the current seating honored a pairing, in the marks the score report
 * uses — so a row and the tally above it say the same thing the same way.
 *
 * The column is held even when there is nothing to put in it, which is every
 * row until a seating exists; otherwise the names would shift sideways the
 * first time you pressed Generate.
 */
function OutcomeMark({ outcome }: { outcome: PairingOutcome | undefined }) {
  if (outcome === 'satisfied') {
    return (
      <span className="outcome outcome-ok" title="Honored by this seating">
        ✓
      </span>
    );
  }
  if (outcome === 'violated') {
    return (
      <span className="outcome outcome-bad" title="Not honored by this seating">
        ✗
      </span>
    );
  }
  return <span className="outcome" title="Not seated yet" />;
}

/** The one option that is not a level. Never a stored value, only ever chosen. */
const REMOVE = 'remove';

export default function PairingPanel({
  doc,
  outcomes,
  draft,
  onLevelChange,
  onApply,
  onApplyMissing,
  onApplyStrengthen,
  onRemoveInside,
  onRemoveOutward,
  onSetLevel,
  onRemove,
}: PairingPanelProps) {
  const { guests: picked, level } = draft;
  const chosen = new Set(picked);
  const pairs = pairCount(picked.length);
  const missing = missingPairs(doc, picked).length;
  const weaker = weakerPairs(doc, picked, level).length;
  /*
   * Each narrower button is worth offering only where it would do something the
   * wider one does not: with nothing yet paired, all three do the same thing.
   * Strengthen's rule is `canStrengthen`, shared with the S shortcut so the key
   * is live exactly when the button is on screen.
   */
  const showMissing = missing > 0 && missing < pairs;
  const showStrengthen = canStrengthen(doc, picked, level);
  /** How many pairings sit inside the group — what there is to take away. */
  const insideCount = pairs - missing;

  /*
   * One pair or many, the button does the same thing — set every pair in the
   * pick to the level shown — so it says so, rather than splitting into add and
   * update over a distinction the user did not make and cannot see coming.
   */
  const applyLabel =
    picked.length > 2 ? `Apply to all ${pairs} pairs` : 'Apply pairing';

  /** Both ends picked — the pairings an Apply would rewrite. */
  const inside = (p: Pairing) => chosen.has(p.a) && chosen.has(p.b);
  /** Exactly one end picked — how the group is tied to everyone else. */
  const reachingOut = (p: Pairing) => chosen.has(p.a) !== chosen.has(p.b);

  /*
   * Three bands, floated rather than filtered so nothing goes missing: the
   * pairings inside the pick, then the ones reaching out of it, then the rest.
   * Picking a single guest simply empties the first band, which is why it needs
   * no special case — everything they are in reaches out of a group of one.
   */
  const sorted = sortedPairings(doc);
  const bandInside = sorted.filter(inside);
  const bandOut = sorted.filter(reachingOut);
  const bandRest = sorted.filter((p) => !inside(p) && !reachingOut(p));
  const pairings = [...bandInside, ...bandOut, ...bandRest];

  /** What each cut would take: the band inside the pick, and the band reaching out. */
  const outsideCount = bandOut.length;

  /** Row indexes that open a gap, i.e. that start a band after a non-empty one. */
  const bandBreaks = new Set<number>();
  if (bandInside.length && bandOut.length) bandBreaks.add(bandInside.length);
  if ((bandInside.length || bandOut.length) && bandRest.length) {
    bandBreaks.add(bandInside.length + bandOut.length);
  }

  /** Fades whichever end of the list still has more beyond it. */
  const listRef = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(listRef);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Pairings</h2>
        <span className="count">{doc.pairings.length}</span>
      </div>

      {doc.guests.length < 2 ? (
        <p className="empty">Add at least two guests to pair them up.</p>
      ) : (
        <div className="add-pairing">
          <select
            value={level}
            aria-label="Priority level"
            onChange={(e) =>
              onLevelChange(Number(e.target.value) as PairingLevel)
            }
          >
            {PAIRING_LEVELS.map((l) => (
              <option key={l} value={l}>
                {levelBadge(l)} {levelLabel(l)}
              </option>
            ))}
          </select>

          <div className="apply-row">
            <button
              type="button"
              className="primary"
              onClick={onApply}
              disabled={picked.length < 2}
            >
              {applyLabel} <kbd>A</kbd>
            </button>
            {showStrengthen && (
              <button
                type="button"
                onClick={onApplyStrengthen}
                title="Raise only the pairs that are weaker than this, leaving the stronger ones alone"
              >
                Strengthen {weaker} pair{weaker === 1 ? '' : 's'} <kbd>S</kbd>
              </button>
            )}
            {showMissing && (
              <button type="button" onClick={onApplyMissing}>
                Apply to {missing} missing
              </button>
            )}
            {/* The two cuts, named after the bands they empty: the pairs
                inside the pick, and the ones tying it to everyone else. Each
                appears only when it has something to take. */}
            {insideCount > 0 && (
              <button
                type="button"
                className="danger"
                onClick={onRemoveInside}
                title="Delete the pairings between these guests, leaving the ones that reach outside"
              >
                Remove {insideCount} inside pair{insideCount === 1 ? '' : 's'}
              </button>
            )}
            {outsideCount > 0 && (
              <button
                type="button"
                className="danger"
                onClick={onRemoveOutward}
                title="Delete the pairings tying these guests to everyone else, leaving the ones between them"
              >
                Remove {outsideCount} outside pair
                {outsideCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      )}

      {pairings.length === 0 ? (
        <p className="empty">
          No pairings yet. Everyone will be seated arbitrarily.
        </p>
      ) : (
        <ul ref={listRef} className={`list scroller ${edges}`}>
          {pairings.map((p, i) => (
            <li
              key={p.id}
              className={[
                'pairing-row',
                i < bandInside.length
                  ? 'row-selected'
                  : i < bandInside.length + bandOut.length
                    ? 'row-adjacent'
                    : '',
                bandBreaks.has(i) ? 'after-focus' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* Reads as a sentence: name, relation, name. */}
              <span className="pairing-name pairing-name-a">
                {guestName(doc, p.a)}
              </span>
              <select
                className={`level-select ${levelClass(p.level)}`}
                value={p.level}
                aria-label={`${guestName(doc, p.a)} and ${guestName(doc, p.b)}`}
                title={levelLabel(p.level)}
                onChange={(e) => {
                  if (e.target.value === REMOVE) onRemove(p.id);
                  else onSetLevel(p.id, Number(e.target.value) as PairingLevel);
                }}
              >
                {PAIRING_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {levelBadge(l)} {levelPhrase(l)}
                  </option>
                ))}
                {/* Taking the pairing away is the last thing this control can
                    do to it, so it lives at the foot of the same list rather
                    than as a button the row has to make room for. */}
                <hr />
                <option value={REMOVE}>🗑️ Remove pairing</option>
              </select>
              <span className="pairing-name">{guestName(doc, p.b)}</span>
              <OutcomeMark outcome={outcomes.get(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
