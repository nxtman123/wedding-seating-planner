'use client';

import { useEffect, useRef, useState } from 'react';

import {
  levelBadge,
  levelClass,
  levelPhrase,
  levelWeight,
} from '@/lib/defaults';
import { guestName, tableName } from '@/lib/guests';
import {
  conflictsAtTable,
  seatCount,
  seatIndex,
  tableCount,
  tableSizes,
} from '@/lib/solver';
import type { LevelTally, SeatingDoc } from '@/lib/types';
import PinIcon from '@/components/PinIcon';
import blurOnEnter from '@/components/blurOnEnter';

export interface TablePanelProps {
  doc: SeatingDoc;
  /** Guests currently ticked in the guest list, marked with a dot at their seat. */
  selected: string[];
  /** Score of the current arrangement, or null before the first Generate. */
  score: number | null;
  /** How each level fared, strongest first. Only levels in use appear. */
  breakdown: LevelTally[];
  onSpecChange: (id: string, patch: { count?: number; seats?: number }) => void;
  onSpecAdd: () => void;
  onSpecRemove: (id: string) => void;
  /** Seat every ticked guest at this table and pin them there. */
  onAddPickedToTable: (tableIndex: number) => void;
  onRenameTable: (tableIndex: number, name: string) => void;
  /** Move the table at `from` so it sits before position `to`. */
  onMoveTable: (from: number, to: number) => void;
  onGenerate: () => void;
  /** True while the solver is working, so the button can show it. */
  solving: boolean;
  onTogglePin: (guestId: string) => void;
  onClearPins: () => void;
}

