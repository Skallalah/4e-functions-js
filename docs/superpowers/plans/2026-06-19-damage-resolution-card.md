# Damage Resolution Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, GM-resolved interactive chat card that lets the GM review each target's damage outcome (crit/hit/miss/true) after a multi-target attack, then apply all damage at once.

**Architecture:** A new static class `DamageCard4e` (`scripts/damage-card.js`) renders a chat card from a single source-of-truth flag stored on the `ChatMessage`. A pure `_html(flag)` function is used both at post time and after every mutation, so the DOM always matches the flag. A `renderChatMessage` hook wires GM-only toggle/apply clicks; application replays through the existing serialisable `Helper4e.damage(...)` chain. `Attack4e` gains an opt-in path that rolls damage once (normal + crit on the item path) and posts the card instead of applying.

**Tech Stack:** Plain ES2022 classes loaded as Foundry VTT module scripts (no bundler step, no module system — globals shared across files). Foundry v13, dnd4e system 0.7.14. No JS test runner exists; per-task gates are `node --check <file>` (syntax) plus manual verification inside Foundry.

## Global Constraints

- **Foundry v13 / dnd4e 0.7.14 only.** Reuse the system's existing card classes; do not invent CSS class names (a theme overlay restyles the dnd4e classes afterwards). Untyped/custom styling goes **inline**. No new `style.css`, no `module.json` `styles` entry.
- **All utility class methods MUST be static** (macro permission workaround).
- **Never bypass abstractions** — apply damage through `Helper4e.damage(...)`; read defences/images through `Character`, not raw `system`.
- **All UI text, comments, and JSDoc stay in English** — Foundry VTT runs in English here. No French in user-facing strings.
- **Complete JSDoc** on every method/param/return.
- Reuse the dnd4e chat-card structure: container `dnd4e chat-card item-card`, `card-header flexrow`, `card-content`, `card-footer`, `card-buttons`, and for target rows `dice-roll`/`dice-result`/`flavor-text target`/`mod-vs-def`/`attack-mod`/`vs-def`.
- The system binds a global `click` listener to `.card-buttons button` (`Item4e._onChatCardAction`). Every interactive control in this card MUST call `event.stopPropagation()` in its own listener so that handler never runs (it would disable the button and fail an item/actor lookup).

---

## File Structure

- `src/scripts/character.js` (modify) — add `getDefense(key)` and an `img` getter used by the card.
- `src/scripts/damage-card.js` (create) — `DamageCard4e`: render (`_html`), build/post (`post`), outcome derivation (`_outcome`), listeners (`activateListeners`, `_onToggle`, `_onApply`), and the `renderChatMessage` hook registration.
- `src/module.json` (modify) — register `scripts/damage-card.js`.
- `src/scripts/attack.js` (modify) — opt-in branch in `_runDamage` + new `_postResolutionCard`; document the new `applyDamage` options.

---

## Task 1: Character defence value + token image

**Files:**
- Modify: `src/scripts/character.js` (add two members near the other getters/readers, e.g. after `getAbilityMod` ~line 184)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Character#getDefense(key: 'ac'|'fort'|'ref'|'wil') => number` — numeric defence value.
  - `Character#img => string` — token texture src, falling back to the actor portrait.

- [ ] **Step 1: Add the two members**

In `src/scripts/character.js`, add inside the `Character` class (after `getAbilityMod`):

```javascript
    /**
     * Numeric value of one of the actor's defences.
     *
     * @param {'ac'|'fort'|'ref'|'wil'} key System defence key (note: Will is 'wil')
     * @returns {number} The defence value, or 0 if unavailable
     */
    getDefense(key) {
        return this.getSystem()?.defences?.[key]?.value ?? 0;
    }

    /**
     * Token image source for this character (falls back to the actor portrait).
     *
     * @returns {string}
     */
    get img() {
        const token = this._actor.getActiveTokens(true)?.[0];
        return token?.document?.texture?.src ?? this._actor.img;
    }
```

- [ ] **Step 2: Syntax gate**

Run: `node --check src/scripts/character.js`
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification (Foundry console)**

With a token selected on the canvas, run in the F12 console:

```javascript
const c = Character.fromToken(canvas.tokens.controlled[0].document);
console.log(c.img, c.getDefense('ref'), c.getDefense('ac'));
```

