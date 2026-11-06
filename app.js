// ============================================================
// POWER CARD CHARACTER FORGE — app logic
// ------------------------------------------------------------
// Static front end for Vercel. Data lives in Firestore
// (collection "characters"), portraits in Firebase Storage,
// sign-in is Google only. Every read and write is scoped to
// the signed-in user's own uid — the matching rules are in
// firestore.rules / storage.rules, and they are what actually
// keeps friends out of each other's characters.
//
// If firebase-config.js still holds placeholders, this file
// shows the "setup not finished" notice and connects nothing.
// ============================================================

import { FIREBASE_CONFIG, ADMIN_EMAIL, configIsReady, adminEmailIsReady } from "./firebase-config.js";
import {
  ART, LOOK_SKINS, LOOK_HAIRS, LOOK_ATTIRE, LOOK_ART, HERO_ALT,
  FIGHTERS, WEAPONS, SPELLS, PACK_ITEMS, HEROES, HERO_KEYS,
  STAT_KEYS, STAT_NAMES, STAT_LONG, modifier,
  skinRampURL, skinRampURLFor, setRampReadyCallback,
  FORGE_CLASSES, CLASS_TABLES, classPool, defaultSliders, composeBrief,
  attireDescriptions, emptyAttires, normalizeAttires, attireSetStatus, parseReturnFilename,
  effectiveWeapons, parseTalesJson, validateTales, talesFileName,
  roll20ImportLine, prettyDate, filterCampaigns, buildSetupPrompt, buildMailtoHref, parseEmailList,
  groupPushesByCharacter, adventuresForCharacter, adventuresForCharacterDoc,
  CAMP_ACTION_KINDS, campActionKind, validateCampAction, effectiveCampAction
} from "./data.js";

const $ = (sel) => document.querySelector(sel);
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function fmtDate(ts) {
  try { return ts && ts.toDate ? ts.toDate().toLocaleDateString() : ""; } catch (e) { return ""; }
}

// ---------- Setup gate ----------
if (!configIsReady()) {
  $("#setupNotice").hidden = false;
  throw new Error("Firebase config placeholders not replaced — setup mode.");
}

// ---------- Firebase ----------
const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
const stMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

const fbApp = initializeApp(FIREBASE_CONFIG);
const auth = authMod.getAuth(fbApp);
const db = fsMod.getFirestore(fbApp);
const storage = stMod.getStorage(fbApp);
const charsCol = fsMod.collection(db, "characters");
const campsCol = fsMod.collection(db, "campaigns");
const pushesCol = fsMod.collection(db, "session_pushes");

// ---------- Session state ----------
let user = null;
let isAdmin = false;
let unsubs = [];

const heroState = {};   // per-hero visit-only sheet state
function heroSt(key) {
  if (!heroState[key]) {
    const defs = {};
    for (const k of STAT_KEYS) defs[k] = HEROES[key].sliders[k].def;
    heroState[key] = { skin: 0, hair: 0, attire: 0, sliders: defs, weapon: 0, spells: [0, 1] };
  }
  return heroState[key];
}
let packPicks = ["brief", "aid"]; // the band's shared pack: carry 2 of 5
let currentHero = "maya";

const myChars = new Map();  // id -> data
let selectedCharId = null;

const inbox = { requested: new Map(), submitted: new Map(), done: new Map(), complete: new Map() };
const selectedNew = new Set();
const portraitURLs = new Map(); // storage path -> download URL

// Campaigns (game-night ledger, admin only): pushed characters
// staging in the Band, and the saved campaign records.
const bandChars = new Map();  // character id -> data (campaignPushedAt set)
const bandEdits = new Map();  // character id -> { checked, humanName } (Mike's per-night edits, kept across re-renders)
const campaignsArr = [];      // { id, ...campaign data }, newest date first
const campFilters = { human: "", character: "", date: "", from: "", to: "" };
let playSelectedId = null;
let lastPlayText = "", lastPlayName = "";

// Session credits pushes addressed to the signed-in player
// (SESSION-CREDITS-PUSH-SPEC.md): the grouped view the
// character sheets render their Campaign adventures
// dropdowns from — characterName -> entries, newest first.
// Contract v2: the sheets look their history up by document
// ID first (adventuresForCharacterDoc), so the RAW push docs
// are kept alongside the name-grouped view.
let myPushesByChar = new Map();
let myPushesRaw = [];
let pushesError = "";

// ---------- Tabs ----------
function showTab(name) {
  for (const b of document.querySelectorAll(".tabs [data-tab]")) {
    b.setAttribute("aria-pressed", b.dataset.tab === name ? "true" : "false");
  }
  for (const v of document.querySelectorAll(".view")) v.hidden = true;
  $("#view-" + name).hidden = false;
}
document.querySelectorAll(".tabs [data-tab]").forEach((b) => {
  b.addEventListener("click", () => showTab(b.dataset.tab));
});

// ---------- The slider bank (the game's build-point pool rule) ----------
// Raising a score spends banked points first, then draws down
// the highest other score that is above its floor. Floors and
// class caps always bind. Lowering is always free and only
// banks points. The total never grows past the pool.
function makeSliderBank(host, table, values, onCommit) {
  const budget = STAT_KEYS.reduce((s, k) => s + table[k].def, 0);
  host.innerHTML =
    '<span class="stats-head">Ability scores — slide to tune</span>' +
    '<span class="pool-line"></span><span class="pool-note" role="status"></span>' +
    STAT_KEYS.map((k) =>
      '<div class="stat"><label for="' + host.id + "-" + k + '">' + STAT_NAMES[k] + '</label>' +
      '<input type="range" id="' + host.id + "-" + k + '" data-stat="' + k + '" min="' + table[k].floor + '" max="' + table[k].cap + '" value="' + values[k] + '" aria-label="' + STAT_LONG[k] + ' score, from ' + table[k].floor + ' to ' + table[k].cap + '" />' +
      '<output>' + values[k] + '</output><span class="mod"></span></div>'
    ).join("");
  const inputs = {}, outputs = {}, mods = {};
  host.querySelectorAll("input[data-stat]").forEach((inp) => {
    const k = inp.dataset.stat;
    inputs[k] = inp; outputs[k] = inp.parentElement.querySelector("output"); mods[k] = inp.parentElement.querySelector(".mod");
    inp.addEventListener("input", () => applyChange(k, parseInt(inp.value, 10)));
  });
  const poolLine = host.querySelector(".pool-line");
  const poolNote = host.querySelector(".pool-note");
  function total() { return STAT_KEYS.reduce((s, k) => s + values[k], 0); }
  function sync() {
    for (const k of STAT_KEYS) {
      inputs[k].value = values[k];
      outputs[k].textContent = values[k];
      const m = modifier(values[k]);
      mods[k].textContent = (m >= 0 ? "+" : "") + m;
    }
    poolLine.textContent = "Build points: " + total() + " / " + budget + " · Bank: " + (budget - total());
  }
  function applyChange(stat, target) {
    const t = table[stat];
    target = Math.max(t.floor, Math.min(t.cap, target));
    const cur = values[stat];
    if (target === cur) { sync(); return; }
    if (target < cur) { values[stat] = target; poolNote.textContent = ""; sync(); onCommit && onCommit(values); return; }
    let need = target - cur;
    const fromBank = Math.min(need, Math.max(0, budget - total()));
    let raised = cur + fromBank; need -= fromBank;
    const trades = {};
    while (need > 0) {
      let donor = null;
      for (const k of STAT_KEYS) {
        if (k === stat) continue;
        const head = values[k] - table[k].floor;
        if (head <= 0) continue;
        if (!donor || values[k] > values[donor] ||
            (values[k] === values[donor] && head > values[donor] - table[donor].floor)) donor = k;
      }
      if (!donor) break;
      const take = Math.min(need, values[donor] - table[donor].floor);
      values[donor] -= take; need -= take; raised += take;
      trades[donor] = (trades[donor] || 0) + take;
    }
    values[stat] = raised;
    const names = Object.keys(trades);
    poolNote.textContent = names.length
      ? "Auto-balanced: " + names.map((k) => STAT_NAMES[k] + " −" + trades[k]).join(", ") + " (build total unchanged)"
      : "";
    sync();
    onCommit && onCommit(values);
  }
  sync();
  return { sync };
}

// ---------- Look portrait compositing (the game's renderLookPortrait) ----------
function renderLook(key) {
  const st = heroSt(key);
  const frame = document.querySelector('[data-frame="' + key + '"]');
  if (!frame) return;
  const img = frame.querySelector("img.sketch");
  const artKey = (LOOK_ART[key] || [])[st.attire] || key;
  const art = ART[artKey];
  if (art && img.getAttribute("src") !== art) img.src = art;
  const att = LOOK_ATTIRE[key][st.attire];
  img.alt = st.attire === 0 ? HERO_ALT[key]
    : "Gray pencil sketch of " + FIGHTERS[key].name + " in the " + att.set + " outfit — " + att.top + ", " + att.bottom + " and " + att.shoes;
  const sig = artKey + "|" + st.skin + "|" + st.hair;
  if (frame.dataset.sig === sig) return;
  frame.dataset.sig = sig;
  frame.querySelectorAll(".look-layer").forEach((n) => n.remove());
  const ramp = skinRampURL(artKey, st.skin);
  if (ramp) {
    const rd = document.createElement("span");
    rd.className = "look-layer"; rd.setAttribute("aria-hidden", "true");
    rd.style.backgroundImage = 'url("' + ramp + '")';
    frame.appendChild(rd);
  } else {
    [["multiply", LOOK_SKINS[st.skin].tone, 1], ["color", LOOK_SKINS[st.skin].tone, .5]].forEach((L) => {
      const d = document.createElement("span");
      d.className = "look-layer"; d.setAttribute("aria-hidden", "true");
      d.style.backgroundColor = L[1]; d.style.mixBlendMode = L[0]; d.style.opacity = L[2];
      const mUrl = 'url("' + ART[artKey + "_skin"] + '")';
      d.style.webkitMaskImage = mUrl; d.style.maskImage = mUrl;
      frame.appendChild(d);
    });
  }
  LOOK_HAIRS[st.hair].layers.forEach((L) => {
    if (!ART[artKey + "_hair"]) return;
    const d = document.createElement("span");
    d.className = "look-layer"; d.setAttribute("aria-hidden", "true");
    d.style.backgroundColor = L[1]; d.style.mixBlendMode = L[0]; d.style.opacity = L[2];
    const maskUrl = 'url("' + ART[artKey + "_hair"] + '")';
    d.style.webkitMaskImage = maskUrl; d.style.maskImage = maskUrl;
    frame.appendChild(d);
  });
  const shoes = document.querySelector('[data-shoes="' + key + '"]');
  if (shoes) shoes.innerHTML = "Shoes: <b>" + esc(att.shoes) + "</b> — never chosen; they auto-fill from the " + esc(att.bottom) + ".";
}
setRampReadyCallback((artKey, skinIdx) => {
  for (const key of HERO_KEYS) {
    const st = heroSt(key);
    const curKey = (LOOK_ART[key] || [])[st.attire] || key;
    if (curKey === artKey && st.skin === skinIdx) {
      const frame = document.querySelector('[data-frame="' + key + '"]');
      if (frame) { delete frame.dataset.sig; renderLook(key); }
    }
  }
  // A forged character's ramp carries its "forge:" cache key.
  if (typeof artKey === "string" && artKey.startsWith("forge:") && forgeFrameCtx &&
      forgeFrameCtx.cacheKey === artKey && forgeFrameCtx.skin === skinIdx) {
    const frame = document.querySelector("[data-cframe]");
    if (frame) { delete frame.dataset.sig; renderForgeLook(); }
  }
});

