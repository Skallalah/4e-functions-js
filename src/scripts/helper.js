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

    static async macroApplyEffect(scope) {
        const { tokenIdentifier, effectData } = scope;

        const token = Actor4e.findTokenByIdentifier(tokenIdentifier);

        const actor = token.actor;

        const activeEffect = new ActiveEffect(effectData);

        await actor.createEmbeddedDocuments('ActiveEffect', [activeEffect]);
    }

    static async system(actor) {
        return game.macros.getName('GetActorData').execute({ actorName: actor.name })
    }
}
