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

    static async damage() {
        // todo
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
