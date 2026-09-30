import type { AuthMethod, Role } from "@prisma/client";
import { oidcProviderId } from "./oidc-providers";

/**
 * Pure sign-in rules. Kept free of database and Auth.js imports so they can be
 * unit tested; `auth.ts` loads the records and calls these.
 */

export type OrgPolicy = {
  id: string;
  authMethods: AuthMethod[];
  emailDomains: string[];
  autoJoin: boolean;
  entraTenantId: string | null;
  googleHostedDomain: string | null;
  oidcProviderKey: string | null;
};

export type KnownUser = {
  role: Role;
  active: boolean;
  organization: OrgPolicy | null;
};

/** Auth methods whose Auth.js providers are configured in this deployment. */
export type EnabledProviders = {
  magicLink: boolean;
  microsoft: boolean;
  google: boolean;
  oidcKeys: string[];
};

/** Identity-provider restrictions for consultancy staff (from env). */
export type StaffPolicy = {
  entraTenantId: string | null;
  googleHostedDomain: string | null;
};

export const MAGIC_LINK_PROVIDER_ID = "sendgrid";

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isStaffRole(role: Role): boolean {
  return role === "AGENT" || role === "ADMIN";
}

/** Maps an Auth.js provider id back to the organisation-level auth method. */
export function methodForProvider(providerId: string): AuthMethod | null {
  if (providerId === MAGIC_LINK_PROVIDER_ID) return "MAGIC_LINK";
  if (providerId === "microsoft-entra-id") return "MICROSOFT";
  if (providerId === "google") return "GOOGLE";
  if (providerId.startsWith("oidc-")) return "OIDC";
  return null;
}

export type LoginOption = { method: AuthMethod; providerId: string };

function isEnabled(method: AuthMethod, enabled: EnabledProviders, oidcKey: string | null): boolean {
  switch (method) {
    case "MAGIC_LINK":
      return enabled.magicLink;
    case "MICROSOFT":
      return enabled.microsoft;
    case "GOOGLE":
      return enabled.google;
    case "OIDC":
      return !!oidcKey && enabled.oidcKeys.includes(oidcKey);
  }
}

function providerIdFor(method: AuthMethod, oidcKey: string | null): string {
  switch (method) {
    case "MAGIC_LINK":
      return MAGIC_LINK_PROVIDER_ID;
    case "MICROSOFT":
      return "microsoft-entra-id";
    case "GOOGLE":
      return "google";
    case "OIDC":
      return oidcProviderId(oidcKey ?? "");
  }
}

/**
 * The organisation whose policy applies to this email: the user's own
 * organisation if they already exist, otherwise the organisation that owns the
 * email domain (only if it allows people to join automatically).
 */
export function governingOrg(user: KnownUser | null, domainOrg: OrgPolicy | null): OrgPolicy | null {
  if (user) return user.organization;
  return domainOrg?.autoJoin ? domainOrg : null;
}

/**
 * Which sign-in buttons to show on the login page for an email address.
 * Unknown addresses get the magic-link option so the page does not reveal
 * whether an account exists; the sign-in itself is still refused later.
 */
export function loginOptionsFor(
  user: KnownUser | null,
  domainOrg: OrgPolicy | null,
  enabled: EnabledProviders,
  staff: StaffPolicy,
): LoginOption[] {
  let methods: AuthMethod[];
  let oidcKey: string | null = null;

  if (user && isStaffRole(user.role)) {
    methods = [...(staff.entraTenantId ? (["MICROSOFT"] as const) : []), "GOOGLE", "MAGIC_LINK"];
  } else {
    const org = governingOrg(user, domainOrg) ?? domainOrg;
    methods = org?.authMethods ?? ["MAGIC_LINK"];
    oidcKey = org?.oidcProviderKey ?? null;
  }

  const options = methods
    .filter((m) => isEnabled(m, enabled, oidcKey))
    .map((method) => ({ method, providerId: providerIdFor(method, oidcKey) }));

  // Never leave someone without a way in if the org's SSO is misconfigured
  // for this deployment; the sign-in check below still applies.
  if (options.length === 0 && enabled.magicLink) {
    return [{ method: "MAGIC_LINK", providerId: MAGIC_LINK_PROVIDER_ID }];
  }
  return options;
}

export type SignInDecision = { ok: true } | { ok: false; reason: string };

export type SignInAttempt = {
  providerId: string;
  user: KnownUser | null;
  domainOrg: OrgPolicy | null;
  staff: StaffPolicy;
  /** Raw OIDC profile claims (tid for Entra, hd / email_verified for Google). */
  profile?: Record<string, unknown> | null;
};

/**
 * SSO accounts are linked to existing users by email address, so the email
 * must be trustworthy. Entra's email claim is not verified by Microsoft, so a
 * Microsoft sign-in is only accepted from a pinned tenant. Google verifies
 * addresses, optionally pinned to a Workspace domain via the `hd` claim.
 */
function checkIdentityProvider(
  method: AuthMethod,
  restrictions: { entraTenantId: string | null; googleHostedDomain: string | null },
  profile: Record<string, unknown> | null | undefined,
): SignInDecision {
  if (method === "MICROSOFT") {
    if (!restrictions.entraTenantId) return { ok: false, reason: "sso-not-configured" };
    if (profile?.tid !== restrictions.entraTenantId) return { ok: false, reason: "wrong-tenant" };
  }
  if (method === "GOOGLE") {
    if (profile?.email_verified !== true) return { ok: false, reason: "unverified-email" };
    if (restrictions.googleHostedDomain && profile?.hd !== restrictions.googleHostedDomain) {
      return { ok: false, reason: "wrong-tenant" };
    }
  }
  return { ok: true };
}

export function decideSignIn(attempt: SignInAttempt): SignInDecision {
  const { providerId, user, domainOrg, staff, profile } = attempt;
  const method = methodForProvider(providerId);
  if (!method) return { ok: false, reason: "unknown-provider" };

  if (user && !user.active) return { ok: false, reason: "deactivated" };
  // The AI assistant is a system user and can never sign in.
  if (user?.role === "AI") return { ok: false, reason: "not-invited" };

  if (user && isStaffRole(user.role)) {
    if (method === "OIDC") return { ok: false, reason: "method-not-allowed" };
    return checkIdentityProvider(method, staff, profile);
  }

  const org = governingOrg(user, domainOrg);
  if (!org) return { ok: false, reason: "not-invited" };

  if (!org.authMethods.includes(method)) return { ok: false, reason: "method-not-allowed" };

  if (method === "OIDC" && providerId !== oidcProviderId(org.oidcProviderKey ?? "")) {
    return { ok: false, reason: "method-not-allowed" };
  }

  return checkIdentityProvider(method, org, profile);
}
