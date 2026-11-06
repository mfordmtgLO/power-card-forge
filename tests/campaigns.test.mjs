// ============================================================
// Headless checks for the Campaigns build + Roll20 bridge.
// Run:  node tests/campaigns.test.mjs
// Covers (per CAMPAIGNS-SPEC.md / roll20/EXPORT-FORMAT.md):
//  (a) export blob -> forge-importer round-trip: the payload
//      conversions (spell indices -> names, pack ids -> names)
//      and the attributes the importer writes;
//  (b) Play-prompt assembly from a fixture campaign;
//  (c) the four Campaigns search filters;
//  (d) draft-email / mailto assembly.
// data.js is imported via a temp .mjs copy (the app ships
// plain .js ES modules with no package.json). app.js itself
// cannot be imported headlessly — it wires Firebase + DOM —
// so everything testable lives in data.js by design.
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
function attr(charId, name) {
  const a = attrs.find((x) => x.characterid === charId && x.name === name);
  return a ? a.current : undefined;
}

// ---------- (a) export -> importer round-trip ----------
console.log("(a) Roll20 export / importer round-trip");
const fixtureChar = {
  ownerUid: "uid-bob", ownerDisplayName: "Bob Jacobs", ownerEmail: "bob@example.com",
  name: "Prya", "class": "Ranger", race: "Human",
  weaponName: "Voting Crossbow", weaponDie: 8,
  weapons: [{ name: "Voting Crossbow", die: 8 }, { name: "", die: null }, { name: "", die: null }],
  sliders: { str: 9, dex: 14, con: 10, int: 10, wis: 13, cha: 8, mag: 4, heal: 5 },
  spellPicks: [0, 2],           // SPELLS.maya -> "Sure Shot", "Volley"
  packPicks: ["brief", "aid"],  // PACK_ITEMS ids -> "Field Brief", "First-Aid Kit"
  deathBlow: "The Recount",
  perk: "Steady Aim — +2 to hit when standing still",
  description: "Counts every ballot twice — and trusts the tally. ☃"
};
const payload = D.buildRoll20Export(fixtureChar, "FIXTURE1");
eq(Object.keys(payload.sliders).sort().join(","), "cha,con,dex,heal,int,mag,str,wis", "payload sliders carry exactly the 8 keys");
eq(payload.spellPicks.join("|"), "Sure Shot|Volley", "spell indices converted to names");
eq(payload.packPicks.join("|"), "Field Brief|First-Aid Kit", "pack ids converted to names");
eq(payload.weapons.length, 3, "weapons: forged slot + class fills = 3");
eq(payload.weapons[0].name, "Voting Crossbow", "forged weapon leads");
ok(!("hp" in payload), "hp omitted (matches EXPORT-FORMAT example)");

const line = D.roll20ImportLine(fixtureChar, "FIXTURE1");
ok(line.startsWith("!forge "), "import line starts with !forge");
paste(line);
eq(chars.length, 1, "importer created exactly one character");
eq(chars[0].name, "Prya", "character name survived the round-trip");
const cid = chars[0]._id;
for (const k of D.STAT_KEYS) {
  eq(attr(cid, k), fixtureChar.sliders[k], "attr " + k + " = slider value");
  eq(attr(cid, k + "_mod"), D.modifier(fixtureChar.sliders[k]), "attr " + k + "_mod recomputed by the importer");
}
eq(attr(cid, "Dexterity"), 14, "long-name alias attribute written");
eq(attr(cid, "hp"), undefined, "no hp attribute (payload omitted hp)");
const bio = chars[0].props.bio || "";
ok(bio.includes("Sure Shot") && bio.includes("Volley"), "bio lists spell NAMES");
ok(!/Spells: 0/.test(bio), "bio does NOT list raw spell indices");
ok(bio.includes("Field Brief") && bio.includes("First-Aid Kit"), "bio lists pack NAMES");
ok(!bio.includes("brief, aid"), "bio does NOT list raw pack ids");
ok(bio.includes("Voting Crossbow"), "bio lists the forged weapon");
ok(bio.includes("Forge character ID: FIXTURE1"), "bio carries the doc ID");
ok(bio.includes("☃"), "UTF-8 description survived base64url");

paste(line);
eq(chars.length, 2, "second paste imports again");
eq(chars[1].name, "Prya (2)", "duplicate name gets the (2) suffix");

const before = chars.length;
paste("!forge " + D.b64urlEncodeUtf8(JSON.stringify({ name: "NoSliders" })));
eq(chars.length, before, "payload without sliders is rejected, nothing created");
paste("!forge !!!not-a-real-export!!!");
eq(chars.length, before, "garbage payload is rejected, nothing created");

// A Forge class (no shipped hero) exports no spells.
const fighterPayload = D.buildRoll20Export(Object.assign({}, fixtureChar, { "class": "Fighter", spellPicks: [0] }), "FIXTURE9");
eq(fighterPayload.spellPicks.length, 0, "Forge class exports spellPicks []");

