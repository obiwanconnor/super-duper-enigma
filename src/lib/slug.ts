export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Parses a comma/space/newline separated list of email domains. */
export function parseDomains(input: string): string[] {
  const domains = input
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return [...new Set(domains)].filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
}
