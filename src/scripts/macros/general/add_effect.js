const { tokenIdentifier, effectData } = scope;

const token = Actor4e.findTokenByIdentifier(tokenIdentifier);

const actor = token.actor;

const activeEffect = new ActiveEffect(effectData);

await actor.createEmbeddedDocuments('ActiveEffect', [activeEffect]);