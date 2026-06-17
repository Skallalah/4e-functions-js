# Référence — Le système dnd4e par-dessus FoundryVTT : attaque & dégâts

> **But.** Décrire comment le système **dnd4e** (dépôt `EndlesNights/dnd4eBeta`, branche `main`)
> enrobe FoundryVTT pour l'usage d'un pouvoir : création de la carte de chat intégrée, jet
> d'attaque (et détermination du hit par cible), jet de dégâts depuis un item, puis application
> de ces dégâts à une créature. On documente **l'ordre des appels**, les **signatures** et le
> **typage des paramètres**, pour que notre surcouche (`Attack4e`, `Character`, futur `Damage4e`,
> macros) sache exactement à quelle couche du système se brancher au lieu de réimplémenter.
>
> Les numéros de ligne sont valables sur `main` à la date de rédaction (2026-06-17) ; les noms de
> fonctions sont les ancres stables. Tout est sourcé vers GitHub.
>
> Fichiers clés :
> - `module/item/item.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/item/item.js
> - `module/dice.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/dice.js
> - `module/chat.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/chat.js
> - `module/actor/actor.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/actor/actor.js
> - `module/roll/multi-attack-roll.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/roll/multi-attack-roll.js
> - `module/dnd4e.js` — https://github.com/EndlesNights/dnd4eBeta/blob/main/module/dnd4e.js

---

## Vue d'ensemble

```
                 Item4e#roll()                 (item.js:1032)
   pouvoir   ──► construit templateData ──► renderTemplate(item-card.hbs)
   utilisé        └► ChatMessage.create(card + flags dnd4e.itemData/Uuid)
                                  │
                 renderChatMessageHTML hook → Item4e.chatListeners(html)   (dnd4e.js:353)
                                  │  (clic bouton .card-buttons)
                                  ▼
                 Item4e._onChatCardAction(event)              (item.js:3011)
                  data-action="attack"  ──► item.rollAttack({event,variance})   ── voir §2
                  data-action="damage"  ──► item.rollDamage({event,spellLevel,variance}) ── voir §3
                  data-action="healing" ──► item.rollHealing(...)
                                  │
            ┌─────────────────────┴───────────────────────┐
            ▼                                              ▼
   §2 ATTAQUE (hit par cible)                    §3 DÉGÂTS (jet + carte)
   rollAttack → d20Roll →                        rollDamage → damageRoll →
   performD20RollAndCreateMessage →              performDamageRoll... → roll.toMessage()
   MultiAttackRoll.populateMultirollData →                    │
   toMessage (carte "hit prediction")            §4 APPLICATION (tokens sélectionnés)
   + hook dnd4e.rollAttack                        bouton/menu → applyChatCardDamageInner →
                                                  actor.calcDamage → actor.applyDamage → update
```

Deux constats structurants pour la surcouche :
1. **Le système calcule déjà tout** (hit/miss/crit par cible, types de dégâts, résistances). Il ne faut pas recalculer, mais **lire** ce qu'il produit et **réutiliser** ses méthodes (`calcDamage`, `applyDamage`).
2. **L'étape d'application** (`applyChatCardDamageInner` → `calcDamage`/`applyDamage`) agit sur `canvas.tokens.controlled` (tokens *sélectionnés*) et exige la permission de modifier l'acteur. C'est précisément le point que notre module contourne via macro à permissions élevées.

---

## 1. Cycle de vie de la carte intégrée

### 1.1 `Item4e#roll()` — point d'entrée (item.js:1032)

```js
async roll({ configureDialog = true, messageMode = null, createMessage = true, variance = {} } = {})
```

| Param | Type | Rôle |
|---|---|---|
| `configureDialog` | `boolean` | Afficher la boîte de configuration |
| `messageMode` | `string \| null` | Mode du message (roll/gmroll/…) |
| `createMessage` | `boolean` | Si `false`, retourne le `chatData` au lieu de poster |
| `variance` | `{ isCharge?, isOpp? }` | Variante charge / attaque d'opportunité |

**Retour :** `Promise<void>` dans le cas normal (poste la carte) ; `Promise<Object>` (le `chatData`) si `createMessage === false`.

Construit `templateData` (item.js:1056-1073) :

