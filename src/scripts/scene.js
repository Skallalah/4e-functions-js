class Scene4e {
    static getCurrent() {
        return game.scenes.current;
    }

    static getCurrentScenesTokens() {
        const scene = this.getCurrent()

        if (!scene) return [];

        return scene.tokens;
    }

    static isAtSameLocation(token, x, y) {
        const tokenTrueAxis = canvas.grid.getCenter(token.x, token.y);
        const targetTrueAxis = canvas.grid.getCenter(x, y);

        return (tokenTrueAxis[0] == targetTrueAxis[0]) && (tokenTrueAxis[1] == targetTrueAxis[1]);
    }

    static getTokenAtLocation(x, y) {
        return this.getCurrentScenesTokens().find(t => this.isAtSameLocation(t, x, y));
    }

    static isAdjacent(token, target) {
        return (
            canvas.grid.measureDistance(token, target) <= 1.5 &&
            target.name !== token.name
        );
    }

    static getAdjacentTokens(targetToken, disposition) {
        return this.getCurrentScenesTokens().filter((token) =>
            token.disposition === disposition && this.isAdjacent(targetToken, token)
        );
    }
}