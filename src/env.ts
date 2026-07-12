import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const adminEmails = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()).min(1));

const providerKeys = [
  "BESTTIME_PRIVATE_KEY",
  "BESTTIME_PUBLIC_KEY",
  "WOZTELL_ACCESS_TOKEN",
  "WOZTELL_APP_ID",
  "WOZTELL_CHANNEL_ID",
  "WOZTELL_ENVIRONMENT_ID",
  "WOZTELL_TREE_ID",
  "WOZTELL_NODE_ID",
  "WOZTELL_WEBHOOK_SECRET",
  "WOZTELL_PRIORITY_GROUP_ID",
  "OPENCODE_GO_API_KEY",
] as const;

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalhostUrl(value: string) {
  try {
    return localHosts.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    TEST_DATABASE_URL: optionalUrl,
    MIGRATION_DATABASE_URL: optionalUrl,
    AUTH_SECRET: z.string().min(32),
    AUTH_GOOGLE_ID: z.string().trim().min(1),
    AUTH_GOOGLE_SECRET: z.string().trim().min(1),
    ADMIN_EMAILS: adminEmails,
    N8N_HMAC_SECRET: z.string().min(32),
    OWNER_LINK_SECRET: z.string().min(32),
    BESTTIME_PRIVATE_KEY: optionalNonEmptyString,
    BESTTIME_PUBLIC_KEY: optionalNonEmptyString,
    BESTTIME_BASE_URL: z.url().default("https://besttime.app/api/v1"),
    WOZTELL_ACCESS_TOKEN: optionalNonEmptyString,
    WOZTELL_APP_ID: optionalNonEmptyString,
    WOZTELL_CHANNEL_ID: optionalNonEmptyString,
    WOZTELL_ENVIRONMENT_ID: optionalNonEmptyString,
    WOZTELL_TREE_ID: optionalNonEmptyString,
    WOZTELL_NODE_ID: optionalNonEmptyString,
    WOZTELL_WEBHOOK_SECRET: optionalNonEmptyString,
    WOZTELL_PRIORITY_GROUP_ID: optionalNonEmptyString,
    WOZTELL_OPEN_API_URL: z.url().default("https://open.api.woztell.com/v3"),
    WOZTELL_BOT_API_URL: z.url().default("https://bot.api.woztell.com"),
    OPENCODE_GO_API_KEY: optionalNonEmptyString,
    OPENCODE_GO_MODEL: z.string().trim().min(1).default("deepseek-v4-flash"),
    OPENCODE_GO_BASE_URL: z.url().default("https://opencode.ai/zen/go/v1"),
    APP_BASE_URL: optionalUrl,
  })
  .superRefine((value, context) => {
    const deploymentEnv = value.VERCEL_ENV ?? value.NODE_ENV;

    if (deploymentEnv !== "production") return;

    if (!value.APP_BASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL is required in production",
      });
    } else if (isLocalhostUrl(value.APP_BASE_URL)) {
      context.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL must not use localhost in production",
      });
    }

    for (const key of providerKeys) {
      if (!value[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    APP_BASE_URL: value.APP_BASE_URL ?? "http://localhost:3000",
  }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: NodeJS.ProcessEnv | Record<string, unknown>): ServerEnv {
  return serverEnvSchema.parse(input);
}

export const env = parseServerEnv(process.env);
