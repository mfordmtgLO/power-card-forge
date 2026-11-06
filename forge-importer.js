// ============================================================
// ForgeImporter — Roll20 Mod Script (DRAFT, prepared 2026-10-28)
// ------------------------------------------------------------
// One-way bridge from the Power Card Character Forge into a
// Roll20 campaign: a player (or Mike, as GM) pastes a single
// chat line produced by the Forge's "Copy for Roll20" export:
//
//     !forge <base64url-encoded JSON, see EXPORT-FORMAT.md>
//
// and this script creates the character sheet in the campaign:
// the character, its eight Forge sliders as attributes, HP,
// and a bio carrying class, race, weapons, spells, pack,
// Death Blow, camp action and description.
//
// HONEST LIMITS (by Roll20's design, not ours):
// - Mod Scripts cannot upload images. The sketch portrait is
//   attached by hand in the Roll20 web UI (one upload per
//   character) — or by Kendo working in the browser as Mike/GM.
//   The script therefore leaves avatar/token untouched and
//   says so in its confirmation message.
// - Scripts make no HTTP requests; the paste IS the transport.
// - Only the campaign CREATOR needs Roll20 Pro (to install
//   this script). Players need no Pro.
// - A sheet can only be assigned ("controlledby") to a player
//   who has joined the campaign at least once; the export may
//   carry controlledByPlayerId when Mike knows it, otherwise
//   assignment stays a one-click GM step in the UI.
//
// Status: draft for the quiet end-to-end test (install, one
// import, one sketch upload) before any game night. Not yet
// installed anywhere.
// ============================================================

var ForgeImporter = ForgeImporter || (function () {
    'use strict';

    var VERSION = '0.1.0-draft';

    function mod(v) {
        // The game's own derivation: (stat - 8) / 2, rounded, -2..+4.
        return Math.max(-2, Math.min(4, Math.round((v - 8) / 2)));
    }

    var STATS = [
        ['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'],
        ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma'],
        ['mag', 'Magic'], ['heal', 'Healing']
    ];

    function b64decode(s) {
        s = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) { s += '='; }
        // Roll20's sandbox has no atob; decode manually.
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var out = '', i, b, n = 0, bits = 0;
        for (i = 0; i < s.length; i++) {
            if (s[i] === '=') { break; }
            b = chars.indexOf(s[i]);
            if (b < 0) { continue; }
            bits = (bits << 6) | b; n += 6;
            if (n >= 8) { n -= 8; out += String.fromCharCode((bits >> n) & 0xff); }
        }
        return decodeURIComponent(escape(out)); // UTF-8 safe for names/tales
    }

    function setAttr(charId, name, current, max) {
        var attrs = findObjs({ type: 'attribute', characterid: charId, name: name });
        if (attrs.length) {
            attrs[0].set('current', current);
            if (max !== undefined) { attrs[0].set('max', max); }
        } else {
            var a = createObj('attribute', { characterid: charId, name: name, current: current });
            if (max !== undefined && a) { a.set('max', max); }
        }
    }

    function uniqueName(base) {
        var name = base, i = 2;
        while (findObjs({ type: 'character', name: name }).length) {
            name = base + ' (' + (i++) + ')';
        }
        return name;
    }

    function bioFor(c) {
        var lines = [];
        lines.push('<h3>' + c.name + '</h3>');
        if (c.class) { lines.push('<p><b>Class:</b> ' + c.class + (c.race ? ' &middot; <b>Race:</b> ' + c.race : '') + '</p>'); }
        if (c.description) { lines.push('<p>' + c.description + '</p>'); }
        if (c.weapons && c.weapons.length) {
            lines.push('<p><b>Weapons:</b><br>' + c.weapons.filter(function (w) { return w && w.name; })
                .map(function (w) { return w.name + (w.die ? ' (d' + w.die + ')' : ''); }).join('<br>') + '</p>');
        }
        if (c.spellPicks && c.spellPicks.length) { lines.push('<p><b>Spells:</b> ' + c.spellPicks.join(', ') + '</p>'); }
        if (c.packPicks && c.packPicks.length) { lines.push('<p><b>Pack:</b> ' + c.packPicks.join(', ') + '</p>'); }
        if (c.deathBlow) { lines.push('<p><b>Death Blow:</b> ' + c.deathBlow + '</p>'); }
        if (c.perk) { lines.push('<p><b>Perk:</b> ' + c.perk + '</p>'); }
        if (c.campAction && c.campAction.name) { lines.push('<p><b>Camp Action:</b> ' + c.campAction.name + (c.campAction.text ? ' — ' + c.campAction.text : '') + '</p>'); }
        if (c.characterId) { lines.push('<p><i>Forge character ID: ' + c.characterId + '</i></p>'); }
        lines.push('<p><i>Portrait: attach the Forge sketch by hand (Edit &rarr; Avatar) — scripts cannot upload images.</i></p>');
        return lines.join('\n');
    }

    function handle(msg) {
        if (msg.type !== 'api') { return; }
        var parts = msg.content.trim().split(/\s+/);
        var cmd = parts.shift();
        if (cmd === '!forge-help') {
            sendChat('ForgeImporter', '/w "' + msg.who + '" ForgeImporter ' + VERSION +
                ' — paste: !forge &lt;base64 export from the Forge&gt;. One character per paste.');
            return;
        }
        if (cmd !== '!forge') { return; }
        var payload = parts.join('');
        if (!payload) {
            sendChat('ForgeImporter', '/w "' + msg.who + '" Nothing to import — the !forge line needs the export text after it. In the Forge, use "Copy for Roll20" on the character sheet.');
            return;
        }
        var c;
        try { c = JSON.parse(b64decode(payload)); }
        catch (e) {
            sendChat('ForgeImporter', '/w "' + msg.who + '" That export did not decode. Re-copy it from the Forge in one piece and paste again — nothing was created.');
            return;
        }
        if (!c || !c.name || !c.sliders) {
            sendChat('ForgeImporter', '/w "' + msg.who + '" That export is missing a name or the slider block. Nothing was created.');
            return;
        }
        var ch = createObj('character', { name: uniqueName(String(c.name)) });
        if (!ch) {
            sendChat('ForgeImporter', '/w "' + msg.who + '" Roll20 refused to create the character. Nothing was imported.');
            return;
        }
        var id = ch.get('_id');
        STATS.forEach(function (st) {
            var v = parseInt(c.sliders[st[0]], 10);
            if (isNaN(v)) { return; }
            setAttr(id, st[0], v);
            setAttr(id, st[0] + '_mod', mod(v));
            setAttr(id, st[1], v); // long-name alias for hand-written macros
        });
        var hp = parseInt(c.hp, 10);
        if (!isNaN(hp)) { setAttr(id, 'hp', hp, hp); }
        ch.set('bio', bioFor(c));
        if (c.controlledByPlayerId) {
            // Only valid once that player has joined this campaign.
            try { ch.set('controlledby', String(c.controlledByPlayerId)); } catch (e) { /* GM assigns in UI */ }
        }
        sendChat('ForgeImporter', '/w "' + msg.who + '" Imported <b>' + ch.get('name') + '</b> (' +
            (c.class || 'character') + '). Sliders, HP and bio are on the sheet. ' +
            'One manual step remains: attach the sketch portrait (Edit &rarr; Avatar) — scripts cannot upload images.');
    }

    function register() {
        on('chat:message', handle);
        on('ready', function () {
            log('ForgeImporter ' + VERSION + ' ready. Paste a !forge export line to import a character.');
        });
    }

    return { register: register };
}());

ForgeImporter.register();
