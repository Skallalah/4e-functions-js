# Targeting UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refonte de l'UX de ciblage (`Target`) — marqueurs multi-sélection façon Solasta, visualisation de portée, aires partagées via Scene Regions, et une API fluente qui se lit comme une ligne de ciblage 4e.

**Architecture:** Le ciblage natif Foundry (`game.user.targets` + hook `targetToken`) sert de moteur d'état pour la sélection de créatures (toggle/désélection gratuits). Par-dessus on greffe la présentation (marqueur JB2A rotatif via Sequencer, surlignage de portée via GridHighlight, panneau flottant X/N). Les aires d'effet passent par des Scene Regions natives (partagées à tous), mais les cibles renvoyées sont **toujours** dérivées par le même chemin que `get()`. La validation (portée/type) reste la logique `Target` existante.

**Tech Stack:** JavaScript (pas de TypeScript, pas de build à l'exécution — fichiers chargés comme globals par FoundryVTT), FoundryVTT v13+ (API `canvas.regions` / Region documents, API grille v12+ `getOffset`/`getTopLeftPoint`), Sequencer, JB2A, système `dnd4e`. Aucune infra de test : chaque tâche se vérifie par `node --check` (syntaxe) + un protocole manuel in-Foundry.

## Global Constraints

- **Toutes les méthodes utilitaires restent `static`** (sauf instances `Target` fluentes), requis pour l'accès depuis les macros.
- **JSDoc obligatoire** sur chaque méthode/fonction/propriété ajoutée : `@param` typés, `@returns`, `@type` sur les champs.
- **API fluente / self-documenting** : verbes chaînables, pas d'accès Foundry brut dans les scripts de pouvoir.
- **Sortie `Character[]` non négociable** : `.pick()`, `.place()`, `.get()` renvoient des `Character` (via `Character.fromToken`). On n'expose **jamais** de token/actor brut.
- **Pas de rétrocompat** : `selectTarget` / `selectCharacters` sont supprimés une fois les pouvoirs migrés. Aucun alias.
- **Pas de nouveau fichier global** : le panneau de sélection vit dans `target.js` (pas d'ajout à `module.json`). Marqueur + surlignage vivent dans `vfx.js`, helpers spatiaux dans `scene.js`.
- **Vocabulaire dnd4e** : notre `areaBurst()` correspond au `rangeType: 'rangeBurst'` du système ; `closeBurst()` → `'closeBurst'` ; `closeBlast(x)` → `'closeBlast'` (carré X×X, axis-aligned, AUCUN pivot).
- **Asset marqueur** : une seule constante `VFX4e.TARGET_MARKER_ASSET`. Défaut `"jb2a.magic_signs.rune.abjuration.loop.blue"` ; fallback documenté `"jb2a.magic_signs.rune.abjuration.intro.blue"` (variante déjà utilisée dans `vfx.js`, donc installée).

---

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `src/scripts/vfx.js` | Présentation : marqueur de cible + surlignage de portée | Modifier (ajouts) |
| `src/scripts/scene.js` | Helpers spatiaux : énumération de cases, footprint d'aire, placement de Region | Modifier (ajouts) |
| `src/scripts/target.js` | API fluente : verbes de forme + verbes terminaux (`pick`/`place`/`pickPoint`/`get`), panneau de sélection | Modifier (refonte) |
| `src/scripts/powers/**` | Pouvoirs migrés vers la nouvelle API | Modifier |
| `src/scripts/powers/grund.js`, `.../kerymwael_teleport_assault.js`, `.../lightning_fury/furious_bolts_ideal.js` | Doublons / brouillon | Supprimer |

**Référence spec :** `docs/superpowers/specs/targeting-ux-improvements.md` (décisions §4–§11).

---

## Phase 0 — Nettoyage préalable

### Task 0.1 : Supprimer les doublons racine et le brouillon

Ces fichiers sont des copies legacy (versions canoniques en sous-dossier) ou un brouillon de design jamais exécutable (référence `hitCount` avant définition, commentaire `// Important : The rest is not DONE`).

**Files:**
- Delete: `src/scripts/powers/grund.js` (canonique : `grund/healing_spirit.js`)
- Delete: `src/scripts/powers/kerymwael_teleport_assault.js` (canonique : `horgrim/kerymwael_teleport_assault.js`)
- Delete: `src/scripts/powers/lightning_fury/furious_bolts_ideal.js` (brouillon de `furious_bolts.js`)

- [ ] **Step 1: Confirmer que les versions en dossier sont bien les canoniques**

Run: `diff src/scripts/powers/grund.js src/scripts/powers/grund/healing_spirit.js; echo "---"; diff src/scripts/powers/kerymwael_teleport_assault.js src/scripts/powers/horgrim/kerymwael_teleport_assault.js`
Expected: des différences mineures (la version dossier de `grund` désactive le temp-heal ; `horgrim/` a `.type('enemies')` + Mark). Les versions racine sont les anciennes. Confirmer visuellement qu'aucune logique unique n'est perdue.

- [ ] **Step 2: Supprimer les trois fichiers**

```bash
git rm src/scripts/powers/grund.js \
       src/scripts/powers/kerymwael_teleport_assault.js \
       src/scripts/powers/lightning_fury/furious_bolts_ideal.js
```

- [ ] **Step 3: Vérifier qu'aucune référence ne pointe vers eux**

Run: `grep -rn "furious_bolts_ideal\|powers/grund.js\|powers/kerymwael_teleport_assault.js" src/ docs/`
Expected: aucun résultat dans `src/` (références doc dans la spec acceptables).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(powers): remove legacy root duplicates and furious_bolts draft

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1 — Primitives de présentation (VFX + Scene)

Aucune dépendance à la nouvelle API `Target` : implémentables et vérifiables seuls.

### Task 1.1 : Marqueur de cible rotatif (`VFX4e.targetMarker` / `clearTargetMarker`)

**Files:**
- Modify: `src/scripts/vfx.js` (ajouter une constante de classe + 3 méthodes statiques)

**Interfaces:**
- Produces :
  - `VFX4e.TARGET_MARKER_ASSET: string`
  - `VFX4e.targetMarker(token: TokenDocument|Token): void`
  - `VFX4e.clearTargetMarker(token: TokenDocument|Token): void`
  - `VFX4e.clearAllTargetMarkers(): void`
  - Convention de nommage Sequencer : `target-marker-<token.id>`

- [ ] **Step 1: Ajouter la constante d'asset en tête de classe**

Dans `src/scripts/vfx.js`, juste après `class VFX4e {`, avant `static PowerSources = {`:

```javascript
    /**
     * Asset JB2A unique servant de marqueur de sélection (anneau runique rotatif).
     * Valeur par défaut alignée sur un asset déjà référencé dans PowerSources
     * (donc installé). Swap d'une ligne si un autre asset est préféré
     * (à valider dans le Sequencer Database Viewer).
     *
     * @type {string}
     */
    static TARGET_MARKER_ASSET = 'jb2a.magic_signs.rune.abjuration.loop.blue';
```

- [ ] **Step 2: Ajouter les trois méthodes de marqueur en fin de classe**

Dans `src/scripts/vfx.js`, juste avant la dernière accolade fermante de la classe (avant `static _resolveConfig`), ajouter :

```javascript
    /**
     * Pose un marqueur de sélection rotatif et persistant sur un token.
     * Idempotent : repose proprement si déjà présent (nommé par token).
     *
     * @param {TokenDocument | Token} token Le token ciblé
     * @returns {void}
     */
    static targetMarker(token) {
        const id = token.id;
        new Sequence()
            .effect()
                .file(VFX4e.TARGET_MARKER_ASSET)
                .atLocation(token)
                .scaleToObject(1.6)
                .persist()
                .name(`target-marker-${id}`)
                .fadeIn(150)
                .fadeOut(150)
                .loopProperty('sprite', 'rotation', { from: 0, to: 360, duration: 8000 })
                .belowTokens(false)
            .play();
    }

    /**
     * Retire le marqueur de sélection d'un token.
     *
     * @param {TokenDocument | Token} token Le token concerné
     * @returns {void}
     */
    static clearTargetMarker(token) {
        Sequencer.EffectManager.endEffects({ name: `target-marker-${token.id}` });
    }

    /**
     * Retire tous les marqueurs de sélection de la scène (filet de sécurité au cleanup).
     *
     * @returns {void}
     */
    static clearAllTargetMarkers() {
        Sequencer.EffectManager.endEffects({ name: 'target-marker-*' });
    }
```

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check src/scripts/vfx.js`
Expected: aucune sortie (exit 0).

- [ ] **Step 4: Vérification manuelle in-Foundry**

Dans une scène de test, console (F12) :
```javascript
const t = canvas.tokens.controlled[0];
VFX4e.targetMarker(t);            // un anneau runique apparaît et tourne sur le token
VFX4e.targetMarker(t);            // ré-appel : pas de doublon empilé
VFX4e.clearTargetMarker(t);       // le marqueur disparaît
```
Expected : anneau rotatif visible puis retiré. Si l'asset `.loop.blue` est introuvable (warning Sequencer), remplacer `TARGET_MARKER_ASSET` par `'jb2a.magic_signs.rune.abjuration.intro.blue'` et reprendre.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/vfx.js
git commit -m "feat(vfx): rotating target marker (targetMarker/clearTargetMarker)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.2 : Énumération de cases + surlignage de portée (GridHighlight)

**Files:**
- Modify: `src/scripts/scene.js` (ajouter `cellsWithin`)
- Modify: `src/scripts/vfx.js` (ajouter `rangeHighlight` / `clearRangeHighlight`)

**Interfaces:**
- Consumes : `Scene4e.getTrueAxis` (existant), API grille `canvas.grid.getOffset`/`getTopLeftPoint`/`getCenterPoint`.
- Produces :
  - `Scene4e.cellsWithin(origin: {x,y}, range: number): Array<{x:number,y:number}>` (coins haut-gauche pixel des cases dans le rayon Chebyshev, **centre inclus**)
  - `VFX4e.rangeHighlight(origin: {x,y}, range: number, options?: {color?:string, alpha?:number, border?:number}): void`
  - `VFX4e.clearRangeHighlight(): void`
  - Constante d'id de couche : `VFX4e.RANGE_HIGHLIGHT_ID = 'target-range'`

- [ ] **Step 1: Ajouter `Scene4e.cellsWithin` à la fin de la classe `Scene4e`**

Dans `src/scripts/scene.js`, avant la dernière `}` de la classe :

```javascript
    /**
     * Énumère les cases (coins haut-gauche en pixels) dans le rayon Chebyshev
     * `range` autour de `origin`, centre inclus. Sur grille carrée, l'ensemble
     * forme le carré (2·range+1)×(2·range+1) attendu en 4e.
     *
     * @param {{x:number, y:number}} origin Point d'origine (pixels)
     * @param {number} range Rayon en cases
     * @returns {Array<{x:number, y:number}>} Coins haut-gauche pixel des cases
     */
    static cellsWithin(origin, range) {
        const center = canvas.grid.getCenterPoint(origin);
        const { i: ci, j: cj } = canvas.grid.getOffset(center);

        /** @type {Array<{x:number, y:number}>} */
        const cells = [];
        for (let di = -range; di <= range; di++) {
            for (let dj = -range; dj <= range; dj++) {
                const point = canvas.grid.getTopLeftPoint({ i: ci + di, j: cj + dj });
                cells.push({ x: point.x, y: point.y });
            }
        }
        return cells;
    }
```

- [ ] **Step 2: Vérifier la syntaxe de scene.js**

Run: `node --check src/scripts/scene.js`
Expected: exit 0.

- [ ] **Step 3: Ajouter l'id de couche en tête de `VFX4e`**

Dans `src/scripts/vfx.js`, juste après la déclaration de `TARGET_MARKER_ASSET` (Task 1.1) :

```javascript
    /**
     * Identifiant de la couche de surlignage de portée (GridHighlight, local au client).
     *
     * @type {string}
     */
    static RANGE_HIGHLIGHT_ID = 'target-range';
```

- [ ] **Step 4: Ajouter `rangeHighlight` / `clearRangeHighlight` en fin de classe `VFX4e`**

Juste après `clearAllTargetMarkers` (Task 1.1) :

```javascript
    /**
     * Peint, localement au client, la zone de portée autour d'une origine
     * (aide visuelle « où je peux cliquer »). Carré centré sur grille carrée.
     *
     * @param {{x:number, y:number}} origin Point d'origine (pixels)
     * @param {number} range Rayon de portée en cases
     * @param {Object} [options]
     * @param {string} [options.color='#33aaff'] Couleur de remplissage
     * @param {number} [options.alpha=0.18] Opacité du remplissage
     * @param {number} [options.border=0x33aaff] Couleur de bordure
     * @returns {void}
     */
    static rangeHighlight(origin, range, options = {}) {
        const { color = '#33aaff', alpha = 0.18, border = 0x33aaff } = options;
        const id = VFX4e.RANGE_HIGHLIGHT_ID;

        VFX4e.clearRangeHighlight();
        canvas.interface.grid.addHighlightLayer(id);

        for (const cell of Scene4e.cellsWithin(origin, range)) {
            canvas.interface.grid.highlightPosition(id, {
                x: cell.x,
                y: cell.y,
                color,
                alpha,
                border
            });
        }
    }

    /**
     * Efface la couche de surlignage de portée.
     *
     * @returns {void}
     */
    static clearRangeHighlight() {
        canvas.interface.grid.clearHighlightLayer(VFX4e.RANGE_HIGHLIGHT_ID);
    }
```

- [ ] **Step 5: Vérifier la syntaxe de vfx.js**

Run: `node --check src/scripts/vfx.js`
Expected: exit 0.

- [ ] **Step 6: Vérification manuelle in-Foundry**

Console, avec un token sélectionné :
```javascript
const o = canvas.tokens.controlled[0].center;
VFX4e.rangeHighlight(o, 5);   // carré 11×11 cases surligné, centré sur le token
VFX4e.clearRangeHighlight();  // le surlignage disparaît
```
Expected : carré bleu translucide de rayon 5 cases, centré, puis effacé. Vérifier que la zone surlignée coïncide avec ce que `Scene4e.isWithin(o, cell, 5)` accepterait (cohérence affichage/validation).

- [ ] **Step 7: Commit**

```bash
git add src/scripts/scene.js src/scripts/vfx.js
git commit -m "feat(vfx): local range highlight via GridHighlight + Scene4e.cellsWithin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — Verbes de forme + `.pickPoint()` (sans toucher au ciblage interactif)

### Task 2.1 : Verbes de forme + helper de type partagé

Ajoute la surface fluente lisible (`melee`/`ranged`/`closeBurst`/`areaBurst`/`within`/`closeBlast`) en réglant l'état interne existant (`_range`, `_radius`) plus un descripteur de forme d'aire (`_dnd4eRangeType`). Refactore le filtre de type de `get()` dans un helper réutilisable par `.pick()`.

**Files:**
- Modify: `src/scripts/target.js`

**Interfaces:**
- Consumes : état existant `_range`, `_radius`, `_type`, `_disposition`, `Scene4e.isWithin`.
- Produces :
  - `melee(reach?: number): Target` — `_range = reach (def 1)`, `_radius = 0`
  - `ranged(r: number): Target` — `_range = r`, `_radius = 0`
  - `closeBurst(n: number): Target` — `_range = 0`, `_radius = n`, `_dnd4eRangeType = 'closeBurst'`
  - `areaBurst(n: number): Target` — `_radius = n`, `_dnd4eRangeType = 'rangeBurst'`
  - `within(r: number): Target` — `_range = r`
  - `closeBlast(x: number): Target` — `_range = 0`, `_radius = x`, `_dnd4eRangeType = 'closeBlast'`
  - `_matchesType(token: TokenDocument|Token): boolean`
  - champ `_dnd4eRangeType: string|null`

- [ ] **Step 1: Ajouter le champ `_dnd4eRangeType` aux propriétés d'instance**

Dans `src/scripts/target.js`, sous `_disposition = null;` (ligne ~7) :

```javascript
    /** @type {('closeBurst'|'rangeBurst'|'closeBlast')|null} Forme d'aire (clé dnd4e), null en mode ciblé/point */
    _dnd4eRangeType = null;
```

- [ ] **Step 2: Ajouter les verbes de forme après `radius()`**

Dans `src/scripts/target.js`, juste après la méthode `radius()` (avant `type()`) :

```javascript
    /**
     * Corps à corps : portée = allonge, cible directe.
     *
     * @param {number} [reach=1] Allonge en cases
     * @returns {Target}
     */
    melee(reach = 1) {
        this._range = reach;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * À distance : portée = r, cible directe.
     *
     * @param {number} r Portée en cases
     * @returns {Target}
     */
    ranged(r) {
        this._range = r;
        this._radius = 0;
        this._dnd4eRangeType = null;
        return this;
    }

    /**
     * Close burst n : aire émanant du lanceur, rayon n.
     *
     * @param {number} n Rayon du burst en cases
     * @returns {Target}
     */
    closeBurst(n) {
        this._range = 0;
        this._radius = n;
        this._dnd4eRangeType = 'closeBurst';
        return this;
    }

    /**
     * Area burst n (à compléter par `.within(r)`) : burst de rayon n centré
     * sur un point choisi dans la portée r. (dnd4e : rangeType 'rangeBurst'.)
     *
     * @param {number} n Rayon du burst en cases
     * @returns {Target}
     */
    areaBurst(n) {
        this._radius = n;
        this._dnd4eRangeType = 'rangeBurst';
        return this;
    }

    /**
     * Portée du point d'origine d'une aire (utilisé avec `areaBurst`).
     *
     * @param {number} r Portée en cases
     * @returns {Target}
     */
    within(r) {
        this._range = r;
        return this;
    }

    /**
     * Close blast x : carré X×X axis-aligned, ancré au lanceur, AUCUN pivot.
     * (dnd4e : rangeType 'closeBlast'.)
     *
     * @param {number} x Longueur du côté en cases
     * @returns {Target}
     */
    closeBlast(x) {
        this._range = 0;
        this._radius = x;
        this._dnd4eRangeType = 'closeBlast';
        return this;
    }
```

- [ ] **Step 3: Ajouter le helper `_matchesType` et refactorer `get()`**

Ajouter, juste avant `get()` :

```javascript
    /**
     * Le token satisfait-il le filtre de type (`creatures`/`allies`/`enemies`)
     * au regard de la disposition du lanceur ?
     *
     * @param {TokenDocument | Token} token
     * @returns {boolean}
     */
    _matchesType(token) {
        if (this._type === 'creatures' || this._disposition === null) return true;
        const disposition = token.document?.disposition ?? token.disposition;
        switch (this._type) {
            case 'allies':
                return this._disposition === disposition;
            case 'enemies':
                return this._disposition !== disposition;
            default:
                return true;
        }
    }
```

Puis remplacer le bloc de filtrage de type dans `get()` :

```javascript
        if (this._type !== 'creatures' && this._disposition !== null) {
            const typeFilter = (token) => {
                switch (this._type) {
                    case 'allies':
                        return this._disposition === token?.disposition;
                    case 'enemies':
                        return this._disposition !== token?.disposition;
                    default:
                        return true;
                }
            };

            targets = targets.filter(typeFilter)
        }
```

par :

```javascript
        targets = targets.filter(token => this._matchesType(token));
```

- [ ] **Step 4: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 5: Vérification manuelle in-Foundry**

Console, avec un token contrôlé et au moins un autre token à proximité :
```javascript
const c = Character.fromActor(canvas.tokens.controlled[0].actor);
Target.fromCharacter(c).closeBurst(5).type('creatures').get().map(x => x.name);
// même résultat qu'avant via .radius(5)
Target.fromCharacter(c).ranged(5).type('enemies').get().map(x => x.name);
```
Expected : les tableaux de `Character` sont cohérents (filtrage de type inchangé par le refactor).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): fluent shape verbs (melee/ranged/closeBurst/areaBurst/closeBlast) + shared type filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.2 : `.pickPoint()` (sélection privée d'une coordonnée, Portal)

Reprend la logique Portal de l'ancien `selectTarget` sous un nom explicite « mode point ». Renvoie un `Target` dont l'origine est le point choisi (compatible avec l'usage `.origin` des pouvoirs de téléport).

**Files:**
- Modify: `src/scripts/target.js`

**Interfaces:**
- Consumes : `Portal` (global), `Scene4e.isWithin`, état `_range`/`_radius`.
- Produces : `pickPoint(icon?: string): Promise<Target|null>` — `Target` avec `.origin = {x,y}` du point choisi, ou `null` si annulé.

- [ ] **Step 1: Ajouter `pickPoint()` après les verbes de forme**

Dans `src/scripts/target.js` :

```javascript
    /**
     * Mode point : sélection privée d'une case (vide ou non) dans la portée,
     * via le crosshair Portal. Renvoie un Target dont l'origine est le point
     * choisi (ex. destination de téléport).
     *
     * @param {string} [icon] Chemin d'icône du curseur de ciblage
     * @returns {Promise<Target|null>} Target centré sur le point choisi, ou null si annulé
     */
    async pickPoint(icon) {
        if (this._origins.length !== 1) throw Error('cannot pick a point from more than one origin');

        const portal = new Portal()
            .color('#ffffff')
            .origin(this._origins[0]);

        if (icon) portal.texture(icon);

        while (true) {
            const result = await portal.pick();
            if (result === false) return null; // annulé

            if (!Scene4e.isWithin(this._origins[0], result, this._range)) {
                ui.notifications.warn(`Please target one square within ${this._range} squares.`);
                continue;
            }

            return new Target([result], this._range, this._radius);
        }
    }
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Console, token contrôlé :
```javascript
const c = Character.fromActor(canvas.tokens.controlled[0].actor);
const p = await Target.fromCharacter(c).ranged(5).pickPoint();
console.log(p?.origin); // {x, y} du carré cliqué dans la portée ; re-cliquer hors portée → warn
```
Expected : crosshair Portal, refus hors portée, renvoie un `Target` avec `.origin`. ESC → `null`.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): pickPoint() — private coordinate selection (Portal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — `.pick()` : ciblage natif + marqueurs + compteur flottant

### Task 3.1 : Panneau de sélection flottant (helper interne à `target.js`)

Petit panneau DOM non-modal (compteur X/N + boutons Valider/Annuler), encapsulé dans une classe **non destinée aux scripts de pouvoir** (interne à `.pick()`). Défini dans `target.js` au-dessus de `class Target` pour rester un global sans toucher `module.json`.

**Files:**
- Modify: `src/scripts/target.js` (ajouter `class TargetSelectionPanel` avant `class Target`)

**Interfaces:**
- Produces : `class TargetSelectionPanel`
  - `constructor({ count: number })`
  - `update(current: number, total: number): void` — met à jour « X / N » et l'état du bouton Valider
  - `onValidate(cb: () => void): void`
  - `onCancel(cb: () => void): void`
  - `destroy(): void`

- [ ] **Step 1: Définir la classe au-dessus de `class Target`**

Au tout début de `src/scripts/target.js`, avant `class Target {` :

```javascript
/**
 * Panneau flottant non-modal pour la sélection multi-cibles (compteur X/N + actions).
 * Usage interne à Target.pick() — pas une API de pouvoir.
 */
class TargetSelectionPanel {
    /** @type {HTMLDivElement} */
    _el;
    /** @type {HTMLSpanElement} */
    _counter;
    /** @type {HTMLButtonElement} */
    _validateBtn;
    /** @type {number} */
    _count;
    /** @type {(() => void)|null} */
    _onValidate = null;
    /** @type {(() => void)|null} */
    _onCancel = null;
    /** @type {(e: KeyboardEvent) => void} */
    _onKeyDown;

    /**
     * @param {Object} opts
     * @param {number} opts.count Nombre de cibles attendu
     */
    constructor({ count }) {
        this._count = count;

        const el = document.createElement('div');
        el.className = 'target-selection-panel';
        el.style.cssText = [
            'position:absolute', 'top:80px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:60', 'padding:8px 14px', 'border-radius:8px',
            'background:rgba(0,0,0,0.78)', 'color:#fff', 'font-size:14px',
            'display:flex', 'gap:10px', 'align-items:center',
            'box-shadow:0 2px 8px rgba(0,0,0,0.5)', 'pointer-events:auto'
        ].join(';');

        this._counter = document.createElement('span');
        this._counter.textContent = `Cibles : 0 / ${count}`;

        this._validateBtn = document.createElement('button');
        this._validateBtn.type = 'button';
        this._validateBtn.textContent = 'Valider';
        this._validateBtn.style.cssText = 'pointer-events:auto;cursor:pointer';
        this._validateBtn.disabled = true;
        this._validateBtn.addEventListener('click', () => this._onValidate?.());

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.style.cssText = 'pointer-events:auto;cursor:pointer';
        cancelBtn.addEventListener('click', () => this._onCancel?.());

        el.append(this._counter, this._validateBtn, cancelBtn);
        (document.getElementById('interface') ?? document.body).appendChild(el);
        this._el = el;

        this._onKeyDown = (e) => { if (e.key === 'Escape') this._onCancel?.(); };
        window.addEventListener('keydown', this._onKeyDown);
    }

    /**
     * @param {number} current Cibles actuellement sélectionnées
     * @param {number} total Cibles attendues
     * @returns {void}
     */
    update(current, total) {
        this._counter.textContent = `Cibles : ${current} / ${total}`;
        this._validateBtn.disabled = current < 1;
    }

    /** @param {() => void} cb @returns {void} */
    onValidate(cb) { this._onValidate = cb; }

    /** @param {() => void} cb @returns {void} */
    onCancel(cb) { this._onCancel = cb; }

    /** @returns {void} */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._el.remove();
    }
}
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Console :
```javascript
const panel = new TargetSelectionPanel({ count: 3 });
panel.update(2, 3);                 // affiche « Cibles : 2 / 3 », bouton Valider actif
panel.onCancel(() => console.log('cancel'));
// presser Échap → log 'cancel'
panel.destroy();                    // le panneau disparaît
```
Expected : panneau visible en haut-centre du canvas, compteur correct, Échap déclenche cancel, destroy nettoie.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): floating TargetSelectionPanel (X/N counter + validate/cancel)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.2 : `.pick({count, icon})` — ciblage natif Foundry + marqueurs + validation live

Remplace `selectCharacters`. Moteur d'état = ciblage natif (`token.setTarget` + hook `targetToken`). Validation live (portée + type) ; marqueur posé/retiré ; panneau X/N ; auto-résolution quand `count` atteint. Renvoie `Character[]`.

**Files:**
- Modify: `src/scripts/target.js`

**Interfaces:**
- Consumes : `TargetSelectionPanel` (Task 3.1), `VFX4e.rangeHighlight`/`clearRangeHighlight` (Task 1.2), `VFX4e.targetMarker`/`clearTargetMarker` (Task 1.1), `Scene4e.isWithin`, `this._matchesType` (Task 2.1), `Character.fromToken`, hook `targetToken`.
- Produces : `pick(opts?: { count?: number, icon?: string }): Promise<Character[]>` — `Character[]` sélectionnés (1..count), ou `[]` si annulé.

- [ ] **Step 1: Ajouter `pick()` après `pickPoint()`**

```javascript
    /**
     * Mode ciblé : sélection interactive de 1..count créatures via le ciblage
     * natif Foundry (toggle/désélection gratuits), avec surlignage de portée,
     * marqueur posé sur chaque cible et compteur X/N. Validation live de la
     * portée et du type. Auto-résolution une fois `count` atteint.
     *
     * @param {Object} [opts]
     * @param {number} [opts.count=1] Nombre maximum de cibles
     * @param {string} [opts.icon] (réservé) icône — non utilisée par le ciblage natif
     * @returns {Promise<Character[]>} Cibles sélectionnées, ou [] si annulé
     */
    async pick({ count = 1, icon } = {}) {
        if (this._origins.length !== 1) throw Error('cannot pick from more than one origin');
        const origin = this._origins[0];

        // Repartir d'une sélection propre.
        for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false });

        VFX4e.rangeHighlight(origin, this._range);
        const panel = new TargetSelectionPanel({ count });

        /** @type {Map<string, Token>} */
        const selected = new Map();

        let resolveFn;
        const done = new Promise(resolve => { resolveFn = resolve; });

        /**
         * @param {User} user
         * @param {Token} token
         * @param {boolean} targeted
         */
        const onTarget = (user, token, targeted) => {
            if (user.id !== game.user.id) return;

            if (targeted) {
                const doc = token.document ?? token;
                if (!Scene4e.isWithin(origin, doc, this._range)) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`Please target a creature within ${this._range} squares.`);
                    return;
                }
                if (!this._matchesType(token)) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`That target is not a valid ${this._type.slice(0, -1)}.`);
                    return;
                }
                if (!selected.has(token.id) && selected.size >= count) {
                    token.setTarget(false, { releaseOthers: false });
                    ui.notifications.warn(`You can only select ${count} target${count > 1 ? 's' : ''}.`);
                    return;
                }
                selected.set(token.id, token);
                VFX4e.targetMarker(token);
            } else {
                selected.delete(token.id);
                VFX4e.clearTargetMarker(token);
            }

            panel.update(selected.size, count);
            if (selected.size === count) resolveFn('validate');
        };

        Hooks.on('targetToken', onTarget);
        panel.onValidate(() => resolveFn('validate'));
        panel.onCancel(() => resolveFn('cancel'));

        const outcome = await done;

        // Cleanup (toujours).
        Hooks.off('targetToken', onTarget);
        VFX4e.clearRangeHighlight();
        for (const token of selected.values()) VFX4e.clearTargetMarker(token);
        for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false });
        panel.destroy();

        if (outcome === 'cancel') return [];
        return [...selected.values()].map(token => Character.fromToken(token.document ?? token));
    }
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Console, token contrôlé + plusieurs ennemis/alliés à portée :
```javascript
const c = Character.fromActor(canvas.tokens.controlled[0].actor);
const picks = await Target.fromCharacter(c).ranged(10).type('enemies').pick({ count: 2 });
console.log(picks.map(p => p.name));
```
Expected :
- carré de portée surligné, panneau « Cibles : 0 / 2 » ;
- cliquer un ennemi à portée → marqueur posé, compteur 1/2 ;
- re-cliquer le même → marqueur retiré, compteur 0/2 (toggle) ;
- cibler un allié ou un token hors portée → dé-ciblé immédiatement + warning ;
- à la 2ᵉ cible valide → auto-résolution, nettoyage (surlignage + marqueurs + cibles natives effacés), renvoie 2 `Character` ;
- Échap/Annuler avant complétion → `[]`.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): pick() — native targeting engine with live validation, markers, X/N counter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — `.place()` : aires via Scene Regions partagées

### Task 4.1 : Placement de Region (helper `Scene4e`) + footprint d'aire

Helper de placement tolérant à l'API (préfère `canvas.regions.placeRegion`, sinon `scene.createEmbeddedDocuments("Region", …)`), et un constructeur de footprint rectangulaire (sur grille carrée, burst = rectangle (2n+1)² ; blast = rectangle x²).

> **Étape de vérification d'API requise (Step 1)** : `canvas.regions.placeRegion` provient de la lecture du source dnd4e (`item.js:2049`). Confirmer en live AVANT de coder ; le helper inclut déjà un fallback natif si la méthode n'existe pas.

**Files:**
- Modify: `src/scripts/scene.js`

**Interfaces:**
- Consumes : API grille `getCenterPoint`/`getOffset`/`getTopLeftPoint`, `canvas.grid.size`, `CONST.REGION_VISIBILITY`.
- Produces :
  - `Scene4e.areaRectangle(origin: {x,y}, type: 'closeBurst'|'rangeBurst'|'closeBlast', size: number): {x:number,y:number,width:number,height:number}` (pixels, footprint carré)
  - `Scene4e.placeAreaRegion(rectangle, options?: {color?:string, name?:string}): Promise<RegionDocument>`

- [ ] **Step 1: Vérifier l'API Region en live (avant de coder)**

Dans la console Foundry :
```javascript
console.log(typeof canvas.regions?.placeRegion);          // attendu: 'function' (dnd4e v14)
console.log(typeof canvas.scene?.createEmbeddedDocuments); // attendu: 'function' (fallback natif)
console.log(CONST.REGION_VISIBILITY);                      // {LAYER, GAMEMASTER, OBSERVER}
console.log(CONFIG.DND4E?.rangeType?.rangeBurst?.area);    // {type:'emanation', radius:'area'}
```
Noter lequel existe : le helper Step 2 préfère `placeRegion` et retombe sur `createEmbeddedDocuments`. Si la forme de `regionData` attendue par `placeRegion` diffère, inspecter `item.placeTemplate` dans le source dnd4e et ajuster `placeAreaRegion`.

- [ ] **Step 2: Ajouter `areaRectangle` et `placeAreaRegion` à `Scene4e`**

Dans `src/scripts/scene.js`, avant la dernière `}` de la classe :

```javascript
    /**
     * Calcule le footprint pixel carré d'une aire dnd4e sur grille carrée.
     * Sur grille carrée, un burst (emanation) de rayon n centré sur une case
     * couvre le carré (2n+1)×(2n+1) ; un blast de côté x couvre x×x ancré
     * au coin haut-gauche de la case d'origine.
     *
     * @param {{x:number, y:number}} origin Point d'origine (pixels)
     * @param {'closeBurst'|'rangeBurst'|'closeBlast'} type Clé de forme dnd4e
     * @param {number} size Rayon (burst) ou côté (blast), en cases
     * @returns {{x:number, y:number, width:number, height:number}} Rectangle en pixels
     */
    static areaRectangle(origin, type, size) {
        const gs = canvas.grid.size;
        // Lecture de la recette du système (non bloquant : fallback si absent).
        const shapeType = CONFIG.DND4E?.rangeType?.[type]?.area?.type
            ?? (type === 'closeBlast' ? 'rectangle' : 'emanation');

        const center = canvas.grid.getCenterPoint(origin);
        const { i: ci, j: cj } = canvas.grid.getOffset(center);

        if (shapeType === 'rectangle' && type === 'closeBlast') {
            const tl = canvas.grid.getTopLeftPoint({ i: ci, j: cj });
            return { x: tl.x, y: tl.y, width: size * gs, height: size * gs };
        }

        // emanation (closeBurst / rangeBurst) → carré (2·size+1)²
        const tl = canvas.grid.getTopLeftPoint({ i: ci - size, j: cj - size });
        const side = (2 * size + 1) * gs;
        return { x: tl.x, y: tl.y, width: side, height: side };
    }

    /**
     * Pose une Scene Region rectangulaire, partagée à tous les observateurs.
     * Préfère `canvas.regions.placeRegion` (dnd4e) ; retombe sur la création
     * native d'un document Region.
     *
     * @param {{x:number, y:number, width:number, height:number}} rectangle Footprint pixel
     * @param {Object} [options]
     * @param {string} [options.name='Area of Effect'] Nom de la région
     * @param {number} [options.color=0x33aaff] Couleur d'affichage
     * @returns {Promise<RegionDocument>} Le document Region créé
     */
    static async placeAreaRegion(rectangle, options = {}) {
        const { name = 'Area of Effect', color = 0x33aaff } = options;

        const regionData = {
            name,
            color,
            visibility: CONST.REGION_VISIBILITY.OBSERVER,
            shapes: [{
                type: 'rectangle',
                x: rectangle.x,
                y: rectangle.y,
                width: rectangle.width,
                height: rectangle.height,
                rotation: 0,
                hole: false
            }]
        };

        if (typeof canvas.regions?.placeRegion === 'function') {
            return canvas.regions.placeRegion(regionData, {});
        }
        const [doc] = await canvas.scene.createEmbeddedDocuments('Region', [regionData]);
        return doc;
    }
