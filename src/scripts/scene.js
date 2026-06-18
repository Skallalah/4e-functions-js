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
     * Enumerate the cells (top-left pixel corners) within Chebyshev radius
     * `range` around `origin`, center included. On a square grid, the set
     * forms the (2·range+1)×(2·range+1) square expected in 4e.
     *
     * @param {{x:number, y:number}} origin Origin point (pixels)
     * @param {number} range Radius in squares
     * @returns {Array<{x:number, y:number}>} Top-left pixel corners of the cells
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

    /**
     * Compute the square pixel footprint of a dnd4e area on a square grid.
     * On a square grid, a burst (emanation) of radius n centered on a cell
     * covers the (2n+1)×(2n+1) square; a blast of side x covers x×x anchored
     * to the top-left corner of the origin cell.
     *
     * @param {{x:number, y:number}} origin Origin point (pixels)
     * @param {'closeBurst'|'rangeBurst'|'closeBlast'} type dnd4e shape key
     * @param {number} size Radius (burst) or side (blast), in squares
     * @returns {{x:number, y:number, width:number, height:number}} Rectangle in pixels
     */
    static areaRectangle(origin, type, size) {
        const gs = canvas.grid.size;
        // Read the system's recipe (non-blocking: fallback if absent).
        const shapeType = CONFIG.DND4E?.rangeType?.[type]?.area?.type
            ?? (type === 'closeBlast' ? 'rectangle' : 'emanation');

        const center = canvas.grid.getCenterPoint(origin);
        const { i: ci, j: cj } = canvas.grid.getOffset(center);

        if (shapeType === 'rectangle' && type === 'closeBlast') {
            const tl = canvas.grid.getTopLeftPoint({ i: ci, j: cj });
            return { x: tl.x, y: tl.y, width: size * gs, height: size * gs };
        }

        // emanation (closeBurst / rangeBurst) → (2·size+1)² square
        const tl = canvas.grid.getTopLeftPoint({ i: ci - size, j: cj - size });
        const side = (2 * size + 1) * gs;
        return { x: tl.x, y: tl.y, width: side, height: side };
    }

    /**
     * Place a rectangular Scene Region, shared with all observers.
     * Prefers `canvas.regions.placeRegion` (dnd4e); falls back to native
     * Region document creation.
     *
     * @param {{x:number, y:number, width:number, height:number}} rectangle Pixel footprint
     * @param {Object} [options]
     * @param {string} [options.name='Area of Effect'] Region name
     * @param {number} [options.color=0x33aaff] Display color
     * @returns {Promise<RegionDocument>} The created Region document
     */
    static async placeAreaRegion(rectangle, options = {}) {
        const { name = 'Area of Effect', color = 0x33aaff } = options;

        const regionData = {
            name,
            color,
            visibility: CONST.REGION_VISIBILITY.OBSERVER,
            shapes: [{
                type: 'rectangle',
                x: rectangle.x,
                y: rectangle.y,
                width: rectangle.width,
                height: rectangle.height,
                rotation: 0,
                hole: false
            }]
        };

        if (typeof canvas.regions?.placeRegion === 'function') {
            return canvas.regions.placeRegion(regionData, {});
        }
        const [doc] = await canvas.scene.createEmbeddedDocuments('Region', [regionData]);
        return doc;
    }
}