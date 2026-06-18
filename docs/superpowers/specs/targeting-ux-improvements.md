# Spec de recherche — Amélioration du look & feel du targeting

> **Statut** : recherche / design. Pas d'implémentation décidée.
> **Date** : 2026-06-18
> **Périmètre** : UX de sélection de cibles (`src/scripts/target.js`), sans changer la signature publique de `Target`.

## 1. Objectif

Améliorer l'expérience de ciblage multi-cibles pour la rapprocher de jeux comme Solasta :

1. **Sélection multiple avec marqueur** — quand le joueur choisit une cible, un symbole se pose dessus.
2. **Désélection** — re-cliquer sur une cible déjà marquée la retire.
3. **Compteur de progression** — affichage `X / N` (ex. 2/3 cibles choisies).
4. **Validation** — une fois le compte atteint (ou validé manuellement), on passe à la suite.
5. **Visualisation de la portée** — afficher autour du lanceur la zone où l'on peut cibler (ex. range 10 → carré de 10 cases de rayon centré sur le lanceur).

## 2. État de l'existant

- `Target.selectCharacters()` (`src/scripts/target.js:131`) **boucle** sur `selectTarget()`, qui appelle `Portal.pick()` **une fois par cible**.
- `Portal.pick()` est un crosshair *one-shot* : il renvoie une coordonnée puis disparaît.
- Conséquence : aujourd'hui, **ni marqueur persistant, ni compteur, ni désélection**. Portal n'est pas conçu pour de la sélection multiple avec état.

## 3. Principe directeur

**Découpler trois préoccupations** :

| Préoccupation | Responsable |
|---|---|
| **État de sélection** (quelles cibles, toggle on/off) | Ciblage natif Foundry (`game.user.targets`) |
| **Présentation** (marqueur posé + compteur X/N) | Marqueur JB2A via Sequencer/`VFX4e` + panneau UI |
| **Validation** (range, type allié/ennemi, nombre atteint) | Logique `Target` existante (`Scene4e.isWithin`, filtres de type) |

## 4. Architecture retenue — Option C (hybride)

**Ciblage natif comme moteur d'état + marqueur thématique greffé par-dessus.**

### Moteur d'état : ciblage natif Foundry
- `token.setTarget(true, { releaseOthers: false })` pose/retire la **réticule native** ; re-cliquer la retire → comportement toggle **gratuit**.
- `game.user.targets` est un `Set` reflétant l'état en temps réel.
- `Hooks.on("targetToken", (user, token, targeted) => …)` se déclenche à chaque (dé)ciblage → point d'accroche pour mettre à jour marqueur + compteur + validation live.
- Avantages : toggle / réticule / désélection intégrés, robuste multi-joueurs, peu de code custom.

### Validation live
- Dans le hook `targetToken`, à chaque ciblage : vérifier range (`Scene4e.isWithin(origin, token, range)`) et type (allié/ennemi via `_disposition` + `_type`).
- Si invalide → dé-cibler immédiatement (`setTarget(false)`) + `ui.notifications.warn`.

### Présentation
- **Marqueur** : voir §5. Posé sur ciblage, retiré sur déciblage.
- **Compteur + bouton Valider** : panneau flottant ou Dialog (à trancher, voir §7). Bouton désactivé tant que le compte requis n'est pas atteint.
- À la validation : lire `game.user.targets`, filtrer/convertir en `Character[]`, retourner.

### Cycle de vie
- Début `selectCharacters()` : enregistrer le hook, peindre la zone de portée (§6), afficher le panneau.
- Fin (validation ou annulation) : désenregistrer le hook, effacer la zone, retirer les marqueurs, fermer le panneau.

### Contrat API inchangé
La signature publique ne bouge pas — on n'améliore que l'implémentation interne :

```js
Target.fromCharacter(caster)
    .range(10)
    .radius(2)
    .type('enemies')
    .selectCharacters({ count: 3 });
```

## 5. Marqueur de cible (décision : coins natifs + asset JB2A)

