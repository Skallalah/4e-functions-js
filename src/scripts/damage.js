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
    /** @type {boolean} */
    _critical = false;
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
     * Roll critical damage instead of normal (item path only — uses the item's
     * crit formula/parts). Must be set BEFORE roll(), since it changes the roll
     * itself (unlike multiplier/bypass, which act on an already-rolled result).
     *
     * @param {boolean} [on=true]
     * @returns {Damage4e} this
     */
    critical(on = true) {
        this._critical = on;
        return this;
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
        d._critical = this._critical;
        d._roll = this._roll;
        d._parts = this._parts;
        return d;
    }

    /**
     * Resolve the roll (idempotent). First call rolls and posts the native message;
     * later calls return the stored result.
     *
     * @param {Object} [options={}]
     * @param {boolean} [options.fastForward=true] Skip the system's damage dialog
     *   (item path only). Pass `false` to let the player pick crit/normal/miss.
     * @returns {Promise<Damage4e>} this. On the item path, `this.roll` stays `null`
     *   if the player cancelled the damage dialog (check via the `roll` getter).
     */
    async roll({ fastForward = true } = {}) {
        if (this._roll) return this;

        if (this._item) {
            // DamageRoll4e is our vendored copy of the system's roll pipeline; it is
            // byte-identical to dnd4e 0.7.14 except it honours `critical` in fast-forward
            // (the stock item.rollDamage cannot roll crit damage without the manual dialog).
            // It returns the damageRoll() result, which is:
            // - `false` if the (non-fastForward) damage dialog was cancelled, or
            // - a Roll that is NOT yet evaluated — the system fire-and-forgets
            //   roll.toMessage(), and it is toMessage() that evaluates the roll.
            // So `await` alone does not guarantee an evaluated roll.
            const roll = await DamageRoll4e.roll(this._item, { fastForward, critical: this._critical });

            if (!(roll instanceof Roll)) return this; // dialog cancelled -> no roll

            // Yield until toMessage()'s deferred evaluation lands. We must NOT call
            // roll.evaluate() ourselves: toMessage() is already evaluating this same
            // instance, and a second evaluate() would re-roll the dice.
            for (let guard = 0; !roll._evaluated && guard < 1000; guard++) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (!roll._evaluated) {
                console.warn('Damage4e.roll: damage roll did not finish evaluating in time.');
            }

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
