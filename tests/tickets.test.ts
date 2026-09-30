import { describe, expect, it } from "vitest";
import { resolvedAtFor, statusAfterClientReply } from "@/lib/tickets";
import { ticketScope, commentScope, canViewTicket } from "@/lib/access";
import { parseDomains, slugify } from "@/lib/slug";

describe("ticket status rules", () => {
  it("reopens tickets when the client replies", () => {
    expect(statusAfterClientReply("WAITING_ON_CLIENT")).toBe("OPEN");
    expect(statusAfterClientReply("RESOLVED")).toBe("OPEN");
    expect(statusAfterClientReply("CLOSED")).toBe("OPEN");
    expect(statusAfterClientReply("IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("tracks when a ticket was resolved", () => {
    const earlier = new Date("2026-01-01");
    expect(resolvedAtFor("RESOLVED", earlier)).toBe(earlier);
    expect(resolvedAtFor("CLOSED", null)).toBeInstanceOf(Date);
    expect(resolvedAtFor("OPEN", earlier)).toBeNull();
  });
});

describe("access scopes", () => {
  const client = { id: "u1", role: "CLIENT" as const, organizationId: "o1" };
  const orphan = { id: "u2", role: "CLIENT" as const, organizationId: null };
  const agent = { id: "u3", role: "AGENT" as const, organizationId: null };

  it("limits clients to their organisation", () => {
    expect(ticketScope(client)).toEqual({ organizationId: "o1" });
    expect(ticketScope(agent)).toEqual({});
    expect(ticketScope(orphan)).toEqual({ id: "__none__" });
    expect(canViewTicket(client, { organizationId: "o1" })).toBe(true);
    expect(canViewTicket(client, { organizationId: "o2" })).toBe(false);
    expect(canViewTicket(orphan, { organizationId: "o1" })).toBe(false);
    expect(canViewTicket(agent, { organizationId: "o2" })).toBe(true);
  });

  it("hides internal notes from clients", () => {
    expect(commentScope(client)).toEqual({ internal: false });
    expect(commentScope(agent)).toEqual({});
  });
});

describe("slug helpers", () => {
  it("slugifies names", () => {
    expect(slugify("Acme Ltd — Café Portal!")).toBe("acme-ltd-cafe-portal");
  });
  it("parses domain lists", () => {
    expect(parseDomains("@Acme.com, acme.co.uk\nbad, acme.com")).toEqual(["acme.com", "acme.co.uk"]);
  });
});
