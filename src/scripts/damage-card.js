/** Module flag scope for the damage resolution card. */
const DAMAGE_CARD_SCOPE = '4e-functions-js';
/** Flag key for the damage resolution card state. */
const DAMAGE_CARD_FLAG = 'damageCard';

/**
 * DamageCard4e — interactive, GM-resolved damage-application card.
 *
 * Posted after damage is rolled for a multi-target attack. The GM reviews each
 * target's outcome (crit/hit/miss/true), overrides as needed, then applies all
 * damage at once. All state lives in the ChatMessage flag, so the card
 * re-renders consistently and survives reloads.
 *
 * Theming: the markup reuses the dnd4e chat-card classes so a theme overlay can
 * restyle it; only untyped, layout-specific styling is inline. Interactive
 * controls call event.stopPropagation() so the system's `.card-buttons button`
 * handler (Item4e._onChatCardAction) never fires on them.
 */
class DamageCard4e {
    /**
     * @typedef {Object} DamageCardTarget
     * @property {string} characterId Character.id (actorId or actorId.tokenId)
     * @property {string} name
     * @property {string} img Token texture src
     * @property {number} attackTotal Attack roll total for this target
     * @property {string} defenseLabel Display label ('AC'|'Fort'|'Ref'|'Will')
     * @property {number} defenseValue Numeric defence value
     * @property {'crit'|'hit'|'miss'} origin Outcome the roll produced
     * @property {'crit'|'hit'|'miss'|'true'} selected Current GM choice
     */

    /**
     * @typedef {Object} DamageCardFlag
     * @property {boolean} resolved Whether damage has been applied (locked)
     * @property {string} powerName
     * @property {string} damageType
     * @property {{total: number, parts: Array<[number,string]>}} normal
     * @property {{total: number, parts: Array<[number,string]>}|null} crit
     * @property {boolean} halfOnMiss
     * @property {DamageCardTarget[]} targets
     */

    /** Map an AttackOutcome.defense to a display label and the system defence key. */
    static DEF = {
        ac:   { label: 'AC',   key: 'ac'  },
        fort: { label: 'Fort', key: 'fort' },
        ref:  { label: 'Ref',  key: 'ref' },
        will: { label: 'Will', key: 'wil' },
        wil:  { label: 'Will', key: 'wil' }
    };

    /** Map an AttackState string to the initial toggle key. */
    static ORIGIN = {
        critical: 'crit', hit: 'hit',
        miss: 'miss', fumble: 'miss', immune: 'miss', unknown: 'hit'
    };

