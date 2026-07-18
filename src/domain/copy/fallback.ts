import type { CopyCandidate, CopyInput } from "./types";
import { validateCopyCandidate } from "./validate";

const OPT_OUT = "如不想收到優惠，請回覆「停止」";

function fallback(body: string, input: CopyInput): CopyCandidate {
  const validation = validateCopyCandidate(body, input.facts, { expiresAt: input.expiresAt });
  return { body, source: "fallback", ...validation };
}

/** Three stable Cantonese shapes used whenever model copy is unavailable or invalid. */
export function fallbackCandidates(input: CopyInput): CopyCandidate[] {
  const conditions = input.facts.conditions.filter(Boolean).join("；");
  const details = [conditions, `優惠有效至 ${input.expiresAt}`, OPT_OUT].filter(Boolean).join("。 ");
  return [
    fallback(`${input.venueName}，而家需要你嘅支持！${input.facts.headline}：${input.facts.benefit}。${details}。`, input),
    fallback(`鄰里限時優惠：${input.venueName} ${input.facts.benefit}。${details}。`, input),
    fallback(`靜時邀請：如果你而家喺附近，歡迎到 ${input.venueName}。${input.facts.benefit}。${details}。`, input),
  ];
}

export const createFallbackCandidates = fallbackCandidates;
