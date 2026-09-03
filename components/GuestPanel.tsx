'use client';

import { useState } from 'react';
import type { DragEvent } from 'react';
import { levelClass, levelPhrase } from '@/lib/defaults';
import { groupMembers } from '@/lib/guests';
import type { Group, Guest, PairingLevel, SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> their pairings tallied by level, strongest first. */
  counts: Map<string, { level: PairingLevel; count: number }[]>;
  /** Guests named by a floated pairing — their row is marked. */
  linked: Set<string>;
  /** The guests currently picked for a pairing or group, in the order picked. */
  selected: string[];
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  /** Add a group at the top of the list, taking any ticked guests into it. */
  onAddGroup: () => void;
  onRename: (id: string, name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
  /** Delete every ticked guest, after confirming. */
  onDeletePicked: () => void;
  /**
   * Put this guest in the group being composed, or take them back out. With
   * `extend`, take everyone between them and the last one ticked instead.
   */
  onTogglePair: (id: string, extend?: boolean) => void;
  /** Move guests under `groupId`, sitting before `index` in the list. */
  onReorder: (ids: string[], groupId: string | null, index: number) => void;
  /** Move a group so it sits before `index` among the groups. */
  onReorderGroup: (id: string, index: number) => void;
  /** Drop every ticked guest into this group. */
  onAddPickedToGroup: (groupId: string) => void;
}

/**
 * Where a drop would land: between two top-level entries, or between two members
 * of a group. Groups can only take the first kind; guests can take either.
 */
type DropPoint =
  | { kind: 'top'; index: number; y: number }
  | { kind: 'member'; groupId: string; index: number; y: number };

/** What a drag is carrying. */
type Cargo =
  | { kind: 'guests'; ids: string[] }
  | { kind: 'group'; id: string };

export default function GuestPanel({
  doc,
  counts,
  linked,
  selected,
  onAdd,
  onAddMany,
  onAddGroup,
  onRename,
  onRenameGroup,
  onRemoveGroup,
  onDeletePicked,
  onTogglePair,
  onReorder,
  onReorderGroup,
  onAddPickedToGroup,
}: GuestPanelProps) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  /**
   * Only a grip arms a drag: rows hold a text input, and a permanently
   * draggable row would fight selecting the name inside it.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const [cargo, setCargo] = useState<Cargo | null>(null);
  /** Where the drop would land, for the indicator line. */
  const [dropAt, setDropAt] = useState<DropPoint | null>(null);

  const chosen = new Set(selected);

  /** What dragging this row would carry: the whole ticked set, or just it. */
  const carriedBy = (id: string): string[] =>
    chosen.has(id) && selected.length > 1 ? selected : [id];

  const endDrag = () => {
    setArmed(null);
    setCargo(null);
    setDropAt(null);
  };

  /**
   * Every place a drop could land, read off what is rendered. Entries are padded
   * apart and a group may be empty, so rather than asking what sits under the
   * cursor the drop resolves to the nearest of these — which keeps the whole
   * list live, padding included.
   *
   * `top` points come from the boundaries between top-level entries; `member`
   * points from the rows inside each group. A dragged group ignores the second
   * kind, since a group cannot go inside another.
   */
  const dropPoints = (list: HTMLElement, forGroup: boolean): DropPoint[] => {
    const points: DropPoint[] = [];
    const entries = [
      ...list.querySelectorAll<HTMLElement>(':scope > [data-entry]'),
    ];
    entries.forEach((entry, i) => {
      const box = entry.getBoundingClientRect();
      points.push({ kind: 'top', index: i, y: box.top });
      if (i === entries.length - 1) {
        points.push({ kind: 'top', index: entries.length, y: box.bottom });
      }
      const groupId = entry.dataset.group;
      if (forGroup || !groupId) return;
      const rows = [...entry.querySelectorAll<HTMLElement>('.guest-row')];
      if (rows.length === 0) {
        const body = entry.querySelector<HTMLElement>('.list');
        const b = (body ?? entry).getBoundingClientRect();
        points.push({
          kind: 'member',
          groupId,
          index: 0,
          y: b.top + b.height / 2,
        });
        return;
      }
      rows.forEach((row, j) => {
        points.push({
          kind: 'member',
          groupId,
          index: j,
          y: row.getBoundingClientRect().top,
        });
      });
      points.push({
        kind: 'member',
        groupId,
        index: rows.length,
        y: rows[rows.length - 1].getBoundingClientRect().bottom,
      });
    });
    return points;
  };

  /** Nearest insertion point to the pointer. */
  const pointFor = (
    e: DragEvent<HTMLElement>,
    forGroup: boolean,
  ): DropPoint | null => {
    let best: DropPoint | null = null;
    let bestGap = Infinity;
    for (const p of dropPoints(e.currentTarget, forGroup)) {
      const gap = Math.abs(e.clientY - p.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  };

  const over = (e: DragEvent<HTMLElement>) => {
    if (!cargo) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropAt(pointFor(e, cargo.kind === 'group'));
  };

  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const point = pointFor(e, cargo?.kind === 'group');
    if (point) {
      if (cargo?.kind === 'group' && point.kind === 'top') {
        onReorderGroup(cargo.id, point.index);
      } else if (cargo?.kind === 'guests') {
        if (point.kind === 'top') onReorder(cargo.ids, null, point.index);
        else onReorder(cargo.ids, point.groupId, point.index);
      }
    }
    endDrag();
  };

  const submitGuest = () => {
    onAdd(name);
    setName('');
  };

  /* ----- sections ----- */

  /** The list as drawn: each top-level entry is a loose guest or a group. */
  type Entry =
    | { group: Group; guest: null; members: Guest[] }
    | { group: null; guest: Guest; members: Guest[] };
  const byId = new Map(doc.guests.map((g) => [g.id, g]));
  const entries: Entry[] = doc.order.flatMap((id): Entry[] => {
    const group = doc.groups.find((g) => g.id === id);
    if (group) {
      return [{ group, guest: null, members: groupMembers(doc, group.id) }];
    }
    const guest = byId.get(id);
    return guest ? [{ group: null, guest, members: [] }] : [];
  });

  /**
   * One guest row. `mark` is the drop indicator to draw above it, if the pending
   * drop would land there.
   */
  const guestRow = (guest: Guest, mark: boolean) => {
    const tally = counts.get(guest.id) ?? [];
    const pinnedTo = doc.pins[guest.id];
    const picked = chosen.has(guest.id);
    const moving = cargo?.kind === 'guests' && cargo.ids.includes(guest.id);
    const className = [
      'guest-row',
      picked ? 'row-selected' : '',
      // Not picked, but named by one of the pairings floated to the top —
      // the same pale band the pairing list gives those.
      !picked && linked.has(guest.id) ? 'row-adjacent' : '',
      moving ? 'row-dragging' : '',
      mark ? 'drop-before' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <li
        key={guest.id}
        className={className}
        draggable={armed === guest.id}
        onDragStart={(e) => {
          // Rows inside a group sit within a draggable section, and dragstart
          // bubbles — without this the section would claim the drag and reorder
          // the group instead of moving the guest.
          e.stopPropagation();
          setCargo({ kind: 'guests', ids: carriedBy(guest.id) });
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', guest.id);
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          endDrag();
        }}
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
          title="Pick for a pairing or group — shift-click to take a run of them"
          aria-label={`Pick ${guest.name} for a pairing`}
          /* The work happens on click, which carries the shift key and covers
             the keyboard too; change exists only to keep this controlled. */
          onChange={() => {}}
          onClick={(e) => onTogglePair(guest.id, e.shiftKey)}
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
        {tally.map(({ level, count }) => (
          <span
            key={level}
            className={`count-chip ${levelClass(level)}`}
            title={`${count} ${levelPhrase(level)}`}
          >
            {count}
          </span>
        ))}
      </li>
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Guests</h2>
        <button
          type="button"
          className="link-button"
          onClick={() => setBulkOpen((open) => !open)}
        >
          {bulkOpen ? 'Add one at a time' : 'Paste a list'}
        </button>
        <span className="count">{doc.guests.length}</span>
      </div>

      {/* One row, in one of two modes: a name and Add, or a paste box and Add
          these. Swapping in place keeps the panel from growing a second form. */}
      <div className={bulkOpen ? 'add-row add-row-bulk' : 'add-row'}>
        {bulkOpen ? (
          <>
            <textarea
              rows={6}
              value={bulk}
              placeholder="One name per line"
              aria-label="Paste guest names, one per line"
              autoFocus
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
          </>
        ) : (
          <>
            <input
              type="text"
              value={name}
              placeholder="Add a guest"
              aria-label="Guest name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitGuest();
              }}
            />
            <button type="button" onClick={submitGuest} disabled={!name.trim()}>
              Add
            </button>
          </>
        )}
      </div>

      <div className="guest-actions">
        <button type="button" onClick={onAddGroup}>
          {selected.length > 0
            ? `New group of ${selected.length}`
            : 'Add a group'}
        </button>
        {selected.length > 0 && (
          <button type="button" className="danger" onClick={onDeletePicked}>
            {selected.length === 1
              ? 'Delete guest'
              : `Delete ${selected.length} guests`}
          </button>
        )}
      </div>

      {doc.guests.length === 0 && doc.groups.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <div className="scroller sections" onDragOver={over} onDrop={drop}>
          {entries.map(({ group, guest, members }, i) => {
            const topMark = dropAt?.kind === 'top' && dropAt.index === i;
            const lastMark =
              dropAt?.kind === 'top' &&
              dropAt.index === entries.length &&
              i === entries.length - 1;

            if (guest) {
              return (
                <div
                  key={guest.id}
                  data-entry=""
                  className={[
                    'entry',
                    topMark ? 'drop-before' : '',
                    lastMark ? 'drop-after' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <ul className="list">{guestRow(guest, false)}</ul>
                </div>
              );
            }
            if (!group) return null;

            const dragging = cargo?.kind === 'group' && cargo.id === group.id;
            return (
              <div
                key={group.id}
                data-entry=""
                data-group={group.id}
                className={[
                  'entry',
                  'group-section',
                  dragging ? 'row-dragging' : '',
                  topMark ? 'drop-before' : '',
                  lastMark ? 'drop-after' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={armed === group.id}
                onDragStart={(e) => {
                  // Only the section itself, never a row bubbling up.
                  if (e.target !== e.currentTarget) return;
                  setCargo({ kind: 'group', id: group.id });
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', group.id);
                }}
                onDragEnd={endDrag}
              >
                <div className="group-head">
                  <span
                    className="drag-handle"
                    title="Drag to reorder the group"
                    aria-hidden="true"
                    onMouseDown={() => setArmed(group.id)}
                    onMouseUp={() => setArmed(null)}
                  >
                    ⠿
                  </span>
                  <input
                    type="text"
                    className="group-name"
                    value={group.name}
                    aria-label="Group name"
                    onChange={(e) => onRenameGroup(group.id, e.target.value)}
                  />
                  {selected.length > 0 && (
                    <button
                      type="button"
                      className="add-picked"
                      onClick={() => onAddPickedToGroup(group.id)}
                    >
                      Add to group
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button danger"
                    title="Remove the group and turn its guests loose"
                    aria-label={`Remove the group ${group.name}`}
                    onClick={() => onRemoveGroup(group.id)}
                  >
                    &times;
                  </button>
                </div>
                <ul className="list">
                  {members.map((m, j) =>
                    guestRow(
                      m,
                      dropAt?.kind === 'member' &&
                        dropAt.groupId === group.id &&
                        dropAt.index === j,
                    ),
                  )}
                  {members.length === 0 && (
                    <li
                      className={
                        dropAt?.kind === 'member' && dropAt.groupId === group.id
                          ? 'group-empty drop-before'
                          : 'group-empty'
                      }
                    >
                      Drag guests here
                    </li>
                  )}
                  {members.length > 0 &&
                    dropAt?.kind === 'member' &&
                    dropAt.groupId === group.id &&
                    dropAt.index === members.length && (
                      <li className="drop-tail" aria-hidden="true" />
                    )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