```

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check src/scripts/scene.js`
Expected: exit 0.

- [ ] **Step 4: Vérification manuelle in-Foundry**

Console, token contrôlé :
```javascript
const o = canvas.tokens.controlled[0].center;
const rect = Scene4e.areaRectangle(o, 'rangeBurst', 3);  // carré 7×7 cases centré
const region = await Scene4e.placeAreaRegion(rect, { name: 'Test Burst' });
// une région carrée translucide apparaît, visible des observateurs
await region.delete();                                    // nettoyage
```
Expected : rectangle 7×7 cases centré sur le token, partagé. Confirmer la visibilité côté joueur (un compte non-MJ voit la région).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/scene.js
git commit -m "feat(scene): area footprint + shared Region placement (placeAreaRegion/areaRectangle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.2 : `.place()` — pose la Region (partagée) et renvoie les `Character[]` couverts

Mode aire. Si l'aire a une portée (`areaBurst().within(r)`), on choisit d'abord un point (Portal) ; sinon (`closeBurst`/`closeBlast`) l'aire est ancrée au lanceur. On pose une Region partagée (visuel pour tous), auto-nettoyée après un délai, et on renvoie les cibles via **le même chemin que `get()`** (cohérence affichage/validation).

**Files:**
- Modify: `src/scripts/target.js`

