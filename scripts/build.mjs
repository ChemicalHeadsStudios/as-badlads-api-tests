#!/usr/bin/env node
/**
 * Builds every test module into dist/<module>/ as plugin.wasm plus its plugin.json, ready to drop into a server's
 * BadLadsPlugins directory.
 *
 * `deadlock` is excluded unless --include-deadlock is passed: loading it on a server without the fuel watchdog
 * hangs the game thread permanently, so it should never end up in a directory by accident.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = join(ROOT, "modules");
const DIST_DIR = join(ROOT, "dist");

/** Modules that are unsafe to load casually and must be requested explicitly. */
const OPT_IN = new Set(["deadlock"]);

const args = process.argv.slice(2);
const includeDeadlock = args.includes("--include-deadlock");
const clean = args.includes("--clean");

if (clean) {
    rmSync(DIST_DIR, { recursive: true, force: true });
    console.log("removed dist/");
    process.exit(0);
}

const discovered = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const selected = discovered.filter((name) => !OPT_IN.has(name) || includeDeadlock);
const skipped = discovered.filter((name) => !selected.includes(name));

if (selected.length === 0) {
    console.error("no modules to build");
    process.exit(1);
}

mkdirSync(DIST_DIR, { recursive: true });

const failures = [];

for (const name of selected) {
    const moduleDir = join(MODULES_DIR, name);
    const entry = join(moduleDir, "assembly", "index.ts");
    const manifest = join(moduleDir, "plugin.json");
    const outDir = join(DIST_DIR, name);
    const outWasm = join(outDir, "plugin.wasm");

    if (!existsSync(entry)) {
        failures.push(`${name}: missing assembly/index.ts`);
        continue;
    }
    if (!existsSync(manifest)) {
        failures.push(`${name}: missing plugin.json`);
        continue;
    }

    mkdirSync(outDir, { recursive: true });

    // --exportRuntime is mandatory: the host calls __new/__pin/__unpin to hand buffers to the guest, and without
    // it those exports are absent and every string or array the host returns fails to allocate.
    const ascArgs = [
        "asc",
        entry,
        "--outFile", outWasm,
        "--optimize",
        "--exportRuntime",
        "--runtime", "incremental",
    ];

    process.stdout.write(`building ${name} ... `);
    try {
        execFileSync("npx", ascArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
        copyFileSync(manifest, join(outDir, "plugin.json"));
        console.log("ok");
    } catch (error) {
        console.log("FAILED");
        const detail = (error.stderr ?? error.stdout ?? Buffer.from("")).toString().trim();
        failures.push(`${name}:\n${detail}`);
    }
}

for (const name of skipped) {
    console.log(`skipped ${name} (opt-in; pass --include-deadlock to build it)`);
}

if (failures.length > 0) {
    console.error(`\n${failures.length} module(s) failed to build:\n`);
    for (const failure of failures) {
        console.error(failure);
        console.error("");
    }
    process.exit(1);
}

console.log(`\nbuilt ${selected.length} module(s) into dist/`);
