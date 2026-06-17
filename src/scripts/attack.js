/**
 * Attack4e - Utility class for managing power attacks and damage rolls
 *
 * Provides abstraction over FoundryVTT's item attack system to:
 * - Launch attacks from items (using all bonuses/penalties)
 * - Capture attack results (hit/miss)
 * - Roll and apply damage
 * - Support multi-target and chained attacks
 */
/**
 * Possible outcomes of an attack roll against a single target.
 * Values match the dnd4e system's `hitstate`, so raw string comparison also works.
 *
 * @readonly
 * @enum {string}
 */
const AttackState = Object.freeze({
    /** Attack hit the target's defense */
    HIT: 'hit',
    /** Critical hit (natural 20 / above crit range) — also counts as a hit */
    CRITICAL: 'critical',
    /** Attack missed the target's defense */
    MISS: 'miss',
    /** Fumble (natural 1) — also counts as a miss */
    FUMBLE: 'fumble',
    /** Target is immune to the attack — counts as a miss */
    IMMUNE: 'immune',
    /** Hit could not be determined (no targets, or automationCombat disabled) */
    UNKNOWN: 'unknown'
});

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
}

class Attack4e {
    /**
     * @typedef {Object} AttackOutcome
     * @property {Character} target - The target, as a Character (token-backed → composite id)
     * @property {AttackState} state - Outcome against this target (see AttackState)
     * @property {number} total - Total of the attack roll for THIS target
     * @property {'ac'|'fort'|'ref'|'will'} defense - Defense targeted
     * @property {Roll} roll - This target's sub-roll (roll.rollArray[i]), or the full roll as fallback
     */

    /**
     * @typedef {Object} DamageResult
     * @property {number} total - Total damage dealt
     * @property {Roll} roll - The damage roll object
     * @property {string} type - Damage type (fire, lightning, etc.)
     * @property {Character} target - The target that took damage
     */

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

    /**
     * Perform an attack using the item's attack configuration
     * This will automatically use all bonuses from the character and item
     *
     * @param {Item} item The power/item being used for the attack
     * @param {Character | Character[]} targets Target(s) for the attack
     * @param {Object} [options={}] Additional options
     * @param {boolean} [options.fastForward=false] Skip attack dialog
     * @param {string} [options.rollMode] Roll mode (roll, gmroll, blindroll, selfroll)
     * @returns {Promise<AttackResult>} Array-like result of AttackOutcome (hits AND misses)
     */
    static async rollAttack(item, targets, options = {}) {
        const { fastForward = false, rollMode } = options;

        // Normalize to array
        const targetArray = Array.isArray(targets) ? targets : [targets];

        if (targetArray.length === 0) {
            ui.notifications.warn('No targets specified for attack.');
            return AttackResult.of([], item, null);
        }

        // Set user targets so Foundry's attack system computes per-target hit/miss
        User4e.updateTargets(targetArray);

        // Roll attack using the item's native system.
        // This posts the chat card with per-target hit prediction and returns the roll.
        const roll = await item.rollAttack({ fastForward, rollMode });

        if (!roll) {
            console.warn('Attack roll failed or was cancelled');
            return AttackResult.of([], item, null);
        }

        const multirollData = Array.isArray(roll.multirollData) ? roll.multirollData : null;

        // Fallback: no per-target data (no targets selected, or "automationCombat" disabled).
        // Keep all available data, but mark the hit as indeterminate.
        if (!multirollData || multirollData.length === 0) {
            console.warn(
                'Attack4e.rollAttack: no multirollData available ' +
                '(likely no targets selected or the "automationCombat" client setting is disabled). ' +
                'Returning indeterminate hit results.'
            );

            const defense = item.system?.attack?.def;

            const outcomes = targetArray.map(target => ({
                target,
                state: AttackState.UNKNOWN,
                total: roll.total,
                defense,
                roll
            }));

            return AttackResult.of(outcomes, item, null);
        }

        // The system already computed hit/miss/crit/fumble/immunity per target.
        // Read multirollData and map each entry back to its input Character.
        const outcomes = multirollData.map((entry, index) => ({
            target: this._matchTarget(targetArray, entry.targetID, index),
            state: this._toState(entry.hitstate),
            total: entry.total,
            defense: entry.def,
            roll: roll.rollArray?.[index] ?? roll
        }));

        return AttackResult.of(outcomes, item, null);
    }

    /**
     * Normalize the system's raw hitstate string into an AttackState enum value.
     *
     * @private
     * @param {string} hitstate Raw hitstate from multirollData
     * @returns {AttackState}
     */
    static _toState(hitstate) {
        return Object.values(AttackState).includes(hitstate) ? hitstate : AttackState.UNKNOWN;
    }

    /**
     * Whether an attack result is a hit (includes critical hits).
     *
     * @param {AttackOutcome} result
     * @returns {boolean}
     */
    static isHit(result) {
        return result?.state === AttackState.HIT || result?.state === AttackState.CRITICAL;
    }

    /**
     * Whether an attack result is a miss (includes fumbles and immune targets).
     *
     * @param {AttackOutcome} result
     * @returns {boolean}
     */
    static isMiss(result) {
        return result?.state === AttackState.MISS
            || result?.state === AttackState.FUMBLE
            || result?.state === AttackState.IMMUNE;
    }

    /**
     * Whether the target was immune to the attack.
     *
     * @param {AttackOutcome} result
     * @returns {boolean}
     */
    static isImmune(result) {
        return result?.state === AttackState.IMMUNE;
    }

    /**
     * Whether the attack roll was a fumble.
     *
     * @param {AttackOutcome} result
     * @returns {boolean}
     */
    static isFumble(result) {
        return result?.state === AttackState.FUMBLE;
    }

