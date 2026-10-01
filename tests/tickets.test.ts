import { describe, expect, it } from "vitest";
import { countsAsResponse, statusAfterClientReply } from "@/lib/tickets";
import { ticketScope, commentScope, canViewTicket } from "@/lib/access";
import { parseDomains, slugify } from "@/lib/slug";

describe("ticket status rules", () => {
  it("reopens tickets when the client replies", () => {
    expect(statusAfterClientReply("WAITING_ON_CLIENT")).toBe("OPEN");
    expect(statusAfterClientReply("RESOLVED")).toBe("OPEN");
    expect(statusAfterClientReply("CLOSED")).toBe("OPEN");
    expect(statusAfterClientReply("IN_PROGRESS")).toBe("IN_PROGRESS");
  });

  it("counts public staff and AI replies as the first response", () => {
    const v = (role: "CLIENT" | "AGENT" | "AI") => ({ id: "x", role, organizationId: null });
    expect(countsAsResponse(v("AGENT"), false)).toBe(true);
    expect(countsAsResponse(v("AI"), false)).toBe(true);
    expect(countsAsResponse(v("AGENT"), true)).toBe(false);
    expect(countsAsResponse(v("CLIENT"), false)).toBe(false);
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

import { diff } from "@/lib/audit";

describe("audit diff", () => {
  it("records only changed fields", () => {
    expect(diff({ status: "OPEN", priority: "LOW", tags: ["a"] }, { status: "RESOLVED", priority: "LOW", tags: ["a"] })).toEqual({
      status: { from: "OPEN", to: "RESOLVED" },
    });
  });
});

import { fillPlaceholders, firstName } from "@/lib/canned";
import { isPastRetention, retentionEndsAt } from "@/lib/retention";

describe("saved reply placeholders", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    const values = { requester_first_name: "Jane", client_name: "Acme", ticket_number: "12", agent_name: "Sam" };
    expect(fillPlaceholders("Hi {{ requester_first_name }}, re #{{ticket_number}} {{oops}}", values)).toBe("Hi Jane, re #12 {{oops}}");
    expect(firstName("Jane Client")).toBe("Jane");
    expect(firstName(null)).toBe("there");
  });
});

describe("retention", () => {
  it("is two years after contract end", () => {
    const end = new Date("2024-03-31T00:00:00Z");
    expect(retentionEndsAt(end)?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(isPastRetention(end, new Date("2026-03-30T00:00:00Z"))).toBe(false);
    expect(isPastRetention(end, new Date("2026-04-01T00:00:00Z"))).toBe(true);
    expect(isPastRetention(null)).toBe(false);
  });
});
