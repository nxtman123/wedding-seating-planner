import { useEffect, useState, type RefObject } from 'react';

/** How far from an end still counts as being at it. */
const SLACK = 2;

/**
 * Whether a scrolling list has anything beyond its top or bottom edge.
 *
 * The panels fade whichever end still has more to show, so the list looks cut
 * off only where it actually is. Answering that needs the scroll position and
 * the two sizes, and all three change for reasons the component does not see —
 * scrolling, the window resizing, a guest being added — so it watches the
 * element rather than recomputing on render.
 */
export default function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
): string {
  const [edges, setEdges] = useState({ above: false, below: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const above = el.scrollTop > SLACK;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - SLACK;
      setEdges((was) =>
        was.above === above && was.below === below ? was : { above, below },
      );
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    // Catches the list growing or the panel changing height, neither of which
    // fires a scroll event but both of which change what is beyond the edges.
    const ro = new ResizeObserver(read);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [ref]);

  return [edges.above ? 'has-above' : '', edges.below ? 'has-below' : '']
    .filter(Boolean)
    .join(' ');
}
