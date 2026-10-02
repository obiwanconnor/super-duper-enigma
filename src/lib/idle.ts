import type { Role } from "@prisma/client";

/** Idle limits: staff 8 hours, clients 7 days (overridable for testing). */
export function idleLimitMinutes(role: Role): number {
  const staff = Number(process.env.STAFF_IDLE_MINUTES) || 8 * 60;
  const client = Number(process.env.CLIENT_IDLE_MINUTES) || 7 * 24 * 60;
  return role === "AGENT" || role === "ADMIN" ? staff : client;
}

/** How long before sign-out the warning appears (WCAG 2.2.1: at least 20 seconds). */
export function warningMinutes(limitMinutes: number): number {
  return Math.min(5, Math.max(1, Math.floor(limitMinutes / 4)));
}

export function isIdle(lastSeenAt: Date, role: Role, now = new Date()): boolean {
  return now.getTime() - lastSeenAt.getTime() > idleLimitMinutes(role) * 60_000;
}

/** Only write lastSeenAt this often, to avoid a database write on every request. */
export const TOUCH_INTERVAL_MS = 60_000;

export const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];
