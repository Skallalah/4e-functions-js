class Character {
    /** @type {Actor} */
    _actor;

    /** @type {TokenDocument|Token|null} */
    _token = null;

    // Base Getter / Setter

    /**
     * @returns {Actor}
     */
    get actor() {
        return this._actor;
    }

    /**
     * Stable, scene-unique identifier for this Character.
     * `actorId.tokenId` when bound to a token (unique even for unlinked tokens
     * sharing a prototype), else the bare `actorId`.
     *
     * @returns {string}
     */
    get id() {
        return this._token ? `${this._actor.id}.${this._token.id}` : this._actor.id;
    }

    /**
     * @param {Actor} actor
     * @param {TokenDocument|Token|null} [token=null] Specific token this Character is bound to
     */
    constructor(actor, token = null) {
        this._actor = actor;
        this._token = token;
    }

    /**
     * @param {Actor} actor
     * @returns {Character}
     */
    static fromActor(actor) {
        return new Character(actor);
    }

    /**
     * @param {TokenDocument|Token} token
     * @returns {Character}
     */
    static fromToken(token) {
        return new Character(token.actor, token);
    }

    /**
     * 
     * @param {string} name 
     * @returns {Character}
     */
    static fromName(name) {
        const actor = Actor4e.findActorByName(name)

        if (!actor) throw Error(`no actor with name ${name}`)

        return new Character(actor);
    }

    /**
     * 
     * @param {Character} character 
     * @returns {boolean}
     */
    isAdjacent(character) {
        /** @todo replace this with current target methods */
        return this.tokens.some(token => character.tokens.some(otherToken => Scene4e.isAdjacent(token, otherToken)));
    }

    // Apply Changes

    /**
     * 
     * @param {number} surge 
     * @param {number} cost 
     * @param {number} additional 
     */
    async heal(surge, cost, additional = 0) {
        return Helper4e.heal(this._actor, additional, cost, surge);
    }

    /**
     * 
     * @param {number} value 
     */
    async tempHeal(value) {
        return Helper4e.tempHeal(this._actor, value);
    }

    /**
     * Apply a resolved Damage4e to this character (resistances honored unless
     * the Damage4e bypasses them). Low-level primitive — mirror of `heal`.
     *
     * @param {Damage4e} damage A Damage4e instance with .roll() already awaited
     * @returns {Promise<boolean|undefined>}
     */
    async damage(damage) {
        return Helper4e.damage(this.id, damage.parts, damage.multiplier, damage.bypass);
    }

    /**
     * @param {Object} effect Effect data from Effect4e.createEffect
     */
    async addEffect(effect) {
        const tokenIdentifier = this._token?.id ?? this.token.id;

        await Helper4e.applyEffect({ tokenIdentifier, effectData: effect });
    }

    /**
     * @param {Object} effect Effect data from Effect4e.createEffect
     */
    async replaceEffect(effect) {
        const tokenIdentifier = this._token?.id ?? this.token.id;

        await Helper4e.replaceEffect({ tokenIdentifier, effectData: effect });
    }

    // derived getters

    get tokens() {
        const tokens = this._actor.getActiveTokens(true);

        if (!tokens) throw new Error(`no tokens detected in current scene`)

        return tokens;
    }

    get token() {
        if (this.tokens?.length > 1) throw new Error(`multiple tokens detected in scene, use this.tokens instead`)

        return this.tokens[0];
    }

    /**
     * @return {string}
     */
    get name() {
        return this._actor.name;
    }

    get combatant() {
        return game.combat.combatants.find(c => c.tokenId === this.token.id);
    }

    /**
     *
     * @param {boolean} owned If the script is triggered by the current token owner
     * @returns The Actor system data
     */
    getSystem(owned = true) {
        if (owned) {
            return this._actor.system;
        } else {
            return Helper4e.getSystem(this._actor.getSystem()?.name)
        }
    }

    // Ability Scores

    /**
     * Get an ability score object
     *
     * @param {'str' | 'con' | 'dex' | 'int' | 'wis' | 'cha'} ability The ability score name
     * @returns {Object | undefined} The ability object with value, mod, etc.
     */
    getAbility(ability) {
        return this.getSystem()?.abilities?.[ability];
    }

    /**
     * Get an ability modifier
     *
     * @param {'str' | 'con' | 'dex' | 'int' | 'wis' | 'cha'} ability The ability score name
     * @returns {number} The ability modifier (defaults to 0 if not found)
     */
    getAbilityMod(ability) {
        return this.getSystem()?.abilities?.[ability]?.mod ?? 0;
    }

    /**
     * Get all ability modifiers as an object
     *
     * @returns {Object} Object with all ability modifiers {str, con, dex, int, wis, cha}
     */
    getAbilityMods() {
        const abilities = this.getSystem()?.abilities ?? {};
        return {
            str: abilities.str?.mod ?? 0,
            con: abilities.con?.mod ?? 0,
            dex: abilities.dex?.mod ?? 0,
            int: abilities.int?.mod ?? 0,
            wis: abilities.wis?.mod ?? 0,
            cha: abilities.cha?.mod ?? 0
        };
    }

    /**
     * Numeric value of one of the actor's defences.
     *
     * @param {'ac'|'fort'|'ref'|'wil'} key System defence key (note: Will is 'wil')
     * @returns {number} The defence value, or 0 if unavailable
     */
    getDefense(key) {
        return this.getSystem()?.defences?.[key]?.value ?? 0;
    }

    /**
     * Token image source for this character (falls back to the actor portrait).
     *
     * @returns {string}
     */
    get img() {
        const token = this._actor.getActiveTokens(true)?.[0];
        return token?.document?.texture?.src ?? this._actor.img;
    }

    // Healing Surges

    /**
     * Get healing surge data
     *
     * @typedef {Object} SurgeData
     * @property {number} value - Current surges remaining
     * @property {number} max - Maximum surges
     * @property {number} surgeValue - HP recovered per surge
     *
     * @returns {SurgeData}
     */
    getSurges() {
        const details = this.getSystem()?.details;
        return {
            value: details?.surges?.value ?? 0,
            max: details?.surges?.max ?? 0,
            surgeValue: details?.surgeValue ?? 0
        };
    }

    /**
     * Check if character has enough healing surges
     *
     * @param {number} count Number of surges required (default: 1)
     * @returns {boolean} True if character has enough surges
     */
    hasSurges(count = 1) {
        return this.getSurges().value >= count;
    }

    /**
     * Consume healing surges
     *
     * @param {number} count Number of surges to consume
     * @returns {Promise<void>}
     */
    async consumeSurges(count) {
        const current = this.getSurges().value;
        return this._actor.update({ 'system.details.surges.value': current - count });
    }
}