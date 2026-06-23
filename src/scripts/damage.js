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
    /** @type {ChatMessage|null} */
    _message = null;
    /** @type {Array<[number, string]>|null} */
    _parts = null;

    /**
     * Breathing room (ms) after the damage card is posted before roll() resolves, so
     * damage/VFX don't land instantly on top of the card. Override per call via
     * roll({ settleMs }).
     * @type {number}
     */
    static CARD_SETTLE_MS = 5000;

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
        d._message = this._message;
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
     * @param {number} [options.settleMs=Damage4e.CARD_SETTLE_MS] Pause after the card is
     *   posted before resolving, so damage/VFX don't land instantly on top of it. Pass 0
     *   to disable.
     * @returns {Promise<Damage4e>} this. On the item path, `this._roll` stays `null`
     *   if the player cancelled the damage dialog (check via the `result` getter).
     *   Resolves once the damage chat card has been posted (plus the settle delay), so
     *   callers can apply damage / play impact VFX after the card is on screen.
     */
    async roll({ fastForward = true, settleMs = Damage4e.CARD_SETTLE_MS } = {}) {
        if (this._roll) return this;

        if (this._item) {
            // DamageRoll4e is our vendored copy of the system's roll pipeline (crit-aware).
            // The system fire-and-forgets roll.toMessage(), so we cannot await that promise
            // directly. _rollItemAndAwaitCard() instead waits for the resulting chat card via
            // a one-shot createChatMessage hook. Because toMessage() awaits evaluate() BEFORE
            // creating the message, the card's arrival also guarantees the roll has finished
            // evaluating — so reading the total right after is safe, and damage application is
            // gated on the card being visible (mirroring the fromFormula path, which awaits
            // toMessage() too).
            const { roll, message } = await Damage4e._rollItemAndAwaitCard(
                this._item, { fastForward, critical: this._critical }
            );

            if (!(roll instanceof Roll)) return this; // dialog cancelled -> no roll

            // Safety net for the rare case the card was never observed (hook timeout): make
            // sure evaluation actually completed before we read the total. We poll `_total`,
            // NOT `_evaluated` — Foundry's Roll.evaluate() flips `_evaluated` to true
            // SYNCHRONOUSLY at the start but computes `_total` asynchronously, so `_evaluated`
            // would return instantly with the dice unrolled (total read as 0). On the normal
            // path the card already implies evaluation, so this loop exits immediately.
            for (let guard = 0; roll._total == null && guard < 1000; guard++) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (roll._total == null) {
                console.warn('Damage4e.roll: damage roll did not finish evaluating in time.');
            }

            this._roll = roll;
            this._message = message ?? null;
            this._parts = Damage4e._partsFromRoll(roll, 'physical');
            await this._settle(settleMs);
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
        // Await the card so damage application is gated on it being posted (consistent
        // with the item path). toMessage() returns the created ChatMessage.
        this._message = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${this._type} damage`,
        });

        this._roll = roll;
        this._parts = Damage4e._partsFromRoll(roll, this._type);
        await this._settle(settleMs);
        return this;
    }

    /**
     * Breathing-room pause after the card is posted. No-op when no card was actually
     * shown (cancelled/missed) or when the delay is non-positive.
     *
     * @private
     * @param {number} ms
     * @returns {Promise<void>}
     */
    async _settle(ms) {
        if (this._message && ms > 0) {
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    /**
     * Roll an item's damage through the vendored pipeline and resolve once the chat
     * card the system posts has been created.
     *
     * The vendored pipeline fire-and-forgets `roll.toMessage()`, so its promise (which
     * resolves to the ChatMessage) is unreachable. We instead listen for the resulting
     * message with a one-shot `createChatMessage` hook, matching "our" message by the
     * evaluated roll's formula + total. Because `toMessage()` awaits `evaluate()` before
     * `ChatMessage.create()`, observing the message also guarantees the roll has finished
     * evaluating.
     *
     * Matching is unambiguous in practice: `AttackResult.run()` applies damage
     * sequentially, so only one item roll is ever in flight. A timeout guarantees we
     * never deadlock if the message is somehow never observed (caller then falls back to
     * polling the roll's total).
     *
     * @param {Item} item
     * @param {Object} opts
     * @param {boolean} opts.fastForward
     * @param {boolean} opts.critical
     * @param {number} [opts.timeout=3000] ms to wait for the card before giving up
     * @returns {Promise<{roll: Roll|null, message: ChatMessage|null}>}
     */
    static async _rollItemAndAwaitCard(item, { fastForward, critical, timeout = 3000 }) {
        let roll = null;
        let resolveCard;
        const card = new Promise(resolve => { resolveCard = resolve; });

        const hookId = Hooks.on('createChatMessage', message => {
            if (!roll) return;
            const mine = message.rolls?.some(
                r => r._evaluated && r.total === roll.total && r.formula === roll.formula
            );
            if (mine) resolveCard(message);
        });

        try {
            roll = await DamageRoll4e.roll(item, { fastForward, critical });
            if (!(roll instanceof Roll)) return { roll: null, message: null }; // dialog cancelled

            const message = await Promise.race([
                card,
                new Promise(resolve => setTimeout(() => resolve(null), timeout)),
            ]);
            return { roll, message };
        } finally {
            Hooks.off('createChatMessage', hookId);
        }
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
    get result() { return this._roll; }
    /** @returns {ChatMessage|null} The damage chat card, once posted (null if missed/cancelled) */
    get message() { return this._message; }
    /** @returns {number} */
    get multiplier() { return this._multiplier; }
    /** @returns {boolean} */
    get bypass() { return this._bypass; }
}
