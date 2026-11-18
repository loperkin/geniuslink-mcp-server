import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, LEGACY_GET_PATHS, readReport } from "./client.js";

const server = new McpServer({ name: "geniuslink-mcp-server", version: "0.2.0" });
const querySchema = z.record(z.string()).optional().describe(
  "Optional query parameters copied from the endpoint's official Swagger documentation; do not include credentials."
);

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
function errorResult(error: unknown) {
  return { isError: true, content: [{ type: "text" as const,
    text: error instanceof Error ? error.message : "Request failed" }] };
}
async function report(path: string, query: Record<string, string> = {}) {
  try { return result(await readReport(path, query)); }
  catch (error) { return errorResult(error); }
}

server.tool(
  "geniuslink_api_status",
  "Check local Geniuslink API configuration without making a request or exposing credentials.",
  {},
  async () => {
    const config = getConfig();
    return result({
      credentialsConfigured: Boolean(config.key && config.secret),
      allowedGetPaths: config.allowed,
      legacyV1Status: "documented in API explorer; live availability not verified",
      mode: "read-only",
      transport: "stdio"
    });
  }
);

server.tool(
  "geniuslink_list_links",
  "List existing Geniuslink short links using the legacy v1 endpoint. Query parameters must follow Swagger docs.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.links, query ?? {})
);

server.tool(
  "geniuslink_link_click_trend",
  "Retrieve the legacy v1 click trend for a specific short link; parameters are API-defined, not guessed.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.linkClickTrend, query ?? {})
);

server.tool(
  "geniuslink_link_clicks_by_country",
  "Retrieve legacy v1 geographic click data for a link.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.linkClicksByCountry, query ?? {})
);

server.tool(
  "geniuslink_link_top_attributes",
  "Retrieve legacy v1 top attributes for a short link over a range.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.linkTopAttributes, query ?? {})
);

server.tool(
  "geniuslink_account_click_trend",
  "Retrieve legacy v1 account-level click trend data.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.clickTrend, query ?? {})
);

server.tool(
  "geniuslink_account_clicks_by_country",
  "Retrieve legacy v1 account-level clicks grouped by country.",
  { query: querySchema },
  async ({ query }) => report(LEGACY_GET_PATHS.clicksByCountry, query ?? {})
);

server.tool(
  "geniuslink_read_report",
  "Read an explicitly allowlisted Geniuslink GET endpoint (including documented legacy v1).",
  { path: z.string().describe("Exact allowlisted API path"), query: querySchema },
  async ({ path, query }) => report(path, query ?? {})
);

await server.connect(new StdioServerTransport());
