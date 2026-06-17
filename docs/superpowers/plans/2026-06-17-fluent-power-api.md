# Fluent Power API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the attack → damage → effect/VFX flow in a fluent, self-documenting API where a power reads `attack.rollAttack(targets)` then `result.hit.applyDamage().applyVFX().run()`, with damage finally **applied** to targets through the macro permission-elevation path.

**Architecture:** `Character` gains a token-aware composite `id`. `Target` returns token-backed `Character`s. A new `Damage4e` engine wraps `item.rollDamage()` and typed-formula rolls (riders included), caches its result, and parses `roll.terms` into `[value, type]` parts. `Character.damage(Damage4e)` delegates to `Helper4e.damage` → world macro `ApplyDamage` → `Actor4e.findByCharacterId` → `actor.calcDamage`/`applyDamage`. `Attack4e` becomes an instance (`Attack4e.fromItem`) returning an array-like `AttackResult` of `AttackOutcome`s, with a lazy op queue executed by a terminal `run()`.

**Tech Stack:** Plain ES (no build step — `src/scripts/*.js` loaded directly by Foundry per `module.json`), FoundryVTT v13, dnd4e system, Sequencer/Portal/socketlib/lib-wrapper/ActiveAuras modules.

## Global Constraints

Copied verbatim from the spec and CLAUDE.md — every task implicitly inherits these:

- **No automated test harness exists.** `package.json` has no `scripts`; there is no test runner. Per CLAUDE.md and the spec, *validation is in-game*. **Adapted TDD:** each task's "test" is (a) `node --check <file>` for a syntax gate I can run locally, then (b) an explicit in-game validation procedure (paste a snippet in the Foundry F12 console, or fire a named power, and check the stated expected result). Never claim a task verified without running both.
- **All utility-class methods MUST be static** (`Actor4e`, `Helper4e`, `Scene4e`, `User4e`, `Chat4e`, `VFX4e`) — required for macro accessibility. `Character`, `Target`, `Damage4e`, `Attack4e` are *instance* classes that run client-side in power scripts (never inside a macro); this is consistent with the rule, which targets macro-invoked code.
- **JSDoc is mandatory** on every function, method, and class property — type all params, returns, and properties. Use `@typedef` for object shapes.
- **Fluent, self-documenting API** — method chaining, intent-revealing names; never bypass the abstraction layers with raw Foundry calls in power scripts.
- **Permission elevation stays macro-based**: cross-actor mutation goes `Character.damage → Helper4e.damage → game.macros.getName('ApplyDamage').execute(...)`.
- **`module.json` load order**: `damage.js` must be listed **before** `attack.js` (the `AttackResult.run()` queue references `Damage4e`). Target order: `actor, helper, scene, character, effects, damage, target, user, attack, chat, vfx`.
- **dnd4e damage primitives**: `actor.calcDamage(parts, multiplier)` applies resistances then `applyDamage`; `actor.applyDamage(total, multiplier, surges)` is raw (bypasses resistances; `multiplier: -1` heals). `parts` = `Array<[number, string]>` where string is the damage type (`"physical"` for untyped).
- **Out of scope (v1)** — do NOT build: forced movement (push/pull/slide/target-teleport), zones/terrain, sustain, ongoing/save-ends damage helpers. Leave those as the powers currently handle them.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/scripts/character.js` | Token-aware `Character`, composite `id`, `damage()`, effect routing via `_token` | 1, 7 |
| `src/scripts/target.js` | `get()` returns token-backed `Character`s (dedupe by token); `selectCharacters({count, icon})` | 2, 3 |
| `src/scripts/actor.js` | `findByCharacterId(id)` — permission-safe resolution from composite id | 4 |
| `src/scripts/helper.js` | `damage(...)` delegation + `macroApplyDamage(scope)` body | 5 |
| `src/scripts/macros/general/apply_damage.js` | World-macro body (`ApplyDamage`) | 5 |
| `src/scripts/damage.js` | `Damage4e` engine (fromItem/fromFormula, roll, clone, parts) | 6 |
| `src/scripts/attack.js` | `AttackOutcome`, array-like `AttackResult`, `Attack4e.fromItem` instance + op queue | 8, 9 |
| `src/module.json` | Register `damage.js` before `attack.js` | 6 |
| `src/scripts/powers/lightning_fury/furious_bolts.js` | Migration proof | 10 |
| `src/scripts/powers/thunderclap.js`, `rogue/feinting_flurry.js` | Migration | 11 |

---

## Task 1: `Character` — token-aware composite `id`

**Files:**
- Modify: `src/scripts/character.js:16-38` (constructor + `fromToken`), `:87-97` (`addEffect`/`replaceEffect`)

**Interfaces:**
- Produces: `new Character(actor, token = null)`; `Character.fromToken(token)` stores `this._token`; `get id()` → `"<actorId>.<tokenId>"` when a token is present, else `actorId`. `get token` / `get tokens` unchanged.

- [ ] **Step 1: Store the token in the constructor and `fromToken`**

Replace the constructor and `fromToken` (`character.js:16-38`):

```javascript
    /**
     * @param {Actor} actor
     * @param {TokenDocument|Token|null} [token=null] Specific token this Character is bound to
     */
    constructor(actor, token = null) {
        this._actor = actor;
        this._token = token;
    }

    /**
     * @param {Actor} actor
     * @returns {Character}
     */
    static fromActor(actor) {
        return new Character(actor);
    }

    /**
     * @param {TokenDocument|Token} token
     * @returns {Character}
     */
    static fromToken(token) {
        return new Character(token.actor, token);
    }
```

- [ ] **Step 2: Add the `_token` property declaration and `id` getter**

After the `_actor;` field declaration (`character.js:2`), add the property doc:

```javascript
    /** @type {Actor} */
    _actor;

    /** @type {TokenDocument|Token|null} */
    _token = null;
```

Then add the `id` getter next to the `actor` getter (after `character.js:11`):

```javascript
    /**
     * Stable, scene-unique identifier for this Character.
     * `actorId.tokenId` when bound to a token (unique even for unlinked tokens
     * sharing a prototype), else the bare `actorId`.
     *
     * @returns {string}
     */
    get id() {
        return this._token ? `${this._actor.id}.${this._token.id}` : this._actor.id;
    }
```

- [ ] **Step 3: Route effect application through the bound token**

Replace `addEffect`/`replaceEffect` (`character.js:87-97`) so they prefer the bound token (the `this.token` getter throws on multi-token actors):

```javascript
    /**
     * @param {Object} effect Effect data from Effect4e.createEffect
     */
    async addEffect(effect) {
        const tokenIdentifier = this._token?.id ?? this.token.id;

        await Helper4e.applyEffect({ tokenIdentifier, effectData: effect });
    }

    /**
     * @param {Object} effect Effect data from Effect4e.createEffect
     */
    async replaceEffect(effect) {
        const tokenIdentifier = this._token?.id ?? this.token.id;

        await Helper4e.replaceEffect({ tokenIdentifier, effectData: effect });
    }
