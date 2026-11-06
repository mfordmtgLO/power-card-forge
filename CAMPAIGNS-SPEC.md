# CAMPAIGNS — Mike's game-night ledger (spec recorded 2026-10-27, Mike's words in chat)

For the across-The-Pond group (the Roll20 friends). Mike-only admin surface,
beside Mike's Inbox in this app. The UO club table is old school and is NOT
part of this (Mike's "Protect!" ruling).

## The game-night process (Mike's flow)

1. Mike group-texts the group; together they choose the module/adventure
   on tap for the evening.
2. Each human player picks, from their own Forge stable, the character
   they think is best equipped for the upcoming campaign, and PUSHES that
   character sheet to Mike.
3. Mike sees the pushed sheets as the "band of characters" loaded up in
   his Forge admin page (a staging list).
4. Each staged sheet arrives ALREADY CONNECTED to its human by default:
   Mike already has a human player roster — every character in the
   Forge knows its owner (the account that forged it and has been
   sending Mike sketch requests; Mike's example: a sheet chosen by
   "Bob Jacobs" is Bob Jacobs' pair, no typing needed). Mike's only
   job is to CONFIRM the pair, or OVERRIDE the displayed human name
   for that night — any input works, e.g. the pseudo name they play
   under that evening. The roster itself is auto-derived from the
   Forge's owners/requesters; there is no separate roster data entry.
   The name stored on the campaign stays PER CAMPAIGN (a human may
   play under a different name on a different night).
5. Mike types: the NAME OF THE MODULE/ADVENTURE and the DATE the
   campaign is to be played.
6. Saving writes ONE campaign record to Firestore: campaign name, date,
   and every human+character connection, with the character's doc ID
   (and owner uid) riding along so each entry links back to the live
   character sheet.

## The Campaigns menu + search (recall later)

- A "Campaigns" menu lists saved campaigns NEWEST -> OLDEST, each row
  showing the campaign NAME with its DATE PLAYED right next to it.
- Robust search/filter over the saved campaigns:
  - by HUMAN PLAYER NAME -> only campaigns that human was a player in
    (ran a connected character sheet);
  - by CAMPAIGN DATE -> just that one day's campaign(s);
  - by DATE RANGE -> every campaign in the range;
  - by CHARACTER PROFILE NAME (e.g. "Prya") -> every campaign that
    character was active in, across all time.
- The filtered list view populates with columns:
  - campaign name
  - date played
  - human player name used THAT day (real name or that day's pseudo)
  - character sheet character profile name connected to the human
  - CAMPAIGN HIGHLIGHTS notes box — Mike types the fun moments of the
    evening (entered after the night; editable later)
  - a DRAFT EMAIL action (below)

## Draft email (the next-day group email)

- A "Draft email" button opens the LOCAL machine's default email
  program (a mailto draft) with an AI-assisted template prefilled:
  - who played (human names as used that day)
  - what campaign they played, and on what date
  - each human player's chosen character for the campaign
  - the highlights notes shaped into a fun, short summary of the
    adventure: what went down, the final boss battle, and the end
    scene / end-game walk-off outcome(s)
- Mike loads in the human players' EMAIL ADDRESSES MANUALLY (typed in,
  saved with the campaign record so the next-day draft is one click),
  reviews/edits the draft in his own mail program, and sends the group
  email the day after the campaign.

## The PLAY button — summoning Kendo to set up the night (Mike, 2026-10-27 19:26)

The keystone of the whole system:

1. Mike opens the Campaigns menu, loads a saved campaign (its human
   players + connected character sheets come with it), CHECKBOXES it,
   and presses **Play**.
2. Play generates the night's **setup prompt**: the campaign name, the
   date, and for every roster entry the human's name, the character's
   name, the character doc ID, AND that character's Roll20 import blob
   (from the bridge export) — everything Kendo needs in one block. The
   campaign record is marked "sent for setup."
   HONEST MECHANISM: a web page cannot reach Kendo by itself — Play
   builds the prompt and puts it in Mike's hands (copy/download, the
   same pattern as the sketch batches); Mike pastes it into his chat
   with Kendo. One paste is the whole summons.
3. Kendo, prompted, logs into Mike's Roll20 account in the browser
   (saved login, GM/creator) and sets up the night:
   - the night's Roll20 game carries the MODULE'S NAME (example of
     record: "Module Q1 - Queen of the Demonweb Pits") — copy-and-name
     vs rename-the-standing-game is settled at the quiet live test,
     not guessed in advance;
   - the !forge script is installed if the game doesn't have it;
   - every roster character is created in the game (the one-way import)
     — the battle-ready band;
   - each character's SKETCH PORTRAIT is uploaded to Mike's Roll20
     library through the web UI and attached to its sheet;
   - characters are made controllable by their humans as far as the
     night's reality allows (a player may need to have joined the game
     once before a sheet can be assigned to them — settled at the test).
4. When it is all set up, Kendo says READY in the chat — Mike sees it
   on his phone immediately.
5. Mike rallies the band (USA to across The Pond); everyone connects
   via DISCORD AUDIO, logs into Roll20, joins the campaign, and finds
   their character sheet waiting — free to make their own adjustments
   (strength etc.) — and play starts.

Campaign doc gains a play state (not sent / sent for setup / ready),
so the menu shows where each night stands.

## Data model (Kendo's implementation of the above)

- New Firestore collection `campaigns` (Mike/admin only):
  { name, datePlayed, roster: [ { humanName, characterId,
    characterName (snapshot at save time), ownerUid,
    ownerDisplayName } ], highlights: "", emails: [],
    createdAt, createdBy }
- Player push: a character gets a campaign push (owner action, like the
  sketch send) that stages it in Mike's admin Band list; pushing does
  not disturb the sketch queue or any sketch status.
- Rules: campaigns collection is admin-only (create/read/update/delete
  keyed on the admin email, same pattern as the inbox rules); players
  never read campaigns. The owner push fields on `characters` follow the
  existing owner-update pattern.
- The draft's summary text is assembled IN THE APP from the campaign
  record + the highlights notes (template, no external AI call); Mike
  edits freely in his mail program before sending.
