// ============================================================
// Headless checks for the Session Credits Push build
// (SESSION-CREDITS-PUSH-SPEC.md). Run:
//   node tests/session-pushes.test.mjs
// Covers:
//  (a) validatePushEntry — the shape gate for one push doc;
//  (b) pushTimeMs — Timestamp millis, however they arrive;
//  (c) grouping / sorting / per-character lookup (data.js);
//  (d) firestore.rules — the session_pushes block's text:
//      admin-only create with shape validation, player reads
//      only their own pushes, admin-only update/delete, and
//      the pre-existing rules untouched;
//  (e) app.js / styles.css wiring — the sheet dropdown, the
//      email-pinned query, the verbatim empty state;
//  (f) contract v2 — the optional characterId / playedAs
//      fields: validation bounds, the ID-aware reader rule
//      (a renamed night files under the original sheet; a
//      stranger's ID never files by name), the rules text,
//      and the app.js played-as / band-payload wiring.
// data.js is imported via a temp .mjs copy, like the
// Campaigns suite (the app ships plain .js ES modules with
// no package.json). app.js cannot be imported headlessly —
// it wires Firebase + DOM — so its checks are text-level.
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.dirname(here);

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log("  PASS " + label); }
  else { failures++; console.log("  FAIL " + label); }
}
function eq(a, b, label) { ok(a === b, label + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// ---------- load data.js ----------
const tmpData = path.join(os.tmpdir(), "forge-data-under-test.mjs");
fs.copyFileSync(path.join(appDir, "data.js"), tmpData);
const D = await import(pathToFileURL(tmpData).href);

const goodPush = {
  playerEmail: "bob@example.com",
  characterName: "Prya",
  sessionDate: "2026-10-17",
  sessionLabel: "Module Q1 - Queen of the Demonweb Pits",
  dmName: "Mike",
  creditsUrl: "https://muse.ai/s/credits-roll-example",
  pushedAt: { seconds: 1761000000, nanoseconds: 0 }
};

// ---------- (a) validatePushEntry ----------
console.log("(a) Push-entry shape gate");
const v = D.validatePushEntry(goodPush);
ok(v.ok, "a complete push validates");
eq(v.entry.characterName, "Prya", "characterName carried through");
eq(v.entry.pushedAtMs, 1761000000000, "pushedAtMs derived from the Timestamp seconds");
const padded = D.validatePushEntry(Object.assign({}, goodPush, { characterName: "  Prya  ", playerEmail: " bob@example.com " }));
ok(padded.ok && padded.entry.characterName === "Prya" && padded.entry.playerEmail === "bob@example.com", "text fields are trimmed");
ok(!D.validatePushEntry(null).ok, "null is rejected");
ok(!D.validatePushEntry("a string").ok, "a non-object is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { dmName: "" })).ok, "an empty dmName is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { sessionLabel: 42 })).ok, "a non-string sessionLabel is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { playerEmail: "bob" })).ok, "a non-email playerEmail is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { sessionDate: "10/17/2026" })).ok, "a non-ISO sessionDate is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { creditsUrl: "ftp://example.com/roll" })).ok, "a non-http(s) creditsUrl is rejected");
const missing = Object.assign({}, goodPush); delete missing.creditsUrl;
ok(!D.validatePushEntry(missing).ok, "a missing creditsUrl is rejected");

// ---------- (b) pushTimeMs ----------
console.log("(b) pushTimeMs coercion");
eq(D.pushTimeMs(42), 42, "a number passes through");
eq(D.pushTimeMs(new Date(1234)), 1234, "a Date reads its millis");
eq(D.pushTimeMs({ seconds: 100, nanoseconds: 500000000 }), 100500, "a Timestamp-like {seconds, nanoseconds} converts");
eq(D.pushTimeMs({ toMillis: () => 777 }), 777, "a toMillis() object converts");
ok(D.pushTimeMs("2026-11-02T00:00:00Z") > 0, "an ISO string parses");
eq(D.pushTimeMs("not a date"), 0, "a garbage string counts as 0");
eq(D.pushTimeMs(null), 0, "null counts as 0");
eq(D.pushTimeMs(undefined), 0, "undefined counts as 0");
eq(D.pushTimeMs(NaN), 0, "NaN counts as 0");

