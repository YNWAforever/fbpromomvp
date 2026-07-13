import { describe, expect, it } from "vitest";
import { canActivateVenue, isLiveReadingFresh, isLiveReadingUsableInWindow, isWithinBusinessHours, normalizeBusinessHours } from "./activation";

describe("venue activation and local coverage windows", () => {
  it("normalizes day names and windows without changing storage semantics", () => {
    expect(
      normalizeBusinessHours({
        Monday: [{ open: "09:00", close: "18:00" }],
        sunday: "10:00-14:00",
      }),
    ).toEqual({
      "0": [{ start: "10:00", end: "14:00" }],
      "1": [{ start: "09:00", end: "18:00" }],
    });
  });

  it("matches windows using venue-local time across a daylight-saving transition", () => {
    const hours = normalizeBusinessHours({ Sunday: [{ start: "01:00", end: "04:00" }] });

    // 06:30Z is 01:30 EST before the spring-forward jump; it is inside the
    // local window even though the UTC offset changes later that morning.
    expect(isWithinBusinessHours(new Date("2026-03-08T06:30:00.000Z"), "America/New_York", hours)).toBe(true);
    // 08:30Z is 04:30 EDT and is outside the same local window.
    expect(isWithinBusinessHours(new Date("2026-03-08T08:30:00.000Z"), "America/New_York", hours)).toBe(false);
  });

  it("rejects stale, unavailable, and future live readings", () => {
    const now = new Date("2026-07-13T04:00:00.000Z");
    expect(isLiveReadingFresh({ observedAt: new Date("2026-07-13T03:59:00.000Z"), status: "ok", delta: -20 }, now)).toBe(true);
    expect(isLiveReadingFresh({ observedAt: new Date("2026-07-12T03:59:00.000Z"), status: "ok", delta: -20 }, now)).toBe(false);
    expect(isLiveReadingFresh({ observedAt: new Date("2026-07-13T04:01:00.000Z"), status: "ok", delta: -20 }, now)).toBe(false);
    expect(isLiveReadingFresh({ observedAt: new Date("2026-07-13T03:59:00.000Z"), status: "unavailable", delta: null }, now)).toBe(false);
  });

  it("matches a fresh reading against the venue-local window", () => {
    const now = new Date("2026-07-13T03:35:00.000Z");
    const hours = normalizeBusinessHours({ Monday: [{ start: "11:00", end: "13:00" }] });
    const reading = { observedAt: new Date("2026-07-13T03:30:00.000Z"), status: "ok" as const, delta: -20 };
    expect(isLiveReadingUsableInWindow(reading, "Asia/Hong_Kong", hours, now)).toBe(true);
  });
  it("blocks activation until every required onboarding dependency is present", () => {
    expect(
      canActivateVenue({
        forecastAvailable: true,
        matchConfirmed: true,
        businessHoursConfigured: true,
        ownerReference: "owner",
        channelReference: "channel",
        audienceReference: "audience",
        activeOfferTemplate: true,
      }),
    ).toEqual({ allowed: true, blockers: [] });

    expect(
      canActivateVenue({
        forecastAvailable: false,
        matchConfirmed: true,
        businessHoursConfigured: true,
        ownerReference: "owner",
        channelReference: "channel",
        audienceReference: "audience",
        activeOfferTemplate: true,
      }),
    ).toMatchObject({ allowed: false, blockers: ["forecast"] });
  });
});
