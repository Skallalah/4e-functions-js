# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **FoundryVTT module** for Dungeons & Dragons 4th Edition (`dnd4e` system). It provides JavaScript-based automation functions for effects, damage, healing, and other game mechanics between players.

**Core Purpose**: Enable cross-player interactions (damage, effects, healing) by bypassing FoundryVTT's permission system where players cannot modify other characters' sheets directly.

## Project Philosophy

The goal is to create a **fluent, self-descriptive API** that is human-readable and makes it easy to create and automate powers in FoundryVTT.

### Key Principles

1. **Fluent API Design** - Code should read like natural language
   ```javascript
   // Good: Fluent, readable
   Target.fromCharacter(caster)
       .range(5)
       .radius(2)
       .type('enemies')
       .get()

   // Avoid: Direct data access
   Scene4e.getCurrentScenesTokens().filter(t => ...)
   ```

2. **Abstraction over Direct Access** - Never access data directly; always go through classes and functions
   - Extend classes/functions as needed rather than adding inline logic
   - Wrappers and helpers handle the necessary details
   - Avoids monolithic code blocks

3. **Reusable Interfaces** - Build composable, reusable components
   - Each class provides a clear abstraction layer
   - Power scripts should use high-level APIs, not raw Foundry calls
   - When new functionality is needed, add it to the appropriate class

4. **Self-Documenting Code** - Method names and chaining should explain intent
   ```javascript
   // Good: Intent is clear
   await character.heal(surge, cost, additional);
   await target.replaceEffect(effect);

   // Avoid: Unclear, implementation-exposed
   await actor.applyDamage(value, -1, surge);
   ```

## Build and Development Commands

```bash
# Install dependencies
yarn install

# Build the project
yarn build
```

Note: TypeScript references in the codebase are legacy artifacts and should be removed/ignored.

## Architecture

### Permission System Workaround

FoundryVTT prevents players from modifying other players' character sheets. This module solves this by:
1. Powers trigger macros via `game.macros.getName('MacroName').execute(scope)`
2. Macros run with elevated permissions to modify any character
3. All operations (heal, damage, effects) go through this macro system

### Critical Design Rule

**All script functions MUST be static** to be accessible from macros triggered by powers. This is mandatory for the permission workaround to function.

### Core Classes

1. **Character** (`src/scripts/character.js`) - Main abstraction for actors/tokens
   - Factory methods: `Character.fromActor()`, `Character.fromToken()`, `Character.fromName()`
   - Fluent interface for character operations
   - Methods: `heal()`, `tempHeal()`, `addEffect()`, `replaceEffect()`
   - Properties: `tokens`, `token`, `name`, `combatant`
   - All modification methods delegate to Helper4e which calls macros

2. **Helper4e** (`src/scripts/helper.js`) - Macro delegation layer
   - **All functions are static**
   - Bridges to FoundryVTT macros: `ApplyHeal`, `ApplyTempHp`, `ApplyEffectToToken`, `RemoveEffectByName`, `GetActorData`
   - This is where the permission elevation happens
   - Pattern: `static async heal(actor, value, surgeConsumed, surgeValue) { return await game.macros.getName('ApplyHeal').execute({...}) }`
   - Extend this class when you need new cross-player operations

3. **Effect4e** (`src/scripts/effects.js`) - Effect creation with combat-aware durations
   - `static createEffect(data, durationType, origin)` - Creates effects tied to combat rounds and initiative
   - **EffectLibrary** - Centralized static effect definitions (e.g., `DIVINE_SANCTION`)
   - Effects include proper dnd4e flags for duration tracking
   - Add new effects to EffectLibrary for reusability

4. **Target** (`src/scripts/target.js`) - Targeting system with range/radius
   - Factory methods: `Target.fromCharacter()`, `Target.fromCoordinates()`
   - **Fluent API** for building targeting queries:
     - `.range(squares)` - Maximum range from origin
     - `.radius(squares)` - Area of effect radius
     - `.type('creatures' | 'allies' | 'enemies')` - Filter by relationship
     - `.disposition(value)` - Set caster's disposition for filtering
   - Interactive selection: `await target.selectTarget(icon)`, `await target.selectCharacters(icon)`
   - Returns Character instances via `target.get()`

