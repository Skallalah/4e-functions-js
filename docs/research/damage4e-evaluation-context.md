# Research notes — applying a power's damage bonuses to custom-formula damage

**Status:** research only. No implementation landed on `master`. These notes capture
what was learned while exploring how to reproduce a power's damage with tweaked dice
(e.g. Furious Bolts secondary at 2d4, "+1 die" features like Lightning Blood) while
still getting the *same* bonus evaluation as the power's own item damage. Revisit later.

The questions deferred: (1) whether the formula-damage "evaluation context" deserves a
real interface, and (2) whether `Damage4e._item` (item path) and the experimental
`_evalItem` (formula eval context) should be unified. See **Design options** below.

---

## 1. Native conditional bonus-damage effects (`power.damage.<keywords>.<bonusType>`)

The dnd4e system has a native "custom 4e modifier" channel, documented in
[`docs/reference/foundry-4e-effects.md`](../reference/foundry-4e-effects.md) under
*Custom 4e modifiers* (`[Scope].[TargetValue].[Filter].[BonusType]`) and confirmed in
`module/helper.js` (`applyEffects` ~141, `_applyEffectsInternal` ~460).

- An Active Effect change with key `power.damage.<kw1>.<kw2>…<bonusType>` (or
  `weapon.damage.…`) applies to a damage roll **only if every keyword segment is in the
  power's `suitableKeywords` set** (helper.js:462-473).
- Bonus types: `untyped` → summed, always stacks; any typed value → highest-of-type
  wins; **`roll` → the value is rolled and added as extra dice/parts** (helper.js:488-501).
  Example from the reference doc: `power.attack.melee.roll = 1d6[fire]`.
- **Both** `Damage4e.fromItem` (vendored pipeline) and `Damage4e.fromFormula` call
  `applyEffects`, so these effect bonuses already flow into both paths automatically.

### Limitation that bit us (Lightning Blood)

The `roll` effect value is resolved against the **actor only**
(`commonReplace(effect.value, actorData)`, helper.js:485) — it has **no access to the
power being used or its die size**. So:

- `power.damage.lightning.roll = 1d8` always adds a **d8**, even to a d6 power.
- It cannot express *"add one die of the power's own die"* when dice vary across powers.
- Hence a value like `(@LightningBlood)d8` is d8-locked and wrong for, e.g., a 2d4 attack.

**Native fix for "+N dice of the power's die":** fold the bonus into the *dice count*
of each power's own damage formula instead of adding a separate die:

```
(2 + @LightningBlood)d8      // a d8 power
(1 + @LightningBlood)d6      // a d6 power
2d4 + (@LightningBlood)d4    // equivalently, as a separate d4 term
```

Foundry accepts a parenthetical dice count — the dnd4e system itself builds
`(${quantity}*${weaponNum})d${size}` (helper.js:707/710). `@LightningBlood` must exist
in the actor's roll data. This is authoring, not code: zero runtime logic, and each
power keeps its correct die. The downside is per-power authoring discipline.

---

## 2. The formula-path keyword gap

`Damage4e.fromFormula` currently passes `applyEffects` a **synthetic** power that only
carries the damage type:

```js
powerData = { name: `${type} damage`, system: { damageType: { [type]: true } } };
```

So only **damage-type-scoped and `global`** modifiers fire. Bonuses keyed on power
source (`arcane`), implement/weapon group (`usesImplement`, `meleeWeapon`), range type,
attack flags, etc. **do not match** — but they *do* match on the item path (which passes
the real power + `getWeaponUse(...)`). A hand-copied formula therefore silently misses
bonuses the primary attack receives.

The experimental fix (`.as(item)`, not landed): bind the real power so `applyEffects`
sees its full keyword set, resolve `@variables` via `item.getRollData()`, and add the
generic actor damage bonus `bonuses.<actionType>.damage` (gated by `hit.damageBonusNull`)
— matching the item path. Also defaults the card flavor to the item's.

---

## 3. Item-derived inputs that feed DAMAGE evaluation

### Read as plain data off `item.system` / `item.name` / `item.labels` (keyword filter)

| Property path | Contributes |
|---|---|
| `system.damageType` `{type:true}` | damage-type keywords (fire, lightning…) |
| `system.effectType` | effect-type keywords |
| `system.powersource` / `secondPowersource` | power source (arcane, divine…) |
| `system.weaponType` | `weapon`/`melee`/`ranged`/`meleeWeapon`/`rangedWeapon`/`usesImplement`/`proficient` |
| `system.rangeType` | `close`/`burst`/`closeBurst`/`blast`/`area`/`areaBurst`/`ranged`/`melee`… |
| `system.attack.{def,isBasic,isCharge,isOpp,ability}` | `vsRef…`, `basic`/`mBasic`/`rBasic`, `charge`, `opp`, `uses<Ability>` |
| `system.keywordsCustom` (`;`-delimited) | custom keywords |
| `system.actionType` + `system.hit.damageBonusNull` | selects `actor.system.bonuses.<actionType>.damage` |
| `name` + `labels.damageTypes` | chat-card flavor |

