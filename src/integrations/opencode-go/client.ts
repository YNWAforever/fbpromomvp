import { env } from "@/env";
import { fallbackCandidates } from "@/domain/copy/fallback";
import { normalizeCopyBody, validateCopyCandidate } from "@/domain/copy/validate";
import type { CopyCandidate, CopyInput, CopyProvider } from "@/domain/copy/types";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 10_000;
const modelResponseSchema = z.object({
  candidates: z.array(z.object({ body: z.string().min(1) })).min(1),
});

export type OpenCodeGoClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export class OpenCodeGoProviderError extends Error {
  constructor(message: string, public readonly code = "provider_error") {
    super(message);
    this.name = "OpenCodeGoProviderError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redact(message: unknown, secret?: string): string {
  const source = message instanceof Error ? message.message : String(message);
  return secret ? source.split(secret).join("[REDACTED]") : source;
}

function parseCandidates(payload: unknown): Array<{ body: string }> {
  const root = record(payload);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = record(choices[0]);
  const message = record(first.message);
  const content = message.content;
  let parsed: unknown = content;
  if (typeof content === "string") {
    try { parsed = JSON.parse(content); } catch { throw new OpenCodeGoProviderError("OpenCode Go returned invalid JSON", "invalid_response"); }
  }
  const result = modelResponseSchema.safeParse(parsed);
  if (!result.success) throw new OpenCodeGoProviderError("OpenCode Go response did not match the copy schema", "invalid_response");
  return result.data.candidates;
}

export function createOpenCodeGoClient(options: OpenCodeGoClientOptions = {}): CopyProvider {
  const baseUrl = (options.baseUrl ?? env.OPENCODE_GO_BASE_URL).replace(/\/+$/, "");
  const apiKey = options.apiKey ?? env.OPENCODE_GO_API_KEY;
  const model = options.model ?? env.OPENCODE_GO_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function request(input: CopyInput): Promise<Array<{ body: string }>> {
    if (!apiKey) throw new OpenCodeGoProviderError("OpenCode Go credentials unavailable", "credentials_unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return JSON only in the shape { candidates: [{ body: string }] }. Use only the approved facts; do not invent prices, percentages, or conditions." },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new OpenCodeGoProviderError(`OpenCode Go request failed (${response.status})`, `http_${response.status}`);
      return parseCandidates(await response.json());
    } catch (error) {
      if (controller.signal.aborted) throw new OpenCodeGoProviderError("OpenCode Go request timed out", "provider_timeout");
      if (error instanceof OpenCodeGoProviderError) throw error;
      throw new OpenCodeGoProviderError(`OpenCode Go request failed: ${redact(error, apiKey)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async generate(input: CopyInput): Promise<CopyCandidate[]> {
      const fallback = fallbackCandidates(input);
      let modelCandidates: CopyCandidate[] = [];
      try {
        const raw = await request(input);
        modelCandidates = raw
          .map(({ body }) => {
            const normalizedBody = normalizeCopyBody(body, input.expiresAt);
            const validation = validateCopyCandidate(normalizedBody, input.facts, { expiresAt: input.expiresAt });
            return { body: normalizedBody, source: "model" as const, ...validation };
          })
          .filter((candidate) => candidate.valid);
      } catch {
        modelCandidates = [];
      }

      const output = [...modelCandidates];
      for (const candidate of fallback) {
        if (output.length >= 3) break;
        // Do not emit duplicate bodies when a model happened to copy a fallback.
        if (!output.some((existing) => existing.body === candidate.body)) output.push(candidate);
      }
      return output.slice(0, 3);
    },
  };
}

export const createOpenCodeClient = createOpenCodeGoClient;
