class User4e {

    /**
     * 
     * @param {Character[]} characters 
     */
    static updateTargets(characters) {
        const user = game.user;

        const tokenIds = characters.map(c => c.token.id);

        if (user) {
            user.updateTokenTargets(tokenIds)
        }
    }
}