**Interfaces:**
- Consumes : `this.pickPoint` (Task 2.2), `Scene4e.areaRectangle`/`placeAreaRegion` (Task 4.1), `this.get()`, `this._dnd4eRangeType`, `this._radius`, `this._range`.
- Produces :
  - `place(opts?: { icon?: string, lifetime?: number }): Promise<Character[]>` — cibles couvertes par l'aire ; `[]` si la sélection du point est annulée.

- [ ] **Step 1: Ajouter `place()` après `pick()`**

```javascript
    /**
     * Mode aire : pose une Scene Region carrée (partagée à tous), puis renvoie
     * les Character couverts par l'aire — dérivés par le même chemin que get()
     * (jamais de token/actor brut). La région est auto-retirée après `lifetime` ms.
     *
     * - areaBurst(n).within(r) : choisit d'abord un point dans la portée.
     * - closeBurst(n) / closeBlast(x) : aire ancrée au lanceur.
     *
     * @param {Object} [opts]
     * @param {string} [opts.icon] Icône du curseur pour la sélection de point
     * @param {number} [opts.lifetime=6000] Durée d'affichage de la région (ms)
     * @returns {Promise<Character[]>} Les cibles couvertes, ou [] si annulé
     */
    async place({ icon, lifetime = 6000 } = {}) {
        if (!this._dnd4eRangeType) throw Error('place() requires an area verb (closeBurst/areaBurst/closeBlast)');

        // 1. Déterminer le point d'ancrage de l'aire.
        let anchor;
        if (this._range > 0) {
            const point = await this.pickPoint(icon); // areaBurst().within(r)
            if (!point) return [];
            anchor = point.origin;
            this._origins = [anchor]; // get() collecte autour du point choisi
        } else {
            anchor = this._origins[0]; // closeBurst / closeBlast : ancré au lanceur
        }

        // 2. Poser la Region partagée (visuel pour tous), auto-nettoyée.
        const rect = Scene4e.areaRectangle(anchor, this._dnd4eRangeType, this._radius);
        const region = await Scene4e.placeAreaRegion(rect);
        setTimeout(() => region?.delete?.(), lifetime);

        // 3. Renvoyer les cibles via le même chemin que get().
        return this.get();
    }
```

