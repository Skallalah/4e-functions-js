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
     * @param {string} name 
     * @returns {Character}
     */
    static fromName(name) {
        const actor = Actor4e.findActorByName("Grund Coeur-d'Ours")

        if (!actor) throw Error(`no actor with name ${name}`)
        
        return new Character(actor);
    }

    /**
     * 
     * @param {Character} character 
     * @returns {boolean}
     */
    isAdjacent(character) {
        return this.tokens.some(token => character.tokens.some(otherToken => Scene4e.isAdjacent(token, otherToken)));
    }

    // Apply Changes

    async heal(type = 'hp', value, surgeCost = 0) {
        return;
    }

    async damage(value) {
        return;
    }

    async addEffect() {
        return;
    }

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
     * 
     * @param {boolean} owned If the script is triggered by the current token owner
     * @returns The Actor system data
     */
    getSystem(owned = true) {
        if (owned) {
            return this._actor.system;
        }
    }
}