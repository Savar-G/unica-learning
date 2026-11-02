// Compile-only API regression. These calls must remain errors under npm run voice:typecheck.
import type { BoardSpeech, SpeechScope } from "@/lib/board-speech";
import type { BoardSender } from "@/lib/board-protocol";
import type { CuePlaybackOutput } from "./cue-playback";

export function requiresOriginalScope(board: BoardSpeech, sender: BoardSender, audio: CuePlaybackOutput, scope: SpeechScope) {
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
    // @ts-expect-error An utterance ID alone does not own a wire stop.
    void sender.interrupt(scope.utteranceId);
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
