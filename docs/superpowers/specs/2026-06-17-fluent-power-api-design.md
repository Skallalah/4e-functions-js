# API de pouvoir fluide — attaque → dégâts → application (spec)

> **Portée.** Refonte de l'API exposée aux scripts de pouvoir pour rendre le flux
> attaque → dégâts → effets/VFX lisible et autoporté, autour du fichier cible
> `src/scripts/powers/lightning_fury/furious_bolts_ideal.js`. Couvre `Attack4e` (statique → instance),
> un objet résultat riche (`AttackResult` / `AttackOutcome`), le moteur `Damage4e`, `Character`
> (`id`, `damage`), `Target.selectCharacters`, le rebranchement progressif des macros sur
> `Character.id`, et l'ordre de chargement.
>
> Remplace et absorbe le WIP [`2026-06-17-damage4e-design.md`](./2026-06-17-damage4e-design.md)
> (le moteur `Damage4e` y est repris). Référence système :
> [`docs/reference/dnd4e-attack-and-damage.md`](../../reference/dnd4e-attack-and-damage.md) (§3 jet,
> §4 application, §8 riders, §9 accès runtime).

## Objectif d'élégance (à quoi doit ressembler un pouvoir)

```js
async function main(ref) {
    const caster = Character.fromActor(ref.actor);
    const attack = Attack4e.fromItem(ref.item);          // porte l'item (+ caster via item.actor)

    const target = await Target.fromCharacter(caster)
        .range(20).type('enemies')
        .selectCharacters({ count: 1, icon: ref.item.img });
    if (!target.length) return;

    const result = await attack.rollAttack(target);      // AttackResult (array-like)

    await result.hit
        .applyDamage({ fastForward: true })              // dégâts de l'item, riders inclus
        .applyVFX({ type: 'LIGHTNING' })
        .run();                                           // exécute la chaîne, dans l'ordre

    // Dégâts ad hoc typés (2d4 lightning) : même rider que l'item
    await result.hit
        .applyDamage({ formula: '2d4 + @cha', type: 'lightning' })
        .run();
}
```

## Décisions actées (par l'utilisateur)

| # | Décision |
|---|---|
| 1 | `Attack4e.fromItem(item)` (pattern factory, cohérent avec `Character.fromActor`, `Target.fromCharacter`, `Damage4e.fromItem`) |
| 2 | Chaînage **paresseux** : `.applyX()` empile, **terminal `.run()`** exécute le tout avec un seul `await` global, dans l'ordre |
| 3 | `rollAttack` garde son nom et retourne un **objet/classe résultat** (`AttackResult`), **array-like** pour la rétro-compat |
| 4 | Override `.applyDamage()` v1 = `{ fastForward, formula, type, trueDamage, multiplier, damage }`. **Pas de `half`/`double`** : `half` = `multiplier: 0.5`. `damage` = `Damage4e` déjà résolu, **réutilisé** (jet partagé hit/raté) |
| 5 | Noms autoportés cohérents D&D4e (voir §Nommage) |
| 6 | `Character.id` : `actorId` si `fromActor`, `actorId.tokenId` si token dispo. **Rebranchement progressif des macros** sur cet id, **en commençant par la voie dégâts (Furious Bolts)** |

## Nommage retenu

| Nom | Sens | Justification |
|---|---|---|
| `AttackResult` | retour de `rollAttack` : résultat de l'attaque sur ses cibles ; array-like (itérable sur les `AttackOutcome`, `result[0]`, `.length`) | « le résultat de l'attaque » se lit immédiatement ; reste indexable pour la rétro-compat |
| `AttackOutcome` | entrée par cible : `{ target, state, total, defense, roll }` (ex-typedef `AttackResult`) ; **`target` est un `Character`** | « l'issue contre cette cible » ; libère le nom `AttackResult` pour le tout. **Pas de rename `target`→`character`** : on garde `target`, qui *renvoie un `Character`* |
| `AttackResult#hit` / `#miss` | sous-`AttackResult` filtrés (hit = HIT+CRITICAL ; miss = MISS+FUMBLE+IMMUNE) | vocabulaire D&D4e direct |
| `AttackResult#hasHit()` / `#hasMiss()` | bool de présence | lisible en condition (`while (result.hasHit())`) |
| `selectCharacters({ count, icon })` | `count` = nombre **exact** de cibles à sélectionner (défaut 1) | `count` est clair (≠ `number`, jugé trop générique) ; on garde `selectCharacters` (renvoie des `Character`) |

