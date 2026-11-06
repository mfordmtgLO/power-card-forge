// ============================================================
// POWER CARD CHARACTER FORGE — shared game data
// ------------------------------------------------------------
// Everything in this file is grounded in the shipped Power
// Card game (Vote or Fade Away): the LOOK tables and skin-ramp
// math are the game's own (see the hand-off package extracts,
// game index.html lines 2948-3122 and 5019-5300), the hero
// slider floors / caps / defaults are the values printed on
// the six shipped sheets, and the weapon / spell / pack lists
// are the game's WEAPONS, SPELLS and PACK_ITEMS tables.
// Pools check: Maya 73 · Dre 61 · Priya 93 · Marc 71 ·
// Sana 77 · Eli 74 (each pool is the sum of its defaults).
// ============================================================

export const HERO_KEYS = ["maya", "dre", "priya", "marc", "sana", "eli"];

export const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha", "mag", "heal"];
export const STAT_NAMES = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA", mag: "MAGIC", heal: "HEAL" };
export const STAT_LONG = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma", mag: "Magic", heal: "Healing" };

// Combat modifier, exactly as the game derives it:
// (stat - 8) / 2, rounded, clamped to -2..+4.
export function modifier(v) {
  return Math.max(-2, Math.min(4, Math.round((v - 8) / 2)));
}

// ---------- Art registry (real files under assets/) ----------
export const ART = {
  maya: "assets/portraits/sketch-maya.webp",
  maya2: "assets/portraits/sketch-maya-market.webp",
  maya3: "assets/portraits/sketch-maya-night.webp",
  dre: "assets/portraits/sketch-dre.webp",
  dre2: "assets/portraits/sketch-dre-gym.webp",
  dre3: "assets/portraits/sketch-dre-sunday.webp",
  priya: "assets/portraits/sketch-priya.webp",
  priya2: "assets/portraits/sketch-priya-scholar.webp",
  priya3: "assets/portraits/sketch-priya-festival.webp",
  marc: "assets/portraits/sketch-marc.webp",
  marc2: "assets/portraits/sketch-marc-shop.webp",
  marc3: "assets/portraits/sketch-marc-offduty.webp",
  sana: "assets/portraits/sketch-sana.webp",
  sana2: "assets/portraits/sketch-sana-street.webp",
  sana3: "assets/portraits/sketch-sana-studio.webp",
  eli: "assets/portraits/sketch-eli.webp",
  eli2: "assets/portraits/sketch-eli-dawn.webp",
  eli3: "assets/portraits/sketch-eli-night.webp"
};
for (const k of HERO_KEYS) {
  for (const suf of ["", "2", "3"]) {
    ART[k + suf + "_skin"] = "assets/masks/mask-" + k + suf + "-skin.webp";
    ART[k + suf + "_hair"] = "assets/masks/mask-" + k + suf + "-hair.webp";
  }
}