// ---------- Pick-card groups (weapon / spells / pack / look) ----------
function pickCards(items, isOn, onPick, note) {
  return '<div class="pick-grid">' + items.map((it, i) =>
    '<button type="button" class="pick-card" data-pick="' + i + '" aria-pressed="' + (isOn(i) ? "true" : "false") + '">' +
    '<span class="gc-name">' + (it.sw ? '<span class="swatch" style="background:' + it.sw + '"></span>' : "") + esc(it.name || it.set) + '</span>' +
    '<span class="gc-fx">' + esc(it.fx || "") + '</span></button>').join("") + '</div>' +
    (note ? '<p class="pool-note" data-pick-note role="status">' + esc(note) + '</p>' : "");
}

// ---------- Hero sheets ----------
function renderHeroPicker() {
  $("#heroPicker").innerHTML = HERO_KEYS.map((k) =>
    '<button type="button" data-hero="' + k + '" aria-pressed="' + (k === currentHero ? "true" : "false") + '">' + FIGHTERS[k].name + '</button>'
  ).join("");
  $("#heroPicker").querySelectorAll("[data-hero]").forEach((b) => {
    b.addEventListener("click", () => { currentHero = b.dataset.hero; renderHeroPicker(); renderHeroSheet(currentHero); });
  });
}
function renderHeroSheet(key) {
  const host = $("#heroSheet");
  const st = heroSt(key);
  const H = HEROES[key], F = FIGHTERS[key];
  host.innerHTML =
    '<div class="sheet">' +
    '<span class="sheet-tag">Character sheet · ' + esc(H.className) + '</span>' +
    '<span class="look-frame" data-frame="' + key + '"><img class="sketch" alt="" /></span>' +
    '<div class="weapon-line">Weapon · ' + esc(F.wname) + ' (1d' + F.die + ')</div>' +
    '<h3>' + esc(F.name) + '</h3><span class="age">' + esc(H.age) + '</span>' +
    '<p>' + esc(H.intro) + '</p>' +
    '<p><i>' + esc(F.line) + '</i></p>' +
    '<div class="perk">' + esc(H.perk) + '</div>' +
    '<p class="death-line">Death Blow · ' + esc(H.deathBlow) + ' — ' + esc(H.deathBlowNote) + '</p>' +
    '<p class="death-line">Starting hit points · <b>100 HP</b> · Primary ability: ' + STAT_NAMES[F.primary] + '</p>' +
    '<div data-sliders></div>' +
    '<p class="derived" data-derived></p>' +
    '<p class="cap-note">' + esc(H.capNote) + '</p>' +
    '<span class="gear-sub">Weapon — pick 1 of 3</span><div data-weapons></div>' +
    '<span class="gear-sub">Spells — carry exactly 2 of 4</span><div data-spells></div>' +
    '<span class="gear-sub">The band\'s shared pack — carry exactly 2 of 5 (same pack on every sheet)</span><div data-pack></div>' +
    '<span class="gear-sub">Look — story only: it changes how ' + esc(F.name) + ' looks, never the math</span>' +
    '<span class="gear-sub">Skin</span><div data-skins></div>' +
    '<span class="gear-sub">Hair</span><div data-hairs></div>' +
    '<span class="gear-sub">Attire — one set, top and bottom together</span><div data-attires></div>' +
    '<p class="look-shoes" data-shoes="' + key + '"></p>' +
    '</div>';
  const derived = host.querySelector("[data-derived]");
  const drawDerived = () => {
    derived.textContent = "Modifiers from the sliders: " + STAT_KEYS.map((k) => STAT_NAMES[k] + " " + (modifier(st.sliders[k]) >= 0 ? "+" : "") + modifier(st.sliders[k])).join(" · ");
  };
  makeSliderBank(host.querySelector("[data-sliders]"), H.sliders, st.sliders, drawDerived);
  drawDerived();
  const drawPicks = () => {
    host.querySelector("[data-weapons]").innerHTML = pickCards(WEAPONS[key], (i) => i === st.weapon, () => "");
    host.querySelectorAll("[data-weapons] [data-pick]").forEach((b) => b.addEventListener("click", () => { st.weapon = +b.dataset.pick; drawPicks(); }));
    host.querySelector("[data-spells]").innerHTML = pickCards(SPELLS[key], (i) => st.spells.includes(i), () => "", spellNote);
    host.querySelectorAll("[data-spells] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.pick;
      if (st.spells.includes(i)) { if (st.spells.length > 1) st.spells = st.spells.filter((x) => x !== i); }
      else if (st.spells.length < 2) st.spells.push(i);
      else spellNote = "You carry exactly 2 — unpick one first, then pick this one.";
      drawPicks();
    }));
    host.querySelector("[data-pack]").innerHTML = pickCards(PACK_ITEMS, (i) => packPicks.includes(PACK_ITEMS[i].id), () => "", packNote);
    host.querySelectorAll("[data-pack] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      const id = PACK_ITEMS[+b.dataset.pick].id;
      if (packPicks.includes(id)) { if (packPicks.length > 1) packPicks = packPicks.filter((x) => x !== id); }
      else if (packPicks.length < 2) packPicks.push(id);
      else packNote = "The band carries exactly 2 — unpick one first, then pick this one.";
      drawPicks();
    }));
    host.querySelector("[data-skins]").innerHTML = pickCards(LOOK_SKINS, (i) => i === st.skin, () => "");
    host.querySelectorAll("[data-skins] [data-pick]").forEach((b) => b.addEventListener("click", () => { st.skin = +b.dataset.pick; drawPicks(); renderLook(key); }));
    host.querySelector("[data-hairs]").innerHTML = pickCards(LOOK_HAIRS, (i) => i === st.hair, () => "");
    host.querySelectorAll("[data-hairs] [data-pick]").forEach((b) => b.addEventListener("click", () => { st.hair = +b.dataset.pick; drawPicks(); renderLook(key); }));
    host.querySelector("[data-attires]").innerHTML = pickCards(
      LOOK_ATTIRE[key].map((a) => ({ name: a.set, fx: a.top + " + " + a.bottom + " — worn together. Shoes (" + a.shoes + ") auto-fill." })),
      (i) => i === st.attire, () => "");
    host.querySelectorAll("[data-attires] [data-pick]").forEach((b) => b.addEventListener("click", () => { st.attire = +b.dataset.pick; drawPicks(); renderLook(key); }));
  };
  let spellNote = "", packNote = "";
  drawPicks();
  renderLook(key);
}

