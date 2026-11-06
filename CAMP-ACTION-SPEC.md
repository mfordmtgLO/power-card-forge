# Camp actions — every forged character carries their own

Mike's requirement (2026-11-03): the Forge must require every forged
character to choose or create and solidify their OWN camp action, so
that when the character is imported into the game's Battle Ready
roster and used in a session run, that character's own camp action
appears selectable in the camp menu — not just the class-pattern gift
the game would otherwise lend them.

Status: BUILT in the Forge app (form, doc, sheet, Roll20 export) with
headless tests in `tests/camp-action.test.mjs`. The game-side reader
(the import preferring the doc's own `campAction` over the class
pattern) is the game's half of the contract defined here; the doc
field below is what it reads. Like everything Forge-side, it goes
live with the Firebase sitting — nothing here claims otherwise.

## The doc field

On `/characters/{id}`:

```
campAction: { kind, name, text }
```

- `kind` — one of the seven engine kinds below. The engine underneath;
  this is what the game executes.
- `name` — the player's own name for their action (free naming),
  1–60 characters, trimmed.
- `text` — the player's own one line of flavor, 1–200 characters,
  trimmed.

Shape gate: `validateCampAction(v)` in `data.js` (validateTales
style). It returns exactly `{ kind, name, text }` normalized, or
`{ ok: false, error }`. Every reader goes through it — the form's
required-field gate, the sheet, the Roll20 exporter — so a malformed
value can never render or export as-is.

## The seven kinds (from the game as built)

Verified against the game's camp code in the live game file
(`public-door-game-2026-11-03-swap20.html`): between battles the band
makes camp, takes ONE camp action per stop, and every personal gift
belongs to a standing band member. The kinds are the game's seven
executable personal-gift effects. (Canvass is NOT a kind: it is the
universal camp action any standing band member can take — no
character owns it.)

