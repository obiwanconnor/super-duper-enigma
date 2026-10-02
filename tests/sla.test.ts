import { describe, expect, it } from "vitest";
import { addBusinessMinutes, businessMinutesBetween, formatBusinessDuration, londonTime } from "@/lib/sla/business-time";
import { computeSla, DEFAULT_SLA_TARGETS, statusChangeData, targetsFor } from "@/lib/sla/sla";

// Wall-clock London time helper: L("2026-09-30 10:00")
const L = (s: string) => {
  const [d, t] = s.split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return londonTime(y, m, day, h * 60 + min);
};

describe("londonTime", () => {
  it("handles GMT and BST", () => {
    expect(L("2026-01-15 09:00").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(L("2026-07-15 09:00").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
});

describe("businessMinutesBetween", () => {
  it("counts only 09:00–17:00 on weekdays", () => {
    expect(businessMinutesBetween(L("2026-09-30 10:00"), L("2026-09-30 11:30"))).toBe(90);
    expect(businessMinutesBetween(L("2026-09-30 16:00"), L("2026-10-01 10:00"))).toBe(120);
    expect(businessMinutesBetween(L("2026-09-30 18:00"), L("2026-10-01 08:00"))).toBe(0);
  });

  it("skips weekends", () => {
    // Fri 16:00 -> Mon 10:00 = 1h + 1h
    expect(businessMinutesBetween(L("2026-10-02 16:00"), L("2026-10-05 10:00"))).toBe(120);
  });

  it("skips bank holidays (Christmas 2026: Fri 25th, Mon 28th substitute)", () => {
    // Thu 24th 16:00 -> Tue 29th 10:00 = 1h + 1h
    expect(businessMinutesBetween(L("2026-12-24 16:00"), L("2026-12-29 10:00"))).toBe(120);
  });

  it("is correct across the October DST change", () => {
    // Fri 23 Oct 2026 16:00 BST -> Mon 26 Oct 10:00 GMT (clocks go back Sun 25th)
    expect(businessMinutesBetween(L("2026-10-23 16:00"), L("2026-10-26 10:00"))).toBe(120);
  });
});

describe("addBusinessMinutes", () => {
  it("rolls over nights and weekends", () => {
    expect(addBusinessMinutes(L("2026-10-02 16:30"), 60).toISOString()).toBe(L("2026-10-05 09:30").toISOString());
    expect(addBusinessMinutes(L("2026-10-03 12:00"), 30).toISOString()).toBe(L("2026-10-05 09:30").toISOString());
  });

  it("round-trips with businessMinutesBetween", () => {
    const start = L("2026-12-23 14:10");
    const end = addBusinessMinutes(start, 5 * 480);
    expect(businessMinutesBetween(start, end)).toBe(5 * 480);
  });
});

describe("formatBusinessDuration", () => {
  it("formats business days of 8h", () => {
    expect(formatBusinessDuration(45)).toBe("45m");
    expect(formatBusinessDuration(135)).toBe("2h 15m");
    expect(formatBusinessDuration(480 * 3 + 120)).toBe("3d 2h");
  });
});

describe("computeSla", () => {
  const targets = DEFAULT_SLA_TARGETS.HIGH; // 4h response, 3d resolution
  const base = { createdAt: L("2026-09-30 10:00"), status: "OPEN" as const, firstRespondedAt: null, pausedAt: null, pausedBusinessMinutes: 0 };

  it("runs, then goes at risk, then breaches", () => {
    expect(computeSla(base, targets, L("2026-09-30 11:00")).firstResponse.state).toBe("running");
    expect(computeSla(base, targets, L("2026-09-30 13:30")).firstResponse.state).toBe("at_risk");
    const late = computeSla(base, targets, L("2026-09-30 15:00")).firstResponse;
    expect(late.state).toBe("breached");
    expect(late.remainingMinutes).toBe(-60);
  });

  it("stops the response clock at the first reply", () => {
    const sla = computeSla({ ...base, firstRespondedAt: L("2026-09-30 12:00") }, targets, L("2026-10-05 10:00"));
    expect(sla.firstResponse.state).toBe("met");
    expect(sla.firstResponse.elapsedMinutes).toBe(120);
  });

  it("pauses the resolution clock while waiting on the client", () => {
    const waiting = { ...base, status: "WAITING_ON_CLIENT" as const, pausedAt: L("2026-09-30 11:00") };
    const sla = computeSla(waiting, targets, L("2026-10-07 11:00"));
    expect(sla.resolution.state).toBe("paused");
    expect(sla.resolution.elapsedMinutes).toBe(60);
  });

  it("uses per-client targets when set", () => {
    expect(targetsFor("HIGH", [{ priority: "HIGH", firstResponseMinutes: 30, resolutionMinutes: 600 }])).toEqual({
      firstResponseMinutes: 30,
      resolutionMinutes: 600,
    });
    expect(targetsFor("LOW", [])).toEqual(DEFAULT_SLA_TARGETS.LOW);
  });
});

describe("statusChangeData", () => {
  const t0 = { status: "OPEN" as const, resolvedAt: null, pausedAt: null, pausedBusinessMinutes: 0 };

  it("starts and ends pauses, accumulating business minutes", () => {
    const waiting = statusChangeData(t0, "WAITING_ON_CLIENT", L("2026-09-30 10:00"));
    expect(waiting.pausedAt).toEqual(L("2026-09-30 10:00"));
    const reopened = statusChangeData({ ...t0, ...waiting }, "OPEN", L("2026-09-30 12:30"));
    expect(reopened.pausedAt).toBeNull();
    expect(reopened.pausedBusinessMinutes).toBe(150);
  });

  it("keeps the original pause start when moving between paused statuses", () => {
    const waiting = statusChangeData(t0, "WAITING_ON_CLIENT", L("2026-09-30 10:00"));
    const resolved = statusChangeData({ ...t0, ...waiting }, "RESOLVED", L("2026-10-01 10:00"));
    expect(resolved.pausedAt).toEqual(L("2026-09-30 10:00"));
    expect(resolved.resolvedAt).toEqual(L("2026-10-01 10:00"));
  });
});

import { lastMonths, median, percent } from "@/lib/stats";

describe("stats helpers", () => {
  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
  it("computes percentages", () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(2, 3)).toBe(67);
  });
  it("lists months across a year boundary", () => {
    expect(lastMonths(3, new Date("2026-02-10T00:00:00Z"))).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

import { describeTarget } from "@/lib/sla/sla";
import { parseSurveyToken, surveyToken } from "@/lib/survey";

describe("describeTarget", () => {
  it("speaks in business hours and days", () => {
    expect(describeTarget(60)).toBe("1 business hour");
    expect(describeTarget(240)).toBe("4 business hours");
    expect(describeTarget(480)).toBe("1 business day");
    expect(describeTarget(1200)).toBe("2.5 business days");
    expect(describeTarget(30)).toBe("30 business minutes");
  });
});

describe("survey tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = surveyToken(12, "cuser", "secret");
    expect(parseSurveyToken(t, "secret")).toEqual({ ticketNumber: 12, userId: "cuser" });
    expect(parseSurveyToken(t.replace("12.", "13."), "secret")).toBeNull();
    expect(parseSurveyToken(t, "other")).toBeNull();
    expect(parseSurveyToken("nonsense", "secret")).toBeNull();
  });
});

import { windowStart } from "@/lib/rate-limit";

describe("rate limit windows", () => {
  it("aligns to fixed windows", () => {
    expect(windowStart(new Date("2026-10-02T10:07:30Z"), 15 * 60).toISOString()).toBe("2026-10-02T10:00:00.000Z");
    expect(windowStart(new Date("2026-10-02T10:15:00Z"), 15 * 60).toISOString()).toBe("2026-10-02T10:15:00.000Z");
  });
});

import { idleLimitMinutes, isIdle, warningMinutes } from "@/lib/idle";

describe("idle timeouts", () => {
  it("is 8 hours for staff and 7 days for clients", () => {
    expect(idleLimitMinutes("AGENT")).toBe(480);
    expect(idleLimitMinutes("ADMIN")).toBe(480);
    expect(idleLimitMinutes("CLIENT")).toBe(7 * 24 * 60);
    const now = new Date("2026-10-02T18:00:00Z");
    expect(isIdle(new Date("2026-10-02T09:59:00Z"), "AGENT", now)).toBe(true);
    expect(isIdle(new Date("2026-10-02T10:01:00Z"), "AGENT", now)).toBe(false);
    expect(isIdle(new Date("2026-10-02T09:59:00Z"), "CLIENT", now)).toBe(false);
  });
  it("warns at least a minute ahead, at most five", () => {
    expect(warningMinutes(480)).toBe(5);
    expect(warningMinutes(2)).toBe(1);
  });
});

import { parseLondonDateTime, toLondonInput } from "@/lib/notices";

describe("notice date inputs", () => {
  it("round-trips UK local time across DST", () => {
    const summer = parseLondonDateTime("2026-07-01T22:00")!;
    expect(summer.toISOString()).toBe("2026-07-01T21:00:00.000Z");
    expect(toLondonInput(summer)).toBe("2026-07-01T22:00");
    const winter = parseLondonDateTime("2026-12-01T22:00")!;
    expect(winter.toISOString()).toBe("2026-12-01T22:00:00.000Z");
    expect(parseLondonDateTime("nonsense")).toBeNull();
  });
});
