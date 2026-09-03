'use client';

import { useState } from 'react';
import type { DragEvent } from 'react';
import type { SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> how many pairings they appear in, by direction. */
  counts: Map<string, { together: number; apart: number }>;
  /** The guests currently picked for a pairing or group, in the order picked. */
  selected: string[];
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  /** Put this guest in the group being composed, or take them back out. */
  onTogglePair: (id: string) => void;
  /** Move a guest so they sit before `index` in the list. */
  onReorder: (id: string, index: number) => void;
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
  onReorder,
}: GuestPanelProps) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  /**
   * Only the grip arms a drag: rows hold a text input, and a permanently
   * draggable row would fight selecting the name inside it.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where the row would land: an insertion point, 0 through guests.length. */
  const [dropAt, setDropAt] = useState<number | null>(null);

  const submit = () => {
    onAdd(name);
    setName('');
  };

  const endDrag = () => {
    setArmed(null);
    setDragging(null);
    setDropAt(null);
  };

  /** Above a row's midpoint drops before it, below drops after. */
  const insertionFor = (e: DragEvent<HTMLElement>, index: number) => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2 ? index : index + 1;
  };

  /**
   * The insertion point comes from the drop event rather than from `dropAt`,
   * which only drives the indicator. Reading state here would go stale if a drop
   * landed in the same frame as the dragover that preceded it.
   */
  const drop = (e: DragEvent<HTMLElement>, index: number) => {
    e.preventDefault();
    if (dragging !== null) onReorder(dragging, index);
    endDrag();
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
          Click the circles to pick guests — two for a single pairing, or a
          whole group to link them all at one level.
        </p>
      )}

      {doc.guests.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <ul
          className="list scroller"
          onDragOver={(e) => {
            // Only fires for the strip below the last row; rows handle their own.
            if (e.target === e.currentTarget) {
              e.preventDefault();
              setDropAt(doc.guests.length);
            }
          }}
          onDrop={(e) => {
            // Row drops bubble up here; only handle the strip below the list.
            if (e.target === e.currentTarget) drop(e, doc.guests.length);
          }}
        >
          {doc.guests.map((guest, index) => {
            const count = counts.get(guest.id) ?? { together: 0, apart: 0 };
            const total = count.together + count.apart;
            const pinnedTo = doc.pins[guest.id];
            const picked = selected.indexOf(guest.id);
            const slot = picked >= 0 ? picked + 1 : null;
            const last = index === doc.guests.length - 1;
            const className = [
              'guest-row',
              slot ? 'row-selected' : '',
              dragging === guest.id ? 'row-dragging' : '',
              dropAt === index ? 'drop-before' : '',
              dropAt === doc.guests.length && last ? 'drop-after' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={guest.id}
                className={className}
                draggable={armed === guest.id}
                onDragStart={(e) => {
                  setDragging(guest.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', guest.id);
                }}
                onDragEnd={endDrag}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropAt(insertionFor(e, index));
                }}
                onDrop={(e) => drop(e, insertionFor(e, index))}
              >
                <span
                  className="drag-handle"
                  title="Drag to reorder"
                  aria-hidden="true"
                  onMouseDown={() => setArmed(guest.id)}
                  onMouseUp={() => setArmed(null)}
                >
                  ⠿
                </span>
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
                  className={slot ? 'icon-button pair-slot' : 'icon-button'}
                  title={
                    slot
                      ? `Guest ${slot} of the group — click to take out`
                      : 'Pick for a pairing or group'
                  }
                  aria-label={
                    slot
                      ? `Take ${guest.name} out of the group`
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
