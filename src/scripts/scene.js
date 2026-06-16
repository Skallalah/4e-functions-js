class Scene4e {
    static getCurrent() {
        return game.scenes.current;
    }

    static getCurrentSceneActors() {
        const scene = this.getCurrent();

        return scene?.tokens?.map(t => t.actor) ?? [];
    }

    static getCurrentScenesTokens() {
        const scene = this.getCurrent()

        if (!scene) return [];

        return scene.tokens;
    }

    static isAtSameLocation(token, x, y) {
        const tokenTrueAxis = canvas.grid.getCenterPoint({ x: token.x, y: token.y });
        const targetTrueAxis = canvas.grid.getCenterPoint({ x, y });

        return (tokenTrueAxis.x == targetTrueAxis.x) && (tokenTrueAxis.y == targetTrueAxis.y);
    }

    static getTokenAtLocation(x, y) {
        return this.getCurrentScenesTokens().find(t => this.isAtSameLocation(t, x, y));
    }

    /**
     * 
     * @param {any} origin 
     * @param {Token} target
     * @param {number} radius 
     */
    static isWithin(origin, target, radius) {
        const originTrueAxis = Scene4e.getTrueAxis(origin);
        const targetTrueAxis = Scene4e.getTrueAxis(target);

        return (
            Math.floor(canvas.grid.measurePath([originTrueAxis, targetTrueAxis]).distance) <= radius &&
            (origin.x != target.x || origin.y != target.y)
        );
    }

    static getTrueAxis(coordinates) {
        const center = canvas.grid.getCenterPoint({ x: coordinates.x, y: coordinates.y });

        return { x: center.x, y: center.y }
    }

    static isAdjacent(token, target) {
        return (
            canvas.grid.measurePath([
                { x: token.x, y: token.y },
                { x: target.x, y: target.y }
            ]).distance <= 1.5 &&
            target.name !== token.name
        );
    }

    static getAdjacentTokens(targetToken, disposition) {
        return this.getCurrentScenesTokens().filter((token) =>
            token.disposition === disposition && this.isAdjacent(targetToken, token)
        );
    }
}