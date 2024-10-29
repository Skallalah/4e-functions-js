class Target4e {
    static test() {
        const scene = Scene4e.getCurrent();

        console.log(scene);

        console.log(Scene4e.getCurrentScenesTokens())

        const actor = Actor4e.findActorByName("Grund Coeur-d'Ours");

        console.log(actor.system.abilities?.con?.mod)

        console.log(Actor4e.getTokensByName("Esprit Protecteur"))
    }

    /**
     * 
     * @param {Token} token 
     * @param {string} icon 
     * @returns {Portal}
     */
    static async selectTarget(token, icon) {
        return new Portal()
            .color("#ffffff")
            .texture(icon)
            .origin(token)
            .pick();
    }

    /**
     * 
     * @param {Token} token 
     * @param {Token} target 
     * @param {string} icon 
     * @returns 
     */
    static async teleportTokenTo(token, target, icon) {
        return new Portal()
            .color("#ffffff")
            .texture(icon)
            .origin(token)
            .setLocation(target)
            .teleport()
    }
}