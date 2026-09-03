'use client';

import { useState } from 'react';
import type { SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> how many pairings they appear in, by direction. */
  counts: Map<string, { together: number; apart: number }>;
  /** The two guests currently armed for a pairing; '' when the slot is empty. */
  selected: { a: string; b: string };
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  /** Put this guest in a pairing slot, or take them out of the one they hold. */
  onTogglePair: (id: string) => void;
}

/** "3 pairings — 2 together, 1 apart", for the badge's tooltip. */
function countTitle(count: { together: number; apart: number }): string {
  const total = count.together + count.apart;
  const parts: string[] = [];
  if (count.together) parts.push(`${count.together} together`);
  if (count.apart) parts.push(`${count.apart} apart`);
  return `${total} pairing${total === 1 ? '' : 's'} — ${parts.join(', ')}`;
}

export default function GuestPanel({
  doc,
  counts,
  selected,
  onAdd,
  onAddMany,
  onRename,
  onRemove,
  onTogglePair,
}: GuestPanelProps) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const submit = () => {
    onAdd(name);
    setName('');
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Guests</h2>
        <span className="count">{doc.guests.length}</span>
      </div>

      <div className="add-row">
        <input
          type="text"
          value={name}
          placeholder="Add a guest"
          aria-label="Guest name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button type="button" onClick={submit} disabled={!name.trim()}>
          Add
        </button>
      </div>

      <button
        type="button"
        className="link-button"
        onClick={() => setBulkOpen((open) => !open)}
      >
        {bulkOpen ? 'Hide paste box' : 'Paste a list…'}
      </button>

      {bulkOpen && (
        <div className="bulk">
          <textarea
            rows={6}
            value={bulk}
            placeholder={'One name per line'}
            aria-label="Paste guest names, one per line"
            onChange={(e) => setBulk(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              onAddMany(bulk);
              setBulk('');
              setBulkOpen(false);
            }}
            disabled={!bulk.trim()}
          >
            Add these guests
          </button>
        </div>
      )}

      {doc.guests.length > 1 && (
        <p className="hint">
          Click the circles to pick two guests, then set their level in the
          Pairings panel.
        </p>
      )}

      {doc.guests.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <ul className="list scroller">
          {doc.guests.map((guest) => {
            const count = counts.get(guest.id) ?? { together: 0, apart: 0 };
            const total = count.together + count.apart;
            const pinnedTo = doc.pins[guest.id];
            const slot =
              guest.id === selected.a ? 1 : guest.id === selected.b ? 2 : null;
            return (
              <li
                key={guest.id}
                className={slot ? 'guest-row row-selected' : 'guest-row'}
              >
                <input
                  type="text"
                  className="name-input"
                  value={guest.name}
                  aria-label="Guest name"
                  onChange={(e) => onRename(guest.id, e.target.value)}
                />
                {pinnedTo !== undefined && (
                  <span
                    className="pin-mark"
                    title={`Pinned to table ${pinnedTo + 1}`}
                    aria-label={`Pinned to table ${pinnedTo + 1}`}
                  >
                    ◉
                  </span>
                )}
                {total > 0 && (
                  <span className="pair-badge" title={countTitle(count)}>
                    {total}
                  </span>
                )}
                <button
                  type="button"
                  className={
                    slot ? `icon-button pair-slot-${slot}` : 'icon-button'
                  }
                  title={
                    slot
                      ? `Guest ${slot} of the pairing — click to clear`
                      : 'Pick for a pairing'
                  }
                  aria-label={
                    slot
                      ? `Clear ${guest.name} from the pairing`
                      : `Pick ${guest.name} for a pairing`
                  }
                  aria-pressed={slot !== null}
                  onClick={() => onTogglePair(guest.id)}
                >
                  {slot ?? '○'}
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  title="Remove guest"
                  aria-label={`Remove ${guest.name}`}
                  onClick={() => onRemove(guest.id)}
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
