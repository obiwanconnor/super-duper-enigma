import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import Sendgrid from "next-auth/providers/sendgrid";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email/send";
import { magicLinkEmail } from "./email/templates";
import { getOidcProviders, oidcProviderId } from "./oidc-providers";
import {
  decideSignIn,
  emailDomain,
  normaliseEmail,
  type EnabledProviders,
  type KnownUser,
  type OrgPolicy,
  type StaffPolicy,
} from "./login-policy";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      organizationId: string | null;
    } & DefaultSession["user"];
  }
}

const orgPolicySelect = {
  id: true,
  authMethods: true,
  emailDomains: true,
  autoJoin: true,
  entraTenantId: true,
  googleHostedDomain: true,
  oidcProviderKey: true,
} as const;

export function staffPolicy(): StaffPolicy {
  return {
    entraTenantId: process.env.STAFF_ENTRA_TENANT_ID || null,
    googleHostedDomain: process.env.STAFF_GOOGLE_HOSTED_DOMAIN || null,
  };
}

export function enabledProviders(): EnabledProviders {
  return {
    // Magic links always work: without a SendGrid key they are logged to the console.
    magicLink: true,
    microsoft: !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    google: !!process.env.AUTH_GOOGLE_ID,
    oidcKeys: getOidcProviders().map((p) => p.key),
  };
}

/** Loads everything the login policy needs to know about an email address. */
export async function loadLoginContext(rawEmail: string): Promise<{ user: KnownUser | null; domainOrg: OrgPolicy | null }> {
  const email = normaliseEmail(rawEmail);
  const [user, domainOrg] = await Promise.all([
    db.user.findUnique({
      where: { email },
      select: { role: true, active: true, organization: { select: orgPolicySelect } },
    }),
    db.organization.findFirst({ where: { emailDomains: { has: emailDomain(email) } }, select: orgPolicySelect }),
  ]);
  return { user, domainOrg };
}

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    Sendgrid({
      apiKey: process.env.SENDGRID_API_KEY,
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url }) {
        await sendEmail({ to: identifier, ...magicLinkEmail(url) });
      },
    }),
  ];

  if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        // Multi-tenant: each client organisation is pinned to its own tenant ID.
        issuer: "https://login.microsoftonline.com/common/v2.0",
        allowDangerousEmailAccountLinking: true,
        profile(profile) {
          const email = (profile.email ?? profile.preferred_username ?? "") as string;
          return { id: profile.sub, name: profile.name, email: email.toLowerCase(), image: null };
        },
      }),
    );
  }

  if (process.env.AUTH_GOOGLE_ID) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
        profile(profile) {
          return { id: profile.sub, name: profile.name, email: profile.email.toLowerCase(), image: profile.picture };
        },
      }),
    );
  }

  for (const p of getOidcProviders()) {
    providers.push({
      id: oidcProviderId(p.key),
      name: p.name,
      type: "oidc",
      issuer: p.issuer,
      clientId: p.clientId,
      clientSecret: p.clientSecret,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        const email = String(profile.email ?? "").toLowerCase();
        return { id: String(profile.sub), name: (profile.name as string) ?? email, email, image: null };
      },
    });
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: buildProviders(),
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login/check-email",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !user.email) return "/login?error=not-invited";
      const { user: known, domainOrg } = await loadLoginContext(user.email);
      const decision = decideSignIn({
        providerId: account.provider,
        user: known,
        domainOrg,
        staff: staffPolicy(),
        profile: profile as Record<string, unknown> | undefined,
      });
      return decision.ok ? true : `/login?error=${decision.reason}`;
    },
    async session({ session, user }) {
      const u = user as unknown as { id: string; role: Role; organizationId: string | null };
      session.user.id = u.id;
      session.user.role = u.role;
      session.user.organizationId = u.organizationId;
      return session;
    },
  },
  events: {
    // Users created on first sign-in (auto-join domains) are attached to the
    // organisation that owns their email domain.
    async createUser({ user }) {
      if (!user.email || !user.id) return;
      const org = await db.organization.findFirst({
        where: { emailDomains: { has: emailDomain(user.email) }, autoJoin: true },
        select: { id: true },
      });
      if (org) {
        await db.user.update({ where: { id: user.id }, data: { organizationId: org.id, role: "CLIENT" } });
      }
    },
  },
});
