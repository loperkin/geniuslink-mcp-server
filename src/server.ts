import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, LEGACY_GET_PATHS, readReport } from "./client.js";
import { listLinks, listLinksPages } from "./links.js";
import { linkClickTrend } from "./trends.js";

const server = new McpServer({ name: "geniuslink-mcp-server", version: "0.4.0" });
const querySchema = z.record(z.string()).optional().describe(
  "Optional query parameters copied from the endpoint's official Swagger documentation; do not include credentials."
);

const linkOptions = {
  take: z.number().int().min(1).max(100).optional(),
  skip: z.number().int().min(0).max(1000000).optional(),
  groupid: z.number().int().min(0).optional(),
  keyword: z.string().max(200).optional(),
  sortBy: z.string().max(200).optional(),
  includeArchived: z.boolean().optional(),
  linksCreatedStart: z.string().max(200).optional(),
  linksCreatedEnd: z.string().max(200).optional(),
  baseShortCodes: z.array(z.string()).max(1).optional(),
  linkTypes: z.array(z.string()).max(1).optional()
};

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
  "List Geniuslink links with documented v1 filters, pagination, and click totals.",
  linkOptions,
  async (options) => {
    try { return result(await listLinks(options)); }
    catch (error) { return errorResult(error); }
  }
);

server.tool(
  "geniuslink_list_all_links",
  "Fetch up to 20 bounded pages of links, with continuation offset. Start with a small number of pages.",
  { ...linkOptions, maxPages: z.number().int().min(1).max(20).optional() },
  async ({ maxPages, ...options }) => {
    try { return result(await listLinksPages(options, maxPages ?? 5)); }
    catch (error) { return errorResult(error); }
  }
);

server.tool(
  "geniuslink_link_click_trend",
  "Retrieve a link's click trend using the documented legacy v1 parameters and return the original metrics including bot-filtered clicks and available conversion fields.",
  {
    shortcode: z.string().min(1).max(120).describe("Short code, not the full geni.us URL"),
    start: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe("YYYY-MM-DD"),
    end: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe("YYYY-MM-DD"),
    retailerid: z.string().max(120).optional().describe("Optional retailer ID, such as AMAZON"),
    resolution: z.enum(["hour", "day", "month", "lifetime"]),
    dopreviousperiod: z.number().int().min(0).max(1).optional()
  },
  async (options) => {
    try { return result(await linkClickTrend(options)); }
    catch (error) { return errorResult(error); }
  }
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
