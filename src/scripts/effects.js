class Effect4e {
    /**
     * Foundry Active Effect change modes, by name. Use these instead of raw
     * numbers in `changes` entries so the intent is readable.
     *
     * Mirrors `CONST.ACTIVE_EFFECT_MODES`. In 4e terms:
     * - `ADD`: add the value to the attribute. Use for **untyped** bonuses and
     *   for **all penalties** (untyped values always stack per 4e rules).
     * - `UPGRADE`: keep only the higher of the current and new value. Use for
     *   **typed** bonuses (feat/item/power/...) so only the highest of a given
     *   type applies ("doesn't stack with another bonus of the same type").
     * - `OVERRIDE`: replace the value entirely. Use to set a value outright
     *   (e.g. base HP, or forcing a stat to a fixed number).
     * - `DOWNGRADE`: keep only the lower value (rarely needed directly; prefer
     *   the `ceil`/`floor`/`absolute` special keys for caps — see the reference).
     * - `MULTIPLY` / `CUSTOM`: rarely used in 4e; included for completeness.
     *
     * @readonly
     * @enum {number}
     */
    static MODE = {
        CUSTOM: 0,
        MULTIPLY: 1,
        ADD: 2,
        DOWNGRADE: 3,
        UPGRADE: 4,
        OVERRIDE: 5
    };

    /**
     * Build a 4e-correct Active Effect change entry.
     *
     * The change mode is derived from the bonus type so stacking follows 4e
     * rules automatically:
     * - `untyped` (and therefore every penalty) -> `ADD`, because untyped
     *   values always stack.
     * - any typed bonus (`feat`, `item`, `power`, ...) -> `UPGRADE`, so only the
     *   highest modifier of that type applies.
     *
     * The bonus type is appended to the attribute to form the final key, e.g.
     * `bonus('system.defences.fort', -2)` -> key `system.defences.fort.untyped`.
     *
     * @param {string} attribute Attribute key WITHOUT the bonus-type segment,
     *   e.g. `'system.defences.fort'` or `'system.modifiers.attack'`. See
     *   docs/reference/foundry-4e-effects.md for valid keys.
     * @param {number|string} value Bonus (positive) or penalty (negative) amount.
     *   Accepts an `@variable` formula string.
     * @param {'untyped'|'feat'|'race'|'item'|'class'|'power'|'enhance'|'armour'|'shield'} [bonusType='untyped']
     *   The 4e bonus type. Penalties should stay `untyped`.
     * @param {number} [priority] Optional explicit priority; omit to use the
     *   default for the chosen mode (ADD=20, UPGRADE=40, OVERRIDE=50).
     * @returns {{key: string, mode: number, value: (number|string), priority?: number}}
     */
    static bonus(attribute, value, bonusType = 'untyped', priority) {
        const mode = bonusType === 'untyped' ? Effect4e.MODE.ADD : Effect4e.MODE.UPGRADE;
        const change = { key: `${attribute}.${bonusType}`, mode, value };

        if (priority !== undefined) change.priority = priority;

        return change;
    }

    /**
     * Build an `OVERRIDE` Active Effect change that replaces a value entirely.
     *
     * Use when a value must be set outright rather than added to (e.g. base HP,
     * or forcing a stat to a fixed number). For "cap"/"floor" behaviour on a
     * final value, prefer the `ceil`/`floor`/`absolute` special keys instead
     * (see docs/reference/foundry-4e-effects.md).
     *
     * @param {string} key The full attribute key to override.
     * @param {number|string} value The value to set.
     * @param {number} [priority] Optional explicit priority (default 50).
     * @returns {{key: string, mode: number, value: (number|string), priority?: number}}
     */
    static override(key, value, priority) {
        const change = { key, mode: Effect4e.MODE.OVERRIDE, value };

        if (priority !== undefined) change.priority = priority;

        return change;
    }

    /**
     * Build effect data for a standard dnd4e condition, sourced from the
     * system's own status-effect registry (`CONFIG.statusEffects`) instead of
     * hand-copied data. The returned data sets the `statuses` array, so the
     * system treats it as the real condition: the correct icon shows on the
     * token and condition-driven rules fire (e.g. a `dazed`/`prone` target
     * granting combat advantage, marks writing `system.marker`). Name,
     * description and icon are the localized system values.
     *
     * Feed the result to {@link Effect4e.createEffect} (directly, or via
     * `AttackResult.applyEffect({ data })`) to attach a combat duration.
     *
     * @param {string} statusId The dnd4e status id, e.g. `'dazed'`, `'slowed'`,
     *   `'weakened'`, `'immobilized'`, `'prone'`, `'mark_1'`. The full list is
     *   `CONFIG.statusEffects` (ids come from `CONFIG.DND4E.statusEffect`).
     * @param {Object} [overrides={}] Fields merged over the system data — e.g. a
     *   custom `description`, a tweaked `name`, or extra `changes`.
     * @returns {Object} Effect data ready for {@link Effect4e.createEffect}.
     */
    static fromStatus(statusId, overrides = {}) {
        const status = CONFIG.statusEffects.find(s => s.id === statusId);

        if (!status) {
            throw Error(`Unknown dnd4e status '${statusId}'. See CONFIG.statusEffects for valid ids.`);
        }

        return {
            name: game.i18n.localize(status.name),
            description: status.description ? game.i18n.localize(status.description) : '',
            img: status.img,
            statuses: [statusId],
            changes: status.changes ?? [],
            ...overrides
        };
    }

    /**
     * Create an effect from data with the corresponding duration
     *
     * @param {Object} data The effect data, with name, description and icon
     * @param {'endOfUserTurn'|'startOfUserTurn'|'endOfTargetTurn'|'startOfTargetTurn'|'saveEnd'} durationType
     * @param {Character} origin
     */
    static createEffect(data, durationType, origin) {
        if (!game.combat) {
            ui.notifications.warn(`There is no ongoing combat, cannot produce an effect.`);

            return;
        }

        const duration = { rounds: ((game.combat.round + 1)), startRound: game.combat.round };

        return {
            ...data,

            duration,

            flags: {
                dnd4e: {
                    effectData: {
                        durationType,
                        durationTurnInit: origin.combatant.initiative,
                        startTurnInit: origin.combatant.initiative
                    }
                },
            },

            origin: `Actor.${origin.actor.id}`
        }
    }
}


class EffectLibrary {
    static DIVINE_SANCTION = {
        name: 'Divine Sanction',
        description: `<p>A creature subject to a paladin's divine sanction is <strong>marked</strong> by the paladin for the duration of the divine sanction, or until <strong>marked</strong> by a different person. The first time each round a creature <strong>marked</strong> by a paladin's divine sanction makes an attack that doesn't include the paladin as a target, the marked creature takes [[@tier * 3 + @chaMod]] radiant damage.</p>`,
        icon: 'icons/magic/light/orb-container-orange.webp'
    }

    /**
     * Standard "Stunned" condition, sourced from the system so it carries the
     * real `stunned` status (icon, granting combat advantage, etc.).
     * @returns {Object}
     */
    static get STUNNED() {
        return Effect4e.fromStatus('stunned');
    }

    /**
     * Standard "Dazed" condition, sourced from the system so it carries the
     * real `dazed` status (icon, granting combat advantage, etc.).
     * @returns {Object}
     */
    static get DAZED() {
        return Effect4e.fromStatus('dazed');
    }
}