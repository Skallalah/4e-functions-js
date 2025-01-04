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

    async addEffect() {
        return;
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
}