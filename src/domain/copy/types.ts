export type OfferFacts = {
  headline: string;
  benefit: string;
  conditions: string[];
};

export type CopyInput = {
  venueName: string;
  facts: OfferFacts;
  expiresAt: string;
  tone?: string;
  triggerContext?: Record<string, unknown>;
};

export type CopyCandidateSource = "model" | "fallback" | "owner_edit";

export type CopyCandidate = {
  body: string;
  source: CopyCandidateSource;
  valid: boolean;
  validationErrors: string[];
};

export type CopyValidationResult = {
  valid: boolean;
  validationErrors: string[];
};

export interface CopyProvider {
  generate(input: CopyInput): Promise<CopyCandidate[]>;
}
