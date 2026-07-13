import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: (config: unknown) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    config,
  }),
}));

vi.mock("next-auth/providers/google", () => ({
  default: (options: unknown) => ({ id: "google", options }),
}));

vi.mock("@/db/client", () => ({ withDatabase: vi.fn() }));

import { withDatabase } from "@/db/client";
import { authConfig } from "../../../auth";

const callbacks = authConfig.callbacks;

describe("Auth.js staff policy", () => {
  beforeEach(() => {
    vi.mocked(withDatabase).mockReset();
  });

  it("configures Google without requiring credentials in the test process", () => {
    expect(authConfig.providers).toHaveLength(1);
    expect(authConfig.providers[0]).toMatchObject({ id: "google" });
  });

  it("allows only normalized allowlisted emails at the proxy callback", async () => {
    const authorized = callbacks?.authorized;
    expect(authorized).toBeDefined();

    expect(
      authorized?.({
        auth: { user: { email: " OPS@EXAMPLE.COM " }, expires: "2030-01-01T00:00:00.000Z" },
        request: {} as never,
      }),
    ).toBe(true);

    expect(
      authorized?.({
        auth: { user: { email: "intruder@example.com" }, expires: "2030-01-01T00:00:00.000Z" },
        request: {} as never,
      }),
    ).toBe(false);
  });

  it("normalizes the email copied into the JWT and session", async () => {
    const token = await callbacks?.jwt?.({
      token: {},
      user: { email: " OPS@EXAMPLE.COM " },
      profile: undefined,
    } as never);
    expect(token?.email).toBe("ops@example.com");

    const session = await callbacks?.session?.({
      session: {
        user: { name: "Ops", email: "OPS@EXAMPLE.COM", image: null },
        expires: "2030-01-01T00:00:00.000Z",
      },
      token: { email: " OPS@EXAMPLE.COM " },
    } as never);
    expect(session?.user).toEqual({ name: "Ops", email: "ops@example.com", image: null });
  });

  it("fails closed when staff persistence is unavailable", async () => {
    vi.mocked(withDatabase).mockRejectedValue(new Error("database unavailable"));

    const result = await callbacks?.signIn?.({
      profile: { email: "ops@example.com", name: "Ops" },
      user: { email: "ops@example.com", name: "Ops" },
    } as never);

    expect(result).toBe(false);
  });
});
