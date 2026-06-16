# Attack4e — Refonte de la détermination du hit

**Date :** 2026-06-17
**Périmètre :** détermination du hit/miss uniquement. La partie dégâts (`Damage4e`, `rollDamage`, `attackAndDamage`) est **en pause** et hors de ce chantier.

## Problème

`Attack4e.rollAttack` réimplémente — mal — la détermination du hit que le système dnd4e fait déjà nativement :

```javascript
// Code actuel (faux)
const defenseValue = this._getTargetDefense(target, item); // lit defences[def].value brut
const hit = attackRoll.total >= defenseValue;              // partagé pour TOUTES les cibles
```

Défauts :
- `_getTargetDefense` lit la valeur de défense **brute** : ignore les bonus de défense, le malus prone-vs-ranged (+2), l'immunité, le crit et le fumble.
- Le multi-cibles produit **un sous-jet par cible** ; le code suppose un unique `attackRoll.total` partagé par toutes les cibles.
- `isCritical` fouille `roll.terms[0].results[0].result`, ce qui n'a pas de sens pour un jet multi-cibles.

## Ce que fait le système dnd4e (EndlesNights/dnd4eBeta, branche `main`)

Le système calcule déjà le hit/miss par cible, correctement, et l'expose :

1. **`item.rollAttack()`** (`module/item/item.js:1574`) ne calcule rien. Il lit la défense ciblée `item.system.attack.def` (`"ac"`/`"fort"`/`"ref"`/`"will"`), la range dans `options.attackedDef`, et délègue à `d20Roll`.
2. **`d20Roll` → `performD20RollAndCreateMessage`** (`module/dice.js:368-401`) itère sur `game.user.targets` et calcule pour chaque cible sa **défense effective** : `target.actor.system.defences[def].value` + bonus de défense + prone-vs-ranged (+2) + immunité.
3. **`MultiAttackRoll.populateMultirollData`** (`module/roll/multi-attack-roll.js:66`) fait la comparaison décisive `roll.total >= targDefVal` et remplit `hitstate` ∈ `"hit"`/`"critical"`/`"miss"`/`"fumble"`/`"immune"`, plus `critstate`. Gardé par le réglage client `automationCombat` (activé par défaut).
4. **Rendu chat** (`templates/chat/roll-template-single.hbs:11`) : la div `hit-prediction` colorée affiche « Hit » / « Miss » / « Critical Hit » par cible — le « hit probable » que voient les joueurs.

Après `await item.rollAttack(...)`, la donnée est lisible via `roll.multirollData` (tableau, une entrée par cible). Chaque entrée :

```javascript
{
  total,            // total du jet pour cette cible
  target,           // nom du token
  targetID,         // id du token
  hitstate,         // "hit"|"critical"|"miss"|"fumble"|"immune"|""
  critstate,        // "critical"|"fumble"|"immune"|""
  def,              // "ac"|"fort"|"ref"|"will"
  immune,           // booléen
  // ... (mod, deftext, tooltip, etc.)
}
```

Caveats :
- Sans cible sélectionnée, `d20Roll` s'effondre en un seul jet sans `multirollData`.
- `hitstate` n'est rempli que si `automationCombat` (client, défaut ON) est activé.

## Décisions de design

