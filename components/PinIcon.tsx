/**
 * A pushpin, drawn rather than an emoji so it takes its container's color. The
 * glyph points straight down; the `.pin-button`/`.pin-mark` rules turn it to
 * lean down-left, the angle a pin is actually pushed in at.
 */
export default function PinIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 2v6l3 3v2h-4v7l-1 1-1-1v-7H7v-2l3-3V2h4z" />
    </svg>
  );
}
