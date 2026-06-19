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
}
