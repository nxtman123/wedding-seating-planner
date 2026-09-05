import { useEffect, useRef } from 'react';

/** How near an end the cursor pulls the list along, and how hard at the very end. */
const EDGE_PULL = 80;
const EDGE_SPEED = 20;

/**
 * Keeps a long list usable while something is being dragged around inside it.
 *
 * Two things otherwise fight the drag. The page scrolls along with it, so aiming
 * at a row near the foot of a panel pulls the whole window down and takes the
 * target with it — the page is held still for as long as the drag lasts, and its
 * position is left exactly where it was. And the list's own scrolling only
 * starts within a few pixels of its edge, which is a band the cursor has to be
 * held inside of; `pull` reaches `EDGE_PULL` pixels in and gets stronger the
 * closer to the end you are, so the whole end of a panel is somewhere a drag can
 * rest and let the list come to it.
 *
 * The scrolling runs on its own clock rather than off `dragover`, because that
 * event only says where the cursor is: a drag held still at the edge stops
 * producing events, which is exactly when it should still be moving.
 *
 * Pass whether a drag is in progress; put `listRef` on the scrolling element and
 * call `pull` from its `dragover`.
 */
export default function useDragScroll(dragging: boolean) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const speed = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const root = document.documentElement;
    const held = root.style.overflow;
    root.style.overflow = 'hidden';
    const tick = window.setInterval(() => {
      const list = listRef.current;
      if (list && speed.current !== 0) list.scrollTop += speed.current;
    }, 16);
    return () => {
      root.style.overflow = held;
      window.clearInterval(tick);
      speed.current = 0;
    };
  }, [dragging]);

  const pull = (list: HTMLElement, y: number) => {
    const box = list.getBoundingClientRect();
    const fromTop = y - box.top;
    const fromBottom = box.bottom - y;
    const rate = (depth: number) =>
      Math.ceil(((EDGE_PULL - Math.max(0, depth)) / EDGE_PULL) * EDGE_SPEED);
    if (fromTop < EDGE_PULL) speed.current = -rate(fromTop);
    else if (fromBottom < EDGE_PULL) speed.current = rate(fromBottom);
    else speed.current = 0;
  };

  return { listRef, pull };
}
