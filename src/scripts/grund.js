// set current scene variables
const tokens = Scene4e.getCurrentScenesTokens();

const grund = Character.fromName('Grund Protecteur')
const spirit = Character.fromName('Esprit Protecteur');

const grundConMod = grundActor?.system?.abilities?.con?.mod;
const grundWisMod = grundActor?.system?.abilities?.wis?.mod;

const distanceAvailable = 5;

// main functions

async function applyMainHeal(item) {
    const target = await Target4e.selectTarget(token, item.img)

    if (!target) {
        return;
    }

    const tokenAtLocation = Scene4e.getTokenAtLocation(target.x, target.y);

    if (!tokenAtLocation) {
        ui.notifications.warn('Please target one friendly token.');
        return;
    }

    const isAdjacentToSpirit = Scene4e.isAdjacent(spiritToken, tokenAtLocation);

    const additionnalHealValue = grundConMod + (isAdjacentToSpirit ? grundConMod : 0);

    const heal = await Helper4e.heal(tokenAtLocation, additionnalHealValue, 1, 1);

    if (heal) {
        new Sequence()
            .effect(item.img)
            .atLocation(tokenAtLocation)
            .scale(0.5)
            .fadeIn(500, { ease: "easeOutCubic", delay: 200 })
            .duration(2500)
            .fadeOut(1000, { ease: "easeOutCubic", delay: 200 })
            .play();
    }
}

async function applyTempHealingToSpiritAdjacentTokens() {
    const adjacentTokens = Scene4e.getAdjacentTokens(spiritToken, 1);

    if (!adjacentTokens?.length > 0) return;

    for (const adjacent of adjacentTokens) {
        const heal = await Helper4e.tempHeal(adjacent, grundWisMod);

        if (heal) {
            new Sequence()
                .effect(
                    "modules/JB2A_DnD5e/Library/Generic/Particles/ParticlesSwirl02_01_Regular_GreenYellow_400x400.webm"
                )
                .atLocation(adjacent)
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
        flavor: `${adjacentTokens
            .map((t) => t.name)
            .join(", ")} gains ${grundWisMod} temporary hit points.`,
    });
}

async function main(ref) {
    await applyMainHeal(ref.item);
    await applyTempHealingToSpiritAdjacentTokens();
}

main(this);