Source: `module/helper.js:194-356` (keyword build), `:480-550` (bonus types).

### Weapon/implement inputs (only when a weapon is in use, via `getWeaponUse`)

`system.weaponGroup`, `system.properties`, `system.damageType`, `system.implement`,
`system.weaponBaseType`, `system.WeaponType`/`isRanged`/`proficientI`/`proficient`,
`system.properties.{two,ver}`, `system.enhance`. Source: helper.js:198-318.

### Requires a LIVE Item/Actor (cannot be a static descriptor)

- **`item.getRollData()`** (`item/item.js:2506`) — built live from `this.actor`,
  `this.abilityMod`, `this.system` (injects `rollData.item`, `rollData.mod`, abilities).
- **`Helper.getWeaponUse(item.system, actor)`** (`helper.js:63`) — needs the actor's
  *current equipped inventory* at roll time; returns a live weapon Item (staleness risk
  if snapshotted).
- **The vendored item-damage assembly** (`src/scripts/vendor/dnd4e-damage-roll.js`,
  `_rollItemDamageBody`) — reads `system.damage.parts`, `damageCrit.parts`,
  `hit.formula`/`critFormula`, `miss.formula`, `getDamageType()`, `_ammo`, the live
  `weaponUse` (incl. `weaponUse._ammo`). Byte-pinned verbatim to dnd4e 0.7.14; consumes
  the live Item directly and cannot be reduced to a descriptor without breaking
  `verify-vendor.py`.

---

## 4. The two item roles, and why they don't overlap

- **`_item` (item path)** = *"roll this item's own damage."* Irreducibly live — the
  vendored pipeline reads `damage.parts`/`hit.formula`/`getDamageType()`/`_ammo` and calls
  `getRollData()` + `getWeaponUse()` on the live Item.
- **`_evalItem` (formula eval context)** = *"borrow this power's evaluation context."*
  Everything it needs is either plain data off `item.system`/`name`/`labels`, or routed
  through the already-bound **caster's actor** (`getWeaponUse(item.system, actor)`,
  `getRollData()` which only reads `this.actor` + `this.system`).

**Key insight:** the two are **never both meaningful at once**. `fromItem` never sets
`_formula`; `fromFormula` always sets it. The real path discriminator is **`_formula`**,
not the presence of an item. `roll()` currently branches on `if (this._item)`.

---

## 5. Design options (deferred)

### Option (a) — collapse into a single `_item` field *(recommended)*

`fromItem` sets `_item`; `fromFormula().as(item)` sets the *same* `_item`. Required change:
switch `roll()`'s discriminator from `if (this._item)` to **`if (this._formula == null)`**
(else `fromFormula().as(item)` would wrongly enter the item branch). `clone()` drops the
extra field; `.as()` sets `_item`.

- Pro: one field instead of two, zero behavioral change, minimal diff, removes the
  disliked duality. The two roles are provably mutually exclusive on `_formula`.
- Con: `_item`'s meaning is mildly overloaded ("what to roll" vs "eval context"), resolved
  by a JSDoc note since `roll()` already forks on path.

### Option (b) — an `EvalContext` descriptor built from an item *(rejected)*

e.g. `EvalContext.fromItem(item)` → `{ name, system, rollData, actionType, … }`.

- Adds a concept instead of removing one (still `_item` + `_evalContext`).
- Cannot touch the item path (verbatim-pinned vendor needs the live Item).
- Must snapshot `getRollData()` / `getWeaponUse()` results → staleness + drift risk.
- The only thing it would uniquely enable (item-less synthetic eval) **already exists** as
  the synthetic fallback branch in `fromFormula`.

### Also considered — dedicated secondary power item *(rejected by user)*

Model Furious Bolts' secondary as its own authored Item (`(2 + @LightningBlood)d4`,
lightning keyword) and roll it natively. Fully system-native, no formula surgery, bonuses
auto-apply — but adds an item to maintain on every actor that has the power. User did not
want a second spell for this.

---

## References

- `src/scripts/damage.js` — `Damage4e` (both paths)
- `src/scripts/vendor/dnd4e-damage-roll.js` — vendored item-damage pipeline (0.7.14)
- `docs/reference/foundry-4e-effects.md` — custom 4e modifiers, the `roll` bonus type
- dnd4e system: `module/helper.js` (`getWeaponUse` 63, `applyEffects` 141, `_applyEffectsInternal` 460, `commonReplace` 575+), `module/item/item.js` (`getRollData` 2506)
