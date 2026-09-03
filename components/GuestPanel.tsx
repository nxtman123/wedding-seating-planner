'use client';

import { useState } from 'react';
import type { DragEvent } from 'react';
import { groupMembers } from '@/lib/guests';
import type { SeatingDoc } from '@/lib/types';

export interface GuestPanelProps {
  doc: SeatingDoc;
  /** Guest id -> how many pairings they appear in, by direction. */
  counts: Map<string, { together: number; apart: number }>;
  /** Guests named by a floated pairing — their count badge is marked. */
  linked: Set<string>;
  /** The guests currently picked for a pairing or group, in the order picked. */
  selected: string[];
  onAdd: (name: string) => void;
  onAddMany: (text: string) => void;
  onAddGroup: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
  /** Delete every ticked guest, after confirming. */
  onDeletePicked: () => void;
  /** Put this guest in the group being composed, or take them back out. */
  onTogglePair: (id: string) => void;
  /** Move guests under `groupId`, sitting before `index` in the list. */
  onReorder: (ids: string[], groupId: string | null, index: number) => void;
  /** Move a group so it sits before `index` among the groups. */
  onReorderGroup: (id: string, index: number) => void;
  /** Drop every ticked guest into this group. */
  onAddPickedToGroup: (groupId: string) => void;
}

/** "3 pairings — 2 together, 1 apart", for the badge's tooltip. */
function countTitle(count: { together: number; apart: number }): string {
  const total = count.together + count.apart;
  const parts: string[] = [];
  if (count.together) parts.push(`${count.together} together`);
  if (count.apart) parts.push(`${count.apart} apart`);
  return `${total} pairing${total === 1 ? '' : 's'} — ${parts.join(', ')}`;
}