5. **Scene4e** (`src/scripts/scene.js`) - Spatial utilities
   - **All functions are static**
   - Distance measurement, adjacency, token finding
   - Methods: `isWithin(origin, target, radius)`, `isAdjacent(token, target)`, `getAdjacentTokens()`
   - Extend when you need new spatial queries

6. **Actor4e** (`src/scripts/actor.js`) - Actor/token lookup
   - **All functions are static**
   - Methods: `findActorByName()`, `findTokenByName()`, `findTokenByIdentifier()`, `getTokensByName()`
   - Extend when you need new lookup methods

7. **User4e** (`src/scripts/user.js`) - User targeting
   - **All functions are static**
   - `getTargets()` returns Character[] of user's current targets
   - `updateTargets(characters)` updates the user's target selection

8. **Attack4e** (`src/scripts/attack.js`) - Attack and damage roll abstraction
   - **All functions are static**
   - Launches attacks from items using FoundryVTT's native system (includes all bonuses)
   - `rollAttack(item, targets, options)` - Perform attack roll(s)
   - `rollDamage(item, targets, options)` - Perform damage roll(s)
   - `attackAndDamage(item, targets, options)` - Complete attack sequence with callbacks
   - `promptHit(target, attackName)` - Manual hit/miss confirmation dialog
   - Returns structured results with hit/miss status, roll objects, and targets

9. **Chat4e** (`src/scripts/chat.js`) - Standardized chat messages
   - **All functions are static**
   - `power(caster, powerName, content)` - Generic power message
   - `healing(caster, targets, amount, powerName)` - Healing message
   - `tempHp(caster, targets, amount, powerName)` - Temp HP message
   - `effect(caster, targets, effectName, powerName)` - Effect application message
   - `damage(caster, targets, amount, damageType, powerName)` - Damage message

10. **VFX4e** (`src/scripts/vfx.js`) - Visual effects with power source theming
   - **All functions are static**
   - Power sources: `FIRE`, `LIGHTNING`, `WATER`, `DIVINE`, `NATURE`, `NECROTIC`, `RADIANT`, `ARCANE`
   - `healing(target, powerSource)` - Healing visual effect
   - `teleport(character, targetLocation, powerSource)` - Teleportation with beam linking origin and destination
   - `aura(target, powerSource)` - Aura/persistent effect
   - `impact(target, powerSource)` - Hit/impact effect
   - `beam(origin, target, powerSource)` - Beam effect stretching between two points (rays, chains, ranged attacks)
   - `custom(file, target, options)` - Fully customizable effect
   - All methods accept either a power source string or a custom configuration object

### Power Script Pattern

Powers in `src/scripts/powers/` follow this structure and should use the fluent API:

```javascript
async function main(ref) {
    // Get caster using Character abstraction
    const caster = Character.fromActor(ref.actor);

    // Create effect with proper duration
    const effect = Effect4e.createEffect(
        EffectLibrary.SOME_EFFECT,
        'endOfUserTurn',
        caster
    );

    // Get targets using User4e or Target API
    const targets = User4e.getTargets();

    // Apply to all targets using fluent interface
    for (const target of targets) {
        await target.replaceEffect(effect);
    }
}

main(this); // Execute with 'this' context from Foundry
```

