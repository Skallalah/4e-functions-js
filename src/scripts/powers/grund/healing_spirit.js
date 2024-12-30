// set current scene variables
const grund = Character.fromName("Grund Coeur-d'Ours")
const spirit = Character.fromName('Esprit Protecteur');

const grundConMod = grund.getSystem()?.abilities?.con?.mod;
const grundWisMod = grund.getSystem()?.abilities?.wis?.mod;

// main functions

async function applyMainHeal(item) {
    const targets = await Target.fromCharacter(grund).range(5).selectCharacters(item.img);

    if (!targets?.length) return;

    for (const character of targets) {
        const additionalHealValue = grundConMod + (spirit.isAdjacent(character) ? grundConMod : 0);

        const heal = await character.heal(1, 1, additionalHealValue);

        if (heal) {
            new Sequence()
                .effect(item.img)
                .atLocation(character.token)
                .scale(0.5)
                .fadeIn(500, { ease: "easeOutCubic", delay: 200 })
                .duration(2500)
                .fadeOut(1000, { ease: "easeOutCubic", delay: 200 })
                .play();
        }
    }
}

async function applyTempHealingToSpiritAdjacentTokens() {
    const adjacents = Target.fromCharacter(spirit).radius(1).type('allies').get();

    if (!adjacents.length) return;

    for (const character of adjacents) {
        const heal = await character.tempHeal(grundWisMod)

        if (heal) {
            new Sequence()
                .effect(
                    "modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_GreenYellow_400x400.webm"
                )
                .atLocation(character.token)
                .belowTokens()
                .scale(0.5)
                .fadeIn(500, { ease: "easeOutCubic", delay: 200 })
                .fadeOut(500)
                .duration(2000)
                .play();
        }
    }

    ChatMessage.create({
        speaker: "Esprit Protecteur",
        flavor: 'Strengthening Spirit',
        content: `${adjacents
            ?.map((t) => t.name)
            .join(", ")} gains ${grundWisMod} temporary hit points.`,
    });
}

async function main(ref) {
    await applyMainHeal(ref.item);
    await applyTempHealingToSpiritAdjacentTokens();
}

main(this);