```

- [ ] **Step 4: Syntax gate**

Run: `node --check src/scripts/character.js`
Expected: no output, exit 0 (prints nothing on success).

- [ ] **Step 5: In-game validation**

In the Foundry F12 console (a token selected on the scene):

```javascript
const a = Character.fromActor(canvas.tokens.controlled[0].actor);
const t = Character.fromToken(canvas.tokens.controlled[0]);
console.log('fromActor id:', a.id);   // expect bare actor id (no dot)
console.log('fromToken id:', t.id);   // expect "<actorId>.<tokenId>"
```
Expected: `fromActor id` has no `.`; `fromToken id` is two ids joined by `.`.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/character.js
git commit -m "feat(character): token-aware composite id + token-routed effects"
```

---

## Task 2: `Target.get()` — token-backed Characters, dedupe by token

**Files:**
- Modify: `src/scripts/target.js:28-34` (`fromCharacter` disposition read), `:146-167` (`get`)

**Interfaces:**
- Consumes: `Character.fromToken(token)` (Task 1).
- Produces: `Target#get()` returns `Character[]`, one per **token** in range (no longer collapsed by actor), each carrying its token (composite `id`).

- [ ] **Step 1: Fix `get()` to wrap tokens, not actors**

Replace the `return` at `target.js:166`:

```javascript
        // Dedupe by TOKEN (not actor): two identical monsters are two targets,
        // each with its own resistances and a unique composite Character.id.
        return [...new Map(targets.map(t => [t.id, t])).values()]
            .map(token => Character.fromToken(token));
```

(The `tokens` collected at `target.js:147` are `TokenDocument`s from `Scene4e.getCurrentScenesTokens()`, so `t.id` is the token-document id and `Character.fromToken(t)` binds it.)

- [ ] **Step 2: Make `fromCharacter` disposition read multi-token safe**

Replace `fromCharacter` (`target.js:28-34`) — the current `character.token?.document.disposition` throws via the `token` getter before the `?.` applies:

```javascript
    /**
     * @param {Character} character
     * @returns {Target}
     */
    static fromCharacter(character) {
        const origins = character.tokens.map(t => ({ x: t.x, y: t.y }));

        // Prefer the bound token; fall back to the first active token.
        // Works for both TokenDocument (.disposition) and placeable Token (.document.disposition).
        const token = character._token ?? character.tokens[0];
        const disposition = token?.document?.disposition ?? token?.disposition ?? null;

        return new Target(origins).disposition(disposition);
    }
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/target.js`
Expected: exit 0, no output.

- [ ] **Step 4: In-game validation**

Place two identical (same prototype) enemy tokens within a burst of a caster, then in console:

```javascript
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
const found = Target.fromCharacter(caster).radius(5).type('enemies').get();
console.log('count:', found.length, 'ids:', found.map(c => c.id));
```
Expected: `count` equals the number of *tokens* in range (two identical monsters → 2, not 1); every `id` contains a `.` and all ids are distinct.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/target.js
git commit -m "fix(target): get() returns token-backed Characters, deduped per token"
```

---

## Task 3: `Target.selectCharacters({ count, icon })`

**Files:**
- Modify: `src/scripts/target.js:120-139` (`selectCharacters`)

**Interfaces:**
- Consumes: `Target#selectTarget(icon)` (returns `Target | null`), `Target#get()` (Task 2).
- Produces: `async selectCharacters({ count = 1, icon } = {})` → `Promise<Character[]>`; selects **exactly `count`** characters; returns `[]` on cancel; never throws. Callers test `.length`.

- [ ] **Step 1: Rewrite `selectCharacters`**

Replace `selectCharacters` (`target.js:120-139`). The current version loops `while(true)` with no cancel exit and calls `.get()` on a possibly-`null` selection:

```javascript
    /**
     * Interactively select exactly `count` characters within range.
     *
     * @param {Object} [opts={}]
     * @param {number} [opts.count=1] Exact number of characters to select
     * @param {string} [opts.icon] Path to the targeting cursor icon
     * @returns {Promise<Character[]>} Selected characters, or [] if cancelled (always an array)
     */
    async selectCharacters({ count = 1, icon } = {}) {
        /** @type {Map<string, Character>} */
        const picked = new Map();

        while (picked.size < count) {
            const selection = await this.selectTarget(icon);

            // Cancelled: abort the whole selection.
            if (selection === null) return [];

            const characters = selection.get();

            if (characters.length === 0) {
                ui.notifications.warn('Please target one valid token.');
                continue;
            }

            for (const character of characters) {
                if (picked.size >= count) break;
                if (picked.has(character.id)) {
                    ui.notifications.warn(`${character.name} is already selected. Choose another.`);
                    continue;
                }
                picked.set(character.id, character);
            }
        }

        return [...picked.values()];
    }
```

- [ ] **Step 2: Backward-compat for bare-string callers**

Existing powers call `selectCharacters(item.img)` with a string. Add a one-line normalization at the top of the method body (before `const picked`):

```javascript
        // Tolerate the legacy bare-string call: selectCharacters(iconPath).
        if (typeof arguments[0] === 'string') icon = arguments[0], count = 1;
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/target.js`
Expected: exit 0, no output.

- [ ] **Step 4: In-game validation**

In console (caster selected):

```javascript
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
// Pick one target, then cancel-test:
const one = await Target.fromCharacter(caster).range(20).type('enemies').selectCharacters({ count: 1 });
console.log('picked:', one.length, one.map(c => c.name));
// Re-run and press Escape immediately:
const cancelled = await Target.fromCharacter(caster).range(20).selectCharacters({ count: 1 });
console.log('cancelled is array:', Array.isArray(cancelled), 'length:', cancelled.length);
```
Expected: first call returns a 1-element array after one valid pick; the cancel run returns `[]` (array, length 0) — no exception.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): selectCharacters({count, icon}) selects exactly N, [] on cancel"
```

---

## Task 4: `Actor4e.findByCharacterId`

**Files:**
- Modify: `src/scripts/actor.js` (add static method)

**Interfaces:**
- Produces: `Actor4e.findByCharacterId(id)` → `Actor | null`. Splits `"<actorId>.<tokenId>"`; resolves the token's (possibly synthetic) actor when a tokenId is present, else the world actor.

- [ ] **Step 1: Add the resolver**

Add to `Actor4e` (after `getTokensByName`, before the closing brace at `actor.js:27`):

```javascript
    /**
     * Resolve an Actor from a Character.id (`actorId` or `actorId.tokenId`).
     * Prefers the token's actor (synthetic for unlinked tokens) so cross-actor
     * mutation from a macro is permission-safe and hits the right token.
     *
     * @param {string} id Character.id
     * @returns {Actor|null}
     */
    static findByCharacterId(id) {
        const [actorId, tokenId] = String(id).split('.');

        if (tokenId) {
            const token = canvas.tokens?.get(tokenId)
                ?? game.scenes.contents.flatMap(s => s.tokens.contents).find(t => t.id === tokenId);

            if (token?.actor) return token.actor;
        }

        return game.actors.get(actorId) ?? null;
    }
