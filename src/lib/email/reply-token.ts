import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Reply-by-email addresses look like: ticket+<number>.<userId>.<sig>@REPLY_DOMAIN
 * The signature binds the address to one ticket and one recipient, so a reply
 * can only be posted by (a mailbox belonging to) the person it was sent to.
 */

const SIG_LENGTH = 16;

function sign(ticketNumber: number, userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${ticketNumber}.${userId}`).digest("hex").slice(0, SIG_LENGTH);
}

export function replyLocalPart(ticketNumber: number, userId: string, secret: string): string {
  return `ticket+${ticketNumber}.${userId}.${sign(ticketNumber, userId, secret)}`;
}

export function replyAddress(ticketNumber: number, userId: string, secret: string, domain: string): string {
  return `${replyLocalPart(ticketNumber, userId, secret)}@${domain}`;
}

export type ParsedReplyAddress = { ticketNumber: number; userId: string };

/** Extracts and verifies the token from any address in a To/Cc header value. */
export function parseReplyAddress(header: string, secret: string, domain: string): ParsedReplyAddress | null {
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`ticket\\+(\\d+)\\.([a-z0-9]+)\\.([a-f0-9]{${SIG_LENGTH}})@${escapedDomain}`, "gi");
  for (const match of header.matchAll(re)) {
    const ticketNumber = Number(match[1]);
    // Mail systems may change case; cuids and our hex signatures are lowercase.
    const userId = match[2].toLowerCase();
    const given = Buffer.from(match[3].toLowerCase());
    const expected = Buffer.from(sign(ticketNumber, userId, secret));
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ticketNumber, userId };
    }
  }
  return null;
}
