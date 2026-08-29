# as-badlads-api-tests

Conformance tests for the BadLads WASM host API, written against
[`as-badlads`](https://github.com/ChemicalHeadsStudios/as-badlads).

Each module is a real server plugin that exercises one area of the host API and reports pass/fail as structured
log lines. They are meant to be loaded by an automated test that asserts on those lines, but they are equally
usable by hand: drop a built module in your `BadLadsPlugins` folder and read chat.

## Why these exist

The host API can only be meaningfully tested from inside the sandbox. A plugin that receives no events and a
plugin that resolves no object handles both look, from the host side, exactly like a plugin that had nothing to
do. These modules assert that callbacks are actually reached and that values actually come back, so the two stop
being indistinguishable.

## Result protocol

Modules report through `postGlobalChatMessage` using a fixed prefix so a controller can scrape them:

```
[APITEST] <module>/<case> PASS
[APITEST] <module>/<case> FAIL <detail>
[APITEST] <module> DONE <passed>/<total>
```

A module that never emits `DONE` either failed to load or stopped partway. That is itself a failure, and the
harness treats a missing `DONE` as one rather than as a skip.

## Modules

| Module | Covers |
| --- | --- |
| `lifecycle` | Plugin start and stop, player login and logout, death and job change callbacks. |
| `objects` | Object handle enumeration, resolution, stability and type checking. |
| `results` | Host functions that report success or failure return the truth. |
| `strings` | String and buffer marshalling both directions, including empty results. |
| `transform` | Transform round trip, through both the current and deprecated import names. |
| `chat` | Chat message veto semantics and colour round trip. |
| `timing` | Tick delta sanity and monotonic game time. |
| `gameplay` | Inventory reads, item removal, item definition lookup, health and player balance. |
| `deadlock` | **Opt-in.** Spins forever to verify the execution watchdog. Not built by default. |

## Building

```bash
npm install
npm run build          # every module except deadlock, into dist/<module>/plugin.wasm
npm run build:deadlock # opt-in
```

Each built module lands in `dist/<module>/` next to its `plugin.json`, ready to copy into a server's
`BadLadsPlugins` directory.

## Adding a module

Create `modules/<name>/` with an `assembly/index.ts` and a `plugin.json`, import `TestReporter` from the shared
harness, and report through it. The build script picks up any directory under `modules/`.

Gate work on the state a module needs - a player state whose pawn has spawned, for instance - rather than on a
tick count. A tick count is a timer whose length depends on the server's frame rate, so it makes the same test
cost wildly different wall-clock on a loaded server than on an idle one.

If a module's final result depends on an event the harness triggers later, such as a disconnect, report what is
known first and report again when the event arrives. The richer report supersedes the earlier one.
