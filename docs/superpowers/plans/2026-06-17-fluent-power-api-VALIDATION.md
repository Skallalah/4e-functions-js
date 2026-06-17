# Fluent Power API — Validation en jeu (à faire à la fin, en une passe)

> Toutes les validations Foundry du plan `2026-06-17-fluent-power-api.md` regroupées ici.
> Le code + `node --check` + commits sont faits côté repo ; **cette checklist est ta part** (devant le client Foundry).
> Coche au fur et à mesure. Si un check échoue, note-le — on corrige en *fix-forward*.

---

## 0. Prérequis de déploiement (à faire UNE fois, avant tout le reste)

- [ ] **Déployer les scripts du module** : s'assurer que le dossier `src/` du repo est bien celui chargé par Foundry (module `4e-functions-js`) — copie/symlink à jour. Le `module.json` a changé (ajout de `scripts/damage.js` avant `scripts/attack.js`) et un nouveau fichier `scripts/damage.js` a été ajouté.
- [ ] **Recharger Foundry** (F5 / "Return to Setup" → relancer le monde) pour que `damage.js` et l'ordre de chargement prennent effet.
- [ ] Ouvrir la **console** (F12) — c'est là que se collent les snippets ci-dessous.

> Note : les classes du module (`Character`, `Target`, `Actor4e`, `Helper4e`, `Damage4e`, `Attack4e`…) sont chargées par le module → **rien à recopier à la main** pour elles. Seuls **les macros monde** et **les scripts de pouvoir** (stockés dans le monde, pas dans le module) sont à mettre à jour manuellement — voir §1 et §2.

---

## 1. Macros monde à créer / mettre à jour

- [ ] **Créer la macro `ApplyDamage`** (type *script*), corps exact :
  ```js
  return Helper4e.macroApplyDamage(scope);
  ```
  (Miroir de la macro `ApplyHeal` existante. Référence : `src/scripts/macros/general/apply_damage.js`.)

> Les autres macros (`ApplyHeal`, `ApplyTempHp`, `ApplyEffectToToken`, `RemoveEffectByName`, `GetActorData`) sont **inchangées** dans cette itération.

---

## 2. Scripts de pouvoir à recopier dans Foundry (items du monde)

Ces scripts vivent dans le monde (attachés aux items de pouvoir), pas dans le module — il faut **recopier le contenu du fichier repo dans le script de l'item** correspondant.

- [ ] **Furious Bolts** ← `src/scripts/powers/lightning_fury/furious_bolts.js`
- [ ] **Thunderclap** ← `src/scripts/powers/thunderclap.js`
- [ ] **Feinting Flurry** ← `src/scripts/powers/rogue/feinting_flurry.js`

> Les autres pouvoirs (lay_on_hands, ardent_strike, fey_step, healing_spirit, etc.) ne sont **pas** modifiés par cette itération → rien à recopier pour eux.

---

## 3. Checklist de validation — Phase 0 (Character + Target)

### 3.1 — Character.id (T1)
Token sélectionné sur la scène :
```js
const a = Character.fromActor(canvas.tokens.controlled[0].actor);
const t = Character.fromToken(canvas.tokens.controlled[0]);
console.log('fromActor id:', a.id);   // attendu : id d'acteur nu (sans point)
console.log('fromToken id:', t.id);   // attendu : "<actorId>.<tokenId>"
```
- [ ] `fromActor id` sans `.` ; `fromToken id` = deux ids joints par `.`

### 3.2 — Target.get() token-backed + dédoublonnage par token (T2)
Placer **deux tokens ennemis identiques** (même prototype) dans un rayon autour d'un caster, puis :
```js
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
const found = Target.fromCharacter(caster).radius(5).type('enemies').get();
console.log('count:', found.length, 'ids:', found.map(c => c.id));
```
- [ ] `count` = nombre de **tokens** en portée (2 monstres identiques → 2, pas 1) ; tous les `id` contiennent `.` et sont distincts

