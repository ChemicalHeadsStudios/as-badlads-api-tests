import {
    BadLadsObject,
    BadLadsObjectFlags,
    getObjectsIdsByType,
    getPlayerJob,
    setPlayerJob,
    giveItem,
    setObjectTransform,
    getObjectTransform,
    isObjectValid,
    getPlayerCharacter,
    Transform,
} from "@chemicalheads/as-badlads";
import { TestReporter, nearlyEqual } from "../../../harness/assembly/harness";

/**
 * Pins that host functions returning success or failure return the truth.
 *
 * A call that succeeds but reports failure is worse than one that fails outright: a plugin that retries turns it
 * into a duplicated side effect, granting an item twice or reassigning a job twice. Both directions are checked.
 */

let reporter: TestReporter = new TestReporter("results");
let ran: bool = false;

export function onPluginTick(deltaTime: f64): void {
    if (ran) {
        return;
    }

    // Gate on the precondition these assertions actually need - a player whose character has spawned - rather
    // than on a tick count. A count is really a disguised timer whose length depends on the server's frame rate.
    const playerStates = getObjectsIdsByType(BadLadsObjectFlags.PlayerStates);
    if (playerStates.length == 0) {
        return;
    }

    const player = playerStates[0];
    if (!isObjectValid(player)) {
        return;
    }

    // The transform round-trip below reads through the player state to its pawn.
    if (getObjectTransform(player) == null) {
        return;
    }
    ran = true;

    // --- Failure paths must report failure ---
    // A dead handle must not be reported as a successful operation.
    const deadHandle: BadLadsObject = 0;
    reporter.check(
        "giveItem on null handle fails",
        !giveItem(deadHandle, 1, 1, true),
        "giveItem reported success for a null handle");
    reporter.check(
        "setPlayerJob on null handle fails",
        !setPlayerJob(deadHandle, "Citizen"),
        "setPlayerJob reported success for a null handle");

    // A job that does not exist must fail rather than silently succeeding.
    reporter.check(
        "setPlayerJob with unknown job fails",
        !setPlayerJob(player, "ThisJobDoesNotExist_APITest"),
        "setPlayerJob reported success for a job name that does not exist");

    // --- Success paths must report success ---
    // Read the current job first so the test restores it and leaves the server as it found it.
    const originalJob = getPlayerJob(player);
    reporter.check(
        "getPlayerJob returns a job",
        originalJob.length > 0,
        "getPlayerJob returned an empty string for a live player");

    if (originalJob.length > 0) {
        // Reassigning the job a player already has is a no-op for the player but still a successful call.
        const reassigned = setPlayerJob(player, originalJob, false, false, false, false, false);
        reporter.check(
            "setPlayerJob success is reported",
            reassigned,
            `setPlayerJob returned false when assigning the player's current job "${originalJob}"`);

        const jobAfter = getPlayerJob(player);
        reporter.checkEqualStr("job unchanged after reassignment", jobAfter, originalJob);
    }

    // giveItem with a real item id should succeed against a player with inventory space. A false result here is
    // only conclusive if the inventory had room, so this is reported as a soft case.
    const gaveItem = giveItem(player, 1, 1, true);
    reporter.check(
        "giveItem success is reported",
        gaveItem,
        "giveItem returned false; if the target inventory was full this is expected, otherwise it is a regression");

    // --- Transform set/get round trip ---
    const current = getObjectTransform(player);
    if (current != null) {
        const original = <Transform>current;

        // Nudge upward rather than teleporting: keeps the test harmless on a live server.
        const moved = new Transform(original.position, original.rotation, original.scale);
        moved.position.z = original.position.z + 50.0;

        const setOk = setObjectTransform(player, moved);
        reporter.check("setObjectTransform success is reported", setOk, "setObjectTransform returned false");

        const readBack = getObjectTransform(player);
        if (readBack != null) {
            const after = <Transform>readBack;
            reporter.check(
                "transform round-trips",
                nearlyEqual(after.position.z, moved.position.z, 5.0),
                `expected z near ${moved.position.z}, got ${after.position.z}`);
        } else {
            reporter.check("transform readable after set", false, "getObjectTransform returned null after a set");
        }

        // Put them back where they started.
        setObjectTransform(player, original);
    }

    reporter.done();
}

export function onPluginStop(pluginId: i32): void {
    if (!ran) {
        reporter.done();
    }
}
