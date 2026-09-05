import { useCallback, useRef, useState } from 'react';
import type { SeatingDoc } from '@/lib/types';

/** How many steps back the stack reaches before it forgets the oldest. */
const DEPTH = 100;
/** How long a run of edits to the same thing keeps counting as one step. */
const COALESCE_MS = 1500;

export interface DocHistory {
  doc: SeatingDoc;
  /**
   * Change the document, remembering it as it was.
   *
   * `tag` names what is being edited — a guest's id, a table's number — so that
   * a run of keystrokes in one field collapses into a single step. Without one,
   * every change is its own step.
   */
  commit: (next: (doc: SeatingDoc) => SeatingDoc, tag?: string) => void;
  /** Put a document in place with no history at all, as loading does. */
  load: (doc: SeatingDoc) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * The document, and the steps back to how it was.
 *
 * The stack lives in memory only: it is a record of this sitting rather than
 * part of the guest list, so reloading starts it fresh and nothing about it is
 * saved or exported.
 *
 * Undoing does not re-run anything — each step holds the whole document as it
 * stood, which is affordable because a document is a few tens of kilobytes and
 * a hundred of them is still less than a photograph.
 */
export default function useDocHistory(initial: SeatingDoc): DocHistory {
  const [doc, setDoc] = useState(initial);
  /*
   * The current document, kept where a handler can read it without closing over
   * a stale render. The stacks are refs too: they change together with the
   * document and only the counts need to reach the buttons.
   */
  const current = useRef(doc);
  const past = useRef<SeatingDoc[]>([]);
  const future = useRef<SeatingDoc[]>([]);
  const lastEdit = useRef<{ tag: string; at: number } | null>(null);
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  const put = useCallback((next: SeatingDoc) => {
    current.current = next;
    setDoc(next);
    setDepth({ past: past.current.length, future: future.current.length });
  }, []);

  const commit = useCallback(
    (next: (doc: SeatingDoc) => SeatingDoc, tag?: string) => {
      const was = current.current;
      const now = next(was);
      // Transforms return the document untouched when they decline to act;
      // those are not steps, and undoing onto one would look like nothing.
      if (now === was) return;

      const at = Date.now();
      const continues =
        tag !== undefined &&
        lastEdit.current?.tag === tag &&
        at - lastEdit.current.at < COALESCE_MS &&
        past.current.length > 0;
      if (!continues) past.current = [...past.current, was].slice(-DEPTH);
      future.current = [];
      lastEdit.current = tag === undefined ? null : { tag, at };
      put(now);
    },
    [put],
  );

  const load = useCallback(
    (next: SeatingDoc) => {
      past.current = [];
      future.current = [];
      lastEdit.current = null;
      put(next);
    },
    [put],
  );

  const undo = useCallback(() => {
    const step = past.current[past.current.length - 1];
    if (step === undefined) return;
    past.current = past.current.slice(0, -1);
    future.current = [current.current, ...future.current];
    // A step landed on is finished: typing again starts a new one rather than
    // merging into whatever was last edited before the undo.
    lastEdit.current = null;
    put(step);
  }, [put]);

  const redo = useCallback(() => {
    const [step, ...rest] = future.current;
    if (step === undefined) return;
    future.current = rest;
    past.current = [...past.current, current.current];
    lastEdit.current = null;
    put(step);
  }, [put]);

  return {
    doc,
    commit,
    load,
    undo,
    redo,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
