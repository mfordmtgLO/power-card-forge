# Power Card — Character Forge: setup

One-time setup, about 15 minutes. After this, sharing is just a URL:
friends sign themselves in with their own Google accounts. There is
**no whitelist, no manual account creation, and no per-friend setup
step anywhere** — each person's characters are fenced to their own
account by the security rules alone.

You need: this folder, a Google account, a GitHub account, a Vercel
account (the same ones the game already uses).

---

## Part 1 — Firebase (the database + sign-in + portrait storage)

1. **Create the project**
   console.firebase.google.com → **Add project** → name it
   `power-card-forge` → Continue → (Google Analytics can stay off) →
   **Create project**.

2. **Turn on Google sign-in**
   Left menu **Build → Authentication** → **Get started** →
   **Sign-in method** tab → **Google** → **Enable** → pick your
   support email → **Save**.

3. **Create the database**
   Left menu **Build → Firestore Database** → **Create database** →
   leave the location it offers → **Start in production mode** →
   **Create**. (Production mode = locked until your rules land in
   step 5. That is what you want.)

4. **Register the web app and paste the config**
   Project home → the **`</>`** (web) icon → nickname `forge-web` →
   **Register app** → it shows a `firebaseConfig` block.
   Open **firebase-config.js** in this folder and replace each
   `PASTE_..._HERE` value with the matching value from that block
   (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId). Keep the quotes.

5. **Paste the database rules**
   **Firestore Database → Rules** tab → delete what's there → paste
   in the whole contents of **firestore.rules** from this folder →
   **Publish**.

6. **Set the admin email (three places, must match exactly)**
   The admin is you — it is what makes **Mike's Inbox** appear.
   - In **firebase-config.js**: replace `PASTE_MIKE_EMAIL_HERE`
     (the ADMIN_EMAIL line) — but first sign in to the finished app
     once (Part 3) so you know the exact Google email you will use;
     it is almost certainly your usual one.
   - In **firestore.rules**: replace `PASTE_MIKE_EMAIL_HERE`.
   - In **storage.rules**: replace `PASTE_MIKE_EMAIL_HERE`.
   Then re-publish both rules (steps 5 and 8) if you edited them
   after publishing, and re-upload firebase-config.js wherever the
   app is hosted (Part 2) so all three agree.

7. **Turn on portrait storage**
   Left menu **Build → Storage** → **Get started** → **Start in
   production mode** → **Done**.

8. **Paste the storage rules**
   **Storage → Rules** tab → delete what's there → paste in the
   whole contents of **storage.rules** → **Publish**.

## Part 2 — Put it on GitHub + Vercel (your proven pattern)

9. **GitHub repo**
   github.com → **New repository** → name it `power-card-forge` →
   **Create repository** → **Add file → Upload files** → drag in
   EVERYTHING from this folder (index.html, styles.css, app.js,
   data.js, firebase-config.js, and the whole **assets** folder —
   the assets folder must come along, the portraits live there) →
   **Commit changes**. (firestore.rules, storage.rules and
   SETUP.md can ride along too; they do not affect the site.)

10. **Vercel deploy**
    vercel.com → **Add New → Project** → import `power-card-forge` →
    framework preset: **Other** (it is a static site — no build
    command, no output directory to set) → **Deploy**.

11. **Let Firebase accept sign-ins from the Vercel address**
    Firebase console → **Authentication → Settings → Authorized
    domains** → **Add domain** → add your Vercel address
    (e.g. `power-card-forge.vercel.app`). Without this, Google
    sign-in will refuse to run on the live site. `localhost` is
    already on the list for testing at home.

11b. **Let the Power Card game sign in too**
    The game reads this same project — players sign in there with
    the same Google account to import their completed characters.
    On that same **Authorized domains** list, also **Add domain**
    for the game's two addresses: `vote-or-fade-away.vercel.app`
    and `mfordmtglo.github.io`. No rules change is needed for the
    game — its reads are owner-scoped by the same rules.