## Composants

### 1. `Character` (`src/scripts/character.js`)

- **`constructor(actor, token = null)`** + `Character.fromToken(token)` stocke `this._token`.
- **`get id()`** :
  ```js
  get id() {
      return this._token ? `${this._actor.id}.${this._token.id}` : this._actor.id;
  }
  ```
  Utilisé pour le dédoublonnage des cibles et, à terme, comme clé de résolution permission-safe côté macro.
- **`async damage(damage)`** (remplace le stub) — primitive bas niveau, miroir de `heal` :
  ```js
  /** @param {Damage4e} damage Instance résolue (.roll() appelé) */
  async damage(damage) {
      return Helper4e.damage(this.id, damage.parts, damage.multiplier, damage.bypass);
  }
  ```
- **`addEffect`/`replaceEffect`** : router via `this._token?.id ?? this.token.id` (et non `this.token.id` direct, qui *throw* sur acteur multi-tokens). Maintenant que `_token` existe, l'effet vise le token précis de la cible.

### 2. `Target` (`src/scripts/target.js`)

- **`get()` — corriger le bug `fromActor`.** Actuellement (`target.js:166`) :
  `[...new Set(targets.map(t => t.actor))].map(actor => Character.fromActor(actor))` — il **jette le token** et **dédoublonne par acteur**. Conséquences : (a) les `Character` issus du ciblage n'ont pas d'`id` composite (il retombe sur `actorId`) → dédoublonnage et résolution macro inertes ; (b) 5 gobelins identiques (même prototype) → **1 seule cible**. Correctif :
  ```js
  get() {
      // ... filtrage inchangé ...
      return [...new Map(targets.map(t => [t.id, t])).values()]  // dédoublonnage PAR TOKEN
          .map(token => Character.fromToken(token));             // garde le token → id composite
  }
  ```
  (`Character.fromToken` doit stocker `this._token` — cf. §1.) `Target.fromCharacter` doit elle aussi préférer `character._token` au getter `token` qui *throw* en multi-tokens.
