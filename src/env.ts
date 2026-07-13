import { isIP } from "node:net";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalHttpUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url({ protocol: /^https?$/ }).optional(),
);

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const optionalPostgresUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  postgresUrl.optional(),
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

function parseIpv6Groups(hostname: string): number[] | undefined {
  const compressionIndex = hostname.indexOf("::");
  const hasCompression = compressionIndex >= 0;

  if (
    hasCompression &&
    compressionIndex !== hostname.lastIndexOf("::")
  ) {
    return undefined;
  }

  const sections = hasCompression
    ? [hostname.slice(0, compressionIndex), hostname.slice(compressionIndex + 2)]
    : ["", hostname];

  const parseSection = (section: string): number[] | undefined => {
    if (!section) return [];

    return section.split(":").flatMap((part) => {
      if (part.includes(".")) {
        const octets = part.split(".").map(Number);
        if (
          octets.length !== 4 ||
          octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
        ) {
          return [];
        }
        return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
      }

      if (!/^[0-9a-f]{1,4}$/i.test(part)) return [];
      return [Number.parseInt(part, 16)];
    });
  };

  const left = parseSection(sections[0]);
  const right = parseSection(sections[1]);
  if (!left || !right) return undefined;

  const groups = [...left, ...right];
  if (!hasCompression) return groups.length === 8 ? groups : undefined;

  const zeroCount = 8 - groups.length;
  if (zeroCount < 1) return undefined;

  return [...left, ...Array.from({ length: zeroCount }, () => 0), ...right];
}

function isLoopbackIpv6(hostname: string): boolean {
  const groups = parseIpv6Groups(hostname);
  if (!groups || groups.length !== 8) return false;

  const isIpv6Loopback = groups.every((group, index) =>
    index === 7 ? group === 1 : group === 0,
  );
  if (isIpv6Loopback) return true;

  const isIpv4Mapped = groups
    .slice(0, 5)
    .every((group) => group === 0) && groups[5] === 0xffff;
  return isIpv4Mapped && (groups[6] >> 8) === 127;
}

function isLocalhostUrl(value: string) {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/\.+$/, "");

    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      (isIP(hostname) === 4 && hostname.split(".")[0] === "127") ||
      (isIP(hostname) === 6 && isLoopbackIpv6(hostname))
    );
  } catch {
    return false;
  }
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    DATABASE_URL: postgresUrl,
    TEST_DATABASE_URL: optionalPostgresUrl,
    MIGRATION_DATABASE_URL: optionalPostgresUrl,
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
    APP_BASE_URL: optionalHttpUrl,
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
