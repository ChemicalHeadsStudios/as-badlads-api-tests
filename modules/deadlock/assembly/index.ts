import { postGlobalChatMessage, getGameTime, Color } from "@chemicalheads/as-badlads";

/**
 * OPT-IN. This module deliberately spins forever inside onPluginTick.
 *
 * It is not built by `npm run build`. Use `npm run build:deadlock`, and only load it on a server you are willing
 * to lose - if the fuel watchdog is disabled (`PluginFuelPerCall = 0`) or absent, this hangs the game thread
 * permanently and the server has to be killed from outside.
 *
 * Expected behaviour with the watchdog enabled:
 *   - the spinning call burns its fuel budget and traps
 *   - the server logs that the plugin exhausted its budget, and keeps running
 *   - the plugin stays loaded; the next tick is refuelled and runs normally, so it traps again each tick
 *
 * The point is to prove the server survives, not that the plugin does. A plugin that traps every tick is broken -
 * the watchdog's job is to make it *only* the plugin's problem.
 */

let ticks: i32 = 0;
let sink: f64 = 0.0;

export function onPluginStart(pluginId: i32): void {
    postGlobalChatMessage(
        "[APITEST] deadlock/armed this plugin will now spin forever on every tick - the server should survive",
        Color.RED);
}

export function onPluginTick(deltaTime: f64): void {
    ticks += 1;

    postGlobalChatMessage(`[APITEST] deadlock/tick ${ticks} entering infinite loop`, Color.RED);

    // Deliberately unbounded. `sink` exists so the loop body cannot be optimised away, and the loop reads a host
    // value so it cannot be constant-folded either.
    while (true) {
        sink += getGameTime();
        if (sink < 0.0) {
            // Never true; present only to keep the compiler from proving the loop infinite and reshaping it.
            break;
        }
    }
}

export function onPluginStop(pluginId: i32): void {
    postGlobalChatMessage(`[APITEST] deadlock/stopped after ${ticks} trapped ticks`, Color.WHITE);
}
