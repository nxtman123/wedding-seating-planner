'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultDoc } from '@/lib/defaults';
import {
  addGuest,
  addGuestsFromText,
  applyGroupLevel,
  clearAllPins,
  clearPin,
  commonLevel,
  fillGroupLevel,
  guestName,
  linkedGuests,
  moveGuests,
  removeGuests,
  pairingCounts,
  removePairing,
  renameGuest,
  setExtraTables,
  setPairingLevel,
  setPin,
  setSeatsPerTable,
} from '@/lib/guests';
import {
  pairingOutcomes,
  scoreAssignment,
  seatIndex,
  solveSeating,
} from '@/lib/solver';
import { exportDoc, loadDoc, parseDocFile, saveDoc } from '@/lib/storage';
import type { PairingDraft, PairingLevel, SeatingDoc } from '@/lib/types';
import GuestPanel from '@/components/GuestPanel';
import PairingPanel from '@/components/PairingPanel';
import TablePanel from '@/components/TablePanel';

export default function Page() {
  const [doc, setDoc] = useState<SeatingDoc>(defaultDoc());
  /** The group being composed, shared by the guest list and the pairing panel. */
  const [draft, setDraft] = useState<PairingDraft>({ guests: [], level: 1 });
  const [hydrated, setHydrated] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDoc(loadDoc());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDoc(doc);
  }, [doc, hydrated]);

  /* ----- derived views of the current seating ----- */

  const counts = useMemo(() => pairingCounts(doc), [doc]);
  /** Guests the floated pairings name, so the guest list can mark the same set. */
  const linked = useMemo(
    () => linkedGuests(doc, draft.guests),
    [doc, draft.guests],
  );
  const outcomes = useMemo(
    () => (doc.tables.length ? pairingOutcomes(doc, doc.tables) : new Map()),
    [doc],
  );
  const score = useMemo(
    () => (doc.tables.length ? scoreAssignment(doc, doc.tables) : null),
    [doc],
  );
  const violations = useMemo(
    () => [...outcomes.values()].filter((o) => o === 'violated').length,
    [outcomes],
  );

  /* ----- solving ----- */

  const generate = () =>
    setDoc((d) => ({ ...d, tables: solveSeating(d).tables }));

  /* ----- composing a pairing ----- */

  /**
   * Adopt the level a group already agrees on, so re-picking people who are
   * already linked shows what they have rather than the last level used. A
   * group that mixes levels, or has an unpaired pair, is left alone.
   */
  const withCommonLevel = (next: PairingDraft): PairingDraft => {
    const shared = commonLevel(doc, next.guests);
    return shared === null ? next : { ...next, level: shared };
  };

  /** Put a guest in the group, or take them back out. */
  const toggleGuestSelection = (id: string) =>
    setDraft((d) =>
      withCommonLevel({
        ...d,
        guests: d.guests.includes(id)
          ? d.guests.filter((g) => g !== id)
          : [...d.guests, id],
      }),
    );

  const setDraftLevel = (level: PairingLevel) =>
    setDraft((d) => ({ ...d, level }));

  const clearSelection = () => setDraft((d) => ({ ...d, guests: [] }));

  /**
   * Give every pair in the group the level shown. Two guests is the ordinary
   * one-pairing case; more is a clique. The group is left picked afterwards, so
   * a level can be tried and changed without re-ticking everyone.
   */
  const applyToGroup = () =>
    setDoc((d) => applyGroupLevel(d, draft.guests, draft.level));

  /** Fill in only the pairs the group is missing, leaving the rest as they are. */
  const applyToMissing = () =>
    setDoc((d) => fillGroupLevel(d, draft.guests, draft.level));

  /**
   * Delete whoever is ticked. Guests can only be removed this way now, so the
   * confirm names them — there is no per-row control to slip on.
   */
  const deletePicked = () => {
    const going = draft.guests;
    if (going.length === 0) return;
    const names = going.map((id) => guestName(doc, id));
    const shown = names.slice(0, 8).join(', ');
    const rest = names.length > 8 ? `, and ${names.length - 8} more` : '';
    const who =
      names.length === 1 ? names[0] : `these ${names.length} guests: ${shown}${rest}`;
    if (!window.confirm(`Delete ${who}? Their pairings and seats go too.`)) {
      return;
    }
    setDoc((d) => removeGuests(d, going));
    setDraft((d) => ({ ...d, guests: [] }));
  };

  /* ----- pinning ----- */

  /**
   * Pin a guest to wherever they are sitting now, or release them. Pinning
   * needs a seating to point at, so this only fires from a seated row.
   */
  const togglePin = (guestId: string) =>
    setDoc((d) => {
      if (d.pins[guestId] !== undefined) return clearPin(d, guestId);
      const table = seatIndex(d.tables).get(guestId);
      return table === undefined ? d : setPin(d, guestId, table);
    });

  /* ----- import / export ----- */

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      setDoc(parseDocFile(text));
      setDraft({ guests: [], level: 1 });
    } catch (e) {
      window.alert('Could not import file: ' + (e as Error).message);
    }
  };

  const reset = () => {
    if (window.confirm('Clear the guest list, pairings and seating?')) {
      setDoc(defaultDoc());
      setDraft({ guests: [], level: 1 });
    }
  };

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Wedding Seating Planner</h1>
          <p className="subtitle">
            List the guests, say who should sit together, and let the tables
            sort themselves out.
          </p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => exportDoc(doc)}>
            Export
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button type="button" className="danger" onClick={reset}>
            Reset
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {!hydrated ? (
        <p className="loading">Loading&hellip;</p>
      ) : (
        <div className="panels">
          <GuestPanel
            doc={doc}
            counts={counts}
            linked={linked}
            onAdd={(name) => setDoc((d) => addGuest(d, name))}
            onAddMany={(text) => setDoc((d) => addGuestsFromText(d, text))}
            onRename={(id, name) => setDoc((d) => renameGuest(d, id, name))}
            onDeletePicked={deletePicked}
            selected={draft.guests}
            onTogglePair={toggleGuestSelection}
            onReorder={(ids, index) => setDoc((d) => moveGuests(d, ids, index))}
          />
          <PairingPanel
            doc={doc}
            outcomes={outcomes}
            draft={draft}
            onToggleGuest={toggleGuestSelection}
            onLevelChange={setDraftLevel}
            onClear={clearSelection}
            onApply={applyToGroup}
            onApplyMissing={applyToMissing}
            onSetLevel={(id, level) =>
              setDoc((d) => setPairingLevel(d, id, level))
            }
            onRemove={(id) => setDoc((d) => removePairing(d, id))}
          />
          <TablePanel
            doc={doc}
            score={score}
            violations={violations}
            onSeatsChange={(n) => setDoc((d) => setSeatsPerTable(d, n))}
            onExtraTablesChange={(n) => setDoc((d) => setExtraTables(d, n))}
            selected={draft.guests}
            onGenerate={generate}
            onTogglePin={togglePin}
            onClearPins={() => setDoc(clearAllPins)}
          />
        </div>
      )}
    </main>
  );
}
