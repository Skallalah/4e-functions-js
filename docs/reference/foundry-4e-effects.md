Active Effects are a core part of Foundry that can be used to apply bonuses, penalties, and other changes to a creature's base attributes (see the [https://foundryvtt.com/article/active-effects/ Foundry Documentation] for a detailed explanation). In simple terms, an Active Effect lets you create a list of modifications, which include a '''key''' (a text string referring to one of the character's attributes) and a '''value''' the system should apply to that attribute.

Active Effects are a powerful tool, but are quite technical and are not always obvious; once you start getting into them, you may be in for a lot of work. And by virtue of 4e system licensing, we can't provide the vast majority of game elements, including their pre-programmed effects. Active Effects give most of their benefit in automating common bonuses, and temporary bonuses/penalties that are used frequently during play.

If you're mostly interested in permanent/passive bonuses, '''it is entirely possible to ignore Active Effects entirely'''. The sheet has ways you can manually enter bonuses with full text descriptions for all of your character's attributes, and power/weapon effects can be replaced by adding the relevant bonus to the power or weapon formula.

<span id="active-effect-basics"></span>
== Active Effect Basics ==

You can create a Active Effect directly on a character in the Effects tab, but most often you will want to create them on a character &quot;item&quot; (Foundry's collective term for game elements like feats, features, and magic items). This allows you to have a permanent/passive bonus that is automatically granted to a character when the item is added to their sheet, and removed when the item is removed. (For gear, it can also be suppressed while the item is unequipped.)

* '''Example:''' Steve, The Example Character has a whole set of example effects adding bonuses to account for his class, race and feat selection.

You can also create Active Effects on powers, allowing them to be applied when the power is used. When you do this, you can also select which creatures should be affected, and set a duration so the effect is removed automatically based on turns passing, or on a saving throw. Using Active Effects in this way you can create a wide range of temporary bonuses and penalties that are so common in 4e powers.

<span id="formulae-and-variables"></span>
=== Formulae and Variables ===

Modifiers in an Active Effect can use mathematical formulae to calculate their value, including some JavaScript math functions like <code>floor</code> and <code>min</code>/<code>max</code>. They can also use <code>@variables</code> that refer to the actor's data. When the formula is evaluated, any variables (denoted by an @ symbol) will first be replaced with the corresponding value from the actor.

* '''Example:''' Steve's fighter class features uses <code>@level</code> to calculate his hit points (among others)

You can see [https://github.com/EndlesNights/dnd4eBeta/wiki/Character-Variables-for-Use-in-Formulae Character Variables for Use in Formulae] for a list of useful variables. Modifiers can also set or reference custom <code>@variables</code>, allowing the adventurous to create even more complex effects.

<span id="scale-function"></span>
==== Scale Function ====

The <code>scale()</code> function is used to create common 4e pattern of 1 per five character levels, optionally offset by a given value. Usage is as below:

<code>scale(@lvl, offset)</code>

To get the default scale, replace <code>offset</code> with 1. To start the scale at a higher level, increase the value accordingly (eg. using <code>4</code> returns 1 at level 4, 2 at level 9, etc).

Note that this replaces the <code>@scale</code> variable used in earlier system versions.

<span id="solidified-variables"></span>
==== Solidified Variables ====

'''⚠️ This information is only relevant to system versions lower than 0.8. After v0.8, solidify is unnecessary; variables will always use the source actor by default.'''

Note that variables always refer to the actor ''to which the effect is currently applied''. For effects that are applied by one actor to another (for example, a cleric who grants another character a bonus equal to their wisdom modifier) you might need to reference a variable on the originating character instead.

For effects like this, you can use the <code>solidify</code> wrapper to tell the system that the variable needs to be replaced ''before'' the receiving actor gets the effect, so it retains the value from the originating actor.

To use solidify, just wrap an existing variable like so: <code>$solidify(@variableName)</code>.

<span id="conditional-effects"></span>
=== Conditional Effects ===

Sometimes you might want to create a temporary or passive effect that only grants its modifiers under certain conditions. This option unfortunately isn't available in the system, without using macros or specialised modules.

However, there is a viable workaround for one common use case, a numerical modifier that is only active while the creature is bloodied. To achieve this, you can multiply the desired value by the <code>@bloodied</code> variable; this will result in the original value while the character is bloodied, but a 0 value otherwise.

<span id="standard-versus-custom-4e-modifiers"></span>
=== &quot;Standard&quot; Versus &quot;Custom 4e&quot; Modifiers ===

Active Effects in Foundry core let you target most values that are stored in a character's data; things like hit points, defences, damage resistances, and so forth. Referred to here as &quot;standard&quot; or &quot;core&quot;, these are also available in 4e, and function exactly as they would in any other Foundry game.

However, the 4e system also has unique code that lets you target properties in attacks/powers as you use them. This allows for many common 4e effects—e.g. +2 dmg on melee attacks, +1 hit with light blades, +2 fire damage—that would not be possible under Foundry Core. We refer to these as &quot;custom 4e&quot; modifiers.

You use the Active Effects interface to configure both types of modifiers, and you can mix and match both types of modifiers in one Active Effect if you wish. However, the two types are applied in very different ways, so they have their own behaviours. They also have different sets of &quot;keys&quot;—the text strings you need to enter to target the desired property to be modified. Details and common keys for each type are provided below.

⚠️''We highly recommended you install Autocomplete Inline Properties (with integration support from Drac's Foundry 4e Tools) if using Active Effects; it supports all of the attributes on the actors, and all of the possible weapon and damage properties. See [https://github.com/EndlesNights/dnd4eBeta/wiki/Module-Integrations Module Integrations] for details.''

⚠️'''''Keys/variables used in active effects are always Case-Sensitive.''' Your input must match the capitalisation specified. If your effect is not working, this probably the first thing to check.''

== Standard Foundry Modifiers ==

The basics of standard modifiers are:

* They apply to values in the character's permanent data, ''not'' values that only exist in the context of a power/attack.
* They ''do'' respect the &quot;change mode&quot; setting.
* They ''do not'' inherently understand 4e stacking rules.

Standard modifiers can affect most of the attributes of your character, and you can use the &quot;change mode&quot; setting to determine how they should (or should not) stack. However, they have no inherent awareness of 4e's bonus typing; they just apply according to their change mode. To compensate for this, the 4e system provides bonus types appended to most available attribute keys, denoted by <code>​[bonustype]</code> in the table. [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#bonus-typing Bonus Typing] and [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#change-mode-and-priority Change Mode and Priority] are discussed in more detail below.

Note that keys are case-sensitive; if a key is not working as expected, check that your capitalisation matches the table.

<span id="valid-attributes-and-keys"></span>
=== Valid Attributes and Keys ===

{| class="wikitable"
|+ Attributes for Standard Foundry Effects
|-
! style="width: 8em"| '''Roughly What'''
! '''Key'''
! '''Details'''
|-
| Hit points
| <code>system.​attributes.​hp.​starting</code>
| Starting hit points (CON added automatically).<br />
Change mode for this should be Override
|-
|
| <code>system.​attributes.​hp.​perlevel</code>
| Hit points gained per level<br />
Change mode for this should be Override
|-
|
| <code>system.​attributes.​hp.​autototal</code>
| Auto Calculate Hit points using starting, per level and bonus.<br />
Change mode for this should be Override
|-
|
| <code>system.​attributes.​hp.​[bonustype]</code>
| Bonus Hit points, e.​g.​ from a feat.​ '''(WARNING*)'''
|-
| Healing Surges
| <code>system.​details.​surges.​[bonustype]</code>
| Surges per day
|-
|
| <code>system.​details.​surgeBon.[bonustype]</code>
| Healing surge value
|-
|
| <code>system.​details.secondwindbon.[bonustype]</code>
| Bonus HP recovered when using Second Wind
|-
| Defences
| <code>system.​defences.ac.​[bonustype]</code>
| Armour Class
|-
|
| <code>system.​defences.​fort.​[bonustype]</code>
| Fortitude Defence
|-
|
| <code>system.​defences.​ref.​[bonustype]</code>
| Reflex Defence
|-
|
| <code>system.​defences.​wil.​​[bonustype]</code>
| Will Defence
|-
| Saving Throws
| <code>system.​details.saves.​[bonustype]</code>
| Normal Saving Throws
|-
|
| <code>system.​details.deathsavebon.​[bonustype]</code>
| Death Saves
|-
| Movement
| <code>system.​movement.​base.​[bonustype]</code>
| Base movement speed (all others are derived based on this value)
|-
|
| <code>system.​movement.​walk.​[bonustype]</code>
| Walk (default) speed
|-
|
| <code>system.​movement.​run.​​[bonustype]</code>
| Run Speed
|-
|
| <code>system.​movement.​charge.​[bonustype]</code>
| Charge Speed
|-
|
| <code>system.​movement.​climb.​​[bonustype]</code>
| Climb Speed
|-
| Skill Checks
| <code>system.​skills.​acr.​​[bonustype]</code>
| Acrobatics
|-
|
| <code>system.​skills.​arc.​​[bonustype]</code>
| Arcana
|-
|
| <code>system.​skills.​ath.​[bonustype]</code>
| Athletics
|-
|
| <code>system.​skills.​blu.​[bonustype]</code>
| Bluff
|-
|
| <code>system.​skills.​dip.​[bonustype]</code>
| Diplomacy
|-
|
| <code>system.​skills.​dun.​​[bonustype]</code>
| Dungeoneering
|-
|
| <code>system.​skills.​end.​[bonustype]</code>
| Endurance
|-
|
| <code>system.​skills.​hea.​[bonustype]</code>
| Heal
|-
|
| <code>system.​skills.​his.​​[bonustype]</code>
| History
|-
|
| <code>system.​skills.​ins.​​[bonustype]</code>
| Insight
|-
|
| <code>system.​skills.​itm.​​[bonustype]</code>
| Intimidate
|-
|
| <code>system.​skills.​nat.​​[bonustype]</code>
| Nature
|-
|
| <code>system.​skills.​prc.​​[bonustype]</code>
| Perception
|-
|
| <code>system.​skills.​rel.​[bonustype]</code>
| Religion
|-
|
| <code>system.​skills.​stl.​​[bonustype]</code>
| Stealth
|-
|
| <code>system.​skills.​stw.​[bonustype]</code>
| Streetwise
|-
|
| <code>system.​skills.​thi.​[bonustype]</code>
| Thievery
|-
| Resistances
| <code>system.​resistances.​[type].​res</code>
| Resistance to the specified damage type**
|-
| Vulnerabilities
| <code>system.​resistances.​[type].vuln</code>
| Vulnerability to the specified damage type**
|-
| Initiative
| <code>system.​attributes.​init.​​[bonustype]</code>
| Initiative modifier
|-
| Global Modifiers
| <code>system.modifiers.attack.​[bonustype]</code>
| Global attack bonus
|-
|
| <code>system.modifiers.damage.​[bonustype]</code>
| Global damage bonus
|-
|
| <code>system.modifiers.skills.​[bonustype]</code>
| Global skill check bonus
|-
|
| <code>system.modifiers.defences.​[bonustype]</code>
| Global defence bonus
|-
|
| <code>system.details.saves.​[bonustype]</code>
| Global saving throw bonus
|-
| Common Situational Attack Modifiers
| <code>system.commonAttackBonuses.bloodied</code>
| Bonus to hit a bloodied target (default 0)
|-
|
| <code>system.commonAttackBonuses.comAdv</code>
| Bonus to hit with combat advantage (default 2)
|-
|
| <code>system.commonAttackBonuses.charge</code>
| Bonus to hit when charging (default 1)
|-
|
| <code>system.commonAttackBonuses.conceal</code>
| Penalty to hit a target with concealment target (default -2)
|-
|
| <code>system.commonAttackBonuses.concealTotal</code>
| Penalty to hit a target with total concealment (default -5)
|-
|
| <code>system.commonAttackBonuses.cover</code>
| Penalty to hit a target with cover (default -2)
|-
|
| <code>system.commonAttackBonuses.coverSup</code>
| Penalty to hit a target with superior cover (default -5)
|-
|
| <code>system.commonAttackBonuses.longRange</code>
| Penalty to hit at long range (default -2)
|-
|
| <code>system.commonAttackBonuses.marked</code>
| Penalty to hit a while ignoring a mark (default -2)
|-
|
| <code>system.commonAttackBonuses.prone</code>
| Penalty to hit while prone (default -2)
|-
|
| <code>system.commonAttackBonuses.restrained</code>
| Penalty to hit while restrained (default -2)
|-
|
| <code>system.commonAttackBonuses.running</code>
| Penalty to hit while running (default -5)
|-
|
| <code>system.commonAttackBonuses.squeez</code>
| Penalty to hit while squeezing (default -5)
|-
| Marker
| <code>system.marker</code>
| UUID of the actor currently marking the creature (if any)
|-
! colspan="3"| '''*Bonus HP Warning:''' If you have an effect that modifies these with an ADD, it will repeatedly apply itself if you open and edit the misc bonus hit points via the Hit points Dialog on the sheet. We suggest you either process your hit point bonus using an effect, or by manually entering in the sheet, not both!
|-
! colspan="3"| '''**Damage types:''' See below for [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys a list of damage type keys]. You can also enter <code>ongoing</code> for ongoing damage, a special &quot;type&quot; that applies specifically to damage using the ongoing damage automation feature.
|}

=== Bonus Typing ===
Keys including <code>[bonustype]</code> above can specify 4e bonus types. You can use this to target a specific bonus type for that attribute (for example, <code>feat</code>) and combine it with the right change mode (<code>upgrade</code> for most bonus types, or <code>add</code> for untyped bonuses) to create effects that stack correctly by 4e rules.

Valid bonus keys for all properties are:

* <code>feat</code>
* <code>race</code>
* <code>item</code>
* <code>class</code>
* <code>power</code>
* <code>enhance</code>
* <code>untyped</code>

Defences can also use:

* <code>armour</code>
* <code>shield</code>

Unrecognised bonus types should not cause errors, but will be ignored by the target property. Keys without <code>[bonustype]</code> cannot use bonus type keys.

<span id="special-types"></span>
==== Special &quot;Types&quot; ====

Sometimes you might wish to apply a modifier to the final value after all bonus types are applied—common for untyped effects that override a value entirely or reduce/increase it to a specific value. For example, the Immobilised condition setting speed to 0, or the Slowed condition capping all movement speeds at 2.

In this case, there are a few special keys you can use in place of bonus type, that will create the correct behaviour.

{| class="wikitable"
|+ Special keys for Standard Foundry Effects
|-
! style="min-width: 6em"| '''Key'''
! '''Behaviour'''
|-
| <code>floor</code>
| Sets the minimum possible final value for the parent property; after normal bonus calculation, the final value will be set to <code>floor</code> if it would have been lower than <code>floor</code>.
|-
| <code>ceil</code>
| Sets the maximum possible final value for the parent property; after normal bonus calculation, the final value will be set to <code>ceil</code> if it would have been higher than <code>ceil</code>.<br />
<code>ceil</code> takes precedence over <code>floor</code>, because something has to have priority, and in 4e penalties ''tend'' to beat bonuses.
|-
| <code>absolute</code>
| Overrides the final value for the parent property; ignores ''all'' other modifiers, including effects, manually entered bonuses, and <code>ceil</code>/<code>floor</code>.
|}

These special keys are available for most actor values that can use 4e bonus types—so defences, inititiative, speed, skills, HP and surges, global modifiers, and so forth.

'''Damage Resistance/Vulnerability:''' Resistances and vulnerabilities do not use typed bonuses, instead using their own <code>res</code> and <code>vuln</code> keys; this means <code>ceil</code> and <code>floor</code> have no effect. However, as a special case, you ''can'' use the <code>absolute</code> key in place of <code>res</code>/<code>vuln</code> to set a single absolute value for a given damage type. This will result in vulnerability if the value is negative, or resistance if the value is positive.

=== Change Mode and Priority ===
Standard Foundry modifiers don't understand 4e bonus stacking rules, but you ''can'' use the &quot;change mode&quot; setting to create the correct behaviour for many bonuses/penalties. For example, using the &quot;upgrade&quot; mode allows you to create the correct &quot;highest only&quot; behaviour for most typed bonuses, and for damage resistance values.

However, sometimes you will need one modifier to take precedence over another. For example, if you have a &quot;reduce resistance by 5&quot; effect, you will need it to be applied ''after'' any effects using the &quot;upgrade&quot; mode. In this case, you can enter a value in the &quot;Priority&quot; field for the modifier.

The higher the priority value, the later the modifier will be processed. A modifier which doesn't have a priority specified is ordered based on its change mode, as below. You can use these defaults to position your effect between others as required.

{| class="wikitable" style="width:16em"
|-
! Change mode
! Default priority
|-
| Custom
| 0
|-
| Multiply
| 10
|-
| Add
| 20
|-
| Downgrade
| 30
|-
| Upgrade
| 40
|-
| Override
| 50
|}

'''Example:''' Our &quot;reduce resistance by 5&quot; effect uses &quot;add&quot; mode, which would normally have priority 20—too low to interact correctly with upgrade effects. Instead, you would assign it a priority higher than 40 (so it applies after any upgrades) but lower than 50 (so an override will still, well, ''override'' it).

The &quot;custom&quot; change mode allows for bespoke system-based processing of specific effects. Currently, this does nothing in the 4e system, though it may be used at a later date for the most unusual temporary effects. For now, you can ignore it!

'''Note:''' Change mode only matters in the context of the specific key you're using. If you have one bonus using the <code>feat</code> key and another using the <code>power</code> key, change mode will make no difference to how those two values interact.

== Custom 4e Modifiers ==

The basics of custom 4e modifiers are:

* They apply only to the properties of powers/attacks only.
* They ''do not'' respect the &quot;change mode&quot; setting.
* They ''do'' understand 4e stacking rules.

Custom 4e effects let you apply conditional modifiers to attack and/or damage based on the keywords, damage type, power source, weapon/implement and other properties included each time you use an attack or power.

'''THESE ONLY APPLY TO ATTACK ROLLS, DAMAGE ROLLS, AND EFFECT SAVES.''' This style of modifier cannot alter any other part of a creature.

They ''do not'' respect &quot;change mode&quot;, and treat all changes as &quot;add&quot; (while applying 4e bonus type stacking appropriately). However, they ''do'' respect whether an effect is set to &quot;enabled&quot; or &quot;disabled&quot;; only enabled effects will be counted.

<span id="valid-change-keys"></span>
=== Valid Change Keys ===

Change keys for custom 4e modifiers must fit the following pattern: <code>[Scope].[TargetValue].[Filter].[BonusType]</code>

# '''<code>[Scope]</code>''' selects which set of attributes we are checking our condition against.
# '''<code>[TargetValue]</code>''' selects the value we are actually looking to change with this effect.
# '''<code>[Filter]</code>''' is an attribute that the power/weapon/effect must have in order to qualify for this modifier.
# '''<code>[BonusType]</code>''' is the 4e bonus type of this modifier, which allows the system to apply the correct stacking rules when you have multiple modifiers active.

The four parts of the key are explained more thoroughly below.

<span id="scope"></span>
==== Scope ====

For a custom 4e modifier to work, the first part of the key ''must'' be one of the listed values, and must be lowercase. Any other value will prevent the system from recognising the modifier.

* <code>power</code> will check the attributes of the power used (e.g. keywords, damage types, defence targeted, etc.). Commonly used during attack and damage rolls.
* <code>weapon</code> will check the attributes of the weapon/implement used (e.g. weapon group, properties etc.). Commonly used during attack and damage rolls.
* <code>effect</code> will check the attributes of effects (e.g. keywords, status conditions). Commonly used during saving throws.
* <code>grants</code> will check the attributes of attacks ''against'' the creature, and apply the bonus to the attacker only in the context of that roll. Currently only works with attacks.

<span id="target-value"></span>
==== Target Value ====

The second part of the key ''must'' be one these of four values, and must be lowercase. Any other value will invalidate the effect.

* <code>attack</code> modifies the attack roll of matching powers/weapons used by the character
* <code>damage</code> modifies the damage roll of matching powers/weapons used by the character
* <code>defence</code> modifies the character's defence ''against'' matching powers/weapons
* <code>save</code> modifies the character's saving throw bonus ''against'' matching effects
* <code>saveDC</code> modifies the default saving throw DC matching effects created by the character

<span id="filter"></span>
==== Filter ====

The third part of the key must be a filter condition to match against the attributes of power or weapon; for example, a weapon group for weapons, a power source for powers, a status condition for effects, or a damage type for any scope. Weapons/powers/effects that don't match the criteria will not receive the modifer.

Note that the string must be the system's internal key, not the localised name. For a full list of available attributes, see the [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#scoped-attribute-keys Scoped Attribute Keys] and [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys Shared Damage Type Keys] sections.

<span id="compound-conditions"></span>
===== Compound Conditions =====

As of version 0.6.13, you can chain property values together to create a key with more than one condition (e.g. &quot;all weapons with which you are proficient&quot;). To do this, just repeat the <code>.[Filter]</code> fragment as many times as you need, including the period each time. You must still specify all other parts of the key.

<span id="special-attribute-global"></span>
===== Special Attribute: Global =====

The string <code>global</code> can also be used in place of a filter, when you wish to apply the bonus unconditionally within its scope. This is fairly rare for normal bonuses, but quite common in <code>grants</code> scope, and when using the <code>roll</code> type detailed in the next section.

'''Note that this should not be used for unconditional attack/damage bonus,''' except when <code>roll</code> is the bonus type (see below). Otherwise, global attack and damage modifiers are intended to be handled with standard Foundry effects, by using the built-in Global Modifiers character property (see [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#valid-attributes-and-keys Valid Attributes and Keys]).

<span id="bonus-type"></span>
==== Bonus Type ====

The final part of the key must be a bonus type. Due to Foundry's internal behaviours, a type must be provided even for modifiers with no specific type in the rules; therefore, typeless bonuses and penalties should use <code>untyped</code>.

As per 4e rules, the system will only apply the highest modifier of any given type to a roll or attribute, except for <code>untyped</code> modifiers; these will always stack, regardless of whether they are positive or negative. Therefore, all penalties should be <code>untyped</code>, to avoid being compared against a non-negative modifier and discarded.

While you must always provide a bonus type, there is no validation against the types specified in the 4e rules; you can use anything you like, with <code>untyped</code> and <code>roll</code> (see below) being the only ones that are treated any differently from the rest. If you're using Inline Autocomplete, the autocomplete list is populated with a selection of common bonus types for convenience.

<span id="special-type-roll"></span>
===== Special Type: Roll =====

The bonus type <code>roll</code> is a special type which allows the creation of dice-based bonus damage. This is usually called &quot;additional&quot; or &quot;extra&quot; damage in rules text; for example, a power might say &quot;your fire powers do an additional 1d6 damage until the end of your next turn&quot;.

This bonus type only works for keys targeting the <code>damage</code> value. The value must be a valid Foundry dice expression—for example:

* <code>1d6</code>
* <code>1d4+2</code>

Simple variables should work in roll formulae, but try to stay away from complex formulations, as these might be unpredictable in practice.

For a typed damage roll, you can also append one or more a damage types, such as:

* <code>1d6[fire]</code>
* <code>1d6[fire,radiant]</code>

<span id="example-modifiers"></span>
=== Example Modifiers ===

* Weapon Focus (Heavy Blade):<br />
<code>weapon.damage.bladeh.feat = @tier</code>
* Feat that gives untyped bonus to attack and damage rolls with fire powers:<br />
<code>power.attack.fire.untyped = 1</code> and <code>power.damage.fire.untyped = 1</code>
* Item that gives a scaling damage bonus on melee weapon attacks:<br />
<code>power.damage.meleeWeapon.item = @tier</code>
* Trait that gives a racial bonus to implement attack rolls:<br />
<code>power.damage.usesImplement.race = 1</code>
* Bonus to saving throws against enchantment effects:<br />
<code>effect.save.enchantment.untyped = 2</code>
* Compound key for a power bonus to attack rolls with offhand light blades:<br />
<code>weapon.attack.bladeL.off.power = 1</code>
* Additional 1d6 fire damage on melee attacks:<br />
<code>power.attack.melee.roll = 1d6[fire]</code>

They will show in formula when rolls are made as <code>@[BonusType]EffectBonus</code> e.g. <code>@FeatEffectBonus</code>. If you do not see one of these in the formula of a roll when you make it, then the effect has not been applied.

<span id="debugging"></span>
=== Debugging ===

There is a system configuration option that you can enable where the effect application will log a lot of information to the console whenever you roll attack or damage so you can debug why a value is being applied (or not).

=== Scoped Attribute Keys ===

This section contains several groups of keywords organised by the scope in which they are used. Some attributes are also shared between scopes as noted.

In addition to these scoped attributes, all custom 4e modifiers can use [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys Shared Damage Type Keys].

Note that the <code>grants</code> scope is a special case, with no specific keys of its own. Instead, it inherits keys from the other scopes that it mimics. Currently this is only attacks, so that effectively translates to keys mentioned in the ''Weapon/Implement'' and ''Power'' sections below, including shared keys (and, of course, <code>global</code>).

<span id="note-weaponimplement-vs.-power-keys"></span>
==== Note: Weapon/Implement vs. Power Keys ====

While some attributes (such as damage types and range) may be valid for both power-based and weapon-based keys, they are not always equivalent. Power-based keys look at the power's keywords and properties, not those of the equipped weapon/implement. For example, while the &quot;imp&quot; key given in the Weapon Properties table will apply whenever the equipped weapon is an implement, the &quot;usesImplement&quot; key in the Power Required Tool table will only apply if the power itself has the implement keyword.

For these keys, the equipped weapon's values are checked only for powers with &quot;melee or ranged weapon&quot; tool usage, where the power determines its keywords based on the actual weapon used.

Similarly, because custom 4e modifiers are only applied to attacks and damage rolls, they have access to all the Power and Weapon <code>@variables</code> as well as the actor ones. Be cautious if you choopse to use these, as it may sometimes be ambiguous which set of values you are trying to access.

'''Note:''' Since damage type is inherited when the power/weapon is configured, the power-based keys ''do'' include the weapon's damage type (assuming the weapon is configured with a damage type override).

<span id="weaponimplement-attributes"></span>
==== Weapon/Implement Attributes ====

The attributes below are specific to the <code>weapon</code> scope. Due to inheritance, most can be used in <code>power</code> scope too (and therefore in <code>grants</code>), with the exceptions noted above.

The <code>weapon</code> scope can also use [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys Shared Damage Type Keys].

{| class="wikitable" style="width:auto;max-width:30em"
|+ Weapon Group
|-
! Modifier Key
! Weapon Group
|-
| <code>axe</code>
| Axe
|-
| <code>blowgun</code>
| Blowgun
|-
| <code>bow</code>
| Bow
|-
| <code>cbow</code>
| Cross Bow
|-
| <code>dragon</code>
| Dragon Shard
|-
| <code>flail</code>
| Flail
|-
| <code>garrote</code>
| Garrote
|-
| <code>ham</code>
| Hammer
|-
| <code>bladeH</code>
| Heavy Blade
|-
| <code>bladeL</code>
| Light Blade
|-
| <code>mace</code>
| Mace
|-
| <code>pik</code>
| Pick
|-
| <code>pole</code>
| Polearm
|-
| <code>sling</code>
| Sling
|-
| <code>spear</code>
| Spear
|-
| <code>staff</code>
| Staff
|-
| <code>unarm</code>
| Unarmed
|-
| <code>whip</code>
| Whip
|}

{| class="wikitable" style="width:auto;max-width:30em"
|+ Implement Type
|-
! Modifier Key
! Implement Type
|-
| <code>holyS</code>
| Holy Symbol
|-
| <code>ki</code>
| Ki Focus
|-
| <code>orb</code>
| Orb
|-
| <code>rod</code>
| Rod
|-
| <code>staff</code>
| Staff
|-
| <code>tome</code>
| Tome
|-
| <code>totem</code>
| Totem
|-
| <code>wand</code>
| Wand
|}

{| class="wikitable" style="width:auto;max-width:30em"
|+ Weapon Properties
|-
! Modifier Key
! Weapon Property
|-
| <code>amm</code>
| Ammunition
|-
| <code>bru</code>
| Brutal
|-
| <code>def</code>
| Defensive
|-
| <code>hic</code>
| High Crit
|-
| <code>lof</code>
| Load Free
|-
| <code>lom</code>
| Load Minor
|-
| <code>off</code>
| Offhand
|-
| <code>rch</code>
| Reach
|-
| <code>rel</code>
| Reload
|-
| <code>sml</code>
| Small
|-
| <code>thv</code>
| Heavy Thrown
|-
| <code>tlg</code>
| Light Thrown
|-
| <code>two</code>
| Two-Handed
|-
| <code>ver</code>
| Versatile
|}

{| class="wikitable"
|+ Other Attributes
|-
! style="width: 8em"| Modifier Key
! style="width: 8em"| Attribute
! Description
|-
| <code>imp</code>
| Implement
| Matches anything that has the primary type of implement OR has the implement tag
|-
| <code>one</code>
| One-handed
| Matches any weapon (does not have the primary type of implement) that lacks the two-handed property. This includes versatile weapons, regardless of grip.
|-
| <code>proficient</code>
| Proficient use
| Matches any weapon (for weapon powers) or implement (for implement powers) with which the user is proficient
|-
| <code>spc</code>
| Special
| Matches anything with the &quot;special&quot; tag
|}

<span id="power-attributes"></span>
==== Power Attributes ====

The attributes below are specific to the <code>power</code> scope.

This <code>power</code> can also use [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-keyword-attributes Shared Keyword Attributes] and [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys Shared Damage Type Keys].

{| class="wikitable" style="width:auto;max-width:30em"
|+ Required Tool
|-
! Modifier Key
! Power Tool
|-
| <code>meleeWeapon</code>
| Melee Weapon
|-
| <code>rangedWeapon</code>
| Ranged Weapon
|-
| <code>usesImplement</code>
| Implement
|-
| <code>weapon</code>
| Melee Weapon or Ranged Weapon
|}

{| class="wikitable" style="width:auto;max-width:30em"
|+ Range and Area
|-
! Modifier Key
! Power Range/Area
|-
| <code>area</code>
| Area Burst, Area Blast, or Area Wall
|-
| <code>areaBlast</code>
| Area Blast
|-
| <code>areaBurst</code>
| Area Burst
|-
| <code>blast</code>
| Close Blast or Area Blast
|-
| <code>burst</code>
| Close Burst or Area Burst
|-
| <code>close</code>
| Close Burst or Close Blast
|-
| <code>closeBlast</code>
| Close Blast
|-
| <code>closeBurst</code>
| Close Burst
|-
| <code>melee</code>
| Melee, Melee Weapon, Reach, or Touch
|-
| <code>ranged</code>
| Ranged or Ranged Weapon
|}

{| class="wikitable"
|+ Other Attributes
|-
! Modifier Key
! Attribute
! Description
|-
| <code>basic</code>
| Basic Attack
| Attack tagged &quot;Counts as Basic Attack&quot;
|-
| <code>mBasic</code>
| Melee Basic
| Melee attack tagged &quot;Counts as Basic Attack&quot;
|-
| <code>rBasic</code>
| Ranged Attack
| Ranged attack tagged &quot;Counts as Basic Attack&quot;
|-
| <code>charge</code>
| Charge
| Attack tagged &quot;Counts as Charge&quot;, or an attack rolled as a Charge from the context menu
|-
| <code>opp</code>
| Opportunity Attack
| Attack tagged &quot;Counts as Opportunity Attack&quot;, or an attack rolled as an Opportunity Attack from the context menu
|-
| <code>vs[Def]</code>
| Targets defence
| Attack targets the specified defence. Possible <code>[Def]</code> values are <code>AC</code>, <code>Fort</code>, <code>Ref</code>, or <code>Wil</code>.
|-
| <code>uses[Abl]</code>
| Uses ability score
| Attack uses the specified ability score. Possible <code>[Abl]</code> values are <code>Str</code>, <code>Dex</code>, <code>Con</code>, <code>Int</code>, <code>Wis</code>, or <code>Cha</code>.
|}

<span id="effect-attributes"></span>
==== Effect Attributes ====

These attributes are unique to the effect scope. This scope can also use [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-keyword-attributes Shared Keyword Attributes] and [https://github.com/EndlesNights/dnd4eBeta/wiki/Active-Effects-and-Automation#shared-attribute-keys Shared Damage Type Keys].

The attributes available for effect scope include the entire system-defined condition list, including narrative markers like the ammo counter and torch icon. In practice, not all of these make sense with acive effects, but if you have a weird idea the option is there.

{| class="wikitable" style="width:auto;max-width:100%"
|+ Weapon Group
|-
! General Category
! Attribute Key
! Status
|-
| Marks/Targeting
| <code>mark_1</code> through <code>mark_7</code>
| Marked
|-
|
| <code>curse</code>
| Warlock's Curse
|-
|
| <code>oath</code>
| Oath of Emnity
|-
|
| <code>hunter_mark</code>
| Hunter's Mark
|-
|
| <code>target</code>
| Target
|-
| Health
| <code>bloodied</code>
| Bloodied
|-
|
| <code>dying</code>
| Dying
|-
|
| <code>dead</code>
| Dead
|-
|
| <code>unconscious</code>
| Unconscious
|-
| Action Restrictions
| <code>dazed</code>
| Dazed
|-
|
| <code>stunned</code>
| Stunned
|-
|
| <code>dominated</code>
| Dominated
|-
|
| <code>surprised</code>
| Surprised
|-
| Movement Restrictions
| <code>slowed</code>
| Slowed
|-
|
| <code>immobilized</code>
| Immobilised
|-
|
| <code>restrained</code>
| Restrained
|-
|
| <code>grabbed</code>
| Grabbed
|-
| Penalties
| <code>prone</code>
| Prone
|-
|
| <code>weakened</code>
| Weakened
|-
|
| <code>blinded</code>
| Blinded
|-
|
| <code>deafened</code>
| Deafened
|-
| Misc
| <code>insubstantial</code>
| Insubstantial
|-
|
| <code>removed</code>
| Removed
|-
|
| <code>petrified</code>
| Petrified
|-
|
| <code>grantingCA</code>
| Granting combat advantage
|-
| Visibility
| <code>concealed</code>
| Concealment
|-
|
| <code>concealedFull</code>
| Full Concealment
|-
|
| <code>cover</code>
| Cover
|-
|
| <code>coverSup</code>
| Superior Cover
|-
| Stealth
| <code>invisible</code>
| Invisible
|-
|
| <code>hidden</code>
| Hidden
|-
|
| <code>sneaking</code>
| Sneaking
|-
| Movement
| <code>running</code>
| Running
|-
|
| <code>squeezing</code>
| Squeezing
|-
|
| <code>mounted</code>
| Mounted
|-
|
| <code>flying</code>
| Flying
|-
| Ongoing Damage
| <code>ongoing_1</code> through <code>ongoing_2</code>
| Ongoing Damage
|-
|
| <code>regen</code>
| Regenerating
|-
| Generic Bonus/Penalty
| <code>attack_up</code>
| Attack Bonus
|-
|
| <code>attack_down</code>
| Attack Penalty
|-
|
| <code>defUp</code>
| Defence Bonus
|-
|
| <code>defDown</code>
| Defence Penalty
|-
| Resources
| <code>ammo_count</code>
| Ammo Count
|-
|
| <code>torch</code>
| Torch
|-
| Narrative Conditions
| <code>drunk</code>
| Drunk
|-
|
| <code>sleeping</code>
| Sleeping
|-
|
| <code>disarmed</code>
| Disarmed
|}

<span id="shared-keyword-attributes"></span>
==== Shared Keyword Attributes ====

These attributes work in both the <code>power</code> and <code>effect</code> scopes.

{| class="wikitable" style="width:fit-content"
|+ Power Sources
|-
! style="min-width: 14em"| Modifier Key
! Power Source
|-
| style="min-width: 14em"| <code>arcane</code>
| Arcane
|-
| <code>divine</code>
| Divine
|-
| <code>elemental</code>
| Elemental
|-
| <code>ki</code>
| Ki
|-
| <code>martial</code>
| Martial
|-
| <code>primal</code>
| Primal
|-
| <code>psionic</code>
| Psionic
|-
| <code>shadow</code>
| Shadow
|}

{| class="wikitable" style="width:auto;max-width:30em"
|+ General Power Keywords
|-
! Modifier Key
! Power Keyword
|-
| <code>augmentable</code>
| Augmentable
|-
| <code>aura</code>
| Aura
|-
| <code>basic</code>
| Basic Attack
|-
| <code>beast</code>
| Beast
|-
| <code>beastForm</code>
| Beast Form
|-
| <code>channelDiv</code>
| Channel Divinity
|-
| <code>charm</code>
| Charm
|-
| <code>conjuration</code>
| Conjuration
|-
| <code>disease</code>
| Disease
|-
| <code>elemental</code>
| Elemental
|-
| <code>enchantment</code>
| Enchantment
|-
| <code>evocation</code>
| Evocation
|-
| <code>fear</code>
| Fear
|-
| <code>fullDis</code>
| Full Discipline
|-
| <code>gaze</code>
| Gaze
|-
| <code>healing</code>
| Healing
|-
| <code>illusion</code>
| Illusion
|-
| <code>invigorating</code>
| Invigorating
|-
| <code>mount</code>
| Mount
|-
| <code>necro</code>
| Necromancy
|-
| <code>nether</code>
| Nethermancy
|-
| <code>poison</code>
| Poison
|-
| <code>polymorph</code>
| Polymorph
|-
| <code>rage</code>
| Rage
|-
| <code>rattling</code>
| Rattling
|-
| <code>reliable</code>
| Reliable
|-
| <code>runic</code>
| Runic
|-
| <code>sleep</code>
| Sleep
|-
| <code>spirit</code>
| Spirit
|-
| <code>stance</code>
| Stance
|-
| <code>summoning</code>
| Summoning
|-
| <code>teleportation</code>
| Teleportation
|-
| <code>transmutation</code>
| Transmutation
|-
| <code>zone</code>
| Zone
|}

== Shared Attribute Keys ==
These damage type keys are suitable for custom 4e modifiers of any scope, as well as resistance/vulnerability in standard Foundry modifiers.

Note that the <code>damage</code> key has very specific behaviour. When used in resistances it corresponds to Resist All, so it will override any typed resistance/vulnerability with a less significant value. When used as a damage type it counts as &quot;super&quot; damage, that can only be resisted by Resist All. In either case, it '''does not''' correspond to 4e untyped damage, which should instead be classified as <code>physical</code>.

{| class="wikitable" style="width:auto"
|+ Damage Type
|-
! style="min-width: 8em"| Modifier Key
! Damage Type
|-
| <code>damage</code>
| All Damage (resist all damage for resistances, irresistible damage for powers)
|-
| <code>acid</code>
| Acid
|-
| <code>cold</code>
| Cold
|-
| <code>fire</code>
| Fire
|-
| <code>force</code>
| Force
|-
| <code>lightning</code>
| Lightning
|-
| <code>necrotic</code>
| Necrotic
|-
| <code>physical</code>
| Physical (untyped)
|-
| <code>poison</code>
| Poison
|-
| <code>psychic</code>
| Psychic
|-
| <code>radiant</code>
| Radiant
|-
| <code>thunder</code>
| Thunder
|}

== Ongoing Damage and Automation ==
Another customisation to Active Effects in the 4e system is the inclusion of ongoing damage and regeneration. By adding one or more ongoing damage entries to your effect, and setting an appropriate duration, you can model (and automate!) most cases of ongoing damage found in 4e content.

<span id="adding-damage-instances"></span>
=== Adding Damage instances ===

The new &quot;Ongoing Damage/Regeneration&quot; section is found on the Effects tab while you are configuring your Active Effect, below the list of modifiers. You can add instances of ongoing damage in the same way as modifiers, but you don't need to know any attribute names—just the amount of damage, and the damage type.

As with modifiers, you can add as many different damage instances as you need to. You can also put both modifiers ''and'' ongoing damage/regen on the same Active Effect. That means you can create a &quot;save ends both&quot; or &quot;save ends all&quot; type effect by adding multiple modifiers and/or damage instances to a single Active Effect.

If you want to create a regeneration effect, just select <code>[Regeneration]</code> as the damage type.

<span id="config-tips"></span>
==== Config Tips ====

* The &quot;value&quot; field accepts <code>@variables</code>, the same as modifier effects (see [https://github.com/EndlesNights/dnd4eBeta/wiki/Character-Variables-for-Use-in-Formulae Character Variables for Use in Formulae]). Don't forget to <code>$solidify()</code> any variables that need to refer to the source actor!
* You can select multiple damage types from the list. This creates ''one'' ongoing damage instance with ''multiple damage types''. If you need two ongoing damage instances, each with a different type, you should instead add a second damage entry to the list.
** Regen is incompatible with other damage types, for obvious reasons. If you select multiple types including Regeneration, Regen will take precedence.

<span id="automation"></span>
=== Automation ===

If you're using effects to model ongoing damage/regeneration, you also have the option to automate it at the beginning of each creature's turn.

By changing your system settings, you can choose whether ongoing damage from effects should be applied automatically, or should instead pop up a reminder card in chat. (You can also turn it off entirely if you don't use automation.) This is a client-level setting, so each player can choose how it's handled for creatures they control.

When automation is on, the system will collect all the instances of ongoing damage attached to a creature's currently-enabled active effects at the beginning of its turn, and apply only the highest of each unique type combination. If you have the system apply damage automatically, the creature's resistances/vulnerabilities will be factored into the resulting HP change.

<span id="automation-visibility"></span>
==== Automation Visibility ====

For groups who prefer to obfuscate game information, the game can also be configured to make ongoing damage reports/reminders private for the controlling player. This is a game-wide setting (for obvious reasons!) but the GM can choose between making it public for all creatures, private for all creatures, or public for PCs only (private for NPCs).
== Rich Descriptions (v0.8+) ==
Prior to system version 0.8, Active Effect descriptions could not use the formulae and variables that most descriptive text can. However, in v0.8.0 we added the new <code>[[lookup]]</code> enricher that you can use with this field. For usage details, please see [https://github.com/EndlesNights/dnd4eBeta/wiki/Text-Enrichers-and-Roll-Prompts Text Enrichers and Roll Prompts].