Example with Target selection:
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);

    // Fluent targeting API
    const selection = await Target.fromCharacter(caster)
        .range(10)
        .selectTarget('path/to/icon.webp');

    if (!selection) return; // User cancelled

    const targets = selection
        .radius(2)
        .type('enemies')
        .get();

    for (const target of targets) {
        await target.tempHeal(15);
    }
}
```

**Example Using New Abstractions** - Simplified Lay on Hands:
```javascript
async function main(ref) {
    const paladin = Character.fromActor(ref.actor);

    // Use new fluent ability API
    const chaMod = paladin.getAbilityMod('cha');
    const { value: paladinSurges, surgeValue: paladinSurgeValue } = paladin.getSurges();

    // Use fluent surge checking
    if (!paladin.hasSurges()) {
        ui.notifications.warn(`You don't have any healing surges left to use this power.`);
        return;
    }

    const targets = await Target.fromCharacter(paladin)
        .range(1)
        .type('allies')
        .selectCharacters(ref.item.img);

    if (!targets.length || targets.length !== 1) return;

    const target = targets[0];
    const targetSurgeValue = target.getSurges().surgeValue;
    const usedSurgeValue = Math.max(paladinSurgeValue, targetSurgeValue);

    await target.heal(0, 0, usedSurgeValue + chaMod);

    // Use VFX4e with power source
    await VFX4e.healing(target, 'DIVINE');

    // Use consumeSurges method
    await paladin.consumeSurges(1);

    // Use Chat4e for standardized message
    await Chat4e.healing(paladin, [target], usedSurgeValue + chaMod, 'Lay on Hands');
}

main(this);
```

**Complete Real Example** - Lay on Hands (`src/scripts/powers/paladin/lay_on_hands.js`):
```javascript
async function main(ref) {
    const paladin = Character.fromActor(ref.actor);

    // Get paladin stats
    const chaMod = paladin.getSystem()?.abilities?.cha?.mod;
    const paladinSurgeValue = paladin.getSystem()?.details.surgeValue;
    const paladinSurges = paladin.getSystem()?.details.surges.value;

    // Check resource availability
    if (paladinSurges <= 0) {
        ui.notifications.warn(`You don't have any healing surges left to use this power.`);
        return;
    }

    // Fluent targeting: select 1 ally within 1 square using power's icon
    const targets = await Target.fromCharacter(paladin)
        .range(1)
        .type('allies')
        .selectCharacters(ref.item.img);

    if (!targets.length || targets.length !== 1) return;

    const target = targets[0];
    const targetSurgeValue = target.getSystem()?.details.surgeValue;

    // Use best surge value (Lend Health class feature)
    const usedSurgeValue = Math.max(paladinSurgeValue, targetSurgeValue);

    // Apply healing using fluent interface
    await target.heal(0, 0, usedSurgeValue + chaMod);

    // Visual effect using Sequencer
    new Sequence()
        .effect('modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_400x400.webm')
        .atLocation(target.token)
        .scale(0.5)
        .play();

    // Consume paladin's surge
    paladin.actor.update({ 'system.details.surges.value': paladinSurges - 1 });

    // Create chat message
    ChatMessage.create({
        speaker: ref.actor.name,
        flavor: `Lay on hands`,
        content: `${target.actor.name} gains ${usedSurgeValue + chaMod} hit points.`
    });
}

main(this);
```

This example demonstrates:
- Fluent character and targeting APIs
- Clean, readable power logic
- Proper resource checking
- Integration with Sequencer for visual effects
- Helpful chat feedback

**Example with VFX Power Sources** - Various visual effects:
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);

    const target = await Target.fromCharacter(caster)
        .range(10)
        .selectTarget(ref.item.img);

    if (!target) return;

    // Teleportation with beam
    await VFX4e.teleport(caster, target, 'LIGHTNING');

    // Or with custom configuration
    await VFX4e.teleport(caster, target, {
        color: 'purple',
        beam: 'jb2a.energy_strands.range.standard.purple',
        useBeam: true,  // Show beam linking the two squares
        fadeIn: 100,
        duration: 600
    });

    // Beam effect for rays, chains, ranged attacks
    await VFX4e.beam(caster, target, 'FIRE');

    // Custom beam
    await VFX4e.beam(caster, target, {
        file: 'jb2a.scorching_ray.01.orange',
        scale: 1.2,
        duration: 1000
    });

    // Impact on target
    await VFX4e.impact(target, 'DIVINE');

    // Aura around character
    await VFX4e.aura(caster, 'NATURE');
}
```