> **Note de cohérence** : `get()` filtre par `this._radius` et `this._origins`. En mode aire avec portée, `_origins` est réassigné au point choisi (étape 1) ; le rayon utilisé par `get()` est `_radius` (le n du burst). La région posée (`areaRectangle(..., _radius)`) et la collecte `get()` partagent donc le même rayon → zone affichée == zone ciblée. La case exacte du point d'ancrage est exclue par `Scene4e.isWithin` (comportement déjà en place dans l'ancien Thunderclap), comportement assumé.

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Console, token contrôlé + plusieurs créatures groupées ailleurs sur la carte :
```javascript
const c = Character.fromActor(canvas.tokens.controlled[0].actor);
const hit = await Target.fromCharacter(c).areaBurst(3).within(20).type('creatures').place();
console.log(hit.map(x => x.name));
```
Expected : crosshair pour choisir un point dans 20 cases ; une région carrée 7×7 apparaît au point (vue de tous) ; renvoie les `Character` dans le burst ; la région disparaît après ~6 s. Tester aussi `closeBurst(1).type('allies').place()` (ancré au lanceur, sans pick).

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): place() — shared Region area, returns covered Character[] via get() path

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.3 : `Target.fromItem(item)` — hydratation optionnelle de la géométrie

Commodité : construit un `Target` depuis le lanceur de l'item et hydrate la forme depuis `system.rangeType` / `system.area` quand le pouvoir les déclare. L'API fluente reste maître (les verbes explicites priment si appelés ensuite).

