import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * The Neon serverless driver only speaks Postgres over a WebSocket, so a plain
 * containerised Postgres (CI, local docker) is unreachable without a proxy in
 * front of it. When NEON_WS_PROXY is set, point the driver at that proxy and
 * drop TLS. Unset — the real Neon path — this file does nothing.
 */
const proxy = process.env.NEON_WS_PROXY?.trim();

if (proxy) {
  neonConfig.webSocketConstructor = ws;
  neonConfig.wsProxy = () => proxy;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
