const { tokenIdentifier, effectIdentifier } = scope;

const token = Actor4e.findTokenByIdentifier(tokenIdentifier);

const actor = token.actor;

const effected = actor.appliedEffects.find(i => i.name === effectIdentifier)

if (effected) {
    await actor.deleteEmbeddedDocuments('ActiveEffect', [effected.id]);
}