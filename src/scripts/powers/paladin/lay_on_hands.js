/** 
 * Bonus
 * 
 * Lend Health :
 * Whenever you use a power that allows an ally to spend a healing surge or regain hit points as if he or she had spent a healing surge, 
 * that ally can use your healing surge value to determine the number of hit points regained.
 * 
 * Devoted Paladin :
 * When you use your lay on hands on an ally, that ally regains additional hit points equal to your Charisma modifier.
 * 
 * */

async function main(ref) {
    const paladin = Character.fromActor(ref.actor);

    const chaMod = paladin.getSystem()?.abilities?.cha?.mod;
    const paladinSurgeValue = paladin.getSystem()?.details.surgeValue;

    const paladinSurges = paladin.getSystem()?.details.surges.value;

    if (paladinSurges <= 0) {
        ui.notifications.warn(`You don't any healing surges left to use this power.`);
        return;
    }

    // @todo: add type('allies')
    const targets = await Target.fromCharacter(paladin).range(1).type('allies').selectCharacters(ref.item.img);

    if (!targets.length && targets.length !== 1) return;

    const target = targets[0];
    const targetSurgeValue = target.getSystem()?.details.surgeValue;

    const usedSurgeValue = Math.max(paladinSurgeValue, targetSurgeValue);

    const heal = await target.heal(0, 0, usedSurgeValue + chaMod)

    new Sequence()
        .effect('modules/JB2A_DnD5e/Library/1st_Level/Cure_Wounds/CureWounds_01_Blue_400x400.webm')
        .atLocation(target.token)
        .scale(0.5)
        .play();

    paladin.actor.update({ 'system.details.surges.value': paladinSurges - 1 })

    ChatMessage.create({
        speaker: ref.actor.name,
        flavor: `Lay on hands`,
        content: `${target.actor.name} gains ${usedSurgeValue + chaMod} hit points.`
    });
}

main(this);