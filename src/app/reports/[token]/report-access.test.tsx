import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ withDatabase: vi.fn() }));
vi.mock("@/db/client", () => database);

import { env } from "@/env";
import { signScopedToken } from "@/lib/security/signed-token";
import WeeklyReportPage from "./page";
import { GET } from "./image/route";

describe("signed weekly report access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid and expired HTML report links before database access", async () => {
    const invalid = await WeeklyReportPage({ params: Promise.resolve({ token: "invalid" }) });
    const expiredToken = signScopedToken({
      scope: "weekly-report",
      subject: "report-1",
      exp: 1,
    }, env.OWNER_LINK_SECRET);
    const expired = await WeeklyReportPage({ params: Promise.resolve({ token: expiredToken }) });

    expect(renderToStaticMarkup(invalid)).toContain("Report unavailable");
    expect(renderToStaticMarkup(expired)).toContain("Report unavailable");
    expect(database.withDatabase).not.toHaveBeenCalled();
  });

  it("returns 404 for invalid and expired image links before database access", async () => {
    const invalid = await GET(new Request("http://localhost"), { params: Promise.resolve({ token: "invalid" }) });
    const expiredToken = signScopedToken({
      scope: "weekly-report",
      subject: "report-1",
      exp: 1,
    }, env.OWNER_LINK_SECRET);
    const expired = await GET(new Request("http://localhost"), { params: Promise.resolve({ token: expiredToken }) });

    expect(invalid.status).toBe(404);
    expect(expired.status).toBe(404);
    expect(database.withDatabase).not.toHaveBeenCalled();
  });
});