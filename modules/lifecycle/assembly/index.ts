import {
    BadLadsObject,
    getPlayerName,
    isObjectValid,
    postGlobalChatMessage,
    Color,
} from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins that lifecycle events reach plugins.
 *
 * From inside a guest, an event that is never raised is indistinguishable from one that is raised and ignored,
 * so each case here asserts the callback was entered rather than checking any state it might have changed.
 */

let reporter: TestReporter = new TestReporter("lifecycle");
let startCalled: bool = false;
let receivedPluginId: i32 = -1;
let loginCount: i32 = 0;
let logoutCount: i32 = 0;

export function onPluginStart(pluginId: i32): void {
    startCalled = true;
    receivedPluginId = pluginId;

    // A plugin id of exactly 0 is legitimate for the first plugin loaded, so the assertion is that it is a small
    // non-negative index rather than any particular value.
    reporter.check("onPluginStart called", true);
    reporter.check(
        "pluginId is sane",
        pluginId >= 0 && pluginId < 1024,
        `pluginId was ${pluginId}, expected a small non-negative index`);

    postGlobalChatMessage("[APITEST] lifecycle armed; connect and disconnect a player to finish", Color.WHITE);
}

export function onPlayerLogin(playerState: BadLadsObject): void {
    loginCount += 1;

    reporter.check("onPlayerLogin called", true);
    reporter.check(
        "login handle resolves",
        isObjectValid(playerState),
        "player state handle from onPlayerLogin did not resolve");

    // Exercises the object registry through a real event handle rather than an enumerated one.
    const name = getPlayerName(playerState);
    reporter.check(
        "login handle yields a name",
        name.length > 0,
        "getPlayerName returned an empty string for a live player state");

    // Report what is known so far. Everything remaining here is keyed to logout, which the controller only
    // triggers after it has waited for every module to report - so holding the only DONE until then deadlocks.
    // Later reports carry more cases and supersede this one.
    reporter.done();
}

export function onPlayerLogout(playerState: BadLadsObject): void {
    logoutCount += 1;

    reporter.check("onPlayerLogout called", true);
    reporter.check(
        "logout ordering",
        loginCount >= logoutCount,
        `saw ${logoutCount} logouts against ${loginCount} logins`);

    reporter.done();
}

export function onLivingDeath(victim: BadLadsObject, killerPlayerState: BadLadsObject): void {
    reporter.check("onLivingDeath called", true);

    // The killer is genuinely optional - environmental deaths report no killer - so only the victim is required.
    reporter.check(
        "death victim handle resolves",
        isObjectValid(victim),
        "victim handle from onLivingDeath did not resolve");
}

export function onBecomeJob(playerState: BadLadsObject, jobName: ArrayBuffer): void {
    reporter.check("onBecomeJob called", true);
    reporter.check(
        "job name buffer is non-empty",
        jobName.byteLength > 0,
        "onBecomeJob delivered a zero-length job name buffer");
}

export function onPluginStop(pluginId: i32): void {
    // Reaching here at all is the assertion.
    reporter.check("onPluginStop called", startCalled, "onPluginStop fired without a prior onPluginStart");
    reporter.checkEqualI64("pluginId stable across stop", pluginId, receivedPluginId);
    reporter.done();
}
