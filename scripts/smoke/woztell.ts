import { createWozTellBotClient } from "@/integrations/woztell/bot-client";
import type { MessagingProvider } from "@/integrations/woztell/bot-client";

type SmokeEnvironment = Partial<Pick<NodeJS.ProcessEnv, "VERCEL_ENV" | "WOZTELL_PRIORITY_GROUP_ID" | "SMOKE_WOZTELL_MEMBER_ID">>;

type WozTellSmokeInput = {
  environment?: SmokeEnvironment;
  provider?: MessagingProvider;
  write?: (line: string) => void;
  now?: () => Date;
};

function required(environment: SmokeEnvironment, key: keyof SmokeEnvironment): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

/** Credentialed, test-audience-only WozTell approval probe. */
export async function runWozTellSmoke(input: WozTellSmokeInput = {}): Promise<0> {
  const environment = input.environment ?? { VERCEL_ENV: process.env.VERCEL_ENV, WOZTELL_PRIORITY_GROUP_ID: process.env.WOZTELL_PRIORITY_GROUP_ID, SMOKE_WOZTELL_MEMBER_ID: process.env.SMOKE_WOZTELL_MEMBER_ID };
  if (environment.VERCEL_ENV?.toLowerCase() === "production") {
    throw new Error("WozTell smoke refuses production");
  }

  // Require this value here as well as in the provider: this is a human-visible
  // safety gate before any request can be made.
  required(environment, "WOZTELL_PRIORITY_GROUP_ID");
  const memberId = required(environment, "SMOKE_WOZTELL_MEMBER_ID");
  const now = input.now ?? (() => new Date());
  const provider = input.provider ?? createWozTellBotClient();
  const receipt = await provider.sendApproval({
    approvalId: `smoke-${now().toISOString()}`,
    memberId,
    expiresAt: new Date(now().getTime() + 10 * 60 * 1000).toISOString(),
    candidates: [
      { id: "smoke-candidate-1", body: "TEST ONLY: approval-node smoke candidate 1" },
      { id: "smoke-candidate-2", body: "TEST ONLY: approval-node smoke candidate 2" },
      { id: "smoke-candidate-3", body: "TEST ONLY: approval-node smoke candidate 3" },
    ],
  });
  (input.write ?? console.log)(`providerMessageId=${receipt.messageId}`);
  return 0;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/smoke/woztell.ts")) {
  void runWozTellSmoke().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "WozTell smoke failed");
    process.exitCode = 1;
  });
}
