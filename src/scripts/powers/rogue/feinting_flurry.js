/**
 * Feinting Flurry
 * Rogue Attack 19
 *
 * A series of clever feints throws your foe off his game and makes it an easy target.
 *
 * Daily ✦ Martial, Weapon
 * Standard Action      Melee or Ranged weapon
 *
 * Requirement: You must be wielding a crossbow, a light blade, or a sling.
 * Target: One creature
 * Attack: Dexterity vs. Will
 * Hit: 5[W] + Dexterity modifier damage.
 * Effect: Until the end of your next turn, the target takes a penalty to all defenses against your attacks.
 *         The penalty equals your Charisma modifier.
 * Sustain Minor: The penalty persists until the end of your next turn.
 */

async function main(ref) {
    const rogue = Character.fromActor(ref.actor);
    const item = ref.item;
    const chaMod = rogue.getAbilityMod('cha');

    // Get the rogue's current targets
    const targets = User4e.getTargets();

    if (targets.length === 0) {
        ui.notifications.warn('Please select a target before using this power.');
        return;
    }

    const result = await Attack4e.fromItem(item).rollAttack(targets, { fastForward: false });

    // Defense penalty (-Cha to all defenses) against the rogue's attacks.
    const defensePenaltyEffect = {
        name: 'Feinting Flurry - Defense Penalty',
        description: `<p>Until the end of the rogue's next turn, you take a -${chaMod} penalty to all defenses against the rogue's attacks.</p><p><em>Sustain Minor: The penalty persists until the end of your next turn.</em></p>`,
        icon: 'icons/conditions/afflicted.svg',
        changes: [
            { key: 'system.defences.ac.value', mode: 2, value: -chaMod, priority: 20 },
            { key: 'system.defences.fortitude.value', mode: 2, value: -chaMod, priority: 20 },
            { key: 'system.defences.reflex.value', mode: 2, value: -chaMod, priority: 20 },
            { key: 'system.defences.will.value', mode: 2, value: -chaMod, priority: 20 }
        ]
    };

    // Hit: 5[W] + Dex via the item's configured damage, then the penalty + VFX.
    if (result.hasHit()) {
        await result.hit
            .applyDamage({ fastForward: true })
            .applyEffect({ data: defensePenaltyEffect, durationType: 'endOfUserTurn' })
            .applyVFX({ type: 'ARCANE' })
            .run();

        const hitNames = result.hit.map(o => o.target.name).join(', ');
        await Chat4e.power(rogue, 'Feinting Flurry',
            `${hitNames} thrown off guard: -${chaMod} penalty to all defenses against ${rogue.name}'s attacks until the end of ${rogue.name}'s next turn.`);
    }

    if (result.hasMiss()) {
        const missNames = result.miss.map(o => o.target.name).join(', ');
        await Chat4e.power(rogue, 'Feinting Flurry', `The feints fail to throw off ${missNames}'s guard!`);
    }
}

main(this);