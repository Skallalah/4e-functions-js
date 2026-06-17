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

const EFFECT = {
                name: 'Furious Bolts - Attack Bonus',
                description: `<p>+${hitCount} bonus to your first attack roll on your next turn (from hitting ${hitCount} creature${hitCount > 1 ? 's' : ''} with Furious Bolts).</p>`,
                icon: 'icons/magic/lightning/bolt-strike-blue.webp',
                changes: [
                    {
                        key: 'system.attributes.attack.bonus',
                        mode: 2, // ADD
                        value: hitCount,
                        priority: 20
                    }
                ]
            };

// This is a reimagination of an improved interface for our data flow, for readibility and ease of use
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;

    // Track all hits for the chain effect
    const hitTargets = [];
    const attackedTargets = new Set();

    // Step 1: Select and attack primary target
    const primaryTargetSelection = await Target.fromCharacter(caster)
        .range(20)
        .type('enemies')
        .selectCharacters({ number: 1, icon: item.img }); // number too generic ? How many targets must be selected, by default 1

    // Check a potentially better naming for the getter
    if (!primaryTargetSelection) {
        ui.notifications.warn('No target selected.');
        return;
    }

    // Primary Target should be a Character - all actor / tokens should be transformed in Character for use in powers
    const primaryTarget = primaryTargetSelection[0];
    attackedTargets.add(primaryTarget.id); // Character id - made of actor id + token id to have unique Scene id, data from the macro actor access for permissions

    // Primary Attack using Attack4e abstraction
    // rollAttack / rollAttacks ? Potential sucre syntaxique
    const primaryAttackResults = await Attack4e({ item }).rollAttack([primaryTarget], {
        fastForward: true
    });

    // This is the type of interface which is readable
    // Hit is an array of another class, which has the character ref and roll info
    // Same for Miss, both are getters (miss = miss + critical miss, hit = critical hit + hit)
    // can apply[X] on all ArrayClass (name non contractual) or each member
    primaryAttackResults.hit
        .applyDamage({ fastForward: true })
        .applyVFX({ type: 'LIGHTNING '})
        // .applyEffect({ ... }) another potential one liner to the result


    // Step 2: Chain secondary attacks
    let currentOrigin = primaryTarget;
    let continueChain = primaryAttackResults.hasHit();

    while (continueChain) {
        // Get potential secondary targets within 10 squares of current origin
        const potentialTargets = Target.fromCharacter(currentOrigin)
            .range(10)
            .type('enemies')
            .get()
            .filter(target => !attackedTargets.has(target.id)); // Still a Character, unique id from actor / token (if created by fromToken)

        if (potentialTargets.length === 0) {
            // No more valid targets
            continueChain = false;
            break;
        }

        // Select next target in the chain
        const secondaryTargetSelection = await Target.fromCharacter(currentOrigin)
            .range(10)
            .type('enemies')
            .selectCharacters(item.img);

        if (!secondaryTargetSelection || secondaryTargetSelection.length === 0) {
            continueChain = false;
            break;
        }

        const secondaryTarget = secondaryTargetSelection[0];

        // Check if this target was already attacked
        if (attackedTargets.has(secondaryTarget.id)) { // Still Character id
            ui.notifications.warn(`${secondaryTarget.name} has already been attacked. Choose a different target.`);
            continue;
        }

        attackedTargets.add(secondaryTarget.actor.id);

        // Visual effect: Lightning chain from previous target to new target
        await VFX4e.beam(currentOrigin, secondaryTarget, 'LIGHTNING');

        // Important : The rest is not DONE, you get the gist of it

        // Secondary Attack using Attack4e abstraction
        const secondaryAttackResults = await Attack4e.rollAttack(item, secondaryTarget, {
            fastForward: false
        });

        const secondaryHit = Attack4e.isHit(secondaryAttackResults[0]);

        if (secondaryHit) {
            hitTargets.push(secondaryTarget);

            // Roll secondary damage: 2d4 + Cha (different from primary!)
            // Must roll manually since item damage is configured for 2d8
            const secondaryDamageRoll = await new Roll(`2d4 + ${chaMod}`).evaluate({ async: true });
            await secondaryDamageRoll.toMessage({
                flavor: `${item.name} - Secondary Lightning Damage`,
                speaker: ChatMessage.getSpeaker({ actor: caster.actor })
            });

            // Visual effect: Lightning impact on secondary target
            await VFX4e.impact(secondaryTarget, 'LIGHTNING');

            // Update origin for next potential chain
            currentOrigin = secondaryTarget;
        } else {
            // Miss: chain breaks
            continueChain = false;

            // Visual effect: Lightning fizzles
            await VFX4e.custom(
                'jb2a.static_electricity.03.blue',
                secondaryTarget,
                { scale: 0.5 }
            );
        }
    }

    // Step 3: Apply effect buff for next turn
    const hitCount = hitTargets.length;

    if (hitCount > 0) {
        const furiousBoltsEffect = Effect4e.createEffect(
            EFFECT,
            'endOfUserTurn',
            caster
        );

        await caster.addEffect(furiousBoltsEffect);
    }

    // Chat message summarizing the chain
    const hitNames = hitTargets.map(t => t.name).join(', ');
    await Chat4e.power(
        caster,
        'Furious Bolts',
        `Lightning chains through ${hitCount} creature${hitCount > 1 ? 's' : ''}: ${hitNames}. ${caster.name} gains +${hitCount} to their next attack roll!`
    );
}

main(this);