| kind | Pattern gift | Pattern hero | What it does in the game |
|---|---|---|---|
| `heal` | Healing Hands | Priya, Healer | Pick one band member — a downed hero is a legal target — roll a d4; heal = roll + 3 + the healer's Healing bonus, capped at 100 HP. Healing a downed hero revives them. |
| `inspiration` | Blessing of the Dawn | Priya, Healer | Roll a d4; the next fighter sent in gains that much Inspiration (bonus on attack rolls) for the coming battle. |
| `omen` | Scout's Omen | Maya, Ranger | Roll a d4 of Inspiration for the next fighter, AND reveal the coming battle's aspect and which move counters it. |
| `brace` | Sharpen & Brace | Dre, Warrior | No die: the next fighter gains +2 to hit and +2 Defense for the coming battle. (Ruled Dre's gift by Mike 2026-11-03; the game attributed it to him in swap #21.) |
| `mend` | Mend & Make | Marc, Builder | Heal the most-wounded standing hero for up to 6 HP, and the next fighter gains +2 Defense (bracing) for the coming battle. |
| `signal` | Signal Boost | Sana, Herald | In the next battle, every correct answer also raises Voice +2. |
| `till` | Open the Till | Eli, Keeper | Gain Voice immediately (+6 on the game's Voice scale), and the next battle's first correct answer charges that hero's Power Card +1 extra pip. |

In the Forge form the picker presents each kind by what it DOES, in
plain words (the `does` lines in `CAMP_ACTION_KINDS`, data.js), with
the pattern gift and hero named so the player can see whose gift
they are following. The player then writes their own `name` and
`text` — free naming, engine kind underneath.

## Required, and where it solidifies

The camp action is REQUIRED: the Forge form validates it through
`validateCampAction` and refuses to create the character without a
valid one, in the same error line style as the name / weapon /
Attire 1 gate.

Solidification — an honest mapping onto the app as built. The brief
for this feature said "locked at Save to Stable, mirroring how tales
lock." Two facts about the built app shape that:

1. There is no Save-to-Stable step in the app today.
   `STABLE-AND-PROMPTS-SPEC.md` is still a design spec (its own
   header says so); the built lifecycle is: Forge form → sketch
   request → Mike's return set → complete sheet. Player-authored
   free text (`description`, `perk`, `deathBlow`) is written ONLY
   by the creation form — no sheet surface edits it afterwards.
2. Tales are not player-locked text either: they are written by
   Mike's return-set attach flow, never edited by the player.

So in the built app, creation IS the finalize step for
player-authored text, and the camp action follows exactly that
pattern: editable in the form, written once into the doc at
creation, and afterwards NO app surface edits it — not the sheet,
not the admin tools. The Firestore rules back this: the admin
update path is limited to seven push-back fields
(`portraitPath, attires, portraitSetComplete, sketchStatus,
sketchCompletedAt, sketchSubmittedToKendoAt, tales`) and
`campAction` is not among them, so not even the return flow can
rewrite one. When the Stable build lands, `campAction` already
rides the doc, locked, and its Save gate can rely on the field
being present and valid for every character forged from this
feature on.

## Legacy characters (forged before this feature)

Docs without `campAction` — or with a malformed one — keep working
everywhere. `effectiveCampAction(c)` in data.js resolves, at read
time only:

- the doc's own valid camp action (`forged: true`), else
- the class-pattern gift (`forged: false`): the pattern hero is
  resolved through `CLASS_TABLES[class].hero`, with
  `FORGE_CLASS_HERO` for the three Forge classes (Fighter → Dre,
  Magician → Sana, Paladin → Priya) — the same resolution
  `classWeaponList` uses — and the gift from `HERO_CAMP_GIFTS`
  (Ranger → Scout's Omen, Warrior → Sharpen & Brace, Healer →
  Healing Hands, Builder → Mend & Make, Herald → Signal Boost,
  Keeper → Open the Till).

Nothing is migrated, written back, or invented on those docs; the
game applies the same class-pattern fallback on its side. The Forge
sheet labels a fallback "(class pattern)" so nobody mistakes it for
stored data.

## Where the field travels

- **Sheet view** (both the working sheet and the complete sheet):
  a "Camp action ·" line under the Death Blow line — the player's
  own name + flavor and its kind's plain-words effect, marked set
  in stone; or the pattern gift, labeled as the pattern.
- **Roll20 export**: `buildRoll20Export` carries `campAction`
  (validated own action, or `null` for legacy docs);
  `roll20/forge-importer.js` prints it in the sheet bio as
  "Camp Action: name — text". See `roll20/EXPORT-FORMAT.md`.
- **The game** (contract, game-side reader is the game's build):
  when a forged character is imported into Battle Ready, the game
  reads `campAction { kind, name, text }` from the character doc;
  the camp menu offers the character's own action, executing
  `kind` and displaying `name` / `text`; when the doc carries no
  valid `campAction`, the game lends the class-pattern gift as it
  does today.

## Rules

Read before building, per the brief: `firestore.rules` does NOT
whitelist fields on `/characters/` — create checks only
`ownerUid == request.auth.uid`; owner update checks `ownerUid`
immutability; the admin update path is limited to the seven
push-back fields listed above. A new free field on the doc needs
no rules change, and none was made; the file's other blocks
(campaigns, session_pushes, runs) are untouched. Validation of the
field's shape lives in `validateCampAction`, applied at the form
gate and at every read.

## Tests

`tests/camp-action.test.mjs` (the app's headless node pattern):
kind-list integrity against the game's seven kinds;
`validateCampAction` gate (missing / unknown kind / empty or
overlong name or text rejected; valid input normalized to exactly
three trimmed fields); the creation gate (the exact call the form's
submit handler makes); solidified read-back (the stored action is
what sheet logic and export read, and beats the class pattern);
legacy fallback per class incl. the Forge classes; Roll20 export
carrying the field, and an importer round-trip whose bio shows the
camp action — plus a legacy export (`campAction: null`) importing
cleanly with no Camp Action line.