    /**
     * Filter attack results to only the targets that were hit.
     *
     * @param {AttackOutcome[]} results
     * @returns {AttackOutcome[]}
     */
    static hits(results) {
        return results.filter(r => this.isHit(r));
    }

    /**
     * Filter attack results to only the targets that were missed.
     *
     * @param {AttackOutcome[]} results
     * @returns {AttackOutcome[]}
     */
    static misses(results) {
        return results.filter(r => this.isMiss(r));
    }

    /**
     * Map a multiroll entry's targetID (token id) back to the input Character.
     * Falls back to positional index when no token id matches.
     *
     * @private
     * @param {Character[]} targets Input characters
     * @param {string} targetID Token id from multirollData
     * @param {number} index Fallback positional index
     * @returns {Character}
     */
    static _matchTarget(targets, targetID, index) {
        const matched = targets.find(character => {
            try {
                return character.tokens?.some(token => token.id === targetID);
            } catch {
                return false;
            }
        });

        return matched ?? targets[index];
    }

    /**
     * Roll damage using the item's damage configuration
     *
     * @param {Item} item The power/item being used for damage
     * @param {Character | Character[]} targets Target(s) taking damage
     * @param {Object} [options={}] Additional options
     * @param {boolean} [options.fastForward=true] Skip damage dialog
     * @param {boolean} [options.critical=false] Whether this is a critical hit
     * @param {string} [options.rollMode] Roll mode
     * @returns {Promise<DamageResult[]>} Array of damage results for each target
     */
    static async rollDamage(item, targets, options = {}) {
        const { fastForward = true, critical = false, rollMode } = options;

        // Normalize to array
        const targetArray = Array.isArray(targets) ? targets : [targets];

        if (targetArray.length === 0) {
            ui.notifications.warn('No targets specified for damage.');
            return [];
        }

        // Set user targets for Foundry's damage system
        User4e.updateTargets(targetArray);

        // Roll damage using item's system
        const damageRoll = await item.rollDamage({
            fastForward,
            critical,
            rollMode
        });

        if (!damageRoll) {
            console.warn('Damage roll failed or was cancelled');
            return [];
        }

        const results = [];

        // Get damage type from item
        const damageType = this._getDamageType(item);

        // Create result for each target
        for (const target of targetArray) {
            results.push({
                total: damageRoll.total,
                roll: damageRoll,
                type: damageType,
                target
            });
        }

        return results;
    }

    /**
     * Perform a complete attack sequence: attack roll, then damage if hit
     *
     * @param {Item} item The power/item being used
     * @param {Character | Character[]} targets Target(s) for the attack
     * @param {Object} [options={}] Additional options
     * @param {boolean} [options.skipDamageOnMiss=true] Don't roll damage on miss
     * @param {Function} [options.onHit] Callback when an attack hits: (target, attackResult) => {}
     * @param {Function} [options.onMiss] Callback when an attack misses: (target, attackResult) => {}
     * @returns {Promise<{attacks: AttackResult[], damages: DamageResult[]}>}
     */
    static async attackAndDamage(item, targets, options = {}) {
        const {
            skipDamageOnMiss = true,
            onHit,
            onMiss,
            ...attackOptions
        } = options;

        // Roll attacks
        const attackResults = await this.rollAttack(item, targets, attackOptions);

        const hitTargets = [];
        const damages = [];

        // Process attack results
        for (const result of attackResults) {
            if (this.isHit(result)) {
                hitTargets.push(result.target);

                if (onHit) {
                    await onHit(result.target, result);
                }
            } else {
                if (onMiss) {
                    await onMiss(result.target, result);
                }
            }
        }

        // Roll damage for hits (or all targets if skipDamageOnMiss is false)
        const damageTargets = skipDamageOnMiss ? hitTargets : attackResults.map(r => r.target);

        if (damageTargets.length > 0) {
            const damageResults = await this.rollDamage(item, damageTargets, attackOptions);
            damages.push(...damageResults);
        }

        return {
            attacks: attackResults,
            damages
        };
    }

    /**
     * Helper to get damage type from item
     *
     * @private
     * @param {Item} item Attack item
     * @returns {string} Damage type
     */
    static _getDamageType(item) {
        // Extract damage type from item system
        const damageFormula = item.system?.damage?.parts?.[0];

        if (damageFormula && damageFormula.length > 1) {
            return damageFormula[1] || 'untyped';
        }

        return 'untyped';
    }

    /**
     * Check if an attack result was a critical hit.
     * The crit state is computed by the system and carried on the AttackResult.
     *
     * @param {AttackOutcome} result An attack result from rollAttack
     * @returns {boolean} Whether the attack was a critical hit
     */
    static isCritical(result) {
        return result?.state === AttackState.CRITICAL;
    }

    /**
     * Prompt user to confirm if an attack hit (for manual resolution)
     * Use this when automated defense checking isn't available
     *
     * @param {Character} target Target of the attack
     * @param {string} [attackName='Attack'] Name of the attack
     * @returns {Promise<boolean>} Whether the attack hit
     */
    static async promptHit(target, attackName = 'Attack') {
        return new Promise((resolve) => {
            new Dialog({
                title: `${attackName} Result`,
                content: `<p>Did the ${attackName} hit <strong>${target.name}</strong>?</p>`,
                buttons: {
                    hit: {
                        icon: '<i class="fas fa-check"></i>',
                        label: 'Hit',
                        callback: () => resolve(true)
                    },
                    miss: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Miss',
                        callback: () => resolve(false)
                    }
                },
                default: 'hit',
                close: () => resolve(false)
            }).render(true);
        });
    }
}