// ---------- LOOK — the game's tables, verbatim values ----------
export const LOOK_SKINS = [
  { name: "Fair", sw: "#f2d7bd", tone: "#f7e3cb", op: .92 },
  { name: "Warm", sw: "#dfa06b", tone: "#e0a068", op: .95 },
  { name: "Deep", sw: "#8a5a33", tone: "#8a5a33", op: .85 },
  { name: "Golden", sw: "#e3ac3c", tone: "#eda93a", op: .95 }
];
export const SKIN_RAMP_L = [0, .10, .25, .40, .55, .70, .80, .90, 1];
export const SKIN_RAMP_H = [.22, .28, .40, .53, .66, .78, .86, .93, 1];
export function lumOf(r, g, b) { return .3 * r + .59 * g + .11 * b; }
export function clipColorRGB(c) {
  var L = lumOf(c[0], c[1], c[2]);
  var n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]), i;
  if (n < 0) { var f = (L - n) === 0 ? 0 : L / (L - n); for (i = 0; i < 3; i++) c[i] = L + (c[i] - L) * f; }
  L = lumOf(c[0], c[1], c[2]); x = Math.max(c[0], c[1], c[2]);
  if (x > 1) { var f2 = (x - L) === 0 ? 0 : (1 - L) / (x - L); for (i = 0; i < 3; i++) c[i] = L + (c[i] - L) * f2; }
  return c;
}
export function setLumRGB(c, l) {
  var d = l - lumOf(c[0], c[1], c[2]);
  return clipColorRGB([c[0] + d, c[1] + d, c[2] + d]);
}
export function rampH(L) {
  if (L <= 0) return SKIN_RAMP_H[0];
  for (var i = 1; i < SKIN_RAMP_L.length; i++) {
    if (L <= SKIN_RAMP_L[i]) {
      var t = (L - SKIN_RAMP_L[i - 1]) / (SKIN_RAMP_L[i] - SKIN_RAMP_L[i - 1]);
      return SKIN_RAMP_H[i - 1] + t * (SKIN_RAMP_H[i] - SKIN_RAMP_H[i - 1]);
    }
  }
  return 1;
}
export function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
// The game's ramped-skin-layer builder, with the sheet-refresh
// hook replaced by a settable callback (setRampReadyCallback).
// One shared builder: hero sheets feed it ART-registry paths via
// skinRampURL; completed forged characters feed it their own
// Storage download URLs via skinRampURLFor. The pixel math is
// identical either way — that is what "behaves exactly like the
// heroes" means for the Look.
let onRampReady = function () {};
export function setRampReadyCallback(fn) { onRampReady = fn; }
const skinRampCache = {};
function buildRamp(key, notifyKey, portraitSrc, skinMaskSrc, skinIdx) {
  var hit = skinRampCache[key];
  if (hit !== undefined) return hit === "pending" || hit === "error" ? null : hit;
  skinRampCache[key] = "pending";
  var skin = LOOK_SKINS[skinIdx];
  var T = hexRGB(skin.tone), LT = lumOf(T[0], T[1], T[2]);
  var pImg = new Image(), mImg = new Image(), loaded = 0;
  function fail() { skinRampCache[key] = "error"; }
  function go() {
    if (++loaded < 2) return;
    try {
      var W = pImg.naturalWidth, H = pImg.naturalHeight;
      if (!W || !H) { fail(); return; }
      var pc = document.createElement("canvas"); pc.width = W; pc.height = H;
      var px = pc.getContext("2d"); px.drawImage(pImg, 0, 0);
      var mc = document.createElement("canvas"); mc.width = W; mc.height = H;
      var mx = mc.getContext("2d"); mx.drawImage(mImg, 0, 0, W, H);
      var pd = px.getImageData(0, 0, W, H).data, md = mx.getImageData(0, 0, W, H).data;
      var oc = document.createElement("canvas"); oc.width = W; oc.height = H;
      var ox = oc.getContext("2d"), out = ox.createImageData(W, H), od = out.data;
      for (var i = 0, n = W * H; i < n; i++) {
        var ma = md[i * 4 + 3];
        if (!ma) continue;
        var L = lumOf(pd[i * 4] / 255, pd[i * 4 + 1] / 255, pd[i * 4 + 2] / 255);
        var C = setLumRGB([T[0], T[1], T[2]], LT * rampH(L));
        od[i * 4] = Math.round(C[0] * 255);
        od[i * 4 + 1] = Math.round(C[1] * 255);
        od[i * 4 + 2] = Math.round(C[2] * 255);
        od[i * 4 + 3] = Math.round(ma * skin.op);
      }
      ox.putImageData(out, 0, 0);
      skinRampCache[key] = oc.toDataURL("image/png");
      onRampReady(notifyKey, skinIdx);
    } catch (e) { fail(); }
  }
  pImg.onload = go; pImg.onerror = fail; pImg.src = portraitSrc;
  mImg.onload = go; mImg.onerror = fail; mImg.src = skinMaskSrc;
  return null;
}
export function skinRampURL(artKey, skinIdx) {
  return buildRamp(artKey + "|" + skinIdx, artKey, ART[artKey], ART[artKey + "_skin"], skinIdx);
}
// Forged characters: the same builder, fed with the character's
// own Storage URLs. cacheKey is caller-chosen (unique per
// character + attire); the ready callback fires with
// (cacheKey, skinIdx) so the sheet can re-render when its
// ramp lands.
export function skinRampURLFor(cacheKey, portraitSrc, skinMaskSrc, skinIdx) {
  return buildRamp(cacheKey + "|" + skinIdx, cacheKey, portraitSrc, skinMaskSrc, skinIdx);
}
export const LOOK_HAIRS = [
  { name: "Natural", sw: "#55504a", layers: [] },
  { name: "Auburn", sw: "#a44a1c", layers: [["color", "#a03a0c", .9]] },
  { name: "Silver", sw: "#ccd3da", layers: [["color", "#dbe4ee", .75], ["screen", "#e8eef5", .35]] },
  { name: "Teal", sw: "#0e7c74", layers: [["color", "#009e89", .95]] }
];
export const LOOK_ATTIRE = {
  maya: [
    { set: "Trail Set", top: "Scout Jacket", bottom: "Trail Pants", shoes: "Trail Boots" },
    { set: "Market Day", top: "Denim Jacket", bottom: "Market Skirt", shoes: "Canvas Shoes" },
    { set: "Night Watch", top: "Hooded Cloak", bottom: "Dark Leggings", shoes: "Soft Boots" }
  ],
  dre: [
    { set: "Work Set", top: "Flannel", bottom: "Work Jeans", shoes: "Steel-Toe Boots" },
    { set: "Gym Set", top: "Tank", bottom: "Training Shorts", shoes: "Court Shoes" },
    { set: "Sunday Best", top: "Button-Down", bottom: "Slacks", shoes: "Dress Shoes" }
  ],
  priya: [
    { set: "Dawn Set", top: "Dawn Robe", bottom: "Travel Skirt", shoes: "Sandals" },
    { set: "Scholar Set", top: "Cardigan", bottom: "Scholar Trousers", shoes: "Loafers" },
    { set: "Festival Set", top: "Bright Wrap", bottom: "Festival Pants", shoes: "Dancing Shoes" }
  ],
  marc: [
    { set: "Site Set", top: "Canvas Vest", bottom: "Work Pants", shoes: "Work Boots" },
    { set: "Shop Set", top: "Apron", bottom: "Shop Jeans", shoes: "Shop Shoes" },
    { set: "Off-Duty", top: "Hoodie", bottom: "Cargo Pants", shoes: "Sneakers" }
  ],
  sana: [
    { set: "Broadcast Set", top: "Thrift Blazer", bottom: "Broadcast Skirt", shoes: "Ankle Boots" },
    { set: "Street Set", top: "Bomber", bottom: "Street Jeans", shoes: "High-Tops" },
    { set: "Studio Set", top: "Studio Cardigan", bottom: "Studio Slacks", shoes: "Studio Flats" }
  ],
  eli: [
    { set: "Market Set", top: "Market Apron", bottom: "Market Trousers", shoes: "Market Shoes" },
    { set: "Dawn Set", top: "Open Shirt", bottom: "Dawn Shorts", shoes: "Sandals" },
    { set: "Night Market", top: "Night Jacket", bottom: "Night Pants", shoes: "Night Boots" }
  ]
};
export const LOOK_ART = {
  maya: ["maya", "maya2", "maya3"],
  dre: ["dre", "dre2", "dre3"],
  priya: ["priya", "priya2", "priya3"],
  marc: ["marc", "marc2", "marc3"],
  sana: ["sana", "sana2", "sana3"],
  eli: ["eli", "eli2", "eli3"]
};
// Hand-written alt text for each default portrait, verbatim from the game.
export const HERO_ALT = {
  maya: "Gray pencil sketch of Maya in a full attack stance — feet planted wide, longbow drawn to her cheek, aiming an arrow tipped with a ballot, quiver of Voting Arrows on her back, barista apron and gig-driver gear at her belt",
  dre: "Gray pencil sketch of Dre in a full attack stance — warehouse hoodie and work boots, both hands swinging the great Axe of Freedom high over his shoulder, mid-strike",
  priya: "Gray pencil sketch of Priya in a full attack stance — lunging forward in blazer and satchel, both hands driving the Sword of Youth toward the viewer",
  marc: "Gray pencil sketch of Marc in a full attack stance — canvas workwear and a loaded tool belt, both hands raising the great Hammer of Hands high, ready to bring it down",
  sana: "Gray pencil sketch of Sana in a full attack stance — thrifted layers and a cardigan, headphones around her neck, the Megaphone of Record raised high in one hand, mid-speech",
  eli: "Gray pencil sketch of Eli in a full attack stance — shop apron over streetwear, grinning, The Keeper's Bell swung high in one hand, the other open in welcome"
};

