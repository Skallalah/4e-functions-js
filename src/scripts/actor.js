class Actor4e {
    static findActorByName(name) {
        return game.actors.getName(name);
    }

    static findTokenByName(name) {
        return Scene4e.getCurrentScenesTokens().find(token => token.name === name);
    }

    static getTokensByName(name) {
        return Scene4e.getCurrentScenesTokens().filter(token => token.name === name);
    }


}