```

- [ ] **Step 2: Syntax gate**

Run: `node --check src/scripts/actor.js`
Expected: exit 0, no output.

- [ ] **Step 3: In-game validation**

In console (a token selected):

```javascript
const tok = canvas.tokens.controlled[0];
const id = `${tok.actor.id}.${tok.id}`;
console.log('resolved name:', Actor4e.findByCharacterId(id)?.name);          // expect the token's actor name
console.log('bare actor:', Actor4e.findByCharacterId(tok.actor.id)?.name);   // expect same actor name
console.log('bad id:', Actor4e.findByCharacterId('nope'));                    // expect null
```
Expected: both id forms resolve to the right actor name; a bogus id returns `null`.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/actor.js
git commit -m "feat(actor): findByCharacterId resolves actor from composite Character.id"
```

---

## Task 5: `Helper4e.damage` + `macroApplyDamage` + world macro `ApplyDamage`

**Files:**
- Modify: `src/scripts/helper.js:17-19` (replace the `damage()` stub)
- Create: `src/scripts/macros/general/apply_damage.js`

**Interfaces:**
- Consumes: `Actor4e.findByCharacterId` (Task 4).
- Produces: `Helper4e.damage(characterId, parts, multiplier, bypass)` → `Promise<boolean|undefined>` (executes the `ApplyDamage` macro); `Helper4e.macroApplyDamage(scope)` is the macro body, applying via `applyDamage` (bypass) or `calcDamage`.

- [ ] **Step 1: Replace the `damage()` stub with delegation + macro body**

Replace `helper.js:17-19`:

```javascript
    /**
     * Apply damage to an actor identified by its Character.id, via the
     * permission-elevated world macro.
     *
     * @param {string} characterId Character.id (`actorId` or `actorId.tokenId`)
     * @param {Array<[number, string]>} parts Damage chunks: [value, type]
     * @param {number} multiplier Application multiplier (1 full, 0.5 half, 2 double)
     * @param {boolean} bypass When true, ignore resistances (raw applyDamage)
     * @returns {Promise<boolean|undefined>}
     */
    static async damage(characterId, parts, multiplier, bypass) {
        return await game.macros.getName('ApplyDamage')
            .execute({ characterId, parts, multiplier, bypass });
    }

    /**
     * World-macro body for ApplyDamage. Runs with elevated permissions.
     *
     * @param {Object} scope
     * @param {string} scope.characterId
     * @param {Array<[number, string]>} scope.parts
     * @param {number} [scope.multiplier=1]
     * @param {boolean} [scope.bypass=false]
     * @returns {Promise<boolean|undefined>}
     */
    static async macroApplyDamage(scope) {
        const { characterId, parts, multiplier = 1, bypass = false } = scope;

        const actor = Actor4e.findByCharacterId(characterId);

        if (!actor) return undefined;

        if (bypass) {
            const total = parts.reduce((sum, [value]) => sum + value, 0);
            await actor.applyDamage(total, multiplier);
        } else {
            await actor.calcDamage(parts, multiplier);
        }

        return true;
    }
```

- [ ] **Step 2: Create the macro body file**

Create `src/scripts/macros/general/apply_damage.js`:

```javascript
// World macro: ApplyDamage
// Applies damage to an actor (by Character.id) with elevated permissions.
// scope: { characterId, parts: [[value, type]], multiplier, bypass }
return Helper4e.macroApplyDamage(scope);
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/helper.js`
Expected: exit 0, no output.
(`apply_damage.js` is a macro body with a top-level `return`; it is not a standalone module, so do **not** `node --check` it — Foundry wraps it in a function. Visual review only.)

- [ ] **Step 4: Create the world macro in Foundry (manual, one-time)**

In Foundry: create a **script Macro** named exactly `ApplyDamage` whose body is the single line `return Helper4e.macroApplyDamage(scope);`. (Mirror of the existing `ApplyHeal` macro.)

- [ ] **Step 5: In-game validation**

Note a damageable token's current HP, select it, then in console (use that token's composite id):

```javascript
const tok = canvas.tokens.controlled[0];
const id = `${tok.actor.id}.${tok.id}`;
const before = tok.actor.system.attributes.hp.value;
await Helper4e.damage(id, [[6, 'fire']], 1, false);   // 6 fire, resistances applied
console.log('hp', before, '->', tok.actor.system.attributes.hp.value);
```
Expected: HP drops by 6 (or less if the actor resists fire). Repeat with `bypass: true` and confirm resistances are ignored.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/helper.js src/scripts/macros/general/apply_damage.js
git commit -m "feat(helper): damage() delegation + ApplyDamage macro body"
```

---

## Task 6: `Damage4e` engine

**Files:**
- Create: `src/scripts/damage.js`
- Modify: `src/module.json:7-18` (register `damage.js` before `attack.js`)

**Interfaces:**
- Consumes: `item.rollDamage()`, `game.helper.applyEffects`, `CONFIG.Dice.rolls[0]` (Roll4e), `ChatMessage.getSpeaker`.
- Produces: `Damage4e.fromItem(item)`, `Damage4e.fromFormula(formula, type)`, `.by(character)`, `.multiplier(n)`, `.trueDamage()`, `.clone({multiplier, bypass})`, `await .roll()` (idempotent), getters `.total/.parts/.type/.roll/.multiplier/.bypass`. `parts` is `Array<[number, string]>`.

- [ ] **Step 1: Write `damage.js`**

Create `src/scripts/damage.js`:

```javascript
/**
 * Damage4e — fluent wrapper around a damage roll (item or typed formula).
 *
 * Caches its rolled result so the same instance (or a clone) can be applied
 * to several targets — and to hit/miss groups at different multipliers —
 * without re-rolling (RAW 4e rolls damage once).
 */
