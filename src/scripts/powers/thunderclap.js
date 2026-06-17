/**
 * Thunderclap
 * Dragon Attack Power
 *
 * A deafening clap of thunder stuns your foes.
 *
 * Encounter ✦ Thunder
 * Standard Action      Area burst 3 within 20
 *
 * Attack: +25 vs. Fortitude (creatures in the burst)
 * Hit: 4d6 + 12 thunder damage, and the target is stunned until the end of the dragon's next turn.
 * Miss: Half damage, and the target is dazed until the end of the dragon's next turn.
 */

async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const item = ref.item;

    // Step 1: Select area target (burst 3 within 20)
    const targetLocation = await Target.fromCharacter(caster)
        .range(20)
        .selectTarget(item.img);

    if (!targetLocation) {
        return; // User cancelled
    }

    // Step 2: Get all creatures in the burst area
    const targets = Target.fromCoordinates(targetLocation.x, targetLocation.y)
        .radius(3)
        .type('creatures')
        .get();

    if (targets.length === 0) {
        await Chat4e.power(caster, 'Thunderclap', 'No creatures in the area of effect.');
        return;
    }

    // Step 3: Perform attacks against all targets
    const result = await Attack4e.fromItem(item).rollAttack(targets, { fastForward: false });

    // Step 4: One thunder roll for the whole burst; misses take half of the SAME roll.
    const dmg = await Damage4e.fromFormula('4d6 + 12', 'thunder').by(caster).roll();

    // Hit: full damage, stunned, thunder impact.
    await result.hit
        .applyDamage({ damage: dmg })
        .applyEffect({ data: EffectLibrary.STUNNED, durationType: 'endOfUserTurn' })
        .applyVFX({ type: 'THUNDER' })
        .run();

    // Miss: half of the same roll, dazed.
    await result.miss
        .applyDamage({ damage: dmg, multiplier: 0.5 })
        .applyEffect({ data: EffectLibrary.DAZED, durationType: 'endOfUserTurn' })
        .run();

    // Lesser impact VFX on each missed target (bespoke, stays manual).
    for (const o of result.miss) {
        await VFX4e.custom('jb2a.impact.groundcrack.01.blue', o.target, { scale: 0.7 });
    }

    const hitTargets = result.hit.map(o => o.target);
    const missTargets = result.miss.map(o => o.target);

    // Step 5: Area effect visual
    await VFX4e.custom(
        'jb2a.impact.004.blue',
        { x: targetLocation.x, y: targetLocation.y },
        { 
            scale: 3.0, // Scale for burst 3 area
            fadeIn: 200,
            duration: 800
        }
    );

    // Step 6: Chat message summary
    const hitCount = hitTargets.length;
    const missCount = missTargets.length;

    let summary = `Thunderclap affects ${targets.length} creature${targets.length > 1 ? 's' : ''}: `;
    
    if (hitCount > 0) {
        const hitNames = hitTargets.map(t => t.name).join(', ');
        summary += `<strong>${hitCount} stunned</strong> (${hitNames})`;
    }
    
    if (missCount > 0) {
        if (hitCount > 0) summary += ', ';
        const missNames = missTargets.map(t => t.name).join(', ');
        summary += `<strong>${missCount} dazed</strong> (${missNames})`;
    }

    await Chat4e.power(caster, 'Thunderclap', summary);
}

main(this);