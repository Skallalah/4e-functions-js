/**
 * Chat4e - Utility class for creating standardized chat messages
 */
class Chat4e {
    /**
     * Create a generic power-related chat message
     *
     * @param {Character | string} caster The character casting the power, or speaker name
     * @param {string} powerName The name of the power
     * @param {string} content The message content
     * @returns {Promise<ChatMessage>}
     */
    static async power(caster, powerName, content) {
        const speaker = typeof caster === 'string' ? caster : caster.name;

        return ChatMessage.create({
            speaker,
            flavor: powerName,
            content
        });
    }

    /**
     * Create a healing chat message
     *
     * @param {Character | string} caster The character performing the healing
     * @param {Character[]} targets Characters being healed
     * @param {number} amount Amount of HP healed
     * @param {string} powerName Name of the healing power
     * @returns {Promise<ChatMessage>}
     */
    static async healing(caster, targets, amount, powerName) {
        const targetNames = targets.map(t => t.name).join(', ');
        const content = `${targetNames} gains ${amount} hit points.`;

        return this.power(caster, powerName, content);
    }

    /**
     * Create a temporary hit points chat message
     *
     * @param {Character | string} caster The character granting temp HP
     * @param {Character[]} targets Characters receiving temp HP
     * @param {number} amount Amount of temp HP granted
     * @param {string} powerName Name of the power
     * @returns {Promise<ChatMessage>}
     */
    static async tempHp(caster, targets, amount, powerName) {
        const targetNames = targets.map(t => t.name).join(', ');
        const content = `${targetNames} gains ${amount} temporary hit points.`;

        return this.power(caster, powerName, content);
    }

    /**
     * Create an effect application chat message
     *
     * @param {Character | string} caster The character applying the effect
     * @param {Character[]} targets Characters receiving the effect
     * @param {string} effectName Name of the effect
     * @param {string} powerName Name of the power
     * @returns {Promise<ChatMessage>}
     */
    static async effect(caster, targets, effectName, powerName) {
        const targetNames = targets.map(t => t.name).join(', ');
        const content = `${effectName} is applied to ${targetNames}.`;

        return this.power(caster, powerName, content);
    }

    /**
     * Create a damage chat message
     *
     * @param {Character | string} caster The character dealing damage
     * @param {Character[]} targets Characters taking damage
     * @param {number} amount Amount of damage dealt
     * @param {string} damageType Type of damage (e.g., 'fire', 'radiant')
     * @param {string} powerName Name of the power
     * @returns {Promise<ChatMessage>}
     */
    static async damage(caster, targets, amount, damageType, powerName) {
        const targetNames = targets.map(t => t.name).join(', ');
        const content = `${targetNames} takes ${amount} ${damageType} damage.`;

        return this.power(caster, powerName, content);
    }

    /**
     * Create a saving throw chat message
     *
     * @param {Character | string} caster The character forcing the save
     * @param {Character[]} targets Characters making saves
     * @param {string} saveType Type of save (e.g., 'Fortitude', 'Reflex', 'Will')
     * @param {string} powerName Name of the power
     * @returns {Promise<ChatMessage>}
     */
    static async savingThrow(caster, targets, saveType, powerName) {
        const targetNames = targets.map(t => t.name).join(', ');
        const content = `${targetNames} must make a ${saveType} save.`;

        return this.power(caster, powerName, content);
    }

    /**
     * Create a custom chat message with full control
     *
     * @param {Object} options
     * @param {string} options.speaker Speaker name or identifier
     * @param {string} [options.flavor] Flavor text (usually power name)
     * @param {string} options.content Message content
     * @param {string} [options.whisper] Whisper to specific user(s)
     * @returns {Promise<ChatMessage>}
     */
    static async custom(options) {
        return ChatMessage.create(options);
    }
}
