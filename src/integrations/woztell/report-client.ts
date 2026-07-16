import { env } from "@/env";
import type { WeeklyReportMessage, WeeklyReportProvider } from "@/application/reports/send-weekly";
import { WozTellIsolationError, WozTellProviderError } from "./bot-client";

type Options = {
  baseUrl?: string; accessToken?: string; appId?: string; channelId?: string; environmentId?: string;
  treeId?: string; nodeId?: string; priorityGroupId?: string; runtimeEnvironment?: string;
  nonProductionAudienceIds?: string[] | string; nonProductionAudiencePrefix?: string; timeoutMs?: number; fetch?: typeof globalThis.fetch;
};
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function messageId(value: unknown): string | undefined {
  const root = record(value); const data = record(root.data);
  for (const candidate of [root.messageId, root.message_id, root.id, data.messageId, data.message_id, data.id]) if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return undefined;
}
function list(value: string[] | string | undefined): string[] { return Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }

export function createWozTellReportClient(options: Options = {}): WeeklyReportProvider {
  const baseUrl = (options.baseUrl ?? env.WOZTELL_BOT_API_URL).replace(/\/+$/, "");
  const accessToken = options.accessToken ?? env.WOZTELL_ACCESS_TOKEN;
  const appId = options.appId ?? env.WOZTELL_APP_ID;
  const channelId = options.channelId ?? env.WOZTELL_CHANNEL_ID;
  const environmentId = options.environmentId ?? env.WOZTELL_ENVIRONMENT_ID;
  const treeId = options.treeId ?? env.WOZTELL_TREE_ID;
  const nodeId = options.nodeId ?? env.WOZTELL_NODE_ID;
  const priorityGroupId = options.priorityGroupId ?? env.WOZTELL_PRIORITY_GROUP_ID;
  const runtime = (options.runtimeEnvironment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  const allowed = list(options.nonProductionAudienceIds ?? env.WOZTELL_NON_PRODUCTION_AUDIENCE_IDS);
  const prefix = (options.nonProductionAudiencePrefix ?? env.WOZTELL_NON_PRODUCTION_AUDIENCE_PREFIX)?.trim();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    async sendReport(input: WeeklyReportMessage) {
      if (!accessToken || !channelId || !environmentId || !treeId || !nodeId) throw new WozTellProviderError("WozTell report configuration unavailable", "credentials_unavailable");
      if (!input.reportId || !input.memberId || !input.reportUrl || !input.imageUrl) throw new WozTellProviderError("WozTell report payload is invalid", "invalid_payload");
      if (runtime !== "production") {
        if (!environmentId || !priorityGroupId) throw new WozTellIsolationError();
        const ids = [channelId, environmentId, treeId, nodeId, priorityGroupId];
        const permitted = (value: string) => allowed.includes(value) || Boolean(prefix && value.startsWith(prefix));
        if ((!allowed.length && !prefix) || ids.some((value) => !permitted(value) || /(^|[-_:])(?:prod(?:uction)?|live)([-_:]|$)/iu.test(value))) throw new WozTellIsolationError();
      }
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
      try {
        const endpoint = new URL(`${baseUrl}/redirectMemberToNode`); endpoint.searchParams.set("accessToken", accessToken);
        const body: Record<string, unknown> = { app: appId, channel: channelId, environment: environmentId, member: input.memberId, tree: treeId, node: nodeId, executeActions: true, executeConditions: true, executeRules: true, meta: { reportId: input.reportId, venueId: input.venueId, venueName: input.venueName, periodStart: input.periodStart, periodEnd: input.periodEnd, reportUrl: input.reportUrl, imageUrl: input.imageUrl } };
        if (priorityGroupId) body.priorityGroupId = priorityGroupId;
        if (body.app === undefined) delete body.app;
        const response = await fetchImpl(endpoint.toString(), { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) throw new WozTellProviderError(`WozTell request failed (${response.status})`, `http_${response.status}`);
        const id = messageId(await response.json()); if (!id) throw new WozTellProviderError("WozTell response did not include a message id", "invalid_response");
        return { messageId: id };
      } catch (error) {
        if (error instanceof WozTellIsolationError || error instanceof WozTellProviderError) throw error;
        if (controller.signal.aborted) throw new WozTellProviderError("WozTell report request timed out", "provider_timeout");
        throw new WozTellProviderError("WozTell report request failed", "provider_error");
      } finally { clearTimeout(timer); }
    },
  };
}