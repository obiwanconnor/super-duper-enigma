"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
const PING_EVERY_MS = 5 * 60_000;

/**
 * Warns before an idle sign-out (WCAG 2.2.1 Timing Adjustable): a modal
 * dialog says when the session will end and lets the person extend it with
 * one action. Activity in this tab counts and is reported to the server.
 */
export function IdleWatcher({
  limitMinutes,
  warnMinutes,
  signOutAction,
}: {
  limitMinutes: number;
  warnMinutes: number;
  signOutAction: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [deadline, setDeadline] = useState<Date | null>(null);

  const ping = useCallback(async () => {
    lastPing.current = Date.now();
    const res = await fetch("/api/session/ping", { method: "POST" }).catch(() => null);
    if (res && res.status === 401) window.location.href = "/login?error=timeout";
  }, []);

  const stay = useCallback(async () => {
    lastActivity.current = Date.now();
    await ping();
    setDeadline(null);
    dialogRef.current?.close();
  }, [ping]);

  useEffect(() => {
    const onActivity = () => {
      if (dialogRef.current?.open) return; // only an explicit choice dismisses the warning
      lastActivity.current = Date.now();
      if (Date.now() - lastPing.current > PING_EVERY_MS) void ping();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      const limitMs = limitMinutes * 60_000;
      if (idleMs >= limitMs) {
        window.location.href = "/login?error=timeout";
      } else if (idleMs >= limitMs - warnMinutes * 60_000 && !dialogRef.current?.open) {
        setDeadline(new Date(lastActivity.current + limitMs));
        dialogRef.current?.showModal();
      }
    }, 15_000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [limitMinutes, warnMinutes, ping]);

  const time = deadline?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="idle-title"
      aria-describedby="idle-desc"
      onCancel={(e) => {
        e.preventDefault();
        void stay();
      }}
      className="m-auto max-w-md rounded-lg border border-slate-300 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/50"
    >
      <h2 id="idle-title" className="text-lg font-semibold">
        Are you still there?
      </h2>
      <p id="idle-desc" className="mt-2 text-sm">
        For your security, you&apos;ll be signed out at {time} because you haven&apos;t used the portal for a while. Anything you haven&apos;t sent will be lost.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <form action={signOutAction}>
          <button type="submit" className="btn-secondary">
            Sign out now
          </button>
        </form>
        <button type="button" autoFocus onClick={() => void stay()} className="btn-primary">
          Stay signed in
        </button>
      </div>
    </dialog>
  );
}
