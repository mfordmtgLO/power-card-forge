# RUN-SAVE SPEC — resumable runs for the Power Card game

Ruled by Mike 2026-11-03: **run-saving is added to the Forge Firebase sitting's scope.**
Status: SPEC — the rules block below is written into `firestore.rules` ahead of the
sitting (paste the CURRENT rules file at Step 5, as with the v2 session-push
amendment); the game-side save/restore build follows the same placeholder-config
pattern as the rest of the Forge integration and goes live at the sitting.

## The scenario it must satisfy (Mike's words, 2026-11-03)

A player gives their email (signs in), is at battle 5 of 16, closes the app,
reopens it 7 days later, and resumes the run where they left off.

## Identity

- The run belongs to the player's **signed-in Google account**. The document ID
  is the account's Firebase `uid`; rules key on `request.auth.uid`.
- A typed email address is NEVER an identity or a lookup key (anyone can type
  anyone's email). `playerEmail` is stored for display only.

## Save points — battle boundaries only

- The game writes the run when a battle ENDS (win) and again when the next
  battle is about to start after camp. It never saves mid-battle.
- Closing mid-battle N therefore resumes at the **start of battle N**
  (or battle N+1 if N was just won). This is the honest resume point and the
  one the resume offer names.
- Starting a run writes the initial save. Finishing a run (any of the four
  endings) DELETES the save. Abandoning a run from the resume offer DELETES it.

## The document — `runs/{uid}`, exactly five fields

| field | type | notes |
|---|---|---|
| playerEmail | string | display only, from the auth token |
| stateJson | string, ≤ 200,000 chars | the serialized run state (below) |
| schemaVersion | int | starts at 1; the game refuses a save it cannot read |
| currentBattle | int, 1–17 | the battle the player resumes INTO (17 = the run is at the finale gate) |
| updatedAt | timestamp | server-side write time |

One active run per player — the document IS the run; a new run overwrites it
only after the player confirms abandoning the saved one.

## stateJson — what the game serializes

The whole resumable state, and nothing else: band composition and roster order;
the locked opener; per-hero HP; per-hero Power Card charges and
played-at-least-once flags (the Walk Off depends on them); Voice total;
Friends Rallied; the Audible (used or not); gear picks per hero (weapon, look —
including Maya's Trail hair/skin and her default-look flag, dice set) and the
band's shared pack; each hero's two carried spells; readied moves and whether
they are spent; minions already met and banished this run; The Fade's demeanor
state. Per-battle scratch (spells used THIS battle, pending spell bonuses) is
NOT saved — a resumed battle starts clean, exactly like a fresh battle start.

## Resume UX (game)

- Signed in + an unfinished `runs/{uid}` exists → before a new run begins, the
  opening flow offers **"Resume — Battle N"** and **"Start a new run"**.
  Choosing new-run asks once ("Abandon the saved run?") and deletes on confirm.
- Signed out, or no save → the game behaves exactly as it does today.
- The game never auto-loads a save silently and never blocks play on the save
  system: if the read fails, the player can still start a new run.

## Rules (to paste as part of firestore.rules at Step 5)

Owner-only, mirroring the other collections' style: read/write only when
`request.auth.uid == runId`; create/update require exactly the five fields,
`playerEmail` matching the token email, `stateJson` a string within the cap,
`currentBattle` in range, `schemaVersion` an int. Delete is owner-only.

## Out of scope, permanently

- The offline Campfire edition: no server, no cloud resume. Ever.
- Cross-player runs, shared runs, leaderboards: not this feature.

## Acceptance — proven at the sitting's end-to-end test

1. Sign in, play to a camp point, close the game.
2. Reopen signed in → the resume offer names the correct next battle.
3. Resume → HP, Voice, charges, gear, look and readied moves match the moment
   of the save; the battle plays normally.
4. Signed out → no offer. A second account → sees only its own run (or none).
5. Finish a run → the save is gone (no offer next open). Abandon → same.
6. The final blueprint status pass may not flip the game-import/session rows
   on Firebase alone if this test has not also passed — the resume test joins
   the sitting's close-out gate.

## Ending records (added 2026-11-04, Mike's ruling)

A COMPLETED run also writes a kept ENDING RECORD for the player: the ending
it earned plus the run's credits data (the highlights the reel is composed
from). The record's HOME is the character sheet's "Campaign adventures"
drop-down — the adventure-history dropdown defined in
SESSION-CREDITS-PUSH-SPEC.md, where tabletop session credits already land
as replayable entries. The game files one entry per character in the band
at run end (date + the ending earned as its label), owner-scoped exactly
like the rest of the sheet's history; opening the entry replays the
victory and the credits scroll with its music — the same experience as
the author's finale-test page. Acceptance 5 is amended, not replaced: finishing or
abandoning still deletes the resume save (no Resume offer next open, as
written); the ending record is a separate kept record, written only when a
run actually reaches an ending (an abandoned run earns none). Blueprint
ledger row: "Saved runs keep their endings" (Specced · Not yet live).