- **`async selectCharacters({ count = 1, icon } = {})`** :
  - **exactement `count` cibles** : accumulation interne jusqu'à `count` (compteur), puis **validation de la sélection entière** (on ne renvoie que quand les `count` cibles sont choisies) ;
  - **corrige le bug actuel** (`while(true)` sans sortie + `null.get()` à l'annulation) → renvoie `[]` à l'annulation, jamais d'exception ;
  - renvoie `Character[]` (toujours, contrat unique : tester `.length`) — *donc les gardes en `if (!selection)` deviennent `if (!selection.length)`*.

### 3. `Damage4e` (`src/scripts/damage.js`) — le moteur

| Membre | Comportement |
|---|---|
| `Damage4e.fromItem(item)` | `.roll()` → `await item.rollDamage()` (riders gérés par le système), parse `roll.terms[].flavor` → `parts` |
| `Damage4e.fromFormula(formula, type)` | `.by(caster)` requis ; `.roll()` → recette riders (cf. réf. §8.4/§9) |
| `.by(character)` | acteur / roll data / speaker |
| `.multiplier(n)` | **clone** avec multiplicateur d'application (`0.5` = demi, `2` = double) — **seul** modifieur numérique ; conserve le jet déjà résolu |
| `.trueDamage()` | **clone** avec `bypass = true` (ignore résistances) ; conserve le jet déjà résolu |
| `.clone({ multiplier, bypass })` | clone interne réutilisé par `run()` ; **ne re-jette pas** (recopie `_roll`/`_parts`/`_total`) |
| `await .roll()` | terminal **idempotent** : au 1ᵉʳ appel résout `parts`/`total`/`roll` et poste le message natif ; aux suivants renvoie le résultat **stocké** (réutilisable hit/raté). Retourne le `Damage4e` résolu |
| getters | `.total`, `.parts` (`[[v,type]]`), `.type`, `.roll`, `.multiplier`, `.bypass` |

`fromFormula(...).roll()` (réutilise le moteur de riders, ne réinvente rien) :
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
this._roll = roll; this._parts = Damage4e._partsFromRoll(roll, this._type);
```
`_partsFromRoll(roll, fallbackType)` : parcourt `roll.terms`, terme numérique + `flavor` → `[total, flavor]` ; reste non typé → `[reste, fallbackType]`. (Miroir de `applyChatCardDamageInner`, réf. §4.2.)

### 4. `AttackResult` + `AttackOutcome` (dans `src/scripts/attack.js`)

**`AttackOutcome`** (par cible) :
```js
/**
 * @typedef {Object} AttackOutcome
 * @property {Character} target  Cible, sous forme de Character (wrappé via fromToken → id composite)
 * @property {AttackState} state    hit|critical|miss|fumble|immune|unknown
 * @property {number} total
 * @property {'ac'|'fort'|'ref'|'will'} defense
 * @property {Roll} roll
 */
```

**`AttackResult`** — classe **array-like** (étend `Array` ou wrappe + `[Symbol.iterator]`, `length`, indexation) contenant des `AttackOutcome`, portant le contexte d'attaque (`_item`, `_caster`) et une **file d'opérations** :

| Membre | Rôle |
|---|---|
| `get hit()` / `get miss()` | nouveau `AttackResult` filtré (hit = HIT+CRITICAL ; miss = MISS+FUMBLE+IMMUNE), conservant `_item`/`_caster` |
| `hasHit()` / `hasMiss()` | booléens |
| `applyDamage(opts = {})` | empile une op `damage`, renvoie `this` |
| `applyVFX(opts = {})` | empile une op `vfx`, renvoie `this` |
| `applyEffect(opts = {})` | empile une op `effect`, renvoie `this` |
| `async run()` | exécute la file **dans l'ordre**, renvoie `Promise<this>` |

Rétro-compat : `result[0]` est un `AttackOutcome` ; `Attack4e.isHit(result[0])`, `Attack4e.hits(result)`, etc. continuent de fonctionner (ils lisent `.state`).

**Sémantique de `run()`** :
- **`damage`** : un **seul** jet pour le groupe (règle 4e : on jette une fois, on applique à toutes les cibles touchées) :
  ```js
  // opts.damage = Damage4e DÉJÀ résolu (réutilisé) ; sinon on en résout un.
  const dmg = opts.damage ?? (opts.formula
      ? await Damage4e.fromFormula(opts.formula, opts.type).by(this._caster).roll()
      : await Damage4e.fromItem(this._item).roll());        // fastForward via opts
  const applied = (opts.trueDamage || opts.multiplier != null)
      ? dmg.clone({ bypass: opts.trueDamage, multiplier: opts.multiplier }) // clone : conserve le jet stocké
      : dmg;
  for (const o of this) await o.target.damage(applied);     // chaque cible : ses propres résistances
  ```
  **Réutilisation du jet (demi-dégâts au raté).** Un `Damage4e` **stocke son résultat** une fois `.roll()` appelé (`_roll`/`_parts`/`_total` mémorisés, `.roll()` idempotent ; `.multiplier`/`.trueDamage` clonent **sans re-roll**). On jette donc une fois et on réapplique au groupe raté à la moitié *du même* jet (RAW 4e) :
  ```js
  const dmg = await Damage4e.fromItem(item).roll();           // jeté une fois
  await result.hit.applyDamage({ damage: dmg }).run();
  await result.miss.applyDamage({ damage: dmg, multiplier: 0.5 }).run();
  ```
- **`vfx`** : `for (const o of this) await VFX4e.impact(o.target, opts.type.trim())` (trim → tolère `'LIGHTNING '`).
- **`effect`** : `const e = Effect4e.createEffect(opts.data, opts.durationType, this._caster); for (const o of this) await o.target.replaceEffect(e)`.

**Cycle de vie de `run()`** : `.hit`/`.miss` renvoient une **instance fraîche** (file vide propre) ; `run()` marque sa file **consommée** (garde le double-`run()`) et entoure chaque application par cible d'un `try/catch` (un échec macro sur une cible ne stoppe pas les autres ; les erreurs sont collectées et renvoyées dans le résumé de `run()`).

### 5. `Attack4e` (`src/scripts/attack.js`) — statique → instance

- **`static fromItem(item)`** → `new Attack4e(item)` ; `this._item = item`, `this._caster = Character.fromActor(item.actor)`.
- **`async rollAttack(targets, options = {})`** (instance ; plus d'argument `item`) :
  - `User4e.updateTargets(targets)`, `await this._item.rollAttack({ fastForward, rollMode })` ;
  - lit `roll.multirollData` (logique actuelle conservée) → construit des `AttackOutcome` dont `character = Character.fromToken(token)` (token résolu depuis `targetID` → id composite, sûr multi-tokens) ;
  - retourne un `AttackResult` (array-like) portant `_item`/`_caster`.
- **Conservés** (rétro-compat, dépréciés jusqu'à migration des pouvoirs) : `isHit`/`isMiss`/`isCritical`/`isFumble`/`isImmune`, `hits`/`misses`, `_toState`, `promptHit`, `rollDamage`/`attackAndDamage` (à retirer une fois les pouvoirs migrés et `Damage4e` en place).
- **Supprimé** à terme : le statique `rollAttack(item, …)` (remplacé par l'instance) une fois les 3 pouvoirs migrés.

### 6. `Helper4e` + macro `ApplyDamage` + `Actor4e`

```js
// Helper4e
static async damage(characterId, parts, multiplier, bypass) {
    return await game.macros.getName('ApplyDamage')
        .execute({ characterId, parts, multiplier, bypass });
}
static async macroApplyDamage(scope) {
    const { characterId, parts, multiplier = 1, bypass = false } = scope;
    const actor = Actor4e.findByCharacterId(characterId);     // résolution par id composite
    if (!actor) return undefined;
    if (bypass) await actor.applyDamage(parts.reduce((s, [v]) => s + v, 0), multiplier);
    else        await actor.calcDamage(parts, multiplier);
    return true;
}

// Actor4e — nouvelle résolution permission-safe par Character.id
static findByCharacterId(id) {
    const [actorId, tokenId] = String(id).split('.');
    if (tokenId) {
        const token = canvas.tokens?.get(tokenId)
            ?? game.scenes.contents.flatMap(s => s.tokens.contents).find(t => t.id === tokenId);
        if (token?.actor) return token.actor;                 // acteur (synthétique si non lié) du token
    }
    return game.actors.get(actorId) ?? null;
}
```
Macro monde `ApplyDamage` (`src/scripts/macros/general/apply_damage.js`) : `return Helper4e.macroApplyDamage(scope);` (+ créer la macro nommée `ApplyDamage` dans le monde).

> **Rebranchement progressif (décision 6).** La voie **dégâts** passe d'emblée par `Character.id` →
> `Actor4e.findByCharacterId`. `ApplyHeal`/`ApplyTempHp`/effets restent par **nom**/`token.id` pour
> l'instant ; on les migrera ensuite vers `findByCharacterId`, une fois la voie dégâts éprouvée sur
> Furious Bolts.

### 7. `module.json` — ordre de chargement

`damage.js` doit être chargé **avant** `attack.js` (l'`AttackResult.run()` appelle `Damage4e`). Ordre cible :
`actor, helper, scene, character, effects, damage, target, user, attack, chat, vfx`.

## Conflits/tensions résolus
- **Instance vs règle « static » de CLAUDE.md** : `Attack4e`/`Damage4e` tournent **côté script de pouvoir**, pas dans une macro ; la règle vise le code appelé *depuis les macros* (`Helper4e.*`, qui restent statiques). L'élévation de permission demeure `Character.damage → Helper4e.damage → macro ApplyDamage`. *(À documenter dans CLAUDE.md.)*
- **Chaînage async** : tranché par `.run()` (un seul awaitable, ordre garanti).
- **Rupture des pouvoirs** : `AttackResult` array-like → `result[0]`/`isHit` survivent ; **`.target` conserve son nom** (renvoie désormais un `Character`), donc `result[0].target` ne casse pas. Migration en phase 4.
- **Override formule sans riders** : `.applyDamage({formula})` route via `Damage4e.fromFormula` (donc `game.helper.applyEffects`), **jamais** un `new Roll()` nu (réf. §8.4).

## Hors scope (v1 — non concerné pour l'instant)

Confirmé non couvert par cette itération (à ne pas confondre avec `applyEffect`) :
mouvement forcé (push/pull/slide, téléport de cible), zones/terrain, *sustain*, dégâts *ongoing*/aftereffect (save-ends). Ces mécaniques restent gérées à la main dans les pouvoirs ou feront l'objet d'une spec dédiée.

## Plan par phases

0. **Fondations** — `Character(actor, token)` + `get id()` (+ `fromToken` stocke le token) ; **`Target.get()` wrappe via `fromToken` et dédoublonne par token** (corrige le bug `fromActor`) ; `addEffect`/`replaceEffect` via `this._token?.id` ; `Target.selectCharacters({count, icon})` (exactement `count`, `[]` à l'annulation). Remplacer les `add(target.actor.id)` par `add(target.id)`.
1. **Moteur Damage4e** — `Damage4e`, `Character.damage`, `Helper4e.damage` + `macroApplyDamage`, `Actor4e.findByCharacterId`, macro `ApplyDamage` ; ordre `module.json`. Valider en jeu (fromItem, fromFormula typé + rider, multiplier, trueDamage).
2. **Objet résultat** — `AttackOutcome` (renommage) + `AttackResult` array-like avec `.hit`/`.miss`/`hasHit()`. Aucun pouvoir modifié.
3. **Attack4e instance + chaînage** — `Attack4e.fromItem`, `rollAttack` instance, `.applyDamage/.applyVFX/.applyEffect` + `.run()`. **Garde-fou anti-overengineering** : exactement ces 3 verbes, une seule file awaitable, pas de DSL générique. `.applyEffect` seulement si un pouvoir en a besoin.
4. **Migration des pouvoirs** — `furious_bolts.js` (preuve, + rebranchement macro id), puis `thunderclap.js`, `feinting_flurry.js`. Retrait des statiques d'`Attack4e` obsolètes.

## Validation (en jeu — pas de tests auto)
- Furious Bolts : primaire (item) appliqué + riders ; secondaire `2d4 lightning` reçoit le rider de Talaerin ; chaîne `.applyDamage().applyVFX().run()` ordonnée.
- Multi-cibles (Thunderclap) : un jet, application par cible avec résistances propres ; demi au raté via `multiplier: 0.5`.
- `trueDamage` ignore les résistances ; soin (`Character.heal`) inchangé.
- `Character.id` : dédoublonnage correct ; `ApplyDamage` résout l'acteur via token (sûr pour tokens non liés / noms dupliqués).

## Points encore ouverts (mineurs)
1. `AttackResult` : étendre `Array` vs wrapper interne (impact sur `.hit` renvoyant le bon type).
2. `applyEffect({...})` : data brute + `durationType`, ou `Effect4e` pré-construit ? (trancher à la phase 3, au 1ᵉʳ besoin réel).
3. Format exact de `Character.id` (séparateur `.`) et collision inter-scènes éventuelle (token id scope scène) — à confirmer si un cas multi-scènes se présente.
4. Clé exacte du roll data pour les mods d'abilité (`@cha` vs `@cha.mod`/`@abilities.cha.mod`) — à confirmer dans dnd4e avant de figer les exemples de formule (le rider §8.4 se déclenche quoi qu'il arrive, mais le terme de base doit résoudre).