Expected: a texture path string and two numbers matching the token's sheet (Reflex, AC). `getDefense('wil')` returns the Will value.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/character.js
git commit -m "feat(character): add getDefense and token img getter"
```

---

## Task 2: DamageCard4e — render, build, post

**Files:**
- Create: `src/scripts/damage-card.js`
- Modify: `src/module.json` (add the script)

**Interfaces:**
- Consumes: `Character#name`, `Character#img`, `Character#getDefense`, `Character#id`, `Character#actor`; `Damage4e#total`, `Damage4e#parts`, `Damage4e#roll`; `AttackOutcome` shape (`{ target: Character, state: string, total: number, defense: string }`).
- Produces:
  - `DamageCard4e.post({caster, powerName, damageType, normal, crit, outcomes, halfOnMiss}) => Promise<ChatMessage>`
  - `DamageCard4e._html(flag) => string` (pure render)
  - `DamageCard4e._outcome(flag, target) => {parts, multiplier, bypass, amount}|null`
  - Flag shape under `message.flags['4e-functions-js'].damageCard` (see code).

- [ ] **Step 1: Create the file with constants, post, _outcome, and _html**

Create `src/scripts/damage-card.js`:

```javascript
/** Module flag scope for the damage resolution card. */
const DAMAGE_CARD_SCOPE = '4e-functions-js';
/** Flag key for the damage resolution card state. */
const DAMAGE_CARD_FLAG = 'damageCard';

/**
 * DamageCard4e — interactive, GM-resolved damage-application card.
 *
 * Posted after damage is rolled for a multi-target attack. The GM reviews each
 * target's outcome (crit/hit/miss/true), overrides as needed, then applies all
 * damage at once. All state lives in the ChatMessage flag, so the card
 * re-renders consistently and survives reloads.
 *
 * Theming: the markup reuses the dnd4e chat-card classes so a theme overlay can
 * restyle it; only untyped, layout-specific styling is inline. Interactive
 * controls call event.stopPropagation() so the system's `.card-buttons button`
 * handler (Item4e._onChatCardAction) never fires on them.
 */
class DamageCard4e {
    /**
     * @typedef {Object} DamageCardTarget
     * @property {string} characterId Character.id (actorId or actorId.tokenId)
     * @property {string} name
     * @property {string} img Token texture src
     * @property {number} attackTotal Attack roll total for this target
     * @property {string} defenseLabel Display label ('AC'|'Fort'|'Ref'|'Will')
     * @property {number} defenseValue Numeric defence value
     * @property {'crit'|'hit'|'miss'} origin Outcome the roll produced
     * @property {'crit'|'hit'|'miss'|'true'} selected Current GM choice
     */

    /**
     * @typedef {Object} DamageCardFlag
     * @property {boolean} resolved Whether damage has been applied (locked)
     * @property {string} powerName
     * @property {string} damageType
     * @property {{total: number, parts: Array<[number,string]>}} normal
     * @property {{total: number, parts: Array<[number,string]>}|null} crit
     * @property {boolean} halfOnMiss
     * @property {DamageCardTarget[]} targets
     */

    /** Map an AttackOutcome.defense to a display label and the system defence key. */
    static DEF = {
        ac:   { label: 'AC',   key: 'ac'  },
        fort: { label: 'Fort', key: 'fort' },
        ref:  { label: 'Ref',  key: 'ref' },
        will: { label: 'Will', key: 'wil' },
        wil:  { label: 'Will', key: 'wil' }
    };

    /** Map an AttackState string to the initial toggle key. */
    static ORIGIN = {
        critical: 'crit', hit: 'hit',
        miss: 'miss', fumble: 'miss', immune: 'miss', unknown: 'hit'
    };

    /**
     * Build and post the resolution card.
     *
     * @param {Object} config
     * @param {Character} config.caster Casting character (speaker + header image)
     * @param {string} config.powerName
     * @param {string} config.damageType Label for the header totals
     * @param {Damage4e} config.normal Rolled normal damage (.roll() awaited)
     * @param {Damage4e|null} config.crit Rolled crit damage, or null (formula path)
     * @param {Array<{target: Character, state: string, total: number, defense: string}>} config.outcomes
     * @param {boolean} [config.halfOnMiss=false]
     * @returns {Promise<ChatMessage>}
     */
    static async post({ caster, powerName, damageType, normal, crit, outcomes, halfOnMiss = false }) {
        const targets = outcomes.map(o => {
            const def = DamageCard4e.DEF[o.defense] ?? { label: '?', key: o.defense };
            const origin = DamageCard4e.ORIGIN[o.state] ?? 'hit';
            return {
                characterId: o.target.id,
                name: o.target.name,
                img: o.target.img,
                attackTotal: o.total,
                defenseLabel: def.label,
                defenseValue: o.target.getDefense(def.key),
                origin,
                selected: origin
            };
        });

        /** @type {DamageCardFlag} */
        const flag = {
            resolved: false,
            powerName,
            damageType,
            normal: { total: normal.total, parts: normal.parts },
            crit: crit?.roll ? { total: crit.total, parts: crit.parts } : null,
            halfOnMiss,
            targets
        };

        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: caster.actor }),
            flavor: powerName,
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }

    /**
     * Resolve a target's selected outcome into an application payload.
     *
     * @param {DamageCardFlag} flag
     * @param {DamageCardTarget} target
     * @returns {{parts: Array<[number,string]>, multiplier: number, bypass: boolean, amount: number}|null}
     *   null when nothing should be applied (a miss with no half-damage, or crit
     *   selected with no crit roll available).
     */
    static _outcome(flag, target) {
        switch (target.selected) {
            case 'crit':
                if (!flag.crit) return null;
                return { parts: flag.crit.parts, multiplier: 1, bypass: false, amount: flag.crit.total };
            case 'hit':
                return { parts: flag.normal.parts, multiplier: 1, bypass: false, amount: flag.normal.total };
            case 'true':
                return { parts: flag.normal.parts, multiplier: 1, bypass: true, amount: flag.normal.total };
            case 'miss':
                if (!flag.halfOnMiss) return null;
                return { parts: flag.normal.parts, multiplier: 0.5, bypass: false, amount: Math.floor(flag.normal.total / 2) };
            default:
                return null;
        }
    }

    /**
     * Pure render: flag -> HTML string. Used at post time and after every flag
     * mutation, so the rendered DOM always matches the flag.
     *
     * @param {DamageCardFlag} flag
     * @returns {string}
     */
    static _html(flag) {
        const half = Math.floor(flag.normal.total / 2);
        const detail = parts => parts.map(([v, t]) => `${v} ${t}`).join(' + ');

        const totalBlock = (label, data, key) => `
            <div class="dice-result" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="dice-total">${label}: ${data.total} ${flag.damageType}</span>
                <a data-detail="${key}" style="cursor:pointer;font-size:0.85em;opacity:0.8">▸ details</a>
                <span data-detail-for="${key}" style="display:none;font-size:0.85em;opacity:0.8">(${detail(data.parts)})</span>
            </div>`;

        const totals = `
            <div class="dice-roll">
                ${totalBlock('Normal', flag.normal, 'normal')}
                ${flag.crit ? totalBlock('Crit', flag.crit, 'crit') : ''}
            </div>`;

        const labels = {
            crit: 'CRIT', hit: 'HIT',
            miss: flag.halfOnMiss ? `MISS→${half}` : 'MISS',
            true: 'TRUE'
        };

        const rows = flag.targets.map((t, i) => {
            const buttons = ['crit', 'hit', 'miss', 'true'].map(k => {
                const disabled = (k === 'crit' && !flag.crit) || flag.resolved;
                let style = 'padding:1px 6px;font-size:0.8em;line-height:1.4;flex:0 0 auto;';
                if (t.selected === k) style += 'outline:2px solid #c9a227;outline-offset:-2px;font-weight:bold;';
                else if (t.origin === k) style += 'outline:1px dashed #999;outline-offset:-2px;';
                return `<button data-idx="${i}" data-key="${k}" style="${style}"${disabled ? ' disabled' : ''}>${labels[k]}</button>`;
            }).join('');

            return `
                <div class="dice-roll">
                    <div class="dice-result" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <img src="${t.img}" width="30" height="30" style="border:none;flex:0 0 auto"/>
                        <span class="flavor-text target" style="flex:0 0 auto">${t.name}</span>
                        <span class="mod-vs-def" style="flex:0 0 auto">(<span class="attack-mod">${t.attackTotal}</span> vs <span class="vs-def">${t.defenseLabel} ${t.defenseValue}</span>)</span>
                        <span class="card-buttons" style="margin-left:auto;display:flex;gap:3px;flex:0 0 auto">${buttons}</span>
                    </div>
                </div>`;
        }).join('');

        const footer = flag.resolved
            ? `<div style="text-align:center;font-weight:bold;opacity:0.8">✔ Damage applied</div>`
            : `<div class="card-buttons"><button class="dc-apply">⚔ Apply all damage</button></div>`;

        return `
            <div class="dnd4e chat-card item-card damage-card">
                <header class="card-header flexrow">
                    <div class="flexcol item-name"><h3>${flag.powerName} — Damage</h3></div>
                </header>
                <div class="card-content">
                    ${totals}
                    ${rows}
                </div>
                <footer class="card-footer">${footer}</footer>
            </div>`;
    }
}
```

