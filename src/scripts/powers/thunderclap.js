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
    const attackResults = await Attack4e.rollAttack(item, targets, {
        fastForward: false
    });

    const hitTargets = [];
    const missTargets = [];

    // Step 4: Process results and apply effects
    for (const result of attackResults) {
        const target = result.target;

        if (result.hit) {
            hitTargets.push(target);

            // Roll full damage: 4d6 + 12
            const damageRoll = await new Roll('4d6 + 12').evaluate({ async: true });
            await damageRoll.toMessage({
                flavor: `${item.name} - Thunder Damage (Hit)`,
                speaker: ChatMessage.getSpeaker({ actor: caster.actor })
            });

            // Apply stunned effect
            const stunnedEffect = Effect4e.createEffect(
                EffectLibrary.STUNNED,
                'endOfUserTurn',
                caster
            );

            await target.replaceEffect(stunnedEffect);

            // Visual effect: Thunder impact
            await VFX4e.impact(target, 'THUNDER');

        } else {
            missTargets.push(target);

            // Roll half damage: 2d6 + 6
            const damageRoll = await new Roll('2d6 + 6').evaluate({ async: true });
            await damageRoll.toMessage({
                flavor: `${item.name} - Thunder Damage (Miss)`,
                speaker: ChatMessage.getSpeaker({ actor: caster.actor })
            });

            // Apply dazed effect
            const dazedEffect = Effect4e.createEffect(
                EffectLibrary.DAZED,
                'endOfUserTurn',
                caster
            );

            await target.replaceEffect(dazedEffect);

            // Visual effect: Lesser thunder impact
            await VFX4e.custom(
                'jb2a.impact.groundcrack.01.blue',
                target,
                { scale: 0.7 }
            );
        }
    }

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