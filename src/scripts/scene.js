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

    /**
     * Énumère les cases (coins haut-gauche en pixels) dans le rayon Chebyshev
     * `range` autour de `origin`, centre inclus. Sur grille carrée, l'ensemble
     * forme le carré (2·range+1)×(2·range+1) attendu en 4e.
     *
     * @param {{x:number, y:number}} origin Point d'origine (pixels)
     * @param {number} range Rayon en cases
     * @returns {Array<{x:number, y:number}>} Coins haut-gauche pixel des cases
     */
    static cellsWithin(origin, range) {
        const center = canvas.grid.getCenterPoint(origin);
        const { i: ci, j: cj } = canvas.grid.getOffset(center);

        /** @type {Array<{x:number, y:number}>} */
        const cells = [];
        for (let di = -range; di <= range; di++) {
            for (let dj = -range; dj <= range; dj++) {
                const point = canvas.grid.getTopLeftPoint({ i: ci + di, j: cj + dj });
                cells.push({ x: point.x, y: point.y });
            }
        }
        return cells;
    }
}