**Example with Character Ability Methods**:
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);

    // Get individual ability mods
    const strMod = caster.getAbilityMod('str');
    const wisMod = caster.getAbilityMod('wis');

    // Or get all at once
    const mods = caster.getAbilityMods();
    const totalBonus = mods.str + mods.wis;

    // Surge management
    if (!caster.hasSurges(2)) {
        ui.notifications.warn('Not enough healing surges!');
        return;
    }

    const { surgeValue } = caster.getSurges();

    await caster.heal(2, 2, totalBonus);
    await caster.consumeSurges(2);

    await Chat4e.healing(caster, [caster], surgeValue * 2 + totalBonus, 'Self Heal');
}
```

**Example with Chat4e Variations**:
```javascript
// Healing message
await Chat4e.healing(paladin, [target], 25, 'Lay on Hands');
// Output: "Talaerin gains 25 hit points."

// Temp HP message
await Chat4e.tempHp(spirit, adjacentAllies, 5, 'Protecting Spirit');
// Output: "Grund, Horgrim gains 5 temporary hit points."

// Effect message
await Chat4e.effect(paladin, targets, 'Divine Sanction', 'Ardent Strike');
// Output: "Divine Sanction is applied to Goblin Warrior."

// Damage message
await Chat4e.damage(wizard, [target], 15, 'fire', 'Scorching Burst');
// Output: "Orc Berserker takes 15 fire damage."

// Custom message for complex situations
await Chat4e.power(caster, 'Complex Power', 'Custom message with HTML <b>bold</b>');
```

**Example with Attack4e** - Using item attack system:
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;

    // Select targets
    const targets = await Target.fromCharacter(caster)
        .range(10)
        .type('enemies')
        .selectCharacters(item.img);

    if (!targets || targets.length === 0) return;

    // Simple: Attack and damage in one call with callbacks
    const results = await Attack4e.attackAndDamage(item, targets, {
        onHit: async (target, attackResult) => {
            await VFX4e.impact(target, 'FIRE');
            console.log(`Hit ${target.name}! Roll: ${attackResult.total}`);
        },
        onMiss: async (target, attackResult) => {
            console.log(`Missed ${target.name}. Roll: ${attackResult.total} vs Defense: ${attackResult.defense}`);
        }
    });

    // Access results
    const hitCount = results.attacks.filter(a => a.hit).length;
    await Chat4e.power(caster, item.name, `Hit ${hitCount} out of ${targets.length} targets!`);
}
```

