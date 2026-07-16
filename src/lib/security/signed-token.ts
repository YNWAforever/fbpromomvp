import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;

export type ScopedToken = {
  version: 1;
  scope: string;
  subject: string;
  exp: number;
};

export type ScopedApprovalToken = {
  kind: "approval";
  venueId: string;
  approvalId: string;
  exp: number;
};

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string | undefined {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (!decoded || encode(decoded) !== value) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

function signature(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

/** Sign a versioned HMAC token scoped to one subject (for example, a promotion). */
export function signScopedToken(payload: Omit<ScopedToken, "version">, secret: string): string {
  if (!secret || !payload.scope.trim() || !payload.subject.trim() || !Number.isFinite(payload.exp)) {
    throw new Error("invalid scoped token payload");
  }
  const encoded = encode(JSON.stringify({ version: TOKEN_VERSION, ...payload } satisfies ScopedToken));
  return `${encoded}.${signature(encoded, secret)}`;
}

/** Verify signature, version, scope, and expiry without disclosing token details. */
export function verifyScopedToken(token: string, secret: string, expectedScope?: string, now = new Date()): ScopedToken | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !secret) return null;
  const [encoded, supplied] = parts;
  const expected = signature(encoded, secret);
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  const decoded = decode(encoded);
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as Partial<ScopedToken>;
    if (value.version !== TOKEN_VERSION || typeof value.scope !== "string" || typeof value.subject !== "string" || !value.scope || !value.subject || typeof value.exp !== "number" || !Number.isFinite(value.exp)) return null;
    if (expectedScope !== undefined && value.scope !== expectedScope) return null;
    if (value.exp <= Math.floor(now.getTime() / 1000)) return null;
    return value as ScopedToken;
  } catch {
    return null;
  }
}

export function signScopedApprovalToken(payload: Omit<ScopedApprovalToken, "kind">, secret: string): string {
  const encoded = encode(JSON.stringify({ kind: "approval", ...payload } satisfies ScopedApprovalToken));
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyScopedApprovalToken(token: string, secret: string, now = new Date()): ScopedApprovalToken | null {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied || !secret) return null;
  const expected = signature(encoded, secret);
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  const decoded = decode(encoded);
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as Partial<ScopedApprovalToken>;
    if (value.kind !== "approval" || typeof value.venueId !== "string" || typeof value.approvalId !== "string" || typeof value.exp !== "number") return null;
    if (value.exp <= Math.floor(now.getTime() / 1000)) return null;
    return value as ScopedApprovalToken;
  } catch {
    return null;
  }
}

export type ScopedRedemptionLinkInput = {
  baseUrl: string;
  secret: string;
  promotionId: string;
  expiresAt: Date | string | number;
  now?: Date;
};

/** Build a promotion-scoped redemption URL with an expiry no longer than the promotion window. */
export function createScopedRedemptionLink(input: ScopedRedemptionLinkInput): string {
  if (!input.secret || !input.promotionId.trim() || !input.baseUrl.trim()) {
    throw new Error("invalid scoped redemption link input");
  }
  const baseUrl = new URL(input.baseUrl);
  if (!/^https?:$/i.test(baseUrl.protocol)) throw new Error("invalid scoped redemption link base URL");
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const expiresMs = input.expiresAt instanceof Date
    ? input.expiresAt.getTime()
    : typeof input.expiresAt === "number"
      ? input.expiresAt
      : new Date(input.expiresAt).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    throw new Error("invalid scoped redemption link expiry");
  }
  const boundedExpiry = Math.min(expiresMs, nowMs + 2 * 60 * 60 * 1000);
  const token = signScopedToken({
    scope: "promotion",
    subject: input.promotionId,
    exp: Math.floor(boundedExpiry / 1000),
  }, input.secret);
  return baseUrl.toString().replace(/\/+$/, "") + "/redeem/" + token;
}