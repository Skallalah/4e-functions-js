#!/usr/bin/env python3
"""
Strict verifier for src/scripts/vendor/dnd4e-damage-roll.js.

Re-downloads the pristine dnd4e 0.7.14 source straight from GitHub, re-applies
the documented (and ONLY the documented) transforms, and proves the committed
vendor file matches byte-for-byte. Anything else => non-zero exit.

Documented transforms (the "MODULO crit" allowance):
  dice.js block:
    - `export async function damageRoll` -> `async function damageRoll`
    - + 4 marked [VENDOR FIX] lines wiring crit in the fast-forward branch
  item.js rollDamage body:
    - method signature -> standalone `_rollItemDamageBody(item, {... , critical=false})`
    - `this.` -> `item.` and the two bare-`this` arguments -> `item`
    - `critical,` threaded into the `damageRoll({...})` call

Run: python3 src/scripts/vendor/verify-vendor.py
"""
import sys, urllib.request, difflib, re

TAG = "0.7.14"
RAW = "https://raw.githubusercontent.com/EndlesNights/dnd4eBeta/%s/%s"
VENDOR = "src/scripts/vendor/dnd4e-damage-roll.js"

# Pristine source line ranges at the immutable tag 0.7.14 (1-indexed inclusive).
DICE_RANGE = (486, 671)   # damageRoll .. manageBonusInParts
ROLL_RANGE = (1883, 2178) # rollDamage method


def fetch(path):
    with urllib.request.urlopen(RAW % (TAG, path)) as r:
        return r.read().decode("utf-8")


def slice_lines(text, lo, hi):
    return "\n".join(text.split("\n")[lo - 1:hi])


def between(text, start, end):
    a = text.index(start) + len(start)
    b = text.index(end, a)
    # Trim surrounding whitespace: the sentinel line's own trailing text and the
    # indentation/newlines that wrap the block are not vendored code.
    return text[a:b].strip()


def forward_dice(dice):
    """Apply the allowed dice-block transforms to pristine source."""
    out = dice.replace("export async function damageRoll", "async function damageRoll", 1)
    crit_old = ("\t\tif (healingRoll) {\n\t\t\trollConfig.hitType = 'heal'\n\t\t}\n"
                "\t\treturn performDamageRollAndCreateChatMessage(null, rollConfig);")
    crit_new = ("\t\tif (healingRoll) {\n\t\t\trollConfig.hitType = 'heal'\n\t\t}\n"
                "\t\t// [VENDOR FIX vs dnd4e 0.7.14 -- crit wiring] honour an explicit crit in fast-forward mode\n"
                "\t\telse if (critical) {\n\t\t\trollConfig.hitType = 'crit'\n\t\t}\n"
                "\t\treturn performDamageRollAndCreateChatMessage(null, rollConfig);")
    assert out.count(crit_old) == 1, "crit anchor missing/duplicated in pristine dice block"
    return out.replace(crit_old, crit_new)


def forward_roll(roll):
    """Apply the allowed rollDamage-body transforms to pristine source."""
    sig_old = "\tasync rollDamage({event, spellLevel=null, versatile=false, fastForward=undefined, variance={}}={}) {"
    sig_new = "async function _rollItemDamageBody(item, {event, spellLevel=null, versatile=false, fastForward=undefined, variance={}, critical=false}={}) {"
    assert roll.count(sig_old) == 1, "rollDamage signature changed upstream"
    out = roll.replace(sig_old, sig_new, 1)
    out = out.replace("this.", "item.")
    out = out.replace(", rollData, actorData, this, weaponUse,", ", rollData, actorData, item, weaponUse,")
    out = out.replace('Hooks.callAll("dnd4e.rollDamage", this, speaker)', 'Hooks.callAll("dnd4e.rollDamage", item, speaker)')
    out = out.replace("\t\treturn damageRoll({\n\t\t\tevent,", "\t\treturn damageRoll({\n\t\t\tevent,\n\t\t\tcritical,")
    return out


def show(title, a, b, a_name, b_name):
    d = list(difflib.unified_diff(a.split("\n"), b.split("\n"), a_name, b_name, lineterm=""))
    print("\n" + "=" * 70 + "\n" + title + "\n" + "=" * 70)
    if not d:
        print("  (identical)")
        return True
    print("\n".join(d))
    return False


def main():
    dice_src = fetch("module/dice.js")
    item_src = fetch("module/item/item.js")
    pristine_dice = slice_lines(dice_src, *DICE_RANGE)
    pristine_roll = slice_lines(item_src, *ROLL_RANGE)

    vend = open(VENDOR, encoding="utf-8").read()
    vend_dice = between(vend, "// >>> VENDOR BLOCK: dice.js", "// <<< END VENDOR BLOCK: dice.js")
    # drop the leading paren-comment tail of the sentinel line if present
    vend_dice = vend_dice.split("\n", 1)[1] if vend_dice.split("\n", 1)[0].strip().startswith("(") else vend_dice
    vend_roll = between(vend, "// >>> VENDOR BLOCK: item.js rollDamage body", "// <<< END VENDOR BLOCK: item.js rollDamage body")
    vend_roll = vend_roll.split("\n", 1)[1] if vend_roll.split("\n", 1)[0].strip().startswith("(") else vend_roll

    expected_dice = forward_dice(pristine_dice)
    expected_roll = forward_roll(pristine_roll)

    ok = True
    # PROOF 1/2: committed vendor == documented transform of pristine source (zero stray bytes)
    ok &= show("dice.js block: committed vendor vs forward-transformed pristine 0.7.14",
               expected_dice, vend_dice, "expected(=T(pristine))", "committed vendor")
    ok &= show("rollDamage body: committed vendor vs forward-transformed pristine 0.7.14",
               expected_roll, vend_roll, "expected(=T(pristine))", "committed vendor")

    # HUMAN VIEW: raw diff pristine vs committed -> must show ONLY this->item / export / crit / sig
    show("RAW diff (pristine dice vs committed) -- expect only `export` + 4 crit lines",
         pristine_dice, vend_dice, "pristine 0.7.14", "committed vendor")
    show("RAW diff (pristine rollDamage vs committed) -- expect only this->item / signature / `critical`",
         pristine_roll, vend_roll, "pristine 0.7.14", "committed vendor")

    print("\n" + ("RESULT: PASS -- vendor is verbatim modulo the documented crit transforms."
                  if ok else "RESULT: FAIL -- unexpected divergence above."))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
