# Session Credits Push — DM Guide → Forge character sheet history

Mike's design, stated 2026-11-02 (two messages, 09:48 + 09:52 PT); build
approved by Mike 09:53 PT. Status: BUILT on both sides 2026-11-02 — DM Guide
(roster + push, module artifact) and Forge app (session_pushes rules,
grouping helpers, on-sheet "Campaign adventures" dropdown; tests 63/63 new
+ 67/67 pre-existing pass). Rides the Forge Firebase project — goes live
only when the parked Firebase sitting completes (same gate as character
import and the Roll20 bridge chain). The copy-link block already in the
DM Guide is the everyone-path and stays.

AMENDED to contract v2 the same day (Mike's identity ruling, 17:40 PT;
build approved 17:42 PT): identity by character document ID, so a
one-night rename can never misfile a credit — see "Data contract (v2)"
below. Forge side built and tested (session-pushes suite 98/98,
including 35 v2 checks; campaigns suite 67/67 untouched). The DM Guide
writer side includes the two optional fields whenever its roster seat
carries the character's Forge identity (a seat assembled from a band
send carries it; a seat typed in by hand does not, and produces a
v1-shaped push — the fallback below). Still NOT LIVE: the same parked
Firebase sitting gates everything in this file.

## The flow

Pre-game (existing, unchanged): players push chosen battle-ready character
sheets from the Forge to Mike; Mike sends them to Kendo; Kendo pushes the
characters into Roll20 to set up the session.

Post-game (this feature — the same road, reverse direction):
1. The DM Guide (tabletop SCREEN version) holds the session roster: for
   each seat, the character played + the human player's name + the email
   that player uses to sign in to the Forge (the player+character combo,
   logged for that session).
2. At the ending, beside the copy-link block, the DM clicks
   "Push the replay credits to the band." One push per roster seat.
3. Each push lands in the Forge ON THE PLAYER'S CHARACTER SHEET for the
   character they played — not in a generic inbox.

## Where it lives in the Forge (Mike's ruling, 09:52 PT)

- On the character sheet itself: a dropdown — "Campaign adventures."
- Every pushed session-ending credits link for THAT character accumulates
  in the dropdown, saved permanently in the Forge, newest first.
- Each entry shows: the session date, the adventure/session label, and the
  DM's name. Clicking an entry replays that session's credits roll
  (nostalgia replay — the same link the DM pushed).
- The dropdown doubles as the character's adventure history: the player
  can see every campaign adventure that character has participated in.
- Empty state, plain words: "No adventures yet — after a tabletop run,
  your DM can push the closing credits here."

## Data shape (v1)

A push writes one history entry onto the player's character record in the
Forge: { sessionDate, sessionLabel, dmName, creditsUrl, pushedAt }.
creditsUrl in v1 is the shared closing-credits roll link (the re-shared
credits review page). Access rules follow the app's existing owner-scoping:
a player reads only their own characters' histories. The DM Guide's push
button in v1 works when the DM is signed in as Mike (Forge admin, rules
keyed on his email — the same admin pattern the app already uses); other
DMs keep the copy-link block.

## Data contract (v2) — identity by character ID

Mike's ruling (2026-11-02, 17:40 PT): a player may rename a character
for one night's session, and the DM's credits push must still land on
the ORIGINAL character's sheet. Names are labels; the document ID is
the identity, and it never changes.

### Fields

One doc per push in `session_pushes`. The v1 seven, meanings unchanged:

- `playerEmail` — the player's Forge sign-in email (the read scope).
- `characterName` — the character's TRUE (Stable) name. In v2 this is
  formal: never the night's played-as name.
- `sessionDate` — "YYYY-MM-DD". `sessionLabel` — the adventure name.
- `dmName`, `creditsUrl` (https), `pushedAt` (server timestamp).

Plus two OPTIONAL fields:

- `characterId` — the Forge character document ID (string, 1–128
  chars). The push's identity.
- `playedAs` — the session's display name (string, 1–80 chars),
  present only when it differed from the true name.

Rules: create stays admin-only; validity is hasAll of the seven AND
hasOnly of the nine, with the v1 type/size/pattern checks unchanged
and the two optionals type/length-checked when present.

### The identity rule

- `characterId` is who the credit belongs to. `characterName` is the
  true name, kept for display and for the legacy fallback.
- `playedAs` is a one-night label. It never renames the Stable sheet;
  the sheet renders it as a plain line on that night's entry:
  Played as "X" that night.

### The send-path contract

A battle-ready band entry (the campaigns roster assembled in the
Forge) carries, per entry: `characterId` (the doc ID), `trueName`
(the doc's name), and `displayName` (the doc's session name when one
is set, else its true name). Whatever assembles the DM's roster from
a band entry therefore knows both the identity and the two names,
and a push written from such a seat includes `characterId` — and
`playedAs` when the display name differed from the true name.

### The reader rule

The Forge sheet files its history by ID first: an entry whose
`characterId` equals the sheet's document ID belongs to this sheet —
full stop; such an entry never falls back to a name match, so a
same-named stranger's credit cannot land here. An entry with NO
`characterId` is a legacy v1 push and files by `characterName`
against the sheet's true name, exactly as v1 did. Newest first,
either way.

### The manual-seat fallback

A DM-roster seat with no `characterId` — the DM typed the seat in by
hand, or the night predates the send path — produces a v1-shaped
push (the seven fields only), and the Forge files it by true name
under the reader rule. Nothing about v1 seats changes.

## Growth path (named, not built — unrelated to the v2 contract above)

A credits roll assembled from the actual tabletop run's own moments
(minion banishes, falls, the ending reached) would need the DM logging
highlights during play in the screen module's trackers. v1 pushes the
shared roll, labeled with the session.

## Amendment — entries carry the ending (2026-11-04, Mike's ruling)

For congruity across every way the band plays — the DM's push from the
screen Guide (campfire or online) and the game's own online runs
(RUN-SAVE-SPEC ending records) — a pushed entry ALSO carries the ending
the session earned: the victory itself is part of the record, not just
the credits scroll after it. The push payload gains an optional `ending`
field (the session's earned ending, in the Guide's own ending terms —
which Voice script closed the night, and whether The Fall and The
Brighten were part of it); the drop-down entry displays it with the date,
label and DM's name. The Guide's push pre-fills it from the session's own
state (Voice tally, Fall/Brighten) so the DM confirms rather than types.
Backward-compatible: entries pushed without it file and render as before.
