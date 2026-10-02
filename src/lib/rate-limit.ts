import { headers } from "next/headers";
import { db } from "./db";

/**
 * Fixed-window rate limiting stored in Postgres, so it holds across
 * serverless instances without extra infrastructure. Each call counts one
 * attempt; `allowed` is false once the window's limit is exceeded.
 */

export type Limit = { limit: number; windowSeconds: number };

export const LIMITS = {
  /** Sign-in links sent to one email address. */
  signInPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  /** Sign-in attempts from one IP address (any email). */
  signInPerIp: { limit: 30, windowSeconds: 15 * 60 },
  /** Inbound emails accepted from one sender. */
  inboundPerSender: { limit: 30, windowSeconds: 60 * 60 },
  /** Survey submissions for one ticket link. */
  surveyPerToken: { limit: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, Limit>;

export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export async function rateLimit(key: string, { limit, windowSeconds }: Limit, now = new Date()) {
  const start = windowStart(now, windowSeconds);
  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart: start } },
    create: { key, windowStart: start, count: 1 },
    update: { count: { increment: 1 } },
  });
  const retryAfterSeconds = Math.ceil((start.getTime() + windowSeconds * 1000 - now.getTime()) / 1000);
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}

/** The caller's IP as seen by Vercel (first X-Forwarded-For entry). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Removes expired counters; called from the scheduled job. */
export async function pruneRateLimits(now = new Date()) {
  const { count } = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  return count;
}
