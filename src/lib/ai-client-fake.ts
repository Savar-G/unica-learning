// A fake AI client (#183): no network. Tests give it the output for each request and read the requests it got.
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";

export function fakeAiClient({
  model = "fake",
  answer,
}: {
  model?: string;
  /** The JSON output for a request; throw to act as a failed request. */
  answer: (request: AiJsonRequest) => unknown;
}): AiClient & { requests: AiJsonRequest[] } {
  const requests: AiJsonRequest[] = [];
  return {
    model,
    requests,
    json: async (request) => {
      requests.push(request);
      return answer(request);
    },
  };
}
