// Cloudflare Workers remote MCP endpoint. All MCP requests require a bearer token.
// Configure MCP_AUTH_TOKEN, GENIUSLINK_API_KEY, GENIUSLINK_API_SECRET as Worker secrets.
const API = "https://api.geni.us";
const PROTOCOL = "2025-03-26";
const PATHS = {
  geniuslink_list_links: "/v1/links/list",
  geniuslink_link_click_trend: "/v1/reports/link-click-trend-by-resolution",
  geniuslink_account_click_trend: "/v1/reports/click-trend-by-resolution",
  geniuslink_link_clicks_by_country: "/v1/reports/link-clicks-by-country",
  geniuslink_account_clicks_by_country: "/v1/reports/clicks-by-country",
  geniuslink_groups: "/v1/groups/list"
};
const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const range = { start: date, end: date, retailerid: { type: "string" }, dopreviousperiod: { type: "integer", enum: [0, 1] } };
const tools = [
  { name: "geniuslink_api_status", description: "Check whether this MCP endpoint has configured Geniuslink credentials (does not call Geniuslink).", inputSchema: { type: "object", properties: {} } },
  { name: "geniuslink_list_links", description: "List Geniuslink short links and click totals, optionally filtered and paginated.", inputSchema: { type: "object", properties: { take: { type: "integer", minimum: 1, maximum: 100 }, skip: { type: "integer", minimum: 0 }, keyword: { type: "string" }, groupid: { type: "integer", minimum: 0 }, includeArchived: { type: "boolean" } } } },
  { name: "geniuslink_link_click_trend", description: "Get daily, hourly, monthly or lifetime clicks for one Geniuslink short code.", inputSchema: { type: "object", properties: { shortcode: { type: "string", pattern: "^[A-Za-z0-9_-]+$" }, ...range, resolution: { type: "string", enum: ["hour", "day", "month", "lifetime"] } }, required: ["shortcode", "start", "end", "resolution"] } },
  { name: "geniuslink_account_click_trend", description: "Get account-wide click trends.", inputSchema: { type: "object", properties: { ...range, resolution: { type: "string", enum: ["hour", "day", "month", "lifetime"] } }, required: ["start", "end", "resolution"] } },
  { name: "geniuslink_link_clicks_by_country", description: "Get clicks by country for a short code.", inputSchema: { type: "object", properties: { shortcode: { type: "string", pattern: "^[A-Za-z0-9_-]+$" }, ...range, dataresolution: { type: "string" } }, required: ["shortcode", "start", "end"] } },
  { name: "geniuslink_account_clicks_by_country", description: "Get account clicks by country.", inputSchema: { type: "object", properties: { ...range, dataresolution: { type: "string" } }, required: ["start", "end"] } },
  { name: "geniuslink_groups", description: "List Geniuslink groups.", inputSchema: { type: "object", properties: {} } }
];
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function rpc(id, result) { return json({ jsonrpc: "2.0", id, result }); }
function rpcError(id, code, message, status = 200) { return json({ jsonrpc: "2.0", id, error: { code, message } }, status); }
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function validate(name, args) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error("Unknown tool");
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be an object");
  const schema = tool.inputSchema;
  for (const required of schema.required || []) if (args[required] === undefined) throw new Error("Missing parameter: " + required);
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key];
    if (!rule) throw new Error("Unsupported parameter: " + key);
    if (rule.type === "integer" ? (typeof value !== "number" || !Number.isInteger(value)) : typeof value !== rule.type) throw new Error("Invalid type for " + key);
    if (rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined && value > rule.maximum) throw new Error("Invalid range for " + key);
    if (rule.enum && !rule.enum.includes(value)) throw new Error("Invalid value for " + key);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) throw new Error("Invalid format for " + key);
    if (typeof value === "string" && value.length > 200) throw new Error("Parameter too long: " + key);
  }
  if (args.start && args.end && args.start > args.end) throw new Error("start must be on or before end");
}
async function callGeniuslink(name, args, env) {
  if (name === "geniuslink_api_status") return { credentialsConfigured: Boolean(env.GENIUSLINK_API_KEY && env.GENIUSLINK_API_SECRET), mode: "read-only", transport: "streamable-http" };
  if (!env.GENIUSLINK_API_KEY || !env.GENIUSLINK_API_SECRET) throw new Error("Geniuslink API credentials are not configured");
  const url = new URL(PATHS[name], API);
  for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method: "GET", redirect: "error",
    headers: { "X-Api-Key": env.GENIUSLINK_API_KEY, "X-Api-Secret": env.GENIUSLINK_API_SECRET, Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Geniuslink API returned HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > 1048576) throw new Error("Response too large");
  const body = await response.text();
  if (body.length > 1048576) throw new Error("Response too large");
  try { return JSON.parse(body); } catch { throw new Error("Geniuslink returned non-JSON content"); }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (!env.MCP_AUTH_TOKEN) return json({ error: "MCP authentication is not configured" }, 503);
    const header = request.headers.get("authorization") || "";
    if (!header.startsWith("Bearer ") || !safeEqual(header.slice(7), env.MCP_AUTH_TOKEN)) return json({ error: "Unauthorized" }, 401);
    if (request.method === "GET") return new Response(null, { status: 405, headers: { Allow: "POST, DELETE" } });
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (Number(request.headers.get("content-length") || 0) > 65536) return json({ error: "Request too large" }, 413);
    let message;
    try {
      const body = await request.text();
      if (body.length > 65536) return json({ error: "Request too large" }, 413);
      message = JSON.parse(body);
    } catch { return rpcError(null, -32700, "Parse error", 400); }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" || Array.isArray(message)) return rpcError(message?.id ?? null, -32600, "Invalid request", 400);
    if (message.id === undefined) return new Response(null, { status: 202 });
    const id = message.id;
    if (message.method === "initialize") return rpc(id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "geniuslink-mcp-server", version: "0.5.0" } });
    if (message.method === "ping") return rpc(id, {});
    if (message.method === "tools/list") return rpc(id, { tools });
    if (message.method === "tools/call") {
      const name = message.params?.name, args = message.params?.arguments ?? {};
      try {
        validate(name, args);
        const data = await callGeniuslink(name, args, env);
        return rpc(id, { content: [{ type: "text", text: JSON.stringify(data) }] });
      } catch (e) {
        return rpc(id, { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : "Request failed" }] });
      }
    }
    return rpcError(id, -32601, "Method not found");
  }
};