**Files:**
- Modify: `src/scripts/target.js`

**Interfaces:**
- Consumes : `Target.fromCharacter`, `Character.fromActor`, mapping rangeType→verbe, `item.system.rangeType`, `item.system.area`, `item.system.range`.
- Produces : `Target.fromItem(item: Item): Target` — Target hydraté (forme + dimensions) depuis l'item.

- [ ] **Step 1: Ajouter la factory `fromItem` après `fromCoordinates`**

```javascript
    /**
     * Construit un Target depuis un item, en hydratant la géométrie depuis
     * `system.rangeType`/`system.area`/`system.range` quand disponibles.
     * Commodité : les verbes de forme appelés ensuite priment.
     *
     * @param {Item} item L'item du pouvoir (doit avoir un actor)
     * @returns {Target}
     */
    static fromItem(item) {
        const actor = item.actor ?? item.parent;
        if (!actor) throw Error('Target.fromItem requires an item with an actor');

        const target = Target.fromCharacter(Character.fromActor(actor));
        const sys = item.system ?? {};
        const area = Number(sys.area) || 0;
        const range = Number(sys.range) || 0;

        switch (sys.rangeType) {
            case 'melee':       return target.melee(range || 1);
            case 'range':
            case 'ranged':      return target.ranged(range);
            case 'closeBurst':  return target.closeBurst(area);
            case 'closeBlast':  return target.closeBlast(area);
            case 'rangeBurst':  return target.areaBurst(area).within(range);
            case 'rangeBlast':  return target.closeBlast(area).within(range);
            default:            return target;
        }
    }
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/target.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Console, sur un pouvoir d'aire (ex. ouvrir la fiche, récupérer l'item) :
```javascript
const item = actor.items.getName('Thunderclap'); // ou tout pouvoir Area burst
const t = Target.fromItem(item);
console.log(t._dnd4eRangeType, t._radius, t._range); // 'rangeBurst', 3, 20 (selon l'item)
```
Expected : la forme et les dimensions reflètent `system.rangeType`/`area`/`range` de l'item.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "feat(target): Target.fromItem() — optional geometry hydration from item

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5 — Migration des pouvoirs + retrait de l'ancienne API

> Migration AVANT retrait pour éviter une fenêtre cassée. Le retrait final (Task 5.7) supprime `selectTarget`/`selectCharacters`.

### Task 5.1 : Migrer `paladin/lay_on_hands.js` (mode ciblé, 1 allié)

**Files:**
- Modify: `src/scripts/powers/paladin/lay_on_hands.js`

- [ ] **Step 1: Remplacer la sélection**

Remplacer :
```javascript
    const targets = await Target.fromCharacter(paladin).range(1).type('allies').selectCharacters(ref.item.img);

    if (!targets.length && targets.length !== 1) return;