- [ ] **Step 2: Register the script in module.json**

In `src/module.json`, add `"scripts/damage-card.js"` to the `scripts` array, immediately after `"scripts/attack.js"`:

```json
    "scripts/attack.js",
    "scripts/damage-card.js",
    "scripts/chat.js",
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/damage-card.js`
Expected: no output, exit 0.

- [ ] **Step 4: Manual render verification (Foundry console)**

Reload Foundry (so the new script loads), then run in the console to post a card from a hand-built flag (no attack needed — this exercises `_html`):

```javascript
const flag = {
  resolved: false, powerName: 'Test Power', damageType: 'lightning',
  normal: { total: 14, parts: [[10,'lightning'],[4,'physical']] },
  crit: { total: 22, parts: [[18,'lightning'],[4,'physical']] },
  halfOnMiss: true,
  targets: [
    { characterId: 'x', name: 'Goblin', img: 'icons/svg/mystery-man.svg', attackTotal: 18, defenseLabel: 'Ref', defenseValue: 14, origin: 'hit', selected: 'hit' },
    { characterId: 'y', name: 'Orc',    img: 'icons/svg/mystery-man.svg', attackTotal: 11, defenseLabel: 'Ref', defenseValue: 15, origin: 'miss', selected: 'miss' }
  ]
};
ChatMessage.create({ content: DamageCard4e._html(flag) });
```

