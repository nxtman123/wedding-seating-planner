'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultDoc } from '@/lib/defaults';
import {
  addGuest,
  addGuestsFromText,
  addPairing,
  clearAllPins,
  clearPin,
  removeGuest,
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
import type { PairingLevel, SeatingDoc } from '@/lib/types';
import GuestPanel from '@/components/GuestPanel';
import PairingPanel from '@/components/PairingPanel';
import TablePanel from '@/components/TablePanel';

export default function Page() {
  const [doc, setDoc] = useState<SeatingDoc>(defaultDoc());
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

  const seats = useMemo(() => seatIndex(doc.tables), [doc.tables]);
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

  /**
   * Pin a guest to wherever they are sitting now, or release them. Pinning
   * needs a seating to point at, so the button is disabled until one exists.
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
    } catch (e) {
      window.alert('Could not import file: ' + (e as Error).message);
    }
  };

  const reset = () => {
    if (window.confirm('Clear the guest list, pairings and seating?')) {
      setDoc(defaultDoc());
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
            seats={seats}
            onAdd={(name) => setDoc((d) => addGuest(d, name))}
            onAddMany={(text) => setDoc((d) => addGuestsFromText(d, text))}
            onRename={(id, name) => setDoc((d) => renameGuest(d, id, name))}
            onRemove={(id) => setDoc((d) => removeGuest(d, id))}
            onTogglePin={togglePin}
          />
          <PairingPanel
            doc={doc}
            outcomes={outcomes}
            onAdd={(a, b, level: PairingLevel) =>
              setDoc((d) => addPairing(d, a, b, level))
            }
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
            onGenerate={generate}
            onTogglePin={togglePin}
            onClearPins={() => setDoc(clearAllPins)}
          />
        </div>
      )}
    </main>
  );
}
