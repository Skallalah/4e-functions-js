// set current scene variables

async function main() {
    const grund = Character.fromName("Grund Coeur-d'Ours");
    const spirit = Character.fromName('Esprit Protecteur');

    const grundConMod = grund.getSystem()?.abilities?.con?.mod;

    const adjacents = Target.fromCharacter(spirit).radius(1)?.type('allies').get();

    if (!adjacents.length) return;

    for (const adjacent of adjacents) {
        adjacent.tempHeal(grundConMod);
    }

    ChatMessage.create({
        speaker: 'Esprit Protecteur',
        flavor: `Protecting Strike`,
        content: `${adjacents.map(t => t.name).join(', ')} gains ${grundConMod} temporary hit points.`
    });
}

main();