export default function TablePanel({
  doc,
  selected,
  score,
  breakdown,
  onSpecChange,
  onSpecAdd,
  onSpecRemove,
  onAddPickedToTable,
  onRenameTable,
  onMoveTable,
  onGenerate,
  solving,
  onTogglePin,
  onClearPins,
}: TablePanelProps) {
  const tables = tableCount(doc);
  /*
   * Only a grip arms a drag: the card's heading is a text field, and a card that
   * was always draggable would fight selecting the name inside it.
   */
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  /** Where a drop would land, as the position it would be inserted before. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  /*
   * Which table's name is being edited, if any.
   *
   * At rest an unnamed table's number is drawn as the heading itself, so the
   * placeholder wears the heading's ink. That is wrong the moment you are typing
   * into the field, where text you cannot edit and text you can would look
   * alike. The class is carried here rather than by `:focus::placeholder`, which
   * this browser does not apply.
   */
  const [editing, setEditing] = useState<number | null>(null);

  const endDrag = () => {
    setArmed(null);
    setDragging(null);
    setDropAt(null);
  };

  /*
   * While a table is in the air the page itself holds still, so the only thing
   * that moves is the list being rearranged. Otherwise a drag towards the foot
   * of the panel pulls the whole page down instead — the cards you are aiming
   * at leave the window, and the drop lands somewhere you did not choose.
   */
  useEffect(() => {
    if (dragging === null) return;
    const root = document.documentElement;
    const held = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = held;
    };
  }, [dragging]);

  /*
   * The list scrolls itself while you hover near its ends.
   *
   * The browser does this on its own, but only within a few pixels of the edge,
   * which is a hard thing to hold a drag inside of. This reaches `EDGE_PULL`
   * pixels in and gets faster the closer you are, so the whole bottom of the
   * panel is somewhere you can rest a drag and let the list come to you.
   *
   * `dragover` only says where the cursor is; the scrolling has to be its own
   * clock, or a drag held still would stop the moment the events did.
   */
  const scrollSpeed = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (dragging === null) return;
    const tick = window.setInterval(() => {
      const list = listRef.current;
      if (list && scrollSpeed.current !== 0) {
        list.scrollTop += scrollSpeed.current;
      }
    }, 16);
    return () => {
      window.clearInterval(tick);
      scrollSpeed.current = 0;
    };
  }, [dragging]);

  /** How near an end the cursor pulls the list along, and how hard at the very end. */
  const EDGE_PULL = 80;
  const EDGE_SPEED = 20;

  const pullTowardsEnds = (list: HTMLElement, y: number) => {
    const box = list.getBoundingClientRect();
    const fromTop = y - box.top;
    const fromBottom = box.bottom - y;
    const speed = (depth: number) =>
      Math.ceil(((EDGE_PULL - depth) / EDGE_PULL) * EDGE_SPEED);
    if (fromTop < EDGE_PULL) scrollSpeed.current = -speed(Math.max(0, fromTop));
    else if (fromBottom < EDGE_PULL) {
      scrollSpeed.current = speed(Math.max(0, fromBottom));
    } else scrollSpeed.current = 0;
  };

  /*
   * Cards wrap into a grid rather than a column, so a drop cannot be resolved by
   * height alone. It goes to whichever card's middle is nearest the cursor, and
   * lands before or after it depending on which side of that middle the cursor
   * is — which reads correctly along a row and still picks the right row when
   * the cursor is between two.
   */
  const dropIndex = (list: HTMLElement, x: number, y: number): number => {
    const cards = [
      ...list.querySelectorAll<HTMLElement>(':scope > [data-table]'),
    ];
    let best = 0;
    let bestDistance = Infinity;
    cards.forEach((card, i) => {
      const box = card.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = x < cx ? i : i + 1;
      }
    });
    return best;
  };

  const sizes = tableSizes(doc);
  const seats = seatCount(doc);
  const seated = doc.tables.reduce((n, t) => n + t.length, 0);
  const placed = seatIndex(doc.tables);
  const unseated = doc.guests.filter((g) => !placed.has(g.id));
  const pinCount = Object.keys(doc.pins).length;
  const chosen = new Set(selected);

  return (
    <section className="panel panel-tables">
      <div className="panel-header">
        <h2>Tables</h2>
        <span className="count">{tables}</span>
      </div>

      {/* Describing the room and reading the result are two jobs. Side by side
          while the panel is wide enough for both, stacked when it is not. */}
      <div className="table-setup">
        <div className="setup-room">
          {/* The room, a row at a time, so a few sixteens can sit beside the eights. */}
          <ul className="room-rows">
        {doc.tableSpecs.map((spec) => (
          <li key={spec.id}>
            <input
              type="number"
              min={0}
              max={200}
              value={spec.count}
              aria-label="How many tables"
              onChange={(e) =>
                onSpecChange(spec.id, { count: Number(e.target.value) })
              }
              onKeyDown={blurOnEnter}
            />
            <span>{spec.count === 1 ? 'table of' : 'tables of'}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={spec.seats}
              aria-label="Seats at each"
              onChange={(e) =>
                onSpecChange(spec.id, { seats: Number(e.target.value) })
              }
              onKeyDown={blurOnEnter}
            />
            <span>{spec.seats === 1 ? 'seat' : 'seats'}</span>
            <button
              type="button"
              className="icon-button danger"
              title="Remove this row"
              aria-label={`Remove the row of ${spec.count} tables of ${spec.seats}`}
              onClick={() => onSpecRemove(spec.id)}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="room-add" onClick={onSpecAdd}>
        Add more tables
      </button>

      <p className={seats < doc.guests.length ? 'hint hint-short' : 'hint'}>
        {tables} table{tables === 1 ? '' : 's'}, {seats} place
        {seats === 1 ? '' : 's'} for {doc.guests.length} guest
        {doc.guests.length === 1 ? '' : 's'}
        {seats < doc.guests.length
          ? ` — ${doc.guests.length - seats} short`
          : ''}
        .
      </p>

        </div>

        <div className="setup-outcome">
          <div className="generate-row">
        <button
          type="button"
          className={solving ? 'primary generating' : 'primary'}
          onClick={onGenerate}
          disabled={solving || doc.guests.length === 0}
        >
          {/* The label stays in the box while it spins, hidden rather than
              removed, so the button holds its size and the spinner has
              something to be centred in. */}
          <span className="label">
            Generate seating <kbd>G</kbd>
          </span>
          {solving && <span className="spinner" />}
        </button>
        {pinCount > 0 && (
          <button type="button" onClick={onClearPins}>
            Clear {pinCount} pin{pinCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {score !== null && seated > 0 && (
        <>
          <p className="score">
            Score <strong>{score.toLocaleString()}</strong>
          </p>
          {/* Per level, because one broken "must sit with" matters more than a
              dozen unseated "could"s, and a bare total hides which it was.
              A level worth nothing either way is the exception: leaving one of
              those unseated costs the score nothing, so it is a plain count
              rather than a verdict, and it sits under the verdicts rather than
              interrupting them. */}
          <ul className="score-lines">
            {breakdown
              .filter(({ level }) => levelWeight(level) !== 0)
              .map(({ level, violated }) => (
                <li
                  key={level}
                  className={violated === 0 ? 'score-ok' : 'score-bad'}
                >
                  {violated === 0
                    ? `✓ all ${levelPhrase(level)} pairings honored`
                    : `${violated} ${levelPhrase(level)} pairing${
                        violated === 1 ? '' : 's'
                      } not honored`}
                </li>
              ))}
            {breakdown
              .filter(({ level }) => levelWeight(level) === 0)
              .map(({ level, total, violated }) => (
                <li key={level} className="score-note">
                  {total - violated} / {total} {levelPhrase(level)} pairings
                  honored
                </li>
              ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {unseated.length > 0 && doc.tables.length > 0 && (
        <div className="unseated">
          <h3>
            Nowhere to sit
            <span className="count">{unseated.length}</span>
          </h3>
          <p>{unseated.map((g) => g.name).join(', ')}</p>
        </div>
      )}

      {doc.tables.length === 0 ? (
        <p className="empty">
          No seating yet. Press <em>Generate seating</em> once your guests and
          pairings are in.
        </p>
      ) : (
        <div
          ref={listRef}
          className="tables scroller"
          onDragOver={(e) => {
            if (dragging === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropAt(dropIndex(e.currentTarget, e.clientX, e.clientY));
            pullTowardsEnds(e.currentTarget, e.clientY);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null && dropAt !== null) onMoveTable(dragging, dropAt);
            endDrag();
          }}
        >
          {doc.tables.map((table, i) => {
            const conflicts = conflictsAtTable(doc, doc.tables, i);
            // A table holding anyone currently ticked gets the same gentle
            // highlight the pairing rows use.
            const holdsPicked = table.some((id) => chosen.has(id));
            const className = [
              'table-card',
              holdsPicked ? 'row-selected' : '',
              dragging === i ? 'row-dragging' : '',
              dropAt === i ? 'drop-before' : '',
              dropAt === doc.tables.length && i === doc.tables.length - 1
                ? 'drop-after'
                : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={i}
                data-table=""
                className={className}
                draggable={armed === i}
                onDragStart={(e) => {
                  setDragging(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragEnd={endDrag}
              >
                <div className="table-head">
                  <span
                    className="drag-handle"
                    title="Drag to reorder"
                    aria-hidden="true"
                    onMouseDown={() => setArmed(i)}
                    onMouseUp={() => setArmed(null)}
                  >
                    ⠿
                  </span>
                  {/* An h3 for the outline, an invisible field inside it for
                      editing — the input inherits the heading's own type. The
                      field holds only what the table was actually named, so its
                      number shows through as a placeholder and clearing the
                      field gives that number back. */}
                  <h3>
                    <input
                      type="text"
                      className={
                        editing === i ? 'table-name is-editing' : 'table-name'
                      }
                      value={doc.tableNames[i] ?? ''}
                      placeholder={`Table ${i + 1}`}
                      aria-label={`Name of table ${i + 1}`}
                      onChange={(e) => onRenameTable(i, e.target.value)}
                      onFocus={() => setEditing(i)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={blurOnEnter}
                    />
                  </h3>
                  <span className="count">
                    {table.length}/{sizes[i]}
                  </span>
                </div>
                {table.length === 0 ? (
                  <p className="empty">Empty</p>
                ) : (
                  <ul className="seat-list">
                    {table.map((id) => {
                      const pinned = doc.pins[id] !== undefined;
                      const picked = chosen.has(id);
                      return (
                        <li key={id}>
                          {/* Always present, so names stay aligned whether or
                              not anyone at the table is ticked. */}
                          <span
                            className={
                              picked ? 'seat-dot seat-dot-on' : 'seat-dot'
                            }
                          />
                          <span className="seat-name">{guestName(doc, id)}</span>
                          <button
                            type="button"
                            className={
                              pinned ? 'pin-button pin-on' : 'pin-button'
                            }
                            title={
                              pinned
                                ? 'Unpin — let the solver move them'
                                : `Pin to ${tableName(doc, i)}`
                            }
                            aria-label={
                              pinned
                                ? `Unpin ${guestName(doc, id)}`
                                : `Pin ${guestName(doc, id)} to ${tableName(doc, i)}`
                            }
                            onClick={() => onTogglePin(id)}
                          >
                            <PinIcon />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {conflicts.length > 0 && (
                  <ul className="table-warning">
                    {conflicts.map((c, n) => (
                      <li key={n}>
                        <span
                          className={`level-chip ${levelClass(c.level)}`}
                        >
                          {levelBadge(c.level)}
                        </span>
                        {guestName(doc, c.a)} &amp; {guestName(doc, c.b)}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Kept in the layout when there is nothing to add, so ticking a
                    guest does not lengthen every card at once. */}
                <button
                  type="button"
                  className={
                    selected.length > 0 ? 'add-picked' : 'add-picked is-idle'
                  }
                  title="Seat the ticked guests here and pin them"
                  onClick={() => onAddPickedToTable(i)}
                >
                  {selected.length > 1
                    ? `Add ${selected.length} to table`
                    : 'Add to table'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
