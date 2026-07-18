import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { signHmacRequest } from "../../src/lib/security/hmac";
import { sign } from "./sign-request.js";

describe("n8n request signer", () => {
  it("produces the same SHA-256 HMAC as the application for the exact request body", () => {
    const body = JSON.stringify({ runId: "hourly:execution-42", scheduledAt: "2026-07-20T01:00:00.000Z" });
    const timestamp = "1784509200000";
    const secret = "12345678901234567890123456789012";

    expect(sign(body, timestamp, secret)).toBe(signHmacRequest({ secret, timestamp, rawBody: body }));
  });

  it("signs the raw body without reformatting it", () => {
    const timestamp = "1784509200000";
    const secret = "12345678901234567890123456789012";
    const compact = '{"runId":"weekly:execution-7"}';
    const spaced = '{ "runId": "weekly:execution-7" }';

    expect(sign(compact, timestamp, secret)).not.toBe(sign(spaced, timestamp, secret));
  });
});

async function workflow(name: string) {
  const source = await readFile(resolve(process.cwd(), "n8n", "workflows", name), "utf8");
  return JSON.parse(source) as {
    nodes: Array<{ name: string; type: string; parameters?: Record<string, unknown>; credentials?: unknown }>;
    connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  };
}

function expectNamespacedResponse(
  exportedWorkflow: Awaited<ReturnType<typeof workflow>>,
  namespaceNodeName: string,
  classifierNodeName: string,
  alertNodeName: string,
) {
  const namespace = exportedWorkflow.nodes.find((node) => node.name === namespaceNodeName);
  const classifier = exportedWorkflow.nodes.find((node) => node.name === classifierNodeName);
  const alert = exportedWorkflow.nodes.find((node) => node.name === alertNodeName);
  const namespaceCode = String(namespace?.parameters?.jsCode);
  const alertParameters = JSON.stringify(alert?.parameters);

  expect(namespaceCode).toContain("responseStatusCode");
  expect(namespaceCode).toContain("$json.statusCode");
  expect(namespaceCode).not.toContain("$json.responseStatusCode");
  expect(namespaceCode).toContain("$json.statusCode");
  expect(namespaceCode).toContain("responseBody: $json.body");
  expect(namespaceCode).not.toMatch(/\bbody\s*:\s*\$json\.body/);
  expect(namespaceCode).not.toMatch(/\b(timestamp|signature|idempotencyKey|attempt)\s*:/);
  expect(String(classifier?.parameters?.jsCode)).toContain("$json.responseStatusCode");
  expect(alertParameters).toContain("$json.responseStatusCode");
  expect(alertParameters).not.toContain("$json.statusCode");
}