class Damage4e {
    /** @type {Item|null} */
    _item = null;
    /** @type {string|null} */
    _formula = null;
    /** @type {string|null} */
    _type = null;
    /** @type {Character|null} */
    _caster = null;
    /** @type {number} */
    _multiplier = 1;
    /** @type {boolean} */
    _bypass = false;
    /** @type {Roll|null} */
    _roll = null;
    /** @type {Array<[number, string]>|null} */
    _parts = null;

    /**
     * @param {Item} item Item whose damage configuration drives the roll
     * @returns {Damage4e}
     */
    static fromItem(item) {
        const d = new Damage4e();
        d._item = item;
        return d;
    }

    /**
     * @param {string} formula Dice formula (mods may be pre-interpolated, e.g. `2d4 + 5`)
     * @param {string} type Damage type (e.g. 'lightning')
     * @returns {Damage4e}
     */
    static fromFormula(formula, type) {
        const d = new Damage4e();
        d._formula = formula;
        d._type = type;
        return d;
    }

    /**
     * Bind the casting character (required for fromFormula: roll data, riders, speaker).
     *
     * @param {Character} character
     * @returns {Damage4e}
     */
    by(character) {
        this._caster = character;
        return this;
    }

    /**
     * Clone with an application multiplier (0.5 half, 2 double). Preserves the rolled result.
     *
     * @param {number} n
     * @returns {Damage4e}
     */
    multiplier(n) {
        return this.clone({ multiplier: n });
    }

    /**
     * Clone that bypasses resistances (raw applyDamage). Preserves the rolled result.
     *
     * @returns {Damage4e}
     */
    trueDamage() {
        return this.clone({ bypass: true });
    }

    /**
     * Internal clone that copies the resolved roll (never re-rolls).
     *
     * @param {Object} [overrides={}]
     * @param {number} [overrides.multiplier]
     * @param {boolean} [overrides.bypass]
     * @returns {Damage4e}
     */
    clone({ multiplier, bypass } = {}) {
        const d = new Damage4e();
        d._item = this._item;
        d._formula = this._formula;
        d._type = this._type;
        d._caster = this._caster;
        d._multiplier = multiplier ?? this._multiplier;
        d._bypass = bypass ?? this._bypass;
        d._roll = this._roll;
        d._parts = this._parts;
        return d;
    }