```
par :
```javascript
    const targets = await Target.fromCharacter(paladin).melee(1).type('allies').pick({ count: 1 });

    if (targets.length !== 1) return;
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check src/scripts/powers/paladin/lay_on_hands.js`
Expected: exit 0.

- [ ] **Step 3: Vérification manuelle in-Foundry**

Déclencher Lay on Hands : sélection native d'un allié adjacent (marqueur + compteur 1/1, auto-résolution), soin appliqué, message de chat correct.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/powers/paladin/lay_on_hands.js
git commit -m "refactor(lay_on_hands): migrate to Target.melee().pick()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.2 : Migrer `grund/healing_spirit.js` (mode ciblé + closeBurst)

**Files:**
- Modify: `src/scripts/powers/grund/healing_spirit.js`

- [ ] **Step 1: Migrer la sélection principale (`applyMainHeal`)**

Remplacer :
```javascript
    const targets = await Target.fromCharacter(grund).range(5).selectCharacters(item.img);
```
par :
```javascript
    const targets = await Target.fromCharacter(grund).ranged(5).pick({ count: 1 });
```

- [ ] **Step 2: Migrer l'aire autour de l'esprit (`applyTempHealingToSpiritAdjacentTokens`)**

Remplacer :
```javascript
    const adjacents = Target.fromCharacter(spirit).radius(1).type('allies').get();