Expected: a chat card styled like a dnd4e item card, two totals (Normal 14 / Crit 22) each with a "▸ details", and two target rows with token thumbnail, name, "(18 vs Ref 14)", and four buttons. The selected button has a gold outline; MISS reads "MISS→7". Buttons do nothing yet (listeners come in Task 3). Clicking them must NOT throw or grey them out (verify no console error from `_onChatCardAction`).

> Note: if a click DOES disable a button / logs an item lookup error, that is the system handler firing — it will be neutralized in Task 3. Acceptable at this step.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/damage-card.js src/module.json
git commit -m "feat(damage-card): render and post the resolution card"
```

---

## Task 3: Listeners — detail expander + GM toggles + re-render

**Files:**
- Modify: `src/scripts/damage-card.js` (add methods + hook registration)

**Interfaces:**
- Consumes: `DamageCard4e._html`, the flag shape; `foundry.utils.deepClone`; `game.user.isGM`; `message.getFlag` / `message.update`.
- Produces:
  - `DamageCard4e.activateListeners(message, html) => void`
  - `DamageCard4e._onToggle(message, idx, key) => Promise<void>`
  - A `renderChatMessage` hook calling `activateListeners`.

- [ ] **Step 1: Add the listener methods inside the class**

In `src/scripts/damage-card.js`, add these methods to `DamageCard4e` (after `_html`):

```javascript
    /**
     * Resolve the root card element from a renderChatMessage payload, which is a
     * jQuery object in v13 (deprecated hook) or an element. Returns null when the
     * message is not one of our cards.
     *
     * @param {ChatMessage} message
     * @param {JQuery|HTMLElement} html
     * @returns {HTMLElement|null}
     */
    static _root(message, html) {
        if (!message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG)) return null;
        const el = html?.jquery ? html[0] : html;
        return el?.querySelector?.('.damage-card') ?? null;
    }

    /**
     * Wire interactions on a rendered card. The detail expanders work for
     * everyone; toggles and the apply button mutate state and are GM-only.
     * Every interactive control stops propagation so the system's
     * `.card-buttons button` handler never runs on it.
     *
     * @param {ChatMessage} message
     * @param {JQuery|HTMLElement} html
     */
    static activateListeners(message, html) {
        const root = DamageCard4e._root(message, html);
        if (!root) return;

        // Detail expanders: pure UI, available to everyone.
        root.querySelectorAll('[data-detail]').forEach(el => {
            el.addEventListener('click', event => {
                event.stopPropagation();
                const block = root.querySelector(`[data-detail-for="${el.dataset.detail}"]`);
                if (block) block.style.display = block.style.display === 'none' ? '' : 'none';
            });
        });

        const flag = message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG);

        // Always swallow clicks on our interactive controls so the system's
        // global card-buttons handler cannot disable them or error out.
        root.querySelectorAll('[data-key], .dc-apply').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                if (!game.user.isGM || flag.resolved || btn.disabled) return;
                if (btn.dataset.key) DamageCard4e._onToggle(message, Number(btn.dataset.idx), btn.dataset.key);
                else DamageCard4e._onApply(message);
            });
        });
    }

    /**
     * Apply a new selection for one target and re-render from the flag.
     *
     * @param {ChatMessage} message
     * @param {number} idx Target index
     * @param {'crit'|'hit'|'miss'|'true'} key
     * @returns {Promise<void>}
     */
    static async _onToggle(message, idx, key) {
        const flag = foundry.utils.deepClone(message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG));
        if (!flag || flag.resolved) return;
        if (key === 'crit' && !flag.crit) return; // crit unavailable on the formula path
        flag.targets[idx].selected = key;
        await message.update({
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }
```

- [ ] **Step 2: Register the hook at the bottom of the file**

Append at the very end of `src/scripts/damage-card.js` (outside the class):

```javascript
// dnd4e targets Foundry v13: renderChatMessage still fires (deprecated, removed
// in v15). It passes (message, html, data) with html as a jQuery object.
Hooks.on('renderChatMessage', (message, html) => DamageCard4e.activateListeners(message, html));
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/damage-card.js`
Expected: no output, exit 0.

- [ ] **Step 4: Manual verification (Foundry, as GM)**

Reload Foundry. Re-post the test card from Task 2 Step 4. Then:

- Click "▸ details" on a total → the breakdown `(10 lightning + 4 physical)` shows/hides.
- Click HIT then CRIT then TRUE on a target → the gold outline follows the click; the originally-rolled outcome keeps a dashed outline when it is no longer selected.
- Confirm the clicked buttons are NOT disabled and no `_onChatCardAction` error appears in the console (stopPropagation working).
- Reload the page (F5) → the last selections persist (read back from the flag).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/damage-card.js
git commit -m "feat(damage-card): wire detail expander and GM toggle listeners"
```

---

## Task 4: Apply all + lock

**Files:**
- Modify: `src/scripts/damage-card.js` (add `_onApply`)

**Interfaces:**
- Consumes: `DamageCard4e._outcome`, `Helper4e.damage(characterId, parts, multiplier, bypass)`, `DamageCard4e._html`, the flag.
- Produces: `DamageCard4e._onApply(message) => Promise<void>` (already referenced in Task 3's listener).

- [ ] **Step 1: Add `_onApply` inside the class**

In `src/scripts/damage-card.js`, add to `DamageCard4e` (after `_onToggle`):

```javascript
    /**
     * Apply every target's selected outcome via the permission-elevated
     * Helper4e.damage chain, then lock the card. Per-target failures are logged,
     * not thrown, so one bad target does not abort the rest. Re-checks `resolved`
     * to guard against a double click / race.
     *
     * @param {ChatMessage} message
     * @returns {Promise<void>}
     */
    static async _onApply(message) {
        const flag = foundry.utils.deepClone(message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG));
        if (!flag || flag.resolved) return;

        for (const target of flag.targets) {
            const outcome = DamageCard4e._outcome(flag, target);
            if (!outcome) continue; // miss with no half-damage, or crit without a crit roll
            try {
                await Helper4e.damage(target.characterId, outcome.parts, outcome.multiplier, outcome.bypass);
            } catch (err) {
                console.error('DamageCard4e: apply failed for', target.name, err);
            }
        }

        flag.resolved = true;
        await message.update({
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }
```

- [ ] **Step 2: Syntax gate**

Run: `node --check src/scripts/damage-card.js`
Expected: no output, exit 0.

- [ ] **Step 3: Manual verification (Foundry, as GM)**

Reload Foundry. Build a card whose targets reference REAL tokens so application lands. With two tokens on the canvas:

```javascript
const ids = canvas.tokens.placeables.slice(0, 2).map(t => `${t.actor.id}.${t.id}`);
const names = canvas.tokens.placeables.slice(0, 2).map(t => t.name);
const flag = {
  resolved: false, powerName: 'Apply Test', damageType: 'fire',
  normal: { total: 8, parts: [[8,'fire']] },
  crit: { total: 14, parts: [[14,'fire']] },
  halfOnMiss: true,
  targets: [
    { characterId: ids[0], name: names[0], img: 'icons/svg/mystery-man.svg', attackTotal: 20, defenseLabel: 'Ref', defenseValue: 12, origin: 'crit', selected: 'crit' },
    { characterId: ids[1], name: names[1], img: 'icons/svg/mystery-man.svg', attackTotal: 9,  defenseLabel: 'Ref', defenseValue: 15, origin: 'miss', selected: 'miss' }
  ]
};
ChatMessage.create({ content: DamageCard4e._html(flag), flags: { '4e-functions-js': { damageCard: flag } } });
```

> Requires the world macro `ApplyDamage` (Helper4e.macroApplyDamage) to exist, as for all damage in this module.

Click "⚔ Apply all damage". Expected:
- Target 1 (crit) takes 14 fire; target 2 (miss, halfOnMiss) takes 4 fire (half of 8, floored).
- The card switches to the locked "✔ Damage applied" state; toggles are disabled.
- Clicking anything again does nothing (no second application).
- Set one target's `selected` to `'miss'` with `halfOnMiss:false` in a fresh card → that target is skipped (0 damage).

- [ ] **Step 4: Commit**

```bash
git add src/scripts/damage-card.js
git commit -m "feat(damage-card): apply all selected outcomes and lock the card"
```

---

## Task 5: Attack4e opt-in integration

**Files:**
- Modify: `src/scripts/attack.js` (`AttackResult.applyDamage` JSDoc ~line 88-101; `AttackResult._runDamage` ~line 154-177; add `_postResolutionCard`)

**Interfaces:**
- Consumes: `Damage4e.fromItem`, `Damage4e.fromFormula`, `Damage4e#roll`, `Damage4e#critical`, `DamageCard4e.post`, `Character.fromActor`.
- Produces: opt-in `applyDamage({ resolutionCard, halfOnMiss })` behaviour; `AttackResult#_postResolutionCard(opts) => Promise<void>`.

- [ ] **Step 1: Extend the `applyDamage` JSDoc**

In `src/scripts/attack.js`, in `AttackResult.applyDamage` (~line 88-97), add two `@param` lines before the `@returns`:

```javascript
     * @param {boolean} [opts.resolutionCard] Post an interactive GM resolution
     *   card instead of applying immediately (rolls normal + crit on the item path)
     * @param {boolean} [opts.halfOnMiss] When the card applies a MISS, deal half
     *   the normal damage instead of none (resolutionCard only)
```

- [ ] **Step 2: Add the opt-in branch in `_runDamage`**

In `src/scripts/attack.js`, at the very top of `_runDamage(opts)` (~line 155, before the `opts.damage || opts.formula` check), add:

```javascript
        // Opt-in: post an interactive resolution card instead of applying now.
        if (opts.resolutionCard) return this._postResolutionCard(opts);
```

- [ ] **Step 3: Add `_postResolutionCard`**

In `src/scripts/attack.js`, add this method to `AttackResult` (after `_applyDamage`, ~line 200):

```javascript
    /**
     * Roll damage once and post an interactive resolution card instead of
     * applying. Item path rolls both normal and crit (so the GM can toggle any
     * target to crit); the formula path rolls normal only (crit toggle disabled).
     * Does nothing if the damage dialog was cancelled.
     *
     * @private
     * @param {Object} opts applyDamage options
     * @param {boolean} [opts.fastForward=true]
     * @param {string} [opts.formula]
     * @param {string} [opts.type]
     * @param {boolean} [opts.halfOnMiss=false]
     * @returns {Promise<void>}
     */
    async _postResolutionCard(opts) {
        const caster = this._caster ?? (this._item?.actor ? Character.fromActor(this._item.actor) : null);
        if (!caster) {
            console.warn('AttackResult._postResolutionCard: no caster; cannot post card.');
            return;
        }

        const isFormula = !!opts.formula;
        const normal = isFormula
            ? await Damage4e.fromFormula(opts.formula, opts.type).by(caster).roll()
            : await Damage4e.fromItem(this._item).roll({ fastForward: opts.fastForward });

        if (!normal.roll) return; // dialog cancelled -> nothing to resolve

        const crit = isFormula
            ? null
            : await Damage4e.fromItem(this._item).critical().roll({ fastForward: opts.fastForward });

        await DamageCard4e.post({
            caster,
            powerName: this._item?.name ?? 'Damage',
            damageType: opts.type ?? normal.type ?? 'damage',
            normal,
            crit,
            outcomes: Array.from(this),
            halfOnMiss: !!opts.halfOnMiss
        });
    }
```

- [ ] **Step 4: Syntax gate**

Run: `node --check src/scripts/attack.js`
Expected: no output, exit 0.

- [ ] **Step 5: Manual end-to-end verification (Foundry, as GM)**

Reload Foundry. Target 2+ enemy tokens, then run a real attack from an item with damage:

```javascript
const item = actor.items.getName('Some Attack Power'); // an item with attack + damage
const targets = User4e.getTargets();
const result = await Attack4e.fromItem(item).rollAttack(targets, { fastForward: true });
await result.applyDamage({ resolutionCard: true, halfOnMiss: true }).run();
```

Expected:
- The attack card posts as usual, then a resolution card lists each target with its real "vs Def", toggles pre-selected to the rolled outcome (crit/hit/miss).
- Damage is NOT applied until the GM clicks "⚔ Apply all damage".
- Override a hit→crit, then apply → each target takes the right amount; card locks.
- Repeat with a power whose `applyDamage({ resolutionCard: true, formula: '2d6', type: 'fire' })` → CRIT toggles are disabled (formula path).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/attack.js
git commit -m "feat(attack): opt-in damage resolution card via applyDamage"
```

---

## Self-Review

(Completed by the plan author — see notes below; no action required by the implementer beyond the tasks above.)

**1. Spec coverage**
- Header with Normal + Crit totals & expandable detail → Task 2 (`_html` `totalBlock`), Task 3 (detail listener). ✅
- Per-target row: token, name, "vs Def" reminder → Task 1 (`img`/`getDefense`), Task 2 (`post`/`_html`). ✅
- Four mutually-exclusive toggles, pre-selected, GM-overridable, selected/origin/neutral states → Task 2 (button styling), Task 3 (`_onToggle`). ✅
- CRIT disabled on formula path → Task 2 (`disabled` when `!flag.crit`), Task 3 (`_onToggle` guard), Task 5 (`crit = null`). ✅
- MISS configurable (0 / half) → Task 2 (`_outcome`, label), Task 4 (apply). ✅
- GM-only controls, players read-only → Task 3 (`game.user.isGM` guard). ✅
- Apply-all via Helper4e chain, then lock; no double apply → Task 4. ✅
- Flag as source of truth, re-render from flag, survives reload → Tasks 2-4 (flag + `_html` on every update). ✅
- Opt-in via `applyDamage({resolutionCard})`, item + formula scope → Task 5. ✅
- Reuse dnd4e classes, inline untyped CSS, no style.css → Task 2 markup + Global Constraints. ✅
- System handler neutralized → Task 3 (`stopPropagation`). ✅

**2. Placeholder scan:** No TBD/TODO; all code is complete and concrete. ✅

**3. Type consistency:** Flag/`DamageCardTarget` shape is consistent across `post`, `_html`, `_outcome`, `_onToggle`, `_onApply`. `Helper4e.damage(characterId, parts, multiplier, bypass)` matches `helper.js`. `Damage4e.fromItem/fromFormula/by/critical/roll` and `.total/.parts/.roll/.type` match `damage.js`. `Character.id/name/actor/img/getDefense` match `character.js` (img/getDefense added in Task 1). `AttackOutcome` `{target,state,total,defense}` matches `attack.js`. ✅

**Out of scope (per spec):** crit for formula path, per-target apply button, manual amount editing.
