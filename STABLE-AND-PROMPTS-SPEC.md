# The Stable + 3-Prompt Rule — Forge design ruling (Mike, 2026-10-30)

Mike's ruling, in his terms. This is a DESIGN SPEC for the Forge build — the current built app does NOT yet implement any of it (verified 2026-10-30: no stable concept, no prompt counter, no 20-cap in app.js/data.js; the game import's queue-max-20 is a different thing and is not this rule).

## The flow

1. A player creates a character sheet. The character's portrait is created by Kendo from the player's submitted prompt description.
2. Before the sheet is finalized, the player may spend design prompt requests to have Kendo further customize the portrait: **3 total — the initial prompt + 2 more.**
3. When the 3rd Kendo customization comes back, the player is alerted that this was the **final design change**. From there the choice is: **Delete** the character, or **Move to the Stable** (finalize it into a Stable slot).
4. **Save to Stable** = moving a finished design into a finalized character sheet in one of the Stable's open slots.

## The Stable

- Each player's Stable holds **at most 20 finalized character sheets**.
- If the player tries to save to the Stable when all 20 slots are full, a popup tells them: **"Remove a character sheet from the Stable to free up a slot"** (Mike's wording) — they free a slot first, then the save can proceed.

## Tales update every round (Mike's ruling, 2026-10-30)

The 3 design prompts are not portrait-only. On EVERY round of a
character's customization loop (rounds 1–3), Kendo's return carries a
revised `<docId>--tales.json` alongside the portrait work:

- The tales are rewritten from EVERYTHING the player has submitted for
  that character so far — the initial brief plus every design-change
  prompt, including any character/story detail in those prompts.
- On attach, the sheet's portrait and its 3 scrolling backstories
  update together from the same return.
- Slot discipline (confirmed by Mike, 2026-10-30): a character always
  has EXACTLY 3 tales — one per weapon. Each round rewrites all 3 and
  the new tales file REPLACES the previous version — never appended,
  never stacked, no archive of old versions. (3 rounds × 3 tales = 9
  versions written across a full run; the sheet and the game import
  only ever hold the latest 3.)
- Round 3's tales are the final version; they lock when the sheet is
  Saved to the Stable. If a sheet is stabled before round 3 (see open
  mechanics below), the latest landed tales version locks with it.
- Tales still never gate the 9/9 portrait completion — unchanged.

## Open mechanics (Mike's ruling needed when the Forge build is specced — do not invent)

- Saving to the Stable before all 3 prompts are spent: are the remaining prompts forfeited for that character?
- Can a stabled sheet be pulled back out for editing/re-prompting, or is Stable placement final?
- Deleting at the final-design alert: does it delete the draft outright (no recovery)?
- Does the 20-cap count per player account (assumed yes — "their stable")?

## Where this lands

- Explanation: the "How the Forge Works" page (updated 2026-10-30 to carry this detail).
- Implementation: rides with the Forge build sequence (Campaigns build + Firebase sitting remain on Mike's call, per standing queue).
