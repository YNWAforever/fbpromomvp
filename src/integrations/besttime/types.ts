import type { CoverageResult, LiveReading } from "@/domain/venues/types";

export type BestTimeProviderInput = { name: string; address: string };

export interface BestTimeProvider {
  checkCoverage(input: BestTimeProviderInput): Promise<CoverageResult>;
  getLive(providerVenueId: string): Promise<LiveReading>;
}

export type BestTimeClientOptions = {
  baseUrl?: string;
  privateKey?: string;
  publicKey?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Maximum time allowed for a provider request before it is aborted. */
  timeoutMs?: number;
};
