import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Records who changed what. Keep `details` to identifiers and field values;
 * never copy message bodies or other free text written by users.
 */
export async function audit(event: {
  actorId: string | null;
  action: string;
  entityType: "ticket" | "organization" | "user" | "article" | "canned_response" | "retention";
  entityId: string;
  summary: string;
  details?: Prisma.InputJsonValue;
}) {
  try {
    await db.auditEvent.create({ data: event });
  } catch (err) {
    // Auditing must never break the action being audited.
    console.error("Failed to write audit event", event.action, err);
  }
}

/** Field-level differences between two records, for audit details. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    const prev = before[key];
    const same = JSON.stringify(prev) === JSON.stringify(value);
    if (!same && value !== undefined) changes[key] = { from: prev ?? null, to: value ?? null };
  }
  return changes;
}
