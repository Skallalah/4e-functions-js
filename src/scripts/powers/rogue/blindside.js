/**
 * Blindside
 * Rogue Attack 23
 *
 * Your attack comes from such an unexpected angle that your adversary is taken aback.
 *
 * Encounter ✦ Martial, Weapon
 * Standard Action      Melee or Ranged weapon
 *
 * Requirement: You must be wielding a crossbow, a light blade, or a sling.
 * Target: One creature
 * Attack: Dexterity vs. AC
 * Hit: 4[W] + Dexterity modifier damage, and if you have combat advantage against
 *      the target, it is dazed until the start of your next turn.
 *
 * Published in Martial Power, page(s) 84.
 */

async function main(ref) {
    const rogue = Character.fromActor(ref.actor);
    const item = ref.item;

    // Target one enemy creature with our crosshair (geometry hydrated from the item).
    const [target] = await Target.fromItem(item)
        .type('enemies')
        .pick({ count: 1, icon: item.img });

    if (!target) return;

    // Attack: Dex vs AC. Roll with the dialog (fastForward: false) so the player can
    // declare combat advantage (the system also auto-checks it for granting-CA targets).
    const result = await Attack4e.fromItem(item).rollAttack(target, { fastForward: false });

    if (result.hasHit()) {
        // Hit: 4[W] + Dex (the item's configured damage) + impact VFX.
        await result.hit
            .applyDamage({ fastForward: true })
            .applyVFX({ type: 'ARCANE' })
            .run();

        // Rider: with combat advantage, the target is dazed until the start of the
        // rogue's next turn. Combat advantage is read straight from the attack roll
        // (the dialog checkbox / system auto-detection), so we never ask again.
        const dazed = result.hit.where(o => o.combatAdvantage);

        if (dazed.length) {
            await dazed
                .applyEffect({ data: EffectLibrary.DAZED, durationType: 'startOfUserTurn' })
                .run();
        }

        const hitNames = result.hit.map(o => o.target.name).join(', ');
        const dazeNote = dazed.length
            ? ` Caught off guard, ${dazed.map(o => o.target.name).join(', ')} is dazed until the start of ${rogue.name}'s next turn.`
            : '';
        await Chat4e.power(rogue, 'Blindside', `${hitNames} is struck from an unexpected angle!${dazeNote}`);
    }

    if (result.hasMiss()) {
        const missNames = result.miss.map(o => o.target.name).join(', ');
        await Chat4e.power(rogue, 'Blindside', `${missNames} sees the blow coming and avoids it!`);
    }
}

main(this);
