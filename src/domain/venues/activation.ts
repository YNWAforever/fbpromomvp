import { DateTime } from "luxon";
import type { CoverageWindow, NormalizedBusinessHours } from "./types";

const DAY_NAMES: Record<string, string> = {
  sunday: "0", sun: "0", monday: "1", mon: "1", tuesday: "2", tue: "2", tues: "2",
  wednesday: "3", wed: "3", thursday: "4", thu: "4", thurs: "4", friday: "5", fri: "5", saturday: "6", sat: "6",
};

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseWindow(value: unknown): CoverageWindow | null {
  if (typeof value === "string") {
    const [start, end] = value.split(/\s*(?:-|–|—|to)\s*/i);
    const normalizedStart = start ? normalizeTime(start) : null;
    const normalizedEnd = end ? normalizeTime(end) : null;
    return normalizedStart && normalizedEnd ? { start: normalizedStart, end: normalizedEnd } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const start = typeof record.start === "string" ? record.start : typeof record.open === "string" ? record.open : null;
  const end = typeof record.end === "string" ? record.end : typeof record.close === "string" ? record.close : null;
  const normalizedStart = start ? normalizeTime(start) : null;
  const normalizedEnd = end ? normalizeTime(end) : null;
  return normalizedStart && normalizedEnd ? { start: normalizedStart, end: normalizedEnd } : null;
}

export function normalizeBusinessHours(value: unknown): NormalizedBusinessHours {
  if (!value || typeof value !== "object") return {};
  const result: NormalizedBusinessHours = {};
  for (const [rawDay, rawWindows] of Object.entries(value as Record<string, unknown>)) {
    const key = rawDay.trim().toLowerCase();
    const day = DAY_NAMES[key] ?? (/^[0-6]$/.test(key) ? key : null);
    if (day === null) continue;
    const entries = Array.isArray(rawWindows) ? rawWindows : [rawWindows];
    const windows = entries.map(parseWindow).filter((window): window is CoverageWindow => Boolean(window));
    if (windows.length > 0) result[day] = windows;
  }
  return result;
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isWithinBusinessHours(instant: Date, timezone: string, businessHours: NormalizedBusinessHours): boolean {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  if (!local.isValid) return false;
  const windows = businessHours[String(local.weekday % 7)] ?? [];
  const localMinutes = local.hour * 60 + local.minute;
  return windows.some((window) => {
    const start = minutes(window.start);
    const end = minutes(window.end);
    if (start === end) return false;
    return end > start ? localMinutes >= start && localMinutes < end : localMinutes >= start || localMinutes < end;
  });
}

export type ActivationRequirements = {
  forecastAvailable: boolean;
  matchConfirmed: boolean;
  businessHoursConfigured: boolean;
  ownerReference?: string | null;
  channelReference?: string | null;
  audienceReference?: string | null;
  activeOfferTemplate: boolean;
};

export function canActivateVenue(requirements: ActivationRequirements): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!requirements.forecastAvailable) blockers.push("forecast");
  if (!requirements.matchConfirmed) blockers.push("match_confirmation");
  if (!requirements.businessHoursConfigured) blockers.push("business_hours");
  if (!requirements.ownerReference?.trim()) blockers.push("woztell_owner");
  if (!requirements.channelReference?.trim()) blockers.push("woztell_channel");
  if (!requirements.audienceReference?.trim()) blockers.push("woztell_audience");
  if (!requirements.activeOfferTemplate) blockers.push("offer_template");
  return { allowed: blockers.length === 0, blockers };
}

export const activationGuard = canActivateVenue;
import type { LiveReading } from "./types";

export function isLiveReadingFresh(reading: Pick<LiveReading, "observedAt" | "status" | "delta">, now = new Date(), maxAgeMs = 5 * 60 * 1000): boolean {
  if (reading.status !== "ok" || reading.delta === null) return false;
  const age = now.getTime() - reading.observedAt.getTime();
  return age >= 0 && age <= maxAgeMs;
}

export function isLiveReadingUsableInWindow(
  reading: Pick<LiveReading, "observedAt" | "status" | "delta">,
  timezone: string,
  businessHours: NormalizedBusinessHours,
  now = new Date(),
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  return isLiveReadingFresh(reading, now, maxAgeMs) && isWithinBusinessHours(reading.observedAt, timezone, businessHours);
}
