import {
    BadLadsObject,
    postGlobalChatMessage,
    postPlayerMessage,
    decodeString,
    getPlayerName,
    isObjectValid,
    Color,
} from "@chemicalheads/as-badlads";
import { TestReporter } from "../../../harness/assembly/harness";

/**
 * Pins onPlayerChatMessage veto semantics and colour marshalling.
 *
 * The veto is combined across every loaded plugin, so a plugin that does not care about a message must not be
 * able to suppress it. This module therefore returns true for everything except one explicit trigger phrase; any
 * other message being dropped is a host problem, and it can only be seen from outside, because a suppressed
 * message produces no guest callback at all.
 *
 * Colours cross the boundary as a packed integer whose byte layout has to agree exactly on both sides.
 */

const VETO_PHRASE: string = "apitest-veto-me";

let reporter: TestReporter = new TestReporter("chat");
let messagesSeen: i32 = 0;
let vetoesIssued: i32 = 0;

export function onPluginStart(pluginId: i32): void {
    // Colour round-trip. These land in the server log and in chat; a mismatch in the packed byte layout shows up
    // as visibly wrong colours rather than as a failed assertion, so this is reported for eyeball verification.
    postGlobalChatMessage("[APITEST] chat/colour RED should be red", Color.RED);
    postGlobalChatMessage("[APITEST] chat/colour GREEN should be green", Color.GREEN);
    postGlobalChatMessage("[APITEST] chat/colour BLUE should be blue", Color.BLUE);
    postGlobalChatMessage("[APITEST] chat/colour WHITE should be white", Color.WHITE);

    // A colour with three distinct components catches a channel swap that the pure primaries above would not:
    // if red and blue are transposed this renders orange instead of a blue-leaning purple.
    postGlobalChatMessage("[APITEST] chat/colour MIXED should be purple-ish (64,32,192)", new Color(64, 32, 192));

    reporter.check("colour messages posted", true);
    postGlobalChatMessage(`[APITEST] chat armed; say "${VETO_PHRASE}" in chat to exercise the veto`, Color.WHITE);
}

export function onPlayerChatMessage(playerState: BadLadsObject, messageBuffer: ArrayBuffer, channelIndex: i32): bool {
    messagesSeen += 1;

    // Buffer marshalling guest-side: an empty or unterminated buffer would show up here first.
    reporter.check(
        "chat buffer is non-empty",
        messageBuffer.byteLength > 0,
        "onPlayerChatMessage delivered a zero-length buffer");

    const message = decodeString(messageBuffer);
    reporter.check(
        "chat message decodes",
        message.length > 0,
        `decoded a ${messageBuffer.byteLength}-byte buffer into an empty string`);

    reporter.check(
        "chat sender handle resolves",
        isObjectValid(playerState),
        "player state handle from onPlayerChatMessage did not resolve");

    reporter.check(
        "chat channel index is sane",
        channelIndex >= 0 && channelIndex < 16,
        `channel index was ${channelIndex}`);

    if (message.includes(VETO_PHRASE)) {
        vetoesIssued += 1;
        const name = getPlayerName(playerState);
        postGlobalChatMessage(
            `[APITEST] chat/veto suppressing message from ${name}; it must NOT appear in chat`,
            Color.RED);

        // Report here rather than only at shutdown. The controller waits for every module to report before it
        // tears the session down, so a module whose only DONE is in onPluginStop can never satisfy that wait.
        reporter.check("saw at least one chat message", true);
        reporter.done();

        // Returning false must prevent the message from reaching other players.
        return false;
    }

    // Everything else must pass through untouched. Returning true here is the assertion that a plugin which does
    // not care about a message cannot accidentally suppress it.
    postPlayerMessage(playerState, "[APITEST] chat/passthrough your message was allowed", Color.GREEN);
    return true;
}

export function onPluginStop(pluginId: i32): void {
    // Only report from here when the veto path never ran; otherwise this would emit a second, smaller DONE.
    if (vetoesIssued == 0) {
        reporter.check(
            "saw at least one chat message",
            messagesSeen > 0,
            "no chat messages reached the plugin - either nobody spoke, or the event did not arrive");
        reporter.done();
    }
}