// ---------- (c) grouping / sorting / lookup ----------
console.log("(c) Grouping, sorting, lookup");
const rawPushes = [
  Object.assign({}, goodPush, { sessionDate: "2026-10-03", sessionLabel: "Module Q0 - Warmup", pushedAt: { seconds: 1760000000, nanoseconds: 0 } }),
  goodPush,
  Object.assign({}, goodPush, { characterName: "Kael", sessionDate: "2026-10-17", sessionLabel: "Module Q1 - Queen of the Demonweb Pits", pushedAt: new Date(1761000000000) }),
  Object.assign({}, goodPush, { characterName: "  Zoë ☃  ", sessionDate: "2026-11-07", sessionLabel: "Module Q2 - The Long Count" }),
  Object.assign({}, goodPush, { characterName: "Ghost", creditsUrl: "ftp://bad" }),
  Object.assign({}, goodPush, { characterName: "Ghost", dmName: "" })
];
const grouped = D.groupPushesByCharacter(rawPushes);
ok(grouped instanceof Map, "grouping returns a Map");
eq(grouped.size, 3, "three characters grouped (the two malformed pushes dropped)");
const prya = D.adventuresForCharacter(grouped, "Prya");
eq(prya.length, 2, "Prya has both her pushes");
eq(prya[0].sessionLabel, "Module Q1 - Queen of the Demonweb Pits", "Prya's entries are newest first");
eq(prya[1].sessionLabel, "Module Q0 - Warmup", "Prya's older push sorts last");
eq(D.adventuresForCharacter(grouped, "  Prya ").length, 2, "lookup trims the name the same way grouping does");
eq(D.adventuresForCharacter(grouped, "Zoë ☃").length, 1, "a Unicode name groups and looks up (key was trimmed)");
eq(D.adventuresForCharacter(grouped, "Wren").length, 0, "an unknown character has no adventures");
eq(D.adventuresForCharacter(null, "Prya").length, 0, "a null map yields no adventures");
eq(D.adventuresForCharacter(grouped, "Ghost").length, 0, "malformed pushes never reach a sheet");
// Tie-break: identical pushedAt -> the later session date wins.
const tied = D.sortPushesNewestFirst([
  { sessionDate: "2026-10-17", sessionLabel: "Earlier date", pushedAt: 5000 },
  { sessionDate: "2026-11-07", sessionLabel: "Later date", pushedAt: 5000 }
]);
eq(tied[0].sessionLabel, "Later date", "a pushedAt tie falls to the later session date");
// sortPushesNewestFirst sorts raw docs too, and never mutates its input.
const rawOrder = [
  { sessionDate: "2026-10-03", sessionLabel: "Old", pushedAt: { seconds: 100, nanoseconds: 0 } },
  { sessionDate: "2026-10-17", sessionLabel: "New", pushedAt: { seconds: 200, nanoseconds: 0 } }
];
const sortedRaw = D.sortPushesNewestFirst(rawOrder);
eq(sortedRaw[0].sessionLabel, "New", "raw docs sort newest first by Timestamp seconds");
eq(rawOrder[0].sessionLabel, "Old", "sorting does not mutate the input array");

