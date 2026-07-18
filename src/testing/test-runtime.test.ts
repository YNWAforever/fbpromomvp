import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestRuntime } from "./test-runtime";

afterEach(() => vi.unstubAllEnvs());

describe("isTestRuntime", () => {
  it("allows only NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(isTestRuntime()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALPHA_E2E_TEST", "1");
    expect(isTestRuntime()).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    expect(isTestRuntime()).toBe(false);
  });
});
