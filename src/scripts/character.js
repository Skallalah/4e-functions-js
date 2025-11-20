class Character {
    _actor;

    // Base Getter / Setter

    /**
     * @returns {Actor}
     */
    get actor() {
        return this._actor;
    }

    /**
     * @param {Actor} actor 
     */
    constructor(actor) {
        this._actor = actor;
    }

    /**
     * 
     * @param {Actor} actor 
     * @returns {Character}
     */
    static fromActor(actor) {
        return new Character(actor);
    }

    /**
     * 
     * @param {Token} token 
     * @returns {Character}
     */
    static fromToken(token) {
        const actor = token.actor;

        return new Character(actor);
    }

    /**
     * 
     * @param {string} name 
     * @returns {Character}
     */
    static fromName(name) {
        const actor = Actor4e.findActorByName(name)

        if (!actor) throw Error(`no actor with name ${name}`)

        return new Character(actor);
    }

    /**
     * 
     * @param {Character} character 
     * @returns {boolean}
     */
    isAdjacent(character) {
        /** @todo replace this with current target methods */
        return this.tokens.some(token => character.tokens.some(otherToken => Scene4e.isAdjacent(token, otherToken)));
    }

    // Apply Changes

    /**
     * 
     * @param {number} surge 
     * @param {number} cost 
     * @param {number} additional 
     */
    async heal(surge, cost, additional = 0) {
        return Helper4e.heal(this._actor, additional, cost, surge);
    }

    /**
     * 
     * @param {number} value 
     */
    async tempHeal(value) {
        return Helper4e.tempHeal(this._actor, value);
    }

    async damage(value) {
        return;
    }

    async addEffect(effect) {
        const tokenIdentifier = this.token.id;

        await Helper4e.applyEffect({ tokenIdentifier, effectData: effect });
    }

    async replaceEffect(effect) {
        const tokenIdentifier = this.token.id;

        await Helper4e.replaceEffect({ tokenIdentifier, effectData: effect });
    }

    // derived getters

    get tokens() {
        const tokens = this._actor.getActiveTokens(true);

        if (!tokens) throw new Error(`no tokens detected in current scene`)

        return tokens;
    }

    get token() {
        if (this.tokens?.length > 1) throw new Error(`multiple tokens detected in scene, use this.tokens instead`)

        return this.tokens[0];
    }

    /**
     * @return {string}
     */
    get name() {
        return this._actor.name;
    }

    get combatant() {
        return game.combat.combatants.find(c => c.tokenId === this.token.id);
    }

    /**
     *
     * @param {boolean} owned If the script is triggered by the current token owner
     * @returns The Actor system data
     */
    getSystem(owned = true) {
        if (owned) {
            return this._actor.system;
        } else {
            return Helper4e.getSystem(this._actor.getSystem()?.name)
        }
    }

    // Ability Scores

    /**
     * Get an ability score object
     *
     * @param {'str' | 'con' | 'dex' | 'int' | 'wis' | 'cha'} ability The ability score name
     * @returns {Object | undefined} The ability object with value, mod, etc.
     */
    getAbility(ability) {
        return this.getSystem()?.abilities?.[ability];
    }

    /**
     * Get an ability modifier
     *
     * @param {'str' | 'con' | 'dex' | 'int' | 'wis' | 'cha'} ability The ability score name
     * @returns {number} The ability modifier (defaults to 0 if not found)
     */
    getAbilityMod(ability) {
        return this.getSystem()?.abilities?.[ability]?.mod ?? 0;
    }

    /**
     * Get all ability modifiers as an object
     *
     * @returns {Object} Object with all ability modifiers {str, con, dex, int, wis, cha}
     */
    getAbilityMods() {
        const abilities = this.getSystem()?.abilities ?? {};
        return {
            str: abilities.str?.mod ?? 0,
            con: abilities.con?.mod ?? 0,
            dex: abilities.dex?.mod ?? 0,
            int: abilities.int?.mod ?? 0,
            wis: abilities.wis?.mod ?? 0,
            cha: abilities.cha?.mod ?? 0
        };
    }

    // Healing Surges

    /**
     * Get healing surge data
     *
     * @typedef {Object} SurgeData
     * @property {number} value - Current surges remaining
     * @property {number} max - Maximum surges
     * @property {number} surgeValue - HP recovered per surge
     *
     * @returns {SurgeData}
     */
    getSurges() {
        const details = this.getSystem()?.details;
        return {
            value: details?.surges?.value ?? 0,
            max: details?.surges?.max ?? 0,
            surgeValue: details?.surgeValue ?? 0
        };
    }

    /**
     * Check if character has enough healing surges
     *
     * @param {number} count Number of surges required (default: 1)
     * @returns {boolean} True if character has enough surges
     */
    hasSurges(count = 1) {
        return this.getSurges().value >= count;
    }

    /**
     * Consume healing surges
     *
     * @param {number} count Number of surges to consume
     * @returns {Promise<void>}
     */
    async consumeSurges(count) {
        const current = this.getSurges().value;
        return this._actor.update({ 'system.details.surges.value': current - count });
    }
}