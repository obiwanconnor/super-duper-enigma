import { getOidcProviders } from "./oidc-providers";

/**
 * Origins sign-in forms may redirect to. Browsers apply `form-action` to the
 * redirect after a form post, so SSO identity providers must be listed.
 */
export function ssoOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) origins.add("https://login.microsoftonline.com");
  if (process.env.AUTH_GOOGLE_ID) origins.add("https://accounts.google.com");
  for (const p of safeOidcProviders()) {
    try {
      origins.add(new URL(p.issuer).origin);
    } catch {
      // ignore malformed issuer; provider config validation reports it elsewhere
    }
  }
  return [...origins];
}

function safeOidcProviders() {
  try {
    return getOidcProviders();
  } catch {
    return [];
  }
}

export function buildCsp(nonce: string, { dev = false, formActions = [] as string[] } = {}): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${formActions.length ? " " + formActions.join(" ") : ""}`,
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** Headers applied to every response (see next.config.ts). */
export const STATIC_SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
