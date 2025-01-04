import { DIVINE_SANCTION } from "../../effects";


async function main(ref) {
    const divineSanction = EffectLibrary.DIVINE_SANCTION;

    const paladin = Character.fromActor(ref.actor);

    const effect = Effect4e.createEffect(divineSanction, 'endOfUserTurn', paladin);

    console.log(effect);
}

main(this);