- **Décision** : on garde **la réticule native (les 4 coins) ET** un asset JB2A par-dessus. La redondance est acceptée (pas de masquage de la réticule native).
- **Asset unique et commun** — pas d'icône par type de pouvoir, pas de maintenance par école.
- **Anneau/rune rotatif** : prendre un asset neutre de type cercle runique (ex. `jb2a.magic_signs.rune.*` ou `jb2a.extras.tmfx.runes.circle.*`, à choisir dans le **Sequencer Database Viewer**) et le faire tourner :

```js
new Sequence()
    .effect()
        .file(MARKER_ASSET)
        .atLocation(token)
        .persist()
        .name(`target-marker-${token.id}`)
        .loopProperty("sprite", "rotation", { from: 0, to: 360, duration: 8000 })
    .play();
```

- **Retrait** : `Sequencer.EffectManager.endEffects({ name: \`target-marker-${token.id}\` })`.
- **Couleur** : optionnelle (`.tint()` / filtre) — non requise par défaut ; possibilité de thématiser plus tard via les power sources de `VFX4e`.
- **Intégration** : nouvelles méthodes `VFX4e.targetMarker(token)` / `VFX4e.clearTargetMarker(token)`.

## 6. Visualisation des zones

Deux besoins **distincts**, deux outils différents — choisis selon leur portée de visibilité (local vs partagé).

| Quoi | Visibilité | Outil |
|---|---|---|
| **Zone de portée** (autour du lanceur, « où je peux cliquer ») | aide perso au lanceur → **local** | GridHighlight |
| **Aire d'effet** (Burst / Area Burst / Blast, « qui est touché ») | arbitrage → **vu par tous** | MeasuredTemplate (carrée) |

### 6.1 Zone de portée — GridHighlight (local)

Rendu **local au client**, parfait pour une aide visuelle perso au lanceur. C'est la zone « radius autour du personnage » statique.

```js
const id = "target-range";
canvas.interface.grid.addHighlightLayer(id);
// pour chaque case où Scene4e.isWithin(origin, cell, range) est vrai :
canvas.interface.grid.highlightPosition(id, { x, y, color, alpha, border });
// nettoyage à la validation/annulation :
canvas.interface.grid.clearHighlightLayer(id);
```

- **Pourquoi GridHighlight** : on peint exactement les cases où `Scene4e.isWithin(origin, cell, range)` renvoie vrai. En 4e la distance est en cases (Chebyshev) → l'ensemble surligné est un **carré centré** sur le lanceur, soit le « carré de radius `range` » voulu.
- **Cohérence** : zone affichée == zone de validation logique. Aucune divergence entre ce que voit le joueur et ce que le code accepte.

### 6.2 Aire d'effet — Scene Regions natives dnd4e (PAS MeasuredTemplate)

> **Correction issue de la recherche du code `EndlesNights/dnd4eBeta` (v0.8.4, Foundry v14).** L'hypothèse initiale « MeasuredTemplate » est **fausse** : le système dnd4e n'utilise pas du tout les MeasuredTemplate pour les aires. Il pose des **Scene Regions** (API Foundry v13+).

Le système expose **`item.placeTemplate(options)`** (`module/item/item.js:1945`) qui construit un `regionData` et appelle **`canvas.regions.placeRegion(regionData, options)`** (`item.js:2049`). Caractéristiques clés :

- **Shapes `gridBased: true`** + `highlightMode: "coverage"` → l'aire est calculée **en cases (Chebyshev)**, donc carrée par construction. Pas de disque.
- **Visibilité `CONST.REGION_VISIBILITY.OBSERVER`** + `displayMeasurements: true` → **vu par tous nativement**. Notre besoin de visibilité partagée est déjà couvert par le système, sans rien réimplémenter.
- Gate : `item.hasAreaTarget` (`item.js:506`) — vrai si `system.rangeType ∈ {closeBurst, closeBlast, rangeBurst, rangeBlast, wall}` ou aura.

