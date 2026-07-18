import crypto from "node:crypto";

const hmacSecret = "12345678901234567890123456789012";

export function signedJobRequest(body: Record<string, unknown>, idempotencyKey: string) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const signature = crypto.createHmac("sha256", hmacSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    data: rawBody,
    headers: {
      "content-type": "application/json",
      "x-job-timestamp": timestamp,
      "x-job-signature": signature,
      "idempotency-key": idempotencyKey,
    },
  };
}