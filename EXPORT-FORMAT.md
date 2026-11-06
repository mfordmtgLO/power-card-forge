# Forge → Roll20 export format (draft, prepared 2026-10-28)

The Forge's **Copy for Roll20** button (app side still to be wired — see
README.md) produces ONE chat line:

```
!forge <base64url-encoded UTF-8 JSON>
```

Base64url, because a Roll20 chat line cannot safely carry raw JSON with
quotes, braces and line breaks, and because character names, tales and
descriptions contain apostrophes and punctuation that must survive the
paste intact. The payload is capped by practical chat length; keep tales
OUT of the blob (they live on the Forge sheet and in the game's Campaigns
tiles) — the bio carries the sheet facts only.

## Payload fields

Field names mirror the Forge's Firestore `characters` doc
(`character-forge-app/app.js`, character creation), so the export is a
projection of the doc, not a new model:

| Field | From the Forge doc | Notes |
|---|---|---|
| `name` | `name` | Character profile name. Duplicates in Roll20 get ` (2)`, ` (3)`… |
| `characterId` | doc ID | Rides along so a campaign record / Play prompt can always link back to the live sheet. |
| `class` | `class` | Forge class name as stored. |
| `race` | `race` | As typed by the player. |
| `sliders` | `sliders` | Object with exactly the 8 keys `str dex con int wis cha mag heal` (numbers). Required — an export without it is rejected. |
| `hp` | — (derived/default at export) | Optional; when present the importer sets `hp` current = max = this value. |
| `weapons` | `weapons` | Array of `{name, die}`; blank slots (`name: ""` / `die: null`) are skipped in the bio. |
| `spellPicks` | `spellPicks` — **converted at export** | The doc stores **numeric indices** into `SPELLS[heroKey]` (app.js pick cards push the index, not the name), where `heroKey = CLASS_TABLES[class].hero` in data.js. The export MUST map each index to `SPELLS[heroKey][i].name`. Copying the doc array verbatim puts `Spells: 0, 2` on the Roll20 bio — demonstrated in simulation 2026-10-28. Characters whose class has no spell list export `[]`. |
| `packPicks` | `packPicks` — **converted at export** | The doc stores **pack item IDs** (`PACK_ITEMS[].id`, e.g. `"brief"`, `"aid"`), not names. The export MUST map each ID to its `PACK_ITEMS` name (e.g. `Field Brief`, `First-Aid Kit`). Copying verbatim puts `Pack: brief, aid` on the bio — demonstrated in simulation 2026-10-28. |
| `deathBlow` | `deathBlow` | Free text, may be empty. |
| `perk` | `perk` | Free text, may be empty. |
| `campAction` | `campAction` — **validated at export** | The character's own camp action `{kind, name, text}` (see `../CAMP-ACTION-SPEC.md`), normalized through `validateCampAction` in data.js. `null` when the doc carries no valid one (characters forged before camp actions) — the importer then prints no Camp Action line, and the game falls back to the class-pattern gift. |
| `description` | `description` | Free text, may be empty. |
| `controlledByPlayerId` | — (Mike supplies, optional) | A Roll20 player ID; only honored once that player has joined the campaign. Omit normally — the GM assigns in the UI. |

Derived modifiers are NOT exported: the importer recomputes them with the
game's own formula, `modifier = clamp(round((stat − 8) / 2), −2, +4)`
(`character-forge-app/data.js`), and writes both `str`…`heal` attributes
and `str_mod`…`heal_mod` attributes, plus long-name aliases
(`Strength`…`Healing`) for hand-written macros.

## Example (decoded, for eyeballing only — the pasted line is encoded)

```json
{
  "name": "Wren",
  "characterId": "EXAMPLE-doc-id",
  "class": "Magician",
  "race": "",
  "sliders": { "str": 6, "dex": 9, "con": 8, "int": 14, "wis": 12, "cha": 10, "mag": 15, "heal": 6 },
  "weapons": [ { "name": "Example Wand", "die": 8 } ],
  "spellPicks": [],
  "packPicks": [],
  "deathBlow": "",
  "perk": "",
  "campAction": { "kind": "signal", "name": "The Lantern Litany", "text": "She raises the lantern and reads the road ahead aloud" },
  "description": "Stand-in test character shape — same fields the game import test used."
}
```

(Wren was the stand-in completed character used to test the game's
forged-character import on 2026-10-27; this example is illustrative, not a
real player's sheet.)
