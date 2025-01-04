class Target {
    _origins = [];
    _range = 0; // range self by default
    _radius = 0; // radius in square around the main square

    _type = 'creatures'; // the type of targets concerned by the power
    _disposition = null; // the disposition of the caster, null by default

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

        console.log('token', character.token?.document)

        return new Target(origins).disposition(character.token?.document.disposition);
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
     * @param {string} icon the path of the icon
     * @returns {Character[] | null}
     */
    async selectCharacters(icon) {
        let selection;

        while (true) {
            selection = await this.selectTarget(icon);

            const characters = selection.get();

            if (characters.length === 0) {
                ui.notifications.warn('Please target one valid token.');
                continue;
            } else {
                return characters;
            }
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

        if (this._type !== 'creatures' && this._disposition !== null) {
            const typeFilter = (token) => {
                switch (this._type) {
                    case 'allies':
                        return this._disposition === token?.disposition;
                    case 'enemies':
                        return this._disposition !== token?.disposition;
                    default:
                        return true;
                }
            };

            targets = targets.filter(typeFilter)
        }

        return [...new Set(targets.map(t => t.actor))].map(actor => Character.fromActor(actor));
    }
}