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

    /**
     * Resolve an Actor from a Character.id (`actorId` or `actorId.tokenId`).
     * Prefers the token's actor (synthetic for unlinked tokens) so cross-actor
     * mutation from a macro is permission-safe and hits the right token.
     *
     * @param {string} id Character.id
     * @returns {Actor|null}
     */
    static findByCharacterId(id) {
        const [actorId, tokenId] = String(id).split('.');

        if (tokenId) {
            const token = canvas.tokens?.get(tokenId)
                ?? game.scenes.contents.flatMap(s => s.tokens.contents).find(t => t.id === tokenId);

            if (token?.actor) return token.actor;
        }

        return game.actors.get(actorId) ?? null;
    }
}