// ---------- (b) Play-prompt assembly ----------
console.log("(b) Play-prompt assembly");
const campQ1 = { id: "C2", name: "Module Q1 - Queen of the Demonweb Pits", datePlayed: "2026-10-17", playState: "not sent", highlights: "", emails: [] };
const prompt = D.buildSetupPrompt(campQ1, [
  { humanName: "Bob Jacobs", characterName: "Prya", characterId: "FIXTURE1", line: line },
  { humanName: "Sam Ortiz", characterName: "Wren", characterId: "FIXTURE2", line: null }
]);
ok(prompt.includes("Module Q1 - Queen of the Demonweb Pits"), "prompt names the campaign");
ok(prompt.includes("2026-10-17"), "prompt carries the date");
ok(prompt.includes("Bob Jacobs plays Prya"), "prompt pairs human -> character");
ok(prompt.includes("Forge character doc ID: FIXTURE1"), "prompt carries the doc ID");
ok(prompt.includes(line), "prompt embeds the Roll20 import line verbatim");
ok(prompt.includes("UNAVAILABLE"), "prompt honestly flags an unloadable sheet");
ok(prompt.includes("Wren"), "the flagged entry still names its character");
ok(prompt.includes("READY"), "prompt asks Kendo to say READY");

// ---------- (c) the four search filters ----------
console.log("(c) Campaigns search filters");
const camps = [
  { id: "C1", name: "Module Q0 - Warmup", datePlayed: "2026-10-03", playState: "ready", highlights: "", emails: [],
    roster: [
      { humanName: "Bob Jacobs", characterName: "Prya", characterId: "FIXTURE1", ownerUid: "uid-bob", ownerDisplayName: "Bob Jacobs" },
      { humanName: "Sam Ortiz", characterName: "Wren", characterId: "FIXTURE2", ownerUid: "uid-sam", ownerDisplayName: "Sam Ortiz" }
    ] },
  { id: "C2", name: "Module Q1 - Queen of the Demonweb Pits", datePlayed: "2026-10-17", playState: "sent for setup", highlights: "", emails: [],
    roster: [{ humanName: "Bob Jacobs", characterName: "Kael", characterId: "FIXTURE3", ownerUid: "uid-bob", ownerDisplayName: "Bob Jacobs" }] },
  { id: "C3", name: "Module Q2 - The Long Count", datePlayed: "2026-11-07", playState: "not sent", highlights: "The band held the bridge at dawn.", emails: ["ana@example.com"],
    roster: [{ humanName: "Ana Ruiz", characterName: "Prya", characterId: "FIXTURE4", ownerUid: "uid-ana", ownerDisplayName: "Ana Ruiz" }] }
];
const ids = (rows) => rows.map((r) => r.campaign.id).join(",");
eq(ids(D.filterCampaigns(camps, {})), "C1,C2,C3", "no filters -> everything");
eq(D.filterCampaigns(camps, {})[0].entries.length, 2, "no filters -> full rosters");
const byHuman = D.filterCampaigns(camps, { human: "bob" });
eq(ids(byHuman), "C1,C2", "human filter -> only that human's campaigns");
eq(byHuman[0].entries.length, 1, "human filter narrows the roster entries shown");
eq(byHuman[0].entries[0].characterName, "Prya", "narrowed entry is the human's own");
eq(ids(D.filterCampaigns(camps, { character: "prya" })), "C1,C3", "character filter -> every campaign that character played");
eq(ids(D.filterCampaigns(camps, { date: "2026-10-17" })), "C2", "exact-date filter -> that day only");
eq(ids(D.filterCampaigns(camps, { from: "2026-10-01", to: "2026-10-31" })), "C1,C2", "date range -> campaigns inside it");
eq(ids(D.filterCampaigns(camps, { from: "2026-10-04", to: "2026-11-30" })), "C2,C3", "date range excludes the day before From");
eq(ids(D.filterCampaigns(camps, { human: "jacobs", character: "kael" })), "C2", "human + character filters combine");

// ---------- (d) draft email / mailto ----------
console.log("(d) Draft email assembly");
const draft = D.buildDraftEmail(camps[2]);
ok(draft.subject.includes("Module Q2 - The Long Count"), "subject names the campaign");
ok(draft.body.includes("- Ana Ruiz played Prya"), "body lists who played which character");
ok(draft.body.includes("What went down:"), "body has the recap skeleton (what went down)");
ok(draft.body.includes("The band held the bridge at dawn."), "body shapes the highlights in");
ok(draft.body.includes("The final boss battle:"), "body has the boss-battle section");
ok(draft.body.includes("The end scene:"), "body has the end-scene section");
const href = D.buildMailtoHref(camps[2]);
ok(href.startsWith("mailto:ana@example.com?subject="), "mailto href addresses the saved emails");
ok(href.includes(encodeURIComponent("game night recap")), "mailto subject is encoded into the href");
eq(D.parseEmailList("a@x.com, b@y.com\n c@z.com ; d@w.com").join(","), "a@x.com,b@y.com,c@z.com,d@w.com", "email list parsing (commas / newlines / semicolons)");

console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
