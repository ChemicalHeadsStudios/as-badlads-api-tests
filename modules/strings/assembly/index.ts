import {
    BadLadsObject,
    BadLadsObjectFlags,
    getObjectsIdsByType,
    getPlayerName,
    getPlayerJob,
    getBadLadsVersion,
    getObjectFlagClassName,
    getEstateVolumeBuildables,
    isObjectValid,
    getPlayerCharacter,
} from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins string and buffer marshalling in both directions, with emphasis on the empty and failed cases.
 *
 * Empty is the common case, not the edge case: any lookup against a handle that no longer resolves returns an
 * empty string, and a guest must be able to tell that apart from a pointer it should not follow.
 */

let reporter: TestReporter = new TestReporter("strings");
let ran: bool = false;

export function onPluginStart(pluginId: i32): void {
    // Host -> guest, non-empty. The version string is always present, so this is the simplest possible round trip.
    const version = getBadLadsVersion();
    reporter.check(
        "version string is non-empty",
        version.length > 0,
        "getBadLadsVersion returned an empty string");

    // Host -> guest, class name for a mapped flag.
    const className = getObjectFlagClassName(BadLadsObjectFlags.PlayerStates);
    reporter.check(
        "class name is non-empty",
        className.length > 0,
        "getObjectFlagClassName returned empty for PlayerStates");
    reporter.check(
        "class name has no trailing null",
        className.length > 0 && className.charCodeAt(className.length - 1) != 0,
        `class name "${className}" ends with a null character - the terminator leaked into the string`);

    // --- Empty-result paths: these must yield a clean empty string, not garbage ---
    const deadHandle: BadLadsObject = 0;

    const nameOfNothing = getPlayerName(deadHandle);
    reporter.check(
        "name of dead handle is empty",
        nameOfNothing.length == 0,
        `expected an empty string for a dead handle, got "${nameOfNothing}" (${nameOfNothing.length} chars)`);

    const jobOfNothing = getPlayerJob(deadHandle);
    reporter.check(
        "job of dead handle is empty",
        jobOfNothing.length == 0,
        `expected an empty string for a dead handle, got "${jobOfNothing}" (${jobOfNothing.length} chars)`);

    // A never-valid handle with a plausible-looking serial exercises the same path with a non-zero input.
    const bogusHandle: BadLadsObject = (<u64>0x7ffffff0 << 32) | <u64>BadLadsObjectFlags.PlayerStates;
    reporter.check(
        "bogus handle does not resolve",
        !isObjectValid(bogusHandle),
        "a fabricated handle resolved");
    const nameOfBogus = getPlayerName(bogusHandle);
    reporter.check(
        "name of bogus handle is empty",
        nameOfBogus.length == 0,
        `expected an empty string for a fabricated handle, got "${nameOfBogus}"`);

    // Empty array path: buildables of a non-existent estate volume.
    const buildables = getEstateVolumeBuildables(deadHandle);
    reporter.check(
        "buildables of dead handle is an empty array",
        buildables.length == 0,
        `expected 0 buildables for a dead handle, got ${buildables.length}`);
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

    // Gate on the character having spawned rather than on a tick count. Deliberately not gated on the player
    // name being non-empty - that is one of the things asserted below, and gating on it would make it vacuous.
    const character = getPlayerCharacter(player);
    if (character == 0 || !isObjectValid(character)) {
        return;
    }
    ran = true;

    // Live lookups: names come back intact, with no terminator bleed and no truncation.
    const name = getPlayerName(player);
    reporter.check("live player name is non-empty", name.length > 0, "getPlayerName returned empty for a live player");
    reporter.check(
        "live player name has no trailing null",
        name.length > 0 && name.charCodeAt(name.length - 1) != 0,
        `player name "${name}" ends with a null character`);

    // Repeated reads must be identical - a marshalling bug that drops the final character tends to be stable, so
    // compare against a second read of the same source rather than assuming a length.
    const nameAgain = getPlayerName(player);
    reporter.checkEqualStr("player name is stable across reads", nameAgain, name);

    reporter.done();
}

export function onPluginStop(pluginId: i32): void {
    if (!ran) {
        reporter.done();
    }
}
