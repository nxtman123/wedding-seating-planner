import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  /*
   * What the tab says before the document has loaded. Once it has, the page
   * replaces this with the plan's own name — see `app/page.tsx` — so this is
   * only ever the first frame, and the export's static HTML.
   */
  title: 'Seating Chart - Seating Planner',
  description:
    'Arrange reception tables around who wants to sit with whom.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
