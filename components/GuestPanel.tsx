'use client';

import { useState } from 'react';
import type { SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> the table they are seated at, or undefined if unseated. */
  seats: Map<string, number>;
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  /** Toggle the guest's pin between "locked here" and free. */
  onTogglePin: (id: string) => void;
}

export default function GuestPanel({
  doc,
  seats,
  onAdd,
  onAddMany,
  onRename,
  onRemove,
  onTogglePin,
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

      {doc.guests.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <ul className="list">
          {doc.guests.map((guest) => {
            const table = seats.get(guest.id);
            const pinned = doc.pins[guest.id] !== undefined;
            return (
              <li key={guest.id} className="guest-row">
                <input
                  type="text"
                  className="name-input"
                  value={guest.name}
                  aria-label="Guest name"
                  onChange={(e) => onRename(guest.id, e.target.value)}
                />
                {table !== undefined && (
                  <span className="table-badge">T{table + 1}</span>
                )}
                <button
                  type="button"
                  className={pinned ? 'icon-button pin-on' : 'icon-button'}
                  title={
                    pinned
                      ? 'Unpin — let the solver move them'
                      : table === undefined
                        ? 'Generate a seating first, then pin'
                        : `Pin to table ${table + 1}`
                  }
                  aria-label={pinned ? 'Unpin guest' : 'Pin guest to table'}
                  disabled={!pinned && table === undefined}
                  onClick={() => onTogglePin(guest.id)}
                >
                  {pinned ? '◉' : '○'}
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