### 3.3 — selectCharacters (T3)
```js
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
const one = await Target.fromCharacter(caster).range(20).type('enemies').selectCharacters({ count: 1 });
console.log('picked:', one.length, one.map(c => c.name));
// Relancer et appuyer Échap tout de suite :
const cancelled = await Target.fromCharacter(caster).range(20).selectCharacters({ count: 1 });
console.log('cancelled is array:', Array.isArray(cancelled), 'length:', cancelled.length);
```
- [ ] 1er appel : tableau à 1 élément après une cible valide
- [ ] Annulation : renvoie `[]` (tableau vide), **aucune exception**

---

## 4. Checklist de validation — Phase 1 (moteur dégâts + permission)

### 4.1 — Actor4e.findByCharacterId (T4)
Token sélectionné :
```js
const tok = canvas.tokens.controlled[0];
const id = `${tok.actor.id}.${tok.id}`;
console.log('resolved:', Actor4e.findByCharacterId(id)?.name);        // attendu : nom de l'acteur du token
console.log('bare actor:', Actor4e.findByCharacterId(tok.actor.id)?.name); // attendu : même nom
console.log('bad id:', Actor4e.findByCharacterId('nope'));            // attendu : null
```
- [ ] Les deux formes résolvent le bon acteur ; id bidon → `null`

### 4.2 — Helper4e.damage + macro ApplyDamage (T5)
Token endommageable sélectionné, noter ses PV :
```js
const tok = canvas.tokens.controlled[0];
const id = `${tok.actor.id}.${tok.id}`;
const before = tok.actor.system.attributes.hp.value;
await Helper4e.damage(id, [[6, 'fire']], 1, false);   // 6 feu, résistances appliquées
console.log('hp', before, '->', tok.actor.system.attributes.hp.value);
```
- [ ] PV baissent de 6 (ou moins si résistance au feu)
- [ ] Rejouer avec `bypass = true` (4e arg) → résistances ignorées

### 4.3 — Damage4e voie item (T6)
Caster sélectionné, une cible ciblée, item avec dégâts configurés :
```js
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasDamage);
const dmg = await Damage4e.fromItem(item).roll();
console.log('total', dmg.total, 'parts', JSON.stringify(dmg.parts));
const same = await dmg.roll();
console.log('idempotent:', same.total === dmg.total);
console.log('half clone garde total:', dmg.multiplier(0.5).total === dmg.total);
```
- [ ] `parts` = tableau non vide de `[nombre, "type"]` dont la somme = `total`
- [ ] 2e `.roll()` = même total, **pas de nouvelle carte de chat**
- [ ] clone `multiplier(0.5)` garde le même `.total` (le multiplicateur s'applique à l'application, pas au jet stocké)

### 4.4 — Damage4e voie formule + rider (T6) ⚠️ POINT LE PLUS RISQUÉ
Caster avec un rider de type (ex. Talaerin +4+@cha lightning) :
```js
const caster = Character.fromActor(canvas.tokens.controlled[0].actor);
const dmg = await Damage4e.fromFormula(`2d4 + ${caster.getAbilityMod('cha')}`, 'lightning').by(caster).roll();
console.log('total', dmg.total, 'parts', JSON.stringify(dmg.parts));
```
- [ ] Carte `lightning` postée ; `total` **inclut le bonus du rider** (comparer à un caster sans le rider)
- [ ] `parts` porte le type `lightning`
- [ ] ⚠️ **Si le rider ne s'applique pas ou le type est faux → STOP, signale-le** (les tâches suivantes en dépendent)

### 4.5 — Character.damage (T7)
Token ennemi sélectionné, noter ses PV :
```js
const item = game.actors.getName('<nom du caster>').items.find(i => i.hasDamage);
const target = Character.fromToken(canvas.tokens.controlled[0]);
const dmg = await Damage4e.fromItem(item).roll();
const before = target.actor.system.attributes.hp.value;
await target.damage(dmg);
console.log('hp', before, '->', target.actor.system.attributes.hp.value);
await target.damage(dmg.multiplier(0.5));   // moitié, même jet
```
- [ ] 1re application : PV baissent du total jeté (résistances appliquées)
- [ ] `multiplier(0.5)` : retire la moitié du **même** jet