**Example with Attack4e** - Manual control for complex powers:
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;
    const chaMod = caster.getAbilityMod('cha');

    // Select target
    const [target] = await Target.fromCharacter(caster)
        .range(20)
        .type('enemies')
        .selectCharacters(item.img);

    if (!target) return;

    // Attack roll using item (includes all bonuses)
    const attackResults = await Attack4e.rollAttack(item, target, {
        fastForward: false  // Show dialog
    });

    if (attackResults[0]?.hit) {
        // Use item damage
        await Attack4e.rollDamage(item, target, {
            fastForward: true,
            critical: Attack4e.isCritical(attackResults[0].roll)
        });

        // Or roll custom damage
        const bonusDamage = await new Roll(`2d6 + ${chaMod}`).evaluate({ async: true });
        await bonusDamage.toMessage({
            flavor: 'Bonus Fire Damage',
            speaker: ChatMessage.getSpeaker({ actor: caster.actor })
        });

        await VFX4e.impact(target, 'FIRE');
    }
}
```

**Example with Attack4e** - Chain attacks (like Furious Bolts):
```javascript
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;

    const hitTargets = [];
    const attackedTargets = new Set();

    // Primary target
    const [primaryTarget] = await Target.fromCharacter(caster)
        .range(20)
        .type('enemies')
        .selectCharacters(item.img);

    if (!primaryTarget) return;
    attackedTargets.add(primaryTarget.actor.id);

    // Primary attack
    const primaryResults = await Attack4e.rollAttack(item, primaryTarget);

    if (primaryResults[0]?.hit) {
        hitTargets.push(primaryTarget);
        await item.rollDamage({ fastForward: true });
        await VFX4e.impact(primaryTarget, 'LIGHTNING');

        // Chain secondary attacks
        let currentOrigin = primaryTarget;
        let continueChain = true;

        while (continueChain) {
            const potentialTargets = Target.fromCharacter(currentOrigin)
                .range(10)
                .type('enemies')
                .get()
                .filter(t => !attackedTargets.has(t.actor.id));

            if (potentialTargets.length === 0) break;

            const [secondaryTarget] = await Target.fromCharacter(currentOrigin)
                .range(10)
                .type('enemies')
                .selectCharacters(item.img);

            if (!secondaryTarget || attackedTargets.has(secondaryTarget.actor.id)) break;

            attackedTargets.add(secondaryTarget.actor.id);

            // Show chain VFX using beam
            await VFX4e.beam(currentOrigin, secondaryTarget, 'LIGHTNING');

            // Secondary attack
            const secondaryResults = await Attack4e.rollAttack(item, secondaryTarget);

            if (secondaryResults[0]?.hit) {
                hitTargets.push(secondaryTarget);
                // Custom damage for secondary
                const damage = await new Roll('2d4 + @chaMod').evaluate({ async: true });
                await damage.toMessage({ flavor: 'Chain Lightning Damage' });
                await VFX4e.impact(secondaryTarget, 'LIGHTNING');
                currentOrigin = secondaryTarget;
            } else {
                continueChain = false;
            }
        }
    }

    await Chat4e.power(caster, item.name, `Chain hit ${hitTargets.length} creatures!`);
}
```

### Macro Script Pattern

Macros in `src/scripts/macros/` receive a `scope` object with parameters:

```javascript
// Example: src/scripts/macros/general/add_effect.js
const { tokenIdentifier, effectData } = scope;

const token = Actor4e.findTokenByIdentifier(tokenIdentifier);
const actor = token.actor;
const activeEffect = new ActiveEffect(effectData);

await actor.createEmbeddedDocuments('ActiveEffect', [activeEffect]);
```

Macros are called by Helper4e static methods and run with permissions to modify any character.

## Documentation Requirements

### JSDoc is Mandatory

**All functions, methods, classes, and complex types MUST be documented with JSDoc.** Since this is a JavaScript project (not TypeScript), JSDoc provides type safety, IDE autocomplete, and documentation.

#### Required JSDoc Elements

1. **All function/method parameters** - Type and description
2. **Return types** - What the function returns
3. **Class properties** - Type annotations
4. **Complex objects** - Define with `@typedef` or inline object types

#### JSDoc Examples from the Codebase

**Good - Character class methods:**
```javascript
/**
 * @param {Actor} actor
 * @returns {Character}
 */
static fromActor(actor) {
    return new Character(actor);
}

/**
 * @param {Token} token
 * @returns {Character}
 */
static fromToken(token) {
    const actor = token.actor;
    return new Character(actor);
}

/**
 * @param {number} surge Number of surges to spend
 * @param {number} cost Additional cost
 * @param {number} additional Additional healing value
 */
async heal(surge, cost, additional = 0) {
    return Helper4e.heal(this._actor, additional, cost, surge);
}

/**
 * @param {Character} character
 * @returns {boolean}
 */
isAdjacent(character) {
    return this.tokens.some(token =>
        character.tokens.some(otherToken =>
            Scene4e.isAdjacent(token, otherToken)
        )
    );
}
```

**Good - Effect creation:**
```javascript
/**
 * Create an effect from data with the corresponding duration
 *
 * @param {Object} data The effect data, with name, description and icon
 * @param {string} data.name Effect name
 * @param {string} data.description Effect description (HTML allowed)
 * @param {string} data.icon Path to effect icon
 * @param {'endOfUserTurn' | 'endOfTargetTurn' | 'saveEnds'} durationType
 * @param {Character} origin The character who created the effect
 * @returns {Object} Complete effect object ready for FoundryVTT
 */