// ---------- Fighters / weapons / spells / pack (game tables) ----------
export const FIGHTERS = {
  maya: { name: "Maya", weapon: "arrow", wname: "Voting Arrows", die: 8, primary: "dex", line: "Maya steadies her bow. Gas money, rent money — she knows exactly what each price spike costs." },
  dre: { name: "Dre", weapon: "axe", wname: "Axe of Freedom", die: 12, primary: "str", line: "Dre shoulders the Axe. He's unloaded the late trucks. He knows what 'supply chain' means in his bones." },
  priya: { name: "Priya", weapon: "sword", wname: "Sword of Youth", die: 8, primary: "int", line: "Priya draws the Sword. Two hundred applications deep, she has read every footnote twice." },
  marc: { name: "Marc", weapon: "hammer", wname: "Hammer of Hands", die: 10, primary: "str", line: "Marc shoulders the Hammer of Hands. He wired half the new buildings on this road — and can't afford to live in any of them." },
  sana: { name: "Sana", weapon: "megaphone", wname: "Megaphone of Record", die: 8, primary: "cha", line: "Sana raises the Megaphone of Record. She read the public record into a microphone this morning — the actual record, with dates." },
  eli: { name: "Eli", weapon: "keys", wname: "The Keeper's Bell", die: 8, primary: "dex", line: "Eli rings The Keeper's Bell. The market opened at five; the tariff toll was waiting at his own loading dock." }
};
export const WEAPONS = {
  maya: [
    { name: "Voting Arrows", die: 8, fx: "Damage die 1d8 · no modifiers — her signature bow, the balanced strike she has always carried." },
    { name: "Longbow of the Long View", die: 10, hit: -1, fx: "Damage die 1d10 · −1 to hit — bigger hits that are harder to land." },
    { name: "Twin Shortbows", die: 6, hit: 2, fx: "Damage die 1d6 · +2 to hit — lighter hits with much surer aim." }
  ],
  dre: [
    { name: "Axe of Freedom", die: 12, fx: "Damage die 1d12 · no modifiers — his signature axe, the heaviest swing in the band." },
    { name: "War Maul", die: 10, dmg: 2, fx: "Damage die 1d10 · +2 damage on every hit." },
    { name: "Hand Axe & Board", die: 8, def: 2, fx: "Damage die 1d8 · +2 Defense while he carries it — the board turns blows." }
  ],
  priya: [
    { name: "Sword of Youth", die: 8, fx: "Damage die 1d8 · no modifiers — her signature blade." },
    { name: "Dawnblade", die: 10, leech: 2, fx: "Damage die 1d10 · also heals Priya 2 HP whenever her hit lands." },
    { name: "Mace of the Morning", die: 6, hit: 2, fx: "Damage die 1d6 · +2 to hit — lighter hits with much surer aim." }
  ],
  marc: [
    { name: "Hammer of Hands", die: 10, fx: "Damage die 1d10 · no modifiers — his signature hammer." },
    { name: "Sledge of Foundations", die: 12, hit: -1, fx: "Damage die 1d12 · −1 to hit — the biggest hits he owns, harder to land." },
    { name: "Wrench & Tongs", die: 8, hit: 1, def: 1, fx: "Damage die 1d8 · +1 to hit and +1 Defense — a tool in each hand, covered both ways." }
  ],
  sana: [
    { name: "Megaphone of Record", die: 8, fx: "Damage die 1d8 · no modifiers — her signature megaphone." },
    { name: "Airwave Horn", die: 10, hit: -1, fx: "Damage die 1d10 · −1 to hit — a louder blast that is harder to aim." },
    { name: "Pocket Mic", die: 6, hit: 2, fx: "Damage die 1d6 · +2 to hit — a smaller voice, placed exactly where it counts." }
  ],
  eli: [
    { name: "The Keeper's Bell", die: 8, fx: "Damage die 1d8 · no modifiers — his signature bell, the one that calls the town to gather." },
    { name: "Ironbound Bell", die: 10, hit: -1, fx: "Damage die 1d10 · −1 to hit — a heavier bell, a wilder swing." },
    { name: "Keeper's Ledger", die: 6, hit: 2, fx: "Damage die 1d6 · +2 to hit — every entry weighed fair, every strike accounted." }
  ]
};
export const SPELLS = {
  maya: [
    { name: "Sure Shot", fx: "+4 to hit on this attack" },
    { name: "Piercing Arrow", fx: "This hit ignores The Fade's Spin Defense" },
    { name: "Volley", fx: "+6 damage on this hit" },
    { name: "Scout's Mark", fx: "+2 damage on every hit for the rest of this battle" }
  ],
  dre: [
    { name: "Cleave", fx: "+6 damage on this hit" },
    { name: "Second Wind", fx: "Heal himself 12 HP" },
    { name: "Taunt", fx: "The Fade's next counterattack misses entirely" },
    { name: "Rally", fx: "+8 Hope" }
  ],
  priya: [
    { name: "Divine Smite", fx: "+8 damage on this hit" },
    { name: "Lay On Hands", fx: "Heal any one standing hero 14 HP" },
    { name: "Sanctuary", fx: "The Fade's next counterattack is negated" },
    { name: "Dawn Blessing", fx: "+1 Power Card pip" }
  ],
  marc: [
    { name: "Overbuild", fx: "+6 damage on this hit" },
    { name: "Brace the Line", fx: "The Fade's next counterattack deals 10 less damage" },
    { name: "Patch Up", fx: "Heal any one standing hero 10 HP" },
    { name: "Measure Twice", fx: "+4 to hit on this attack" }
  ],
  sana: [
    { name: "Cutting Remark", fx: "+5 damage on this hit and +4 Hope" },
    { name: "On the Record", fx: "This hit ignores The Fade's Spin Defense" },
    { name: "Amplified", fx: "+2 damage on every hit for the rest of this battle" },
    { name: "The Correction", fx: "The Fade's next counterattack is negated" }
  ],
  eli: [
    { name: "Open Palm", fx: "+6 Hope and heal himself 6 HP" },
    { name: "Ledger Line", fx: "+1 Power Card pip" },
    { name: "Sleight", fx: "The Fade's next counterattack is negated" },
    { name: "Fair Measure", fx: "+5 damage on this hit" }
  ]
};
export const PACK_ITEMS = [
  { id: "brief", name: "Field Brief", fx: "+2 to hit on the first attack of every battle." },
  { id: "lunch", name: "Packed Lunch", fx: "After each battle, the most-wounded standing hero heals 6 HP." },
  { id: "ballots", name: "Extra Ballots", fx: "The Power Card starts the run at 1 pip, and Canvass grants +1 additional pip." },
  { id: "thermos", name: "Coffee Thermos", fx: "+8 Hope at the start of every battle." },
  { id: "aid", name: "First-Aid Kit", fx: "Once per run, a hero who would fall is instead left standing at 10 HP — the save is announced in the log, and the kit is then spent." }
];

