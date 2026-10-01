export const PLACEHOLDERS = [
  { key: "requester_first_name", description: "the requester's first name" },
  { key: "client_name", description: "the client organisation" },
  { key: "ticket_number", description: "the ticket number" },
  { key: "agent_name", description: "your name" },
] as const;

export type PlaceholderValues = Record<(typeof PLACEHOLDERS)[number]["key"], string>;

/** Fills {{placeholders}}; unknown ones are left as typed so staff notice them. */
export function fillPlaceholders(body: string, values: PlaceholderValues): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in values ? values[key as keyof PlaceholderValues] : match));
}

export function firstName(name: string | null | undefined, fallback = "there"): string {
  const first = name?.trim().split(/\s+/)[0];
  return first || fallback;
}
