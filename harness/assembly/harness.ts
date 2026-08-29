import { postGlobalChatMessage, Color } from "@chemicalheads/as-badlads";

/**
 * Shared reporting harness. Every module reports through these so a test controller can scrape one fixed format:
 *
 *   [APITEST] <module>/<case> PASS
 *   [APITEST] <module>/<case> FAIL <detail>
 *   [APITEST] <module> DONE <passed>/<total>
 *
 * Results go through global chat because that is the one host output path a guest can reach that a controller can
 * observe. Failures are red so a human watching the server also sees them.
 */
export class TestReporter {
    private moduleName: string;
    private passed: i32 = 0;
    private total: i32 = 0;

    constructor(moduleName: string) {
        this.moduleName = moduleName;
    }

    /**
     * Record a case. `detail` is only emitted on failure, and should say what was expected versus what happened -
     * a bare "FAIL" tells whoever reads the log nothing actionable.
     */
    check(caseName: string, condition: bool, detail: string = ""): bool {
        this.total += 1;
        if (condition) {
            this.passed += 1;
            postGlobalChatMessage(`[APITEST] ${this.moduleName}/${caseName} PASS`, Color.GREEN);
            return true;
        }
        postGlobalChatMessage(`[APITEST] ${this.moduleName}/${caseName} FAIL ${detail}`, Color.RED);
        return false;
    }

    checkEqualI64(caseName: string, actual: i64, expected: i64): bool {
        return this.check(caseName, actual == expected, `expected ${expected}, got ${actual}`);
    }

    checkEqualStr(caseName: string, actual: string, expected: string): bool {
        return this.check(caseName, actual == expected, `expected "${expected}", got "${actual}"`);
    }

    /**
     * Emit the terminator. A controller treats a missing DONE as a failure rather than a skip, since a module
     * that stopped partway through would otherwise look like it simply had nothing to say.
     */
    done(): void {
        const allPassed = this.passed == this.total;
        postGlobalChatMessage(
            `[APITEST] ${this.moduleName} DONE ${this.passed}/${this.total}`,
            allPassed ? Color.GREEN : Color.RED);
    }

    passedCount(): i32 { return this.passed; }
    totalCount(): i32 { return this.total; }
}

/**
 * Rough float comparison for transform round-trips. The host stores rotations as FRotator and normalises them, so
 * an exact bit compare is the wrong test even when the round-trip is correct.
 */
export function nearlyEqual(a: f32, b: f32, tolerance: f32 = 0.01): bool {
    const diff = a > b ? a - b : b - a;
    return diff <= tolerance;
}
