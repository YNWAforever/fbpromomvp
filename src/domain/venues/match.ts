import type { VenueIdentity, VenueMatchScore } from "./types";

const LEGAL_SUFFIXES = [
  "limited", "ltd", "llc", "incorporated", "inc", "corporation", "corp", "company", "co",
  "\u6709\u9650\u516c\u53f8", "\u6709\u9650\u8cac\u4efb\u516c\u53f8", "\u80a1\u4efd\u6709\u9650\u516c\u53f8",
];

function stripLegalSuffixes(value: string): string {
  let result = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      const escaped = suffix.replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
      const pattern = new RegExp(`[\\s,，.。-]*${escaped}$`, "iu");
      const next = result.replace(pattern, "");
      if (next !== result) {
        result = next.trim();
        changed = true;
      }
    }
  }
  return result;
}

export function normalizeVenueText(value: string): string {
  const nfkc = value.normalize("NFKC").toLowerCase().trim();
  const withoutTrailingPunctuation = nfkc.replace(/[\p{P}\p{S}]+$/gu, "").trim();
  return stripLegalSuffixes(withoutTrailingPunctuation).replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function bigramDiceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const bigrams = (value: string) => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
  };
  const leftCounts = bigrams(left);
  const rightCounts = bigrams(right);
  let intersection = 0;
  for (const [pair, count] of leftCounts) intersection += Math.min(count, rightCounts.get(pair) ?? 0);
  return (2 * intersection) / (left.length - 1 + right.length - 1);
}

export function scoreVenueMatch(submitted: VenueIdentity, provider: VenueIdentity): VenueMatchScore {
  const normalizedSubmitted = { name: normalizeVenueText(submitted.name), address: normalizeVenueText(submitted.address) };
  const normalizedProvider = { name: normalizeVenueText(provider.name), address: normalizeVenueText(provider.address) };
  const nameScore = bigramDiceSimilarity(normalizedSubmitted.name, normalizedProvider.name);
  const addressScore = bigramDiceSimilarity(normalizedSubmitted.address, normalizedProvider.address);
  const totalScore = nameScore * 0.7 + addressScore * 0.3;
  return {
    decision: totalScore < 0.72 || nameScore < 0.55 || addressScore < 0.6 ? "blocked" : "manual_review",
    totalScore,
    nameScore,
    addressScore,
    normalizedSubmitted,
    normalizedProvider,
  };
}

export const scoreMatch = scoreVenueMatch;