---

## 5. Checklist de validation — Phases 2-3 (objet résultat + chaînage)

### 5.1 — AttackResult array-like (T8)
Cibler deux ennemis (hit + miss si possible), item d'attaque :
```js
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasAttack);
const targets = Array.from(game.user.targets).map(t => Character.fromToken(t));
const result = await Attack4e.rollAttack(item, targets, { fastForward: true });
console.log('is array:', Array.isArray(result), 'length:', result.length);
console.log('hit:', result.hit.length, 'miss:', result.miss.length);
console.log('hasHit:', result.hasHit(), 'legacy isHit[0]:', Attack4e.isHit(result[0]));
console.log('target est Character:', result[0].target instanceof Character);
```
- [ ] `result` array-like ; `hit.length + miss.length === result.length`
- [ ] `result[0].target` est un `Character` ; `Attack4e.isHit(result[0])` marche encore (rétro-compat)

### 5.2 — Chaîne complète run() (T9)
Cibler un/des ennemis, item attaque+dégâts :
```js
const item = canvas.tokens.controlled[0].actor.items.find(i => i.hasAttack && i.hasDamage);
const targets = Array.from(game.user.targets).map(t => Character.fromToken(t));
const attack = Attack4e.fromItem(item);
const result = await attack.rollAttack(targets, { fastForward: true });
await result.hit.applyDamage({ fastForward: true }).applyVFX({ type: 'LIGHTNING' }).run();
console.log('errors:', result.hit.errors);
```
- [ ] Les hits prennent des dégâts (PV baissent) + VFX d'impact ; `errors` vide
- [ ] Garde double-run : `await result.hit.run()` une 2e fois → warning "called twice", rien de plus appliqué
- [ ] Instance fraîche : `result.hit !== result.hit` (deux accès = deux instances)

### 5.3 — Jet partagé, demi au raté (T9)
```js
const dmg = await Damage4e.fromItem(item).roll();   // un seul jet
await result.hit.applyDamage({ damage: dmg }).run();
await result.miss.applyDamage({ damage: dmg, multiplier: 0.5 }).run();
```
- [ ] Les cibles ratées prennent exactement la **moitié du même total** que les touchées (pas de 2e carte de dégâts)

---

## 6. Checklist de validation — Phase 4 (pouvoirs migrés)

### 6.1 — Furious Bolts (T10)
Lancer Furious Bolts depuis la fiche, contre un ennemi avec au moins un autre ennemi à ≤10 cases :
- [ ] Attaque primaire jette et (au hit) applique 2d8+Cha lightning + VFX impact + PV de la cible baissent
- [ ] La chaîne demande une cible secondaire, beam vers elle, applique `2d4+Cha` lightning (avec rider Talaerin si présent), s'arrête au raté
- [ ] En fin : le caster gagne l'effet bonus `+N` à l'attaque, et un message de résumé est posté

### 6.2 — Thunderclap (T11)
Lancer Thunderclap contre plusieurs cibles :
- [ ] Hits : dégâts pleins + effet appliqué ; ratés : moitié du **même** jet
- [ ] Aucune erreur console

### 6.3 — Feinting Flurry (T11)
Lancer Feinting Flurry :
- [ ] Attaque(s) résolues, dégâts appliqués (dégâts d'arme via l'item)
- [ ] Aucune erreur console référant des méthodes supprimées (`rollDamage`/`attackAndDamage`/`_getDamageType`)

---

## 7. En cas d'échec
Note la phase + le snippet + le résultat observé vs attendu. On corrige en fix-forward (nouveau commit), pas de rollback.
