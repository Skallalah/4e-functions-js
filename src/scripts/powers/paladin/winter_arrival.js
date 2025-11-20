/**
 * Winter's Arrival
 * Paladin Utility 10
 *
 * You step through deep shadow to chase your foe, bringing icy ground back with you.
 *
 * Encounter & Divine, Teleportation
 * Move Action      Personal
 *
 * Effect: You teleport a number of squares equal to 1 + your Charisma modifier,
 * to a space adjacent to an enemy marked by you. All squares adjacent to you
 * are difficult terrain until the end of your next turn.
 */

async function main(ref) {
    const paladin = Character.fromActor(ref.actor);

    // Get Charisma modifier using new abstraction
    const chaMod = paladin.getAbilityMod('cha');
    const teleportRange = 1 + chaMod;

    // Select target location interactively
    const targetLocation = await Target.fromCharacter(paladin)
        .range(teleportRange)
        .selectTarget(ref.item.img);

    if (!targetLocation) return; // User cancelled

    // Check if there's an enemy marked by the paladin adjacent to the target location
    const adjacentEnemies = Scene4e.getAdjacentTokens(
        { x: targetLocation.origin.x, y: targetLocation.origin.y },
        -paladin.token.document.disposition // Opposite disposition = enemies
    );

    // Filter for enemies marked by this paladin
    const markedEnemies = adjacentEnemies.filter(token => {
        const effects = token.actor?.effects || [];
        return Array.from(effects).some(effect => {
            // Check if effect is Divine Sanction from this paladin
            return effect.name === 'Divine Sanction' &&
                   effect.origin === `Actor.${paladin.actor.id}`;
        });
    });

    if (markedEnemies.length === 0) {
        ui.notifications.warn('You must teleport to a space adjacent to an enemy marked by you.');
        return;
    }

    // Perform teleportation with Divine power source and icy theme
    await VFX4e.teleport(paladin, targetLocation, {
        color: 'blue',
        beam: 'jb2a.energy_strands.range.standard.blue',
        useBeam: true,
        fadeIn: 50,
        duration: 600,
        fadeOut: 300
    });

    // Create difficult terrain effect (icy ground around paladin)
    const difficultTerrainEffect = Effect4e.createEffect(
        {
            name: "Winter's Arrival - Icy Ground",
            description: `<p>All squares adjacent to ${paladin.name} are <strong>difficult terrain</strong> until the end of their next turn.</p>`,
            icon: 'icons/magic/water/barrier-ice-crystal-wall-jagged-blue.webp'
        },
        'endOfUserTurn',
        paladin
    );

    // Apply effect to paladin (indicating the aura of difficult terrain)
    await paladin.addEffect(difficultTerrainEffect);

    // Visual effect for icy ground around paladin's new position
    await VFX4e.aura(paladin, {
        file: 'modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_BlueWhite_400x400.webm',
        scale: 0.6,
        duration: 3000,
        fadeIn: 500,
        fadeOut: 800,
        belowTokens: true
    });

    // Chat message using Chat4e
    const targetEnemy = Character.fromToken(markedEnemies[0]);
    await Chat4e.power(
        paladin,
        "Winter's Arrival",
        `${paladin.name} teleports through shadow to pursue ${targetEnemy.name}, leaving icy ground in their wake. All adjacent squares are now difficult terrain!`
    );
}

main(this);
