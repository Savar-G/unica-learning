// Compile-only API regression. These calls must remain errors under npm run voice:typecheck.
import type { BoardSpeech, SpeechScope } from "@/lib/board-speech";
import type { BoardReceiver, BoardRequest, BoardSender } from "@/lib/board-protocol";
import type { CuePlaybackOutput } from "./cue-playback";

export function requiresOriginalScope(board: BoardSpeech, sender: BoardSender, receiver: BoardReceiver, audio: CuePlaybackOutput, scope: SpeechScope) {
  if (false) {
    // @ts-expect-error An unscoped interrupt must never compile.
    void board.interrupt();
    // @ts-expect-error An optional scope would reopen the same failure class.
    void board.interrupt(undefined);
    // @ts-expect-error Local invalidation also requires the original owner.
    board.detach();
    // @ts-expect-error Reconnect cannot clear a newer plan without its owner.
    void board.reconnect();
    // @ts-expect-error Cleanup cannot stop whichever timer happens to be current.
    audio.cancelPending();
    // @ts-expect-error Application media cleanup requires its original segment owner.
    audio.clearBuffer();
    // @ts-expect-error Application pause cannot cancel the current speech without its owner.
    audio.pause();
    // @ts-expect-error An utterance ID alone does not own a wire stop.
    void sender.interrupt(scope.utteranceId);
    // @ts-expect-error Sequence cancellation needs its original speech owner.
    void sender.cancel();
    // @ts-expect-error A missing owner must not become an optional argument.
    void sender.cancel(undefined);
    // @ts-expect-error The receiver cannot cancel by taking the pen without an observed scope.
    receiver.takePen();
    // @ts-expect-error Cancellation wire payloads require the original scope.
    const cancel: BoardRequest = { type: "cancel", sessionId: "call", epoch: 1, cancelId: "old", through: 2 };
    void cancel;
    // @ts-expect-error A reset must claim the plan it observed, including null for an empty receiver.
    const reset: BoardRequest = { type: "reset", sessionId: "call", senderId: "worker", epoch: 2, observedEpoch: 1, snapshot: { events: [] } };
    void reset;
    // @ts-expect-error Timing callbacks need the original generation.
    void board.timing(scope.utteranceId, 1, 100, "word");
    // @ts-expect-error Playback callbacks need the original generation.
    void board.played(scope.utteranceId, 100);
    // @ts-expect-error There is no alternate unscoped planner cancellation API.
    board.cancel();
    // @ts-expect-error There is no alternate unscoped planner clear API.
    board.clear();
  }
}
