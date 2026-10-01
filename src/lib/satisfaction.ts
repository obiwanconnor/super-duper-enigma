import { z } from "zod";
import { db } from "./db";
import { RATINGS } from "./survey";

const schema = z.object({
  rating: z.enum(RATINGS),
  comment: z.string().trim().max(2000).optional(),
});

/** Records (or replaces) the satisfaction rating for a ticket. */
export async function recordSatisfaction(ticketId: string, userId: string, formData: FormData) {
  const parsed = schema.safeParse({ rating: formData.get("rating"), comment: formData.get("comment") ?? undefined });
  if (!parsed.success) return false;
  const data = { userId, rating: parsed.data.rating, comment: parsed.data.comment || null };
  await db.satisfactionResponse.upsert({ where: { ticketId }, create: { ticketId, ...data }, update: data });
  return true;
}
