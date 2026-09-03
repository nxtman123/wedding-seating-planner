'use client';

import { levelBadge, levelClass, levelPhrase } from '@/lib/defaults';
import { guestName } from '@/lib/guests';
import { conflictsAtTable, tableCount } from '@/lib/solver';
import type { LevelTally, SeatingDoc } from '@/lib/types';

export interface TablePanelProps {
  doc: SeatingDoc;
  /** Guests currently ticked in the guest list, marked with a dot at their seat. */
  selected: string[];
  /** Score of the current arrangement, or null before the first Generate. */
  score: number | null;
  /** How each level fared, strongest first. Only levels in use appear. */
  breakdown: LevelTally[];
  onSeatsChange: (seats: number) => void;
  onExtraTablesChange: (extra: number) => void;
  onGenerate: () => void;
  onTogglePin: (guestId: string) => void;
  onClearPins: () => void;
}

/** A pushpin, drawn rather than an emoji so it takes the button's own color. */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M14 2v6l3 3v2h-4v7l-1 1-1-1v-7H7v-2l3-3V2h4z" />
    </svg>
  );
}

export default function TablePanel({
  doc,
  selected,
  score,
  breakdown,
  onSeatsChange,
  onExtraTablesChange,
  onGenerate,
  onTogglePin,
  onClearPins,
}: TablePanelProps) {
  const tables = tableCount(doc);
  const seated = doc.tables.reduce((n, t) => n + t.length, 0);
  const pinCount = Object.keys(doc.pins).length;
  const chosen = new Set(selected);

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
                                : `Pin to table ${i + 1}`
                            }
                            aria-label={
                              pinned
                                ? `Unpin ${guestName(doc, id)}`
                                : `Pin ${guestName(doc, id)} to table ${i + 1}`
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
