/**
 * Leading Step
 * Avenger Utility 10
 *
 * After your enemy strikes, you teleport away. An instant later, you bring the enemy after you.
 *
 * Encounter ✦ Divine, Teleportation
 * Immediate Reaction      Melee 1
 *
 * Trigger: An enemy adjacent to you damages you
 * Target: The triggering enemy
 * Effect: You teleport 5 squares and then teleport the target to a square adjacent to you.
 */

async function main(ref) {
    const avenger = Character.fromActor(ref.actor);
    const item = ref.item;

    // Step 1: Select the triggering enemy
    // Since this is a reaction, the player should select which adjacent enemy triggered it
    const adjacentEnemies = Scene4e.getAdjacentTokens(
        avenger.token,
        -avenger.token.document.disposition // Opposite disposition = enemies
    );

    if (adjacentEnemies.length === 0) {
        ui.notifications.warn('No adjacent enemies found to target.');
        return;
    }

    // If multiple adjacent enemies, let player select which one triggered the reaction
    let triggeringEnemy;

    if (adjacentEnemies.length === 1) {
        triggeringEnemy = Character.fromToken(adjacentEnemies[0]);
    } else {
        const [selected] = await Target.fromCharacter(avenger)
            .range(1)
            .type('enemies')
            .selectCharacters(item.img);

        if (!selected) {
            ui.notifications.warn('No enemy selected.');
            return;
        }

        triggeringEnemy = selected;
    }

    // Step 2: Avenger teleports 5 squares away
    const avengerDestination = await Target.fromCharacter(avenger)
        .range(5)
        .selectTarget(item.img);

    if (!avengerDestination) {
        ui.notifications.warn('No destination selected for teleport.');
        return;
    }

    // Perform avenger's teleportation with Divine theme
    await VFX4e.teleport(avenger, avengerDestination, 'DIVINE');

    // Brief pause for dramatic effect
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Teleport the enemy to a square adjacent to avenger's new position
    const enemyDestination = await Target.fromCharacter(avenger)
        .range(1)
        .selectTarget(item.img);

    if (!enemyDestination) {
        ui.notifications.warn('No destination selected for enemy.');
        // Avenger already teleported, so this is awkward but acceptable
        await Chat4e.power(
            avenger,
            "Leading Step",
            `${avenger.name} teleports away from ${triggeringEnemy.name}, but fails to pull them along!`
        );
        return;
    }

    // Check if the selected square is actually adjacent to avenger's new position
    const isAdjacent = Scene4e.isAdjacent(
        { x: avengerDestination.origin.x, y: avengerDestination.origin.y },
        { x: enemyDestination.origin.x, y: enemyDestination.origin.y }
    );

    if (!isAdjacent) {
        ui.notifications.warn('Enemy destination must be adjacent to your new position. Please select an adjacent square.');
        // Could loop here to let them select again, but for simplicity we'll just warn
        await Chat4e.power(
            avenger,
            "Leading Step",
            `${avenger.name} teleports away, but ${triggeringEnemy.name} resists being pulled along!`
        );
        return;
    }

    // Perform enemy's forced teleportation
    // Use a more forceful/pulling visual effect for the enemy
    await VFX4e.teleport(triggeringEnemy, enemyDestination, {
        color: 'yellow',
        beam: 'jb2a.energy_strands.range.standard.yellow',
        useBeam: true,
        fadeIn: 100,
        duration: 700,
        fadeOut: 200
    });

    // Success message
    await Chat4e.power(
        avenger,
        "Leading Step",
        `${avenger.name} teleports away from ${triggeringEnemy.name}'s attack, then yanks the enemy along to a new position!`
    );

    // Optional: Visual effect showing the connection/pull
    await VFX4e.beam(avenger, triggeringEnemy, {
        file: 'jb2a.energy_strands.range.standard.yellow',
        scale: 0.8,
        duration: 800,
        fadeOut: 400
    });
}

main(this);
