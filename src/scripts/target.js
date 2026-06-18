/**
 * Non-modal floating panel for multi-target selection (X/N counter + actions).
 * Internal to Target.pick() — not a power-facing API.
 */
class TargetSelectionPanel {
    /** @type {HTMLDivElement} */
    _el;
    /** @type {HTMLSpanElement} */
    _counter;
    /** @type {HTMLButtonElement} */
    _validateBtn;
    /** @type {number} */
    _count;
    /** @type {(() => void)|null} */
    _onValidate = null;
    /** @type {(() => void)|null} */
    _onCancel = null;
    /** @type {(e: KeyboardEvent) => void} */
    _onKeyDown;

    /**
     * @param {Object} opts
     * @param {number} opts.count Expected number of targets
     */
    constructor({ count }) {
        this._count = count;

        const el = document.createElement('div');
        el.className = 'target-selection-panel';
        el.style.cssText = [
            'position:absolute', 'top:80px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:60', 'padding:8px 14px', 'border-radius:8px',
            'background:rgba(0,0,0,0.78)', 'color:#fff', 'font-size:14px',
            'display:flex', 'gap:10px', 'align-items:center',
            'box-shadow:0 2px 8px rgba(0,0,0,0.5)', 'pointer-events:auto'
        ].join(';');

        this._counter = document.createElement('span');
        this._counter.textContent = `Targets: 0 / ${count}`;

        this._validateBtn = document.createElement('button');
        this._validateBtn.type = 'button';
        this._validateBtn.textContent = 'Confirm';
        this._validateBtn.style.cssText = 'pointer-events:auto;cursor:pointer';
        this._validateBtn.disabled = true;
        this._validateBtn.addEventListener('click', () => this._onValidate?.());

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'pointer-events:auto;cursor:pointer';
        cancelBtn.addEventListener('click', () => this._onCancel?.());

        el.append(this._counter, this._validateBtn, cancelBtn);
        (document.getElementById('interface') ?? document.body).appendChild(el);
        this._el = el;

        this._onKeyDown = (e) => { if (e.key === 'Escape') this._onCancel?.(); };
        window.addEventListener('keydown', this._onKeyDown);
    }

    /**
     * @param {number} current Currently selected targets
     * @param {number} total Expected targets
     * @returns {void}
     */
    update(current, total) {
        this._counter.textContent = `Targets: ${current} / ${total}`;
        this._validateBtn.disabled = current < 1;
    }

    /** @param {() => void} cb @returns {void} */
    onValidate(cb) { this._onValidate = cb; }

    /** @param {() => void} cb @returns {void} */
    onCancel(cb) { this._onCancel = cb; }

    /** @returns {void} */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._el.remove();
    }
}

class Target {
    _origins = [];
    _range = 0; // range self by default
    _radius = 0; // radius in square around the main square

    _type = 'creatures'; // the type of targets concerned by the power
    _disposition = null; // the disposition of the caster, null by default

