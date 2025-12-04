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

    // Get ability modifiers
    const dexMod = rogue.getAbilityMod('dex');
    const chaMod = rogue.getAbilityMod('cha');

    // Get the rogue's current targets
    const targets = User4e.getTargets();

    if (targets.length === 0) {
        ui.notifications.warn('Please select a target before using this power.');
        return;
    }

    // Process each target
    for (const target of targets) {
        // Perform attack roll using item (Dexterity vs. Will)
        const attackResults = await Attack4e.rollAttack(item, target, {
            fastForward: false
        });

        const hit = attackResults[0]?.hit || false;

        if (hit) {
            // Roll damage: 5[W] + Dex
            // Note: 5[W] means 5 times the weapon damage die
            // For a standard d6 weapon: 5d6 + Dex
            // The actual weapon type affects this calculation
            const damageRoll = await new Roll(`5d6 + ${dexMod}`).evaluate({ async: true });
            await damageRoll.toMessage({
                flavor: `${item.name} - Damage`,
                speaker: ChatMessage.getSpeaker({ actor: rogue.actor })
            });

            // Create the defense penalty effect
            const defensePenaltyEffect = Effect4e.createEffect(
                {
                    name: 'Feinting Flurry - Defense Penalty',
                    description: `<p>Until the end of the rogue's next turn, you take a -${chaMod} penalty to all defenses against the rogue's attacks.</p><p><em>Sustain Minor: The penalty persists until the end of your next turn.</em></p>`,
                    icon: 'icons/conditions/afflicted.svg',
                    changes: [
                        {
                            key: 'system.defences.ac.value',
                            mode: 2, // ADD (applies negative value)
                            value: -chaMod,
                            priority: 20
                        },
                        {
                            key: 'system.defences.fortitude.value',
                            mode: 2, // ADD
                            value: -chaMod,
                            priority: 20
                        },
                        {
                            key: 'system.defences.reflex.value',
                            mode: 2, // ADD
                            value: -chaMod,
                            priority: 20
                        },
                        {
                            key: 'system.defences.will.value',
                            mode: 2, // ADD
                            value: -chaMod,
                            priority: 20
                        }
                    ]
                },
                'endOfUserTurn',
                rogue
            );

            await target.replaceEffect(defensePenaltyEffect);

            // Visual effect: Disorientation/confusion
            await VFX4e.impact(target, 'ARCANE');

            // Chat message
            await Chat4e.power(
                rogue,
                'Feinting Flurry',
                `${target.name} is thrown off guard and takes a -${chaMod} penalty to all defenses against ${rogue.name}'s attacks until the end of ${rogue.name}'s next turn.`
            );
        } else {
            // Miss - no effect
            await Chat4e.power(
                rogue,
                'Feinting Flurry',
                `The feints fail to throw off ${target.name}'s guard!`
            );
        }
    }
}

main(this);