| Champ | Type | Source |
|---|---|---|
| `actor` | `Actor` | `this.actor` |
| `tokenId` | `string \| null` | `token.uuid` |
| `item` | `Item4e` | `this` |
| `system` | `Object` | `await this.getChatData({}, variance)` |
| `labels` | `Object` | `this.labels` |
| `hasAttack` / `hasDamage` / `hasHealing` / `hasEffect` / `hasSave` / `hasAreaTarget` | `boolean` | accessors de l'item |
| `isHealing` / `isPower` / `isRoll` | `boolean` | — |
| `cardData` | `string \| null` | `Helper._preparePowerCardData(...)` |

Puis (item.js:1106-1107) :
```js
const template = `systems/dnd4e/templates/chat/${templateType}-card.hbs`; // item|tool|ritual
let html = await foundry.applications.handlebars.renderTemplate(template, templateData);
```
Pour un pouvoir/arme/équipement → **`systems/dnd4e/templates/chat/item-card.hbs`**.

Crée le message (item.js:1129-1171), en **embarquant l'item dans les flags** pour que les boutons survivent à une modification/suppression ultérieure de l'item :
```js
const chatData = {
  user: game.user.id,
  style: CONST.CHAT_MESSAGE_STYLES.OTHER,
  content: html,
  speaker: { actor: this.actor?.id, token: this.actor?.token, alias: this.actor?.name },
  flags: { core: { canPopout: true } },
};
chatData.flags["dnd4e.itemData"] = templateData.item;
chatData.flags["dnd4e.itemUuid"] = templateData.item.uuid;
chatData.flags["dnd4e.actorUuid"] = templateData.actor.uuid;
if (variance) chatData.flags["dnd4e.variance"] = variance;
// …
ChatMessage.create(chatData);
```
(item.js:1032-1172)

### 1.2 Câblage des boutons : `chatListeners` → `_onChatCardAction`

À chaque rendu de message, le hook `renderChatMessageHTML` appelle `Item4e.chatListeners(html)` (dnd4e.js:353) :
```js
Hooks.on("renderChatMessageHTML", (message, html, data) => {
  Item4e.chatListeners(html);
  chat.chatMessageListener(html);
});
```
`chatListeners` délègue le clic sur `.card-buttons button` à `_onChatCardAction` (item.js:2960) :
```js
static chatListeners(html) {
  html.addEventListener("click", (event) => {
    const el = event.target.closest(".card-buttons button, .effects-tray button");
    if (el) this._onChatCardAction.call(this, event);
  });
}
```
`_onChatCardAction` (item.js:3011) reconstruit l'acteur et l'item depuis le dataset/flags de la carte, puis **dispatch sur `data-action`** (chaîne if/else, pas un switch) :
```js
const actor = this._getChatCardActor(card);                       // via tokenId "Scene.x.Token.y" ou actorId
const storedData = message.getFlag("dnd4e", "itemData");
const item = storedData ? new this(storedData, { parent: actor })
                        : actor.items.get(card.dataset.itemId) || storedData;
// …
if (action === "attack")        await item.rollAttack({ event, variance });
else if (action === "damage")   await item.rollDamage({ event, spellLevel, variance });
else if (action === "healing")  await item.rollHealing({ event, spellLevel });
else if (action === "formula")  await item.rollFormula({ event, spellLevel, variance });
// applyEffect, effect, hitEffect, missEffect, save, toolCheck, ritualCheck, placeTemplate…
```
Récupération de l'acteur — `_getChatCardActor` (item.js:3142) : token synthétique (`card.dataset.tokenId`) sinon `game.actors.get(card.dataset.actorId)`.

| `data-action` | Appelle |
|---|---|
| `attack` | `item.rollAttack({ event, variance })` → **§2** |
| `damage` | `item.rollDamage({ event, spellLevel, variance })` → **§3** |
| `healing` | `item.rollHealing({ event, spellLevel })` |
| `formula` | `item.rollFormula({ event, spellLevel, variance })` |
| `save` / `applyEffect` / `effect` / … | actions secondaires |

> **Pour la surcouche.** On n'a pas besoin de la carte ni des boutons : on appelle directement
> `item.rollAttack(...)` / `item.rollDamage(...)` (mêmes méthodes que le dispatcher), ce qui poste
> la carte native et nous rend le `Roll`. La carte affiche ses boutons « Apply », inutilisables par
> un joueur sur la cible d'un autre — d'où notre application programmatique via macro.

---

## 2. Flux d'attaque (détermination du hit par cible)

