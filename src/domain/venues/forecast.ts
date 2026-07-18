/**
 * BestTime returns venue identity separately from its forecast analysis. Keep
 * the availability check strict so an identity-only response cannot satisfy
 * activation requirements.
 */
export function hasForecastData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
    if (!/(forecast|busyness|coverage|prediction|weekday|hour|day)/i.test(key)) return false;
    if (typeof entry === "number") return Number.isFinite(entry);
    if (Array.isArray(entry)) return entry.length > 0;
    return Boolean(entry && typeof entry === "object" && Object.keys(entry).length > 0);
  });
}
