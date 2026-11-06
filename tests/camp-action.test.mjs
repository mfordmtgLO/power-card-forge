// ============================================================
// Headless checks for Forge camp actions (CAMP-ACTION-SPEC.md).
// Run:  node tests/camp-action.test.mjs
// Covers:
//  (a) the kind list IS the game engine's seven executable camp
//      effects, each presented by what it does;
//  (b) validateCampAction — the required-field gate (missing,
//      unknown kind, empty / overlong name or text rejected;
//      valid input normalized to exactly three trimmed fields);
//  (c) the creation gate — the exact call the Forge form's
//      submit handler makes, and the app.js lock: campAction is
//      written exactly once, in the creation payload;
//  (d) solidified read-back — the stored action is what the
//      sheet logic and the Roll20 export read, and it beats the
//      class pattern;
//  (e) legacy fallback — docs forged before camp actions get
//      their class-pattern gift, computed, never stored;
//  (f) export -> importer round-trip: the bio carries the camp
//      action; a legacy export (campAction: null) imports
//      cleanly with no Camp Action line.
// data.js is imported via a temp .mjs copy (the app ships plain
// .js ES modules with no package.json). app.js itself cannot be
// imported headlessly — it wires Firebase + DOM — so everything
// testable lives in data.js by design. firestore.rules does NOT
// whitelist fields on /characters/ (create checks ownerUid
// only), so there is no rules surface for this feature to test;
// the shape gate is validateCampAction, tested here.
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
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

// ---------- load forge-importer.js in a stubbed Roll20 sandbox ----------
const chars = [], attrs = [], whispers = [];
function findObjs(q) {
  if (q.type === "character") return chars.filter((c) => c.name === q.name);
  if (q.type === "attribute") return attrs.filter((a) => a.characterid === q.characterid && a.name === q.name);
  return [];
}
function createObj(type, props) {
  if (type === "character") {
    const ch = {
      _id: "char" + (chars.length + 1), name: props.name, props: {},
      get(k) { return k === "_id" ? this._id : (k === "name" ? this.name : this.props[k]); },
      set(k, v) { this.props[k] = v; }
    };
    chars.push(ch);
    return ch;
  }
  if (type === "attribute") {
    const a = { characterid: props.characterid, name: props.name, current: props.current, max: undefined, set(k, v) { this[k] = v; } };
    attrs.push(a);
    return a;
  }
  return null;
}
let chatHandler = null;
const sandbox = {
  on: (ev, fn) => { if (ev === "chat:message") chatHandler = fn; },
  sendChat: (from, msg) => whispers.push(from + ": " + msg),
  createObj, findObjs,
  log: () => {},
  escape: globalThis.escape, unescape: globalThis.unescape
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(appDir, "roll20", "forge-importer.js"), "utf8"), sandbox);
ok(typeof chatHandler === "function", "importer registered a chat handler");
function paste(line) { chatHandler({ type: "api", content: line, who: "Tester" }); }

// ---------- (a) the kind list ----------
console.log("(a) camp-action kind list = the game's seven kinds");
eq(D.CAMP_ACTION_KINDS.map((k) => k.kind).sort().join(","),
  "brace,heal,inspiration,mend,omen,signal,till",
  "exactly the game's seven executable kinds");
for (const k of D.CAMP_ACTION_KINDS) {
  ok(!!k.pattern && !!k.hero && typeof k.does === "string" && k.does.length > 20,
    "kind " + k.kind + " carries its pattern gift, hero, and a plain-words effect");
}
eq(D.campActionKind("till").pattern, "Open the Till", "till is Eli's Open the Till");
eq(D.campActionKind("brace").pattern, "Sharpen & Brace", "brace is Sharpen & Brace (Dre's, per Mike's 2026-11-03 ruling)");
eq(D.campActionKind("nope"), null, "unknown kind resolves to null");

// ---------- (b) validateCampAction gate ----------
console.log("(b) validateCampAction — the required-field gate");
ok(!D.validateCampAction(undefined).ok, "missing camp action rejected");
ok(!D.validateCampAction(null).ok, "null rejected");
ok(!D.validateCampAction({}).ok, "empty object rejected");
ok(!D.validateCampAction({ name: "X", text: "Y" }).ok, "no kind rejected");
ok(!D.validateCampAction({ kind: "canvass", name: "X", text: "Y" }).ok, "Canvass is not an ownable kind (it is the universal camp action)");
ok(!D.validateCampAction({ kind: "heal", name: "   ", text: "Y" }).ok, "blank name rejected");
ok(!D.validateCampAction({ kind: "heal", name: "X", text: "" }).ok, "empty flavor line rejected");
ok(!D.validateCampAction({ kind: "heal", name: "N".repeat(D.CAMP_NAME_MAX + 1), text: "Y" }).ok, "name over the cap rejected");
ok(!D.validateCampAction({ kind: "heal", name: "X", text: "T".repeat(D.CAMP_TEXT_MAX + 1) }).ok, "flavor line over the cap rejected");
ok(!D.validateCampAction({ kind: "heal", name: 42, text: "Y" }).ok, "non-string name rejected");
const good = D.validateCampAction({ kind: "till", name: "  The Long Count  ", text: " She tallies the till and the town breathes easier. ", extra: "dropped" });
ok(good.ok, "valid camp action accepted");
eq(good.campAction.kind, "till", "kind kept");
eq(good.campAction.name, "The Long Count", "name trimmed");
eq(good.campAction.text, "She tallies the till and the town breathes easier.", "flavor trimmed");
eq(Object.keys(good.campAction).sort().join(","), "kind,name,text", "normalized to exactly the three fields (extras dropped)");
const atCaps = D.validateCampAction({ kind: "omen", name: "N".repeat(D.CAMP_NAME_MAX), text: "T".repeat(D.CAMP_TEXT_MAX) });
ok(atCaps.ok, "name and line exactly at the caps accepted");

