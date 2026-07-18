import candidatesFixture from "@/test/fixtures/opencode-go/candidates.json";
import type { CopyCandidate, CopyInput, CopyProvider } from "@/domain/copy/types";
import { OPT_OUT_TEXT, validateCopyCandidate } from "@/domain/copy/validate";

/** Deterministic test-only OpenCode Go adapter with only supplied offer facts. */
export class FakeOpenCodeGoProvider implements CopyProvider {
  async generate(input: CopyInput): Promise<CopyCandidate[]> {
    const conditions = input.facts.conditions.filter(Boolean).join("；");
    return candidatesFixture.prefixes.map((prefix) => {
      const body = `${prefix}${input.venueName}：${input.facts.headline}，${input.facts.benefit}。${conditions}。優惠有效至 ${input.expiresAt}。${OPT_OUT_TEXT}。`;
      return { body, source: "model" as const, ...validateCopyCandidate(body, input.facts, { expiresAt: input.expiresAt }) };
    });
  }
}

export function createFakeOpenCodeGoProvider() {
  return new FakeOpenCodeGoProvider();
}