// ---------- (d) firestore.rules text ----------
console.log("(d) firestore.rules — session_pushes block");
const rules = fs.readFileSync(path.join(appDir, "firestore.rules"), "utf8");
ok(rules.includes("match /session_pushes/{pushId}"), "rules: the session_pushes match block exists");
const blockStart = rules.indexOf("match /session_pushes/");
const blockEnd = rules.indexOf("match /{document=**}", blockStart);
ok(blockStart >= 0 && blockEnd > blockStart, "rules: the block sits before the default-deny catch-all");
const block = rules.slice(blockStart, blockEnd);
ok(block.includes("allow create: if isAdmin() && isValidPush(request.resource.data);"), "rules: create is admin-only AND shape-validated");
for (const f of ["playerEmail", "characterName", "sessionDate", "sessionLabel", "dmName", "creditsUrl", "pushedAt"]) {
  ok(block.includes('"' + f + '"'), "rules: the shape gate names " + f);
}
ok(block.includes("hasAll(") && block.includes("hasOnly("), "rules: the doc must carry exactly the seven fields");
ok(block.includes("data.pushedAt is timestamp"), "rules: pushedAt must be a timestamp");
ok(block.includes("resource.data.playerEmail == request.auth.token.email"), "rules: a player reads only pushes addressed to their own email");
ok(block.includes("allow update, delete: if isAdmin();"), "rules: update/delete are admin-only");
ok(!block.includes("allow read, write"), "rules: no blanket read/write grant in the block");
ok(!block.includes("allow create: if isSignedIn()"), "rules: a merely signed-in user cannot create a push");
// The pre-existing rules stand untouched.
ok(rules.includes("match /characters/{characterId}"), "rules: the characters block is still present");
ok(rules.includes("match /campaigns/{campaignId}"), "rules: the campaigns block is still present");
ok(rules.includes("allow read, write: if isAdmin();"), "rules: campaigns stay admin-only");
ok(rules.includes("allow read, write: if false;"), "rules: the default-deny catch-all is still present");
eq((rules.match(/PASTE_MIKE_EMAIL_HERE/g) || []).length, 2, "rules: the admin-email placeholder is unchanged (comment + isAdmin)");

// ---------- (e) app.js / styles.css wiring ----------
console.log("(e) App wiring");
const appJs = fs.readFileSync(path.join(appDir, "app.js"), "utf8");
ok(appJs.includes('collection(db, "session_pushes")'), "app: the session_pushes collection handle exists");
ok(appJs.includes('where("playerEmail", "==", user.email)'), "app: the pushes query is pinned to the signed-in player's email");
ok(appJs.includes("groupPushesByCharacter"), "app: pushes are grouped through the data.js helper");
ok((appJs.match(/data-adventures/g) || []).length >= 3, "app: both sheet renderers carry the adventures section");
ok(appJs.includes("No adventures yet — after a tabletop run, your DM can push the closing credits here."), "app: the empty state is verbatim");
ok(appJs.includes('"Campaign adventures"'), "app: the dropdown label is Campaign adventures");
ok(appJs.includes('target="_blank"'), "app: a credits entry opens in a new tab");
const css = fs.readFileSync(path.join(appDir, "styles.css"), "utf8");
ok(css.includes(".adventures") && css.includes(".adv-entry") && css.includes(".adv-list"), "css: the dropdown styles exist");

