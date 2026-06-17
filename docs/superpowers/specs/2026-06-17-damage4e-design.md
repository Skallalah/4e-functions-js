# Damage4e — conception (WIP — SUPERSÉDÉ)

> **⚠️ Absorbé par [`2026-06-17-fluent-power-api-design.md`](./2026-06-17-fluent-power-api-design.md).**
> Le moteur `Damage4e` y est repris (avec `.multiplier(n)` seul, sans `half`/`double`) et intégré au
> flux fluide `Attack4e.fromItem(...).rollAttack(...).hit.applyDamage(...).run()`. Conserver ce fichier
> pour l'historique de la conception du moteur ; la spec autoritaire est désormais l'autre.
>
> **Statut : WIP.** Design validé en conversation jusqu'à la mécanique des riders incluse ; reste à
> figer quelques détails (parsing exact, `applyTo` ?, nommage final) avant le plan d'implémentation.
> Référence interne du système : [`docs/reference/dnd4e-attack-and-damage.md`](../../reference/dnd4e-attack-and-damage.md)
> (notamment §3 jet de dégâts, §4 application, §8 moteur de riders, §9 accès runtime).

## Problème

Aujourd'hui, dans les pouvoirs, **les dégâts sont jetés et affichés mais jamais appliqués** :
- dégâts d'item → `await item.rollDamage({ fastForward: true })` (poste la carte ; application
  dépendante d'un clic manuel impossible sur la cible d'autrui) ;
- dégâts d'un simple roll → `new Roll(...).toMessage(...)` (aucun PV touché) ;
- demi-dégâts au raté → second `Roll` manuel ;
- dégâts typés → tableaux ad hoc `{ damage, type }`.

`Damage4e` doit **enrober le jet (item ou formule) puis appliquer aux PV via macro**, en une API
fluide, autoportée, miroir de `Character.heal(...)`.

## Décisions de design (validées)

| Sujet | Choix |
|---|---|
| Forme | Value object fluide `Damage4e` (cohérent avec `Target`, `Effect4e`, `Attack4e`) |
| Source du jet | `item.rollDamage()` (base) **ou** formule typée via `Damage4e.fromFormula` |
| Résistances | `actor.calcDamage` par défaut ; `.trueDamage()` → `actor.applyDamage` (bypass) |
| Sortie chat | Réutilise le natif (carte item / `roll.toMessage` pour la formule) ; pas de doublon. `Chat4e` optionnel |
| Riders typés | `fromItem` : gérés par `item.rollDamage`. `fromFormula` : rejoués via `game.helper.applyEffects` + `powerData.damageType` synthétique |
| Application | macro `ApplyDamage` (élévation de permissions), miroir de `ApplyHeal` |
| Multi-cibles | un jet → `target.damage(dmg)` en boucle (chaque cible a ses propres résistances) |
| Hors v1 | crit ; riders conditionnés à la **source** de pouvoir / mots-clés custom |

## API côté pouvoirs (objectif d'élégance)

```js
// Dégâts d'item
const dmg = await Damage4e.fromItem(item).roll();
await target.damage(dmg);

// Dégâts ad hoc typés (riders rejoués)
const dmg = await Damage4e.fromFormula('2d4 + @cha', 'lightning').by(caster).roll();
await target.damage(dmg);

// Plein au hit, moitié au raté
for (const r of attackResults) {
    await r.target.damage(Attack4e.isHit(r) ? dmg : dmg.half());
}

// Vrais dégâts (ignore résistances)
await target.damage(dmg.trueDamage());
```

## Composants

### 1. `Damage4e` (`src/scripts/damage.js`)

| Membre | Comportement |
|---|---|
| `Damage4e.fromItem(item)` | builder ; `.roll()` → `await item.rollDamage()`, parse `roll.terms[].flavor` → `parts` |
| `Damage4e.fromFormula(formula, type)` | builder ; `.by(caster)` requis ; `.roll()` → recette riders ci-dessous |
| `.by(character)` | acteur / roll data / speaker (utile à `fromFormula`) |
| `.half()` / `.double()` / `.multiplier(n)` | clone avec multiplicateur d'**application** |
| `.trueDamage()` | clone avec `bypass = true` |
| `await .roll()` | **terminal** : résout `parts`/`total`/`roll`, poste le message natif, retourne le `Damage4e` résolu |
| getters | `.total`, `.parts` (`[[v,type]]`), `.type`, `.roll`, `.multiplier`, `.bypass` |

**`fromItem(...).roll()`** : `const roll = await item.rollDamage();` puis
`this._parts = _partsFromRoll(roll, 'physical')`.