12. **Share the link**
    Send the Vercel URL to the group (30 friends or fewer — the
    free tiers cover this group comfortably). Each person taps it,
    signs in with their own Google account, and forges. Done.

---

## How the sketch loop runs (the only recurring human steps)

1. A friend forges a character — describing **three attires**
   (Attire 1 is the main outfit; 2 and 3 can be left blank and the
   artist chooses, in character) — opens its sheet, and taps
   **Send to Mike to create**. It lands in **Mike's Inbox** as New.
2. Mike checks the boxes next to the requests he wants to send on
   (or Select all), then taps **Submit to Kendo for sketch
   creation**. The app bundles the briefs into one batch document.
   The batch's header carries the return contract (next step).
3. Mike copies or downloads the batch and pastes it into his chat
   with Kendo. Making the actual drawings is Kendo's step, outside
   this app.
4. Kendo returns a **full set of nine files per character, plus
   one tales file** — ten items in all, all named from the
   character's doc ID:
   - `<docId>--attire1.webp`, `<docId>--attire2.webp`,
     `<docId>--attire3.webp` — the three attire portraits
     (1000x2000 WebP each)
   - `<docId>--attire1-skin.webp`, `<docId>--attire1-hair.webp`,
     `<docId>--attire2-skin.webp`, `<docId>--attire2-hair.webp`,
     `<docId>--attire3-skin.webp`, `<docId>--attire3-hair.webp`
     — the skin and hair masks for each attire (500x1000 WebP)
   - `<docId>--tales.json` — the character's three Campaigns of
     Friends backstory tales: one per weapon (the move names are
     the character's three weapon names), each tale ending with
     the vote weave. In the file it looks like:
     `{"tales":[{"move":"<weapon 1 name>","text":"<tale>"},{"move":"<weapon 2 name>","text":"<tale>"},{"move":"<weapon 3 name>","text":"<tale>"}]}`
5. Mike opens the inbox → **Attach returned portraits** → picks
   all the returned files at once, tales .json included. Files
   are grouped by doc ID and pushed to that friend's sheet. A
   character **completes** only when all nine of its art files
   have landed; a partial set is reported file by file (what
   landed, what is still missing) and does **not** complete the
   character — the missing files can be attached in a later
   pass. The tales file is validated and written to the sheet in
   the same pass and reported separately (landed / missing /
   invalid); it does **not** gate completion — a set can
   complete without it, and tales can land before or after the
   art. (A single `<docId>.webp`
   still lands as an interim portrait — also attachable on any
   request's own card — but an interim portrait alone does not
   complete the set; its owner can then tap **Ask Mike for the
   full set** on their sheet.)
6. The friend opens their character sheet. Before completion it
   shows whatever portrait exists and one line: *Full
   customization arrives when your complete set lands.* Once the
   set completes, the sheet behaves **exactly like Maya's,
   Priya's, Eli's and Marc's**: all three attires to choose from,
   every skin tone and hair color through the Look, spell and
   pack picks, the same slider bank, and their three weapons —
   hero parity, on their own character. And once the tales file
   has landed, the sheet carries their **Campaigns of Friends**:
   three tiles named for their three weapons; tapping one opens
   its backstory tale in a shared panel that slow-scrolls the
   text (tap the panel to pause or resume). If the set is
   complete but the tales have not landed yet, that section
   says so in one plain line instead. Their status line walked
   them through it the whole way: *With Mike — queued* →
   *Kendo is creating your sketch* → the set itself.

That's the whole loop. Nothing in it is per-friend admin: friends
sign themselves in, and the only hands that touch a sketch are
Mike's (batch + attach) and Kendo's (the drawing).

## For the game import

The Power Card game reads each character straight off this same
database — there is **no extra export step, and nothing for Mike
to do** for it. From the character doc, the game takes the three
weapons (`weapons[0..2]` — any blank slot is filled from the
class weapon list, computed game-side from the same tables this
app uses) and the three Campaigns tales (`tales[0..2]`),
alongside the attires, masks, sliders and picks the sheet
already carries. A character whose tales have not landed yet
imports without them; the game shows no Campaigns section for
that character until the tales file has been attached here.
