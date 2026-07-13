import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { withDatabase } from "@/db/client";
import { staffUsers } from "@/db/schema";
import { env } from "@/env";

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

const adminEmails = new Set(env.ADMIN_EMAILS.map(normalizeStaffEmail));

function normalizeStaffName(name: unknown, email: string): string {
  if (typeof name !== "string") return email;
  const normalized = name.trim();
  return normalized.length > 0 ? normalized : email;
}

type PersistedStaff = {
  id: string;
  email: string;
  name: string;
  active: boolean;
};

/**
 * The allowlist is the bootstrap gate. The first allowlisted sign-in creates
 * the staff identity; an existing inactive row remains denied and cannot be
 * silently reactivated by a Google login.
 */
async function persistStaffUser(email: string, name: string): Promise<PersistedStaff | null> {
  return withDatabase(async (db) => {
    const [existing] = await db
      .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, active: staffUsers.active })
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1);

    if (existing && !existing.active) return null;

    if (existing) {
      if (existing.name === name) return existing;

      const [updated] = await db
        .update(staffUsers)
        .set({ name })
        .where(eq(staffUsers.id, existing.id))
        .returning({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, active: staffUsers.active });

      return updated ?? existing;
    }

    const [created] = await db
      .insert(staffUsers)
      .values({ email, name, active: true })
      .onConflictDoNothing({ target: staffUsers.email })
      .returning({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, active: staffUsers.active });

    if (created) return created;

    // A concurrent first login may have won the unique insert. Re-read the
    // row and apply the same active-state gate.
    const [concurrent] = await db
      .select({ id: staffUsers.id, email: staffUsers.email, name: staffUsers.name, active: staffUsers.active })
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1);

    return concurrent?.active ? concurrent : null;
  });
}

export const authConfig = {
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  secret: env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    async signIn({ profile, user }) {
      const providerEmail =
        typeof profile?.email === "string" ? profile.email : user.email;
      const email = providerEmail ? normalizeStaffEmail(providerEmail) : "";

      if (!email || !adminEmails.has(email)) return false;

      try {
        const staff = await persistStaffUser(
          email,
          normalizeStaffName(profile?.name ?? user.name, email),
        );
        return Boolean(staff?.active);
      } catch {
        // Do not expose database/provider details through the OAuth callback.
        return false;
      }
    },
    async jwt({ token, profile, user }) {
      const providerEmail =
        typeof profile?.email === "string" ? profile.email : user?.email;
      const email = providerEmail ?? token.email;

      if (typeof email === "string" && email.trim()) {
        token.email = normalizeStaffEmail(email);
      }

      return token;
    },
    async session({ session, token }) {
      const email = typeof token.email === "string" ? normalizeStaffEmail(token.email) : "";
      if (!email || !adminEmails.has(email)) {
        return { ...session, user: undefined };
      }

      return {
        ...session,
        user: {
          name: typeof session.user?.name === "string" ? session.user.name : email,
          email,
          image: typeof session.user?.image === "string" ? session.user.image : null,
        },
      };
    },
    authorized({ auth }) {
      const email = auth?.user?.email;
      return typeof email === "string" && adminEmails.has(normalizeStaffEmail(email));
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