static createEffect(data, durationType, origin) {
    // ...
}
```

**Good - Target filtering:**
```javascript
/**
 * @param {'creatures' | 'allies' | 'enemies'} type
 * @returns {Target}
 */
type(type) {
    this._type = type;
    return this;
}

/**
 * Get the Character instances from the Target object.
 *
 * @returns {Character[]}
 */
get() {
    // ...
}

/**
 * Select a target interactively with range validation
 *
 * @param {string} icon Path to the icon for the targeting cursor
 * @returns {Promise<Target | null>} The selected target, or null if cancelled
 */
async selectTarget(icon) {
    // ...
}
```

**Good - Helper functions:**
```javascript
/**
 * @param {Actor} actor The actor to heal
 * @param {number} value Additional healing value
 * @param {number} surgeConsumed Number of surges consumed
 * @param {number} surgeValue Number of surge values to apply
 * @returns {Promise<boolean>}
 */
static async heal(actor, value, surgeConsumed, surgeValue) {
    // ...
}
```

#### Complex Type Definitions

When working with complex objects, define them with `@typedef`:

```javascript
/**
 * @typedef {Object} EffectData
 * @property {string} name - Effect name
 * @property {string} description - Effect description (HTML)
 * @property {string} icon - Path to icon file
 * @property {Object} [duration] - Duration object
 * @property {number} [duration.rounds] - Number of rounds
 * @property {Object} [flags] - System flags
 */

/**
 * @typedef {Object} SurgeData
 * @property {number} value - Current surges
 * @property {number} max - Maximum surges
 * @property {number} surgeValue - HP per surge
 */

/**
 * @param {EffectData} effectData
 * @returns {Promise<void>}
 */
async applyEffect(effectData) {
    // ...
}
```

#### Scope Objects for Macros

Macros receive scope objects. Document them thoroughly:

```javascript
/**
 * Apply healing to an actor
 *
 * @param {Object} scope
 * @param {string} scope.actorIdentifier - Actor name or identifier
 * @param {number} scope.value - Base healing value
 * @param {Object} scope.surge - Healing surge data
 * @param {number} scope.surge.surgeAmount - Number of surges consumed
 * @param {number} scope.surge.surgeValueAmount - Surge value multiplier
 * @returns {Promise<boolean>}
 */
static async macroApplyHeal(scope) {
    const { actorIdentifier, surge, value } = scope;
    // ...
}
```

#### Property Documentation

Document class properties with JSDoc:

```javascript
class Character {
    /** @type {Actor} */
    _actor;

    /** @type {number} */
    _cachedInitiative;

    /**
     * @returns {Actor}
     */
    get actor() {
        return this._actor;
    }

    /**
     * @returns {Token[]}
     */
    get tokens() {
        return this._actor.getActiveTokens(true);
    }
}
```

#### Requirements Summary

✅ **Always document:**
- Function/method parameters with types
- Return types
- Object property structures
- Class properties
- Enum-like string literals ('allies' | 'enemies')

✅ **Use descriptive comments:**
- Explain what the function does
- Clarify non-obvious behavior
- Document side effects

✅ **Define complex types:**
- Use `@typedef` for reusable types
- Inline object structures for one-off types

❌ **Don't skip JSDoc because "it's obvious"**
- Even simple getters need `@returns`
- Even clear parameters need `@param`
- JSDoc powers IDE autocomplete and type checking

## Development Guidelines

### When Adding New Functionality

1. **Identify the right abstraction layer** - Which class should this belong to?
2. **Use fluent patterns** - Method chaining, readable names
3. **Extend existing classes** - Don't bypass abstractions
4. **Keep static methods** - Required for macro accessibility
5. **Update EffectLibrary** - Add reusable effects there, not inline
6. **Write complete JSDoc** - Type all parameters, returns, and properties

### Anti-Patterns to Avoid

❌ Direct Foundry API access in power scripts:
```javascript
// Bad
const tokens = game.scenes.current.tokens;
await actor.createEmbeddedDocuments('ActiveEffect', [...]);
```

✅ Use abstraction layers:
```javascript
// Good
const tokens = Scene4e.getCurrentScenesTokens();
await character.addEffect(effect);
```

❌ Inline data manipulation:
```javascript
// Bad
const targets = Scene4e.getCurrentScenesTokens()
    .filter(t => canvas.grid.measureDistance(origin, t) <= 5)
    .filter(t => t.disposition !== caster.disposition);
