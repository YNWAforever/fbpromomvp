import { createHmac, timingSafeEqual } from "node:crypto";

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
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return undefined; }
}

export function signScopedApprovalToken(payload: Omit<ScopedApprovalToken, "kind">, secret: string): string {
  const encoded = encode(JSON.stringify({ kind: "approval", ...payload } satisfies ScopedApprovalToken));
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function verifyScopedApprovalToken(token: string, secret: string, now = new Date()): ScopedApprovalToken | null {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied || !secret) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  const decoded = decode(encoded);
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as Partial<ScopedApprovalToken>;
    if (value.kind !== "approval" || typeof value.venueId !== "string" || typeof value.approvalId !== "string" || typeof value.exp !== "number") return null;
    if (value.exp <= Math.floor(now.getTime() / 1000)) return null;
    return value as ScopedApprovalToken;
  } catch { return null; }
}

