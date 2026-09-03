'use client';

import {
  PAIRING_LEVELS,
  levelBadge,
  levelClass,
  levelLabel,
  levelPhrase,
} from '@/lib/defaults';
import {
  findPairing,
  guestName,
  missingPairs,
  pairCount,
  sortedPairings,
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
   * The group being composed. Owned by the page because the guest list and the
   * chips here pick from the same set.
   */
  draft: PairingDraft;
  onToggleGuest: (id: string) => void;
  onLevelChange: (level: PairingLevel) => void;
  onClear: () => void;
  /** Apply the level to every pair in the group, overwriting what exists. */
  onApply: () => void;
  /** Apply the level only to pairs in the group that have no pairing yet. */
  onApplyMissing: () => void;
  onSetLevel: (id: string, level: PairingLevel) => void;
  onRemove: (id: string) => void;
}

/** Dot next to a pairing: did the current arrangement honor it? */
function OutcomeDot({ outcome }: { outcome: PairingOutcome | undefined }) {
  if (!outcome || outcome === 'unplaced') {
    return <span className="dot dot-unknown" title="Not seated yet" />;
  }
  if (outcome === 'satisfied') {
    return <span className="dot dot-ok" title="Honored by this seating" />;
  }
  return <span className="dot dot-bad" title="Not honored by this seating" />;
}

export default function PairingPanel({
  doc,
  outcomes,
  draft,
  onToggleGuest,
  onLevelChange,
  onClear,
  onApply,
  onApplyMissing,
  onSetLevel,
  onRemove,
}: PairingPanelProps) {
  const { guests: picked, level } = draft;
  const chosen = new Set(picked);
  const pairs = pairCount(picked.length);
  const missing = missingPairs(doc, picked).length;
  /**
   * Only worth offering when it would do something different from Apply to all
   * — with nothing yet paired the two are the same button.
   */
  const showMissing = missing > 0 && missing < pairs;

  /** Only meaningful for a group of two — the one pairing this would rewrite. */
  const existing =
    picked.length === 2 ? findPairing(doc, picked[0], picked[1]) : null;

  const applyLabel =
    picked.length > 2
      ? `Apply to all ${pairs} pairs`
      : existing
        ? 'Update pairing'
        : 'Add pairing';

  /**
   * The pairings the current pick is about. One guest picked means every pairing
   * they are in; two or more means the pairings inside that group, which are the
   * ones an Apply would rewrite.
   */
  const inFocus = (p: Pairing) =>
    picked.length === 1
      ? p.a === picked[0] || p.b === picked[0]
      : chosen.has(p.a) && chosen.has(p.b);

  // Floated to the top rather than filtered, so nothing goes missing.
  const sorted = sortedPairings(doc);
  const focused = sorted.filter(inFocus);
  const pairings = [...focused, ...sorted.filter((p) => !inFocus(p))];

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
          {picked.length > 0 && (
            <ul className="chips">
              {picked.map((id) => (
                <li key={id} className="chip">
                  {guestName(doc, id)}
                  <button
                    type="button"
                    className="chip-remove"
                    title="Take out of the group"
                    aria-label={`Take ${guestName(doc, id)} out of the group`}
                    onClick={() => onToggleGuest(id)}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}

          <select
            value=""
            aria-label="Add a guest to the group"
            onChange={(e) => {
              if (e.target.value) onToggleGuest(e.target.value);
            }}
          >
            <option value="">
              {picked.length === 0 ? 'Pick a guest…' : 'Add another guest…'}
            </option>
            {doc.guests
              .filter((g) => !chosen.has(g.id))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>

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
              {applyLabel}
            </button>
            {showMissing && (
              <button type="button" onClick={onApplyMissing}>
                Apply to {missing} missing
              </button>
            )}
            {picked.length > 0 && (
              <button type="button" onClick={onClear}>
                Clear
              </button>
            )}
          </div>

          {picked.length > 2 && (
            <p className="hint">
              {missing === pairs
                ? `All ${pairs} pairs get ${levelBadge(level)}.`
                : missing === 0
                  ? `Overwrites all ${pairs} existing pairings with ${levelBadge(level)}.`
                  : `${pairs - missing} of these pairs already exist — apply to all overwrites them, apply to missing leaves them as they are.`}
            </p>
          )}
        </div>
      )}

      {pairings.length === 0 ? (
        <p className="empty">
          No pairings yet. Everyone will be seated arbitrarily.
        </p>
      ) : (
        <ul className="list scroller">
          {pairings.map((p, i) => (
            <li
              key={p.id}
              className={[
                'pairing-row',
                i < focused.length ? 'row-selected' : '',
                // Opens a gap under the floated block.
                i === focused.length && focused.length > 0 ? 'after-focus' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <OutcomeDot outcome={outcomes.get(p.id)} />
              {/* Reads as a sentence: name, relation, name. */}
              <span className="pairing-name pairing-name-a">
                {guestName(doc, p.a)}
              </span>
              <select
                className={`level-select ${levelClass(p.level)}`}
                value={p.level}
                aria-label={`${guestName(doc, p.a)} and ${guestName(doc, p.b)}`}
                title={levelLabel(p.level)}
                onChange={(e) =>
                  onSetLevel(p.id, Number(e.target.value) as PairingLevel)
                }
              >
                {PAIRING_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {levelBadge(l)} {levelPhrase(l)}
                  </option>
                ))}
              </select>
              <span className="pairing-name">{guestName(doc, p.b)}</span>
              <button
                type="button"
                className="icon-button danger"
                title="Remove pairing"
                aria-label="Remove pairing"
                onClick={() => onRemove(p.id)}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
