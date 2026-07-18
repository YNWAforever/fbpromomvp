import { describe, expect, it } from "vitest";
import { weeklyMetricItems } from "./delta-chart";

describe("weeklyMetricItems", () => {
  it("keeps missing metrics unavailable instead of inventing zeroes", () => {
    const items = weeklyMetricItems({});
    expect(items.find((item) => item.label === "Checks")?.value).toBe("Unavailable");
    expect(items.find((item) => item.label === "Approvals")?.value).toBe("Unavailable");
    expect(items.find((item) => item.label === "Redemptions")?.value).toBe("Unavailable");
  });

  it("renders known zero counts as zero", () => {
    const items = weeklyMetricItems({ checks: 0, approvals: 0, redeemedCount: 0 });
    expect(items.find((item) => item.label === "Checks")?.value).toBe("0");
    expect(items.find((item) => item.label === "Approvals")?.value).toBe("0");
    expect(items.find((item) => item.label === "Redemptions")?.value).toBe("0");
  });
});