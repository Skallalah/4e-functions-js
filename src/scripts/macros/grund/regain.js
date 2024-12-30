async function main() {
    const grund = Character.fromName("Grund Coeur-d'Ours");
    const spirit = Character.fromName('Esprit Protecteur');

    const grundWisMod = grund.getSystem()?.abilities?.wis?.mod;

    const adjacents = Target.fromCharacter(spirit).radius(1).type('allies').get();

    if (!adjacents.length) return;

    const roll = new Roll("1d6 + @wisMod", { wisMod: grundWisMod });

    const rolledHeal = await roll.evaluate();

    for (const adjacent of adjacents) {
        adjacent.heal(0, 0, rolledHeal.total);
    }

    ChatMessage.create({
        speaker: 'Esprit Protecteur',
        flavor: `Sharing the Kill`,
        content: `${adjacents.map(t => t.name).join(', ')} gains ${rolledHeal.total} hit points.`
    });
}

main();