/** Where a drop would land: a position in the list, under a given group. */
interface DropPoint {
  groupId: string | null;
  /** Index into `doc.guests`, which the list draws in order. */
  index: number;
  y: number;
}

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
  const [groupName, setGroupName] = useState('');
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
  /** For a group drag, the index among groups the drop would land at. */
  const [groupDropAt, setGroupDropAt] = useState<number | null>(null);

  const chosen = new Set(selected);

  /** What dragging this row would carry: the whole ticked set, or just it. */
  const carriedBy = (id: string): string[] =>
    chosen.has(id) && selected.length > 1 ? selected : [id];

  const endDrag = () => {
    setArmed(null);
    setCargo(null);
    setDropAt(null);
    setGroupDropAt(null);
  };

  /**
   * Every place a guest could land, read off the rendered sections. Sections are
   * padded apart and one may be empty, so rather than asking what is under the
   * cursor the drop resolves to the nearest of these — which makes the whole
   * list live, padding included.
   */
  const dropPoints = (list: HTMLElement): DropPoint[] => {
    const points: DropPoint[] = [];
    for (const section of list.querySelectorAll<HTMLElement>('[data-group]')) {
      const groupId = section.dataset.group || null;
      const start = Number(section.dataset.start);
      const rows = [...section.querySelectorAll<HTMLElement>('.guest-row')];
      if (rows.length === 0) {
        const box = section.getBoundingClientRect();
        points.push({ groupId, index: start, y: box.top + box.height / 2 });
        continue;
      }
      rows.forEach((row, i) => {
        points.push({
          groupId,
          index: start + i,
          y: row.getBoundingClientRect().top,
        });
      });
      points.push({
        groupId,
        index: start + rows.length,
        y: rows[rows.length - 1].getBoundingClientRect().bottom,
      });
    }
    return points;
  };

  /** Nearest insertion point to the pointer. */
  const pointFor = (e: DragEvent<HTMLElement>): DropPoint | null => {
    const points = dropPoints(e.currentTarget);
    let best: DropPoint | null = null;
    let bestGap = Infinity;
    for (const p of points) {
      const gap = Math.abs(e.clientY - p.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  };

  /** Where a dragged group would land, among the group headings. */
  const groupIndexFor = (e: DragEvent<HTMLElement>): number => {
    const heads = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('.group-section'),
    ];
    for (let i = 0; i < heads.length; i++) {
      const box = heads[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) return i;
    }
    return heads.length;
  };

  const over = (e: DragEvent<HTMLElement>) => {
    if (!cargo) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (cargo.kind === 'group') setGroupDropAt(groupIndexFor(e));
    else setDropAt(pointFor(e));
  };

  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (cargo?.kind === 'group') {
      onReorderGroup(cargo.id, groupIndexFor(e));
    } else if (cargo?.kind === 'guests') {
      const point = pointFor(e);
      if (point) onReorder(cargo.ids, point.groupId, point.index);
    }
    endDrag();
  };

  const submitGuest = () => {
    onAdd(name);
    setName('');
  };
  const submitGroup = () => {
    onAddGroup(groupName);
    setGroupName('');
  };

  /* ----- sections ----- */

  const loose = groupMembers(doc, null);
  const sections = [
    { group: null, members: loose },
    ...doc.groups.map((g) => ({ group: g, members: groupMembers(doc, g.id) })),
  ];

  /** Renders one guest, given its index into `doc.guests`. */
  const guestRow = (guest: SeatingDoc['guests'][number], index: number) => {
    const count = counts.get(guest.id) ?? { together: 0, apart: 0 };
    const total = count.together + count.apart;
    const pinnedTo = doc.pins[guest.id];
    const picked = chosen.has(guest.id);
    const moving = cargo?.kind === 'guests' && cargo.ids.includes(guest.id);
    const className = [
      'guest-row',
      picked ? 'row-selected' : '',
      moving ? 'row-dragging' : '',
      dropAt?.index === index ? 'drop-before' : '',
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
          <span
            className={
              linked.has(guest.id) ? 'pair-badge badge-linked' : 'pair-badge'
            }
            title={countTitle(count)}
          >
            {total}
          </span>
        )}
      </li>
    );
  };

  let cursor = 0;

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
            if (e.key === 'Enter') submitGuest();
          }}
        />
        <button type="button" onClick={submitGuest} disabled={!name.trim()}>
          Add
        </button>
      </div>

      <div className="add-row">
        <input
          type="text"
          value={groupName}
          placeholder="Add a group"
          aria-label="Group name"
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitGroup();
          }}
        />
        <button
          type="button"
          onClick={submitGroup}
          disabled={!groupName.trim()}
        >
          Add
        </button>
      </div>

      <div className="guest-actions">
        <button type="button" onClick={() => setBulkOpen((open) => !open)}>
          {bulkOpen ? 'Hide paste box' : 'Paste a list…'}
        </button>
        {selected.length > 0 && (
          <button type="button" className="danger" onClick={onDeletePicked}>
            {selected.length === 1
              ? 'Delete guest'
              : `Delete ${selected.length} guests`}
          </button>
        )}
      </div>

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

      {doc.guests.length === 0 && doc.groups.length === 0 ? (
        <p className="empty">No guests yet. Add a few to get started.</p>
      ) : (
        <div className="scroller sections" onDragOver={over} onDrop={drop}>
          {sections.map(({ group, members }, sectionIndex) => {
            const start = cursor;
            cursor += members.length;
            const dragging = cargo?.kind === 'group' && cargo.id === group?.id;
            // Group headings are the boundaries a dragged group lands between.
            const groupPos = sectionIndex - 1;
            return (
              <div
                key={group?.id ?? 'loose'}
                data-group={group?.id ?? ''}
                data-start={start}
                className={[
                  group ? 'group-section' : 'loose-section',
                  dragging ? 'row-dragging' : '',
                  group && groupDropAt === groupPos ? 'group-drop-before' : '',
                  group &&
                  groupDropAt === doc.groups.length &&
                  groupPos === doc.groups.length - 1
                    ? 'group-drop-after'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={group ? armed === group.id : undefined}
                onDragStart={
                  group
                    ? (e) => {
                        // Only the section itself, never a row bubbling up.
                        if (e.target !== e.currentTarget) return;
                        setCargo({ kind: 'group', id: group.id });
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', group.id);
                      }
                    : undefined
                }
                onDragEnd={group ? endDrag : undefined}
              >
                {group && (
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
                    <span className="count">{members.length}</span>
                    {selected.length > 0 && (
                      <button
                        type="button"
                        className="group-add"
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
                )}
                <ul className="list">
                  {members.map((guest, i) => guestRow(guest, start + i))}
                  {members.length === 0 && group && (
                    <li className="group-empty">Drag guests here</li>
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
