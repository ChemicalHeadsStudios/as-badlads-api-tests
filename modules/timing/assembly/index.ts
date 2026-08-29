import { getGameTime, postGlobalChatMessage, Color } from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins onPluginTick timing.
 *
 * The delta must be real elapsed time, including on the very first tick, where a plugin integrating against it -
 * a decay timer, a payout accumulator - would otherwise apply a large step on its first frame.
 *
 * Scheduling is deliberately not asserted to a fixed interval: plugins are spread across frames and each becomes
 * due on its own schedule, so the effective rate legitimately drops under server load.
 */

const EXPECTED_MAX_FIRST_DELTA: f64 = 1.0;

/**
 * Ticks to observe before reporting. Kept low deliberately: the point is to characterise the schedule, and a
 * high threshold turns a slow-but-correct scheduler into a test that never reports at all rather than one that
 * reports a low rate. A heartbeat is emitted on the way so a stall is visible instead of silent.
 */
const TICKS_TO_OBSERVE: i32 = 40;
const HEARTBEAT_EVERY: i32 = 10;

let reporter: TestReporter = new TestReporter("timing");
let ticks: i32 = 0;
let accumulatedDelta: f64 = 0.0;
let startGameTime: f64 = 0.0;
let lastGameTime: f64 = 0.0;
let sawNonPositiveDelta: bool = false;
let sawImplausibleDelta: bool = false;
let reported: bool = false;

export function onPluginStart(pluginId: i32): void {
    // Raw probe, deliberately not through the reporter: this module has been reaching onPluginTick while
    // producing no onPluginStart output at all, which would also be the symptom if the reporter global were
    // not yet initialised when the host makes its first call.
    postGlobalChatMessage("[APITEST] timing/probe onPluginStart entered", Color.WHITE);

    startGameTime = getGameTime();
    reporter.check("game time is positive at start", startGameTime > 0.0, `getGameTime returned ${startGameTime}`);
    lastGameTime = startGameTime;
}

export function onPluginTick(deltaTime: f64): void {
    ticks += 1;

    // Raw probe for the first few ticks, bypassing the reporter, so "the callback is not being invoked" and
    // "the callback runs but its output is being swallowed" stop looking identical in the log.
    if (ticks <= 3) {
        postGlobalChatMessage(`[APITEST] timing/probe tick ${ticks} delta ${deltaTime}`, Color.WHITE);
    }

    if (ticks == 1) {
        // The first tick has no previous sample to measure against. Zero is the correct answer; a large value means
        // the plugin is being handed time that elapsed before it existed.
        reporter.check(
            "first delta is not time-since-boot",
            deltaTime >= 0.0 && deltaTime <= EXPECTED_MAX_FIRST_DELTA,
            `first onPluginTick delta was ${deltaTime}s, expected 0 or a single frame`);
    } else {
        if (deltaTime <= 0.0) {
            sawNonPositiveDelta = true;
        }
        // A single tick standing in for more than a few seconds means the schedule stalled badly.
        if (deltaTime > 5.0) {
            sawImplausibleDelta = true;
        }
        accumulatedDelta += deltaTime;
    }

    // Game time must advance monotonically across ticks.
    const now = getGameTime();
    if (now < lastGameTime) {
        reporter.check("game time is monotonic", false, `game time went backwards: ${lastGameTime} -> ${now}`);
    }
    lastGameTime = now;

    if (ticks % HEARTBEAT_EVERY == 0 && ticks < TICKS_TO_OBSERVE) {
        postGlobalChatMessage(`[APITEST] timing/heartbeat tick ${ticks}`, Color.WHITE);
    }

    if (ticks >= TICKS_TO_OBSERVE && !reported) {
        reported = true;

        reporter.check("deltas are positive after the first", !sawNonPositiveDelta, "saw a zero or negative delta");
        reporter.check("no implausible delta spikes", !sawImplausibleDelta, "saw a delta above 5s");

        // The sum of deltas must track real elapsed server time. This is the assertion that deltas are measured
        // rather than assumed: a hardcoded 1/rate would drift away from the wall clock under load.
        const wallElapsed = lastGameTime - startGameTime;
        const drift = accumulatedDelta > wallElapsed
            ? accumulatedDelta - wallElapsed
            : wallElapsed - accumulatedDelta;

        reporter.check(
            "accumulated delta tracks elapsed game time",
            drift < (wallElapsed * 0.25 + 1.0),
            `summed deltas ${accumulatedDelta}s against ${wallElapsed}s of game time (drift ${drift}s)`);

        const effectiveRate = wallElapsed > 0.0 ? <f64>ticks / wallElapsed : 0.0;
        postGlobalChatMessage(
            `[APITEST] timing/observed effective tick rate ${effectiveRate}Hz over ${wallElapsed}s`,
            Color.WHITE);

        reporter.done();
    }
}

export function onPluginStop(pluginId: i32): void {
    if (!reported) {
        reporter.check(
            "ticked at least once before stop",
            ticks > 0,
            "onPluginTick never fired - the plugin was not registered as tickable");
        reporter.done();
    }
}
