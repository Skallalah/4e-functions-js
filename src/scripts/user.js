class User4e {

    /**
     * 
     * @param {Character[]} characters 
     */
    static updateTargets(characters) {
        const tokenIds = characters.map(c => c.token.id);

        // v13+: User#updateTokenTargets was made internal; TokenLayer#setTargets
        // is the public API for setting targets programmatically. Fall back to the
        // old method on v12.
        if (canvas?.tokens?.setTargets) {
            canvas.tokens.setTargets(tokenIds, { mode: 'replace' });
        } else {
            game.user?.updateTokenTargets(tokenIds);
        }
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