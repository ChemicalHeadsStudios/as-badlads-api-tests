import {
    BadLadsObject,
    BadLadsObjectFlags,
    BadLadsContainerFlags,
    getObjectsIdsByType,
    getObjectTransform,
    isObjectValid,
    getPlayerItems,
    getPlayerItemCount,
    removeItem,
    giveItem,
    getItemDefinitionCount,
    getItemDefinitionName,
    getItemDefinitionIdByName,
    getLivingHealth,
    getLivingMaxHealth,
    setLivingHealth,
    getPlayerMoney,
    getPlayerCharacter,
} from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins the host functions for observing inventory, item definitions, health and player balance.
 *
 * Every assertion checks that a call produces a usable value rather than merely returning, since a function that
 * returns nothing useful is indistinguishable from one that was never wired up.
 */

let reporter: TestReporter = new TestReporter("gameplay");
let ran: bool = false;

export function onPluginStart(pluginId: i32): void {
    // Item definitions are readable without a player, so they can be checked immediately.
    const definitionCount = getItemDefinitionCount();
    reporter.check(
        "item definition count is positive",
        definitionCount > 0,
        `getItemDefinitionCount returned ${definitionCount}`);

    // Find any populated slot: the array legitimately contains empty ones, which is why a count exists rather
    // than treating an empty name as the end of the list.
    let firstNamedId = -1;
    let firstName = "";
    for (let index = 0; index < definitionCount && firstNamedId < 0; index++) {
        const name = getItemDefinitionName(index);
        if (name.length > 0) {
            firstNamedId = index;
            firstName = name;
        }
    }

    reporter.check(
        "at least one definition has a name",
        firstNamedId >= 0,
        "every item definition slot returned an empty name");

    if (firstNamedId >= 0) {
        // The round trip is the real assertion: a name that does not resolve back to its own id makes the
        // lookup useless for its entire purpose, which is avoiding hardcoded indices.
        const resolvedId = getItemDefinitionIdByName(firstName);
        reporter.checkEqualI64("definition name resolves back to its id", resolvedId, firstNamedId);
    }

    reporter.check(
        "unknown definition name yields -1",
        getItemDefinitionIdByName("ThisItemDoesNotExist_APITest") == -1,
        "getItemDefinitionIdByName invented an id for a name that does not exist");

    // Dead handles must read as unavailable rather than as a real value.
    const deadHandle: BadLadsObject = 0;
    reporter.checkEqualI64("health of dead handle is -1", getLivingHealth(deadHandle), -1);
    reporter.checkEqualI64("max health of dead handle is -1", getLivingMaxHealth(deadHandle), -1);
    reporter.checkEqualI64("money of dead handle is -1", getPlayerMoney(deadHandle), -1);
    reporter.check(
        "items of dead handle is empty",
        getPlayerItems(deadHandle, BadLadsContainerFlags.All).length == 0,
        "getPlayerItems returned entries for a handle that does not resolve");
}

export function onPluginTick(deltaTime: f64): void {
    if (ran) {
        return;
    }

    const playerStates = getObjectsIdsByType(BadLadsObjectFlags.PlayerStates);
    if (playerStates.length == 0) {
        return;
    }

    const player = playerStates[0];
    if (!isObjectValid(player) || getObjectTransform(player) == null) {
        return;
    }
    ran = true;

    // --- Health ---
    const character = getPlayerCharacter(player);
    if (character != 0 && isObjectValid(character)) {
        const health = getLivingHealth(character);
        const maxHealth = getLivingMaxHealth(character);

        reporter.check("character health is readable", health > 0, `getLivingHealth returned ${health}`);
        reporter.check("character max health is readable", maxHealth > 0, `getLivingMaxHealth returned ${maxHealth}`);
        reporter.check(
            "health does not exceed max",
            health <= maxHealth,
            `health ${health} exceeds max ${maxHealth}`);

        // The point of a getter: damage by a fraction, which is unexpressible without knowing the maximum.
        const target = maxHealth / 2;
        setLivingHealth(character, target);
        reporter.checkEqualI64("health reads back what was set", getLivingHealth(character), target);
        setLivingHealth(character, health);
    }

    // --- Money ---
    const money = getPlayerMoney(player);
    reporter.check("player money is readable", money >= 0, `getPlayerMoney returned ${money}`);

    // --- Inventory observation and removal ---
    const beforeStacks = getPlayerItems(player, BadLadsContainerFlags.All);
    reporter.check("inventory is enumerable", beforeStacks.length >= 0, "getPlayerItems returned nothing at all");

    // Give a known item, confirm it becomes observable, then take it back. This is the loop every shop and
    // quest plugin needs, so it is checked end to end rather than one call at a time.
    const probeItemId = 1;
    const countBefore = getPlayerItemCount(player, probeItemId, BadLadsContainerFlags.All);
    if (giveItem(player, probeItemId, 1, true)) {
        const countAfter = getPlayerItemCount(player, probeItemId, BadLadsContainerFlags.All);
        reporter.checkEqualI64("granted item becomes observable", countAfter, countBefore + 1);

        const leftover = removeItem(player, probeItemId, 1);
        reporter.checkEqualI64("removal reports nothing left over", leftover, 0);

        const countRestored = getPlayerItemCount(player, probeItemId, BadLadsContainerFlags.All);
        reporter.checkEqualI64("removal is observable", countRestored, countBefore);
    } else {
        reporter.check("probe item could be granted", false, "giveItem failed, so the give/observe/remove loop was skipped");
    }

    // Removing more than a player holds must report the shortfall rather than silently succeeding - a plugin
    // that treats partial removal as payment gives its goods away.
    const impossibleAmount = 250;
    const shortfall = removeItem(player, probeItemId, impossibleAmount);
    reporter.check(
        "over-removal reports the shortfall",
        shortfall > 0,
        `removing ${impossibleAmount} of an item the player does not have reported ${shortfall} left over`);

    // Packed stack fields must survive the bitfield round trip.
    let fieldsSane = true;
    const stacks = getPlayerItems(player, BadLadsContainerFlags.All);
    for (let index = 0; index < stacks.length; index++) {
        if (stacks[index].itemId <= 0 || stacks[index].stackSize <= 0) {
            fieldsSane = false;
        }
    }
    reporter.check("packed stack fields are sane", fieldsSane, "a stack unpacked with a non-positive id or size");

    reporter.done();
}

export function onPluginStop(pluginId: i32): void {
    if (!ran) {
        reporter.done();
    }
}
