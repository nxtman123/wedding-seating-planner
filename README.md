# Wedding Seating Planner

A small Next.js app for working out who sits with whom at a wedding reception. Enter the
guest list, say which guests should — or shouldn't — share a table, and let an optimizer
fill the room.

Tables are circular and every seat at one is equivalent, so a table is really just a set
of up to N guests; there is no "next to" finer than "same table".

Everything runs client-side and your work is saved in your browser (`localStorage`).
You can also **Export** / **Import** it as JSON.

## How it works

**Guests** (left panel) — add them one at a time, or hit **Paste a list** beside the
heading, which turns the same row into a paste box, one name per line. **Add a group** drops an empty section at the top of the list — a family, a carful,
a table's worth of friends. Tick some guests first and the same button reads **New group
of 3**, gathering them straight into it from wherever they were, other groups included.
The group lands where the first of those guests who was not already in one sits; with
nobody to anchor it — an empty group, or one poached wholly out of other groups — it goes
to the top. Either way it arrives called "Group 1"; click the heading to rename it.
Tick guests anywhere in the list
and press **Add to group** on a group's heading to file them in, or drag them in and out
by their grips. Groups drag too, and can sit anywhere among the loose guests rather than
being pinned to one end. Removing a group turns its guests loose, leaving them where the
group was.

Drag a row by its grip to reorder the list — a line shows where it will land, and
nothing shifts until you drop. Ticking guests and pressing **Delete guests** removes them,
after a confirmation naming who is going — there is no per-row delete to slip on, and a
guest's pairings, pin and seat go with them.

Dragging a ticked row carries the whole ticked selection
with it: they lift out of wherever they are, gaps and all, and land together at the line
in the order they had. Dragging an unticked row moves just that row. The badge on a row counts
the pairings that guest is caught up in, so it's easy to spot who you've already placed
and who is still floating; hover it for the split between together and apart.

**Pairings** (middle panel) — say how strongly guests belong together. Pick them by
ticking them in the guest list, or from the dropdown here; unticking takes a guest back
out. Shift-clicking a checkbox reaches back to the last one you ticked and takes everyone
between them, across group boundaries and all — it only ever adds, so a selection can be
built out of several runs. Order of picking carries no meaning. Then choose a level and press the button — the level sticks, so a run at the same level goes
quickly.

**Clear selection** in the top bar drops the pick, as does pressing <kbd>C</kbd> anywhere
outside a text field.

Pick **two** guests for a single pairing. Pick **three or more** and you get a clique:
every pair within the group is set to the same level, so five friends who should all sit
together is one selection and one click rather than ten separate pairings.

There are two ways to apply a level to a group. **Apply to all N pairs** is the last word
on how its members relate: every pair is set to the level, overwriting whatever they had
between them. **Apply to N missing** only fills in the pairs that have no pairing yet and
leaves the existing ones exactly as they are — useful for widening a group without
flattening the levels you already tuned inside it. The second button appears only when the
two would differ; rows about to be rewritten are highlighted either way. The group stays
picked after you apply, so a level can be tried and changed without re-ticking everyone.

Whatever you tick is followed through the other two panels. The pairing list floats what
the pick concerns to the top in two bands, each above a gap: first the pairings *inside*
the group — the ones an Apply would rewrite — then the ones *reaching out* of it, tying
those guests to everyone else. Ticking a single guest just empties the first band, since
nothing can be inside a group of one. Back in the guest list, the count badge lights up
for everyone those floated pairings name — including guests you did not tick, who are
there because someone you did tick is paired with them. Meanwhile the tables holding the
picked guests are highlighted, with a dot at each picked seat.

Neither apply touches pairings that reach *outside* the group, and neither ever duplicates
a pair. Picking guests who already agree on a level, in any order, loads that level into the
form rather than the last one you used.

| Strength | Setting a group | A single pairing reads |
| --- | --- | --- |
| `+++` | Must sit together | A **must sit with** B |
| `++` | Should sit together | A **should sit with** B |
| `+` | Could sit together | A **could sit with** B |
| `−` | Could avoid each other | A **could avoid** B |
| `−−` | Should avoid each other | A **should avoid** B |
| `−−−` | Must avoid each other | A **must avoid** B |

The same must / should / could ladder either way — the form speaks about the group you
have picked, the row about the one pair it names.

In the pairing list the level sits between the two names, so each row reads as a sentence
and doubles as the control that changes it.

The levels are weights, not rules — the solver maximizes the total, so it will always
produce a seating even when the pairings contradict each other. Each level is worth 20×
the one below it, which matters more than it looks: a group applied to N guests creates
N-choose-2 pairings, and every guest at a table of S seats holds S-1 of them, so a large
low-level group could otherwise outvote a high-level pairing on sheer volume. At 20× no
level can be outvoted by a whole table's worth of the level beneath it, even at the
largest table size the app allows. At the default eight seats it is not close.

**Tables** (right panel) — set the seats per table and press **Generate seating**. The
number of tables is derived from the guest count; the *Spare tables* box adds slack on
top when you want the room less full. The score comes with a line per level in
use — "all must sit with pairings honored", "6 should sit with pairings not honored" —
because one broken `+++` matters more than a hundred missed `+`s, and a single total hides
which it was. Per-table warnings and the dots in the pairings panel show the detail.

**Pins** — the pin after a guest's name in the tables panel locks them to that table.
Pinned guests stay put through later **Generate** presses while everyone else is
rearranged, and are marked in the guest list too, so you can see at a glance who is held
down without hunting through the tables.

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