// ---------- Hero sheet data (floors / caps / defaults off the shipped sheets) ----------
function S(floor, cap, def) { return { floor: floor, cap: cap, def: def }; }
export const HEROES = {
  maya: {
    className: "Ranger", age: "22 · Barista & gig driver",
    intro: "Two jobs, one car, rent due on the 1st. When gas jumped from under $3 to over $4.50 a gallon in spring 2026, her second job stopped paying for itself.",
    perk: "Fights for: a cost of living she can outrun — and a future her generation gets to shape, not just inherit.",
    deathBlow: "The Archer's Eye", deathBlowNote: "opens under 15 boss HP",
    capNote: "Ranger caps: strength tops out at 12 and magic stays low — her power is aim, nerve, and knowing the ground.",
    sliders: { str: S(4, 12, 9), dex: S(8, 16, 14), con: S(5, 12, 10), int: S(5, 12, 10), wis: S(7, 15, 13), cha: S(4, 11, 8), mag: S(2, 7, 4), heal: S(2, 8, 5) }
  },
  dre: {
    className: "Warrior", age: "23 · Warehouse associate",
    intro: "His plant froze hiring when borrowing costs spiked. He watches freight, fertilizer and parts arrive late and expensive — and wonders who decided this was normal.",
    perk: "Fights for: work that exists, pays fairly, and lets a young worker build toward a future of his own.",
    deathBlow: "The Axeman's Ledger", deathBlowNote: "opens under 10 boss HP (he must close the distance)",
    capNote: "Warrior caps: strength tops out at 12 and constitution runs highest in the band — books and spells were never his department.",
    sliders: { str: S(8, 12, 12), dex: S(4, 11, 8), con: S(8, 15, 13), int: S(3, 9, 6), wis: S(4, 10, 7), cha: S(5, 12, 9), mag: S(1, 5, 2), heal: S(2, 7, 4) }
  },
  priya: {
    className: "Healer", age: "24 · Recent grad, 200+ applications",
    intro: "Did everything right, graduated into a hiring freeze and a 6.5% mortgage world where the promised future is a rumor. She reads the fine print — all of it.",
    perk: "Fights for: a future that keeps its promises — education that leads somewhere, and a voice that is counted, out loud.",
    deathBlow: "The Healer's Verdict", deathBlowNote: "opens under 15 boss HP, on alternate battles",
    capNote: "Healer caps: strength tops out at 8 — but intelligence, magic and healing run higher than anyone else in the band.",
    sliders: { str: S(3, 8, 7), dex: S(4, 11, 9), con: S(5, 11, 9), int: S(8, 16, 14), wis: S(8, 15, 13), cha: S(7, 15, 12), mag: S(8, 17, 14), heal: S(9, 18, 15) }
  },
  marc: {
    className: "Builder", age: "23 · Apprentice electrician",
    intro: "Marc wires new buildings all day and watches his generation get priced out of ever living in them. He is done watching. He swings for a future his hands helped raise — and for leaders who let builders build.",
    perk: "True Measure — Marc's strikes ring true against The Fade's borrowed machines: +2 to hit and damage in Blowback-tagged battles.",
    deathBlow: "The Builder's Measure", deathBlowNote: "opens under 15 boss HP",
    capNote: "Builder caps: strength and constitution run to 16 — hands and back are the build. Dexterity tops out at 10 and magic at 4: the toolbox, not the spellbook.",
    sliders: { str: S(8, 16, 13), dex: S(4, 10, 9), con: S(8, 16, 13), int: S(4, 11, 9), wis: S(5, 12, 10), cha: S(4, 10, 9), mag: S(1, 4, 3), heal: S(2, 8, 5) }
  },
  sana: {
    className: "Herald", age: "22 · Community-radio host & library page",
    intro: "Sana reads the public record into a microphone every morning — the actual record, with dates. She has watched sound bites bury it for years. She fights so her generation hears itself think — and votes on what it heard, not what it was fed.",
    perk: "Signal Carried — Sana's correct answers also restore +2 Hope (the signal gets through): and +2 to hit and damage in Sound Bite-tagged battles.",
    deathBlow: "The Herald's Correction", deathBlowNote: "opens under 15 boss HP, on alternate battles",
    capNote: "Herald caps: charisma tops the whole band at 17 — the voice is the instrument. Strength tops out at 8: she wins arguments, not arm-wrestles.",
    sliders: { str: S(3, 8, 7), dex: S(5, 12, 10), con: S(4, 11, 9), int: S(7, 15, 12), wis: S(6, 14, 11), cha: S(8, 17, 13), mag: S(4, 13, 9), heal: S(2, 10, 6) }
  },
  eli: {
    className: "Keeper", age: "24 · Keeper of his family's corner market",
    intro: "Eli opens the market at five every morning and pays the tariff toll at his own loading dock — he can show you the receipts. He rings the bell anyway — the call carries over Alder Creek, and the town gathers. He fights for a future where a young keeper can keep a shop, a street, and a say.",
    perk: "Fair Weight — Eli weighs The Fade's war economy to the ounce: +2 to hit and damage in War Chest-tagged battles.",
    deathBlow: "The Keeper's Reckoning", deathBlowNote: "opens under 10 boss HP (he must get to the dock)",
    capNote: "Keeper caps: dexterity tops the whole band at 17 — quick hands at the till, the dock and the bell rope. Strength tops out at 10: the bell is rung to gather the town; it doesn't batter anything down.",
    sliders: { str: S(4, 10, 9), dex: S(8, 17, 13), con: S(5, 12, 10), int: S(5, 13, 10), wis: S(4, 11, 9), cha: S(7, 15, 12), mag: S(2, 7, 5), heal: S(2, 9, 6) }
  }
};

// ---------- Forge classes ----------
// The six shipped classes reuse their hero's exact slider table.
// Fighter / Magician / Paladin have no shipped hero: their tables
// are derived in the game's pattern (same floor/cap style, pools
// inside the shipped 61-93 band; Paladin's pool is 81) and are
// labeled "Forge class" wherever they appear.
export const FORGE_CLASSES = ["Fighter", "Healer", "Magician", "Paladin", "Ranger", "Warrior", "Builder", "Herald", "Keeper"];
export const CLASS_TABLES = {
  Ranger: { forge: false, hero: "maya", sliders: HEROES.maya.sliders },
  Warrior: { forge: false, hero: "dre", sliders: HEROES.dre.sliders },
  Healer: { forge: false, hero: "priya", sliders: HEROES.priya.sliders },
  Builder: { forge: false, hero: "marc", sliders: HEROES.marc.sliders },
  Herald: { forge: false, hero: "sana", sliders: HEROES.sana.sliders },
  Keeper: { forge: false, hero: "eli", sliders: HEROES.eli.sliders },
  Fighter: {
    forge: true, hero: null,
    sliders: { str: S(8, 14, 12), dex: S(5, 12, 9), con: S(7, 14, 12), int: S(3, 9, 6), wis: S(4, 11, 8), cha: S(4, 11, 8), mag: S(1, 5, 3), heal: S(2, 8, 5) }
  },
  Magician: {
    forge: true, hero: null,
    sliders: { str: S(3, 8, 6), dex: S(5, 12, 9), con: S(4, 10, 8), int: S(8, 17, 14), wis: S(7, 15, 12), cha: S(6, 13, 10), mag: S(9, 18, 15), heal: S(3, 10, 6) }
  },
  Paladin: {
    forge: true, hero: null,
    sliders: { str: S(7, 14, 12), dex: S(4, 11, 8), con: S(7, 14, 12), int: S(5, 12, 9), wis: S(7, 14, 12), cha: S(7, 15, 12), mag: S(5, 13, 9), heal: S(5, 13, 7) }
  }
};
// ---------- Forged-character weapons (3 choices) ----------
// Every character carries THREE weapons, like the heroes:
// the ones they forged, with any blank slot filled from their
// class's shipped WEAPONS list. Shipped classes fill from
// their own hero's list; the Forge classes fill from a mapped
// hero's list (Fighter->Warrior, Magician->Herald,
// Paladin->Healer). Fills are computed at render — they are
// never written back to the character doc.
export const FORGE_CLASS_HERO = { Fighter: "dre", Magician: "sana", Paladin: "priya" };
export function classWeaponList(className) {
  const t = CLASS_TABLES[className];
  const heroKey = (t && t.hero) || FORGE_CLASS_HERO[className] || "dre";
  return WEAPONS[heroKey] || [];
}
// The character's three effective weapons: forged entries
// first (from the weapons array; a legacy doc's single
// weaponName/weaponDie IS slot 1), then class-list fills for
// the blanks, never repeating a name already used. Always
// exactly 3 entries: { name, die, forged }.
export function effectiveWeapons(c) {
  const slots = [{ name: "", die: null }, { name: "", die: null }, { name: "", die: null }];
  if (c && Array.isArray(c.weapons)) {
    for (let i = 0; i < 3; i++) {
      const w = c.weapons[i];
      if (w && w.name && String(w.name).trim()) {
        slots[i] = { name: String(w.name).trim(), die: w.die != null ? +w.die : null };
      }
    }
  }
  if (!slots[0].name && c && c.weaponName && String(c.weaponName).trim()) {
    slots[0] = { name: String(c.weaponName).trim(), die: c.weaponDie != null ? +c.weaponDie : null };
  }
  const used = new Set();
  const out = [null, null, null];
  slots.forEach((s, i) => {
    if (!s.name) return;
    const key = s.name.toLowerCase();
    if (used.has(key)) return; // a repeated forged name leaves the slot to the class fill
    used.add(key);
    out[i] = { name: s.name, die: s.die != null ? s.die : 8, forged: true };
  });
  const fills = classWeaponList(c && c.class).filter((w) => !used.has(w.name.toLowerCase()));
  let f = 0;
  for (let i = 0; i < 3; i++) {
    if (out[i]) continue;
    const fill = fills[f++];
    if (fill) { used.add(fill.name.toLowerCase()); out[i] = { name: fill.name, die: fill.die, forged: false }; }
  }
  return out.filter(Boolean);
}

