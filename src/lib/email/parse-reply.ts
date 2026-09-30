export const REPLY_MARKER = "##- Please type your reply above this line -##";

const QUOTE_HEADERS: RegExp[] = [
  /^On .+wrote:\s*$/i, // Gmail / Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}/i, // Outlook (plain)
  /^_{10,}\s*$/, // Outlook separator line
  /^From:\s.+/i, // Outlook header block
  /^Sent from my /i, // mobile signatures
];

/**
 * Returns only the new text of an email reply, dropping the quoted history
 * and anything below our reply marker.
 */
export function extractReplyText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes(REPLY_MARKER)) break;
    if (QUOTE_HEADERS.some((re) => re.test(trimmed))) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }

  // Gmail sometimes wraps "On ... wrote:" across two lines.
  while (kept.length && /^On .+/i.test(kept[kept.length - 1].trim()) && !/[.!?]$/.test(kept[kept.length - 1].trim())) {
    kept.pop();
  }

  return kept.join("\n").trim();
}

/** "Jane Doe <jane@acme.com>" -> "jane@acme.com" */
export function extractEmailAddress(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}
