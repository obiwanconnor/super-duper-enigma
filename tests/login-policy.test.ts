import { describe, expect, it } from "vitest";
import { decideSignIn, loginOptionsFor, type KnownUser, type OrgPolicy, type StaffPolicy } from "@/lib/login-policy";

const org = (over: Partial<OrgPolicy> = {}): OrgPolicy => ({
  id: "org1",
  authMethods: ["MAGIC_LINK"],
  emailDomains: ["acme.com"],
  autoJoin: false,
  entraTenantId: null,
  googleHostedDomain: null,
  oidcProviderKey: null,
  ...over,
});
const client = (o: OrgPolicy | null, over: Partial<KnownUser> = {}): KnownUser => ({ role: "CLIENT", active: true, organization: o, ...over });
const staff: StaffPolicy = { entraTenantId: "staff-tenant", googleHostedDomain: null };
const allEnabled = { magicLink: true, microsoft: true, google: true, oidcKeys: ["acme-okta"] };

describe("decideSignIn", () => {
  it("allows an invited client with an allowed method", () => {
    expect(decideSignIn({ providerId: "sendgrid", user: client(org()), domainOrg: org(), staff })).toEqual({ ok: true });
  });

  it("rejects unknown users unless their domain auto-joins", () => {
    expect(decideSignIn({ providerId: "sendgrid", user: null, domainOrg: org(), staff })).toEqual({ ok: false, reason: "not-invited" });
    expect(decideSignIn({ providerId: "sendgrid", user: null, domainOrg: null, staff }).ok).toBe(false);
    expect(decideSignIn({ providerId: "sendgrid", user: null, domainOrg: org({ autoJoin: true }), staff })).toEqual({ ok: true });
  });

  it("rejects deactivated users", () => {
    expect(decideSignIn({ providerId: "sendgrid", user: client(org(), { active: false }), domainOrg: null, staff })).toEqual({
      ok: false,
      reason: "deactivated",
    });
  });

  it("enforces the organisation's sign-in methods", () => {
    const o = org({ authMethods: ["GOOGLE"] });
    expect(decideSignIn({ providerId: "sendgrid", user: client(o), domainOrg: o, staff })).toEqual({ ok: false, reason: "method-not-allowed" });
  });

  it("requires a pinned, matching Entra tenant for Microsoft sign-in", () => {
    const unpinned = org({ authMethods: ["MICROSOFT"] });
    expect(decideSignIn({ providerId: "microsoft-entra-id", user: client(unpinned), domainOrg: null, staff, profile: { tid: "x" } })).toEqual({
      ok: false,
      reason: "sso-not-configured",
    });
    const pinned = org({ authMethods: ["MICROSOFT"], entraTenantId: "t1" });
    expect(decideSignIn({ providerId: "microsoft-entra-id", user: client(pinned), domainOrg: null, staff, profile: { tid: "evil" } }).ok).toBe(false);
    expect(decideSignIn({ providerId: "microsoft-entra-id", user: client(pinned), domainOrg: null, staff, profile: { tid: "t1" } }).ok).toBe(true);
  });

  it("requires verified Google emails and the pinned Workspace domain", () => {
    const o = org({ authMethods: ["GOOGLE"], googleHostedDomain: "acme.com" });
    const attempt = (profile: Record<string, unknown>) => decideSignIn({ providerId: "google", user: client(o), domainOrg: null, staff, profile });
    expect(attempt({ email_verified: false, hd: "acme.com" }).ok).toBe(false);
    expect(attempt({ email_verified: true })).toEqual({ ok: false, reason: "wrong-tenant" });
    expect(attempt({ email_verified: true, hd: "acme.com" }).ok).toBe(true);
  });

  it("only accepts the organisation's own OIDC provider", () => {
    const o = org({ authMethods: ["OIDC"], oidcProviderKey: "acme-okta" });
    expect(decideSignIn({ providerId: "oidc-acme-okta", user: client(o), domainOrg: null, staff }).ok).toBe(true);
    expect(decideSignIn({ providerId: "oidc-other", user: client(o), domainOrg: null, staff }).ok).toBe(false);
  });

  it("holds staff to the staff tenant", () => {
    const agent: KnownUser = { role: "AGENT", active: true, organization: null };
    expect(decideSignIn({ providerId: "sendgrid", user: agent, domainOrg: null, staff }).ok).toBe(true);
    expect(decideSignIn({ providerId: "microsoft-entra-id", user: agent, domainOrg: null, staff, profile: { tid: "staff-tenant" } }).ok).toBe(true);
    expect(decideSignIn({ providerId: "microsoft-entra-id", user: agent, domainOrg: null, staff, profile: { tid: "attacker" } }).ok).toBe(false);
    expect(decideSignIn({ providerId: "oidc-acme-okta", user: agent, domainOrg: null, staff }).ok).toBe(false);
  });
});

describe("loginOptionsFor", () => {
  it("shows the organisation's configured methods in order", () => {
    const o = org({ authMethods: ["OIDC", "MAGIC_LINK"], oidcProviderKey: "acme-okta" });
    expect(loginOptionsFor(client(o), o, allEnabled, staff).map((x) => x.providerId)).toEqual(["oidc-acme-okta", "sendgrid"]);
  });

  it("uses the email domain's organisation for people not yet signed up", () => {
    const o = org({ authMethods: ["GOOGLE"] });
    expect(loginOptionsFor(null, o, allEnabled, staff).map((x) => x.method)).toEqual(["GOOGLE"]);
  });

  it("falls back to magic link when nothing else is available", () => {
    const o = org({ authMethods: ["GOOGLE"] });
    expect(loginOptionsFor(client(o), o, { ...allEnabled, google: false }, staff).map((x) => x.method)).toEqual(["MAGIC_LINK"]);
    expect(loginOptionsFor(null, null, allEnabled, staff).map((x) => x.method)).toEqual(["MAGIC_LINK"]);
  });

  it("hides Microsoft for staff when no staff tenant is set", () => {
    const agent: KnownUser = { role: "ADMIN", active: true, organization: null };
    expect(loginOptionsFor(agent, null, allEnabled, { entraTenantId: null, googleHostedDomain: null }).map((x) => x.method)).toEqual([
      "GOOGLE",
      "MAGIC_LINK",
    ]);
  });
});
