import { z } from "zod";

const oidcProviderSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/, "key must be lowercase letters, digits and dashes"),
  name: z.string().min(1),
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export type OidcProviderConfig = z.infer<typeof oidcProviderSchema>;

export function parseOidcProviders(raw: string | undefined): OidcProviderConfig[] {
  if (!raw || !raw.trim()) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("OIDC_PROVIDERS is not valid JSON");
  }
  return z.array(oidcProviderSchema).parse(json);
}

export const oidcProviderId = (key: string) => `oidc-${key}`;

export function getOidcProviders(): OidcProviderConfig[] {
  return parseOidcProviders(process.env.OIDC_PROVIDERS);
}
