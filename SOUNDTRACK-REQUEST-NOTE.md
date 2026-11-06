# Forge soundtrack links + session credits-music requests — feasibility note
Mike's idea, 2026-11-03 (later hub-and-spoke expansion; pondered, not scheduled)

IDEA: A Forge player gets a YouTube embed player in the Forge (like the game's).
They store up to 10 YouTube links, playable in their own viewer. A "send" button
on a link files a request — player -> Mike (hub approval) -> Kendo applies it at
pre-session setup — so that link becomes the music for their Power Card session's
end-credits roll.

VERDICT: Feasible, modest, and in the architecture's grain. No new infrastructure.
Four pieces:
1. Forge viewer + library (small): the same keyless IFrame embed the game uses;
   player names their links (skip the Data API entirely). Storing = one per-user
   Firestore doc (soundtracks/{uid}, array capped at 10 in client AND rules,
   same owner-only pattern as runs/{uid}). Rides the existing Firebase sitting.
2. Request queue (small): the button writes musicRequests/{id} (uid, display
   name, videoId, title-as-named, requestedAt, status). Mike's approval is the
   hub gate — appropriateness stays his call, which matters for the kids' tables.
3. Application (small): the pre-session push that already loads the band carries
   one more optional field, soundtrackVideoId; the game's credits player uses it
   when present and falls back to the house song otherwise. The roll's timing
   already reads the playing song's duration, so any song length works. The DM
   Guide's screen version can take the same field later.
4. NOT covered: the campfire/offline edition (no internet; its song is the
   author's baked-in edited rip by design).

CONSTRAINTS WORTH KNOWING:
- YouTube embeds need an http(s) origin (they fail from local files — Error 153,
  already proven on this project). The hosted Forge is fine.
- Some videos forbid embedding; the player's own viewer is the test — a link
  that won't play for them won't play at the table, so they find out first.
- The manual Mike -> Kendo leg is a feature, not a bottleneck: it is exactly
  the pre-session setup flow session automation already defines. A fully
  self-serve variant (game reads the pick straight from the player's data)
  is possible later if the queue ever feels heavy.

## Addendum — any-link playback + default tune (Mike, 2026-11-05)
- The sheet's embedded YouTube player must work with ANY link clicked in the player's 10-video shelf ("10 youtube videos" stable in the Forge app), not only replay playback: clicking a shelf video loads it into the sheet viewer.
- "Default credits tune": the player marks one shelf link as the default; session-run replays chosen from the sheet's Campaign adventures drop-down load that default automatically, loop while the credits roll, then finish out the current play and stop (the game's loop law). Shelf lives in the Forge app per player — never inside character sheets.
