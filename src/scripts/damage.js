/**
 * Damage4e — fluent wrapper around a damage roll (item or typed formula).
 *
 * Caches its rolled result so the same instance (or a clone) can be applied
 * to several targets — and to hit/miss groups at different multipliers —
 * without re-rolling (RAW 4e rolls damage once).
 */
class Damage4e {
    /** @type {Item|null} */
    _item = null;
    /** @type {string|null} */
    _formula = null;
    /** @type {string|null} */
    _type = null;
    /** @type {Character|null} */
    _caster = null;
    /** @type {number} */
    _multiplier = 1;
    /** @type {boolean} */
    _bypass = false;
    /** @type {Roll|null} */
    _roll = null;
    /** @type {Array<[number, string]>|null} */
    _parts = null;

    /**
     * @param {Item} item Item whose damage configuration drives the roll
     * @returns {Damage4e}
     */
    static fromItem(item) {
        const d = new Damage4e();
        d._item = item;
        return d;
    }

    /**
     * @param {string} formula Dice formula (mods may be pre-interpolated, e.g. `2d4 + 5`)
     * @param {string} type Damage type (e.g. 'lightning')
     * @returns {Damage4e}
     */
    static fromFormula(formula, type) {
        const d = new Damage4e();
        d._formula = formula;
        d._type = type;
        return d;
    }

    /**
     * Bind the casting character (required for fromFormula: roll data, riders, speaker).
     *
     * @param {Character} character
     * @returns {Damage4e}
     */
    by(character) {
        this._caster = character;
        return this;
    }

    /**
     * Clone with an application multiplier (0.5 half, 2 double). Preserves the rolled result.
     *
     * @param {number} n
     * @returns {Damage4e}
     */
    multiplier(n) {
        return this.clone({ multiplier: n });
    }

    /**
     * Clone that bypasses resistances (raw applyDamage). Preserves the rolled result.
     *
     * @returns {Damage4e}
     */
    trueDamage() {
        return this.clone({ bypass: true });
    }

    /**
     * Internal clone that copies the resolved roll (never re-rolls).
     *
     * @param {Object} [overrides={}]
     * @param {number} [overrides.multiplier]
     * @param {boolean} [overrides.bypass]
     * @returns {Damage4e}
     */
    clone({ multiplier, bypass } = {}) {
        const d = new Damage4e();
        d._item = this._item;
        d._formula = this._formula;
        d._type = this._type;
        d._caster = this._caster;
        d._multiplier = multiplier ?? this._multiplier;
        d._bypass = bypass ?? this._bypass;
        d._roll = this._roll;
        d._parts = this._parts;
        return d;
    }

    /**
     * Resolve the roll (idempotent). First call rolls and posts the native message;
     * later calls return the stored result.
     *
     * @returns {Promise<Damage4e>}
     */
    async roll() {
        if (this._roll) return this;

        if (this._item) {
            const roll = await this._item.rollDamage();
            this._roll = roll;
            this._parts = Damage4e._partsFromRoll(roll, 'physical');
            return this;
        }

        if (!this._caster) throw new Error('Damage4e.fromFormula requires .by(caster) before .roll()');

        const actor = this._caster.actor;
        const rollData = actor.getRollData();
        const Roll4e = CONFIG.Dice.rolls[0];
        const options = { bonuses: foundry.utils.deepClone(Roll4e.DEFAULT_OPTIONS.bonuses) };
        // Synthetic power data so type riders (power.damage.<type>.*) fire for this type.
        const powerData = { name: `${this._type} damage`, damageType: { [this._type]: true } };
        const extra = [];

        await game.helper.applyEffects(rollData, actor, powerData, null, 'damage', extra, false, options);

        const formula = [`(${this._formula})[${this._type}]`, ...extra].join(' + ');
        const roll = await new Roll4e(formula, rollData, options).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${this._type} damage` });

        this._roll = roll;
        this._parts = Damage4e._partsFromRoll(roll, this._type);
        return this;
    }

    /**
     * Parse a resolved Roll into [value, type] chunks (mirror of the dnd4e
     * system's applyChatCardDamageInner: each term's flavor carries its type;
     * the untyped remainder falls back to `fallbackType`).
     *
     * @param {Roll} roll Evaluated roll
     * @param {string} fallbackType Type for the untyped remainder
     * @returns {Array<[number, string]>}
     */
    static _partsFromRoll(roll, fallbackType) {
        const parts = [];
        let remainder = roll.total;

        for (const term of roll.terms) {
            const flavor = term.options?.flavor ?? term.flavor;
            if (flavor && typeof term.total === 'number') {
                parts.push([term.total, flavor.toLowerCase()]);
                remainder -= term.total;
            }
        }

        if (parts.length === 0 || remainder !== 0) parts.push([remainder, fallbackType]);

        return parts;
    }

    /** @returns {number} */
    get total() { return this._roll?.total ?? 0; }
    /** @returns {Array<[number, string]>} */
    get parts() { return this._parts ?? []; }
    /** @returns {string|null} */
    get type() { return this._type; }
    /** @returns {Roll|null} */
    get roll() { return this._roll; }
    /** @returns {number} */
    get multiplier() { return this._multiplier; }
    /** @returns {boolean} */
    get bypass() { return this._bypass; }
}
