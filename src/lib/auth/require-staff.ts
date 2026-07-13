import { withDatabase } from "@/db/client";
import { staffUsers } from "@/db/schema";
import { env } from "@/env";
import { and, eq } from "drizzle-orm";

export type StaffIdentity = {
  id: string;
  email: string;
  name: string;
};

export class StaffAccessDeniedError extends Error {
  constructor() {
    super("Staff access denied");
    this.name = "StaffAccessDeniedError";
  }
}

type StaffLookup = (email: string) => Promise<StaffIdentity | null>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Applies the two independent staff gates: the configured allowlist and an
 * active staff_users row. Keeping this policy injectable makes it testable
 * without opening a database connection or contacting Google.
 */
export async function authorizeStaff(
  email: string | null | undefined,
  allowlist: readonly string[],
  findStaff: StaffLookup,
): Promise<StaffIdentity> {
  const normalizedEmail = email ? normalizeEmail(email) : "";
  const allowedEmails = new Set(allowlist.map(normalizeEmail).filter(Boolean));

  if (!normalizedEmail || !allowedEmails.has(normalizedEmail)) {
    throw new StaffAccessDeniedError();
  }

  const staff = await findStaff(normalizedEmail);
  if (!staff) {
    throw new StaffAccessDeniedError();
  }

  return staff;
}

/**
 * Resolve the current Auth.js session to the canonical, active staff row.
 * Callers should use this at the start of every protected server operation.
 */
export async function requireStaff(): Promise<StaffIdentity> {
  const { auth } = await import("../../../auth");
  const session = await auth();
  const email = session?.user?.email;

  return authorizeStaff(email, env.ADMIN_EMAILS, (normalizedEmail) =>
    withDatabase(async (db) => {
      const [staff] = await db
        .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name })
        .from(staffUsers)
        .where(and(eq(staffUsers.email, normalizedEmail), eq(staffUsers.active, true)))
        .limit(1);

      return staff ?? null;
    }),
  );
}
