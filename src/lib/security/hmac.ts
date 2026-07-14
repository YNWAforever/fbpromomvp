import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_HMAC_MAX_SKEW_SECONDS = 300;

export type HmacRequestInput = {
  secret: string;
  timestamp: string | number;
  signature?: string;
  /** The unmodified request body (before JSON parsing). */
  rawBody?: string;
  /** Alias accepted for callers that use `body`. */
  body?: string;
  now?: Date | number;
  maxSkewSeconds?: number;
};

function canonicalTimestamp(value: string | number): string | null {
  const text = String(value).trim();
  if (!text) return null;
  // n8n uses Unix milliseconds/seconds. Accept ISO timestamps for internal
  // callers while signing the exact header value supplied by the caller.
  if (/^\d+(?:\.\d+)?$/.test(text)) return text;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : text;
}

function timestampMillis(value: string | number): number | null {
  const text = canonicalTimestamp(value);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : null;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function nowMillis(value?: Date | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  return Date.now();
}

/** Sign `${timestamp}.${rawBody}` with SHA-256 and return a lowercase hex digest. */
export function signHmacRequest(
  input: HmacRequestInput | string,
  timestamp?: string | number,
  rawBody?: string,
): string {
  if (typeof input === "string") {
    if (timestamp === undefined || rawBody === undefined) throw new Error("timestamp and raw body are required");
    return createHmac("sha256", input).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  }
  const body = input.rawBody ?? input.body;
  if (body === undefined) throw new Error("raw body is required");
  const canonical = canonicalTimestamp(input.timestamp);
  if (!canonical) throw new Error("invalid timestamp");
  return createHmac("sha256", input.secret).update(`${canonical}.${body}`, "utf8").digest("hex");
}

function normalizeSignature(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
}

/**
 * Verify a timestamped HMAC request. Invalid/missing input returns false and
 * never throws, making it safe to use at a route boundary.
 */
export function verifyHmacRequest(input: HmacRequestInput): boolean {
  const body = input.rawBody ?? input.body;
  if (!input.secret || body === undefined || !input.signature) return false;
  const timestamp = canonicalTimestamp(input.timestamp);
  const requestMillis = timestampMillis(input.timestamp);
  if (!timestamp || requestMillis === null) return false;
  const maxSkew = input.maxSkewSeconds ?? DEFAULT_HMAC_MAX_SKEW_SECONDS;
  if (!Number.isFinite(maxSkew) || maxSkew < 0) return false;
  if (Math.abs(nowMillis(input.now) - requestMillis) > maxSkew * 1000) return false;

  const expected = signHmacRequest({ secret: input.secret, timestamp, rawBody: body });
  const supplied = normalizeSignature(input.signature);
  // Pad to equal length before timingSafeEqual so malformed signatures do not
  // throw (and both branches still exercise a constant-time comparison).
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const comparison = Buffer.alloc(expectedBytes.length);
  suppliedBytes.copy(comparison, 0, 0, Math.min(suppliedBytes.length, comparison.length));
  const sameLength = suppliedBytes.length === expectedBytes.length;
  return timingSafeEqual(expectedBytes, comparison) && sameLength;
}

export const sign = signHmacRequest;