// ---------- Campaigns of Friends tales ----------
// A forged character's three backstory tales live on the doc:
//   tales: [ { move, text } x3 ] | null
// The move names ARE the three effective weapons' names. The
// tales arrive as one JSON file in Kendo's return set (see
// talesFileName); this is the shape gate for that file.
export function validateTales(v) {
  if (!v || !Array.isArray(v.tales)) return { ok: false, error: "no \"tales\" array" };
  if (v.tales.length !== 3) return { ok: false, error: "\"tales\" has " + v.tales.length + " entries — exactly 3 needed" };
  const tales = [];
  for (let i = 0; i < 3; i++) {
    const t = v.tales[i];
    if (!t || typeof t.move !== "string" || typeof t.text !== "string" || !t.move.trim() || !t.text.trim()) {
      return { ok: false, error: "tale " + (i + 1) + " needs a non-empty \"move\" and \"text\"" };
    }
    tales.push({ move: t.move.trim(), text: t.text });
  }
  return { ok: true, tales: tales };
}
export function parseTalesJson(text) {
  let v;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, error: "not valid JSON (" + e.message + ")" }; }
  return validateTales(v);
}

// ---------- Camp actions (see CAMP-ACTION-SPEC.md) ----------
// Every forged character carries their OWN camp action on the
// doc:  campAction: { kind, name, text }  (absent on docs forged
// before this feature). The kind is one of the game engine's
// seven executable camp effects — the same seven gifts the
// shipped band carries, verified against the game's camp code.
// The player picks a kind by what it DOES (the "does" lines
// below, in plain words) and gives it their own name and one
// line of flavor; the kind underneath is what the game runs.
// Chosen in the Forge form and REQUIRED there — a character
// cannot be forged without one. Like deathBlow / perk /
// description it is written once, at creation; no app surface
// edits it afterwards, so creation is where it solidifies.
// Characters forged before this feature have no campAction:
// effectiveCampAction() resolves their class-pattern gift at
// read time instead (never written back — the same rule
// effectiveWeapons follows), and the game does the same.
export const CAMP_NAME_MAX = 60;
export const CAMP_TEXT_MAX = 200;
export const CAMP_ACTION_KINDS = [
  { kind: "heal", pattern: "Healing Hands", hero: "Priya the Healer",
    does: "Pick one hero in the band — even a downed one — and heal them: roll a d4, add 3, add the healer's own Healing bonus. A downed hero who is healed stands back up." },
  { kind: "inspiration", pattern: "Blessing of the Dawn", hero: "Priya the Healer",
    does: "Roll a d4. The next hero sent into battle gains that much Inspiration — a bonus on their attack rolls for the whole coming battle." },
  { kind: "omen", pattern: "Scout's Omen", hero: "Maya the Ranger",
    does: "Roll a d4 of Inspiration for the next hero sent in, and scout the road ahead: you learn the coming battle's aspect — and which move answers it." },
  { kind: "brace", pattern: "Sharpen & Brace", hero: "Dre the Warrior",
    does: "The next hero sent into battle is sharpened and braced: +2 to hit and +2 Defense for the coming battle. No die roll — it simply works." },
  { kind: "mend", pattern: "Mend & Make", hero: "Marc the Builder",
    does: "Mend the most-wounded standing hero for up to 6 HP, and brace the line: the next hero sent in gains +2 Defense for the coming battle." },
  { kind: "signal", pattern: "Signal Boost", hero: "Sana the Herald",
    does: "Boost the signal: in the next battle, every correct answer also raises the band's Voice by +2." },
  { kind: "till", pattern: "Open the Till", hero: "Eli the Keeper",
    does: "The band gains Voice right away (+6), and the next battle's first correct answer charges the answering hero's Power Card one extra pip." }
];
export function campActionKind(kind) {
  return CAMP_ACTION_KINDS.find((k) => k.kind === kind) || null;
}
// The shape gate for a camp action, in the validateTales style.
// On success returns exactly the three fields, trimmed; the
// Forge form calls this as its required-field gate, and every
// reader (sheet, export, game import contract) reads through
// the same normalization.
export function validateCampAction(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "no camp action — pick a kind and give it a name and a line" };
  const def = campActionKind(v.kind);
  if (!def) return { ok: false, error: "unknown camp-action kind " + JSON.stringify(v.kind == null ? null : String(v.kind)) };
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const text = typeof v.text === "string" ? v.text.trim() : "";
  if (!name) return { ok: false, error: "the camp action needs a name" };
  if (name.length > CAMP_NAME_MAX) return { ok: false, error: "the camp action's name is over " + CAMP_NAME_MAX + " characters" };
  if (!text) return { ok: false, error: "the camp action needs its one line of flavor" };
  if (text.length > CAMP_TEXT_MAX) return { ok: false, error: "the camp action's line is over " + CAMP_TEXT_MAX + " characters" };
  return { ok: true, campAction: { kind: def.kind, name: name, text: text } };
}
// Each shipped hero's class-pattern camp gift. Priya carries two
// gifts in the game (Healing Hands and Blessing of the Dawn);
// her pattern gift — the one her printed sheet names, and the
// one a forged Healer falls back to — is Healing Hands.
export const HERO_CAMP_GIFTS = {
  maya: { kind: "omen", name: "Scout's Omen" },
  dre: { kind: "brace", name: "Sharpen & Brace" },
  priya: { kind: "heal", name: "Healing Hands" },
  marc: { kind: "mend", name: "Mend & Make" },
  sana: { kind: "signal", name: "Signal Boost" },
  eli: { kind: "till", name: "Open the Till" }
};
// The camp action a character brings to a run: their own forged
// one when the doc carries a valid one (forged: true); otherwise
// their class pattern's gift, resolved through CLASS_TABLES /
// FORGE_CLASS_HERO exactly like classWeaponList (forged:
// false). The fallback is computed, never stored on the doc.
export function effectiveCampAction(c) {
  if (c) {
    const v = validateCampAction(c.campAction);
    if (v.ok) return { kind: v.campAction.kind, name: v.campAction.name, text: v.campAction.text, forged: true };
  }
  const t = c && CLASS_TABLES[c.class];
  const heroKey = (t && t.hero) || (c && FORGE_CLASS_HERO[c.class]) || "dre";
  const gift = HERO_CAMP_GIFTS[heroKey] || HERO_CAMP_GIFTS.dre;
  const def = campActionKind(gift.kind);
  return { kind: gift.kind, name: gift.name, text: def ? def.does : "", forged: false };
}