```
par :
```javascript
    const adjacents = Target.fromCharacter(spirit).closeBurst(1).type('allies').get();
```

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check src/scripts/powers/grund/healing_spirit.js`
Expected: exit 0.

- [ ] **Step 4: Vérification manuelle in-Foundry**

Healing Spirit : sélection native d'une cible à 5 cases, soin appliqué. (Le bloc temp-heal reste commenté comme à l'origine ; vérifier seulement que `closeBurst(1).get()` renvoie les bons alliés via console si besoin.)

- [ ] **Step 5: Commit**

```bash
git add src/scripts/powers/grund/healing_spirit.js
git commit -m "refactor(healing_spirit): migrate to ranged().pick() + closeBurst().get()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.3 : Migrer `lightning_fury/furious_bolts.js` (chaîne, mode ciblé)

**Files:**
- Modify: `src/scripts/powers/lightning_fury/furious_bolts.js`

- [ ] **Step 1: Migrer la sélection primaire**

Remplacer :
```javascript
    const primarySel = await Target.fromCharacter(caster)
        .range(20).type('enemies')
        .selectCharacters({ count: 1, icon: item.img });
```
par :
```javascript
    const primarySel = await Target.fromCharacter(caster)
        .ranged(20).type('enemies')
        .pick({ count: 1 });
```

- [ ] **Step 2: Migrer la sélection de chaîne secondaire**

Remplacer le bloc `candidates` + `sel` :
```javascript
        const candidates = Target.fromCharacter(origin)
            .range(10).type('enemies').get()
            .filter(t => !attacked.has(t.id));
        if (candidates.length === 0) break;

        const sel = await Target.fromCharacter(origin)
            .range(10).type('enemies')
            .selectCharacters({ count: 1, icon: item.img });
        if (!sel.length) break;
```
par :
```javascript
        const candidates = Target.fromCharacter(origin)
            .ranged(10).type('enemies').get()
            .filter(t => !attacked.has(t.id));
        if (candidates.length === 0) break;

        const sel = await Target.fromCharacter(origin)
            .ranged(10).type('enemies')
            .pick({ count: 1 });
        if (!sel.length) break;
```

- [ ] **Step 3: Vérifier la syntaxe**

Run: `node --check src/scripts/powers/lightning_fury/furious_bolts.js`
Expected: exit 0.

- [ ] **Step 4: Vérification manuelle in-Foundry**

Furious Bolts : attaque primaire (sélection native 1 cible à 20), puis chaîne secondaire (sélection native à 10 depuis la dernière cible), beam lightning entre maillons, buff +N appliqué. Vérifier qu'une cible déjà frappée est exclue des candidats.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/powers/lightning_fury/furious_bolts.js
git commit -m "refactor(furious_bolts): migrate chain selection to ranged().pick()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.4 : Migrer `avenger/leading_step.js` (mode ciblé + 2 points de téléport)

**Files:**
- Modify: `src/scripts/powers/avenger/leading_step.js`

- [ ] **Step 1: Migrer la sélection de l'ennemi déclencheur**

Remplacer :
```javascript
        const [selected] = await Target.fromCharacter(avenger)
            .range(1)
            .type('enemies')
            .selectCharacters(item.img);
```
par :
```javascript
        const [selected] = await Target.fromCharacter(avenger)
            .melee(1)
            .type('enemies')
            .pick({ count: 1 });
```

- [ ] **Step 2: Migrer la destination de l'avenger (mode point)**

Remplacer :
```javascript
    const avengerDestination = await Target.fromCharacter(avenger)
        .range(5)
        .selectTarget(item.img);
```
par :
```javascript
    const avengerDestination = await Target.fromCharacter(avenger)
        .ranged(5)
        .pickPoint(item.img);
```

- [ ] **Step 3: Migrer la destination de l'ennemi (mode point)**

Remplacer :
```javascript
    const enemyDestination = await Target.fromCharacter(avenger)
        .range(1)
        .selectTarget(item.img);
```
par :
```javascript
    const enemyDestination = await Target.fromCharacter(avenger)
        .melee(1)
        .pickPoint(item.img);
```

- [ ] **Step 4: Vérifier la syntaxe**

Run: `node --check src/scripts/powers/avenger/leading_step.js`
Expected: exit 0.

- [ ] **Step 5: Vérification manuelle in-Foundry**

Leading Step (avec ≥2 ennemis adjacents pour forcer la sélection) : choix de l'ennemi (ciblé), téléport de l'avenger (point à 5), téléport de l'ennemi vers une case adjacente (point à 1), VFX et messages corrects. `.origin` des points alimente bien `VFX4e.teleport`.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/powers/avenger/leading_step.js
git commit -m "refactor(leading_step): migrate to melee/ranged().pick() + pickPoint()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.5 : Migrer les pouvoirs de téléport pur (mode point)

`paladin/winter_arrival.js`, `talaerin/fey_step.js`, `talaerin/spatial_trip.js` : un seul `selectTarget` de destination chacun.

**Files:**
- Modify: `src/scripts/powers/paladin/winter_arrival.js`
- Modify: `src/scripts/powers/talaerin/fey_step.js`
- Modify: `src/scripts/powers/talaerin/spatial_trip.js`

- [ ] **Step 1: `winter_arrival.js`**

Remplacer :
```javascript
    const targetLocation = await Target.fromCharacter(paladin)
        .range(teleportRange)
        .selectTarget(ref.item.img);
```
par :
```javascript
    const targetLocation = await Target.fromCharacter(paladin)
        .ranged(teleportRange)
        .pickPoint(ref.item.img);
```

- [ ] **Step 2: `fey_step.js`**

Remplacer :
```javascript
const target = await Target.fromCharacter(talaerin).range(5).selectTarget(this.item.img);
```
par :
```javascript
const target = await Target.fromCharacter(talaerin).ranged(5).pickPoint(this.item.img);
```

- [ ] **Step 3: `spatial_trip.js`**

Remplacer :
```javascript
const target = await Target.fromCharacter(talaerin).range(3).selectTarget(this.item.img);
```
par :
```javascript
const target = await Target.fromCharacter(talaerin).ranged(3).pickPoint(this.item.img);
```

- [ ] **Step 4: Vérifier la syntaxe des trois fichiers**

Run: `node --check src/scripts/powers/paladin/winter_arrival.js && node --check src/scripts/powers/talaerin/fey_step.js && node --check src/scripts/powers/talaerin/spatial_trip.js`
Expected: exit 0.

- [ ] **Step 5: Vérification manuelle in-Foundry**

Chaque pouvoir : crosshair de destination dans la portée, refus hors portée, téléport joué avec `.origin`. Winter's Arrival : la vérification d'ennemi marqué adjacent utilise toujours `targetLocation.origin.x/y` — OK car `pickPoint` renvoie un Target avec `.origin`.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/powers/paladin/winter_arrival.js src/scripts/powers/talaerin/fey_step.js src/scripts/powers/talaerin/spatial_trip.js
git commit -m "refactor(teleports): migrate winter_arrival/fey_step/spatial_trip to pickPoint()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.6 : Migrer les pouvoirs d'aire (`thunderclap.js`, `horgrim/kerymwael_teleport_assault.js`)

**Files:**
- Modify: `src/scripts/powers/thunderclap.js`
- Modify: `src/scripts/powers/horgrim/kerymwael_teleport_assault.js`

- [ ] **Step 1: `thunderclap.js` — fusionner point + radius en `.place()`**

Remplacer les Step 1 et Step 2 (sélection du point puis collecte du burst) :
```javascript
    // Step 1: Select area target (burst 3 within 20)
    const targetLocation = await Target.fromCharacter(caster)
        .range(20)
        .selectTarget(item.img);

    if (!targetLocation) {
        return; // User cancelled
    }

    // Step 2: Get all creatures in the burst area
    const targets = Target.fromCoordinates(targetLocation.x, targetLocation.y)
        .radius(3)
        .type('creatures')
        .get();

    if (targets.length === 0) {
        await Chat4e.power(caster, 'Thunderclap', 'No creatures in the area of effect.');
        return;
    }