// ---------- My characters ----------
function statusChip(c) {
  switch (c.sketchStatus) {
    case "requested": return '<span class="chip">With Mike — queued</span>';
    case "submitted": return '<span class="chip">Sketch being created</span>';
    case "done": return '<span class="chip done">Sketch done</span>';
    case "complete": return '<span class="chip done">Full set complete</span>';
    default: return '<span class="chip">No sketch yet</span>';
  }
}
function renderMyList() {
  const list = $("#myList");
  const arr = [...myChars.entries()].sort((a, b) => (a[1].createdAt?.seconds || 0) - (b[1].createdAt?.seconds || 0));
  $("#myEmpty").hidden = arr.length > 0;
  list.innerHTML = arr.map(([id, c]) =>
    '<button type="button" class="char-row" data-open="' + id + '"><span><b>' + esc(c.name) + '</b> · ' + esc(c.class) +
    (CLASS_TABLES[c.class] && CLASS_TABLES[c.class].forge ? ' <span class="chip">Forge class</span>' : "") +
    (c.campaignPushedAt ? ' <span class="chip">In Mike\'s Band</span>' : "") +
    '</span>' + statusChip(c) + '</button>').join("");
  list.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openChar(b.dataset.open)));
}
function openChar(id) {
  selectedCharId = id;
  $("#myListWrap").hidden = true;
  $("#charSheetWrap").hidden = false;
  renderCharSheet();
}
$("#backToMine").addEventListener("click", () => {
  selectedCharId = null;
  $("#charSheetWrap").hidden = true;
  $("#myListWrap").hidden = false;
  renderMyList();
});
async function portraitURL(path) {
  if (!path) return null;
  if (portraitURLs.has(path)) return portraitURLs.get(path);
  try {
    const url = await stMod.getDownloadURL(stMod.ref(storage, path));
    portraitURLs.set(path, url);
    return url;
  } catch (e) { return null; }
}
// ---------- Forged-character parity (completed sets) ----------
// A forged character whose full set has landed (3 attire
// portraits + 6 masks) renders through the same sheet systems
// as the heroes: attire picker, Look compositing with the
// game's ramp math, spell/pack picks, sliders. The view state
// (which skin / hair / attire is showing) is seeded from the
// doc's saved look, per character id, like heroState.
const charState = {};
function lookIdx(v, table, fallback) {
  if (typeof v === "number" && v >= 0 && v < table.length) return v;
  if (typeof v === "string") {
    const i = table.findIndex((t) => t.name.toLowerCase() === v.toLowerCase());
    if (i >= 0) return i;
  }
  return fallback;
}
function charSt(id, c) {
  if (!charState[id]) {
    const look = c.look || {};
    charState[id] = {
      skin: lookIdx(look.skin, LOOK_SKINS, 0),
      hair: lookIdx(look.hair, LOOK_HAIRS, 0),
      attire: Math.min(2, Math.max(0, look.attireIdx != null ? look.attireIdx : (look.outfitIdx || 0)))
    };
  }
  return charState[id];
}
function isCompleteChar(c) {
  return !!(c.portraitSetComplete && attireSetStatus(c.attires).complete);
}
// The forged Look frame currently on screen (null elsewhere).
// The ramp-ready callback matches on cacheKey + skin.
let forgeFrameCtx = null;
async function saveLook(id, st) {
  try {
    await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
      look: { skin: st.skin, hair: st.hair, attireIdx: st.attire },
      updatedAt: fsMod.serverTimestamp()
    });
  } catch (e) {
    const n = document.querySelector("[data-look-note]");
    if (n) n.textContent = "That Look change could not save: " + e.message;
  }
}
async function savePicks(id, c) {
  try {
    await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
      spellPicks: c.spellPicks || [], packPicks: c.packPicks || [],
      updatedAt: fsMod.serverTimestamp()
    });
  } catch (e) {
    const n = document.querySelector("[data-look-note]");
    if (n) n.textContent = "That pick could not save: " + e.message;
  }
}
// The hero Look compositor, run on a forged character's own
// art: identical ramp builder and blend layers — only the
// image sources differ (the character's Storage URLs instead
// of ART-registry paths).
async function renderForgeLook() {
  const ctx = forgeFrameCtx;
  if (!ctx) return;
  const frame = document.querySelector("[data-cframe]");
  if (!frame) return;
  const slot = normalizeAttires(ctx.c)[ctx.attire];
  if (!ctx.urls) {
    const urls = await Promise.all([
      portraitURL(slot.portraitPath), portraitURL(slot.skinMaskPath), portraitURL(slot.hairMaskPath)
    ]);
    if (forgeFrameCtx !== ctx) return; // sheet moved on while loading
    ctx.urls = { portrait: urls[0], skin: urls[1], hair: urls[2] };
  }
  const img = frame.querySelector("img.sketch");
  if (ctx.urls.portrait && img.getAttribute("src") !== ctx.urls.portrait) img.src = ctx.urls.portrait;
  img.alt = "Pencil sketch portrait of " + ctx.c.name + " in attire " + (ctx.attire + 1) + " of 3";
  const sig = ctx.cacheKey + "|" + ctx.skin + "|" + ctx.hair;
  if (frame.dataset.sig === sig) return;
  frame.dataset.sig = sig;
  frame.querySelectorAll(".look-layer").forEach((n) => n.remove());
  const ramp = ctx.urls.portrait && ctx.urls.skin
    ? skinRampURLFor(ctx.cacheKey, ctx.urls.portrait, ctx.urls.skin, ctx.skin) : null;
  if (ramp) {
    const rd = document.createElement("span");
    rd.className = "look-layer"; rd.setAttribute("aria-hidden", "true");
    rd.style.backgroundImage = 'url("' + ramp + '")';
    frame.appendChild(rd);
  } else if (ctx.urls.skin) {
    [["multiply", LOOK_SKINS[ctx.skin].tone, 1], ["color", LOOK_SKINS[ctx.skin].tone, .5]].forEach((L) => {
      const d = document.createElement("span");
      d.className = "look-layer"; d.setAttribute("aria-hidden", "true");
      d.style.backgroundColor = L[1]; d.style.mixBlendMode = L[0]; d.style.opacity = L[2];
      const mUrl = 'url("' + ctx.urls.skin + '")';
      d.style.webkitMaskImage = mUrl; d.style.maskImage = mUrl;
      frame.appendChild(d);
    });
  }
  if (ctx.urls.hair) {
    LOOK_HAIRS[ctx.hair].layers.forEach((L) => {
      const d = document.createElement("span");
      d.className = "look-layer"; d.setAttribute("aria-hidden", "true");
      d.style.backgroundColor = L[1]; d.style.mixBlendMode = L[0]; d.style.opacity = L[2];
      const maskUrl = 'url("' + ctx.urls.hair + '")';
      d.style.webkitMaskImage = maskUrl; d.style.maskImage = maskUrl;
      frame.appendChild(d);
    });
  }
}
// ---------- Campaigns of Friends (forged characters) ----------
// A forged character's three backstory tales live on the doc
// (tales: [{move, text} x3], written by the admin bulk attach
// from the returned <docId>--tales.json). The tiles are named
// for the character's three EFFECTIVE weapons; each opens its
// tale in ONE shared panel that slow-scrolls the text, and
// tapping the panel pauses / resumes — the game's behavior.
function docTales(c) {
  if (!c || !Array.isArray(c.tales)) return null;
  const v = validateTales({ tales: c.tales });
  return v.ok ? v.tales : null;
}
function taleTextFor(tales, weapons, i) {
  const want = (weapons[i].name || "").toLowerCase();
  const hit = tales.find((t) => t.move.toLowerCase() === want);
  if (hit) return hit.text;
  return tales[i] ? tales[i].text : "";
}
function campaignsHTML(c) {
  const tales = docTales(c);
  if (tales) {
    const weapons = effectiveWeapons(c);
    return '<span class="gear-sub">Campaigns of Friends — backstory tales</span>' +
      '<div class="pick-grid">' + weapons.map((w, i) =>
        '<button type="button" class="pick-card" data-tale="' + i + '" aria-pressed="false">' +
        '<span class="gc-name">' + esc(w.name) + '</span>' +
        '<span class="gc-fx">A tale of the band, won with this weapon — tap to read</span></button>').join("") + '</div>' +
      '<div class="tale-panel" data-tale-panel hidden>' +
      '<span class="tale-title" data-tale-title></span>' +
      '<div class="tale-view" data-tale-view><div class="tale-text" data-tale-text></div></div>' +
      '<span class="tale-state" data-tale-state></span></div>';
  }
  if (isCompleteChar(c)) {
    return '<span class="gear-sub">Campaigns of Friends</span>' +
      '<p class="status-line">Your Campaigns tales arrive with your sketch set.</p>';
  }
  return "";
}
let taleScroll = null;
function stopTaleScroll() {
  if (taleScroll) { cancelAnimationFrame(taleScroll.raf); taleScroll = null; }
}
function startTaleScroll(view, textEl, stateEl) {
  stopTaleScroll();
  const max = Math.max(0, textEl.scrollHeight - view.clientHeight);
  textEl.style.transform = "translateY(0px)";
  if (max <= 0) { stateEl.textContent = "The whole tale fits on the panel — tap another weapon to read its tale."; return; }
  const st = { raf: 0, pos: 0, paused: false, last: null, holdUntil: 0 };
  taleScroll = st;
  const step = (ts) => {
    if (taleScroll !== st) return;
    if (st.last == null) st.last = ts;
    const dt = Math.min(100, ts - st.last); st.last = ts;
    if (!st.paused) {
      if (st.holdUntil && ts < st.holdUntil) {
        // holding at the end of the tale before it rolls again
      } else {
        if (st.holdUntil) { st.holdUntil = 0; st.pos = 0; }
        st.pos += (dt * 14) / 1000; // ~14px a second — a slow read
        if (st.pos >= max) { st.pos = max; st.holdUntil = ts + 3000; }
        textEl.style.transform = "translateY(" + (-st.pos) + "px)";
      }
    }
    st.raf = requestAnimationFrame(step);
  };
  st.raf = requestAnimationFrame(step);
}
function wireCampaigns(host, c) {
  const panel = host.querySelector("[data-tale-panel]");
  if (!panel) return;
  const view = panel.querySelector("[data-tale-view]");
  const textEl = panel.querySelector("[data-tale-text]");
  const titleEl = panel.querySelector("[data-tale-title]");
  const stateEl = panel.querySelector("[data-tale-state]");
  const tales = docTales(c);
  const weapons = effectiveWeapons(c);
  host.querySelectorAll("[data-tale]").forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.tale;
    host.querySelectorAll("[data-tale]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    titleEl.textContent = weapons[i].name;
    textEl.textContent = taleTextFor(tales, weapons, i);
    stateEl.textContent = "Tap the story to pause the scroll.";
    panel.hidden = false;
    requestAnimationFrame(() => startTaleScroll(view, textEl, stateEl));
  }));
  panel.addEventListener("click", () => {
    if (!taleScroll) return;
    taleScroll.paused = !taleScroll.paused;
    stateEl.textContent = taleScroll.paused
      ? "Paused — tap the story to resume the scroll."
      : "Tap the story to pause the scroll.";
  });
}
// ---------- Game night push + Roll20 export (character sheets) ----------
// The campaign push is an owner action like the sketch send:
// it stamps campaignPushedAt on the doc, which stages the
// sheet in Mike's admin Band list — already connected to its
// human, because the doc knows its owner. Pushing never
// touches the sketch queue or any sketch status; withdrawing
// is the owner's own action too.
function gameNightHTML(c) {
  if (c.campaignPushedAt) {
    return '<span class="gear-sub">Game night — Mike\'s Roll20 band</span>' +
      '<p class="status-line">Pushed to Mike for game night' + (fmtDate(c.campaignPushedAt) ? ' · ' + esc(fmtDate(c.campaignPushedAt)) : '') + '</p>' +
      '<p>This sheet is staged in Mike\'s Band list, connected to your name. When he saves the night as a campaign, this character is on its roster. Changed your mind? Withdraw it — that only leaves the Band; your sketch and everything else stay as they are.</p>' +
      '<div class="row"><button type="button" data-withdraw-night>Withdraw from game night</button></div>';
  }
  return '<span class="gear-sub">Game night — Mike\'s Roll20 band</span>' +
    '<p>Playing this character in one of Mike\'s Roll20 game nights? Push the sheet to Mike — it lands in his Band list, already connected to your name, ready for him to save into the night\'s campaign. Pushing is separate from the sketch queue: it changes nothing about your sketch.</p>' +
    '<div class="row"><button type="button" class="primary" data-push-night>Push to Mike for game night</button></div>';
}
function wireGameNight(host, id) {
  const pushBtn = host.querySelector("[data-push-night]");
  if (pushBtn) pushBtn.addEventListener("click", async () => {
    pushBtn.disabled = true; pushBtn.textContent = "Pushing…";
    try {
      await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
        campaignPushedAt: fsMod.serverTimestamp(),
        ownerDisplayName: user.displayName || "",
        ownerEmail: user.email || "",
        updatedAt: fsMod.serverTimestamp()
      });
    } catch (e) { alert("Could not push: " + e.message); pushBtn.disabled = false; pushBtn.textContent = "Push to Mike for game night"; }
  });
  const wdBtn = host.querySelector("[data-withdraw-night]");
  if (wdBtn) wdBtn.addEventListener("click", async () => {
    wdBtn.disabled = true; wdBtn.textContent = "Withdrawing…";
    try {
      await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
        campaignPushedAt: null,
        updatedAt: fsMod.serverTimestamp()
      });
    } catch (e) { alert("Could not withdraw: " + e.message); wdBtn.disabled = false; wdBtn.textContent = "Withdraw from game night"; }
  });
}
// Copy for Roll20: the one-line !forge import blob (see
// roll20/EXPORT-FORMAT.md). The line is built fresh from the
// doc at render, so it always carries the current sliders
// and picks; derived modifiers stay home — the importer
// recomputes them with the game's own formula.
function roll20HTML() {
  return '<span class="gear-sub">Roll20 — take this sheet to the table</span>' +
    '<p>Playing this character in a Roll20 game that has the Forge importer installed? Copy the import line, paste it into the Roll20 chat, and the sheet appears there — sliders, weapons, spells, pack and all. The sketch portrait is attached by hand in Roll20 (Edit → Avatar); scripts cannot upload images.</p>' +
    '<div class="row"><button type="button" data-copy-roll20>Copy for Roll20</button></div>' +
    '<details><summary>See the import line</summary><pre class="brief" data-roll20-line></pre></details>';
}
function wireRoll20(host, id, c) {
  const line = roll20ImportLine(c, id);
  const pre = host.querySelector("[data-roll20-line]");
  if (pre) pre.textContent = line;
  const btn = host.querySelector("[data-copy-roll20]");
  if (btn) btn.addEventListener("click", () => copyText(line, btn));
}
// ---------- Session credits (Campaign adventures) ----------
// After a tabletop run, the DM Guide pushes one session
// credits doc per player (session_pushes, addressed to the
// player's sign-in email — the listener in startListeners
// keeps the raw docs). They render HERE, on the character's
// own sheet, as a dropdown that doubles as the character's
// adventure history: newest first, each entry opening that
// session's closing credits roll in a new tab. Plain links
// in a <details> — no wiring needed. Lookup is ID-aware
// (contract v2): a push carrying this sheet's document ID
// lands here even when the character played that night
// under a different name (the entry then shows its
// "Played as" line); pushes without an ID are legacy and
// file by the character's true name.
function adventuresHTML(id, c) {
  const entries = adventuresForCharacterDoc(myPushesRaw, { id: id, name: c.name });
  const label = "Campaign adventures" + (entries.length ? " (" + entries.length + ")" : "");
  let inner;
  if (pushesError) {
    inner = '<p class="status-line">Campaign adventures could not load: ' + esc(pushesError) + '</p>';
  } else if (entries.length) {
    inner = '<ul class="adv-list">' + entries.map((e) =>
      '<li><a class="adv-entry" href="' + esc(e.creditsUrl) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="adv-label">' + esc(e.sessionLabel) + '</span>' +
      '<span class="adv-meta">' + esc(prettyDate(e.sessionDate)) + ' · DM: ' + esc(e.dmName) + ' — tap to replay the closing credits</span>' +
      (e.playedAs && e.playedAs !== e.characterName ? '<span class="adv-played">Played as "' + esc(e.playedAs) + '" that night.</span>' : '') +
      '</a></li>').join("") + '</ul>';
  } else {
    inner = '<p class="status-line">No adventures yet — after a tabletop run, your DM can push the closing credits here.</p>';
  }
  return '<details class="adventures"><summary>' + esc(label) + '</summary>' + inner + '</details>';
}
// The character's camp action on their sheet (CAMP-ACTION-SPEC.md):
// their own name + line when they forged one — solidified at
// forging, shown locked — or their class pattern's gift, labeled
// as the pattern, for characters forged before camp actions.
function campActionLine(c) {
  const ca = effectiveCampAction(c);
  const def = campActionKind(ca.kind);
  if (ca.forged) {
    return '<p class="death-line">Camp action · ' + esc(ca.name) + ' — ' + esc(ca.text) + '</p>' +
      '<p class="cap-note">Kind: ' + esc(def ? def.pattern : ca.kind) + ' — ' + esc(def ? def.does : '') + ' Set in stone when this character was forged.</p>';
  }
  return '<p class="death-line">Camp action · ' + esc(ca.name) + ' (class pattern)</p>' +
    '<p class="cap-note">' + esc(def ? def.does : '') + ' Characters forged now choose and name their own camp action.</p>';
}
function renderCharSheet() {
  const id = selectedCharId;
  const c = myChars.get(id);
  const host = $("#charSheet");
  forgeFrameCtx = null;
  stopTaleScroll();
  if (!c) { host.innerHTML = '<p class="note">That character is gone.</p>'; return; }
  if (isCompleteChar(c)) { renderCompleteSheet(host, id, c); return; }
  const table = CLASS_TABLES[c.class] || CLASS_TABLES.Fighter;
  const isForge = table.forge;
  let sketchBlock = "";
  if (c.sketchStatus === "done" && c.portraitPath) {
    sketchBlock = '<span class="look-frame"><img class="sketch portrait" data-portrait alt="Pencil sketch portrait of ' + esc(c.name) + '" /></span>' +
      '<p class="status-line">Your sketch is done' + (c.sketchCompletedAt ? ' · delivered ' + esc(fmtDate(c.sketchCompletedAt)) : '') + '.</p>';
  } else if (c.sketchStatus === "requested") {
    sketchBlock = '<p class="status-line">With Mike — queued</p>' +
      '<p>Your character is in Mike\'s queue. When he sends it on and the sketch comes back, he pushes it right back to this sheet.</p>' +
      briefDetails(c.sketchBrief);
  } else if (c.sketchStatus === "submitted") {
    sketchBlock = '<p class="status-line">Kendo is creating your sketch</p>' +
      '<p>Mike has sent your brief on. When the portrait is finished it will appear right here on your sheet.</p>' +
      briefDetails(c.sketchBrief);
  } else {
    sketchBlock = '<p class="status-line">No sketch yet</p>' +
      '<p>Want a pencil-sketch portrait of ' + esc(c.name) + ', drawn in the same hand as the band\'s portraits? Send this character to Mike.</p>' +
      '<button type="button" class="primary" data-send-mike>Send to Mike to create</button>' +
      '<p class="hint">Mike creates the sketch and pushes it back to you right here in your character sheet.</p>';
  }
  host.innerHTML =
    '<div class="sheet">' +
    '<span class="sheet-tag">Character sheet · ' + esc(c.class) + (isForge ? ' · Forge class' : '') + (c.race ? ' · ' + esc(c.race) : '') + '</span>' +
    '<div data-portrait-slot>' + sketchBlock + '</div>' +
    '<div class="weapon-line">Weapons · ' + effectiveWeapons(c).map((w) => esc(w.name) + ' (1d' + w.die + ')').join(' · ') + '</div>' +
    '<h3>' + esc(c.name) + '</h3>' +
    (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
    (c.perk ? '<div class="perk">' + esc(c.perk) + '</div>' : '') +
    (c.deathBlow ? '<p class="death-line">Death Blow · ' + esc(c.deathBlow) + '</p>' : '') +
    campActionLine(c) +
    '<div data-sliders></div>' +
    '<p class="derived" data-derived></p>' +
    '<p class="cap-note">' + esc(c.class) + ' caps and a ' + classPool(c.class) + '-point build pool — raising one score spends banked points, then draws down your highest other score. The total never grows.</p>' +
    '<div class="row"><button type="button" data-save disabled>Save my slider changes</button>' +
    '<span class="hint" data-save-note></span></div>' +
    '<div data-campaigns></div>' +
    '<div data-gamenight></div>' +
    '<div data-roll20></div>' +
    '<div data-adventures></div>' +
    '<span class="gear-sub">Sketch portrait</span>' +
    '<div data-sketch></div>' +
    '<div class="row"><button type="button" class="danger" data-delete>Delete this character</button></div>' +
    '</div>';
  // Move the sketch status block into its labeled section, keep portrait slot at top for done portraits.
  const slot = host.querySelector("[data-portrait-slot]");
  const sketchHost = host.querySelector("[data-sketch]");
  if (c.sketchStatus === "done" && c.portraitPath) {
    sketchHost.innerHTML = '<p class="hint">Your finished portrait is at the top of this sheet. It is an interim portrait — the full set (all three attires, each with its skin and hair masks) is what unlocks the Look.</p>' +
      '<button type="button" class="primary" data-fullset>Ask Mike for the full set</button>' +
      '<p class="hint">Mike sends the brief to Kendo with the rest of the queue; when the nine files land, this sheet gains every customization the band\'s sheets have.</p>' +
      '<p class="status-line">Full customization arrives when your complete set lands</p>';
    portraitURL(c.portraitPath).then((url) => {
      const img = slot.querySelector("[data-portrait]");
      if (img && url) img.src = url;
    });
    const fsBtn = sketchHost.querySelector("[data-fullset]");
    fsBtn.addEventListener("click", async () => {
      fsBtn.disabled = true; fsBtn.textContent = "Sending…";
      try {
        await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
          sketchBrief: composeBrief(c),
          sketchStatus: "requested",
          sketchSubmittedAt: fsMod.serverTimestamp(),
          ownerDisplayName: user.displayName || "",
          ownerEmail: user.email || "",
          updatedAt: fsMod.serverTimestamp()
        });
      } catch (e) { alert("Could not send: " + e.message); fsBtn.disabled = false; fsBtn.textContent = "Ask Mike for the full set"; }
    });
  } else {
    sketchHost.appendChild(slot); // status + action live under the Sketch heading
    sketchHost.insertAdjacentHTML("beforeend", '<p class="status-line">Full customization arrives when your complete set lands</p>');
  }
  const derived = host.querySelector("[data-derived]");
  const saveBtn = host.querySelector("[data-save]");
  const saveNote = host.querySelector("[data-save-note]");
  const drawDerived = () => {
    derived.textContent = "Modifiers from the sliders: " + STAT_KEYS.map((k) => STAT_NAMES[k] + " " + (modifier(c.sliders[k]) >= 0 ? "+" : "") + modifier(c.sliders[k])).join(" · ");
  };
  makeSliderBank(host.querySelector("[data-sliders]"), table.sliders, c.sliders, () => { drawDerived(); saveBtn.disabled = false; saveNote.textContent = "Unsaved changes"; });
  drawDerived();
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true; saveNote.textContent = "Saving…";
    try {
      await fsMod.updateDoc(fsMod.doc(db, "characters", id), { sliders: c.sliders, updatedAt: fsMod.serverTimestamp() });
      saveNote.textContent = "Saved.";
    } catch (e) { saveNote.textContent = "Save failed: " + e.message; saveBtn.disabled = false; }
  });
  const sendBtn = host.querySelector("[data-send-mike]");
  if (sendBtn) sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true; sendBtn.textContent = "Sending…";
    try {
      await fsMod.updateDoc(fsMod.doc(db, "characters", id), {
        sketchBrief: composeBrief(c),
        sketchStatus: "requested",
        sketchSubmittedAt: fsMod.serverTimestamp(),
        ownerDisplayName: user.displayName || "",
        ownerEmail: user.email || "",
        updatedAt: fsMod.serverTimestamp()
      });
    } catch (e) { alert("Could not send: " + e.message); sendBtn.disabled = false; sendBtn.textContent = "Send to Mike to create"; }
  });
  const campHost = host.querySelector("[data-campaigns]");
  if (campHost) { campHost.innerHTML = campaignsHTML(c); wireCampaigns(host, c); }
  const gnHost = host.querySelector("[data-gamenight]");
  if (gnHost) { gnHost.innerHTML = gameNightHTML(c); wireGameNight(host, id); }
  const r20Host = host.querySelector("[data-roll20]");
  if (r20Host) { r20Host.innerHTML = roll20HTML(); wireRoll20(host, id, c); }
  const advHost = host.querySelector("[data-adventures]");
  if (advHost) { advHost.innerHTML = adventuresHTML(id, c); }
  const delBtn = host.querySelector("[data-delete]");
  delBtn.addEventListener("click", async () => {
    if (!confirm("Delete " + c.name + " for good? This cannot be undone.")) return;
    try {
      await fsMod.deleteDoc(fsMod.doc(db, "characters", id));
      $("#backToMine").click();
    } catch (e) { alert("Delete failed: " + e.message); }
  });
}
// The completed forged character's sheet — the hero systems,
// on the character's own art and data: slider bank + pool
// rule, spell picks (classes with a shipped list), the shared
// pack, and the Look (3 attires, skins, hairs) compositing
// through renderForgeLook.
function renderCompleteSheet(host, id, c) {
  const table = CLASS_TABLES[c.class] || CLASS_TABLES.Fighter;
  const isForge = table.forge;
  const st = charSt(id, c);
  const heroKey = table.hero;
  const descs = attireDescriptions(c) || ["", "", ""];
  if (!Array.isArray(c.spellPicks)) c.spellPicks = [];
  if (!Array.isArray(c.packPicks)) c.packPicks = [];
  host.innerHTML =
    '<div class="sheet">' +
    '<span class="sheet-tag">Character sheet · ' + esc(c.class) + (isForge ? ' · Forge class' : '') + (c.race ? ' · ' + esc(c.race) : '') + '</span>' +
    '<span class="look-frame" data-cframe><img class="sketch" alt="" /></span>' +
    '<div class="weapon-line">Weapons · ' + effectiveWeapons(c).map((w) => esc(w.name) + ' (1d' + w.die + ')').join(' · ') + '</div>' +
    '<h3>' + esc(c.name) + '</h3>' +
    (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
    (c.perk ? '<div class="perk">' + esc(c.perk) + '</div>' : '') +
    (c.deathBlow ? '<p class="death-line">Death Blow · ' + esc(c.deathBlow) + '</p>' : '') +
    campActionLine(c) +
    '<p class="status-line">Sketch complete — your full set is in' + (c.sketchCompletedAt ? ' · delivered ' + esc(fmtDate(c.sketchCompletedAt)) : '') + '.</p>' +
    '<p>Three attires, every skin tone and hair color — this sheet works exactly like the band\'s sheets.</p>' +
    '<div data-sliders></div>' +
    '<p class="derived" data-derived></p>' +
    '<p class="cap-note">' + esc(c.class) + ' caps and a ' + classPool(c.class) + '-point build pool — raising one score spends banked points, then draws down your highest other score. The total never grows.</p>' +
    '<div class="row"><button type="button" data-save disabled>Save my slider changes</button>' +
    '<span class="hint" data-save-note></span></div>' +
    (heroKey
      ? '<span class="gear-sub">Spells — carry exactly 2 of 4 (the ' + esc(c.class) + ' list)</span><div data-spells></div>'
      : '<p class="cap-note">Spell lists ship with the six Power Card classes — a ' + esc(c.class) + ' fights by weapon, sliders and the shared pack below.</p>') +
    '<span class="gear-sub">The band\'s shared pack — carry exactly 2 of 5</span><div data-pack></div>' +
    '<div data-campaigns></div>' +
    '<div data-gamenight></div>' +
    '<div data-roll20></div>' +
    '<div data-adventures></div>' +
    '<span class="gear-sub">Look — story only: it changes how ' + esc(c.name) + ' looks, never the math</span>' +
    '<span class="gear-sub">Skin</span><div data-skins></div>' +
    '<span class="gear-sub">Hair</span><div data-hairs></div>' +
    '<span class="gear-sub">Attire — three sets, one portrait each</span><div data-attires></div>' +
    '<p class="hint" data-look-note></p>' +
    '<div class="row"><button type="button" class="danger" data-delete>Delete this character</button></div>' +
    '</div>';
  forgeFrameCtx = {
    charId: id, c: c, attire: st.attire, skin: st.skin, hair: st.hair,
    cacheKey: "forge:" + id + ":" + st.attire, urls: null
  };
  const derived = host.querySelector("[data-derived]");
  const saveBtn = host.querySelector("[data-save]");
  const saveNote = host.querySelector("[data-save-note]");
  const drawDerived = () => {
    derived.textContent = "Modifiers from the sliders: " + STAT_KEYS.map((k) => STAT_NAMES[k] + " " + (modifier(c.sliders[k]) >= 0 ? "+" : "") + modifier(c.sliders[k])).join(" · ");
  };
  makeSliderBank(host.querySelector("[data-sliders]"), table.sliders, c.sliders, () => { drawDerived(); saveBtn.disabled = false; saveNote.textContent = "Unsaved changes"; });
  drawDerived();
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true; saveNote.textContent = "Saving…";
    try {
      await fsMod.updateDoc(fsMod.doc(db, "characters", id), { sliders: c.sliders, updatedAt: fsMod.serverTimestamp() });
      saveNote.textContent = "Saved.";
    } catch (e) { saveNote.textContent = "Save failed: " + e.message; saveBtn.disabled = false; }
  });
  let spellNote = "", packNote = "";
  const drawPicks = () => {
    if (heroKey) {
      host.querySelector("[data-spells]").innerHTML = pickCards(SPELLS[heroKey], (i) => c.spellPicks.includes(i), () => "", spellNote);
      host.querySelectorAll("[data-spells] [data-pick]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.pick;
        if (c.spellPicks.includes(i)) { c.spellPicks = c.spellPicks.filter((x) => x !== i); spellNote = ""; }
        else if (c.spellPicks.length < 2) { c.spellPicks.push(i); spellNote = ""; }
        else spellNote = "You carry exactly 2 — unpick one first, then pick this one.";
        drawPicks(); savePicks(id, c);
      }));
    }
    host.querySelector("[data-pack]").innerHTML = pickCards(PACK_ITEMS, (i) => c.packPicks.includes(PACK_ITEMS[i].id), () => "", packNote);
    host.querySelectorAll("[data-pack] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      const pid = PACK_ITEMS[+b.dataset.pick].id;
      if (c.packPicks.includes(pid)) { c.packPicks = c.packPicks.filter((x) => x !== pid); packNote = ""; }
      else if (c.packPicks.length < 2) { c.packPicks.push(pid); packNote = ""; }
      else packNote = "The band carries exactly 2 — unpick one first, then pick this one.";
      drawPicks(); savePicks(id, c);
    }));
    host.querySelector("[data-skins]").innerHTML = pickCards(LOOK_SKINS, (i) => i === st.skin, () => "");
    host.querySelectorAll("[data-skins] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      st.skin = +b.dataset.pick;
      forgeFrameCtx.skin = st.skin;
      drawPicks(); renderForgeLook(); saveLook(id, st);
    }));
    host.querySelector("[data-hairs]").innerHTML = pickCards(LOOK_HAIRS, (i) => i === st.hair, () => "");
    host.querySelectorAll("[data-hairs] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      st.hair = +b.dataset.pick;
      forgeFrameCtx.hair = st.hair;
      drawPicks(); renderForgeLook(); saveLook(id, st);
    }));
    host.querySelector("[data-attires]").innerHTML = pickCards(
      [0, 1, 2].map((n) => ({ name: "Attire " + (n + 1), fx: descs[n] || "Creator's choice, in character" })),
      (i) => i === st.attire, () => "");
    host.querySelectorAll("[data-attires] [data-pick]").forEach((b) => b.addEventListener("click", () => {
      st.attire = +b.dataset.pick;
      forgeFrameCtx.attire = st.attire;
      forgeFrameCtx.cacheKey = "forge:" + id + ":" + st.attire;
      forgeFrameCtx.urls = null;
      drawPicks(); renderForgeLook(); saveLook(id, st);
    }));
  };
  drawPicks();
  renderForgeLook();
  const campHost = host.querySelector("[data-campaigns]");
  if (campHost) { campHost.innerHTML = campaignsHTML(c); wireCampaigns(host, c); }
  const gnHost = host.querySelector("[data-gamenight]");
  if (gnHost) { gnHost.innerHTML = gameNightHTML(c); wireGameNight(host, id); }
  const r20Host = host.querySelector("[data-roll20]");
  if (r20Host) { r20Host.innerHTML = roll20HTML(); wireRoll20(host, id, c); }
  const advHost = host.querySelector("[data-adventures]");
  if (advHost) { advHost.innerHTML = adventuresHTML(id, c); }
  const delBtn = host.querySelector("[data-delete]");
  delBtn.addEventListener("click", async () => {
    if (!confirm("Delete " + c.name + " for good? This cannot be undone.")) return;
    try {
      await fsMod.deleteDoc(fsMod.doc(db, "characters", id));
      $("#backToMine").click();
    } catch (e) { alert("Delete failed: " + e.message); }
  });
}
function briefDetails(brief) {
  if (!brief) return "";
  return '<details><summary>See the sketch brief</summary><pre class="brief">' + esc(brief) + '</pre>' +
    '<button type="button" data-copy-brief>Copy brief</button></details>';
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy-brief]");
  if (!b) return;
  const pre = b.parentElement.querySelector("pre.brief");
  if (pre) copyText(pre.textContent, b);
});
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = "Copied ✓"; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); if (btn) btn.textContent = "Copied ✓"; } catch (e2) {}
    ta.remove();
  }
}

