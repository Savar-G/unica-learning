import { describe, expect, it } from "vitest";
import { MESSAGE_MAX, MIN_FILL_MS, checkContact, contactEmail, contactFieldErrors } from "@/lib/contact-form";

const filled = { name: "Sarah Lee", email: "sarah@example.com", message: "Does the test work on a tablet?", elapsed: 30_000 };

describe("contactFieldErrors", () => {
  it("passes a filled form", () => {
    expect(contactFieldErrors(filled)).toEqual([]);
  });

  it("names every empty or wrong field, in form order", () => {
    expect(contactFieldErrors({ name: "  ", email: "sarah@gmail", message: "\n" })).toEqual(["name", "email", "message"]);
  });
});

describe("checkContact", () => {
  it("accepts a filled form, trimmed", () => {
    expect(checkContact({ ...filled, name: "  Sarah Lee ", email: " sarah@example.com " })).toEqual({
      kind: "ok",
      message: { name: "Sarah Lee", email: "sarah@example.com", message: filled.message },
    });
  });

  it("returns the wrong fields", () => {
    expect(checkContact({ ...filled, email: "nope", message: "" })).toEqual({ kind: "invalid", fields: ["email", "message"] });
  });

  it("treats a filled hidden field as a bot", () => {
    expect(checkContact({ ...filled, website: "https://spam.example" })).toEqual({ kind: "bot" });
  });

  it("treats a form sent too fast, or with no timing, as a bot", () => {
    expect(checkContact({ ...filled, elapsed: MIN_FILL_MS - 1 })).toEqual({ kind: "bot" });
    expect(checkContact({ ...filled, elapsed: undefined })).toEqual({ kind: "bot" });
    expect(checkContact({ ...filled, elapsed: "40000" })).toEqual({ kind: "bot" });
  });

  it("treats a body that is not an object as a bot", () => {
    expect(checkContact(null)).toEqual({ kind: "bot" });
    expect(checkContact("hello")).toEqual({ kind: "bot" });
  });

  it("keeps the name on one line and cuts a long message", () => {
    const check = checkContact({ ...filled, name: "Sarah\r\nBcc: x@example.com", message: "a".repeat(MESSAGE_MAX + 50) });
    expect(check.kind).toBe("ok");
    if (check.kind !== "ok") return;
    expect(check.message.name).toBe("Sarah Bcc: x@example.com");
    expect(check.message.message).toHaveLength(MESSAGE_MAX);
  });
});

describe("contactEmail", () => {
  it("goes to the support address and replies to the parent", () => {
    const email = contactEmail({ name: "Sarah Lee", email: "sarah@example.com", message: "Hi there" }, "contact@unicalearning.com");
    expect(email.to).toBe("contact@unicalearning.com");
    expect(email.replyTo).toBe("sarah@example.com");
    expect(email.subject).toBe("Contact form: Sarah Lee");
    expect(email.text).toContain("From: Sarah Lee <sarah@example.com>");
    expect(email.text).toContain("Hi there");
  });
});
