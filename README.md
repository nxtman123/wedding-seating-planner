# Wedding Seating Planner

A small Next.js app for working out who sits with whom at a wedding reception. Enter the
guest list, say which guests should — or shouldn't — share a table, and let an optimizer
fill the room.

Tables are circular and every seat at one is equivalent, so a table is really just a set
of up to N guests; there is no "next to" finer than "same table".

Everything runs client-side and your work is saved in your browser (`localStorage`).
You can also **Export** / **Import** it as JSON.

## How it works

**Guests** (left panel) — add them one at a time, or paste a whole list, one name per
line. Pasting again only adds names that aren't already there. The badge on a row counts
the pairings that guest is caught up in, so it's easy to spot who you've already placed
and who is still floating; hover it for the split between together and apart.

**Pairings** (middle panel) — say how strongly two guests belong together. Pick the
pair either from the two dropdowns here, or by clicking the circles in the guest list:
the first click marks guest `1`, the second marks guest `2`, and clicking a marked
guest again releases them. Then choose a level and press **Add pairing** — the level
sticks, so a run of pairings at the same level goes quickly.

Picking two guests who are already paired, in either order, loads that pairing into the
form and highlights its row: the level box shows what they have now, and the button reads
**Update pairing**. A pair can only ever have one level.

| Level | Meaning |
| --- | --- |
| `+1` | Must sit together |
| `+2` | Strongly prefer together |
| `+3` | Nice to have together |
| `−3` | Prefer apart |
| `−2` | Strongly avoid |
| `−1` | Must not share a table |

The levels are weights, not rules — the solver maximizes the total, so it will always
produce a seating even when the pairings contradict each other. The weights are spread
far enough apart that it never trades a `+1` away for any number of weaker wins: one
`+1` outweighs eight `+2`s, and one `+2` outweighs five `+3`s.

**Tables** (right panel) — set the seats per table and press **Generate seating**. The
number of tables is derived from the guest count; the *Spare tables* box adds slack on
top when you want the room less full. The score and a per-table warning list show how
the arrangement did, and the dots in the pairings panel mark each pairing honored or not.

**Pins** — the ○ next to a seated guest in the tables panel locks them to that table.
Pinned guests stay put through later **Generate** presses while everyone else is
rearranged. Pinned guests are marked with a ◉ in the guest list too, so you can see at a
glance who is held down without hunting through the tables.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build a static site

```bash
npm run build
```

This produces a fully static site in `./out`.

## Deployment

Live at **https://kurtisjantzen.ca/wedding-seating/**.

A GitHub Pages custom domain can only be bound to one repository, and `kurtisjantzen.ca`
belongs to [`nxtman123/kurtisjantzen.ca`](https://github.com/nxtman123/kurtisjantzen.ca).
GitHub can't route a sub-path of that domain to a different repo, so instead every push
to `main` here triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the static export and commits it into the **`production`** branch of that
repo under `wedding-seating/`. This mirrors how the sibling
[wedding-party-palette](https://github.com/nxtman123/wedding-party-palette) app deploys.

Consequences worth knowing:

- `production` on the personal-site repo receives automated commits from this repo.
- The deploy uses `keep_files: true`, so it only ever adds to / overwrites the
  `wedding-seating/` subtree — the rest of the site is untouched.
- It needs a repo secret `SITE_DEPLOY_TOKEN`: a fine-grained PAT scoped to
  `nxtman123/kurtisjantzen.ca` with **Contents: read and write**.
- That repo needs a root-level `.nojekyll`, or its legacy Jekyll build strips the
  `_next/` asset directory.

To reproduce the deployed build locally:

```bash
NEXT_PUBLIC_BASE_PATH=/wedding-seating npm run build
```

The base path is read by [`next.config.mjs`](next.config.mjs); leave it unset to build
for a domain root instead.