    /**
     * Resolve the roll (idempotent). First call rolls and posts the native message;
     * later calls return the stored result.
     *
     * @returns {Promise<Damage4e>}
     */
    async roll() {
        if (this._roll) return this;

        if (this._item) {
            const roll = await this._item.rollDamage();
            this._roll = roll;
            this._parts = Damage4e._partsFromRoll(roll, 'physical');
            return this;
        }

        if (!this._caster) throw new Error('Damage4e.fromFormula requires .by(caster) before .roll()');

        const actor = this._caster.actor;
        const rollData = actor.getRollData();
        const Roll4e = CONFIG.Dice.rolls[0];
        const options = { bonuses: foundry.utils.deepClone(Roll4e.DEFAULT_OPTIONS.bonuses) };
        // Synthetic power data so type riders (power.damage.<type>.*) fire for this type.
        const powerData = { name: `${this._type} damage`, damageType: { [this._type]: true } };
        const extra = [];

        await game.helper.applyEffects(rollData, actor, powerData, null, 'damage', extra, false, options);

        const formula = [`(${this._formula})[${this._type}]`, ...extra].join(' + ');
        const roll = await new Roll4e(formula, rollData, options).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${this._type} damage` });

        this._roll = roll;
        this._parts = Damage4e._partsFromRoll(roll, this._type);
        return this;
    }

    /**
     * Parse a resolved Roll into [value, type] chunks (mirror of the dnd4e
     * system's applyChatCardDamageInner: each term's flavor carries its type;
     * the untyped remainder falls back to `fallbackType`).
     *
     * @param {Roll} roll Evaluated roll
     * @param {string} fallbackType Type for the untyped remainder
     * @returns {Array<[number, string]>}
     */
    static _partsFromRoll(roll, fallbackType) {
        const parts = [];
        let remainder = roll.total;

        for (const term of roll.terms) {
            const flavor = term.options?.flavor ?? term.flavor;
            if (flavor && typeof term.total === 'number') {
                parts.push([term.total, flavor.toLowerCase()]);
                remainder -= term.total;
            }
        }

        if (parts.length === 0 || remainder !== 0) parts.push([remainder, fallbackType]);

        return parts;
    }

    /** @returns {number} */
    get total() { return this._roll?.total ?? 0; }
    /** @returns {Array<[number, string]>} */
    get parts() { return this._parts ?? []; }
    /** @returns {string|null} */
    get type() { return this._type; }
    /** @returns {Roll|null} */
    get roll() { return this._roll; }
    /** @returns {number} */
    get multiplier() { return this._multiplier; }
    /** @returns {boolean} */
    get bypass() { return this._bypass; }
}
```

- [ ] **Step 2: Register in `module.json` before `attack.js`**

Replace the `"scripts"` array (`module.json:7-18`):

```json
  "scripts": [
    "scripts/actor.js",
    "scripts/helper.js",
    "scripts/scene.js",
    "scripts/character.js",
    "scripts/effects.js",
    "scripts/damage.js",
    "scripts/target.js",
    "scripts/user.js",
    "scripts/attack.js",
    "scripts/chat.js",
    "scripts/vfx.js"
  ],
```

- [ ] **Step 3: Syntax gates**

Run: `node --check src/scripts/damage.js`
Expected: exit 0, no output.
Run: `node -e "JSON.parse(require('fs').readFileSync('src/module.json','utf8')); console.log('module.json valid')"`
Expected: prints `module.json valid`.

- [ ] **Step 4: In-game validation (item path)**

Reload Foundry (so `damage.js` loads). Select the caster, target an enemy, then with an attack item that has configured damage (use its id from `actor.items`):

```javascript
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasDamage);
const dmg = await Damage4e.fromItem(item).roll();
console.log('total', dmg.total, 'parts', JSON.stringify(dmg.parts));
const same = await dmg.roll();  // idempotent
console.log('re-roll same total:', same.total === dmg.total);
console.log('half clone total stays:', dmg.multiplier(0.5).total === dmg.total);
```
Expected: `parts` is a non-empty array of `[number, "type"]` pairs whose values sum to `total`; the second `.roll()` returns the same total (no new chat card); the `multiplier(0.5)` clone keeps the same `.total` (multiplier is applied at *application*, not to the stored roll).

- [ ] **Step 5: In-game validation (formula + rider path)**

With a caster who has a typed-damage rider (e.g. Talaerin's +4+@cha lightning):

```javascript
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
const dmg = await Damage4e.fromFormula(`2d4 + ${caster.getAbilityMod('cha')}`, 'lightning').by(caster).roll();
console.log('total', dmg.total, 'parts', JSON.stringify(dmg.parts));
```
Expected: a `lightning` chat message posts; `total` includes the rider bonus (compare against a caster without the rider); `parts` carries the `lightning` type. *(This is the highest-risk task — verify the rider actually lands and the parts type is correct before moving on.)*

- [ ] **Step 6: Commit**

```bash
git add src/scripts/damage.js src/module.json
git commit -m "feat(damage): Damage4e engine (item + typed-formula riders), registered before attack.js"
```

---

## Task 7: `Character.damage(damage)`

**Files:**
- Modify: `src/scripts/character.js:83-85` (replace the `damage()` stub)

**Interfaces:**
- Consumes: `Damage4e` (resolved, Task 6), `Helper4e.damage` (Task 5), `Character.id` (Task 1).
- Produces: `Character#damage(damage)` → applies a resolved `Damage4e` to this character via the macro.

- [ ] **Step 1: Replace the stub**

Replace `character.js:83-85`:

```javascript
    /**
     * Apply a resolved Damage4e to this character (resistances honored unless
     * the Damage4e bypasses them). Low-level primitive — mirror of `heal`.
     *
     * @param {Damage4e} damage A Damage4e instance with .roll() already awaited
     * @returns {Promise<boolean|undefined>}
     */
    async damage(damage) {
        return Helper4e.damage(this.id, damage.parts, damage.multiplier, damage.bypass);
    }
```

- [ ] **Step 2: Syntax gate**

Run: `node --check src/scripts/character.js`
Expected: exit 0, no output.

- [ ] **Step 3: In-game validation**

Select an enemy token, note its HP, then in console:

```javascript
const item = game.actors.getName('<caster name>').items.find(i => i.hasDamage);
const target = Character.fromToken(canvas.tokens.controlled[0]);
const dmg = await Damage4e.fromItem(item).roll();
const before = target.actor.system.attributes.hp.value;
await target.damage(dmg);
console.log('hp', before, '->', target.actor.system.attributes.hp.value);
// half via clone, same roll:
await target.damage(dmg.multiplier(0.5));
```
Expected: first `damage` reduces HP by the rolled total (resistances applied); the `multiplier(0.5)` application removes half of the *same* roll.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/character.js
git commit -m "feat(character): damage(Damage4e) applies via ApplyDamage macro"
```

---

## Task 8: `AttackResult` (array-like) + `AttackOutcome`

**Files:**
- Modify: `src/scripts/attack.js:32-115` (typedef rename, `AttackResult` class, instance-aware `rollAttack` return)

**Interfaces:**
- Consumes: `Character.fromToken`, the existing `_matchTarget`/`_toState`/`AttackState`.
- Produces: `AttackOutcome` typedef `{ target: Character, state, total, defense, roll }`; class `AttackResult extends Array` with `get hit()`, `get miss()`, `hasHit()`, `hasMiss()` (op-queue methods added in Task 9). Static `isHit`/`isMiss`/`hits`/`misses` still operate on an `AttackOutcome` / array.

- [ ] **Step 1: Rename the per-target typedef (`target` stays, now documented as a Character)**

Replace the `AttackResult` typedef (`attack.js:33-40`) with the `AttackOutcome` typedef:

```javascript
    /**
     * @typedef {Object} AttackOutcome
     * @property {Character} target - The target, as a Character (token-backed → composite id)
     * @property {AttackState} state - Outcome against this target (see AttackState)
     * @property {number} total - Total of the attack roll for THIS target
     * @property {'ac'|'fort'|'ref'|'will'} defense - Defense targeted
     * @property {Roll} roll - This target's sub-roll (roll.rollArray[i]), or the full roll as fallback
     */
```

- [ ] **Step 2: Add the `AttackResult` class above `class Attack4e`**

Insert before `class Attack4e {` (`attack.js:32`):

```javascript
/**
 * Array-like result of an attack: an iterable of AttackOutcome, carrying the
 * attack context (item, caster) and a lazy operation queue executed by run().
 *
 * Extends Array so `result[0]`, `result.length`, `.filter`, and
 * `Attack4e.isHit(result[0])` keep working for existing powers.
 */
class AttackResult extends Array {
    /** @type {Item|null} */
    _item = null;
    /** @type {Character|null} */
    _caster = null;
    /** @type {Array<{kind: string, opts: Object}>} */
    _queue = [];
    /** @type {boolean} */
    _consumed = false;

    /**
     * Build an AttackResult from outcomes plus attack context.
     *
     * @param {AttackOutcome[]} outcomes
     * @param {Item} item
     * @param {Character} caster
     * @returns {AttackResult}
     */
    static of(outcomes, item, caster) {
        const result = AttackResult.from(outcomes);
        result._item = item;
        result._caster = caster;
        return result;
    }

    /**
     * Outcomes that hit (HIT or CRITICAL), as a fresh AttackResult (empty queue).
     * @returns {AttackResult}
     */
    get hit() {
        return AttackResult.of(this.filter(o => Attack4e.isHit(o)), this._item, this._caster);
    }

    /**
     * Outcomes that missed (MISS, FUMBLE, IMMUNE), as a fresh AttackResult (empty queue).
     * @returns {AttackResult}
     */
    get miss() {
        return AttackResult.of(this.filter(o => Attack4e.isMiss(o)), this._item, this._caster);
    }

    /** @returns {boolean} */
    hasHit() { return this.some(o => Attack4e.isHit(o)); }
    /** @returns {boolean} */
    hasMiss() { return this.some(o => Attack4e.isMiss(o)); }
}
```

Note: `Array` subclass methods like `.filter`/`.from` construct via the subclass constructor; `AttackResult.of` re-stamps `_item`/`_caster` so derived results carry context with a clean queue.

- [ ] **Step 3: Have the static `rollAttack` return an `AttackResult`**

In `rollAttack` (`attack.js:61`), the method currently returns plain arrays. Wrap the three `return` paths. Replace the empty-target early return (`attack.js:69`):

```javascript
        if (targetArray.length === 0) {
            ui.notifications.warn('No targets specified for attack.');
            return AttackResult.of([], item, null);
        }
```

Replace the failed-roll return (`attack.js:81`):

```javascript
        if (!roll) {
            console.warn('Attack roll failed or was cancelled');
            return AttackResult.of([], item, null);
        }
```

Replace the fallback (UNKNOWN) return block (`attack.js:97-103`):

```javascript
            const outcomes = targetArray.map(target => ({
                target,
                state: AttackState.UNKNOWN,
                total: roll.total,
                defense,
                roll
            }));

            return AttackResult.of(outcomes, item, null);
```

Replace the final mapped return (`attack.js:108-114`):

```javascript
        const outcomes = multirollData.map((entry, index) => ({
            target: this._matchTarget(targetArray, entry.targetID, index),
            state: this._toState(entry.hitstate),
            total: entry.total,
            defense: entry.def,
            roll: roll.rollArray?.[index] ?? roll
        }));

        return AttackResult.of(outcomes, item, null);
```

(`_caster` is filled by the instance `rollAttack` in Task 9; the static path leaves it `null`, which is fine — the static path is deprecated and uses callbacks, not the queue.)

- [ ] **Step 4: Update JSDoc references from `AttackResult[]` to `AttackOutcome`**

In the static helpers `isHit`/`isMiss`/`isImmune`/`isFumble`/`isCritical` and `hits`/`misses` (`attack.js:117-210`) and `rollAttack`'s `@returns`, change `@param {AttackResult}` → `@param {AttackOutcome}` and `@returns {Promise<AttackResult[]>}` → `@returns {Promise<AttackResult>}`. (Behavior unchanged — they read `.state` and `.filter`.)

- [ ] **Step 5: Syntax gate**

Run: `node --check src/scripts/attack.js`
Expected: exit 0, no output.

- [ ] **Step 6: In-game validation**

Reload Foundry. Target two enemies (mixed hit/miss if possible), then in console with an attack item:

```javascript
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasAttack);
const targets = Array.from(game.user.targets).map(t => Character.fromToken(t));
const result = await Attack4e.rollAttack(item, targets, { fastForward: true });
console.log('is array:', Array.isArray(result), 'length:', result.length);
console.log('hit count:', result.hit.length, 'miss count:', result.miss.length);
console.log('hasHit:', result.hasHit(), 'legacy isHit[0]:', Attack4e.isHit(result[0]));
console.log('outcome[0].target is Character:', result[0].target instanceof Character);
```
Expected: `result` is array-like; `hit.length + miss.length === result.length`; `result[0].target` is a `Character`; legacy `Attack4e.isHit(result[0])` still works.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/attack.js
git commit -m "feat(attack): array-like AttackResult with hit/miss getters + AttackOutcome"
```

---

## Task 9: `Attack4e.fromItem` instance + chaining op queue

**Files:**
- Modify: `src/scripts/attack.js` (add instance constructor/`fromItem`/instance `rollAttack`; add queue methods to `AttackResult`)

**Interfaces:**
- Consumes: `Damage4e` (Task 6), `VFX4e.impact`, `Effect4e.createEffect`, `Character#damage`/`replaceEffect`.
- Produces: `Attack4e.fromItem(item)` → instance with `_item`/`_caster`; `async rollAttack(targets, options)` (instance) → `AttackResult` with `_caster` set; `AttackResult#applyDamage(opts)`, `applyVFX(opts)`, `applyEffect(opts)` (enqueue, return `this`), `async run()` (execute in order, return `this`).

- [ ] **Step 1: Add the op-queue methods to `AttackResult`**

Inside the `AttackResult` class (Task 8), after `hasMiss()`, add:

```javascript
    /**
     * Enqueue a damage application. Resolved and applied (one roll for the group,
     * each target taking its own resistances) when run() executes.
     *
     * @param {Object} [opts={}]
     * @param {boolean} [opts.fastForward=true] Skip the damage dialog (item path)
     * @param {string} [opts.formula] Roll this formula instead of the item's damage
     * @param {string} [opts.type] Damage type for the formula path
     * @param {boolean} [opts.trueDamage] Ignore resistances
     * @param {number} [opts.multiplier] Application multiplier (0.5 half, 2 double)
     * @param {Damage4e} [opts.damage] A pre-rolled Damage4e to reuse (shared hit/miss roll)
     * @returns {AttackResult} this
     */
    applyDamage(opts = {}) {
        this._queue.push({ kind: 'damage', opts });
        return this;
    }

    /**
     * Enqueue a VFX impact on each target.
     *
     * @param {Object} [opts={}]
     * @param {string} [opts.type] Power-source key for VFX4e (e.g. 'LIGHTNING')
     * @returns {AttackResult} this
     */
    applyVFX(opts = {}) {
        this._queue.push({ kind: 'vfx', opts });
        return this;
    }

    /**
     * Enqueue an effect application on each target.
     *
     * @param {Object} opts
     * @param {Object} opts.data Effect data (EffectLibrary entry / createEffect input)
     * @param {string} opts.durationType e.g. 'endOfUserTurn' | 'saveEnds'
     * @returns {AttackResult} this
     */
    applyEffect(opts = {}) {
        this._queue.push({ kind: 'effect', opts });
        return this;
    }

    /**
     * Execute the queued operations in order. One damage roll per damage op is
     * shared across the group; each target takes its own resistances. Per-target
     * failures are collected, not thrown, so one bad target does not abort the rest.
     *
     * @returns {Promise<AttackResult>} this (with `.errors` populated on failures)
     */
    async run() {
        if (this._consumed) {
            console.warn('AttackResult.run() called twice; ignoring the second call.');
            return this;
        }
        this._consumed = true;

        /** @type {Error[]} */
        this.errors = [];

        for (const { kind, opts } of this._queue) {
            if (kind === 'damage') await this._runDamage(opts);
            else if (kind === 'vfx') await this._runVFX(opts);
            else if (kind === 'effect') await this._runEffect(opts);
        }

        return this;
    }

    /** @private */
    async _runDamage(opts) {
        const base = opts.damage ?? (opts.formula
            ? await Damage4e.fromFormula(opts.formula, opts.type).by(this._caster).roll()
            : await Damage4e.fromItem(this._item).roll());

        const dmg = (opts.trueDamage || opts.multiplier != null)
            ? base.clone({ bypass: opts.trueDamage, multiplier: opts.multiplier })
            : base;

        for (const o of this) {
            try { await o.target.damage(dmg); }
            catch (err) { this.errors.push(err); console.error('applyDamage failed for', o.target?.name, err); }
        }
    }

    /** @private */
    async _runVFX(opts) {
        const type = opts.type?.trim();
        for (const o of this) {
            try { await VFX4e.impact(o.target, type); }
            catch (err) { this.errors.push(err); console.error('applyVFX failed for', o.target?.name, err); }
        }
    }

    /** @private */
    async _runEffect(opts) {
        const effect = Effect4e.createEffect(opts.data, opts.durationType, this._caster);
        for (const o of this) {
            try { await o.target.replaceEffect(effect); }
            catch (err) { this.errors.push(err); console.error('applyEffect failed for', o.target?.name, err); }
        }
    }
```

- [ ] **Step 2: Add the instance constructor, `fromItem`, and instance `rollAttack`**

At the top of `class Attack4e` (after the `AttackOutcome`/`DamageResult` typedefs, before the static `rollAttack`), add:

```javascript
    /** @type {Item|null} */
    _item = null;
    /** @type {Character|null} */
    _caster = null;

    /**
     * @param {Item} item The power/item driving this attack
     */
    constructor(item) {
        this._item = item;
        this._caster = item?.actor ? Character.fromActor(item.actor) : null;
    }

    /**
     * Build an attack bound to an item (its actor becomes the caster).
     *
     * @param {Item} item
     * @returns {Attack4e}
     */
    static fromItem(item) {
        return new Attack4e(item);
    }

    /**
     * Instance attack roll. Same hit determination as the static path, but
     * returns an AttackResult carrying this attack's caster (for the run() queue).
     *
     * @param {Character|Character[]} targets
     * @param {Object} [options={}]
     * @param {boolean} [options.fastForward=false]
     * @param {string} [options.rollMode]
     * @returns {Promise<AttackResult>}
     */
    async rollAttack(targets, options = {}) {
        const result = await Attack4e.rollAttack(this._item, targets, options);
        result._caster = this._caster;
        return result;
    }
```

Note: the static `rollAttack` keeps its `(item, targets, options)` signature (deprecated, still used by `attackAndDamage` and pre-migration powers). The instance method delegates to it and stamps `_caster`. Because `result.hit`/`.miss` rebuild via `AttackResult.of(..., this._caster)`, derived results keep the caster.

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/attack.js`
Expected: exit 0, no output.

- [ ] **Step 4: In-game validation (full chain)**

Reload Foundry. Target one or more enemies, then with an attack+damage item:

```javascript
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasAttack && i.hasDamage);
const targets = Array.from(game.user.targets).map(t => Character.fromToken(t));
const attack = Attack4e.fromItem(item);
const result = await attack.rollAttack(targets, { fastForward: true });

// chain: damage + vfx on hits, half damage on misses sharing one roll
await result.hit.applyDamage({ fastForward: true }).applyVFX({ type: 'LIGHTNING' }).run();
console.log('errors:', result.hit.errors);
```
Expected: hits take damage (HP drops) and show the impact VFX; `errors` is empty. Then confirm double-run guard: `await result.hit.run()` a second time logs the "called twice" warning and applies nothing further. Confirm a fresh `result.hit` each access: `result.hit !== result.hit` (different instances).

- [ ] **Step 5: In-game validation (shared-roll half-on-miss)**

```javascript
const dmg = await Damage4e.fromItem(item).roll();   // one roll
await result.hit.applyDamage({ damage: dmg }).run();
await result.miss.applyDamage({ damage: dmg, multiplier: 0.5 }).run();
```
Expected: missed targets take exactly half of the *same* total the hits took (no second damage card).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/attack.js
git commit -m "feat(attack): Attack4e.fromItem instance + lazy applyDamage/applyVFX/applyEffect run() queue"
```

---

## Task 10: Migrate `furious_bolts.js` (proof)

**Files:**
- Modify: `src/scripts/powers/lightning_fury/furious_bolts.js`

**Interfaces:**
- Consumes: everything above. This is the canonical proof the API serves a real chained power.

- [ ] **Step 1: Read the current power and the ideal target**

Read `src/scripts/powers/lightning_fury/furious_bolts.js` and `src/scripts/powers/lightning_fury/furious_bolts_ideal.js` in full. The migration must preserve behavior: primary attack (item damage 2d8+Cha lightning), then a chain of secondary attacks (`2d4 + Cha` lightning) that breaks on a miss, then a buff effect equal to the number of creatures hit.

- [ ] **Step 2: Rewrite `main` using the new API**

Replace the body of `main(ref)` with:

```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;
    const chaMod = caster.getAbilityMod('cha');
    const attack = Attack4e.fromItem(item);

    /** @type {Set<string>} */
    const attacked = new Set();
    /** @type {Character[]} */
    const hitTargets = [];

    // --- Primary ---
    const primarySel = await Target.fromCharacter(caster)
        .range(20).type('enemies')
        .selectCharacters({ count: 1, icon: item.img });
    if (!primarySel.length) { ui.notifications.warn('No target selected.'); return; }

    const primary = primarySel[0];
    attacked.add(primary.id);

    const primaryResult = await attack.rollAttack([primary], { fastForward: true });
    await primaryResult.hit
        .applyDamage({ fastForward: true })
        .applyVFX({ type: 'LIGHTNING' })
        .run();

    if (primaryResult.hasHit()) hitTargets.push(primary);

    // --- Secondary chain (2d4 + Cha lightning, breaks on miss) ---
    let origin = primary;
    let chaining = primaryResult.hasHit();

    while (chaining) {
        const candidates = Target.fromCharacter(origin)
            .range(10).type('enemies').get()
            .filter(t => !attacked.has(t.id));
        if (candidates.length === 0) break;

        const sel = await Target.fromCharacter(origin)
            .range(10).type('enemies')
            .selectCharacters({ count: 1, icon: item.img });
        if (!sel.length) break;

        const next = sel[0];
        if (attacked.has(next.id)) {
            ui.notifications.warn(`${next.name} has already been attacked. Choose another.`);
            continue;
        }
        attacked.add(next.id);

        await VFX4e.beam(origin, next, 'LIGHTNING');

        const secondary = await attack.rollAttack([next], { fastForward: true });

        if (secondary.hasHit()) {
            hitTargets.push(next);
            await secondary.hit
                .applyDamage({ formula: `2d4 + ${chaMod}`, type: 'lightning' })
                .applyVFX({ type: 'LIGHTNING' })
                .run();
            origin = next;
        } else {
            chaining = false;
            await VFX4e.custom('jb2a.static_electricity.03.blue', next, { scale: 0.5 });
        }
    }

    // --- Buff effect: +N to next attack ---
    const hitCount = hitTargets.length;
    if (hitCount > 0) {
        const effect = Effect4e.createEffect({
            name: 'Furious Bolts - Attack Bonus',
            description: `<p>+${hitCount} bonus to your first attack roll on your next turn (hit ${hitCount} creature${hitCount > 1 ? 's' : ''}).</p>`,
            icon: 'icons/magic/lightning/bolt-strike-blue.webp',
            changes: [{ key: 'system.attributes.attack.bonus', mode: 2, value: hitCount, priority: 20 }]
        }, 'endOfUserTurn', caster);

        await caster.addEffect(effect);
    }

    const hitNames = hitTargets.map(t => t.name).join(', ');
    await Chat4e.power(caster, 'Furious Bolts',
        `Lightning chains through ${hitCount} creature${hitCount > 1 ? 's' : ''}${hitNames ? `: ${hitNames}` : ''}. ${caster.name} gains +${hitCount} to their next attack roll!`);
}

main(this);
```

- [ ] **Step 3: Syntax gate**

Run: `node --check src/scripts/powers/lightning_fury/furious_bolts.js`
Expected: exit 0, no output.

- [ ] **Step 4: In-game validation**

Reload Foundry. Fire Furious Bolts from the caster's sheet against an enemy with at least one other enemy within 10 squares.
Expected: primary attack rolls and (on hit) applies 2d8+Cha lightning + impact VFX + damage to the target's HP; the chain prompts for a secondary target, beams to it, applies `2d4+Cha` lightning (with Talaerin's rider if present), and breaks on a miss; on completion the caster gains the `+N` attack-bonus effect and a summary chat message posts.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/powers/lightning_fury/furious_bolts.js
git commit -m "refactor(furious-bolts): migrate to fluent Attack4e/Damage4e API"
```

---

## Task 11: Migrate `thunderclap.js` + `feinting_flurry.js`, retire obsolete statics

**Files:**
- Modify: `src/scripts/powers/thunderclap.js`, `src/scripts/powers/rogue/feinting_flurry.js`
- Modify: `src/scripts/attack.js` (remove `rollDamage`, `attackAndDamage`, `_getDamageType` once unused)

**Interfaces:**
- Consumes: the full new API.

- [ ] **Step 1: Read both powers and find all `Attack4e` static usages**

Read `src/scripts/powers/thunderclap.js` and `src/scripts/powers/rogue/feinting_flurry.js` in full. Run:

```bash
grep -rn "Attack4e\.\(rollDamage\|attackAndDamage\|rollAttack\)\|result\.hit\b\|\.hit\b" src/scripts/powers
```
to confirm which static methods each power calls.

- [ ] **Step 2: Migrate `thunderclap.js`**

Convert it to `Attack4e.fromItem(item)` + `result.hit.applyDamage(...).applyVFX(...).applyEffect(...).run()` and, for half-on-miss, share a pre-rolled `Damage4e` between `result.hit` and `result.miss` (per Task 9 Step 5). Preserve the power's status-effect-on-hit and any miss behavior. (Write the concrete rewrite by mirroring Task 10's structure against thunderclap's current logic; keep `node --check` green.)

- [ ] **Step 3: Migrate `feinting_flurry.js`**

Convert its attack(s) to the instance API and any `Attack4e.isHit(results[0])` reads to `result.hasHit()` / `result.hit`. Its `5[W] + Dex` weapon damage stays on the item path (`applyDamage({ fastForward: true })`) since the item is configured for the weapon dice; do not hardcode the die. Sustain/forced movement (if any) remain manual (out of scope).

- [ ] **Step 4: Retire obsolete statics**

After confirming no power references them (re-run the grep from Step 1), delete `rollDamage` (`attack.js:212-265`), `attackAndDamage` (`:267-319`), and `_getDamageType` (`:321-337`) from `attack.js`. Keep the static `rollAttack` (the instance path delegates to it), `isHit`/`isMiss`/`isCritical`/`isFumble`/`isImmune`/`hits`/`misses`, `_toState`, `_matchTarget`, and `promptHit`.

- [ ] **Step 5: Syntax gates**

Run: `node --check src/scripts/powers/thunderclap.js && node --check src/scripts/powers/rogue/feinting_flurry.js && node --check src/scripts/attack.js`
Expected: exit 0, no output.

- [ ] **Step 6: In-game validation**

Reload Foundry. Fire Thunderclap against multiple targets: confirm hits take full damage + effect, misses take half of the same roll. Fire Feinting Flurry: confirm attack(s) resolve and damage applies. Confirm no console errors referencing removed methods.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/powers/thunderclap.js src/scripts/powers/rogue/feinting_flurry.js src/scripts/attack.js
git commit -m "refactor(powers): migrate thunderclap + feinting_flurry; retire obsolete Attack4e statics"
```

---

## Self-Review

**Spec coverage** (against `2026-06-17-fluent-power-api-design.md`):
- §1 `Character` (`id`, `damage`, effect via `_token`) → Tasks 1, 7. ✓
- §2 `Target` (`get()` fromToken fix, `selectCharacters`) → Tasks 2, 3. ✓
- §3 `Damage4e` (fromItem/fromFormula/clone/idempotent roll/_partsFromRoll) → Task 6. ✓
- §4 `AttackResult`/`AttackOutcome` (array-like, hit/miss, queue, run lifecycle) → Tasks 8, 9. ✓
- §5 `Attack4e.fromItem` instance + retained statics → Task 9 (statics retired in 11). ✓
- §6 `Helper4e.damage` + `macroApplyDamage` + `Actor4e.findByCharacterId` + macro → Tasks 4, 5. ✓
- §7 `module.json` order → Task 6. ✓
- Phase plan (0→4) → Tasks 1–3 (phase 0), 4–7 (phase 1), 8 (phase 2), 9 (phase 3), 10–11 (phase 4). ✓
- Out-of-scope (forced movement/zones/sustain/ongoing) → stated in Global Constraints; not implemented. ✓

**Open spec points carried into the plan:**
- `AttackResult extends Array` (open point #1) → resolved in Task 8 (subclass + `.of` re-stamp).
- `applyEffect` shape (open point #2) → Task 9 uses `{ data, durationType }` → `Effect4e.createEffect`.
- `@cha` roll-data key (open point #4) → sidestepped: powers interpolate `getAbilityMod('cha')` into the formula string (Task 6 Step 5, Task 10); riders still flow through `getRollData()`.

**Type consistency:** `parts` is `Array<[number, string]>` in Damage4e (Task 6), Helper4e.damage (Task 5), and macroApplyDamage (Task 5). `Character.id` is a string everywhere. `AttackOutcome.target` is a `Character` (Tasks 8, used in 9's `o.target.damage`). `AttackResult.of(outcomes, item, caster)` signature matches all callers (`hit`/`miss` getters, static `rollAttack` returns, instance `rollAttack`). `Damage4e.clone({multiplier, bypass})` matches the call in `_runDamage`.

**Highest-risk task:** Task 6 Step 5 (`fromFormula` riders + `_partsFromRoll` typing) — validate carefully in-game before building Tasks 7+ on it.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-fluent-power-api.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. (Note: in-game validation steps need *you* at the Foundry client; subagents can do code + `node --check` + commits, then hand each in-game check to you.)
2. **Inline Execution** — execute tasks in this session with checkpoints for the in-game validations.

Which approach?
