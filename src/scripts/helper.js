class Helper4e {
    static async heal(actor, value, surgeConsumed, surgeValue) {
        const surge = { surgeAmount: surgeConsumed, surgeValueAmount: surgeValue };

        return await game.macros.getName('ApplyHeal').execute({ value, surge, actorIdentifier: actor.name });
    }

    /**
     * 
     * @param {Actor} actor 
     * @param {number} value 
     */
    static async tempHeal(actor, value) {
        return await game.macros.getName('ApplyTempHp').execute({ actorIdentifier: actor.name, value });
    }

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

    static async macroApplyHeal(scope) {
        const { actorIdentifier, surge, value } = scope;

        const actor = Actor4e.findActorByName(actorIdentifier);

        if (!actor) return undefined;

        await actor.applyDamage(value, -1, surge);

        return true;
    }

    static async applyEffect(scope) {
        const { tokenIdentifier, effectData } = scope;

        return await game.macros.getName('ApplyEffectToToken').execute({ tokenIdentifier, effectData });
    }

    static async removeEffect(scope) {
        const { tokenIdentifier, effectIdentifier } = scope;

        return await game.macros.getName('RemoveEffectByName').execute({ tokenIdentifier, effectIdentifier });
    }

    static async replaceEffect(scope) {
        const { tokenIdentifier, effectData } = scope;

        const effectIdentifier = effectData.name;

        await game.macros.getName('RemoveEffectByName').execute({ tokenIdentifier, effectIdentifier });
        await game.macros.getName('ApplyEffectToToken').execute({ tokenIdentifier, effectData });
    }

    static async system(actor) {
        return game.macros.getName('GetActorData').execute({ actorName: actor.name })
    }
}
