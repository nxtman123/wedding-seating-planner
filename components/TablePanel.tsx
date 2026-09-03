'use client';

import { levelBadge, levelClass } from '@/lib/defaults';
import { guestName } from '@/lib/guests';
import { conflictsAtTable, tableCount } from '@/lib/solver';
import type { SeatingDoc } from '@/lib/types';

export interface TablePanelProps {
  doc: SeatingDoc;
  /** Score of the current arrangement, or null before the first Generate. */
  score: number | null;
  /** Pairings the current arrangement failed to honor. */
  violations: number;
  onSeatsChange: (seats: number) => void;
  onExtraTablesChange: (extra: number) => void;
  onGenerate: () => void;
  onTogglePin: (guestId: string) => void;
  onClearPins: () => void;
}

export default function TablePanel({
  doc,
  score,
  violations,
  onSeatsChange,
  onExtraTablesChange,
  onGenerate,
  onTogglePin,
  onClearPins,
}: TablePanelProps) {
  const tables = tableCount(doc);
  const seated = doc.tables.reduce((n, t) => n + t.length, 0);
  const pinCount = Object.keys(doc.pins).length;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tables</h2>
        <span className="count">{tables}</span>
      </div>

      <div className="room-controls">
        <label>
          Seats per table
          <input
            type="number"
            min={1}
            max={20}
            value={doc.seatsPerTable}
            onChange={(e) => onSeatsChange(Number(e.target.value))}
          />
        </label>
        <label>
          Spare tables
          <input
            type="number"
            min={0}
            max={50}
            value={doc.extraTables}
            onChange={(e) => onExtraTablesChange(Number(e.target.value))}
          />
        </label>
      </div>

      <p className="hint">
        {tables} table{tables === 1 ? '' : 's'} &times; {doc.seatsPerTable} seats
        = {tables * doc.seatsPerTable} places for {doc.guests.length} guest
        {doc.guests.length === 1 ? '' : 's'}.
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
        <p className="score">
          Score <strong>{score.toLocaleString()}</strong>
          {violations > 0 ? (
            <span className="score-bad">
              {' '}
              · {violations} pairing{violations === 1 ? '' : 's'} unhonored
            </span>
          ) : (
            <span className="score-ok"> · every pairing honored</span>
          )}
        </p>
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
            return (
              <div key={i} className="table-card">
                <div className="table-head">
                  <h3>Table {i + 1}</h3>
                  <span className="count">
                    {table.length}/{doc.seatsPerTable}
                  </span>
                </div>
                {table.length === 0 ? (
                  <p className="empty">Empty</p>
                ) : (
                  <ul className="seat-list">
                    {table.map((id) => {
                      const pinned = doc.pins[id] !== undefined;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className={
                              pinned ? 'icon-button pin-on' : 'icon-button'
                            }
                            title={
                              pinned
                                ? 'Unpin — let the solver move them'
                                : `Pin to table ${i + 1}`
                            }
                            aria-label={pinned ? 'Unpin guest' : 'Pin guest'}
                            onClick={() => onTogglePin(id)}
                          >
                            {pinned ? '◉' : '○'}
                          </button>
                          <span>{guestName(doc, id)}</span>
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
