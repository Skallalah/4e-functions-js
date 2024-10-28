class Character {
    _actor;

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

    get currentToken() {
        const tokens = this._actor.getActiveTokens(true);

        return tokens ? tokens[0] : null;
    }
    
    getName() {
        return this._actor;
    }

    getNothing() {
        return 'nothing';
    }
}