import { describe, expect, it } from "vitest";
import { parseReplyAddress, replyAddress } from "@/lib/email/reply-token";
import { REPLY_MARKER, extractEmailAddress, extractReplyText } from "@/lib/email/parse-reply";

const SECRET = "test-secret";
const DOMAIN = "reply.example.com";

describe("reply addresses", () => {
  it("round-trips a signed address", () => {
    const addr = replyAddress(42, "clxuser123", SECRET, DOMAIN);
    expect(parseReplyAddress(`Support <${addr}>`, SECRET, DOMAIN)).toEqual({ ticketNumber: 42, userId: "clxuser123" });
  });

  it("rejects tampered or foreign addresses", () => {
    const addr = replyAddress(42, "clxuser123", SECRET, DOMAIN);
    expect(parseReplyAddress(addr.replace("+42.", "+43."), SECRET, DOMAIN)).toBeNull();
    expect(parseReplyAddress(addr.replace("clxuser123", "clxother99"), SECRET, DOMAIN)).toBeNull();
    expect(parseReplyAddress(addr, "other-secret", DOMAIN)).toBeNull();
    expect(parseReplyAddress(addr.replace(DOMAIN, "evil.com"), SECRET, DOMAIN)).toBeNull();
  });

  it("finds the token among several recipients and is case-insensitive", () => {
    const addr = replyAddress(7, "abc", SECRET, DOMAIN);
    expect(parseReplyAddress(`someone@acme.com, ${addr.toUpperCase().replace("TICKET", "ticket")}`, SECRET, DOMAIN)).toEqual({
      ticketNumber: 7,
      userId: "abc",
    });
  });
});

describe("extractReplyText", () => {
  it("drops everything below our marker", () => {
    expect(extractReplyText(`Thanks, that fixed it!\n\n${REPLY_MARKER}\n\nOld stuff`)).toBe("Thanks, that fixed it!");
  });

  it("drops Gmail-style quoted history", () => {
    const text = "Still broken for me.\n\nOn Tue, 1 Oct 2026 at 10:00, s6a Support <x@y> wrote:\n> We deployed a fix\n> Cheers";
    expect(extractReplyText(text)).toBe("Still broken for me.");
  });

  it("drops Outlook-style quoted history", () => {
    const text = "Works now.\r\n\r\n________________________________\r\nFrom: s6a Support\r\nSent: Tuesday\r\n";
    expect(extractReplyText(text)).toBe("Works now.");
  });

  it("drops quoted lines", () => {
    expect(extractReplyText("> old\nnew line\n> older")).toBe("new line");
  });
});

describe("extractEmailAddress", () => {
  it("parses display-name addresses", () => {
    expect(extractEmailAddress("Jane Doe <Jane@Acme.com>")).toBe("jane@acme.com");
    expect(extractEmailAddress("jane@acme.com")).toBe("jane@acme.com");
    expect(extractEmailAddress("not an email")).toBeNull();
  });
});
