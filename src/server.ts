import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig, readReport } from "./client.js";

const server = new McpServer({ name: "geniuslink-mcp-server", version: "0.1.0" });

server.tool(
  "geniuslink_api_status",
  "Check local Geniuslink API configuration without making a request or exposing credentials.",
  {},
  async () => {
    const config = getConfig();
    return { content: [{ type: "text" as const, text: JSON.stringify({
      credentialsConfigured: Boolean(config.key && config.secret),
      allowedGetPaths: config.allowed,
      mode: "read-only",
      transport: "stdio"
    }) }] };
  }
);

server.tool(
  "geniuslink_read_report",
  "Read an explicitly allowlisted Geniuslink API v3 GET endpoint. Paths must be verified in the official API explorer.",
  {
    path: z.string().describe("Exact allowlisted API v3 GET path"),
    query: z.record(z.string()).optional().describe("Documented API query parameters")
  },
  async ({ path, query }) => {
    try {
      const data = await readReport(path, query ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const,
        text: error instanceof Error ? error.message : "Request failed" }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