#### Formes par `rangeType` (`CONFIG.DND4E.rangeType[x].area`, `module/config.js:1436+`)

| `rangeType` dnd4e | Forme Region | Dimension | Note |
|---|---|---|---|
| `closeBurst` | `emanation` | `radius: area` | émane du **base token** ; `hole` selon `autoTarget.includeSelf` |
| `closeBlast` | `rectangle` | `width = height = area` | **carré X×X**, ancré au bord du token (`anchorX 0.5, anchorY 1`) — **confirme : pas de pivot** |
| `rangeBurst` | `emanation` | `radius: area` | base = rectangle 1×1 placé au curseur (point d'origine) |
| `rangeBlast` | `rectangle` | `width = height = area` | carré X×X |
| `wall` | `rectangle` | `count: area` | suite de cases 1×1 |

- **`closeBlast(X)` = `rectangle` width=height=area** → valide la décision « carré X×X, aucun pivot » (§10).
- **Bursts = `emanation` sur grille carrée** → aire carrée automatique (pas besoin de gérer la forme nous-mêmes).
- ⚠️ **Vocabulaire** : dnd4e nomme l'« Area Burst » `rangeBurst` (et `rangeBlast`). Notre verbe d'API `areaBurst()` correspond au `rangeBurst` du système.

#### Implication d'architecture — DÉCISION : option (b), placement maîtrisé + recette réutilisée

On **construit nous-mêmes la Region** (`canvas.regions.placeRegion`) au lieu de déléguer à `item.placeTemplate()`, pour garder le contrôle fluent. Mais on **réutilise la recette du système** au lieu de la dupliquer :

- **Lire `CONFIG.DND4E.rangeType[type].area`** (les définitions de forme du système : `emanation`/`rectangle`, dimensions, `gridBased`) plutôt que hardcoder les formes. → reste carré/correct, et **ne dérive pas** si dnd4e fait évoluer ses formes (pas de recette copiée-collée à maintenir).
- **Driver les paramètres depuis nos verbes fluents** (`closeBlast(3)` → côté 3, `areaBurst(3).within(20)` → radius 3 + contrainte de portée), pas depuis la config item.
- **Option de passer l'item** : un point d'entrée type `Target.fromItem(item)` peut **hydrater** la géométrie depuis `system.rangeType`/`system.area` pour les pouvoirs qui la déclarent déjà — mais c'est une commodité, l'API fluente reste maître.
- **Sortie garantie `Character[]`** : `.place()` dérive les tokens couverts par la Region et les passe par le **même chemin que `get()`** (dedupe par token + `Character.fromToken`). On n'expose **jamais** de token/actor brut. *(Contrainte non négociable.)*
- Réutilisation préservée : on reprend la visibilité partagée (`OBSERVER`), `highlightMode: "coverage"`, `gridBased: true` du système — donc « reuse over reimplement » reste respecté sur tout ce qui compte (forme, visibilité, rendu).
- Dépendance : nécessite **Foundry v13+/v14** (API `canvas.regions.placeRegion`).

> **Sous-question d'implémentation** : comment énumérer les tokens couverts par une Region posée — appartenance native (`token.regions` / `region.tokens`) vs test géométrique (réutiliser une logique façon `Scene4e.isWithin` sur les cases de la Region) ? À trancher au moment de coder.

### Trois modes de sélection

Cette distinction induit trois modes dans `Target` (voir §10 pour l'API) :
- **Mode ciblé** (Melee / Ranged, 1 ou N créatures) : GridHighlight de portée + ciblage natif + marqueurs + compteur X/N (§4–5). Le flux marqueur + compteur est **spécifique à ce mode**.
- **Mode aire** (Burst / Area Burst / Blast) : **Scene Region native dnd4e** (via `item.placeTemplate()`, §6.2), carrée et partagée → cibles dérivées de l'aire. Pas de compteur X/N.
- **Mode point** (case vide, ex. destination de téléport) : sélection privée d'une coordonnée, validée par la portée. C'est ce que faisait l'ancien `selectTarget` pour les téléports — distinct du ciblage de créature.

## 7. Questions ouvertes

1. ~~Aperçu du rayon d'effet qui suit le curseur ?~~ **Tranché** : le radius qui suit le curseur est réservé aux pouvoirs d'aire, et passe par les **Scene Regions natives dnd4e** (§6.2). La portée autour du lanceur reste un GridHighlight statique local (§6.1).
2. ~~Forme de la MeasuredTemplate ?~~ **Résolu par la recherche (§6.2)** : ce ne sont pas des MeasuredTemplate mais des **Scene Regions** dnd4e ; `closeBlast`/`rangeBlast` = `rectangle` X×X, bursts = `emanation` grid-based (carré). Forme correcte garantie par le système.
3. ~~Réutiliser `item.placeTemplate()` vs réimplémenter ?~~ **Tranché : option (b)** — on construit nous-mêmes la Region (contrôle fluent) en **lisant** `CONFIG.DND4E.rangeType[type].area` pour la forme (pas de hardcode), avec `Target.fromItem(item)` comme hydratation optionnelle. Sortie **toujours `Character[]`**. (§6.2 « Implication d'architecture ».)
4. **Énumération des tokens couverts** par une Region : appartenance native (`token.regions`/`region.tokens`) vs test géométrique. (Sous-question d'implémentation, §6.2.)
5. **UI du compteur** (mode ciblé) : panneau flottant sur le canvas vs Dialog classique avec liste des cibles + bouton Valider.
6. **Choix de l'asset JB2A** précis pour le marqueur (à valider dans le Sequencer Database Viewer selon ce qui est installé).

## 8. Options écartées

- **Option A (ciblage natif seul)** : pas de marqueur thématique → trop sobre.
- **Option B (Sequencer Crosshair + marqueurs, sans ciblage natif)** : le crosshair reste one-shot, oblige à refaire à la main le toggle/désélection et le hit-test des cibles déjà marquées → plus de code à contre-courant de la plateforme.
- **Portal en moteur** : one-shot, pas d'état multi-cibles.

## 9. Sources

- [Portal (portal-lib)](https://foundryvtt.com/packages/portal-lib)
- [Smart Target — theripper93 Wiki](https://wiki.theripper93.com/free/smarttarget)
- [Sequencer](https://foundryvtt.com/packages/sequencer) / [docs](https://fantasycomputer.works/FoundryVTT-Sequencer/)
- [Hook `targetToken` (API v13)](https://foundryvtt.com/api/functions/hookEvents.targetToken.html)
- [`UserTargets` (API)](https://foundryvtt.com/api/v12/classes/client.UserTargets.html)
- [`GridLayer` — `highlightPosition` (API)](https://foundryvtt.com/api/classes/foundry.canvas.layers.GridLayer.html)
- [JB2A Asset Library](https://library.jb2a.com/)
- [Foundry Community Wiki — Canvas](https://foundryvtt.wiki/en/development/api/canvas)
- [Système dnd4e — `EndlesNights/dnd4eBeta`](https://github.com/EndlesNights/dnd4eBeta) — code lu : `module/item/item.js` (`hasAreaTarget` l.506, `placeTemplate` l.1945, `placeRegion` l.2049), `module/config.js` (`DND4E.rangeType` l.1415+)

## 10. Évolution de l'API (décision : mode A — verbes explicites)

**Principe** : l'API doit se lire comme la ligne de ciblage d'un pouvoir 4e. On sépare la *géométrie* (verbes de forme) de *l'interaction + visibilité* (verbes terminaux). `range()`/`radius()` restent comme primitives bas niveau (échappatoire) mais ne sont plus la surface recommandée.

### Verbes de forme (géométrie)

| Verbe | range | radius / côté | Origine | Note |
|---|---|---|---|---|
| `melee(reach = 1)` | reach | 0 | cible directe | corps à corps |
| `ranged(r)` | r | 0 | cible directe | cible(s) à distance |
| `closeBurst(n)` | 0 | n | lanceur | émane de soi |
| `areaBurst(n).within(r)` | r | n | point choisi | point dans la portée, puis burst n |
| `closeBlast(x)` | 0 | **côté x** | adjacent au lanceur | **carré X×X, axis-aligned, AUCUN pivot/rotation** |

> **Correction blast** : `closeBlast(x)` prend la **longueur de côté X** (carré X×X), pas un « radius n ». Pas d'orientation à choisir — le carré est aligné sur la grille. (Hypothèse de design validée avec l'utilisateur ; diverge du blast directionnel RAW, assumé.)

### Verbes terminaux (interaction + visibilité)

Le nom du verbe rend la visibilité explicite au call site :

| Verbe | Interaction | Visibilité |
|---|---|---|
| `.get()` | aucune UI, calcul instantané | — |
| `.pick({ count })` | sélection interactive de créatures (ciblage natif + marqueurs + compteur X/N) | **privé** |
| `.place()` | pose une MeasuredTemplate carrée, renvoie les `Character[]` couverts | **partagé (vu par tous)** |
| `.pickPoint()` | sélection d'une coordonnée (case vide), validée par la portée | **privé** |

### Exemples cibles

```js
Target.fromCharacter(caster).ranged(10).type('enemies').pick({ count: 3 });
Target.fromCharacter(caster).closeBurst(1).type('enemies').get();
Target.fromCharacter(caster).areaBurst(3).within(20).type('enemies').place();
Target.fromCharacter(caster).closeBlast(3).type('enemies').place();
Target.fromCharacter(caster).ranged(5).pickPoint();   // destination de téléport
```

### Pas de rétrocompat

Décision : **on ne garde pas d'alias**. `selectTarget` / `selectCharacters` sont retirés, les pouvoirs sont migrés (voir §11).

## 11. Pouvoirs impactés par la migration

> Recensé via grep sur `src/scripts/powers/`. À migrer vers la nouvelle API.

**Mode ciblé** (`ranged()`/`melee()` + `.pick()`) :
- `avenger/leading_step.js` (sélection 1 cible, portée 1)
- `grund/healing_spirit.js` (portée 5) — cumule aussi le mode aire
- `paladin/lay_on_hands.js` (portée 1, allié)
- `lightning_fury/furious_bolts.js` (portées 20 puis 10, chaîne)
- `lightning_fury/furious_bolts_ideal.js` ⚠️ — semble un brouillon de design (param `number`, commentaires « too generic ») ; confirmer s'il est réel

**Mode aire** (`areaBurst()`/`closeBurst()` + `.place()`/`.get()`) :
- `thunderclap.js` → `areaBurst(3).within(20)` (point + radius 3 en deux temps aujourd'hui)
- `horgrim/kerymwael_teleport_assault.js` (l.42) → `areaBurst(1).within(5)` — *NB : `.get().type()` y est dans le mauvais ordre, bug existant à corriger au passage*
- `grund/healing_spirit.js` (l.34) → `closeBurst(1).type('allies')` autour de l'esprit

**Mode point** (`.pickPoint()`) :
- `avenger/leading_step.js` (2 destinations, portées 5 et 1)
- `paladin/winter_arrival.js`
- `talaerin/fey_step.js`
- `talaerin/spatial_trip.js`

**Doublons racine à clarifier AVANT migration** (semblent legacy des versions en dossier) :
- `grund.js` vs `grund/healing_spirit.js`
- `kerymwael_teleport_assault.js` vs `horgrim/kerymwael_teleport_assault.js`
- (`thunderclap.js` n'a pas de version en dossier → c'est le vrai)

**Non impactés** (pas de targeting, ou via `User4e.getTargets()` / self) :
`carric/menacing_presence`, `paladin/{ardent_strike, castigating_strike, hero_poise, majetic_halo, righteous_smite, wrath_of_the_gods}`, `rogue/feinting_flurry`.
