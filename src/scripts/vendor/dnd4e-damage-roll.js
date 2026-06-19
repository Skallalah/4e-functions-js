/**
 * Vendored damage-roll pipeline (crit-aware).
 *
 * The dnd4e system rolls damage as "normal" whenever `item.rollDamage()` is
 * fast-forwarded: its `critical` flag is never wired through (see
 * dice.js `damageRoll` fast-forward branch). To roll *critical* damage without
 * the manual damage dialog, we vendor the exact assembly + roll code from the
 * system and add the single missing line that honours a crit in fast-forward.
 *
 * The function bodies below are COPIED VERBATIM from dnd4e 0.7.14 and must stay
 * byte-identical to the source MODULO:
 *   - `this` -> `item` (the rollDamage body is a method there, a function here),
 *   - a `critical` parameter threaded into the signature and the `damageRoll` call,
 *   - the marked `[VENDOR FIX]` crit lines in `damageRoll`,
 *   - `export ` removed from `damageRoll` (it lives inside the IIFE here).
 * Runtime deps are resolved from the live system: `Helper` -> `game.helper`,
 * `RollWithOriginalExpression` -> `CONFIG.Dice.rolls`. `RollDialog` stays
 * undefined on purpose: the non-fast-forward branch is never reached.
 *
 * @source EndlesNights/dnd4eBeta @ 0.7.14 (module/dice.js, module/item/item.js)
 * @reviewer scripts/vendor/verify-vendor.py asserts the verbatim match.
 */