it("compiles every Code node in both exported workflows", async () => {
  for (const name of ["hourly-monitor.json", "weekly-report.json"]) {
    const exported = await workflow(name);
    for (const node of exported.nodes.filter((candidate) => candidate.type === "n8n-nodes-base.code")) {
      expect(() => new Function("$json", "$execution", "$env", String(node.parameters?.jsCode))).not.toThrow();
    }
  }
});
describe("n8n workflow exports", () => {
  it("exports the hourly monitor schedule with the signed idempotent retry flow", async () => {
    const hourly = await workflow("hourly-monitor.json");
    const schedule = hourly.nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger");
    const signer = hourly.nodes.find((node) => node.name === "Build signed monitor request");

    expect(schedule?.parameters).toMatchObject({ rule: { interval: [{ field: "cronExpression", expression: "0 * * * *" }] } });
    expect(schedule?.parameters?.timezone).toBe("Asia/Hong_Kong");
    expect(signer?.parameters?.jsCode).toContain("hourly:${$execution.id}");
    expect(signer?.parameters?.jsCode).toContain('createHmac("sha256"');
    expect(hourly.nodes.some((node) => node.name === "Wait 5 seconds before retry")).toBe(true);
    expect(JSON.stringify(hourly.nodes.find((node) => node.name === 'Retry attempts remain?')?.parameters?.conditions)).toContain('<= 3');
    const alertBody = String(hourly.nodes.find((node) => node.name === 'Alert monitor failure')?.parameters?.jsonBody);
    expect(alertBody).toMatch(/^=\{\{ \{/);
    expect(alertBody).toContain('$json.responseStatusCode');
    expect(alertBody).toContain('$json.attempt ?? 4');
    expect(hourly.nodes.some((node) => node.name === "Alert monitor failure")).toBe(true);
    expect(hourly.nodes.some((node) => node.name === "Preserve signed monitor request context" && node.type === "n8n-nodes-base.merge")).toBe(true);
    expect(hourly.connections["Build signed monitor request"].main[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "POST monitor job" }),
      expect.objectContaining({ node: "Preserve signed monitor request context" }),
    ]));
    expect(hourly.nodes.some((node) => node.name === "Namespace monitor response" && String(node.parameters?.jsCode).includes("responseBody"))).toBe(true);
    expect(hourly.connections["POST monitor job"].main[0]).toEqual([
      expect.objectContaining({ node: "Namespace monitor response", index: 0 }),
    ]);
    expect(hourly.connections["Namespace monitor response"].main[0]).toEqual([
      expect.objectContaining({ node: "Preserve signed monitor request context", index: 1 }),
    ]);
    expect(hourly.connections["Preserve signed monitor request context"].main[0]).toEqual([
      expect.objectContaining({ node: "Classify monitor response" }),
    ]);
    expect(hourly.connections["Increment monitor attempt"].main[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "POST monitor job" }),
      expect.objectContaining({ node: "Preserve signed monitor request context" }),
    ]));
    expectNamespacedResponse(
      hourly,
      "Namespace monitor response",
      "Classify monitor response",
      "Alert monitor failure",
    );
    expect(hourly.nodes.every((node) => node.credentials === undefined)).toBe(true);
  });

  it("exports the weekly report schedule with a signed Monday-to-Monday period", async () => {
    const weekly = await workflow("weekly-report.json");
    const schedule = weekly.nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger");
    const signer = weekly.nodes.find((node) => node.name === "Build signed weekly report request");

    expect(schedule?.parameters).toMatchObject({ rule: { interval: [{ field: "cronExpression", expression: "0 9 * * 1" }] } });
    expect(schedule?.parameters?.timezone).toBe("Asia/Hong_Kong");
    expect(signer?.parameters?.jsCode).toContain("periodStart");
    expect(signer?.parameters?.jsCode).toContain("periodEnd");
    expect(signer?.parameters?.jsCode).toContain("timeZone: \"Asia/Hong_Kong\"");
    expect(signer?.parameters?.jsCode).toContain("weekly:${$execution.id}");
    expect(weekly.nodes.some((node) => node.name === "Wait 5 seconds before retry")).toBe(true);
    expect(JSON.stringify(weekly.nodes.find((node) => node.name === 'Weekly retry attempts remain?')?.parameters?.conditions)).toContain('<= 3');
    const alertBody = String(weekly.nodes.find((node) => node.name === 'Alert weekly report failure')?.parameters?.jsonBody);
    expect(alertBody).toMatch(/^=\{\{ \{/);
    expect(alertBody).toContain('$json.responseStatusCode');
    expect(alertBody).toContain('$json.attempt ?? 4');
    expect(weekly.nodes.some((node) => node.name === "Alert weekly report failure")).toBe(true);
    expect(weekly.nodes.some((node) => node.name === "Preserve signed weekly report request context" && node.type === "n8n-nodes-base.merge")).toBe(true);
    expect(weekly.connections["Build signed weekly report request"].main[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "POST weekly report job" }),
      expect.objectContaining({ node: "Preserve signed weekly report request context" }),
    ]));
    expect(weekly.nodes.some((node) => node.name === "Namespace weekly report response" && String(node.parameters?.jsCode).includes("responseBody"))).toBe(true);
    expect(weekly.connections["POST weekly report job"].main[0]).toEqual([
      expect.objectContaining({ node: "Namespace weekly report response", index: 0 }),
    ]);
    expect(weekly.connections["Namespace weekly report response"].main[0]).toEqual([
      expect.objectContaining({ node: "Preserve signed weekly report request context", index: 1 }),
    ]);
    expect(weekly.connections["Preserve signed weekly report request context"].main[0]).toEqual([
      expect.objectContaining({ node: "Classify weekly report response" }),
    ]);
    expect(weekly.connections["Increment weekly report attempt"].main[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ node: "POST weekly report job" }),
      expect.objectContaining({ node: "Preserve signed weekly report request context" }),
    ]));
    expectNamespacedResponse(
      weekly,
      "Namespace weekly report response",
      "Classify weekly report response",
      "Alert weekly report failure",
    );
    expect(weekly.nodes.every((node) => node.credentials === undefined)).toBe(true);
  });
});