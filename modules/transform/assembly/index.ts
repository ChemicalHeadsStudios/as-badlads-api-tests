import {
    BadLadsObject,
    BadLadsObjectFlags,
    getObjectsIdsByType,
    getObjectTransform,
    setObjectTransform,
    isObjectValid,
    getPlayerCharacter,
    Transform,
    Vector,
    Rotation,
} from "@chemicalheads/as-badlads";
import { TestReporter, nearlyEqual } from "../../../harness/assembly/harness";

/**
 * Pins that BOTH spellings of the transform getter are linkable and behave identically.
 *
 * The original import name was misspelled `Tranform`. The host now registers the corrected name alongside it so
 * that plugin binaries compiled against older as-badlads keep linking. If the deprecated alias is ever dropped
 * without a deprecation cycle, every previously shipped plugin fails to instantiate - the module import simply does
 * not resolve - so this module declares the old name directly to keep that alias covered.
 */

// Deliberately raw: the SDK wrapper now points at the corrected name only.
// @ts-ignore: decorator
@external("badlads", "__hostGetObjectTranformOwnedF32s")
declare function __hostGetObjectTranformOwnedF32s_deprecated(object: BadLadsObject): ArrayBuffer;

// @ts-ignore: decorator
@external("badlads", "__hostGetObjectTransformOwnedF32s")
declare function __hostGetObjectTransformOwnedF32s_corrected(object: BadLadsObject): ArrayBuffer;

let reporter: TestReporter = new TestReporter("transform");
let ran: bool = false;

function readTransform(raw: ArrayBuffer): Transform | null {
    const floats = Float32Array.wrap(raw);
    if (floats.length < 9) {
        return null;
    }
    return new Transform(
        new Vector(floats[0], floats[1], floats[2]),
        new Rotation(floats[3], floats[4], floats[5]),
        new Vector(floats[6], floats[7], floats[8]));
}

export function onPluginTick(deltaTime: f64): void {
    if (ran) {
        return;
    }

    // Gate on the character existing rather than on a tick count: every assertion below reads a transform,
    // which resolves through the player state to its possessed character.
    const playerStates = getObjectsIdsByType(BadLadsObjectFlags.PlayerStates);
    if (playerStates.length == 0) {
        return;
    }

    const player = playerStates[0];
    if (!isObjectValid(player)) {
        return;
    }

    // Every assertion below reads a transform, so wait until one resolves.
    if (getObjectTransform(player) == null) {
        return;
    }
    ran = true;

    // Both import names must resolve at instantiation. Reaching this line at all proves the module linked, which
    // is most of the assertion - a missing import would have failed the instantiate, not returned null here.
    const viaDeprecated = readTransform(__hostGetObjectTranformOwnedF32s_deprecated(player));
    const viaCorrected = readTransform(__hostGetObjectTransformOwnedF32s_corrected(player));

    reporter.check(
        "deprecated name returns a transform",
        viaDeprecated != null,
        "the misspelled alias returned no transform - old plugin binaries would break");
    reporter.check(
        "corrected name returns a transform",
        viaCorrected != null,
        "the corrected name returned no transform");

    if (viaDeprecated != null && viaCorrected != null) {
        const a = <Transform>viaDeprecated;
        const b = <Transform>viaCorrected;

        // Read back-to-back on the same tick, so the two must agree exactly barring sub-tick movement.
        reporter.check(
            "both names agree on position",
            nearlyEqual(a.position.x, b.position.x, 1.0)
                && nearlyEqual(a.position.y, b.position.y, 1.0)
                && nearlyEqual(a.position.z, b.position.z, 1.0),
            `deprecated gave ${a.position}, corrected gave ${b.position}`);

        reporter.check(
            "both names agree on scale",
            nearlyEqual(a.scale.x, b.scale.x) && nearlyEqual(a.scale.y, b.scale.y) && nearlyEqual(a.scale.z, b.scale.z),
            `deprecated gave ${a.scale}, corrected gave ${b.scale}`);

        // Scale is the safest component to assert an absolute value on: characters are authored at unit scale and
        // nothing in normal play changes it.
        reporter.check(
            "scale is sane",
            a.scale.x > 0.0 && a.scale.y > 0.0 && a.scale.z > 0.0,
            `expected positive scale, got ${a.scale}`);
    }

    // Round-trip through the wrapper, restoring the original afterwards.
    const original = getObjectTransform(player);
    if (original != null) {
        const before = <Transform>original;
        const nudged = new Transform(
            new Vector(before.position.x, before.position.y, before.position.z + 50.0),
            before.rotation,
            before.scale);

        reporter.check("set transform succeeds", setObjectTransform(player, nudged), "setObjectTransform returned false");

        const after = getObjectTransform(player);
        if (after != null) {
            reporter.check(
                "set is observable through get",
                nearlyEqual((<Transform>after).position.z, nudged.position.z, 5.0),
                `expected z near ${nudged.position.z}, got ${(<Transform>after).position.z}`);
        }

        setObjectTransform(player, before);
    }

    reporter.done();
}

export function onPluginStop(pluginId: i32): void {
    if (!ran) {
        reporter.done();
    }
}