    /** @type {('closeBurst'|'rangeBurst'|'closeBlast')|null} Area shape (dnd4e key), null in targeted/point mode */
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
     * Melee: range = reach, direct target.
     *
     * @param {number} [reach=1] Reach in squares
     * @returns {Target}
     */
    melee(reach = 1) {
        this._range = reach;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * Ranged: range = r, direct target.
     *
     * @param {number} r Range in squares
     * @returns {Target}
     */
    ranged(r) {
        this._range = r;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * Close burst n: area emanating from the caster, radius n.
     *
     * @param {number} n Burst radius in squares
     * @returns {Target}
     */
    closeBurst(n) {
        this._range = 0;
        this._radius = n;
        this._dnd4eRangeType = 'closeBurst';
        return this;
    }

    /**
     * Area burst n (complete with `.within(r)`): burst of radius n centered
     * on a point chosen within range r. (dnd4e: rangeType 'rangeBurst'.)
     *
     * @param {number} n Burst radius in squares
     * @returns {Target}
     */
    areaBurst(n) {
        this._radius = n;
        this._dnd4eRangeType = 'rangeBurst';
        return this;
    }

    /**
     * Range of an area's origin point (used with `areaBurst`).
     *
     * @param {number} r Range in squares
     * @returns {Target}
     */
    within(r) {
        this._range = r;
        return this;
    }

    /**
     * Close blast x: axis-aligned X×X square, anchored to the caster, NO pivot.
     * (dnd4e: rangeType 'closeBlast'.)
     *
     * @param {number} x Side length in squares
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
     * Point mode: private selection of a square (empty or not) within range,
     * via the Portal crosshair. Returns a Target whose origin is the chosen
     * point (e.g. teleport destination).
     *
     * @param {string} [icon] Path to the targeting cursor icon
     * @returns {Promise<Target|null>} Target centered on the chosen point, or null if cancelled
     */
    async pickPoint(icon) {
        if (this._origins.length !== 1) throw Error('cannot pick a point from more than one origin');

        const portal = new Portal()
            .color('#ffffff')
            .origin(this._origins[0]);

        if (icon) portal.texture(icon);

        while (true) {
            const result = await portal.pick();
            if (result === false) return null; // cancelled

            if (!Scene4e.isWithin(this._origins[0], result, this._range)) {
                ui.notifications.warn(`Please target one square within ${this._range} squares.`);
                continue;
            }

            return new Target([result], this._range, this._radius);
        }
    }

    /**
     * Targeted mode: interactive selection of 1..count creatures using Foundry's
     * native targeting (free toggle/deselection), with range highlight, a marker
     * placed on each target and an X/N counter. Live validation of range and type.
     * Auto-resolves once `count` is reached.
     *
     * @param {Object} [opts]
     * @param {number} [opts.count=1] Maximum number of targets
     * @param {string} [opts.icon] (reserved) icon — unused by native targeting
     * @returns {Promise<Character[]>} Selected targets, or [] if cancelled
     */
    async pick({ count = 1, icon } = {}) {
        if (this._origins.length !== 1) throw Error('cannot pick from more than one origin');
        const origin = this._origins[0];

        // Start from a clean selection.
        for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false });

        VFX4e.rangeHighlight(origin, this._range);
        const panel = new TargetSelectionPanel({ count });

        /** @type {Map<string, Token>} */
        const selected = new Map();

        let resolveFn;
        const done = new Promise(resolve => { resolveFn = resolve; });

        /**
         * @param {User} user
         * @param {Token} token
         * @param {boolean} targeted
         */
        const onTarget = (user, token, targeted) => {
            if (user.id !== game.user.id) return;

            if (targeted) {
                const doc = token.document ?? token;
                if (!Scene4e.isWithin(origin, doc, this._range)) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`Please target a creature within ${this._range} squares.`);
                    return;
                }
                if (!this._matchesType(token)) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`That target is not a valid ${this._type.slice(0, -1)}.`);
                    return;
                }
                if (!selected.has(token.id) && selected.size >= count) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`You can only select ${count} target${count > 1 ? 's' : ''}.`);
                    return;
                }
                selected.set(token.id, token);
                VFX4e.targetMarker(token);
            } else {
                selected.delete(token.id);
                VFX4e.clearTargetMarker(token);
            }

            panel.update(selected.size, count);
            if (selected.size === count) resolveFn('validate');
        };

        Hooks.on('targetToken', onTarget);
        panel.onValidate(() => resolveFn('validate'));
        panel.onCancel(() => resolveFn('cancel'));

        const outcome = await done;

        // Cleanup (always).
        Hooks.off('targetToken', onTarget);
        VFX4e.clearRangeHighlight();
        for (const token of selected.values()) VFX4e.clearTargetMarker(token);
        for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false });
        panel.destroy();

        if (outcome === 'cancel') return [];
        return [...selected.values()].map(token => Character.fromToken(token.document ?? token));
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
     * Does the token satisfy the type filter (`creatures`/`allies`/`enemies`)
     * relative to the caster's disposition?
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