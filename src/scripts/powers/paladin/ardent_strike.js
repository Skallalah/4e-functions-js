async function main(ref) {
    const divineSanction = EffectLibrary.DIVINE_SANCTION;

    const paladin = Character.fromActor(ref.actor);

    const effect = Effect4e.createEffect(divineSanction, 'endOfUserTurn', paladin);

    console.log(effect);

    const targets = User4e.getTargets();

    for (const target of targets) {
        await target.replaceEffect(effect);
    }
}

main(this);