const talaerin = Character.fromName('Talaerin Silomorel');

const target = await Target.fromCharacter(talaerin).range(5).selectTarget(this.item.img);

if (!target) return;

new Sequence()
    .effect()
        .from(talaerin.token)
        .fadeIn(50)
        .duration(550)
        .fadeOut(250)
        .filter("Blur")
        .elevation(0)
    .effect()
        .file("jb2a.chain_lightning.secondary.blue")
        .atLocation(talaerin.token)
        .stretchTo(target.origin)
        .elevation(0)
    .wait(100)
    .animation()
        .on(talaerin.token)
        .teleportTo(target.origin)
        .snapToGrid()
        .waitUntilFinished()
    .effect()
        .file("jb2a.static_electricity.03.blue")
        .atLocation(talaerin.token)
        .scaleToObject()
    .play();