class Effect4e {
    /**
     * Create an effect from data with the corresponding duration
     * 
     * @param {Object} data The effect data, with name, description and icon
     * @param {'endOfUserTurn'} durationType 
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
}