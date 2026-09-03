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
  /** Move guests so they sit together before `index` in the list. */
  onReorder: (ids: string[], index: number) => void;
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
  /**
   * The guests a drag is carrying. Dragging a ticked row takes the whole
   * selection along, gaps and all; dragging an unticked row takes only it and
   * leaves the selection alone.
   */
  const [moving, setMoving] = useState<string[] | null>(null);
  /** Where the row would land: an insertion point, 0 through guests.length. */
  const [dropAt, setDropAt] = useState<number | null>(null);

  const chosen = new Set(selected);

  /** What dragging this row would carry: the whole ticked set, or just it. */
  const carriedBy = (id: string) =>
    chosen.has(id) && selected.length > 1 ? selected : [id];

  const submit = () => {
    onAdd(name);
    setName('');
  };

  const endDrag = () => {
    setArmed(null);
    setMoving(null);
    setDropAt(null);
  };

  /**
   * Which insertion point the pointer is nearest, measured against the rows of
   * the whole list rather than the row under the cursor. Rows are separated by a
   * gap, and a gap belongs to no row — resolving the position from coordinates
   * instead means every pixel of the list is a valid drop target, gaps and the
   * strip below the last row included.
   */
  const insertionFor = (e: DragEvent<HTMLElement>) => {
    const rows = [...e.currentTarget.children] as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) return i;
    }
    return rows.length;
  };

  /**
   * The insertion point comes from the drop event rather than from `dropAt`,
   * which only drives the indicator. Reading state here would go stale if a drop
   * landed in the same frame as the dragover that preceded it.
   */
  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (moving !== null) onReorder(moving, insertionFor(e));
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
          Tick guests to pick them — two for a single pairing, or a whole group
          to link them all at one level.
        </p>
      )}

      {doc.guests.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <ul
          className="list scroller"
          onDragOver={(e) => {
            if (!moving) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropAt(insertionFor(e));
          }}
          onDrop={drop}
        >
          {doc.guests.map((guest, index) => {
            const count = counts.get(guest.id) ?? { together: 0, apart: 0 };
            const total = count.together + count.apart;
            const pinnedTo = doc.pins[guest.id];
            const picked = chosen.has(guest.id);
            const last = index === doc.guests.length - 1;
            const className = [
              'guest-row',
              picked ? 'row-selected' : '',
              moving?.includes(guest.id) ? 'row-dragging' : '',
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
                  setMoving(carriedBy(guest.id));
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', guest.id);
                }}
                onDragEnd={endDrag}
              >
                <span
                  className="drag-handle"
                  title={
                    carriedBy(guest.id).length > 1
                      ? `Drag to move all ${selected.length} ticked guests`
                      : 'Drag to reorder'
                  }
                  aria-hidden="true"
                  onMouseDown={() => setArmed(guest.id)}
                  onMouseUp={() => setArmed(null)}
                >
                  ⠿
                </span>
                <input
                  type="checkbox"
                  className="pair-check"
                  checked={picked}
                  title="Pick for a pairing or group"
                  aria-label={`Pick ${guest.name} for a pairing`}
                  onChange={() => onTogglePair(guest.id)}
                />
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
