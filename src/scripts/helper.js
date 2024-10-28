class Helper4e {
    static async heal(token, value, surgeConsumed, surgeValue) {
        const surge = { surgeAmount: surgeConsumed, surgeValueAmount: surgeValue };

        return await game.macros.getName('ApplyHeal').execute({ value, surge, actorIdentifier: token.name });
    }

    static async tempHeal(token, value) {
        return await game.macros.getName('ApplyTempHp').execute({ actorIdentifier: token.name, value });
    }

    static async damage() {

    }

    static async macroApplyHeal(scope) {
        const { actorIdentifier, surge, value } = scope;

        const actor = Actor4e.findActorByName(actorIdentifier);

        if (!actor) return undefined;

        await actor.applyDamage(value, -1, surge);

        return true;
    }
}
