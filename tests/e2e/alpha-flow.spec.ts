import { expect, test } from "@playwright/test";
import { signedJobRequest } from "./helpers";

test.describe("alpha rescue lifecycle with fake providers", () => {
  test.beforeEach(async ({ request }) => {
    const response = await request.post("/api/alpha-test/alpha/reset");
    expect(response.status(), await response.text()).toBe(200);
  });

  test("onboards, confirms a match, deduplicates signed callbacks, and sends a weekly report", async ({ page, request }) => {
    await page.goto("/alpha-test/alpha");
    const onboardingResponse = page.waitForResponse("**/api/alpha-test/alpha/onboard");
    await page.getByRole("button", { name: "Onboard venue" }).click();
    expect((await onboardingResponse).ok()).toBe(true);
    await expect(page.getByTestId("stage")).toHaveText("match_ready");
    await page.getByRole("button", { name: "Confirm match" }).click();
    await expect(page.getByTestId("stage")).toHaveText("active");

    const hourlyOne = signedJobRequest({ runId: "hourly-1", scheduledAt: "2026-07-14T03:00:00.000Z" }, "hourly:alpha-1");
    expect((await request.post("/api/alpha-test/alpha/hourly", hourlyOne)).ok()).toBe(true);
    expect((await request.post("/api/alpha-test/alpha/hourly", hourlyOne)).ok()).toBe(true);
    const hourlyTwo = signedJobRequest({ runId: "hourly-2", scheduledAt: "2026-07-14T04:00:00.000Z" }, "hourly:alpha-2");
    const candidate = await request.post("/api/alpha-test/alpha/hourly", hourlyTwo);
    expect(candidate.ok()).toBe(true);
    expect((await candidate.json()).approvalsSent).toBe(1);
    const replay = await request.post("/api/alpha-test/alpha/hourly", hourlyTwo);
    expect((await replay.json()).approvalsSent).toBe(1);

    await page.reload();
    await expect(page.getByTestId("approvals")).toHaveText("Approvals sent: 1");
    expect((await request.post("/api/alpha-test/alpha/approve", { data: "{}" })).status()).toBe(401);
    const approval = signedJobRequest({ eventId: "fake-approve-1", action: "approve" }, "approval:alpha-1");
    const accepted = await request.post("/api/alpha-test/alpha/approve", approval);
    expect((await accepted.json()).broadcastsAccepted).toBe(1);
    const approvalReplay = await request.post("/api/alpha-test/alpha/approve", approval);
    expect((await approvalReplay.json()).broadcastsAccepted).toBe(1);

    await page.reload();
    await expect(page.getByTestId("broadcasts")).toHaveText("Accepted broadcasts: 1");
    await page.getByRole("button", { name: "Record 8 redemptions" }).click();
    await expect(page.getByTestId("redemptions")).toHaveText("Redemptions: 8");
    const weekly = await request.post("/api/alpha-test/alpha/weekly", signedJobRequest({ runId: "weekly-1", periodStart: "2026-07-06T00:00:00.000Z", periodEnd: "2026-07-13T00:00:00.000Z" }, "weekly-report:alpha-1"));
    expect(weekly.ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId("report-summary")).toHaveText("8 redemptions");
  });
});
