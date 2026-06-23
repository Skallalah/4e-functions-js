/**
 * Furious Bolts
 * Lightning Fury Attack 11
 *
 * Jagged streaks of lightning fly from your hands and flash between several foes.
 *
 * Encounter ✦ Arcane, Implement, Lightning
 * Standard Action      Ranged 20
 *
 * Primary Target: One creature
 * Primary Attack: Charisma vs. Reflex
 * Hit: 2d8 + Charisma modifier lightning damage. Make a secondary attack.
 *
 *   Secondary Target: One creature within 10 squares of the primary target
 *   Secondary Attack: Charisma vs. Reflex
 *   Hit: 2d4 + Charisma modifier lightning damage. Repeat the secondary attack
 *        against any single creature you have not yet hit with this attack.
 *
 * Effect: On your next turn, you gain a bonus to your first attack roll equal
 *         to the number of creatures you hit with furious bolts.
 */

async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;
    const chaMod = caster.getAbilityMod('cha');
    const attack = Attack4e.fromItem(item);

    /** @type {Set<string>} */
    const attacked = new Set();
    /** @type {Character[]} */
    const hitTargets = [];

    // --- Primary ---
    const primarySel = await Target.fromCharacter(caster)
        .range(20).type('enemies')
        .selectCharacters({ count: 1, icon: item.img });
    if (!primarySel.length) { ui.notifications.warn('No target selected.'); return; }

    const primary = primarySel[0];
    attacked.add(primary.id);

    const primaryResult = await attack.rollAttack([primary], { fastForward: true });
    await primaryResult.hit
        .applyDamage({ fastForward: true })
        .applyVFX({ type: 'LIGHTNING' })
        .run();

    if (primaryResult.hasHit()) hitTargets.push(primary);

    // --- Secondary chain (2d4 + Cha lightning, breaks on miss) ---
    let origin = primary;
    let chaining = primaryResult.hasHit();

    while (chaining) {
        const candidates = Target.fromCharacter(origin)
            .radius(10).type('allies').get()
            .filter(t => !attacked.has(t.id));
        if (candidates.length === 0) break;

        const sel = await Target.fromCharacter(origin)
            .range(10).type('allies')
            .selectCharacters({ count: 1, icon: item.img });
        if (!sel.length) break;

        const next = sel[0];
        if (attacked.has(next.id)) {
            ui.notifications.warn(`${next.name} has already been attacked. Choose another.`);
            continue;
        }
        attacked.add(next.id);

        await VFX4e.beam(origin, next, 'LIGHTNING');

        const secondary = await attack.rollAttack([next], { fastForward: true });

        if (secondary.hasHit()) {
            hitTargets.push(next);
            await secondary.hit
                .applyDamage({ formula: `2d4 + ${chaMod}`, type: 'lightning' })
                .applyVFX({ type: 'LIGHTNING' })
                .run();
            origin = next;
        } else {
            chaining = false;
            await VFX4e.custom('jb2a.static_electricity.03.blue', next, { scale: 0.5 });
        }
    }

    // --- Buff effect: +N to next attack ---
    const hitCount = hitTargets.length;
    if (hitCount > 0) {
        const effect = Effect4e.createEffect({
            name: 'Furious Bolts - Attack Bonus',
            description: `<p>+${hitCount} bonus to your first attack roll on your next turn (hit ${hitCount} creature${hitCount > 1 ? 's' : ''}).</p>`,
            icon: 'icons/magic/lightning/bolt-strike-blue.webp',
            // Untyped global attack bonus -> ADD mode (always stacks). See
            // docs/reference/foundry-4e-effects.md ("Global Modifiers", "Change Mode").
            // NOTE: the system applies this to every attack until the effect expires, not just the
            // first attack roll as the power states; there is no standard key for "first attack only".
            changes: [Effect4e.bonus('system.modifiers.attack', hitCount)]
        }, 'endOfUserTurn', caster);

        await caster.addEffect(effect);
    }

    const hitNames = hitTargets.map(t => t.name).join(', ');
    await Chat4e.power(caster, 'Furious Bolts',
        `Lightning chains through ${hitCount} creature${hitCount > 1 ? 's' : ''}${hitNames ? `: ${hitNames}` : ''}. ${caster.name} gains +${hitCount} to their next attack roll!`);
}

main(this);