| Décision | Choix retenu |
|---|---|
| Périmètre | Hit uniquement ; `rollDamage` / `attackAndDamage` inchangés |
| Source de vérité du hit | `roll.multirollData` (lecture après le jet système) |
| Donnée retournée | **Toute** la donnée : hits ET miss ET crit/fumble/immunité, jamais filtrée |
| Fallback si `multirollData` absent | Avertir (`console.warn`) + `state: AttackState.UNKNOWN`, mais `total`/`defense`/`roll`/`target` remplis |
| Résistances | hors sujet (c'est la partie dégâts, en pause) |

## Conception

### Enum `AttackState`

Plutôt qu'un booléen par état, l'issue de l'attaque est portée par **un seul état** (enum). Le `critstate` du système est redondant : `hitstate` encode déjà `critical`/`fumble`/`immune` (le système met `hitstate = 'critical'` pour un crit, etc.).

```javascript
/**
 * @readonly
 * @enum {string}
 */
const AttackState = Object.freeze({
    HIT: 'hit',           // touche la défense
    CRITICAL: 'critical', // crit — compte aussi comme un hit
    MISS: 'miss',         // rate la défense
    FUMBLE: 'fumble',     // échec critique — compte aussi comme un miss
    IMMUNE: 'immune',     // cible immunisée — compte comme un miss
    UNKNOWN: 'unknown'    // indéterminé (pas de cible, ou automationCombat off)
});
```

Les valeurs correspondent au `hitstate` du système, donc une comparaison de chaîne brute fonctionne aussi.

### `AttackResult` (forme complète)

```javascript
/**
 * @typedef {Object} AttackResult
 * @property {Character} target       La cible
 * @property {AttackState} state      Issue de l'attaque contre cette cible
 * @property {number} total           Total du jet d'attaque pour CETTE cible
 * @property {'ac'|'fort'|'ref'|'will'} defense  Défense visée
 * @property {Roll} roll              Sous-jet de cette cible (roll.rollArray[i]) ou le jet complet en fallback
 */
```

`state` = normalisation de `entry.hitstate` via `_toState` (toute valeur hors enum → `UNKNOWN`).

### `rollAttack(item, targets, options)`

1. Normaliser `targets` en tableau ; si vide → `ui.notifications.warn`, retourner `[]`.
2. `User4e.updateTargets(targetArray)` (inchangé).
3. `const roll = await item.rollAttack({ fastForward, rollMode })` ; si falsy → `console.warn`, retourner `[]`.
4. Si `roll.multirollData` est un tableau non vide :
   - Pour chaque entrée, retrouver la `Character` d'entrée dont un token a `token.id === entry.targetID` (mapping par id de token).
   - Construire l'`AttackResult` complet (hit/miss/crit/fumble/immune/hitstate/total/defense/roll). `roll` = `roll.rollArray[i]` si disponible, sinon `roll`.
   - Si une entrée ne mappe sur aucune `Character` d'entrée, retomber sur l'ordre d'index comme secours.
5. Sinon (pas de `multirollData`) — **fallback indéterminé** :
   - `console.warn` explicite (probable absence de cibles ou `automationCombat` désactivé).
   - Retourner un `AttackResult` par cible d'entrée avec `state: AttackState.UNKNOWN`, `total` = `roll.total` (meilleure approximation disponible), `defense` = `item.system?.attack?.def`, `roll`.
6. Retourner le tableau (hits **et** miss confondus, ordre des cibles).

### Prédicats et helpers de lecture

Les états dérivés deviennent des prédicats au lieu de champs booléens stockés :

```javascript
static isHit(result)     { return result?.state === AttackState.HIT || result?.state === AttackState.CRITICAL; }
static isMiss(result)    { return result?.state === AttackState.MISS || result?.state === AttackState.FUMBLE || result?.state === AttackState.IMMUNE; }
static isCritical(result){ return result?.state === AttackState.CRITICAL; }
static isFumble(result)  { return result?.state === AttackState.FUMBLE; }
static isImmune(result)  { return result?.state === AttackState.IMMUNE; }

static hits(results)     { return results.filter(r => this.isHit(r)); }
static misses(results)   { return results.filter(r => this.isMiss(r)); }
```

La donnée brute reste accessible : le tableau complet (toutes cibles, tous états) est toujours retourné par `rollAttack`. Pour `UNKNOWN`, `isHit` et `isMiss` renvoient tous deux `false`.

### Suppressions / inchangés / migrations

- **Supprimer** `_getTargetDefense` (devenu inutile et faux).
- **Inchangés** (logique de dégâts) : `rollDamage`, `_getDamageType`, `promptHit`.
- **`attackAndDamage`** : seul son test de hit passe de `result.hit` à `this.isHit(result)` ; le reste (jet de dégâts) est inchangé.
- **Consommateurs migrés** : les pouvoirs qui lisaient `result.hit` passent à `Attack4e.isHit(result)` — `thunderclap.js`, `lightning_fury/furious_bolts.js` (primaire + secondaire), `rogue/feinting_flurry.js`.

## Hors périmètre

- Le hook `dnd4e.rollAttack` (qui fournit `targetData.targetHit`/`targetMissed` en tokens) est une alternative non retenue : la lecture de `roll.multirollData` après le jet est plus simple et explicite.
- `Damage4e` et la refonte de `rollDamage`/`attackAndDamage` : chantier séparé, en pause.

## Validation

- Pas de tests automatisés dans ce projet (module Foundry runtime). Validation manuelle en jeu : attaque mono-cible (hit / miss / crit), multi-cibles mixte (certaines touchées, d'autres non), cible immunisée, et cas `automationCombat` désactivé (doit retourner `state: AttackState.UNKNOWN` sans planter).