```
par :
```javascript
    // Step 1+2: Area burst 3 within 20 — pose la Region partagée et renvoie les cibles
    const targets = await Target.fromCharacter(caster)
        .areaBurst(3)
        .within(20)
        .type('creatures')
        .place({ icon: item.img });

    if (targets.length === 0) {
        await Chat4e.power(caster, 'Thunderclap', 'No creatures in the area of effect.');
        return;
    }
```

> **Note** : l'ancien code utilisait `targetLocation.x/y` plus bas pour le VFX d'aire (Step 5). Comme `.place()` ne renvoie plus la coordonnée, remplacer le VFX d'impact centré sur le point par un VFX centré sur la première cible, ou retirer ce VFX d'aire centré. Voir Step 2.

- [ ] **Step 2: `thunderclap.js` — adapter le VFX d'aire (plus de `targetLocation`)**

Remplacer le bloc Step 5 :
```javascript
    // Step 5: Area effect visual
    await VFX4e.custom(
        'jb2a.impact.004.blue',
        { x: targetLocation.x, y: targetLocation.y },
        { 
            scale: 3.0, // Scale for burst 3 area
            fadeIn: 200,
            duration: 800
        }
    );
```
par :
```javascript
    // Step 5: Area effect visual — centré sur la première cible touchée
    if (targets[0]) {
        await VFX4e.custom(
            'jb2a.impact.004.blue',
            targets[0].token,
            { scale: 3.0, fadeIn: 200, duration: 800 }
        );
    }
```

- [ ] **Step 3: `kerymwael_teleport_assault.js` — corriger l'ordre `.get().type()` et migrer**

Remplacer :
```javascript
    const target = await Target.fromCharacter(horgrim).range(5).selectTarget(item.img);

    console.log(item);

    if (!target) return;
```
puis plus bas :
```javascript
    const characters = target.radius(1).get().type('enemies');
```
par une sélection d'aire unique. Remplacer **les deux** blocs ci-dessus par :
```javascript
    const characters = await Target.fromCharacter(horgrim)
        .areaBurst(1)
        .within(5)
        .type('enemies')
        .place({ icon: item.img });

    if (!characters.length) return;
```
(Cela corrige le bug `.get().type()` — l'ancien appelait `.type()` sur un tableau. `.place()` applique le type avant la collecte.)

- [ ] **Step 4: Vérifier la syntaxe**

Run: `node --check src/scripts/powers/thunderclap.js && node --check src/scripts/powers/horgrim/kerymwael_teleport_assault.js`
Expected: exit 0.

- [ ] **Step 5: Vérification manuelle in-Foundry**

- Thunderclap : crosshair point dans 20, Region carrée 7×7 partagée, attaques sur toutes les créatures du burst, VFX d'impact, message de synthèse.
- Kerymwael : point dans 5, Region 3×3 (burst 1), ennemis ciblés, Mark appliqué (`characters.map(t => t.id)`). Vérifier que `User4e.updateTargets(characters)` reçoit bien des `Character`.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/powers/thunderclap.js src/scripts/powers/horgrim/kerymwael_teleport_assault.js
git commit -m "refactor(areas): migrate thunderclap + kerymwael to areaBurst().within().place()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.7 : Retirer l'ancienne API (`selectTarget` / `selectCharacters`)

**Files:**
- Modify: `src/scripts/target.js`

- [ ] **Step 1: Confirmer qu'aucun appelant ne subsiste**

Run: `grep -rn "selectTarget\|selectCharacters" src/`
Expected: uniquement les définitions dans `src/scripts/target.js`. Si un pouvoir ressort, le migrer (Phase 5) avant de continuer.

- [ ] **Step 2: Supprimer les méthodes `selectTarget` et `selectCharacters`**

Dans `src/scripts/target.js`, supprimer intégralement les deux méthodes `async selectTarget(icon) { … }` et `async selectCharacters({ count = 1, icon } = {}) { … }` (la logique Portal utile a été reportée dans `pickPoint`).

- [ ] **Step 3: Vérifier la syntaxe + l'absence de référence**

Run: `node --check src/scripts/target.js && grep -rn "selectTarget\|selectCharacters" src/`
Expected: `node --check` exit 0 ; `grep` ne renvoie plus rien.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/target.js
git commit -m "refactor(target): remove legacy selectTarget/selectCharacters (no backward compat)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.8 : Mettre à jour CLAUDE.md (doc de l'API Target)

**Files:**
- Modify: `CLAUDE.md` (section « Target » et exemples de pouvoirs utilisant `selectTarget`/`selectCharacters`)

- [ ] **Step 1: Mettre à jour la description de la classe `Target`**

Dans `CLAUDE.md`, section `4. **Target**`, remplacer la liste des méthodes interactives (`selectTarget`/`selectCharacters`) par les nouveaux verbes :
- Verbes de forme : `melee(reach)`, `ranged(r)`, `closeBurst(n)`, `areaBurst(n).within(r)`, `closeBlast(x)`.
- Verbes terminaux : `.get()` (aucune UI), `.pick({count})` (ciblé, privé, marqueurs + compteur X/N), `.place()` (aire, partagée via Scene Region), `.pickPoint()` (point privé).
- Factory : `Target.fromItem(item)` (hydratation optionnelle).

- [ ] **Step 2: Mettre à jour les exemples de pouvoirs**

Remplacer dans les blocs d'exemple toute occurrence de `.range(...).selectTarget(...)` par `.ranged(...).pickPoint(...)` et `.selectCharacters({count, icon})` par `.pick({count})`, conformément aux migrations Phase 5.

- [ ] **Step 3: Vérifier qu'aucun exemple ne référence l'ancienne API**

Run: `grep -n "selectTarget\|selectCharacters" CLAUDE.md`
Expected: aucun résultat.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Target API (form/terminal verbs, fromItem) in CLAUDE.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Récapitulatif des verbes (référence rapide)

| Verbe de forme | `_range` | `_radius` | `_dnd4eRangeType` |
|---|---|---|---|
| `melee(reach=1)` | reach | 0 | null |
| `ranged(r)` | r | 0 | null |
| `closeBurst(n)` | 0 | n | `closeBurst` |
| `areaBurst(n).within(r)` | r | n | `rangeBurst` |
| `closeBlast(x)` | 0 | x | `closeBlast` |

| Verbe terminal | Interaction | Visibilité | Retour |
|---|---|---|---|
| `.get()` | aucune | — | `Character[]` |
| `.pick({count})` | ciblage natif + marqueurs + X/N | privé | `Character[]` |
| `.place({icon})` | (point si `within`) + Region | partagé | `Character[]` |
| `.pickPoint(icon)` | crosshair Portal | privé | `Target\|null` |
