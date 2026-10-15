import { getTimeOfDay, setTimeOfDay } from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins setTimeOfDay / getTimeOfDay.
 *
 * Rejections are checked first because they hold in any world. The read-back needs a sun, and a test map may not
 * have one: getTimeOfDay answers -1 then, which is reported as its own case rather than quietly skipped, so a world
 * without a sun cannot pass for one that moved the day.
 */

const SET_HOUR: f32 = 6.5;

/** Ticks to let the sun act on the new hour before reading it back. */
const TICKS_TO_SETTLE: i32 = 30;

/** The day runs on while the test waits, so the read-back is compared to the hour with room for that. */
const HOUR_TOLERANCE: f32 = 1.0;

const HOURS_PER_DAY: f32 = 24.0;

let reporter: TestReporter = new TestReporter("timeofday");
let ticks: i32 = 0;
let hasSun: bool = false;
let reported: bool = false;

/** Distance between two hours of the day, going round midnight the short way. */
function hourDistance(a: f32, b: f32): f32 {
    let distance = abs<f32>(a - b);
    if (distance > HOURS_PER_DAY / 2.0) {
        distance = HOURS_PER_DAY - distance;
    }
    return distance;
}

export function onPluginTick(deltaTime: f64): void {
    if (reported) {
        return;
    }

    ticks += 1;

    if (ticks == 1) {
        const nan: f32 = <f32>NaN;
        reporter.check("rejects an hour below zero", !setTimeOfDay(-0.5),
            "setTimeOfDay reported success for -0.5");
        reporter.check("rejects an hour above a day", !setTimeOfDay(24.5),
            "setTimeOfDay reported success for 24.5");
        reporter.check("rejects NaN", !setTimeOfDay(nan),
            "setTimeOfDay reported success for NaN");

        const before = getTimeOfDay();
        hasSun = before >= 0.0;
        if (hasSun) {
            reporter.check("hour is within a day", before <= HOURS_PER_DAY,
                `getTimeOfDay returned ${before}, expected 0 to 24`);
        } else {
            reporter.check("a world without a sun reads -1", before == -1.0,
                `getTimeOfDay returned ${before} in a world without a sun, expected -1`);
        }

        reporter.check("accepts a valid hour", setTimeOfDay(SET_HOUR),
            "setTimeOfDay reported failure for 6.5");
        return;
    }

    if (ticks < TICKS_TO_SETTLE) {
        return;
    }
    reported = true;

    if (hasSun) {
        const after = getTimeOfDay();
        reporter.check("the sun moves to the set hour", hourDistance(after, SET_HOUR) <= HOUR_TOLERANCE,
            `getTimeOfDay returned ${after} after setting ${SET_HOUR}`);
    }

    reporter.done();
}