**`fromFormula(...).roll()`** (réutilise le moteur de riders ; cf. référence §8.4 / §9) :
```js
const actor    = this._caster.actor;
const rollData = actor.getRollData();
const Roll4e   = CONFIG.Dice.rolls[0];
const options  = { bonuses: foundry.utils.deepClone(Roll4e.DEFAULT_OPTIONS.bonuses) };
const powerData = { name: `${this._type} damage`, damageType: { [this._type]: true } };
const extra = [];
await game.helper.applyEffects(rollData, actor, powerData, null, 'damage', extra, false, options);
const formula = [`(${this._formula})[${this._type}]`, ...extra].join(' + ');
const roll = await new Roll4e(formula, rollData, options).evaluate();
await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${this._type} damage` });
this._roll  = roll;
this._parts = _partsFromRoll(roll, this._type);
```

**`_partsFromRoll(roll, fallbackType)`** (miroir de `applyChatCardDamageInner`, cf. référence §4.2) :
parcourt `roll.terms`, pour chaque terme numérique avec `flavor` → `[total, flavor]` ; le reste non
typé → `[reste, fallbackType]` (ou réparti). Retourne `Array<[number, string]>`.

### 2. `Character.damage(damage)` — miroir de `heal`
```js
/** @param {Damage4e} damage Instance de dégâts résolue (.roll() appelé) */
async damage(damage) {
    return Helper4e.damage(this._actor, damage.parts, damage.multiplier, damage.bypass);
}
```

### 3. `Helper4e` — délégation + corps de macro (calqué sur `heal`)
```js
static async damage(actor, parts, multiplier, bypass) {
    return await game.macros.getName('ApplyDamage')
        .execute({ actorIdentifier: actor.name, parts, multiplier, bypass });
}
static async macroApplyDamage(scope) {
    const { actorIdentifier, parts, multiplier = 1, bypass = false } = scope;
    const actor = Actor4e.findActorByName(actorIdentifier);
    if (!actor) return undefined;
    if (bypass) await actor.applyDamage(parts.reduce((s, [v]) => s + v, 0), multiplier);
    else        await actor.calcDamage(parts, multiplier);
    return true;
}
```

### 4. Macro monde `ApplyDamage` (`src/scripts/macros/general/apply_damage.js`)
```js
return Helper4e.macroApplyDamage(scope);
```
+ ajout de `"scripts/damage.js"` dans `module.json` (après `attack.js`). À créer aussi comme macro
nommée `ApplyDamage` dans le monde Foundry.

## Accès runtime requis (confirmés — cf. référence §9)
- `game.helper.applyEffects(...)`
- `CONFIG.Dice.rolls[0]` (= `Roll4e`) + `.DEFAULT_OPTIONS.bonuses`
- `item.rollDamage()` (méthode publique)

## Principes respectés
- Fluide & autoporté : `Damage4e.fromItem(item).roll()` / `target.damage(dmg)`.
- Abstraction : fini les `new Roll(...).toMessage(...)` éparpillés.
- Réutilise dnd4e de bout en bout (`item.rollDamage`, `applyEffects`, `Roll4e`, `calcDamage`,
  `applyDamage`) — aucun pipeline réécrit, riders inclus.
- Macro conservée pour l'élévation de permissions.

## Points ouverts (à trancher avant le plan)
1. **`applyTo(characters)`** sur `Damage4e` (sucre multi-cibles) — ou se contenter de
   `target.damage(dmg)` en boucle ? (reco : boucle suffit)
2. **Nommage** `fromFormula` + terminal `.roll()` — OK ou variante ?
3. **Riders source/mots-clés** pour `fromFormula` : enrichir `powerData` (effectType, powersource) ou
   accepter l'item d'origine en contexte ? (reco : v2)
4. **Parsing du reste non typé** : `fallbackType` = type primaire (`fromFormula`) vs `"physical"`
   (`fromItem`) — confirmer le comportement attendu.
5. **Refactor des pouvoirs existants** (furious_bolts, thunderclap, feinting_flurry) comme preuve.

## Validation (en jeu, pas de tests auto)
- `fromItem` : dégâts appliqués à la cible, résistances respectées.
- `fromFormula` typé : rider de type (ex. +4+@cha lightning de Talaerin) bien inclus.
- `.half()` au raté, `.trueDamage()` ignore les résistances, soin (`multiplier -1`) inchangé.
- Multi-cibles : chaque cible reçoit le calcul avec ses propres résistances.
