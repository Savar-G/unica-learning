import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/lib/email-delivery";
import { resendConfigProblem, resendTransport } from "@/lib/email-resend";

// The Resend adapter of the mail transport (#149): how each answer from Resend is classified. The network is a stub
// that records each request and answers as told.
vi.mock("server-only", () => ({}));

const toParent: EmailMessage = {
  sender: { to: "parent" },
  to: "priya@family.ca",
  subject: "Open this on a laptop",
  text: "Hi Priya",
  html: "<p>Hi Priya</p>",
  replyTo: "contact@unicalearning.com",
  headers: { "List-Unsubscribe": "<https://unicalearning.com/api/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
};
const toSavar: EmailMessage = { sender: { to: "savar" }, to: "savar@unicalearning.com", subject: "Card link needed", text: "Plan chosen", replyTo: "priya@family.ca" };

type Seen = { url: string; init: RequestInit };
function network(answer: (seen: Seen) => Promise<Response>) {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    seen.push(call);
    return answer(call);
  }) as typeof globalThis.fetch;
  return { fetch, seen, body: (i = 0) => JSON.parse(String(seen[i].init.body)) };
}
const answer = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_synthetic");
  vi.stubEnv("EMAIL_FROM", "Unica Learning <contact@unicalearning.com>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("a 2xx answer", () => {
  it("is sent with Resend's email id", async () => {
    const net = network(answer(200, { id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }));
    expect(await resendTransport({ fetch: net.fetch }).send(toParent)).toEqual({ status: "sent", emailId: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" });
  });

  it("came from one POST to Resend with the key, the parent sender and the whole message", async () => {
    const net = network(answer(200, { id: "e1" }));
    await resendTransport({ fetch: net.fetch }).send(toParent);
    expect(net.seen).toHaveLength(1);
    expect(net.seen[0].url).toBe("https://api.resend.com/emails");
    expect(net.seen[0].init.method).toBe("POST");
    expect(new Headers(net.seen[0].init.headers).get("authorization")).toBe("Bearer re_synthetic");
    expect(net.body()).toEqual({
      from: "Unica Learning <contact@unicalearning.com>",
      to: ["priya@family.ca"],
      subject: "Open this on a laptop",
      text: "Hi Priya",
      html: "<p>Hi Priya</p>",
      reply_to: "contact@unicalearning.com",
      headers: { "List-Unsubscribe": "<https://unicalearning.com/api/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
  });

  it("is still sent when the answer has no id to read: Resend took the email", async () => {
    for (const body of ["not json", {}, { id: 7 }, null, ""]) {
      const net = network(answer(200, body));
      expect(await resendTransport({ fetch: net.fetch }).send(toParent), JSON.stringify(body)).toEqual({ status: "sent", emailId: "sent" });
    }
  });
});

describe("a 4xx answer", () => {
  it("is refused with Resend's answer: the email did not go", async () => {
    for (const status of [400, 401, 403, 422, 429]) {
      const net = network(answer(status, { name: "validation_error", message: "Invalid `to` field." }));
      expect(await resendTransport({ fetch: net.fetch }).send(toParent), String(status)).toEqual({
        status: "refused",
        error: `Resend answered ${status}: {"name":"validation_error","message":"Invalid \`to\` field."}`,
      });
    }
  });
});

describe("an answer that leaves the outcome unknown", () => {
  it("is a 408 or a 5xx: the email may have gone", async () => {
    for (const status of [408, 500, 502, 503, 504]) {
      const net = network(answer(status, "upstream error"));
      expect(await resendTransport({ fetch: net.fetch }).send(toParent), String(status)).toEqual({ status: "unknown", error: `Resend answered ${status}: upstream error` });
    }
  });

  it("is a request that fails without an answer", async () => {
    const net = network(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await resendTransport({ fetch: net.fetch }).send(toParent)).toEqual({
      status: "unknown",
      error: "Resend delivery is unknown: fetch failed. Check delivery before sending again.",
    });
  });

  it("is a request with no answer after 15 seconds; the request does not wait longer", async () => {
    vi.useFakeTimers();
    const net = network(({ init }) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    let result: unknown = "still waiting";
    const pending = resendTransport({ fetch: net.fetch }).send(toParent).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(result).toBe("still waiting");
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(result).toEqual({ status: "unknown", error: "Resend delivery is unknown: The operation was aborted due to timeout. Check delivery before sending again." });
  });
});

describe("the sender", () => {
  it("of an email to Savar is EMAIL_FROM when it is set", async () => {
    const net = network(answer(200, { id: "e1" }));
    await resendTransport({ fetch: net.fetch }).send(toSavar);
    expect(net.body()).toMatchObject({ from: "Unica Learning <contact@unicalearning.com>", to: ["savar@unicalearning.com"], reply_to: "priya@family.ca" });
  });

  it("of an email to Savar must be EMAIL_FROM too: without it the email is refused, and Resend is never asked (D-133)", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const net = network(answer(200, { id: "e1" }));
    expect(await resendTransport({ fetch: net.fetch }).send(toSavar)).toEqual({ status: "refused", error: "EMAIL_FROM is not set" });
    expect(net.seen).toEqual([]);
  });

  it("of an email to a parent must be EMAIL_FROM: without it the email is refused, and Resend is never asked", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const net = network(answer(200, { id: "e1" }));
    expect(await resendTransport({ fetch: net.fetch }).send(toParent)).toEqual({ status: "refused", error: "EMAIL_FROM is not set" });
    expect(net.seen).toEqual([]);
  });
});

describe("the configuration", () => {
  it("refuses every email without the Resend key, and Resend is never asked", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const net = network(answer(200, { id: "e1" }));
    for (const message of [toParent, toSavar]) {
      expect(await resendTransport({ fetch: net.fetch }).send(message)).toEqual({ status: "refused", error: "RESEND_API_KEY is not set" });
    }
    expect(net.seen).toEqual([]);
  });

  it("check says what is missing for a parent email, or nothing", () => {
    expect(resendConfigProblem()).toBeNull();
    vi.stubEnv("EMAIL_FROM", "");
    expect(resendConfigProblem()).toBe("EMAIL_FROM is not set");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(resendConfigProblem()).toBe("RESEND_API_KEY is not set");
  });
});
