/**
 * Non-modal frameless floating panel for multi-target selection (X/N counter +
 * actions), built on ApplicationV2 (Foundry v13). Internal to Target.pick() —
 * not a power-facing API. Lifecycle: `await render({ force: true })` to show,
 * `update(current, total)` to refresh live, `await close()` to dismiss.
 */
class TargetSelectionPanel extends foundry.applications.api.ApplicationV2 {
    /** @type {number} Currently selected targets */
    _current = 0;
    /** @type {number} Expected number of targets */
    _count;
    /** @type {(() => void)|null} */
    _onValidate = null;
    /** @type {(() => void)|null} */
    _onCancel = null;
    /** @type {((e: KeyboardEvent) => void)|null} */
    _keyHandler = null;

    /** @type {Partial<ApplicationConfiguration>} */
    static DEFAULT_OPTIONS = {
        id: 'target-selection-panel',
        tag: 'div',
        classes: ['target-selection-panel'],
        // Frameless (no window chrome) and unpositioned: we control placement via inline CSS.
        window: { frame: false, positioned: false }
    };

    /**
     * @param {Object} [opts]
     * @param {number} [opts.count] Expected number of targets
     */
    constructor({ count } = {}) {
        super();
        this._count = count;
    }

    /**
     * Build the panel markup from the current state.
     *
     * @returns {Promise<string>}
     */
    async _renderHTML() {
        const ready = this._current >= 1;
        return `
            <span class="tsp-counter">Targets: ${this._current} / ${this._count}</span>
            <button type="button" data-action="confirm"${ready ? '' : ' disabled'}>Confirm</button>
            <button type="button" data-action="cancel">Cancel</button>
        `;
    }

    /**
     * @param {string} result Markup from `_renderHTML`
     * @param {HTMLElement} content The application root element
     * @returns {void}
     */
    _replaceHTML(result, content) {
        content.innerHTML = result;
    }

    /**
     * Position the frameless panel and wire interactions (no style.css dependency).
     *
     * @returns {void}
     */
    _onRender() {
        Object.assign(this.element.style, {
            position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '60', padding: '8px 14px', borderRadius: '8px',
            background: 'rgba(0,0,0,0.78)', color: '#fff', fontSize: '14px',
            display: 'flex', gap: '10px', alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'auto'
        });

        this.element.querySelector('[data-action="confirm"]')
            ?.addEventListener('click', () => this._onValidate?.());
        this.element.querySelector('[data-action="cancel"]')
            ?.addEventListener('click', () => this._onCancel?.());

        // Escape cancels (idempotent across re-renders).
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = (e) => { if (e.key === 'Escape') this._onCancel?.(); };
        window.addEventListener('keydown', this._keyHandler);
    }

    /**
     * @returns {void}
     */
    _onClose() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }

    /**
     * Refresh the counter and the Confirm button state in place (no re-render).
     *
     * @param {number} current Currently selected targets
     * @param {number} total Expected targets
     * @returns {void}
     */
    update(current, total) {
        this._current = current;
        this._count = total;

        const counter = this.element?.querySelector('.tsp-counter');
        const confirm = this.element?.querySelector('[data-action="confirm"]');
        if (counter) counter.textContent = `Targets: ${current} / ${total}`;
        if (confirm) confirm.disabled = current < 1;
    }

    /** @param {() => void} cb @returns {void} */
    onValidate(cb) { this._onValidate = cb; }

    /** @param {() => void} cb @returns {void} */
    onCancel(cb) { this._onCancel = cb; }
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
     * Build a Target from an item, hydrating the geometry from
     * `system.rangeType`/`system.area`/`system.range` when available.
     * Convenience: shape verbs called afterwards take precedence.
     *
     * @param {Item} item The power's item (must have an actor)
     * @returns {Target}
     */
    static fromItem(item) {
        const actor = item.actor ?? item.parent;
        if (!actor) throw Error('Target.fromItem requires an item with an actor');

        const target = Target.fromCharacter(Character.fromActor(actor));
        const sys = item.system ?? {};
        const area = Number(sys.area) || 0;
        const range = Number(sys.range) || 0;

        switch (sys.rangeType) {
            case 'melee':       return target.melee(range || 1);
            case 'range':
            case 'ranged':      return target.ranged(range);
            case 'closeBurst':  return target.closeBurst(area);
            case 'closeBlast':  return target.closeBlast(area);
            case 'rangeBurst':  return target.areaBurst(area).within(range);
            case 'rangeBlast':  return target.closeBlast(area).within(range);
            default:            return target;
        }
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
        await panel.render({ force: true });

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
        await panel.close();

        if (outcome === 'cancel') return [];
        return [...selected.values()].map(token => Character.fromToken(token.document ?? token));
    }

    /**
     * Area mode: place a square Scene Region (shared with all), then return the
     * Characters covered by the area — derived through the same path as get()
     * (never a raw token/actor). The region is auto-removed after `lifetime` ms.
     *
     * - areaBurst(n).within(r): first picks a point within range.
     * - closeBurst(n) / closeBlast(x): area anchored to the caster.
     *
     * @param {Object} [opts]
     * @param {string} [opts.icon] Cursor icon for point selection
     * @param {number} [opts.lifetime=6000] Region display duration (ms)
     * @returns {Promise<Character[]>} The covered targets, or [] if cancelled
     */
    async place({ icon, lifetime = 6000 } = {}) {
        if (!this._dnd4eRangeType) throw Error('place() requires an area verb (closeBurst/areaBurst/closeBlast)');

        // 1. Determine the area's anchor point.
        let anchor;
        if (this._range > 0) {
            const point = await this.pickPoint(icon); // areaBurst().within(r)
            if (!point) return [];
            anchor = point.origin;
            this._origins = [anchor]; // get() collects around the chosen point
        } else {
            anchor = this._origins[0]; // closeBurst / closeBlast: anchored to the caster
        }

        // 2. Place the shared Region (visual for everyone), auto-removed.
        const rect = Scene4e.areaRectangle(anchor, this._dnd4eRangeType, this._radius);
        const region = await Scene4e.placeAreaRegion(rect);
        setTimeout(() => region?.delete?.(), lifetime);

        // 3. Return the targets through the same path as get().
        return this.get();
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