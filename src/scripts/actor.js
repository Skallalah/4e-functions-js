class Actor4e {
    static findActorByName(name) {
        return game.actors.getName(name);
    }

    /**
     * 
     * @param {string} name 
     * @returns {Token}
     */
    static findTokenByName(name) {
        return Scene4e.getCurrentScenesTokens().find(token => token.name === name);
    }

    /**
     * 
     * @param {string} identifier 
     * @returns {Token}
     */
    static findTokenByIdentifier(identifier) {
        return Scene4e.getCurrentScenesTokens().get(identifier);
    }

    static getTokensByName(name) {
        return Scene4e.getCurrentScenesTokens().filter(token => token.name === name);
    }
}