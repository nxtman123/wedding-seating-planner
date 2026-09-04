import type { KeyboardEvent } from 'react';

/**
 * Enter means "done" in a field that edits in place.
 *
 * These fields have no submit button and nothing to submit to — every keystroke
 * is already in the document through `onChange` — so Enter would otherwise do
 * nothing at all, which is the one thing a person pressing it does not expect.
 * Letting go of the field is what makes "done" visible.
 *
 * It also hands the keyboard back to the page: A, S, C and G are live again the
 * moment a text field stops holding focus, so finishing a rename and generating
 * a seating is two keys rather than a trip to the mouse.
 *
 * Not for the add-a-guest box, where Enter already means "add this one and let
 * me type the next" and keeping focus is the whole point.
 */
export default function blurOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key !== 'Enter') return;
  // Nothing here submits, but a stray Enter can still reach a form.
  e.preventDefault();
  e.currentTarget.blur();
}
