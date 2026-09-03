'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PAIRING_LEVELS, defaultDoc } from '@/lib/defaults';
import {
  addGroup,
  addGuest,
  addGuestsFromText,
  applyGroupLevel,
  assignToGroup,
  clearAllPins,
  clearPin,
  commonLevel,
  fillGroupLevel,
  guestName,
  linkedGuests,
  moveGroupToList,
  moveGuestsIntoGroup,
  moveGuestsToList,
  pairingCounts,
  removeGroup,
  removeGuests,
  removePairing,
  renameGroup,
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
  /** The last guest ticked on their own, which a shift-click reaches back to. */
  const [anchor, setAnchor] = useState<string | null>(null);
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
  /** How each level fared, so the tables panel can say which kind went wrong. */
  const breakdown = useMemo(
    () =>
      PAIRING_LEVELS.map((level) => {
        const of = doc.pairings.filter((p) => p.level === level);
        return {
          level,
          total: of.length,
          violated: of.filter((p) => outcomes.get(p.id) === 'violated').length,
        };
      }).filter((tally) => tally.total > 0),
    [doc.pairings, outcomes],
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

  /**
   * Put a guest in the group, or take them back out. Shift reaches back to the
   * last guest ticked on their own and takes everyone between them, in the order
   * the list draws — which `doc.guests` is kept in, so the range is what you see
   * between the two, group members included.
   *
   * A range only ever adds. Nothing is unticked by reaching over it, so a
   * selection can be built out of several runs.
   */
  const toggleGuestSelection = (id: string, extend = false) => {
    setDraft((d) => {
      const ids = doc.guests.map((g) => g.id);
      const from = anchor ? ids.indexOf(anchor) : -1;
      const to = ids.indexOf(id);
      if (extend && from >= 0 && to >= 0 && from !== to) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const merged = [...d.guests];
        for (const gid of ids.slice(lo, hi + 1)) {
          if (!merged.includes(gid)) merged.push(gid);
        }
        return withCommonLevel({ ...d, guests: merged });
      }
      return withCommonLevel({
        ...d,
        guests: d.guests.includes(id)
          ? d.guests.filter((g) => g !== id)
          : [...d.guests, id],
      });
    });
    setAnchor(id);
  };

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

  /**
   * Removing a group frees its members rather than deleting them, so this only
   * confirms when the group actually holds anyone.
   */
  const dropGroup = (groupId: string) => {
    const group = doc.groups.find((g) => g.id === groupId);
    if (!group) return;
    const held = doc.guests.filter((g) => g.groupId === groupId).length;
    if (
      held > 0 &&
      !window.confirm(
        `Remove the group "${group.name}"? Its ${held} guest${held === 1 ? '' : 's'} stay on the list, just ungrouped.`,
      )
    ) {
      return;
    }
    setDoc((d) => removeGroup(d, groupId));
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

  /**
   * Where a letter key means the letter rather than a shortcut: somewhere you
   * type prose. Not a checkbox, and not a select — both keep focus after you
   * use them, which is exactly when clearing the pick is wanted.
   */
  const takesTyping = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    return [
      'text',
      'search',
      'url',
      'tel',
      'email',
      'password',
      'number',
      'date',
      'datetime-local',
      'month',
      'week',
      'time',
    ].includes((el as HTMLInputElement).type);
  };

  /**
   * C clears the pick, wherever you are — except where the letter is being typed
   * and with a modifier held, where it belongs to the browser.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' && e.key !== 'C') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (takesTyping(e.target as HTMLElement | null)) return;
      // A select would otherwise jump to the option starting with the letter —
      // in the guest dropdown that silently adds whoever comes first under C.
      e.preventDefault();
      setDraft((d) => (d.guests.length ? { ...d, guests: [] } : d));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          <button
            type="button"
            onClick={clearSelection}
            disabled={draft.guests.length === 0}
            title="Clear the picked guests"
          >
            Clear selection <kbd>C</kbd>
          </button>
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
            onAddGroup={() => setDoc((d) => addGroup(d, draft.guests))}
            onRenameGroup={(id, n) => setDoc((d) => renameGroup(d, id, n))}
            onRemoveGroup={dropGroup}
            onReorder={(ids, groupId, index) =>
              setDoc((d) =>
                groupId === null
                  ? moveGuestsToList(d, ids, index)
                  : moveGuestsIntoGroup(d, ids, groupId, index),
              )
            }
            onReorderGroup={(id, index) =>
              setDoc((d) => moveGroupToList(d, id, index))
            }
            onAddPickedToGroup={(groupId) =>
              setDoc((d) => assignToGroup(d, draft.guests, groupId))
            }
          />
          <PairingPanel
            doc={doc}
            outcomes={outcomes}
            draft={draft}
            onToggleGuest={toggleGuestSelection}
            onLevelChange={setDraftLevel}
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
            breakdown={breakdown}
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
