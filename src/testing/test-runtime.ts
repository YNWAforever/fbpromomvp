/** Test-only HTTP helpers must never be reachable outside NODE_ENV=test. */
export function isTestRuntime() {
  const nodeEnvKey = ["NODE", "ENV"].join("_");
  return process.env[nodeEnvKey] === "test";
}