// ---------- (f) contract v2 — identity by character ID ----------
console.log("(f) v2 — optional characterId / playedAs, ID-aware lookup");
const v2Push = Object.assign({}, goodPush, { characterId: "doc-prya-123", playedAs: "Shadow Prya" });
const vv = D.validatePushEntry(v2Push);
ok(vv.ok, "a v2 push (characterId + playedAs) validates");
eq(vv.entry.characterId, "doc-prya-123", "characterId carried through");
eq(vv.entry.playedAs, "Shadow Prya", "playedAs carried through");
ok(D.validatePushEntry(Object.assign({}, goodPush, { characterId: "doc-x" })).ok, "characterId alone is accepted");
ok(D.validatePushEntry(Object.assign({}, goodPush, { playedAs: "Night Alias" })).ok, "playedAs alone is accepted");
const plainV1 = D.validatePushEntry(goodPush);
ok(plainV1.ok && !("characterId" in plainV1.entry) && !("playedAs" in plainV1.entry), "a v1 push validates with no v2 fields on the entry");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { characterId: 42 })).ok, "a non-string characterId is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { characterId: "" })).ok, "an empty characterId is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { characterId: "x".repeat(129) })).ok, "a 129-char characterId is rejected");
ok(D.validatePushEntry(Object.assign({}, goodPush, { characterId: "x".repeat(128) })).ok, "a 128-char characterId is accepted");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { playedAs: 42 })).ok, "a non-string playedAs is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { playedAs: "" })).ok, "an empty playedAs is rejected");
ok(!D.validatePushEntry(Object.assign({}, goodPush, { playedAs: "y".repeat(81) })).ok, "an 81-char playedAs is rejected");
ok(D.validatePushEntry(Object.assign({}, goodPush, { playedAs: "y".repeat(80) })).ok, "an 80-char playedAs is accepted");
// The reader rule over raw docs: ID wins; legacy falls back to the true name.
const docPrya = { id: "doc-prya-123", name: "Prya" };
const mixed = [
  Object.assign({}, goodPush, { sessionLabel: "Legacy night", sessionDate: "2026-09-01", pushedAt: { seconds: 1759000000, nanoseconds: 0 } }),
  Object.assign({}, goodPush, { characterId: "doc-prya-123", playedAs: "Shadow Prya", sessionLabel: "Renamed night", sessionDate: "2026-10-17", pushedAt: { seconds: 1761000000, nanoseconds: 0 } }),
  Object.assign({}, goodPush, { characterId: "doc-someone-else", sessionLabel: "Not hers", sessionDate: "2026-11-01", pushedAt: { seconds: 1762000000, nanoseconds: 0 } }),
  Object.assign({}, goodPush, { characterId: "doc-prya-123", characterName: "Prya (old spelling)", sessionLabel: "ID wins", sessionDate: "2026-10-20", pushedAt: { seconds: 1761500000, nanoseconds: 0 } })
];
const hers = D.adventuresForCharacterDoc(mixed, docPrya);
eq(hers.length, 3, "ID lookup files the renamed session, the legacy push, and the ID-matched push");
eq(hers[0].sessionLabel, "ID wins", "ID lookup returns newest first (an ID match files even when its name field drifted)");
eq(hers[1].sessionLabel, "Renamed night", "the renamed session files under the original sheet");
eq(hers[1].playedAs, "Shadow Prya", "the renamed session carries its playedAs label for the sheet to render");
eq(hers[2].sessionLabel, "Legacy night", "a legacy push (no ID) still files by true name");
ok(!hers.some((e) => e.sessionLabel === "Not hers"), "a push carrying another character's ID never files by name coincidence");
eq(D.adventuresForCharacterDoc(mixed, { id: "doc-nobody", name: "Nobody" }).length, 0, "an unrelated doc gets nothing");
eq(D.adventuresForCharacterDoc(mixed, null).length, 0, "a null doc yields no adventures");
eq(D.adventuresForCharacterDoc(null, docPrya).length, 0, "null pushes yield no adventures");
eq(D.adventuresForCharacterDoc(D.groupPushesByCharacter([v2Push]), docPrya).length, 0, "the doc lookup takes raw pushes, not the grouped map (guard rail)");
// Name grouping still files a v2 push under its TRUE name (module preview compat).
const g2 = D.groupPushesByCharacter([v2Push]);
eq(D.adventuresForCharacter(g2, "Prya").length, 1, "name grouping still files a v2 push under its true name");
// Rules text — v2.
ok(block.includes('"characterId"') && block.includes('"playedAs"'), "rules: the v2 optionals are named in the shape gate");
ok(block.includes('hasAll(["playerEmail", "characterName", "sessionDate", "sessionLabel", "dmName", "creditsUrl", "pushedAt"])'), "rules: hasAll still pins exactly the seven v1 fields");
ok(block.includes('"characterId" in data') && block.includes('"playedAs" in data'), "rules: both v2 fields are optional (guarded by key presence)");
ok(block.includes("data.characterId.size() <= 128"), "rules: characterId is capped at 128 chars");
ok(block.includes("data.playedAs.size() <= 80"), "rules: playedAs is capped at 80 chars");
// App wiring — v2.
ok(appJs.includes("adventuresForCharacterDoc"), "app: the sheet lookup is ID-aware");
ok(appJs.includes('Played as "') && appJs.includes('" that night.'), "app: a renamed night renders its played-as line");
ok(appJs.includes("e.playedAs !== e.characterName"), "app: the played-as line shows only when the night name differed");
ok(appJs.includes("trueName") && appJs.includes("displayName"), "app: band entries carry trueName + displayName for the send contract");
ok(css.includes(".adv-played"), "css: the played-as line style exists");

console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