export function classPool(className) {
  const t = CLASS_TABLES[className];
  if (!t) return 0;
  return STAT_KEYS.reduce((s, k) => s + t.sliders[k].def, 0);
}
export function defaultSliders(className) {
  const t = CLASS_TABLES[className];
  const o = {};
  if (t) for (const k of STAT_KEYS) o[k] = t.sliders[k].def;
  return o;
}

// ---------- The sketch brief ----------
// Composed from the character's own fields plus the shipped
// portraits' style language (gray graphite on off-white paper,
// full body in a dynamic attack stance, no color, no background
// scene, no text — the style constants recorded for the 18).
export function composeBrief(c) {
  const lines = [];
  lines.push("Gray pencil sketch of " + c.name + " in a full attack stance — full body, head to boots, in a dynamic action pose.");
  lines.push("Style: gray graphite/pencil rendering on plain off-white paper, matching the shipped Power Card portraits exactly — same paper, same graphite hand, same full-body stance framing. NO color anywhere in the drawing (skin is blank or lightly shaded paper). No background scene. No text in the drawing. Portrait framing, 1000x2000, WebP.");
  const who = [];
  if (c.race) who.push(c.race);
  if (c.class) who.push(c.class);
  if (who.length) lines.push("Character: " + c.name + " — " + who.join(" ") + ".");
  if (c.description) lines.push("About them: " + c.description);
  if (c.pose) lines.push("Pose: " + c.pose);
  const hold = [];
  if (c.holding) hold.push(c.holding);
  if (c.weaponName) hold.push("weapon: " + c.weaponName + (c.weaponDie ? " (1d" + c.weaponDie + ")" : ""));
  if (hold.length) lines.push("Holding: " + hold.join(" · "));
  const attires = attireDescriptions(c);
  if (attires) {
    lines.push("Attire 1 (main outfit): " + attires[0]);
    lines.push("Attire 2: " + (attires[1] || "creator's choice, in character"));
    lines.push("Attire 3: " + (attires[2] || "creator's choice, in character"));
    lines.push("Draw all three attires for this same character — same person, same stance energy, three outfits — one portrait per attire.");
  }
  const wnames = effectiveWeapons(c).map((w) => w.name);
  lines.push("Campaigns tales: also write this character's three Campaigns of Friends tales — one backstory tale for each of their three weapons: " + wnames.join(" · ") + ". Each tale is a short medieval scrolling backstory — an adventure with their band of friends, won with that weapon — and each tale ends with the vote weave: the distinctly-worded closing that ties the tale to casting a vote, the way every hero's tales end. Return the tales in the tales JSON file named in the batch's return contract.");
  return lines.join("\n");
}
// The character's three attire descriptions as [a1, a2, a3]
// ("" where undescribed). Newer characters store attiresDesc;
// a legacy character's single outfit field IS its Attire 1.
// Returns null when the character describes no attire at all.
export function attireDescriptions(c) {
  if (c && Array.isArray(c.attiresDesc) && c.attiresDesc.some((s) => (s || "").trim())) {
    return [0, 1, 2].map((i) => (c.attiresDesc[i] || "").trim());
  }
  if (c && c.outfit && c.outfit.trim()) return [c.outfit.trim(), "", ""];
  return null;
}

// ---------- Forged-character portrait sets ----------
// A completed forged character carries THREE attire slots,
// each with its own portrait + skin mask + hair mask in
// Storage — the same art set a shipped hero has. Paths live
// on the character doc:
//   attires: [ { portraitPath, skinMaskPath, hairMaskPath } x3 ]
// portraitSetComplete flips true only when all nine exist.
export function emptyAttires() {
  return [0, 1, 2].map(() => ({ portraitPath: null, skinMaskPath: null, hairMaskPath: null }));
}
export function normalizeAttires(c) {
  const out = emptyAttires();
  const arr = c && Array.isArray(c.attires) ? c.attires : [];
  for (let i = 0; i < 3; i++) {
    const s = arr[i] || {};
    out[i] = {
      portraitPath: s.portraitPath || null,
      skinMaskPath: s.skinMaskPath || null,
      hairMaskPath: s.hairMaskPath || null
    };
  }
  return out;
}
const SET_PARTS = [["portrait", "portraitPath"], ["skin mask", "skinMaskPath"], ["hair mask", "hairMaskPath"]];
// Completeness of a 3-attire set against the nine-file goal.
// missing names each absent part ("attire2 skin mask") so
// partial returns can be reported by name.
export function attireSetStatus(attires) {
  const slots = normalizeAttires({ attires: attires });
  const missing = [];
  let landed = 0;
  slots.forEach((s, i) => {
    for (const [label, field] of SET_PARTS) {
      if (s[field]) landed++;
      else missing.push("attire" + (i + 1) + " " + label);
    }
  });
  return { complete: landed === 9, landed: landed, missing: missing };
}
// The nine file names Kendo returns for one character:
// <docId>--attireN.webp portraits, <docId>--attireN-skin.webp
// and <docId>--attireN-hair.webp masks.
export function returnFileNames(docId) {
  const names = [];
  for (let n = 1; n <= 3; n++) {
    names.push(docId + "--attire" + n + ".webp");
    names.push(docId + "--attire" + n + "-skin.webp");
    names.push(docId + "--attire" + n + "-hair.webp");
  }
  return names;
}
// The tenth return item: the character's tales JSON file.
export function talesFileName(docId) {
  return docId + "--tales.json";
}
// Parse one returned file's name. Set part ->
// { docId, kind: "portrait"|"skin"|"hair", attire: 1|2|3 };
// the tales file -> { docId, kind: "tales" };
// a bare "<docId>" name -> { kind: "lone" } (the interim
// single portrait). Anything else -> null.
export function parseReturnFilename(fileName) {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  const tm = base.match(/^(.+?)--tales$/);
  if (tm) return { docId: tm[1], kind: "tales", attire: null };
  const m = base.match(/^(.+?)--attire([123])(?:-(skin|hair))?$/);
  if (m) return { docId: m[1], kind: m[3] || "portrait", attire: parseInt(m[2], 10) };
  if (base && !base.includes("--")) return { docId: base, kind: "lone", attire: null };
  return null;
}

