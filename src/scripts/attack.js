/**
 * Attack4e - Utility class for managing power attacks and damage rolls
 *
 * Provides abstraction over FoundryVTT's item attack system to:
 * - Launch attacks from items (using all bonuses/penalties)
 * - Capture attack results (hit/miss)
 * - Roll and apply damage
 * - Support multi-target and chained attacks
 */
class Attack4e {
    /**
     * @typedef {Object} AttackResult
     * @property {boolean} hit - Whether the attack hit
     * @property {Roll} roll - The attack roll object
     * @property {Character} target - The target of the attack
     * @property {number} total - Total of the attack roll
     * @property {number} defense - Target's defense value
     */

    /**
     * @typedef {Object} DamageResult
     * @property {number} total - Total damage dealt
     * @property {Roll} roll - The damage roll object
     * @property {string} type - Damage type (fire, lightning, etc.)
     * @property {Character} target - The target that took damage
     */

    /**
     * Perform an attack using the item's attack configuration
     * This will automatically use all bonuses from the character and item
     *
     * @param {Item} item The power/item being used for the attack
     * @param {Character | Character[]} targets Target(s) for the attack
     * @param {Object} [options={}] Additional options
     * @param {boolean} [options.fastForward=false] Skip attack dialog
     * @param {string} [options.rollMode] Roll mode (roll, gmroll, blindroll, selfroll)
     * @returns {Promise<AttackResult[]>} Array of attack results for each target
     */
    static async rollAttack(item, targets, options = {}) {
        const { fastForward = false, rollMode } = options;

        // Normalize to array
        const targetArray = Array.isArray(targets) ? targets : [targets];

        if (targetArray.length === 0) {
            ui.notifications.warn('No targets specified for attack.');
            return [];
        }

        const results = [];

        // Set user targets for Foundry's attack system
        User4e.updateTargets(targetArray);

        // Roll attack using item's system
        const attackRoll = await item.rollAttack({
            fastForward,
            rollMode
        });

        if (!attackRoll) {
            console.warn('Attack roll failed or was cancelled');
            return [];
        }

        // Parse results for each target
        // Note: FoundryVTT 4e system may handle multiple targets differently
        // This is a basic implementation that may need adjustment
        for (const target of targetArray) {
            // TODO: Properly extract hit/miss for each target from the roll
            // For now, we'll need to check the roll result against target defense

            const defenseValue = this._getTargetDefense(target, item);
            const hit = attackRoll.total >= defenseValue;

            results.push({
                hit,
                roll: attackRoll,
                target,
                total: attackRoll.total,
                defense: defenseValue
            });
        }

        return results;
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
            if (result.hit) {
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
     * Helper to get target's defense value for the attack
     *
     * @private
     * @param {Character} target Target character
     * @param {Item} item Attack item
     * @returns {number} Defense value
     */
    static _getTargetDefense(target, item) {
        // TODO: Extract defense type from item (AC, Fortitude, Reflex, Will)
        // For now, return a placeholder
        const defenseType = item.system?.attack?.def || 'ac';
        const defenses = target.getSystem()?.defences || {};

        return defenses[defenseType]?.value || 10;
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
     * Check if an attack roll was a critical hit
     *
     * @param {Roll} roll The attack roll
     * @param {number} [critThreshold=20] Crit threshold (usually 20, or lower for improved crit)
     * @returns {boolean} Whether the roll was a critical hit
     */
    static isCritical(roll, critThreshold = 20) {
        // Check if the d20 roll was >= threshold
        const d20Result = roll.terms[0]?.results?.[0]?.result;
        return d20Result >= critThreshold;
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
