'use client';

import { useState } from 'react';
import type { SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> the table they are seated at, or undefined if unseated. */
  seats: Map<string, number>;
  /** The two guests currently armed for a pairing; '' when the slot is empty. */
  selected: { a: string; b: string };
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  /** Put this guest in a pairing slot, or take them out of the one they hold. */
  onTogglePair: (id: string) => void;
}

export default function GuestPanel({
  doc,
  seats,
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
            const table = seats.get(guest.id);
            const pinned = doc.pins[guest.id] !== undefined;
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
                {table !== undefined && (
                  <span
                    className={pinned ? 'table-badge badge-pinned' : 'table-badge'}
                    title={
                      pinned
                        ? `Pinned to table ${table + 1}`
                        : `Seated at table ${table + 1}`
                    }
                  >
                    T{table + 1}
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