// ---------- Roll20 bridge export (see roll20/EXPORT-FORMAT.md) ----------
// The export is a PROJECTION of the character doc, not a new
// model — with two conversions the doc shape forces on us:
// spellPicks are stored as numeric indices into the shipped
// class's SPELLS list, and packPicks as PACK_ITEMS ids; the
// blob carries NAMES for both. Derived modifiers are not
// exported — the importer recomputes them with modifier().
// Base64url is UTF-8 safe both ways (names and tales carry
// apostrophes and punctuation that must survive the paste).
export function b64urlEncodeUtf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecodeUtf8(s) {
  let b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export function buildRoll20Export(c, characterId) {
  const t = CLASS_TABLES[c.class];
  const heroKey = t && t.hero;
  // The character's own camp action rides the export, validated
  // (see CAMP-ACTION-SPEC.md); null for legacy docs that carry
  // none — the importer prints no Camp Action line for those.
  const campV = validateCampAction(c.campAction);
  const spells = heroKey && Array.isArray(c.spellPicks)
    ? c.spellPicks.map((i) => (SPELLS[heroKey][i] || {}).name).filter(Boolean)
    : [];
  const pack = Array.isArray(c.packPicks)
    ? c.packPicks.map((id) => (PACK_ITEMS.find((p) => p.id === id) || {}).name).filter(Boolean)
    : [];
  const sliders = {};
  for (const k of STAT_KEYS) sliders[k] = c.sliders ? +c.sliders[k] : 0;
  return {
    name: c.name || "",
    characterId: characterId || "",
    "class": c.class || "",
    race: c.race || "",
    sliders: sliders,
    weapons: effectiveWeapons(c).map((w) => ({ name: w.name, die: w.die })),
    spellPicks: spells,
    packPicks: pack,
    deathBlow: c.deathBlow || "",
    perk: c.perk || "",
    campAction: campV.ok ? campV.campAction : null,
    description: c.description || ""
  };
}
export function roll20ImportLine(c, characterId) {
  return "!forge " + b64urlEncodeUtf8(JSON.stringify(buildRoll20Export(c, characterId)));
}

// ---------- Game-night Campaigns (see CAMPAIGNS-SPEC.md) ----------
// Campaign dates are stored as "YYYY-MM-DD" strings (the
// value of a date input), which makes exact-day search and
// range search plain string comparisons.
export function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}
// The Campaigns menu search: date filters bite at campaign
// level; the human / character filters bite at roster-entry
// level — a campaign survives a text filter only if one of
// its entries matches, and only the matching entries are
// returned with it (that is what the list view shows).
export function filterCampaigns(campaigns, f) {
  const human = (f.human || "").trim().toLowerCase();
  const character = (f.character || "").trim().toLowerCase();
  const out = [];
  for (const camp of campaigns || []) {
    const dp = camp.datePlayed || "";
    if (f.date && dp !== f.date) continue;
    if (f.from && dp < f.from) continue;
    if (f.to && dp > f.to) continue;
    let entries = Array.isArray(camp.roster) ? camp.roster.slice() : [];
    if (human) entries = entries.filter((e) => (e.humanName || "").toLowerCase().includes(human));
    if (character) entries = entries.filter((e) => (e.characterName || "").toLowerCase().includes(character));
    if ((human || character) && !entries.length) continue;
    out.push({ campaign: camp, entries: entries });
  }
  return out;
}
// The Play button's payload: ONE text block — campaign name,
// date, and for every roster entry the human, the character,
// the doc ID and that character's Roll20 import line. A null
// line means the sheet could not be loaded; the prompt says
// so honestly instead of silently dropping the player.
export function buildSetupPrompt(camp, entries) {
  const lines = [];
  lines.push("KENDO — GAME-NIGHT SETUP");
  lines.push("Campaign: " + camp.name);
  lines.push("Date: " + prettyDate(camp.datePlayed) + " (" + (camp.datePlayed || "") + ")");
  lines.push("");
  lines.push("Set up this night in Roll20, in the game named \"" + camp.name + "\":");
  lines.push("1. Install the ForgeImporter script (!forge) if the game doesn't have it yet.");
  lines.push("2. For each character below, paste its !forge line into the Roll20 chat to import the sheet.");
  lines.push("3. Attach each character's Forge sketch portrait to its sheet by hand (Edit -> Avatar) — scripts can't upload images.");
  lines.push("4. Make each character controllable by its human, as far as the night allows.");
  lines.push("When everything is set up, say READY in the chat.");
  lines.push("");
  (entries || []).forEach((e, i) => {
    lines.push((i + 1) + ". " + e.humanName + " plays " + e.characterName);
    lines.push("   Forge character doc ID: " + e.characterId);
    if (e.line) {
      lines.push("   Roll20 import line:");
      lines.push(e.line);
    } else {
      lines.push("   Roll20 import line: UNAVAILABLE — this sheet could not be loaded from the Forge (it is no longer shared with Mike). Ask " + e.humanName + " to push it again from their sheet, then re-run Play.");
    }
    lines.push("");
  });
  return lines.join("\n");
}
// The next-day group email, assembled IN THE APP from the
// campaign record + highlights — a fixed template, no
// external AI call. Mike edits freely in his mail program.
export function buildDraftEmail(camp) {
  const subject = camp.name + " — game night recap (" + prettyDate(camp.datePlayed) + ")";
  const who = (camp.roster || []).map((e) => "- " + e.humanName + " played " + e.characterName).join("\n");
  const body = [
    "Hi everyone,",
    "",
    "Thanks for playing " + camp.name + " on " + prettyDate(camp.datePlayed) + "!",
    "",
    "Who played:",
    who || "- (the roster was empty)",
    "",
    "What went down:",
    (camp.highlights && camp.highlights.trim()) || "(Mike — the night's highlights go here.)",
    "",
    "The final boss battle:",
    "(Mike — a line or two about how the boss fight went.)",
    "",
    "The end scene:",
    "(Mike — how the night ended, and any walk-off outcomes.)",
    "",
    "See you at the next game night!"
  ].join("\n");
  return { subject: subject, body: body };
}
export function buildMailtoHref(camp) {
  const d = buildDraftEmail(camp);
  const to = (camp.emails || []).join(",");
  return "mailto:" + to + "?subject=" + encodeURIComponent(d.subject) + "&body=" + encodeURIComponent(d.body);
}
export function parseEmailList(text) {
  return String(text || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

// ---------- Session credits pushes (see SESSION-CREDITS-PUSH-SPEC.md) ----------
// After a tabletop run, the DM Guide writes one doc per player
// to the session_pushes collection: { playerEmail,
// characterName, sessionDate ("YYYY-MM-DD", the Campaigns
// date convention), sessionLabel, dmName, creditsUrl,
// pushedAt }. CONTRACT v2 adds two OPTIONAL fields:
// characterId — the Forge character document ID, the push's
// identity — and playedAs, the name the character played
// under that one night when it differed from the true name.
// characterName always carries the character's TRUE (Stable)
// name; a playedAs label never renames the sheet. The Forge
// only READS pushes: they land on that character's own sheet
// as its Campaign adventures history — matched by characterId
// when the push carries one (identity wins), falling back to
// the true name for legacy v1 pushes. These helpers are the
// shape gate and the grouping / sorting the sheet renders
// from — pure, so the headless tests exercise them without
// Firebase.
// Names are plain JS strings in a Map (never a plain object),
// so Unicode names and names like "__proto__" are safe keys.
// A Firestore Timestamp's millis, however it arrives: a plain
// number, a Date, a Timestamp-like { seconds, nanoseconds },
// an object with toMillis(), or a parseable date string.
// Anything unrecognized counts as 0 (sorts oldest).
export function pushTimeMs(v) {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v instanceof Date) return v.getTime() || 0;
  if (typeof v === "object") {
    if (typeof v.toMillis === "function") {
      try { const ms = v.toMillis(); return typeof ms === "number" && isFinite(ms) ? ms : 0; } catch (e) { return 0; }
    }
    if (typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  return 0;
}
// The shape gate for one push doc, in the validateTales
// style: text fields must be non-empty strings (returned
// trimmed), the email must look like one, the date must be
// YYYY-MM-DD, and the credits link must be http(s). The
// normalized entry also carries pushedAtMs for sorting.
const PUSH_TEXT_FIELDS = ["playerEmail", "characterName", "sessionDate", "sessionLabel", "dmName", "creditsUrl"];
export function validatePushEntry(p) {
  if (!p || typeof p !== "object") return { ok: false, error: "not an object" };
  const entry = {};
  for (const f of PUSH_TEXT_FIELDS) {
    if (typeof p[f] !== "string" || !p[f].trim()) {
      return { ok: false, error: "missing or empty \"" + f + "\"" };
    }
    entry[f] = p[f].trim();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.playerEmail)) {
    return { ok: false, error: "playerEmail is not an email address" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.sessionDate)) {
    return { ok: false, error: "sessionDate is not YYYY-MM-DD" };
  }
  if (!/^https?:\/\//i.test(entry.creditsUrl)) {
    return { ok: false, error: "creditsUrl is not an http(s) link" };
  }
  // v2 optionals: absent is fine (a v1 push); present means
  // well-formed — a bad ID or label drops the whole push, the
  // same way a bad required field does. Bounds mirror the
  // firestore.rules shape gate (characterId 1-128 chars,
  // playedAs 1-80 chars).
  if (p.characterId != null) {
    if (typeof p.characterId !== "string") {
      return { ok: false, error: "characterId is not a string" };
    }
    const cid = p.characterId.trim();
    if (!cid || cid.length > 128) {
      return { ok: false, error: "characterId must be 1-128 characters" };
    }
    entry.characterId = cid;
  }
  if (p.playedAs != null) {
    if (typeof p.playedAs !== "string") {
      return { ok: false, error: "playedAs is not a string" };
    }
    const pa = p.playedAs.trim();
    if (!pa || pa.length > 80) {
      return { ok: false, error: "playedAs must be 1-80 characters" };
    }
    entry.playedAs = pa;
  }
  entry.pushedAt = p.pushedAt != null ? p.pushedAt : null;
  entry.pushedAtMs = pushTimeMs(p.pushedAt);
  return { ok: true, entry: entry };
}
// Newest first: pushedAt decides; ties fall to the session
// date (newest first), then the label, so the order is
// fully deterministic.
function pushSortMs(p) {
  if (!p) return 0;
  if (typeof p.pushedAtMs === "number") return p.pushedAtMs;
  return pushTimeMs(p.pushedAt);
}
export function comparePushesNewestFirst(a, b) {
  const dt = pushSortMs(b) - pushSortMs(a);
  if (dt) return dt;
  const da = String((a && a.sessionDate) || ""), db = String((b && b.sessionDate) || "");
  if (da !== db) return da < db ? 1 : -1;
  return String((a && a.sessionLabel) || "").localeCompare(String((b && b.sessionLabel) || ""));
}
export function sortPushesNewestFirst(pushes) {
  return (pushes || []).slice().sort(comparePushesNewestFirst);
}
// Group raw push docs by character name (the key is the
// validated, trimmed characterName). Docs that fail the
// shape gate are dropped — a malformed push must never break
// a sheet. Each group's entries come back newest first.
export function groupPushesByCharacter(pushes) {
  const byChar = new Map();
  for (const p of pushes || []) {
    const v = validatePushEntry(p);
    if (!v.ok) continue;
    if (!byChar.has(v.entry.characterName)) byChar.set(v.entry.characterName, []);
    byChar.get(v.entry.characterName).push(v.entry);
  }
  for (const [k, arr] of byChar) byChar.set(k, sortPushesNewestFirst(arr));
  return byChar;
}
// The adventures of one character from a grouped map (the
// name is trimmed the same way grouping trims it; the match
// is otherwise exact, capitals included).
export function adventuresForCharacter(grouped, characterName) {
  if (!grouped || typeof grouped.get !== "function") return [];
  return grouped.get(String(characterName || "").trim()) || [];
}
// The v2 reader rule, over RAW push docs: a push carrying a
// characterId belongs to the character whose document ID it
// is — identity wins, and such a push NEVER falls back to a
// name match (a same-named stranger's push must not land on
// this sheet). A push with no characterId is a legacy v1
// push and files by its characterName against the doc's
// (trimmed) true name. Malformed pushes are dropped, as in
// grouping. Newest first.
export function adventuresForCharacterDoc(pushes, doc) {
  if (!doc) return [];
  const id = doc.id != null ? String(doc.id) : "";
  const name = String(doc.name || "").trim();
  const out = [];
  for (const p of pushes || []) {
    const v = validatePushEntry(p);
    if (!v.ok) continue;
    if (v.entry.characterId != null) {
      if (id && v.entry.characterId === id) out.push(v.entry);
    } else if (name && v.entry.characterName === name) {
      out.push(v.entry);
    }
  }
  return sortPushesNewestFirst(out);
}
