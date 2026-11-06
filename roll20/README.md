# Roll20 bridge — draft package (prepared 2026-10-28)

Status: **draft, not installed, not tested live.** Mike ordered this build
on 2026-10-28 ("Build the Roll20 bridge (Forge export + !forge import
script)"). A builder pass was reported running that night, but as of this
draft no completion handoff has landed and no bridge files existed in
`character-forge-app/` — so this package was prepared directly, against
the Forge's real data model, to un-block the quiet test. If the builder's
version later lands, diff the two before installing either; do not
install both.

## Pieces

- `forge-importer.js` — the Roll20 Mod Script. Paste it into the
  campaign's API Scripts (campaign creator's account; creator is the
  only Pro seat needed). Listens for `!forge …` in chat.
- `EXPORT-FORMAT.md` — the export blob contract, field-for-field against
  the Firestore `characters` doc.

## Still owed on the Forge (app) side

- A **Copy for Roll20** button on the character sheet that builds the
  blob from the doc per EXPORT-FORMAT.md and copies the full
  `!forge …` line. (Not written here — it edits `app.js`, the same files
  the queued Campaigns build touches; sequence it with that build, not
  against it.)

## Quiet test checklist (before any game night)

1. Mike creates (or opens) a throwaway Roll20 campaign; install
   `forge-importer.js` under Settings → API Scripts; confirm the
   "ForgeImporter … ready" line in the API console log.
2. Build one export line by hand from EXPORT-FORMAT.md's example,
   paste `!forge …` in chat, confirm: character created, 8 sliders +
   modifiers present, bio readable, duplicate paste yields ` (2)`.
3. Upload one sketch in the web UI and attach it as avatar + token —
   the one step the script cannot do — and time it.
4. Settle the standing open question while the screens are in front of
   us: fresh copy named for the module vs. rename the standing game,
   for the Campaigns **Play** summons flow.
5. Only then: rehearse a Play setup end-to-end with one saved campaign.

## Limits (established, do not re-litigate at test time)

- Roll20 has no public REST/webhook API for this; Mod Scripts run only
  inside a live-launched campaign and make no HTTP requests.
- Scripts cannot upload portrait art — avatar/token art is a web-UI step
  (Mike/GM, or Kendo in the browser signed in as Mike via the secure
  credential card — never a password in chat; no login submission is on
  record yet).
- The University of Oregon D&D Club table is protected old-school and is
  NOT a user of this bridge.