// ---------- (c) the creation gate + the app.js lock ----------
console.log("(c) creation gate and lock-at-creation (source-level, app.js cannot run headlessly)");
// The exact call shape the submit handler makes from the form fields:
ok(!D.validateCampAction({ kind: "heal", name: "", text: "" }).ok, "an unfilled form cannot pass the gate");
ok(D.validateCampAction({ kind: "heal", name: "Lantern Litany", text: "She reads the road ahead aloud." }).ok, "a filled form passes the gate");
const appSrc = fs.readFileSync(path.join(appDir, "app.js"), "utf8");
ok(appSrc.includes("validateCampAction({ kind: campKindSel.value"), "the submit handler gates on validateCampAction");
eq((appSrc.match(/campAction:/g) || []).length, 1, "app.js writes campAction exactly once — the creation payload (the lock)");
ok(appSrc.includes("campAction: campV.campAction"), "the creation payload stores the validated, normalized action");

// ---------- (d) solidified read-back ----------
console.log("(d) solidified read-back — stored action is what sheet + export read");
const forged = {
  name: "Wren", "class": "Warrior", race: "",
  sliders: { str: 14, dex: 10, con: 13, int: 7, wis: 9, cha: 9, mag: 3, heal: 5 },
  weapons: [{ name: "Tally Axe", die: 12 }, { name: "", die: null }, { name: "", die: null }],
  spellPicks: [], packPicks: [],
  deathBlow: "The Final Tally", perk: "", description: "",
  campAction: { kind: "till", name: "The Long Count", text: "She tallies the till and the town breathes easier." }
};
const eff = D.effectiveCampAction(forged);
eq(eff.forged, true, "own action reads back as forged");
eq(eff.kind, "till", "own kind wins over the Warrior pattern (brace)");
eq(eff.name, "The Long Count", "own name reads back exactly as solidified");
eq(eff.text, "She tallies the till and the town breathes easier.", "own line reads back exactly as solidified");
const payload = D.buildRoll20Export(forged, "CAMP1");
eq(JSON.stringify(payload.campAction), JSON.stringify(forged.campAction), "export carries the stored camp action verbatim");

// ---------- (e) legacy fallback ----------
console.log("(e) legacy characters — class-pattern gift, computed, never stored");
const legacyRanger = { name: "Old Scout", "class": "Ranger", sliders: forged.sliders };
const lr = D.effectiveCampAction(legacyRanger);
eq(lr.forged, false, "legacy Ranger: not forged");
eq(lr.kind, "omen", "legacy Ranger falls back to Scout's Omen (omen)");
eq(lr.name, "Scout's Omen", "legacy Ranger gift name");
eq(D.effectiveCampAction({ "class": "Healer" }).kind, "heal", "legacy Healer -> Healing Hands pattern");
eq(D.effectiveCampAction({ "class": "Keeper" }).kind, "till", "legacy Keeper -> Open the Till pattern");
eq(D.effectiveCampAction({ "class": "Fighter" }).kind, "brace", "legacy Fighter -> Dre pattern via FORGE_CLASS_HERO (brace)");
eq(D.effectiveCampAction({ "class": "Magician" }).kind, "signal", "legacy Magician -> Sana pattern via FORGE_CLASS_HERO (signal)");
eq(D.effectiveCampAction({ "class": "Paladin" }).kind, "heal", "legacy Paladin -> Priya pattern via FORGE_CLASS_HERO (heal)");
const malformed = D.effectiveCampAction({ "class": "Herald", campAction: { kind: "bogus", name: "X", text: "Y" } });
eq(malformed.forged, false, "a malformed stored action never renders as forged");
eq(malformed.kind, "signal", "malformed stored action falls back to the class pattern");
ok(!("campAction" in legacyRanger), "the fallback wrote nothing back onto the doc");

// ---------- (f) export -> importer round-trip ----------
console.log("(f) Roll20 export / importer round-trip");
const line = D.roll20ImportLine(forged, "CAMP1");
paste(line);
eq(chars.length, 1, "importer created the character");
const bio = chars[0].props.bio || "";
ok(bio.includes("Camp Action:"), "bio carries a Camp Action line");
ok(bio.includes("The Long Count"), "bio shows the player's own camp-action name");
ok(bio.includes("tallies the till"), "bio shows the player's own flavor line");
const legacyPayload = D.buildRoll20Export(legacyRanger, "CAMP2");
eq(legacyPayload.campAction, null, "legacy export carries campAction: null (nothing invented)");
paste(D.roll20ImportLine(legacyRanger, "CAMP2"));
eq(chars.length, 2, "legacy character still imports");
ok(!(chars[1].props.bio || "").includes("Camp Action:"), "legacy bio has no Camp Action line");

console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
