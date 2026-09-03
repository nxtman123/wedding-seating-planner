'use client';

import { levelBadge, levelClass, levelPhrase } from '@/lib/defaults';
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
  onGenerate: () => void;
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
  onGenerate,
  onTogglePin,
  onClearPins,
}: TablePanelProps) {
  const tables = tableCount(doc);
  const sizes = tableSizes(doc);
  const seats = seatCount(doc);
  const seated = doc.tables.reduce((n, t) => n + t.length, 0);
  const placed = seatIndex(doc.tables);
  const unseated = doc.guests.filter((g) => !placed.has(g.id));
  const pinCount = Object.keys(doc.pins).length;
  const chosen = new Set(selected);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tables</h2>
        <span className="count">{tables}</span>
      </div>

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

      <div className="generate-row">
        <button
          type="button"
          className="primary"
          onClick={onGenerate}
          disabled={doc.guests.length === 0}
        >
          Generate seating
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
              dozen missed "could"s, and a bare total hides which it was. */}
          <ul className="score-lines">
            {breakdown.map(({ level, violated }) => (
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
          </ul>
        </>
      )}

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
        <div className="tables scroller">
          {doc.tables.map((table, i) => {
            const conflicts = conflictsAtTable(doc, doc.tables, i);
            // A table holding anyone currently ticked gets the same gentle
            // highlight the pairing rows use.
            const holdsPicked = table.some((id) => chosen.has(id));
            return (
              <div
                key={i}
                className={
                  holdsPicked ? 'table-card row-selected' : 'table-card'
                }
              >
                <div className="table-head">
                  {/* An h3 for the outline, an invisible field inside it for
                      editing — the input inherits the heading's own type. */}
                  <h3>
                    <input
                      type="text"
                      className="table-name"
                      value={tableName(doc, i)}
                      aria-label={`Name of table ${i + 1}`}
                      onChange={(e) => onRenameTable(i, e.target.value)}
                    />
                  </h3>
                  {/* Kept in the layout when there is nothing to add, so the
                      heading does not jump as guests are ticked. */}
                  <button
                    type="button"
                    className={
                      selected.length > 0 ? 'add-picked' : 'add-picked is-idle'
                    }
                    title="Seat the ticked guests here and pin them"
                    onClick={() => onAddPickedToTable(i)}
                  >
                    Add to table
                  </button>
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