// ---------- Forge form ----------
const classSel = $("#f-class");
classSel.innerHTML = FORGE_CLASSES.map((c) => '<option value="' + c + '">' + c + '</option>').join("");
function classHint() {
  const c = classSel.value;
  const t = CLASS_TABLES[c];
  $("#classHint").textContent = c + " build pool: " + classPool(c) + " points" + (t.forge ? " · Forge class (no shipped hero — caps follow the game's pattern)" : " · the shipped " + FIGHTERS[t.hero].name + " class table");
}
classSel.addEventListener("change", classHint);
classHint();
// Camp action: kind picked by what it does (CAMP-ACTION-SPEC.md).
// The options name the band's pattern gifts so the player can see
// whose gift each kind is; the player's own name + line are what
// the character actually carries.
const campKindSel = $("#f-camp-kind");
campKindSel.innerHTML = CAMP_ACTION_KINDS.map((k) => '<option value="' + k.kind + '">' + esc(k.pattern) + " — " + esc(k.hero) + "'s kind</option>").join("");
function campKindHint() {
  const def = campActionKind(campKindSel.value);
  $("#campKindHint").textContent = def ? "What it does: " + def.does : "";
}
campKindSel.addEventListener("change", campKindHint);
campKindHint();
$("#forgeForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#forgeError"); err.textContent = "";
  const name = $("#f-name").value.trim();
  const weapon = $("#f-weapon").value.trim();
  const attire1 = $("#f-attire1").value.trim();
  if (!name || !weapon || !attire1) { err.textContent = "A name, a weapon name and Attire 1 (the main outfit) are needed — Attire 2 and 3 can be blank."; return; }
  const campV = validateCampAction({ kind: campKindSel.value, name: $("#f-camp-name").value, text: $("#f-camp-text").value });
  if (!campV.ok) { err.textContent = "Your character needs their own camp action — " + campV.error + ". It travels with them into every run."; return; }
  const cls = classSel.value;
  const weapon2 = $("#f-weapon2").value.trim();
  const weapon3 = $("#f-weapon3").value.trim();
  const data = {
    ownerUid: user.uid,
    ownerDisplayName: user.displayName || "",
    ownerEmail: user.email || "",
    name: name,
    class: cls,
    race: $("#f-race").value.trim(),
    weaponName: weapon,
    weaponDie: parseInt($("#f-die").value, 10),
    // Three weapon slots, like the heroes. weapons[0] mirrors
    // weaponName/weaponDie above; blank slots stay blank on
    // the doc and are filled from the class list at render.
    weapons: [
      { name: weapon, die: parseInt($("#f-die").value, 10) },
      { name: weapon2, die: weapon2 ? parseInt($("#f-die2").value, 10) : null },
      { name: weapon3, die: weapon3 ? parseInt($("#f-die3").value, 10) : null }
    ],
    tales: null,
    pose: $("#f-pose").value.trim(),
    holding: $("#f-holding").value.trim(),
    outfit: attire1,
    attiresDesc: [attire1, $("#f-attire2").value.trim(), $("#f-attire3").value.trim()],
    description: $("#f-desc").value.trim(),
    perk: $("#f-perk").value.trim(),
    deathBlow: $("#f-death").value.trim(),
    campAction: campV.campAction,
    sliders: defaultSliders(cls),
    weaponPick: weapon,
    spellPicks: [],
    packPicks: [],
    look: { skin: 0, hair: 0, outfitIdx: 0, attireIdx: 0 },
    attires: emptyAttires(),
    portraitSetComplete: false,
    sketchBrief: "",
    sketchStatus: "none",
    campaignPushedAt: null,
    sketchSubmittedAt: null,
    sketchSubmittedToKendoAt: null,
    sketchCompletedAt: null,
    portraitPath: null,
    createdAt: fsMod.serverTimestamp(),
    updatedAt: fsMod.serverTimestamp()
  };
  try {
    const ref = await fsMod.addDoc(charsCol, data);
    myChars.set(ref.id, data); // open instantly; the snapshot listener confirms it
    ev.target.reset(); classSel.value = cls; classHint(); campKindHint();
    showTab("mine");
    openChar(ref.id);
  } catch (e) { err.textContent = "Could not save: " + e.message; }
});