const DamageRoll4e = (() => {
	let Helper, RollWithOriginalExpression, RollDialog; // RollDialog: intentionally unresolved (dialog path unused)

	function _resolveDeps() {
		Helper = game.helper;
		RollWithOriginalExpression = CONFIG.Dice.rolls.find(r => r.name === 'RollWithOriginalExpression');
	}

	// >>> VENDOR BLOCK: dice.js (damageRoll / performDamageRollAndCreateChatMessage / mergeInputArgumentsIntoRollConfig / manageBonusInParts)
async function damageRoll({parts, partsCrit, partsMiss, partsExpressionReplacement  = [], partsCritExpressionReplacement= [], partsMissExpressionReplacement= [], actor,
								data, event={}, rollMode=null, template, title, speaker, flavor, allowCritical=true,
								critical=false, fastForward=null, onClose, dialogOptions, healingRoll, options}) {
									
	// First configure the Roll
	const rollConfig = {parts, partsCrit, partsMiss, data, flavor, rollMode, partsExpressionReplacement, partsCritExpressionReplacement, partsMissExpressionReplacement, speaker, hitType: 'normal', fastForward, options}

	// handle input arguments
	mergeInputArgumentsIntoRollConfig(rollConfig, parts, event, rollMode, title, speaker, flavor, fastForward)

	// crit and miss need a @bonus as well as parts
	rollConfig.partsCrit = partsCrit?.concat(["@bonus"]);
	rollConfig.partsMiss = partsMiss?.concat(["@bonus"]);

	// Modify the roll and handle fast-forwarding
	if ( rollConfig.fastForward ) {
		if (healingRoll) {
			rollConfig.hitType = 'heal'
		}
		// [VENDOR FIX vs dnd4e 0.7.14 -- crit wiring] honour an explicit crit in fast-forward mode
		else if (critical) {
			rollConfig.hitType = 'crit'
		}
		return performDamageRollAndCreateChatMessage(null, rollConfig);
	}

	// If they didn't want fast forward, then we need to display the rolls bonus input dialog.

	// Render modal dialog
	let dialogData = {
		formula: "@damage + @bonus",
		data: data,
		rollMode: rollMode,
		rollModes: CONFIG.Dice.rollModes
	};

	// common dialog configuration
	const dialogConfig = {
		window: {title},
		position: {width:500}
	}
	const buttons = [];
	// add the buttons
	if (healingRoll) {
		buttons.push({
			action: "heal",
			// icon: "fa-solid fa-dice-d20",
			label: game.i18n.localize("DND4E.Healing"),
			type: "submit"
		});
	}
	else {
		if (allowCritical) {
			buttons.push({
				action: "crit",
				// icon: "fa-solid fa-dice-d20",
				label: game.i18n.localize("DND4E.CriticalHit"),
				type: "submit"
			});
		}
		buttons.push({
			action: "normal",
			// icon: "fa-solid fa-dice-d20",
			label: game.i18n.localize(allowCritical ? "DND4E.Normal" : "DND4E.Roll"),
			type: "submit"
		});
		if (data.item.miss.halfDamage || data.item.miss.formula) {
			buttons.push({
				action: "miss",
				// icon: "fa-solid fa-dice-d20",
				label: game.i18n.localize(allowCritical ? "DND4E.Miss" : "DND4E.Roll"),
				type: "submit"
			})
		}
	}
	return RollDialog.asPromise({dialogData, rollConfig, buttons, ...dialogConfig, callbackFn: performDamageRollAndCreateChatMessage});
}

async function performDamageRollAndCreateChatMessage(form, {parts, partsCrit, partsMiss, data, hitType, flavor, rollMode, partsExpressionReplacement, partsCritExpressionReplacement, partsMissExpressionReplacement, speaker, options, fastForward}) {
	manageBonusInParts(parts, form, data)
	manageBonusInParts(partsCrit, form, data)
	manageBonusInParts(partsMiss, form, data)

	if(data.bonus){ //stopgap fix because bonus damage type is not being recorded properly
		if(parts[parts.length-1] === "@bonus"){
			let index = data.bonus.lastIndexOf('[');
			if(index >=0) {
				parts[parts.length-1] = '(' + data.bonus.slice(0,index) + ')' + data.bonus.slice(index);
			} else {
				parts[parts.length-1] = '(' + data.bonus + ')';
			}
		}
	} else {
		if(!fastForward) parts.pop();
	}
	//console.debug(parts);

	let roll;
	if(hitType === 'immune'){
		options.hitTypeDamage = false;
		roll = RollWithOriginalExpression.createRoll(parts, partsExpressionReplacement, data, options);
		flavor = `${flavor} (${game.i18n.localize("DND4E.Immune")})`;
	}
	else if(hitType === 'normal'){
		options.hitTypeDamage = true;
		options.hitType = hitType;
		roll = RollWithOriginalExpression.createRoll(parts, partsExpressionReplacement, data, options);
	}
	else if (hitType === 'crit') {
		options.hitTypeDamage = true;
		options.hitType = hitType;
		roll = RollWithOriginalExpression.createRoll(partsCrit, partsCritExpressionReplacement, data, options)
		flavor = `${flavor} (${game.i18n.localize("DND4E.Critical")})`;
	}
	else if (hitType === 'miss') {
		options.hitTypeDamage = true;
		options.hitType = hitType;
		roll = RollWithOriginalExpression.createRoll(partsMiss, partsMissExpressionReplacement, data, options);
		flavor = `${flavor} (${game.i18n.localize("DND4E.Miss")})`;
	}
	else if (hitType === 'heal') {
		options.hitTypeHealing = true;
		roll = RollWithOriginalExpression.createRoll(parts, partsExpressionReplacement, data, options);
		flavor = `${flavor} (${game.i18n.localize("DND4E.Healing")})`;
	} else {
		roll = RollWithOriginalExpression.createRoll(parts, partsExpressionReplacement, data, options)
	}

	if (form?.flavor.value) {
		flavor = form.flavor.value || flavor;
	}
	// Convert the roll to a chat message
	rollMode = form ? form.rollMode.value : rollMode;
	roll.toMessage({
		speaker,
		flavor
	}, { rollMode });
	return roll;
}


// General helper functions for both attack and damage rolls

function mergeInputArgumentsIntoRollConfig(rollConfig, parts, event, rollMode, title, speaker, flavor, fastForward) {
	// Handle input arguments
	rollConfig.flavor = flavor || title;
	rollConfig.speaker = speaker || ChatMessage.getSpeaker();
	rollConfig.parts = parts.concat(["@bonus"]);
	rollConfig.rollMode = rollMode || game.settings.get("core", "rollMode");

	// Determine whether the roll can be fast-forward, make explicit comparison here as it might be set as false, so no falsey checks
	if ( fastForward === null || fastForward === undefined) {
		// rollConfig.fastForward = Helper.isUsingFastForwardKey(event);
		rollConfig.fastForward = Helper.isRollFastForwarded(event);
		if(rollConfig.options?.fastForward){
			rollConfig.fastForward = rollConfig.options.fastForward;
		}
	}
	return rollConfig
}

/**
 * sort out @bonus which was shoved onto the end of the expression to represent floating situational bonuses
 * either the user specified one, or we want to get rid of it.  Also prettifiy if they made their bonus +1d6 - strip out the leading +
 * @param parts The parts of the formula we were given, will have @bonus as the last element
 * @param form The user input form (may be null)
 * @param data The roll data
 */
function manageBonusInParts(parts, form, data) {
	if ( form !== null ) {
		if (form.bonus.value) {
			// remove double +
			let trimmed = form.bonus.value.trim()
			if (trimmed.startsWith("+")) {
				trimmed = trimmed.substring(1)
			}
			data['bonus'] = trimmed
		}
		else {
			data['bonus'] = 0
		}
	}
	else {
		if (parts && parts.length > 0) {
			if (parts[parts.length - 1] === "@bonus") {
				parts.pop()
			}
		}
	}
}
	// <<< END VENDOR BLOCK: dice.js

	// >>> VENDOR BLOCK: item.js rollDamage body (this -> item, + critical)
async function _rollItemDamageBody(item, {event, spellLevel=null, versatile=false, fastForward=undefined, variance={}, critical=false}={}) {
		const itemData = item.system;
		const actorData = item.actor;
		const actorInnerData = item.actor.system;
		const weaponUse = Helper.getWeaponUse(itemData, item.actor);

		if(Helper.lacksRequiredWeaponEquipped(itemData, weaponUse)) {
			ui.notifications.error(game.i18n.localize("DND4E.LackRequiredWeapon"));
			return null;
		}

		if ( !item.hasDamage ) {
			ui.notifications.error("You may not make a Damage Roll with this Item.");
			return null;
		}
		const messageData = {"flags.dnd4e.roll": {type: "damage", itemId: item.id }};

		// Get roll data
		const rollData = item.getRollData({'variance':variance});
		if ( spellLevel ) rollData.item.level = spellLevel;

		// Get message labels
		let title = `${item.name} - ${game.i18n.localize("DND4E.DamageRoll")}`;
		let flavor = item.labels.damageTypes?.length ? `${title} (${item.labels.damageTypes})` : title;

		// Define Roll  and add seconadry parts
		const returnDamageRollAndOptionalType = (damageRoll, damageType) => {
			if (damageType && damageType !== game.i18n.localize(game.dnd4e.config.damageTypes.damage) && damageType !== game.i18n.localize("DND4E.None")) {
				return `(${damageRoll})[${damageType}]`
			}
			else {
				return damageRoll
			}

		}
		const options = { formulaInnerData: {}, divisors: {normal: {value: 1, reason: []}, miss: {value: 1, reason: []}, crit: {value: 1, reason: []}} }
		const secondaryPartsHelper = (formula, damageType) => {
			// store the values that were used to sub in any formulas
			options.formulaInnerData = foundry.utils.mergeObject(options.formulaInnerData, Helper.commonReplace(formula, actorData, item.system, weaponUse?.system, 1, true))
			// convert formula and type into a single string of "substituted formula [type]"
			return returnDamageRollAndOptionalType(Helper.commonReplace(formula, actorData, item.system, weaponUse?.system), damageType)
		}
		const parts = itemData.damage.parts.map(d => secondaryPartsHelper(d[0], d[1]));
		const partsMiss = itemData.damage.parts.map(d => secondaryPartsHelper(d[0], d[1]));
		const partsCrit = itemData.damageCrit.parts.map(d => secondaryPartsHelper(d[0], d[1]));

		// store the original expression formula that produced those formula
		const partsExpressionReplacement = parts.map(part => { return {target: part, value: "@pow2ndryDamage"}})
		const partsMissExpressionReplacement = partsMiss.map(part => { return {target: part, value: "@pow2ndryDamage"}})
		const partsCritExpressionReplacement = partsCrit.map(part => { return {target: part, value: "@pow2ndryCritDamage"}})

		// itemData.damageType
		let primaryDamage = ''
		const pD = [];

		if(item.getDamageType()){
			for ( let [damage, d] of Object.entries(item.getDamageType())) {
				if(d){
					pD.push(damage);
					// primaryDamage += `${damage}`;
				}
			}
		}

		primaryDamage = pD.join(', ');

		let damageFormula = '';
		let missDamageFormula = '';
		let critDamageFormula = '';
		let damageFormulaExpression = '';
		let missDamageFormulaExpression = '';
		let critDamageFormulaExpression = '';
		//Add power damage into parts
		if(!!itemData.hit?.formula) {
			const formulaHelper = (formula) => {
				// store the values that were used to sub in any formulas
				options.formulaInnerData = foundry.utils.mergeObject(options.formulaInnerData, Helper.commonReplace(formula, actorData, item.system, weaponUse?.system, 1, true))
				// convert formula and type into a single string of "substituted formula [type]"
				return  Helper.commonReplace(formula, actorData, item.system, weaponUse?.system);
			}
			damageFormula = formulaHelper(itemData.hit.formula)
			missDamageFormula = formulaHelper(itemData.miss.formula)
			critDamageFormula = formulaHelper(itemData.hit.critFormula)
			damageFormulaExpression = itemData.hit.formula
			missDamageFormulaExpression = itemData.miss.formula
			critDamageFormulaExpression = itemData.hit.critFormula

			//Should now be redudent with everything moved into the Helper#CommonReplace function

			//Add seconadary weapons damage into parts
			const secondaryDamageExpressionHelper = (oldParts, expressionParts, newPartsArr) => {
				const newParts = newPartsArr.map(d =>  {
					options.formulaInnerData = foundry.utils.mergeObject(options.formulaInnerData, Helper.commonReplace(d[0], actorData, item.system, weaponUse?.system, 1, true))
					const formula = Helper.commonReplace(d[0], actorData, item.system, weaponUse?.system);
					if (d.length >= 2) {
						return returnDamageRollAndOptionalType(formula, d[1])
					}
					else {
						return formula
					}
				})

				Array.prototype.push.apply(oldParts, newParts)
				Array.prototype.push.apply(expressionParts, newParts.map(part => { return {target: part, value: "@wep2ndryDamage"}}))
			}
			//I really want to factor this, but they are annoyingly different enough to make it too headache inducing
			if(weaponUse) {
				if(itemData.hit.formula.includes("@wepDamage") && weaponUse.system.damage.parts.length > 0) {
					secondaryDamageExpressionHelper(parts, partsExpressionReplacement, weaponUse.system.damage.parts)
				}
				if(itemData.hit.critFormula.includes("@wepCritBonus") && weaponUse.system.damageCrit.parts.length > 0) {
					secondaryDamageExpressionHelper(partsCrit, partsCritExpressionReplacement, weaponUse.system.damageCrit.parts)
				}

				if(itemData.hit.formula.includes("@impDamage") && weaponUse.system.proficientI && weaponUse.system.damageImp.parts.length > 0) {
					secondaryDamageExpressionHelper(parts, partsExpressionReplacement, weaponUse.system.damageImp.parts)
				}
				if(itemData.hit.critFormula.includes("@impCritBonus") && weaponUse.system.proficientI && weaponUse.system.damageCritImp.parts.length > 0) {
					secondaryDamageExpressionHelper(partsCrit, partsCritExpressionReplacement, weaponUse.system.damageCritImp.parts)
				}

				if(itemData.miss.formula.includes("@wepDamage") && weaponUse.system.damage.parts.length > 0) {
					secondaryDamageExpressionHelper(partsMiss, partsMissExpressionReplacement, weaponUse.system.damage.parts)
				}
				if(itemData.miss.formula.includes("@impDamage") && weaponUse.system.proficientI && weaponUse.system.damageImp.parts.length > 0) {
					secondaryDamageExpressionHelper(partsMiss, partsMissExpressionReplacement, weaponUse.system.damageImp.parts)
				}
			}
		}
	
		// Adjust damage from versatile usage
		if(weaponUse) {
			if(weaponUse.system.properties["ver"] && weaponUse.system.weaponHand === "hTwo" ) {
				damageFormula += `+ 1`;
				critDamageFormula += `+ 1`;
				damageFormulaExpression  += `+ @versatile`;
				critDamageFormulaExpression += `+ @versatile`;
				options.formulaInnerData.versatile = 1
			}
		}
	
		if(item.system?.hit?.damageBonusNull) console.log(`Ignoring damage bonuses do to power config.`);
	
		// Define Roll Data
		if(!item.system?.hit?.damageBonusNull){
			const actorBonus = foundry.utils.getProperty(actorInnerData, `bonuses.${itemData.actionType}`) || {};
			if ( actorBonus.damage && parseInt(actorBonus.damage) !== 0 ) {
				// parts.push("@dmg");
				// partsCrit.push("@dmg");
				// rollData["dmg"] = actorBonus.damage;
				damageFormula += `+ ${actorBonus.damage}`
				missDamageFormula += `+ ${actorBonus.damage}`
				critDamageFormula += `+ ${actorBonus.damage}`
				damageFormulaExpression  += `+ @actorBonusDamage`
				missDamageFormulaExpression += `+ @actorBonusDamage`
				critDamageFormulaExpression +=  `+ @actorBonusDamage`
				options.formulaInnerData.actorBonusDamage = actorBonus.damage
			}
		}

		// Originally these were a separate part, but then they were not part of the primary damage type
		// which they should be.  So now appending them to the main expression.
		const effectDamageParts = []
		const extraDamageParts = []
		if(!item.system?.hit?.damageBonusNull){
			await Helper.applyEffects([effectDamageParts], rollData, actorData, item, weaponUse, "damage", extraDamageParts)
			effectDamageParts.forEach(part => {
				const value = rollData[part.substring(1)]
				damageFormula += `+ ${value}`
				missDamageFormula += `+ ${value}`
				critDamageFormula += `+ ${value}`
				damageFormulaExpression  += `+ ${part}`
				missDamageFormulaExpression += `+ ${part}`
				critDamageFormulaExpression += `+ ${part}`
				options.formulaInnerData[part.substring(1)] = value
			})
		}

		// Ammunition Damage from power
		if(item._ammo) {
			parts.push("@ammo");
			partsCrit.push("@ammo");

			if(!missDamageFormula.includes('@damageFormula') && !missDamageFormula.includes('@halfDamageFormula')){
				partsMiss.push("@ammo");
			}

			rollData["ammo"] = item._ammo.system.damage.parts.map(p => p[0]).join("+");
			flavor += ` [${item._ammo.name}]`;
			delete item._ammo;
		}
	
		// Ammunition Damage from weapon
		if(weaponUse) {
			if ( weaponUse._ammo ) {
				parts.push("@ammoW");
				partsCrit.push("@ammoW");

				if(!missDamageFormula.includes('@damageFormula') && !missDamageFormula.includes('@halfDamageFormula')){
					partsMiss.push("@ammoW");
				}

				rollData["ammoW"] = weaponUse._ammo.system.damage.parts.map(p => p[0]).join("+");
				flavor += ` [${weaponUse._ammo.name}]`;
				delete weaponUse._ammo;
			}
			title += ` with ${weaponUse.name}`
			flavor += ` with ${weaponUse.name}`
		}

		// Extra damage
		if(extraDamageParts.length) {
			for(const part of extraDamageParts) {
				parts.push(part);
				partsExpressionReplacement.unshift({target : part, value: '@extraDamage'});

				if (critDamageFormula) {
					const maxRoll = await new Roll(part).evaluate({maximize: true});
					let critPart = `(${maxRoll.total})`;
					if (maxRoll.terms[0].flavor) critPart += `[${maxRoll.terms[0].flavor}]`;
					partsCrit.push(critPart);
					partsCritExpressionReplacement.unshift({target : critPart, value: '@extraDamage'});
				}
				if (missDamageFormula) {
					partsMiss.push(part);
					partsMissExpressionReplacement.unshift({target : part, value: '@extraDamage'});
				}
			}
		}

		//Add powers text to message.
		// if(itemData.hit?.detail) flavor += '<br>Hit: ' + itemData.hit.detail
		// if(itemData.miss?.detail) flavor += '<br>Miss: ' + itemData.miss.detail
		// if(itemData.effect?.detail) flavor += '<br>Effect: ' + itemData.effect.detail;
		// Call the roll helper utility
		
		if(itemData.miss.halfDamage){
			options.divisors.miss.value *= 2;
			options.divisors.miss.reason.push(game.i18n.localize("DND4E.Miss"))
			missDamageFormula = damageFormula;
		}

		if(itemData.attack.isAttack && actorData.statuses.has('weakened')){
			options.divisors.normal.value *= 2;
			options.divisors.normal.reason.push(game.i18n.localize("EFFECT.statusWeakened"));
			options.divisors.crit.value *= 2;
			options.divisors.crit.reason.push(game.i18n.localize("EFFECT.statusWeakened"));
			options.divisors.miss.value *= 2;
			options.divisors.miss.reason.push(game.i18n.localize("EFFECT.statusWeakened"));
		}

		if(missDamageFormula.includes('@damageFormula')){
			missDamageFormula = missDamageFormula.replace('@damageFormula', Helper.bracketed(damageFormula));
		}

		if(missDamageFormula.includes('@halfDamageFormula')){
			missDamageFormula = missDamageFormula.replace('@halfDamageFormula', Helper.bracketed(`${damageFormula}/2`));
		}

		const primaryDamageStr = primaryDamage ? `[${primaryDamage}]` : ""
		parts.unshift(`(${damageFormula})${primaryDamageStr}`);
		partsCrit.unshift(`(${critDamageFormula})${primaryDamageStr}`);
		partsMiss.unshift(`(${missDamageFormula})${primaryDamageStr}`);
		partsExpressionReplacement.unshift({target : parts[0], value: damageFormulaExpression})
		partsCritExpressionReplacement.unshift({target : partsCrit[0], value: critDamageFormulaExpression})
		partsMissExpressionReplacement.unshift({target : partsMiss[0], value: missDamageFormulaExpression})
		
		const speaker = ChatMessage.getSpeaker({ actor: item.actor });

		Hooks.callAll("dnd4e.rollDamage", item, speaker);		

		return damageRoll({
			event,
			critical,
			parts,
			partsCrit,
			partsMiss,
			partsExpressionReplacement,
			partsCritExpressionReplacement,
			partsMissExpressionReplacement,
			actor: item.actor,
			data: rollData,
			title,
			flavor,
			speaker,
			dialogOptions: {
				width: 400,
				top: event ? event.clientY - 80 : null,
				left: window.innerWidth - 710
			},
			messageData,
			options,
			fastForward,
			'isCharge': variance?.isCharge || false,
			'isOpp': variance?.isOpp || false,
		});
	}
	// <<< END VENDOR BLOCK: item.js rollDamage body

	/**
	 * Public entry: roll an item's damage, optionally as a critical hit.
	 * @param {Item} item
	 * @param {Object} [options]
	 * @param {boolean} [options.critical=false]
	 * @param {boolean} [options.fastForward]
	 * @param {Object} [options.variance]
	 * @returns {Promise<Roll|false>} the (unevaluated) Roll, or false if cancelled
	 */
	async function roll(item, options = {}) {
		_resolveDeps();
		return _rollItemDamageBody(item, options);
	}

	return { roll };
})();

