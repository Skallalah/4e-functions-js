class Target {
    _coordinates = { x: null, y: null };
    _range = 0; // range self by default
    _size = 0; // 
    _type = 'area burst'; // area_burst by default for selection, useless for now

    /**
     * 
     * @param {Character} character
     * @returns {Target}
     */
    static fromCharacter(character) {
        
    }

    /**
     * 
     * @param {number} x 
     * @param {number} y
     * @returns {Target}
     */
    static fromCoordinates(x, y) {

    }

    /**
     * @returns {Character[]}
     */
    select() {
        return [];
    }

    /**
     * 
     */
    teleport() {

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