import { createBestTimeClient } from "@/integrations/besttime/client";
import type { BestTimeProvider } from "@/integrations/besttime/types";

type SmokeEnvironment = Partial<Pick<NodeJS.ProcessEnv, "SMOKE_VENUE_NAME" | "SMOKE_VENUE_ADDRESS">>;

type BestTimeSmokeInput = {
  environment?: SmokeEnvironment;
  provider?: Pick<BestTimeProvider, "checkCoverage">;
  write?: (line: string) => void;
};

function required(environment: SmokeEnvironment, key: keyof SmokeEnvironment): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

/** Credentialed, opt-in BestTime coverage probe. It deliberately prints no provider payload or credentials. */
export async function runBestTimeSmoke(input: BestTimeSmokeInput = {}): Promise<0 | 1> {
  const environment = input.environment ?? { SMOKE_VENUE_NAME: process.env.SMOKE_VENUE_NAME, SMOKE_VENUE_ADDRESS: process.env.SMOKE_VENUE_ADDRESS };
  const provider = input.provider ?? createBestTimeClient();
  const write = input.write ?? console.log;
  const coverage = await provider.checkCoverage({
    name: required(environment, "SMOKE_VENUE_NAME"),
    address: required(environment, "SMOKE_VENUE_ADDRESS"),
  });

  if (!coverage.available) {
    write("available=false providerVenueId=none matchedIdentity=none");
    return 1;
  }

  const identity = [coverage.matchedName, coverage.matchedAddress].filter(Boolean).join(" | ") || "none";
  write(`available=true providerVenueId=${coverage.providerVenueId} matchedIdentity=${identity}`);
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/smoke/besttime.ts")) {
  void runBestTimeSmoke().then((exitCode) => { process.exitCode = exitCode; });
}
