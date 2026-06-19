# Damage Resolution Card — Design

**Date:** 2026-06-19
**Status:** Approved

## Problem

After an attack rolls damage against several targets, applying the result is
all-or-nothing and immediate. For a multi-hit power the GM wants to *review*
each target's outcome — confirm the auto-computed hit/miss/crit, override one,
or apply true damage — and then commit everything in a single action.

This is less useful for powers that are technically sequential attacks (e.g.
Furious Bolts), but valuable for genuine multi-hit powers where the GM validates
results quickly before confirming them all.

## Goal

An opt-in interactive chat card, posted *after* damage is rolled, that:

- shows the **Normal** and (when available) **Crit** totals, each with an
  expandable breakdown,
- lists every target with its token image, name, and a reminder of the attack
  result ("18 vs Ref 14"),
- offers four mutually-exclusive per-target toggles — **CRIT / HIT / MISS /
  TRUE** — pre-selected from the attack outcome and overridable by the GM,
- applies all targets' damage at once via a single button,
- locks itself once applied so damage cannot be applied twice.

## Non-goals (this version)

- Crit for the **formula path** (`Damage4e.fromFormula`). The `CRIT` toggle is
  disabled/greyed when no crit total exists. The crit-for-formula mechanic
  (maximised dice + crit dice) is later work.
- Per-target apply button — only the global "Apply all" button, per the
  original idea.
- Manual editing of the damage amount.

## Decisions (locked during brainstorming)

1. **MISS is configurable per power** via a `halfOnMiss` flag. The `MISS` toggle
   applies `0` damage, or half the normal damage when `halfOnMiss` is set. The
   card shows the resulting amount on the toggle (e.g. `MISS→7`).
2. **GM-only controls.** Only a GM can change toggles or click "Apply all".
   Players see the card read-only.
3. **Application reuses the existing chain** `Helper4e.damage(characterId, parts,
   multiplier, bypass)` — fully JSON-serialisable, so it replays from the flag.
4. **State lives in a ChatMessage flag** (`message.flags['4e-functions-js'].damageCard`),
   the single source of truth. The card re-renders from the flag, surviving chat
   re-renders and staying consistent across the GM's clients.
5. **Scope:** item path (Normal + Crit) and formula path (Normal only, `CRIT`
   disabled).
6. **After apply:** the card locks (resolved state); toggles and the button
   disable; no re-apply.

## Architecture

A new file `scripts/damage-card.js` exposing **`DamageCard4e`** (all static
methods, matching the project convention), CSS in `style.css`, and an opt-in
entry point in `Attack4e`.

### Components

- **`DamageCard4e.post(config)`** — computes totals, builds the flag and the
  HTML, creates the `ChatMessage`.
- **`DamageCard4e._html(flag)`** — a **pure** render function (flag → HTML
  string). Used both at creation and after every mutation, so the DOM always
  reflects the flag (no desync between stored content and state).
- **`DamageCard4e.activateListeners(message, html)`** — registered via
  `Hooks.on('renderChatMessage', …)` at the bottom of the file. Wires the toggle
  clicks and the "Apply all" button, all guarded by `game.user.isGM`. The
  "▸ détail" expander is a transient DOM toggle (not stored in the flag).

Registering the hook at module-evaluation time (top level of the script) is the
standard Foundry idiom for module scripts loaded via `module.json`.

### Flag shape — single source of truth

```js
message.flags['4e-functions-js'].damageCard = {
  resolved: false,
  powerName, speaker, damageType,
  normal: { total, parts: [[value, 'lightning'], …] }, // parts = exactly what Helper4e.damage expects
  crit:   { total, parts } | null,                       // null on the formula path → CRIT toggle disabled
  halfOnMiss: false,
  targets: [{
    characterId,                       // Helper4e.damage id (actorId or actorId.tokenId)
    name,
    img,                               // token texture src
    attackTotal,                       // attack roll total for this target
    defenseValue,                      // numeric defence value
    defenseLabel,                      // 'Ref' / 'Fort' / 'Will' / 'AC'
    origin:   'crit'|'hit'|'miss',     // what the roll gave (dotted-border marker)
    selected: 'crit'|'hit'|'miss'|'true' // current choice (solid-border marker)
  }]
}
```

The four outcomes are **derived** from `normal`/`crit` at apply time (no
redundant per-outcome payload stored):

