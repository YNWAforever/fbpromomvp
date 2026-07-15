import { env } from "@/env";

export type BroadcastInput = {
  promotionId: string;
  audienceId: string;
  name: string;
  messages: Record<string, unknown>;
  scheduleAt: number;
  priority?: string | number;
};

export type BroadcastReceipt = {
  broadcastId: string;
  memberCount: number | null;
  sentCount: number | null;
  sent?: boolean;
  sentStart?: string | null;
  sentEnd?: string | null;
};

export type WozTellOpenApiClientOptions = {
  baseUrl?: string;
  accessToken?: string;
  appId?: string;
  channelId?: string;
  runtimeEnvironment?: string;
  nonProductionAudienceIds?: string[] | string;
  nonProductionAudiencePrefix?: string;
  productionAudienceIds?: string[] | string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export class WozTellOpenApiError extends Error {
  constructor(message: string, public readonly code = "provider_error") {
    super(message);
    this.name = "WozTellOpenApiError";
  }
}

const CREATE_BROADCAST = `mutation CreateBroadcast($input: CreateBroadcastInput!) {
  createBroadcast(input: $input) {
    clientMutationId
    broadcast { id memberCount sentCount sent sentStart sentEnd }
  }
}`;

function list(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function looksProduction(value: string): boolean {
  return /(^|[-_:])(?:prod(?:uction)?|live)([-_:]|$)/iu.test(value);
}

export function createWozTellOpenApiClient(options: WozTellOpenApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? env.WOZTELL_OPEN_API_URL).replace(/\/+$/, "");
  const accessToken = options.accessToken ?? env.WOZTELL_ACCESS_TOKEN;
  const appId = options.appId ?? env.WOZTELL_APP_ID;
  const channelId = options.channelId ?? env.WOZTELL_CHANNEL_ID;
  const runtimeEnvironment = (options.runtimeEnvironment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  const allowlisted = list(options.nonProductionAudienceIds ?? env.WOZTELL_NON_PRODUCTION_AUDIENCE_IDS);
  const prefix = (options.nonProductionAudiencePrefix ?? env.WOZTELL_NON_PRODUCTION_AUDIENCE_PREFIX)?.trim();
  const productionIds = list(options.productionAudienceIds);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    async createBroadcast(input: BroadcastInput): Promise<BroadcastReceipt> {
      if (!accessToken || !appId || !channelId) throw new WozTellOpenApiError("WozTell broadcast configuration unavailable", "credentials_unavailable");
      if (!input.promotionId.trim() || !input.audienceId.trim() || !input.name.trim() || !Number.isFinite(input.scheduleAt)) {
        throw new WozTellOpenApiError("WozTell broadcast payload is invalid", "invalid_payload");
      }
      if (runtimeEnvironment !== "production") {
        const explicit = allowlisted.includes(input.audienceId) || Boolean(prefix && input.audienceId.startsWith(prefix));
        if (!explicit || productionIds.includes(input.audienceId) || looksProduction(input.audienceId)) {
          throw new WozTellOpenApiError("WozTell audience isolation is not configured", "audience_isolation");
        }
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ query: CREATE_BROADCAST, variables: { input: {
            clientMutationId: input.promotionId,
            appId,
            channelId,
            audienceId: input.audienceId,
            name: input.name,
            messages: input.messages,
            scheduleAt: input.scheduleAt,
            ...(input.priority === undefined ? {} : { priority: input.priority }),
          } } }),
          signal: controller.signal,
        });
        if (!response.ok) throw new WozTellOpenApiError(`WozTell request failed (${response.status})`, `http_${response.status}`);
        const payload = record(await response.json());
        const errors = Array.isArray(payload.errors) ? payload.errors : [];
        if (errors.length) throw new WozTellOpenApiError("WozTell broadcast was rejected", "graphql_error");
        const root = record(record(payload.data).createBroadcast);
        const broadcast = record(root.broadcast);
        const broadcastId = typeof broadcast.id === "string" ? broadcast.id : undefined;
        if (!broadcastId || root.clientMutationId !== input.promotionId) throw new WozTellOpenApiError("WozTell response did not include a matching broadcast", "invalid_response");
        return {
          broadcastId,
          memberCount: numberOrNull(broadcast.memberCount),
          sentCount: numberOrNull(broadcast.sentCount),
          sent: typeof broadcast.sent === "boolean" ? broadcast.sent : undefined,
          sentStart: typeof broadcast.sentStart === "string" ? broadcast.sentStart : null,
          sentEnd: typeof broadcast.sentEnd === "string" ? broadcast.sentEnd : null,
        };
      } catch (error) {
        if (error instanceof WozTellOpenApiError && error.code !== "provider_error") throw error;
        if (controller.signal.aborted) throw new WozTellOpenApiError("WozTell request timed out", "provider_timeout");
        throw new WozTellOpenApiError("WozTell broadcast request failed", "provider_error");
      } finally { clearTimeout(timer); }
    },
  };
}

export const createBroadcast = createWozTellOpenApiClient;
