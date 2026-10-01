import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/config";
import { auth, enabledProviders, loadLoginContext, staffPolicy } from "@/lib/auth";
import { loginOptionsFor } from "@/lib/login-policy";
import { authMethodLabels } from "@/lib/labels";
import { getOidcProviders } from "@/lib/oidc-providers";
import { SubmitButton } from "@/components/submit-button";
import { continueWithEmail, signInWith } from "./actions";

export const metadata = { title: "Sign in" };

const errorMessages: Record<string, string> = {
  "invalid-email": "Please enter a valid email address.",
  "not-invited": "We couldn't find an account for that email address. Please ask your account manager for an invitation.",
  deactivated: "Your account has been deactivated. Please contact your account manager.",
  "method-not-allowed": "Your organisation doesn't use that sign-in method. Please choose one of the options below.",
  "wrong-tenant": "That account isn't part of your organisation's directory. Sign in with your work account.",
  "sso-not-configured": "Single sign-on isn't fully set up for your organisation yet. Please contact your account manager.",
  "unverified-email": "Your email address hasn't been verified with that provider.",
  AccessDenied: "You don't have access to the support portal.",
  Verification: "That sign-in link has expired or has already been used. Please request a new one.",
  OAuthAccountNotLinked: "This email is already linked to a different sign-in method.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/tickets");

  const { email, error, callbackUrl = "/tickets" } = await searchParams;

  let options: { method: keyof typeof authMethodLabels; providerId: string; label: string }[] = [];
  if (email) {
    const { user, domainOrg } = await loadLoginContext(email);
    const oidcNames = new Map(getOidcProviders().map((p) => [p.key, p.name]));
    options = loginOptionsFor(user, domainOrg, enabledProviders(), staffPolicy()).map((o) => ({
      ...o,
      label:
        o.method === "OIDC"
          ? `Continue with ${oidcNames.get(o.providerId.replace(/^oidc-/, "")) ?? "company SSO"}`
          : o.method === "MAGIC_LINK"
            ? "Email me a sign-in link"
            : `Continue with ${authMethodLabels[o.method]}`,
    }));
  }

  return (
    <>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div aria-hidden="true" className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            s6a
          </div>
          <h1 className="text-xl font-semibold">{brand.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to raise and track support requests.</p>
        </div>

        <div className="card p-6">
          {error && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorMessages[error] ?? "Something went wrong signing you in. Please try again."}
            </p>
          )}

          {!email ? (
            <form action={continueWithEmail} className="space-y-4">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <div>
                <label htmlFor="email" className="label">
                  Work email
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required autoFocus className="input" />
              </div>
              <SubmitButton className="btn-primary w-full" pendingText="Checking…">
                Continue
              </SubmitButton>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Signing in as <span className="font-medium text-slate-900">{email}</span>
              </p>
              {options.map((o) => (
                <form key={o.providerId} action={signInWith}>
                  <input type="hidden" name="providerId" value={o.providerId} />
                  <input type="hidden" name="email" value={email} />
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />
                  <SubmitButton className={o.method === "MAGIC_LINK" ? "btn-secondary w-full" : "btn-primary w-full"} pendingText="Redirecting…">
                    {o.label}
                  </SubmitButton>
                </form>
              ))}
              <Link href="/login" className="block pt-2 text-center text-sm link">
                Use a different email
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