### 2.1 `Item4e#rollAttack(options)` (item.js:1574)

Ne calcule **pas** le hit. Il lit la défense visée `item.system.attack.def`
(`"ac" | "fort" | "ref" | "will"`), la range dans `options.attackedDef` **si des cibles sont
sélectionnées**, assemble la config et délègue à `d20Roll` :
```js
if (game.user.targets.size) options.attackedDef = itemData.attack.def;   // item.js:1611
// …
const roll = await d20Roll(rollConfig);   // item.js:1729
return roll;                              // item.js:1741  (MultiAttackRoll si cibles)
```
**Retour :** `Promise<Roll | MultiAttackRoll | null>` (null si pas d'attaque / annulé).

### 2.2 `d20Roll(config)` (dice.js:34)

Config destructurée (types principaux) :
```js
{ parts: string[], partsExpressionReplacements, item: Item4e, weaponUse, data: object,
  event: Event, messageMode, template, title, speaker, flavor,
  fastForward: boolean, onClose, dialogOptions,
  critical = 20, fumble = 1, targetValue, actor: Actor4e, isAttackRoll: boolean, options }
```
Évalue le d20, **crée le message** (via le sous-appel) et **retourne le `Roll`**. Quand des cibles
existent, c'est un `MultiAttackRoll` (un sous-jet par cible). Sans cible, il s'effondre en un seul
`Roll` simple (`roll = roll.rollArray[0]`, dice.js:426-428) — **sans** `multirollData`.

### 2.3 `performD20RollAndCreateMessage` (dice.js:368)

Itère sur `game.user.targets` et calcule, **par cible**, la **défense effective** :
```js
let targDefVal = targets[i].document.actor.system.defences[attackedDef]?.value;
// + bonus de défense (dice.js:372-389)
// + prone-vs-ranged : +2 (dice.js:390-396)
targImmune = targets[i].document.actor.system.defences[attackedDef]?.none;
```
Construit `targetData` :

| Champ | Type | Contenu |
|---|---|---|
| `targNameArray` | `string[]` | noms des tokens |
| `targDefValArray` | `number[]` | **défense effective** par cible |
| `targImmArray` | `boolean[]` | immunité par cible |
| `targets` | `Token[]` | tokens visés |
| `targDefArray` | `string[]` | clé de défense par cible (`ac`/`fort`/…) |

Classe crit/fumble/immune (`critStateArray`, dice.js:412-420) puis :
```js
roll.populateMultirollData(targetData, critStateArray);                       // dice.js:430
Hooks.callAll("dnd4e.rollAttack", data.item, targetData, speaker);            // dice.js:431
// dice.js:433-444 : auto-application des effets "on hit" via targetData.targetHit
```

### 2.4 `MultiAttackRoll#populateMultirollData(targetData, critStateArray)` (multi-attack-roll.js:66)

**C'est ici que naît `hitstate`.** Gardé par le réglage client `automationCombat` (défaut ON) :
```js
if (game.settings.get("dnd4e","automationCombat") && (targDefVal !== undefined)) {
  if (critState === "immune")        { hitState = "immune";   targetMissed.push(...) }
  else if (critState === "critical") { hitState = "critical"; targetHit.push(...) }
  else if (critState === "fumble")   { hitState = "fumble";   targetMissed.push(...) }
  else if (r._total >= targDefVal)   { hitState = "hit";      targetHit.push(...) }
  else                               { hitState = "miss";     targetMissed.push(...) }
}
```
Décision de hit normale = **`r._total >= targDefVal`**. Chaque entrée poussée dans `multirollData`
(multi-attack-roll.js:126-142) :

| Champ | Type | Contenu |
|---|---|---|
| `total` | `number` | total du jet **pour cette cible** |
| `target` | `string` | nom du token |
| `targetID` | `string` | **id du token** |
| `hitstate` | `'hit'\|'critical'\|'miss'\|'fumble'\|'immune'\|''` | issue (vide si automationCombat off) |
| `critstate` | `'critical'\|'fumble'\|'immune'\|''` | crit/fumble |
| `hittext` | `string` | libellé localisé (« Hit »/« Miss »…) |
| `def` | `'ac'\|'fort'\|'ref'\|'will'` | défense visée |
| `mod`, `deftext`, `modtext`, `immune`, `formula`, `expression`, `parts`, `tooltip` | — | affichage |

Accessible après le jet via le getter `roll.multirollData` (multi-attack-roll.js:21).

### 2.5 `MultiAttackRoll#toMessage` (multi-attack-roll.js:269) + carte

Rattache une entrée à chaque sous-jet, puis crée le message :
```js
for (const r of this.rollArray) { r.options.multirollData = this.multirollData[i]; i++; }
messageData.rolls = this.rollArray;
```
Chaque sous-jet est rendu par `templates/chat/roll-template-single.hbs`, qui expose la donnée
comme `attackRoll = this.options?.multirollData` (roll-with-expression.js:201) et affiche la div
**`hit-prediction`** colorée par `hitstate`/`critstate` (roll-template-single.hbs:11) — le « hit
probable » par cible.

### 2.6 Hook `dnd4e.rollAttack` (dice.js:431)

`Hooks.callAll("dnd4e.rollAttack", item, targetData, speaker)` où `targetData.targetHit` /
`targetData.targetMissed` sont des tableaux de **tokens** déjà classés (utilisés par le système
pour auto-appliquer les effets « on hit »). Alternative à la lecture de `multirollData`.

### 2.7 Chaîne ordonnée (attaque)

```
Item#rollAttack (item.js:1574)
  └─ lit item.system.attack.def → options.attackedDef (si cibles)
  └─ d20Roll(config) (dice.js:34)
       └─ performD20RollAndCreateMessage (dice.js:368)
            ├─ par cible : defences[def].value + bonus + prone(+2) ; immune → targetData
            ├─ MultiAttackRoll.populateMultirollData (multi-attack-roll.js:66)
            │     └─ hitstate = (r._total >= targDefVal) ? hit : miss  [si automationCombat]
            ├─ toMessage (multi-attack-roll.js:269) → roll-template-single.hbs (hit-prediction)
            └─ Hooks.callAll("dnd4e.rollAttack", item, targetData, speaker) (dice.js:431)
  ◄─ retourne MultiAttackRoll (.multirollData : 1 entrée/cible)  |  ou Roll simple sans multirollData si 0 cible
```

> **Pour la surcouche (déjà implémenté dans `Attack4e`).** Après `await item.rollAttack(...)`, lire
> `roll.multirollData[i].hitstate` (mappé sur l'enum `AttackState`), au lieu de comparer un total à
> une défense brute. Gérer : 0 cible / `automationCombat` off → pas de `multirollData` → état
> `UNKNOWN`. Mapper `entry.targetID` (id de token) vers nos `Character`.

---

## 3. Flux de dégâts depuis un item

### 3.1 `Item4e#rollDamage(options)` (item.js:2060)

```js
async rollDamage({ event, spellLevel = null, fastForward = undefined, variance = {} } = {})
```

| Param | Type | Rôle |
|---|---|---|
| `event` | `Event \| undefined` | détection fast-forward + placement dialogue |
| `spellLevel` | `number \| null` | surcharge `rollData.item.level` si truthy |
| `fastForward` | `boolean \| undefined` | saute le dialogue, transmis à `damageRoll` |
| `variance` | `{ isCharge?, isOpp? }` | variantes charge / opportunité |

**Retour :** `Promise<Roll>` (depuis `damageRoll`), ou `null` (arme requise manquante, ou
`!this.hasDamage`). Pose le flag de carte avant de jeter (item.js:2076) :
```js
const messageData = { "flags.dnd4e.roll": { type: "damage", itemId: this.id } };
```

**Construction des parts** — chaque part est émise comme `(formule)[type]` via
`returnDamageRollAndOptionalType` (item.js:2087) :
```js
const returnDamageRollAndOptionalType = (damageRoll, damageType) => {
  if (damageType && (damageType !== _loc(game.dnd4e.config.damageTypes.damage)) && (damageType !== _loc("DND4E.None")))
    return `(${damageRoll})[${damageType}]`;
  return damageRoll;
};
```
Les trois tableaux (item.js:2103-2105) — `d.type` est un **Set** joint par virgule (`"fire,radiant"`) :
```js
const parts     = itemData.damage.parts.map(d => secondaryPartsHelper(d.formula, [...d.type].join(",")));
const partsMiss = itemData.damage.parts.map(d => secondaryPartsHelper(d.formula, [...d.type].join(",")));
const partsCrit = itemData.damageCrit.parts.map(d => secondaryPartsHelper(d.formula, [...d.type].join(",")));
```
Les dégâts **primaires** (`itemData.hit.formula` / `miss.formula` / `hit.critFormula`) sont
`unshift`és en tête avec le type primaire (item.js:2313-2320), le type primaire venant de
**`getDamageType()`** (item.js:978) — une map `{ fire:true, physical:true, … }` (un override
d'arme via `damageTypeOverride` la remplace). S'y ajoutent : dégâts d'arme secondaires
(`@wepDamage`/`@impDamage`), versatile/high-crit, bonus d'acteur `bonuses.<actionType>.damage`,
parts d'effets actifs (`Helper.applyEffects`), munitions. Les diviseurs (demi-dégâts au raté,
affaibli) vont dans `options.divisors` (pas dans la formule).

### 3.2 `damageRoll(config)` (dice.js:499)

```js
export async function damageRoll({ parts, partsCrit, partsMiss,
  partsExpressionReplacement = [], partsCritExpressionReplacement = [], partsMissExpressionReplacement = [],
  actor, data, event = {}, messageMode = null, template, title, speaker, flavor,
  allowCritical = true, critical = false, fastForward = null, onClose, dialogOptions, healingRoll, options })
```
- `parts`/`partsCrit`/`partsMiss` : `string[]` (chaque entrée `(formule)[type]` ou formule nue).
- **Retour :** `Promise<Roll>`. **Crée le message lui-même**, mais *indirectement* dans le callback
  `performDamageRollAndCreateChatMessage` (dice.js:573), pas dans son corps :
  ```js
  roll.toMessage({ speaker, flavor }, { messageMode });   // dice.js:628
  return roll;
  ```
  Le callback choisit le tableau de parts selon `hitType` (`normal`/`crit`/`miss`/`immune`/`heal`)
  et construit le jet via `RollWithOriginalExpression.createRoll(...)`.

### 3.3 Le type atterrit sur `roll.terms[].flavor`

La syntaxe `(2d6+3)[fire]` est la **syntaxe de flavor native** de Foundry : à l'évaluation, `[fire]`
devient le `.flavor` du terme englobant. Donc **chaque terme numérique porte son type de dégât dans
`term.flavor`**, et les termes non typés ont `flavor == null`. La carte (`roll.toMessage`) affiche
chaque part annotée de son `[flavor]`. Le message porte aussi `flags.dnd4e.roll = {type:"damage",
itemId}` et `roll.options.divisors` + `roll.options.hitType` (relus à l'application).

---

## 4. Application des dégâts à une créature

> Agit sur **`canvas.tokens.controlled`** (tokens sélectionnés), **pas** sur les cibles du jet.

### 4.1 Déclencheurs

**Boutons de carte** — `clickRollMessageDamageButtons` (chat.js:292) :
```js
const divisor = ("divisors" in roll.options) ? roll.options.divisors[roll.options.hitType].value : 1;
if (action === "Damage")        applyChatCardDamageInner(roll, 1 / divisor, false);
else if (action === "HalfDamage") applyChatCardDamageInner(roll, 0.5, false);
else if (action === "Heal")       applyChatCardDamageInner(roll, -1, false);
else if (action === "TempHeal")   applyChatCardTempHpInner(roll);
```

**Menu contextuel** (chat.js:156-191) → `applyChatCardDamage(li, multiplier, trueDamage)` (chat.js:394) :

| Entrée | Multiplicateur |
|---|---|
| Damage | `1` (plein) |
| Half Damage | `0.5` |
| Double Damage | `2` |
| Healing | `-1` |
| True Damage | `1, trueDamage=true` (ignore résistances) |
| Temp HP | chemin `applyChatCardTempHp*` (parallèle) |

### 4.2 `applyChatCardDamageInner(roll, multiplier, trueDamage = false)` (chat.js:400)

1. **Comptage de surges** si `multiplier < 0` : scanne `roll.terms[i].flavor` (`surgeValue`→`surgeValueAmount++`, `surgeCost`→`surgeAmount++`, `surge`→les deux).
2. **Soin OU vrais dégâts** (`multiplier < 0 || trueDamage`) → **bypass résistances** :
   ```js
   t.actor.applyDamage(roll.total, multiplier, { surgeAmount, surgeValueAmount });
   ```
3. **Dégâts normaux** → reconstruit `damageDealt: [number, string][]` en lisant `roll.terms[i].flavor` :
   ```js
   damageDealt.push([e.total, e.flavor]); rollTotalRemain -= e.total;
   ```
4. **Reste non typé** → `[reste, "physical"]` s'il n'y a pas de chunk typé, sinon réparti
   équitablement sur les chunks existants.
5. **Application** sur chaque token sélectionné :
   ```js
   t.actor.calcDamage(damageDealt, multiplier);
   ```

### 4.3 `Actor4e#calcDamage` → résistances (actor.js:2436)

```js
async calcDamage(damage, multiplier = 1, surges = 0) {
  const totalDamage = await this.calcDamageInner(damage, multiplier, surges);
  this.applyDamage(totalDamage, multiplier, surges);
}
```
- `damage` : `Array<[number, string]>` — `[valeur, type]` ; le type peut être joint par virgule,
  contenir `"ongoing"`, ou valoir `"physical"`.
- `calcDamageInner` (actor.js:2442) dispatch selon le réglage `damageCalcRules` →
  `calcDamageErrata` (2490) ou `calcDamagePHB` (2544). Renvoie `Promise<number>` (total résisté),
  **sans appliquer**.
- **`calcTotalInner(damage:number, typesSet:Set<string>, isOngoing=false)`** (actor.js:2452) — cœur
  du calcul :
  ```js
  const currentRes = Helper.sumExtremes([resAll, actorRes[dt]?.value || 0]);
  // … lowestRes = min(currentRes sur les types)
  if (!isImmuneAll) totalDamage += Math.max(0, damage - lowestRes);
  ```
  - `actor.system.resistances[type]` = `{ value, res, vuln, immune, label, … }` (préparé
    actor.js:1131). `.value` = ajustement net : **positif = résistance** (réduit), **négatif =
    vulnérabilité** (augmente). `resistances["damage"]` = « résiste à tout », `resistances["ongoing"]`
    s'ajoute pour le continu.
  - Multi-type → la créature bénéficie de la **meilleure** résistance applicable (`lowestRes`).
  - Dégâts par chunk = `Math.max(0, damage - lowestRes)` (jamais < 0). **Immunité** → chunk à 0.
  - `insubstantial` → moitié du total (dans les appelants).
- Réglages : `damageCalcRules` (`"errata"` | PHB) et `compoundDamageTypes` (`"allInclusive"` |
  disjoint) — changent le regroupement des types avant résistance.

### 4.4 `Actor4e#applyDamage(amount = 0, multiplier = 1, surges = {})` (actor.js:2617)

| Param | Type | Notes |
|---|---|---|
| `amount` | `number` | total brut (`roll.total` côté soin/true-damage, ou total résisté côté `calcDamage`). `parseInt × multiplier`, plancher. Positif = perte de PV. |
| `multiplier` | `number` | `1` plein · `0.5` moitié · `2` double · `-1` soin. Le signe pilote la branche ; `<0` déclenche la dépense de surges. |
| `surges` | `{ surgeAmount?, surgeValueAmount? }` | `surgeAmount` = surges dépensés ; `surgeValueAmount` ajoute `surgeValue × n × multiplier`. |

Règles / effets de bord :
- **Les PV temporaires absorbent d'abord** (`dt = min(temphp, amount)`), le reste touche les PV.
- Clamp PV : `Math.clamp(..., -bloodied, hp.max)` — plancher = **valeur bloodied négative** (seuil de mort).
- `healFromZero` : soigner sous 0 PV repart de 0.
- Gardes de surges : abandon (notification) si pas assez de surges, ou si déjà au max de PV.
- Écriture via le hook **`modifyTokenAttribute`** (annulable) puis `this.update(updates)`.
- **Retour :** `Promise<Actor>` (ou `this` si le hook annule ; `undefined` sur garde-surges).

### 4.5 `Actor4e#applyTempHpChange(amount = 0)` (actor.js:2681)

PV temporaires **non cumulatifs** (ne montent que si `amount > temphp` actuel) ; `amount < 0`
soustrait, plancher 0. Atteint par le chemin « Temp HP » (parallèle), jamais par
`applyChatCardDamageInner`. *(Bug latent actor.js:2706 : clé `temphp.value.value` doublée.)*

### 4.6 Chaîne ordonnée (dégâts → application)

```
Item#rollDamage (item.js:2060)
  └─ parts via returnDamageRollAndOptionalType → "(formule)[type]"  (item.js:2087,2103,2313)
  └─ damageRoll(config) (dice.js:499)
       └─ performDamageRollAndCreateChatMessage (dice.js:573)
            └─ RollWithOriginalExpression.createRoll(...)  → [type] parsé en term.flavor
            └─ roll.toMessage(...)  (dice.js:628)   ← CARTE créée, flags.dnd4e.roll={type:"damage",itemId}
  ── l'utilisateur sélectionne des tokens, clique « Apply » / menu contextuel ──
clickRollMessageDamageButtons (chat.js:292)  |  applyChatCardDamage (chat.js:394)
  └─ applyChatCardDamageInner(roll, multiplier, trueDamage) (chat.js:400)
       ├─ soin(mult<0)/trueDamage → actor.applyDamage(roll.total, multiplier, {surge…})   (bypass résistances)
       └─ normal → lit roll.terms[].flavor → damageDealt:[valeur,type][] ; reste → "physical"
            └─ actor.calcDamage(damageDealt, multiplier)  (actor.js:2436)
                 └─ calcDamageInner → calcDamagePHB/Errata → calcTotalInner  (résistances, actor.js:2452)
                 └─ applyDamage(totalRésisté, multiplier, surges)  (actor.js:2617)
                      └─ absorption PV temp → clamp [-bloodied, max] → dépense surges
                         → Hooks.call("modifyTokenAttribute") → this.update(updates)
```

---

## 5. Modèle de données pertinent

**Item** (`item.system`) :
- `attack.def` : `'ac' | 'fort' | 'ref' | 'will'` — défense visée.
- `hit.formula` / `hit.critFormula` / `miss.formula` : `string` — dégâts primaires (type via `damageType`).
- `damage.parts` / `damageCrit.parts` : `Array<{ formula: string, type: Set<string> }>` — dégâts additionnels typés.
- `damageType` : `Record<string, boolean>` — map des types primaires (lue par `getDamageType()`).

**Acteur** (`actor.system`) :
- `attributes.hp` : `{ value, max }` ; `attributes.temphp.value` : `number`.
- `details.surges.value` / `details.surgeValue` / `details.bloodied` : `number`.
- `resistances[type]` : `{ value, res, vuln, immune, label }` (+ clés spéciales `damage`, `ongoing`).
- `defences[def]` : `{ value, none }` (`none` = immunité à être visé sur cette défense).

---

## 6. Réglages clients impactants

| Réglage (`game.settings.get("dnd4e", …)`) | Défaut | Effet |
|---|---|---|
| `automationCombat` | `true` | Si OFF → `hitstate` reste vide (pas de hit/miss auto). `critstate` reste calculé. |
| `damageCalcRules` | PHB | `"errata"` vs PHB — combinaison des types multi avant résistance. |
| `compoundDamageTypes` | — | `"allInclusive"` vs disjoint — regroupement des types. |

---

## 7. Implications pour notre surcouche

- **Attaque (`Attack4e`, déjà fait).** Appeler `item.rollAttack(...)` puis **lire**
  `roll.multirollData[i].hitstate` (normalisé en `AttackState`). Mapper `targetID` (id token) vers
  nos `Character`. Fallback `UNKNOWN` si pas de `multirollData`. Ne jamais recomparer un total à une
  défense brute.

- **Dégâts (futur `Damage4e`).** Réutiliser, ne pas réinventer :
  1. **Source du jet** = `item.rollDamage()` (poste la carte native + crée le `Roll` typé) ; ou un
     simple `Roll` qu'on construit et auquel on attache un type.
  2. **Reconstruire les chunks** `[[valeur, type]]` en lisant `roll.terms[i].flavor` (exactement
     comme `applyChatCardDamageInner`), reste non typé → `"physical"`.
  3. **Appliquer** via macro à permissions élevées :
     - normal → `actor.calcDamage(parts, multiplier)` (résistances/vuln/immunité),
     - bypass / vrais dégâts → `actor.applyDamage(total, multiplier)`.
  4. Multiplicateurs utiles : `0.5` (demi au raté), `2` (double), `-1` (soin — déjà le chemin de
     `Character.heal`). `Character.damage(dmg)` devient le miroir de `Character.heal(...)`.

> Le point de jonction propre est **`calcDamage` / `applyDamage`** côté acteur (couche métier dnd4e),
> appelés depuis notre macro — exactement la frontière que franchissent déjà les boutons natifs, mais
> avec l'élévation de permissions qui nous manque côté joueur.
