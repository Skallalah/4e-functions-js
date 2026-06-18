class Target {
    _origins = [];
    _range = 0; // range self by default
    _radius = 0; // radius in square around the main square

    _type = 'creatures'; // the type of targets concerned by the power
    _disposition = null; // the disposition of the caster, null by default

    /** @type {('closeBurst'|'rangeBurst'|'closeBlast')|null} Forme d'aire (clé dnd4e), null en mode ciblé/point */
    _dnd4eRangeType = null;

    constructor(origins, range = 0, radius = 0) {
        this._origins = origins;
        this._range = range;
        this._radius = radius;
    }

    get origins() {
        return this._origins;
    }

    get origin() {
        return this._origins[0];
    }

    /**
     * 
     * @param {Character} character
     * @returns {Target}
     */
    static fromCharacter(character) {
        const origins = character.tokens.map(t => ({ x: t.x, y: t.y }));

        // Prefer the bound token; fall back to the first active token.
        // Works for both TokenDocument (.disposition) and placeable Token (.document.disposition).
        const token = character._token ?? character.tokens[0];
        const disposition = token?.document?.disposition ?? token?.disposition ?? null;

        return new Target(origins).disposition(disposition);
    }

    /**
     * 
     * @param {number} x
     * @param {number} y
     * @returns {Target}
     */
    static fromCoordinates(x, y) {
        return new Target([{ x, y }])
    }

    /**
     * 
     * @param {number} range 
     */
    range(range) {
        this._range = range;

        return this;
    }

    /**
     * 
     * @param {number} radius 
     */
    radius(radius) {
        this._radius = radius;

        return this;
    }

    /**
     * Corps à corps : portée = allonge, cible directe.
     *
     * @param {number} [reach=1] Allonge en cases
     * @returns {Target}
     */
    melee(reach = 1) {
        this._range = reach;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * À distance : portée = r, cible directe.
     *
     * @param {number} r Portée en cases
     * @returns {Target}
     */
    ranged(r) {
        this._range = r;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * Close burst n : aire émanant du lanceur, rayon n.
     *
     * @param {number} n Rayon du burst en cases
     * @returns {Target}
     */
    closeBurst(n) {
        this._range = 0;
        this._radius = n;
        this._dnd4eRangeType = 'closeBurst';
        return this;
    }

    /**
     * Area burst n (à compléter par `.within(r)`) : burst de rayon n centré
     * sur un point choisi dans la portée r. (dnd4e : rangeType 'rangeBurst'.)
     *
     * @param {number} n Rayon du burst en cases
     * @returns {Target}
     */
    areaBurst(n) {
        this._radius = n;
        this._dnd4eRangeType = 'rangeBurst';
        return this;
    }

    /**
     * Portée du point d'origine d'une aire (utilisé avec `areaBurst`).
     *
     * @param {number} r Portée en cases
     * @returns {Target}
     */
    within(r) {
        this._range = r;
        return this;
    }

    /**
     * Close blast x : carré X×X axis-aligned, ancré au lanceur, AUCUN pivot.
     * (dnd4e : rangeType 'closeBlast'.)
     *
     * @param {number} x Longueur du côté en cases
     * @returns {Target}
     */
    closeBlast(x) {
        this._range = 0;
        this._radius = x;
        this._dnd4eRangeType = 'closeBlast';
        return this;
    }

    /**
     *
     * @param {'creatures' | 'allies' | 'enemies'} type
     */
    type(type) {
        this._type = type;

        return this;
    }

    /**
     * 
     * @param {number} disposition 
     */
    disposition(disposition) {
        this._disposition = disposition;

        return this;
    }

    /**
     * Mode point : sélection privée d'une case (vide ou non) dans la portée,
     * via le crosshair Portal. Renvoie un Target dont l'origine est le point
     * choisi (ex. destination de téléport).
     *
     * @param {string} [icon] Chemin d'icône du curseur de ciblage
     * @returns {Promise<Target|null>} Target centré sur le point choisi, ou null si annulé
     */
    async pickPoint(icon) {
        if (this._origins.length !== 1) throw Error('cannot pick a point from more than one origin');

        const portal = new Portal()
            .color('#ffffff')
            .origin(this._origins[0]);

        if (icon) portal.texture(icon);

        while (true) {
            const result = await portal.pick();
            if (result === false) return null; // annulé

            if (!Scene4e.isWithin(this._origins[0], result, this._range)) {
                ui.notifications.warn(`Please target one square within ${this._range} squares.`);
                continue;
            }

            return new Target([result], this._range, this._radius);
        }
    }

    /**
     * @param {string} icon the path of the icon
     * @returns {Target | null}
     */
    async selectTarget(icon) {
        if (this._origins.length > 1) throw Error('cannot select from more than one origin');

        const portal = new Portal()
            .color("#ffffff")
            .origin(this._origins[0]);

        if (icon) portal.texture(icon)

        let result;

        while (true) {
            result = await portal.pick();

            if (result === false) return null; // no selection, the user canceled

            // else the result are coordinates
            // check if the coordinates are within range

            const within = Scene4e.isWithin(this._origins[0], result, this._range);

            if (!within) {
                ui.notifications.warn(`Please target one square within ${this._range} squares.`);
                continue;
            } else {
                return new Target([result], this._range, this._radius);
            }
        }
    }

    /**
     * Interactively select exactly `count` characters within range.
     *
     * @param {Object|string} [opts={}] Options object, or a bare icon path (legacy)
     * @param {number} [opts.count=1] Exact number of characters to select
     * @param {string} [opts.icon] Path to the targeting cursor icon
     * @returns {Promise<Character[]>} Selected characters, or [] if cancelled (always an array)
     */
    async selectCharacters({ count = 1, icon } = {}) {
        // Tolerate the legacy bare-string call: selectCharacters(iconPath).
        if (typeof arguments[0] === 'string') icon = arguments[0], count = 1;

        /** @type {Map<string, Character>} */
        const picked = new Map();

        while (picked.size < count) {
            const selection = await this.selectTarget(icon);

            // Cancelled: abort the whole selection.
            if (selection === null) return [];

            const characters = selection.get();

            if (characters.length === 0) {
                ui.notifications.warn('Please target one valid token.');
                continue;
            }

            for (const character of characters) {
                if (picked.size >= count) break;
                if (picked.has(character.id)) {
                    ui.notifications.warn(`${character.name} is already selected. Choose another.`);
                    continue;
                }
                picked.set(character.id, character);
            }
        }

        return [...picked.values()];
    }

    /**
     * Le token satisfait-il le filtre de type (`creatures`/`allies`/`enemies`)
     * au regard de la disposition du lanceur ?
     *
     * @param {TokenDocument | Token} token
     * @returns {boolean}
     */
    _matchesType(token) {
        if (this._type === 'creatures' || this._disposition === null) return true;
        const disposition = token.document?.disposition ?? token.disposition;
        switch (this._type) {
            case 'allies':
                return this._disposition === disposition;
            case 'enemies':
                return this._disposition !== disposition;
            default:
                return true;
        }
    }

    /**
     * Get the Character from the Target object.
     *
     * @returns {Character[]}
     */
    get() {
        const tokens = Scene4e.getCurrentScenesTokens();

        let targets = tokens.filter(t => this._origins.some(origin => Scene4e.isWithin(origin, t, this._radius)));

        targets = targets.filter(token => this._matchesType(token));

        // Dedupe by TOKEN (not actor): two identical monsters are two targets,
        // each with its own resistances and a unique composite Character.id.
        return [...new Map(targets.map(t => [t.id, t])).values()]
            .map(token => Character.fromToken(token));
    }
}