| selected | parts            | multiplier | bypass |
|----------|------------------|------------|--------|
| `crit`   | `crit.parts`     | 1          | false  |
| `hit`    | `normal.parts`   | 1          | false  |
| `miss`   | `normal.parts` if `halfOnMiss`, else **nothing** | 0.5 | false |
| `true`   | `normal.parts`   | 1          | true   |

`origin` maps from `AttackState`: `CRITICAL→'crit'`, `HIT→'hit'`,
`MISS/FUMBLE/IMMUNE→'miss'`, `UNKNOWN→'hit'` (GM decides).

### Toggle visual states (CSS in `style.css`)

| State | Rendering | Meaning |
|-------|-----------|---------|
| **Selected** | solid/thick coloured border | the current choice, what will be applied |
| **Origin (not selected)** | discreet dotted border | what the roll actually gave, kept as a reference when the GM overrode it |
| **Neutral** | thin standard border | available option, neither chosen nor origin |

When `selected === origin`, only one toggle is highlighted (no dotted marker).
The `CRIT` toggle renders disabled when `crit === null`.

## Flow

- **Toggle click (GM):** copy the flag, set `targets[i].selected = key`, then
  `message.update({ content: _html(flag), flags…: newFlag })`. Foundry
  re-renders → `activateListeners` re-binds. `CRIT` clicks are ignored when
  `crit === null`.
- **Apply all (GM):** for each target derive `{parts, multiplier, bypass}` from
  `selected` and call `Helper4e.damage(...)`; a `miss` with no `halfOnMiss` is
  skipped. Then set `resolved = true` and update → re-render shows the locked
  state. A second click is impossible (button disabled).
- **▸ détail:** transient DOM toggle showing the breakdown (e.g. `1d8+6 …`);
  not persisted in the flag.

## Opt-in & integration

In `AttackResult._runDamage(opts)`: when `opts.resolutionCard` is set, roll the
damage **once** (normal, plus crit on the item path) and post the card **instead
of applying**. Otherwise the current behaviour is unchanged.

```js
result.applyDamage({ resolutionCard: true, halfOnMiss: true })
```

`_postResolutionCard(opts)`:

1. `normal = opts.formula ? Damage4e.fromFormula(opts.formula, opts.type).by(caster).roll()
   : Damage4e.fromItem(item).roll({ fastForward: opts.fastForward })`
2. `crit = (item path) ? Damage4e.fromItem(item).critical().roll({ fastForward }) : null`
3. If `!normal.roll` (dialog cancelled) → return without posting.
4. Build target entries from `this` (the AttackResult outcomes).
5. `DamageCard4e.post({ caster, item, normal, crit, entries, halfOnMiss, damageType })`.

### Small abstraction additions

To avoid reading `system` directly inside the card:

- `Character.getDefense('ref'|'fort'|'will'|'ac')` → numeric defence value.
- A token-image getter on `Character` (reuse an existing one if present).

## Module registration

Add `scripts/damage-card.js` to `module.json` `scripts`, after `attack.js`
(it depends on `Damage4e`, `Attack4e`, `Helper4e`, `Character`). `style.css` is
already shipped.

## Error handling

- Cancelled damage dialog (`!normal.roll`) → no card posted.
- `Helper4e.damage` per-target failures are caught and logged; one bad target
  must not abort the rest of the apply loop (mirrors `_applyDamage`).
- Non-GM clicks are no-ops (guarded), not errors.
- A re-render of an already-`resolved` card shows the locked state; the apply
  handler also re-checks `resolved` before applying as a guard against races.

## Testing

Manual, in Foundry v13 / dnd4e 0.7.14 (no automated harness in this project):

1. Multi-target attack with `resolutionCard: true` → card lists every target
   with correct token/name/"vs Def" and pre-selected toggles matching the roll.
2. Override a HIT to CRIT and to TRUE; verify the dotted origin marker stays on
   the rolled outcome and the solid marker follows the selection.
3. Formula-path damage → `CRIT` toggle disabled.
4. `halfOnMiss` on/off → MISS toggle shows `→half` vs `0`, and applies
   accordingly.
5. Apply all → each target takes the right amount/type/resistance; card locks;
   re-click does nothing.
6. Player client → card visible, controls inert.
7. Reload mid-resolution → toggle state restored from the flag.
