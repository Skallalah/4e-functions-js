export const DIVINE_SANCTION = {
    name: 'Divine Sanction',
    description: `<p>A creature subject to a paladin's divine sanction is <strong>marked</strong> by the paladin for the duration of the divine sanction, or until <strong>marked</strong> by a different person. The first time each round a creature <strong>marked</strong> by a paladin's divine sanction makes an attack that doesn't include the paladin as a target, the marked creature takes [[@tier * 3 + @chaMod]] radiant damage.</p>`,
    icon: 'icons/magic/light/orb-container-orange.webp'
}

class Effect4e {
    name;
    description;
    icon;

    duration;
    

    /**
     * Create an effect from data with the corresponding duration
     * 
     * @param {Object} data The effect data, with name, description and icon
     * @param {string} duration 
     * @param {Character} origin
     */
    static createEffect(data, duration, origin) {

    }
}