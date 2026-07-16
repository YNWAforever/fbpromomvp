import type { DatabaseExecutor } from "@/db/client";
import { claimWeeklyReportDelivery, updateWeeklyReport } from "@/db/repositories/reports";
import { signScopedToken } from "@/lib/security/signed-token";

export const WEEKLY_REPORT_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

function isDefinitelyUnsent(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return code === "credentials_unavailable"
    || code === "invalid_payload"
    || code === "audience_isolation"
    || (typeof code === "string" && /^http_4\d{2}$/u.test(code));
}

export type WeeklyReportMessage = {
  reportId: string;
  venueId: string;
  venueName: string;
  memberId: string;
  periodStart: string;
  periodEnd: string;
  reportUrl: string;
  imageUrl: string;
};
export type WeeklyReportProvider = { sendReport(input: WeeklyReportMessage): Promise<{ messageId: string }> };

export function createWeeklyReportLinks(input: { baseUrl: string; secret: string; reportId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const token = signScopedToken({ scope: "weekly-report", subject: input.reportId, exp: Math.floor(now.getTime() / 1000) + WEEKLY_REPORT_TOKEN_TTL_SECONDS }, input.secret);
  const base = input.baseUrl.replace(/\/+$/, "");
  return { reportUrl: `${base}/reports/${token}`, imageUrl: `${base}/reports/${token}/image` };
}

export async function sendWeeklyReports(input: {
  db: DatabaseExecutor;
  generated: Array<{ venue: Record<string, unknown>; report: Record<string, unknown>; ownerMemberId?: string }>;
  provider: WeeklyReportProvider;
  baseUrl: string;
  secret: string;
  now?: Date;
  repositories?: {
    claimWeeklyReportDelivery?: typeof claimWeeklyReportDelivery;
    updateWeeklyReport?: typeof updateWeeklyReport;
  };
}) {
  const update = input.repositories?.updateWeeklyReport ?? updateWeeklyReport;
  const claim = input.repositories?.claimWeeklyReportDelivery
    ?? (input.repositories?.updateWeeklyReport
      ? (db: DatabaseExecutor, id: string) => update(db, id, { state: "sending" })
      : claimWeeklyReportDelivery);
  let sent = 0;
  let incomplete = 0;
  let alreadySent = 0;
  let uncertain = 0;
  const reports: Array<Record<string, unknown>> = [];
  for (const item of input.generated) {
    const reportId = String(item.report.id ?? "");
    const venueId = String(item.venue.id ?? "");
    if (!reportId || !venueId) throw new Error("weekly report delivery input is incomplete");
    if (item.report.state === "sending") {
      reports.push(item.report);
      uncertain += 1;
      continue;
    }
    if (item.report.state === "sent" || (typeof item.report.providerMessageId === "string" && item.report.providerMessageId.trim())) {
      reports.push(item.report);
      alreadySent += 1;
      continue;
    }
    if (!item.ownerMemberId) {
      const report = await update(input.db, reportId, { state: "incomplete" });
      reports.push(report as unknown as Record<string, unknown>);
      incomplete += 1;
      continue;
    }
    const periodStart = new Date(String(item.report.periodStart));
    const periodEnd = new Date(String(item.report.periodEnd));
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || !(periodStart < periodEnd)) {
      throw new Error("weekly report period is invalid");
    }
    const links = createWeeklyReportLinks({ baseUrl: input.baseUrl, secret: input.secret, reportId, now: input.now });
    const claimed = await claim(input.db, reportId);
    if (!claimed) {
      reports.push({ ...item.report, state: "sending" });
      uncertain += 1;
      continue;
    }
    let receipt: { messageId: string };
    try {
      receipt = await input.provider.sendReport({
      reportId,
      venueId,
      venueName: String(item.venue.name ?? "Venue"),
      memberId: item.ownerMemberId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        ...links,
      });
    } catch (error) {
      if (isDefinitelyUnsent(error)) {
        try {
          await update(input.db, reportId, { state: "failed" });
        } catch {
          // A failed release leaves the durable sending marker for reconciliation.
        }
      }
      throw error;
    }
    const report = await update(input.db, reportId, { state: "sent", providerMessageId: receipt.messageId });
    reports.push(report as unknown as Record<string, unknown>);
    sent += 1;
  }
  return { total: input.generated.length, sent, incomplete, alreadySent, uncertain, reports };
}