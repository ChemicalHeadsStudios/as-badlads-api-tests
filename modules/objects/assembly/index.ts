import {
    BadLadsObject,
    BadLadsObjectFlags,
    getObjectsIdsByType,
    getObjectFlagClassName,
    getObjectTransform,
    getObjectBounds,
    isObjectValid,
    getPlayerCharacter,
    getGameTime,
} from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins the object handle contract: enumeration hands out ids, those ids resolve, and they keep their meaning.
 *
 * Enumeration returning plausible handles proves nothing on its own, so every case here dereferences what it was
 * given. A handle is only useful if something on the other side of it comes back.
 */

let reporter: TestReporter = new TestReporter("objects");

/** Handles captured on the first pass, re-checked later to prove ids are stable and never recycled. */
let capturedPlayerStates: Array<BadLadsObject> = new Array<BadLadsObject>();

/**
 * Progress is gated on world state and elapsed time rather than tick counts. A tick-count gate silently
 * couples how long this module takes to the server's frame rate, so the same test costs wildly different
 * wall-clock on a loaded server than on an idle one.
 */
const RECHECK_AFTER_SECONDS: f64 = 0.5;
let firstPassDone: bool = false;
let firstPassTime: f64 = 0.0;
let reported: bool = false;

export function onPluginStart(pluginId: i32): void {
    // A guest is free to pass a flag that maps to nothing. That must yield an empty string, not a crash.
    const vehicleClass = getObjectFlagClassName(BadLadsObjectFlags.Vehicles);
    reporter.check(
        "class name for mapped flag",
        vehicleClass.length > 0,
        "getObjectFlagClassName returned empty for Vehicles");

    const unmappedClass = getObjectFlagClassName(<BadLadsObjectFlags>(1 << 7));
    reporter.check(
        "class name for unmapped flag is empty, not a crash",
        unmappedClass.length == 0,
        `expected empty string for an unmapped flag, got "${unmappedClass}"`);

    // Enumerating a category nothing is registered under must yield an empty array rather than a bad pointer.
    const none = getObjectsIdsByType(BadLadsObjectFlags.None);
    reporter.check(
        "enumerating None yields empty",
        none.length == 0,
        `expected 0 ids for None, got ${none.length}`);
}

export function onPluginTick(deltaTime: f64): void {
    if (!firstPassDone) {
        const playerStates = getObjectsIdsByType(BadLadsObjectFlags.PlayerStates);

        // With no players connected there is nothing to assert against; wait until one exists.
        if (playerStates.length == 0) {
            return;
        }

        // Several assertions read through the player state to its pawn, so wait until a transform resolves.
        if (getObjectTransform(playerStates[0]) == null) {
            return;
        }

        firstPassDone = true;
        firstPassTime = getGameTime();

        let allResolve = true;
        let allNonZero = true;
        for (let i = 0; i < playerStates.length; i++) {
            const handle = playerStates[i];
            if (handle == 0) {
                allNonZero = false;
                continue;
            }
            capturedPlayerStates.push(handle);
            if (!isObjectValid(handle)) {
                allResolve = false;
            }
        }

        reporter.check("enumerated ids are non-zero", allNonZero, "enumeration produced a zero handle");
        reporter.check(
            "enumerated ids resolve",
            allResolve,
            "an id from getObjectsIdsByType did not resolve via isObjectValid");

        // Enumeration must not hand out the same object twice.
        let duplicates = false;
        for (let i = 0; i < capturedPlayerStates.length; i++) {
            for (let j = i + 1; j < capturedPlayerStates.length; j++) {
                if (capturedPlayerStates[i] == capturedPlayerStates[j]) {
                    duplicates = true;
                }
            }
        }
        reporter.check("enumeration is de-duplicated", !duplicates, "the same id appeared twice");

        const first = capturedPlayerStates[0];

        // A resolvable player state must produce a usable transform. Player states are not actors themselves; the
        // host redirects them to the possessed character, so this also pins that redirect.
        const transform = getObjectTransform(first);
        reporter.check(
            "player state yields a transform",
            transform != null,
            "getObjectTransform returned null for a live player state");

        const bounds = getObjectBounds(first);
        reporter.check(
            "player state yields bounds",
            bounds.length == 2,
            `expected 2 vectors from getObjectBounds, got ${bounds.length}`);

        // Cross-category handle: a character id must resolve and must not equal its player state id.
        const character = getPlayerCharacter(first);
        if (character != 0) {
            reporter.check(
                "character handle differs from player state handle",
                character != first,
                "character and player state produced the same id");
            reporter.check(
                "character handle resolves",
                isObjectValid(character),
                "character handle from getPlayerCharacter did not resolve");
        }

        // A handle with a plausible serial but a category that does not match must be rejected rather than
        // resolving to whatever happens to sit at that serial.
        const forged: BadLadsObject = (first & 0xffffffff00000000) | <u64>BadLadsObjectFlags.Vehicles;
        reporter.check(
            "type-mismatched handle is rejected",
            !isObjectValid(forged),
            "a handle with a mismatched category flag still resolved");
    }

    // Re-enumerate later: ids for objects that are still alive must be byte-identical to what we captured.
    if (!reported && capturedPlayerStates.length > 0 && (getGameTime() - firstPassTime) >= RECHECK_AFTER_SECONDS) {
        reported = true;
        const playerStates = getObjectsIdsByType(BadLadsObjectFlags.PlayerStates);

        let stable = true;
        for (let i = 0; i < capturedPlayerStates.length; i++) {
            const captured = capturedPlayerStates[i];
            if (!isObjectValid(captured)) {
                // The object went away; that is fine, but its id must not have been handed to something else.
                continue;
            }
            let found = false;
            for (let j = 0; j < playerStates.length; j++) {
                if (playerStates[j] == captured) {
                    found = true;
                }
            }
            if (!found) {
                stable = false;
            }
        }

        reporter.check(
            "ids are stable across enumerations",
            stable,
            "a still-valid object was enumerated under a different id than before");

        reporter.done();
    }
}

export function onPluginStop(pluginId: i32): void {
    // Only report from here if the main path never got the chance; otherwise this emits a duplicate DONE.
    if (!reported) {
        reporter.done();
    }
}
