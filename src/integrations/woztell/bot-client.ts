import { env } from "@/env";

export type ApprovalCandidateMessage = { id: string; body: string };

export type ApprovalMessage = {
  approvalId: string;
  venueId?: string;
  memberId: string;
  expiresAt: string;
  candidates: ApprovalCandidateMessage[];
  ownerLink?: string;
};

export type MessagingProvider = {
  sendApproval(input: ApprovalMessage): Promise<{ messageId: string }>;
};

export type WozTellBotClientOptions = {
  baseUrl?: string;
  accessToken?: string;
  appId?: string;
  channelId?: string;
  environmentId?: string;
  treeId?: string;
  nodeId?: string;
  priorityGroupId?: string;
  productionChannelId?: string;
  productionEnvironmentId?: string;
  productionTreeId?: string;
  productionNodeId?: string;
  productionPriorityGroupId?: string;
  runtimeEnvironment?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export class WozTellProviderError extends Error {
  constructor(message: string, public readonly code = "provider_error") {
    super(message);
    this.name = "WozTellProviderError";
  }
}

export class WozTellIsolationError extends WozTellProviderError {
  constructor(message = "WozTell audience isolation is not configured") {
    super(message, "audience_isolation");
    this.name = "WozTellIsolationError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function looksLikeProductionAudienceId(value: string): boolean {
  return /(^|[-_:])prod(?:uction)?([-_:]|$)/iu.test(value) || /(^|[-_:])live([-_:]|$)/iu.test(value);
}
function responseMessageId(payload: unknown): string | undefined {
  const root = record(payload);
  const data = record(root.data);
  for (const value of [root.messageId, root.message_id, root.id, data.messageId, data.message_id, data.id]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Typed WozTell Bot API adapter. No provider payload or secret is logged. */
export function createWozTellBotClient(options: WozTellBotClientOptions = {}): MessagingProvider {
  const baseUrl = (options.baseUrl ?? env.WOZTELL_BOT_API_URL).replace(/\/+$/, "");
  const accessToken = options.accessToken ?? env.WOZTELL_ACCESS_TOKEN;
  const channelId = options.channelId ?? env.WOZTELL_CHANNEL_ID;
  const environmentId = options.environmentId ?? env.WOZTELL_ENVIRONMENT_ID;
  const treeId = options.treeId ?? env.WOZTELL_TREE_ID;
  const nodeId = options.nodeId ?? env.WOZTELL_NODE_ID;
  const priorityGroupId = options.priorityGroupId ?? env.WOZTELL_PRIORITY_GROUP_ID;
  const runtimeEnvironment = (options.runtimeEnvironment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    async sendApproval(input: ApprovalMessage): Promise<{ messageId: string }> {
      if (!accessToken || !channelId || !treeId || !nodeId) {
        throw new WozTellProviderError("WozTell approval configuration unavailable", "credentials_unavailable");
      }
      if (!input.approvalId || !input.memberId || !input.expiresAt || input.candidates.length !== 3) {
        throw new WozTellProviderError("WozTell approval payload is invalid", "invalid_payload");
      }
      // Test/preview sends must be restricted to the configured Priority Group.
      if (runtimeEnvironment !== "production") {
        if (!environmentId || !priorityGroupId) throw new WozTellIsolationError();
        const audienceIds = [channelId, environmentId, treeId, nodeId, priorityGroupId];
        const productionIds = [options.productionChannelId, options.productionEnvironmentId, options.productionTreeId, options.productionNodeId, options.productionPriorityGroupId].filter((value): value is string => Boolean(value));
        if (audienceIds.some((value) => productionIds.includes(value) || looksLikeProductionAudienceId(value))) throw new WozTellIsolationError();
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const endpoint = new URL(`${baseUrl}/redirectMemberToNode`);
        endpoint.searchParams.set("accessToken", accessToken);
        const body: Record<string, unknown> = {
          app: options.appId,
          channel: channelId,
          environment: environmentId,
          member: input.memberId,
          tree: treeId,
          node: nodeId,
          // These flags are required for approval-node action/rule/condition execution.
          executeActions: true,
          executeConditions: true,
          executeRules: true,
          meta: {
            approvalId: input.approvalId,
            ...(input.venueId ? { venueId: input.venueId } : {}),
            expiresAt: input.expiresAt,
            candidates: input.candidates,
            ...(input.ownerLink ? { ownerLink: input.ownerLink } : {}),
          },
        };
        if (priorityGroupId) body.priorityGroupId = priorityGroupId;
        // Avoid serialising undefined app/environment keys into provider payloads.
        for (const key of ["app", "environment"]) if (body[key] === undefined) delete body[key];
        const response = await fetchImpl(endpoint.toString(), {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) throw new WozTellProviderError(`WozTell request failed (${response.status})`, `http_${response.status}`);
        const messageId = responseMessageId(await response.json());
        if (!messageId) throw new WozTellProviderError("WozTell response did not include a message id", "invalid_response");
        return { messageId };
      } catch (error) {
        if (error instanceof WozTellIsolationError) throw error;
        if (controller.signal.aborted) throw new WozTellProviderError("WozTell request timed out", "provider_timeout");
        if (error instanceof WozTellProviderError && !error.message.includes(accessToken)) throw error;
        // Do not include provider error text: it may contain the access token or member identifier.
        throw new WozTellProviderError("WozTell approval request failed", "provider_error");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const createWozTellBotProvider = createWozTellBotClient;
