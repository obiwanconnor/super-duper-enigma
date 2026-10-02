import { cookies } from "next/headers";
import { db } from "./db";
import { isIdle, SESSION_COOKIES, TOUCH_INTERVAL_MS } from "./idle";

/**
 * Enforces the idle timeout before Auth.js sees the session: an idle session
 * is deleted (so the person is signed out); an active one has lastSeenAt
 * refreshed. Returns "timed-out" when it just expired the session.
 */
export async function checkIdleSession(): Promise<"active" | "timed-out" | "none"> {
  const jar = await cookies();
  const token = SESSION_COOKIES.map((name) => jar.get(name)?.value).find(Boolean);
  if (!token) return "none";

  const session = await db.session.findUnique({
    where: { sessionToken: token },
    select: { lastSeenAt: true, user: { select: { role: true } } },
  });
  if (!session) return "none";

  const now = new Date();
  if (isIdle(session.lastSeenAt, session.user.role, now)) {
    await db.session.deleteMany({ where: { sessionToken: token } });
    return "timed-out";
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { sessionToken: token }, data: { lastSeenAt: now } });
  }
  return "active";
}
