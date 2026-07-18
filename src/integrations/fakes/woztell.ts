import receiptsFixture from "@/test/fixtures/woztell/receipts.json";
import type { WeeklyReportMessage, WeeklyReportProvider } from "@/application/reports/send-weekly";
import type { ApprovalMessage, MessagingProvider } from "@/integrations/woztell/bot-client";
import type { BroadcastInput, BroadcastReceipt } from "@/integrations/woztell/open-api-client";

export type RecordedApproval = ApprovalMessage & { messageId: string };
export type RecordedBroadcast = BroadcastInput & { receipt: BroadcastReceipt };
export type RecordedReport = WeeklyReportMessage & { messageId: string };

/** In-memory WozTell adapter for acceptance tests; no transport or credentials are involved. */
export class FakeWozTellProvider implements MessagingProvider, WeeklyReportProvider {
  readonly approvals: RecordedApproval[] = [];
  readonly broadcasts: RecordedBroadcast[] = [];
  readonly reports: RecordedReport[] = [];

  async sendApproval(input: ApprovalMessage): Promise<{ messageId: string }> {
    const messageId = `fake-approval-${this.approvals.length + 1}`;
    this.approvals.push({ ...input, candidates: input.candidates.map((candidate) => ({ ...candidate })), messageId });
    return { messageId };
  }

  async createBroadcast(input: BroadcastInput): Promise<BroadcastReceipt> {
    const receipt: BroadcastReceipt = {
      broadcastId: `fake-broadcast-${this.broadcasts.length + 1}`,
      memberCount: receiptsFixture.memberCount,
      sentCount: receiptsFixture.sentCount,
      sent: true,
    };
    this.broadcasts.push({ ...input, messages: { ...input.messages }, receipt });
    return receipt;
  }

  async sendReport(input: WeeklyReportMessage): Promise<{ messageId: string }> {
    const messageId = `fake-weekly-report-${this.reports.length + 1}`;
    this.reports.push({ ...input, messageId });
    return { messageId };
  }
}

export function createFakeWozTellProvider() {
  return new FakeWozTellProvider();
}
