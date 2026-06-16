class User4e {

    /**
     * 
     * @param {Character[]} characters 
     */
    static updateTargets(characters) {
        const tokenIds = characters.map(c => c.token.id);

        // v13: User#updateTokenTargets was made internal; TokenLayer#setTargets
        // is the public API for setting targets programmatically.
        canvas.tokens.setTargets(tokenIds, { mode: 'replace' });
    }

    /**
     * 
     * @return {Character[]} characters 
     */
    static getTargets() {
        const user = game.user;

        return user.targets.map(t => Character.fromToken(t));
    }
}