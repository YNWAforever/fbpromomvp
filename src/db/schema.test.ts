import { expect, it } from "vitest";
import * as schema from "./schema";

it("exports all bounded MVP records", () => {
  expect(Object.keys(schema).sort()).toEqual([
    "approvals",
    "auditEvents",
    "copyCandidates",
    "forecastSnapshots",
    "jobRuns",
    "liveReadings",
    "offerTemplates",
    "promotions",
    "redemptionReports",
    "staffUsers",
    "triggers",
    "venueIntegrations",
    "venues",
    "weeklyReports",
  ]);
});