    /**
     * Build and post the resolution card.
     *
     * @param {Object} config
     * @param {Character} config.caster Casting character (speaker + header image)
     * @param {string} config.powerName
     * @param {string} config.damageType Label for the header totals
     * @param {Damage4e} config.normal Rolled normal damage (.roll() awaited)
     * @param {Damage4e|null} config.crit Rolled crit damage, or null (formula path)
     * @param {Array<{target: Character, state: string, total: number, defense: string}>} config.outcomes
     * @param {boolean} [config.halfOnMiss=false]
     * @returns {Promise<ChatMessage>}
     */
    static async post({ caster, powerName, damageType, normal, crit, outcomes, halfOnMiss = false }) {
        const targets = outcomes.map(o => {
            const def = DamageCard4e.DEF[o.defense] ?? { label: '?', key: o.defense };
            const origin = DamageCard4e.ORIGIN[o.state] ?? 'hit';
            return {
                characterId: o.target.id,
                name: o.target.name,
                img: o.target.img,
                attackTotal: o.total,
                defenseLabel: def.label,
                defenseValue: o.target.getDefense(def.key),
                origin,
                selected: origin
            };
        });

        /** @type {DamageCardFlag} */
        const flag = {
            resolved: false,
            powerName,
            damageType,
            normal: { total: normal.total, parts: normal.parts },
            crit: crit?.roll ? { total: crit.total, parts: crit.parts } : null,
            halfOnMiss,
            targets
        };

        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: caster.actor }),
            flavor: powerName,
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }

    /**
     * Resolve a target's selected outcome into an application payload.
     *
     * @param {DamageCardFlag} flag
     * @param {DamageCardTarget} target
     * @returns {{parts: Array<[number,string]>, multiplier: number, bypass: boolean, amount: number}|null}
     *   null when nothing should be applied (a miss with no half-damage, or crit
     *   selected with no crit roll available).
     */
    static _outcome(flag, target) {
        switch (target.selected) {
            case 'crit':
                if (!flag.crit) return null;
                return { parts: flag.crit.parts, multiplier: 1, bypass: false, amount: flag.crit.total };
            case 'hit':
                return { parts: flag.normal.parts, multiplier: 1, bypass: false, amount: flag.normal.total };
            case 'true':
                return { parts: flag.normal.parts, multiplier: 1, bypass: true, amount: flag.normal.total };
            case 'miss':
                if (!flag.halfOnMiss) return null;
                return { parts: flag.normal.parts, multiplier: 0.5, bypass: false, amount: Math.floor(flag.normal.total / 2) };
            default:
                return null;
        }
    }

    /**
     * Pure render: flag -> HTML string. Used at post time and after every flag
     * mutation, so the rendered DOM always matches the flag.
     *
     * @param {DamageCardFlag} flag
     * @returns {string}
     */
    static _html(flag) {
        const half = Math.floor(flag.normal.total / 2);
        const detail = parts => parts.map(([v, t]) => `${v} ${t}`).join(' + ');

        const totalBlock = (label, data, key) => `
            <div class="dice-result" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="dice-total">${label}: ${data.total} ${flag.damageType}</span>
                <a data-detail="${key}" style="cursor:pointer;font-size:0.85em;opacity:0.8">▸ details</a>
                <span data-detail-for="${key}" style="display:none;font-size:0.85em;opacity:0.8">(${detail(data.parts)})</span>
            </div>`;

        const totals = `
            <div class="dice-roll">
                ${totalBlock('Normal', flag.normal, 'normal')}
                ${flag.crit ? totalBlock('Crit', flag.crit, 'crit') : ''}
            </div>`;

        const labels = {
            crit: 'CRIT', hit: 'HIT',
            miss: flag.halfOnMiss ? `MISS→${half}` : 'MISS',
            true: 'TRUE'
        };

        const rows = flag.targets.map((t, i) => {
            const buttons = ['crit', 'hit', 'miss', 'true'].map(k => {
                const disabled = (k === 'crit' && !flag.crit) || flag.resolved;
                let style = 'padding:1px 6px;font-size:0.8em;line-height:1.4;flex:0 0 auto;';
                if (t.selected === k) style += 'outline:2px solid #c9a227;outline-offset:-2px;font-weight:bold;';
                else if (t.origin === k) style += 'outline:1px dashed #999;outline-offset:-2px;';
                return `<button data-idx="${i}" data-key="${k}" style="${style}"${disabled ? ' disabled' : ''}>${labels[k]}</button>`;
            }).join('');

            return `
                <div class="dice-roll">
                    <div class="dice-result" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <img src="${t.img}" width="30" height="30" style="border:none;flex:0 0 auto"/>
                        <span class="flavor-text target" style="flex:0 0 auto">${t.name}</span>
                        <span class="mod-vs-def" style="flex:0 0 auto">(<span class="attack-mod">${t.attackTotal}</span> vs <span class="vs-def">${t.defenseLabel} ${t.defenseValue}</span>)</span>
                        <span class="card-buttons" style="margin-left:auto;display:flex;gap:3px;flex:0 0 auto">${buttons}</span>
                    </div>
                </div>`;
        }).join('');

        const footer = flag.resolved
            ? `<div style="text-align:center;font-weight:bold;opacity:0.8">✔ Damage applied</div>`
            : `<div class="card-buttons"><button class="dc-apply">⚔ Apply all damage</button></div>`;

        return `
            <div class="dnd4e chat-card item-card damage-card">
                <header class="card-header flexrow">
                    <div class="flexcol item-name"><h3>${flag.powerName} — Damage</h3></div>
                </header>
                <div class="card-content">
                    ${totals}
                    ${rows}
                </div>
                <footer class="card-footer">${footer}</footer>
            </div>`;
    }

    /**
     * Resolve the root card element from a renderChatMessage payload, which is a
     * jQuery object in v13 (deprecated hook) or an element. Returns null when the
     * message is not one of our cards.
     *
     * @param {ChatMessage} message
     * @param {JQuery|HTMLElement} html
     * @returns {HTMLElement|null}
     */
    static _root(message, html) {
        if (!message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG)) return null;
        const el = html?.jquery ? html[0] : html;
        return el?.querySelector?.('.damage-card') ?? null;
    }

    /**
     * Wire interactions on a rendered card. The detail expanders work for
     * everyone; toggles and the apply button mutate state and are GM-only.
     * Every interactive control stops propagation so the system's
     * `.card-buttons button` handler never runs on it.
     *
     * @param {ChatMessage} message
     * @param {JQuery|HTMLElement} html
     */
    static activateListeners(message, html) {
        const root = DamageCard4e._root(message, html);
        if (!root) return;

        // Detail expanders: pure UI, available to everyone.
        root.querySelectorAll('[data-detail]').forEach(el => {
            el.addEventListener('click', event => {
                event.stopPropagation();
                const block = root.querySelector(`[data-detail-for="${el.dataset.detail}"]`);
                if (block) block.style.display = block.style.display === 'none' ? '' : 'none';
            });
        });

        const flag = message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG);

        // Always swallow clicks on our interactive controls so the system's
        // global card-buttons handler cannot disable them or error out.
        root.querySelectorAll('[data-key], .dc-apply').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                if (!game.user.isGM || flag.resolved || btn.disabled) return;
                if (btn.dataset.key) DamageCard4e._onToggle(message, Number(btn.dataset.idx), btn.dataset.key);
                else DamageCard4e._onApply(message);
            });
        });
    }

    /**
     * Apply a new selection for one target and re-render from the flag.
     *
     * @param {ChatMessage} message
     * @param {number} idx Target index
     * @param {'crit'|'hit'|'miss'|'true'} key
     * @returns {Promise<void>}
     */
    static async _onToggle(message, idx, key) {
        const flag = foundry.utils.deepClone(message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG));
        if (!flag || flag.resolved) return;
        if (key === 'crit' && !flag.crit) return; // crit unavailable on the formula path
        flag.targets[idx].selected = key;
        await message.update({
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }

    /**
     * Apply every target's selected outcome via the permission-elevated
     * Helper4e.damage chain, then lock the card. Per-target failures are logged,
     * not thrown, so one bad target does not abort the rest. Re-checks `resolved`
     * to guard against a double click / race.
     *
     * @param {ChatMessage} message
     * @returns {Promise<void>}
     */
    static async _onApply(message) {
        const flag = foundry.utils.deepClone(message.getFlag(DAMAGE_CARD_SCOPE, DAMAGE_CARD_FLAG));
        if (!flag || flag.resolved) return;

        for (const target of flag.targets) {
            const outcome = DamageCard4e._outcome(flag, target);
            if (!outcome) continue; // miss with no half-damage, or crit without a crit roll
            try {
                await Helper4e.damage(target.characterId, outcome.parts, outcome.multiplier, outcome.bypass);
            } catch (err) {
                console.error('DamageCard4e: apply failed for', target.name, err);
            }
        }

        flag.resolved = true;
        await message.update({
            content: DamageCard4e._html(flag),
            flags: { [DAMAGE_CARD_SCOPE]: { [DAMAGE_CARD_FLAG]: flag } }
        });
    }
}

// dnd4e targets Foundry v13: renderChatMessage still fires (deprecated, removed
// in v15). It passes (message, html, data) with html as a jQuery object.
Hooks.on('renderChatMessage', (message, html) => DamageCard4e.activateListeners(message, html));
