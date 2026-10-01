export const brand = {
  name: "s6a Support Portal",
  shortName: "s6a Support",
  /** The registered company name used in the privacy notice. */
  legalName: process.env.LEGAL_NAME || "s6a",
  privacyEmail: "privacy@s6a.io",
  accessibilityEmail: "accessibility@s6a.io",
  supportEmail: "support@s6a.io",
};

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
