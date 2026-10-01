import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Satisfaction survey links: /survey/<ticketNumber>.<userId>.<sig>. The
 * signature binds the link to one ticket and one recipient, so it works
 * without signing in but can't be reused for anyone else's ticket.
 */

function sign(ticketNumber: number, userId: string, secret: string) {
  return createHmac("sha256", secret).update(`survey:${ticketNumber}.${userId}`).digest("base64url").slice(0, 22);
}

export function surveyToken(ticketNumber: number, userId: string, secret: string) {
  return `${ticketNumber}.${userId}.${sign(ticketNumber, userId, secret)}`;
}

export function parseSurveyToken(token: string, secret: string): { ticketNumber: number; userId: string } | null {
  const m = token.match(/^(\d+)\.([a-z0-9]+)\.([A-Za-z0-9_-]{22})$/);
  if (!m) return null;
  const ticketNumber = Number(m[1]);
  const expected = Buffer.from(sign(ticketNumber, m[2], secret));
  const given = Buffer.from(m[3]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { ticketNumber, userId: m[2] } : null;
}

export const RATINGS = ["GOOD", "OKAY", "POOR"] as const;
export type Rating = (typeof RATINGS)[number];
export const ratingLabels: Record<Rating, string> = { GOOD: "Good", OKAY: "Okay", POOR: "Poor" };
