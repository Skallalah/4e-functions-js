// set current scene variables

const horgrim = Character.fromName('Horgrim');

const damageMap = [
    { damage: '3d10', type: 'fire' },
    { damage: '7d4', type: 'thunder' },
    { damage: '5d6', type: 'cold' },
    { damage: '4d8', type: 'radiant' },
]

async function main(item) {
    /*

    new Sequence()
        .effect()
        .copySprite(horgrim.token)
        .fadeIn(50)
        .duration(550)
        .fadeOut(250)
        .filter("Blur")
        .elevation(0)
        .wait(100)
        .animation()
        .on(horgrim.token)
        .teleportTo(target.origin)
        .snapToGrid()
        .waitUntilFinished()
        .effect()
        .file("jb2a.impact.fire.01.orange.0")
        .atLocation(target.origin)
        .play();

    */

    const characters = await Target.fromCharacter(horgrim)
        .areaBurst(1)
        .within(5)
        .type('enemies')
        .place({ icon: item.img });

    if (!characters.length) return;

    User4e.updateTargets(characters);

    const roll = await item.rollAttack();

    console.log(roll);

    await item.rollDamage({ fastForward: true })

    /*

     const index = new Roll('1d4').evaluate({ async: false });
        console.log(index)
        const damage = damageMap[index.result - 1];
        
    */

    console.log(characters)

    const tokenIdentifiers = characters.map(t => t.id);

    if (game.combat) {
        await game.macros.getName("Mark (Horgrim)")?.execute({ tokenIdentifiers })
    }
}

main(this.item);