```

✅ Fluent API:
```javascript
// Good
const targets = Target.fromCharacter(caster)
    .range(5)
    .type('enemies')
    .get();
```

❌ Direct system data access for stats:
```javascript
// Bad
const chaMod = character.getSystem()?.abilities?.cha?.mod;
const surges = character.getSystem()?.details.surges.value;
```

✅ Use Character abstraction methods:
```javascript
// Good
const chaMod = character.getAbilityMod('cha');
const { value: surges } = character.getSurges();
```

❌ Manual ChatMessage creation:
```javascript
// Bad
ChatMessage.create({
    speaker: ref.actor.name,
    flavor: 'Power Name',
    content: `${target.name} gains ${amount} hit points.`
});
```

✅ Use Chat4e:
```javascript
// Good
await Chat4e.healing(caster, [target], amount, 'Power Name');
```

❌ Repetitive Sequencer code:
```javascript
// Bad - repeated in every power
new Sequence()
    .effect('modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_400x400.webm')
    .atLocation(target.token)
    .scale(0.5)
    .play();

// Bad - direct Sequence for beam effects
new Sequence()
    .effect()
        .file('jb2a.chain_lightning.secondary.blue')
        .atLocation(origin.token)
        .stretchTo(target.token)
    .play();
```

✅ Use VFX4e with power sources:
```javascript
// Good - consistent and themeable
await VFX4e.healing(target, 'DIVINE');
await VFX4e.teleport(caster, destination, 'ARCANE');
await VFX4e.beam(origin, target, 'LIGHTNING');
await VFX4e.impact(target, 'FIRE');
```

## Module Dependencies

Required FoundryVTT modules (defined in `src/module.json`):
- **ActiveAuras** - Aura effect system
- **lib-wrapper** - Function wrapping library
- **socketlib** - Socket communication
- **sequencer** - Visual effects

System requirement: **dnd4e**

## Module Registration

`src/module.json` defines scripts loaded at initialization. The following scripts must be included in order:
1. `actor.js` - Actor/token lookup utilities
2. `helper.js` - Macro delegation layer
3. `scene.js` - Scene and spatial calculations
4. `character.js` - Main character abstraction
5. `effects.js` - Effect creation and library
6. `target.js` - Targeting system
7. `user.js` - User targeting management
8. `attack.js` - Attack and damage roll abstraction
9. `chat.js` - Chat message utilities
10. `vfx.js` - Visual effects with power sources

These provide the global classes available to all power scripts.

**Current scripts configuration in `src/module.json`**:
```json
{
  "scripts": [
    "scripts/actor.js",
    "scripts/helper.js",
    "scripts/scene.js",
    "scripts/character.js",
    "scripts/effects.js",
    "scripts/target.js",
    "scripts/user.js",
    "scripts/attack.js",
    "scripts/chat.js",
    "scripts/vfx.js"
  ]
}
```

## Publishing

Releases via GitHub Actions (`.github/workflows/publish.yml`):
1. Create a GitHub release with version tag
2. Workflow creates zip from `src/`: `module.json`, `style.css`, `scripts/`, `languages/`
3. Artifacts automatically attached to release

## Key Conventions

- **All utility class methods must be static** - Required for macro accessibility
- **Use fluent APIs** - Chain methods, make code self-documenting
- **Never bypass abstractions** - Extend classes instead of direct access
- Effect durations tie to combat rounds and initiative order
- All cross-character modifications go through Helper4e → macros
- Use `replaceEffect()` for unique effects (like marks)
- Use `addEffect()` for stackable effects
- Add reusable effects to EffectLibrary