// ---------- Mike's inbox ----------
function inboxRow(id, c, withCheckbox) {
  const who = (c.ownerDisplayName || "A friend") + (c.ownerEmail ? " · " + c.ownerEmail : "");
  return '<div class="req-card" data-req="' + id + '">' +
    '<div class="req-head">' +
    (withCheckbox ? '<input type="checkbox" data-check="' + id + '" aria-label="Select this request for the Kendo batch" ' + (selectedNew.has(id) ? "checked" : "") + ' />' : "") +
    '<div><b>' + esc(c.name) + '</b> · ' + esc(c.class) +
    '<div class="req-meta">From ' + esc(who) + '</div>' +
    '<div class="docid">Doc ID: ' + id + '</div></div></div>' +
    briefDetails(c.sketchBrief) +
    (c.sketchStatus === "complete"
      ? '<p class="hint">Full set delivered. To replace set files, pick them again in the bulk attach above.</p>'
      : '<div class="row"><label class="filebtn">' + (c.sketchStatus === "done" ? "Replace interim portrait" : "Attach finished portrait") +
        '<input type="file" accept="image/*,.webp" data-attach="' + id + '" /></label>' +
        '<span class="hint" data-attach-note></span></div>') +
    ((c.sketchStatus === "done" || c.sketchStatus === "complete") ? '<div data-thumb></div>' : "") +
    '</div>';
}
function renderInboxSection(map, hostSel, withCheckbox) {
  const host = $(hostSel);
  const arr = [...map.entries()].sort((a, b) => (a[1].sketchSubmittedAt?.seconds || a[1].createdAt?.seconds || 0) - (b[1].sketchSubmittedAt?.seconds || b[1].createdAt?.seconds || 0));
  host.innerHTML = arr.length ? arr.map(([id, c]) => inboxRow(id, c, withCheckbox)).join("") : '<p class="note">Nothing here right now.</p>';
  host.querySelectorAll("[data-check]").forEach((cb) => cb.addEventListener("change", () => {
    if (cb.checked) selectedNew.add(cb.dataset.check); else selectedNew.delete(cb.dataset.check);
    syncBatchBar();
  }));
  host.querySelectorAll("[data-attach]").forEach((inp) => inp.addEventListener("change", async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const card = inp.closest("[data-req]");
    const note = card.querySelector("[data-attach-note]");
    note.textContent = "Uploading…";
    const c = findInboxChar(inp.dataset.attach);
    const res = await attachPortrait(c, inp.dataset.attach, file);
    note.textContent = res.ok ? "Pushed to their sheet ✓" : "Failed: " + res.error;
  }));
  host.querySelectorAll("[data-thumb]").forEach((slot) => {
    const card = slot.closest("[data-req]");
    const c = findInboxChar(card.dataset.req);
    const p = c && (c.portraitPath || normalizeAttires(c)[0].portraitPath);
    if (p) portraitURL(p).then((url) => {
      if (url) slot.innerHTML = '<span class="look-frame" style="max-width:140px"><img class="sketch" src="' + url + '" alt="Delivered portrait of ' + esc(c.name) + '" /></span>';
    });
  });
}
function findInboxChar(id) {
  return inbox.requested.get(id) || inbox.submitted.get(id) || inbox.done.get(id) || inbox.complete.get(id) || null;
}
function renderInbox() {
  for (const id of [...selectedNew]) if (!inbox.requested.has(id)) selectedNew.delete(id);
  renderInboxSection(inbox.requested, "#inboxNew", true);
  renderInboxSection(inbox.submitted, "#inboxSubmitted", false);
  renderInboxSection(inbox.done, "#inboxDone", false);
  renderInboxSection(inbox.complete, "#inboxComplete", false);
  syncBatchBar();
}
function syncBatchBar() {
  const total = inbox.requested.size;
  const sel = selectedNew.size;
  $("#selCount").textContent = sel + " selected";
  $("#submitKendoBtn").disabled = sel < 1;
  const all = $("#selectAllNew");
  all.checked = total > 0 && sel === total;
  all.indeterminate = sel > 0 && sel < total;
}
$("#selectAllNew").addEventListener("change", (e) => {
  selectedNew.clear();
  if (e.target.checked) for (const id of inbox.requested.keys()) selectedNew.add(id);
  renderInbox();
});
async function attachPortrait(c, charId, file) {
  if (!c) return { ok: false, error: "character not found" };
  const path = "portraits/" + c.ownerUid + "/" + charId + ".webp";
  try {
    await stMod.uploadBytes(stMod.ref(storage, path), file);
    await fsMod.updateDoc(fsMod.doc(db, "characters", charId), {
      portraitPath: path,
      sketchStatus: "done",
      sketchCompletedAt: fsMod.serverTimestamp()
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// Upload one character's returned SET files: merge them into
// the doc's attires, and flip completion ONLY when all nine
// parts exist after the merge. Partial landings are written
// (so a set can finish across two passes) but never complete.
// A validated tales array rides the SAME update when given —
// tales land in the same merge pass, but never gate
// completion (the nine art files alone decide that).
async function attachSetGroup(charId, c, parts, tales) {
  const slots = normalizeAttires(c);
  const landedNames = [], failedNames = [];
  for (const p of parts) {
    const field = p.kind === "portrait" ? "portraitPath" : p.kind === "skin" ? "skinMaskPath" : "hairMaskPath";
    const dir = p.kind === "portrait" ? "portraits" : "masks";
    const suffix = p.kind === "portrait" ? "" : "-" + p.kind;
    const path = dir + "/" + c.ownerUid + "/" + charId + "/attire" + p.attire + suffix + ".webp";
    try {
      await stMod.uploadBytes(stMod.ref(storage, path), p.file);
      slots[p.attire - 1][field] = path;
      landedNames.push(p.file.name);
    } catch (e) { failedNames.push(p.file.name + " (" + e.message + ")"); }
  }
  const status = attireSetStatus(slots);
  const update = { attires: slots };
  if (tales) update.tales = tales;
  if (status.complete) {
    update.portraitSetComplete = true;
    update.sketchStatus = "complete";
    update.sketchCompletedAt = fsMod.serverTimestamp();
  }
  let docError = null;
  try { await fsMod.updateDoc(fsMod.doc(db, "characters", charId), update); }
  catch (e) { docError = e.message; }
  return { landedNames, failedNames, status, docError };
}
// Bulk attach: group the picked files by the doc ID in their
// names — full nine-file sets complete a character; partial
// sets are reported by name and do not; a bare <docId> file
// is the interim portrait, exactly like a single attach; a
// <docId>--tales.json is validated and written to the doc in
// the same merge pass (tales never gate completion, and are
// reported separately: landed / missing / invalid).
$("#bulkFiles").addEventListener("change", async (ev) => {
  const files = [...(ev.target.files || [])];
  const results = $("#bulkResults");
  results.innerHTML = "";
  if (!files.length) return;
  const open = new Map([...inbox.requested, ...inbox.submitted, ...inbox.done, ...inbox.complete]);
  const groups = new Map(); // docId -> { c, parts: [], lone: null }
  for (const file of files) {
    const li = document.createElement("li");
    const parsed = parseReturnFilename(file.name);
    if (!parsed) {
      li.innerHTML = '<span class="bad">✗ ' + esc(file.name) + ' — unmatched: not a Kendo return file name</span>';
      results.appendChild(li);
      continue;
    }
    const c = open.get(parsed.docId);
    if (!c) {
      li.innerHTML = '<span class="bad">✗ ' + esc(file.name) + ' — unmatched: no request in the inbox has doc ID ' + esc(parsed.docId) + '</span>';
      results.appendChild(li);
      continue;
    }
    if (!groups.has(parsed.docId)) groups.set(parsed.docId, { c: c, parts: [], lone: null, talesFile: null });
    const g = groups.get(parsed.docId);
    if (parsed.kind === "lone") g.lone = file;
    else if (parsed.kind === "tales") g.talesFile = file;
    else g.parts.push({ file: file, kind: parsed.kind, attire: parsed.attire });
  }
  for (const [docId, g] of groups) {
    // The tales file is validated up front; a valid one is
    // written in the same merge pass as the set files below.
    let talesArr = null, talesError = null;
    if (g.talesFile) {
      try {
        const pt = parseTalesJson(await g.talesFile.text());
        if (pt.ok) talesArr = pt.tales; else talesError = pt.error;
      } catch (e) { talesError = "could not read the file (" + e.message + ")"; }
    }
    let lastLi = null;
    if (g.lone) {
      const li = document.createElement("li");
      lastLi = li;
      li.textContent = "… " + g.lone.name + " → " + g.c.name + " (uploading interim portrait)";
      results.appendChild(li);
      const res = await attachPortrait(g.c, docId, g.lone);
      li.innerHTML = res.ok
        ? '<span class="ok">✓ ' + esc(g.lone.name) + ' — interim portrait pushed to ' + esc(g.c.name) + "'s sheet (does not complete the set)</span>"
        : '<span class="bad">✗ ' + esc(g.lone.name) + ' — matched ' + esc(g.c.name) + ' but failed: ' + esc(res.error) + '</span>';
    }
    if (g.parts.length || talesArr) {
      const li = document.createElement("li");
      lastLi = li;
      li.textContent = g.parts.length
        ? "… " + g.parts.length + " set file(s) for " + g.c.name + " (uploading)"
        : "… tales file for " + g.c.name + " (writing to the sheet)";
      results.appendChild(li);
      const res = await attachSetGroup(docId, g.c, g.parts, talesArr);
      const landedList = res.landedNames.map(esc).join(", ") || "none";
      const failedBits = res.failedNames.length ? '<br><span class="bad">Failed uploads: ' + res.failedNames.map(esc).join(", ") + '</span>' : "";
      let html;
      if (res.docError) {
        html = '<span class="bad">✗ ' + esc(g.c.name) + ' — files uploaded but the sheet update failed: ' + esc(res.docError) + '</span>';
      } else if (!g.parts.length) {
        html = '<span class="ok">✓ ' + esc(g.c.name) + ' — tales written to the sheet (no art files in this pass).</span>';
      } else if (res.status.complete) {
        html = '<span class="ok">✓ ' + esc(g.c.name) + ' — COMPLETE set installed (' + res.landedNames.length + ' file(s) this pass: ' + landedList + '). Every customization is now live on their sheet.</span>';
      } else {
        html = '<span class="bad">◐ ' + esc(g.c.name) + ' — partial set, NOT completed. Landed: ' + landedList + '. Still missing: ' + res.status.missing.map(esc).join(", ") + '.</span>';
      }
      if (talesArr && !res.docError) {
        html += '<br><span class="ok">✓ Tales landed — the 3 Campaigns of Friends tales are on ' + esc(g.c.name) + "'s sheet.</span>";
      } else if (talesArr && res.docError) {
        html += '<br><span class="bad">◐ Tales rode that failed update — not written; attach the tales file again.</span>';
      }
      li.innerHTML = html + failedBits;
    } else if (g.talesFile) {
      // A tales file arrived but failed validation: report it
      // by name; nothing was written for the tales.
      const li = document.createElement("li");
      lastLi = li;
      li.innerHTML = '<span class="bad">✗ ' + esc(g.c.name) + ' — tales file ' + esc(g.talesFile.name) + ' is invalid: ' + esc(talesError) + ' Nothing was written for the tales.</span>';
      results.appendChild(li);
    }
    if (!g.talesFile && lastLi) {
      lastLi.innerHTML += '<br><span class="bad">◐ Tales missing — no ' + esc(talesFileName(docId)) + ' in this pass; tales are reported separately and the set above is unaffected.</span>';
    }
  }
  ev.target.value = "";
});
// Batch: compile selected briefs, mark them With Kendo.
let lastBatchText = "", lastBatchName = "";
$("#submitKendoBtn").addEventListener("click", async () => {
  const ids = [...selectedNew].filter((id) => inbox.requested.has(id));
  if (!ids.length) return;
  const btn = $("#submitKendoBtn");
  btn.disabled = true; btn.textContent = "Submitting…";
  const docs = ids.map((id) => ({ id, c: inbox.requested.get(id) }));
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes());
  const head =
    "KENDO SKETCH BATCH — " + now.toLocaleString() + "\n" +
    docs.length + " character(s) requested.\n" +
    "RETURN CONTRACT — for EACH character below, return a full set of TEN items — the nine art files plus the tales file — named exactly:\n" +
    "  <docId>--attire1.webp — portrait, Attire 1 (1000x2000 WebP)\n" +
    "  <docId>--attire2.webp — portrait, Attire 2 (1000x2000 WebP)\n" +
    "  <docId>--attire3.webp — portrait, Attire 3 (1000x2000 WebP)\n" +
    "  <docId>--attire1-skin.webp — skin mask for Attire 1 (500x1000 WebP)\n" +
    "  <docId>--attire1-hair.webp — hair mask for Attire 1 (500x1000 WebP)\n" +
    "  <docId>--attire2-skin.webp — skin mask for Attire 2 (500x1000 WebP)\n" +
    "  <docId>--attire2-hair.webp — hair mask for Attire 2 (500x1000 WebP)\n" +
    "  <docId>--attire3-skin.webp — skin mask for Attire 3 (500x1000 WebP)\n" +
    "  <docId>--attire3-hair.webp — hair mask for Attire 3 (500x1000 WebP)\n" +
    "  <docId>--tales.json — a JSON file: {\"tales\":[{\"move\":\"<weapon 1 name>\",\"text\":\"<tale>\"},{\"move\":\"<weapon 2 name>\",\"text\":\"<tale>\"},{\"move\":\"<weapon 3 name>\",\"text\":\"<tale>\"}]} — three backstory tales, one per weapon, each ending with the vote weave.\n" +
    "Portraits: gray pencil sketch on plain off-white paper, full body, no color — each brief below carries the full style details and all three attire descriptions.\n" +
    "Masks: each mask's alpha marks exactly the skin (resp. hair) area of that attire's portrait, drawn at half the portrait's size.\n" +
    "A complete nine-file set gives the character all three attires plus every skin-tone and hair-color customization the shipped heroes have. The tales file adds their Campaigns of Friends — it travels with the set but does not gate completion.\n" +
    "A single <docId>.webp still works as an interim portrait, but it does NOT complete the set.\n" +
    "============================================================\n";
  const body = docs.map((d, i) =>
    "\nENTRY " + (i + 1) + " of " + docs.length + "\n" +
    "From: " + (d.c.ownerDisplayName || "A friend") + (d.c.ownerEmail ? " <" + d.c.ownerEmail + ">" : "") + "\n" +
    "Character: " + d.c.name + " (" + d.c.class + ")\n" +
    "Doc ID: " + d.id + "\n" +
    "--- brief ---\n" + (d.c.sketchBrief || composeBrief(d.c)) + "\n"
  ).join("");
  lastBatchText = head + body;
  lastBatchName = "kendo-sketch-batch-" + stamp + ".txt";
  try {
    for (const d of docs) {
      await fsMod.updateDoc(fsMod.doc(db, "characters", d.id), {
        sketchStatus: "submitted",
        sketchSubmittedToKendoAt: fsMod.serverTimestamp()
      });
    }
    selectedNew.clear();
    $("#batchOut").hidden = false;
    $("#batchText").value = lastBatchText;
    $("#batchNote").textContent = "Marked " + docs.length + " request(s) as With Kendo. Copy or download the batch and paste it into your chat with Kendo.";
  } catch (e) {
    $("#batchOut").hidden = false;
    $("#batchText").value = lastBatchText;
    $("#batchNote").textContent = "The batch text is ready, but marking requests failed: " + e.message;
  }
  btn.disabled = false; btn.textContent = "Submit to Kendo for sketch creation";
});
$("#copyBatchBtn").addEventListener("click", () => copyText(lastBatchText, $("#copyBatchBtn")));
$("#downloadBatchBtn").addEventListener("click", () => {
  const blob = new Blob([lastBatchText], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = lastBatchName || "kendo-sketch-batch.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

// ---------- Campaigns (admin): the Band + the game-night ledger ----------
// Staging: every pushed character arrives pre-connected to
// its human (the owner the doc already knows). Mike's only
// jobs are to confirm the pairing — or override the name for
// that night — and to type the module name + date. The name
// he saves lives on the campaign record, per campaign.
function bandState(id, c) {
  if (!bandEdits.has(id)) {
    bandEdits.set(id, { checked: true, humanName: c.ownerDisplayName || "" });
  }
  return bandEdits.get(id);
}
function renderBand() {
  const host = $("#bandList");
  if (!host) return;
  for (const id of [...bandEdits.keys()]) if (!bandChars.has(id)) bandEdits.delete(id);
  const arr = [...bandChars.entries()].sort((a, b) => (b[1].campaignPushedAt?.seconds || 0) - (a[1].campaignPushedAt?.seconds || 0));
  if (!arr.length) {
    host.innerHTML = '<p class="note">Nobody has pushed a character yet. When a friend taps "Push to Mike for game night" on their sheet, their character lands here — already connected to their name.</p>';
    return;
  }
  host.innerHTML = arr.map(([id, c]) => {
    const st = bandState(id, c);
    return '<div class="req-card" data-band="' + id + '">' +
      '<div class="req-head">' +
      '<input type="checkbox" data-band-check="' + id + '" aria-label="Include this character in the campaign" ' + (st.checked ? "checked" : "") + ' />' +
      '<div><b>' + esc(c.name) + '</b> · ' + esc(c.class) +
      '<div class="req-meta">Pushed by ' + esc(c.ownerDisplayName || "A friend") + (c.ownerEmail ? " · " + esc(c.ownerEmail) : "") + '</div>' +
      '<div class="docid">Doc ID: ' + id + '</div></div></div>' +
      '<label class="fld">Plays this night as' +
      '<input type="text" class="txtin" data-band-human="' + id + '" maxlength="60" value="' + esc(st.humanName) + '" />' +
      '</label>' +
      '<span class="hint">Pre-filled with the sheet\'s owner — confirm it, or type the name they play under tonight. The saved name stays with this campaign only.</span>' +
      '</div>';
  }).join("");
  host.querySelectorAll("[data-band-check]").forEach((cb) => cb.addEventListener("change", () => {
    bandState(cb.dataset.bandCheck, bandChars.get(cb.dataset.bandCheck)).checked = cb.checked;
  }));
  host.querySelectorAll("[data-band-human]").forEach((inp) => inp.addEventListener("input", () => {
    bandState(inp.dataset.bandHuman, bandChars.get(inp.dataset.bandHuman)).humanName = inp.value;
  }));
}
$("#saveCampaignBtn").addEventListener("click", async () => {
  const note = $("#campSaveNote");
  const name = $("#campName").value.trim();
  const date = $("#campDate").value;
  const picked = [...bandChars.entries()].filter(([id, c]) => bandState(id, c).checked);
  if (!name) { note.textContent = "Give the night its module / adventure name first."; return; }
  if (!date) { note.textContent = "Pick the date the campaign is played."; return; }
  if (!picked.length) { note.textContent = "Nobody is checked into the Band — check at least one staged character."; return; }
  const roster = picked.map(([id, c]) => {
    const st = bandState(id, c);
    return {
      humanName: (st.humanName || "").trim() || c.ownerDisplayName || "A friend",
      characterId: id,
      characterName: c.name || "",
      // Session-credits contract v2 (SESSION-CREDITS-PUSH-SPEC.md):
      // a band entry carries the character's identity (the
      // doc ID above), its TRUE name, and the name it plays
      // under for the session — so a later credits push can
      // file by ID even when the night used a played-as name.
      trueName: c.name || "",
      displayName: c.sessionName || c.name || "",
      ownerUid: c.ownerUid || "",
      ownerDisplayName: c.ownerDisplayName || ""
    };
  });
  const btn = $("#saveCampaignBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await fsMod.addDoc(campsCol, {
      name: name,
      datePlayed: date,
      roster: roster,
      highlights: "",
      emails: [],
      createdAt: fsMod.serverTimestamp(),
      createdBy: user.uid,
      playState: "not sent"
    });
    note.textContent = "Saved ✓ — \"" + name + "\" is in the Campaigns menu below. The pushes stay in the Band until each player withdraws their own sheet.";
    $("#campName").value = "";
  } catch (e) {
    note.textContent = "Save failed: " + e.message;
  }
  btn.disabled = false; btn.textContent = "Save campaign";
});
// The ledger: newest date first (the listener's orderBy),
// rows are campaign cards — name + date + play state up top,
// then the entry table in the spec's columns, the editable
// highlights box, the saved emails, and the record's actions.
function campaignCard(camp, entries) {
  const total = (camp.roster || []).length;
  return '<div class="req-card" data-camp="' + camp.id + '">' +
    '<div class="req-head">' +
    '<input type="checkbox" data-play-check="' + camp.id + '" aria-label="Select this campaign for Play" ' + (playSelectedId === camp.id ? "checked" : "") + ' />' +
    '<div><b>' + esc(camp.name) + '</b> · ' + esc(prettyDate(camp.datePlayed)) +
    ' <span class="chip">' + esc(camp.playState || "not sent") + '</span>' +
    '<div class="req-meta">' + (entries.length === total ? total + " player(s)" : entries.length + " of " + total + " roster entries match the filters") + '</div></div></div>' +
    '<table class="roster"><thead><tr><th>Human (that day)</th><th>Character</th><th>Doc ID</th></tr></thead><tbody>' +
    entries.map((e) => '<tr><td>' + esc(e.humanName) + '</td><td>' + esc(e.characterName) + '</td><td class="docid">' + esc(e.characterId) + '</td></tr>').join("") +
    '</tbody></table>' +
    '<label class="fld">Campaign highlights' +
    '<textarea data-highlights rows="3" placeholder="The fun moments of the evening — they shape the next-day email.">' + esc(camp.highlights || "") + '</textarea></label>' +
    '<label class="fld">Player email addresses (saved with the record)' +
    '<input type="text" class="txtin" data-emails value="' + esc((camp.emails || []).join(", ")) + '" placeholder="name@example.com, other@example.com" /></label>' +
    '<div class="row">' +
    '<button type="button" data-save-record>Save highlights + emails</button>' +
    '<button type="button" data-draft-email>Draft email</button>' +
    '<label>Play state ' +
    '<select data-play-state>' +
    ["not sent", "sent for setup", "ready"].map((s) => '<option value="' + s + '"' + ((camp.playState || "not sent") === s ? " selected" : "") + '>' + s + '</option>').join("") +
    '</select></label>' +
    '<button type="button" class="danger" data-del-camp>Delete</button>' +
    '</div>' +
    '<p class="hint" data-camp-note role="status"></p>' +
    '</div>';
}
function renderLedger() {
  const host = $("#campList");
  if (!host) return;
  if (playSelectedId && !campaignsArr.some((c) => c.id === playSelectedId)) playSelectedId = null;
  $("#campEmpty").hidden = campaignsArr.length > 0;
  const rows = filterCampaigns(campaignsArr, campFilters);
  const filtering = !!(campFilters.human || campFilters.character || campFilters.date || campFilters.from || campFilters.to);
  $("#campFilterNote").textContent = filtering
    ? rows.length + " campaign(s) match."
    : (campaignsArr.length ? campaignsArr.length + " campaign(s) saved." : "");
  host.innerHTML = campaignsArr.length && !rows.length
    ? '<p class="note">No campaigns match those filters.</p>'
    : rows.map(({ campaign, entries }) => campaignCard(campaign, entries)).join("");
  host.querySelectorAll("[data-play-check]").forEach((cb) => cb.addEventListener("change", () => {
    playSelectedId = cb.checked ? cb.dataset.playCheck : null;
    renderLedger();
  }));
  host.querySelectorAll("[data-camp]").forEach((card) => {
    const id = card.dataset.camp;
    const camp = campaignsArr.find((c) => c.id === id);
    if (!camp) return;
    const note = card.querySelector("[data-camp-note]");
    card.querySelector("[data-save-record]").addEventListener("click", async () => {
      const highlights = card.querySelector("[data-highlights]").value;
      const emails = parseEmailList(card.querySelector("[data-emails]").value);
      try {
        await fsMod.updateDoc(fsMod.doc(db, "campaigns", id), { highlights: highlights, emails: emails });
        note.textContent = "Saved ✓ — highlights and " + emails.length + " email address(es) are on the record.";
      } catch (e) { note.textContent = "Save failed: " + e.message; }
    });
    card.querySelector("[data-draft-email]").addEventListener("click", () => {
      // The draft is built from what is on the card right now
      // (highlights + emails as typed), so it works even
      // before Save — the template itself lives in data.js
      // and no external AI call is made anywhere.
      const draft = Object.assign({}, camp, {
        highlights: card.querySelector("[data-highlights]").value,
        emails: parseEmailList(card.querySelector("[data-emails]").value)
      });
      window.location.href = buildMailtoHref(draft);
    });
    card.querySelector("[data-play-state]").addEventListener("change", async (ev) => {
      try {
        await fsMod.updateDoc(fsMod.doc(db, "campaigns", id), { playState: ev.target.value });
        note.textContent = "Play state: " + ev.target.value + ".";
      } catch (e) { note.textContent = "Could not set the play state: " + e.message; }
    });
    card.querySelector("[data-del-camp]").addEventListener("click", async () => {
      if (!confirm("Delete the campaign \"" + camp.name + "\" for good? The character sheets themselves are not touched.")) return;
      try {
        await fsMod.deleteDoc(fsMod.doc(db, "campaigns", id));
      } catch (e) { note.textContent = "Delete failed: " + e.message; }
    });
  });
  syncPlayBar();
}
function syncPlayBar() {
  const btn = $("#playBtn");
  if (!btn) return;
  btn.disabled = !playSelectedId;
  btn.textContent = playSelectedId ? "Play the checked campaign" : "Play — check a campaign below first";
}
// Play: build the setup prompt from the campaign record +
// the LIVE character docs (a roster entry's blob must carry
// the sheet as it stands now, not as it stood at save time),
// mark the record "sent for setup", and put the prompt in
// Mike's hands. Honest mechanism, stated on the card: this
// page cannot summon Kendo by itself — the paste does.
$("#playBtn").addEventListener("click", async () => {
  const camp = campaignsArr.find((c) => c.id === playSelectedId);
  if (!camp) return;
  const btn = $("#playBtn");
  btn.disabled = true; btn.textContent = "Building the prompt…";
  const entries = [];
  for (const e of camp.roster || []) {
    let c = bandChars.get(e.characterId) || null;
    if (!c) {
      try {
        const snap = await fsMod.getDoc(fsMod.doc(db, "characters", e.characterId));
        if (snap.exists()) c = snap.data();
      } catch (err) { /* not shared with Mike anymore — the prompt says so */ }
    }
    entries.push({
      humanName: e.humanName,
      characterName: e.characterName,
      characterId: e.characterId,
      line: c ? roll20ImportLine(c, e.characterId) : null
    });
  }
  lastPlayText = buildSetupPrompt(camp, entries);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  lastPlayName = "kendo-setup-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes()) + ".txt";
  let stateNote = "";
  try {
    await fsMod.updateDoc(fsMod.doc(db, "campaigns", camp.id), { playState: "sent for setup" });
    stateNote = " The campaign is marked \"sent for setup\".";
  } catch (e) {
    stateNote = " (The prompt is ready, but marking it sent failed: " + e.message + ")";
  }
  $("#playOut").hidden = false;
  $("#playText").value = lastPlayText;
  const missing = entries.filter((e) => !e.line).length;
  $("#playNote").textContent = "Copy or download the prompt and paste it into your chat with Kendo — that paste is the summons." + stateNote +
    (missing ? " Heads-up: " + missing + " sheet(s) could not be loaded (no longer shared with you) — the prompt flags them for a re-push." : "");
  btn.disabled = false;
  syncPlayBar();
});
$("#copyPlayBtn").addEventListener("click", () => copyText(lastPlayText, $("#copyPlayBtn")));
$("#downloadPlayBtn").addEventListener("click", () => {
  const blob = new Blob([lastPlayText], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = lastPlayName || "kendo-setup-prompt.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
// Ledger search filters (spec: human name / exact date /
// date range / character profile name).
function bindCampFilter(id, key, isDate) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => { campFilters[key] = el.value; renderLedger(); });
  if (isDate) el.addEventListener("change", () => { campFilters[key] = el.value; renderLedger(); });
}
bindCampFilter("#campFilterHuman", "human", false);
bindCampFilter("#campFilterChar", "character", false);
bindCampFilter("#campFilterDate", "date", true);
bindCampFilter("#campFilterFrom", "from", true);
bindCampFilter("#campFilterTo", "to", true);
$("#campFilterClear").addEventListener("click", () => {
  for (const k of Object.keys(campFilters)) campFilters[k] = "";
  for (const id of ["#campFilterHuman", "#campFilterChar", "#campFilterDate", "#campFilterFrom", "#campFilterTo"]) $(id).value = "";
  renderLedger();
});

// ---------- Auth ----------
$("#signInBtn").addEventListener("click", async () => {
  $("#gateError").textContent = "";
  try {
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  } catch (e) {
    $("#gateError").textContent = "Sign-in did not finish: " + e.message;
  }
});
$("#signOutBtn").addEventListener("click", () => authMod.signOut(auth));

function startListeners() {
  const mineQ = fsMod.query(charsCol, fsMod.where("ownerUid", "==", user.uid), fsMod.orderBy("createdAt", "asc"));
  unsubs.push(fsMod.onSnapshot(mineQ, (snap) => {
    myChars.clear();
    snap.forEach((d) => myChars.set(d.id, d.data()));
    renderMyList();
    if (selectedCharId && myChars.has(selectedCharId)) renderCharSheet();
  }, (e) => { $("#myList").innerHTML = '<p class="error">Could not load your characters: ' + esc(e.message) + ' — if the database rules have not been pasted yet, see SETUP.md step 5.</p>'; }));
  // Session credits pushes addressed to this player: the DM
  // Guide writes them after a tabletop run; they render on
  // the matching character sheets as the Campaign adventures
  // history. The query is pinned to the player's own email —
  // the rules allow reading nothing else (admin aside).
  myPushesByChar = new Map();
  myPushesRaw = [];
  pushesError = "";
  if (user.email) {
    const pushQ = fsMod.query(pushesCol, fsMod.where("playerEmail", "==", user.email));
    unsubs.push(fsMod.onSnapshot(pushQ, (snap) => {
      const docs = [];
      snap.forEach((d) => docs.push(d.data()));
      myPushesRaw = docs.slice();
      myPushesByChar = groupPushesByCharacter(docs);
      pushesError = "";
      if (selectedCharId && myChars.has(selectedCharId)) renderCharSheet();
    }, (e) => {
      pushesError = e.message;
      if (selectedCharId && myChars.has(selectedCharId)) renderCharSheet();
    }));
  }
  if (isAdmin) {
    for (const status of ["requested", "submitted", "done", "complete"]) {
      const q = fsMod.query(charsCol, fsMod.where("sketchStatus", "==", status));
      unsubs.push(fsMod.onSnapshot(q, (snap) => {
        inbox[status].clear();
        snap.forEach((d) => inbox[status].set(d.id, d.data()));
        renderInbox();
      }, (e) => { $("#inboxNew").innerHTML = '<p class="error">Inbox could not load: ' + esc(e.message) + ' — check that the admin email matches in firebase-config.js and both rules files (SETUP.md step 6).</p>'; }));
    }
    // The Band: every character its owner has pushed for a
    // game night, whatever its sketch status.
    const bandQ = fsMod.query(charsCol, fsMod.where("campaignPushedAt", "!=", null));
    unsubs.push(fsMod.onSnapshot(bandQ, (snap) => {
      bandChars.clear();
      snap.forEach((d) => bandChars.set(d.id, d.data()));
      renderBand();
    }, (e) => { $("#bandList").innerHTML = '<p class="error">The Band could not load: ' + esc(e.message) + ' — check that the admin email matches in firebase-config.js and both rules files (SETUP.md step 6).</p>'; }));
    // The ledger itself: saved campaigns, newest date first.
    const campQ = fsMod.query(campsCol, fsMod.orderBy("datePlayed", "desc"));
    unsubs.push(fsMod.onSnapshot(campQ, (snap) => {
      campaignsArr.length = 0;
      snap.forEach((d) => campaignsArr.push(Object.assign({ id: d.id }, d.data())));
      renderLedger();
    }, (e) => { $("#campList").innerHTML = '<p class="error">Campaigns could not load: ' + esc(e.message) + ' — if the database rules have not been pasted yet, see SETUP.md step 5.</p>'; }));
  }
}
authMod.onAuthStateChanged(auth, (u) => {
  user = u;
  unsubs.forEach((fn) => fn()); unsubs = [];
  if (!u) {
    $("#app").hidden = true;
    $("#gate").hidden = false;
    return;
  }
  isAdmin = adminEmailIsReady() && !!u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  $("#whoName").textContent = u.displayName || "Friend";
  $("#whoEmail").textContent = u.email || "";
  $("#inboxTab").hidden = !isAdmin;
  $("#campaignsTab").hidden = !isAdmin;
  const campDateEl = $("#campDate");
  if (campDateEl && !campDateEl.value) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    campDateEl.value = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderHeroPicker();
  renderHeroSheet(currentHero);
  startListeners();
});
