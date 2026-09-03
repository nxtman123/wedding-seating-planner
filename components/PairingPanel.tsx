'use client';

import { useState } from 'react';
import {
  PAIRING_LEVELS,
  levelBadge,
  levelClass,
  levelLabel,
  levelShort,
} from '@/lib/defaults';
import { guestName, sortedPairings } from '@/lib/guests';
import type { PairingLevel, PairingOutcome, SeatingDoc } from '@/lib/types';

export interface PairingPanelProps {
  doc: SeatingDoc;
  /** Pairing id -> how it fared in the current seating. Empty before a solve. */
  outcomes: Map<string, PairingOutcome>;
  onAdd: (a: string, b: string, level: PairingLevel) => void;
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
  onAdd,
  onSetLevel,
  onRemove,
}: PairingPanelProps) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [level, setLevel] = useState<PairingLevel>(1);

  const canAdd = a !== '' && b !== '' && a !== b;
  const submit = () => {
    if (!canAdd) return;
    onAdd(a, b, level);
    setA('');
    setB('');
  };

  const pairings = sortedPairings(doc);

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
            value={a}
            aria-label="First guest"
            onChange={(e) => setA(e.target.value)}
          >
            <option value="">Guest…</option>
            {doc.guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={b}
            aria-label="Second guest"
            onChange={(e) => setB(e.target.value)}
          >
            <option value="">Guest…</option>
            {doc.guests.map((g) => (
              <option key={g.id} value={g.id} disabled={g.id === a}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={level}
            aria-label="Priority level"
            onChange={(e) =>
              setLevel(Number(e.target.value) as PairingLevel)
            }
          >
            {PAIRING_LEVELS.map((l) => (
              <option key={l} value={l}>
                {levelBadge(l)} · {levelLabel(l)}
              </option>
            ))}
          </select>
          <button type="button" onClick={submit} disabled={!canAdd}>
            Add pairing
          </button>
        </div>
      )}

      {pairings.length === 0 ? (
        <p className="empty">
          No pairings yet. Everyone will be seated arbitrarily.
        </p>
      ) : (
        <ul className="list">
          {pairings.map((p) => (
            <li key={p.id} className="pairing-row">
              <OutcomeDot outcome={outcomes.get(p.id)} />
              <span className="pairing-names">
                {guestName(doc, p.a)}
                <span className="joiner">
                  {p.level > 0 ? ' with ' : ' away from '}
                </span>
                {guestName(doc, p.b)}
              </span>
              <select
                className={`level-select ${levelClass(p.level)}`}
                value={p.level}
                aria-label="Priority level"
                title={levelLabel(p.level)}
                onChange={(e) =>
                  onSetLevel(p.id, Number(e.target.value) as PairingLevel)
                }
              >
                {PAIRING_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {levelShort(l)}
                  </option>
                ))}
              </select>
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
