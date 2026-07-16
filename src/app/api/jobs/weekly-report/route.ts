import { NextResponse } from "next/server";
import { generateWeeklyReports } from "@/application/reports/generate-weekly";
import { sendWeeklyReports } from "@/application/reports/send-weekly";
import { withDatabase } from "@/db/client";
import { claimJobRun, updateJobRun } from "@/db/repositories/jobs";
import { env } from "@/env";
import { createWozTellReportClient } from "@/integrations/woztell/report-client";
import { verifyHmacRequest } from "@/lib/security/hmac";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isoInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-job-timestamp");
  const signature = request.headers.get("x-job-signature");
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!timestamp || !signature || !idempotencyKey || !verifyHmacRequest({
    secret: env.N8N_HMAC_SECRET,
    timestamp,
    signature,
    rawBody,
  })) {
    return error("invalid job signature", 401);
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return error("request body must be valid JSON", 400);
  }
  if (!value || typeof value !== "object") return error("request body must be an object", 400);

  const body = value as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const periodStart = isoInstant(body.periodStart);
  const periodEnd = isoInstant(body.periodEnd);
  if (!runId || !periodStart || !periodEnd || !(periodStart < periodEnd)) {
    return error("runId, periodStart, and periodEnd are required", 400);
  }

  const expectedKey = "weekly-report:" + runId;
  if (idempotencyKey !== expectedKey) return error("idempotency key does not match runId", 400);

  try {
    return await withDatabase(async (db) => {
      const claimed = await claimJobRun(db, {
        kind: "weekly-report",
        idempotencyKey: expectedKey,
        state: "running",
        attempts: 1,
        result: null,
        completedAt: null,
      });

      if (!claimed.claimed) {
        if (claimed.run?.state === "completed") {
          return NextResponse.json(claimed.run.result ?? { status: "completed" }, { status: 200 });
        }
        return NextResponse.json({ status: "in_progress" }, { status: 202 });
      }

      try {
        const generated = await generateWeeklyReports({ db, periodStart, periodEnd });
        const result = await sendWeeklyReports({
          db,
          generated,
          provider: createWozTellReportClient(),
          baseUrl: env.APP_BASE_URL,
          secret: env.OWNER_LINK_SECRET,
        });
        const jobResult = {
          runId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          total: result.total,
          sent: result.sent,
          incomplete: result.incomplete,
          alreadySent: result.alreadySent,
          uncertain: result.uncertain,
        };
        await updateJobRun(db, claimed.run!.id, {
          state: "completed",
          result: jobResult,
          completedAt: new Date(),
        });
        return NextResponse.json(jobResult, { status: 200 });
      } catch (cause) {
        await updateJobRun(db, claimed.run!.id, {
          state: "failed",
          result: { error: cause instanceof Error ? cause.message : "weekly report failed" },
          completedAt: new Date(),
        });
        return error("weekly report failed", 500);
      }
    });
  } catch {
    return error("weekly report failed", 500);
  }
}